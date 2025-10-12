/**
 * Price Agent - Natural Language Price Queries
 *
 * Understands questions like:
 * - "what's the price of Bitcoin?"
 * - "how much is AAPL?"
 * - "show me crypto prices"
 * - "btc vs eth"
 */

const axios = require('axios');

const BASE_URL = process.env.CALOS_URL || 'http://localhost:5001';

/**
 * Parse natural language price query
 */
function parseQuery(input) {
  const lowerInput = input.toLowerCase();

  // Detect intent
  const intent = {
    type: null, // 'single', 'multi', 'compare', 'list'
    symbols: [],
    assetType: null // 'crypto', 'stock', 'all'
  };

  // Extract symbols
  const symbolPatterns = [
    /\b(btc|bitcoin)\b/i,
    /\b(eth|ethereum)\b/i,
    /\b(sol|solana)\b/i,
    /\b(bnb|binance)\b/i,
    /\b(ada|cardano)\b/i,
    /\b(aapl|apple)\b/i,
    /\b(googl|google)\b/i,
    /\b(tsla|tesla)\b/i,
    /\b(msft|microsoft)\b/i,
    /\b(amzn|amazon)\b/i
  ];

  const symbolMap = {
    'bitcoin': 'btc',
    'ethereum': 'eth',
    'solana': 'sol',
    'binance': 'bnb',
    'cardano': 'ada',
    'apple': 'aapl',
    'google': 'googl',
    'tesla': 'tsla',
    'microsoft': 'msft',
    'amazon': 'amzn'
  };

  // Find all mentioned symbols
  for (const pattern of symbolPatterns) {
    const match = lowerInput.match(pattern);
    if (match) {
      const symbol = match[1].toLowerCase();
      const normalized = symbolMap[symbol] || symbol;
      if (!intent.symbols.includes(normalized)) {
        intent.symbols.push(normalized);
      }
    }
  }

  // Determine intent type
  if (lowerInput.includes('compare') || lowerInput.includes('vs') || lowerInput.includes('versus')) {
    intent.type = 'compare';
  } else if (lowerInput.includes('all') || lowerInput.includes('show me') || lowerInput.includes('list')) {
    intent.type = 'list';
    if (lowerInput.includes('crypto')) intent.assetType = 'crypto';
    if (lowerInput.includes('stock')) intent.assetType = 'stock';
  } else if (intent.symbols.length > 1) {
    intent.type = 'multi';
  } else if (intent.symbols.length === 1) {
    intent.type = 'single';
  } else {
    intent.type = 'list'; // Default to showing all
  }

  return intent;
}

/**
 * Fetch price data
 */
async function fetchPrice(symbol) {
  try {
    const cryptoSymbols = ['btc', 'eth', 'sol', 'bnb', 'ada', 'xrp', 'doge', 'dot', 'matic', 'link'];
    const isCrypto = cryptoSymbols.includes(symbol.toLowerCase());

    const endpoint = isCrypto
      ? `${BASE_URL}/api/price/crypto/${symbol}`
      : `${BASE_URL}/api/price/stock/${symbol}`;

    const response = await axios.get(endpoint, { timeout: 5000 });
    return response.data;
  } catch (error) {
    return null;
  }
}

async function fetchAllPrices() {
  try {
    const response = await axios.get(`${BASE_URL}/api/price/latest`, { timeout: 5000 });
    return response.data.prices || [];
  } catch (error) {
    return [];
  }
}

/**
 * Format price for natural language response
 */
