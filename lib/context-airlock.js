/**
 * Context Airlock
 *
 * Package.lock-style system for domain contexts
 * Freeze, snapshot, rollback domain configurations
 *
 * Like Git for domain contexts, or Docker for AI configurations
 *
 * Key features:
 * - Create snapshots of domain state
 * - Activate/deactivate snapshots
 * - Rollback to known-good configurations
 * - Detect context drift
 * - Compare snapshots (diffs)
 * - Validate snapshot integrity
 */

class ContextAirlock {
  constructor(options = {}) {
    this.db = options.db;

    if (!this.db) {
      throw new Error('Database connection required');
    }

    console.log('[ContextAirlock] Initialized');
  }

  /**
   * Create snapshot of domain context
   *
   * @param {string} domainContext - Domain to snapshot
   * @param {object} options - Snapshot options
   * @returns {Promise<string>} - snapshotId
   */
  async createSnapshot(domainContext, options = {}) {
    const {
      snapshotName,
      snapshotTag,
      description,
      bucketId,
      snapshotType = 'full',
      modelConfig,
      wrapperConfig,
      styleGuide,
      parameters,
      isGolden = false,
      createdBy
    } = options;

    try {
      // Use database function to create snapshot
      const result = await this.db.query(`
        SELECT create_domain_snapshot($1, $2, $3, $4) as snapshot_id
      `, [
        domainContext,
        snapshotName || `Snapshot ${new Date().toISOString()}`,
        snapshotTag,
        description
      ]);

      const snapshotId = result.rows[0].snapshot_id;

      // Update additional metadata
      await this.db.query(`
        UPDATE domain_context_snapshots
        SET
          bucket_id = $2,
          snapshot_type = $3,
          model_config = $4,
          wrapper_config = $5,
          style_guide = $6,
          parameters = $7,
          is_golden = $8,
          created_by = $9
        WHERE snapshot_id = $1
      `, [
        snapshotId,
        bucketId,
        snapshotType,
        modelConfig ? JSON.stringify(modelConfig) : '{}',
        wrapperConfig ? JSON.stringify(wrapperConfig) : null,
        styleGuide ? JSON.stringify(styleGuide) : null,
        parameters ? JSON.stringify(parameters) : '{}',
        isGolden,
        createdBy
      ]);

      console.log(`[ContextAirlock] Created snapshot: ${snapshotId}`);

      return snapshotId;

    } catch (error) {
      console.error('[ContextAirlock] Create snapshot error:', error.message);
      throw error;
    }
  }

