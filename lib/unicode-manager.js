/**
 * Unicode Manager
 *
 * Fetches and manages Unicode character data from official Unicode sources.
 * Provides character lookup, search, and metadata.
 *
 * Data Sources:
 * - https://www.unicode.org/Public/UCD/latest/ucd/DerivedAge.txt
 * - https://www.unicode.org/Public/UNIDATA/UnicodeData.txt
 * - https://www.unicode.org/Public/UNIDATA/Scripts.txt
 * - https://www.unicode.org/Public/UNIDATA/Blocks.txt
 *
 * Note: FTP endpoints (ftp://ftp.unicode.org) are also available but we use
 * HTTPS mirrors for better compatibility.
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');

class UnicodeManager {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(__dirname, '../.unicode-cache');
    this.cacheDuration = options.cacheDuration || 30 * 24 * 60 * 60 * 1000; // 30 days

    // Unicode data sources (HTTPS mirrors of FTP)
    this.sources = {
      unicodeData: 'https://www.unicode.org/Public/UNIDATA/UnicodeData.txt',
      scripts: 'https://www.unicode.org/Public/UNIDATA/Scripts.txt',
      blocks: 'https://www.unicode.org/Public/UNIDATA/Blocks.txt',
      derivedAge: 'https://www.unicode.org/Public/UCD/latest/ucd/DerivedAge.txt',

      // Mathematical symbols
      mathOperators: 'https://www.unicode.org/charts/PDF/U2200.pdf', // Visual reference only
      greekCoptic: 'https://www.unicode.org/charts/PDF/U0370.pdf' // Visual reference only
    };

    // Cached data
    this.characters = null;
    this.scripts = null;
    this.blocks = null;
    this.ages = null;
  }

  /**
   * Initialize: Load all Unicode data
   */
  async initialize() {
    console.log('[UnicodeManager] Initializing...');

    await this._ensureCacheDir();

    // Load data (cached or fetch)
    await Promise.all([
      this.loadUnicodeData(),
      this.loadScripts(),
      this.loadBlocks(),
      this.loadDerivedAge()
    ]);

    console.log('[UnicodeManager] Initialized successfully');
  }

  /**
   * Load Unicode character data
   */
  async loadUnicodeData() {
    const cacheFile = path.join(this.cacheDir, 'UnicodeData.txt');

    if (await this._isCacheValid(cacheFile)) {
      console.log('[UnicodeManager] Loading UnicodeData from cache');
      const data = await fs.readFile(cacheFile, 'utf-8');
      this.characters = this._parseUnicodeData(data);
      return this.characters;
    }

    console.log('[UnicodeManager] Fetching UnicodeData from unicode.org...');
    const data = await this._fetchURL(this.sources.unicodeData);

    await fs.writeFile(cacheFile, data, 'utf-8');
    this.characters = this._parseUnicodeData(data);

    return this.characters;
  }

  /**
   * Load Scripts data
   */
  async loadScripts() {
    const cacheFile = path.join(this.cacheDir, 'Scripts.txt');

    if (await this._isCacheValid(cacheFile)) {
      console.log('[UnicodeManager] Loading Scripts from cache');
      const data = await fs.readFile(cacheFile, 'utf-8');
      this.scripts = this._parseScripts(data);
      return this.scripts;
    }

    console.log('[UnicodeManager] Fetching Scripts from unicode.org...');
    const data = await this._fetchURL(this.sources.scripts);

    await fs.writeFile(cacheFile, data, 'utf-8');
    this.scripts = this._parseScripts(data);

    return this.scripts;
  }

  /**
   * Load Blocks data
   */
  async loadBlocks() {
    const cacheFile = path.join(this.cacheDir, 'Blocks.txt');

    if (await this._isCacheValid(cacheFile)) {
      console.log('[UnicodeManager] Loading Blocks from cache');
      const data = await fs.readFile(cacheFile, 'utf-8');
      this.blocks = this._parseBlocks(data);
      return this.blocks;
    }

    console.log('[UnicodeManager] Fetching Blocks from unicode.org...');
    const data = await this._fetchURL(this.sources.blocks);

    await fs.writeFile(cacheFile, data, 'utf-8');
    this.blocks = this._parseBlocks(data);

    return this.blocks;
  }

  /**
   * Load DerivedAge data (when characters were added)
   */
  async loadDerivedAge() {
    const cacheFile = path.join(this.cacheDir, 'DerivedAge.txt');

    if (await this._isCacheValid(cacheFile)) {
      console.log('[UnicodeManager] Loading DerivedAge from cache');
      const data = await fs.readFile(cacheFile, 'utf-8');
      this.ages = this._parseDerivedAge(data);
      return this.ages;
    }

    console.log('[UnicodeManager] Fetching DerivedAge from unicode.org...');
    const data = await this._fetchURL(this.sources.derivedAge);

    await fs.writeFile(cacheFile, data, 'utf-8');
    this.ages = this._parseDerivedAge(data);

    return this.ages;
  }

  /**
   * Get character by code point
   * @param {number} codePoint - Unicode code point (e.g., 0x1D461)
   * @returns {object} Character info
   */
  getCharacter(codePoint) {
    if (!this.characters) {
      throw new Error('Unicode data not loaded. Call initialize() first.');
    }

    return this.characters.get(codePoint);
  }

  /**
   * Get character by hex string
   * @param {string} hex - Hex code point (e.g., "1D461" or "U+1D461")
   * @returns {object} Character info
   */
  getCharacterByHex(hex) {
    // Remove U+ prefix if present
    const cleanHex = hex.replace(/^U\+/i, '');
    const codePoint = parseInt(cleanHex, 16);

    return this.getCharacter(codePoint);
  }

  /**
   * Search characters by name
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {array} Matching characters
   */
  searchByName(query, limit = 20) {
    if (!this.characters) {
      throw new Error('Unicode data not loaded. Call initialize() first.');
    }

    const queryLower = query.toLowerCase();
    const results = [];

    for (const [codePoint, char] of this.characters) {
      if (char.name.toLowerCase().includes(queryLower)) {
        results.push({
          codePoint,
          hex: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
          character: String.fromCodePoint(codePoint),
          name: char.name,
          category: char.category
        });

        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Get mathematical symbols
   * @returns {array} List of math symbols
   */
  getMathSymbols() {
    // Mathematical operators block: U+2200 to U+22FF
    // Mathematical alphanumeric symbols: U+1D400 to U+1D7FF
    // Greek and Coptic: U+0370 to U+03FF

    const mathRanges = [
      { start: 0x2200, end: 0x22FF, name: 'Mathematical Operators' },
      { start: 0x2A00, end: 0x2AFF, name: 'Supplemental Mathematical Operators' },
      { start: 0x27C0, end: 0x27EF, name: 'Miscellaneous Mathematical Symbols-A' },
      { start: 0x2980, end: 0x29FF, name: 'Miscellaneous Mathematical Symbols-B' },
      { start: 0x1D400, end: 0x1D7FF, name: 'Mathematical Alphanumeric Symbols' }
    ];

    const symbols = [];

    for (const range of mathRanges) {
      for (let cp = range.start; cp <= range.end; cp++) {
        const char = this.getCharacter(cp);
        if (char) {
          symbols.push({
            codePoint: cp,
            hex: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
            character: String.fromCodePoint(cp),
            name: char.name,
            category: char.category,
            block: range.name
          });
        }
      }
    }

    return symbols;
  }

  /**
   * Get Greek letters
   * @returns {array} List of Greek letters
   */
  getGreekLetters() {
    const greekRange = { start: 0x0370, end: 0x03FF };
    const letters = [];

    for (let cp = greekRange.start; cp <= greekRange.end; cp++) {
      const char = this.getCharacter(cp);
      if (char && char.category.startsWith('L')) { // Only letters
        letters.push({
          codePoint: cp,
          hex: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
          character: String.fromCodePoint(cp),
          name: char.name,
          category: char.category
        });
      }
    }

    return letters;
  }

  /**
   * Parse UnicodeData.txt
   * Format: CodePoint;Name;Category;...
   * @private
   */
  _parseUnicodeData(data) {
    const characters = new Map();
    const lines = data.split('\n');

    for (const line of lines) {
      if (!line || line.startsWith('#')) continue;

      const fields = line.split(';');
      if (fields.length < 3) continue;

      const codePoint = parseInt(fields[0], 16);
      const name = fields[1];
      const category = fields[2];

      characters.set(codePoint, {
        name,
        category,
        codePoint
      });
    }

    return characters;
  }

  /**
   * Parse Scripts.txt
   * @private
   */
  _parseScripts(data) {
    const scripts = new Map();
    const lines = data.split('\n');

    for (const line of lines) {
      if (!line || line.startsWith('#')) continue;

      const match = line.match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(\w+)/);
      if (!match) continue;

      const start = parseInt(match[1], 16);
      const end = match[2] ? parseInt(match[2], 16) : start;
      const script = match[3];

      for (let cp = start; cp <= end; cp++) {
        scripts.set(cp, script);
      }
    }

    return scripts;
  }

  /**
   * Parse Blocks.txt
   * @private
   */
  _parseBlocks(data) {
    const blocks = [];
    const lines = data.split('\n');

    for (const line of lines) {
      if (!line || line.startsWith('#')) continue;

      const match = line.match(/^([0-9A-F]+)\.\.([0-9A-F]+);\s*(.+)$/);
      if (!match) continue;

      blocks.push({
        start: parseInt(match[1], 16),
        end: parseInt(match[2], 16),
        name: match[3].trim()
      });
    }

    return blocks;
  }

  /**
   * Parse DerivedAge.txt
   * @private
   */
  _parseDerivedAge(data) {
    const ages = new Map();
    const lines = data.split('\n');

    for (const line of lines) {
      if (!line || line.startsWith('#')) continue;

      const match = line.match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(\d+\.\d+)/);
      if (!match) continue;

      const start = parseInt(match[1], 16);
      const end = match[2] ? parseInt(match[2], 16) : start;
      const version = match[3];

      for (let cp = start; cp <= end; cp++) {
        ages.set(cp, version);
      }
    }

    return ages;
  }

  /**
   * Fetch URL via HTTPS
   * @private
   */
  _fetchURL(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  /**
   * Check if cache is valid
   * @private
   */
  async _isCacheValid(file) {
    try {
      const stats = await fs.stat(file);
      const age = Date.now() - stats.mtimeMs;
      return age < this.cacheDuration;
    } catch (error) {
      return false;
    }
  }

  /**
   * Ensure cache directory exists
   * @private
   */
  async _ensureCacheDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }
}

module.exports = UnicodeManager;
