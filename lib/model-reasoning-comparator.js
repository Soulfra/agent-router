/**
 * Model Reasoning Comparator
 *
 * Sends same research query to multiple AI models in parallel,
 * compares their reasoning processes, and reveals their preferences
 *
 * Features:
 * - Parallel execution (5+ models simultaneously)
 * - Side-by-side comparison (sources, facts, bias, confidence)
 * - Consensus detection (2/3 agree = medium confidence, 5/5 = high)
 * - Preference tracking (which sources does each model prefer?)
 * - Reasoning pattern analysis (quick vs. thorough, analytical vs. creative)
 *
 * Models Compared:
 * - GPT-4 (OpenAI)
 * - Claude 3.5 Sonnet (Anthropic)
 * - DeepSeek Chat
 * - Ollama (Qwen 2.5 Coder 32B)
 * - Ollama (Llama 3.1 70B) - optional
 *
 * Use Case:
 *   const comparator = new ModelReasoningComparator({ router, logger, detector });
 *   const comparison = await comparator.compareAll('What pirate treasure was found in 2025?');
 *   // → Shows how each model researched, what they found, which is best
 */

const ThoughtProcessLogger = require('./thought-process-logger');
const BiasDetector = require('./bias-detector');
const KnowledgeFreshnessLayer = require('./knowledge-freshness-layer');

