/**
 * AI Research Assistant
 *
 * Real-time research assistant powered by Ollama (local LLM) + OSRS Wiki.
 * Answers questions during streams, provides context for game events,
 * and formats responses for stream overlays.
 *
 * What It Does:
 * - Answer chat questions ("what's a twisted bow?")
 * - Auto-research game events (rare drop → instant wiki lookup)
 * - Voice-triggered research (you say "what's that?")
 * - Format responses for stream overlay
 * - Store research context in GitHub for continuity
 *
 * Triggers:
 * - Chat commands: !wiki, !research, !explain
 * - Chat questions: "what is X?" "how do I Y?"
 * - Game events: Rare drop, boss kill, level up
 * - Manual: You press a hotkey to trigger research
 *
 * Research Flow:
 * 1. Receive question (chat, voice, event)
 * 2. Query OSRS Wiki API for facts
 * 3. Use Ollama to format natural language response
 * 4. Display on stream overlay
 * 5. Store in GitHub for context
 *
 * Use Cases:
 * - Stream: Chat asks "what's BiS for Zulrah?"
 *   → AI queries wiki → "Best gear: Toxic trident, Void/Ahrim's, Anguish..."
 * - Auto: You get a Twisted bow drop
 *   → AI instantly shows "Twisted bow: 1/1000 from CoX, BiS ranged, 2B GP"
 * - Voice: You say "what's that purple portal?"
 *   → AI researches → "Tears of Guthix: D&D, free XP in lowest skill"
 *
 * Integrates with:
 * - OSRSWikiClient (lib/osrs-wiki-client.js) - Fact lookup
 * - RuneLiteIntegration (lib/runelite-integration.js) - Game events
 * - StreamChatRouter (lib/stream-chat-router.js) - Chat questions
 * - MultiPlatformStreamer (lib/multi-platform-streamer.js) - Overlay display
 *
 * Usage:
 *   const assistant = new AIResearchAssistant({
 *     ollamaUrl: 'http://localhost:11434',
 *     wikiClient,
 *     githubToken
 *   });
 *
 *   // Research a topic
 *   const result = await assistant.research({
 *     query: 'What is a Twisted bow?',
 *     context: 'stream',
 *     format: 'overlay'
 *   });
 *   // → { answer, sources, formatted, timestamp }
 *
 *   // Auto-research from event
 *   runelite.on('loot_received', async (event) => {
 *     if (event.clipworthy) {
 *       const research = await assistant.researchItem(event.itemName);
 *       // Display on stream
 *     }
 *   });
 */

const { EventEmitter } = require('events');
const fetch = require('node-fetch');
const crypto = require('crypto');

class AIResearchAssistant extends EventEmitter {
  constructor(options = {}) {
    super();

    this.ollamaUrl = options.ollamaUrl || 'http://localhost:11434';
    this.model = options.model || 'llama3.2:3b';
    this.wikiClient = options.wikiClient;
    this.githubToken = options.githubToken;
    this.githubRepo = options.githubRepo; // 'username/repo'

    if (!this.wikiClient) {
      throw new Error('[AIResearchAssistant] OSRSWikiClient required');
    }

    // Research queue
    this.queue = [];
    this.processing = false;

    // Context storage (GitHub)
    this.contextStore = {
      enabled: !!this.githubToken,
      path: options.contextPath || 'context/research',
      maxContextSize: 100 // Max stored research items
    };

    // Response formatting
    this.formatters = {
      overlay: this._formatForOverlay.bind(this),
      chat: this._formatForChat.bind(this),
      voice: this._formatForVoice.bind(this),
      detailed: this._formatDetailed.bind(this)
    };

    // Research cache
    this.cache = new Map(); // query → { result, expiry }
    this.cacheTTL = options.cacheTTL || 600000; // 10 minutes

    // Stats
    this.stats = {
      totalResearches: 0,
      cacheHits: 0,
      avgResponseTime: 0,
      byTrigger: {}
    };

    console.log('[AIResearchAssistant] Initialized with model:', this.model);
  }

  // ============================================================================
  // Main Research Methods
  // ============================================================================

