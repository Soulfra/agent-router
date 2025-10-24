/**
 * Multi-Brand Auto-Poster (Tycoon-Style Content Generation)
 *
 * Features:
 * - Auto-generate content for multiple brands/domains
 * - Cal Riven generates content using voice themes
 * - Comment-based content triggering
 * - Resource management (XP, cooldowns, attention)
 * - Aggro-based prioritization (which brand needs content most)
 * - TikTok-style challenge integration
 */

const NestedTraversal = require('./nested-traversal');

class MultiBrandPoster {
  constructor({ calRivenAgent, db, nestedTraversal = null }) {
    this.calRiven = calRivenAgent;
    this.db = db;
    this.traversal = nestedTraversal || new NestedTraversal();

    // Brand configurations
    this.brands = {
      calos: {
        domain: 'calos.ai',
        theme: 'Operating system for AI agents',
        personality: 'technical, innovative, developer-focused',
        postFrequency: 'daily'
      },
      soulfra: {
        domain: 'soulfra.com',
        theme: 'Universal SSO and authentication',
        personality: 'security-focused, trustworthy, enterprise-ready',
        postFrequency: 'daily'
      },
      deathtodata: {
        domain: 'deathtodata.com',
        theme: 'Search engine philosophy and programmatic SEO',
        personality: 'philosophical, data-driven, rebellious',
        postFrequency: 'daily'
      },
      roughsparks: {
        domain: 'roughsparks.com',
        theme: 'Creative sparks and idea generation',
        personality: 'creative, spontaneous, inspiring',
        postFrequency: 'daily'
      }
    };

    // Post queue: Map<brand, Array<post>>
    this.postQueue = new Map();

    // Cooldown tracker (tycoon mechanics)
    this.cooldowns = new Map();

    // Comment sentiment tracker
    this.commentSentiment = new Map();

    console.log('[MultiBrandPoster] Initialized with', Object.keys(this.brands).length, 'brands');
  }

  /**
   * Generate and post content for a brand
   */
  async postToBrand({ brand, topic, voiceTranscript = null, commentTrigger = null }) {
    try {
      // Check cooldown (tycoon mechanics)
      if (this.isOnCooldown(brand)) {
        const remaining = this.getCooldownRemaining(brand);
        return {
          success: false,
          error: `Brand on cooldown for ${Math.ceil(remaining / 1000)}s`,
          cooldown: remaining
        };
      }

      // Get brand config
      const brandConfig = this.brands[brand];
      if (!brandConfig) {
        throw new Error(`Unknown brand: ${brand}`);
      }

      // Calculate aggro (priority) for this post
      const aggro = this.calculatePostAggro(brand, { topic, commentTrigger });

      // Add to traversal aggro table
      this.traversal.addAggro(`brand_${brand}`, aggro);

      // Generate content using Cal Riven
      const content = await this.generateContent({
        brand: brandConfig,
        topic,
        voiceTranscript,
        commentTrigger
      });

      // Queue post
      if (!this.postQueue.has(brand)) {
        this.postQueue.set(brand, []);
      }

      const post = {
        postId: crypto.randomUUID(),
        brand,
        topic,
        content: content.text,
        aggro,
        voiceTranscript,
        commentTrigger,
        status: 'queued',
        queuedAt: new Date()
      };

      this.postQueue.get(brand).push(post);

      // Set cooldown
      this.setCooldown(brand, 60000); // 60 second cooldown

      // Actually post (in production, integrate with CMS/API)
      const posted = await this.publishPost(post);

      return {
        success: true,
        postId: post.postId,
        brand,
        content: content.text,
        aggro,
        published: posted
      };
    } catch (error) {
      console.error('[MultiBrandPoster] Error posting to brand:', error);
      throw error;
    }
  }

  /**
   * Generate content using Cal Riven
   */
  async generateContent({ brand, topic, voiceTranscript, commentTrigger }) {
    // Build prompt for Cal Riven
    let prompt = `Write a ${brand.theme} post about: ${topic}\n\n`;
    prompt += `Brand personality: ${brand.personality}\n`;

    if (voiceTranscript) {
      prompt += `Based on this voice input: "${voiceTranscript}"\n`;
    }

    if (commentTrigger) {
      prompt += `This is in response to a comment: "${commentTrigger.text}"\n`;
    }

    prompt += `\nWrite a compelling post that matches the brand voice.`;

    // Generate using Cal Riven
    const response = await this.calRiven.chat(prompt, {
      context: { brand: brand.domain }
    });

    return {
      text: response.response,
      hints: response.hints || []
    };
  }

  /**
   * Calculate aggro (priority) for a post
   */
  calculatePostAggro(brand, { topic, commentTrigger }) {
    let aggro = 0;

    // Base aggro
    aggro += 5;

    // Comment-triggered posts get higher aggro
    if (commentTrigger) {
      aggro += 10;

      // Sentiment amplification
      if (commentTrigger.sentiment) {
        aggro += Math.abs(commentTrigger.sentiment) * 5;
      }

      // Popular comments (high likes) = higher aggro
      if (commentTrigger.likes) {
        aggro += commentTrigger.likes * 0.5;
      }
    }

    // Topic keywords that increase aggro
    const hotKeywords = ['launch', 'new', 'breaking', 'urgent', 'trending'];
    for (const keyword of hotKeywords) {
      if (topic.toLowerCase().includes(keyword)) {
        aggro += 5;
      }
    }

    // Brand-specific boosts
    const brandBoosts = {
      soulfra: 1.2,    // SSO is priority
      deathtodata: 1.1 // Search is important
    };

    if (brandBoosts[brand]) {
      aggro *= brandBoosts[brand];
    }

    return aggro;
  }

