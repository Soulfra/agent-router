/**
 * Model Wrappers System
 *
 * Different "personalities" and configurations for the same model:
 * - Output format variations (concise, detailed, code-only)
 * - Temperature/parameter tweaks
 * - System prompt modifications
 * - Pre/post-processing
 * - Profile-specific optimizations
 *
 * Example: Same soulfra-model with 3 wrappers:
 * - 'concise' - Short, direct answers
 * - 'detailed' - Full explanations with examples
 * - 'code-only' - Just the code, no prose
 */

class ModelWrappers {
  constructor(options = {}) {
    this.db = options.db;
    this.outputFormatter = options.outputFormatter;

    // Built-in wrappers
    this.builtInWrappers = {
      default: {
        name: 'Default',
        description: 'Standard output format',
        config: {
          systemPromptSuffix: '',
          temperature: null, // Use model default
          maxTokens: null,
          outputFormat: 'markdown'
        },
        applicableDomains: ['*'] // All domains
      },

      concise: {
        name: 'Concise',
        description: 'Brief, to-the-point answers (max 3 sentences)',
        config: {
          systemPromptSuffix: '\n\nIMPORTANT: Be extremely concise. Maximum 3 sentences. No elaboration.',
          temperature: 0.3,
          maxTokens: 150,
          outputFormat: 'markdown'
        },
        applicableDomains: ['*']
      },

      detailed: {
        name: 'Detailed',
        description: 'Comprehensive explanations with examples',
        config: {
          systemPromptSuffix: '\n\nProvide detailed explanations with examples and context. Include code examples where relevant.',
          temperature: 0.7,
          maxTokens: 800,
          outputFormat: 'markdown'
        },
        applicableDomains: ['*']
      },

      'code-only': {
        name: 'Code Only',
        description: 'Return only code, no explanations',
        config: {
          systemPromptSuffix: '\n\nReturn ONLY code in a code block. No explanations, no prose, just the code.',
          temperature: 0.2,
          maxTokens: 500,
          outputFormat: 'code',
          preProcess: null,
          postProcess: 'extractCodeOnly'
        },
        applicableDomains: ['code', 'cryptography', 'data']
      },

      'beginner-friendly': {
        name: 'Beginner Friendly',
        description: 'Simple language, analogies, ELI5 style',
        config: {
          systemPromptSuffix: '\n\nExplain like I\'m 5. Use simple language, avoid jargon, include analogies and real-world examples.',
          temperature: 0.8,
          maxTokens: 600,
          outputFormat: 'markdown',
          includeAnalogies: true
        },
        applicableDomains: ['*']
      },

      'expert-mode': {
        name: 'Expert Mode',
        description: 'Technical depth, assume expert knowledge',
        config: {
          systemPromptSuffix: '\n\nAssume expert-level knowledge. Use technical terminology. Be precise and thorough.',
          temperature: 0.4,
          maxTokens: 1000,
          outputFormat: 'markdown'
        },
        applicableDomains: ['*']
      },

      'with-examples': {
        name: 'With Examples',
        description: 'Always include concrete examples',
        config: {
          systemPromptSuffix: '\n\nALWAYS include at least 2 concrete examples. Show, don\'t just tell.',
          temperature: 0.6,
          maxTokens: 700,
          outputFormat: 'markdown'
        },
        applicableDomains: ['*']
      },

      'step-by-step': {
        name: 'Step by Step',
        description: 'Break down into numbered steps',
        config: {
          systemPromptSuffix: '\n\nBreak your answer into clear, numbered steps. Make it a tutorial.',
          temperature: 0.5,
          maxTokens: 600,
          outputFormat: 'markdown',
          enforceNumberedList: true
        },
        applicableDomains: ['*']
      },

      'quick-reference': {
        name: 'Quick Reference',
        description: 'Bullet points, no prose',
        config: {
          systemPromptSuffix: '\n\nProvide answer in bullet point format only. No paragraphs, just key points.',
          temperature: 0.4,
          maxTokens: 300,
          outputFormat: 'markdown',
          forceBulletPoints: true
        },
        applicableDomains: ['*']
      }
    };

    console.log(`[ModelWrappers] Initialized with ${Object.keys(this.builtInWrappers).length} built-in wrappers`);
  }

  /**
   * Get wrapper configuration
   *
   * @param {string} wrapperName - Wrapper name
   * @param {string} domain - Domain (for domain-specific wrappers)
   * @returns {Promise<object>} - Wrapper config
   */
  async getWrapper(wrapperName, domain = null) {
    // Check built-in wrappers first
    if (this.builtInWrappers[wrapperName]) {
      const wrapper = this.builtInWrappers[wrapperName];

      // Check if applicable to domain
      if (domain && !this._isApplicable(wrapper, domain)) {
        throw new Error(`Wrapper '${wrapperName}' not applicable to domain '${domain}'`);
      }

      return wrapper;
    }

    // Check database for custom wrappers
    if (this.db) {
      return await this._getCustomWrapper(wrapperName, domain);
    }

    throw new Error(`Wrapper '${wrapperName}' not found`);
  }

