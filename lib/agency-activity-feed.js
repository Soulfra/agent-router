/**
 * Agency Activity Feed
 *
 * Captures all events from Fractional Executive Agency and streams them
 * to the monitoring/logging system for live visualization.
 *
 * Integrates with:
 * - AgentActivityLogger - logs to database
 * - Mission Control WebSocket - streams to live dashboard
 * - LogAggregator - centralized log collection
 *
 * Events captured:
 * - agent_registered, employment_created, time_entry_recorded
 * - invoice_generated, payment_recorded, onboarding_started
 * - capacity_warning, allocation_updated, match_created
 */

const EventEmitter = require('events');

class AgencyActivityFeed extends EventEmitter {
  constructor({ agency, activityLogger = null, logAggregator = null }) {
    super();

    this.agency = agency;
    this.activityLogger = activityLogger;
    this.logAggregator = logAggregator;

    // Activity feed buffer (for /api/agency/activity-feed endpoint)
    this.activityBuffer = [];
    this.maxBufferSize = 1000;

    // Setup event listeners
    this.setupEventListeners();

    console.log('[AgencyActivityFeed] Initialized - Capturing agency events');
  }

  /**
   * Setup event listeners on all agency subsystems
   */
  setupEventListeners() {
    // Registry events
    this.agency.registry.on('agent_registered', (data) => {
      this.logActivity({
        type: 'agent_registered',
        category: 'registry',
        title: `${data.agentName} registered as ${data.roles.join(', ')}`,
        data,
        icon: '👤',
        severity: 'info'
      });
    });

    this.agency.registry.on('activity_recorded', (data) => {
      this.logActivity({
        type: 'agent_activity',
        category: 'registry',
        title: `Agent activity: ${data.activityType}`,
        data,
        icon: '⚡',
        severity: 'debug'
      });
    });

    this.agency.registry.on('agent_deactivated', (data) => {
      this.logActivity({
        type: 'agent_deactivated',
        category: 'registry',
        title: `Agent deactivated: ${data.agentId}`,
        data,
        icon: '⏸️',
        severity: 'warning'
      });
    });

    // Employment tracker events
    this.agency.employmentTracker.on('employment_created', (data) => {
      this.logActivity({
        type: 'employment_created',
        category: 'employment',
        title: `${data.companyName} hired agent (${data.allocationPercentage}%)`,
        data,
        icon: '🤝',
        severity: 'info'
      });
    });

    this.agency.employmentTracker.on('allocation_updated', (data) => {
      this.logActivity({
        type: 'allocation_updated',
        category: 'employment',
        title: `Allocation updated: ${data.oldAllocation}% → ${data.newAllocation}%`,
        data,
        icon: '📊',
        severity: 'info'
      });
    });

    this.agency.employmentTracker.on('employment_ended', (data) => {
      this.logActivity({
        type: 'employment_ended',
        category: 'employment',
        title: `Employment ended: ${data.employment.companyName}`,
        data,
        icon: '👋',
        severity: 'info'
      });
    });

    this.agency.employmentTracker.on('tier_changed', (data) => {
      this.logActivity({
        type: 'tier_changed',
        category: 'employment',
        title: `Tier changed: ${data.oldTier} → ${data.newTier}`,
        data,
        icon: '⬆️',
        severity: 'info'
      });
    });

    // Capacity manager events
    this.agency.capacityManager.on('session_started', (data) => {
      this.logActivity({
        type: 'work_session_started',
        category: 'capacity',
        title: `Work session started (${data.estimatedHours}h)`,
        data,
        icon: '▶️',
        severity: 'info'
      });
    });

    this.agency.capacityManager.on('session_ended', (data) => {
      this.logActivity({
        type: 'work_session_ended',
        category: 'capacity',
        title: `Work session completed (${data.actualHours}h)`,
        data,
        icon: '✅',
        severity: 'info'
      });
    });

    this.agency.capacityManager.on('work_request_created', (data) => {
      this.logActivity({
        type: 'work_request_created',
        category: 'capacity',
        title: `Work request: ${data.taskDescription || 'New task'}`,
        data,
        icon: '📝',
        severity: 'info'
      });
    });

    this.agency.capacityManager.on('work_request_declined', (data) => {
      this.logActivity({
        type: 'work_request_declined',
        category: 'capacity',
        title: `Work request declined: ${data.reason}`,
        data,
        icon: '❌',
        severity: 'warning'
      });
    });

    // Product catalog events
    this.agency.productCatalog.on('product_registered', (data) => {
      this.logActivity({
        type: 'product_registered',
        category: 'product',
        title: `Product registered: ${data.productName} v${data.version}`,
        data,
        icon: '📦',
        severity: 'info'
      });
    });

    this.agency.productCatalog.on('subscription_created', (data) => {
      this.logActivity({
        type: 'subscription_created',
        category: 'product',
        title: `${data.customerName} subscribed to ${data.productName}`,
        data,
        icon: '🎉',
        severity: 'info'
      });
    });

    this.agency.productCatalog.on('subscription_cancelled', (data) => {
      this.logActivity({
        type: 'subscription_cancelled',
        category: 'product',
        title: `Subscription cancelled: ${data.subscription.productName}`,
        data,
        icon: '🚫',
        severity: 'warning'
      });
    });

    // Onboarding events
    this.agency.onboarding.on('request_submitted', (data) => {
      this.logActivity({
        type: 'onboarding_started',
        category: 'onboarding',
        title: `${data.companyName} wants to hire ${data.requestedRole}`,
        data,
        icon: '🚀',
        severity: 'info'
      });
    });

    this.agency.onboarding.on('matches_found', (data) => {
      this.logActivity({
        type: 'matches_found',
        category: 'onboarding',
        title: `Found ${data.matches.length} matching agents`,
        data,
        icon: '🔍',
        severity: 'info'
      });
    });

    this.agency.onboarding.on('agent_selected', (data) => {
      this.logActivity({
        type: 'agent_selected',
        category: 'onboarding',
        title: `Agent selected: ${data.match.agentName}`,
        data,
        icon: '✨',
        severity: 'info'
      });
    });

    this.agency.onboarding.on('contract_negotiated', (data) => {
      this.logActivity({
        type: 'contract_negotiated',
        category: 'onboarding',
        title: `Contract: ${data.contractTerms.allocationPercentage}% @ $${data.contractTerms.hourlyRate}/hr`,
        data,
        icon: '📄',
        severity: 'info'
      });
    });

    this.agency.onboarding.on('employment_created', (data) => {
      this.logActivity({
        type: 'onboarding_employment_created',
        category: 'onboarding',
        title: `Employment created: ${data.employmentId}`,
        data,
        icon: '🎊',
        severity: 'info'
      });
    });

    this.agency.onboarding.on('onboarding_complete', (data) => {
      this.logActivity({
        type: 'onboarding_complete',
        category: 'onboarding',
        title: `Onboarding complete: ${data.companyName}`,
        data,
        icon: '🏁',
        severity: 'info'
      });
    });

    // Billing events
    this.agency.billing.on('time_entry_recorded', (data) => {
      this.logActivity({
        type: 'time_entry_recorded',
        category: 'billing',
        title: `Logged ${data.hours}h for ${data.companyId} ($${data.amount})`,
        data,
        icon: '⏱️',
        severity: 'debug'
      });
    });

    this.agency.billing.on('invoice_generated', (data) => {
      this.logActivity({
        type: 'invoice_generated',
        category: 'billing',
        title: `Invoice ${data.invoiceNumber}: $${data.total}`,
        data,
        icon: '💰',
        severity: 'info'
      });
    });

    this.agency.billing.on('invoice_sent', (data) => {
      this.logActivity({
        type: 'invoice_sent',
        category: 'billing',
        title: `Invoice sent: ${data.invoiceNumber}`,
        data,
        icon: '📧',
        severity: 'info'
      });
    });

    this.agency.billing.on('payment_recorded', (data) => {
      this.logActivity({
        type: 'payment_received',
        category: 'billing',
        title: `Payment: $${data.payment.amount} (${data.invoice.invoiceNumber})`,
        data: {
          ...data,
          platformRevenue: data.platformRevenue,
          agentRevenue: data.agentRevenue
        },
        icon: '💸',
        severity: 'info'
      });
    });

    console.log('[AgencyActivityFeed] Event listeners setup complete');
  }

