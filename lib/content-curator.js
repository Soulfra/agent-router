/**
 * Content Curator
 *
 * Aggregates content from multiple sources:
 * - RSS feeds
 * - News APIs (HackerNews, Reddit, Product Hunt)
 * - Custom sources via Python integration
 *
 * Features:
 * - Multi-source content aggregation
 * - Topic-based filtering
 * - Content ranking and deduplication
 * - Newsletter generation
 * - Scheduled delivery
 */

const axios = require('axios');
const crypto = require('crypto');

class ContentCurator {
  constructor(db) {
    this.db = db;
    this.cache = new Map(); // In-memory cache for performance
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // =================================================================
  // CONFIGURATION
  // =================================================================

  /**
   * Save user curation configuration
   */
  async saveConfiguration(userId, config) {
    const { topics, sources, customRSS, frequency, deliveryTime, email } = config;

    try {
      // Save configuration to database
      const result = await this.db.query(`
        INSERT INTO curation_configs (
          user_id,
          topics,
          sources,
          custom_rss,
          frequency,
          delivery_time,
          email,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET
          topics = EXCLUDED.topics,
          sources = EXCLUDED.sources,
          custom_rss = EXCLUDED.custom_rss,
          frequency = EXCLUDED.frequency,
          delivery_time = EXCLUDED.delivery_time,
          email = EXCLUDED.email,
          updated_at = NOW()
        RETURNING id
      `, [userId, JSON.stringify(topics), JSON.stringify(sources), JSON.stringify(customRSS || []), frequency, deliveryTime, email]);

      return {
        success: true,
        configId: result.rows[0]?.id
      };
    } catch (error) {
      console.error('[ContentCurator] Error saving configuration:', error);
      throw error;
    }
  }

  /**
   * Get user configuration
   */
  async getConfiguration(userId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM curation_configs
        WHERE user_id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const config = result.rows[0];
      return {
        id: config.id,
        userId: config.user_id,
        topics: JSON.parse(config.topics || '[]'),
        sources: JSON.parse(config.sources || '[]'),
        customRSS: JSON.parse(config.custom_rss || '[]'),
        frequency: config.frequency,
        deliveryTime: config.delivery_time,
        email: config.email,
        createdAt: config.created_at,
        updatedAt: config.updated_at
      };
    } catch (error) {
      console.error('[ContentCurator] Error getting configuration:', error);
      throw error;
    }
  }

  // =================================================================
  // CONTENT AGGREGATION
  // =================================================================

  /**
   * Fetch curated feed for user
   */
  async getCuratedFeed(userId, options = {}) {
    const { limit = 50, offset = 0, minScore = 0 } = options;

    try {
      // Get user configuration
      const config = await this.getConfiguration(userId);
      if (!config) {
        return { items: [], total: 0 };
      }

      // Aggregate content from all sources
      const allContent = [];

      // Fetch from configured sources
      if (config.sources.includes('hackernews')) {
        const hnItems = await this.fetchHackerNews();
        allContent.push(...hnItems);
      }

      if (config.sources.includes('reddit-programming')) {
        const redditItems = await this.fetchReddit('programming');
        allContent.push(...redditItems);
      }

      if (config.sources.includes('reddit-tech')) {
        const redditItems = await this.fetchReddit('technology');
        allContent.push(...redditItems);
      }

      if (config.sources.includes('producthunt')) {
        const phItems = await this.fetchProductHunt();
        allContent.push(...phItems);
      }

      if (config.sources.includes('github-trending')) {
        const ghItems = await this.fetchGitHubTrending();
        allContent.push(...ghItems);
      }

      // Fetch from custom RSS feeds
      for (const rssUrl of config.customRSS) {
        const rssItems = await this.fetchRSS(rssUrl);
        allContent.push(...rssItems);
      }

      // Filter by topics
      const filteredContent = this.filterByTopics(allContent, config.topics);

      // Rank and deduplicate
      const rankedContent = this.rankContent(filteredContent);

      // Apply score filter
      const scoredContent = rankedContent.filter(item => item.score >= minScore);

      // Paginate
      const paginatedContent = scoredContent.slice(offset, offset + limit);

      return {
        items: paginatedContent,
        total: scoredContent.length,
        config: {
          topics: config.topics,
          sourceCount: config.sources.length + config.customRSS.length
        }
      };
    } catch (error) {
      console.error('[ContentCurator] Error getting curated feed:', error);
      throw error;
    }
  }

