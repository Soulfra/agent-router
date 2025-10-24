/**
 * Collaboration Matcher (ReflectionArena / LearnToReflect Integration)
 *
 * Auto-pairs users with similar interests, skills, and learning paths.
 * Integrates with the collaborative hint system from the learning platform.
 *
 * Features:
 * - Match users by learning path similarity
 * - Match by hint contribution patterns
 * - Match by skill complementarity (learner + expert)
 * - Match by timezone/availability
 * - Create collaboration rooms (like WoW guilds)
 * - Send introduction messages via mailbox system
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class CollaborationMatcher extends EventEmitter {
  constructor({ db, mailboxSystem = null, learningEngine = null }) {
    super();

    this.db = db;
    this.mailboxSystem = mailboxSystem;
    this.learningEngine = learningEngine;

    // Active matches
    this.matches = new Map();

    // Match queue
    this.matchQueue = [];

    // Collaboration rooms
    this.rooms = new Map();

    // Matching weights
    this.weights = {
      learningPathSimilarity: 0.3,
      hintCompatibility: 0.2,
      skillComplementarity: 0.3,
      timezoneMatch: 0.1,
      activityPatternMatch: 0.1
    };

    console.log('[CollaborationMatcher] Initialized');
  }

  /**
   * Find collaborators for a user
   *
   * Returns top N potential matches ranked by compatibility score
   */
  async findCollaborators(userId, { limit = 10, minScore = 0.5 } = {}) {
    try {
      // Get user profile
      const userProfile = await this.getUserProfile(userId);

      // Get all potential matches
      const candidates = await this.getCandidates(userId);

      // Calculate match scores
      const scored = [];
      for (const candidate of candidates) {
        const score = await this.calculateMatchScore(userProfile, candidate);

        if (score >= minScore) {
          scored.push({
            userId: candidate.userId,
            profile: candidate,
            score,
            breakdown: {
              pathSimilarity: score.pathSimilarity,
              hintCompatibility: score.hintCompatibility,
              skillComplementarity: score.skillComplementarity,
              timezoneMatch: score.timezoneMatch,
              activityMatch: score.activityMatch
            }
          });
        }
      }

      // Sort by score (highest first)
      scored.sort((a, b) => b.score.total - a.score.total);

      console.log(`[CollaborationMatcher] Found ${scored.length} potential matches for user ${userId}`);

      return scored.slice(0, limit);
    } catch (error) {
      console.error('[CollaborationMatcher] Error finding collaborators:', error);
      throw error;
    }
  }

  /**
   * Get user profile for matching
   */
  async getUserProfile(userId) {
    const profile = {
      userId,
      learningPaths: [],
      completedLessons: [],
      hintsGiven: [],
      hintsReceived: [],
      skills: [],
      interests: [],
      timezone: null,
      activityPattern: {}
    };

    if (!this.db) return profile;

    // Get learning paths
    const pathsResult = await this.db.query(
      `SELECT up.*, lp.path_slug, lp.path_name
       FROM user_progress up
       JOIN learning_paths lp ON up.path_id = lp.path_id
       WHERE up.user_id = $1`,
      [userId]
    );
    profile.learningPaths = pathsResult.rows;

    // Get completed lessons
    const lessonsResult = await this.db.query(
      `SELECT lc.*, l.lesson_title
       FROM lesson_completions lc
       JOIN lessons l ON lc.lesson_id = l.lesson_id
       WHERE lc.user_id = $1`,
      [userId]
    );
    profile.completedLessons = lessonsResult.rows;

    // Get hints given (contribution pattern)
    const hintsResult = await this.db.query(
      `SELECT * FROM collaborative_hints
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );
    profile.hintsGiven = hintsResult.rows;

    // Get timezone from user data (if available)
    const userResult = await this.db.query(
      `SELECT timezone FROM users WHERE user_id = $1`,
      [userId]
    );
    if (userResult.rows.length > 0) {
      profile.timezone = userResult.rows[0].timezone;
    }

    return profile;
  }

  /**
   * Get candidates for matching
   */
  async getCandidates(userId) {
    const candidates = [];

    if (!this.db) return candidates;

    // Get active users with similar learning paths
    const result = await this.db.query(
      `SELECT DISTINCT up.user_id
       FROM user_progress up
       WHERE up.user_id != $1
         AND up.last_activity > NOW() - INTERVAL '30 days'
       LIMIT 100`,
      [userId]
    );

    for (const row of result.rows) {
      const profile = await this.getUserProfile(row.user_id);
      candidates.push(profile);
    }

    return candidates;
  }

  /**
   * Calculate match score between two users
   */
  async calculateMatchScore(user1, user2) {
    const scores = {
      pathSimilarity: 0,
      hintCompatibility: 0,
      skillComplementarity: 0,
      timezoneMatch: 0,
      activityMatch: 0
    };

    // 1. Learning path similarity
    scores.pathSimilarity = this.calculatePathSimilarity(
      user1.learningPaths,
      user2.learningPaths
    );

    // 2. Hint compatibility (both helpful contributors = good match)
    scores.hintCompatibility = this.calculateHintCompatibility(
      user1.hintsGiven,
      user2.hintsGiven
    );

    // 3. Skill complementarity (learner + expert = good match)
    scores.skillComplementarity = this.calculateSkillComplementarity(
      user1.completedLessons,
      user2.completedLessons
    );

    // 4. Timezone match
    scores.timezoneMatch = this.calculateTimezoneMatch(
      user1.timezone,
      user2.timezone
    );

    // 5. Activity pattern match
    scores.activityMatch = this.calculateActivityPatternMatch(
      user1.activityPattern,
      user2.activityPattern
    );

    // Calculate weighted total
    scores.total =
      scores.pathSimilarity * this.weights.learningPathSimilarity +
      scores.hintCompatibility * this.weights.hintCompatibility +
      scores.skillComplementarity * this.weights.skillComplementarity +
      scores.timezoneMatch * this.weights.timezoneMatch +
      scores.activityMatch * this.weights.activityPatternMatch;

    return scores;
  }

  /**
   * Calculate learning path similarity
   */
  calculatePathSimilarity(paths1, paths2) {
    if (paths1.length === 0 || paths2.length === 0) return 0;

    const set1 = new Set(paths1.map(p => p.path_slug));
    const set2 = new Set(paths2.map(p => p.path_slug));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    // Jaccard similarity
    return intersection.size / union.size;
  }

  /**
   * Calculate hint compatibility
   */
  calculateHintCompatibility(hints1, hints2) {
    // Users who both leave helpful hints are likely good collaborators
    const helpfulnessScore1 = this.calculateHelpfulnessScore(hints1);
    const helpfulnessScore2 = this.calculateHelpfulnessScore(hints2);

    // Both should be above threshold (0.3)
    if (helpfulnessScore1 > 0.3 && helpfulnessScore2 > 0.3) {
      return (helpfulnessScore1 + helpfulnessScore2) / 2;
    }

    return 0;
  }

  /**
   * Calculate helpfulness score from hints
   */
  calculateHelpfulnessScore(hints) {
    if (hints.length === 0) return 0;

    let totalUpvotes = 0;
    let totalDownvotes = 0;

    for (const hint of hints) {
      totalUpvotes += hint.upvotes || 0;
      totalDownvotes += hint.downvotes || 0;
    }

    const total = totalUpvotes + totalDownvotes;
    if (total === 0) return 0;

    return totalUpvotes / total;
  }

  /**
   * Calculate skill complementarity
   */
  calculateSkillComplementarity(lessons1, lessons2) {
    // Perfect match: one user is further along than the other (mentor/mentee)
    const count1 = lessons1.length;
    const count2 = lessons2.length;

    if (count1 === 0 && count2 === 0) return 0;

    // Ideal ratio: 2:1 or 1:2 (mentor has 2x more lessons)
    const ratio = Math.max(count1, count2) / Math.max(1, Math.min(count1, count2));

    if (ratio >= 1.5 && ratio <= 3) {
      return 1.0; // Strong complementarity
    } else if (ratio < 1.5) {
      return 0.5; // Similar skill level
    } else {
      return 0.3; // Too much gap
    }
  }

  /**
   * Calculate timezone match
   */
  calculateTimezoneMatch(tz1, tz2) {
    if (!tz1 || !tz2) return 0.5; // Neutral if unknown

    // Parse timezone offset
    const offset1 = this.parseTimezoneOffset(tz1);
    const offset2 = this.parseTimezoneOffset(tz2);

    const diff = Math.abs(offset1 - offset2);

    // Perfect match: same timezone or ±1 hour
    if (diff <= 1) return 1.0;
    if (diff <= 3) return 0.7;
    if (diff <= 6) return 0.4;
    return 0.1;
  }

  /**
   * Parse timezone offset (simplified)
   */
  parseTimezoneOffset(tz) {
    // Extract UTC offset (e.g., "America/New_York" → -5)
    // Simplified implementation
    const offsets = {
      'America/New_York': -5,
      'America/Los_Angeles': -8,
      'Europe/London': 0,
      'Europe/Paris': 1,
      'Asia/Tokyo': 9,
      'UTC': 0
    };

    return offsets[tz] || 0;
  }

  /**
   * Calculate activity pattern match
   */
  calculateActivityPatternMatch(pattern1, pattern2) {
    // Placeholder: match users who are active at similar times
    return 0.5;
  }

  /**
   * Create a collaboration match
   */
  async createMatch({ user1Id, user2Id, score, metadata = {} }) {
    const matchId = crypto.randomUUID();

    const match = {
      matchId,
      user1Id,
      user2Id,
      score,
      status: 'pending', // pending, accepted, declined
      createdAt: new Date(),
      metadata
    };

    this.matches.set(matchId, match);

    // Store in database
    if (this.db) {
      await this.db.query(
        `INSERT INTO collaboration_matches (
          match_id, user1_id, user2_id, score, status, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
        [matchId, user1Id, user2Id, score, 'pending', JSON.stringify(metadata)]
      );
    }

    // Send introduction via mailbox system
    if (this.mailboxSystem) {
      await this.sendIntroductionMessages(match);
    }

    console.log(`[CollaborationMatcher] Created match: ${user1Id} ↔ ${user2Id} (score: ${score.toFixed(2)})`);

    // Emit event
    this.emit('match_created', match);

    return match;
  }

  /**
   * Send introduction messages via mailbox
   */
  async sendIntroductionMessages(match) {
    const user1Profile = await this.getUserProfile(match.user1Id);
    const user2Profile = await this.getUserProfile(match.user2Id);

    // Message to user1 about user2
    await this.mailboxSystem.sendMail({
      fromUserId: 'system',
      toUserId: match.user1Id,
      subject: '🤝 New Collaboration Match!',
      body: `You've been matched with a fellow learner!\n\n` +
            `They're working on: ${user2Profile.learningPaths.map(p => p.path_name).join(', ')}\n\n` +
            `Match score: ${(match.score * 100).toFixed(0)}%\n\n` +
            `Send them a message to start collaborating!`,
      messageType: 'system',
      metadata: {
        matchId: match.matchId,
        partnerId: match.user2Id,
        type: 'collaboration_match'
      }
    });

    // Message to user2 about user1
    await this.mailboxSystem.sendMail({
      fromUserId: 'system',
      toUserId: match.user2Id,
      subject: '🤝 New Collaboration Match!',
      body: `You've been matched with a fellow learner!\n\n` +
            `They're working on: ${user1Profile.learningPaths.map(p => p.path_name).join(', ')}\n\n` +
            `Match score: ${(match.score * 100).toFixed(0)}%\n\n` +
            `Send them a message to start collaborating!`,
      messageType: 'system',
      metadata: {
        matchId: match.matchId,
        partnerId: match.user1Id,
        type: 'collaboration_match'
      }
    });

    console.log(`[CollaborationMatcher] Sent introduction messages for match ${match.matchId}`);
  }

  /**
   * Accept a match
   */
  async acceptMatch(matchId, userId) {
    const match = this.matches.get(matchId);
    if (!match) {
      throw new Error(`Match not found: ${matchId}`);
    }

    if (match.user1Id !== userId && match.user2Id !== userId) {
      throw new Error('User not part of this match');
    }

    match.status = 'accepted';

    if (this.db) {
      await this.db.query(
        `UPDATE collaboration_matches
         SET status = 'accepted', accepted_at = NOW()
         WHERE match_id = $1`,
        [matchId]
      );
    }

    // Create collaboration room
    const room = await this.createCollaborationRoom({
      matchId,
      members: [match.user1Id, match.user2Id]
    });

    console.log(`[CollaborationMatcher] Match accepted: ${matchId}`);

    this.emit('match_accepted', { matchId, roomId: room.roomId });

    return { match, room };
  }

  /**
   * Create collaboration room (like WoW guild)
   */
  async createCollaborationRoom({ matchId, members = [], metadata = {} }) {
    const roomId = crypto.randomUUID();

    const room = {
      roomId,
      matchId,
      members,
      createdAt: new Date(),
      metadata
    };

    this.rooms.set(roomId, room);

    if (this.db) {
      await this.db.query(
        `INSERT INTO collaboration_rooms (
          room_id, match_id, members, created_at, metadata
        ) VALUES ($1, $2, $3, NOW(), $4)`,
        [roomId, matchId, members, JSON.stringify(metadata)]
      );
    }

    console.log(`[CollaborationMatcher] Created collaboration room: ${roomId}`);

    return room;
  }

  /**
   * Get user's matches
   */
  async getUserMatches(userId) {
    if (this.db) {
      const result = await this.db.query(
        `SELECT * FROM collaboration_matches
         WHERE (user1_id = $1 OR user2_id = $1)
         ORDER BY created_at DESC`,
        [userId]
      );

      return result.rows;
    }

    // Fallback to in-memory
    const matches = [];
    for (const match of this.matches.values()) {
      if (match.user1Id === userId || match.user2Id === userId) {
        matches.push(match);
      }
    }

    return matches;
  }

  /**
   * Run auto-matching batch job
   *
   * Finds matches for all active users
   */
  async runAutoMatchingBatch({ minScore = 0.6, matchesPerUser = 3 } = {}) {
    console.log('[CollaborationMatcher] Running auto-matching batch...');

    const result = await this.db.query(
      `SELECT DISTINCT user_id
       FROM user_progress
       WHERE last_activity > NOW() - INTERVAL '7 days'`
    );

    const users = result.rows.map(r => r.user_id);
    let totalMatches = 0;

    for (const userId of users) {
      try {
        const matches = await this.findCollaborators(userId, { limit: matchesPerUser, minScore });

        for (const match of matches) {
          // Check if match already exists
          const existing = await this.db.query(
            `SELECT * FROM collaboration_matches
             WHERE ((user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1))
               AND status != 'declined'`,
            [userId, match.userId]
          );

          if (existing.rows.length === 0) {
            await this.createMatch({
              user1Id: userId,
              user2Id: match.userId,
              score: match.score.total,
              metadata: match.breakdown
            });
            totalMatches++;
          }
        }
      } catch (error) {
        console.error(`[CollaborationMatcher] Error matching user ${userId}:`, error);
      }
    }

    console.log(`[CollaborationMatcher] Batch complete: created ${totalMatches} matches for ${users.length} users`);

    return {
      usersProcessed: users.length,
      matchesCreated: totalMatches
    };
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      activeMatches: this.matches.size,
      collaborationRooms: this.rooms.size
    };
  }
}

module.exports = CollaborationMatcher;
