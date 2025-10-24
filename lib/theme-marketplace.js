/**
 * Theme Marketplace
 *
 * WordPress-style marketplace for CALOS themes, plugins, and automation workflows.
 *
 * Revenue Model:
 * - Free themes: Creator gets exposure, we get contribution (MIT license)
 * - Paid themes: 70% creator, 30% us (like iOS App Store)
 *
 * Features:
 * - Browse/search themes
 * - Install/uninstall themes
 * - Rate/review themes
 * - Submit themes (moderation queue)
 * - Revenue tracking (for paid themes)
 * - Version management
 * - Security scanning
 *
 * Theme Types:
 * - Visual themes (colors, fonts, layouts)
 * - Automation workflows (trigger → action chains)
 * - Context profiles (AI personas)
 * - Integration plugins (payment gateways, accounting, etc.)
 *
 * Self-Host vs Hosted:
 * - Self-hosted: Full access to marketplace, can submit themes
 * - Hosted (Free): Browse official themes only
 * - Hosted (Pro): Browse official + community themes, priority review
 * - Hosted (Enterprise): White-label, custom themes, private marketplace
 */

const crypto = require('crypto');
const semver = require('semver');

class ThemeMarketplace {
  constructor(config = {}) {
    this.db = config.db;
    this.verbose = config.verbose || false;

    // Marketplace configuration
    this.mode = config.mode || 'hosted'; // 'self-hosted', 'hosted'
    this.commissionRate = config.commissionRate || 0.30; // 30% for us, 70% for creator

    // Security
    this.enableSecurityScans = config.enableSecurityScans !== false;
    this.requireModeration = config.requireModeration !== false;

    if (!this.db) {
      throw new Error('Database connection required');
    }
  }

  // ============================================================================
  // THEME MANAGEMENT
  // ============================================================================

