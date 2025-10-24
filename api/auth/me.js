/**
 * Vercel Serverless Function: GET /api/auth/me
 * Get current user info with activity and leaderboard data
 */

const SocialAuth = require('../../lib/social-auth');
const ActivityValidator = require('../../lib/activity-validator');
const ActivityLeaderboard = require('../../lib/activity-leaderboard');

module.exports = async (req, res) => {
  try {
    // Get session ID from cookie
    const cookies = req.headers.cookie || '';
    const sessionIdMatch = cookies.match(/session_id=([^;]+)/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

    if (!sessionId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    // Initialize services
    const socialAuth = new SocialAuth();
    const activityValidator = new ActivityValidator();
    const activityLeaderboard = new ActivityLeaderboard();

    await Promise.all([
      activityValidator.init(),
      activityLeaderboard.init()
    ]);

    // Verify session
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
    console.error('[Auth Me] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
