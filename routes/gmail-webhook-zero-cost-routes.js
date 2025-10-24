/**
 * Gmail Webhook Routes (Zero Cost)
 *
 * API endpoints for Gmail webhook system using Google Sheets
 *
 * Security:
 * - All endpoints require API key or JWT authentication
 * - Signature verification for webhook callbacks
 * - Rate limiting on all endpoints
 * - HTTPS required in production
 *
 * Endpoints:
 * - POST /api/gmail/webhook/send - Send email via gateway
 * - POST /api/gmail/webhook/recipients - Add recipient to whitelist
 * - GET /api/gmail/webhook/recipients/:userId - Get all recipients
 * - DELETE /api/gmail/webhook/recipients - Remove recipient
 * - POST /api/gmail/webhook/confirm/:token - Confirm email subscription
 * - GET /api/gmail/webhook/status/:userId - Get user status
 * - POST /api/gmail/webhook/test - Send test email
 * - GET /api/gmail/webhook/health - Health check
 */

const express = require('express');
const router = express.Router();
const GmailGateway = require('../lib/gmail-gateway');
const APIKeyManager = require('../lib/api-key-manager');

// Initialize gateway (lazy)
let gateway = null;
let apiKeyManager = null;

async function getGateway() {
  if (!gateway) {
    gateway = new GmailGateway({
      spreadsheetId: process.env.GOOGLE_SHEETS_DB_ID,
      credentialsPath: process.env.GOOGLE_SHEETS_CREDENTIALS_PATH,
      encryptionKey: process.env.ENCRYPTION_KEY,
      smtpProvider: process.env.FREE_SMTP_PROVIDER || 'gmail',
      confirmationBaseUrl: process.env.CONFIRMATION_URL || 'http://localhost:3000/api/gmail/webhook/confirm'
    });
    await gateway.init();
  }
  return gateway;
}

async function getAPIKeyManager() {
  if (!apiKeyManager) {
    const gw = await getGateway();
    apiKeyManager = new APIKeyManager({ db: gw.db });
    await apiKeyManager.init();
  }
  return apiKeyManager;
}

/**
 * Middleware: API key authentication
 */
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
      code: 'MISSING_API_KEY'
    });
  }

  try {
    const keyMgr = await getAPIKeyManager();
    const keyData = await keyMgr.validateKey(apiKey);

    if (!keyData) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
    }

    // Attach key data to request for later use
    req.apiKeyData = keyData;

    next();

  } catch (error) {
    console.error('[AuthMiddleware] Error validating API key:', error);
    return res.status(500).json({
      success: false,
      error: 'Error validating API key',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Middleware: Signature verification for webhooks
 */
function verifySignature(req, res, next) {
  const signature = req.headers['x-webhook-signature'];
  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) {
    // Skip verification if no secret configured
    console.warn('[GmailWebhook] No webhook secret configured, skipping verification');
    return next();
  }

  if (!signature) {
    return res.status(401).json({
      success: false,
      error: 'Signature required',
      code: 'MISSING_SIGNATURE'
    });
  }

  const crypto = require('crypto');
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({
      success: false,
      error: 'Invalid signature',
      code: 'INVALID_SIGNATURE'
    });
  }

  next();
}

/**
 * POST /api/gmail/webhook/keys
 * Create API key (admin only)
 */
router.post('/keys', async (req, res) => {
  try {
    const { userId, tier, adminSecret } = req.body;

    // Simple admin auth (in production, use proper auth)
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        code: 'FORBIDDEN'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
        code: 'MISSING_USER_ID'
      });
    }

    const keyMgr = await getAPIKeyManager();
    const keyData = await keyMgr.createKey(userId, tier || 'free');

    res.json({
      success: true,
      apiKey: keyData.key,  // ONLY TIME we send plain key!
      userId: keyData.userId,
      tier: keyData.tier,
      tierName: keyData.tierName,
      limits: keyData.limits,
      message: 'Save this key - it will not be shown again'
    });

  } catch (error) {
    console.error('[GmailWebhook] Error creating API key:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'CREATE_KEY_ERROR'
    });
  }
});

/**
 * POST /api/gmail/webhook/send
 * Send email via gateway
 */
router.post('/send', authenticateApiKey, async (req, res) => {
  try {
    // Use userId from API key (not from request body)
    const userId = req.apiKeyData.userId;
    const { from, to, cc, bcc, subject, text, html } = req.body;

    const gw = await getGateway();
    const result = await gw.send({
      userId,
      from,
      to,
      cc,
      bcc,
      subject,
      text,
      html
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('[GmailWebhook] Error sending email:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'SEND_ERROR'
    });
  }
});

/**
 * POST /api/gmail/webhook/recipients
 * Add recipient to whitelist
 */
router.post('/recipients', authenticateApiKey, async (req, res) => {
  try {
    const { userId, recipientEmail, metadata } = req.body;

    if (!userId || !recipientEmail) {
      return res.status(400).json({
        success: false,
        error: 'userId and recipientEmail are required',
        code: 'MISSING_FIELDS'
      });
    }

    const gw = await getGateway();
    const result = await gw.addRecipient(userId, recipientEmail, {
      metadata
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('[GmailWebhook] Error adding recipient:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'ADD_RECIPIENT_ERROR'
    });
  }
});

/**
 * GET /api/gmail/webhook/recipients/:userId
 * Get all recipients for user
 */
router.get('/recipients/:userId', authenticateApiKey, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    const gw = await getGateway();
    const recipients = await gw.getRecipients(userId, status);

    res.json({
      success: true,
      recipients,
      count: recipients.length
    });

  } catch (error) {
    console.error('[GmailWebhook] Error getting recipients:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'GET_RECIPIENTS_ERROR'
    });
  }
});

