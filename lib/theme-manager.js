/**
 * Theme Manager
 *
 * Manages iOS-inspired visual themes for the CalOS PWA.
 * Allows users to customize their interface with different iOS version styles.
 *
 * Themes:
 * - ios-7: Flat design (like iOS 7-9)
 * - ios-14: Modern gradients (like iOS 14)
 * - ios-15: Glassmorphic blur (like iOS 15+)
 * - classic: Original CalOS dark theme
 */

class ThemeManager {
  constructor() {
    // Available themes with their characteristics
    this.themes = {
      'classic': {
        name: 'CalOS Dark',
        description: 'Original dark theme with blue/green accents',
        version: 'CalOS 1.0',
        icon: '🌙',
        variables: {
          '--bg-primary': '#0a0a0a',
          '--bg-secondary': '#1a1a1a',
          '--bg-tertiary': '#252525',
          '--border': '#333',
          '--text-primary': '#e0e0e0',
          '--text-secondary': '#888',
          '--accent-blue': '#0080ff',
          '--accent-green': '#00ff88',
          '--accent-red': '#ff4444',
          '--accent-yellow': '#ffaa00',
          '--accent-purple': '#aa00ff'
        }
      },
      'ios-7': {
        name: 'iOS 7 Flat',
        description: 'Minimalist flat design inspired by iOS 7',
        version: 'iOS 7-9',
        icon: '📱',
        variables: {
          '--bg-primary': '#f5f5f5',
          '--bg-secondary': '#ffffff',
          '--bg-tertiary': '#e8e8e8',
          '--border': '#c8c8c8',
          '--text-primary': '#000000',
          '--text-secondary': '#8e8e93',
          '--accent-blue': '#007aff',
          '--accent-green': '#4cd964',
          '--accent-red': '#ff3b30',
          '--accent-yellow': '#ffcc00',
          '--accent-purple': '#5856d6'
        }
      },
      'ios-14': {
        name: 'iOS 14 Modern',
        description: 'Vibrant colors and smooth gradients',
        version: 'iOS 14',
        icon: '🎨',
        variables: {
          '--bg-primary': '#1c1c1e',
          '--bg-secondary': '#2c2c2e',
          '--bg-tertiary': '#3a3a3c',
          '--border': '#48484a',
          '--text-primary': '#ffffff',
          '--text-secondary': '#aeaeb2',
          '--accent-blue': '#0a84ff',
          '--accent-green': '#30d158',
          '--accent-red': '#ff453a',
          '--accent-yellow': '#ffd60a',
          '--accent-purple': '#bf5af2'
        }
      },
      'ios-15': {
        name: 'iOS 15 Glass',
        description: 'Glassmorphic blur effects and depth',
        version: 'iOS 15+',
        icon: '✨',
        variables: {
          '--bg-primary': 'rgba(28, 28, 30, 0.95)',
          '--bg-secondary': 'rgba(44, 44, 46, 0.9)',
          '--bg-tertiary': 'rgba(58, 58, 60, 0.85)',
          '--border': 'rgba(72, 72, 74, 0.5)',
          '--text-primary': '#ffffff',
          '--text-secondary': '#aeaeb2',
          '--accent-blue': '#0a84ff',
          '--accent-green': '#32d74b',
          '--accent-red': '#ff453a',
          '--accent-yellow': '#ffd60a',
          '--accent-purple': '#bf5af2',
          '--blur-amount': '20px',
          '--backdrop-filter': 'blur(20px) saturate(180%)'
        }
      }
    };

    this.currentTheme = 'classic';
    this.storage = null;
  }

  /**
   * Initialize theme system
   * Loads saved theme from storage or detects from browser
   */
  async init(storage = null) {
    this.storage = storage;

    // Try to load saved theme
    if (this.storage) {
      const saved = this.storage.getItem('calos_theme');
      if (saved && this.themes[saved]) {
        this.currentTheme = saved;
      }
    }

    // Apply current theme
    this.applyTheme(this.currentTheme);

    console.log(`[ThemeManager] Initialized with theme: ${this.currentTheme}`);
  }

  /**
   * Get all available themes
   */
  getThemes() {
    return Object.keys(this.themes).map(id => ({
      id,
      ...this.themes[id],
      active: id === this.currentTheme
    }));
  }

  /**
   * Get current active theme
   */
  getCurrentTheme() {
    return {
      id: this.currentTheme,
      ...this.themes[this.currentTheme]
    };
  }

