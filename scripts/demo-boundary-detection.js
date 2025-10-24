#!/usr/bin/env node
/**
 * Boundary Crossing Detection Demo
 *
 * Shows how bisection finds exact crossing points that discrete sampling misses.
 * Demonstrates the "memory context heap" problem and "trace in half steps" solution.
 */

const BoundaryCrossingDetector = require('../lib/boundary-crossing-detector');
const TierProgressionSystem = require('../lib/tier-progression-system');

const detector = new BoundaryCrossingDetector();
const tierSystem = new TierProgressionSystem();

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     Boundary Crossing Detection - Bisection Demo            ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// ========================================================================
// PART 1: The Problem - Discrete Sampling Misses Boundaries
// ========================================================================

console.log('📊 PART 1: The "Memory Context Heap" Problem\n');
console.log('You only see discrete states, but boundaries are invisible.\n');

const scenario1 = {
  before: 1190,
  after: 1250,
  threshold: 1200
};

console.log(`Scenario: Player wins match`);
console.log(`  Before: ${scenario1.before} ELO`);
console.log(`  After:  ${scenario1.after} ELO`);
console.log(`  Threshold: ${scenario1.threshold} (Apprentice tier)\n`);

console.log('❌ Problem: We can see they crossed 1200, but WHERE exactly?');
console.log('   Rating jumped from 1190 → 1250 in one match.');
console.log('   The boundary at 1200 is invisible between samples.\n');

console.log('─'.repeat(60) + '\n');

// ========================================================================
// PART 2: The Solution - Bisection (Trace in Half Steps)
// ========================================================================

console.log('✅ PART 2: Bisection Solution - "Trace in Half Steps"\n');

const crossingPoint = detector.findExactCrossing(
  scenario1.before,
  scenario1.after,
  scenario1.threshold,
  0.01
);

const progress = (scenario1.threshold - scenario1.before) /
                 (scenario1.after - scenario1.before);

console.log(`Binary search to find exact crossing:\n`);
console.log(`Step 1: Check midpoint between 1190 and 1250`);
console.log(`        Mid = ${((scenario1.before + scenario1.after) / 2).toFixed(2)}`);
console.log(`        ${((scenario1.before + scenario1.after) / 2).toFixed(2)} > 1200, so crossing is in LEFT half\n`);

console.log(`Step 2: Check midpoint between 1190 and 1220`);
console.log(`        Mid = ${((scenario1.before + 1220) / 2).toFixed(2)}`);
console.log(`        ${((scenario1.before + 1220) / 2).toFixed(2)} > 1200, so crossing is in LEFT half\n`);

console.log(`Step 3: Check midpoint between 1190 and 1205`);
console.log(`        Mid = ${((scenario1.before + 1205) / 2).toFixed(2)}`);
console.log(`        ${((scenario1.before + 1205) / 2).toFixed(2)} < 1200, so crossing is in RIGHT half\n`);

console.log(`... continue until within tolerance (0.01) ...\n`);

console.log(`✓ Exact crossing point: ${crossingPoint.toFixed(2)} ELO`);
console.log(`✓ Progress through match: ${(progress * 100).toFixed(1)}%\n`);

console.log('─'.repeat(60) + '\n');

// ========================================================================
// PART 3: Multiple Boundaries
// ========================================================================

console.log('🎯 PART 3: Finding Multiple Boundary Crossings\n');

const scenario2 = {
  before: 1190,
  after: 1650,
  boundaries: [1200, 1400, 1600]
};

console.log(`Scenario: Player goes on winning streak`);
console.log(`  Before: ${scenario2.before} ELO`);
console.log(`  After:  ${scenario2.after} ELO`);
console.log(`  Boundaries: ${scenario2.boundaries.join(', ')}\n`);

const crossings = detector.findCrossings(
  scenario2.before,
  scenario2.after,
  scenario2.boundaries
);

console.log(`Found ${crossings.length} boundary crossings:\n`);
crossings.forEach((crossing, i) => {
  console.log(`${i + 1}. Crossed ${crossing.boundary} at ~${crossing.crossingValue.toFixed(2)} ELO`);
  console.log(`   Direction: ${crossing.direction === 'up' ? '↑' : '↓'}`);
  console.log(`   Progress: ${(crossing.progress * 100).toFixed(1)}% through rating change\n`);
});

