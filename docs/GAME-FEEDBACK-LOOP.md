# Card Game Feedback Loop Integration

Complete feedback loop: **Game Win → Emoji Vibe Scoring → Leaderboard → Quest Progress → ELO Updates → Bounties**

## Architecture

```
Player completes emoji card game (Speed/Judge/Build)
         ↓
CardGameEngine.checkWinCondition() detects winner
         ↓
CardGameWebSocketHandler broadcasts 'game_ended'
         ↓
GameCompletionHandler.handleCompletion() triggered
         ↓
├── Extract emojis from winner's plays
├── Score with CringeProof (based/neutral/cringe)
├── Record to ActivityLeaderboard (+score, top 1000 immunity)
├── Update QuestEngine progress (card-game-victories, based-emoji-master, etc.)
├── Calculate ELO rating changes (winner +ELO, losers -ELO)
└── Emit 'game_completed' event for other systems
         ↓
Results returned to all players via WebSocket
```

## Components

### 1. GameCompletionHandler (`lib/game-completion-handler.js`)
Central coordinator for all post-game processing.

**Key Methods:**
- `handleCompletion(game, winner)` - Main entry point
- `_extractEmojiPlays(game, winner)` - Pull emojis from game state
- `_scoreEmojis(emojis, game)` - CringeProof vibe scoring
- `_calculateScore(game, winner, vibeScore)` - Apply multipliers
- `_updateLeaderboard(winner, score, game, vibeScore)` - Record activity
- `_updateQuests(winner, game, vibeScore)` - Progress quests
- `_updateELO(game, winner)` - Calculate new ratings

**Score Multipliers:**
- Base scores: Speed=100, Judge=150, Build=200
- Based emoji bonus: 1.5x (50% bonus)
- Cringe emoji penalty: 0.7x (30% penalty)
- Quick win bonus: 1.2x (games under 5 minutes)
- Perfect win bonus: 2.0x (100% bonus, judge mode only)

### 2. CardGameWebSocketHandler (`lib/card-game-websocket-handler.js`)
Real-time WebSocket handler with integrated completion processing.

**Modified Locations:**
```javascript
// Line 267-282: After human player wins
if (result.winner) {
  if (this.gameCompletionHandler) {
    const game = this.cardGameEngine.getGame(gameId);
    await this.gameCompletionHandler.handleCompletion(game, result.winner);
  }
  this.broadcastToGame(gameId, { type: 'game_ended', ... });
}

// Line 356-371: After judge mode completion
if (result.gameWinner) {
  if (this.gameCompletionHandler) {
    const game = this.cardGameEngine.getGame(gameId);
    await this.gameCompletionHandler.handleCompletion(game, result.gameWinner);
  }
  this.broadcastToGame(gameId, { type: 'game_ended', ... });
}

// Line 531-546: After bot player wins
if (result.winner) {
  if (this.gameCompletionHandler) {
    const game = this.cardGameEngine.getGame(gameId);
    await this.gameCompletionHandler.handleCompletion(game, result.winner);
  }
  this.broadcastToGame(gameId, { type: 'game_ended', ... });
}
```

### 3. Router Initialization (`router.js` lines 2710-2741)
Dependencies initialized in router startup.

```javascript
const ActivityLeaderboard = require('./lib/activity-leaderboard');
const QuestEngine = require('./lib/quest-engine');
const EloCalculator = require('./lib/elo-calculator');
const GameCompletionHandler = require('./lib/game-completion-handler');

const activityLeaderboard = new ActivityLeaderboard({ db });
const questEngine = new QuestEngine({ db });
const eloCalculator = new EloCalculator();

const gameCompletionHandler = new GameCompletionHandler({
  emojiVibeScorer,
  activityLeaderboard,
  questEngine,
  eloCalculator
});

// Store for use in WebSocket handlers
app.set('gameCompletionHandler', gameCompletionHandler);
app.set('activityLeaderboard', activityLeaderboard);
app.set('questEngine', questEngine);
app.set('eloCalculator', eloCalculator);
```

