# Clarity - Dependency Vendoring & Intelligence System

A comprehensive system to prevent **left-pad style incidents** by mirroring critical packages, tracking URLs, and providing deep intelligence about your dependencies.

## Problem: The npm Left-Pad Incident

In March 2016, the npm package `left-pad` (just 11 lines of code) was unpublished, breaking thousands of projects worldwide including Facebook, PayPal, and Netflix. This exposed the fragility of relying on external package registries.

**Clarity solves this by:**
- ✅ Mirroring critical packages to MinIO
- ✅ Tracking every URL your system depends on
- ✅ Calculating "left-pad risk scores" for packages
- ✅ Providing intelligence about dependency quality
- ✅ Generating dependency graphs

## Architecture

```
PostgreSQL (Database)
    ↓
    ├── Package Registry (vendored_packages)
    ├── Dependency Graph (package_dependencies)
    ├── URL Index (url_index)
    ├── Intelligence Scores (package_intelligence)
    └── Funding Registry (funding_registry)
    ↓
MinIO (Object Storage)
    ↓
    ├── calos-packages/ (Vendored npm packages)
    └── calos-models/ (AI models)
    ↓
Clarity Engine
    ↓
    ├── Dependency Mirror (vendor packages)
    ├── URL Tracker (index all fetches)
    ├── Intelligence Analyzer (calculate scores)
    └── Risk Detector (find left-pad style risks)
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Initialize Clarity

This will:
- Check PostgreSQL connectivity
- Run database migrations
- Initialize MinIO buckets
- Bootstrap critical packages
- Verify system health

```bash
npm run clarity:init
```

### 3. Vendor a Package

Mirror a package to MinIO to prevent external dependency failures:

```bash
npm run clarity:vendor left-pad@1.3.0
npm run clarity:vendor express
```

### 4. Analyze Dependencies

Calculate intelligence and risk scores for all packages:

```bash
npm run clarity:analyze
```

### 5. Check for Risks

Find packages with "left-pad risk" (small + critical + many dependents):

```bash
npm run clarity:risks
```

## Commands

### Package Management

```bash
# Vendor a package
npm run clarity:vendor <package>[@version]
npm run clarity:vendor left-pad@1.3.0
npm run clarity:vendor express

# List vendored packages
npm run clarity:list
npm run clarity:list -- --critical  # Only critical packages
npm run clarity:list -- --status mirrored

# Mark package as critical (auto-vendor + prioritize)
npm run clarity:critical express@4.18.2

# Verify package integrity
npm run clarity:verify left-pad@1.3.0
```

### Analysis

```bash
# Analyze all dependencies
npm run clarity:analyze

# Show system statistics
npm run clarity:stats

# Find high-risk packages
npm run clarity:risks
npm run clarity:risks -- --min 80  # Custom threshold

# Get detailed package report
npm run clarity:report express@4.18.2
```

### URL Tracking

```bash
# Show URL statistics
npm run clarity:urls

# Show top URLs
npm run clarity:urls -- --top --limit 20

# Show URLs by domain
npm run clarity:urls -- --domain npmjs.org

# Show failed URLs
npm run clarity:urls -- --failed
```

### Dependency Graphs

```bash
# Generate Mermaid diagram
npm run clarity:graph -- --format mermaid --output deps.mmd

# Generate GraphViz DOT
npm run clarity:graph -- --format dot --output deps.dot

# Generate JSON
npm run clarity:graph -- --format json --output deps.json

