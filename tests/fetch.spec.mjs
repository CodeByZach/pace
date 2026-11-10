// How pace hooks into fetch(): it replaces window.fetch with a function that calls the
// original with the same `this` and arguments and returns a promise that settles the same
// way, and tracks a request until that promise settles (the response's headers, an error or
// an abort), not until its body ends.
import { test, expect, idle, request, clearEvents, RESTARTED, NO_EVENT_LAG } from './fixtures.mjs';

const SAVE_FETCH = '<script>window.nativeFetch = fetch;</script>';

test('pace hooks into fetch only once it starts', async ({ page, open }) => {
  await open({ head: SAVE_FETCH + '<script>window.paceOptions = { startOnPageLoad: false, eventLag: false };</script>' });
  expect(await page.evaluate(() => fetch === nativeFetch)).toBe(true);
  await page.evaluate(() => Pace.start());
  expect(await page.evaluate(() => [fetch === nativeFetch, fetch.length === nativeFetch.length])).toEqual([false, true]);
});

for (const [name, options] of [
  ['trackFetch: false', '{ eventLag: false, ajax: { trackFetch: false } }'],
  ['ajax: false', '{ eventLag: false, ajax: false }'],
]) {
  test(`with ${name}, fetch stays native`, async ({ page, open }) => {
    await open({ head: `${SAVE_FETCH}<script>window.paceOptions = ${options};</script>` });
    await idle(page);
    expect(await page.evaluate(() => fetch === nativeFetch)).toBe(true);
  });
}

test('a fetch during page load holds the bar until it settles', async ({ page, open }) => {
  await open({
    head: NO_EVENT_LAG,
    body: `<script>
      window.settledAt = null;
      fetch('/delay?ms=1500').then(function () { settledAt = performance.now(); });
    </script>`,
  });
  await idle(page);
  const [settledAt, doneAt] = await page.evaluate(() => [window.settledAt, eventTimes.done]);
  expect(settledAt).not.toBeNull();
  expect(doneAt).toBeGreaterThanOrEqual(settledAt - 50);
});

test('the method comes from init, then from a Request', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG });
  await idle(page);
  for (const [call, tracked] of [
    ["fetch(new Request('/delay?ms=900'))", true],
    ["fetch(new Request('/delay?ms=900', { method: 'POST' }))", false],
    ["fetch(new Request('/delay?ms=900'), { method: 'POST' })", false],
    ["fetch(new Request('/delay?ms=900', { method: 'POST' }), { method: 'get' })", true],
    ["fetch(new URL('/delay?ms=900', location.href))", true],
  ]) {
    await clearEvents(page);
    await page.evaluate(`${call}.then((response) => response.text())`);
    await idle(page);
    expect(await page.evaluate(() => events), call).toEqual(tracked ? RESTARTED : []);
  }
});

test('ajax.ignoreURLs patterns see the URL of a Request', async ({ page, open }) => {
  await open({ head: "<script>window.paceOptions = { eventLag: false, ajax: { ignoreURLs: ['ignored'] } };</script>" });
  await idle(page);
  await clearEvents(page);
  await page.evaluate(() => fetch(new Request('/delay?ms=900&ignored')).then((response) => response.text()));
  expect(await page.evaluate(() => events)).toEqual([]);
});

test('a Request made in another frame is read like one made in this frame', async ({ page, open }) => {
  await open({ head: "<script>window.paceOptions = { eventLag: false, ajax: { ignoreURLs: ['ignored'] } };</script>", body: '<iframe></iframe>' });
  await idle(page);
  await clearEvents(page);
  await page.evaluate(() => {
    const FrameRequest = document.querySelector('iframe').contentWindow.Request;
    return Promise.all([
      fetch(new FrameRequest(location.origin + '/delay?ms=900', { method: 'POST' })), // POST isn't tracked
      fetch(new FrameRequest(location.origin + '/delay?ms=900&ignored')),
    ]);
  });
  expect(await page.evaluate(() => events)).toEqual([]);
});

test('turning trackFetch off in a later Pace.start() stops tracking fetch', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG });
  await idle(page);
  await page.evaluate(() => {
    Pace.stop();
    Pace.start({ ajax: { trackFetch: false } });
  });
  await idle(page);
  await clearEvents(page);
  await request(page, { ms: 900, api: 'fetch' });
  expect(await page.evaluate(() => events)).toEqual([]);
});

test('fetch accepts the same `this` as the native fetch', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG });
  await idle(page);
  const result = await page.evaluate(async () => {
    const outcome = (call) => call().then(() => 'resolved', (error) => error.name);
    const f = fetch;
    return [
      await outcome(() => f('/delay?ms=10')),
      await outcome(() => fetch.call(window, '/delay?ms=10')),
      await outcome(() => fetch.call({}, '/delay?ms=10')),
      await outcome(() => ({ fetch }).fetch('/delay?ms=10')),
    ];
  });
  expect(result).toEqual(['resolved', 'resolved', 'TypeError', 'TypeError']);
});

