(function() {
  var $, AjaxMonitor, Bar, CATCHUP_TIME, DocumentMonitor, EASE_FACTOR, ELEMENT_CHECK_INTERVAL, ElementMonitor, ElementTracker, EventLagMonitor, Events, GHOST_TIME, INITIAL_RATE, MAX_PROGRESS_PER_FRAME, MIN_TIME, RequestIntercept, RequestTracker, Scaler, animation, avgKey, bar, check, go, handlePageChange, init, intercept, now, reset, result, runAnimation, scalers, sources, uniScaler, _XMLHttpRequest, _pushState, _replaceState,
    __slice = [].slice,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  $ = jQuery;

  CATCHUP_TIME = 500;

  INITIAL_RATE = .03;

  MIN_TIME = 500;

  GHOST_TIME = 250;

  ELEMENT_CHECK_INTERVAL = 100;

  MAX_PROGRESS_PER_FRAME = 10;

  EASE_FACTOR = 1.25;

  now = function() {
    var _ref;
    return (_ref = typeof performance !== "undefined" && performance !== null ? typeof performance.now === "function" ? performance.now() : void 0 : void 0) != null ? _ref : +(new Date);
  };

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

  avgKey = function() {
    var args, arr, item, key, sum, _i, _len;
    arr = arguments[0], key = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
    sum = 0;
    for (_i = 0, _len = arr.length; _i < _len; _i++) {
      item = arr[_i];
      sum += result.apply(null, [item, key].concat(__slice.call(args)));
    }
    return sum / arr.length;
  };

  Bar = (function() {
    function Bar() {
      this.progress = 0;
    }

    Bar.prototype.getElement = function() {
      if (this.el == null) {
        this.el = $('<div>')[0];
        this.el.className = 'mprogress-bar';
        $('body').prepend(this.el);
      }
      return this.el;
    };

    Bar.prototype.hide = function() {
      return this.getElement().style.display = 'none';
    };

    Bar.prototype.update = function(prog) {
      this.progress = prog;
      return this.render();
    };

    Bar.prototype.destroy = function() {
      this.getElement().parentNode.removeChild(this.getElement);
      return this.el = void 0;
    };

    Bar.prototype.render = function() {
      if (!$('body').length) {
        return false;
      }
      return this.getElement().style.width = "" + this.progress + "%";
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

  RequestIntercept = (function(_super) {
    __extends(RequestIntercept, _super);

    function RequestIntercept() {
      var _intercept;
      RequestIntercept.__super__.constructor.apply(this, arguments);
      _intercept = this;
      window.XMLHttpRequest = function() {
        var req, _open;
        req = new _XMLHttpRequest;
        _open = req.open;
        req.open = function(type, url, async) {
          _intercept.trigger('request', {
            type: type,
            url: url,
            request: req
          });
          return _open.apply(req, arguments);
        };
        return req;
      };
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
      var size,
        _this = this;
      this.progress = 0;
      size = null;
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
      request.onload = request.onerror = request.ontimeout = request.onabort = function() {
        return _this.progress = 100;
      };
    }

    return RequestTracker;

  })();

  ElementMonitor = (function() {
    function ElementMonitor() {
      var selectors, set, _i, _len;
      selectors = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      this.elements = [];
      for (_i = 0, _len = selectors.length; _i < _len; _i++) {
        set = selectors[_i];
        this.elements.push(new ElementTracker(set));
      }
    }

    return ElementMonitor;

  })();

  ElementTracker = (function() {
    function ElementTracker(selectors) {
      this.progress = 0;
      if (typeof selectors === 'string') {
        this.selector = selectors;
      } else {
        this.selector = selectors.join(',');
      }
      this.check();
    }

    ElementTracker.prototype.check = function() {
      var _this = this;
      if ($(this.selector).length) {
        return this.done();
      } else {
        return setTimeout((function() {
          return _this.check();
        }), ELEMENT_CHECK_INTERVAL);
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
      var _this = this;
      this.progress = 0;
      document.onreadystatechange = function() {
        if (_this.states[document.readyState] != null) {
          return _this.progress = _this.states[document.readyState];
        }
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
        if (points++ > 20 && Math.abs(avg) < 3) {
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
      this.rate = 0.03;
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
        this.catchup = (val - this.progress) / CATCHUP_TIME;
        this.sinceLastUpdate = 0;
        this.last = val;
      }
      if (val > this.progress) {
        this.progress += this.catchup * frameTime;
      }
      scaling = 1 - Math.pow(this.progress / 100, EASE_FACTOR);
      this.progress += scaling * this.rate * frameTime;
      this.progress = Math.max(0, this.progress);
      this.progress = Math.min(100, this.progress);
      this.progress = Math.min(this.lastProgress + MAX_PROGRESS_PER_FRAME, this.progress);
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

  if (window.pushState != null) {
    _pushState = window.pushState;
    window.pushState = function() {
      handlePageChange();
      return _pushState.apply(null, arguments);
    };
  }

  if (window.replaceState != null) {
    _replaceState = window.replaceState;
    window.replaceState = function() {
      handlePageChange();
      return _replaceState.apply(null, arguments);
    };
  }

  (init = function() {
    sources = [new AjaxMonitor, new ElementMonitor('body'), new DocumentMonitor, new EventLagMonitor];
    scalers = [];
    bar = new Bar;
    return uniScaler = new Scaler;
  })();

  reset = function() {
    bar.destroy();
    if (animation != null) {
      cancelAnimationFrame(animation);
      animation = null;
    }
    return init();
  };

  handlePageChange = function() {
    reset();
    return go();
  };

  go = function() {
    bar.render();
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
      if (bar.done() || done) {
        bar.update(100);
        return setTimeout(function() {
          return bar.hide();
        }, Math.max(GHOST_TIME, Math.min(MIN_TIME, now() - start)));
      } else {
        return enqueueNextFrame();
      }
    });
  };

  (check = function() {
    bar.render();
    if (!$('.mprogress-bar').length) {
      return setTimeout(check, 50);
    } else {
      return go();
    }
  })();

}).call(this);
