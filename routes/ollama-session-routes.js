/**
 * Ollama Session Routes
 *
 * REST API endpoints for managing Ollama streaming sessions.
 *
 * Endpoints:
 * - POST   /api/ollama/session/start       - Start new session (with timer)
 * - POST   /api/ollama/session/:id/chat    - Send message in session
 * - POST   /api/ollama/session/:id/switch  - Switch domain/model (stream context)
 * - POST   /api/ollama/session/:id/end     - End session (get summary)
 * - GET    /api/ollama/session/:id         - Get session details
 * - GET    /api/ollama/session/:id/summary - Get session summary
 * - GET    /api/ollama/session/:id/history - Get conversation history
 * - GET    /api/ollama/sessions            - List sessions
 * - GET    /api/ollama/sessions/active     - Get active sessions
 *
 * Authentication:
 * - All endpoints require user to be logged in (session auth)
 * - Alternative: API key authentication (Bearer token)
 */

const express = require('express');
const router = express.Router();
const OllamaSessionManager = require('../lib/ollama-session-manager');
const OllamaSessionContract = require('../lib/ollama-session-contract');

/**
 * Middleware to extract user ID from session or API key
 */
function requireAuth(req, res, next) {
  // Check session auth
  if (req.session && req.session.userId) {
    req.userId = req.session.userId;
    return next();
  }

  // Check API key auth (from validate-api-key middleware)
  if (req.user && req.user.userId) {
    req.userId = req.user.userId;
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'You must be logged in to use Ollama sessions'
  });
}

/**
 * POST /api/ollama/session/start
 * Start a new Ollama streaming session
 *
 * Body:
 *   {
 *     "domainId": "uuid",               // Optional: client/project domain
 *     "brandId": "uuid",                // Optional: custom branding
 *     "roomId": 123,                    // Optional: code room context
 *     "primaryModel": "ollama:mistral", // Optional: default ollama:mistral
 *     "sessionName": "Client ABC Work", // Optional: user-friendly name
 *     "options": {                      // Optional settings
 *       "autoStreamEnabled": true,
 *       "streamThreshold": 5,
 *       "contextWindowSize": 10
 *     }
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "sessionId": "uuid",
 *     "session": { ... session data ... }
 *   }
 */
router.post('/session/start', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const sessionManager = new OllamaSessionManager({ db });

  try {
    const {
      domainId,
      brandId,
      roomId,
      primaryModel = 'ollama:mistral',
      sessionName,
      options = {}
    } = req.body;

    const result = await sessionManager.startSession({
      userId: req.userId,
      domainId,
      brandId,
      roomId,
      primaryModel,
      sessionName,
      options
    });

    res.json(result);

  } catch (error) {
    console.error('[OllamaSessionRoutes] Start session error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to start session'
    });
  }
});

/**
 * POST /api/ollama/session/:id/chat
 * Send a message in a session
 *
 * Body:
 *   {
 *     "message": "Help me build a pricing calculator",
 *     "options": {                      // Optional
 *       "maxTokens": 2000,
 *       "temperature": 0.7,
 *       "contextWindow": 10
 *     }
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "response": "Sure! Here's how...",
 *     "model": "ollama:mistral",
 *     "provider": "ollama",
 *     "usage": {
 *       "promptTokens": 123,
 *       "completionTokens": 456,
 *       "totalTokens": 579
 *     },
 *     "cost": {
 *       "estimatedUSD": 0.00      // Usually $0 for Ollama
 *     },
 *     "latencyMs": 1234
 *   }
 */
router.post('/session/:id/chat', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const sessionManager = new OllamaSessionManager({ db });

  try {
    const { id: sessionId } = req.params;
    const { message, options = {} } = req.body;

    if (!message) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message is required'
      });
    }

    const result = await sessionManager.sendMessage(sessionId, message, options);

    res.json(result);

  } catch (error) {
    console.error('[OllamaSessionRoutes] Chat error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to send message: ${error.message}`
    });
  }
});

