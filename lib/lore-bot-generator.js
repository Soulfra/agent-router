/**
 * Video Game Lore Bot Generator
 *
 * Generates "organic" forum discussions based on video game lore.
 * Uses local Ollama for variations to avoid API costs.
 *
 * ETHICAL GUARDRAILS:
 * - ALL bot posts are marked as bot-generated
 * - Uses video game lore (not deceptive topics)
 * - Timing varies to look natural (not spam)
 * - Can be disabled per domain
 *
 * Strategy:
 * - Complex game lore → interesting discussions
 * - Similar to StackOverflow's niche communities
 * - Cross-links between your domains
 * - Builds SEO through "organic" content
 *
 * Usage:
 *   const bot = new LoreBotGenerator({ db, ollamaUrl });
 *   await bot.generatePost({ gameSlug: 'dark-souls', domain: 'calos' });
 */

const fetch = require('node-fetch');

class LoreBotGenerator {
  constructor(config = {}) {
    this.db = config.db;
    this.ollamaUrl = config.ollamaUrl || 'http://127.0.0.1:11434';
    this.model = config.model || 'llama3.2:3b';
    this.forumManager = config.forumManager; // ContentForum instance
    this.enabled = config.enabled !== false; // Default enabled

    if (!this.db) {
      throw new Error('[LoreBotGenerator] Database required');
    }

    console.log('[LoreBotGenerator] Initialized with model:', this.model);
  }

  /**
   * Generate and post a lore discussion
   */
  async generatePost(options = {}) {
    const {
      gameSlug = null,
      domain = 'calos',
      templateType = null,
      dryRun = false
    } = options;

    if (!this.enabled) {
      console.log('[LoreBotGenerator] Disabled, skipping');
      return null;
    }

    // Select a game (random if not specified)
    const game = gameSlug
      ? await this.getGameBySlug(gameSlug)
      : await this.selectRandomGame();

    if (!game) {
      throw new Error('No games available in database');
    }

    // Select a template
    const template = templateType
      ? await this.getTemplate(templateType, game.id)
      : await this.selectRandomTemplate(game.id);

    if (!template) {
      throw new Error('No templates available');
    }

    console.log(`[LoreBotGenerator] Generating post for ${game.name} using template: ${template.slug}`);

    // Gather lore data to fill template
    const loreData = await this.gatherLoreData(game, template);

    // Fill template with data
    const rawPost = this.fillTemplate(template, loreData);

    // Use Ollama to add variation (make it sound natural)
    const refinedPost = await this.refineWithOllama(rawPost, game);

    // Add bot disclosure
    const finalPost = this.addBotDisclosure(refinedPost);

    if (dryRun) {
      console.log('[LoreBotGenerator] Dry run - post not saved');
      return {
        game,
        template,
        loreData,
        post: finalPost,
        dryRun: true
      };
    }

    // Save to database
    const botPost = await this.savePost({
      domain,
      gameId: game.id,
      templateId: template.id,
      title: finalPost.title,
      body: finalPost.body,
      variablesUsed: loreData
    });

    // Post to forum if forum manager provided
    if (this.forumManager) {
      const thread = await this.postToForum({
        domain,
        title: finalPost.title,
        body: finalPost.body,
        botPostId: botPost.id,
        gameSlug: game.slug
      });

      await this.linkBotPostToThread(botPost.id, thread.id);
    }

    console.log(`[LoreBotGenerator] Posted to ${domain}: "${finalPost.title}"`);

    return {
      game,
      template,
      loreData,
      post: finalPost,
      botPost,
      dryRun: false
    };
  }

  /**
   * Get game by slug
   */
  async getGameBySlug(slug) {
    const result = await this.db.query(
      'SELECT * FROM game_lore_games WHERE slug = $1 AND active = true',
      [slug]
    );
    return result.rows[0];
  }

  /**
   * Select random game weighted by complexity
   */
  async selectRandomGame() {
    const result = await this.db.query(`
      SELECT * FROM game_lore_games
      WHERE active = true
      ORDER BY complexity_level DESC, RANDOM()
      LIMIT 1
    `);
    return result.rows[0];
  }

