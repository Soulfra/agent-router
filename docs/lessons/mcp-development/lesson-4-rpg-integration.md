# Lesson 4: RPG Integration - Award XP

**Track:** Privacy-First MCP Development
**Lesson:** 4 of 8
**XP Reward:** 120
**Time:** 35 minutes
**Prerequisites:** Lesson 3 (Build First Tool)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Understand the CalOS RPG system
- ✅ Award XP to players using MCP tools
- ✅ Track player progression and levels
- ✅ Trigger achievements and unlocks
- ✅ Build gamified learning experiences

## The CalOS RPG System

CalOS includes a built-in RPG system for gamifying learning and engagement.

### Key Concepts

**Players**
- Every user is a player with a unique `userId`
- Players have levels, XP, and achievements
- Auto-created on first XP award

**XP (Experience Points)**
- Earned by completing lessons, challenges, and tasks
- 100 XP per level (Level 1 = 0-99 XP, Level 2 = 100-199 XP, etc.)
- Auto level-up when threshold reached

**Levels**
- Start at Level 1
- No maximum level
- Each level = 100 XP

**Achievements**
- Badges for milestones (first lesson, 10 lessons, etc.)
- Tracked in database
- Can trigger special rewards

## RPG MCP Tools

The MCP server provides two RPG tools:

### 1. `rpg_get_player` - Get Player Stats

```javascript
// Request
{
  tool: 'rpg_get_player',
  input: {
    userId: 'user123'
  }
}

// Response
{
  userId: 'user123',
  level: 5,
  xp: 42,              // XP in current level (0-99)
  totalXp: 442,        // Total XP earned ever
  achievements: [
    'first_lesson',
    'level_5',
    'week_streak'
  ],
  newPlayer: false     // true if just created
}
```

### 2. `rpg_award_xp` - Award XP to Player

```javascript
// Request
{
  tool: 'rpg_award_xp',
  input: {
    userId: 'user123',
    amount: 150,
    reason: 'Completed MCP Development Lesson 4'
  }
}

// Response
{
  userId: 'user123',
  awarded: 150,
  reason: 'Completed MCP Development Lesson 4',
  level: 6,            // New level after award
  xp: 92,              // XP in new level
  totalXp: 592,        // Total XP
  leveledUp: true,     // Did they level up?
  levelsGained: 1      // How many levels gained
}
```

## Example: Award XP on Lesson Completion

Let's build a lesson completion system that awards XP.

### Step 1: Complete a Lesson

```javascript
async function completeLesson(userId, lessonId, xpReward) {
  try {
    // Mark lesson as complete (your app logic)
    await markLessonComplete(userId, lessonId);

    // Award XP via MCP
    const response = await fetch('http://localhost:3100/mcp/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'rpg_award_xp',
        input: {
          userId: userId,
          amount: xpReward,
          reason: `Completed lesson: ${lessonId}`
        }
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    const result = data.result;

    // Show success message
    console.log(`Lesson complete! +${result.awarded} XP`);
    console.log(`You are now level ${result.level} (${result.xp}/100 XP)`);

    // Check for level up
    if (result.leveledUp) {
      console.log(`🎉 LEVEL UP! You gained ${result.levelsGained} level(s)!`);
      showLevelUpAnimation(result.level);
    }

    return result;

  } catch (error) {
    console.error('Failed to complete lesson:', error);
    throw error;
  }
}

// Usage
completeLesson('user123', 'mcp-lesson-4', 120);
```

### Step 2: Display Player Stats

```javascript
async function getPlayerStats(userId) {
  try {
    const response = await fetch('http://localhost:3100/mcp/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'rpg_get_player',
        input: { userId }
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    const player = data.result;

    return {
      level: player.level,
      xp: player.xp,
      totalXp: player.totalXp,
      nextLevelXp: 100,
      progress: (player.xp / 100) * 100, // Percentage
      achievements: player.achievements
    };

  } catch (error) {
    console.error('Failed to get player stats:', error);
    throw error;
  }
}

// Usage
const stats = await getPlayerStats('user123');
console.log(`Level ${stats.level} - ${stats.progress}% to next level`);
```

