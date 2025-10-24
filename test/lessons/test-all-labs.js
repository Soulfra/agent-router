#!/usr/bin/env node
/**
 * Test All Labs - Lab Test Suite
 *
 * Comprehensive test suite that verifies:
 * - All 20 lab HTML files exist
 * - Proper HTML structure
 * - fetch() calls use correct endpoints
 * - localStorage implementation
 * - Error handling
 * - CSS (dark theme, responsive)
 * - Generates coverage report
 *
 * Usage:
 *   node test/lessons/test-all-labs.js
 *   npm run test:labs
 */

const fs = require('fs');
const path = require('path');

// Configuration
const LABS_DIR = path.join(__dirname, '../../public/labs');
const EXPECTED_LAB_COUNT = 20;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: [],
  coverage: {}
};

/**
 * Expected lab files
 */
const expectedLabs = [
  // MCP Development Labs
  { file: 'mcp-client.html', category: 'MCP', features: ['fetch', 'localStorage', 'error-handling'] },
  { file: 'mcp-custom-tool.html', category: 'MCP', features: ['fetch', 'localStorage', 'form-validation'] },
  { file: 'mcp-rpg-xp.html', category: 'MCP', features: ['fetch', 'localStorage', 'real-time-updates'] },
  { file: 'mcp-file-manager.html', category: 'MCP', features: ['fetch', 'localStorage', 'file-operations'] },
  { file: 'mcp-code-search.html', category: 'MCP', features: ['fetch', 'localStorage', 'syntax-highlighting'] },
  { file: 'mcp-privacy-audit.html', category: 'MCP', features: ['fetch', 'localStorage', 'data-validation'] },
  { file: 'mcp-deployment.html', category: 'MCP', features: ['fetch', 'localStorage', 'deployment-status'] },
  { file: 'mcp-test-suite.html', category: 'MCP', features: ['fetch', 'localStorage', 'test-runner'] },

  // RPG/Card Game Labs
  { file: 'card-opener.html', category: 'Card Game', features: ['fetch', 'localStorage', 'animations'] },
  { file: 'card-collection.html', category: 'Card Game', features: ['fetch', 'localStorage', 'grid-layout'] },
  { file: 'card-roasting.html', category: 'Card Game', features: ['fetch', 'localStorage', 'voting-system'] },
  { file: 'rpg-dashboard.html', category: 'RPG', features: ['fetch', 'localStorage', 'real-time-stats'] },
  { file: 'rpg-complete.html', category: 'RPG', features: ['fetch', 'localStorage', 'game-loop'] },

  // Zero-Dependency Labs
  { file: 'schema-validator.html', category: 'Zero-Dep', features: ['fetch', 'localStorage', 'validation'] },
  { file: 'privacy-checker.html', category: 'Zero-Dep', features: ['fetch', 'localStorage', 'privacy-scan'] },
  { file: 'zero-dep-builder.html', category: 'Zero-Dep', features: ['fetch', 'localStorage', 'build-process'] },

  // Multi-Tier System Labs
  { file: 'tier-checker.html', category: 'Multi-Tier', features: ['fetch', 'localStorage', 'tier-display'] },
  { file: 'byok-manager.html', category: 'Multi-Tier', features: ['fetch', 'localStorage', 'key-management'] },
  { file: 'billing-dashboard.html', category: 'Multi-Tier', features: ['fetch', 'localStorage', 'charts'] },
  { file: 'multi-project.html', category: 'Multi-Tier', features: ['fetch', 'localStorage', 'project-switcher'] }
];

/**
 * Test: Verify all lab files exist
 */
