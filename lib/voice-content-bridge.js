/**
 * Voice-Content Bridge
 *
 * Connects wake word detection system to content curation
 * Enables voice commands like:
 * - "Hey Cal, show me AI news"
 * - "Hey Cal, curated feed"
 * - "Hey Cal, what's trending in crypto?"
 */

const EventEmitter = require('events');

class VoiceContentBridge extends EventEmitter {
  constructor({ contentCurator, wakeWordDetector, broadcast }) {
    super();

    this.curator = contentCurator;
    this.wakeWord = wakeWordDetector;
    this.broadcast = broadcast;

    // Command patterns for content curation
    this.commandPatterns = [
      {
        pattern: /show me (.*?) news/i,
        handler: this.handleTopicNews.bind(this),
        examples: ['show me AI news', 'show me crypto news']
      },
      {
        pattern: /what's trending in (.*)/i,
        handler: this.handleTrending.bind(this),
        examples: ['what\'s trending in tech', 'what\'s trending in programming']
      },
      {
        pattern: /(curated feed|my feed|news feed)/i,
        handler: this.handleCuratedFeed.bind(this),
        examples: ['curated feed', 'my feed', 'news feed']
      },
      {
        pattern: /hacker news/i,
        handler: this.handleHackerNews.bind(this),
        examples: ['hacker news', 'show me hacker news']
      },
      {
        pattern: /reddit (.*)/i,
        handler: this.handleReddit.bind(this),
        examples: ['reddit programming', 'reddit technology']
      },
      {
        pattern: /github trending/i,
        handler: this.handleGitHubTrending.bind(this),
        examples: ['github trending', 'show me github trending']
      },
      {
        pattern: /newsletter/i,
        handler: this.handleNewsletter.bind(this),
        examples: ['generate newsletter', 'send newsletter']
      }
    ];

    this.setupListeners();
  }

  setupListeners() {
    if (!this.wakeWord) {
      console.warn('[VoiceContentBridge] Wake word detector not provided');
      return;
    }

    // Listen for wake word commands
    this.wakeWord.on('command', async ({ wakeWord, command }) => {
      console.log(`[VoiceContentBridge] Received command: "${command}"`);
      await this.handleCommand(command, 'guest');
    });

    console.log('[VoiceContentBridge] Listening for wake word commands');
  }

  /**
   * Handle incoming voice command
   */
  async handleCommand(command, userId = 'guest') {
    const normalizedCommand = command.toLowerCase().trim();

    // Try each pattern
    for (const { pattern, handler, examples } of this.commandPatterns) {
      const match = normalizedCommand.match(pattern);

      if (match) {
        console.log(`[VoiceContentBridge] Matched pattern: ${pattern}`);

        try {
          await handler({ match, userId, originalCommand: command });
          return true;
        } catch (error) {
          console.error(`[VoiceContentBridge] Error handling command:`, error);
          this.sendResponse({
            type: 'error',
            message: `Sorry, I encountered an error: ${error.message}`,
            userId
          });
          return false;
        }
      }
    }

    // No pattern matched
    console.log(`[VoiceContentBridge] No pattern matched for: "${command}"`);
    return false;
  }

  /**
   * Handler: Show me [topic] news
   */
  async handleTopicNews({ match, userId }) {
    const topic = match[1].trim();
    console.log(`[VoiceContentBridge] Fetching ${topic} news for user ${userId}`);

    // Get user config or create temp config with topic
    let config = await this.curator.getConfiguration(userId);

    if (!config) {
      // Create temporary config for this query
      await this.curator.saveConfiguration(userId, {
        topics: [topic],
        sources: ['hackernews', 'reddit', 'github-trending'],
        customRSS: [],
        frequency: 'realtime',
        deliveryTime: '09:00',
        email: ''
      });
    }

    // Get curated feed
    const feed = await this.curator.getCuratedFeed(userId, { limit: 10 });

    // Filter by topic
    const topicArticles = feed.items.filter(item =>
      item.topics && item.topics.some(t =>
        t.toLowerCase().includes(topic.toLowerCase())
      )
    );

    this.sendResponse({
      type: 'curated_content',
      topic,
      items: topicArticles.slice(0, 5),
      message: `Here are the top ${topic} articles:`,
      userId
    });
  }

