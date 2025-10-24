/**
 * User Playstyle Tracker
 *
 * Tracks HOW users interact with the system to personalize their experience.
 * Like understanding a gamer's playstyle, but for learning/building.
 *
 * Tracks:
 * - Question Style (direct vs exploratory, technical vs conceptual)
 * - Learning Path (tutorial vs docs vs trial-and-error)
 * - Interaction Pattern (burst sessions vs steady progress)
 * - Depth Preference (surface-level vs deep-dive)
 * - Tool Usage (power user vs guided mode)
 *
 * Use Cases:
 * - Personalize content delivery
 * - Recommend similar users/paths
 * - Predict what help they need next
 * - Optimize onboarding for different playstyles
 */

const { Pool } = require('pg');

class UserPlaystyleTracker {
  constructor(config = {}) {
    this.pool = new Pool({
      connectionString: config.databaseUrl || process.env.DATABASE_URL
    });

    console.log('[UserPlaystyleTracker] Initialized');
  }

  /**
   * Record user interaction (question, action, event)
   */
  async recordInteraction(data) {
    const {
      userId,
      identityId,
      interactionType, // 'question', 'action', 'navigation', 'tool_use'
      content,
      metadata = {},
      timestamp = new Date()
    } = data;

    try {
      // Classify the interaction
      const classification = this._classifyInteraction(interactionType, content, metadata);

      // Store interaction
      const result = await this.pool.query(`
        INSERT INTO user_interactions (
          user_id,
          identity_id,
          interaction_type,
          content,
          classification,
          metadata,
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        userId,
        identityId,
        interactionType,
        content,
        JSON.stringify(classification),
        JSON.stringify(metadata),
        timestamp
      ]);

      // Update playstyle profile
      await this._updatePlaystyleProfile(userId || identityId, classification);

      return result.rows[0];

    } catch (error) {
      console.error('[UserPlaystyleTracker] Error recording interaction:', error);
      throw error;
    }
  }

  /**
   * Get user's playstyle profile
   */
  async getPlaystyleProfile(userIdOrIdentity) {
    try {
      const result = await this.pool.query(`
        SELECT *
        FROM user_playstyles
        WHERE user_id = $1 OR identity_id = $1
      `, [userIdOrIdentity]);

      if (result.rows.length === 0) {
        return this._getDefaultPlaystyle();
      }

      return result.rows[0];

    } catch (error) {
      console.error('[UserPlaystyleTracker] Error getting playstyle:', error);
      return this._getDefaultPlaystyle();
    }
  }

  /**
   * Analyze user's recent interactions to update playstyle
   */
  async analyzePlaystyle(userIdOrIdentity, options = {}) {
    const {
      lookbackDays = 30,
      minInteractions = 10
    } = options;

    try {
      // Get recent interactions
      const result = await this.pool.query(`
        SELECT
          interaction_type,
          classification,
          metadata,
          timestamp
        FROM user_interactions
        WHERE (user_id = $1 OR identity_id = $1)
          AND timestamp > NOW() - INTERVAL '${lookbackDays} days'
        ORDER BY timestamp DESC
      `, [userIdOrIdentity]);

      const interactions = result.rows;

      if (interactions.length < minInteractions) {
        console.log(`[UserPlaystyleTracker] Not enough interactions (${interactions.length}/${minInteractions})`);
        return this._getDefaultPlaystyle();
      }

      // Analyze patterns
      const analysis = {
        questionStyle: this._analyzeQuestionStyle(interactions),
        learningPath: this._analyzeLearningPath(interactions),
        interactionPattern: this._analyzeInteractionPattern(interactions),
        depthPreference: this._analyzeDepthPreference(interactions),
        toolUsage: this._analyzeToolUsage(interactions),
        goals: this._inferGoals(interactions)
      };

      console.log(`[UserPlaystyleTracker] Analyzed ${interactions.length} interactions`);
      return analysis;

    } catch (error) {
      console.error('[UserPlaystyleTracker] Error analyzing playstyle:', error);
      return this._getDefaultPlaystyle();
    }
  }

  /**
   * Classify an interaction
   */
  _classifyInteraction(type, content, metadata) {
    const classification = {
      type,
      features: {}
    };

    if (type === 'question') {
      // Analyze question style
      const text = content.toLowerCase();

      // Directness (direct question vs exploratory)
      classification.features.directness = this._scoreDirectness(text);

      // Technical level
      classification.features.technical = this._scoreTechnical(text);

      // Question type
      if (text.includes('how') || text.includes('tutorial')) {
        classification.features.questionType = 'how_to';
      } else if (text.includes('what') || text.includes('explain')) {
        classification.features.questionType = 'explanation';
      } else if (text.includes('why')) {
        classification.features.questionType = 'conceptual';
      } else if (text.includes('compare') || text.includes('vs')) {
        classification.features.questionType = 'comparison';
      } else {
        classification.features.questionType = 'general';
      }

      // Length (indicates depth)
      classification.features.length = text.length;

    } else if (type === 'action') {
      // Classify action
      classification.features.action = metadata.action || 'unknown';

    } else if (type === 'navigation') {
      // Track navigation patterns
      classification.features.path = metadata.path || 'unknown';

    } else if (type === 'tool_use') {
      // Track tool usage
      classification.features.tool = metadata.tool || 'unknown';
    }

    return classification;
  }

  /**
   * Score how direct a question is (0-1)
   */
  _scoreDirectness(text) {
    let score = 0.5; // Base score

    // Direct indicators
    if (text.match(/^(how|what|where|when|why|which)/)) score += 0.2;
    if (text.includes('step by step')) score += 0.1;
    if (text.includes('specific')) score += 0.1;

    // Exploratory indicators (reduce directness)
    if (text.includes('explore')) score -= 0.2;
    if (text.includes('understand')) score -= 0.1;
    if (text.includes('learn about')) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Score technical level (0-1)
   */
  _scoreTechnical(text) {
    let score = 0.3; // Base score

    // Technical terms
    const technicalTerms = [
      'api', 'database', 'sql', 'function', 'class', 'algorithm',
      'deploy', 'docker', 'kubernetes', 'git', 'terminal', 'cli',
      'async', 'promise', 'callback', 'middleware', 'schema'
    ];

    for (const term of technicalTerms) {
      if (text.includes(term)) score += 0.05;
    }

    // Non-technical indicators
    if (text.includes('beginner')) score -= 0.2;
    if (text.includes('simple')) score -= 0.1;
    if (text.includes('easy way')) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Analyze question style from interactions
   */
  _analyzeQuestionStyle(interactions) {
    const questions = interactions.filter(i => i.interaction_type === 'question');

    if (questions.length === 0) {
      return { directness: 0.5, technical: 0.5 };
    }

    let totalDirectness = 0;
    let totalTechnical = 0;

    for (const q of questions) {
      const features = q.classification.features || {};
      totalDirectness += features.directness || 0.5;
      totalTechnical += features.technical || 0.5;
    }

    return {
      directness: totalDirectness / questions.length,
      technical: totalTechnical / questions.length
    };
  }

  /**
   * Analyze learning path preference
   */
  _analyzeLearningPath(interactions) {
    let tutorialCount = 0;
    let docsCount = 0;
    let trialCount = 0;
    const total = interactions.length;

    for (const interaction of interactions) {
      const text = interaction.content?.toLowerCase() || '';
      const meta = interaction.metadata || {};

      // Tutorial indicators
      if (text.includes('tutorial') || text.includes('step by step') || text.includes('guide')) {
        tutorialCount++;
      }

      // Documentation indicators
      if (text.includes('documentation') || text.includes('reference') || text.includes('docs')) {
        docsCount++;
      }

      // Trial-and-error indicators
      if (text.includes('error') || text.includes('doesn\'t work') || text.includes('debug')) {
        trialCount++;
      }

      // Navigation-based detection
      if (meta.path) {
        if (meta.path.includes('/tutorial')) tutorialCount++;
        if (meta.path.includes('/docs')) docsCount++;
      }
    }

    return {
      tutorial: tutorialCount / total,
      docs: docsCount / total,
      trial: trialCount / total
    };
  }

  /**
   * Analyze interaction pattern (burst vs steady)
   */
  _analyzeInteractionPattern(interactions) {
    if (interactions.length < 2) {
      return { pattern: 'unknown', burstiness: 0.5 };
    }

    // Calculate time gaps between interactions
    const gaps = [];
    for (let i = 1; i < interactions.length; i++) {
      const gap = new Date(interactions[i - 1].timestamp) - new Date(interactions[i].timestamp);
      gaps.push(gap / (1000 * 60)); // Minutes
    }

    // Calculate standard deviation
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - mean, 2), 0) / gaps.length;
    const stdDev = Math.sqrt(variance);

    // High stdDev = bursty, low stdDev = steady
    const burstiness = Math.min(1, stdDev / mean);

    return {
      pattern: burstiness > 0.7 ? 'burst' : burstiness < 0.3 ? 'steady' : 'mixed',
      burstiness,
      avgGapMinutes: mean
    };
  }

  /**
   * Analyze depth preference
   */
  _analyzeDepthPreference(interactions) {
    const questions = interactions.filter(i => i.interaction_type === 'question');

    if (questions.length === 0) return 0.5;

    let depthScore = 0;

    for (const q of questions) {
      const features = q.classification.features || {};

      // Long questions indicate depth
      if (features.length > 100) depthScore += 0.1;

      // Conceptual questions indicate depth
      if (features.questionType === 'conceptual') depthScore += 0.15;
      if (features.questionType === 'comparison') depthScore += 0.1;

      // Keywords indicating depth
      const text = q.content?.toLowerCase() || '';
      if (text.includes('why')) depthScore += 0.05;
      if (text.includes('architecture')) depthScore += 0.1;
      if (text.includes('trade-off')) depthScore += 0.1;
      if (text.includes('deep dive')) depthScore += 0.15;
    }

    return Math.min(1, depthScore / questions.length);
  }

  /**
   * Analyze tool usage patterns
   */
  _analyzeToolUsage(interactions) {
    const toolUses = interactions.filter(i => i.interaction_type === 'tool_use');
    const tools = {};

    for (const use of toolUses) {
      const tool = use.classification.features?.tool || 'unknown';
      tools[tool] = (tools[tool] || 0) + 1;
    }

    // Calculate power user score (variety of tools used)
    const toolCount = Object.keys(tools).length;
    const powerUserScore = Math.min(1, toolCount / 10); // 10+ tools = power user

    return {
      tools,
      powerUserScore,
      mostUsed: Object.entries(tools).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none'
    };
  }

  /**
   * Infer user goals from interactions
   */
  _inferGoals(interactions) {
    const goals = {};

    // Goal patterns
    const goalPatterns = {
      launch_website: ['launch', 'deploy', 'website', 'domain', 'hosting'],
      learn_programming: ['learn', 'tutorial', 'beginner', 'how to code'],
      build_feature: ['implement', 'build', 'create', 'add feature'],
      debug_issue: ['error', 'bug', 'doesn\'t work', 'fix'],
      understand_concept: ['explain', 'what is', 'understand', 'concept']
    };

    for (const interaction of interactions) {
      const text = interaction.content?.toLowerCase() || '';

      for (const [goal, keywords] of Object.entries(goalPatterns)) {
        for (const keyword of keywords) {
          if (text.includes(keyword)) {
            goals[goal] = (goals[goal] || 0) + 1;
          }
        }
      }
    }

    // Convert counts to confidence scores
    const total = interactions.length;
    const inferredGoals = [];

    for (const [goal, count] of Object.entries(goals)) {
      inferredGoals.push({
        goal,
        confidence: count / total,
        evidence: count
      });
    }

    // Sort by confidence
    return inferredGoals.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Update playstyle profile
   */
  async _updatePlaystyleProfile(userIdOrIdentity, classification) {
    try {
      // Get current profile
      const current = await this.getPlaystyleProfile(userIdOrIdentity);

      // Merge with new classification (simple averaging for now)
      const updated = { ...current };

      // Update question style if applicable
      if (classification.features.directness !== undefined) {
        updated.question_style = updated.question_style || {};
        updated.question_style.directness =
          (updated.question_style.directness || 0.5) * 0.9 + classification.features.directness * 0.1;
      }

      if (classification.features.technical !== undefined) {
        updated.question_style = updated.question_style || {};
        updated.question_style.technical =
          (updated.question_style.technical || 0.5) * 0.9 + classification.features.technical * 0.1;
      }

      // Upsert to database
      await this.pool.query(`
        INSERT INTO user_playstyles (
          user_id,
          identity_id,
          question_style,
          updated_at
        ) VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          question_style = $3,
          updated_at = NOW()
      `, [
        userIdOrIdentity,
        userIdOrIdentity,
        JSON.stringify(updated.question_style)
      ]);

    } catch (error) {
      console.error('[UserPlaystyleTracker] Error updating playstyle:', error);
    }
  }

  /**
   * Get default playstyle
   */
  _getDefaultPlaystyle() {
    return {
      question_style: { directness: 0.5, technical: 0.5 },
      learning_path: { tutorial: 0.33, docs: 0.33, trial: 0.33 },
      interaction_pattern: { pattern: 'unknown', burstiness: 0.5 },
      depth_preference: 0.5,
      tool_usage: { powerUserScore: 0.3, tools: {}, mostUsed: 'none' },
      goals: []
    };
  }
}

module.exports = UserPlaystyleTracker;
