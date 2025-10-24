/**
 * Unified API Gateway
 *
 * Single endpoint that fronts:
 * - OpenAI API (cloud)
 * - Local Ollama (22 models)
 * - Web search (DuckDuckGo)
 * - Your other domains/servers
 *
 * Features:
 * - Bearer token authentication
 * - Domain-aware routing
 * - Language support (EN/ES)
 * - Encryption of responses
 * - Rate limiting
 * - Multi-brand support
 *
 * Usage:
 *   POST /api/unified/chat
 *   Authorization: Bearer calos_sk_...
 *   Body: {
 *     model: "gpt-4" | "llama3.2:3b" | "web-search",
 *     prompt: "Your query",
 *     domain: "calos" | "perplexityvault" | "soulfra",
 *     language: "en" | "es",
 *     encrypt: true
 *   }
 */

const fetch = require('node-fetch');
const crypto = require('crypto');

class UnifiedAPIGateway {
  constructor(config = {}) {
    this.openaiKey = config.openaiKey || process.env.OPENAI_API_KEY;
    this.anthropicKey = config.anthropicKey || process.env.ANTHROPIC_API_KEY;
    this.ollamaUrl = config.ollamaUrl || 'http://127.0.0.1:11434';
    this.encryptionKey = config.encryptionKey || process.env.ENCRYPTION_KEY;
    this.db = config.db;

    // Domain configurations
    this.domainConfigs = {
      calos: {
        name: 'CALOS Business OS',
        focus: ['code', 'business', 'automation'],
        defaultModel: 'llama3.2:3b',
        systemPrompt: 'You are CALOS, an AI assistant for business automation and software development.'
      },
      perplexityvault: {
        name: 'Perplexity Vault',
        focus: ['web-search', 'research', 'knowledge'],
        defaultModel: 'web-search',
        systemPrompt: 'You are a research assistant specializing in web search and knowledge discovery.'
      },
      soulfra: {
        name: 'Soulfra Identity',
        focus: ['identity', 'cryptography', 'privacy'],
        defaultModel: 'llama2:latest',
        systemPrompt: 'You are Soulfra, an AI assistant for zero-knowledge identity and privacy.'
      },
      calriven: {
        name: 'CalRiven Publishing',
        focus: ['writing', 'publishing', 'creative'],
        defaultModel: 'gpt-4',
        systemPrompt: 'You are CalRiven, an AI assistant for content creation and publishing.'
      },
      vibecoding: {
        name: 'VibeCoding Vault',
        focus: ['knowledge', 'vault', 'librarian'],
        defaultModel: 'llama3.2:3b',
        systemPrompt: 'You are the VibeCoding Librarian, an omniscient keeper of dragon knowledge.'
      }
    };

    console.log('[UnifiedAPIGateway] Initialized with domains:', Object.keys(this.domainConfigs));
  }

  /**
   * Main routing method
   */
  async chat(request) {
    const {
      model = 'auto',
      prompt,
      domain = 'calos',
      language = 'en',
      encrypt = false,
      temperature = 0.7,
      maxTokens = 2000,
      stream = false
    } = request;

    // Validate domain
    const domainConfig = this.domainConfigs[domain];
    if (!domainConfig) {
      throw new Error(`Unknown domain: ${domain}. Available: ${Object.keys(this.domainConfigs).join(', ')}`);
    }

    // Auto-select model based on domain
    const selectedModel = model === 'auto' ? domainConfig.defaultModel : model;

    // Build system prompt
    const systemPrompt = domainConfig.systemPrompt;

    // Translate if needed
    const translatedPrompt = language === 'es'
      ? await this.translateToEnglish(prompt)
      : prompt;

    // Route to appropriate backend
    let response;
    let backend;

    if (selectedModel.startsWith('gpt-') || selectedModel.startsWith('o1-')) {
      // OpenAI
      backend = 'openai';
      response = await this.callOpenAI({
        model: selectedModel,
        prompt: translatedPrompt,
        systemPrompt,
        temperature,
        maxTokens
      });
    } else if (selectedModel === 'web-search') {
      // Web search
      backend = 'web-search';
      response = await this.callWebSearch({
        query: translatedPrompt,
        language
      });
    } else if (selectedModel.startsWith('claude')) {
      // Anthropic Claude
      backend = 'anthropic';
      response = await this.callAnthropic({
        model: selectedModel,
        prompt: translatedPrompt,
        systemPrompt,
        temperature,
        maxTokens
      });
    } else {
      // Assume Ollama
      backend = 'ollama';
      response = await this.callOllama({
        model: selectedModel,
        prompt: translatedPrompt,
        systemPrompt,
        temperature
      });
    }

    // Translate response back if needed
    if (language === 'es') {
      response.text = await this.translateToSpanish(response.text);
    }

    // Encrypt if requested
    let encryptedData = null;
    if (encrypt && this.encryptionKey) {
      encryptedData = this.encryptResponse(response.text);
    }

    // Build unified response
    const unifiedResponse = {
      success: true,
      domain,
      model: selectedModel,
      backend,
      language,
      prompt: prompt, // Original prompt
      response: encrypt ? '[ENCRYPTED]' : response.text,
      encrypted: encrypt,
      encryptedData,
      metadata: {
        tokens: response.tokens || null,
        cost: response.cost || null,
        latency: response.latency || null,
        timestamp: new Date().toISOString()
      }
    };

    return unifiedResponse;
  }

