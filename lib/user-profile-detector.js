/**
 * User Profile / ICP Detector
 *
 * Automatically detects user profile/ICP segment based on:
 * - Prompt patterns and keywords
 * - Domain usage preferences
 * - Session behavior
 * - Subscription tier
 * - Explicit profile selection
 *
 * Segments:
 * - Developer: Code-heavy, technical queries
 * - Content Creator: Creative, marketing content
 * - Executive: Summarization, high-level analysis
 * - Data Analyst: CSV, data processing, ETL
 * - Technical Writer: Documentation, guides
 * - Student: Educational, learning-focused
 * - Researcher: Deep analysis, reasoning
 * - Casual: General chat, simple queries
 */

class UserProfileDetector {
  constructor(options = {}) {
    this.db = options.db;
    this.minConfidence = options.minConfidence || 0.6;

    // Profile definitions with detection patterns
    this.profiles = {
      developer: {
        name: 'Developer',
        description: 'Software engineers, programmers, DevOps',
        keywords: [
          'code', 'function', 'class', 'debug', 'error', 'api', 'endpoint',
          'database', 'query', 'git', 'commit', 'deploy', 'test', 'bug',
          'refactor', 'algorithm', 'compile', 'variable', 'syntax', 'npm',
          'docker', 'kubernetes', 'ci/cd', 'typescript', 'python', 'rust'
        ],
        domains: ['code', 'cryptography', 'data'],
        avgSessionLength: 45, // minutes
        typicalPromptLength: 200,
        usesCodeBlocks: true
      },

      content_creator: {
        name: 'Content Creator',
        description: 'Marketers, writers, designers, social media',
        keywords: [
          'blog', 'post', 'article', 'marketing', 'seo', 'content', 'copy',
          'headline', 'brand', 'audience', 'engagement', 'social media',
          'campaign', 'email', 'newsletter', 'creative', 'design', 'video',
          'caption', 'hashtag', 'story', 'viral', 'trend', 'influencer'
        ],
        domains: ['creative', 'publishing', 'whimsical'],
        avgSessionLength: 30,
        typicalPromptLength: 150,
        usesCodeBlocks: false
      },

      executive: {
        name: 'Executive/Manager',
        description: 'Business leaders, managers, decision-makers',
        keywords: [
          'summary', 'summarize', 'key points', 'insights', 'analysis',
          'strategy', 'roi', 'metrics', 'kpi', 'quarterly', 'revenue',
          'growth', 'market', 'competitive', 'risk', 'forecast', 'budget',
          'stakeholder', 'board', 'executive', 'decision', 'roadmap'
        ],
        domains: ['reasoning', 'publishing'],
        avgSessionLength: 15,
        typicalPromptLength: 100,
        usesCodeBlocks: false
      },

      data_analyst: {
        name: 'Data Analyst',
        description: 'Data scientists, analysts, BI professionals',
        keywords: [
          'csv', 'data', 'dataset', 'analyze', 'pandas', 'dataframe',
          'visualization', 'chart', 'graph', 'statistics', 'correlation',
          'regression', 'sql', 'query', 'aggregate', 'pivot', 'join',
          'etl', 'pipeline', 'transform', 'clean', 'normalize', 'schema'
        ],
        domains: ['data', 'reasoning'],
        avgSessionLength: 40,
        typicalPromptLength: 180,
        usesCodeBlocks: true
      },

      technical_writer: {
        name: 'Technical Writer',
        description: 'Documentation specialists, technical communicators',
        keywords: [
          'document', 'documentation', 'readme', 'guide', 'tutorial',
          'instructions', 'manual', 'api docs', 'reference', 'explanation',
          'how-to', 'step-by-step', 'walkthrough', 'example', 'diagram',
          'specification', 'architecture', 'overview', 'getting started'
        ],
        domains: ['publishing', 'code'],
        avgSessionLength: 35,
        typicalPromptLength: 160,
        usesCodeBlocks: true
      },

      student: {
        name: 'Student/Learner',
        description: 'Students, learners, educators',
        keywords: [
          'learn', 'explain', 'understand', 'homework', 'assignment',
          'study', 'course', 'lesson', 'tutorial', 'beginner', 'help',
          'what is', 'how does', 'why does', 'example', 'practice',
          'quiz', 'test', 'exam', 'definition', 'concept', 'basics'
        ],
        domains: ['reasoning', 'whimsical', 'publishing'],
        avgSessionLength: 25,
        typicalPromptLength: 120,
        usesCodeBlocks: false
      },

      researcher: {
        name: 'Researcher',
        description: 'Academic researchers, scientists, analysts',
        keywords: [
          'research', 'study', 'paper', 'literature', 'methodology',
          'hypothesis', 'experiment', 'analysis', 'findings', 'results',
          'conclusion', 'evidence', 'data', 'statistical', 'peer-review',
          'journal', 'publication', 'theory', 'framework', 'model',
          'validate', 'investigate', 'explore', 'examine', 'evaluate'
        ],
        domains: ['reasoning', 'data', 'publishing'],
        avgSessionLength: 50,
        typicalPromptLength: 250,
        usesCodeBlocks: false
      },

      casual: {
        name: 'Casual User',
        description: 'General users, casual inquiries, simple tasks',
        keywords: [
          'hi', 'hello', 'thanks', 'help', 'question', 'simple', 'quick',
          'idea', 'opinion', 'think', 'tell me', 'show me', 'find',
          'search', 'recommend', 'suggest', 'compare', 'difference'
        ],
        domains: ['simple', 'fact', 'creative'],
        avgSessionLength: 10,
        typicalPromptLength: 80,
        usesCodeBlocks: false
      }
    };

    console.log('[UserProfileDetector] Initialized with 8 profile types');
  }

