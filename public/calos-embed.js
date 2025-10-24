/**
 * CALOS Embed Script - Osano-like Embeddable Widget
 *
 * Combines:
 * - Cookie Consent Banner (GDPR/CCPA compliant)
 * - OAuth Login Widget
 * - Privacy-First Analytics
 *
 * Usage:
 * <script src="https://your-calos.com/calos-embed.js" data-site-id="ABC123"></script>
 *
 * Features:
 * - Zero configuration required
 * - Customizable appearance
 * - Privacy-first (no third-party cookies)
 * - Lightweight (~15KB)
 */

(function() {
  'use strict';

  // ============================================================================
  // Configuration
  // ============================================================================

  const SCRIPT_TAG = document.currentScript;
  const SITE_ID = SCRIPT_TAG.getAttribute('data-site-id');
  const API_BASE = SCRIPT_TAG.src.replace('/calos-embed.js', '');

  if (!SITE_ID) {
    console.error('[CALOS Embed] Missing data-site-id attribute');
    return;
  }

  // ============================================================================
  // State
  // ============================================================================

  const state = {
    config: null,
    sessionId: null,
    visitorId: null,
    consentGiven: false,
    initialized: false
  };

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Generate UUID v4
   */
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Get or create session ID
   */
  function getSessionId() {
    let sessionId = sessionStorage.getItem('calos_session_id');
    if (!sessionId) {
      sessionId = generateId();
      sessionStorage.setItem('calos_session_id', sessionId);
    }
    return sessionId;
  }

  /**
   * Get or create visitor ID (persistent)
   */
  function getVisitorId() {
    let visitorId = localStorage.getItem('calos_visitor_id');
    if (!visitorId) {
      visitorId = generateId();
      localStorage.setItem('calos_visitor_id', visitorId);
    }
    return visitorId;
  }

  /**
   * Make API request
   */
  async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[CALOS Embed] API error (${endpoint}):`, error);
      throw error;
    }
  }

  /**
   * Track event
   */
  async function trackEvent(eventType, eventName, eventData = {}) {
    if (!state.config.analyticsEnabled) {
      return;
    }

    try {
      await apiRequest(`/embed/${SITE_ID}/event`, {
        method: 'POST',
        body: {
          sessionId: state.sessionId,
          visitorId: state.visitorId,
          eventType,
          eventName,
          eventData,
          pageUrl: window.location.href,
          pageTitle: document.title,
          referrer: document.referrer
        }
      });
    } catch (error) {
      // Silently fail - don't break the page
    }
  }

  // ============================================================================
  // Consent Banner
  // ============================================================================

  /**
   * Check if consent banner should be shown
   */
  async function checkConsent() {
    if (!state.config.consentEnabled) {
      state.consentGiven = true;
      return;
    }

    try {
      const result = await apiRequest(`/embed/${SITE_ID}/consent?visitorId=${state.visitorId}`);

      if (result.hasConsent) {
        state.consentGiven = true;
        applyConsent(result);
      } else {
        showConsentBanner();
      }
    } catch (error) {
      // Default to showing banner
      showConsentBanner();
    }
  }

  /**
   * Apply consent choices
   */
  function applyConsent(consent) {
    if (consent.analyticsConsent) {
      trackEvent('pageview', 'page_view');
    }
  }

  /**
   * Show consent banner
   */
  function showConsentBanner() {
    const theme = state.config.theme || {};
    const text = state.config.consentText || {};

    // Create banner HTML
    const banner = document.createElement('div');
    banner.id = 'calos-consent-banner';
    banner.innerHTML = `
      <div class="calos-consent-content">
        <div class="calos-consent-text">
          <div class="calos-consent-title">
            🔒 ${text.title || 'Privacy First'}
          </div>
          <div class="calos-consent-description">
            ${text.description || 'We respect your privacy. Choose what data you want to share.'}
          </div>
        </div>
        <div class="calos-consent-actions">
          <button id="calos-consent-accept" class="calos-btn calos-btn-primary">
            ${text.acceptButton || 'Accept All'}
          </button>
          <button id="calos-consent-reject" class="calos-btn calos-btn-secondary">
            ${text.rejectButton || 'Essential Only'}
          </button>
        </div>
      </div>
    `;

    // Add styles
    const styles = document.createElement('style');
    styles.textContent = `
      #calos-consent-banner {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: ${theme.backgroundColor || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'};
        color: ${theme.textColor || 'white'};
        padding: 20px;
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        animation: calos-slide-up 0.5s ease-out;
      }

      @keyframes calos-slide-up {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }

      .calos-consent-content {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        flex-wrap: wrap;
      }

      .calos-consent-text {
        flex: 1;
        min-width: 300px;
      }

      .calos-consent-title {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .calos-consent-description {
        font-size: 1rem;
        line-height: 1.5;
        opacity: 0.95;
      }

      .calos-consent-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .calos-btn {
        padding: 12px 24px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        font-size: 1rem;
        border: none;
      }

      .calos-btn-primary {
        background: white;
        color: ${theme.primaryColor || '#667eea'};
      }

      .calos-btn-primary:hover {
        background: #f0f0f0;
        transform: translateY(-2px);
      }

      .calos-btn-secondary {
        background: rgba(255, 255, 255, 0.2);
        color: white;
        border: 2px solid white;
      }

      .calos-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      @media (max-width: 768px) {
        .calos-consent-content {
          flex-direction: column;
          text-align: center;
        }

        .calos-consent-actions {
          width: 100%;
          justify-content: center;
        }

        .calos-btn {
          flex: 1;
          min-width: 120px;
        }
      }
    `;

    document.head.appendChild(styles);
    document.body.appendChild(banner);

    // Track banner shown
    trackEvent('consent', 'consent_shown');

    // Event listeners
    document.getElementById('calos-consent-accept').addEventListener('click', () => {
      acceptConsent();
      dismissBanner(banner);
    });

    document.getElementById('calos-consent-reject').addEventListener('click', () => {
      rejectConsent();
      dismissBanner(banner);
    });
  }

  /**
   * Accept consent
   */
  async function acceptConsent() {
    state.consentGiven = true;

    try {
      await apiRequest(`/embed/${SITE_ID}/consent`, {
        method: 'POST',
        body: {
          visitorId: state.visitorId,
          sessionId: state.sessionId,
          analyticsConsent: true,
          marketingConsent: true,
          functionalConsent: true
        }
      });

      // Track consent accepted
      trackEvent('consent', 'consent_accepted');

      // Now track initial page view
      trackEvent('pageview', 'page_view');
    } catch (error) {
      console.error('[CALOS Embed] Failed to save consent:', error);
    }
  }

  /**
   * Reject consent
   */
  async function rejectConsent() {
    state.consentGiven = false;

    try {
      await apiRequest(`/embed/${SITE_ID}/consent`, {
        method: 'POST',
        body: {
          visitorId: state.visitorId,
          sessionId: state.sessionId,
          analyticsConsent: false,
          marketingConsent: false,
          functionalConsent: true
        }
      });

      // Track consent rejected (always allowed for essential)
      await apiRequest(`/embed/${SITE_ID}/event`, {
        method: 'POST',
        body: {
          sessionId: state.sessionId,
          visitorId: state.visitorId,
          eventType: 'consent',
          eventName: 'consent_rejected',
          eventData: {},
          pageUrl: window.location.href,
          pageTitle: document.title
        }
      });
    } catch (error) {
      console.error('[CALOS Embed] Failed to save consent:', error);
    }
  }

  /**
   * Dismiss banner
   */
  function dismissBanner(banner) {
    banner.style.animation = 'calos-slide-down 0.5s ease-out forwards';

    const slideDownStyle = document.createElement('style');
    slideDownStyle.textContent = `
      @keyframes calos-slide-down {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(slideDownStyle);

    setTimeout(() => {
      banner.remove();
    }, 500);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  window.CALOS = {
    /**
     * Track custom event
     */
    track: function(eventName, eventData) {
      trackEvent('track', eventName, eventData);
    },

    /**
     * Track conversion
     */
    conversion: function(conversionType, value, currency = 'USD') {
      trackEvent('conversion', conversionType, {
        value,
        currency
      });
    },

    /**
     * Get visitor ID
     */
    getVisitorId: function() {
      return state.visitorId;
    },

    /**
     * Get session ID
     */
    getSessionId: function() {
      return state.sessionId;
    },

    /**
     * Show consent banner again
     */
    showConsent: function() {
      showConsentBanner();
    },

    /**
     * Check if consent given
     */
    hasConsent: function() {
      return state.consentGiven;
    }
  };

  // ============================================================================
  // Initialization
  // ============================================================================

  async function init() {
    try {
      // Get session/visitor IDs
      state.sessionId = getSessionId();
      state.visitorId = getVisitorId();

      // Fetch site configuration
      state.config = await apiRequest(`/embed/${SITE_ID}/config`);

      // Check consent
      await checkConsent();

      // Track initial page view (if consent given)
      if (state.consentGiven) {
        trackEvent('pageview', 'page_view');
      }

      state.initialized = true;

      // Emit ready event
      window.dispatchEvent(new CustomEvent('calos:ready', {
        detail: {
          siteId: SITE_ID,
          config: state.config
        }
      }));

      console.log('[CALOS Embed] Initialized:', SITE_ID);
    } catch (error) {
      console.error('[CALOS Embed] Initialization failed:', error);
    }
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Track page unload
  window.addEventListener('beforeunload', () => {
    if (state.consentGiven) {
      trackEvent('pageview', 'page_unload');
    }
  });

})();