test('fetch rejects bad input the way the native fetch does, instead of throwing', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG });
  await idle(page);
  const result = await page.evaluate(async () => {
    const outcome = (call) => {
      let promise;
      try {
        promise = call();
      } catch (error) {
        return 'threw';
      }
      return promise.then(() => 'resolved', (error) => error.message ?? error.name);
    };
    const bad = { toString() { throw new Error('bad input'); } };
    return [
      await outcome(() => fetch(bad)),
      await outcome(() => fetch(Symbol('url'))),
      await outcome(() => fetch()),
    ];
  });
  expect(result[0]).toBe('bad input');
  expect(result.slice(1).every((value) => value !== 'threw' && value !== 'resolved')).toBe(true);
});

test('a script that wrapped fetch before pace gets the same arguments as from the page', async ({ page, open }) => {
  await open({
    head: `<script>
      window.calls = [];
      var inner = fetch;
      window.fetch = function () {
        calls.push(arguments.length);
        return inner.apply(this, arguments);
      };
    </script>${NO_EVENT_LAG}`,
  });
  await idle(page);
  await clearEvents(page);
  await page.evaluate(() => Promise.all([fetch('/delay?ms=900'), fetch('/delay?ms=10', {})]));
  await idle(page);
  expect(await page.evaluate(() => [calls, events])).toEqual([[1, 2], RESTARTED]);
});

test('a script that wraps fetch after pace still sees requests, and pace still tracks them', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG });
  await idle(page);
  await clearEvents(page);
  await page.evaluate(() => {
    window.seen = [];
    const inner = fetch;
    window.fetch = function (input, init) {
      seen.push(String(input));
      return inner.apply(this, arguments);
    };
  });
  await request(page, { ms: 900, api: 'fetch' });
  await idle(page);
  expect(await page.evaluate(() => [seen, events])).toEqual([['/delay?ms=900'], RESTARTED]);
});

test('a fetch is tracked through a navigation', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG });
  await idle(page);
  await clearEvents(page);
  const settledAt = await page.evaluate(() => {
    const settled = fetch('/delay?ms=2000').then(() => performance.now());
    setTimeout(() => history.pushState({}, '', '?next'), 700);
    return settled;
  });
  await idle(page);
  expect(await page.evaluate(() => eventTimes.done)).toBeGreaterThanOrEqual(settledAt - 50);
});

test.describe('with a real server', () => {
  test('a fetch ends when its response arrives, not when its body ends', async ({ page, server }) => {
    await page.goto(server);
    await idle(page);
    await clearEvents(page);
    const [respondedAt, bodyEndedAt] = await page.evaluate(async () => {
      const response = await fetch('/stream?head=900&ms=3000');
      const respondedAt = performance.now();
      await response.text();
      return [respondedAt, performance.now()];
    });
    await idle(page);
    const [events, doneAt] = await page.evaluate(() => [window.events, eventTimes.done]);
    expect(events).toEqual(RESTARTED);
    expect(doneAt).toBeGreaterThanOrEqual(respondedAt - 50);
    expect(doneAt).toBeLessThan(bodyEndedAt - 1000);
  });

  test('a tracked Request keeps its body for the server', async ({ page, server }) => {
    await page.goto(`${server}/?options=${encodeURIComponent("{ eventLag: false, ajax: { trackMethods: ['POST'] } }")}`);
    await idle(page);
    await clearEvents(page);
    const result = await page.evaluate(async () => {
      const request = new Request('/echo?ms=900', { method: 'POST', body: 'hello' });
      const response = await fetch(request);
      return [await response.text(), request.bodyUsed];
    });
    expect(result).toEqual(['POST hello', true]);
    await idle(page);
    expect(await page.evaluate(() => events)).toEqual(RESTARTED);
  });

  for (const [name, call] of [
    ['a network error', "fetch('/drop?ms=900')"],
    ['an abort', "(() => { const controller = new AbortController(); setTimeout(() => controller.abort(), 900); return fetch('/hang', { signal: controller.signal }); })()"],
  ]) {
    test(`a fetch that fails with ${name} ends, and rejects with the same error`, async ({ page, server }) => {
      await page.goto(server);
      await idle(page);
      await clearEvents(page);
      const [reason, failedAt] = await page.evaluate(`${call}.then(() => ['resolved'], (error) => [error.name, performance.now()])`);
      expect(reason).toBe(name === 'an abort' ? 'AbortError' : 'TypeError');
      await idle(page);
      const [events, doneAt] = await page.evaluate(() => [window.events, eventTimes.done]);
      expect(events).toEqual(RESTARTED);
      expect(doneAt - failedAt).toBeLessThan(1000); // not held until maxWait
    });
  }

  test('a failed fetch the page ignores is still reported as an unhandled rejection', async ({ page, server }) => {
    await page.goto(server);
    await idle(page);
    const counts = await page.evaluate(async () => {
      let unhandled = 0;
      addEventListener('unhandledrejection', (event) => {
        unhandled++;
        event.preventDefault();
      });
      fetch('/drop');
      fetch('/drop').catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
      return unhandled;
    });
    expect(counts).toBe(1);
  });
});