  /**
   * Publish post (integrate with actual CMS/API)
   */
  async publishPost(post) {
    // In production, this would POST to your CMS API or database
    console.log(`[MultiBrandPoster] 📝 Publishing to ${post.brand}:`, post.content.substring(0, 100) + '...');

    // Store in database
    if (this.db) {
      await this.db.query(
        `INSERT INTO brand_posts (brand, topic, content, aggro, voice_transcript, comment_trigger_id, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          post.brand,
          post.topic,
          post.content,
          post.aggro,
          post.voiceTranscript,
          post.commentTrigger?.id || null
        ]
      );
    }

    // Update post status
    post.status = 'published';
    post.publishedAt = new Date();

    return true;
  }

  /**
   * Monitor comments and trigger content generation
   */
  async monitorComments(brand) {
    // In production, poll API or use webhooks
    // For now, simulate comment detection
    console.log(`[MultiBrandPoster] Monitoring comments for ${brand}...`);

    // This would be called by a webhook or polling system
    // Example: When a comment is detected:
    // await this.handleComment(brand, comment);
  }

  /**
   * Handle incoming comment (trigger content generation)
   */
  async handleComment(brand, comment) {
    // Analyze sentiment
    const sentiment = this.analyzeSentiment(comment.text);

    // Update sentiment tracker
    if (!this.commentSentiment.has(brand)) {
      this.commentSentiment.set(brand, []);
    }
    this.commentSentiment.get(brand).push({ comment, sentiment, timestamp: new Date() });

    // Trigger content generation if sentiment is strong enough
    if (Math.abs(sentiment) > 0.5) {
      await this.postToBrand({
        brand,
        topic: comment.topic || 'response to comment',
        commentTrigger: {
          id: comment.id,
          text: comment.text,
          sentiment,
          likes: comment.likes || 0
        }
      });
    }
  }

  /**
   * Analyze sentiment of comment
   */
  analyzeSentiment(text) {
    // Simple keyword-based sentiment (in production, use proper NLP)
    const positive = ['great', 'love', 'awesome', 'amazing', 'excellent', 'perfect'];
    const negative = ['bad', 'hate', 'terrible', 'awful', 'worst', 'horrible'];

    const lower = text.toLowerCase();
    let score = 0;

    for (const word of positive) {
      if (lower.includes(word)) score += 0.2;
    }

    for (const word of negative) {
      if (lower.includes(word)) score -= 0.2;
    }

    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Check if brand is on cooldown
   */
  isOnCooldown(brand) {
    if (!this.cooldowns.has(brand)) {
      return false;
    }

    const cooldownEnd = this.cooldowns.get(brand);
    return Date.now() < cooldownEnd;
  }

  /**
   * Get cooldown remaining time
   */
  getCooldownRemaining(brand) {
    if (!this.isOnCooldown(brand)) {
      return 0;
    }

    return this.cooldowns.get(brand) - Date.now();
  }

  /**
   * Set cooldown for brand
   */
  setCooldown(brand, durationMs) {
    this.cooldowns.set(brand, Date.now() + durationMs);
  }

  /**
   * Get post queue for brand
   */
  getPostQueue(brand) {
    return this.postQueue.get(brand) || [];
  }

  /**
   * Get all pending posts across all brands (sorted by aggro)
   */
  getAllPendingPosts() {
    const allPosts = [];

    for (const [brand, queue] of this.postQueue.entries()) {
      allPosts.push(...queue.filter(p => p.status === 'queued'));
    }

    // Sort by aggro (highest first)
    allPosts.sort((a, b) => b.aggro - a.aggro);

    return allPosts;
  }

  /**
   * Get stats
   */
  async getStats() {
    const stats = {
      brands: Object.keys(this.brands).length,
      totalQueued: 0,
      totalPublished: 0,
      brandStats: {}
    };

    for (const [brand, queue] of this.postQueue.entries()) {
      stats.brandStats[brand] = {
        queued: queue.filter(p => p.status === 'queued').length,
        published: queue.filter(p => p.status === 'published').length,
        onCooldown: this.isOnCooldown(brand),
        cooldownRemaining: this.getCooldownRemaining(brand)
      };

      stats.totalQueued += stats.brandStats[brand].queued;
      stats.totalPublished += stats.brandStats[brand].published;
    }

    return stats;
  }

  /**
   * Add custom brand
   */
  addBrand(name, config) {
    this.brands[name] = config;
    console.log(`[MultiBrandPoster] Added brand: ${name} (${config.domain})`);
  }

  /**
   * Remove brand
   */
  removeBrand(name) {
    delete this.brands[name];
    this.postQueue.delete(name);
    this.cooldowns.delete(name);
    console.log(`[MultiBrandPoster] Removed brand: ${name}`);
  }
}

const crypto = require('crypto');

module.exports = MultiBrandPoster;
