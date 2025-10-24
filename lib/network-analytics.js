/**
 * Network Analytics
 *
 * Analyzes network traffic patterns, trends, anomalies.
 * Like Google Analytics but for network traffic.
 *
 * Features:
 * - Traffic pattern analysis (hourly, daily, weekly)
 * - Geographic distribution
 * - Endpoint popularity analysis
 * - Bandwidth anomaly detection
 * - Attack pattern recognition
 * - Peak hours detection
 * - User behavior analysis
 *
 * Pattern: Google Analytics, Mixpanel, network monitoring tools
 */

class NetworkAnalytics {
  constructor(options = {}) {
    this.config = {
      // Reference to traffic monitor
      monitor: options.monitor,

      // Analysis settings
      trendTimeframes: options.trendTimeframes || [
        { name: '1h', duration: 3600000 },
        { name: '6h', duration: 21600000 },
        { name: '24h', duration: 86400000 },
        { name: '7d', duration: 604800000 }
      ],

      // Anomaly detection
      anomalyThreshold: options.anomalyThreshold || 3.0, // 3x standard deviation
      peakTrafficRatio: options.peakTrafficRatio || 2.0, // 2x average = peak

      // Pattern recognition
      minPatternOccurrences: options.minPatternOccurrences || 3,
      patternSimilarityThreshold: options.patternSimilarityThreshold || 0.8
    };

    if (!this.config.monitor) {
      throw new Error('NetworkAnalytics requires a NetworkTrafficMonitor instance');
    }
  }

  /**
   * Analyze current traffic
   */
  async analyze() {
    const stats = await this.config.monitor.getTrafficStats();
    const connections = await this.config.monitor.getConnections();
    const bandwidth = this.config.monitor.getBandwidthUsage();
    const suspicious = this.config.monitor.getSuspiciousActivity();
    const geo = await this.config.monitor.getGeoDistribution();

    return {
      overview: this._generateOverview(stats, connections),
      patterns: this._identifyPatterns(stats),
      anomalies: this._detectAnomalies(stats, bandwidth),
      geographic: this._analyzeGeographic(geo),
      endpoints: this._analyzeEndpoints(stats),
      security: this._analyzeSecurity(suspicious),
      recommendations: this._generateRecommendations(stats, suspicious, bandwidth)
    };
  }

  /**
   * Get traffic trends over time
   */
  async getTrends(options = {}) {
    const timeframe = options.timeframe || 3600000; // 1 hour default
    const stats = await this.config.monitor.getTrafficStats();

    const trends = {
      timeframe,
      timeframeName: this._getTimeframeName(timeframe),
      current: stats,
      changes: [],
      predictions: []
    };

    // Group requests by time buckets
    const bucketSize = timeframe / 10; // 10 data points
    const buckets = this._groupByTimeBuckets(stats.recentRequests, bucketSize);

    // Calculate trend
    const requestCounts = buckets.map(b => b.length);
    trends.trend = this._calculateTrend(requestCounts);
    trends.buckets = buckets.map((requests, i) => ({
      startTime: Date.now() - timeframe + (i * bucketSize),
      endTime: Date.now() - timeframe + ((i + 1) * bucketSize),
      requestCount: requests.length,
      uniqueIPs: new Set(requests.map(r => r.ip)).size
    }));

    // Detect peak hours
    trends.peakHours = this._detectPeakHours(buckets);

    return trends;
  }

  /**
   * Analyze endpoint performance
   */
  analyzeEndpoints(stats) {
    const endpoints = new Map();

    for (const request of stats.recentRequests) {
      if (!endpoints.has(request.path)) {
        endpoints.set(request.path, {
          path: request.path,
          requests: [],
          totalDuration: 0,
          totalBytesIn: 0,
          totalBytesOut: 0,
          statusCodes: new Map()
        });
      }

      const endpoint = endpoints.get(request.path);
      endpoint.requests.push(request);
      endpoint.totalDuration += request.duration || 0;
      endpoint.totalBytesIn += request.bytesIn || 0;
      endpoint.totalBytesOut += request.bytesOut || 0;

      const statusCode = request.statusCode || 'unknown';
      endpoint.statusCodes.set(statusCode, (endpoint.statusCodes.get(statusCode) || 0) + 1);
    }

    // Calculate metrics
    const analysis = Array.from(endpoints.values()).map(endpoint => {
      const count = endpoint.requests.length;
      const avgDuration = count > 0 ? endpoint.totalDuration / count : 0;
      const avgBytesOut = count > 0 ? endpoint.totalBytesOut / count : 0;

      return {
        path: endpoint.path,
        requestCount: count,
        avgDuration,
        avgBytesOut,
        totalBytesIn: endpoint.totalBytesIn,
        totalBytesOut: endpoint.totalBytesOut,
        statusCodes: Object.fromEntries(endpoint.statusCodes),
        errorRate: (endpoint.statusCodes.get(500) || 0) / count
      };
    });

    return analysis.sort((a, b) => b.requestCount - a.requestCount);
  }

