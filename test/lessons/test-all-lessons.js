#!/usr/bin/env node
/**
 * Test All Lessons - Master Test Runner
 *
 * Comprehensive test suite that verifies:
 * - All 31 lesson files exist
 * - Lesson format (title, XP, objectives, quiz)
 * - Markdown syntax validation
 * - API endpoints referenced are real
 * - Lab file associations
 * - Quiz answer validation
 * - Generates detailed test report
 *
 * Usage:
 *   node test/lessons/test-all-lessons.js
 *   npm run test:lessons
 */

const fs = require('fs');
const path = require('path');

// Configuration
const LESSONS_DIR = path.join(__dirname, '../../public/lessons');
const LABS_DIR = path.join(__dirname, '../../public/labs');
const EXPECTED_LESSON_COUNT = 31;

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
 * Expected lesson structure from seed script
 */
const expectedLessons = [
  // MCP Development (8 lessons)
  { slug: 'introduction-to-calos-mcp-servers', xp: 100, category: 'MCP Development' },
  { slug: 'using-mcp-client-with-fetch', xp: 120, category: 'MCP Development' },
  { slug: 'building-your-first-mcp-tool', xp: 130, category: 'MCP Development' },
  { slug: 'rpg-integration-award-xp', xp: 120, category: 'MCP Development' },
  { slug: 'file-system-tools', xp: 110, category: 'MCP Development' },
  { slug: 'code-analysis-tools', xp: 120, category: 'MCP Development' },
  { slug: 'privacy-security', xp: 130, category: 'MCP Development' },
  { slug: 'deploy-your-own-mcp-server', xp: 110, category: 'MCP Development' },

  // RPG/Card Game (10 lessons)
  { slug: 'understanding-the-card-game-system', xp: 100, category: 'RPG/Card Game' },
  { slug: 'fetch-api-basics', xp: 110, category: 'RPG/Card Game' },
  { slug: 'opening-card-packs', xp: 120, category: 'RPG/Card Game' },
  { slug: 'card-collection-ui', xp: 130, category: 'RPG/Card Game' },
  { slug: 'roasting-system-vote-on-code', xp: 140, category: 'RPG/Card Game' },
  { slug: 'rpg-player-progression', xp: 120, category: 'RPG/Card Game' },
  { slug: 'quest-system', xp: 130, category: 'RPG/Card Game' },
  { slug: 'achievements-badges', xp: 120, category: 'RPG/Card Game' },
  { slug: 'leaderboards', xp: 130, category: 'RPG/Card Game' },
  { slug: 'final-project-full-game-loop', xp: 150, category: 'RPG/Card Game' },

  // Zero-Dependency (6 lessons)
  { slug: 'understanding-calos-schema', xp: 100, category: 'Zero-Dependency' },
  { slug: 'privacy-first-data-handling', xp: 130, category: 'Zero-Dependency' },
  { slug: 'split-licensing-strategy', xp: 110, category: 'Zero-Dependency' },
  { slug: 'build-without-npm-dependencies', xp: 140, category: 'Zero-Dependency' },
  { slug: 'database-design', xp: 120, category: 'Zero-Dependency' },
  { slug: 'deployment-without-vendors', xp: 120, category: 'Zero-Dependency' },

  // Multi-Tier System (7 lessons)
  { slug: 'understanding-the-tier-system', xp: 100, category: 'Multi-Tier System' },
  { slug: 'byok-implementation', xp: 140, category: 'Multi-Tier System' },
  { slug: 'usage-tracking', xp: 130, category: 'Multi-Tier System' },
  { slug: 'billing-dashboard', xp: 140, category: 'Multi-Tier System' },
  { slug: 'rate-limiting', xp: 120, category: 'Multi-Tier System' },
  { slug: 'multi-project-management', xp: 140, category: 'Multi-Tier System' },
  { slug: 'self-service-portal', xp: 140, category: 'Multi-Tier System' }
];

/**
 * Test: Verify all lesson files exist
 */
