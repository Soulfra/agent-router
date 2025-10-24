/**
 * IconAnimator - Desktop icon animation system for CalOS
 *
 * Provides pre-built animations for desktop icons:
 * - bounce: Icon bounces up and down
 * - pulse: Icon scales up and down (breathing effect)
 * - wiggle: Icon shakes side to side
 * - shake: Icon shakes in all directions (error/alert)
 * - glow: Icon glows with colored shadow
 * - float: Icon floats up and down gently
 * - spin: Icon rotates 360 degrees
 * - flip: Icon flips horizontally or vertically
 * - tada: Attention-grabbing scale + rotation
 * - heartbeat: Double-pulse effect
 *
 * Usage:
 *   const animator = new IconAnimator(engine);
 *   animator.bounce(iconElement);
 *   animator.pulse(iconElement, { duration: 1000, infinite: true });
 */

class IconAnimator {
  constructor(animationEngine) {
    if (!animationEngine) {
      throw new Error('IconAnimator requires AnimationEngine instance');
    }

    this.engine = animationEngine;
    this.activeAnimations = new Map(); // element => Animation object
  }

  // ============================================================================
  // BOUNCE - Icon bounces up and down
  // ============================================================================

  /**
   * Bounce animation
   *
   * @param {HTMLElement} element - Icon element
   * @param {Object} options - Animation options
   * @returns {Animation}
   */
  bounce(element, options = {}) {
    const {
      duration = 600,
      height = 20, // Bounce height in pixels
      iterations = 1,
      onComplete = null
    } = options;

    this._cancelExisting(element);

    const animation = this.engine.animate(element, [
      { transform: 'translateY(0px)' },
      { transform: `translateY(-${height}px)`, offset: 0.4 },
      { transform: 'translateY(0px)', offset: 0.5 },
      { transform: `translateY(-${height / 2}px)`, offset: 0.7 },
      { transform: 'translateY(0px)' }
    ], {
      duration,
      easing: 'ease-out',
      iterations,
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  // ============================================================================
  // PULSE - Icon scales up and down (breathing)
  // ============================================================================

  /**
   * Pulse animation
   *
   * @param {HTMLElement} element - Icon element
   * @param {Object} options - Animation options
   * @returns {Animation}
   */
  pulse(element, options = {}) {
    const {
      duration = 800,
      scale = 1.15, // Maximum scale
      iterations = 1,
      infinite = false,
      onComplete = null
    } = options;

    this._cancelExisting(element);

    const animation = this.engine.animate(element, [
      { transform: 'scale(1)' },
      { transform: `scale(${scale})` },
      { transform: 'scale(1)' }
    ], {
      duration,
      easing: 'ease-in-out',
      iterations: infinite ? Infinity : iterations,
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  // ============================================================================
  // WIGGLE - Icon shakes side to side
  // ============================================================================

  /**
   * Wiggle animation (side to side)
   *
   * @param {HTMLElement} element - Icon element
   * @param {Object} options - Animation options
   * @returns {Animation}
   */
  wiggle(element, options = {}) {
    const {
      duration = 400,
      rotation = 8, // Degrees
      iterations = 1,
      onComplete = null
    } = options;

    this._cancelExisting(element);

    const animation = this.engine.animate(element, [
      { transform: 'rotate(0deg)' },
      { transform: `rotate(-${rotation}deg)`, offset: 0.2 },
      { transform: `rotate(${rotation}deg)`, offset: 0.4 },
      { transform: `rotate(-${rotation}deg)`, offset: 0.6 },
      { transform: `rotate(${rotation}deg)`, offset: 0.8 },
      { transform: 'rotate(0deg)' }
    ], {
      duration,
      easing: 'ease-in-out',
      iterations,
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  // ============================================================================
  // SHAKE - Icon shakes in all directions (error/alert)
  // ============================================================================

  /**
   * Shake animation (error/alert)
   *
   * @param {HTMLElement} element - Icon element
   * @param {Object} options - Animation options
   * @returns {Animation}
   */
  shake(element, options = {}) {
    const {
      duration = 500,
      distance = 10, // Pixels
      iterations = 1,
      onComplete = null
    } = options;

    this._cancelExisting(element);

    const animation = this.engine.animate(element, [
      { transform: 'translate(0, 0)' },
      { transform: `translate(-${distance}px, 0)`, offset: 0.1 },
      { transform: `translate(${distance}px, 0)`, offset: 0.2 },
      { transform: `translate(0, -${distance}px)`, offset: 0.3 },
      { transform: `translate(0, ${distance}px)`, offset: 0.4 },
      { transform: `translate(-${distance}px, 0)`, offset: 0.5 },
      { transform: `translate(${distance}px, 0)`, offset: 0.6 },
      { transform: `translate(0, -${distance}px)`, offset: 0.7 },
      { transform: `translate(0, ${distance}px)`, offset: 0.8 },
      { transform: 'translate(0, 0)' }
    ], {
      duration,
      easing: 'ease-in-out',
      iterations,
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  // ============================================================================
  // GLOW - Icon glows with colored shadow
  // ============================================================================

  /**
   * Glow animation
   *
   * @param {HTMLElement} element - Icon element
   * @param {Object} options - Animation options
   * @returns {Animation}
   */
  glow(element, options = {}) {
    const {
      duration = 1000,
      color = '#4a9eff', // Blue glow
      intensity = 20, // Shadow blur radius
      iterations = 1,
      infinite = false,
      onComplete = null
    } = options;

    this._cancelExisting(element);

    const animation = this.engine.animate(element, [
      { filter: 'drop-shadow(0 0 0px transparent)' },
      { filter: `drop-shadow(0 0 ${intensity}px ${color})` },
      { filter: 'drop-shadow(0 0 0px transparent)' }
    ], {
      duration,
      easing: 'ease-in-out',
      iterations: infinite ? Infinity : iterations,
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  // ============================================================================
  // FLOAT - Icon floats up and down gently
  // ============================================================================

  /**
   * Float animation (gentle up/down)
   *
   * @param {HTMLElement} element - Icon element
   * @param {Object} options - Animation options
   * @returns {Animation}
   */
  float(element, options = {}) {
    const {
      duration = 2000,
      distance = 10, // Pixels
      iterations = Infinity,
      onComplete = null
    } = options;

    this._cancelExisting(element);

    const animation = this.engine.animate(element, [
      { transform: 'translateY(0px)' },
      { transform: `translateY(-${distance}px)` },
      { transform: 'translateY(0px)' }
    ], {
      duration,
      easing: 'ease-in-out',
      iterations,
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  // ============================================================================
  // SPIN - Icon rotates 360 degrees
  // ============================================================================

  /**
   * Spin animation
   *
   * @param {HTMLElement} element - Icon element
   * @param {Object} options - Animation options
   * @returns {Animation}
   */
  spin(element, options = {}) {
    const {
      duration = 800,
      direction = 'clockwise', // or 'counterclockwise'
      iterations = 1,
      infinite = false,
      onComplete = null
    } = options;

    this._cancelExisting(element);

    const rotation = direction === 'counterclockwise' ? -360 : 360;

    const animation = this.engine.animate(element, [
      { transform: 'rotate(0deg)' },
      { transform: `rotate(${rotation}deg)` }
    ], {
      duration,
      easing: 'ease-in-out',
      iterations: infinite ? Infinity : iterations,
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  // ============================================================================
  // FLIP - Icon flips horizontally or vertically
  // ============================================================================

  /**
   * Flip animation
   *
   * @param {HTMLElement} element - Icon element
   * @param {Object} options - Animation options
   * @returns {Animation}
   */
  flip(element, options = {}) {
    const {
      duration = 600,
      axis = 'horizontal', // or 'vertical'
      iterations = 1,
      onComplete = null
    } = options;

    this._cancelExisting(element);

    const transform = axis === 'vertical' ? 'rotateX' : 'rotateY';

    const animation = this.engine.animate(element, [
      { transform: `${transform}(0deg)` },
      { transform: `${transform}(180deg)` }
    ], {
      duration,
      easing: 'ease-in-out',
      iterations,
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  // ============================================================================
  // TADA - Attention-grabbing scale + rotation
  // ============================================================================

  /**
   * Tada animation (attention-grabbing)
   *
   * @param {HTMLElement} element - Icon element
   * @param {Object} options - Animation options
   * @returns {Animation}
   */
  tada(element, options = {}) {
    const {
      duration = 1000,
      iterations = 1,
      onComplete = null
    } = options;

    this._cancelExisting(element);

    const animation = this.engine.animate(element, [
      { transform: 'scale(1) rotate(0deg)' },
      { transform: 'scale(0.9) rotate(-3deg)', offset: 0.1 },
      { transform: 'scale(0.9) rotate(-3deg)', offset: 0.2 },
      { transform: 'scale(1.1) rotate(3deg)', offset: 0.3 },
      { transform: 'scale(1.1) rotate(-3deg)', offset: 0.4 },
      { transform: 'scale(1.1) rotate(3deg)', offset: 0.5 },
      { transform: 'scale(1.1) rotate(-3deg)', offset: 0.6 },
      { transform: 'scale(1.1) rotate(3deg)', offset: 0.7 },
      { transform: 'scale(1.1) rotate(-3deg)', offset: 0.8 },
      { transform: 'scale(1.1) rotate(3deg)', offset: 0.9 },
      { transform: 'scale(1) rotate(0deg)' }
    ], {
      duration,
      easing: 'ease-in-out',
      iterations,
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  // ============================================================================
  // HEARTBEAT - Double-pulse effect
  // ============================================================================

  /**
   * Heartbeat animation (double pulse)
   *
   * @param {HTMLElement} element - Icon element
   * @param {Object} options - Animation options
   * @returns {Animation}
   */
  heartbeat(element, options = {}) {
    const {
      duration = 1300,
      iterations = 1,
      infinite = false,
      onComplete = null
    } = options;

    this._cancelExisting(element);

    const animation = this.engine.animate(element, [
      { transform: 'scale(1)' },
      { transform: 'scale(1.3)', offset: 0.14 },
      { transform: 'scale(1)', offset: 0.28 },
      { transform: 'scale(1.3)', offset: 0.42 },
      { transform: 'scale(1)', offset: 0.7 }
    ], {
      duration,
      easing: 'ease-in-out',
      iterations: infinite ? Infinity : iterations,
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  // ============================================================================
  // HOVER EFFECTS (for interactive icons)
  // ============================================================================

  /**
   * Apply hover animation to icon
   *
   * @param {HTMLElement} element - Icon element
   * @param {string} animationType - bounce, pulse, wiggle, etc.
   * @param {Object} options - Animation options
   */
  applyHoverEffect(element, animationType = 'bounce', options = {}) {
    const hoverHandler = () => {
      // Only trigger if not already animating
      if (!this.activeAnimations.has(element)) {
        this[animationType](element, options);
      }
    };

    element.addEventListener('mouseenter', hoverHandler);

    // Store handler for cleanup
    if (!element._iconAnimatorHandlers) {
      element._iconAnimatorHandlers = [];
    }
    element._iconAnimatorHandlers.push({
      event: 'mouseenter',
      handler: hoverHandler
    });
  }

  /**
   * Remove all hover effects from icon
   */
  removeHoverEffects(element) {
    if (element._iconAnimatorHandlers) {
      element._iconAnimatorHandlers.forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
      });
      element._iconAnimatorHandlers = [];
    }
  }

  // ============================================================================
  // CONTEXT-SPECIFIC ANIMATIONS
  // ============================================================================

  /**
   * Animation for newly created icons
   */
  animateCreate(element, options = {}) {
    const {
      onComplete = null
    } = options;

    this._cancelExisting(element);

    // Fade in + scale up from 0
    const animation = this.engine.animate(element, [
      { transform: 'scale(0)', opacity: 0 },
      { transform: 'scale(1.1)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1)', opacity: 1 }
    ], {
      duration: 400,
      easing: 'ease-out',
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  /**
   * Animation for deleted icons
   */
  animateDelete(element, options = {}) {
    const {
      onComplete = null
    } = options;

    this._cancelExisting(element);

    // Scale down + fade out + fall
    const animation = this.engine.animate(element, [
      { transform: 'scale(1) translateY(0)', opacity: 1 },
      { transform: 'scale(0.8) translateY(20px)', opacity: 0.5, offset: 0.5 },
      { transform: 'scale(0) translateY(50px)', opacity: 0 }
    ], {
      duration: 500,
      easing: 'ease-in',
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  /**
   * Animation for executing/opening an icon
   */
  animateExecute(element, options = {}) {
    const {
      onComplete = null
    } = options;

    this._cancelExisting(element);

    // Quick scale pulse
    const animation = this.engine.animate(element, [
      { transform: 'scale(1)' },
      { transform: 'scale(0.9)', offset: 0.3 },
      { transform: 'scale(1.1)', offset: 0.6 },
      { transform: 'scale(1)' }
    ], {
      duration: 300,
      easing: 'ease-out',
      onComplete: () => {
        this.activeAnimations.delete(element);
        if (onComplete) onComplete();
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  /**
   * Animation for drag start
   */
  animateDragStart(element, options = {}) {
    this._cancelExisting(element);

    const animation = this.engine.animate(element, [
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
      { transform: 'scale(1.1) rotate(3deg)', opacity: 0.8 }
    ], {
      duration: 150,
      easing: 'ease-out',
      fill: 'forwards'
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  /**
   * Animation for drag end
   */
  animateDragEnd(element, options = {}) {
    this._cancelExisting(element);

    const animation = this.engine.animate(element, [
      { transform: 'scale(1.1) rotate(3deg)', opacity: 0.8 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1 }
    ], {
      duration: 200,
      easing: 'ease-out',
      fill: 'forwards',
      onComplete: () => {
        this.activeAnimations.delete(element);
      }
    });

    this.activeAnimations.set(element, animation);
    return animation;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Cancel existing animation for element
   */
  _cancelExisting(element) {
    const existing = this.activeAnimations.get(element);
    if (existing) {
      existing.cancel();
      this.activeAnimations.delete(element);
    }
  }

  /**
   * Cancel animation for element
   */
  cancel(element) {
    this._cancelExisting(element);
  }

  /**
   * Cancel all animations
   */
  cancelAll() {
    this.activeAnimations.forEach((anim) => {
      anim.cancel();
    });
    this.activeAnimations.clear();
  }

  /**
   * Check if element is animating
   */
  isAnimating(element) {
    return this.activeAnimations.has(element);
  }

  /**
   * Get active animation count
   */
  getActiveCount() {
    return this.activeAnimations.size;
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

if (typeof window !== 'undefined') {
  window.CalOSIconAnimator = IconAnimator;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IconAnimator;
}
