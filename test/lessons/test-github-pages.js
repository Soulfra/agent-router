#!/usr/bin/env node
/**
 * Test GitHub Pages Deployment
 *
 * Verifies GitHub Pages deployment readiness:
 * - CNAME file exists
 * - sitemap.xml format
 * - robots.txt validation
 * - lessons.json structure
 * - Service Worker registration
 * - app.js router validation
 * - Offline capability
 *
 * Usage:
 *   node test/lessons/test-github-pages.js
 *   npm run test:github-pages
 */

const fs = require('fs');
const path = require('path');

// Configuration
const PUBLIC_DIR = path.join(__dirname, '../../public');
const LESSONS_DIR = path.join(PUBLIC_DIR, 'lessons');
const LABS_DIR = path.join(PUBLIC_DIR, 'labs');

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
  errors: []
};

/**
 * Test: CNAME file exists
 */
function testCNAME() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Checking CNAME file...`);

  const cnamePath = path.join(PUBLIC_DIR, 'CNAME');

  if (fs.existsSync(cnamePath)) {
    const content = fs.readFileSync(cnamePath, 'utf8').trim();

    if (content && content.match(/^[a-z0-9.-]+\.[a-z]{2,}$/i)) {
      console.log(`  ${colors.green}✓${colors.reset} CNAME exists: ${content}`);
      results.passed++;
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} CNAME exists but format looks invalid: ${content}`);
      results.warnings++;
    }
  } else {
    console.log(`  ${colors.yellow}⚠${colors.reset} CNAME file not found (optional for GitHub Pages)`);
    results.warnings++;
  }
}

/**
 * Test: sitemap.xml format
 */
function testSitemap() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Validating sitemap.xml...`);

  const sitemapPath = path.join(PUBLIC_DIR, 'sitemap.xml');

  if (fs.existsSync(sitemapPath)) {
    const content = fs.readFileSync(sitemapPath, 'utf8');
    const errors = [];

    // Check XML format
    if (!content.includes('<?xml version')) {
      errors.push('Missing XML declaration');
    }

    if (!content.includes('<urlset')) {
      errors.push('Missing <urlset> tag');
    }

    // Check for URLs
    const urlMatches = content.match(/<url>/g);
    if (!urlMatches || urlMatches.length === 0) {
      errors.push('No URLs found in sitemap');
    } else {
      console.log(`  Found ${urlMatches.length} URLs in sitemap`);
    }

    // Check for required elements
    const requiredElements = ['<loc>', '<lastmod>', '<changefreq>', '<priority>'];
    requiredElements.forEach(element => {
      if (!content.includes(element)) {
        errors.push(`Missing recommended element: ${element}`);
      }
    });

    if (errors.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} sitemap.xml is valid`);
      results.passed++;
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} sitemap.xml has issues`);
      errors.forEach(err => {
        console.log(`    - ${err}`);
        results.errors.push(`sitemap.xml: ${err}`);
      });
      results.warnings += errors.length;
    }
  } else {
    console.log(`  ${colors.yellow}⚠${colors.reset} sitemap.xml not found (recommended for SEO)`);
    results.warnings++;
  }
}

/**
 * Test: robots.txt validation
 */
function testRobotsTxt() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Validating robots.txt...`);

  const robotsPath = path.join(PUBLIC_DIR, 'robots.txt');

  if (fs.existsSync(robotsPath)) {
    const content = fs.readFileSync(robotsPath, 'utf8');
    const warnings = [];

    // Check for User-agent
    if (!content.includes('User-agent:')) {
      warnings.push('Missing User-agent directive');
    }

    // Check for sitemap reference
    if (!content.includes('Sitemap:')) {
      warnings.push('Should reference sitemap.xml');
    }

    // Check for disallow rules
    if (content.includes('Disallow: /')) {
      warnings.push('Warning: Blocking all crawlers');
    }

    if (warnings.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} robots.txt is valid`);
      results.passed++;
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} robots.txt has recommendations`);
      warnings.forEach(warn => {
        console.log(`    - ${warn}`);
      });
      results.warnings += warnings.length;
    }
  } else {
    console.log(`  ${colors.yellow}⚠${colors.reset} robots.txt not found (recommended)`);
    results.warnings++;
  }
}

/**
 * Test: lessons.json structure
 */
