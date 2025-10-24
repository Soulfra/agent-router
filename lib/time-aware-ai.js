/**
 * Time-Aware AI Wrapper
 *
 * "Internally with claudecode or openai i think it had dated information from when they were trained"
 *
 * Problem:
 * - LLMs have training cutoff dates (Claude: Jan 2025, GPT-4: Apr 2023, etc.)
 * - They don't know TODAY's date without being told
 * - Time-sensitive queries fail ("what day is it?", "what's trending today?")
 * - Need to inject current time/date into context
 *
 * Solution:
 * - Wrapper around AI instances that injects time context
 * - Adds system prompt with current date/time
 * - Provides time-aware utilities
 * - Can query internet for fresh data when needed
 *
 * Examples:
 * - User: "What day is it?" → AI knows it's October 20, 2025
 * - User: "What's trending?" → Can fetch fresh data via API
 * - User: "Remind me tomorrow" → Knows tomorrow = October 21, 2025
 */

const axios = require('axios');

class TimeAwareAI {
  constructor(options = {}) {
    this.aiInstanceRegistry = options.aiInstanceRegistry;
    this.timezone = options.timezone || 'America/New_York';
    this.locale = options.locale || 'en-US';

    // External data sources (for fresh data)
    this.enableWebSearch = options.enableWebSearch !== false;
    this.webSearchApi = options.webSearchApi || null; // Optional web search API

    console.log('[TimeAwareAI] Initialized');
    console.log(`[TimeAwareAI] Timezone: ${this.timezone}`);
  }

  /**
   * Get time context object
   */
  getTimeContext() {
    const now = new Date();

    return {
      timestamp: now.toISOString(),
      date: now.toLocaleDateString(this.locale),
      time: now.toLocaleTimeString(this.locale),
      dayOfWeek: now.toLocaleDateString(this.locale, { weekday: 'long' }),
      month: now.toLocaleDateString(this.locale, { month: 'long' }),
      year: now.getFullYear(),
      timezone: this.timezone,
      epoch: now.getTime(),
      formatted: {
        short: now.toLocaleString(this.locale, {
          dateStyle: 'short',
          timeStyle: 'short'
        }),
        medium: now.toLocaleString(this.locale, {
          dateStyle: 'medium',
          timeStyle: 'short'
        }),
        long: now.toLocaleString(this.locale, {
          dateStyle: 'full',
          timeStyle: 'long'
        })
      }
    };
  }

  /**
   * Build time-aware system prompt
   */
  buildTimeAwareSystemPrompt(additionalContext = '') {
    const timeContext = this.getTimeContext();

    const prompt = `# Current Time Information

Today's Date: ${timeContext.formatted.long}
Day of Week: ${timeContext.dayOfWeek}
Current Time: ${timeContext.time}
Timezone: ${timeContext.timezone}

You are a time-aware AI assistant. The above information shows the CURRENT date and time. Use this information to:
- Answer time-related questions accurately
- Calculate relative dates (tomorrow, next week, etc.)
- Understand time-sensitive context
- Know what day/date it is when asked

IMPORTANT: Your training data has a cutoff date, but the information above shows TODAY's actual date. Always use the current date shown above, not your training cutoff date.

${additionalContext}`;

    return prompt;
  }

  /**
   * Ask an AI instance with time-aware context
   *
   * @param {string} instanceName - AI instance name (cal, ralph, etc.)
   * @param {object} request - Request object
   * @returns {Promise<object>} Response with time context
   */
  async ask(instanceName, request) {
    if (!this.aiInstanceRegistry) {
      throw new Error('AI Instance Registry not available');
    }

    console.log(`[TimeAwareAI] Asking ${instanceName} with time context`);

    const timeContext = this.getTimeContext();

    // Build time-aware system prompt
    const timeAwareSystemPrompt = this.buildTimeAwareSystemPrompt(
      request.systemPrompt || ''
    );

    // Merge with request
    const timeAwareRequest = {
      ...request,
      systemPrompt: timeAwareSystemPrompt,
      metadata: {
        ...request.metadata,
        timeContext,
        timeAware: true
      }
    };

    try {
      const response = await this.aiInstanceRegistry.ask(instanceName, timeAwareRequest);

      return {
        ...response,
        timeContext,
        timeAware: true
      };

    } catch (error) {
      console.error(`[TimeAwareAI] Error asking ${instanceName}:`, error.message);
      throw error;
    }
  }