  /**
   * Apply a theme by ID
   */
  applyTheme(themeId) {
    if (!this.themes[themeId]) {
      console.warn(`[ThemeManager] Theme "${themeId}" not found, using classic`);
      themeId = 'classic';
    }

    const theme = this.themes[themeId];

    // Apply CSS variables to :root
    const root = document.documentElement;
    Object.entries(theme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Add special classes for glassmorphic effects
    if (themeId === 'ios-15') {
      document.body.classList.add('theme-glass');
      this.addGlassmorphicStyles();
    } else {
      document.body.classList.remove('theme-glass');
    }

    // Add theme class to body
    document.body.className = document.body.className.replace(/theme-\w+/g, '');
    document.body.classList.add(`theme-${themeId}`);

    this.currentTheme = themeId;

    // Save to storage
    if (this.storage) {
      this.storage.setItem('calos_theme', themeId);
    }

    console.log(`[ThemeManager] Applied theme: ${theme.name}`);

    // Dispatch theme change event
    window.dispatchEvent(new CustomEvent('themechange', {
      detail: { themeId, theme }
    }));

    return theme;
  }

  /**
   * Add glassmorphic blur styles for iOS 15 theme
   */
  addGlassmorphicStyles() {
    const styleId = 'theme-glass-styles';

    // Remove existing styles if present
    const existing = document.getElementById(styleId);
    if (existing) {
      existing.remove();
    }

    // Add new glassmorphic styles
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .theme-glass .window,
      .theme-glass .card,
      .theme-glass .app-icon-image,
      .theme-glass .dock,
      .theme-glass .window-titlebar,
      .theme-glass .status-bar {
        backdrop-filter: var(--backdrop-filter);
        -webkit-backdrop-filter: var(--backdrop-filter);
      }

      .theme-glass .window,
      .theme-glass .dock {
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.37);
      }

      .theme-glass .app-icon-image {
        background: linear-gradient(135deg,
          rgba(var(--accent-blue-rgb, 0, 128, 255), 0.6),
          rgba(var(--accent-purple-rgb, 170, 0, 255), 0.6)
        );
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Switch theme (toggle or specific)
   */
  switchTheme(themeId = null) {
    if (!themeId) {
      // Cycle through themes
      const themeIds = Object.keys(this.themes);
      const currentIndex = themeIds.indexOf(this.currentTheme);
      const nextIndex = (currentIndex + 1) % themeIds.length;
      themeId = themeIds[nextIndex];
    }

    return this.applyTheme(themeId);
  }

  /**
   * Get theme for specific iOS version
   */
  getIOSTheme(version) {
    if (version >= 15) {
      return 'ios-15';
    } else if (version >= 14) {
      return 'ios-14';
    } else if (version >= 7) {
      return 'ios-7';
    }
    return 'classic';
  }

  /**
   * Auto-detect best theme based on user preferences
   */
  detectTheme() {
    // Check if user prefers dark mode
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Check if user prefers reduced motion (might not want glass effects)
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      // Use simpler theme if reduced motion preferred
      return prefersDark ? 'ios-14' : 'ios-7';
    }

    // Default to iOS 15 glass for modern browsers
    if (this.supportsBackdropFilter()) {
      return prefersDark ? 'ios-15' : 'ios-15';
    }

    return prefersDark ? 'ios-14' : 'ios-7';
  }

  /**
   * Check if browser supports backdrop-filter
   */
  supportsBackdropFilter() {
    return CSS.supports('backdrop-filter', 'blur(10px)') ||
           CSS.supports('-webkit-backdrop-filter', 'blur(10px)');
  }

  /**
   * Export current theme as CSS
   */
  exportThemeCSS() {
    const theme = this.themes[this.currentTheme];
    let css = `/* CalOS Theme: ${theme.name} */\n\n:root {\n`;

    Object.entries(theme.variables).forEach(([key, value]) => {
      css += `  ${key}: ${value};\n`;
    });

    css += `}\n`;

    return css;
  }

  /**
   * Get theme statistics
   */
  getStats() {
    return {
      total_themes: Object.keys(this.themes).length,
      current_theme: this.currentTheme,
      supports_glass: this.supportsBackdropFilter(),
      user_prefers_dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      recommended_theme: this.detectTheme()
    };
  }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThemeManager;
} else {
  window.ThemeManager = ThemeManager;
}
