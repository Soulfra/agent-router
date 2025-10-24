/**
 * Bot Behavior Tracker
 *
 * Tracks bot personality switches, AWOL events, and engagement patterns.
 *
 * Features:
 * - Monitor personality switches (friendly → roast mode)
 * - Track "AWOL events" when bots go off-script
 * - Log user reactions to different personalities
 * - Measure roast effectiveness
 * - Track engagement metrics per personality type
 *
 * Use Case: "See when bots go from friendly to AWOL and roast people"
 */

class BotBehaviorTracker {
  constructor(options = {}) {
    this.db = options.db;
    this.ollamaClient = options.ollamaClient;

    this.config = {
      ollamaModel: options.ollamaModel || 'mistral:latest',
      ollamaHost: options.ollamaHost || 'http://127.0.0.1:11434',

      // AWOL detection thresholds
      roastKeywords: ['bruh', 'lol', 'fr fr', 'no cap', '💀', 'nah', 'mid'],
      aggressiveKeywords: ['trash', 'terrible', 'awful', 'worst', 'cringe'],
      personalityChangeThreshold: 3, // # of keywords to trigger personality switch
    };

    // In-memory tracking
    this.currentPersonalities = new Map(); // bot_id -> personality
    this.recentMessages = new Map(); // bot_id -> [messages]
    this.awolEvents = [];

    console.log('[BotBehaviorTracker] Initialized');
  }

