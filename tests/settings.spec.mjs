// Settings: their names and defaults, how they are given, checked, changed and read.
import { test, expect, idle, request, clearEvents, RESTARTED, HOLD } from './fixtures.mjs';

const options = (js) => `<script>window.paceOptions = ${js};</script>`;

// The console warnings the page logs, from now on.
const warnings = (page) => {
  const messages = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') messages.push(message.text());
  });
  return messages;
};

const DEFAULTS = {
  startOnPageLoad: true,
  restartOnNavigation: true,
  restartOnRequestAfter: 500,
  target: 'body',
  className: '',
  trackDocument: true,
  trackEventLag: true,
  waitFor: ['body'],
  trackXHR: true,
  trackFetch: true,
  trackWebSockets: true,
  requestMethods: ['GET'],
  ignoreRequests: [],
  maxWait: 15000,
  minVisible: 250,
  hideDelay: 100,
  catchupTime: 100,
  initialRate: 0.03,
  maxProgressPerFrame: 20,
  easeFactor: 1.25,
  extraSources: [],
};

test('Pace.getOptions() returns every setting with its default', async ({ page, open }) => {
  await open();
  expect(await page.evaluate(() => Pace.getOptions())).toEqual(DEFAULTS);
  expect(await page.evaluate(() => 'options' in Pace)).toBe(false);
});

test('Pace.getOptions() returns a new copy each time', async ({ page, open }) => {
  await open({ head: options("{ waitFor: ['body'], ignoreRequests: [/a/] }") });
  const [same, after] = await page.evaluate(() => {
    const first = Pace.getOptions();
    first.waitFor.push('#changed');
    first.ignoreRequests.length = 0;
    first.minVisible = 0;
    return [first === Pace.getOptions(), Pace.getOptions()];
  });
  expect(same).toBe(false);
  expect(after.waitFor).toEqual(['body']);
  expect(after.ignoreRequests).toHaveLength(1);
  expect(after.minVisible).toBe(250);
});

test('a list given to pace is copied: changing it afterwards changes nothing', async ({ page, open }) => {
  await open({ head: options('{ startOnPageLoad: false }') });
  const waitFor = await page.evaluate(() => {
    const list = ['body'];
    Pace.configure({ waitFor: list });
    list.push('#changed');
    return Pace.getOptions().waitFor;
  });
  expect(waitFor).toEqual(['body']);
});

test('Pace.configure() changes settings without starting the bar', async ({ page, open }) => {
  await open({ head: options('{ startOnPageLoad: false }') });
  await page.evaluate(() => Pace.configure({ className: 'configured', hideDelay: 50 }));
  expect(await page.evaluate(() => [Pace.getOptions().className, Pace.getOptions().hideDelay, events])).toEqual(['configured', 50, []]);
  await expect(page.locator('.pace')).toHaveCount(0);
  await page.evaluate(() => Pace.start());
  await expect(page.locator('.pace-progress')).toHaveClass('pace-progress configured');
});

test('a setting changed during a run applies from the next run', async ({ page, open }) => {
  await open({ head: HOLD });
  await page.evaluate(() => Pace.configure({ hideDelay: 1000 }));
  await page.evaluate(() => { hold.progress = 100; });
  await idle(page);
  expect(await page.evaluate(() => eventTimes.hide - eventTimes.done)).toBeLessThan(500);
  await page.evaluate(() => { Pace.restart(); hold.progress = 100; });
  await expect.poll(() => page.evaluate(() => events.filter((name) => name === 'hide').length), { timeout: 5000 }).toBe(2);
  expect(await page.evaluate(() => eventTimes.hide - eventTimes.done)).toBeGreaterThanOrEqual(950);
});

test('Pace.configure() before the first start leaves the page\'s request functions alone', async ({ page, open }) => {
  await open({ head: '<script>window.nativeFetch = window.fetch; window.nativeOpen = XMLHttpRequest.prototype.open;</script>' + options('{ startOnPageLoad: false, trackFetch: false }') });
  await page.evaluate(() => Pace.configure({ trackFetch: true, trackXHR: true }));
  expect(await page.evaluate(() => [fetch === nativeFetch, XMLHttpRequest.prototype.open === nativeOpen])).toEqual([true, true]);
});

test('pace hooks into each kind of request only once', async ({ page, open }) => {
  await open({ head: options('{ trackEventLag: false }') });
  await idle(page);
  const same = await page.evaluate(() => {
    const hooks = () => [XMLHttpRequest.prototype.open, XMLHttpRequest.prototype.send, window.fetch, window.WebSocket];
    const before = hooks();
    Pace.configure({});
    Pace.start({});
    Pace.restart();
    return hooks().every((hook, i) => hook === before[i]);
  });
  expect(same).toBe(true);
});

