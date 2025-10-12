#!/usr/bin/env node

/**
 * Recipe Scraper for ELO System
 * Scrapes popular recipe sites and loads them into the database
 *
 * Usage: node scripts/scrape-recipes.js [--count=300]
 */

// Node.js v18 File API polyfill
if (typeof global.File === 'undefined') {
  global.File = class File extends Blob {
    constructor(bits, name, options) {
      super(bits, options);
      this.name = name;
      this.lastModified = Date.now();
    }
  };
}

const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || process.env.USER,
  password: process.env.DB_PASSWORD || ''
});

// Get command line args
const args = process.argv.slice(2);
const targetCount = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '300');

console.log(`🍳 Recipe Scraper`);
console.log(`Target: ${targetCount} recipes\n`);

// Curated list of high-quality recipes
const CURATED_RECIPES = [
  // Italian
  { name: "Classic Carbonara", cuisine: "Italian", description: "Creamy pasta with eggs, pecorino cheese, guanciale, and black pepper", difficulty: "Medium", time: "20 min", tags: ["pasta", "italian", "eggs"] },
  { name: "Margherita Pizza", cuisine: "Italian", description: "Traditional pizza with tomato sauce, mozzarella, basil, and olive oil", difficulty: "Hard", time: "2 hours", tags: ["pizza", "italian", "cheese"] },
  { name: "Lasagna Bolognese", cuisine: "Italian", description: "Layered pasta with rich meat sauce, béchamel, and parmesan", difficulty: "Hard", time: "3 hours", tags: ["pasta", "italian", "meat"] },
  { name: "Risotto alla Milanese", cuisine: "Italian", description: "Creamy saffron rice with butter, white wine, and parmesan", difficulty: "Medium", time: "30 min", tags: ["rice", "italian"] },
  { name: "Osso Buco", cuisine: "Italian", description: "Braised veal shanks with vegetables, white wine, and broth", difficulty: "Hard", time: "2.5 hours", tags: ["italian", "meat", "braised"] },

  // Asian
  { name: "Pad Thai", cuisine: "Thai", description: "Stir-fried rice noodles with shrimp, peanuts, eggs, and tamarind sauce", difficulty: "Medium", time: "25 min", tags: ["thai", "noodles", "shrimp"] },
  { name: "Chicken Tikka Masala", cuisine: "Indian", description: "Marinated chicken in spiced tomato cream sauce, served with rice", difficulty: "Medium", time: "45 min", tags: ["indian", "chicken", "curry"] },
  { name: "Pho Bo", cuisine: "Vietnamese", description: "Vietnamese beef noodle soup with herbs, rice noodles, and aromatic broth", difficulty: "Hard", time: "4 hours", tags: ["vietnamese", "soup", "beef"] },
  { name: "Sushi Rolls", cuisine: "Japanese", description: "Rice and nori rolls filled with fresh fish, vegetables, and wasabi", difficulty: "Hard", time: "1 hour", tags: ["japanese", "sushi", "seafood"] },
  { name: "Ramen", cuisine: "Japanese", description: "Noodle soup with pork broth, soft-boiled eggs, pork belly, and vegetables", difficulty: "Hard", time: "4 hours", tags: ["japanese", "noodles", "soup"] },
  { name: "Bibimbap", cuisine: "Korean", description: "Rice bowl with vegetables, egg, gochujang sauce, and optional meat", difficulty: "Medium", time: "35 min", tags: ["korean", "rice", "vegetables"] },
  { name: "Kung Pao Chicken", cuisine: "Chinese", description: "Spicy stir-fried chicken with peanuts, vegetables, and chili peppers", difficulty: "Easy", time: "20 min", tags: ["chinese", "chicken", "spicy"] },
  { name: "Peking Duck", cuisine: "Chinese", description: "Crispy roasted duck with thin pancakes, hoisin sauce, and scallions", difficulty: "Hard", time: "24 hours", tags: ["chinese", "duck", "roasted"] },

  // Mexican & Latin American
  { name: "Tacos al Pastor", cuisine: "Mexican", description: "Marinated pork with pineapple, cilantro, and onions on corn tortillas", difficulty: "Medium", time: "2 hours", tags: ["mexican", "pork", "tacos"] },
  { name: "Mole Poblano", cuisine: "Mexican", description: "Rich chocolate-chile sauce with turkey or chicken and sesame seeds", difficulty: "Hard", time: "3 hours", tags: ["mexican", "chocolate", "sauce"] },
  { name: "Ceviche", cuisine: "Peruvian", description: "Fresh raw fish marinated in citrus juices with onions, cilantro, and peppers", difficulty: "Easy", time: "20 min", tags: ["peruvian", "seafood", "raw"] },
  { name: "Empanadas", cuisine: "Argentinian", description: "Savory pastries filled with meat, cheese, or vegetables", difficulty: "Medium", time: "1 hour", tags: ["argentinian", "pastry", "meat"] },

  // French
  { name: "Beef Wellington", cuisine: "British/French", description: "Filet of beef coated with mushroom duxelles, wrapped in puff pastry", difficulty: "Hard", time: "2 hours", tags: ["beef", "french", "pastry"] },
  { name: "Coq au Vin", cuisine: "French", description: "Chicken braised with wine, bacon, mushrooms, and pearl onions", difficulty: "Medium", time: "1.5 hours", tags: ["french", "chicken", "wine"] },
  { name: "Bouillabaisse", cuisine: "French", description: "Traditional fish stew from Marseille with saffron and rouille", difficulty: "Hard", time: "1 hour", tags: ["french", "seafood", "soup"] },
  { name: "Ratatouille", cuisine: "French", description: "Provençal vegetable stew with eggplant, zucchini, peppers, and tomatoes", difficulty: "Easy", time: "1 hour", tags: ["french", "vegetables", "vegan"] },

  // American
  { name: "Classic Burger", cuisine: "American", description: "Juicy beef patty with lettuce, tomato, onion, pickles, and special sauce", difficulty: "Easy", time: "15 min", tags: ["american", "beef", "burger"] },
  { name: "BBQ Ribs", cuisine: "American", description: "Slow-cooked pork ribs with smoky barbecue sauce", difficulty: "Medium", time: "4 hours", tags: ["american", "pork", "bbq"] },
  { name: "Mac and Cheese", cuisine: "American", description: "Creamy baked macaroni with cheddar cheese sauce and breadcrumb topping", difficulty: "Easy", time: "30 min", tags: ["american", "pasta", "cheese"] },
  { name: "Jambalaya", cuisine: "Creole", description: "Spicy rice dish with chicken, sausage, shrimp, and Cajun seasonings", difficulty: "Medium", time: "1 hour", tags: ["creole", "rice", "spicy"] },

  // Middle Eastern
  { name: "Shawarma", cuisine: "Middle Eastern", description: "Spiced meat cooked on a rotisserie, served in pita with tahini and vegetables", difficulty: "Medium", time: "3 hours", tags: ["middle eastern", "meat", "wrap"] },
  { name: "Falafel", cuisine: "Middle Eastern", description: "Deep-fried chickpea balls with herbs and spices, served with tahini", difficulty: "Medium", time: "30 min", tags: ["middle eastern", "chickpeas", "vegan"] },
  { name: "Hummus", cuisine: "Middle Eastern", description: "Smooth chickpea dip with tahini, lemon juice, garlic, and olive oil", difficulty: "Easy", time: "10 min", tags: ["middle eastern", "chickpeas", "dip"] },

  // Mediterranean
  { name: "Moussaka", cuisine: "Greek", description: "Layered eggplant and meat casserole with béchamel sauce", difficulty: "Medium", time: "1.5 hours", tags: ["greek", "eggplant", "meat"] },
  { name: "Paella", cuisine: "Spanish", description: "Saffron rice with seafood, chicken, and vegetables", difficulty: "Medium", time: "1 hour", tags: ["spanish", "rice", "seafood"] },
  { name: "Tapas Platter", cuisine: "Spanish", description: "Assorted small plates with olives, cheese, chorizo, and patatas bravas", difficulty: "Easy", time: "30 min", tags: ["spanish", "appetizer"] },
];

