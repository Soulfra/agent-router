/**
 * Session Heartbeat Client
 *
 * Sends 5-second timer updates to detect bounces and track active sessions.
 *
 * Usage:
 *   <script src="/js/heartbeat-client.js"></script>
 *   <script>
 *     const heartbeat = new SessionHeartbeat({
 *       interval: 5000, // 5 seconds
 *       endpoint: '/api/session/heartbeat'
 *     });
 *     heartbeat.start();
 *   </script>
 */

class SessionHeartbeat {
  constructor(options = {}) {
    this.interval = options.interval || 5000; // 5 seconds
    this.endpoint = options.endpoint || '/api/session/heartbeat';
    this.sessionId = this.getOrCreateSessionId();
    this.intervalId = null;
    this.heartbeatCount = 0;
    this.interactionCount = 0;

    // Track affiliate code from URL
    this.affiliateCode = this.getUrlParam('ref') || this.getUrlParam('affiliate');
    this.campaignId = this.getUrlParam('campaign') || this.getUrlParam('utm_campaign');
    this.referralSource = this.getUrlParam('source') || this.getUrlParam('utm_source');

    // Bind methods
    this.sendHeartbeat = this.sendHeartbeat.bind(this);
    this.trackInteraction = this.trackInteraction.bind(this);
    this.beforeUnload = this.beforeUnload.bind(this);
  }

  /**
   * Start sending heartbeats
   */
  start() {
    console.log('[Heartbeat] Starting session:', this.sessionId);

    // Send initial heartbeat immediately
    this.sendHeartbeat();

    // Send heartbeat every 5 seconds
    this.intervalId = setInterval(this.sendHeartbeat, this.interval);

    // Track interactions
    this.setupInteractionTracking();

    // Handle page unload
    window.addEventListener('beforeunload', this.beforeUnload);

    // Handle page visibility
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.sendHeartbeat();
      }
    });
  }

  /**
   * Stop sending heartbeats
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    window.removeEventListener('beforeunload', this.beforeUnload);
    console.log('[Heartbeat] Stopped');
  }

  /**
   * Send heartbeat to server
   */
  async sendHeartbeat() {
    try {
      const metadata = {
        sessionId: this.sessionId,
        page: window.location.pathname,
        heartbeatCount: this.heartbeatCount,
        interactionCount: this.interactionCount,
        affiliateCode: this.affiliateCode,
        campaignId: this.campaignId,
        referralSource: this.referralSource,
        timestamp: Date.now()
      };

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata),
        keepalive: true // Important for sending during page unload
      });

      if (response.ok) {
        this.heartbeatCount++;
        console.log(`[Heartbeat] #${this.heartbeatCount} sent`);
      } else {
        console.error('[Heartbeat] Failed:', response.status);
      }

    } catch (error) {
      console.error('[Heartbeat] Error:', error.message);
    }
  }

  /**
   * Setup interaction tracking
   */
  setupInteractionTracking() {
    // Track clicks
    document.addEventListener('click', this.trackInteraction);

    // Track keypresses
    document.addEventListener('keydown', this.trackInteraction);

    // Track scrolling
    let scrollTimeout;
    document.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(this.trackInteraction, 300);
    });

    // Track mouse movement (debounced)
    let mouseMoveTimeout;
    document.addEventListener('mousemove', () => {
      clearTimeout(mouseMoveTimeout);
      mouseMoveTimeout = setTimeout(this.trackInteraction, 1000);
    });
  }

  /**
   * Track user interaction
   */
  trackInteraction() {
    this.interactionCount++;
  }

  /**
   * Handle before unload
   */
  beforeUnload() {
    // Send final heartbeat
    const metadata = {
      sessionId: this.sessionId,
      page: window.location.pathname,
      heartbeatCount: this.heartbeatCount,
      interactionCount: this.interactionCount,
      endSession: true,
      timestamp: Date.now()
    };

    // Use sendBeacon for reliable delivery during page unload
    navigator.sendBeacon(
      this.endpoint,
      JSON.stringify(metadata)
    );
  }

  /**
   * Get or create session ID
   */
  getOrCreateSessionId() {
    // Check URL params first (for cross-domain tracking)
    let sessionId = this.getUrlParam('sid');

    if (!sessionId) {
      // Try to get from sessionStorage
      sessionId = sessionStorage.getItem('calos_session_id');
    }

    if (!sessionId) {
      // Generate new UUID
      sessionId = this.generateUUID();
      sessionStorage.setItem('calos_session_id', sessionId);
    }

    // Also store in URL for cross-domain tracking
    this.updateUrlWithSessionId(sessionId);

    return sessionId;
  }

  /**
   * Get URL parameter
   */
  getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  /**
   * Update URL with session ID (for cross-domain tracking)
   */
  updateUrlWithSessionId(sessionId) {
    const url = new URL(window.location.href);

    // Only add if not already present
    if (!url.searchParams.has('sid')) {
      url.searchParams.set('sid', sessionId);

      // Update URL without reload
      window.history.replaceState({}, '', url.toString());
    }
  }

  /**
   * Generate UUID (simple version)
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Get session statistics
   */
  getStats() {
    return {
      sessionId: this.sessionId,
      heartbeatCount: this.heartbeatCount,
      interactionCount: this.interactionCount,
      affiliateCode: this.affiliateCode,
      campaignId: this.campaignId,
      referralSource: this.referralSource
    };
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionHeartbeat;
}

// Auto-start if configured
if (typeof window !== 'undefined') {
  // Check if auto-start is enabled
  const autoStart = document.querySelector('script[src*="heartbeat-client.js"]')?.dataset?.autoStart;

  if (autoStart === 'true') {
    window.addEventListener('DOMContentLoaded', () => {
      window.sessionHeartbeat = new SessionHeartbeat();
      window.sessionHeartbeat.start();
    });
  }
}
