#!/usr/bin/env node

/**
 * Test script for OCR credential extraction
 * Tests the screenshot-ocr.js module on existing screenshots
 */

const path = require('path');
const ScreenshotOCR = require('../lib/screenshot-ocr');

async function testOCRExtraction() {
  console.log('='.repeat(80));
  console.log('Testing OCR Credential Extraction');
  console.log('='.repeat(80));

  const ocr = new ScreenshotOCR();

  // Test screenshots
  const testScreenshots = [
    path.join(__dirname, '../oauth-exports/github-tutorial-demo.gif'), // Will fail - GIF not supported
    path.join(__dirname, '../oauth-exports/demo/frame-5.png'),
    path.join(__dirname, '../oauth-exports/demo/frame-4.png'),
    path.join(__dirname, '../oauth-exports/demo/palette.png')
  ];

  for (const screenshotPath of testScreenshots) {
    console.log('\n' + '-'.repeat(80));
    console.log(`Testing: ${path.basename(screenshotPath)}`);
    console.log('-'.repeat(80));

    try {
      // Extract plain text
      console.log('\n[1] Extracting plain text...');
      const text = await ocr.extractText(screenshotPath);
      console.log('Extracted text:');
      console.log(text.substring(0, 500)); // First 500 chars

      // Find credentials
      console.log('\n[2] Searching for credentials...');
      const credentials = await ocr.findCredentials(text);
      console.log('Found credentials:');
      console.log(`  Provider: ${credentials.provider || 'unknown'}`);
      console.log(`  Client ID: ${credentials.clientId || 'NOT FOUND'}`);
      console.log(`  Client Secret: ${credentials.clientSecret ? '*'.repeat(20) : 'NOT FOUND'}`);

      // Extract with coordinates (HOCR)
      console.log('\n[3] Extracting text with coordinates (HOCR)...');
      const elements = await ocr.extractWithCoordinates(screenshotPath);
      console.log(`Found ${elements.length} text elements`);

      if (elements.length > 0) {
        console.log('Sample elements:');
        elements.slice(0, 5).forEach(el => {
          console.log(`  "${el.text}" at (${el.bbox.x}, ${el.bbox.y}) confidence: ${el.confidence}`);
        });
      }

      // Find buttons
      console.log('\n[4] Detecting buttons...');
      const buttons = await ocr.findButtons(elements);
      console.log(`Found ${buttons.length} buttons:`);
      buttons.forEach(btn => {
        console.log(`  - "${btn.text}" at (${btn.bbox.x}, ${btn.bbox.y}) ${btn.bbox.width}x${btn.bbox.height}`);
      });

      // Find form fields
      console.log('\n[5] Detecting form fields...');
      const formFields = await ocr.findFormFields(elements);
      console.log(`Found ${formFields.length} form fields:`);
      formFields.forEach(field => {
        console.log(`  - "${field.label}" (${field.matchedLabel}) at (${field.bbox.x}, ${field.bbox.y})`);
      });

    } catch (error) {
      console.error(`\n❌ Error processing ${path.basename(screenshotPath)}:`);
      console.error(`   ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('Test Complete');
  console.log('='.repeat(80));
}

// Run test
testOCRExtraction().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
