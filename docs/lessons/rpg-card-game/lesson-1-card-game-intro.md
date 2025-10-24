# Lesson 1: Understanding the Card Game System

**Track:** RPG & Card Game Development
**Lesson:** 1 of 10
**XP Reward:** 100
**Time:** 25 minutes
**Prerequisites:** None

## Learning Objectives

By the end of this lesson, you will:
- ✅ Understand the CalOS card game mechanics
- ✅ Know card types, rarities, and stats
- ✅ Learn how packs and collections work
- ✅ Understand the roasting/voting system
- ✅ See how cards tie to code quality

## What is the Card Game?

The CalOS Card Game gamifies code review and learning:

**Core Concept:**
- Submit code → Get roasted by peers → Earn cards based on quality
- Better code = Rarer cards
- Build collections, trade cards, compete on leaderboards

Think: **Pokemon cards meet code review**

## Card Anatomy

### Card Properties

Every card has:

```javascript
{
  cardId: 'card_001',
  name: 'Master Debugger',
  description: 'Can spot bugs from a mile away',
  rarity: 'legendary',     // common, uncommon, rare, epic, legendary
  attack: 95,
  defense: 85,
  special: 90,
  imageUrl: '/cards/master-debugger.png',
  category: 'debugging',
  series: 'Season 1',
  edition: 1
}
```

### Card Rarities

| Rarity | Drop Rate | Power Range | Value |
|--------|-----------|-------------|-------|
| Common | 60% | 20-40 | Low |
| Uncommon | 25% | 41-60 | Medium |
| Rare | 10% | 61-80 | High |
| Epic | 4% | 81-95 | Very High |
| Legendary | 1% | 96-100 | Extreme |

### Card Stats

**Attack:** Offensive power in battles
**Defense:** Protection from attacks
**Special:** Unique ability strength

Total power = Attack + Defense + Special (0-300 max)

## How to Get Cards

### 1. Submit Code for Review

```javascript
// Submit your code
POST /api/gaming/submit-code
{
  userId: 'user123',
  code: 'function add(a, b) { return a + b; }',
  language: 'javascript',
  description: 'Simple addition function'
}

// Response: Submission created, awaiting votes
```

### 2. Community Votes (Roasting)

```javascript
// Others vote on your code quality
POST /api/gaming/vote-code
{
  submissionId: 'sub_001',
  voterId: 'voter456',
  score: 8,           // 1-10
  comment: 'Clean and simple!'
}
```

### 3. Get Rewards

```javascript
// After 10 votes, get card pack
GET /api/gaming/check-rewards/user123

// Response:
{
  eligible: true,
  packType: 'rare',    // Based on average score
  avgScore: 8.2
}
```

### 4. Open Pack

```javascript
// Open your earned pack
POST /api/gaming/open-pack
{
  userId: 'user123',
  packType: 'rare'
}

// Response: 3 cards (1 guaranteed rare or better)
{
  cards: [
    { name: 'Bug Hunter', rarity: 'rare', attack: 70 },
    { name: 'Code Reviewer', rarity: 'uncommon', attack: 55 },
    { name: 'Junior Dev', rarity: 'common', attack: 35 }
  ]
}
```

## Card Packs

### Pack Types

**Starter Pack** (Free)
- 5 common cards
- Given to new players

**Standard Pack**
- 3 cards
- 60% common, 30% uncommon, 10% rare

**Rare Pack** (Earned with good code)
- 3 cards
- 1 guaranteed rare or better
- 40% rare, 10% epic

**Epic Pack** (Earned with great code)
- 3 cards
- 1 guaranteed epic or better
- 60% epic, 40% legendary

**Legendary Pack** (Special events)
- 5 cards
- 1 guaranteed legendary
- Rest are epic+

## The Roasting System

### How Voting Works

1. **Submit Code:** Share your code with the community
2. **Get Roasted:** Others rate 1-10 and leave comments
3. **Earn Rewards:** Average score determines pack rarity
4. **Learn:** Read feedback to improve

### Voting Scale

| Score | Meaning | Example |
|-------|---------|---------|
| 1-2 | Terrible | Major bugs, unreadable |
| 3-4 | Poor | Works but messy |
| 5-6 | Average | Functional, could improve |
| 7-8 | Good | Clean, well-structured |
| 9-10 | Excellent | Production-ready, exemplary |

### Anti-Gaming Measures

- **Must vote on 5 submissions before submitting yours**
- **Can't vote on your own code**
- **Outlier votes are flagged** (prevents fake 10s)
- **Abusers are banned**

## Lab: Explore the Card Database

Let's look at available cards using the Gaming API.

### HTML Interface

