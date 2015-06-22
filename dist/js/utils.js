/* globals window performance */

/*
 * Utils
 */

'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
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
  for (var _len = arguments.length, args = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
    args[_key - 2] = arguments[_key];
  }

  if (typeof obj[key] === 'function') {
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

exports['default'] = {
  now: now,
  requestAnimationFrame: requestAnimationFrame,
  cancelAnimationFrame: cancelAnimationFrame,
  runAnimation: runAnimation,
  result: result,
  extend: extend,
  extendNative: extendNative,
  average: average,
  getFromDOM: getFromDOM
};
module.exports = exports['default'];