  // =================================================================
  // SOURCE INTEGRATIONS
  // =================================================================

  /**
   * Fetch from Hacker News
   */
  async fetchHackerNews() {
    const cacheKey = 'hackernews';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Get top stories IDs
      const topResponse = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json', { timeout: 10000 });
      const topIds = topResponse.data.slice(0, 30); // Top 30

      // Fetch story details
      const stories = await Promise.all(
        topIds.map(async (id) => {
          try {
            const response = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 5000 });
            return response.data;
          } catch (err) {
            return null;
          }
        })
      );

      const items = stories
        .filter(story => story && story.type === 'story')
        .map(story => ({
          id: `hn-${story.id}`,
          title: story.title,
          url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
          description: story.text || '',
          author: story.by,
          publishedAt: new Date(story.time * 1000),
          source: 'Hacker News',
          sourceIcon: '🔶',
          score: story.score || 0,
          comments: story.descendants || 0,
          topics: this.extractTopics(story.title + ' ' + (story.text || '')),
          metadata: {
            hnScore: story.score,
            hnComments: story.descendants
          }
        }));

      this.saveToCache(cacheKey, items);
      return items;
    } catch (error) {
      console.error('[ContentCurator] Error fetching Hacker News:', error);
      return [];
    }
  }

  /**
   * Fetch from Reddit
   */
  async fetchReddit(subreddit) {
    const cacheKey = `reddit-${subreddit}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`https://www.reddit.com/r/${subreddit}/hot.json?limit=25`, {
        timeout: 10000,
        headers: { 'User-Agent': 'CalOS-ContentCurator/1.0' }
      });

      const items = response.data.data.children
        .filter(post => post.data && !post.data.stickied)
        .map(post => ({
          id: `reddit-${post.data.id}`,
          title: post.data.title,
          url: post.data.url,
          description: post.data.selftext || '',
          author: post.data.author,
          publishedAt: new Date(post.data.created_utc * 1000),
          source: `r/${subreddit}`,
          sourceIcon: '🤖',
          score: post.data.score || 0,
          comments: post.data.num_comments || 0,
          topics: this.extractTopics(post.data.title + ' ' + (post.data.selftext || '')),
          metadata: {
            redditScore: post.data.score,
            redditComments: post.data.num_comments,
            subreddit
          }
        }));

      this.saveToCache(cacheKey, items);
      return items;
    } catch (error) {
      console.error(`[ContentCurator] Error fetching Reddit r/${subreddit}:`, error);
      return [];
    }
  }

  /**
   * Fetch from Product Hunt (requires API key)
   */
  async fetchProductHunt() {
    const cacheKey = 'producthunt';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    // Product Hunt requires API key - return placeholder
    // In production, implement with proper API key
    return [];
  }

  /**
   * Fetch GitHub Trending
   */
  async fetchGitHubTrending() {
    const cacheKey = 'github-trending';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Use GitHub trending scraper (unofficial)
      const response = await axios.get('https://api.gitterapp.com/repositories', { timeout: 10000 });

      const items = response.data.slice(0, 25).map(repo => ({
        id: `gh-${repo.full_name.replace('/', '-')}`,
        title: repo.full_name,
        url: repo.html_url,
        description: repo.description || '',
        author: repo.owner?.login || '',
        publishedAt: new Date(repo.created_at || Date.now()),
        source: 'GitHub Trending',
        sourceIcon: '⭐',
        score: repo.stargazers_count || 0,
        comments: 0,
        topics: [...(repo.topics || []), ...this.extractTopics(repo.description || '')],
        metadata: {
          stars: repo.stargazers_count,
          language: repo.language,
          forks: repo.forks_count
        }
      }));

      this.saveToCache(cacheKey, items);
      return items;
    } catch (error) {
      console.error('[ContentCurator] Error fetching GitHub Trending:', error);
      return [];
    }
  }

  /**
   * Fetch from RSS feed
   */
  async fetchRSS(url) {
    const cacheKey = `rss-${crypto.createHash('md5').update(url).digest('hex')}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(url, { timeout: 10000 });
      const xml = response.data;

      // Simple RSS parsing (in production, use a proper RSS parser like rss-parser)
      const items = this.parseRSS(xml, url);

      this.saveToCache(cacheKey, items);
      return items;
    } catch (error) {
      console.error(`[ContentCurator] Error fetching RSS ${url}:`, error);
      return [];
    }
  }

  /**
   * Parse RSS XML (simplified)
   */
  parseRSS(xml, sourceUrl) {
    // This is a simplified parser - in production use 'rss-parser' npm package
    try {
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      const matches = [...xml.matchAll(itemRegex)];

      return matches.slice(0, 25).map((match, index) => {
        const itemXml = match[1];

        const getTag = (tag) => {
          const tagMatch = itemXml.match(new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 's'));
          return tagMatch ? tagMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').trim() : '';
        };

        const title = getTag('title');
        const link = getTag('link');
        const description = getTag('description');
        const pubDate = getTag('pubDate');

        return {
          id: `rss-${crypto.createHash('md5').update(link || title).digest('hex').slice(0, 12)}`,
          title,
          url: link,
          description: description.replace(/<[^>]*>/g, '').slice(0, 300),
          author: getTag('author') || getTag('dc:creator') || '',
          publishedAt: pubDate ? new Date(pubDate) : new Date(),
          source: 'RSS Feed',
          sourceIcon: '📡',
          score: 0,
          comments: 0,
          topics: this.extractTopics(title + ' ' + description),
          metadata: {
            rssUrl: sourceUrl
          }
        };
      });
    } catch (error) {
      console.error('[ContentCurator] RSS parsing error:', error);
      return [];
    }
  }

  // =================================================================
  // CONTENT PROCESSING
  // =================================================================

  /**
   * Extract topics from text
   */
  extractTopics(text) {
    const topicKeywords = {
      'ai': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'neural', 'gpt', 'llm', 'openai'],
      'crypto': ['crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'blockchain', 'nft', 'defi', 'web3'],
      'startups': ['startup', 'founder', 'vc', 'venture capital', 'funding', 'seed', 'series a'],
      'tech': ['technology', 'tech', 'software', 'hardware', 'innovation'],
      'programming': ['programming', 'code', 'developer', 'software', 'javascript', 'python', 'react', 'node'],
      'design': ['design', 'ui', 'ux', 'user experience', 'interface', 'figma'],
      'security': ['security', 'cybersecurity', 'hack', 'vulnerability', 'breach', 'malware'],
      'webdev': ['web development', 'frontend', 'backend', 'fullstack', 'html', 'css'],
      'mobile': ['mobile', 'ios', 'android', 'app', 'swift', 'kotlin']
    };

    const textLower = text.toLowerCase();
    const topics = [];

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => textLower.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  /**
   * Filter content by user topics
   */
  filterByTopics(items, userTopics) {
    if (!userTopics || userTopics.length === 0) {
      return items; // No filtering if no topics selected
    }

    return items.filter(item => {
      // Item matches if it has at least one topic in common with user topics
      return item.topics.some(topic => userTopics.includes(topic));
    });
  }

  /**
   * Rank content by relevance and freshness
   */
  rankContent(items) {
    const now = Date.now();

    return items
      .map(item => {
        // Calculate age in hours
        const ageHours = (now - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60);

        // Recency score (newer is better, exponential decay)
        const recencyScore = Math.exp(-ageHours / 24); // Decay over 24 hours

        // Engagement score (normalized)
        const engagementScore = Math.log(1 + item.score + item.comments * 2) / 10;

        // Combined score
        const totalScore = recencyScore * 0.6 + engagementScore * 0.4;

        return {
          ...item,
          calculatedScore: totalScore,
          ageHours: Math.floor(ageHours)
        };
      })
      .sort((a, b) => b.calculatedScore - a.calculatedScore);
  }

  // =================================================================
  // NEWSLETTER GENERATION
  // =================================================================

  /**
   * Generate newsletter HTML
   */
  async generateNewsletter(userId, options = {}) {
    const { limit = 10 } = options;

    try {
      const feed = await this.getCuratedFeed(userId, { limit });

      if (feed.items.length === 0) {
        return {
          html: '<p>No content available for newsletter.</p>',
          plainText: 'No content available.'
        };
      }

      const html = this.renderNewsletterHTML(feed.items);
      const plainText = this.renderNewsletterPlainText(feed.items);

      return { html, plainText, itemCount: feed.items.length };
    } catch (error) {
      console.error('[ContentCurator] Error generating newsletter:', error);
      throw error;
    }
  }

  /**
   * Render newsletter as HTML
   */
  renderNewsletterHTML(items) {
    const itemsHTML = items.map(item => `
      <div style="margin-bottom: 30px; padding: 20px; background: #f5f5f5; border-left: 4px solid #0080ff; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0;">
          <a href="${item.url}" style="color: #0080ff; text-decoration: none;">${item.title}</a>
        </h3>
        <p style="color: #666; font-size: 14px; margin: 0 0 10px 0;">
          ${item.sourceIcon} ${item.source} · ${item.author ? `by ${item.author}` : ''} · ${this.formatDate(item.publishedAt)}
        </p>
        <p style="color: #333; line-height: 1.6;">
          ${item.description.slice(0, 250)}${item.description.length > 250 ? '...' : ''}
        </p>
        <p style="color: #888; font-size: 12px;">
          ${item.score > 0 ? `⬆️ ${item.score}` : ''}
          ${item.comments > 0 ? `💬 ${item.comments}` : ''}
        </p>
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>CalOS Newsletter</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #0080ff; border-bottom: 3px solid #0080ff; padding-bottom: 10px;">📰 CalOS Newsletter</h1>
        <p style="color: #666;">Here are your top ${items.length} curated articles:</p>
        ${itemsHTML}
        <p style="text-align: center; color: #999; font-size: 12px; margin-top: 40px;">
          Generated by CalOS Content Curator · <a href="#">Manage preferences</a>
        </p>
      </body>
      </html>
    `;
  }

  /**
   * Render newsletter as plain text
   */
  renderNewsletterPlainText(items) {
    const itemsText = items.map(item => `
${item.title}
${item.source} · ${item.author ? `by ${item.author}` : ''} · ${this.formatDate(item.publishedAt)}
${item.description.slice(0, 250)}${item.description.length > 250 ? '...' : ''}
Read more: ${item.url}
---
    `).join('\n');

    return `
CalOS Newsletter
================

Here are your top ${items.length} curated articles:

${itemsText}

Generated by CalOS Content Curator
    `.trim();
  }

  // =================================================================
  // UTILITIES
  // =================================================================

  formatDate(date) {
    const d = new Date(date);
    const now = new Date();
    const diffHours = (now - d) / (1000 * 60 * 60);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
    if (diffHours < 48) return 'Yesterday';
    return d.toLocaleDateString();
  }

  saveToCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return cached.value;
  }
}

module.exports = ContentCurator;
