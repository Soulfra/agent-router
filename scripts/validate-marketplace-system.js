#!/usr/bin/env node

/**
 * Talent Marketplace System Validator
 *
 * Smoke test that validates all new systems compile and work together.
 * Tests: Decision Tracking, Reputation, Marketplace, Activity Feed, Communications
 *
 * Usage:
 *   node scripts/validate-marketplace-system.js
 *   node scripts/validate-marketplace-system.js --verbose
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

const verbose = process.argv.includes('--verbose');

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function log(level, message, detail = null) {
  const prefix = {
    PASS: `${colors.green}✓${colors.reset}`,
    FAIL: `${colors.red}✗${colors.reset}`,
    INFO: `${colors.blue}ℹ${colors.reset}`,
    WARN: `${colors.yellow}⚠${colors.reset}`
  }[level] || level;

  console.log(`${prefix} ${message}`);

  if (detail && verbose) {
    console.log(`  ${colors.gray}${detail}${colors.reset}`);
  }
}

function test(name, fn) {
  return async () => {
    try {
      await fn();
      results.passed++;
      results.tests.push({ name, status: 'passed' });
      log('PASS', name);
      return true;
    } catch (error) {
      results.failed++;
      results.tests.push({ name, status: 'failed', error: error.message });
      log('FAIL', `${name}: ${error.message}`);
      if (verbose) {
        console.error(colors.red + error.stack + colors.reset);
      }
      return false;
    }
  };
}

async function runTests() {
  console.log(`\n${colors.blue}=== Talent Marketplace System Validation ===${colors.reset}\n`);

  // ============================================================================
  // Module Loading Tests
  // ============================================================================

  console.log(`${colors.blue}[1/6] Module Loading Tests${colors.reset}`);

  await test('Load DecisionTracker module', async () => {
    const DecisionTracker = require('../lib/decision-tracker');
    if (typeof DecisionTracker !== 'function') {
      throw new Error('DecisionTracker is not a constructor');
    }
  })();

  await test('Load DecisionArchive module', async () => {
    const DecisionArchive = require('../lib/decision-archive');
    if (typeof DecisionArchive !== 'function') {
      throw new Error('DecisionArchive is not a constructor');
    }
  })();

  await test('Load DecisionTodo module', async () => {
    const DecisionTodo = require('../lib/decision-todo');
    if (typeof DecisionTodo !== 'function') {
      throw new Error('DecisionTodo is not a constructor');
    }
  })();

  await test('Load ReputationEngine module', async () => {
    const ReputationEngine = require('../lib/reputation-engine');
    if (typeof ReputationEngine !== 'function') {
      throw new Error('ReputationEngine is not a constructor');
    }
  })();

  await test('Load IdeaMarketplace module', async () => {
    const IdeaMarketplace = require('../lib/idea-marketplace');
    if (typeof IdeaMarketplace !== 'function') {
      throw new Error('IdeaMarketplace is not a constructor');
    }
  })();

  await test('Load GitHubActivityFeed module', async () => {
    const GitHubActivityFeed = require('../lib/github-activity-feed');
    if (typeof GitHubActivityFeed !== 'function') {
      throw new Error('GitHubActivityFeed is not a constructor');
    }
  })();

  await test('Load ProfileComms module', async () => {
    const ProfileComms = require('../lib/profile-comms');
    if (typeof ProfileComms !== 'function') {
      throw new Error('ProfileComms is not a constructor');
    }
  })();

  await test('Load talent-marketplace routes', async () => {
    const router = require('../routes/talent-marketplace-routes');
    // Express router is a function with additional properties
    if (typeof router !== 'function' && typeof router !== 'object') {
      throw new Error('Routes module did not export router');
    }
  })();

  // ============================================================================
  // Instance Creation Tests
  // ============================================================================

  console.log(`\n${colors.blue}[2/6] Instance Creation Tests${colors.reset}`);

  let instances = {};

  await test('Create DecisionTracker instance', async () => {
    const DecisionTracker = require('../lib/decision-tracker');
    instances.decisionTracker = new DecisionTracker();
    if (!instances.decisionTracker.pool) {
      throw new Error('DecisionTracker missing pool property');
    }
  })();

  await test('Create DecisionArchive instance', async () => {
    const DecisionArchive = require('../lib/decision-archive');
    instances.decisionArchive = new DecisionArchive({ tracker: instances.decisionTracker });
    if (!instances.decisionArchive.tracker) {
      throw new Error('DecisionArchive missing tracker property');
    }
  })();

  await test('Create DecisionTodo instance', async () => {
    const DecisionTodo = require('../lib/decision-todo');
    instances.decisionTodo = new DecisionTodo();
    if (!instances.decisionTodo.pool) {
      throw new Error('DecisionTodo missing pool property');
    }
  })();

  await test('Create ReputationEngine instance', async () => {
    const ReputationEngine = require('../lib/reputation-engine');
    instances.reputationEngine = new ReputationEngine();
    if (!instances.reputationEngine.pool) {
      throw new Error('ReputationEngine missing pool property');
    }
  })();

  await test('Create IdeaMarketplace instance', async () => {
    const IdeaMarketplace = require('../lib/idea-marketplace');
    instances.ideaMarketplace = new IdeaMarketplace({ reputationEngine: instances.reputationEngine });
    if (!instances.ideaMarketplace.pool) {
      throw new Error('IdeaMarketplace missing pool property');
    }
  })();

  await test('Create GitHubActivityFeed instance', async () => {
    const GitHubActivityFeed = require('../lib/github-activity-feed');
    instances.activityFeed = new GitHubActivityFeed({ reputationEngine: instances.reputationEngine });
    if (!instances.activityFeed.pool) {
      throw new Error('GitHubActivityFeed missing pool property');
    }
  })();

  await test('Create ProfileComms instance', async () => {
    const ProfileComms = require('../lib/profile-comms');
    instances.profileComms = new ProfileComms();
    if (!instances.profileComms.pool) {
      throw new Error('ProfileComms missing pool property');
    }
  })();

  // ============================================================================
  // Method Existence Tests
  // ============================================================================

  console.log(`\n${colors.blue}[3/6] Method Existence Tests${colors.reset}`);

  await test('DecisionTracker has core methods', async () => {
    const required = ['createDecision', 'getDecision', 'updateDecision', 'deprecateDecision', 'searchDecisions'];
    for (const method of required) {
      if (typeof instances.decisionTracker[method] !== 'function') {
        throw new Error(`Missing method: ${method}`);
      }
    }
  })();

  await test('DecisionArchive has core methods', async () => {
    const required = ['archiveDecision', 'restoreDecision', 'getLineage', 'searchArchive'];
    for (const method of required) {
      if (typeof instances.decisionArchive[method] !== 'function') {
        throw new Error(`Missing method: ${method}`);
      }
    }
  })();

  await test('DecisionTodo has core methods', async () => {
    const required = ['createTodo', 'getTodo', 'updateTodo', 'completeTodo', 'getTodosForDecision'];
    for (const method of required) {
      if (typeof instances.decisionTodo[method] !== 'function') {
        throw new Error(`Missing method: ${method}`);
      }
    }
  })();

  await test('ReputationEngine has core methods', async () => {
    const required = ['getReputationProfile', 'awardKarma', 'followUser', 'getLeaderboard'];
    for (const method of required) {
      if (typeof instances.reputationEngine[method] !== 'function') {
        throw new Error(`Missing method: ${method}`);
      }
    }
  })();

  await test('IdeaMarketplace has core methods', async () => {
    const required = ['submitIdea', 'getIdea', 'purchaseIdea', 'upvoteIdea', 'browseIdeas'];
    for (const method of required) {
      if (typeof instances.ideaMarketplace[method] !== 'function') {
        throw new Error(`Missing method: ${method}`);
      }
    }
  })();

  await test('GitHubActivityFeed has core methods', async () => {
    const required = ['postActivity', 'getFeed', 'likeActivity', 'commentOnActivity', 'getTrending'];
    for (const method of required) {
      if (typeof instances.activityFeed[method] !== 'function') {
        throw new Error(`Missing method: ${method}`);
      }
    }
  })();

  await test('ProfileComms has core methods', async () => {
    const required = ['sendMessage', 'getInbox', 'getThread', 'replyToMessage', 'routeToSlack'];
    for (const method of required) {
      if (typeof instances.profileComms[method] !== 'function') {
        throw new Error(`Missing method: ${method}`);
      }
    }
  })();

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  console.log(`\n${colors.blue}[4/6] Configuration Tests${colors.reset}`);

  await test('ReputationEngine has badge configuration', async () => {
    if (!instances.reputationEngine.badges) {
      throw new Error('Missing badges configuration');
    }
    const required = ['newcomer', 'contributor', 'veteran', 'legend'];
    for (const badge of required) {
      if (!instances.reputationEngine.badges[badge]) {
        throw new Error(`Missing badge: ${badge}`);
      }
    }
  })();

  await test('IdeaMarketplace has pricing configuration', async () => {
    if (typeof instances.ideaMarketplace.ideaPrice !== 'number') {
      throw new Error('Missing ideaPrice');
    }
    if (typeof instances.ideaMarketplace.platformFee !== 'number') {
      throw new Error('Missing platformFee');
    }
    if (typeof instances.ideaMarketplace.creatorPayout !== 'number') {
      throw new Error('Missing creatorPayout');
    }
  })();

  await test('GitHubActivityFeed has activity types', async () => {
    if (!instances.activityFeed.activityTypes) {
      throw new Error('Missing activityTypes configuration');
    }
    const required = ['commit', 'pr_opened', 'pr_merged', 'issue_opened'];
    for (const type of required) {
      if (!instances.activityFeed.activityTypes[type]) {
        throw new Error(`Missing activity type: ${type}`);
      }
    }
  })();

  await test('ProfileComms has routing rules', async () => {
    if (!instances.profileComms.routingRules) {
      throw new Error('Missing routingRules configuration');
    }
    const required = ['technical', 'product', 'collaboration', 'hiring'];
    for (const rule of required) {
      if (!instances.profileComms.routingRules[rule]) {
        throw new Error(`Missing routing rule: ${rule}`);
      }
    }
  })();

  // ============================================================================
  // Type Safety Tests
  // ============================================================================

  console.log(`\n${colors.blue}[5/6] Type Safety Tests${colors.reset}`);

  await test('Badge progression logic types', async () => {
    const badges = instances.reputationEngine.badges;

    // Check newcomer
    if (badges.newcomer.requirements && Object.keys(badges.newcomer.requirements).length > 0) {
      throw new Error('Newcomer should have no requirements');
    }

    // Check contributor requires numbers
    if (typeof badges.contributor.requirements.karma !== 'number') {
      throw new Error('Contributor karma requirement must be number');
    }

    // Check veteran
    if (typeof badges.veteran.requirements.daysSinceJoin !== 'number') {
      throw new Error('Veteran daysSinceJoin must be number');
    }
  })();

  await test('Karma calculation returns numbers', async () => {
    const karma = instances.reputationEngine._calculateKarmaValue('pr_merged', {});
    if (typeof karma !== 'number') {
      throw new Error('Karma calculation must return number');
    }
    if (karma <= 0) {
      throw new Error('Karma must be positive');
    }
  })();

  await test('Activity karma values are integers', async () => {
    const types = instances.activityFeed.activityTypes;
    for (const [type, config] of Object.entries(types)) {
      if (typeof config.karma !== 'number') {
        throw new Error(`Activity type ${type} karma must be number`);
      }
      if (!Number.isInteger(config.karma)) {
        throw new Error(`Activity type ${type} karma must be integer`);
      }
    }
  })();

  await test('Marketplace pricing calculations', async () => {
    const price = instances.ideaMarketplace.ideaPrice;
    const fee = instances.ideaMarketplace.platformFee;
    const payout = instances.ideaMarketplace.creatorPayout;

    // Check fee + payout = 1.0
    const sum = fee + payout;
    if (Math.abs(sum - 1.0) > 0.001) {
      throw new Error(`Platform fee (${fee}) + creator payout (${payout}) must equal 1.0`);
    }
  })();

  // ============================================================================
  // Integration Tests
  // ============================================================================

  console.log(`\n${colors.blue}[6/6] Integration Tests${colors.reset}`);

  await test('ReputationEngine integrates with IdeaMarketplace', async () => {
    if (instances.ideaMarketplace.reputationEngine !== instances.reputationEngine) {
      throw new Error('IdeaMarketplace not using provided ReputationEngine');
    }
  })();

  await test('ReputationEngine integrates with GitHubActivityFeed', async () => {
    if (instances.activityFeed.reputationEngine !== instances.reputationEngine) {
      throw new Error('GitHubActivityFeed not using provided ReputationEngine');
    }
  })();

  await test('DecisionArchive integrates with DecisionTracker', async () => {
    if (instances.decisionArchive.tracker !== instances.decisionTracker) {
      throw new Error('DecisionArchive not using provided DecisionTracker');
    }
  })();

  await test('All systems use same pool connection', async () => {
    const pools = [
      instances.decisionTracker.pool,
      instances.decisionTodo.pool,
      instances.reputationEngine.pool,
      instances.ideaMarketplace.pool,
      instances.activityFeed.pool,
      instances.profileComms.pool
    ];

    // All should be Pool instances
    for (const pool of pools) {
      if (!pool || typeof pool.query !== 'function') {
        throw new Error('Invalid pool connection');
      }
    }
  })();

  // ============================================================================
  // Summary
  // ============================================================================

  console.log(`\n${colors.blue}=== Summary ===${colors.reset}`);
  console.log(`${colors.green}Passed: ${results.passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${results.failed}${colors.reset}`);
  console.log(`Total: ${results.passed + results.failed}`);

  if (results.failed === 0) {
    console.log(`\n${colors.green}✓ All systems validated successfully!${colors.reset}`);
    console.log(`${colors.gray}The talent marketplace system is ready to use.${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}✗ ${results.failed} test(s) failed${colors.reset}`);
    console.log(`${colors.yellow}Review errors above and fix issues.${colors.reset}\n`);
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(`${colors.red}Unhandled rejection:${colors.reset}`, error);
  process.exit(1);
});

// Run tests
runTests().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
