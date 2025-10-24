# 🎮 Quest-Based Game Platform - COMPLETE ✅

**Date:** 2025-10-22

## What You Asked For

> "maybe we just host this all on our own site or app and leak it out into circles to get it slowly growing as a referral or invite service thats basically a game but people can build ideas when we open new apps etclike quests and other things that draw discussion into the forums. like almost a dungeon master from dnd except each groupchat has their own mascot like a podcast filter lol"

## What We Built

A **quest-driven game platform** where users unlock apps/features through:

- **Invite quests** - Build your circle to unlock features
- **Forum quests** - Participate in discussions to progress
- **Collaboration quests** - Team up in rooms/portals
- **Per-room AI mascots** - Each room has unique personality (podcast filter pattern)
- **DND Dungeon Master** - AI narrates your quest journey

---

## Architecture

### How It All Connects

```
User Joins CALOS
      ↓
DND Master Welcomes
      ↓
┌─────────────────────────────────────────┐
│  Quest System (lib/quest-engine.js)     │
│  ┌──────────────────────────────────────┤
│  │ Invite Quests                        │
│  │ ↓                                    │
│  │ Invite Quest Tracker                 │
│  │ (lib/invite-quest-tracker.js)        │
│  │   → Affiliate Tracker                │
│  │   → Sphere System (circles)          │
│  │                                      │
│  │ Forum Quests                         │
│  │ ↓                                    │
│  │ Forum Quest Integration              │
│  │ (lib/forum-quest-integration.js)     │
│  │   → Lore Bot Generator               │
│  │   → Content Forum                    │
│  │                                      │
│  │ Collaboration Quests                 │
│  │ ↓                                    │
│  │ Room/Portal Systems                  │
│  │   → Room Manager (Matrix-style)      │
│  │   → Multiplayer Portal Manager       │
│  │   → Room Mascot Manager              │
│  └──────────────────────────────────────┤
│                                          │
│  Rewards → Unlock apps/features          │
└─────────────────────────────────────────┘
      ↓
DND Master Celebrates Victory
      ↓
New Quests Unlocked
```

---

## Files Created

### 1. Database Migration

**`database/migrations/141_quest_system.sql`**

Complete quest system database with:

**Tables:**
- `quests` - Quest definitions (200+ lines)
- `user_quest_progress` - Track user progress
- `quest_rewards_claimed` - Rewards given
- `dungeon_master_narrative` - AI guidance log
- `quest_events` - Audit trail

**Functions:**
- `is_quest_available(userId, questId)` - Check if quest unlocked
- `initialize_quest(userId, questId)` - Unlock quest for user
- `update_quest_progress(userId, questId, count, value)` - Track progress
- `calculate_post_engagement(upvotes, downvotes, comments, age)` - Quality scoring

**Views:**
- `user_quest_summary` - User stats (completed, in_progress, karma)
- `quest_leaderboard` - Global rankings

**Seeded Quests:**
- **Beginner**: Welcome traveler, first discussion, first invite
- **Intermediate**: Discussion master (5 posts, 10+ upvotes), circle builder (5 invites), room explorer (3 rooms)
- **Advanced**: Viral network (20 invites), forum legend (25 posts, 250+ upvotes), portal host (3 tasks)
- **Legendary**: Empire builder (100 invites, 50 active)

### 2. Core Engine

**`lib/quest-engine.js`** (450+ lines)

Main quest management engine:

```javascript
const engine = new QuestEngine({ db, dungeonMaster });

// Get user's quests
const quests = await engine.getUserQuests(userId);

// Track invite
await engine.trackInvite(userId, invitedUserId);

// Track forum post
await engine.trackForumPost(userId, threadId, upvotes);

// Claim reward
const reward = await engine.claimReward(userId, questId);

// Get DND Master narratives
const narratives = await engine.getDungeonMasterNarratives(userId, markAsShown);

// Get stats
const stats = await engine.getUserStats(userId);

// Get leaderboard
const leaderboard = await engine.getLeaderboard(100);
```

**Features:**
- Quest lifecycle management
- Progress tracking with events
- Reward distribution
- Quest chains (prerequisites)
- Expiring quests
- Custom quest creation

### 3. DND Dungeon Master AI

**`lib/dungeon-master-ai.js`** (400+ lines)

AI guide using local Ollama:

