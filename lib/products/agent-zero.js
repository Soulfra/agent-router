/**
 * AgentZero - Flagship AI Executive Product
 *
 * AgentZero is a premium product that REQUIRES CalRiven (CTO agent) to function.
 * This demonstrates the product-agent dependency model.
 *
 * Product Overview:
 * - AgentZero is an AI-powered technical advisory service
 * - Requires CalRiven (CTO) for at least 15% time allocation
 * - Provides architecture reviews, technical strategy, and team guidance
 * - Monthly subscription with tiered pricing
 *
 * Business Model:
 * - When customers purchase AgentZero, CalRiven's time is automatically allocated
 * - CalRiven might be employed by multiple companies via AgentZero subscriptions
 * - Product price includes bundled CTO time
 *
 * Example:
 * - Company A subscribes to AgentZero Standard → allocates 15% of CalRiven's time
 * - Company B subscribes to AgentZero Professional → allocates 25% of CalRiven's time
 * - CalRiven's availability decreases as more companies subscribe
 */

const AGENT_ZERO_PRODUCT_DEF = {
  productId: 'agent-zero-v1',
  productName: 'AgentZero',
  productSlug: 'agent-zero',
  description: 'AI-powered technical advisory service with dedicated CTO support. Get expert architecture reviews, technical strategy, and team guidance from CalRiven, our fractional CTO.',
  version: '1.0.0',

  // Critical: This product REQUIRES CalRiven to function
  requiredAgents: [
    {
      agentId: 'cal-riven', // Must match the registered agent ID
      role: 'CTO',
      minAllocation: 15, // Minimum 15% of CalRiven's time per subscription
      capabilities: [
        'technical_strategy',
        'system_architecture',
        'engineering_team_building',
        'technology_selection',
        'infrastructure_planning'
      ]
    }
  ],

  // Optional agents that can enhance the service
  optionalAgents: [
    {
      agentId: 'agent-architect', // Hypothetical assistant CTO
      role: 'Technical Architect',
      capabilities: ['architecture', 'code_review']
    }
  ],

  // Pricing tiers
  pricing: {
    currency: 'USD',
    tiers: {
      standard: {
        name: 'Standard',
        monthlyPrice: 5000,
        annualPrice: 50000, // ~17% discount
        agentAllocation: 15, // 15% of CalRiven's time (~6 hours/week)
        features: [
          'Weekly architecture reviews',
          'Monthly technical strategy sessions',
          'Slack/Discord access to CalRiven',
          'Code review support',
          'Technical documentation review'
        ],
        limits: {
          weeklyHours: 6,
          monthlyMeetings: 4
        }
      },

      professional: {
        name: 'Professional',
        monthlyPrice: 10000,
        annualPrice: 100000,
        agentAllocation: 25, // 25% of CalRiven's time (~10 hours/week)
        features: [
          'All Standard features',
          'Bi-weekly architecture reviews',
          'Weekly technical strategy sessions',
          'Team hiring support',
          'Technology stack selection',
          'Infrastructure planning',
          'On-call technical advisory'
        ],
        limits: {
          weeklyHours: 10,
          monthlyMeetings: 8
        }
      },

      enterprise: {
        name: 'Enterprise',
        monthlyPrice: 20000,
        annualPrice: 200000,
        agentAllocation: 40, // 40% of CalRiven's time (~16 hours/week)
        features: [
          'All Professional features',
          'Daily technical oversight',
          'Dedicated technical strategy',
          'Full hiring support',
          'Board meeting participation',
          'Investor technical due diligence support',
          'Custom SLA',
          'Priority scheduling'
        ],
        limits: {
          weeklyHours: 16,
          monthlyMeetings: 16
        }
      }
    }
  },

  // Product features
  features: [
    'Fractional CTO services',
    'Technical architecture guidance',
    'Team building & hiring support',
    'Technology strategy',
    'Infrastructure planning',
    'Code & design reviews',
    'Investor relations support'
  ],

  // Subscription requirements
  subscriptionRequirements: {
    minimumCommitment: '3 months',
    onboardingTime: '2 weeks',
    cancellationNotice: '30 days'
  },

  // Business metadata
  metadata: {
    category: 'executive_services',
    targetMarket: 'Series A-C startups',
    verticals: ['SaaS', 'FinTech', 'HealthTech', 'Enterprise Software'],
    launchDate: '2025-01-01',
    status: 'active'
  }
};

/**
 * Helper function to register AgentZero product
 */
async function registerAgentZeroProduct(productCatalog) {
  const product = await productCatalog.registerProduct(AGENT_ZERO_PRODUCT_DEF);

  console.log('[AgentZero] Product registered successfully');
  console.log(`[AgentZero] Requires: CalRiven (CTO) with minimum ${AGENT_ZERO_PRODUCT_DEF.requiredAgents[0].minAllocation}% allocation`);
  console.log(`[AgentZero] Pricing tiers:`, Object.keys(AGENT_ZERO_PRODUCT_DEF.pricing.tiers).join(', '));

  return product;
}

/**
 * Helper function to purchase AgentZero subscription
 */
async function purchaseAgentZero(productCatalog, {
  customerId,
  customerName,
  tier = 'standard',
  billingCycle = 'monthly'
}) {
  // Validate tier
  const validTiers = Object.keys(AGENT_ZERO_PRODUCT_DEF.pricing.tiers);
  if (!validTiers.includes(tier)) {
    throw new Error(`Invalid tier: ${tier}. Valid tiers: ${validTiers.join(', ')}`);
  }

  const tierConfig = AGENT_ZERO_PRODUCT_DEF.pricing.tiers[tier];

  const subscription = await productCatalog.createSubscription({
    customerId,
    customerName,
    productId: AGENT_ZERO_PRODUCT_DEF.productId,
    tier,
    billingCycle,
    metadata: {
      tierFeatures: tierConfig.features,
      weeklyHours: tierConfig.limits.weeklyHours,
      agentAllocation: tierConfig.agentAllocation
    }
  });

  console.log(`[AgentZero] Subscription created: ${customerName} → ${tier} tier`);
  console.log(`[AgentZero] Allocated ${tierConfig.agentAllocation}% of CalRiven's time`);

  return subscription;
}

/**
 * Get AgentZero product availability
 *
 * Checks if CalRiven has enough availability for new subscriptions
 */
async function getAgentZeroAvailability(executiveRegistry, productCatalog) {
  const calRiven = executiveRegistry.getAgent('cal-riven');
  if (!calRiven) {
    return {
      available: false,
      reason: 'CalRiven not found in registry',
      currentAvailability: 0
    };
  }

  const minAllocation = AGENT_ZERO_PRODUCT_DEF.requiredAgents[0].minAllocation;

  // Check each tier
  const tierAvailability = {};
  for (const [tierName, tierConfig] of Object.entries(AGENT_ZERO_PRODUCT_DEF.pricing.tiers)) {
    tierAvailability[tierName] = {
      available: calRiven.availability >= tierConfig.agentAllocation,
      requiredAllocation: tierConfig.agentAllocation,
      monthlyPrice: tierConfig.monthlyPrice
    };
  }

  return {
    available: calRiven.availability >= minAllocation,
    currentAvailability: calRiven.availability,
    minAllocation,
    tiers: tierAvailability
  };
}

module.exports = {
  AGENT_ZERO_PRODUCT_DEF,
  registerAgentZeroProduct,
  purchaseAgentZero,
  getAgentZeroAvailability
};
