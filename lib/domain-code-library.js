/**
 * Domain Code Library
 *
 * Manages domain-specific code patterns and examples
 * NOT user repos, but AI-generated design patterns per domain
 *
 * Key features:
 * - Store domain-specific code patterns
 * - Manage style guides per domain
 * - Track anti-patterns (what NOT to do)
 * - Build knowledge graph of pattern relationships
 * - Get recommended patterns for use cases
 */

const crypto = require('crypto');

class DomainCodeLibrary {
  constructor(options = {}) {
    this.db = options.db;

    if (!this.db) {
      throw new Error('Database connection required');
    }

    console.log('[DomainCodeLibrary] Initialized');
  }

  /**
   * Add code example to domain library
   */
  async addExample(example) {
    const {
      domainContext,
      domainUrl,
      patternName,
      patternCategory,
      patternType,
      language,
      framework,
      code,
      title,
      description,
      usageNotes,
      exampleUsage,
      useCases,
      tags,
      relatedPatterns,
      originalPrompt,
      generatedByModel,
      generatedFromArtifactId,
      complexityScore,
      maintainabilityScore,
      domainStyle,
      domainConventions,
      createdBy
    } = example;

    const exampleId = `example_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    try {
      await this.db.query(`
        INSERT INTO domain_code_examples (
          example_id,
          domain_context,
          domain_url,
          pattern_name,
          pattern_category,
          pattern_type,
          language,
          framework,
          code,
          code_hash,
          title,
          description,
          usage_notes,
          example_usage,
          use_cases,
          tags,
          related_patterns,
          original_prompt,
          generated_by_model,
          generated_from_artifact_id,
          complexity_score,
          maintainability_score,
          domain_style,
          domain_conventions,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25
        )
      `, [
        exampleId,
        domainContext,
        domainUrl,
        patternName,
        patternCategory,
        patternType,
        language,
        framework,
        code,
        codeHash,
        title,
        description,
        usageNotes,
        exampleUsage,
        useCases,
        tags,
        relatedPatterns,
        originalPrompt,
        generatedByModel,
        generatedFromArtifactId,
        complexityScore,
        maintainabilityScore,
        domainStyle ? JSON.stringify(domainStyle) : null,
        domainConventions ? JSON.stringify(domainConventions) : null,
        createdBy
      ]);

      console.log(`[DomainCodeLibrary] Added example: ${exampleId} (${patternName})`);

      return exampleId;

    } catch (error) {
      console.error('[DomainCodeLibrary] Add example error:', error.message);
      throw error;
    }
  }

  /**
   * Get recommended patterns for domain + use case
   */
  async getRecommendedPatterns(domainContext, options = {}) {
    const {
      language,
      useCase,
      patternCategory,
      limit = 20
    } = options;

    try {
      const result = await this.db.query(`
        SELECT * FROM get_domain_patterns($1, $2, $3)
        LIMIT $4
      `, [domainContext, language, useCase, limit]);

      return result.rows;

    } catch (error) {
      console.error('[DomainCodeLibrary] Get patterns error:', error.message);
      throw error;
    }
  }

  /**
   * Get pattern by ID
   */
  async getPattern(exampleId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM domain_code_examples
        WHERE example_id = $1
      `, [exampleId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('[DomainCodeLibrary] Get pattern error:', error.message);
      throw error;
    }
  }

