#!/usr/bin/env node
/**
 * Compute OHLCV Candles from Raw Price Data
 *
 * Aggregates price_history data into OHLCV (Open, High, Low, Close, Volume) candles
 * for various timeframes (1min, 5min, 15min, 1hour, 4hour, 1day, 1week).
 *
 * This is essential for:
 * - Algorithmic trading backtesting
 * - Technical analysis
 * - Data compression (candles use less space than raw ticks)
 *
 * Usage:
 *   node scripts/compute-candles.js [options]
 *
 * Options:
 *   --symbol BTC          Compute candles for specific symbol (default: all)
 *   --timeframe 5m        Compute specific timeframe (default: all)
 *   --from "2025-10-01"   Start date (default: 7 days ago)
 *   --to "2025-10-11"     End date (default: now)
 *   --force               Overwrite existing candles
 */

require('dotenv').config();
const { Pool } = require('pg');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : defaultValue;
};

const SYMBOL_FILTER = getArg('symbol', null);
const TIMEFRAME_FILTER = getArg('timeframe', null);
const FROM_DATE = getArg('from', null);
const TO_DATE = getArg('to', null);
const FORCE_OVERWRITE = args.includes('--force');

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || process.env.USER,
  password: process.env.DB_PASSWORD || ''
});

// Timeframe configurations
const TIMEFRAMES = {
  '1m': { interval: '1 minute', minutes: 1 },
  '5m': { interval: '5 minutes', minutes: 5 },
  '15m': { interval: '15 minutes', minutes: 15 },
  '1h': { interval: '1 hour', minutes: 60 },
  '4h': { interval: '4 hours', minutes: 240 },
  '1d': { interval: '1 day', minutes: 1440 },
  '1w': { interval: '1 week', minutes: 10080 }
};

/**
 * Get list of symbols to process
 */
async function getSymbols() {
  if (SYMBOL_FILTER) {
    // Query database to get asset_type for filtered symbol
    const result = await db.query(`
      SELECT DISTINCT symbol, asset_type
      FROM price_history
      WHERE symbol = $1
    `, [SYMBOL_FILTER.toUpperCase()]);

    return result.rows;
  }

  const result = await db.query(`
    SELECT DISTINCT symbol, asset_type
    FROM price_history
    ORDER BY symbol
  `);

  return result.rows;
}

/**
 * Parse time string (handles both ISO dates and human-readable formats)
 * @param {string} timeStr - Time string like "1 hour ago", "2 days ago", or ISO date
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseTimeString(timeStr) {
  if (!timeStr) return null;

  // Try ISO date first
  const isoDate = new Date(timeStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Parse human-readable formats like "1 hour ago", "30 minutes ago", "2 days ago"
  const match = timeStr.match(/^(\d+)\s+(second|minute|hour|day|week)s?\s+ago$/i);
  if (match) {
    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const now = Date.now();
    const multipliers = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000
    };

    const offset = amount * (multipliers[unit] || 0);
    return new Date(now - offset);
  }

  console.warn(`[compute-candles] Could not parse time string: "${timeStr}"`);
  return null;
}

/**
 * Get date range for processing
 */
function getDateRange() {
  const now = new Date();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const from = FROM_DATE ? (parseTimeString(FROM_DATE) || sevenDaysAgo) : sevenDaysAgo;
  const to = TO_DATE ? (parseTimeString(TO_DATE) || now) : now;

  return { from, to };
}

/**
 * Compute candles for a specific symbol and timeframe
 */