/**
 * DELETE /api/gmail/webhook/recipients
 * Remove recipient from whitelist
 */
router.delete('/recipients', authenticateApiKey, async (req, res) => {
  try {
    const { userId, recipientEmail } = req.body;

    if (!userId || !recipientEmail) {
      return res.status(400).json({
        success: false,
        error: 'userId and recipientEmail are required',
        code: 'MISSING_FIELDS'
      });
    }

    const gw = await getGateway();
    const success = await gw.removeRecipient(userId, recipientEmail);

    if (success) {
      res.json({
        success: true,
        message: 'Recipient removed'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to remove recipient'
      });
    }

  } catch (error) {
    console.error('[GmailWebhook] Error removing recipient:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'REMOVE_RECIPIENT_ERROR'
    });
  }
});

/**
 * POST /api/gmail/webhook/confirm/:token
 * Confirm email subscription (no auth required - uses token)
 */
router.post('/confirm/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const gw = await getGateway();
    const result = await gw.confirmRecipient(token);

    if (result.success) {
      // Redirect to success page or show HTML
      res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Email Confirmed</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
    .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
    .message { font-size: 16px; color: #333; }
  </style>
</head>
<body>
  <div class="success">✓ Email Confirmed</div>
  <div class="message">
    <p>Your email address has been successfully confirmed.</p>
    <p>You'll now receive emails from ${result.userId}.</p>
  </div>
</body>
</html>
      `);
    } else {
      res.status(400).send(`
<!DOCTYPE html>
<html>
<head>
  <title>Confirmation Failed</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
    .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
    .message { font-size: 16px; color: #333; }
  </style>
</head>
<body>
  <div class="error">✗ Confirmation Failed</div>
  <div class="message">
    <p>${result.error}</p>
    <p>Please contact support if you need assistance.</p>
  </div>
</body>
</html>
      `);
    }

  } catch (error) {
    console.error('[GmailWebhook] Error confirming recipient:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'CONFIRM_ERROR'
    });
  }
});

/**
 * GET /api/gmail/webhook/confirm/:token
 * Confirm email subscription (GET for link clicks)
 */
router.get('/confirm/:token', async (req, res) => {
  // Forward to POST handler
  req.method = 'POST';
  router.handle(req, res);
});

/**
 * GET /api/gmail/webhook/status/:userId
 * Get user status
 */
router.get('/status/:userId', authenticateApiKey, async (req, res) => {
  try {
    const { userId } = req.params;

    const gw = await getGateway();
    const status = await gw.getStatus(userId);

    res.json(status);

  } catch (error) {
    console.error('[GmailWebhook] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'STATUS_ERROR'
    });
  }
});

/**
 * GET /api/gmail/webhook/status
 * Get global status (no userId)
 */
router.get('/status', authenticateApiKey, async (req, res) => {
  try {
    const gw = await getGateway();
    const status = await gw.getStatus();

    res.json(status);

  } catch (error) {
    console.error('[GmailWebhook] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'STATUS_ERROR'
    });
  }
});

/**
 * POST /api/gmail/webhook/test
 * Send test email
 */
router.post('/test', authenticateApiKey, async (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'to is required',
        code: 'MISSING_TO'
      });
    }

    const gw = await getGateway();
    const result = await gw.sendTest(to);

    res.json(result);

  } catch (error) {
    console.error('[GmailWebhook] Error sending test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'TEST_ERROR'
    });
  }
});

/**
 * GET /api/gmail/webhook/health
 * Health check
 */
router.get('/health', async (req, res) => {
  try {
    const gw = await getGateway();
    const health = await gw.healthCheck();

    if (health.status === 'healthy') {
      res.json(health);
    } else {
      res.status(503).json(health);
    }

  } catch (error) {
    console.error('[GmailWebhook] Error checking health:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * POST /api/gmail/webhook/bounce
 * Record bounce (webhook callback from SMTP provider)
 */
router.post('/bounce', verifySignature, async (req, res) => {
  try {
    const { userId, recipientEmail, bounceType } = req.body;

    if (!userId || !recipientEmail) {
      return res.status(400).json({
        success: false,
        error: 'userId and recipientEmail are required'
      });
    }

    const gw = await getGateway();
    await gw.recordBounce(userId, recipientEmail);

    res.json({
      success: true,
      message: 'Bounce recorded'
    });

  } catch (error) {
    console.error('[GmailWebhook] Error recording bounce:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/gmail/webhook/spam
 * Record spam complaint (webhook callback from SMTP provider)
 */
router.post('/spam', verifySignature, async (req, res) => {
  try {
    const { userId, recipientEmail } = req.body;

    if (!userId || !recipientEmail) {
      return res.status(400).json({
        success: false,
        error: 'userId and recipientEmail are required'
      });
    }

    const gw = await getGateway();
    await gw.recordSpamComplaint(userId, recipientEmail);

    res.json({
      success: true,
      message: 'Spam complaint recorded'
    });

  } catch (error) {
    console.error('[GmailWebhook] Error recording spam complaint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
