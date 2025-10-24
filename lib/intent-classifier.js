/**
 * Intent Classifier
 *
 * Infers what users are trying to achieve from their actions and interactions.
 * Like understanding "user stories" but automatically from behavior.
 *
 * Intent Categories:
 * - launch_website: Deploy first site
 * - learn_programming: Master a language/framework
 * - build_feature: Implement specific functionality
 * - debug_issue: Fix errors/bugs
 * - understand_concept: Learn theory
 * - setup_environment: Configure tools/stack
 * - explore_options: Research/compare solutions
 *
 * Uses:
 * - Personalize recommendations
 * - Predict next actions
 * - Provide proactive help
 * - Track goal completion
 */

const { Pool } = require('pg');

class IntentClassifier {
  constructor(config = {}) {
    this.pool = new Pool({
      connectionString: config.databaseUrl || process.env.DATABASE_URL
    });

    // Intent patterns (keywords → intent mapping)
    this.intentPatterns = {
      launch_website: {
        keywords: ['launch', 'deploy', 'website', 'domain', 'hosting', 'go live', 'publish site'],
        actions: ['domain_register', 'deploy', 'dns_setup', 'ssl_setup'],
        tools: ['vercel', 'netlify', 'github-pages', 'cloudflare'],
        weight: 1.0
      },
      learn_programming: {
        keywords: ['learn', 'tutorial', 'beginner', 'how to code', 'getting started', 'fundamentals'],
        actions: ['tutorial_view', 'docs_read', 'example_run'],
        tools: ['repl', 'playground', 'tutorial-site'],
        weight: 0.9
      },
      build_feature: {
        keywords: ['implement', 'build', 'create', 'add feature', 'develop', 'code'],
        actions: ['file_create', 'code_write', 'test_run', 'commit'],
        tools: ['vscode', 'git', 'npm', 'docker'],
        weight: 1.0
      },
      debug_issue: {
        keywords: ['error', 'bug', 'doesn\'t work', 'fix', 'broken', 'issue', 'problem'],
        actions: ['error_search', 'log_view', 'debug_run'],
        tools: ['debugger', 'console', 'inspector'],
        weight: 0.8
      },
      understand_concept: {
        keywords: ['explain', 'what is', 'understand', 'concept', 'theory', 'why'],
        actions: ['docs_read', 'article_read', 'video_watch'],
        tools: ['documentation', 'blog', 'youtube'],
        weight: 0.7
      },
      setup_environment: {
        keywords: ['setup', 'install', 'configure', 'environment', 'tools', 'stack'],
        actions: ['package_install', 'config_edit', 'env_setup'],
        tools: ['npm', 'docker', 'homebrew', 'apt'],
        weight: 0.9
      },
      explore_options: {
        keywords: ['compare', 'vs', 'alternative', 'which', 'best', 'should i'],
        actions: ['search', 'research', 'compare_view'],
        tools: ['google', 'stackoverflow', 'reddit'],
        weight: 0.6
      }
    };

    console.log('[IntentClassifier] Initialized');
  }

  /**
   * Classify intent from user interaction
   */
  classifyIntent(data) {
    const {
      interactionType,
      content,
      metadata = {}
    } = data;

    const scores = {};

    // Score each intent
    for (const [intent, pattern] of Object.entries(this.intentPatterns)) {
      let score = 0;

      // Check keywords in content
      if (content) {
        const text = content.toLowerCase();
        for (const keyword of pattern.keywords) {
          if (text.includes(keyword)) {
            score += pattern.weight * 0.4; // 40% weight for keywords
          }
        }
      }

      // Check actions
      if (metadata.action) {
        if (pattern.actions.includes(metadata.action)) {
          score += pattern.weight * 0.3; // 30% weight for actions
        }
      }

      // Check tools
      if (metadata.tool) {
        if (pattern.tools.includes(metadata.tool)) {
          score += pattern.weight * 0.3; // 30% weight for tools
        }
      }

      scores[intent] = score;
    }

    // Get top intents
    const ranked = Object.entries(scores)
      .map(([intent, score]) => ({ intent, score, confidence: Math.min(1, score) }))
      .filter(i => i.score > 0)
      .sort((a, b) => b.score - a.score);

    return ranked;
  }

