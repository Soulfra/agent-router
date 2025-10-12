/**
 * Data Replicator
 *
 * Manages data replication and synchronization across multiple sources.
 * Provides data redundancy, validation, and gap filling.
 *
 * Features:
 * - Multi-source data fetching
 * - Cross-source validation
 * - Conflict resolution
 * - Data quality scoring
 * - Automatic fallback
 * - Gap detection and filling
 */

const { Pool } = require('pg');

class DataReplicator {
  constructor(options = {}) {
    this.db = options.db || new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || process.env.USER,
      password: process.env.DB_PASSWORD || ''
    });

    // Data sources (functions that fetch data)
    this.sources = new Map();

    // Replication strategy
    this.strategy = options.strategy || 'first-success'; // 'first-success', 'majority', 'average', 'all'

    // Validation settings
    this.maxVariance = options.maxVariance || 0.05; // 5% max variance between sources
    this.minSources = options.minSources || 1; // Minimum sources needed for validation

    // Statistics
    this.stats = {
      replications: 0,
      conflicts: 0,
      resolved: 0,
      gapsFilled: 0,
      failures: 0
    };
  }

  /**
   * Register a data source
   *
   * @param {String} name - Source name
   * @param {Function} fetchFn - Async function that fetches data
   * @param {Object} options - Source options
   * @param {Number} options.priority - Priority (lower = higher priority, default: 10)
   * @param {Number} options.weight - Weight for averaging (default: 1.0)
   * @param {Boolean} options.enabled - Enabled (default: true)
   *
   * @example
   * replicator.registerSource('coingecko', async (symbol) => {
   *   return await fetchFromCoinGecko(symbol);
   * }, { priority: 1, weight: 1.0 });
   */
  registerSource(name, fetchFn, options = {}) {
    this.sources.set(name, {
      name,
      fetchFn,
      priority: options.priority || 10,
      weight: options.weight || 1.0,
      enabled: options.enabled !== false,
      stats: {
        requests: 0,
        successes: 0,
        failures: 0,
        averageLatency: 0
      }
    });

    console.log(`[DataReplicator] Registered source: ${name} (priority: ${options.priority || 10})`);
    return this;
  }

  /**
   * Fetch data from multiple sources and replicate
   *
   * @param {String} dataType - Type of data (e.g., 'price', 'quote')
   * @param {Object} params - Parameters for fetching (e.g., { symbol: 'BTC' })
   * @returns {Object} Replicated and validated data
   */
  async replicate(dataType, params) {
    console.log(`[DataReplicator] Replicating ${dataType} with params:`, params);

    const enabledSources = Array.from(this.sources.values())
      .filter(s => s.enabled)
      .sort((a, b) => a.priority - b.priority);

    if (enabledSources.length === 0) {
      throw new Error('No data sources available');
    }

    const results = [];
    const errors = [];

    // Fetch from sources based on strategy
    if (this.strategy === 'first-success') {
      // Try sources in priority order until one succeeds
      for (const source of enabledSources) {
        try {
          const result = await this._fetchFromSource(source, params);
          results.push({ source: source.name, data: result });
          break; // Stop after first success
        } catch (error) {
          errors.push({ source: source.name, error: error.message });
        }
      }
    } else {
      // Fetch from all sources in parallel
      const promises = enabledSources.map(async (source) => {
        try {
          const result = await this._fetchFromSource(source, params);
          return { source: source.name, data: result, success: true };
        } catch (error) {
          return { source: source.name, error: error.message, success: false };
        }
      });

      const allResults = await Promise.all(promises);
      results.push(...allResults.filter(r => r.success));
      errors.push(...allResults.filter(r => !r.success));
    }

    this.stats.replications++;

    if (results.length === 0) {
      this.stats.failures++;
      throw new Error(`All sources failed: ${JSON.stringify(errors)}`);
    }

    // Validate and resolve conflicts
    const validated = this._validate(results);

    // Save to database
    await this._saveReplica(dataType, params, validated, results);

    return validated;
  }

  /**
   * Detect and fill gaps in historical data
   *
   * @param {String} table - Database table name
   * @param {String} timestampColumn - Name of timestamp column
   * @param {Number} expectedInterval - Expected interval between records (in seconds)
   * @returns {Array} Array of gaps found
   */
  async detectGaps(table, timestampColumn = 'recorded_at', expectedInterval = 60) {
    const query = `
      SELECT
        ${timestampColumn} as current_time,
        LAG(${timestampColumn}) OVER (ORDER BY ${timestampColumn}) as previous_time,
        EXTRACT(EPOCH FROM (${timestampColumn} - LAG(${timestampColumn}) OVER (ORDER BY ${timestampColumn}))) as gap_seconds
      FROM ${table}
      ORDER BY ${timestampColumn} DESC
      LIMIT 1000
    `;

    const result = await this.db.query(query);
    const gaps = result.rows.filter(row => row.gap_seconds > expectedInterval * 1.5);

    console.log(`[DataReplicator] Found ${gaps.length} gaps in ${table}`);
    return gaps;
  }

  /**
   * Fill gaps by fetching historical data
   *
   * @param {String} dataType - Type of data
   * @param {Array} gaps - Array of gaps to fill
   * @param {Object} params - Parameters for fetching
   */
  async fillGaps(dataType, gaps, params) {
    console.log(`[DataReplicator] Filling ${gaps.length} gaps...`);

    let filled = 0;
    for (const gap of gaps) {
      try {
        // Attempt to fetch historical data for the gap period
        await this.replicate(dataType, {
          ...params,
          timestamp: gap.previous_time
        });
        filled++;
        this.stats.gapsFilled++;
      } catch (error) {
        console.error(`[DataReplicator] Failed to fill gap at ${gap.previous_time}:`, error.message);
      }
    }

    console.log(`[DataReplicator] Filled ${filled}/${gaps.length} gaps`);
    return filled;
  }

  /**
   * Get replication statistics
   */
  getStats() {
    const sourceStats = {};
    for (const [name, source] of this.sources.entries()) {
      sourceStats[name] = {
        enabled: source.enabled,
        priority: source.priority,
        weight: source.weight,
        ...source.stats
      };
    }

    return {
      ...this.stats,
      sources: sourceStats,
      strategy: this.strategy
    };
  }

  /**
   * Fetch data from a specific source
   * @private
   */
  async _fetchFromSource(source, params) {
    const startTime = Date.now();
    source.stats.requests++;

    try {
      const data = await source.fetchFn(params);

      const latency = Date.now() - startTime;
      source.stats.successes++;

      // Update average latency
      const totalLatency = source.stats.averageLatency * (source.stats.successes - 1) + latency;
      source.stats.averageLatency = Math.round(totalLatency / source.stats.successes);

      return data;
    } catch (error) {
      source.stats.failures++;
      throw error;
    }
  }

  /**
   * Validate data from multiple sources
   * @private
   */
  _validate(results) {
    if (results.length === 1) {
      return results[0].data;
    }

    // Check for conflicts
    const values = results.map(r => r.data.price || r.data.value);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.map(v => Math.abs((v - avg) / avg));
    const maxVar = Math.max(...variance);

    if (maxVar > this.maxVariance) {
      console.warn(`[DataReplicator] High variance detected: ${(maxVar * 100).toFixed(2)}%`);
      this.stats.conflicts++;
    }

    // Resolve based on strategy
    let resolved;
    switch (this.strategy) {
      case 'majority':
        // Use most common value (simplified - just use mode)
        resolved = results[0].data; // TODO: Implement proper majority voting
        break;

      case 'average':
        // Calculate weighted average
        const totalWeight = results.reduce((sum, r) => {
          const source = this.sources.get(r.source);
          return sum + source.weight;
        }, 0);

        const weightedSum = results.reduce((sum, r) => {
          const source = this.sources.get(r.source);
          const value = r.data.price || r.data.value;
          return sum + (value * source.weight);
        }, 0);

        resolved = { ...results[0].data };
        resolved.price = weightedSum / totalWeight;
        resolved.source = 'average';
        break;

      case 'all':
        // Return all results
        resolved = {
          sources: results,
          average: avg,
          variance: maxVar
        };
        break;

      default: // 'first-success'
        resolved = results[0].data;
    }

    this.stats.resolved++;
    return resolved;
  }

  /**
   * Save replicated data to database
   * @private
   */
  async _saveReplica(dataType, params, validatedData, allResults) {
    try {
      // Save main data
      const query = `
        INSERT INTO data_replicas (
          data_type,
          params,
          validated_data,
          source_count,
          sources,
          replicated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `;

      await this.db.query(query, [
        dataType,
        JSON.stringify(params),
        JSON.stringify(validatedData),
        allResults.length,
        JSON.stringify(allResults.map(r => r.source))
      ]);
    } catch (error) {
      // Table might not exist - that's okay, replication still works
      console.debug('[DataReplicator] Could not save replica to database:', error.message);
    }
  }
}

module.exports = DataReplicator;
