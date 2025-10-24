# Publishing @calos/sdk to NPM

Complete guide to publishing the CALOS Platform SDK to NPM as a branded package.

## Prerequisites

### 1. Create NPM Account

```bash
npm login
```

Or create account at https://www.npmjs.com/signup

### 2. Create NPM Organization

1. Go to https://www.npmjs.com/org/create
2. Create organization: `@calos`
3. This gives you the `@calos/*` namespace

**Cost**: Free for public packages, $7/month for private packages

## Pre-Publishing Checklist

### 1. Verify Package Files

```bash
cd sdk/platform
ls -la
```

Should contain:
- ✅ `index.js` - Main SDK code
- ✅ `index.d.ts` - TypeScript definitions
- ✅ `package.json` - Package metadata
- ✅ `README.md` - Documentation
- ✅ `example.js` - Usage examples

### 2. Test Locally

```bash
# Install dependencies (none required for this SDK)
npm install

# Test importing the SDK
node -e "const { CALOS } = require('./index.js'); console.log('SDK Version:', CALOS.version);"
```

### 3. Update Version

```bash
# First release
npm version 1.0.0

# Subsequent releases
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0
```

## Publishing Steps

### Step 1: Dry Run

Test what will be published without actually publishing:

```bash
cd sdk/platform
npm pack --dry-run
```

This shows all files that will be included.

### Step 2: Create Tarball (Optional)

Create a local tarball to inspect:

```bash
npm pack
# Creates: calos-sdk-1.0.0.tgz

# Extract and inspect
tar -xzf calos-sdk-1.0.0.tgz
ls -la package/
```

### Step 3: Publish to NPM

**Public package** (free):

```bash
npm publish --access public
```

**Private package** ($7/month):

```bash
npm publish
```

### Step 4: Verify Publication

```bash
# Check NPM registry
npm view @calos/sdk

# Install in a test project
mkdir /tmp/test-calos-sdk
cd /tmp/test-calos-sdk
npm init -y
npm install @calos/sdk

# Test import
node -e "const { CALOS } = require('@calos/sdk'); console.log(CALOS.version);"
```

## Post-Publishing Tasks

### 1. Create Git Tag

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router
git tag -a v1.0.0 -m "Release @calos/sdk v1.0.0"
git push origin v1.0.0
```

### 2. Create GitHub Release

1. Go to https://github.com/soulfra/calos/releases/new
2. Tag: `v1.0.0`
3. Title: `@calos/sdk v1.0.0`
4. Description:
   ```markdown
   ## @calos/sdk v1.0.0

   🎉 Initial release of the CALOS Platform SDK!

   ### Features
   - Multi-LLM routing (OpenAI, Anthropic, DeepSeek, Ollama)
   - Usage-based billing tracking
   - TypeScript support
   - Streaming completions
   - Automatic retries
   - Zero dependencies

   ### Installation
   \`\`\`bash
   npm install @calos/sdk
   \`\`\`

   ### Documentation
   https://docs.calos.dev/sdk
   ```

### 3. Update Main README

Add SDK installation instructions to root README:

```markdown
# CALOS Platform

## For Developers

Install the official SDK:

\`\`\`bash
npm install @calos/sdk
\`\`\`

\`\`\`javascript
import { CALOS } from '@calos/sdk';

const calos = new CALOS({ apiKey: 'sk-tenant-...' });
const response = await calos.chat.complete({ prompt: 'Hello!' });
\`\`\`

See full documentation at https://docs.calos.dev/sdk
```

### 4. Announce Release

- **Twitter/X**: "@calos/sdk v1.0.0 is live! 🚀 Multi-LLM routing with usage-based billing. npm install @calos/sdk"
- **Discord**: Post in #announcements
- **Blog post**: Write launch article
- **Product Hunt**: Submit launch

## Updating the SDK

### For Bug Fixes (Patch)

```bash
cd sdk/platform

# Make changes to index.js
# Update version
npm version patch  # 1.0.0 -> 1.0.1

# Publish
npm publish --access public

# Tag in git
git tag -a v1.0.1 -m "Release @calos/sdk v1.0.1 - Bug fixes"
git push origin v1.0.1
```

### For New Features (Minor)

```bash
npm version minor  # 1.0.0 -> 1.1.0
npm publish --access public
git tag -a v1.1.0 -m "Release @calos/sdk v1.1.0 - New features"
git push origin v1.1.0
```

### For Breaking Changes (Major)