  /**
   * Get all themes (marketplace listing)
   *
   * @param {object} options - Query options
   * @returns {Promise<array>} - Themes
   */
  async getThemes(options = {}) {
    try {
      const {
        category = null,        // 'visual', 'automation', 'context', 'plugin'
        search = null,
        isPaid = null,          // true, false, null (all)
        sortBy = 'downloads',   // 'downloads', 'rating', 'created_at', 'price'
        sortOrder = 'DESC',
        limit = 50,
        offset = 0,
        featured = null
      } = options;

      let query = `
        SELECT
          t.theme_id,
          t.name,
          t.slug,
          t.description,
          t.category,
          t.version,
          t.author_id,
          t.author_name,
          t.price_cents,
          t.currency,
          t.is_free,
          t.featured,
          t.downloads,
          t.rating_avg,
          t.rating_count,
          t.screenshot_url,
          t.demo_url,
          t.repo_url,
          t.status,
          t.created_at,
          t.updated_at
        FROM marketplace_themes t
        WHERE t.status = 'published'
      `;

      const params = [];
      let paramIndex = 1;

      // Filter by category
      if (category) {
        query += ` AND t.category = $${paramIndex++}`;
        params.push(category);
      }

      // Filter by free/paid
      if (isPaid !== null) {
        query += ` AND t.is_free = $${paramIndex++}`;
        params.push(!isPaid);
      }

      // Filter by featured
      if (featured !== null) {
        query += ` AND t.featured = $${paramIndex++}`;
        params.push(featured);
      }

      // Search
      if (search) {
        query += ` AND (
          t.name ILIKE $${paramIndex}
          OR t.description ILIKE $${paramIndex}
          OR t.tags::text ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Sort
      const validSortFields = ['downloads', 'rating_avg', 'created_at', 'price_cents'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'downloads';
      query += ` ORDER BY ${sortField} ${sortOrder === 'ASC' ? 'ASC' : 'DESC'}`;

      // Pagination
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const result = await this.db.query(query, params);

      return result.rows.map(row => ({
        themeId: row.theme_id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        category: row.category,
        version: row.version,
        author: {
          id: row.author_id,
          name: row.author_name
        },
        price: row.is_free ? 0 : row.price_cents / 100,
        currency: row.currency,
        isFree: row.is_free,
        featured: row.featured,
        downloads: row.downloads,
        rating: {
          average: parseFloat(row.rating_avg || 0),
          count: row.rating_count
        },
        screenshotUrl: row.screenshot_url,
        demoUrl: row.demo_url,
        repoUrl: row.repo_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

    } catch (error) {
      console.error('[ThemeMarketplace] Get themes error:', error.message);
      throw error;
    }
  }

  /**
   * Get single theme details
   *
   * @param {string} themeSlug - Theme slug (e.g., 'soulfra-dark')
   * @returns {Promise<object>} - Theme details
   */
  async getTheme(themeSlug) {
    try {
      const result = await this.db.query(`
        SELECT
          t.*,
          u.full_name as author_full_name,
          u.avatar_url as author_avatar_url
        FROM marketplace_themes t
        LEFT JOIN users u ON t.author_id = u.user_id
        WHERE t.slug = $1
      `, [themeSlug]);

      if (result.rows.length === 0) {
        throw new Error('Theme not found');
      }

      const theme = result.rows[0];

      // Get reviews
      const reviewsResult = await this.db.query(`
        SELECT
          r.review_id,
          r.rating,
          r.review_text,
          r.created_at,
          u.full_name as reviewer_name,
          u.avatar_url as reviewer_avatar
        FROM marketplace_reviews r
        LEFT JOIN users u ON r.user_id = u.user_id
        WHERE r.theme_id = $1
        ORDER BY r.created_at DESC
        LIMIT 10
      `, [theme.theme_id]);

      return {
        themeId: theme.theme_id,
        name: theme.name,
        slug: theme.slug,
        description: theme.description,
        longDescription: theme.long_description,
        category: theme.category,
        version: theme.version,
        changelog: theme.changelog,
        author: {
          id: theme.author_id,
          name: theme.author_name,
          fullName: theme.author_full_name,
          avatarUrl: theme.author_avatar_url
        },
        price: theme.is_free ? 0 : theme.price_cents / 100,
        currency: theme.currency,
        isFree: theme.is_free,
        featured: theme.featured,
        downloads: theme.downloads,
        rating: {
          average: parseFloat(theme.rating_avg || 0),
          count: theme.rating_count
        },
        tags: theme.tags,
        screenshotUrl: theme.screenshot_url,
        screenshots: theme.screenshots,
        demoUrl: theme.demo_url,
        repoUrl: theme.repo_url,
        documentation: theme.documentation,
        dependencies: theme.dependencies,
        license: theme.license,
        status: theme.status,
        reviews: reviewsResult.rows,
        createdAt: theme.created_at,
        updatedAt: theme.updated_at
      };

    } catch (error) {
      console.error('[ThemeMarketplace] Get theme error:', error.message);
      throw error;
    }
  }

  /**
   * Install theme for user
   *
   * @param {string} userId - User ID
   * @param {string} themeSlug - Theme slug
   * @param {object} options - Install options
   * @returns {Promise<object>} - Installation result
   */
  async installTheme(userId, themeSlug, options = {}) {
    try {
      // Get theme
      const theme = await this.getTheme(themeSlug);

      // Check if already installed
      const installedResult = await this.db.query(`
        SELECT installation_id
        FROM marketplace_installations
        WHERE user_id = $1 AND theme_id = $2
      `, [userId, theme.themeId]);

      if (installedResult.rows.length > 0) {
        throw new Error('Theme already installed');
      }

      // Check if paid theme
      if (!theme.isFree) {
        // Verify user has purchased
        const purchaseResult = await this.db.query(`
          SELECT purchase_id
          FROM marketplace_purchases
          WHERE user_id = $1 AND theme_id = $2 AND status = 'completed'
        `, [userId, theme.themeId]);

        if (purchaseResult.rows.length === 0) {
          throw new Error('Theme not purchased. Please purchase before installing.');
        }
      }

      this._log(`Installing theme ${themeSlug} for user ${userId}...`);

      // Create installation record
      const installationId = `install_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      await this.db.query(`
        INSERT INTO marketplace_installations (
          installation_id,
          user_id,
          theme_id,
          version,
          status,
          installed_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        installationId,
        userId,
        theme.themeId,
        theme.version,
        'active'
      ]);

      // Increment download count
      await this.db.query(`
        UPDATE marketplace_themes
        SET downloads = downloads + 1
        WHERE theme_id = $1
      `, [theme.themeId]);

      this._log(`✅ Theme ${themeSlug} installed successfully`);

      return {
        success: true,
        installationId,
        theme: {
          id: theme.themeId,
          name: theme.name,
          version: theme.version
        }
      };

    } catch (error) {
      console.error('[ThemeMarketplace] Install theme error:', error.message);
      throw error;
    }
  }

  /**
   * Uninstall theme
   *
   * @param {string} userId - User ID
   * @param {string} themeSlug - Theme slug
   * @returns {Promise<object>} - Uninstall result
   */
  async uninstallTheme(userId, themeSlug) {
    try {
      const theme = await this.getTheme(themeSlug);

      const result = await this.db.query(`
        DELETE FROM marketplace_installations
        WHERE user_id = $1 AND theme_id = $2
        RETURNING installation_id
      `, [userId, theme.themeId]);

      if (result.rows.length === 0) {
        throw new Error('Theme not installed');
      }

      this._log(`Theme ${themeSlug} uninstalled for user ${userId}`);

      return {
        success: true,
        message: `Theme ${theme.name} uninstalled`
      };

    } catch (error) {
      console.error('[ThemeMarketplace] Uninstall theme error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // THEME SUBMISSION
  // ============================================================================

  /**
   * Submit theme to marketplace
   *
   * @param {string} userId - Author user ID
   * @param {object} themeData - Theme details
   * @returns {Promise<object>} - Submission result
   */
  async submitTheme(userId, themeData) {
    try {
      const {
        name,
        description,
        longDescription,
        category,           // 'visual', 'automation', 'context', 'plugin'
        version,
        changelog,
        price = 0,          // Price in USD (0 = free)
        tags = [],
        screenshotUrl,
        screenshots = [],
        demoUrl,
        repoUrl,
        documentation,
        dependencies = {},  // { "calos-core": ">=1.0.0", "node": ">=18" }
        license = 'MIT',
        themeManifest       // JSON manifest with theme config
      } = themeData;

      // Validate
      if (!name || !description || !category || !version) {
        throw new Error('Missing required fields: name, description, category, version');
      }

      // Validate semver
      if (!semver.valid(version)) {
        throw new Error('Invalid semantic version');
      }

      // Generate slug
      const slug = this._generateSlug(name);

      // Check if slug already exists
      const existingResult = await this.db.query(`
        SELECT theme_id FROM marketplace_themes WHERE slug = $1
      `, [slug]);

      if (existingResult.rows.length > 0) {
        throw new Error('Theme with this name already exists');
      }

      this._log(`Submitting theme: ${name} by user ${userId}...`);

      const themeId = `theme_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // Get author name
      const userResult = await this.db.query(`
        SELECT full_name FROM users WHERE user_id = $1
      `, [userId]);

      const authorName = userResult.rows[0]?.full_name || 'Unknown';

      // Create theme (pending moderation)
      await this.db.query(`
        INSERT INTO marketplace_themes (
          theme_id,
          name,
          slug,
          description,
          long_description,
          category,
          version,
          changelog,
          author_id,
          author_name,
          price_cents,
          currency,
          is_free,
          tags,
          screenshot_url,
          screenshots,
          demo_url,
          repo_url,
          documentation,
          dependencies,
          license,
          theme_manifest,
          status,
          submitted_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW())
      `, [
        themeId,
        name,
        slug,
        description,
        longDescription,
        category,
        version,
        changelog,
        userId,
        authorName,
        Math.round(price * 100), // Convert to cents
        'USD',
        price === 0,
        JSON.stringify(tags),
        screenshotUrl,
        JSON.stringify(screenshots),
        demoUrl,
        repoUrl,
        documentation,
        JSON.stringify(dependencies),
        license,
        JSON.stringify(themeManifest),
        this.requireModeration ? 'pending' : 'published'
      ]);

      this._log(`✅ Theme ${name} submitted (${this.requireModeration ? 'awaiting moderation' : 'published'})`);

      return {
        success: true,
        themeId,
        slug,
        status: this.requireModeration ? 'pending' : 'published',
        message: this.requireModeration
          ? 'Theme submitted for review. We\'ll notify you once it\'s approved.'
          : 'Theme published to marketplace!'
      };

    } catch (error) {
      console.error('[ThemeMarketplace] Submit theme error:', error.message);
      throw error;
    }
  }

  /**
   * Update existing theme
   *
   * @param {string} themeId - Theme ID
   * @param {string} userId - Author user ID
   * @param {object} updates - Theme updates
   * @returns {Promise<object>} - Update result
   */
  async updateTheme(themeId, userId, updates) {
    try {
      // Verify ownership
      const ownerResult = await this.db.query(`
        SELECT theme_id FROM marketplace_themes
        WHERE theme_id = $1 AND author_id = $2
      `, [themeId, userId]);

      if (ownerResult.rows.length === 0) {
        throw new Error('Theme not found or unauthorized');
      }

      const {
        description,
        longDescription,
        version,
        changelog,
        price,
        tags,
        screenshots,
        demoUrl,
        repoUrl,
        documentation,
        dependencies,
        themeManifest
      } = updates;

      // Build update query dynamically
      const setClauses = [];
      const values = [themeId];
      let paramIndex = 2;

      if (description !== undefined) {
        setClauses.push(`description = $${paramIndex++}`);
        values.push(description);
      }

      if (longDescription !== undefined) {
        setClauses.push(`long_description = $${paramIndex++}`);
        values.push(longDescription);
      }

      if (version !== undefined) {
        if (!semver.valid(version)) {
          throw new Error('Invalid semantic version');
        }
        setClauses.push(`version = $${paramIndex++}`);
        values.push(version);
      }

      if (changelog !== undefined) {
        setClauses.push(`changelog = $${paramIndex++}`);
        values.push(changelog);
      }

      if (price !== undefined) {
        setClauses.push(`price_cents = $${paramIndex++}`);
        values.push(Math.round(price * 100));
        setClauses.push(`is_free = $${paramIndex++}`);
        values.push(price === 0);
      }

      if (tags !== undefined) {
        setClauses.push(`tags = $${paramIndex++}`);
        values.push(JSON.stringify(tags));
      }

      if (screenshots !== undefined) {
        setClauses.push(`screenshots = $${paramIndex++}`);
        values.push(JSON.stringify(screenshots));
      }

      if (demoUrl !== undefined) {
        setClauses.push(`demo_url = $${paramIndex++}`);
        values.push(demoUrl);
      }

      if (repoUrl !== undefined) {
        setClauses.push(`repo_url = $${paramIndex++}`);
        values.push(repoUrl);
      }

      if (documentation !== undefined) {
        setClauses.push(`documentation = $${paramIndex++}`);
        values.push(documentation);
      }

      if (dependencies !== undefined) {
        setClauses.push(`dependencies = $${paramIndex++}`);
        values.push(JSON.stringify(dependencies));
      }

      if (themeManifest !== undefined) {
        setClauses.push(`theme_manifest = $${paramIndex++}`);
        values.push(JSON.stringify(themeManifest));
      }

      if (setClauses.length === 0) {
        throw new Error('No updates provided');
      }

      setClauses.push(`updated_at = NOW()`);

      const query = `
        UPDATE marketplace_themes
        SET ${setClauses.join(', ')}
        WHERE theme_id = $1
        RETURNING theme_id, version
      `;

      const result = await this.db.query(query, values);

      this._log(`Theme ${themeId} updated to version ${result.rows[0].version}`);

      return {
        success: true,
        themeId,
        version: result.rows[0].version
      };

    } catch (error) {
      console.error('[ThemeMarketplace] Update theme error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // REVIEWS & RATINGS
  // ============================================================================

  /**
   * Submit review for theme
   *
   * @param {string} userId - User ID
   * @param {string} themeSlug - Theme slug
   * @param {number} rating - Rating (1-5)
   * @param {string} reviewText - Review text
   * @returns {Promise<object>} - Review result
   */
  async submitReview(userId, themeSlug, rating, reviewText) {
    try {
      // Get theme
      const theme = await this.getTheme(themeSlug);

      // Check if user has installed theme
      const installedResult = await this.db.query(`
        SELECT installation_id
        FROM marketplace_installations
        WHERE user_id = $1 AND theme_id = $2
      `, [userId, theme.themeId]);

      if (installedResult.rows.length === 0) {
        throw new Error('You must install the theme before reviewing it');
      }

      // Check if already reviewed
      const existingReview = await this.db.query(`
        SELECT review_id
        FROM marketplace_reviews
        WHERE user_id = $1 AND theme_id = $2
      `, [userId, theme.themeId]);

      if (existingReview.rows.length > 0) {
        // Update existing review
        await this.db.query(`
          UPDATE marketplace_reviews
          SET rating = $1, review_text = $2, updated_at = NOW()
          WHERE review_id = $3
        `, [rating, reviewText, existingReview.rows[0].review_id]);

        this._log(`Review updated for theme ${themeSlug}`);
      } else {
        // Create new review
        const reviewId = `review_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        await this.db.query(`
          INSERT INTO marketplace_reviews (
            review_id,
            theme_id,
            user_id,
            rating,
            review_text,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [reviewId, theme.themeId, userId, rating, reviewText]);

        this._log(`Review submitted for theme ${themeSlug}`);
      }

      // Update theme rating average
      await this._updateThemeRating(theme.themeId);

      return {
        success: true,
        message: 'Review submitted'
      };

    } catch (error) {
      console.error('[ThemeMarketplace] Submit review error:', error.message);
      throw error;
    }
  }

  /**
   * Update theme rating average
   *
   * @param {string} themeId - Theme ID
   * @returns {Promise<void>}
   * @private
   */
  async _updateThemeRating(themeId) {
    try {
      const result = await this.db.query(`
        SELECT
          AVG(rating) as avg_rating,
          COUNT(*) as rating_count
        FROM marketplace_reviews
        WHERE theme_id = $1
      `, [themeId]);

      const avgRating = parseFloat(result.rows[0].avg_rating || 0);
      const ratingCount = parseInt(result.rows[0].rating_count || 0);

      await this.db.query(`
        UPDATE marketplace_themes
        SET rating_avg = $1, rating_count = $2
        WHERE theme_id = $3
      `, [avgRating, ratingCount, themeId]);

    } catch (error) {
      console.error('[ThemeMarketplace] Update theme rating error:', error.message);
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Generate URL-friendly slug from name
   *
   * @param {string} name - Theme name
   * @returns {string} - Slug
   * @private
   */
  _generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Log message if verbose mode enabled
   * @private
   */
  _log(message) {
    if (this.verbose) {
      console.log(`[ThemeMarketplace] ${message}`);
    }
  }
}

module.exports = ThemeMarketplace;
