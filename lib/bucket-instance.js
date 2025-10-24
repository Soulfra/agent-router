/**
 * Bucket Instance
 *
 * Single isolated bucket with complete subsystem:
 * - Ollama model execution
 * - Workflow automation
 * - Profile management
 * - Usage tracking
 * - Reasoning logging
 * - Version control
 *
 * Each of the 12 buckets runs independently with its own configuration
 */

const UsageTracker = require('./usage-tracker');
const ModelWrapper = require('./model-wrapper');
const WorkflowBuilder = require('./workflow-builder');
const ArtifactStorage = require('./artifact-storage');
const DomainContextEnricher = require('./domain-context-enricher');
const PatternMatcher = require('./pattern-matcher');
const ResponseTransformer = require('./response-transformer');
const XRefMapper = require('./xref-mapper');

class BucketInstance {
  constructor(options = {}) {
    // Core identity
    this.bucketId = options.bucketId;
    this.bucketName = options.bucketName;
    this.bucketSlug = options.bucketSlug;
    this.category = options.category;

    // Domain association
    this.domainContext = options.domainContext;
    this.domainUrl = options.domainUrl;

    // Ollama model
    this.ollamaModel = options.ollamaModel;
    this.modelFamily = options.modelFamily;
    this.modelVersion = options.modelVersion;

    // Configuration
    this.workflowConfig = options.workflowConfig || {};
    this.profileConfig = options.profileConfig || {};

    // Status
    this.status = options.status || 'active';
    this.currentVersion = options.currentVersion || 1;

    // Dependencies
    this.db = options.db;
    this.usageTracker = options.usageTracker;
    this.modelWrapper = options.modelWrapper;
    this.workflowBuilder = options.workflowBuilder;
    this.artifactStorage = options.artifactStorage;

    // Vortex components (domain-aware pipeline)
    this.domainEnricher = options.domainEnricher || (this.db ? new DomainContextEnricher({ db: this.db }) : null);
    this.patternMatcher = options.patternMatcher || (this.db ? new PatternMatcher({ db: this.db }) : null);
    this.responseTransformer = options.responseTransformer || new ResponseTransformer({ db: this.db });
    this.xrefMapper = options.xrefMapper || (this.db ? new XRefMapper({ db: this.db }) : null);
    this.vortexEnabled = options.vortexEnabled !== false; // Enabled by default

    // Metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalCostUsd: 0,
      avgResponseTimeMs: 0
    };

