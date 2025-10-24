#!/usr/bin/env node
/**
 * Verify Lesson System - One-Click Verification
 *
 * Comprehensive system verification:
 * - Counts all files (lessons, labs, docs)
 * - Calculates total XP
 * - Checks file sizes
 * - Validates all links
 * - Generates report with statistics
 * - Exit code 0 if all pass, 1 if any fail
 *
 * Usage:
 *   node scripts/verify-lesson-system.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const LESSONS_DIR = path.join(PUBLIC_DIR, 'lessons');
const LABS_DIR = path.join(PUBLIC_DIR, 'labs');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Verification results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: [],
  stats: {
    lessonCount: 0,
    labCount: 0,
    docCount: 0,
    totalXP: 0,
    totalSize: 0,
    categories: {}
  }
};

/**
 * Count and verify lesson files
 */
function verifyLessons() {
  console.log(`\n${colors.cyan}${colors.bold}[1/6] Verifying Lesson Files${colors.reset}`);
  console.log(`${'─'.repeat(70)}`);

  if (!fs.existsSync(LESSONS_DIR)) {
    console.log(`  ${colors.red}✗${colors.reset} Lessons directory not found: ${LESSONS_DIR}`);
    results.errors.push('Lessons directory missing');
    results.failed++;
    return;
  }

  const files = fs.readdirSync(LESSONS_DIR).filter(f => f.endsWith('.md'));
  results.stats.lessonCount = files.length;

  console.log(`  ${colors.green}✓${colors.reset} Found ${files.length} lesson files`);

  // Calculate total XP and size
  let totalXP = 0;
  let totalSize = 0;
  const categories = {};

  files.forEach(file => {
    const filepath = path.join(LESSONS_DIR, file);
    const content = fs.readFileSync(filepath, 'utf8');
    const stats = fs.statSync(filepath);

    totalSize += stats.size;

    // Extract XP value
    const xpMatch = content.match(/(\d+)\s*XP/);
    if (xpMatch) {
      totalXP += parseInt(xpMatch[1]);
    }

    // Extract category
    const categoryMatch = content.match(/Category:\s*([^\n]+)/);
    if (categoryMatch) {
      const category = categoryMatch[1].trim();
      categories[category] = (categories[category] || 0) + 1;
    }
  });

  results.stats.totalXP = totalXP;
  results.stats.totalSize += totalSize;
  results.stats.categories = categories;

  console.log(`  ${colors.cyan}→${colors.reset} Total XP: ${totalXP.toLocaleString()}`);
  console.log(`  ${colors.cyan}→${colors.reset} Total size: ${(totalSize / 1024).toFixed(2)} KB`);
  console.log(`  ${colors.cyan}→${colors.reset} Categories: ${Object.keys(categories).length}`);

  Object.entries(categories).forEach(([cat, count]) => {
    console.log(`    - ${cat}: ${count} lessons`);
  });

  results.passed++;
}

/**
 * Count and verify lab files
 */
function verifyLabs() {
  console.log(`\n${colors.cyan}${colors.bold}[2/6] Verifying Lab Files${colors.reset}`);
  console.log(`${'─'.repeat(70)}`);

  if (!fs.existsSync(LABS_DIR)) {
    console.log(`  ${colors.red}✗${colors.reset} Labs directory not found: ${LABS_DIR}`);
    results.errors.push('Labs directory missing');
    results.failed++;
    return;
  }

  const files = fs.readdirSync(LABS_DIR).filter(f => f.endsWith('.html'));
  results.stats.labCount = files.length;

  console.log(`  ${colors.green}✓${colors.reset} Found ${files.length} lab files`);

  // Calculate total size
  let totalSize = 0;
  const labCategories = {
    'MCP': 0,
    'Card Game': 0,
    'RPG': 0,
    'Zero-Dep': 0,
    'Multi-Tier': 0
  };

  files.forEach(file => {
    const filepath = path.join(LABS_DIR, file);
    const stats = fs.statSync(filepath);
    totalSize += stats.size;

    // Categorize by filename
    if (file.startsWith('mcp-')) labCategories['MCP']++;
    else if (file.startsWith('card-')) labCategories['Card Game']++;
    else if (file.startsWith('rpg-')) labCategories['RPG']++;
    else if (file.includes('schema') || file.includes('privacy') || file.includes('zero')) labCategories['Zero-Dep']++;
    else if (file.includes('tier') || file.includes('byok') || file.includes('billing') || file.includes('project')) labCategories['Multi-Tier']++;
  });

  results.stats.totalSize += totalSize;

  console.log(`  ${colors.cyan}→${colors.reset} Total size: ${(totalSize / 1024).toFixed(2)} KB`);
  console.log(`  ${colors.cyan}→${colors.reset} Lab categories:`);

  Object.entries(labCategories).forEach(([cat, count]) => {
    if (count > 0) {
      console.log(`    - ${cat}: ${count} labs`);
    }
  });

  results.passed++;
}

