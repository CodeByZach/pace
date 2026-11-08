// How pace hooks into XMLHttpRequest and WebSocket: it wraps
// XMLHttpRequest.prototype.open/send and subclasses WebSocket, so pages and other
// libraries keep the native objects, and it tracks a request from send() until it
// ends.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { test, expect, idle, request, clearEvents, RESTARTED, HOLD, NO_EVENT_LAG } from './fixtures.mjs';

// Saved before pace loads, to compare with afterwards.
const SAVE_NATIVES = `<script>
  window.NativeXHR = XMLHttpRequest;
  window.nativeOpen = XMLHttpRequest.prototype.open;
  window.NativeWebSocket = WebSocket;
</script>`;

test('XMLHttpRequest stays the native constructor', async ({ page, open }) => {
  await open({ head: SAVE_NATIVES + NO_EVENT_LAG });
  const result = await page.evaluate(() => {
    class Subclass extends XMLHttpRequest {
      hello() { return 'hi'; }
    }
    const sub = new Subclass();
    return {
      same: XMLHttpRequest === NativeXHR,
      instance: new XMLHttpRequest() instanceof XMLHttpRequest,
      done: XMLHttpRequest.DONE,
      subclass: sub instanceof Subclass && sub.hello(),
    };
  });
  expect(result).toEqual({ same: true, instance: true, done: 4, subclass: 'hi' });
});

test('a library that patches XMLHttpRequest.prototype after pace still sees requests, and pace still tracks them', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG });
  await idle(page);
  await clearEvents(page);
  await page.evaluate(() => {
    window.seen = [];
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      seen.push(url);
      return open.call(this, method, url, ...rest);
    };
  });
  await request(page, { ms: 900 });
  await idle(page);
  expect(await page.evaluate(() => [seen, events])).toEqual([['/delay?ms=900'], RESTARTED]);
});

test('WebSocket keeps its prototype and constants', async ({ page, open }) => {
  await open({ head: SAVE_NATIVES + NO_EVENT_LAG });
  const result = await page.evaluate(() => {
    class Subclass extends WebSocket {
      hello() { return 'hi'; }
    }
    const socket = new WebSocket('ws://127.0.0.1:9/');
    const sub = new Subclass('ws://127.0.0.1:9/');
    socket.onerror = sub.onerror = () => {};
    return {
      instance: socket instanceof WebSocket && socket instanceof NativeWebSocket,
      open: WebSocket.OPEN,
      url: socket.url,
      subclass: sub instanceof Subclass && sub.hello(),
    };
  });
  expect(result).toEqual({ instance: true, open: 1, url: 'ws://127.0.0.1:9/', subclass: 'hi' });
});

test('with ajax: false, pace leaves XMLHttpRequest and WebSocket alone, and Pace.track does not throw', async ({ page, open }) => {
  await open({ head: SAVE_NATIVES + '<script>window.paceOptions = { ajax: false, eventLag: false };</script>' });
  await idle(page);
  const result = await page.evaluate(() => new Promise((resolve) => {
    const untouched = XMLHttpRequest === NativeXHR && XMLHttpRequest.prototype.open === nativeOpen && WebSocket === NativeWebSocket;
    const xhr = new XMLHttpRequest();
    Pace.track(() => xhr.open('GET', '/delay?ms=10'));
    xhr.onload = () => resolve(untouched);
    xhr.send();
  }));
  expect(result).toBe(true);
});

test('pace hooks into XMLHttpRequest only once it starts', async ({ page, open }) => {
  await open({ head: SAVE_NATIVES + '<script>window.paceOptions = { startOnPageLoad: false, eventLag: false };</script>' });
  expect(await page.evaluate(() => XMLHttpRequest.prototype.open === nativeOpen)).toBe(true);
  await page.evaluate(() => Pace.start());
  expect(await page.evaluate(() => XMLHttpRequest.prototype.open === nativeOpen)).toBe(false);
});

for (const [name, script] of [
  ['opened but never sent', "new XMLHttpRequest().open('GET', '/delay?ms=10');"],
  ['aborted before it is sent', "var xhr = new XMLHttpRequest(); xhr.open('GET', '/delay?ms=10'); xhr.abort();"],
  ['whose open() throws', "try { new XMLHttpRequest().open('GET', 'http://[invalid'); } catch (e) {}"],
]) {
  test(`a request ${name} does not hold the bar`, async ({ page, open }) => {
    await open({ head: NO_EVENT_LAG, body: `<script>${script}</script>` });
    await idle(page);
    expect(await page.evaluate(() => events)).toEqual(['start', 'done', 'hide']);
  });
}

test('a request opened but never sent on an idle page does not restart the bar', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG });
  await idle(page);
  await clearEvents(page);
  await page.evaluate(() => new XMLHttpRequest().open('GET', '/delay?ms=10'));
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => events)).toEqual([]);
});

test('a URL object works with ajax.ignoreURLs', async ({ page, open }) => {
  await open({ head: "<script>window.paceOptions = { eventLag: false, ajax: { ignoreURLs: ['ignored'] } };</script>" });
  await idle(page);
  await clearEvents(page);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', new URL('/delay?ms=900&ignored', location.href));
    xhr.onload = resolve;
    xhr.onerror = reject;
    xhr.send();
  }));
  expect(await page.evaluate(() => events)).toEqual([]);
});

test('an ajax.ignoreURLs pattern with the g flag ignores every matching request', async ({ page, open }) => {
  await open({ head: '<script>window.paceOptions = { eventLag: false, ajax: { ignoreURLs: [/delay/g] } };</script>' });
  await idle(page);
  await clearEvents(page);
  // Two requests, so a pattern that kept its lastIndex from the first would miss the second.
  await Promise.all([request(page, { ms: 900 }), request(page, { ms: 900 })]);
  expect(await page.evaluate(() => events)).toEqual([]);
});

