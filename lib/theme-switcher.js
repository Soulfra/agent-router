/**
 * Theme Switcher
 *
 * Environment-based theme loading
 * Staging = Colorful, full-featured
 * Production = Minimal, B&W, Craigslist-style
 */

const fs = require('fs').promises;
const path = require('path');

class ThemeSwitcher {
  constructor(options = {}) {
    this.environment = process.env.NODE_ENV || 'development';
    this.themesDir = options.themesDir || path.join(__dirname, '../public/themes');
    this.themeConfigFile = path.join(__dirname, '../public/.theme');

    // Theme definitions
    this.themes = {
      staging: {
        name: 'staging',
        label: 'Staging (Colorful)',
        css: 'staging.css',
        features: {
          debug: true,
          animations: true,
          colorful: true,
          gradients: true,
          shadows: true,
          verbose: true
        }
      },
      production: {
        name: 'production',
        label: 'Production (Minimal)',
        css: 'production.css',
        features: {
          debug: false,
          animations: false,
          colorful: false,
          gradients: false,
          shadows: false,
          verbose: false
        }
      },
      development: {
        name: 'development',
        label: 'Development',
        css: 'staging.css',
        features: {
          debug: true,
          animations: true,
          colorful: true,
          gradients: true,
          shadows: true,
          verbose: true
        }
      }
    };
  }

  /**
   * Get current theme based on environment
   */
  async getCurrentTheme() {
    // Try to read theme config file
    try {
      const themeData = await fs.readFile(this.themeConfigFile, 'utf8');
      const config = JSON.parse(themeData);

      if (config.current && this.themes[config.current]) {
        return this.themes[config.current];
      }
    } catch {
      // File doesn't exist or is invalid, use environment-based theme
    }

    // Default to environment-based theme
    const themeName = this.environment === 'production' ? 'production' : 'staging';
    return this.themes[themeName];
  }

  /**
   * Switch to a specific theme
   */
  async switchTheme(themeName) {
    if (!this.themes[themeName]) {
      throw new Error(`Unknown theme: ${themeName}`);
    }

    const config = {
      current: themeName,
      timestamp: new Date().toISOString(),
      environment: this.environment
    };

    await fs.writeFile(this.themeConfigFile, JSON.stringify(config, null, 2));

    console.log(`[ThemeSwitcher] Switched to theme: ${themeName}`);

    return this.themes[themeName];
  }

  /**
   * Get theme CSS path
   */
  async getThemeCSS() {
    const theme = await this.getCurrentTheme();
    return `/themes/${theme.css}`;
  }

  /**
   * Get theme features
   */
  async getThemeFeatures() {
    const theme = await this.getCurrentTheme();
    return theme.features;
  }

  /**
   * Check if feature is enabled
   */
  async isFeatureEnabled(feature) {
    const features = await this.getThemeFeatures();
    return features[feature] === true;
  }

  /**
   * Generate theme metadata for HTML
   */
  async getThemeMetadata() {
    const theme = await this.getCurrentTheme();

    return {
      name: theme.name,
      label: theme.label,
      css: `/themes/${theme.css}`,
      features: theme.features,
      environment: this.environment
    };
  }

  /**
   * Express middleware to inject theme
   */
  middleware() {
    return async (req, res, next) => {
      try {
        const theme = await this.getCurrentTheme();

        // Add theme info to res.locals for templates
        res.locals.theme = {
          name: theme.name,
          label: theme.label,
          css: `/themes/${theme.css}`,
          features: theme.features,
          environment: this.environment
        };

        // Add helper functions
        res.locals.isStaging = this.environment !== 'production';
        res.locals.isProduction = this.environment === 'production';
        res.locals.showDebug = theme.features.debug;

        next();
      } catch (error) {
        console.error('[ThemeSwitcher] Middleware error:', error);
        next();
      }
    };
  }

  /**
   * Get available themes
   */
  getAvailableThemes() {
    return Object.values(this.themes).map(theme => ({
      name: theme.name,
      label: theme.label,
      features: theme.features
    }));
  }

  /**
   * Auto-detect theme from hostname
   */
  detectThemeFromHostname(hostname) {
    // Example patterns:
    // staging.example.com -> staging theme
    // example.com -> production theme
    // dev.example.com -> development theme

    if (hostname.includes('staging')) {
      return 'staging';
    }

    if (hostname.includes('dev') || hostname.includes('localhost')) {
      return 'development';
    }

    // Default to production
    return 'production';
  }

  /**
   * Apply theme based on hostname
   */
  async applyThemeByHostname(hostname) {
    const themeName = this.detectThemeFromHostname(hostname);
    return await this.switchTheme(themeName);
  }
}

module.exports = ThemeSwitcher;
