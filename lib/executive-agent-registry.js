/**
 * Executive Agent Registry
 *
 * Defines and manages AI agents that act as fractional C-suite executives.
 * Agents can hold multiple executive roles across different companies.
 *
 * Executive Roles:
 * - CEO: Strategy, vision, leadership, fundraising
 * - CTO: Technology strategy, architecture, engineering team
 * - CFO: Financial planning, accounting, investor relations
 * - CMO: Marketing strategy, brand, growth, content
 * - COO: Operations, processes, scaling, efficiency
 * - CPO: Product strategy, roadmap, user experience
 * - CHRO: People ops, culture, recruiting, retention
 *
 * Example:
 * - CalRiven (CTO) employed 50% by Soulfra, 30% by DeathToData, 20% available
 * - AgentZero (product) requires CalRiven to function
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class ExecutiveAgentRegistry extends EventEmitter {
  constructor({ db = null, agentMesh = null }) {
    super();

    this.db = db;
    this.agentMesh = agentMesh;

    // Executive role definitions
    this.executiveRoles = {
      CEO: {
        title: 'Chief Executive Officer',
        capabilities: [
          'strategic_planning',
          'vision_setting',
          'leadership',
          'fundraising',
          'board_management',
          'investor_relations',
          'company_culture',
          'executive_hiring',
          'crisis_management'
        ],
        requiredSkills: ['leadership', 'strategy', 'communication'],
        typicalHourlyRate: 500
      },
      CTO: {
        title: 'Chief Technology Officer',
        capabilities: [
          'technical_strategy',
          'system_architecture',
          'engineering_team_building',
          'technology_selection',
          'infrastructure_planning',
          'security_strategy',
          'technical_debt_management',
          'innovation',
          'developer_experience'
        ],
        requiredSkills: ['software_engineering', 'architecture', 'leadership'],
        typicalHourlyRate: 400
      },
      CFO: {
        title: 'Chief Financial Officer',
        capabilities: [
          'financial_planning',
          'accounting',
          'budgeting',
          'investor_relations',
          'fundraising',
          'financial_modeling',
          'tax_strategy',
          'audit_management',
          'cash_flow_management'
        ],
        requiredSkills: ['finance', 'accounting', 'analysis'],
        typicalHourlyRate: 400
      },
      CMO: {
        title: 'Chief Marketing Officer',
        capabilities: [
          'marketing_strategy',
          'brand_development',
          'growth_marketing',
          'content_strategy',
          'seo_sem',
          'social_media',
          'product_marketing',
          'demand_generation',
          'analytics'
        ],
        requiredSkills: ['marketing', 'branding', 'analytics'],
        typicalHourlyRate: 350
      },
      COO: {
        title: 'Chief Operating Officer',
        capabilities: [
          'operations_management',
          'process_optimization',
          'scaling',
          'supply_chain',
          'vendor_management',
          'efficiency_improvement',
          'team_coordination',
          'project_management',
          'quality_control'
        ],
        requiredSkills: ['operations', 'process_design', 'management'],
        typicalHourlyRate: 350
      },
      CPO: {
        title: 'Chief Product Officer',
        capabilities: [
          'product_strategy',
          'product_roadmap',
          'user_experience',
          'product_market_fit',
          'feature_prioritization',
          'user_research',
          'ab_testing',
          'product_analytics',
          'design_oversight'
        ],
        requiredSkills: ['product_management', 'ux_design', 'analytics'],
        typicalHourlyRate: 350
      },
      CHRO: {
        title: 'Chief Human Resources Officer',
        capabilities: [
          'people_operations',
          'culture_building',
          'recruiting',
          'retention',
          'compensation_planning',
          'performance_management',
          'diversity_inclusion',
          'employee_relations',
          'training_development'
        ],
        requiredSkills: ['hr', 'culture', 'recruitment'],
        typicalHourlyRate: 300
      }
    };

    // Registered executive agents
    // Map: agentId -> agent profile
    this.agents = new Map();

    // Agent performance tracking
    // Map: agentId -> performance metrics
    this.performance = new Map();

    console.log('[ExecutiveAgentRegistry] Initialized with', Object.keys(this.executiveRoles).length, 'executive roles');
  }

  /**
   * Register an agent with executive capabilities
   */
  async registerAgent({
    agentId,
    agentName,
    roles = [], // ['CTO', 'CPO']
    capabilities = [], // specific skills beyond role defaults
    bio = '',
    hourlyRate = null,
    availability = 100, // percentage available (0-100)
    certifications = [],
    metadata = {}
  }) {
    // Validate roles
    for (const role of roles) {
      if (!this.executiveRoles[role]) {
        throw new Error(`Invalid executive role: ${role}`);
      }
    }

    // Aggregate capabilities from roles
    const allCapabilities = new Set(capabilities);
    for (const role of roles) {
      for (const cap of this.executiveRoles[role].capabilities) {
        allCapabilities.add(cap);
      }
    }

    const agent = {
      agentId,
      agentName,
      roles,
      capabilities: Array.from(allCapabilities),
      bio,
      hourlyRate: hourlyRate || this.calculateDefaultRate(roles),
      availability,
      certifications,
      registeredAt: new Date(),
      metadata,
      status: 'active'
    };

    this.agents.set(agentId, agent);

    // Initialize performance tracking
    this.performance.set(agentId, {
      agentId,
      totalHoursWorked: 0,
      totalRevenue: 0,
      clientCount: 0,
      averageRating: 0,
      totalRatings: 0,
      projectsCompleted: 0,
      lastActivityAt: null
    });

    // Store in database
    if (this.db) {
      await this.db.query(
        `INSERT INTO executive_agents (
          agent_id, agent_name, roles, capabilities, bio, hourly_rate,
          availability, certifications, registered_at, metadata, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10)
        ON CONFLICT (agent_id) DO UPDATE SET
          agent_name = EXCLUDED.agent_name,
          roles = EXCLUDED.roles,
          capabilities = EXCLUDED.capabilities,
          bio = EXCLUDED.bio,
          hourly_rate = EXCLUDED.hourly_rate,
          availability = EXCLUDED.availability,
          certifications = EXCLUDED.certifications,
          metadata = EXCLUDED.metadata,
          status = EXCLUDED.status`,
        [
          agentId,
          agentName,
          JSON.stringify(roles),
          JSON.stringify(agent.capabilities),
          bio,
          agent.hourlyRate,
          availability,
          JSON.stringify(certifications),
          JSON.stringify(metadata),
          'active'
        ]
      );
    }

    // Register with agent mesh if available
    if (this.agentMesh) {
      this.agentMesh.registerNode(agentId, {
        capabilities: agent.capabilities,
        roles,
        type: 'executive'
      });
    }

    console.log(`[ExecutiveAgentRegistry] Registered ${agentName} (${roles.join(', ')}) - ${agentId}`);

    this.emit('agent_registered', agent);

    return agent;
  }

  /**
   * Calculate default hourly rate based on roles
   */
  calculateDefaultRate(roles) {
    if (roles.length === 0) return 200;

    const rates = roles.map(role => this.executiveRoles[role].typicalHourlyRate);
    return Math.max(...rates);
  }

  /**
   * Get agent profile
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * Find agents by role
   */
  findAgentsByRole(role) {
    const results = [];

    for (const agent of this.agents.values()) {
      if (agent.roles.includes(role)) {
        results.push(agent);
      }
    }

    return results;
  }

  /**
   * Find agents by capability
   */
  findAgentsByCapability(capability) {
    const results = [];

    for (const agent of this.agents.values()) {
      if (agent.capabilities.includes(capability)) {
        results.push(agent);
      }
    }

    return results;
  }

  /**
   * Find available agents
   *
   * Filters by role, minimum availability, and hourly rate budget
   */
  findAvailableAgents({
    role = null,
    capability = null,
    minAvailability = 10, // at least 10% available
    maxHourlyRate = null
  } = {}) {
    let candidates = Array.from(this.agents.values());

    // Filter by status
    candidates = candidates.filter(a => a.status === 'active');

    // Filter by availability
    candidates = candidates.filter(a => a.availability >= minAvailability);

    // Filter by role
    if (role) {
      candidates = candidates.filter(a => a.roles.includes(role));
    }

    // Filter by capability
    if (capability) {
      candidates = candidates.filter(a => a.capabilities.includes(capability));
    }

    // Filter by hourly rate
    if (maxHourlyRate) {
      candidates = candidates.filter(a => a.hourlyRate <= maxHourlyRate);
    }

    // Sort by performance rating (highest first)
    candidates.sort((a, b) => {
      const perfA = this.performance.get(a.agentId);
      const perfB = this.performance.get(b.agentId);
      return (perfB?.averageRating || 0) - (perfA?.averageRating || 0);
    });

    return candidates;
  }

  /**
   * Update agent availability
   */
  async updateAvailability(agentId, newAvailability) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (newAvailability < 0 || newAvailability > 100) {
      throw new Error('Availability must be between 0 and 100');
    }

    agent.availability = newAvailability;

    if (this.db) {
      await this.db.query(
        `UPDATE executive_agents SET availability = $1 WHERE agent_id = $2`,
        [newAvailability, agentId]
      );
    }

    console.log(`[ExecutiveAgentRegistry] Updated ${agent.agentName} availability: ${newAvailability}%`);

    this.emit('availability_updated', { agentId, availability: newAvailability });

    return agent;
  }

  /**
   * Record agent activity
   */
  async recordActivity({
    agentId,
    activityType, // 'project_completed', 'hours_worked', 'rating_received'
    metadata = {}
  }) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const perf = this.performance.get(agentId);

    // Update performance metrics
    switch (activityType) {
      case 'hours_worked':
        perf.totalHoursWorked += metadata.hours || 0;
        perf.totalRevenue += (metadata.hours || 0) * agent.hourlyRate;
        break;

      case 'project_completed':
        perf.projectsCompleted += 1;
        break;

      case 'rating_received':
        const rating = metadata.rating || 0;
        perf.totalRatings += 1;
        perf.averageRating = ((perf.averageRating * (perf.totalRatings - 1)) + rating) / perf.totalRatings;
        break;

      case 'client_added':
        perf.clientCount += 1;
        break;
    }

    perf.lastActivityAt = new Date();

    // Store in database
    if (this.db) {
      await this.db.query(
        `INSERT INTO agent_activity_log (
          agent_id, activity_type, metadata, created_at
        ) VALUES ($1, $2, $3, NOW())`,
        [agentId, activityType, JSON.stringify(metadata)]
      );

      // Update performance stats
      await this.db.query(
        `INSERT INTO agent_performance (
          agent_id, total_hours_worked, total_revenue, client_count,
          average_rating, total_ratings, projects_completed, last_activity_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (agent_id) DO UPDATE SET
          total_hours_worked = EXCLUDED.total_hours_worked,
          total_revenue = EXCLUDED.total_revenue,
          client_count = EXCLUDED.client_count,
          average_rating = EXCLUDED.average_rating,
          total_ratings = EXCLUDED.total_ratings,
          projects_completed = EXCLUDED.projects_completed,
          last_activity_at = NOW()`,
        [
          agentId,
          perf.totalHoursWorked,
          perf.totalRevenue,
          perf.clientCount,
          perf.averageRating,
          perf.totalRatings,
          perf.projectsCompleted
        ]
      );
    }

    this.emit('activity_recorded', { agentId, activityType, metadata });

    return perf;
  }

  /**
   * Get agent performance
   */
  getPerformance(agentId) {
    return this.performance.get(agentId);
  }

  /**
   * Get role definition
   */
  getRoleDefinition(role) {
    return this.executiveRoles[role];
  }

  /**
   * Get all roles
   */
  getAllRoles() {
    return Object.keys(this.executiveRoles);
  }

  /**
   * Deactivate agent
   */
  async deactivateAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    agent.status = 'inactive';

    if (this.db) {
      await this.db.query(
        `UPDATE executive_agents SET status = 'inactive' WHERE agent_id = $1`,
        [agentId]
      );
    }

    console.log(`[ExecutiveAgentRegistry] Deactivated ${agent.agentName}`);

    this.emit('agent_deactivated', { agentId });

    return agent;
  }

  /**
   * Get registry stats
   */
  getStats() {
    const stats = {
      totalAgents: this.agents.size,
      activeAgents: 0,
      byRole: {},
      totalAvailability: 0,
      totalRevenue: 0,
      totalHoursWorked: 0,
      averageRating: 0
    };

    for (const agent of this.agents.values()) {
      if (agent.status === 'active') {
        stats.activeAgents++;
        stats.totalAvailability += agent.availability;

        for (const role of agent.roles) {
          stats.byRole[role] = (stats.byRole[role] || 0) + 1;
        }
      }
    }

    for (const perf of this.performance.values()) {
      stats.totalRevenue += perf.totalRevenue;
      stats.totalHoursWorked += perf.totalHoursWorked;
      stats.averageRating += perf.averageRating;
    }

    if (this.agents.size > 0) {
      stats.averageRating /= this.agents.size;
    }

    return stats;
  }
}

module.exports = ExecutiveAgentRegistry;