  /**
   * Track a bot message and detect personality
   */
  async trackMessage(botId, message, context = {}) {
    try {
      // Analyze message tone
      const analysis = this.analyzeMessageTone(message);

      // Get current personality
      const currentPersonality = this.currentPersonalities.get(botId) || 'friendly';

      // Detect personality switch
      const newPersonality = this.detectPersonality(message);

      // Check if bot went AWOL
      if (currentPersonality === 'friendly' && newPersonality === 'roast') {
        await this.logAWOLEvent({
          botId,
          trigger: context.userMessage || 'unknown',
          message,
          previousPersonality: currentPersonality,
          newPersonality
        });
      }

      // Log personality switch if changed
      if (currentPersonality !== newPersonality) {
        await this.logPersonalitySwitch({
          botId,
          fromPersonality: currentPersonality,
          toPersonality: newPersonality,
          message,
          analysis,
          context
        });

        this.currentPersonalities.set(botId, newPersonality);
      }

      // Store recent messages for pattern detection
      if (!this.recentMessages.has(botId)) {
        this.recentMessages.set(botId, []);
      }

      const recent = this.recentMessages.get(botId);
      recent.push({
        message,
        personality: newPersonality,
        analysis,
        timestamp: Date.now()
      });

      // Keep last 20 messages
      if (recent.length > 20) {
        recent.shift();
      }

      return {
        success: true,
        personality: newPersonality,
        switched: currentPersonality !== newPersonality,
        analysis
      };

    } catch (error) {
      console.error('[BotBehaviorTracker] Error tracking message:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze message tone using keyword detection
   */
  analyzeMessageTone(message) {
    const lower = message.toLowerCase();

    let roastScore = 0;
    let aggressiveScore = 0;
    let emojiCount = 0;

    // Count roast keywords
    for (const keyword of this.config.roastKeywords) {
      if (lower.includes(keyword)) roastScore++;
    }

    // Count aggressive keywords
    for (const keyword of this.config.aggressiveKeywords) {
      if (lower.includes(keyword)) aggressiveScore++;
    }

    // Count emojis
    emojiCount = (message.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;

    return {
      roastScore,
      aggressiveScore,
      emojiCount,
      length: message.length,
      tone: roastScore + aggressiveScore > 2 ? 'roast' : emojiCount > 2 ? 'playful' : 'neutral'
    };
  }

  /**
   * Detect personality from message
   */
  detectPersonality(message) {
    const analysis = this.analyzeMessageTone(message);

    // AWOL/Roast mode
    if (analysis.roastScore >= this.config.personalityChangeThreshold ||
        analysis.aggressiveScore >= 2) {
      return 'roast';
    }

    // Playful mode
    if (analysis.emojiCount >= 3 && analysis.roastScore > 0) {
      return 'playful';
    }

    // Friendly mode
    return 'friendly';
  }

  /**
   * Log AWOL event (bot went from friendly to roasting)
   */
  async logAWOLEvent(eventData) {
    console.log(`[BotBehaviorTracker] 🔥 BOT WENT AWOL: ${eventData.botId}`);

    const awolEvent = {
      eventId: this._generateId(),
      botId: eventData.botId,
      trigger: eventData.trigger,
      message: eventData.message,
      previousPersonality: eventData.previousPersonality,
      newPersonality: eventData.newPersonality,
      timestamp: new Date()
    };

    // Store in memory
    this.awolEvents.push(awolEvent);

    // Store in database
    if (this.db) {
      try {
        await this.db.query(`
          INSERT INTO bot_awol_events (
            event_id,
            bot_id,
            trigger,
            message,
            previous_personality,
            new_personality,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
          awolEvent.eventId,
          awolEvent.botId,
          awolEvent.trigger,
          awolEvent.message,
          awolEvent.previousPersonality,
          awolEvent.newPersonality
        ]);
      } catch (error) {
        console.warn('[BotBehaviorTracker] Failed to store AWOL event:', error.message);
      }
    }

    return awolEvent;
  }

  /**
   * Log personality switch
   */
  async logPersonalitySwitch(switchData) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        INSERT INTO bot_personality_switches (
          bot_id,
          from_personality,
          to_personality,
          message,
          analysis,
          context,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING switch_id
      `, [
        switchData.botId,
        switchData.fromPersonality,
        switchData.toPersonality,
        switchData.message,
        JSON.stringify(switchData.analysis),
        JSON.stringify(switchData.context)
      ]);

      return result.rows[0]?.switch_id;
    } catch (error) {
      console.warn('[BotBehaviorTracker] Failed to log personality switch:', error.message);
      return null;
    }
  }

  /**
   * Track user reaction to bot message
   */
  async trackUserReaction(botId, messageId, reaction) {
    if (!this.db) return null;

    try {
      await this.db.query(`
        INSERT INTO bot_user_reactions (
          bot_id,
          message_id,
          reaction_type,
          reaction_value,
          created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [
        botId,
        messageId,
        reaction.type, // 'like', 'dislike', 'laugh', 'report'
        reaction.value || 1
      ]);

      return { success: true };
    } catch (error) {
      console.warn('[BotBehaviorTracker] Failed to track reaction:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get AWOL events for a bot
   */
  async getAWOLEvents(botId = null, limit = 20) {
    if (!this.db) {
      // Return in-memory events
      return {
        success: true,
        events: botId
          ? this.awolEvents.filter(e => e.botId === botId).slice(-limit)
          : this.awolEvents.slice(-limit)
      };
    }

    try {
      const params = [];
      let query = `
        SELECT
          ae.*,
          b.name as bot_name,
          b.platform,
          b.personality as bot_base_personality
        FROM bot_awol_events ae
        JOIN bots b ON b.bot_id = ae.bot_id
      `;

      if (botId) {
        query += ` WHERE ae.bot_id = $1`;
        params.push(botId);
      }

      query += ` ORDER BY ae.created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.db.query(query, params);

      return {
        success: true,
        events: result.rows
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get personality switch history
   */
  async getPersonalitySwitches(botId = null, limit = 50) {
    if (!this.db) {
      return {
        success: false,
        error: 'Database not available'
      };
    }

    try {
      const params = [];
      let query = `
        SELECT
          ps.*,
          b.name as bot_name,
          b.platform
        FROM bot_personality_switches ps
        JOIN bots b ON b.bot_id = ps.bot_id
      `;

      if (botId) {
        query += ` WHERE ps.bot_id = $1`;
        params.push(botId);
      }

      query += ` ORDER BY ps.created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.db.query(query, params);

      return {
        success: true,
        switches: result.rows
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get bot behavior statistics
   */
  async getBotBehaviorStats(botId) {
    if (!this.db) {
      return {
        success: false,
        error: 'Database not available'
      };
    }

    try {
      // Get personality distribution
      const personalityDist = await this.db.query(`
        SELECT
          to_personality,
          COUNT(*) as count
        FROM bot_personality_switches
        WHERE bot_id = $1
        GROUP BY to_personality
        ORDER BY count DESC
      `, [botId]);

      // Get AWOL frequency
      const awolFreq = await this.db.query(`
        SELECT
          COUNT(*) as total_awol_events,
          COUNT(DISTINCT DATE(created_at)) as days_with_awol
        FROM bot_awol_events
        WHERE bot_id = $1
      `, [botId]);

      // Get recent personality timeline
      const timeline = await this.db.query(`
        SELECT
          from_personality,
          to_personality,
          created_at
        FROM bot_personality_switches
        WHERE bot_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [botId]);

      // Get user reaction stats
      const reactions = await this.db.query(`
        SELECT
          reaction_type,
          COUNT(*) as count,
          AVG(reaction_value) as avg_value
        FROM bot_user_reactions
        WHERE bot_id = $1
        GROUP BY reaction_type
      `, [botId]);

      return {
        success: true,
        stats: {
          personalityDistribution: personalityDist.rows,
          awolFrequency: awolFreq.rows[0] || { total_awol_events: 0, days_with_awol: 0 },
          recentTimeline: timeline.rows,
          userReactions: reactions.rows
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get roast effectiveness (how users react to roasts)
   */
  async getRoastEffectiveness(botId = null) {
    if (!this.db) {
      return {
        success: false,
        error: 'Database not available'
      };
    }

    try {
      const params = [];
      let query = `
        SELECT
          ae.bot_id,
          b.name as bot_name,
          COUNT(*) as total_roasts,
          AVG(
            CASE
              WHEN r.reaction_type = 'laugh' THEN 1
              WHEN r.reaction_type = 'like' THEN 0.8
              WHEN r.reaction_type = 'dislike' THEN -0.5
              WHEN r.reaction_type = 'report' THEN -1
              ELSE 0
            END
          ) as effectiveness_score
        FROM bot_awol_events ae
        JOIN bots b ON b.bot_id = ae.bot_id
        LEFT JOIN bot_user_reactions r ON r.bot_id = ae.bot_id
          AND r.created_at > ae.created_at
          AND r.created_at < ae.created_at + INTERVAL '5 minutes'
      `;

      if (botId) {
        query += ` WHERE ae.bot_id = $1`;
        params.push(botId);
      }

      query += ` GROUP BY ae.bot_id, b.name ORDER BY effectiveness_score DESC`;

      const result = await this.db.query(query, params);

      return {
        success: true,
        effectiveness: result.rows
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate unique ID
   */
  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = BotBehaviorTracker;