  /**
   * Infer user goals from recent interactions
   */
  async inferGoals(userIdOrIdentity, options = {}) {
    const {
      lookbackDays = 7,
      minConfidence = 0.3
    } = options;

    try {
      // Get recent interactions
      const result = await this.pool.query(`
        SELECT
          interaction_type,
          content,
          metadata,
          timestamp
        FROM user_interactions
        WHERE (user_id = $1 OR identity_id = $1)
          AND timestamp > NOW() - INTERVAL '${lookbackDays} days'
        ORDER BY timestamp DESC
      `, [userIdOrIdentity]);

      const interactions = result.rows;

      if (interactions.length === 0) {
        return [];
      }

      // Aggregate intent scores across all interactions
      const intentScores = {};

      for (const interaction of interactions) {
        const intents = this.classifyIntent({
          interactionType: interaction.interaction_type,
          content: interaction.content,
          metadata: interaction.metadata || {}
        });

        for (const { intent, score } of intents) {
          intentScores[intent] = (intentScores[intent] || 0) + score;
        }
      }

      // Normalize scores
      const total = Object.values(intentScores).reduce((a, b) => a + b, 0);

      const goals = Object.entries(intentScores)
        .map(([intent, score]) => ({
          goal: intent,
          confidence: score / total,
          rawScore: score,
          evidence: interactions.length
        }))
        .filter(g => g.confidence >= minConfidence)
        .sort((a, b) => b.confidence - a.confidence);

      // Store inferred goals
      await this._storeInferredGoals(userIdOrIdentity, goals);

      return goals;

    } catch (error) {
      console.error('[IntentClassifier] Error inferring goals:', error);
      return [];
    }
  }

  /**
   * Get user's active goals
   */
  async getActiveGoals(userIdOrIdentity) {
    try {
      const result = await this.pool.query(`
        SELECT *
        FROM user_goals
        WHERE (user_id = $1 OR identity_id = $1)
          AND status = 'active'
        ORDER BY confidence DESC
      `, [userIdOrIdentity]);

      return result.rows;

    } catch (error) {
      console.error('[IntentClassifier] Error getting active goals:', error);
      return [];
    }
  }

  /**
   * Mark goal as completed
   */
  async completeGoal(userIdOrIdentity, goal) {
    try {
      await this.pool.query(`
        UPDATE user_goals
        SET
          status = 'completed',
          completed_at = NOW()
        WHERE (user_id = $1 OR identity_id = $1)
          AND goal = $2
      `, [userIdOrIdentity, goal]);

      console.log(`[IntentClassifier] Goal completed: ${goal}`);

    } catch (error) {
      console.error('[IntentClassifier] Error completing goal:', error);
    }
  }