```html
<!DOCTYPE html>
<html>
<head>
  <title>Card Gallery</title>
  <style>
    body {
      font-family: monospace;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }

    .card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 15px;
      padding: 20px;
      box-shadow: 0 10px 20px rgba(0,0,0,0.3);
      transition: transform 0.2s;
    }

    .card:hover {
      transform: translateY(-5px);
    }

    .card.common { background: linear-gradient(135deg, #555, #777); }
    .card.uncommon { background: linear-gradient(135deg, #00ff00, #00aa00); }
    .card.rare { background: linear-gradient(135deg, #0099ff, #0066cc); }
    .card.epic { background: linear-gradient(135deg, #ff00ff, #aa00aa); }
    .card.legendary { background: linear-gradient(135deg, #ffd700, #ff8c00); }

    .card-name {
      font-size: 20px;
      font-weight: bold;
      margin: 10px 0;
    }

    .card-rarity {
      font-size: 12px;
      text-transform: uppercase;
      opacity: 0.8;
    }

    .card-stats {
      margin: 15px 0;
      display: flex;
      justify-content: space-between;
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 24px;
      font-weight: bold;
    }

    .stat-label {
      font-size: 10px;
      opacity: 0.8;
    }

    button {
      padding: 10px 20px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      margin: 5px;
    }

    button:hover {
      background: #764ba2;
    }
  </style>
</head>
<body>
  <h1>🎴 Card Gallery</h1>

  <div>
    <button onclick="loadCards('all')">All Cards</button>
    <button onclick="loadCards('common')">Common</button>
    <button onclick="loadCards('rare')">Rare</button>
    <button onclick="loadCards('legendary')">Legendary</button>
  </div>

  <div class="card-grid" id="cardGrid">
    <p>Click a button to load cards...</p>
  </div>

  <script>
    async function loadCards(rarity) {
      const grid = document.getElementById('cardGrid');
      grid.innerHTML = '<p>Loading cards...</p>';

      try {
        // Note: This is a mock - you'll need to implement the actual API
        const cards = generateMockCards(rarity);
        displayCards(cards);
      } catch (error) {
        grid.innerHTML = `<p style="color: #ff6b6b;">Error: ${error.message}</p>`;
      }
    }

    function generateMockCards(rarity) {
      // Mock data for demonstration
      const cardTemplates = [
        { name: 'Bug Squasher', category: 'debugging' },
        { name: 'Code Ninja', category: 'speed' },
        { name: 'Refactor Master', category: 'optimization' },
        { name: 'Test Writer', category: 'quality' },
        { name: 'Design Wizard', category: 'architecture' }
      ];

      return cardTemplates.map((template, i) => ({
        cardId: `card_${i}`,
        name: template.name,
        description: `A powerful ${template.category} card`,
        rarity: rarity === 'all' ? ['common', 'rare', 'legendary'][i % 3] : rarity,
        attack: 50 + Math.floor(Math.random() * 50),
        defense: 50 + Math.floor(Math.random() * 50),
        special: 50 + Math.floor(Math.random() * 50),
        category: template.category
      }));
    }

    function displayCards(cards) {
      const grid = document.getElementById('cardGrid');

      const html = cards.map(card => `
        <div class="card ${card.rarity}">
          <div class="card-rarity">${card.rarity}</div>
          <div class="card-name">${card.name}</div>
          <div>${card.description}</div>
          <div class="card-stats">
            <div class="stat">
              <div class="stat-value">${card.attack}</div>
              <div class="stat-label">ATK</div>
            </div>
            <div class="stat">
              <div class="stat-value">${card.defense}</div>
              <div class="stat-label">DEF</div>
            </div>
            <div class="stat">
              <div class="stat-value">${card.special}</div>
              <div class="stat-label">SPL</div>
            </div>
          </div>
        </div>
      `).join('');

      grid.innerHTML = html;
    }

    // Load common cards by default
    loadCards('all');
  </script>
</body>
</html>
```

Save as `public/labs/card-gallery.html`.

## Summary

You've learned:
- ✅ How the card game works (submit code → get roasted → earn cards)
- ✅ Card properties (rarity, stats, types)
- ✅ How to earn packs through code quality
- ✅ The roasting/voting system mechanics

## Next Lesson

**Lesson 2: Fetch API Basics**

Learn how to call the Gaming API using vanilla JavaScript fetch().

## Quiz

1. What determines which pack you get?
   - a) Random chance
   - b) Average vote score on your code
   - c) Number of submissions
   - d) Your player level

2. How many votes are needed before rewards?
   - a) 5 votes
   - b) 10 votes
   - c) 20 votes
   - d) Instant

3. What's the rarest card type?
   - a) Epic
   - b) Rare
   - c) Legendary
   - d) Mythic

**Answers:** 1-b, 2-b, 3-c

---

**🎴 Achievement Unlocked:** Card Collector Beginner (+100 XP)
