/* globals window performance */

/*
 * Utils
 */

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

export default {
  now,
  requestAnimationFrame,
  cancelAnimationFrame,
  runAnimation,
  result,
  extend,
  extendNative,
  average,
  getFromDOM
};
