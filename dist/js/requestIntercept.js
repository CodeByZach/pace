/* globals window */

'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

var _events = require('./events');

var _utils = require('./utils');

var _XMLHttpRequest = window.XMLHttpRequest;
var _XDomainRequest = window.XDomainRequest;
var _WebSocket = window.WebSocket;

// We should only ever instantiate one of these

var RequestIntercept = (function (_Events) {

  // NOTE: Abstract shouldtrack later

  function RequestIntercept(options, shouldTrack) {
    var _this = this,
        _arguments2 = arguments;

    if (options === undefined) options = {};

    _classCallCheck(this, RequestIntercept);

    _get(Object.getPrototypeOf(RequestIntercept.prototype), 'constructor', this).call(this);

    var trackWebSockets = options.ajax.trackWebSockets;

    var monitorXHR = function monitorXHR(req) {
      var _open = req.open;

      req.open = function (type, url, async) {
        if (shouldTrack(type)) {
          _this.trigger('request', { type: type, url: url, request: req });
        }
        _open.apply(req, _arguments2);
      };
    };

    // XMLHttpRequest
    window.XMLHttpRequest = function (flags) {
      var req = new _XMLHttpRequest(flags);
      monitorXHR(req);
      return req;
    };

    try {
      (0, _utils.extendNative)(window.XMLHttpRequest, _XMLHttpRequest);
    } catch (e) {}

    // XDomainRequest
    if (typeof _XDomainRequest !== 'undefined') {
      window.XDomainRequest = function () {
        var req = new _XDomainRequest();
        monitorXHR(req);
        return req;
      };

      try {
        (0, _utils.extendNative)(window.XDomainRequest, _XDomainRequest);
      } catch (e) {}
    }

    // WebSocket
    if (typeof _WebSocket !== 'undefined' && trackWebSockets) {
      window.WebSocket = function (url, protocols) {
        var req = undefined;
        if (typeof protocols !== 'undefined') {
          req = new _WebSocket(url, protocols);
        } else {
          req = new _WebSocket(url);
        }

        if (shouldTrack('socket')) {
          _this.trigger('request', {
            type: 'socket',
            url: url,
            protocols: protocols,
            request: req
          });
        }

        return req;
      };

      try {
        (0, _utils.extendNative)(window.WebSocket, _WebSocket);
      } catch (e) {}
    }
  }

  _inherits(RequestIntercept, _Events);

  return RequestIntercept;
})(_events.Events);

exports['default'] = RequestIntercept;
module.exports = exports['default'];