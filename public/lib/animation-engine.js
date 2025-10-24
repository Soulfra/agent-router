/**
 * AnimationEngine - Core animation system for CalOS
 *
 * Provides:
 * - requestAnimationFrame loop running at 60fps
 * - Easing functions (linear, ease, bounce, elastic, etc.)
 * - Tween system for smooth value interpolation
 * - Timeline for sequencing animations
 * - CSS animation wrapper for GPU acceleration
 * - Performance monitoring
 *
 * Usage:
 *   const engine = new AnimationEngine();
 *   engine.start();
 *
 *   // Animate element
 *   engine.animate(element, [
 *     { transform: 'scale(1)' },
 *     { transform: 'scale(1.2)' }
 *   ], { duration: 300, easing: 'bounce' });
 *
 *   // Tween values
 *   await engine.tween(0, 100, 500, 'easeOut', (value) => {
 *     element.style.left = value + 'px';
 *   });
 */

class AnimationEngine {
  constructor() {
    // Active animations
    this.animations = new Map(); // animationId => { startTime, duration, easing, callback, onComplete }
    this.tweens = new Map(); // tweenId => { element, property, startValue, endValue, ... }
    this.timelines = new Map(); // timelineId => Timeline instance

    // Engine state
    this.isRunning = false;
    this.animationFrameId = null;
    this.lastFrameTime = 0;
    this.deltaTime = 0;

    // Performance tracking
    this.stats = {
      fps: 60,
      frameCount: 0,
      activeAnimations: 0,
      totalAnimations: 0
    };

    // Auto-start on first animation
    this.autoStart = true;
  }

  // ============================================================================
  // CORE ANIMATION LOOP
  // ============================================================================

  /**
   * Start the animation loop
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this._loop();

    console.log('[AnimationEngine] Started');
  }

  /**
   * Stop the animation loop
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    console.log('[AnimationEngine] Stopped');
  }

  /**
   * Main animation loop (60fps)
   */
  _loop() {
    if (!this.isRunning) return;

    const now = performance.now();
    this.deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // Update FPS
    this.stats.frameCount++;
    this.stats.fps = Math.round(1000 / this.deltaTime);

    // Update all active animations
    this.animations.forEach((anim, id) => {
      const elapsed = now - anim.startTime;
      const progress = Math.min(elapsed / anim.duration, 1);

      if (progress >= 1) {
        // Animation complete
        anim.callback(1);
        if (anim.onComplete) anim.onComplete();
        this.animations.delete(id);
      } else {
        // Apply easing and update
        const easedProgress = this.easing[anim.easing](progress);
        anim.callback(easedProgress);
      }
    });

    this.stats.activeAnimations = this.animations.size;

    // Stop engine if no active animations (optional optimization)
    if (this.animations.size === 0 && this.autoStart) {
      // Keep running for a bit in case new animations are added
      setTimeout(() => {
        if (this.animations.size === 0) {
          this.stop();
        }
      }, 1000);
    }

    // Schedule next frame
    this.animationFrameId = requestAnimationFrame(() => this._loop());
  }

  // ============================================================================
  // CSS ANIMATIONS (GPU-accelerated)
  // ============================================================================

  /**
   * Animate element using CSS animations (GPU-accelerated)
   *
   * @param {HTMLElement} element - Element to animate
   * @param {Array} keyframes - CSS keyframes
   * @param {Object} options - Animation options
   * @returns {Animation} Web Animation API object
   *
   * Example:
   *   engine.animate(div, [
   *     { transform: 'translateX(0px)', opacity: 1 },
   *     { transform: 'translateX(100px)', opacity: 0.5 }
   *   ], { duration: 500, easing: 'ease-out' });
   */
  animate(element, keyframes, options = {}) {
    const animation = element.animate(keyframes, {
      duration: options.duration || 300,
      easing: this._convertEasing(options.easing || 'ease-out'),
      fill: options.fill || 'forwards',
      iterations: options.iterations || 1,
      direction: options.direction || 'normal',
      delay: options.delay || 0
    });

    // Track completion
    animation.onfinish = () => {
      if (options.onComplete) options.onComplete();
    };

    this.stats.totalAnimations++;
    return animation;
  }

  /**
   * Convert custom easing names to CSS cubic-bezier
   */
  _convertEasing(easing) {
    const easingMap = {
      'linear': 'linear',
      'ease': 'ease',
      'ease-in': 'ease-in',
      'ease-out': 'ease-out',
      'ease-in-out': 'ease-in-out',
      'easeIn': 'cubic-bezier(0.42, 0, 1, 1)',
      'easeOut': 'cubic-bezier(0, 0, 0.58, 1)',
      'easeInOut': 'cubic-bezier(0.42, 0, 0.58, 1)',
      'bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      'elastic': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
    };

    return easingMap[easing] || easing;
  }

  // ============================================================================
  // TWEEN SYSTEM (value interpolation)
  // ============================================================================