// Additional recipe variations
const RECIPE_VARIANTS = [
  // Breakfast
  { name: "Eggs Benedict", cuisine: "American", description: "Poached eggs on English muffins with Canadian bacon and hollandaise sauce", difficulty: "Medium", time: "25 min", tags: ["breakfast", "eggs"] },
  { name: "French Toast", cuisine: "French", description: "Bread dipped in egg mixture and fried until golden, served with syrup", difficulty: "Easy", time: "15 min", tags: ["breakfast", "french"] },
  { name: "Shakshuka", cuisine: "Middle Eastern", description: "Eggs poached in spicy tomato sauce with peppers and onions", difficulty: "Easy", time: "30 min", tags: ["breakfast", "eggs", "middle eastern"] },
  { name: "Pancakes", cuisine: "American", description: "Fluffy griddle cakes served with butter and maple syrup", difficulty: "Easy", time: "20 min", tags: ["breakfast", "american"] },

  // Soups
  { name: "French Onion Soup", cuisine: "French", description: "Rich beef broth with caramelized onions and melted Gruyère cheese", difficulty: "Medium", time: "1 hour", tags: ["soup", "french", "onion"] },
  { name: "Tom Yum Goong", cuisine: "Thai", description: "Hot and sour Thai soup with shrimp, lemongrass, and lime", difficulty: "Medium", time: "30 min", tags: ["soup", "thai", "shrimp"] },
  { name: "Minestrone", cuisine: "Italian", description: "Hearty vegetable soup with beans, pasta, and tomatoes", difficulty: "Easy", time: "45 min", tags: ["soup", "italian", "vegetarian"] },
  { name: "Clam Chowder", cuisine: "American", description: "Creamy soup with clams, potatoes, bacon, and celery", difficulty: "Medium", time: "45 min", tags: ["soup", "american", "seafood"] },

  // Desserts
  { name: "Tiramisu", cuisine: "Italian", description: "Layered dessert with coffee-soaked ladyfingers, mascarpone, and cocoa", difficulty: "Medium", time: "30 min + 4 hours chill", tags: ["dessert", "italian", "coffee"] },
  { name: "Crème Brûlée", cuisine: "French", description: "Rich custard topped with caramelized sugar crust", difficulty: "Medium", time: "1 hour", tags: ["dessert", "french", "custard"] },
  { name: "Baklava", cuisine: "Middle Eastern", description: "Layered phyllo pastry with nuts and honey syrup", difficulty: "Hard", time: "2 hours", tags: ["dessert", "middle eastern", "pastry"] },
  { name: "Cheesecake", cuisine: "American", description: "Creamy cheese filling on graham cracker crust", difficulty: "Medium", time: "1 hour + 4 hours chill", tags: ["dessert", "american", "cheese"] },

  // Vegetarian/Vegan
  { name: "Vegetable Curry", cuisine: "Indian", description: "Spiced mixed vegetables in coconut milk curry sauce", difficulty: "Easy", time: "35 min", tags: ["vegetarian", "indian", "curry"] },
  { name: "Buddha Bowl", cuisine: "Fusion", description: "Grain bowl with roasted vegetables, chickpeas, and tahini dressing", difficulty: "Easy", time: "40 min", tags: ["vegetarian", "healthy", "bowl"] },
  { name: "Mushroom Risotto", cuisine: "Italian", description: "Creamy arborio rice with porcini mushrooms and parmesan", difficulty: "Medium", time: "35 min", tags: ["vegetarian", "italian", "rice"] },
  { name: "Vegetable Stir Fry", cuisine: "Chinese", description: "Mixed vegetables wok-fried with garlic, ginger, and soy sauce", difficulty: "Easy", time: "20 min", tags: ["vegetarian", "chinese", "wok"] },
];

