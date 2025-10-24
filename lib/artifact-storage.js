/**
 * Artifact Storage
 *
 * Persistent storage for AI-generated code/artifacts
 * Links: prompt → reasoning → generated code → bucket → domain
 *
 * Key features:
 * - Save artifacts with full context
 * - Track artifact usage and ratings
 * - Manage artifact dependencies
 * - Organize artifacts into collections
 * - Query by bucket, domain, type, language
 */

const crypto = require('crypto');

class ArtifactStorage {
  constructor(options = {}) {
    this.db = options.db;

    if (!this.db) {
      throw new Error('Database connection required');
    }

    console.log('[ArtifactStorage] Initialized');
  }

  /**
   * Save artifact to database
   *
   * @param {object} artifact - Artifact data
   * @returns {Promise<string>} - artifactId
   */
  async saveArtifact(artifact) {
    const {
      bucketId,
      domainContext,
      domainUrl,
      artifactType,
      language,
      framework,
      code,
      artifactName,
      description,
      tags,
      originalPrompt,
      reasoningLogId,
      requestId,
      parentArtifactId,
      modelId,
      wrapperName,
      modelParameters,
      userRating,
      filePath,
      fileSize,
      mimeType,
      createdBy
    } = artifact;

    // Generate artifact ID
    const artifactId = `artifact_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Calculate code hash for deduplication
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    try {
      await this.db.query(`
        INSERT INTO bucket_artifacts (
          artifact_id,
          bucket_id,
          domain_context,
          domain_url,
          artifact_type,
          language,
          framework,
          code,
          code_hash,
          artifact_name,
          description,
          tags,
          original_prompt,
          reasoning_log_id,
          request_id,
          parent_artifact_id,
          model_id,
          wrapper_name,
          model_parameters,
          user_rating,
          file_path,
          file_size,
          mime_type,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24
        )
      `, [
        artifactId,
        bucketId,
        domainContext,
        domainUrl,
        artifactType,
        language,
        framework,
        code,
        codeHash,
        artifactName,
        description,
        tags,
        originalPrompt,
        reasoningLogId,
        requestId,
        parentArtifactId,
        modelId,
        wrapperName,
        modelParameters ? JSON.stringify(modelParameters) : null,
        userRating,
        filePath,
        fileSize,
        mimeType,
        createdBy
      ]);

      console.log(`[ArtifactStorage] Saved artifact: ${artifactId} (${artifactType})`);

      return artifactId;

    } catch (error) {
      console.error('[ArtifactStorage] Save error:', error.message);
      throw error;
    }
  }

  /**
   * Get artifact by ID
   */
  async getArtifact(artifactId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM bucket_artifacts
        WHERE artifact_id = $1
      `, [artifactId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this._formatArtifact(result.rows[0]);

    } catch (error) {
      console.error('[ArtifactStorage] Get error:', error.message);
      throw error;
    }
  }

  /**
   * Get artifacts by bucket
   */
  async getArtifactsByBucket(bucketId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      artifactType,
      language,
      status = 'active',
      isCurrent = true
    } = options;

    try {
      let query = `
        SELECT * FROM bucket_artifacts
        WHERE bucket_id = $1
          AND status = $2
          AND is_current = $3
      `;

      const params = [bucketId, status, isCurrent];
      let paramIndex = 4;

      if (artifactType) {
        query += ` AND artifact_type = $${paramIndex}`;
        params.push(artifactType);
        paramIndex++;
      }

      if (language) {
        query += ` AND language = $${paramIndex}`;
        params.push(language);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await this.db.query(query, params);

      return result.rows.map(row => this._formatArtifact(row));

    } catch (error) {
      console.error('[ArtifactStorage] Get by bucket error:', error.message);
      throw error;
    }
  }

