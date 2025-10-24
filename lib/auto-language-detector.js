/**
 * Automatic Language Detector
 *
 * Automatically detects user's preferred language using multiple signals:
 * 1. Saved user preference (if logged in)
 * 2. Browser language (navigator.language)
 * 3. IP-based geolocation (country → language)
 * 4. HTTP Accept-Language header
 * 5. Timezone inference
 * 6. Fallback to English
 *
 * Preloads translations for detected language + regional alternatives
 *
 * Usage:
 *   const detector = new AutoLanguageDetector({ db, geoResolver });
 *
 *   // Server-side detection
 *   const lang = await detector.detect(req);
 *   // → 'es' (from IP in Mexico)
 *
 *   // Get preload languages (detected + regional)
 *   const preload = await detector.getPreloadLanguages(req);
 *   // → ['es', 'en', 'pt'] (Spanish primary, English fallback, Portuguese regional)
 *
 *   // Save user preference
 *   await detector.savePreference(userId, 'ja');
 */

class AutoLanguageDetector {
  constructor(options = {}) {
    this.db = options.db;
    this.geoResolver = options.geoResolver;

    // Country → primary language mapping
    this.countryLanguageMap = {
      // Spanish
      ES: 'es', MX: 'es', AR: 'es', CO: 'es', VE: 'es', CL: 'es', PE: 'es', EC: 'es',
      GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es',
      CR: 'es', PA: 'es', UY: 'es', PR: 'es',

      // Chinese
      CN: 'zh', TW: 'zh', HK: 'zh', SG: 'zh',

      // Japanese
      JP: 'ja',

      // Portuguese
      BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt',

      // French
      FR: 'fr', CA: 'fr', BE: 'fr', CH: 'fr', LU: 'fr', MC: 'fr',
      CI: 'fr', SN: 'fr', CM: 'fr', ML: 'fr', NE: 'fr', BF: 'fr', CD: 'fr',

      // German
      DE: 'de', AT: 'de', LI: 'de',

      // Hindi
      IN: 'hi',

      // Arabic
      SA: 'ar', AE: 'ar', EG: 'ar', IQ: 'ar', JO: 'ar', KW: 'ar', LB: 'ar',
      OM: 'ar', QA: 'ar', SY: 'ar', YE: 'ar', BH: 'ar', MA: 'ar', TN: 'ar',
      DZ: 'ar', LY: 'ar', SD: 'ar',

      // English (fallback)
      US: 'en', GB: 'en', AU: 'en', NZ: 'en', IE: 'en', ZA: 'en', CA: 'en'
    };

    // Regional language clusters (for preloading)
    this.regionalClusters = {
      es: ['es', 'pt', 'en'], // Spanish speakers also benefit from Portuguese, English
      zh: ['zh', 'ja', 'en'], // Chinese speakers also benefit from Japanese, English
      ja: ['ja', 'zh', 'en'], // Japanese speakers also benefit from Chinese, English
      pt: ['pt', 'es', 'en'], // Portuguese speakers also benefit from Spanish, English
      fr: ['fr', 'en', 'ar'], // French speakers (Africa) also benefit from English, Arabic
      de: ['de', 'en', 'fr'], // German speakers also benefit from English, French
      hi: ['hi', 'en', 'ar'], // Hindi speakers also benefit from English, Arabic
      ar: ['ar', 'en', 'fr'], // Arabic speakers also benefit from English, French
      en: ['en', 'es', 'zh']  // English speakers - preload largest markets
    };

    // Timezone → likely languages
    this.timezoneLanguageMap = {
      'America/New_York': ['en', 'es'],
      'America/Los_Angeles': ['en', 'es'],
      'America/Chicago': ['en', 'es'],
      'America/Mexico_City': ['es', 'en'],
      'America/Sao_Paulo': ['pt', 'es', 'en'],
      'America/Buenos_Aires': ['es', 'en'],
      'Europe/Madrid': ['es', 'en'],
      'Europe/Paris': ['fr', 'en'],
      'Europe/Berlin': ['de', 'en'],
      'Europe/London': ['en', 'fr'],
      'Asia/Shanghai': ['zh', 'en'],
      'Asia/Tokyo': ['ja', 'en'],
      'Asia/Seoul': ['en', 'ja'],
      'Asia/Dubai': ['ar', 'en'],
      'Asia/Kolkata': ['hi', 'en'],
      'Asia/Singapore': ['zh', 'en'],
      'Australia/Sydney': ['en', 'zh']
    };

    console.log('[AutoLanguageDetector] Initialized with', Object.keys(this.countryLanguageMap).length, 'country mappings');
  }

