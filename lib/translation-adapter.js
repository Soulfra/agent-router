/**
 * Translation Adapter
 *
 * Provides multi-language translation capability using free APIs.
 * Auto-detects user language and provides cached translations for offline use.
 *
 * Uses MyMemory Translation API (free, no API key required)
 * - 1000 requests/day free tier
 * - 100+ language pairs supported
 * - No authentication needed
 */

const axios = require('axios');

class TranslationAdapter {
  constructor({ cache = null, timeout = 10000 } = {}) {
    this.cache = cache;
    this.timeout = timeout;
    this.baseURL = 'https://api.mymemory.translated.net';

    // Language codes mapping (ISO 639-1)
    this.languages = {
      'en': { name: 'English', nativeName: 'English', flag: '🇬🇧' },
      'es': { name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
      'fr': { name: 'French', nativeName: 'Français', flag: '🇫🇷' },
      'de': { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
      'it': { name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
      'pt': { name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
      'ru': { name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
      'ja': { name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
      'zh': { name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
      'ko': { name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
      'ar': { name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
      'hi': { name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
      'nl': { name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
      'pl': { name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
      'sv': { name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪' },
      'tr': { name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
      'he': { name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱' },
      'th': { name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
      'vi': { name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
      'id': { name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
      'ms': { name: 'Malay', nativeName: 'Bahasa Melayu', flag: '🇲🇾' },
      'cs': { name: 'Czech', nativeName: 'Čeština', flag: '🇨🇿' },
      'da': { name: 'Danish', nativeName: 'Dansk', flag: '🇩🇰' },
      'fi': { name: 'Finnish', nativeName: 'Suomi', flag: '🇫🇮' },
      'no': { name: 'Norwegian', nativeName: 'Norsk', flag: '🇳🇴' },
      'hu': { name: 'Hungarian', nativeName: 'Magyar', flag: '🇭🇺' },
      'ro': { name: 'Romanian', nativeName: 'Română', flag: '🇷🇴' },
      'el': { name: 'Greek', nativeName: 'Ελληνικά', flag: '🇬🇷' },
      'uk': { name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
      'bg': { name: 'Bulgarian', nativeName: 'Български', flag: '🇧🇬' },
      'hr': { name: 'Croatian', nativeName: 'Hrvatski', flag: '🇭🇷' },
      'sk': { name: 'Slovak', nativeName: 'Slovenčina', flag: '🇸🇰' },
      'sr': { name: 'Serbian', nativeName: 'Српски', flag: '🇷🇸' },
      'ca': { name: 'Catalan', nativeName: 'Català', flag: '🏴' },
      'fa': { name: 'Persian', nativeName: 'فارسی', flag: '🇮🇷' },
      'ur': { name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰' },
      'bn': { name: 'Bengali', nativeName: 'বাংলা', flag: '🇧🇩' },
      'ta': { name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
      'te': { name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
      'mr': { name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
      'sw': { name: 'Swahili', nativeName: 'Kiswahili', flag: '🇰🇪' },
      'af': { name: 'Afrikaans', nativeName: 'Afrikaans', flag: '🇿🇦' }
    };
  }

  /**
   * Translate text from one language to another
   */
  async translate(text, fromLang, toLang, options = {}) {
    const cacheKey = `translate:${fromLang}:${toLang}:${text}`;

    // Check cache first (translations don't change)
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.log(`[Translation] Cache hit for "${text.substring(0, 30)}..."`);
        return cached;
      }
    }

    console.log(`[Translation] Translating "${text}" from ${fromLang} to ${toLang}`);

    try {
      const response = await axios.get(`${this.baseURL}/get`, {
        params: {
          q: text,
          langpair: `${fromLang}|${toLang}`,
          de: options.email || 'calos@localhost' // Optional email for better quota
        },
        timeout: this.timeout
      });

      const data = response.data;

      if (data.responseStatus !== 200) {
        throw new Error(data.responseDetails || 'Translation failed');
      }

      const result = {
        original: text,
        translated: data.responseData.translatedText,
        fromLang,
        toLang,
        match: data.responseData.match, // Confidence score (0-1)
        source: 'mymemory',
        timestamp: new Date().toISOString()
      };

      // Cache the translation
      if (this.cache) {
        this.cache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      console.error(`[Translation] Error: ${error.message}`);

      // Return original text if translation fails
      return {
        original: text,
        translated: text,
        fromLang,
        toLang,
        match: 0,
        source: 'fallback',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Batch translate multiple texts
   */
  async translateBatch(texts, fromLang, toLang, options = {}) {
    console.log(`[Translation] Batch translating ${texts.length} texts from ${fromLang} to ${toLang}`);

    const results = await Promise.all(
      texts.map(text => this.translate(text, fromLang, toLang, options))
    );

    return {
      fromLang,
      toLang,
      translations: results,
      count: results.length,
      cached: results.filter(r => r.source !== 'mymemory').length
    };
  }

  /**
   * Detect user's preferred language from browser settings
   */
  detectUserLanguage(request = null) {
    // Server-side detection from HTTP headers
    if (request && request.headers) {
      const acceptLanguage = request.headers['accept-language'];
      if (acceptLanguage) {
        // Parse Accept-Language header (e.g., "en-US,en;q=0.9,es;q=0.8")
        const languages = acceptLanguage.split(',').map(lang => {
          const [code, q] = lang.trim().split(';q=');
          const langCode = code.split('-')[0]; // Get base language (en from en-US)
          const quality = q ? parseFloat(q) : 1.0;
          return { code: langCode, quality };
        });

        // Sort by quality (preference)
        languages.sort((a, b) => b.quality - a.quality);

        // Return first supported language
        for (const lang of languages) {
          if (this.languages[lang.code]) {
            return {
              code: lang.code,
              ...this.languages[lang.code],
              detected: true,
              source: 'http-header'
            };
          }
        }
      }
    }

    // Default to English
    return {
      code: 'en',
      ...this.languages['en'],
      detected: false,
      source: 'default'
    };
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages() {
    return Object.keys(this.languages).map(code => ({
      code,
      ...this.languages[code]
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Check if a language code is supported
   */
  isLanguageSupported(code) {
    return code in this.languages;
  }

  /**
   * Get language info by code
   */
  getLanguageInfo(code) {
    return this.languages[code] || null;
  }

  /**
   * Translate CalOS UI strings
   * Pre-defined translations for common UI elements
   */
  getUITranslations(langCode) {
    const translations = {
      en: {
        files: 'Files',
        chat: 'Chat',
        apikeys: 'API Keys',
        models: 'Models',
        appstore: 'App Store',
        settings: 'Settings',
        calculator: 'Calculator',
        theme: 'Theme',
        language: 'Language',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        close: 'Close',
        open: 'Open',
        loading: 'Loading...',
        error: 'Error',
        success: 'Success',
        offline: 'Offline Mode',
        online: 'Online'
      },
      es: {
        files: 'Archivos',
        chat: 'Chat',
        apikeys: 'Claves API',
        models: 'Modelos',
        appstore: 'Tienda',
        settings: 'Configuración',
        calculator: 'Calculadora',
        theme: 'Tema',
        language: 'Idioma',
        save: 'Guardar',
        cancel: 'Cancelar',
        delete: 'Eliminar',
        close: 'Cerrar',
        open: 'Abrir',
        loading: 'Cargando...',
        error: 'Error',
        success: 'Éxito',
        offline: 'Modo Sin Conexión',
        online: 'En Línea'
      },
      fr: {
        files: 'Fichiers',
        chat: 'Chat',
        apikeys: 'Clés API',
        models: 'Modèles',
        appstore: 'App Store',
        settings: 'Paramètres',
        calculator: 'Calculatrice',
        theme: 'Thème',
        language: 'Langue',
        save: 'Enregistrer',
        cancel: 'Annuler',
        delete: 'Supprimer',
        close: 'Fermer',
        open: 'Ouvrir',
        loading: 'Chargement...',
        error: 'Erreur',
        success: 'Succès',
        offline: 'Mode Hors Ligne',
        online: 'En Ligne'
      },
      de: {
        files: 'Dateien',
        chat: 'Chat',
        apikeys: 'API-Schlüssel',
        models: 'Modelle',
        appstore: 'App Store',
        settings: 'Einstellungen',
        calculator: 'Rechner',
        theme: 'Design',
        language: 'Sprache',
        save: 'Speichern',
        cancel: 'Abbrechen',
        delete: 'Löschen',
        close: 'Schließen',
        open: 'Öffnen',
        loading: 'Laden...',
        error: 'Fehler',
        success: 'Erfolg',
        offline: 'Offline-Modus',
        online: 'Online'
      },
      it: {
        files: 'File',
        chat: 'Chat',
        apikeys: 'Chiavi API',
        models: 'Modelli',
        appstore: 'App Store',
        settings: 'Impostazioni',
        calculator: 'Calcolatrice',
        theme: 'Tema',
        language: 'Lingua',
        save: 'Salva',
        cancel: 'Annulla',
        delete: 'Elimina',
        close: 'Chiudi',
        open: 'Apri',
        loading: 'Caricamento...',
        error: 'Errore',
        success: 'Successo',
        offline: 'Modalità Offline',
        online: 'Online'
      },
      pt: {
        files: 'Arquivos',
        chat: 'Chat',
        apikeys: 'Chaves API',
        models: 'Modelos',
        appstore: 'Loja de Apps',
        settings: 'Configurações',
        calculator: 'Calculadora',
        theme: 'Tema',
        language: 'Idioma',
        save: 'Salvar',
        cancel: 'Cancelar',
        delete: 'Excluir',
        close: 'Fechar',
        open: 'Abrir',
        loading: 'Carregando...',
        error: 'Erro',
        success: 'Sucesso',
        offline: 'Modo Offline',
        online: 'Online'
      },
      zh: {
        files: '文件',
        chat: '聊天',
        apikeys: 'API密钥',
        models: '模型',
        appstore: '应用商店',
        settings: '设置',
        calculator: '计算器',
        theme: '主题',
        language: '语言',
        save: '保存',
        cancel: '取消',
        delete: '删除',
        close: '关闭',
        open: '打开',
        loading: '加载中...',
        error: '错误',
        success: '成功',
        offline: '离线模式',
        online: '在线'
      },
      ja: {
        files: 'ファイル',
        chat: 'チャット',
        apikeys: 'APIキー',
        models: 'モデル',
        appstore: 'App Store',
        settings: '設定',
        calculator: '電卓',
        theme: 'テーマ',
        language: '言語',
        save: '保存',
        cancel: 'キャンセル',
        delete: '削除',
        close: '閉じる',
        open: '開く',
        loading: '読み込み中...',
        error: 'エラー',
        success: '成功',
        offline: 'オフラインモード',
        online: 'オンライン'
      },
      ru: {
        files: 'Файлы',
        chat: 'Чат',
        apikeys: 'API Ключи',
        models: 'Модели',
        appstore: 'App Store',
        settings: 'Настройки',
        calculator: 'Калькулятор',
        theme: 'Тема',
        language: 'Язык',
        save: 'Сохранить',
        cancel: 'Отмена',
        delete: 'Удалить',
        close: 'Закрыть',
        open: 'Открыть',
        loading: 'Загрузка...',
        error: 'Ошибка',
        success: 'Успех',
        offline: 'Офлайн Режим',
        online: 'Онлайн'
      },
      ar: {
        files: 'ملفات',
        chat: 'دردشة',
        apikeys: 'مفاتيح API',
        models: 'نماذج',
        appstore: 'متجر التطبيقات',
        settings: 'الإعدادات',
        calculator: 'آلة حاسبة',
        theme: 'المظهر',
        language: 'اللغة',
        save: 'حفظ',
        cancel: 'إلغاء',
        delete: 'حذف',
        close: 'إغلاق',
        open: 'فتح',
        loading: 'جار التحميل...',
        error: 'خطأ',
        success: 'نجح',
        offline: 'وضع عدم الاتصال',
        online: 'متصل'
      }
    };

    return translations[langCode] || translations['en'];
  }

  /**
   * Get statistics about translation usage
   */
  getStats() {
    return {
      supported_languages: Object.keys(this.languages).length,
      api_provider: 'MyMemory',
      daily_limit: 1000,
      cache_enabled: this.cache !== null
    };
  }
}

module.exports = TranslationAdapter;
