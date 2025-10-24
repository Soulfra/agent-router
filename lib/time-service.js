/**
 * Time Service
 *
 * Centralized time management for CALOS to fix date/time issues.
 * Supports:
 * - Manual time offset correction (when system clock is wrong)
 * - NTP sync (optional)
 * - Timezone handling
 * - Consistent timestamps across all CALOS components
 *
 * Why this exists:
 * System was showing October 22, 2025 instead of 2024, causing data corruption.
 * All CALOS code should use TimeService.now() instead of new Date()
 */

const axios = require('axios');

class TimeService {
  constructor(options = {}) {
    // Manual offset in milliseconds (positive = future, negative = past)
    // Example: If system shows 2025 but it's actually 2024, offset = -365 days
    this.manualOffset = options.manualOffset || 0;

    // NTP server for auto-sync
    this.ntpServer = options.ntpServer || 'time.google.com';
    this.ntpEnabled = options.ntpEnabled || false;

    // Last NTP sync result
    this.lastNtpSync = null;
    this.ntpOffset = 0;

    // Mode: 'system' (trust system clock), 'manual' (use manual offset), 'ntp' (sync with NTP)
    this.mode = options.mode || 'system';

    console.log(`[TimeService] Initialized in ${this.mode} mode`);

    // Auto-detect wrong year
    const systemDate = new Date();
    if (systemDate.getFullYear() > 2025) {
      console.warn(`[TimeService] ⚠️  System date looks wrong: ${systemDate.toISOString()}`);
      console.warn(`[TimeService] Consider setting manualOffset or using NTP mode`);
    }
  }

  /**
   * Get current time (corrected)
   * Use this instead of new Date() everywhere in CALOS
   */
  now() {
    const systemTime = Date.now();

    switch (this.mode) {
      case 'manual':
        return new Date(systemTime + this.manualOffset);
      case 'ntp':
        return new Date(systemTime + this.ntpOffset);
      case 'system':
      default:
        return new Date(systemTime);
    }
  }

  /**
   * Get current timestamp in milliseconds (corrected)
   */
  timestamp() {
    return this.now().getTime();
  }

  /**
   * Get ISO string (corrected)
   */
  toISOString() {
    return this.now().toISOString();
  }

  /**
   * Get Unix timestamp in seconds (corrected)
   */
  unixTimestamp() {
    return Math.floor(this.timestamp() / 1000);
  }

  /**
   * Sync with NTP server
   * Returns offset in milliseconds
   */
  async syncWithNTP() {
    try {
      console.log(`[TimeService] Syncing with NTP server: ${this.ntpServer}`);

      // Use worldtimeapi.org as HTTP NTP alternative (proper NTP requires UDP)
      const response = await axios.get('https://worldtimeapi.org/api/timezone/Etc/UTC', {
        timeout: 5000
      });

      const ntpTime = new Date(response.data.datetime).getTime();
      const systemTime = Date.now();

      this.ntpOffset = ntpTime - systemTime;
      this.lastNtpSync = new Date();

      const offsetSeconds = Math.round(this.ntpOffset / 1000);
      console.log(`[TimeService] NTP sync complete. Offset: ${offsetSeconds}s`);

      if (Math.abs(offsetSeconds) > 60) {
        console.warn(`[TimeService] ⚠️  Large time difference detected: ${offsetSeconds}s`);
        console.warn(`[TimeService] System: ${new Date(systemTime).toISOString()}`);
        console.warn(`[TimeService] NTP:    ${new Date(ntpTime).toISOString()}`);
      }

      return {
        success: true,
        offset: this.ntpOffset,
        systemTime: new Date(systemTime),
        ntpTime: new Date(ntpTime),
        lastSync: this.lastNtpSync
      };

    } catch (error) {
      console.error(`[TimeService] NTP sync failed:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Set manual time offset
   * @param {number} offsetMs - Offset in milliseconds
   */
  setManualOffset(offsetMs) {
    this.manualOffset = offsetMs;
    this.mode = 'manual';
    console.log(`[TimeService] Manual offset set to ${offsetMs}ms (${Math.round(offsetMs / 1000)}s)`);
  }

  /**
   * Set manual offset by date difference
   * @param {Date} correctDate - What the date should be
   */
  setOffsetByDate(correctDate) {
    const systemTime = Date.now();
    const correctTime = new Date(correctDate).getTime();
    const offset = correctTime - systemTime;

    this.setManualOffset(offset);

    console.log(`[TimeService] System shows: ${new Date(systemTime).toISOString()}`);
    console.log(`[TimeService] Corrected to: ${new Date(correctTime).toISOString()}`);
  }

  /**
   * Enable NTP mode
   */
  async enableNTP() {
    this.mode = 'ntp';
    const result = await this.syncWithNTP();
    return result;
  }

  /**
   * Use system time (disable corrections)
   */
  useSystemTime() {
    this.mode = 'system';
    console.log(`[TimeService] Using system time (no corrections)`);
  }

  /**
   * Get status
   */
  getStatus() {
    const systemTime = new Date();
    const correctedTime = this.now();

    return {
      mode: this.mode,
      systemTime: systemTime.toISOString(),
      correctedTime: correctedTime.toISOString(),
      offset: this.mode === 'manual' ? this.manualOffset : this.ntpOffset,
      offsetSeconds: Math.round((this.mode === 'manual' ? this.manualOffset : this.ntpOffset) / 1000),
      lastNtpSync: this.lastNtpSync ? this.lastNtpSync.toISOString() : null,
      yearDifference: correctedTime.getFullYear() - systemTime.getFullYear()
    };
  }

  /**
   * Format date for logging
   */
  formatLog(date = null) {
    const d = date || this.now();
    return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  }

  /**
   * Create Date object with correction applied
   */
  createDate(input) {
    if (!input) {
      return this.now();
    }

    // If input is already a timestamp, apply correction
    if (typeof input === 'number') {
      switch (this.mode) {
        case 'manual':
          return new Date(input + this.manualOffset);
        case 'ntp':
          return new Date(input + this.ntpOffset);
        default:
          return new Date(input);
      }
    }

    // Otherwise parse as-is
    return new Date(input);
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create TimeService singleton
 */
function getTimeService(options = {}) {
  if (!instance) {
    instance = new TimeService(options);
  }
  return instance;
}

/**
 * Quick access helpers
 */
function now() {
  return getTimeService().now();
}

function timestamp() {
  return getTimeService().timestamp();
}

function toISOString() {
  return getTimeService().toISOString();
}

module.exports = {
  TimeService,
  getTimeService,
  now,
  timestamp,
  toISOString
};
