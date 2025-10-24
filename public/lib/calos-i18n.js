/**
 * CALOS i18n Translation System
 *
 * Reusable translation component for all CALOS apps
 * Supports English and Spanish by default
 *
 * Usage:
 *   <script src="/lib/calos-i18n.js"></script>
 *   <script>
 *     const i18n = new CalosI18n({
 *       defaultLanguage: 'en',
 *       translations: {
 *         en: { greeting: 'Hello' },
 *         es: { greeting: 'Hola' }
 *       }
 *     });
 *
 *     i18n.renderLanguageSelector('#selector-container');
 *     i18n.translate(); // Translate all [data-i18n] elements
 *   </script>
 */

class CalosI18n {
  constructor(config = {}) {
    this.translations = config.translations || {};
    this.defaultLanguage = config.defaultLanguage || 'en';
    this.currentLanguage = this.loadSavedLanguage() || this.defaultLanguage;
    this.storageKey = config.storageKey || 'calos-language';
    this.onLanguageChange = config.onLanguageChange || null;
  }

  /**
   * Load saved language preference from localStorage
   */
  loadSavedLanguage() {
    return localStorage.getItem(this.storageKey);
  }

  /**
   * Save language preference to localStorage
   */
  saveLanguage(lang) {
    localStorage.setItem(this.storageKey, lang);
  }

  /**
   * Set current language and translate page
   */
  setLanguage(lang) {
    if (!this.translations[lang]) {
      console.warn(`[CalosI18n] Language '${lang}' not found, falling back to '${this.defaultLanguage}'`);
      lang = this.defaultLanguage;
    }

    this.currentLanguage = lang;
    this.saveLanguage(lang);
    this.translate();

    // Call custom callback if provided
    if (this.onLanguageChange) {
      this.onLanguageChange(lang);
    }

    // Update selector if rendered
    const selector = document.getElementById('calos-language-selector');
    if (selector) {
      selector.value = lang;
    }
  }

  /**
   * Get translation for a key
   * @param {string} key - Dot-notation key (e.g., 'header.title')
   * @param {object} variables - Variables to interpolate (e.g., {name: 'John'})
   * @returns {string} Translated text
   */
  t(key, variables = {}) {
    const keys = key.split('.');
    let translation = this.translations[this.currentLanguage];

    for (const k of keys) {
      translation = translation?.[k];
    }

    if (!translation) {
      console.warn(`[CalosI18n] Translation not found for key: ${key}`);
      return key;
    }

    // Replace variables like {name} with values
    return translation.replace(/\{(\w+)\}/g, (match, variable) => {
      return variables[variable] || match;
    });
  }

  /**
   * Translate all elements with [data-i18n] attribute
   */
  translate() {
    document.querySelectorAll('[data-i18n]').forEach(elem => {
      const key = elem.getAttribute('data-i18n');
      const translation = this.t(key);

      // Check if translation should go in placeholder, value, or textContent
      if (elem.tagName === 'INPUT' || elem.tagName === 'TEXTAREA') {
        if (elem.hasAttribute('placeholder')) {
          elem.placeholder = translation;
        } else {
          elem.value = translation;
        }
      } else {
        elem.textContent = translation;
      }
    });
  }

  /**
   * Render language selector dropdown
   * @param {string} containerSelector - CSS selector for container
   * @param {object} options - Customization options
   */
  renderLanguageSelector(containerSelector, options = {}) {
    const container = document.querySelector(containerSelector);
    if (!container) {
      console.error(`[CalosI18n] Container not found: ${containerSelector}`);
      return;
    }

    const languages = options.languages || [
      { code: 'en', flag: '🇺🇸', name: 'English' },
      { code: 'es', flag: '🇪🇸', name: 'Español' }
    ];

    const styles = options.styles || `
      padding: 8px 16px;
      font-size: 16px;
      border-radius: 8px;
      border: 2px solid rgba(102, 126, 234, 0.3);
      background: white;
      color: #667eea;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s ease;
    `;

    const select = document.createElement('select');
    select.id = 'calos-language-selector';
    select.style.cssText = styles;

    languages.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = `${lang.flag} ${lang.name}`;
      select.appendChild(option);
    });

    select.value = this.currentLanguage;
    select.addEventListener('change', (e) => {
      this.setLanguage(e.target.value);
    });

    container.appendChild(select);
  }

  /**
   * Auto-detect language from browser settings
   */
  detectBrowserLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    const langCode = browserLang.split('-')[0]; // 'en-US' → 'en'

    if (this.translations[langCode]) {
      return langCode;
    }

    return this.defaultLanguage;
  }

  /**
   * Add translations dynamically
   */
  addTranslations(lang, translations) {
    if (!this.translations[lang]) {
      this.translations[lang] = {};
    }
    Object.assign(this.translations[lang], translations);
  }

  /**
   * Get all available languages
   */
  getAvailableLanguages() {
    return Object.keys(this.translations);
  }

  /**
   * Initialize with auto-detection and rendering
   */
  init() {
    // Auto-detect if no saved language
    if (!this.loadSavedLanguage()) {
      const detected = this.detectBrowserLanguage();
      this.setLanguage(detected);
    } else {
      this.translate();
    }
  }
}

// Export for use in both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalosI18n;
}
