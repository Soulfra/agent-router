/**
 * LoadingComponents - Loading indicators for CalOS
 *
 * Provides:
 * - Spinners (circle, dots, bars, pulse)
 * - Progress bars (linear, circular, ring)
 * - Skeleton screens (text, image, card)
 * - Custom loading animations
 * - Loading overlays
 *
 * Usage:
 *   const loading = new LoadingComponents(container, animationEngine);
 *   const spinner = loading.createSpinner('circle');
 *   loading.show(spinner);
 *   // Later...
 *   loading.hide(spinner);
 */

class LoadingComponents {
  constructor(container, animationEngine = null) {
    this.container = container || document.body;
    this.engine = animationEngine;
    this.activeLoaders = new Map(); // loaderId => { element, animation }
  }

  // ============================================================================
  // SPINNERS
  // ============================================================================

  /**
   * Create circle spinner
   */
  createSpinner(type = 'circle', options = {}) {
    const {
      size = 40,
      color = '#4a9eff',
      thickness = 4,
      speed = 1 // 1 = 1 second per rotation
    } = options;

    const spinner = document.createElement('div');
    spinner.className = 'calos-spinner';

    switch (type) {
      case 'circle':
        spinner.innerHTML = `
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <circle
              cx="${size / 2}"
              cy="${size / 2}"
              r="${(size - thickness) / 2}"
              stroke="${color}"
              stroke-width="${thickness}"
              fill="none"
              stroke-dasharray="${Math.PI * (size - thickness) * 0.75}"
              stroke-linecap="round"
              style="
                transform-origin: center;
                animation: calos-spinner-rotate ${speed}s linear infinite;
              "
            />
          </svg>
        `;
        break;

      case 'dots':
        spinner.innerHTML = `
          <div style="display: flex; gap: 8px; align-items: center;">
            ${[0, 1, 2].map(i => `
              <div style="
                width: ${size / 4}px;
                height: ${size / 4}px;
                background: ${color};
                border-radius: 50%;
                animation: calos-spinner-bounce ${speed}s ease-in-out ${i * 0.15}s infinite;
              "></div>
            `).join('')}
          </div>
        `;
        break;

      case 'bars':
        spinner.innerHTML = `
          <div style="display: flex; gap: 4px; align-items: flex-end; height: ${size}px;">
            ${[0, 1, 2, 3, 4].map(i => `
              <div style="
                width: ${size / 8}px;
                background: ${color};
                border-radius: 2px;
                animation: calos-spinner-bars ${speed}s ease-in-out ${i * 0.1}s infinite;
              "></div>
            `).join('')}
          </div>
        `;
        break;

      case 'pulse':
        spinner.innerHTML = `
          <div style="
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            border-radius: 50%;
            animation: calos-spinner-pulse ${speed}s ease-in-out infinite;
          "></div>
        `;
        break;

      case 'ring':
        spinner.innerHTML = `
          <div style="
            width: ${size}px;
            height: ${size}px;
            border: ${thickness}px solid ${color}20;
            border-top-color: ${color};
            border-radius: 50%;
            animation: calos-spinner-rotate ${speed}s linear infinite;
          "></div>
        `;
        break;
    }

    // Add CSS animations if not already present
    this._ensureSpinnerStyles();

    return spinner;
  }

