/**
 * Secure Messaging Routes (Path-Based Encryption)
 *
 * API endpoints for encrypted messaging using path-derived keys.
 * Keys are derived from challenge-response sequences (PoW chains).
 *
 * Flow:
 * 1. Start challenge chain → GET /api/secure/chain/start
 * 2. Solve challenges → POST /api/secure/chain/verify
 * 3. Complete chain → POST /api/secure/chain/complete
 * 4. Send encrypted message → POST /api/secure/messages/send
 * 5. Receive messages → GET /api/secure/messages/inbox
 * 6. Decrypt message → POST /api/secure/messages/decrypt
 *
 * Endpoints:
 * - GET /api/secure/chain/start - Start new challenge chain
 * - POST /api/secure/chain/verify - Verify challenge and get next
 * - POST /api/secure/chain/complete - Complete chain and derive key
 * - GET /api/secure/chain/progress/:sessionId - Get chain progress
 * - POST /api/secure/messages/send - Send encrypted message
 * - GET /api/secure/messages/inbox - Get received messages
 * - GET /api/secure/messages/sent - Get sent messages
 * - POST /api/secure/messages/:messageId/decrypt - Decrypt message
 * - GET /api/secure/sessions/active - Get active encryption sessions
 */

const express = require('express');
const router = express.Router();

// Will be injected via initRoutes
let db = null;
let challengeChain = null;
let pathEncryption = null;

/**
 * Initialize routes with dependencies
 */
function initRoutes(database, challengeChainInstance, pathEncryptionInstance) {
  db = database;
  challengeChain = challengeChainInstance;
  pathEncryption = pathEncryptionInstance;

  return router;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

async function requireAuth(req, res, next) {
  const userId = req.session?.userId || req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({
      status: 'error',
      error: 'Authentication required'
    });
  }

  try {
    const result = await db.query(
      `SELECT user_id, email, username FROM users WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'User not found'
      });
    }

    req.user = result.rows[0];
    req.userId = userId;
    next();

  } catch (error) {
    console.error('[SecureMessaging] Auth error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Authentication failed'
    });
  }
}

// ============================================================================
// CHALLENGE CHAIN ENDPOINTS
// ============================================================================

/**
 * GET /api/secure/chain/start
 * Start new challenge chain for encryption key derivation
 *
 * Response:
 * {
 *   sessionId: "abc123",
 *   encryptionSessionId: "enc-...",
 *   challengeIndex: 0,
 *   challenge: "a1b2c3...",
 *   difficulty: 4,
 *   requirements: { minChainLength: 3, maxChainLength: 10 }
 * }
 */
router.get('/chain/start', requireAuth, async (req, res) => {
  try {
    const sessionId = `chain-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const result = await challengeChain.startChain(sessionId, req.userId);

    res.json({
      status: 'success',
      data: result,
      message: 'Challenge chain started. Solve challenges to derive encryption key.'
    });

  } catch (error) {
    console.error('[SecureMessaging] Start chain error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to start challenge chain',
      details: error.message
    });
  }
});

/**
 * POST /api/secure/chain/verify
 * Verify challenge response and get next challenge
 *
 * Body:
 * {
 *   sessionId: "abc123",
 *   nonce: "12345",
 *   timestamp: 1234567890
 * }
 *
 * Response (if continuing):
 * {
 *   challengeIndex: 1,
 *   challenge: "d4e5f6...",
 *   difficulty: 4,
 *   canComplete: false,
 *   chainLength: 1
 * }
 *
 * Response (if can complete):
 * {
 *   challengeIndex: 3,
 *   challenge: "g7h8i9...",
 *   canComplete: true,
 *   chainLength: 3,
 *   message: "Minimum chain length reached. You can complete or continue."
 * }
 */
router.post('/chain/verify', requireAuth, async (req, res) => {
  try {
    const { sessionId, nonce, timestamp } = req.body;

    if (!sessionId || !nonce) {
      return res.status(400).json({
        status: 'error',
        error: 'sessionId and nonce required'
      });
    }

    const result = await challengeChain.verifyAndContinue(sessionId, {
      nonce,
      timestamp: timestamp || Date.now()
    });

    // Check if auto-completed (max length reached)
    if (result.keyDerived) {
      return res.json({
        status: 'success',
        data: result,
        message: 'Challenge chain auto-completed (max length). Encryption key derived.'
      });
    }

    res.json({
      status: 'success',
      data: result,
      message: result.canComplete
        ? 'Challenge verified. Minimum chain length reached - you can complete or continue.'
        : 'Challenge verified. Continue solving challenges.'
    });

  } catch (error) {
    console.error('[SecureMessaging] Verify challenge error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to verify challenge',
      details: error.message
    });
  }
});

