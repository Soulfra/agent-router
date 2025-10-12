/**
 * Email Router API Routes
 *
 * RESTful endpoints for multi-account email management
 * Supports Gmail, Microsoft, and future providers
 */

const express = require('express');
const router = express.Router();

// Will be injected by main app
let db, emailPoller, emailClassifier;

/**
 * Initialize email routes with dependencies
 */
function init(dependencies) {
  db = dependencies.db;
  emailPoller = dependencies.emailPoller;
  emailClassifier = dependencies.emailClassifier;
}

// ============================================================================
// EMAIL ACCOUNTS
// ============================================================================

/**
 * GET /api/email/accounts
 * Get all email accounts for user
 */
router.get('/accounts', async (req, res) => {
  try {
    const userId = req.user?.id || 1; // TODO: Get from auth middleware

    const result = await db.query(`
      SELECT * FROM email_account_summary
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    res.json({
      success: true,
      accounts: result.rows
    });

  } catch (error) {
    console.error('[Email API] Error fetching accounts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/email/accounts
 * Add new email account
 */
router.post('/accounts', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const { oauthConnectionId, emailAddress, displayName, accountType } = req.body;

    if (!oauthConnectionId || !emailAddress) {
      return res.status(400).json({
        success: false,
        error: 'oauthConnectionId and emailAddress required'
      });
    }

    const result = await db.query(`
      INSERT INTO email_accounts (
        user_id,
        oauth_connection_id,
        provider_id,
        email_address,
        display_name,
        account_type,
        auto_sort,
        sync_enabled
      ) VALUES (
        $1,
        $2,
        (SELECT provider_id FROM user_oauth_connections WHERE id = $2),
        $3,
        $4,
        $5,
        true,
        true
      )
      RETURNING *
    `, [userId, oauthConnectionId, emailAddress, displayName, accountType || 'personal']);

    const account = result.rows[0];

    // Start polling this account
    await emailPoller.startPollingAccount(account);

    res.json({
      success: true,
      account
    });

  } catch (error) {
    console.error('[Email API] Error creating account:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/email/accounts/:id
 * Update email account settings
 */
router.patch('/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { autoSort, syncEnabled, pollInterval, accountType } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (autoSort !== undefined) {
      updates.push(`auto_sort = $${paramCount++}`);
      values.push(autoSort);
    }

    if (syncEnabled !== undefined) {
      updates.push(`sync_enabled = $${paramCount++}`);
      values.push(syncEnabled);
    }

    if (pollInterval !== undefined) {
      updates.push(`poll_interval = $${paramCount++}`);
      values.push(pollInterval);
    }

    if (accountType !== undefined) {
      updates.push(`account_type = $${paramCount++}`);
      values.push(accountType);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No updates provided'
      });
    }

    values.push(id);

    const result = await db.query(`
      UPDATE email_accounts
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    res.json({
      success: true,
      account: result.rows[0]
    });

  } catch (error) {
    console.error('[Email API] Error updating account:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/email/accounts/:id
 * Remove email account
 */
router.delete('/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.query('DELETE FROM email_accounts WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Account removed'
    });

  } catch (error) {
    console.error('[Email API] Error deleting account:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/email/accounts/:id/sync
 * Manually trigger sync for account
 */
router.post('/accounts/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;

    await emailPoller.pollAccountById(parseInt(id));

    res.json({
      success: true,
      message: 'Sync triggered'
    });

  } catch (error) {
    console.error('[Email API] Error triggering sync:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// UNIFIED INBOX
// ============================================================================

/**
 * GET /api/email/inbox
 * Get unified inbox across all accounts
 */
router.get('/inbox', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const {
      category,
      limit = 50,
      offset = 0,
      unreadOnly = false
    } = req.query;

    const result = await db.query(`
      SELECT * FROM get_unified_inbox($1, $2, $3, $4)
    `, [
      userId,
      category || null,
      parseInt(limit),
      parseInt(offset)
    ]);

    res.json({
      success: true,
      messages: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('[Email API] Error fetching inbox:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/email/messages/:id
 * Get full message details
 */
router.get('/messages/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      SELECT
        m.*,
        a.email_address as account_email,
        a.account_type,
        COALESCE(m.user_category, m.ai_category) as category
      FROM email_messages m
      JOIN email_accounts a ON a.id = m.account_id
      WHERE m.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    // Get attachments
    const attachments = await db.query(`
      SELECT * FROM email_attachments
      WHERE message_id = $1
    `, [id]);

    const message = result.rows[0];
    message.attachments = attachments.rows;

    res.json({
      success: true,
      message
    });

  } catch (error) {
    console.error('[Email API] Error fetching message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/email/messages/:id
 * Update message properties
 */
router.patch('/messages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { isRead, isStarred, category } = req.body;

    // Handle category change (user correction)
    if (category !== undefined) {
      await emailClassifier.handleCorrection(parseInt(id), category);
    }

    // Update message flags
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (isRead !== undefined) {
      updates.push(`is_read = $${paramCount++}`);
      values.push(isRead);
    }

    if (isStarred !== undefined) {
      updates.push(`is_starred = $${paramCount++}`);
      values.push(isStarred);
    }

    if (updates.length > 0) {
      values.push(id);
      await db.query(`
        UPDATE email_messages
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
      `, values);
    }

    res.json({
      success: true,
      message: 'Message updated'
    });

  } catch (error) {
    console.error('[Email API] Error updating message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/email/messages/:id/classify
 * Manually trigger classification
 */
router.post('/messages/:id/classify', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await emailClassifier.classify(parseInt(id));

    res.json({
      success: true,
      classification: result
    });

  } catch (error) {
    console.error('[Email API] Error classifying message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// CATEGORIES & STATS
// ============================================================================

/**
 * GET /api/email/categories
 * Get category distribution
 */
router.get('/categories', async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    const result = await db.query(`
      SELECT * FROM email_category_distribution
      WHERE user_id = $1
      ORDER BY message_count DESC
    `, [userId]);

    res.json({
      success: true,
      categories: result.rows
    });

  } catch (error) {
    console.error('[Email API] Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/email/stats
 * Get classification statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    const stats = await emailClassifier.getStats(userId);

    // Get rule effectiveness
    const rules = await db.query(`
      SELECT * FROM routing_rule_effectiveness
      WHERE user_id = $1
      LIMIT 10
    `, [userId]);

    res.json({
      success: true,
      stats: {
        ...stats,
        topRules: rules.rows
      }
    });

  } catch (error) {
    console.error('[Email API] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ROUTING RULES
// ============================================================================

/**
 * GET /api/email/rules
 * Get all routing rules
 */
router.get('/rules', async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    const result = await db.query(`
      SELECT * FROM routing_rule_effectiveness
      WHERE user_id = $1
      ORDER BY accuracy DESC, times_applied DESC
    `, [userId]);

    res.json({
      success: true,
      rules: result.rows
    });

  } catch (error) {
    console.error('[Email API] Error fetching rules:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/email/rules
 * Create manual routing rule
 */
router.post('/rules', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const { ruleType, pattern, targetCategory, accountId, description } = req.body;

    if (!ruleType || !pattern || !targetCategory) {
      return res.status(400).json({
        success: false,
        error: 'ruleType, pattern, and targetCategory required'
      });
    }

    const result = await db.query(`
      INSERT INTO email_routing_rules (
        user_id,
        account_id,
        rule_type,
        pattern,
        target_category,
        priority,
        confidence,
        is_auto_learned,
        description
      ) VALUES ($1, $2, $3, $4, $5, 10, 1.0, false, $6)
      RETURNING *
    `, [userId, accountId || null, ruleType, pattern, targetCategory, description]);

    res.json({
      success: true,
      rule: result.rows[0]
    });

  } catch (error) {
    console.error('[Email API] Error creating rule:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/email/rules/:id
 * Delete routing rule
 */
router.delete('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.query('DELETE FROM email_routing_rules WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Rule deleted'
    });

  } catch (error) {
    console.error('[Email API] Error deleting rule:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SYSTEM STATUS
// ============================================================================

/**
 * GET /api/email/status
 * Get email system status
 */
router.get('/status', async (req, res) => {
  try {
    const pollerStatus = emailPoller.getStatus();

    res.json({
      success: true,
      status: {
        poller: pollerStatus,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[Email API] Error fetching status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = { router, init };
