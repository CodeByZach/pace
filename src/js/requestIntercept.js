/* globals window */

import {Events} from './events';
import {extendNative} from './utils';

const {
  XMLHttpRequest: _XMLHttpRequest,
  XDomainRequest: _XDomainRequest,
  WebSocket: _WebSocket
} = window;


// We should only ever instantiate one of these
export default class RequestIntercept extends Events {

  // NOTE: Abstract shouldtrack later
  constructor(options={}, shouldTrack) {
    super();

    const {trackWebSockets} = options.ajax;

    const monitorXHR = (req) => {
      const {open: _open} = req;
      req.open = (type, url, async) => {
        if (shouldTrack(type)) {
          this.trigger('request', {type, url, request: req});
        }
        _open.apply(req, arguments);
      };
    };

    // XMLHttpRequest
    window.XMLHttpRequest = (flags) => {
      const req = new _XMLHttpRequest(flags);
      monitorXHR(req);
      return req;
    };

    try {
      extendNative(window.XMLHttpRequest, _XMLHttpRequest);
    } catch(e) {}

    // XDomainRequest
    if (typeof _XDomainRequest !== 'undefined') {
      window.XDomainRequest = () => {
        const req = new _XDomainRequest;
        monitorXHR(req);
        return req;
      };

      try {
        extendNative(window.XDomainRequest, _XDomainRequest);
      } catch(e) {}
    }

    // WebSocket
    if (typeof _WebSocket !== 'undefined' && trackWebSockets) {
      window.WebSocket = (url, protocols) => {
        let req;
        if (typeof protocols !== 'undefined') {
          req = new _WebSocket(url, protocols);
        } else {
          req = new _WebSocket(url);
        }

        if (shouldTrack('socket')) {
          this.trigger('request', {
            type: 'socket',
            url: url,
            protocols: protocols,
            request: req
          });
        }

        return req;
      };

      try {
        extendNative(window.WebSocket, _WebSocket);
      } catch(e) {}
    }

  }

}