  /**
   * Log activity to all outputs
   */
  async logActivity({ type, category, title, data, icon = '📊', severity = 'info' }) {
    const activity = {
      activityId: data.activityId || require('crypto').randomUUID(),
      timestamp: new Date(),
      type,
      category,
      title,
      icon,
      severity,
      data
    };

    // Add to buffer
    this.activityBuffer.unshift(activity);
    if (this.activityBuffer.length > this.maxBufferSize) {
      this.activityBuffer = this.activityBuffer.slice(0, this.maxBufferSize);
    }

    // Console log with color
    const colors = {
      info: '\x1b[36m',    // cyan
      warning: '\x1b[33m', // yellow
      error: '\x1b[31m',   // red
      debug: '\x1b[90m'    // gray
    };
    const reset = '\x1b[0m';
    const color = colors[severity] || colors.info;

    console.log(`${color}[AgencyActivity] ${icon} ${title}${reset}`);

    // Log to database via AgentActivityLogger
    if (this.activityLogger) {
      await this.activityLogger.logActivity({
        agent: 'fractional-agency',
        user_id: data.userId || data.companyId || 'system',
        session_id: data.sessionId || 'agency-system',
        device_id: null,
        identity_id: data.agentId || data.employmentId,
        origin_domain: 'agency.calos.ai',
        input: title,
        result: JSON.stringify(data),
        context: { activityType: type, category },
        duration_ms: 0,
        status: 'success'
      });
    }

    // Send to log aggregator
    if (this.logAggregator) {
      this.logAggregator.log({
        level: severity,
        message: title,
        meta: {
          type,
          category,
          ...data
        }
      });
    }

    // Emit for WebSocket streaming
    this.emit('activity', activity);
  }

  /**
   * Get recent activity feed
   */
  getActivityFeed({ limit = 100, category = null, type = null } = {}) {
    let feed = [...this.activityBuffer];

    if (category) {
      feed = feed.filter(a => a.category === category);
    }

    if (type) {
      feed = feed.filter(a => a.type === type);
    }

    return feed.slice(0, limit);
  }

  /**
   * Get activity stats
   */
  getStats() {
    const stats = {
      totalActivities: this.activityBuffer.length,
      byCategory: {},
      byType: {},
      bySeverity: {},
      recentActivity: this.activityBuffer.slice(0, 10)
    };

    for (const activity of this.activityBuffer) {
      stats.byCategory[activity.category] = (stats.byCategory[activity.category] || 0) + 1;
      stats.byType[activity.type] = (stats.byType[activity.type] || 0) + 1;
      stats.bySeverity[activity.severity] = (stats.bySeverity[activity.severity] || 0) + 1;
    }

    return stats;
  }

  /**
   * Clear activity buffer
   */
  clearBuffer() {
    this.activityBuffer = [];
    console.log('[AgencyActivityFeed] Buffer cleared');
  }
}

module.exports = AgencyActivityFeed;
