# Lesson 6: RPG Player Progression

**Track:** RPG & Card Game Development
**Lesson:** 6 of 10
**XP Reward:** 120
**Time:** 30 minutes
**Prerequisites:** Lesson 5 (Roasting System)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Integrate RPG system with card game
- ✅ Track player levels and XP
- ✅ Award XP for game actions
- ✅ Display progression UI
- ✅ Unlock features by level

## Player Progression API

### Get Player Stats

```javascript
GET /api/gaming/player/:userId

// Response
{
  userId: 'user123',
  level: 15,
  xp: 450,        // Current level XP
  totalXp: 1450,  // Total XP earned
  cardsOwned: 87,
  legendariesOwned: 3,
  winRate: 65.5,
  gamesPlayed: 42,
  gamesWon: 28
}
```

### Award XP for Actions

```javascript
POST /api/learning/complete-lesson
{
  userId: 'user123',
  lessonId: 'rpg-lesson-6',
  score: 100
}

// Response: Awards XP automatically
{
  success: true,
  xp_awarded: 120,
  new_level: 16,
  leveled_up: true
}
```

## XP Earning Opportunities

| Action | XP Reward |
|--------|-----------|
| Open starter pack | 10 XP |
| Vote on code | 5 XP |
| Submit code | 20 XP |
| Get 5+ average score | 50 XP bonus |
| Get 8+ average score | 100 XP bonus |
| Open rare pack | 30 XP |
| Open legendary pack | 100 XP |
| Complete lesson | 100-150 XP |
| Win battle | 25 XP |
| Daily login | 10 XP |

## Level-Based Unlocks

```javascript
const levelUnlocks = {
  1: ['Open starter packs', 'Vote on code'],
  5: ['Submit code', 'Open standard packs'],
  10: ['Card battles', 'Trading'],
  15: ['Open rare packs', 'Advanced battles'],
  20: ['Open epic packs', 'Tournaments'],
  25: ['Open legendary packs', 'Create custom cards'],
  30: ['Guild features', 'Leaderboard competition']
};
```

## Lab: Player Progress Dashboard

```html
<!DOCTYPE html>
<html>
<head>
  <title>Player Progress</title>
  <style>
    body {
      font-family: monospace;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .progress-card {
      background: #1a1a2e;
      padding: 25px;
      border-radius: 15px;
      margin: 20px 0;
      border-left: 5px solid #667eea;
    }

    .level-display {
      font-size: 72px;
      font-weight: bold;
      color: #ffd700;
      text-align: center;
      margin: 20px 0;
      text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
    }

    .xp-bar {
      background: #2a2a3e;
      height: 40px;
      border-radius: 20px;
      overflow: hidden;
      margin: 20px 0;
      position: relative;
    }

    .xp-fill {
      background: linear-gradient(90deg, #667eea, #764ba2);
      height: 100%;
      transition: width 0.5s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }

    .stat-box {
      background: #2a2a3e;
      padding: 15px;
      border-radius: 10px;
      text-align: center;
    }

    .stat-value {
      font-size: 32px;
      font-weight: bold;
      color: #64ffda;
    }

    .unlocks-list {
      background: #2a2a3e;
      padding: 15px;
      border-radius: 10px;
      margin: 15px 0;
    }

    .unlock-item {
      padding: 10px;
      margin: 5px 0;
      border-left: 3px solid #00ff00;
      padding-left: 15px;
    }

    .unlock-item.locked {
      border-left-color: #666;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <h1>📊 Player Progression</h1>

  <input type="text" id="userId" placeholder="User ID" value="demo-user" style="padding: 10px; width: 200px;">
  <button onclick="loadProgress()" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">Load Progress</button>

  <div id="progressDisplay"></div>

  <script>
    async function loadProgress() {
      const userId = document.getElementById('userId').value;
      const display = document.getElementById('progressDisplay');

      display.innerHTML = '<p>Loading...</p>';

      try {
        const response = await fetch(`http://localhost:5001/api/gaming/player/${userId}`);
        const data = await response.json();

        if (data.success) {
          displayProgress(data);
        }
      } catch (error) {
        display.innerHTML = `<p style="color: #ff6b6b;">Error: ${error.message}</p>`;
      }
    }

    function displayProgress(player) {
      const xpPercent = (player.xp / 100) * 100;
      const nextLevel = player.level + 1;

      const html = `
        <div class="progress-card">
          <div class="level-display">LEVEL ${player.level}</div>

          <h3>XP Progress</h3>
          <div class="xp-bar">
            <div class="xp-fill" style="width: ${xpPercent}%">
              ${player.xp} / 100 XP
            </div>
          </div>
          <p style="text-align: center; color: #888;">
            ${100 - player.xp} XP needed for Level ${nextLevel}
          </p>

          <h3>Player Stats</h3>
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-value">${player.totalXp}</div>
              <div>Total XP</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${player.cardsOwned}</div>
              <div>Cards Owned</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${player.legendariesOwned}</div>
              <div>Legendaries</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${player.gamesWon}/${player.gamesPlayed}</div>
              <div>W/L Record</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${player.winRate.toFixed(1)}%</div>
              <div>Win Rate</div>
            </div>
          </div>

          <h3>Level Unlocks</h3>
          <div class="unlocks-list">
            ${generateUnlocks(player.level)}
          </div>
        </div>
      `;

      document.getElementById('progressDisplay').innerHTML = html;
    }

    function generateUnlocks(currentLevel) {
      const unlocks = {
        1: 'Open starter packs, Vote on code',
        5: 'Submit code, Open standard packs',
        10: 'Card battles, Trading',
        15: 'Open rare packs, Advanced battles',
        20: 'Open epic packs, Tournaments',
        25: 'Open legendary packs, Create custom cards',
        30: 'Guild features, Leaderboard competition'
      };

      return Object.entries(unlocks).map(([level, features]) => {
        const unlocked = currentLevel >= parseInt(level);
        return `
          <div class="unlock-item ${unlocked ? '' : 'locked'}">
            ${unlocked ? '✅' : '🔒'} Level ${level}: ${features}
          </div>
        `;
      }).join('');
    }

    loadProgress();
  </script>
</body>
</html>
```

Save as `public/labs/player-progress.html`.

## Summary

You've learned:
- ✅ How RPG progression ties to card game
- ✅ How to award XP for actions
- ✅ How to display progression UI
- ✅ Level-based unlock system

## Next Lesson

**Lesson 7: Quest System**

Learn how to create and complete quests for rewards.

## Quiz

1. How much XP to reach next level?
   - a) 50 XP
   - b) 100 XP
   - c) Varies by level
   - d) 1000 XP

2. What unlocks at level 10?
   - a) Submit code
   - b) Card battles
   - c) Legendary packs
   - d) Nothing

3. What gives the most XP?
   - a) Voting
   - b) Opening packs
   - c) Getting 8+ score average
   - d) Daily login

**Answers:** 1-b, 2-b, 3-c

---

**🎴 Achievement Unlocked:** Progress Tracker (+120 XP)