function testLessonFilesExist() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Checking if all ${EXPECTED_LESSON_COUNT} lesson files exist...`);

  let passed = 0;
  let failed = 0;

  expectedLessons.forEach((lesson, index) => {
    const filename = `${String(index + 1).padStart(2, '0')}-${lesson.slug}.md`;
    const filepath = path.join(LESSONS_DIR, filename);

    if (fs.existsSync(filepath)) {
      console.log(`  ${colors.green}✓${colors.reset} ${filename}`);
      passed++;
    } else {
      console.log(`  ${colors.red}✗${colors.reset} ${filename} - NOT FOUND`);
      results.errors.push(`Missing lesson file: ${filename}`);
      failed++;
    }
  });

  results.passed += passed;
  results.failed += failed;

  console.log(`\n  Result: ${passed}/${EXPECTED_LESSON_COUNT} lessons found`);
}

/**
 * Test: Verify lesson format and structure
 */
function testLessonFormat() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Validating lesson format and structure...`);

  expectedLessons.forEach((lesson, index) => {
    const filename = `${String(index + 1).padStart(2, '0')}-${lesson.slug}.md`;
    const filepath = path.join(LESSONS_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return; // Already reported in previous test
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const errors = [];

    // Check for required sections
    const requiredSections = [
      '# ',  // Title
      '## What You\'ll Learn',
      '## Learning Objectives',
      '## Prerequisites',
      '## Estimated Time',
      '## Lab Exercise',
      '## Quiz'
    ];

    requiredSections.forEach(section => {
      if (!content.includes(section)) {
        errors.push(`Missing section: ${section}`);
      }
    });

    // Check for XP reward mention
    if (!content.includes(`${lesson.xp} XP`)) {
      errors.push(`XP reward (${lesson.xp} XP) not found in content`);
    }

    // Check for quiz questions (should have at least 3)
    const quizMatches = content.match(/\d+\.\s+\*\*/g);
    if (!quizMatches || quizMatches.length < 3) {
      errors.push(`Quiz should have at least 3 questions (found ${quizMatches ? quizMatches.length : 0})`);
    }

    // Check for code blocks (should have at least 1)
    const codeBlocks = content.match(/```/g);
    if (!codeBlocks || codeBlocks.length < 2) {
      errors.push(`Should have at least 1 code example (found ${codeBlocks ? codeBlocks.length / 2 : 0})`);
    }

    if (errors.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} ${filename}`);
      results.passed++;
    } else {
      console.log(`  ${colors.red}✗${colors.reset} ${filename}`);
      errors.forEach(err => {
        console.log(`    - ${err}`);
        results.errors.push(`${filename}: ${err}`);
      });
      results.failed++;
    }
  });
}

/**
 * Test: Validate markdown syntax
 */
function testMarkdownSyntax() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Validating markdown syntax...`);

  expectedLessons.forEach((lesson, index) => {
    const filename = `${String(index + 1).padStart(2, '0')}-${lesson.slug}.md`;
    const filepath = path.join(LESSONS_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return;
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const warnings = [];

    // Check for common markdown issues
    const lines = content.split('\n');
    lines.forEach((line, lineNum) => {
      // Check for unclosed code blocks
      if (line.startsWith('```') && !line.includes('```', 3)) {
        const nextLines = lines.slice(lineNum + 1);
        const closingIndex = nextLines.findIndex(l => l.startsWith('```'));
        if (closingIndex === -1) {
          warnings.push(`Line ${lineNum + 1}: Unclosed code block`);
        }
      }

      // Check for broken links
      const linkMatches = line.match(/\[([^\]]+)\]\(([^)]+)\)/g);
      if (linkMatches) {
        linkMatches.forEach(link => {
          const urlMatch = link.match(/\(([^)]+)\)/);
          if (urlMatch && urlMatch[1].startsWith('http')) {
            // External link - just warn
            warnings.push(`Line ${lineNum + 1}: External link detected: ${urlMatch[1]}`);
          }
        });
      }
    });

    if (warnings.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} ${filename}`);
      results.passed++;
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} ${filename}`);
      warnings.forEach(warn => {
        console.log(`    - ${warn}`);
      });
      results.warnings += warnings.length;
    }
  });
}

/**
 * Test: Verify API endpoints referenced are real
 */
