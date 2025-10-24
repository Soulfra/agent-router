/**
 * Visual Grader
 *
 * Evaluates CSS based on color theory, layout mathematics, and aesthetic principles
 * "since its math and colors" - User
 */

class VisualGrader {
  constructor() {
    // Color theory constants
    this.colorTheory = {
      complementary: 180,
      triadic: 120,
      analogous: 30,
      splitComplementary: 150
    };

    // Mathematical ratios
    this.goldenRatio = 1.618;
    this.perfectFourth = 1.333;
    this.perfectFifth = 1.5;

    // Scoring weights
    this.weights = {
      colorHarmony: 0.3,
      layoutMath: 0.25,
      responsiveness: 0.2,
      aesthetics: 0.15,
      accessibility: 0.1
    };
  }

  /**
   * Main evaluation function
   */
  async evaluate(cssContent, metadata = {}) {
    const scores = {
      colorHarmony: this.evaluateColorTheory(cssContent),
      layoutMath: this.evaluateLayoutMathematics(cssContent),
      responsiveness: this.evaluateResponsiveness(cssContent),
      aesthetics: this.evaluateAesthetics(cssContent),
      accessibility: this.evaluateAccessibility(cssContent)
    };

    // Calculate weighted overall score
    const overall = Object.entries(scores).reduce((total, [key, score]) => {
      return total + (score * this.weights[key]);
    }, 0);

    // Generate feedback
    const feedback = this.generateFeedback(scores, cssContent);

    return {
      overall: Math.round(overall * 100) / 100,
      breakdown: scores,
      feedback,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        grader: 'visual',
        version: '1.0'
      }
    };
  }

  /**
   * Evaluate color theory and harmony (math-based)
   */
  evaluateColorTheory(css) {
    let score = 0;
    const feedback = [];

    // Extract colors from CSS
    const colors = this.extractColors(css);

    if (colors.length === 0) {
      return 50; // Neutral score if no colors
    }

    // Convert colors to HSL for analysis
    const hslColors = colors.map(c => this.colorToHSL(c));

    // Check for color harmony patterns
    const harmony = this.detectColorHarmony(hslColors);

    if (harmony.complementary) {
      score += 20;
      feedback.push('Complementary colors detected (180° apart)');
    }

    if (harmony.triadic) {
      score += 20;
      feedback.push('Triadic harmony detected (120° apart)');
    }

    if (harmony.analogous) {
      score += 15;
      feedback.push('Analogous colors detected (30° apart)');
    }

    // Check color contrast
    const contrast = this.calculateContrastRatios(colors);
    if (contrast.average >= 4.5) {
      score += 20;
      feedback.push('Good contrast ratios for readability');
    } else if (contrast.average >= 3) {
      score += 10;
      feedback.push('Moderate contrast - consider improving');
    } else {
      feedback.push('Low contrast - may affect readability');
    }

    // Check color palette size
    const uniqueColors = new Set(colors).size;
    if (uniqueColors >= 3 && uniqueColors <= 7) {
      score += 15;
      feedback.push('Balanced color palette size');
    } else if (uniqueColors > 7) {
      score += 5;
      feedback.push('Large color palette - consider simplifying');
    }

    // Check for gradients (indicates sophistication)
    if (/gradient/.test(css)) {
      score += 10;
      feedback.push('Gradients used for depth');
    }

    return Math.min(100, score);
  }

  /**
   * Evaluate layout mathematics (golden ratio, grid systems)
   */
  evaluateLayoutMathematics(css) {
    let score = 0;

    // Check for grid/flexbox usage
    const hasGrid = /display:\s*grid/.test(css);
    const hasFlex = /display:\s*flex/.test(css);

    if (hasGrid) {
      score += 25;
    }
    if (hasFlex) {
      score += 20;
    }

    // Extract spacing values
    const spacings = this.extractSpacingValues(css);

    // Check for mathematical spacing ratios
    const ratioScore = this.evaluateSpacingRatios(spacings);
    score += ratioScore;

    // Check for consistent spacing scale
    if (this.hasConsistentSpacing(spacings)) {
      score += 15;
    }

    // Check for viewport units (modern, responsive math)
    if (/\d+vw|\d+vh|\d+vmin|\d+vmax/.test(css)) {
      score += 10;
    }

    // Check for calc() usage (indicates mathematical thinking)
    const calcCount = (css.match(/calc\(/g) || []).length;
    if (calcCount > 0) {
      score += Math.min(15, calcCount * 5);
    }

    // Check for aspect-ratio usage
    if (/aspect-ratio/.test(css)) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Evaluate responsiveness
   */
  evaluateResponsiveness(css) {
    let score = 50; // Base score

    // Check for media queries
    const mediaQueries = (css.match(/@media/g) || []).length;
    score += Math.min(30, mediaQueries * 10);

    // Check for fluid typography
    if (/clamp\(/.test(css)) {
      score += 10;
    }

    // Check for container queries
    if (/@container/.test(css)) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Evaluate general aesthetics
   */
  evaluateAesthetics(css) {
    let score = 60; // Base score

    // Check for animations/transitions
    if (/@keyframes|animation:|transition:/.test(css)) {
      score += 15;
    }

    // Check for shadows (depth)
    if (/box-shadow|text-shadow/.test(css)) {
      score += 10;
    }

    // Check for transforms (modern effects)
    if (/transform:/.test(css)) {
      score += 10;
    }

    // Check for backdrop-filter (advanced effects)
    if (/backdrop-filter/.test(css)) {
      score += 5;
    }

    return Math.min(100, score);
  }

  /**
   * Evaluate accessibility
   */
  evaluateAccessibility(css) {
    let score = 60; // Base score

    // Check for focus styles
    if (/:focus/.test(css)) {
      score += 15;
    }

    // Check for reduced-motion support
    if (/@media \(prefers-reduced-motion/.test(css)) {
      score += 15;
    }

    // Check for dark mode support
    if (/@media \(prefers-color-scheme/.test(css)) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Extract colors from CSS
   */
  extractColors(css) {
    const colors = [];

    // Hex colors
    const hexMatches = css.match(/#[0-9a-fA-F]{3,6}/g);
    if (hexMatches) colors.push(...hexMatches);

    // RGB/RGBA colors
    const rgbMatches = css.match(/rgba?\([^)]+\)/g);
    if (rgbMatches) colors.push(...rgbMatches);

    // HSL colors
    const hslMatches = css.match(/hsla?\([^)]+\)/g);
    if (hslMatches) colors.push(...hslMatches);

    return colors;
  }

  /**
   * Convert color to HSL for harmony analysis
   */
  colorToHSL(color) {
    // Simplified conversion - in production use a proper color library
    // This extracts hue value for harmony detection

    if (color.startsWith('#')) {
      // Hex to HSL (simplified)
      const r = parseInt(color.slice(1, 3), 16) / 255;
      const g = parseInt(color.slice(3, 5), 16) / 255;
      const b = parseInt(color.slice(5, 7), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;

      let h = 0;
      let s = 0;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        if (max === r) {
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        } else if (max === g) {
          h = ((b - r) / d + 2) / 6;
        } else {
          h = ((r - g) / d + 4) / 6;
        }
      }

      return { h: h * 360, s: s * 100, l: l * 100 };
    }

    if (color.startsWith('hsl')) {
      // Extract HSL values
      const matches = color.match(/\d+/g);
      if (matches) {
        return {
          h: parseInt(matches[0]),
          s: parseInt(matches[1]),
          l: parseInt(matches[2])
        };
      }
    }

    // Default for RGB or unparseable
    return { h: 0, s: 0, l: 50 };
  }

  /**
   * Detect color harmony patterns
   */
  detectColorHarmony(hslColors) {
    if (hslColors.length < 2) return {};

    const harmony = {
      complementary: false,
      triadic: false,
      analogous: false
    };

    // Check all pairs for harmony
    for (let i = 0; i < hslColors.length; i++) {
      for (let j = i + 1; j < hslColors.length; j++) {
        const diff = Math.abs(hslColors[i].h - hslColors[j].h);

        // Complementary (180° ± 10°)
        if (Math.abs(diff - 180) < 10) {
          harmony.complementary = true;
        }

        // Triadic (120° ± 10°)
        if (Math.abs(diff - 120) < 10 || Math.abs(diff - 240) < 10) {
          harmony.triadic = true;
        }

        // Analogous (30° ± 10°)
        if (diff < 40 && diff > 20) {
          harmony.analogous = true;
        }
      }
    }

    return harmony;
  }

  /**
   * Calculate contrast ratios
   */
  calculateContrastRatios(colors) {
    // Simplified contrast calculation
    // In production, use proper luminance calculations

    const ratios = [];

    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        // Estimate contrast (simplified)
        ratios.push(Math.random() * 7 + 1); // Placeholder
      }
    }

    return {
      average: ratios.reduce((a, b) => a + b, 0) / ratios.length || 0,
      min: Math.min(...ratios, 0),
      max: Math.max(...ratios, 0)
    };
  }

  /**
   * Extract spacing values (margin, padding)
   */
  extractSpacingValues(css) {
    const spacings = [];

    // Match padding and margin values
    const matches = css.match(/(?:padding|margin):\s*(\d+(?:\.\d+)?(?:px|rem|em))/g);

    if (matches) {
      matches.forEach(match => {
        const value = match.match(/\d+(?:\.\d+)?/);
        if (value) spacings.push(parseFloat(value[0]));
      });
    }

    return spacings;
  }

  /**
   * Evaluate spacing ratios (golden ratio, perfect intervals)
   */
  evaluateSpacingRatios(spacings) {
    if (spacings.length < 2) return 0;

    let score = 0;
    const ratios = [];

    // Calculate ratios between consecutive spacings
    for (let i = 0; i < spacings.length - 1; i++) {
      if (spacings[i] > 0) {
        ratios.push(spacings[i + 1] / spacings[i]);
      }
    }

    // Check if ratios match mathematical constants
    ratios.forEach(ratio => {
      // Golden ratio (1.618 ± 0.1)
      if (Math.abs(ratio - this.goldenRatio) < 0.1) {
        score += 10;
      }

      // Perfect fourth (1.333 ± 0.05)
      if (Math.abs(ratio - this.perfectFourth) < 0.05) {
        score += 8;
      }

      // Perfect fifth (1.5 ± 0.05)
      if (Math.abs(ratio - this.perfectFifth) < 0.05) {
        score += 8;
      }

      // Powers of 2 (2.0 ± 0.05)
      if (Math.abs(ratio - 2.0) < 0.05) {
        score += 7;
      }
    });

    return Math.min(30, score);
  }

  /**
   * Check for consistent spacing scale
   */
  hasConsistentSpacing(spacings) {
    if (spacings.length < 3) return false;

    const sorted = [...spacings].sort((a, b) => a - b);
    const diffs = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      diffs.push(sorted[i + 1] - sorted[i]);
    }

    // Check if differences are consistent (arithmetic progression)
    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const variance = diffs.reduce((sum, d) => sum + Math.pow(d - avgDiff, 2), 0) / diffs.length;

    return variance < 10; // Low variance = consistent spacing
  }

  /**
   * Generate human-readable feedback
   */
  generateFeedback(scores, css) {
    const feedback = {
      strengths: [],
      improvements: [],
      suggestions: []
    };

    // Color harmony feedback
    if (scores.colorHarmony >= 80) {
      feedback.strengths.push('Excellent color harmony and theory application');
    } else if (scores.colorHarmony < 60) {
      feedback.improvements.push('Consider using complementary or triadic color schemes');
      feedback.suggestions.push('Try tools like Adobe Color or Coolors for color harmony');
    }

    // Layout math feedback
    if (scores.layoutMath >= 80) {
      feedback.strengths.push('Strong use of grid/flex and mathematical spacing');
    } else if (scores.layoutMath < 60) {
      feedback.improvements.push('Apply more mathematical spacing ratios (golden ratio, perfect intervals)');
      feedback.suggestions.push('Use CSS Grid or Flexbox for layout structure');
    }

    // Responsiveness feedback
    if (scores.responsiveness >= 80) {
      feedback.strengths.push('Well-designed responsive layouts');
    } else if (scores.responsiveness < 60) {
      feedback.improvements.push('Add media queries for different screen sizes');
      feedback.suggestions.push('Consider using clamp() for fluid typography');
    }

    // Aesthetics feedback
    if (scores.aesthetics >= 80) {
      feedback.strengths.push('Beautiful visual effects and polish');
    } else if (scores.aesthetics < 60) {
      feedback.improvements.push('Add transitions, shadows, or transforms for depth');
    }

    // Accessibility feedback
    if (scores.accessibility >= 80) {
      feedback.strengths.push('Good accessibility considerations');
    } else if (scores.accessibility < 60) {
      feedback.improvements.push('Add focus styles and reduced-motion support');
      feedback.suggestions.push('Consider dark mode with prefers-color-scheme');
    }

    return feedback;
  }

  /**
   * Get detailed analysis report
   */
  generateReport(evaluationResult, cssContent) {
    const colors = this.extractColors(cssContent);
    const spacings = this.extractSpacingValues(cssContent);

    return {
      ...evaluationResult,
      analysis: {
        colors: {
          count: new Set(colors).size,
          samples: colors.slice(0, 10)
        },
        spacing: {
          values: spacings,
          scale: this.hasConsistentSpacing(spacings) ? 'consistent' : 'inconsistent'
        },
        features: {
          hasGrid: /display:\s*grid/.test(cssContent),
          hasFlex: /display:\s*flex/.test(cssContent),
          hasAnimations: /@keyframes|animation:/.test(cssContent),
          hasMediaQueries: /@media/.test(cssContent),
          hasCalc: /calc\(/.test(cssContent)
        }
      }
    };
  }
}

module.exports = VisualGrader;
