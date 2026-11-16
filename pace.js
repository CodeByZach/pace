/*!
 * pace.js v1.3.1
 * https://github.com/CodeByZach/pace/
 * Licensed MIT © HubSpot, Inc. and Zachary Miller
 */
(function () {
  const VERSION = '1.3.1';

  // Hands `value` to a module loader. False when pace was loaded by a <script>.
  const exportPace = (value) => {
    if (typeof define === 'function' && define.amd) {
      define(() => value);
      return true;
    }
    if (typeof exports === 'object') {
      module.exports = value;
      return true;
    }
    return false;
  };

  // Where the first copy of pace on a page keeps its Pace object, for a later
  // copy (another script tag or bundle) to find. Page markup can't replace it:
  // element names are strings.
  const FIRST_COPY = Symbol.for('pace-js');

  // Pace 1.x doesn't set FIRST_COPY, but puts an object with a start function on
  // window.Pace. Reading from a cross-origin frame named Pace throws.
  const olderPace = () => {
    try {
      return typeof window.Pace?.start === 'function' ? window.Pace : undefined;
    } catch {
      return undefined;
    }
  };

  const firstCopy = window[FIRST_COPY] ?? olderPace();

  // A later copy would wrap requests and history again and add a second bar.
  if (firstCopy) {
    const firstVersion = typeof firstCopy.version === 'string' ? ` (${firstCopy.version})` : '';
    console.warn(`Pace: pace.js ${VERSION} was loaded after another copy${firstVersion}; only the first copy runs.`);
    exportPace(firstCopy);
    return;
  }

  // The longest delay a timer can wait: setTimeout treats more, and Infinity, as 0.
  const MAX_DELAY = 2147483647;

  const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
  const isMilliseconds = (value) => isNumber(value) && value >= 0 && value <= MAX_DELAY;

  // querySelector throws on anything that isn't a valid selector.
  const isSelector = (value) => {
    if (typeof value !== 'string') {
      return false;
    }
    try {
      document.createDocumentFragment().querySelector(value);
      return true;
    } catch {
      return false;
    }
  };

  // RegExp.prototype's source getter throws for anything that isn't a RegExp,
  // so this also accepts a RegExp made in another frame, which instanceof
  // wouldn't, and rejects an object that only claims to be one.
  const regExpSource = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source').get;
  const isRegExp = (value) => {
    try {
      regExpSource.call(value);
      return value !== RegExp.prototype;
    } catch {
      return false;
    }
  };

  // Whether `new value()` works, without calling or reading anything from it:
  // Reflect.construct checks that its target is a constructor before it reads
  // the arguments, which throw here.
  const notArguments = {
    get length() {
      throw notArguments;
    },
  };
  const isConstructor = (value) => {
    try {
      Reflect.construct(value, notArguments);
    } catch (error) {
      return error === notArguments;
    }
  };

  const BOOLEAN = { expected: 'true or false', test: (value) => typeof value === 'boolean' };
  const MILLISECONDS = { expected: `a number of milliseconds from 0 to ${MAX_DELAY}`, test: isMilliseconds };
  const MILLISECONDS_OR_FALSE = { expected: `false or ${MILLISECONDS.expected}`, test: (value) => value === false || isMilliseconds(value) };
  const ABOVE_ZERO = { expected: 'a number greater than 0', test: (value) => isNumber(value) && value > 0 };
  const listOf = (expected, test) => ({ expected: `an array of ${expected}`, test: Array.isArray, item: test });

  // Each setting with its default and the values it accepts.
  const SETTINGS = new Map([
    ['startOnPageLoad', [true, BOOLEAN]],
    ['restartOnNavigation', [true, BOOLEAN]],
    ['restartOnRequestAfter', [500, MILLISECONDS_OR_FALSE]],
    ['target', ['body', { expected: 'a valid CSS selector', test: isSelector }]],
    ['className', ['', { expected: 'a string', test: (value) => typeof value === 'string' }]],
    ['trackDocument', [true, BOOLEAN]],
    ['trackEventLag', [true, BOOLEAN]],
    ['waitFor', [['body'], listOf('valid CSS selectors', isSelector)]],
    ['trackXHR', [true, BOOLEAN]],
    ['trackFetch', [true, BOOLEAN]],
    ['trackWebSockets', [true, BOOLEAN]],
    ['requestMethods', [['GET'], listOf('strings', (item) => typeof item === 'string')]],
    ['ignoreRequests', [[], listOf('non-empty strings and RegExps', (item) => (typeof item === 'string' && item !== '') || isRegExp(item))]],
    ['maxWait', [15000, MILLISECONDS_OR_FALSE]],
    ['minVisible', [250, MILLISECONDS]],
    ['hideDelay', [100, MILLISECONDS]],
    ['catchupTime', [100, ABOVE_ZERO]],
    ['initialRate', [0.03, { expected: 'a number of 0 or more', test: (value) => isNumber(value) && value >= 0 }]],
    ['maxProgressPerFrame', [20, ABOVE_ZERO]],
    ['easeFactor', [1.25, ABOVE_ZERO]],
    ['extraSources', [[], listOf('constructors', isConstructor)]],
  ]);

  // Version 1 settings, and what replaced them.
  const RENAMED = new Map([
    ['ajax', 'trackXHR, trackFetch, trackWebSockets, requestMethods, ignoreRequests and maxWait'],
    ['document', 'trackDocument'],
    ['elements', 'waitFor'],
    ['eventLag', 'trackEventLag'],
    ['ghostTime', 'hideDelay'],
    ['minTime', 'minVisible'],
    ['restartOnPushState', 'restartOnNavigation'],
  ]);

  // A copy of a setting's value that shares nothing that can change: a list
  // becomes a plain array, read once, and its RegExps (whose lastIndex changes,
  // and which the page could freeze) are copied.
  const copyValue = (value) => {
    if (!Array.isArray(value)) {
      return value;
    }
    const copy = [];
    for (let i = 0, n = value.length; i < n; i++) {
      const item = value[i];
      copy.push(isRegExp(item) ? new RegExp(item) : item);
    }
    return copy;
  };

  const copyOptions = (settings) => {
    const copy = {};
    for (const name of SETTINGS.keys()) {
      copy[name] = copyValue(settings[name]);
    }
    return copy;
  };

  const options = copyOptions(Object.fromEntries([...SETTINGS].map(([name, [value]]) => [name, value])));

  // A value as a warning shows it: its type, and the value itself when that is short.
  const describe = (value) => {
    if (value == null) {
      return String(value);
    }
    if (Array.isArray(value)) {
      return 'array';
    }
    switch (typeof value) {
      case 'string': {
        const json = JSON.stringify(value);
        return `string ${json.length > 50 ? json.slice(0, 48) + '…"' : json}`;
      }
      case 'object':
        return Object.prototype.toString.call(value).slice(8, -1);
      case 'function':
        return 'function';
      default:
        return `${typeof value} ${String(value)}`;
    }
  };

  const warned = new Set();

  // Logs each distinct warning once.
  const warn = (message) => {
    message = `Pace: ${message}`;
    if (!warned.has(message)) {
      warned.add(message);
      console.warn(message);
    }
  };

  // What is wrong with `value` for a setting that accepts `check`, or undefined.
  const problemWith = (check, value) => {
    if (!check.test(value)) {
      return describe(value);
    }
    const index = check.item ? value.findIndex((item) => !check.item(item)) : -1;
    if (index !== -1) {
      return `array containing ${describe(value[index])}`;
    }
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

  const avgAmplitude = (arr) => {
    let sum = 0;
    let count = 0;
    for (const v of arr) {
      sum += Math.abs(v);
      count++;
    }
    return sum / count;
  };

  const Pace = {};

  window.Pace = Pace;

  // Whether a run is waiting, running or finishing; Pace.running reads it.
  let running = false;

  Object.defineProperties(Pace, {
    version: { value: VERSION, enumerable: true },
    running: { get: () => running, enumerable: true },
  });

  // The handlers of each event, from Pace.on and Pace.once.
  const bindings = Object.create(null);

  // Removes the handlers of `event` that match `test`, and marks them so an
  // event that is firing right now skips them too.
  const removeBindings = (event, test) => {
    if (!bindings[event]) {
      return;
    }
    bindings[event] = bindings[event].filter((binding) => {
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
      bindings[event] ??= [];
      bindings[event].push({ handler, ctx, once });
    },

    once(event, handler, ctx) {
      Pace.on(event, handler, ctx, true);
    },

    off(event, handler) {
      removeBindings(event, (binding) => handler == null || binding.handler === handler);
    },

    trigger(event, ...args) {
      if (!bindings[event]) {
        return;
      }
      for (const binding of bindings[event].slice()) {
        if (binding.removed) {
          continue;
        }
        if (binding.once) {
          removeBindings(event, (other) => other === binding);
        }
        try {
          binding.handler.apply(binding.ctx ?? Pace, args);
        } catch (error) {
          reportException(error);
        }
      }
    },
  });

  // Applies the settings in `given`, from `channel` (named in warnings). A wrong
  // value or an unknown name is ignored with a warning; undefined means not given.
  // Each value is copied, then the copy is checked and kept, so changing the
  // page's own list later changes nothing. An error from reading a setting (a
  // getter that throws, say) is reported, and the other settings still apply.
  const applyOptions = (given, channel) => {
    if (given === undefined) {
      return;
    }
    try {
      if (Object.prototype.toString.call(given) !== '[object Object]') {
        warn(`ignored the options from ${channel}: expected an object, got ${describe(given)}.`);
        return;
      }
      for (const name of Object.keys(given)) {
        try {
          const value = copyValue(given[name]);
          if (value === undefined) {
            continue;
          }
          if (SETTINGS.has(name)) {
            const [, check] = SETTINGS.get(name);
            const problem = problemWith(check, value);
            if (problem) {
              warn(`ignored the ${name} option from ${channel}: expected ${check.expected}, got ${problem}.`);
            } else {
              options[name] = value;
            }
          } else if (RENAMED.has(name)) {
            warn(`ignored the ${name} option from ${channel}: use ${RENAMED.get(name)} instead.`);
          } else {
            const match = [...SETTINGS.keys()].find((known) => known.toLowerCase() === name.toLowerCase());
            warn(`ignored the unknown option ${name} from ${channel}.${match ? ` Did you mean ${match}?` : ''}`);
          }
        } catch (error) {
          reportException(error);
        }
      }
    } catch (error) {
      reportException(error);
    }
  };

  // Pace's own <script>, read with the DOM's getter: markup such as
  // <img name="currentScript"> replaces document.currentScript.
  const script = Object.getOwnPropertyDescriptor(Document.prototype, 'currentScript').get.call(document);

  const readAttribute = () => {
    const json = script?.getAttribute('data-pace-options');
    if (json == null) {
      return;
    }
    try {
      return JSON.parse(json);
    } catch {
      warn(`ignored the options from data-pace-options: expected valid JSON, got ${describe(json)}.`);
    }
  };

  applyOptions(window.paceOptions, 'window.paceOptions');
  applyOptions(readAttribute(), 'data-pace-options');

  Pace.getOptions = () => copyOptions(options);

  class Bar {
    // `settings`: the run's settings.
    constructor(settings) {
      this.settings = settings;
      this.progress = 0;
    }

    // The bar's element, created in the target the first time. Null while the
    // target doesn't exist yet, and after destroy().
    getElement() {
      if (this.destroyed) {
        return null;
      }
      if (this.el == null) {
        const targetElement = document.querySelector(this.settings.target);
        if (!targetElement) {
          return null;
        }
        this.el = document.createElement('div');
        this.el.className = 'pace pace-active';
        document.body.classList.remove('pace-done');
        document.body.classList.add('pace-running');
        const progress = document.createElement('div');
        progress.className = 'pace-progress' + (this.settings.className !== '' ? ' ' + this.settings.className : '');
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
      if (document.querySelector(this.settings.target) == null) {
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

  // The setting that turns tracking each kind of request on or off.
  const TRACK_SETTING = { xhr: 'trackXHR', fetch: 'trackFetch', socket: 'trackWebSockets' };

  // Whether to track a request of `kind` ('xhr', 'fetch' or 'socket'): true,
  // false, or 'force' (inside Pace.track). With its track setting off, a kind
  // isn't tracked, not even inside Pace.track.
  const shouldTrack = (kind, method) => {
    if (!options[TRACK_SETTING[kind]]) {
      return false;
    }
    if (ignoreStack[0] === 'track') {
      return 'force';
    }
    if (ignoreStack.length) {
      return false;
    }
    if (kind === 'socket') {
      return true;
    }
    method = String(method ?? 'GET').toUpperCase();
    return options.requestMethods.some((tracked) => tracked.toUpperCase() === method);
  };

  // What ignoreRequests patterns are matched against: a request's URL as the page
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

  // `pattern`: a string or a RegExp.
  const matches = (pattern, url) => {
    if (typeof pattern === 'string') {
      return url.includes(pattern);
    }
    // A pattern with the g or y flag keeps state between test() calls.
    pattern.lastIndex = 0;
    return pattern.test(url);
  };

  // `urls` from urlsToMatch().
  const shouldIgnoreURL = (urls) => {
    const patterns = options.ignoreRequests;
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
  // for it (maxWait).
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

  const beginRequest = (event) => {
    endRequest(event.request);
    openRequests.set(event.request, event);
    endCallbacks.set(event, []);
    // Pace waits for a request at most maxWait ms from when it was sent, so one
    // that never ends can't hold the bar forever. The request keeps going.
    if (options.maxWait !== false) {
      const timer = setTimeout(() => endRequest(event.request), options.maxWait);
      endCallbacks.get(event).push(() => clearTimeout(timer));
    }
    intercept.trigger('request', event);
  };

  // What open() decided about each XMLHttpRequest, used when it is sent.
  const opened = new WeakMap();

  // The kinds of request pace has hooked into.
  const hooked = { xhr: false, fetch: false, socket: false };

  // Hooks into each kind of request the first time its track setting is on, and
  // leaves the others alone. Wraps XMLHttpRequest.prototype.open and send, and
  // replaces WebSocket with a subclass, so the page keeps the native classes:
  // instanceof, constants, subclasses and other libraries' prototype patches keep
  // working. Replaces fetch with a function that behaves the same. Not in a class
  // on purpose: class bodies are strict mode, where assigning to a read-only
  // property (a page may lock these) throws.
  const installHooks = () => {
    if (options.trackXHR && !hooked.xhr) {
      hooked.xhr = true;
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
        beginRequest({ ...info, request: this });
        try {
          return send.apply(this, args);
        } catch (error) {
          endRequest(this);
          throw error;
        }
      };
    }
    if (options.trackWebSockets && !hooked.socket) {
      hooked.socket = true;
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
            beginRequest({ kind: 'socket', force: decision === 'force', request: this });
          }
        }
      };
    }
    if (options.trackFetch && !hooked.fetch && typeof window.fetch === 'function') {
      hooked.fetch = true;
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
        beginRequest(event);
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
    }, options.restartOnRequestAfter || 0);
  };

  // Fires 'request' for each tracked request as it starts.
  const intercept = new Events();
  intercept.on('request', onRequest);

  class AjaxMonitor {
    constructor() {
      this.complete = this.complete.bind(this);
      // The trackers of the watched requests that are still loading.
      this.elements = [];
      this.onRequest = (event) => this.watch(event);
      intercept.on('request', this.onRequest);
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
      intercept.off('request', this.onRequest);
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

  // Waits for an element to match each of `selectors` (waitFor).
  class ElementMonitor {
    constructor(selectors) {
      this.complete = this.complete.bind(this);
      this.elements = [];
      this.trackers = [];
      for (let i = 0, n = selectors.length; i < n; i++) {
        const tracker = new ElementTracker(selectors[i], this.complete);
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

  // Checks every 100 ms: no event tells when a selector starts to match, and a
  // MutationObserver misses matches that come from state, such as :checked.
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
        this.timer = setTimeout(() => this.check(), 100);
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

  // Done once the last 3 samples, 50 ms apart, average under 3 ms of lag, and
  // after at least 10 samples.
  class EventLagMonitor {
    constructor() {
      this.progress = 0;
      let avg = 0;
      const samples = [];
      let points = 0;
      let last = now();
      const interval = (this.interval = setInterval(() => {
        const diff = now() - last - 50;
        last = now();
        samples.push(diff);
        if (samples.length > 3) {
          samples.shift();
        }
        avg = avgAmplitude(samples);
        if (++points >= 10 && avg < 3) {
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
    // `settings`: the run's settings.
    constructor(source, settings) {
      this.source = source;
      this.settings = settings;
      this.last = this.sinceLastUpdate = 0;
      this.rate = settings.initialRate;
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
        this.catchup = (val - this.progress) / this.settings.catchupTime;
        this.sinceLastUpdate = 0;
        this.last = val;
      }
      if (val > this.progress) {
        this.progress += this.catchup * frameTime;
      }
      const scaling = 1 - Math.pow(this.progress / 100, this.settings.easeFactor);
      this.progress += scaling * this.rate * frameTime;
      this.progress = Math.min(this.lastProgress + this.settings.maxProgressPerFrame, this.progress);
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
  let bar = new Bar(copyOptions(options));


  // Waiting or running: a new request joins it instead of restarting the bar.
  const isActive = () => run != null && (run.state === 'waiting' || run.state === 'running');

  const handlePushState = () => {
    if (options.restartOnNavigation) {
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
      running = false;
      bar.finish();
      Pace.trigger('hide');
    }, Math.max(current.settings.hideDelay, current.settings.minVisible - shownFor, 0));
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
            scaler = new Scaler(element, current.settings);
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

  // Whether pace has started a run, after which it hooks into requests as soon
  // as their track settings are turned on.
  let started = false;

  const beginRun = () => {
    started = true;
    installHooks();
    // A run keeps the settings it started with.
    const settings = copyOptions(options);
    const current = {
      state: 'waiting',
      settings,
      collectors: [],
      sources: [],
      scalers: new WeakMap(),
      uniScaler: new Scaler(null, settings),
    };
    const add = (collector) => {
      current.collectors.push(collector);
      current.sources.push(collector);
    };
    // Built before the run counts as started: if an extra source throws, pace
    // stays idle.
    try {
      add(new AjaxMonitor());
      if (settings.waitFor.length) {
        add(new ElementMonitor(settings.waitFor));
      }
      if (settings.trackDocument) {
        add(new DocumentMonitor());
      }
      if (settings.trackEventLag) {
        add(new EventLagMonitor());
      }
      const extraSources = settings.extraSources;
      for (let i = 0, n = extraSources.length; i < n; i++) {
        current.sources.push(new extraSources[i](copyOptions(settings)));
      }
    } catch (error) {
      stopCollectors(current);
      throw error;
    }
    run = current;
    running = true;
    bar = new Bar(settings);
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

  // Request settings apply to the next request; the others from the next run.
  const configure = (given, channel) => {
    applyOptions(given, channel);
    if (started) {
      installHooks();
    }
  };

  Pace.configure = (given) => {
    configure(given, 'Pace.configure()');
  };

  Pace.start = (given) => {
    configure(given, 'Pace.start()');
    if (isActive()) {
      return;
    }
    endRun(); // a run that is finishing gives way to the new one
    beginRun();
  };

  Pace.stop = () => {
    endRun();
    running = false;
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

  // Only now, when it's complete, can a later copy use this one.
  Object.defineProperty(window, FIRST_COPY, { value: Pace });

  if (!exportPace(Pace) && options.startOnPageLoad) {
    Pace.start();
  }
})();
