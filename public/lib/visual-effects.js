/**
 * VisualEffects - Visual effects library for CalOS
 *
 * Provides:
 * - Ripple effect (click/touch feedback)
 * - Shimmer/shine effect
 * - Glow effect
 * - Screen shake
 * - Flash effect
 * - Dissolve effect
 * - Wave distortion
 * - Blur effect
 *
 * Usage:
 *   const effects = new VisualEffects(animationEngine, canvasUtils);
 *   effects.ripple(element, x, y);
 *   effects.shimmer(element);
 *   effects.screenShake(container);
 */

class VisualEffects {
  constructor(animationEngine = null, canvasUtils = null) {
    this.engine = animationEngine;
    this.canvasUtils = canvasUtils;
    this.activeEffects = new Map(); // element => effect info
  }

  // ============================================================================
  // RIPPLE EFFECT
  // ============================================================================

  /**
   * Create ripple effect at position (Material Design style)
   *
   * @param {HTMLElement} element - Element to apply ripple to
   * @param {number} x - X position (relative to element)
   * @param {number} y - Y position (relative to element)
   * @param {Object} options - Effect options
   */
  ripple(element, x, y, options = {}) {
    const {
      color = 'rgba(255, 255, 255, 0.5)',
      duration = 600,
      maxRadius = null
    } = options;

    // Ensure element has position context
    if (getComputedStyle(element).position === 'static') {
      element.style.position = 'relative';
    }

    // Ensure overflow hidden
    const originalOverflow = element.style.overflow;
    element.style.overflow = 'hidden';

    // Create ripple element
    const ripple = document.createElement('div');
    ripple.className = 'calos-ripple';

    // Calculate max radius
    const rect = element.getBoundingClientRect();
    const radius = maxRadius || Math.max(
      Math.sqrt(x * x + y * y),
      Math.sqrt((rect.width - x) ** 2 + y ** 2),
      Math.sqrt(x ** 2 + (rect.height - y) ** 2),
      Math.sqrt((rect.width - x) ** 2 + (rect.height - y) ** 2)
    );

    ripple.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: ${color};
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 1000;
    `;

    element.appendChild(ripple);

    // Animate ripple
    if (this.engine) {
      this.engine.animate(ripple, [
        { width: '0px', height: '0px', opacity: 1 },
        { width: radius * 2 + 'px', height: radius * 2 + 'px', opacity: 0 }
      ], {
        duration,
        easing: 'ease-out',
        onComplete: () => {
          ripple.remove();
          element.style.overflow = originalOverflow;
        }
      });
    }
  }

  /**
   * Add ripple effect to all clicks on element
   */
  addRippleEffect(element, options = {}) {
    const handler = (e) => {
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.ripple(element, x, y, options);
    };

    element.addEventListener('click', handler);

    // Store handler for cleanup
    if (!element._visualEffectHandlers) {
      element._visualEffectHandlers = [];
    }
    element._visualEffectHandlers.push({ event: 'click', handler });
  }

  // ============================================================================
  // SHIMMER/SHINE EFFECT
  // ============================================================================

  /**
   * Create shimmer effect
   */
  shimmer(element, options = {}) {
    const {
      color = 'rgba(255, 255, 255, 0.5)',
      duration = 1500,
      angle = 45,
      width = 50
    } = options;

    const shimmer = document.createElement('div');
    shimmer.className = 'calos-shimmer';

    shimmer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      pointer-events: none;
      z-index: 1;
    `;

    const shine = document.createElement('div');
    shine.style.cssText = `
      position: absolute;
      top: 0;
      left: -${width}%;
      width: ${width}%;
      height: 100%;
      background: linear-gradient(
        ${angle}deg,
        transparent,
        ${color},
        transparent
      );
      transform: skewX(-20deg);
    `;

    shimmer.appendChild(shine);
    element.style.position = element.style.position || 'relative';
    element.appendChild(shimmer);

    // Animate shimmer
    if (this.engine) {
      this.engine.animate(shine, [
        { left: `-${width}%` },
        { left: `${100 + width}%` }
      ], {
        duration,
        easing: 'ease-in-out',
        onComplete: () => {
          shimmer.remove();
        }
      });
    }
  }