  /**
   * Get goal completion rate
   */
  async getGoalCompletionStats(userIdOrIdentity) {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'abandoned') as abandoned,
          COUNT(*) as total
        FROM user_goals
        WHERE user_id = $1 OR identity_id = $1
      `, [userIdOrIdentity]);

      const stats = result.rows[0];

      return {
        completed: parseInt(stats.completed),
        active: parseInt(stats.active),
        abandoned: parseInt(stats.abandoned),
        total: parseInt(stats.total),
        completion_rate: stats.total > 0 ? parseInt(stats.completed) / parseInt(stats.total) : 0
      };

    } catch (error) {
      console.error('[IntentClassifier] Error getting completion stats:', error);
      return { completed: 0, active: 0, abandoned: 0, total: 0, completion_rate: 0 };
    }
  }

  /**
   * Get next action recommendation based on goal
   */
  getNextActionForGoal(goal) {
    const recommendations = {
      launch_website: [
        { action: 'register_domain', description: 'Register a domain name', priority: 1 },
        { action: 'setup_hosting', description: 'Set up hosting (Vercel/Netlify)', priority: 2 },
        { action: 'create_repo', description: 'Create GitHub repository', priority: 3 },
        { action: 'first_deploy', description: 'Deploy your site', priority: 4 },
        { action: 'configure_dns', description: 'Configure DNS', priority: 5 }
      ],
      learn_programming: [
        { action: 'choose_language', description: 'Choose a programming language', priority: 1 },
        { action: 'setup_environment', description: 'Set up development environment', priority: 2 },
        { action: 'hello_world', description: 'Write your first program', priority: 3 },
        { action: 'learn_basics', description: 'Learn basic syntax', priority: 4 },
        { action: 'build_project', description: 'Build a small project', priority: 5 }
      ],
      build_feature: [
        { action: 'plan_architecture', description: 'Plan the feature architecture', priority: 1 },
        { action: 'write_tests', description: 'Write tests first (TDD)', priority: 2 },
        { action: 'implement_feature', description: 'Implement the feature', priority: 3 },
        { action: 'test_feature', description: 'Test the feature', priority: 4 },
        { action: 'deploy_feature', description: 'Deploy to production', priority: 5 }
      ],
      debug_issue: [
        { action: 'reproduce_bug', description: 'Reproduce the bug', priority: 1 },
        { action: 'check_logs', description: 'Check error logs', priority: 2 },
        { action: 'isolate_cause', description: 'Isolate the cause', priority: 3 },
        { action: 'apply_fix', description: 'Apply the fix', priority: 4 },
        { action: 'verify_fix', description: 'Verify it\'s fixed', priority: 5 }
      ],
      understand_concept: [
        { action: 'read_docs', description: 'Read official documentation', priority: 1 },
        { action: 'watch_tutorial', description: 'Watch tutorial videos', priority: 2 },
        { action: 'try_examples', description: 'Try code examples', priority: 3 },
        { action: 'build_demo', description: 'Build a small demo', priority: 4 },
        { action: 'explain_others', description: 'Explain to others (best learning!)', priority: 5 }
      ],
      setup_environment: [
        { action: 'install_tools', description: 'Install necessary tools', priority: 1 },
        { action: 'configure_editor', description: 'Configure code editor', priority: 2 },
        { action: 'setup_version_control', description: 'Set up Git', priority: 3 },
        { action: 'install_dependencies', description: 'Install project dependencies', priority: 4 },
        { action: 'verify_setup', description: 'Verify everything works', priority: 5 }
      ],
      explore_options: [
        { action: 'list_requirements', description: 'List your requirements', priority: 1 },
        { action: 'research_options', description: 'Research available options', priority: 2 },
        { action: 'compare_features', description: 'Compare features/pricing', priority: 3 },
        { action: 'try_demos', description: 'Try demos/trials', priority: 4 },
        { action: 'make_decision', description: 'Make your choice', priority: 5 }
      ]
    };

    return recommendations[goal] || [];
  }

  /**
   * Store inferred goals
   */
  async _storeInferredGoals(userIdOrIdentity, goals) {
    try {
      for (const goal of goals) {
        await this.pool.query(`
          INSERT INTO user_goals (
            user_id,
            identity_id,
            goal,
            confidence,
            evidence,
            status,
            inferred_at
          ) VALUES ($1, $2, $3, $4, $5, 'active', NOW())
          ON CONFLICT (user_id, goal)
          DO UPDATE SET
            confidence = $4,
            evidence = $5,
            inferred_at = NOW()
        `, [
          userIdOrIdentity,
          userIdOrIdentity,
          goal.goal,
          goal.confidence,
          goal.evidence
        ]);
      }

    } catch (error) {
      console.error('[IntentClassifier] Error storing goals:', error);
    }
  }
}

module.exports = IntentClassifier;
