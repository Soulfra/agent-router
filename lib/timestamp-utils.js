/**
 * Timestamp Utilities
 *
 * Handles relative time display like notifications:
 * - "1m ago" (< 1 hour)
 * - "2h ago" (< 24 hours)
 * - "Oct 20" (< 1 year, current year)
 * - "Oct 20, 2024" (older than 1 year or different year)
 * - "Oct 20, 3:45 PM" (with time when needed)
 *
 * Also provides "hold to see full timestamp" data.
 */

class TimestampUtils {
  /**
   * Format timestamp with progressive detail
   * @param {Date|string|number} timestamp - Timestamp to format
   * @param {object} options - Formatting options
   * @returns {object} Formatted timestamp with multiple representations
   */
  static format(timestamp, options = {}) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    // Check if timestamp is in the future (clock skew warning)
    if (diffMs < -60000) { // More than 1 minute in future
      return {
        short: '⚠️ Future',
        medium: 'Timestamp in future',
        full: date.toLocaleString(),
        iso: date.toISOString(),
        warning: `Clock skew detected: ${Math.abs(Math.floor(diffMs / 1000))}s in future`
      };
    }

    // Very recent (< 1 minute): "Just now"
    if (diffSeconds < 60) {
      return {
        short: 'Just now',
        medium: `${diffSeconds}s ago`,
        full: date.toLocaleString(),
        iso: date.toISOString()
      };
    }

    // Recent (< 1 hour): "5m ago"
    if (diffMinutes < 60) {
      return {
        short: `${diffMinutes}m ago`,
        medium: `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`,
        full: date.toLocaleString(),
        iso: date.toISOString()
      };
    }

    // Within day (< 24 hours): "3h ago"
    if (diffHours < 24) {
      return {
        short: `${diffHours}h ago`,
        medium: `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`,
        full: date.toLocaleString(),
        iso: date.toISOString()
      };
    }

    // Within week (< 7 days): "2d ago" or day name
    if (diffDays < 7) {
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      return {
        short: `${diffDays}d ago`,
        medium: dayName,
        full: date.toLocaleString(),
        iso: date.toISOString()
      };
    }

    // Same year: "Oct 20"
    if (date.getFullYear() === now.getFullYear()) {
      const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        short: monthDay,
        medium: `${monthDay}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
        full: date.toLocaleString(),
        iso: date.toISOString()
      };
    }

    // Different year: "Oct 20, 2024"
    const monthDayYear = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return {
      short: monthDayYear,
      medium: `${monthDayYear}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
      full: date.toLocaleString(),
      iso: date.toISOString()
    };
  }

  /**
   * Get relative time description
   * @param {Date|string|number} timestamp
   * @returns {string} Human-readable relative time
   */
  static relative(timestamp) {
    return this.format(timestamp).short;
  }

  /**
   * Get age in seconds
   * @param {Date|string|number} timestamp
   * @returns {number} Age in seconds
   */
  static getAge(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    return Math.floor((now - date) / 1000);
  }

  /**
   * Check if data is stale (older than threshold)
   * @param {Date|string|number} timestamp
   * @param {number} thresholdSeconds - Threshold in seconds
   * @returns {boolean} True if stale
   */
  static isStale(timestamp, thresholdSeconds = 300) { // 5 minutes default
    const age = this.getAge(timestamp);
    return age > thresholdSeconds;
  }

  /**
   * Check if timestamp indicates clock skew
   * @param {Date|string|number} timestamp
   * @param {number} toleranceMs - Tolerance in milliseconds (default 60s)
   * @returns {object} Clock skew info
   */
  static detectClockSkew(timestamp, toleranceMs = 60000) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = date - now;

    if (diff > toleranceMs) {
      return {
        hasSkew: true,
        direction: 'future',
        offsetMs: diff,
        offsetSeconds: Math.floor(diff / 1000),
        message: `Timestamp is ${Math.floor(diff / 1000)}s in the future`
      };
    }

    // Check for extreme past (likely wrong data)
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    if (-diff > oneYearMs) {
      return {
        hasSkew: true,
        direction: 'past',
        offsetMs: -diff,
        offsetSeconds: Math.floor(-diff / 1000),
        message: `Timestamp is more than 1 year old`
      };
    }

    return {
      hasSkew: false,
      offsetMs: 0,
      message: 'Timestamp is current'
    };
  }

  /**
   * Format for API responses
   * Includes multiple formats for different UX needs
   * @param {Date|string|number} timestamp
   * @returns {object} Multi-format timestamp
   */
  static forApi(timestamp) {
    const formatted = this.format(timestamp);
    const age = this.getAge(timestamp);
    const clockSkew = this.detectClockSkew(timestamp);

    return {
      // Display formats (progressive detail)
      display: {
        short: formatted.short,      // "5m ago" or "Oct 20"
        medium: formatted.medium,    // "5 minutes ago" or "Oct 20, 3:45 PM"
        full: formatted.full,        // Full localized datetime
      },

      // Machine-readable
      iso: formatted.iso,
      unix: Math.floor(new Date(timestamp).getTime() / 1000),

      // Metadata
      age: {
        seconds: age,
        minutes: Math.floor(age / 60),
        hours: Math.floor(age / 3600),
        isStale: this.isStale(timestamp)
      },

      // Clock skew warning (if any)
      ...(clockSkew.hasSkew && {
        warning: {
          type: 'clock_skew',
          message: clockSkew.message,
          direction: clockSkew.direction,
          offsetSeconds: clockSkew.offsetSeconds
        }
      })
    };
  }

  /**
   * Parse time string to Date
   * Handles both ISO and relative formats ("1 hour ago")
   * @param {string} timeStr
   * @returns {Date|null}
   */
  static parse(timeStr) {
    if (!timeStr) return null;

    // Try ISO date first
    const isoDate = new Date(timeStr);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    // Try relative format
    const match = timeStr.match(/^(\d+)\s+(second|minute|hour|day|week)s?\s+ago$/i);
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();

      const multipliers = {
        second: 1000,
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000
      };

      const offset = amount * (multipliers[unit] || 0);
      return new Date(Date.now() - offset);
    }

    return null;
  }

  /**
   * Get system clock drift (compare to NTP or external source)
   * Returns estimated drift in milliseconds
   * @returns {Promise<object>} Clock drift info
   */
  static async getSystemClockDrift() {
    try {
      // Make HTTP request to reliable time source
      // worldtimeapi.org provides free time API
      const axios = require('axios');
      const response = await axios.get('http://worldtimeapi.org/api/timezone/Etc/UTC', {
        timeout: 5000
      });

      const serverTime = new Date(response.data.utc_datetime);
      const localTime = new Date();
      const driftMs = localTime - serverTime;

      return {
        driftMs,
        driftSeconds: Math.floor(driftMs / 1000),
        localTime: localTime.toISOString(),
        serverTime: serverTime.toISOString(),
        message: Math.abs(driftMs) > 60000
          ? `⚠️ Clock is ${Math.abs(Math.floor(driftMs / 1000))}s ${driftMs > 0 ? 'ahead' : 'behind'}`
          : '✅ Clock is synchronized'
      };
    } catch (error) {
      return {
        error: true,
        message: `Failed to check clock drift: ${error.message}`
      };
    }
  }
}

module.exports = TimestampUtils;
