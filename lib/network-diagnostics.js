/**
 * Network Diagnostics
 * TCP connectivity, latency measurement, route tracing
 *
 * Like ping/traceroute but for HTTP services
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const dns = require('dns').promises;

class NetworkDiagnostics {
  constructor(options = {}) {
    this.timeout = options.timeout || 5000; // 5s default timeout
    this.maxHops = options.maxHops || 30; // Like traceroute
    this.retries = options.retries || 3;
  }

  /**
   * TCP connectivity test - can we reach the endpoint?
   * @param {string} url - URL to test
   * @returns {object} - Connection result
   */
  async testTCPConnection(url) {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const req = protocol.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname || '/',
        method: 'HEAD',
        timeout: this.timeout
      }, (res) => {
        const latency = Date.now() - startTime;

        resolve({
          success: true,
          url,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          statusCode: res.statusCode,
          latency,
          timestamp: new Date().toISOString()
        });

        // Consume response to free up socket
        res.resume();
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          url,
          hostname: parsedUrl.hostname,
          error: error.message,
          latency: Date.now() - startTime,
          timestamp: new Date().toISOString()
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          url,
          hostname: parsedUrl.hostname,
          error: 'Connection timeout',
          latency: this.timeout,
          timestamp: new Date().toISOString()
        });
      });

      req.end();
    });
  }

  /**
   * Measure HTTP latency (ping equivalent)
   * @param {string} url - URL to ping
   * @param {number} count - Number of pings
   * @returns {object} - Latency statistics
   */
  async ping(url, count = 5) {
    const results = [];

    console.log(`\n🔍 Pinging ${url} (${count} times)...\n`);

    for (let i = 0; i < count; i++) {
      const result = await this.testTCPConnection(url);
      results.push(result);

      if (result.success) {
        console.log(`  ${i + 1}. ✓ ${result.latency}ms (HTTP ${result.statusCode})`);
      } else {
        console.log(`  ${i + 1}. ✗ ${result.error}`);
      }

      // Wait 1s between pings (unless last one)
      if (i < count - 1) {
        await this._sleep(1000);
      }
    }

    // Calculate statistics
    const successful = results.filter(r => r.success);
    const latencies = successful.map(r => r.latency);

    if (latencies.length === 0) {
      return {
        url,
        success: false,
        packetsTransmitted: count,
        packetsReceived: 0,
        packetLoss: 100,
        error: 'All pings failed'
      };
    }

    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const packetLoss = ((count - successful.length) / count) * 100;

    console.log(`\n📊 Statistics for ${url}:`);
    console.log(`  Packets: ${count} transmitted, ${successful.length} received, ${packetLoss.toFixed(1)}% loss`);
    console.log(`  Latency: min=${min}ms avg=${avg.toFixed(1)}ms max=${max}ms\n`);

    return {
      url,
      success: true,
      packetsTransmitted: count,
      packetsReceived: successful.length,
      packetLoss: parseFloat(packetLoss.toFixed(1)),
      latency: {
        min,
        max,
        avg: parseFloat(avg.toFixed(1)),
        unit: 'ms'
      },
      results
    };
  }

  /**
   * DNS resolution test
   * @param {string} hostname - Hostname to resolve
   * @returns {object} - DNS result
   */
  async resolveDNS(hostname) {
    const startTime = Date.now();

    try {
      const addresses = await dns.resolve4(hostname);
      const latency = Date.now() - startTime;

      return {
        success: true,
        hostname,
        addresses,
        latency,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        hostname,
        error: error.message,
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Route trace - measure latency to intermediate hops
   * (Simplified version using TTL-like sequential requests)
   * @param {string} url - Destination URL
   * @returns {object} - Route trace results
   */
  async traceRoute(url) {
    console.log(`\n🛣️  Tracing route to ${url}...\n`);

    const parsedUrl = new URL(url);

    // Step 1: DNS resolution
    console.log('  1. DNS Resolution');
    const dnsResult = await this.resolveDNS(parsedUrl.hostname);

    if (!dnsResult.success) {
      console.log(`     ✗ DNS failed: ${dnsResult.error}\n`);
      return {
        success: false,
        url,
        hops: [],
        error: `DNS resolution failed: ${dnsResult.error}`
      };
    }

    console.log(`     ✓ Resolved to ${dnsResult.addresses.join(', ')} (${dnsResult.latency}ms)`);

    // Step 2: TCP connection
    console.log(`  2. TCP Connection`);
    const tcpResult = await this.testTCPConnection(url);

    if (!tcpResult.success) {
      console.log(`     ✗ Connection failed: ${tcpResult.error}\n`);
      return {
        success: false,
        url,
        hops: [
          { hop: 1, type: 'dns', result: dnsResult },
          { hop: 2, type: 'tcp', result: tcpResult }
        ],
        error: `TCP connection failed: ${tcpResult.error}`
      };
    }

    console.log(`     ✓ Connected (${tcpResult.latency}ms, HTTP ${tcpResult.statusCode})`);

    // Step 3: HTTP request latency
    console.log(`  3. HTTP Request`);
    const httpResult = await this._measureHTTPLatency(url);

    console.log(`     ${httpResult.success ? '✓' : '✗'} ${httpResult.success ? `${httpResult.latency}ms` : httpResult.error}`);

    console.log(`\n✅ Route trace complete\n`);

    return {
      success: true,
      url,
      destination: {
        hostname: parsedUrl.hostname,
        addresses: dnsResult.addresses,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80)
      },
      hops: [
        { hop: 1, type: 'dns', description: 'DNS Resolution', result: dnsResult },
        { hop: 2, type: 'tcp', description: 'TCP Connection', result: tcpResult },
        { hop: 3, type: 'http', description: 'HTTP Request', result: httpResult }
      ],
      totalLatency: httpResult.latency || tcpResult.latency,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Measure HTTP request latency (full GET request)
   * @param {string} url - URL to measure
   * @returns {object} - Latency result
   */
  async _measureHTTPLatency(url) {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const req = protocol.get(url, {
        timeout: this.timeout
      }, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const latency = Date.now() - startTime;

          resolve({
            success: true,
            url,
            statusCode: res.statusCode,
            latency,
            contentLength: data.length,
            timestamp: new Date().toISOString()
          });
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          url,
          error: error.message,
          latency: Date.now() - startTime,
          timestamp: new Date().toISOString()
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          url,
          error: 'Request timeout',
          latency: this.timeout,
          timestamp: new Date().toISOString()
        });
      });
    });
  }

  /**
   * Test multiple endpoints and compare latency
   * @param {Array<string>} urls - List of URLs to test
   * @returns {object} - Comparison results
   */
  async compareEndpoints(urls) {
    console.log(`\n⚖️  Comparing ${urls.length} endpoints...\n`);

    const results = [];

    for (const url of urls) {
      const result = await this.ping(url, 3);
      results.push(result);
    }

    // Sort by average latency
    const sorted = results
      .filter(r => r.success)
      .sort((a, b) => a.latency.avg - b.latency.avg);

    console.log('\n🏆 Rankings (by average latency):');
    sorted.forEach((result, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
      console.log(`  ${medal} ${index + 1}. ${result.url} - ${result.latency.avg}ms avg`);
    });
    console.log('');

    return {
      results,
      fastest: sorted[0],
      slowest: sorted[sorted.length - 1],
      rankings: sorted.map((r, i) => ({
        rank: i + 1,
        url: r.url,
        avgLatency: r.latency.avg
      }))
    };
  }

  /**
   * Continuous monitoring (like ping -t)
   * @param {string} url - URL to monitor
   * @param {number} interval - Interval in ms (default 5s)
   * @param {Function} callback - Called on each ping
   */
  async monitor(url, interval = 5000, callback) {
    console.log(`\n📡 Monitoring ${url} (press Ctrl+C to stop)...\n`);

    let pingCount = 0;
    const stats = {
      total: 0,
      successful: 0,
      failed: 0,
      latencies: []
    };

    const doPing = async () => {
      pingCount++;
      const result = await this.testTCPConnection(url);

      stats.total++;
      if (result.success) {
        stats.successful++;
        stats.latencies.push(result.latency);

        const avg = stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length;
        console.log(`  [${new Date().toLocaleTimeString()}] ✓ ${result.latency}ms (avg: ${avg.toFixed(1)}ms, uptime: ${((stats.successful / stats.total) * 100).toFixed(1)}%)`);
      } else {
        stats.failed++;
        console.log(`  [${new Date().toLocaleTimeString()}] ✗ ${result.error} (uptime: ${((stats.successful / stats.total) * 100).toFixed(1)}%)`);
      }

      if (callback) {
        callback(result, stats);
      }

      // Schedule next ping
      setTimeout(doPing, interval);
    };

    // Start monitoring
    doPing();
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = NetworkDiagnostics;
