/**
 * Translation Database Manager
 *
 * Manages translation cache in PostgreSQL database for instant offline access.
 * Eliminates MyMemory API rate limits by pre-loading and caching translations.
 *
 * Features:
 * - Fast lookup of cached translations (indexed queries)
 * - Automatic caching of new translations from API
 * - Context-aware translations (ui, calculator, general)
 * - Usage statistics tracking
 * - Language preference management
 */

class TranslationDBManager {
  constructor({ db, translationAdapter = null }) {
    if (!db) {
      throw new Error('Database connection required for TranslationDBManager');
    }

    this.db = db;
    this.translationAdapter = translationAdapter; // Optional: for fallback API calls
  }

  /**
   * Get cached translation from database
   * Returns null if not found
   */
  async getCachedTranslation(text, fromLang, toLang, context = null) {
    try {
      const query = context
        ? 'SELECT translated_text, confidence_score, provider FROM translation_cache WHERE source_text = $1 AND source_lang = $2 AND target_lang = $3 AND context = $4'
        : 'SELECT translated_text, confidence_score, provider FROM translation_cache WHERE source_text = $1 AND source_lang = $2 AND target_lang = $3 AND context IS NULL';

      const params = context ? [text, fromLang, toLang, context] : [text, fromLang, toLang];

      const result = await this.db.query(query, params);

      if (result.rows.length > 0) {
        // Update usage stats
        await this.recordCacheHit(fromLang, toLang, text.length);

        // Update usage count for this translation
        await this.db.query(
          'UPDATE translation_cache SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE source_text = $1 AND source_lang = $2 AND target_lang = $3',
          [text, fromLang, toLang]
        );

        console.log(`[TranslationDBManager] Cache HIT: "${text.substring(0, 30)}..." (${fromLang}->${toLang})`);

        return {
          translated: result.rows[0].translated_text,
          confidence: result.rows[0].confidence_score,
          provider: result.rows[0].provider,
          source: 'database_cache'
        };
      }

      console.log(`[TranslationDBManager] Cache MISS: "${text.substring(0, 30)}..." (${fromLang}->${toLang})`);
      return null;
    } catch (error) {
      console.error('[TranslationDBManager] Cache lookup error:', error);
      return null;
    }
  }

  /**
   * Cache a translation in the database
   */
  async cacheTranslation(text, fromLang, toLang, translation, options = {}) {
    try {
      const {
        confidence = null,
        provider = 'mymemory',
        context = null
      } = options;

      await this.db.query(
        `INSERT INTO translation_cache (source_text, source_lang, target_lang, translated_text, confidence_score, provider, context)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (source_text, source_lang, target_lang, context) DO UPDATE
         SET translated_text = EXCLUDED.translated_text,
             confidence_score = EXCLUDED.confidence_score,
             updated_at = CURRENT_TIMESTAMP`,
        [text, fromLang, toLang, translation, confidence, provider, context]
      );

      console.log(`[TranslationDBManager] Cached: "${text.substring(0, 30)}..." -> "${translation.substring(0, 30)}..." (${fromLang}->${toLang})`);

      return true;
    } catch (error) {
      console.error('[TranslationDBManager] Cache write error:', error);
      return false;
    }
  }

  /**
   * Get or fetch translation (with automatic caching)
   * Tries database first, falls back to API if available
   */
  async getTranslation(text, fromLang, toLang, context = null) {
    // Try cache first
    const cached = await this.getCachedTranslation(text, fromLang, toLang, context);
    if (cached) {
      return cached;
    }

    // Fallback to API if adapter is available
    if (this.translationAdapter) {
      try {
        const apiResult = await this.translationAdapter.translate(text, fromLang, toLang);

        // Record API call stat
        await this.recordApiCall(fromLang, toLang, text.length);

        // Cache the result
        await this.cacheTranslation(text, fromLang, toLang, apiResult.translated, {
          confidence: apiResult.match,
          provider: apiResult.source,
          context
        });

        return {
          translated: apiResult.translated,
          confidence: apiResult.match,
          provider: apiResult.source,
          source: 'api_with_cache'
        };
      } catch (error) {
        console.error('[TranslationDBManager] API fallback error:', error);
        return {
          translated: text, // Return original text
          confidence: 0,
          provider: 'fallback',
          source: 'error',
          error: error.message
        };
      }
    }

    // No adapter available, return original text
    return {
      translated: text,
      confidence: 0,
      provider: 'none',
      source: 'no_cache_no_api'
    };
  }

  /**
   * Get all translations for a specific target language and context
   * Useful for loading all UI translations at once
   */
  async getAllForLanguage(targetLang, context = null) {
    try {
      const query = context
        ? 'SELECT source_text, translated_text, context FROM translation_cache WHERE target_lang = $1 AND context = $2 ORDER BY source_text'
        : 'SELECT source_text, translated_text, context FROM translation_cache WHERE target_lang = $1 ORDER BY source_text';

      const params = context ? [targetLang, context] : [targetLang];

      const result = await this.db.query(query, params);

      // Convert to key-value object
      const translations = {};
      result.rows.forEach(row => {
        translations[row.source_text] = row.translated_text;
      });

      console.log(`[TranslationDBManager] Loaded ${result.rows.length} translations for language: ${targetLang}${context ? ` (context: ${context})` : ''}`);

      return translations;
    } catch (error) {
      console.error('[TranslationDBManager] Get all translations error:', error);
      return {};
    }
  }