  /**
   * Calculate relative date
   *
   * @param {string} relativeExpression - "tomorrow", "next week", "in 3 days", etc.
   * @returns {object} Date info
   */
  calculateRelativeDate(relativeExpression) {
    const now = new Date();
    let targetDate = new Date(now);

    const expr = relativeExpression.toLowerCase().trim();

    // Tomorrow
    if (expr === 'tomorrow') {
      targetDate.setDate(now.getDate() + 1);
    }
    // Yesterday
    else if (expr === 'yesterday') {
      targetDate.setDate(now.getDate() - 1);
    }
    // Next week
    else if (expr === 'next week') {
      targetDate.setDate(now.getDate() + 7);
    }
    // Last week
    else if (expr === 'last week') {
      targetDate.setDate(now.getDate() - 7);
    }
    // Next month
    else if (expr === 'next month') {
      targetDate.setMonth(now.getMonth() + 1);
    }
    // Last month
    else if (expr === 'last month') {
      targetDate.setMonth(now.getMonth() - 1);
    }
    // In X days/weeks/months
    else if (expr.match(/^in (\d+) (day|week|month)s?$/)) {
      const match = expr.match(/^in (\d+) (day|week|month)s?$/);
      const num = parseInt(match[1]);
      const unit = match[2];

      if (unit === 'day') {
        targetDate.setDate(now.getDate() + num);
      } else if (unit === 'week') {
        targetDate.setDate(now.getDate() + (num * 7));
      } else if (unit === 'month') {
        targetDate.setMonth(now.getMonth() + num);
      }
    }
    // X days/weeks/months ago
    else if (expr.match(/^(\d+) (day|week|month)s? ago$/)) {
      const match = expr.match(/^(\d+) (day|week|month)s? ago$/);
      const num = parseInt(match[1]);
      const unit = match[2];

      if (unit === 'day') {
        targetDate.setDate(now.getDate() - num);
      } else if (unit === 'week') {
        targetDate.setDate(now.getDate() - (num * 7));
      } else if (unit === 'month') {
        targetDate.setMonth(now.getMonth() - num);
      }
    }

    return {
      expression: relativeExpression,
      date: targetDate.toLocaleDateString(this.locale),
      dayOfWeek: targetDate.toLocaleDateString(this.locale, { weekday: 'long' }),
      timestamp: targetDate.toISOString(),
      epoch: targetDate.getTime(),
      daysFromNow: Math.round((targetDate - now) / (1000 * 60 * 60 * 24))
    };
  }

  /**
   * Check if data needs to be fresh (web search required)
   *
   * @param {string} query - User query
   * @returns {boolean}
   */
  needsFreshData(query) {
    const freshDataKeywords = [
      'trending', 'latest', 'recent', 'current', 'now', 'today',
      'this week', 'this month', 'price', 'stock', 'weather',
      'news', 'breaking', 'live', 'update'
    ];

    const lowerQuery = query.toLowerCase();
    return freshDataKeywords.some(keyword => lowerQuery.includes(keyword));
  }

