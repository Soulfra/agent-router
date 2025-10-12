#!/usr/bin/env node
/**
 * Backfill Historical Price Data
 *
 * Fetches 7 days of historical price data from external APIs and populates
 * the price_history table. This allows charts to show full historical data
 * instead of just data collected since the worker started running.
 *
 * Usage:
 *   node scripts/backfill-prices.js
 *   OR
 *   calos-backfill
 */

require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || process.env.USER,
  password: process.env.DB_PASSWORD || ''
});

// Crypto symbols to backfill (CoinGecko IDs)
const CRYPTO_SYMBOLS = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'BNB': 'binancecoin',
  'ADA': 'cardano'
};

// Stock symbols to backfill
const STOCK_SYMBOLS = ['AAPL', 'GOOGL', 'TSLA', 'MSFT', 'AMZN'];

// How many days to backfill
const DAYS = 7;

/**
 * Backfill crypto historical data from CoinGecko
 */
async function backfillCrypto(symbol, coinGeckoId) {
  console.log(`📊 Backfilling ${symbol} (${DAYS} days)...`);

  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${coinGeckoId}/market_chart`,
      {
        params: {
          vs_currency: 'usd',
          days: DAYS
        },
        timeout: 10000
      }
    );

    const { prices } = response.data;

    if (!prices || prices.length === 0) {
      console.log(`⚠️  No historical data available for ${symbol}`);
      return 0;
    }

    let inserted = 0;
    let skipped = 0;

    // Insert each historical price point
    for (const [timestamp, price] of prices) {
      const date = new Date(timestamp);

      try {
        // Check if this timestamp already exists
        const existing = await db.query(
          'SELECT id FROM price_history WHERE symbol = $1 AND recorded_at = $2',
          [symbol, date]
        );

        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        // Calculate 24h change if we have data from 24h ago
        let change24h = null;
        const oneDayAgo = new Date(timestamp - 24 * 60 * 60 * 1000);
        const pastPriceResult = await db.query(
          'SELECT price FROM price_history WHERE symbol = $1 AND recorded_at <= $2 ORDER BY recorded_at DESC LIMIT 1',
          [symbol, oneDayAgo]
        );

        if (pastPriceResult.rows.length > 0) {
          const pastPrice = parseFloat(pastPriceResult.rows[0].price);
          change24h = ((price - pastPrice) / pastPrice) * 100;
        }

        // Insert historical data point
        await db.query(
          `INSERT INTO price_history (
            symbol, asset_type, price, change_24h, currency, source, recorded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [symbol, 'crypto', price, change24h, 'USD', 'coingecko_historical', date]
        );

        inserted++;

      } catch (err) {
        console.error(`Failed to insert ${symbol} at ${date}:`, err.message);
      }
    }

    console.log(`✅ ${symbol}: Inserted ${inserted} records (skipped ${skipped} existing)`);
    return inserted;

  } catch (error) {
    console.error(`❌ Failed to backfill ${symbol}:`, error.message);
    return 0;
  }
}

/**
 * Backfill stock historical data from Yahoo Finance
 */
async function backfillStock(symbol) {
  console.log(`📊 Backfilling ${symbol} (${DAYS} days)...`);

  try {
    // Calculate Unix timestamps for date range
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - (DAYS * 24 * 60 * 60);

    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
      {
        params: {
          period1: startDate,
          period2: endDate,
          interval: '1h',
          includePrePost: false
        },
        timeout: 10000
      }
    );

    const result = response.data.chart.result[0];
    const timestamps = result.timestamp;
    const prices = result.indicators.quote[0].close;

    if (!timestamps || !prices) {
      console.log(`⚠️  No historical data available for ${symbol}`);
      return 0;
    }

    let inserted = 0;
    let skipped = 0;

    // Insert each historical price point
    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i] * 1000; // Convert to milliseconds
      const price = prices[i];
      const date = new Date(timestamp);

      if (!price) continue; // Skip null prices

      try {
        // Check if this timestamp already exists
        const existing = await db.query(
          'SELECT id FROM price_history WHERE symbol = $1 AND recorded_at = $2',
          [symbol, date]
        );

        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        // Calculate 24h change if we have data from 24h ago
        let change24h = null;
        const oneDayAgo = new Date(timestamp - 24 * 60 * 60 * 1000);
        const pastPriceResult = await db.query(
          'SELECT price FROM price_history WHERE symbol = $1 AND recorded_at <= $2 ORDER BY recorded_at DESC LIMIT 1',
          [symbol, oneDayAgo]
        );

        if (pastPriceResult.rows.length > 0) {
          const pastPrice = parseFloat(pastPriceResult.rows[0].price);
          change24h = ((price - pastPrice) / pastPrice) * 100;
        }

        // Insert historical data point
        await db.query(
          `INSERT INTO price_history (
            symbol, asset_type, price, change_24h, currency, source, recorded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [symbol, 'stock', price, change24h, 'USD', 'yahoo_historical', date]
        );

        inserted++;

      } catch (err) {
        console.error(`Failed to insert ${symbol} at ${date}:`, err.message);
      }
    }

    console.log(`✅ ${symbol}: Inserted ${inserted} records (skipped ${skipped} existing)`);
    return inserted;

  } catch (error) {
    console.error(`❌ Failed to backfill ${symbol}:`, error.message);
    return 0;
  }
}

/**
 * Main backfill function
 */
async function main() {
  console.log('🚀 Starting historical data backfill...');
  console.log(`📅 Backfilling ${DAYS} days of data\n`);

  let totalInserted = 0;

  // Backfill crypto
  console.log('💰 Backfilling Cryptocurrencies:');
  for (const [symbol, coinGeckoId] of Object.entries(CRYPTO_SYMBOLS)) {
    const inserted = await backfillCrypto(symbol, coinGeckoId);
    totalInserted += inserted;
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('');

  // Backfill stocks
  console.log('📈 Backfilling Stocks:');
  for (const symbol of STOCK_SYMBOLS) {
    const inserted = await backfillStock(symbol);
    totalInserted += inserted;
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('');
  console.log(`✅ Backfill complete! Inserted ${totalInserted} historical records.`);
  console.log('💡 Charts should now work for all timeframes (1H, 6H, 24H, 7D)');

  process.exit(0);
}

// Run backfill
main().catch(err => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
