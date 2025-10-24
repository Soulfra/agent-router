/**
 * Knowledge Freshness Layer
 *
 * Detects when Ollama/LLM data is stale and automatically triggers
 * real-time web research to supplement responses
 *
 * Features:
 * - Detects temporal queries ("2025", "latest", "current")
 * - Compares LLM training cutoff vs. query time period
 * - Automatically triggers AutonomousResearchAgent
 * - Merges real-time data with LLM reasoning
 * - Transparent to user (seamless research)
 *
 * Use Case:
 *   User: "What pirate treasure was found in 2025?"
 *   LLM: "I don't have data past January 2025"
 *   → Knowledge Freshness Layer detects stale data
 *   → Triggers web research
 *   → Returns: "Madagascar shipwreck discovered Jan 2025..."
 *
 * Example:
 *   const freshness = new KnowledgeFreshnessLayer({ llm, researcher });
 *   const answer = await freshness.query('Latest AI developments?');
 *   // → Automatically fetches current data if LLM is stale
 */

const AutonomousResearchAgent = require('./autonomous-research-agent');

class KnowledgeFreshnessLayer {
  constructor(options = {}) {
    this.config = {
      llmRouter: options.llmRouter,
      researcher: options.researcher, // AutonomousResearchAgent
      vault: options.vault,

      // LLM training cutoff (update this as models update)
      llmCutoffs: options.llmCutoffs || {
        'qwen2.5-coder:32b': new Date('2024-10-01'), // Qwen 2.5 cutoff
        'claude-3-5-sonnet-20241022': new Date('2024-10-01'), // Claude cutoff
        'gpt-4': new Date('2024-04-01'), // GPT-4 cutoff
        'default': new Date('2024-06-01') // Fallback
      },

      // Temporal keywords that indicate need for fresh data
      temporalKeywords: [
        'latest', 'current', 'recent', 'today', 'now', 'this year',
        '2025', '2024', 'yesterday', 'last week', 'this month'
      ],

      // How to merge LLM + research results
      mergeStrategy: options.mergeStrategy || 'prepend_facts' // 'prepend_facts' | 'append_sources' | 'replace'
    };

    if (!this.config.researcher) {
      console.warn('[KnowledgeFreshnessLayer] No researcher provided, creating default');
      this.config.researcher = new AutonomousResearchAgent({ vault: this.config.vault });
    }

    console.log('[KnowledgeFreshnessLayer] Initialized');
  }

  /**
   * Query with automatic freshness detection
   */
  async query(question, options = {}) {
    console.log(`[KnowledgeFreshnessLayer] Query: "${question}"`);

    // Detect if query needs fresh data
    const needsFreshData = this._detectStaleness(question, options);

    if (needsFreshData) {
      console.log('[KnowledgeFreshnessLayer] 🔄 Stale data detected, triggering research...');
      return await this._queryWithResearch(question, options);
    } else {
      console.log('[KnowledgeFreshnessLayer] ✅ Using LLM only (no freshness issues)');
      return await this._queryLLMOnly(question, options);
    }
  }

  /**
   * Detect if query requires fresh data
   */
  _detectStaleness(question, options = {}) {
    const lowerQ = question.toLowerCase();

    // Check for temporal keywords
    const hasTemporal = this.config.temporalKeywords.some(kw => lowerQ.includes(kw));

    if (hasTemporal) {
      // Extract year from question
      const yearMatch = question.match(/\b(202[0-9])\b/);
      if (yearMatch) {
        const queryYear = parseInt(yearMatch[1]);
        const currentYear = new Date().getFullYear();

        // If asking about current year or future, need fresh data
        if (queryYear >= currentYear) {
          console.log(`[KnowledgeFreshnessLayer] 📅 Query year ${queryYear} >= current year ${currentYear}`);
          return true;
        }
      }

      // Check against LLM cutoff
      const modelName = options.model || 'default';
      const cutoff = this.config.llmCutoffs[modelName] || this.config.llmCutoffs['default'];
      const cutoffAge = Date.now() - cutoff.getTime();
      const threeMonths = 90 * 24 * 60 * 60 * 1000;

      if (cutoffAge < threeMonths) {
        // LLM is recent, might have data
        return false;
      }

      // Temporal keyword + old LLM = need fresh data
      return true;
    }

    // Check if question explicitly mentions LLM limitations
    if (lowerQ.includes('dont know') || lowerQ.includes("don't have") || lowerQ.includes('after my')) {
      return true;
    }

    return false;
  }

