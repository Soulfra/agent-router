/**
 * Company Structure
 *
 * Defines the organizational structure of your company where:
 * - You are the Owner/Founder (human, strategic decisions)
 * - CalRiven is the CTO/CEO (AI, operational decisions)
 *
 * This creates a clear separation of duties:
 * - Strategic decisions require owner approval
 * - Operational decisions are autonomous (CalRiven decides)
 *
 * Pattern: Co-founder model where AI handles day-to-day, human sets direction
 */

class CompanyStructure {
  constructor(options = {}) {
    this.config = {
      companyName: options.companyName || 'CALOS',
      founded: options.founded || '2024-01-01',
      ownerName: options.ownerName || 'Owner',
      ownerEmail: options.ownerEmail || null,

      // Approval thresholds
      spendingLimit: options.spendingLimit || 100, // $ per transaction
      monthlyBudget: options.monthlyBudget || 1000, // $ per month

      // Decision logging
      logDecisions: options.logDecisions !== false,
      decisionsFile: options.decisionsFile || './data/company-decisions.json'
    };

    // Company hierarchy
    this.roles = {
      owner: {
        title: 'Owner/Founder',
        person: this.config.ownerName,
        type: 'human',
        powers: [
          'Strategic direction',
          'Budget approval',
          'Pricing changes',
          'Legal decisions',
          'Partnership approvals',
          'Product vision',
          'Hiring decisions'
        ],
        mustApprove: [
          'budget_increase',
          'pricing_change',
          'legal_agreement',
          'partnership',
          'major_feature',
          'shutdown',
          'acquisition'
        ]
      },

      cto_ceo: {
        title: 'CTO/CEO',
        person: 'CalRiven AI',
        type: 'ai',
        powers: [
          'Infrastructure management',
          'Deployments',
          'Monitoring',
          'Scaling (within budget)',
          'Incident response',
          'Database operations',
          'Security updates',
          'Performance optimization',
          'Affiliate onboarding',
          'Customer support',
          'Operational spending (under limit)'
        ],
        autonomous: [
          'deploy',
          'scale_servers',
          'backup_database',
          'renew_ssl',
          'restart_service',
          'optimize_performance',
          'onboard_affiliate',
          'respond_to_incident',
          'monitor_health',
          'send_notifications'
        ]
      }
    };

    // Decision log
    this.decisions = [];
    this.pendingApprovals = [];

    console.log(`[CompanyStructure] ${this.config.companyName} initialized`);
    console.log(`  Owner: ${this.config.ownerName}`);
    console.log(`  CTO/CEO: CalRiven AI`);
  }

  /**
   * Check if CalRiven can make this decision autonomously
   */
  canDecideAutonomously(decisionType) {
    return this.roles.cto_ceo.autonomous.includes(decisionType);
  }

  /**
   * Check if owner approval is required
   */
  requiresOwnerApproval(decisionType) {
    return this.roles.owner.mustApprove.includes(decisionType);
  }

  /**
   * CalRiven makes an operational decision (autonomous)
   */
  async makeExecutiveDecision(decisionType, details) {
    const timestamp = Date.now();

    // Check if CalRiven has authority
    if (!this.canDecideAutonomously(decisionType)) {
      return {
        approved: false,
        requiresApproval: true,
        reason: 'Decision requires owner approval',
        escalateTo: 'owner'
      };
    }

    // Log decision
    const decision = {
      id: `dec_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      type: decisionType,
      decidedBy: 'CalRiven AI (CTO/CEO)',
      status: 'executed',
      details,
      autonomous: true
    };

    this.decisions.push(decision);
    await this._persistDecisions();

    console.log(`[CompanyStructure] ✅ CalRiven decided: ${decisionType}`);

    return {
      approved: true,
      requiresApproval: false,
      decision,
      message: 'Decision executed autonomously'
    };
  }

  /**
   * Request owner approval for strategic decision
   */
  async requestOwnerApproval(decisionType, details, urgency = 'normal') {
    const timestamp = Date.now();

    const approval = {
      id: `appr_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      type: decisionType,
      requestedBy: 'CalRiven AI (CTO/CEO)',
      status: 'pending',
      urgency, // low, normal, high, critical
      details,
      ownerEmail: this.config.ownerEmail,
      expiresAt: timestamp + (urgency === 'critical' ? 3600000 : 86400000) // 1h or 24h
    };

    this.pendingApprovals.push(approval);
    await this._persistDecisions();

    // Send notification to owner
    await this._notifyOwner(approval);

    console.log(`[CompanyStructure] 📧 Approval requested from owner: ${decisionType}`);

    return {
      approved: false,
      requiresApproval: true,
      approval,
      message: 'Awaiting owner approval'
    };
  }

  /**
   * Owner approves or rejects decision
   */
  async ownerDecision(approvalId, approved, ownerNotes = null) {
    const approval = this.pendingApprovals.find(a => a.id === approvalId);

    if (!approval) {
      throw new Error('Approval not found');
    }

    approval.status = approved ? 'approved' : 'rejected';
    approval.decidedAt = Date.now();
    approval.decidedBy = this.config.ownerName;
    approval.ownerNotes = ownerNotes;

    // Move to decisions log
    this.decisions.push({
      ...approval,
      autonomous: false
    });

    // Remove from pending
    this.pendingApprovals = this.pendingApprovals.filter(a => a.id !== approvalId);

    await this._persistDecisions();

    console.log(`[CompanyStructure] ${approved ? '✅' : '❌'} Owner ${approved ? 'approved' : 'rejected'}: ${approval.type}`);

    return {
      approved,
      approval,
      message: approved ? 'Decision approved by owner' : 'Decision rejected by owner'
    };
  }

