/**
 * Cal Student Launcher
 *
 * Specifically tracks Cal (first student) launching their first website from scratch.
 * Like a personalized onboarding journey tracker.
 *
 * Milestones:
 * 1. Create GitHub account
 * 2. Create first repository
 * 3. Create README.md
 * 4. Make first commit
 * 5. Create first Gist
 * 6. Use lazygit
 * 7. Register domain
 * 8. Deploy first site
 * 9. Make first PR
 * 10. Launch live!
 *
 * Tracks:
 * - Progress through journey
 * - Time spent on each milestone
 * - Blockers/stuck points
 * - Question patterns
 * - Tools used
 */

const UnifiedUserProfile = require('./unified-user-profile');
const UserTreeCounter = require('./user-tree-counter');

class CalStudentLauncher {
  constructor(config = {}) {
    this.profile = new UnifiedUserProfile(config);
    this.treeCounter = new UserTreeCounter(config);

    // Cal's journey tree
    this.journeyTree = {
      id: 'cal-first-website',
      name: 'Cal\'s First Website Launch',
      milestones: [
        {
          id: 'github-signup',
          name: 'Create GitHub Account',
          description: 'Sign up for GitHub',
          order: 1,
          required: true,
          estimatedTime: '5 minutes'
        },
        {
          id: 'first-repo',
          name: 'Create First Repository',
          description: 'Create your first GitHub repository',
          order: 2,
          required: true,
          estimatedTime: '10 minutes',
          tutorial: '/tutorials/github-repo'
        },
        {
          id: 'readme-created',
          name: 'Write README.md',
          description: 'Create a README for your project',
          order: 3,
          required: true,
          estimatedTime: '15 minutes',
          tutorial: '/tutorials/writing-readme'
        },
        {
          id: 'first-commit',
          name: 'Make First Commit',
          description: 'Commit your first code changes',
          order: 4,
          required: true,
          estimatedTime: '10 minutes',
          tutorial: '/tutorials/git-commit'
        },
        {
          id: 'first-gist',
          name: 'Create First Gist',
          description: 'Share a code snippet as a Gist',
          order: 5,
          required: false,
          estimatedTime: '5 minutes',
          tutorial: '/tutorials/github-gist'
        },
        {
          id: 'lazygit-setup',
          name: 'Set Up Lazygit',
          description: 'Install and configure lazygit',
          order: 6,
          required: false,
          estimatedTime: '15 minutes',
          tutorial: '/tutorials/lazygit'
        },
        {
          id: 'domain-registered',
          name: 'Register Domain',
          description: 'Register your custom domain name',
          order: 7,
          required: true,
          estimatedTime: '20 minutes',
          tutorial: '/tutorials/domain-registration'
        },
        {
          id: 'first-deploy',
          name: 'Deploy First Site',
          description: 'Deploy your site to the web',
          order: 8,
          required: true,
          estimatedTime: '30 minutes',
          tutorial: '/tutorials/deploy-vercel'
        },
        {
          id: 'first-pr',
          name: 'Create First Pull Request',
          description: 'Submit your first PR',
          order: 9,
          required: false,
          estimatedTime: '20 minutes',
          tutorial: '/tutorials/pull-requests'
        },
        {
          id: 'launch-live',
          name: 'Launch Live!',
          description: 'Your site is live on the internet!',
          order: 10,
          required: true,
          estimatedTime: '5 minutes',
          celebration: true
        }
      ]
    };

    console.log('[CalStudentLauncher] Initialized');
  }

  /**
   * Get Cal's current progress
   */
  async getProgress(userId = 'cal') {
    try {
      // Get tree progress
      const progress = await this.treeCounter.getTreeProgress(userId, this.journeyTree.id);

      // Get completed milestones
      const completed = await this._getCompletedMilestones(userId);

      // Get current milestone
      const currentMilestone = this._getCurrentMilestone(completed);

      // Calculate stats
      const stats = {
        completedCount: completed.length,
        totalCount: this.journeyTree.milestones.length,
        completionRate: completed.length / this.journeyTree.milestones.length,
        currentMilestone: currentMilestone?.name || 'Not started',
        nextMilestone: this._getNextMilestone(completed)?.name || 'All done!',
        estimatedTimeRemaining: this._getEstimatedTimeRemaining(completed)
      };

      return {
        journey: this.journeyTree,
        progress,
        completed,
        stats,
        celebration: completed.some(m => m.celebration)
      };

    } catch (error) {
      console.error('[CalStudentLauncher] Error getting progress:', error);
      throw error;
    }
  }

