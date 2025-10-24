# Lesson 9: Leaderboards

**Track:** RPG & Card Game Development
**Lesson:** 9 of 10
**XP Reward:** 130
**Time:** 35 minutes
**Prerequisites:** Lesson 8 (Achievements)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Use the Leaderboard API
- ✅ Display competitive rankings
- ✅ Filter by time windows
- ✅ Show player position
- ✅ Build leaderboard UI

## Leaderboard API

### Get Global Leaderboard

```javascript
GET /api/leaderboard/reputation?limit=100

// Response
{
  status: 'success',
  data: {
    leaderboard: [
      {
        rank: 1,
        userId: 'user123',
        username: 'CodeNinja',
        reputationScore: 985.5,
        totalVotes: 150,
        level: 25
      }
    ]
  }
}
```

### Get Your Rank

```javascript
GET /api/leaderboard/me

// Response
{
  rankings: {
    reputation: { rank: 42, score: 750.2 },
    usage: { rank: 15, uses: 523 },
    ai: { rank: 8, requests: 1200 }
  }
}
```

## Lab: Leaderboard Dashboard

```html
<!DOCTYPE html>
<html>
<head>
  <title>Leaderboards</title>
  <style>
    body {
      font-family: monospace;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .tabs {
      display: flex;
      gap: 10px;
      margin: 20px 0;
    }

    .tab {
      padding: 10px 20px;
      background: #2a2a3e;
      border: none;
      border-radius: 5px;
      color: #e0e0e0;
      cursor: pointer;
    }

    .tab.active {
      background: #667eea;
    }

    .leaderboard {
      background: #1a1a2e;
      border-radius: 10px;
      overflow: hidden;
    }

    .leaderboard-row {
      display: grid;
      grid-template-columns: 60px 1fr 120px 120px;
      padding: 15px;
      border-bottom: 1px solid #2a2a3e;
      align-items: center;
    }

    .leaderboard-row:hover {
      background: #2a2a3e;
    }

    .leaderboard-row.header {
      background: #2a2a3e;
      font-weight: bold;
    }

    .leaderboard-row.me {
      background: #3a3a4e;
      border-left: 4px solid #ffd700;
    }

    .rank {
      font-size: 24px;
      font-weight: bold;
      text-align: center;
    }

    .rank.top1 { color: #ffd700; }
    .rank.top2 { color: #c0c0c0; }
    .rank.top3 { color: #cd7f32; }

    .username {
      font-size: 16px;
    }

    .score {
      text-align: right;
      font-weight: bold;
      color: #64ffda;
    }
  </style>
</head>
<body>
  <h1>🏆 Leaderboards</h1>

  <div class="tabs">
    <button class="tab active" onclick="loadLeaderboard('reputation')">Reputation</button>
    <button class="tab" onclick="loadLeaderboard('usage')">Most Active</button>
    <button class="tab" onclick="loadLeaderboard('ai')">AI Power Users</button>
  </div>

  <div id="leaderboard"></div>

  <script>
    let currentType = 'reputation';
    let myUserId = 'demo-user';

    async function loadLeaderboard(type) {
      currentType = type;

      // Update tab styling
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
      });
      event.target.classList.add('active');

      const board = document.getElementById('leaderboard');
      board.innerHTML = '<p>Loading...</p>';

      try {
        const response = await fetch(`http://localhost:5001/api/leaderboard/${type}?limit=100`);
        const data = await response.json();

        if (data.status === 'success') {
          displayLeaderboard(data.data.leaderboard, type);
        }
      } catch (error) {
        board.innerHTML = `<p style="color: #ff6b6b;">Error: ${error.message}</p>`;
      }
    }

    function displayLeaderboard(entries, type) {
      const board = document.getElementById('leaderboard');

      const headers = {
        reputation: ['Rank', 'Player', 'Reputation', 'Votes'],
        usage: ['Rank', 'Player', 'Uses', 'Features'],
        ai: ['Rank', 'Player', 'Requests', 'Tokens']
      };

      const getScore = (entry, type) => {
        switch (type) {
          case 'reputation':
            return entry.reputationScore.toFixed(1);
          case 'usage':
            return entry.totalUses;
          case 'ai':
            return entry.totalRequests;
        }
      };

      const getSecondary = (entry, type) => {
        switch (type) {
          case 'reputation':
            return entry.totalVotes;
          case 'usage':
            return entry.uniqueFeatures;
          case 'ai':
            return (entry.totalTokens / 1000).toFixed(0) + 'k';
        }
      };

      const html = `
        <div class="leaderboard">
          <div class="leaderboard-row header">
            <div>${headers[type][0]}</div>
            <div>${headers[type][1]}</div>
            <div style="text-align: right;">${headers[type][2]}</div>
            <div style="text-align: right;">${headers[type][3]}</div>
          </div>
          ${entries.map(entry => `
            <div class="leaderboard-row ${entry.userId === myUserId ? 'me' : ''}">
              <div class="rank ${entry.rank <= 3 ? 'top' + entry.rank : ''}">#${entry.rank}</div>
              <div class="username">${entry.username}</div>
              <div class="score">${getScore(entry, type)}</div>
              <div class="score">${getSecondary(entry, type)}</div>
            </div>
          `).join('')}
        </div>
      `;

      board.innerHTML = html;
    }

    // Load reputation leaderboard on start
    loadLeaderboard('reputation');
  </script>
</body>
</html>
```

Save as `public/labs/leaderboards.html`.

## Summary

You've learned:
- ✅ How to use Leaderboard API
- ✅ How to display rankings
- ✅ How to highlight player position
- ✅ How to switch between leaderboard types

## Next Lesson

**Lesson 10: Final Project - Full Game Loop**

Build a complete card game application with all features integrated.

## Quiz

1. What's the default leaderboard limit?
   - a) 10
   - b) 50
   - c) 100
   - d) Unlimited

2. Can you filter leaderboards by time?
   - a) Yes (24h, week, all-time)
   - b) No
   - c) Only by month
   - d) Only all-time

3. What determines reputation rank?
   - a) Level
   - b) Cards owned
   - c) Reputation score
   - d) XP

**Answers:** 1-c, 2-a, 3-c

---

**🎴 Achievement Unlocked:** Competitive Player (+130 XP)
