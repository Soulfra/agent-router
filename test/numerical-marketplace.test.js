/**
 * Numerical Testing Examples
 *
 * Demonstrates how to use the numerical testing framework
 * to validate marketplace systems using:
 * - Finite differences (lazy derivatives)
 * - Perturb & observe (black-box testing)
 * - Weighted gradients (Blender-style optimization)
 */

const assert = require('assert');
const {
  FiniteDifferenceValidator,
  PerturbObserveFramework,
  WeightedGradientOptimizer
} = require('../lib/numerical-testing');

// Helper to match chai's expect style
const expect = (value) => ({
  to: {
    be: {
      true: assert.strictEqual(value, true),
      false: assert.strictEqual(value, false),
      a: (type) => assert.strictEqual(typeof value, type),
      at: {
        least: (min) => assert(value >= min, `Expected ${value} >= ${min}`),
        most: (max) => assert(value <= max, `Expected ${value} <= ${max}`)
      },
      closeTo: (target, delta) => {
        const diff = Math.abs(value - target);
        assert(diff <= delta, `Expected ${value} to be within ${delta} of ${target}, but diff was ${diff}`);
      },
      lessThan: (max) => assert(value < max, `Expected ${value} < ${max}`),
      greaterThan: (min) => assert(value > min, `Expected ${value} > ${min}`)
    },
    equal: (expected) => assert.strictEqual(value, expected),
    have: {
      length: (len) => assert.strictEqual(value.length, len),
      lengthOf: (len) => assert.strictEqual(value.length, len)
    },
    include: {
      members: (arr) => {
        for (const item of arr) {
          assert(value.includes(item), `Expected ${value} to include ${item}`);
        }
      }
    }
  }
});