/**
 * Count and verify documentation files
 */
function verifyDocs() {
  console.log(`\n${colors.cyan}${colors.bold}[3/6] Verifying Documentation${colors.reset}`);
  console.log(`${'─'.repeat(70)}`);

  if (!fs.existsSync(DOCS_DIR)) {
    console.log(`  ${colors.yellow}⚠${colors.reset} Docs directory not found: ${DOCS_DIR}`);
    results.warnings++;
    return;
  }

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md'));
  results.stats.docCount = files.length;

  console.log(`  ${colors.green}✓${colors.reset} Found ${files.length} documentation files`);

  // Look for lesson-related docs
  const lessonDocs = files.filter(f =>
    f.toLowerCase().includes('lesson') ||
    f.toLowerCase().includes('learn') ||
    f.toLowerCase().includes('training')
  );

  if (lessonDocs.length > 0) {
    console.log(`  ${colors.cyan}→${colors.reset} Lesson-related docs: ${lessonDocs.length}`);
    lessonDocs.forEach(doc => {
      console.log(`    - ${doc}`);
    });
  }

  results.passed++;
}

/**
 * Validate internal links
 */
function validateLinks() {
  console.log(`\n${colors.cyan}${colors.bold}[4/6] Validating Internal Links${colors.reset}`);
  console.log(`${'─'.repeat(70)}`);

  if (!fs.existsSync(LESSONS_DIR)) {
    console.log(`  ${colors.yellow}⚠${colors.reset} Skipping - lessons directory not found`);
    results.warnings++;
    return;
  }

  const files = fs.readdirSync(LESSONS_DIR).filter(f => f.endsWith('.md'));
  let brokenLinks = 0;
  let totalLinks = 0;

  files.forEach(file => {
    const filepath = path.join(LESSONS_DIR, file);
    const content = fs.readFileSync(filepath, 'utf8');

    // Find all links
    const linkMatches = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
    linkMatches.forEach(link => {
      const urlMatch = link.match(/\(([^)]+)\)/);
      if (urlMatch) {
        const url = urlMatch[1];
        totalLinks++;

        // Check internal links
        if (url.startsWith('/') || url.startsWith('../')) {
          let linkPath = url.startsWith('/') ?
            path.join(PUBLIC_DIR, url) :
            path.join(path.dirname(filepath), url);

          // Remove hash/query
          linkPath = linkPath.split('#')[0].split('?')[0];

          if (!fs.existsSync(linkPath)) {
            console.log(`  ${colors.red}✗${colors.reset} Broken link in ${file}: ${url}`);
            results.errors.push(`Broken link: ${file} → ${url}`);
            brokenLinks++;
          }
        }
      }
    });
  });

  if (brokenLinks === 0) {
    console.log(`  ${colors.green}✓${colors.reset} All ${totalLinks} internal links valid`);
    results.passed++;
  } else {
    console.log(`  ${colors.red}✗${colors.reset} Found ${brokenLinks} broken links out of ${totalLinks} total`);
    results.failed++;
  }
}

/**
 * Check file sizes
 */