  // ============================================================================
  // GLOW EFFECT
  // ============================================================================

  /**
   * Animated glow effect
   */
  glow(element, options = {}) {
    const {
      color = '#4a9eff',
      intensity = 20,
      duration = 1000,
      iterations = 1
    } = options;

    if (!this.engine) {
      console.warn('VisualEffects: AnimationEngine required for glow effect');
      return;
    }

    const animation = this.engine.animate(element, [
      { filter: 'drop-shadow(0 0 0px transparent)' },
      { filter: `drop-shadow(0 0 ${intensity}px ${color})` },
      { filter: 'drop-shadow(0 0 0px transparent)' }
    ], {
      duration,
      easing: 'ease-in-out',
      iterations,
      onComplete: () => {
        this.activeEffects.delete(element);
      }
    });

    this.activeEffects.set(element, { type: 'glow', animation });
    return animation;
  }

  /**
   * Persistent glow (doesn't auto-remove)
   */
  addGlow(element, options = {}) {
    const {
      color = '#4a9eff',
      intensity = 15
    } = options;

    element.style.filter = `drop-shadow(0 0 ${intensity}px ${color})`;
  }

  /**
   * Remove persistent glow
   */
  removeGlow(element) {
    element.style.filter = '';
  }

  // ============================================================================
  // SCREEN SHAKE
  // ============================================================================

  /**
   * Screen shake effect (error/impact)
   */
  screenShake(element, options = {}) {
    const {
      intensity = 10,
      duration = 500,
      frequency = 10
    } = options;

    if (!this.engine) {
      console.warn('VisualEffects: AnimationEngine required for screen shake');
      return;
    }

    const originalTransform = element.style.transform || '';

    // Generate random shake keyframes
    const keyframes = [];
    const steps = Math.floor((duration / 1000) * frequency);

    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const shake = intensity * (1 - progress); // Decay over time

      keyframes.push({
        transform: `translate(${(Math.random() - 0.5) * shake}px, ${(Math.random() - 0.5) * shake}px)`,
        offset: progress
      });
    }

    // End at original position
    keyframes[keyframes.length - 1].transform = originalTransform;

    const animation = this.engine.animate(element, keyframes, {
      duration,
      easing: 'linear',
      onComplete: () => {
        element.style.transform = originalTransform;
        this.activeEffects.delete(element);
      }
    });

