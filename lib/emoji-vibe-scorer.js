/**
 * Emoji Vibe Scorer
 *
 * Connects emoji metadata parser → cringeproof.com vibe checking → clarity engine
 * Analyzes emoji usage for cringe detection, based/cringe scoring, vibe analysis.
 *
 * Philosophy:
 * Emojis reveal intent. Vibe reveals truth. Clarity reveals meaning.
 * We score emojis not just on sentiment, but on CULTURAL CONTEXT.
 *
 * Integration Points:
 * - EmojiMetadataParser (emoji data)
 * - CringeProof domain (social awareness)
 * - Clarity Engine (intelligence scoring)
 * - CAL Learning Loop (learns from usage patterns)
 */

const EmojiMetadataParser = require('./emoji-metadata-parser');

class EmojiVibeScorer {
  constructor(options = {}) {
    this.emojiParser = new EmojiMetadataParser();
    this.clarityEngine = options.clarityEngine;
    this.ollamaClient = options.ollamaClient;
    this.ollamaModel = options.ollamaModel || 'cringeproof:latest';

    // Vibe scoring config
    this.config = {
      // Cringe thresholds
      cringeThresholds: {
        based: 0-30,      // 0-30 = based
        neutral: 30-70,   // 30-70 = neutral
        cringe: 70-100    // 70-100 = cringe
      },

      // Context modifiers (how emoji meaning changes by context)
      contextModifiers: {
        professional: {
          // In professional context, some emojis become more cringe
          '💀': +30, // Skull becomes cringe in work context
          '🤡': +40, // Clown is VERY cringe in work
          '💩': +50, // Poop is max cringe
          '😂': +10, // Tears of joy slightly cringe
          '👍': -10  // Thumbs up less cringe (acceptable)
        },
        casual: {
          // In casual context, most emojis are fine
          '💀': -10, // Skull is based in memes
          '🔥': -15, // Fire is based
          '😭': -5   // Crying is acceptable
        },
        gen_z: {
          // Gen Z context (based = good)
          '💀': -20, // Skull is based
          '😭': -15, // Crying is funny
          '🤡': -5,  // Even clown can be ironic
          '🦄': +15, // Unicorn becoming cringe
          '🌈': +10  // Rainbow losing based status
        },
        millennial: {
          // Millennial context
          '😂': -10, // Tears of joy still ok
          '👍': -5,  // Thumbs up acceptable
          '🙌': -5,  // Praise hands ok
          '💀': +15, // Skull slightly cringe
          '💅': +20  // Nail polish cringe for millennials
        }
      },

      // Usage pattern scoring
      // (e.g., using 💀💀💀 multiple times = more cringe)
      repetitionPenalty: 10, // +10 cringe per repeat
      maxRepetitionPenalty: 40 // Cap at +40
    };

    console.log('[EmojiVibeScorer] Initialized with cringeproof model');
  }

  /**
   * Score emoji vibe in context
   *
   * @param {string} emoji - Emoji to score
   * @param {object} context - Context { type: 'professional'|'casual'|'gen_z', message: 'full message', ageGroup: 'teen'|'adult' }
   * @returns {object} - { vibeScore, cringeScore, verdict: 'based'|'neutral'|'cringe', reasoning }
   */
  async score(emoji, context = {}) {
    try {
      // Get base metadata
      const metadata = this.emojiParser.parse(emoji);

      // Base cringe score
      let cringeScore = metadata.cringeScore || 50;

      // Apply context modifiers
      if (context.type && this.config.contextModifiers[context.type]) {
        const modifier = this.config.contextModifiers[context.type][emoji] || 0;
        cringeScore += modifier;
      }

      // Check for repetition in message
      if (context.message) {
        const repetitionCount = (context.message.match(new RegExp(emoji, 'g')) || []).length;
        if (repetitionCount > 1) {
          const penalty = Math.min(
            (repetitionCount - 1) * this.config.repetitionPenalty,
            this.config.maxRepetitionPenalty
          );
          cringeScore += penalty;
        }
      }

      // Clamp to 0-100
      cringeScore = Math.max(0, Math.min(100, cringeScore));

      // Determine verdict
      let verdict = 'neutral';
      if (cringeScore < 30) verdict = 'based';
      else if (cringeScore > 70) verdict = 'cringe';

      // Get AI reasoning (if Ollama available)
      let reasoning = this._generateFallbackReasoning(emoji, cringeScore, verdict);

      if (this.ollamaClient) {
        try {
          const aiReasoning = await this._getOllamaReasoning(emoji, metadata, context, cringeScore);
          if (aiReasoning) reasoning = aiReasoning;
        } catch (error) {
          console.warn('[EmojiVibeScorer] Ollama error, using fallback reasoning:', error.message);
        }
      }

      return {
        emoji,
        vibeScore: metadata.vibeScore,
        cringeScore,
        verdict,
        reasoning,
        metadata: {
          name: metadata.name,
          category: metadata.category,
          sentiment: metadata.sentiment,
          keywords: metadata.keywords
        }
      };

    } catch (error) {
      console.error('[EmojiVibeScorer] Error scoring emoji:', error);
      return {
        emoji,
        vibeScore: 50,
        cringeScore: 50,
        verdict: 'neutral',
        reasoning: 'Error analyzing emoji',
        error: error.message
      };
    }
  }

