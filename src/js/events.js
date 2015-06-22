/*
 * Evented
 */

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

// NOTE: Replace usage with Evented
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

export default {Events, Evented};