    this.activeEffects.set(element, { type: 'shake', animation });
    return animation;
  }

  // ============================================================================
  // FLASH EFFECT
  // ============================================================================

  /**
   * Flash effect (screen flash, damage indicator, etc.)
   */
  flash(element, options = {}) {
    const {
      color = 'rgba(255, 255, 255, 0.8)',
      duration = 300,
      iterations = 1
    } = options;

    const flash = document.createElement('div');
    flash.className = 'calos-flash';
    flash.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${color};
      pointer-events: none;
      z-index: 10000;
    `;

    element.style.position = element.style.position || 'relative';
    element.appendChild(flash);

    if (this.engine) {
      this.engine.animate(flash, [
        { opacity: 0 },
        { opacity: 1, offset: 0.5 },
        { opacity: 0 }
      ], {
        duration,
        easing: 'ease-in-out',
        iterations,
        onComplete: () => {
          flash.remove();
        }
      });
    }
  }

  /**
   * Screen flash (full screen)
   */
  screenFlash(options = {}) {
    const {
      color = 'rgba(255, 255, 255, 0.9)',
      duration = 200
    } = options;

    const flash = document.createElement('div');
    flash.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${color};
      pointer-events: none;
      z-index: 999999;
    `;

    document.body.appendChild(flash);

    if (this.engine) {
      this.engine.animate(flash, [
        { opacity: 1 },
        { opacity: 0 }
      ], {
        duration,
        easing: 'ease-out',
        onComplete: () => {
          flash.remove();
        }
      });
    }
  }

  // ============================================================================
  // DISSOLVE EFFECT
  // ============================================================================

  /**
   * Dissolve/disintegrate effect
   */
  async dissolve(element, options = {}) {
    const {
      duration = 1000,
      particles = 20
    } = options;

    if (!this.canvasUtils) {
      console.warn('VisualEffects: CanvasUtils required for dissolve effect');
      // Fallback to simple fade
      if (this.engine) {
        return this.engine.animate(element, [
          { opacity: 1 },
          { opacity: 0 }
        ], { duration });
      }
      return;
    }

    // Create canvas overlay
    const rect = element.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.cssText = `
      position: absolute;
      top: ${rect.top}px;
      left: ${rect.left}px;
      pointer-events: none;
      z-index: 10000;
    `;

    document.body.appendChild(canvas);
    const utils = new (this.canvasUtils.constructor)(canvas);

    // Capture element as image
    // (In production, you'd use html2canvas or similar)
    element.style.opacity = '0';

    // Create particle system
    const particleList = [];
    for (let i = 0; i < particles; i++) {
      particleList.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: Math.random() * 3 + 1,
        size: Math.random() * 10 + 5,
        alpha: 1
      });
    }

    // Animate particles
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      utils.clear();

      particleList.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1; // Gravity
        p.alpha = 1 - progress;

        utils.ctx.globalAlpha = p.alpha;
        utils.drawCircle(p.x, p.y, p.size, '#888');
      });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        canvas.remove();
      }
    };

    animate();
  }

  // ============================================================================
  // BLUR EFFECT
  // ============================================================================

  /**
   * Animated blur effect
   */
  blur(element, options = {}) {
    const {
      maxBlur = 10,
      duration = 300,
      fadeIn = true
    } = options;

    if (!this.engine) {
      element.style.filter = `blur(${maxBlur}px)`;
      return;
    }

    const keyframes = fadeIn
      ? [
          { filter: 'blur(0px)' },
          { filter: `blur(${maxBlur}px)` }
        ]
      : [
          { filter: `blur(${maxBlur}px)` },
          { filter: 'blur(0px)' }
        ];

    return this.engine.animate(element, keyframes, {
      duration,
      easing: 'ease-out',
      onComplete: () => {
        this.activeEffects.delete(element);
      }
    });
  }

  // ============================================================================
  // WAVE DISTORTION (Canvas-based)
  // ============================================================================

  /**
   * Wave distortion effect (requires canvas)
   */
  wave(element, options = {}) {
    const {
      amplitude = 10,
      frequency = 2,
      duration = 2000,
      direction = 'horizontal'
    } = options;

    // This would require canvas manipulation
    // Simplified version: just apply CSS transform
    if (this.engine) {
      const transform = direction === 'horizontal'
        ? `translateX(${amplitude}px)`
        : `translateY(${amplitude}px)`;

      return this.engine.animate(element, [
        { transform: 'translate(0, 0)' },
        { transform, offset: 0.25 },
        { transform: 'translate(0, 0)', offset: 0.5 },
        { transform, offset: 0.75 },
        { transform: 'translate(0, 0)' }
      ], {
        duration,
        easing: 'ease-in-out',
        iterations: 1
      });
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Cancel effect on element
   */
  cancel(element) {
    const effect = this.activeEffects.get(element);
    if (effect && effect.animation) {
      effect.animation.cancel();
      this.activeEffects.delete(element);
    }
  }

  /**
   * Cancel all effects
   */
  cancelAll() {
    this.activeEffects.forEach((effect) => {
      if (effect.animation) {
        effect.animation.cancel();
      }
    });
    this.activeEffects.clear();
  }

  /**
   * Remove all effect handlers from element
   */
  removeEffectHandlers(element) {
    if (element._visualEffectHandlers) {
      element._visualEffectHandlers.forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
      });
      element._visualEffectHandlers = [];
    }
  }

  /**
   * Check if element has active effect
   */
  hasActiveEffect(element) {
    return this.activeEffects.has(element);
  }

  /**
   * Get active effect count
   */
  getActiveCount() {
    return this.activeEffects.size;
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

if (typeof window !== 'undefined') {
  window.CalOSVisualEffects = VisualEffects;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VisualEffects;
}
