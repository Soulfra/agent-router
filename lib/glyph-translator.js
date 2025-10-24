/**
 * Glyph Translator
 *
 * Translates between database foreign keys, cryptographic hashes,
 * and human-readable semantic meanings
 *
 * Features:
 * - Foreign key ID → Semantic label ("user_id: 42" → "CalRiven")
 * - Vault namespace → Human description ("calriven:research:2025" → "CalRiven's 2025 research data")
 * - Old terminology → Modern context ("piracy" → "historical maritime theft" vs "software copyright infringement")
 * - Database glyphs → English explanations
 *
 * Use Cases:
 * - User sees "vault_id: f3a2b1c9..." → Translate to "Your encrypted API keys"
 * - System logs "FK violation on table 42" → Translate to "Error: User 'CalRiven' references missing tenant"
 * - Query mentions "pirate treasure" → Disambiguate: historical treasure vs. stolen NFTs
 *
 * Example:
 *   const translator = new GlyphTranslator({ db });
 *   const label = await translator.translate('user_id', 42);
 *   // → "CalRiven (calriven@example.com)"
 */

class GlyphTranslator {
  constructor(options = {}) {
    this.config = {
      db: options.db,
      cache: new Map(), // In-memory cache for translations
      cacheTTL: options.cacheTTL || 3600000 // 1 hour
    };

    // Namespace semantic mappings
    this.namespaceMappings = {
      'api_keys': 'API credentials',
      'oauth_tokens': 'OAuth authentication tokens',
      'research': 'Research data',
      'preferences': 'User preferences',
      'gaming': 'Game-related data',
      'identity': 'Identity verification data',
      'articles': 'Published articles',
      'comments': 'User comments'
    };

    // Contextual disambiguation for ambiguous terms
    this.contextualMappings = {
      'piracy': {
        historical: 'Maritime theft by pirates (1600s-1800s)',
        modern: 'Software/media copyright infringement',
        default: 'Unauthorized use of copyrighted material'
      },
      'treasure': {
        historical: 'Gold, jewels, artifacts from shipwrecks',
        modern: 'Valuable digital assets (NFTs, crypto)',
        default: 'Something of great value'
      },
      'vault': {
        security: 'Encrypted data storage',
        banking: 'Secure room for valuables',
        default: 'Secure storage system'
      },
      'key': {
        cryptography: 'Cryptographic encryption key',
        database: 'Foreign key relationship',
        physical: 'Metal device that opens locks',
        default: 'Identifier or access token'
      }
    };

    console.log('[GlyphTranslator] Initialized');
  }

  /**
   * Translate foreign key ID to human-readable label
   */
  async translate(entityType, id, options = {}) {
    const cacheKey = `${entityType}:${id}`;

    // Check cache
    const cached = this._checkCache(cacheKey);
    if (cached && !options.forceRefresh) {
      return cached;
    }

    // Translate based on entity type
    let translation;

    switch (entityType) {
      case 'user_id':
        translation = await this._translateUser(id);
        break;

      case 'tenant_id':
        translation = await this._translateTenant(id);
        break;

      case 'article_id':
        translation = await this._translateArticle(id);
        break;

      case 'vault_namespace':
        translation = this._translateNamespace(id);
        break;

      case 'vault_id':
        translation = await this._translateVaultEntry(id);
        break;

      default:
        translation = { id, type: entityType, label: `Unknown ${entityType}: ${id}` };
    }

    // Cache result
    this._cacheTranslation(cacheKey, translation);

    return translation;
  }

  /**
   * Translate user ID to name/email
   */
  async _translateUser(userId) {
    if (!this.config.db) {
      return { id: userId, type: 'user', label: `User ${userId}` };
    }

    try {
      const result = await this.config.db.query(
        'SELECT username, email FROM users WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];
        return {
          id: userId,
          type: 'user',
          label: `${user.username} (${user.email})`,
          username: user.username,
          email: user.email
        };
      }
    } catch (err) {
      console.error('[GlyphTranslator] User lookup failed:', err.message);
    }

    return { id: userId, type: 'user', label: `User ${userId}` };
  }

  /**
   * Translate tenant ID to organization name
   */
  async _translateTenant(tenantId) {
    if (!this.config.db) {
      return { id: tenantId, type: 'tenant', label: `Tenant ${tenantId}` };
    }

    try {
      const result = await this.config.db.query(
        'SELECT name, domain FROM tenants WHERE tenant_id = $1',
        [tenantId]
      );

      if (result.rows.length > 0) {
        const tenant = result.rows[0];
        return {
          id: tenantId,
          type: 'tenant',
          label: `${tenant.name} (${tenant.domain})`,
          name: tenant.name,
          domain: tenant.domain
        };
      }
    } catch (err) {
      console.error('[GlyphTranslator] Tenant lookup failed:', err.message);
    }

    return { id: tenantId, type: 'tenant', label: `Tenant ${tenantId}` };
  }

