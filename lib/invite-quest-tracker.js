/**
 * Invite Quest Tracker
 *
 * Bridges the affiliate-tracker.js system with the quest engine.
 * Tracks invites as quest progress and creates viral growth mechanics.
 *
 * Features:
 * - Track invite trees (who invited whom)
 * - Quest progress for invite-based quests
 * - Viral growth metrics
 * - Invite circle visualization
 * - Sphere-based invite targeting (college, company, interest groups)
 *
 * Integrates with:
 * - affiliate-tracker.js (referral codes, conversions)
 * - quest-engine.js (quest progress tracking)
 * - database/migrations/063_family_tree_and_spheres.sql (spheres for targeting)
 *
 * Usage:
 *   const tracker = new InviteQuestTracker({ db, questEngine, affiliateTracker });
 *   await tracker.trackInvite(userId, invitedEmail, sphereType);
 *   await tracker.trackInviteAccepted(userId, invitedUserId);
 *   const tree = await tracker.getInviteTree(userId);
 *   const circles = await tracker.getSuggestedCircles(userId);
 */

const { EventEmitter } = require('events');

class InviteQuestTracker extends EventEmitter {
  constructor(config = {}) {
    super();

    this.db = config.db;
    this.questEngine = config.questEngine;
    this.affiliateTracker = config.affiliateTracker;
    this.enabled = config.enabled !== false;

    if (!this.db) {
      throw new Error('[InviteQuestTracker] Database required');
    }

    console.log('[InviteQuestTracker] Initialized');
  }

  /**
   * Track invite sent
   */
  async trackInvite(userId, invitedEmail, options = {}) {
    if (!this.enabled) return null;

    console.log(`[InviteQuestTracker] Tracking invite: ${userId} → ${invitedEmail}`);

    try {
      // Create invite record
      const result = await this.db.query(`
        INSERT INTO invite_tracking (
          inviter_user_id,
          invited_email,
          referral_code,
          sphere_type,
          sphere_value,
          metadata,
          status,
          invited_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
        RETURNING invite_id
      `, [
        userId,
        invitedEmail,
        options.referralCode || null,
        options.sphereType || null,
        options.sphereValue || null,
        JSON.stringify(options.metadata || {})
      ]);

      const inviteId = result.rows[0].invite_id;

      // Emit event
      this.emit('invite:sent', {
        userId,
        invitedEmail,
        inviteId,
        sphereType: options.sphereType
      });

      return {
        invite_id: inviteId,
        status: 'pending'
      };
    } catch (error) {
      console.error('[InviteQuestTracker] Track invite error:', error.message);
      throw error;
    }
  }

  /**
   * Track invite accepted (when invited user signs up)
   */
  async trackInviteAccepted(inviterUserId, invitedUserId) {
    if (!this.enabled) return false;

    console.log(`[InviteQuestTracker] Invite accepted: ${inviterUserId} → ${invitedUserId}`);

    try {
      // Update invite status
      await this.db.query(`
        UPDATE invite_tracking SET
          invited_user_id = $1,
          status = 'accepted',
          accepted_at = NOW()
        WHERE inviter_user_id = $2
          AND invited_user_id IS NULL
          AND status = 'pending'
        LIMIT 1
      `, [invitedUserId, inviterUserId]);

      // Update quest progress
      if (this.questEngine) {
        await this.questEngine.trackInvite(inviterUserId, invitedUserId);
      }

      // Emit event
      this.emit('invite:accepted', {
        inviterUserId,
        invitedUserId
      });

      return true;
    } catch (error) {
      console.error('[InviteQuestTracker] Track invite accepted error:', error.message);
      return false;
    }
  }