```javascript
const dm = new DungeonMasterAI({ ollamaUrl, model, db });

// Generate narratives
const intro = await dm.generateQuestIntro(quest);
const progress = await dm.generateProgressNarrative(quest, progress);
const complete = await dm.generateCompletionNarrative(quest);

// Give hints
const hint = await dm.generateHint(quest, userContext);

// Encourage
const encouragement = await dm.generateEncouragement(quest, userContext);

// Welcome new user
const welcome = await dm.generateWelcome(userName);

// Quest chain unlock
const unlock = await dm.generateQuestChainUnlock(previousQuest, newQuest);
```

**Personality:**
- Wise and encouraging (like DND master)
- Cryptic but helpful
- Celebrates victories
- References fantasy/RPG lore
- Speaks in second person ("You")

**Example Output:**
```
Quest Intro: "A new challenge appears before you: Build Your Circle. Will you answer the call?"

Progress: "Your circle begins to form... 3/5 invited"

Complete: "Your circle is strong! You have earned Pro tier access for 30 days."

Hint: "Seek allies within your spheres. The answer lies in the community you build..."
```

### 4. Room Mascot System

**`lib/room-mascot-manager.js`** (500+ lines)

Per-room AI personalities (podcast filter pattern):

```javascript
const manager = new RoomMascotManager({ db, roomManager, ollamaUrl });

// Create mascot
await manager.createMascot(roomId, 'meme', {
  name: 'MemeLord',
  emoji: '💀'
});

// Chat with mascot
const response = await manager.chat(roomId, userId, 'How do I deploy this?');
// → { success: true, mascot_name: 'MemeLord', response: 'bruh fr fr here's the deploy...' }

// Train custom mascot on room code
await manager.trainCustomMascot(roomId, repoPath, {
  name: 'Room Expert',
  baseModel: 'llama3.2:3b'
});

// Get personality
const personality = await manager.getMascotPersonality(roomId);

// Get stats
const stats = await manager.getMascotStats(roomId);
```

**Personality Types:**

| Type | Name | Emoji | Tone | Style |
|------|------|-------|------|-------|
| creative | Creative Spark | 🎨 | Enthusiastic | Uses emojis, celebrates wild ideas |
| technical | Tech Guru | 🤓 | Precise | Focuses on implementation |
| meme | Meme Master | 💀 | Casual, humorous | Gen-Z slang (fr fr, bruh, no cap) |
| professional | Pro Guide | 💼 | Clear, formal | Professional language |
| mentor | Code Mentor | 👨‍🏫 | Patient, teaching | Asks guiding questions |
| hype | Hype Bot | 🚀 | Energetic | Always excited, motivating |
| zen | Zen Master | 🧘 | Calm, philosophical | Quality over speed |
| custom | Custom | 🤖 | Variable | Trained on room code |

**Example Responses:**

```
Meme Bot:
User: "How do I fix this bug?"
Mascot: "bruh that bug is wild 💀 ok fr fr tho here's the fix..."

Creative Bot:
User: "Should we add this feature?"
Mascot: "Yoooo that's a wild idea! 🔥 Let's make it happen! What if we also..."

Zen Bot:
User: "This is taking forever!"
Mascot: "Slow down, friend. Quality over speed. Let's approach this mindfully..."
```

### 5. Invite Quest Tracker

**`lib/invite-quest-tracker.js`** (400+ lines)

Bridges affiliate system with quests:

```javascript
const tracker = new InviteQuestTracker({ db, questEngine, affiliateTracker });

// Track invite sent
await tracker.trackInvite(userId, invitedEmail, {
  sphereType: 'college',
  sphereValue: 'stanford.edu'
});

// Track invite accepted
await tracker.trackInviteAccepted(inviterUserId, invitedUserId);

// Track invite became active
await tracker.trackInviteBecameActive(inviterUserId, invitedUserId);

// Get invite tree
const tree = await tracker.getInviteTree(userId, maxDepth = 3);

// Get stats
const stats = await tracker.getInviteStats(userId);

// Get suggested circles
const circles = await tracker.getSuggestedCircles(userId);
// → [
//     { sphere_type: 'college', sphere_value: 'stanford.edu', remaining: 47 },
//     { sphere_type: 'company', sphere_value: 'Google', remaining: 23 }
//   ]

// Generate sphere-specific referral code
const code = await tracker.generateSphereReferralCode(userId, 'college', 'stanford.edu');
```

**Features:**
- Invite tree tracking (who invited whom, recursively)
- Sphere-based targeting (college, company, city, interest)
- Invite circle suggestions
- Leaderboards
- Quest progress updates

