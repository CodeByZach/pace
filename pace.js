/*!
 * pace.js v1.3.1
 * https://github.com/CodeByZach/pace/
 * Licensed MIT © HubSpot, Inc.
 */
(function () {
  const defaultOptions = {
    className: '',
    catchupTime: 100,
    initialRate: 0.03,
    minTime: 250,
    ghostTime: 100,
    maxProgressPerFrame: 20,
    easeFactor: 1.25,
    startOnPageLoad: true,
    restartOnPushState: true,
    restartOnRequestAfter: 500,
    target: 'body',
    elements: {
      checkInterval: 100,
      selectors: ['body'],
    },
    eventLag: {
      minSamples: 10,
      sampleCount: 3,
      lagThreshold: 3,
    },
    ajax: {
      trackMethods: ['GET'],
      trackWebSockets: true,
      ignoreURLs: [],
    },
  };

  const now = () => performance.now();

  const requestAnimationFrame = window.requestAnimationFrame;
  const cancelAnimationFrame = window.cancelAnimationFrame;

  const runAnimation = (fn) => {
    let last = now();
    const tick = () => {
      const diff = now() - last;
      if (diff >= 33) {
        last = now();
        return fn(diff, () => requestAnimationFrame(tick));
      }
      return setTimeout(tick, 33 - diff);
    };
    return tick();
  };

  const result = (obj, key, ...args) => {
    if (typeof obj[key] === 'function') {
      return obj[key].apply(obj, args);
    }
    return obj[key];
  };

  const extend = (out, ...sources) => {
    for (const source of sources) {
      if (!source) {
        continue;
      }
      for (const key in source) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        const val = source[key];
        if (out[key] != null && typeof out[key] === 'object' && val != null && typeof val === 'object') {
          extend(out[key], val);
        } else {
          out[key] = val;
        }
      }
    }
    return out;
  };

  const avgAmplitude = (arr) => {
    let sum = 0;
    let count = 0;
    for (const v of arr) {
      sum += Math.abs(v);
      count++;
    }
    return sum / count;
  };

  const getFromDOM = (key = 'options', json = true) => {
    const el = document.querySelector(`script[data-pace-${key}]`);
    if (!el) {
      return;
    }
    const data = el.getAttribute(`data-pace-${key}`);
    if (!json) {
      return data;
    }
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('Error parsing inline pace options', e);
    }
  };

  const Pace = window.Pace || {};

  window.Pace = Pace;

  Object.assign(Pace, {
    on(event, handler, ctx, once) {
      once ??= false;
      this.bindings ??= {};
      this.bindings[event] ??= [];
      this.bindings[event].push({ handler, ctx, once });
    },

    once(event, handler, ctx) {
      this.on(event, handler, ctx, true);
    },

    off(event, handler) {
      if (this.bindings?.[event] == null) {
        return;
      }
      if (handler == null) {
        delete this.bindings[event];
        return;
      }
      let i = 0;
      while (i < this.bindings[event].length) {
        if (this.bindings[event][i].handler === handler) {
          this.bindings[event].splice(i, 1);
        } else {
          i++;
        }
      }
    },

    trigger(event, ...args) {
      if (!this.bindings?.[event]) {
        return;
      }
      let i = 0;
      while (i < this.bindings[event].length) {
        const { handler, ctx, once } = this.bindings[event][i];
        handler.apply(ctx ?? this, args);
        if (once) {
          this.bindings[event].splice(i, 1);
        } else {
          i++;
        }
      }
    },
  });

  const options = (Pace.options = extend({}, defaultOptions, window.paceOptions, getFromDOM()));

  for (const key of ['ajax', 'document', 'eventLag', 'elements']) {
    if (options[key] === true) {
      options[key] = defaultOptions[key];
    }
  }

  class NoTargetError extends Error {}

  class Bar {
    constructor() {
      this.progress = 0;
    }

    getElement() {
      if (this.el == null) {
        const targetElement = document.querySelector(options.target);
        if (!targetElement) {
          throw new NoTargetError();
        }
        this.el = document.createElement('div');
        this.el.className = 'pace pace-active';
        document.body.className = document.body.className.replace(/(pace-done )|/, 'pace-running ');
        const progress = document.createElement('div');
        progress.className = 'pace-progress' + (options.className !== '' ? ' ' + options.className : '');
        const inner = document.createElement('div');
        inner.className = 'pace-progress-inner';
        progress.appendChild(inner);
        const activity = document.createElement('div');
        activity.className = 'pace-activity';
        this.el.appendChild(progress);
        this.el.appendChild(activity);
        if (targetElement.firstChild != null) {
          targetElement.insertBefore(this.el, targetElement.firstChild);
        } else {
          targetElement.appendChild(this.el);
        }
      }
      return this.el;
    }

    finish() {
      const el = this.getElement();
      el.className = el.className.replace('pace-active', 'pace-inactive');
      document.body.className = document.body.className.replace('pace-running ', 'pace-done ');
    }

    update(prog) {
      this.progress = prog;
      Pace.trigger('progress', prog);
      this.render();
    }

    destroy() {
      try {
        this.getElement().parentNode.removeChild(this.getElement());
      } catch (error) {
        NoTargetError = error;
      }
      this.el = undefined;
    }

    render() {
      if (document.querySelector(options.target) == null) {
        return;
      }
      const el = this.getElement();
      el.children[0].style.transform = `translate3d(${this.progress}%, 0, 0)`;
      if (!this.lastRenderedProgress || this.lastRenderedProgress | 0 !== this.progress | 0) {
        el.children[0].setAttribute('data-progress-text', `${this.progress | 0}%`);
        let progressStr;
        if (this.progress >= 100) {
          progressStr = '99';
        } else {
          progressStr = this.progress < 10 ? '0' : '';
          progressStr += this.progress | 0;
        }
        el.children[0].setAttribute('data-progress', progressStr);
      }
      Pace.trigger('change', this.progress);
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
      if (this.bindings[name] != null) {
        // A copy, so listeners added while this runs wait for the next trigger.
        for (const binding of this.bindings[name].slice()) {
          binding.call(this, val);
        }
      }
    }

    on(name, fn) {
      this.bindings[name] ??= [];
      this.bindings[name].push(fn);
    }
  }

  const _XMLHttpRequest = window.XMLHttpRequest;

  const _WebSocket = window.WebSocket;

  const extendNative = (to, from) => {
    for (const key in from.prototype) {
      try {
        if (to[key] == null && typeof from[key] !== 'function') {
          Object.defineProperty(to, key, {
            get: () => from.prototype[key],
            configurable: true,
            enumerable: true,
          });
        }
      } catch {}
    }
  };

  const ignoreStack = [];

  Pace.ignore = (fn, ...args) => {
    ignoreStack.unshift('ignore');
    const ret = fn.apply(null, args);
    ignoreStack.shift();
    return ret;
  };

  Pace.track = (fn, ...args) => {
    ignoreStack.unshift('track');
    const ret = fn.apply(null, args);
    ignoreStack.shift();
    return ret;
  };

  const shouldTrack = (method) => {
    method ??= 'GET';
    if (ignoreStack[0] === 'track') {
      return 'force';
    }
    if (!ignoreStack.length && options.ajax) {
      if (method === 'socket' && options.ajax.trackWebSockets) {
        return true;
      } else if (options.ajax.trackMethods.includes(method.toUpperCase())) {
        return true;
      }
    }
    return false;
  };

  // Outside the class on purpose: class bodies are strict mode, where assigning
  // to a read-only property (a page may lock window.XMLHttpRequest) throws.
  const installIntercepts = (intercept) => {
    const monitorXHR = (req) => {
      const _open = req.open;
      req.open = (...args) => {
        const [type, url] = args;
        if (shouldTrack(type)) {
          intercept.trigger('request', { type, url, request: req });
        }
        return _open.apply(req, args);
      };
    };
    // Plain functions, not arrow functions: pages call these with `new`.
    window.XMLHttpRequest = function (flags) {
      const req = new _XMLHttpRequest(flags);
      monitorXHR(req);
      return req;
    };
    try {
      extendNative(window.XMLHttpRequest, _XMLHttpRequest);
    } catch {}
    if (options.ajax.trackWebSockets) {
      window.WebSocket = function (url, protocols) {
        let req;
        if (protocols != null) {
          req = new _WebSocket(url, protocols);
        } else {
          req = new _WebSocket(url);
        }
        if (shouldTrack('socket')) {
          intercept.trigger('request', { type: 'socket', url, protocols, request: req });
        }
        return req;
      };
      try {
        extendNative(window.WebSocket, _WebSocket);
      } catch {}
    }
  };

  class RequestIntercept extends Events {
    constructor() {
      super();
      installIntercepts(this);
    }
  }

  let _intercept = null;

  const getIntercept = () => {
    _intercept ??= new RequestIntercept();
    return _intercept;
  };

  const shouldIgnoreURL = (url) => {
    const patterns = options.ajax.ignoreURLs;
    for (let i = 0, n = patterns.length; i < n; i++) {
      const pattern = patterns[i];
      if (typeof pattern === 'string') {
        if (url.indexOf(pattern) !== -1) {
          return true;
        }
      } else if (pattern.test(url)) {
        return true;
      }
    }
    return false;
  };

  getIntercept().on('request', (event) => {
    const { type, request, url } = event;
    if (shouldIgnoreURL(url)) {
      return;
    }
    if (!Pace.running && (options.restartOnRequestAfter !== false || shouldTrack(type) === 'force')) {
      let after = options.restartOnRequestAfter || 0;
      if (typeof after === 'boolean') {
        after = 0;
      }
      setTimeout(() => {
        let stillActive;
        if (type === 'socket') {
          stillActive = request.readyState < 1;
        } else {
          stillActive = 0 < request.readyState && request.readyState < 4;
        }
        if (stillActive) {
          Pace.restart();
          for (let i = 0, n = Pace.sources.length; i < n; i++) {
            const source = Pace.sources[i];
            if (source instanceof AjaxMonitor) {
              source.watch(event);
              break;
            }
          }
        }
      }, after);
    }
  });

  class AjaxMonitor {
    constructor() {
      this.complete = this.complete.bind(this);
      this.elements = [];
      getIntercept().on('request', (event) => this.watch(event));
    }

    watch({ type, request, url }) {
      if (shouldIgnoreURL(url)) {
        return;
      }
      let tracker;
      if (type === 'socket') {
        tracker = new SocketRequestTracker(request, this.complete);
      } else {
        tracker = new XHRRequestTracker(request, this.complete);
      }
      this.elements.push(tracker);
    }

    complete(tracker) {
      this.elements = this.elements.filter((e) => e !== tracker);
    }
  }

  class XHRRequestTracker {
    constructor(request, completeCallback) {
      this.progress = 0;
      request.addEventListener('progress', (evt) => {
        if (evt.lengthComputable) {
          this.progress = (100 * evt.loaded) / evt.total;
        } else {
          this.progress = this.progress + (100 - this.progress) / 2;
        }
      }, false);
      for (const event of ['load', 'abort', 'timeout', 'error']) {
        request.addEventListener(event, () => {
          completeCallback(this);
          this.progress = 100;
        }, false);
      }
    }
  }

  class SocketRequestTracker {
    constructor(request, completeCallback) {
      this.progress = 0;
      for (const event of ['error', 'open']) {
        request.addEventListener(event, () => {
          completeCallback(this);
          this.progress = 100;
        }, false);
      }
    }
  }

  class ElementMonitor {
    constructor(settings) {
      settings ??= {};
      this.complete = this.complete.bind(this);
      this.elements = [];
      settings.selectors ??= [];
      const selectors = settings.selectors;
      for (let i = 0, n = selectors.length; i < n; i++) {
        this.elements.push(new ElementTracker(selectors[i], this.complete));
      }
    }

    complete(tracker) {
      this.elements = this.elements.filter((e) => e !== tracker);
    }
  }

  class ElementTracker {
    constructor(selector, completeCallback) {
      this.selector = selector;
      this.completeCallback = completeCallback;
      this.progress = 0;
      this.check();
    }

    check() {
      if (document.querySelector(this.selector)) {
        this.done();
      } else {
        setTimeout(() => this.check(), options.elements.checkInterval);
      }
    }

    done() {
      this.completeCallback(this);
      this.completeCallback = null;
      this.progress = 100;
    }
  }

  class DocumentMonitor {
    constructor() {
      this.progress = this.states[document.readyState] ?? 100;
      const _onreadystatechange = document.onreadystatechange;
      document.onreadystatechange = (...args) => {
        if (this.states[document.readyState] != null) {
          this.progress = this.states[document.readyState];
        }
        return typeof _onreadystatechange === 'function' ? _onreadystatechange.apply(null, args) : undefined;
      };
    }
  }

  DocumentMonitor.prototype.states = {
    loading: 0,
    interactive: 50,
    complete: 100,
  };

  class EventLagMonitor {
    constructor(settings) {
      this.progress = 0;
      let avg = 0;
      const samples = [];
      let points = 0;
      let last = now();
      const interval = setInterval(() => {
        const diff = now() - last - 50;
        last = now();
        samples.push(diff);
        if (samples.length > settings.sampleCount) {
          samples.shift();
        }
        avg = avgAmplitude(samples);
        if (++points >= settings.minSamples && avg < settings.lagThreshold) {
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
      if (this.source != null) {
        this.progress = result(this.source, 'progress');
      }
    }

    tick(frameTime, val) {
      val ??= result(this.source, 'progress');
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
        this.progress += this.catchup * frameTime;
      }
      const scaling = 1 - Math.pow(this.progress / 100, options.easeFactor);
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

  const _pushState = window.history.pushState;
  window.history.pushState = (...args) => {
    handlePushState();
    return _pushState.apply(window.history, args);
  };

  const _replaceState = window.history.replaceState;
  window.history.replaceState = (...args) => {
    handlePushState();
    return _replaceState.apply(window.history, args);
  };

  const SOURCE_KEYS = {
    ajax: AjaxMonitor,
    elements: ElementMonitor,
    document: DocumentMonitor,
    eventLag: EventLagMonitor,
  };

  const init = () => {
    Pace.sources = sources = [];
    for (const type of ['ajax', 'elements', 'document', 'eventLag']) {
      if (options[type] !== false) {
        sources.push(new SOURCE_KEYS[type](options[type]));
      }
    }
    const extraSources = options.extraSources ?? [];
    for (let i = 0, n = extraSources.length; i < n; i++) {
      sources.push(new extraSources[i](options));
    }
    Pace.bar = bar = new Bar();
    scalers = [];
    uniScaler = new Scaler();
  };

  init();

  Pace.stop = () => {
    Pace.trigger('stop');
    Pace.running = false;
    bar.destroy();
    cancelAnimation = true;
    if (animation != null) {
      cancelAnimationFrame(animation);
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
      let count = 0;
      let sum = 0;
      let done = true;
      for (let i = 0, n = sources.length; i < n; i++) {
        const source = sources[i];
        const scalerList = (scalers[i] ??= []);
        const elements = source.elements ?? [source];
        for (let j = 0, m = elements.length; j < m; j++) {
          const scaler = (scalerList[j] ??= new Scaler(elements[j]));
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
        return setTimeout(() => {
          bar.finish();
          Pace.running = false;
          Pace.trigger('hide');
        }, Math.max(options.ghostTime, Math.max(options.minTime - (now() - start), 0)));
      }
      return enqueueNextFrame();
    });
  };

  Pace.start = (_options) => {
    extend(options, _options);
    Pace.running = true;
    try {
      bar.render();
    } catch (error) {
      NoTargetError = error;
    }
    if (!document.querySelector('.pace')) {
      setTimeout(Pace.start, 50);
    } else {
      Pace.trigger('start');
      Pace.go();
    }
  };

  if (typeof define === 'function' && define.amd) {
    define(() => Pace);
  } else if (typeof exports === 'object') {
    module.exports = Pace;
  } else if (options.startOnPageLoad) {
    Pace.start();
  }
})();