  /**
   * Detect user's preferred language from multiple signals
   */
  async detect(req, userId = null) {
    const signals = {};

    // Signal 1: Saved user preference (highest priority)
    if (userId && this.db) {
      const saved = await this._getSavedPreference(userId);
      if (saved) {
        signals.saved = saved;
        console.log(`[AutoLanguageDetector] User ${userId} preference: ${saved}`);
        return saved;
      }
    }

    // Signal 2: Browser language from headers
    if (req.headers['accept-language']) {
      const browserLang = this._parseAcceptLanguage(req.headers['accept-language']);
      if (browserLang) {
        signals.browser = browserLang;
      }
    }

    // Signal 3: IP-based geolocation
    if (this.geoResolver && req.ip) {
      const geo = await this._detectFromIP(req.ip);
      if (geo) {
        signals.geo = geo;
      }
    }

    // Signal 4: Timezone inference (from headers or query params)
    const timezone = req.headers['x-timezone'] || req.query.timezone;
    if (timezone) {
      const tzLang = this._detectFromTimezone(timezone);
      if (tzLang) {
        signals.timezone = tzLang;
      }
    }

    // Priority: browser > geo > timezone > fallback
    const detected = signals.browser || signals.geo || signals.timezone || 'en';

    console.log('[AutoLanguageDetector] Detection signals:', signals);
    console.log('[AutoLanguageDetector] Final detected language:', detected);

    return detected;
  }

  /**
   * Get languages to preload (detected + regional alternatives)
   */
  async getPreloadLanguages(req, userId = null) {
    const primary = await this.detect(req, userId);
    const cluster = this.regionalClusters[primary] || [primary, 'en'];

    console.log(`[AutoLanguageDetector] Preloading languages for ${primary}:`, cluster);

    return cluster;
  }

  /**
   * Parse Accept-Language header
   * Example: "en-US,en;q=0.9,es;q=0.8" → "en"
   */
  _parseAcceptLanguage(header) {
    if (!header) return null;

    // Split by comma, sort by quality factor
    const languages = header.split(',').map(lang => {
      const parts = lang.trim().split(';');
      const code = parts[0].split('-')[0].toLowerCase();
      const quality = parts[1] ? parseFloat(parts[1].replace('q=', '')) : 1.0;
      return { code, quality };
    });

    // Sort by quality descending
    languages.sort((a, b) => b.quality - a.quality);

    // Return highest quality language
    const best = languages[0];
    const supported = ['en', 'es', 'zh', 'ja', 'pt', 'fr', 'de', 'hi', 'ar'];

    if (supported.includes(best.code)) {
      return best.code;
    }

    // Fallback to English if not supported
    return 'en';
  }

  /**
   * Detect language from IP address
   */
  async _detectFromIP(ip) {
    if (!this.geoResolver) return null;

    // Skip local/private IPs
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return null;
    }

    try {
      const geo = await this.geoResolver.resolve(ip);

      if (geo && geo.country_code) {
        const lang = this.countryLanguageMap[geo.country_code];
        if (lang) {
          console.log(`[AutoLanguageDetector] IP ${ip} → ${geo.country_code} → ${lang}`);
          return lang;
        }
      }
    } catch (error) {
      console.error('[AutoLanguageDetector] Geo resolution error:', error.message);
    }

