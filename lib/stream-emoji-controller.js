/**
 * Stream Emoji Controller
 *
 * Twitch-style emoji reaction system for interactive learning streams.
 * Fans control stream pace and content with emoji votes in real-time.
 *
 * Emoji Commands:
 * - 👍 (thumbs up) = "go faster"
 * - 🐢 (turtle) = "slow down"
 * - ❓ (question) = "explain more"
 * - 💀 (skull) = "this is fire" (Gen Z approved)
 * - 🎃 (pumpkin) = "halloween energy"
 * - 🔥 (fire) = "based content"
 * - 😭 (crying) = "relatable"
 * - 🤔 (thinking) = "need to process"
 * - ⏭️ (next) = "skip ahead"
 * - 🔁 (repeat) = "replay this"
 *
 * Integrates with:
 * - EmojiVibeScorer (lib/emoji-vibe-scorer.js)
 * - WorkspaceWebSocketHandler (lib/workspace-websocket-handler.js)
 * - UTMCampaignGenerator (lib/utm-campaign-generator.js)
 *
 * Usage:
 *   const controller = new StreamEmojiController({
 *     ws, emojiVibeScorer, utmGenerator, db
 *   });
 *
 *   // Fan sends emoji
 *   controller.handleEmojiReaction({
 *     userId: 'user123',
 *     emoji: '💀',
 *     timestamp: Date.now(),
 *     context: { screen: 5, topic: 'zero-knowledge' }
 *   });
 *
 *   // Check aggregate command
 *   const command = controller.getStreamCommand();
 *   // → { action: 'faster', confidence: 0.85, emojiCounts: {...} }
 */

const { EventEmitter } = require('events');

class StreamEmojiController extends EventEmitter {
  constructor(options = {}) {
    super();

    this.ws = options.ws;
    this.emojiVibeScorer = options.emojiVibeScorer;
    this.utmGenerator = options.utmGenerator;
    this.db = options.db;

    // Stream state
    this.streamId = null;
    this.currentScreen = 0;
    this.isLive = false;

    // Emoji voting window (5 second aggregation)
    this.votingWindow = options.votingWindow || 5000; // ms
    this.currentVotes = new Map(); // emoji → count
    this.voteHistory = []; // Array of {emoji, userId, timestamp, screen}

    // Emoji → command mapping
    this.emojiCommands = {
      '👍': { action: 'faster', weight: 1.0 },
      '🐢': { action: 'slower', weight: 1.0 },
      '❓': { action: 'explain', weight: 1.0 },
      '💀': { action: 'fire', weight: 1.5 }, // Higher weight for viral moments
      '🎃': { action: 'fire', weight: 1.3 }, // Halloween energy
      '🔥': { action: 'fire', weight: 1.4 },
      '😭': { action: 'relatable', weight: 1.2 },
      '🤔': { action: 'slower', weight: 0.8 },
      '⏭️': { action: 'skip', weight: 1.0 },
      '🔁': { action: 'replay', weight: 1.0 },
      '🎯': { action: 'mark', weight: 1.5 }, // Mark as clipworthy
      '📌': { action: 'mark', weight: 1.3 }
    };

    // Action thresholds (min votes needed to trigger)
    this.actionThresholds = {
      faster: 3,
      slower: 3,
      explain: 2,
      fire: 5, // Viral moments need more consensus
      skip: 5,
      replay: 4,
      mark: 3
    };

    // Rate limiting per user
    this.userVoteCooldown = 1000; // 1 second between votes
    this.userLastVote = new Map(); // userId → timestamp

    // Aggregation timer
    this.aggregationTimer = null;

    console.log('[StreamEmojiController] Initialized');
  }

  /**
   * Start stream session
   */
  startStream(streamId, metadata = {}) {
    this.streamId = streamId;
    this.currentScreen = 0;
    this.isLive = true;
    this.currentVotes.clear();
    this.voteHistory = [];

    // Start aggregation loop
    this._startAggregation();

    this.emit('stream:started', {
      streamId,
      metadata,
      timestamp: Date.now()
    });

    console.log(`[StreamEmojiController] Stream started: ${streamId}`);
  }

  /**
   * Stop stream session
   */
  stopStream() {
    this.isLive = false;

    // Stop aggregation
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }

