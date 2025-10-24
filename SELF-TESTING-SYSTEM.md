# Self-Testing & Self-Healing System

A complete self-testing and self-healing architecture that runs real API tests, automatically fixes failures when APIs change, and includes adversarial testing.

## Overview

This system addresses the problem: **"we need to maybe have a script that runs the .md files and another that can read the tests and then another that can update the scripts and then another that approves it like versioning or something like thorn items and ways to purposefully put you off guard"**

### The Five Systems

1. **Cross-Platform Test Orchestrator** - Run real API tests across Shopify, Stripe, PayPal, GitHub, Figma
2. **Executable Documentation System** - Write tests directly in `.md` files and run them
3. **Self-Healing Test System** - Automatically detect and fix failing tests when APIs change
4. **Approval Workflow System** - Review and approve automatic fixes with git branches and versioning
5. **Chaos Testing System** - Adversarial "thorn items" that intentionally try to break things

## Quick Start

### 1. Run Integration Tests

Test real APIs with actual transactions:

```bash
npm run test:integration
```

### 2. Run Documentation Tests

Execute tests embedded in markdown files:

```bash
npm run test:docs
```

### 3. Self-Heal Failing Tests

Automatically fix tests that fail due to API changes:

```bash
# Preview fixes
npm run test:heal

# Auto-apply fixes
npm run test:heal:auto
```

### 4. Review and Approve Fixes

Create approval workflow with git branches:

```bash
# Create workflow from fix report
npm run workflow:create test-results/self-healing-report-2025-01-15.json

# List pending workflows
npm run workflow:list

# Approve and merge
npm run workflow:approve test-fix-2025-01-15-v1
```

### 5. Run Chaos Tests

Adversarial testing that tries to break things:

```bash
# Medium intensity
npm run test:chaos

# High intensity
npm run test:chaos:high
```

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Self-Testing System                         │
└─────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┴───────────┐
                    │                        │
         ┌──────────▼────────┐    ┌─────────▼────────┐
         │  Test Orchestrator │    │  Executable Docs │
         │                    │    │     Runner       │
         │ - Shopify Tests    │    │                  │
         │ - Stripe Tests     │    │ - Parse .md      │
         │ - PayPal Tests     │    │ - Execute tests  │
         │ - GitHub Tests     │    │ - Update docs    │
         │ - Figma Tests      │    │                  │
         └──────────┬─────────┘    └─────────┬────────┘
                    │                        │
                    └────────────┬───────────┘
                                 │
                    ┌────────────▼───────────┐
                    │   Test Results         │
                    │   (Pass/Fail)          │
                    └────────────┬───────────┘
                                 │
                                 │ Failures detected
                                 │
                    ┌────────────▼───────────┐
                    │  Self-Healing System   │
                    │                        │
                    │ 1. Analyze failures    │
                    │ 2. Generate fixes      │
                    │ 3. Apply fixes         │
                    │ 4. Re-run tests        │
                    └────────────┬───────────┘
                                 │
                                 │ Fixes generated
                                 │
                    ┌────────────▼───────────┐
                    │  Approval Workflow     │
                    │                        │
                    │ 1. Create git branch   │
                    │ 2. Show diff           │
                    │ 3. Wait for approval   │
                    │ 4. Merge to main       │
                    │ 5. Track versions      │
                    └────────────┬───────────┘
                                 │
                                 │
                    ┌────────────▼───────────┐
                    │  Chaos Testing         │
                    │  (Runs separately)     │
                    │                        │
                    │ - Invalid data         │
                    │ - Auth failures        │
                    │ - Rate limit tests     │
                    │ - Edge cases           │
                    │ - Concurrent storms    │
                    └────────────────────────┘
```

## 1. Cross-Platform Test Orchestrator

Runs real API transactions to verify integrations work.

### Features

- Full CRUD lifecycle testing
- Automatic test data cleanup
- Safety checks (test keys only)
- Results saved as JSON

### Usage

```bash
node lib/integration-test-orchestrator.js
```

### Example Output

```
Running integration tests across all platforms...

