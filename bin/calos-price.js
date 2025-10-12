#!/usr/bin/env node
/**
 * CalOS Price CLI Tool
 *
 * Quick command-line access to price data
 *
 * Usage:
 *   calos-price btc                  # Single price
 *   calos-price btc eth sol          # Multiple prices
 *   calos-price --table              # All prices in table
 *   calos-price --json btc           # JSON output
 *   calos-price --csv                # CSV output
 */

const axios = require('axios');

const BASE_URL = process.env.CALOS_URL || 'http://localhost:5001';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  format: 'text', // text, json, csv, table
  symbols: [],
  all: false
};

// Parse flags
for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--json') {
    options.format = 'json';
  } else if (arg === '--csv') {
    options.format = 'csv';
  } else if (arg === '--table') {
    options.format = 'table';
    options.all = true;
  } else if (arg === '--all') {
    options.all = true;
  } else if (arg === '--help' || arg === '-h') {
    showHelp();
    process.exit(0);
  } else if (!arg.startsWith('--')) {
    options.symbols.push(arg.toLowerCase());
  }
}

// Default to all tracked assets if no symbols specified
if (options.symbols.length === 0 && !options.all) {
  options.all = true;
}

async function fetchPrice(symbol) {
  try {
    // Detect if crypto or stock
    const cryptoSymbols = ['btc', 'eth', 'sol', 'bnb', 'ada', 'xrp', 'doge', 'dot', 'matic', 'link'];
    const isCrypto = cryptoSymbols.includes(symbol.toLowerCase());

    const endpoint = isCrypto
      ? `${BASE_URL}/api/price/crypto/${symbol}`
      : `${BASE_URL}/api/price/stock/${symbol}`;

    const response = await axios.get(endpoint, { timeout: 5000 });
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return { status: 'error', symbol: symbol.toUpperCase(), message: 'Not found' };
    }
    return { status: 'error', symbol: symbol.toUpperCase(), message: error.message };
  }
}

async function fetchAllPrices() {
  try {
    const response = await axios.get(`${BASE_URL}/api/price/latest`, { timeout: 5000 });
    if (response.data.status === 'ok') {
      return response.data.prices || [];
    }
    return [];
  } catch (error) {
    console.error('Error fetching prices:', error.message);
    return [];
  }
}

function formatPrice(price) {
  if (price >= 1000) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  } else if (price >= 1) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else {
    return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }
}

function formatChange(change) {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

function formatTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const seconds = Math.floor((Date.now() - date) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function printTextFormat(priceData) {
  if (priceData.status === 'error') {
    console.log(`❌ ${priceData.symbol}: ${priceData.message}`);
    return;
  }

  const changeColor = (priceData.change24h || priceData.changePercent || 0) >= 0 ? '🟢' : '🔴';
  const change = priceData.change24h || priceData.changePercent || 0;

  console.log(`${priceData.symbol}: $${formatPrice(priceData.price)}  ${changeColor} ${formatChange(change)}`);
  console.log(`  Source: ${priceData.source}  •  Updated: ${formatTimeAgo(priceData.lastUpdate)}`);
}

function printTableFormat(prices) {
  // Calculate column widths
  const symbolWidth = Math.max(8, ...prices.map(p => p.symbol.length + 2));
  const priceWidth = 14;
  const changeWidth = 12;
  const sourceWidth = 12;

  // Header
  const line = '─'.repeat(symbolWidth + priceWidth + changeWidth + sourceWidth + 9);
  console.log('┌' + line + '┐');
  console.log('│ ' +
    'SYMBOL'.padEnd(symbolWidth) +
    'PRICE'.padEnd(priceWidth) +
    'CHANGE'.padEnd(changeWidth) +
    'SOURCE'.padEnd(sourceWidth) +
    '│');
  console.log('├' + line + '┤');

  // Rows
  for (const price of prices) {
    if (price.status === 'error') continue;

    const change = price.change24h || price.changePercent || 0;
    const changeStr = formatChange(change);
    const changeIcon = change >= 0 ? '▲' : '▼';

    console.log('│ ' +
      price.symbol.padEnd(symbolWidth) +
      ('$' + formatPrice(price.price)).padEnd(priceWidth) +
      (changeIcon + ' ' + changeStr).padEnd(changeWidth) +
      price.source.padEnd(sourceWidth) +
      '│');
  }

  console.log('└' + line + '┘');
}

function printJsonFormat(prices) {
  if (Array.isArray(prices)) {
    console.log(JSON.stringify(prices, null, 2));
  } else {
    console.log(JSON.stringify([prices], null, 2));
  }
}

function printCsvFormat(prices) {
  const list = Array.isArray(prices) ? prices : [prices];

  // Header
  console.log('Symbol,Price,Change24h,Currency,Source,LastUpdate');

  // Rows
  for (const price of list) {
    if (price.status === 'error') continue;

    const change = price.change24h || price.changePercent || 0;
    console.log([
      price.symbol,
      price.price,
      change,
      price.currency || 'USD',
      price.source,
      price.lastUpdate
    ].join(','));
  }
}

function showHelp() {
  console.log(`
CalOS Price CLI Tool

Usage:
  calos-price <symbol>              Single price query
  calos-price <symbol1> <symbol2>   Multiple prices
  calos-price --table               All prices in table format
  calos-price --json <symbol>       JSON output
  calos-price --csv                 CSV output for spreadsheets

Examples:
  calos-price btc                   # Bitcoin price
  calos-price btc eth sol           # Multiple crypto prices
  calos-price aapl googl            # Stock prices
  calos-price --table               # Nice table of all prices
  calos-price --csv > prices.csv    # Export to CSV
  calos-price --json btc | jq       # JSON for scripting

Options:
  --table       Table format with all tracked assets
  --json        JSON output format
  --csv         CSV output format
  --all         Include all tracked assets
  -h, --help    Show this help message

Supported Assets:
  Crypto: btc, eth, sol (+ more)
  Stocks: AAPL, GOOGL, TSLA (+ more)
`);
}

async function main() {
  try {
    if (options.all || options.symbols.length === 0) {
      // Fetch all prices
      const prices = await fetchAllPrices();

      if (prices.length === 0) {
        console.error('❌ No prices available. Is the router running?');
        console.error('   Try: calos-start');
        process.exit(1);
      }

      if (options.format === 'json') {
        printJsonFormat(prices);
      } else if (options.format === 'csv') {
        printCsvFormat(prices);
      } else {
        printTableFormat(prices);
      }
    } else {
      // Fetch specific symbols
      const prices = await Promise.all(options.symbols.map(s => fetchPrice(s)));

      if (options.format === 'json') {
        printJsonFormat(prices);
      } else if (options.format === 'csv') {
        printCsvFormat(prices);
      } else if (options.format === 'table') {
        printTableFormat(prices);
      } else {
        // Text format
        prices.forEach(price => printTextFormat(price));
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Is the router running? Try: calos-start');
    process.exit(1);
  }
}

main();
