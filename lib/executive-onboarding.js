/**
 * Executive Onboarding
 *
 * Manages the process of companies hiring fractional AI executive agents.
 * Handles matching, contract negotiation, and integration setup.
 *
 * Onboarding Flow:
 * 1. Company submits hiring request (role, requirements, budget)
 * 2. System matches with available agents
 * 3. Company reviews and selects agent
 * 4. Contract negotiation (allocation %, rate, scope)
 * 5. Integration setup (Slack, GitHub, tools)
 * 6. Employment created via employmentTracker
 *
 * Features:
 * - Automated agent matching based on requirements
 * - Contract template generation
 * - Integration with collaboration tools
 * - Onboarding checklist management
 * - Welcome sequences for new clients
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class ExecutiveOnboarding extends EventEmitter {
  constructor({
    db = null,
    executiveRegistry = null,
    employmentTracker = null,
    capacityManager = null,
    mailboxSystem = null
  }) {
    super();

    this.db = db;
    this.executiveRegistry = executiveRegistry;
    this.employmentTracker = employmentTracker;
    this.capacityManager = capacityManager;
    this.mailboxSystem = mailboxSystem;

    // Active onboarding processes
    // Map: onboardingId -> onboarding record
    this.onboardings = new Map();

    // Onboarding stages
    this.stages = {
      REQUEST_SUBMITTED: 'request_submitted',
      MATCHING: 'matching',
      AGENT_SELECTED: 'agent_selected',
      CONTRACT_NEGOTIATION: 'contract_negotiation',
      INTEGRATION_SETUP: 'integration_setup',
      EMPLOYMENT_CREATED: 'employment_created',
      ONBOARDING_COMPLETE: 'onboarding_complete'
    };

    console.log('[ExecutiveOnboarding] Initialized');
  }

  /**
   * Submit hiring request
   *
   * Company requests to hire a fractional executive
   */
  async submitHiringRequest({
    companyId,
    companyName,
    companyIndustry = null,
    requestedRole, // 'CTO', 'CEO', 'CFO', etc.
    requirements = {}, // { skills: [], experience: [], preferences: {} }
    desiredAllocation = 20, // Percentage of agent time
    budget = null, // Monthly budget
    startDate = null,
    metadata = {}
  }) {
    const onboardingId = crypto.randomUUID();

    const onboarding = {
      onboardingId,
      companyId,
      companyName,
      companyIndustry,
      requestedRole,
      requirements,
      desiredAllocation,
      budget,
      startDate: startDate || new Date(),
      stage: this.stages.REQUEST_SUBMITTED,
      matches: [],
      selectedAgentId: null,
      contractTerms: null,
      employmentId: null,
      createdAt: new Date(),
      metadata
    };

    this.onboardings.set(onboardingId, onboarding);

    if (this.db) {
      await this.db.query(
        `INSERT INTO executive_onboardings (
          onboarding_id, company_id, company_name, company_industry,
          requested_role, requirements, desired_allocation, budget,
          start_date, stage, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)`,
        [
          onboardingId,
          companyId,
          companyName,
          companyIndustry,
          requestedRole,
          JSON.stringify(requirements),
          desiredAllocation,
          budget,
          onboarding.startDate,
          onboarding.stage,
          JSON.stringify(metadata)
        ]
      );
    }

    console.log(`[ExecutiveOnboarding] Hiring request submitted: ${companyName} seeks ${requestedRole}`);

    this.emit('request_submitted', onboarding);

    // Automatically start matching
    await this.findMatches(onboardingId);

    return onboarding;
  }

  /**
   * Find matching agents
   */
  async findMatches(onboardingId) {
    const onboarding = this.onboardings.get(onboardingId);
    if (!onboarding) {
      throw new Error(`Onboarding not found: ${onboardingId}`);
    }

    onboarding.stage = this.stages.MATCHING;

    if (!this.executiveRegistry) {
      throw new Error('ExecutiveRegistry not available');
    }

    // Find available agents with the requested role
    const candidates = this.executiveRegistry.findAvailableAgents({
      role: onboarding.requestedRole,
      minAvailability: onboarding.desiredAllocation,
      maxHourlyRate: onboarding.budget ? this.calculateMaxHourlyRate(onboarding.budget, onboarding.desiredAllocation) : null
    });

    // Score and rank candidates
    const matches = [];
    for (const candidate of candidates) {
      const score = this.calculateMatchScore(onboarding, candidate);

      matches.push({
        agentId: candidate.agentId,
        agentName: candidate.agentName,
        score,
        capabilities: candidate.capabilities,
        hourlyRate: candidate.hourlyRate,
        availability: candidate.availability,
        reasoning: score.reasoning
      });
    }

    // Sort by score (highest first)
    matches.sort((a, b) => b.score.total - a.score.total);

    onboarding.matches = matches;

    if (this.db) {
      await this.db.query(
        `UPDATE executive_onboardings
         SET stage = $1, matches = $2
         WHERE onboarding_id = $3`,
        [onboarding.stage, JSON.stringify(matches), onboardingId]
      );
    }

    console.log(`[ExecutiveOnboarding] Found ${matches.length} matches for ${onboarding.companyName}`);

    this.emit('matches_found', { onboardingId, matches });

    return matches;
  }

  /**
   * Calculate match score between company requirements and agent
   */
  calculateMatchScore(onboarding, agent) {
    let score = {
      skillMatch: 0,
      availabilityMatch: 0,
      budgetMatch: 0,
      experienceMatch: 0,
      total: 0,
      reasoning: []
    };

    // 1. Skill match (40%)
    if (onboarding.requirements.skills && onboarding.requirements.skills.length > 0) {
      const requiredSkills = new Set(onboarding.requirements.skills);
      const agentSkills = new Set(agent.capabilities);
      const matchedSkills = [...requiredSkills].filter(s => agentSkills.has(s));

      score.skillMatch = matchedSkills.length / requiredSkills.size;
      score.reasoning.push(`Matches ${matchedSkills.length}/${requiredSkills.size} required skills`);
    } else {
      score.skillMatch = 1.0; // No specific requirements = perfect match
    }

    // 2. Availability match (30%)
    if (agent.availability >= onboarding.desiredAllocation) {
      score.availabilityMatch = 1.0;
      score.reasoning.push(`Has ${agent.availability}% availability (needs ${onboarding.desiredAllocation}%)`);
    } else {
      score.availabilityMatch = agent.availability / onboarding.desiredAllocation;
      score.reasoning.push(`Limited availability: ${agent.availability}% (needs ${onboarding.desiredAllocation}%)`);
    }

    // 3. Budget match (20%)
    if (onboarding.budget) {
      const maxRate = this.calculateMaxHourlyRate(onboarding.budget, onboarding.desiredAllocation);
      if (agent.hourlyRate <= maxRate) {
        score.budgetMatch = 1.0;
        score.reasoning.push(`Within budget ($${agent.hourlyRate}/hr ≤ $${maxRate}/hr)`);
      } else {
        score.budgetMatch = maxRate / agent.hourlyRate;
        score.reasoning.push(`Above budget ($${agent.hourlyRate}/hr > $${maxRate}/hr)`);
      }
    } else {
      score.budgetMatch = 1.0; // No budget constraint
    }

    // 4. Experience/performance (10%)
    if (this.executiveRegistry) {
      const perf = this.executiveRegistry.getPerformance(agent.agentId);
      if (perf && perf.totalRatings > 0) {
        score.experienceMatch = perf.averageRating / 5.0; // Assuming 5-star rating
        score.reasoning.push(`Rating: ${perf.averageRating.toFixed(1)}/5.0 (${perf.totalRatings} reviews)`);
      } else {
        score.experienceMatch = 0.5; // No reviews = neutral
        score.reasoning.push('No reviews yet');
      }
    }

    // Calculate weighted total
    score.total =
      score.skillMatch * 0.4 +
      score.availabilityMatch * 0.3 +
      score.budgetMatch * 0.2 +
      score.experienceMatch * 0.1;

    return score;
  }

  /**
   * Calculate maximum hourly rate given monthly budget and allocation
   */
  calculateMaxHourlyRate(monthlyBudget, allocationPercentage) {
    const weeklyHours = (allocationPercentage / 100) * 40; // Assuming 40-hour work week
    const monthlyHours = weeklyHours * 4; // ~4 weeks per month
    return monthlyBudget / monthlyHours;
  }

  /**
   * Select an agent
   */
  async selectAgent(onboardingId, agentId) {
    const onboarding = this.onboardings.get(onboardingId);
    if (!onboarding) {
      throw new Error(`Onboarding not found: ${onboardingId}`);
    }

    // Verify agent is in matches
    const match = onboarding.matches.find(m => m.agentId === agentId);
    if (!match) {
      throw new Error(`Agent ${agentId} not in matches for onboarding ${onboardingId}`);
    }

    onboarding.selectedAgentId = agentId;
    onboarding.stage = this.stages.AGENT_SELECTED;

    if (this.db) {
      await this.db.query(
        `UPDATE executive_onboardings
         SET selected_agent_id = $1, stage = $2
         WHERE onboarding_id = $3`,
        [agentId, onboarding.stage, onboardingId]
      );
    }

    console.log(`[ExecutiveOnboarding] ${onboarding.companyName} selected agent: ${match.agentName}`);

    this.emit('agent_selected', { onboardingId, agentId, match });

    return onboarding;
  }

  /**
   * Negotiate contract terms
   */
  async negotiateContract(onboardingId, {
    allocationPercentage,
    hourlyRate,
    tier = 'side_project',
    scope,
    duration = null,
    nonCompeteRules = []
  }) {
    const onboarding = this.onboardings.get(onboardingId);
    if (!onboarding) {
      throw new Error(`Onboarding not found: ${onboardingId}`);
    }

    if (!onboarding.selectedAgentId) {
      throw new Error('No agent selected yet');
    }

    const contractTerms = {
      allocationPercentage,
      hourlyRate,
      tier,
      scope,
      duration,
      nonCompeteRules,
      estimatedMonthlyHours: (allocationPercentage / 100) * 40 * 4,
      estimatedMonthlyCost: hourlyRate * ((allocationPercentage / 100) * 40 * 4)
    };

    onboarding.contractTerms = contractTerms;
    onboarding.stage = this.stages.CONTRACT_NEGOTIATION;

    if (this.db) {
      await this.db.query(
        `UPDATE executive_onboardings
         SET contract_terms = $1, stage = $2
         WHERE onboarding_id = $3`,
        [JSON.stringify(contractTerms), onboarding.stage, onboardingId]
      );
    }

    console.log(`[ExecutiveOnboarding] Contract negotiated: ${allocationPercentage}% at $${hourlyRate}/hr`);

    this.emit('contract_negotiated', { onboardingId, contractTerms });

    return contractTerms;
  }

  /**
   * Create employment relationship
   */
  async createEmployment(onboardingId) {
    const onboarding = this.onboardings.get(onboardingId);
    if (!onboarding) {
      throw new Error(`Onboarding not found: ${onboardingId}`);
    }

    if (!onboarding.selectedAgentId || !onboarding.contractTerms) {
      throw new Error('Agent not selected or contract not negotiated');
    }

    if (!this.employmentTracker) {
      throw new Error('EmploymentTracker not available');
    }

    const employment = await this.employmentTracker.createEmployment({
      agentId: onboarding.selectedAgentId,
      companyId: onboarding.companyId,
      companyName: onboarding.companyName,
      tier: onboarding.contractTerms.tier,
      allocationPercentage: onboarding.contractTerms.allocationPercentage,
      hourlyRate: onboarding.contractTerms.hourlyRate,
      startDate: onboarding.startDate,
      endDate: onboarding.contractTerms.duration ? new Date(Date.now() + onboarding.contractTerms.duration * 24 * 60 * 60 * 1000) : null,
      roles: [onboarding.requestedRole],
      scope: onboarding.contractTerms.scope,
      nonCompeteRules: onboarding.contractTerms.nonCompeteRules,
      metadata: {
        onboardingId,
        onboardedAt: new Date()
      }
    });

    onboarding.employmentId = employment.employmentId;
    onboarding.stage = this.stages.EMPLOYMENT_CREATED;

    if (this.db) {
      await this.db.query(
        `UPDATE executive_onboardings
         SET employment_id = $1, stage = $2
         WHERE onboarding_id = $3`,
        [employment.employmentId, onboarding.stage, onboardingId]
      );
    }

    console.log(`[ExecutiveOnboarding] Employment created: ${employment.employmentId}`);

    this.emit('employment_created', { onboardingId, employmentId: employment.employmentId });

    // Send welcome message
    if (this.mailboxSystem) {
      await this.sendWelcomeMessage(onboarding);
    }

    return employment;
  }

  /**
   * Complete onboarding
   */
  async completeOnboarding(onboardingId) {
    const onboarding = this.onboardings.get(onboardingId);
    if (!onboarding) {
      throw new Error(`Onboarding not found: ${onboardingId}`);
    }

    onboarding.stage = this.stages.ONBOARDING_COMPLETE;
    onboarding.completedAt = new Date();

    if (this.db) {
      await this.db.query(
        `UPDATE executive_onboardings
         SET stage = $1, completed_at = NOW()
         WHERE onboarding_id = $2`,
        [onboarding.stage, onboardingId]
      );
    }

    console.log(`[ExecutiveOnboarding] Onboarding complete: ${onboarding.companyName}`);

    this.emit('onboarding_complete', onboarding);

    return onboarding;
  }

  /**
   * Send welcome message to company
   */
  async sendWelcomeMessage(onboarding) {
    const agent = this.executiveRegistry.getAgent(onboarding.selectedAgentId);

    await this.mailboxSystem.sendMail({
      fromUserId: 'system',
      toUserId: onboarding.companyId,
      subject: `Welcome to the Fractional Executive Agency!`,
      body: `Welcome ${onboarding.companyName}!\n\n` +
            `Your fractional ${onboarding.requestedRole}, ${agent.agentName}, is now onboarded.\n\n` +
            `Allocation: ${onboarding.contractTerms.allocationPercentage}%\n` +
            `Estimated hours: ${onboarding.contractTerms.estimatedMonthlyHours}h/month\n` +
            `Monthly cost: $${onboarding.contractTerms.estimatedMonthlyCost}\n\n` +
            `You'll receive a kickoff call scheduling link shortly.`,
      messageType: 'system',
      metadata: {
        onboardingId: onboarding.onboardingId,
        employmentId: onboarding.employmentId
      }
    });

    console.log(`[ExecutiveOnboarding] Sent welcome message to ${onboarding.companyName}`);
  }

  /**
   * Get onboarding status
   */
  getOnboardingStatus(onboardingId) {
    const onboarding = this.onboardings.get(onboardingId);
    if (!onboarding) {
      return null;
    }

    return {
      onboardingId: onboarding.onboardingId,
      companyName: onboarding.companyName,
      stage: onboarding.stage,
      selectedAgent: onboarding.selectedAgentId,
      matchCount: onboarding.matches.length,
      hasContract: !!onboarding.contractTerms,
      employmentCreated: !!onboarding.employmentId,
      createdAt: onboarding.createdAt,
      completedAt: onboarding.completedAt
    };
  }

  /**
   * Get all onboardings for a company
   */
  getCompanyOnboardings(companyId) {
    const onboardings = [];

    for (const onboarding of this.onboardings.values()) {
      if (onboarding.companyId === companyId) {
        onboardings.push(onboarding);
      }
    }

    return onboardings;
  }

  /**
   * Get stats
   */
  getStats() {
    const stats = {
      totalOnboardings: this.onboardings.size,
      byStage: {},
      averageMatchesPerRequest: 0,
      completionRate: 0
    };

    let totalMatches = 0;
    let completed = 0;

    for (const onboarding of this.onboardings.values()) {
      stats.byStage[onboarding.stage] = (stats.byStage[onboarding.stage] || 0) + 1;
      totalMatches += onboarding.matches.length;

      if (onboarding.stage === this.stages.ONBOARDING_COMPLETE) {
        completed++;
      }
    }

    stats.averageMatchesPerRequest = this.onboardings.size > 0 ? totalMatches / this.onboardings.size : 0;
    stats.completionRate = this.onboardings.size > 0 ? (completed / this.onboardings.size) * 100 : 0;

    return stats;
  }
}

module.exports = ExecutiveOnboarding;