```bash
npm version major  # 1.0.0 -> 2.0.0
npm publish --access public
git tag -a v2.0.0 -m "Release @calos/sdk v2.0.0 - Breaking changes"
git push origin v2.0.0
```

## NPM Organization Management

### Add Team Members

```bash
# Invite user to @calos organization
npm owner add <username> @calos/sdk

# List current owners
npm owner ls @calos/sdk

# Remove owner
npm owner rm <username> @calos/sdk
```

### Create Access Tokens

1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Click "Generate New Token"
3. Choose type:
   - **Automation**: For CI/CD (recommended)
   - **Publish**: For publishing only
   - **Read-only**: For installing private packages

**Example CI/CD token usage:**

```bash
# In GitHub Actions
echo "//registry.npmjs.org/:_authToken=${{ secrets.NPM_TOKEN }}" > ~/.npmrc
npm publish --access public
```

## Automated Publishing (CI/CD)

### GitHub Actions Workflow

Create `.github/workflows/publish-sdk.yml`:

```yaml
name: Publish SDK

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'

      - name: Publish to NPM
        working-directory: sdk/platform
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Usage:**
```bash
# Create tag locally
git tag -a v1.0.0 -m "Release v1.0.0"

# Push tag to GitHub (triggers workflow)
git push origin v1.0.0
```

## Deprecating Versions

If you publish a broken version:

```bash
# Deprecate specific version
npm deprecate @calos/sdk@1.0.5 "Contains critical bug, use 1.0.6+"

# Deprecate all versions (when sunsetting package)
npm deprecate @calos/sdk "Package no longer maintained"
```

## Unpublishing (Emergency Only)

**WARNING**: Can only unpublish within 72 hours of publishing!

```bash
# Unpublish specific version
npm unpublish @calos/sdk@1.0.0

# Unpublish entire package (dangerous!)
npm unpublish @calos/sdk --force
```

**Better alternative**: Publish a patch fix instead.

## Trademark & Branding

### Register "CALOS" Trademark

1. **US Trademark**: https://www.uspto.gov/trademarks
2. **EU Trademark**: https://euipo.europa.eu
3. **Cost**: ~$250-500 USD

### NPM Package Dispute

If someone squats on `@calos` namespace:

1. File dispute: https://www.npmjs.com/policies/disputes
2. Provide proof of trademark ownership
3. NPM support will transfer ownership

## Marketing the SDK

### 1. Documentation Site

Host docs at `docs.calos.dev/sdk`:
- Installation guide
- Quick start
- API reference
- Code examples
- Migration guides

### 2. Code Examples

Create example repos:
- `calos-nextjs-starter`
- `calos-express-example`
- `calos-react-chatbot`

### 3. Developer Content

- YouTube: "Building AI Apps with CALOS SDK"
- Blog: "Why We Built @calos/sdk"
- Tutorial: "Chat App in 10 Minutes"

### 4. Community

- Discord server for developers
- GitHub Discussions
- Stack Overflow tag: `calos-sdk`

## Monitoring

### NPM Stats

Check downloads:
```bash
npm info @calos/sdk
```

Or use https://npmtrends.com/@calos/sdk

### Analytics Tools

- **NPM Stats**: https://npm-stat.com/charts.html?package=@calos/sdk
- **Bundle Size**: https://bundlephobia.com/package/@calos/sdk
- **Type Coverage**: https://typescriptbot.com/package/@calos/sdk

## Troubleshooting

### "You do not have permission to publish"

```bash
# Login again
npm logout
npm login

# Verify you're part of @calos org
npm org ls calos
```

### "Package name already exists"

Someone else owns `@calos` - file dispute or choose different name.

### "Published package has wrong files"

Check `.npmignore` or `files` field in package.json.

### "TypeScript definitions not working"

Verify `package.json` has:
```json
{
  "types": "index.d.ts"
}
```

---

## Quick Publish Checklist

- [ ] Version bumped (`npm version X.Y.Z`)
- [ ] README is up to date
- [ ] Examples work
- [ ] Tests pass (if any)
- [ ] CHANGELOG updated
- [ ] Logged into NPM (`npm whoami`)
- [ ] Published (`npm publish --access public`)
- [ ] Git tagged (`git tag vX.Y.Z && git push --tags`)
- [ ] GitHub release created
- [ ] Documentation updated
- [ ] Announced on social media

---

**Ready to publish @calos/sdk! 🚀**