  /**
   * Detect bandwidth anomalies
   */
  detectBandwidthAnomalies(bandwidth) {
    if (bandwidth.length === 0) return [];

    // Calculate average and standard deviation
    const totals = bandwidth.map(b => b.total);
    const avg = totals.reduce((sum, val) => sum + val, 0) / totals.length;
    const variance = totals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / totals.length;
    const stdDev = Math.sqrt(variance);

    // Find anomalies (values > threshold * stdDev from mean)
    const anomalies = [];
    for (const bw of bandwidth) {
      const deviation = Math.abs(bw.total - avg) / stdDev;
      if (deviation > this.config.anomalyThreshold) {
        anomalies.push({
          ip: bw.ip,
          total: bw.total,
          bytesIn: bw.bytesIn,
          bytesOut: bw.bytesOut,
          deviation,
          severity: this._calculateSeverity(deviation),
          isInternal: bw.isInternal
        });
      }
    }

    return anomalies.sort((a, b) => b.deviation - a.deviation);
  }

  /**
   * Analyze attack patterns
   */
  analyzeAttackPatterns(suspicious) {
    const patterns = {
      dos: suspicious.filter(s => s.type === 'rapid_requests'),
      portScanning: suspicious.filter(s => s.type === 'port_scan'),
      suspiciousAgents: suspicious.filter(s => s.type === 'suspicious_user_agent'),
      other: suspicious.filter(s => !['rapid_requests', 'port_scan', 'suspicious_user_agent'].includes(s.type))
    };

    // Group by IP
    const byIP = new Map();
    for (const activity of suspicious) {
      if (!byIP.has(activity.ip)) {
        byIP.set(activity.ip, []);
      }
      byIP.get(activity.ip).push(activity);
    }

    // Find repeat offenders
    const repeatOffenders = Array.from(byIP.entries())
      .filter(([ip, activities]) => activities.length >= this.config.minPatternOccurrences)
      .map(([ip, activities]) => ({
        ip,
        activityCount: activities.length,
        types: [...new Set(activities.map(a => a.type))],
        firstSeen: Math.min(...activities.map(a => a.timestamp)),
        lastSeen: Math.max(...activities.map(a => a.timestamp)),
        severity: this._calculateOverallSeverity(activities)
      }))
      .sort((a, b) => b.activityCount - a.activityCount);

    return {
      patterns,
      repeatOffenders,
      total: suspicious.length,
      uniqueIPs: byIP.size
    };
  }

  /**
   * Generate overview
   */
  _generateOverview(stats, connections) {
    return {
      uptime: stats.uptime,
      totalRequests: stats.totalRequests,
      uniqueIPs: stats.uniqueIPs,
      requestsPerMinute: stats.requestsPerMinute,
      activeConnections: connections.length,
      internalTraffic: stats.internal,
      externalTraffic: stats.external,
      totalBandwidth: stats.totalBytesIn + stats.totalBytesOut,
      avgRequestSize: stats.totalRequests > 0 ? (stats.totalBytesIn + stats.totalBytesOut) / stats.totalRequests : 0
    };
  }

  /**
   * Identify traffic patterns
   */
  _identifyPatterns(stats) {
    const patterns = [];

    // High traffic pattern
    if (stats.requestsPerMinute > 100) {
      patterns.push({
        type: 'high_traffic',
        description: `High traffic detected: ${stats.requestsPerMinute} req/min`,
        severity: 'medium'
      });
    }

    // Low traffic pattern
    if (stats.requestsPerMinute < 1 && stats.totalRequests > 10) {
      patterns.push({
        type: 'low_traffic',
        description: 'Very low traffic detected',
        severity: 'low'
      });
    }

    // Internal-heavy pattern
    const internalRatio = stats.internal / (stats.internal + stats.external);
    if (internalRatio > 0.8) {
      patterns.push({
        type: 'internal_heavy',
        description: `${(internalRatio * 100).toFixed(0)}% internal traffic`,
        severity: 'low'
      });
    }

    // External-heavy pattern
    if (internalRatio < 0.2) {
      patterns.push({
        type: 'external_heavy',
        description: `${((1 - internalRatio) * 100).toFixed(0)}% external traffic`,
        severity: 'low'
      });
    }

    return patterns;
  }

  /**
   * Detect anomalies
   */
  _detectAnomalies(stats, bandwidth) {
    const anomalies = [];

    // Bandwidth anomalies
    const bwAnomalies = this.detectBandwidthAnomalies(bandwidth);
    anomalies.push(...bwAnomalies.map(a => ({
      type: 'bandwidth_anomaly',
      description: `Unusual bandwidth from ${a.ip}: ${this._formatBytes(a.total)}`,
      severity: a.severity,
      data: a
    })));

    return anomalies;
  }

