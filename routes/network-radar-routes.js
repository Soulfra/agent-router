/**
 * Network Radar Routes
 *
 * API endpoints for network traffic monitoring.
 * Like router admin panel + Wireshark + netstat API.
 *
 * Endpoints:
 * - GET /api/network/connections  - Active connections (like netstat -an)
 * - GET /api/network/traffic      - Traffic stats and overview
 * - GET /api/network/bandwidth    - Bandwidth usage per IP
 * - GET /api/network/suspicious   - Suspicious activity
 * - GET /api/network/geo          - Geographic distribution
 * - GET /api/network/analyze      - Full analysis (patterns, anomalies)
 * - GET /api/network/trends       - Historical trends
 * - GET /api/network/endpoints    - Endpoint performance analysis
 */

const express = require('express');

function initRoutes(trafficMonitor, networkAnalytics) {
  const router = express.Router();

  /**
   * GET /api/network/connections
   * Get active connections (like netstat -an)
   */
  router.get('/connections', async (req, res) => {
    try {
      const connections = await trafficMonitor.getConnections();

      res.json({
        success: true,
        count: connections.length,
        connections: connections
      });

    } catch (error) {
      console.error('[NetworkRadarAPI] Connections error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/network/traffic
   * Get traffic stats and overview
   */
  router.get('/traffic', async (req, res) => {
    try {
      const stats = await trafficMonitor.getTrafficStats();

      res.json({
        success: true,
        stats: stats
      });

    } catch (error) {
      console.error('[NetworkRadarAPI] Traffic error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/network/bandwidth
   * Get bandwidth usage per IP
   */
  router.get('/bandwidth', async (req, res) => {
    try {
      const {
        limit = 50,
        sort = 'total'  // total, in, out
      } = req.query;

      let bandwidth = trafficMonitor.getBandwidthUsage();

      // Sort
      if (sort === 'in') {
        bandwidth = bandwidth.sort((a, b) => b.bytesIn - a.bytesIn);
      } else if (sort === 'out') {
        bandwidth = bandwidth.sort((a, b) => b.bytesOut - a.bytesOut);
      }

      // Limit
      bandwidth = bandwidth.slice(0, parseInt(limit));

      res.json({
        success: true,
        count: bandwidth.length,
        bandwidth: bandwidth
      });

    } catch (error) {
      console.error('[NetworkRadarAPI] Bandwidth error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/network/suspicious
   * Get suspicious activity
   */
  router.get('/suspicious', async (req, res) => {
    try {
      const {
        type = null,      // rapid_requests, port_scan, suspicious_user_agent
        severity = null,  // low, medium, high, critical
        limit = 100
      } = req.query;

      let suspicious = trafficMonitor.getSuspiciousActivity();

      // Filter by type
      if (type) {
        suspicious = suspicious.filter(s => s.type === type);
      }

      // Filter by severity
      if (severity) {
        suspicious = suspicious.filter(s => s.severity === severity);
      }

      // Limit
      suspicious = suspicious.slice(0, parseInt(limit));

      res.json({
        success: true,
        count: suspicious.length,
        suspicious: suspicious
      });

    } catch (error) {
      console.error('[NetworkRadarAPI] Suspicious error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/network/geo
   * Get geographic distribution
   */
  router.get('/geo', async (req, res) => {
    try {
      const geo = await trafficMonitor.getGeoDistribution();

      res.json({
        success: true,
        countries: geo.length,
        distribution: geo
      });

    } catch (error) {
      console.error('[NetworkRadarAPI] Geo error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/network/analyze
   * Full analysis (patterns, anomalies, recommendations)
   */
  router.get('/analyze', async (req, res) => {
    try {
      const analysis = await networkAnalytics.analyze();

      res.json({
        success: true,
        analysis: analysis
      });

    } catch (error) {
      console.error('[NetworkRadarAPI] Analyze error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/network/trends
   * Historical trends
   */
  router.get('/trends', async (req, res) => {
    try {
      const {
        timeframe = 3600000  // 1 hour default
      } = req.query;

      const trends = await networkAnalytics.getTrends({
        timeframe: parseInt(timeframe)
      });

      res.json({
        success: true,
        trends: trends
      });

    } catch (error) {
      console.error('[NetworkRadarAPI] Trends error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/network/endpoints
   * Endpoint performance analysis
   */
  router.get('/endpoints', async (req, res) => {
    try {
      const stats = await trafficMonitor.getTrafficStats();
      const endpoints = networkAnalytics.analyzeEndpoints(stats);

      res.json({
        success: true,
        count: endpoints.length,
        endpoints: endpoints
      });

    } catch (error) {
      console.error('[NetworkRadarAPI] Endpoints error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/network/radar
   * Full radar data (everything for dashboard)
   */
  router.get('/radar', async (req, res) => {
    try {
      const [
        connections,
        stats,
        bandwidth,
        suspicious,
        geo
      ] = await Promise.all([
        trafficMonitor.getConnections(),
        trafficMonitor.getTrafficStats(),
        Promise.resolve(trafficMonitor.getBandwidthUsage()),
        Promise.resolve(trafficMonitor.getSuspiciousActivity()),
        trafficMonitor.getGeoDistribution()
      ]);

      res.json({
        success: true,
        timestamp: Date.now(),
        radar: {
          connections: connections.slice(0, 50),
          stats: {
            uptime: stats.uptime,
            totalRequests: stats.totalRequests,
            uniqueIPs: stats.uniqueIPs,
            requestsPerMinute: stats.requestsPerMinute,
            activeConnections: connections.length,
            internal: stats.internal,
            external: stats.external
          },
          bandwidth: bandwidth.slice(0, 20),
          suspicious: suspicious.slice(0, 10),
          geo: geo.slice(0, 10),
          topIPs: stats.topIPs.slice(0, 10),
          topEndpoints: stats.topEndpoints.slice(0, 10)
        }
      });

    } catch (error) {
      console.error('[NetworkRadarAPI] Radar error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = { initRoutes };