function checkFileSizes() {
  console.log(`\n${colors.cyan}${colors.bold}[5/6] Checking File Sizes${colors.reset}`);
  console.log(`${'─'.repeat(70)}`);

  const MAX_LESSON_SIZE = 100 * 1024; // 100 KB
  const MAX_LAB_SIZE = 200 * 1024; // 200 KB
  let oversizedFiles = 0;

  // Check lessons
  if (fs.existsSync(LESSONS_DIR)) {
    const lessons = fs.readdirSync(LESSONS_DIR).filter(f => f.endsWith('.md'));
    lessons.forEach(file => {
      const filepath = path.join(LESSONS_DIR, file);
      const stats = fs.statSync(filepath);

      if (stats.size > MAX_LESSON_SIZE) {
        console.log(`  ${colors.yellow}⚠${colors.reset} Large lesson: ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
        oversizedFiles++;
      }
    });
  }

  // Check labs
  if (fs.existsSync(LABS_DIR)) {
    const labs = fs.readdirSync(LABS_DIR).filter(f => f.endsWith('.html'));
    labs.forEach(file => {
      const filepath = path.join(LABS_DIR, file);
      const stats = fs.statSync(filepath);

      if (stats.size > MAX_LAB_SIZE) {
        console.log(`  ${colors.yellow}⚠${colors.reset} Large lab: ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
        oversizedFiles++;
      }
    });
  }

  if (oversizedFiles === 0) {
    console.log(`  ${colors.green}✓${colors.reset} All files within size limits`);
    results.passed++;
  } else {
    console.log(`  ${colors.yellow}⚠${colors.reset} Found ${oversizedFiles} large files (consider optimization)`);
    results.warnings += oversizedFiles;
  }
}

/**
 * Calculate statistics
 */
function calculateStatistics() {
  console.log(`\n${colors.cyan}${colors.bold}[6/6] Calculating Statistics${colors.reset}`);
  console.log(`${'─'.repeat(70)}`);

  console.log(`  ${colors.green}✓${colors.reset} Total lessons: ${results.stats.lessonCount}`);
  console.log(`  ${colors.green}✓${colors.reset} Total labs: ${results.stats.labCount}`);
  console.log(`  ${colors.green}✓${colors.reset} Total docs: ${results.stats.docCount}`);
  console.log(`  ${colors.green}✓${colors.reset} Total XP available: ${results.stats.totalXP.toLocaleString()}`);
  console.log(`  ${colors.green}✓${colors.reset} Total content size: ${(results.stats.totalSize / 1024).toFixed(2)} KB`);

  // Calculate average XP per lesson
  if (results.stats.lessonCount > 0) {
    const avgXP = Math.round(results.stats.totalXP / results.stats.lessonCount);
    console.log(`  ${colors.cyan}→${colors.reset} Average XP per lesson: ${avgXP}`);
  }

  // Estimate completion time (assuming 15 min per lesson)
  const estimatedHours = Math.round((results.stats.lessonCount * 15) / 60);
  console.log(`  ${colors.cyan}→${colors.reset} Estimated completion time: ${estimatedHours} hours`);

  results.passed++;
}

/**
 * Generate verification report
 */
function generateReport() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${colors.magenta}${colors.bold}LESSON SYSTEM VERIFICATION REPORT${colors.reset}`);
  console.log(`${'='.repeat(70)}\n`);

  const total = results.passed + results.failed;
  const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;

  console.log(`${colors.green}${colors.bold}✓ Passed:${colors.reset}   ${results.passed}`);
  console.log(`${colors.red}${colors.bold}✗ Failed:${colors.reset}   ${results.failed}`);
  console.log(`${colors.yellow}${colors.bold}⚠ Warnings:${colors.reset} ${results.warnings}`);
  console.log(`${colors.cyan}${colors.bold}Pass Rate:${colors.reset}  ${passRate}%\n`);

  // System Status
  const status = results.failed === 0 ? 'READY' : 'NEEDS ATTENTION';
  const statusColor = results.failed === 0 ? colors.green : colors.red;
  console.log(`${colors.bold}System Status:${colors.reset} ${statusColor}${status}${colors.reset}\n`);

  if (results.errors.length > 0) {
    console.log(`${colors.red}${colors.bold}ERRORS:${colors.reset}`);
    results.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`);
    });
    console.log('');
  }

  // Statistics Summary
  console.log(`${colors.magenta}${colors.bold}STATISTICS:${colors.reset}\n`);
  console.log(`  Lessons:      ${results.stats.lessonCount}`);
  console.log(`  Labs:         ${results.stats.labCount}`);
  console.log(`  Docs:         ${results.stats.docCount}`);
  console.log(`  Total XP:     ${results.stats.totalXP.toLocaleString()}`);
  console.log(`  Content Size: ${(results.stats.totalSize / 1024).toFixed(2)} KB`);
  console.log(`  Categories:   ${Object.keys(results.stats.categories).length}`);

  if (Object.keys(results.stats.categories).length > 0) {
    console.log(`\n  Category Breakdown:`);
    Object.entries(results.stats.categories).forEach(([cat, count]) => {
      console.log(`    - ${cat}: ${count} lessons`);
    });
  }

  // Save report
  const reportPath = path.join(__dirname, 'verification-report.txt');
  const reportContent = `
CALOS LESSON SYSTEM VERIFICATION REPORT
Generated: ${new Date().toISOString()}
${'='.repeat(70)}

SUMMARY:
  Passed:   ${results.passed}
  Failed:   ${results.failed}
  Warnings: ${results.warnings}
  Pass Rate: ${passRate}%
  Status:   ${status}

STATISTICS:
  Lessons:      ${results.stats.lessonCount}
  Labs:         ${results.stats.labCount}
  Docs:         ${results.stats.docCount}
  Total XP:     ${results.stats.totalXP.toLocaleString()}
  Content Size: ${(results.stats.totalSize / 1024).toFixed(2)} KB
  Categories:   ${Object.keys(results.stats.categories).length}

CATEGORY BREAKDOWN:
${Object.entries(results.stats.categories).map(([cat, count]) =>
  `  ${cat}: ${count} lessons`).join('\n')}

ERRORS:
${results.errors.map((err, i) => `  ${i + 1}. ${err}`).join('\n') || '  None'}

RECOMMENDATIONS:
  ${results.failed === 0 ? '✓ System is ready for deployment' : '✗ Fix errors before deploying'}
  ${results.warnings > 0 ? `⚠ Review ${results.warnings} warnings` : '✓ No warnings'}
  ${results.stats.lessonCount >= 31 ? '✓ All lessons created' : `⚠ Only ${results.stats.lessonCount}/31 lessons created`}
  ${results.stats.labCount >= 20 ? '✓ All labs created' : `⚠ Only ${results.stats.labCount}/20 labs created`}
`;

  fs.writeFileSync(reportPath, reportContent);
  console.log(`\n${colors.cyan}Report saved to:${colors.reset} ${reportPath}`);

  // Final message
  if (results.failed === 0) {
    console.log(`\n${colors.green}${colors.bold}✓ Lesson system verification complete!${colors.reset}`);
    console.log(`${colors.green}  All checks passed. System is ready.${colors.reset}\n`);
  } else {
    console.log(`\n${colors.red}${colors.bold}✗ Lesson system has issues!${colors.reset}`);
    console.log(`${colors.red}  Please fix ${results.failed} failed checks.${colors.reset}\n`);
  }

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

/**
 * Main verification runner
 */
function main() {
  console.log(`\n${colors.magenta}${colors.bold}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.magenta}${colors.bold}CALOS LESSON SYSTEM VERIFICATION${colors.reset}`);
  console.log(`${colors.magenta}${colors.bold}${'='.repeat(70)}${colors.reset}`);

  // Run all verifications
  verifyLessons();
  verifyLabs();
  verifyDocs();
  validateLinks();
  checkFileSizes();
  calculateStatistics();

  // Generate report
  generateReport();
}

// Run verification
main();
