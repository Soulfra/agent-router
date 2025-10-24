#!/usr/bin/env node

/**
 * Unicode API Test Script
 *
 * Tests the Unicode Manager API endpoints:
 * - Character search
 * - Character lookup by hex code
 * - Math symbols
 * - Greek letters
 * - Symbol shortcuts
 *
 * Usage:
 *   node scripts/test-unicode-api.js
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:5001';

async function testUnicodeAPI() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  Unicode API Test                             ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');

  try {
    // 1. Test character search
    console.log('1. Testing character search (query: "integral")...');
    const searchResponse = await axios.get(`${API_URL}/api/unicode/search?query=integral&limit=5`);
    console.log(`✓ Found ${searchResponse.data.count} results:`);
    searchResponse.data.results.forEach((char, index) => {
      console.log(`  ${index + 1}. ${char.character} - ${char.name} (${char.hex})`);
    });
    console.log('');

    // 2. Test character lookup
    console.log('2. Testing character lookup (U+1D461)...');
    const charResponse = await axios.get(`${API_URL}/api/unicode/char/1D461`);
    console.log(`✓ Character: ${charResponse.data.character}`);
    console.log(`  Name: ${charResponse.data.name}`);
    console.log(`  Hex: ${charResponse.data.hex}`);
    console.log(`  Category: ${charResponse.data.category}`);
    console.log('');

    // 3. Test math symbols
    console.log('3. Testing math symbols...');
    const mathResponse = await axios.get(`${API_URL}/api/unicode/math`);
    console.log(`✓ Found ${mathResponse.data.count} math symbols`);
    console.log('  Sample symbols:');
    const mathSamples = mathResponse.data.symbols.slice(0, 10);
    mathSamples.forEach((symbol, index) => {
      console.log(`  ${index + 1}. ${symbol.character} - ${symbol.name} (${symbol.hex})`);
    });
    console.log('');

    // 4. Test Greek letters
    console.log('4. Testing Greek letters...');
    const greekResponse = await axios.get(`${API_URL}/api/unicode/greek`);
    console.log(`✓ Found ${greekResponse.data.count} Greek letters`);
    console.log('  Sample letters:');
    const greekSamples = greekResponse.data.letters.slice(0, 10);
    greekSamples.forEach((letter, index) => {
      console.log(`  ${index + 1}. ${letter.character} - ${letter.name} (${letter.hex})`);
    });
    console.log('');

    // 5. Test symbol shortcuts
    console.log('5. Testing symbol shortcuts...');
    const shortcutsResponse = await axios.get(`${API_URL}/api/unicode/shortcuts`);
    console.log('✓ LaTeX-style shortcuts:');
    const latexShortcuts = Object.entries(shortcutsResponse.data.shortcuts.latex).slice(0, 10);
    latexShortcuts.forEach(([shortcut, symbol]) => {
      console.log(`  ${shortcut} → ${symbol}`);
    });
    console.log('');
    console.log('✓ Emoji-style shortcuts:');
    const emojiShortcuts = Object.entries(shortcutsResponse.data.shortcuts.emoji).slice(0, 10);
    emojiShortcuts.forEach(([shortcut, symbol]) => {
      console.log(`  ${shortcut} → ${symbol}`);
    });
    console.log('');

    // 6. Test specific mathematical symbols
    console.log('6. Testing specific mathematical symbols...');
    const mathTests = [
      { code: '222B', name: 'Integral' },
      { code: '2211', name: 'Summation' },
      { code: '221E', name: 'Infinity' },
      { code: '03C0', name: 'Pi' },
      { code: '221A', name: 'Square Root' }
    ];

    for (const test of mathTests) {
      const response = await axios.get(`${API_URL}/api/unicode/char/${test.code}`);
      console.log(`  ${response.data.character} - ${response.data.name} (U+${test.code})`);
    }
    console.log('');

    // Summary
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║  Test Results                                 ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');
    console.log('✓ All tests passed!');
    console.log('');
    console.log('API Endpoints Verified:');
    console.log('  • GET /api/unicode/search?query=<query>&limit=<n>');
    console.log('  • GET /api/unicode/char/<hex>');
    console.log('  • GET /api/unicode/math');
    console.log('  • GET /api/unicode/greek');
    console.log('  • GET /api/unicode/shortcuts');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed with error:');
    console.error('');

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.request) {
      console.error('No response received from server');
      console.error('');
      console.error('Check that server is running:');
      console.error('  npm run start');
      console.error('');
      console.error('Or:');
      console.error('  node router.js --local');
    } else {
      console.error(error.message);
    }

    console.error('');
    process.exit(1);
  }
}

if (require.main === module) {
  testUnicodeAPI().catch((error) => {
    console.error('Unhandled error:', error.message);
    process.exit(1);
  });
}

module.exports = testUnicodeAPI;
