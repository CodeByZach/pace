// What starting, stopping, restarting and finishing a run do. Each run fires start,
// done and hide once; stop() and restart() end the current run completely.
import { test, expect, idle, request, clearEvents, RESTARTED, HOLD, NO_EVENT_LAG } from './fixtures.mjs';

// Like HOLD, plus other options.
const hold = (extra) => `<script>
  window.paceOptions = Object.assign({ eventLag: false, extraSources: [function () { window.hold = this; this.progress = 0; }] }, ${extra});
</script>`;

const bodyClasses = (page) => page.evaluate(() => [...document.body.classList].filter((name) => name.startsWith('pace-')));

test('Pace.stop() mid-run ends the run: no done or hide, no bar, <body> marked done', async ({ page, open }) => {
  await open({ head: HOLD });
  await expect(page.locator('.pace.pace-active')).toHaveCount(1);
  await page.evaluate(() => { events.length = 0; Pace.stop(); });
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => [events, Pace.running])).toEqual([['stop'], false]);
  await expect(page.locator('.pace')).toHaveCount(0);
  expect(await bodyClasses(page)).toEqual(['pace-done']);
});

test('Pace.restart() mid-run runs one animation and fires done and hide once', async ({ page, open }) => {
  await open({ head: HOLD });
  await expect(page.locator('.pace.pace-active')).toHaveCount(1);
  const progressEvents = await page.evaluate(async () => {
    events.length = 0;
    let count = 0;
    Pace.on('progress', () => count++);
    Pace.restart();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return count;
  });
  // One animation renders at most about 30 frames a second; two would render about 60.
  expect(progressEvents).toBeLessThan(45);
  await page.evaluate(() => { hold.progress = 100; });
  await idle(page);
  expect(await page.evaluate(() => events)).toEqual(['restart', 'stop', 'start', 'done', 'hide']);
  expect(await bodyClasses(page)).toEqual(['pace-done']);
});

test('Pace.start() while running does nothing', async ({ page, open }) => {
  await open({ head: HOLD });
  await expect(page.locator('.pace.pace-active')).toHaveCount(1);
  await page.evaluate(() => { events.length = 0; Pace.start(); hold.progress = 100; });
  await idle(page);
  expect(await page.evaluate(() => events)).toEqual(['done', 'hide']);
  await expect(page.locator('.pace')).toHaveCount(1);
});

test('pushState while the bar is finishing starts a new run that finishes once', async ({ page, open }) => {
  await open({ head: hold('{ ghostTime: 1000 }') });
  await page.evaluate(() => new Promise((resolve) => {
    Pace.once('done', () => setTimeout(resolve, 100));
    hold.progress = 100;
  }));
  await page.evaluate(() => history.pushState({}, '', '?next'));
  // Past the moment the first run would have hidden the bar: the new run is still going.
  await page.waitForTimeout(1200);
  await expect(page.locator('.pace')).toHaveClass('pace pace-active');
  expect(await page.evaluate(() => Pace.running)).toBe(true);
  await page.evaluate(() => { hold.progress = 100; });
  await idle(page);
  expect(await page.evaluate(() => events)).toEqual(['start', 'done', ...RESTARTED]);
  await expect(page.locator('.pace')).toHaveCount(1);
});

test('Pace.stop() from a done handler: no hide and no bar', async ({ page, open }) => {
  await open({ head: hold('{ ghostTime: 300 }') });
  await page.evaluate(() => { Pace.once('done', () => Pace.stop()); hold.progress = 100; });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => events)).toEqual(['start', 'done', 'stop']);
  await expect(page.locator('.pace')).toHaveCount(0);
});

test('a request that starts while the bar is finishing restarts it', async ({ page, open }) => {
  await open({ head: hold('{ ghostTime: 1000 }') });
  const loaded = page.evaluate(() => new Promise((resolve) => {
    Pace.once('done', () => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/delay?ms=1500');
      xhr.onload = () => resolve();
      xhr.send();
    });
    hold.progress = 100;
  }));
  await expect.poll(() => page.evaluate(() => events.includes('restart'))).toBe(true);
  await page.evaluate(() => { hold.progress = 100; });
  await loaded;
  await idle(page);
  expect(await page.evaluate(() => events)).toEqual(['start', 'done', ...RESTARTED]);
});

test('two slow requests at the same time restart the bar once', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG });
  await idle(page);
  await clearEvents(page);
  await Promise.all([request(page, { ms: 1500 }), request(page, { ms: 1500 })]);
  await idle(page);
  expect(await page.evaluate(() => events)).toEqual(RESTARTED);
});

test('a slow request joins a run that started while it was open, instead of restarting it', async ({ page, open }) => {
  await open({ head: HOLD });
  await page.evaluate(() => { hold.progress = 100; });
  await idle(page);
  await clearEvents(page);
  // The request, then a navigation that starts a run (held at 0%) before the
  // request's 500 ms mark.
  const loadedAt = await page.evaluate(() => new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/delay?ms=1500');
    xhr.onload = () => resolve(performance.now());
    xhr.send();
    history.pushState({}, '', '?next');
    setTimeout(() => { hold.progress = 100; }, 800);
  }));
  await idle(page);
  const [events, doneAt] = await page.evaluate(() => [window.events, eventTimes.done]);
  expect(events).toEqual(RESTARTED);
  // The run waited for the request it joined.
  expect(doneAt).toBeGreaterThanOrEqual(loadedAt - 50);
});

