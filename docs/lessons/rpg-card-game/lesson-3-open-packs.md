# Lesson 3: Opening Card Packs

**Track:** RPG & Card Game Development
**Lesson:** 3 of 10
**XP Reward:** 120
**Time:** 35 minutes
**Prerequisites:** Lesson 2 (Fetch Basics)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Open card packs via API
- ✅ Display pack opening animations
- ✅ Show card reveals with effects
- ✅ Add cards to player collection
- ✅ Build engaging UI/UX

## Opening Packs API

### Endpoint

```javascript
POST /api/gaming/open-pack
{
  userId: 'user123',
  packType: 'rare'  // starter, standard, rare, epic, legendary
}

// Response
{
  success: true,
  cards: [
    {
      cardId: 'card_042',
      name: 'Bug Slayer',
      rarity: 'rare',
      attack: 75,
      defense: 68,
      special: 82
    },
    // ... more cards
  ],
  packType: 'rare',
  openedAt: '2025-01-15T10:30:00Z'
}
```

### Check Available Packs

```javascript
GET /api/gaming/packs/user123

// Response
{
  packs: [
    { packType: 'starter', quantity: 1 },
    { packType: 'rare', quantity: 3 }
  ],
  totalPacks: 4
}
```

## Example: Open Pack Function

```javascript
async function openPack(userId, packType) {
  try {
    const response = await fetch('http://localhost:5001/api/gaming/open-pack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: userId,
        packType: packType
      })
    });

    if (!response.ok) {
      throw new Error('Failed to open pack');
    }

    const data = await response.json();

    if (data.success) {
      console.log(`Opened ${data.packType} pack!`);
      console.log(`Got ${data.cards.length} cards:`);

      data.cards.forEach(card => {
        console.log(`  - [${card.rarity.toUpperCase()}] ${card.name} (${card.attack}/${card.defense}/${card.special})`);
      });

      return data.cards;
    }

  } catch (error) {
    console.error('Error opening pack:', error);
    return null;
  }
}
```

## Lab: Pack Opening UI

Create an animated pack opening experience:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Open Packs</title>
  <style>
    body {
      font-family: monospace;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .pack-selector {
      display: flex;
      gap: 15px;
      margin: 20px 0;
      flex-wrap: wrap;
    }

    .pack-button {
      padding: 20px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      border: none;
      border-radius: 10px;
      color: white;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      transition: transform 0.2s;
    }

    .pack-button:hover {
      transform: scale(1.05);
    }

    .pack-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .card-reveal {
      display: flex;
      gap: 20px;
      margin: 30px 0;
      justify-content: center;
      flex-wrap: wrap;
    }

    .card {
      width: 200px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      border-radius: 15px;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      animation: cardReveal 0.5s ease-out forwards;
      opacity: 0;
      transform: translateY(50px) rotateX(90deg);
    }

    @keyframes cardReveal {
      to {
        opacity: 1;
        transform: translateY(0) rotateX(0);
      }
    }

    .card.common { background: linear-gradient(135deg, #555, #777); }
    .card.uncommon { background: linear-gradient(135deg, #00ff00, #00aa00); }
    .card.rare { background: linear-gradient(135deg, #0099ff, #0066cc); }
    .card.epic { background: linear-gradient(135deg, #ff00ff, #aa00aa); }
    .card.legendary { background: linear-gradient(135deg, #ffd700, #ff8c00); }

    .card:nth-child(2) { animation-delay: 0.2s; }
    .card:nth-child(3) { animation-delay: 0.4s; }

    .card-name {
      font-size: 18px;
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
      justify-content: space-around;
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 20px;
      font-weight: bold;
    }

    .opening-animation {
      text-align: center;
      padding: 60px;
      font-size: 48px;
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
  </style>
</head>
<body>
  <h1>🎴 Open Card Packs</h1>

  <div>
    <input type="text" id="userId" placeholder="User ID" value="demo-user" style="padding: 10px; width: 200px;">
  </div>

  <div class="pack-selector">
    <button class="pack-button" onclick="openPack('starter')">
      📦 Starter Pack<br>(5 Common)
    </button>
    <button class="pack-button" onclick="openPack('standard')">
      📦 Standard Pack<br>(3 Cards)
    </button>
    <button class="pack-button" onclick="openPack('rare')">
      🎁 Rare Pack<br>(1 Rare+)
    </button>
    <button class="pack-button" onclick="openPack('epic')">
      ✨ Epic Pack<br>(1 Epic+)
    </button>
    <button class="pack-button" onclick="openPack('legendary')">
      🌟 Legendary Pack<br>(1 Legendary)
    </button>
  </div>

  <div id="results"></div>

  <script>
    async function openPack(packType) {
      const userId = document.getElementById('userId').value;
      const results = document.getElementById('results');

      // Show opening animation
      results.innerHTML = '<div class="opening-animation">🎴 Opening pack...</div>';

      try {
        const response = await fetch('http://localhost:5001/api/gaming/open-pack', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: userId,
            packType: packType
          })
        });

        if (!response.ok) {
          throw new Error('Failed to open pack');
        }

        const data = await response.json();

        // Wait a moment for suspense
        await new Promise(resolve => setTimeout(resolve, 1500));

        if (data.success) {
          displayCards(data.cards);
        } else {
          results.innerHTML = `<p style="color: #ff6b6b;">Error: ${data.error}</p>`;
        }

      } catch (error) {
        results.innerHTML = `<p style="color: #ff6b6b;">Error: ${error.message}</p>`;
      }
    }

    function displayCards(cards) {
      const results = document.getElementById('results');

      const html = `
        <h2>🎉 You got ${cards.length} cards!</h2>
        <div class="card-reveal">
          ${cards.map(card => `
            <div class="card ${card.rarity}">
              <div class="card-rarity">${card.rarity}</div>
              <div class="card-name">${card.name}</div>
              <div class="card-stats">
                <div class="stat">
                  <div class="stat-value">${card.attack}</div>
                  <div>ATK</div>
                </div>
                <div class="stat">
                  <div class="stat-value">${card.defense}</div>
                  <div>DEF</div>
                </div>
                <div class="stat">
                  <div class="stat-value">${card.special}</div>
                  <div>SPL</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      results.innerHTML = html;

      // Play sound effect (if available)
      playSound('card-reveal');
    }

    function playSound(soundName) {
      // Mock sound function
      console.log(`Playing sound: ${soundName}`);
    }
  </script>
</body>
</html>
```

Save as `public/labs/open-packs.html`.

## Summary

You've learned:
- ✅ How to call the pack opening API
- ✅ How to create reveal animations
- ✅ How to display cards with rarity effects
- ✅ How to build engaging pack opening UX

## Next Lesson

**Lesson 4: Card Collection UI**

Build a complete card collection manager with filtering and sorting.

## Quiz

1. How many cards in a standard pack?
   - a) 1
   - b) 3
   - c) 5
   - d) 10

2. What's the purpose of animation delays?
   - a) Make it slower
   - b) Stagger card reveals
   - c) Save memory
   - d) Nothing

3. Which pack guarantees a legendary?
   - a) Rare pack
   - b) Epic pack
   - c) Legendary pack
   - d) None

**Answers:** 1-b, 2-b, 3-c

---

**🎴 Achievement Unlocked:** Pack Opener (+120 XP)
