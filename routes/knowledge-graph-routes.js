/**
 * Knowledge Graph Routes
 *
 * AI-powered learning system with double contingency authentication:
 * 1. Session authentication (user must be logged in)
 * 2. Platform API key validation (tenant must have active key)
 * 3. Ollama integration for personalized teaching
 * 4. Automatic progress tracking and leveling
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const KnowledgeGraphService = require('../lib/knowledge-graph-service');
const MultiProviderRouter = require('../lib/multi-provider-router');

let db = null;
let kg = null;
let mpr = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;
  kg = new KnowledgeGraphService(db);
  mpr = new MultiProviderRouter(db);
  return router;
}

/**
 * Middleware: Require user authentication + Set RLS Context
 * Supports both session-based auth and X-User-Id header (for development)
 * Sets PostgreSQL session variables for Row-Level Security policies
 */
async function requireUserAuth(req, res, next) {
  const userId = req.session?.userId || req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({
      status: 'error',
      error: 'Authentication required. Please log in.'
    });
  }

  // Verify user exists
  try {
    const userQuery = await db.query(
      'SELECT user_id, email, username, tenant_id FROM users WHERE user_id = $1',
      [userId]
    );

    if (userQuery.rows.length === 0) {
      return res.status(401).json({
        status: 'error',
        error: 'User not found'
      });
    }

    req.user = userQuery.rows[0];

    // Set RLS context for tenant isolation
    await db.query(
      'SELECT set_request_context($1, $2, $3)',
      [req.user.user_id, req.user.tenant_id, 'user']
    );

    console.log(`[KnowledgeGraph] RLS context set: user=${req.user.username}, tenant=${req.user.tenant_id.substring(0, 8)}...`);

    next();
  } catch (error) {
    console.error('[KnowledgeGraph] Auth error:', error);

    // Clear RLS context on error
    try {
      await db.query('SELECT clear_request_context()');
    } catch (clearError) {
      console.error('[KnowledgeGraph] Failed to clear RLS context:', clearError);
    }

    res.status(500).json({
      status: 'error',
      error: 'Authentication failed'
    });
  }
}

/**
 * GET /api/knowledge/concepts
 * List all concepts with optional filters
 *
 * Query params:
 * - category: Filter by category (querying, database-design, etc.)
 * - difficulty_min: Minimum difficulty (1-10)
 * - difficulty_max: Maximum difficulty (1-10)
 * - limit: Max results (default 100)
 */
router.get('/concepts', requireUserAuth, async (req, res) => {
  try {
    const { category, difficulty_min, difficulty_max, limit } = req.query;

    const concepts = await kg.getAllConcepts({
      category,
      difficulty_min: difficulty_min ? parseInt(difficulty_min) : undefined,
      difficulty_max: difficulty_max ? parseInt(difficulty_max) : undefined,
      limit: limit ? parseInt(limit) : 100
    });

    res.json({
      status: 'success',
      data: {
        concepts,
        total: concepts.length
      }
    });
  } catch (error) {
    console.error('[KnowledgeGraph] Error fetching concepts:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch concepts'
    });
  }
});

/**
 * GET /api/knowledge/concepts/:slug
 * Get detailed info about a specific concept
 */
router.get('/concepts/:slug', requireUserAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    const concept = await kg.getConceptBySlug(slug);

    if (!concept) {
      return res.status(404).json({
        status: 'error',
        error: 'Concept not found'
      });
    }

    // Get user's mastery of this concept
    const masteryQuery = await db.query(
      `SELECT mastery_level, interactions, last_interaction_at
       FROM user_concept_mastery
       WHERE user_id = $1 AND concept_id = $2`,
      [req.user.user_id, concept.concept_id]
    );

    const userMastery = masteryQuery.rows[0] || {
      mastery_level: 0,
      interactions: 0,
      last_interaction_at: null
    };

    res.json({
      status: 'success',
      data: {
        ...concept,
        user_mastery: userMastery
      }
    });
  } catch (error) {
    console.error('[KnowledgeGraph] Error fetching concept:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch concept'
    });
  }
});

/**
 * GET /api/knowledge/my-progress
 * Get current user's learning progress and level
 */
router.get('/my-progress', requireUserAuth, async (req, res) => {
  try {
    const progress = await kg.getUserProgress(req.user.user_id);

    res.json({
      status: 'success',
      data: progress
    });
  } catch (error) {
    console.error('[KnowledgeGraph] Error fetching progress:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch progress'
    });
  }
});

/**
 * GET /api/knowledge/recommended
 * Get AI-recommended next concepts based on prerequisites met
 */
router.get('/recommended', requireUserAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const recommended = await kg.getRecommendedConcepts(
      req.user.user_id,
      parseInt(limit)
    );

    res.json({
      status: 'success',
      data: {
        recommended,
        total: recommended.length
      }
    });
  } catch (error) {
    console.error('[KnowledgeGraph] Error fetching recommendations:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch recommendations'
    });
  }
});

/**
 * GET /api/knowledge/stats
 * Get overall knowledge graph statistics
 */
router.get('/stats', requireUserAuth, async (req, res) => {
  try {
    const stats = await kg.getStats();

    res.json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    console.error('[KnowledgeGraph] Error fetching stats:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch stats'
    });
  }
});

/**
 * POST /api/knowledge/learn
 * AI-assisted learning with double contingency authentication
 *
 * Flow:
 * 1. Validate user session
 * 2. Validate tenant's API key (double contingency)
 * 3. Check user has credits
 * 4. Call Ollama for personalized teaching
 * 5. Record learning session
 * 6. Update user mastery (auto-triggered)
 * 7. Deduct credits
 *
 * Body:
 * {
 *   concept_slug: "sql-joins",
 *   prompt: "Explain SQL JOIN operations with examples",
 *   model: "ollama:calos-model:latest" (optional)
 * }
 */