## Lab: Build a Progress Dashboard

Create a player progress dashboard that shows:
- Current level and XP
- Progress bar to next level
- Recent achievements
- Total lessons completed

### HTML Structure

```html
<!DOCTYPE html>
<html>
<head>
  <title>RPG Progress Dashboard</title>
  <style>
    body {
      font-family: monospace;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .stats-card {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 10px;
      margin: 20px 0;
      border-left: 4px solid #667eea;
    }

    .level {
      font-size: 48px;
      font-weight: bold;
      color: #ffd700;
      margin: 0;
    }

    .xp-bar {
      background: #2a2a3e;
      height: 30px;
      border-radius: 15px;
      overflow: hidden;
      margin: 10px 0;
    }

    .xp-progress {
      background: linear-gradient(90deg, #667eea, #764ba2);
      height: 100%;
      transition: width 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
    }

    .achievement {
      display: inline-block;
      background: #2a2a3e;
      padding: 8px 15px;
      margin: 5px;
      border-radius: 20px;
      border: 1px solid #667eea;
    }

    button {
      padding: 10px 20px;
      margin: 10px 5px 10px 0;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    }

    button:hover {
      background: #764ba2;
    }

    .level-up {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #1a1a2e;
      padding: 40px;
      border-radius: 20px;
      border: 3px solid #ffd700;
      text-align: center;
      display: none;
      z-index: 1000;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
  </style>
</head>
<body>
  <h1>🎮 RPG Progress Dashboard</h1>

  <div class="stats-card">
    <h2>Player Stats</h2>
    <p class="level" id="levelDisplay">Level 1</p>
    <p id="xpDisplay">0 / 100 XP</p>

    <div class="xp-bar">
      <div class="xp-progress" id="xpProgress" style="width: 0%">
        0%
      </div>
    </div>

    <p>Total XP: <span id="totalXp">0</span></p>
  </div>

  <div class="stats-card">
    <h2>Achievements</h2>
    <div id="achievementsList">
      <p>No achievements yet. Complete lessons to earn them!</p>
    </div>
  </div>

  <div>
    <input type="text" id="userId" placeholder="Enter user ID" value="demo-user" style="padding: 10px; width: 200px;">
    <button onclick="loadProgress()">Load Progress</button>
    <button onclick="awardTestXP()">Award 50 XP (Test)</button>
  </div>

  <div class="level-up" id="levelUpModal">
    <h1 style="color: #ffd700; font-size: 60px; margin: 0;">🎉</h1>
    <h2 style="color: #ffd700;">LEVEL UP!</h2>
    <p id="levelUpText">You reached level X!</p>
    <button onclick="closeLevelUp()">Continue</button>
  </div>

  <script>
    let currentUserId = 'demo-user';

    async function loadProgress() {
      currentUserId = document.getElementById('userId').value;

      try {
        const response = await fetch('http://localhost:3100/mcp/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'rpg_get_player',
            input: { userId: currentUserId }
          })
        });

        const data = await response.json();

        if (data.success) {
          updateDisplay(data.result);
        } else {
          alert('Error: ' + data.error);
        }
      } catch (error) {
        alert('Failed to load progress: ' + error.message);
      }
    }

    async function awardTestXP() {
      try {
        const response = await fetch('http://localhost:3100/mcp/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'rpg_award_xp',
            input: {
              userId: currentUserId,
              amount: 50,
              reason: 'Test XP award'
            }
          })
        });

        const data = await response.json();

        if (data.success) {
          updateDisplay(data.result);

          if (data.result.leveledUp) {
            showLevelUp(data.result.level);
          }
        } else {
          alert('Error: ' + data.error);
        }
      } catch (error) {
        alert('Failed to award XP: ' + error.message);
      }
    }

    function updateDisplay(player) {
      document.getElementById('levelDisplay').textContent = `Level ${player.level}`;
      document.getElementById('xpDisplay').textContent = `${player.xp} / 100 XP`;
      document.getElementById('totalXp').textContent = player.totalXp;

      const progress = (player.xp / 100) * 100;
      const progressBar = document.getElementById('xpProgress');
      progressBar.style.width = progress + '%';
      progressBar.textContent = Math.round(progress) + '%';

      // Update achievements
      const achievementsList = document.getElementById('achievementsList');
      if (player.achievements && player.achievements.length > 0) {
        achievementsList.innerHTML = player.achievements.map(a =>
          `<span class="achievement">🏆 ${a}</span>`
        ).join('');
      }
    }

    function showLevelUp(level) {
      const modal = document.getElementById('levelUpModal');
      document.getElementById('levelUpText').textContent = `You reached level ${level}!`;
      modal.style.display = 'block';
    }

    function closeLevelUp() {
      document.getElementById('levelUpModal').style.display = 'none';
    }

    // Load on page load
    window.addEventListener('load', () => {
      loadProgress();
    });
  </script>
</body>
</html>
```