  /**
   * Handler: What's trending in [topic]
   */
  async handleTrending({ match, userId }) {
    const topic = match[1].trim();
    console.log(`[VoiceContentBridge] Fetching trending ${topic} content`);

    // Get curated feed
    const feed = await this.curator.getCuratedFeed(userId, { limit: 20 });

    // Filter by topic and sort by score
    const trendingItems = feed.items
      .filter(item =>
        item.topics && item.topics.some(t =>
          t.toLowerCase().includes(topic.toLowerCase())
        )
      )
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5);

    this.sendResponse({
      type: 'curated_content',
      topic,
      items: trendingItems,
      message: `Here's what's trending in ${topic}:`,
      userId
    });
  }

  /**
   * Handler: Curated feed
   */
  async handleCuratedFeed({ userId }) {
    console.log(`[VoiceContentBridge] Fetching curated feed for user ${userId}`);

    const feed = await this.curator.getCuratedFeed(userId, { limit: 10 });

    this.sendResponse({
      type: 'curated_content',
      items: feed.items,
      message: 'Here is your personalized curated feed:',
      userId
    });
  }

  /**
   * Handler: Hacker News
   */
  async handleHackerNews({ userId }) {
    console.log(`[VoiceContentBridge] Fetching Hacker News`);

    const items = await this.curator.fetchHackerNews();

    this.sendResponse({
      type: 'curated_content',
      source: 'Hacker News',
      items: items.slice(0, 10),
      message: 'Here are the top Hacker News stories:',
      userId
    });
  }

  /**
   * Handler: Reddit [subreddit]
   */
  async handleReddit({ match, userId }) {
    const subreddit = match[1].trim();
    console.log(`[VoiceContentBridge] Fetching Reddit r/${subreddit}`);

    const items = await this.curator.fetchReddit(subreddit);

    this.sendResponse({
      type: 'curated_content',
      source: `r/${subreddit}`,
      items: items.slice(0, 10),
      message: `Here are the hot posts from r/${subreddit}:`,
      userId
    });
  }

  /**
   * Handler: GitHub Trending
   */
  async handleGitHubTrending({ userId }) {
    console.log(`[VoiceContentBridge] Fetching GitHub Trending`);

    const items = await this.curator.fetchGitHubTrending();

    this.sendResponse({
      type: 'curated_content',
      source: 'GitHub Trending',
      items: items.slice(0, 10),
      message: 'Here are the trending GitHub repositories:',
      userId
    });
  }

  /**
   * Handler: Newsletter
   */
  async handleNewsletter({ userId }) {
    console.log(`[VoiceContentBridge] Generating newsletter for user ${userId}`);

    const newsletter = await this.curator.generateNewsletter(userId, { limit: 10 });

    this.sendResponse({
      type: 'newsletter',
      itemCount: newsletter.itemCount,
      message: `Newsletter generated with ${newsletter.itemCount} articles. Check your email or view it on the feed.`,
      userId
    });
  }

  /**
   * Send response via WebSocket broadcast
   */
  sendResponse({ type, message, items, topic, source, userId, itemCount }) {
    const response = {
      type,
      message,
      items,
      topic,
      source,
      itemCount,
      timestamp: new Date().toISOString()
    };

    // Broadcast to all connected clients
    if (this.broadcast) {
      this.broadcast(response);
    }

    // Emit event for other listeners
    this.emit('response', response);

    console.log(`[VoiceContentBridge] Response sent: ${message}`);
  }

  /**
   * Get list of available commands
   */
  getAvailableCommands() {
    return this.commandPatterns.map(({ pattern, examples }) => ({
      pattern: pattern.toString(),
      examples
    }));
  }

  /**
   * Manually trigger a command (for testing or programmatic use)
   */
  async triggerCommand(command, userId = 'guest') {
    return await this.handleCommand(command, userId);
  }
}

module.exports = VoiceContentBridge;
