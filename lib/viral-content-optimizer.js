/**
 * Viral Content Optimizer
 *
 * Optimizes content for maximum viral reach across languages and platforms:
 * - Cultural adaptation (idioms, examples, references)
 * - Viral hooks optimization (emotional triggers, curiosity gaps)
 * - Timing optimization (best post times per timezone/platform)
 * - Hashtag generation per language/market
 * - A/B testing framework
 * - Engagement prediction
 *
 * Usage:
 *   const optimizer = new ViralContentOptimizer({ llmRouter, db });
 *
 *   const optimized = await optimizer.optimize({
 *     content: { title, body, language },
 *     platform: 'mastodon',
 *     targetAudience: 'tech',
 *     goal: 'engagement'
 *   });
 *
 *   // optimized.hook → "You won't BELIEVE what data brokers are hiding..."
 *   // optimized.hashtags → ['#Privacy', '#ZeroKnowledge', '#DataRights']
 *   // optimized.bestTime → { hour: 9, timezone: 'America/New_York', reason: '...' }
 */

const { EventEmitter } = require('events');

class ViralContentOptimizer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.llmRouter = options.llmRouter;
    this.db = options.db;

    // Platform-specific best practices
    this.platformRules = {
      mastodon: {
        maxLength: 500,
        hashtagLimit: 5,
        optimalLength: 200-300,
        tone: 'Authentic, community-focused',
        bestTimes: [9, 12, 18, 20], // Hours in user timezone
        engagementFactors: ['Questions', 'CW for spoilers', 'Alt text', 'Boosts over likes']
      },
      twitter: {
        maxLength: 280,
        hashtagLimit: 2,
        optimalLength: 100-200,
        tone: 'Punchy, controversial, hot takes',
        bestTimes: [8, 12, 17, 19],
        engagementFactors: ['Threads', 'Polls', 'Controversy', 'Retweets']
      },
      blog: {
        maxLength: null,
        hashtagLimit: 10,
        optimalLength: 1500-2500,
        tone: 'Educational, in-depth',
        bestTimes: [6, 10, 14], // Morning coffee, mid-morning, afternoon
        engagementFactors: ['Headings', 'Images', 'Code examples', 'Takeaways']
      },
      youtube: {
        maxLength: 5000,
        hashtagLimit: 15,
        optimalLength: 200-300,
        tone: 'Engaging, conversational',
        bestTimes: [18, 19, 20, 21], // Evening viewing
        engagementFactors: ['Timestamps', 'Call to action', 'Questions', 'Thumbnails']
      },
      reddit: {
        maxLength: 40000,
        hashtagLimit: 0,
        optimalLength: 500-1000,
        tone: 'Detailed, authentic, no BS',
        bestTimes: [6, 7, 9, 12, 20],
        engagementFactors: ['TL;DR', 'Edits with updates', 'Engaging title', 'Proof/sources']
      },
      hackernews: {
        maxLength: null,
        hashtagLimit: 0,
        optimalLength: 800-1500,
        tone: 'Technical, thoughtful, humble',
        bestTimes: [9, 10, 14, 15],
        engagementFactors: ['Technical depth', 'Novel insights', 'Show > Tell', 'No hype']
      }
    };

    // Cultural adaptation patterns
    this.culturalPatterns = {
      en: {
        hooks: ['You won\'t believe', 'Here\'s why', 'The truth about', '5 ways to', 'Stop doing'],
        idioms: ['hit the nail on the head', 'piece of cake', 'break the ice'],
        examples: ['Silicon Valley', 'Netflix', 'Amazon', 'Google']
      },
      es: {
        hooks: ['No creerás', 'Aquí está por qué', 'La verdad sobre', '5 formas de', 'Deja de hacer'],
        idioms: ['dar en el clavo', 'pan comido', 'romper el hielo'],
        examples: ['Barcelona', 'Madrid', 'México DF', 'Mercado Libre']
      },
      zh: {
        hooks: ['你不会相信', '这就是为什么', '真相是', '5个方法', '不要再做'],
        idioms: ['一箭双雕', '画蛇添足', '对牛弹琴'],
        examples: ['深圳', '阿里巴巴', '腾讯', '字节跳动']
      },
      ja: {
        hooks: ['信じられない', 'その理由は', '真実は', '5つの方法', 'やめるべき'],
        idioms: ['一石二鳥', '猫に小判', '馬の耳に念仏'],
        examples: ['東京', 'ソニー', 'トヨタ', '楽天']
      },
      pt: {
        hooks: ['Você não vai acreditar', 'Aqui está o porquê', 'A verdade sobre', '5 formas de', 'Pare de fazer'],
        idioms: ['acertar na mosca', 'moleza', 'quebrar o gelo'],
        examples: ['São Paulo', 'Nubank', 'iFood', 'Mercado Livre']
      },
      fr: {
        hooks: ['Vous n\'allez pas croire', 'Voici pourquoi', 'La vérité sur', '5 façons de', 'Arrêtez de faire'],
        idioms: ['mettre le doigt dessus', 'un jeu d\'enfant', 'briser la glace'],
        examples: ['Paris', 'Orange', 'BlaBlaCar', 'Criteo']
      },
      de: {
        hooks: ['Sie werden nicht glauben', 'Deshalb', 'Die Wahrheit über', '5 Wege zu', 'Hören Sie auf'],
        idioms: ['den Nagel auf den Kopf treffen', 'ein Kinderspiel', 'das Eis brechen'],
        examples: ['Berlin', 'SAP', 'Siemens', 'Zalando']
      },
      hi: {
        hooks: ['आप विश्वास नहीं करेंगे', 'यहाँ कारण है', 'सच्चाई', '5 तरीके', 'बंद करो'],
        idioms: ['एक तीर से दो शिकार', 'मुँह में राम बगल में छुरी'],
        examples: ['बेंगलुरु', 'Flipkart', 'Paytm', 'Ola']
      },
      ar: {
        hooks: ['لن تصدق', 'هذا هو السبب', 'الحقيقة حول', '5 طرق', 'توقف عن'],
        idioms: ['ضرب عصفورين بحجر', 'قطعة من الكعك'],
        examples: ['دبي', 'كريم', 'سوق.كوم', 'طلبات']
      }
    };

    // Viral emotional triggers
    this.emotionalTriggers = {
      curiosity: ['secret', 'hidden', 'revealed', 'you don\'t know', 'truth', 'behind the scenes'],
      outrage: ['ridiculous', 'unacceptable', 'shameful', 'broken', 'disaster', 'failure'],
      hope: ['solution', 'breakthrough', 'finally', 'game-changer', 'revolution', 'future'],
      fear: ['warning', 'danger', 'threat', 'losing', 'mistake', 'risk'],
      validation: ['you\'re right', 'exactly', 'finally someone said it', 'truth bomb', 'real talk'],
      humor: ['absurd', 'ironic', 'classic', 'peak', 'wild', 'no way']
    };

    // Audience-specific optimization
    this.audienceProfiles = {
      tech: {
        interests: ['AI', 'dev tools', 'open source', 'startups', 'privacy'],
        painPoints: ['technical debt', 'legacy code', 'meetings', 'dependencies', 'bugs'],
        triggers: ['curiosity', 'validation', 'outrage'],
        platforms: ['hackernews', 'reddit', 'twitter', 'mastodon']
      },
      privacy: {
        interests: ['zero-knowledge', 'encryption', 'data rights', 'surveillance'],
        painPoints: ['data brokers', 'tracking', 'ads', 'breaches', 'govt surveillance'],
        triggers: ['outrage', 'fear', 'hope'],
        platforms: ['mastodon', 'reddit', 'blog']
      },
      business: {
        interests: ['growth', 'revenue', 'metrics', 'automation', 'ROI'],
        painPoints: ['inefficiency', 'competition', 'churn', 'costs', 'scaling'],
        triggers: ['hope', 'validation', 'curiosity'],
        platforms: ['twitter', 'blog', 'youtube']
      },
      creative: {
        interests: ['design', 'UX', 'branding', 'storytelling', 'aesthetics'],
        painPoints: ['trends', 'clients', 'tools', 'inspiration', 'portfolio'],
        triggers: ['validation', 'curiosity', 'humor'],
        platforms: ['twitter', 'mastodon', 'youtube']
      }
    };

    console.log('[ViralContentOptimizer] Initialized with', Object.keys(this.platformRules).length, 'platforms');
  }

  /**
   * Optimize content for virality
   */
  async optimize(input) {
    const {
      content, // { title, body, language }
      platform = 'mastodon',
      targetAudience = 'tech',
      goal = 'engagement', // engagement | shares | clicks | conversions
      culturalContext = null
    } = input;

    console.log(`[ViralContentOptimizer] Optimizing for ${platform}, ${targetAudience} audience, goal: ${goal}`);

    const platformRules = this.platformRules[platform];
    const audienceProfile = this.audienceProfiles[targetAudience];
    const culturalPattern = this.culturalPatterns[content.language || 'en'];

    // Generate viral hook
    const hook = await this._generateViralHook({
      title: content.title,
      body: content.body,
      language: content.language,
      platform,
      audienceProfile,
      culturalPattern
    });

    // Optimize body for platform
    const optimizedBody = await this._optimizeBody({
      body: content.body,
      language: content.language,
      platform,
      platformRules,
      audienceProfile
    });

    // Generate hashtags
    const hashtags = await this._generateHashtags({
      title: content.title,
      body: content.body,
      language: content.language,
      platform,
      platformRules,
      targetAudience
    });

    // Calculate best posting time
    const bestTime = this._calculateBestTime({
      platform,
      platformRules,
      timezone: culturalContext?.timezone || 'America/New_York'
    });

    // Predict engagement score
    const predictedEngagement = await this._predictEngagement({
      hook,
      body: optimizedBody,
      hashtags,
      platform,
      targetAudience
    });

    this.emit('optimization:complete', {
      platform,
      targetAudience,
      predictedEngagement
    });

    return {
      hook,
      body: optimizedBody,
      hashtags,
      bestTime,
      predictedEngagement,
      optimizationNotes: this._generateNotes({
        platform,
        targetAudience,
        goal,
        platformRules,
        audienceProfile
      })
    };
  }

  /**
   * Generate viral hook
   */
  async _generateViralHook(options) {
    const { title, body, language, platform, audienceProfile, culturalPattern } = options;

    // Choose emotional trigger based on audience
    const triggers = audienceProfile.triggers;
    const triggerWords = triggers.flatMap(t => this.emotionalTriggers[t]);

    const prompt = `Generate a viral hook for this content.

Platform: ${platform}
Language: ${language}
Original title: ${title}
Content preview: ${body.substring(0, 500)}

Cultural patterns for ${language}:
- Viral hooks: ${culturalPattern.hooks.join(', ')}
- Local examples: ${culturalPattern.examples.join(', ')}

Emotional triggers to use: ${triggers.join(', ')}
Trigger words: ${triggerWords.join(', ')}

Requirements:
1. ${platform === 'twitter' ? 'Under 100 characters' : platform === 'mastodon' ? 'Under 150 characters' : 'Under 200 characters'}
2. Use emotional trigger from: ${triggers.join(', ')}
3. Culturally appropriate for ${language} audience
4. Create curiosity gap or strong reaction
5. Natural, not clickbait-y

Respond with JSON:
{
  "hook": "your viral hook here",
  "trigger": "which emotional trigger used",
  "reasoning": "why this will work"
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 300,
      temperature: 0.8,
      responseFormat: { type: 'json_object' }
    });

    const result = JSON.parse(response.text);
    return result.hook;
  }

  /**
   * Optimize body for platform
   */
  async _optimizeBody(options) {
    const { body, language, platform, platformRules, audienceProfile } = options;

    const prompt = `Optimize this content for ${platform}.

Original content:
${body}

Platform rules:
- Optimal length: ${platformRules.optimalLength} characters
- Tone: ${platformRules.tone}
- Engagement factors: ${platformRules.engagementFactors.join(', ')}

Audience:
- Interests: ${audienceProfile.interests.join(', ')}
- Pain points: ${audienceProfile.painPoints.join(', ')}

Requirements:
1. ${platformRules.maxLength ? `Keep under ${platformRules.maxLength} characters` : 'No length limit'}
2. Match platform tone: ${platformRules.tone}
3. Incorporate engagement factors: ${platformRules.engagementFactors.join(', ')}
4. Address audience pain points
5. Keep in ${language}

Respond with optimized content only (no JSON, just the text).`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 1000,
      temperature: 0.7
    });

    return response.text.trim();
  }

  /**
   * Generate hashtags
   */
  async _generateHashtags(options) {
    const { title, body, language, platform, platformRules, targetAudience } = options;

    const limit = platformRules.hashtagLimit;

    if (limit === 0) {
      return []; // No hashtags for HackerNews
    }

    const prompt = `Generate ${limit} viral hashtags for this content.

Title: ${title}
Content: ${body.substring(0, 500)}

Platform: ${platform} (max ${limit} hashtags)
Language: ${language}
Audience: ${targetAudience}

Requirements:
1. Exactly ${limit} hashtags
2. Mix of trending and niche tags
3. Appropriate for ${language} audience
4. Include ${targetAudience}-specific tags
5. No spaces in hashtags

Respond in JSON:
{
  "hashtags": ["#Tag1", "#Tag2", ...]
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 200,
      temperature: 0.7,
      responseFormat: { type: 'json_object' }
    });

    const result = JSON.parse(response.text);
    return result.hashtags || [];
  }

  /**
   * Calculate best posting time
   */
  _calculateBestTime(options) {
    const { platform, platformRules, timezone } = options;

    const bestHours = platformRules.bestTimes;
    const now = new Date();
    const currentHour = now.getHours();

    // Find next best hour
    let nextBestHour = bestHours.find(h => h > currentHour);
    if (!nextBestHour) {
      nextBestHour = bestHours[0]; // Next day
    }

    return {
      hour: nextBestHour,
      timezone,
      reason: `Peak ${platform} engagement time`,
      estimatedReach: this._estimateReach(platform, nextBestHour)
    };
  }

  /**
   * Estimate reach at given time
   */
  _estimateReach(platform, hour) {
    // Simplified reach estimation
    const baseReach = {
      mastodon: 500,
      twitter: 2000,
      blog: 1000,
      youtube: 5000,
      reddit: 10000,
      hackernews: 15000
    };

    // Peak hours get 3x multiplier
    const peakHours = this.platformRules[platform].bestTimes;
    const multiplier = peakHours.includes(hour) ? 3 : 1;

    return baseReach[platform] * multiplier;
  }

  /**
   * Predict engagement score (0-100)
   */
  async _predictEngagement(options) {
    const { hook, body, hashtags, platform, targetAudience } = options;

    let score = 50; // Base score

    // Hook quality
    const hookTriggers = Object.values(this.emotionalTriggers).flat();
    const hookWords = hook.toLowerCase().split(' ');
    const triggerCount = hookWords.filter(w => hookTriggers.includes(w)).length;
    score += Math.min(triggerCount * 5, 20); // Up to +20 for triggers

    // Length optimization
    const platformRules = this.platformRules[platform];
    const bodyLength = body.length;
    const optimalRange = platformRules.optimalLength;

    if (typeof optimalRange === 'string') {
      const [min, max] = optimalRange.split('-').map(Number);
      if (bodyLength >= min && bodyLength <= max) {
        score += 10; // +10 for optimal length
      }
    }

    // Hashtag quality
    if (hashtags.length > 0 && hashtags.length <= platformRules.hashtagLimit) {
      score += 5; // +5 for appropriate hashtags
    }

    // Engagement factors
    const engagementFactors = platformRules.engagementFactors;
    const bodyLower = body.toLowerCase();
    const factorMatches = engagementFactors.filter(factor => {
      return bodyLower.includes(factor.toLowerCase());
    }).length;
    score += factorMatches * 3; // +3 per engagement factor

    // Audience alignment
    const audienceProfile = this.audienceProfiles[targetAudience];
    const interests = audienceProfile.interests;
    const interestMatches = interests.filter(interest => {
      return bodyLower.includes(interest.toLowerCase());
    }).length;
    score += interestMatches * 5; // +5 per interest match

    return Math.min(Math.round(score), 100);
  }

  /**
   * Generate optimization notes
   */
  _generateNotes(options) {
    const { platform, targetAudience, goal, platformRules, audienceProfile } = options;

    return {
      platform: `Optimized for ${platform} (max ${platformRules.maxLength || 'unlimited'} chars)`,
      tone: `Using ${platformRules.tone} tone`,
      audience: `Targeting ${targetAudience} (interests: ${audienceProfile.interests.join(', ')})`,
      goal: `Optimizing for ${goal}`,
      engagementFactors: `Include: ${platformRules.engagementFactors.join(', ')}`
    };
  }

  /**
   * Batch optimize content for multiple platforms
   */
  async batchOptimize(content, platforms, targetAudience) {
    const results = {};

    for (const platform of platforms) {
      try {
        const optimized = await this.optimize({
          content,
          platform,
          targetAudience
        });

        results[platform] = optimized;
      } catch (error) {
        console.error(`[ViralContentOptimizer] Error optimizing for ${platform}:`, error.message);
        results[platform] = { error: error.message };
      }
    }

    return results;
  }

  /**
   * A/B test two versions
   */
  async createABTest(contentA, contentB, platform, targetAudience) {
    const [optimizedA, optimizedB] = await Promise.all([
      this.optimize({ content: contentA, platform, targetAudience }),
      this.optimize({ content: contentB, platform, targetAudience })
    ]);

    return {
      versionA: optimizedA,
      versionB: optimizedB,
      recommendation: optimizedA.predictedEngagement > optimizedB.predictedEngagement ? 'A' : 'B',
      difference: Math.abs(optimizedA.predictedEngagement - optimizedB.predictedEngagement)
    };
  }

  /**
   * Get viral content tips for language
   */
  getViralTips(language, platform) {
    const cultural = this.culturalPatterns[language] || this.culturalPatterns.en;
    const platformRules = this.platformRules[platform];

    return {
      hooks: cultural.hooks,
      idioms: cultural.idioms,
      localExamples: cultural.examples,
      platformBestPractices: platformRules.engagementFactors,
      bestTimes: platformRules.bestTimes
    };
  }
}

module.exports = ViralContentOptimizer;
