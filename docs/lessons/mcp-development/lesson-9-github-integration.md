# GitHub Integration with CalOS

**Track:** mcp-development
**Lesson:** 9
**XP Reward:** 130
**Time:** 25 minutes
**Prerequisites:** Lesson 1-8 (MCP basics)

## Learning Objectives

- ✅ Understand how to integrate GitHub API with CalOS systems
- ✅ Use Octokit to interact with GitHub repositories
- ✅ Record GitHub operations in learning systems
- ✅ Build privacy-first GitHub workflows

## Content

### What is the GitHub API Client?

The `GitHubAPIClient` (`lib/github-api-client.js`) is a wrapper around Octokit that integrates with Cal's learning systems. Every GitHub operation is automatically recorded in:

1. **CalLearningSystem** - Tracks successes/failures
2. **PatternLearner** - Records workflow patterns
3. **BlueprintRegistry** - Documents what exists

### Why Integration Matters

Before this integration, Cal would build features without checking what already exists. Now:

```javascript
// Cal checks FIRST
const exists = await integrator.checkIfExists('github-integration');
if (exists) {
  console.log('Already built! Use it:', exists.blueprint);
  return;
}

// Then builds (only if needed)
const github = new GitHubAPIClient(token, { db, recordLearning: true });
await github.createRepo('my-repo');

// Auto-recorded in all learning systems ✅
```

### Basic Usage

```javascript
const GitHubAPIClient = require('./lib/github-api-client');

// With learning integration
const github = new GitHubAPIClient(process.env.GITHUB_TOKEN, {
  db: yourDatabase,
  recordLearning: true  // Enables auto-recording
});

// Create repository
const repo = await github.createRepo('calos-test', {
  description: 'Test repository for CalOS',
  private: false,
  autoInit: true,
  gitignore: 'Node',
  license: 'mit'
});

// Enable GitHub Pages
await github.enablePages('Soulfra', 'calos-test', {
  branch: 'main',
  path: '/'
});

// Create pull request
await github.createPR(
  'Soulfra',
  'calos-test',
  'feature-branch',
  'main',
  'Add new feature',
  'This PR adds...'
);
```

### Available Operations

| Operation | Method | Records Learning? |
|-----------|--------|-------------------|
| List repos | `listRepos(username)` | ❌ (read-only) |
| Create repo | `createRepo(name, options)` | ✅ Yes |
| Get repo | `getRepo(owner, repo)` | ❌ (read-only) |
| Enable Pages | `enablePages(owner, repo)` | ✅ Yes |
| Create PR | `createPR(owner, repo, head, base, title, body)` | ✅ Yes |
| Get workflows | `getWorkflows(owner, repo)` | ❌ (read-only) |

### Privacy-First Pattern

The GitHub client follows CalOS privacy principles:

```javascript
// 1. Zero telemetry - only you see your GitHub operations
// 2. Local learning - recorded to local SQLite (not cloud)
// 3. Bring Your Own Key (BYOK) - you provide the GitHub token

const github = new GitHubAPIClient(yourToken, {
  recordLearning: true,  // Optional (default: true)
  db: yourLocalDatabase  // Your database, not ours
});
```

### Integration with Cal System Integrator

The GitHub client now integrates with `CalSystemIntegrator`:

```javascript
// Inside GitHubAPIClient

async _recordOperation(operation, success, context = {}) {
  if (!this.recordLearning || !this.systemIntegrator) return;

  await this.systemIntegrator.recordWork({
    feature: `github-${operation}`,
    files: ['lib/github-api-client.js'],
    description: `GitHub API: ${operation}`,
    success,
    context
  });
}

// Called after every operation
await this._recordOperation('create-repo', true, {
  repoName: name,
  fullName: data.full_name,
  repoUrl: data.html_url
});
```

### Example: Check Before Building

Before the integration, Cal would rebuild GitHub features. Now:

```javascript
const CalSystemIntegrator = require('./lib/cal-system-integrator');
const integrator = new CalSystemIntegrator();
await integrator.init();

// Check if GitHub integration exists
const exists = await integrator.checkIfExists('github');

if (exists) {
  console.log('GitHub integration already exists!');
  console.log('Blueprint:', exists.blueprints[0]);
  console.log('File:', exists.blueprints[0].file);
  // Use existing system ✅
} else {
  // Build new GitHub integration
  // (Only runs if nothing exists)
}
```

## Lab

Try the GitHub integration:

```bash
# Set your GitHub token
export GITHUB_TOKEN=ghp_your_token_here

# Run Node.js REPL
node

# Test the integration
const GitHubAPIClient = require('./lib/github-api-client');
const github = new GitHubAPIClient(process.env.GITHUB_TOKEN);

// List your repos
const repos = await github.listRepos();
console.log(`You have ${repos.length} repositories`);

// Parse a GitHub URL
const parsed = github.parseGitHubURL('https://github.com/Soulfra/calos-test');
console.log('Parsed:', parsed);
```

## Summary

You learned:
- How to integrate GitHub API with CalOS learning systems
- How Cal checks existing systems BEFORE building new ones
- How to use `GitHubAPIClient` with learning integration
- How operations are automatically recorded in CalLearningSystem, PatternLearner, and BlueprintRegistry

This prevents Cal from "rebuilding the same shit" by documenting what already exists.

## Next Lesson

Continue to Lesson 10: File Explorer & Git Operations

## Quiz

1. What three systems does GitHubAPIClient integrate with?
   - CalLearningSystem, PatternLearner, BlueprintRegistry

2. Why does Cal check `integrator.checkIfExists()` before building?
   - To avoid rebuilding features that already exist

3. How do you enable learning integration in GitHubAPIClient?
   - Pass `{ db, recordLearning: true }` to constructor

4. Which operations are recorded in learning systems?
   - Write operations (create repo, enable Pages, create PR)
   - Read operations are not recorded (listRepos, getRepo)

---

**🎴 Achievement Unlocked:** GitHub Integration Master (+130 XP)

*Stop rebuilding. Check what exists first.*
