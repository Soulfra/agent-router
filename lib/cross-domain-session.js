/**
 * Cross-Domain Session Manager
 *
 * Enables session/cookie sharing across your domain ecosystem (calos.ai, soulfra.com, deathtodata.com, roughsparks.com)
 * Tracks user journey across domains while maintaining privacy (no data selling).
 *
 * Features:
 * - SSO cookie sharing (via soulfra.com as auth provider)
 * - Activity tracking across domains
 * - Privacy-first (only YOUR domains, never sold)
 * - Public "billboard" activity feed
 * - Cross-domain analytics
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class CrossDomainSession extends EventEmitter {
  constructor({ db, domains = [], authDomain = 'soulfra.com' }) {
    super();

    this.db = db;
    this.authDomain = authDomain;

    // Your domain ecosystem
    this.domains = domains.length > 0 ? domains : [
      'calos.ai',
      'soulfra.com',
      'deathtodata.com',
      'roughsparks.com'
    ];

    // Active sessions
    this.sessions = new Map();

    // Activity tracking
    this.activityFeed = [];
    this.maxFeedSize = 1000;

    console.log(`[CrossDomainSession] Initialized for domains: ${this.domains.join(', ')}`);
    console.log(`[CrossDomainSession] Auth provider: ${this.authDomain}`);
  }

  /**
   * Create cross-domain session
   *
   * Called when user logs in via soulfra.com SSO
   */
  async createSession({ userId, userEmail, deviceId = null, metadata = {} }) {
    const sessionId = crypto.randomUUID();
    const sessionToken = this.generateSessionToken();

    const session = {
      sessionId,
      sessionToken,
      userId,
      userEmail,
      deviceId,
      createdAt: new Date(),
      lastActivity: new Date(),
      domains: new Map(), // Track which domains user has visited
      activities: [],
      metadata
    };

    this.sessions.set(sessionId, session);

    // Store in database
    if (this.db) {
      await this.db.query(
        `INSERT INTO cross_domain_sessions (
          session_id, session_token, user_id, user_email, device_id,
          created_at, last_activity, metadata
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)`,
        [sessionId, sessionToken, userId, userEmail, deviceId, JSON.stringify(metadata)]
      );
    }

    console.log(`[CrossDomainSession] Created session for ${userEmail} (${sessionId})`);

    // Emit event
    this.emit('session_created', {
      sessionId,
      userId,
      userEmail
    });

    return {
      sessionId,
      sessionToken,
      cookieDirectives: this.generateCookieDirectives(sessionToken)
    };
  }

  /**
   * Generate cookie directives for all domains
   *
   * Returns Set-Cookie headers for each domain in your ecosystem
   */
  generateCookieDirectives(sessionToken) {
    const maxAge = 30 * 24 * 60 * 60; // 30 days
    const directives = [];

    for (const domain of this.domains) {
      directives.push({
        domain,
        name: 'calos_session',
        value: sessionToken,
        maxAge,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/'
      });
    }

    return directives;
  }

  /**
   * Validate session token
   */
  async validateSession(sessionToken) {
    // Check in-memory cache first
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.sessionToken === sessionToken) {
        return {
          valid: true,
          session
        };
      }
    }

    // Check database
    if (this.db) {
      const result = await this.db.query(
        `SELECT * FROM cross_domain_sessions
         WHERE session_token = $1 AND expired = false`,
        [sessionToken]
      );

      if (result.rows.length > 0) {
        const dbSession = result.rows[0];

        // Load into cache
        const session = {
          sessionId: dbSession.session_id,
          sessionToken: dbSession.session_token,
          userId: dbSession.user_id,
          userEmail: dbSession.user_email,
          deviceId: dbSession.device_id,
          createdAt: dbSession.created_at,
          lastActivity: dbSession.last_activity,
          domains: new Map(),
          activities: [],
          metadata: dbSession.metadata
        };

        this.sessions.set(session.sessionId, session);

        return {
          valid: true,
          session
        };
      }
    }

    return {
      valid: false,
      session: null
    };
  }

  /**
   * Track activity on a domain
   */
  async trackActivity({ sessionToken, domain, activity, url = null, metadata = {} }) {
    // Validate session
    const validation = await this.validateSession(sessionToken);
    if (!validation.valid) {
      throw new Error('Invalid session token');
    }

    const session = validation.session;

    // Record domain visit
    if (!session.domains.has(domain)) {
      session.domains.set(domain, {
        firstVisit: new Date(),
        visitCount: 0
      });
    }

    const domainData = session.domains.get(domain);
    domainData.visitCount++;
    domainData.lastVisit = new Date();

    // Record activity
    const activityRecord = {
      activityId: crypto.randomUUID(),
      sessionId: session.sessionId,
      userId: session.userId,
      domain,
      activity,
      url,
      timestamp: new Date(),
      metadata
    };

    session.activities.push(activityRecord);
    session.lastActivity = new Date();

    // Add to global activity feed (for billboard)
    this.addToActivityFeed(activityRecord);

    // Store in database
    if (this.db) {
      await this.db.query(
        `INSERT INTO activity_feed (
          activity_id, session_id, user_id, domain, activity, url,
          timestamp, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
        [
          activityRecord.activityId,
          session.sessionId,
          session.userId,
          domain,
          activity,
          url,
          JSON.stringify(metadata)
        ]
      );

      // Update session last activity
      await this.db.query(
        `UPDATE cross_domain_sessions
         SET last_activity = NOW()
         WHERE session_id = $1`,
        [session.sessionId]
      );
    }

    // Emit event
    this.emit('activity_tracked', activityRecord);

    return activityRecord;
  }

  /**
   * Add to activity feed (for billboard)
   */
  addToActivityFeed(activity) {
    this.activityFeed.unshift(activity);

    // Trim to max size
    if (this.activityFeed.length > this.maxFeedSize) {
      this.activityFeed = this.activityFeed.slice(0, this.maxFeedSize);
    }
  }

  /**
   * Get user's cross-domain journey
   */
  async getUserJourney(userId) {
    if (this.db) {
      const result = await this.db.query(
        `SELECT
          activity_id, domain, activity, url, timestamp, metadata
         FROM activity_feed
         WHERE user_id = $1
         ORDER BY timestamp DESC
         LIMIT 100`,
        [userId]
      );

      return {
        userId,
        activities: result.rows,
        domainVisits: this.aggregateDomainVisits(result.rows)
      };
    }

    // Fallback to in-memory
    const activities = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        activities.push(...session.activities);
      }
    }

    activities.sort((a, b) => b.timestamp - a.timestamp);

    return {
      userId,
      activities,
      domainVisits: this.aggregateDomainVisits(activities)
    };
  }

  /**
   * Aggregate domain visits from activities
   */
  aggregateDomainVisits(activities) {
    const visits = {};

    for (const activity of activities) {
      if (!visits[activity.domain]) {
        visits[activity.domain] = {
          domain: activity.domain,
          visitCount: 0,
          firstVisit: activity.timestamp,
          lastVisit: activity.timestamp
        };
      }

      visits[activity.domain].visitCount++;

      if (activity.timestamp < visits[activity.domain].firstVisit) {
        visits[activity.domain].firstVisit = activity.timestamp;
      }

      if (activity.timestamp > visits[activity.domain].lastVisit) {
        visits[activity.domain].lastVisit = activity.timestamp;
      }
    }

    return Object.values(visits);
  }

  /**
   * Get public activity feed (for billboard)
   */
  getActivityFeed({ limit = 50, domain = null, activityType = null } = {}) {
    let feed = [...this.activityFeed];

    // Filter by domain
    if (domain) {
      feed = feed.filter(a => a.domain === domain);
    }

    // Filter by activity type
    if (activityType) {
      feed = feed.filter(a => a.activity === activityType);
    }

    // Anonymize for public display
    feed = feed.map(a => ({
      activityId: a.activityId,
      domain: a.domain,
      activity: a.activity,
      timestamp: a.timestamp,
      // Don't expose userId/sessionId publicly
      userAnonymousId: this.anonymizeUserId(a.userId)
    }));

    return feed.slice(0, limit);
  }

  /**
   * Anonymize user ID for public display
   */
  anonymizeUserId(userId) {
    const hash = crypto.createHash('sha256').update(userId).digest('hex');
    return `user_${hash.substring(0, 8)}`;
  }

  /**
   * Get cross-domain analytics
   */
  async getAnalytics({ timeRange = '24h' } = {}) {
    const since = this.calculateTimeRange(timeRange);

    const analytics = {
      totalSessions: 0,
      activeSessions: 0,
      totalActivities: 0,
      uniqueUsers: new Set(),
      byDomain: {},
      topActivities: {},
      crossDomainFlows: []
    };

    // Calculate from in-memory sessions
    for (const session of this.sessions.values()) {
      analytics.totalSessions++;

      if (session.lastActivity > since) {
        analytics.activeSessions++;
        analytics.uniqueUsers.add(session.userId);
      }

      // Activities
      for (const activity of session.activities) {
        if (activity.timestamp > since) {
          analytics.totalActivities++;

          // By domain
          if (!analytics.byDomain[activity.domain]) {
            analytics.byDomain[activity.domain] = {
              domain: activity.domain,
              activities: 0,
              uniqueUsers: new Set()
            };
          }
          analytics.byDomain[activity.domain].activities++;
          analytics.byDomain[activity.domain].uniqueUsers.add(session.userId);

          // Top activities
          if (!analytics.topActivities[activity.activity]) {
            analytics.topActivities[activity.activity] = 0;
          }
          analytics.topActivities[activity.activity]++;
        }
      }
    }

    // Convert sets to counts
    analytics.uniqueUsers = analytics.uniqueUsers.size;
    for (const domain in analytics.byDomain) {
      analytics.byDomain[domain].uniqueUsers = analytics.byDomain[domain].uniqueUsers.size;
    }

    return analytics;
  }

  /**
   * Calculate time range
   */
  calculateTimeRange(range) {
    const now = Date.now();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    return new Date(now - (ranges[range] || ranges['24h']));
  }

  /**
   * Generate session token
   */
  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Expire session
   */
  async expireSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.sessions.delete(sessionId);

    if (this.db) {
      await this.db.query(
        `UPDATE cross_domain_sessions
         SET expired = true, expired_at = NOW()
         WHERE session_id = $1`,
        [sessionId]
      );
    }

    console.log(`[CrossDomainSession] Expired session: ${sessionId}`);

    this.emit('session_expired', { sessionId });
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      activeSessions: this.sessions.size,
      activityFeedSize: this.activityFeed.length,
      domains: this.domains.length
    };
  }
}

module.exports = CrossDomainSession;