## Wiring WebSocket Handler (When Initialized)

When the CardGameWebSocketHandler is created in router.js or a WebSocket server file:

```javascript
// Get the game completion handler from app
const gameCompletionHandler = app.get('gameCompletionHandler');

// Pass to CardGameWebSocketHandler constructor
const cardGameWSHandler = new CardGameWebSocketHandler({
  db,
  cardGameEngine,
  aiCardPlayer,
  botPool,
  gameCompletionHandler  // <-- Add this!
});

// Set up WebSocket server
wss.on('connection', (ws) => {
  cardGameWSHandler.onConnection(ws);
});
```

## Quest Integration

### Quest Slugs
The system tracks 3 quest types:

1. **`card-game-victories`** - Generic game wins
   - Increments on every win regardless of emoji usage

2. **`based-emoji-master`** - Win with based emojis
   - Increments when `vibeScore.verdict === 'based'`
   - Value = cringeScore (lower = better)

3. **`cringe-proof-champion`** - Avoid cringe emojis
   - Increments when `vibeScore.overallCringeScore < 40`
   - Rewards consistent non-cringe play

### Creating Quests in Database

```sql
INSERT INTO quests (
  quest_slug,
  quest_type,
  quest_name,
  quest_description,
  target_count,
  target_value,
  reward_type,
  reward_value,
  is_active
) VALUES
  ('card-game-victories', 'achievement', 'Card Game Champion', 'Win 10 card games', 10, 0, 'karma', 500, true),
  ('based-emoji-master', 'achievement', 'Based Emoji Master', 'Win 5 games with based emojis', 5, 0, 'karma', 1000, true),
  ('cringe-proof-champion', 'achievement', 'CringeProof Champion', 'Win 10 games avoiding cringe emojis', 10, 0, 'karma', 2000, true);
```

## Leaderboard Integration

### Activity Tracking
Every game completion records activity:

```javascript
await activityLeaderboard.recordActivity(
  winner.playerId,
  finalScore,  // With multipliers applied
  'cringeproof.com',
  {
    activityType: 'card_game_win',
    gameMode: game.gameMode,
    vibeVerdict: vibeScore.verdict,
    cringeScore: vibeScore.overallCringeScore
  }
);
```

### Leaderboard Benefits
- **Top 1000 players** get subdomain immunity (Clash of Clans style)
- Global leaderboard across all 12 brands
- Per-brand leaderboards
- Weekly/monthly/all-time rankings

## ELO System

### Rating Calculations
Uses chess-style ELO system:

- **Default rating:** 1500
- **K-factor:** 32 (standard for active players)
- **Min rating:** 100
- **Max rating:** 3000

### Win Formula
```javascript
// Winner's new rating
expectedWin = 1 / (1 + 10^((loserRating - winnerRating) / 400))
winnerChange = K * (1.0 - expectedWin)
newWinnerRating = winnerRating + winnerChange

// Loser's new rating (inverse)
expectedLose = 1 / (1 + 10^((winnerRating - loserRating) / 400))
loserChange = K * (0.0 - expectedLose)
newLoserRating = loserRating + loserChange
```

### Multiplayer Games
Winner's rating calculated against **average opponent ELO**:
```javascript
avgOpponentElo = opponents.reduce((sum, p) => sum + p.elo, 0) / opponents.length
newWinnerRating = calculateAgainstAverage(winnerElo, avgOpponentElo)
```

## CringeProof Scoring

### Emoji Extraction
1. Extract from `game.discardPile` (all played cards)
2. Extract from `game.metadata.emojiPlays[playerId]` if tracked
3. Extract from card text using regex (CAH mode)
4. Remove duplicates

### Vibe Scoring
```javascript
const result = await emojiVibeScorer.vibeCheck(message, context);
// Returns:
// {
//   verdict: 'based' | 'neutral' | 'cringe',
//   overallCringeScore: 0-100,
//   emojis: [{ emoji, cringeScore, reasoning }]
// }
```