Save as `public/labs/rpg-dashboard.html` and open in browser.

## Using the Learning API

CalOS also provides a full Learning API for lesson management.

### Complete a Lesson (with XP)

```javascript
async function completeLessonFull(userId, lessonId) {
  const response = await fetch('http://localhost:5001/api/learning/complete-lesson', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: userId,
      lessonId: lessonId,
      score: 100,
      timeSpentMinutes: 35
    })
  });

  const data = await response.json();
  console.log(data);
  // { success: true, message: "Lesson completed! +120 XP", xp_awarded: 120, ... }
}
```

### Get Next Lesson

```javascript
async function getNextLesson(userId, pathSlug) {
  const response = await fetch(
    `http://localhost:5001/api/learning/next-lesson/${userId}/${pathSlug}`
  );

  const data = await response.json();
  return data.nextLesson;
}
```

## Best Practices

### 1. Award XP Consistently

```javascript
// Good: Consistent XP rewards
const XP_REWARDS = {
  lesson_easy: 100,
  lesson_medium: 120,
  lesson_hard: 150,
  challenge: 200,
  daily_login: 10
};

awardXP(userId, XP_REWARDS.lesson_medium, 'Completed lesson');
```

### 2. Provide Feedback

```javascript
async function awardXPWithFeedback(userId, amount, reason) {
  const result = await awardXP(userId, amount, reason);

  // Show notification
  showNotification(`+${result.awarded} XP`, 'success');

  // Check for level up
  if (result.leveledUp) {
    showLevelUpModal(result.level);
    playSound('level-up');
  }

  return result;
}
```

### 3. Handle Errors

```javascript
async function safeAwardXP(userId, amount, reason) {
  try {
    return await awardXP(userId, amount, reason);
  } catch (error) {
    console.error('Failed to award XP:', error);
    // Store for retry later
    queueXPAward(userId, amount, reason);
    return null;
  }
}
```

## Summary

You've learned:
- ✅ How the CalOS RPG system works (players, XP, levels, achievements)
- ✅ How to award XP using MCP tools
- ✅ How to get player stats and track progression
- ✅ How to build gamified learning experiences

## Next Lesson

**Lesson 5: File System Tools**

Learn how to safely read, write, and list files using MCP tools.

## Quiz

1. How much XP is needed to reach the next level?
   - a) 50 XP
   - b) 100 XP
   - c) 1000 XP
   - d) It varies by level

2. Which MCP tool gets player stats?
   - a) get_player_stats
   - b) rpg_get_player
   - c) player_info
   - d) user_stats

3. What happens when a player levels up?
   - a) XP resets to 0
   - b) Level increases, XP continues from overflow
   - c) Nothing, just a visual effect
   - d) They lose all XP

**Answers:** 1-b, 2-b, 3-b

---

**🎴 Achievement Unlocked:** RPG Master (+120 XP)
