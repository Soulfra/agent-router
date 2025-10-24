# Lesson 10: Final Project - Full Game Loop

**Track:** RPG & Card Game Development
**Lesson:** 10 of 10
**XP Reward:** 150
**Time:** 60 minutes
**Prerequisites:** All previous lessons (1-9)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Build a complete card game app
- ✅ Integrate all systems (cards, quests, progression, leaderboards)
- ✅ Create polished UI/UX
- ✅ Handle state management
- ✅ Deploy your game

## Final Project Requirements

Build a complete card game application with:

1. **Player Dashboard**
   - Display level, XP, stats
   - Show card collection
   - View quests and achievements

2. **Pack Opening System**
   - Select pack type
   - Animated card reveals
   - Add to collection

3. **Code Roasting**
   - Submit code for review
   - Vote on others' code
   - Track voting history

4. **Progression**
   - XP tracking
   - Level-up animations
   - Quest completion

5. **Leaderboards**
   - View top players
   - See your rank
   - Filter by category

## Complete App Structure

```html
<!DOCTYPE html>
<html>
<head>
  <title>CalOS Card Game</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: monospace;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }

    .nav {
      background: #1a1a2e;
      padding: 15px;
      border-radius: 10px;
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .nav-btn {
      padding: 10px 20px;
      background: #2a2a3e;
      border: none;
      border-radius: 5px;
      color: #e0e0e0;
      cursor: pointer;
      font-family: monospace;
    }

    .nav-btn.active {
      background: #667eea;
    }

    .view {
      display: none;
    }

    .view.active {
      display: block;
    }

    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }

    .widget {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 10px;
    }

    .stat-large {
      font-size: 48px;
      font-weight: bold;
      color: #ffd700;
      text-align: center;
      margin: 20px 0;
    }

    button {
      padding: 12px 24px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-family: monospace;
      font-size: 14px;
    }

    button:hover {
      background: #764ba2;
    }

    .card-mini {
      display: inline-block;
      background: linear-gradient(135deg, #667eea, #764ba2);
      padding: 10px;
      border-radius: 8px;
      margin: 5px;
      min-width: 80px;
      text-align: center;
    }

    .card-mini.legendary {
      background: linear-gradient(135deg, #ffd700, #ff8c00);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎴 CalOS Card Game</h1>

    <nav class="nav">
      <button class="nav-btn active" onclick="showView('dashboard')">Dashboard</button>
      <button class="nav-btn" onclick="showView('packs')">Open Packs</button>
      <button class="nav-btn" onclick="showView('collection')">Collection</button>
      <button class="nav-btn" onclick="showView('roasting')">Code Roasting</button>
      <button class="nav-btn" onclick="showView('quests')">Quests</button>
      <button class="nav-btn" onclick="showView('leaderboard')">Leaderboard</button>
    </nav>

    <!-- Dashboard View -->
    <div id="dashboard" class="view active">
      <div class="dashboard-grid">
        <div class="widget">
          <h2>Player Stats</h2>
          <div class="stat-large" id="playerLevel">1</div>
          <div style="text-align: center;">
            <p id="playerXP">0 / 100 XP</p>
            <p>Total XP: <span id="totalXP">0</span></p>
          </div>
        </div>

        <div class="widget">
          <h2>Collection</h2>
          <p><strong>Total Cards:</strong> <span id="totalCards">0</span></p>
          <p><strong>Unique:</strong> <span id="uniqueCards">0</span></p>
          <p><strong>Legendaries:</strong> <span id="legendaries">0</span></p>
        </div>

        <div class="widget">
          <h2>Quick Actions</h2>
          <button onclick="showView('packs')">Open a Pack</button>
          <button onclick="showView('roasting')">Submit Code</button>
          <button onclick="loadProgress()">Refresh Stats</button>
        </div>

        <div class="widget">
          <h2>Active Quests</h2>
          <div id="activeQuests">Loading...</div>
        </div>
      </div>
    </div>

    <!-- Other Views (simplified for brevity) -->
    <div id="packs" class="view">
      <h2>Open Packs</h2>
      <p>Pack opening interface here...</p>
    </div>

    <div id="collection" class="view">
      <h2>Card Collection</h2>
      <p>Collection display here...</p>
    </div>

    <div id="roasting" class="view">
      <h2>Code Roasting</h2>
      <p>Submit and vote on code here...</p>
    </div>

    <div id="quests" class="view">
      <h2>Quests</h2>
      <p>Quest board here...</p>
    </div>

    <div id="leaderboard" class="view">
      <h2>Leaderboard</h2>
      <p>Rankings here...</p>
    </div>
  </div>

  <script>
    const userId = 'demo-user';

    function showView(viewName) {
      // Hide all views
      document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
      });

      // Show selected view
      document.getElementById(viewName).classList.add('active');

      // Update nav buttons
      document.querySelectorAll('.nav-btn').forEach((btn, i) => {
        btn.classList.remove('active');
      });
      event.target.classList.add('active');

      // Load view data
      loadViewData(viewName);
    }

    async function loadViewData(viewName) {
      switch (viewName) {
        case 'dashboard':
          await loadProgress();
          break;
        case 'packs':
          // Load available packs
          break;
        case 'collection':
          // Load card collection
          break;
        // ... other cases
      }
    }

    async function loadProgress() {
      try {
        // Load player stats
        const playerRes = await fetch(`http://localhost:5001/api/gaming/player/${userId}`);
        const playerData = await playerRes.json();

        if (playerData.success) {
          document.getElementById('playerLevel').textContent = `Level ${playerData.level}`;
          document.getElementById('playerXP').textContent = `${playerData.xp} / 100 XP`;
          document.getElementById('totalXP').textContent = playerData.totalXp;
          document.getElementById('totalCards').textContent = playerData.cardsOwned;
          document.getElementById('uniqueCards').textContent = playerData.uniqueCards || 0;
          document.getElementById('legendaries').textContent = playerData.legendariesOwned;
        }

        // Load quests
        const questsRes = await fetch(`http://localhost:5001/api/gaming/quests/${userId}`);
        const questsData = await questsRes.json();

        if (questsData.success) {
          displayActiveQuests(questsData.dailyQuests.slice(0, 3));
        }

      } catch (error) {
        console.error('Error loading progress:', error);
      }
    }

    function displayActiveQuests(quests) {
      const container = document.getElementById('activeQuests');

      if (quests.length === 0) {
        container.innerHTML = '<p>No active quests</p>';
        return;
      }

      const html = quests.map(q => `
        <div style="margin: 10px 0;">
          <strong>${q.name}</strong><br>
          ${q.progress} / ${q.target} (${Math.round((q.progress / q.target) * 100)}%)
        </div>
      `).join('');

      container.innerHTML = html;
    }

    // Load dashboard on start
    loadProgress();
  </script>