function testLessonsJSON() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Validating lessons.json structure...`);

  const jsonPath = path.join(PUBLIC_DIR, 'lessons.json');

  if (fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, 'utf8');
      const data = JSON.parse(content);
      const errors = [];

      // Check structure
      if (!data.lessons || !Array.isArray(data.lessons)) {
        errors.push('Missing or invalid "lessons" array');
      } else {
        // Validate lesson objects
        data.lessons.forEach((lesson, index) => {
          const required = ['id', 'title', 'slug', 'xp', 'category'];
          required.forEach(field => {
            if (!lesson[field]) {
              errors.push(`Lesson ${index}: Missing required field "${field}"`);
            }
          });
        });

        console.log(`  Found ${data.lessons.length} lessons in JSON`);
      }

      // Check metadata
      if (!data.metadata) {
        errors.push('Missing metadata object');
      }

      if (errors.length === 0) {
        console.log(`  ${colors.green}✓${colors.reset} lessons.json is valid`);
        results.passed++;
      } else {
        console.log(`  ${colors.red}✗${colors.reset} lessons.json has errors`);
        errors.forEach(err => {
          console.log(`    - ${err}`);
          results.errors.push(`lessons.json: ${err}`);
        });
        results.failed++;
      }
    } catch (error) {
      console.log(`  ${colors.red}✗${colors.reset} lessons.json parse error: ${error.message}`);
      results.errors.push(`lessons.json: ${error.message}`);
      results.failed++;
    }
  } else {
    console.log(`  ${colors.yellow}⚠${colors.reset} lessons.json not found (recommended for API)`);
    results.warnings++;
  }
}

/**
 * Test: Service Worker registration
 */
function testServiceWorker() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Checking Service Worker...`);

  const swPath = path.join(PUBLIC_DIR, 'sw.js');
  const indexPath = path.join(PUBLIC_DIR, 'index.html');

  if (fs.existsSync(swPath)) {
    const swContent = fs.readFileSync(swPath, 'utf8');
    const warnings = [];

    // Check for cache name
    if (!swContent.includes('CACHE_NAME')) {
      warnings.push('Should define CACHE_NAME');
    }

    // Check for install event
    if (!swContent.includes('install')) {
      warnings.push('Should handle install event');
    }

    // Check for fetch event
    if (!swContent.includes('fetch')) {
      warnings.push('Should handle fetch event for offline support');
    }

    // Check if registered in index.html
    if (fs.existsSync(indexPath)) {
      const indexContent = fs.readFileSync(indexPath, 'utf8');
      if (!indexContent.includes('serviceWorker.register')) {
        warnings.push('Service Worker not registered in index.html');
      }
    }

    if (warnings.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} Service Worker is configured`);
      results.passed++;
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} Service Worker needs improvement`);
      warnings.forEach(warn => {
        console.log(`    - ${warn}`);
      });
      results.warnings += warnings.length;
    }
  } else {
    console.log(`  ${colors.yellow}⚠${colors.reset} Service Worker not found (recommended for offline)`);
    results.warnings++;
  }
}

/**
 * Test: app.js router validation
 */
function testAppRouter() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Validating app.js router...`);

  const appPath = path.join(PUBLIC_DIR, 'app.js');

  if (fs.existsSync(appPath)) {
    const content = fs.readFileSync(appPath, 'utf8');
    const warnings = [];

    // Check for router function
    if (!content.includes('function') && !content.includes('=>')) {
      warnings.push('No functions found in app.js');
    }

    // Check for route handling
    const routeKeywords = ['route', 'path', 'navigate', 'hash', 'history'];
    const hasRouting = routeKeywords.some(keyword => content.includes(keyword));

    if (!hasRouting) {
      warnings.push('No routing logic detected');
    }

    // Check for lesson loading
    if (!content.includes('lesson') && !content.includes('load')) {
      warnings.push('Should handle lesson loading');
    }

    // Check for error handling
    if (!content.includes('catch') && !content.includes('error')) {
      warnings.push('Should include error handling');
    }

    if (warnings.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} app.js router is configured`);
      results.passed++;
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} app.js router needs improvement`);
      warnings.forEach(warn => {
        console.log(`    - ${warn}`);
      });
      results.warnings += warnings.length;
    }
  } else {
    console.log(`  ${colors.red}✗${colors.reset} app.js not found (required)`);
    results.errors.push('Missing app.js');
    results.failed++;
  }
}

/**
 * Test: Offline capability
 */
function testOfflineCapability() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Checking offline capability...`);

  const warnings = [];

  // Check for manifest.json
  const manifestPath = path.join(PUBLIC_DIR, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Check required fields
      const required = ['name', 'short_name', 'start_url', 'display'];
      required.forEach(field => {
        if (!manifest[field]) {
          warnings.push(`manifest.json missing: ${field}`);
        }
      });

      // Check for icons
      if (!manifest.icons || manifest.icons.length === 0) {
        warnings.push('manifest.json should include icons');
      }

      console.log(`  ${colors.green}✓${colors.reset} manifest.json exists`);
    } catch (error) {
      warnings.push(`manifest.json parse error: ${error.message}`);
    }
  } else {
    warnings.push('manifest.json not found (recommended for PWA)');
  }

  // Check for service worker
  const swPath = path.join(PUBLIC_DIR, 'sw.js');
  if (!fs.existsSync(swPath)) {
    warnings.push('Service Worker required for offline support');
  }

  if (warnings.length === 0) {
    console.log(`  ${colors.green}✓${colors.reset} Offline capability configured`);
    results.passed++;
  } else {
    console.log(`  ${colors.yellow}⚠${colors.reset} Offline capability needs improvement`);
    warnings.forEach(warn => {
      console.log(`    - ${warn}`);
    });
    results.warnings += warnings.length;
  }
}

