/**
 * TransitionManager - Smooth transitions for CalOS windows, pages, and modals
 *
 * Provides:
 * - Window transitions (fade, slide, zoom, flip)
 * - Page transitions (slide left/right/up/down, fade, crossfade)
 * - Modal transitions (fade in/out, scale, slide from top/bottom)
 * - Custom transition timing and easing
 * - Transition queuing and chaining
 *
 * Usage:
 *   const manager = new TransitionManager(engine);
 *   await manager.fadeIn(element, 300);
 *   await manager.slideIn(element, 'left', 500);
 */

class TransitionManager {
  constructor(animationEngine) {
    if (!animationEngine) {
      throw new Error('TransitionManager requires AnimationEngine instance');
    }

    this.engine = animationEngine;
    this.activeTransitions = new Map(); // element => transition info
    this.transitionQueue = []; // Queue for sequential transitions
  }

  // ============================================================================
  // FADE TRANSITIONS
  // ============================================================================

  /**
   * Fade in element
   */
  async fadeIn(element, duration = 300, easing = 'ease-out') {
    this._cancelExisting(element);

    element.style.display = element.style.display || 'block';
    element.style.opacity = '0';

    return new Promise((resolve) => {
      const animation = this.engine.animate(element, [
        { opacity: 0 },
        { opacity: 1 }
      ], {
        duration,
        easing,
        onComplete: () => {
          this.activeTransitions.delete(element);
          resolve();
        }
      });

      this.activeTransitions.set(element, { type: 'fadeIn', animation });
    });
  }

  /**
   * Fade out element
   */
  async fadeOut(element, duration = 300, easing = 'ease-in') {
    this._cancelExisting(element);

    return new Promise((resolve) => {
      const animation = this.engine.animate(element, [
        { opacity: 1 },
        { opacity: 0 }
      ], {
        duration,
        easing,
        onComplete: () => {
          element.style.display = 'none';
          this.activeTransitions.delete(element);
          resolve();
        }
      });

      this.activeTransitions.set(element, { type: 'fadeOut', animation });
    });
  }

  /**
   * Crossfade between two elements
   */
  async crossfade(fromElement, toElement, duration = 400) {
    await Promise.all([
      this.fadeOut(fromElement, duration),
      this.fadeIn(toElement, duration)
    ]);
  }

  // ============================================================================
  // SLIDE TRANSITIONS
  // ============================================================================

  /**
   * Slide in element from direction
   *
   * @param {HTMLElement} element
   * @param {string} direction - 'left', 'right', 'top', 'bottom'
   * @param {number} duration
   * @param {string} easing
   */
  async slideIn(element, direction = 'left', duration = 400, easing = 'ease-out') {
    this._cancelExisting(element);

    element.style.display = element.style.display || 'block';

    const transforms = {
      left: { from: 'translateX(-100%)', to: 'translateX(0)' },
      right: { from: 'translateX(100%)', to: 'translateX(0)' },
      top: { from: 'translateY(-100%)', to: 'translateY(0)' },
      bottom: { from: 'translateY(100%)', to: 'translateY(0)' }
    };

    const transform = transforms[direction] || transforms.left;

    return new Promise((resolve) => {
      const animation = this.engine.animate(element, [
        { transform: transform.from, opacity: 0 },
        { transform: transform.to, opacity: 1 }
      ], {
        duration,
        easing,
        onComplete: () => {
          this.activeTransitions.delete(element);
          resolve();
        }
      });

      this.activeTransitions.set(element, { type: 'slideIn', animation });
    });
  }

  /**
   * Slide out element to direction
   *
   * @param {HTMLElement} element
   * @param {string} direction - 'left', 'right', 'top', 'bottom'
   * @param {number} duration
   * @param {string} easing
   */
  async slideOut(element, direction = 'left', duration = 400, easing = 'ease-in') {
    this._cancelExisting(element);

    const transforms = {
      left: { from: 'translateX(0)', to: 'translateX(-100%)' },
      right: { from: 'translateX(0)', to: 'translateX(100%)' },
      top: { from: 'translateY(0)', to: 'translateY(-100%)' },
      bottom: { from: 'translateY(0)', to: 'translateY(100%)' }
    };

    const transform = transforms[direction] || transforms.left;

    return new Promise((resolve) => {
      const animation = this.engine.animate(element, [
        { transform: transform.from, opacity: 1 },
        { transform: transform.to, opacity: 0 }
      ], {
        duration,
        easing,
        onComplete: () => {
          element.style.display = 'none';
          this.activeTransitions.delete(element);
          resolve();
        }
      });

      this.activeTransitions.set(element, { type: 'slideOut', animation });
    });
  }

