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
  // Disable the 'elements' source
  elements: false,

  // Only show the progress on regular and ajax-y page navigation,
  // not every request
  restartOnRequestAfter: false
}
```

You can also put options on the script tag (the value must be valid JSON):

```html
<script data-pace-options='{ "ajax": false }' src="https://cdn.jsdelivr.net/npm/pace-js@1/pace.min.js"></script>
```

Pace reads its options once, when pace.js loads, so set them before including it.
Assigning `Pace.options` afterwards has no effect.

If you load pace with a bundler or module loader (AMD or CommonJS), it doesn't start on its own:
set `window.paceOptions` before pace loads, then call `Pace.start()`. `import` statements run
before the rest of a file, so put the options in their own file and import it first:

```javascript
// pace-options.js
window.paceOptions = {
  document: false
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

  Monitors ajax requests (XMLHttpRequest and WebSocket) on the page. Only `GET` requests are tracked by default, see Tracking below

- Elements

  Checks for the existence of specific elements on the page

- Document

  Checks the document readyState

- Event Lag

  Checks for event loop lag signaling that javascript is being executed

They can each be configured or disabled through configuration options of the same name.

```javascript
paceOptions = {
  ajax: false, // disabled
  document: false, // disabled
  eventLag: false, // disabled
  elements: {
    selectors: ['.my-page']
  }
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
  elements: {
    selectors: ['.timeline, .timeline-error', '.user-profile, .profile-error']
  }
}
```

Pace will consider the elements test successful when each selector matches something. For
this example, when either `.timeline` or `.timeline-error` exist, and either `.user-profile`
or `.profile-error` exist.

Restart Rules
-------------

Most users want the progress bar to automatically restart when a pushState event occurs
(generally means ajax navigation is occuring). You can disable this:

```javascript
paceOptions = {
  restartOnPushState: false
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

See [the source](https://github.com/CodeByZach/pace/blob/master/pace.js) for a full list of options.

API
---

Pace exposes the following methods:

- `Pace.start`: Show the progress bar and start updating. Called automatically if you don't use AMD or CommonJS.

- `Pace.restart`: Show the progress bar if it's hidden and start reporting the progress from scratch. Called automatically
whenever `pushState` or `replaceState` is called by default.

- `Pace.stop`: Hide the progress bar and stop updating it.

- `Pace.track`: Explicitly track one or more requests, see Tracking below

- `Pace.ignore`: Explicitly ignore one or more requests, see Tracking below

Events
------

Pace fires the following events:

- `start`: When pace is initially started, or as a part of a restart
- `stop`: When pace is manually stopped, or as a part of a restart
- `restart`: When pace is restarted (manually, or by a new AJAX request)
- `progress`: On every frame while the bar is running, with the current progress (0–100)
- `done`: When pace is finished
- `hide`: When the pace is hidden (can be later than `done`, based on `ghostTime` and `minTime`)

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
  ajax: {
    trackMethods: ['GET', 'POST']
  }
}
```

You can disable all ajax tracking by setting `ajax` to false:

```javascript
paceOptions = {
  ajax: false
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
  ajax: {
    ignoreURLs: ['some-substring', /some-regexp/]
  }
}
```

A string matches any ajax request URL that contains it (case-sensitive); a regular expression is tested against
the URL. These patterns only apply to ajax requests, not to links, images or other resources on the page.

WebSocket connections are tracked too. To stop that, set `trackWebSockets: false` inside `ajax`.

A few things Pace can't track:

- Requests sent with `async: false` block the page until they finish, so the bar can't animate during them.
- Downloads started by a plain link aren't ajax requests.

Avoid calling `Pace.restart()` for every request, for example from jQuery's `ajaxStart`. It restarts the bar even for
ignored requests, and parallel requests restart it several times. To show the bar for `POST` requests, add `POST` to
`trackMethods` as shown above.

Dependencies
------------

None!

Support
-------

Pace supports Chrome and Edge 96+, Firefox 95+, and Safari 15.2+ on macOS and iOS, plus browsers built
on the same engines, such as Opera and Samsung Internet. For older browsers, use pace-js 1.x.

If you run into a compatibility issue, please create an issue.

Size
----

pace.min.js is under 4 kB gzipped. The themes are between 0.2 and 3.2 kB gzipped.

Issues
------

We have obviously not tested this on every website. If you run into an issue, or find a way the automatic
detection could be better, please [create an Issue](https://github.com/CodeByZach/pace/issues/new). If you can include a test case, that's even better.

Credits
-------

[HubSpot](http://dev.hubspot.com)

[CodeByZach](https://github.com/CodeByZach)

Javascript by [Zack Bloom](http://twitter.com/zackbloom)
CSS by [Adam Schwartz](http://twitter.com/adamfschwartz)

Themes inspired by [Mary Lou](http://tympanus.net/codrops/2013/09/18/creative-loading-effects/)

Project inspired by [nprogress](http://ricostacruz.com/nprogress/)
