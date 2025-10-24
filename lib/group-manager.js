/**
 * Group Manager
 *
 * Manages friend groups, sports teams, and communities post-COVID.
 * Like Airbnb's rebrand but for "belonging together" through forums and events.
 *
 * Features:
 * - Friend group creation
 * - Sports team management
 * - Custom branding per group (logos, colors, mascots)
 * - Role management (admin, member, lurker)
 * - Event planning
 * - Group forums and message boards
 *
 * Use Case: "Bring people back together post-COVID through forums and message boards"
 */

class GroupManager {
  constructor(options = {}) {
    this.db = options.db;
    this.brandingGenerator = options.brandingGenerator; // For custom group icons

    this.config = {
      maxMembersPerGroup: options.maxMembersPerGroup || 500,
      defaultGroupType: options.defaultGroupType || 'friend_group',

      // Group types
      groupTypes: [
        'friend_group',
        'sports_team',
        'community',
        'study_group',
        'gaming_squad',
        'family'
      ],

      // Member roles
      roles: {
        owner: {
          level: 4,
          permissions: ['*'] // All permissions
        },
        admin: {
          level: 3,
          permissions: ['invite', 'remove_member', 'edit_group', 'moderate', 'create_event']
        },
        member: {
          level: 2,
          permissions: ['post', 'comment', 'create_event', 'invite']
        },
        lurker: {
          level: 1,
          permissions: ['view'] // Read-only
        }
      }
    };

    console.log('[GroupManager] Initialized');
  }