/**
 * POST /api/secure/chain/complete
 * Complete challenge chain and derive encryption key
 *
 * Body:
 * {
 *   sessionId: "abc123"
 * }
 *
 * Response:
 * {
 *   keyDerived: true,
 *   pathLength: 5,
 *   encryptionSessionId: "enc-...",
 *   message: "Encryption key derived from path"
 * }
 */
router.post('/chain/complete', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        status: 'error',
        error: 'sessionId required'
      });
    }

    const result = await challengeChain.completeChain(sessionId);

    res.json({
      status: 'success',
      data: result,
      message: 'Challenge chain completed. You can now send encrypted messages.'
    });

  } catch (error) {
    console.error('[SecureMessaging] Complete chain error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to complete chain',
      details: error.message
    });
  }
});

/**
 * GET /api/secure/chain/progress/:sessionId
 * Get challenge chain progress
 */
router.get('/chain/progress/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const progress = await challengeChain.getChainProgress(sessionId);

    if (!progress) {
      return res.status(404).json({
        status: 'error',
        error: 'Chain not found'
      });
    }

    res.json({
      status: 'success',
      data: progress
    });

  } catch (error) {
    console.error('[SecureMessaging] Get progress error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to get chain progress',
      details: error.message
    });
  }
});

// ============================================================================
// ENCRYPTED MESSAGING ENDPOINTS
// ============================================================================

/**
 * POST /api/secure/messages/send
 * Send encrypted message using path-derived key
 *
 * Body:
 * {
 *   encryptionSessionId: "enc-...",
 *   recipientUserId: "uuid",
 *   message: "Hello, world!",
 *   messageType: "text"
 * }
 *
 * Response:
 * {
 *   messageId: "uuid",
 *   encrypted: true,
 *   recipientUserId: "uuid",
 *   sentAt: "2025-10-13T..."
 * }
 */
router.post('/messages/send', requireAuth, async (req, res) => {
  try {
    const { encryptionSessionId, recipientUserId, message, messageType = 'text' } = req.body;

    if (!encryptionSessionId || !recipientUserId || !message) {
      return res.status(400).json({
        status: 'error',
        error: 'encryptionSessionId, recipientUserId, and message required'
      });
    }

    // Encrypt message with path-derived key
    const encrypted = await pathEncryption.encryptWithPath(encryptionSessionId, message);

    // Store encrypted message
    const result = await db.query(
      `INSERT INTO encrypted_messages (
        sender_user_id,
        recipient_user_id,
        session_id,
        path_length,
        iv,
        auth_tag,
        ciphertext,
        algorithm,
        message_type,
        content_length
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING message_id, encrypted_at`,
      [
        req.userId,
        recipientUserId,
        encryptionSessionId,
        (await pathEncryption.getSessionPath(encryptionSessionId)).length,
        encrypted.iv,
        encrypted.authTag,
        encrypted.ciphertext,
        encrypted.algorithm,
        messageType,
        Buffer.byteLength(message, 'utf8')
      ]
    );

    const messageData = result.rows[0];

    res.json({
      status: 'success',
      data: {
        messageId: messageData.message_id,
        encrypted: true,
        recipientUserId,
        sentAt: messageData.encrypted_at,
        algorithm: encrypted.algorithm
      },
      message: 'Message encrypted and sent successfully'
    });

  } catch (error) {
    console.error('[SecureMessaging] Send message error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to send encrypted message',
      details: error.message
    });
  }
});

/**
 * GET /api/secure/messages/inbox
 * Get received encrypted messages
 *
 * Query params:
 * - limit: max results (default: 50)
 * - offset: pagination offset (default: 0)
 */
