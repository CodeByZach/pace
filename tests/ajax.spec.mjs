// Tracking requests made after the page has loaded. A restart happens 500 ms
// (restartOnRequestAfter) into a request, so for the 900 ms requests below it is
// already recorded by the time the request returns.
import { test, expect, idle, request, clearEvents, RESTARTED, NO_EVENT_LAG } from './fixtures.mjs';

// The same rules apply to XMLHttpRequest and fetch().
for (const api of ['XMLHttpRequest', 'fetch']) {
  test(`${api}: ajax.ignoreURLs patterns see the full URL`, async ({ page, open }) => {
    await open({ head: "<script>window.paceOptions = { eventLag: false, ajax: { ignoreURLs: [/^http:\\/\\/pace\\.test\\/delay/] } };</script>" });
    await idle(page);
    await clearEvents(page);
    await request(page, { ms: 900, api }); // a relative URL
    expect(await page.evaluate(() => events)).toEqual([]);
  });

  test(`${api}: ajax.ignoreURLs patterns also see the path and query of a request to the page's origin, not another's`, async ({ page, open }) => {
    await page.route('http://other.test/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, body: 'ok' });
    });
    await open({ head: "<script>window.paceOptions = { eventLag: false, ajax: { ignoreURLs: [/^\\/delay\\?ms=900#part$/] } };</script>" });
    await idle(page);
    await clearEvents(page);
    await request(page, { ms: 900, api, origin: 'http://pace.test', query: '#part' }); // an absolute URL
    expect(await page.evaluate(() => events)).toEqual([]);
    await request(page, { ms: 900, api, origin: 'http://other.test', query: '#part' });
    await idle(page);
    expect(await page.evaluate(() => events)).toEqual(RESTARTED);
  });

  test(`${api}: ajax.ignoreURLs patterns also see the URL as the page wrote it`, async ({ page, open }) => {
    await open({ head: "<script>window.paceOptions = { eventLag: false, ajax: { ignoreURLs: ['q=a b', 'http://PACE.test'] } };</script>" });
    await idle(page);
    await clearEvents(page);
    // Neither appears in the full URL, which has %20 for the space and a lowercase domain.
    await request(page, { ms: 900, api, query: '&q=a b' });
    await request(page, { ms: 900, api, origin: 'http://PACE.test' });
    expect(await page.evaluate(() => events)).toEqual([]);
  });

  test(`${api}: ajax.ignoreURLs patterns see the full URL resolved against <base href>`, async ({ page, open }) => {
    await open({ head: '<base href="/sub/"><script>window.paceOptions = { eventLag: false, ajax: { ignoreURLs: [/^http:\\/\\/pace\\.test\\/sub\\/delay/] } };</script>' });
    await idle(page);
    await clearEvents(page);
    await page.evaluate((api) => (api === 'fetch'
      ? fetch('delay?ms=900').then((response) => response.text())
      : new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'delay?ms=900');
        xhr.onload = resolve;
        xhr.onerror = reject;
        xhr.send();
      })), api);
    expect(await page.evaluate(() => events)).toEqual([]);
  });

  test.describe(`${api} with default ajax options`, () => {
    test.beforeEach(async ({ page, open }) => {
      await open({ head: NO_EVENT_LAG });
      await idle(page);
      await clearEvents(page);
    });

    test('a slow GET restarts the bar, which finishes after the request', async ({ page }) => {
      const loadedAt = await request(page, { ms: 900, api });
      await idle(page);
      expect(await page.evaluate(() => events)).toEqual(RESTARTED);
      expect(await page.evaluate(() => eventTimes.done)).toBeGreaterThanOrEqual(loadedAt);
    });

    test('a GET shorter than restartOnRequestAfter (500 ms) does not restart the bar', async ({ page }) => {
      await request(page, { ms: 100, api });
      await page.waitForTimeout(700); // past the 500 ms mark
      expect(await page.evaluate(() => events)).toEqual([]);
    });

    test('POST is not tracked', async ({ page }) => {
      await request(page, { ms: 900, method: 'POST', api });
      expect(await page.evaluate(() => events)).toEqual([]);
    });

    test('Pace.ignore() skips a request opened inside it', async ({ page }) => {
      await request(page, { ms: 900, wrap: 'ignore', api });
      expect(await page.evaluate(() => events)).toEqual([]);
    });

    test('Pace.track() tracks a request opened inside it, even a POST', async ({ page }) => {
      await request(page, { ms: 900, method: 'POST', wrap: 'track', api });
      await idle(page);
      expect(await page.evaluate(() => events)).toEqual(RESTARTED);
    });
  });

  test.describe(`${api} with ajax options`, () => {
    test.beforeEach(async ({ page, open }) => {
      await open({ head: "<script>window.paceOptions = { eventLag: false, ajax: { trackMethods: ['GET', 'POST'], ignoreURLs: ['ignored'] } };</script>" });
      await idle(page);
      await clearEvents(page);
    });

    test('ajax.trackMethods can add POST', async ({ page }) => {
      await request(page, { ms: 900, method: 'POST', api });
      await idle(page);
      expect(await page.evaluate(() => events)).toEqual(RESTARTED);
    });

    test('ajax.ignoreURLs skips matching URLs', async ({ page }) => {
      await request(page, { ms: 900, query: '&ignored', api });
      expect(await page.evaluate(() => events)).toEqual([]);
    });
  });
}

test.describe('with ajax.trackMethods that is not an array', () => {
  test('a string matches nothing, not substrings', async ({ page, open }) => {
    await open({ head: "<script>window.paceOptions = { eventLag: false, ajax: { trackMethods: 'GET' } };</script>" });
    await idle(page);
    await clearEvents(page);
    await request(page, { ms: 900 });
    expect(await page.evaluate(() => events)).toEqual([]);
  });

  test('a number does not break the page\'s requests', async ({ page, open }) => {
    await open({ head: '<script>window.paceOptions = { eventLag: false, ajax: { trackMethods: 5 } };</script>' });
    await idle(page);
    // Resolves only if the page's xhr.open() didn't throw.
    await request(page, { ms: 100 });
  });
});
