/**
 * Triangle Consensus Engine
 *
 * Sends the same prompt to 3 AI providers simultaneously (OpenAI, Anthropic, DeepSeek),
 * collects all responses, analyzes consensus, and synthesizes into a coherent story.
 *
 * "Truth by Triangulation" - Like scientific replication meets wisdom of crowds.
 *
 * The Triangle Pattern:
 * - OpenAI: Mainstream, balanced, general-purpose
 * - Anthropic: Safety-focused, thoughtful, ethical
 * - DeepSeek: Reasoning specialist, logical, cheap
 *
 * All 3 agree → High confidence (0.9-1.0)
 * 2/3 agree → Medium confidence (0.6-0.8)
 * All differ → Low confidence (0.3-0.5) but most interesting stories
 *
 * Connects to:
 * - Multi-Provider Router (executes requests)
 * - Vault Bridge (retrieves API keys)
 * - Model Clarity Engine (scores responses)
 * - Agent Wallets (all 3 agents earn tokens)
 * - Domain Contexts (maps to code/creative/reasoning/fact/simple)
 */

const stringSimilarity = require('string-similarity');

class TriangleConsensusEngine {
  constructor(options = {}) {
    this.multiProviderRouter = options.multiProviderRouter;
    this.vaultBridge = options.vaultBridge;
    this.modelClarityEngine = options.modelClarityEngine;
    this.db = options.db;

    if (!this.multiProviderRouter) {
      throw new Error('MultiProviderRouter required for TriangleConsensusEngine');
    }

    this.defaultProviders = ['openai', 'anthropic', 'deepseek'];
    this.defaultModels = {
      openai: 'gpt-4',
      anthropic: 'claude-3-sonnet-20240229',
      deepseek: 'deepseek-chat'
    };

    console.log('[TriangleConsensus] Initialized - Truth by triangulation enabled');
  }