/**
 * POST /api/ollama/session/:id/switch
 * Switch domain/model and stream context
 *
 * Body:
 *   {
 *     "targetDomainId": "uuid",         // Target domain
 *     "targetModel": "gpt-4",           // Target model
 *     "targetProvider": "openai",       // Target provider
 *     "reason": "domain_switch"         // Optional: reason for switch
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "contextStreamed": true,
 *     "messageCount": 10,
 *     "totalTokens": 1234,
 *     "cost": 0.05,
 *     "targetModel": "gpt-4",
 *     "targetDomain": "uuid"
 *   }
 */
router.post('/session/:id/switch', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const sessionManager = new OllamaSessionManager({ db });

  try {
    const { id: sessionId } = req.params;
    const {
      targetDomainId,
      targetModel,
      targetProvider,
      reason = 'domain_switch'
    } = req.body;

    if (!targetDomainId || !targetModel || !targetProvider) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'targetDomainId, targetModel, and targetProvider are required'
      });
    }

    const result = await sessionManager.switchDomain(sessionId, {
      targetDomainId,
      targetModel,
      targetProvider,
      reason
    });

    res.json(result);

  } catch (error) {
    console.error('[OllamaSessionRoutes] Switch domain error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to switch domain: ${error.message}`
    });
  }
});

/**
 * POST /api/ollama/session/:id/end
 * End a session and get summary
 *
 * Response:
 *   {
 *     "success": true,
 *     "summary": {
 *       "sessionId": "uuid",
 *       "duration": "2h 15m",
 *       "totalMessages": 47,
 *       "totalTokens": 23450,
 *       "totalCost": 2.34,
 *       "ollamaCost": 0.00,
 *       "externalCost": 2.34,
 *       "domainName": "Client ABC",
 *       "providerBreakdown": { ... },
 *       "contextStreamCount": 2,
 *       "costPerHour": 1.04
 *     }
 *   }
 */
router.post('/session/:id/end', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const sessionManager = new OllamaSessionManager({ db });

  try {
    const { id: sessionId } = req.params;

    const result = await sessionManager.endSession(sessionId);

    res.json(result);

  } catch (error) {
    console.error('[OllamaSessionRoutes] End session error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to end session: ${error.message}`
    });
  }
});

/**
 * GET /api/ollama/session/:id
 * Get session details
 *
 * Response:
 *   {
 *     "session": { ... full session data ... }
 *   }
 */
router.get('/session/:id', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const sessionManager = new OllamaSessionManager({ db });

  try {
    const { id: sessionId } = req.params;

    const session = await sessionManager.getSession(sessionId);

    res.json({ session });

  } catch (error) {
    console.error('[OllamaSessionRoutes] Get session error:', error.message);
    res.status(404).json({
      error: 'Not Found',
      message: `Session not found: ${error.message}`
    });
  }
});

/**
 * GET /api/ollama/session/:id/summary
 * Get session summary
 *
 * Response:
 *   {
 *     "summary": { ... complete summary ... }
 *   }
 */
router.get('/session/:id/summary', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const sessionManager = new OllamaSessionManager({ db });

  try {
    const { id: sessionId } = req.params;

    const summary = await sessionManager.getSessionSummary(sessionId);

    res.json({ summary });

  } catch (error) {
    console.error('[OllamaSessionRoutes] Get summary error:', error.message);
    res.status(404).json({
      error: 'Not Found',
      message: `Session summary not found: ${error.message}`
    });
  }
});

/**
 * GET /api/ollama/session/:id/history
 * Get conversation history
 *
 * Query params:
 *   ?limit=50  // Max messages to retrieve (default: 50)
 *
 * Response:
 *   {
 *     "history": [
 *       {
 *         "messageId": "uuid",
 *         "role": "user",
 *         "content": "Hello!",
 *         "timestamp": "2024-10-22T...",
 *         "model": null,
 *         "provider": null,
 *         "tokens": 2
 *       },
 *       {
 *         "messageId": "uuid",
 *         "role": "assistant",
 *         "content": "Hi! How can I help?",
 *         "timestamp": "2024-10-22T...",
 *         "model": "ollama:mistral",
 *         "provider": "ollama",
 *         "tokens": 8
 *       }
 *     ]
 *   }
 */