  /**
   * Track invite became active (invited user completed onboarding)
   */
  async trackInviteBecameActive(inviterUserId, invitedUserId) {
    if (!this.enabled) return false;

    console.log(`[InviteQuestTracker] Invite became active: ${inviterUserId} → ${invitedUserId}`);

    try {
      // Update invite status
      await this.db.query(`
        UPDATE invite_tracking SET
          status = 'active',
          became_active_at = NOW()
        WHERE inviter_user_id = $1
          AND invited_user_id = $2
          AND status = 'accepted'
      `, [inviterUserId, invitedUserId]);

      // Track for "active invites" quests (e.g., "50 active invites" for legendary quest)
      if (this.questEngine) {
        const activeQuests = await this.questEngine.getQuestsByType('invite');

        for (const quest of activeQuests) {
          // Check if quest requires "active" invites
          if (quest.quest_slug === 'empire-builder') {
            // Update progress for legendary quest that requires active users
            await this.questEngine.updateProgress(
              inviterUserId,
              quest.quest_id,
              1, // increment count
              0,
              { invited_user_id: invitedUserId, became_active_at: new Date().toISOString() }
            );
          }
        }
      }

      this.emit('invite:active', {
        inviterUserId,
        invitedUserId
      });

      return true;
    } catch (error) {
      console.error('[InviteQuestTracker] Track invite active error:', error.message);
      return false;
    }
  }

  /**
   * Get invite tree for user (who they invited, recursively)
   */
  async getInviteTree(userId, maxDepth = 3) {
    const tree = await this._buildInviteTree(userId, maxDepth, 0);
    return tree;
  }

  /**
   * Build invite tree recursively (internal)
   */
  async _buildInviteTree(userId, maxDepth, currentDepth) {
    if (currentDepth >= maxDepth) {
      return [];
    }

    // Get direct invites
    const result = await this.db.query(`
      SELECT
        it.invite_id,
        it.invited_user_id,
        it.invited_email,
        it.status,
        it.invited_at,
        it.accepted_at,
        it.became_active_at,
        u.username,
        u.email as user_email
      FROM invite_tracking it
      LEFT JOIN users u ON it.invited_user_id = u.user_id
      WHERE it.inviter_user_id = $1
      ORDER BY it.invited_at DESC
    `, [userId]);

    const invites = [];

    for (const row of result.rows) {
      const invite = {
        invite_id: row.invite_id,
        invited_user_id: row.invited_user_id,
        invited_email: row.invited_email,
        username: row.username,
        status: row.status,
        invited_at: row.invited_at,
        accepted_at: row.accepted_at,
        became_active_at: row.became_active_at,
        depth: currentDepth + 1,
        children: []
      };

      // Recursively get this user's invites
      if (row.invited_user_id) {
        invite.children = await this._buildInviteTree(row.invited_user_id, maxDepth, currentDepth + 1);
      }

      invites.push(invite);
    }

    return invites;
  }

  /**
   * Get invite statistics for user
   */
  async getInviteStats(userId) {
    const result = await this.db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending_invites,
        COUNT(*) FILTER (WHERE status = 'accepted') as accepted_invites,
        COUNT(*) FILTER (WHERE status = 'active') as active_invites,
        COUNT(*) FILTER (WHERE status = 'expired') as expired_invites,
        COUNT(*) as total_invites
      FROM invite_tracking
      WHERE inviter_user_id = $1
    `, [userId]);

    return result.rows[0] || {
      pending_invites: 0,
      accepted_invites: 0,
      active_invites: 0,
      expired_invites: 0,
      total_invites: 0
    };
  }

  /**
   * Get suggested circles to invite to (based on user's spheres)
   */
  async getSuggestedCircles(userId) {
    // Get user's spheres
    const userSpheres = await this.db.query(`
      SELECT
        us.*,
        sd.display_name,
        sd.sphere_type
      FROM user_spheres us
      JOIN sphere_definitions sd ON us.sphere_def_id = sd.sphere_def_id
      WHERE us.user_id = $1 AND us.is_public = true
    `, [userId]);

    const suggestions = [];

    for (const sphere of userSpheres.rows) {
      // Count users in same sphere
      const countResult = await this.db.query(`
        SELECT COUNT(*) as user_count
        FROM user_spheres
        WHERE sphere_def_id = $1
          AND sphere_value = $2
          AND user_id != $3
      `, [sphere.sphere_def_id, sphere.sphere_value, userId]);

      const userCount = parseInt(countResult.rows[0].user_count);

      // Count how many user has already invited from this sphere
      const invitedResult = await this.db.query(`
        SELECT COUNT(*) as invited_count
        FROM invite_tracking
        WHERE inviter_user_id = $1
          AND sphere_type = $2
          AND sphere_value = $3
      `, [userId, sphere.sphere_type, sphere.sphere_value]);

      const invitedCount = parseInt(invitedResult.rows[0].invited_count);

      suggestions.push({
        sphere_type: sphere.sphere_type,
        sphere_value: sphere.sphere_value,
        display_name: sphere.display_name,
        total_users: userCount,
        invited_count: invitedCount,
        remaining: userCount - invitedCount,
        suggestion: this._getSuggestionText(sphere.sphere_type, sphere.sphere_value, userCount, invitedCount)
      });
    }

    // Sort by remaining potential invites
    suggestions.sort((a, b) => b.remaining - a.remaining);

    return suggestions;
  }

  /**
   * Get suggestion text for circle
   */
  _getSuggestionText(sphereType, sphereValue, totalUsers, invitedCount) {
    const remaining = totalUsers - invitedCount;

    if (remaining === 0) {
      return `You've invited everyone from ${sphereValue}! 🎉`;
    }