  /**
   * Research a query
   */
  async research(options) {
    const {
      query,
      context = 'general',
      format = 'overlay',
      trigger = 'manual',
      priority = 'normal'
    } = options;

    console.log(`[AIResearchAssistant] Research: "${query}" (${trigger})`);

    const startTime = Date.now();
    this.stats.totalResearches++;
    this.stats.byTrigger[trigger] = (this.stats.byTrigger[trigger] || 0) + 1;

    // Check cache
    const cacheKey = this._getCacheKey(query, format);
    const cached = this._getCache(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    // Create research request
    const request = {
      requestId: crypto.randomBytes(8).toString('hex'),
      query,
      context,
      format,
      trigger,
      priority,
      timestamp: Date.now()
    };

    // Add to queue (or process immediately if high priority)
    if (priority === 'high') {
      return await this._processResearch(request);
    } else {
      this.queue.push(request);
      this._processQueue();

      // Return promise that resolves when processed
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Research timeout')), 30000);

        this.once(`research:${request.requestId}`, (result) => {
          clearTimeout(timeout);
          resolve(result);
        });
      });
    }
  }

  /**
   * Research an OSRS item
   */
  async researchItem(itemName, format = 'overlay') {
    console.log(`[AIResearchAssistant] Researching item: ${itemName}`);

    // Get item from wiki
    const item = await this.wikiClient.getItem(itemName);
    if (!item) {
      return {
        success: false,
        error: `Item not found: ${itemName}`,
        timestamp: Date.now()
      };
    }

    // Format with Ollama
    const prompt = `You are a helpful OSRS assistant. Summarize this item in 2-3 sentences for a stream overlay:

Item: ${item.title}
Description: ${item.extract}
Value: ${item.price ? item.price.high + ' GP' : 'Unknown'}
Tradeable: ${item.tradeable ? 'Yes' : 'No'}
Members: ${item.members ? 'Yes' : 'No'}

Keep it concise and highlight what's most interesting/useful.`;

    const ollamaResponse = await this._callOllama(prompt);

    const result = {
      success: true,
      itemName,
      itemData: item,
      answer: ollamaResponse,
      formatted: this.formatters[format]({
        title: item.title,
        text: ollamaResponse,
        image: item.image,
        url: item.wikiUrl
      }),
      sources: [item.wikiUrl],
      timestamp: Date.now()
    };

    // Cache it
    this._setCache(this._getCacheKey(itemName, format), result);

    return result;
  }

  /**
   * Research an OSRS monster
   */
  async researchMonster(monsterName, format = 'overlay') {
    console.log(`[AIResearchAssistant] Researching monster: ${monsterName}`);

    const monster = await this.wikiClient.getMonster(monsterName);
    if (!monster) {
      return {
        success: false,
        error: `Monster not found: ${monsterName}`,
        timestamp: Date.now()
      };
    }

    const prompt = `You are a helpful OSRS assistant. Summarize this monster for a stream overlay (2-3 sentences):

Monster: ${monster.title}
Combat Level: ${monster.combatLevel}
Hitpoints: ${monster.hitpoints}
Description: ${monster.extract}

Focus on difficulty, notable drops, or tactics.`;

    const ollamaResponse = await this._callOllama(prompt);

    const result = {
      success: true,
      monsterName,
      monsterData: monster,
      answer: ollamaResponse,
      formatted: this.formatters[format]({
        title: monster.title,
        text: ollamaResponse,
        image: monster.image,
        url: monster.wikiUrl,
        warning: monster.aggressive ? '⚠️ Aggressive' : null
      }),
      sources: [monster.wikiUrl],
      timestamp: Date.now()
    };

    this._setCache(this._getCacheKey(monsterName, format), result);
    return result;
  }

  /**
   * Research an OSRS quest
   */
  async researchQuest(questName, format = 'overlay') {
    console.log(`[AIResearchAssistant] Researching quest: ${questName}`);

    const quest = await this.wikiClient.getQuest(questName);
    if (!quest) {
      return {
        success: false,
        error: `Quest not found: ${questName}`,
        timestamp: Date.now()
      };
    }

    const prompt = `You are a helpful OSRS assistant. Summarize this quest for a stream overlay (2-3 sentences):

Quest: ${quest.title}
Difficulty: ${quest.difficulty}
Length: ${quest.length}
Quest Points: ${quest.questPoints}
Description: ${quest.extract}

Mention requirements and rewards if important.`;

    const ollamaResponse = await this._callOllama(prompt);

    const result = {
      success: true,
      questName,
      questData: quest,
      answer: ollamaResponse,
      formatted: this.formatters[format]({
        title: quest.title,
        text: ollamaResponse,
        image: quest.image,
        url: quest.wikiUrl
      }),
      sources: [quest.wikiUrl],
      timestamp: Date.now()
    };

    this._setCache(this._getCacheKey(questName, format), result);
    return result;
  }

  /**
   * Answer a general question
   */
  async answerQuestion(question, format = 'chat') {
    console.log(`[AIResearchAssistant] Answering: "${question}"`);

    // Try to extract entity from question
    const entity = this._extractEntity(question);

    if (entity.type === 'item') {
      return await this.researchItem(entity.name, format);
    } else if (entity.type === 'monster') {
      return await this.researchMonster(entity.name, format);
    } else if (entity.type === 'quest') {
      return await this.researchQuest(entity.name, format);
    }

    // General search
    const searchResults = await this.wikiClient.search(question, 3);

    if (searchResults.length === 0) {
      return {
        success: false,
        error: 'No results found',
        timestamp: Date.now()
      };
    }

    // Use top result
    const topResult = searchResults[0];

    const prompt = `You are a helpful OSRS assistant. Answer this question based on the wiki search result:

Question: ${question}

Search Result:
Title: ${topResult.title}
Snippet: ${topResult.snippet}

Provide a clear, concise answer (2-3 sentences).`;

    const ollamaResponse = await this._callOllama(prompt);

    const result = {
      success: true,
      question,
      answer: ollamaResponse,
      formatted: this.formatters[format]({
        title: topResult.title,
        text: ollamaResponse,
        url: `https://oldschool.runescape.wiki/w/${encodeURIComponent(topResult.title.replace(/ /g, '_'))}`
      }),
      sources: searchResults.map(r => r.title),
      timestamp: Date.now()
    };

    this._setCache(this._getCacheKey(question, format), result);
    return result;
  }

  // ============================================================================
  // Queue Processing
  // ============================================================================

  /**
   * Process research queue
   */
  async _processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift();

      try {
        const result = await this._processResearch(request);
        this.emit(`research:${request.requestId}`, result);
      } catch (error) {
        console.error('[AIResearchAssistant] Research error:', error.message);
        this.emit(`research:${request.requestId}`, {
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
      }
    }

    this.processing = false;
  }

  /**
   * Process a single research request
   */
  async _processResearch(request) {
    const startTime = Date.now();

    // Determine research type
    let result;

    if (request.query.toLowerCase().includes('item:')) {
      const itemName = request.query.replace(/item:/i, '').trim();
      result = await this.researchItem(itemName, request.format);
    } else if (request.query.toLowerCase().includes('monster:')) {
      const monsterName = request.query.replace(/monster:/i, '').trim();
      result = await this.researchMonster(monsterName, request.format);
    } else if (request.query.toLowerCase().includes('quest:')) {
      const questName = request.query.replace(/quest:/i, '').trim();
      result = await this.researchQuest(questName, request.format);
    } else {
      result = await this.answerQuestion(request.query, request.format);
    }

    // Update stats
    const responseTime = Date.now() - startTime;
    this.stats.avgResponseTime = (this.stats.avgResponseTime + responseTime) / 2;

    // Store context if enabled
    if (this.contextStore.enabled) {
      await this._storeContext(request, result);
    }

    this.emit('research_complete', {
      request,
      result,
      responseTime
    });

    return result;
  }

  // ============================================================================
  // Ollama Integration
  // ============================================================================

  /**
   * Call Ollama API
   */
  async _callOllama(prompt, options = {}) {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: options.temperature || 0.7,
            num_predict: options.maxTokens || 150
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json();
      return data.response.trim();

    } catch (error) {
      console.error('[AIResearchAssistant] Ollama error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // Response Formatters
  // ============================================================================

  /**
   * Format for stream overlay
   */
  _formatForOverlay(data) {
    return {
      type: 'overlay',
      title: data.title,
      text: this._truncate(data.text, 120),
      image: data.image,
      url: data.url,
      warning: data.warning,
      displayDuration: 10000 // 10 seconds
    };
  }

  /**
   * Format for chat response
   */
  _formatForChat(data) {
    return {
      type: 'chat',
      message: `${data.title}: ${this._truncate(data.text, 200)}`,
      url: data.url
    };
  }

  /**
   * Format for voice (TTS-friendly)
   */
  _formatForVoice(data) {
    return {
      type: 'voice',
      speech: this._truncate(data.text, 100),
      title: data.title
    };
  }

  /**
   * Format detailed response
   */
  _formatDetailed(data) {
    return {
      type: 'detailed',
      title: data.title,
      text: data.text,
      image: data.image,
      url: data.url,
      warning: data.warning
    };
  }

  // ============================================================================
  // Entity Extraction
  // ============================================================================

  /**
   * Extract entity from natural language question
   */
  _extractEntity(question) {
    const lower = question.toLowerCase();

    // Item patterns
    if (lower.includes('what is') || lower.includes('what\'s')) {
      const itemMatch = question.match(/what(?:'s| is) (a |an |the )?([^?]+)/i);
      if (itemMatch) {
        return { type: 'item', name: itemMatch[2].trim() };
      }
    }

    // Default: search
    return { type: 'search', name: question };
  }

  // ============================================================================
  // GitHub Context Storage
  // ============================================================================

  /**
   * Store research context in GitHub
   */
  async _storeContext(request, result) {
    if (!this.githubToken || !this.githubRepo) {
      return;
    }

    try {
      const filename = `${this.contextStore.path}/${Date.now()}.json`;
      const content = Buffer.from(JSON.stringify({
        request,
        result,
        timestamp: Date.now()
      }, null, 2)).toString('base64');

      const [owner, repo] = this.githubRepo.split('/');
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`;

      await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Research: ${request.query.substring(0, 50)}`,
          content
        })
      });

    } catch (error) {
      console.error('[AIResearchAssistant] GitHub storage error:', error.message);
    }
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Get cache key
   */
  _getCacheKey(query, format) {
    return `${query.toLowerCase()}:${format}`;
  }

  /**
   * Get from cache
   */
  _getCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expiry < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set cache
   */
  _setCache(key, value) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.cacheTTL
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('[AIResearchAssistant] Cache cleared');
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Truncate text
   */
  _truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      queueSize: this.queue.length
    };
  }
}

module.exports = AIResearchAssistant;
