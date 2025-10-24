/**
 * AI Instance Registry
 *
 * "Named AI instances with personalities"
 *
 * Problem:
 * - User wants named AI instances: 'cal' (Claude Code), 'ralph' (Ollama)
 * - Each instance should have personality, preferences, cost tracking
 * - Need to distinguish between providers (local vs API)
 * - Support bash commands (bin/cal, bin/ralph)
 *
 * Solution:
 * - Registry of named AI instances
 * - Each instance has: provider, model, personality, cost profile
 * - Tracks usage per instance
 * - Easy routing: "Ask cal" → Claude Code, "Ask ralph" → Ollama
 *
 * Examples:
 * - cal: Claude Code (local subscription, free, coding expert)
 * - ralph: Ollama Mistral (local, free, creative tasks)
 * - deepthink: DeepSeek (API, reasoning tasks)
 * - gpt: OpenAI GPT-4 (API, general purpose)
 */

const crypto = require('crypto');

class AIInstanceRegistry {
  constructor(options = {}) {
    this.multiLLMRouter = options.multiLLMRouter;
    this.db = options.db;
    this.aiCostAnalytics = options.aiCostAnalytics; // Cost analytics engine

    // Registry: instanceName -> instance config
    this.instances = new Map();

    // Usage tracking: instanceName -> usage stats
    this.usageStats = new Map();

    // Initialize default instances
    this.initializeDefaultInstances();

    console.log('[AIInstanceRegistry] Initialized with analytics:', !!this.aiCostAnalytics);
  }

  /**
   * Initialize default AI instances
   */
  initializeDefaultInstances() {
    // Cal - Claude Code (local subscription)
    this.registerInstance({
      name: 'cal',
      displayName: 'Cal',
      provider: 'claude-code',
      model: 'claude-sonnet-4.5',
      personality: {
        style: 'Technical but accessible, direct, no bullshit',
        expertise: ['coding', 'architecture', 'system design', 'debugging'],
        catchphrases: ['WE ALREADY HAVE THIS', 'Wire it together', 'Sign everything'],
        values: ['Cryptographic proof', 'Federation', 'Self-sovereign identity']
      },
      costProfile: {
        type: 'local-subscription',
        costPerToken: 0,
        free: true,
        source: 'Claude Code desktop app'
      },
      preferences: {
        temperature: 0.7,
        maxTokens: 4000,
        systemPrompt: 'You are Cal, a technical architect who values cryptographic proof and self-sovereign systems. Be direct and practical.'
      },
      enabled: true
    });

    // Ralph - Ollama (local models)
    this.registerInstance({
      name: 'ralph',
      displayName: 'Ralph',
      provider: 'ollama',
      model: 'mistral:latest',
      personality: {
        style: 'Creative, exploratory, philosophical',
        expertise: ['creative writing', 'brainstorming', 'context compression', 'local inference'],
        catchphrases: ['Let me think about this locally', 'No API needed', 'Privacy first'],
        values: ['Local processing', 'Privacy', 'Open source']
      },
      costProfile: {
        type: 'local-hardware',
        costPerToken: 0,
        free: true,
        source: 'Ollama local models'
      },
      preferences: {
        temperature: 0.8,
        maxTokens: 2000,
        systemPrompt: 'You are Ralph, a creative AI running locally on Ollama. You value privacy and open source.'
      },
      enabled: true
    });

    // DeepThink - DeepSeek (reasoning)
    this.registerInstance({
      name: 'deepthink',
      displayName: 'DeepThink',
      provider: 'deepseek',
      model: 'deepseek-chat',
      personality: {
        style: 'Analytical, methodical, detail-oriented',
        expertise: ['reasoning', 'analysis', 'problem solving', 'math', 'logic'],
        catchphrases: ['Let me analyze this', 'Breaking down the problem', 'Step by step'],
        values: ['Rigor', 'Logic', 'Precision']
      },
      costProfile: {
        type: 'api',
        costPerToken: 0.00027, // $0.27 per 1M tokens
        free: false,
        source: 'DeepSeek API'
      },
      preferences: {
        temperature: 0.3,
        maxTokens: 4000,
        systemPrompt: 'You are DeepThink, an analytical AI specialized in reasoning and problem solving. Think step by step.'
      },
      enabled: false // Disabled by default (requires API key)
    });

    // GPT - OpenAI (general purpose)
    this.registerInstance({
      name: 'gpt',
      displayName: 'GPT',
      provider: 'openai',
      model: 'gpt-4-turbo-preview',
      personality: {
        style: 'Helpful, versatile, polished',
        expertise: ['general knowledge', 'creative writing', 'coding', 'analysis'],
        catchphrases: ['I can help with that', 'Let me assist you', 'Here is what I found'],
        values: ['Helpfulness', 'Accuracy', 'Safety']
      },
      costProfile: {
        type: 'api',
        costPerToken: 0.01, // $10 per 1M input tokens
        free: false,
        source: 'OpenAI API'
      },
      preferences: {
        temperature: 0.7,
        maxTokens: 4000,
        systemPrompt: 'You are GPT, a helpful AI assistant from OpenAI.'
      },
      enabled: false // Disabled by default (requires API key)
    });

    // Claude - Anthropic API (different from Claude Code)
    this.registerInstance({
      name: 'claude',
      displayName: 'Claude (API)',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      personality: {
        style: 'Thoughtful, nuanced, careful',
        expertise: ['reasoning', 'analysis', 'coding', 'writing'],
        catchphrases: ['Let me think carefully', 'To clarify', 'Important to note'],
        values: ['Safety', 'Helpfulness', 'Honesty']
      },
      costProfile: {
        type: 'api',
        costPerToken: 0.003, // $3 per 1M input tokens
        free: false,
        source: 'Anthropic API'
      },
      preferences: {
        temperature: 0.7,
        maxTokens: 4000,
        systemPrompt: 'You are Claude from Anthropic, helpful and thoughtful.'
      },
      enabled: false // Disabled by default (requires API key)
    });

    console.log('[AIInstanceRegistry] Registered 5 default instances: cal (free), ralph (free), deepthink, gpt, claude');
  }