function testAPIEndpoints() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Checking API endpoints referenced in lessons...`);

  const validEndpoints = [
    '/api/mcp/',
    '/api/cards/',
    '/api/rpg/',
    '/api/billing/',
    '/api/projects/',
    '/api/tier/',
    '/api/usage/',
    'localhost:3100'
  ];

  expectedLessons.forEach((lesson, index) => {
    const filename = `${String(index + 1).padStart(2, '0')}-${lesson.slug}.md`;
    const filepath = path.join(LESSONS_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return;
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const warnings = [];

    // Extract API endpoints
    const apiMatches = content.match(/\/api\/[a-z-]+/g) || [];
    const localhostMatches = content.match(/localhost:\d+/g) || [];

    [...apiMatches, ...localhostMatches].forEach(endpoint => {
      const isValid = validEndpoints.some(valid => endpoint.includes(valid));
      if (!isValid) {
        warnings.push(`Potentially invalid API endpoint: ${endpoint}`);
      }
    });

    if (warnings.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} ${filename}`);
      results.passed++;
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} ${filename}`);
      warnings.forEach(warn => {
        console.log(`    - ${warn}`);
      });
      results.warnings += warnings.length;
    }
  });
}

/**
 * Test: Verify lab file associations
 */
function testLabFileAssociations() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Checking lab file associations...`);

  const labFiles = fs.readdirSync(LABS_DIR).filter(f => f.endsWith('.html'));

  expectedLessons.forEach((lesson, index) => {
    const filename = `${String(index + 1).padStart(2, '0')}-${lesson.slug}.md`;
    const filepath = path.join(LESSONS_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return;
    }

    const content = fs.readFileSync(filepath, 'utf8');

    // Check if lesson references a lab
    const labMatch = content.match(/labs\/([a-z-]+)\.html/);

    if (labMatch) {
      const labFile = `${labMatch[1]}.html`;
      if (labFiles.includes(labFile)) {
        console.log(`  ${colors.green}✓${colors.reset} ${filename} → ${labFile}`);
        results.passed++;
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${filename} → ${labFile} (NOT FOUND)`);
        results.errors.push(`${filename} references missing lab: ${labFile}`);
        results.failed++;
      }
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} ${filename} - No lab reference found`);
      results.warnings++;
    }
  });
}

/**
 * Test: Validate quiz answers
 */
function testQuizAnswers() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Validating quiz answer format...`);

  expectedLessons.forEach((lesson, index) => {
    const filename = `${String(index + 1).padStart(2, '0')}-${lesson.slug}.md`;
    const filepath = path.join(LESSONS_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return;
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const errors = [];

    // Extract quiz section
    const quizMatch = content.match(/## Quiz([\s\S]*?)(?=##|$)/);
    if (quizMatch) {
      const quizContent = quizMatch[1];

      // Check for answer key
      if (!quizContent.includes('### Answers') && !quizContent.includes('## Answers')) {
        errors.push('Quiz missing answer key');
      }

      // Check for multiple choice format
      const questions = quizContent.match(/\d+\.\s+\*\*[^*]+\*\*/g) || [];
      const choices = quizContent.match(/\s+[a-d]\)\s+/gi) || [];

      if (questions.length > 0 && choices.length === 0) {
        errors.push('Quiz questions missing multiple choice options');
      }
    }

    if (errors.length === 0) {
      console.log(`  ${colors.green}✓${colors.reset} ${filename}`);
      results.passed++;
    } else {
      console.log(`  ${colors.red}✗${colors.reset} ${filename}`);
      errors.forEach(err => {
        console.log(`    - ${err}`);
        results.errors.push(`${filename}: ${err}`);
      });
      results.failed++;
    }
  });
}

/**
 * Generate test report
 */
function generateReport() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${colors.magenta}LESSON TEST REPORT${colors.reset}`);
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

  const reportPath = path.join(__dirname, 'lesson-test-report.txt');
  const reportContent = `
CALOS LESSON TEST REPORT
Generated: ${new Date().toISOString()}
${'='.repeat(70)}

SUMMARY:
  Passed:   ${results.passed}
  Failed:   ${results.failed}
  Warnings: ${results.warnings}
  Pass Rate: ${passRate}%

ERRORS:
${results.errors.map((err, i) => `  ${i + 1}. ${err}`).join('\n')}

EXPECTED LESSONS (${EXPECTED_LESSON_COUNT}):
${expectedLessons.map((l, i) => `  ${i + 1}. ${l.slug} (${l.xp} XP) - ${l.category}`).join('\n')}
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
  console.log(`${colors.magenta}CALOS LESSON SYSTEM - COMPREHENSIVE TEST SUITE${colors.reset}`);
  console.log(`${colors.magenta}${'='.repeat(70)}${colors.reset}\n`);

  console.log(`Expected lessons: ${EXPECTED_LESSON_COUNT}`);
  console.log(`Lessons directory: ${LESSONS_DIR}`);
  console.log(`Labs directory: ${LABS_DIR}\n`);

  // Run all tests
  testLessonFilesExist();
  testLessonFormat();
  testMarkdownSyntax();
  testAPIEndpoints();
  testLabFileAssociations();
  testQuizAnswers();

  // Generate report
  generateReport();
}

// Run tests
main();
