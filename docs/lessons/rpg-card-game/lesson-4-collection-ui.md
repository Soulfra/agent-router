# Lesson 4: Card Collection UI

**Track:** RPG & Card Game Development
**Lesson:** 4 of 10
**XP Reward:** 130
**Time:** 45 minutes
**Prerequisites:** Lesson 3 (Open Packs)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Build a card collection display
- ✅ Implement filtering by rarity
- ✅ Add sorting by stats
- ✅ Create search functionality
- ✅ Show collection statistics

## Collection API

### Get Player Collection

```javascript
GET /api/gaming/collection/:userId

// Response
{
  success: true,
  collection: [
    {
      cardId: 'card_001',
      name: 'Bug Slayer',
      rarity: 'rare',
      attack: 75,
      defense: 68,
      special: 82,
      quantity: 2,  // How many copies owned
      acquiredAt: '2025-01-15T10:30:00Z'
    }
    // ... more cards
  ],
  stats: {
    totalCards: 45,
    uniqueCards: 23,
    commonCount: 30,
    uncommonCount: 10,
    rareCount: 4,
    epicCount: 1,
    legendaryCount: 0
  }
}
```

## Lab: Collection Manager

Build a full-featured card collection UI:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Card Collection</title>
  <style>
    body {
      font-family: monospace;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .controls {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 20px;
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
      align-items: center;
    }

    select, input {
      padding: 10px;
      background: #2a2a3e;
      color: #e0e0e0;
      border: 1px solid #667eea;
      border-radius: 5px;
      font-family: monospace;
    }

    .stats {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 20px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
    }

    .stat-box {
      text-align: center;
      padding: 15px;
      background: #2a2a3e;
      border-radius: 5px;
    }

    .stat-value {
      font-size: 32px;
      font-weight: bold;
      color: #64ffda;
    }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 20px;
    }

    .card {
      background: linear-gradient(135deg, #667eea, #764ba2);
      border-radius: 15px;
      padding: 20px;
      transition: transform 0.2s;
      cursor: pointer;
      position: relative;
    }

    .card:hover {
      transform: translateY(-5px);
    }

    .card.common { background: linear-gradient(135deg, #555, #777); }
    .card.uncommon { background: linear-gradient(135deg, #00ff00, #00aa00); }
    .card.rare { background: linear-gradient(135deg, #0099ff, #0066cc); }
    .card.epic { background: linear-gradient(135deg, #ff00ff, #aa00aa); }
    .card.legendary { background: linear-gradient(135deg, #ffd700, #ff8c00); }

    .card-quantity {
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(0,0,0,0.7);
      padding: 5px 10px;
      border-radius: 15px;
      font-size: 12px;
    }

    .card-name {
      font-size: 16px;
      font-weight: bold;
      margin: 10px 0;
    }

    .card-stats {
      display: flex;
      justify-content: space-around;
      margin-top: 10px;
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
  </style>
</head>
<body>
  <h1>🎴 Card Collection</h1>

  <div class="controls">
    <input type="text" id="userId" placeholder="User ID" value="demo-user">
    <button onclick="loadCollection()">Load Collection</button>

    <select id="filterRarity" onchange="applyFilters()">
      <option value="all">All Rarities</option>
      <option value="common">Common</option>
      <option value="uncommon">Uncommon</option>
      <option value="rare">Rare</option>
      <option value="epic">Epic</option>
      <option value="legendary">Legendary</option>
    </select>

    <select id="sortBy" onchange="applyFilters()">
      <option value="name">Sort by Name</option>
      <option value="attack">Sort by Attack</option>
      <option value="defense">Sort by Defense</option>
      <option value="special">Sort by Special</option>
      <option value="total">Sort by Total Power</option>
      <option value="rarity">Sort by Rarity</option>
    </select>

    <input type="text" id="search" placeholder="Search cards..." oninput="applyFilters()">
  </div>

  <div class="stats" id="stats"></div>
  <div class="card-grid" id="cardGrid"></div>

  <script>
    let fullCollection = [];

    async function loadCollection() {
      const userId = document.getElementById('userId').value;
      const cardGrid = document.getElementById('cardGrid');

      cardGrid.innerHTML = '<p>Loading collection...</p>';

      try {
        const response = await fetch(`http://localhost:5001/api/gaming/collection/${userId}`);
        const data = await response.json();

        if (data.success) {
          fullCollection = data.collection;
          displayStats(data.stats);
          applyFilters();
        } else {
          cardGrid.innerHTML = `<p style="color: #ff6b6b;">Error: ${data.error}</p>`;
        }
      } catch (error) {
        cardGrid.innerHTML = `<p style="color: #ff6b6b;">Error: ${error.message}</p>`;
      }
    }

    function displayStats(stats) {
      const statsDiv = document.getElementById('stats');

      statsDiv.innerHTML = `
        <div class="stat-box">
          <div class="stat-value">${stats.totalCards}</div>
          <div>Total Cards</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${stats.uniqueCards}</div>
          <div>Unique Cards</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${stats.commonCount}</div>
          <div>Common</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${stats.uncommonCount}</div>
          <div>Uncommon</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${stats.rareCount}</div>
          <div>Rare</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${stats.epicCount}</div>
          <div>Epic</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${stats.legendaryCount}</div>
          <div>Legendary</div>
        </div>
      `;
    }

    function applyFilters() {
      const filterRarity = document.getElementById('filterRarity').value;
      const sortBy = document.getElementById('sortBy').value;
      const search = document.getElementById('search').value.toLowerCase();

      let filtered = fullCollection;

      // Filter by rarity
      if (filterRarity !== 'all') {
        filtered = filtered.filter(card => card.rarity === filterRarity);
      }

      // Filter by search
      if (search) {
        filtered = filtered.filter(card =>
          card.name.toLowerCase().includes(search)
        );
      }

      // Sort
      filtered = [...filtered].sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'attack':
            return b.attack - a.attack;
          case 'defense':
            return b.defense - a.defense;
          case 'special':
            return b.special - a.special;
          case 'total':
            const totalA = a.attack + a.defense + a.special;
            const totalB = b.attack + b.defense + b.special;
            return totalB - totalA;
          case 'rarity':
            const rarityOrder = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
            return rarityOrder[b.rarity] - rarityOrder[a.rarity];
          default:
            return 0;
        }
      });

      displayCards(filtered);
    }

    function displayCards(cards) {
      const cardGrid = document.getElementById('cardGrid');

      if (cards.length === 0) {
        cardGrid.innerHTML = '<p>No cards found.</p>';
        return;
      }

      const html = cards.map(card => `
        <div class="card ${card.rarity}">
          <div class="card-quantity">×${card.quantity}</div>
          <div style="font-size: 12px; text-transform: uppercase; opacity: 0.8;">${card.rarity}</div>
          <div class="card-name">${card.name}</div>
          <div class="card-stats">
            <div style="text-align: center;">
              <div style="font-size: 20px; font-weight: bold;">${card.attack}</div>
              <div style="font-size: 10px;">ATK</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 20px; font-weight: bold;">${card.defense}</div>
              <div style="font-size: 10px;">DEF</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 20px; font-weight: bold;">${card.special}</div>
              <div style="font-size: 10px;">SPL</div>
            </div>
          </div>
        </div>
      `).join('');

      cardGrid.innerHTML = html;
    }

    // Load on page load
    window.addEventListener('load', loadCollection);
  </script>
</body>
</html>
```

Save as `public/labs/card-collection.html`.

## Summary

You've learned:
- ✅ How to fetch player collections
- ✅ How to filter and sort cards
- ✅ How to implement search
- ✅ How to display collection stats

## Next Lesson

**Lesson 5: Roasting System - Vote on Code**

Learn how to build the voting interface for the code roasting system.

## Quiz

1. What does the quantity field represent?
   - a) Card power
   - b) How many copies owned
   - c) Card rarity
   - d) Player level

2. How do you filter by multiple criteria?
   - a) One filter at a time only
   - b) Chain filter() calls
   - c) Use OR logic
   - d) Can't be done

3. What's the best way to sort by total power?
   - a) Sort by attack only
   - b) Sum all stats then compare
   - c) Use rarity
   - d) Random order

**Answers:** 1-b, 2-b, 3-b

---

**🎴 Achievement Unlocked:** Collection Master (+130 XP)
