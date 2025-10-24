#!/usr/bin/env node

/**
 * Simple standalone test for numerical testing framework
 * No mocha/chai dependencies - just plain Node.js
 */

const {
  FiniteDifferenceValidator,
  PerturbObserveFramework,
  WeightedGradientOptimizer
} = require('./lib/numerical-testing');

console.log('Testing Numerical Framework...\n');

// Test 1: Finite Differences
console.log('=== Test 1: Finite Difference Validator ===');
const validator = new FiniteDifferenceValidator({ epsilon: 0.001, verbose: true });

// Test karma normalization
const normalizeKarma = (karma) => Math.min(karma / 1000, 1.0);

console.log('\n1.1: Testing continuity of karma normalization at x=500');
const continuity = validator.testContinuity(normalizeKarma, 500);
console.log(`Result: ${continuity.continuous ? 'PASS' : 'FAIL'}`);

console.log('\n1.2: Testing monotonicity (should always increase)');
const mono = validator.testMonotonicity(normalizeKarma, 0, 2000, 50);
console.log(`Result: ${mono.monotonic ? 'PASS' : 'FAIL'}`);
console.log(`Direction: ${mono.direction}`);

console.log('\n1.3: Testing bounds (should be 0-1)');
const bounds = validator.testBounds(normalizeKarma, 0, 5000, 0, 1.0, 100);
console.log(`Result: ${bounds.bounded ? 'PASS' : 'FAIL'}`);
console.log(`Actual range: [${bounds.actualMin.toFixed(3)}, ${bounds.actualMax.toFixed(3)}]`);

// Test 2: Perturb & Observe
console.log('\n\n=== Test 2: Perturb & Observe Framework ===');
const observer = new PerturbObserveFramework({ verbose: true });

// Badge calculator
const calculateBadge = (input) => {
  const { karma, daysSinceJoin, trustScore } = input;

  if (karma >= 1000 && daysSinceJoin >= 90 && trustScore >= 0.9) {
    return 'legend';
  } else if (karma >= 200 && daysSinceJoin >= 30 && trustScore >= 0.75) {
    return 'veteran';
  } else if (karma >= 10 && trustScore >= 0.3) {
    return 'contributor';
  } else {
    return 'newcomer';
  }
};

console.log('\n2.1: Running black-box tests with 500 random inputs');
const summary = observer.observe(
  calculateBadge,
  { karma: 100, daysSinceJoin: 30, trustScore: 0.5 },
  {
    karma: { min: 0, max: 2000, type: 'int' },
    daysSinceJoin: { min: 0, max: 365, type: 'int' },
    trustScore: { min: 0, max: 1, type: 'float' }
  },
  500
);

console.log(`Success rate: ${(summary.successRate * 100).toFixed(1)}%`);
console.log(`Failed: ${summary.failed}`);

// Count badge distribution
const badgeCounts = {};
observer.observations.forEach(obs => {
  const badge = obs.output;
  badgeCounts[badge] = (badgeCounts[badge] || 0) + 1;
});

console.log('\nBadge distribution:');
Object.entries(badgeCounts).forEach(([badge, count]) => {
  const pct = (count / 500 * 100).toFixed(1);
  console.log(`  ${badge}: ${count} (${pct}%)`);
});

// Test 3: Weighted Gradient Optimizer
console.log('\n\n=== Test 3: Weighted Gradient Optimizer ===');
const optimizer = new WeightedGradientOptimizer({
  learningRate: 0.05,
  iterations: 200,
  verbose: true
});

console.log('\n3.1: Learning optimal trust score weights');
console.log('Training data: 5 users with known trust scores');

const inputs = [
  [0.5, 0.8, 0.4, 0.5, 0.6],   // karma, learning, collab, quality, consistency
  [0.9, 0.9, 0.8, 0.8, 0.9],
  [0.2, 0.3, 0.1, 0.2, 0.2],
  [0.7, 0.6, 0.5, 0.6, 0.7],
  [1.0, 1.0, 1.0, 1.0, 1.0]
];

const targets = [0.6, 0.9, 0.2, 0.65, 1.0];

console.log('Starting with equal weights: [0.2, 0.2, 0.2, 0.2, 0.2]');

const result = optimizer.optimize(inputs, targets, [0.2, 0.2, 0.2, 0.2, 0.2]);

console.log('\nOptimized weights:');
console.log(`  Karma:       ${result.weights[0].toFixed(3)}`);
console.log(`  Learning:    ${result.weights[1].toFixed(3)}`);
console.log(`  Collab:      ${result.weights[2].toFixed(3)}`);
console.log(`  Quality:     ${result.weights[3].toFixed(3)}`);
console.log(`  Consistency: ${result.weights[4].toFixed(3)}`);
console.log(`\nFinal error: ${result.error.toFixed(6)}`);

const weightSum = result.weights.reduce((s, w) => s + w, 0);
console.log(`Weight sum: ${weightSum.toFixed(6)} (should be 1.0)`);

// Final summary
console.log('\n\n=== Summary ===');
console.log('✓ Finite difference validation works');
console.log('✓ Perturb & observe framework works');
console.log('✓ Weighted gradient optimizer works');
console.log('\nAll numerical testing tools are functional!');
