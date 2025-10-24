/**
 * Numerical Testing Framework
 *
 * "We're too lazy for derivatives" - Machine Learning in C Style
 *
 * This library formalizes numerical optimization and testing patterns
 * that we use throughout the system:
 *
 * 1. Finite Differences - Test small perturbations (lazy derivatives)
 * 2. Perturb & Observe - Black-box ML-style testing
 * 3. Weighted Gradients - Blender-style coefficient tuning
 * 4. Secant Method - Approximate slopes from two points
 *
 * Why This Exists:
 * When validating the marketplace system, we realized we were doing
 * numerical optimization without explicitly calling it that. This makes
 * those patterns reusable and well-documented.
 *
 * Mathematical Background:
 * - Derivative: f'(x) = lim(h→0) [f(x+h) - f(x)] / h
 * - Finite Difference: f'(x) ≈ [f(x+h) - f(x)] / h  (for small h)
 * - Secant: slope ≈ (y₂ - y₁) / (x₂ - x₁)
 * - Gradient Descent: x_new = x_old - α * ∇f(x)
 *
 * Our Approach:
 * "Fuck calculus, just perturb it and see what happens"
 */

class FiniteDifferenceValidator {
  constructor(options = {}) {
    this.epsilon = options.epsilon || 0.001; // The "h" in f(x+h)
    this.tolerance = options.tolerance || 1e-6; // Acceptable error
    this.verbose = options.verbose || false;
  }

  /**
   * Test if a function's output changes smoothly with input
   * (i.e., is it continuous? does it have weird jumps?)
   *
   * @param {Function} fn - Function to test
   * @param {number} x - Point to test around
   * @param {object} options - Optional overrides
   * @returns {object} { continuous, slope, leftValue, rightValue }
   */
  testContinuity(fn, x, options = {}) {
    const epsilon = options.epsilon || this.epsilon;

    // Sample left and right
    const leftValue = fn(x - epsilon);
    const centerValue = fn(x);
    const rightValue = fn(x + epsilon);

    // Approximate derivative (slope)
    const leftSlope = (centerValue - leftValue) / epsilon;
    const rightSlope = (rightValue - centerValue) / epsilon;

    // Check if slopes match (continuous derivative)
    const slopeDiff = Math.abs(rightSlope - leftSlope);
    const continuous = slopeDiff < this.tolerance;

    if (this.verbose) {
      console.log(`[FiniteDiff] Testing continuity at x=${x}`);
      console.log(`  Left:   ${leftValue}`);
      console.log(`  Center: ${centerValue}`);
      console.log(`  Right:  ${rightValue}`);
      console.log(`  Left slope:  ${leftSlope}`);
      console.log(`  Right slope: ${rightSlope}`);
      console.log(`  Continuous: ${continuous}`);
    }

    return {
      continuous,
      slope: (leftSlope + rightSlope) / 2,
      leftValue,
      centerValue,
      rightValue,
      leftSlope,
      rightSlope
    };
  }

  /**
   * Test if a function is monotonic (always increasing or decreasing)
   *
   * @param {Function} fn - Function to test
   * @param {number} start - Start of range
   * @param {number} end - End of range
   * @param {number} samples - Number of sample points
   * @returns {object} { monotonic, direction, violations }
   */
  testMonotonicity(fn, start, end, samples = 100) {
    const step = (end - start) / samples;
    let previousValue = fn(start);
    let direction = null; // 'increasing', 'decreasing', or 'mixed'
    const violations = [];

    for (let i = 1; i <= samples; i++) {
      const x = start + i * step;
      const value = fn(x);

      if (value > previousValue) {
        if (direction === 'decreasing') {
          violations.push({ x, expected: 'decreasing', actual: 'increasing' });
        }
        direction = direction || 'increasing';
      } else if (value < previousValue) {
        if (direction === 'increasing') {
          violations.push({ x, expected: 'increasing', actual: 'decreasing' });
        }
        direction = direction || 'decreasing';
      }

      previousValue = value;
    }

    const monotonic = violations.length === 0;

    if (this.verbose) {
      console.log(`[FiniteDiff] Monotonicity test: ${monotonic ? 'PASS' : 'FAIL'}`);
      console.log(`  Direction: ${direction}`);
      console.log(`  Violations: ${violations.length}`);
    }

    return { monotonic, direction, violations };
  }