function testLabFilesExist() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Checking if all ${EXPECTED_LAB_COUNT} lab files exist...`);

  let passed = 0;
  let failed = 0;

  expectedLabs.forEach(lab => {
    const filepath = path.join(LABS_DIR, lab.file);

    if (fs.existsSync(filepath)) {
      console.log(`  ${colors.green}✓${colors.reset} ${lab.file}`);
      passed++;
    } else {
      console.log(`  ${colors.red}✗${colors.reset} ${lab.file} - NOT FOUND`);
      results.errors.push(`Missing lab file: ${lab.file}`);
      failed++;
    }
  });

  results.passed += passed;
  results.failed += failed;

  console.log(`\n  Result: ${passed}/${EXPECTED_LAB_COUNT} labs found`);
}

/**
 * Test: Verify HTML structure
 */
function testHTMLStructure() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Validating HTML structure...`);

  expectedLabs.forEach(lab => {
    const filepath = path.join(LABS_DIR, lab.file);

    if (!fs.existsSync(filepath)) {
      return;
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const errors = [];

    // Check for required HTML elements
    const requiredElements = [
      '<!DOCTYPE html>',
      '<html',
      '<head>',
      '<body>',
      '<title>',
      '<meta charset',
      '<meta name="viewport"'
    ];

    requiredElements.forEach(element => {
      if (!content.includes(element)) {
        errors.push(`Missing element: ${element}`);
      }
    });

    // Check for script tag
    if (!content.includes('<script>') && !content.includes('<script src=')) {
      errors.push('No JavaScript found');
    }

    // Check for style tag or CSS
    if (!content.includes('<style>') && !content.includes('<link rel="stylesheet"')) {
      errors.push('No CSS found');
    }

    if (errors.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} ${lab.file}`);
      results.passed++;
    } else {
      console.log(`  ${colors.red}✗${colors.reset} ${lab.file}`);
      errors.forEach(err => {
        console.log(`    - ${err}`);
        results.errors.push(`${lab.file}: ${err}`);
      });
      results.failed++;
    }
  });
}

/**
 * Test: Validate fetch() calls
 */
function testFetchCalls() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Checking fetch() API calls...`);

  expectedLabs.forEach(lab => {
    const filepath = path.join(LABS_DIR, lab.file);

    if (!fs.existsSync(filepath)) {
      return;
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const warnings = [];

    // Check for fetch() calls
    const fetchMatches = content.match(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/g);

    if (lab.features.includes('fetch')) {
      if (!fetchMatches || fetchMatches.length === 0) {
        warnings.push('Expected fetch() calls but none found');
      } else {
        // Validate endpoints
        fetchMatches.forEach(match => {
          const urlMatch = match.match(/['"`]([^'"`]+)['"`]/);
          if (urlMatch) {
            const url = urlMatch[1];
            const validPrefixes = ['/api/', 'http://localhost:', 'https://'];
            const isValid = validPrefixes.some(prefix => url.startsWith(prefix));

            if (!isValid) {
              warnings.push(`Potentially invalid fetch URL: ${url}`);
            }
          }
        });
      }
    }

    // Check for error handling
    if (fetchMatches && fetchMatches.length > 0) {
      const hasCatch = content.includes('.catch(') || content.includes('try {');
      if (!hasCatch) {
        warnings.push('fetch() calls missing error handling');
      }
    }

    if (warnings.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} ${lab.file}`);
      results.passed++;
      results.coverage[lab.file] = { fetch: true };
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} ${lab.file}`);
      warnings.forEach(warn => {
        console.log(`    - ${warn}`);
      });
      results.warnings += warnings.length;
      results.coverage[lab.file] = { fetch: false };
    }
  });
}

/**
 * Test: Validate localStorage usage
 */
function testLocalStorage() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Checking localStorage implementation...`);

  expectedLabs.forEach(lab => {
    const filepath = path.join(LABS_DIR, lab.file);

    if (!fs.existsSync(filepath)) {
      return;
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const warnings = [];

    if (lab.features.includes('localStorage')) {
      const hasGetItem = content.includes('localStorage.getItem');
      const hasSetItem = content.includes('localStorage.setItem');

      if (!hasGetItem && !hasSetItem) {
        warnings.push('Expected localStorage usage but none found');
      }

      // Check for try-catch around localStorage (some browsers block it)
      const hasErrorHandling = content.includes('try {') && content.includes('localStorage');
      if (!hasErrorHandling) {
        warnings.push('localStorage should have error handling for privacy mode');
      }
    }

    if (warnings.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} ${lab.file}`);
      results.passed++;
      if (!results.coverage[lab.file]) results.coverage[lab.file] = {};
      results.coverage[lab.file].localStorage = true;
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} ${lab.file}`);
      warnings.forEach(warn => {
        console.log(`    - ${warn}`);
      });
      results.warnings += warnings.length;
      if (!results.coverage[lab.file]) results.coverage[lab.file] = {};
      results.coverage[lab.file].localStorage = false;
    }
  });
}

/**
 * Test: Validate error handling
 */
function testErrorHandling() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Checking error handling...`);

  expectedLabs.forEach(lab => {
    const filepath = path.join(LABS_DIR, lab.file);

    if (!fs.existsSync(filepath)) {
      return;
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const warnings = [];

    if (lab.features.includes('error-handling')) {
      const hasTryCatch = content.includes('try {') && content.includes('catch');
      const hasCatchMethod = content.includes('.catch(');

      if (!hasTryCatch && !hasCatchMethod) {
        warnings.push('Expected error handling but none found');
      }

      // Check for user-friendly error messages
      const hasErrorDisplay = content.includes('alert(') ||
                             content.includes('console.error') ||
                             content.includes('innerHTML') && content.includes('error');

      if (!hasErrorDisplay) {
        warnings.push('Should display error messages to user');
      }
    }

    if (warnings.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} ${lab.file}`);
      results.passed++;
      if (!results.coverage[lab.file]) results.coverage[lab.file] = {};
      results.coverage[lab.file].errorHandling = true;
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} ${lab.file}`);
      warnings.forEach(warn => {
        console.log(`    - ${warn}`);
      });
      results.warnings += warnings.length;
      if (!results.coverage[lab.file]) results.coverage[lab.file] = {};
      results.coverage[lab.file].errorHandling = false;
    }
  });
}

/**
 * Test: Validate CSS (dark theme, responsive)
 */
function testCSS() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Checking CSS (dark theme, responsive)...`);

  expectedLabs.forEach(lab => {
    const filepath = path.join(LABS_DIR, lab.file);

    if (!fs.existsSync(filepath)) {
      return;
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const warnings = [];

    // Check for dark theme colors
    const darkThemeColors = ['#1a1a1a', '#2a2a2a', '#333', 'rgb(26', 'background-color'];
    const hasDarkTheme = darkThemeColors.some(color => content.includes(color));

    if (!hasDarkTheme) {
      warnings.push('Should implement dark theme');
    }

    // Check for responsive design
    const hasMediaQuery = content.includes('@media');
    const hasViewport = content.includes('viewport');

    if (!hasMediaQuery && !hasViewport) {
      warnings.push('Should be responsive (media queries or viewport)');
    }

    // Check for flexbox or grid
    const hasModernCSS = content.includes('display: flex') ||
                        content.includes('display: grid') ||
                        content.includes('display:flex') ||
                        content.includes('display:grid');

    if (!hasModernCSS) {
      warnings.push('Consider using flexbox or grid for layout');
    }

    if (warnings.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} ${lab.file}`);
      results.passed++;
      if (!results.coverage[lab.file]) results.coverage[lab.file] = {};
      results.coverage[lab.file].css = true;
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} ${lab.file}`);
      warnings.forEach(warn => {
        console.log(`    - ${warn}`);
      });
      results.warnings += warnings.length;
      if (!results.coverage[lab.file]) results.coverage[lab.file] = {};
      results.coverage[lab.file].css = false;
    }
  });
}

/**
 * Generate coverage report
 */
function generateReport() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${colors.magenta}LAB TEST REPORT${colors.reset}`);
  console.log(`${'='.repeat(70)}\n`);

  const total = results.passed + results.failed;
  const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;

  console.log(`${colors.green}Passed:${colors.reset}   ${results.passed}`);
  console.log(`${colors.red}Failed:${colors.reset}   ${results.failed}`);
  console.log(`${colors.yellow}Warnings:${colors.reset} ${results.warnings}`);
  console.log(`${colors.cyan}Pass Rate:${colors.reset} ${passRate}%\n`);

  // Coverage summary
  console.log(`${colors.magenta}FEATURE COVERAGE:${colors.reset}\n`);

  const features = ['fetch', 'localStorage', 'errorHandling', 'css'];
  features.forEach(feature => {
    const covered = Object.values(results.coverage).filter(c => c[feature]).length;
    const total = Object.keys(results.coverage).length;
    const percentage = total > 0 ? ((covered / total) * 100).toFixed(1) : 0;
    console.log(`  ${feature.padEnd(20)} ${covered}/${total} (${percentage}%)`);
  });

  if (results.errors.length > 0) {
    console.log(`\n${colors.red}ERRORS:${colors.reset}`);
    results.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`);
    });
    console.log('');
  }

  const reportPath = path.join(__dirname, 'lab-test-report.txt');
  const reportContent = `
CALOS LAB TEST REPORT
Generated: ${new Date().toISOString()}
${'='.repeat(70)}

SUMMARY:
  Passed:   ${results.passed}
  Failed:   ${results.failed}
  Warnings: ${results.warnings}
  Pass Rate: ${passRate}%

FEATURE COVERAGE:
${features.map(f => {
  const covered = Object.values(results.coverage).filter(c => c[f]).length;
  const total = Object.keys(results.coverage).length;
  const percentage = total > 0 ? ((covered / total) * 100).toFixed(1) : 0;
  return `  ${f.padEnd(20)} ${covered}/${total} (${percentage}%)`;
}).join('\n')}

ERRORS:
${results.errors.map((err, i) => `  ${i + 1}. ${err}`).join('\n')}

EXPECTED LABS (${EXPECTED_LAB_COUNT}):
${expectedLabs.map((l, i) => `  ${i + 1}. ${l.file} (${l.category})`).join('\n')}
`;

  fs.writeFileSync(reportPath, reportContent);
  console.log(`${colors.cyan}Report saved to:${colors.reset} ${reportPath}\n`);

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

/**
 * Main test runner
 */
function main() {
  console.log(`\n${colors.magenta}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.magenta}CALOS LAB SYSTEM - COMPREHENSIVE TEST SUITE${colors.reset}`);
  console.log(`${colors.magenta}${'='.repeat(70)}${colors.reset}\n`);

  console.log(`Expected labs: ${EXPECTED_LAB_COUNT}`);
  console.log(`Labs directory: ${LABS_DIR}\n`);

  // Run all tests
  testLabFilesExist();
  testHTMLStructure();
  testFetchCalls();
  testLocalStorage();
  testErrorHandling();
  testCSS();

  // Generate report
  generateReport();
}

// Run tests
main();
