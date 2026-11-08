// Handlers added with Pace.on/once, following how the DOM dispatches events
// (https://dom.spec.whatwg.org/#concept-event-listener-inner-invoke): an exception
// in one handler is reported and the rest still run, and the handlers are the ones
// registered when the event fired.
import fs from 'node:fs';
import { test, expect, idle, HOLD } from './fixtures.mjs';

test('a throwing handler is reported, and pace and the other handlers keep going', async ({ page, open }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open({ head: HOLD });
  await page.evaluate(() => {
    window.calls = [];
    Pace.on('done', () => { throw new Error('handler failed'); });
    Pace.on('done', () => calls.push('next handler'));
    hold.progress = 100;
  });
  await idle(page);
  expect(await page.evaluate(() => [calls, events])).toEqual([['next handler'], ['start', 'done', 'hide']]);
  expect(errors).toEqual(['handler failed']);
});

test('a throwing once handler runs only once', async ({ page, open }) => {
  page.on('pageerror', () => {});
  await open({ head: HOLD });
  await page.evaluate(() => {
    window.calls = 0;
    Pace.once('progress', () => { calls++; throw new Error('handler failed'); });
    hold.progress = 100;
  });
  await idle(page);
  expect(await page.evaluate(() => calls)).toBe(1);
});

test('a handler that removes itself does not skip the next handler', async ({ page, open }) => {
  await open({ head: HOLD });
  await page.evaluate(() => {
    window.calls = [];
    const first = () => { calls.push('first'); Pace.off('done', first); };
    Pace.on('done', first);
    Pace.on('done', () => calls.push('second'));
    hold.progress = 100;
  });
  await idle(page);
  expect(await page.evaluate(() => calls)).toEqual(['first', 'second']);
});

test('a handler removed while the event fires is not called', async ({ page, open }) => {
  await open({ head: HOLD });
  await page.evaluate(() => {
    window.calls = [];
    const second = () => calls.push('second');
    Pace.on('done', () => { calls.push('first'); Pace.off('done', second); });
    Pace.on('done', second);
    hold.progress = 100;
  });
  await idle(page);
  expect(await page.evaluate(() => calls)).toEqual(['first']);
});

test('a handler added while the event fires waits for the next one', async ({ page, open }) => {
  await open({ head: HOLD });
  const calls = await page.evaluate(() => {
    const calls = [];
    let added = false;
    Pace.on('custom', () => {
      if (!added) {
        added = true;
        Pace.on('custom', () => calls.push('added'));
      }
    });
    Pace.trigger('custom');
    calls.push('next event');
    Pace.trigger('custom');
    return calls;
  });
  expect(calls).toEqual(['next event', 'added']);
});

test('a handler that removes an earlier one does not skip the next handler', async ({ page, open }) => {
  await open({ head: HOLD });
  const calls = await page.evaluate(() => {
    const calls = [];
    const first = () => calls.push('first');
    Pace.on('custom', first);
    Pace.on('custom', () => { calls.push('second'); Pace.off('custom', first); });
    Pace.on('custom', () => calls.push('third'));
    Pace.trigger('custom');
    return calls;
  });
  expect(calls).toEqual(['first', 'second', 'third']);
});

test('removing all handlers of an event while it fires stops the rest', async ({ page, open }) => {
  await open({ head: HOLD });
  const calls = await page.evaluate(() => {
    const calls = [];
    Pace.on('custom', () => { calls.push('first'); Pace.off('custom'); });
    Pace.on('custom', () => calls.push('second'));
    Pace.trigger('custom');
    Pace.trigger('custom');
    return calls;
  });
  expect(calls).toEqual(['first']);
});

test('a once handler that fires its own event again runs once', async ({ page, open }) => {
  await open({ head: HOLD });
  const calls = await page.evaluate(() => {
    let calls = 0;
    Pace.once('custom', () => { calls++; Pace.trigger('custom'); });
    Pace.trigger('custom');
    return calls;
  });
  expect(calls).toBe(1);
});

test('errors keep their details for window.onerror when pace.js comes from another origin', async ({ page, paceFile }) => {
  const pace = fs.readFileSync(new URL(paceFile, new URL('..', import.meta.url)), 'utf8');
  await page.route('http://cdn.test/pace.js', (route) => route.fulfill({ contentType: 'text/javascript', body: pace }));
  await page.route('http://pace.test/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html>
<script>
  window.paceOptions = { startOnPageLoad: false };
  window.reported = [];
  window.onerror = (message, source, line, column, error) => { reported.push(error && error.message); };
</script>
<script src="http://cdn.test/pace.js"></script>`,
    }),
  );
  page.on('pageerror', () => {});
  await page.goto('http://pace.test/');
  await page.evaluate(() => {
    Pace.on('custom', () => { throw new Error('handler failed'); });
    Pace.trigger('custom');
  });
  await expect.poll(() => page.evaluate(() => reported)).toEqual(['handler failed']);
});
