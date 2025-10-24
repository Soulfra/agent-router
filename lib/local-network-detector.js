/**
 * Local Network Detector
 *
 * Detects local network info for device pairing and proximity detection
 * Works in both browser (via API calls) and Node.js (via system commands)
 *
 * Features:
 * - Local IP detection (192.168.x.x)
 * - WiFi network detection (same network = auto-pair eligible)
 * - Timestamp sync (for session validation)
 * - Device proximity detection
 *
 * Usage:
 * const detector = new LocalNetworkDetector();
 * const info = await detector.detect();
 * // { ip: '192.168.1.87', network: '192.168.1', timestamp: 1234567890, ... }
 *
 * @version 1.0.0
 * @license MIT
 */

class LocalNetworkDetector {
  constructor(options = {}) {
    this.apiEndpoint = options.apiEndpoint || '/api/network-info';
    this.cache = null;
    this.cacheDuration = 60 * 1000; // 1 minute
    this.lastFetch = 0;

    console.log('[LocalNetworkDetector] Initialized');
  }

  /**
   * Detect local network info
   * @returns {Promise<object>} - Network info
   */
  async detect() {
    // Check cache
    if (this.cache && (Date.now() - this.lastFetch) < this.cacheDuration) {
      return this.cache;
    }

    let info;

    if (typeof window !== 'undefined') {
      // Browser environment - call API
      info = await this.detectBrowser();
    } else {
      // Node.js environment - use system commands
      info = await this.detectNode();
    }

    // Cache result
    this.cache = info;
    this.lastFetch = Date.now();

    return info;
  }

  /**
   * Detect network info in browser (via API)
   * @returns {Promise<object>}
   */
  async detectBrowser() {
    try {
      const response = await fetch(this.apiEndpoint);
      if (!response.ok) throw new Error('Network info API failed');

      const data = await response.json();

      return {
        ip: data.ip,
        network: data.network,
        timestamp: data.timestamp,
        hostname: data.hostname || 'unknown',
        platform: data.platform || 'unknown',
        source: 'api'
      };

    } catch (error) {
      console.warn('[LocalNetworkDetector] API failed, using fallback:', error.message);

      // Fallback: Use browser-only detection
      return {
        ip: 'unknown',
        network: 'unknown',
        timestamp: Date.now(),
        hostname: window.location.hostname,
        platform: navigator.platform,
        source: 'browser-fallback'
      };
    }
  }

  /**
   * Detect network info in Node.js (via system commands)
   * @returns {Promise<object>}
   */
  async detectNode() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const os = require('os');

    try {
      // Get local IP address
      let ip = 'unknown';
      let network = 'unknown';

      // Try ifconfig (macOS/Linux)
      try {
        const { stdout } = await execAsync('ifconfig | grep "inet " | grep -v 127.0.0.1 | awk \'{print $2}\' | head -1');
        ip = stdout.trim();

        if (ip) {
          // Extract network (first 3 octets)
          const parts = ip.split('.');
          if (parts.length === 4) {
            network = `${parts[0]}.${parts[1]}.${parts[2]}`;
          }
        }
      } catch (error) {
        // Try ipconfig (Windows)
        try {
          const { stdout } = await execAsync('ipconfig | findstr /C:"IPv4 Address"');
          const match = stdout.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (match) {
            ip = match[1];
            const parts = ip.split('.');
            if (parts.length === 4) {
              network = `${parts[0]}.${parts[1]}.${parts[2]}`;
            }
          }
        } catch (err) {
          console.warn('[LocalNetworkDetector] Failed to get IP via commands, using os.networkInterfaces()');

          // Fallback to os.networkInterfaces()
          const interfaces = os.networkInterfaces();
          for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
              // Skip internal and non-IPv4
              if (iface.internal || iface.family !== 'IPv4') continue;
              ip = iface.address;
              const parts = ip.split('.');
              if (parts.length === 4) {
                network = `${parts[0]}.${parts[1]}.${parts[2]}`;
              }
              break;
            }
            if (ip !== 'unknown') break;
          }
        }
      }

      return {
        ip,
        network,
        timestamp: Date.now(),
        hostname: os.hostname(),
        platform: os.platform(),
        source: 'system'
      };

    } catch (error) {
      console.error('[LocalNetworkDetector] Detection failed:', error);

      return {
        ip: 'unknown',
        network: 'unknown',
        timestamp: Date.now(),
        hostname: 'unknown',
        platform: 'unknown',
        source: 'error'
      };
    }
  }

  /**
   * Check if two devices are on same network
   * @param {string} network1 - First network (e.g., '192.168.1')
   * @param {string} network2 - Second network
   * @returns {boolean}
   */
  isSameNetwork(network1, network2) {
    return network1 !== 'unknown' && network1 === network2;
  }

  /**
   * Check if two devices are in proximity (same network + recent timestamps)
   * @param {object} device1 - First device info
   * @param {object} device2 - Second device info
   * @param {number} maxTimeDiff - Max time difference in ms (default: 5 minutes)
   * @returns {boolean}
   */
  isInProximity(device1, device2, maxTimeDiff = 5 * 60 * 1000) {
    // Check same network
    if (!this.isSameNetwork(device1.network, device2.network)) {
      return false;
    }

    // Check timestamps are close
    const timeDiff = Math.abs(device1.timestamp - device2.timestamp);
    if (timeDiff > maxTimeDiff) {
      return false;
    }

    return true;
  }

  /**
   * Get current timestamp (for session validation)
   * @returns {number}
   */
  getTimestamp() {
    return Date.now();
  }

  /**
   * Get formatted timestamp
   * @param {number} timestamp - Unix timestamp
   * @returns {string}
   */
  formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString();
  }

  /**
   * Validate timestamp is recent (for session security)
   * @param {number} timestamp - Unix timestamp
   * @param {number} maxAge - Max age in ms (default: 5 minutes)
   * @returns {boolean}
   */
  isRecentTimestamp(timestamp, maxAge = 5 * 60 * 1000) {
    const age = Date.now() - timestamp;
    return age >= 0 && age <= maxAge;
  }

  /**
   * Get full network info (combines detection + extra info)
   * @returns {Promise<object>}
   */
  async getFullInfo() {
    const baseInfo = await this.detect();

    // Add extra info
    return {
      ...baseInfo,
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'Node.js',
      language: typeof window !== 'undefined' ? navigator.language : 'en-US',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screenResolution: typeof window !== 'undefined' ?
        `${window.screen.width}x${window.screen.height}` : 'N/A'
    };
  }

  /**
   * Clear cache (force re-detection)
   */
  clearCache() {
    this.cache = null;
    this.lastFetch = 0;
  }

  /**
   * Generate device proximity fingerprint (for auto-pairing)
   * @returns {Promise<string>}
   */
  async getProximityFingerprint() {
    const info = await this.detect();
    const components = [
      info.network,
      Math.floor(info.timestamp / (5 * 60 * 1000)) // 5-minute window
    ];

    return components.join('|');
  }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LocalNetworkDetector;
} else if (typeof window !== 'undefined') {
  window.LocalNetworkDetector = LocalNetworkDetector;
}
