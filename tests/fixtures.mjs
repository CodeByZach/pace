import fs from 'node:fs';
import { test as base, expect } from '@playwright/test';

const root = new URL('..', import.meta.url);

// `open()` loads a page from a fake origin (no server needed):
//   http://pace.test/          the page: `head`, then pace (`paceAttributes` on its
//                              <script>), then a recorder of pace's events: their names
//                              in `window.events`, the last time of each in `window.eventTimes`
//   http://pace.test/pace.js   the file under test (pace.js or pace.min.js, per project)
//   http://pace.test/delay     answers after ?ms=N milliseconds
export const test = base.extend({
  paceFile: ['pace.js', { option: true }],

  open: async ({ page, paceFile }, use) => {
    const pace = fs.readFileSync(new URL(paceFile, root), 'utf8');
    await use(async ({ head = '', paceAttributes = '', body = '<p>page</p>' } = {}) => {
      await page.route('http://pace.test/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/pace.js') {
          return route.fulfill({ contentType: 'text/javascript', body: pace });
        }
        if (url.pathname === '/delay') {
          await new Promise((resolve) => setTimeout(resolve, Number(url.searchParams.get('ms'))));
          return route.fulfill({ contentType: 'text/plain', body: 'ok' });
        }
        return route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html>
<html>
<head>
${head}
<script src="/pace.js" ${paceAttributes}></script>
<script>
  window.events = [];
  window.eventTimes = {};
  ['start', 'stop', 'restart', 'done', 'hide'].forEach(function (name) {
    Pace.on(name, function () {
      events.push(name);
      eventTimes[name] = performance.now();
    });
  });
</script>
</head>
<body>${body}</body>
</html>`,
        });
      });
      await page.goto('http://pace.test/');
    });
  },
});

export { expect };

// Waits until pace has finished and hidden the bar.
export const idle = (page) => page.waitForFunction(() => document.querySelector('.pace.pace-inactive'));

// Sends an XHR to /delay?ms=N (plus `query`), optionally opened inside Pace.ignore or
// Pace.track (`wrap`). Resolves with the page time (performance.now()) when it loaded.
// No cache-busting needed: routing disables the HTTP cache.
export const request = (page, { ms, method = 'GET', wrap, query = '' }) =>
  page.evaluate(
    ({ ms, method, wrap, query }) =>
      new Promise((resolve) => {
        const send = () => {
          const xhr = new XMLHttpRequest();
          xhr.open(method, `/delay?ms=${ms}${query}`);
          xhr.onload = () => resolve(performance.now());
          xhr.send();
        };
        if (wrap) Pace[wrap](send);
        else send();
      }),
    { ms, method, wrap, query },
  );

// The events of one restart, in order.
export const RESTARTED = ['restart', 'stop', 'start', 'done', 'hide'];

// Clears the recorded events (e.g. after the page-load run).
export const clearEvents = (page) => page.evaluate(() => { window.events = []; window.eventTimes = {}; });

// paceOptions that hold the bar at 0% until `hold.progress` is set (a documented
// extraSources source; pace creates a new one on every restart).
export const HOLD = `<script>
  window.paceOptions = { eventLag: false, extraSources: [function () { window.hold = this; this.progress = 0; }] };
</script>`;

export const NO_EVENT_LAG = '<script>window.paceOptions = { eventLag: false };</script>';