  /**
   * Detect user profile from prompt and history
   *
   * @param {object} context - Detection context
   * @param {string} context.prompt - Current prompt
   * @param {integer} context.userId - User ID
   * @param {string} context.taskType - Detected task type
   * @param {object} context.history - User history (optional)
   * @returns {Promise<object>} - { profile, confidence, reasons }
   */
  async detectProfile(context) {
    const { prompt, userId, taskType, history } = context;

    // If user has explicit profile set, use that
    if (userId && this.db) {
      const explicitProfile = await this._getExplicitProfile(userId);
      if (explicitProfile) {
        return {
          profile: explicitProfile,
          confidence: 1.0,
          source: 'explicit',
          reasons: ['User selected this profile']
        };
      }
    }

    // Calculate scores for each profile
    const scores = {};
    const reasons = {};

    for (const [profileId, profile] of Object.entries(this.profiles)) {
      const score = this._calculateProfileScore(profile, context);
      scores[profileId] = score.score;
      reasons[profileId] = score.reasons;
    }

    // Find best match
    const sorted = Object.entries(scores)
      .sort((a, b) => b[1] - a[1]);

    const [bestProfileId, bestScore] = sorted[0];

    // Calculate confidence (relative to second-best)
    const [, secondBestScore] = sorted[1] || [null, 0];
    const confidence = this._calculateConfidence(bestScore, secondBestScore);

    // If confidence too low, default to casual
    if (confidence < this.minConfidence) {
      return {
        profile: 'casual',
        confidence: 0.5,
        source: 'default',
        reasons: ['Insufficient signals for confident detection']
      };
    }

    // Save detected profile if user is known
    if (userId && this.db) {
      await this._saveDetectedProfile(userId, bestProfileId, confidence);
    }

    return {
      profile: bestProfileId,
      confidence,
      source: 'detected',
      reasons: reasons[bestProfileId]
    };
  }

  /**
   * Calculate profile score based on context
   * @private
   */
  _calculateProfileScore(profile, context) {
    const { prompt, taskType, history } = context;
    const reasons = [];
    let score = 0;

    const promptLower = prompt.toLowerCase();

    // 1. Keyword matching (40% weight)
    let keywordMatches = 0;
    for (const keyword of profile.keywords) {
      if (promptLower.includes(keyword.toLowerCase())) {
        keywordMatches++;
      }
    }
    const keywordScore = Math.min(keywordMatches / 3, 1.0) * 40;
    score += keywordScore;

    if (keywordMatches > 0) {
      reasons.push(`Matched ${keywordMatches} profile keywords`);
    }

    // 2. Domain preference (30% weight)
    if (taskType && profile.domains.includes(taskType)) {
      score += 30;
      reasons.push(`Uses ${taskType} domain frequently`);
    }

    // 3. Prompt length (15% weight)
    const lengthDiff = Math.abs(prompt.length - profile.typicalPromptLength);
    const lengthScore = Math.max(0, 1 - (lengthDiff / profile.typicalPromptLength)) * 15;
    score += lengthScore;

    // 4. Code block usage (15% weight)
    const hasCodeBlocks = prompt.includes('```') || /\bfunction\b|\bconst\b|\blet\b|\bdef\b|\bclass\b/.test(prompt);
    if (hasCodeBlocks === profile.usesCodeBlocks) {
      score += 15;
      if (hasCodeBlocks) {
        reasons.push('Contains code patterns');
      }
    }

    // 5. History bonus (if available)
    if (history) {
      if (history.dominantDomains) {
        const overlap = history.dominantDomains.filter(d => profile.domains.includes(d));
        if (overlap.length > 0) {
          score += 10;
          reasons.push(`History matches ${overlap.length} preferred domains`);
        }
      }

      if (history.avgSessionLength) {
        const sessionDiff = Math.abs(history.avgSessionLength - profile.avgSessionLength);
        if (sessionDiff < 10) {
          score += 5;
          reasons.push('Session length matches profile');
        }
      }
    }

    return { score, reasons };
  }

