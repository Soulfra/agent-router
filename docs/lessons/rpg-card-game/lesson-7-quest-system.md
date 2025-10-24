# Lesson 7: Quest System

**Track:** RPG & Card Game Development
**Lesson:** 7 of 10
**XP Reward:** 130
**Time:** 35 minutes
**Prerequisites:** Lesson 6 (Player Progression)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Create and manage quests
- ✅ Track quest progress
- ✅ Complete quests for rewards
- ✅ Build quest UI with fetch()
- ✅ Implement daily and weekly quests

## Quest System

### Quest Types

**Daily Quests** (Reset every 24 hours)
- Vote on 5 code submissions - Reward: 50 XP
- Open 2 packs - Reward: 30 XP
- Submit 1 code - Reward: 40 XP

**Weekly Quests** (Reset every Monday)
- Collect 10 rare+ cards - Reward: 200 XP + Rare Pack
- Win 5 battles - Reward: 150 XP
- Reach top 100 on leaderboard - Reward: Epic Pack

**Story Quests** (One-time)
- Complete all MCP Development lessons - Reward: 500 XP + Legendary Pack
- Collect all Season 1 cards - Reward: 1000 XP + Exclusive Card

## Quest API

### Get Active Quests

```javascript
GET /api/gaming/quests/:userId

// Response
{
  dailyQuests: [
    {
      questId: 'daily_vote_5',
      name: 'Code Reviewer',
      description: 'Vote on 5 code submissions',
      progress: 3,
      target: 5,
      reward: { xp: 50 },
      expiresAt: '2025-01-16T00:00:00Z'
    }
  ],
  weeklyQuests: [...],
  storyQuests: [...]
}
```

### Complete Quest

```javascript
POST /api/gaming/quests/complete
{
  userId: 'user123',
  questId: 'daily_vote_5'
}

// Response
{
  success: true,
  rewards: {
    xp: 50,
    packs: [],
    cards: []
  },
  message: 'Quest completed! +50 XP'
}
```

## Lab: Quest Board

```html
<!DOCTYPE html>
<html>
<head>
  <title>Quest Board</title>
  <style>
    body {
      font-family: monospace;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .quest-section {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 10px;
      margin: 20px 0;
    }

    .quest-card {
      background: #2a2a3e;
      padding: 15px;
      margin: 10px 0;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }

    .quest-card.daily { border-left-color: #00ff00; }
    .quest-card.weekly { border-left-color: #ffd700; }
    .quest-card.story { border-left-color: #ff00ff; }

    .quest-progress-bar {
      background: #1a1a2e;
      height: 20px;
      border-radius: 10px;
      overflow: hidden;
      margin: 10px 0;
    }

    .quest-progress-fill {
      background: linear-gradient(90deg, #667eea, #764ba2);
      height: 100%;
      transition: width 0.3s;
    }

    .quest-reward {
      background: #3a3a4e;
      padding: 8px 15px;
      border-radius: 15px;
      display: inline-block;
      margin: 5px;
      font-size: 12px;
    }

    button {
      padding: 10px 20px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    }

    button:hover {
      background: #764ba2;
    }

    button:disabled {
      background: #444;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <h1>📜 Quest Board</h1>

  <input type="text" id="userId" placeholder="User ID" value="demo-user" style="padding: 10px; width: 200px;">
  <button onclick="loadQuests()">Load Quests</button>

  <div id="questBoard"></div>

  <script>
    async function loadQuests() {
      const userId = document.getElementById('userId').value;
      const board = document.getElementById('questBoard');

      board.innerHTML = '<p>Loading quests...</p>';

      try {
        const response = await fetch(`http://localhost:5001/api/gaming/quests/${userId}`);
        const data = await response.json();

        if (data.success) {
          displayQuests(data);
        }
      } catch (error) {
        board.innerHTML = `<p style="color: #ff6b6b;">Error: ${error.message}</p>`;
      }
    }

    function displayQuests(data) {
      const board = document.getElementById('questBoard');

      const html = `
        ${renderQuestSection('Daily Quests', data.dailyQuests, 'daily')}
        ${renderQuestSection('Weekly Quests', data.weeklyQuests, 'weekly')}
        ${renderQuestSection('Story Quests', data.storyQuests, 'story')}
      `;

      board.innerHTML = html;
    }

    function renderQuestSection(title, quests, type) {
      if (!quests || quests.length === 0) {
        return `
          <div class="quest-section">
            <h2>${title}</h2>
            <p>No ${type} quests available.</p>
          </div>
        `;
      }

      return `
        <div class="quest-section">
          <h2>${title}</h2>
          ${quests.map(quest => renderQuest(quest, type)).join('')}
        </div>
      `;
    }

    function renderQuest(quest, type) {
      const progress = (quest.progress / quest.target) * 100;
      const completed = quest.progress >= quest.target;

      return `
        <div class="quest-card ${type}">
          <h3>${quest.name}</h3>
          <p>${quest.description}</p>

          <div class="quest-progress-bar">
            <div class="quest-progress-fill" style="width: ${progress}%"></div>
          </div>
          <p>${quest.progress} / ${quest.target}</p>

          <div>
            ${quest.reward.xp ? `<span class="quest-reward">🌟 ${quest.reward.xp} XP</span>` : ''}
            ${quest.reward.packs ? quest.reward.packs.map(p => `<span class="quest-reward">🎁 ${p} Pack</span>`).join('') : ''}
          </div>

          ${completed ?
            `<button onclick="completeQuest('${quest.questId}')">Claim Reward</button>` :
            `<button disabled>In Progress (${Math.round(progress)}%)</button>`
          }
        </div>
      `;
    }

    async function completeQuest(questId) {
      const userId = document.getElementById('userId').value;

      try {
        const response = await fetch('http://localhost:5001/api/gaming/quests/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, questId })
        });

        const data = await response.json();

        if (data.success) {
          alert(data.message);
          loadQuests(); // Refresh quest list
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }

    loadQuests();
  </script>
</body>
</html>
```

Save as `public/labs/quest-board.html`.

## Summary

You've learned:
- ✅ How quest system works
- ✅ How to track quest progress
- ✅ How to complete and claim rewards
- ✅ How to build quest UI

## Next Lesson

**Lesson 8: Achievements & Badges**

Learn about the achievement system and how to unlock badges.

## Quiz

1. When do daily quests reset?
   - a) Every hour
   - b) Every 24 hours
   - c) Every week
   - d) Never

2. What do you get for completing quests?
   - a) XP only
   - b) Packs only
   - c) XP, packs, or cards
   - d) Nothing

3. Can you do the same quest multiple times?
   - a) Yes, unlimited
   - b) Daily/weekly quests reset
   - c) Story quests repeat
   - d) Never

**Answers:** 1-b, 2-c, 3-b

---

**🎴 Achievement Unlocked:** Quest Master (+130 XP)
