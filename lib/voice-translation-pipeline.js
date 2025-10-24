/**
 * Voice Translation Pipeline
 *
 * Auto-translates voice journal narratives to multiple languages for global reach:
 * - Spanish (es) - 500M speakers
 * - Chinese (zh) - 1.4B speakers
 * - Japanese (ja) - 125M speakers
 * - Portuguese (pt) - 260M speakers
 * - French (fr) - 300M speakers
 * - German (de) - 130M speakers
 * - Hindi (hi) - 600M speakers
 * - Arabic (ar) - 420M speakers
 *
 * Total potential reach: 3.7 BILLION people (vs 330M English-only)
 *
 * Features:
 * - Context-aware translation (preserves meaning, not just words)
 * - Brand voice preservation across languages
 * - Cultural adaptation (idioms, examples, references)
 * - Multi-format translation (story, blog, thread, podcast)
 * - Translation caching & reuse
 *
 * Usage:
 *   const pipeline = new VoiceTranslationPipeline({ llmRouter, db });
 *
 *   const translations = await pipeline.translateNarrative({
 *     narrative,
 *     targetLanguages: ['es', 'zh', 'ja'],
 *     brand: 'soulfra'
 *   });
 *
 *   // translations.es.story.title → "Luchando contra los corredores de datos..."
 *   // translations.zh.story.title → "与数据经纪人作斗争..."
 */

const { EventEmitter } = require('events');

class VoiceTranslationPipeline extends EventEmitter {
  constructor(options = {}) {
    super();

    this.llmRouter = options.llmRouter;
    this.db = options.db;

    // Language configurations
    this.languages = {
      en: {
        name: 'English',
        native: 'English',
        speakers: 1500000000, // Including second-language speakers
        markets: ['USA', 'UK', 'Canada', 'Australia'],
        timezone: 'America/New_York'
      },
      es: {
        name: 'Spanish',
        native: 'Español',
        speakers: 500000000,
        markets: ['Spain', 'Mexico', 'Argentina', 'Colombia'],
        timezone: 'Europe/Madrid',
        culturalNotes: 'Use informal "tú" for tech content, formal "usted" for business'
      },
      zh: {
        name: 'Chinese (Simplified)',
        native: '简体中文',
        speakers: 1400000000,
        markets: ['China', 'Singapore'],
        timezone: 'Asia/Shanghai',
        culturalNotes: 'Emphasize collective benefit, use examples from local tech companies'
      },
      ja: {
        name: 'Japanese',
        native: '日本語',
        speakers: 125000000,
        markets: ['Japan'],
        timezone: 'Asia/Tokyo',
        culturalNotes: 'Use polite form (です・ます), emphasize quality and precision'
      },
      pt: {
        name: 'Portuguese',
        native: 'Português',
        speakers: 260000000,
        markets: ['Brazil', 'Portugal'],
        timezone: 'America/Sao_Paulo',
        culturalNotes: 'Brazilian Portuguese more common, friendly tone'
      },
      fr: {
        name: 'French',
        native: 'Français',
        speakers: 300000000,
        markets: ['France', 'Canada', 'Belgium', 'Switzerland'],
        timezone: 'Europe/Paris',
        culturalNotes: 'Formal "vous" for professional content, emphasize elegance'
      },
      de: {
        name: 'German',
        native: 'Deutsch',
        speakers: 130000000,
        markets: ['Germany', 'Austria', 'Switzerland'],
        timezone: 'Europe/Berlin',
        culturalNotes: 'Direct communication style, emphasize engineering/precision'
      },
      hi: {
        name: 'Hindi',
        native: 'हिन्दी',
        speakers: 600000000,
        markets: ['India'],
        timezone: 'Asia/Kolkata',
        culturalNotes: 'Mix Hindi with English tech terms, emphasize affordability'
      },
      ar: {
        name: 'Arabic',
        native: 'العربية',
        speakers: 420000000,
        markets: ['Saudi Arabia', 'UAE', 'Egypt'],
        timezone: 'Asia/Dubai',
        culturalNotes: 'Right-to-left text, formal Modern Standard Arabic for content'
      }
    };

    // Default target languages
    this.defaultTargets = ['es', 'zh', 'ja', 'pt', 'fr', 'de', 'hi', 'ar'];

    console.log('[VoiceTranslationPipeline] Initialized with', Object.keys(this.languages).length, 'languages');
  }

