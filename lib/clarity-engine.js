#!/usr/bin/env node

/**
 * Clarity Engine
 *
 * Analyzes dependencies and provides intelligence about the codebase.
 * Detects left-pad style vulnerabilities and calculates risk scores.
 *
 * Features:
 * - Dependency tree analysis
 * - Intelligence scoring
 * - Left-pad risk detection
 * - Dependency graph generation
 * - Export to multiple formats
 *
 * Usage:
 *   const clarity = new ClarityEngine({ db });
 *   await clarity.analyze();
 *   const graph = await clarity.generateGraph('mermaid');
 */

const fs = require('fs');
const path = require('path');

class ClarityEngine {
  constructor(options = {}) {
    this.db = options.db;
    this.dependencyMirror = options.dependencyMirror;
    this.urlIndex = options.urlIndex;

    if (!this.db) {
      throw new Error('Database connection required for ClarityEngine');
    }
  }

  /**
   * Analyze all vendored packages and calculate scores
   *
   * @returns {Promise<object>} - Analysis summary
   */
  async analyze() {
    console.log('[Clarity] Starting dependency analysis...\n');

    const packagesResult = await this.db.query(
      'SELECT * FROM vendored_packages WHERE vendor_status = $1',
      ['mirrored']
    );

    const packages = packagesResult.rows;
    let analyzed = 0;

    for (const pkg of packages) {
      try {
        await this.analyzePackage(pkg);
        analyzed++;
      } catch (error) {
        console.error(`[Clarity] Error analyzing ${pkg.package_name}:`, error.message);
      }
    }

    // Calculate overall statistics
    const stats = await this.calculateSystemStats();

    console.log(`\n[Clarity] Analysis complete: ${analyzed}/${packages.length} packages`);

    return stats;
  }

