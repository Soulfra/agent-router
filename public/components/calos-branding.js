/**
 * CALOS Branding Client-Side Component
 *
 * Purpose:
 * - Detect if branding is required (based on license tier)
 * - Re-inject branding if user tries to remove it (Community tier)
 * - Monitor DOM for branding removal attempts
 * - Enforce branding rules on client-side
 *
 * Branding Levels:
 * - Full: Logo + footer (calos.sh domains)
 * - Minimal: Footer only ("Powered by CALOS" - Community tier)
 * - None: No branding (Pro/Enterprise tier)
 *
 * This script is loaded automatically when branding is required.
 */

(function() {
  'use strict';

  /**
   * CALOS Branding Manager
   */
  class CALOSBranding {
    constructor() {
      // Get branding level from server
      this.brandingLevel = this.detectBrandingLevel();
      this.brandingRequired = this.isBrandingRequired();

      // Track if branding is currently injected
      this.brandingInjected = false;

      // Observer for DOM changes
      this.observer = null;

      console.log(`[CALOSBranding] Branding level: ${this.brandingLevel}`);
      console.log(`[CALOSBranding] Branding required: ${this.brandingRequired}`);
    }

    /**
     * Detect branding level from server headers
     *
     * @returns {string} - Branding level (full, minimal, none)
     */
    detectBrandingLevel() {
      // Check for meta tag (injected by server)
      const metaTag = document.querySelector('meta[name="calos-branding-level"]');
      if (metaTag) {
        return metaTag.getAttribute('content');
      }

      // Check for branding elements in DOM
      const fullBranding = document.querySelector('[data-branding-level="full"]');
      if (fullBranding) return 'full';

      const minimalBranding = document.querySelector('[data-branding-level="minimal"]');
      if (minimalBranding) return 'minimal';

      return 'none';
    }

    /**
     * Check if branding is required (can't be removed)
     *
     * @returns {boolean}
     */
    isBrandingRequired() {
      const metaTag = document.querySelector('meta[name="calos-branding-required"]');
      if (metaTag) {
        return metaTag.getAttribute('content') === 'true';
      }

      // If branding level is full or minimal, assume it's required
      return this.brandingLevel === 'full' || this.brandingLevel === 'minimal';
    }

    /**
     * Initialize branding system
     */
    init() {
      if (!this.brandingRequired) {
        console.log('[CALOSBranding] No branding required (white-label mode)');
        return;
      }

      // Ensure branding is present
      this.ensureBrandingPresent();

      // Start monitoring for removal attempts
      this.startMonitoring();

      console.log('[CALOSBranding] Initialized');
    }

    /**
     * Ensure branding is present in DOM
     */
    ensureBrandingPresent() {
      const brandingExists = this.checkBrandingExists();

      if (!brandingExists) {
        console.warn('[CALOSBranding] Branding missing! Re-injecting...');
        this.injectBranding();
      } else {
        this.brandingInjected = true;
      }
    }

    /**
     * Check if branding exists in DOM
     *
     * @returns {boolean}
     */
    checkBrandingExists() {
      if (this.brandingLevel === 'full') {
        const header = document.querySelector('.calos-branding-header[data-branding-level="full"]');
        const footer = document.querySelector('.calos-branding-footer[data-branding-level="full"]');
        return !!(header && footer);
      }

      if (this.brandingLevel === 'minimal') {
        const footer = document.querySelector('.calos-branding-footer[data-branding-level="minimal"]');
        return !!footer;
      }

      return true;  // No branding = always "exists"
    }

    /**
     * Inject branding into DOM
     */
    injectBranding() {
      if (this.brandingLevel === 'full') {
        this.injectFullBranding();
      } else if (this.brandingLevel === 'minimal') {
        this.injectMinimalBranding();
      }

      this.brandingInjected = true;
    }

    /**
     * Inject full branding (logo + footer)
     */
    injectFullBranding() {
      // Header branding
      const existingHeader = document.querySelector('.calos-branding-header');
      if (!existingHeader) {
        const header = this.createFullHeader();
        document.body.insertBefore(header, document.body.firstChild);
      }

      // Footer branding
      const existingFooter = document.querySelector('.calos-branding-footer');
      if (!existingFooter) {
        const footer = this.createFullFooter();
        document.body.appendChild(footer);
      }
    }

    /**
     * Inject minimal branding (footer only)
     */
    injectMinimalBranding() {
      const existingFooter = document.querySelector('.calos-branding-footer');
      if (!existingFooter) {
        const footer = this.createMinimalFooter();
        document.body.appendChild(footer);
      }
    }

    /**
     * Create full header element
     *
     * @returns {HTMLElement}
     */
    createFullHeader() {
      const header = document.createElement('div');
      header.className = 'calos-branding-header';
      header.setAttribute('data-branding-level', 'full');
      header.innerHTML = `
        <a href="https://calos.sh" class="calos-logo-link">
          <svg class="calos-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="calos-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="45" fill="url(#calos-gradient)" />
            <text x="50" y="65" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="white" text-anchor="middle">C</text>
          </svg>
          <span class="calos-logo-text">CALOS</span>
        </a>
      `;
      return header;
    }

    /**
     * Create full footer element
     *
     * @returns {HTMLElement}
     */
    createFullFooter() {
      const footer = document.createElement('div');
      footer.className = 'calos-branding-footer';
      footer.setAttribute('data-branding-level', 'full');
      footer.innerHTML = `
        <div class="calos-footer-content">
          <div class="calos-footer-logo">
            <svg class="calos-logo-small" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="calos-gradient-footer" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="45" fill="url(#calos-gradient-footer)" />
              <text x="50" y="65" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="white" text-anchor="middle">C</text>
            </svg>
          </div>
          <div class="calos-footer-text">
            <p><strong>Powered by CALOS</strong></p>
            <p class="calos-footer-tagline">Open source • Self-host free • Fair trade</p>
          </div>
          <div class="calos-footer-links">
            <a href="https://calos.sh" target="_blank">Home</a>
            <a href="https://calos.sh/marketplace" target="_blank">Marketplace</a>
            <a href="https://calos.sh/pricing" target="_blank">Pricing</a>
            <a href="https://docs.calos.sh" target="_blank">Docs</a>
            <a href="https://github.com/calos/agent-router" target="_blank">GitHub</a>
          </div>
        </div>
      `;
      return footer;
    }

    /**
     * Create minimal footer element
     *
     * @returns {HTMLElement}
     */
    createMinimalFooter() {
      const footer = document.createElement('div');
      footer.className = 'calos-branding-footer calos-branding-minimal';
      footer.setAttribute('data-branding-level', 'minimal');
      footer.innerHTML = `
        <p class="calos-footer-minimal-text">
          Powered by <a href="https://calos.sh" target="_blank" class="calos-link">CALOS</a>
          • <a href="https://calos.sh/pricing" target="_blank" class="calos-link">Upgrade to remove this</a>
        </p>
      `;
      return footer;
    }

    /**
     * Start monitoring DOM for branding removal
     */
    startMonitoring() {
      if (!this.brandingRequired) return;

      // Use MutationObserver to detect branding removal
      this.observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
            // Check if any removed node was branding
            for (const node of mutation.removedNodes) {
              if (node.classList &&
                  (node.classList.contains('calos-branding-header') ||
                   node.classList.contains('calos-branding-footer'))) {
                console.warn('[CALOSBranding] Branding removed! Re-injecting in 1 second...');

                // Re-inject after short delay
                setTimeout(() => {
                  this.ensureBrandingPresent();
                }, 1000);
              }
            }
          }
        }
      });

      // Start observing
      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Also check every 5 seconds (backup)
      setInterval(() => {
        this.ensureBrandingPresent();
      }, 5000);

      console.log('[CALOSBranding] Monitoring started');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
        console.log('[CALOSBranding] Monitoring stopped');
      }
    }

    /**
     * Get branding info
     *
     * @returns {Object}
     */
    getInfo() {
      return {
        level: this.brandingLevel,
        required: this.brandingRequired,
        injected: this.brandingInjected,
        exists: this.checkBrandingExists()
      };
    }
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.calosBranding = new CALOSBranding();
      window.calosBranding.init();
    });
  } else {
    window.calosBranding = new CALOSBranding();
    window.calosBranding.init();
  }

  // Export for manual control
  window.CALOSBranding = CALOSBranding;

  // Prevent tampering (freeze class)
  if (Object.freeze) {
    Object.freeze(CALOSBranding.prototype);
  }

})();
