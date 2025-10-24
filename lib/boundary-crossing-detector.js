/**
 * Boundary Crossing Detector
 *
 * Uses bisection (binary search) to find exact points where a continuous
 * value crosses threshold boundaries.
 *
 * Problem: Given discrete samples (before: 1190, after: 1250), we miss
 * the exact moment when value crosses threshold (1200).
 *
 * Solution: Binary search / interpolation to find precise crossing point.
 *
 * Applications:
 * - ELO tier boundaries (when did player EXACTLY hit Master tier?)
 * - Price levels (when did price EXACTLY cross $50?)
 * - Collision detection (when did ray EXACTLY hit surface?)
 * - State transitions (when did system EXACTLY change state?)
 */

class BoundaryCrossingDetector {
  /**
   * Find all boundary crossings between two values
   *
   * @param {number} valueStart - Starting value
   * @param {number} valueEnd - Ending value
   * @param {array} boundaries - Array of boundary values to check
   * @param {number} tolerance - How precise (default: 0.01)
   * @returns {array} Array of crossing events
   */
  findCrossings(valueStart, valueEnd, boundaries, tolerance = 0.01) {
    const crossings = [];

    // Sort boundaries
    const sortedBoundaries = [...boundaries].sort((a, b) => a - b);

    // Determine direction
    const increasing = valueEnd > valueStart;

    // Find which boundaries we crossed
    for (const boundary of sortedBoundaries) {
      if (increasing) {
        // Moving up: crossed if start < boundary <= end
        if (valueStart < boundary && valueEnd >= boundary) {
          const crossingPoint = this.findExactCrossing(
            valueStart,
            valueEnd,
            boundary,
            tolerance
          );
          crossings.push({
            boundary: boundary,
            crossingValue: crossingPoint,
            direction: 'up',
            progress: (boundary - valueStart) / (valueEnd - valueStart)
          });
        }
      } else {
        // Moving down: crossed if start > boundary >= end
        if (valueStart > boundary && valueEnd <= boundary) {
          const crossingPoint = this.findExactCrossing(
            valueStart,
            valueEnd,
            boundary,
            tolerance
          );
          crossings.push({
            boundary: boundary,
            crossingValue: crossingPoint,
            direction: 'down',
            progress: (valueStart - boundary) / (valueStart - valueEnd)
          });
        }
      }
    }

    return crossings;
  }

  /**
   * Find exact crossing point using bisection
   *
   * Uses binary search to narrow down where exactly the value crossed
   * a threshold between start and end points.
   *
   * @param {number} start - Starting value
   * @param {number} end - Ending value
   * @param {number} boundary - Boundary to find
   * @param {number} tolerance - Precision (0.01 = within 0.01 of exact)
   * @returns {number} Interpolated crossing position
   */
  findExactCrossing(start, end, boundary, tolerance = 0.01) {
    let low = start;
    let high = end;
    let iterations = 0;
    const maxIterations = 100;

    // Binary search until we're within tolerance
    while (Math.abs(high - low) > tolerance && iterations < maxIterations) {
      const mid = (low + high) / 2;

      if (start < end) {
        // Increasing: if midpoint < boundary, search upper half
        if (mid < boundary) {
          low = mid;
        } else {
          high = mid;
        }
      } else {
        // Decreasing: if midpoint > boundary, search upper half
        if (mid > boundary) {
          low = mid;
        } else {
          high = mid;
        }
      }

      iterations++;
    }

    // Return the midpoint as our best estimate
    return (low + high) / 2;
  }

  /**
   * Find exact crossing with interpolation function
   *
   * For non-linear interpolation (e.g., ELO rating based on match outcome)
   *
   * @param {function} interpolateFn - Function that takes t (0-1) and returns interpolated value
   * @param {number} boundary - Boundary value to find
   * @param {number} tolerance - Precision
   * @returns {number} Parameter t (0-1) where crossing occurs
   */
  findCrossingParameter(interpolateFn, boundary, tolerance = 0.001) {
    let low = 0;
    let high = 1;
    let iterations = 0;
    const maxIterations = 100;

    const startValue = interpolateFn(0);
    const endValue = interpolateFn(1);
    const increasing = endValue > startValue;

    while (high - low > tolerance && iterations < maxIterations) {
      const mid = (low + high) / 2;
      const midValue = interpolateFn(mid);

      if (increasing) {
        if (midValue < boundary) {
          low = mid;
        } else {
          high = mid;
        }
      } else {
        if (midValue > boundary) {
          low = mid;
        } else {
          high = mid;
        }
      }

      iterations++;
    }

    return (low + high) / 2;
  }

  /**
   * Check if point is within boundary range
   *
   * @param {number} value - Value to check
   * @param {number} min - Minimum boundary
   * @param {number} max - Maximum boundary
   * @returns {boolean} True if within range
   */
  isWithinBoundary(value, min, max) {
    return value >= min && value <= max;
  }

  /**
   * Find all integer crossings (useful for level-ups)
   *
   * Example: Rating goes from 1190.5 to 1250.8, crosses integers 1191, 1192, ..., 1250
   *
   * @param {number} start - Starting value
   * @param {number} end - Ending value
   * @returns {array} Array of integer values crossed
   */
  findIntegerCrossings(start, end) {
    const crossings = [];
    const minVal = Math.min(start, end);
    const maxVal = Math.max(start, end);

    const firstInt = Math.ceil(minVal);
    const lastInt = Math.floor(maxVal);

    for (let i = firstInt; i <= lastInt; i++) {
      crossings.push(i);
    }

    return crossings;
  }

  /**
   * Linear interpolation between two points
   *
   * @param {number} start - Start value
   * @param {number} end - End value
   * @param {number} t - Parameter (0-1)
   * @returns {number} Interpolated value
   */
  lerp(start, end, t) {
    return start + (end - start) * t;
  }

  /**
   * Inverse linear interpolation (find t given value)
   *
   * @param {number} start - Start value
   * @param {number} end - End value
   * @param {number} value - Value to find parameter for
   * @returns {number} Parameter t (0-1)
   */
  inverseLerp(start, end, value) {
    if (Math.abs(end - start) < 0.0001) {
      return 0;
    }
    return (value - start) / (end - start);
  }

  /**
   * Generate crossing events with timestamps
   *
   * Useful for time-based systems (price charts, game replays)
   *
   * @param {number} valueStart - Starting value
   * @param {number} valueEnd - Ending value
   * @param {number} timeStart - Start timestamp (ms)
   * @param {number} timeEnd - End timestamp (ms)
   * @param {array} boundaries - Boundaries to check
   * @returns {array} Array of timed crossing events
   */
  findTimedCrossings(valueStart, valueEnd, timeStart, timeEnd, boundaries) {
    const crossings = this.findCrossings(valueStart, valueEnd, boundaries);

    return crossings.map(crossing => {
      // Calculate timestamp of crossing using linear interpolation
      const t = crossing.progress;
      const timestamp = this.lerp(timeStart, timeEnd, t);

      return {
        ...crossing,
        timestamp: timestamp,
        timestampReadable: new Date(timestamp).toISOString()
      };
    });
  }
}

module.exports = BoundaryCrossingDetector;