  /**
   * Register a new AI instance
   */
  registerInstance(instance) {
    const instanceId = crypto.randomUUID();

    const fullInstance = {
      instanceId,
      name: instance.name,
      displayName: instance.displayName || instance.name,
      provider: instance.provider,
      model: instance.model,
      personality: instance.personality || {},
      costProfile: instance.costProfile || { type: 'unknown', costPerToken: 0, free: true },
      preferences: instance.preferences || {},
      enabled: instance.enabled !== false,
      createdAt: new Date().toISOString(),
      metadata: instance.metadata || {}
    };

    this.instances.set(instance.name, fullInstance);

    // Initialize usage tracking
    this.usageStats.set(instance.name, {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      successCount: 0,
      errorCount: 0,
      lastUsed: null
    });

    console.log(`[AIInstanceRegistry] Registered instance: ${instance.name} (${instance.provider}/${instance.model})`);

    return fullInstance;
  }

  /**
   * Get instance by name
   */
  getInstance(name) {
    return this.instances.get(name);
  }

  /**
   * List all instances
   */
  listInstances({ enabledOnly = false, provider = null } = {}) {
    let instances = Array.from(this.instances.values());

    if (enabledOnly) {
      instances = instances.filter(i => i.enabled);
    }

    if (provider) {
      instances = instances.filter(i => i.provider === provider);
    }

    return instances;
  }

  /**
   * Ask a specific AI instance
   *
   * @param {string} instanceName - Name of the instance (cal, ralph, etc.)
   * @param {object} request - Request object
   * @returns {Promise<object>} Response
   */
  async ask(instanceName, request) {
    const instance = this.getInstance(instanceName);

    if (!instance) {
      throw new Error(`AI instance '${instanceName}' not found. Available: ${Array.from(this.instances.keys()).join(', ')}`);
    }

    if (!instance.enabled) {
      throw new Error(`AI instance '${instanceName}' is disabled`);
    }

    console.log(`[AIInstanceRegistry] Asking ${instanceName} (${instance.provider}/${instance.model})`);

    const startTime = Date.now();

    try {
      // Merge instance preferences with request
      const fullRequest = {
        provider: instance.provider,
        model: instance.model,
        temperature: request.temperature !== undefined ? request.temperature : instance.preferences.temperature,
        maxTokens: request.maxTokens || instance.preferences.maxTokens,
        systemPrompt: request.systemPrompt || instance.preferences.systemPrompt,
        prompt: request.prompt,
        messages: request.messages,
        stream: request.stream || false
      };

      // Route through MultiLLMRouter
      const response = await this.multiLLMRouter.complete(fullRequest);

      const latency = Date.now() - startTime;

      // Track usage
      this.trackUsage(instanceName, {
        tokens: response.usage?.total_tokens || 0,
        cost: response.cost || 0,
        latency,
        success: true,
        provider: instance.provider,
        model: instance.model
      });

      // Add instance metadata to response
      return {
        ...response,
        instance: {
          name: instanceName,
          displayName: instance.displayName,
          provider: instance.provider,
          model: instance.model,
          costProfile: instance.costProfile
        },
        latency
      };

    } catch (error) {
      console.error(`[AIInstanceRegistry] Error asking ${instanceName}:`, error.message);

      const latency = Date.now() - startTime;

      // Track error
      this.trackUsage(instanceName, {
        tokens: 0,
        cost: 0,
        latency,
        success: false,
        provider: instance.provider,
        model: instance.model,
        errorMessage: error.message
      });

      throw error;
    }
  }

