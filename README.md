pace
====

An automatic web page progress bar.

Include pace.js and a CSS theme of your choice to your page and you are done!

Pace will automatically monitor your Ajax requests, event loop lag, document ready state and elements on your page to decide on the progress.

If you use AMD or Browserify, require pace.js and call `pace.start()` as early in the loading process as is possible.

### Demo

You can see a [live demo here](http://github.hubspot.com/pace/docs/welcome/)

### Documentation

You can find [all relevant documentation here](http://github.hubspot.com/pace/)

### Example

```html
<head>
  <script src="/pace/pace.js"></script>
  <link href="/pace/themes/pace-theme-barber-shop.css" rel="stylesheet" />
</head>
```