### 6. Forum Quest Integration

**`lib/forum-quest-integration.js`** (350+ lines)

Tracks discussion participation:

```javascript
const integration = new ForumQuestIntegration({ db, questEngine });

// Track post created
await integration.trackPostCreated(userId, threadId);

// Track upvote
await integration.trackUpvote(userId, threadId, newUpvoteCount);

// Track comment
await integration.trackComment(userId, threadId, commentCount);

// Calculate quality
const quality = await integration.calculatePostQuality(threadId);

// Get stats
const stats = await integration.getUserForumStats(userId);
// → {
//     total_posts: 12,
//     total_upvotes: 47,
//     avg_quality_score: 15.3
//   }

// Get top contributors
const top = await integration.getTopContributors(100);

// Check achievements
const achievements = await integration.checkForumAchievements(userId);
```

**Quality Scoring:**
- Upvote = 1 point
- Comment = 2 points (more valuable)
- View = 0.1 points

**Achievements:**
- First Steps (1 post)
- Community Valued (10 upvotes)
- Popular Voice (50 upvotes)
- Forum Legend (250 upvotes)
- Prolific (25+ posts)
- Quality Contributor (high avg quality)

---

## How It Works

### User Journey

**1. New User Signs Up**

```
DND Master: "Greetings, traveler. You have entered the CALOS realm. Your journey begins now..."

Available Quests:
  ✅ Welcome, Traveler (complete account setup) → 10 karma
  ⭕ First Discussion (post to forum) → Unlock Bot Builder
  ⭕ Build Your Circle (invite 1 friend) → Unlock self-hosted tier
```

**2. User Posts First Discussion**

```
User creates thread: "How to deploy CALOS locally?"

DND Master: "Your voice is being heard in the realm..."

Quest Progress:
  First Discussion: 1/1 complete ✅

DND Master: "Well done! You have contributed to the collective knowledge. The Bot Builder is now yours."

Reward Unlocked:
  🎉 Bot Builder Dashboard unlocked!
```

**3. User Invites Friends**

```
User invites 3 friends from college sphere (stanford.edu)

Progress:
  Build Your Circle: 1/1 complete ✅
  Circle Builder: 3/5 in progress ⏳

DND Master: "Your first companion has joined! Together, you are stronger. Self-hosting is now available."

Suggested Circles:
  🎓 Stanford (47 more classmates to invite)
  🏢 Google (23 colleagues)
```

**4. User Joins Rooms**

```
User joins #python-automation room

Room Mascot (Meme Bot): "yooo welcome to the python gang 🐍 what u building?"

User: "How do I deploy this script?"

Mascot: "bruh fr fr here's the deploy guide... [detailed answer]"

Quest Progress:
  Room Explorer: 1/3 rooms joined
```

**5. User Completes Collaboration Quest**

```
User joins multiplayer portal and completes collaborative task

DND Master: "You have mastered the art of collaboration! Custom portal themes are yours."

Unlocked:
  🌀 Custom Portal Themes
  🎨 Advanced Room Customization
```

### Quest Examples

#### Beginner Quests (Onboarding)

**Welcome, Traveler**
- Type: onboarding
- Requirement: Complete account setup
- Reward: 10 karma
- Narrative: "Your journey begins now..."

**First Discussion**
- Type: forum
- Requirement: Post 1 discussion
- Reward: Unlock Bot Builder
- Narrative: "Share your knowledge with the community..."

**Build Your Circle**
- Type: invite
- Requirement: Invite 1 friend
- Reward: Unlock self-hosted tier
- Narrative: "No traveler journeys alone..."

#### Intermediate Quests

**Discussion Master**
- Type: forum
- Requirement: 5 posts with 10+ total upvotes
- Reward: Unlock Network Radar & Process Monitor
- Narrative: "Your wisdom spreads across the realm..."

**Circle Builder**
- Type: invite
- Requirement: Invite 5 friends
- Reward: Pro tier (30 days free)
- Narrative: "Your influence grows..."

**Room Explorer**
- Type: collaboration
- Requirement: Join 3 rooms and post in each
- Reward: Custom room mascots
- Narrative: "Explore the many chambers..."

#### Advanced Quests

**Viral Network**
- Type: invite
- Requirement: Invite 20 friends
- Reward: Marketplace & Analytics
- Narrative: "Your network grows exponentially..."

**Forum Legend**
- Type: forum
- Requirement: 25 posts with 250+ upvotes
- Reward: DND Master consultation mode
- Narrative: "Your legend grows..."