test('an ajax.ignoreURLs entry that is neither a string nor a RegExp is skipped', async ({ page, open }) => {
  await open({ head: '<script>window.paceOptions = { eventLag: false, ajax: { ignoreURLs: [null, {}] } };</script>' });
  await idle(page);
  await request(page, { ms: 10 }); // rejects if send() throws
});

test('a request sent again from its own load handler is tracked until the second one ends', async ({ page, open }) => {
  await open({ head: NO_EVENT_LAG });
  await idle(page);
  await clearEvents(page);
  const secondLoadedAt = await page.evaluate(() => new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let count = 0;
    xhr.onload = () => {
      if (++count === 1) {
        xhr.open('GET', '/delay?ms=2000');
        xhr.send();
      } else {
        resolve(performance.now());
      }
    };
    xhr.open('GET', '/delay?ms=100');
    xhr.send();
  }));
  await idle(page);
  const [events, doneAt] = await page.evaluate(() => [window.events, eventTimes.done]);
  expect(events).toEqual(RESTARTED);
  expect(doneAt).toBeGreaterThanOrEqual(secondLoadedAt - 50);
});

test('opening a request again stops tracking the request it replaces', async ({ page, open }) => {
  await open({
    head: NO_EVENT_LAG,
    body: `<script>
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/delay?ms=3000');
      xhr.send();
      setTimeout(function () { xhr.open('GET', '/delay?ms=100'); xhr.send(); }, 50);
    </script>`,
  });
  await idle(page);
  // Well before the replaced 3 s request would have finished.
  expect(await page.evaluate(() => eventTimes.done)).toBeLessThan(2500);
});

test('an open() that throws on a loading request does not stop tracking it', async ({ page, open }) => {
  await open({
    head: NO_EVENT_LAG,
    body: `<script>
      window.loadedAt = null;
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/delay?ms=2000');
      xhr.onload = function () { loadedAt = performance.now(); };
      xhr.send();
      setTimeout(function () { try { xhr.open('GET', 'http://[invalid'); } catch (e) {} }, 50);
    </script>`,
  });
  await idle(page);
  const [doneAt, loadedAt] = await page.evaluate(() => [eventTimes.done, window.loadedAt]);
  expect(loadedAt).not.toBeNull();
  expect(doneAt).toBeGreaterThanOrEqual(loadedAt - 50);
});

test('a background request that no run was tracking does not hold a navigation', async ({ page, open }) => {
  await open({ head: '<script>window.paceOptions = { eventLag: false, restartOnRequestAfter: false };</script>' });
  await idle(page);
  await clearEvents(page);
  const loaded = request(page, { ms: 3000 });
  await page.evaluate(() => history.pushState({}, '', '?next'));
  await idle(page);
  const loadedAt = await loaded;
  const [events, doneAt] = await page.evaluate(() => [window.events, eventTimes.done]);
  expect(events).toEqual(RESTARTED);
  expect(doneAt).toBeLessThan(loadedAt - 1000); // finished well before the request did
});

test('a navigation keeps tracking the requests of the run it replaces', async ({ page, open }) => {
  await open({ head: HOLD });
  const loadedAt = await page.evaluate(() => new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/delay?ms=2000');
    xhr.onload = () => resolve(performance.now());
    xhr.send();
    // A new run starts while the request is loading; it isn't held by anything else.
    setTimeout(() => {
      history.pushState({}, '', '?next');
      hold.progress = 100;
    }, 200);
  }));
  await idle(page);
  expect(await page.evaluate(() => eventTimes.done)).toBeGreaterThanOrEqual(loadedAt - 50);
});

test('with trackWebSockets: false, WebSocket stays native', async ({ page, open }) => {
  await open({ head: SAVE_NATIVES + '<script>window.paceOptions = { eventLag: false, ajax: { trackWebSockets: false } };</script>' });
  await idle(page);
  expect(await page.evaluate(() => WebSocket === NativeWebSocket)).toBe(true);
});

// A real server on 127.0.0.1 (Chrome doesn't let the fake public origin of the other tests
// connect to it). It answers the WebSocket handshake after 1.5 s, so the socket stays
// connecting until then.
test.describe('a WebSocket that is still connecting', () => {
  let server;
  let origin;
  const sockets = new Set();

  test.beforeAll(async ({ paceFile }) => {
    const pace = fs.readFileSync(new URL(paceFile, new URL('..', import.meta.url)), 'utf8');
    server = http.createServer((req, res) => {
      if (req.url === '/pace.js') {
        res.writeHead(200, { 'content-type': 'text/javascript' });
        return res.end(pace);
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html>
<script>window.paceOptions = { eventLag: false };</script>
<script src="/pace.js"></script>
<script>
  window.openedAt = null;
  Pace.on('done', function () { window.doneAt = performance.now(); });
  var socket = new WebSocket('ws://' + location.host + '/socket');
  socket.onopen = function () { openedAt = performance.now(); };
</script>`);
    });
    server.on('upgrade', (req, socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      setTimeout(() => {
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      }, 1500);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  test.afterAll(() => new Promise((resolve) => {
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections();
    server.close(resolve);
  }));

  test('holds the bar until it opens', async ({ page }) => {
    await page.goto(origin);
    await page.waitForFunction(() => window.doneAt != null, null, { timeout: 10000 });
    const [openedAt, doneAt] = await page.evaluate(() => [window.openedAt, window.doneAt]);
    expect(openedAt).not.toBeNull();
    expect(doneAt).toBeGreaterThanOrEqual(openedAt);
  });
});