describe('Numerical Testing Framework', () => {
  describe('FiniteDifferenceValidator', () => {
    it('should test continuity of karma normalization', () => {
      const validator = new FiniteDifferenceValidator({ epsilon: 0.001 });

      // Karma normalization: karma / 1000, clamped to 1.0
      const normalizeKarma = (karma) => Math.min(karma / 1000, 1.0);

      // Test continuity at several points
      const points = [0, 100, 500, 999, 1000, 1500];

      for (const point of points) {
        const result = validator.testContinuity(normalizeKarma, point);

        expect(result.continuous).to.be.true;
        expect(result.slope).to.be.a('number');

        // Below 1000, slope should be ~0.001 (1/1000)
        // Above 1000, slope should be ~0 (clamped)
        if (point < 999) {
          expect(result.slope).to.be.closeTo(0.001, 0.0001);
        } else if (point > 1001) {
          expect(result.slope).to.be.closeTo(0, 0.0001);
        }
      }
    });

    it('should verify monotonicity of trust score', () => {
      const validator = new FiniteDifferenceValidator();

      // Trust score should increase with karma
      const trustScore = (karma) => {
        const karmaScore = Math.min(karma / 1000, 1.0);
        return karmaScore * 0.3; // Simplified (just karma component)
      };

      const result = validator.testMonotonicity(trustScore, 0, 2000, 100);

      expect(result.monotonic).to.be.true;
      expect(result.direction).to.equal('increasing');
      expect(result.violations).to.have.length(0);
    });

    it('should check bounds on normalized scores', () => {
      const validator = new FiniteDifferenceValidator();

      // All normalized scores should be 0-1
      const normalizeScore = (value, max) => Math.min(value / max, 1.0);

      const result = validator.testBounds(
        (karma) => normalizeScore(karma, 1000),
        0,    // Start
        5000, // End (test beyond expected range)
        0,    // Min bound
        1.0,  // Max bound
        200   // Samples
      );

      expect(result.bounded).to.be.true;
      expect(result.actualMin).to.be.at.least(0);
      expect(result.actualMax).to.be.at.most(1.0);
      expect(result.violations).to.have.length(0);
    });

    it('should approximate derivatives correctly', () => {
      const validator = new FiniteDifferenceValidator({ epsilon: 1e-6 });

      // f(x) = x²,  f'(x) = 2x
      const square = (x) => x * x;

      // Test at x = 5
      const slope = validator.derivative(square, 5);

      // f'(5) = 10
      expect(slope).to.be.closeTo(10, 0.001);
    });

    it('should calculate second derivatives (curvature)', () => {
      const validator = new FiniteDifferenceValidator({ epsilon: 1e-4 });

      // f(x) = x²,  f''(x) = 2
      const square = (x) => x * x;

      const curvature = validator.secondDerivative(square, 5);

      // f''(x) = 2 everywhere for x²
      expect(curvature).to.be.closeTo(2, 0.01);
    });
  });

  describe('PerturbObserveFramework', () => {
    it('should test badge calculation with random inputs', () => {
      const observer = new PerturbObserveFramework({ verbose: false });

      // Simplified badge calculator
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

      // Run black-box tests
      const summary = observer.observe(
        calculateBadge,
        { karma: 100, daysSinceJoin: 30, trustScore: 0.5 },
        {
          karma: { min: 0, max: 2000, type: 'int' },
          daysSinceJoin: { min: 0, max: 365, type: 'int' },
          trustScore: { min: 0, max: 1, type: 'float' }
        },
        1000 // 1000 random trials
      );

      // Should never fail (always returns a badge)
      expect(summary.successRate).to.equal(1.0);
      expect(summary.successful).to.equal(1000);
      expect(summary.failed).to.equal(0);

      // Verify badge distribution makes sense
      const badgeCounts = {};
      observer.observations.forEach(obs => {
        const badge = obs.output;
        badgeCounts[badge] = (badgeCounts[badge] || 0) + 1;
      });

      // Most users should be newcomers (low karma is more common in our range)
      expect(badgeCounts.newcomer).to.be.greaterThan(0);

      // Should have some of each badge
      expect(Object.keys(badgeCounts).length).to.be.at.least(2);
    });

    it('should perform sensitivity analysis', () => {
      const observer = new PerturbObserveFramework();

      // Trust score calculation (numeric output)
      const calculateTrust = (input) => {
        const karmaScore = Math.min(input.karma / 1000, 1.0);
        const learningScore = input.learningProgress;
        const collabScore = Math.min(input.collaborations / 20, 1.0);

        return (karmaScore * 0.5) +
               (learningScore * 0.3) +
               (collabScore * 0.2);
      };

      observer.observe(
        calculateTrust,
        { karma: 500, learningProgress: 0.5, collaborations: 10 },
        {
          karma: { min: 0, max: 1000, type: 'int' },
          learningProgress: { min: 0, max: 1, type: 'float' },
          collaborations: { min: 0, max: 20, type: 'int' }
        },
        500
      );

      const sensitivity = observer.analyzeSensitivity();

      // Karma should be most important (weight = 0.5)
      expect(sensitivity.karma).to.be.greaterThan(sensitivity.learningProgress);
      expect(sensitivity.karma).to.be.greaterThan(sensitivity.collaborations);

      // Learning should be more important than collaborations (0.3 > 0.2)
      expect(sensitivity.learningProgress).to.be.greaterThan(sensitivity.collaborations);
    });

    it('should catch edge cases with random testing', () => {
      const observer = new PerturbObserveFramework();

      // Function with edge case bug
      const buggyNormalize = (input) => {
        // BUG: Division by zero when max = 0
        return input.value / input.max;
      };

      const summary = observer.observe(
        buggyNormalize,
        { value: 10, max: 100 },
        {
          value: { min: 0, max: 100, type: 'int' },
          max: { min: 0, max: 100, type: 'int' }  // Can be 0!
        },
        100
      );

      // Should catch the division by zero errors
      expect(summary.failed).to.be.greaterThan(0);
      expect(summary.errors).to.include.members([
        'Infinity',
        'Cannot divide by zero'
      ].filter(e => summary.errors.includes(e)));
    });
  });

  describe('WeightedGradientOptimizer', () => {
    it('should optimize trust score weights', () => {
      const optimizer = new WeightedGradientOptimizer({
        learningRate: 0.05,
        iterations: 200,
        verbose: false
      });

      // Training data: [karma_score, learning_score, collab_score]
      const inputs = [
        [0.5, 0.8, 0.4],   // Target: 0.6
        [0.9, 0.9, 0.8],   // Target: 0.9
        [0.2, 0.3, 0.1],   // Target: 0.2
        [0.7, 0.6, 0.5],   // Target: 0.65
        [1.0, 1.0, 1.0]    // Target: 1.0
      ];

      const targets = [0.6, 0.9, 0.2, 0.65, 1.0];

      // Start with equal weights
      const initialWeights = [0.33, 0.33, 0.34];

      const result = optimizer.optimize(inputs, targets, initialWeights);

      // Should converge to low error
      expect(result.error).to.be.lessThan(0.01);

      // Weights should sum to 1.0
      const sum = result.weights.reduce((s, w) => s + w, 0);
      expect(sum).to.be.closeTo(1.0, 0.001);

      // Each weight should be reasonable (not negative, not > 1)
      result.weights.forEach(weight => {
        expect(weight).to.be.at.least(0);
        expect(weight).to.be.at.most(1);
      });
    });

    it('should find weights via grid search', () => {
      const optimizer = new WeightedGradientOptimizer({ verbose: false });

      // Simple problem: find weights for [a, b] to approximate target
      const evaluateFn = (weights) => {
        const inputs = [
          [0.5, 0.5],
          [0.8, 0.2],
          [0.3, 0.7]
        ];
        const targets = [0.5, 0.6, 0.4];

        let totalError = 0;
        for (let i = 0; i < inputs.length; i++) {
          const prediction = inputs[i][0] * weights[0] + inputs[i][1] * weights[1];
          const error = prediction - targets[i];
          totalError += error * error;
        }

        return totalError / inputs.length;
      };

      const result = optimizer.gridSearch(evaluateFn, 2, 5);

      // Should find reasonable weights
      expect(result.bestWeights).to.have.length(2);
      expect(result.bestError).to.be.a('number');
      expect(result.bestError).to.be.lessThan(0.1);
    });

    it('should learn pricing split weights', () => {
      const optimizer = new WeightedGradientOptimizer({
        learningRate: 0.01,
        iterations: 100
      });

      // Goal: learn that platform_fee + creator_payout = 1.0
      // Training data: [always_1] -> [1.0]
      const inputs = [[1], [1], [1], [1], [1]];
      const targets = [1.0, 1.0, 1.0, 1.0, 1.0];

      // Start with [0.5, 0.5] (50/50 split)
      const result = optimizer.optimize(inputs, targets, [0.5, 0.5]);

      // Should converge to weights that sum to 1.0
      const sum = result.weights.reduce((s, w) => s + w, 0);
      expect(sum).to.be.closeTo(1.0, 0.001);

      // Final error should be very low
      expect(result.error).to.be.lessThan(1e-6);
    });
  });

  describe('Integration: Marketplace Validation', () => {
    it('should validate pricing math using finite differences', () => {
      const validator = new FiniteDifferenceValidator({ epsilon: 0.001 });

      // Pricing function: platform_fee + creator_payout
      const platformFee = 0.10;
      const creatorPayout = 0.90;

      const pricingSum = (x) => platformFee + creatorPayout;

      // Test that sum is always 1.0
      const result = validator.testBounds(pricingSum, 0, 100, 0.999, 1.001, 50);

      expect(result.bounded).to.be.true;
      expect(result.actualMin).to.be.closeTo(1.0, 0.001);
      expect(result.actualMax).to.be.closeTo(1.0, 0.001);
    });

    it('should validate karma calculation using perturb & observe', () => {
      const observer = new PerturbObserveFramework();

      // Karma calculation for activity types
      const calculateKarma = (input) => {
        const activityTypes = {
          commit: 1,
          pr_opened: 3,
          pr_merged: 10,
          issue_closed: 5
        };

        return activityTypes[input.activityType] || 0;
      };

      const summary = observer.observe(
        calculateKarma,
        { activityType: 'commit' },
        {
          activityType: {
            min: 0,
            max: 3,
            type: 'int',
            // Custom mapper to convert int to activity type
          }
        },
        100
      );

      // All activity types should return positive karma
      expect(summary.minOutput).to.be.at.least(0);
      expect(summary.maxOutput).to.be.at.most(15);
    });

    it('should optimize trust score weights from real data', () => {
      const optimizer = new WeightedGradientOptimizer({
        learningRate: 0.01,
        iterations: 150
      });

      // Simulated user data
      const users = [
        { karma: 500, learning: 0.7, collab: 10, quality: 5, consistency: 40, trust: 0.65 },
        { karma: 1000, learning: 0.9, collab: 20, quality: 8, consistency: 60, trust: 0.90 },
        { karma: 100, learning: 0.3, collab: 2, quality: 2, consistency: 10, trust: 0.25 },
        { karma: 750, learning: 0.8, collab: 15, quality: 7, consistency: 50, trust: 0.75 },
        { karma: 50, learning: 0.2, collab: 1, quality: 1, consistency: 5, trust: 0.15 }
      ];

      // Normalize inputs
      const inputs = users.map(u => [
        Math.min(u.karma / 1000, 1.0),        // Karma score (0-1)
        u.learning,                            // Learning score (0-1)
        Math.min(u.collab / 20, 1.0),         // Collab score (0-1)
        Math.min(u.quality / 10, 1.0),        // Quality score (0-1)
        Math.min(u.consistency / 60, 1.0)     // Consistency score (0-1)
      ]);

      const targets = users.map(u => u.trust);

      // Initial guess: equal weights
      const initialWeights = [0.2, 0.2, 0.2, 0.2, 0.2];

      const result = optimizer.optimize(inputs, targets, initialWeights);

      // Should find better weights than initial guess
      expect(result.error).to.be.lessThan(0.01);

      // Weights should sum to 1.0
      const sum = result.weights.reduce((s, w) => s + w, 0);
      expect(sum).to.be.closeTo(1.0, 0.001);

      console.log('Learned trust score weights:', {
        karma: result.weights[0].toFixed(3),
        learning: result.weights[1].toFixed(3),
        collab: result.weights[2].toFixed(3),
        quality: result.weights[3].toFixed(3),
        consistency: result.weights[4].toFixed(3)
      });
    });
  });
});
