#!/usr/bin/env node

/**
 * Test the complete OAuth builder pipeline:
 * 1. Process directory of screenshots
 * 2. Extract credentials via OCR
 * 3. Auto-generate annotations
 * 4. Create annotated screenshots
 * 5. Generate GIF
 */

const path = require('path');
const GuidedOAuthBuilder = require('../lib/guided-oauth-builder');

async function testFullPipeline() {
  console.log('='.repeat(80));
  console.log('Testing Complete OAuth Builder Pipeline');
  console.log('='.repeat(80));

  const builder = new GuidedOAuthBuilder({
    baseDir: path.join(__dirname, '..'),
    screenshotsDir: path.join(__dirname, '../oauth-screenshots'),
    outputDir: path.join(__dirname, '../oauth-exports')
  });

  // Test with existing demo screenshots
  const demoDir = path.join(__dirname, '../oauth-exports/demo');

  console.log(`\nProcessing directory: ${demoDir}`);

  try {
    const result = await builder.processDirectory(demoDir, {
      provider: 'github',
      appName: 'Soulfra Platform',
      stepTitles: [
        'Navigate to GitHub Sign In',
        'Enter Credentials',
        'Authorize Application'
      ]
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ Pipeline Complete!');
    console.log('='.repeat(80));

    console.log('\nResults:');
    console.log(`  Provider: ${result.provider}`);
    console.log(`  Client ID: ${result.credentials.clientId || 'NOT FOUND'}`);
    console.log(`  Client Secret: ${result.credentials.clientSecret ? '*'.repeat(20) : 'NOT FOUND'}`);
    console.log(`  Annotated Screenshots: ${result.annotatedScreenshots.length}`);
    console.log(`  GIF Path: ${result.gifPath}`);

    console.log('\nAnnotated Screenshots:');
    result.annotatedScreenshots.forEach(screenshot => {
      console.log(`  - Step ${screenshot.stepNumber}: ${screenshot.title}`);
      console.log(`    ${screenshot.path}`);
    });

  } catch (error) {
    console.error('\n❌ Pipeline Failed:');
    console.error(`   ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testFullPipeline().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
