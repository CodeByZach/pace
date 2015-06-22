/*
 * Bar
 */

'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _noTargetError = require('./noTargetError');

var _noTargetError2 = _interopRequireDefault(_noTargetError);

var Bar = (function () {
  function Bar(options) {
    _classCallCheck(this, Bar);

    this.options = options;
    this.progress = 0;
  }

  _createClass(Bar, [{
    key: 'getElement',
    value: function getElement() {
      if (typeof this.el === 'undefined') {
        var targetElement = document.querySelector(this.options.target);

        if (!targetElement) {
          throw new _noTargetError2['default']();
        }

        this.el = document.createElement('div');
        this.el.className = 'pace pace-active';

        document.body.className = document.body.className.replace(/pace-done/g, '');
        document.body.className += ' pace-running';

        this.el.innerHTML = ['<div class="pace-progress">', '<div class="pace-progress-inner"></div>', '</div>', '<div class="pace-activity"></div>'].join('');

        if (typeof targetElement.firstChild !== 'undefined') {
          targetElement.insertBefore(this.el, targetElement.firstChild);
        } else {
          targetElement.appendChild(this.el);
        }
      }

      return this.el;
    }
  }, {
    key: 'finish',
    value: function finish() {
      var el = this.getElement();

      el.className = el.className.replace('pace-active', '');
      el.className += ' pace-inactive';

      document.body.className = document.body.className.replace('pace-running', '');
      document.body.className += ' pace-done';
    }
  }, {
    key: 'update',
    value: function update(progress) {
      this.progress = progress;
      this.render();
    }
  }, {
    key: 'destroy',
    value: function destroy() {
      try {
        this.getElement().parentNode.removeChild(this.getElement());
      } catch (e) {
        if (e instanceof _noTargetError2['default']) {
          this.el = undefined;
        }
      }
    }
  }, {
    key: 'render',
    value: function render() {
      var target = document.querySelector(this.options.target);
      if (!target) {
        return false;
      }

      var el = this.getElement();

      var transform = 'translate3d(' + this.progress + '%, 0, 0)';
      ['webkitTransform', 'msTransform', 'transform'].forEach(function (key) {
        el.children[0].style[key] = transform;
      });

      if (!this.lastRenderedProgress || (this.lastRenderedProgress | 0) !== (this.progress | 0)) {
        // The whole-part of the number has changed
        el.children[0].setAttribute('data-progress-text', '' + (this.progress | 0) + '%');

        var progressStr = undefined;
        if (this.progress >= 100) {
          // We cap it at 99 so we can use prefix-based attribute selectors
          progressStr = '99';
        } else {
          progressStr = this.progress < 10 ? '0' : '';
          progressStr += this.progress | 0;
        }

        el.children[0].setAttribute('data-progress', '' + progressStr);
      }

      this.lastRenderedProgress = this.progress;
    }
  }, {
    key: 'done',
    value: function done() {
      return this.progress >= 100;
    }
  }]);

  return Bar;
})();

exports['default'] = Bar;
module.exports = exports['default'];