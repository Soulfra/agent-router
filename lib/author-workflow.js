/**
 * Author Workflow Manager
 *
 * Complete pipeline for writing, testing, and publishing content:
 * 1. Write executable documentation (code + prose)
 * 2. Test documentation (verify code examples work)
 * 3. Publish to content system
 * 4. Generate RSS feed for subscribers
 * 5. Track reader engagement
 *
 * Integrates with:
 * - Content curation system (publishing)
 * - Forum system (reader feedback)
 * - Documentation routes (API docs)
 * - Test suite (executable docs validation)
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const marked = require('marked');
const SoulfraSigner = require('./soulfra-signer');

const execPromise = promisify(exec);

class AuthorWorkflow {
  constructor(options = {}) {
    this.db = options.db;
    this.contentDir = options.contentDir || './content';
    this.docsDir = options.docsDir || './docs';
    this.testDir = options.testDir || './test';

    // Initialize Soulfra cryptographic signer
    this.signer = new SoulfraSigner({
      includeTimestamp: true,
      includeAuthor: true,
      privateKey: options.calrivenPrivateKey || null, // CalRiven's Ed25519 private key
      publicKey: options.calrivenPublicKey || null    // CalRiven's Ed25519 public key
    });

    // Publishing configuration
    this.publishConfig = {
      autoPublish: options.autoPublish || false,
      requireTests: options.requireTests !== false,
      generateRSS: options.generateRSS !== false,
      signContent: options.signContent !== false // Enable Soulfra signatures
    };
  }

  /**
   * Create a new article draft
   * @param {object} article - Article metadata
   * @param {string} article.title - Article title
   * @param {string} article.slug - URL-friendly slug
   * @param {string} article.category - Content category
   * @param {string[]} article.tags - Tags
   * @param {string} article.content - Markdown content
   * @returns {Promise<object>} Draft article
   */
  async createDraft(article) {
    const now = new Date();
    const draft = {
      ...article,
      author_id: article.author_id || 1, // TODO: Get from auth context
      status: 'draft',
      created_at: now,
      updated_at: now,
      published_at: null,
      view_count: 0,
      word_count: this._countWords(article.content),
      reading_time_minutes: Math.ceil(this._countWords(article.content) / 200), // 200 WPM
      has_code: this._hasCodeBlocks(article.content),
      code_tested: false
    };

    // Sign the draft with Soulfra cryptographic signature
    if (this.publishConfig.signContent) {
      const signedDraft = this.signer.sign(
        { title: draft.title, content: draft.content, slug: draft.slug },
        { action: 'article_draft_created', author: 'calriven' }
      );
      draft.soulfra_hash = signedDraft.soulfraHash;
      draft.signed_metadata = signedDraft.metadata;
    }

    // Save to database
    const result = await this.db.query(
      `INSERT INTO author_articles (
        title, slug, category, tags, content, author_id, status,
        created_at, updated_at, word_count, reading_time_minutes,
        has_code, code_tested
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        draft.title,
        draft.slug,
        draft.category,
        draft.tags,
        draft.content,
        draft.author_id,
        draft.status,
        draft.created_at,
        draft.updated_at,
        draft.word_count,
        draft.reading_time_minutes,
        draft.has_code,
        draft.code_tested
      ]
    );

    console.log(`[AuthorWorkflow] Created draft: ${draft.title} (${draft.slug})`);

    return result.rows[0];
  }

  /**
   * Test code blocks in article
   * Extracts code examples and runs them
   * @param {number} articleId - Article ID
   * @returns {Promise<object>} Test results
   */
  async testArticle(articleId) {
    const article = await this._getArticle(articleId);

    if (!article.has_code) {
      console.log(`[AuthorWorkflow] No code to test in article ${articleId}`);
      return { success: true, tests: 0, message: 'No code to test' };
    }

    // Extract code blocks
    const codeBlocks = this._extractCodeBlocks(article.content);
    console.log(`[AuthorWorkflow] Found ${codeBlocks.length} code blocks`);

    const testResults = [];

    for (const block of codeBlocks) {
      try {
        const result = await this._runCodeBlock(block);
        testResults.push({
          language: block.language,
          success: true,
          output: result.stdout,
          error: null
        });
      } catch (error) {
        testResults.push({
          language: block.language,
          success: false,
          output: error.stdout || '',
          error: error.message
        });
      }
    }

    const allPassed = testResults.every(r => r.success);

    // Update article test status
    await this.db.query(
      `UPDATE author_articles SET code_tested = $1, updated_at = NOW()
       WHERE article_id = $2`,
      [allPassed, articleId]
    );

    return {
      success: allPassed,
      tests: testResults.length,
      passed: testResults.filter(r => r.success).length,
      failed: testResults.filter(r => !r.success).length,
      results: testResults
    };
  }

  /**
   * Publish article to production
   * @param {number} articleId - Article ID
   * @param {object} options - Publishing options
   * @returns {Promise<object>} Published article
   */
  async publish(articleId, options = {}) {
    const article = await this._getArticle(articleId);

    // Validation
    if (this.publishConfig.requireTests && article.has_code && !article.code_tested) {
      throw new Error('Article contains untested code. Run testArticle() first.');
    }

    if (article.status === 'published') {
      throw new Error('Article already published');
    }

    // Sign the published article with CalRiven's signature
    const published_at = new Date();
    let publicationSignature = null;

    if (this.publishConfig.signContent) {
      const signedPublication = this.signer.sign(
        {
          article_id: articleId,
          title: article.title,
          content: article.content,
          slug: article.slug,
          published_at: published_at.toISOString()
        },
        {
          action: 'article_published',
          author: 'calriven',
          platform: 'calriven.com'
        }
      );
      publicationSignature = signedPublication.soulfraHash;
      console.log(`[AuthorWorkflow] Article signed by CalRiven: ${publicationSignature.sha256.substring(0, 16)}...`);
    }

    await this.db.query(
      `UPDATE author_articles
       SET status = 'published', published_at = $1, updated_at = NOW()
       WHERE article_id = $2`,
      [published_at, articleId]
    );

    // Add to curated content
    await this.db.query(
      `INSERT INTO curated_content (
        external_id, title, url, description, content, source,
        author, icon, score, comments, topics, published_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        `author-${articleId}`,
        article.title,
        `/articles/${article.slug}`,
        article.content.substring(0, 200) + '...',
        article.content,
        'author',
        options.author_name || 'Author',
        '✍️',
        0,
        0,
        article.tags,
        published_at
      ]
    );

    // Generate RSS feed
    if (this.publishConfig.generateRSS) {
      await this._updateRSSFeed();
    }

    console.log(`[AuthorWorkflow] Published: ${article.title}`);

    return await this._getArticle(articleId);
  }

  /**
   * Generate RSS feed for all published articles
   * @returns {Promise<string>} RSS feed XML
   */
  async generateRSSFeed() {
    const RSS = require('rss');

    const articles = await this.db.query(
      `SELECT * FROM author_articles
       WHERE status = 'published'
       ORDER BY published_at DESC
       LIMIT 50`
    );

    const feed = new RSS({
      title: 'CALOS Author Blog',
      description: 'Technical articles and executable documentation',
      feed_url: 'http://localhost:3001/feed.xml',
      site_url: 'http://localhost:3001',
      language: 'en',
      pubDate: new Date(),
      ttl: 60
    });

    for (const article of articles.rows) {
      feed.item({
        title: article.title,
        description: article.content.substring(0, 300),
        url: `http://localhost:3001/articles/${article.slug}`,
        categories: [article.category, ...article.tags],
        author: 'Author',
        date: article.published_at
      });
    }

    const xml = feed.xml({ indent: true });

    // Save to file
    await fs.writeFile(path.join(this.contentDir, 'feed.xml'), xml);

    console.log(`[AuthorWorkflow] Generated RSS feed with ${articles.rows.length} articles`);

    return xml;
  }

  /**
   * Get article analytics
   * @param {number} articleId - Article ID
   * @returns {Promise<object>} Analytics data
   */
  async getAnalytics(articleId) {
    const article = await this._getArticle(articleId);

    // Get view count from reading history
    const views = await this.db.query(
      `SELECT COUNT(*) as count
       FROM curation_reading_history
       WHERE content_id IN (
         SELECT content_id FROM curated_content
         WHERE external_id = $1
       )`,
      [`author-${articleId}`]
    );

    // Get forum discussions
    const discussions = await this.db.query(
      `SELECT COUNT(*) as threads, SUM(comment_count) as comments
       FROM forum_threads
       WHERE content_id IN (
         SELECT content_id FROM curated_content
         WHERE external_id = $1
       )`,
      [`author-${articleId}`]
    );

    return {
      article_id: articleId,
      title: article.title,
      status: article.status,
      published_at: article.published_at,
      views: parseInt(views.rows[0].count),
      threads: parseInt(discussions.rows[0].threads || 0),
      comments: parseInt(discussions.rows[0].comments || 0),
      word_count: article.word_count,
      reading_time_minutes: article.reading_time_minutes
    };
  }

  // Private helpers

  async _getArticle(articleId) {
    const result = await this.db.query(
      `SELECT * FROM author_articles WHERE article_id = $1`,
      [articleId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Article ${articleId} not found`);
    }

    return result.rows[0];
  }

  _countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  _hasCodeBlocks(content) {
    return /```/.test(content);
  }

  _extractCodeBlocks(content) {
    const blocks = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      blocks.push({
        language: match[1] || 'text',
        code: match[2]
      });
    }

    return blocks;
  }

  async _runCodeBlock(block) {
    // Only run JavaScript/Node.js code for safety
    if (block.language !== 'javascript' && block.language !== 'js') {
      return { stdout: 'Skipped (only JS supported)', stderr: '' };
    }

    // Write code to temp file
    const tempFile = path.join('/tmp', `test-${Date.now()}.js`);
    await fs.writeFile(tempFile, block.code);

    try {
      const result = await execPromise(`node ${tempFile}`, {
        timeout: 5000
      });
      await fs.unlink(tempFile);
      return result;
    } catch (error) {
      await fs.unlink(tempFile);
      throw error;
    }
  }

  async _updateRSSFeed() {
    await this.generateRSSFeed();
  }
}

module.exports = AuthorWorkflow;