  /**
   * Query LLM only (no research needed)
   */
  async _queryLLMOnly(question, options = {}) {
    const response = await this.config.llmRouter.complete({
      prompt: question,
      taskType: options.taskType || 'fact',
      maxTokens: options.maxTokens || 500,
      temperature: options.temperature || 0.7
    });

    return {
      answer: response.text,
      source: 'llm',
      model: response.model,
      freshness: 'cached',
      researchTriggered: false
    };
  }

  /**
   * Query with web research supplementing LLM
   */
  async _queryWithResearch(question, options = {}) {
    // Step 1: Research current data
    const research = await this.config.researcher.research(question, {
      forceRefresh: options.forceRefresh
    });

    // Step 2: Get LLM response (with research context)
    const llmResponse = await this._queryLLMWithContext(question, research, options);

    // Step 3: Merge results
    const merged = this._mergeResults(llmResponse, research);

    return {
      answer: merged.answer,
      source: 'llm+research',
      model: llmResponse.model,
      freshness: 'realtime',
      researchTriggered: true,
      research: {
        summary: research.summary,
        facts: research.facts,
        sources: research.sources,
        dates: research.dates,
        amounts: research.amounts,
        locations: research.locations
      }
    };
  }

  /**
   * Query LLM with research context
   */
  async _queryLLMWithContext(question, research, options = {}) {
    // Build context from research
    const context = this._buildContext(research);

    // Enhanced prompt with real-time data
    const enhancedPrompt = `You are answering a question with access to real-time web data.

Question: ${question}

Current information from the web (scraped ${research.scrapedAt}):
${context}

Answer the question using the real-time data above. Be specific and cite the information.

Your answer:`;

    const response = await this.config.llmRouter.complete({
      prompt: enhancedPrompt,
      taskType: options.taskType || 'fact',
      maxTokens: options.maxTokens || 500,
      temperature: options.temperature || 0.7
    });

    return {
      text: response.text,
      model: response.model
    };
  }

  /**
   * Build context string from research data
   */
  _buildContext(research) {
    const parts = [];

    // Summary
    if (research.summary) {
      parts.push(`Summary: ${research.summary}`);
    }

    // Key facts
    if (research.facts && research.facts.length > 0) {
      parts.push(`\nKey facts:\n${research.facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`);
    }

    // Dates mentioned
    if (research.dates && research.dates.length > 0) {
      parts.push(`\nDates: ${research.dates.join(', ')}`);
    }

    // Amounts mentioned
    if (research.amounts && research.amounts.length > 0) {
      parts.push(`\nAmounts: ${research.amounts.join(', ')}`);
    }

    // Locations mentioned
    if (research.locations && research.locations.length > 0) {
      parts.push(`\nLocations: ${research.locations.slice(0, 5).join(', ')}`);
    }

    // Sources
    if (research.sources && research.sources.length > 0) {
      parts.push(`\nSources:\n${research.sources.map(s => `- ${s.name}: ${s.url}`).join('\n')}`);
    }

    return parts.join('\n');
  }

  /**
   * Merge LLM response with research data
   */
  _mergeResults(llmResponse, research) {
    switch (this.config.mergeStrategy) {
      case 'prepend_facts':
        // Prepend research facts to LLM answer
        const factsPrefix = research.facts.slice(0, 2).join(' ');
        return {
          answer: `${factsPrefix}\n\n${llmResponse.text}`,
          sources: research.sources
        };

      case 'append_sources':
        // Append sources to LLM answer
        const sourcesText = research.sources.map(s => `[${s.name}](${s.url})`).join(', ');
        return {
          answer: `${llmResponse.text}\n\nSources: ${sourcesText}`,
          sources: research.sources
        };

      case 'replace':
        // Replace LLM answer with research summary
        return {
          answer: research.summary,
          sources: research.sources
        };

      default:
        // Just LLM answer (with sources attached)
        return {
          answer: llmResponse.text,
          sources: research.sources
        };
    }
  }

  /**
   * Update LLM cutoff dates (when models are updated)
   */
  updateCutoff(modelName, cutoffDate) {
    this.config.llmCutoffs[modelName] = new Date(cutoffDate);
    console.log(`[KnowledgeFreshnessLayer] Updated cutoff for ${modelName}: ${cutoffDate}`);
  }

  /**
   * Get freshness status
   */
  getFreshnessStatus() {
    return {
      llmCutoffs: this.config.llmCutoffs,
      researcherActive: this.config.researcher !== null,
      temporalKeywords: this.config.temporalKeywords.length,
      mergeStrategy: this.config.mergeStrategy
    };
  }
}

module.exports = KnowledgeFreshnessLayer;
