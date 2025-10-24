/**
 * Vercel Serverless Function: GET /api/auth/callback
 * Handle OAuth callback from all providers
 *
 * Query params:
 * - provider: twitter|github|discord|linkedin
 * - code: Authorization code
 * - state: CSRF token
 */

const SocialAuth = require('../../lib/social-auth');
const SubdomainRegistry = require('../../lib/subdomain-registry');
const ActivityValidator = require('../../lib/activity-validator');
const ActivityLeaderboard = require('../../lib/activity-leaderboard');

module.exports = async (req, res) => {
  try {
    const { provider } = req.query;
    const { code, state, error, error_description } = req.query;

    // Check for OAuth error
    if (error) {
      console.error(`[OAuth Callback] ${provider} error:`, error, error_description);
      const loginUrl = process.env.LOGIN_PAGE_URL || 'https://soulfra.github.io/login.html';
      return res.redirect(`${loginUrl}?error=${encodeURIComponent(error_description || error)}`);
    }

    // Initialize services
    const socialAuth = new SocialAuth({
      callbackBaseUrl: process.env.OAUTH_CALLBACK_BASE_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:5001'
    });

    const subdomainRegistry = new SubdomainRegistry();
    const activityValidator = new ActivityValidator();
    const activityLeaderboard = new ActivityLeaderboard();

    // Initialize services (Google Sheets if configured)
    await Promise.all([
      subdomainRegistry.init(),
      activityValidator.init(),
      activityLeaderboard.init()
    ]);

    // Handle OAuth callback
    const result = await socialAuth.handleCallback(provider, code, state);

    // Set session cookie
    res.setHeader('Set-Cookie', `session_id=${result.sessionId}; HttpOnly; Path=/; Max-Age=${30 * 24 * 60 * 60}; ${process.env.NODE_ENV === 'production' ? 'Secure; SameSite=Lax' : 'SameSite=Lax'}`);

    // Auto-create subdomain if doesn't exist
    if (result.user.vanitySubdomain) {
      const parentDomain = process.env.PARENT_DOMAIN || 'soulfra.com';

      // Check if subdomain exists
      const existing = await subdomainRegistry.getSubdomain(result.user.vanitySubdomain, parentDomain);

      if (!existing.success) {
        // Create subdomain
        await subdomainRegistry.register({
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

        console.log(`[OAuth Callback] Created subdomain: ${result.user.vanitySubdomain}.${parentDomain}`);
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
      process.env.PARENT_DOMAIN || 'soulfra.com',
      { username: result.user.socialProfiles[provider].username }
    );

    // Redirect to dashboard or original URL
    const homePageUrl = process.env.HOME_PAGE_URL || 'https://soulfra.github.io';
    const redirectUrl = result.redirectUrl === '/'
      ? `${homePageUrl}/${result.user.vanitySubdomain || 'dashboard'}`
      : result.redirectUrl;

    res.redirect(redirectUrl);

  } catch (error) {
    console.error('[OAuth Callback] Error:', error);
    const loginUrl = process.env.LOGIN_PAGE_URL || 'https://soulfra.github.io/login.html';
    res.redirect(`${loginUrl}?error=${encodeURIComponent(error.message)}`);
  }
};