test('requestMethods match whatever their case', async ({ page, open }) => {
  await open({ head: options("{ trackEventLag: false, requestMethods: ['get', 'post'] }") });
  await idle(page);
  await clearEvents(page);
  await request(page, { ms: 900, method: 'POST' });
  await idle(page);
  expect(await page.evaluate(() => events)).toEqual(RESTARTED);
});

test('ignoreRequests works with a RegExp the page has frozen, or one made in another frame', async ({ page, open }) => {
  await open({ head: options('{ trackEventLag: false }'), body: '<iframe></iframe>' });
  await idle(page);
  await clearEvents(page);
  await page.evaluate(() => Pace.configure({ ignoreRequests: [Object.freeze(/ms=900/g), frames[0].eval('/ms=901/')] }));
  await request(page, { ms: 900 });
  await request(page, { ms: 901 });
  expect(await page.evaluate(() => events)).toEqual([]);
});

test('turning trackFetch on later tracks the next fetch, and pace leaves fetch alone until then', async ({ page, open }) => {
  await open({ head: '<script>window.nativeFetch = window.fetch;</script>' + options('{ trackEventLag: false, trackFetch: false }') });
  await idle(page);
  expect(await page.evaluate(() => window.fetch === window.nativeFetch)).toBe(true);
  await clearEvents(page);
  await page.evaluate(() => Pace.configure({ trackFetch: true }));
  await request(page, { ms: 900, api: 'fetch' });
  await idle(page);
  expect(await page.evaluate(() => events)).toEqual(RESTARTED);
});

test('trackXHR: false leaves XMLHttpRequest alone', async ({ page, open }) => {
  await open({ head: '<script>window.nativeOpen = XMLHttpRequest.prototype.open;</script>' + options('{ trackEventLag: false, trackXHR: false }') });
  await idle(page);
  await clearEvents(page);
  await request(page, { ms: 900 });
  expect(await page.evaluate(() => [events, XMLHttpRequest.prototype.open === window.nativeOpen])).toEqual([[], true]);
});

test('minVisible: the bar stays at least this long', async ({ page, open }) => {
  await open({ head: options('{ trackEventLag: false, minVisible: 1500 }') });
  await idle(page);
  const shown = await page.evaluate(() => eventTimes.hide - eventTimes.start);
  expect(shown).toBeGreaterThanOrEqual(1450);
});

test('trackDocument: false does not wait for the page to load', async ({ page, open }) => {
  // The image holds the load event for 3 s.
  await open({
    head: options('{ trackEventLag: false, trackDocument: false }') + "<script>addEventListener('load', () => { window.loadedAt = performance.now(); });</script>",
    body: '<img src="/delay?ms=3000">',
  });
  await idle(page);
  const [doneAt, loadedAt] = await page.evaluate(() => [eventTimes.done, window.loadedAt]);
  expect(doneAt).toBeLessThan(loadedAt - 1000);
});

test('trackEventLag: false does not wait for the page to stop being busy', async ({ page, open }) => {
  // Measuring event lag takes at least 500 ms (ten samples, 50 ms apart).
  await open({ head: options('{ trackEventLag: false, trackDocument: false }') });
  await idle(page);
  expect(await page.evaluate(() => eventTimes.done - eventTimes.start)).toBeLessThan(400);
});

