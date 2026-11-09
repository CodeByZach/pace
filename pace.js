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
      trackFetch: true,
      ignoreURLs: [],
      maxWait: 15000,
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

  // Whether to track a request of `kind` ('xhr', 'fetch' or 'socket'): true,
  // false, or 'force' (inside Pace.track). With `ajax: false`, nothing is
  // tracked, not even inside Pace.track.
  const shouldTrack = (kind, method) => {
    if (!options.ajax) {
      return false;
    }
    method ??= 'GET';
    if (ignoreStack[0] === 'track') {
      return 'force';
    }
    if (ignoreStack.length) {
      return false;
    }
    if (kind === 'socket') {
      return Boolean(options.ajax.trackWebSockets);
    }
    if (kind === 'fetch' && !options.ajax.trackFetch) {
      return false;
    }
    // Array.prototype.includes, so a string or number from a misconfiguration
    // matches nothing instead of matching substrings or throwing.
    return Array.prototype.includes.call(options.ajax.trackMethods, String(method).toUpperCase());
  };

  // What ajax.ignoreURLs patterns are matched against: a request's URL as the page
  // wrote it, its full URL, and for a request to the page's own origin the part
  // after the origin (/api/items?page=2), so a pattern matches however the URL was
  // written. `resolved` is the full URL when the browser already resolved it.
  const urlsToMatch = (url, resolved) => {
    const urls = [String(url)];
    try {
      const full = new URL(resolved ?? urls[0], document.baseURI);
      urls.push(full.href);
      if (full.origin === location.origin) {
        urls.push(full.pathname + full.search + full.hash);
      }
    } catch {
      // A URL the browser can't parse is matched only as written.
    }
    return urls;
  };

  const matches = (pattern, url) => {
    if (typeof pattern === 'string') {
      return url.includes(pattern);
    }
    if (pattern instanceof RegExp) {
      // A pattern with the g or y flag keeps state between test() calls.
      pattern.lastIndex = 0;
      return pattern.test(url);
    }
    return false;
  };

  // `urls` from urlsToMatch().
  const shouldIgnoreURL = (urls) => {
    const patterns = options.ajax?.ignoreURLs ?? [];
    for (let i = 0, n = patterns.length; i < n; i++) {
      if (urls.some((candidate) => matches(patterns[i], candidate))) {
        return true;
      }
    }
    return false;
  };

  // Tracked requests that have started and not yet ended, each with its
  // 'request' event.
  const openRequests = new Map();

  // The callbacks waiting for each open request (by its event) to end.
  const endCallbacks = new WeakMap();

  // Requests waiting for their restartOnRequestAfter check. A request sent just
  // before a run starts (Turbolinks sends one, then calls pushState) belongs to
  // that run, so a run that starts meanwhile picks them up.
  const awaitingCheck = new Set();

  const isOpen = (event) => openRequests.get(event.request) === event;

  // Calls `callback` once the request of `event` ends (right away if it has).
  const whenRequestEnds = (event, callback) => {
    if (!isOpen(event)) {
      callback();
      return;
    }
    endCallbacks.get(event).push(callback);
  };

  // Ends the request, either because it ended or because pace stopped waiting
  // for it (ajax.maxWait).
  const endRequest = (request) => {
    const event = openRequests.get(request);
    if (!event) {
      return;
    }
    openRequests.delete(request);
    const callbacks = endCallbacks.get(event);
    endCallbacks.delete(event);
    for (const callback of callbacks) {
      callback();
    }
  };

  const beginRequest = (intercept, event) => {
    endRequest(event.request);
    openRequests.set(event.request, event);
    endCallbacks.set(event, []);
    // Pace waits for a request at most ajax.maxWait ms from when it was sent, so
    // one that never ends can't hold the bar forever. The request keeps going.
    // false, or a value a timer can't wait for (setTimeout would treat Infinity,
    // null or more than 2^31 - 1 ms as 0), means no limit.
    const maxWait = options.ajax?.maxWait;
    if (typeof maxWait === 'number' && maxWait >= 0 && maxWait <= 2147483647) {
      const timer = setTimeout(() => endRequest(event.request), maxWait);
      endCallbacks.get(event).push(() => clearTimeout(timer));
    }
    intercept.trigger('request', event);
  };

  // What open() decided about each XMLHttpRequest, used when it is sent.
  const opened = new WeakMap();

  // Wraps XMLHttpRequest.prototype.open and send, and replaces WebSocket with a
  // subclass, so the page keeps the native classes: instanceof, constants,
  // subclasses and other libraries' prototype patches keep working. Replaces
  // fetch with a function that behaves the same. Outside the class on purpose:
  // class bodies are strict mode, where assigning to a read-only property (a
  // page may lock these) throws.
  const installIntercepts = (intercept) => {
    const proto = window.XMLHttpRequest.prototype;
    const open = proto.open;
    const send = proto.send;
    // XMLHttpRequests that already have pace's readystatechange listener.
    const listening = new WeakSet();
    proto.open = function (...args) {
      const [method, url] = args;
      const decision = shouldTrack('xhr', method);
      const result = open.apply(this, args);
      // Opening a request again cancels the one it was making (only once open()
      // has succeeded: when it throws, the earlier request keeps going).
      endRequest(this);
      opened.delete(this);
      if (decision) {
        // The URL as open() used it, before the page can change a URL object.
        opened.set(this, { kind: 'xhr', urls: urlsToMatch(url), force: decision === 'force' });
      }
      return result;
    };
    proto.send = function (...args) {
      const info = opened.get(this);
      opened.delete(this);
      if (!info || shouldIgnoreURL(info.urls)) {
        return send.apply(this, args);
      }
      // One listener per XMLHttpRequest, added before send() because a
      // synchronous request ends inside it. Every way a request ends passes
      // readyState 4 (done) or, when the page aborts it from that handler, 0;
      // a request in flight is always at 1 to 3.
      if (!listening.has(this)) {
        listening.add(this);
        this.addEventListener('readystatechange', () => {
          if (this.readyState === 4 || this.readyState === 0) {
            endRequest(this);
          }
        });
      }
      beginRequest(intercept, { ...info, request: this });
      try {
        return send.apply(this, args);
      } catch (error) {
        endRequest(this);
        throw error;
      }
    };
    if (options.ajax.trackWebSockets) {
      const NativeWebSocket = window.WebSocket;
      window.WebSocket = class WebSocket extends NativeWebSocket {
        constructor(url, protocols) {
          if (protocols != null) {
            super(url, protocols);
          } else {
            super(url);
          }
          const decision = shouldTrack('socket');
          if (decision && !shouldIgnoreURL(urlsToMatch(url, this.url))) {
            for (const name of ['open', 'error', 'close']) {
              this.addEventListener(name, () => endRequest(this), { once: true });
            }
            beginRequest(intercept, { kind: 'socket', force: decision === 'force', request: this });
          }
        }
      };
    }
    if (options.ajax.trackFetch && typeof window.fetch === 'function') {
      const originalFetch = window.fetch;
      // Calls the original with the same `this` and arguments, never reads or
      // copies a Request's body, and returns a promise that settles like the
      // original's. A request ends when that promise settles: on the response's
      // headers, an error or an abort, not at the end of its body.
      // Declares only `input`, so its length is 1 like the native fetch's.
      window.fetch = function fetch(input) {
        const init = arguments[1];
        let event = null;
        // Deciding whether to track never throws into the page: fetch itself
        // rejects input it can't use (a URL whose toString() throws, say).
        try {
          // Also a Request made in another frame, which instanceof wouldn't see.
          const isRequest = Object.prototype.toString.call(input) === '[object Request]';
          const decision = shouldTrack('fetch', init?.method ?? (isRequest ? input.method : 'GET'));
          if (decision && !shouldIgnoreURL(urlsToMatch(isRequest ? input.url : input))) {
            event = { kind: 'fetch', force: decision === 'force' };
          }
        } catch {}
        const promise = originalFetch.apply(this, arguments);
        if (!event) {
          return promise;
        }
        event.request = promise;
        beginRequest(intercept, event);
        return promise.then(
          (response) => {
            endRequest(promise);
            return response;
          },
          (error) => {
            endRequest(promise);
            throw error;
          },
        );
      };
    }
  };

  // A request that is still open after restartOnRequestAfter ms shows the bar:
  // it joins a run in progress, or restarts pace.
  const onRequest = (event) => {
    if (isActive() || (options.restartOnRequestAfter === false && !event.force)) {
      return;
    }
    let after = options.restartOnRequestAfter || 0;
    if (typeof after === 'boolean') {
      after = 0;
    }
    awaitingCheck.add(event);
    setTimeout(() => {
      awaitingCheck.delete(event);
      if (!isOpen(event)) {
        return;
      }
      if (!isActive()) {
        Pace.restart();
      }
      ajaxMonitor()?.watch(event);
    }, after);
  };

  class RequestIntercept extends Events {
    constructor() {
      super();
      installIntercepts(this);
      this.on('request', onRequest);
    }
  }

  let _intercept = null;

  // Hooks into XMLHttpRequest, WebSocket and fetch the first time a run tracks ajax.
  const getIntercept = () => {
    _intercept ??= new RequestIntercept();
    return _intercept;
  };

  class AjaxMonitor {
    constructor() {
      this.complete = this.complete.bind(this);
      // The trackers of the watched requests that are still loading.
      this.elements = [];
      this.onRequest = (event) => this.watch(event);
      getIntercept().on('request', this.onRequest);
      for (const event of awaitingCheck) {
        this.watch(event);
      }
    }

    // Tracks the request of `event`, unless it has ended or is already tracked
    // (a reused XMLHttpRequest sends a new event per request).
    watch(event) {
      if (!isOpen(event) || this.elements.some((tracker) => tracker.event === event)) {
        return;
      }
      const Tracker = event.kind === 'xhr' ? XHRRequestTracker : RequestTracker;
      this.elements.push(new Tracker(event, this.complete));
    }

    complete(tracker) {
      this.elements = this.elements.filter((e) => e !== tracker);
    }

    // The requests this monitor is tracking that are still loading.
    openEvents() {
      return this.elements.map((tracker) => tracker.event);
    }

    destroy() {
      getIntercept().off('request', this.onRequest);
    }
  }

  class XHRRequestTracker {
    constructor(event, completeCallback) {
      this.event = event;
      this.progress = 0;
      event.request.addEventListener('progress', (evt) => {
        if (evt.lengthComputable) {
          this.progress = (100 * evt.loaded) / evt.total;
        } else {
          this.progress = this.progress + (100 - this.progress) / 2;
        }
      }, false);
      whenRequestEnds(event, () => {
        completeCallback(this);
        this.progress = 100;
      });
    }
  }

  // A request that reports no progress until it ends: a fetch (whose progress
  // can't be seen without reading its body) or a WebSocket connecting.
  class RequestTracker {
    constructor(event, completeCallback) {
      this.event = event;
      this.progress = 0;
      whenRequestEnds(event, () => {
        completeCallback(this);
        this.progress = 100;
      });
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

  const ajaxMonitor = () => run?.collectors.find((collector) => collector instanceof AjaxMonitor);
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
    const carried = ajaxMonitor()?.openEvents() ?? [];
    Pace.stop();
    Pace.start();
    // Whichever run is going now (stop and start handlers may have replaced
    // it) keeps tracking the requests the replaced run was tracking.
    for (const event of carried) {
      ajaxMonitor()?.watch(event);
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