Testing Shopify...
  ✓ Create test product
  ✓ Fetch created product
  ✓ Update product
  ✓ Delete test product

Testing Stripe...
  ✓ Create payment intent
  ✓ Retrieve payment intent
  ✓ Cancel payment intent

Results:
Total: 7
Passed: 7
Failed: 0
```

### Environment Variables Required

```bash
# Shopify
SHOPIFY_STORE_URL=https://yourstore.myshopify.com/admin/api/2024-01
SHOPIFY_ACCESS_TOKEN=shpat_...

# Stripe
STRIPE_SECRET_KEY=sk_test_...

# PayPal
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...

# GitHub
GITHUB_TOKEN=ghp_...

# Figma
FIGMA_ACCESS_TOKEN=...
```

## 2. Executable Documentation System

Write tests directly in markdown documentation and execute them.

### Supported Test Formats

#### JSON Format

```test:shopify
{
  "action": "createProduct",
  "data": {
    "title": "Test Product",
    "price": 29.99
  },
  "expect": {
    "status": 201,
    "body.product.id": "exists"
  }
}
```

#### HTTP Request Format

```test:api
POST https://api.stripe.com/v1/payment_intents
Authorization: Bearer ${STRIPE_SECRET_KEY}

amount=1000&currency=usd

Expect: 200
Expect: body.id exists
```

#### Assertion Format

```test:github
GET https://api.github.com/user

assert response.status === 200
assert response.body.login exists
```

### Usage

```bash
# Run tests from all .md files
npm run test:docs

# Run tests and update docs with results
npm run test:docs:update

# Run specific file
node lib/executable-docs-runner.js EXECUTABLE-DOCS-EXAMPLE.md
```

### Example: See `EXECUTABLE-DOCS-EXAMPLE.md`

## 3. Self-Healing Test System

Automatically detects and fixes failing tests when APIs change.

### How It Works

1. **Run Tests** - Execute all tests and collect failures
2. **Analyze Failures** - Determine root cause (status change, field missing, etc.)
3. **Generate Fixes** - Create fixes using pattern matching or AI
4. **Apply Fixes** - Update test files with corrected expectations
5. **Verify** - Re-run tests to confirm fixes work

### Failure Patterns Detected

- Status code changes (e.g., API now returns 201 instead of 200)
- Missing fields (e.g., `body.user.email` no longer exists)
- Field value changes (e.g., field renamed)
- Authentication errors
- Rate limiting issues

### Usage

```bash
# Preview fixes without applying
npm run test:heal

# Automatically apply fixes
npm run test:heal:auto

# Fix only specific platform
node lib/self-healing-test-system.js --auto-apply --platform shopify
```

### Example Scenario

**Before (Test Fails):**

```test:shopify
{
  "action": "createProduct",
  "data": { "title": "Test" },
  "expect": {
    "status": 200,
    "body.product.email": "exists"
  }
}
```

**Self-Healing System Detects:**
- Status code changed: API now returns 201
- Field missing: `body.product.email` doesn't exist

**After (Auto-Fixed):**

```test:shopify
{
  "action": "createProduct",
  "data": { "title": "Test" },
  "expect": {
    "status": 201,
    "body.product.id": "exists"
  }
}
```

### AI-Assisted Fixing

For complex failures, the system can use Ollama to analyze and suggest fixes:

```bash
# Requires Ollama running
ollama serve

# Self-healing will automatically use AI for complex failures
npm run test:heal:auto
```

## 4. Approval Workflow System

Manages approval process for automatic fixes with git versioning.

### Features

- Git branch creation for each fix batch
- Diff preview before approval
- Version tracking (v1, v2, v3...)
- Changelog generation
- Rollback support

### Workflow

```
1. Self-healing creates fixes
2. Create approval workflow (git branch + version)
3. Review diff
4. Approve or reject
5. Merge to main (if approved)
6. Update changelog
```

### Usage

```bash
# Create workflow from fix report
npm run workflow:create test-results/self-healing-report-2025-01-15T10-30-00.json

# List all workflows
npm run workflow:list

