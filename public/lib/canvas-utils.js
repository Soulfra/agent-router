/**
 * CanvasUtils - Canvas drawing utilities for CalOS
 *
 * Provides:
 * - Shape drawing (circles, rounded rectangles, polygons, stars)
 * - Gradient helpers (linear, radial, conic)
 * - Pattern creation (dots, stripes, checkerboard)
 * - Image manipulation (crop, resize, filters)
 * - Color utilities (hex to RGB, blend modes)
 * - Text rendering with shadows/outlines
 * - Path drawing and morphing
 *
 * Usage:
 *   const utils = new CanvasUtils(canvas);
 *   utils.drawRoundedRect(10, 10, 100, 50, 8, '#4a9eff');
 *   utils.applyGradient('linear', ['#ff0000', '#00ff00']);
 */

class CanvasUtils {
  constructor(canvas) {
    if (!canvas) {
      throw new Error('CanvasUtils requires a canvas element');
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Cache for patterns and gradients
    this.patternCache = new Map();
    this.gradientCache = new Map();
  }

  // ============================================================================
  // BASIC SHAPES
  // ============================================================================

  /**
   * Draw rounded rectangle
   */
  drawRoundedRect(x, y, width, height, radius, fillColor = null, strokeColor = null, lineWidth = 1) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();

    if (fillColor) {
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
    }

    if (strokeColor) {
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  /**
   * Draw circle
   */
  drawCircle(x, y, radius, fillColor = null, strokeColor = null, lineWidth = 1) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);

    if (fillColor) {
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
    }

    if (strokeColor) {
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  /**
   * Draw polygon
   */
  drawPolygon(x, y, sides, radius, rotation = 0, fillColor = null, strokeColor = null, lineWidth = 1) {
    this.ctx.beginPath();

    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides + rotation;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;

      if (i === 0) {
        this.ctx.moveTo(px, py);
      } else {
        this.ctx.lineTo(px, py);
      }
    }

    this.ctx.closePath();

    if (fillColor) {
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
    }

    if (strokeColor) {
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  /**
   * Draw star
   */
  drawStar(x, y, points, outerRadius, innerRadius, fillColor = null, strokeColor = null, lineWidth = 1) {
    this.ctx.beginPath();

    for (let i = 0; i < points * 2; i++) {
      const angle = (Math.PI * i) / points - Math.PI / 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;

      if (i === 0) {
        this.ctx.moveTo(px, py);
      } else {
        this.ctx.lineTo(px, py);
      }
    }

    this.ctx.closePath();

    if (fillColor) {
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
    }

    if (strokeColor) {
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
  }

  /**
   * Draw arrow
   */
  drawArrow(x1, y1, x2, y2, headSize = 10, strokeColor = '#000', lineWidth = 2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);

    // Line
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = lineWidth;
    this.ctx.stroke();

    // Arrowhead
    this.ctx.beginPath();
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(
      x2 - headSize * Math.cos(angle - Math.PI / 6),
      y2 - headSize * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.lineTo(
      x2 - headSize * Math.cos(angle + Math.PI / 6),
      y2 - headSize * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.closePath();
    this.ctx.fillStyle = strokeColor;
    this.ctx.fill();
  }

  // ============================================================================
  // GRADIENTS
  // ============================================================================

  /**
   * Create linear gradient
   */
  createLinearGradient(x1, y1, x2, y2, colorStops) {
    const gradient = this.ctx.createLinearGradient(x1, y1, x2, y2);

    colorStops.forEach((color, index) => {
      const offset = index / (colorStops.length - 1);
      gradient.addColorStop(offset, color);
    });

    return gradient;
  }

  /**
   * Create radial gradient
   */
  createRadialGradient(x, y, innerRadius, outerRadius, colorStops) {
    const gradient = this.ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius);

    colorStops.forEach((color, index) => {
      const offset = index / (colorStops.length - 1);
      gradient.addColorStop(offset, color);
    });

    return gradient;
  }

  /**
   * Create conic gradient (modern browsers)
   */
  createConicGradient(x, y, startAngle, colorStops) {
    if (!this.ctx.createConicGradient) {
      console.warn('Conic gradients not supported in this browser');
      return colorStops[0];
    }

    const gradient = this.ctx.createConicGradient(startAngle, x, y);

    colorStops.forEach((color, index) => {
      const offset = index / (colorStops.length - 1);
      gradient.addColorStop(offset, color);
    });

    return gradient;
  }

  // ============================================================================
  // PATTERNS
  // ============================================================================

  /**
   * Create dot pattern
   */
  createDotPattern(dotSize = 3, spacing = 10, color = '#000', bgColor = 'transparent') {
    const cacheKey = `dot-${dotSize}-${spacing}-${color}-${bgColor}`;
    if (this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey);
    }

    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = spacing;
    patternCanvas.height = spacing;
    const patternCtx = patternCanvas.getContext('2d');

    if (bgColor !== 'transparent') {
      patternCtx.fillStyle = bgColor;
      patternCtx.fillRect(0, 0, spacing, spacing);
    }

    patternCtx.fillStyle = color;
    patternCtx.beginPath();
    patternCtx.arc(spacing / 2, spacing / 2, dotSize / 2, 0, Math.PI * 2);
    patternCtx.fill();

    const pattern = this.ctx.createPattern(patternCanvas, 'repeat');
    this.patternCache.set(cacheKey, pattern);
    return pattern;
  }

  /**
   * Create stripe pattern
   */
  createStripePattern(stripeWidth = 5, spacing = 10, color = '#000', bgColor = 'transparent', angle = 45) {
    const cacheKey = `stripe-${stripeWidth}-${spacing}-${color}-${bgColor}-${angle}`;
    if (this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey);
    }

    const patternCanvas = document.createElement('canvas');
    const size = stripeWidth + spacing;
    patternCanvas.width = size;
    patternCanvas.height = size;
    const patternCtx = patternCanvas.getContext('2d');

    if (bgColor !== 'transparent') {
      patternCtx.fillStyle = bgColor;
      patternCtx.fillRect(0, 0, size, size);
    }

    patternCtx.fillStyle = color;
    patternCtx.fillRect(0, 0, stripeWidth, size);

    const pattern = this.ctx.createPattern(patternCanvas, 'repeat');
    this.patternCache.set(cacheKey, pattern);
    return pattern;
  }

  /**
   * Create checkerboard pattern
   */
  createCheckerboardPattern(squareSize = 10, color1 = '#fff', color2 = '#000') {
    const cacheKey = `checker-${squareSize}-${color1}-${color2}`;
    if (this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey);
    }

    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = squareSize * 2;
    patternCanvas.height = squareSize * 2;
    const patternCtx = patternCanvas.getContext('2d');

    patternCtx.fillStyle = color1;
    patternCtx.fillRect(0, 0, squareSize, squareSize);
    patternCtx.fillRect(squareSize, squareSize, squareSize, squareSize);

    patternCtx.fillStyle = color2;
    patternCtx.fillRect(squareSize, 0, squareSize, squareSize);
    patternCtx.fillRect(0, squareSize, squareSize, squareSize);

    const pattern = this.ctx.createPattern(patternCanvas, 'repeat');
    this.patternCache.set(cacheKey, pattern);
    return pattern;
  }

  // ============================================================================
  // IMAGE MANIPULATION
  // ============================================================================

  /**
   * Draw image with opacity
   */
  drawImageWithOpacity(image, x, y, width, height, opacity = 1) {
    const oldAlpha = this.ctx.globalAlpha;
    this.ctx.globalAlpha = opacity;
    this.ctx.drawImage(image, x, y, width, height);
    this.ctx.globalAlpha = oldAlpha;
  }

  /**
   * Apply grayscale filter to canvas
   */
  applyGrayscale(x = 0, y = 0, width = null, height = null) {
    width = width || this.canvas.width;
    height = height || this.canvas.height;

    const imageData = this.ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    this.ctx.putImageData(imageData, x, y);
  }

  /**
   * Apply sepia filter
   */
  applySepia(x = 0, y = 0, width = null, height = null) {
    width = width || this.canvas.width;
    height = height || this.canvas.height;

    const imageData = this.ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
      data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
      data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
    }

    this.ctx.putImageData(imageData, x, y);
  }