    this.emit('stream:stopped', {
      streamId: this.streamId,
      totalVotes: this.voteHistory.length,
      timestamp: Date.now()
    });

    console.log(`[StreamEmojiController] Stream stopped: ${this.streamId}`);
  }

  /**
   * Handle emoji reaction from user
   */
  async handleEmojiReaction(options) {
    const {
      userId,
      emoji,
      timestamp = Date.now(),
      context = {}
    } = options;

    if (!this.isLive) {
      console.warn('[StreamEmojiController] Stream not live, ignoring reaction');
      return null;
    }

    // Rate limiting
    const lastVote = this.userLastVote.get(userId);
    if (lastVote && (timestamp - lastVote) < this.userVoteCooldown) {
      console.log(`[StreamEmojiController] Rate limit: ${userId}`);
      return null;
    }

    // Validate emoji command
    const command = this.emojiCommands[emoji];
    if (!command) {
      console.log(`[StreamEmojiController] Unknown emoji: ${emoji}`);
      return null;
    }

    // Check emoji vibe (is it cringe?)
    let vibeScore = 50; // Default neutral
    if (this.emojiVibeScorer) {
      const vibe = await this.emojiVibeScorer.scoreEmoji({
        emoji,
        context: context.topic || 'stream',
        sentiment: 'neutral'
      });
      vibeScore = vibe.cringeScore || 50;
    }

    // Cringe emojis get downweighted
    const cringeMultiplier = vibeScore > 70 ? 0.5 : 1.0;
    const effectiveWeight = command.weight * cringeMultiplier;

    // Record vote
    const vote = {
      userId,
      emoji,
      timestamp,
      screen: context.screen || this.currentScreen,
      topic: context.topic || 'unknown',
      action: command.action,
      weight: effectiveWeight,
      vibeScore
    };

    this.voteHistory.push(vote);

    // Update current votes
    const currentCount = this.currentVotes.get(emoji) || 0;
    this.currentVotes.set(emoji, currentCount + 1);

    // Update rate limit
    this.userLastVote.set(userId, timestamp);

    // Track in database
    if (this.db) {
      await this._trackVote(vote);
    }

    this.emit('emoji:received', vote);

    console.log(`[StreamEmojiController] ${emoji} from ${userId} → ${command.action} (weight: ${effectiveWeight.toFixed(2)})`);

    return vote;
  }

  /**
   * Get current stream command based on emoji votes
   */
  getStreamCommand() {
    if (!this.isLive || this.currentVotes.size === 0) {
      return {
        action: 'continue',
        confidence: 0,
        emojiCounts: {}
      };
    }

    // Aggregate votes by action
    const actionScores = new Map();

    for (const vote of this.voteHistory) {
      // Only count recent votes (within voting window)
      const age = Date.now() - vote.timestamp;
      if (age > this.votingWindow) continue;

      const currentScore = actionScores.get(vote.action) || 0;
      actionScores.set(vote.action, currentScore + vote.weight);
    }

    // Find winning action
    let winningAction = 'continue';
    let maxScore = 0;

    for (const [action, score] of actionScores.entries()) {
      if (score > maxScore) {
        maxScore = score;
        winningAction = action;
      }
    }

    // Check if threshold met
    const threshold = this.actionThresholds[winningAction] || 3;
    const confidence = Math.min(maxScore / threshold, 1.0);

    // Convert currentVotes to object
    const emojiCounts = {};
    for (const [emoji, count] of this.currentVotes.entries()) {
      emojiCounts[emoji] = count;
    }

    return {
      action: confidence >= 1.0 ? winningAction : 'continue',
      confidence,
      emojiCounts,
      totalVotes: this.voteHistory.length,
      recentVotes: actionScores.size
    };
  }

  /**
   * Get viral moment markers (high 💀🔥🎃 concentration)
   */
  getViralMoments(options = {}) {
    const {
      minIntensity = 5, // Min emoji count to qualify
      timeWindow = 10000 // 10 second window
    } = options;

    const viralEmojis = ['💀', '🔥', '🎃', '🎯'];
    const moments = [];

    // Group votes by screen
    const screenVotes = new Map();

    for (const vote of this.voteHistory) {
      if (!viralEmojis.includes(vote.emoji)) continue;

      const key = vote.screen;
      const votes = screenVotes.get(key) || [];
      votes.push(vote);
      screenVotes.set(key, votes);
    }

    // Find high-intensity moments
    for (const [screen, votes] of screenVotes.entries()) {
      if (votes.length < minIntensity) continue;

      // Calculate time spread
      const timestamps = votes.map(v => v.timestamp);
      const timeSpread = Math.max(...timestamps) - Math.min(...timestamps);

      if (timeSpread > timeWindow) continue;

      // Calculate intensity (votes per second)
      const intensity = votes.length / (timeSpread / 1000);

      moments.push({
        screen,
        voteCount: votes.length,
        intensity,
        timeSpread,
        emojiBreakdown: this._countEmojis(votes),
        startTime: Math.min(...timestamps),
        endTime: Math.max(...timestamps)
      });
    }

    // Sort by intensity
    moments.sort((a, b) => b.intensity - a.intensity);

    return moments;
  }

  /**
   * Advance to next screen
   */
  nextScreen() {
    this.currentScreen++;
    this.currentVotes.clear(); // Reset votes for new screen

    this.emit('screen:changed', {
      screen: this.currentScreen,
      timestamp: Date.now()
    });

    console.log(`[StreamEmojiController] Advanced to screen ${this.currentScreen}`);
  }

  /**
   * Go to specific screen
   */
  goToScreen(screenNumber) {
    this.currentScreen = screenNumber;
    this.currentVotes.clear();

    this.emit('screen:changed', {
      screen: this.currentScreen,
      timestamp: Date.now()
    });

    console.log(`[StreamEmojiController] Jumped to screen ${this.currentScreen}`);
  }

  /**
   * Get emoji statistics for current stream
   */
  getStats() {
    const uniqueUsers = new Set(this.voteHistory.map(v => v.userId)).size;
    const totalVotes = this.voteHistory.length;

    // Count by action
    const actionCounts = {};
    for (const vote of this.voteHistory) {
      actionCounts[vote.action] = (actionCounts[vote.action] || 0) + 1;
    }

    // Count by emoji
    const emojiCounts = {};
    for (const vote of this.voteHistory) {
      emojiCounts[vote.emoji] = (emojiCounts[vote.emoji] || 0) + 1;
    }

    // Top screens by engagement
    const screenEngagement = new Map();
    for (const vote of this.voteHistory) {
      const count = screenEngagement.get(vote.screen) || 0;
      screenEngagement.set(vote.screen, count + 1);
    }

    const topScreens = Array.from(screenEngagement.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([screen, votes]) => ({ screen, votes }));

    return {
      streamId: this.streamId,
      isLive: this.isLive,
      currentScreen: this.currentScreen,
      totalVotes,
      uniqueUsers,
      actionCounts,
      emojiCounts,
      topScreens,
      viralMoments: this.getViralMoments().length
    };
  }

  /**
   * Start aggregation loop
   */
  _startAggregation() {
    this.aggregationTimer = setInterval(() => {
      const command = this.getStreamCommand();

      // Broadcast command to all connected clients
      this.emit('command:update', command);

      // Clean up old votes
      const cutoff = Date.now() - this.votingWindow;
      this.voteHistory = this.voteHistory.filter(v => v.timestamp > cutoff);

    }, 1000); // Update every second
  }

  /**
   * Count emojis in vote array
   */
  _countEmojis(votes) {
    const counts = {};
    for (const vote of votes) {
      counts[vote.emoji] = (counts[vote.emoji] || 0) + 1;
    }
    return counts;
  }

  /**
   * Track vote in database
   */
  async _trackVote(vote) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO stream_emoji_votes (
          stream_id,
          user_id,
          emoji,
          action,
          weight,
          vibe_score,
          screen,
          topic,
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        this.streamId,
        vote.userId,
        vote.emoji,
        vote.action,
        vote.weight,
        vote.vibeScore,
        vote.screen,
        vote.topic,
        new Date(vote.timestamp)
      ]);

    } catch (error) {
      // Table might not exist yet
      if (!error.message.includes('does not exist')) {
        console.error('[StreamEmojiController] Track vote error:', error.message);
      }
    }
  }
}

module.exports = StreamEmojiController;
