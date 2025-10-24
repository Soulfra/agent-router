# Lesson 8: Achievements & Badges

**Track:** RPG & Card Game Development
**Lesson:** 8 of 10
**XP Reward:** 120
**Time:** 30 minutes
**Prerequisites:** Lesson 7 (Quest System)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Understand the achievement system
- ✅ Unlock badges and trophies
- ✅ Display achievement UI
- ✅ Track achievement progress
- ✅ Share achievements

## Achievement Types

### Collection Achievements
- First Card - Open your first pack
- 100 Cards - Own 100 cards
- Legendary Hunter - Own 10 legendaries
- Full Set - Complete a full season set

### Skill Achievements
- Code Master - Get 10/10 on 5 submissions
- Voting Champion - Vote on 100 submissions
- Pack Opener - Open 50 packs
- Perfect Score - Get 10/10 average on submission

### Progression Achievements
- Level 10 - Reach level 10
- Level 25 - Reach level 25
- Level 50 - Reach level 50
- XP Master - Earn 10,000 total XP

### Social Achievements
- Helpful Reviewer - Get 50 helpful votes
- Community Leader - Help 10 new players
- Popular Coder - Get 100+ votes on one submission

## Achievements API

### Get Player Achievements

```javascript
GET /api/learning/achievements/:userId

// Response
{
  achievements: [
    {
      achievementId: 'first_card',
      name: 'First Card',
      description: 'Opened your first pack',
      icon: '🎴',
      unlockedAt: '2025-01-15T10:30:00Z',
      rarity: 'common'
    }
  ],
  total: 45,
  unlocked: 12,
  points: 350
}
```

## Lab: Achievement Showcase

```html
<!DOCTYPE html>
<html>
<head>
  <title>Achievements</title>
  <style>
    body {
      font-family: monospace;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .achievement-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }

    .achievement {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
      transition: transform 0.2s;
    }

    .achievement:hover {
      transform: translateY(-5px);
    }

    .achievement.unlocked {
      border: 2px solid #ffd700;
    }

    .achievement.locked {
      opacity: 0.5;
      filter: grayscale(100%);
    }

    .achievement-icon {
      font-size: 64px;
      margin: 10px 0;
    }

    .achievement-name {
      font-size: 18px;
      font-weight: bold;
      margin: 10px 0;
    }

    .achievement-date {
      font-size: 12px;
      color: #888;
    }

    .stats {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 10px;
      margin: 20px 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 36px;
      font-weight: bold;
      color: #64ffda;
    }
  </style>
</head>
<body>
  <h1>🏆 Achievements</h1>

  <div class="stats" id="stats"></div>
  <div class="achievement-grid" id="achievements"></div>

  <script>
    async function loadAchievements() {
      const userId = 'demo-user';

      try {
        const response = await fetch(`http://localhost:5001/api/learning/achievements/${userId}`);
        const data = await response.json();

        if (data.success) {
          displayStats(data);
          displayAchievements(data.achievements);
        }
      } catch (error) {
        console.error('Error:', error);
      }
    }

    function displayStats(data) {
      const stats = document.getElementById('stats');

      stats.innerHTML = `
        <div class="stat">
          <div class="stat-value">${data.unlocked}</div>
          <div>Unlocked</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.total}</div>
          <div>Total</div>
        </div>
        <div class="stat">
          <div class="stat-value">${Math.round((data.unlocked / data.total) * 100)}%</div>
          <div>Complete</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.points}</div>
          <div>Points</div>
        </div>
      `;
    }

    function displayAchievements(achievements) {
      const grid = document.getElementById('achievements');

      const allAchievements = [
        { id: 'first_card', name: 'First Card', icon: '🎴', desc: 'Open your first pack' },
        { id: 'level_10', name: 'Level 10', icon: '⭐', desc: 'Reach level 10' },
        { id: 'vote_100', name: 'Voting Champion', icon: '🗳️', desc: 'Vote 100 times' },
        { id: 'legendary', name: 'Legendary Hunter', icon: '👑', desc: 'Own 10 legendaries' },
        { id: 'code_master', name: 'Code Master', icon: '💻', desc: 'Get 5 perfect scores' }
      ];

      const html = allAchievements.map(ach => {
        const unlocked = achievements.find(a => a.achievementId === ach.id);

        return `
          <div class="achievement ${unlocked ? 'unlocked' : 'locked'}">
            <div class="achievement-icon">${ach.icon}</div>
            <div class="achievement-name">${ach.name}</div>
            <p>${ach.desc}</p>
            ${unlocked ? `<div class="achievement-date">Unlocked: ${new Date(unlocked.unlockedAt).toLocaleDateString()}</div>` : '<div class="achievement-date">🔒 Locked</div>'}
          </div>
        `;
      }).join('');

      grid.innerHTML = html;
    }

    loadAchievements();
  </script>
</body>
</html>
```

Save as `public/labs/achievements.html`.

## Summary

You've learned:
- ✅ Achievement types and categories
- ✅ How to track and unlock achievements
- ✅ How to display achievement UI
- ✅ Achievement progression system

## Next Lesson

**Lesson 9: Leaderboards**

Build competitive leaderboards using the Leaderboard API.

## Quiz

1. What are achievement points for?
   - a) Buy items
   - b) Track progress
   - c) Level up
   - d) Nothing

2. Can you lose achievements?
   - a) Yes, if you lose cards
   - b) No, permanent once unlocked
   - c) After 30 days
   - d) Only legendary ones

3. What's the rarest achievement type?
   - a) Common
   - b) Uncommon
   - c) Rare
   - d) Legendary

**Answers:** 1-b, 2-b, 3-d

---

**🎴 Achievement Unlocked:** Badge Collector (+120 XP)
