/*! pace 2.0.0 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(factory);
  } else if (typeof exports === 'object') {
    module.exports = factory(require, exports, module);
  } else {
    root.Pace = factory();
  }
}(this, function(require, exports, module) {

/* globals window performance */

'use strict';

var _arguments3 = arguments;

var _get = function get(_x6, _x7, _x8) { var _again = true; _function: while (_again) { var object = _x6, property = _x7, receiver = _x8; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x6 = parent; _x7 = property; _x8 = receiver; _again = true; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var defaultOptions = {
  // How long should it take for the bar to animate to a new
  // point after receiving it
  catchupTime: 100,

  // How quickly should the bar be moving before it has any progress
  // info from a new source in %/ms
  initialRate: 0.03,

  // What is the minimum amount of time the bar should be on the
  // screen.  Irrespective of this number, the bar will always be on screen for
  // 33 * (100 / maxProgressPerFrame) + ghostTime ms.
  minTime: 250,

  // What is the minimum amount of time the bar should sit after the last
  // update before disappearing
  ghostTime: 100,

  // Its easy for a bunch of the bar to be eaten in the first few frames
  // before we know how much there is to load.  This limits how much of
  // the bar can be used per frame
  maxProgressPerFrame: 20,

  // This tweaks the animation easing
  easeFactor: 1.25,

  // Should pace automatically start when the page is loaded, or should it wait for `start` to
  // be called?  Always false if pace is loaded with AMD or CommonJS.
  startOnPageLoad: true,

  // Should we restart the browser when pushState or replaceState is called?  (Generally
  // means ajax navigation has occured)
  restartOnPushState: true,

  // Should we show the progress bar for every ajax request (not just regular or ajax-y page
  // navigation)? Set to false to disable.
  //
  // If so, how many ms does the request have to be running for before we show the progress?
  restartOnRequestAfter: 500,

  // What element should the pace element be appended to on the page?
  target: 'body',

  elements: {
    // How frequently in ms should we check for the elements being tested for
    // using the element monitor?
    checkInterval: 100,

    // What elements should we wait for before deciding the page is fully loaded (not required)
    selectors: ['body']
  },

  eventLag: {
    // When we first start measuring event lag, not much is going on in the browser yet, so it's
    // not uncommon for the numbers to be abnormally low for the first few samples.  This configures
    // how many samples we need before we consider a low number to mean completion.
    minSamples: 10,

    // How many samples should we average to decide what the current lag is?
    sampleCount: 3,

    // Above how many ms of lag is the CPU considered busy?
    lagThreshold: 3
  },

  ajax: {
    // Which HTTP methods should we track?
    trackMethods: ['GET'],

    // Should we track web socket connections?
    trackWebSockets: true,

    // A list of regular expressions or substrings of URLS we should ignore (for both tracking and restarting)
    ignoreURLs: []
  }
};

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now !== 'undefined') {
    return performance.now();
  }
  return +new Date();
}

var requestAnimationFrame = undefined;
var cancelAnimationFrame = undefined;
if (typeof window !== 'undefined') {
  requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
  cancelAnimationFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame;
}

if (typeof requestAnimationFrame === 'undefined') {
  requestAnimationFrame = function (fn) {
    return setTimeout(fn, 50);
  };
  cancelAnimationFrame = function (id) {
    return clearTimeout(id);
  };
}

var runAnimation = function runAnimation(fn) {
  var last = now();
  var tick = function tick() {
    var diff = now() - last;
    if (diff >= 33) {
      last = now(); // Don't run faster than 30 fps
      return fn(diff, function () {
        return requestAnimationFrame(tick);
      });
    }
    return setTimeout(tick, 33 - diff);
  };
  return tick();
};

function result(obj, key) {
  if (typeof obj[key] === 'function') {
    for (var _len = arguments.length, args = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
      args[_key - 2] = arguments[_key];
    }

    return obj[key].apply(obj, args);
  }
  return obj[key];
}