# Graph specific package
npm run clarity:graph -- --root express@4.18.2 --depth 2
```

## Database Schema

### Core Tables

**vendored_packages** - Registry of mirrored packages
- Package name, version, type
- MinIO storage location and checksums
- Dependencies, metadata, licenses
- Risk scores and criticality flags

**package_dependencies** - Dependency graph
- Parent/child relationships
- Dependency types (runtime, dev, peer)
- Depth levels
- Circular dependency detection

**url_index** - All URLs fetched by the system
- URL, domain, path
- Fetch counts and timestamps
- Success/failure status
- Annotations and tags
- Critical URL marking

**package_intelligence** - Calculated metrics
- Code metrics (LOC, complexity, functions)
- Quality metrics (tests, TypeScript, docs)
- Activity metrics (GitHub stars, commits)
- Intelligence score (0-100)
- Left-pad risk score (0-100)

**funding_registry** - Package funding information
- Funding sources (GitHub Sponsors, OpenCollective, etc.)
- Maintainer information
- Our funding status

## Intelligence Scoring

### Intelligence Score (0-100)

Higher = more intelligent/mature package

**Factors:**
- Code size (0-30 points) - Larger codebase usually means more features
- Quality (0-40 points) - Tests, TypeScript, documentation, changelog
- Activity (0-30 points) - GitHub stars, active development

### Left-Pad Risk Score (0-100)

Higher = more risky (could be next left-pad)

**Factors:**
- Small codebase (0-40 points) - <50 LOC = high risk
- Many dependents (0-40 points) - >1000 dependents = high risk
- Low complexity (0-20 points) - Trivially simple code = high risk

**Example: left-pad**
- Lines of code: 11 (40 points)
- Dependents: 275,000+ (40 points)
- Complexity: Very low (20 points)
- **Risk Score: 100/100** ⚠️

## Use Cases

### 1. Prevent Supply Chain Attacks

Vendor all external dependencies to your own MinIO instance:

```bash
# Vendor critical packages
npm run clarity:critical react
npm run clarity:critical express
npm run clarity:critical axios

# Analyze for risks
npm run clarity:risks
```

### 2. Audit Dependency Intelligence

Understand the quality of your dependencies:

```bash
# Analyze all packages
npm run clarity:analyze

# Get detailed report
npm run clarity:report lodash

# Check intelligence scores
npm run clarity:stats
```

### 3. Track External Resources

Know exactly what URLs your system depends on:

```bash
# Show all tracked URLs
npm run clarity:urls

# Find URLs from specific domain
npm run clarity:urls -- --domain cdn.jsdelivr.net

# Mark critical URLs
# (via API or database)
```

### 4. Visualize Dependencies

Generate dependency graphs:

```bash
# Mermaid diagram for documentation
npm run clarity:graph -- --format mermaid --output docs/deps.mmd

# GraphViz for analysis
npm run clarity:graph -- --format dot | dot -Tpng -o deps.png
```

### 5. CI/CD Integration

Add to your CI pipeline:

```yaml
# .github/workflows/clarity.yml
name: Dependency Clarity

on: [push, pull_request]

jobs:
  clarity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Initialize Clarity
        run: npm run clarity:init
      - name: Analyze dependencies
        run: npm run clarity:analyze
      - name: Check for high-risk packages
        run: npm run clarity:risks --min 70
      - name: Generate dependency graph
        run: npm run clarity:graph --format mermaid --output deps.mmd
```

## Configuration

### Environment Variables

```bash
# PostgreSQL (required)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calos
DB_USER=postgres
DB_PASSWORD=

# MinIO (optional but recommended)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false

# GitHub (for package analysis)
GITHUB_TOKEN=ghp_...
```

### Critical Packages

Clarity automatically vendors these on `clarity:init`:
- left-pad@1.3.0 (the famous incident example)
- express (core web framework)
- axios (HTTP client)
- dotenv (environment configuration)

You can modify the list in `lib/clarity-init.js`.

## API Usage

### Programmatic Access

```javascript
const { Pool } = require('pg');
const DependencyMirror = require('./lib/dependency-mirror');
const URLIndex = require('./lib/url-index');
const ClarityEngine = require('./lib/clarity-engine');

const db = new Pool({ /* config */ });
const mirror = new DependencyMirror({ db, minioClient });
const urlIndex = new URLIndex({ db });
const clarity = new ClarityEngine({ db, mirror, urlIndex });

// Vendor a package
await mirror.vendor('left-pad', '1.3.0');

