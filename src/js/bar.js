/*
 * Bar
 */

import NoTargetError from './noTargetError';

export default class Bar {

  constructor(options) {
    this.options = options;
    this.progress = 0;
  }

  getElement() {
    if (typeof this.el === 'undefined') {
      const targetElement = document.querySelector(this.options.target);

      if (!targetElement) {
        throw new NoTargetError;
      }

      this.el = document.createElement('div');
      this.el.className = "pace pace-active";

      document.body.className = document.body.className.replace(/pace-done/g, '');
      document.body.className += ' pace-running';

      this.el.innerHTML = [
        '<div class="pace-progress">',
          '<div class="pace-progress-inner"></div>',
        '</div>',
        '<div class="pace-activity"></div>'
      ].join('');

      if (typeof targetElement.firstChild !== 'undefined') {
        targetElement.insertBefore(this.el, targetElement.firstChild);
      } else {
        targetElement.appendChild(this.el);
      }
    }

    return this.el;
  }

  finish() {
    const el = this.getElement();

    el.className = el.className.replace('pace-active', '');
    el.className += ' pace-inactive';

    document.body.className = document.body.className.replace('pace-running', '');
    document.body.className += ' pace-done';
  }

  update(progress) {
    this.progress = progress;
    this.render();
  }

  destroy() {
    try {
      this.getElement().parentNode.removeChild(this.getElement());
    } catch (e) {
      if (e instanceof NoTargetError) {
        this.el = undefined;
      }
    }
  }

  render() {
    const target = document.querySelector(this.options.target);
    if (!target) {
      return false;
    }

    const el = this.getElement();

    const transform = `translate3d(${this.progress}%, 0, 0)`;
    ['webkitTransform', 'msTransform', 'transform'].forEach(key => {
      el.children[0].style[key] = transform;
    });

    if (!this.lastRenderedProgress || (this.lastRenderedProgress | 0) !== (this.progress | 0)) {
      // The whole-part of the number has changed
      el.children[0].setAttribute('data-progress-text', `${this.progress | 0}%`);

      let progressStr;
      if (this.progress >= 100) {
        // We cap it at 99 so we can use prefix-based attribute selectors
        progressStr = '99';
      } else {
        progressStr = this.progress < 10 ? '0' : '';
        progressStr += this.progress | 0;
      }

      el.children[0].setAttribute('data-progress', `${progressStr}`);
    }

    this.lastRenderedProgress = this.progress;
  }

  done() {
    return this.progress >= 100;
  }
}
