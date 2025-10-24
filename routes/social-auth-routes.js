/**
 * Social OAuth Routes
 *
 * Handles Twitter/X, GitHub, Discord, LinkedIn OAuth flows.
 *
 * Routes:
 * - GET /auth/twitter → Start Twitter OAuth
 * - GET /auth/github → Start GitHub OAuth
 * - GET /auth/discord → Start Discord OAuth
 * - GET /auth/linkedin → Start LinkedIn OAuth
 * - GET /auth/callback/:provider → Handle OAuth callback
 * - GET /auth/me → Get current user
 * - POST /auth/logout → Logout
 */

const express = require('express');
const router = express.Router();
const SocialAuth = require('../lib/social-auth');
const SubdomainRegistry = require('../lib/subdomain-registry');
const ActivityValidator = require('../lib/activity-validator');
const ActivityLeaderboard = require('../lib/activity-leaderboard');

// Initialize services
const socialAuth = new SocialAuth({
  callbackBaseUrl: process.env.OAUTH_CALLBACK_BASE_URL || 'http://localhost:5001'
});

const subdomainRegistry = new SubdomainRegistry();
const activityValidator = new ActivityValidator();
const activityLeaderboard = new ActivityLeaderboard();

// Initialize all services
(async () => {
  await subdomainRegistry.init();
  await activityValidator.init();
  await activityLeaderboard.init();
})();

/**
 * GET /auth/twitter
 * Start Twitter/X OAuth flow
 */
router.get('/twitter', (req, res) => {
  try {
    const redirectUrl = req.query.redirect || '/';
    const authUrl = socialAuth.getAuthUrl('twitter', redirectUrl);

    res.redirect(authUrl);
  } catch (error) {
    console.error('[SocialAuth] Twitter auth error:', error);
    res.status(500).send(`
      <h1>Twitter Auth Error</h1>
      <p>${error.message}</p>
      <p>Make sure you've set up Twitter OAuth credentials in .env</p>
      <a href="/login">Back to login</a>
    `);
  }
});

/**
 * GET /auth/github
 * Start GitHub OAuth flow
 */
router.get('/github', (req, res) => {
  try {
    const redirectUrl = req.query.redirect || '/';
    const authUrl = socialAuth.getAuthUrl('github', redirectUrl);

    res.redirect(authUrl);
  } catch (error) {
    console.error('[SocialAuth] GitHub auth error:', error);
    res.status(500).send(`
      <h1>GitHub Auth Error</h1>
      <p>${error.message}</p>
      <p>Make sure you've set up GitHub OAuth credentials in .env</p>
      <a href="/login">Back to login</a>
    `);
  }
});

/**
 * GET /auth/discord
 * Start Discord OAuth flow
 */
router.get('/discord', (req, res) => {
  try {
    const redirectUrl = req.query.redirect || '/';
    const authUrl = socialAuth.getAuthUrl('discord', redirectUrl);

    res.redirect(authUrl);
  } catch (error) {
    console.error('[SocialAuth] Discord auth error:', error);
    res.status(500).send(`
      <h1>Discord Auth Error</h1>
      <p>${error.message}</p>
      <p>Make sure you've set up Discord OAuth credentials in .env</p>
      <a href="/login">Back to login</a>
    `);
  }
});

/**
 * GET /auth/linkedin
 * Start LinkedIn OAuth flow
 */
router.get('/linkedin', (req, res) => {
  try {
    const redirectUrl = req.query.redirect || '/';
    const authUrl = socialAuth.getAuthUrl('linkedin', redirectUrl);

    res.redirect(authUrl);
  } catch (error) {
    console.error('[SocialAuth] LinkedIn auth error:', error);
    res.status(500).send(`
      <h1>LinkedIn Auth Error</h1>
      <p>${error.message}</p>
      <p>Make sure you've set up LinkedIn OAuth credentials in .env</p>
      <a href="/login">Back to login</a>
    `);
  }
});

/**
 * GET /auth/callback/:provider
 * Handle OAuth callback from provider
 */
router.get('/callback/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state, error, error_description } = req.query;

    // Check for OAuth error
    if (error) {
      console.error(`[SocialAuth] ${provider} OAuth error:`, error, error_description);
      return res.redirect(`/login?error=${encodeURIComponent(error_description || error)}`);
    }

    // Handle callback
    const result = await socialAuth.handleCallback(provider, code, state);

    // Set session cookie
    res.cookie('session_id', result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    // Auto-create subdomain if doesn't exist
    if (result.user.vanitySubdomain) {
      const parentDomain = 'soulfra.com'; // Default to soulfra for now

      // Check if subdomain exists
      const existing = await subdomainRegistry.getSubdomain(result.user.vanitySubdomain, parentDomain);

      if (!existing.success) {
        // Create subdomain
        const subdomain = await subdomainRegistry.register({
          subdomain: result.user.vanitySubdomain,
          parentDomain,
          userId: result.user.userId,
          owner: {
            username: result.user.socialProfiles[provider].username,
            github: result.user.socialProfiles.github?.username || null,
            discord: result.user.socialProfiles.discord?.username || null,
            email: result.user.email
          },
          records: {
            CNAME: `${result.user.vanitySubdomain}.${parentDomain}`
          },
          metadata: {
            description: result.user.socialProfiles[provider].bio || '',
            website: null,
            tags: result.user.expertise || []
          }
        });

        console.log(`[SocialAuth] Created subdomain: ${result.user.vanitySubdomain}.${parentDomain}`);
      }
    }

    // Log activity
    await activityValidator.logActivity(
      result.user.userId,
      'login',
      { provider, timestamp: new Date().toISOString() }
    );

    // Update leaderboard
    await activityLeaderboard.recordActivity(
      result.user.userId,
      1, // 1 point for login
      parentDomain,
      { username: result.user.socialProfiles[provider].username }
    );

    // Redirect to dashboard or original URL
    const redirectUrl = result.redirectUrl || `/${result.user.vanitySubdomain || 'dashboard'}`;
    res.redirect(redirectUrl);

  } catch (error) {
    console.error('[SocialAuth] Callback error:', error);
    res.redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * GET /auth/me
 * Get current user info
 */
router.get('/me', (req, res) => {
  try {
    const sessionId = req.cookies.session_id;

    if (!sessionId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const verification = socialAuth.verifySession(sessionId);

    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        error: verification.error
      });
    }

    // Get activity summary
    const activitySummary = activityValidator.getUserSummary(verification.user.userId);

    // Get leaderboard rank
    const leaderboardProfile = activityLeaderboard.getPlayerProfile(verification.user.userId);

    res.json({
      success: true,
      user: {
        ...verification.user,
        activity: activitySummary.success ? activitySummary.user : null,
        leaderboard: leaderboardProfile.success ? leaderboardProfile.player : null
      }
    });

  } catch (error) {
    console.error('[SocialAuth] Get user error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /auth/logout
 * Logout (destroy session)
 */
router.post('/logout', (req, res) => {
  try {
    const sessionId = req.cookies.session_id;

    if (sessionId) {
      socialAuth.logout(sessionId);
      res.clearCookie('session_id');
    }

    res.json({ success: true });

  } catch (error) {
    console.error('[SocialAuth] Logout error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