router.get('/session/:id/history', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const sessionManager = new OllamaSessionManager({ db });

  try {
    const { id: sessionId } = req.params;
    const limit = parseInt(req.query.limit || 50);

    const history = await sessionManager.getConversationHistory(sessionId, limit);

    res.json({ history });

  } catch (error) {
    console.error('[OllamaSessionRoutes] Get history error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get conversation history'
    });
  }
});

/**
 * GET /api/ollama/sessions
 * List sessions for the authenticated user
 *
 * Query params:
 *   ?limit=50       // Max sessions to return (default: 50)
 *   ?status=active  // Filter by status (optional)
 *
 * Response:
 *   {
 *     "sessions": [
 *       {
 *         "sessionId": "uuid",
 *         "sessionName": "Client ABC Work",
 *         "domainName": "clientabc.com",
 *         "brandName": "Client ABC",
 *         "primaryModel": "ollama:mistral",
 *         "status": "ended",
 *         "startedAt": "2024-10-22T10:00:00Z",
 *         "endedAt": "2024-10-22T12:15:00Z",
 *         "durationSeconds": 8100,
 *         "totalMessages": 47,
 *         "totalCost": 2.34
 *       }
 *     ]
 *   }
 */
router.get('/sessions', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const sessionManager = new OllamaSessionManager({ db });

  try {
    const limit = parseInt(req.query.limit || 50);
    const status = req.query.status || null;

    const sessions = await sessionManager.listSessions(req.userId, { limit, status });

    res.json({ sessions });

  } catch (error) {
    console.error('[OllamaSessionRoutes] List sessions error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list sessions'
    });
  }
});

/**
 * GET /api/ollama/sessions/active
 * Get active sessions for the authenticated user
 *
 * Response:
 *   {
 *     "sessions": [
 *       {
 *         "sessionId": "uuid",
 *         "sessionName": "Client ABC Work",
 *         "domainName": "clientabc.com",
 *         "primaryModel": "ollama:mistral",
 *         "startedAt": "2024-10-22T10:00:00Z",
 *         "messageCount": 12
 *       }
 *     ]
 *   }
 */
router.get('/sessions/active', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const sessionManager = new OllamaSessionManager({ db });

  try {
    const sessions = await sessionManager.getActiveSessions(req.userId);

    res.json({ sessions });

  } catch (error) {
    console.error('[OllamaSessionRoutes] Get active sessions error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get active sessions'
    });
  }
});

// ============================================================================
// CONTRACT WORKFLOW ENDPOINTS
// ============================================================================

/**
 * POST /api/ollama/session/:id/review
 * Enter review mode (DocuSign-like contract review)
 *
 * Response:
 *   {
 *     "success": true,
 *     "sessionId": "uuid",
 *     "contractStatus": "review",
 *     "reviewData": {
 *       "summary": { ... },
 *       "messages": [...],
 *       "timeline": [...],
 *       "totalCost": 2.34,
 *       "terms": "..."
 *     }
 *   }
 */
router.post('/session/:id/review', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const contractManager = new OllamaSessionContract({ db });

  try {
    const { id: sessionId } = req.params;
    const result = await contractManager.enterReview(sessionId);

    res.json(result);

  } catch (error) {
    console.error('[OllamaSessionRoutes] Enter review error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to enter review: ${error.message}`
    });
  }
});

/**
 * POST /api/ollama/session/:id/approve
 * Approve contract costs
 *
 * Body:
 *   {
 *     "approvedCostCeiling": 10.00  // Optional: max cost to approve
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "sessionId": "uuid",
 *     "contractStatus": "approved",
 *     "approvedCost": 2.34
 *   }
 */