    const suggestions = {
      college: `Invite ${remaining} more classmates from ${sphereValue}`,
      company: `Invite ${remaining} more colleagues from ${sphereValue}`,
      city: `Invite ${remaining} more people from ${sphereValue}`,
      interest: `Invite ${remaining} more ${sphereValue} enthusiasts`,
      alumni: `Invite ${remaining} more alumni from ${sphereValue}`
    };

    return suggestions[sphereType] || `Invite ${remaining} more from ${sphereValue}`;
  }

  /**
   * Get global invite leaderboard
   */
  async getInviteLeaderboard(limit = 100) {
    const result = await this.db.query(`
      SELECT
        u.user_id,
        u.username,
        u.email,
        COUNT(it.invite_id) FILTER (WHERE it.status = 'active') as active_invites,
        COUNT(it.invite_id) FILTER (WHERE it.status = 'accepted') as accepted_invites,
        COUNT(it.invite_id) as total_invites
      FROM users u
      LEFT JOIN invite_tracking it ON u.user_id = it.inviter_user_id
      GROUP BY u.user_id, u.username, u.email
      HAVING COUNT(it.invite_id) > 0
      ORDER BY active_invites DESC, accepted_invites DESC, total_invites DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Generate referral code for user's sphere
   */
  async generateSphereReferralCode(userId, sphereType, sphereValue) {
    if (this.affiliateTracker) {
      // Use affiliate tracker to generate code
      const code = await this.affiliateTracker.generateReferralCode(
        userId,
        `${sphereType}-${sphereValue}`.substring(0, 20)
      );

      return code;
    }

    // Fallback: generate simple code
    const crypto = require('crypto');
    const randomPart = crypto.randomBytes(4).toString('hex');
    return `${sphereType.substring(0, 3).toUpperCase()}-${userId}-${randomPart}`.toUpperCase();
  }
}

// Ensure table exists
async function ensureInviteTrackingTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS invite_tracking (
      invite_id SERIAL PRIMARY KEY,
      inviter_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      invited_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      invited_email VARCHAR(255) NOT NULL,
      referral_code VARCHAR(255),
      sphere_type VARCHAR(50), -- Which sphere was targeted
      sphere_value TEXT, -- Which specific sphere (e.g., 'stanford.edu', 'San Francisco')
      status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'accepted', 'active', 'expired'
      metadata JSONB DEFAULT '{}',
      invited_at TIMESTAMP DEFAULT NOW(),
      accepted_at TIMESTAMP,
      became_active_at TIMESTAMP,
      expired_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_invite_tracking_inviter ON invite_tracking(inviter_user_id);
    CREATE INDEX IF NOT EXISTS idx_invite_tracking_invited ON invite_tracking(invited_user_id);
    CREATE INDEX IF NOT EXISTS idx_invite_tracking_email ON invite_tracking(invited_email);
    CREATE INDEX IF NOT EXISTS idx_invite_tracking_status ON invite_tracking(status);
    CREATE INDEX IF NOT EXISTS idx_invite_tracking_sphere ON invite_tracking(sphere_type, sphere_value);

    COMMENT ON TABLE invite_tracking IS 'Track invite progress for quest system';
  `);

  console.log('[InviteQuestTracker] Table ensured');
}

module.exports = InviteQuestTracker;
module.exports.ensureInviteTrackingTable = ensureInviteTrackingTable;