router.post('/learn', requireUserAuth, async (req, res) => {
  const startTime = Date.now();

  try {
    const { concept_slug, prompt, provider = 'ollama', model = 'calos-model' } = req.body;

    if (!concept_slug || !prompt) {
      return res.status(400).json({
        status: 'error',
        error: 'concept_slug and prompt are required'
      });
    }

    // 1. Get concept details
    const concept = await kg.getConceptBySlug(concept_slug);
    if (!concept) {
      return res.status(404).json({
        status: 'error',
        error: 'Concept not found'
      });
    }

    // 2. Double contingency: Validate tenant's API key
    const apiKeyQuery = await db.query(
      `SELECT key_id, key_prefix, key_suffix_last4, key_name
       FROM calos_platform_api_keys
       WHERE tenant_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.tenant_id]
    );

    if (apiKeyQuery.rows.length === 0) {
      return res.status(403).json({
        status: 'error',
        error: 'No active API key found for your tenant. Double contingency auth failed.'
      });
    }

    const apiKey = apiKeyQuery.rows[0];

    // 3. Check user credits
    const creditsQuery = await db.query(
      'SELECT credits_remaining FROM user_credits WHERE user_id = $1',
      [req.user.user_id]
    );

    const creditsRemaining = creditsQuery.rows[0]?.credits_remaining || 0;
    if (creditsRemaining < 5) {
      return res.status(402).json({
        status: 'error',
        error: 'Insufficient credits. Need at least 5 credits to learn.'
      });
    }

    // 4. Build teaching prompt
    console.log(`[KnowledgeGraph] Teaching "${concept.concept_name}" to ${req.user.username} using ${provider}/${model}`);

    const teachingPrompt = `You are a skilled SQL and database teacher. A student asked: "${prompt}"

Concept: ${concept.concept_name}
Description: ${concept.description}
Category: ${concept.category}
Difficulty: ${concept.difficulty_level}/10

Provide a clear, educational explanation with:
1. Simple definition
2. Practical examples
3. Common use cases
4. Tips and best practices

Keep it concise (under 500 words) and appropriate for the difficulty level.`;

    // 5. Route to provider using MultiProviderRouter
    let providerResponse;
    try {
      providerResponse = await mpr.route({
        provider,
        model,
        prompt: teachingPrompt,
        metadata: {
          user_id: req.user.user_id,
          tenant_id: req.user.tenant_id,
          concept_id: concept.concept_id
        }
      });
    } catch (providerError) {
      console.error('[KnowledgeGraph] Provider error:', providerError.message);

      // Record failed session
      await db.query(
        `INSERT INTO learning_sessions (
          user_id, tenant_id, concept_id, model_used, provider,
          prompt, response, api_key_id, session_auth_method,
          success, error_message, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [
          req.user.user_id,
          req.user.tenant_id,
          concept.concept_id,
          model,
          provider,
          prompt,
          '',
          apiKey.key_id,
          'session+apikey',
          false,
          providerError.message
        ]
      );

      return res.status(503).json({
        status: 'error',
        error: `${provider} service unavailable. Please try again.`,
        details: providerError.message
      });
    }

    // 6. Calculate credits to consume (1 credit per ~100 tokens)
    const creditsToConsume = Math.max(5, Math.ceil(providerResponse.usage.output_tokens / 100));

    // 7. Record successful learning session with provider metadata
    await db.query(
      `INSERT INTO learning_sessions (
        user_id, tenant_id, concept_id, model_used, provider,
        prompt, response, api_key_id, session_auth_method,
        tokens_input, tokens_output, latency_ms,
        credits_consumed, cost_usd, success,
        provider_metadata, provider_model_id, provider_request_id,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())`,
      [
        req.user.user_id,
        req.user.tenant_id,
        concept.concept_id,
        model,
        provider,
        prompt,
        providerResponse.response,
        apiKey.key_id,
        'session+apikey',
        providerResponse.usage.input_tokens,
        providerResponse.usage.output_tokens,
        providerResponse.latency_ms,
        creditsToConsume,
        providerResponse.cost_usd,
        true,
        JSON.stringify(providerResponse.provider_metadata),
        providerResponse.provider_model_id,
        providerResponse.provider_request_id
      ]
    );

    // 8. Deduct credits
    await db.query(
      `UPDATE user_credits
       SET credits_remaining = credits_remaining - $1,
           credits_used = credits_used + $1,
           updated_at = NOW()
       WHERE user_id = $2`,
      [creditsToConsume, req.user.user_id]
    );

    console.log(`[KnowledgeGraph] Learning session complete. Provider: ${provider}, Cost: $${providerResponse.cost_usd}, Credits: ${creditsToConsume}`);

    // Note: user_concept_mastery is auto-updated by trigger

    res.json({
      status: 'success',
      data: {
        concept: concept.concept_name,
        explanation: providerResponse.response,
        provider: provider,
        model_used: model,
        tokens: providerResponse.usage,
        cost_usd: providerResponse.cost_usd,
        credits_consumed: creditsToConsume,
        credits_remaining: creditsRemaining - creditsToConsume,
        latency_ms: providerResponse.latency_ms,
        double_contingency: {
          session_validated: true,
          api_key_validated: true,
          api_key_prefix: apiKey.key_prefix
        }
      }
    });
  } catch (error) {
    console.error('[KnowledgeGraph] Learn endpoint error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Learning session failed',
      details: error.message
    });
  }
});

module.exports = { router, initRoutes };
