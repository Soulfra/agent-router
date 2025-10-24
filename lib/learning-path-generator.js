/**
 * Learning Path Generator
 *
 * Auto-generates Google Skills-style learning paths from voice journals:
 * - Multi-step educational sequences
 * - UTM tracking at each step
 * - A/B testing different path orders
 * - Analytics showing which paths convert best
 *
 * Example Learning Path:
 * 1. Intro article (blog) → 2. Deep dive video (YouTube) → 3. GitHub repo → 4. Course → 5. Book
 *
 * Inspired by: https://www.skills.google/paths?utm_source=cgc&utm_medium=website&utm_campaign=evergreen
 *
 * Integrates with:
 * - UTM Campaign Generator (lib/utm-campaign-generator.js)
 * - Content Link Enricher (lib/content-link-enricher.js)
 * - Revenue Tracker (lib/viral-revenue-tracker.js)
 *
 * Usage:
 *   const generator = new LearningPathGenerator({ utmGenerator, linkEnricher, db });
 *
 *   const path = await generator.createPath({
 *     title: 'Privacy Fundamentals',
 *     description: 'Learn privacy from zero to hero',
 *     steps: [
 *       { title: 'Privacy 101', url: 'https://blog.com/privacy-101', type: 'article' },
 *       { title: 'Zero-Knowledge Proofs', url: 'https://youtube.com/watch?v=...', type: 'video' },
 *       { title: 'Privacy Tools Repo', url: 'https://github.com/alice/privacy-tools', type: 'repo' },
 *       { title: 'Privacy Course', url: 'https://udemy.com/course/privacy', type: 'course' },
 *       { title: 'Privacy Book', url: 'https://amazon.com/dp/B08X...', type: 'book' }
 *     ],
 *     platform: 'mastodon',
 *     language: 'es',
 *     persona: 'alice',
 *     brand: 'deathtodata'
 *   });
 *   // Returns path with each step tracked via unique UTM params
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class LearningPathGenerator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.utmGenerator = options.utmGenerator;
    this.linkEnricher = options.linkEnricher;
    this.db = options.db;

    // Platform content sources - aggregate official docs instead of creating custom content
    this.platformSources = {
      godaddy: {
        name: 'GoDaddy',
        docsUrl: 'https://www.godaddy.com/help',
        searchUrl: 'https://www.godaddy.com/help/search?q=',
        topics: ['domain', 'hosting', 'wordpress', 'email', 'ssl', 'website-builder']
      },
      github: {
        name: 'GitHub',
        docsUrl: 'https://docs.github.com',
        learningLab: 'https://github.com/skills',
        searchUrl: 'https://docs.github.com/en/search?query=',
        topics: ['git', 'actions', 'copilot', 'security', 'api', 'codespaces']
      },
      linkedin: {
        name: 'LinkedIn Learning',
        baseUrl: 'https://www.linkedin.com/learning',
        searchUrl: 'https://www.linkedin.com/learning/search?keywords=',
        topics: ['business', 'technology', 'creative', 'leadership', 'marketing']
      },
      coursera: {
        name: 'Coursera',
        baseUrl: 'https://www.coursera.org',
        searchUrl: 'https://www.coursera.org/search?query=',
        topics: ['data-science', 'business', 'computer-science', 'ai', 'programming']
      },
      microsoft: {
        name: 'Microsoft Learn',
        docsUrl: 'https://learn.microsoft.com',
        searchUrl: 'https://learn.microsoft.com/en-us/search/?terms=',
        topics: ['azure', 'dotnet', 'typescript', 'vscode', 'powershell', 'sql']
      },
      figma: {
        name: 'Figma',
        docsUrl: 'https://help.figma.com',
        youtubeChannel: 'https://www.youtube.com/@Figma',
        searchUrl: 'https://help.figma.com/hc/en-us/search?query=',
        topics: ['design', 'prototyping', 'collaboration', 'dev-mode', 'plugins']
      },
      canva: {
        name: 'Canva',
        docsUrl: 'https://www.canva.com/help',
        designSchool: 'https://www.canva.com/designschool',
        searchUrl: 'https://www.canva.com/help/search?q=',
        topics: ['design', 'branding', 'social-media', 'marketing', 'templates']
      },
      youtube: {
        name: 'YouTube',
        baseUrl: 'https://www.youtube.com',
        searchUrl: 'https://www.youtube.com/results?search_query=',
        topics: ['tutorials', 'courses', 'talks', 'demos', 'reviews']
      },
      medium: {
        name: 'Medium',
        baseUrl: 'https://medium.com',
        searchUrl: 'https://medium.com/search?q=',
        topics: ['programming', 'data-science', 'design', 'business', 'technology']
      },
      udemy: {
        name: 'Udemy',
        baseUrl: 'https://www.udemy.com',
        searchUrl: 'https://www.udemy.com/courses/search/?q=',
        topics: ['development', 'business', 'design', 'marketing', 'it-software']
      }
    };

    // Path templates for different topics
    this.templates = {
      privacy: {
        title: 'Privacy Fundamentals',
        description: 'Learn privacy from zero to hero',
        defaultSteps: ['article', 'video', 'repo', 'course', 'book']
      },
      security: {
        title: 'Security Essentials',
        description: 'Master cybersecurity basics',
        defaultSteps: ['article', 'video', 'repo', 'tool', 'course']
      },
      ai: {
        title: 'AI & Machine Learning',
        description: 'From basics to advanced AI',
        defaultSteps: ['article', 'video', 'repo', 'course', 'paper']
      },
      blockchain: {
        title: 'Blockchain & Crypto',
        description: 'Understand decentralized tech',
        defaultSteps: ['article', 'video', 'repo', 'course', 'whitepaper']
      },
      programming: {
        title: 'Programming Mastery',
        description: 'Become a better developer',
        defaultSteps: ['article', 'video', 'repo', 'course', 'book']
      }
    };

    // Step type → content type mapping
    this.stepTypeToContentType = {
      article: 'blog',
      video: 'youtube',
      repo: 'github',
      course: 'udemy',
      book: 'amazon',
      tool: 'product',
      paper: 'article',
      whitepaper: 'article',
      podcast: 'audio',
      newsletter: 'email'
    };

    console.log('[LearningPathGenerator] Initialized');
  }

  /**
   * Create learning path with UTM tracking
   */
  async createPath(options) {
    const {
      title,
      description,
      steps, // [{ title, url, type, description?, duration? }]
      platform,
      language = 'en',
      persona = null,
      brand = null,
      sessionId = null,
      topics = [],
      pathSlug = null,
      variant = null // For A/B testing different path orders
    } = options;

    if (!steps || steps.length === 0) {
      throw new Error('At least one step is required');
    }

    // Generate path ID
    const pathId = pathSlug || this._generatePathSlug(title);
    const pathUUID = crypto.randomBytes(8).toString('hex');

    // Build campaign name
    const campaignBase = `learning-path-${pathId}`;
    const campaign = variant ? `${campaignBase}-${variant}` : campaignBase;

    console.log(`[LearningPathGenerator] Creating path: ${title} (${steps.length} steps)`);

    // Enrich each step with UTM tracking
    const enrichedSteps = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      const utmParams = {
        source: platform,
        medium: this.utmGenerator?.platformMedium[platform] || 'referral',
        campaign,
        content: persona ? `${language}-${persona}-step${i + 1}` : `${language}-step${i + 1}`,
        term: topics.length > 0 ? topics[0] : step.type,
        affiliateTag: brand && this.utmGenerator?.affiliateTags[brand] ? this.utmGenerator.affiliateTags[brand] : null
      };

      const trackedUrl = this.utmGenerator
        ? this.utmGenerator.enrichLink(step.url, utmParams)
        : step.url;

      enrichedSteps.push({
        stepNumber: i + 1,
        title: step.title,
        description: step.description || null,
        type: step.type,
        duration: step.duration || null,
        originalUrl: step.url,
        trackedUrl,
        utmParams,
        completionGoal: step.completionGoal || null, // e.g., "Read article", "Watch video", "Clone repo"
        source: step.source || null // Platform source (GitHub, Coursera, etc.)
      });

      console.log(`[LearningPathGenerator] Step ${i + 1}: ${step.title} (${step.type})`);
    }

    // Build path object
    const path = {
      pathId,
      uuid: pathUUID,
      title,
      description,
      campaign,
      variant,
      totalSteps: steps.length,
      steps: enrichedSteps,
      platform,
      language,
      persona,
      brand,
      sessionId,
      topics,
      createdAt: new Date(),
      metadata: {
        estimatedDuration: this._calculateTotalDuration(steps),
        difficulty: this._inferDifficulty(steps),
        tags: this._extractTags(title, description, steps)
      }
    };

    // Save to database
    if (this.db) {
      await this._savePath(path);
    }

    this.emit('path:created', {
      pathId,
      title,
      steps: steps.length,
      platform,
      language,
      persona
    });

    console.log(`[LearningPathGenerator] Path created: ${pathId} (${campaign})`);

    return path;
  }

  /**
   * Generate learning path from narrative
   */
  async generateFromNarrative(options) {
    const {
      narrative,
      platform,
      language = 'en',
      persona = null,
      brand = null,
      sessionId = null,
      pathTemplate = null // privacy | security | ai | blockchain | programming
    } = options;

    // Detect topic from narrative
    const topic = pathTemplate || this._detectTopic(narrative);
    const template = this.templates[topic] || this.templates.programming;

    console.log(`[LearningPathGenerator] Generating path from narrative (topic: ${topic})`);

    // Extract product links from narrative
    const products = this.linkEnricher
      ? this.linkEnricher.extractProductLinks(narrative, brand)
      : [];

    if (products.length === 0) {
      console.warn('[LearningPathGenerator] No products found in narrative');
      return null;
    }

    // Map products to steps
    const steps = products.map(product => ({
      title: product.name,
      url: product.url,
      type: product.productType,
      description: null
    }));

    // Add intro article if available
    if (narrative.url) {
      steps.unshift({
        title: narrative.title || 'Introduction',
        url: narrative.url,
        type: 'article',
        description: narrative.summary || null
      });
    }

    // Create path
    const path = await this.createPath({
      title: narrative.title || template.title,
      description: narrative.summary || template.description,
      steps,
      platform,
      language,
      persona,
      brand,
      sessionId,
      topics: narrative.themes || []
    });

    console.log(`[LearningPathGenerator] Generated path with ${steps.length} steps from narrative`);

    return path;
  }

  /**
   * Create A/B test variants of a path
   */
  async createPathVariants(pathOptions, variantCount = 3) {
    const baseSteps = pathOptions.steps;

    if (baseSteps.length < 3) {
      console.warn('[LearningPathGenerator] Need at least 3 steps for A/B testing');
      return [await this.createPath(pathOptions)];
    }

    const variants = [];

    // Variant A: Original order
    variants.push(await this.createPath({
      ...pathOptions,
      variant: 'a-original'
    }));

    // Variant B: Reverse order
    if (variantCount >= 2) {
      variants.push(await this.createPath({
        ...pathOptions,
        steps: [...baseSteps].reverse(),
        variant: 'b-reverse'
      }));
    }

    // Variant C: Prioritize high-value items (books, courses) first
    if (variantCount >= 3) {
      const highValueFirst = [...baseSteps].sort((a, b) => {
        const valueOrder = { book: 0, course: 1, product: 2, video: 3, repo: 4, article: 5 };
        return (valueOrder[a.type] || 99) - (valueOrder[b.type] || 99);
      });

      variants.push(await this.createPath({
        ...pathOptions,
        steps: highValueFirst,
        variant: 'c-highvalue'
      }));
    }

    // Variant D: Shuffle
    if (variantCount >= 4) {
      const shuffled = this._shuffleArray([...baseSteps]);

      variants.push(await this.createPath({
        ...pathOptions,
        steps: shuffled,
        variant: 'd-shuffle'
      }));
    }

    console.log(`[LearningPathGenerator] Created ${variants.length} path variants for A/B testing`);

    return variants;
  }

  /**
   * Track step completion
   */
  async trackStepCompletion(options) {
    if (!this.db) return;

    const {
      pathId,
      stepNumber,
      userId = null,
      sessionId = null,
      timeSpent = null,
      metadata = {}
    } = options;

    try {
      await this.db.query(`
        INSERT INTO learning_path_step_completions (
          path_id,
          step_number,
          user_id,
          session_id,
          time_spent_seconds,
          metadata,
          completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [pathId, stepNumber, userId, sessionId, timeSpent, JSON.stringify(metadata)]);

      this.emit('step:completed', {
        pathId,
        stepNumber,
        userId,
        timeSpent
      });

      console.log(`[LearningPathGenerator] Step completion tracked: ${pathId} step ${stepNumber}`);

    } catch (error) {
      console.error('[LearningPathGenerator] Track completion error:', error.message);
    }
  }

  /**
   * Track path conversion (user bought something from path)
   */
  async trackPathConversion(options) {
    if (!this.db) return;

    const {
      pathId,
      userId = null,
      sessionId = null,
      conversionType = 'purchase', // purchase | signup | download | click
      conversionValue = 0,
      stepNumber = null, // Which step led to conversion
      metadata = {}
    } = options;

    try {
      await this.db.query(`
        INSERT INTO learning_path_conversions (
          path_id,
          user_id,
          session_id,
          conversion_type,
          conversion_value_cents,
          step_number,
          metadata,
          converted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [pathId, userId, sessionId, conversionType, conversionValue, stepNumber, JSON.stringify(metadata)]);

      this.emit('path:conversion', {
        pathId,
        conversionType,
        conversionValue,
        stepNumber
      });

      console.log(`[LearningPathGenerator] Conversion tracked: ${pathId} → $${conversionValue / 100}`);

    } catch (error) {
      console.error('[LearningPathGenerator] Track conversion error:', error.message);
    }
  }

  /**
   * Get path performance analytics
   */
  async getPathPerformance(pathId) {
    if (!this.db) {
      throw new Error('Database required');
    }

    try {
      const query = `
        SELECT
          p.path_id,
          p.title,
          p.variant,
          p.total_steps,
          COUNT(DISTINCT c.id) as total_completions,
          COUNT(DISTINCT conv.id) as total_conversions,
          COALESCE(SUM(conv.conversion_value_cents), 0) as total_revenue_cents,
          AVG(c.time_spent_seconds) as avg_time_per_step,
          CASE
            WHEN COUNT(DISTINCT c.id) > 0
            THEN (COUNT(DISTINCT conv.id)::float / COUNT(DISTINCT c.id) * 100)
            ELSE 0
          END as conversion_rate
        FROM learning_paths p
        LEFT JOIN learning_path_step_completions c ON p.path_id = c.path_id
        LEFT JOIN learning_path_conversions conv ON p.path_id = conv.path_id
        WHERE p.path_id = $1
        GROUP BY p.path_id, p.title, p.variant, p.total_steps
      `;

      const result = await this.db.query(query, [pathId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      // Get step-by-step completion rates
      const stepQuery = `
        SELECT
          step_number,
          COUNT(*) as completions,
          AVG(time_spent_seconds) as avg_time
        FROM learning_path_step_completions
        WHERE path_id = $1
        GROUP BY step_number
        ORDER BY step_number ASC
      `;

      const stepResult = await this.db.query(stepQuery, [pathId]);

      return {
        pathId: row.path_id,
        title: row.title,
        variant: row.variant,
        totalSteps: parseInt(row.total_steps),
        totalCompletions: parseInt(row.total_completions),
        totalConversions: parseInt(row.total_conversions),
        revenue: parseFloat(row.total_revenue_cents) / 100,
        conversionRate: parseFloat(row.conversion_rate),
        avgTimePerStep: parseFloat(row.avg_time_per_step),
        stepPerformance: stepResult.rows.map(s => ({
          stepNumber: parseInt(s.step_number),
          completions: parseInt(s.completions),
          avgTime: parseFloat(s.avg_time)
        }))
      };

    } catch (error) {
      console.error('[LearningPathGenerator] Performance query error:', error.message);
      return null;
    }
  }

  /**
   * Compare A/B test variants
   */
  async compareVariants(basePathId) {
    if (!this.db) {
      throw new Error('Database required');
    }

    try {
      // Get all variants for this path
      const query = `
        SELECT
          p.path_id,
          p.variant,
          COUNT(DISTINCT c.id) as completions,
          COUNT(DISTINCT conv.id) as conversions,
          COALESCE(SUM(conv.conversion_value_cents), 0) as revenue_cents,
          CASE
            WHEN COUNT(DISTINCT c.id) > 0
            THEN (COUNT(DISTINCT conv.id)::float / COUNT(DISTINCT c.id) * 100)
            ELSE 0
          END as conversion_rate
        FROM learning_paths p
        LEFT JOIN learning_path_step_completions c ON p.path_id = c.path_id
        LEFT JOIN learning_path_conversions conv ON p.path_id = conv.path_id
        WHERE p.path_id LIKE $1
        GROUP BY p.path_id, p.variant
        ORDER BY revenue_cents DESC
      `;

      const result = await this.db.query(query, [`${basePathId}%`]);

      return result.rows.map(row => ({
        pathId: row.path_id,
        variant: row.variant,
        completions: parseInt(row.completions),
        conversions: parseInt(row.conversions),
        revenue: parseFloat(row.revenue_cents) / 100,
        conversionRate: parseFloat(row.conversion_rate)
      }));

    } catch (error) {
      console.error('[LearningPathGenerator] Compare variants error:', error.message);
      return [];
    }
  }

  /**
   * Get top performing paths
   */
  async getTopPaths(options = {}) {
    if (!this.db) {
      throw new Error('Database required');
    }

    const {
      metric = 'revenue', // revenue | conversions | completions | conversion_rate
      limit = 10,
      platform = null,
      language = null,
      brand = null
    } = options;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (platform) {
      conditions.push(`p.platform = $${paramIndex++}`);
      params.push(platform);
    }

    if (language) {
      conditions.push(`p.language = $${paramIndex++}`);
      params.push(language);
    }

    if (brand) {
      conditions.push(`p.brand = $${paramIndex++}`);
      params.push(brand);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const orderByMap = {
      revenue: 'revenue_cents DESC',
      conversions: 'conversions DESC',
      completions: 'completions DESC',
      conversion_rate: 'conversion_rate DESC'
    };

    const orderBy = orderByMap[metric] || orderByMap.revenue;

    params.push(limit);

    try {
      const query = `
        SELECT
          p.path_id,
          p.title,
          p.platform,
          p.language,
          p.persona,
          p.brand,
          COUNT(DISTINCT c.id) as completions,
          COUNT(DISTINCT conv.id) as conversions,
          COALESCE(SUM(conv.conversion_value_cents), 0) as revenue_cents,
          CASE
            WHEN COUNT(DISTINCT c.id) > 0
            THEN (COUNT(DISTINCT conv.id)::float / COUNT(DISTINCT c.id) * 100)
            ELSE 0
          END as conversion_rate
        FROM learning_paths p
        LEFT JOIN learning_path_step_completions c ON p.path_id = c.path_id
        LEFT JOIN learning_path_conversions conv ON p.path_id = conv.path_id
        ${whereClause}
        GROUP BY p.path_id, p.title, p.platform, p.language, p.persona, p.brand
        ORDER BY ${orderBy}
        LIMIT $${paramIndex}
      `;

      const result = await this.db.query(query, params);

      return result.rows.map(row => ({
        pathId: row.path_id,
        title: row.title,
        platform: row.platform,
        language: row.language,
        persona: row.persona,
        brand: row.brand,
        completions: parseInt(row.completions),
        conversions: parseInt(row.conversions),
        revenue: parseFloat(row.revenue_cents) / 100,
        conversionRate: parseFloat(row.conversion_rate)
      }));

    } catch (error) {
      console.error('[LearningPathGenerator] Top paths query error:', error.message);
      return [];
    }
  }

  /**
   * Generate path slug from title
   */
  _generatePathSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }

  /**
   * Detect topic from narrative
   */
  _detectTopic(narrative) {
    const text = `${narrative.title || ''} ${narrative.summary || ''}`.toLowerCase();
    const themes = narrative.themes || [];

    const topicKeywords = {
      privacy: ['privacy', 'surveillance', 'data', 'tracking', 'gdpr'],
      security: ['security', 'encryption', 'cryptography', 'cybersecurity', 'hacking'],
      ai: ['ai', 'machine learning', 'neural', 'deep learning', 'llm'],
      blockchain: ['blockchain', 'crypto', 'bitcoin', 'ethereum', 'web3'],
      programming: ['programming', 'code', 'development', 'software', 'api']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (themes.some(t => keywords.includes(t.toLowerCase()))) {
        return topic;
      }
      if (keywords.some(k => text.includes(k))) {
        return topic;
      }
    }

    return 'programming'; // Default
  }

  /**
   * Calculate total duration from steps
   */
  _calculateTotalDuration(steps) {
    return steps.reduce((total, step) => {
      return total + (step.duration || 0);
    }, 0);
  }

  /**
   * Infer difficulty from step types
   */
  _inferDifficulty(steps) {
    const complexTypes = ['course', 'book', 'paper', 'whitepaper'];
    const complexCount = steps.filter(s => complexTypes.includes(s.type)).length;

    if (complexCount >= steps.length * 0.6) return 'advanced';
    if (complexCount >= steps.length * 0.3) return 'intermediate';
    return 'beginner';
  }

  /**
   * Extract tags from content
   */
  _extractTags(title, description, steps) {
    const text = `${title} ${description} ${steps.map(s => s.title).join(' ')}`.toLowerCase();
    const commonTags = [
      'privacy', 'security', 'ai', 'blockchain', 'programming',
      'web3', 'crypto', 'data', 'surveillance', 'encryption',
      'machine-learning', 'cybersecurity', 'open-source'
    ];

    return commonTags.filter(tag => text.includes(tag));
  }

  /**
   * Shuffle array (for variant generation)
   */
  _shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Aggregate platform content for a skill/topic
   * Returns links to official docs instead of creating custom lessons
   */
  async aggregatePlatformContent(skillOrTopic) {
    const skill = skillOrTopic.toLowerCase();
    const aggregatedContent = {
      skill: skillOrTopic,
      platforms: {},
      totalResources: 0
    };

    console.log(`[LearningPathGenerator] Aggregating content for: ${skillOrTopic}`);

    // Map skill to platforms
    const platformMatches = this._matchSkillToPlatforms(skill);

    for (const platform of platformMatches) {
      const source = this.platformSources[platform];
      if (!source) continue;

      const resources = this._generatePlatformResources(skill, source);

      if (resources.length > 0) {
        aggregatedContent.platforms[platform] = {
          name: source.name,
          resources
        };
        aggregatedContent.totalResources += resources.length;
      }
    }

    console.log(`[LearningPathGenerator] Found ${aggregatedContent.totalResources} resources across ${Object.keys(aggregatedContent.platforms).length} platforms`);

    return aggregatedContent;
  }

  /**
   * Match skill to relevant platforms
   */
  _matchSkillToPlatforms(skill) {
    const platformMapping = {
      // Development
      'react': ['github', 'youtube', 'coursera', 'udemy', 'medium'],
      'javascript': ['github', 'microsoft', 'youtube', 'coursera', 'medium'],
      'typescript': ['github', 'microsoft', 'youtube', 'coursera', 'medium'],
      'python': ['github', 'microsoft', 'youtube', 'coursera', 'medium'],
      'node': ['github', 'youtube', 'coursera', 'udemy', 'medium'],
      'nodejs': ['github', 'youtube', 'coursera', 'udemy', 'medium'],
      'git': ['github', 'youtube', 'medium'],
      'docker': ['github', 'youtube', 'coursera', 'medium'],
      'kubernetes': ['github', 'youtube', 'coursera', 'medium'],

      // Design
      'figma': ['figma', 'youtube', 'udemy', 'medium'],
      'design': ['figma', 'canva', 'youtube', 'linkedin', 'medium'],
      'ui': ['figma', 'canva', 'youtube', 'linkedin', 'medium'],
      'ux': ['figma', 'youtube', 'coursera', 'linkedin', 'medium'],
      'canva': ['canva', 'youtube', 'udemy'],

      // Cloud & Infrastructure
      'azure': ['microsoft', 'youtube', 'coursera', 'linkedin'],
      'aws': ['github', 'youtube', 'coursera', 'udemy', 'medium'],
      'cloud': ['microsoft', 'github', 'youtube', 'coursera', 'linkedin'],

      // Web
      'wordpress': ['godaddy', 'youtube', 'udemy', 'medium'],
      'hosting': ['godaddy', 'youtube', 'medium'],
      'domain': ['godaddy', 'youtube', 'medium'],
      'ssl': ['godaddy', 'youtube', 'medium'],

      // Data & AI
      'data': ['coursera', 'youtube', 'microsoft', 'github', 'medium'],
      'ai': ['coursera', 'github', 'youtube', 'microsoft', 'medium'],
      'machine learning': ['coursera', 'github', 'youtube', 'microsoft', 'medium'],
      'ml': ['coursera', 'github', 'youtube', 'microsoft', 'medium'],

      // Business
      'marketing': ['linkedin', 'canva', 'youtube', 'coursera', 'medium'],
      'leadership': ['linkedin', 'youtube', 'coursera', 'medium'],
      'management': ['linkedin', 'youtube', 'coursera', 'medium'],
      'business': ['linkedin', 'youtube', 'coursera', 'medium']
    };

    // Find matching platforms
    const matches = new Set();

    for (const [keyword, platforms] of Object.entries(platformMapping)) {
      if (skill.includes(keyword)) {
        platforms.forEach(p => matches.add(p));
      }
    }

    // If no matches, return general learning platforms
    if (matches.size === 0) {
      return ['github', 'youtube', 'coursera', 'medium'];
    }

    return Array.from(matches);
  }

  /**
   * Generate platform resource links
   */
  _generatePlatformResources(skill, source) {
    const resources = [];
    const encodedSkill = encodeURIComponent(skill);

    // Main documentation
    if (source.docsUrl) {
      resources.push({
        type: 'documentation',
        title: `${source.name} Official Docs`,
        url: source.docsUrl,
        description: `Official documentation and guides for ${skill}`
      });
    }

    // Search results
    if (source.searchUrl) {
      resources.push({
        type: 'search',
        title: `${source.name} - ${skill}`,
        url: `${source.searchUrl}${encodedSkill}`,
        description: `Search results for ${skill} on ${source.name}`
      });
    }

    // Special resources
    if (source.learningLab) {
      resources.push({
        type: 'course',
        title: 'GitHub Skills',
        url: source.learningLab,
        description: 'Interactive GitHub learning labs'
      });
    }

    if (source.designSchool) {
      resources.push({
        type: 'course',
        title: 'Canva Design School',
        url: source.designSchool,
        description: 'Free design courses and tutorials'
      });
    }

    if (source.youtubeChannel) {
      resources.push({
        type: 'video',
        title: `${source.name} YouTube Channel`,
        url: source.youtubeChannel,
        description: 'Official video tutorials and updates'
      });
    }

    return resources;
  }

  /**
   * Create learning path from aggregated content
   * This replaces custom lesson generation with links to existing platform content
   */
  async createPathFromAggregatedContent(options) {
    const {
      skill,
      platform,
      language = 'en',
      persona = null,
      brand = null,
      sessionId = null
    } = options;

    // Aggregate content from platforms
    const aggregated = await this.aggregatePlatformContent(skill);

    // Build steps from aggregated content
    const steps = [];
    let stepIndex = 0;

    for (const [platformKey, platformData] of Object.entries(aggregated.platforms)) {
      for (const resource of platformData.resources) {
        steps.push({
          title: resource.title,
          url: resource.url,
          type: resource.type,
          description: resource.description,
          source: platformData.name
        });
        stepIndex++;

        // Limit to 10 steps per path
        if (stepIndex >= 10) break;
      }
      if (stepIndex >= 10) break;
    }

    if (steps.length === 0) {
      console.warn(`[LearningPathGenerator] No content found for skill: ${skill}`);
      return null;
    }

    // Create path using existing createPath method
    const path = await this.createPath({
      title: `Learn ${skill}`,
      description: `Curated resources from ${Object.keys(aggregated.platforms).length} platforms`,
      steps,
      platform,
      language,
      persona,
      brand,
      sessionId,
      topics: [skill],
      pathSlug: `learn-${skill.replace(/\s+/g, '-')}`
    });

    // Add aggregated content metadata
    path.aggregatedContent = aggregated;
    path.contentType = 'aggregated'; // vs 'custom'

    console.log(`[LearningPathGenerator] Created aggregated path for ${skill} with ${steps.length} steps`);

    return path;
  }

  /**
   * Save path to database
   */
  async _savePath(path) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO learning_paths (
          path_id,
          uuid,
          title,
          description,
          campaign,
          variant,
          total_steps,
          steps,
          platform,
          language,
          persona,
          brand,
          session_id,
          topics,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        path.pathId,
        path.uuid,
        path.title,
        path.description,
        path.campaign,
        path.variant,
        path.totalSteps,
        JSON.stringify(path.steps),
        path.platform,
        path.language,
        path.persona,
        path.brand,
        path.sessionId,
        JSON.stringify(path.topics),
        JSON.stringify(path.metadata),
        path.createdAt
      ]);

    } catch (error) {
      // Table might not exist yet - that's ok
      if (!error.message.includes('does not exist')) {
        console.error('[LearningPathGenerator] Save path error:', error.message);
      }
    }
  }
}

module.exports = LearningPathGenerator;
