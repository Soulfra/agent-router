/**
 * Profile Generator
 * Generates random profile combinations for the swiper system
 * - First name + Last name pairing
 * - Email generation from name + domain
 * - Phone number formatting
 * - Match scoring
 */

const crypto = require('crypto');

class ProfileGenerator {
  constructor() {
    this.firstNames = [];
    this.lastNames = [];
    this.domains = [];
    this.phonePatterns = [];
    this.usedCombinations = new Set(); // Track used combinations in session
  }

  /**
   * Load seed data from arrays
   */
  loadData({ firstNames = [], lastNames = [], domains = [], phonePatterns = [] }) {
    this.firstNames = firstNames;
    this.lastNames = lastNames;
    this.domains = domains;
    this.phonePatterns = phonePatterns;
  }

  /**
   * Generate a random profile combination
   * @param {Object} options - Generation options
   * @param {boolean} options.weighted - Use popularity/frequency weighting
   * @param {string} options.countryCode - Specific country code for phone
   * @returns {Object} Generated profile
   */
  generateProfile(options = {}) {
    const { weighted = false, countryCode } = options;

    // Select first name
    const firstName = this._selectRandomItem(this.firstNames, weighted ? 'popularity' : null);

    // Select last name
    const lastName = this._selectRandomItem(this.lastNames, weighted ? 'frequency' : null);

    // Check if combination already used in this session
    const combinationKey = `${firstName.name}:${lastName.name}`;
    if (this.usedCombinations.has(combinationKey)) {
      // Recursively try again if we've seen this combination
      return this.generateProfile(options);
    }
    this.usedCombinations.add(combinationKey);

    // Select domain
    const domainObj = this._selectRandomItem(this.domains);
    const domain = domainObj.domain;

    // Generate email from name + domain
    const email = this._generateEmail(firstName.name, lastName.name, domain);

    // Select phone pattern (use specified country or random)
    const phonePattern = countryCode
      ? this.phonePatterns.find(p => p.country_code === countryCode)
      : this._selectRandomItem(this.phonePatterns);

    // Generate formatted phone number
    const phone = this._generatePhone(phonePattern);

    // Calculate match score
    const matchScore = this._calculateMatchScore(firstName, lastName, domainObj);

    // Build profile object
    const profile = {
      first_name: firstName.name,
      last_name: lastName.name,
      full_name: `${firstName.name} ${lastName.name}`,
      email: email,
      phone: phone,
      phone_formatted: `${phonePattern.dial_code} ${phone}`,
      domain: domain,
      domain_type: domainObj.type,
      country_code: phonePattern.country_code,
      country_name: phonePattern.country_name,
      match_score: matchScore,
      metadata: {
        first_name_origin: firstName.origin,
        first_name_gender: firstName.gender,
        first_name_popularity: firstName.popularity,
        last_name_origin: lastName.origin,
        last_name_frequency: lastName.frequency,
        dial_code: phonePattern.dial_code
      }
    };

    return profile;
  }

  /**
   * Generate email from first name, last name, and domain
   * Supports multiple format styles
   */
  _generateEmail(firstName, lastName, domain) {
    const formats = [
      `${firstName.toLowerCase()}.${lastName.toLowerCase()}`,           // john.smith
      `${firstName.toLowerCase()}${lastName.toLowerCase()}`,             // johnsmith
      `${firstName[0].toLowerCase()}${lastName.toLowerCase()}`,          // jsmith
      `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,            // john_smith
      `${firstName.toLowerCase()}.${lastName[0].toLowerCase()}`,         // john.s
      `${firstName[0].toLowerCase()}.${lastName.toLowerCase()}`          // j.smith
    ];

    // Select random format
    const format = formats[Math.floor(Math.random() * formats.length)];

    return `${format}@${domain}`;
  }

  /**
   * Generate formatted phone number based on pattern
   */
  _generatePhone(phonePattern) {
    const pattern = phonePattern.pattern;

    // Replace each # with a random digit
    let phone = '';
    for (let char of pattern) {
      if (char === '#') {
        phone += Math.floor(Math.random() * 10);
      } else {
        phone += char;
      }
    }

    return phone;
  }

  /**
   * Calculate match score (0-100) based on profile components
   * Higher score = better/more popular combination
   */
  _calculateMatchScore(firstName, lastName, domain) {
    let score = 50; // Base score

    // Factor in first name popularity (0-40 points)
    score += (firstName.popularity || 50) * 0.4;

    // Factor in last name frequency (0-40 points)
    score += (lastName.frequency || 50) * 0.4;

    // Bonus for matching origins
    if (firstName.origin === lastName.origin) {
      score += 10;
    }

    // Domain type bonuses
    if (domain.type === 'free') {
      score += 5;
    } else if (domain.type === 'corporate') {
      score += 15;
    } else if (domain.type === 'edu') {
      score += 20;
    }

    // Cap at 100
    return Math.min(Math.round(score), 100);
  }

  /**
   * Select random item from array, optionally weighted by a property
   */
  _selectRandomItem(array, weightProperty = null) {
    if (!array || array.length === 0) {
      throw new Error('Cannot select from empty array');
    }

    if (!weightProperty) {
      // Uniform random selection
      return array[Math.floor(Math.random() * array.length)];
    }

    // Weighted selection based on property
    const totalWeight = array.reduce((sum, item) => sum + (item[weightProperty] || 1), 0);
    let random = Math.random() * totalWeight;

    for (let item of array) {
      random -= (item[weightProperty] || 1);
      if (random <= 0) {
        return item;
      }
    }

    // Fallback
    return array[0];
  }

  /**
   * Generate multiple profiles in batch
   */
  generateBatch(count = 10, options = {}) {
    const profiles = [];
    for (let i = 0; i < count; i++) {
      profiles.push(this.generateProfile(options));
    }
    return profiles;
  }

  /**
   * Clear used combinations cache (for new session)
   */
  clearCache() {
    this.usedCombinations.clear();
  }

  /**
   * Get generation statistics
   */
  getStats() {
    return {
      first_names_count: this.firstNames.length,
      last_names_count: this.lastNames.length,
      domains_count: this.domains.length,
      phone_patterns_count: this.phonePatterns.length,
      possible_combinations: this.firstNames.length * this.lastNames.length,
      used_combinations: this.usedCombinations.size
    };
  }
}

module.exports = ProfileGenerator;
