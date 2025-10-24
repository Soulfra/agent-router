/**
 * Reasoning Dissector
 *
 * Analyzes HOW each AI model thinks (not just WHAT they say)
 *
 * Features:
 * - Reasoning pattern detection (analytical, creative, cautious, confident)
 * - Chain-of-thought analysis (step-by-step vs jump-to-conclusion)
 * - Confidence calibration (overconfident vs hedging)
 * - Source preference tracking (Wikipedia vs news vs academic)
 * - Fact extraction efficiency (how many facts per source)
 * - Reasoning fingerprints (unique patterns per model)
 *
 * Use Cases:
 * - "How does GPT-4 think differently than Claude?"
 * - "Which model is best at verifying facts?"
 * - "Which model is most confident in its answers?"
 * - "Which model prefers academic sources?"
 *
 * Example:
 *   const dissector = new ReasoningDissector();
 *   const fingerprint = await dissector.analyzeReasoning(modelResults);
 *   // → { pattern: 'analytical-thorough', confidence: 0.85, sourcePreference: 'academic', ... }
 */

class ReasoningDissector {
  constructor(options = {}) {
    this.config = {
      // Confidence thresholds
      overconfidentThreshold: options.overconfidentThreshold || 0.9,
      hedgingThreshold: options.hedgingThreshold || 0.5,

      // Pattern detection
      minStepsForThorough: options.minStepsForThorough || 3,
      minSourcesForVerification: options.minSourcesForVerification || 2,

      // Fingerprinting
      enableFingerprinting: options.enableFingerprinting !== false,
      trackPatternEvolution: options.trackPatternEvolution !== false
    };

    // Known model fingerprints (learned from comparisons)
    this.modelFingerprints = new Map();

    console.log('[ReasoningDissector] Initialized');
  }

  /**
   * Analyze reasoning from model result
   */
  async analyzeReasoning(modelResult) {
    const analysis = {
      model: modelResult.model,

      // Reasoning pattern
      pattern: this._detectReasoningPattern(modelResult),
      patternConfidence: 0,

      // Confidence calibration
      confidenceLevel: modelResult.confidence || 0,
      confidenceStyle: this._analyzeConfidenceStyle(modelResult),

      // Source behavior
      sourcePreference: this._analyzeSourcePreference(modelResult),
      sourceDiversity: this._analyzeSourceDiversity(modelResult),

      // Fact extraction
      factExtractionRate: this._calculateFactExtractionRate(modelResult),
      factsPerSource: this._calculateFactsPerSource(modelResult),

      // Bias awareness
      biasAwareness: this._analyzeBiasAwareness(modelResult),

      // Speed vs thoroughness
      speedVsThoroughness: this._analyzeSpeedThoroughness(modelResult),

      // Chain-of-thought
      chainOfThought: this._analyzeChainOfThought(modelResult),

      timestamp: new Date().toISOString()
    };

    // Build fingerprint
    if (this.config.enableFingerprinting) {
      analysis.fingerprint = this._buildFingerprint(analysis);
      this._updateModelFingerprint(modelResult.model, analysis.fingerprint);
    }

    return analysis;
  }

