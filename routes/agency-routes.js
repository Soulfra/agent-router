/**
 * Agency API Routes
 *
 * REST API and SSE endpoints for the Fractional Executive Agency system.
 * Provides live monitoring, dashboards, and operations for fractional agents.
 *
 * Endpoints:
 * - GET  /api/agency/dashboard - Real-time agency stats
 * - GET  /api/agency/activity-feed - Server-Sent Events stream of live activities
 * - GET  /api/agency/agents - List all agents with availability
 * - GET  /api/agency/agents/:agentId/profile - Full agent profile
 * - GET  /api/agency/companies/:companyId/dashboard - Company dashboard
 * - POST /api/agency/bootstrap - Initialize CalRiven + AgentZero
 * - POST /api/agency/hire - Submit hiring request
 * - POST /api/agency/purchase - Purchase product subscription
 * - POST /api/agency/time-entry - Record billable time
 * - POST /api/agency/invoices/generate - Generate invoice
 * - GET  /api/agency/invoices/:invoiceId - Get invoice details
 * - POST /api/agency/payments - Record payment
 * - GET  /api/agency/revenue - Platform revenue report
 */

const express = require('express');
const router = express.Router();

// Global agency instance (will be set via initializeAgencyRoutes)
let fractionalAgency = null;
let agencyActivityFeed = null;

/**
 * Initialize routes with agency instance
 */
function initializeAgencyRoutes({ agency, activityFeed }) {
  fractionalAgency = agency;
  agencyActivityFeed = activityFeed;

  console.log('[AgencyRoutes] Initialized with FractionalExecutiveAgency');
}

/**
 * Middleware to ensure agency is initialized
 */
function requireAgency(req, res, next) {
  if (!fractionalAgency) {
    return res.status(503).json({
      error: 'Agency not initialized',
      message: 'Fractional Executive Agency is not yet bootstrapped'
    });
  }
  next();
}

/**
 * GET /api/agency/dashboard
 * Real-time agency stats and overview
 */
router.get('/dashboard', requireAgency, (req, res) => {
  try {
    const stats = fractionalAgency.getDashboardStats();

    // Add activity feed stats if available
    if (agencyActivityFeed) {
      stats.activityFeed = agencyActivityFeed.getStats();
    }

    res.json({
      success: true,
      timestamp: new Date(),
      stats
    });
  } catch (error) {
    console.error('[AgencyRoutes] Dashboard error:', error.message);
    res.status(500).json({
      error: 'Dashboard error',
      message: error.message
    });
  }
});

/**
 * GET /api/agency/activity-feed
 * Server-Sent Events stream of live agency activities
 *
 * Query params:
 * - category: Filter by category (registry, employment, capacity, product, onboarding, billing)
 * - type: Filter by specific event type
 */
router.get('/activity-feed', requireAgency, (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { category, type } = req.query;

  console.log(`[AgencyRoutes] SSE client connected to activity feed (category=${category}, type=${type})`);

  // Send initial historical activities
  if (agencyActivityFeed) {
    const recentActivities = agencyActivityFeed.getActivityFeed({
      limit: 50,
      category,
      type
    });

    res.write(`data: ${JSON.stringify({
      type: 'init',
      activities: recentActivities
    })}\n\n`);
  }

  // Setup live activity listener
  const activityHandler = (activity) => {
    // Filter by category/type if specified
    if (category && activity.category !== category) return;
    if (type && activity.type !== type) return;

    res.write(`data: ${JSON.stringify({
      type: 'activity',
      activity
    })}\n\n`);
  };

  if (agencyActivityFeed) {
    agencyActivityFeed.on('activity', activityHandler);
  }

  // Send periodic heartbeat
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000); // Every 30 seconds

  // Cleanup on disconnect
  req.on('close', () => {
    console.log('[AgencyRoutes] SSE client disconnected from activity feed');
    if (agencyActivityFeed) {
      agencyActivityFeed.off('activity', activityHandler);
    }
    clearInterval(heartbeat);
  });
});

/**
 * GET /api/agency/activity-feed/history
 * Get historical activity feed (non-streaming)
 */
router.get('/activity-feed/history', requireAgency, (req, res) => {
  try {
    const { limit = 100, category, type } = req.query;

    if (!agencyActivityFeed) {
      return res.json({
        success: true,
        activities: []
      });
    }

    const activities = agencyActivityFeed.getActivityFeed({
      limit: parseInt(limit),
      category,
      type
    });

    res.json({
      success: true,
      count: activities.length,
      activities
    });
  } catch (error) {
    console.error('[AgencyRoutes] Activity feed history error:', error.message);
    res.status(500).json({
      error: 'Activity feed error',
      message: error.message
    });
  }
});