  /**
   * Apply wrapper to request
   *
   * @param {object} request - Original request
   * @param {string} wrapperName - Wrapper to apply
   * @param {string} domain - Domain
   * @returns {Promise<object>} - Modified request
   */
  async applyWrapper(request, wrapperName, domain) {
    if (wrapperName === 'default' || !wrapperName) {
      return request; // No modifications
    }

    const wrapper = await this.getWrapper(wrapperName, domain);
    const config = wrapper.config;

    // Clone request to avoid mutations
    const wrapped = { ...request };

    // Apply system prompt modifications
    if (config.systemPromptSuffix) {
      wrapped.systemPrompt = (wrapped.systemPrompt || '') + config.systemPromptSuffix;
    }

    // Apply temperature override
    if (config.temperature !== null && config.temperature !== undefined) {
      wrapped.temperature = config.temperature;
    }

    // Apply maxTokens override
    if (config.maxTokens) {
      wrapped.maxTokens = config.maxTokens;
    }

    // Apply output format preference
    if (config.outputFormat) {
      wrapped.outputFormat = config.outputFormat;
    }

    // Apply pre-processing
    if (config.preProcess) {
      wrapped.prompt = this._preProcess(wrapped.prompt, config.preProcess);
    }

    // Store wrapper name for post-processing
    wrapped._wrapperName = wrapperName;
    wrapped._wrapperConfig = config;

    return wrapped;
  }

  /**
   * Apply post-processing to response
   *
   * @param {object} response - LLM response
   * @param {object} request - Original wrapped request
   * @returns {object} - Post-processed response
   */
  postProcessResponse(response, request) {
    const config = request._wrapperConfig;

    if (!config || !config.postProcess) {
      return response;
    }

    let text = response.text;

    switch (config.postProcess) {
      case 'extractCodeOnly':
        text = this._extractCodeOnly(text);
        break;

      case 'forceBulletPoints':
        text = this._ensureBulletPoints(text);
        break;

      case 'forceNumberedList':
        text = this._ensureNumberedList(text);
        break;
    }

    return {
      ...response,
      text,
      wrapperApplied: request._wrapperName
    };
  }

  /**
   * Get all available wrappers for a domain
   *
   * @param {string} domain - Domain name
   * @returns {Array} - Available wrappers
   */
  getAvailableWrappers(domain) {
    const wrappers = [];

    // Add applicable built-in wrappers
    for (const [name, wrapper] of Object.entries(this.builtInWrappers)) {
      if (this._isApplicable(wrapper, domain)) {
        wrappers.push({
          name,
          displayName: wrapper.name,
          description: wrapper.description,
          type: 'built-in'
        });
      }
    }

    return wrappers;
  }

  /**
   * Register custom wrapper in database
   *
   * @param {object} wrapper - Wrapper definition
   * @returns {Promise<integer>} - Wrapper ID
   */
  async registerWrapper(wrapper) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    const {
      wrapperName,
      displayName,
      description,
      config,
      applicableDomains = ['*']
    } = wrapper;

    try {
      const result = await this.db.query(
        `INSERT INTO model_wrappers (wrapper_name, display_name, description, config, applicable_domains)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (wrapper_name) DO UPDATE SET
           display_name = $2,
           description = $3,
           config = $4,
           applicable_domains = $5,
           updated_at = NOW()
         RETURNING id`,
        [wrapperName, displayName, description, JSON.stringify(config), applicableDomains]
      );

      console.log(`[ModelWrappers] Registered custom wrapper '${wrapperName}'`);
      return result.rows[0].id;
    } catch (error) {
      console.error('[ModelWrappers] Error registering wrapper:', error.message);
      throw error;
    }
  }

  /**
   * Get custom wrapper from database
   * @private
   */
  async _getCustomWrapper(wrapperName, domain) {
    try {
      const result = await this.db.query(
        `SELECT wrapper_name, display_name, description, config, applicable_domains
         FROM model_wrappers
         WHERE wrapper_name = $1`,
        [wrapperName]
      );

      if (result.rows.length === 0) {
        throw new Error(`Custom wrapper '${wrapperName}' not found`);
      }

      const row = result.rows[0];

      // Check if applicable to domain
      if (domain && !row.applicable_domains.includes('*') && !row.applicable_domains.includes(domain)) {
        throw new Error(`Wrapper '${wrapperName}' not applicable to domain '${domain}'`);
      }

      return {
        name: row.display_name,
        description: row.description,
        config: row.config,
        applicableDomains: row.applicable_domains,
        type: 'custom'
      };
    } catch (error) {
      console.error('[ModelWrappers] Error getting custom wrapper:', error.message);
      throw error;
    }
  }

  /**
   * Check if wrapper is applicable to domain
   * @private
   */
  _isApplicable(wrapper, domain) {
    if (!domain) return true;
    const domains = wrapper.applicableDomains || [];
    return domains.includes('*') || domains.includes(domain);
  }

  /**
   * Pre-process prompt
   * @private
   */
  _preProcess(prompt, preProcessType) {
    switch (preProcessType) {
      case 'addCodeContext':
        return `Here's my code-related question:\n\n${prompt}`;

      case 'emphasizeQuick':
        return `Quick question: ${prompt}\n\n(I need a brief answer)`;

      default:
        return prompt;
    }
  }

  /**
   * Extract only code from response
   * @private
   */
  _extractCodeOnly(text) {
    // Find code blocks
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = text.match(codeBlockRegex);

    if (codeBlocks && codeBlocks.length > 0) {
      // Remove backticks and language identifier
      return codeBlocks
        .map(block => block.replace(/```\w*\n?/g, '').replace(/```$/g, '').trim())
        .join('\n\n');
    }

    // No code blocks found, return original
    return text;
  }

  /**
   * Ensure response is in bullet points
   * @private
   */
  _ensureBulletPoints(text) {
    // If already has bullet points, return as-is
    if (/^[\s]*[-*•]/m.test(text)) {
      return text;
    }

    // Convert paragraphs to bullet points
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => `- ${line.trim()}`).join('\n');
  }

  /**
   * Ensure response is a numbered list
   * @private
   */
  _ensureNumberedList(text) {
    // If already has numbered list, return as-is
    if (/^\s*\d+\./m.test(text)) {
      return text;
    }

    // Convert paragraphs to numbered list
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map((line, index) => `${index + 1}. ${line.trim()}`).join('\n');
  }
}

module.exports = ModelWrappers;
