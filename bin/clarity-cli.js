#!/usr/bin/env node

/**
 * Clarity CLI
 *
 * Command-line interface for the Clarity dependency management system.
 *
 * Commands:
 *   vendor <package>  - Mirror a package to prevent left-pad incidents
 *   analyze           - Analyze all dependencies and calculate risk scores
 *   list              - List vendored packages
 *   report <package>  - Get detailed package report
 *   urls              - Show tracked URLs
 *   risks             - Show packages with high left-pad risk
 *   graph             - Generate dependency graph
 *   stats             - Show system statistics
 *
 * Usage:
 *   npm run clarity:vendor left-pad@1.3.0
 *   npm run clarity:analyze
 *   npm run clarity:risks
 */

require('dotenv').config();
const { Pool } = require('pg');
const MinIOModelClient = require('../lib/minio-client');
const DependencyMirror = require('../lib/dependency-mirror');
const URLIndex = require('../lib/url-index');
const ClarityEngine = require('../lib/clarity-engine');
const fs = require('fs');
const path = require('path');

// Database configuration
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

// MinIO configuration
const minioClient = new MinIOModelClient({ db });

// Initialize systems
const dependencyMirror = new DependencyMirror({
  db,
  minioClient: minioClient.client,
  bucketName: 'calos-packages'
});

