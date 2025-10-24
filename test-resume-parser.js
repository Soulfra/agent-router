#!/usr/bin/env node

/**
 * Test Resume Parser with new pdf.js-extract
 */

const ResumeParser = require('./lib/resume-parser');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  📄 Resume Parser Test                        ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');

  // Test 1: Module loads without crashing
  console.log('✓ Test 1: Module loaded successfully (no DOMMatrix error!)');
  console.log('');

  const parser = new ResumeParser();
  console.log('✓ Test 2: Parser instance created');
  console.log('');

  // Test 3: Check for test PDF files
  console.log('Test 3: Looking for test PDF files...');
  const possibleTestPaths = [
    './test/fixtures/sample-resume.pdf',
    './uploads/test-resume.pdf',
    '/tmp/test-resume.pdf'
  ];

  let testPdf = null;
  for (const testPath of possibleTestPaths) {
    if (fs.existsSync(testPath)) {
      testPdf = testPath;
      console.log(`  ✓ Found test PDF: ${testPath}`);
      break;
    }
  }

  if (!testPdf) {
    console.log('  ⚠️  No test PDF found. Skipping actual parsing test.');
    console.log('');
    console.log('To test PDF parsing, place a PDF resume at one of these paths:');
    possibleTestPaths.forEach(p => console.log(`  - ${p}`));
    console.log('');
    console.log('✅ Module loading test PASSED');
    console.log('   (This was the main issue - pdf-parse caused crash on require())');
    return;
  }

  // Test 4: Actually parse a PDF
  console.log('');
  console.log('Test 4: Parsing PDF resume...');

  try {
    const result = await parser.parseResume(testPdf);

    console.log('  ✓ PDF parsed successfully!');
    console.log('');
    console.log('  Parsed data:');
    console.log(`    - Text length: ${result.rawText.length} chars`);
    console.log(`    - Word count: ${result.wordCount}`);
    console.log(`    - Email: ${result.contact.email || 'not found'}`);
    console.log(`    - Phone: ${result.contact.phone || 'not found'}`);
    console.log(`    - Skills found: ${result.skills.length}`);
    console.log(`    - Experience entries: ${result.experience.length}`);
    console.log(`    - Education entries: ${result.education.length}`);
    console.log('');
    console.log('  First 200 chars of text:');
    console.log(`    "${result.rawText.substring(0, 200)}..."`);
    console.log('');
    console.log('✅ All tests PASSED');

  } catch (error) {
    console.error('  ❌ PDF parsing failed:', error.message);
    console.error('');
    console.error('Error details:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('');
  console.error('❌ Test failed:', error);
  console.error('');
  process.exit(1);
});
