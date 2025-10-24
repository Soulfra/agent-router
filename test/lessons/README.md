# CalOS Lesson System Tests

Comprehensive test suite for the CalOS lesson system.

## Test Files

### 1. test-all-lessons.js
**Master lesson test runner** - 454 lines

Tests:
- ✓ All 31 lesson files exist
- ✓ Lesson format and structure
- ✓ Markdown syntax validation
- ✓ API endpoints are valid
- ✓ Lab file associations
- ✓ Quiz answer format

Usage:
```bash
npm run test:lessons
# or
node test/lessons/test-all-lessons.js
```

### 2. test-all-labs.js
**Lab test suite** - 477 lines

Tests:
- ✓ All 20 lab HTML files exist
- ✓ HTML structure validation
- ✓ fetch() API calls
- ✓ localStorage implementation
- ✓ Error handling
- ✓ CSS (dark theme, responsive)

Usage:
```bash
npm run test:labs
# or
node test/lessons/test-all-labs.js
```

### 3. test-github-pages.js
**GitHub Pages deployment test** - 513 lines

Tests:
- ✓ CNAME file (optional)
- ✓ sitemap.xml format
- ✓ robots.txt validation
- ✓ lessons.json structure
- ✓ Service Worker registration
- ✓ app.js router
- ✓ Offline capability

Usage:
```bash
npm run test:github-pages
# or
node test/lessons/test-github-pages.js
```

### 4. test-api-integration.js
**API integration tests** - 450 lines

Tests:
- ✓ MCP server endpoints (localhost:3100)
- ✓ Card game endpoints (/api/cards/*)
- ✓ RPG endpoints (/api/rpg/*)
- ✓ Billing endpoints (/api/billing/*)
- ✓ Response format validation
- ✓ Error handling

Usage:
```bash
npm run test:api
# or
node test/lessons/test-api-integration.js
```

## Running All Tests

```bash
# Run all lesson tests sequentially
npm run test:all-lessons

# This runs:
# 1. test:lessons
# 2. test:labs
# 3. test:github-pages
# 4. test:api
```

## Test Reports

Each test generates a report in the test/lessons/ directory:

- `lesson-test-report.txt` - Lesson test results
- `lab-test-report.txt` - Lab test results
- `github-pages-report.txt` - Deployment readiness
- `api-integration-report.txt` - API test results

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

## Environment Variables

```bash
# API Integration Tests
export API_BASE_URL=http://localhost:5001  # Default
export MCP_URL=http://localhost:3100       # Default
```

## Continuous Integration

Add to your CI/CD pipeline:

```yaml
# .github/workflows/test-lessons.yml
name: Test Lessons

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:lessons
      - run: npm run test:labs
      - run: npm run test:github-pages
```

## Contributing

When adding new lessons or labs:

1. Create the lesson/lab file
2. Run the appropriate test suite
3. Fix any validation errors
4. Update test expectations if needed
5. Commit with test results

## Support

- Documentation: `docs/LESSON-SYSTEM-COMPLETE.md`
- Issues: GitHub Issues
- Discord: https://discord.gg/calos