  /**
   * Get template by type
   */
  async getTemplate(templateType, gameId) {
    const result = await this.db.query(`
      SELECT * FROM game_lore_discussion_templates
      WHERE template_type = $1
        AND active = true
        AND ($2 = ANY(suitable_for_games) OR suitable_for_games = '{}')
      ORDER BY RANDOM()
      LIMIT 1
    `, [templateType, gameId]);

    return result.rows[0];
  }

  /**
   * Select random template
   */
  async selectRandomTemplate(gameId) {
    const result = await this.db.query(`
      SELECT * FROM game_lore_discussion_templates
      WHERE active = true
        AND ($1 = ANY(suitable_for_games) OR suitable_for_games = '{}')
      ORDER BY engagement_potential DESC, used_count ASC, RANDOM()
      LIMIT 1
    `, [gameId]);

    return result.rows[0];
  }

  /**
   * Gather lore data to fill template
   */
  async gatherLoreData(game, template) {
    const data = {
      game_name: game.name,
      game_slug: game.slug
    };

    // Get random character
    const charResult = await this.db.query(
      'SELECT * FROM game_lore_characters WHERE game_id = $1 AND active = true ORDER BY RANDOM() LIMIT 1',
      [game.id]
    );
    if (charResult.rows[0]) {
      const char = charResult.rows[0];
      data.character_name = char.name;
      data.character_role = char.role;
      data.character_backstory = char.backstory || 'Unknown background';
    }

    // Get random event
    const eventResult = await this.db.query(
      'SELECT * FROM game_lore_events WHERE game_id = $1 AND active = true ORDER BY significance DESC, RANDOM() LIMIT 1',
      [game.id]
    );
    if (eventResult.rows[0]) {
      const event = eventResult.rows[0];
      data.event_name = event.name;
      data.event_timeline = event.timeline;
      data.event_description = event.description;
    }

    // Get random lore fragment
    const fragResult = await this.db.query(
      'SELECT * FROM game_lore_fragments WHERE game_id = $1 AND active = true ORDER BY interpretation_difficulty DESC, RANDOM() LIMIT 1',
      [game.id]
    );
    if (fragResult.rows[0]) {
      const frag = fragResult.rows[0];
      data.fragment_title = frag.title;
      data.fragment_content = frag.content.substring(0, 500); // Limit length
      data.fragment_source = frag.source;
    }

    // Get random location
    const locResult = await this.db.query(
      'SELECT * FROM game_lore_locations WHERE game_id = $1 AND active = true ORDER BY RANDOM() LIMIT 1',
      [game.id]
    );
    if (locResult.rows[0]) {
      const loc = locResult.rows[0];
      data.location_name = loc.name;
      data.location_type = loc.location_type;
    }

    return data;
  }

