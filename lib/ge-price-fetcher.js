/**
 * Grand Exchange Price Fetcher
 *
 * Manages real-time Grand Exchange prices with smart caching,
 * update tracking, and price alert system.
 *
 * What It Does:
 * - Fetch all GE prices in bulk (efficient API usage)
 * - Cache prices with automatic refresh
 * - Track price changes over time
 * - Alert on significant price movements
 * - Store historical data in database
 *
 * Use Cases:
 * - Stream overlay: Show item prices on screen
 * - Price alerts: "Twisted bow dropped 50M!"
 * - Flip tracking: Monitor profitable flips
 * - Historical analysis: Price trends over time
 * - Auto-research: New loot → instant price lookup
 *
 * Integrates with:
 * - OSRSWikiClient (lib/osrs-wiki-client.js) - API wrapper
 * - RuneLiteIntegration (lib/runelite-integration.js) - Loot events
 * - AIResearchAssistant (lib/ai-research-assistant.js) - Price context
 *
 * Usage:
 *   const fetcher = new GEPriceFetcher({
 *     wikiClient,
 *     db,
 *     updateInterval: 60000 // 1 minute
 *   });
 *
 *   await fetcher.start();
 *
 *   // Get current price
 *   const price = fetcher.getPrice(20997); // Twisted bow
 *   // → { itemId: 20997, high: 2100000000, low: 2050000000, ... }
 *
 *   // Price alert
 *   fetcher.on('price_alert', (alert) => {
 *     console.log(`${alert.itemName}: ${alert.changePercent}% change!`);
 *   });
 */

const { EventEmitter } = require('events');

