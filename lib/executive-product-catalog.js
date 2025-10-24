/**
 * Executive Product Catalog
 *
 * Manages products and services that depend on specific AI executive agents.
 * Enables business model where products require certain agents to function.
 *
 * Example:
 * - AgentZero product requires CalRiven (CTO) to operate
 * - Customers purchase AgentZero, which automatically allocates CalRiven's time
 * - Product pricing can include agent time bundled in
 *
 * Features:
 * - Product definitions with agent dependencies
 * - Version tracking (AgentZero v1 requires CalRiven, v2 might work with others)
 * - Subscription management
 * - Agent allocation bundled with product
 * - Product-agent compatibility checking
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class ExecutiveProductCatalog extends EventEmitter {
  constructor({ db = null, executiveRegistry = null, employmentTracker = null }) {
    super();

    this.db = db;
    this.executiveRegistry = executiveRegistry;
    this.employmentTracker = employmentTracker;

    // Product definitions
    // Map: productId -> product
    this.products = new Map();

    // Active subscriptions
    // Map: subscriptionId -> subscription
    this.subscriptions = new Map();

    console.log('[ExecutiveProductCatalog] Initialized');
  }

  /**
   * Register a product
   */
  async registerProduct({
    productId,
    productName,
    productSlug,
    description = '',
    version = '1.0.0',
    requiredAgents = [], // [{ agentId, role, minAllocation }]
    optionalAgents = [],
    pricing = {},
    features = [],
    metadata = {}
  }) {
    // Validate required agents exist
    if (this.executiveRegistry) {
      for (const requirement of requiredAgents) {
        const agent = this.executiveRegistry.getAgent(requirement.agentId);
        if (!agent) {
          throw new Error(`Required agent not found: ${requirement.agentId}`);
        }
      }
    }

    const product = {
      productId,
      productName,
      productSlug,
      description,
      version,
      requiredAgents,
      optionalAgents,
      pricing,
      features,
      status: 'active',
      createdAt: new Date(),
      metadata
    };

    this.products.set(productId, product);

    if (this.db) {
      await this.db.query(
        `INSERT INTO executive_product_catalog (
          product_id, product_name, product_slug, description, version,
          required_agents, optional_agents, pricing, features,
          status, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
        ON CONFLICT (product_id) DO UPDATE SET
          product_name = EXCLUDED.product_name,
          description = EXCLUDED.description,
          version = EXCLUDED.version,
          required_agents = EXCLUDED.required_agents,
          optional_agents = EXCLUDED.optional_agents,
          pricing = EXCLUDED.pricing,
          features = EXCLUDED.features,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata`,
        [
          productId,
          productName,
          productSlug,
          description,
          version,
          JSON.stringify(requiredAgents),
          JSON.stringify(optionalAgents),
          JSON.stringify(pricing),
          JSON.stringify(features),
          'active',
          JSON.stringify(metadata)
        ]
      );
    }

    console.log(`[ExecutiveProductCatalog] Registered product: ${productName} v${version} (requires ${requiredAgents.length} agents)`);

    this.emit('product_registered', product);

    return product;
  }

  /**
   * Create subscription (customer purchases product)
   */
  async createSubscription({
    customerId,
    customerName,
    productId,
    tier = 'standard', // standard, professional, enterprise
    billingCycle = 'monthly', // monthly, quarterly, annual
    startDate = new Date(),
    autoRenew = true,
    metadata = {}
  }) {
    const product = this.products.get(productId);
    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    // Check if required agents are available
    const agentCheck = await this.checkAgentAvailability(product);
    if (!agentCheck.available) {
      throw new Error(`Cannot create subscription: ${agentCheck.reason}`);
    }

    const subscriptionId = crypto.randomUUID();

    const subscription = {
      subscriptionId,
      customerId,
      customerName,
      productId,
      productName: product.productName,
      tier,
      billingCycle,
      startDate,
      nextBillingDate: this.calculateNextBillingDate(startDate, billingCycle),
      autoRenew,
      status: 'active',
      allocatedAgents: [], // Will be filled when agents are allocated
      createdAt: new Date(),
      metadata
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Allocate required agents
    const allocations = await this.allocateAgentsForSubscription(subscriptionId, product);
    subscription.allocatedAgents = allocations;

    if (this.db) {
      await this.db.query(
        `INSERT INTO executive_product_subscriptions (
          subscription_id, customer_id, customer_name, product_id, product_name,
          tier, billing_cycle, start_date, next_billing_date, auto_renew,
          status, allocated_agents, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)`,
        [
          subscriptionId,
          customerId,
          customerName,
          productId,
          product.productName,
          tier,
          billingCycle,
          startDate,
          subscription.nextBillingDate,
          autoRenew,
          'active',
          JSON.stringify(allocations),
          JSON.stringify(metadata)
        ]
      );
    }

    console.log(`[ExecutiveProductCatalog] Created subscription: ${customerName} → ${product.productName} (${allocations.length} agents allocated)`);

    this.emit('subscription_created', subscription);

    return subscription;
  }

  /**
   * Check if required agents are available
   */
  async checkAgentAvailability(product) {
    for (const requirement of product.requiredAgents) {
      if (!this.executiveRegistry) {
        return { available: true }; // Can't check without registry
      }

      const agent = this.executiveRegistry.getAgent(requirement.agentId);
      if (!agent) {
        return {
          available: false,
          reason: `Required agent not found: ${requirement.agentId}`
        };
      }

      // Check if agent has enough availability
      const minAllocation = requirement.minAllocation || 10;
      if (agent.availability < minAllocation) {
        return {
          available: false,
          reason: `Agent ${agent.agentName} has insufficient availability (${agent.availability}% < ${minAllocation}%)`
        };
      }
    }

    return { available: true };
  }

  /**
   * Allocate agents for subscription
   */
  async allocateAgentsForSubscription(subscriptionId, product) {
    const allocations = [];

    // For now, create employment relationships for required agents
    // In a real system, this might auto-create employment contracts
    for (const requirement of product.requiredAgents) {
      allocations.push({
        agentId: requirement.agentId,
        role: requirement.role,
        allocationPercentage: requirement.minAllocation || 10,
        subscriptionId
      });

      // Note: Actual employment creation would happen via employmentTracker
      // For products, you might want to auto-create side_project or consulting employments
    }

    return allocations;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId, cancelDate = new Date(), reason = '') {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    subscription.status = 'cancelled';
    subscription.cancelDate = cancelDate;
    subscription.cancelReason = reason;

    if (this.db) {
      await this.db.query(
        `UPDATE executive_product_subscriptions
         SET status = 'cancelled', metadata = metadata || $2::jsonb
         WHERE subscription_id = $1`,
        [subscriptionId, JSON.stringify({ cancelDate, cancelReason: reason })]
      );
    }

    console.log(`[ExecutiveProductCatalog] Cancelled subscription: ${subscriptionId} - ${reason}`);

    this.emit('subscription_cancelled', { subscriptionId, subscription, reason });

    // Note: In a real system, you'd also end the employment relationships for allocated agents

    return subscription;
  }

  /**
   * Get product by ID
   */
  getProduct(productId) {
    return this.products.get(productId);
  }

  /**
   * Get all active products
   */
  getActiveProducts() {
    const products = [];
    for (const product of this.products.values()) {
      if (product.status === 'active') {
        products.push(product);
      }
    }
    return products;
  }

  /**
   * Get customer's subscriptions
   */
  getCustomerSubscriptions(customerId, { activeOnly = true } = {}) {
    const subscriptions = [];

    for (const subscription of this.subscriptions.values()) {
      if (subscription.customerId === customerId) {
        if (!activeOnly || subscription.status === 'active') {
          subscriptions.push(subscription);
        }
      }
    }

    return subscriptions;
  }

  /**
   * Get subscriptions for a product
   */
  getProductSubscriptions(productId, { activeOnly = true } = {}) {
    const subscriptions = [];

    for (const subscription of this.subscriptions.values()) {
      if (subscription.productId === productId) {
        if (!activeOnly || subscription.status === 'active') {
          subscriptions.push(subscription);
        }
      }
    }

    return subscriptions;
  }

  /**
   * Calculate next billing date
   */
  calculateNextBillingDate(startDate, billingCycle) {
    const date = new Date(startDate);

    switch (billingCycle) {
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + 3);
        break;
      case 'annual':
        date.setFullYear(date.getFullYear() + 1);
        break;
    }

    return date;
  }

  /**
   * Get products that require specific agent
   */
  getProductsByAgent(agentId) {
    const products = [];

    for (const product of this.products.values()) {
      const requiresAgent = product.requiredAgents.some(req => req.agentId === agentId);
      const optionallyUsesAgent = product.optionalAgents?.some(opt => opt.agentId === agentId);

      if (requiresAgent || optionallyUsesAgent) {
        products.push({
          ...product,
          agentRole: requiresAgent ? 'required' : 'optional'
        });
      }
    }

    return products;
  }

  /**
   * Get stats
   */
  getStats() {
    const stats = {
      totalProducts: this.products.size,
      activeProducts: 0,
      totalSubscriptions: this.subscriptions.size,
      activeSubscriptions: 0,
      byBillingCycle: {
        monthly: 0,
        quarterly: 0,
        annual: 0
      }
    };

    for (const product of this.products.values()) {
      if (product.status === 'active') stats.activeProducts++;
    }

    for (const subscription of this.subscriptions.values()) {
      if (subscription.status === 'active') {
        stats.activeSubscriptions++;
        stats.byBillingCycle[subscription.billingCycle] = (stats.byBillingCycle[subscription.billingCycle] || 0) + 1;
      }
    }

    return stats;
  }
}

module.exports = ExecutiveProductCatalog;