  /**
   * Analyze geographic distribution
   */
  _analyzeGeographic(geo) {
    if (!geo || geo.length === 0) {
      return {
        countries: 0,
        topCountries: [],
        distribution: []
      };
    }

    return {
      countries: geo.length,
      topCountries: geo.slice(0, 5),
      distribution: geo
    };
  }

  /**
   * Analyze endpoints
   */
  _analyzeEndpoints(stats) {
    if (!stats.topEndpoints || stats.topEndpoints.length === 0) {
      return {
        total: 0,
        topEndpoints: []
      };
    }

    return {
      total: stats.topEndpoints.length,
      topEndpoints: stats.topEndpoints.slice(0, 10)
    };
  }

  /**
   * Analyze security
   */
  _analyzeSecurity(suspicious) {
    const attackPatterns = this.analyzeAttackPatterns(suspicious);

    return {
      totalThreats: suspicious.length,
      activeThreats: suspicious.filter(s => Date.now() - s.timestamp < 300000).length, // Last 5 min
      threatLevel: this._calculateThreatLevel(suspicious),
      attackPatterns
    };
  }

  /**
   * Generate recommendations
   */
  _generateRecommendations(stats, suspicious, bandwidth) {
    const recommendations = [];

    // Security recommendations
    if (suspicious.length > 10) {
      recommendations.push({
        type: 'security',
        priority: 'high',
        title: 'High number of suspicious activities detected',
        description: `${suspicious.length} suspicious activities in last hour. Consider implementing rate limiting or IP blocking.`,
        action: 'Review suspicious activity and consider blocking repeat offenders'
      });
    }

    // Performance recommendations
    if (stats.requestsPerMinute > 1000) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        title: 'High traffic volume',
        description: `${stats.requestsPerMinute} req/min. Consider implementing caching or load balancing.`,
        action: 'Enable caching, CDN, or add more servers'
      });
    }

    // Bandwidth recommendations
    const totalBandwidth = stats.totalBytesOut + stats.totalBytesIn;
    if (totalBandwidth > 1e9) { // 1 GB
      recommendations.push({
        type: 'bandwidth',
        priority: 'medium',
        title: 'High bandwidth usage',
        description: `${this._formatBytes(totalBandwidth)} transferred. Monitor costs and optimize responses.`,
        action: 'Enable compression, optimize images, implement CDN'
      });
    }

    return recommendations;
  }

  /**
   * Group requests by time buckets
   */
  _groupByTimeBuckets(requests, bucketSize) {
    const now = Date.now();
    const buckets = Array.from({ length: 10 }, () => []);

    for (const request of requests) {
      const age = now - request.timestamp;
      const bucketIndex = Math.floor(age / bucketSize);
      if (bucketIndex >= 0 && bucketIndex < 10) {
        buckets[9 - bucketIndex].push(request); // Reverse order (oldest to newest)
      }
    }

    return buckets;
  }

  /**
   * Calculate trend (increasing, decreasing, stable)
   */
  _calculateTrend(values) {
    if (values.length < 2) return 'unknown';

    // Calculate linear regression slope
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, i) => sum + (i * val), 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (slope > 0.1) return 'increasing';
    if (slope < -0.1) return 'decreasing';
    return 'stable';
  }

  /**
   * Detect peak hours
   */
  _detectPeakHours(buckets) {
    const counts = buckets.map(b => b.length);
    const avg = counts.reduce((sum, val) => sum + val, 0) / counts.length;

    return buckets
      .map((bucket, i) => ({
        index: i,
        count: bucket.length,
        isPeak: bucket.length > avg * this.config.peakTrafficRatio
      }))
      .filter(b => b.isPeak);
  }

  /**
   * Calculate severity
   */
  _calculateSeverity(deviation) {
    if (deviation > 5) return 'critical';
    if (deviation > 3) return 'high';
    if (deviation > 2) return 'medium';
    return 'low';
  }

  /**
   * Calculate overall severity
   */
  _calculateOverallSeverity(activities) {
    const severityScores = { low: 1, medium: 2, high: 3, critical: 4 };
    const totalScore = activities.reduce((sum, a) => sum + (severityScores[a.severity] || 1), 0);
    const avgScore = totalScore / activities.length;

    if (avgScore >= 3.5) return 'critical';
    if (avgScore >= 2.5) return 'high';
    if (avgScore >= 1.5) return 'medium';
    return 'low';
  }

  /**
   * Calculate threat level
   */
  _calculateThreatLevel(suspicious) {
    if (suspicious.length === 0) return 'none';
    if (suspicious.length > 50) return 'critical';
    if (suspicious.length > 20) return 'high';
    if (suspicious.length > 5) return 'medium';
    return 'low';
  }

  /**
   * Get timeframe name
   */
  _getTimeframeName(duration) {
    const hours = duration / 3600000;
    if (hours < 1) return `${Math.round(duration / 60000)}m`;
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
  }

  /**
   * Format bytes
   */
  _formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  }
}

module.exports = NetworkAnalytics;