  /**
   * Fill template with lore data
   */
  fillTemplate(template, data) {
    let title = template.title_template;
    let body = template.body_template;

    // Replace all {variable} placeholders
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      const value = data[key] || `[${key}]`;
      title = title.replace(regex, value);
      body = body.replace(regex, value);
    });

    // Add some generic replacements for missing variables
    title = title.replace(/\{action\}/g, 'do what they did');
    title = title.replace(/\{surface_motivation\}/g, 'have obvious reasons');
    body = body.replace(/\{theory\}/g, 'had a hidden agenda');
    body = body.replace(/\{evidence_1\}/g, 'certain dialogue');
    body = body.replace(/\{evidence_2\}/g, 'item descriptions');
    body = body.replace(/\{reason_1\}/g, 'Their behavior in key scenes');
    body = body.replace(/\{reason_2\}/g, 'Connections to other characters');
    body = body.replace(/\{reason_3\}/g, 'Foreshadowing in the lore');
    body = body.replace(/\{historical_context\}/g, 'the broader game timeline');
    body = body.replace(/\{connection_1\}/g, 'earlier events');
    body = body.replace(/\{connection_2\}/g, 'prophecies and legends');
    body = body.replace(/\{interpretation\}/g, 'there is a deeper meaning');
    body = body.replace(/\{source_1\}/g, 'the main questline');
    body = body.replace(/\{source_2\}/g, 'optional side content');
    body = body.replace(/\{timeline_1\}/g, 'at a specific time');
    body = body.replace(/\{timeline_2\}/g, 'at a different time');

    return { title, body };
  }

  /**
   * Refine post using Ollama (add natural variation)
   */
  async refineWithOllama(rawPost, game) {
    const prompt = `You are writing a forum post about ${game.name}. Take this draft and make it sound more natural and conversational, while keeping the same information and structure:\n\nTitle: ${rawPost.title}\n\nBody:\n${rawPost.body}\n\nOutput ONLY the refined post in this format:\nTITLE: [title]\nBODY: [body]`;

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          temperature: 0.8, // Higher for more natural variation
          stream: false
        })
      });

      if (!response.ok) {
        console.warn('[LoreBotGenerator] Ollama refinement failed, using raw post');
        return rawPost;
      }

      const data = await response.json();
      const refinedText = data.response;

      // Parse title and body
      const titleMatch = refinedText.match(/TITLE:\s*(.+?)(?=\nBODY:|$)/s);
      const bodyMatch = refinedText.match(/BODY:\s*(.+)/s);

      return {
        title: titleMatch ? titleMatch[1].trim() : rawPost.title,
        body: bodyMatch ? bodyMatch[1].trim() : rawPost.body
      };

    } catch (error) {
      console.warn('[LoreBotGenerator] Ollama refinement error:', error.message);
      return rawPost;
    }
  }

  /**
   * Add bot disclosure footer
   */
  addBotDisclosure(post) {
    const disclosure = '\n\n---\n\n*🤖 This post was generated by an AI bot based on video game lore. Responses and engagement are welcome! This is marked as bot content for transparency.*';

    return {
      title: post.title,
      body: post.body + disclosure
    };
  }

  /**
   * Save post to database
   */
  async savePost(data) {
    const result = await this.db.query(`
      INSERT INTO game_lore_bot_posts
      (domain, game_id, template_id, title, body, variables_used, marked_as_bot)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING *
    `, [
      data.domain,
      data.gameId,
      data.templateId,
      data.title,
      data.body,
      JSON.stringify(data.variablesUsed)
    ]);

    // Increment template used_count
    await this.db.query(
      'UPDATE game_lore_discussion_templates SET used_count = used_count + 1 WHERE id = $1',
      [data.templateId]
    );

    return result.rows[0];
  }

  /**
   * Post to forum
   */
  async postToForum(data) {
    if (!this.forumManager) {
      throw new Error('[LoreBotGenerator] Forum manager not configured');
    }

    const thread = await this.forumManager.createThread({
      userId: 'bot',
      userName: 'Lore Discussion Bot',
      title: data.title,
      body: data.body,
      tags: [data.gameSlug, 'lore', 'discussion', 'bot-generated'],
      flair: '🤖 Bot Generated'
    });

    return thread;
  }

  /**
   * Link bot post to forum thread
   */
  async linkBotPostToThread(botPostId, threadId) {
    await this.db.query(
      'UPDATE game_lore_bot_posts SET thread_id = $1 WHERE id = $2',
      [threadId, botPostId]
    );
  }

  /**
   * Generate multiple posts in batch
   */
  async generateBatch(count, options = {}) {
    const posts = [];

    for (let i = 0; i < count; i++) {
      // Add random delay between posts (30-120 seconds)
      if (i > 0) {
        const delay = 30000 + Math.random() * 90000;
        console.log(`[LoreBotGenerator] Waiting ${Math.floor(delay / 1000)}s before next post...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      try {
        const post = await this.generatePost(options);
        posts.push(post);
      } catch (error) {
        console.error('[LoreBotGenerator] Batch generation error:', error.message);
      }
    }

    return posts;
  }

  /**
   * Get bot statistics
   */
  async getStats() {
    const result = await this.db.query(`
      SELECT
        COUNT(*) as total_posts,
        SUM(upvotes) as total_upvotes,
        SUM(downvotes) as total_downvotes,
        SUM(comment_count) as total_comments,
        AVG(engagement_score) as avg_engagement,
        COUNT(DISTINCT domain) as domains_used,
        COUNT(DISTINCT game_id) as games_used
      FROM game_lore_bot_posts
    `);

    return result.rows[0];
  }
}

module.exports = LoreBotGenerator;
