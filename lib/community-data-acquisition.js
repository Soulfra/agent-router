/**
 * Community Data Acquisition System
 *
 * "Like Ryan Cohen buying GameStop with 55M PowerUp Rewards members + Game Informer data"
 *
 * Ryan Cohen didn't just buy a store - he acquired:
 * - 55+ million customer database (PowerUp Rewards)
 * - 33 years of editorial/community data (Game Informer)
 * - The craziest organic community (r/WallStreetBets, r/Superstonk)
 * - Customer behavior/preference data
 *
 * CALOS equivalent:
 * - Consolidate scattered user data (learning + marketplace + growth + forum)
 * - Build unified community graph
 * - Track cross-system behavior
 * - Detect power users and community momentum
 * - Let community self-organize (not forced like Microsoft)
 *
 * Key Insight:
 * Microsoft tried to force community through acquisition.
 * Ryan Cohen leveraged existing community + data.
 * CALOS has scattered community assets - consolidate them.
 */

const { Pool } = require('pg');

class CommunityDataAcquisition {
  constructor(config = {}) {
    this.pool = config.pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });

    console.log('[CommunityDataAcquisition] Initialized');
  }

  /**
   * Get unified community profile for a user
   *
   * Consolidates data from:
   * - Learning platform (progress, XP, achievements)
   * - Marketplace (reputation, karma, ideas)
   * - Growth tracker (implementations, forks, iterations)
   * - Forum (posts, comments, votes)
   * - GitHub activity feed
   *
   * Like PowerUp Rewards: single view of customer across all touchpoints
   *
   * @param {string} userId
   * @returns {Object} Unified profile
   */
  async getCommunityProfile(userId) {
    try {
      // Parallel queries for all systems
      const [
        learningData,
        reputationData,
        growthData,
        forumData,
        githubData,
        followerStats
      ] = await Promise.all([
        this._getLearningData(userId),
        this._getReputationData(userId),
        this._getGrowthData(userId),
        this._getForumData(userId),
        this._getGitHubData(userId),
        this._getFollowerStats(userId)
      ]);

      // Calculate composite scores
      const powerScore = this._calculatePowerScore({
        learning: learningData,
        reputation: reputationData,
        growth: growthData,
        forum: forumData
      });

      const communityTier = this._determineCommunityTier(powerScore);

      return {
        userId,
        powerScore,
        communityTier,

        // Learning platform data
        learning: {
          totalXP: learningData.total_xp || 0,
          level: learningData.level || 1,
          pathsCompleted: learningData.paths_completed || 0,
          lessonsCompleted: learningData.lessons_completed || 0,
          currentStreak: learningData.current_streak || 0,
          longestStreak: learningData.longest_streak || 0,
          achievements: learningData.achievements || []
        },

        // Reputation/marketplace data
        reputation: {
          karma: reputationData.karma || 0,
          trustScore: reputationData.trust_score || 0.5,
          badge: reputationData.badge || 'newcomer',
          achievements: reputationData.achievements || []
        },

        // Growth tracker data (what they BUILD)
        growth: {
          ideasImplemented: growthData.implementations || 0,
          ideasForked: growthData.forks || 0,
          ideasIterated: growthData.iterations || 0,
          ideasSubmitted: growthData.submissions || 0,
          totalImpact: growthData.total_impact || 0
        },

        // Forum data
        forum: {
          postsCreated: forumData.posts_created || 0,
          commentsCreated: forumData.comments_created || 0,
          totalUpvotes: forumData.total_upvotes || 0,
          bestPost: forumData.best_post || null
        },

        // GitHub activity
        github: {
          activityCount: githubData.activity_count || 0,
          totalLikes: githubData.total_likes || 0,
          totalComments: githubData.total_comments || 0,
          recentActivity: githubData.recent_activity || []
        },

        // Social graph
        social: {
          followers: followerStats.followers || 0,
          following: followerStats.following || 0,
          influence: followerStats.influence || 0
        },

        // Timestamps
        joinedAt: reputationData.joined_at || learningData.enrolled_at,
        lastActivity: this._getLatestActivity([
          reputationData.last_activity,
          learningData.last_activity,
          forumData.last_activity,
          githubData.last_activity
        ])
      };
    } catch (error) {
      console.error('[CommunityDataAcquisition] Error getting profile:', error);
      throw error;
    }
  }

  /**
   * Get learning platform data
   * @private
   */
  async _getLearningData(userId) {
    const result = await this.pool.query(`
      SELECT
        COALESCE(SUM(total_xp), 0) as total_xp,
        MAX(current_level) as level,
        COUNT(DISTINCT CASE WHEN completion_status = 'completed' THEN path_id END) as paths_completed,
        COALESCE(SUM(total_lessons_completed), 0) as lessons_completed,
        MAX(current_streak) as current_streak,
        MAX(longest_streak) as longest_streak,
        MIN(enrolled_at) as enrolled_at,
        MAX(last_activity_at) as last_activity
      FROM user_progress
      WHERE user_id = $1
    `, [userId]);

    const achievements = await this.pool.query(`
      SELECT achievement_name, unlocked_at
      FROM user_achievements
      WHERE user_id = $1
      ORDER BY unlocked_at DESC
      LIMIT 10
    `, [userId]);

    return {
      ...result.rows[0],
      achievements: achievements.rows
    };
  }

  /**
   * Get reputation/marketplace data
   * @private
   */
  async _getReputationData(userId) {
    const result = await this.pool.query(`
      SELECT
        karma,
        trust_score,
        badge,
        achievements,
        joined_at,
        last_activity
      FROM user_reputation
      WHERE user_id = $1
    `, [userId]);

    return result.rows[0] || {
      karma: 0,
      trust_score: 0.5,
      badge: 'newcomer',
      achievements: [],
      joined_at: new Date(),
      last_activity: new Date()
    };
  }

  /**
   * Get growth tracker data (what they actually BUILD)
   * @private
   */
  async _getGrowthData(userId) {
    const result = await this.pool.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN activity_type = 'implemented' THEN idea_id END) as implementations,
        COUNT(DISTINCT CASE WHEN activity_type = 'forked' THEN idea_id END) as forks,
        COUNT(DISTINCT CASE WHEN activity_type = 'iterated' THEN idea_id END) as iterations,
        COUNT(DISTINCT CASE WHEN activity_type = 'submitted' THEN idea_id END) as submissions,
        COUNT(*) as total_impact
      FROM idea_activities
      WHERE metadata->>'userId' = $1
    `, [userId]);

    return result.rows[0] || {
      implementations: 0,
      forks: 0,
      iterations: 0,
      submissions: 0,
      total_impact: 0
    };
  }

  /**
   * Get forum data
   * @private
   */
  async _getForumData(userId) {
    const result = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM forum_posts WHERE author_id = $1) as posts_created,
        (SELECT COUNT(*) FROM forum_comments WHERE author_id = $1) as comments_created,
        (SELECT COALESCE(SUM(upvotes), 0) FROM forum_posts WHERE author_id = $1) as total_upvotes,
        (SELECT MAX(last_activity_at) FROM forum_posts WHERE author_id = $1) as last_activity
    `, [userId]);

    const bestPost = await this.pool.query(`
      SELECT post_id, title, upvotes
      FROM forum_posts
      WHERE author_id = $1
      ORDER BY upvotes DESC
      LIMIT 1
    `, [userId]);

    return {
      ...result.rows[0],
      best_post: bestPost.rows[0] || null
    };
  }

  /**
   * Get GitHub activity data
   * @private
   */
  async _getGitHubData(userId) {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as activity_count,
        COALESCE(SUM(like_count), 0) as total_likes,
        COALESCE(SUM(comment_count), 0) as total_comments,
        MAX(created_at) as last_activity
      FROM github_activity_feed
      WHERE user_id = $1
    `, [userId]);

    const recentActivity = await this.pool.query(`
      SELECT activity_type, content, created_at
      FROM github_activity_feed
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [userId]);

    return {
      ...result.rows[0],
      recent_activity: recentActivity.rows
    };
  }

  /**
   * Get follower statistics
   * @private
   */
  async _getFollowerStats(userId) {
    const result = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM user_followers WHERE followee_id = $1) as followers,
        (SELECT COUNT(*) FROM user_followers WHERE follower_id = $1) as following
    `, [userId]);

    // Calculate influence score (followers + engagement)
    const influence = Math.floor(
      (result.rows[0].followers * 10) +
      (result.rows[0].following * 1)
    );

    return {
      ...result.rows[0],
      influence
    };
  }

  /**
   * Calculate power score (0-1000)
   *
   * Composite score across all systems
   * Like Ryan Cohen analyzing PowerUp Rewards data to identify best customers
   *
   * @private
   */
  _calculatePowerScore({ learning, reputation, growth, forum }) {
    // Learning contribution (0-250)
    const learningScore = Math.min(
      (learning.total_xp / 100) +
      (learning.paths_completed * 20) +
      (learning.current_streak * 2),
      250
    );

    // Reputation contribution (0-250)
    const reputationScore = Math.min(
      (reputation.karma / 10) +
      (reputation.trust_score * 100) +
      (reputation.achievements.length * 5),
      250
    );

    // Growth contribution (0-300) - HIGHEST WEIGHT (actual building)
    const growthScore = Math.min(
      (growth.implementations * 50) +  // Building is most valuable
      (growth.iterations * 30) +
      (growth.forks * 10) +
      (growth.submissions * 20),
      300
    );

    // Forum contribution (0-200)
    const forumScore = Math.min(
      (forum.posts_created * 10) +
      (forum.comments_created * 2) +
      (forum.total_upvotes * 1),
      200
    );

    return Math.round(learningScore + reputationScore + growthScore + forumScore);
  }

  /**
   * Determine community tier based on power score
   *
   * Like GameStop badges: newcomer → contributor → veteran → legend
   *
   * @private
   */
  _determineCommunityTier(powerScore) {
    if (powerScore >= 800) return 'legend';
    if (powerScore >= 500) return 'veteran';
    if (powerScore >= 200) return 'contributor';
    return 'newcomer';
  }

  /**
   * Get latest activity timestamp
   * @private
   */
  _getLatestActivity(timestamps) {
    const valid = timestamps.filter(t => t).map(t => new Date(t));
    if (valid.length === 0) return new Date();
    return new Date(Math.max(...valid.map(d => d.getTime())));
  }

  /**
   * Get power users (like r/WallStreetBets superfans)
   *
   * Users with high engagement across multiple systems
   *
   * @param {Object} options
   * @returns {Array} Power users
   */
  async getPowerUsers(options = {}) {
    const { limit = 50, minPowerScore = 200 } = options;

    try {
      // Get all community members with activity
      const result = await this.pool.query(`
        SELECT DISTINCT user_id
        FROM (
          SELECT user_id FROM user_progress
          UNION
          SELECT user_id FROM user_reputation
          UNION
          SELECT metadata->>'userId' as user_id FROM idea_activities WHERE metadata->>'userId' IS NOT NULL
        ) all_users
        LIMIT 1000
      `);

      const userIds = result.rows.map(row => row.user_id);

      // Get profiles for all users
      const profiles = await Promise.all(
        userIds.map(userId => this.getCommunityProfile(userId))
      );

      // Filter and sort by power score
      const powerUsers = profiles
        .filter(p => p.powerScore >= minPowerScore)
        .sort((a, b) => b.powerScore - a.powerScore)
        .slice(0, limit);

      return powerUsers;
    } catch (error) {
      console.error('[CommunityDataAcquisition] Error getting power users:', error);
      throw error;
    }
  }

  /**
   * Detect community cohorts (user segments with shared behavior)
   *
   * Like GameStop segmenting PowerUp members:
   * - "Hardcore gamers" (frequent buyers)
   * - "Moms buying for kids" (holiday buyers)
   * - "Deal hunters" (sales only)
   *
   * CALOS cohorts:
   * - Learners (high learning, low building)
   * - Builders (high implementations)
   * - Community leaders (high forum + followers)
   * - Lurkers (low activity)
   *
   * @returns {Array} Cohorts
   */
  async detectCohorts() {
    try {
      const powerUsers = await this.getPowerUsers({ limit: 200, minPowerScore: 0 });

      const cohorts = {
        learners: [],
        builders: [],
        leaders: [],
        lurkers: [],
        balanced: []
      };

      powerUsers.forEach(user => {
        const { learning, growth, social, forum, powerScore } = user;

        // Builders: High implementations
        if (growth.ideasImplemented >= 3 || growth.totalImpact >= 10) {
          cohorts.builders.push(user);
        }
        // Leaders: High social engagement
        else if (social.followers >= 10 || forum.postsCreated >= 5) {
          cohorts.leaders.push(user);
        }
        // Learners: High learning, low building
        else if (learning.pathsCompleted >= 2 && growth.totalImpact < 3) {
          cohorts.learners.push(user);
        }
        // Lurkers: Low activity across board
        else if (powerScore < 50) {
          cohorts.lurkers.push(user);
        }
        // Balanced: Active across multiple systems
        else {
          cohorts.balanced.push(user);
        }
      });

      return {
        cohorts,
        summary: {
          builders: cohorts.builders.length,
          leaders: cohorts.leaders.length,
          learners: cohorts.learners.length,
          lurkers: cohorts.lurkers.length,
          balanced: cohorts.balanced.length,
          total: powerUsers.length
        }
      };
    } catch (error) {
      console.error('[CommunityDataAcquisition] Error detecting cohorts:', error);
      throw error;
    }
  }

  /**
   * Track community momentum (like idea growth tracker, but for user segments)
   *
   * Detect when a cohort is "taking off" (inflection point)
   *
   * @param {string} cohortName
   * @returns {Object} Momentum metrics
   */
  async trackCohortMomentum(cohortName) {
    try {
      // Get cohort activity over time
      const result = await this.pool.query(`
        WITH cohort_activity AS (
          SELECT
            DATE_TRUNC('day', created_at) as day,
            COUNT(*) as activity_count
          FROM (
            -- Learning activities
            SELECT last_activity_at as created_at FROM user_progress WHERE last_activity_at > NOW() - INTERVAL '30 days'
            UNION ALL
            -- Growth activities
            SELECT timestamp as created_at FROM idea_activities WHERE timestamp > NOW() - INTERVAL '30 days'
            UNION ALL
            -- Forum activities
            SELECT created_at FROM forum_posts WHERE created_at > NOW() - INTERVAL '30 days'
          ) all_activity
          GROUP BY day
          ORDER BY day ASC
        )
        SELECT
          day,
          activity_count,
          LAG(activity_count, 1) OVER (ORDER BY day) as prev_count,
          LAG(activity_count, 7) OVER (ORDER BY day) as week_ago_count
        FROM cohort_activity
      `);

      if (result.rows.length < 2) {
        return {
          velocity: 0,
          acceleration: 0,
          momentum: 0,
          stage: 'DORMANT'
        };
      }

      // Calculate velocity (growth rate)
      const recent = result.rows.slice(-7); // Last 7 days
      const velocities = recent.map((row, i) => {
        if (i === 0 || !row.prev_count) return 0;
        return row.activity_count - row.prev_count;
      });

      const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;

      // Calculate acceleration (rate of change)
      const acceleration = velocities.length >= 2
        ? (velocities[velocities.length - 1] - velocities[0]) / velocities.length
        : 0;

      // Momentum (velocity * scale)
      const momentum = avgVelocity * recent.length;

      // Stage classification
      let stage;
      if (avgVelocity > 5 && acceleration > 1) {
        stage = 'ACCELERATING';
      } else if (avgVelocity > 2) {
        stage = 'GROWING';
      } else if (avgVelocity < -2) {
        stage = 'DECLINING';
      } else {
        stage = 'STABLE';
      }

      return {
        cohortName,
        velocity: avgVelocity,
        acceleration,
        momentum,
        stage,
        dataPoints: recent.length,
        period: '30 days'
      };
    } catch (error) {
      console.error('[CommunityDataAcquisition] Error tracking momentum:', error);
      throw error;
    }
  }

  /**
   * Consolidate external community data
   *
   * Like Ryan Cohen acquiring Game Informer's 33 years of data
   *
   * Import from:
   * - Discord communities
   * - GitHub contributors
   * - Twitter/X followers
   * - Slack workspaces
   * - Open source projects
   *
   * @param {string} source - Source identifier
   * @param {Array} users - User data to import
   * @returns {Object} Import results
   */
  async consolidateExternalCommunity(source, users) {
    try {
      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const user of users) {
        const { userId, username, email, metadata = {} } = user;

        // Check if user exists
        const existing = await this.pool.query(`
          SELECT user_id FROM user_reputation WHERE user_id = $1
        `, [userId]);

        if (existing.rows.length > 0) {
          // Update existing user metadata
          await this.pool.query(`
            UPDATE user_reputation
            SET reputation_breakdown = reputation_breakdown || $1,
                last_activity = NOW()
            WHERE user_id = $2
          `, [
            JSON.stringify({ [source]: metadata }),
            userId
          ]);

          updated++;
        } else {
          // Create new user
          await this.pool.query(`
            INSERT INTO user_reputation (
              user_id,
              karma,
              trust_score,
              badge,
              reputation_breakdown,
              joined_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
          `, [
            userId,
            metadata.initialKarma || 0,
            0.5,
            'newcomer',
            JSON.stringify({ [source]: metadata })
          ]);

          imported++;
        }

        // Track import in idea_index (reuse table for community sources)
        await this.pool.query(`
          INSERT INTO idea_index (
            idea_id,
            source,
            source_id,
            title,
            category,
            tags,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (idea_id) DO UPDATE SET
            last_synced_at = NOW()
        `, [
          `community_${source}_${userId}`,
          `community_${source}`,
          userId,
          username || userId,
          'community_member',
          [source]
        ]);
      }

      return {
        source,
        imported,
        updated,
        skipped,
        total: users.length
      };
    } catch (error) {
      console.error('[CommunityDataAcquisition] Error consolidating community:', error);
      throw error;
    }
  }

  /**
   * Get community statistics
   *
   * Like PowerUp Rewards dashboard: total members, engagement, growth
   *
   * @returns {Object} Stats
   */
  async getCommunityStats() {
    try {
      const stats = await this.pool.query(`
        SELECT
          (SELECT COUNT(DISTINCT user_id) FROM user_reputation) as total_members,
          (SELECT COUNT(DISTINCT user_id) FROM user_progress) as learners,
          (SELECT COUNT(DISTINCT metadata->>'userId') FROM idea_activities) as builders,
          (SELECT COUNT(DISTINCT author_id) FROM forum_posts) as forum_participants,
          (SELECT COUNT(*) FROM user_followers) as total_connections,
          (SELECT COALESCE(SUM(karma), 0) FROM user_reputation) as total_karma,
          (SELECT COUNT(*) FROM user_reputation WHERE last_activity > NOW() - INTERVAL '7 days') as active_last_week,
          (SELECT COUNT(*) FROM user_reputation WHERE last_activity > NOW() - INTERVAL '30 days') as active_last_month
      `);

      const tierDistribution = await this.pool.query(`
        SELECT badge, COUNT(*) as count
        FROM user_reputation
        GROUP BY badge
      `);

      return {
        ...stats.rows[0],
        tierDistribution: tierDistribution.rows.reduce((acc, row) => {
          acc[row.badge] = parseInt(row.count);
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('[CommunityDataAcquisition] Error getting stats:', error);
      throw error;
    }
  }
}

module.exports = CommunityDataAcquisition;
