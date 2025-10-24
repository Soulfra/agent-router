/**
 * Brand Voice Content Router
 *
 * Routes voice journal content to the right brand domain based on topic.
 *
 * Brands:
 * - soulfra.com - Identity, privacy, self-sovereignty, zero-knowledge proofs
 * - deathtodata.com - Data brokers, privacy destruction, anti-surveillance
 * - calriven.com - AI, publishing, federation, technical deep-dives
 * - calos.ai - General tech, systems, architecture
 * - roughsparks.com - Design, UI/UX, creative coding
 * - drseuss.consulting - Business, whimsical insights
 * - publishing.bot - Content automation, publishing tools
 *
 * Usage:
 *   const router = new BrandVoiceContentRouter({ llmRouter });
 *   const routing = await router.route({
 *     narrative,
 *     themes: narrative.analysis.themes
 *   });
 */

class BrandVoiceContentRouter {
  constructor(options = {}) {
    this.llmRouter = options.llmRouter;

    if (!this.llmRouter) {
      throw new Error('[BrandVoiceContentRouter] LLM router required');
    }

    // Brand configurations
    this.brands = {
      soulfra: {
        domain: 'soulfra.com',
        focus: 'Identity, privacy, self-sovereignty, cryptographic proof, zero-knowledge',
        keywords: [
          'identity', 'privacy', 'self-sovereign', 'zero-knowledge', 'proof',
          'authentication', 'verification', 'reputation', 'trust', 'crypto'
        ],
        tone: 'Technical but accessible, privacy-first',
        audience: 'Privacy-conscious developers, identity enthusiasts'
      },
      deathtodata: {
        domain: 'deathtodata.com',
        focus: 'Data broker disruption, privacy destruction, anti-surveillance',
        keywords: [
          'data broker', 'surveillance', 'tracking', 'privacy violation',
          'data deletion', 'opt-out', 'personal data', 'scraping', 'profiling'
        ],
        tone: 'Aggressive, activist, no-bullshit',
        audience: 'Privacy activists, anti-tracking advocates'
      },
      calriven: {
        domain: 'calriven.com',
        focus: 'AI publishing, federation, ActivityPub, technical architecture',
        keywords: [
          'ai', 'publishing', 'federation', 'activitypub', 'mastodon',
          'distributed', 'decentralized', 'llm', 'machine learning', 'architecture'
        ],
        tone: 'Deep technical, architectural thinking',
        audience: 'AI engineers, platform builders, federation enthusiasts'
      },
      calos: {
        domain: 'calos.ai',
        focus: 'General tech, systems thinking, software architecture',
        keywords: [
          'system', 'architecture', 'design', 'engineering', 'platform',
          'integration', 'api', 'database', 'performance', 'scalability'
        ],
        tone: 'Professional, systems-oriented',
        audience: 'Software engineers, system designers'
      },
      roughsparks: {
        domain: 'roughsparks.com',
        focus: 'UI/UX, design systems, creative coding, visual design',
        keywords: [
          'design', 'ui', 'ux', 'interface', 'visual', 'creative', 'animation',
          'interaction', 'user experience', 'aesthetics', 'typography'
        ],
        tone: 'Creative, experimental, visual',
        audience: 'Designers, creative technologists'
      },
      drseuss: {
        domain: 'drseuss.consulting',
        focus: 'Business insights, whimsical consulting, entrepreneurship',
        keywords: [
          'business', 'consulting', 'entrepreneurship', 'startup', 'strategy',
          'growth', 'monetization', 'market', 'customer', 'product-market fit'
        ],
        tone: 'Whimsical but wise, approachable',
        audience: 'Entrepreneurs, business owners'
      },
      publishing: {
        domain: 'publishing.bot',
        focus: 'Content automation, publishing workflows, multi-platform',
        keywords: [
          'publishing', 'content', 'automation', 'workflow', 'distribution',
          'multi-platform', 'scheduling', 'newsletter', 'blog', 'podcast'
        ],
        tone: 'Practical, workflow-focused',
        audience: 'Content creators, publishers'
      }
    };

    console.log('[BrandVoiceContentRouter] Initialized with 7 brands');
  }

