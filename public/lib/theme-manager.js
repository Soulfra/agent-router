/**
 * CALOS Theme Manager
 *
 * Handles theme switching between Light/Dark/High Contrast/Auto/Custom modes.
 * Stores user preference in localStorage.
 *
 * Usage:
 *   const themeManager = new ThemeManager();
 *   themeManager.setTheme('dark');
 */

class ThemeManager {
  constructor() {
    this.STORAGE_KEY = 'calos-theme';
    this.CUSTOM_THEME_KEY = 'calos-custom-theme';

    // Available themes
    this.themes = {
      auto: 'Auto (System)',
      light: 'Light',
      dark: 'Dark',
      'high-contrast': 'High Contrast',
      custom: 'Custom (MySpace Mode)'
    };

    // Initialize theme on load
    this.init();
  }

  /**
   * Initialize theme system
   */
  init() {
    // Get saved theme or default to 'auto'
    const savedTheme = localStorage.getItem(this.STORAGE_KEY) || 'auto';
    this.setTheme(savedTheme);

    // Listen for system theme changes (when in auto mode)
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeQuery.addEventListener('change', (e) => {
        if (this.getCurrentTheme() === 'auto') {
          // Re-apply auto theme to trigger any listeners
          this.applyTheme('auto');
        }
      });

      const contrastQuery = window.matchMedia('(prefers-contrast: more)');
      contrastQuery.addEventListener('change', (e) => {
        if (this.getCurrentTheme() === 'auto') {
          this.applyTheme('auto');
        }
      });
    }

    console.log('[ThemeManager] Initialized with theme:', savedTheme);
  }

  /**
   * Set theme
   * @param {string} theme - Theme name (auto, light, dark, high-contrast, custom)
   */
  setTheme(theme) {
    if (!this.themes[theme]) {
      console.warn('[ThemeManager] Invalid theme:', theme);
      return;
    }

    // Save to localStorage
    localStorage.setItem(this.STORAGE_KEY, theme);

    // Apply theme
    this.applyTheme(theme);

    console.log('[ThemeManager] Theme set to:', theme);
  }

  /**
   * Apply theme to document
   * @param {string} theme - Theme name
   * @private
   */
  applyTheme(theme) {
    const html = document.documentElement;

    if (theme === 'auto') {
      // Remove data-theme attribute, let CSS media queries handle it
      html.removeAttribute('data-theme');
    } else if (theme === 'custom') {
      // Apply custom theme
      html.setAttribute('data-theme', 'custom');
      this.applyCustomTheme();
    } else {
      // Set data-theme attribute
      html.setAttribute('data-theme', theme);
    }

    // Dispatch event for listeners
    window.dispatchEvent(new CustomEvent('themechange', {
      detail: { theme, effective: this.getEffectiveTheme() }
    }));
  }

  /**
   * Get current theme preference
   * @returns {string} - Theme name
   */
  getCurrentTheme() {
    return localStorage.getItem(this.STORAGE_KEY) || 'auto';
  }

  /**
   * Get effective theme (resolves 'auto' to actual theme)
   * @returns {string} - Effective theme name
   */
  getEffectiveTheme() {
    const current = this.getCurrentTheme();

    if (current === 'auto') {
      // Check system preference
      if (window.matchMedia('(prefers-contrast: more)').matches) {
        return 'high-contrast';
      }
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
      return 'light';
    }

    return current;
  }

  /**
   * Toggle between light and dark
   */
  toggle() {
    const current = this.getEffectiveTheme();
    const next = current === 'light' ? 'dark' : 'light';
    this.setTheme(next);
  }

  /**
   * Create custom theme (MySpace-style)
   * @param {Object} colors - Custom colors
   */
  createCustomTheme(colors = {}) {
    const customTheme = {
      // Primary colors
      'accent-primary': colors.accentPrimary || '#667eea',
      'accent-secondary': colors.accentSecondary || '#764ba2',

      // Background colors
      'bg-primary': colors.bgPrimary || '#ffffff',
      'bg-secondary': colors.bgSecondary || '#fafafa',
      'bg-card': colors.bgCard || '#ffffff',

      // Text colors
      'text-primary': colors.textPrimary || '#333333',
      'text-secondary': colors.textSecondary || '#666666',

      // Graph colors
      'graph-bg': colors.graphBg || '#fafafa',
      'graph-node-heading': colors.graphNodeHeading || '#667eea',
      'graph-node-term': colors.graphNodeTerm || '#764ba2',
      'graph-node-code': colors.graphNodeCode || '#f093fb',

      // Border colors
      'border-primary': colors.borderPrimary || '#e0e0e0',

      // Additional custom properties
      ...colors
    };

    // Save to localStorage
    localStorage.setItem(this.CUSTOM_THEME_KEY, JSON.stringify(customTheme));

    // Apply immediately if custom theme is active
    if (this.getCurrentTheme() === 'custom') {
      this.applyCustomTheme();
    }

    console.log('[ThemeManager] Custom theme created:', customTheme);
  }

  /**
   * Apply custom theme colors
   * @private
   */
  applyCustomTheme() {
    const saved = localStorage.getItem(this.CUSTOM_THEME_KEY);
    if (!saved) {
      console.warn('[ThemeManager] No custom theme found');
      return;
    }

    try {
      const customTheme = JSON.parse(saved);
      const html = document.documentElement;

      // Apply each custom property
      for (const [key, value] of Object.entries(customTheme)) {
        html.style.setProperty(`--${key}`, value);
      }

      console.log('[ThemeManager] Custom theme applied');
    } catch (error) {
      console.error('[ThemeManager] Failed to apply custom theme:', error);
    }
  }

  /**
   * Get custom theme
   * @returns {Object|null} - Custom theme colors
   */
  getCustomTheme() {
    const saved = localStorage.getItem(this.CUSTOM_THEME_KEY);
    if (!saved) return null;

    try {
      return JSON.parse(saved);
    } catch (error) {
      console.error('[ThemeManager] Failed to parse custom theme:', error);
      return null;
    }
  }

  /**
   * Delete custom theme
   */
  deleteCustomTheme() {
    localStorage.removeItem(this.CUSTOM_THEME_KEY);

    // Switch to auto if custom theme was active
    if (this.getCurrentTheme() === 'custom') {
      this.setTheme('auto');
    }

    console.log('[ThemeManager] Custom theme deleted');
  }

  /**
   * Reset to default theme (auto)
   */
  reset() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.setTheme('auto');
  }

  /**
   * Get theme info
   * @param {string} theme - Theme name
   * @returns {Object} - Theme information
   */
  getThemeInfo(theme) {
    const info = {
      name: this.themes[theme],
      key: theme,
      effective: this.getEffectiveTheme()
    };

    // Add description
    switch (theme) {
      case 'auto':
        info.description = 'Follows your system\'s light/dark mode preference';
        break;
      case 'light':
        info.description = 'Light background, dark text';
        break;
      case 'dark':
        info.description = 'Dark background, light text';
        break;
      case 'high-contrast':
        info.description = 'Maximum contrast for accessibility (WCAG AAA)';
        break;
      case 'custom':
        info.description = 'Your personalized MySpace-style theme';
        info.colors = this.getCustomTheme();
        break;
    }

    return info;
  }

  /**
   * Check if system supports dark mode
   * @returns {boolean}
   */
  supportsDarkMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /**
   * Check if system prefers high contrast
   * @returns {boolean}
   */
  prefersHighContrast() {
    return window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches;
  }

  /**
   * Check if system prefers reduced motion
   * @returns {boolean}
   */
  prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.ThemeManager = ThemeManager;
}

// Export for Node.js (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThemeManager;
}
