/**
 * CALOS™ Usage Meter Component
 *
 * Reusable usage monitoring widget (Claude-style)
 *
 * Usage:
 *   <div id="usage-meter"></div>
 *   <script>
 *     const meter = new UsageMeter({
 *       containerId: 'usage-meter',
 *       userId: 123,
 *       displayMode: 'compact' // 'compact', 'bar', 'full'
 *     });
 *     meter.init();
 *   </script>
 */

class UsageMeter {
  constructor(options = {}) {
    this.containerId = options.containerId || 'usage-meter';
    this.userId = options.userId || null;
    this.displayMode = options.displayMode || 'compact'; // 'compact', 'bar', 'full'
    this.refreshInterval = options.refreshInterval || 30000; // 30 seconds
    this.showUpgradePrompts = options.showUpgradePrompts !== false;

    this.usage = null;
    this.limits = null;
    this.tier = null;
    this.refreshTimer = null;
  }

  /**
   * Initialize the usage meter
   */
  async init() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`[UsageMeter] Container not found: ${this.containerId}`);
      return;
    }

    // Fetch initial usage data
    await this.fetchUsage();

    // Render the meter
    this.render();

    // Start auto-refresh
    if (this.refreshInterval > 0) {
      this.startAutoRefresh();
    }

    console.log('[UsageMeter] Initialized:', this.displayMode);
  }

  /**
   * Fetch usage data from API
   */
  async fetchUsage() {
    try {
      const response = await fetch(`/api/pricing/usage/${this.userId}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch usage');
      }

      this.usage = data.usage;
      this.limits = data.limits;
      this.overLimit = data.overLimit;
      this.tier = data.tier || 'community';

      console.log('[UsageMeter] Usage fetched:', this.usage);
      return data;
    } catch (error) {
      console.error('[UsageMeter] Fetch error:', error);
      return null;
    }
  }

  /**
   * Render the usage meter
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    if (this.displayMode === 'compact') {
      container.innerHTML = this.renderCompact();
    } else if (this.displayMode === 'bar') {
      container.innerHTML = this.renderBar();
    } else if (this.displayMode === 'full') {
      container.innerHTML = this.renderFull();
    }

    // Attach event listeners
    this.attachEventListeners();
  }

  /**
   * Render compact mode (single line with icon)
   */
  renderCompact() {
    if (!this.usage || !this.limits) {
      return `<div class="usage-meter-compact">Loading usage...</div>`;
    }

    // Find highest usage percentage
    const usageTypes = ['transcripts', 'posTransactions', 'cryptoCharges', 'locations', 'apiRequests'];
    let highestPct = 0;
    let highestType = null;

    usageTypes.forEach(type => {
      const current = this.usage[type] || 0;
      const limit = this.limits[type];
      if (limit !== 'Infinity' && limit > 0) {
        const pct = (current / limit) * 100;
        if (pct > highestPct) {
          highestPct = pct;
          highestType = type;
        }
      }
    });

    const status = this.getStatusColor(highestPct);
    const icon = this.getStatusIcon(highestPct);

    return `
      <div class="usage-meter-compact" data-status="${status}">
        <span class="usage-icon">${icon}</span>
        <span class="usage-text">
          ${highestType ? this.formatUsageType(highestType) : 'Usage'}:
          ${Math.round(highestPct)}%
        </span>
        <button class="usage-details-btn" onclick="usageMeter.showDetails()">Details</button>
      </div>
    `;
  }

  /**
   * Render bar mode (bottom bar like Claude)
   */
  renderBar() {
    if (!this.usage || !this.limits) {
      return `<div class="usage-meter-bar">Loading usage...</div>`;
    }

    const usageTypes = [
      { key: 'apiRequests', label: 'API Requests' },
      { key: 'transcripts', label: 'Transcripts' },
      { key: 'locations', label: 'Locations' }
    ];

    const items = usageTypes.map(type => {
      const current = this.usage[type.key] || 0;
      const limit = this.limits[type.key];
      const pct = limit !== 'Infinity' && limit > 0 ? (current / limit) * 100 : 0;
      const status = this.getStatusColor(pct);

      if (limit === 'Infinity') {
        return `<div class="usage-bar-item" data-status="ok">
          <span class="usage-bar-label">${type.label}</span>
          <span class="usage-bar-value">${current.toLocaleString()} (∞)</span>
        </div>`;
      }

      return `<div class="usage-bar-item" data-status="${status}">
        <span class="usage-bar-label">${type.label}</span>
        <span class="usage-bar-value">${current.toLocaleString()} / ${limit.toLocaleString()}</span>
        <div class="usage-bar-progress">
          <div class="usage-bar-fill" style="width: ${Math.min(pct, 100)}%"></div>
        </div>
      </div>`;
    }).join('');

    return `
      <div class="usage-meter-bar">
        ${items}
        <button class="usage-bar-upgrade" onclick="window.location.href='/pricing.html'">
          Upgrade
        </button>
      </div>
    `;
  }

  /**
   * Render full mode (detailed breakdown)
   */
  renderFull() {
    if (!this.usage || !this.limits) {
      return `<div class="usage-meter-full">Loading usage...</div>`;
    }

    const usageTypes = [
      { key: 'transcripts', label: 'Transcripts', icon: '📝' },
      { key: 'posTransactions', label: 'POS Transactions', icon: '💳' },
      { key: 'cryptoCharges', label: 'Crypto Charges', icon: '₿' },
      { key: 'locations', label: 'Locations', icon: '📍' },
      { key: 'apiRequests', label: 'API Requests', icon: '🔌' }
    ];

    const cards = usageTypes.map(type => {
      const current = this.usage[type.key] || 0;
      const limit = this.limits[type.key];
      const pct = limit !== 'Infinity' && limit > 0 ? (current / limit) * 100 : 0;
      const status = this.getStatusColor(pct);
      const overLimit = this.overLimit[type.key];

      return `
        <div class="usage-card" data-status="${status}">
          <div class="usage-card-header">
            <span class="usage-card-icon">${type.icon}</span>
            <h3 class="usage-card-title">${type.label}</h3>
          </div>
          <div class="usage-card-value">
            ${current.toLocaleString()} ${limit !== 'Infinity' ? `/ ${limit.toLocaleString()}` : '(∞)'}
          </div>
          ${limit !== 'Infinity' ? `
            <div class="usage-card-progress">
              <div class="usage-card-fill" style="width: ${Math.min(pct, 100)}%; background: ${this.getProgressColor(pct)}"></div>
            </div>
            <div class="usage-card-percentage">${Math.round(pct)}%</div>
          ` : '<div class="usage-card-unlimited">Unlimited</div>'}
          ${overLimit && this.showUpgradePrompts ? `
            <div class="usage-card-warning">
              ⚠️ Limit exceeded. <a href="/pricing.html">Upgrade to Pro</a>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="usage-meter-full">
        <div class="usage-meter-header">
          <h2>Your Usage</h2>
          <div class="usage-meter-tier">
            <span class="tier-badge tier-${this.tier}">${this.tier.toUpperCase()}</span>
            <a href="/pricing.html" class="tier-upgrade-link">Change Plan</a>
          </div>
        </div>
        <div class="usage-cards-grid">
          ${cards}
        </div>
      </div>
    `;
  }

  /**
   * Get status color based on percentage
   */
  getStatusColor(pct) {
    if (pct >= 100) return 'critical';
    if (pct >= 95) return 'danger';
    if (pct >= 80) return 'warning';
    if (pct >= 50) return 'caution';
    return 'ok';
  }

  /**
   * Get status icon based on percentage
   */
  getStatusIcon(pct) {
    if (pct >= 100) return '🔴';
    if (pct >= 95) return '🟠';
    if (pct >= 80) return '🟡';
    if (pct >= 50) return '🟢';
    return '✅';
  }

  /**
   * Get progress bar color based on percentage
   */
  getProgressColor(pct) {
    if (pct >= 100) return '#ff4444'; // Red
    if (pct >= 95) return '#ff6b35'; // Orange-red
    if (pct >= 80) return '#ff9f1c'; // Orange
    if (pct >= 50) return '#ffbf00'; // Yellow
    return '#44cc44'; // Green
  }

  /**
   * Format usage type for display
   */
  formatUsageType(type) {
    const labels = {
      transcripts: 'Transcripts',
      posTransactions: 'POS Transactions',
      cryptoCharges: 'Crypto Charges',
      locations: 'Locations',
      apiRequests: 'API Requests'
    };
    return labels[type] || type;
  }

  /**
   * Show detailed usage modal
   */
  showDetails() {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'usage-modal';
    modal.innerHTML = `
      <div class="usage-modal-overlay" onclick="this.parentElement.remove()"></div>
      <div class="usage-modal-content">
        <div class="usage-modal-header">
          <h2>Usage Details</h2>
          <button class="usage-modal-close" onclick="this.closest('.usage-modal').remove()">×</button>
        </div>
        <div class="usage-modal-body">
          ${this.renderFull()}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Refresh button
    const refreshBtn = document.querySelector('.usage-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }
  }

  /**
   * Refresh usage data
   */
  async refresh() {
    console.log('[UsageMeter] Refreshing usage data...');
    await this.fetchUsage();
    this.render();
  }

  /**
   * Start auto-refresh timer
   */
  startAutoRefresh() {
    this.stopAutoRefresh(); // Clear existing timer
    this.refreshTimer = setInterval(() => {
      this.refresh();
    }, this.refreshInterval);
    console.log(`[UsageMeter] Auto-refresh started (${this.refreshInterval}ms)`);
  }

  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      console.log('[UsageMeter] Auto-refresh stopped');
    }
  }

  /**
   * Destroy the usage meter
   */
  destroy() {
    this.stopAutoRefresh();
    const container = document.getElementById(this.containerId);
    if (container) {
      container.innerHTML = '';
    }
    console.log('[UsageMeter] Destroyed');
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UsageMeter;
}
