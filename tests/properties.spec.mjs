// Pace's small public properties, and what a second copy of pace on the page does.
import fs from 'node:fs';
import { test, expect, idle, request, clearEvents, RESTARTED, NO_EVENT_LAG } from './fixtures.mjs';

const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// The console warnings the page logs, from now on.
const warnings = (page) => {
  const messages = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') messages.push(message.text());
  });
  return messages;
};

test('Pace.version is the package version', async ({ page, open }) => {
  await open();
  expect(await page.evaluate(() => Pace.version)).toBe(version);
});

test('Pace.running is read-only', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG });
  await idle(page);
  expect(await page.evaluate(() => {
    Pace.running = true;
    return Pace.running;
  })).toBe(false);
});

test('Pace has no internal properties', async ({ page, open }) => {
  await open();
  expect(await page.evaluate(() => ['bar', 'sources', 'bindings', 'options'].filter((name) => name in Pace))).toEqual([]);
});

test('an element with id="Pace" is replaced, not used as pace', async ({ page, open }) => {
  const logged = warnings(page);
  await open({ head: '<div id="Pace"></div>' + NO_EVENT_LAG });
  await idle(page);
  expect(await page.evaluate(() => [window.Pace instanceof Element, typeof Pace.getOptions])).toEqual([false, 'function']);
  expect(logged).toEqual([]);
});

test('a cross-origin frame named Pace is replaced, not used as pace', async ({ page, open }) => {
  // Reading a property of a cross-origin frame throws.
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open({ head: '<iframe name="Pace" sandbox srcdoc="frame"></iframe>' + NO_EVENT_LAG });
  await idle(page);
  expect(await page.evaluate(() => typeof Pace.getOptions)).toBe('function');
  expect(errors).toEqual([]);
});

test.describe('a second copy of pace on the page', () => {
  test('only warns: the page keeps one bar, and the first copy tracks requests', async ({ page, open }) => {
    const logged = warnings(page);
    await open({ head: NO_EVENT_LAG + '<script src="/pace.js"></script>' });
    await idle(page);
    expect(logged).toEqual([`Pace: pace.js ${version} was loaded after another copy (${version}); only the first copy runs.`]);
    await clearEvents(page);
    await request(page, { ms: 900 });
    await idle(page);
    expect(await page.evaluate(() => events)).toEqual(RESTARTED);
    await expect(page.locator('.pace')).toHaveCount(1);
  });

  test('leaves the first copy and its hooks alone', async ({ page, open }) => {
    await open({
      head: NO_EVENT_LAG + `<script src="/pace.js"></script>
<script>
  window.first = { Pace: window.Pace, hooks: [XMLHttpRequest.prototype.open, XMLHttpRequest.prototype.send, window.fetch, window.WebSocket, history.pushState, history.replaceState] };
</script>`,
    });
    expect(await page.evaluate(() => {
      const hooks = [XMLHttpRequest.prototype.open, XMLHttpRequest.prototype.send, window.fetch, window.WebSocket, history.pushState, history.replaceState];
      return window.Pace === first.Pace && hooks.every((hook, i) => hook === first.hooks[i]);
    })).toBe(true);
  });

  test('finds the first copy even when window.Pace no longer points to it', async ({ page, open }) => {
    const logged = warnings(page);
    await open({ head: NO_EVENT_LAG + '<script src="/pace.js"></script><script>window.firstPace = Pace; window.Pace = undefined;</script>' });
    await page.waitForFunction(() => document.querySelector('.pace.pace-inactive'));
    await expect(page.locator('.pace')).toHaveCount(1);
    expect(logged).toEqual([`Pace: pace.js ${version} was loaded after another copy (${version}); only the first copy runs.`]);
  });

  test('an older pace already on the page counts as a first copy', async ({ page, open }) => {
    // Pace 1.x puts an object with a start function on window.Pace.
    const logged = warnings(page);
    await open({ head: '<script>window.Pace = { start: function () {}, on: function () {} };</script>' });
    await page.waitForTimeout(500);
    await expect(page.locator('.pace')).toHaveCount(0);
    expect(await page.evaluate(() => typeof Pace.getOptions)).toBe('undefined');
    expect(logged).toEqual([`Pace: pace.js ${version} was loaded after another copy; only the first copy runs.`]);
  });

  test('loaded with a bundler, exports the first copy', async ({ page, open }) => {
    await open({ head: NO_EVENT_LAG + '<script src="/pace.js"></script><script>window.module = { exports: {} }; window.exports = module.exports;</script>' });
    expect(await page.evaluate(() => [module.exports === window.Pace, module.exports.version])).toEqual([true, version]);
  });
});