router.post('/session/:id/approve', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const contractManager = new OllamaSessionContract({ db });

  try {
    const { id: sessionId } = req.params;
    const { approvedCostCeiling } = req.body;

    const result = await contractManager.approveCosts(sessionId, {
      approvedCostCeiling
    });

    res.json(result);

  } catch (error) {
    console.error('[OllamaSessionRoutes] Approve costs error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to approve costs: ${error.message}`
    });
  }
});

/**
 * POST /api/ollama/session/:id/sign
 * Sign contract with Soulfra cryptographic signature
 *
 * Makes session immutable - cannot be modified after signing
 *
 * Response:
 *   {
 *     "success": true,
 *     "sessionId": "uuid",
 *     "contractStatus": "signed",
 *     "signedAt": "2024-10-22T12:34:56Z",
 *     "soulfraHash": {
 *       "sha256": "...",
 *       "sha512": "...",
 *       "sha3_512": "...",
 *       "blake3b": "...",
 *       "ed25519_signature": "..."
 *     },
 *     "isImmutable": true,
 *     "publicShareUrl": "/ollama/session/uuid/contract?token=..."
 *   }
 */
router.post('/session/:id/sign', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const contractManager = new OllamaSessionContract({ db });

  try {
    const { id: sessionId } = req.params;
    const { metadata = {} } = req.body;

    const result = await contractManager.signContract(sessionId, {
      metadata
    });

    res.json(result);

  } catch (error) {
    console.error('[OllamaSessionRoutes] Sign contract error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to sign contract: ${error.message}`
    });
  }
});

/**
 * GET /api/ollama/session/:id/verify
 * Verify Soulfra signature on signed contract
 *
 * Response:
 *   {
 *     "success": true,
 *     "sessionId": "uuid",
 *     "isValid": true,
 *     "soulfraHash": { ... },
 *     "signedAt": "2024-10-22T12:34:56Z"
 *   }
 */
router.get('/session/:id/verify', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const contractManager = new OllamaSessionContract({ db });

  try {
    const { id: sessionId } = req.params;
    const result = await contractManager.verifySignature(sessionId);

    res.json(result);

  } catch (error) {
    console.error('[OllamaSessionRoutes] Verify signature error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to verify signature: ${error.message}`
    });
  }
});

/**
 * POST /api/ollama/session/:id/export-pdf
 * Export signed contract as PDF
 *
 * Response:
 *   {
 *     "success": true,
 *     "sessionId": "uuid",
 *     "pdfUrl": "/api/ollama/session/uuid/contract.pdf"
 *   }
 */
router.post('/session/:id/export-pdf', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const contractManager = new OllamaSessionContract({ db });

  try {
    const { id: sessionId } = req.params;
    const result = await contractManager.exportPDF(sessionId);

    res.json(result);

  } catch (error) {
    console.error('[OllamaSessionRoutes] Export PDF error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to export PDF: ${error.message}`
    });
  }
});

/**
 * GET /api/ollama/session/:id/public
 * Get public contract (for share URLs)
 * Only works for signed, immutable contracts
 *
 * Response:
 *   {
 *     "success": true,
 *     "sessionId": "uuid",
 *     "contractStatus": "signed",
 *     "signedAt": "2024-10-22T12:34:56Z",
 *     "soulfraHash": { ... },
 *     "summary": { ... },
 *     "messages": [...],
 *     "timeline": [...],
 *     "totalCost": 2.34
 *   }
 */
router.get('/session/:id/public', async (req, res) => {
  // Note: No requireAuth - public endpoint
  const db = req.app.locals.db;
  const contractManager = new OllamaSessionContract({ db });

  try {
    const { id: sessionId } = req.params;
    const result = await contractManager.getPublicContract(sessionId);

    res.json(result);

  } catch (error) {
    console.error('[OllamaSessionRoutes] Get public contract error:', error.message);
    res.status(404).json({
      error: 'Not Found',
      message: `Contract not found or not public: ${error.message}`
    });
  }
});

module.exports = router;
