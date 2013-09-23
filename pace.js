(function() {
  var AjaxMonitor, Bar, DocumentMonitor, ElementMonitor, ElementTracker, EventLagMonitor, Events, RequestIntercept, RequestTracker, SOURCE_KEYS, Scaler, animation, bar, cancelAnimation, cancelAnimationFrame, defaultOptions, extend, getFromDOM, handlePushState, init, intercept, now, options, requestAnimationFrame, result, runAnimation, scalers, sources, uniScaler, _XDomainRequest, _XMLHttpRequest, _pushState, _replaceState,
    __slice = [].slice,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  defaultOptions = {
    catchupTime: 500,
    initialRate: .03,
    minTime: 500,
    ghostTime: 250,
    maxProgressPerFrame: 10,
    easeFactor: 1.25,
    startOnPageLoad: true,
    restartOnPushState: true,
    restartOnBackboneRoute: true,
    elements: {
      checkInterval: 100,
      selectors: ['body']
    },
    eventLag: {
      minSamples: 10
    },
    target: 'body'
  };

  now = function() {
    var _ref;
    return (_ref = typeof performance !== "undefined" && performance !== null ? typeof performance.now === "function" ? performance.now() : void 0 : void 0) != null ? _ref : +(new Date);
  };

  requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

  cancelAnimationFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame;

  if (requestAnimationFrame == null) {
    requestAnimationFrame = function(fn) {
      return setTimeout(fn, 50);
    };
    cancelAnimationFrame = function(id) {
      return clearTimeout(id);
    };
  }

  runAnimation = function(fn) {
    var last, tick;
    last = now();
    tick = function() {
      var diff;
      diff = now() - last;
      last = now();
      return fn(diff, function() {
        return requestAnimationFrame(tick);
      });
    };
    return tick();
  };

  result = function() {
    var args, key, obj;
    obj = arguments[0], key = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
    if (typeof obj[key] === 'function') {
      return obj[key].apply(obj, args);
    } else {
      return obj[key];
    }
  };

  extend = function() {
    var key, out, source, sources, val, _i, _len;
    out = arguments[0], sources = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    for (_i = 0, _len = sources.length; _i < _len; _i++) {
      source = sources[_i];
      if (source) {
        for (key in source) {
          if (!__hasProp.call(source, key)) continue;
          val = source[key];
          if ((out[key] != null) && typeof out[key] === 'object' && (val != null) && typeof val === 'object') {
            extend(out[key], val);
          } else {
            out[key] = val;
          }
        }
      }
    }
    return out;
  };

  getFromDOM = function(key, json) {
    var data, e, el;
    if (key == null) {
      key = 'options';
    }
    if (json == null) {
      json = true;
    }
    el = document.querySelector("[data-pace-" + key + "]");
    if (!el) {
      return;
    }
    data = el.getAttribute("data-pace-" + key);
    if (!json) {
      return data;
    }
    try {
      return JSON.parse(data);
    } catch (_error) {
      e = _error;
      return typeof console !== "undefined" && console !== null ? console.error("Error parsing inline pace options", e) : void 0;
    }
  };

  if (window.Pace == null) {
    window.Pace = {};
  }

  options = Pace.options = extend(defaultOptions, window.paceOptions, getFromDOM());

  Bar = (function() {
    function Bar() {
      this.progress = 0;
    }

    Bar.prototype.getElement = function() {
      var targetElement;
      if (this.el == null) {
        this.el = document.createElement('div');
        this.el.className = "pace pace-active";
        this.el.innerHTML = '<div class="pace-progress">\n  <div class="pace-progress-inner"></div>\n</div>\n<div class="pace-activity"></div>';
        targetElement = document.querySelector(options.target);
        if (targetElement.firstChild != null) {
          targetElement.insertBefore(this.el, targetElement.firstChild);
        } else {
          targetElement.appendChild(this.el);
        }
      }
      return this.el;
    };

    Bar.prototype.finish = function() {
      var el;
      el = this.getElement();
      el.className = el.className.replace('pace-active', '');
      return el.className += ' pace-inactive';
    };

    Bar.prototype.update = function(prog) {
      this.progress = prog;
      return this.render();
    };

    Bar.prototype.destroy = function() {
      this.getElement().parentNode.removeChild(this.getElement());
      return this.el = void 0;
    };

    Bar.prototype.render = function() {
      var el, progressStr;
      if (document.querySelector(options.target) == null) {
        return false;
      }
      el = this.getElement();
      el.children[0].style.width = "" + this.progress + "%";
      if (!this.lastRenderedProgress || this.lastRenderedProgress | 0 !== this.progress | 0) {
        el.setAttribute('data-progress-text', "" + (this.progress | 0) + "%");
        if (this.progress >= 100) {
          progressStr = '99';
        } else {
          progressStr = this.progress < 10 ? "0" : "";
          progressStr += this.progress | 0;
        }
        el.setAttribute('data-progress', "" + progressStr);
      }
      return this.lastRenderedProgress = this.progress;
    };

    Bar.prototype.done = function() {
      return this.progress >= 100;
    };

    return Bar;

  })();

  Events = (function() {
    function Events() {
      this.bindings = {};
    }

    Events.prototype.trigger = function(name, val) {
      var binding, _i, _len, _ref, _results;
      if (this.bindings[name] != null) {
        _ref = this.bindings[name];
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          binding = _ref[_i];
          _results.push(binding.call(this, val));
        }
        return _results;
      }
    };

    Events.prototype.on = function(name, fn) {
      var _base;
      if ((_base = this.bindings)[name] == null) {
        _base[name] = [];
      }
      return this.bindings[name].push(fn);
    };

    return Events;

  })();

  _XMLHttpRequest = window.XMLHttpRequest;

  _XDomainRequest = window.XDomainRequest;

  RequestIntercept = (function(_super) {
    __extends(RequestIntercept, _super);

    function RequestIntercept() {
      var monitor,
        _this = this;
      RequestIntercept.__super__.constructor.apply(this, arguments);
      monitor = function(req) {
        var _open;
        _open = req.open;
        return req.open = function(type, url, async) {
          _this.trigger('request', {
            type: type,
            url: url,
            request: req
          });
          return _open.apply(req, arguments);
        };
      };
      window.XMLHttpRequest = function() {
        var req;
        req = new _XMLHttpRequest;
        monitor(req);
        return req;
      };
      if (_XDomainRequest != null) {
        window.XDomainRequest = function() {
          var req;
          req = new _XDomainRequest;
          monitor(req);
          return req;
        };
      }
    }

    return RequestIntercept;

  })(Events);

  intercept = new RequestIntercept;

  AjaxMonitor = (function() {
    function AjaxMonitor() {
      var _this = this;
      this.elements = [];
      intercept.on('request', function(_arg) {
        var request;
        request = _arg.request;
        return _this.watch(request);
      });
    }

    AjaxMonitor.prototype.watch = function(request) {
      var tracker;
      tracker = new RequestTracker(request);
      return this.elements.push(tracker);
    };

    return AjaxMonitor;

  })();

  RequestTracker = (function() {
    function RequestTracker(request) {
      var handler, size, _fn, _i, _len, _onprogress, _onreadystatechange, _ref,
        _this = this;
      this.progress = 0;
      if (request.onprogress !== void 0) {
        size = null;
        _onprogress = request.onprogress;
        request.onprogress = function() {
          var e, headers, name, val;
          try {
            headers = request.getAllResponseHeaders();
            for (name in headers) {
              val = headers[name];
              if (name.toLowerCase() === 'content-length') {
                size = +val;
                break;
              }
            }
          } catch (_error) {
            e = _error;
          }
          if (size != null) {
            try {
              return _this.progress = request.responseText.length / size;
            } catch (_error) {
              e = _error;
            }
          } else {
            return _this.progress = _this.progress + (100 - _this.progress) / 2;
          }
        };
        if (typeof _onprogress === "function") {
          _onprogress.apply(null, arguments);
        }
        _ref = ['onload', 'onabort', 'ontimeout', 'onerror'];
        _fn = function() {
          var fn;
          fn = request[handler];
          return request[handler] = function() {
            _this.progress = 100;
            return typeof fn === "function" ? fn.apply(null, arguments) : void 0;
          };
        };
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          handler = _ref[_i];
          _fn();
        }
      } else {
        _onreadystatechange = request.onreadystatechange;
        request.onreadystatechange = function() {
          var _ref1;
          if ((_ref1 = request.readyState) === 0 || _ref1 === 4) {
            _this.progress = 100;
          } else if (request.readyState === 3) {
            _this.progress = 50;
          }
          return typeof _onreadystatechange === "function" ? _onreadystatechange.apply(null, arguments) : void 0;
        };
      }
    }

    return RequestTracker;

  })();

  ElementMonitor = (function() {
    function ElementMonitor(options) {
      var selector, _i, _len, _ref;
      if (options == null) {
        options = {};
      }
      this.elements = [];
      if (options.selectors == null) {
        options.selectors = [];
      }
      _ref = options.selectors;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        selector = _ref[_i];
        this.elements.push(new ElementTracker(selector));
      }
    }

    return ElementMonitor;

  })();

  ElementTracker = (function() {
    function ElementTracker(selector) {
      this.selector = selector;
      this.progress = 0;
      this.check();
    }

    ElementTracker.prototype.check = function() {
      var _this = this;
      if (document.querySelector(this.selector)) {
        return this.done();
      } else {
        return setTimeout((function() {
          return _this.check();
        }), options.elements.checkInterval);
      }
    };

    ElementTracker.prototype.done = function() {
      return this.progress = 100;
    };

    return ElementTracker;

  })();

  DocumentMonitor = (function() {
    DocumentMonitor.prototype.states = {
      loading: 0,
      interactive: 50,
      complete: 100
    };

    function DocumentMonitor() {
      var _onreadystatechange,
        _this = this;
      this.progress = 0;
      _onreadystatechange = document.onreadystatechange;
      document.onreadystatechange = function() {
        if (_this.states[document.readyState] != null) {
          _this.progress = _this.states[document.readyState];
        }
        return typeof _onreadystatechange === "function" ? _onreadystatechange.apply(null, arguments) : void 0;
      };
    }

    return DocumentMonitor;

  })();

  EventLagMonitor = (function() {
    function EventLagMonitor() {
      var avg, last, points,
        _this = this;
      this.progress = 0;
      avg = 0;
      points = 0;
      last = now();
      setInterval(function() {
        var diff;
        diff = now() - last - 50;
        last = now();
        avg = avg + (diff - avg) / 15;
        if (points++ > options.eventLag.minSamples && Math.abs(avg) < 3) {
          avg = 0;
        }
        return _this.progress = 100 * (3 / (avg + 3));
      }, 50);
    }

    return EventLagMonitor;

  })();

  Scaler = (function() {
    function Scaler(source) {
      this.source = source;
      this.last = this.sinceLastUpdate = 0;
      this.rate = options.initialRate;
      this.catchup = 0;
      this.progress = this.lastProgress = 0;
      if (this.source != null) {
        this.progress = result(this.source, 'progress');
      }
    }

    Scaler.prototype.tick = function(frameTime, val) {
      var scaling;
      if (val == null) {
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
        this.progress += this.catchup * frameTime;
      }
      scaling = 1 - Math.pow(this.progress / 100, options.easeFactor);
      this.progress += scaling * this.rate * frameTime;
      this.progress = Math.min(this.lastProgress + options.maxProgressPerFrame, this.progress);
      this.progress = Math.max(0, this.progress);
      this.progress = Math.min(100, this.progress);
      this.lastProgress = this.progress;
      return this.progress;
    };

    return Scaler;

  })();

  sources = null;

  scalers = null;

  bar = null;

  uniScaler = null;

  animation = null;

  cancelAnimation = null;

  handlePushState = function() {
    if (options.restartOnPushState) {
      return Pace.restart();
    }
  };

  if (window.history.pushState != null) {
    _pushState = window.history.pushState;
    window.history.pushState = function() {
      handlePushState();
      return _pushState.apply(window.history, arguments);
    };
  }

  if (window.history.replaceState != null) {
    _replaceState = window.history.replaceState;
    window.history.replaceState = function() {
      handlePushState();
      return _replaceState.apply(window.history, arguments);
    };
  }

  if (options.restartOnBackboneRoute) {
    setTimeout(function() {
      if (window.Backbone == null) {
        return;
      }
      return Backbone.History.on('route', function(router, name) {
        var routeName, rule, _i, _len, _results;
        if (!(rule = options.restartOnBackboneRoute)) {
          return;
        }
        if (typeof rule === 'object') {
          _results = [];
          for (_i = 0, _len = rule.length; _i < _len; _i++) {
            routeName = rule[_i];
            if (!(routeName === name)) {
              continue;
            }
            Pace.restart();
            break;
          }
          return _results;
        } else {
          return Pace.restart();
        }
      });
    }, 0);
  }

  SOURCE_KEYS = {
    ajax: AjaxMonitor,
    elements: ElementMonitor,
    document: DocumentMonitor,
    eventLag: EventLagMonitor
  };

  (init = function() {
    var source, type, _i, _j, _len, _len1, _ref, _ref1, _ref2;
    sources = [];
    _ref = ['ajax', 'elements', 'document', 'eventLag'];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      type = _ref[_i];
      if (options[type] !== false) {
        sources.push(new SOURCE_KEYS[type](options[type]));
      }
    }
    _ref2 = (_ref1 = options.extraSources) != null ? _ref1 : [];
    for (_j = 0, _len1 = _ref2.length; _j < _len1; _j++) {
      source = _ref2[_j];
      sources.push(new source(options));
    }
    bar = new Bar;
    scalers = [];
    return uniScaler = new Scaler;
  })();

  Pace.stop = function() {
    bar.destroy();
    cancelAnimation = true;
    if (animation != null) {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(animation);
      }
      animation = null;
    }
    return init();
  };

  Pace.restart = function() {
    Pace.stop();
    return Pace.go();
  };

  Pace.go = function() {
    bar.render();
    cancelAnimation = false;
    return animation = runAnimation(function(frameTime, enqueueNextFrame) {
      var avg, count, done, element, elements, i, j, remaining, scaler, scalerList, source, start, sum, _i, _j, _len, _len1, _ref;
      remaining = 100 - bar.progress;
      count = sum = 0;
      done = true;
      for (i = _i = 0, _len = sources.length; _i < _len; i = ++_i) {
        source = sources[i];
        scalerList = scalers[i] != null ? scalers[i] : scalers[i] = [];
        elements = (_ref = source.elements) != null ? _ref : [source];
        for (j = _j = 0, _len1 = elements.length; _j < _len1; j = ++_j) {
          element = elements[j];
          scaler = scalerList[j] != null ? scalerList[j] : scalerList[j] = new Scaler(element);
          done &= scaler.done;
          if (scaler.done) {
            continue;
          }
          count++;
          sum += scaler.tick(frameTime);
        }
      }
      avg = sum / count;
      bar.update(uniScaler.tick(frameTime, avg));
      start = now();
      if (bar.done() || done || cancelAnimation) {
        bar.update(100);
        return setTimeout(function() {
          return bar.finish();
        }, Math.max(options.ghostTime, Math.min(options.minTime, now() - start)));
      } else {
        return enqueueNextFrame();
      }
    });
  };

  Pace.start = function(_options) {
    extend(options, _options);
    bar.render();
    if (!document.querySelector('.pace')) {
      return setTimeout(Pace.start, 50);
    } else {
      return Pace.go();
    }
  };

  if (typeof define === 'function' && define.amd) {
    define(function() {
      return Pace;
    });
  } else if (typeof exports === 'object') {
    module.exports = Pace;
  } else {
    if (options.startOnPageLoad) {
      Pace.start();
    }
  }

}).call(this);