  /**
   * Translate complete narrative to multiple languages
   */
  async translateNarrative(input) {
    const {
      narrative,
      targetLanguages = this.defaultTargets,
      brand = 'calos',
      sourceLanguage = 'en',
      skipCache = false
    } = input;

    console.log(`[VoiceTranslationPipeline] Translating to ${targetLanguages.length} languages`);

    const translations = {};

    for (const targetLang of targetLanguages) {
      if (targetLang === sourceLanguage) {
        // No translation needed for source language
        translations[targetLang] = narrative.outputs;
        continue;
      }

      try {
        this.emit('translation:started', { targetLang, brand });

        // Check cache
        if (!skipCache && this.db) {
          const cached = await this._getCachedTranslation(narrative, targetLang);
          if (cached) {
            console.log(`[VoiceTranslationPipeline] Using cached translation for ${targetLang}`);
            translations[targetLang] = cached;
            this.emit('translation:cached', { targetLang });
            continue;
          }
        }

        // Translate all output formats
        const translated = {};

        if (narrative.outputs.story) {
          translated.story = await this._translateStory(narrative.outputs.story, targetLang, brand);
        }

        if (narrative.outputs.blog) {
          translated.blog = await this._translateBlog(narrative.outputs.blog, targetLang, brand);
        }

        if (narrative.outputs.thread) {
          translated.thread = await this._translateThread(narrative.outputs.thread, targetLang, brand);
        }

        if (narrative.outputs.podcast) {
          translated.podcast = await this._translatePodcast(narrative.outputs.podcast, targetLang, brand);
        }

        translations[targetLang] = translated;

        // Cache translation
        if (this.db) {
          await this._cacheTranslation(narrative, targetLang, translated);
        }

        console.log(`[VoiceTranslationPipeline] Translated to ${targetLang} successfully`);
        this.emit('translation:complete', { targetLang, formats: Object.keys(translated) });

      } catch (error) {
        console.error(`[VoiceTranslationPipeline] Error translating to ${targetLang}:`, error.message);
        this.emit('translation:error', { targetLang, error: error.message });
        translations[targetLang] = { error: error.message };
      }
    }

    return {
      sourceLanguage,
      targetLanguages,
      translations,
      totalReach: this._calculateReach(targetLanguages)
    };
  }

  /**
   * Translate story format
   */
  async _translateStory(story, targetLang, brand) {
    const langConfig = this.languages[targetLang];

    const prompt = `Translate this story to ${langConfig.native} (${langConfig.name}).

IMPORTANT: This is for ${brand} brand. Preserve the brand voice and tone.

Original story:
Title: ${story.title}
Subtitle: ${story.subtitle}
Narrative: ${story.narrative}
Takeaway: ${story.takeaway}

Cultural notes for ${langConfig.name}:
${langConfig.culturalNotes}

Requirements:
1. Translate naturally (not word-for-word)
2. Preserve meaning and emotion
3. Adapt idioms and cultural references for ${langConfig.markets.join(', ')} audience
4. Maintain the brand voice (${brand})
5. Use appropriate formality level
6. Keep technical terms in English where standard (e.g., "API", "database")

Respond in JSON:
{
  "title": "translated title",
  "subtitle": "translated subtitle",
  "narrative": "translated full narrative",
  "takeaway": "translated key takeaway"
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 2000,
      temperature: 0.6,
      responseFormat: { type: 'json_object' }
    });

    return JSON.parse(response.text);
  }

  /**
   * Translate blog format
   */
  async _translateBlog(blog, targetLang, brand) {
    const langConfig = this.languages[targetLang];

    const prompt = `Translate this blog post to ${langConfig.native} (${langConfig.name}).

Original blog:
Title: ${blog.title}
Subtitle: ${blog.subtitle}
Content (markdown): ${blog.content}
Excerpt: ${blog.excerpt}

Cultural notes: ${langConfig.culturalNotes}

Requirements:
1. Preserve markdown formatting
2. Translate headings naturally
3. Adapt examples for ${langConfig.markets.join(', ')} audience
4. Keep code snippets in original language
5. Maintain SEO-friendly structure

Respond in JSON:
{
  "title": "translated title",
  "subtitle": "translated subtitle",
  "content": "translated markdown content",
  "excerpt": "translated 2-sentence summary",
  "tags": ["translated", "tags"]
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 2500,
      temperature: 0.6,
      responseFormat: { type: 'json_object' }
    });

    const translated = JSON.parse(response.text);

    // Preserve reading time (approximately)
    translated.readingTime = blog.readingTime;

