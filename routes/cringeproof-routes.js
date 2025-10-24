/**
 * CringeProof Routes
 *
 * API for emoji vibe checking and cringe detection.
 * Powers cringeproof.com frontend.
 */

const express = require('express');
const router = express.Router();

function createCringeProofRoutes({ db, emojiVibeScorer, calLearningLoop }) {
  if (!emojiVibeScorer) {
    throw new Error('EmojiVibeScorer required for cringeproof routes');
  }

  /**
   * POST /api/cringeproof/vibe-check
   * Check if message is cringe or based
   *
   * Body:
   * {
   *   "message": "bruh 💀💀💀 this is fire 🔥",
   *   "context": {
   *     "type": "gen_z",  // casual, professional, gen_z, millennial
   *     "ageGroup": "teen"
   *   }
   * }
   */
  router.post('/vibe-check', async (req, res) => {
    try {
      const { message, context = {} } = req.body;

      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required'
        });
      }

      const result = await emojiVibeScorer.vibeCheck(message, context);

      // Log for CAL learning (if available and has method)
      if (calLearningLoop && typeof calLearningLoop.logEmojiUsage === 'function') {
        try {
          await calLearningLoop.logEmojiUsage({
            message,
            context,
            result,
            timestamp: Date.now()
          });
        } catch (error) {
          console.warn('[CringeProofRoutes] CAL logging failed:', error.message);
        }
      }

      res.json({
        success: true,
        result
      });

    } catch (error) {
      console.error('[CringeProofRoutes] Error checking vibe:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/cringeproof/score-emoji
   * Score individual emoji
   *
   * Body:
   * {
   *   "emoji": "💀",
   *   "context": { "type": "gen_z" }
   * }
   */
  router.post('/score-emoji', async (req, res) => {
    try {
      const { emoji, context = {} } = req.body;

      if (!emoji) {
        return res.status(400).json({
          success: false,
          error: 'Emoji is required'
        });
      }

      const result = await emojiVibeScorer.score(emoji, context);

      res.json({
        success: true,
        result
      });

    } catch (error) {
      console.error('[CringeProofRoutes] Error scoring emoji:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/cringeproof/themed-deck/:theme
   * Get themed emoji deck
   *
   * Params:
   * - theme: hanafuda, chaos, wholesome, meme, food
   *
   * Query:
   * - ageGroup: teen, adult, kid
   * - count: number of emojis (default 40)
   */
  router.get('/themed-deck/:theme', (req, res) => {
    try {
      const { theme } = req.params;
      const { ageGroup = 'teen', count = 40 } = req.query;

      const deck = emojiVibeScorer.getThemedDeck(theme, ageGroup, parseInt(count));

      res.json({
        success: true,
        theme,
        ageGroup,
        count: deck.length,
        deck
      });

    } catch (error) {
      console.error('[CringeProofRoutes] Error getting themed deck:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/cringeproof/stats
   * Get cringeproof stats
   */
  router.get('/stats', (req, res) => {
    try {
      const stats = emojiVibeScorer.getStats();

      res.json({
        success: true,
        stats
      });

    } catch (error) {
      console.error('[CringeProofRoutes] Error getting stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createCringeProofRoutes;
