// Restarting on single-page-app navigation (history.pushState, which restarts synchronously).
import { test, expect, idle, clearEvents, RESTARTED, NO_EVENT_LAG } from './fixtures.mjs';

test('history.pushState restarts the bar', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG });
  await idle(page);
  await clearEvents(page);
  await page.evaluate(() => history.pushState({}, '', '/next'));
  await idle(page);
  expect(await page.evaluate(() => events)).toEqual(RESTARTED);
});

test('restartOnPushState: false does not restart the bar', async ({ page, open }) => {
  await open({ head: '<script>window.paceOptions = { eventLag: false, restartOnPushState: false };</script>' });
  await idle(page);
  await clearEvents(page);
  await page.evaluate(() => history.pushState({}, '', '/next'));
  expect(await page.evaluate(() => events)).toEqual([]);
});
