// What sites and themes rely on: the public API, the bar's markup, body classes,
// events and how options are read.
import { test, expect, idle, HOLD } from './fixtures.mjs';

test('exposes the documented methods', async ({ page, open }) => {
  await open();
  const missing = await page.evaluate(() =>
    ['start', 'restart', 'stop', 'track', 'ignore', 'on', 'off', 'once'].filter((name) => typeof Pace[name] !== 'function'),
  );
  expect(missing).toEqual([]);
});

test('while loading: renders the bar as the first child of <body> and marks <body> running', async ({ page, open }) => {
  await open({ head: HOLD });
  const bar = page.locator('body > .pace:first-child');
  await expect(bar).toHaveClass('pace pace-active');
  await expect(bar.locator('> .pace-progress > .pace-progress-inner')).toHaveCount(1);
  await expect(bar.locator('> .pace-activity')).toHaveCount(1);
  await expect(page.locator('body')).toHaveClass(/(^|\s)pace-running(\s|$)/);

  // Pace.restart() starts from 0% and renders synchronously, so this reads exact values,
  // including the zero-padded data-progress that themes select on ("00" to "09").
  const [progress, text, transform] = await page.evaluate(() => {
    Pace.restart();
    const el = document.querySelector('.pace-progress');
    return [el.dataset.progress, el.dataset.progressText, el.style.transform];
  });
  expect([progress, text]).toEqual(['00', '0%']);
  expect(transform).toMatch(/^translate3d\(0%, 0(px)?, 0(px)?\)$/);
});

test('when done: shows 100%, hides the bar and marks <body> done', async ({ page, open }) => {
  await open({ head: HOLD });
  await page.evaluate(() => { hold.progress = 100; });
  await idle(page);
  const bar = page.locator('body > .pace');
  await expect(bar).toHaveClass('pace pace-inactive');
  const progress = bar.locator('> .pace-progress');
  await expect(progress).toHaveAttribute('data-progress', '99');
  await expect(progress).toHaveAttribute('data-progress-text', '100%');
  expect(await progress.evaluate((el) => el.style.transform)).toMatch(/^translate3d\(100%, 0(px)?, 0(px)?\)$/);
  await expect(page.locator('body')).toHaveClass(/(^|\s)pace-done(\s|$)/);
  await expect(page.locator('body')).not.toHaveClass(/pace-running/);
});

test('on page load: fires start, done and hide once each', async ({ page, open }) => {
  await open();
  await idle(page);
  expect(await page.evaluate(() => events)).toEqual(['start', 'done', 'hide']);
});

test('reads options from window.paceOptions', async ({ page, open }) => {
  await open({ head: "<script>window.paceOptions = { className: 'from-global' };</script>" });
  await expect(page.locator('.pace-progress')).toHaveClass('pace-progress from-global');
});

test('reads options from data-pace-options on its <script>', async ({ page, open }) => {
  await open({ paceAttributes: `data-pace-options='{ "className": "from-attribute" }'` });
  await expect(page.locator('.pace-progress')).toHaveClass('pace-progress from-attribute');
});
