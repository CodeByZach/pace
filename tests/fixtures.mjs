import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { test as base, expect } from '@playwright/test';

const root = new URL('..', import.meta.url);

// `open()` loads a page from a fake origin (no server needed):
//   http://pace.test/          the page: `head`, then pace (`paceAttributes` on its
//                              <script>), then a recorder of pace's events: their names
//                              in `window.events`, the last time of each in `window.eventTimes`
//   http://pace.test/pace.js   the file under test (pace.js or pace.min.js, per project)
//   http://pace.test/delay     answers after ?ms=N milliseconds (also at any path ending in /delay)
//
// `server` is the origin of a real server on 127.0.0.1, one per worker, for what routed
// responses don't reproduce: responses that arrive in parts, network errors, requests that never
// end, and WebSockets. (Chrome doesn't let the fake public origin above connect to 127.0.0.1.)
//   /?options=JS           a page that sets window.paceOptions to JS (default { eventLag: false }),
//                          loads pace and records its events like open(); with ?socket it opens
//                          a WebSocket to /socket, recording window.openedAt
//   /delay?ms=N            answers after N ms. No Content-Length (chunked), so a request's progress
//                          never reports 100% on its own and only its end can finish the bar
//   /stream?head=N&ms=M    sends its headers and a first part after N ms, and ends after M ms
//   /echo?ms=N             answers with the request's method and body, after N ms
//   /drop?ms=N             closes the connection without answering (a network error) after N ms
//   /hang                  never answers
//   ws /socket             answers the WebSocket handshake after 1.5 s, or never with ?never
export const test = base.extend({
  paceFile: ['pace.js', { option: true, scope: 'worker' }],

  server: [async ({ paceFile }, use) => {
    const pace = fs.readFileSync(new URL(paceFile, root), 'utf8');
    const sockets = new Set();
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const ms = Number(url.searchParams.get('ms'));
      switch (url.pathname) {
        case '/pace.js':
          res.writeHead(200, { 'content-type': 'text/javascript' });
          res.end(pace);
          return;
        case '/delay':
          setTimeout(() => {
            res.write('ok'); // before end(), which would otherwise add a Content-Length
            res.end();
          }, ms);
          return;
        case '/stream':
          setTimeout(() => {
            res.writeHead(200, { 'content-type': 'text/plain' });
            res.write('first part');
          }, Number(url.searchParams.get('head')));
          setTimeout(() => res.end(), ms);
          return;
        case '/echo': {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => setTimeout(() => res.end(`${req.method} ${body}`), ms));
          return;
        }
        case '/drop':
          setTimeout(() => req.socket.destroy(), ms);
          return;
        case '/hang':
          return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html>
<script>window.paceOptions = ${url.searchParams.get('options') ?? '{ eventLag: false }'};</script>
<script src="/pace.js"></script>
<script>
  window.events = [];
  window.eventTimes = {};
  ['start', 'stop', 'restart', 'done', 'hide'].forEach(function (name) {
    Pace.on(name, function () { events.push(name); eventTimes[name] = performance.now(); });
  });
  ${url.searchParams.has('socket') ? `window.openedAt = null;
  var socket = new WebSocket('ws://' + location.host + '/socket${url.searchParams.get('socket') === 'never' ? '?never' : ''}');
  socket.onopen = function () { openedAt = performance.now(); };` : ''}
</script>`);
    });
    server.on('upgrade', (req, socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      if (req.url.includes('never')) {
        return;
      }
      const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      setTimeout(() => {
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      }, 1500);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await use(`http://127.0.0.1:${server.address().port}`);
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }, { scope: 'worker' }],

  open: async ({ page, paceFile }, use) => {
    const pace = fs.readFileSync(new URL(paceFile, root), 'utf8');
    await use(async ({ head = '', paceAttributes = '', body = '<p>page</p>' } = {}) => {
      await page.route('http://pace.test/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/pace.js') {
          return route.fulfill({ contentType: 'text/javascript', body: pace });
        }
        if (url.pathname.endsWith('/delay')) {
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

// Sends a request to `origin`/delay?ms=N (plus `query`) with `api` (XMLHttpRequest or fetch),
// optionally inside Pace.ignore or Pace.track (`wrap`). Resolves with the page time
// (performance.now()) when it loaded. No cache-busting needed: routing disables the
// HTTP cache.
export const request = (page, { ms, method = 'GET', wrap, query = '', api = 'XMLHttpRequest', origin = '' }) =>
  page.evaluate(
    ({ ms, method, wrap, query, api, origin }) =>
      new Promise((resolve, reject) => {
        const url = `${origin}/delay?ms=${ms}${query}`;
        const send = () => {
          if (api === 'fetch') {
            fetch(url, { method }).then(() => resolve(performance.now()), reject);
            return;
          }
          const xhr = new XMLHttpRequest();
          xhr.open(method, url);
          xhr.onload = () => resolve(performance.now());
          xhr.onerror = reject;
          xhr.send();
        };
        if (wrap) Pace[wrap](send);
        else send();
      }),
    { ms, method, wrap, query, api, origin },
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