function extend(out) {
  for (var _len2 = arguments.length, sources = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
    sources[_key2 - 1] = arguments[_key2];
  }

  sources.forEach(function (source) {
    if (source) {
      for (var key in source) {
        if (({}).hasOwnProperty.call(source, key)) {
          var val = source[key];
          // NOTE: Checking for object may be sufficient...
          if (typeof out[key] !== 'undefined' && typeof out[key] === 'object' && typeof val !== 'undefined' && typeof val === 'object') {
            extend(out[key], val);
          } else {
            out[key] = val;
          }
        }
      }
    }
  });

  return out;
}

function extendNative(to, from) {
  var _loop = function (key) {
    try {
      if (typeof to[key] === 'undefined' && typeof from[key] !== 'function') {
        if (typeof Object.defineProperty === 'function') {
          Object.defineProperty(to, key, {
            get: function get() {
              return from.prototype[key];
            },
            configurable: true,
            enumerable: true
          });
        } else {
          to[key] = from.prototype[key];
        }
      }
    } catch (e) {}
  };

  for (var key in from.prototype) {
    _loop(key);
  }
}

function average(arr) {
  var sum = 0;
  var count = 0;
  arr.forEach(function (v) {
    sum += Math.abs(v);
    ++count;
  });
  return sum / count;
}

