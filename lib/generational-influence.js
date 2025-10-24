/**
 * Generational Influence System (Pokemon-Style)
 *
 * Features:
 * - Track how one player's actions influence future players
 * - Cross-generation effects (Gen 1 players affect Gen 2, etc.)
 * - World state evolution based on community behavior
 * - NPC personality changes across generations
 * - Quest availability influenced by past generations
 * - Loot table modifications based on community actions
 * - Sentiment tracking and aggregation
 */

class GenerationalInfluence {
  constructor(db, mailboxSystem) {
    if (!db) {
      throw new Error('Database instance required for GenerationalInfluence');
    }
    this.db = db;
    this.mailboxSystem = mailboxSystem;

    // Current generation counter
    this.currentGeneration = 1;

    // Generation thresholds (trigger new generation after X days)
    this.generationDurationDays = 90; // 3 months per generation

    console.log('[GenerationalInfluence] Initialized');
    this.loadCurrentGeneration();
  }

  /**
   * Load current generation from database or config
   */
  async loadCurrentGeneration() {
    try {
      // Calculate generation based on app launch date
      // In production, store this in database
      const launchDate = new Date('2024-01-01'); // Your app launch date
      const now = new Date();
      const daysSinceLaunch = Math.floor((now - launchDate) / (1000 * 60 * 60 * 24));
      this.currentGeneration = Math.floor(daysSinceLaunch / this.generationDurationDays) + 1;

      console.log(`[GenerationalInfluence] Current generation: ${this.currentGeneration}`);
    } catch (error) {
      console.error('[GenerationalInfluence] Error loading generation:', error);
      this.currentGeneration = 1;
    }
  }

  /**
   * Get current generation number
   */
  getCurrentGeneration() {
    return this.currentGeneration;
  }

  /**
   * Create an influence record
   */
  async createInfluence({
    sourceType,
    sourceId,
    effectType,
    targetType,
    targetId,
    affectsGeneration = null,
    weight = 1.0,
    effectData = {}
  }) {
    try {
      // Default: affect next generation
      const targetGeneration = affectsGeneration || this.currentGeneration + 1;

      const result = await this.db.query(
        `INSERT INTO generational_influences (
          source_type,
          source_id,
          effect_type,
          target_type,
          target_id,
          source_generation,
          affects_generation,
          weight,
          effect_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING influence_id`,
        [
          sourceType,
          sourceId,
          effectType,
          targetType,
          targetId,
          this.currentGeneration,
          targetGeneration,
          weight,
          JSON.stringify(effectData)
        ]
      );

      const influenceId = result.rows[0].influence_id;

      console.log(`[GenerationalInfluence] Created influence: ${sourceType} → ${targetType} (Gen ${this.currentGeneration} → ${targetGeneration})`);

      return {
        success: true,
        influenceId,
        sourceGeneration: this.currentGeneration,
        affectsGeneration: targetGeneration
      };
    } catch (error) {
      console.error('[GenerationalInfluence] Error creating influence:', error);
      throw error;
    }
  }

  /**
   * Get influences affecting current generation
   */
  async getActiveInfluences({ targetType = null, targetId = null } = {}) {
    try {
      let query = `
        SELECT
          influence_id,
          source_type,
          source_id,
          effect_type,
          target_type,
          target_id,
          source_generation,
          affects_generation,
          weight,
          effect_data,
          created_at
        FROM generational_influences
        WHERE affects_generation = $1
      `;
      const params = [this.currentGeneration];

      if (targetType) {
        query += ` AND target_type = $${params.length + 1}`;
        params.push(targetType);
      }

      if (targetId) {
        query += ` AND target_id = $${params.length + 1}`;
        params.push(targetId);
      }

      query += ` ORDER BY weight DESC, created_at DESC`;

      const result = await this.db.query(query, params);

      return {
        success: true,
        influences: result.rows,
        count: result.rows.length,
        generation: this.currentGeneration
      };
    } catch (error) {
      console.error('[GenerationalInfluence] Error getting active influences:', error);
      throw error;
    }
  }

