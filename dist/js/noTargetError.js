/*
 * No Target Error
 */

"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

var NoTargetError = (function (_Error) {
  function NoTargetError() {
    _classCallCheck(this, NoTargetError);

    if (_Error != null) {
      _Error.apply(this, arguments);
    }
  }

  _inherits(NoTargetError, _Error);

  return NoTargetError;
})(Error);

exports["default"] = NoTargetError;
module.exports = exports["default"];