test('waits for the last of several requests, whatever order they finish in', async ({ page, open }) => {
  await open({
    head: NO_EVENT_LAG,
    body: `<script>
      window.loadedAt = {};
      [200, 2000].forEach(function (ms) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/delay?ms=' + ms);
        xhr.onload = function () { loadedAt[ms] = performance.now(); };
        xhr.send();
      });
    </script>`,
  });
  await idle(page);
  const [doneAt, slowAt] = await page.evaluate(() => [eventTimes.done, loadedAt[2000]]);
  expect(doneAt).toBeGreaterThanOrEqual(slowAt - 50);
});

test('waits for every selector, whatever order they appear in', async ({ page, open }) => {
  await open({
    head: "<script>window.paceOptions = { eventLag: false, elements: { selectors: ['#first', '#second'] } };</script>",
    body: `<script>
      window.addedAt = {};
      [['first', 200], ['second', 1500]].forEach(function (item) {
        setTimeout(function () {
          var el = document.createElement('i');
          el.id = item[0];
          document.body.appendChild(el);
          addedAt[item[0]] = performance.now();
        }, item[1]);
      });
    </script>`,
  });
  await idle(page);
  const [doneAt, secondAt] = await page.evaluate(() => [eventTimes.done, addedAt.second]);
  expect(doneAt).toBeGreaterThanOrEqual(secondAt);
});

test('restarts do not pile up work from earlier runs', async ({ page, open }) => {
  await open({
    head: `<script>
      window.paceOptions = { eventLag: false, elements: { selectors: ['#never'] } };
      window.lookups = 0;
      var querySelector = document.querySelector;
      document.querySelector = function (selector) {
        if (selector === '#never') lookups++;
        return querySelector.call(document, selector);
      };
    </script>`,
  });
  const lookupsPerSecond = () => page.evaluate(async () => {
    const before = lookups;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return lookups - before;
  });
  // One tracker checks about 10 times a second (checkInterval 100 ms).
  expect(await lookupsPerSecond()).toBeLessThan(20);
  await page.evaluate(() => { for (let i = 0; i < 20; i++) history.pushState({}, '', '?' + i); });
  expect(await lookupsPerSecond()).toBeLessThan(20);
});

test('Pace.stop() cancels waiting for a missing target', async ({ page, open }) => {
  await open({ head: "<script>window.paceOptions = { target: '#app' };</script>" });
  await page.evaluate(() => Pace.stop());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => Pace.running)).toBe(false);
  await page.evaluate(() => { const app = document.createElement('div'); app.id = 'app'; document.body.appendChild(app); });
  await page.waitForTimeout(300);
  await expect(page.locator('.pace')).toHaveCount(0);
});

test('options passed to Pace.start() apply to that run', async ({ page, open }) => {
  await open({ head: "<script>window.paceOptions = { startOnPageLoad: false, eventLag: false };</script>" });
  await page.evaluate(() => Pace.start({ elements: { selectors: ['#late'] } }));
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => events)).toEqual(['start']);
  await page.evaluate(() => { const el = document.createElement('i'); el.id = 'late'; document.body.appendChild(el); });
  await idle(page);
  expect(await page.evaluate(() => events)).toEqual(['start', 'done', 'hide']);
});

test('a page that sets document.onreadystatechange does not stop the bar from finishing', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG, body: '<script>document.onreadystatechange = function () {};</script>' });
  await idle(page);
  expect(await page.evaluate(() => events)).toEqual(['start', 'done', 'hide']);
});

test('Pace.stop() from a progress handler leaves no bar behind', async ({ page, open }) => {
  await open({ head: HOLD });
  await page.evaluate(() => new Promise((resolve) => {
    let count = 0;
    const stopOnFifth = () => {
      if (++count === 5) {
        Pace.off('progress', stopOnFifth);
        Pace.stop();
        resolve();
      }
    };
    Pace.on('progress', stopOnFifth);
  }));
  await page.waitForTimeout(300);
  await expect(page.locator('.pace')).toHaveCount(0);
  expect(await bodyClasses(page)).toEqual(['pace-done']);
});

test('a navigation from a progress handler leaves one bar', async ({ page, open }) => {
  await open({ head: HOLD });
  await page.evaluate(() => new Promise((resolve) => {
    Pace.once('progress', () => { history.pushState({}, '', '?next'); resolve(); });
  }));
  await page.evaluate(() => { hold.progress = 100; });
  await idle(page);
  await expect(page.locator('.pace')).toHaveCount(1);
  expect(await page.evaluate(() => events)).toEqual(['start', ...RESTARTED]);
});

test('Pace.stop() while the bar first renders means no start event', async ({ page, open }) => {
  await open({ head: "<script>window.paceOptions = { startOnPageLoad: false, eventLag: false };</script>" });
  await page.evaluate(() => { Pace.once('change', () => Pace.stop()); Pace.start(); });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => [events, Pace.running])).toEqual([['stop'], false]);
});

test('an invalid selector neither leaves pace stuck nor breaks navigation', async ({ page, open }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open({ head: "<script>window.paceOptions = { eventLag: false, elements: { selectors: ['#1a'] } };</script>" });
  const [search, running] = await page.evaluate(() => {
    history.pushState({}, '', '?next');
    return [location.search, Pace.running];
  });
  expect([search, running]).toEqual(['?next', false]);
  await expect.poll(() => errors.length).toBe(2); // at load, and on the navigation
});