function getFromDOM() {
  var key = arguments[0] === undefined ? 'options' : arguments[0];
  var json = arguments[1] === undefined ? true : arguments[1];

  var el = document.querySelector('[data-pace-#{ key }]');

  if (!el) {
    return;
  }

  var data = el.getAttribute('data-pace-#{ key }');

  if (!json) {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch (e) {
    if (typeof console !== 'undefined') {
      console.error('Error parsing inline pace options', e);
    }
  }
}

var Evented = (function () {
  function Evented() {
    _classCallCheck(this, Evented);
  }

  _createClass(Evented, [{
    key: 'on',
    value: function on(event, handler, ctx) {
      var once = arguments[3] === undefined ? false : arguments[3];

      if (typeof this.bindings === 'undefined') {
        this.bindings = {};
      }
      if (typeof this.bindings[event] === 'undefined') {
        this.bindings[event] = [];
      }
      this.bindings[event].push({ handler: handler, ctx: ctx, once: once });
    }
  }, {
    key: 'once',
    value: function once(event, handler, ctx) {
      this.on(event, handler, ctx, true);
    }
  }, {
    key: 'off',
    value: function off(event, handler) {
      if (typeof this.bindings === 'undefined' && typeof this.bindings[event] === 'undefined') {
        return;
      }

      if (typeof handler === 'undefined') {
        delete this.bindings[event];
      } else {
        var i = 0;
        while (i < this.bindings[event].length) {
          if (this.bindings[event][i].handler === handler) {
            this.bindings[event].splice(i, 1);
          } else {
            ++i;
          }
        }
      }
    }
  }, {
    key: 'trigger',
    value: function trigger(event) {
      if (typeof this.bindings !== 'undefined' && this.bindings[event]) {
        var i = 0;
        while (i < this.bindings[event].length) {
          var _bindings$event$i = this.bindings[event][i];
          var handler = _bindings$event$i.handler;
          var ctx = _bindings$event$i.ctx;
          var once = _bindings$event$i.once;

          var context = typeof ctx !== 'undefined' ? ctx : this;

          for (var _len3 = arguments.length, args = Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
            args[_key3 - 1] = arguments[_key3];
          }

          handler.apply(context, args);

          if (once) {
            this.bindings[event].splice(i, 1);
          } else {
            ++i;
          }
        }
      }
    }
  }]);

  return Evented;
})();

var Pace = window.Pace || {};
window.Pace = Pace;

extend(Pace, Evented.prototype);

var options = Pace.options = extend({}, defaultOptions, window.paceOptions, getFromDOM());

['ajax', 'document', 'eventLag', 'elements'].forEach(function (source) {
  // true enables them without configuration, so we grab the config from the defaults
  if (options[source] === true) {
    options[source] = defaultOptions[source];
  }
});

var NoTargetError = (function (_Error) {
  function NoTargetError() {
    _classCallCheck(this, NoTargetError);

    _get(Object.getPrototypeOf(NoTargetError.prototype), 'constructor', this).apply(this, arguments);
  }

  _inherits(NoTargetError, _Error);

  return NoTargetError;
})(Error);

var Bar = (function () {
  function Bar(_options) {
    _classCallCheck(this, Bar);

    this.options = _options;
    this.progress = 0;
  }

  _createClass(Bar, [{
    key: 'getElement',
    value: function getElement() {
      if (typeof this.el === 'undefined') {
        var targetElement = document.querySelector(this.options.target);

        if (!targetElement) {
          throw new NoTargetError();
        }

        this.el = document.createElement('div');
        this.el.className = 'pace pace-active';

        document.body.className = document.body.className.replace(/pace-done/g, '');
        document.body.className += ' pace-running';

        this.el.innerHTML = ['<div class="pace-progress">', '<div class="pace-progress-inner"></div>', '</div>', '<div class="pace-activity"></div>'].join('');

        if (typeof targetElement.firstChild !== 'undefined') {
          targetElement.insertBefore(this.el, targetElement.firstChild);
        } else {
          targetElement.appendChild(this.el);
        }
      }

      return this.el;
    }
  }, {
    key: 'finish',
    value: function finish() {
      var el = this.getElement();

      el.className = el.className.replace('pace-active', '');
      el.className += ' pace-inactive';

      document.body.className = document.body.className.replace('pace-running', '');
      document.body.className += ' pace-done';
    }
  }, {
    key: 'update',
    value: function update(progress) {
      this.progress = progress;
      this.render();
    }
  }, {
    key: 'destroy',
    value: function destroy() {
      try {
        this.getElement().parentNode.removeChild(this.getElement());
      } catch (e) {
        if (e instanceof NoTargetError) {
          this.el = undefined;
        }
      }
    }
  }, {
    key: 'render',
    value: function render() {
      var target = document.querySelector(this.options.target);
      if (!target) {
        return false;
      }

      var el = this.getElement();

      var transform = 'translate3d(' + this.progress + '%, 0, 0)';
      ['webkitTransform', 'msTransform', 'transform'].forEach(function (key) {
        el.children[0].style[key] = transform;
      });

      if (!this.lastRenderedProgress || (this.lastRenderedProgress | 0) !== (this.progress | 0)) {
        // The whole-part of the number has changed
        el.children[0].setAttribute('data-progress-text', (this.progress | 0) + '%');

        var progressStr = undefined;
        if (this.progress >= 100) {
          // We cap it at 99 so we can use prefix-based attribute selectors
          progressStr = '99';
        } else {
          progressStr = this.progress < 10 ? '0' : '';
          progressStr += this.progress | 0;
        }

        el.children[0].setAttribute('data-progress', '' + progressStr);
      }

      this.lastRenderedProgress = this.progress;
    }
  }, {
    key: 'done',
    value: function done() {
      return this.progress >= 100;
    }
  }]);

  return Bar;
})();

var Events = (function () {
  function Events() {
    _classCallCheck(this, Events);

    this.bindings = {};
  }

  _createClass(Events, [{
    key: 'trigger',
    value: function trigger(name, val) {
      var _this = this;

      if (typeof this.bindings[name] !== 'undefined') {
        this.bindings[name].forEach(function (binding) {
          binding.call(_this, val);
        });
      }
    }
  }, {
    key: 'on',
    value: function on(name, fn) {
      if (typeof this.bindings[name] === 'undefined') {
        this.bindings[name] = [];
      }
      this.bindings[name].push(fn);
    }
  }]);

  return Events;
})();

var _XMLHttpRequest = window.XMLHttpRequest;
var _XDomainRequest = window.XDomainRequest;
var _WebSocket = window.WebSocket;

var ignoreStack = [];

Pace.ignore = function (fn) {
  for (var _len4 = arguments.length, args = Array(_len4 > 1 ? _len4 - 1 : 0), _key4 = 1; _key4 < _len4; _key4++) {
    args[_key4 - 1] = arguments[_key4];
  }

  ignoreStack.unshift('ignore');
  var ret = fn.apply(undefined, args);
  ignoreStack.shift();
  return ret;
};

Pace.track = function (fn) {
  for (var _len5 = arguments.length, args = Array(_len5 > 1 ? _len5 - 1 : 0), _key5 = 1; _key5 < _len5; _key5++) {
    args[_key5 - 1] = arguments[_key5];
  }

  ignoreStack.unshift('track');
  var ret = fn.apply(undefined, args);
  ignoreStack.shift();
  return ret;
};

var shouldTrack = function shouldTrack() {
  var method = arguments[0] === undefined ? 'GET' : arguments[0];

  if (ignoreStack[0] === 'track') {
    return 'force';
  }

  if (!ignoreStack.length && options.ajax) {
    if (method === 'socket' && options.ajax.trackWebSockets) {
      return true;
    } else if (method.toUpperCase() === options.ajax.trackMethods) {
      return true;
    }
  }

  return false;
};

// We should only ever instantiate one of these

var RequestIntercept = (function (_Events) {
  function RequestIntercept() {
    var _this2 = this,
        _arguments2 = arguments;

    _classCallCheck(this, RequestIntercept);

    _get(Object.getPrototypeOf(RequestIntercept.prototype), 'constructor', this).call(this);

    var trackWebSockets = options.ajax.trackWebSockets;

    var monitorXHR = function monitorXHR(req) {
      var _open = req.open;

      req.open = function (type, url, async) {
        if (shouldTrack(type)) {
          _this2.trigger('request', { type: type, url: url, request: req });
        }
        _open.apply(req, _arguments2);
      };
    };

    // XMLHttpRequest
    window.XMLHttpRequest = function (flags) {
      var req = new _XMLHttpRequest(flags);
      monitorXHR(req);
      return req;
    };

    try {
      extendNative(window.XMLHttpRequest, _XMLHttpRequest);
    } catch (e) {}

    // XDomainRequest
    if (typeof _XDomainRequest !== 'undefined') {
      window.XDomainRequest = function () {
        var req = new _XDomainRequest();
        monitorXHR(req);
        return req;
      };

      try {
        extendNative(window.XDomainRequest, _XDomainRequest);
      } catch (e) {}
    }

    // WebSocket
    if (typeof _WebSocket !== 'undefined' && trackWebSockets) {
      window.WebSocket = function (url, protocols) {
        var req = undefined;
        if (typeof protocols !== 'undefined') {
          req = new _WebSocket(url, protocols);
        } else {
          req = new _WebSocket(url);
        }

        if (shouldTrack('socket')) {
          _this2.trigger('request', {
            type: 'socket',
            url: url,
            protocols: protocols,
            request: req
          });
        }

        return req;
      };

      try {
        extendNative(window.WebSocket, _WebSocket);
      } catch (e) {}
    }
  }

  _inherits(RequestIntercept, _Events);

  return RequestIntercept;
})(Events);

var _intercept = null;
var getIntercept = function getIntercept() {
  if (!_intercept) {
    _intercept = new RequestIntercept();
  }
  return _intercept;
};

var shouldIgnoreURL = function shouldIgnoreURL(url) {
  options.ajax.ignoreURLs.forEach(function (pattern) {
    if (typeof pattern === 'string') {
      if (url.indexOf(pattern) !== -1) {
        return true;
      }
    } else {
      if (pattern.test(url)) {
        return true;
      }
    }
  });
  return false;
};

// If we want to start the progress bar
// on every request, we need to hear the request
// and then inject it into the new ajax monitor
// start will have created.

getIntercept().on('request', function (_ref) {
  var type = _ref.type;
  var request = _ref.request;
  var url = _ref.url;

  if (shouldIgnoreURL(url)) {
    return;
  }

  if (!Pace.running && (options.restartOnRequestAfter !== false || shouldTrack(type) === 'force')) {
    (function () {
      var args = _arguments3;

      var after = options.restartOnRequestAfter || 0;
      if (typeof after === 'boolean') {
        after = 0;
      }

      setTimeout(function () {
        var stillActive = undefined;
        if (type === 'socket') {
          stillActive = request.readyState < 2;
        } else {
          stillActive = request.readyState > 0 && request.readyState < 4;
        }

        if (stillActive) {
          Pace.restart();

          for (var i = 0; i < Pace.sources.length; ++i) {
            var source = Pace.sources[i];
            if (source instanceof AjaxMonitor) {
              source.watch.apply(source, _toConsumableArray(args));
              break;
            }
          }
        }
      }, after);
    })();
  }
});

var AjaxMonitor = (function () {
  function AjaxMonitor() {
    var _this3 = this,
        _arguments4 = arguments;

    _classCallCheck(this, AjaxMonitor);

    this.elements = [];
    getIntercept().on('request', function () {
      return _this3.watch.apply(_this3, _arguments4);
    });
  }

  _createClass(AjaxMonitor, [{
    key: 'watch',
    value: function watch(_ref2) {
      var type = _ref2.type;
      var request = _ref2.request;
      var url = _ref2.url;

      if (shouldIgnoreURL(url)) {
        return;
      }

      var tracker = undefined;
      if (type === 'socket') {
        tracker = new SocketRequestTracker(request);
      } else {
        tracker = new XHRRequestTracker(request);
      }

      this.elements.push(tracker);
    }
  }]);

  return AjaxMonitor;
})();

var XHRRequestTracker = function XHRRequestTracker(request) {
  var _this4 = this,
      _arguments5 = arguments;

  _classCallCheck(this, XHRRequestTracker);

  this.progress = 0;

  if (typeof window.ProgressEvent !== 'undefined') {
    // We're dealing with a modern browser with progress event support

    request.addEventListener('progress', function (evt) {
      if (evt.lengthComputable) {
        _this4.progress = 100 * evt.loaded / evt.total;
      } else {
        // If it's chunked encoding, we have no way of knowing the total length of the
        // response, all we can do is increment the progress with backoff such that we
        // never hit 100% until it's done.
        _this4.progress = _this4.progress + (100 - _this4.progress) / 2;
      }
    }, false);

    ['load', 'abort', 'timeout', 'error'].forEach(function (event) {
      request.addEventListener(event, function () {
        _this4.progress = 100;
      }, false);
    });
  } else {
    (function () {
      var _onreadystatechange = request.onreadystatechange;
      request.onreadystatechange = function () {
        if (request.readyState === 0 || request.readyState === 4) {
          _this4.progress = 100;
        } else if (request.readyState === 3) {
          _this4.progress = 50;
        }

        if (typeof _onreadystatechange !== 'undefined') {
          _onreadystatechange.apply(undefined, _arguments5);
        }
      };
    })();
  }
};

var SocketRequestTracker = function SocketRequestTracker(request) {
  var _this5 = this;

  _classCallCheck(this, SocketRequestTracker);

  this.progress = 0;

  ['error', 'open'].forEach(function (event) {
    request.addEventListener(event, function () {
      _this5.progress = 100;
    }, false);
  });
};

var ElementMonitor = function ElementMonitor() {
  var _this6 = this;

  var _options = arguments[0] === undefined ? {} : arguments[0];

  _classCallCheck(this, ElementMonitor);

  this.elements = [];

  if (typeof _options.selectors === 'undefined') {
    _options.selectors = [];
  }

  _options.selectors.forEach(function (selector) {
    _this6.elements.push(new ElementTracker(selector));
  });
};

var ElementTracker = (function () {
  function ElementTracker(selector) {
    _classCallCheck(this, ElementTracker);

    this.selector = selector;
    this.progress = 0;
    this.check();
  }

  _createClass(ElementTracker, [{
    key: 'check',
    value: function check() {
      var _this7 = this;

      if (document.querySelector(this.selector)) {
        this.done();
      } else {
        setTimeout(function () {
          _this7.check();
        }, options.elements.checkInterval);
      }
    }
  }, {
    key: 'done',
    value: function done() {
      this.progress = 100;
    }
  }]);

  return ElementTracker;
})();

var DocumentMonitor = function DocumentMonitor() {
  var _this8 = this,
      _arguments6 = arguments;

  _classCallCheck(this, DocumentMonitor);

  var states = {
    loading: 0,
    interactive: 50,
    complete: 100
  };

  this.progress = states[document.readyState] || 100;

  var _onreadystatechange = document.onreadystatechange;
  document.onreadystatechange = function () {
    if (typeof states[document.readyState] !== 'undefined') {
      _this8.progress = states[document.readyState];
    }

    if (typeof _onreadystatechange !== 'undefined') {
      _onreadystatechange.apply(undefined, _arguments6);
    }
  };
};

var EventLagMonitor = function EventLagMonitor() {
  var _this9 = this;

  _classCallCheck(this, EventLagMonitor);

  this.progress = 0;

  var avg = 0;
  var points = 0;
  var samples = [];

  var last = now();
  var interval = setInterval(function () {
    var diff = now() - last - 50;
    last = now();

    samples.push(diff);

    if (samples.length > options.eventLag.sampleCount) {
      samples.shift();
    }

    avg = average(samples);

    if (++points >= options.eventLag.minSamples && avg < options.eventLag.lagThreshold) {
      _this9.progress = 100;
      clearInterval(interval);
    } else {
      _this9.progress = 100 * (3 / (avg + 3));
    }
  }, 50);
};

var Scaler = (function () {
  function Scaler(source) {
    _classCallCheck(this, Scaler);

    this.source = source;
    this.last = this.sinceLastUpdate = 0;
    this.rate = options.initialRate;
    this.catchup = 0;
    this.progress = this.lastProgress = 0;

    if (typeof this.source !== 'undefined') {
      this.progress = result(this.source, 'progress');
    }
  }

  _createClass(Scaler, [{
    key: 'tick',
    value: function tick(frameTime, val) {
      if (typeof val === 'undefined') {
        val = result(this.source, 'progress');
      }

      if (val >= 100) {
        this.done = true;
      }

      if (val === this.last) {
        this.sinceLastUpdate += frameTime;
      } else {
        if (this.sinceLastUpdate) {
          this.rate = (val - this.last) / this.sinceLastUpdate;
        }

        this.catchup = (val - this.progress) / options.catchupTime;

        this.sinceLastUpdate = 0;
        this.last = val;
      }

      if (val > this.progress) {
        // After we've got a datapoint, we have catchupTime to
        // get the progress bar to reflect that new data
        this.progress += this.catchup * frameTime;
      }

      var scaling = 1 - Math.pow(this.progress / 100, options.easeFactor);

      // Based on the rate of the last update, we preemptively update
      // the progress bar, scaling it so it can never hit 100% until we
      // know it's done.
      this.progress += scaling * this.rate * frameTime;

      this.progress = Math.min(this.lastProgress + options.maxProgressPerFrame, this.progress);

      this.progress = Math.max(0, this.progress);
      this.progress = Math.min(100, this.progress);

      this.lastProgress = this.progress;

      return this.progress;
    }
  }]);

  return Scaler;
})();

var sources = null;
var scalers = null;
var bar = null;
var uniScaler = null;
var animation = null;
var cancelAnimation = null;
Pace.running = false;

var handlePushState = function handlePushState() {
  if (options.restartOnPushState) {
    Pace.restart();
  }
};

// We reset the bar whenever it looks like an ajax navigation has occured.
if (typeof window.history.pushState !== 'undefined') {
  (function () {
    var _pushState = window.history.pushState;
    window.history.pushState = function () {
      handlePushState();
      _pushState.apply(window.history, _arguments3);
    };
  })();
}

if (typeof window.history.replaceState !== 'undefined') {
  (function () {
    var _replaceState = window.history.replaceState;
    window.history.replaceState = function () {
      handlePushState();
      _replaceState.apply(window.history, _arguments3);
    };
  })();
}

var SOURCE_KEYS = {
  ajax: AjaxMonitor,
  elements: ElementMonitor,
  document: DocumentMonitor,
  eventLag: EventLagMonitor
};

var init = function init() {
  Pace.sources = sources = [];

  ['ajax', 'elements', 'document', 'eventLag'].forEach(function (type) {
    if (options[type] !== false) {
      sources.push(new SOURCE_KEYS[type](options[type]));
    }
  });

  var extraSources = options.extraSources;
  if (typeof extraSources === 'undefined') {
    extraSources = [];
  }

  extraSources.forEach(function (source) {
    sources.push(new source(options));
  });

  Pace.bar = bar = new Bar();

  // Each source of progress data has it's own scaler to smooth its output
  scalers = [];

  // We have an extra scaler for the final output to keep things looking nice as we add and
  // remove sources
  uniScaler = new Scaler();
};

init();

Pace.stop = function () {
  Pace.trigger('stop');
  Pace.running = false;

  bar.destroy();

  // Not all browsers support cancelAnimationFrame
  cancelAnimation = true;

  if (typeof animation !== 'undefined') {
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(animation);
    }
    animation = null;
  }

  init();
};