  /**
   * Route content to appropriate brand(s)
   */
  async route(input) {
    const { narrative, themes = [], metadata = {} } = input;

    console.log(`[BrandVoiceContentRouter] Routing content with ${themes.length} themes`);

    // Step 1: Keyword-based scoring
    const keywordScores = this._scoreByKeywords(narrative, themes);

    // Step 2: LLM-based classification
    const llmScores = await this._scoreByLLM(narrative, themes);

    // Step 3: Combine scores
    const combinedScores = this._combineScores(keywordScores, llmScores);

    // Step 4: Determine primary and secondary brands
    const routing = this._determineRouting(combinedScores);

    console.log(`[BrandVoiceContentRouter] Routed to ${routing.primary.brand} (${routing.primary.confidence}% confidence)`);

    return {
      routing,
      scores: combinedScores,
      metadata
    };
  }

  /**
   * Score brands based on keyword matching
   */
  _scoreByKeywords(narrative, themes) {
    const scores = {};

    // Get all text to analyze
    const text = this._extractText(narrative, themes);
    const lowerText = text.toLowerCase();

    // Score each brand
    for (const [brandKey, brand] of Object.entries(this.brands)) {
      let score = 0;

      for (const keyword of brand.keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = lowerText.match(regex);
        if (matches) {
          score += matches.length;
        }
      }

      scores[brandKey] = {
        brand: brandKey,
        domain: brand.domain,
        score,
        method: 'keywords'
      };
    }

    return scores;
  }

