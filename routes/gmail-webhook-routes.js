/**
 * Gmail Webhook API Routes
 *
 * Endpoints for:
 * - Receiving Gmail Pub/Sub webhooks (Tier 3)
 * - Managing Send-As aliases (Tier 1)
 * - Webhook configuration
 * - Statistics and logs
 */

const express = require('express');
const router = express.Router();
const GmailWebhookRelay = require('../lib/gmail-webhook-relay');
const GmailSendAsManager = require('../lib/gmail-send-as-manager');

// Initialize services
const webhookRelay = new GmailWebhookRelay();
const sendAsManager = new GmailSendAsManager();

// ==============================================================================
// Pub/Sub Webhook Endpoint (Tier 3: Full Relay)
// ==============================================================================

/**
 * POST /api/gmail/webhook
 *
 * Receive Gmail Pub/Sub webhook notifications
 *
 * Called by: Google Cloud Pub/Sub
 * Trigger: New email in user's Gmail
 *
 * Body:
 * {
 *   "message": {
 *     "data": "base64_encoded_data",
 *     "messageId": "1234567890",
 *     "publishTime": "2025-10-20T12:00:00.000Z"
 *   },
 *   "subscription": "projects/PROJECT_ID/subscriptions/SUBSCRIPTION_ID"
 * }
 */
router.post('/webhook', async (req, res) => {
  try {
    console.log('[Gmail Webhook] Received Pub/Sub notification');

    const pubsubMessage = req.body.message;

    if (!pubsubMessage || !pubsubMessage.data) {
      return res.status(400).json({
        error: 'Invalid Pub/Sub message format'
      });
    }

    // Process webhook asynchronously
    // (Don't block Pub/Sub acknowledgment)
    webhookRelay.handleWebhook(pubsubMessage)
      .then(result => {
        console.log('[Gmail Webhook] Processing result:', result);
      })
      .catch(error => {
        console.error('[Gmail Webhook] Processing error:', error);
      });

    // Acknowledge receipt immediately
    res.status(200).json({ status: 'acknowledged' });

  } catch (error) {
    console.error('[Gmail Webhook] Error handling webhook:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/gmail/webhook/test
 *
 * Test webhook endpoint (for development)
 */
router.get('/webhook/test', async (req, res) => {
  res.json({
    status: 'ok',
    message: 'Gmail webhook endpoint is ready',
    timestamp: new Date().toISOString()
  });
});

// ==============================================================================
// Webhook Configuration (Tier 3)
// ==============================================================================

/**
 * POST /api/gmail/webhook/config
 *
 * Create webhook configuration for user
 *
 * Body:
 * {
 *   "userId": "user123",
 *   "emailAddress": "user@gmail.com",
 *   "accessToken": "ya29...",
 *   "refreshToken": "1//...",
 *   "relayFromAddress": "noreply@calos.ai",
 *   "relayRules": {
 *     "subject_contains": "CALOS",
 *     "from_domain": "example.com"
 *   },
 *   "enabled": true
 * }
 */
router.post('/webhook/config', async (req, res) => {
  try {
    const {
      userId,
      emailAddress,
      accessToken,
      refreshToken,
      relayFromAddress,
      relayRules,
      enabled
    } = req.body;

    // Validate required fields
    if (!userId || !emailAddress || !accessToken || !refreshToken) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userId', 'emailAddress', 'accessToken', 'refreshToken']
      });
    }

    const config = await webhookRelay.createWebhookConfig({
      userId,
      emailAddress,
      accessToken,
      refreshToken,
      relayFromAddress,
      relayRules,
      enabled
    });

    res.json({
      status: 'success',
      config: {
        id: config.id,
        userId: config.user_id,
        emailAddress: config.email_address,
        relayFromAddress: config.relay_from_address,
        enabled: config.enabled,
        createdAt: config.created_at
      }
    });

  } catch (error) {
    console.error('[Gmail Webhook Config] Error creating config:', error);
    res.status(500).json({
      error: 'Failed to create webhook configuration',
      message: error.message
    });
  }
});

/**
 * PUT /api/gmail/webhook/config/:userId
 *
 * Update webhook configuration
 *
 * Body:
 * {
 *   "relayFromAddress": "support@calos.ai",
 *   "relayRules": { "subject_contains": "Support" },
 *   "enabled": false
 * }
 */
router.put('/webhook/config/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    await webhookRelay.updateWebhookConfig(userId, updates);

    res.json({
      status: 'success',
      message: 'Webhook configuration updated',
      userId
    });

  } catch (error) {
    console.error('[Gmail Webhook Config] Error updating config:', error);
    res.status(500).json({
      error: 'Failed to update webhook configuration',
      message: error.message
    });
  }
});

/**
 * GET /api/gmail/webhook/config/:emailAddress
 *
 * Get webhook configuration by email
 */