  /**
   * Get pending approvals for owner
   */
  getPendingApprovals() {
    // Filter out expired approvals
    const now = Date.now();
    this.pendingApprovals = this.pendingApprovals.filter(a => a.expiresAt > now);

    return this.pendingApprovals.sort((a, b) => {
      // Sort by urgency first
      const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;

      // Then by timestamp
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * Get recent decisions (what CalRiven has been doing)
   */
  getRecentDecisions(limit = 50) {
    return this.decisions
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get company overview
   */
  getCompanyOverview() {
    const now = Date.now();
    const last24h = now - 86400000;
    const last7d = now - 604800000;

    const recentDecisions = this.decisions.filter(d => d.timestamp > last24h);
    const weekDecisions = this.decisions.filter(d => d.timestamp > last7d);

    return {
      company: this.config.companyName,
      founded: this.config.founded,
      structure: {
        owner: {
          name: this.config.ownerName,
          role: this.roles.owner.title,
          type: this.roles.owner.type
        },
        cto_ceo: {
          name: 'CalRiven AI',
          role: this.roles.cto_ceo.title,
          type: this.roles.cto_ceo.type,
          autonomousPowers: this.roles.cto_ceo.autonomous.length
        }
      },
      activity: {
        decisionsLast24h: recentDecisions.length,
        decisionsLast7d: weekDecisions.length,
        pendingApprovals: this.pendingApprovals.length,
        autonomousDecisions: recentDecisions.filter(d => d.autonomous).length,
        ownerDecisions: recentDecisions.filter(d => !d.autonomous).length
      },
      budget: {
        monthlyLimit: this.config.monthlyBudget,
        transactionLimit: this.config.spendingLimit
      }
    };
  }

  /**
   * Check if spending is within CalRiven's authority
   */
  canSpend(amount, purpose) {
    if (amount > this.config.spendingLimit) {
      return {
        approved: false,
        reason: `Amount $${amount} exceeds limit $${this.config.spendingLimit}`,
        requiresApproval: true
      };
    }

    // TODO: Check monthly budget

    return {
      approved: true,
      reason: 'Within spending authority',
      requiresApproval: false
    };
  }

  /**
   * Generate daily report for owner
   */
  async generateDailyReport() {
    const now = Date.now();
    const yesterday = now - 86400000;

    const decisions = this.decisions.filter(d => d.timestamp > yesterday);
    const pending = this.getPendingApprovals();

    const report = {
      date: new Date().toISOString().split('T')[0],
      summary: {
        decisionsExecuted: decisions.length,
        pendingApprovals: pending.length,
        autonomousDecisions: decisions.filter(d => d.autonomous).length
      },
      decisions: decisions.map(d => ({
        type: d.type,
        time: new Date(d.timestamp).toLocaleString(),
        decidedBy: d.decidedBy,
        status: d.status
      })),
      pendingApprovals: pending.map(p => ({
        type: p.type,
        urgency: p.urgency,
        requestedAt: new Date(p.timestamp).toLocaleString(),
        details: p.details
      })),
      calrivenActions: decisions.filter(d => d.autonomous).map(d => d.type)
    };

    return report;
  }

  /**
   * Persist decisions to file
   */
  async _persistDecisions() {
    if (!this.config.logDecisions) return;

    const fs = require('fs').promises;
    const path = require('path');

    try {
      const dir = path.dirname(this.config.decisionsFile);
      await fs.mkdir(dir, { recursive: true });

      const data = {
        decisions: this.decisions,
        pendingApprovals: this.pendingApprovals,
        lastUpdated: Date.now()
      };

      await fs.writeFile(
        this.config.decisionsFile,
        JSON.stringify(data, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('[CompanyStructure] Failed to persist decisions:', error.message);
    }
  }

  /**
   * Load decisions from file
   */
  async loadDecisions() {
    if (!this.config.logDecisions) return;

    const fs = require('fs').promises;

    try {
      const data = await fs.readFile(this.config.decisionsFile, 'utf8');
      const parsed = JSON.parse(data);

      this.decisions = parsed.decisions || [];
      this.pendingApprovals = parsed.pendingApprovals || [];

      console.log(`[CompanyStructure] Loaded ${this.decisions.length} decisions, ${this.pendingApprovals.length} pending approvals`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[CompanyStructure] Failed to load decisions:', error.message);
      }
    }
  }

  /**
   * Notify owner of pending approval
   */
  async _notifyOwner(approval) {
    // TODO: Send email, SMS, Discord notification
    console.log(`[CompanyStructure] 📧 Notification sent to owner: ${approval.type}`);
    console.log(`  Urgency: ${approval.urgency}`);
    console.log(`  Details: ${JSON.stringify(approval.details)}`);
  }
}

module.exports = CompanyStructure;