  /**
   * Ensure spinner CSS animations exist
   */
  _ensureSpinnerStyles() {
    if (document.getElementById('calos-spinner-styles')) return;

    const style = document.createElement('style');
    style.id = 'calos-spinner-styles';
    style.textContent = `
      @keyframes calos-spinner-rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      @keyframes calos-spinner-bounce {
        0%, 100% { transform: translateY(0); opacity: 1; }
        50% { transform: translateY(-100%); opacity: 0.5; }
      }

      @keyframes calos-spinner-bars {
        0%, 100% { height: 20%; }
        50% { height: 100%; }
      }

      @keyframes calos-spinner-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(0.8); opacity: 0.5; }
      }

      .calos-spinner {
        display: inline-block;
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================================
  // PROGRESS BARS
  // ============================================================================

  /**
   * Create linear progress bar
   */
  createProgressBar(options = {}) {
    const {
      width = '100%',
      height = 4,
      color = '#4a9eff',
      bgColor = '#e0e0e0',
      animated = true,
      indeterminate = false
    } = options;

    const container = document.createElement('div');
    container.className = 'calos-progress-bar';
    container.style.cssText = `
      width: ${width};
      height: ${height}px;
      background: ${bgColor};
      border-radius: ${height / 2}px;
      overflow: hidden;
      position: relative;
    `;

    const bar = document.createElement('div');
    bar.className = 'calos-progress-bar-fill';
    bar.style.cssText = `
      height: 100%;
      background: ${color};
      border-radius: ${height / 2}px;
      width: ${indeterminate ? '30%' : '0%'};
      transition: width 0.3s ease;
      ${indeterminate ? 'animation: calos-progress-indeterminate 1.5s ease-in-out infinite;' : ''}
    `;

    container.appendChild(bar);

    // Add indeterminate animation
    if (indeterminate && !document.getElementById('calos-progress-styles')) {
      const style = document.createElement('style');
      style.id = 'calos-progress-styles';
      style.textContent = `
        @keyframes calos-progress-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `;
      document.head.appendChild(style);
    }

    // Methods
    container.setProgress = (percent) => {
      bar.style.width = Math.min(100, Math.max(0, percent)) + '%';
    };

    container.getProgress = () => {
      return parseInt(bar.style.width);
    };

    return container;
  }

  /**
   * Create circular progress indicator
   */
  createCircularProgress(options = {}) {
    const {
      size = 60,
      color = '#4a9eff',
      bgColor = '#e0e0e0',
      thickness = 6,
      showPercentage = true
    } = options;

    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;

    const container = document.createElement('div');
    container.className = 'calos-circular-progress';
    container.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    `;

    container.innerHTML = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle
          cx="${size / 2}"
          cy="${size / 2}"
          r="${radius}"
          stroke="${bgColor}"
          stroke-width="${thickness}"
          fill="none"
        />
        <circle
          cx="${size / 2}"
          cy="${size / 2}"
          r="${radius}"
          stroke="${color}"
          stroke-width="${thickness}"
          fill="none"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${circumference}"
          stroke-linecap="round"
          style="
            transform: rotate(-90deg);
            transform-origin: center;
            transition: stroke-dashoffset 0.3s ease;
          "
          class="progress-circle"
        />
      </svg>
      ${showPercentage ? '<div style="position: absolute; font-size: 12px; font-weight: bold;">0%</div>' : ''}
    `;

    const circle = container.querySelector('.progress-circle');
    const text = container.querySelector('div');

    // Methods
    container.setProgress = (percent) => {
      const offset = circumference - (percent / 100) * circumference;
      circle.style.strokeDashoffset = offset;
      if (text) text.textContent = Math.round(percent) + '%';
    };

    return container;
  }

  // ============================================================================
  // SKELETON SCREENS
  // ============================================================================

  /**
   * Create skeleton loader
   */
  createSkeleton(type = 'text', options = {}) {
    const {
      width = '100%',
      height = 20,
      borderRadius = 4,
      color = '#e0e0e0',
      animationColor = '#f0f0f0'
    } = options;

    const skeleton = document.createElement('div');
    skeleton.className = 'calos-skeleton';

    switch (type) {
      case 'text':
        skeleton.style.cssText = `
          width: ${width};
          height: ${height}px;
          background: linear-gradient(90deg, ${color} 25%, ${animationColor} 50%, ${color} 75%);
          background-size: 200% 100%;
          animation: calos-skeleton-shimmer 1.5s ease-in-out infinite;
          border-radius: ${borderRadius}px;
        `;
        break;

      case 'circle':
        const size = options.size || 60;
        skeleton.style.cssText = `
          width: ${size}px;
          height: ${size}px;
          background: linear-gradient(90deg, ${color} 25%, ${animationColor} 50%, ${color} 75%);
          background-size: 200% 100%;
          animation: calos-skeleton-shimmer 1.5s ease-in-out infinite;
          border-radius: 50%;
        `;
        break;

      case 'card':
        skeleton.innerHTML = `
          <div style="padding: 16px; border: 1px solid ${color}; border-radius: 8px;">
            <div class="calos-skeleton-line" style="width: 60%; height: 24px; margin-bottom: 12px;"></div>
            <div class="calos-skeleton-line" style="width: 100%; height: 16px; margin-bottom: 8px;"></div>
            <div class="calos-skeleton-line" style="width: 100%; height: 16px; margin-bottom: 8px;"></div>
            <div class="calos-skeleton-line" style="width: 80%; height: 16px;"></div>
          </div>
        `;

        skeleton.querySelectorAll('.calos-skeleton-line').forEach(line => {
          line.style.cssText = `
            background: linear-gradient(90deg, ${color} 25%, ${animationColor} 50%, ${color} 75%);
            background-size: 200% 100%;
            animation: calos-skeleton-shimmer 1.5s ease-in-out infinite;
            border-radius: ${borderRadius}px;
          `;
        });
        break;

      case 'image':
        skeleton.style.cssText = `
          width: ${width};
          height: ${height}px;
          background: linear-gradient(90deg, ${color} 25%, ${animationColor} 50%, ${color} 75%);
          background-size: 200% 100%;
          animation: calos-skeleton-shimmer 1.5s ease-in-out infinite;
          border-radius: ${borderRadius}px;
        `;
        break;
    }

    // Add shimmer animation
    this._ensureSkeletonStyles();

    return skeleton;
  }

  /**
   * Ensure skeleton CSS animations exist
   */
  _ensureSkeletonStyles() {
    if (document.getElementById('calos-skeleton-styles')) return;

    const style = document.createElement('style');
    style.id = 'calos-skeleton-styles';
    style.textContent = `
      @keyframes calos-skeleton-shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }

      .calos-skeleton {
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================================
  // LOADING OVERLAYS
  // ============================================================================

  /**
   * Create full-screen loading overlay
   */
  createOverlay(options = {}) {
    const {
      message = 'Loading...',
      spinner = 'circle',
      bgColor = 'rgba(0, 0, 0, 0.5)',
      textColor = '#fff'
    } = options;

    const overlay = document.createElement('div');
    overlay.className = 'calos-loading-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${bgColor};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      z-index: 10000;
      backdrop-filter: blur(4px);
    `;

    const spinnerEl = this.createSpinner(spinner, { color: textColor });
    const messageEl = document.createElement('div');
    messageEl.textContent = message;
    messageEl.style.cssText = `
      color: ${textColor};
      font-size: 16px;
      font-weight: 500;
    `;

    overlay.appendChild(spinnerEl);
    overlay.appendChild(messageEl);

    // Methods
    overlay.setMessage = (msg) => {
      messageEl.textContent = msg;
    };

    return overlay;
  }

  // ============================================================================
  // SHOW/HIDE METHODS
  // ============================================================================

  /**
   * Show loading indicator
   */
  show(element, options = {}) {
    const {
      fadeIn = true,
      duration = 200
    } = options;

    this.container.appendChild(element);

    if (fadeIn && this.engine) {
      element.style.opacity = '0';
      this.engine.animate(element, [
        { opacity: 0 },
        { opacity: 1 }
      ], { duration });
    }

    const loaderId = Math.random().toString(36).substr(2, 9);
    this.activeLoaders.set(loaderId, { element });

    return loaderId;
  }

  /**
   * Hide loading indicator
   */
  async hide(loaderIdOrElement, options = {}) {
    const {
      fadeOut = true,
      duration = 200
    } = options;

    let element;

    if (typeof loaderIdOrElement === 'string') {
      const loader = this.activeLoaders.get(loaderIdOrElement);
      if (!loader) return;
      element = loader.element;
      this.activeLoaders.delete(loaderIdOrElement);
    } else {
      element = loaderIdOrElement;
    }

    if (fadeOut && this.engine) {
      await new Promise((resolve) => {
        this.engine.animate(element, [
          { opacity: 1 },
          { opacity: 0 }
        ], {
          duration,
          onComplete: () => {
            if (element.parentElement) {
              element.parentElement.removeChild(element);
            }
            resolve();
          }
        });
      });
    } else {
      if (element.parentElement) {
        element.parentElement.removeChild(element);
      }
    }
  }

  /**
   * Hide all active loaders
   */
  async hideAll() {
    const promises = Array.from(this.activeLoaders.keys()).map(id => this.hide(id));
    await Promise.all(promises);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Show loading overlay
   */
  showOverlay(message = 'Loading...', spinnerType = 'circle') {
    const overlay = this.createOverlay({
      message,
      spinner: spinnerType
    });

    return this.show(overlay);
  }

  /**
   * Get active loader count
   */
  getActiveCount() {
    return this.activeLoaders.size;
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

if (typeof window !== 'undefined') {
  window.CalOSLoadingComponents = LoadingComponents;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LoadingComponents;
}