/**
 * GET /api/agency/agents
 * List all agents with availability
 */
router.get('/agents', requireAgency, (req, res) => {
  try {
    const agents = fractionalAgency.getAgentAvailability();

    res.json({
      success: true,
      count: agents.length,
      agents
    });
  } catch (error) {
    console.error('[AgencyRoutes] Agents list error:', error.message);
    res.status(500).json({
      error: 'Agents list error',
      message: error.message
    });
  }
});

/**
 * GET /api/agency/agents/:agentId/profile
 * Full agent profile with employments, capacity, revenue
 */
router.get('/agents/:agentId/profile', requireAgency, async (req, res) => {
  try {
    const { agentId } = req.params;

    const profile = await fractionalAgency.getAgentProfile(agentId);

    if (!profile) {
      return res.status(404).json({
        error: 'Agent not found',
        agentId
      });
    }

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('[AgencyRoutes] Agent profile error:', error.message);
    res.status(500).json({
      error: 'Agent profile error',
      message: error.message
    });
  }
});

/**
 * GET /api/agency/companies/:companyId/dashboard
 * Company dashboard with agents, billing, subscriptions
 */
router.get('/companies/:companyId/dashboard', requireAgency, async (req, res) => {
  try {
    const { companyId } = req.params;

    const dashboard = await fractionalAgency.getCompanyDashboard(companyId);

    res.json({
      success: true,
      dashboard
    });
  } catch (error) {
    console.error('[AgencyRoutes] Company dashboard error:', error.message);
    res.status(500).json({
      error: 'Company dashboard error',
      message: error.message
    });
  }
});

/**
 * POST /api/agency/bootstrap
 * Initialize CalRiven + AgentZero
 */
router.post('/bootstrap', async (req, res) => {
  try {
    if (fractionalAgency) {
      return res.status(400).json({
        error: 'Already bootstrapped',
        message: 'Agency is already initialized'
      });
    }

    // Bootstrap will be called externally
    res.json({
      success: false,
      message: 'Bootstrap must be called during server initialization'
    });
  } catch (error) {
    console.error('[AgencyRoutes] Bootstrap error:', error.message);
    res.status(500).json({
      error: 'Bootstrap error',
      message: error.message
    });
  }
});

/**
 * POST /api/agency/hire
 * Submit hiring request for fractional executive
 *
 * Body:
 * - companyId: string
 * - companyName: string
 * - role: string (CEO, CTO, CFO, etc.)
 * - allocation: number (percentage)
 * - budget: number (monthly)
 * - requirements: object (optional)
 */
router.post('/hire', requireAgency, async (req, res) => {
  try {
    const {
      companyId,
      companyName,
      role,
      allocation,
      budget,
      requirements = {}
    } = req.body;

    // Validation
    if (!companyId || !companyName || !role || !allocation || !budget) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['companyId', 'companyName', 'role', 'allocation', 'budget']
      });
    }

    const onboarding = await fractionalAgency.hireExecutive({
      companyId,
      companyName,
      role,
      allocation,
      budget,
      requirements
    });

    res.json({
      success: true,
      onboarding
    });
  } catch (error) {
    console.error('[AgencyRoutes] Hire error:', error.message);
    res.status(500).json({
      error: 'Hire error',
      message: error.message
    });
  }
});

/**
 * POST /api/agency/purchase
 * Purchase product subscription (e.g., AgentZero)
 *
 * Body:
 * - customerId: string
 * - customerName: string
 * - productId: string
 * - tier: string (standard, professional, enterprise)
 * - billingCycle: string (monthly, annual)
 */
router.post('/purchase', requireAgency, async (req, res) => {
  try {
    const {
      customerId,
      customerName,
      productId,
      tier = 'standard',
      billingCycle = 'monthly'
    } = req.body;

    // Validation
    if (!customerId || !customerName || !productId) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['customerId', 'customerName', 'productId']
      });
    }

    const subscription = await fractionalAgency.purchaseProduct({
      customerId,
      customerName,
      productId,
      tier,
      billingCycle
    });

    res.json({
      success: true,
      subscription
    });
  } catch (error) {
    console.error('[AgencyRoutes] Purchase error:', error.message);
    res.status(500).json({
      error: 'Purchase error',
      message: error.message
    });
  }
});

/**
 * POST /api/agency/time-entry
 * Record billable time entry
 *
 * Body:
 * - agentId: string
 * - employmentId: string
 * - companyId: string
 * - hours: number
 * - description: string
 * - category: string (general, meeting, code_review, strategy)
 * - date: string (ISO date, optional)
 */