router.get('/messages/inbox', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const result = await db.query(
      `SELECT
        em.message_id,
        em.sender_user_id,
        u.username as sender_username,
        em.session_id,
        em.path_length,
        em.message_type,
        em.content_length,
        em.encrypted_at,
        em.decrypted_at,
        CASE WHEN em.decrypted_at IS NOT NULL THEN 'decrypted' ELSE 'encrypted' END as status
      FROM encrypted_messages em
      JOIN users u ON u.user_id = em.sender_user_id
      WHERE em.recipient_user_id = $1
      ORDER BY em.encrypted_at DESC
      LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );

    res.json({
      status: 'success',
      data: {
        messages: result.rows,
        count: result.rows.length,
        limit,
        offset
      }
    });

  } catch (error) {
    console.error('[SecureMessaging] Get inbox error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve messages',
      details: error.message
    });
  }
});

/**
 * GET /api/secure/messages/sent
 * Get sent encrypted messages
 */
router.get('/messages/sent', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const result = await db.query(
      `SELECT
        em.message_id,
        em.recipient_user_id,
        u.username as recipient_username,
        em.session_id,
        em.path_length,
        em.message_type,
        em.content_length,
        em.encrypted_at,
        em.decrypted_at
      FROM encrypted_messages em
      JOIN users u ON u.user_id = em.recipient_user_id
      WHERE em.sender_user_id = $1
      ORDER BY em.encrypted_at DESC
      LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );

    res.json({
      status: 'success',
      data: {
        messages: result.rows,
        count: result.rows.length,
        limit,
        offset
      }
    });

  } catch (error) {
    console.error('[SecureMessaging] Get sent messages error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve sent messages',
      details: error.message
    });
  }
});

/**
 * POST /api/secure/messages/:messageId/decrypt
 * Decrypt message (requires completing same challenge chain path)
 *
 * Body:
 * {
 *   encryptionSessionId: "enc-..." (from completing challenge chain)
 * }
 *
 * Response:
 * {
 *   messageId: "uuid",
 *   message: "Hello, world!",
 *   decryptedAt: "2025-10-13T..."
 * }
 */
router.post('/messages/:messageId/decrypt', requireAuth, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { encryptionSessionId } = req.body;

    if (!encryptionSessionId) {
      return res.status(400).json({
        status: 'error',
        error: 'encryptionSessionId required (complete challenge chain first)'
      });
    }

    // Get encrypted message
    const messageResult = await db.query(
      `SELECT * FROM encrypted_messages
       WHERE message_id = $1 AND recipient_user_id = $2`,
      [messageId, req.userId]
    );

    if (messageResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Message not found'
      });
    }

    const encryptedMessage = messageResult.rows[0];

    // Decrypt with path-derived key
    const decrypted = await pathEncryption.decryptWithPath(
      encryptionSessionId,
      {
        iv: encryptedMessage.iv,
        authTag: encryptedMessage.auth_tag,
        ciphertext: encryptedMessage.ciphertext
      }
    );

    // Mark as decrypted
    await db.query(
      `UPDATE encrypted_messages
       SET decrypted_at = NOW()
       WHERE message_id = $1`,
      [messageId]
    );

    res.json({
      status: 'success',
      data: {
        messageId,
        message: decrypted,
        messageType: encryptedMessage.message_type,
        decryptedAt: new Date().toISOString()
      },
      message: 'Message decrypted successfully'
    });

  } catch (error) {
    console.error('[SecureMessaging] Decrypt message error:', error);

    // Check if it's a decryption failure (wrong key/path)
    if (error.message.includes('Unsupported state') || error.message.includes('bad decrypt')) {
      return res.status(400).json({
        status: 'error',
        error: 'Decryption failed. You must complete the same challenge chain path as the sender.',
        hint: 'The encryption key is derived from the specific sequence of challenges solved.'
      });
    }

    res.status(500).json({
      status: 'error',
      error: 'Failed to decrypt message',
      details: error.message
    });
  }
});

/**
 * GET /api/secure/sessions/active
 * Get active encryption sessions for user
 */
router.get('/sessions/active', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM active_encryption_sessions
       WHERE user_id = $1`,
      [req.userId]
    );

    res.json({
      status: 'success',
      data: {
        sessions: result.rows,
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('[SecureMessaging] Get active sessions error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve active sessions',
      details: error.message
    });
  }
});

module.exports = { initRoutes };