**Portal Host**
- Type: collaboration
- Requirement: Host portal, complete 3 tasks
- Reward: Custom portal themes
- Narrative: "Open a portal and gather allies..."

#### Legendary Quest

**Empire Builder**
- Type: invite
- Requirement: Invite 100 friends, 50 active
- Reward: Lifetime Pro tier
- Narrative: "Build an empire that spans the realm..."

---

## Integration Points

### Existing Systems Used

1. **Spheres** (`database/migrations/063_family_tree_and_spheres.sql`)
   - College, company, city, interest groups
   - Used for invite circle targeting
   - "Leak invites into circles" strategy

2. **Rooms** (`lib/room-manager.js`)
   - Matrix-style code organization
   - Each room gets unique AI mascot
   - Collaboration quests

3. **Portals** (`lib/multiplayer-portal-manager.js`)
   - Pokémon-style multiplayer
   - Collaborative tasks
   - Real-time chat

4. **Lore Bot** (`lib/lore-bot-generator.js`)
   - Generates forum discussions
   - Bot-marked content (ethical)
   - Drives forum quests

5. **Affiliate Tracker** (`lib/affiliate-tracker.js`)
   - Referral code generation
   - Conversion tracking
   - Powers invite quests

6. **Ollama** (Local AI)
   - DND Master narratives
   - Room mascot personalities
   - Custom model training
   - 100% local, $0 cost

---

## API Integration (Next Step)

Need to create **`routes/quest-routes.js`** with:

```javascript
// Quest management
GET    /api/quests                 - List all quests
GET    /api/quests/:id              - Get quest details
GET    /api/quests/my-progress      - User's quest progress
POST   /api/quests/claim-reward     - Claim completed quest reward

// DND Master
GET    /api/quests/narrative         - Get unread narratives
POST   /api/quests/narrative/mark-read - Mark narratives as read
GET    /api/quests/hint/:questId     - Get hint for quest

// Room mascots
GET    /api/rooms/:id/mascot         - Get room mascot personality
POST   /api/rooms/:id/mascot/chat    - Chat with room mascot
POST   /api/rooms/:id/mascot/create  - Create/update room mascot
GET    /api/rooms/:id/mascot/history - Get chat history

// Invite tracking
POST   /api/invites/send             - Track invite sent
GET    /api/invites/tree             - Get invite tree
GET    /api/invites/stats            - Get invite stats
GET    /api/invites/circles          - Get suggested circles

// Forum tracking
POST   /api/forum/track-post         - Track forum post
POST   /api/forum/track-upvote       - Track upvote
GET    /api/forum/stats              - Get forum stats

// Leaderboards
GET    /api/quests/leaderboard       - Quest leaderboard
GET    /api/invites/leaderboard      - Invite leaderboard
GET    /api/forum/leaderboard        - Forum leaderboard
```

---

## UI Integration (Next Step)

Need to create **`public/game-launcher.html`** showing:

```
╔════════════════════════════════════════════╗
║  🎮 CALOS Quest Dashboard                  ║
╠════════════════════════════════════════════╣
║                                            ║
║  🧙 DND Master:                            ║
║  "Your circle grows stronger, traveler.   ║
║   Continue your quest..."                 ║
║                                            ║
╠════════════════════════════════════════════╣
║  Active Quests                             ║
╠════════════════════════════════════════════╣
║                                            ║
║  ⏳ Circle Builder (3/5)                   ║
║     Invite 2 more friends                 ║
║     Reward: Pro tier (30 days)            ║
║                                            ║
║  ⏳ Discussion Master (2/5, 7/10 upvotes) ║
║     Post 3 more discussions               ║
║     Reward: Network Radar                 ║
║                                            ║
╠════════════════════════════════════════════╣
║  Completed Quests (3)                      ║
╠════════════════════════════════════════════╣
║                                            ║
║  ✅ Welcome, Traveler (+10 karma)         ║
║  ✅ First Discussion (Bot Builder)        ║
║  ✅ Build Your Circle (Self-hosted)       ║
║                                            ║
╠════════════════════════════════════════════╣
║  Unlocked Apps                             ║
╠════════════════════════════════════════════╣
║                                            ║
║  🤖 Bot Builder Dashboard                 ║
║  📡 Network Radar (locked)                ║
║  📊 Process Monitor (locked)              ║
║  🛒 Marketplace (locked)                  ║
║                                            ║
╠════════════════════════════════════════════╣
║  Your Stats                                ║
╠════════════════════════════════════════════╣
║                                            ║
║  Karma: 25                                 ║
║  Quests Completed: 3                      ║
║  Invites: 3 (1 active)                    ║
║  Forum Posts: 2 (7 upvotes)               ║
║  Rooms Joined: 1                          ║
║                                            ║
╠════════════════════════════════════════════╣
║  Suggested Actions                         ║
╠════════════════════════════════════════════╣
║                                            ║
║  🎓 Invite 47 more Stanford classmates    ║
║  💬 Post to #python-automation room       ║
║  🌀 Join a multiplayer portal             ║
║                                            ║
╚════════════════════════════════════════════╝
```