  /**
   * Compare reasoning across multiple models
   */
  async compareReasoning(modelResults) {
    const analyses = [];

    for (const result of modelResults) {
      if (!result.success) continue;
      const analysis = await this.analyzeReasoning(result);
      analyses.push(analysis);
    }

    // Find differences
    const differences = this._findReasoningDifferences(analyses);

    // Rank models by reasoning quality
    const rankings = this._rankReasoningQuality(analyses);

    return {
      analyses,
      differences,
      rankings,
      consensus: this._findReasoningConsensus(analyses),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Detect reasoning pattern
   */
  _detectReasoningPattern(result) {
    const patterns = [];

    // Check for analytical pattern
    if (result.sourcesUsed >= 3 && result.facts && result.facts.length >= 5) {
      patterns.push('analytical');
    }

    // Check for thorough verification
    if (result.reasoningPattern && result.reasoningPattern.includes('verify')) {
      patterns.push('thorough');
    }

    // Check for quick conclusion
    if (result.sourcesUsed <= 1 || result.responseTime < 5000) {
      patterns.push('quick');
    }

    // Check for creative pattern
    if (result.answer && this._detectCreativeLanguage(result.answer)) {
      patterns.push('creative');
    }

    // Check for cautious pattern
    if (this._detectHedging(result.answer)) {
      patterns.push('cautious');
    }

    // Check for confident pattern
    if (result.confidence > this.config.overconfidentThreshold) {
      patterns.push('confident');
    }

    return patterns.length > 0 ? patterns.join('-') : 'default';
  }

  /**
   * Analyze confidence style
   */
  _analyzeConfidenceStyle(result) {
    const confidence = result.confidence || 0;
    const answer = result.answer || '';

    const hedgingWords = ['might', 'could', 'possibly', 'perhaps', 'may', 'likely'];
    const hedgingCount = hedgingWords.filter(word =>
      answer.toLowerCase().includes(word)
    ).length;

    if (confidence > this.config.overconfidentThreshold && hedgingCount === 0) {
      return 'overconfident';
    }

    if (confidence < this.config.hedgingThreshold || hedgingCount >= 3) {
      return 'hedging';
    }

    if (confidence >= 0.7 && hedgingCount <= 1) {
      return 'calibrated';
    }

    return 'uncertain';
  }

  /**
   * Analyze source preference
   */
  _analyzeSourcePreference(result) {
    if (!result.research || !result.research.sources) {
      return 'none';
    }

    const sources = result.research.sources;
    const sourceTypes = {
      wikipedia: 0,
      news: 0,
      academic: 0,
      blog: 0,
      government: 0,
      social: 0,
      other: 0
    };

    for (const source of sources) {
      const url = source.url.toLowerCase();

      if (url.includes('wikipedia')) {
        sourceTypes.wikipedia++;
      } else if (url.includes('news') || url.includes('bbc') || url.includes('cnn')) {
        sourceTypes.news++;
      } else if (url.includes('.edu') || url.includes('scholar')) {
        sourceTypes.academic++;
      } else if (url.includes('blog') || url.includes('medium')) {
        sourceTypes.blog++;
      } else if (url.includes('.gov')) {
        sourceTypes.government++;
      } else if (url.includes('twitter') || url.includes('reddit')) {
        sourceTypes.social++;
      } else {
        sourceTypes.other++;
      }
    }

    // Find most preferred source type
    let maxType = 'other';
    let maxCount = 0;

    for (const [type, count] of Object.entries(sourceTypes)) {
      if (count > maxCount) {
        maxType = type;
        maxCount = count;
      }
    }

    return maxType;
  }

  /**
   * Analyze source diversity
   */
  _analyzeSourceDiversity(result) {
    if (!result.research || !result.research.sources) {
      return { diversity: 0, uniqueDomains: 0, score: 'none' };
    }

    const domains = new Set();
    const sourceTypes = new Set();

    for (const source of result.research.sources) {
      const url = new URL(source.url);
      domains.add(url.hostname);

      // Categorize source type
      const urlLower = source.url.toLowerCase();
      if (urlLower.includes('wikipedia')) sourceTypes.add('encyclopedia');
      else if (urlLower.includes('news')) sourceTypes.add('news');
      else if (urlLower.includes('.edu')) sourceTypes.add('academic');
      else sourceTypes.add('general');
    }

    const diversity = sourceTypes.size / 4; // Max 4 types

    return {
      diversity,
      uniqueDomains: domains.size,
      sourceTypes: Array.from(sourceTypes),
      score: diversity >= 0.75 ? 'high' : diversity >= 0.5 ? 'medium' : 'low'
    };
  }

  /**
   * Calculate fact extraction rate
   */
  _calculateFactExtractionRate(result) {
    if (!result.research || !result.facts) {
      return 0;
    }

    const totalWords = result.research.summary
      ? result.research.summary.split(/\s+/).length
      : 0;

    const factsExtracted = result.facts.length;

    if (totalWords === 0) return 0;

    // Facts per 100 words
    return (factsExtracted / totalWords) * 100;
  }

  /**
   * Calculate facts per source
   */
  _calculateFactsPerSource(result) {
    if (!result.research || !result.facts || result.sourcesUsed === 0) {
      return 0;
    }

    return result.facts.length / result.sourcesUsed;
  }

  /**
   * Analyze bias awareness
   */
  _analyzeBiasAwareness(result) {
    if (!result.biasAnalysis) {
      return { aware: false, score: 0 };
    }

    const biasScore = result.biasAnalysis.biasScore;
    const warnings = result.biasAnalysis.warnings || [];

    const aware = warnings.length > 0;
    const score = biasScore === 'LOW' ? 1.0 :
                  biasScore === 'MEDIUM' ? 0.7 :
                  biasScore === 'HIGH' ? 0.4 : 0.2;

    return {
      aware,
      score,
      biasScore,
      warningsDetected: warnings.length
    };
  }

  /**
   * Analyze speed vs thoroughness tradeoff
   */
  _analyzeSpeedThoroughness(result) {
    const responseTime = result.responseTime || 0;
    const sourcesUsed = result.sourcesUsed || 0;
    const factsExtracted = result.facts ? result.facts.length : 0;

    // Speed score (faster = higher)
    const speedScore = Math.max(0, 1 - (responseTime / 60000)); // 60s = 0 speed

    // Thoroughness score (more sources + facts = higher)
    const thoroughnessScore = Math.min(1, (sourcesUsed * 0.2 + factsExtracted * 0.1));

    // Efficiency = thoroughness per second
    const efficiency = responseTime > 0
      ? thoroughnessScore / (responseTime / 1000)
      : 0;

    return {
      speedScore,
      thoroughnessScore,
      efficiency,
      tradeoff: speedScore > thoroughnessScore ? 'fast' : 'thorough'
    };
  }

  /**
   * Analyze chain-of-thought
   */
  _analyzeChainOfThought(result) {
    // If we have reasoning steps, analyze them
    if (result.sessionId) {
      // Placeholder - would need ThoughtProcessLogger integration
      return {
        steps: 0,
        pattern: 'unknown',
        clarity: 0
      };
    }

    // Fallback: analyze answer structure
    const answer = result.answer || '';
    const sentences = answer.split(/[.!?]/).filter(s => s.trim().length > 0);

    return {
      steps: sentences.length,
      pattern: sentences.length >= 5 ? 'step-by-step' : 'direct',
      clarity: this._calculateClarity(answer)
    };
  }

  /**
   * Build reasoning fingerprint
   */
  _buildFingerprint(analysis) {
    return {
      pattern: analysis.pattern,
      confidenceStyle: analysis.confidenceStyle,
      sourcePreference: analysis.sourcePreference,
      speedVsThoroughness: analysis.speedVsThoroughness.tradeoff,
      biasAwareness: analysis.biasAwareness.aware,
      factExtractionRate: analysis.factExtractionRate,
      uniqueId: `${analysis.model}_${analysis.pattern}_${analysis.confidenceStyle}`
    };
  }

  /**
   * Update model fingerprint (track evolution)
   */
  _updateModelFingerprint(modelName, fingerprint) {
    if (!this.modelFingerprints.has(modelName)) {
      this.modelFingerprints.set(modelName, {
        fingerprints: [],
        commonPattern: null,
        consistency: 0
      });
    }

    const modelData = this.modelFingerprints.get(modelName);
    modelData.fingerprints.push(fingerprint);

    // Keep last 100 fingerprints
    if (modelData.fingerprints.length > 100) {
      modelData.fingerprints.shift();
    }

    // Calculate most common pattern
    const patternCounts = {};
    for (const fp of modelData.fingerprints) {
      patternCounts[fp.pattern] = (patternCounts[fp.pattern] || 0) + 1;
    }

    modelData.commonPattern = Object.keys(patternCounts).reduce((a, b) =>
      patternCounts[a] > patternCounts[b] ? a : b
    );

    modelData.consistency = patternCounts[modelData.commonPattern] / modelData.fingerprints.length;
  }

  /**
   * Find reasoning differences
   */
  _findReasoningDifferences(analyses) {
    const differences = [];

    // Compare confidence styles
    const confidenceStyles = new Set(analyses.map(a => a.confidenceStyle));
    if (confidenceStyles.size > 1) {
      differences.push({
        category: 'confidence',
        description: `Models have different confidence styles: ${Array.from(confidenceStyles).join(', ')}`
      });
    }

    // Compare source preferences
    const sourcePrefs = new Set(analyses.map(a => a.sourcePreference));
    if (sourcePrefs.size > 1) {
      differences.push({
        category: 'sources',
        description: `Models prefer different sources: ${Array.from(sourcePrefs).join(', ')}`
      });
    }

    // Compare speed vs thoroughness
    const tradeoffs = new Set(analyses.map(a => a.speedVsThoroughness.tradeoff));
    if (tradeoffs.size > 1) {
      differences.push({
        category: 'approach',
        description: `Models have different approaches: ${Array.from(tradeoffs).join(', ')}`
      });
    }

    return differences;
  }

  /**
   * Rank models by reasoning quality
   */
  _rankReasoningQuality(analyses) {
    const rankings = analyses.map(analysis => {
      let score = 0;

      // Confidence calibration (+20 points)
      if (analysis.confidenceStyle === 'calibrated') score += 20;
      else if (analysis.confidenceStyle === 'hedging') score += 10;

      // Source diversity (+20 points)
      const diversityScore = analysis.sourceDiversity.diversity;
      score += diversityScore * 20;

      // Bias awareness (+20 points)
      if (analysis.biasAwareness.aware) {
        score += analysis.biasAwareness.score * 20;
      }

      // Fact extraction efficiency (+20 points)
      score += Math.min(analysis.factExtractionRate * 2, 20);

      // Thoroughness (+20 points)
      score += analysis.speedVsThoroughness.thoroughnessScore * 20;

      return {
        model: analysis.model,
        score,
        strengths: this._identifyStrengths(analysis),
        weaknesses: this._identifyWeaknesses(analysis)
      };
    });

    rankings.sort((a, b) => b.score - a.score);

    return rankings;
  }

  /**
   * Find reasoning consensus
   */
  _findReasoningConsensus(analyses) {
    // Most common pattern
    const patterns = analyses.map(a => a.pattern);
    const patternCounts = {};
    for (const pattern of patterns) {
      patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
    }

    const consensusPattern = Object.keys(patternCounts).reduce((a, b) =>
      patternCounts[a] > patternCounts[b] ? a : b
    );

    return {
      consensusPattern,
      agreement: patternCounts[consensusPattern] / analyses.length,
      totalModels: analyses.length
    };
  }

  /**
   * Identify strengths
   */
  _identifyStrengths(analysis) {
    const strengths = [];

    if (analysis.confidenceStyle === 'calibrated') {
      strengths.push('Well-calibrated confidence');
    }

    if (analysis.sourceDiversity.score === 'high') {
      strengths.push('Diverse source usage');
    }

    if (analysis.biasAwareness.aware && analysis.biasAwareness.score >= 0.7) {
      strengths.push('Strong bias detection');
    }

    if (analysis.factExtractionRate > 5) {
      strengths.push('Efficient fact extraction');
    }

    if (analysis.speedVsThoroughness.efficiency > 0.01) {
      strengths.push('Good speed/thoroughness balance');
    }

    return strengths;
  }

  /**
   * Identify weaknesses
   */
  _identifyWeaknesses(analysis) {
    const weaknesses = [];

    if (analysis.confidenceStyle === 'overconfident') {
      weaknesses.push('Overconfident without verification');
    }

    if (analysis.sourceDiversity.score === 'low') {
      weaknesses.push('Limited source diversity');
    }

    if (!analysis.biasAwareness.aware) {
      weaknesses.push('No bias detection');
    }

    if (analysis.factExtractionRate < 2) {
      weaknesses.push('Poor fact extraction');
    }

    if (analysis.speedVsThoroughness.tradeoff === 'fast' &&
        analysis.speedVsThoroughness.thoroughnessScore < 0.5) {
      weaknesses.push('Sacrifices thoroughness for speed');
    }

    return weaknesses;
  }

  /**
   * Detect creative language
   */
  _detectCreativeLanguage(text) {
    const creativeWords = ['fascinating', 'intriguing', 'remarkable', 'compelling', 'striking'];
    const lowerText = text.toLowerCase();

    return creativeWords.some(word => lowerText.includes(word));
  }

  /**
   * Detect hedging
   */
  _detectHedging(text) {
    const hedgingWords = ['might', 'could', 'possibly', 'perhaps', 'may', 'likely', 'seems'];
    const lowerText = text.toLowerCase();

    return hedgingWords.filter(word => lowerText.includes(word)).length >= 2;
  }

  /**
   * Calculate clarity score
   */
  _calculateClarity(text) {
    // Simple clarity heuristic: shorter sentences = clearer
    const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 0);
    const avgLength = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;

    // Ideal: 15-20 words per sentence
    if (avgLength >= 15 && avgLength <= 20) return 1.0;
    if (avgLength < 10) return 0.7; // Too short
    if (avgLength > 30) return 0.5; // Too long

    return 0.8;
  }

  /**
   * Get model fingerprint
   */
  getModelFingerprint(modelName) {
    return this.modelFingerprints.get(modelName) || null;
  }

  /**
   * Get all fingerprints
   */
  getAllFingerprints() {
    const fingerprints = {};

    for (const [model, data] of this.modelFingerprints.entries()) {
      fingerprints[model] = {
        commonPattern: data.commonPattern,
        consistency: data.consistency,
        totalSamples: data.fingerprints.length
      };
    }

    return fingerprints;
  }
}

module.exports = ReasoningDissector;