  /**
   * Analyze a single package
   *
   * @param {object} pkg - Package data
   * @returns {Promise<void>}
   */
  async analyzePackage(pkg) {
    console.log(`  Analyzing: ${pkg.package_name}@${pkg.package_version}`);

    // Calculate code metrics
    const codeMetrics = await this.calculateCodeMetrics(pkg);

    // Calculate quality metrics
    const qualityMetrics = await this.calculateQualityMetrics(pkg);

    // Calculate activity metrics (if GitHub repo available)
    const activityMetrics = await this.calculateActivityMetrics(pkg);

    // Calculate intelligence score
    const intelligenceScore = this.calculateIntelligenceScore(codeMetrics, qualityMetrics, activityMetrics);

    // Calculate left-pad risk
    const leftpadRisk = this.calculateLeftPadRisk(codeMetrics, pkg);

    // Store in database
    await this.storeIntelligence(pkg.id, {
      ...codeMetrics,
      ...qualityMetrics,
      ...activityMetrics,
      intelligence_score: intelligenceScore,
      leftpad_risk_score: leftpadRisk,
      is_trivial: leftpadRisk > 70
    });

    // Update package risk score
    await this.db.query(
      `UPDATE vendored_packages
       SET risk_score = $1,
           is_tiny = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [leftpadRisk, leftpadRisk > 70, pkg.id]
    );
  }

  /**
   * Calculate code metrics (LOC, complexity, etc.)
   *
   * Note: In a real implementation, this would download and analyze the package.
   * For now, we estimate based on package size.
   */
  async calculateCodeMetrics(pkg) {
    // Estimate metrics from package size
    const sizeBytes = pkg.object_size || 0;
    const estimatedLOC = Math.floor(sizeBytes / 50); // Rough estimate

    return {
      lines_of_code: estimatedLOC,
      file_count: Math.max(1, Math.floor(estimatedLOC / 100)),
      function_count: Math.max(1, Math.floor(estimatedLOC / 20)),
      class_count: Math.max(0, Math.floor(estimatedLOC / 100)),
      complexity_score: Math.min(100, Math.floor(estimatedLOC / 10))
    };
  }

  /**
   * Calculate quality metrics
   */
  async calculateQualityMetrics(pkg) {
    const deps = pkg.dependencies || {};
    const devDeps = pkg.dev_dependencies || {};

    return {
      has_tests: Object.keys(devDeps).some(dep =>
        dep.includes('test') || dep.includes('jest') || dep.includes('mocha')
      ),
      test_coverage: null, // Would need to analyze actual package
      has_typescript: Object.keys(devDeps).some(dep =>
        dep === 'typescript' || dep === '@types/node'
      ),
      has_documentation: !!pkg.description,
      has_changelog: false // Would need to check actual package
    };
  }

  /**
   * Calculate activity metrics from GitHub
   */
  async calculateActivityMetrics(pkg) {
    if (!pkg.repository_url || !pkg.repository_url.includes('github.com')) {
      return {
        github_stars: null,
        github_forks: null,
        github_issues_open: null,
        last_commit_at: null,
        commit_frequency: null,
        contributor_count: null
      };
    }

    // In a real implementation, we'd fetch from GitHub API
    // For now, return nulls
    return {
      github_stars: null,
      github_forks: null,
      github_issues_open: null,
      last_commit_at: null,
      commit_frequency: null,
      contributor_count: null
    };
  }

  /**
   * Calculate overall intelligence score (0-100)
   */
  calculateIntelligenceScore(codeMetrics, qualityMetrics, activityMetrics) {
    let score = 0;

    // Code complexity (0-30 points)
    if (codeMetrics.lines_of_code > 1000) score += 30;
    else if (codeMetrics.lines_of_code > 500) score += 20;
    else if (codeMetrics.lines_of_code > 100) score += 10;
    else score += 5;

    // Quality indicators (0-40 points)
    if (qualityMetrics.has_tests) score += 15;
    if (qualityMetrics.has_typescript) score += 10;
    if (qualityMetrics.has_documentation) score += 10;
    if (qualityMetrics.has_changelog) score += 5;

    // Activity indicators (0-30 points)
    if (activityMetrics.github_stars !== null) {
      if (activityMetrics.github_stars > 1000) score += 30;
      else if (activityMetrics.github_stars > 100) score += 20;
      else if (activityMetrics.github_stars > 10) score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Calculate left-pad risk score (0-100, higher = riskier)
   *
   * High risk = small codebase + many dependents + low complexity
   */
  calculateLeftPadRisk(codeMetrics, pkg) {
    let risk = 0;

    // Small codebase factor (0-40 points)
    if (codeMetrics.lines_of_code < 50) risk += 40;
    else if (codeMetrics.lines_of_code < 200) risk += 25;
    else if (codeMetrics.lines_of_code < 500) risk += 10;

    // Many dependents factor (0-40 points)
    const dependentCount = pkg.dependent_count || 0;
    if (dependentCount > 1000) risk += 40;
    else if (dependentCount > 100) risk += 25;
    else if (dependentCount > 10) risk += 10;

    // Low complexity factor (0-20 points)
    if (codeMetrics.complexity_score < 10) risk += 20;
    else if (codeMetrics.complexity_score < 50) risk += 10;

    return Math.min(100, risk);
  }

  /**
   * Store intelligence data in database
   */
  async storeIntelligence(packageId, metrics) {
    await this.db.query(
      `INSERT INTO package_intelligence (
        package_id,
        lines_of_code,
        file_count,
        function_count,
        class_count,
        complexity_score,
        has_tests,
        test_coverage,
        has_typescript,
        has_documentation,
        has_changelog,
        github_stars,
        github_forks,
        github_issues_open,
        last_commit_at,
        commit_frequency,
        contributor_count,
        intelligence_score,
        is_trivial,
        leftpad_risk_score,
        calculated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (package_id) DO UPDATE SET
        lines_of_code = EXCLUDED.lines_of_code,
        file_count = EXCLUDED.file_count,
        function_count = EXCLUDED.function_count,
        class_count = EXCLUDED.class_count,
        complexity_score = EXCLUDED.complexity_score,
        has_tests = EXCLUDED.has_tests,
        test_coverage = EXCLUDED.test_coverage,
        has_typescript = EXCLUDED.has_typescript,
        has_documentation = EXCLUDED.has_documentation,
        has_changelog = EXCLUDED.has_changelog,
        github_stars = EXCLUDED.github_stars,
        github_forks = EXCLUDED.github_forks,
        github_issues_open = EXCLUDED.github_issues_open,
        last_commit_at = EXCLUDED.last_commit_at,
        commit_frequency = EXCLUDED.commit_frequency,
        contributor_count = EXCLUDED.contributor_count,
        intelligence_score = EXCLUDED.intelligence_score,
        is_trivial = EXCLUDED.is_trivial,
        leftpad_risk_score = EXCLUDED.leftpad_risk_score,
        updated_at = CURRENT_TIMESTAMP`,
      [
        packageId,
        metrics.lines_of_code,
        metrics.file_count,
        metrics.function_count,
        metrics.class_count,
        metrics.complexity_score,
        metrics.has_tests,
        metrics.test_coverage,
        metrics.has_typescript,
        metrics.has_documentation,
        metrics.has_changelog,
        metrics.github_stars,
        metrics.github_forks,
        metrics.github_issues_open,
        metrics.last_commit_at,
        metrics.commit_frequency,
        metrics.contributor_count,
        metrics.intelligence_score,
        metrics.is_trivial,
        metrics.leftpad_risk_score
      ]
    );
  }

  /**
   * Calculate system-wide statistics
   */
  async calculateSystemStats() {
    const result = await this.db.query(`
      SELECT
        COUNT(*) as total_packages,
        AVG(pi.intelligence_score) as avg_intelligence,
        AVG(pi.leftpad_risk_score) as avg_risk,
        COUNT(*) FILTER (WHERE pi.leftpad_risk_score > 70) as high_risk_count,
        COUNT(*) FILTER (WHERE pi.is_trivial = true) as trivial_count,
        COUNT(*) FILTER (WHERE vp.is_critical = true) as critical_count,
        SUM(vp.dependent_count) as total_dependents
      FROM vendored_packages vp
      LEFT JOIN package_intelligence pi ON pi.package_id = vp.id
      WHERE vp.vendor_status = 'mirrored'
    `);

    return result.rows[0];
  }

  /**
   * Generate dependency graph
   *
   * @param {string} format - Output format ('json', 'mermaid', 'dot')
   * @param {object} options - Generation options
   * @returns {Promise<string>} - Graph representation
   */
  async generateGraph(format = 'mermaid', options = {}) {
    const {
      rootPackage = null,
      maxDepth = 3,
      includeRiskScores = true
    } = options;

    // Build dependency graph
    const graph = await this.buildDependencyGraph(rootPackage, maxDepth);

    switch (format) {
      case 'json':
        return JSON.stringify(graph, null, 2);

      case 'mermaid':
        return this.graphToMermaid(graph, includeRiskScores);

      case 'dot':
        return this.graphToDot(graph, includeRiskScores);

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Build dependency graph from database
   */
  async buildDependencyGraph(rootPackage = null, maxDepth = 3) {
    const graph = {
      nodes: [],
      edges: []
    };

    const visited = new Set();

    const traverse = async (packageName, packageVersion, depth = 0) => {
      if (depth > maxDepth) return;

      const key = `${packageName}@${packageVersion}`;
      if (visited.has(key)) return;
      visited.add(key);

      // Get package info
      const pkgResult = await this.db.query(
        `SELECT vp.*, pi.intelligence_score, pi.leftpad_risk_score
         FROM vendored_packages vp
         LEFT JOIN package_intelligence pi ON pi.package_id = vp.id
         WHERE vp.package_name = $1 AND vp.package_version = $2`,
        [packageName, packageVersion]
      );

      if (pkgResult.rows.length === 0) return;

      const pkg = pkgResult.rows[0];

      // Add node
      graph.nodes.push({
        id: key,
        name: packageName,
        version: packageVersion,
        intelligenceScore: pkg.intelligence_score,
        riskScore: pkg.leftpad_risk_score,
        isCritical: pkg.is_critical,
        depth
      });

      // Get dependencies
      const depsResult = await this.db.query(
        `SELECT child_package_name, child_package_version
         FROM package_dependencies
         WHERE parent_package_id = $1`,
        [pkg.id]
      );

      for (const dep of depsResult.rows) {
        const depKey = `${dep.child_package_name}@${dep.child_package_version}`;

        // Add edge
        graph.edges.push({
          from: key,
          to: depKey
        });

        // Traverse child
        await traverse(dep.child_package_name, dep.child_package_version, depth + 1);
      }
    };

    if (rootPackage) {
      const [name, version] = rootPackage.split('@');
      await traverse(name, version || 'latest');
    } else {
      // Get all root packages (those without parents)
      const rootsResult = await this.db.query(`
        SELECT DISTINCT package_name, package_version
        FROM vendored_packages
        WHERE id NOT IN (SELECT child_package_name FROM package_dependencies)
        LIMIT 10
      `);

      for (const root of rootsResult.rows) {
        await traverse(root.package_name, root.package_version);
      }
    }

    return graph;
  }

  /**
   * Convert graph to Mermaid diagram
   */
  graphToMermaid(graph, includeRiskScores = true) {
    let mermaid = 'graph TD\n';

    // Add nodes with styling
    for (const node of graph.nodes) {
      const label = includeRiskScores
        ? `${node.name}@${node.version}<br/>Risk: ${node.riskScore || 'N/A'}`
        : `${node.name}@${node.version}`;

      const nodeId = node.id.replace(/[@.]/g, '_');

      // Style based on risk score
      if (node.riskScore > 70) {
        mermaid += `    ${nodeId}["${label}"]:::highRisk\n`;
      } else if (node.isCritical) {
        mermaid += `    ${nodeId}["${label}"]:::critical\n`;
      } else {
        mermaid += `    ${nodeId}["${label}"]\n`;
      }
    }

    // Add edges
    for (const edge of graph.edges) {
      const fromId = edge.from.replace(/[@.]/g, '_');
      const toId = edge.to.replace(/[@.]/g, '_');
      mermaid += `    ${fromId} --> ${toId}\n`;
    }

    // Add styles
    mermaid += '\n';
    mermaid += '    classDef highRisk fill:#f99,stroke:#f00,stroke-width:2px\n';
    mermaid += '    classDef critical fill:#9f9,stroke:#0f0,stroke-width:2px\n';

    return mermaid;
  }

  /**
   * Convert graph to GraphViz DOT format
   */
  graphToDot(graph, includeRiskScores = true) {
    let dot = 'digraph Dependencies {\n';
    dot += '    rankdir=LR;\n';
    dot += '    node [shape=box];\n\n';

    // Add nodes
    for (const node of graph.nodes) {
      const label = includeRiskScores
        ? `${node.name}@${node.version}\\nRisk: ${node.riskScore || 'N/A'}`
        : `${node.name}@${node.version}`;

      const nodeId = node.id.replace(/[@.-]/g, '_');

      let style = '';
      if (node.riskScore > 70) {
        style = ' [fillcolor="#ff9999", style=filled]';
      } else if (node.isCritical) {
        style = ' [fillcolor="#99ff99", style=filled]';
      }

      dot += `    ${nodeId} [label="${label}"]${style};\n`;
    }

    dot += '\n';

    // Add edges
    for (const edge of graph.edges) {
      const fromId = edge.from.replace(/[@.-]/g, '_');
      const toId = edge.to.replace(/[@.-]/g, '_');
      dot += `    ${fromId} -> ${toId};\n`;
    }

    dot += '}\n';

    return dot;
  }

  /**
   * Find packages with left-pad risk
   *
   * @param {number} minRisk - Minimum risk score (default: 70)
   * @returns {Promise<array>} - Risky packages
   */
  async findLeftPadRisks(minRisk = 70) {
    const result = await this.db.query(`
      SELECT
        vp.package_name,
        vp.package_version,
        pi.leftpad_risk_score,
        pi.lines_of_code,
        vp.dependent_count,
        pi.complexity_score,
        vp.is_critical
      FROM vendored_packages vp
      INNER JOIN package_intelligence pi ON pi.package_id = vp.id
      WHERE pi.leftpad_risk_score >= $1
      ORDER BY pi.leftpad_risk_score DESC, vp.dependent_count DESC
    `, [minRisk]);

    return result.rows;
  }

  /**
   * Get detailed package report
   *
   * @param {string} packageName - Package name
   * @param {string} version - Version
   * @returns {Promise<object>} - Package report
   */
  async packageReport(packageName, version) {
    const result = await this.db.query(`
      SELECT
        vp.*,
        pi.*
      FROM vendored_packages vp
      LEFT JOIN package_intelligence pi ON pi.package_id = vp.id
      WHERE vp.package_name = $1 AND vp.package_version = $2
    `, [packageName, version]);

    if (result.rows.length === 0) {
      throw new Error(`Package not found: ${packageName}@${version}`);
    }

    const pkg = result.rows[0];

    // Get dependencies
    const depsResult = await this.db.query(`
      SELECT child_package_name, child_package_version, dependency_type, depth_level
      FROM package_dependencies
      WHERE parent_package_id = $1
      ORDER BY depth_level, child_package_name
    `, [pkg.id]);

    // Get usage stats
    const usageResult = await this.db.query(`
      SELECT COUNT(*) as usage_count, MAX(used_at) as last_used
      FROM package_usage_log
      WHERE package_id = $1
    `, [pkg.id]);

    return {
      package: {
        name: pkg.package_name,
        version: pkg.package_version,
        description: pkg.description,
        author: pkg.author,
        license: pkg.license
      },
      intelligence: {
        score: pkg.intelligence_score,
        linesOfCode: pkg.lines_of_code,
        complexity: pkg.complexity_score,
        hasTests: pkg.has_tests,
        hasTypeScript: pkg.has_typescript
      },
      risk: {
        leftpadRisk: pkg.leftpad_risk_score,
        isTrivial: pkg.is_trivial,
        isCritical: pkg.is_critical,
        dependentCount: pkg.dependent_count
      },
      dependencies: depsResult.rows,
      usage: usageResult.rows[0]
    };
  }
}

module.exports = ClarityEngine;
