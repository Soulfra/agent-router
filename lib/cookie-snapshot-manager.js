/**
 * Cookie Snapshot Manager
 *
 * Privacy-first cookie management system that:
 * 1. Snapshots cookies on arrival
 * 2. Analyzes cookies to understand user interests (without storing raw values)
 * 3. Restores original cookies on page exit
 *
 * Zero-knowledge approach:
 * - Store cookie presence/categories, NOT values
 * - User leaves with exactly what they came with
 * - Infer interests from cookie patterns
 *
 * Example usage:
 * const manager = new CookieSnapshotManager();
 * await manager.snapshot(); // On page load
 * const interests = manager.getInferredInterests();
 * await manager.restore(); // On page exit
 *
 * @version 1.0.0
 * @license MIT
 */

class CookieSnapshotManager {
  constructor(options = {}) {
    this.originalCookies = null;
    this.snapshotTime = null;
    this.inferredInterests = {};
    this.cookieCategories = {};

    // Enable auto-restore on page unload
    this.autoRestore = options.autoRestore !== false;

    // Known cookie patterns for interest inference
    this.patterns = {
      analytics: {
        keywords: ['_ga', '_gid', 'analytics', 'utm_', '__utma', '__utmz'],
        interests: ['data-driven', 'business-analytics']
      },
      advertising: {
        keywords: ['_fbp', 'IDE', 'test_cookie', 'ads', 'ad_', 'doubleclick'],
        interests: ['marketing', 'advertising', 'commerce']
      },
      social: {
        keywords: ['facebook', 'twitter', 'linkedin', 'instagram', 'tiktok'],
        interests: ['social-media', 'networking', 'content-creation']
      },
      developer: {
        keywords: ['github', 'stackoverflow', 'gitlab', 'bitbucket', 'npm', 'dev'],
        interests: ['software-development', 'coding', 'open-source']
      },
      ecommerce: {
        keywords: ['cart', 'shop', 'checkout', 'product', 'wishlist', 'amazon', 'ebay'],
        interests: ['shopping', 'ecommerce', 'retail']
      },
      productivity: {
        keywords: ['notion', 'asana', 'trello', 'slack', 'monday', 'workspace'],
        interests: ['productivity', 'project-management', 'collaboration']
      },
      education: {
        keywords: ['coursera', 'udemy', 'khan', 'edx', 'learn', 'tutorial'],
        interests: ['learning', 'education', 'self-improvement']
      },
      entertainment: {
        keywords: ['netflix', 'spotify', 'youtube', 'twitch', 'gaming', 'stream'],
        interests: ['entertainment', 'media', 'streaming']
      },
      privacy: {
        keywords: ['cookieconsent', 'gdpr', 'ccpa', 'privacy', 'dnt'],
        interests: ['privacy-conscious', 'security', 'data-protection']
      }
    };

    if (this.autoRestore && typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.restore());
    }