  /**
   * Get snapshot by ID
   */
  async getSnapshot(snapshotId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM domain_context_snapshots
        WHERE snapshot_id = $1
      `, [snapshotId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('[ContextAirlock] Get snapshot error:', error.message);
      throw error;
    }
  }

  /**
   * Get current (active) snapshot for domain
   */
  async getCurrentSnapshot(domainContext) {
    try {
      const result = await this.db.query(`
        SELECT * FROM domain_context_snapshots
        WHERE domain_context = $1 AND is_current = true
        LIMIT 1
      `, [domainContext]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('[ContextAirlock] Get current snapshot error:', error.message);
      throw error;
    }
  }

  /**
   * Get golden (known-good) snapshots for domain
   */
  async getGoldenSnapshots(domainContext = null) {
    try {
      let query = `
        SELECT * FROM golden_snapshots
      `;

      const params = [];

      if (domainContext) {
        query += ' WHERE domain_context = $1';
        params.push(domainContext);
      }

      query += ' ORDER BY avg_success_rate DESC, created_at DESC';

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[ContextAirlock] Get golden snapshots error:', error.message);
      throw error;
    }
  }

  /**
   * Activate snapshot (make it current)
   */
  async activateSnapshot(snapshotId, activatedBy = 'system') {
    try {
      const result = await this.db.query(`
        SELECT activate_snapshot($1, $2) as success
      `, [snapshotId, activatedBy]);

      console.log(`[ContextAirlock] Activated snapshot: ${snapshotId}`);

      return result.rows[0].success;

    } catch (error) {
      console.error('[ContextAirlock] Activate snapshot error:', error.message);
      throw error;
    }
  }

  /**
   * Rollback to previous golden snapshot
   */
  async rollback(domainContext, reason = null) {
    try {
      const result = await this.db.query(`
        SELECT rollback_to_snapshot($1, $2) as snapshot_id
      `, [domainContext, reason]);

      const snapshotId = result.rows[0].snapshot_id;

      console.log(`[ContextAirlock] Rolled back ${domainContext} to: ${snapshotId}`);

      return snapshotId;

    } catch (error) {
      console.error('[ContextAirlock] Rollback error:', error.message);
      throw error;
    }
  }

  /**
   * Mark snapshot as golden
   */
  async markAsGolden(snapshotId) {
    try {
      await this.db.query(`
        UPDATE domain_context_snapshots
        SET is_golden = true
        WHERE snapshot_id = $1
      `, [snapshotId]);

      console.log(`[ContextAirlock] Marked as golden: ${snapshotId}`);

    } catch (error) {
      console.error('[ContextAirlock] Mark golden error:', error.message);
      throw error;
    }
  }

  /**
   * Get snapshot history for domain
   */
  async getHistory(domainContext, options = {}) {
    const { limit = 50, status } = options;

    try {
      let query = `
        SELECT * FROM domain_context_snapshots
        WHERE domain_context = $1
      `;

      const params = [domainContext];

      if (status) {
        query += ' AND status = $2';
        params.push(status);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[ContextAirlock] Get history error:', error.message);
      throw error;
    }
  }

  /**
   * Compare two snapshots
   */
  async compareSnapshots(fromSnapshotId, toSnapshotId) {
    try {
      // Get diffs
      const diffsResult = await this.db.query(`
        SELECT * FROM snapshot_diffs
        WHERE from_snapshot_id = $1 AND to_snapshot_id = $2
        ORDER BY impact_level DESC, change_type
      `, [fromSnapshotId, toSnapshotId]);

      // Get snapshot metadata
      const fromSnapshot = await this.getSnapshot(fromSnapshotId);
      const toSnapshot = await this.getSnapshot(toSnapshotId);

      return {
        from: fromSnapshot,
        to: toSnapshot,
        diffs: diffsResult.rows,
        totalChanges: diffsResult.rows.length
      };

    } catch (error) {
      console.error('[ContextAirlock] Compare snapshots error:', error.message);
      throw error;
    }
  }

  /**
   * Log snapshot diff
   */
  async logDiff(fromSnapshotId, toSnapshotId, change) {
    const {
      changeType,
      changePath,
      oldValue,
      newValue,
      impactLevel = 'minor',
      impactDescription
    } = change;

    try {
      await this.db.query(`
        INSERT INTO snapshot_diffs (
          from_snapshot_id,
          to_snapshot_id,
          change_type,
          change_path,
          old_value,
          new_value,
          impact_level,
          impact_description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        fromSnapshotId,
        toSnapshotId,
        changeType,
        changePath,
        oldValue,
        newValue,
        impactLevel,
        impactDescription
      ]);

    } catch (error) {
      console.error('[ContextAirlock] Log diff error:', error.message);
      throw error;
    }
  }

  /**
   * Detect context drift
   */
  async detectDrift(domainContext, options = {}) {
    const {
      bucketId,
      checkType = 'config',
      threshold = 0.1
    } = options;

    try {
      // Get current snapshot
      const currentSnapshot = await this.getCurrentSnapshot(domainContext);

      if (!currentSnapshot) {
        console.log(`[ContextAirlock] No current snapshot for: ${domainContext}`);
        return null;
      }

      // Get recent drift events
      const driftResult = await this.db.query(`
        SELECT * FROM recent_drift_events
        WHERE domain_context = $1 AND resolved = false
        ORDER BY drift_severity DESC, detected_at DESC
      `, [domainContext]);

      return {
        domainContext,
        currentSnapshot: currentSnapshot.snapshot_id,
        driftEvents: driftResult.rows,
        hasDrift: driftResult.rows.length > 0,
        criticalDrift: driftResult.rows.filter(d => d.drift_severity === 'critical').length
      };

    } catch (error) {
      console.error('[ContextAirlock] Detect drift error:', error.message);
      throw error;
    }
  }

  /**
   * Log drift event
   */
  async logDrift(snapshotId, drift) {
    const {
      bucketId,
      domainContext,
      driftType,
      driftSeverity = 'low',
      expectedValue,
      actualValue,
      driftMagnitude,
      performanceImpact,
      requestsAffected
    } = drift;

    try {
      await this.db.query(`
        INSERT INTO context_drift_log (
          snapshot_id,
          bucket_id,
          domain_context,
          drift_type,
          drift_severity,
          expected_value,
          actual_value,
          drift_magnitude,
          performance_impact,
          requests_affected
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        snapshotId,
        bucketId,
        domainContext,
        driftType,
        driftSeverity,
        expectedValue,
        actualValue,
        driftMagnitude,
        performanceImpact,
        requestsAffected
      ]);

      console.log(`[ContextAirlock] Logged drift: ${driftType} (${driftSeverity})`);

    } catch (error) {
      console.error('[ContextAirlock] Log drift error:', error.message);
      throw error;
    }
  }

  /**
   * Resolve drift
   */
  async resolveDrift(driftId, resolution) {
    const {
      resolutionAction,
      resolvedBy
    } = resolution;

    try {
      await this.db.query(`
        UPDATE context_drift_log
        SET
          resolved = true,
          resolution_action = $2,
          resolved_at = NOW(),
          resolved_by = $3
        WHERE drift_id = $1
      `, [driftId, resolutionAction, resolvedBy]);

      console.log(`[ContextAirlock] Resolved drift: ${driftId}`);

    } catch (error) {
      console.error('[ContextAirlock] Resolve drift error:', error.message);
      throw error;
    }
  }

  /**
   * Deploy snapshot to environment
   */
  async deploySnapshot(snapshotId, environment, options = {}) {
    const {
      bucketId,
      deployedBy,
      deploymentMethod = 'manual',
      deploymentReason
    } = options;

    try {
      await this.db.query(`
        INSERT INTO snapshot_deployments (
          snapshot_id,
          environment,
          bucket_id,
          deployed_by,
          deployment_method,
          deployment_reason
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        snapshotId,
        environment,
        bucketId,
        deployedBy,
        deploymentMethod,
        deploymentReason
      ]);

      console.log(`[ContextAirlock] Deployed ${snapshotId} to ${environment}`);

    } catch (error) {
      console.error('[ContextAirlock] Deploy snapshot error:', error.message);
      throw error;
    }
  }

  /**
   * Validate snapshot
   */
  async validateSnapshot(snapshotId, validation) {
    const {
      validationType,
      testName,
      testCase,
      passed,
      score,
      errorMessage,
      output,
      executionTimeMs,
      validatedBy
    } = validation;

    try {
      await this.db.query(`
        INSERT INTO snapshot_validations (
          snapshot_id,
          validation_type,
          test_name,
          test_case,
          passed,
          score,
          error_message,
          output,
          execution_time_ms,
          validated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        snapshotId,
        validationType,
        testName,
        testCase,
        passed,
        score,
        errorMessage,
        output,
        executionTimeMs,
        validatedBy
      ]);

      console.log(`[ContextAirlock] Validated ${snapshotId}: ${validationType} - ${passed ? 'PASS' : 'FAIL'}`);

    } catch (error) {
      console.error('[ContextAirlock] Validate snapshot error:', error.message);
      throw error;
    }
  }

  /**
   * Get validation results for snapshot
   */
  async getValidations(snapshotId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM snapshot_validations
        WHERE snapshot_id = $1
        ORDER BY validated_at DESC
      `, [snapshotId]);

      return result.rows;

    } catch (error) {
      console.error('[ContextAirlock] Get validations error:', error.message);
      throw error;
    }
  }

  /**
   * Get deployment history
   */
  async getDeployments(snapshotId = null, environment = null) {
    try {
      let query = `
        SELECT * FROM snapshot_deployments
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      if (snapshotId) {
        query += ` AND snapshot_id = $${paramIndex}`;
        params.push(snapshotId);
        paramIndex++;
      }

      if (environment) {
        query += ` AND environment = $${paramIndex}`;
        params.push(environment);
        paramIndex++;
      }

      query += ' ORDER BY deployed_at DESC';

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[ContextAirlock] Get deployments error:', error.message);
      throw error;
    }
  }

  /**
   * Get performance comparison across snapshots
   */
  async getPerformanceComparison(domainContext = null) {
    try {
      let query = `
        SELECT * FROM snapshot_performance_comparison
      `;

      const params = [];

      if (domainContext) {
        query += ' WHERE domain_context = $1';
        params.push(domainContext);
      }

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[ContextAirlock] Get performance comparison error:', error.message);
      throw error;
    }
  }

  /**
   * Archive old snapshots
   */
  async archiveOldSnapshots(domainContext, keepCount = 10) {
    try {
      // Keep the most recent N snapshots + all golden snapshots
      const result = await this.db.query(`
        UPDATE domain_context_snapshots
        SET status = 'archived'
        WHERE snapshot_id IN (
          SELECT snapshot_id
          FROM domain_context_snapshots
          WHERE domain_context = $1
            AND is_golden = false
            AND is_current = false
            AND status != 'archived'
          ORDER BY created_at DESC
          OFFSET $2
        )
        RETURNING snapshot_id
      `, [domainContext, keepCount]);

      console.log(`[ContextAirlock] Archived ${result.rows.length} old snapshots for: ${domainContext}`);

      return result.rows.length;

    } catch (error) {
      console.error('[ContextAirlock] Archive snapshots error:', error.message);
      throw error;
    }
  }

  /**
   * Get snapshot statistics
   */
  async getStatistics(domainContext = null) {
    try {
      let query = `
        SELECT
          COUNT(*) as total_snapshots,
          COUNT(CASE WHEN is_golden THEN 1 END) as golden_snapshots,
          COUNT(CASE WHEN is_current THEN 1 END) as current_snapshots,
          COUNT(CASE WHEN status = 'production' THEN 1 END) as production_snapshots,
          COUNT(DISTINCT domain_context) as unique_domains,
          AVG(avg_success_rate) as avg_success_rate
        FROM domain_context_snapshots
        WHERE status != 'archived'
      `;

      const params = [];

      if (domainContext) {
        query += ' AND domain_context = $1';
        params.push(domainContext);
      }

      const result = await this.db.query(query, params);

      return result.rows[0];

    } catch (error) {
      console.error('[ContextAirlock] Get statistics error:', error.message);
      throw error;
    }
  }
}

module.exports = ContextAirlock;