  /**
   * Invert colors
   */
  invertColors(x = 0, y = 0, width = null, height = null) {
    width = width || this.canvas.width;
    height = height || this.canvas.height;

    const imageData = this.ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }

    this.ctx.putImageData(imageData, x, y);
  }

  /**
   * Adjust brightness (-255 to 255)
   */
  adjustBrightness(amount, x = 0, y = 0, width = null, height = null) {
    width = width || this.canvas.width;
    height = height || this.canvas.height;

    const imageData = this.ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, data[i] + amount));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + amount));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + amount));
    }

    this.ctx.putImageData(imageData, x, y);
  }

  // ============================================================================
  // TEXT UTILITIES
  // ============================================================================

  /**
   * Draw text with shadow
   */
  drawTextWithShadow(text, x, y, font = '16px sans-serif', color = '#000', shadowColor = '#00000080', shadowBlur = 4, shadowOffsetX = 2, shadowOffsetY = 2) {
    this.ctx.font = font;
    this.ctx.fillStyle = color;
    this.ctx.shadowColor = shadowColor;
    this.ctx.shadowBlur = shadowBlur;
    this.ctx.shadowOffsetX = shadowOffsetX;
    this.ctx.shadowOffsetY = shadowOffsetY;
    this.ctx.fillText(text, x, y);

    // Reset shadow
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 0;
  }

  /**
   * Draw text with outline
   */
  drawTextWithOutline(text, x, y, font = '16px sans-serif', fillColor = '#fff', strokeColor = '#000', strokeWidth = 2) {
    this.ctx.font = font;
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = strokeWidth;
    this.ctx.strokeText(text, x, y);
    this.ctx.fillStyle = fillColor;
    this.ctx.fillText(text, x, y);
  }

  /**
   * Measure text width
   */
  measureText(text, font = '16px sans-serif') {
    this.ctx.font = font;
    return this.ctx.measureText(text).width;
  }

  // ============================================================================
  // COLOR UTILITIES
  // ============================================================================

  /**
   * Convert hex to RGB
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  /**
   * Convert RGB to hex
   */
  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  /**
   * Blend two colors
   */
  blendColors(color1, color2, ratio = 0.5) {
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);

    if (!c1 || !c2) return color1;

    const r = Math.round(c1.r + (c2.r - c1.r) * ratio);
    const g = Math.round(c1.g + (c2.g - c1.g) * ratio);
    const b = Math.round(c1.b + (c2.b - c1.b) * ratio);

    return this.rgbToHex(r, g, b);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Clear canvas
   */
  clear(x = 0, y = 0, width = null, height = null) {
    width = width || this.canvas.width;
    height = height || this.canvas.height;
    this.ctx.clearRect(x, y, width, height);
  }

  /**
   * Fill canvas with color
   */
  fill(color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Save context state
   */
  save() {
    this.ctx.save();
  }

  /**
   * Restore context state
   */
  restore() {
    this.ctx.restore();
  }

  /**
   * Rotate canvas
   */
  rotate(angle, centerX = 0, centerY = 0) {
    this.ctx.translate(centerX, centerY);
    this.ctx.rotate(angle);
    this.ctx.translate(-centerX, -centerY);
  }

  /**
   * Scale canvas
   */
  scale(scaleX, scaleY = scaleX) {
    this.ctx.scale(scaleX, scaleY);
  }

  /**
   * Set blend mode
   */
  setBlendMode(mode = 'source-over') {
    // source-over, multiply, screen, overlay, darken, lighten, etc.
    this.ctx.globalCompositeOperation = mode;
  }

  /**
   * Reset blend mode
   */
  resetBlendMode() {
    this.ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Export canvas to data URL
   */
  toDataURL(type = 'image/png', quality = 1.0) {
    return this.canvas.toDataURL(type, quality);
  }

  /**
   * Export canvas to blob
   */
  async toBlob(type = 'image/png', quality = 1.0) {
    return new Promise((resolve) => {
      this.canvas.toBlob(resolve, type, quality);
    });
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

if (typeof window !== 'undefined') {
  window.CalOSCanvasUtils = CanvasUtils;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CanvasUtils;
}