  /**
   * Translate article ID to title
   */
  async _translateArticle(articleId) {
    if (!this.config.db) {
      return { id: articleId, type: 'article', label: `Article ${articleId}` };
    }

    try {
      const result = await this.config.db.query(
        'SELECT title, published_at FROM author_articles WHERE article_id = $1',
        [articleId]
      );

      if (result.rows.length > 0) {
        const article = result.rows[0];
        return {
          id: articleId,
          type: 'article',
          label: `"${article.title}" (${new Date(article.published_at).toLocaleDateString()})`,
          title: article.title,
          publishedAt: article.published_at
        };
      }
    } catch (err) {
      console.error('[GlyphTranslator] Article lookup failed:', err.message);
    }

    return { id: articleId, type: 'article', label: `Article ${articleId}` };
  }

  /**
   * Translate vault namespace to description
   */
  _translateNamespace(namespace) {
    // Example: "calriven:research:2025" → "CalRiven's 2025 research data"

    const parts = namespace.split(':');
    const brand = parts[0] || 'Unknown';
    const category = parts[1] || 'data';
    const subcategory = parts[2] || '';

    const categoryLabel = this.namespaceMappings[category] || category;

    let label;
    if (subcategory) {
      label = `${brand}'s ${subcategory} ${categoryLabel}`;
    } else {
      label = `${brand}'s ${categoryLabel}`;
    }

    return {
      id: namespace,
      type: 'namespace',
      label,
      brand,
      category,
      subcategory
    };
  }

  /**
   * Translate vault entry ID to description
   */
  async _translateVaultEntry(vaultId) {
    if (!this.config.db) {
      return { id: vaultId, type: 'vault', label: `Vault entry ${vaultId}` };
    }

    try {
      const result = await this.config.db.query(
        'SELECT namespace, key, created_at FROM user_data_vault WHERE id = $1',
        [vaultId]
      );

      if (result.rows.length > 0) {
        const entry = result.rows[0];
        const nsTranslation = this._translateNamespace(entry.namespace);

        return {
          id: vaultId,
          type: 'vault',
          label: `${nsTranslation.label}: ${entry.key}`,
          namespace: entry.namespace,
          key: entry.key,
          createdAt: entry.created_at
        };
      }
    } catch (err) {
      console.error('[GlyphTranslator] Vault lookup failed:', err.message);
    }

    return { id: vaultId, type: 'vault', label: `Vault entry ${vaultId}` };
  }

  /**
   * Disambiguate term based on context
   */
  disambiguate(term, context = 'default') {
    const lowerTerm = term.toLowerCase();

    if (this.contextualMappings[lowerTerm]) {
      const mapping = this.contextualMappings[lowerTerm];
      return mapping[context] || mapping.default;
    }

    return term; // Return as-is if no mapping
  }

  /**
   * Translate entire sentence/phrase with disambiguation
   */
  translatePhrase(phrase, context = {}) {
    let translated = phrase;

    // Replace ambiguous terms with contextualized versions
    for (const [term, mappings] of Object.entries(this.contextualMappings)) {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');

      if (regex.test(phrase)) {
        const lowerPhrase = phrase.toLowerCase();

        // Detect context from phrase
        let detectedContext = 'default';

        if (term === 'piracy') {
          if (lowerPhrase.includes('1600') || lowerPhrase.includes('ship') || lowerPhrase.includes('treasure')) {
            detectedContext = 'historical';
          } else if (lowerPhrase.includes('software') || lowerPhrase.includes('download') || lowerPhrase.includes('torrent')) {
            detectedContext = 'modern';
          }
        }

        if (term === 'key') {
          if (lowerPhrase.includes('encrypt') || lowerPhrase.includes('aes') || lowerPhrase.includes('rsa')) {
            detectedContext = 'cryptography';
          } else if (lowerPhrase.includes('foreign') || lowerPhrase.includes('database') || lowerPhrase.includes('table')) {
            detectedContext = 'database';
          }
        }

        // Use provided context if available
        const finalContext = context[term] || detectedContext;
        const translation = mappings[finalContext] || mappings.default;

        // Replace first occurrence (to preserve case)
        translated = translated.replace(regex, `${term} (${translation})`);
      }
    }

    return translated;
  }

  /**
   * Cache management
   */
  _checkCache(key) {
    const cached = this.config.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
      return cached.data;
    }
    return null;
  }

  _cacheTranslation(key, data) {
    this.config.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.config.cache.clear();
    console.log('[GlyphTranslator] Cache cleared');
  }
}

module.exports = GlyphTranslator;
