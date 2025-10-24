/**
 * Badge Generator
 *
 * Generates GitHub shields.io style badges and HTML badges for job postings.
 * Includes time-based badges, status badges, and feature badges.
 */

class BadgeGenerator {
  constructor() {
    this.shieldsIOBase = 'https://img.shields.io/badge';
  }

  /**
   * Generate all badges for a job posting
   */
  generateAllBadges(job) {
    const badges = {
      html: this.generateHTMLBadges(job),
      shields: this.generateShieldsBadges(job),
      text: this.generateTextBadges(job),
      data: this.calculateBadgeData(job)
    };

    return badges;
  }

  /**
   * Generate HTML badge elements
   */
  generateHTMLBadges(job) {
    const badges = [];
    const data = this.calculateBadgeData(job);

    // Time-based badge
    if (data.isNew) {
      badges.push({
        type: 'new',
        html: '<span class="badge badge-new">🔥 NEW</span>',
        text: '🔥 NEW',
        color: '#ff4444'
      });
    } else if (data.isClosingSoon) {
      badges.push({
        type: 'closing',
        html: '<span class="badge badge-closing">⏰ CLOSING SOON</span>',
        text: '⏰ CLOSING SOON',
        color: '#ff9800'
      });
    }

    // Urgency badge
    if (job.urgency_level === 'urgent') {
      badges.push({
        type: 'urgent',
        html: '<span class="badge badge-urgent">⚡ URGENT</span>',
        text: '⚡ URGENT',
        color: '#e74c3c'
      });
    }

    // Interview status badge
    const statusBadges = {
      'accepting': { emoji: '✅', text: 'ACCEPTING APPLICATIONS', color: '#4caf50' },
      'reviewing': { emoji: '⏸️', text: 'REVIEWING', color: '#ff9800' },
      'filled': { emoji: '✓', text: 'POSITION FILLED', color: '#9e9e9e' },
      'closed': { emoji: '🚫', text: 'CLOSED', color: '#f44336' }
    };

    const status = statusBadges[job.interview_status] || statusBadges.accepting;
    badges.push({
      type: 'status',
      html: `<span class="badge badge-status" style="background: ${status.color}">${status.emoji} ${status.text}</span>`,
      text: `${status.emoji} ${status.text}`,
      color: status.color
    });

    // Location badge
    const isRemote = job.location && (
      job.location.toLowerCase().includes('remote') ||
      job.location.toLowerCase().includes('anywhere') ||
      job.location.toLowerCase().includes('worldwide')
    );

    if (isRemote) {
      badges.push({
        type: 'remote',
        html: '<span class="badge badge-remote">🌍 REMOTE</span>',
        text: '🌍 REMOTE',
        color: '#2196f3'
      });
    }

    // Salary badge
    if (job.salary_range) {
      badges.push({
        type: 'salary',
        html: `<span class="badge badge-salary">💰 ${job.salary_range}</span>`,
        text: `💰 ${job.salary_range}`,
        color: '#4caf50'
      });
    }

    // Engagement badge (if has views)
    if (job.views_count > 0) {
      badges.push({
        type: 'views',
        html: `<span class="badge badge-views">👁️ ${job.views_count} views</span>`,
        text: `👁️ ${job.views_count} views`,
        color: '#9c27b0'
      });
    }

    // Application badge
    if (job.applications_count > 0) {
      badges.push({
        type: 'applications',
        html: `<span class="badge badge-applications">📝 ${job.applications_count} applications</span>`,
        text: `📝 ${job.applications_count} applications`,
        color: '#673ab7'
      });
    }

    return badges;
  }

  /**
   * Generate shields.io style badges
   */
  generateShieldsBadges(job) {
    const badges = [];
    const data = this.calculateBadgeData(job);

    // Status badge
    const statusColors = {
      'accepting': 'brightgreen',
      'reviewing': 'orange',
      'filled': 'lightgrey',
      'closed': 'red'
    };
    badges.push({
      type: 'status',
      url: `${this.shieldsIOBase}/status-${job.interview_status}-${statusColors[job.interview_status]}`
    });

    // Remote badge
    if (job.location && job.location.toLowerCase().includes('remote')) {
      badges.push({
        type: 'remote',
        url: `${this.shieldsIOBase}/location-remote-blue`
      });
    }

    // Urgency badge
    if (job.urgency_level === 'urgent') {
      badges.push({
        type: 'urgent',
        url: `${this.shieldsIOBase}/priority-urgent-red`
      });
    }

    // New badge
    if (data.isNew) {
      badges.push({
        type: 'new',
        url: `${this.shieldsIOBase}/posted-new-brightgreen`
      });
    }

    return badges;
  }