  /**
   * Track usage for an instance
   * @private
   */
  trackUsage(instanceName, { tokens, cost, success, latency, provider, model, errorMessage }) {
    const stats = this.usageStats.get(instanceName);
    if (!stats) return;

    stats.totalRequests++;
    stats.totalTokens += tokens;
    stats.totalCost += cost;
    stats.lastUsed = new Date().toISOString();

    if (success) {
      stats.successCount++;
    } else {
      stats.errorCount++;
    }

    this.usageStats.set(instanceName, stats);

    // Send to analytics engine
    if (this.aiCostAnalytics) {
      this.aiCostAnalytics.recordUsage({
        instanceName,
        provider,
        model,
        tokens,
        cost,
        latency,
        success,
        errorMessage
      }).catch(err => {
        console.error('[AIInstanceRegistry] Error recording analytics:', err.message);
      });
    }

    // Log to database if available
    if (this.db) {
      this._logUsageToDatabase(instanceName, { tokens, cost, success }).catch(err => {
        console.error('[AIInstanceRegistry] Error logging usage:', err.message);
      });
    }
  }

  /**
   * Get usage stats for an instance
   */
  getUsageStats(instanceName) {
    const instance = this.getInstance(instanceName);
    const stats = this.usageStats.get(instanceName);

    if (!instance || !stats) {
      return null;
    }

    return {
      instance: {
        name: instance.name,
        displayName: instance.displayName,
        provider: instance.provider,
        model: instance.model,
        costProfile: instance.costProfile
      },
      stats: {
        ...stats,
        averageTokensPerRequest: stats.totalRequests > 0 ? Math.round(stats.totalTokens / stats.totalRequests) : 0,
        averageCostPerRequest: stats.totalRequests > 0 ? (stats.totalCost / stats.totalRequests).toFixed(4) : 0,
        successRate: stats.totalRequests > 0 ? ((stats.successCount / stats.totalRequests) * 100).toFixed(1) + '%' : 'N/A'
      }
    };
  }

  /**
   * Get all usage stats
   */
  getAllUsageStats() {
    return Array.from(this.instances.keys())
      .map(name => this.getUsageStats(name))
      .filter(stat => stat !== null)
      .sort((a, b) => b.stats.totalRequests - a.stats.totalRequests);
  }

  /**
   * Enable/disable an instance
   */
  setInstanceEnabled(instanceName, enabled) {
    const instance = this.getInstance(instanceName);
    if (!instance) {
      throw new Error(`Instance '${instanceName}' not found`);
    }

    instance.enabled = enabled;
    this.instances.set(instanceName, instance);

    console.log(`[AIInstanceRegistry] Instance '${instanceName}' ${enabled ? 'enabled' : 'disabled'}`);

    return instance;
  }

  /**
   * Update instance configuration
   */
  updateInstance(instanceName, updates) {
    const instance = this.getInstance(instanceName);
    if (!instance) {
      throw new Error(`Instance '${instanceName}' not found`);
    }

    // Merge updates
    const updated = {
      ...instance,
      ...updates,
      name: instance.name, // Don't allow changing name
      instanceId: instance.instanceId, // Don't allow changing ID
      updatedAt: new Date().toISOString()
    };

    this.instances.set(instanceName, updated);

    console.log(`[AIInstanceRegistry] Updated instance '${instanceName}'`);

    return updated;
  }

  /**
   * Remove an instance
   */
  removeInstance(instanceName) {
    const instance = this.getInstance(instanceName);
    if (!instance) {
      throw new Error(`Instance '${instanceName}' not found`);
    }

    this.instances.delete(instanceName);
    this.usageStats.delete(instanceName);

    console.log(`[AIInstanceRegistry] Removed instance '${instanceName}'`);

    return true;
  }

  /**
   * Get instances summary
   */
  getSummary() {
    const all = this.listInstances();
    const enabled = this.listInstances({ enabledOnly: true });
    const free = all.filter(i => i.costProfile.free);
    const byProvider = {};

    for (const instance of all) {
      if (!byProvider[instance.provider]) {
        byProvider[instance.provider] = 0;
      }
      byProvider[instance.provider]++;
    }

    return {
      total: all.length,
      enabled: enabled.length,
      disabled: all.length - enabled.length,
      free: free.length,
      paid: all.length - free.length,
      byProvider,
      instances: all.map(i => ({
        name: i.name,
        displayName: i.displayName,
        provider: i.provider,
        model: i.model,
        enabled: i.enabled,
        free: i.costProfile.free
      }))
    };
  }

  /**
   * Log usage to database
   * @private
   */
  async _logUsageToDatabase(instanceName, { tokens, cost, success }) {
    if (!this.db) return;

    const instance = this.getInstance(instanceName);
    if (!instance) return;

    try {
      await this.db.query(
        `INSERT INTO ai_instance_usage (
          instance_name, provider, model, tokens, cost, success, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [instanceName, instance.provider, instance.model, tokens, cost, success]
      );
    } catch (error) {
      console.error('[AIInstanceRegistry] Database logging error:', error.message);
    }
  }
}

module.exports = AIInstanceRegistry;