  /**
   * Score brands using LLM classification
   */
  async _scoreByLLM(narrative, themes) {
    const themesText = themes.map(t => `- ${t.name}: ${t.description}`).join('\n');
    const storyTitle = narrative.outputs?.story?.title || 'Untitled';
    const storyText = narrative.outputs?.story?.narrative?.substring(0, 1000) || '';

    const prompt = `Classify this content into brand categories.

Story title: ${storyTitle}

Themes:
${themesText}

Story excerpt:
${storyText}

Brands:
${Object.entries(this.brands).map(([key, brand]) =>
  `- ${key} (${brand.domain}): ${brand.focus}`
).join('\n')}

Rate how well this content fits each brand (0-100):
- 90-100: Perfect fit
- 70-89: Good fit
- 50-69: Moderate fit
- 30-49: Weak fit
- 0-29: Poor fit

Respond in JSON:
{
  "ratings": {
    "soulfra": 0-100,
    "deathtodata": 0-100,
    "calriven": 0-100,
    "calos": 0-100,
    "roughsparks": 0-100,
    "drseuss": 0-100,
    "publishing": 0-100
  },
  "reasoning": "brief explanation of top 2-3 brand choices"
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'fact',
      maxTokens: 500,
      temperature: 0.3,
      responseFormat: { type: 'json_object' }
    });

    const data = JSON.parse(response.text);
    const scores = {};

    for (const [brandKey, rating] of Object.entries(data.ratings)) {
      scores[brandKey] = {
        brand: brandKey,
        domain: this.brands[brandKey]?.domain,
        score: rating,
        method: 'llm',
        reasoning: data.reasoning
      };
    }

    return scores;
  }

  /**
   * Combine keyword and LLM scores
   */
  _combineScores(keywordScores, llmScores) {
    const combined = {};

    for (const brandKey of Object.keys(this.brands)) {
      const keywordScore = keywordScores[brandKey]?.score || 0;
      const llmScore = llmScores[brandKey]?.score || 0;

      // Normalize keyword score (rough heuristic)
      const normalizedKeywordScore = Math.min(keywordScore * 10, 100);

      // Weighted average: LLM 70%, keywords 30%
      const finalScore = (llmScore * 0.7) + (normalizedKeywordScore * 0.3);

      combined[brandKey] = {
        brand: brandKey,
        domain: this.brands[brandKey].domain,
        finalScore: Math.round(finalScore),
        keywordScore: Math.round(normalizedKeywordScore),
        llmScore,
        reasoning: llmScores[brandKey]?.reasoning
      };
    }

    return combined;
  }

  /**
   * Determine primary and secondary brands
   */
  _determineRouting(combinedScores) {
    // Sort by final score
    const sorted = Object.values(combinedScores).sort((a, b) => b.finalScore - a.finalScore);

    // Primary brand (highest score)
    const primary = sorted[0];

    // Secondary brands (score >= 60)
    const secondary = sorted.slice(1).filter(brand => brand.finalScore >= 60);

    // Cross-post threshold
    const crossPostThreshold = 70;
    const shouldCrossPost = secondary.some(brand => brand.finalScore >= crossPostThreshold);

    return {
      primary: {
        brand: primary.brand,
        domain: primary.domain,
        confidence: primary.finalScore,
        reasoning: primary.reasoning
      },
      secondary: secondary.map(brand => ({
        brand: brand.brand,
        domain: brand.domain,
        confidence: brand.finalScore
      })),
      crossPost: shouldCrossPost,
      allScores: sorted
    };
  }

  /**
   * Extract text for analysis
   */
  _extractText(narrative, themes) {
    const parts = [];

    // Add themes
    themes.forEach(theme => {
      parts.push(theme.name);
      parts.push(theme.description);
    });

    // Add story if available
    if (narrative.outputs?.story) {
      parts.push(narrative.outputs.story.title);
      parts.push(narrative.outputs.story.narrative);
    }

    // Add insights
    if (narrative.analysis?.insights) {
      narrative.analysis.insights.forEach(insight => {
        parts.push(insight.insight);
      });
    }

    return parts.join(' ');
  }

  /**
   * Get brand configuration
   */
  getBrand(brandKey) {
    return this.brands[brandKey];
  }

  /**
   * Get all brands
   */
  getAllBrands() {
    return Object.entries(this.brands).map(([key, brand]) => ({
      key,
      ...brand
    }));
  }

  /**
   * Suggest content adaptations for each brand
   */
  async suggestAdaptations(routing, narrative) {
    const adaptations = {};

    // Primary brand (publish as-is)
    adaptations[routing.primary.brand] = {
      action: 'publish',
      adaptation: 'none',
      title: narrative.outputs?.story?.title,
      content: narrative.outputs?.story?.narrative
    };

    // Secondary brands (adapt tone/focus)
    for (const secondary of routing.secondary) {
      const brand = this.brands[secondary.brand];

      const adaptation = await this._adaptForBrand(narrative, brand);
      adaptations[secondary.brand] = {
        action: 'adapt_and_publish',
        adaptation: 'tone_and_focus',
        ...adaptation
      };
    }

    return adaptations;
  }

  /**
   * Adapt content for specific brand
   */
  async _adaptForBrand(narrative, brand) {
    const originalTitle = narrative.outputs?.story?.title || '';
    const originalContent = narrative.outputs?.story?.narrative || '';

    const prompt = `Adapt this content for ${brand.domain}.

Original title: ${originalTitle}

Original content:
${originalContent.substring(0, 1000)}

Brand focus: ${brand.focus}
Brand tone: ${brand.tone}
Brand audience: ${brand.audience}

Create:
1. New title (optimized for ${brand.domain})
2. New opening paragraph (adjust tone for this audience)
3. Key points to emphasize (what this audience cares about)

Keep the core insights but adapt the framing.

Respond in JSON:
{
  "title": "adapted title",
  "opening": "adapted opening paragraph",
  "keyPoints": ["point1", "point2", "point3"],
  "toneAdjustments": "what changed in tone"
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 600,
      temperature: 0.6,
      responseFormat: { type: 'json_object' }
    });

    return JSON.parse(response.text);
  }
}

module.exports = BrandVoiceContentRouter;
