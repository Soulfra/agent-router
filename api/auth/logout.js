/**
 * Vercel Serverless Function: POST /api/auth/logout
 * Logout (destroy session)
 */

const SocialAuth = require('../../lib/social-auth');

module.exports = async (req, res) => {
  try {
    // Get session ID from cookie
    const cookies = req.headers.cookie || '';
    const sessionIdMatch = cookies.match(/session_id=([^;]+)/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

    if (sessionId) {
      const socialAuth = new SocialAuth();
      socialAuth.logout(sessionId);
    }

    // Clear session cookie
    res.setHeader('Set-Cookie', 'session_id=; HttpOnly; Path=/; Max-Age=0');

    res.json({ success: true });

  } catch (error) {
    console.error('[Logout] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