    return null;
  }

  /**
   * Detect language from timezone
   */
  _detectFromTimezone(timezone) {
    const languages = this.timezoneLanguageMap[timezone];

    if (languages && languages.length > 0) {
      console.log(`[AutoLanguageDetector] Timezone ${timezone} → ${languages[0]}`);
      return languages[0];
    }

    return null;
  }

  /**
   * Get saved user language preference
   */
  async _getSavedPreference(userId) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        SELECT preferred_language
        FROM user_language_preferences
        WHERE user_id = $1
      `, [userId]);

      if (result.rows.length > 0) {
        return result.rows[0].preferred_language;
      }
    } catch (error) {
      // Table might not exist yet
      console.error('[AutoLanguageDetector] Preference lookup error:', error.message);
    }

    return null;
  }

  /**
   * Save user language preference
   */
  async savePreference(userId, language) {
    if (!this.db) {
      throw new Error('Database required to save preferences');
    }

    try {
      await this.db.query(`
        INSERT INTO user_language_preferences (user_id, preferred_language, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          preferred_language = $2,
          updated_at = NOW()
      `, [userId, language]);

      console.log(`[AutoLanguageDetector] Saved preference for user ${userId}: ${language}`);
    } catch (error) {
      console.error('[AutoLanguageDetector] Save preference error:', error.message);
      throw error;
    }
  }

  /**
   * Get language statistics (for analytics)
   */
  async getLanguageStats() {
    if (!this.db) {
      throw new Error('Database required for stats');
    }

    try {
      const result = await this.db.query(`
        SELECT
          preferred_language,
          COUNT(*) as user_count
        FROM user_language_preferences
        GROUP BY preferred_language
        ORDER BY user_count DESC
      `);

      const stats = {
        totalUsers: 0,
        byLanguage: {}
      };

      for (const row of result.rows) {
        stats.byLanguage[row.preferred_language] = parseInt(row.user_count);
        stats.totalUsers += parseInt(row.user_count);
      }

      return stats;
    } catch (error) {
      console.error('[AutoLanguageDetector] Stats error:', error.message);
      return { totalUsers: 0, byLanguage: {} };
    }
  }

  /**
   * Detect language from client-side data (for browser integration)
   */
  static detectClientSide() {
    // This runs in browser
    let detected = navigator.language || navigator.userLanguage;

    if (detected) {
      // Extract base language (e.g., 'en-US' -> 'en')
      detected = detected.split('-')[0].toLowerCase();
    }

    // Get timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return {
      language: detected || 'en',
      timezone,
      fullLanguage: navigator.language
    };
  }

  /**
   * Get suggested languages based on user behavior
   */
  async getSuggestedLanguages(userId) {
    if (!this.db) return ['en', 'es', 'zh'];

    try {
      // Get languages user has engaged with
      const result = await this.db.query(`
        SELECT DISTINCT language, COUNT(*) as engagement_count
        FROM (
          SELECT language FROM voice_journal_publications WHERE user_id = $1
          UNION ALL
          SELECT target_language as language FROM voice_journal_translations
          WHERE session_id IN (
            SELECT session_id FROM voice_journal_sessions WHERE user_id = $1
          )
        ) as lang_data
        GROUP BY language
        ORDER BY engagement_count DESC
        LIMIT 5
      `, [userId]);

      if (result.rows.length > 0) {
        return result.rows.map(r => r.language);
      }
    } catch (error) {
      console.error('[AutoLanguageDetector] Suggested languages error:', error.message);
    }

    // Default suggestions (biggest markets)
    return ['en', 'es', 'zh', 'hi', 'ar'];
  }

  /**
   * Validate language code
   */
  isSupported(languageCode) {
    const supported = ['en', 'es', 'zh', 'ja', 'pt', 'fr', 'de', 'hi', 'ar'];
    return supported.includes(languageCode);
  }

  /**
   * Get language metadata
   */
  getLanguageInfo(languageCode) {
    const info = {
      en: { name: 'English', native: 'English', speakers: 1500000000, rtl: false },
      es: { name: 'Spanish', native: 'Español', speakers: 500000000, rtl: false },
      zh: { name: 'Chinese', native: '简体中文', speakers: 1400000000, rtl: false },
      ja: { name: 'Japanese', native: '日本語', speakers: 125000000, rtl: false },
      pt: { name: 'Portuguese', native: 'Português', speakers: 260000000, rtl: false },
      fr: { name: 'French', native: 'Français', speakers: 300000000, rtl: false },
      de: { name: 'German', native: 'Deutsch', speakers: 130000000, rtl: false },
      hi: { name: 'Hindi', native: 'हिन्दी', speakers: 600000000, rtl: false },
      ar: { name: 'Arabic', native: 'العربية', speakers: 420000000, rtl: true }
    };

    return info[languageCode] || info.en;
  }
}

module.exports = AutoLanguageDetector;