console.log('─'.repeat(60) + '\n');

// ========================================================================
// PART 4: Fixed Hysteresis Demo
// ========================================================================

console.log('🔄 PART 4: Hysteresis - Entry ≠ Exit Thresholds\n');

console.log('Apprentice Tier:');
console.log(`  Entry: 1200 ELO (must reach 1200 to enter)`);
console.log(`  Exit:  1150 ELO (must drop to 1150 to exit)`);
console.log(`  Buffer Zone: 1150-1200 = 50 point hysteresis gap\n`);

const fluctuation = [
  { rating: 1195, desc: 'Starting in Novice' },
  { rating: 1205, desc: 'Won match, crossed entry threshold' },
  { rating: 1195, desc: 'Lost match, but still in buffer zone' },
  { rating: 1175, desc: 'Another loss, still in buffer' },
  { rating: 1165, desc: 'Another loss, still in buffer' },
  { rating: 1145, desc: 'Dropped below exit threshold' },
  { rating: 1155, desc: 'Won match, back in buffer' },
  { rating: 1205, desc: 'Won streak, crossed entry again' }
];

console.log('Rating Sequence (with FIXED hysteresis):\n');

let currentTier = 'Novice';
fluctuation.forEach((step, i) => {
  const tier = tierSystem.calculateTier(step.rating, currentTier);
  const changed = tier.name !== currentTier;

  const status = changed
    ? `← ${changed ? 'TIER CHANGE' : ''}`
    : tier.name === 'Apprentice' && step.rating < 1200 && step.rating > 1150
      ? '(in buffer zone)'
      : '';

  console.log(`${i + 1}. ${step.rating} ELO: ${tier.icon} ${tier.name.padEnd(15)} ${status}`);
  console.log(`   ${step.desc}`);

  currentTier = tier.name;
});

console.log('\n✓ Notice: Only 2 tier changes despite 8 rating changes!');
console.log('✓ Buffer zone (1150-1200) prevents constant tier flipping.\n');

console.log('─'.repeat(60) + '\n');

// ========================================================================
// PART 5: Timed Crossings (Timestamp Interpolation)
// ========================================================================

console.log('⏱️  PART 5: Timed Crossing Events\n');

const timeStart = Date.now();
const timeEnd = timeStart + 60000; // 1 minute later

const timedCrossings = detector.findTimedCrossings(
  1190,
  1650,
  timeStart,
  timeEnd,
  [1200, 1400, 1600]
);

console.log('Rating changes from 1190 → 1650 over 60 seconds.\n');
console.log('Boundary crossings with timestamps:\n');

timedCrossings.forEach((crossing, i) => {
  const secondsIn = ((crossing.timestamp - timeStart) / 1000).toFixed(1);
  console.log(`${i + 1}. Crossed ${crossing.boundary} ELO`);
  console.log(`   Time: ${secondsIn}s into match (${(crossing.progress * 100).toFixed(1)}%)`);
  console.log(`   Exact value: ${crossing.crossingValue.toFixed(2)}\n`);
});

console.log('─'.repeat(60) + '\n');

// ========================================================================
// Summary
// ========================================================================

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║                          KEY INSIGHTS                        ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log('║                                                              ║');
console.log('║  1. Discrete Sampling = Invisible Boundaries                 ║');
console.log('║     You see: 1190 → 1250                                     ║');
console.log('║     You miss: Exact moment crossing 1200                     ║');
console.log('║                                                              ║');
console.log('║  2. Bisection = "Trace in Half Steps"                        ║');
console.log('║     Binary search finds exact crossing point                 ║');
console.log('║     Complexity: O(log n) iterations                          ║');
console.log('║                                                              ║');
console.log('║  3. Hysteresis = Entry ≠ Exit                                ║');
console.log('║     Enter at 1200, exit at 1150                              ║');
console.log('║     Buffer zone prevents tier bouncing                       ║');
console.log('║                                                              ║');
console.log('║  4. Applications                                             ║');
console.log('║     • ELO tier boundaries                                    ║');
console.log('║     • Price support/resistance levels                        ║');
console.log('║     • Game collision detection                               ║');
console.log('║     • GPU ray-shape intersection                             ║');
console.log('║     • State machine transitions                              ║');
console.log('║                                                              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
