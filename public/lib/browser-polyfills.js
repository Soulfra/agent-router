/**
 * Browser Polyfills for Legacy Browsers
 *
 * Supports:
 * - Internet Explorer 6-11
 * - Netscape Navigator 9+
 * - AOL Explorer
 * - Opera 10-14 (Presto engine)
 * - Old Safari 5-9
 * - Old Chrome 1-48
 * - Old Firefox 3-35
 *
 * Provides:
 * - ES5 polyfills (Array, Object, String methods)
 * - ES6 polyfills (Promise, fetch, Object.assign, Array.from)
 * - DOM polyfills (classList, CustomEvent, addEventListener)
 * - Console polyfills
 */

(function(window) {
  'use strict';

  // =========================================================
  // Console polyfill (for IE < 9)
  // =========================================================
  if (!window.console) {
    window.console = {
      log: function() {},
      error: function() {},
      warn: function() {},
      info: function() {},
      debug: function() {},
      trace: function() {},
      dir: function() {},
      group: function() {},
      groupEnd: function() {},
      time: function() {},
      timeEnd: function() {},
      assert: function() {},
      clear: function() {}
    };
  }

  // =========================================================
  // Array polyfills (ES5)
  // =========================================================

  // Array.isArray (IE < 9)
  if (!Array.isArray) {
    Array.isArray = function(arg) {
      return Object.prototype.toString.call(arg) === '[object Array]';
    };
  }

  // Array.prototype.forEach (IE < 9)
  if (!Array.prototype.forEach) {
    Array.prototype.forEach = function(callback, thisArg) {
      if (this == null) throw new TypeError('this is null or not defined');
      var O = Object(this);
      var len = O.length >>> 0;
      if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
      var k = 0;
      while (k < len) {
        if (k in O) {
          callback.call(thisArg, O[k], k, O);
        }
        k++;
      }
    };
  }

  // Array.prototype.map (IE < 9)
  if (!Array.prototype.map) {
    Array.prototype.map = function(callback, thisArg) {
      if (this == null) throw new TypeError('this is null or not defined');
      var O = Object(this);
      var len = O.length >>> 0;
      if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
      var A = new Array(len);
      var k = 0;
      while (k < len) {
        if (k in O) {
          A[k] = callback.call(thisArg, O[k], k, O);
        }
        k++;
      }
      return A;
    };
  }

  // Array.prototype.filter (IE < 9)
  if (!Array.prototype.filter) {
    Array.prototype.filter = function(callback, thisArg) {
      if (this == null) throw new TypeError('this is null or not defined');
      var O = Object(this);
      var len = O.length >>> 0;
      if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
      var A = [];
      var k = 0;
      while (k < len) {
        if (k in O) {
          if (callback.call(thisArg, O[k], k, O)) {
            A.push(O[k]);
          }
        }
        k++;
      }
      return A;
    };
  }

  // Array.prototype.indexOf (IE < 9)
  if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(searchElement, fromIndex) {
      if (this == null) throw new TypeError('this is null or not defined');
      var O = Object(this);
      var len = O.length >>> 0;
      if (len === 0) return -1;
      var n = fromIndex | 0;
      if (n >= len) return -1;
      var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
      while (k < len) {
        if (k in O && O[k] === searchElement) {
          return k;
        }
        k++;
      }
      return -1;
    };
  }

  // Array.prototype.find (ES6 - IE < Edge)
  if (!Array.prototype.find) {
    Array.prototype.find = function(predicate, thisArg) {
      if (this == null) throw new TypeError('this is null or not defined');
      var O = Object(this);
      var len = O.length >>> 0;
      if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
      var k = 0;
      while (k < len) {
        var kValue = O[k];
        if (predicate.call(thisArg, kValue, k, O)) {
          return kValue;
        }
        k++;
      }
      return undefined;
    };
  }

  // Array.from (ES6 - IE < Edge)
  if (!Array.from) {
    Array.from = function(arrayLike, mapFn, thisArg) {
      var C = this;
      var items = Object(arrayLike);
      if (arrayLike == null) throw new TypeError('Array.from requires an array-like object');
      var mapping = typeof mapFn === 'function';
      var len = items.length >>> 0;
      var A = typeof C === 'function' ? Object(new C(len)) : new Array(len);
      var k = 0;
      while (k < len) {
        var kValue = items[k];
        if (mapping) {
          A[k] = mapFn.call(thisArg, kValue, k);
        } else {
          A[k] = kValue;
        }
        k++;
      }
      A.length = len;
      return A;
    };
  }

  // =========================================================
  // Object polyfills (ES5/ES6)
  // =========================================================

  // Object.keys (IE < 9)
  if (!Object.keys) {
    Object.keys = function(obj) {
      if (obj !== Object(obj)) throw new TypeError('Object.keys called on non-object');
      var keys = [];
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          keys.push(key);
        }
      }
      return keys;
    };
  }

  // Object.create (IE < 9)
  if (!Object.create) {
    Object.create = function(proto, propertiesObject) {
      if (typeof proto !== 'object' && typeof proto !== 'function') {
        throw new TypeError('Object prototype may only be an Object or null');
      }
      function F() {}
      F.prototype = proto;
      var obj = new F();
      if (propertiesObject !== undefined) {
        Object.defineProperties(obj, propertiesObject);
      }
      return obj;
    };
  }

  // Object.assign (ES6 - IE < Edge)
  if (!Object.assign) {
    Object.assign = function(target) {
      if (target == null) throw new TypeError('Cannot convert undefined or null to object');
      var to = Object(target);
      for (var index = 1; index < arguments.length; index++) {
        var nextSource = arguments[index];
        if (nextSource != null) {
          for (var nextKey in nextSource) {
            if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
              to[nextKey] = nextSource[nextKey];
            }
          }
        }
      }
      return to;
    };
  }

  // =========================================================
  // String polyfills (ES5/ES6)
  // =========================================================

  // String.prototype.trim (IE < 9)
  if (!String.prototype.trim) {
    String.prototype.trim = function() {
      return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
    };
  }

  // String.prototype.includes (ES6 - IE < Edge)
  if (!String.prototype.includes) {
    String.prototype.includes = function(search, start) {
      if (typeof start !== 'number') {
        start = 0;
      }
      if (start + search.length > this.length) {
        return false;
      } else {
        return this.indexOf(search, start) !== -1;
      }
    };
  }

  // String.prototype.startsWith (ES6 - IE < Edge)
  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(search, pos) {
      return this.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
    };
  }

  // String.prototype.endsWith (ES6 - IE < Edge)
  if (!String.prototype.endsWith) {
    String.prototype.endsWith = function(search, this_len) {
      if (this_len === undefined || this_len > this.length) {
        this_len = this.length;
      }
      return this.substring(this_len - search.length, this_len) === search;
    };
  }

  // =========================================================
  // DOM polyfills
  // =========================================================

  // Element.prototype.classList (IE < 10)
  if (!('classList' in document.createElement('_'))) {
    (function(view) {
      if (!('Element' in view)) return;
      var classListProp = 'classList',
          protoProp = 'prototype',
          elemCtrProto = view.Element[protoProp],
          objCtr = Object,
          strTrim = String[protoProp].trim || function() {
            return this.replace(/^\s+|\s+$/g, '');
          },
          arrIndexOf = Array[protoProp].indexOf || function(item) {
            var i = 0, len = this.length;
            for (; i < len; i++) {
              if (i in this && this[i] === item) {
                return i;
              }
            }
            return -1;
          },
          DOMTokenList = function(elem) {
            this.elem = elem;
          },
          checkTokenAndGetIndex = function(classList, token) {
            if (token === '') {
              throw new Error('An invalid or illegal string was specified');
            }
            if (/\s/.test(token)) {
              throw new Error('String contains an invalid character');
            }
            return arrIndexOf.call(classList, token);
          };

      DOMTokenList[protoProp] = {
        add: function(token) {
          var classes = this.elem.className;
          var tokens = strTrim.call(classes).split(/\s+/);
          if (arrIndexOf.call(tokens, token) === -1) {
            tokens.push(token);
            this.elem.className = tokens.join(' ');
          }
        },
        remove: function(token) {
          var classes = this.elem.className;
          var tokens = strTrim.call(classes).split(/\s+/);
          var index = arrIndexOf.call(tokens, token);
          if (index !== -1) {
            tokens.splice(index, 1);
            this.elem.className = tokens.join(' ');
          }
        },
        toggle: function(token, force) {
          var result = this.contains(token),
              method = result ? force !== true && 'remove' : force !== false && 'add';
          if (method) {
            this[method](token);
          }
          return !result;
        },
        contains: function(token) {
          var classes = this.elem.className;
          var tokens = strTrim.call(classes).split(/\s+/);
          return arrIndexOf.call(tokens, token) !== -1;
        }
      };

      if (objCtr.defineProperty) {
        var classListDescriptor = {
          get: function() { return new DOMTokenList(this); },
          enumerable: true,
          configurable: false
        };
        try {
          objCtr.defineProperty(elemCtrProto, classListProp, classListDescriptor);
        } catch (ex) {
          if (ex.number === -0x7FF5EC54) {
            classListDescriptor.enumerable = false;
            objCtr.defineProperty(elemCtrProto, classListProp, classListDescriptor);
          }
        }
      }
    }(window));
  }

  // CustomEvent (IE < 9)
  if (typeof window.CustomEvent !== 'function') {
    function CustomEvent(event, params) {
      params = params || { bubbles: false, cancelable: false, detail: undefined };
      var evt = document.createEvent('CustomEvent');
      evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
      return evt;
    }
    CustomEvent.prototype = window.Event.prototype;
    window.CustomEvent = CustomEvent;
  }

  // addEventListener (IE < 9)
  if (!window.addEventListener && window.attachEvent) {
    window.addEventListener = function(type, listener, useCapture) {
      this.attachEvent('on' + type, listener);
    };
    window.removeEventListener = function(type, listener, useCapture) {
      this.detachEvent('on' + type, listener);
    };

    if (Element.prototype) {
      Element.prototype.addEventListener = window.addEventListener;
      Element.prototype.removeEventListener = window.removeEventListener;
    }
    if (Document.prototype) {
      Document.prototype.addEventListener = window.addEventListener;
      Document.prototype.removeEventListener = window.removeEventListener;
    }
  }

  // =========================================================
  // Promise polyfill (ES6 - IE < Edge, old browsers)
  // =========================================================
  if (typeof Promise === 'undefined') {
    (function() {
      var PENDING = 0;
      var FULFILLED = 1;
      var REJECTED = 2;

      function Promise(executor) {
        var self = this;
        self.state = PENDING;
        self.value = undefined;
        self.deferred = [];

        function resolve(value) {
          try {
            if (value === self) throw new TypeError('Promise resolved with itself');
            if (value && (typeof value === 'object' || typeof value === 'function')) {
              var then = value.then;
              if (typeof then === 'function') {
                doResolve(then.bind(value), resolve, reject);
                return;
              }
            }
            self.state = FULFILLED;
            self.value = value;
            finale.call(self);
          } catch (e) {
            reject(e);
          }
        }

        function reject(reason) {
          self.state = REJECTED;
          self.value = reason;
          finale.call(self);
        }

        function finale() {
          for (var i = 0, len = self.deferred.length; i < len; i++) {
            handle.call(self, self.deferred[i]);
          }
          self.deferred = null;
        }

        function handle(handler) {
          if (self.state === PENDING) {
            self.deferred.push(handler);
            return;
          }

          setTimeout(function() {
            var cb = self.state === FULFILLED ? handler.onFulfilled : handler.onRejected;
            if (cb === null) {
              (self.state === FULFILLED ? handler.resolve : handler.reject)(self.value);
              return;
            }
            var ret;
            try {
              ret = cb(self.value);
            } catch (e) {
              handler.reject(e);
              return;
            }
            handler.resolve(ret);
          }, 0);
        }

        function doResolve(fn, onFulfilled, onRejected) {
          var done = false;
          try {
            fn(function(value) {
              if (done) return;
              done = true;
              onFulfilled(value);
            }, function(reason) {
              if (done) return;
              done = true;
              onRejected(reason);
            });
          } catch (ex) {
            if (done) return;
            done = true;
            onRejected(ex);
          }
        }

        doResolve(executor, resolve, reject);
      }

      Promise.prototype.then = function(onFulfilled, onRejected) {
        var self = this;
        return new Promise(function(resolve, reject) {
          handle.call(self, {
            onFulfilled: typeof onFulfilled === 'function' ? onFulfilled : null,
            onRejected: typeof onRejected === 'function' ? onRejected : null,
            resolve: resolve,
            reject: reject
          });
        });
      };

      Promise.prototype['catch'] = function(onRejected) {
        return this.then(null, onRejected);
      };

      Promise.all = function(promises) {
        return new Promise(function(resolve, reject) {
          if (!Array.isArray(promises)) {
            return reject(new TypeError('Promise.all accepts an array'));
          }

          var remaining = promises.length;
          if (remaining === 0) return resolve([]);

          var results = new Array(promises.length);
          var done = false;

          function res(i, val) {
            try {
              if (val && (typeof val === 'object' || typeof val === 'function')) {
                var then = val.then;
                if (typeof then === 'function') {
                  then.call(val, function(val) { res(i, val); }, reject);
                  return;
                }
              }
              results[i] = val;
              if (--remaining === 0 && !done) {
                done = true;
                resolve(results);
              }
            } catch (ex) {
              if (!done) {
                done = true;
                reject(ex);
              }
            }
          }

          for (var i = 0; i < promises.length; i++) {
            res(i, promises[i]);
          }
        });
      };

      Promise.resolve = function(value) {
        if (value && typeof value === 'object' && value.constructor === Promise) {
          return value;
        }
        return new Promise(function(resolve) {
          resolve(value);
        });
      };

      Promise.reject = function(reason) {
        return new Promise(function(resolve, reject) {
          reject(reason);
        });
      };

      window.Promise = Promise;
    })();
  }

  // =========================================================
  // Fetch polyfill (for browsers without fetch)
  // =========================================================
  if (!window.fetch) {
    window.fetch = function(url, options) {
      options = options || {};
      return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(options.method || 'GET', url);

        // Set headers
        if (options.headers) {
          for (var key in options.headers) {
            xhr.setRequestHeader(key, options.headers[key]);
          }
        }

        xhr.onload = function() {
          var response = {
            status: xhr.status,
            statusText: xhr.statusText,
            ok: xhr.status >= 200 && xhr.status < 300,
            headers: {},
            text: function() { return Promise.resolve(xhr.responseText); },
            json: function() { return Promise.resolve(JSON.parse(xhr.responseText)); }
          };
          resolve(response);
        };

        xhr.onerror = function() {
          reject(new TypeError('Network request failed'));
        };

        xhr.send(options.body || null);
      });
    };
  }

  // =========================================================
  // JSON polyfill (for IE < 8)
  // =========================================================
  if (typeof JSON === 'undefined') {
    window.JSON = {
      parse: function(text) {
        return eval('(' + text + ')');
      },
      stringify: function(obj) {
        var t = typeof obj;
        if (t !== 'object' || obj === null) {
          if (t === 'string') return '"' + obj + '"';
          return String(obj);
        } else {
          var str, arr = Array.isArray(obj);
          str = arr ? '[' : '{';
          for (var n in obj) {
            if (obj.hasOwnProperty(n)) {
              str += (arr ? '' : '"' + n + '":') + JSON.stringify(obj[n]) + ',';
            }
          }
          str = str.slice(0, -1) + (arr ? ']' : '}');
          return str;
        }
      }
    };
  }

  console.log('[Polyfills] Browser polyfills loaded successfully');

})(window);