    return translated;
  }

  /**
   * Translate Twitter thread
   */
  async _translateThread(thread, targetLang, brand) {
    const langConfig = this.languages[targetLang];

    const tweetsText = thread.tweets.map((t, i) => `${i + 1}. ${t.text}`).join('\n');

    const prompt = `Translate this Twitter/X thread to ${langConfig.native}.

Original thread:
${tweetsText}

Cultural notes: ${langConfig.culturalNotes}

Requirements:
1. Each tweet must be under 280 characters (including spaces)
2. Preserve thread structure and flow
3. Adapt hashtags for ${targetLang} audience
4. Keep emojis or replace with culturally appropriate ones
5. Make it engaging for ${langConfig.markets.join('/')} users

Respond in JSON:
{
  "tweets": [
    {"number": 1, "text": "tweet 1 (max 280 chars)"},
    {"number": 2, "text": "tweet 2 (max 280 chars)"}
  ],
  "threadSummary": "one-line summary in ${targetLang}"
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 1500,
      temperature: 0.7,
      responseFormat: { type: 'json_object' }
    });

    return JSON.parse(response.text);
  }

  /**
   * Translate podcast script
   */
  async _translatePodcast(podcast, targetLang, brand) {
    const langConfig = this.languages[targetLang];

    const prompt = `Translate this podcast episode script to ${langConfig.native}.

Original:
Episode title: ${podcast.episodeTitle}
Description: ${podcast.description}
Script: ${podcast.script}

Cultural notes: ${langConfig.culturalNotes}

Requirements:
1. Conversational, natural spoken ${langConfig.name}
2. Adapt cultural references and examples
3. Keep technical terms in English where standard
4. Preserve conversational flow and energy
5. Translate chapter titles

Respond in JSON:
{
  "episodeTitle": "translated title",
  "description": "translated description",
  "script": "translated script with timestamps",
  "chapters": [
    {"time": "00:00", "title": "translated chapter"}
  ]
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 2500,
      temperature: 0.7,
      responseFormat: { type: 'json_object' }
    });

    const translated = JSON.parse(response.text);
    translated.duration = podcast.duration; // Preserve duration estimate

    return translated;
  }

  /**
   * Get cached translation
   */
  async _getCachedTranslation(narrative, targetLang) {
    if (!this.db) return null;

    const sessionId = narrative.metadata?.sessionId;
    if (!sessionId) return null;

    try {
      const result = await this.db.query(`
        SELECT translated_content
        FROM voice_journal_translations
        WHERE session_id = $1 AND target_language = $2
      `, [sessionId, targetLang]);

      if (result.rows.length > 0) {
        return JSON.parse(result.rows[0].translated_content);
      }
    } catch (error) {
      console.error('[VoiceTranslationPipeline] Cache lookup error:', error.message);
    }

    return null;
  }

  /**
   * Cache translation
   */
  async _cacheTranslation(narrative, targetLang, translated) {
    if (!this.db) return;

    const sessionId = narrative.metadata?.sessionId;
    if (!sessionId) return;

    try {
      await this.db.query(`
        INSERT INTO voice_journal_translations (
          session_id,
          target_language,
          translated_content,
          created_at
        ) VALUES ($1, $2, $3, NOW())
        ON CONFLICT (session_id, target_language) DO UPDATE SET
          translated_content = $3,
          updated_at = NOW()
      `, [sessionId, targetLang, JSON.stringify(translated)]);
    } catch (error) {
      console.error('[VoiceTranslationPipeline] Cache save error:', error.message);
    }
  }

  /**
   * Calculate potential reach
   */
  _calculateReach(languages) {
    let totalSpeakers = 0;

    for (const lang of languages) {
      const config = this.languages[lang];
      if (config) {
        totalSpeakers += config.speakers;
      }
    }

    return {
      totalSpeakers,
      languages: languages.length,
      multiplier: totalSpeakers / this.languages.en.speakers
    };
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return Object.entries(this.languages).map(([code, config]) => ({
      code,
      name: config.name,
      native: config.native,
      speakers: config.speakers,
      markets: config.markets
    }));
  }

  /**
   * Get optimal languages for brand
   */
  getOptimalLanguages(brand) {
    // Brand-specific language prioritization
    const brandPriorities = {
      soulfra: ['en', 'de', 'fr', 'es'], // Privacy-conscious markets
      deathtodata: ['en', 'es', 'pt', 'fr'], // Anti-surveillance markets
      calriven: ['en', 'ja', 'zh', 'de'], // Tech/AI markets
      calos: ['en', 'es', 'zh', 'hi'], // General tech markets
      roughsparks: ['en', 'ja', 'fr', 'de'], // Design markets
      drseuss: ['en', 'es', 'pt'], // Business markets
      publishing: ['en', 'es', 'fr', 'de'] // Publishing markets
    };

    return brandPriorities[brand] || this.defaultTargets;
  }

  /**
   * Batch translate multiple narratives
   */
  async batchTranslate(narratives, targetLanguages) {
    const results = [];

    for (const narrative of narratives) {
      try {
        const translated = await this.translateNarrative({
          narrative,
          targetLanguages
        });
        results.push({
          narrativeId: narrative.metadata?.sessionId,
          success: true,
          translations: translated
        });
      } catch (error) {
        results.push({
          narrativeId: narrative.metadata?.sessionId,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get translation statistics
   */
  async getStats(sessionId = null) {
    if (!this.db) {
      throw new Error('Database required for stats');
    }

    const query = sessionId
      ? `SELECT target_language, COUNT(*) as count
         FROM voice_journal_translations
         WHERE session_id = $1
         GROUP BY target_language`
      : `SELECT target_language, COUNT(*) as count
         FROM voice_journal_translations
         GROUP BY target_language`;

    const params = sessionId ? [sessionId] : [];
    const result = await this.db.query(query, params);

    const stats = {
      totalTranslations: 0,
      byLanguage: {}
    };

    for (const row of result.rows) {
      stats.byLanguage[row.target_language] = parseInt(row.count);
      stats.totalTranslations += parseInt(row.count);
    }

    return stats;
  }
}

module.exports = VoiceTranslationPipeline;
