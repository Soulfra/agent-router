/**
 * LLM API Routes with Bot Detection & User Context
 *
 * Provides REST API for multi-LLM router with bot detection:
 * - POST /api/llm/request-access - Request access (get challenge)
 * - POST /api/llm/verify-personhood - Submit proof, get access token
 * - POST /api/llm/complete - Complete prompt (requires access token)
 * - POST /api/llm/stream - Stream completion (requires access token)
 * - GET /api/llm/models - List available models
 * - GET /api/llm/session - Get session info
 * - GET /api/llm/rate-limit - Get rate limit status
 * - DELETE /api/llm/session - Revoke session
 *
 * Authentication Flow:
 * 1. Client: POST /api/llm/request-access → Get challenge
 * 2. Client: Create Soulfra identity, solve challenge, generate proof
 * 3. Client: POST /api/llm/verify-personhood → Get access token
 * 4. Client: Use access token in Authorization header for all requests
 *
 * User Context Integration:
 * - If SSO authenticated (req.user exists), loads user preferences
 * - Enriches prompts with accessibility context (high contrast, screen reader, etc.)
 * - Formats responses based on user settings
 */

const express = require('express');
const MultiLLMRouter = require('../lib/multi-llm-router');
const BotDetector = require('../lib/bot-detector');
const RateLimiter = require('../lib/rate-limiter');
const UserContextTransformer = require('../lib/user-context-transformer');
const { optionalAuth } = require('../middleware/sso-auth');