router.post('/time-entry', requireAgency, async (req, res) => {
  try {
    const {
      agentId,
      employmentId,
      companyId,
      hours,
      description = '',
      category = 'general',
      date
    } = req.body;

    // Validation
    if (!agentId || !employmentId || !companyId || !hours) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['agentId', 'employmentId', 'companyId', 'hours']
      });
    }

    const entry = await fractionalAgency.billing.recordTimeEntry({
      agentId,
      employmentId,
      companyId,
      hours,
      description,
      category,
      date: date ? new Date(date) : new Date()
    });

    res.json({
      success: true,
      entry
    });
  } catch (error) {
    console.error('[AgencyRoutes] Time entry error:', error.message);
    res.status(500).json({
      error: 'Time entry error',
      message: error.message
    });
  }
});

/**
 * POST /api/agency/invoices/generate
 * Generate invoice for a company
 *
 * Body:
 * - companyId: string
 * - startDate: string (ISO date)
 * - endDate: string (ISO date)
 */
router.post('/invoices/generate', requireAgency, async (req, res) => {
  try {
    const { companyId, startDate, endDate } = req.body;

    // Validation
    if (!companyId || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['companyId', 'startDate', 'endDate']
      });
    }

    const invoice = await fractionalAgency.billing.generateInvoice({
      companyId,
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    });

    res.json({
      success: true,
      invoice
    });
  } catch (error) {
    console.error('[AgencyRoutes] Invoice generation error:', error.message);
    res.status(500).json({
      error: 'Invoice generation error',
      message: error.message
    });
  }
});

/**
 * GET /api/agency/invoices/:invoiceId
 * Get invoice details
 */
router.get('/invoices/:invoiceId', requireAgency, (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = fractionalAgency.billing.invoices.get(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        error: 'Invoice not found',
        invoiceId
      });
    }

    res.json({
      success: true,
      invoice
    });
  } catch (error) {
    console.error('[AgencyRoutes] Invoice fetch error:', error.message);
    res.status(500).json({
      error: 'Invoice fetch error',
      message: error.message
    });
  }
});

/**
 * POST /api/agency/payments
 * Record payment for invoice
 *
 * Body:
 * - invoiceId: string
 * - amount: number
 * - paymentMethod: string (stripe, wire, check)
 * - transactionId: string (optional)
 */
router.post('/payments', requireAgency, async (req, res) => {
  try {
    const {
      invoiceId,
      amount,
      paymentMethod = 'stripe',
      transactionId
    } = req.body;

    // Validation
    if (!invoiceId || !amount) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['invoiceId', 'amount']
      });
    }

    const payment = await fractionalAgency.billing.recordPayment({
      invoiceId,
      amount,
      paymentMethod,
      transactionId
    });

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    console.error('[AgencyRoutes] Payment recording error:', error.message);
    res.status(500).json({
      error: 'Payment recording error',
      message: error.message
    });
  }
});

/**
 * GET /api/agency/revenue
 * Platform revenue report
 *
 * Query params:
 * - startDate: ISO date (optional)
 * - endDate: ISO date (optional)
 */
router.get('/revenue', requireAgency, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const report = await fractionalAgency.billing.getPlatformRevenue({
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null
    });

    res.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('[AgencyRoutes] Revenue report error:', error.message);
    res.status(500).json({
      error: 'Revenue report error',
      message: error.message
    });
  }
});

/**
 * GET /api/agency/products
 * List all products
 */
router.get('/products', requireAgency, (req, res) => {
  try {
    const products = Array.from(fractionalAgency.productCatalog.products.values());

    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (error) {
    console.error('[AgencyRoutes] Products list error:', error.message);
    res.status(500).json({
      error: 'Products list error',
      message: error.message
    });
  }
});

/**
 * GET /api/agency/products/:productId
 * Get product details
 */
router.get('/products/:productId', requireAgency, (req, res) => {
  try {
    const { productId } = req.params;

    const product = fractionalAgency.productCatalog.getProduct(productId);

    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
        productId
      });
    }

    res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error('[AgencyRoutes] Product fetch error:', error.message);
    res.status(500).json({
      error: 'Product fetch error',
      message: error.message
    });
  }
});

/**
 * POST /api/agency/invoices/monthly
 * Generate monthly invoices for all companies
 */
router.post('/invoices/monthly', requireAgency, async (req, res) => {
  try {
    const invoices = await fractionalAgency.generateMonthlyInvoices();

    res.json({
      success: true,
      count: invoices.length,
      invoices
    });
  } catch (error) {
    console.error('[AgencyRoutes] Monthly invoices error:', error.message);
    res.status(500).json({
      error: 'Monthly invoices error',
      message: error.message
    });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    agencyInitialized: !!fractionalAgency,
    activityFeedInitialized: !!agencyActivityFeed,
    timestamp: new Date()
  });
});

module.exports = {
  router,
  initializeAgencyRoutes
};