  /**
   * Tween (interpolate) between two values
   *
   * @param {number} startValue - Starting value
   * @param {number} endValue - Ending value
   * @param {number} duration - Duration in milliseconds
   * @param {string} easing - Easing function name
   * @param {function} onUpdate - Callback with current value
   * @returns {Promise} Resolves when complete
   *
   * Example:
   *   await engine.tween(0, 100, 500, 'easeOut', (value) => {
   *     element.style.left = value + 'px';
   *   });
   */
  tween(startValue, endValue, duration, easing = 'linear', onUpdate) {
    return new Promise((resolve) => {
      const animId = `tween_${Math.random().toString(36).substr(2, 9)}`;
      const startTime = performance.now();

      this.animations.set(animId, {
        startTime,
        duration,
        easing,
        callback: (progress) => {
          const value = startValue + (endValue - startValue) * progress;
          if (onUpdate) onUpdate(value);
        },
        onComplete: () => {
          resolve(endValue);
        }
      });

      // Auto-start engine if needed
      if (!this.isRunning && this.autoStart) {
        this.start();
      }

      this.stats.totalAnimations++;
    });
  }

  /**
   * Tween multiple properties of an object
   *
   * @param {Object} target - Object to animate
   * @param {Object} to - Target values
   * @param {number} duration - Duration in milliseconds
   * @param {string} easing - Easing function
   * @returns {Promise}
   *
   * Example:
   *   await engine.tweenObject({ x: 0, y: 0 }, { x: 100, y: 200 }, 500, 'easeOut');
   */
  async tweenObject(target, to, duration, easing = 'linear') {
    const from = {};
    const keys = Object.keys(to);

    // Store initial values
    keys.forEach(key => {
      from[key] = target[key];
    });

    return this.tween(0, 1, duration, easing, (progress) => {
      keys.forEach(key => {
        target[key] = from[key] + (to[key] - from[key]) * progress;
      });
    });
  }

  // ============================================================================
  // EASING FUNCTIONS
  // ============================================================================

  easing = {
    // Linear
    linear: t => t,

    // Quadratic
    easeIn: t => t * t,
    easeOut: t => t * (2 - t),
    easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

    // Cubic
    easeInCubic: t => t * t * t,
    easeOutCubic: t => (--t) * t * t + 1,
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,

    // Quartic
    easeInQuart: t => t * t * t * t,
    easeOutQuart: t => 1 - (--t) * t * t * t,
    easeInOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,

    // Bounce
    bounce: t => {
      if (t < 1 / 2.75) {
        return 7.5625 * t * t;
      } else if (t < 2 / 2.75) {
        return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
      } else if (t < 2.5 / 2.75) {
        return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
      } else {
        return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
      }
    },

    // Elastic
    elastic: t => {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
    },

    // Back
    easeInBack: t => {
      const c1 = 1.70158;
      return t * t * ((c1 + 1) * t - c1);
    },
    easeOutBack: t => {
      const c1 = 1.70158;
      return 1 + (--t) * t * ((c1 + 1) * t + c1);
    },

    // Circular
    easeInCirc: t => 1 - Math.sqrt(1 - t * t),
    easeOutCirc: t => Math.sqrt(1 - (--t) * t)
  };

  // ============================================================================
  // TIMELINE (sequence animations)
  // ============================================================================

  /**
   * Create a timeline for sequencing animations
   *
   * @returns {Timeline}
   *
   * Example:
   *   const timeline = engine.createTimeline();
   *   timeline
   *     .to(element1, { x: 100 }, 500, 'easeOut')
   *     .to(element2, { y: 200 }, 300, 'bounce')
   *     .play();
   */
  createTimeline() {
    const timeline = new Timeline(this);
    this.timelines.set(timeline.id, timeline);
    return timeline;
  }

  /**
   * Remove timeline
   */
  removeTimeline(timelineId) {
    this.timelines.delete(timelineId);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Cancel a specific animation
   */
  cancelAnimation(animationId) {
    this.animations.delete(animationId);
  }

  /**
   * Cancel all animations
   */
  cancelAll() {
    this.animations.clear();
  }

  /**
   * Get engine statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      totalTimelines: this.timelines.size
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      fps: 60,
      frameCount: 0,
      activeAnimations: 0,
      totalAnimations: 0
    };
  }
}

// ============================================================================
// TIMELINE CLASS (for sequencing animations)
// ============================================================================

class Timeline {
  constructor(engine) {
    this.engine = engine;
    this.id = `timeline_${Math.random().toString(36).substr(2, 9)}`;
    this.animations = []; // Array of { target, to, duration, easing, delay }
    this.isPlaying = false;
    this.currentIndex = 0;
  }

  /**
   * Add animation to timeline
   *
   * @param {Object} target - Object with properties to animate
   * @param {Object} to - Target values
   * @param {number} duration - Duration in ms
   * @param {string} easing - Easing function
   * @param {number} delay - Delay before this animation (ms)
   * @returns {Timeline} For chaining
   */
  to(target, to, duration, easing = 'linear', delay = 0) {
    this.animations.push({
      target,
      to,
      duration,
      easing,
      delay
    });
    return this;
  }

  /**
   * Play timeline
   */
  async play() {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.currentIndex = 0;

    for (const anim of this.animations) {
      if (anim.delay > 0) {
        await this._sleep(anim.delay);
      }

      await this.engine.tweenObject(
        anim.target,
        anim.to,
        anim.duration,
        anim.easing
      );
    }

    this.isPlaying = false;
  }

  /**
   * Stop timeline
   */
  stop() {
    this.isPlaying = false;
    this.currentIndex = 0;
  }

  /**
   * Reset timeline
   */
  reset() {
    this.stop();
    this.animations = [];
  }

  /**
   * Helper: sleep
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

// Create global instance
if (typeof window !== 'undefined') {
  window.CalOSAnimationEngine = AnimationEngine;
  window.CalOSTimeline = Timeline;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AnimationEngine, Timeline };
}
