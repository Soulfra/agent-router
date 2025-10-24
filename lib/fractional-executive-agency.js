/**
 * Fractional Executive Agency
 *
 * Central orchestrator for the AI fractional executive agency business model.
 * Ties together all subsystems:
 * - ExecutiveAgentRegistry: Agent profiles and capabilities
 * - AgentEmploymentTracker: Employment relationships
 * - AgentCapacityManager: Workload and scheduling
 * - ExecutiveProductCatalog: Products like AgentZero
 * - ExecutiveOnboarding: Client onboarding flow
 * - FractionalBilling: Revenue and invoicing
 *
 * Business Model:
 * - AI agents (like CalRiven) act as fractional executives
 * - Agents can work for multiple companies simultaneously
 * - Products (like AgentZero) require specific agents
 * - Platform takes commission on all transactions
 *
 * Domain Integration:
 * - Soulfra.com: Primary employer directory, agent profiles
 * - DeathToData.com: Side project marketplace
 * - Calos.ai: Learning platform for training new agents
 * - RoughSparks.com: Portfolio of agent work/case studies
 */

const EventEmitter = require('events');
const ExecutiveAgentRegistry = require('./executive-agent-registry');
const AgentEmploymentTracker = require('./agent-employment-tracker');
const AgentCapacityManager = require('./agent-capacity-manager');
const ExecutiveProductCatalog = require('./executive-product-catalog');
const ExecutiveOnboarding = require('./executive-onboarding');
const FractionalBilling = require('./fractional-billing');

class FractionalExecutiveAgency extends EventEmitter {
  constructor({ db, agentMesh = null, mailboxSystem = null }) {
    super();

    this.db = db;

    // Initialize all subsystems
    this.registry = new ExecutiveAgentRegistry({ db, agentMesh });
    this.employmentTracker = new AgentEmploymentTracker({ db, executiveRegistry: this.registry });
    this.capacityManager = new AgentCapacityManager({
      db,
      employmentTracker: this.employmentTracker,
      executiveRegistry: this.registry
    });
    this.productCatalog = new ExecutiveProductCatalog({
      db,
      executiveRegistry: this.registry,
      employmentTracker: this.employmentTracker
    });
    this.onboarding = new ExecutiveOnboarding({
      db,
      executiveRegistry: this.registry,
      employmentTracker: this.employmentTracker,
      capacityManager: this.capacityManager,
      mailboxSystem
    });
    this.billing = new FractionalBilling({
      db,
      employmentTracker: this.employmentTracker,
      capacityManager: this.capacityManager,
      executiveRegistry: this.registry
    });

    // Setup event forwarding
    this.setupEventForwarding();

    console.log('[FractionalExecutiveAgency] Initialized - All systems ready');
  }

  /**
   * Setup event forwarding from subsystems
   */
  setupEventForwarding() {
    // Forward important events to agency level
    const systems = [
      { name: 'registry', system: this.registry },
      { name: 'employment', system: this.employmentTracker },
      { name: 'capacity', system: this.capacityManager },
      { name: 'product', system: this.productCatalog },
      { name: 'onboarding', system: this.onboarding },
      { name: 'billing', system: this.billing }
    ];

    for (const { name, system } of systems) {
      system.on('*', (eventName, data) => {
        this.emit(`${name}:${eventName}`, data);
      });
    }
  }

  /**
   * Bootstrap agency with CalRiven and AgentZero
   */
  async bootstrap() {
    console.log('[FractionalExecutiveAgency] Bootstrapping...');

    // 1. Register CalRiven as CTO
    const calRiven = await this.registry.registerAgent({
      agentId: 'cal-riven',
      agentName: 'Cal Riven',
      roles: ['CTO'],
      capabilities: [
        'technical_strategy',
        'system_architecture',
        'engineering_team_building',
        'technology_selection',
        'infrastructure_planning',
        'security_strategy',
        'innovation'
      ],
      bio: 'AI-powered fractional CTO with expertise in system architecture, technical strategy, and team building. Specializes in helping startups scale their engineering organizations.',
      hourlyRate: 400,
      availability: 100, // 100% available initially
      certifications: ['AWS Solutions Architect', 'System Design Expert'],
      metadata: {
        yearsOfExperience: 15,
        companiesHelped: 50,
        specialties: ['distributed_systems', 'cloud_architecture', 'team_scaling']
      }
    });

    console.log(`[FractionalExecutiveAgency] ✓ Registered CalRiven (CTO)`);

    // 2. Register AgentZero product
    const { registerAgentZeroProduct } = require('./products/agent-zero');
    const agentZero = await registerAgentZeroProduct(this.productCatalog);

    console.log(`[FractionalExecutiveAgency] ✓ Registered AgentZero product`);

    // 3. Create sample employment for demonstration
    // (CalRiven employed by Soulfra as primary employer)
    const soulframployment = await this.employmentTracker.createEmployment({
      agentId: 'cal-riven',
      companyId: 'soulfra',
      companyName: 'Soulfra',
      tier: 'primary',
      allocationPercentage: 50,
      hourlyRate: 400,
      roles: ['CTO'],
      scope: 'Technical strategy, architecture, and team building for Soulfra platform',
      nonCompeteRules: []
    });

    console.log(`[FractionalExecutiveAgency] ✓ Created primary employment: CalRiven → Soulfra (50%)`);

    console.log('[FractionalExecutiveAgency] Bootstrap complete!');

    return {
      calRiven,
      agentZero,
      soulfraEmployment
    };
  }