### Verdict Thresholds
- **0-30:** Based (culturally acceptable)
- **30-70:** Neutral
- **70-100:** Cringe (potentially awkward)

## Testing the Feedback Loop

### 1. Start Server with All Systems
```bash
npm start
# Check logs for:
# ✓ CringeProof emoji vibe checker initialized
# ✓ Game completion feedback loop initialized
#   - Leaderboard tracking enabled
#   - Quest progress enabled
#   - ELO rating system enabled
```

### 2. Create Test Game
```javascript
// Via WebSocket
ws.send(JSON.stringify({
  type: 'game_create',
  groupId: 'test-group',
  createdBy: 'user-123',
  gameMode: 'speed'
}));
```

### 3. Play to Completion
- Join game with 2+ players
- Play cards with emojis (💀 🔥 😭 etc.)
- Complete game until winner

### 4. Verify Outputs
Check console logs for:
```
[GameCompletionHandler] Processing completion for game game-abc123
[GameCompletionHandler] Vibe check: based (25/100)
[GameCompletionHandler] Based emoji bonus: 1.5x
[GameCompletionHandler] Leaderboard updated: Player_abc +150
[GameCompletionHandler] Quests updated: card-game-victories, based-emoji-master
[GameCompletionHandler] ELO: Player_abc 1500 → 1532 (+32)
```

### 5. Query Results
```javascript
// Check leaderboard
const leaderboard = await activityLeaderboard.getLeaderboard('cringeproof.com');

// Check quest progress
const quests = await questEngine.getUserQuests('user-123');

// Check ELO
// Stored in player.metadata.elo
```

## Troubleshooting

### Handler Not Called
**Symptom:** Games complete but no feedback loop processing

**Check:**
1. Is `gameCompletionHandler` passed to CardGameWebSocketHandler?
2. Are the 3 completion points wired (lines 267, 356, 531)?
3. Check for errors in console logs

**Fix:**
```javascript
// Verify handler exists
console.log('Handler:', this.gameCompletionHandler); // Should not be undefined
```

### Quest Not Progressing
**Symptom:** Quests don't update after game completion

**Check:**
1. Do quests exist in database with correct slugs?
2. Check quest_engine logs for errors
3. Verify quest is active (`is_active = true`)

**Fix:**
```sql
-- Check quest exists
SELECT * FROM quests WHERE quest_slug = 'card-game-victories';

-- Make active if needed
UPDATE quests SET is_active = true WHERE quest_slug = 'card-game-victories';
```

### Leaderboard Not Updating
**Symptom:** Scores not recorded to leaderboard

**Check:**
1. Is ActivityLeaderboard initialized?
2. Check database connection
3. Look for errors in leaderboard logs

**Fix:**
```javascript
// Test direct recording
await activityLeaderboard.recordActivity(
  'test-user',
  100,
  'cringeproof.com',
  { test: true }
);
```

### Vibe Scoring Not Working
**Symptom:** All verdicts are 'neutral' or no emojis extracted

**Check:**
1. Are emojis being extracted from game state?
2. Is EmojiVibeScorer initialized with Ollama?
3. Check emoji regex pattern matches

**Fix:**
```javascript
// Test emoji extraction
const emojis = this._extractEmojisFromText('💀 🔥 bruh');
console.log('Extracted:', emojis); // Should show ['💀', '🔥']
```

## Future Enhancements

1. **Emoji Theme Multipliers**
   - Hanafuda deck = 1.3x bonus
   - Chaos deck = 1.1x bonus

2. **Streak Bonuses**
   - 3 wins in a row = 1.2x
   - 5 wins in a row = 1.5x

3. **Tournament Mode**
   - Brackets with ELO seeding
   - Prize pools for top finishers

4. **Social Features**
   - Share vibe scores
   - Challenge friends
   - Weekly leaderboard rewards

---

**Status:** ✅ Fully integrated and ready for testing
**Last Updated:** 2025-10-22