class ModelReasoningComparator {
  constructor(options = {}) {
    this.config = {
      llmRouter: options.llmRouter,
      logger: options.logger || new ThoughtProcessLogger({ db: options.db, vault: options.vault }),
      biasDetector: options.biasDetector || new BiasDetector(),
      vault: options.vault,
      db: options.db,

      // Models to compare
      models: options.models || [
        { provider: 'openai', model: 'gpt-4', name: 'GPT-4' },
        { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5' },
        { provider: 'deepseek', model: 'deepseek-chat', name: 'DeepSeek' },
        { provider: 'ollama', model: 'qwen2.5-coder:32b', name: 'Qwen 2.5 32B' },
        { provider: 'ollama', model: 'llama3.1:70b', name: 'Llama 3.1 70B' }
      ],

      // Comparison settings
      enableWebResearch: options.enableWebResearch !== false,
      timeout: options.timeout || 60000, // 60s per model
      parallelExecution: options.parallelExecution !== false
    };

    // Preference tracking (what does each model like?)
    this.preferences = new Map();

    console.log('[ModelReasoningComparator] Initialized with', this.config.models.length, 'models');
  }

  /**
   * Compare all models on same query
   */
  async compareAll(query, options = {}) {
    console.log(`[ModelReasoningComparator] 🔬 Comparing ${this.config.models.length} models on: "${query}"`);

    const startTime = Date.now();

    // Create comparison session
    const comparisonId = await this._createComparisonSession(query);

    // Execute all models in parallel
    const results = await this._executeModelsInParallel(query, comparisonId, options);

    // Analyze results
    const analysis = await this._analyzeResults(results);

    // Track preferences
    await this._trackPreferences(results);

    // Calculate consensus
    const consensus = await this._calculateConsensus(results, analysis);

    // Determine best model
    const bestModel = this._selectBestModel(results, analysis);

    const totalTime = Date.now() - startTime;

    console.log(`[ModelReasoningComparator] ✅ Comparison complete (${totalTime}ms)`);
    console.log(`[ModelReasoningComparator] Best model: ${bestModel.name} (score: ${bestModel.score.toFixed(2)})`);

    return {
      comparisonId,
      query,
      models: results,
      analysis,
      consensus,
      bestModel,
      totalTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Execute all models in parallel
   */
  async _executeModelsInParallel(query, comparisonId, options) {
    const promises = this.config.models.map(async (modelConfig) => {
      try {
        return await this._executeSingleModel(query, modelConfig, comparisonId, options);
      } catch (err) {
        console.error(`[ModelReasoningComparator] ${modelConfig.name} failed:`, err.message);
        return {
          model: modelConfig.name,
          provider: modelConfig.provider,
          error: err.message,
          success: false
        };
      }
    });

    if (this.config.parallelExecution) {
      return await Promise.all(promises);
    } else {
      // Sequential (for debugging)
      const results = [];
      for (const promise of promises) {
        results.push(await promise);
      }
      return results;
    }
  }

  /**
   * Execute single model
   */
  async _executeSingleModel(query, modelConfig, comparisonId, options) {
    const startTime = Date.now();

    console.log(`[ModelReasoningComparator] → ${modelConfig.name} starting...`);

    // Create reasoning session for this model
    const sessionId = await this.config.logger.startSession(query, {
      userId: 'system',
      context: {
        comparisonId,
        model: modelConfig.name,
        provider: modelConfig.provider
      }
    });

    // Create Knowledge Freshness Layer for this model
    const freshness = new KnowledgeFreshnessLayer({
      llmRouter: this.config.llmRouter,
      researcher: options.researcher,
      vault: this.config.vault,
      llmCutoffs: {
        [modelConfig.model]: options.cutoffDate || new Date('2024-10-01')
      }
    });

    // Query with research
    const result = await Promise.race([
      freshness.query(query, {
        model: modelConfig.model,
        provider: modelConfig.provider,
        forceRefresh: options.forceRefresh
      }),
      this._timeout(this.config.timeout, `${modelConfig.name} timeout`)
    ]);

    const responseTime = Date.now() - startTime;

    // Analyze bias if research was triggered
    let biasAnalysis = null;
    if (result.research) {
      biasAnalysis = await this.config.biasDetector.analyze(
        result.research.summary || '',
        result.research.sources || []
      );

      await this.config.logger.logStep(sessionId, 'bias_checked', {
        biasScore: biasAnalysis.biasScore,
        warnings: biasAnalysis.warnings
      });
    }

    // End session
    await this.config.logger.endSession(sessionId, result.answer, {
      model: modelConfig.name,
      responseTime,
      biasScore: biasAnalysis ? biasAnalysis.biasScore : 'N/A'
    });

    // Extract facts from answer
    const extractedFacts = this._extractFacts(result.answer);

    console.log(`[ModelReasoningComparator] ✅ ${modelConfig.name} complete (${responseTime}ms)`);

    return {
      model: modelConfig.name,
      provider: modelConfig.provider,
      modelId: modelConfig.model,
      success: true,
      answer: result.answer,
      research: result.research || null,
      biasAnalysis,
      facts: extractedFacts,
      sourcesUsed: result.research ? result.research.sources.length : 0,
      confidence: this._estimateConfidence(result, biasAnalysis),
      reasoningPattern: this._detectReasoningPattern(result),
      responseTime,
      sessionId
    };
  }

  /**
   * Analyze all results
   */
  async _analyzeResults(results) {
    const successful = results.filter(r => r.success);

    if (successful.length === 0) {
      return { error: 'All models failed' };
    }

    // Compare sources
    const sourcePreferences = {};
    for (const result of successful) {
      sourcePreferences[result.model] = result.research
        ? result.research.sources.map(s => s.name)
        : [];
    }

    // Compare facts
    const allFacts = successful.flatMap(r => r.facts);
    const uniqueFacts = [...new Set(allFacts)];
    const commonFacts = uniqueFacts.filter(fact =>
      successful.filter(r => r.facts.includes(fact)).length >= successful.length / 2
    );

    // Compare bias detection
    const biasScores = {};
    for (const result of successful) {
      if (result.biasAnalysis) {
        biasScores[result.model] = result.biasAnalysis.biasScore;
      }
    }

    // Compare reasoning patterns
    const reasoningPatterns = {};
    for (const result of successful) {
      reasoningPatterns[result.model] = result.reasoningPattern;
    }

    // Compare response times
    const responseTimes = {};
    for (const result of successful) {
      responseTimes[result.model] = result.responseTime;
    }

    return {
      sourcePreferences,
      commonFacts,
      uniqueFacts: uniqueFacts.length,
      biasScores,
      reasoningPatterns,
      responseTimes,
      averageResponseTime: Object.values(responseTimes).reduce((a, b) => a + b, 0) / successful.length,
      successRate: (successful.length / results.length) * 100
    };
  }

  /**
   * Calculate consensus
   */
  async _calculateConsensus(results, analysis) {
    const successful = results.filter(r => r.success);

    if (successful.length < 2) {
      return {
        agreement: 0,
        majorityAnswer: null,
        disagreements: ['Insufficient models for consensus']
      };
    }

    // Find most common facts
    const factCounts = new Map();
    for (const result of successful) {
      for (const fact of result.facts) {
        factCounts.set(fact, (factCounts.get(fact) || 0) + 1);
      }
    }

    const majorityFacts = Array.from(factCounts.entries())
      .filter(([_, count]) => count >= successful.length / 2)
      .map(([fact, _]) => fact);

    // Calculate agreement score
    const agreement = majorityFacts.length / analysis.uniqueFacts;

    // Find disagreements
    const disagreements = [];
    if (agreement < 0.7) {
      disagreements.push('Models disagree on key facts');
    }

    return {
      agreement,
      majorityFacts,
      disagreements,
      consensusLevel: agreement >= 0.8 ? 'HIGH' : agreement >= 0.6 ? 'MEDIUM' : 'LOW'
    };
  }

  /**
   * Select best model
   */
  _selectBestModel(results, analysis) {
    const successful = results.filter(r => r.success);

    if (successful.length === 0) {
      return { name: 'None', score: 0, reason: 'All models failed' };
    }

    // Score each model
    const scores = successful.map(result => {
      let score = 0;

      // Confidence (+30 points max)
      score += result.confidence * 30;

      // Sources used (+20 points max)
      score += Math.min(result.sourcesUsed * 10, 20);

      // Bias detection (+20 points)
      if (result.biasAnalysis) {
        const biasPoints = { LOW: 20, MEDIUM: 10, HIGH: 5, VERY_HIGH: 0 };
        score += biasPoints[result.biasAnalysis.biasScore] || 0;
      }

      // Response time (-10 to +10 points, faster = better)
      const avgTime = analysis.averageResponseTime;
      const timeDiff = (avgTime - result.responseTime) / avgTime;
      score += timeDiff * 10;

      // Reasoning pattern (+10 points for thorough patterns)
      if (result.reasoningPattern.includes('verify')) {
        score += 10;
      }

      return {
        model: result.model,
        score,
        result
      };
    });

    // Sort by score
    scores.sort((a, b) => b.score - a.score);

    const best = scores[0];

    return {
      name: best.model,
      score: best.score,
      reason: this._explainScore(best.result, best.score),
      fullResult: best.result
    };
  }

  /**
   * Explain score
   */
  _explainScore(result, score) {
    const reasons = [];

    if (result.confidence > 0.8) reasons.push('high confidence');
    if (result.sourcesUsed >= 2) reasons.push(`${result.sourcesUsed} sources verified`);
    if (result.biasAnalysis && result.biasAnalysis.biasScore === 'LOW') reasons.push('low bias detected');
    if (result.reasoningPattern.includes('verify')) reasons.push('thorough verification');
    if (result.responseTime < 10000) reasons.push('fast response');

    return reasons.join(', ') || 'best overall score';
  }

  /**
   * Track model preferences
   */
  async _trackPreferences(results) {
    for (const result of results) {
      if (!result.success || !result.research) continue;

      const modelKey = result.model;
      if (!this.preferences.has(modelKey)) {
        this.preferences.set(modelKey, {
          sources: {},
          factsExtracted: 0,
          totalQueries: 0
        });
      }

      const prefs = this.preferences.get(modelKey);
      prefs.totalQueries++;
      prefs.factsExtracted += result.facts.length;

      for (const source of result.research.sources) {
        const sourceName = source.name;
        prefs.sources[sourceName] = (prefs.sources[sourceName] || 0) + 1;
      }
    }
  }

  /**
   * Get preferences for model
   */
  getPreferences(modelName) {
    return this.preferences.get(modelName) || null;
  }

  /**
   * Estimate confidence
   */
  _estimateConfidence(result, biasAnalysis) {
    let confidence = 0.5; // Base

    // Research triggered = +0.2
    if (result.research) {
      confidence += 0.2;
    }

    // Multiple sources = +0.1 per source (max +0.3)
    if (result.research && result.research.sources) {
      confidence += Math.min(result.research.sources.length * 0.1, 0.3);
    }

    // Low bias = +0.2
    if (biasAnalysis && biasAnalysis.biasScore === 'LOW') {
      confidence += 0.2;
    }

    // Medium bias = +0.1
    if (biasAnalysis && biasAnalysis.biasScore === 'MEDIUM') {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Detect reasoning pattern
   */
  _detectReasoningPattern(result) {
    if (!result.research) {
      return 'training-limited';
    }

    const sourcesCount = result.research.sources.length;

    if (sourcesCount >= 3) {
      return 'verify-then-conclude';
    } else if (sourcesCount === 2) {
      return 'cross-reference';
    } else {
      return 'quick-conclusion';
    }
  }

  /**
   * Extract facts from text
   */
  _extractFacts(text) {
    const facts = [];

    // Extract sentences
    const sentences = text.split(/[.!?]\s+/).filter(s => s.length > 20);

    // Take first 5 sentences as "facts"
    facts.push(...sentences.slice(0, 5));

    return facts;
  }

  /**
   * Create comparison session
   */
  async _createComparisonSession(query) {
    if (!this.config.db) {
      return `comparison_${Date.now()}`;
    }

    const result = await this.config.db.query(
      `INSERT INTO model_comparisons (query, models, started_at)
       VALUES ($1, $2, NOW())
       RETURNING id`,
      [query, JSON.stringify(this.config.models.map(m => m.name))]
    );

    return result.rows[0].id;
  }

  /**
   * Timeout helper
   */
  _timeout(ms, message) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }
}

module.exports = ModelReasoningComparator;