  /**
   * Batch translate and cache multiple texts
   */
  async batchTranslate(texts, fromLang, toLang, context = null) {
    console.log(`[TranslationDBManager] Batch translating ${texts.length} texts (${fromLang}->${toLang})`);

    const results = [];

    for (const text of texts) {
      const translation = await this.getTranslation(text, fromLang, toLang, context);
      results.push({
        original: text,
        translated: translation.translated,
        confidence: translation.confidence,
        source: translation.source
      });
    }

    return {
      fromLang,
      toLang,
      translations: results,
      count: results.length,
      cached: results.filter(r => r.source === 'database_cache').length
    };
  }

  /**
   * Pre-load translations for a set of strings
   * Useful for calculator, UI elements, etc.
   */
  async preloadTranslations(strings, fromLang, targetLangs, context = null) {
    console.log(`[TranslationDBManager] Pre-loading ${strings.length} strings into ${targetLangs.length} languages (context: ${context || 'general'})`);

    let totalCached = 0;

    for (const targetLang of targetLangs) {
      for (const text of strings) {
        // Skip if already cached
        const cached = await this.getCachedTranslation(text, fromLang, targetLang, context);
        if (cached) {
          continue;
        }

        // Fetch and cache
        await this.getTranslation(text, fromLang, targetLang, context);
        totalCached++;

        // Rate limit: 1 request per 100ms to avoid overwhelming API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`[TranslationDBManager] Pre-load complete: ${totalCached} new translations cached`);

    return {
      strings_count: strings.length,
      languages_count: targetLangs.length,
      total_cached: totalCached
    };
  }

  /**
   * Record cache hit in statistics
   */
  async recordCacheHit(fromLang, toLang, charCount = 0) {
    try {
      await this.db.query(
        'SELECT record_translation_stat($1, FALSE, TRUE, $2)',
        [`${fromLang}-${toLang}`, charCount]
      );
    } catch (error) {
      // Non-critical, just log
      console.error('[TranslationDBManager] Stats recording error:', error.message);
    }
  }

  /**
   * Record API call in statistics
   */
  async recordApiCall(fromLang, toLang, charCount = 0) {
    try {
      await this.db.query(
        'SELECT record_translation_stat($1, TRUE, FALSE, $2)',
        [`${fromLang}-${toLang}`, charCount]
      );
    } catch (error) {
      // Non-critical, just log
      console.error('[TranslationDBManager] Stats recording error:', error.message);
    }
  }

  /**
   * Get translation statistics
   */
  async getStats(days = 30) {
    try {
      const result = await this.db.query(
        `SELECT
          language_pair,
          SUM(api_calls) as total_api_calls,
          SUM(cache_hits) as total_cache_hits,
          SUM(total_chars_translated) as total_chars,
          COUNT(DISTINCT date) as days_active
         FROM translation_stats
         WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
         GROUP BY language_pair
         ORDER BY total_cache_hits DESC`,
        []
      );

      const totalCached = await this.db.query(
        'SELECT COUNT(*) as count FROM translation_cache'
      );

      const languageCount = await this.db.query(
        'SELECT COUNT(DISTINCT target_lang) as count FROM translation_cache'
      );

      return {
        cached_translations: parseInt(totalCached.rows[0].count),
        languages_cached: parseInt(languageCount.rows[0].count),
        language_pairs: result.rows,
        reporting_period_days: days
      };
    } catch (error) {
      console.error('[TranslationDBManager] Get stats error:', error);
      return {
        cached_translations: 0,
        languages_cached: 0,
        language_pairs: [],
        error: error.message
      };
    }
  }

  /**
   * Save user language preference
   */
  async saveUserLanguagePreference(options = {}) {
    try {
      const {
        userId = null,
        ipAddress = null,
        detectedLanguage = null,
        preferredLanguage = null,
        countryCode = null
      } = options;

      await this.db.query(
        `INSERT INTO user_language_preferences (user_id, ip_address, detected_language, preferred_language, country_code)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, ipAddress, detectedLanguage, preferredLanguage, countryCode]
      );

      console.log(`[TranslationDBManager] Saved language preference for ${ipAddress || 'user'}: ${preferredLanguage || detectedLanguage}`);

      return true;
    } catch (error) {
      console.error('[TranslationDBManager] Save preference error:', error);
      return false;
    }
  }

  /**
   * Get user language preference by IP
   */
  async getUserLanguagePreference(ipAddress) {
    try {
      const result = await this.db.query(
        'SELECT preferred_language, detected_language, country_code FROM user_language_preferences WHERE ip_address = $1 ORDER BY last_used_at DESC LIMIT 1',
        [ipAddress]
      );

      if (result.rows.length > 0) {
        return {
          preferred: result.rows[0].preferred_language,
          detected: result.rows[0].detected_language,
          country: result.rows[0].country_code
        };
      }

      return null;
    } catch (error) {
      console.error('[TranslationDBManager] Get preference error:', error);
      return null;
    }
  }

  /**
   * Clear old unused translations (cleanup)
   */
  async cleanupUnusedTranslations(daysUnused = 90) {
    try {
      const result = await this.db.query(
        `DELETE FROM translation_cache
         WHERE last_used_at < CURRENT_TIMESTAMP - INTERVAL '${daysUnused} days'
         AND use_count = 0`,
        []
      );

      console.log(`[TranslationDBManager] Cleanup: Removed ${result.rowCount} unused translations`);

      return {
        removed: result.rowCount,
        days_threshold: daysUnused
      };
    } catch (error) {
      console.error('[TranslationDBManager] Cleanup error:', error);
      return { removed: 0, error: error.message };
    }
  }
}

module.exports = TranslationDBManager;
