/**
 * Price Worker - Automatic Price Fetching
 *
 * Fetches cryptocurrency and stock prices automatically at regular intervals
 * and stores them in the database for historical tracking and analysis.
 */

const PricingSource = require('../sources/pricing-source');
const { Pool } = require('pg');

class PriceWorker {
  constructor(options = {}) {
    this.db = options.db || new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || process.env.USER,
      password: process.env.DB_PASSWORD || ''
    });

    // Pass db to PricingSource so it can use cache and fallback
    this.pricingSource = options.pricingSource || new PricingSource({ db: this.db });

    // Default assets to track (reduced to avoid rate limits)
    this.cryptoSymbols = options.cryptoSymbols || ['btc', 'eth', 'sol'];
    this.stockSymbols = options.stockSymbols || ['AAPL', 'GOOGL', 'TSLA', 'MSFT', 'AMZN'];

    // Fetch intervals (in milliseconds) - increased to avoid rate limits
    this.cryptoInterval = options.cryptoInterval || 180 * 1000; // 3 minutes (was 30s)
    this.stockInterval = options.stockInterval || 600 * 1000; // 10 minutes (was 60s)

    // Timers
    this.cryptoTimer = null;
    this.stockTimer = null;

    // Statistics
    this.stats = {
      cryptoFetches: 0,
      stockFetches: 0,
      errors: 0,
      lastCryptoFetch: null,
      lastStockFetch: null
    };

    this.running = false;
  }

  /**
   * Start the price worker
   */
  start() {
    if (this.running) {
      console.log('[PriceWorker] Already running');
      return;
    }

    console.log('[PriceWorker] Starting price worker...');
    console.log(`[PriceWorker] Tracking ${this.cryptoSymbols.length} cryptos: ${this.cryptoSymbols.join(', ')}`);
    console.log(`[PriceWorker] Tracking ${this.stockSymbols.length} stocks: ${this.stockSymbols.join(', ')}`);
    console.log(`[PriceWorker] Crypto interval: ${this.cryptoInterval / 1000}s, Stock interval: ${this.stockInterval / 1000}s`);

    this.running = true;

    // Fetch immediately on start
    this.fetchCryptoPrices();
    this.fetchStockPrices();

    // Schedule regular fetches
    this.cryptoTimer = setInterval(() => this.fetchCryptoPrices(), this.cryptoInterval);
    this.stockTimer = setInterval(() => this.fetchStockPrices(), this.stockInterval);
  }

  /**
   * Stop the price worker
   */
  stop() {
    if (!this.running) {
      console.log('[PriceWorker] Not running');
      return;
    }

    console.log('[PriceWorker] Stopping price worker...');
    this.running = false;

    if (this.cryptoTimer) {
      clearInterval(this.cryptoTimer);
      this.cryptoTimer = null;
    }

    if (this.stockTimer) {
      clearInterval(this.stockTimer);
      this.stockTimer = null;
    }

    console.log('[PriceWorker] Stopped');
  }

  /**
   * Fetch all cryptocurrency prices
   */
  async fetchCryptoPrices() {
    try {
      console.log(`[PriceWorker] Fetching ${this.cryptoSymbols.length} crypto prices...`);
      const startTime = Date.now();

      const promises = this.cryptoSymbols.map(async (symbol) => {
        try {
          const price = await this.pricingSource.getCryptoPrice(symbol);
          await this.savePriceToDatabase(price, 'crypto');
          return { symbol, success: true };
        } catch (error) {
          console.error(`[PriceWorker] Failed to fetch ${symbol}:`, error.message);
          return { symbol, success: false, error: error.message };
        }
      });

      const results = await Promise.all(promises);
      const successful = results.filter(r => r.success).length;
      const duration = Date.now() - startTime;

      this.stats.cryptoFetches++;
      this.stats.lastCryptoFetch = new Date();

      console.log(`[PriceWorker] Crypto fetch complete: ${successful}/${this.cryptoSymbols.length} successful (${duration}ms)`);
    } catch (error) {
      console.error('[PriceWorker] Error fetching crypto prices:', error);
      this.stats.errors++;
    }
  }

  /**
   * Fetch all stock prices
   */
  async fetchStockPrices() {
    try {
      console.log(`[PriceWorker] Fetching ${this.stockSymbols.length} stock prices...`);
      const startTime = Date.now();

      const promises = this.stockSymbols.map(async (symbol) => {
        try {
          const price = await this.pricingSource.getStockPrice(symbol);
          await this.savePriceToDatabase(price, 'stock');
          return { symbol, success: true };
        } catch (error) {
          console.error(`[PriceWorker] Failed to fetch ${symbol}:`, error.message);
          return { symbol, success: false, error: error.message };
        }
      });

      const results = await Promise.all(promises);
      const successful = results.filter(r => r.success).length;
      const duration = Date.now() - startTime;

      this.stats.stockFetches++;
      this.stats.lastStockFetch = new Date();

      console.log(`[PriceWorker] Stock fetch complete: ${successful}/${this.stockSymbols.length} successful (${duration}ms)`);
    } catch (error) {
      console.error('[PriceWorker] Error fetching stock prices:', error);
      this.stats.errors++;
    }
  }

  /**
   * Calculate 24h metrics from historical data
   * Used when APIs don't provide change/volume (e.g., stocks when markets closed)
   */
  async calculate24hMetrics(symbol, currentPrice) {
    try {
      // Get price from 24 hours ago
      const result = await this.db.query(`
        SELECT price, volume_24h
        FROM price_history
        WHERE symbol = $1
          AND recorded_at <= NOW() - INTERVAL '24 hours'
        ORDER BY recorded_at DESC
        LIMIT 1
      `, [symbol]);

      if (result.rows && result.rows.length > 0) {
        const pastPrice = parseFloat(result.rows[0].price);
        const change24h = ((currentPrice - pastPrice) / pastPrice) * 100;

        // Calculate rolling 24h volume (sum of all volumes in last 24h)
        const volumeResult = await this.db.query(`
          SELECT SUM(volume_24h) as total_volume
          FROM price_history
          WHERE symbol = $1
            AND recorded_at >= NOW() - INTERVAL '24 hours'
            AND volume_24h IS NOT NULL
        `, [symbol]);

        const volume24h = volumeResult.rows[0]?.total_volume || null;

        console.log(`[PriceWorker] Calculated 24h metrics for ${symbol}: ${change24h.toFixed(2)}% change`);

        return {
          change24h,
          volume24h: volume24h ? parseFloat(volume24h) : null
        };
      }

      // Not enough historical data
      return { change24h: null, volume24h: null };

    } catch (error) {
      console.error(`[PriceWorker] Failed to calculate 24h metrics for ${symbol}:`, error.message);
      return { change24h: null, volume24h: null };
    }
  }

  /**
   * Save price data to database
   */
  async savePriceToDatabase(priceData, assetType) {
    try {
      // Extract change and volume, with fallback logic
      let change24h = priceData.change24h || priceData.changePercent || null;
      let volume24h = priceData.volume24h || priceData.volume || null;

      // If change or volume is missing (nullish), calculate from historical data
      if (change24h == null || volume24h == null) {
        const calculated = await this.calculate24hMetrics(priceData.symbol, priceData.price);

        if (change24h == null && calculated.change24h != null) {
          change24h = calculated.change24h;
          console.log(`[PriceWorker] Using calculated change for ${priceData.symbol}: ${change24h.toFixed(2)}%`);
        }

        if (volume24h == null && calculated.volume24h != null) {
          volume24h = calculated.volume24h;
        }
      }

      const query = `
        INSERT INTO price_history (
          symbol,
          asset_type,
          price,
          change_24h,
          volume_24h,
          currency,
          source,
          recorded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `;

      const values = [
        priceData.symbol,
        assetType,
        priceData.price,
        change24h,
        volume24h,
        priceData.currency || 'USD',
        priceData.source
      ];

      await this.db.query(query, values);
    } catch (error) {
      console.error(`[PriceWorker] Failed to save ${priceData.symbol} to database:`, error.message);
      throw error;
    }
  }

  /**
   * Get worker statistics
   */
  getStats() {
    return {
      ...this.stats,
      running: this.running,
      cryptoSymbols: this.cryptoSymbols,
      stockSymbols: this.stockSymbols,
      cryptoInterval: this.cryptoInterval,
      stockInterval: this.stockInterval
    };
  }

  /**
   * Add a crypto symbol to track
   */
  addCrypto(symbol) {
    if (!this.cryptoSymbols.includes(symbol.toLowerCase())) {
      this.cryptoSymbols.push(symbol.toLowerCase());
      console.log(`[PriceWorker] Added crypto: ${symbol}`);
    }
  }

  /**
   * Add a stock symbol to track
   */
  addStock(symbol) {
    if (!this.stockSymbols.includes(symbol.toUpperCase())) {
      this.stockSymbols.push(symbol.toUpperCase());
      console.log(`[PriceWorker] Added stock: ${symbol}`);
    }
  }

  /**
   * Remove a crypto symbol
   */
  removeCrypto(symbol) {
    const index = this.cryptoSymbols.indexOf(symbol.toLowerCase());
    if (index > -1) {
      this.cryptoSymbols.splice(index, 1);
      console.log(`[PriceWorker] Removed crypto: ${symbol}`);
    }
  }

  /**
   * Remove a stock symbol
   */
  removeStock(symbol) {
    const index = this.stockSymbols.indexOf(symbol.toUpperCase());
    if (index > -1) {
      this.stockSymbols.splice(index, 1);
      console.log(`[PriceWorker] Removed stock: ${symbol}`);
    }
  }
}

module.exports = PriceWorker;