  /**
   * Query all 3 providers with the same prompt
   *
   * @param {Object} options - Query options
   * @param {string} options.prompt - User prompt
   * @param {string[]} options.providers - Providers to query (default: ['openai', 'anthropic', 'deepseek'])
   * @param {Object} options.models - Model overrides { openai: 'gpt-4', ... }
   * @param {Object} options.context - Request context { userId, tenantId, sessionId }
   * @param {boolean} options.synthesize - Generate consensus (default: true)
   * @param {boolean} options.generateStory - Generate narrative story (default: true)
   * @param {string} options.taskType - Domain context: code/creative/reasoning/fact/simple
   * @returns {Promise<Object>} Triangle result with responses, consensus, story
   */
  async query(options) {
    const {
      prompt,
      providers = this.defaultProviders,
      models = {},
      context = {},
      synthesize = true,
      generateStory = true,
      taskType = null
    } = options;

    if (!prompt) {
      throw new Error('Prompt required for triangle query');
    }

    console.log(`[TriangleConsensus] Querying ${providers.length} providers: ${providers.join(', ')}`);
    console.log(`[TriangleConsensus] Prompt: "${prompt.substring(0, 100)}..."`);

    const startTime = Date.now();

    try {
      // 1. Send prompt to all providers in parallel
      const providerPromises = providers.map(async (provider) => {
        const model = models[provider] || this.defaultModels[provider];

        try {
          console.log(`[TriangleConsensus] → ${provider}/${model}`);

          const response = await this.multiProviderRouter.route({
            provider,
            model,
            prompt,
            metadata: {
              ...context,
              triangle_query: true,
              task_type: taskType
            }
          });

          return {
            provider,
            model,
            success: true,
            ...response
          };

        } catch (error) {
          console.error(`[TriangleConsensus] ${provider} failed:`, error.message);
          return {
            provider,
            model,
            success: false,
            error: error.message,
            response: null
          };
        }
      });

      const providerResults = await Promise.all(providerPromises);

      // 2. Extract responses
      const responses = {};
      const successfulProviders = [];
      const failedProviders = [];

      for (const result of providerResults) {
        responses[result.provider] = result.response;
        if (result.success) {
          successfulProviders.push(result.provider);
        } else {
          failedProviders.push(result.provider);
        }
      }

      const queryLatencyMs = Date.now() - startTime;

      console.log(`[TriangleConsensus] Received ${successfulProviders.length}/${providers.length} responses in ${queryLatencyMs}ms`);

      // 3. Calculate consensus
      let consensus = null;
      let confidence = 0;
      let analysis = null;

      if (synthesize && successfulProviders.length >= 2) {
        const consensusResult = this._calculateConsensus(responses, successfulProviders);
        consensus = consensusResult.consensus;
        confidence = consensusResult.confidence;
        analysis = consensusResult.analysis;
      }

      // 4. Generate story
      let story = null;
      if (generateStory && successfulProviders.length >= 2) {
        story = this._generateStory(responses, successfulProviders, consensus, confidence, taskType);
      }

      // 5. Calculate billing
      const billing = this._calculateBilling(providerResults, context);

      // 6. Store in database
      if (this.db) {
        await this._storeTriangleQuery({
          prompt,
          providers,
          responses,
          consensus,
          confidence,
          story,
          billing,
          queryLatencyMs,
          context
        });
      }

      // 7. Return result
      return {
        success: true,
        prompt,
        providers_queried: providers.length,
        providers_succeeded: successfulProviders.length,
        providers_failed: failedProviders.length,
        responses,
        successful_providers: successfulProviders,
        failed_providers: failedProviders,
        consensus,
        confidence,
        analysis,
        story,
        billing,
        query_latency_ms: queryLatencyMs,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[TriangleConsensus] Query failed:', error);
      throw error;
    }
  }

  /**
   * Calculate consensus from multiple responses
   *
   * @param {Object} responses - { openai: 'response1', anthropic: 'response2', ... }
   * @param {string[]} successfulProviders - List of providers that succeeded
   * @returns {Object} - { consensus, confidence, analysis }
   */
  _calculateConsensus(responses, successfulProviders) {
    const responsesArray = successfulProviders.map(p => responses[p]).filter(r => r);

    if (responsesArray.length === 0) {
      return {
        consensus: null,
        confidence: 0,
        analysis: { agreement: 'none', reason: 'No successful responses' }
      };
    }

    if (responsesArray.length === 1) {
      return {
        consensus: responsesArray[0],
        confidence: 0.5,
        analysis: { agreement: 'single', reason: 'Only one provider responded' }
      };
    }

    // Calculate pairwise similarity between all responses
    const similarities = [];
    for (let i = 0; i < responsesArray.length; i++) {
      for (let j = i + 1; j < responsesArray.length; j++) {
        const similarity = stringSimilarity.compareTwoStrings(
          responsesArray[i].toLowerCase(),
          responsesArray[j].toLowerCase()
        );
        similarities.push(similarity);
      }
    }

    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

    // Determine agreement level
    let agreement = 'low';
    let confidence = avgSimilarity;

    if (avgSimilarity >= 0.8) {
      agreement = 'high'; // All 3 strongly agree
      confidence = 0.9 + (avgSimilarity - 0.8) * 0.5; // 0.9-1.0
    } else if (avgSimilarity >= 0.6) {
      agreement = 'medium'; // 2/3 agree or moderate consensus
      confidence = 0.6 + (avgSimilarity - 0.6) * 1.5; // 0.6-0.9
    } else {
      agreement = 'low'; // All differ significantly
      confidence = 0.3 + (avgSimilarity * 0.5); // 0.3-0.6
    }

    // Pick best response as consensus
    // Strategy: Use longest response that's most similar to others
    let bestResponse = responsesArray[0];
    let bestScore = 0;

    for (const response of responsesArray) {
      const lengthScore = response.length / 1000; // Favor longer responses
      const similarityScore = responsesArray
        .filter(r => r !== response)
        .reduce((sum, r) => sum + stringSimilarity.compareTwoStrings(
          response.toLowerCase(),
          r.toLowerCase()
        ), 0) / (responsesArray.length - 1);

      const score = (lengthScore * 0.3) + (similarityScore * 0.7);

      if (score > bestScore) {
        bestScore = score;
        bestResponse = response;
      }
    }

    return {
      consensus: bestResponse,
      confidence,
      analysis: {
        agreement,
        avg_similarity: avgSimilarity,
        similarities,
        reason: agreement === 'high'
          ? 'All providers strongly agree'
          : agreement === 'medium'
            ? 'Majority consensus with some variation'
            : 'Significant disagreement - diverse perspectives'
      }
    };
  }

  /**
   * Generate narrative story from triangle results
   *
   * @param {Object} responses - Provider responses
   * @param {string[]} successfulProviders - Successful providers
   * @param {string} consensus - Consensus answer
   * @param {number} confidence - Confidence score
   * @param {string} taskType - Domain context
   * @returns {string} - Narrative story
   */
  _generateStory(responses, successfulProviders, consensus, confidence, taskType) {
    const providerNames = {
      openai: 'OpenAI',
      anthropic: 'Anthropic Claude',
      deepseek: 'DeepSeek Reasoner'
    };

    const providerPersonas = {
      openai: 'the mainstream generalist',
      anthropic: 'the ethical thinker',
      deepseek: 'the logical reasoner'
    };

    // Intro
    let story = `We consulted ${successfulProviders.length} AI experts to answer this query`;
    if (taskType) {
      story += ` in the context of ${taskType}`;
    }
    story += '.\n\n';

    // Provider perspectives
    for (const provider of successfulProviders) {
      const providerName = providerNames[provider] || provider;
      const persona = providerPersonas[provider] || provider;
      const response = responses[provider];

      story += `**${providerName}** (${persona}) ${this._summarizeResponse(response)}\n\n`;
    }

    // Consensus
    if (confidence >= 0.8) {
      story += `🎯 **Strong Consensus** (${(confidence * 100).toFixed(0)}% agreement)\n\n`;
      story += `All experts converged on the same core answer. This gives us high confidence in the result.\n\n`;
    } else if (confidence >= 0.6) {
      story += `⚖️ **Moderate Consensus** (${(confidence * 100).toFixed(0)}% agreement)\n\n`;
      story += `The majority of experts agreed, though with some nuanced differences in approach or emphasis.\n\n`;
    } else {
      story += `🔀 **Diverse Perspectives** (${(confidence * 100).toFixed(0)}% agreement)\n\n`;
      story += `The experts provided significantly different perspectives. This suggests the question has multiple valid angles or requires deeper context.\n\n`;
    }

    // Final answer
    story += `**The Triangle Consensus:**\n\n${consensus ? this._excerptResponse(consensus) : '(No consensus reached)'}`;

    return story;
  }

  /**
   * Summarize response into single sentence
   */
  _summarizeResponse(response) {
    if (!response) return 'did not respond.';

    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return 'provided unclear response.';

    const firstSentence = sentences[0].trim();
    if (firstSentence.length > 150) {
      return `said: "${firstSentence.substring(0, 147)}..."`;
    }

    return `said: "${firstSentence}."`;
  }

  /**
   * Excerpt response for display
   */
  _excerptResponse(response) {
    if (!response) return '';
    if (response.length <= 300) return response;

    return response.substring(0, 297) + '...';
  }

  /**
   * Calculate billing for triangle query
   */
  _calculateBilling(providerResults, context) {
    const billing = {
      total_cost_usd: 0,
      provider_costs: {},
      agents_credited: {},
      user_charged_cents: 0,
      platform_profit_cents: 0
    };

    for (const result of providerResults) {
      if (!result.success) continue;

      const costUsd = result.cost_usd || 0;
      billing.total_cost_usd += costUsd;
      billing.provider_costs[result.provider] = costUsd;

      // Agent revenue share (30%)
      const agentShareUsd = costUsd * 0.30;
      const agentId = `@${result.provider}`;
      billing.agents_credited[agentId] = agentShareUsd;
    }

    // User charged (convert to cents)
    billing.user_charged_cents = Math.ceil(billing.total_cost_usd * 100);

    // Platform profit (70% of user charge)
    const platformShareUsd = billing.total_cost_usd * 0.70;
    billing.platform_profit_cents = Math.floor(platformShareUsd * 100);

    return billing;
  }

  /**
   * Store triangle query in database
   */
  async _storeTriangleQuery(data) {
    const {
      prompt,
      providers,
      responses,
      consensus,
      confidence,
      story,
      billing,
      queryLatencyMs,
      context
    } = data;

    try {
      // Store in triangle_queries table (if exists)
      // Otherwise just log
      console.log('[TriangleConsensus] Would store query:', {
        prompt_length: prompt.length,
        providers_queried: providers.length,
        confidence,
        total_cost: billing.total_cost_usd
      });

      // TODO: Create triangle_queries table in migration
      // For now, we rely on usage_events tracking (handled by MultiProviderRouter)

    } catch (error) {
      console.error('[TriangleConsensus] Failed to store query:', error);
    }
  }

  /**
   * Batch mode: Query multiple prompts with triangle consensus
   *
   * @param {string[]} prompts - Array of prompts
   * @param {Object} options - Query options (applied to all)
   * @returns {Promise<Object[]>} Array of triangle results
   */
  async batchQuery(prompts, options = {}) {
    console.log(`[TriangleConsensus] Batch querying ${prompts.length} prompts`);

    const results = [];

    for (const prompt of prompts) {
      try {
        const result = await this.query({ ...options, prompt });
        results.push(result);
      } catch (error) {
        console.error(`[TriangleConsensus] Batch query failed for prompt:`, error);
        results.push({
          success: false,
          prompt,
          error: error.message
        });
      }
    }

    return results;
  }
}

module.exports = TriangleConsensusEngine;