  /**
   * Slide transition between two elements (out then in)
   */
  async slideTransition(fromElement, toElement, direction = 'left', duration = 400) {
    // Slide out old element
    await this.slideOut(fromElement, direction, duration);
    // Slide in new element from opposite direction
    const oppositeDirection = {
      left: 'right',
      right: 'left',
      top: 'bottom',
      bottom: 'top'
    }[direction];
    await this.slideIn(toElement, oppositeDirection, duration);
  }

  // ============================================================================
  // SCALE TRANSITIONS (zoom in/out)
  // ============================================================================

  /**
   * Scale in (zoom in)
   */
  async scaleIn(element, duration = 300, easing = 'ease-out', fromScale = 0.8) {
    this._cancelExisting(element);

    element.style.display = element.style.display || 'block';

    return new Promise((resolve) => {
      const animation = this.engine.animate(element, [
        { transform: `scale(${fromScale})`, opacity: 0 },
        { transform: 'scale(1)', opacity: 1 }
      ], {
        duration,
        easing,
        onComplete: () => {
          this.activeTransitions.delete(element);
          resolve();
        }
      });

      this.activeTransitions.set(element, { type: 'scaleIn', animation });
    });
  }

  /**
   * Scale out (zoom out)
   */
  async scaleOut(element, duration = 300, easing = 'ease-in', toScale = 0.8) {
    this._cancelExisting(element);

    return new Promise((resolve) => {
      const animation = this.engine.animate(element, [
        { transform: 'scale(1)', opacity: 1 },
        { transform: `scale(${toScale})`, opacity: 0 }
      ], {
        duration,
        easing,
        onComplete: () => {
          element.style.display = 'none';
          this.activeTransitions.delete(element);
          resolve();
        }
      });

      this.activeTransitions.set(element, { type: 'scaleOut', animation });
    });
  }

  // ============================================================================
  // FLIP TRANSITIONS
  // ============================================================================

  /**
   * Flip element horizontally or vertically
   */
  async flip(element, axis = 'horizontal', duration = 600, easing = 'ease-in-out') {
    this._cancelExisting(element);

    const transform = axis === 'vertical' ? 'rotateX' : 'rotateY';

    return new Promise((resolve) => {
      const animation = this.engine.animate(element, [
        { transform: `${transform}(0deg)` },
        { transform: `${transform}(90deg)`, offset: 0.5 },
        { transform: `${transform}(180deg)` }
      ], {
        duration,
        easing,
        onComplete: () => {
          this.activeTransitions.delete(element);
          resolve();
        }
      });

      this.activeTransitions.set(element, { type: 'flip', animation });
    });
  }

  /**
   * Flip transition between two elements
   */
  async flipTransition(fromElement, toElement, axis = 'horizontal', duration = 600) {
    const transform = axis === 'vertical' ? 'rotateX' : 'rotateY';

    this._cancelExisting(fromElement);
    this._cancelExisting(toElement);

    // Position new element behind old one
    toElement.style.position = 'absolute';
    toElement.style.top = fromElement.offsetTop + 'px';
    toElement.style.left = fromElement.offsetLeft + 'px';
    toElement.style.width = fromElement.offsetWidth + 'px';
    toElement.style.height = fromElement.offsetHeight + 'px';
    toElement.style.display = 'block';
    toElement.style.opacity = '0';

    return new Promise((resolve) => {
      // Flip out old element
      const outAnim = this.engine.animate(fromElement, [
        { transform: `${transform}(0deg)`, opacity: 1 },
        { transform: `${transform}(90deg)`, opacity: 0 }
      ], {
        duration: duration / 2,
        easing: 'ease-in'
      });

      // After halfway, flip in new element
      setTimeout(() => {
        fromElement.style.display = 'none';

        const inAnim = this.engine.animate(toElement, [
          { transform: `${transform}(90deg)`, opacity: 0 },
          { transform: `${transform}(0deg)`, opacity: 1 }
        ], {
          duration: duration / 2,
          easing: 'ease-out',
          onComplete: () => {
            toElement.style.position = '';
            this.activeTransitions.delete(fromElement);
            this.activeTransitions.delete(toElement);
            resolve();
          }
        });
      }, duration / 2);
    });
  }

  // ============================================================================
  // MODAL TRANSITIONS
  // ============================================================================

  /**
   * Modal fade in with backdrop
   */
  async showModal(modalElement, backdropElement = null, duration = 300) {
    // Show backdrop first
    if (backdropElement) {
      backdropElement.style.display = 'block';
      backdropElement.style.opacity = '0';

      this.engine.animate(backdropElement, [
        { opacity: 0 },
        { opacity: 1 }
      ], {
        duration: duration * 0.8,
        easing: 'ease-out'
      });
    }

    // Then show modal with scale
    await this.scaleIn(modalElement, duration, 'ease-out', 0.9);
  }