# Approve and merge
npm run workflow:approve test-fix-2025-01-15-v1

# Reject
npm run workflow:reject test-fix-2025-01-15-v1
```

### Example Session

```bash
$ npm run workflow:create test-results/self-healing-report-2025-01-15.json

Creating approval workflow...

Creating branch: test-fix-2025-01-15-v1
✓ Branch created: test-fix-2025-01-15-v1

✓ Changes committed

✓ Version 1 created

Diff preview:
==================================================
diff --git a/EXECUTABLE-DOCS-EXAMPLE.md b/EXECUTABLE-DOCS-EXAMPLE.md
- "status": 200,
+ "status": 201,
==================================================

Workflow created successfully!

Next steps:
1. Review changes: git diff main...test-fix-2025-01-15-v1
2. Approve: npm run workflow:approve test-fix-2025-01-15-v1
3. Reject: npm run workflow:reject test-fix-2025-01-15-v1
```

### Version Tracking

All versions are tracked in `.test-fix-versions.json`:

```json
{
  "versions": [
    {
      "version": 1,
      "branchName": "test-fix-2025-01-15-v1",
      "timestamp": "2025-01-15T10:30:00.000Z",
      "status": "approved",
      "fixCount": 3,
      "failedTests": 5
    }
  ],
  "currentVersion": 1
}
```

### Changelog

Approved fixes are documented in `TEST-FIXES-CHANGELOG.md`:

```markdown
## Version 1 - 2025-01-15

**Branch**: `test-fix-2025-01-15-v1`
**Status**: approved
**Tests Fixed**: 3

### Changes

- Fixed test in `EXECUTABLE-DOCS-EXAMPLE.md` at line 25
- Fixed test in `API-TO-APP-GENERATOR.md` at line 142
```

## 5. Chaos Testing System

Adversarial "thorn items" that intentionally try to break things.

### Test Categories

#### Invalid Data Injection

- Null values
- Empty strings
- Wrong types
- Huge values (10,000 character strings)
- Negative numbers
- SQL injection attempts
- XSS injection attempts
- Unicode edge cases

#### Malformed Requests

- Missing required fields
- Invalid JSON
- Wrong Content-Type headers
- Missing authentication
- Prototype pollution attempts

#### Authentication Failures

- Invalid tokens
- Expired tokens
- No authentication
- Wrong auth scheme
- Malformed auth headers

#### Edge Cases

- Boundary values (0, MAX_INT)
- Negative zero
- Infinity
- NaN
- Control characters
- Unicode edge cases

#### Rate Limiting

- Burst of 100 requests
- Sustained load
- Concurrent request storms

#### Concurrency

- 50 simultaneous requests
- Race condition tests

### Usage

```bash
# Medium intensity (default)
npm run test:chaos

# High intensity (all tests)
npm run test:chaos:high

# Low intensity
node lib/chaos-testing-system.js --intensity low

# Specific platform
node lib/chaos-testing-system.js --platform shopify
```

### Example Output

```
Chaos Testing System
==================================================
Intensity: medium
Platform: all
==================================================

Running medium intensity chaos tests for shopify...

  ✓ Invalid Data: Set title to null - 400
  ✓ Invalid Data: Set title to empty string - 400
  ✓ Invalid Data: SQL injection attempt - 400
  ✓ Auth Failure: Invalid authentication token - 401
  ✓ Rate Limit: Burst 100 requests - 429
  ✗ Edge Case: Infinity - Ungraceful handling

==================================================
CHAOS TESTING REPORT
==================================================
Total Tests: 42
Passed: 39 ✓
Failed: 3 ✗
Errors: 0 ⚠
Robustness Score: 92.9%
==================================================

Platform Breakdown:
  shopify: 13/15 (86.7%)
  stripe: 14/14 (100.0%)
  github: 12/13 (92.3%)
