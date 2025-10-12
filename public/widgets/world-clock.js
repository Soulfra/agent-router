/**
 * World Clock Widget
 *
 * Scalable real-time world clock for 100M+ concurrent users.
 *
 * Scalability approach:
 * - Client-side time calculation (zero server load!)
 * - Sync with server ONCE on load
 * - Re-sync every 10 minutes (prevents drift)
 * - No polling (updates purely client-side)
 *
 * Like Discord/Messenger - scales infinitely!
 */

class WorldClock {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.serverOffset = 0; // Difference between server and client time
    this.lastSync = null;
    this.updateInterval = null;
    this.syncInterval = null;

    // Configuration
    this.config = {
      timezones: options.timezones || [
        { name: 'New York', flag: '🇺🇸', timezone: 'America/New_York', id: 'ny' },
        { name: 'London', flag: '🇬🇧', timezone: 'Europe/London', id: 'london' },
        { name: 'Tokyo', flag: '🇯🇵', timezone: 'Asia/Tokyo', id: 'tokyo' },
        { name: 'Sydney', flag: '🇦🇺', timezone: 'Australia/Sydney', id: 'sydney' },
        { name: 'San Francisco', flag: '🌉', timezone: 'America/Los_Angeles', id: 'sf' }
      ],
      syncInterval: options.syncInterval || 10 * 60 * 1000, // 10 minutes
      serverUrl: options.serverUrl || '/time?action=unix'
    };

    this.init();
  }

  async init() {
    // Render widget structure
    this.render();

    // Sync with server
    await this.syncWithServer();

    // Start updating display
    this.startUpdating();

    // Periodic re-sync to prevent drift
    this.syncInterval = setInterval(() => {
      this.syncWithServer();
    }, this.config.syncInterval);
  }

  render() {
    if (!this.container) {
      console.error('World clock container not found');
      return;
    }

    const html = `
      <div class="widget world-clock-widget">
        <div class="widget-header">
          <h3>🌍 World Clock</h3>
        </div>
        <div class="widget-body">
          ${this.config.timezones.map(tz => `
            <div class="timezone-row" data-tz-id="${tz.id}">
              <div class="tz-location">
                <span class="tz-flag">${tz.flag}</span>
                <span class="tz-name">${tz.name}</span>
              </div>
              <div class="tz-time-info">
                <div class="tz-time" id="time-${tz.id}">--:--:--</div>
                <div class="tz-date" id="date-${tz.id}">Loading...</div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="widget-footer">
          <span class="sync-status" id="sync-status">
            <span class="sync-dot">●</span>
            <span id="sync-text">Syncing...</span>
          </span>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }

  async syncWithServer() {
    try {
      const startTime = Date.now();
      const response = await fetch(this.config.serverUrl);
      const data = await response.json();
      const roundTripTime = Date.now() - startTime;

      // Account for network latency (half of round-trip time)
      const serverTime = (data.timestamp * 1000) + (roundTripTime / 2);
      const clientTime = Date.now();

      this.serverOffset = serverTime - clientTime;
      this.lastSync = Date.now();

      this.updateSyncStatus('synced');
    } catch (error) {
      console.error('Failed to sync with server:', error);
      this.updateSyncStatus('error');
    }
  }

  updateSyncStatus(status) {
    const statusEl = document.getElementById('sync-text');
    const dotEl = document.querySelector('.sync-dot');

    if (!statusEl || !dotEl) return;

    switch (status) {
      case 'synced':
        dotEl.style.color = '#0f0';
        statusEl.textContent = 'Synced';
        break;
      case 'syncing':
        dotEl.style.color = '#ff0';
        statusEl.textContent = 'Syncing...';
        break;
      case 'error':
        dotEl.style.color = '#f00';
        statusEl.textContent = 'Sync failed';
        break;
    }

    // Update "last synced" after a few seconds
    if (status === 'synced') {
      setTimeout(() => this.updateLastSyncedText(), 2000);
    }
  }

  updateLastSyncedText() {
    const statusEl = document.getElementById('sync-text');
    if (!statusEl || !this.lastSync) return;

    const secondsAgo = Math.floor((Date.now() - this.lastSync) / 1000);

    if (secondsAgo < 60) {
      statusEl.textContent = `Synced ${secondsAgo}s ago`;
    } else {
      const minutesAgo = Math.floor(secondsAgo / 60);
      statusEl.textContent = `Synced ${minutesAgo}m ago`;
    }
  }

  getAccurateTime() {
    // Use client time + server offset for accuracy
    return new Date(Date.now() + this.serverOffset);
  }

  startUpdating() {
    // Update immediately
    this.updateDisplay();

    // Then update every second
    this.updateInterval = setInterval(() => {
      this.updateDisplay();
    }, 1000);
  }

  updateDisplay() {
    const now = this.getAccurateTime();

    for (const tz of this.config.timezones) {
      this.displayTimezone(tz.id, tz.timezone, now);
    }

    // Update sync status periodically
    if (this.lastSync && Math.random() < 0.1) { // 10% chance each second
      this.updateLastSyncedText();
    }
  }

  displayTimezone(id, timezone, now) {
    const timeEl = document.getElementById(`time-${id}`);
    const dateEl = document.getElementById(`date-${id}`);

    if (!timeEl || !dateEl) return;

    try {
      // Format time
      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      // Format date
      const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      // Get timezone abbreviation
      const tzFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'short'
      });

      const parts = tzFormatter.formatToParts(now);
      const tzAbbr = parts.find(p => p.type === 'timeZoneName')?.value || '';

      timeEl.textContent = timeFormatter.format(now) + ' ' + tzAbbr;
      dateEl.textContent = dateFormatter.format(now);
    } catch (error) {
      console.error(`Error displaying timezone ${timezone}:`, error);
      timeEl.textContent = 'Error';
      dateEl.textContent = '';
    }
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorldClock;
}
