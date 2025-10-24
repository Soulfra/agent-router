/**
 * Agent Employment Tracker
 *
 * Manages fractional employment relationships for AI executive agents.
 * Enables agents to work for multiple companies simultaneously with different time allocations.
 *
 * Example:
 * - CalRiven (CTO) employed:
 *   - 50% by Soulfra (primary employer)
 *   - 30% by DeathToData (side project)
 *   - 20% available for new clients
 *
 * Employment Tiers:
 * - primary: Main employer, gets priority on agent's time
 * - side_project: Secondary commitment
 * - consulting: Short-term, project-based
 * - retainer: Ongoing advisory role
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class AgentEmploymentTracker extends EventEmitter {
  constructor({ db = null, executiveRegistry = null }) {
    super();

    this.db = db;
    this.executiveRegistry = executiveRegistry;

    // Active employment relationships
    // Map: employmentId -> employment record
    this.employments = new Map();

    // Agent allocation tracking
    // Map: agentId -> { totalAllocated, byCompany: Map }
    this.allocations = new Map();

    // Employment tiers and their rules
    this.employmentTiers = {
      primary: {
        title: 'Primary Employer',
        minAllocation: 30, // at least 30%
        maxEmployers: 1, // only one primary employer
        priority: 1,
        benefits: ['priority_scheduling', 'exclusive_access', 'branding_rights']
      },
      side_project: {
        title: 'Side Project',
        minAllocation: 10,
        maxEmployers: 3,
        priority: 2,
        benefits: ['flexible_scheduling', 'knowledge_sharing']
      },
      consulting: {
        title: 'Consulting Engagement',
        minAllocation: 5,
        maxEmployers: 10,
        priority: 3,
        benefits: ['project_based', 'specific_deliverables']
      },
      retainer: {
        title: 'Retainer / Advisory',
        minAllocation: 5,
        maxEmployers: 5,
        priority: 4,
        benefits: ['ongoing_advisory', 'strategic_input', 'networking']
      }
    };

    console.log('[AgentEmploymentTracker] Initialized');
  }

  /**
   * Create employment relationship
   */
  async createEmployment({
    agentId,
    companyId,
    companyName,
    tier = 'side_project', // primary, side_project, consulting, retainer
    allocationPercentage, // 0-100
    hourlyRate = null, // override agent's default rate
    startDate = new Date(),
    endDate = null, // null = indefinite
    roles = [], // which executive roles agent performs for this company
    scope = '', // description of work
    nonCompeteRules = [],
    metadata = {}
  }) {
    // Validate tier
    if (!this.employmentTiers[tier]) {
      throw new Error(`Invalid employment tier: ${tier}`);
    }

    // Validate agent exists
    if (this.executiveRegistry) {
      const agent = this.executiveRegistry.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Use agent's hourly rate if not specified
      if (!hourlyRate) {
        hourlyRate = agent.hourlyRate;
      }
    }

    // Validate allocation
    const tierRules = this.employmentTiers[tier];
    if (allocationPercentage < tierRules.minAllocation) {
      throw new Error(`${tier} requires at least ${tierRules.minAllocation}% allocation`);
    }

    // Check if agent has capacity
    const currentAllocation = this.getTotalAllocation(agentId);
    if (currentAllocation + allocationPercentage > 100) {
      throw new Error(`Agent over-allocated: ${currentAllocation}% + ${allocationPercentage}% > 100%`);
    }

    // Check tier limits (e.g., only one primary employer)
    const currentTierCount = this.getEmploymentCountByTier(agentId, tier);
    if (currentTierCount >= tierRules.maxEmployers) {
      throw new Error(`Agent already has ${currentTierCount} ${tier} employers (max: ${tierRules.maxEmployers})`);
    }

    const employmentId = crypto.randomUUID();

    const employment = {
      employmentId,
      agentId,
      companyId,
      companyName,
      tier,
      allocationPercentage,
      hourlyRate,
      startDate,
      endDate,
      roles,
      scope,
      nonCompeteRules,
      status: 'active',
      createdAt: new Date(),
      metadata
    };

    this.employments.set(employmentId, employment);

    // Update allocation tracking
    this.updateAllocation(agentId, companyId, allocationPercentage);

    // Store in database
    if (this.db) {
      await this.db.query(
        `INSERT INTO agent_employments (
          employment_id, agent_id, company_id, company_name, tier,
          allocation_percentage, hourly_rate, start_date, end_date,
          roles, scope, non_compete_rules, status, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14)`,
        [
          employmentId,
          agentId,
          companyId,
          companyName,
          tier,
          allocationPercentage,
          hourlyRate,
          startDate,
          endDate,
          JSON.stringify(roles),
          scope,
          JSON.stringify(nonCompeteRules),
          'active',
          JSON.stringify(metadata)
        ]
      );
    }

    // Update agent availability in registry
    if (this.executiveRegistry) {
      const newAvailability = 100 - this.getTotalAllocation(agentId);
      await this.executiveRegistry.updateAvailability(agentId, newAvailability);

      // Record activity
      await this.executiveRegistry.recordActivity({
        agentId,
        activityType: 'client_added',
        metadata: { companyId, companyName, tier }
      });
    }

    console.log(`[AgentEmploymentTracker] Created ${tier} employment: ${agentId} → ${companyName} (${allocationPercentage}%)`);

    this.emit('employment_created', employment);

    return employment;
  }

  /**
   * Update allocation tracking
   */
  updateAllocation(agentId, companyId, allocationPercentage) {
    if (!this.allocations.has(agentId)) {
      this.allocations.set(agentId, {
        totalAllocated: 0,
        byCompany: new Map()
      });
    }

    const allocation = this.allocations.get(agentId);
    allocation.byCompany.set(companyId, allocationPercentage);
    allocation.totalAllocated = Array.from(allocation.byCompany.values()).reduce((sum, val) => sum + val, 0);
  }

  /**
   * Get total allocation for an agent
   */
  getTotalAllocation(agentId) {
    const allocation = this.allocations.get(agentId);
    return allocation ? allocation.totalAllocated : 0;
  }

  /**
   * Get agent's employments
   */
  getAgentEmployments(agentId, { activeOnly = true } = {}) {
    const results = [];

    for (const employment of this.employments.values()) {
      if (employment.agentId === agentId) {
        if (!activeOnly || employment.status === 'active') {
          results.push(employment);
        }
      }
    }

    // Sort by tier priority
    results.sort((a, b) => {
      return this.employmentTiers[a.tier].priority - this.employmentTiers[b.tier].priority;
    });

    return results;
  }

  /**
   * Get company's employed agents
   */
  getCompanyEmployments(companyId, { activeOnly = true } = {}) {
    const results = [];

    for (const employment of this.employments.values()) {
      if (employment.companyId === companyId) {
        if (!activeOnly || employment.status === 'active') {
          results.push(employment);
        }
      }
    }

    return results;
  }

  /**
   * Count employments by tier for an agent
   */
  getEmploymentCountByTier(agentId, tier) {
    let count = 0;

    for (const employment of this.employments.values()) {
      if (employment.agentId === agentId && employment.tier === tier && employment.status === 'active') {
        count++;
      }
    }

    return count;
  }

  /**
   * Update employment allocation
   */
  async updateAllocation2(employmentId, newAllocationPercentage) {
    const employment = this.employments.get(employmentId);
    if (!employment) {
      throw new Error(`Employment not found: ${employmentId}`);
    }

    const oldAllocation = employment.allocationPercentage;
    const diff = newAllocationPercentage - oldAllocation;

    // Check if agent has capacity for increase
    if (diff > 0) {
      const currentAllocation = this.getTotalAllocation(employment.agentId);
      if (currentAllocation + diff > 100) {
        throw new Error(`Agent over-allocated: ${currentAllocation}% + ${diff}% > 100%`);
      }
    }

    // Validate tier minimum
    const tierRules = this.employmentTiers[employment.tier];
    if (newAllocationPercentage < tierRules.minAllocation) {
      throw new Error(`${employment.tier} requires at least ${tierRules.minAllocation}% allocation`);
    }

    employment.allocationPercentage = newAllocationPercentage;

    // Update allocation tracking
    this.updateAllocation(employment.agentId, employment.companyId, newAllocationPercentage);

    if (this.db) {
      await this.db.query(
        `UPDATE agent_employments
         SET allocation_percentage = $1
         WHERE employment_id = $2`,
        [newAllocationPercentage, employmentId]
      );
    }

    // Update agent availability
    if (this.executiveRegistry) {
      const newAvailability = 100 - this.getTotalAllocation(employment.agentId);
      await this.executiveRegistry.updateAvailability(employment.agentId, newAvailability);
    }

    console.log(`[AgentEmploymentTracker] Updated allocation: ${employment.companyName} ${oldAllocation}% → ${newAllocationPercentage}%`);

    this.emit('allocation_updated', {
      employmentId,
      oldAllocation,
      newAllocation: newAllocationPercentage
    });

    return employment;
  }

  /**
   * End employment
   */
  async endEmployment(employmentId, endDate = new Date()) {
    const employment = this.employments.get(employmentId);
    if (!employment) {
      throw new Error(`Employment not found: ${employmentId}`);
    }

    employment.status = 'ended';
    employment.endDate = endDate;

    // Remove from allocation tracking
    const allocation = this.allocations.get(employment.agentId);
    if (allocation) {
      allocation.byCompany.delete(employment.companyId);
      allocation.totalAllocated = Array.from(allocation.byCompany.values()).reduce((sum, val) => sum + val, 0);
    }

    if (this.db) {
      await this.db.query(
        `UPDATE agent_employments
         SET status = 'ended', end_date = $1
         WHERE employment_id = $2`,
        [endDate, employmentId]
      );
    }

    // Update agent availability
    if (this.executiveRegistry) {
      const newAvailability = 100 - this.getTotalAllocation(employment.agentId);
      await this.executiveRegistry.updateAvailability(employment.agentId, newAvailability);
    }

    console.log(`[AgentEmploymentTracker] Ended employment: ${employment.agentId} → ${employment.companyName}`);

    this.emit('employment_ended', { employmentId, employment });

    return employment;
  }

  /**
   * Change employment tier
   */
  async changeEmploymentTier(employmentId, newTier) {
    const employment = this.employments.get(employmentId);
    if (!employment) {
      throw new Error(`Employment not found: ${employmentId}`);
    }

    if (!this.employmentTiers[newTier]) {
      throw new Error(`Invalid tier: ${newTier}`);
    }

    const oldTier = employment.tier;

    // Check tier limits
    const currentTierCount = this.getEmploymentCountByTier(employment.agentId, newTier);
    const tierRules = this.employmentTiers[newTier];
    if (currentTierCount >= tierRules.maxEmployers) {
      throw new Error(`Agent already has ${currentTierCount} ${newTier} employers (max: ${tierRules.maxEmployers})`);
    }

    // Validate allocation meets new tier minimum
    if (employment.allocationPercentage < tierRules.minAllocation) {
      throw new Error(`${newTier} requires at least ${tierRules.minAllocation}% allocation (current: ${employment.allocationPercentage}%)`);
    }

    employment.tier = newTier;

    if (this.db) {
      await this.db.query(
        `UPDATE agent_employments SET tier = $1 WHERE employment_id = $2`,
        [newTier, employmentId]
      );
    }

    console.log(`[AgentEmploymentTracker] Changed tier: ${employment.companyName} ${oldTier} → ${newTier}`);

    this.emit('tier_changed', { employmentId, oldTier, newTier });

    return employment;
  }

  /**
   * Get agent's primary employer
   */
  getPrimaryEmployer(agentId) {
    for (const employment of this.employments.values()) {
      if (employment.agentId === agentId && employment.tier === 'primary' && employment.status === 'active') {
        return employment;
      }
    }
    return null;
  }

  /**
   * Get employment breakdown for agent
   */
  getEmploymentBreakdown(agentId) {
    const employments = this.getAgentEmployments(agentId, { activeOnly: true });

    const breakdown = {
      agentId,
      totalAllocated: this.getTotalAllocation(agentId),
      available: 100 - this.getTotalAllocation(agentId),
      employments: [],
      byTier: {}
    };

    for (const employment of employments) {
      breakdown.employments.push({
        companyName: employment.companyName,
        tier: employment.tier,
        allocation: employment.allocationPercentage,
        roles: employment.roles,
        hourlyRate: employment.hourlyRate
      });

      if (!breakdown.byTier[employment.tier]) {
        breakdown.byTier[employment.tier] = {
          count: 0,
          totalAllocation: 0
        };
      }
      breakdown.byTier[employment.tier].count++;
      breakdown.byTier[employment.tier].totalAllocation += employment.allocationPercentage;
    }

    return breakdown;
  }

  /**
   * Check if employment conflicts with non-compete rules
   */
  checkNonCompete(agentId, newCompanyId, newCompanyIndustry = null) {
    const existingEmployments = this.getAgentEmployments(agentId, { activeOnly: true });

    for (const employment of existingEmployments) {
      for (const rule of employment.nonCompeteRules) {
        // Example rule: { type: 'industry', value: 'fintech' }
        if (rule.type === 'industry' && newCompanyIndustry === rule.value) {
          return {
            allowed: false,
            reason: `Non-compete violation: ${employment.companyName} has exclusive rights in ${rule.value} industry`,
            conflictingEmployment: employment
          };
        }

        // Example rule: { type: 'company', value: 'company-id-123' }
        if (rule.type === 'company' && newCompanyId === rule.value) {
          return {
            allowed: false,
            reason: `Non-compete violation: Excluded company ${newCompanyId}`,
            conflictingEmployment: employment
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Get stats
   */
  getStats() {
    const stats = {
      totalEmployments: this.employments.size,
      activeEmployments: 0,
      byTier: {},
      totalAgentsEmployed: new Set(),
      totalCompanies: new Set()
    };

    for (const employment of this.employments.values()) {
      if (employment.status === 'active') {
        stats.activeEmployments++;
        stats.totalAgentsEmployed.add(employment.agentId);
        stats.totalCompanies.add(employment.companyId);

        if (!stats.byTier[employment.tier]) {
          stats.byTier[employment.tier] = 0;
        }
        stats.byTier[employment.tier]++;
      }
    }

    stats.totalAgentsEmployed = stats.totalAgentsEmployed.size;
    stats.totalCompanies = stats.totalCompanies.size;

    return stats;
  }
}

module.exports = AgentEmploymentTracker;
