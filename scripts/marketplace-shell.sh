#!/bin/bash

#
# Marketplace Interactive Shell
#
# Starts a Node.js REPL with all marketplace modules pre-loaded.
# Use this to interactively test and explore the marketplace system.
#

set -e  # Exit on error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

echo -e "${BLUE}Talent Marketplace - Interactive Shell${NC}\n"

# Change to root directory
cd "$ROOT_DIR"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found${NC}"
    echo -e "${YELLOW}Install Node.js first${NC}\n"
    exit 1
fi

echo -e "${GRAY}Loading marketplace modules...${NC}\n"

# Create a temporary Node.js script that loads all modules and starts REPL
cat > /tmp/marketplace-shell-$$.js << 'EOFJS'
const path = require('path');
const repl = require('repl');

// Color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

// Load all modules
const DecisionTracker = require('./lib/decision-tracker');
const DecisionArchive = require('./lib/decision-archive');
const DecisionTodo = require('./lib/decision-todo');
const ReputationEngine = require('./lib/reputation-engine');
const IdeaMarketplace = require('./lib/idea-marketplace');
const GitHubActivityFeed = require('./lib/github-activity-feed');
const ProfileComms = require('./lib/profile-comms');

// Create instances
const decisionTracker = new DecisionTracker();
const reputationEngine = new ReputationEngine();
const decisionArchive = new DecisionArchive({ tracker: decisionTracker });
const decisionTodo = new DecisionTodo();
const ideaMarketplace = new IdeaMarketplace({ reputationEngine });
const activityFeed = new GitHubActivityFeed({ reputationEngine });
const profileComms = new ProfileComms();

console.log(`${colors.green}✓ All modules loaded${colors.reset}\n`);
console.log(`${colors.cyan}Available instances:${colors.reset}`);
console.log(`  ${colors.magenta}decisionTracker${colors.reset}   - Decision version control`);
console.log(`  ${colors.magenta}decisionArchive${colors.reset}   - Decision archive with lineage`);
console.log(`  ${colors.magenta}decisionTodo${colors.reset}      - Decision todo system`);
console.log(`  ${colors.magenta}reputationEngine${colors.reset}  - Karma and badges`);
console.log(`  ${colors.magenta}ideaMarketplace${colors.reset}   - Idea submissions`);
console.log(`  ${colors.magenta}activityFeed${colors.reset}      - GitHub activity feed`);
console.log(`  ${colors.magenta}profileComms${colors.reset}      - Profile messaging\n`);
console.log(`${colors.cyan}Available constructors:${colors.reset}`);
console.log(`  DecisionTracker, DecisionArchive, DecisionTodo`);
console.log(`  ReputationEngine, IdeaMarketplace`);
console.log(`  GitHubActivityFeed, ProfileComms\n`);
console.log(`${colors.gray}Examples:${colors.reset}`);
console.log(`  await reputationEngine.getReputationProfile('cal')`);
console.log(`  await ideaMarketplace.browseIdeas({ category: 'technical' })`);
console.log(`  await decisionTracker.searchDecisions({ tag: 'architecture' })\n`);
console.log(`${colors.gray}Type .exit to quit${colors.reset}\n`);

// Start REPL
const replServer = repl.start({
  prompt: `${colors.magenta}marketplace>${colors.reset} `,
  useColors: true,
  ignoreUndefined: true
});

// Add instances to REPL context
replServer.context.decisionTracker = decisionTracker;
replServer.context.decisionArchive = decisionArchive;
replServer.context.decisionTodo = decisionTodo;
replServer.context.reputationEngine = reputationEngine;
replServer.context.ideaMarketplace = ideaMarketplace;
replServer.context.activityFeed = activityFeed;
replServer.context.profileComms = profileComms;

// Add constructors
replServer.context.DecisionTracker = DecisionTracker;
replServer.context.DecisionArchive = DecisionArchive;
replServer.context.DecisionTodo = DecisionTodo;
replServer.context.ReputationEngine = ReputationEngine;
replServer.context.IdeaMarketplace = IdeaMarketplace;
replServer.context.GitHubActivityFeed = GitHubActivityFeed;
replServer.context.ProfileComms = ProfileComms;

// Custom .help command
replServer.defineCommand('modules', {
  help: 'List available modules',
  action() {
    console.log('\nAvailable modules:');
    console.log('  decisionTracker   - Decision version control');
    console.log('  decisionArchive   - Decision archive with lineage');
    console.log('  decisionTodo      - Decision todo system');
    console.log('  reputationEngine  - Karma and badges');
    console.log('  ideaMarketplace   - Idea submissions');
    console.log('  activityFeed      - GitHub activity feed');
    console.log('  profileComms      - Profile messaging\n');
    this.displayPrompt();
  }
});

replServer.defineCommand('methods', {
  help: 'Show methods for a module (usage: .methods <module>)',
  action(module) {
    const obj = replServer.context[module];
    if (!obj) {
      console.log(`Module '${module}' not found`);
      this.displayPrompt();
      return;
    }

    console.log(`\nMethods for ${module}:`);
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(obj))
      .filter(name => name !== 'constructor' && typeof obj[name] === 'function');

    methods.forEach(method => {
      console.log(`  ${method}()`);
    });
    console.log('');
    this.displayPrompt();
  }
});
EOFJS

# Run the REPL script
node /tmp/marketplace-shell-$$.js

# Clean up
rm -f /tmp/marketplace-shell-$$.js
