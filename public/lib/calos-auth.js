/**
 * CalOS Authentication Library
 *
 * Shared authentication helpers for all frontend UIs.
 * Handles JWT tokens, Bearer authentication, and API communication.
 *
 * Usage:
 *   <script src="/lib/calos-auth.js"></script>
 *   <script>
 *     // Login
 *     const user = await CalAuth.login('user@example.com', 'password');
 *
 *     // Make authenticated requests
 *     const tasks = await CalAuth.fetch('/api/training/tasks/available');
 *
 *     // Check auth status
 *     if (CalAuth.isAuthenticated()) { ... }
 *   </script>
 */

const CalAuth = {
  // Storage keys
  STORAGE_KEYS: {
    TOKEN: 'calos_auth_token',
    REFRESH_TOKEN: 'calos_refresh_token',
    USER: 'calos_user',
    DEVICE_ID: 'calos_device_id',
    SESSION_ID: 'calos_session_id'
  },

  // API base URL (auto-detect or override)
  apiBase: window.location.origin,

  /**
   * Initialize auth library
   * Checks for existing session and validates token
   */
  async init() {
    const token = this.getToken();
    if (token) {
      try {
        // Validate token by fetching user profile
        const user = await this.fetch('/api/auth/me');
        this.setUser(user);
        return user;
      } catch (error) {
        console.warn('[CalAuth] Token validation failed, clearing session:', error.message);
        this.logout();
        return null;
      }
    }
    return null;
  },

  /**
   * Login with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {string} deviceName - Optional device name
   * @returns {Promise<object>} User object with token
   */
  async login(email, password, deviceName = null) {
    try {
      const response = await fetch(`${this.apiBase}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password,
          deviceName: deviceName || this.getDeviceName()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store tokens and user data
      this.setToken(data.accessToken);
      this.setRefreshToken(data.refreshToken);
      this.setSessionId(data.sessionId);
      this.setUser(data.user);

      console.log('[CalAuth] Login successful:', data.user.email);
      return data;
    } catch (error) {
      console.error('[CalAuth] Login error:', error);
      throw error;
    }
  },

  /**
   * Register new account
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {string} name - User display name
   * @returns {Promise<object>} User object with token
   */
  async register(email, password, name) {
    try {
      const response = await fetch(`${this.apiBase}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password, name })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Store tokens and user data
      this.setToken(data.accessToken);
      this.setRefreshToken(data.refreshToken);
      this.setSessionId(data.sessionId);
      this.setUser(data.user);

      console.log('[CalAuth] Registration successful:', data.user.email);
      return data;
    } catch (error) {
      console.error('[CalAuth] Registration error:', error);
      throw error;
    }
  },

  /**
   * Logout and clear session
   */
  async logout() {
    const token = this.getToken();
    if (token) {
      try {
        await fetch(`${this.apiBase}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (error) {
        console.warn('[CalAuth] Logout API call failed (continuing anyway):', error.message);
      }
    }

    // Clear all stored data
    Object.values(this.STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });

    console.log('[CalAuth] Logout complete');
  },

  /**
   * Refresh access token using refresh token
   * @returns {Promise<string>} New access token
   */
  async refreshAccessToken() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(`${this.apiBase}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Token refresh failed');
      }

      this.setToken(data.accessToken);
      console.log('[CalAuth] Token refreshed');
      return data.accessToken;
    } catch (error) {
      console.error('[CalAuth] Token refresh error:', error);
      this.logout(); // Clear invalid session
      throw error;
    }
  },

  /**
   * Make authenticated fetch request
   * Automatically adds Bearer token and handles 401 with token refresh
   * @param {string} url - API endpoint (relative or absolute)
   * @param {object} options - Fetch options
   * @returns {Promise<any>} Response data (auto-parsed JSON)
   */
  async fetch(url, options = {}) {
    const token = this.getToken();
    if (!token) {
      throw new Error('Not authenticated - please login first');
    }

    // Ensure absolute URL
    const fullUrl = url.startsWith('http') ? url : `${this.apiBase}${url}`;

    // Add auth headers
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    };

    // Add device ID if available
    const deviceId = this.getDeviceId();
    if (deviceId) {
      headers['x-device-id'] = deviceId;
    }

    try {
      const response = await fetch(fullUrl, {
        ...options,
        headers
      });

      // Handle 401 - try token refresh
      if (response.status === 401) {
        console.log('[CalAuth] Token expired, attempting refresh...');
        await this.refreshAccessToken();

        // Retry with new token
        headers.Authorization = `Bearer ${this.getToken()}`;
        const retryResponse = await fetch(fullUrl, {
          ...options,
          headers
        });

        if (!retryResponse.ok) {
          const error = await retryResponse.json();
          throw new Error(error.error || `API error: ${retryResponse.status}`);
        }

        return await retryResponse.json();
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[CalAuth] Fetch error:', error);
      throw error;
    }
  },

  /**
   * Device Pairing: Generate QR code for device pairing
   * @returns {Promise<object>} { pairingCode, qrCodeUrl, expiresAt }
   */
  async generatePairingQR() {
    return await this.fetch('/api/auth/device/qr/generate', {
      method: 'POST'
    });
  },

  /**
   * Device Pairing: Scan QR code (from another device)
   * @param {string} pairingCode - 6-character code from QR
   * @returns {Promise<object>} Device pairing result
   */
  async scanPairingQR(pairingCode) {
    return await this.fetch('/api/auth/device/qr/pair', {
      method: 'POST',
      body: JSON.stringify({ pairingCode })
    });
  },

  /**
   * Training Tasks: Get available tasks
   * @param {object} filters - { taskType, skill, limit }
   * @returns {Promise<array>} Available tasks
   */
  async getTrainingTasks(filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.fetch(`/api/training/tasks/available?${params}`);
  },

  /**
   * Training Tasks: Claim a task
   * @param {number} taskId - Task ID
   * @returns {Promise<object>} Claimed task
   */
  async claimTask(taskId) {
    return await this.fetch(`/api/training/tasks/${taskId}/claim`, {
      method: 'POST'
    });
  },

  /**
   * Training Tasks: Submit completed task
   * @param {number} taskId - Task ID
   * @param {object} submission - Task submission data
   * @returns {Promise<object>} Submission result with XP earned
   */
  async submitTask(taskId, submission) {
    return await this.fetch(`/api/training/tasks/${taskId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ submission })
    });
  },

  /**
   * Training Tasks: Get user stats
   * @returns {Promise<object>} { totalXp, tasksCompleted, currentStreak, ... }
   */
  async getTrainingStats() {
    return await this.fetch('/api/training/stats');
  },

  /**
   * Training Tasks: Get leaderboard
   * @param {string} period - 'daily', 'weekly', 'monthly', 'all_time'
   * @returns {Promise<array>} Leaderboard rankings
   */
  async getLeaderboard(period = 'all_time') {
    return await this.fetch(`/api/training/leaderboard?period=${period}`);
  },

  /**
   * Account Warming: Start warmup campaign
   * @param {string} deviceId - Device ID to warm
   * @param {object} options - { targetPhase, dailyTaskGoal, notes }
   * @returns {Promise<object>} Campaign details
   */
  async startWarmup(deviceId, options = {}) {
    return await this.fetch('/api/warmup/start', {
      method: 'POST',
      body: JSON.stringify({ deviceId, ...options })
    });
  },

  /**
   * Account Warming: Get warmup status
   * @returns {Promise<object>} Current phase, progress, authenticity
   */
  async getWarmupStatus() {
    return await this.fetch('/api/warmup/status');
  },

  /**
   * Account Warming: Check advancement eligibility
   * @returns {Promise<object>} { canAdvance, nextPhase, ... }
   */
  async checkWarmupAdvancement() {
    return await this.fetch('/api/warmup/check-advancement', {
      method: 'POST'
    });
  },

  /**
   * Account Warming: Get recommended tasks for current phase
   * @param {number} limit - Max tasks to return
   * @returns {Promise<array>} Recommended training tasks
   */
  async getWarmupTasks(limit = 5) {
    return await this.fetch(`/api/warmup/recommended-tasks?limit=${limit}`);
  },

  /**
   * Account Warming: Log activity (for authenticity scoring)
   * @param {string} activityType - 'view_content', 'vote', 'chat', etc.
   * @param {object} metadata - Activity-specific data
   */
  async logWarmupActivity(activityType, metadata = {}) {
    return await this.fetch('/api/warmup/log-activity', {
      method: 'POST',
      body: JSON.stringify({ activityType, metadata })
    });
  },

  /**
   * Account Warming: Get authenticity score
   * @returns {Promise<object>} { score, factors, isSuspicious, ... }
   */
  async getAuthenticityScore() {
    return await this.fetch('/api/warmup/authenticity');
  },

  /**
   * Experiments: Get active experiments for user
   * @param {object} filters - { domain, userProfile }
   * @returns {Promise<array>} Active experiments
   */
  async getActiveExperiments(filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.fetch(`/api/experiments/active?${params}`);
  },

  /**
   * Experiments: Get variant assignment for experiment
   * @param {number} experimentId - Experiment ID
   * @returns {Promise<object>} Assigned variant config
   */
  async getExperimentVariant(experimentId) {
    return await this.fetch(`/api/experiments/${experimentId}/assign`);
  },

  /**
   * Experiments: Record experiment result
   * @param {number} experimentId - Experiment ID
   * @param {number} variantId - Variant ID
   * @param {object} metrics - { success, responseTime, cost, satisfaction, conversion }
   */
  async recordExperimentResult(experimentId, variantId, metrics) {
    return await this.fetch(`/api/experiments/${experimentId}/record`, {
      method: 'POST',
      body: JSON.stringify({ variantId, metrics })
    });
  },

  // Token management
  getToken() {
    return localStorage.getItem(this.STORAGE_KEYS.TOKEN);
  },

  setToken(token) {
    localStorage.setItem(this.STORAGE_KEYS.TOKEN, token);
  },

  getRefreshToken() {
    return localStorage.getItem(this.STORAGE_KEYS.REFRESH_TOKEN);
  },

  setRefreshToken(token) {
    localStorage.setItem(this.STORAGE_KEYS.REFRESH_TOKEN, token);
  },

  getSessionId() {
    return localStorage.getItem(this.STORAGE_KEYS.SESSION_ID);
  },

  setSessionId(sessionId) {
    localStorage.setItem(this.STORAGE_KEYS.SESSION_ID, sessionId);
  },

  getUser() {
    const user = localStorage.getItem(this.STORAGE_KEYS.USER);
    return user ? JSON.parse(user) : null;
  },

  setUser(user) {
    localStorage.setItem(this.STORAGE_KEYS.USER, JSON.stringify(user));
  },

  getDeviceId() {
    let deviceId = localStorage.getItem(this.STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      // Generate device ID on first access
      deviceId = this.generateDeviceId();
      this.setDeviceId(deviceId);
    }
    return deviceId;
  },

  setDeviceId(deviceId) {
    localStorage.setItem(this.STORAGE_KEYS.DEVICE_ID, deviceId);
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  // Utilities
  generateDeviceId() {
    return 'dev_' + Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
  },

  getDeviceName() {
    const ua = navigator.userAgent;
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('iPad')) return 'iPad';
    if (ua.includes('Android')) return 'Android Device';
    if (ua.includes('Mac')) return 'Mac';
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Linux')) return 'Linux PC';
    return 'Web Browser';
  }
};

// Auto-initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    CalAuth.init().catch(err => {
      console.warn('[CalAuth] Auto-init failed:', err.message);
    });
  });
} else {
  CalAuth.init().catch(err => {
    console.warn('[CalAuth] Auto-init failed:', err.message);
  });
}

// Export for ES6 modules (optional)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalAuth;
}
