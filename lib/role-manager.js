/**
 * Role Manager
 *
 * Simple role-based access control system for CalOS
 * Roles: admin → mod → pro → trial → guest
 *
 * No database required - uses localStorage for browser, memory for server
 *
 * Usage:
 * const roleManager = new RoleManager();
 * const canCall = roleManager.hasPermission(userId, 'calling');
 * const role = roleManager.getRole(userId);
 *
 * @version 1.0.0
 * @license MIT
 */

class RoleManager {
  constructor(options = {}) {
    this.storage = options.storage || 'localStorage'; // or 'memory'
    this.roles = {
      admin: {
        level: 100,
        devices: 999,
        calling: true,
        paging: true,
        features: ['all', 'admin-panel', 'user-management', 'system-config'],
        badge: '👑 Admin',
        color: '#e74c3c'
      },
      mod: {
        level: 75,
        devices: 50,
        calling: true,
        paging: true,
        features: ['most', 'moderation', 'user-support', 'content-review'],
        badge: '🛡️ Moderator',
        color: '#3498db'
      },
      pro: {
        level: 50,
        devices: 10,
        calling: true,
        paging: true,
        features: ['standard', 'webrtc-calling', 'device-paging', 'multi-device'],
        badge: '⭐ Pro',
        color: '#2ecc71'
      },
      trial: {
        level: 25,
        devices: 2,
        calling: false,
        paging: true,
        features: ['limited', 'qr-login', 'device-paging', 'basic-dashboard'],
        badge: '🎁 Trial',
        color: '#f1c40f',
        duration: 30 * 24 * 60 * 60 * 1000 // 30 days
      },
      guest: {
        level: 0,
        devices: 1,
        calling: false,
        paging: false,
        features: ['view-only', 'read-docs'],
        badge: '👤 Guest',
        color: '#95a5a6'
      }
    };

    // In-memory cache for server-side
    this.cache = new Map();

    console.log('[RoleManager] Initialized with', Object.keys(this.roles).length, 'roles');
  }

  /**
   * Get user's role
   * @param {string} userId - User ID
   * @returns {string} - Role name (admin, mod, pro, trial, guest)
   */
  getRole(userId) {
    if (typeof window !== 'undefined' && this.storage === 'localStorage') {
      // Browser environment
      const stored = localStorage.getItem(`role_${userId}`);
      if (stored) {
        const data = JSON.parse(stored);

        // Check if trial expired
        if (data.role === 'trial' && data.expiresAt && Date.now() > data.expiresAt) {
          console.log('[RoleManager] Trial expired for', userId);
          this.setRole(userId, 'guest');
          return 'guest';
        }

        return data.role;
      }
    } else {
      // Server environment or memory storage
      if (this.cache.has(userId)) {
        const data = this.cache.get(userId);

        // Check if trial expired
        if (data.role === 'trial' && data.expiresAt && Date.now() > data.expiresAt) {
          console.log('[RoleManager] Trial expired for', userId);
          this.setRole(userId, 'guest');
          return 'guest';
        }

        return data.role;
      }
    }

    // Default to guest
    return 'guest';
  }

  /**
   * Set user's role
   * @param {string} userId - User ID
   * @param {string} role - Role name
   * @param {object} options - Additional options (grantedBy, reason, etc.)
   */
  setRole(userId, role, options = {}) {
    if (!this.roles[role]) {
      throw new Error(`Invalid role: ${role}`);
    }

    const data = {
      role,
      grantedAt: Date.now(),
      grantedBy: options.grantedBy || 'system',
      reason: options.reason || 'manual',
      expiresAt: null
    };

    // Set expiry for trial
    if (role === 'trial') {
      data.expiresAt = Date.now() + this.roles.trial.duration;

      // Add bonus days if specified
      if (options.bonusDays) {
        data.expiresAt += options.bonusDays * 24 * 60 * 60 * 1000;
      }
    }

    if (typeof window !== 'undefined' && this.storage === 'localStorage') {
      // Browser environment
      localStorage.setItem(`role_${userId}`, JSON.stringify(data));
    } else {
      // Server environment or memory storage
      this.cache.set(userId, data);
    }

    console.log('[RoleManager] Set role', role, 'for', userId, data.expiresAt ? `(expires: ${new Date(data.expiresAt).toLocaleString()})` : '');

    return data;
  }

  /**
   * Get role configuration
   * @param {string} userId - User ID
   * @returns {object} - Role config
   */
  getRoleConfig(userId) {
    const role = this.getRole(userId);
    return this.roles[role];
  }

