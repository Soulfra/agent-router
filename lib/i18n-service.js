/**
 * Internationalization (i18n) Service
 *
 * Multi-language translation system with automatic language detection,
 * real-time translation switching, and support for dynamic content.
 *
 * Features:
 * - Auto language detection from browser
 * - Translation files for multiple languages
 * - DOM element translation via data-i18n attributes
 * - Programmatic translation API
 * - Real-time language switching
 * - Fallback to default language
 * - Translation caching
 */

class I18nService {
  constructor(options = {}) {
    // Configuration
    this.defaultLanguage = options.defaultLanguage || 'en';
    this.currentLanguage = null;
    this.fallbackLanguage = options.fallbackLanguage || 'en';

    // Translation storage
    this.translations = new Map(); // language -> translations object
    this.loadedLanguages = new Set();

    // Translation path (for loading files)
    this.translationsPath = options.translationsPath || '/translations';

    // Auto-detection
    this.autoDetect = options.autoDetect !== false;

    // Statistics
    this.stats = {
      translationsLoaded: 0,
      translationsApplied: 0,
      missingKeys: new Set()
    };

    // Initialize
    if (this.autoDetect) {
      this._detectLanguage();
    } else {
      this.currentLanguage = this.defaultLanguage;
    }
  }

  /**
   * Detect user's preferred language from browser
   * @private
   */
  _detectLanguage() {
    // Try navigator.language first
    let detected = navigator.language || navigator.userLanguage;

    if (detected) {
      // Extract base language (e.g., 'en-US' -> 'en')
      detected = detected.split('-')[0].toLowerCase();
    }

    // Fallback to default if detection failed
    this.currentLanguage = detected || this.defaultLanguage;

    console.log(`[I18n] Detected language: ${this.currentLanguage}`);
  }

  /**
   * Load translations for a specific language
   *
   * @param {string} language - Language code (e.g., 'en', 'es', 'fr')
   * @param {Object} translations - Translation object (optional, loads from file if not provided)
   * @returns {Promise<boolean>} Success status
   */
  async loadLanguage(language, translations = null) {
    // If translations provided directly, use them
    if (translations) {
      this.translations.set(language, translations);
      this.loadedLanguages.add(language);
      this.stats.translationsLoaded++;
      console.log(`[I18n] Loaded ${Object.keys(translations).length} translations for ${language}`);
      return true;
    }

    // Otherwise, try to load from file
    try {
      const response = await fetch(`${this.translationsPath}/${language}.json`);

      if (!response.ok) {
        console.warn(`[I18n] Translation file not found for ${language}`);
        return false;
      }

      const data = await response.json();
      this.translations.set(language, data);
      this.loadedLanguages.add(language);
      this.stats.translationsLoaded++;

      console.log(`[I18n] Loaded ${Object.keys(data).length} translations for ${language}`);
      return true;
    } catch (error) {
      console.error(`[I18n] Error loading translations for ${language}:`, error.message);
      return false;
    }
  }

  /**
   * Set current language and apply translations
   *
   * @param {string} language - Language code
   * @param {boolean} applyNow - Apply translations immediately (default: true)
   * @returns {Promise<boolean>} Success status
   */
  async setLanguage(language, applyNow = true) {
    // Load language if not already loaded
    if (!this.loadedLanguages.has(language)) {
      const loaded = await this.loadLanguage(language);
      if (!loaded && language !== this.fallbackLanguage) {
        console.warn(`[I18n] Failed to load ${language}, using fallback ${this.fallbackLanguage}`);
        language = this.fallbackLanguage;
      }
    }

    this.currentLanguage = language;
    console.log(`[I18n] Language set to: ${language}`);

    // Apply translations to DOM
    if (applyNow) {
      this.applyTranslations();
    }

    return true;
  }

  /**
   * Get translation for a key
   *
   * @param {string} key - Translation key
   * @param {Object} vars - Variables to interpolate (e.g., {name: 'John'})
   * @param {string} language - Language override (uses current language if not specified)
   * @returns {string} Translated text
   */
  translate(key, vars = {}, language = null) {
    const lang = language || this.currentLanguage;

    // Get translation from current language
    let text = this._getTranslation(key, lang);

    // Fallback to default language if not found
    if (!text && lang !== this.fallbackLanguage) {
      text = this._getTranslation(key, this.fallbackLanguage);
    }

    // Fallback to key if still not found
    if (!text) {
      this.stats.missingKeys.add(key);
      console.warn(`[I18n] Missing translation for key: ${key}`);
      return key;
    }

    // Interpolate variables
    return this._interpolate(text, vars);
  }

  /**
   * Shorthand for translate()
   */
  t(key, vars = {}, language = null) {
    return this.translate(key, vars, language);
  }

  /**
   * Get translation from storage
   * @private
   */
  _getTranslation(key, language) {
    const translations = this.translations.get(language);
    if (!translations) return null;

    // Support nested keys (e.g., 'errors.notFound')
    const keys = key.split('.');
    let value = translations;

    for (const k of keys) {
      value = value[k];
      if (value === undefined) return null;
    }

    return value;
  }

