pace
====

Include [pace.js](https://raw.github.com/HubSpot/pace/v0.4.3/pace.min.js) and the 
[theme](http://github.hubspot.com/pace/docs/themes/) css of your choice on your page
(as early as is possible), and you're done!

Pace will automatically monitor your ajax requests, event loop lag, document
ready state, and elements on your page to decide the progress.  On ajax navigation
it will begin again!

If you use AMD or Browserify, require in pace.js and call `pace.start()` as early in
the loading process as is possible.

### [Demo](http://github.hubspot.com/pace/docs/welcome/)
### [Documentation](http://github.hubspot.com/pace/)
