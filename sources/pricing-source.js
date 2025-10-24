/**
 * Pricing Data Source
 *
 * Fetch cryptocurrency and stock prices from external APIs
 * - CoinGecko API for crypto prices (BTC, ETH, etc.) - Free, no API key
 * - Yahoo Finance for stock prices - Free
 * - Alpha Vantage for stocks - Free tier (optional)
 *
 * Features:
 * - Database caching (avoid hitting rate limits)
 * - Automatic retry with exponential backoff
 * - Multiple data source fallbacks
 */

const axios = require('axios');
const crypto = require('crypto');
const jsonPath = require('../lib/json-path');
const PriceVerifier = require('../lib/price-verifier');

class PricingSource {
  constructor(options = {}) {
    this.db = options.db || null;
    this.cacheDuration = options.cacheDuration || 300000; // 5 minutes default (increased from 1min)
    this.alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY || null;

    // API endpoints
    this.apis = {
      coingecko: 'https://api.coingecko.com/api/v3',
      yahooFinance: 'https://query1.finance.yahoo.com/v8/finance/chart',
      alphaVantage: 'https://www.alphavantage.co/query'
    };

    // Rate limiting tracking
    this.requestCounts = {}; // Track requests per minute per source
    this.rateLimitBackoff = {}; // Track backoff state for each source
    this.maxRequestsPerMinute = 10; // Conservative limit for free tier

    // Price verification
    this.verifier = new PriceVerifier({ db: this.db });
  }

  /**
   * Fetch cryptocurrency price (BTC, ETH, etc.)
   */
  async getCryptoPrice(symbol, currency = 'usd') {
    symbol = symbol.toLowerCase();
    const cacheKey = `crypto_${symbol}_${currency}`;

    // Check cache first
    const cached = await this._getFromCache(cacheKey);
    if (cached) {
      console.log(`[PricingSource] Cache hit for ${cacheKey} (age: ${Math.round((Date.now() - new Date(cached.lastUpdate)) / 1000)}s)`);
      return cached;
    }

    // Check if we're in backoff period
    if (await this._isInBackoff('coingecko')) {
      console.warn(`[PricingSource] CoinGecko in backoff, using fallback for ${symbol}`);
      return await this._getFallbackPrice(symbol, 'crypto');
    }

    // Check rate limit
    if (await this._isRateLimited('coingecko')) {
      console.warn(`[PricingSource] CoinGecko rate limit reached, using fallback for ${symbol}`);
      return await this._getFallbackPrice(symbol, 'crypto');
    }

    try {
      // Track request
      await this._trackRequest('coingecko');

      // CoinGecko API (free, no key required)
      const response = await axios.get(
        `${this.apis.coingecko}/simple/price`,
        {
          params: {
            ids: this._getCoinGeckoId(symbol),
            vs_currencies: currency,
            include_24hr_change: true,
            include_24hr_vol: true,
            include_last_updated_at: true
          },
          timeout: 5000
        }
      );

      const coinId = this._getCoinGeckoId(symbol);
      const data = response.data[coinId];

      if (!data) {
        throw new Error(`Price data not available for ${symbol}`);
      }

      const priceData = {
        symbol: symbol.toUpperCase(),
        price: data[currency],
        change24h: data[`${currency}_24h_change`] || null,
        volume24h: data[`${currency}_24h_vol`] || null,
        // Use API timestamp (source_timestamp) not system time
        lastUpdate: data.last_updated_at ? new Date(data.last_updated_at * 1000) : new Date(),
        source_timestamp: data.last_updated_at ? new Date(data.last_updated_at * 1000) : new Date(),
        ingested_at: new Date(), // When WE received it (may have clock skew)
        currency: currency.toUpperCase(),
        source: 'coingecko'
      };

      // Verify price data quality
      const verification = await this.verifier.verify(priceData);
      if (!verification.verified || verification.confidence < 70) {
        console.warn(`[PricingSource] ${verification.recommendation} for ${symbol}:`, {
          price: priceData.price,
          confidence: verification.confidence,
          issues: verification.issues
        });
        await this._logSuspiciousPrice(symbol, priceData, verification);
      }

      // Add verification metadata to returned data
      priceData.verification = {
        verified: verification.verified,
        confidence: verification.confidence
      };

      // Reset backoff on success
      this.rateLimitBackoff['coingecko'] = null;

      // Cache the result
      await this._saveToCache(cacheKey, priceData);

      return priceData;

    } catch (error) {
      // Handle 429 rate limit error
      if (error.response && error.response.status === 429) {
        console.error(`[PricingSource] Rate limited by CoinGecko for ${symbol}`);
        await this._setBackoff('coingecko');
        return await this._getFallbackPrice(symbol, 'crypto');
      }

      console.error(`Failed to fetch ${symbol} price:`, error.message);

      // Try fallback before throwing error
      const fallback = await this._getFallbackPrice(symbol, 'crypto');
      if (fallback) {
        return fallback;
      }

      throw new Error(`Unable to fetch ${symbol} price: ${error.message}`);
    }
  }

