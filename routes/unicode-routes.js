/**
 * Unicode Character API Routes
 *
 * Provides access to Unicode character lookup and mathematical symbols
 */

const express = require('express');

function initRoutes(unicodeManager) {
  const router = express.Router();

  /**
   * Search characters by name
   * GET /api/unicode/search?query=integral&limit=20
   */
  router.get('/search', async (req, res) => {
    try {
      const query = req.query.query || '';
      const limit = parseInt(req.query.limit) || 20;

      if (!query) {
        return res.status(400).json({
          error: 'Query parameter required',
          example: '/api/unicode/search?query=integral'
        });
      }

      const results = unicodeManager.searchByName(query, limit);

      res.json({
        success: true,
        query,
        count: results.length,
        results
      });

    } catch (error) {
      console.error('[Unicode API] Search error:', error);
      res.status(500).json({
        error: 'Search failed',
        message: error.message
      });
    }
  });

  /**
   * Get character by hex code point
   * GET /api/unicode/char/1D461
   * GET /api/unicode/char/U+1D461
   */
  router.get('/char/:hex', async (req, res) => {
    try {
      const hex = req.params.hex;
      const char = unicodeManager.getCharacterByHex(hex);

      if (!char) {
        return res.status(404).json({
          error: 'Character not found',
          hex
        });
      }

      res.json({
        success: true,
        codePoint: char.codePoint,
        hex: `U+${char.codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
        character: String.fromCodePoint(char.codePoint),
        name: char.name,
        category: char.category
      });

    } catch (error) {
      console.error('[Unicode API] Char lookup error:', error);
      res.status(500).json({
        error: 'Character lookup failed',
        message: error.message
      });
    }
  });

  /**
   * Get all mathematical symbols
   * GET /api/unicode/math
   */
  router.get('/math', async (req, res) => {
    try {
      const symbols = unicodeManager.getMathSymbols();

      res.json({
        success: true,
        count: symbols.length,
        symbols
      });

    } catch (error) {
      console.error('[Unicode API] Math symbols error:', error);
      res.status(500).json({
        error: 'Failed to get math symbols',
        message: error.message
      });
    }
  });

  /**
   * Get all Greek letters
   * GET /api/unicode/greek
   */
  router.get('/greek', async (req, res) => {
    try {
      const letters = unicodeManager.getGreekLetters();

      res.json({
        success: true,
        count: letters.length,
        letters
      });

    } catch (error) {
      console.error('[Unicode API] Greek letters error:', error);
      res.status(500).json({
        error: 'Failed to get Greek letters',
        message: error.message
      });
    }
  });

  /**
   * Get common symbol shortcuts
   * GET /api/unicode/shortcuts
   */
  router.get('/shortcuts', async (req, res) => {
    try {
      const shortcuts = {
        latex: {
          // Greek letters
          '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
          '\\pi': 'π', '\\sigma': 'σ', '\\omega': 'ω', '\\Omega': 'Ω',

          // Math operators
          '\\sum': '∑', '\\prod': '∏', '\\int': '∫', '\\partial': '∂',
          '\\infty': '∞', '\\pm': '±', '\\neq': '≠', '\\leq': '≤', '\\geq': '≥',

          // Arrows
          '\\rightarrow': '→', '\\leftarrow': '←', '\\Rightarrow': '⇒',
          '\\Leftarrow': '⇐', '\\leftrightarrow': '↔'
        },

        emoji: {
          // Greek letters
          ':alpha:': 'α', ':beta:': 'β', ':gamma:': 'γ', ':delta:': 'δ',
          ':pi:': 'π', ':sigma:': 'σ', ':omega:': 'ω',

          // Math operators
          ':sum:': '∑', ':integral:': '∫', ':infinity:': '∞',
          ':plus-minus:': '±', ':not-equal:': '≠'
        }
      };

      res.json({
        success: true,
        shortcuts
      });

    } catch (error) {
      console.error('[Unicode API] Shortcuts error:', error);
      res.status(500).json({
        error: 'Failed to get shortcuts',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = { initRoutes };
