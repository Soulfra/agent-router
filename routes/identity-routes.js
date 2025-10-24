/**
 * CalRiven Identity Routes
 *
 * Identity verification, domain ownership, reputation, platform linking
 */

const express = require('express');
const CalRivenIdentity = require('../lib/calriven-identity');

function initIdentityRoutes(db) {
  const router = express.Router();
  const identity = new CalRivenIdentity({ db });

  /**
   * POST /api/identity/verify-email
   * Send email verification code
   */
  router.post('/verify-email', async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      const result = await identity.sendEmailVerification(email);

      res.json({
        success: true,
        message: 'Verification code sent',
        email: email
      });

    } catch (error) {
      console.error('[Identity] Email verification error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/identity/confirm-email
   * Confirm email with verification code
   */
  router.post('/confirm-email', async (req, res) => {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        return res.status(400).json({ error: 'Email and code required' });
      }

      const result = await identity.verifyEmailCode(email, code);

      res.json({
        success: true,
        verified: true,
        reputation_bonus: result.reputation_bonus
      });

    } catch (error) {
      console.error('[Identity] Email confirmation error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/identity/claim-domain
   * Claim domain ownership
   */
  router.post('/claim-domain', async (req, res) => {
    try {
      const { domain, method } = req.body;
      const userId = req.userId || 1; // TODO: Get from auth

      if (!domain) {
        return res.status(400).json({ error: 'Domain required' });
      }

      const verificationCode = await identity.initiateDomainVerification(userId, domain, method);

      res.json({
        success: true,
        domain: domain,
        method: method || 'dns_txt',
        verification_code: verificationCode,
        instructions: identity.getDomainVerificationInstructions(domain, verificationCode, method)
      });

    } catch (error) {
      console.error('[Identity] Domain claim error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/identity/verify-domain
   * Verify domain ownership
   */
  router.post('/verify-domain', async (req, res) => {
    try {
      const { domain } = req.body;
      const userId = req.userId || 1;

      const result = await identity.verifyDomainOwnership(userId, domain);

      res.json({
        success: result.verified,
        verified: result.verified,
        reputation_bonus: result.reputation_bonus,
        method: result.method
      });

    } catch (error) {
      console.error('[Identity] Domain verification error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * GET /api/identity/reputation
   * Get user reputation score
   */
  router.get('/reputation', async (req, res) => {
    try {
      const userId = req.userId || 1;

      const reputation = await identity.getReputation(userId);

      res.json({
        success: true,
        reputation: reputation
      });

    } catch (error) {
      console.error('[Identity] Reputation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/identity/link-platform
   * Link external platform (GitHub, Google, TikTok)
   */
  router.post('/link-platform', async (req, res) => {
    try {
      const { platform, token } = req.body;
      const userId = req.userId || 1;

      if (!platform || !token) {
        return res.status(400).json({ error: 'Platform and token required' });
      }

      const result = await identity.linkPlatform(userId, platform, token);

      res.json({
        success: true,
        platform: platform,
        linked: true,
        reputation_bonus: result.reputation_bonus
      });

    } catch (error) {
      console.error('[Identity] Platform linking error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/identity/profile
   * Get complete identity profile
   */
  router.get('/profile', async (req, res) => {
    try {
      const userId = req.userId || 1;

      const profile = await identity.getIdentityProfile(userId);

      res.json({
        success: true,
        profile: profile
      });

    } catch (error) {
      console.error('[Identity] Profile error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = initIdentityRoutes;
