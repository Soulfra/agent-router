#!/usr/bin/env node

/**
 * Preload Calculator Translations
 *
 * Pre-loads all calculator UI strings into the translation database cache
 * for all 40+ supported languages. This eliminates API rate limits and
 * provides instant offline translation access.
 *
 * Usage:
 *   node scripts/preload-calculator-translations.js
 *   node scripts/preload-calculator-translations.js --languages es,fr,de
 *   node scripts/preload-calculator-translations.js --dry-run
 */

const TranslationAdapter = require('../lib/translation-adapter');
const TranslationDBManager = require('../lib/translation-db-manager');
const { Pool } = require('pg');

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const languagesArg = args.find(arg => arg.startsWith('--languages='));
const specificLanguages = languagesArg
  ? languagesArg.split('=')[1].split(',')
  : null;

// Calculator strings to translate (context: 'calculator')
const CALCULATOR_STRINGS = [
  // Headers
  'CalOS XP Calculator',
  'Calculate XP needed, training time, and efficiency for your skills',

  // Input section
  'Calculator Input',
  'Select Skill',
  'Loading skills...',
  'Current Level (1-99)',
  'Or Current XP',
  'Target Level (1-99)',
  'Calculate XP',
  'Reset',

  // Events
  'Active XP Event!',
  'Ends',

  // Results section
  'Results',
  'Current Level:',
  'Current XP:',
  'Target Level:',
  'Target XP:',
  'XP Needed:',
  'Progress to Goal:',
  'Enter your current and target levels above, then click "Calculate XP" to see results.',

  // Training actions
  'Training Actions',
  'Select an action to calculate training time:',
  'Loading actions...',
  'No actions available for this skill',
  'Selected Action:',
  'XP per Hour:',
  'Actions Needed:',
  'Training Time:',

  // Share section
  'Share Calculator',
  'Share your calculation with others:',
  'Generate Link',
  'Copy',
  "Click 'Generate Link' to create a shareable URL",

  // Error messages
  'Please select a skill',
  'Target level must be higher than current level',
  'Error loading skills',
  'Failed to load skills',
  'Failed to load actions',
  'Please calculate first',
  'Generate a link first',
  'URL copied to clipboard!',

  // Time units
  'second',
  'seconds',
  'minute',
  'minutes',
  'hour',
  'hours',
  'day',
  'days',
  'week',
  'weeks',
  'month',
  'months',
  'year',
  'years',

  // Common calculator terms
  'Level',
  'XP',
  'Experience',
  'Skill',
  'Action',
  'Training',
  'Time',
  'Needed',
  'Total',
  'Per Hour',
  'Multiplier'
];

// Additional UI strings (context: 'ui')
const UI_STRINGS = [
  'Files',
  'Chat',
  'API Keys',
  'Models',
  'App Store',
  'Settings',
  'Calculator',
  'Theme',
  'Language',
  'Save',
  'Cancel',
  'Delete',
  'Close',
  'Open',
  'Loading...',
  'Error',
  'Success',
  'Offline Mode',
  'Online'
];

// Initialize database connection
async function initDB() {
  const pool = new Pool({
    user: process.env.DB_USER || 'calos',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'calos',
    password: process.env.DB_PASSWORD || 'calos_password',
    port: process.env.DB_PORT || 5432,
  });

  // Test connection
  try {
    await pool.query('SELECT NOW()');
    console.log('✓ Database connection established');
    return pool;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    process.exit(1);
  }
}

