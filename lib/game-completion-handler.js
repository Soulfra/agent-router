/**
 * Game Completion Handler
 *
 * Central module for processing card game completions and triggering
 * the complete feedback loop:
 *
 * Game Win → Emoji Vibe Scoring → Leaderboard → Quest Progress → ELO Updates → Bounties
 *
 * Integration Points:
 * - EmojiVibeScorer: Score emoji usage (based/neutral/cringe)
 * - ActivityLeaderboard: Record scores, top 1000 get immunity
 * - QuestEngine: Progress quests, award bounties
 * - EloCalculator: Update competitive ratings
 *
 * Philosophy:
 * Every game completion is a learning opportunity.
 * CringeProof scores the emojis you played.
 * Good plays = higher rank = rewards.
 */

const { EventEmitter } = require('events');

class GameCompletionHandler extends EventEmitter {
  constructor(options = {}) {
    super();

    this.emojiVibeScorer = options.emojiVibeScorer;
    this.activityLeaderboard = options.activityLeaderboard;
    this.questEngine = options.questEngine;
    this.eloCalculator = options.eloCalculator;

    // Configuration
    this.config = {
      // Base scores by game mode
      baseScores: {
        speed: 100,     // UNO-style
        judge: 150,     // CAH-style
        build: 200,     // Settlers-style
        custom: 100
      },

      // Multipliers
      basedEmojiBonus: 1.5,     // 50% bonus for based emojis
      cringeEmojiPenalty: 0.7,  // 30% penalty for cringe emojis
      quickWinBonus: 1.2,       // 20% bonus for fast wins
      perfectWinBonus: 2.0,     // 100% bonus for perfect wins

      // Quest slugs
      questSlugs: {
        gameWin: 'card-game-victories',
        basedMaster: 'based-emoji-master',
        cringeAvoidance: 'cringe-proof-champion'
      }
    };

    console.log('[GameCompletionHandler] Initialized');
  }