  /**
   * Score entire message
   *
   * @param {string} message - Full message with emojis
   * @param {object} context - Context
   * @returns {object} - { overallVibeScore, overallCringeScore, verdict, emojis: [...], reasoning }
   */
  async scoreMessage(message, context = {}) {
    // Extract all emojis from message
    const emojis = this._extractEmojis(message);

    if (emojis.length === 0) {
      return {
        overallVibeScore: 50,
        overallCringeScore: 50,
        verdict: 'neutral',
        emojis: [],
        reasoning: 'No emojis found in message'
      };
    }

    // Score each emoji
    const scores = await Promise.all(
      emojis.map(emoji => this.score(emoji, { ...context, message }))
    );

    // Calculate averages
    const avgVibe = scores.reduce((sum, s) => sum + s.vibeScore, 0) / scores.length;
    const avgCringe = scores.reduce((sum, s) => sum + s.cringeScore, 0) / scores.length;

    // Determine overall verdict
    let verdict = 'neutral';
    if (avgCringe < 30) verdict = 'based';
    else if (avgCringe > 70) verdict = 'cringe';

    // Generate overall reasoning
    const worstEmoji = scores.reduce((worst, s) =>
      s.cringeScore > worst.cringeScore ? s : worst
    );

    const bestEmoji = scores.reduce((best, s) =>
      s.cringeScore < best.cringeScore ? s : best
    );

    const reasoning = `Message contains ${emojis.length} emoji(s). ` +
      `Most cringe: ${worstEmoji.emoji} (${worstEmoji.cringeScore}/100). ` +
      `Most based: ${bestEmoji.emoji} (${bestEmoji.cringeScore}/100). ` +
      `Overall verdict: ${verdict}.`;

    return {
      overallVibeScore: avgVibe,
      overallCringeScore: avgCringe,
      verdict,
      emojis: scores,
      reasoning
    };
  }

  /**
   * Get vibe check (cringeproof.com style)
   *
   * @param {string} message - Message to check
   * @param {object} context - Context
   * @returns {object} - { safe: boolean, warnings: [], suggestions: [] }
   */
  async vibeCheck(message, context = {}) {
    const score = await this.scoreMessage(message, context);

    const warnings = [];
    const suggestions = [];

    // Cringe warnings
    if (score.verdict === 'cringe') {
      warnings.push(`⚠️ Cringe alert! Overall cringe score: ${score.overallCringeScore.toFixed(0)}/100`);

      // Specific emoji warnings
      score.emojis
        .filter(e => e.cringeScore > 70)
        .forEach(e => {
          warnings.push(`🚨 ${e.emoji} ${e.metadata.name}: ${e.reasoning}`);
        });

      // Suggestions
      const basedEmojis = this.emojiParser.getByVibeScore(80, 100);
      if (basedEmojis.length > 0) {
        const suggestion = basedEmojis[Math.floor(Math.random() * basedEmojis.length)];
        suggestions.push(`✨ Try using ${suggestion.emoji} ${suggestion.name} instead (vibe: ${suggestion.vibeScore}/100)`);
      }
    }

    return {
      safe: score.verdict !== 'cringe',
      warnings,
      suggestions,
      score
    };
  }

  /**
   * Extract emojis from message
   * @private
   */
  _extractEmojis(message) {
    // Unicode emoji regex
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    return message.match(emojiRegex) || [];
  }

  /**
   * Get Ollama reasoning
   * @private
   */
  async _getOllamaReasoning(emoji, metadata, context, cringeScore) {
    if (!this.ollamaClient) {
      return null;
    }

    const prompt = `
Analyze this emoji in context:

Emoji: ${emoji} (${metadata.name})
Category: ${metadata.category}
Sentiment: ${metadata.sentiment}
Cringe Score: ${cringeScore}/100
Context: ${context.type || 'casual'}
${context.message ? `Message: "${context.message}"` : ''}

Is this emoji based or cringe? Why?

Respond in 1-2 sentences, be direct and honest.
`.trim();

    try {
      const axios = require('axios');
      const ollamaUrl = process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434';

      const response = await axios.post(`${ollamaUrl}/api/chat`, {
        model: this.ollamaModel,
        messages: [
          { role: 'user', content: prompt }
        ],
        stream: false,
        options: {
          temperature: 0.7
        }
      }, { timeout: 10000 });

      return response.data.message.content.trim();
    } catch (error) {
      console.warn('[EmojiVibeScorer] Ollama request failed:', error.message);
      return null;
    }
  }

  /**
   * Generate fallback reasoning
   * @private
   */
  _generateFallbackReasoning(emoji, cringeScore, verdict) {
    const verdictExplanations = {
      based: 'This emoji is culturally based and socially acceptable.',
      neutral: 'This emoji is neutral - not particularly based or cringe.',
      cringe: 'This emoji may be perceived as cringe in this context.'
    };

    return `${emoji} scored ${cringeScore}/100 cringe. ${verdictExplanations[verdict]}`;
  }

  /**
   * Get themed deck (for card games)
   */
  getThemedDeck(theme, ageGroup = 'teen', count = 40) {
    return this.emojiParser.getThemedDeck(theme, ageGroup, count);
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.emojiParser.getStats(),
      cringeThresholds: this.config.cringeThresholds,
      contexts: Object.keys(this.config.contextModifiers)
    };
  }
}

module.exports = EmojiVibeScorer;