Pace.restart = function () {
  Pace.trigger('restart');
  Pace.stop();
  Pace.start();
};

Pace.go = function () {
  Pace.running = true;

  bar.render();

  var start = now();

  cancelAnimation = false;
  animation = runAnimation(function (frameTime, enqueueNextFrame) {
    // Every source gives us a progress number from 0 - 100
    // It's up to us to figure out how to turn that into a smoothly moving bar
    //
    // Their progress numbers can only increment.  We try to interpolate
    // between the numbers.

    var sum = 0;
    var count = sum;
    var done = true;
    // A source is composed of a bunch of elements, each with a raw, unscaled progress
    for (var i = 0; i < sources.length; ++i) {
      var source = sources[i];
      if (typeof scalers[i] === 'undefined') {
        scalers[i] = [];
      }
      var scalerList = scalers[i];
      var elements = typeof source.elements !== 'undefined' ? source.elements : [source];

      // Each element is given it's own scaler, which turns its value into something
      // smoothed for display
      for (var j = 0; j < elements.length; ++j) {
        var element = elements[j];
        if (typeof scalerList[j] === 'undefined') {
          scalerList[j] = new Scaler(element);
        }
        var scaler = scalerList[j];

        done &= scaler.done;

        if (scaler.done) {
          continue;
        }

        count++;
        sum += scaler.tick(frameTime);
      }
    }

    var avg = sum / count;

    bar.update(uniScaler.tick(frameTime, avg));

    if (bar.done() || done || cancelAnimation) {
      bar.update(100);

      Pace.trigger('done');

      setTimeout(function () {
        bar.finish();
        Pace.running = false;
        Pace.trigger('hide');
      }, Math.max(options.ghostTime, Math.max(options.minTime - (now() - start), 0)));
    } else {
      enqueueNextFrame();
    }
  });
};

Pace.start = function (_options) {
  extend(options, _options);

  Pace.running = true;

  try {
    bar.render();
  } catch (e) {
    if (e instanceof NoTargetError) {}
  }

  // It's usually possible to render a bit before the document declares itself ready
  if (!document.querySelector('.pace')) {
    setTimeout(Pace.start, 50);
  } else {
    Pace.trigger('start');
    Pace.go();
  }
};

if (options.startOnPageLoad) {
  Pace.start();
}

// Handle error...
return Pace;

}));
