/**
 * Unified User Profile
 *
 * Brings together ALL user data into a single comprehensive profile:
 * - Identity (from Identity Resolver)
 * - Analytics (from Session Analytics)
 * - Playstyle (from Playstyle Tracker)
 * - Progress (from Tree Counter)
 * - Goals (from Intent Classifier)
 * - Cal AI interactions (from Cal Orchestrator)
 *
 * Provides single source of truth for user data.
 */

const IdentityResolver = require('./identity-resolver');
const SessionAnalytics = require('./session-analytics');
const UserPlaystyleTracker = require('./user-playstyle-tracker');
const UserTreeCounter = require('./user-tree-counter');
const IntentClassifier = require('./intent-classifier');

class UnifiedUserProfile {
  constructor(config = {}) {
    this.config = config;

    // Initialize components
    this.identityResolver = new IdentityResolver(config);
    this.analytics = new SessionAnalytics(config);
    this.playstyleTracker = new UserPlaystyleTracker(config);
    this.treeCounter = new UserTreeCounter(config);
    this.intentClassifier = new IntentClassifier(config);

    console.log('[UnifiedUserProfile] Initialized');
  }

  /**
   * Get complete user profile
   */
  async getCompleteProfile(userIdOrIdentity) {
    try {
      console.log(`[UnifiedUserProfile] Building profile for ${userIdOrIdentity}`);

      // Get all data in parallel
      const [
        identity,
        playstyle,
        treeProgress,
        goals,
        analytics,
        goalStats
      ] = await Promise.all([
        this.identityResolver.findIdentityByFragments({ user_id: userIdOrIdentity }),
        this.playstyleTracker.getPlaystyleProfile(userIdOrIdentity),
        this.treeCounter.getAllProgress(userIdOrIdentity),
        this.intentClassifier.getActiveGoals(userIdOrIdentity),
        this._getAnalyticsSummary(userIdOrIdentity),
        this.intentClassifier.getGoalCompletionStats(userIdOrIdentity)
      ]);

      // Build unified profile
      const profile = {
        // Identity
        identityId: identity?.identity_id || userIdOrIdentity,
        userId: identity?.user_id || null,
        vanityHandle: identity?.vanity_handle || null,

        // Touchpoints
        touchpoints: {
          cookieId: identity?.cookie_id || null,
          deviceFingerprint: identity?.device_fingerprint || null,
          email: identity?.email || null,
          ipAddress: identity?.ip_address || null,
          platform: identity?.platform || null
        },

        // Analytics
        analytics: analytics || {
          pageViews: 0,
          sessions: 0,
          lastSeen: null,
          totalTime: 0
        },

        // Playstyle
        playstyle: playstyle || this.playstyleTracker._getDefaultPlaystyle(),

        // Tree Progress
        treeProgress: treeProgress || [],

        // Goals
        goals: {
          active: goals || [],
          stats: goalStats
        },

        // Timestamps
        createdAt: identity?.first_seen || new Date(),
        lastSeen: identity?.last_seen || new Date(),
        updatedAt: new Date()
      };

      return profile;

    } catch (error) {
      console.error('[UnifiedUserProfile] Error building profile:', error);
      throw error;
    }
  }

  /**
   * Get user segment/persona
   */
  async getUserSegment(userIdOrIdentity) {
    const profile = await this.getCompleteProfile(userIdOrIdentity);

    // Classify user into segment based on playstyle + goals + progress
    const segment = {
      type: 'unknown',
      confidence: 0,
      characteristics: []
    };

    const playstyle = profile.playstyle;
    const goals = profile.goals.active;

    // Power User: High tech score, lots of tool usage, deep diver
    if (playstyle.question_style?.technical > 0.7 &&
        playstyle.tool_usage?.powerUserScore > 0.7 &&
        playstyle.depth_preference > 0.7) {
      segment.type = 'power_user';
      segment.confidence = 0.9;
      segment.characteristics.push('technical', 'tool_savvy', 'deep_diver');
    }

    // Beginner: Low tech score, tutorial learner, needs guidance
    else if (playstyle.question_style?.technical < 0.4 &&
             playstyle.learning_path?.tutorial > 0.5) {
      segment.type = 'beginner';
      segment.confidence = 0.8;
      segment.characteristics.push('learning', 'tutorial_follower', 'needs_guidance');
    }

    // Builder: Active goals, progressing through trees, action-oriented
    else if (goals.length > 0 &&
             profile.treeProgress.length > 0 &&
             playstyle.question_style?.directness > 0.6) {
      segment.type = 'builder';
      segment.confidence = 0.85;
      segment.characteristics.push('action_oriented', 'project_focused', 'goal_driven');
    }

    // Explorer: Low directness, researching, comparing options
    else if (playstyle.question_style?.directness < 0.4 &&
             goals.some(g => g.goal === 'explore_options')) {
      segment.type = 'explorer';
      segment.confidence = 0.75;
      segment.characteristics.push('curious', 'researcher', 'options_explorer');
    }

    // Debugger: Lots of debug intents, trial-and-error learner
    else if (goals.some(g => g.goal === 'debug_issue') &&
             playstyle.learning_path?.trial > 0.5) {
      segment.type = 'debugger';
      segment.confidence = 0.8;
      segment.characteristics.push('problem_solver', 'trial_and_error', 'persistent');
    }

    return segment;
  }

