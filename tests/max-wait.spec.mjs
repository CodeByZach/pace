// ajax.maxWait: pace waits for each tracked request at most this many ms from when it was sent,
// so one request that never ends can't hold the bar forever. The request itself keeps going.
import { test, expect, idle, request, clearEvents, RESTARTED } from './fixtures.mjs';

const options = (maxWait) => `<script>window.paceOptions = { eventLag: false, ajax: { maxWait: ${maxWait} } };</script>`;

// A value a timer can't wait for (setTimeout would treat it as 0) means no limit, like false.
for (const value of ['Infinity', 'null', 'undefined', '2 ** 31']) {
  test(`with maxWait: ${value}, pace waits for a request until it ends`, async ({ page, open }) => {
    await open({ head: options(value) });
    await idle(page);
    await clearEvents(page);
    const loadedAt = await request(page, { ms: 900 });
    await idle(page);
    expect(await page.evaluate(() => events)).toEqual(RESTARTED);
    expect(await page.evaluate(() => eventTimes.done)).toBeGreaterThanOrEqual(loadedAt - 50);
  });
}

for (const [api, send] of [
  ['XMLHttpRequest', "var xhr = new XMLHttpRequest(); xhr.open('GET', '/delay?ms=4000'); xhr.onload = function () { loaded = xhr.responseText; }; xhr.send();"],
  ['fetch', "fetch('/delay?ms=4000').then(function (response) { return response.text(); }).then(function (text) { loaded = text; });"],
]) {
  test(`a slow ${api} during page load holds the bar only until maxWait, and still loads`, async ({ page, open }) => {
    await open({ head: options(1500), body: `<script>window.loaded = null; ${send}</script>` });
    await idle(page);
    const doneAt = await page.evaluate(() => eventTimes.done);
    expect(doneAt).toBeGreaterThanOrEqual(1400);
    expect(doneAt).toBeLessThan(2500);
    await expect.poll(() => page.evaluate(() => window.loaded), { timeout: 5000 }).toBe('ok');
  });
}

test('maxWait is counted from when the request was sent, not from when the bar restarted', async ({ page, open }) => {
  await open({ head: options(1500) });
  await idle(page);
  await clearEvents(page);
  const sentAt = await page.evaluate(() => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/delay?ms=4000');
    xhr.send();
    return performance.now();
  });
  // The bar is still hidden from the page load until the restart, so wait for the restart's end.
  await expect.poll(() => page.evaluate(() => events.includes('hide')), { timeout: 5000 }).toBe(true);
  const [events, doneAt] = await page.evaluate(() => [window.events, eventTimes.done]);
  expect(events).toEqual(RESTARTED);
  expect(doneAt - sentAt).toBeGreaterThanOrEqual(1400);
  expect(doneAt - sentAt).toBeLessThan(1900);
});

test('a request past its maxWait does not hold a later navigation', async ({ page, open }) => {
  await open({ head: options(1000) });
  await idle(page);
  await clearEvents(page);
  const loaded = request(page, { ms: 5000 });
  await expect.poll(() => page.evaluate(() => events.includes('done'))).toBe(true); // its limit passed
  await clearEvents(page);
  await page.evaluate(() => history.pushState({}, '', '?next'));
  await idle(page);
  const [events, doneAt] = await page.evaluate(() => [window.events, eventTimes.done]);
  expect(events).toEqual(RESTARTED);
  expect(doneAt).toBeLessThan((await loaded) - 1000);
});

test('maxWait also limits a request tracked with Pace.track()', async ({ page, open }) => {
  await open({ head: options(1500) });
  await idle(page);
  await clearEvents(page);
  const loadedAt = await request(page, { ms: 3500, method: 'POST', wrap: 'track' });
  expect(await page.evaluate(() => events)).toEqual(RESTARTED);
  expect(await page.evaluate(() => eventTimes.done)).toBeLessThan(loadedAt - 1000);
});

test('a request sent again from its own load handler gets its own maxWait', async ({ page, open }) => {
  await open({ head: options(1200) });
  await idle(page);
  await clearEvents(page);
  const sentAt = await page.evaluate(() => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      xhr.onload = null;
      xhr.open('GET', '/delay?ms=3000');
      xhr.send();
    };
    xhr.open('GET', '/delay?ms=900');
    xhr.send();
    return performance.now();
  });
  // The bar is still hidden from the page load until the restart, so wait for the restart's end.
  await expect.poll(() => page.evaluate(() => events.includes('hide')), { timeout: 5000 }).toBe(true);
  // The second request is sent at about 900 ms, so its limit ends at about 2100 ms; the first
  // request's limit (1200 ms) must not end it.
  expect((await page.evaluate(() => eventTimes.done)) - sentAt).toBeGreaterThan(1900);
});

test.describe('with a real server', () => {
  // A request that never ends (/hang), with the page's clock run forward.
  const hangAfterLoad = async (page, server, options) => {
    await page.clock.install();
    await page.goto(`${server}/?options=${encodeURIComponent(options)}`);
    await page.clock.runFor(3000);
    expect(await page.evaluate(() => events)).toEqual(['start', 'done', 'hide']);
    await page.evaluate(() => {
      events = [];
      fetch('/hang');
    });
  };

  test('by default, pace stops waiting for a request 15 s after it was sent', async ({ page, server }) => {
    await hangAfterLoad(page, server, '{ eventLag: false }');
    await page.clock.runFor(14500);
    expect(await page.evaluate(() => events)).toEqual(['restart', 'stop', 'start']);
    await page.clock.runFor(1000);
    expect(await page.evaluate(() => events)).toEqual(RESTARTED);
  });

  test('with maxWait: false, pace keeps waiting for a request that never ends', async ({ page, server }) => {
    await hangAfterLoad(page, server, '{ eventLag: false, ajax: { maxWait: false } }');
    await page.clock.runFor(60000);
    expect(await page.evaluate(() => events)).toEqual(['restart', 'stop', 'start']);
  });

  test('a WebSocket whose handshake is never answered holds the bar only until maxWait', async ({ page, server }) => {
    await page.goto(`${server}/?socket=never&options=${encodeURIComponent('{ eventLag: false, ajax: { maxWait: 1500 } }')}`);
    await idle(page);
    const doneAt = await page.evaluate(() => eventTimes.done);
    expect(doneAt).toBeGreaterThanOrEqual(1400);
    expect(doneAt).toBeLessThan(2500);
  });
});