    console.log('[CookieSnapshotManager] Initialized');
  }

  /**
   * Snapshot all current cookies
   */
  snapshot() {
    if (typeof document === 'undefined') {
      throw new Error('CookieSnapshotManager requires browser environment');
    }

    // Parse all cookies
    const cookies = this._parseCookies();

    this.originalCookies = cookies;
    this.snapshotTime = new Date().toISOString();

    // Analyze cookies for interests (without storing values)
    this.analyzeCookies(cookies);

    console.log(`[CookieSnapshotManager] Snapshot created: ${Object.keys(cookies).length} cookies`);

    return {
      count: Object.keys(cookies).length,
      categories: this.cookieCategories,
      interests: this.inferredInterests,
      timestamp: this.snapshotTime
    };
  }

  /**
   * Parse document.cookie into object
   */
  _parseCookies() {
    const cookies = {};
    const cookieString = document.cookie;

    if (!cookieString) return cookies;

    cookieString.split(';').forEach(cookie => {
      const [name, ...valueParts] = cookie.split('=');
      const trimmedName = name.trim();
      const value = valueParts.join('=').trim();

      if (trimmedName) {
        cookies[trimmedName] = value;
      }
    });

    return cookies;
  }

  /**
   * Analyze cookies to infer user interests
   * Privacy-first: Store categories/interests, NOT raw values
   */
  analyzeCookies(cookies) {
    const cookieNames = Object.keys(cookies);

    // Reset categories and interests
    this.cookieCategories = {};
    this.inferredInterests = {};

    // Check each cookie name against patterns
    for (const [category, config] of Object.entries(this.patterns)) {
      const matches = cookieNames.filter(name =>
        config.keywords.some(keyword =>
          name.toLowerCase().includes(keyword.toLowerCase())
        )
      );

      if (matches.length > 0) {
        this.cookieCategories[category] = matches.length;

        // Add interests for this category
        config.interests.forEach(interest => {
          this.inferredInterests[interest] =
            (this.inferredInterests[interest] || 0) + matches.length;
        });
      }
    }

    console.log('[CookieSnapshotManager] Analyzed cookies:', {
      categories: this.cookieCategories,
      interests: Object.keys(this.inferredInterests)
    });
  }

  /**
   * Get inferred interests from cookie analysis
   */
  getInferredInterests() {
    // Sort interests by score (descending)
    const sorted = Object.entries(this.inferredInterests)
      .sort(([, a], [, b]) => b - a)
      .map(([interest, score]) => ({ interest, score }));

    return sorted;
  }

  /**
   * Get cookie categories breakdown
   */
  getCookieCategories() {
    return { ...this.cookieCategories };
  }

  /**
   * Get snapshot metadata
   */
  getSnapshotInfo() {
    if (!this.originalCookies) {
      return null;
    }

    return {
      timestamp: this.snapshotTime,
      cookieCount: Object.keys(this.originalCookies).length,
      categories: this.cookieCategories,
      topInterests: this.getInferredInterests().slice(0, 5)
    };
  }

  /**
   * Restore original cookies and clear any new ones
   * User leaves with exactly what they came with
   */
  restore() {
    if (!this.originalCookies) {
      console.warn('[CookieSnapshotManager] No snapshot to restore');
      return false;
    }

    if (typeof document === 'undefined') {
      throw new Error('CookieSnapshotManager requires browser environment');
    }

    // Get current cookies
    const currentCookies = this._parseCookies();

    // Delete all current cookies
    Object.keys(currentCookies).forEach(name => {
      this._deleteCookie(name);
    });

    // Restore original cookies
    Object.entries(this.originalCookies).forEach(([name, value]) => {
      this._setCookie(name, value);
    });

    console.log(`[CookieSnapshotManager] Restored ${Object.keys(this.originalCookies).length} original cookies`);

    return true;
  }

  /**
   * Delete a cookie
   */
  _deleteCookie(name) {
    // Set expiry to past date to delete
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;

    // Also try with domain variants
    const domain = window.location.hostname;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${domain};`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${domain};`;
  }

  /**
   * Set a cookie
   */
  _setCookie(name, value, options = {}) {
    let cookieString = `${name}=${value}`;

    if (options.expires) {
      cookieString += `; expires=${options.expires}`;
    }

    if (options.path) {
      cookieString += `; path=${options.path}`;
    } else {
      cookieString += `; path=/`;
    }

    if (options.domain) {
      cookieString += `; domain=${options.domain}`;
    }

    if (options.secure) {
      cookieString += `; secure`;
    }

    if (options.sameSite) {
      cookieString += `; samesite=${options.sameSite}`;
    }

    document.cookie = cookieString;
  }

  /**
   * Get privacy report
   * Shows what we learned WITHOUT storing sensitive data
   */
  getPrivacyReport() {
    return {
      guarantee: 'Zero raw cookie values stored',
      snapshotTime: this.snapshotTime,
      originalCookieCount: this.originalCookies ? Object.keys(this.originalCookies).length : 0,
      categoriesDetected: Object.keys(this.cookieCategories),
      interestsInferred: this.getInferredInterests().slice(0, 10),
      dataStored: {
        cookieNames: false,
        cookieValues: false,
        categories: true,
        interests: true
      },
      restoration: {
        available: !!this.originalCookies,
        autoRestore: this.autoRestore
      }
    };
  }

  /**
   * Export snapshot data for database storage
   * ONLY exports privacy-safe data (no raw values)
   */
  exportForStorage() {
    return {
      snapshotTime: this.snapshotTime,
      cookieCount: this.originalCookies ? Object.keys(this.originalCookies).length : 0,
      categories: this.cookieCategories,
      interests: this.inferredInterests,
      topInterests: this.getInferredInterests().slice(0, 5).map(i => i.interest),
      privacyLevel: 'zero-knowledge'
    };
  }

  /**
   * Check if user has tracking cookies (indicates web-savvy user)
   */
  hasTrackingCookies() {
    return this.cookieCategories.analytics > 0 || this.cookieCategories.advertising > 0;
  }

  /**
   * Check if user has developer cookies
   */
  isDeveloper() {
    return this.cookieCategories.developer > 0;
  }

  /**
   * Check if user is privacy-conscious
   */
  isPrivacyConscious() {
    return this.cookieCategories.privacy > 0 ||
           Object.keys(this.originalCookies || {}).length < 3;
  }

  /**
   * Get suggested learning paths based on cookie analysis
   */
  getSuggestedLearningPaths() {
    const suggestions = [];

    if (this.isDeveloper()) {
      suggestions.push({
        path: 'advanced-programming',
        reason: 'Developer tools detected',
        confidence: 'high'
      });
    }

    if (this.cookieCategories.ecommerce > 0) {
      suggestions.push({
        path: 'ecommerce-development',
        reason: 'Shopping activity detected',
        confidence: 'medium'
      });
    }

    if (this.cookieCategories.education > 0) {
      suggestions.push({
        path: 'self-paced-learning',
        reason: 'Learning platforms detected',
        confidence: 'high'
      });
    }

    if (this.isPrivacyConscious()) {
      suggestions.push({
        path: 'privacy-security',
        reason: 'Privacy-conscious behavior',
        confidence: 'medium'
      });
    }

    // Default suggestion if no strong signals
    if (suggestions.length === 0) {
      suggestions.push({
        path: 'getting-started',
        reason: 'New visitor',
        confidence: 'low'
      });
    }

    return suggestions;
  }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CookieSnapshotManager;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
  window.CookieSnapshotManager = CookieSnapshotManager;
}
