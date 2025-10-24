/**
 * Unit Converter
 *
 * Converts between units: currency, temperature, distance, time, weight, volume, etc.
 * Supports real-time currency exchange rates (with caching).
 *
 * Examples:
 * - "100 USD to EUR"
 * - "5 feet to meters"
 * - "100F to C"
 * - "1 hour to seconds"
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class UnitConverter {
  constructor(options = {}) {
    this.cachePath = options.cachePath || path.join(process.env.HOME, '.calos/currency-cache.json');
    this.cacheExpiry = options.cacheExpiry || 3600000; // 1 hour default
    this.currencyCache = null;

    // Unit conversion tables
    this.conversions = {
      // Distance
      distance: {
        meters: 1,
        m: 1,
        kilometers: 0.001,
        km: 0.001,
        centimeters: 100,
        cm: 100,
        millimeters: 1000,
        mm: 1000,
        feet: 3.28084,
        ft: 3.28084,
        inches: 39.3701,
        in: 39.3701,
        yards: 1.09361,
        yd: 1.09361,
        miles: 0.000621371,
        mi: 0.000621371
      },

      // Temperature (special case - not linear)
      temperature: {
        celsius: 'C',
        c: 'C',
        fahrenheit: 'F',
        f: 'F',
        kelvin: 'K',
        k: 'K'
      },

      // Weight/Mass
      weight: {
        kilograms: 1,
        kg: 1,
        grams: 1000,
        g: 1000,
        milligrams: 1000000,
        mg: 1000000,
        pounds: 2.20462,
        lb: 2.20462,
        lbs: 2.20462,
        ounces: 35.274,
        oz: 35.274,
        tons: 0.001,
        t: 0.001
      },

      // Volume
      volume: {
        liters: 1,
        l: 1,
        milliliters: 1000,
        ml: 1000,
        gallons: 0.264172,
        gal: 0.264172,
        quarts: 1.05669,
        qt: 1.05669,
        pints: 2.11338,
        pt: 2.11338,
        cups: 4.22675,
        cup: 4.22675,
        fluid_ounces: 33.814,
        fl_oz: 33.814,
        tablespoons: 67.628,
        tbsp: 67.628,
        teaspoons: 202.884,
        tsp: 202.884
      },

      // Time
      time: {
        seconds: 1,
        s: 1,
        sec: 1,
        minutes: 1/60,
        min: 1/60,
        hours: 1/3600,
        h: 1/3600,
        hr: 1/3600,
        days: 1/86400,
        d: 1/86400,
        weeks: 1/604800,
        w: 1/604800,
        wk: 1/604800,
        months: 1/2592000,  // Approximate (30 days)
        years: 1/31536000,  // 365 days
        y: 1/31536000,
        yr: 1/31536000
      },

      // Data/Storage
      data: {
        bytes: 1,
        b: 1,
        kilobytes: 1/1024,
        kb: 1/1024,
        megabytes: 1/(1024*1024),
        mb: 1/(1024*1024),
        gigabytes: 1/(1024*1024*1024),
        gb: 1/(1024*1024*1024),
        terabytes: 1/(1024*1024*1024*1024),
        tb: 1/(1024*1024*1024*1024)
      },

      // Speed
      speed: {
        meters_per_second: 1,
        mps: 1,
        kilometers_per_hour: 3.6,
        kph: 3.6,
        mph: 2.23694,
        miles_per_hour: 2.23694,
        knots: 1.94384,
        kt: 1.94384
      }
    };

    // Common currency codes
    this.currencies = [
      'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'INR', 'BRL',
      'MXN', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'PLN', 'THB', 'IDR', 'HUF',
      'CZK', 'ILS', 'CLP', 'PHP', 'AED', 'COP', 'SAR', 'MYR', 'RON', 'TRY'
    ];
  }

  /**
   * Convert value from one unit to another
   * @param {number} value - Value to convert
   * @param {string} fromUnit - Source unit
   * @param {string} toUnit - Target unit
   * @returns {Promise<object>} Conversion result
   */
  async convert(value, fromUnit, toUnit) {
    const from = fromUnit.toLowerCase().trim();
    const to = toUnit.toLowerCase().trim();

    // Try each conversion category
    for (const [category, units] of Object.entries(this.conversions)) {
      if (units[from] && units[to]) {
        if (category === 'temperature') {
          return this.convertTemperature(value, from, to);
        } else {
          return this.convertLinear(value, from, to, units);
        }
      }
    }

    // Try currency conversion
    if (this.isCurrency(from) && this.isCurrency(to)) {
      return await this.convertCurrency(value, from, to);
    }

    throw new Error(`Unknown conversion: ${fromUnit} to ${toUnit}`);
  }

  /**
   * Convert linear units (distance, weight, etc.)
   */
  convertLinear(value, from, to, units) {
    // Convert to base unit, then to target unit
    const baseValue = value / units[from];
    const result = baseValue * units[to];

    return {
      value: result,
      unit: to,
      original: { value, unit: from },
      formatted: `${value} ${from} = ${this.formatNumber(result)} ${to}`
    };
  }

  /**
   * Convert temperature (non-linear)
   */
  convertTemperature(value, from, to) {
    const fromUnit = this.conversions.temperature[from];
    const toUnit = this.conversions.temperature[to];

    let celsius;

    // Convert to Celsius first
    switch (fromUnit) {
      case 'C':
        celsius = value;
        break;
      case 'F':
        celsius = (value - 32) * 5/9;
        break;
      case 'K':
        celsius = value - 273.15;
        break;
      default:
        throw new Error(`Unknown temperature unit: ${from}`);
    }

    // Convert from Celsius to target
    let result;
    switch (toUnit) {
      case 'C':
        result = celsius;
        break;
      case 'F':
        result = celsius * 9/5 + 32;
        break;
      case 'K':
        result = celsius + 273.15;
        break;
      default:
        throw new Error(`Unknown temperature unit: ${to}`);
    }

    return {
      value: result,
      unit: to.toUpperCase(),
      original: { value, unit: from.toUpperCase() },
      formatted: `${value}°${fromUnit} = ${this.formatNumber(result)}°${toUnit}`
    };
  }

  /**
   * Convert currency (requires exchange rates)
   */
  async convertCurrency(value, from, to) {
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();

    // Same currency
    if (fromCode === toCode) {
      return {
        value,
        unit: toCode,
        original: { value, unit: fromCode },
        formatted: `${value} ${fromCode} = ${value} ${toCode}`,
        rate: 1
      };
    }

    // Get exchange rate
    const rate = await this.getExchangeRate(fromCode, toCode);
    const result = value * rate;

    return {
      value: result,
      unit: toCode,
      original: { value, unit: fromCode },
      formatted: `${value} ${fromCode} = ${this.formatNumber(result)} ${toCode}`,
      rate,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get exchange rate (with caching)
   */
  async getExchangeRate(from, to) {
    // Load cache
    await this.loadCurrencyCache();

    // Check cache
    const cacheKey = `${from}_${to}`;
    const cached = this.currencyCache.rates[cacheKey];

    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      return cached.rate;
    }

    // Fetch fresh rate (using curl to avoid dependencies)
    try {
      const rate = await this.fetchExchangeRate(from, to);

      // Update cache
      this.currencyCache.rates[cacheKey] = {
        rate,
        timestamp: Date.now()
      };
      await this.saveCurrencyCache();

      return rate;

    } catch (error) {
      // If fetch fails but we have a cached rate, use it (even if expired)
      if (cached) {
        return cached.rate;
      }
      throw new Error(`Failed to get exchange rate: ${error.message}`);
    }
  }

  /**
   * Fetch exchange rate from API
   */
  async fetchExchangeRate(from, to) {
    // Using exchangerate-api.com (free tier, no auth required)
    const url = `https://api.exchangerate-api.com/v4/latest/${from}`;

    return new Promise((resolve, reject) => {
      const proc = spawn('curl', ['-s', url]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`curl failed: ${stderr}`));
          return;
        }

        try {
          const data = JSON.parse(stdout);
          const rate = data.rates[to];

          if (!rate) {
            reject(new Error(`No rate found for ${to}`));
            return;
          }

          resolve(rate);
        } catch (error) {
          reject(new Error(`Failed to parse exchange rate response: ${error.message}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Load currency cache
   */
  async loadCurrencyCache() {
    if (this.currencyCache) return;

    try {
      const data = await fs.readFile(this.cachePath, 'utf-8');
      this.currencyCache = JSON.parse(data);
    } catch (error) {
      // No cache file - initialize
      this.currencyCache = {
        rates: {},
        lastUpdate: Date.now()
      };
    }
  }

  /**
   * Save currency cache
   */
  async saveCurrencyCache() {
    const dir = path.dirname(this.cachePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.cachePath, JSON.stringify(this.currencyCache, null, 2), 'utf-8');
  }

  /**
   * Check if code is a currency
   */
  isCurrency(code) {
    return this.currencies.includes(code.toUpperCase());
  }

  /**
   * Format number for display
   */
  formatNumber(num) {
    if (Math.abs(num) < 0.01) {
      return num.toExponential(4);
    }
    if (Math.abs(num) > 1000000) {
      return num.toExponential(4);
    }
    return parseFloat(num.toFixed(6)).toString();
  }

  /**
   * Get supported categories
   */
  getSupportedCategories() {
    return Object.keys(this.conversions);
  }

  /**
   * Get units for category
   */
  getUnitsForCategory(category) {
    const units = this.conversions[category];
    if (!units) {
      return [];
    }
    return Object.keys(units);
  }

  /**
   * Get all supported units
   */
  getAllUnits() {
    const allUnits = [];
    for (const units of Object.values(this.conversions)) {
      allUnits.push(...Object.keys(units));
    }
    allUnits.push(...this.currencies.map(c => c.toLowerCase()));
    return [...new Set(allUnits)];  // Deduplicate
  }
}

module.exports = UnitConverter;