  /**
   * Track community action that influences future generations
   */
  async trackCommunityAction({
    actionType,
    userId,
    targetType,
    targetId,
    sentiment = 0, // -1 to 1
    metadata = {}
  }) {
    try {
      // Create influence record
      const effectData = {
        userId,
        actionType,
        sentiment,
        metadata,
        timestamp: new Date()
      };

      let effectType = 'community_action';
      let weight = Math.abs(sentiment);

      // Determine effect based on action type
      if (actionType === 'npc_interaction') {
        effectType = 'npc_personality';
      } else if (actionType === 'quest_completion') {
        effectType = 'quest_availability';
      } else if (actionType === 'item_discovery') {
        effectType = 'loot_table';
      } else if (actionType === 'world_event') {
        effectType = 'world_state';
      }

      const result = await this.createInfluence({
        sourceType: 'player_action',
        sourceId: userId,
        effectType,
        targetType,
        targetId,
        weight,
        effectData
      });

      console.log(`[GenerationalInfluence] Tracked action: ${actionType} by ${userId} (sentiment: ${sentiment})`);

      return result;
    } catch (error) {
      console.error('[GenerationalInfluence] Error tracking community action:', error);
      throw error;
    }
  }

  /**
   * Apply influences to an entity (NPC, quest, world state)
   */
  async applyInfluences(targetType, targetId) {
    try {
      const result = await this.getActiveInfluences({ targetType, targetId });

      if (result.count === 0) {
        return {
          success: true,
          applied: false,
          message: 'No influences to apply'
        };
      }

      const influences = result.influences;

      // Aggregate influences by effect type
      const aggregated = this.aggregateInfluences(influences);

      // Apply based on target type
      let applied = false;

      if (targetType === 'npc') {
        applied = await this.applyNPCInfluences(targetId, aggregated);
      } else if (targetType === 'quest') {
        applied = await this.applyQuestInfluences(targetId, aggregated);
      } else if (targetType === 'world') {
        applied = await this.applyWorldInfluences(targetId, aggregated);
      }

      return {
        success: true,
        applied,
        influenceCount: influences.length,
        aggregated
      };
    } catch (error) {
      console.error('[GenerationalInfluence] Error applying influences:', error);
      throw error;
    }
  }

  /**
   * Aggregate influences by effect type
   */
  aggregateInfluences(influences) {
    const aggregated = {};

    for (const influence of influences) {
      const effectType = influence.effect_type;

      if (!aggregated[effectType]) {
        aggregated[effectType] = {
          totalWeight: 0,
          sentimentSum: 0,
          count: 0,
          effects: []
        };
      }

      const effect = aggregated[effectType];
      effect.totalWeight += influence.weight;
      effect.count++;
      effect.effects.push(influence);

      // Extract sentiment from effect_data if available
      if (influence.effect_data && influence.effect_data.sentiment) {
        effect.sentimentSum += influence.effect_data.sentiment * influence.weight;
      }
    }

    // Calculate average sentiment for each effect type
    for (const effectType in aggregated) {
      const effect = aggregated[effectType];
      effect.averageSentiment = effect.totalWeight > 0
        ? effect.sentimentSum / effect.totalWeight
        : 0;
    }

    return aggregated;
  }

  /**
   * Apply influences to NPC personality
   */
  async applyNPCInfluences(npcId, aggregated) {
    if (!aggregated.npc_personality) {
      return false;
    }

    const effect = aggregated.npc_personality;
    const sentiment = effect.averageSentiment;

    // Update NPC sentiment score in database
    await this.db.query(
      `UPDATE npc_registry
       SET
         sentiment_score = $1,
         updated_at = NOW()
       WHERE npc_id = $2`,
      [sentiment * 10, npcId] // Scale to -10 to 10 range
    );

    console.log(`[GenerationalInfluence] Applied NPC influence: ${npcId} sentiment=${sentiment}`);

    return true;
  }

  /**
   * Apply influences to quest availability
   */
  async applyQuestInfluences(questId, aggregated) {
    if (!aggregated.quest_availability) {
      return false;
    }

    const effect = aggregated.quest_availability;

    // In production, update quest table based on influences
    console.log(`[GenerationalInfluence] Applied quest influence: ${questId} weight=${effect.totalWeight}`);

    return true;
  }

  /**
   * Apply influences to world state
   */
  async applyWorldInfluences(worldId, aggregated) {
    if (!aggregated.world_state) {
      return false;
    }

    const effect = aggregated.world_state;

    // In production, update world state table based on influences
    console.log(`[GenerationalInfluence] Applied world influence: ${worldId} weight=${effect.totalWeight}`);

    return true;
  }