class LLMRoutes {
  constructor(options = {}) {
    this.router = express.Router();

    // Initialize services
    this.llmRouter = new MultiLLMRouter({
      strategy: options.strategy || 'smart',
      fallback: options.fallback !== false,
      costOptimize: options.costOptimize !== false
    });

    this.botDetector = new BotDetector({
      powDifficulty: options.powDifficulty || 4,
      challengeExpiryMinutes: options.challengeExpiryMinutes || 5
    });

    this.rateLimiter = new RateLimiter();

    // User context transformer (for SSO-authenticated users)
    this.contextTransformer = options.contextTransformer || null;
    if (options.db && !this.contextTransformer) {
      this.contextTransformer = new UserContextTransformer({ db: options.db });
    }

    // Setup routes
    this._setupRoutes();

    // Cleanup expired sessions/challenges every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.botDetector.cleanExpiredSessions();
      this.botDetector.cleanExpiredChallenges();
    }, 5 * 60 * 1000);
  }

  /**
   * Setup all routes
   * @private
   */
  _setupRoutes() {
    // Public routes (no auth required)
    this.router.post('/request-access', this._requestAccess.bind(this));
    this.router.post('/verify-personhood', this._verifyPersonhood.bind(this));
    this.router.get('/models', this._getModels.bind(this));

    // Protected routes (require access token)
    // optionalAuth attempts SSO first (for user context), then falls back to bot detector
    this.router.post('/complete', optionalAuth, this._authenticate.bind(this), this._complete.bind(this));
    this.router.post('/stream', optionalAuth, this._authenticate.bind(this), this._stream.bind(this));
    this.router.get('/session', this._authenticate.bind(this), this._getSession.bind(this));
    this.router.get('/rate-limit', this._authenticate.bind(this), this._getRateLimit.bind(this));
    this.router.delete('/session', this._authenticate.bind(this), this._revokeSession.bind(this));

    // Admin routes (for monitoring)
    this.router.get('/stats', this._getStats.bind(this));
  }

  // ========================================================================
  // Middleware
  // ========================================================================

  /**
   * Authenticate requests (verify access token)
   * @private
   */
  _authenticate(req, res, next) {
    // Get access token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or invalid Authorization header. Use: Authorization: Bearer <access_token>'
      });
    }

    const accessToken = authHeader.substring(7); // Remove "Bearer "

    // Verify token
    const verification = this.botDetector.verifyRequest(accessToken);

    if (!verification.allowed) {
      return res.status(403).json({
        error: 'access_denied',
        reason: verification.reason,
        message: verification.message
      });
    }

    // Get session
    const session = this.botDetector.getSession(accessToken);

    if (!session) {
      return res.status(401).json({
        error: 'invalid_session',
        message: 'Session not found'
      });
    }

    // Check rate limit
    const rateLimit = this.rateLimiter.checkLimit(session.identityID, session.tier);

    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        reason: rateLimit.reason,
        limits: rateLimit.limits,
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt,
        message: `Rate limit exceeded. You can make ${rateLimit.limits.hourly} requests per hour.`
      });
    }

    // Attach session and rate limit info to request
    req.session = session;
    req.rateLimit = rateLimit;

    next();
  }

  // ========================================================================
  // Public Routes
  // ========================================================================

  /**
   * POST /api/llm/request-access
   * Request access to LLM (get challenge)
   */
  async _requestAccess(req, res) {
    try {
      const challenge = this.botDetector.requestAccess();

      res.json({
        success: true,
        sessionID: challenge.sessionID,
        challenge: challenge.challenge,
        expiresAt: challenge.expiresAt,
        requirements: challenge.requirements,
        instructions: {
          step1: 'Create or load a Soulfra identity',
          step2: 'Respond to the challenge using identity.respondToChallenge()',
          step3: 'Generate proof of work using identity.createProofOfWork()',
          step4: 'Submit proof to /api/llm/verify-personhood',
          example: 'See bin/test-bot-detection.js for complete example'
        }
      });

    } catch (error) {
      res.status(500).json({
        error: 'internal_error',
        message: error.message
      });
    }
  }

  /**
   * POST /api/llm/verify-personhood
   * Submit proof of personhood, get access token
   *
   * Body: {
   *   sessionID: string,
   *   identityID: string,
   *   authResponse: object (from identity.respondToChallenge()),
   *   proofOfWork: object (from identity.createProofOfWork()),
   *   timeProof: object (optional, from identity.createTimeProof()),
   *   reputation: object (optional, from identity.getReputation())
   * }
   */
  async _verifyPersonhood(req, res) {
    try {
      const { sessionID, ...proof } = req.body;

      if (!sessionID || !proof.identityID || !proof.authResponse || !proof.proofOfWork) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Missing required fields: sessionID, identityID, authResponse, proofOfWork'
        });
      }

      const result = await this.botDetector.verifyPersonhood(sessionID, proof);

      if (!result.verified) {
        return res.status(403).json({
          error: 'verification_failed',
          reason: result.reason,
          message: result.message
        });
      }

      res.json({
        success: true,
        verified: true,
        accessToken: result.accessToken,
        identityID: result.identityID,
        reputation: result.reputation,
        tier: result.tier,
        expiresAt: result.expiresAt,
        message: result.message,
        instructions: {
          usage: 'Include access token in Authorization header: Bearer <access_token>',
          endpoints: {
            complete: 'POST /api/llm/complete',
            stream: 'POST /api/llm/stream',
            session: 'GET /api/llm/session',
            rateLimit: 'GET /api/llm/rate-limit'
          }
        }
      });

    } catch (error) {
      res.status(500).json({
        error: 'internal_error',
        message: error.message
      });
    }
  }

  /**
   * GET /api/llm/models
   * List available models from all providers
   */
  async _getModels(req, res) {
    try {
      const providers = this.llmRouter.getAvailableProviders();

      res.json({
        success: true,
        providers: providers
      });

    } catch (error) {
      res.status(500).json({
        error: 'internal_error',
        message: error.message
      });
    }
  }

  // ========================================================================
  // Protected Routes
  // ========================================================================

  /**
   * POST /api/llm/complete
   * Complete a prompt
   *
   * Headers: Authorization: Bearer <access_token>
   *
   * Body: {
   *   prompt: string,
   *   systemPrompt?: string,
   *   taskType?: 'code' | 'creative' | 'fact' | 'reasoning',
   *   maxTokens?: number,
   *   temperature?: number,
   *   preferredProvider?: 'openai' | 'anthropic' | 'deepseek' | 'ollama',
   *   model?: string,
   *   enrichWithUserContext?: boolean  // If false, skips user context enrichment
   * }
   */
  async _complete(req, res) {
    try {
      let { prompt, systemPrompt, enrichWithUserContext = true, ...options } = req.body;

      if (!prompt) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Missing required field: prompt'
        });
      }

      // Check if SSO authenticated user (req.user from optionalAuth middleware)
      // Enrich prompt with user context if available
      if (enrichWithUserContext && req.user && req.user.userId && this.contextTransformer) {
        try {
          const enriched = await this.contextTransformer.enrichPrompt(
            req.user.userId,
            prompt,
            systemPrompt
          );

          prompt = enriched.prompt;
          systemPrompt = enriched.systemPrompt;

          console.log('[LLM] Enriched prompt with user context for user:', req.user.userId);
        } catch (error) {
          console.error('[LLM] Error enriching with user context:', error);
          // Continue without enrichment
        }
      }

      // Complete request
      const response = await this.llmRouter.complete({
        prompt: prompt,
        systemPrompt: systemPrompt,
        ...options
      });

      // Format response based on user preferences if available
      let formattedText = response.text;
      if (enrichWithUserContext && req.user && req.user.userId && this.contextTransformer) {
        try {
          formattedText = await this.contextTransformer.formatResponseForUser(
            req.user.userId,
            response.text
          );
        } catch (error) {
          console.error('[LLM] Error formatting response:', error);
          // Use unformatted text
        }
      }

      res.json({
        success: true,
        response: {
          text: formattedText,
          provider: response.provider,
          model: response.model,
          usage: response.usage,
          finishReason: response.finishReason,
          latency: response.latency
        },
        session: {
          identityID: req.session.identityID,
          tier: req.session.tier.name,
          requestCount: req.session.requestCount
        },
        rateLimit: {
          remaining: req.rateLimit.remaining,
          limits: req.rateLimit.limits,
          resetAt: req.rateLimit.resetAt
        }
      });

    } catch (error) {
      res.status(500).json({
        error: 'llm_error',
        message: error.message
      });
    }
  }

  /**
   * POST /api/llm/stream
   * Stream a completion
   *
   * Headers: Authorization: Bearer <access_token>
   *
   * Body: Same as /complete
   *
   * Response: Server-Sent Events (text/event-stream)
   */
  async _stream(req, res) {
    try {
      const { prompt, ...options } = req.body;

      if (!prompt) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Missing required field: prompt'
        });
      }

      // Setup SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send initial info
      res.write(`data: ${JSON.stringify({ type: 'start', session: req.session.identityID })}\n\n`);

      // Stream response
      const response = await this.llmRouter.stream(
        {
          prompt: prompt,
          ...options
        },
        (chunk) => {
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
        }
      );

      // Send completion
      res.write(`data: ${JSON.stringify({
        type: 'done',
        response: {
          provider: response.provider,
          model: response.model,
          latency: response.latency
        },
        rateLimit: {
          remaining: req.rateLimit.remaining
        }
      })}\n\n`);

      res.end();

    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
  }

  /**
   * GET /api/llm/session
   * Get current session info
   */
  async _getSession(req, res) {
    try {
      res.json({
        success: true,
        session: {
          identityID: req.session.identityID,
          tier: req.session.tier,
          reputation: req.session.reputation,
          requestCount: req.session.requestCount,
          createdAt: req.session.createdAt,
          expiresAt: req.session.expiresAt
        }
      });

    } catch (error) {
      res.status(500).json({
        error: 'internal_error',
        message: error.message
      });
    }
  }

  /**
   * GET /api/llm/rate-limit
   * Get rate limit status
   */
  async _getRateLimit(req, res) {
    try {
      const status = this.rateLimiter.getStatus(req.session.identityID);

      res.json({
        success: true,
        rateLimit: status
      });

    } catch (error) {
      res.status(500).json({
        error: 'internal_error',
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/llm/session
   * Revoke current session
   */
  async _revokeSession(req, res) {
    try {
      const accessToken = req.headers.authorization.substring(7);
      const revoked = this.botDetector.revokeSession(accessToken);

      res.json({
        success: revoked,
        message: revoked ? 'Session revoked' : 'Session not found'
      });

    } catch (error) {
      res.status(500).json({
        error: 'internal_error',
        message: error.message
      });
    }
  }

  /**
   * GET /api/llm/stats
   * Get system statistics (for monitoring)
   */
  async _getStats(req, res) {
    try {
      const botStats = this.botDetector.getStats();
      const rateLimitStats = this.rateLimiter.getStats();
      const llmStats = this.llmRouter.getStats();

      res.json({
        success: true,
        stats: {
          botDetection: botStats,
          rateLimiting: rateLimitStats,
          llm: llmStats,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      res.status(500).json({
        error: 'internal_error',
        message: error.message
      });
    }
  }

  /**
   * Get Express router
   */
  getRouter() {
    return this.router;
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.rateLimiter.destroy();
  }
}

module.exports = LLMRoutes;