  /**
   * Fetch stock price
   */
  async getStockPrice(symbol) {
    symbol = symbol.toUpperCase();
    const cacheKey = `stock_${symbol}_usd`;

    // Check cache first
    const cached = await this._getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Try Yahoo Finance first (free, no key required)
      const response = await axios.get(
        `${this.apis.yahooFinance}/${symbol}`,
        {
          params: {
            range: '1d',
            interval: '1m',
            includePrePost: false
          },
          timeout: 5000
        }
      );

      const result = response.data.chart.result[0];
      const quote = result.meta;
      const lastClose = result.indicators.quote[0].close;
      const currentPrice = lastClose[lastClose.length - 1];

      if (!currentPrice) {
        throw new Error(`No price data available for ${symbol}`);
      }

      const priceData = {
        symbol: symbol,
        price: currentPrice,
        change: quote.regularMarketPrice - quote.previousClose,
        changePercent: ((quote.regularMarketPrice - quote.previousClose) / quote.previousClose) * 100,
        volume: quote.regularMarketVolume,
        // Use API timestamp (source_timestamp) not system time
        lastUpdate: new Date(quote.regularMarketTime * 1000),
        source_timestamp: new Date(quote.regularMarketTime * 1000),
        ingested_at: new Date(), // When WE received it
        currency: quote.currency || 'USD',
        source: 'yahoo_finance'
      };

      // Verify price data quality
      const verification = await this.verifier.verify(priceData);
      if (!verification.verified || verification.confidence < 70) {
        console.warn(`[PricingSource] ${verification.recommendation} for ${symbol}:`, {
          price: priceData.price,
          confidence: verification.confidence,
          issues: verification.issues
        });
        await this._logSuspiciousPrice(symbol, priceData, verification);
      }

      // Add verification metadata
      priceData.verification = {
        verified: verification.verified,
        confidence: verification.confidence
      };

      // Cache the result
      await this._saveToCache(cacheKey, priceData);

      return priceData;

    } catch (error) {
      // Fallback to Alpha Vantage if available
      if (this.alphaVantageKey) {
        return await this._getStockPriceAlphaVantage(symbol);
      }

      console.error(`Failed to fetch ${symbol} stock price:`, error.message);
      throw new Error(`Unable to fetch ${symbol} stock price: ${error.message}`);
    }
  }

  /**
   * Fetch commodity price (Gold, Silver)
   */
  async getCommodityPrice(symbol, currency = 'usd') {
    symbol = symbol.toUpperCase();
    const cacheKey = `commodity_${symbol}_${currency}`;

    // Check cache first
    const cached = await this._getFromCache(cacheKey);
    if (cached) {
      console.log(`[PricingSource] Cache hit for ${cacheKey} (age: ${Math.round((Date.now() - new Date(cached.lastUpdate)) / 1000)}s)`);
      return cached;
    }

    // Check if we're in backoff period
    if (await this._isInBackoff('coingecko')) {
      console.warn(`[PricingSource] CoinGecko in backoff, using fallback for ${symbol}`);
      return await this._getFallbackPrice(symbol, 'commodity');
    }

    // Check rate limit
    if (await this._isRateLimited('coingecko')) {
      console.warn(`[PricingSource] CoinGecko rate limit reached, using fallback for ${symbol}`);
      return await this._getFallbackPrice(symbol, 'commodity');
    }

    try {
      // Track request
      await this._trackRequest('coingecko');

      // Map symbols to CoinGecko commodity IDs
      const commodityIdMap = {
        'AU': 'gold',
        'GOLD': 'gold',
        'AG': 'silver',
        'SILVER': 'silver',
        'PT': 'platinum',
        'PLATINUM': 'platinum',
        'PD': 'palladium',
        'PALLADIUM': 'palladium'
      };

      const commodityId = commodityIdMap[symbol];
      if (!commodityId) {
        throw new Error(`Unknown commodity symbol: ${symbol}`);
      }

      // CoinGecko API (commodities priced as crypto-like assets)
      const response = await axios.get(
        `${this.apis.coingecko}/simple/price`,
        {
          params: {
            ids: commodityId,
            vs_currencies: currency,
            include_24hr_change: true,
            include_24hr_vol: true,
            include_last_updated_at: true
          },
          timeout: 5000
        }
      );

      const data = response.data[commodityId];

      if (!data) {
        throw new Error(`Price data not available for ${symbol}`);
      }

      const priceData = {
        symbol: symbol,
        price: data[currency],
        change24h: data[`${currency}_24h_change`] || null,
        volume24h: data[`${currency}_24h_vol`] || null,
        // Use API timestamp (source_timestamp) not system time
        lastUpdate: data.last_updated_at ? new Date(data.last_updated_at * 1000) : new Date(),
        source_timestamp: data.last_updated_at ? new Date(data.last_updated_at * 1000) : new Date(),
        ingested_at: new Date(), // When WE received it
        currency: currency.toUpperCase(),
        source: 'coingecko',
        assetType: 'commodity'
      };

      // Verify price data quality
      const verification = await this.verifier.verify(priceData);
      if (!verification.verified || verification.confidence < 70) {
        console.warn(`[PricingSource] ${verification.recommendation} for ${symbol}:`, {
          price: priceData.price,
          confidence: verification.confidence,
          issues: verification.issues
        });
        await this._logSuspiciousPrice(symbol, priceData, verification);
      }

      // Add verification metadata
      priceData.verification = {
        verified: verification.verified,
        confidence: verification.confidence
      };

      // Reset backoff on success
      this.rateLimitBackoff['coingecko'] = null;

      // Cache the result
      await this._saveToCache(cacheKey, priceData);

      return priceData;

    } catch (error) {
      // Handle 429 rate limit error
      if (error.response && error.response.status === 429) {
        console.error(`[PricingSource] Rate limited by CoinGecko for ${symbol}`);
        await this._setBackoff('coingecko');
        return await this._getFallbackPrice(symbol, 'commodity');
      }

      console.error(`Failed to fetch ${symbol} commodity price:`, error.message);

      // Try fallback before throwing error
      const fallback = await this._getFallbackPrice(symbol, 'commodity');
      if (fallback) {
        return fallback;
      }

      throw new Error(`Unable to fetch ${symbol} commodity price: ${error.message}`);
    }
  }

  /**
   * Fetch stock price from Alpha Vantage (fallback)
   */
  async _getStockPriceAlphaVantage(symbol) {
    const cacheKey = `stock_${symbol}_usd`;

    try {
      const response = await axios.get(this.apis.alphaVantage, {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: symbol,
          apikey: this.alphaVantageKey
        },
        timeout: 5000
      });

      // Use jsonPath.extract for robust nested JSON handling
      const extracted = jsonPath.extract(response.data, {
        price: '["Global Quote"]["05. price"]',
        change: '["Global Quote"]["09. change"]',
        changePercent: '["Global Quote"]["10. change percent"]',
        volume: '["Global Quote"]["06. volume"]',
        lastTradingDay: '["Global Quote"]["07. latest trading day"]'
      });

      if (!extracted.price) {
        throw new Error(`No price data available for ${symbol}`);
      }

      const priceData = {
        symbol: symbol,
        price: parseFloat(extracted.price),
        change: parseFloat(extracted.change || 0),
        changePercent: parseFloat((extracted.changePercent || '0').replace('%', '')),
        volume: parseFloat(extracted.volume || 0),
        lastUpdate: extracted.lastTradingDay ? new Date(extracted.lastTradingDay) : new Date(),
        currency: 'USD',
        source: 'alpha_vantage'
      };

      await this._saveToCache(cacheKey, priceData);
      return priceData;

    } catch (error) {
      console.error(`Alpha Vantage fetch failed for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch multiple crypto prices at once
   */
  async getMultipleCryptoPrices(symbols, currency = 'usd') {
    const promises = symbols.map(symbol =>
      this.getCryptoPrice(symbol, currency)
        .catch(err => ({ symbol: symbol.toUpperCase(), error: err.message }))
    );

    return await Promise.all(promises);
  }

  /**
   * Fetch multiple stock prices at once
   */
  async getMultipleStockPrices(symbols) {
    const promises = symbols.map(symbol =>
      this.getStockPrice(symbol)
        .catch(err => ({ symbol, error: err.message }))
    );

    return await Promise.all(promises);
  }

  /**
   * Get from cache (database)
   */
  async _getFromCache(cacheKey) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        SELECT data, cached_at
        FROM price_cache
        WHERE cache_key = $1
          AND cached_at > NOW() - INTERVAL '${this.cacheDuration / 1000} seconds'
        ORDER BY cached_at DESC
        LIMIT 1
      `, [cacheKey]);

      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        console.log(`📦 Cache hit for ${cacheKey} (age: ${Math.round((Date.now() - new Date(row.cached_at)) / 1000)}s)`);
        return row.data;
      }

      return null;

    } catch (error) {
      // Cache table might not exist yet - that's okay
      if (error.message.includes('does not exist')) {
        console.log('ℹ️  Price cache table not yet created (run migration 002)');
      }
      return null;
    }
  }

  /**
   * Save to cache (database)
   */
  async _saveToCache(cacheKey, data) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO price_cache (cache_key, data, cached_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (cache_key)
        DO UPDATE SET
          data = EXCLUDED.data,
          cached_at = EXCLUDED.cached_at
      `, [cacheKey, JSON.stringify(data)]);

      console.log(`💾 Cached ${cacheKey}`);

    } catch (error) {
      // Don't fail if caching fails
      if (!error.message.includes('does not exist')) {
        console.error('Cache save error:', error.message);
      }
    }
  }

  /**
   * Map common crypto symbols to CoinGecko IDs
   */
  _getCoinGeckoId(symbol) {
    const mapping = {
      'btc': 'bitcoin',
      'bitcoin': 'bitcoin',
      'eth': 'ethereum',
      'ethereum': 'ethereum',
      'usdt': 'tether',
      'tether': 'tether',
      'bnb': 'binancecoin',
      'sol': 'solana',
      'solana': 'solana',
      'usdc': 'usd-coin',
      'xrp': 'ripple',
      'ripple': 'ripple',
      'ada': 'cardano',
      'cardano': 'cardano',
      'doge': 'dogecoin',
      'dogecoin': 'dogecoin',
      'avax': 'avalanche-2',
      'dot': 'polkadot',
      'matic': 'matic-network',
      'link': 'chainlink',
      'uni': 'uniswap',
      'ltc': 'litecoin'
    };

    return mapping[symbol.toLowerCase()] || symbol.toLowerCase();
  }

  /**
   * Track API request for rate limiting
   * @private
   */
  async _trackRequest(source) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);

    if (!this.requestCounts[source]) {
      this.requestCounts[source] = {};
    }

    if (!this.requestCounts[source][minute]) {
      this.requestCounts[source][minute] = 0;
    }

    this.requestCounts[source][minute]++;

    // Clean up old minute counts
    Object.keys(this.requestCounts[source]).forEach(m => {
      if (parseInt(m) < minute - 5) {
        delete this.requestCounts[source][m];
      }
    });
  }

  /**
   * Check if rate limited
   * @private
   */
  async _isRateLimited(source) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);

    if (!this.requestCounts[source] || !this.requestCounts[source][minute]) {
      return false;
    }

    return this.requestCounts[source][minute] >= this.maxRequestsPerMinute;
  }

  /**
   * Set exponential backoff for a source
   * @private
   */
  async _setBackoff(source) {
    const currentBackoff = this.rateLimitBackoff[source];

    if (!currentBackoff) {
      // First backoff: 1 minute
      this.rateLimitBackoff[source] = {
        until: Date.now() + 60000,
        duration: 60000
      };
      console.warn(`[PricingSource] Setting 1min backoff for ${source}`);
    } else {
      // Exponential backoff: double the duration, max 15 minutes
      const newDuration = Math.min(currentBackoff.duration * 2, 900000);
      this.rateLimitBackoff[source] = {
        until: Date.now() + newDuration,
        duration: newDuration
      };
      console.warn(`[PricingSource] Setting ${newDuration / 60000}min backoff for ${source}`);
    }
  }

  /**
   * Check if source is in backoff period
   * @private
   */
  async _isInBackoff(source) {
    const backoff = this.rateLimitBackoff[source];
    if (!backoff) return false;

    if (Date.now() < backoff.until) {
      return true;
    }

    // Backoff period expired
    this.rateLimitBackoff[source] = null;
    return false;
  }

  /**
   * Get fallback price from price_history table
   * @private
   */
  async _getFallbackPrice(symbol, assetType) {
    if (!this.db) {
      return null;
    }

    try {
      const result = await this.db.query(`
        SELECT symbol, price, change_24h, volume_24h, currency, source, recorded_at
        FROM price_history
        WHERE symbol = $1 AND asset_type = $2
        ORDER BY recorded_at DESC
        LIMIT 1
      `, [symbol.toUpperCase(), assetType]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      console.log(`[PricingSource] Using fallback price for ${symbol} from ${row.recorded_at}`);

      return {
        symbol: row.symbol,
        price: parseFloat(row.price),
        change24h: row.change_24h ? parseFloat(row.change_24h) : null,
        volume24h: row.volume_24h ? parseFloat(row.volume_24h) : null,
        currency: row.currency || 'USD',
        source: `${row.source}_fallback`,
        lastUpdate: row.recorded_at
      };
    } catch (error) {
      console.error(`[PricingSource] Failed to get fallback price for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Log suspicious price data for audit
   * @private
   */
  async _logSuspiciousPrice(symbol, priceData, verification) {
    if (!this.db) {
      return;
    }

    try {
      await this.db.query(`
        INSERT INTO price_audit_log (
          symbol,
          price,
          source,
          confidence_score,
          verification_status,
          issues,
          raw_data,
          logged_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      `, [
        symbol,
        priceData.price,
        priceData.source,
        verification.confidence,
        verification.verified ? 'verified' : 'rejected',
        JSON.stringify(verification.issues),
        JSON.stringify(priceData)
      ]);

      console.log(`[PricingSource] Logged suspicious price for ${symbol} to audit table`);
    } catch (error) {
      // Don't fail if audit logging fails - table might not exist yet
      if (!error.message.includes('does not exist')) {
        console.error(`[PricingSource] Failed to log suspicious price:`, error.message);
      }
    }
  }
}

module.exports = PricingSource;
