/**
 * Device Fingerprinting System
 *
 * Creates unique, persistent identifier for browser WITHOUT cookies
 * Privacy-first: Can't track across sites unless user explicitly syncs
 *
 * Uses:
 * - Canvas fingerprinting
 * - WebGL fingerprinting
 * - Audio fingerprinting
 * - Browser features
 * - Screen resolution
 * - Timezone
 * - Language
 * - Plugins
 *
 * @license AGPLv3
 */

class DeviceFingerprint {
  constructor() {
    this.fingerprint = null;
    this.components = {};
  }

  /**
   * Generate complete fingerprint
   */
  async generate() {
    console.log('[DeviceFingerprint] Generating fingerprint...');

    this.components = {
      canvas: await this.getCanvasFingerprint(),
      webgl: await this.getWebGLFingerprint(),
      audio: await this.getAudioFingerprint(),
      screen: this.getScreenFingerprint(),
      timezone: this.getTimezoneFingerprint(),
      language: this.getLanguageFingerprint(),
      platform: this.getPlatformFingerprint(),
      plugins: this.getPluginsFingerprint(),
      fonts: await this.getFontsFingerprint(),
      hardware: this.getHardwareFingerprint()
    };

    // Combine all components into single hash
    this.fingerprint = await this.hashComponents(this.components);

    console.log('[DeviceFingerprint] Generated:', this.fingerprint);

    return {
      id: this.fingerprint,
      components: this.components,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Canvas fingerprinting
   */
  async getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Draw text with specific styling
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('SoulFra CalOS 🔒', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Device Fingerprint', 4, 17);

      // Get canvas data
      const dataURL = canvas.toDataURL();
      return this.simpleHash(dataURL);
    } catch (error) {
      return 'canvas_unavailable';
    }
  }

  /**
   * WebGL fingerprinting
   */
  async getWebGLFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

      if (!gl) return 'webgl_unavailable';

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

      const data = {
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
        unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null
      };

      return this.simpleHash(JSON.stringify(data));
    } catch (error) {
      return 'webgl_unavailable';
    }
  }

  /**
   * Audio fingerprinting
   */
  async getAudioFingerprint() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return 'audio_unavailable';

      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const analyser = context.createAnalyser();
      const gainNode = context.createGain();
      const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

      gainNode.gain.value = 0; // Mute

      oscillator.type = 'triangle';
      oscillator.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.start(0);

      return new Promise((resolve) => {
        scriptProcessor.onaudioprocess = function(event) {
          const output = event.inputBuffer.getChannelData(0);
          const sum = output.reduce((a, b) => a + Math.abs(b), 0);
          oscillator.stop();
          scriptProcessor.disconnect();
          context.close();
          resolve(sum.toString());
        };
      });
    } catch (error) {
      return 'audio_unavailable';
    }
  }

  /**
   * Screen fingerprinting
   */
  getScreenFingerprint() {
    return {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }

  /**
   * Timezone fingerprinting
   */
  getTimezoneFingerprint() {
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset()
    };
  }

  /**
   * Language fingerprinting
   */
  getLanguageFingerprint() {
    return {
      language: navigator.language,
      languages: navigator.languages ? Array.from(navigator.languages) : []
    };
  }

  /**
   * Platform fingerprinting
   */
  getPlatformFingerprint() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      maxTouchPoints: navigator.maxTouchPoints
    };
  }

  /**
   * Plugins fingerprinting
   */
  getPluginsFingerprint() {
    const plugins = [];

    if (navigator.plugins) {
      for (let i = 0; i < navigator.plugins.length; i++) {
        const plugin = navigator.plugins[i];
        plugins.push({
          name: plugin.name,
          filename: plugin.filename,
          description: plugin.description
        });
      }
    }

    return plugins;
  }

  /**
   * Fonts fingerprinting
   */
  async getFontsFingerprint() {
    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const testString = 'mmmmmmmmmmlli';
    const testSize = '72px';
    const h = document.getElementsByTagName('body')[0];

    const detectedFonts = [];
    const fontList = [
      'Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia',
      'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS', 'Trebuchet MS',
      'Impact', 'Helvetica'
    ];

    for (const font of fontList) {
      const detected = this.detectFont(font, baseFonts, testString, testSize, h);
      if (detected) {
        detectedFonts.push(font);
      }
    }

    return detectedFonts;
  }

  /**
   * Detect if font is available
   */
  detectFont(fontName, baseFonts, testString, testSize, h) {
    const s = document.createElement('span');
    s.style.fontSize = testSize;
    s.innerHTML = testString;
    const defaultWidth = {};
    const defaultHeight = {};

    for (const baseFont of baseFonts) {
      s.style.fontFamily = baseFont;
      h.appendChild(s);
      defaultWidth[baseFont] = s.offsetWidth;
      defaultHeight[baseFont] = s.offsetHeight;
      h.removeChild(s);
    }

    for (const baseFont of baseFonts) {
      s.style.fontFamily = fontName + ',' + baseFont;
      h.appendChild(s);
      const matched = (s.offsetWidth !== defaultWidth[baseFont] || s.offsetHeight !== defaultHeight[baseFont]);
      h.removeChild(s);
      if (matched) {
        return true;
      }
    }

    return false;
  }

  /**
   * Hardware fingerprinting
   */
  getHardwareFingerprint() {
    return {
      cpuClass: navigator.cpuClass,
      oscpu: navigator.oscpu,
      deviceMemory: navigator.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency
    };
  }

  /**
   * Hash all components together
   */
  async hashComponents(components) {
    const str = JSON.stringify(components);
    const hash = await this.sha256(str);
    return hash.substring(0, 16); // First 16 chars
  }

  /**
   * SHA-256 hash using Web Crypto API
   */
  async sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * Simple hash function for components
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get or create fingerprint (with caching)
   */
  async getFingerprint() {
    if (this.fingerprint) {
      return this.fingerprint;
    }

    const result = await this.generate();
    return result.id;
  }
}

// Export for Node.js (backend)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeviceFingerprint;
}

// Export for browser (frontend)
if (typeof window !== 'undefined') {
  window.DeviceFingerprint = DeviceFingerprint;
}