  /**
   * Record milestone completion
   */
  async completeMilestone(userId = 'cal', milestoneId, metadata = {}) {
    try {
      const milestone = this.journeyTree.milestones.find(m => m.id === milestoneId);

      if (!milestone) {
        throw new Error(`Unknown milestone: ${milestoneId}`);
      }

      // Mark in tree counter
      await this.treeCounter.completeNode({
        userId,
        treeId: this.journeyTree.id,
        nodeId: milestoneId,
        metadata: {
          ...metadata,
          milestoneName: milestone.name,
          completedAt: new Date().toISOString()
        }
      });

      console.log(`[CalStudentLauncher] 🎉 Milestone completed: ${milestone.name}`);

      // Check if journey is complete
      const progress = await this.getProgress(userId);

      if (progress.stats.completionRate === 1.0) {
        console.log('[CalStudentLauncher] 🚀 JOURNEY COMPLETE! Cal launched their first website!');
        await this._celebrateCompletion(userId);
      }

      return {
        success: true,
        milestone,
        progress: progress.stats
      };

    } catch (error) {
      console.error('[CalStudentLauncher] Error completing milestone:', error);
      throw error;
    }
  }

  /**
   * Track Cal asking a question
   */
  async trackQuestion(userId = 'cal', question, metadata = {}) {
    try {
      // Record in unified profile
      await this.profile.trackInteraction({
        userId,
        interactionType: 'question',
        content: question,
        metadata: {
          ...metadata,
          treeId: this.journeyTree.id,
          source: 'cal-launcher'
        }
      });

      // Detect if question relates to a milestone
      const relatedMilestone = this._detectRelatedMilestone(question);

      if (relatedMilestone) {
        // Visit the milestone node
        await this.treeCounter.visitNode({
          userId,
          treeId: this.journeyTree.id,
          nodeId: relatedMilestone.id,
          metadata: {
            question,
            relatedTo: relatedMilestone.name
          }
        });

        return {
          relatedMilestone,
          suggestion: `This might help: ${relatedMilestone.tutorial || 'No tutorial available yet'}`
        };
      }

      return { relatedMilestone: null };

    } catch (error) {
      console.error('[CalStudentLauncher] Error tracking question:', error);
      throw error;
    }
  }

  /**
   * Get personalized help for Cal
   */
  async getPersonalizedHelp(userId = 'cal') {
    try {
      const progress = await this.getProgress(userId);
      const profile = await this.profile.getCompleteProfile(userId);

      const help = {
        currentMilestone: progress.stats.currentMilestone,
        nextSteps: [],
        blockers: [],
        recommendations: []
      };

      // Get current milestone
      const current = this._getCurrentMilestone(progress.completed);

      if (current) {
        help.nextSteps.push({
          action: `Complete: ${current.name}`,
          description: current.description,
          tutorial: current.tutorial,
          estimatedTime: current.estimatedTime
        });
      }

      // Check for blockers (visited but not completed)
      const blockers = await this._detectBlockers(userId);

      help.blockers = blockers.map(b => ({
        milestone: b.name,
        stuck_for: b.stuckDuration,
        suggestion: `Need help with ${b.name}? Try: ${b.tutorial}`
      }));

      // Personalized recommendations based on playstyle
      if (profile.playstyle.learning_path?.tutorial > 0.5) {
        help.recommendations.push('You seem to prefer tutorials. Check out our step-by-step guides!');
      }

      if (profile.playstyle.question_style?.directness < 0.4) {
        help.recommendations.push('Feel free to explore! We have interactive demos too.');
      }

      return help;

    } catch (error) {
      console.error('[CalStudentLauncher] Error getting help:', error);
      return null;
    }
  }