  /**
   * Test if a function is bounded (output stays within range)
   *
   * @param {Function} fn - Function to test
   * @param {number} start - Start of input range
   * @param {number} end - End of input range
   * @param {number} min - Min expected output
   * @param {number} max - Max expected output
   * @param {number} samples - Number of sample points
   * @returns {object} { bounded, violations, actualMin, actualMax }
   */
  testBounds(fn, start, end, min, max, samples = 100) {
    const step = (end - start) / samples;
    let actualMin = Infinity;
    let actualMax = -Infinity;
    const violations = [];

    for (let i = 0; i <= samples; i++) {
      const x = start + i * step;
      const value = fn(x);

      actualMin = Math.min(actualMin, value);
      actualMax = Math.max(actualMax, value);

      if (value < min || value > max) {
        violations.push({ x, value, min, max });
      }
    }

    const bounded = violations.length === 0;

    if (this.verbose) {
      console.log(`[FiniteDiff] Bounds test: ${bounded ? 'PASS' : 'FAIL'}`);
      console.log(`  Expected: [${min}, ${max}]`);
      console.log(`  Actual: [${actualMin}, ${actualMax}]`);
      console.log(`  Violations: ${violations.length}`);
    }

    return { bounded, violations, actualMin, actualMax };
  }

  /**
   * Approximate the derivative at a point using finite differences
   * (Central difference formula for better accuracy)
   *
   * @param {Function} fn - Function to differentiate
   * @param {number} x - Point to evaluate at
   * @param {object} options - Optional overrides
   * @returns {number} Approximate derivative
   */
  derivative(fn, x, options = {}) {
    const epsilon = options.epsilon || this.epsilon;

    // Central difference: f'(x) ≈ [f(x+h) - f(x-h)] / 2h
    const forward = fn(x + epsilon);
    const backward = fn(x - epsilon);

    return (forward - backward) / (2 * epsilon);
  }

  /**
   * Approximate the second derivative (curvature)
   *
   * @param {Function} fn - Function
   * @param {number} x - Point
   * @returns {number} Approximate second derivative
   */
  secondDerivative(fn, x) {
    const h = this.epsilon;

    // f''(x) ≈ [f(x+h) - 2f(x) + f(x-h)] / h²
    const forward = fn(x + h);
    const center = fn(x);
    const backward = fn(x - h);

    return (forward - 2 * center + backward) / (h * h);
  }
}

/**
 * Perturb & Observe Framework
 *
 * Black-box testing for ML-style systems.
 * "I don't know what this function does, but let's poke it and see."
 */
class PerturbObserveFramework {
  constructor(options = {}) {
    this.observations = [];
    this.verbose = options.verbose || false;
  }

