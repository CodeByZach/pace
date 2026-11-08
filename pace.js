/*!
 * pace.js v1.3.1
 * https://github.com/CodeByZach/pace/
 * Licensed MIT © HubSpot, Inc. and Zachary Miller
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

  // Removes the handlers of `event` that match `test`, and marks them so an
  // event that is firing right now skips them too.
  const removeBindings = (target, event, test) => {
    const bindings = target.bindings?.[event];
    if (!bindings) {
      return;
    }
    target.bindings[event] = bindings.filter((binding) => {
      if (!test(binding)) {
        return true;
      }
      binding.removed = true;
      return false;
    });
  };

  // Reports an error like an uncaught one, without throwing. reportError keeps
  // the details for window.onerror even when pace.js is served from another
  // origin; Safari before 15.4 lacks it, so there the error is thrown from a
  // microtask instead.
  const reportException = (error) => {
    if (typeof reportError === 'function') {
      reportError(error);
    } else {
      queueMicrotask(() => {
        throw error;
      });
    }
  };

  // Handlers run the way the DOM runs event listeners
  // (https://dom.spec.whatwg.org/#concept-event-listener-inner-invoke): the ones
  // registered when the event fires, minus any removed meanwhile; a `once`
  // handler is removed before it runs; an exception is reported, not thrown.
  Object.assign(Pace, {
    on(event, handler, ctx, once) {
      once ??= false;
      this.bindings ??= Object.create(null);
      this.bindings[event] ??= [];
      this.bindings[event].push({ handler, ctx, once });
    },

    once(event, handler, ctx) {
      this.on(event, handler, ctx, true);
    },

    off(event, handler) {
      removeBindings(this, event, (binding) => handler == null || binding.handler === handler);
    },

    trigger(event, ...args) {
      const bindings = this.bindings?.[event];
      if (!bindings) {
        return;
      }
      for (const binding of bindings.slice()) {
        if (binding.removed) {
          continue;
        }
        if (binding.once) {
          removeBindings(this, event, (other) => other === binding);
        }
        try {
          binding.handler.apply(binding.ctx ?? this, args);
        } catch (error) {
          reportException(error);
        }
      }
    },
  });

  const options = (Pace.options = extend({}, defaultOptions, window.paceOptions, getFromDOM()));

  // `true` turns a collector on with its default settings.
  const normalizeOptions = () => {
    for (const key of ['ajax', 'document', 'eventLag', 'elements']) {
      if (options[key] === true) {
        options[key] = defaultOptions[key];
      }
    }
  };

  normalizeOptions();

  class Bar {
    constructor() {
      this.progress = 0;
    }

    // The bar's element, created in the target the first time. Null while the
    // target doesn't exist yet, and after destroy().
    getElement() {
      if (this.destroyed) {
        return null;
      }
      if (this.el == null) {
        const targetElement = document.querySelector(options.target);
        if (!targetElement) {
          return null;
        }
        this.el = document.createElement('div');
        this.el.className = 'pace pace-active';
        document.body.classList.remove('pace-done');
        document.body.classList.add('pace-running');
        const progress = document.createElement('div');
        progress.className = 'pace-progress' + (options.className !== '' ? ' ' + options.className : '');
        const inner = document.createElement('div');
        inner.className = 'pace-progress-inner';
        progress.appendChild(inner);
        const activity = document.createElement('div');
        activity.className = 'pace-activity';
        this.el.appendChild(progress);
        this.el.appendChild(activity);
        targetElement.insertBefore(this.el, targetElement.firstChild);
      }
      return this.el;
    }

    finish() {
      this.el?.classList.replace('pace-active', 'pace-inactive');
      document.body.classList.remove('pace-running');
      document.body.classList.add('pace-done');
    }

    update(prog) {
      this.progress = prog;
      Pace.trigger('progress', prog);
      this.render();
    }

    destroy() {
      this.el?.remove();
      this.el = undefined;
      this.destroyed = true;
    }

    render() {
      if (document.querySelector(options.target) == null) {
        return;
      }
      const el = this.getElement();
      if (!el) {
        return;
      }
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

    off(name, fn) {
      this.bindings[name] = this.bindings[name]?.filter((binding) => binding !== fn);
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
      }
      // Array.prototype.includes, so a string or number from a misconfiguration
      // matches nothing instead of matching substrings or throwing.
      if (Array.prototype.includes.call(options.ajax.trackMethods, method.toUpperCase())) {
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
    if (!isActive() && (options.restartOnRequestAfter !== false || shouldTrack(type) === 'force')) {
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
        if (!stillActive) {
          return;
        }
        // Join a run that started meanwhile, rather than restarting it.
        if (!isActive()) {
          Pace.restart();
        }
        run?.collectors.find((collector) => collector instanceof AjaxMonitor)?.watch(event);
      }, after);
    }
  });

  class AjaxMonitor {
    constructor() {
      this.complete = this.complete.bind(this);
      this.elements = [];
      this.watched = new WeakSet();
      this.onRequest = (event) => this.watch(event);
      getIntercept().on('request', this.onRequest);
    }

    watch({ type, request, url }) {
      if (shouldIgnoreURL(url) || this.watched.has(request)) {
        return;
      }
      this.watched.add(request);
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

    destroy() {
      getIntercept().off('request', this.onRequest);
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
      this.trackers = [];
      const selectors = settings.selectors;
      for (let i = 0, n = selectors.length; i < n; i++) {
        const tracker = new ElementTracker(selectors[i], settings.checkInterval, this.complete);
        this.trackers.push(tracker);
        this.elements.push(tracker);
      }
    }

    complete(tracker) {
      this.elements = this.elements.filter((e) => e !== tracker);
    }

    destroy() {
      for (const tracker of this.trackers) {
        tracker.destroy();
      }
    }
  }

  class ElementTracker {
    constructor(selector, checkInterval, completeCallback) {
      this.selector = selector;
      this.checkInterval = checkInterval;
      this.completeCallback = completeCallback;
      this.progress = 0;
      this.check();
    }

    check() {
      if (document.querySelector(this.selector)) {
        this.done();
      } else {
        this.timer = setTimeout(() => this.check(), this.checkInterval);
      }
    }

    destroy() {
      clearTimeout(this.timer);
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
      // A listener, not document.onreadystatechange, so a page that sets that
      // property doesn't disconnect pace.
      this.onChange = () => {
        if (this.states[document.readyState] != null) {
          this.progress = this.states[document.readyState];
        }
      };
      document.addEventListener('readystatechange', this.onChange);
    }

    destroy() {
      document.removeEventListener('readystatechange', this.onChange);
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
      const interval = (this.interval = setInterval(() => {
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
      }, 50));
    }

    destroy() {
      clearInterval(this.interval);
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

  // A run goes from waiting (for the target element) to running to finishing
  // (done, about to hide). `run` holds the current one; null when idle.
  let run = null;
  let bar = (Pace.bar = new Bar());

  Pace.sources = [];
  Pace.running = false;

  // Waiting or running: a new request joins it instead of restarting the bar.
  const isActive = () => run != null && (run.state === 'waiting' || run.state === 'running');

  const handlePushState = () => {
    if (options.restartOnPushState) {
      Pace.restart();
    }
  };

  // An error in pace (or in an event handler it calls) never stops the
  // page's navigation.
  const _pushState = window.history.pushState;
  window.history.pushState = (...args) => {
    try {
      handlePushState();
    } catch (error) {
      reportException(error);
    }
    return _pushState.apply(window.history, args);
  };

  const _replaceState = window.history.replaceState;
  window.history.replaceState = (...args) => {
    try {
      handlePushState();
    } catch (error) {
      reportException(error);
    }
    return _replaceState.apply(window.history, args);
  };

  const SOURCE_KEYS = {
    ajax: AjaxMonitor,
    elements: ElementMonitor,
    document: DocumentMonitor,
    eventLag: EventLagMonitor,
  };

  // Stops the collectors that pace created (not extraSources) from watching.
  const stopCollectors = (current) => {
    for (const collector of current.collectors.splice(0)) {
      collector.destroy();
    }
  };

  // Cancels everything the current run scheduled, and removes the bar (also a
  // finished run's hidden bar).
  const endRun = () => {
    if (run) {
      const current = run;
      run = null;
      cancelAnimationFrame(current.frame);
      clearTimeout(current.waitTimer);
      clearTimeout(current.hideTimer);
      stopCollectors(current);
    }
    bar.destroy();
  };

  const finish = (current) => {
    bar.update(100);
    if (run !== current) {
      return; // a progress handler stopped or restarted pace
    }
    current.state = 'finishing';
    stopCollectors(current);
    Pace.trigger('done');
    if (run !== current) {
      return; // a done handler stopped or restarted pace
    }
    const shownFor = now() - current.startedAt;
    current.hideTimer = setTimeout(() => {
      run = null;
      Pace.running = false;
      bar.finish();
      Pace.trigger('hide');
    }, Math.max(options.ghostTime, options.minTime - shownFor, 0));
  };

  // About 30 frames a second, on requestAnimationFrame.
  const animate = (current) => {
    let last = now();
    const frame = () => {
      if (run !== current) {
        return;
      }
      const frameTime = now() - last;
      if (frameTime < 30) {
        current.frame = requestAnimationFrame(frame);
        return;
      }
      last = now();
      let count = 0;
      let sum = 0;
      let done = true;
      const sources = current.sources;
      for (let i = 0, n = sources.length; i < n; i++) {
        const source = sources[i];
        const elements = source.elements ?? [source];
        for (let j = 0, m = elements.length; j < m; j++) {
          const element = elements[j];
          // Each tracked item keeps its own Scaler, even when finished items
          // leave the list.
          let scaler = current.scalers.get(element);
          if (!scaler) {
            scaler = new Scaler(element);
            current.scalers.set(element, scaler);
          }
          if (scaler.done) {
            continue;
          }
          done = false;
          count++;
          sum += scaler.tick(frameTime);
        }
      }
      bar.update(current.uniScaler.tick(frameTime, sum / count));
      if (run !== current) {
        return; // a progress handler stopped or restarted pace
      }
      if (bar.done() || done) {
        finish(current);
      } else {
        current.frame = requestAnimationFrame(frame);
      }
    };
    current.frame = requestAnimationFrame(frame);
  };

  const beginRun = () => {
    const current = {
      state: 'waiting',
      collectors: [],
      sources: [],
      scalers: new WeakMap(),
      uniScaler: new Scaler(),
    };
    // Built before the run counts as started: if a collector or an extra
    // source throws (an invalid selector, say), pace stays idle.
    try {
      for (const type of ['ajax', 'elements', 'document', 'eventLag']) {
        if (options[type] !== false) {
          const collector = new SOURCE_KEYS[type](options[type]);
          current.collectors.push(collector);
          current.sources.push(collector);
        }
      }
      const extraSources = options.extraSources ?? [];
      for (let i = 0, n = extraSources.length; i < n; i++) {
        current.sources.push(new extraSources[i](options));
      }
    } catch (error) {
      stopCollectors(current);
      throw error;
    }
    run = current;
    Pace.running = true;
    Pace.bar = bar = new Bar();
    Pace.sources = current.sources;
    const show = () => {
      if (run !== current) {
        return;
      }
      if (!bar.getElement()) {
        current.waitTimer = setTimeout(show, 50);
        return;
      }
      current.state = 'running';
      current.startedAt = now();
      bar.render();
      if (run !== current) {
        return; // a change handler stopped or restarted pace
      }
      Pace.trigger('start');
      animate(current);
    };
    show();
  };

  Pace.start = (startOptions) => {
    extend(options, startOptions);
    normalizeOptions();
    if (isActive()) {
      return;
    }
    endRun(); // a run that is finishing gives way to the new one
    beginRun();
  };

  Pace.stop = () => {
    endRun();
    Pace.running = false;
    document.body.classList.remove('pace-running');
    document.body.classList.add('pace-done');
    Pace.trigger('stop');
  };

  Pace.restart = () => {
    Pace.trigger('restart');
    Pace.stop();
    Pace.start();
  };

  if (typeof define === 'function' && define.amd) {
    define(() => Pace);
  } else if (typeof exports === 'object') {
    module.exports = Pace;
  } else if (options.startOnPageLoad) {
    Pace.start();
  }
})();