  /**
   * Get artifacts by domain context
   */
  async getArtifactsByDomain(domainContext, options = {}) {
    const {
      limit = 50,
      offset = 0,
      artifactType,
      language,
      status = 'active',
      isCurrent = true
    } = options;

    try {
      let query = `
        SELECT * FROM bucket_artifacts
        WHERE domain_context = $1
          AND status = $2
          AND is_current = $3
      `;

      const params = [domainContext, status, isCurrent];
      let paramIndex = 4;

      if (artifactType) {
        query += ` AND artifact_type = $${paramIndex}`;
        params.push(artifactType);
        paramIndex++;
      }

      if (language) {
        query += ` AND language = $${paramIndex}`;
        params.push(language);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await this.db.query(query, params);

      return result.rows.map(row => this._formatArtifact(row));

    } catch (error) {
      console.error('[ArtifactStorage] Get by domain error:', error.message);
      throw error;
    }
  }

  /**
   * Search artifacts
   */
  async searchArtifacts(query, options = {}) {
    const {
      limit = 50,
      offset = 0,
      bucketId,
      domainContext,
      artifactType,
      language,
      status = 'active'
    } = options;

    try {
      let sqlQuery = `
        SELECT * FROM bucket_artifacts
        WHERE status = $1
          AND (
            artifact_name ILIKE $2
            OR description ILIKE $2
            OR original_prompt ILIKE $2
            OR $2 = ANY(tags)
          )
      `;

      const params = [status, `%${query}%`];
      let paramIndex = 3;

      if (bucketId) {
        sqlQuery += ` AND bucket_id = $${paramIndex}`;
        params.push(bucketId);
        paramIndex++;
      }

      if (domainContext) {
        sqlQuery += ` AND domain_context = $${paramIndex}`;
        params.push(domainContext);
        paramIndex++;
      }

      if (artifactType) {
        sqlQuery += ` AND artifact_type = $${paramIndex}`;
        params.push(artifactType);
        paramIndex++;
      }

      if (language) {
        sqlQuery += ` AND language = $${paramIndex}`;
        params.push(language);
        paramIndex++;
      }

      sqlQuery += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await this.db.query(sqlQuery, params);

      return result.rows.map(row => this._formatArtifact(row));

    } catch (error) {
      console.error('[ArtifactStorage] Search error:', error.message);
      throw error;
    }
  }

  /**
   * Log artifact usage
   */
  async logUsage(artifactId, usage) {
    const {
      usedBy,
      usageType,
      usedInRequestId,
      usedInSessionId,
      success = true,
      errorMessage,
      userFeedback,
      userRating
    } = usage;

    try {
      await this.db.query(`
        INSERT INTO artifact_usage_log (
          artifact_id,
          used_by,
          usage_type,
          used_in_request_id,
          used_in_session_id,
          success,
          error_message,
          user_feedback,
          user_rating
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        artifactId,
        usedBy,
        usageType,
        usedInRequestId,
        usedInSessionId,
        success,
        errorMessage,
        userFeedback,
        userRating
      ]);

      console.log(`[ArtifactStorage] Logged usage for: ${artifactId}`);

    } catch (error) {
      console.error('[ArtifactStorage] Log usage error:', error.message);
      throw error;
    }
  }

  /**
   * Add artifact dependency
   */
  async addDependency(artifactId, dependency) {
    const {
      dependsOnArtifactId,
      dependsOnExternal,
      dependencyType,
      required = true,
      optionalContext
    } = dependency;

    try {
      await this.db.query(`
        INSERT INTO artifact_dependencies (
          artifact_id,
          depends_on_artifact_id,
          depends_on_external,
          dependency_type,
          required,
          optional_context
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        artifactId,
        dependsOnArtifactId,
        dependsOnExternal,
        dependencyType,
        required,
        optionalContext
      ]);

      console.log(`[ArtifactStorage] Added dependency: ${artifactId} -> ${dependsOnArtifactId || dependsOnExternal}`);

    } catch (error) {
      console.error('[ArtifactStorage] Add dependency error:', error.message);
      throw error;
    }
  }

  /**
   * Get artifact dependencies
   */
  async getDependencies(artifactId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM artifact_dependencies
        WHERE artifact_id = $1
        ORDER BY created_at
      `, [artifactId]);

      return result.rows;

    } catch (error) {
      console.error('[ArtifactStorage] Get dependencies error:', error.message);
      throw error;
    }
  }

  /**
   * Create artifact collection
   */
  async createCollection(collection) {
    const {
      collectionName,
      collectionSlug,
      description,
      bucketId,
      domainContext,
      tags,
      category,
      visibility = 'private',
      createdBy
    } = collection;

    const collectionId = `collection_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      await this.db.query(`
        INSERT INTO artifact_collections (
          collection_id,
          collection_name,
          collection_slug,
          description,
          bucket_id,
          domain_context,
          tags,
          category,
          visibility,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        collectionId,
        collectionName,
        collectionSlug,
        description,
        bucketId,
        domainContext,
        tags,
        category,
        visibility,
        createdBy
      ]);

      console.log(`[ArtifactStorage] Created collection: ${collectionId}`);

      return collectionId;

    } catch (error) {
      console.error('[ArtifactStorage] Create collection error:', error.message);
      throw error;
    }
  }

  /**
   * Add artifact to collection
   */
  async addToCollection(collectionId, artifactId, options = {}) {
    const { position = 0, addedBy } = options;

    try {
      await this.db.query(`
        INSERT INTO artifact_collection_members (
          collection_id,
          artifact_id,
          position,
          added_by
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (collection_id, artifact_id) DO UPDATE
          SET position = $3
      `, [collectionId, artifactId, position, addedBy]);

      console.log(`[ArtifactStorage] Added to collection: ${artifactId} -> ${collectionId}`);

    } catch (error) {
      console.error('[ArtifactStorage] Add to collection error:', error.message);
      throw error;
    }
  }

  /**
   * Get collection with artifacts
   */
  async getCollection(collectionId) {
    try {
      // Get collection metadata
      const collResult = await this.db.query(`
        SELECT * FROM artifact_collections
        WHERE collection_id = $1
      `, [collectionId]);

      if (collResult.rows.length === 0) {
        return null;
      }

      const collection = collResult.rows[0];

      // Get collection members
      const membersResult = await this.db.query(`
        SELECT ba.*, acm.position
        FROM artifact_collection_members acm
        JOIN bucket_artifacts ba ON acm.artifact_id = ba.artifact_id
        WHERE acm.collection_id = $1
        ORDER BY acm.position, ba.created_at DESC
      `, [collectionId]);

      collection.artifacts = membersResult.rows.map(row => this._formatArtifact(row));
      collection.artifact_count = membersResult.rows.length;

      return collection;

    } catch (error) {
      console.error('[ArtifactStorage] Get collection error:', error.message);
      throw error;
    }
  }

  /**
   * Get popular artifacts
   */
  async getPopularArtifacts(options = {}) {
    const {
      limit = 20,
      domainContext,
      artifactType,
      minUsage = 1
    } = options;

    try {
      let query = `
        SELECT ba.*, COUNT(aul.id) as usage_count
        FROM bucket_artifacts ba
        LEFT JOIN artifact_usage_log aul ON ba.artifact_id = aul.artifact_id
        WHERE ba.status = 'active' AND ba.is_current = true
          AND ba.times_used >= $1
      `;

      const params = [minUsage];
      let paramIndex = 2;

      if (domainContext) {
        query += ` AND ba.domain_context = $${paramIndex}`;
        params.push(domainContext);
        paramIndex++;
      }

      if (artifactType) {
        query += ` AND ba.artifact_type = $${paramIndex}`;
        params.push(artifactType);
        paramIndex++;
      }

      query += `
        GROUP BY ba.artifact_id
        ORDER BY ba.times_used DESC, usage_count DESC
        LIMIT $${paramIndex}
      `;
      params.push(limit);

      const result = await this.db.query(query, params);

      return result.rows.map(row => this._formatArtifact(row));

    } catch (error) {
      console.error('[ArtifactStorage] Get popular artifacts error:', error.message);
      throw error;
    }
  }

  /**
   * Update artifact rating
   */
  async updateRating(artifactId, rating) {
    try {
      await this.db.query(`
        UPDATE bucket_artifacts
        SET user_rating = $2
        WHERE artifact_id = $1
      `, [artifactId, rating]);

      console.log(`[ArtifactStorage] Updated rating: ${artifactId} -> ${rating}`);

    } catch (error) {
      console.error('[ArtifactStorage] Update rating error:', error.message);
      throw error;
    }
  }

  /**
   * Mark artifact as modified
   */
  async markModified(artifactId) {
    try {
      await this.db.query(`
        UPDATE bucket_artifacts
        SET
          times_modified = times_modified + 1,
          last_modified_at = NOW()
        WHERE artifact_id = $1
      `, [artifactId]);

    } catch (error) {
      console.error('[ArtifactStorage] Mark modified error:', error.message);
      throw error;
    }
  }

  /**
   * Archive artifact
   */
  async archiveArtifact(artifactId) {
    try {
      await this.db.query(`
        UPDATE bucket_artifacts
        SET status = 'archived', is_current = false
        WHERE artifact_id = $1
      `, [artifactId]);

      console.log(`[ArtifactStorage] Archived: ${artifactId}`);

    } catch (error) {
      console.error('[ArtifactStorage] Archive error:', error.message);
      throw error;
    }
  }

  /**
   * Get artifact statistics
   */
  async getStatistics(bucketId = null) {
    try {
      let query = `
        SELECT
          COUNT(*) as total_artifacts,
          COUNT(DISTINCT domain_context) as unique_domains,
          COUNT(DISTINCT artifact_type) as unique_types,
          COUNT(DISTINCT language) as unique_languages,
          AVG(user_rating) as avg_rating,
          SUM(times_used) as total_uses
        FROM bucket_artifacts
        WHERE status = 'active' AND is_current = true
      `;

      const params = [];

      if (bucketId) {
        query += ' AND bucket_id = $1';
        params.push(bucketId);
      }

      const result = await this.db.query(query, params);

      return result.rows[0];

    } catch (error) {
      console.error('[ArtifactStorage] Get statistics error:', error.message);
      throw error;
    }
  }

  /**
   * Format artifact row
   * @private
   */
  _formatArtifact(row) {
    return {
      artifactId: row.artifact_id,
      bucketId: row.bucket_id,
      domainContext: row.domain_context,
      domainUrl: row.domain_url,
      artifactType: row.artifact_type,
      language: row.language,
      framework: row.framework,
      code: row.code,
      codeHash: row.code_hash,
      artifactName: row.artifact_name,
      description: row.description,
      tags: row.tags,
      originalPrompt: row.original_prompt,
      reasoningLogId: row.reasoning_log_id,
      requestId: row.request_id,
      parentArtifactId: row.parent_artifact_id,
      modelId: row.model_id,
      wrapperName: row.wrapper_name,
      modelParameters: row.model_parameters,
      userRating: row.user_rating,
      timesUsed: row.times_used,
      timesModified: row.times_modified,
      successScore: row.success_score,
      version: row.version,
      isCurrent: row.is_current,
      supersededBy: row.superseded_by,
      filePath: row.file_path,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      status: row.status,
      visibility: row.visibility,
      lastUsedAt: row.last_used_at,
      lastModifiedAt: row.last_modified_at,
      createdAt: row.created_at,
      createdBy: row.created_by,
      updatedAt: row.updated_at
    };
  }
}

module.exports = ArtifactStorage;