test.describe('wrong values and unknown names', () => {
  test('a wrong value is ignored with a warning, and the setting keeps its value', async ({ page, open }) => {
    const logged = warnings(page);
    await open({ head: options("{ minVisible: 'slow', hideDelay: -1, maxWait: Infinity, trackXHR: 'no', target: 5, requestMethods: ['GET', 7], catchupTime: 0 }") });
    expect(logged).toEqual([
      'Pace: ignored the minVisible option from window.paceOptions: expected a number of milliseconds from 0 to 2147483647, got string "slow".',
      'Pace: ignored the hideDelay option from window.paceOptions: expected a number of milliseconds from 0 to 2147483647, got number -1.',
      'Pace: ignored the maxWait option from window.paceOptions: expected false or a number of milliseconds from 0 to 2147483647, got number Infinity.',
      'Pace: ignored the trackXHR option from window.paceOptions: expected true or false, got string "no".',
      'Pace: ignored the target option from window.paceOptions: expected a valid CSS selector, got number 5.',
      'Pace: ignored the requestMethods option from window.paceOptions: expected an array of strings, got array containing number 7.',
      'Pace: ignored the catchupTime option from window.paceOptions: expected a number greater than 0, got number 0.',
    ]);
    expect(await page.evaluate(() => Pace.getOptions())).toEqual(DEFAULTS);
  });

  test('an unknown name is ignored with a warning, which suggests the name that differs only in case', async ({ page, open }) => {
    const logged = warnings(page);
    await open({ head: options("{ classname: 'a', colour: 'red' }") });
    expect(logged).toEqual([
      'Pace: ignored the unknown option classname from window.paceOptions. Did you mean className?',
      'Pace: ignored the unknown option colour from window.paceOptions.',
    ]);
    await expect(page.locator('.pace-progress')).toHaveClass('pace-progress');
  });

  test('a version 1 name is ignored with a warning that names what replaced it', async ({ page, open }) => {
    const logged = warnings(page);
    await open({ head: options("{ ajax: { trackMethods: ['POST'] }, eventLag: false, elements: { selectors: ['#x'] }, document: false, restartOnPushState: false, minTime: 0, ghostTime: 0 }") });
    expect(logged).toEqual([
      'Pace: ignored the ajax option from window.paceOptions: use trackXHR, trackFetch, trackWebSockets, requestMethods, ignoreRequests and maxWait instead.',
      'Pace: ignored the eventLag option from window.paceOptions: use trackEventLag instead.',
      'Pace: ignored the elements option from window.paceOptions: use waitFor instead.',
      'Pace: ignored the document option from window.paceOptions: use trackDocument instead.',
      'Pace: ignored the restartOnPushState option from window.paceOptions: use restartOnNavigation instead.',
      'Pace: ignored the minTime option from window.paceOptions: use minVisible instead.',
      'Pace: ignored the ghostTime option from window.paceOptions: use hideDelay instead.',
    ]);
    expect(await page.evaluate(() => Pace.getOptions())).toEqual(DEFAULTS);
  });

  test('each problem is warned about once', async ({ page, open }) => {
    const logged = warnings(page);
    await open({ head: options('{ startOnPageLoad: false }') });
    await page.evaluate(() => {
      Pace.configure({ minVisible: 'slow' });
      Pace.configure({ minVisible: 'slow' });
      Pace.start({ minVisible: 'slow' });
    });
    expect(logged).toEqual([
      'Pace: ignored the minVisible option from Pace.configure(): expected a number of milliseconds from 0 to 2147483647, got string "slow".',
      'Pace: ignored the minVisible option from Pace.start(): expected a number of milliseconds from 0 to 2147483647, got string "slow".',
    ]);
  });

  test('an invalid selector in target or waitFor is ignored with a warning, and pace keeps working', async ({ page, open }) => {
    const logged = warnings(page);
    await open({ head: options("{ trackEventLag: false, target: '#a[', waitFor: ['body', '#b['] }") });
    await idle(page);
    expect(logged).toEqual([
      'Pace: ignored the target option from window.paceOptions: expected a valid CSS selector, got string "#a[".',
      'Pace: ignored the waitFor option from window.paceOptions: expected an array of valid CSS selectors, got array containing string "#b[".',
    ]);
  });

  test('Pace.start() and Pace.configure() never throw, whatever they are given', async ({ page, open }) => {
    const logged = warnings(page);
    await open({ head: options('{ trackEventLag: false }') });
    await idle(page);
    const status = await page.evaluate(() => {
      Pace.configure(5);
      Pace.configure({ requestMethods: null, waitFor: '.x' });
      Pace.start(null);
      // A misconfiguration must not break the page's own requests either.
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/delay?ms=0');
      return new Promise((resolve) => {
        xhr.onload = () => resolve(xhr.status);
        xhr.send();
      });
    });
    expect(status).toBe(200);
    expect(logged).toEqual([
      'Pace: ignored the options from Pace.configure(): expected an object, got number 5.',
      'Pace: ignored the requestMethods option from Pace.configure(): expected an array of strings, got null.',
      'Pace: ignored the waitFor option from Pace.configure(): expected an array of valid CSS selectors, got string ".x".',
      'Pace: ignored the options from Pace.start(): expected an object, got null.',
    ]);
  });

  test('an error from reading the options is reported, not thrown', async ({ page, open }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open({ head: options('{ startOnPageLoad: false }') });
    const threw = await page.evaluate(() => {
      try {
        Pace.configure({ className: 'before', get target() { throw new Error('getter'); }, hideDelay: 50 });
        return false;
      } catch {
        return true;
      }
    });
    expect(threw).toBe(false);
    await expect.poll(() => errors).toEqual(['getter']);
    // The other settings still apply.
    expect(await page.evaluate(() => [Pace.getOptions().className, Pace.getOptions().hideDelay])).toEqual(['before', 50]);
  });

  test('a value is checked as it is stored: a list is read once, and an error while checking one setting skips only that one', async ({ page, open }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open({ head: options('{ startOnPageLoad: false }') });
    const result = await page.evaluate(() => {
      // A list whose first item is 'GET' when checked and 7 afterwards.
      let reads = 0;
      const methods = [];
      Object.defineProperty(methods, 0, { get: () => (reads++ ? 7 : 'GET'), enumerable: true });
      const revoked = Proxy.revocable({}, {});
      revoked.revoke();
      Pace.configure({ requestMethods: methods, className: 'a', target: revoked.proxy, hideDelay: 50 });
      Pace.start();
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/delay?ms=0');
      return [Pace.getOptions().requestMethods, Pace.getOptions().className, Pace.getOptions().hideDelay];
    });
    expect(result).toEqual([['GET'], 'a', 50]);
    await expect.poll(() => errors.length).toBe(1); // the revoked proxy
  });

  test('ignoreRequests rejects an empty string, which would match every URL, and an object that only claims to be a RegExp', async ({ page, open }) => {
    const logged = warnings(page);
    await open({ head: options("{ startOnPageLoad: false }") });
    await page.evaluate(() => {
      Pace.configure({ ignoreRequests: [''] });
      Pace.configure({ ignoreRequests: [{ [Symbol.toStringTag]: 'RegExp' }] });
    });
    expect(logged).toEqual([
      'Pace: ignored the ignoreRequests option from Pace.configure(): expected an array of non-empty strings and RegExps, got array containing string "".',
      'Pace: ignored the ignoreRequests option from Pace.configure(): expected an array of non-empty strings and RegExps, got array containing RegExp.',
    ]);
    expect(await page.evaluate(() => Pace.getOptions().ignoreRequests)).toEqual([]);
  });

  test('an extra source is checked without reading anything from it', async ({ page, open }) => {
    await open({ head: options('{ startOnPageLoad: false }') });
    const [reads, accepted] = await page.evaluate(() => {
      const reads = [];
      const source = new Proxy(class {}, { get: (target, key) => { reads.push(String(key)); return target[key]; } });
      Pace.configure({ extraSources: [source] });
      return [reads, Pace.getOptions().extraSources.length];
    });
    expect([reads, accepted]).toEqual([[], 1]);
  });

  test('an extra source that can\'t be constructed with new is ignored with a warning', async ({ page, open }) => {
    const logged = warnings(page);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open({ head: options('{ trackEventLag: false, extraSources: [() => {}] }') });
    await idle(page);
    expect(errors).toEqual([]);
    expect(logged).toEqual(['Pace: ignored the extraSources option from window.paceOptions: expected an array of constructors, got array containing function.']);
  });

  test('page markup that takes the name paceOptions is ignored with a warning', async ({ page, open }) => {
    // A form with id="paceOptions" becomes window.paceOptions, and an input named target
    // becomes its target property.
    const logged = warnings(page);
    await open({ head: '<form id="paceOptions"><input name="target"></form>' });
    await idle(page);
    expect(logged).toEqual(['Pace: ignored the options from window.paceOptions: expected an object, got HTMLFormElement.']);
  });

  test('data-pace-options that is not valid JSON is ignored with a warning', async ({ page, open }) => {
    const logged = warnings(page);
    await open({ paceAttributes: `data-pace-options="{ className: 'a' }"` });
    expect(logged).toEqual([`Pace: ignored the options from data-pace-options: expected valid JSON, got string "{ className: 'a' }".`]);
    await expect(page.locator('.pace-progress')).toHaveClass('pace-progress');
  });
});

test.describe('data-pace-options', () => {
  test('is read only from pace\'s own <script>', async ({ page, open }) => {
    await open({ head: `<script type="application/json" data-pace-options='{ "className": "elsewhere" }'></script>` });
    await expect(page.locator('.pace-progress')).toHaveClass('pace-progress');
  });

  test('is read from pace\'s own <script> even when markup takes the name currentScript', async ({ page, open }) => {
    await open({ head: '<img name="currentScript">', paceAttributes: `data-pace-options='{ "className": "own" }'` });
    await expect(page.locator('.pace-progress')).toHaveClass('pace-progress own');
  });

  test('applies after window.paceOptions', async ({ page, open }) => {
    await open({ head: options("{ className: 'global', hideDelay: 50 }"), paceAttributes: `data-pace-options='{ "className": "attribute" }'` });
    await expect(page.locator('.pace-progress')).toHaveClass('pace-progress attribute');
    expect(await page.evaluate(() => Pace.getOptions().hideDelay)).toBe(50);
  });
});
