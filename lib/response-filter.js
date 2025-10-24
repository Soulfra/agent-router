/**
 * Response Filter
 *
 * Filters agent responses for multiple domains/projects simultaneously
 * Each domain gets only the relevant portions of the response
 *
 * Example: "database requirements" query
 * - soulfra.com gets: Audio storage, voice transcripts, accessibility tables
 * - deathtodata.com gets: Encrypted storage, anonymized logs, privacy-first schema
 * - finishthisidea.com gets: Ideas table, voting system, collaboration features
 *
 * Tracks routing depth and suggests versioning when responses touch many domains
 */

class ResponseFilter {
  constructor(options = {}) {
    this.db = options.db;
    this.domainMap = options.domainMap; // BucketOrchestrator.domainMap

    // Domain-specific keywords for filtering
    this.domainKeywords = {
      'soulfra.com': ['voice', 'audio', 'nonprofit', 'accessibility', 'inclusive', 'transcript', 'speech', 'sound'],
      'deathtodata.com': ['privacy', 'encrypted', 'anonymous', 'secure', 'tracking', 'data protection', 'incognito'],
      'finishthisidea.com': ['idea', 'voting', 'collaboration', 'brainstorm', 'creative', 'proposal'],
      'dealordelete.com': ['decision', 'voting', 'archive', 'deadline', 'priority'],
      'saveorsink.com': ['backup', 'recovery', 'archive', 'preservation', 'restore']
    };

    console.log('[ResponseFilter] Initialized');
  }

  /**
   * Filter response for multiple domains
   *
   * @param {object} params - { response, originDomain, targetDomains, detectedProfile }
   * @returns {Promise<object>} - { byDomain, depth, domains, suggestedVersion }
   */
  async filterForDomains(params) {
    const {
      response,
      originDomain,
      targetDomains = [originDomain],
      detectedProfile
    } = params;

    try {
      const filtered = {};
      const affectedDomains = [];

      // Split response into sentences for filtering
      const sentences = this._splitIntoSentences(response);

      // Filter for each target domain
      for (const domain of targetDomains) {
        const keywords = this.domainKeywords[domain] || [];
        const relevantSentences = sentences.filter(sentence =>
          this._isRelevantToDomain(sentence, keywords)
        );

        if (relevantSentences.length > 0) {
          filtered[domain] = relevantSentences.join(' ');
          affectedDomains.push(domain);
        }
      }

      // If no domain-specific matches, give full response to origin domain
      if (affectedDomains.length === 0) {
        filtered[originDomain] = response;
        affectedDomains.push(originDomain);
      }

      // Calculate routing depth (how many domains were affected)
      const routingDepth = affectedDomains.length;

      // Suggest version increment if touching many domains
      const suggestedVersion = routingDepth >= 5 ? 'major' : routingDepth >= 3 ? 'minor' : 'patch';

      console.log(`[ResponseFilter] Filtered for ${routingDepth} domain(s): ${affectedDomains.join(', ')}`);

      return {
        byDomain: filtered,
        depth: routingDepth,
        domains: affectedDomains,
        suggestedVersion,
        fullResponse: response
      };

    } catch (error) {
      console.error('[ResponseFilter] Filtering failed:', error.message);
      // Fallback: return full response to origin domain
      return {
        byDomain: { [originDomain]: response },
        depth: 1,
        domains: [originDomain],
        suggestedVersion: 'patch',
        fullResponse: response,
        error: error.message
      };
    }
  }

  /**
   * Split text into sentences
   */
  _splitIntoSentences(text) {
    if (!text) return [];

    // Split on sentence boundaries (., !, ?)
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return sentences;
  }

  /**
   * Check if sentence is relevant to domain based on keywords
   */
  _isRelevantToDomain(sentence, keywords) {
    if (keywords.length === 0) return true; // No keywords = include all

    const lowerSentence = sentence.toLowerCase();
    return keywords.some(keyword => lowerSentence.includes(keyword.toLowerCase()));
  }

  /**
   * Extract domain-specific sections from structured response
   *
   * For responses with headings like:
   * "## For Soulfra: ..."
   * "## For DeathToData: ..."
   */
  extractDomainSections(response, domains) {
    const sections = {};

    for (const domain of domains) {
      // Try to find section headings
      const patterns = [
        new RegExp(`##\\s*For\\s+${domain}:?\\s*([\\s\\S]*?)(?=##|$)`, 'i'),
        new RegExp(`\\*\\*${domain}\\*\\*:?\\s*([\\s\\S]*?)(?=\\*\\*|$)`, 'i'),
        new RegExp(`${domain}:?\\s*\\n([\\s\\S]*?)(?=\\n\\n|$)`, 'i')
      ];

      for (const pattern of patterns) {
        const match = response.match(pattern);
        if (match && match[1]) {
          sections[domain] = match[1].trim();
          break;
        }
      }
    }

    return sections;
  }

  /**
   * Store filtered response in database for analytics
   */
  async logFilteredResponse(params) {
    if (!this.db) return;

    const {
      originDomain,
      affectedDomains,
      routingDepth,
      suggestedVersion,
      detectedProfile,
      sessionId
    } = params;

    try {
      await this.db.query(`
        INSERT INTO response_filtering_logs (
          origin_domain,
          affected_domains,
          routing_depth,
          suggested_version,
          detected_profile,
          session_id,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        originDomain,
        JSON.stringify(affectedDomains),
        routingDepth,
        suggestedVersion,
        detectedProfile,
        sessionId
      ]);

      console.log(`[ResponseFilter] Logged filtering event for ${originDomain}`);
    } catch (error) {
      console.warn('[ResponseFilter] Failed to log filtering event:', error.message);
    }
  }
}

module.exports = ResponseFilter;
