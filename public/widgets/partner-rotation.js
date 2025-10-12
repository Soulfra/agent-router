/**
 * Partner Rotation Widget
 *
 * Displays rotating partner sites from Matthew Mauer's domain portfolio
 * Different partners shown on each page load or daily rotation
 */

class PartnerRotationWidget {
  constructor(containerId = 'partner-rotation-widget') {
    this.containerId = containerId;
    this.sessionId = this.getOrCreateSessionId();
  }

  /**
   * Get or create anonymous session ID
   */
  getOrCreateSessionId() {
    let sessionId = sessionStorage.getItem('partner_session_id');
    if (!sessionId) {
      sessionId = this.generateUUID();
      sessionStorage.setItem('partner_session_id', sessionId);
    }
    return sessionId;
  }

  /**
   * Generate UUID v4
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Load partners for the current domain
   */
  async load(currentDomain, count = 4) {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Container #${this.containerId} not found`);
      return;
    }

    try {
      // Show loading state
      container.innerHTML = this.renderLoading();

      // Fetch partner suggestions
      const response = await fetch(`/api/domains/partners?domain=${currentDomain}&count=${count}`);
      const data = await response.json();

      if (data.status === 'ok' && data.partners) {
        container.innerHTML = this.renderPartners(data.partners, currentDomain);
        this.attachClickHandlers(currentDomain);
      } else {
        container.innerHTML = this.renderError('Could not load partners');
      }
    } catch (error) {
      console.error('Failed to load partners:', error);
      container.innerHTML = this.renderError('Failed to load partners');
    }
  }

  /**
   * Render loading state
   */
  renderLoading() {
    return `
      <div class="partner-loading">
        <div class="spinner"></div>
        <p>Loading partner sites...</p>
      </div>
    `;
  }

  /**
   * Render error state
   */
  renderError(message) {
    return `
      <div class="partner-error">
        <p>⚠️ ${message}</p>
      </div>
    `;
  }

  /**
   * Render partner cards
   */
  renderPartners(partners, currentDomain) {
    const cards = partners.map(partner => this.renderPartnerCard(partner)).join('');

    return `
      <div class="partner-grid">
        ${cards}
      </div>
      <div class="partner-footer">
        <p>Part of <strong>The Mauer Network</strong> — ${partners.length + 1} brands by Matthew Mauer</p>
        <a href="/network.html" class="view-all-link">View Full Portfolio →</a>
      </div>
    `;
  }

  /**
   * Render individual partner card
   */
  renderPartnerCard(partner) {
    const logoHtml = partner.logo_url
      ? `<img src="${partner.logo_url}" alt="${partner.brand_name} logo" class="partner-logo">`
      : `<div class="partner-logo-placeholder" style="background: ${partner.primary_color}">
           ${partner.brand_name.charAt(0)}
         </div>`;

    return `
      <div class="partner-card" data-domain="${partner.domain_name}" style="border-color: ${partner.primary_color}">
        <a href="https://${partner.domain_name}" class="partner-link" data-partner="${partner.domain_name}">
          <div class="partner-header">
            ${logoHtml}
            <h4 class="partner-name">${partner.brand_name}</h4>
          </div>
          <p class="partner-description">${this.truncate(partner.brand_tagline || '', 60)}</p>
          <div class="partner-meta">
            <span class="partner-category">${partner.category}</span>
          </div>
        </a>
      </div>
    `;
  }

  /**
   * Truncate text to max length
   */
  truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Attach click handlers to track partner clicks
   */
  attachClickHandlers(currentDomain) {
    const links = document.querySelectorAll('.partner-link');
    links.forEach(link => {
      link.addEventListener('click', async (e) => {
        const targetDomain = link.dataset.partner;

        // Track the click
        try {
          await fetch('/api/domains/track-click', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              source: currentDomain,
              target: targetDomain,
              session_id: this.sessionId,
              referrer: window.location.href
            })
          });
        } catch (error) {
          console.error('Failed to track partner click:', error);
        }

        // Let the link navigate normally
      });
    });
  }
}

// Auto-initialize if data attribute is present
document.addEventListener('DOMContentLoaded', () => {
  const autoWidget = document.querySelector('[data-partner-widget]');
  if (autoWidget) {
    const domain = autoWidget.dataset.domain || 'calos.ai';
    const count = parseInt(autoWidget.dataset.count) || 4;

    const widget = new PartnerRotationWidget(autoWidget.id);
    widget.load(domain, count);
  }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PartnerRotationWidget;
}
