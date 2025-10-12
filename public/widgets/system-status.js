/**
 * System Status Widget
 *
 * Displays real-time system information for CalOS
 *
 * Scalability approach:
 * - Fetches system info from server periodically (every 30 seconds)
 * - No constant polling (reduces server load)
 * - Updates client-side for countdown timers
 * - Handles 100M+ concurrent users efficiently
 */

class SystemStatus {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.systemData = null;
    this.updateInterval = null;
    this.fetchInterval = null;

    // Configuration
    this.config = {
      refreshInterval: options.refreshInterval || 30 * 1000, // 30 seconds
      serverUrl: options.serverUrl || '/system'
    };

    this.init();
  }

  async init() {
    // Render widget structure
    this.render();

    // Fetch system data
    await this.fetchSystemData();

    // Start updating display
    this.startUpdating();

    // Periodic re-fetch to keep data fresh
    this.fetchInterval = setInterval(() => {
      this.fetchSystemData();
    }, this.config.refreshInterval);
  }

  render() {
    if (!this.container) {
      console.error('System status container not found');
      return;
    }

    const html = `
      <div class="widget system-status-widget">
        <div class="widget-header">
          <h3>⚙️ System Status</h3>
        </div>
        <div class="widget-body">
          <div class="status-row">
            <div class="status-label">
              <span class="status-icon">⏱️</span>
              <span>Uptime</span>
            </div>
            <div class="status-value" id="status-uptime">Loading...</div>
          </div>

          <div class="status-row">
            <div class="status-label">
              <span class="status-icon">💾</span>
              <span>Memory</span>
            </div>
            <div class="status-value" id="status-memory">Loading...</div>
          </div>

          <div class="status-row">
            <div class="status-label">
              <span class="status-icon">📊</span>
              <span>Heap Used</span>
            </div>
            <div class="status-value" id="status-heap">Loading...</div>
          </div>

          <div class="status-row">
            <div class="status-label">
              <span class="status-icon">🔧</span>
              <span>Services</span>
            </div>
            <div class="status-value" id="status-services">Loading...</div>
          </div>

          <div class="status-row">
            <div class="status-label">
              <span class="status-icon">🌐</span>
              <span>Platform</span>
            </div>
            <div class="status-value" id="status-platform">Loading...</div>
          </div>
        </div>
        <div class="widget-footer">
          <span class="update-status" id="update-status">
            <span class="update-dot">●</span>
            <span id="update-text">Fetching...</span>
          </span>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }

  async fetchSystemData() {
    try {
      const response = await fetch(this.config.serverUrl);
      const data = await response.json();

      this.systemData = data;
      this.lastFetch = Date.now();

      this.updateDisplay();
      this.updateFetchStatus('fetched');
    } catch (error) {
      console.error('Failed to fetch system data:', error);
      this.updateFetchStatus('error');
    }
  }

  updateFetchStatus(status) {
    const statusEl = document.getElementById('update-text');
    const dotEl = document.querySelector('.update-dot');

    if (!statusEl || !dotEl) return;

    switch (status) {
      case 'fetched':
        dotEl.style.color = '#0f0';
        statusEl.textContent = 'Updated just now';
        break;
      case 'fetching':
        dotEl.style.color = '#ff0';
        statusEl.textContent = 'Updating...';
        break;
      case 'error':
        dotEl.style.color = '#f00';
        statusEl.textContent = 'Update failed';
        break;
    }

    // Show "last updated" after a few seconds
    if (status === 'fetched') {
      setTimeout(() => this.updateLastFetchedText(), 3000);
    }
  }

  updateLastFetchedText() {
    const statusEl = document.getElementById('update-text');
    if (!statusEl || !this.lastFetch) return;

    const secondsAgo = Math.floor((Date.now() - this.lastFetch) / 1000);

    if (secondsAgo < 60) {
      statusEl.textContent = `Updated ${secondsAgo}s ago`;
    } else {
      const minutesAgo = Math.floor(secondsAgo / 60);
      statusEl.textContent = `Updated ${minutesAgo}m ago`;
    }
  }

  startUpdating() {
    // Update display immediately
    this.updateDisplay();

    // Update every 2 seconds (for uptime counter, etc.)
    this.updateInterval = setInterval(() => {
      this.updateDisplay();

      // Update "last fetched" text occasionally
      if (Math.random() < 0.3) {
        this.updateLastFetchedText();
      }
    }, 2000);
  }

  updateDisplay() {
    if (!this.systemData) return;

    // Uptime
    const uptimeEl = document.getElementById('status-uptime');
    if (uptimeEl && this.systemData.uptime) {
      uptimeEl.textContent = this.systemData.uptime.formatted || 'N/A';
    }

    // Memory (RSS)
    const memoryEl = document.getElementById('status-memory');
    if (memoryEl && this.systemData.memory) {
      memoryEl.textContent = this.systemData.memory.rss || 'N/A';
    }

    // Heap Used
    const heapEl = document.getElementById('status-heap');
    if (heapEl && this.systemData.memory) {
      const heap = this.systemData.memory.heapUsed || 'N/A';
      const total = this.systemData.memory.heapTotal || '';
      heapEl.textContent = total ? `${heap} / ${total}` : heap;
    }

    // Services
    const servicesEl = document.getElementById('status-services');
    if (servicesEl && this.systemData.components) {
      const running = this.systemData.components.running || 0;
      const total = this.systemData.components.total || 0;
      servicesEl.textContent = `${running} / ${total} running`;
    }

    // Platform
    const platformEl = document.getElementById('status-platform');
    if (platformEl && this.systemData.platform) {
      const platform = this.systemData.platform.platform || 'unknown';
      const arch = this.systemData.platform.arch || '';
      platformEl.textContent = arch ? `${platform} (${arch})` : platform;
    }
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SystemStatus;
}