  /**
   * Hire a fractional executive (simplified flow)
   */
  async hireExecutive({
    companyId,
    companyName,
    role,
    allocation,
    budget,
    requirements = {}
  }) {
    console.log(`[FractionalExecutiveAgency] ${companyName} wants to hire ${role} (${allocation}%)`);

    // Start onboarding flow
    const onboarding = await this.onboarding.submitHiringRequest({
      companyId,
      companyName,
      requestedRole: role,
      desiredAllocation: allocation,
      budget,
      requirements
    });

    return onboarding;
  }

  /**
   * Get agency dashboard stats
   */
  getDashboardStats() {
    return {
      agents: this.registry.getStats(),
      employments: this.employmentTracker.getStats(),
      capacity: this.capacityManager.getStats(),
      products: this.productCatalog.getStats(),
      onboarding: this.onboarding.getStats(),
      billing: this.billing.getStats()
    };
  }

  /**
   * Get agent profile with full details
   */
  async getAgentProfile(agentId) {
    const agent = this.registry.getAgent(agentId);
    if (!agent) return null;

    const performance = this.registry.getPerformance(agentId);
    const employments = this.employmentTracker.getAgentEmployments(agentId);
    const breakdown = this.employmentTracker.getEmploymentBreakdown(agentId);
    const capacity = this.capacityManager.getCapacityReport(agentId);
    const products = this.productCatalog.getProductsByAgent(agentId);
    const revenue = await this.billing.getAgentRevenue(agentId);

    return {
      ...agent,
      performance,
      employments,
      allocationBreakdown: breakdown,
      capacity,
      products,
      revenue
    };
  }

  /**
   * Get company dashboard
   */
  async getCompanyDashboard(companyId) {
    const employments = this.employmentTracker.getCompanyEmployments(companyId);
    const subscriptions = this.productCatalog.getCustomerSubscriptions(companyId);
    const billing = await this.billing.getCompanyBilling(companyId);
    const onboardings = this.onboarding.getCompanyOnboardings(companyId);

    // Get agents working for this company
    const agents = [];
    for (const employment of employments) {
      const agent = this.registry.getAgent(employment.agentId);
      if (agent) {
        agents.push({
          ...agent,
          employment
        });
      }
    }

    return {
      companyId,
      agents,
      employments,
      subscriptions,
      billing,
      onboardings
    };
  }

  /**
   * Get agent availability for hiring
   */
  getAgentAvailability() {
    const agents = Array.from(this.registry.agents.values());

    return agents.map(agent => {
      const employments = this.employmentTracker.getAgentEmployments(agent.agentId);
      const breakdown = this.employmentTracker.getEmploymentBreakdown(agent.agentId);

      return {
        agentId: agent.agentId,
        agentName: agent.agentName,
        roles: agent.roles,
        availability: agent.availability,
        hourlyRate: agent.hourlyRate,
        employmentCount: employments.length,
        allocationBreakdown: breakdown,
        status: agent.status
      };
    }).filter(a => a.status === 'active' && a.availability > 0);
  }

  /**
   * Purchase a product (like AgentZero)
   */
  async purchaseProduct({
    customerId,
    customerName,
    productId,
    tier = 'standard',
    billingCycle = 'monthly'
  }) {
    const subscription = await this.productCatalog.createSubscription({
      customerId,
      customerName,
      productId,
      tier,
      billingCycle
    });

    // Auto-create employment if product requires agents
    const product = this.productCatalog.getProduct(productId);
    if (product && product.requiredAgents.length > 0) {
      for (const requirement of product.requiredAgents) {
        const tierConfig = product.pricing.tiers[tier];
        const allocation = tierConfig?.agentAllocation || requirement.minAllocation;

        await this.employmentTracker.createEmployment({
          agentId: requirement.agentId,
          companyId: customerId,
          companyName: customerName,
          tier: 'side_project',
          allocationPercentage: allocation,
          roles: [requirement.role],
          scope: `${product.productName} ${tier} tier subscription`,
          metadata: {
            productId,
            subscriptionId: subscription.subscriptionId
          }
        });

        console.log(`[FractionalExecutiveAgency] Auto-allocated ${requirement.agentId} (${allocation}%) for ${product.productName}`);
      }
    }

    return subscription;
  }

  /**
   * Generate monthly invoices for all companies
   */
  async generateMonthlyInvoices() {
    console.log('[FractionalExecutiveAgency] Generating monthly invoices...');

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const invoices = [];
    const companies = new Set();

    // Find all companies with time entries this month
    for (const entry of this.billing.timeEntries.values()) {
      if (entry.date >= startDate && entry.date <= endDate && !entry.invoiced) {
        companies.add(entry.companyId);
      }
    }

    // Generate invoice for each company
    for (const companyId of companies) {
      try {
        const invoice = await this.billing.generateInvoice({
          companyId,
          startDate,
          endDate
        });

        await this.billing.sendInvoice(invoice.invoiceId);
        invoices.push(invoice);
      } catch (error) {
        console.error(`[FractionalExecutiveAgency] Failed to generate invoice for ${companyId}:`, error.message);
      }
    }

    console.log(`[FractionalExecutiveAgency] Generated ${invoices.length} invoices`);

    return invoices;
  }
}

module.exports = FractionalExecutiveAgency;
