/**
 * CalOS Swiper SDK
 * JavaScript SDK for embedding profile swiper functionality
 *
 * Usage:
 *   const sdk = new CalOSSwiperSDK({
 *     clientId: 'your-api-key',
 *     apiEndpoint: 'https://api.calos.ai',
 *     mode: 'embed' // or 'headless', 'quick-action'
 *   });
 *
 *   // Generate profile
 *   const profile = await sdk.generate();
 *
 *   // Record swipe
 *   await sdk.swipe(profile, 'right');
 */

class CalOSSwiperSDK {
  constructor(config) {
    // Required config
    if (!config.clientId) {
      throw new Error('CalOSSwiperSDK: clientId is required');
    }

    this.clientId = config.clientId;
    this.apiEndpoint = config.apiEndpoint || 'http://localhost:5001';
    this.mode = config.mode || 'embed';
    this.containerId = config.containerId || 'calos-swiper-container';
    this.sessionId = config.sessionId || this._generateSessionId();

    // UI config
    this.theme = config.theme || 'dark';
    this.accentColor = config.accentColor || '#4CAF50';
    this.onSwipe = config.onSwipe || null;
    this.onMatch = config.onMatch || null;
    this.onError = config.onError || null;

    // Profile generation options
    this.weighted = config.weighted !== undefined ? config.weighted : true;
    this.countryCode = config.countryCode || null;

    // State
    this.currentProfile = null;
    this.isInitialized = false;
  }

  /**
   * Initialize SDK
   */
  async init() {
    try {
      if (this.mode === 'embed') {
        await this._initEmbedMode();
      }
      this.isInitialized = true;
      console.log('[CalOS Swiper] SDK initialized in', this.mode, 'mode');
    } catch (error) {
      console.error('[CalOS Swiper] Initialization error:', error);
      if (this.onError) this.onError(error);
      throw error;
    }
  }