class GEPriceFetcher extends EventEmitter {
  constructor(options = {}) {
    super();

    this.wikiClient = options.wikiClient;
    this.db = options.db;

    if (!this.wikiClient) {
      throw new Error('[GEPriceFetcher] OSRSWikiClient required');
    }

    // Update settings
    this.updateInterval = options.updateInterval || 60000; // 1 minute default
    this.autoUpdate = options.autoUpdate !== false;
    this.updateTimer = null;

    // Price storage
    this.prices = new Map(); // itemId → current price data
    this.previousPrices = new Map(); // itemId → previous price (for change detection)
    this.mapping = []; // Item ID → name mapping

    // Price alert settings
    this.alerts = {
      enabled: options.alerts !== false,
      minChangePercent: options.minChangePercent || 5, // 5% min change to alert
      watchList: new Set(options.watchList || []) // Specific items to watch
    };

    // Stats
    this.stats = {
      lastUpdate: null,
      updateCount: 0,
      totalItems: 0,
      alertsSent: 0,
      errors: 0
    };

    // Running state
    this.running = false;

    console.log('[GEPriceFetcher] Initialized (update interval: ' + this.updateInterval + 'ms)');
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  /**
   * Start fetching prices
   */
  async start() {
    if (this.running) {
      console.log('[GEPriceFetcher] Already running');
      return;
    }

    console.log('[GEPriceFetcher] Starting...');

    this.running = true;

    // Initial fetch
    await this.updatePrices();

    // Load mapping
    await this.updateMapping();

    // Start auto-update if enabled
    if (this.autoUpdate) {
      this.updateTimer = setInterval(() => {
        this.updatePrices();
      }, this.updateInterval);
    }

    this.emit('started', {
      itemCount: this.prices.size,
      timestamp: Date.now()
    });

    console.log('[GEPriceFetcher] Started successfully');
  }

  /**
   * Stop fetching prices
   */
  stop() {
    if (!this.running) {
      return;
    }

    console.log('[GEPriceFetcher] Stopping...');

    this.running = false;

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    this.emit('stopped', {
      updateCount: this.stats.updateCount,
      timestamp: Date.now()
    });

    console.log('[GEPriceFetcher] Stopped');
  }

  // ============================================================================
  // Price Updates
  // ============================================================================

  /**
   * Update all prices from API
   */
  async updatePrices() {
    console.log('[GEPriceFetcher] Updating prices...');

    try {
      // Store previous prices for change detection
      this.previousPrices = new Map(this.prices);

      // Fetch all latest prices (bulk request)
      const allPrices = await this.wikiClient.getAllLatestPrices();

      if (!allPrices || Object.keys(allPrices).length === 0) {
        throw new Error('No prices returned from API');
      }

      // Update price map
      this.prices.clear();
      for (const [itemId, priceData] of Object.entries(allPrices)) {
        this.prices.set(parseInt(itemId), priceData);
      }

      // Update stats
      this.stats.lastUpdate = Date.now();
      this.stats.updateCount++;
      this.stats.totalItems = this.prices.size;

      // Detect significant price changes
      if (this.alerts.enabled && this.previousPrices.size > 0) {
        await this._detectPriceAlerts();
      }

      // Store in database if available
      if (this.db) {
        await this._storePricesInDB();
      }

      this.emit('prices_updated', {
        itemCount: this.prices.size,
        timestamp: Date.now()
      });

      console.log(`[GEPriceFetcher] Updated ${this.prices.size} item prices`);

    } catch (error) {
      this.stats.errors++;
      console.error('[GEPriceFetcher] Update error:', error.message);

      this.emit('update_error', {
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Update item mapping
   */
  async updateMapping() {
    console.log('[GEPriceFetcher] Updating item mapping...');

    try {
      this.mapping = await this.wikiClient.getItemMapping();
      console.log(`[GEPriceFetcher] Loaded ${this.mapping.length} item mappings`);
    } catch (error) {
      console.error('[GEPriceFetcher] Mapping error:', error.message);
    }
  }

  // ============================================================================
  // Price Queries
  // ============================================================================

  /**
   * Get price for an item
   */
  getPrice(itemId) {
    const price = this.prices.get(itemId);
    if (!price) {
      return null;
    }

    const item = this.mapping.find(i => i.id === itemId);

    return {
      ...price,
      itemName: item ? item.name : `Unknown (${itemId})`,
      examine: item ? item.examine : null,
      members: item ? item.members : null
    };
  }

  /**
   * Get price by item name (fuzzy match)
   */
  getPriceByName(itemName) {
    const lowerName = itemName.toLowerCase();
    const item = this.mapping.find(i =>
      i.name.toLowerCase().includes(lowerName)
    );

    if (!item) {
      return null;
    }

    return this.getPrice(item.id);
  }

  /**
   * Get all prices
   */
  getAllPrices() {
    const all = [];

    for (const [itemId, price] of this.prices.entries()) {
      const item = this.mapping.find(i => i.id === itemId);

      all.push({
        ...price,
        itemName: item ? item.name : `Unknown (${itemId})`
      });
    }

    return all;
  }

  /**
   * Get top movers (biggest price changes)
   */
  getTopMovers(limit = 10) {
    if (this.previousPrices.size === 0) {
      return [];
    }

    const movers = [];

    for (const [itemId, currentPrice] of this.prices.entries()) {
      const previousPrice = this.previousPrices.get(itemId);

      if (!previousPrice || !previousPrice.high || !currentPrice.high) {
        continue;
      }

      const change = currentPrice.high - previousPrice.high;
      const changePercent = (change / previousPrice.high) * 100;

      if (Math.abs(changePercent) < 1) {
        continue; // Ignore < 1% changes
      }

      const item = this.mapping.find(i => i.id === itemId);

      movers.push({
        itemId,
        itemName: item ? item.name : `Unknown (${itemId})`,
        currentPrice: currentPrice.high,
        previousPrice: previousPrice.high,
        change,
        changePercent: parseFloat(changePercent.toFixed(2))
      });
    }

    // Sort by absolute change percent
    movers.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

    return movers.slice(0, limit);
  }

  /**
   * Search items by name
   */
  searchItems(query, limit = 10) {
    const lowerQuery = query.toLowerCase();
    const results = [];

    for (const item of this.mapping) {
      if (item.name.toLowerCase().includes(lowerQuery)) {
        const price = this.getPrice(item.id);
        results.push({
          ...item,
          price: price ? price.high : null
        });

        if (results.length >= limit) {
          break;
        }
      }
    }

    return results;
  }

  // ============================================================================
  // Price Alerts
  // ============================================================================

  /**
   * Detect significant price changes and send alerts
   */
  async _detectPriceAlerts() {
    const alerts = [];

    for (const [itemId, currentPrice] of this.prices.entries()) {
      const previousPrice = this.previousPrices.get(itemId);

      if (!previousPrice || !previousPrice.high || !currentPrice.high) {
        continue;
      }

      // Calculate change
      const change = currentPrice.high - previousPrice.high;
      const changePercent = (change / previousPrice.high) * 100;

      // Check if meets alert threshold
      const meetsThreshold = Math.abs(changePercent) >= this.alerts.minChangePercent;
      const inWatchList = this.alerts.watchList.size === 0 || this.alerts.watchList.has(itemId);

      if (meetsThreshold && inWatchList) {
        const item = this.mapping.find(i => i.id === itemId);

        const alert = {
          itemId,
          itemName: item ? item.name : `Unknown (${itemId})`,
          currentPrice: currentPrice.high,
          previousPrice: previousPrice.high,
          change,
          changePercent: parseFloat(changePercent.toFixed(2)),
          direction: change > 0 ? 'up' : 'down',
          timestamp: Date.now()
        };

        alerts.push(alert);

        this.emit('price_alert', alert);
        this.stats.alertsSent++;

        console.log(`[GEPriceFetcher] Alert: ${alert.itemName} ${alert.direction} ${Math.abs(alert.changePercent)}%`);
      }
    }

    if (alerts.length > 0) {
      this.emit('batch_alerts', alerts);
    }
  }

  /**
   * Add item to watch list
   */
  addToWatchList(itemId) {
    this.alerts.watchList.add(itemId);
    console.log(`[GEPriceFetcher] Added item ${itemId} to watch list`);
  }

  /**
   * Remove item from watch list
   */
  removeFromWatchList(itemId) {
    this.alerts.watchList.delete(itemId);
    console.log(`[GEPriceFetcher] Removed item ${itemId} from watch list`);
  }

  /**
   * Clear watch list
   */
  clearWatchList() {
    this.alerts.watchList.clear();
    console.log('[GEPriceFetcher] Cleared watch list');
  }

  // ============================================================================
  // Database Storage
  // ============================================================================

  /**
   * Store current prices in database
   */
  async _storePricesInDB() {
    if (!this.db) return;

    try {
      const timestamp = new Date();
      const values = [];

      // Only store a sample (not all ~3700 items every minute)
      // Store top 100 most traded items or watchlist items
      const itemsToStore = Array.from(this.alerts.watchList);

      for (const itemId of itemsToStore) {
        const price = this.prices.get(itemId);
        if (!price) continue;

        const item = this.mapping.find(i => i.id === itemId);

        values.push([
          itemId,
          item ? item.name : null,
          price.high,
          price.low,
          null, // volume (not provided by API)
          timestamp
        ]);
      }

      if (values.length === 0) return;

      // Batch insert
      const query = `
        INSERT INTO ge_prices (item_id, item_name, high_price, low_price, volume, timestamp)
        VALUES ${values.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ')}
      `;

      const flatValues = values.flat();

      await this.db.query(query, flatValues);

    } catch (error) {
      console.error('[GEPriceFetcher] DB storage error:', error.message);
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get fetcher statistics
   */
  getStats() {
    return {
      ...this.stats,
      running: this.running,
      itemCount: this.prices.size,
      watchListSize: this.alerts.watchList.size
    };
  }

  /**
   * Format price for display
   */
  formatPrice(price) {
    if (price >= 1000000000) {
      return (price / 1000000000).toFixed(2) + 'B';
    } else if (price >= 1000000) {
      return (price / 1000000).toFixed(1) + 'M';
    } else if (price >= 1000) {
      return (price / 1000).toFixed(1) + 'K';
    } else {
      return price.toString();
    }
  }

  /**
   * Get item info with price
   */
  async getItemInfo(itemId) {
    const price = this.getPrice(itemId);
    if (!price) {
      return null;
    }

    // Try to get full item data from wiki
    const item = this.mapping.find(i => i.id === itemId);
    if (!item) {
      return price;
    }

    // Get full wiki data if available
    try {
      const wikiData = await this.wikiClient.getItem(item.name);

      return {
        ...price,
        ...wikiData,
        formattedPrice: {
          high: this.formatPrice(price.high),
          low: this.formatPrice(price.low)
        }
      };

    } catch (error) {
      return price;
    }
  }
}

module.exports = GEPriceFetcher;
