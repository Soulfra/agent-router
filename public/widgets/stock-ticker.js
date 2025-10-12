/**
 * Stock Ticker Widget
 *
 * Displays real-time stock prices for major companies
 * Updates automatically every 60 seconds (respecting API rate limits)
 */

class StockTickerWidget {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.updateInterval = null;
    this.fetchInterval = null;
    this.baseUrl = window.location.origin;

    // Stocks to track (popular symbols)
    this.stocks = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'];

    // Price data
    this.prices = {};
  }

  async init() {
    if (!this.container) {
      console.error('Stock ticker widget container not found');
      return;
    }

    this.render();
    await this.fetchPrices();
    this.startUpdating();
  }

  render() {
    this.container.innerHTML = `
      <div class="stock-ticker-widget">
        <div class="widget-header">
          <h3>📈 Stock Ticker</h3>
          <span class="last-update" id="stock-last-update">Loading...</span>
        </div>
        <div class="ticker-list" id="stock-ticker-list">
          <div class="loading">Loading stocks...</div>
        </div>
      </div>
    `;
  }

  async fetchPrices() {
    try {
      // Fetch prices for all tracked stocks
      const promises = this.stocks.map(symbol =>
        fetch(`${this.baseUrl}/api/price/stock/${symbol}`)
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
      console.error('Failed to fetch stock prices:', error);
      document.getElementById('stock-ticker-list').innerHTML = `
        <div class="error">Failed to load stock prices</div>
      `;
    }
  }

  updateDisplay() {
    const listEl = document.getElementById('stock-ticker-list');
    if (!listEl) return;

    const html = Object.keys(this.prices).map(symbol => {
      const stock = this.prices[symbol];
      const change = stock.change || 0;
      const changePercent = stock.changePercent || 0;
      const changeClass = change >= 0 ? 'positive' : 'negative';
      const changeSymbol = change >= 0 ? '▲' : '▼';

      return `
        <div class="ticker-item">
          <div class="ticker-symbol">
            <span class="symbol">${stock.symbol}</span>
          </div>
          <div class="ticker-price">
            <span class="price">$${stock.price.toFixed(2)}</span>
          </div>
          <div class="ticker-change ${changeClass}">
            <span class="change-arrow">${changeSymbol}</span>
            <span class="change-amount">$${Math.abs(change).toFixed(2)}</span>
            <span class="change-percent">(${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)</span>
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = html || '<div class="no-data">No stock data available</div>';

    // Update last update time
    const lastUpdateEl = document.getElementById('stock-last-update');
    if (lastUpdateEl) {
      const now = new Date();
      lastUpdateEl.textContent = `Updated ${now.toLocaleTimeString()}`;
    }
  }

  startUpdating() {
    // Update display every 10 seconds (without fetching)
    this.updateInterval = setInterval(() => {
      this.updateDisplay();
    }, 10000);

    // Fetch new data every 60 seconds (stocks update less frequently than crypto)
    this.fetchInterval = setInterval(() => {
      this.fetchPrices();
    }, 60 * 1000);
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
    const container = document.getElementById('stock-ticker-widget');
    if (container) {
      const widget = new StockTickerWidget('stock-ticker-widget');
      widget.init();
    }
  });
}
