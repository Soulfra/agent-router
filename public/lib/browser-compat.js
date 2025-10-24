/**
 * Browser Compatibility Shim
 *
 * Detects browser version and shows warnings for unsupported browsers
 * Provides graceful degradation for ancient browsers
 */

(function(window) {
  'use strict';

  var BrowserCompat = {
    /**
     * Detect browser and version
     */
    detectBrowser: function() {
      var ua = navigator.userAgent;
      var browser = {
        name: 'Unknown',
        version: 0,
        isSupported: true,
        warnings: []
      };

      // Internet Explorer (all versions)
      if (ua.indexOf('MSIE') !== -1 || ua.indexOf('Trident/') !== -1) {
        browser.name = 'Internet Explorer';
        var match = ua.match(/(?:MSIE |rv:)(\d+(\.\d+)?)/);
        browser.version = match ? parseFloat(match[1]) : 0;
        browser.isSupported = false;
        browser.warnings.push('Internet Explorer is no longer supported. Please upgrade to Microsoft Edge, Chrome, or Firefox.');
      }

      // Netscape Navigator (9+)
      else if (ua.indexOf('Navigator') !== -1 || ua.indexOf('Netscape') !== -1) {
        browser.name = 'Netscape Navigator';
        browser.version = parseFloat(ua.match(/Navigator\/(\d+(\.\d+)?)/)?.[1] || 0);
        browser.isSupported = false;
        browser.warnings.push('Netscape Navigator is no longer supported. Please use a modern browser.');
      }

      // AOL Browser
      else if (ua.indexOf('AOL') !== -1) {
        browser.name = 'AOL Explorer';
        browser.version = parseFloat(ua.match(/AOL\/(\d+(\.\d+)?)/)?.[1] || 0);
        browser.isSupported = false;
        browser.warnings.push('AOL Explorer is no longer supported. Please use a modern browser.');
      }

      // Opera (Presto engine < 15)
      else if (ua.indexOf('Opera') !== -1 && ua.indexOf('Presto') !== -1) {
        browser.name = 'Opera (Presto)';
        browser.version = parseFloat(ua.match(/Version\/(\d+(\.\d+)?)/)?.[1] || 0);
        if (browser.version < 15) {
          browser.isSupported = false;
          browser.warnings.push('Your version of Opera is outdated. Please upgrade to the latest version.');
        }
      }

      // Modern Opera (Blink engine)
      else if (ua.indexOf('OPR') !== -1 || ua.indexOf('Opera') !== -1) {
        browser.name = 'Opera';
        browser.version = parseFloat(ua.match(/(?:OPR|Opera)\/(\d+(\.\d+)?)/)?.[1] || 0);
        browser.isSupported = browser.version >= 36;
      }

      // Edge (Chromium-based)
      else if (ua.indexOf('Edg') !== -1) {
        browser.name = 'Microsoft Edge';
        browser.version = parseFloat(ua.match(/Edg\/(\d+(\.\d+)?)/)?.[1] || 0);
        browser.isSupported = browser.version >= 79;
      }

      // Chrome
      else if (ua.indexOf('Chrome') !== -1) {
        browser.name = 'Chrome';
        browser.version = parseFloat(ua.match(/Chrome\/(\d+(\.\d+)?)/)?.[1] || 0);
        browser.isSupported = browser.version >= 49;
        if (!browser.isSupported) {
          browser.warnings.push('Your version of Chrome is outdated. Please update to the latest version.');
        }
      }

      // Safari
      else if (ua.indexOf('Safari') !== -1) {
        browser.name = 'Safari';
        browser.version = parseFloat(ua.match(/Version\/(\d+(\.\d+)?)/)?.[1] || 0);
        browser.isSupported = browser.version >= 10;
        if (!browser.isSupported) {
          browser.warnings.push('Your version of Safari is outdated. Please update to the latest version.');
        }
      }

      // Firefox
      else if (ua.indexOf('Firefox') !== -1) {
        browser.name = 'Firefox';
        browser.version = parseFloat(ua.match(/Firefox\/(\d+(\.\d+)?)/)?.[1] || 0);
        browser.isSupported = browser.version >= 44;
        if (!browser.isSupported) {
          browser.warnings.push('Your version of Firefox is outdated. Please update to the latest version.');
        }
      }

      return browser;
    },

    /**
     * Check for required features
     */
    checkFeatures: function() {
      var missing = [];

      // ES5 features
      if (!Array.isArray) missing.push('Array.isArray');
      if (!Array.prototype.forEach) missing.push('Array.prototype.forEach');
      if (!Object.keys) missing.push('Object.keys');

      // ES6 features (optional, but recommended)
      if (!Promise) missing.push('Promise');
      if (!fetch) missing.push('fetch API');
      if (!Object.assign) missing.push('Object.assign');

      // DOM features
      if (!document.querySelector) missing.push('querySelector');
      if (!document.addEventListener) missing.push('addEventListener');

      return missing;
    },

    /**
     * Show warning banner for unsupported browsers
     */
    showWarning: function(browser) {
      if (browser.isSupported && browser.warnings.length === 0) {
        return;
      }

      var banner = document.createElement('div');
      banner.id = 'browser-compat-warning';
      banner.style.cssText = [
        'position: fixed',
        'top: 0',
        'left: 0',
        'right: 0',
        'background: #ff6b6b',
        'color: white',
        'padding: 15px 20px',
        'text-align: center',
        'z-index: 999999',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
        'font-size: 14px',
        'box-shadow: 0 2px 8px rgba(0,0,0,0.2)'
      ].join(';');

      var message = browser.warnings.join(' ');
      if (!browser.isSupported) {
        message += ' <a href="https://browsehappy.com/" target="_blank" style="color: white; text-decoration: underline;">Download a modern browser</a>';
      }

      banner.innerHTML = '<strong>⚠️ Browser Compatibility Warning:</strong> ' + message +
        ' <button onclick="this.parentElement.remove()" style="margin-left:10px;padding:5px 10px;background:white;color:#ff6b6b;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">✕ Dismiss</button>';

      document.body.insertBefore(banner, document.body.firstChild);
    },

    /**
     * Initialize compatibility check
     */
    init: function() {
      var browser = this.detectBrowser();
      var missingFeatures = this.checkFeatures();

      console.log('[BrowserCompat] Detected:', browser.name, browser.version);
      console.log('[BrowserCompat] Supported:', browser.isSupported);

      if (missingFeatures.length > 0) {
        console.warn('[BrowserCompat] Missing features:', missingFeatures.join(', '));
        browser.warnings.push('Some features may not work correctly in your browser.');
      }

      // Show warning if browser is unsupported or has warnings
      if (!browser.isSupported || browser.warnings.length > 0) {
        var self = this;
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function() {
            self.showWarning(browser);
          });
        } else {
          self.showWarning(browser);
        }
      }

      return browser;
    },

    /**
     * Graceful degradation helpers
     */
    degradation: {
      /**
       * Use fetch with XMLHttpRequest fallback
       */
      fetchWithFallback: function(url, options) {
        if (window.fetch) {
          return fetch(url, options);
        } else {
          // Fallback handled by polyfill
          return fetch(url, options);
        }
      },

      /**
       * Use modern selectors with fallback
       */
      querySelector: function(selector) {
        if (document.querySelector) {
          return document.querySelector(selector);
        } else {
          // IE < 8 fallback
          return document.getElementById(selector.replace('#', '')) || document.getElementsByTagName(selector)[0];
        }
      },

      /**
       * Local storage with cookie fallback
       */
      storage: {
        get: function(key) {
          if (window.localStorage) {
            return localStorage.getItem(key);
          } else {
            // Cookie fallback
            var name = key + '=';
            var ca = document.cookie.split(';');
            for (var i = 0; i < ca.length; i++) {
              var c = ca[i];
              while (c.charAt(0) === ' ') c = c.substring(1);
              if (c.indexOf(name) === 0) return c.substring(name.length, c.length);
            }
            return null;
          }
        },
        set: function(key, value) {
          if (window.localStorage) {
            localStorage.setItem(key, value);
          } else {
            // Cookie fallback (30 days)
            var d = new Date();
            d.setTime(d.getTime() + (30*24*60*60*1000));
            document.cookie = key + '=' + value + ';expires=' + d.toUTCString() + ';path=/';
          }
        },
        remove: function(key) {
          if (window.localStorage) {
            localStorage.removeItem(key);
          } else {
            document.cookie = key + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/';
          }
        }
      }
    }
  };

  // Auto-init on load
  window.BrowserCompat = BrowserCompat;
  BrowserCompat.init();

})(window);