</body>
</html>
```

## Deployment Checklist

- [ ] All APIs connected
- [ ] Error handling implemented
- [ ] Loading states added
- [ ] Responsive design
- [ ] Cross-browser tested
- [ ] Performance optimized

## Summary

**Congratulations! You've completed the RPG & Card Game Development track!**

You've learned:
- ✅ Card game mechanics and systems
- ✅ Fetch API and async patterns
- ✅ Pack opening and collection management
- ✅ Code roasting and voting
- ✅ RPG progression integration
- ✅ Quest and achievement systems
- ✅ Leaderboard integration
- ✅ Building complete web applications

## Final Quiz

1. What's the most important part of a game?
   - a) Graphics
   - b) User experience
   - c) Features
   - d) All of the above

2. How should you handle API errors?
   - a) Ignore them
   - b) Show user-friendly messages
   - c) Crash the app
   - d) Log to console only

3. What makes a good card game?
   - a) Balance
   - b) Progression
   - c) Social features
   - d) All of the above

**Answers:** 1-d, 2-b, 3-d

---

**🎴 Achievement Unlocked:** Game Master (+150 XP)
**🏆 Track Complete:** RPG & Card Game Development (Total: 1,310 XP)

## What's Next?

- Explore Zero-Dependency Track
- Learn Multi-Tier System architecture
- Build your own custom features
- Share your game with the community!