  /**
   * Check if user has permission
   * @param {string} userId - User ID
   * @param {string} permission - Permission name (calling, paging, etc.)
   * @returns {boolean}
   */
  hasPermission(userId, permission) {
    const config = this.getRoleConfig(userId);

    // Special case: 'all' feature grants everything
    if (config.features.includes('all')) {
      return true;
    }

    return config[permission] === true || config.features.includes(permission);
  }

  /**
   * Check if user can add device
   * @param {string} userId - User ID
   * @param {number} currentDevices - Number of devices already paired
   * @returns {boolean}
   */
  canAddDevice(userId, currentDevices) {
    const config = this.getRoleConfig(userId);
    return currentDevices < config.devices;
  }

  /**
   * Get role level (for comparisons)
   * @param {string} userId - User ID
   * @returns {number} - Role level (0-100)
   */
  getRoleLevel(userId) {
    const config = this.getRoleConfig(userId);
    return config.level;
  }

  /**
   * Check if user can perform action on target user
   * @param {string} userId - User performing action
   * @param {string} targetUserId - Target user
   * @returns {boolean}
   */
  canModifyUser(userId, targetUserId) {
    const userLevel = this.getRoleLevel(userId);
    const targetLevel = this.getRoleLevel(targetUserId);

    // Must have higher level than target
    return userLevel > targetLevel;
  }

  /**
   * Get trial info
   * @param {string} userId - User ID
   * @returns {object|null} - Trial info or null
   */
  getTrialInfo(userId) {
    const role = this.getRole(userId);
    if (role !== 'trial') return null;

    let data;
    if (typeof window !== 'undefined' && this.storage === 'localStorage') {
      const stored = localStorage.getItem(`role_${userId}`);
      if (!stored) return null;
      data = JSON.parse(stored);
    } else {
      if (!this.cache.has(userId)) return null;
      data = this.cache.get(userId);
    }

    if (!data.expiresAt) return null;

    const now = Date.now();
    const remaining = Math.max(0, data.expiresAt - now);
    const daysLeft = Math.floor(remaining / (24 * 60 * 60 * 1000));

    return {
      expiresAt: data.expiresAt,
      remaining,
      daysLeft,
      expired: remaining <= 0,
      grantedAt: data.grantedAt
    };
  }

  /**
   * Add bonus days to trial
   * @param {string} userId - User ID
   * @param {number} days - Number of days to add
   */
  addBonusDays(userId, days) {
    const role = this.getRole(userId);
    if (role !== 'trial') {
      throw new Error('User must be on trial to add bonus days');
    }

    let data;
    if (typeof window !== 'undefined' && this.storage === 'localStorage') {
      const stored = localStorage.getItem(`role_${userId}`);
      if (!stored) throw new Error('Trial data not found');
      data = JSON.parse(stored);
    } else {
      if (!this.cache.has(userId)) throw new Error('Trial data not found');
      data = this.cache.get(userId);
    }

    // Add bonus days
    data.expiresAt += days * 24 * 60 * 60 * 1000;

    // Save
    if (typeof window !== 'undefined' && this.storage === 'localStorage') {
      localStorage.setItem(`role_${userId}`, JSON.stringify(data));
    } else {
      this.cache.set(userId, data);
    }

    console.log('[RoleManager] Added', days, 'bonus days to', userId, '(new expiry:', new Date(data.expiresAt).toLocaleString(), ')');

    return data;
  }

  /**
   * List all roles
   * @returns {object} - All roles
   */
  listRoles() {
    return this.roles;
  }

  /**
   * Get role badge HTML
   * @param {string} userId - User ID
   * @returns {string} - HTML badge
   */
  getRoleBadgeHTML(userId) {
    const config = this.getRoleConfig(userId);
    return `<span style="display: inline-block; padding: 4px 12px; background: ${config.color}20; color: ${config.color}; border: 1px solid ${config.color}40; border-radius: 20px; font-size: 0.85rem; font-weight: 600;">${config.badge}</span>`;
  }

  /**
   * Get role permissions summary
   * @param {string} userId - User ID
   * @returns {object} - Permissions summary
   */
  getPermissionsSummary(userId) {
    const config = this.getRoleConfig(userId);
    const role = this.getRole(userId);

    return {
      role,
      level: config.level,
      badge: config.badge,
      color: config.color,
      devices: {
        limit: config.devices,
        unlimited: config.devices >= 999
      },
      calling: config.calling,
      paging: config.paging,
      features: config.features
    };
  }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RoleManager;
} else if (typeof window !== 'undefined') {
  window.RoleManager = RoleManager;
}
