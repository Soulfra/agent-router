/**
 * Translation Routes
 *
 * API endpoints for multi-language translation services.
 * Provides server-verified translations with caching for offline use.
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function createTranslationRoutes({ translationAdapter, translationDBManager = null }) {
  if (!translationAdapter) {
    throw new Error('TranslationAdapter required for translation routes');
  }

  // ==================================================================
  // LANGUAGE DETECTION
  // ==================================================================

  /**
   * GET /api/translate/detect
   * Auto-detect user's preferred language from browser/location
   *
   * Response:
   * {
   *   "success": true,
   *   "language": {
   *     "code": "en",
   *     "name": "English",
   *     "nativeName": "English",
   *     "flag": "🇬🇧",
   *     "detected": true,
   *     "source": "http-header"
   *   }
   * }
   */
  router.get('/detect', (req, res) => {
    try {
      const language = translationAdapter.detectUserLanguage(req);

      res.json({
        success: true,
        language
      });
    } catch (error) {
      console.error('[TranslationRoutes] Detect error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================================================================
  // LANGUAGE LISTING
  // ==================================================================

  /**
   * GET /api/translate/languages
   * Get all supported languages
   *
   * Response:
   * {
   *   "success": true,
   *   "languages": [...],
   *   "count": 42
   * }
   */
  router.get('/languages', (req, res) => {
    try {
      const languages = translationAdapter.getSupportedLanguages();

      res.json({
        success: true,
        languages,
        count: languages.length
      });
    } catch (error) {
      console.error('[TranslationRoutes] Languages error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/translate/languages/:code
   * Get info about a specific language
   */
  router.get('/languages/:code', (req, res) => {
    try {
      const { code } = req.params;
      const languageInfo = translationAdapter.getLanguageInfo(code);

      if (!languageInfo) {
        return res.status(404).json({
          success: false,
          error: `Language "${code}" not supported`
        });
      }

      res.json({
        success: true,
        language: {
          code,
          ...languageInfo
        }
      });
    } catch (error) {
      console.error('[TranslationRoutes] Language info error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================================================================
  // TRANSLATION
  // ==================================================================

  /**
   * POST /api/translate
   * Translate text from one language to another
   *
   * Request body:
   * {
   *   "text": "Hello world",
   *   "from": "en",
   *   "to": "es"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "translation": {
   *     "original": "Hello world",
   *     "translated": "Hola mundo",
   *     "fromLang": "en",
   *     "toLang": "es",
   *     "match": 1.0,
   *     "source": "mymemory",
   *     "timestamp": "2025-..."
   *   }
   * }
   */
  router.post('/', async (req, res) => {
    try {
      const { text, from, to, email } = req.body;

      if (!text) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: text'
        });
      }

      if (!from || !to) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: from, to'
        });
      }

      // Verify languages are supported
      if (!translationAdapter.isLanguageSupported(from)) {
        return res.status(400).json({
          success: false,
          error: `Source language "${from}" not supported`
        });
      }

      if (!translationAdapter.isLanguageSupported(to)) {
        return res.status(400).json({
          success: false,
          error: `Target language "${to}" not supported`
        });
      }

      const translation = await translationAdapter.translate(text, from, to, { email });

      res.json({
        success: true,
        translation
      });
    } catch (error) {
      console.error('[TranslationRoutes] Translation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/translate/batch
   * Batch translate multiple texts
   *
   * Request body:
   * {
   *   "texts": ["Hello", "Goodbye", "Thank you"],
   *   "from": "en",
   *   "to": "es"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "translations": [...],
   *   "count": 3,
   *   "cached": 0
   * }
   */
  router.post('/batch', async (req, res) => {
    try {
      const { texts, from, to, email } = req.body;

      if (!texts || !Array.isArray(texts)) {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid field: texts (must be array)'
        });
      }

      if (!from || !to) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: from, to'
        });
      }

      const result = await translationAdapter.translateBatch(texts, from, to, { email });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[TranslationRoutes] Batch translation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================================================================
  // UI TRANSLATIONS (Pre-built translations for common UI elements)
  // ==================================================================

  /**
   * GET /api/translate/ui/:langCode
   * Get pre-translated UI strings for a specific language
   *
   * Response:
   * {
   *   "success": true,
   *   "language": "es",
   *   "translations": {
   *     "files": "Archivos",
   *     "chat": "Chat",
   *     ...
   *   }
   * }
   */
  router.get('/ui/:langCode', (req, res) => {
    try {
      const { langCode } = req.params;

      if (!translationAdapter.isLanguageSupported(langCode)) {
        return res.status(400).json({
          success: false,
          error: `Language "${langCode}" not supported`
        });
      }

      const translations = translationAdapter.getUITranslations(langCode);

      res.json({
        success: true,
        language: langCode,
        translations
      });
    } catch (error) {
      console.error('[TranslationRoutes] UI translations error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================================================================
  // CACHED TRANSLATIONS (Database)
  // ==================================================================

  /**
   * GET /api/translate/cached/:langCode
   * Get all cached translations for a specific language
   *
   * Query params:
   * - context: Filter by context (ui, calculator, general)
   *
   * Response:
   * {
   *   "success": true,
   *   "language": "es",
   *   "context": "calculator",
   *   "translations": {
   *     "Calculate XP": "Calcular XP",
   *     "Current Level": "Nivel Actual",
   *     ...
   *   },
   *   "count": 50,
   *   "source": "database_cache"
   * }
   */
  router.get('/cached/:langCode', async (req, res) => {
    try {
      const { langCode } = req.params;
      const { context } = req.query;

      if (!translationAdapter.isLanguageSupported(langCode)) {
        return res.status(400).json({
          success: false,
          error: `Language "${langCode}" not supported`
        });
      }

      // If no DB manager, fall back to pre-built translations
      if (!translationDBManager) {
        const translations = translationAdapter.getUITranslations(langCode);
        return res.json({
          success: true,
          language: langCode,
          context: context || 'ui',
          translations,
          count: Object.keys(translations).length,
          source: 'adapter_fallback'
        });
      }

      // Get cached translations from database
      const translations = await translationDBManager.getAllForLanguage(langCode, context);

      res.json({
        success: true,
        language: langCode,
        context: context || 'all',
        translations,
        count: Object.keys(translations).length,
        source: 'database_cache'
      });
    } catch (error) {
      console.error('[TranslationRoutes] Cached translations error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/translate/cached
   * Get specific cached translation (or fetch and cache if not found)
   *
   * Request body:
   * {
   *   "text": "Calculate XP",
   *   "from": "en",
   *   "to": "es",
   *   "context": "calculator"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "translation": {
   *     "original": "Calculate XP",
   *     "translated": "Calcular XP",
   *     "confidence": 1.0,
   *     "source": "database_cache"
   *   }
   * }
   */
  router.post('/cached', async (req, res) => {
    try {
      const { text, from, to, context } = req.body;

      if (!text || !from || !to) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: text, from, to'
        });
      }

      // Verify languages are supported
      if (!translationAdapter.isLanguageSupported(from)) {
        return res.status(400).json({
          success: false,
          error: `Source language "${from}" not supported`
        });
      }

      if (!translationAdapter.isLanguageSupported(to)) {
        return res.status(400).json({
          success: false,
          error: `Target language "${to}" not supported`
        });
      }

      // If no DB manager, fall back to API
      if (!translationDBManager) {
        const translation = await translationAdapter.translate(text, from, to);
        return res.json({
          success: true,
          translation: {
            original: translation.original,
            translated: translation.translated,
            confidence: translation.match,
            source: 'api_fallback'
          }
        });
      }

      // Get translation (from cache or API with auto-cache)
      const result = await translationDBManager.getTranslation(text, from, to, context);

      res.json({
        success: true,
        translation: {
          original: text,
          translated: result.translated,
          confidence: result.confidence,
          source: result.source
        }
      });
    } catch (error) {
      console.error('[TranslationRoutes] Cached translation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/translate/preload
   * Pre-load translations for multiple strings
   *
   * Request body:
   * {
   *   "strings": ["Calculate XP", "Reset", "Loading..."],
   *   "from": "en",
   *   "targetLanguages": ["es", "fr", "de"],
   *   "context": "calculator"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "strings_count": 3,
   *   "languages_count": 3,
   *   "total_cached": 9
   * }
   */
  router.post('/preload', async (req, res) => {
    try {
      const { strings, from, targetLanguages, context } = req.body;

      if (!strings || !Array.isArray(strings)) {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid field: strings (must be array)'
        });
      }

      if (!from || !targetLanguages || !Array.isArray(targetLanguages)) {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid fields: from, targetLanguages'
        });
      }

      if (!translationDBManager) {
        return res.status(503).json({
          success: false,
          error: 'Translation database not available'
        });
      }

      const result = await translationDBManager.preloadTranslations(
        strings,
        from,
        targetLanguages,
        context
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[TranslationRoutes] Preload error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================================================================
  // STATS & HEALTH
  // ==================================================================

  /**
   * GET /api/translate/stats
   * Get translation service statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      const stats = translationAdapter.getStats();

      // Add database stats if available
      if (translationDBManager) {
        const dbStats = await translationDBManager.getStats();
        stats.database = dbStats;
      }

      res.json({
        success: true,
        ...stats
      });
    } catch (error) {
      console.error('[TranslationRoutes] Stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/translate/health
   * Health check for translation service
   */
  router.get('/health', async (req, res) => {
    try {
      // Test translation with a simple word
      const test = await translationAdapter.translate('hello', 'en', 'es');

      res.json({
        success: true,
        status: 'healthy',
        test_translation: test.translated === 'hola' || test.translated.toLowerCase().includes('hola'),
        api_provider: 'MyMemory',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createTranslationRoutes;
