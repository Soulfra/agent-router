/**
 * Twilio Routes
 *
 * Phone verification, SMS, and calls with credit deductions
 *
 * Requirements:
 * - npm install twilio
 * - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const {
  requireAuth
} = require('../middleware/sso-auth');

// Dependencies (injected via initRoutes)
let db = null;
let twilioClient = null;

// Pricing (matches pricing_config table)
const PRICING = {
  phone_verification: 5,    // $0.05
  sms_outbound: 1,          // $0.01
  sms_inbound: 0,           // Free
  mms_outbound: 3,          // $0.03
  call_outbound_per_min: 5, // $0.05/min
  call_inbound_per_min: 2,  // $0.02/min
};

/**
 * Initialize routes with dependencies
 */
function initRoutes(database, twilio) {
  db = database;
  twilioClient = twilio;
  return router;
}

// ============================================================================
// PHONE VERIFICATION
// ============================================================================

/**
 * POST /api/twilio/phone/verify/send
 * Send verification code to phone number
 *
 * Body: {
 *   phoneNumber: string (E.164 format: +12345678900)
 * }
 */
router.post('/phone/verify/send', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { phoneNumber } = req.body;

    if (!phoneNumber || !phoneNumber.startsWith('+1')) {
      return res.status(400).json({
        error: 'USA phone number required (format: +1XXXXXXXXXX)'
      });
    }

    // Check if user can afford
    const canAfford = await db.query(
      'SELECT can_afford($1, $2) as can_afford',
      [userId, PRICING.phone_verification]
    );

    if (!canAfford.rows[0].can_afford) {
      return res.status(402).json({
        error: 'Insufficient credits',
        required: PRICING.phone_verification,
        requiredUsd: PRICING.phone_verification / 100
      });
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store verification request
    const result = await db.query(`
      INSERT INTO verified_phones (
        user_id,
        phone_number,
        country_code,
        verified,
        verification_code,
        verification_sent_at,
        verification_expires_at
      ) VALUES ($1, $2, 'US', FALSE, $3, NOW(), $4)
      ON CONFLICT (phone_number)
      DO UPDATE SET
        user_id = $1,
        verification_code = $3,
        verification_sent_at = NOW(),
        verification_expires_at = $4,
        verified = FALSE
      RETURNING phone_id
    `, [userId, phoneNumber, code, expiresAt]);

    const phoneId = result.rows[0].phone_id;

    // Send SMS via Twilio
    try {
      const message = await twilioClient.messages.create({
        body: `Your CalOS verification code is: ${code}. Valid for 10 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });

      // Update with Twilio SID
      await db.query(
        'UPDATE verified_phones SET twilio_sid = $1 WHERE phone_id = $2',
        [message.sid, phoneId]
      );

      // Deduct credits
      await db.query(
        `SELECT deduct_credits($1, $2, 'phone_verification', $3, $4, $5::jsonb)`,
        [
          userId,
          PRICING.phone_verification,
          'Phone verification SMS sent',
          message.sid,
          JSON.stringify({ phoneNumber, code: '[REDACTED]' })
        ]
      );

      console.log(`[Twilio] Verification sent to ${phoneNumber}: ${message.sid}`);

      res.json({
        success: true,
        phoneId,
        expiresAt,
        message: 'Verification code sent via SMS'
      });

    } catch (twilioError) {
      console.error('[Twilio] Failed to send SMS:', twilioError);
      res.status(500).json({
        error: 'Failed to send verification SMS',
        details: twilioError.message
      });
    }

  } catch (error) {
    console.error('[Twilio] Verify send error:', error);
    res.status(500).json({ error: 'Failed to send verification' });
  }
});

/**
 * POST /api/twilio/phone/verify/confirm
 * Confirm verification code
 *
 * Body: {
 *   phoneNumber: string,
 *   code: string (6 digits)
 * }
 */
router.post('/phone/verify/confirm', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { phoneNumber, code } = req.body;

    if (!phoneNumber || !code) {
      return res.status(400).json({
        error: 'Phone number and code required'
      });
    }

    // Check code
    const result = await db.query(`
      SELECT phone_id, verification_code, verification_expires_at
      FROM verified_phones
      WHERE user_id = $1
        AND phone_number = $2
        AND verified = FALSE
    `, [userId, phoneNumber]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'No pending verification for this number'
      });
    }

    const phone = result.rows[0];

    // Check expiry
    if (new Date() > new Date(phone.verification_expires_at)) {
      return res.status(400).json({
        error: 'Verification code expired',
        code: 'CODE_EXPIRED'
      });
    }

    // Check code matches
    if (phone.verification_code !== code) {
      return res.status(400).json({
        error: 'Invalid verification code',
        code: 'INVALID_CODE'
      });
    }

    // Mark as verified
    await db.query(`
      UPDATE verified_phones
      SET
        verified = TRUE,
        verified_at = NOW(),
        verification_code = NULL,
        verification_expires_at = NULL,
        active = TRUE
      WHERE phone_id = $1
    `, [phone.phone_id]);

    console.log(`[Twilio] Phone verified: ${phoneNumber}`);

    res.json({
      success: true,
      message: 'Phone number verified successfully',
      phoneNumber
    });

  } catch (error) {
    console.error('[Twilio] Verify confirm error:', error);
    res.status(500).json({ error: 'Failed to verify phone' });
  }
});

/**
 * GET /api/twilio/phone/verified
 * List user's verified phone numbers
 */
router.get('/phone/verified', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(`
      SELECT
        phone_id,
        phone_number,
        country_code,
        verified,
        verified_at,
        active,
        created_at
      FROM verified_phones
      WHERE user_id = $1
      ORDER BY verified_at DESC NULLS LAST
    `, [userId]);

    res.json({
      success: true,
      phones: result.rows.map(row => ({
        phoneId: row.phone_id,
        phoneNumber: row.phone_number,
        countryCode: row.country_code,
        verified: row.verified,
        verifiedAt: row.verified_at,
        active: row.active,
        createdAt: row.created_at
      }))
    });

  } catch (error) {
    console.error('[Twilio] List phones error:', error);
    res.status(500).json({ error: 'Failed to list phones' });
  }
});

/**
 * DELETE /api/twilio/phone/:phoneId
 * Remove phone number
 */
router.delete('/phone/:phoneId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { phoneId } = req.params;

    // Verify ownership
    const result = await db.query(
      'SELECT user_id FROM verified_phones WHERE phone_id = $1',
      [phoneId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Phone not found' });
    }

    if (result.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Soft delete
    await db.query(
      'UPDATE verified_phones SET active = FALSE WHERE phone_id = $1',
      [phoneId]
    );

    res.json({
      success: true,
      message: 'Phone number removed'
    });

  } catch (error) {
    console.error('[Twilio] Delete phone error:', error);
    res.status(500).json({ error: 'Failed to remove phone' });
  }
});

// ============================================================================
// SMS SENDING
// ============================================================================

/**
 * POST /api/twilio/sms/send
 * Send SMS (deducts credits)
 *
 * Body: {
 *   to: string (phone number),
 *   message: string,
 *   from: string (optional - user's verified number)
 * }
 */
router.post('/sms/send', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { to, message, from } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        error: 'Recipient phone number and message required'
      });
    }

    const cost = PRICING.sms_outbound;

    // Check balance
    const canAfford = await db.query(
      'SELECT can_afford($1, $2) as can_afford',
      [userId, cost]
    );

    if (!canAfford.rows[0].can_afford) {
      const balance = await db.query(
        'SELECT get_user_balance($1) as balance',
        [userId]
      );

      return res.status(402).json({
        error: 'Insufficient credits',
        required: cost,
        balance: balance.rows[0].balance,
        shortfall: cost - balance.rows[0].balance
      });
    }

    // Send SMS
    try {
      const twilioMessage = await twilioClient.messages.create({
        body: message,
        from: from || process.env.TWILIO_PHONE_NUMBER,
        to
      });

      // Deduct credits
      await db.query(
        `SELECT deduct_credits($1, $2, 'sms_outbound', $3, $4, $5::jsonb)`,
        [
          userId,
          cost,
          `SMS to ${to}`,
          twilioMessage.sid,
          JSON.stringify({ to, from: from || process.env.TWILIO_PHONE_NUMBER, messageLength: message.length })
        ]
      );

      // Log usage
      await db.query(`
        INSERT INTO twilio_usage (
          user_id,
          from_number,
          to_number,
          direction,
          type,
          cost_cents,
          twilio_cost_usd,
          profit_cents,
          twilio_sid,
          twilio_status,
          message_body
        ) VALUES ($1, $2, $3, 'outbound', 'sms', $4, $5, $6, $7, $8, $9)
      `, [
        userId,
        from || process.env.TWILIO_PHONE_NUMBER,
        to,
        cost,
        0.0079, // Twilio cost
        cost - 1, // Profit (rounded)
        twilioMessage.sid,
        twilioMessage.status,
        message
      ]);

      console.log(`[Twilio] SMS sent: ${twilioMessage.sid}`);

      res.json({
        success: true,
        messageId: twilioMessage.sid,
        status: twilioMessage.status,
        cost,
        message: 'SMS sent successfully'
      });

    } catch (twilioError) {
      console.error('[Twilio] SMS send failed:', twilioError);
      res.status(500).json({
        error: 'Failed to send SMS',
        details: twilioError.message
      });
    }

  } catch (error) {
    console.error('[Twilio] SMS error:', error);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// ============================================================================
// CALL HANDLING
// ============================================================================

/**
 * POST /api/twilio/call/initiate
 * Start outbound call (deducts credits)
 *
 * Body: {
 *   to: string (phone number),
 *   from: string (optional - user's verified number)
 * }
 */
router.post('/call/initiate', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { to, from } = req.body;

    if (!to) {
      return res.status(400).json({
        error: 'Recipient phone number required'
      });
    }

    // Reserve credits for 1 minute
    const initialCost = PRICING.call_outbound_per_min;

    const canAfford = await db.query(
      'SELECT can_afford($1, $2) as can_afford',
      [userId, initialCost]
    );

    if (!canAfford.rows[0].can_afford) {
      return res.status(402).json({
        error: 'Insufficient credits for call',
        required: initialCost,
        message: 'You need at least $0.05 credits to start a call'
      });
    }

    // Initiate call
    try {
      const call = await twilioClient.calls.create({
        url: `${process.env.APP_URL}/api/twilio/webhook/call-twiml`,
        to,
        from: from || process.env.TWILIO_PHONE_NUMBER,
        statusCallback: `${process.env.APP_URL}/api/twilio/webhook/call-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
      });

      // Reserve initial credits (will adjust on completion)
      await db.query(
        `SELECT deduct_credits($1, $2, 'call_outbound_init', $3, $4, $5::jsonb)`,
        [
          userId,
          initialCost,
          `Call to ${to} (initial reserve)`,
          call.sid,
          JSON.stringify({ to, from: from || process.env.TWILIO_PHONE_NUMBER, status: 'initiated' })
        ]
      );

      // Log usage (will update with duration later)
      await db.query(`
        INSERT INTO twilio_usage (
          user_id,
          from_number,
          to_number,
          direction,
          type,
          cost_cents,
          twilio_cost_usd,
          profit_cents,
          twilio_sid,
          twilio_status
        ) VALUES ($1, $2, $3, 'outbound', 'call', $4, 0, 0, $5, $6)
      `, [
        userId,
        from || process.env.TWILIO_PHONE_NUMBER,
        to,
        initialCost,
        call.sid,
        call.status
      ]);

      console.log(`[Twilio] Call initiated: ${call.sid}`);

      res.json({
        success: true,
        callId: call.sid,
        status: call.status,
        reservedCredits: initialCost,
        message: 'Call initiated'
      });

    } catch (twilioError) {
      console.error('[Twilio] Call failed:', twilioError);
      res.status(500).json({
        error: 'Failed to initiate call',
        details: twilioError.message
      });
    }

  } catch (error) {
    console.error('[Twilio] Call error:', error);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// ============================================================================
// TWILIO WEBHOOKS
// ============================================================================

/**
 * POST /api/twilio/webhook/call-twiml
 * TwiML response for outbound calls
 */
router.post('/webhook/call-twiml', (req, res) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Hello! This is a call from Cal O S. How can we help you today?</Say>
  <Pause length="30"/>
  <Say voice="Polly.Joanna">Thank you for your time. Goodbye!</Say>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

/**
 * POST /api/twilio/webhook/call-status
 * Twilio callback for call status updates
 */
router.post('/webhook/call-status', async (req, res) => {
  try {
    const {
      CallSid,
      CallStatus,
      CallDuration,
      From,
      To
    } = req.body;

    console.log(`[Twilio] Call status: ${CallSid} = ${CallStatus}`);

    // If call completed, calculate final cost
    if (CallStatus === 'completed' && CallDuration) {
      const durationMinutes = Math.ceil(parseInt(CallDuration) / 60);
      const finalCost = durationMinutes * PRICING.call_outbound_per_min;
      const initialCost = PRICING.call_outbound_per_min;
      const adjustment = finalCost - initialCost;

      // Find user from twilio_usage
      const usageResult = await db.query(
        'SELECT user_id FROM twilio_usage WHERE twilio_sid = $1',
        [CallSid]
      );

      if (usageResult.rows.length > 0) {
        const userId = usageResult.rows[0].user_id;

        // Adjust credits if needed
        if (adjustment > 0) {
          // Call was longer - deduct more
          await db.query(
            `SELECT deduct_credits($1, $2, 'call_outbound_adjust', $3, $4, $5::jsonb)`,
            [
              userId,
              adjustment,
              `Call adjustment: ${durationMinutes} mins`,
              CallSid,
              JSON.stringify({ duration: CallDuration, durationMinutes, finalCost })
            ]
          );
        } else if (adjustment < 0) {
          // Call was shorter - refund difference
          await db.query(
            `SELECT add_credits($1, $2, 'call_refund', $3, NULL, $4::jsonb)`,
            [
              userId,
              Math.abs(adjustment),
              `Call refund: shorter than expected`,
              JSON.stringify({ duration: CallDuration, durationMinutes, refund: Math.abs(adjustment) })
            ]
          );
        }

        // Update twilio_usage with final details
        await db.query(`
          UPDATE twilio_usage
          SET
            duration_seconds = $1,
            cost_cents = $2,
            twilio_cost_usd = $3,
            profit_cents = $4,
            twilio_status = $5,
            completed_at = NOW()
          WHERE twilio_sid = $6
        `, [
          CallDuration,
          finalCost,
          durationMinutes * 0.013, // Twilio cost
          finalCost - (durationMinutes * 1), // Profit (rounded)
          CallStatus,
          CallSid
        ]);

        console.log(`[Twilio] Call completed: ${CallSid} (${durationMinutes} mins, $${(finalCost / 100).toFixed(2)})`);
      }
    }

    res.sendStatus(200);

  } catch (error) {
    console.error('[Twilio] Webhook error:', error);
    res.sendStatus(500);
  }
});

/**
 * POST /api/twilio/webhook/incoming
 * Handle incoming SMS/calls
 */
router.post('/webhook/incoming', async (req, res) => {
  try {
    const {
      MessageSid,
      From,
      To,
      Body,
      NumMedia
    } = req.body;

    console.log(`[Twilio] Incoming message from ${From}: ${Body}`);

    // Find user by phone number
    const userResult = await db.query(
      'SELECT user_id FROM verified_phones WHERE phone_number = $1 AND verified = TRUE',
      [From]
    );

    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].user_id;

      // Log incoming SMS (free for user)
      await db.query(`
        INSERT INTO twilio_usage (
          user_id,
          from_number,
          to_number,
          direction,
          type,
          cost_cents,
          twilio_cost_usd,
          profit_cents,
          twilio_sid,
          twilio_status,
          message_body
        ) VALUES ($1, $2, $3, 'inbound', 'sms', 0, 0, 0, $4, 'received', $5)
      `, [userId, From, To, MessageSid, Body]);

      // TODO: Process message (AI response, routing, etc.)
    }

    // Respond to Twilio
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thank you for contacting CalOS! Your message has been received.</Message>
</Response>`;

    res.type('text/xml');
    res.send(twiml);

  } catch (error) {
    console.error('[Twilio] Incoming webhook error:', error);
    res.sendStatus(500);
  }
});

// ============================================================================
// USAGE HISTORY
// ============================================================================

/**
 * GET /api/twilio/history
 * Get call/SMS history for user
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 50, type, direction } = req.query;

    let query = `
      SELECT
        usage_id,
        from_number,
        to_number,
        direction,
        type,
        duration_seconds,
        cost_cents,
        twilio_sid,
        twilio_status,
        message_body,
        created_at,
        completed_at
      FROM twilio_usage
      WHERE user_id = $1
    `;

    const params = [userId];
    let paramCount = 1;

    if (type) {
      paramCount++;
      query += ` AND type = $${paramCount}`;
      params.push(type);
    }

    if (direction) {
      paramCount++;
      query += ` AND direction = $${paramCount}`;
      params.push(direction);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({
      success: true,
      history: result.rows.map(row => ({
        usageId: row.usage_id,
        from: row.from_number,
        to: row.to_number,
        direction: row.direction,
        type: row.type,
        durationSeconds: row.duration_seconds,
        costCents: row.cost_cents,
        costUsd: row.cost_cents / 100,
        status: row.twilio_status,
        messageBody: row.message_body,
        createdAt: row.created_at,
        completedAt: row.completed_at
      })),
      count: result.rows.length
    });

  } catch (error) {
    console.error('[Twilio] History error:', error);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

module.exports = { initRoutes };
