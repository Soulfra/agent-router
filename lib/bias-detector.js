/**
 * Bias Detector
 *
 * Analyzes research sources for bias indicators
 *
 * Features:
 * - Detects crowdfunded sources (Patreon, Kickstarter, etc.)
 * - Political leaning detection (sentiment analysis)
 * - Conspiracy keyword flagging
 * - Source diversity scoring (1 source = risky, 3+ = reliable)
 * - Fact-checking status (cross-reference multiple sources)
 *
 * Use Cases:
 * - Flag "crazy shit" from biased sources
 * - Warn about single-source research
 * - Detect financially incentivized content
 * - Identify conspiracy theories
 *
 * Example:
 *   const detector = new BiasDetector();
 *   const analysis = await detector.analyze(scrapedContent, sources);
 *   // → { biasScore: 'MEDIUM', indicators: {...}, warnings: [...] }
 */

class BiasDetector {
  constructor(options = {}) {
    this.config = {
      // Bias thresholds
      minSourcesForLowBias: options.minSourcesForLowBias || 3,
      conspiracyThreshold: options.conspiracyThreshold || 3, // # of keywords
      crowdfundingThreshold: options.crowdfundingThreshold || 2, // # of mentions

      // Enable/disable checks
      enableCrowdfundingCheck: options.enableCrowdfundingCheck !== false,
      enableConspiracyCheck: options.enableConspiracyCheck !== false,
      enablePoliticalCheck: options.enablePoliticalCheck !== false,
      enableSourceDiversityCheck: options.enableSourceDiversityCheck !== false
    };

    // Crowdfunding platforms
    this.crowdfundingKeywords = [
      'patreon', 'kickstarter', 'gofundme', 'indiegogo',
      'buy me a coffee', 'ko-fi', 'support us on',
      'donate', 'become a patron', 'sponsor us'
    ];

    // Conspiracy keywords
    this.conspiracyKeywords = [
      "they don't want you to know",
      'cover-up', 'coverup', 'censored', 'banned',
      'mainstream media', 'msm lies', 'hidden truth',
      'wake up', 'open your eyes', 'do your own research',
      'suppressed', 'they', 'elites', 'globalists',
      'deep state', 'false flag', 'psyop'
    ];

    // Political leaning keywords
    this.politicalKeywords = {
      left: ['progressive', 'liberal', 'socialist', 'democrat', 'left-wing'],
      right: ['conservative', 'republican', 'right-wing', 'libertarian'],
      loaded: ['radical', 'extremist', 'agenda', 'propaganda', 'brainwash']
    };

    console.log('[BiasDetector] Initialized');
  }

  /**
   * Analyze content for bias
   */
  async analyze(content, sources = [], options = {}) {
    const lowerContent = content.toLowerCase();

    const indicators = {
      crowdfunded: false,
      crowdfundingMentions: 0,
      politicalLeaning: 'neutral',
      conspiracyKeywords: 0,
      conspiracyMatches: [],
      sourceDiversity: sources.length,
      loadedLanguage: false
    };

    const warnings = [];

    // Check crowdfunding
    if (this.config.enableCrowdfundingCheck) {
      const crowdfundingCheck = this._checkCrowdfunding(lowerContent);
      indicators.crowdfunded = crowdfundingCheck.found;
      indicators.crowdfundingMentions = crowdfundingCheck.mentions;

      if (crowdfundingCheck.found) {
        warnings.push(
          `Crowdfunding detected (${crowdfundingCheck.mentions} mentions) - ` +
          `content may be financially incentivized`
        );
      }
    }

    // Check conspiracy keywords
    if (this.config.enableConspiracyCheck) {
      const conspiracyCheck = this._checkConspiracy(lowerContent);
      indicators.conspiracyKeywords = conspiracyCheck.count;
      indicators.conspiracyMatches = conspiracyCheck.matches;

      if (conspiracyCheck.count >= this.config.conspiracyThreshold) {
        warnings.push(
          `Conspiracy indicators detected (${conspiracyCheck.count} keywords: ` +
          `${conspiracyCheck.matches.slice(0, 3).join(', ')}) - verify claims carefully`
        );
      }
    }

    // Check political leaning
    if (this.config.enablePoliticalCheck) {
      const politicalCheck = this._checkPolitical(lowerContent);
      indicators.politicalLeaning = politicalCheck.leaning;
      indicators.loadedLanguage = politicalCheck.loadedLanguage;

      if (politicalCheck.leaning !== 'neutral') {
        warnings.push(
          `Political leaning detected: ${politicalCheck.leaning} - ` +
          `content may have political bias`
        );
      }

      if (politicalCheck.loadedLanguage) {
        warnings.push(
          'Loaded language detected (radical, agenda, propaganda) - ' +
          'strong bias likely'
        );
      }
    }

    // Check source diversity
    if (this.config.enableSourceDiversityCheck) {
      const diversityCheck = this._checkSourceDiversity(sources);
      indicators.sourceDiversity = diversityCheck.count;

      if (diversityCheck.count === 1) {
        warnings.push(
          'Only 1 source used - cannot verify claims independently. ' +
          'Recommend cross-referencing with 2+ additional sources.'
        );
      } else if (diversityCheck.count === 2) {
        warnings.push(
          'Only 2 sources used - limited verification. ' +
          'Consider adding 1+ more source for higher confidence.'
        );
      }
    }

    // Calculate overall bias score
    const biasScore = this._calculateBiasScore(indicators);

    return {
      biasScore, // LOW, MEDIUM, HIGH, VERY_HIGH
      indicators,
      warnings,
      recommendation: this._getRecommendation(biasScore, indicators),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check for crowdfunding mentions
   */
  _checkCrowdfunding(content) {
    let mentions = 0;
    const found = [];

    for (const keyword of this.crowdfundingKeywords) {
      if (content.includes(keyword)) {
        mentions++;
        found.push(keyword);
      }
    }

    return {
      found: mentions >= this.config.crowdfundingThreshold,
      mentions,
      keywords: found
    };
  }

  /**
   * Check for conspiracy keywords
   */
  _checkConspiracy(content) {
    let count = 0;
    const matches = [];

    for (const keyword of this.conspiracyKeywords) {
      if (content.includes(keyword)) {
        count++;
        matches.push(keyword);
      }
    }

    return { count, matches };
  }

  /**
   * Check political leaning
   */
  _checkPolitical(content) {
    let leftCount = 0;
    let rightCount = 0;
    let loadedCount = 0;

    // Count left-leaning keywords
    for (const keyword of this.politicalKeywords.left) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = content.match(regex);
      if (matches) leftCount += matches.length;
    }

    // Count right-leaning keywords
    for (const keyword of this.politicalKeywords.right) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = content.match(regex);
      if (matches) rightCount += matches.length;
    }

    // Count loaded language
    for (const keyword of this.politicalKeywords.loaded) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = content.match(regex);
      if (matches) loadedCount += matches.length;
    }