function formatPrice(price) {
  if (price >= 1000) {
    return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  } else if (price >= 1) {
    return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else {
    return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }
}

function formatChange(change) {
  const direction = change >= 0 ? 'up' : 'down';
  const abs = Math.abs(change);
  return `${direction} ${abs.toFixed(2)}%`;
}

function getSymbolName(symbol) {
  const names = {
    'btc': 'Bitcoin',
    'eth': 'Ethereum',
    'sol': 'Solana',
    'bnb': 'Binance Coin',
    'ada': 'Cardano',
    'aapl': 'Apple',
    'googl': 'Google',
    'tsla': 'Tesla',
    'msft': 'Microsoft',
    'amzn': 'Amazon'
  };
  return names[symbol.toLowerCase()] || symbol.toUpperCase();
}

/**
 * Generate natural language response
 */
function generateSingleResponse(priceData) {
  if (!priceData || priceData.status === 'error') {
    return "Sorry, I couldn't fetch that price right now.";
  }

  const name = getSymbolName(priceData.symbol);
  const price = formatPrice(priceData.price);
  const change = priceData.change24h || priceData.changePercent || 0;
  const changeStr = formatChange(change);

  return `${name} (${priceData.symbol}) is currently ${price}, ${changeStr} in the last 24 hours.`;
}

function generateMultiResponse(prices) {
  const valid = prices.filter(p => p && p.status !== 'error');

  if (valid.length === 0) {
    return "Sorry, I couldn't fetch those prices right now.";
  }

  let response = "Here are the current prices:\n\n";

  for (const priceData of valid) {
    const name = getSymbolName(priceData.symbol);
    const price = formatPrice(priceData.price);
    const change = priceData.change24h || priceData.changePercent || 0;
    const changeStr = formatChange(change);

    response += `• ${name} (${priceData.symbol}): ${price} (${changeStr})\n`;
  }

  return response.trim();
}

function generateCompareResponse(prices) {
  const valid = prices.filter(p => p && p.status !== 'error');

  if (valid.length < 2) {
    return "I need at least two valid prices to compare.";
  }

  const [first, second] = valid;
  const firstName = getSymbolName(first.symbol);
  const secondName = getSymbolName(second.symbol);
  const firstPrice = formatPrice(first.price);
  const secondPrice = formatPrice(second.price);

  let response = `Comparing ${firstName} and ${secondName}:\n\n`;
  response += `• ${firstName} (${first.symbol}): ${firstPrice}\n`;
  response += `• ${secondName} (${second.symbol}): ${secondPrice}\n\n`;

  // Calculate relative value
  if (first.price > second.price) {
    const ratio = (first.price / second.price).toFixed(2);
    response += `${firstName} is ${ratio}x more expensive than ${secondName}.`;
  } else {
    const ratio = (second.price / first.price).toFixed(2);
    response += `${secondName} is ${ratio}x more expensive than ${firstName}.`;
  }

  return response;
}

function generateListResponse(prices, assetType) {
  const valid = prices.filter(p => p && p.status !== 'error');

  if (valid.length === 0) {
    return "Sorry, I couldn't fetch any prices right now.";
  }

  // Filter by asset type if specified
  let filtered = valid;
  if (assetType === 'crypto') {
    filtered = valid.filter(p => p.source && p.source.includes('coin'));
  } else if (assetType === 'stock') {
    filtered = valid.filter(p => p.source && (p.source.includes('yahoo') || p.source.includes('alpha')));
  }

  let response = assetType === 'crypto' ? "Here are the cryptocurrency prices:\n\n"
    : assetType === 'stock' ? "Here are the stock prices:\n\n"
      : "Here are all the tracked prices:\n\n";

  // Sort by price (descending)
  filtered.sort((a, b) => b.price - a.price);

  for (const priceData of filtered) {
    const name = getSymbolName(priceData.symbol);
    const price = formatPrice(priceData.price);
    const change = priceData.change24h || priceData.changePercent || 0;
    const changeStr = formatChange(change);

    response += `• ${name} (${priceData.symbol}): ${price} (${changeStr})\n`;
  }

  return response.trim();
}

/**
 * Main agent function
 */
async function runPriceAgent(input, context = {}) {
  // Parse the query
  const intent = parseQuery(input);

  try {
    switch (intent.type) {
      case 'single': {
        const priceData = await fetchPrice(intent.symbols[0]);
        return generateSingleResponse(priceData);
      }

      case 'multi': {
        const prices = await Promise.all(intent.symbols.map(s => fetchPrice(s)));
        return generateMultiResponse(prices);
      }

      case 'compare': {
        const prices = await Promise.all(intent.symbols.map(s => fetchPrice(s)));
        return generateCompareResponse(prices);
      }

      case 'list': {
        const prices = await fetchAllPrices();
        return generateListResponse(prices, intent.assetType);
      }

      default:
        return "I can help you check cryptocurrency and stock prices! Try asking:\n" +
          "• 'What's the price of Bitcoin?'\n" +
          "• 'How much is AAPL?'\n" +
          "• 'Compare BTC and ETH'\n" +
          "• 'Show me all crypto prices'";
    }
  } catch (error) {
    console.error('Price agent error:', error);
    return "Sorry, I encountered an error fetching price data. Make sure the router is running.";
  }
}

module.exports = { runPriceAgent, parseQuery };