  /**
   * Call OpenAI API
   */
  async callOpenAI({ model, prompt, systemPrompt, temperature, maxTokens }) {
    const startTime = Date.now();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    return {
      text: data.choices[0].message.content,
      tokens: data.usage?.total_tokens,
      cost: this.calculateOpenAICost(model, data.usage),
      latency
    };
  }

  /**
   * Call Anthropic Claude API
   */
  async callAnthropic({ model, prompt, systemPrompt, temperature, maxTokens }) {
    const startTime = Date.now();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    return {
      text: data.content[0].text,
      tokens: data.usage?.input_tokens + data.usage?.output_tokens,
      cost: this.calculateAnthropicCost(model, data.usage),
      latency
    };
  }

  /**
   * Call local Ollama
   */
  async callOllama({ model, prompt, systemPrompt, temperature }) {
    const startTime = Date.now();

    const fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`;

    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        temperature,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    return {
      text: data.response,
      tokens: data.eval_count || null,
      cost: 0, // Local = free
      latency
    };
  }

  /**
   * Call web search
   */
  async callWebSearch({ query, language }) {
    const startTime = Date.now();

    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);

    if (!response.ok) {
      throw new Error(`Web search error: ${response.status}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    // Format results as text
    let text = '';
    if (data.Abstract) {
      text += `${data.Abstract}\n\nSource: ${data.AbstractURL}\n\n`;
    }

    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      text += 'Related:\n';
      data.RelatedTopics.slice(0, 5).forEach(topic => {
        if (topic.Text && topic.FirstURL) {
          text += `- ${topic.Text}\n  ${topic.FirstURL}\n`;
        }
      });
    }

    return {
      text: text || 'No results found.',
      tokens: null,
      cost: 0,
      latency
    };
  }

  /**
   * Translate English to Spanish using local Ollama
   */
  async translateToSpanish(text) {
    try {
      const response = await this.callOllama({
        model: 'llama3.2:3b',
        prompt: `Translate this English text to Spanish:\n\n${text}`,
        systemPrompt: 'You are a professional translator. Only output the translation, no explanations.',
        temperature: 0.3
      });
      return response.text;
    } catch (error) {
      console.error('[UnifiedAPIGateway] Translation failed:', error.message);
      return text; // Return original if translation fails
    }
  }

  /**
   * Translate Spanish to English using local Ollama
   */
  async translateToEnglish(text) {
    // Simple language detection
    if (!/[áéíóúñ¿¡]/i.test(text)) {
      return text; // Already English
    }

    try {
      const response = await this.callOllama({
        model: 'llama3.2:3b',
        prompt: `Translate this Spanish text to English:\n\n${text}`,
        systemPrompt: 'You are a professional translator. Only output the translation, no explanations.',
        temperature: 0.3
      });
      return response.text;
    } catch (error) {
      console.error('[UnifiedAPIGateway] Translation failed:', error.message);
      return text;
    }
  }

  /**
   * Encrypt response using AES-256-GCM
   */
  encryptResponse(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(this.encryptionKey, 'hex'), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Calculate OpenAI cost
   */
  calculateOpenAICost(model, usage) {
    if (!usage) return 0;

    const pricing = {
      'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
      'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
      'gpt-3.5-turbo': { input: 0.0005 / 1000, output: 0.0015 / 1000 }
    };

    const rates = pricing[model] || pricing['gpt-3.5-turbo'];
    return (usage.prompt_tokens * rates.input) + (usage.completion_tokens * rates.output);
  }

  /**
   * Calculate Anthropic cost
   */
  calculateAnthropicCost(model, usage) {
    if (!usage) return 0;

    const pricing = {
      'claude-3-opus': { input: 0.015 / 1000, output: 0.075 / 1000 },
      'claude-3-sonnet': { input: 0.003 / 1000, output: 0.015 / 1000 },
      'claude-3-haiku': { input: 0.00025 / 1000, output: 0.00125 / 1000 }
    };

    const rates = pricing[model] || pricing['claude-3-haiku'];
    return (usage.input_tokens * rates.input) + (usage.output_tokens * rates.output);
  }
}

module.exports = UnifiedAPIGateway;