  /**
   * Observe a function's behavior with random perturbations
   *
   * @param {Function} fn - Function to test
   * @param {object} baseInput - Base input object
   * @param {object} perturbations - Fields to perturb and their ranges
   * @param {number} iterations - Number of random trials
   * @returns {object} Summary statistics
   */
  observe(fn, baseInput, perturbations, iterations = 100) {
    const observations = [];

    for (let i = 0; i < iterations; i++) {
      // Create perturbed input
      const perturbedInput = { ...baseInput };

      for (const [field, range] of Object.entries(perturbations)) {
        const { min, max, type = 'float' } = range;
        const random = Math.random();

        if (type === 'float') {
          perturbedInput[field] = min + random * (max - min);
        } else if (type === 'int') {
          perturbedInput[field] = Math.floor(min + random * (max - min + 1));
        } else if (type === 'bool') {
          perturbedInput[field] = random > 0.5;
        }
      }

      // Observe output
      let output, error;
      try {
        output = fn(perturbedInput);
      } catch (e) {
        error = e.message;
      }

      observations.push({
        input: perturbedInput,
        output,
        error,
        iteration: i
      });
    }

    this.observations = observations;

    // Calculate statistics
    const successful = observations.filter(o => !o.error);
    const failed = observations.filter(o => o.error);

    const outputs = successful.map(o => o.output).filter(o => typeof o === 'number');
    const avgOutput = outputs.length > 0
      ? outputs.reduce((sum, val) => sum + val, 0) / outputs.length
      : null;

    const minOutput = outputs.length > 0 ? Math.min(...outputs) : null;
    const maxOutput = outputs.length > 0 ? Math.max(...outputs) : null;

    const summary = {
      iterations,
      successful: successful.length,
      failed: failed.length,
      successRate: successful.length / iterations,
      avgOutput,
      minOutput,
      maxOutput,
      errors: failed.map(o => o.error)
    };

    if (this.verbose) {
      console.log('[PerturbObserve] Summary:');
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Success rate: ${(summary.successRate * 100).toFixed(1)}%`);
      console.log(`  Output range: [${minOutput}, ${maxOutput}]`);
      console.log(`  Avg output: ${avgOutput}`);
    }

    return summary;
  }

  /**
   * Find which input perturbations cause the most output change
   * (Sensitivity analysis - which knobs actually matter?)
   *
   * @returns {object} Sensitivity scores for each field
   */
  analyzeSensitivity() {
    if (this.observations.length === 0) {
      throw new Error('No observations yet - call observe() first');
    }

    const successful = this.observations.filter(o => !o.error && typeof o.output === 'number');
    if (successful.length < 2) {
      return {};
    }

    // Get all input fields
    const fields = Object.keys(successful[0].input);
    const sensitivity = {};

    for (const field of fields) {
      // Calculate correlation between this field and output
      const values = successful.map(o => o.input[field]);
      const outputs = successful.map(o => o.output);

      const correlation = this.pearsonCorrelation(values, outputs);
      sensitivity[field] = Math.abs(correlation); // Absolute value (we care about strength, not direction)
    }

    return sensitivity;
  }

  /**
   * Calculate Pearson correlation coefficient
   * (Measures linear relationship between two variables)
   */
  pearsonCorrelation(x, y) {
    const n = x.length;
    if (n !== y.length || n === 0) return 0;

    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;

      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    return denominator === 0 ? 0 : numerator / denominator;
  }
}

/**
 * Weighted Gradient Optimizer
 *
 * Blender-style coefficient tuning.
 * "Just adjust the sliders until it looks right."
 */
class WeightedGradientOptimizer {
  constructor(options = {}) {
    this.learningRate = options.learningRate || 0.01;
    this.iterations = options.iterations || 100;
    this.verbose = options.verbose || false;
  }

  /**
   * Optimize weights to minimize error
   *
   * Given:
   * - inputs: array of feature vectors
   * - targets: desired outputs
   * - initialWeights: starting weights
   *
   * Find weights that minimize: error = |weighted_sum - target|
   *
   * @param {Array} inputs - Training data (array of feature vectors)
   * @param {Array} targets - Target outputs
   * @param {Array} initialWeights - Starting weights
   * @returns {object} { weights, error, history }
   */
  optimize(inputs, targets, initialWeights) {
    if (inputs.length !== targets.length) {
      throw new Error('Inputs and targets must have same length');
    }

    let weights = [...initialWeights];
    const history = [];

    for (let iter = 0; iter < this.iterations; iter++) {
      let totalError = 0;
      const gradients = new Array(weights.length).fill(0);

      // For each training example
      for (let i = 0; i < inputs.length; i++) {
        const features = inputs[i];
        const target = targets[i];

        // Calculate weighted sum
        const prediction = features.reduce((sum, feature, j) => sum + feature * weights[j], 0);

        // Calculate error
        const error = prediction - target;
        totalError += error * error; // MSE

        // Calculate gradient for each weight
        // ∂E/∂w_j = 2 * error * feature_j
        for (let j = 0; j < weights.length; j++) {
          gradients[j] += 2 * error * features[j];
        }
      }

      // Average gradients
      for (let j = 0; j < gradients.length; j++) {
        gradients[j] /= inputs.length;
      }

      // Update weights (gradient descent)
      for (let j = 0; j < weights.length; j++) {
        weights[j] -= this.learningRate * gradients[j];
      }

      // Normalize weights to sum to 1.0 (if needed for trust scores, etc.)
      const sum = weights.reduce((s, w) => s + w, 0);
      if (sum > 0) {
        weights = weights.map(w => w / sum);
      }

      const avgError = totalError / inputs.length;
      history.push({ iteration: iter, error: avgError, weights: [...weights] });

      if (this.verbose && iter % 10 === 0) {
        console.log(`[Optimizer] Iteration ${iter}: error=${avgError.toFixed(6)}`);
      }
    }

    const finalError = history[history.length - 1].error;

    if (this.verbose) {
      console.log('[Optimizer] Final weights:', weights);
      console.log('[Optimizer] Final error:', finalError);
    }

    return { weights, error: finalError, history };
  }

  /**
   * Grid search to find best weights
   * (Brute force - try all combinations)
   *
   * @param {Function} evaluateFn - Function that takes weights and returns error
   * @param {number} dimensions - Number of weights
   * @param {number} steps - Steps per dimension
   * @returns {object} { bestWeights, bestError }
   */
  gridSearch(evaluateFn, dimensions, steps = 10) {
    let bestWeights = null;
    let bestError = Infinity;

    const tryWeights = (weights, depth) => {
      if (depth === dimensions) {
        // Normalize to sum to 1.0
        const sum = weights.reduce((s, w) => s + w, 0);
        if (sum === 0) return;

        const normalized = weights.map(w => w / sum);
        const error = evaluateFn(normalized);

        if (error < bestError) {
          bestError = error;
          bestWeights = [...normalized];
        }

        return;
      }

      // Try different values for this weight
      for (let i = 0; i <= steps; i++) {
        const value = i / steps;
        tryWeights([...weights, value], depth + 1);
      }
    };

    tryWeights([], 0);

    if (this.verbose) {
      console.log('[GridSearch] Best weights:', bestWeights);
      console.log('[GridSearch] Best error:', bestError);
    }

    return { bestWeights, bestError };
  }
}

module.exports = {
  FiniteDifferenceValidator,
  PerturbObserveFramework,
  WeightedGradientOptimizer
};
