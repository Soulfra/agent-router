/**
 * Cryptocurrency Prices Widget
 *
 * Displays real-time crypto prices for BTC, ETH, and other major cryptocurrencies
 * Updates automatically every 30 seconds
 */

class CryptoPricesWidget {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.updateInterval = null;
    this.fetchInterval = null;
    this.baseUrl = window.location.origin;

    // Cryptos to track
    this.cryptos = ['btc', 'eth', 'sol', 'bnb', 'ada'];

    // Price data
    this.prices = {};
  }

  async init() {
    if (!this.container) {
      console.error('Crypto prices widget container not found');
      return;
    }

    this.render();
    await this.fetchPrices();
    this.startUpdating();
  }

  render() {
    this.container.innerHTML = `
      <div class="crypto-prices-widget">
        <div class="widget-header">
          <h3>💰 Crypto Prices</h3>
          <span class="last-update" id="crypto-last-update">Loading...</span>
        </div>
        <div class="prices-list" id="crypto-prices-list">
          <div class="loading">Loading prices...</div>
        </div>
      </div>
    `;
  }

  async fetchPrices() {
    try {
      // Fetch prices for all tracked cryptos
      const promises = this.cryptos.map(symbol =>
        fetch(`${this.baseUrl}/api/price/crypto/${symbol}`)
          .then(res => res.json())
          .then(data => ({ symbol, data }))
          .catch(err => ({ symbol, error: err.message }))
      );

      const results = await Promise.all(promises);

      // Update prices object
      results.forEach(result => {
        if (result.data && result.data.status === 'ok') {
          this.prices[result.symbol] = result.data;
        } else {
          console.error(`Failed to fetch ${result.symbol}:`, result.error || 'Unknown error');
        }
      });

      this.updateDisplay();

    } catch (error) {
      console.error('Failed to fetch crypto prices:', error);
      document.getElementById('crypto-prices-list').innerHTML = `
        <div class="error">Failed to load prices</div>
      `;
    }
  }

  updateDisplay() {
    const listEl = document.getElementById('crypto-prices-list');
    if (!listEl) return;

    const html = Object.keys(this.prices).map(symbol => {
      const price = this.prices[symbol];
      const change = price.change24h || 0;
      const changeClass = change >= 0 ? 'positive' : 'negative';
      const changeSymbol = change >= 0 ? '↑' : '↓';

      return `
        <div class="price-item">
          <div class="price-symbol">${price.symbol}</div>
          <div class="price-value">$${this.formatPrice(price.price)}</div>
          <div class="price-change ${changeClass}">
            ${changeSymbol} ${Math.abs(change).toFixed(2)}%
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = html || '<div class="no-data">No price data available</div>';

    // Update last update time
    const lastUpdateEl = document.getElementById('crypto-last-update');
    if (lastUpdateEl) {
      const now = new Date();
      lastUpdateEl.textContent = `Updated ${now.toLocaleTimeString()}`;
    }
  }

  formatPrice(price) {
    if (price >= 1000) {
      return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    } else if (price >= 1) {
      return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
      return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    }
  }

  startUpdating() {
    // Update display every 5 seconds (without fetching)
    this.updateInterval = setInterval(() => {
      this.updateDisplay();
    }, 5000);

    // Fetch new data every 30 seconds
    this.fetchInterval = setInterval(() => {
      this.fetchPrices();
    }, 30 * 1000);
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
    }
  }
}

// Auto-initialize if container exists
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('crypto-prices-widget');
    if (container) {
      const widget = new CryptoPricesWidget('crypto-prices-widget');
      widget.init();
    }
  });
}