```

### Interpreting Results

- **PASS** - System handled malicious input gracefully (returned 400, 401, 429, etc.)
- **FAIL** - System did not handle input gracefully (crashed, returned 500, etc.)
- **ERROR** - Unexpected error occurred

A good robustness score is **>90%**.

## Complete Workflow Example

Here's how all 5 systems work together:

### Step 1: Run Tests

```bash
# Run integration tests
npm run test:integration

# Run doc tests
npm run test:docs
```

**Result**: 5 tests fail due to Shopify API changes

### Step 2: Self-Heal

```bash
# Analyze failures and generate fixes
npm run test:heal
```

**Output**:
```
Found 5 failing test(s)

Analyzing failures...
  Test: Create test product
  Error: status_code_change
  Confidence: 90%
  Fix: API now returns 201 instead of 200

Generating fixes...
  ✓ Generated fix for: Create test product
  ✓ Generated fix for: Fetch created product
  ...

Fixes ready (use --auto-apply to apply)
```

### Step 3: Review Fixes

```bash
# Apply fixes
npm run test:heal:auto
```

**Output**:
```
Applying fixes...
  ✓ Fixed test at EXECUTABLE-DOCS-EXAMPLE.md:25
  ✓ Fixed test at EXECUTABLE-DOCS-EXAMPLE.md:45
  ...

Re-running tests to verify fixes...
✓ All tests now passing!
```

### Step 4: Create Approval Workflow

```bash
# Create workflow with latest fix report
npm run workflow:create test-results/self-healing-report-2025-01-15T10-30-00.json
```

**Output**:
```
Creating branch: test-fix-2025-01-15-v1
✓ Branch created
✓ Changes committed
✓ Version 1 created

Next steps:
1. Review: git diff main...test-fix-2025-01-15-v1
2. Approve: npm run workflow:approve test-fix-2025-01-15-v1
```

### Step 5: Review and Approve

```bash
# List workflows
npm run workflow:list

# Review diff
git diff main...test-fix-2025-01-15-v1

# Approve and merge
npm run workflow:approve test-fix-2025-01-15-v1
```

**Output**:
```
Approve and merge these changes? (y/N): y
Merging branch...
✓ Branch merged
✓ Version marked as approved
✓ Changelog updated

Workflow approved successfully!
```

### Step 6: Run Chaos Tests

```bash
# Verify system is robust against attacks
npm run test:chaos:high
```

**Output**:
```
Running high intensity chaos tests...

Robustness Score: 95.2%

All systems operational and secure!
```

## NPM Scripts Reference

### Testing

```bash
npm test                    # Mocha unit tests
npm run test:domain         # Domain model tests
npm run test:docs           # Executable documentation tests
npm run test:docs:update    # Run docs tests + update files with results
npm run test:integration    # Cross-platform integration tests
npm run test:all            # All tests (unit + docs + integration)
```

### Self-Healing

```bash
npm run test:heal           # Preview test fixes
npm run test:heal:auto      # Auto-apply test fixes
```

### Approval Workflow

```bash
npm run workflow:create     # Create approval workflow from fix report
npm run workflow:list       # List all workflows
npm run workflow:approve    # Approve and merge workflow
npm run workflow:reject     # Reject workflow
```

### Chaos Testing

```bash
npm run test:chaos          # Medium intensity chaos tests
npm run test:chaos:high     # High intensity chaos tests
```

## File Structure

```
agent-router/
├── lib/
│   ├── integration-test-orchestrator.js     # Cross-platform API tests
│   ├── executable-docs-runner.js            # Run tests from .md files
│   ├── self-healing-test-system.js          # Auto-fix failing tests
│   ├── approval-workflow-system.js          # Git-based approval workflow
│   └── chaos-testing-system.js              # Adversarial testing
├── test-results/
│   ├── integration-test-results-*.json      # Integration test results
│   ├── test-results-*.json                  # Doc test results
│   ├── self-healing-report-*.json           # Self-healing reports
│   └── chaos-test-report-*.json             # Chaos test reports
├── test-backups/                            # Backups before auto-fix
├── .test-fix-versions.json                  # Version tracking
├── TEST-FIXES-CHANGELOG.md                  # Changelog of approved fixes
├── EXECUTABLE-DOCS-EXAMPLE.md               # Example executable docs
└── SELF-TESTING-SYSTEM.md                   # This file
```

## Best Practices

### 1. Test Mode Only

Always use test API keys and sandbox URLs:
- Stripe: `sk_test_...`
- PayPal: `https://api-m.sandbox.paypal.com`
- Never run chaos tests against production