  /**
   * Calculate confidence based on score gap
   * @private
   */
  _calculateConfidence(bestScore, secondBestScore) {
    if (secondBestScore === 0) return 1.0;

    const gap = bestScore - secondBestScore;
    const confidence = Math.min(1.0, gap / 30); // 30-point gap = 100% confidence

    return Math.max(0.3, confidence); // Minimum 30% confidence
  }

  /**
   * Get user's explicit profile selection
   * @private
   */
  async _getExplicitProfile(userId) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(
        `SELECT selected_profile
         FROM user_profiles
         WHERE user_id = $1
           AND selected_profile IS NOT NULL`,
        [userId]
      );

      if (result.rows.length > 0) {
        return result.rows[0].selected_profile;
      }

      return null;
    } catch (error) {
      console.error('[ProfileDetector] Error getting explicit profile:', error.message);
      return null;
    }
  }

  /**
   * Save detected profile to database
   * @private
   */
  async _saveDetectedProfile(userId, profileId, confidence) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO user_profiles (user_id, detected_profile, confidence, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           detected_profile = $2,
           confidence = $3,
           profile_history = COALESCE(user_profiles.profile_history, '[]'::jsonb) ||
             jsonb_build_object('profile', $2, 'confidence', $3, 'timestamp', NOW()),
           updated_at = NOW()`,
        [userId, profileId, confidence]
      );

      console.log(`[ProfileDetector] Saved profile ${profileId} (${(confidence * 100).toFixed(0)}%) for user ${userId}`);
    } catch (error) {
      console.error('[ProfileDetector] Error saving profile:', error.message);
    }
  }

  /**
   * Get user history for profile detection
   */
  async getUserHistory(userId) {
    if (!this.db || !userId) return null;

    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) as total_requests,
          AVG(EXTRACT(EPOCH FROM (last_request - first_request))/60) as avg_session_length,
          array_agg(DISTINCT use_case_category) FILTER (WHERE use_case_category IS NOT NULL) as dominant_domains
         FROM (
           SELECT
             user_id,
             use_case_category,
             MIN(timestamp) as first_request,
             MAX(timestamp) as last_request
           FROM model_usage_log
           WHERE user_id = $1
             AND timestamp > NOW() - INTERVAL '30 days'
           GROUP BY user_id, use_case_category
         ) history
         WHERE user_id = $1
         GROUP BY user_id`,
        [userId]
      );

      if (result.rows.length === 0) return null;

      return {
        totalRequests: result.rows[0].total_requests,
        avgSessionLength: result.rows[0].avg_session_length,
        dominantDomains: result.rows[0].dominant_domains || []
      };
    } catch (error) {
      console.error('[ProfileDetector] Error getting user history:', error.message);
      return null;
    }
  }

  /**
   * Set user's explicit profile
   */
  async setUserProfile(userId, profileId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    if (!this.profiles[profileId]) {
      throw new Error(`Invalid profile: ${profileId}`);
    }

    try {
      await this.db.query(
        `INSERT INTO user_profiles (user_id, selected_profile, confidence, updated_at)
         VALUES ($1, $2, 1.0, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           selected_profile = $2,
           confidence = 1.0,
           updated_at = NOW()`,
        [userId, profileId]
      );

      console.log(`[ProfileDetector] User ${userId} set profile to ${profileId}`);
      return true;
    } catch (error) {
      console.error('[ProfileDetector] Error setting profile:', error.message);
      throw error;
    }
  }

  /**
   * Get all profile definitions
   */
  getProfiles() {
    return Object.entries(this.profiles).map(([id, profile]) => ({
      id,
      name: profile.name,
      description: profile.description,
      domains: profile.domains
    }));
  }

  /**
   * Get profile characteristics
   */
  getProfileCharacteristics(profileId) {
    return this.profiles[profileId] || null;
  }

  /**
   * Analyze profile distribution across user base
   */
  async getProfileDistribution() {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(
        `SELECT
          COALESCE(selected_profile, detected_profile) as profile,
          COUNT(*) as user_count,
          AVG(confidence) as avg_confidence
         FROM user_profiles
         WHERE COALESCE(selected_profile, detected_profile) IS NOT NULL
         GROUP BY COALESCE(selected_profile, detected_profile)
         ORDER BY user_count DESC`
      );

      return result.rows.map(row => ({
        profile: row.profile,
        userCount: parseInt(row.user_count),
        avgConfidence: parseFloat(row.avg_confidence)
      }));
    } catch (error) {
      console.error('[ProfileDetector] Error getting distribution:', error.message);
      throw error;
    }
  }
}

module.exports = UserProfileDetector;