  /**
   * Search patterns
   */
  async searchPatterns(query, options = {}) {
    const {
      domainContext,
      language,
      patternCategory,
      limit = 50
    } = options;

    try {
      let sqlQuery = `
        SELECT * FROM domain_code_examples
        WHERE status = 'active' AND is_current = true
          AND (
            title ILIKE $1
            OR description ILIKE $1
            OR pattern_name ILIKE $1
            OR $2 = ANY(tags)
            OR $2 = ANY(use_cases)
          )
      `;

      const params = [`%${query}%`, query];
      let paramIndex = 3;

      if (domainContext) {
        sqlQuery += ` AND domain_context = $${paramIndex}`;
        params.push(domainContext);
        paramIndex++;
      }

      if (language) {
        sqlQuery += ` AND language = $${paramIndex}`;
        params.push(language);
        paramIndex++;
      }

      if (patternCategory) {
        sqlQuery += ` AND pattern_category = $${paramIndex}`;
        params.push(patternCategory);
        paramIndex++;
      }

      sqlQuery += ` ORDER BY success_rate DESC NULLS LAST, times_used DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await this.db.query(sqlQuery, params);

      return result.rows;

    } catch (error) {
      console.error('[DomainCodeLibrary] Search patterns error:', error.message);
      throw error;
    }
  }

  /**
   * Log pattern usage
   */
  async logUsage(exampleId, usage) {
    const {
      usedInRequestId,
      usedInArtifactId,
      usedBy,
      success = true,
      modified = false,
      modifications,
      userRating,
      feedbackText
    } = usage;

    try {
      await this.db.query(`
        INSERT INTO domain_pattern_usage (
          example_id,
          used_in_request_id,
          used_in_artifact_id,
          used_by,
          success,
          modified,
          modifications,
          user_rating,
          feedback_text
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        exampleId,
        usedInRequestId,
        usedInArtifactId,
        usedBy,
        success,
        modified,
        modifications,
        userRating,
        feedbackText
      ]);

      console.log(`[DomainCodeLibrary] Logged usage for: ${exampleId}`);

    } catch (error) {
      console.error('[DomainCodeLibrary] Log usage error:', error.message);
      throw error;
    }
  }

  /**
   * Get or create style guide for domain
   */
  async getStyleGuide(domainContext) {
    try {
      const result = await this.db.query(`
        SELECT * FROM domain_style_guides
        WHERE domain_context = $1
      `, [domainContext]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Create default style guide if none exists
      return await this.createStyleGuide({
        domainContext,
        indentStyle: 'spaces',
        indentSize: 2,
        quoteStyle: 'single',
        lineLength: 100,
        trailingCommas: true,
        variableCase: 'camelCase',
        functionCase: 'camelCase',
        classCase: 'PascalCase',
        constantCase: 'UPPER_SNAKE',
        requiresDocstrings: true
      });

    } catch (error) {
      console.error('[DomainCodeLibrary] Get style guide error:', error.message);
      throw error;
    }
  }

  /**
   * Create style guide
   */
  async createStyleGuide(styleGuide) {
    const {
      domainContext,
      indentStyle,
      indentSize,
      quoteStyle,
      lineLength,
      trailingCommas,
      variableCase,
      functionCase,
      classCase,
      constantCase,
      fileStructure,
      importOrder,
      languagePreferences,
      requiresDocstrings,
      docstringStyle,
      bestPractices,
      antiPatterns,
      description
    } = styleGuide;

    try {
      await this.db.query(`
        INSERT INTO domain_style_guides (
          domain_context,
          indent_style,
          indent_size,
          quote_style,
          line_length,
          trailing_commas,
          variable_case,
          function_case,
          class_case,
          constant_case,
          file_structure,
          import_order,
          language_preferences,
          requires_docstrings,
          docstring_style,
          best_practices,
          anti_patterns,
          description
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18
        )
        ON CONFLICT (domain_context) DO UPDATE
        SET
          indent_style = $2,
          indent_size = $3,
          quote_style = $4,
          line_length = $5,
          trailing_commas = $6,
          variable_case = $7,
          function_case = $8,
          class_case = $9,
          constant_case = $10,
          file_structure = $11,
          import_order = $12,
          language_preferences = $13,
          requires_docstrings = $14,
          docstring_style = $15,
          best_practices = $16,
          anti_patterns = $17,
          description = $18,
          updated_at = NOW()
      `, [
        domainContext,
        indentStyle,
        indentSize,
        quoteStyle,
        lineLength,
        trailingCommas,
        variableCase,
        functionCase,
        classCase,
        constantCase,
        fileStructure ? JSON.stringify(fileStructure) : null,
        importOrder,
        languagePreferences ? JSON.stringify(languagePreferences) : null,
        requiresDocstrings,
        docstringStyle,
        bestPractices,
        antiPatterns,
        description
      ]);

      console.log(`[DomainCodeLibrary] Created/updated style guide: ${domainContext}`);

      return await this.getStyleGuide(domainContext);

    } catch (error) {
      console.error('[DomainCodeLibrary] Create style guide error:', error.message);
      throw error;
    }
  }

  /**
   * Add anti-pattern
   */
  async addAntiPattern(antiPattern) {
    const {
      domainContext,
      antiPatternName,
      antiPatternCategory,
      badCodeExample,
      whyBad,
      goodCodeExample,
      whyGood,
      severity = 'warning',
      autoDetectPattern,
      relatedGoodPatternId,
      tags,
      createdBy
    } = antiPattern;

    try {
      await this.db.query(`
        INSERT INTO domain_anti_patterns (
          domain_context,
          anti_pattern_name,
          anti_pattern_category,
          bad_code_example,
          why_bad,
          good_code_example,
          why_good,
          severity,
          auto_detect_pattern,
          related_good_pattern_id,
          tags,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        domainContext,
        antiPatternName,
        antiPatternCategory,
        badCodeExample,
        whyBad,
        goodCodeExample,
        whyGood,
        severity,
        autoDetectPattern,
        relatedGoodPatternId,
        tags,
        createdBy
      ]);

      console.log(`[DomainCodeLibrary] Added anti-pattern: ${antiPatternName}`);

    } catch (error) {
      console.error('[DomainCodeLibrary] Add anti-pattern error:', error.message);
      throw error;
    }
  }

  /**
   * Get anti-patterns for domain
   */
  async getAntiPatterns(domainContext, options = {}) {
    const { severity, category } = options;

    try {
      let query = `
        SELECT * FROM domain_anti_patterns
        WHERE domain_context = $1
      `;

      const params = [domainContext];
      let paramIndex = 2;

      if (severity) {
        query += ` AND severity = $${paramIndex}`;
        params.push(severity);
        paramIndex++;
      }

      if (category) {
        query += ` AND anti_pattern_category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      query += ' ORDER BY severity DESC, created_at DESC';

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[DomainCodeLibrary] Get anti-patterns error:', error.message);
      throw error;
    }
  }

  /**
   * Add relationship to knowledge graph
   */
  async addRelationship(relationship) {
    const {
      sourceType,
      sourceId,
      targetType,
      targetId,
      relationshipType,
      relationshipStrength = 0.5,
      context
    } = relationship;

    try {
      await this.db.query(`
        INSERT INTO domain_knowledge_graph (
          source_type,
          source_id,
          target_type,
          target_id,
          relationship_type,
          relationship_strength,
          context
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        sourceType,
        sourceId,
        targetType,
        targetId,
        relationshipType,
        relationshipStrength,
        context
      ]);

      console.log(`[DomainCodeLibrary] Added relationship: ${sourceId} -> ${targetId}`);

    } catch (error) {
      console.error('[DomainCodeLibrary] Add relationship error:', error.message);
      throw error;
    }
  }

  /**
   * Get related patterns
   */
  async getRelatedPatterns(exampleId, relationshipType = null) {
    try {
      let query = `
        SELECT
          dkg.*,
          dce.title,
          dce.description,
          dce.pattern_name,
          dce.success_rate
        FROM domain_knowledge_graph dkg
        JOIN domain_code_examples dce ON dkg.target_id = dce.example_id
        WHERE dkg.source_type = 'pattern'
          AND dkg.target_type = 'pattern'
          AND dkg.source_id = $1
      `;

      const params = [exampleId];

      if (relationshipType) {
        query += ' AND dkg.relationship_type = $2';
        params.push(relationshipType);
      }

      query += ' ORDER BY dkg.relationship_strength DESC';

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[DomainCodeLibrary] Get related patterns error:', error.message);
      throw error;
    }
  }

  /**
   * Get top patterns per domain
   */
  async getTopPatterns(domainContext = null, limit = 10) {
    try {
      let query = `
        SELECT * FROM top_domain_patterns
      `;

      const params = [];

      if (domainContext) {
        query += ' WHERE domain_context = $1';
        params.push(domainContext);
      }

      query += ` LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[DomainCodeLibrary] Get top patterns error:', error.message);
      throw error;
    }
  }

  /**
   * Get domain coverage statistics
   */
  async getDomainCoverage(domainContext = null) {
    try {
      let query = `
        SELECT * FROM domain_pattern_coverage
      `;

      const params = [];

      if (domainContext) {
        query += ' WHERE domain_context = $1';
        params.push(domainContext);
      }

      const result = await this.db.query(query, params);

      if (domainContext) {
        return result.rows[0] || null;
      }

      return result.rows;

    } catch (error) {
      console.error('[DomainCodeLibrary] Get domain coverage error:', error.message);
      throw error;
    }
  }

  /**
   * Update pattern rating
   */
  async updateRating(exampleId, rating) {
    try {
      await this.db.query(`
        UPDATE domain_code_examples
        SET user_rating = $2
        WHERE example_id = $1
      `, [exampleId, rating]);

      console.log(`[DomainCodeLibrary] Updated rating: ${exampleId} -> ${rating}`);

    } catch (error) {
      console.error('[DomainCodeLibrary] Update rating error:', error.message);
      throw error;
    }
  }

  /**
   * Deprecate pattern
   */
  async deprecatePattern(exampleId, supersededBy = null) {
    try {
      await this.db.query(`
        UPDATE domain_code_examples
        SET
          status = 'deprecated',
          is_current = false,
          superseded_by = $2
        WHERE example_id = $1
      `, [exampleId, supersededBy]);

      console.log(`[DomainCodeLibrary] Deprecated pattern: ${exampleId}`);

    } catch (error) {
      console.error('[DomainCodeLibrary] Deprecate pattern error:', error.message);
      throw error;
    }
  }

  /**
   * Get pattern statistics
   */
  async getStatistics(domainContext = null) {
    try {
      let query = `
        SELECT
          COUNT(*) as total_patterns,
          COUNT(DISTINCT pattern_category) as unique_categories,
          COUNT(DISTINCT language) as unique_languages,
          AVG(success_rate) as avg_success_rate,
          AVG(user_rating) as avg_rating,
          SUM(times_used) as total_uses
        FROM domain_code_examples
        WHERE status = 'active' AND is_current = true
      `;

      const params = [];

      if (domainContext) {
        query += ' AND domain_context = $1';
        params.push(domainContext);
      }

      const result = await this.db.query(query, params);

      return result.rows[0];

    } catch (error) {
      console.error('[DomainCodeLibrary] Get statistics error:', error.message);
      throw error;
    }
  }
}

module.exports = DomainCodeLibrary;
