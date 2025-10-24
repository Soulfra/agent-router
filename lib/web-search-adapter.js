/**
 * Web Search Adapter
 *
 * Provides real-time web search capability to get current information
 * beyond the static training data of LLMs (like Perplexity/Comet).
 *
 * Uses DuckDuckGo Instant Answer API (no API key required) plus
 * HTML scraping for more detailed results.
 */

const axios = require('axios');

class WebSearchAdapter {
  constructor({ cache = null, timeout = 10000 } = {}) {
    this.cache = cache;
    this.timeout = timeout;
    this.userAgent = 'Mozilla/5.0 (compatible; CalOS/1.0; +http://calos.io)';
  }

  /**
   * Search for current information on the web
   * Returns structured results with snippets and sources
   */
  async search(query, options = {}) {
    const limit = options.limit || 5;
    const cacheKey = `web_search:${query}`;

    // Check cache first (5 minute TTL for web results)
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 300000) {
        console.log(`[WebSearch] Cache hit for "${query}"`);
        return cached.results;
      }
    }

    console.log(`[WebSearch] Searching for: "${query}"`);

    try {
      // Use DuckDuckGo Instant Answer API
      const results = await this.searchDuckDuckGo(query, limit);

      // Cache results
      if (this.cache && results.length > 0) {
        this.cache.set(cacheKey, {
          results,
          timestamp: Date.now()
        });
      }

      return results;
    } catch (error) {
      console.error(`[WebSearch] Search failed: ${error.message}`);
      return {
        error: error.message,
        query,
        results: [],
        fallback: true
      };
    }
  }

  /**
   * Search using DuckDuckGo's Instant Answer API
   */
  async searchDuckDuckGo(query, limit) {
    try {
      // DuckDuckGo Instant Answer API
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: 'json',
          no_html: 1,
          skip_disambig: 1
        },
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: this.timeout
      });

      const data = response.data;
      const results = [];

      // Abstract (main answer)
      if (data.Abstract) {
        results.push({
          title: data.Heading || query,
          snippet: data.Abstract,
          url: data.AbstractURL,
          source: data.AbstractSource || 'DuckDuckGo',
          type: 'abstract',
          relevance: 1.0
        });
      }

      // Related topics
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, limit - 1)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 60),
              snippet: topic.Text,
              url: topic.FirstURL,
              source: 'DuckDuckGo',
              type: 'related',
              relevance: 0.8
            });
          }
        }
      }

      // If no results, try the HTML search interface
      if (results.length === 0) {
        const htmlResults = await this.searchDuckDuckGoHTML(query, limit);
        results.push(...htmlResults);
      }

      return {
        query,
        results: results.slice(0, limit),
        count: results.length,
        source: 'duckduckgo',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`[WebSearch] DuckDuckGo API error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fallback: Search using DuckDuckGo HTML (scraping)
   */
  async searchDuckDuckGoHTML(query, limit) {
    try {
      const response = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: query },
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: this.timeout
      });

      const html = response.data;
      const results = [];

      // Basic regex to extract results (not perfect but works)
      const titleRegex = /<a[^>]+class="result__a"[^>]*>([^<]+)<\/a>/g;
      const urlRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"/g;
      const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([^<]+)<\/a>/g;

      let titleMatch, urlMatch, snippetMatch;
      let count = 0;

      while ((titleMatch = titleRegex.exec(html)) && count < limit) {
        urlMatch = urlRegex.exec(html);
        snippetMatch = snippetRegex.exec(html);

        if (titleMatch && urlMatch) {
          results.push({
            title: this.decodeHTML(titleMatch[1]),
            snippet: snippetMatch ? this.decodeHTML(snippetMatch[1]) : '',
            url: this.decodeHTML(urlMatch[1]),
            source: 'DuckDuckGo HTML',
            type: 'search_result',
            relevance: 0.7 - (count * 0.1)
          });
          count++;
        }
      }

      return results;
    } catch (error) {
      console.error(`[WebSearch] HTML scraping error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get instant answer for factual questions
   * Returns a single concise answer if available
   */
  async instantAnswer(query) {
    try {
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: 'json',
          no_html: 1
        },
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: this.timeout
      });

      const data = response.data;

      // Check for instant answer
      if (data.Answer) {
        return {
          answer: data.Answer,
          type: 'instant_answer',
          source: data.AnswerType || 'DuckDuckGo'
        };
      }

      // Check for abstract
      if (data.Abstract) {
        return {
          answer: data.Abstract,
          type: 'abstract',
          source: data.AbstractSource || 'Wikipedia'
        };
      }

      // Check for definition
      if (data.Definition) {
        return {
          answer: data.Definition,
          type: 'definition',
          source: data.DefinitionSource || 'DuckDuckGo'
        };
      }

      return null;
    } catch (error) {
      console.error(`[WebSearch] Instant answer error: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if a query needs real-time web search
   * Returns true for queries about current events, recent news, etc.
   */
  needsWebSearch(query) {
    const lowerQuery = query.toLowerCase();

    // Time-sensitive keywords
    const timeKeywords = [
      'latest', 'recent', 'today', 'now', 'current', 'this week',
      'this month', 'this year', '2025', '2024', 'news', 'update'
    ];

    // Current event keywords
    const eventKeywords = [
      'happening', 'going on', 'what\'s new', 'developments',
      'breaking', 'trending', 'viral'
    ];

    // Check for time-sensitive or current event queries
    for (const keyword of [...timeKeywords, ...eventKeywords]) {
      if (lowerQuery.includes(keyword)) {
        return true;
      }
    }

    // Check for question about specific entities that might have changed
    const entityQuestions = ['who is', 'what is', 'where is', 'when is', 'how is'];
    for (const q of entityQuestions) {
      if (lowerQuery.startsWith(q)) {
        // Check if followed by time-sensitive terms
        if (timeKeywords.some(k => lowerQuery.includes(k))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Decode HTML entities
   */
  decodeHTML(html) {
    return html
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  /**
   * Format search results as text for LLM consumption
   */
  formatResultsForLLM(searchResults) {
    if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
      return null;
    }

    let formatted = `Web Search Results for "${searchResults.query}":\n\n`;

    searchResults.results.forEach((result, idx) => {
      formatted += `[${idx + 1}] ${result.title}\n`;
      formatted += `    ${result.snippet}\n`;
      formatted += `    Source: ${result.source} (${result.url})\n\n`;
    });

    formatted += `Total results: ${searchResults.count} | Timestamp: ${searchResults.timestamp}\n`;

    return formatted;
  }
}

module.exports = WebSearchAdapter;