  /**
   * Handle game completion
   *
   * @param {Object} game - Full game state from card-game-engine
   * @param {Object} winner - Winner player object
   * @returns {Object} - Completion results with all updates
   */
  async handleCompletion(game, winner) {
    try {
      console.log(`[GameCompletionHandler] Processing completion for game ${game.gameId}`);

      // Extract emoji plays from winner
      const emojiPlays = this._extractEmojiPlays(game, winner);

      // Score emojis with CringeProof
      const vibeScore = await this._scoreEmojis(emojiPlays, game);

      // Calculate final score with modifiers
      const finalScore = this._calculateScore(game, winner, vibeScore);

      // Update leaderboard
      const leaderboardResult = await this._updateLeaderboard(winner, finalScore, game, vibeScore);

      // Update quest progress
      const questResults = await this._updateQuests(winner, game, vibeScore);

      // Update ELO ratings
      const eloResults = await this._updateELO(game, winner);

      // Emit completion event for other systems
      this.emit('game_completed', {
        gameId: game.gameId,
        winner: winner.playerId,
        score: finalScore,
        vibeScore,
        leaderboard: leaderboardResult,
        quests: questResults,
        elo: eloResults
      });

      return {
        success: true,
        gameId: game.gameId,
        winner: {
          playerId: winner.playerId,
          username: winner.username,
          score: finalScore
        },
        vibeAnalysis: vibeScore,
        leaderboard: leaderboardResult,
        quests: questResults,
        elo: eloResults
      };

    } catch (error) {
      console.error('[GameCompletionHandler] Error handling completion:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract emoji plays from game state
   * @private
   */
  _extractEmojiPlays(game, winner) {
    const emojis = [];

    // Extract from discard pile (winner's played cards)
    if (game.discardPile && Array.isArray(game.discardPile)) {
      game.discardPile.forEach(card => {
        if (card.emoji) {
          emojis.push(card.emoji);
        }
        if (card.text) {
          // Extract emojis from card text (CAH mode)
          const extractedEmojis = this._extractEmojisFromText(card.text);
          emojis.push(...extractedEmojis);
        }
      });
    }

    // Extract from winner's metadata if tracked
    if (game.metadata && game.metadata.emojiPlays) {
      const winnerPlays = game.metadata.emojiPlays[winner.playerId] || [];
      emojis.push(...winnerPlays);
    }

    return [...new Set(emojis)]; // Remove duplicates
  }

  /**
   * Extract emojis from text using regex
   * @private
   */
  _extractEmojisFromText(text) {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    return text.match(emojiRegex) || [];
  }

  /**
   * Score emojis with CringeProof
   * @private
   */
  async _scoreEmojis(emojis, game) {
    if (!this.emojiVibeScorer || emojis.length === 0) {
      return {
        verdict: 'neutral',
        overallCringeScore: 50,
        emojis: [],
        message: 'No emojis to score or scorer unavailable'
      };
    }

    try {
      // Build message from emojis
      const message = emojis.join(' ');

      // Determine context from game mode
      const context = {
        type: game.gameMode === 'judge' ? 'gen_z' : 'casual',
        gameMode: game.gameMode,
        ageGroup: 'teen'
      };

      // Score with CringeProof
      const result = await this.emojiVibeScorer.vibeCheck(message, context);

      console.log(`[GameCompletionHandler] Vibe check: ${result.score.verdict} (${result.score.overallCringeScore}/100)`);

      return result.score;

    } catch (error) {
      console.warn('[GameCompletionHandler] Vibe scoring failed:', error.message);
      return {
        verdict: 'neutral',
        overallCringeScore: 50,
        emojis: [],
        error: error.message
      };
    }
  }

  /**
   * Calculate final score with multipliers
   * @private
   */
  _calculateScore(game, winner, vibeScore) {
    // Base score by game mode
    let score = this.config.baseScores[game.gameMode] || 100;

    // Apply vibe multipliers
    if (vibeScore.verdict === 'based') {
      score *= this.config.basedEmojiBonus;
      console.log(`[GameCompletionHandler] Based emoji bonus: ${this.config.basedEmojiBonus}x`);
    } else if (vibeScore.verdict === 'cringe') {
      score *= this.config.cringeEmojiPenalty;
      console.log(`[GameCompletionHandler] Cringe emoji penalty: ${this.config.cringeEmojiPenalty}x`);
    }

    // Quick win bonus (under 5 minutes)
    const gameDuration = game.endedAt - game.startedAt;
    if (gameDuration < 5 * 60 * 1000) {
      score *= this.config.quickWinBonus;
      console.log(`[GameCompletionHandler] Quick win bonus: ${this.config.quickWinBonus}x`);
    }

    // Perfect win bonus (no cards drawn, CAH only)
    if (game.gameMode === 'judge' && winner.score === game.customRules.targetPoints) {
      score *= this.config.perfectWinBonus;
      console.log(`[GameCompletionHandler] Perfect win bonus: ${this.config.perfectWinBonus}x`);
    }

    return Math.round(score);
  }

  /**
   * Update activity leaderboard
   * @private
   */
  async _updateLeaderboard(winner, score, game, vibeScore) {
    if (!this.activityLeaderboard) {
      return { success: false, message: 'Leaderboard unavailable' };
    }

    try {
      await this.activityLeaderboard.recordActivity(
        winner.playerId,
        score,
        'cringeproof.com', // Brand domain for card games
        {
          username: winner.username,
          activityType: 'card_game_win',
          gameMode: game.gameMode,
          gameId: game.gameId,
          vibeVerdict: vibeScore.verdict,
          cringeScore: vibeScore.overallCringeScore,
          timestamp: Date.now()
        }
      );

      console.log(`[GameCompletionHandler] Leaderboard updated: ${winner.username} +${score}`);

      return {
        success: true,
        score,
        brand: 'cringeproof.com'
      };

    } catch (error) {
      console.warn('[GameCompletionHandler] Leaderboard update failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update quest progress
   * @private
   */
  async _updateQuests(winner, game, vibeScore) {
    if (!this.questEngine) {
      return { success: false, message: 'Quest engine unavailable' };
    }

    const updates = [];

    try {
      // Generic game win quest
      await this.questEngine.updateProgress(
        winner.playerId,
        this.config.questSlugs.gameWin,
        1, // increment count
        0,
        {
          gameId: game.gameId,
          gameMode: game.gameMode,
          timestamp: Date.now()
        }
      );
      updates.push('card-game-victories');

      // Based emoji master quest (if verdict is based)
      if (vibeScore.verdict === 'based') {
        await this.questEngine.updateProgress(
          winner.playerId,
          this.config.questSlugs.basedMaster,
          1,
          vibeScore.overallCringeScore, // Lower score = more based
          {
            gameId: game.gameId,
            cringeScore: vibeScore.overallCringeScore,
            timestamp: Date.now()
          }
        );
        updates.push('based-emoji-master');
      }

      // Cringe avoidance quest (if score < 40)
      if (vibeScore.overallCringeScore < 40) {
        await this.questEngine.updateProgress(
          winner.playerId,
          this.config.questSlugs.cringeAvoidance,
          1,
          0,
          {
            gameId: game.gameId,
            cringeScore: vibeScore.overallCringeScore,
            timestamp: Date.now()
          }
        );
        updates.push('cringe-proof-champion');
      }

      console.log(`[GameCompletionHandler] Quests updated: ${updates.join(', ')}`);

      return {
        success: true,
        questsUpdated: updates
      };

    } catch (error) {
      console.warn('[GameCompletionHandler] Quest update failed:', error.message);
      return {
        success: false,
        error: error.message,
        partialUpdates: updates
      };
    }
  }

  /**
   * Update ELO ratings for all players
   * @private
   */
  async _updateELO(game, winner) {
    if (!this.eloCalculator) {
      return { success: false, message: 'ELO calculator unavailable' };
    }

    try {
      const updates = [];

      // Get winner's current ELO (default 1500)
      const winnerElo = winner.metadata?.elo || 1500;

      // Update ELO for each opponent
      for (const player of game.players) {
        if (player.playerId === winner.playerId) continue; // Skip winner

        const opponentElo = player.metadata?.elo || 1500;

        // Calculate new ratings (1.0 = winner takes all)
        const result = this.eloCalculator.updateRatings(winnerElo, opponentElo, 1.0);

        updates.push({
          playerId: player.playerId,
          username: player.username,
          oldElo: opponentElo,
          newElo: result.loser,
          change: -(result.change)
        });

        console.log(`[GameCompletionHandler] ELO: ${player.username} ${opponentElo} → ${result.loser} (${-result.change})`);
      }

      // Calculate winner's new ELO (average against all opponents)
      const avgOpponentElo = game.players
        .filter(p => p.playerId !== winner.playerId)
        .reduce((sum, p) => sum + (p.metadata?.elo || 1500), 0) / (game.players.length - 1);

      const winnerResult = this.eloCalculator.updateRatings(winnerElo, avgOpponentElo, 1.0);

      updates.unshift({
        playerId: winner.playerId,
        username: winner.username,
        oldElo: winnerElo,
        newElo: winnerResult.winner,
        change: winnerResult.change
      });

      console.log(`[GameCompletionHandler] ELO: ${winner.username} ${winnerElo} → ${winnerResult.winner} (+${winnerResult.change})`);

      return {
        success: true,
        updates
      };

    } catch (error) {
      console.warn('[GameCompletionHandler] ELO update failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = GameCompletionHandler;