### 2. Review Before Approving

Always review the diff before approving automatic fixes:

```bash
git diff main...test-fix-branch-name
```

### 3. Backup Everything

The system automatically backs up files before modifying them.
Backups are stored in `test-backups/`.

### 4. Run Chaos Tests Regularly

```bash
# Run weekly to ensure system remains robust
npm run test:chaos:high
```

### 5. Version Control

All test fixes go through git branches and versioning.
Never bypass the approval workflow for production.

## Troubleshooting

### Tests Fail: "No credentials"

**Solution**: Set environment variables in `.env`:

```bash
SHOPIFY_STORE_URL=https://yourstore.myshopify.com/admin/api/2024-01
SHOPIFY_ACCESS_TOKEN=shpat_...
STRIPE_SECRET_KEY=sk_test_...
# ... etc
```

### Self-Healing: "Could not generate fix"

**Solution**: Low confidence fixes require manual intervention.
Review the failure analysis and fix manually.

### Approval Workflow: "Not a git repository"

**Solution**: Initialize git:

```bash
git init
git add .
git commit -m "Initial commit"
```

### Chaos Tests: Low robustness score

**Solution**: Review failed chaos tests and improve error handling:

```javascript
// Bad - No error handling
app.post('/products', (req, res) => {
  const product = createProduct(req.body);
  res.json(product);
});

// Good - Graceful error handling
app.post('/products', (req, res) => {
  try {
    if (!req.body.title) {
      return res.status(400).json({ error: 'Title required' });
    }
    const product = createProduct(req.body);
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

## Advanced Usage

### Custom Test Platforms

Add new platform to integration orchestrator:

```javascript
class CustomPlatformTestSuite extends BaseTestSuite {
  constructor(testMode) {
    super(testMode);
    this.apiUrl = process.env.CUSTOM_API_URL;
    this.apiKey = process.env.CUSTOM_API_KEY;

    if (this.hasCredentials()) {
      this.setupTests();
    }
  }

  setupTests() {
    this.test('Custom test', async () => {
      const response = await axios.get(this.apiUrl);
      this.assert(response.status === 200);
    });
  }
}
```

### Custom Chaos Mutations

Add custom chaos patterns:

```javascript
generateCustomMutations(data) {
  return [
    {
      type: 'custom_attack',
      data: { ...data, malicious: true },
      description: 'Custom attack pattern'
    }
  ];
}
```

### CI/CD Integration

Add to GitHub Actions:

```yaml
name: Self-Testing System

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install dependencies
        run: npm install
      - name: Run integration tests
        run: npm run test:integration
      - name: Run doc tests
        run: npm run test:docs
      - name: Self-heal failures
        run: npm run test:heal:auto
        if: failure()
      - name: Create approval workflow
        run: npm run workflow:create test-results/latest-report.json
        if: failure()
      - name: Run chaos tests
        run: npm run test:chaos
```

## Summary

This complete self-testing and self-healing architecture provides:

✅ **Automated Testing** - Run real API tests across multiple platforms
✅ **Living Documentation** - Tests embedded directly in markdown docs
✅ **Self-Healing** - Automatically fix tests when APIs change
✅ **Approval Workflow** - Git-based review process with versioning
✅ **Chaos Testing** - Adversarial testing to find weaknesses

The system runs continuously, adapts to API changes, and maintains high quality through automatic fixes and rigorous adversarial testing.

---

**Next Steps:**

1. Set up environment variables for your platforms
2. Run `npm run test:integration` to verify setup
3. Create executable docs with tests in markdown files
4. Enable self-healing with `npm run test:heal:auto`
5. Run chaos tests with `npm run test:chaos:high`

For questions or issues, see the main README.md or individual system documentation.