async function main() {
  console.log('================================================');
  console.log('   CalOS Translation Preloader');
  console.log('================================================\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No translations will be saved\n');
  }

  // Initialize services
  const db = await initDB();
  const translationAdapter = new TranslationAdapter({ timeout: 15000 });
  const translationDBManager = new TranslationDBManager({ db, translationAdapter });

  // Get all supported languages
  const allLanguages = translationAdapter.getSupportedLanguages();
  console.log(`📚 Total supported languages: ${allLanguages.length}`);

  // Filter languages if specified
  const targetLanguages = specificLanguages
    ? allLanguages.filter(lang => specificLanguages.includes(lang.code))
    : allLanguages;

  if (specificLanguages) {
    console.log(`🎯 Target languages: ${targetLanguages.map(l => l.code).join(', ')}`);
  }

  console.log(`\n📝 Calculator strings to translate: ${CALCULATOR_STRINGS.length}`);
  console.log(`📝 UI strings to translate: ${UI_STRINGS.length}`);
  console.log(`📝 Total strings: ${CALCULATOR_STRINGS.length + UI_STRINGS.length}`);
  console.log(`🌍 Total translations needed: ${(CALCULATOR_STRINGS.length + UI_STRINGS.length) * targetLanguages.length}\n`);

  if (dryRun) {
    console.log('Dry run complete. Run without --dry-run to perform actual translations.\n');
    await db.end();
    return;
  }

  // Preload calculator translations
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Pre-loading CALCULATOR translations...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let calculatorStats = {
    total: 0,
    cached: 0,
    new: 0,
    errors: 0
  };

  for (const lang of targetLanguages) {
    console.log(`\n🌍 Translating to ${lang.flag} ${lang.name} (${lang.code})...`);

    for (const text of CALCULATOR_STRINGS) {
      try {
        calculatorStats.total++;

        // Check if already cached
        const cached = await translationDBManager.getCachedTranslation(text, 'en', lang.code, 'calculator');

        if (cached) {
          calculatorStats.cached++;
          process.stdout.write('.');
        } else {
          // Translate and cache
          const result = await translationDBManager.getTranslation(text, 'en', lang.code, 'calculator');

          if (result.source === 'api_with_cache' || result.source === 'database_cache') {
            calculatorStats.new++;
            process.stdout.write('+');
          } else {
            calculatorStats.errors++;
            process.stdout.write('x');
          }

          // Rate limit: 1 request per 100ms (600/min, well under MyMemory's 1000/day limit)
          await sleep(100);
        }
      } catch (error) {
        calculatorStats.errors++;
        process.stdout.write('x');
        console.error(`\n  Error translating "${text}": ${error.message}`);
      }
    }

    console.log(`\n✓ Completed ${lang.name}`);
  }

  // Preload UI translations
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎨 Pre-loading UI translations...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let uiStats = {
    total: 0,
    cached: 0,
    new: 0,
    errors: 0
  };

  for (const lang of targetLanguages) {
    console.log(`\n🌍 Translating to ${lang.flag} ${lang.name} (${lang.code})...`);

    for (const text of UI_STRINGS) {
      try {
        uiStats.total++;

        // Check if already cached
        const cached = await translationDBManager.getCachedTranslation(text, 'en', lang.code, 'ui');

        if (cached) {
          uiStats.cached++;
          process.stdout.write('.');
        } else {
          // Translate and cache
          const result = await translationDBManager.getTranslation(text, 'en', lang.code, 'ui');

          if (result.source === 'api_with_cache' || result.source === 'database_cache') {
            uiStats.new++;
            process.stdout.write('+');
          } else {
            uiStats.errors++;
            process.stdout.write('x');
          }

          // Rate limit
          await sleep(100);
        }
      } catch (error) {
        uiStats.errors++;
        process.stdout.write('x');
        console.error(`\n  Error translating "${text}": ${error.message}`);
      }
    }

    console.log(`\n✓ Completed ${lang.name}`);
  }

  // Display summary
  console.log('\n\n================================================');
  console.log('   📊 PRELOAD SUMMARY');
  console.log('================================================\n');

  console.log('Calculator Translations:');
  console.log(`  Total:  ${calculatorStats.total}`);
  console.log(`  Cached: ${calculatorStats.cached} (already existed)`);
  console.log(`  New:    ${calculatorStats.new} (newly added)`);
  console.log(`  Errors: ${calculatorStats.errors}`);

  console.log('\nUI Translations:');
  console.log(`  Total:  ${uiStats.total}`);
  console.log(`  Cached: ${uiStats.cached} (already existed)`);
  console.log(`  New:    ${uiStats.new} (newly added)`);
  console.log(`  Errors: ${uiStats.errors}`);

  const grandTotal = calculatorStats.total + uiStats.total;
  const grandCached = calculatorStats.cached + uiStats.cached;
  const grandNew = calculatorStats.new + uiStats.new;
  const grandErrors = calculatorStats.errors + uiStats.errors;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('GRAND TOTAL:');
  console.log(`  Total:  ${grandTotal}`);
  console.log(`  Cached: ${grandCached}`);
  console.log(`  New:    ${grandNew}`);
  console.log(`  Errors: ${grandErrors}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get database stats
  const dbStats = await translationDBManager.getStats();
  console.log('📈 Database Statistics:');
  console.log(`  Total cached translations: ${dbStats.cached_translations}`);
  console.log(`  Languages in cache: ${dbStats.languages_cached}`);
  console.log(`  Language pairs: ${dbStats.language_pairs.length}`);

  console.log('\n✅ Preload complete!\n');

  // Cleanup
  await db.end();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { CALCULATOR_STRINGS, UI_STRINGS };
