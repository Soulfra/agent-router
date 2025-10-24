#!/usr/bin/env node
/**
 * Demo: Tier Progression System with Dual Thresholds
 *
 * Shows how continuous ELO rating maps to:
 * - Discrete levels (1-99, RuneScape style)
 * - Categorical tiers (Novice → Legendary)
 * - "Whistle" events when crossing thresholds
 */

const TierProgressionSystem = require('../lib/tier-progression-system');

const tierSystem = new TierProgressionSystem();

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     Tier Progression System - Dual Threshold Demo           ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Show all tiers
console.log('📊 Tier Definitions (with Entry/Exit Thresholds):\n');
tierSystem.getAllTiers().forEach(tier => {
  const exitDisplay = tier.exitThreshold === Infinity ? '∞' : tier.exitThreshold;
  console.log(`${tier.icon} ${tier.name.padEnd(15)} Level ${tier.level}`);
  console.log(`   Entry: ${tier.entryThreshold.toString().padStart(4)} ELO`);
  console.log(`   Exit:  ${exitDisplay.toString().padStart(4)} ELO`);
  console.log(`   ${tier.description}`);
  console.log();
});

console.log('\n' + '─'.repeat(60) + '\n');

// Simulate rating progression
console.log('🎮 Simulating Rating Progression:\n');

const progression = [
  { rating: 1000, description: 'Starting player' },
  { rating: 1150, description: 'Winning some matches' },
  { rating: 1200, description: 'Cross threshold to Apprentice' },
  { rating: 1250, description: 'Solidifying Apprentice' },
  { rating: 1190, description: 'One bad loss (below 1200)' },
  { rating: 1220, description: 'Win back (but no tier change yet!)' },
  { rating: 1400, description: 'Promoted to Intermediate!' },
  { rating: 1590, description: 'Near Advanced threshold' },
  { rating: 1600, description: 'Cross into Advanced' },
  { rating: 2000, description: 'Hit Master tier!' },
  { rating: 2450, description: 'Legendary player' }
];

let previousTier = null;
let previousRating = null;

progression.forEach((step, index) => {
  const tier = tierSystem.calculateTier(step.rating, previousTier);
  const rank = tierSystem.calculateRank(step.rating);
  const progress = tierSystem.getProgressToNextTier(step.rating, tier.name);

  console.log(`Step ${index + 1}: ${step.description}`);
  console.log(`   ELO: ${step.rating} → Rank: ${rank}/99 → Tier: ${tier.icon} ${tier.name}`);

  // Check for "whistle" events
  if (previousTier !== null && previousRating !== null) {
    const events = tierSystem.checkThresholdEvents(
      previousRating,
      step.rating,
      previousTier,
      tier.name
    );

    if (events.length > 0) {
      events.forEach(event => {
        if (event.type === 'tier_change') {
          console.log(`   🔔 WHISTLE EVENT: ${event.message}`);
        } else if (event.type === 'milestone') {
          console.log(`   🔔 ${event.message}`);
        }
      });
    } else if (previousTier === tier.name) {
      console.log(`   ✓ Stayed in ${tier.name} (hysteresis prevented tier bounce)`);
    }
  }

  // Show progress to next tier
  if (!progress.isMaxTier) {
    const progressBar = '█'.repeat(Math.floor(progress.progress / 5)) +
                        '░'.repeat(20 - Math.floor(progress.progress / 5));
    console.log(`   Progress to ${progress.nextTier}: [${progressBar}] ${progress.progress}%`);
    console.log(`   Need ${progress.pointsNeeded} more points`);
  } else {
    console.log(`   🌟 MAX TIER REACHED! 🌟`);
  }

  console.log();

  previousTier = tier.name;
  previousRating = step.rating;
});

console.log('\n' + '─'.repeat(60) + '\n');

// Show hysteresis in action
console.log('🎯 Hysteresis Demo (Prevents Tier Bouncing):\n');
console.log('Without hysteresis, rapid ELO fluctuations cause tier spam.\n');

const fluctuation = [
  1195, 1205, 1195, 1205, 1195, 1205  // Bouncing around 1200 threshold
];

console.log('Rating fluctuating around Apprentice threshold (1200):');
console.log('Ratings:', fluctuation.join(' → '));
console.log();

let currentTier = 'Novice';
fluctuation.forEach((rating, i) => {
  const tier = tierSystem.calculateTier(rating, currentTier);
  const changed = tier.name !== currentTier;

  console.log(`  ${rating} ELO: ${tier.icon} ${tier.name}${changed ? ' ← CHANGED' : ''}`);
  currentTier = tier.name;
});

console.log('\nNotice: Tier only changes when rating decisively crosses threshold.');
console.log('This prevents constant "promoted/demoted" spam from small fluctuations.\n');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  The "whistle" = event notification when threshold crossed  ║');
console.log('║  Entry threshold ≠ Exit threshold = Hysteresis              ║');
console.log('║  Continuous rating (0-∞) → Discrete tier (Novice→Legendary) ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