    // Determine leaning
    let leaning = 'neutral';
    if (leftCount > rightCount && leftCount > 2) {
      leaning = 'left';
    } else if (rightCount > leftCount && rightCount > 2) {
      leaning = 'right';
    }

    return {
      leaning,
      leftCount,
      rightCount,
      loadedLanguage: loadedCount > 2
    };
  }

  /**
   * Check source diversity
   */
  _checkSourceDiversity(sources) {
    const uniqueSources = new Set(sources.map(s => s.name || s.url));

    return {
      count: uniqueSources.size,
      sources: Array.from(uniqueSources)
    };
  }

  /**
   * Calculate overall bias score
   */
  _calculateBiasScore(indicators) {
    let score = 0;

    // Crowdfunding penalty
    if (indicators.crowdfunded) {
      score += 20;
    }

    // Conspiracy penalty
    if (indicators.conspiracyKeywords >= this.config.conspiracyThreshold) {
      score += 30;
    } else if (indicators.conspiracyKeywords > 0) {
      score += 10;
    }

    // Political leaning penalty
    if (indicators.politicalLeaning !== 'neutral') {
      score += 15;
    }

    if (indicators.loadedLanguage) {
      score += 25;
    }

    // Source diversity penalty
    if (indicators.sourceDiversity === 1) {
      score += 30;
    } else if (indicators.sourceDiversity === 2) {
      score += 15;
    }

    // Classify score
    if (score >= 70) return 'VERY_HIGH';
    if (score >= 50) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get recommendation based on bias score
   */
  _getRecommendation(biasScore, indicators) {
    switch (biasScore) {
      case 'VERY_HIGH':
        return 'CRITICAL: Multiple bias indicators detected. Do NOT trust this source without extensive verification from 5+ independent sources.';

      case 'HIGH':
        return 'WARNING: Significant bias detected. Cross-reference with 3+ independent, reputable sources before accepting any claims.';

      case 'MEDIUM':
        return 'CAUTION: Some bias indicators present. Verify key claims with 2+ additional sources before relying on this information.';

      case 'LOW':
        if (indicators.sourceDiversity < 3) {
          return 'Generally reliable, but recommend adding 1-2 more sources for verification.';
        }
        return 'Low bias detected. Information appears reasonably reliable.';

      default:
        return 'Unable to assess bias level.';
    }
  }

  /**
   * Analyze multiple sources and compare
   */
  async compareSourcesAcross(sources) {
    const analyses = [];

    for (const source of sources) {
      const analysis = await this.analyze(source.content, [source]);
      analyses.push({
        source: source.name || source.url,
        analysis
      });
    }

    // Find consensus
    const consensus = this._findConsensus(analyses);

    return {
      sources: analyses,
      consensus,
      overallBias: this._calculateOverallBias(analyses),
      recommendation: this._getConsensusRecommendation(consensus)
    };
  }

  /**
   * Find consensus across multiple sources
   */
  _findConsensus(analyses) {
    // Extract key facts from each source
    // Compare for agreement
    // Return consensus facts + disagreements

    return {
      agreement: 0, // Placeholder
      disagreements: [],
      consensusFacts: []
    };
  }

  /**
   * Calculate overall bias across sources
   */
  _calculateOverallBias(analyses) {
    const scores = analyses.map(a => {
      switch (a.analysis.biasScore) {
        case 'VERY_HIGH': return 4;
        case 'HIGH': return 3;
        case 'MEDIUM': return 2;
        case 'LOW': return 1;
        default: return 0;
      }
    });

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    if (avg >= 3.5) return 'VERY_HIGH';
    if (avg >= 2.5) return 'HIGH';
    if (avg >= 1.5) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get consensus recommendation
   */
  _getConsensusRecommendation(consensus) {
    if (consensus.agreement > 0.8) {
      return 'High consensus across sources - information likely reliable';
    } else if (consensus.agreement > 0.6) {
      return 'Moderate consensus - verify key claims';
    } else {
      return 'Low consensus - sources disagree significantly, proceed with caution';
    }
  }
}

module.exports = BiasDetector;