---

## Benefits

### For Users

1. **Game > Tool** - Engaging game mechanics, not just software
2. **Clear Progression** - See exactly how to unlock features
3. **Community Building** - Invites and forums are rewarded
4. **Personalized Experience** - Room mascots feel unique
5. **Free to Play** - All features unlockable through gameplay

### For Platform (You)

1. **Viral Growth** - Invite quests drive referrals
2. **Engagement** - Forum quests drive content creation
3. **Retention** - Quest progression keeps users coming back
4. **Data Insights** - Track which features users want (quest completion rates)
5. **Low Cost** - Local Ollama (no API costs)

---

## Revenue Model

Quest system supports existing pricing tiers:

**Free Tier (Quest-Driven):**
- Unlock apps through quests
- Forum participation required
- Invite friends to progress
- All features unlockable

**Community Tier ($0/mo):**
- All quests instantly available
- Share anonymized data OR contribute code
- No waiting for unlocks

**Pro Tier ($29/mo):**
- All apps unlocked immediately
- Skip quest requirements
- Custom room mascots
- DND Master consultation mode

**Self-Hosted (One-time $99):**
- Everything unlocked
- Unlimited bots, rooms, portals
- No quest requirements
- Full customization

---

## Next Steps

1. **Create API Routes** (`routes/quest-routes.js`)
2. **Create Game Launcher UI** (`public/game-launcher.html`)
3. **Wire up in router.js**:
   ```javascript
   const QuestEngine = require('./lib/quest-engine');
   const DungeonMasterAI = require('./lib/dungeon-master-ai');
   const RoomMascotManager = require('./lib/room-mascot-manager');
   const InviteQuestTracker = require('./lib/invite-quest-tracker');
   const ForumQuestIntegration = require('./lib/forum-quest-integration');

   const dungeonMaster = new DungeonMasterAI({ ollamaUrl, model, db });
   const questEngine = new QuestEngine({ db, dungeonMaster });
   const roomMascots = new RoomMascotManager({ db, roomManager, ollamaUrl });
   const inviteTracker = new InviteQuestTracker({ db, questEngine, affiliateTracker });
   const forumIntegration = new ForumQuestIntegration({ db, questEngine });
   ```

4. **Run Database Migration**:
   ```bash
   psql -d calos -f database/migrations/141_quest_system.sql
   ```

5. **Test Quest Flow**:
   ```javascript
   // User signs up → initialize quests
   await questEngine.checkForNewQuests(userId);

   // User invites friend
   await inviteTracker.trackInvite(userId, 'friend@email.com');

   // Friend signs up
   await inviteTracker.trackInviteAccepted(userId, friendUserId);

   // Check progress
   const quests = await questEngine.getUserQuests(userId);

   // Claim reward
   await questEngine.claimReward(userId, questId);
   ```

---

## Summary

**What you wanted:**
> "a game but people can build ideas when we open new apps like quests, DND dungeon master, each groupchat has their own mascot like a podcast filter"

**What you got:**
- ✅ Quest system (unlock apps through gameplay)
- ✅ Invite quests (viral growth mechanics)
- ✅ Forum quests (discussion-driven unlocks)
- ✅ Collaboration quests (rooms/portals)
- ✅ DND Dungeon Master AI (narrates quest journey)
- ✅ Room mascots (per-chat AI personalities like podcast filters)
- ✅ Sphere targeting (leak invites into circles)
- ✅ 100% local AI (Ollama, $0 cost)
- ✅ Complete database schema
- ✅ All core engines built

**Status:** CORE COMPLETE ✅

**Remaining:** API routes + Game launcher UI (next session)

---

**CALOS is now a GAME that lets you build real things through quest progression!** 🎮🚀