  /**
   * Get generation summary (for new players)
   */
  async getGenerationSummary(generation = null) {
    const targetGen = generation || this.currentGeneration;

    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) as total_influences,
          COUNT(DISTINCT source_id) as unique_players,
          AVG(weight) as avg_weight,
          effect_type,
          COUNT(*) as effect_count
         FROM generational_influences
         WHERE source_generation = $1
         GROUP BY effect_type`,
        [targetGen]
      );

      return {
        success: true,
        generation: targetGen,
        summary: result.rows,
        totalInfluences: result.rows.reduce((sum, row) => sum + parseInt(row.effect_count), 0)
      };
    } catch (error) {
      console.error('[GenerationalInfluence] Error getting generation summary:', error);
      throw error;
    }
  }

  /**
   * Notify players about their influence on future generations
   */
  async notifyPlayerInfluence(userId) {
    try {
      // Get all influences created by this player
      const result = await this.db.query(
        `SELECT
          COUNT(*) as influence_count,
          SUM(weight) as total_weight,
          effect_type,
          COUNT(*) as effect_count
         FROM generational_influences
         WHERE effect_data->>'userId' = $1
         GROUP BY effect_type`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          success: true,
          hasInfluence: false
        };
      }

      // Send notification via mailbox
      const summary = result.rows
        .map(row => `- ${row.effect_type}: ${row.effect_count} influence(s)`)
        .join('\n');

      if (this.mailboxSystem) {
        // Get System Administrator NPC
        const npcResult = await this.db.query(
          `SELECT npc_id FROM npc_registry WHERE npc_name = 'System Administrator' LIMIT 1`
        );

        if (npcResult.rows.length > 0) {
          await this.mailboxSystem.sendNpcMail({
            npcId: npcResult.rows[0].npc_id,
            toUserId: userId,
            subject: 'Your Influence on Future Generations',
            body: `Traveler,\n\nYour actions in Generation ${this.currentGeneration} will shape the world for future generations:\n\n${summary}\n\nYour legacy lives on.\n\n- CalOS System`
          });
        }
      }

      return {
        success: true,
        hasInfluence: true,
        influences: result.rows
      };
    } catch (error) {
      console.error('[GenerationalInfluence] Error notifying player:', error);
      throw error;
    }
  }

  /**
   * Advance to next generation (manual trigger or scheduled)
   */
  async advanceGeneration() {
    const oldGeneration = this.currentGeneration;
    this.currentGeneration++;

    console.log(`[GenerationalInfluence] Advanced generation: ${oldGeneration} → ${this.currentGeneration}`);

    // Apply all pending influences
    await this.applyAllPendingInfluences();

    // Notify all players
    // (In production, send bulk notifications via background job)

    return {
      success: true,
      oldGeneration,
      newGeneration: this.currentGeneration
    };
  }

  /**
   * Apply all pending influences for current generation
   */
  async applyAllPendingInfluences() {
    try {
      // Get all unique target entities for current generation
      const result = await this.db.query(
        `SELECT DISTINCT target_type, target_id
         FROM generational_influences
         WHERE affects_generation = $1`,
        [this.currentGeneration]
      );

      let applied = 0;

      for (const row of result.rows) {
        const { target_type, target_id } = row;
        await this.applyInfluences(target_type, target_id);
        applied++;
      }

      console.log(`[GenerationalInfluence] Applied ${applied} influence targets for Gen ${this.currentGeneration}`);

      return applied;
    } catch (error) {
      console.error('[GenerationalInfluence] Error applying pending influences:', error);
      throw error;
    }
  }

  /**
   * Get statistics
   */
  async getStats() {
    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) as total_influences,
          COUNT(DISTINCT source_id) as unique_sources,
          COUNT(DISTINCT target_id) as unique_targets,
          MIN(source_generation) as first_generation,
          MAX(affects_generation) as last_generation
         FROM generational_influences`
      );

      return {
        success: true,
        currentGeneration: this.currentGeneration,
        ...result.rows[0]
      };
    } catch (error) {
      console.error('[GenerationalInfluence] Error getting stats:', error);
      throw error;
    }
  }
}

module.exports = GenerationalInfluence;
