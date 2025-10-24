/**
 * Network Traffic Monitor
 *
 * Tracks all HTTP requests, active connections, bandwidth usage.
 * Like netstat + Wireshark + router admin panel.
 *
 * Features:
 * - Request tracking (IP, path, user-agent, timing)
 * - Active connection monitoring (like netstat -an)
 * - Bandwidth tracking (bytes in/out per IP)
 * - Geolocation lookup (city, country)
 * - Suspicious activity detection (DoS, port scanning)
 * - Internal vs external traffic classification
 *
 * Pattern: Router admin panel, firewall logs, Google Analytics for network
 */

const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class NetworkTrafficMonitor {
  constructor(options = {}) {
    this.config = {
      // Monitoring settings
      trackRequests: options.trackRequests !== false,
      trackConnections: options.trackConnections !== false,
      trackBandwidth: options.trackBandwidth !== false,
      geoLookup: options.geoLookup !== false,

      // History settings
      maxRequestHistory: options.maxRequestHistory || 1000,
      maxConnectionHistory: options.maxConnectionHistory || 100,
      historyRetention: options.historyRetention || 3600000, // 1 hour

      // Suspicious activity thresholds
      rapidRequestThreshold: options.rapidRequestThreshold || 100, // req/min
      portScanThreshold: options.portScanThreshold || 10, // ports/min
      bandwidthAnomalyRatio: options.bandwidthAnomalyRatio || 5.0, // 5x normal

      // Update intervals
      geoUpdateInterval: options.geoUpdateInterval || 300000, // 5 min
      connectionCheckInterval: options.connectionCheckInterval || 5000 // 5s
    };

    // Data stores
    this.requests = []; // Request history
    this.connections = new Map(); // Active connections by IP
    this.bandwidth = new Map(); // Bandwidth per IP { in, out, lastUpdate }
    this.geoCache = new Map(); // IP -> geo info cache
    this.suspicious = []; // Suspicious activity log

    // Stats
    this.stats = {
      totalRequests: 0,
      totalBytesIn: 0,
      totalBytesOut: 0,
      uniqueIPs: new Set(),
      startTime: Date.now()
    };

    // Background jobs
    this.intervalIds = [];

    // Server info
    this.serverIP = this._getServerIP();
    this.serverPort = null; // Set by init()
  }

  /**
   * Initialize monitor
   */
  async init(serverPort = null) {
    this.serverPort = serverPort;

    console.log('[NetworkTrafficMonitor] Starting...');
    console.log(`  Server IP: ${this.serverIP}`);
    console.log(`  Server Port: ${this.serverPort || 'not set'}`);

    // Start background monitoring
    if (this.config.trackConnections) {
      const connInterval = setInterval(() => this._updateConnections(), this.config.connectionCheckInterval);
      this.intervalIds.push(connInterval);
    }

    // Cleanup old data periodically
    const cleanupInterval = setInterval(() => this._cleanup(), 60000); // 1 min
    this.intervalIds.push(cleanupInterval);

    console.log('[NetworkTrafficMonitor] Started');
  }

  /**
   * Stop monitor
   */
  stop() {
    this.intervalIds.forEach(id => clearInterval(id));
    this.intervalIds = [];
    console.log('[NetworkTrafficMonitor] Stopped');
  }

  /**
   * Track HTTP request (call from middleware)
   */
  trackRequest(req, bytesIn = 0, bytesOut = 0) {
    if (!this.config.trackRequests) return;

    const ip = this._extractIP(req);
    const timestamp = Date.now();

    const request = {
      id: `req_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      ip,
      method: req.method,
      path: req.path || req.url,
      userAgent: req.get('user-agent') || 'unknown',
      referer: req.get('referer') || null,
      duration: null, // Set by trackResponse()
      statusCode: null,
      bytesIn,
      bytesOut,
      isInternal: this._isInternalIP(ip)
    };

    // Store request
    this.requests.push(request);
    if (this.requests.length > this.config.maxRequestHistory) {
      this.requests.shift();
    }

    // Update stats
    this.stats.totalRequests++;
    this.stats.uniqueIPs.add(ip);

    // Track bandwidth
    this._updateBandwidth(ip, bytesIn, bytesOut);

    // Check for suspicious activity
    this._checkSuspiciousActivity(ip, request);

    return request;
  }

  /**
   * Track HTTP response (call from middleware)
   */
  trackResponse(requestId, statusCode, bytesOut = 0) {
    const request = this.requests.find(r => r.id === requestId);
    if (!request) return;

    request.statusCode = statusCode;
    request.bytesOut += bytesOut;
    request.duration = Date.now() - request.timestamp;

    // Update bandwidth
    this._updateBandwidth(request.ip, 0, bytesOut);
  }

  /**
   * Get current connections (like netstat -an)
   */
  async getConnections() {
    const connections = [];

    for (const [ip, conn] of this.connections.entries()) {
      const geo = await this._getGeoInfo(ip);

      connections.push({
        ip,
        port: conn.port,
        state: conn.state,
        startTime: conn.startTime,
        lastSeen: conn.lastSeen,
        requestCount: conn.requestCount,
        isInternal: this._isInternalIP(ip),
        location: geo ? `${geo.city}, ${geo.country}` : 'Unknown',
        geoInfo: geo
      });
    }

    return connections.sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /**
   * Get traffic stats
   */
  async getTrafficStats() {
    const now = Date.now();
    const uptime = now - this.stats.startTime;

    // Calculate requests per minute
    const recentRequests = this.requests.filter(r => now - r.timestamp < 60000);
    const rpm = recentRequests.length;

    // Top IPs by request count
    const ipCounts = new Map();
    this.requests.forEach(r => {
      ipCounts.set(r.ip, (ipCounts.get(r.ip) || 0) + 1);
    });
    const topIPs = Array.from(ipCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count, isInternal: this._isInternalIP(ip) }));

    // Top endpoints
    const pathCounts = new Map();
    this.requests.forEach(r => {
      pathCounts.set(r.path, (pathCounts.get(r.path) || 0) + 1);
    });
    const topEndpoints = Array.from(pathCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    return {
      uptime,
      totalRequests: this.stats.totalRequests,
      uniqueIPs: this.stats.uniqueIPs.size,
      requestsPerMinute: rpm,
      totalBytesIn: this.stats.totalBytesIn,
      totalBytesOut: this.stats.totalBytesOut,
      activeConnections: this.connections.size,
      recentRequests: this.requests.slice(-100),
      topIPs,
      topEndpoints,
      internal: this.requests.filter(r => r.isInternal).length,
      external: this.requests.filter(r => !r.isInternal).length
    };
  }

  /**
   * Get bandwidth usage per IP
   */
  getBandwidthUsage() {
    const usage = [];

    for (const [ip, bw] of this.bandwidth.entries()) {
      usage.push({
        ip,
        bytesIn: bw.in,
        bytesOut: bw.out,
        total: bw.in + bw.out,
        lastUpdate: bw.lastUpdate,
        isInternal: this._isInternalIP(ip)
      });
    }

    return usage.sort((a, b) => b.total - a.total);
  }

  /**
   * Get suspicious activity
   */
  getSuspiciousActivity() {
    const now = Date.now();
    const recent = this.suspicious.filter(s => now - s.timestamp < 3600000); // Last hour

    return recent.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get geographic distribution
   */
  async getGeoDistribution() {
    const distribution = new Map();

    for (const request of this.requests) {
      if (this._isInternalIP(request.ip)) continue;

      const geo = await this._getGeoInfo(request.ip);
      if (!geo) continue;

      const key = geo.country;
      if (!distribution.has(key)) {
        distribution.set(key, {
          country: geo.country,
          city: geo.city,
          count: 0,
          ips: new Set()
        });
      }

      const entry = distribution.get(key);
      entry.count++;
      entry.ips.add(request.ip);
    }

    return Array.from(distribution.values())
      .map(e => ({ ...e, ips: e.ips.size }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Update active connections (like netstat -an)
   */
  async _updateConnections() {
    if (!this.serverPort) return;

    try {
      // Use netstat to get active connections
      // macOS: netstat -an | grep ESTABLISHED | grep :<port>
      // Linux: ss -tn | grep ESTAB | grep :<port>
      const platform = os.platform();
      let command;

      if (platform === 'darwin') {
        command = `netstat -an | grep ESTABLISHED | grep ":${this.serverPort}"`;
      } else {
        command = `ss -tn | grep ESTAB | grep ":${this.serverPort}"`;
      }

      const { stdout } = await execAsync(command);
      const lines = stdout.split('\n').filter(l => l.trim());

      // Mark all connections as not seen
      for (const conn of this.connections.values()) {
        conn.seen = false;
      }

      // Parse connections
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;

        // Extract remote address (format: IP:port)
        let remoteAddr;
        if (platform === 'darwin') {
          remoteAddr = parts[4]; // Foreign Address column
        } else {
          remoteAddr = parts[2]; // Recv-Q Send-Q Local Address Peer Address
        }

        if (!remoteAddr || !remoteAddr.includes(':')) continue;

        const [ip, port] = remoteAddr.split(':');
        if (!ip || this._isInternalIP(ip)) continue;

        // Update or create connection
        if (this.connections.has(ip)) {
          const conn = this.connections.get(ip);
          conn.lastSeen = Date.now();
          conn.seen = true;
        } else {
          this.connections.set(ip, {
            ip,
            port: parseInt(port),
            state: 'ESTABLISHED',
            startTime: Date.now(),
            lastSeen: Date.now(),
            requestCount: 0,
            seen: true
          });
        }
      }

      // Remove connections that weren't seen (no longer active)
      for (const [ip, conn] of this.connections.entries()) {
        if (!conn.seen) {
          this.connections.delete(ip);
        }
      }

    } catch (error) {
      // netstat/ss might fail if no connections, that's ok
      if (!error.message.includes('Command failed')) {
        console.error('[NetworkTrafficMonitor] Connection check error:', error.message);
      }
    }
  }

  /**
   * Update bandwidth tracking
   */
  _updateBandwidth(ip, bytesIn, bytesOut) {
    if (!this.config.trackBandwidth) return;

    if (!this.bandwidth.has(ip)) {
      this.bandwidth.set(ip, { in: 0, out: 0, lastUpdate: Date.now() });
    }

    const bw = this.bandwidth.get(ip);
    bw.in += bytesIn;
    bw.out += bytesOut;
    bw.lastUpdate = Date.now();

    this.stats.totalBytesIn += bytesIn;
    this.stats.totalBytesOut += bytesOut;
  }

  /**
   * Check for suspicious activity
   */
  _checkSuspiciousActivity(ip, request) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Rapid requests (possible DoS)
    const recentRequests = this.requests.filter(r =>
      r.ip === ip && r.timestamp > oneMinuteAgo
    );

    if (recentRequests.length >= this.config.rapidRequestThreshold) {
      this._logSuspicious({
        type: 'rapid_requests',
        ip,
        severity: 'high',
        description: `${recentRequests.length} requests in last minute (possible DoS)`,
        metadata: { requestCount: recentRequests.length }
      });
    }

    // Port scanning (requests to many different ports/paths)
    const uniquePaths = new Set(recentRequests.map(r => r.path));
    if (uniquePaths.size >= this.config.portScanThreshold) {
      this._logSuspicious({
        type: 'port_scan',
        ip,
        severity: 'medium',
        description: `Accessed ${uniquePaths.size} different endpoints in last minute`,
        metadata: { pathCount: uniquePaths.size }
      });
    }

    // Suspicious user agents
    const ua = request.userAgent.toLowerCase();
    if (ua.includes('scanner') || ua.includes('bot') || ua.includes('crawler')) {
      if (!ua.includes('googlebot') && !ua.includes('bingbot')) {
        this._logSuspicious({
          type: 'suspicious_user_agent',
          ip,
          severity: 'low',
          description: `Suspicious user agent: ${request.userAgent}`,
          metadata: { userAgent: request.userAgent }
        });
      }
    }
  }

  /**
   * Log suspicious activity
   */
  _logSuspicious(activity) {
    activity.timestamp = Date.now();
    activity.id = `sus_${activity.timestamp}_${Math.random().toString(36).substr(2, 9)}`;

    this.suspicious.push(activity);

    // Keep only last 1000
    if (this.suspicious.length > 1000) {
      this.suspicious.shift();
    }

    console.warn(`[NetworkTrafficMonitor] Suspicious activity: ${activity.type} from ${activity.ip}`);
  }

  /**
   * Get geo info for IP (cached)
   */
  async _getGeoInfo(ip) {
    if (!this.config.geoLookup) return null;
    if (this._isInternalIP(ip)) return null;

    // Check cache
    if (this.geoCache.has(ip)) {
      const cached = this.geoCache.get(ip);
      if (Date.now() - cached.timestamp < this.config.geoUpdateInterval) {
        return cached.data;
      }
    }

    try {
      // Use free ip-api.com service (150 req/min limit)
      const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon,isp`);
      const data = await response.json();

      if (data.status === 'success') {
        const geoInfo = {
          country: data.country,
          city: data.city,
          lat: data.lat,
          lon: data.lon,
          isp: data.isp
        };

        this.geoCache.set(ip, {
          data: geoInfo,
          timestamp: Date.now()
        });

        return geoInfo;
      }
    } catch (error) {
      // Geo lookup failed, not critical
    }

    return null;
  }

  /**
   * Extract IP from request
   */
  _extractIP(req) {
    // Try various headers for proxied requests
    return (
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      'unknown'
    ).replace(/^::ffff:/, ''); // Remove IPv6 prefix
  }

  /**
   * Check if IP is internal
   */
  _isInternalIP(ip) {
    if (ip === 'unknown') return true;
    if (ip === '127.0.0.1' || ip === '::1') return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('172.')) {
      const second = parseInt(ip.split('.')[1]);
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  }

  /**
   * Get server IP
   */
  _getServerIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'unknown';
  }

  /**
   * Cleanup old data
   */
  _cleanup() {
    const now = Date.now();
    const cutoff = now - this.config.historyRetention;

    // Cleanup old requests
    this.requests = this.requests.filter(r => r.timestamp > cutoff);

    // Cleanup old suspicious activity
    this.suspicious = this.suspicious.filter(s => s.timestamp > cutoff);

    // Cleanup old geo cache
    for (const [ip, cached] of this.geoCache.entries()) {
      if (now - cached.timestamp > this.config.geoUpdateInterval * 2) {
        this.geoCache.delete(ip);
      }
    }
  }

  /**
   * Get middleware for Express
   */
  middleware() {
    return (req, res, next) => {
      const startTime = Date.now();

      // Estimate request size
      const bytesIn = parseInt(req.get('content-length') || '0');

      // Track request
      const request = this.trackRequest(req, bytesIn, 0);

      // Intercept response
      const originalSend = res.send;
      res.send = function(data) {
        const bytesOut = Buffer.byteLength(data || '', 'utf8');
        this.trackResponse(request.id, res.statusCode, bytesOut);
        return originalSend.call(res, data);
      }.bind(this);

      next();
    };
  }
}

module.exports = NetworkTrafficMonitor;