/**
 * Test: File structure
 */
function testFileStructure() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Validating file structure...`);

  const requiredDirs = [
    { path: LESSONS_DIR, name: 'lessons' },
    { path: LABS_DIR, name: 'labs' }
  ];

  let allExist = true;

  requiredDirs.forEach(dir => {
    if (fs.existsSync(dir.path)) {
      const files = fs.readdirSync(dir.path);
      console.log(`  ${colors.green}✓${colors.reset} ${dir.name}/ (${files.length} files)`);
    } else {
      console.log(`  ${colors.red}✗${colors.reset} ${dir.name}/ NOT FOUND`);
      results.errors.push(`Missing directory: ${dir.name}`);
      allExist = false;
    }
  });

  if (allExist) {
    results.passed++;
  } else {
    results.failed++;
  }
}

/**
 * Generate deployment report
 */
function generateReport() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${colors.magenta}GITHUB PAGES DEPLOYMENT TEST REPORT${colors.reset}`);
  console.log(`${'='.repeat(70)}\n`);

  const total = results.passed + results.failed;
  const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;

  console.log(`${colors.green}Passed:${colors.reset}   ${results.passed}`);
  console.log(`${colors.red}Failed:${colors.reset}   ${results.failed}`);
  console.log(`${colors.yellow}Warnings:${colors.reset} ${results.warnings}`);
  console.log(`${colors.cyan}Pass Rate:${colors.reset} ${passRate}%\n`);

  if (results.errors.length > 0) {
    console.log(`${colors.red}ERRORS:${colors.reset}`);
    results.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`);
    });
    console.log('');
  }

  console.log(`${colors.cyan}DEPLOYMENT CHECKLIST:${colors.reset}\n`);
  console.log(`  [ ] CNAME file (optional)`);
  console.log(`  [ ] sitemap.xml (recommended)`);
  console.log(`  [ ] robots.txt (recommended)`);
  console.log(`  [ ] lessons.json (recommended)`);
  console.log(`  [ ] Service Worker (offline support)`);
  console.log(`  [ ] app.js (required)`);
  console.log(`  [ ] manifest.json (PWA support)`);
  console.log(`  [ ] File structure (lessons/, labs/)\n`);

  const reportPath = path.join(__dirname, 'github-pages-report.txt');
  const reportContent = `
CALOS GITHUB PAGES DEPLOYMENT REPORT
Generated: ${new Date().toISOString()}
${'='.repeat(70)}

SUMMARY:
  Passed:   ${results.passed}
  Failed:   ${results.failed}
  Warnings: ${results.warnings}
  Pass Rate: ${passRate}%

ERRORS:
${results.errors.map((err, i) => `  ${i + 1}. ${err}`).join('\n') || '  None'}

DEPLOYMENT CHECKLIST:
  [ ] CNAME file (optional)
  [ ] sitemap.xml (recommended)
  [ ] robots.txt (recommended)
  [ ] lessons.json (recommended)
  [ ] Service Worker (offline support)
  [ ] app.js (required)
  [ ] manifest.json (PWA support)
  [ ] File structure (lessons/, labs/)

NEXT STEPS:
  1. Commit all files to repository
  2. Push to GitHub
  3. Enable GitHub Pages in repository settings
  4. Set source to main branch / docs folder (or root)
  5. Configure custom domain if using CNAME
  6. Test deployment at: https://[username].github.io/[repo]/
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
  console.log(`${colors.magenta}CALOS GITHUB PAGES DEPLOYMENT TEST${colors.reset}`);
  console.log(`${colors.magenta}${'='.repeat(70)}${colors.reset}\n`);

  console.log(`Public directory: ${PUBLIC_DIR}\n`);

  // Run all tests
  testCNAME();
  testSitemap();
  testRobotsTxt();
  testLessonsJSON();
  testServiceWorker();
  testAppRouter();
  testOfflineCapability();
  testFileStructure();

  // Generate report
  generateReport();
}

// Run tests
main();
