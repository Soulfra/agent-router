/**
 * Agent Registry
 * Tracks all available agents, their status, capabilities, and delegation rules
 */

class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this.initializeDefaultAgents();
  }

  initializeDefaultAgents() {
    // OpenAI GPT-4
    this.register('@gpt4', {
      name: 'GPT-4',
      provider: 'openai',
      model: 'gpt-4',
      capabilities: ['reasoning', 'code', 'creative', 'analysis'],
      status: 'available',
      latency: 'medium',
      cost: 'high',
      maxConcurrent: 5,
      currentLoad: 0,
      outOfOffice: null,
      delegation: {
        whenBusy: '@claude',
        whenOffline: '@ollama'
      }
    });

    // OpenAI GPT-3.5
    this.register('@gpt-3.5', {
      name: 'GPT-3.5 Turbo',
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      capabilities: ['chat', 'code', 'facts'],
      status: 'available',
      latency: 'fast',
      cost: 'low',
      maxConcurrent: 10,
      currentLoad: 0,
      outOfOffice: null,
      delegation: {
        whenBusy: '@ollama',
        whenOffline: '@ollama'
      }
    });

    // Anthropic Claude
    this.register('@claude', {
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      capabilities: ['creative', 'reasoning', 'code', 'analysis'],
      status: 'available',
      latency: 'medium',
      cost: 'high',
      maxConcurrent: 5,
      currentLoad: 0,
      outOfOffice: null,
      delegation: {
        whenBusy: '@gpt4',
        whenOffline: '@ollama'
      }
    });

    // DeepSeek
    this.register('@deepseek', {
      name: 'DeepSeek',
      provider: 'deepseek',
      model: 'deepseek-chat',
      capabilities: ['reasoning', 'code', 'analysis'],
      status: 'available',
      latency: 'medium',
      cost: 'low',
      maxConcurrent: 5,
      currentLoad: 0,
      outOfOffice: null,
      delegation: {
        whenBusy: '@ollama',
        whenOffline: '@gpt-3.5'
      }
    });

    // Ollama (local) - models registered dynamically
    // Default @ollama alias (will use first available model)
    this.register('@ollama', {
      name: 'Ollama (Dynamic)',
      provider: 'ollama',
      model: null, // Will be set to first available model
      capabilities: ['chat', 'code', 'creative'],
      status: 'unknown', // Will check on init
      latency: 'fast',
      cost: 'free',
      maxConcurrent: 3,
      currentLoad: 0,
      outOfOffice: null,
      delegation: {
        whenBusy: '@gpt-3.5',
        whenOffline: '@gpt-3.5'
      }
    });

    // Special agents for workflows
    this.register('@n8n-bridge', {
      name: 'n8n Workflow Bridge',
      provider: 'bridge',
      model: 'n8n',
      capabilities: ['workflow', 'automation'],
      status: 'unknown',
      latency: 'fast',
      cost: 'free',
      maxConcurrent: 10,
      currentLoad: 0,
      outOfOffice: null,
      delegation: null
    });

    this.register('@script-toolkit', {
      name: 'Script Toolkit',
      provider: 'bridge',
      model: 'script-toolkit',
      capabilities: ['scripts', 'execution', 'monitoring'],
      status: 'available',
      latency: 'fast',
      cost: 'free',
      maxConcurrent: 5,
      currentLoad: 0,
      outOfOffice: null,
      delegation: null
    });

    this.register('@browser', {
      name: 'Browser Agent (Puppeteer)',
      provider: 'browser',
      model: 'puppeteer',
      capabilities: ['web-scraping', 'screenshots', 'automation', 'testing'],
      status: 'available',
      latency: 'medium',
      cost: 'free',
      maxConcurrent: 3,
      currentLoad: 0,
      outOfOffice: null,
      delegation: null
    });

    this.register('@hn', {
      name: 'Hacker News Scraper',
      provider: 'scraper',
      model: 'hn-parser',
      capabilities: ['scraping', 'hn', 'news', 'discussions'],
      status: 'available',
      latency: 'medium',
      cost: 'free',
      maxConcurrent: 5,
      currentLoad: 0,
      outOfOffice: null,
      delegation: null
    });

    this.register('@github', {
      name: 'GitHub OSS Discovery',
      provider: 'github',
      model: 'gh-cli',
      capabilities: ['search', 'sync', 'discovery', 'oss', 'fediverse'],
      status: 'available',
      latency: 'fast',
      cost: 'free',
      maxConcurrent: 5,
      currentLoad: 0,
      outOfOffice: null,
      delegation: null
    });
  }

  /**
   * Register a new agent
   */
  register(agentId, config) {
    this.agents.set(agentId.toLowerCase(), {
      id: agentId,
      ...config,
      lastSeen: new Date().toISOString(),
      stats: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0
      }
    });
  }

  /**
   * Get agent by ID
   */
  get(agentId) {
    return this.agents.get(agentId.toLowerCase());
  }

  /**
   * Check if agent is available
   */
  isAvailable(agentId) {
    const agent = this.get(agentId);
    if (!agent) return false;

    // Check out of office
    if (agent.outOfOffice) {
      const now = new Date();
      const until = new Date(agent.outOfOffice.until);
      if (now < until) {
        return false; // Still out of office
      } else {
        // Clear out of office
        agent.outOfOffice = null;
      }
    }

    // Check status
    if (agent.status === 'offline' || agent.status === 'disabled') {
      return false;
    }

    // Check load
    if (agent.currentLoad >= agent.maxConcurrent) {
      return false; // Too busy
    }

    return true;
  }

  /**
   * Get delegation target for an agent
   */
  getDelegation(agentId, reason = 'busy') {
    const agent = this.get(agentId);
    if (!agent || !agent.delegation) return null;

    if (reason === 'busy' || reason === 'overloaded') {
      return agent.delegation.whenBusy;
    }

    if (reason === 'offline' || reason === 'unavailable') {
      return agent.delegation.whenOffline;
    }

    if (agent.outOfOffice && agent.outOfOffice.delegate) {
      return agent.outOfOffice.delegate;
    }

    return null;
  }

  /**
   * Set agent out of office
   */
  setOutOfOffice(agentId, until, delegate = null) {
    const agent = this.get(agentId);
    if (!agent) return false;

    agent.outOfOffice = {
      until: until instanceof Date ? until.toISOString() : until,
      delegate: delegate || agent.delegation?.whenOffline,
      message: `${agent.name} is out of office until ${until}`
    };

    return true;
  }

  /**
   * Clear out of office
   */
  clearOutOfOffice(agentId) {
    const agent = this.get(agentId);
    if (!agent) return false;

    agent.outOfOffice = null;
    return true;
  }

  /**
   * Update agent status
   */
  updateStatus(agentId, status) {
    const agent = this.get(agentId);
    if (!agent) return false;

    agent.status = status;
    agent.lastSeen = new Date().toISOString();
    return true;
  }

  /**
   * Increment load
   */
  incrementLoad(agentId) {
    const agent = this.get(agentId);
    if (!agent) return;
    agent.currentLoad++;
  }

  /**
   * Decrement load
   */
  decrementLoad(agentId) {
    const agent = this.get(agentId);
    if (!agent) return;
    agent.currentLoad = Math.max(0, agent.currentLoad - 1);
  }

  /**
   * Record request stats
   */
  recordRequest(agentId, success, latency) {
    const agent = this.get(agentId);
    if (!agent) return;

    agent.stats.totalRequests++;
    if (success) {
      agent.stats.successfulRequests++;
    } else {
      agent.stats.failedRequests++;
    }

    // Update average latency
    const total = agent.stats.totalRequests;
    agent.stats.averageLatency =
      ((agent.stats.averageLatency * (total - 1)) + latency) / total;
  }

  /**
   * Get agents by capability
   */
  getByCapability(capability) {
    const results = [];
    for (const [id, agent] of this.agents) {
      if (agent.capabilities.includes(capability)) {
        results.push(agent);
      }
    }
    return results;
  }

  /**
   * Get all available agents
   */
  getAvailable() {
    const results = [];
    for (const [id, agent] of this.agents) {
      if (this.isAvailable(id)) {
        results.push(agent);
      }
    }
    return results;
  }

  /**
   * Dynamically register Ollama models from tags
   */
  async registerOllamaModels(ollamaModels) {
    if (!ollamaModels || ollamaModels.length === 0) {
      console.log('⚠️  No Ollama models available');
      this.updateStatus('@ollama', 'offline');
      return 0;
    }

    console.log(`🤖 Registering ${ollamaModels.length} Ollama models...`);

    // Set default @ollama to use first model
    const defaultModel = ollamaModels[0];
    const ollamaAgent = this.get('@ollama');
    if (ollamaAgent) {
      ollamaAgent.model = defaultModel.name;
      ollamaAgent.name = `Ollama (${defaultModel.name})`;
      ollamaAgent.status = 'available';
    }

    // Register each model as @ollama:modelname
    for (const model of ollamaModels) {
      const modelName = model.name;
      const agentId = `@ollama:${modelName}`;

      // Determine capabilities based on model name
      const capabilities = this.detectOllamaCapabilities(modelName);

      // Determine delegation based on capabilities
      const delegation = capabilities.includes('code')
        ? { whenBusy: '@gpt4', whenOffline: '@gpt4' }
        : { whenBusy: '@claude', whenOffline: '@claude' };

      this.register(agentId, {
        name: `Ollama ${modelName}`,
        provider: 'ollama',
        model: modelName,
        capabilities,
        status: 'available',
        latency: 'fast',
        cost: 'free',
        maxConcurrent: 2,
        currentLoad: 0,
        outOfOffice: null,
        delegation
      });

      console.log(`  ✓ ${agentId}`);
    }

    return ollamaModels.length;
  }

  /**
   * Detect capabilities based on Ollama model name
   */
  detectOllamaCapabilities(modelName) {
    const lower = modelName.toLowerCase();

    // Code-focused models
    if (lower.includes('code') || lower.includes('starcoder') || lower.includes('wizardcoder')) {
      return ['code'];
    }

    // Instruct/chat models
    if (lower.includes('instruct') || lower.includes('chat')) {
      return ['chat', 'reasoning'];
    }

    // General purpose (mistral, llama, etc.)
    return ['chat', 'code', 'creative'];
  }

  /**
   * Get agent summary for display
   */
  getSummary() {
    const summary = {
      total: this.agents.size,
      available: 0,
      busy: 0,
      offline: 0,
      outOfOffice: 0,
      agents: []
    };

    for (const [id, agent] of this.agents) {
      const isAvailable = this.isAvailable(id);

      if (isAvailable) {
        summary.available++;
      } else if (agent.outOfOffice) {
        summary.outOfOffice++;
      } else if (agent.status === 'offline') {
        summary.offline++;
      } else {
        summary.busy++;
      }

      summary.agents.push({
        id: agent.id,
        name: agent.name,
        status: isAvailable ? 'available' : agent.status,
        load: `${agent.currentLoad}/${agent.maxConcurrent}`,
        cost: agent.cost,
        latency: agent.latency,
        outOfOffice: agent.outOfOffice ? true : false
      });
    }

    return summary;
  }
}

module.exports = AgentRegistry;
