PACE
====
[![Latest Release](https://img.shields.io/github/v/tag/CodeByZach/pace?label=release&sort=semver)](https://github.com/CodeByZach/pace/releases/latest) [![jsDelivr hits (npm)](https://img.shields.io/jsdelivr/npm/hm/pace-js?color=%23ff5627)](https://www.jsdelivr.com/package/npm/pace-js) [![Stars](https://img.shields.io/github/stars/CodeByZach/pace.svg)](https://github.com/CodeByZach/pace) [![Forks](https://img.shields.io/github/forks/CodeByZach/pace.svg)](https://github.com/CodeByZach/pace/network/members) [![License](https://img.shields.io/github/license/CodeByZach/pace.svg)](LICENSE)

An automatic web page progress bar.

### [Demo](https://codebyzach.github.io/pace/)

Include [pace.js](https://cdn.jsdelivr.net/npm/pace-js@1/pace.min.js) and the
[theme](https://codebyzach.github.io/pace/) css of your choice on your page
(as early as possible), and you're done!

Pace will automatically monitor your ajax requests, event loop lag, document
ready state, and elements on your page to decide the progress. On ajax navigation
it will begin again!

If you use AMD or Browserify, require pace.js and call `Pace.start()` as early in the loading process as possible.

Example
-------

```html
<head>
  <script src="https://cdn.jsdelivr.net/npm/pace-js@1/pace.min.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pace-js@1/pace-theme-default.min.css">
</head>
```

Configuration
-------------

Pace is fully automatic, no configuration is necessary to get started.

If you would like to make some tweaks, here's how:

You can set `window.paceOptions` before bringing in the file:

```javascript
paceOptions = {
  // Don't wait for any elements to appear
  waitFor: [],

  // Only show the progress on regular and ajax-y page navigation,
  // not every request
  restartOnRequestAfter: false
}
```

You can also put options on Pace's own script tag (the value must be valid JSON). They apply after `window.paceOptions`:

```html
<script data-pace-options='{ "trackXHR": false }' src="https://cdn.jsdelivr.net/npm/pace-js@1/pace.min.js"></script>
```

To change settings later, call `Pace.configure({ ... })`; `Pace.start({ ... })` does the same, then starts. Settings
about requests and navigation (`restartOnNavigation`, `restartOnRequestAfter`, `trackXHR`, `trackFetch`,
`trackWebSockets`, `requestMethods`, `ignoreRequests` and `maxWait`) apply from the next request or navigation; the
others from the next time the bar starts, so a bar that is showing doesn't change halfway. `Pace.getOptions()` returns a
copy of the settings in use.

A wrong value or an unknown name is ignored, and the console shows a warning (once) that says what Pace expected. Pace
never throws because of a wrong value.

| Setting | Default | What it does |
|---|---|---|
| `startOnPageLoad` | `true` | Show the bar while the page loads. With a bundler, call `Pace.start()` instead. |
| `restartOnNavigation` | `true` | Restart when the page calls `history.pushState` or `replaceState`. |
| `restartOnRequestAfter` | `500` | Restart for a tracked request still running after this many milliseconds; `false` to never. |
| `target` | `'body'` | A selector for the element the bar is added to. |
| `className` | `''` | Class names added to the bar's `.pace-progress` element. |
| `trackDocument` | `true` | Wait for the document to load. |
| `trackEventLag` | `true` | Wait until the page's scripts stop keeping it busy. |
| `waitFor` | `['body']` | Selectors that must each match an element; `[]` to not wait for any. |
| `trackXHR` | `true` | Track `XMLHttpRequest` requests. |
| `trackFetch` | `true` | Track `fetch()` requests. |
| `trackWebSockets` | `true` | Track WebSocket connections until they open. |
| `requestMethods` | `['GET']` | The methods of the requests to track, in any case. |
| `ignoreRequests` | `[]` | URL patterns (non-empty strings and regular expressions) of requests not to track. |
| `maxWait` | `15000` | The longest Pace waits for one request, in milliseconds; `false` for no limit. |
| `minVisible` | `250` | The shortest time the bar is shown, in milliseconds. |
| `hideDelay` | `100` | How long the full bar stays before it's hidden, in milliseconds. |
| `catchupTime` | `100` | About how many milliseconds the bar takes to catch up when the progress jumps. |
| `initialRate` | `0.03` | How fast the bar moves before any progress is known, in percent per millisecond. |
| `maxProgressPerFrame` | `20` | The most the bar moves in one frame, in percent. |
| `easeFactor` | `1.25` | How the bar slows down as it fills; higher values slow it later. |
| `extraSources` | `[]` | Your own progress sources, see Collectors below. |

If you load pace with a bundler or module loader (AMD or CommonJS), it doesn't start on its own:
set `window.paceOptions` before pace loads, then call `Pace.start()`. `import` statements run
before the rest of a file, so put the options in their own file and import it first:

```javascript
// pace-options.js
window.paceOptions = {
  trackDocument: false
};
```

```javascript
// your entry file
import './pace-options.js';
import Pace from 'pace-js';

Pace.start();
```

With RequireJS, set `window.paceOptions` in a `<script>` before calling `require(['pace'], ...)`.

Themes
------

Pace includes a bunch of [themes](https://codebyzach.github.io/pace/)
to get you started. Just include the appropriate css file. Send us a PR with
any interesting themes you create.

If you have minor styling changes and don't want to extend theme css, you can add custom class names to
the progress bar using the "className" option:

```javascript
paceOptions = {
  className: 'my-custom-class'
}
```

Collectors
----------

Collectors are the bits of code which gather progress information. Pace includes four default collectors:

- Ajax

  Monitors ajax requests (XMLHttpRequest, fetch and WebSocket) on the page. Only `GET` requests are tracked by default, see Tracking below

- Elements

  Checks for the existence of specific elements on the page

- Document

  Checks the document readyState

- Event Lag

  Checks for event loop lag signaling that javascript is being executed

They can each be configured or disabled through settings:

```javascript
paceOptions = {
  trackXHR: false, // disabled
  trackFetch: false, // disabled
  trackWebSockets: false, // disabled
  trackDocument: false, // disabled
  trackEventLag: false, // disabled
  waitFor: ['.my-page']
};
```

Add your own classes to `paceOptions.extraSources` to add more sources. Each source should either
have a `.progress` property, or a `.elements` property which is a list of objects with
`.progress` properties. Pace will automatically handle all scaling to make the progress
changes look smooth to the user.

Elements
--------

Elements being rendered to the screen is one way for us to decide that the page has been
rendered. If you would like to use that source of information (not required at all),
specify one or more selectors. You can comma separate the selectors to properly handle
error states, where the progress bar should disappear, but the element we are looking for
may never appear:

```javascript
paceOptions = {
  waitFor: ['.timeline, .timeline-error', '.user-profile, .profile-error']
}
```

Pace will consider the elements test successful when each selector matches something (it checks every 100 ms). For
this example, when either `.timeline` or `.timeline-error` exist, and either `.user-profile`
or `.profile-error` exist.

Restart Rules
-------------

Most users want the progress bar to automatically restart when a pushState event occurs
(generally means ajax navigation is occuring). You can disable this:

```javascript
paceOptions = {
  restartOnNavigation: false
}
```

This also covers links whose scripts change the URL with `history.pushState` or `replaceState`
(some tab, accordion and scrollspy plugins do).

Pace also restarts for any tracked ajax request that is still running after `restartOnRequestAfter`
milliseconds (500 by default). Set a different number, or `false` to turn this off if you make ajax
requests the user doesn't need to know about, like precaching:

```javascript
paceOptions = {
  restartOnRequestAfter: false
}
```

You can always trigger a restart manually by calling `Pace.restart()`

API
---

Pace exposes the following methods:

- `Pace.start`: Show the progress bar and start updating. Called automatically if you don't use AMD or CommonJS.
While a run is in progress (not yet `done`), it doesn't restart it; the options it's given apply as described in
Configuration above.

- `Pace.configure`: Change settings without starting the bar, see Configuration above.

- `Pace.getOptions`: A copy of the settings in use.

- `Pace.restart`: Show the progress bar if it's hidden and start reporting the progress from scratch. Called automatically
whenever `pushState` or `replaceState` is called by default.

- `Pace.stop`: Remove the progress bar and stop updating it, without firing `done` or `hide`. `<body>` gets `pace-done`.

- `Pace.track`: Explicitly track one or more requests, see Tracking below

- `Pace.ignore`: Explicitly ignore one or more requests, see Tracking below

And these properties:

- `Pace.running`: Whether a run is in progress, from `Pace.start()` until the bar is hidden or `Pace.stop()`. Read-only:
assigning to it does nothing, or throws a TypeError in strict-mode code such as modules.

- `Pace.version`: The version of pace.js, such as `'2.0.0'`.

If a page loads pace.js again after it's already there (a second script tag or bundle, or after Pace 1.x), the later
copy only logs a warning and the first one keeps running. Pace 1.x loaded after this version can't tell, so load only
one copy.

Events
------

Pace fires the following events:

- `start`: When pace is initially started, or as a part of a restart
- `stop`: When pace is manually stopped, or as a part of a restart
- `restart`: When pace is restarted (manually, or by a new AJAX request)
- `progress`: On every frame while the bar is running, with the current progress (0–100)
- `done`: When pace is finished
- `hide`: When the pace is hidden (can be later than `done`, based on `hideDelay` and `minVisible`)

You can bind onto events using the `on`, `off` and `once` methods:

- `Pace.on(event, handler, [context])`: Call `handler` (optionally with context) when `event` is triggered
- `Pace.off(event, [handler])`: Unbind `handler` from `event`, or every handler of `event` if `handler` is left out.
- `Pace.once(event, handler, [context])`: Bind `handler` to the next (and only the next) incidence of `event`

If a handler throws, the error is reported like an uncaught error (in the console and to `window.onerror`), and Pace
and the other handlers carry on.

Tracking
--------

By default, Pace will show any ajax requests which begin as a part of a normal or ajax-y page load, or which last longer than
500ms.

Only `GET` requests are tracked by default. To also show the bar for other methods, such as form saves sent with `POST`:

```javascript
paceOptions = {
  requestMethods: ['GET', 'POST']
}
```

`fetch()` requests are tracked the same way, until their response arrives: Pace can't see a response's body load
without reading it. To stop tracking them, set `trackFetch: false`.

Pace waits for each request at most `maxWait` milliseconds after it's sent (15000 by default), so a request that never
finishes can't hold the bar forever. The request itself keeps going. Set a different number (up to 2147483647, about 24
days), or `false` to wait for every request until it ends:

```javascript
paceOptions = {
  maxWait: 30000
}
```

You can disable all ajax tracking by turning off each kind of request:

```javascript
paceOptions = {
  trackXHR: false,
  trackFetch: false,
  trackWebSockets: false
}
```

You can disable ajax tracking except on page navigation by setting `restartOnRequestAfter` to false:

```javascript
paceOptions = {
  restartOnRequestAfter: false
}
```

You can manually disable tracking for a specific request or requests by triggering them within a `Pace.ignore` callback:

```javascript
Pace.ignore(function() {
  $.ajax(...)
});
```

You can force the progress bar to be shown for a specific request by triggering them within a `Pace.track` callback:

```javascript
Pace.track(function() {
  $.ajax(...)
});
```

Both only affect requests opened directly inside the callback, not ones started later (for example from a timer or a promise).

You can also ignore URLs based on a pattern:

```javascript
paceOptions = {
  ignoreRequests: ['some-substring', /some-regexp/]
}
```

A string matches any ajax request URL that contains it (case-sensitive); a regular expression is tested against
the URL. Patterns see the URL as the page wrote it, the full URL (such as `https://example.com/api/items?page=2`), and for
requests to the page's own origin (same protocol, domain and port) the part after it (`/api/items?page=2`), so a
pattern matches however the request's URL was written. They only apply to ajax requests, not to links, images or other
resources on the page.

Requests a page keeps open on purpose, such as long polling for chat or live updates, show the bar each time one
starts, and so do slow requests a page makes in the background, such as prefetching links. Add their URLs to
`ignoreRequests`.

WebSocket connections are tracked too. To stop that, set `trackWebSockets: false`. While `trackXHR`, `trackFetch` or
`trackWebSockets` is false, Pace doesn't track that kind of request, not even inside `Pace.track`, and until Pace has started
with it on, Pace leaves `XMLHttpRequest`, `fetch` or `WebSocket` alone.

A few things Pace can't track:

- Requests sent with `async: false` block the page until they finish, so the bar can't animate during them.
- Downloads started by a plain link aren't ajax requests.
- Requests sent before Pace first starts. When it doesn't start on page load (`startOnPageLoad: false`, or with a
  bundler), call `Pace.start()` early.
- Requests made through a library that replaces `window.XMLHttpRequest` with its own version (such as xhook), if that
  library loads before Pace. Load Pace first.
- `fetch()` calls made through a copy of `fetch` that a library saved before Pace started.

Avoid calling `Pace.restart()` for every request, for example from jQuery's `ajaxStart`. It restarts the bar even for
ignored requests, and parallel requests restart it several times. To show the bar for `POST` requests, add `POST` to
`requestMethods` as shown above.

Dependencies
------------

None!

Support
-------

Pace supports Chrome and Edge 96+, Firefox 95+, Safari 15.2+ on macOS and iOS, Opera 82+, Samsung
Internet 17+, and other browsers built on Chromium 96 or later. For older browsers, use pace-js 1.x.

In tests that run on jsdom, turn on its `pretendToBeVisual` option (Jest and Vitest already do): without
it, jsdom has no `requestAnimationFrame`.

If you run into a compatibility issue, please create an issue.

Size
----

pace.min.js is about 4 kB gzipped. The themes are between 0.2 and 3.2 kB gzipped.

Issues
------

We have obviously not tested this on every website. If you run into an issue, or find a way the automatic
detection could be better, please [create an Issue](https://github.com/CodeByZach/pace/issues/new). If you can include a test case, that's even better.

Credits
-------

[HubSpot](http://dev.hubspot.com)

[Zachary Miller](https://github.com/CodeByZach)

Javascript by [Zack Bloom](http://twitter.com/zackbloom)
CSS by [Adam Schwartz](http://twitter.com/adamfschwartz)

Themes inspired by [Mary Lou](http://tympanus.net/codrops/2013/09/18/creative-loading-effects/)

Project inspired by [nprogress](http://ricostacruz.com/nprogress/)