async function computeCandles(symbol, assetType, timeframe, from, to) {
  const config = TIMEFRAMES[timeframe];

  console.log(`\n📊 Computing ${timeframe} candles for ${symbol}...`);

  try {
    // Query to aggregate raw price data into OHLCV candles
    const query = `
      WITH time_buckets AS (
        SELECT
          symbol,
          asset_type,
          DATE_TRUNC('minute', recorded_at) AS minute,
          -- Floor to timeframe bucket
          DATE_TRUNC('minute', recorded_at) -
            (EXTRACT(MINUTE FROM recorded_at)::INTEGER % $5) * INTERVAL '1 minute' AS candle_start,
          price,
          volume_24h
        FROM price_history
        WHERE symbol = $1
          AND asset_type = $2
          AND recorded_at >= $3
          AND recorded_at <= $4
      ),
      candles AS (
        SELECT
          symbol,
          asset_type,
          candle_start,
          candle_start + $6::INTERVAL AS candle_end,
          (ARRAY_AGG(price ORDER BY minute ASC))[1] AS open_price,
          MAX(price) AS high_price,
          MIN(price) AS low_price,
          (ARRAY_AGG(price ORDER BY minute DESC))[1] AS close_price,
          AVG(volume_24h) AS volume,
          COUNT(*) AS trades_count
        FROM time_buckets
        GROUP BY symbol, asset_type, candle_start
      )
      SELECT
        symbol,
        asset_type,
        $7 AS timeframe,
        open_price,
        high_price,
        low_price,
        close_price,
        volume,
        trades_count,
        ROUND(((close_price - open_price) / open_price * 100)::numeric, 4) AS change_percent,
        candle_start,
        candle_end
      FROM candles
      ORDER BY candle_start ASC
    `;

    const values = [
      symbol,
      assetType,
      from,
      to,
      config.minutes,
      config.interval,
      timeframe
    ];

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      console.log(`   ⚠️  No data found for ${symbol} ${timeframe}`);
      return 0;
    }

    // Insert or update candles
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const candle of result.rows) {
      try {
        // Check if candle already exists
        const existing = await db.query(
          'SELECT id FROM price_candles WHERE symbol = $1 AND asset_type = $2 AND timeframe = $3 AND candle_start = $4',
          [candle.symbol, candle.asset_type, candle.timeframe, candle.candle_start]
        );

        if (existing.rows.length > 0) {
          if (FORCE_OVERWRITE) {
            // Update existing candle
            await db.query(`
              UPDATE price_candles
              SET open_price = $1, high_price = $2, low_price = $3, close_price = $4,
                  volume = $5, trades_count = $6, change_percent = $7, candle_end = $8
              WHERE id = $9
            `, [
              candle.open_price,
              candle.high_price,
              candle.low_price,
              candle.close_price,
              candle.volume,
              candle.trades_count,
              candle.change_percent,
              candle.candle_end,
              existing.rows[0].id
            ]);
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Insert new candle
          await db.query(`
            INSERT INTO price_candles (
              symbol, asset_type, timeframe,
              open_price, high_price, low_price, close_price,
              volume, trades_count, change_percent,
              candle_start, candle_end
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            candle.symbol,
            candle.asset_type,
            candle.timeframe,
            candle.open_price,
            candle.high_price,
            candle.low_price,
            candle.close_price,
            candle.volume,
            candle.trades_count,
            candle.change_percent,
            candle.candle_start,
            candle.candle_end
          ]);
          inserted++;
        }
      } catch (err) {
        console.error(`   ❌ Failed to insert candle at ${candle.candle_start}:`, err.message);
      }
    }

    console.log(`   ✅ ${symbol} ${timeframe}: ${inserted} inserted, ${updated} updated, ${skipped} skipped`);
    return inserted + updated;

  } catch (error) {
    console.error(`   ❌ Failed to compute ${symbol} ${timeframe} candles:`, error.message);
    return 0;
  }
}

/**
 * Log to scheduler_log table
 */
async function logJob(jobName, status, metadata) {
  try {
    await db.query(`
      INSERT INTO scheduler_log (job_name, job_type, status, started_at, completed_at, duration_ms, records_processed, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      jobName,
      'candle_aggregation',
      status,
      metadata.started_at,
      new Date(),
      Date.now() - metadata.started_at.getTime(),
      metadata.records_processed || 0,
      JSON.stringify(metadata)
    ]);
  } catch (err) {
    console.error('Failed to log job:', err.message);
  }
}

/**
 * Main execution
 */
async function main() {
  const startTime = new Date();

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  📈 OHLCV Candle Computation                           ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log();

  // Get processing parameters
  const symbols = await getSymbols();
  const { from, to } = getDateRange();
  const timeframes = TIMEFRAME_FILTER ? [TIMEFRAME_FILTER] : Object.keys(TIMEFRAMES);

  console.log(`📅 Date Range: ${from.toISOString()} to ${to.toISOString()}`);
  console.log(`🎯 Symbols: ${SYMBOL_FILTER || `All (${symbols.length})`}`);
  console.log(`⏱️  Timeframes: ${TIMEFRAME_FILTER || `All (${timeframes.length})`}`);
  console.log(`🔄 Mode: ${FORCE_OVERWRITE ? 'OVERWRITE' : 'INSERT ONLY'}`);
  console.log();

  let totalCandles = 0;

  // Process each symbol
  for (const { symbol, asset_type } of symbols) {
    console.log(`\n━━━ Processing ${symbol} (${asset_type}) ━━━`);

    for (const timeframe of timeframes) {
      const candlesCreated = await computeCandles(symbol, asset_type, timeframe, from, to);
      totalCandles += candlesCreated;

      // Small delay to avoid overwhelming database
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const duration = Date.now() - startTime.getTime();

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log(`║  ✅ Candle Computation Complete                        ║`);
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`📊 Total Candles Created: ${totalCandles}`);
  console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`💾 Database: ${process.env.DB_NAME || 'calos'}`);
  console.log();
  console.log('💡 Next Steps:');
  console.log('   1. Run: node scripts/compute-indicators.js');
  console.log('   2. Query: SELECT * FROM latest_candles;');
  console.log('   3. API: GET /api/candles/:symbol?timeframe=1h');
  console.log();

  // Log to scheduler_log
  await logJob('compute-candles', 'success', {
    started_at: startTime,
    records_processed: totalCandles,
    symbols_count: symbols.length,
    timeframes: timeframes,
    date_range: { from, to }
  });

  process.exit(0);
}

// Run with error handling
main().catch(async (err) => {
  console.error('\n❌ Candle computation failed:', err);

  await logJob('compute-candles', 'failed', {
    started_at: new Date(),
    error_message: err.message
  });

  process.exit(1);
});