  /**
   * Generate new profile
   */
  async generate(options = {}) {
    try {
      const params = new URLSearchParams({
        weighted: options.weighted !== undefined ? options.weighted : this.weighted,
        sessionId: this.sessionId
      });

      if (options.countryCode || this.countryCode) {
        params.append('countryCode', options.countryCode || this.countryCode);
      }

      const response = await fetch(
        `${this.apiEndpoint}/api/swiper/profile?${params}`,
        {
          headers: {
            'X-API-Key': this.clientId,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate profile');
      }

      const data = await response.json();
      this.currentProfile = data.profile;

      if (this.mode === 'embed') {
        this._renderProfile(this.currentProfile);
      }

      return this.currentProfile;

    } catch (error) {
      console.error('[CalOS Swiper] Generate error:', error);
      if (this.onError) this.onError(error);
      throw error;
    }
  }

  /**
   * Record swipe action
   */
  async swipe(profile, direction) {
    try {
      if (!['left', 'right'].includes(direction)) {
        throw new Error('Direction must be "left" or "right"');
      }

      const response = await fetch(`${this.apiEndpoint}/api/swiper/swipe`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.clientId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          profile: profile || this.currentProfile,
          direction
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to record swipe');
      }

      const data = await response.json();

      if (this.onSwipe) {
        this.onSwipe(direction, profile || this.currentProfile);
      }

      if (direction === 'right' && this.onMatch) {
        this.onMatch(data.match);
      }

      return data;

    } catch (error) {
      console.error('[CalOS Swiper] Swipe error:', error);
      if (this.onError) this.onError(error);
      throw error;
    }
  }

  /**
   * Get all matches
   */
  async getMatches(limit = 50) {
    try {
      const response = await fetch(
        `${this.apiEndpoint}/api/swiper/matches?sessionId=${this.sessionId}&limit=${limit}`,
        {
          headers: {
            'X-API-Key': this.clientId
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get matches');
      }

      const data = await response.json();
      return data.matches;

    } catch (error) {
      console.error('[CalOS Swiper] Get matches error:', error);
      if (this.onError) this.onError(error);
      throw error;
    }
  }

  /**
   * Get statistics
   */
  async getStats() {
    try {
      const response = await fetch(
        `${this.apiEndpoint}/api/swiper/stats?sessionId=${this.sessionId}`,
        {
          headers: {
            'X-API-Key': this.clientId
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get stats');
      }

      const data = await response.json();
      return data.stats;

    } catch (error) {
      console.error('[CalOS Swiper] Get stats error:', error);
      if (this.onError) this.onError(error);
      throw error;
    }
  }

  /**
   * Export matches
   */
  async export(format = 'json') {
    try {
      if (!['json', 'csv', 'vcard'].includes(format)) {
        throw new Error('Format must be "json", "csv", or "vcard"');
      }

      const response = await fetch(`${this.apiEndpoint}/api/swiper/export`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.clientId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          format
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to export matches');
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('[CalOS Swiper] Export error:', error);
      if (this.onError) this.onError(error);
      throw error;
    }
  }

  /**
   * Download export as file
   */
  async downloadExport(format = 'json', filename = null) {
    try {
      const exportData = await this.export(format);

      if (!filename) {
        filename = `calos-matches-${Date.now()}.${format}`;
      }

      const blob = new Blob([exportData.data], {
        type: format === 'json' ? 'application/json' :
              format === 'csv' ? 'text/csv' :
              'text/vcard'
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('[CalOS Swiper] Download error:', error);
      if (this.onError) this.onError(error);
      throw error;
    }
  }

  /**
   * Initialize embed mode - renders UI in container
   */
  async _initEmbedMode() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      throw new Error(`Container element #${this.containerId} not found`);
    }

    // Inject styles
    this._injectStyles();

    // Create UI structure
    container.innerHTML = `
      <div class="calos-swiper-sdk" data-theme="${this.theme}">
        <div class="calos-swiper-header">
          <div class="calos-stats">
            <div class="calos-stat">
              <span class="calos-stat-value" id="calos-total-swipes">0</span>
              <span class="calos-stat-label">Swipes</span>
            </div>
            <div class="calos-stat">
              <span class="calos-stat-value" id="calos-matches">0</span>
              <span class="calos-stat-label">Matches</span>
            </div>
          </div>
        </div>

        <div class="calos-card-container">
          <div class="calos-card" id="calos-profile-card">
            <!-- Profile will be rendered here -->
          </div>
        </div>

        <div class="calos-controls">
          <button class="calos-btn calos-btn-reject" id="calos-swipe-left">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <button class="calos-btn calos-btn-accept" id="calos-swipe-right">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>
      </div>
    `;

    // Add event listeners
    document.getElementById('calos-swipe-left').addEventListener('click', () => {
      this._animateSwipe('left');
    });

    document.getElementById('calos-swipe-right').addEventListener('click', () => {
      this._animateSwipe('right');
    });

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        this._animateSwipe('left');
      } else if (e.key === 'ArrowRight') {
        this._animateSwipe('right');
      }
    });

    // Load initial profile and stats
    await this.generate();
    await this._updateStats();
  }

  /**
   * Render profile in card
   */
  _renderProfile(profile) {
    const card = document.getElementById('calos-profile-card');
    if (!card) return;

    card.innerHTML = `
      <div class="calos-profile">
        <h2 class="calos-profile-name">${profile.full_name}</h2>
        <div class="calos-profile-details">
          <div class="calos-profile-field">
            <span class="calos-profile-label">Email</span>
            <span class="calos-profile-value">${profile.email}</span>
          </div>
          <div class="calos-profile-field">
            <span class="calos-profile-label">Phone</span>
            <span class="calos-profile-value">${profile.phone}</span>
          </div>
          <div class="calos-profile-field">
            <span class="calos-profile-label">Domain</span>
            <span class="calos-profile-value">${profile.domain}</span>
          </div>
          ${profile.match_score ? `
          <div class="calos-profile-score">
            <div class="calos-score-bar">
              <div class="calos-score-fill" style="width: ${profile.match_score}%"></div>
            </div>
            <span class="calos-score-label">Match Score: ${profile.match_score}/100</span>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Animate swipe and record action
   */
  async _animateSwipe(direction) {
    const card = document.getElementById('calos-profile-card');
    if (!card) return;

    card.classList.add(`calos-swipe-${direction}`);

    setTimeout(async () => {
      await this.swipe(this.currentProfile, direction);
      card.classList.remove(`calos-swipe-${direction}`);
      await this.generate();
      await this._updateStats();
    }, 400);
  }

  /**
   * Update stats display
   */
  async _updateStats() {
    try {
      const stats = await this.getStats();

      const totalSwipesEl = document.getElementById('calos-total-swipes');
      const matchesEl = document.getElementById('calos-matches');

      if (totalSwipesEl) totalSwipesEl.textContent = stats.total_swipes || 0;
      if (matchesEl) matchesEl.textContent = stats.matches || 0;

    } catch (error) {
      console.error('[CalOS Swiper] Update stats error:', error);
    }
  }

  /**
   * Inject CSS styles
   */
  _injectStyles() {
    if (document.getElementById('calos-swiper-styles')) return;

    const style = document.createElement('style');
    style.id = 'calos-swiper-styles';
    style.textContent = `
      .calos-swiper-sdk {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 500px;
        margin: 0 auto;
        padding: 20px;
      }

      .calos-swiper-sdk[data-theme="dark"] {
        background: #1a1a1a;
        color: #fff;
      }

      .calos-swiper-header {
        margin-bottom: 20px;
      }

      .calos-stats {
        display: flex;
        gap: 20px;
        justify-content: center;
      }

      .calos-stat {
        text-align: center;
      }

      .calos-stat-value {
        display: block;
        font-size: 2em;
        font-weight: bold;
        color: ${this.accentColor};
      }

      .calos-stat-label {
        display: block;
        font-size: 0.9em;
        opacity: 0.7;
      }

      .calos-card-container {
        position: relative;
        height: 400px;
        margin-bottom: 20px;
      }

      .calos-card {
        position: absolute;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #252525 0%, #2a2a2a 100%);
        border: 2px solid #333;
        border-radius: 20px;
        padding: 40px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        transition: transform 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .calos-card.calos-swipe-left {
        animation: calosSwipeLeft 0.4s ease-out;
      }

      .calos-card.calos-swipe-right {
        animation: calosSwipeRight 0.4s ease-out;
      }

      @keyframes calosSwipeLeft {
        0% { transform: translateX(0) rotate(0deg); opacity: 1; }
        100% { transform: translateX(-150%) rotate(-30deg); opacity: 0; }
      }

      @keyframes calosSwipeRight {
        0% { transform: translateX(0) rotate(0deg); opacity: 1; }
        100% { transform: translateX(150%) rotate(30deg); opacity: 0; }
      }

      .calos-profile {
        width: 100%;
      }

      .calos-profile-name {
        font-size: 2em;
        margin: 0 0 20px 0;
        text-align: center;
      }

      .calos-profile-details {
        display: flex;
        flex-direction: column;
        gap: 15px;
      }

      .calos-profile-field {
        display: flex;
        justify-content: space-between;
        padding: 10px;
        background: rgba(255,255,255,0.05);
        border-radius: 8px;
      }

      .calos-profile-label {
        opacity: 0.7;
        font-size: 0.9em;
      }

      .calos-profile-value {
        font-weight: 600;
      }

      .calos-profile-score {
        margin-top: 10px;
      }

      .calos-score-bar {
        height: 8px;
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 5px;
      }

      .calos-score-fill {
        height: 100%;
        background: ${this.accentColor};
        transition: width 0.3s ease;
      }

      .calos-score-label {
        font-size: 0.9em;
        opacity: 0.7;
      }

      .calos-controls {
        display: flex;
        gap: 20px;
        justify-content: center;
      }

      .calos-btn {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }

      .calos-btn:hover {
        transform: scale(1.1);
      }

      .calos-btn-reject {
        background: #f44336;
        color: white;
      }

      .calos-btn-accept {
        background: ${this.accentColor};
        color: white;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Generate unique session ID
   */
  _generateSessionId() {
    return 'sdk_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalOSSwiperSDK;
} else {
  window.CalOSSwiperSDK = CalOSSwiperSDK;
}
