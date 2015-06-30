/* globals window performance */

const defaultOptions = {
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
  if (typeof performance !== 'undefined' &&
      typeof performance.now !== 'undefined') {
    return performance.now();
  }
  return +new Date();
}

let requestAnimationFrame;
let cancelAnimationFrame;
if (typeof window !== 'undefined') {
  requestAnimationFrame = (
    window.requestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.msRequestAnimationFrame
  );
  cancelAnimationFrame = (
    window.cancelAnimationFrame ||
    window.mozCancelAnimationFrame
  );
}

if (typeof requestAnimationFrame === 'undefined') {
  requestAnimationFrame = (fn) => setTimeout(fn, 50);
  cancelAnimationFrame = (id) => clearTimeout(id);
}

const runAnimation = (fn) => {
  let last = now();
  const tick = () => {
    const diff = now() - last;
    if (diff >= 33) {
      last = now(); // Don't run faster than 30 fps
      return fn(diff, () => requestAnimationFrame(tick));
    }
    return setTimeout(tick, (33 - diff));
  };
  return tick();
};

function result(obj, key, ...args) {
  if (typeof obj[key] === 'function') {
    return obj[key](...args);
  }
  return obj[key];
}

function extend(out, ...sources) {
  sources.forEach(source => {
    if (source) {
      for (let key in source) {
        if ({}.hasOwnProperty.call(source, key)) {
          const val = source[key];
          // NOTE: Checking for object may be sufficient...
          if (typeof out[key] !== 'undefined' &&
              typeof out[key] === 'object' &&
              typeof val !== 'undefined' &&
              typeof val === 'object') {
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
  for (let key in from.prototype) {
    try {
      if (typeof to[key] === 'undefined' &&
          typeof from[key] !== 'function') {
        if (typeof Object.defineProperty === 'function') {
          Object.defineProperty(to, key, {
            get() {
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
  }
}

function average(arr) {
  let sum = 0;
  let count = 0;
  arr.forEach(v => {
    sum += Math.abs(v);
    ++count;
  });
  return sum / count;
}

function getFromDOM(key='options', json=true) {
  const el = document.querySelector("[data-pace-#{ key }]");

  if (!el) {
    return;
  }

  const data = el.getAttribute("data-pace-#{ key }");

  if (!json) {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch (e) {
    if (typeof console !== 'undefined') {
      console.error("Error parsing inline pace options", e);
    }
  }
}

class Evented {
  on(event, handler, ctx, once=false) {
    if (typeof this.bindings === 'undefined') {
      this.bindings = {};
    }
    if (typeof this.bindings[event] === 'undefined') {
      this.bindings[event] = [];
    }
    this.bindings[event].push({handler, ctx, once});
  }

  once(event, handler, ctx) {
    this.on(event, handler, ctx, true);
  }

  off(event, handler) {
    if (typeof this.bindings === 'undefined' &&
        typeof this.bindings[event] === 'undefined') {
      return;
    }

    if (typeof handler === 'undefined') {
      delete this.bindings[event];
    } else {
      let i = 0;
      while (i < this.bindings[event].length) {
        if (this.bindings[event][i].handler === handler) {
          this.bindings[event].splice(i, 1);
        } else {
          ++i;
        }
      }
    }
  }

  trigger(event, ...args) {
    if (typeof this.bindings !== 'undefined' && this.bindings[event]) {
      let i = 0;
      while (i < this.bindings[event].length) {
        const {handler, ctx, once} = this.bindings[event][i];
        const context = typeof ctx !== 'undefined' ? ctx : this;

        handler.apply(context, args);

        if (once) {
          this.bindings[event].splice(i, 1);
        } else {
          ++i;
        }
      }
    }
  }
}

const Pace = window.Pace || {};
window.Pace = Pace;

extend(Pace, Evented.prototype);

const options = Pace.options = extend({}, defaultOptions, window.paceOptions, getFromDOM());

['ajax', 'document', 'eventLag', 'elements'].forEach(source => {
  // true enables them without configuration, so we grab the config from the defaults
  if (options[source] === true) {
    options[source] = defaultOptions[source];
  }
});

class NoTargetError extends Error {}

class Bar {
  constructor(_options) {
    this.options = _options;
    this.progress = 0;
  }

  getElement() {
    if (typeof this.el === 'undefined') {
      const targetElement = document.querySelector(this.options.target);

      if (!targetElement) {
        throw new NoTargetError();
      }

      this.el = document.createElement('div');
      this.el.className = "pace pace-active";

      document.body.className = document.body.className.replace(/pace-done/g, '');
      document.body.className += ' pace-running';

      this.el.innerHTML = [
        '<div class="pace-progress">',
          '<div class="pace-progress-inner"></div>',
        '</div>',
        '<div class="pace-activity"></div>'
      ].join('');

      if (typeof targetElement.firstChild !== 'undefined') {
        targetElement.insertBefore(this.el, targetElement.firstChild);
      } else {
        targetElement.appendChild(this.el);
      }
    }

    return this.el;
  }

  finish() {
    const el = this.getElement();

    el.className = el.className.replace('pace-active', '');
    el.className += ' pace-inactive';

    document.body.className = document.body.className.replace('pace-running', '');
    document.body.className += ' pace-done';
  }

  update(progress) {
    this.progress = progress;
    this.render();
  }

  destroy() {
    try {
      this.getElement().parentNode.removeChild(this.getElement());
    } catch (e) {
      if (e instanceof NoTargetError) {
        this.el = undefined;
      }
    }
  }

  render() {
    const target = document.querySelector(this.options.target);
    if (!target) {
      return false;
    }

    const el = this.getElement();

    const transform = `translate3d(${this.progress}%, 0, 0)`;
    ['webkitTransform', 'msTransform', 'transform'].forEach(key => {
      el.children[0].style[key] = transform;
    });

    if (!this.lastRenderedProgress || (this.lastRenderedProgress | 0) !== (this.progress | 0)) {
      // The whole-part of the number has changed
      el.children[0].setAttribute('data-progress-text', `${this.progress | 0}%`);

      let progressStr;
      if (this.progress >= 100) {
        // We cap it at 99 so we can use prefix-based attribute selectors
        progressStr = '99';
      } else {
        progressStr = this.progress < 10 ? '0' : '';
        progressStr += this.progress | 0;
      }

      el.children[0].setAttribute('data-progress', `${progressStr}`);
    }

    this.lastRenderedProgress = this.progress;
  }

  done() {
    return this.progress >= 100;
  }
}

class Events {
  constructor() {
    this.bindings = {};
  }

  trigger(name, val) {
    if (typeof this.bindings[name] !== 'undefined') {
      this.bindings[name].forEach(binding => {
        binding.call(this, val);
      });
    }
  }

  on(name, fn) {
    if (typeof this.bindings[name] === 'undefined') {
      this.bindings[name] = [];
    }
    this.bindings[name].push(fn);
  }
}

const {
  XMLHttpRequest: _XMLHttpRequest,
  XDomainRequest: _XDomainRequest,
  WebSocket: _WebSocket
} = window;


const ignoreStack = [];

Pace.ignore = (fn, ...args) => {
  ignoreStack.unshift('ignore');
  const ret = fn(...args);
  ignoreStack.shift();
  return ret;
};

Pace.track = (fn, ...args) => {
  ignoreStack.unshift('track');
  const ret = fn(...args);
  ignoreStack.shift();
  return ret;
};

const shouldTrack = (method='GET') => {
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
class RequestIntercept extends Events {
  constructor() {
    super();

    const {trackWebSockets} = options.ajax;

    const monitorXHR = (req) => {
      const {open: _open} = req;
      req.open = (type, url, async) => {
        if (shouldTrack(type)) {
          this.trigger('request', {type, url, request: req});
        }
        _open.apply(req, arguments);
      };
    };

    // XMLHttpRequest
    window.XMLHttpRequest = (flags) => {
      const req = new _XMLHttpRequest(flags);
      monitorXHR(req);
      return req;
    };

    try {
      extendNative(window.XMLHttpRequest, _XMLHttpRequest);
    } catch(e) {}

    // XDomainRequest
    if (typeof _XDomainRequest !== 'undefined') {
      window.XDomainRequest = () => {
        const req = new _XDomainRequest;
        monitorXHR(req);
        return req;
      };

      try {
        extendNative(window.XDomainRequest, _XDomainRequest);
      } catch(e) {}
    }

    // WebSocket
    if (typeof _WebSocket !== 'undefined' && trackWebSockets) {
      window.WebSocket = (url, protocols) => {
        let req;
        if (typeof protocols !== 'undefined') {
          req = new _WebSocket(url, protocols);
        } else {
          req = new _WebSocket(url);
        }

        if (shouldTrack('socket')) {
          this.trigger('request', {
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
      } catch(e) {}
    }

  }
}

let _intercept = null;
const getIntercept = () => {
  if (!_intercept) {
    _intercept = new RequestIntercept();
  }
  return _intercept;
};

const shouldIgnoreURL = (url) => {
  options.ajax.ignoreURLs.forEach(pattern => {
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

getIntercept().on('request', ({type, request, url}) => {
  if (shouldIgnoreURL(url)) {
    return;
  }

  if (!Pace.running && (options.restartOnRequestAfter !== false || shouldTrack(type) === 'force')) {
    const args = arguments;

    let after = options.restartOnRequestAfter || 0;
    if (typeof after === 'boolean') {
      after = 0;
    }

    setTimeout(() => {
      let stillActive;
      if (type === 'socket') {
        stillActive = request.readyState < 2;
      } else {
        stillActive = request.readyState > 0 && request.readyState < 4;
      }

      if (stillActive) {
        Pace.restart();

        for (let i = 0; i < Pace.sources.length; ++i) {
          const source = Pace.sources[i];
          if (source instanceof AjaxMonitor) {
            source.watch(...args);
            break;
          }
        }
      }
    }, after);
  }
});

class AjaxMonitor {
  constructor() {
    this.elements = [];
    getIntercept().on('request', () => this.watch(...arguments));
  }

  watch({type, request, url}) {
    if (shouldIgnoreURL(url)) {
      return;
    }

    let tracker;
    if (type === 'socket') {
      tracker = new SocketRequestTracker(request);
    } else {
      tracker = new XHRRequestTracker(request);
    }

    this.elements.push(tracker);
  }
}

class XHRRequestTracker {
  constructor(request) {
    this.progress = 0;

    if (typeof window.ProgressEvent !== 'undefined') {
      // We're dealing with a modern browser with progress event support

      request.addEventListener('progress', (evt) => {
        if (evt.lengthComputable) {
          this.progress = 100 * evt.loaded / evt.total;
        } else {
          // If it's chunked encoding, we have no way of knowing the total length of the
          // response, all we can do is increment the progress with backoff such that we
          // never hit 100% until it's done.
          this.progress = this.progress + (100 - this.progress) / 2;
        }
      }, false);

      ['load', 'abort', 'timeout', 'error'].forEach(event => {
        request.addEventListener(event, () => {
          this.progress = 100;
        }, false);
      });

    } else {
      const _onreadystatechange = request.onreadystatechange;
      request.onreadystatechange = () => {
        if (request.readyState === 0 || request.readyState === 4) {
          this.progress = 100;
        } else if (request.readyState === 3) {
          this.progress = 50;
        }

        if (typeof _onreadystatechange !== 'undefined') {
          _onreadystatechange(...arguments);
        }
      };
    }
  }
}

class SocketRequestTracker {
  constructor(request) {
    this.progress = 0;

    ['error', 'open'].forEach(event => {
      request.addEventListener(event, () => {
        this.progress = 100;
      }, false);
    });
  }
}

class ElementMonitor {
  constructor(_options={}) {
    this.elements = [];

    if (typeof _options.selectors === 'undefined') {
      _options.selectors = [];
    }

    _options.selectors.forEach(selector => {
      this.elements.push(new ElementTracker(selector));
    });
  }
}

class ElementTracker {
  constructor(selector) {
    this.selector = selector;
    this.progress = 0;
    this.check();
  }

  check() {
    if (document.querySelector(this.selector)) {
      this.done();
    } else {
      setTimeout(() => {
        this.check();
      }, options.elements.checkInterval);
    }
  }

  done() {
    this.progress = 100;
  }
}

class DocumentMonitor {
  constructor() {
    const states = {
      loading: 0,
      interactive: 50,
      complete: 100
    };

    this.progress = states[document.readyState] || 100;

    const _onreadystatechange = document.onreadystatechange;
    document.onreadystatechange = () => {
      if (typeof states[document.readyState] !== 'undefined') {
        this.progress = states[document.readyState];
      }

      if (typeof _onreadystatechange !== 'undefined') {
        _onreadystatechange(...arguments);
      }
    };
  }
}

class EventLagMonitor {
  constructor() {
    this.progress = 0;

    let avg = 0;
    let points = 0;
    const samples = [];

    let last = now();
    const interval = setInterval(() => {
      const diff = now() - last - 50;
      last = now();

      samples.push(diff);

      if (samples.length > options.eventLag.sampleCount) {
        samples.shift();
      }

      avg = average(samples);

      if (++points >= options.eventLag.minSamples && avg < options.eventLag.lagThreshold) {
        this.progress = 100;
        clearInterval(interval);
      } else {
        this.progress = 100 * (3 / (avg + 3));
      }
    }, 50);
  }
}

class Scaler {
  constructor(source) {
    this.source = source;
    this.last = this.sinceLastUpdate = 0;
    this.rate = options.initialRate;
    this.catchup = 0;
    this.progress = this.lastProgress = 0;

    if (typeof this.source !== 'undefined') {
      this.progress = result(this.source, 'progress');
    }
  }

  tick(frameTime, val) {
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

    const scaling = (1 - Math.pow(this.progress / 100, options.easeFactor));

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
}

let sources = null;
let scalers = null;
let bar = null;
let uniScaler = null;
let animation = null;
let cancelAnimation = null;
Pace.running = false;

const handlePushState = () => {
  if (options.restartOnPushState) {
    Pace.restart();
  }
};

// We reset the bar whenever it looks like an ajax navigation has occured.
if (typeof window.history.pushState !== 'undefined') {
  const _pushState = window.history.pushState;
  window.history.pushState = () => {
    handlePushState();
    _pushState.apply(window.history, arguments);
  };
}

if (typeof window.history.replaceState !== 'undefined') {
  const _replaceState = window.history.replaceState;
  window.history.replaceState = () => {
    handlePushState();
    _replaceState.apply(window.history, arguments);
  };
}

const SOURCE_KEYS = {
  ajax: AjaxMonitor,
  elements: ElementMonitor,
  document: DocumentMonitor,
  eventLag: EventLagMonitor
};

const init = () => {
  Pace.sources = sources = [];

  ['ajax', 'elements', 'document', 'eventLag'].forEach(type => {
    if (options[type] !== false) {
      sources.push(new SOURCE_KEYS[type](options[type]));
    }
  });

  let extraSources = options.extraSources;
  if (typeof extraSources === 'undefined') {
    extraSources = [];
  }

  extraSources.forEach(source => {
    sources.push(new source(options));
  });

  Pace.bar = bar = new Bar;

  // Each source of progress data has it's own scaler to smooth its output
  scalers = [];

  // We have an extra scaler for the final output to keep things looking nice as we add and
  // remove sources
  uniScaler = new Scaler;
};

init();

Pace.stop = () => {
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

Pace.restart = () => {
  Pace.trigger('restart');
  Pace.stop();
  Pace.start();
};

Pace.go = () => {
  Pace.running = true;

  bar.render();

  const start = now();

  cancelAnimation = false;
  animation = runAnimation((frameTime, enqueueNextFrame) => {
    // Every source gives us a progress number from 0 - 100
    // It's up to us to figure out how to turn that into a smoothly moving bar
    //
    // Their progress numbers can only increment.  We try to interpolate
    // between the numbers.

    let sum = 0;
    let count = sum;
    let done = true;
    // A source is composed of a bunch of elements, each with a raw, unscaled progress
    for (let i = 0; i < sources.length; ++i) {
      const source = sources[i];
      if (typeof scalers[i] === 'undefined') {
        scalers[i] = [];
      }
      const scalerList = scalers[i];
      const elements = typeof source.elements !== 'undefined' ? source.elements : [source];

      // Each element is given it's own scaler, which turns its value into something
      // smoothed for display
      for (let j = 0; j < elements.length; ++j) {
        const element = elements[j];
        if (typeof scalerList[j] === 'undefined') {
          scalerList[j] = new Scaler(element);
        }
        const scaler = scalerList[j];

        done &= scaler.done;

        if (scaler.done) {
          continue;
        }

        count++;
        sum += scaler.tick(frameTime);
      }
    }

    const avg = sum / count;

    bar.update(uniScaler.tick(frameTime, avg));

    if (bar.done() || done || cancelAnimation) {
      bar.update(100);

      Pace.trigger('done');

      setTimeout(() => {
        bar.finish();
        Pace.running = false;
        Pace.trigger('hide');
      }, Math.max(options.ghostTime, Math.max(options.minTime - (now() - start), 0)));
    } else {
      enqueueNextFrame();
    }
  });
};

Pace.start = (_options) => {
  extend(options, _options);

  Pace.running = true;

  try {
    bar.render();
  } catch (e) {
    if (e instanceof NoTargetError) {
      // Handle error...
    }
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
