/**
 * Vercel Serverless Function: GET /api/auth/discord
 * Start Discord OAuth flow
 */

const SocialAuth = require('../../lib/social-auth');

module.exports = async (req, res) => {
  try {
    const socialAuth = new SocialAuth({
      callbackBaseUrl: process.env.OAUTH_CALLBACK_BASE_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:5001'
    });

    const redirectUrl = req.query.redirect || '/';
    const authUrl = socialAuth.getAuthUrl('discord', redirectUrl);

    res.redirect(authUrl);
  } catch (error) {
    console.error('[Discord Auth] Error:', error);
    res.status(500).send(`
      <h1>Discord Auth Error</h1>
      <p>${error.message}</p>
      <p>Make sure you've set up Discord OAuth credentials in environment variables</p>
      <a href="/login.html">Back to login</a>
    `);
  }
};