  /**
   * Generate plain text badges for terminal/logs
   */
  generateTextBadges(job) {
    const badges = [];
    const data = this.calculateBadgeData(job);

    if (data.isNew) badges.push('[NEW]');
    if (data.isClosingSoon) badges.push('[CLOSING SOON]');
    if (job.urgency_level === 'urgent') badges.push('[URGENT]');
    if (job.location && job.location.toLowerCase().includes('remote')) badges.push('[REMOTE]');

    badges.push(`[${job.interview_status.toUpperCase()}]`);

    return badges.join(' ');
  }

  /**
   * Calculate badge data and time-based flags
   */
  calculateBadgeData(job) {
    const now = new Date();
    const published = job.published_at ? new Date(job.published_at) : null;
    const expires = job.expires_at ? new Date(job.expires_at) : null;

    // Calculate time differences
    const secondsSincePublished = published ? (now - published) / 1000 : null;
    const secondsUntilExpiration = expires ? (expires - now) / 1000 : null;

    // Time-based flags
    const isNew = secondsSincePublished !== null && secondsSincePublished < (7 * 24 * 60 * 60); // 7 days
    const isClosingSoon = secondsUntilExpiration !== null && secondsUntilExpiration < (7 * 24 * 60 * 60) && secondsUntilExpiration > 0; // 7 days
    const isExpired = secondsUntilExpiration !== null && secondsUntilExpiration <= 0;

    // Format time ago
    const timeAgo = this.formatTimeAgo(secondsSincePublished);
    const timeUntil = this.formatTimeUntil(secondsUntilExpiration);

    // Calculate conversion rate
    const conversionRate = job.views_count > 0
      ? ((job.applications_count / job.views_count) * 100).toFixed(1)
      : 0;

    return {
      isNew,
      isClosingSoon,
      isExpired,
      timeAgo,
      timeUntil,
      secondsSincePublished,
      secondsUntilExpiration,
      conversionRate,
      hasViews: job.views_count > 0,
      hasApplications: job.applications_count > 0
    };
  }

  /**
   * Format seconds into human-readable "time ago"
   */
  formatTimeAgo(seconds) {
    if (seconds === null) return 'Just posted';

    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 4) return `${weeks}w ago`;
    return `${months}mo ago`;
  }

  /**
   * Format seconds into human-readable "time until"
   */
  formatTimeUntil(seconds) {
    if (seconds === null) return 'No expiration';
    if (seconds <= 0) return 'Expired';

    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (seconds < 60) return 'Expiring now';
    if (minutes < 60) return `${minutes}m left`;
    if (hours < 24) return `${hours}h left`;
    if (days < 7) return `${days}d left`;
    if (weeks < 4) return `${weeks}w left`;
    return `${months}mo left`;
  }

  /**
   * Generate CSS for HTML badges
   */
  getBadgeCSS() {
    return `
.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-right: 6px;
  margin-bottom: 6px;
}

.badge-new {
  background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
  color: white;
  animation: pulse 2s ease-in-out infinite;
}

.badge-closing {
  background: linear-gradient(135deg, #ff9800, #f57c00);
  color: white;
  animation: blink 1.5s ease-in-out infinite;
}

.badge-urgent {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: white;
  animation: shake 0.5s ease-in-out infinite;
}

.badge-status {
  background: #4caf50;
  color: white;
}

.badge-remote {
  background: linear-gradient(135deg, #2196f3, #1976d2);
  color: white;
}

.badge-salary {
  background: linear-gradient(135deg, #4caf50, #388e3c);
  color: white;
}

.badge-views {
  background: #9c27b0;
  color: white;
}

.badge-applications {
  background: #673ab7;
  color: white;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.9; }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}
`;
  }
}

module.exports = BadgeGenerator;