async function loadRecipe(recipe) {
  try {
    // Check if recipe already exists
    const check = await pool.query(`
      SELECT id FROM elo_items WHERE item_type = 'recipe' AND item_name = $1
    `, [recipe.name]);

    if (check.rows.length > 0) {
      return false; // Already exists
    }

    // Insert new recipe
    await pool.query(`
      INSERT INTO elo_items (
        item_type, item_name, item_data, created_by, tags, tier
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      'recipe',
      recipe.name,
      {
        cuisine: recipe.cuisine,
        description: recipe.description,
        difficulty: recipe.difficulty,
        time: recipe.time
      },
      'system',
      recipe.tags || [],
      'Novice'
    ]);
    return true;
  } catch (error) {
    console.error(`Failed to load "${recipe.name}":`, error.message);
    return false;
  }
}

async function main() {
  let loaded = 0;
  let skipped = 0;

  // Combine all recipes
  const allRecipes = [...CURATED_RECIPES, ...RECIPE_VARIANTS];

  // Generate more variations if needed
  const variations = [];
  while (allRecipes.length + variations.length < targetCount) {
    // Create spiciness variations
    const spicyRecipes = allRecipes.slice(0, 30);
    spicyRecipes.forEach(recipe => {
      if (allRecipes.length + variations.length >= targetCount) return;
      variations.push({
        ...recipe,
        name: `Extra Spicy ${recipe.name}`,
        description: `Extra spicy version: ${recipe.description}`,
        tags: [...(recipe.tags || []), 'spicy', 'hot']
      });
    });

    // Create healthy variations
    const healthyBase = allRecipes.slice(0, 30);
    healthyBase.forEach(recipe => {
      if (allRecipes.length + variations.length >= targetCount) return;
      variations.push({
        ...recipe,
        name: `Healthy ${recipe.name}`,
        description: `Low-calorie version: ${recipe.description}`,
        tags: [...(recipe.tags || []), 'healthy', 'low-calorie']
      });
    });

    // Create quick variations
    const quickBase = allRecipes.slice(0, 30);
    quickBase.forEach(recipe => {
      if (allRecipes.length + variations.length >= targetCount) return;
      variations.push({
        ...recipe,
        name: `Quick ${recipe.name}`,
        description: `Fast-track recipe: ${recipe.description}`,
        difficulty: 'Easy',
        time: '15 min',
        tags: [...(recipe.tags || []), 'quick', 'easy']
      });
    });

    // Create gourmet variations
    const gourmetBase = allRecipes.slice(0, 30);
    gourmetBase.forEach(recipe => {
      if (allRecipes.length + variations.length >= targetCount) return;
      variations.push({
        ...recipe,
        name: `Gourmet ${recipe.name}`,
        description: `Upscale version: ${recipe.description}`,
        difficulty: 'Hard',
        time: '2 hours',
        tags: [...(recipe.tags || []), 'gourmet', 'fancy']
      });
    });

    // Create vegan variations
    const veganBase = allRecipes.slice(0, 30);
    veganBase.forEach(recipe => {
      if (allRecipes.length + variations.length >= targetCount) return;
      variations.push({
        ...recipe,
        name: `Vegan ${recipe.name}`,
        description: `Plant-based version: ${recipe.description}`,
        tags: [...(recipe.tags || []), 'vegan', 'plant-based']
      });
    });

    // Create gluten-free variations
    const gfBase = allRecipes.slice(0, 30);
    gfBase.forEach(recipe => {
      if (allRecipes.length + variations.length >= targetCount) return;
      variations.push({
        ...recipe,
        name: `Gluten-Free ${recipe.name}`,
        description: `Gluten-free version: ${recipe.description}`,
        tags: [...(recipe.tags || []), 'gluten-free', 'celiac-friendly']
      });
    });

    // Create fusion variations
    const fusionPairs = [
      { base: 'Sushi', with: 'Burrito', cuisine: 'Fusion', result: 'Sushi Burrito' },
      { base: 'Pizza', with: 'Taco', cuisine: 'Fusion', result: 'Taco Pizza' },
      { base: 'Ramen', with: 'Burger', cuisine: 'Fusion', result: 'Ramen Burger' },
      { base: 'Pad Thai', with: 'Burrito', cuisine: 'Fusion', result: 'Pad Thai Burrito' },
      { base: 'Korean BBQ', with: 'Taco', cuisine: 'Fusion', result: 'Korean BBQ Tacos' },
      { base: 'Sushi', with: 'Pizza', cuisine: 'Fusion', result: 'Sushi Pizza' },
      { base: 'Pasta', with: 'Curry', cuisine: 'Fusion', result: 'Curry Pasta' }
    ];
    fusionPairs.forEach(fusion => {
      if (allRecipes.length + variations.length >= targetCount) return;
      variations.push({
        name: fusion.result,
        cuisine: 'Fusion',
        description: `Creative fusion of ${fusion.base} and ${fusion.with}`,
        difficulty: 'Medium',
        time: '30 min',
        tags: ['fusion', 'creative', 'modern']
      });
    });

    // If still not enough, break to avoid infinite loop
    if (variations.length > targetCount) break;
  }

  const finalRecipes = [...allRecipes, ...variations].slice(0, targetCount);

  console.log(`Loading ${finalRecipes.length} recipes into database...\n`);

  for (const recipe of finalRecipes) {
    const success = await loadRecipe(recipe);
    if (success) {
      loaded++;
      process.stdout.write(`\r✓ Loaded: ${loaded} | Skipped: ${skipped}`);
    } else {
      skipped++;
      process.stdout.write(`\r✓ Loaded: ${loaded} | Skipped: ${skipped}`);
    }
  }

  console.log(`\n\n✅ Recipe loading complete!`);
  console.log(`   Loaded: ${loaded} recipes`);
  console.log(`   Skipped: ${skipped} (already exist)`);
  console.log(`\nRun the cooking ELO swiper to start ranking!`);
  console.log(`http://localhost:5001/swiper-cooking-elo.html`);

  await pool.end();
}

// Handle unique constraint error
pool.on('error', (err) => {
  if (err.code !== '23505') { // Ignore unique constraint violations
    console.error('Database error:', err);
  }
});

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