router.get('/webhook/config/:emailAddress', async (req, res) => {
  try {
    const { emailAddress } = req.params;

    const config = await webhookRelay.getUserConfig(emailAddress);

    if (!config) {
      return res.status(404).json({
        error: 'Configuration not found',
        emailAddress
      });
    }

    // Don't expose tokens in response
    res.json({
      status: 'success',
      config: {
        id: config.id,
        userId: config.user_id,
        emailAddress: config.email_address,
        relayFromAddress: config.relay_from_address,
        relayRules: config.relay_rules,
        enabled: config.enabled,
        lastWebhookAt: config.last_webhook_at,
        createdAt: config.created_at
      }
    });

  } catch (error) {
    console.error('[Gmail Webhook Config] Error getting config:', error);
    res.status(500).json({
      error: 'Failed to get webhook configuration',
      message: error.message
    });
  }
});

/**
 * GET /api/gmail/webhook/stats/:userId
 *
 * Get relay statistics for user
 */
router.get('/webhook/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const stats = await webhookRelay.getRelayStats(userId);

    res.json({
      status: 'success',
      stats
    });

  } catch (error) {
    console.error('[Gmail Webhook Stats] Error getting stats:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: error.message
    });
  }
});

// ==============================================================================
// Send-As Alias Management (Tier 1)
// ==============================================================================

/**
 * POST /api/gmail/send-as
 *
 * Add a new Send-As alias
 *
 * Body:
 * {
 *   "userId": "user123",
 *   "accessToken": "ya29...",
 *   "refreshToken": "1//...",
 *   "sendAsEmail": "support@mycompany.com",
 *   "displayName": "My Company Support",
 *   "replyToAddress": "support@mycompany.com",
 *   "signature": "<p>Best regards,<br>Support Team</p>",
 *   "isDefault": false
 * }
 */
router.post('/send-as', async (req, res) => {
  try {
    const {
      userId,
      accessToken,
      refreshToken,
      sendAsEmail,
      displayName,
      replyToAddress,
      signature,
      isDefault
    } = req.body;

    // Validate required fields
    if (!userId || !accessToken || !refreshToken || !sendAsEmail) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userId', 'accessToken', 'refreshToken', 'sendAsEmail']
      });
    }

    const alias = await sendAsManager.addSendAsAlias(
      userId,
      accessToken,
      refreshToken,
      {
        sendAsEmail,
        displayName,
        replyToAddress,
        signature,
        isDefault
      }
    );

    res.json({
      status: 'success',
      alias: {
        sendAsEmail: alias.sendAsEmail,
        displayName: alias.displayName,
        verificationStatus: alias.verificationStatus,
        needsVerification: alias.needsVerification,
        isDefault: alias.isDefault
      },
      message: alias.needsVerification
        ? `Verification email sent to ${sendAsEmail}. Please check inbox and click verification link.`
        : 'Send-As alias added successfully'
    });

  } catch (error) {
    console.error('[Gmail Send-As] Error adding alias:', error);
    res.status(500).json({
      error: 'Failed to add Send-As alias',
      message: error.message
    });
  }
});

/**
 * GET /api/gmail/send-as/:userId
 *
 * List all Send-As aliases for user
 */
router.get('/send-as/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { accessToken, refreshToken } = req.query;

    if (!accessToken || !refreshToken) {
      // Get from database only
      const aliases = await sendAsManager.getSendAsAliasesFromDB(userId);

      return res.json({
        status: 'success',
        source: 'database',
        aliases
      });
    }

    // Fetch from Gmail API
    const aliases = await sendAsManager.listSendAsAliases(
      userId,
      accessToken,
      refreshToken
    );

    res.json({
      status: 'success',
      source: 'gmail_api',
      aliases
    });

  } catch (error) {
    console.error('[Gmail Send-As] Error listing aliases:', error);
    res.status(500).json({
      error: 'Failed to list Send-As aliases',
      message: error.message
    });
  }
});

/**
 * PUT /api/gmail/send-as/:userId/:sendAsEmail
 *
 * Update Send-As alias configuration
 *
 * Body:
 * {
 *   "accessToken": "ya29...",
 *   "refreshToken": "1//...",
 *   "displayName": "Updated Name",
 *   "replyToAddress": "newemail@example.com",
 *   "signature": "<p>New signature</p>",
 *   "isDefault": true
 * }
 */
router.put('/send-as/:userId/:sendAsEmail', async (req, res) => {
  try {
    const { userId, sendAsEmail } = req.params;
    const {
      accessToken,
      refreshToken,
      displayName,
      replyToAddress,
      signature,
      isDefault
    } = req.body;

    if (!accessToken || !refreshToken) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['accessToken', 'refreshToken']
      });
    }

    const alias = await sendAsManager.updateSendAsAliasConfig(
      userId,
      accessToken,
      refreshToken,
      decodeURIComponent(sendAsEmail),
      {
        displayName,
        replyToAddress,
        signature,
        isDefault
      }
    );

    res.json({
      status: 'success',
      alias,
      message: 'Send-As alias updated successfully'
    });

  } catch (error) {
    console.error('[Gmail Send-As] Error updating alias:', error);
    res.status(500).json({
      error: 'Failed to update Send-As alias',
      message: error.message
    });
  }
});