// Track a URL
await urlIndex.track('https://registry.npmjs.org/left-pad', 'npm_registry', 200, true);

// Analyze dependencies
await clarity.analyze();

// Find risks
const risks = await clarity.findLeftPadRisks(70);

// Generate graph
const mermaid = await clarity.generateGraph('mermaid');
```

## Advanced Features

### Dependency Mirroring

**Auto-vendor on first use:**

```javascript
const mirror = new DependencyMirror({
  db,
  minioClient,
  autoVendorOnUse: true,  // Automatically mirror when accessed
  vendorDependencies: 'critical'  // Also vendor critical dependencies
});

const pkg = await mirror.get('express', 'latest');
// If not mirrored, automatically vendors it
```

### URL Tracking Integration

Wrap your HTTP client to automatically track URLs:

```javascript
const axios = require('axios');
const { URLIndex } = require('./lib/url-index');

const urlIndex = new URLIndex({ db });

// Wrap axios
const trackedAxios = axios.create();
trackedAxios.interceptors.response.use(
  async (response) => {
    await urlIndex.track(
      response.config.url,
      'api_call',
      response.status,
      true
    );
    return response;
  },
  async (error) => {
    await urlIndex.track(
      error.config.url,
      'api_call',
      error.response?.status || 0,
      false,
      { error: error.message }
    );
    throw error;
  }
);
```

### Custom Intelligence Metrics

Extend the intelligence analyzer:

```javascript
class CustomClarityEngine extends ClarityEngine {
  calculateIntelligenceScore(codeMetrics, qualityMetrics, activityMetrics) {
    let score = super.calculateIntelligenceScore(codeMetrics, qualityMetrics, activityMetrics);

    // Add custom factors
    if (activityMetrics.hasSecurityAudit) {
      score += 10;
    }

    return Math.min(100, score);
  }
}
```

## Troubleshooting

### Clarity Init Fails

```bash
# Check PostgreSQL
psql -h localhost -U postgres -d calos

# Run migrations manually
node database/run-migrations.js

# Check MinIO
curl http://localhost:9000/minio/health/live
```

### Package Vendoring Fails

```bash
# Check MinIO buckets
npm run clarity:init --verbose

# Verify MinIO credentials
echo $MINIO_ACCESS_KEY
```

### High Risk Scores for Important Packages

This is expected! Small, widely-used packages like `left-pad` are inherently risky. The solution:

1. Mark them as critical: `npm run clarity:critical left-pad`
2. Vendor them to your MinIO
3. Consider vendoring alternatives or implementing functionality yourself

## Comparison with Alternatives

| Feature | Clarity | Verdaccio | Artifactory | npm Enterprise |
|---------|---------|-----------|-------------|----------------|
| Package mirroring | ✅ | ✅ | ✅ | ✅ |
| Intelligence scoring | ✅ | ❌ | ❌ | ❌ |
| Left-pad risk detection | ✅ | ❌ | ❌ | ❌ |
| URL tracking | ✅ | ❌ | ❌ | ❌ |
| Dependency graphs | ✅ | ❌ | ✅ | ✅ |
| Funding awareness | ✅ | ❌ | ❌ | ❌ |
| Self-hosted | ✅ | ✅ | ✅ | ❌ |
| Free | ✅ | ✅ | ❌ | ❌ |

## Roadmap

- [ ] TUI (Terminal UI) interface with blessed/ink
- [ ] Web dashboard with D3.js visualizations
- [ ] Go binary for fast analysis
- [ ] Private gist integration for sharing graphs
- [ ] Automatic funding recommendations
- [ ] Security vulnerability scanning
- [ ] License compliance checking
- [ ] Blockchain-based package verification
- [ ] Integration with Dependabot/Snyk
- [ ] Support for PyPI, RubyGems, Maven

## Contributing

This is part of the CalOS Agent Router project. Contributions welcome!

## License

MIT

---

**Built with the lessons of left-pad in mind.**

> "Those who cannot remember the past are condemned to repeat it."
> — George Santayana

Never let a 11-line package take down your production system again.