  /**
   * Interpolate variables in translation text
   * @private
   */
  _interpolate(text, vars) {
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return vars[key] !== undefined ? vars[key] : match;
    });
  }

  /**
   * Apply translations to all DOM elements with data-i18n attributes
   */
  applyTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    let count = 0;

    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translated = this.translate(key);

      // Determine where to apply translation
      const target = element.getAttribute('data-i18n-target') || 'textContent';

      if (target === 'placeholder') {
        element.placeholder = translated;
      } else if (target === 'title') {
        element.title = translated;
      } else if (target === 'value') {
        element.value = translated;
      } else {
        element.textContent = translated;
      }

      count++;
    });

    this.stats.translationsApplied += count;
    console.log(`[I18n] Applied ${count} translations to DOM`);
  }

  /**
   * Register translation observer to auto-translate new elements
   */
  observeDOM() {
    const observer = new MutationObserver((mutations) => {
      let hasNewTranslatableElements = false;

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            if (node.hasAttribute?.('data-i18n')) {
              hasNewTranslatableElements = true;
            }
            // Check children
            if (node.querySelectorAll?.('[data-i18n]').length > 0) {
              hasNewTranslatableElements = true;
            }
          }
        });
      });

      if (hasNewTranslatableElements) {
        this.applyTranslations();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[I18n] DOM observer started for auto-translation');
    return observer;
  }

  /**
   * Get list of available languages
   *
   * @returns {Array<string>} Array of language codes
   */
  getAvailableLanguages() {
    return Array.from(this.loadedLanguages);
  }

  /**
   * Get current language
   *
   * @returns {string} Current language code
   */
  getCurrentLanguage() {
    return this.currentLanguage;
  }

  /**
   * Check if a language is loaded
   *
   * @param {string} language - Language code
   * @returns {boolean} True if loaded
   */
  isLanguageLoaded(language) {
    return this.loadedLanguages.has(language);
  }

  /**
   * Get all translations for a language
   *
   * @param {string} language - Language code (uses current if not specified)
   * @returns {Object|null} Translations object
   */
  getTranslations(language = null) {
    const lang = language || this.currentLanguage;
    return this.translations.get(lang) || null;
  }

  /**
   * Add or update translations for a language
   *
   * @param {string} language - Language code
   * @param {Object} newTranslations - Translations to add/update
   * @param {boolean} merge - Merge with existing (default: true)
   */
  addTranslations(language, newTranslations, merge = true) {
    const existing = this.translations.get(language) || {};

    const updated = merge
      ? { ...existing, ...newTranslations }
      : newTranslations;

    this.translations.set(language, updated);
    this.loadedLanguages.add(language);

    console.log(`[I18n] Added/updated ${Object.keys(newTranslations).length} translations for ${language}`);
  }

  /**
   * Get missing translation keys
   *
   * @returns {Array<string>} Array of missing keys
   */
  getMissingKeys() {
    return Array.from(this.stats.missingKeys);
  }

  /**
   * Get statistics
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      currentLanguage: this.currentLanguage,
      loadedLanguages: Array.from(this.loadedLanguages),
      missingKeysCount: this.stats.missingKeys.size
    };
  }

  /**
   * Format date according to current language
   *
   * @param {Date|string} date - Date to format
   * @param {Object} options - Intl.DateTimeFormat options
   * @returns {string} Formatted date
   */
  formatDate(date, options = {}) {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    return new Intl.DateTimeFormat(this.currentLanguage, options).format(dateObj);
  }

  /**
   * Format number according to current language
   *
   * @param {number} number - Number to format
   * @param {Object} options - Intl.NumberFormat options
   * @returns {string} Formatted number
   */
  formatNumber(number, options = {}) {
    return new Intl.NumberFormat(this.currentLanguage, options).format(number);
  }

  /**
   * Format currency according to current language
   *
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code (e.g., 'USD', 'EUR')
   * @param {Object} options - Intl.NumberFormat options
   * @returns {string} Formatted currency
   */
  formatCurrency(amount, currency = 'USD', options = {}) {
    return new Intl.NumberFormat(this.currentLanguage, {
      style: 'currency',
      currency,
      ...options
    }).format(amount);
  }

  /**
   * Get language direction (LTR or RTL)
   *
   * @param {string} language - Language code (uses current if not specified)
   * @returns {string} 'ltr' or 'rtl'
   */
  getDirection(language = null) {
    const lang = language || this.currentLanguage;

    // RTL languages
    const rtlLanguages = ['ar', 'he', 'fa', 'ur', 'yi'];

    return rtlLanguages.includes(lang) ? 'rtl' : 'ltr';
  }

  /**
   * Apply language direction to document
   *
   * @param {string} language - Language code (uses current if not specified)
   */
  applyDirection(language = null) {
    const direction = this.getDirection(language);
    document.documentElement.setAttribute('dir', direction);
    console.log(`[I18n] Applied direction: ${direction}`);
  }
}

// Browser export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = I18nService;
}

// Global export for browser
if (typeof window !== 'undefined') {
  window.I18nService = I18nService;
}