  /**
   * Create new group
   */
  async createGroup({ ownerId, name, description, type, branding = {}, privacy = 'private' }) {
    try {
      // Validate group type
      if (!this.config.groupTypes.includes(type)) {
        type = this.config.defaultGroupType;
      }

      // Generate default branding if not provided
      if (!branding.icon && this.brandingGenerator) {
        branding.icon = await this.brandingGenerator.generateGroupIcon({
          name,
          type,
          colors: branding.colors
        });
      }

      // Set default colors
      if (!branding.colors) {
        branding.colors = this._generateDefaultColors(type);
      }

      // Create group
      const result = await this.db.query(`
        INSERT INTO groups (
          owner_id,
          name,
          description,
          type,
          privacy,
          branding,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *
      `, [
        ownerId,
        name,
        description,
        type,
        privacy,
        JSON.stringify(branding)
      ]);

      const group = result.rows[0];

      // Add owner as member
      await this.addMember({
        groupId: group.group_id,
        userId: ownerId,
        role: 'owner',
        addedBy: ownerId
      });

      // Create default forum for group
      await this._createDefaultForum(group.group_id);

      console.log(`[GroupManager] Created group: ${name} (${type})`);

      return {
        success: true,
        group
      };

    } catch (error) {
      console.error('[GroupManager] Error creating group:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add member to group
   */
  async addMember({ groupId, userId, role = 'member', addedBy, inviteCode = null }) {
    try {
      // Check if user is already a member
      const existing = await this.db.query(`
        SELECT * FROM group_members
        WHERE group_id = $1 AND user_id = $2
      `, [groupId, userId]);

      if (existing.rows.length > 0) {
        return {
          success: false,
          error: 'User is already a member'
        };
      }

      // Check group member limit
      const memberCount = await this._getMemberCount(groupId);
      if (memberCount >= this.config.maxMembersPerGroup) {
        return {
          success: false,
          error: 'Group is full'
        };
      }

      // Add member
      await this.db.query(`
        INSERT INTO group_members (
          group_id,
          user_id,
          role,
          added_by,
          invite_code,
          joined_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [groupId, userId, role, addedBy, inviteCode]);

      // Update group member count
      await this.db.query(`
        UPDATE groups
        SET member_count = member_count + 1
        WHERE group_id = $1
      `, [groupId]);

      console.log(`[GroupManager] Added ${userId} to group ${groupId} as ${role}`);

      return {
        success: true
      };

    } catch (error) {
      console.error('[GroupManager] Error adding member:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove member from group
   */
  async removeMember({ groupId, userId, removedBy }) {
    try {
      // Can't remove the owner
      const member = await this.db.query(`
        SELECT role FROM group_members
        WHERE group_id = $1 AND user_id = $2
      `, [groupId, userId]);

      if (member.rows.length === 0) {
        return {
          success: false,
          error: 'User is not a member'
        };
      }

      if (member.rows[0].role === 'owner') {
        return {
          success: false,
          error: 'Cannot remove group owner'
        };
      }

      // Remove member
      await this.db.query(`
        DELETE FROM group_members
        WHERE group_id = $1 AND user_id = $2
      `, [groupId, userId]);

      // Update member count
      await this.db.query(`
        UPDATE groups
        SET member_count = member_count - 1
        WHERE group_id = $1
      `, [groupId]);

      return {
        success: true
      };

    } catch (error) {
      console.error('[GroupManager] Error removing member:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate invite link for group
   */
  async generateInviteLink(groupId, createdBy, options = {}) {
    try {
      const {
        expiresIn = 7 * 24 * 60 * 60 * 1000, // 7 days
        maxUses = null,
        role = 'member'
      } = options;

      const inviteCode = this._generateInviteCode();
      const expiresAt = new Date(Date.now() + expiresIn);

      await this.db.query(`
        INSERT INTO group_invites (
          group_id,
          invite_code,
          created_by,
          role,
          max_uses,
          expires_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [groupId, inviteCode, createdBy, role, maxUses, expiresAt]);

      return {
        success: true,
        inviteCode,
        inviteLink: `${process.env.BASE_URL || 'http://localhost:5001'}/join/${inviteCode}`,
        expiresAt
      };

    } catch (error) {
      console.error('[GroupManager] Error generating invite:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Join group via invite code
   */
  async joinViaInvite(inviteCode, userId) {
    try {
      // Get invite
      const inviteResult = await this.db.query(`
        SELECT * FROM group_invites
        WHERE invite_code = $1
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (max_uses IS NULL OR uses < max_uses)
      `, [inviteCode]);

      if (inviteResult.rows.length === 0) {
        return {
          success: false,
          error: 'Invalid or expired invite code'
        };
      }

      const invite = inviteResult.rows[0];

      // Add member
      const result = await this.addMember({
        groupId: invite.group_id,
        userId,
        role: invite.role,
        addedBy: invite.created_by,
        inviteCode
      });

      if (result.success) {
        // Increment invite uses
        await this.db.query(`
          UPDATE group_invites
          SET uses = uses + 1
          WHERE invite_code = $1
        `, [inviteCode]);
      }

      return result;

    } catch (error) {
      console.error('[GroupManager] Error joining via invite:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update group branding
   */
  async updateGroupBranding(groupId, branding) {
    try {
      await this.db.query(`
        UPDATE groups
        SET branding = $1, updated_at = NOW()
        WHERE group_id = $2
      `, [JSON.stringify(branding), groupId]);

      return { success: true };

    } catch (error) {
      console.error('[GroupManager] Error updating branding:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get group details
   */
  async getGroup(groupId, userId = null) {
    try {
      const result = await this.db.query(`
        SELECT * FROM groups WHERE group_id = $1
      `, [groupId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Group not found'
        };
      }

      const group = result.rows[0];

      // Get user's role if userId provided
      let userRole = null;
      if (userId) {
        const memberResult = await this.db.query(`
          SELECT role FROM group_members
          WHERE group_id = $1 AND user_id = $2
        `, [groupId, userId]);

        if (memberResult.rows.length > 0) {
          userRole = memberResult.rows[0].role;
        }
      }

      return {
        success: true,
        group,
        userRole
      };

    } catch (error) {
      console.error('[GroupManager] Error getting group:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get group members
   */
  async getMembers(groupId, limit = 100) {
    try {
      const result = await this.db.query(`
        SELECT
          gm.*,
          u.username,
          u.email
        FROM group_members gm
        LEFT JOIN users u ON u.user_id = gm.user_id
        WHERE gm.group_id = $1
        ORDER BY gm.joined_at DESC
        LIMIT $2
      `, [groupId, limit]);

      return {
        success: true,
        members: result.rows
      };

    } catch (error) {
      console.error('[GroupManager] Error getting members:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get user's groups
   */
  async getUserGroups(userId) {
    try {
      const result = await this.db.query(`
        SELECT
          g.*,
          gm.role
        FROM groups g
        JOIN group_members gm ON gm.group_id = g.group_id
        WHERE gm.user_id = $1
        ORDER BY g.created_at DESC
      `, [userId]);

      return {
        success: true,
        groups: result.rows
      };

    } catch (error) {
      console.error('[GroupManager] Error getting user groups:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if user has permission
   */
  async hasPermission(groupId, userId, permission) {
    try {
      const memberResult = await this.db.query(`
        SELECT role FROM group_members
        WHERE group_id = $1 AND user_id = $2
      `, [groupId, userId]);

      if (memberResult.rows.length === 0) {
        return false;
      }

      const role = memberResult.rows[0].role;
      const roleConfig = this.config.roles[role];

      if (!roleConfig) return false;

      // Owner has all permissions
      if (roleConfig.permissions.includes('*')) return true;

      // Check specific permission
      return roleConfig.permissions.includes(permission);

    } catch (error) {
      console.error('[GroupManager] Error checking permission:', error);
      return false;
    }
  }

  /**
   * Create default forum for group
   */
  async _createDefaultForum(groupId) {
    try {
      await this.db.query(`
        INSERT INTO group_forums (
          group_id,
          name,
          description,
          created_at
        ) VALUES ($1, $2, $3, NOW())
      `, [
        groupId,
        'General Discussion',
        'Main forum for group discussion'
      ]);
    } catch (error) {
      console.warn('[GroupManager] Failed to create default forum:', error.message);
    }
  }

  /**
   * Get member count
   */
  async _getMemberCount(groupId) {
    const result = await this.db.query(`
      SELECT COUNT(*) as count FROM group_members WHERE group_id = $1
    `, [groupId]);

    return parseInt(result.rows[0].count);
  }

  /**
   * Generate invite code
   */
  _generateInviteCode() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate default colors based on group type
   */
  _generateDefaultColors(type) {
    const colorSchemes = {
      friend_group: {
        primary: '#667eea',
        secondary: '#764ba2',
        accent: '#f093fb'
      },
      sports_team: {
        primary: '#ff6b6b',
        secondary: '#4ecdc4',
        accent: '#ffe66d'
      },
      community: {
        primary: '#4ecdc4',
        secondary: '#44a08d',
        accent: '#6c5ce7'
      },
      study_group: {
        primary: '#6c5ce7',
        secondary: '#a29bfe',
        accent: '#fd79a8'
      },
      gaming_squad: {
        primary: '#00b894',
        secondary: '#00cec9',
        accent: '#fdcb6e'
      },
      family: {
        primary: '#fd79a8',
        secondary: '#fdcb6e',
        accent: '#e17055'
      }
    };

    return colorSchemes[type] || colorSchemes.friend_group;
  }
}

module.exports = GroupManager;