/**
 * DELETE /api/gmail/send-as/:userId/:sendAsEmail
 *
 * Delete Send-As alias
 */
router.delete('/send-as/:userId/:sendAsEmail', async (req, res) => {
  try {
    const { userId, sendAsEmail } = req.params;
    const { accessToken, refreshToken } = req.query;

    if (!accessToken || !refreshToken) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['accessToken', 'refreshToken']
      });
    }

    await sendAsManager.deleteSendAsAlias(
      userId,
      accessToken,
      refreshToken,
      decodeURIComponent(sendAsEmail)
    );

    res.json({
      status: 'success',
      message: 'Send-As alias deleted successfully',
      sendAsEmail: decodeURIComponent(sendAsEmail)
    });

  } catch (error) {
    console.error('[Gmail Send-As] Error deleting alias:', error);
    res.status(500).json({
      error: 'Failed to delete Send-As alias',
      message: error.message
    });
  }
});

/**
 * POST /api/gmail/send-as/:userId/:sendAsEmail/verify
 *
 * Send verification email for Send-As alias
 */
router.post('/send-as/:userId/:sendAsEmail/verify', async (req, res) => {
  try {
    const { userId, sendAsEmail } = req.params;
    const { accessToken, refreshToken } = req.body;

    if (!accessToken || !refreshToken) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['accessToken', 'refreshToken']
      });
    }

    const result = await sendAsManager.verifySendAsAlias(
      userId,
      accessToken,
      refreshToken,
      decodeURIComponent(sendAsEmail)
    );

    res.json({
      status: 'success',
      ...result
    });

  } catch (error) {
    console.error('[Gmail Send-As] Error verifying alias:', error);
    res.status(500).json({
      error: 'Failed to send verification email',
      message: error.message
    });
  }
});

/**
 * GET /api/gmail/send-as/:userId/:sendAsEmail/status
 *
 * Check verification status of Send-As alias
 */
router.get('/send-as/:userId/:sendAsEmail/status', async (req, res) => {
  try {
    const { userId, sendAsEmail } = req.params;
    const { accessToken, refreshToken } = req.query;

    if (!accessToken || !refreshToken) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['accessToken', 'refreshToken']
      });
    }

    const status = await sendAsManager.checkVerificationStatus(
      userId,
      accessToken,
      refreshToken,
      decodeURIComponent(sendAsEmail)
    );

    res.json({
      status: 'success',
      ...status
    });

  } catch (error) {
    console.error('[Gmail Send-As] Error checking verification status:', error);
    res.status(500).json({
      error: 'Failed to check verification status',
      message: error.message
    });
  }
});

/**
 * POST /api/gmail/send-as/:userId/send
 *
 * Send email using Send-As alias
 *
 * Body:
 * {
 *   "accessToken": "ya29...",
 *   "refreshToken": "1//...",
 *   "from": "support@mycompany.com",
 *   "to": "customer@example.com",
 *   "cc": ["manager@example.com"],
 *   "bcc": ["archive@example.com"],
 *   "subject": "Your Support Request",
 *   "text": "Plain text body",
 *   "html": "<p>HTML body</p>"
 * }
 */
router.post('/send-as/:userId/send', async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      accessToken,
      refreshToken,
      from,
      to,
      cc,
      bcc,
      subject,
      text,
      html
    } = req.body;

    // Validate required fields
    if (!accessToken || !refreshToken || !from || !to || !subject) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['accessToken', 'refreshToken', 'from', 'to', 'subject']
      });
    }

    const result = await sendAsManager.sendEmail(
      userId,
      accessToken,
      refreshToken,
      {
        from,
        to,
        cc,
        bcc,
        subject,
        text,
        html
      }
    );

    res.json({
      status: 'success',
      ...result,
      message: 'Email sent successfully'
    });

  } catch (error) {
    console.error('[Gmail Send-As] Error sending email:', error);
    res.status(500).json({
      error: 'Failed to send email',
      message: error.message
    });
  }
});

/**
 * GET /api/gmail/send-as/:userId/stats
 *
 * Get email sending statistics for user
 */
router.get('/send-as/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params;

    const stats = await sendAsManager.getEmailStats(userId);

    res.json({
      status: 'success',
      stats
    });

  } catch (error) {
    console.error('[Gmail Send-As Stats] Error getting stats:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: error.message
    });
  }
});

// ==============================================================================
// Health Check
// ==============================================================================

/**
 * GET /api/gmail/health
 *
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Gmail Webhook & Send-As',
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook: '/api/gmail/webhook',
      sendAs: '/api/gmail/send-as'
    }
  });
});

module.exports = router;