const urlIndex = new URLIndex({ db });
const clarityEngine = new ClarityEngine({ db, dependencyMirror, urlIndex });

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  try {
    switch (command) {
      case 'vendor':
        await vendorCommand(args.slice(1));
        break;

      case 'analyze':
        await analyzeCommand(args.slice(1));
        break;

      case 'list':
        await listCommand(args.slice(1));
        break;

      case 'report':
        await reportCommand(args.slice(1));
        break;

      case 'urls':
        await urlsCommand(args.slice(1));
        break;

      case 'risks':
        await risksCommand(args.slice(1));
        break;

      case 'graph':
        await graphCommand(args.slice(1));
        break;

      case 'stats':
        await statsCommand(args.slice(1));
        break;

      case 'critical':
        await criticalCommand(args.slice(1));
        break;

      case 'verify':
        await verifyCommand(args.slice(1));
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run with --help to see available commands');
        process.exit(1);
    }

    await db.end();
    process.exit(0);

  } catch (error) {
    console.error(`\nError: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    await db.end();
    process.exit(1);
  }
}

/**
 * Vendor a package
 */
async function vendorCommand(args) {
  if (args.length === 0) {
    console.error('Usage: clarity vendor <package>[@version]');
    process.exit(1);
  }

  const packageSpec = args[0];
  const [packageName, version = 'latest'] = packageSpec.split('@');

  console.log(`Vendoring ${packageName}@${version}...\n`);

  await minioClient.init();
  await dependencyMirror.init();

  const pkg = await dependencyMirror.vendor(packageName, version, {
    reason: 'cli-vendor',
    analyzeDependencies: !args.includes('--no-deps')
  });

  console.log(`\n✓ Successfully vendored ${pkg.package_name}@${pkg.package_version}`);
  console.log(`  Object path: ${pkg.minio_object_path}`);
  console.log(`  Size: ${(pkg.object_size / 1024).toFixed(2)} KB`);
  console.log(`  Checksum: ${pkg.checksum_sha256.substring(0, 16)}...`);

  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    console.log(`  Dependencies: ${Object.keys(pkg.dependencies).length}`);
  }
}

/**
 * Analyze all dependencies
 */
async function analyzeCommand(args) {
  console.log('Analyzing dependencies...\n');

  const stats = await clarityEngine.analyze();

  console.log('\n' + '='.repeat(50));
  console.log('ANALYSIS RESULTS');
  console.log('='.repeat(50));
  console.log(`Total packages: ${stats.total_packages}`);
  console.log(`Average intelligence: ${parseFloat(stats.avg_intelligence || 0).toFixed(1)}/100`);
  console.log(`Average risk: ${parseFloat(stats.avg_risk || 0).toFixed(1)}/100`);
  console.log(`High risk packages: ${stats.high_risk_count}`);
  console.log(`Trivial packages: ${stats.trivial_count}`);
  console.log(`Critical packages: ${stats.critical_count}`);
  console.log('='.repeat(50));
}

/**
 * List vendored packages
 */
async function listCommand(args) {
  const status = args.includes('--status') ? args[args.indexOf('--status') + 1] : null;
  const critical = args.includes('--critical') ? true : null;

  const packages = await dependencyMirror.list({
    status,
    critical,
    limit: args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 100
  });

  console.log(`\nFound ${packages.length} package(s):\n`);

  for (const pkg of packages) {
    const criticality = pkg.is_critical ? '[CRITICAL]' : '';
    const risk = pkg.risk_score ? `(risk: ${pkg.risk_score})` : '';

    console.log(`  ${pkg.package_name}@${pkg.package_version} ${criticality} ${risk}`);
    console.log(`    Status: ${pkg.vendor_status}`);
    console.log(`    Size: ${(pkg.object_size / 1024).toFixed(2)} KB`);
    if (pkg.description) {
      console.log(`    Description: ${pkg.description.substring(0, 80)}...`);
    }
    console.log('');
  }
}

/**
 * Show package report
 */
async function reportCommand(args) {
  if (args.length === 0) {
    console.error('Usage: clarity report <package>[@version]');
    process.exit(1);
  }

  const packageSpec = args[0];
  const [packageName, version = 'latest'] = packageSpec.split('@');

  const report = await clarityEngine.packageReport(packageName, version);

  console.log('\n' + '='.repeat(50));
  console.log(`PACKAGE REPORT: ${report.package.name}@${report.package.version}`);
  console.log('='.repeat(50));

  console.log('\nPackage Info:');
  console.log(`  Description: ${report.package.description || 'N/A'}`);
  console.log(`  Author: ${report.package.author || 'N/A'}`);
  console.log(`  License: ${report.package.license || 'N/A'}`);

  console.log('\nIntelligence:');
  console.log(`  Score: ${report.intelligence.score || 'N/A'}/100`);
  console.log(`  Lines of Code: ${report.intelligence.linesOfCode || 'N/A'}`);
  console.log(`  Complexity: ${report.intelligence.complexity || 'N/A'}`);
  console.log(`  Has Tests: ${report.intelligence.hasTests ? 'Yes' : 'No'}`);
  console.log(`  Has TypeScript: ${report.intelligence.hasTypeScript ? 'Yes' : 'No'}`);

  console.log('\nRisk Assessment:');
  console.log(`  Left-pad Risk: ${report.risk.leftpadRisk || 'N/A'}/100`);
  console.log(`  Is Trivial: ${report.risk.isTrivial ? 'Yes (WARNING)' : 'No'}`);
  console.log(`  Is Critical: ${report.risk.isCritical ? 'Yes' : 'No'}`);
  console.log(`  Dependent Count: ${report.risk.dependentCount || 0}`);

  if (report.dependencies.length > 0) {
    console.log(`\nDependencies (${report.dependencies.length}):`);
    for (const dep of report.dependencies.slice(0, 10)) {
      console.log(`  ${dep.child_package_name}@${dep.child_package_version} (depth: ${dep.depth_level})`);
    }
    if (report.dependencies.length > 10) {
      console.log(`  ... and ${report.dependencies.length - 10} more`);
    }
  }

  console.log(`\nUsage:`);
  console.log(`  Access Count: ${report.usage.usage_count || 0}`);
  console.log(`  Last Used: ${report.usage.last_used || 'Never'}`);

  console.log('\n' + '='.repeat(50));
}

/**
 * Show tracked URLs
 */
async function urlsCommand(args) {
  let urls;

  if (args.includes('--domain')) {
    const domain = args[args.indexOf('--domain') + 1];
    urls = await urlIndex.byDomain(domain);
  } else if (args.includes('--top')) {
    const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 10;
    urls = await urlIndex.topUrls(limit);
  } else if (args.includes('--failed')) {
    urls = await urlIndex.failedUrls();
  } else {
    // Show statistics
    const stats = await urlIndex.statistics();

    console.log('\n' + '='.repeat(50));
    console.log('URL INDEX STATISTICS');
    console.log('='.repeat(50));
    console.log(`Total URLs: ${stats.total_urls}`);
    console.log(`Critical URLs: ${stats.critical_urls}`);
    console.log(`Failed URLs: ${stats.failed_urls}`);
    console.log(`Total Fetches: ${stats.total_fetches}`);
    console.log(`Unique Domains: ${stats.unique_domains}`);
    console.log(`Avg Fetches/URL: ${parseFloat(stats.avg_fetches_per_url).toFixed(1)}`);

    console.log('\nTop Domains:');
    for (const domain of stats.top_domains) {
      console.log(`  ${domain.domain}: ${domain.url_count} URLs, ${domain.total_fetches} fetches`);
    }

    console.log('\nBy Type:');
    for (const type of stats.by_type) {
      console.log(`  ${type.url_type}: ${type.count}`);
    }

    console.log('\n' + '='.repeat(50));
    return;
  }

  console.log(`\nFound ${urls.length} URL(s):\n`);

  for (const url of urls) {
    const critical = url.is_critical ? '[CRITICAL]' : '';
    const status = url.last_fetch_success ? '✓' : '✗';

    console.log(`  ${status} ${url.url} ${critical}`);
    console.log(`    Type: ${url.url_type}`);
    console.log(`    Fetch count: ${url.fetch_count}`);
    console.log(`    Last fetched: ${url.last_fetched_at}`);
    if (url.comments) {
      console.log(`    Note: ${url.comments}`);
    }
    console.log('');
  }
}

/**
 * Show packages with high left-pad risk
 */
async function risksCommand(args) {
  const minRisk = args.includes('--min') ? parseInt(args[args.indexOf('--min') + 1]) : 70;

  console.log(`\nPackages with left-pad risk >= ${minRisk}:\n`);

  const risks = await clarityEngine.findLeftPadRisks(minRisk);

  if (risks.length === 0) {
    console.log('  No high-risk packages found! ✓\n');
    return;
  }

  for (const pkg of risks) {
    const critical = pkg.is_critical ? '[CRITICAL]' : '';

    console.log(`  ${pkg.package_name}@${pkg.package_version} ${critical}`);
    console.log(`    Risk Score: ${pkg.leftpad_risk_score}/100`);
    console.log(`    Lines of Code: ${pkg.lines_of_code}`);
    console.log(`    Dependents: ${pkg.dependent_count}`);
    console.log(`    Complexity: ${pkg.complexity_score}`);
    console.log('');
  }

  console.log(`\n⚠️  Found ${risks.length} package(s) with left-pad risk\n`);
}

/**
 * Generate dependency graph
 */
async function graphCommand(args) {
  const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'mermaid';
  const output = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
  const rootPackage = args.includes('--root') ? args[args.indexOf('--root') + 1] : null;

  console.log(`\nGenerating dependency graph (${format})...\n`);

  const graph = await clarityEngine.generateGraph(format, {
    rootPackage,
    maxDepth: args.includes('--depth') ? parseInt(args[args.indexOf('--depth') + 1]) : 3
  });

  if (output) {
    fs.writeFileSync(output, graph);
    console.log(`✓ Graph saved to: ${output}\n`);
  } else {
    console.log(graph);
  }
}

/**
 * Show system statistics
 */
async function statsCommand(args) {
  const stats = await clarityEngine.calculateSystemStats();

  console.log('\n' + '='.repeat(50));
  console.log('CLARITY SYSTEM STATISTICS');
  console.log('='.repeat(50));
  console.log(`Total Packages: ${stats.total_packages}`);
  console.log(`Average Intelligence: ${parseFloat(stats.avg_intelligence || 0).toFixed(1)}/100`);
  console.log(`Average Risk: ${parseFloat(stats.avg_risk || 0).toFixed(1)}/100`);
  console.log(`High Risk Packages: ${stats.high_risk_count}`);
  console.log(`Trivial Packages: ${stats.trivial_count}`);
  console.log(`Critical Packages: ${stats.critical_count}`);
  console.log(`Total Dependents: ${stats.total_dependents}`);
  console.log('='.repeat(50));
}

/**
 * Mark package as critical
 */
async function criticalCommand(args) {
  if (args.length === 0) {
    console.error('Usage: clarity critical <package>[@version]');
    process.exit(1);
  }

  const packageSpec = args[0];
  const [packageName, version = 'latest'] = packageSpec.split('@');

  await dependencyMirror.markCritical(packageName, version);

  console.log(`\n✓ Marked ${packageName}@${version} as critical\n`);
}

/**
 * Verify package integrity
 */
async function verifyCommand(args) {
  if (args.length === 0) {
    console.error('Usage: clarity verify <package>[@version]');
    process.exit(1);
  }

  const packageSpec = args[0];
  const [packageName, version = 'latest'] = packageSpec.split('@');

  console.log(`\nVerifying ${packageName}@${version}...\n`);

  const result = await dependencyMirror.verify(packageName, version);

  if (result.valid) {
    console.log(`✓ Package integrity verified\n`);
  } else {
    console.log(`✗ Package integrity FAILED`);
    console.log(`  Expected: ${result.expected}`);
    console.log(`  Actual:   ${result.actual}\n`);
    process.exit(1);
  }
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
Clarity CLI - Dependency Management & Left-Pad Prevention

Usage:
  clarity <command> [options]

Commands:
  vendor <package>       Vendor a package to MinIO
  analyze                Analyze all dependencies and calculate risk scores
  list                   List vendored packages
  report <package>       Get detailed package report
  urls                   Show tracked URLs and statistics
  risks                  Show packages with high left-pad risk
  graph                  Generate dependency graph
  stats                  Show system statistics
  critical <package>     Mark a package as critical
  verify <package>       Verify package integrity

Options:
  --help, -h             Show this help
  --status <status>      Filter by status (list)
  --critical             Show only critical packages (list)
  --limit <n>            Limit results (list, urls)
  --domain <domain>      Filter URLs by domain (urls)
  --top                  Show top URLs (urls)
  --failed               Show failed URLs (urls)
  --min <score>          Minimum risk score (risks)
  --format <format>      Output format: mermaid, json, dot (graph)
  --output <file>        Save output to file (graph)
  --root <package>       Root package for graph (graph)
  --depth <n>            Max depth for graph (graph)
  --no-deps              Don't vendor dependencies (vendor)

Examples:
  # Vendor a package
  clarity vendor left-pad@1.3.0

  # Analyze all dependencies
  clarity analyze

  # Show high-risk packages
  clarity risks --min 70

  # Generate Mermaid diagram
  clarity graph --format mermaid --output deps.mmd

  # Get package report
  clarity report express@4.18.2

  # Show URL statistics
  clarity urls

  # Show top URLs
  clarity urls --top --limit 20

  # Mark package as critical
  clarity critical express

  # Verify package integrity
  clarity verify left-pad@1.3.0
  `);
}

// Run
if (require.main === module) {
  main();
}

module.exports = { main };
