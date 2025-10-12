/**
 * Network Detector
 *
 * Detects whether app is running on local network (laptop WiFi) or cloud
 * Used by mobile apps to automatically switch API endpoints
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const http = require('http');
const https = require('https');

const execAsync = promisify(exec);

class NetworkDetector {
  constructor(options = {}) {
    this.localPort = options.localPort || 5001;
    this.cloudUrl = options.cloudUrl || null;
    this.timeoutMs = options.timeoutMs || 3000;
  }

  /**
   * Detect best API endpoint
   * Tries local first, then cloud
   *
   * @returns {object} - { mode: 'local' | 'cloud', endpoint: string, latency: number }
   */
  async detectEndpoint() {
    // Try local network first
    const localIps = await this.getLocalIps();

    for (const ip of localIps) {
      const localUrl = `http://${ip}:${this.localPort}`;
      const localCheck = await this.checkEndpoint(localUrl);

      if (localCheck.available) {
        return {
          mode: 'local',
          endpoint: localUrl,
          ip: ip,
          latency: localCheck.latency,
          available: true
        };
      }
    }

    // Try localhost
    const localhostCheck = await this.checkEndpoint(`http://localhost:${this.localPort}`);
    if (localhostCheck.available) {
      return {
        mode: 'local',
        endpoint: `http://localhost:${this.localPort}`,
        ip: 'localhost',
        latency: localhostCheck.latency,
        available: true
      };
    }

    // Try cloud if configured
    if (this.cloudUrl) {
      const cloudCheck = await this.checkEndpoint(this.cloudUrl);

      if (cloudCheck.available) {
        return {
          mode: 'cloud',
          endpoint: this.cloudUrl,
          latency: cloudCheck.latency,
          available: true
        };
      }
    }

    // Nothing available
    return {
      mode: 'offline',
      endpoint: null,
      available: false,
      error: 'No API endpoint available'
    };
  }

  /**
   * Check if endpoint is reachable
   *
   * @param {string} url - URL to check
   * @returns {object} - { available: boolean, latency: number, error?: string }
   */
  async checkEndpoint(url) {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const req = protocol.get(`${url}/health`, { timeout: this.timeoutMs }, (res) => {
        const latency = Date.now() - startTime;

        if (res.statusCode === 200) {
          resolve({ available: true, latency });
        } else {
          resolve({ available: false, latency, error: `HTTP ${res.statusCode}` });
        }

        // Drain response
        res.resume();
      });

      req.on('error', (error) => {
        resolve({
          available: false,
          latency: Date.now() - startTime,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          available: false,
          latency: this.timeoutMs,
          error: 'Timeout'
        });
      });

      req.setTimeout(this.timeoutMs);
    });
  }

  /**
   * Get local IP addresses on the network
   *
   * @returns {string[]} - Array of local IPs
   */
  async getLocalIps() {
    const ips = [];

    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        // macOS/Linux: use ifconfig or ip addr
        const command = process.platform === 'darwin'
          ? 'ifconfig | grep "inet " | grep -v 127.0.0.1 | awk \'{print $2}\''
          : 'hostname -I';

        const { stdout } = await execAsync(command);
        const foundIps = stdout.trim().split(/\s+/).filter(ip => ip && ip !== '127.0.0.1');
        ips.push(...foundIps);

      } else if (process.platform === 'win32') {
        // Windows: use ipconfig
        const { stdout } = await execAsync('ipconfig | findstr /i "IPv4"');
        const matches = stdout.matchAll(/(\d+\.\d+\.\d+\.\d+)/g);

        for (const match of matches) {
          const ip = match[1];
          if (ip && ip !== '127.0.0.1') {
            ips.push(ip);
          }
        }
      }

    } catch (error) {
      console.error('[NetworkDetector] Failed to get local IPs:', error.message);
    }

    // Always include common local IP ranges to try
    const commonIps = this._generateCommonLocalIps();
    ips.push(...commonIps);

    // Remove duplicates
    return [...new Set(ips)];
  }

  /**
   * Get network status
   *
   * @returns {object} - Network information
   */
  async getNetworkStatus() {
    const localIps = await this.getLocalIps();
    const endpoint = await this.detectEndpoint();

    return {
      localIps,
      currentEndpoint: endpoint,
      isLocalAvailable: endpoint.mode === 'local',
      isCloudAvailable: this.cloudUrl ? (await this.checkEndpoint(this.cloudUrl)).available : false,
      isOnline: endpoint.available
    };
  }

  /**
   * Continuously monitor network and call callback on changes
   *
   * @param {function} callback - Called with endpoint info on changes
   * @param {number} interval - Check interval in ms (default: 30000)
   * @returns {function} - Stop function
   */
  startMonitoring(callback, interval = 30000) {
    let lastEndpoint = null;

    const check = async () => {
      try {
        const endpoint = await this.detectEndpoint();

        // Check if endpoint changed
        const endpointChanged = !lastEndpoint ||
          lastEndpoint.mode !== endpoint.mode ||
          lastEndpoint.endpoint !== endpoint.endpoint;

        if (endpointChanged) {
          console.log('[NetworkDetector] Endpoint changed:', lastEndpoint?.mode, '→', endpoint.mode);
          lastEndpoint = endpoint;
          callback(endpoint);
        }

      } catch (error) {
        console.error('[NetworkDetector] Monitoring check failed:', error);
      }
    };

    // Initial check
    check();

    // Schedule periodic checks
    const intervalId = setInterval(check, interval);

    // Return stop function
    return () => {
      clearInterval(intervalId);
      console.log('[NetworkDetector] Stopped monitoring');
    };
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Generate common local IP ranges to try
   * Useful when ifconfig/ipconfig fails
   */
  _generateCommonLocalIps() {
    const ips = [];

    // Common router IPs
    ips.push('192.168.1.1', '192.168.0.1', '10.0.0.1');

    // Try common ranges (first 5 IPs in each subnet)
    const ranges = ['192.168.1', '192.168.0', '10.0.0', '172.16.0'];

    for (const range of ranges) {
      for (let i = 1; i <= 10; i++) {
        ips.push(`${range}.${i}`);
      }
    }

    return ips;
  }
}

/**
 * Quick utility function for mobile apps
 * Returns the best available endpoint
 */
async function detectBestEndpoint(options = {}) {
  const detector = new NetworkDetector(options);
  return await detector.detectEndpoint();
}

module.exports = NetworkDetector;
module.exports.detectBestEndpoint = detectBestEndpoint;