    // Internal state
    this.reasoningLog = [];
    this.todos = [];
    this.comments = [];
  }

  /**
   * Initialize bucket from database
   * @static
   */
  static async load(bucketId, db, dependencies = {}) {
    if (!db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await db.query(`
        SELECT * FROM bucket_instances
        WHERE bucket_id = $1
      `, [bucketId]);

      if (result.rows.length === 0) {
        throw new Error(`Bucket not found: ${bucketId}`);
      }

      const row = result.rows[0];

      // Create instance
      const bucket = new BucketInstance({
        bucketId: row.bucket_id,
        bucketName: row.bucket_name,
        bucketSlug: row.bucket_slug,
        category: row.category,
        domainContext: row.domain_context,
        domainUrl: row.domain_url,
        ollamaModel: row.ollama_model,
        modelFamily: row.model_family,
        modelVersion: row.model_version,
        workflowConfig: row.workflow_config,
        profileConfig: row.profile_config,
        status: row.status,
        currentVersion: row.current_version,
        db,
        ...dependencies
      });

      // Load metrics
      bucket.metrics = {
        totalRequests: row.total_requests,
        successfulRequests: row.successful_requests,
        failedRequests: row.failed_requests,
        totalCostUsd: parseFloat(row.total_cost_usd),
        avgResponseTimeMs: parseFloat(row.avg_response_time_ms) || 0
      };

      console.log(`[BucketInstance] Loaded: ${bucket.bucketName} (${bucket.ollamaModel})`);

      return bucket;

    } catch (error) {
      console.error('[BucketInstance] Load error:', error.message);
      throw error;
    }
  }

  /**
   * Execute a request through this bucket
   *
   * @param {object} request - { prompt, userId, sessionId, context }
   * @returns {Promise<object>} - Response with reasoning
   */
  async execute(request) {
    if (this.status !== 'active') {
      throw new Error(`Bucket ${this.bucketId} is not active (status: ${this.status})`);
    }

    const startTime = Date.now();

    // Log reasoning: WHY we're using this bucket/model
    const reasoning = await this._logRequestReasoning(request);

    // Track usage
    const usageRequestId = this.usageTracker ?
      this.usageTracker.logRequest({
        model: this.ollamaModel,
        prompt: request.prompt,
        userId: request.userId,
        sessionId: request.sessionId,
        roomId: this.bucketId,
        priority: request.priority || 50,
        detectedIntent: request.detectedIntent,
        routingRule: `bucket:${this.bucketSlug}`
      }) : null;

    // 🔗 XREF: Record bucket and domain usage
    if (this.xrefMapper && usageRequestId) {
      // Record bucket usage
      this.xrefMapper.recordBucketUsage(usageRequestId, this.bucketId, {
        userId: request.userId,
        sessionId: request.sessionId
      }).catch(err => console.error('[XRef] Failed to record bucket usage:', err.message));

      // Record domain usage
      if (this.domainContext) {
        this.xrefMapper.record({
          sourceType: 'request',
          sourceId: usageRequestId,
          targetType: 'domain',
          targetId: this.domainContext,
          relationshipType: 'uses_domain',
          context: {
            userId: request.userId,
            sessionId: request.sessionId,
            requestId: usageRequestId
          },
          metadata: {
            bucketId: this.bucketId,
            domainUrl: this.domainUrl
          },
          success: true
        }).catch(err => console.error('[XRef] Failed to record domain usage:', err.message));
      }
    }

    try {
      // 🌀 VORTEX ENTRY: Enrich with domain context
      let enrichedContext = null;
      let similarPatterns = null;
      let vortexMetadata = { enabled: this.vortexEnabled };

      if (this.vortexEnabled && this.domainEnricher && this.domainContext) {
        enrichedContext = await this.domainEnricher.enrich(
          request.prompt,
          this.domainContext,
          { maxPatterns: 3 }
        );

        vortexMetadata.enriched = true;

        // Find similar patterns
        if (this.patternMatcher) {
          similarPatterns = await this.patternMatcher.findSimilar(
            request.prompt,
            this.domainContext,
            { limit: 3, minSimilarity: 0.4 }
          );

          vortexMetadata.patternsFound = similarPatterns.length;

          if (similarPatterns.length > 0) {
            console.log(`[Vortex] Found ${similarPatterns.length} similar patterns`);
            for (const match of similarPatterns) {
              console.log(`  - ${match.pattern.title} (${(match.similarity * 100).toFixed(0)}% match)`);
            }

            // 🔗 XREF: Record pattern usage
            if (this.xrefMapper && usageRequestId) {
              const patternRecords = similarPatterns.map(match => ({
                sourceType: 'request',
                sourceId: usageRequestId,
                targetType: 'pattern',
                targetId: match.pattern.example_id.toString(),
                relationshipType: 'uses_pattern',
                context: {
                  userId: request.userId,
                  sessionId: request.sessionId,
                  requestId: usageRequestId
                },
                metadata: {
                  similarity: match.similarity,
                  patternTitle: match.pattern.title
                },
                success: true
              }));

              this.xrefMapper.recordBatch(patternRecords).catch(err =>
                console.error('[XRef] Failed to record pattern usage:', err.message)
              );
            }
          }
        }

        // Build domain-aware prompt
        if (enrichedContext) {
          const domainSystemPrompt = this.domainEnricher.buildSystemPrompt(enrichedContext);
          const domainUserPrompt = this.domainEnricher.buildUserPrompt(request.prompt, enrichedContext);

          // Inject domain context into request
          request.context = request.context || {};
          request.context.systemPrompt = domainSystemPrompt;
          request.prompt = domainUserPrompt;

          vortexMetadata.promptEnriched = true;
        }
      }

      // Execute model with enriched prompt
      const modelResult = await this._executeModel(request);

      const responseTime = Date.now() - startTime;

      // 🔗 XREF: Record model usage
      if (this.xrefMapper && usageRequestId) {
        this.xrefMapper.recordModelUsage(
          usageRequestId,
          this.ollamaModel,
          {
            userId: request.userId,
            sessionId: request.sessionId,
            requestId: usageRequestId
          },
          responseTime,
          true
        ).catch(err => console.error('[XRef] Failed to record model usage:', err.message));
      }

      // 🌀 VORTEX EXIT: Transform response
      let transformResult = null;
      if (this.vortexEnabled && this.responseTransformer && enrichedContext) {
        transformResult = await this.responseTransformer.transform(
          modelResult.response,
          enrichedContext
        );

        if (transformResult.changes.length > 0 || transformResult.antiPatternsDetected.length > 0) {
          // Use transformed response
          modelResult.response = transformResult.transformed;

          vortexMetadata.transformed = true;
          vortexMetadata.changes = transformResult.changes.length;
          vortexMetadata.antiPatterns = transformResult.antiPatternsDetected.length;
          vortexMetadata.violations = transformResult.violations.length;

          console.log(`[Vortex] Applied transformations: ${transformResult.changes.length} changes, ${transformResult.antiPatternsDetected.length} anti-patterns detected`);
        }
      }

      // Calculate cost (Ollama is free)
      const cost = 0;

      // Update metrics
      await this._updateMetrics(true, responseTime, cost);

      // Log usage response
      if (this.usageTracker && usageRequestId) {
        this.usageTracker.logResponse(usageRequestId, modelResult);
      }

      // Log reasoning outcome
      await this._logReasoningOutcome(reasoning.reasoningId, 'success', {
        responseTime,
        cost,
        modelUsed: this.ollamaModel
      });

      // Save artifact if response contains code
      let artifactId = null;
      if (this.artifactStorage) {
        artifactId = await this._saveArtifactIfPresent(
          request,
          modelResult,
          reasoning.reasoningId,
          usageRequestId,
          similarPatterns
        );
      }

      return {
        success: true,
        bucketId: this.bucketId,
        bucketName: this.bucketName,
        model: this.ollamaModel,
        response: modelResult.response,
        responseTime,
        cost,
        artifactId,
        reasoning: {
          why: reasoning.reasoning,
          decisionFactors: reasoning.decisionFactors
        },
        vortex: vortexMetadata,
        similarPatterns,
        transformResult,
        metadata: {
          category: this.category,
          domainContext: this.domainContext,
          version: this.currentVersion
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Update metrics
      await this._updateMetrics(false, responseTime, 0);

      // Log usage error
      if (this.usageTracker && usageRequestId) {
        this.usageTracker.logResponse(usageRequestId, null, error);
      }

      // Log reasoning outcome
      await this._logReasoningOutcome(reasoning.reasoningId, 'failed', {
        error: error.message,
        responseTime
      });

      throw error;
    }
  }

  /**
   * Execute model (internal)
   * @private
   */
  async _executeModel(request) {
    if (this.modelWrapper) {
      // Use ModelWrapper if available
      return await this.modelWrapper.execute({
        model: this.ollamaModel,
        prompt: request.prompt,
        context: request.context || {}
      });
    } else {
      // Direct Ollama call
      const axios = require('axios');
      const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

      const messages = [];

      if (request.context?.systemPrompt) {
        messages.push({ role: 'system', content: request.context.systemPrompt });
      }

      if (request.context?.history) {
        messages.push(...request.context.history);
      }

      messages.push({ role: 'user', content: request.prompt });

      const response = await axios.post(`${ollamaUrl}/api/chat`, {
        model: this.ollamaModel,
        messages,
        stream: false
      });

      return {
        response: response.data.message.content,
        model: this.ollamaModel
      };
    }
  }

  /**
   * Log reasoning for this request
   * @private
   */
  async _logRequestReasoning(request) {
    if (!this.db) {
      return { reasoningId: null, reasoning: 'Database not available' };
    }

    // Determine why this bucket was chosen
    const reasoning = this._determineReasoning(request);

    try {
      const result = await this.db.query(`
        INSERT INTO bucket_reasoning_log (
          bucket_id,
          version,
          decision_type,
          prompt_text,
          user_intent,
          reasoning,
          alternatives_considered,
          decision_factors,
          decision_made,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING reasoning_id
      `, [
        this.bucketId,
        this.currentVersion,
        'model_execution',
        request.prompt,
        request.detectedIntent || 'unknown',
        reasoning.reasoning,
        JSON.stringify(reasoning.alternatives),
        JSON.stringify(reasoning.factors),
        `Execute with ${this.ollamaModel}`,
        'system'
      ]);

      return {
        reasoningId: result.rows[0].reasoning_id,
        ...reasoning
      };

    } catch (error) {
      console.error('[BucketInstance] Reasoning log error:', error.message);
      return { reasoningId: null, ...reasoning };
    }
  }

  /**
   * Determine reasoning for bucket/model choice
   * @private
   */
  _determineReasoning(request) {
    const factors = {
      cost: 1.0,      // Ollama is free
      speed: 0.8,     // Local execution is fast
      accuracy: 0.7,  // Good enough for most tasks
      availability: 1.0  // Always available
    };

    let reasoning = `Selected bucket "${this.bucketName}" because:\n`;
    reasoning += `- Category match: ${this.category}\n`;
    reasoning += `- Domain context: ${this.domainContext}\n`;
    reasoning += `- Model: ${this.ollamaModel} (${this.modelFamily} family)\n`;
    reasoning += `- Cost: Free (internal Ollama)\n`;
    reasoning += `- Speed: Fast local execution\n`;

    if (request.detectedIntent) {
      reasoning += `- Detected intent: ${request.detectedIntent}\n`;
    }

    // Alternatives that were NOT chosen
    const alternatives = [
      {
        option: 'External API (GPT-4, Claude)',
        reason: 'More expensive, unnecessary for this query type'
      },
      {
        option: 'Different bucket',
        reason: 'This bucket best matches domain and category'
      }
    ];

    return {
      reasoning,
      factors,
      alternatives,
      decisionFactors: factors
    };
  }

  /**
   * Log reasoning outcome
   * @private
   */
  async _logReasoningOutcome(reasoningId, outcome, metrics) {
    if (!this.db || !reasoningId) return;

    try {
      await this.db.query(`
        UPDATE bucket_reasoning_log
        SET
          outcome = $1,
          outcome_metrics = $2,
          should_repeat = $3
        WHERE reasoning_id = $4
      `, [
        outcome,
        JSON.stringify(metrics),
        outcome === 'success', // Would we make same decision again?
        reasoningId
      ]);

    } catch (error) {
      console.error('[BucketInstance] Update reasoning error:', error.message);
    }
  }

  /**
   * Update bucket metrics
   * @private
   */
  async _updateMetrics(success, responseTime, cost) {
    // Update in-memory metrics
    this.metrics.totalRequests++;
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }
    this.metrics.totalCostUsd += cost;

    // Update average response time
    const prevTotal = this.metrics.avgResponseTimeMs * (this.metrics.totalRequests - 1);
    this.metrics.avgResponseTimeMs = (prevTotal + responseTime) / this.metrics.totalRequests;

    // Update database
    if (this.db) {
      try {
        await this.db.query(
          'SELECT increment_bucket_usage($1, $2, $3, $4)',
          [this.bucketId, success, responseTime, cost]
        );
      } catch (error) {
        console.error('[BucketInstance] Update metrics error:', error.message);
      }
    }
  }

  /**
   * Get bucket performance summary
   */
  async getPerformance() {
    if (!this.db) {
      return this.metrics;
    }

    try {
      const result = await this.db.query(
        'SELECT * FROM get_bucket_performance($1)',
        [this.bucketId]
      );

      if (result.rows.length > 0) {
        return {
          totalRequests: parseInt(result.rows[0].totalRequests),
          successRate: parseFloat(result.rows[0].successRate),
          avgResponseMs: parseFloat(result.rows[0].avgResponseMs),
          totalCost: parseFloat(result.rows[0].totalCost),
          reasoningCount: parseInt(result.rows[0].reasoningCount),
          pendingTodos: parseInt(result.rows[0].pendingTodos)
        };
      }

      return this.metrics;

    } catch (error) {
      console.error('[BucketInstance] Get performance error:', error.message);
      return this.metrics;
    }
  }

  /**
   * Get reasoning log for this bucket
   */
  async getReasoningLog(limit = 10) {
    if (!this.db) return [];

    try {
      const result = await this.db.query(`
        SELECT
          reasoning_id,
          version,
          decision_type,
          timestamp,
          prompt_text,
          user_intent,
          reasoning,
          decision_made,
          outcome,
          outcome_metrics,
          should_repeat
        FROM bucket_reasoning_log
        WHERE bucket_id = $1
        ORDER BY timestamp DESC
        LIMIT $2
      `, [this.bucketId, limit]);

      return result.rows;

    } catch (error) {
      console.error('[BucketInstance] Get reasoning log error:', error.message);
      return [];
    }
  }

  /**
   * Get todos for this bucket
   */
  async getTodos(statusFilter = null) {
    if (!this.db) return [];

    try {
      let query = `
        SELECT * FROM bucket_todos
        WHERE bucket_id = $1
      `;
      const params = [this.bucketId];

      if (statusFilter) {
        query += ` AND status = $2`;
        params.push(statusFilter);
      }

      query += ` ORDER BY priority DESC, created_at DESC`;

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[BucketInstance] Get todos error:', error.message);
      return [];
    }
  }

  /**
   * Add todo
   */
  async addTodo(todo) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        INSERT INTO bucket_todos (
          bucket_id,
          version,
          title,
          description,
          priority,
          why_needed,
          assigned_to
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING todo_id
      `, [
        this.bucketId,
        this.currentVersion,
        todo.title,
        todo.description,
        todo.priority || 50,
        todo.whyNeeded || 'Auto-generated',
        todo.assignedTo || 'system'
      ]);

      return result.rows[0].todoId;

    } catch (error) {
      console.error('[BucketInstance] Add todo error:', error.message);
      return null;
    }
  }

  /**
   * Add comment
   */
  async addComment(comment) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        INSERT INTO bucket_comments (
          bucket_id,
          version,
          author,
          author_type,
          comment_text,
          comment_type
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING comment_id
      `, [
        this.bucketId,
        this.currentVersion,
        comment.author,
        comment.authorType || 'system',
        comment.text,
        comment.type || 'observation'
      ]);

      return result.rows[0].commentId;

    } catch (error) {
      console.error('[BucketInstance] Add comment error:', error.message);
      return null;
    }
  }

  /**
   * Create new version
   */
  async createVersion(versionName, changesSummary, reasoning) {
    if (!this.db) return null;

    try {
      // Get current config snapshot
      const configSnapshot = {
        bucketName: this.bucketName,
        category: this.category,
        ollamaModel: this.ollamaModel,
        workflowConfig: this.workflowConfig,
        profileConfig: this.profileConfig,
        status: this.status
      };

      const result = await this.db.query(
        'SELECT create_bucket_version($1, $2, $3, $4, $5)',
        [
          this.bucketId,
          versionName,
          JSON.stringify(configSnapshot),
          changesSummary,
          reasoning
        ]
      );

      const newVersion = result.rows[0].createBucketVersion;
      this.currentVersion = newVersion;

      console.log(`[BucketInstance] Created version ${newVersion}: ${versionName}`);

      return newVersion;

    } catch (error) {
      console.error('[BucketInstance] Create version error:', error.message);
      return null;
    }
  }

  /**
   * Get version history
   */
  async getVersionHistory() {
    if (!this.db) return [];

    try {
      const result = await this.db.query(`
        SELECT
          version_number,
          version_name,
          version_type,
          changes_summary,
          reasoning,
          metrics,
          created_at
        FROM bucket_versions
        WHERE bucket_id = $1
        ORDER BY version_number DESC
      `, [this.bucketId]);

      return result.rows;

    } catch (error) {
      console.error('[BucketInstance] Get version history error:', error.message);
      return [];
    }
  }

  /**
   * Pause bucket
   */
  async pause(reason) {
    this.status = 'paused';

    if (this.db) {
      await this.db.query(
        'UPDATE bucket_instances SET status = $1 WHERE bucket_id = $2',
        ['paused', this.bucketId]
      );

      await this.addComment({
        author: 'system',
        authorType: 'system',
        text: `Bucket paused: ${reason}`,
        type: 'observation'
      });
    }
  }

  /**
   * Resume bucket
   */
  async resume() {
    this.status = 'active';

    if (this.db) {
      await this.db.query(
        'UPDATE bucket_instances SET status = $1 WHERE bucket_id = $2',
        ['active', this.bucketId]
      );

      await this.addComment({
        author: 'system',
        authorType: 'system',
        text: 'Bucket resumed',
        type: 'observation'
      });
    }
  }

  /**
   * Save artifact if response contains code
   * @private
   */
  async _saveArtifactIfPresent(request, modelResult, reasoningLogId, requestId, similarPatterns = null) {
    try {
      // Extract code from response
      const extractedCode = this._extractCode(modelResult.response);

      if (!extractedCode || extractedCode.length === 0) {
        // No code found in response
        return null;
      }

      // For each code block found, save as artifact
      const artifactIds = [];

      for (const codeBlock of extractedCode) {
        const artifactId = await this.artifactStorage.saveArtifact({
          bucketId: this.bucketId,
          domainContext: this.domainContext,
          domainUrl: this.domainUrl,
          artifactType: codeBlock.type || 'snippet',
          language: codeBlock.language || 'unknown',
          framework: codeBlock.framework,
          code: codeBlock.code,
          artifactName: codeBlock.name || this._generateArtifactName(request.prompt),
          description: codeBlock.description || `Generated from: ${request.prompt.substring(0, 100)}`,
          tags: this._extractTags(request.prompt, codeBlock.language),
          originalPrompt: request.prompt,
          reasoningLogId,
          requestId,
          parentArtifactId: request.parentArtifactId,
          modelId: this.ollamaModel,
          wrapperName: this.modelWrapper ? 'ModelWrapper' : null,
          modelParameters: {
            family: this.modelFamily,
            version: this.modelVersion
          },
          createdBy: request.userId || 'system'
        });

        artifactIds.push(artifactId);

        // 🔗 XREF: Link artifact to patterns that were used
        if (this.xrefMapper && similarPatterns && similarPatterns.length > 0) {
          const artifactPatternLinks = similarPatterns.map(match => ({
            sourceType: 'artifact',
            sourceId: artifactId.toString(),
            targetType: 'pattern',
            targetId: match.pattern.example_id.toString(),
            relationshipType: 'uses_pattern',
            context: {
              userId: request.userId,
              sessionId: request.sessionId,
              requestId
            },
            metadata: {
              similarity: match.similarity,
              patternTitle: match.pattern.title,
              artifactLanguage: codeBlock.language
            },
            success: true
          }));

          this.xrefMapper.recordBatch(artifactPatternLinks).catch(err =>
            console.error('[XRef] Failed to record artifact-pattern links:', err.message)
          );

          console.log(`[XRef] Linked artifact ${artifactId} to ${similarPatterns.length} patterns`);
        }
      }

      if (artifactIds.length === 1) {
        return artifactIds[0];
      } else if (artifactIds.length > 1) {
        return artifactIds;
      }

      return null;

    } catch (error) {
      console.error('[BucketInstance] Save artifact error:', error.message);
      return null;
    }
  }

  /**
   * Extract code blocks from response
   * @private
   */
  _extractCode(response) {
    const codeBlocks = [];

    // Match markdown code blocks: ```language\ncode\n```
    const markdownRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = markdownRegex.exec(response)) !== null) {
      const language = match[1] || 'unknown';
      const code = match[2].trim();

      if (code.length > 10) { // Only save substantial code blocks
        codeBlocks.push({
          code,
          language,
          type: this._inferArtifactType(code, language),
          framework: this._detectFramework(code)
        });
      }
    }

    // Also look for inline code that looks substantial (e.g., complete functions)
    if (codeBlocks.length === 0) {
      // Check if entire response looks like code (indented, has common patterns)
      const looksLikeCode = /^(function|class|const|let|var|def|import|from)/m.test(response) ||
                            /^\s{2,}/m.test(response); // Indented

      if (looksLikeCode && response.length > 50) {
        codeBlocks.push({
          code: response,
          language: this._detectLanguage(response),
          type: 'snippet'
        });
      }
    }

    return codeBlocks;
  }

  /**
   * Infer artifact type from code
   * @private
   */
  _inferArtifactType(code, language) {
    if (/class\s+\w+/.test(code)) return 'class';
    if (/function\s+\w+|const\s+\w+\s*=\s*\([^)]*\)\s*=>/.test(code)) return 'function';
    if (/(import.*from|require\(|module\.exports)/.test(code) && code.split('\n').length > 20) return 'module';
    if (/export\s+(default\s+)?function|export\s+class/.test(code)) return 'component';
    if (/<svg/.test(code)) return 'svg';
    if (/^<!DOCTYPE|<html/.test(code)) return 'page';
    if (/app\.(get|post|put|delete)|router\./i.test(code)) return 'api';
    return 'snippet';
  }

  /**
   * Detect framework from code
   * @private
   */
  _detectFramework(code) {
    if (/import.*from\s+['"]react/.test(code)) return 'react';
    if (/import.*from\s+['"]vue/.test(code)) return 'vue';
    if (/express\(\)|app\.listen/.test(code)) return 'express';
    if (/from flask import/.test(code)) return 'flask';
    if (/import.*from\s+['"]next/.test(code)) return 'next';
    if (/import.*from\s+['"]svelte/.test(code)) return 'svelte';
    return null;
  }

  /**
   * Detect language from code
   * @private
   */
  _detectLanguage(code) {
    if (/function|const|let|var|=>/.test(code)) return 'javascript';
    if (/def\s+\w+|import\s+\w+|from\s+\w+\s+import/.test(code)) return 'python';
    if (/fn\s+\w+|let\s+mut/.test(code)) return 'rust';
    if (/func\s+\w+|package\s+main/.test(code)) return 'go';
    if (/<\?php/.test(code)) return 'php';
    if (/(public|private|protected)\s+(class|interface)/.test(code)) return 'java';
    return 'unknown';
  }

  /**
   * Generate artifact name from prompt
   * @private
   */
  _generateArtifactName(prompt) {
    // Extract key words from prompt
    const words = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['create', 'make', 'build', 'write', 'generate', 'function', 'class'].includes(w))
      .slice(0, 3)
      .join('_');

    return words || 'generated_artifact';
  }

  /**
   * Extract tags from prompt and language
   * @private
   */
  _extractTags(prompt, language) {
    const tags = [];

    if (language) tags.push(language);

    // Extract common tech terms
    const techTerms = ['api', 'auth', 'database', 'frontend', 'backend', 'rest', 'graphql',
                       'react', 'vue', 'express', 'flask', 'async', 'validation', 'middleware',
                       'component', 'service', 'controller', 'model', 'view'];

    const lowerPrompt = prompt.toLowerCase();
    for (const term of techTerms) {
      if (lowerPrompt.includes(term)) {
        tags.push(term);
      }
    }

    return tags.slice(0, 10); // Max 10 tags
  }

  /**
   * Get bucket summary
   */
  toJSON() {
    return {
      bucketId: this.bucketId,
      bucketName: this.bucketName,
      bucketSlug: this.bucketSlug,
      category: this.category,
      domainContext: this.domainContext,
      domainUrl: this.domainUrl,
      ollamaModel: this.ollamaModel,
      modelFamily: this.modelFamily,
      status: this.status,
      currentVersion: this.currentVersion,
      metrics: this.metrics
    };
  }
}


module.exports = BucketInstance;