  /**
   * Get personalized recommendations
   */
  async getRecommendations(userIdOrIdentity) {
    const profile = await this.getCompleteProfile(userIdOrIdentity);
    const segment = await this.getUserSegment(userIdOrIdentity);

    const recommendations = {
      nextSteps: [],
      content: [],
      tools: []
    };

    // Recommend next steps based on active goals
    for (const goal of profile.goals.active) {
      const actions = this.intentClassifier.getNextActionForGoal(goal.goal);

      // Get first incomplete action
      const nextAction = actions.find(a => !this._isActionCompleted(profile, a.action));

      if (nextAction) {
        recommendations.nextSteps.push({
          goal: goal.goal,
          action: nextAction.action,
          description: nextAction.description,
          priority: nextAction.priority,
          confidence: goal.confidence
        });
      }
    }

    // Recommend content based on segment
    if (segment.type === 'beginner') {
      recommendations.content.push(
        { type: 'tutorial', title: 'Getting Started Guide', reason: 'Perfect for beginners' },
        { type: 'video', title: 'Introduction to Web Development', reason: 'Visual learning' }
      );
    } else if (segment.type === 'power_user') {
      recommendations.content.push(
        { type: 'docs', title: 'Advanced API Reference', reason: 'Technical depth' },
        { type: 'article', title: 'Architecture Patterns', reason: 'Deep-dive content' }
      );
    } else if (segment.type === 'builder') {
      recommendations.content.push(
        { type: 'quickstart', title: 'Quick Start Guide', reason: 'Action-oriented' },
        { type: 'template', title: 'Project Templates', reason: 'Get building fast' }
      );
    }

    // Recommend tools based on goals
    for (const goal of profile.goals.active) {
      if (goal.goal === 'launch_website') {
        recommendations.tools.push(
          { tool: 'vercel', reason: 'Easy deployment' },
          { tool: 'github', reason: 'Version control' }
        );
      } else if (goal.goal === 'build_feature') {
        recommendations.tools.push(
          { tool: 'vscode', reason: 'Best code editor' },
          { tool: 'git', reason: 'Track changes' }
        );
      }
    }

    return recommendations;
  }

  /**
   * Get analytics summary
   */
  async _getAnalyticsSummary(userIdOrIdentity) {
    try {
      const result = await this.analytics.pool.query(`
        SELECT
          COUNT(DISTINCT session_id) as sessions,
          COUNT(*) as page_views,
          MAX(timestamp) as last_seen,
          MIN(timestamp) as first_seen
        FROM analytics_page_views
        WHERE user_id = $1
      `, [userIdOrIdentity]);

      const data = result.rows[0];

      return {
        pageViews: parseInt(data.page_views) || 0,
        sessions: parseInt(data.sessions) || 0,
        lastSeen: data.last_seen,
        firstSeen: data.first_seen
      };

    } catch (error) {
      console.error('[UnifiedUserProfile] Error getting analytics:', error);
      return null;
    }
  }

  /**
   * Check if action is completed (simple check)
   */
  _isActionCompleted(profile, action) {
    // Check tree progress for matching node
    for (const tree of profile.treeProgress) {
      if (tree.last_node === action) {
        return true;
      }
    }

    return false;
  }

  /**
   * Track user interaction (updates all systems)
   */
  async trackInteraction(data) {
    const {
      userId,
      identityId,
      interactionType,
      content,
      metadata = {}
    } = data;

    try {
      // Record in playstyle tracker
      await this.playstyleTracker.recordInteraction({
        userId,
        identityId,
        interactionType,
        content,
        metadata
      });

      // If it's a tree node visit, record in tree counter
      if (metadata.treeId && metadata.nodeId) {
        await this.treeCounter.visitNode({
          userId,
          identityId,
          treeId: metadata.treeId,
          nodeId: metadata.nodeId,
          metadata
        });
      }

      // Classify intent and update goals
      const intents = this.intentClassifier.classifyIntent({
        interactionType,
        content,
        metadata
      });

      console.log(`[UnifiedUserProfile] Tracked interaction for ${userId || identityId}`);

      return { success: true, intents };

    } catch (error) {
      console.error('[UnifiedUserProfile] Error tracking interaction:', error);
      throw error;
    }
  }
}

module.exports = UnifiedUserProfile;
