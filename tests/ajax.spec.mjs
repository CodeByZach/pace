// Tracking XMLHttpRequests made after the page has loaded. A restart happens 500 ms
// (restartOnRequestAfter) into a request, so for the 900 ms requests below it is
// already recorded by the time the request returns.
import { test, expect, idle, request, clearEvents, RESTARTED, NO_EVENT_LAG } from './fixtures.mjs';

test.describe('with default ajax options', () => {
  test.beforeEach(async ({ page, open }) => {
    await open({ head: NO_EVENT_LAG });
    await idle(page);
    await clearEvents(page);
  });

  test('a slow GET restarts the bar, which finishes after the request', async ({ page }) => {
    const loadedAt = await request(page, { ms: 900 });
    await idle(page);
    expect(await page.evaluate(() => events)).toEqual(RESTARTED);
    expect(await page.evaluate(() => eventTimes.done)).toBeGreaterThanOrEqual(loadedAt);
  });

  test('a GET shorter than restartOnRequestAfter (500 ms) does not restart the bar', async ({ page }) => {
    await request(page, { ms: 100 });
    await page.waitForTimeout(700); // past the 500 ms mark
    expect(await page.evaluate(() => events)).toEqual([]);
  });

  test('POST is not tracked', async ({ page }) => {
    await request(page, { ms: 900, method: 'POST' });
    expect(await page.evaluate(() => events)).toEqual([]);
  });

  test('Pace.ignore() skips a request opened inside it', async ({ page }) => {
    await request(page, { ms: 900, wrap: 'ignore' });
    expect(await page.evaluate(() => events)).toEqual([]);
  });

  test('Pace.track() tracks a request opened inside it, even a POST', async ({ page }) => {
    await request(page, { ms: 900, method: 'POST', wrap: 'track' });
    await idle(page);
    expect(await page.evaluate(() => events)).toEqual(RESTARTED);
  });
});

test.describe('with ajax options', () => {
  test.beforeEach(async ({ page, open }) => {
    await open({ head: "<script>window.paceOptions = { eventLag: false, ajax: { trackMethods: ['GET', 'POST'], ignoreURLs: ['ignored'] } };</script>" });
    await idle(page);
    await clearEvents(page);
  });

  test('ajax.trackMethods can add POST', async ({ page }) => {
    await request(page, { ms: 900, method: 'POST' });
    await idle(page);
    expect(await page.evaluate(() => events)).toEqual(RESTARTED);
  });

  test('ajax.ignoreURLs skips matching URLs', async ({ page }) => {
    await request(page, { ms: 900, query: '&ignored' });
    expect(await page.evaluate(() => events)).toEqual([]);
  });
});