  /**
   * Get completed milestones
   */
  async _getCompletedMilestones(userId) {
    try {
      const result = await this.treeCounter.pool.query(`
        SELECT node_id, completed_at, metadata
        FROM tree_node_completions
        WHERE user_id = $1 AND tree_id = $2
        ORDER BY completed_at ASC
      `, [userId, this.journeyTree.id]);

      return result.rows.map(row => {
        const milestone = this.journeyTree.milestones.find(m => m.id === row.node_id);
        return {
          ...milestone,
          completedAt: row.completed_at,
          metadata: row.metadata
        };
      });

    } catch (error) {
      console.error('[CalStudentLauncher] Error getting completed milestones:', error);
      return [];
    }
  }

  /**
   * Get current milestone (first incomplete required)
   */
  _getCurrentMilestone(completed) {
    const completedIds = completed.map(m => m.id);

    for (const milestone of this.journeyTree.milestones) {
      if (milestone.required && !completedIds.includes(milestone.id)) {
        return milestone;
      }
    }

    return null; // All done!
  }

  /**
   * Get next milestone
   */
  _getNextMilestone(completed) {
    const current = this._getCurrentMilestone(completed);

    if (!current) return null;

    const currentIndex = this.journeyTree.milestones.findIndex(m => m.id === current.id);

    return this.journeyTree.milestones[currentIndex + 1] || null;
  }

  /**
   * Get estimated time remaining
   */
  _getEstimatedTimeRemaining(completed) {
    const completedIds = completed.map(m => m.id);
    let totalMinutes = 0;

    for (const milestone of this.journeyTree.milestones) {
      if (!completedIds.includes(milestone.id)) {
        const time = milestone.estimatedTime;
        if (time) {
          const minutes = parseInt(time.match(/\d+/)[0]);
          totalMinutes += minutes;
        }
      }
    }

    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      return `${hours}h ${mins}m`;
    }
  }

  /**
   * Detect related milestone from question
   */
  _detectRelatedMilestone(question) {
    const q = question.toLowerCase();

    for (const milestone of this.journeyTree.milestones) {
      const keywords = milestone.name.toLowerCase().split(' ');

      for (const keyword of keywords) {
        if (keyword.length > 3 && q.includes(keyword)) {
          return milestone;
        }
      }

      // Check description
      if (q.includes(milestone.id.replace(/-/g, ' '))) {
        return milestone;
      }
    }

    return null;
  }

  /**
   * Detect blockers (visited but not completed for >2 days)
   */
  async _detectBlockers(userId) {
    try {
      const result = await this.treeCounter.pool.query(`
        SELECT DISTINCT ON (v.node_id)
          v.node_id,
          v.timestamp as visited_at,
          c.completed_at
        FROM tree_node_visits v
        LEFT JOIN tree_node_completions c
          ON v.user_id = c.user_id
          AND v.tree_id = c.tree_id
          AND v.node_id = c.node_id
        WHERE v.user_id = $1
          AND v.tree_id = $2
          AND c.completed_at IS NULL
          AND v.timestamp < NOW() - INTERVAL '2 days'
        ORDER BY v.node_id, v.timestamp DESC
      `, [userId, this.journeyTree.id]);

      return result.rows.map(row => {
        const milestone = this.journeyTree.milestones.find(m => m.id === row.node_id);
        const stuckDuration = Date.now() - new Date(row.visited_at).getTime();
        const days = Math.floor(stuckDuration / (1000 * 60 * 60 * 24));

        return {
          ...milestone,
          visitedAt: row.visited_at,
          stuckDuration: `${days} days`
        };
      });

    } catch (error) {
      console.error('[CalStudentLauncher] Error detecting blockers:', error);
      return [];
    }
  }

  /**
   * Celebrate journey completion
   */
  async _celebrateCompletion(userId) {
    console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   🎉 CONGRATULATIONS CAL! 🎉                          ║
║                                                        ║
║   You just launched your first website!               ║
║                                                        ║
║   Journey: Cal's First Website Launch                 ║
║   Status: COMPLETE ✅                                  ║
║                                                        ║
║   You are now a web developer! 🚀                      ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
    `);

    // TODO: Send celebration email, badge, achievement, etc.
  }
}

module.exports = CalStudentLauncher;
