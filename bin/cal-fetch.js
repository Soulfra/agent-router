#!/usr/bin/env node

/**
 * CalOS External Data Fetcher CLI
 *
 * Command-line tool for fetching external data from APIs, websites, RSS feeds
 *
 * Usage:
 *   cal-fetch <url>                          # Fetch URL (auto-detect type)
 *   cal-fetch <url> --json                   # Parse as JSON
 *   cal-fetch <url> --xml                    # Parse as XML
 *   cal-fetch <url> --html                   # Fetch HTML
 *   cal-fetch <url> --rss                    # Parse RSS feed
 *   cal-fetch <url> --post '{"data": "..."}'  # POST request
 *   cal-fetch <url> --no-cache               # Skip cache
 *
 * Examples:
 *   cal-fetch https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd
 *   cal-fetch https://news.ycombinator.com/rss --rss
 *   cal-fetch https://example.com/api --post '{"query": "test"}'
 */

const ExternalFetcher = require('../lib/external-fetcher');
const { Pool } = require('pg');
require('dotenv').config();

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
CalOS External Data Fetcher

Usage:
  cal-fetch <url> [options]

Options:
  --json              Parse response as JSON (default)
  --xml               Parse response as XML
  --html              Fetch HTML
  --rss               Parse RSS feed
  --post <data>       Make POST request with JSON data
  --no-cache          Skip cache and fetch fresh data
  --timeout <ms>      Request timeout in milliseconds (default: 10000)
  --help, -h          Show this help

Examples:
  cal-fetch https://api.github.com/repos/nodejs/node
  cal-fetch https://news.ycombinator.com/rss --rss
  cal-fetch https://api.example.com/data --post '{"query":"test"}'
  cal-fetch https://example.com --html --no-cache
  `);
  process.exit(0);
}

const url = args[0];

// Parse options
const options = {
  responseType: 'json',
  useCache: true,
  method: 'GET',
  timeout: 10000
};

if (args.includes('--json')) {
  options.responseType = 'json';
}

if (args.includes('--xml')) {
  options.responseType = 'xml';
}

if (args.includes('--html')) {
  options.responseType = 'html';
}

if (args.includes('--rss')) {
  options.responseType = 'rss';
}

if (args.includes('--no-cache')) {
  options.useCache = false;
}

const postIndex = args.indexOf('--post');
if (postIndex !== -1 && args[postIndex + 1]) {
  options.method = 'POST';
  try {
    options.body = JSON.parse(args[postIndex + 1]);
  } catch (e) {
    console.error('❌ Invalid JSON for --post argument');
    process.exit(1);
  }
}

const timeoutIndex = args.indexOf('--timeout');
if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
  options.timeout = parseInt(args[timeoutIndex + 1]);
}

// Initialize database connection (for caching)
let db = null;
try {
  db = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'calos',
    user: process.env.DB_USER || process.env.USER,
    password: process.env.DB_PASSWORD || ''
  });
} catch (error) {
  // Database not required - caching will be disabled
  console.error('⚠️  Database not available - caching disabled');
}

// Fetch data
async function main() {
  const fetcher = new ExternalFetcher({
    db: db,
    cacheDuration: 300000 // 5 minutes
  });

  try {
    console.error(`📡 Fetching: ${url}`);
    console.error(`   Type: ${options.responseType}`);
    console.error(`   Cache: ${options.useCache ? 'enabled' : 'disabled'}\n`);

    let data;

    if (options.responseType === 'rss') {
      data = await fetcher.fetchRSS(url);
    } else if (options.method === 'POST') {
      data = await fetcher.post(url, options.body, options);
    } else if (options.responseType === 'json') {
      data = await fetcher.fetchJSON(url, options);
    } else if (options.responseType === 'xml') {
      data = await fetcher.fetchXML(url, options);
    } else if (options.responseType === 'html') {
      data = await fetcher.fetchHTML(url, options);
    } else {
      data = await fetcher.fetch(url, options);
    }

    // Output data as JSON
    if (typeof data === 'object') {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(data);
    }

    console.error('\n✅ Fetch complete');

    if (db) {
      await db.end();
    }

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Fetch failed:', error.message);

    if (db) {
      await db.end();
    }

    process.exit(1);
  }
}

main();