  /**
   * Fetch fresh data from web (if needed and enabled)
   *
   * @param {string} query - Search query
   * @returns {Promise<object>} Fresh data
   */
  async fetchFreshData(query) {
    if (!this.enableWebSearch) {
      return {
        success: false,
        error: 'Web search disabled',
        suggestion: 'Enable web search for fresh data'
      };
    }

    console.log(`[TimeAwareAI] Fetching fresh data for: ${query}`);

    try {
      // If custom web search API provided, use it
      if (this.webSearchApi) {
        const response = await axios.post(this.webSearchApi, {
          query,
          limit: 5
        });

        return {
          success: true,
          source: 'custom_api',
          query,
          results: response.data.results || [],
          timestamp: new Date().toISOString()
        };
      }

      // Otherwise, return placeholder for integration
      return {
        success: false,
        error: 'No web search API configured',
        suggestion: 'Configure webSearchApi option or integrate with external API',
        query
      };

    } catch (error) {
      console.error('[TimeAwareAI] Fresh data fetch error:', error.message);
      return {
        success: false,
        error: error.message,
        query
      };
    }
  }

  /**
   * Smart query: Automatically fetch fresh data if needed
   *
   * @param {string} instanceName - AI instance
   * @param {string} query - User query
   * @param {object} options - Additional options
   * @returns {Promise<object>} Response (with fresh data if needed)
   */
  async smartQuery(instanceName, query, options = {}) {
    console.log(`[TimeAwareAI] Smart query to ${instanceName}: "${query}"`);

    const timeContext = this.getTimeContext();
    let freshData = null;

    // Check if fresh data needed
    if (this.needsFreshData(query)) {
      console.log('[TimeAwareAI] Query needs fresh data, fetching...');
      freshData = await this.fetchFreshData(query);
    }

    // Build enhanced prompt with time context and fresh data
    let enhancedPrompt = query;

    if (freshData && freshData.success) {
      enhancedPrompt = `Context: Here is fresh data from the web (fetched ${timeContext.formatted.short}):

${JSON.stringify(freshData.results, null, 2)}

User Query: ${query}

Use the fresh data above to answer the user's query accurately.`;
    }

    // Ask AI with time-aware context
    const response = await this.ask(instanceName, {
      prompt: enhancedPrompt,
      ...options
    });

    return {
      ...response,
      freshData: freshData || null,
      smartQuery: true
    };
  }

  /**
   * Get time zone info
   */
  getTimeZoneInfo() {
    const now = new Date();

    return {
      timezone: this.timezone,
      offset: now.getTimezoneOffset(),
      offsetHours: now.getTimezoneOffset() / 60,
      isDST: this._isDST(now)
    };
  }

  /**
   * Check if date is in Daylight Saving Time
   * @private
   */
  _isDST(date) {
    const jan = new Date(date.getFullYear(), 0, 1);
    const jul = new Date(date.getFullYear(), 6, 1);
    return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset()) !== date.getTimezoneOffset();
  }

  /**
   * Format duration between two dates
   *
   * @param {Date|string} start - Start date
   * @param {Date|string} end - End date (default: now)
   * @returns {object} Duration info
   */
  formatDuration(start, end = null) {
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end ? (end instanceof Date ? end : new Date(end)) : new Date();

    const diffMs = endDate - startDate;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    return {
      milliseconds: diffMs,
      seconds: diffSec,
      minutes: diffMin,
      hours: diffHour,
      days: diffDay,
      formatted: {
        short: diffDay > 0 ? `${diffDay}d` :
                diffHour > 0 ? `${diffHour}h` :
                diffMin > 0 ? `${diffMin}m` : `${diffSec}s`,
        medium: diffDay > 0 ? `${diffDay} days` :
                diffHour > 0 ? `${diffHour} hours` :
                diffMin > 0 ? `${diffMin} minutes` : `${diffSec} seconds`,
        long: `${diffDay} days, ${diffHour % 24} hours, ${diffMin % 60} minutes, ${diffSec % 60} seconds`
      }
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    const timeContext = this.getTimeContext();
    const tzInfo = this.getTimeZoneInfo();

    return {
      currentTime: timeContext,
      timezone: tzInfo,
      webSearchEnabled: this.enableWebSearch,
      locale: this.locale
    };
  }
}

module.exports = TimeAwareAI;
