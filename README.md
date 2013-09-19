pace
====

Automatic page load progress bar

Include pace.js and pace.css on your page (as early as is possible), and you're done!

If you use AMD or Browserify, require in pace.js and call `pace.start()` as early in
the loading process as is possible.

Configuration
-------------

Pace is fully automatic, no configuration is necessary.  If you do need to make some tweaks, here's
how:

You can set `Pace.options` before bringing in the file:

```javascript
Pace = {
  options: {
    // Disable the 'elements' source
    elements: false
  }
}
```

You can also put options on the script tag:

```html
<script data-pace-options='{ "ajax": false }' src='pace.js'></script>
```

If you're using AMD or Browserify, you can pass your options to `start`:

```javascript
define(['pace'], function(pace){
  pace.start({
    document: false
  });
});
```

Collectors
----------

Pace includes four default collectors:

- Ajax

  Monitors all ajax requests on the page

- Elements
  
  Checks for the existance of specific elements on the page

- Document

  Checks the document readyState

- Event Lag

  Checks for event loop lag signaling that javascript is being executed

They can each be configured or disabled through configuration options of the same name.

```javascript
Pace = {
  options: {
    ajax: false, // disabled
    document: false, // disabled
    eventLag: false, // disabled
    elements: {
      sources: ['.my-page']
    }
  }
}
```

Add your own instances to `options.extraSources` to add more sources.  Each source should either
have a `.progress` property, or a `.elements` property which is a list of objects with
`.progress` properties.  Pace will automatically handle all scaling to make the progress
changes look smooth to the user.

Restart Rules
-------------

Most users want the progress bar to automatically restart when a pushState event occurs
(generally means ajax navigation is occuring).  You can disable this:

```javascript
Pace = {
  options: {
    restartOnPushState: false
  }
}
```

You can always trigger a restart manually by calling `Pace.restart()`

See [the source](pace.coffee) for a full list of all options.

API
---

Pace exposes the following methods:

- `Pace.start`

Show the progress bar and start updating.  Called automatically if you don't use AMD or CommonJS.

- `Pace.restart`

Show the progress bar if it's hidden and start reporting the progress from scratch.  Called automatically
whenever `pushState` or `replaceState` is called by default.

- `Pace.stop`

Hide the progress bar and stop updating it.

Dependencies
------------

None!

Support
-------

Pace is designed to support IE8+ (standards mode), FF 3.5+, Chrome, Safari 4+, Opera 10.5+, and all modern
mobile browsers.  If you run into a compatibility issue, or can make a case for supporting something else,
please create an issue.

Issues
------

We have obviously not tested this on every website.  If you run into an issue, or find a way the automatic
detection could be better, please create an Issue.  If you can include a test case, that's even better.