  /**
   * Modal fade out with backdrop
   */
  async hideModal(modalElement, backdropElement = null, duration = 250) {
    // Hide modal first
    await this.scaleOut(modalElement, duration, 'ease-in', 0.9);

    // Then hide backdrop
    if (backdropElement) {
      await this.fadeOut(backdropElement, duration * 0.8);
    }
  }

  /**
   * Modal slide from top
   */
  async showModalFromTop(modalElement, backdropElement = null, duration = 400) {
    if (backdropElement) {
      backdropElement.style.display = 'block';
      this.fadeIn(backdropElement, duration * 0.8);
    }

    await this.slideIn(modalElement, 'top', duration);
  }

  /**
   * Modal slide to top
   */
  async hideModalToTop(modalElement, backdropElement = null, duration = 350) {
    await this.slideOut(modalElement, 'top', duration);

    if (backdropElement) {
      await this.fadeOut(backdropElement, duration * 0.8);
    }
  }

  // ============================================================================
  // PAGE TRANSITIONS
  // ============================================================================

  /**
   * Page slide transition (mobile-style)
   */
  async pageSlideTransition(fromPage, toPage, direction = 'left', duration = 400) {
    // Set up container
    const container = fromPage.parentElement;
    const containerWidth = container.offsetWidth;

    // Position new page off-screen
    toPage.style.position = 'absolute';
    toPage.style.top = '0';
    toPage.style.width = '100%';
    toPage.style.height = '100%';
    toPage.style.display = 'block';

    const slideDistance = direction === 'left' || direction === 'right' ? containerWidth : container.offsetHeight;

    if (direction === 'left') {
      toPage.style.left = slideDistance + 'px';
    } else if (direction === 'right') {
      toPage.style.left = -slideDistance + 'px';
    } else if (direction === 'top') {
      toPage.style.top = slideDistance + 'px';
    } else if (direction === 'bottom') {
      toPage.style.top = -slideDistance + 'px';
    }

    // Animate both pages
    await Promise.all([
      // Slide out old page
      new Promise((resolve) => {
        const targetPos = direction === 'left' ? -slideDistance : slideDistance;
        const property = direction === 'left' || direction === 'right' ? 'left' : 'top';

        this.engine.animate(fromPage, [
          { [property]: '0px' },
          { [property]: targetPos + 'px' }
        ], {
          duration,
          easing: 'ease-in-out',
          onComplete: () => {
            fromPage.style.display = 'none';
            resolve();
          }
        });
      }),

      // Slide in new page
      new Promise((resolve) => {
        this.engine.animate(toPage, [
          { [direction === 'left' || direction === 'right' ? 'left' : 'top']: toPage.style[direction === 'left' || direction === 'right' ? 'left' : 'top'] },
          { [direction === 'left' || direction === 'right' ? 'left' : 'top']: '0px' }
        ], {
          duration,
          easing: 'ease-in-out',
          onComplete: () => {
            toPage.style.position = '';
            resolve();
          }
        });
      })
    ]);
  }

  // ============================================================================
  // CUSTOM TRANSITIONS
  // ============================================================================

  /**
   * Custom keyframe transition
   */
  async customTransition(element, keyframes, duration = 400, easing = 'ease-out') {
    this._cancelExisting(element);

    return new Promise((resolve) => {
      const animation = this.engine.animate(element, keyframes, {
        duration,
        easing,
        onComplete: () => {
          this.activeTransitions.delete(element);
          resolve();
        }
      });

      this.activeTransitions.set(element, { type: 'custom', animation });
    });
  }

  // ============================================================================
  // TRANSITION QUEUING
  // ============================================================================

  /**
   * Queue multiple transitions to run sequentially
   */
  async queueTransitions(transitions) {
    for (const transition of transitions) {
      const { method, element, args = [] } = transition;
      await this[method](element, ...args);
    }
  }

  /**
   * Run multiple transitions in parallel
   */
  async parallelTransitions(transitions) {
    const promises = transitions.map(transition => {
      const { method, element, args = [] } = transition;
      return this[method](element, ...args);
    });

    await Promise.all(promises);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Cancel existing transition for element
   */
  _cancelExisting(element) {
    const existing = this.activeTransitions.get(element);
    if (existing && existing.animation) {
      existing.animation.cancel();
      this.activeTransitions.delete(element);
    }
  }

  /**
   * Cancel transition
   */
  cancel(element) {
    this._cancelExisting(element);
  }

  /**
   * Cancel all transitions
   */
  cancelAll() {
    this.activeTransitions.forEach((transition) => {
      if (transition.animation) {
        transition.animation.cancel();
      }
    });
    this.activeTransitions.clear();
  }

  /**
   * Check if element is transitioning
   */
  isTransitioning(element) {
    return this.activeTransitions.has(element);
  }

  /**
   * Get active transition count
   */
  getActiveCount() {
    return this.activeTransitions.size;
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

if (typeof window !== 'undefined') {
  window.CalOSTransitionManager = TransitionManager;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TransitionManager;
}
