// OSS Trending Analyzer
//
// Analyzes trending open-source projects from GitHub/GitLab
// Deconstructs features and suggests integrations into CALOS
// Ensures backward compatibility only with CALOS (no breaking changes)

const axios = require('axios');
const crypto = require('crypto');

class OSSTrendingAnalyzer {
  constructor(pool) {
    this.pool = pool;
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  // ============================================================================
  // Trending Repo Fetching (reuses content-curator.js logic)
  // ============================================================================

  /**
   * Fetch GitHub trending repos
   * @param {string} language - Programming language filter (optional)
   * @param {string} since - Time range (daily, weekly, monthly)
   */
  async fetchGitHubTrending(language = '', since = 'daily') {
    const cacheKey = `github-trending-${language}-${since}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      // Use unofficial GitHub trending scraper
      const url = `https://api.gitterapp.com/repositories${language ? `?language=${language}` : ''}`;
      const response = await axios.get(url, { timeout: 15000 });

      const repos = response.data.slice(0, 50).map(repo => ({
        fullName: repo.full_name,
        name: repo.name,
        owner: repo.owner?.login || '',
        description: repo.description || '',
        url: repo.html_url,
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
        language: repo.language,
        topics: repo.topics || [],
        createdAt: new Date(repo.created_at),
        updatedAt: new Date(repo.updated_at || repo.created_at),
        homepage: repo.homepage,
        license: repo.license?.name,
        size: repo.size,
        openIssues: repo.open_issues_count || 0
      }));

      this.cache.set(cacheKey, { data: repos, timestamp: Date.now() });
      return repos;
    } catch (error) {
      console.error('[OSSTrendingAnalyzer] Error fetching GitHub trending:', error.message);
      return [];
    }
  }

  /**
   * Fetch GitLab trending projects
   */
  async fetchGitLabTrending() {
    const cacheKey = 'gitlab-trending';
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      // GitLab trending projects (sorted by stars)
      const response = await axios.get('https://gitlab.com/api/v4/projects?order_by=star_count&sort=desc&per_page=50', {
        timeout: 15000
      });

      const repos = response.data.map(proj => ({
        fullName: proj.path_with_namespace,
        name: proj.name,
        owner: proj.namespace?.name || '',
        description: proj.description || '',
        url: proj.web_url,
        stars: proj.star_count || 0,
        forks: proj.forks_count || 0,
        language: null, // GitLab doesn't provide primary language easily
        topics: proj.topics || proj.tag_list || [],
        createdAt: new Date(proj.created_at),
        updatedAt: new Date(proj.last_activity_at || proj.created_at),
        homepage: null,
        license: null,
        openIssues: proj.open_issues_count || 0
      }));

      this.cache.set(cacheKey, { data: repos, timestamp: Date.now() });
      return repos;
    } catch (error) {
      console.error('[OSSTrendingAnalyzer] Error fetching GitLab trending:', error.message);
      return [];
    }
  }

  // ============================================================================
  // Feature Deconstruction
  // ============================================================================

  /**
   * Analyze a repository to extract features/patterns
   * @param {object} repo - Repository object
   */
  async analyzeRepo(repo) {
    try {
      // Fetch README for feature detection
      const readmeUrl = `https://raw.githubusercontent.com/${repo.fullName}/main/README.md`;
      let readme = '';

      try {
        const response = await axios.get(readmeUrl, { timeout: 10000 });
        readme = response.data;
      } catch (err) {
        // Try master branch
        const fallbackUrl = `https://raw.githubusercontent.com/${repo.fullName}/master/README.md`;
        try {
          const response = await axios.get(fallbackUrl, { timeout: 10000 });
          readme = response.data;
        } catch (err2) {
          // No README available
        }
      }

      // Extract features from README and topics
      const features = this.extractFeatures(readme, repo.topics, repo.description);

      // Categorize repo
      const category = this.categorizeRepo(repo, features);

      // Suggest integrations into CALOS
      const integrations = this.suggestIntegrations(repo, features, category);

      return {
        repo: {
          name: repo.fullName,
          url: repo.url,
          stars: repo.stars,
          language: repo.language
        },
        category,
        features,
        integrations,
        analyzedAt: new Date()
      };
    } catch (error) {
      console.error(`[OSSTrendingAnalyzer] Error analyzing ${repo.fullName}:`, error.message);
      return null;
    }
  }

  /**
   * Extract features from README and metadata
   * @param {string} readme - README content
   * @param {array} topics - GitHub topics
   * @param {string} description - Repo description
   */
  extractFeatures(readme, topics, description) {
    const text = `${readme} ${topics.join(' ')} ${description}`.toLowerCase();
    const features = [];

    // Common feature patterns
    const patterns = {
      'AI/ML': ['ai', 'ml', 'machine learning', 'neural network', 'gpt', 'llm', 'transformer', 'bert'],
      'Authentication': ['auth', 'oauth', 'jwt', 'saml', 'sso', 'login'],
      'Database': ['database', 'postgresql', 'mysql', 'mongodb', 'redis', 'sqlite', 'orm'],
      'API': ['api', 'rest', 'graphql', 'grpc', 'webhook'],
      'Caching': ['cache', 'caching', 'redis', 'memcached'],
      'Queue': ['queue', 'job', 'worker', 'bull', 'rabbitmq', 'kafka'],
      'Monitoring': ['monitoring', 'observability', 'metrics', 'prometheus', 'grafana'],
      'Logging': ['logging', 'logs', 'winston', 'pino', 'sentry'],
      'Testing': ['test', 'testing', 'jest', 'mocha', 'cypress', 'playwright'],
      'CI/CD': ['ci', 'cd', 'github actions', 'gitlab ci', 'jenkins', 'deployment'],
      'Serverless': ['serverless', 'lambda', 'cloud functions', 'edge'],
      'Real-time': ['websocket', 'socket.io', 'real-time', 'sse'],
      'Search': ['search', 'elasticsearch', 'algolia', 'full-text'],
      'File Storage': ['s3', 'storage', 'upload', 'cdn'],
      'Email': ['email', 'smtp', 'sendgrid', 'mailgun', 'ses'],
      'PDF': ['pdf', 'pdf generation', 'puppeteer'],
      'Image Processing': ['image', 'sharp', 'imagemagick', 'canvas'],
      'Video': ['video', 'streaming', 'ffmpeg'],
      'Encryption': ['encryption', 'crypto', 'aes', 'rsa'],
      'Rate Limiting': ['rate limit', 'throttle', 'ddos'],
      'Markdown': ['markdown', 'md', 'commonmark'],
      'CLI': ['cli', 'command line', 'terminal'],
      'Dashboard': ['dashboard', 'admin panel', 'ui'],
      'Analytics': ['analytics', 'tracking', 'ga'],
      'SEO': ['seo', 'sitemap', 'robots.txt'],
      'i18n': ['i18n', 'internationalization', 'localization', 'translation']
    };

    for (const [feature, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        features.push(feature);
      }
    }

    return features;
  }

  /**
   * Categorize repository
   * @param {object} repo - Repository object
   * @param {array} features - Extracted features
   */
  categorizeRepo(repo, features) {
    // Determine primary category based on features and language
    if (features.includes('AI/ML')) return 'AI/ML';
    if (features.includes('Authentication')) return 'Security';
    if (features.includes('Database') || features.includes('API')) return 'Backend';
    if (features.includes('Dashboard') || features.includes('UI')) return 'Frontend';
    if (features.includes('CI/CD') || features.includes('Monitoring')) return 'DevOps';
    if (features.includes('CLI')) return 'CLI Tool';

    // Fallback to language-based categorization
    if (repo.language === 'JavaScript' || repo.language === 'TypeScript') return 'JavaScript';
    if (repo.language === 'Python') return 'Python';
    if (repo.language === 'Go') return 'Go';
    if (repo.language === 'Rust') return 'Rust';

    return 'Other';
  }

  /**
   * Suggest integrations into CALOS
   * @param {object} repo - Repository object
   * @param {array} features - Extracted features
   * @param {string} category - Repository category
   */
  suggestIntegrations(repo, features, category) {
    const integrations = [];

    // Map features to CALOS integration points
    const integrationMap = {
      'AI/ML': {
        where: 'router.js (AI model routing)',
        how: 'Add as new AI provider or model selector',
        priority: 'high',
        backwardCompatible: true
      },
      'Authentication': {
        where: 'lib/oauth-wizard.js',
        how: 'Add as new OAuth provider',
        priority: 'medium',
        backwardCompatible: true
      },
      'Database': {
        where: 'lib/bucket-instance.js',
        how: 'Add as bucket storage option',
        priority: 'medium',
        backwardCompatible: true
      },
      'API': {
        where: 'routes/* (new route file)',
        how: 'Expose as new API endpoint',
        priority: 'low',
        backwardCompatible: true
      },
      'Caching': {
        where: 'lib/portfolio-hub.js (cache implementation)',
        how: 'Replace in-memory cache with this solution',
        priority: 'medium',
        backwardCompatible: false // Would need migration
      },
      'Queue': {
        where: 'lib/ (new queue manager)',
        how: 'Add for background job processing',
        priority: 'high',
        backwardCompatible: true
      },
      'Monitoring': {
        where: 'lib/ (new monitoring module)',
        how: 'Integrate for system observability',
        priority: 'medium',
        backwardCompatible: true
      },
      'Real-time': {
        where: 'lib/lofi-streaming-engine.js',
        how: 'Enhance WebSocket implementation',
        priority: 'low',
        backwardCompatible: false
      },
      'Email': {
        where: 'lib/gmail-gateway.js',
        how: 'Add as alternative email provider',
        priority: 'low',
        backwardCompatible: true
      },
      'Analytics': {
        where: 'lib/embed-manager.js',
        how: 'Enhance analytics tracking',
        priority: 'medium',
        backwardCompatible: true
      }
    };

    for (const feature of features) {
      if (integrationMap[feature]) {
        integrations.push({
          feature,
          ...integrationMap[feature],
          repo: repo.fullName,
          stars: repo.stars
        });
      }
    }

    // Sort by priority (high → medium → low) and stars
    integrations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      return priorityDiff !== 0 ? priorityDiff : b.stars - a.stars;
    });

    return integrations;
  }

  // ============================================================================
  // Backward Compatibility Analysis
  // ============================================================================

  /**
   * Analyze if integration would break backward compatibility
   * @param {object} integration - Integration suggestion
   */
  async analyzeBackwardCompatibility(integration) {
    // Rules for backward compatibility
    const rules = {
      // Adding new features: Always compatible
      addNewRoute: true,
      addNewLibrary: true,
      addNewEndpoint: true,

      // Modifying existing: Need feature flags
      modifyExistingRoute: false,
      modifyExistingLibrary: false,
      changeAPIResponse: false,

      // Database: Need migrations
      addTable: true,
      modifyTable: false,
      removeTable: false,

      // Config: Need fallbacks
      addConfig: true,
      modifyConfig: false,
      removeConfig: false
    };

    // Determine compatibility based on integration type
    if (integration.backwardCompatible === false) {
      return {
        compatible: false,
        reason: 'Would modify existing functionality',
        solution: 'Add feature flag + version toggle',
        migrationRequired: true
      };
    }

    return {
      compatible: true,
      reason: 'Additive integration, no breaking changes',
      solution: 'Direct integration',
      migrationRequired: false
    };
  }

  /**
   * Create integration plan with compatibility strategy
   * @param {array} integrations - Integration suggestions
   */
  async createIntegrationPlan(integrations) {
    const plan = {
      version: 'CALOS v2.0', // New major version if breaking changes
      createdAt: new Date(),
      totalIntegrations: integrations.length,
      compatibleIntegrations: [],
      breakingIntegrations: [],
      migrationSteps: []
    };

    for (const integration of integrations) {
      const compatibility = await this.analyzeBackwardCompatibility(integration);

      if (compatibility.compatible) {
        plan.compatibleIntegrations.push({
          ...integration,
          compatibility
        });
      } else {
        plan.breakingIntegrations.push({
          ...integration,
          compatibility
        });

        // Add migration step
        plan.migrationSteps.push({
          step: plan.migrationSteps.length + 1,
          description: `Migrate ${integration.feature} with feature flag`,
          feature: integration.feature,
          file: integration.where,
          migrationRequired: compatibility.migrationRequired
        });
      }
    }

    return plan;
  }

  // ============================================================================
  // Trending Analysis Storage
  // ============================================================================

  /**
   * Save trending analysis to database
   * @param {object} analysis - Analysis results
   */
  async saveAnalysis(analysis) {
    // Store in a JSON field for now (could add dedicated table later)
    const query = `
      INSERT INTO portfolio_timeline (
        user_id, event_type, event_category, title, description,
        event_data, source, is_public, event_timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      null, // System event, no specific user
      'oss_analysis',
      'system',
      `OSS Trending Analysis: ${analysis.repo.name}`,
      `Analyzed ${analysis.features.length} features, ${analysis.integrations.length} integration suggestions`,
      JSON.stringify(analysis),
      'oss_trending_analyzer',
      false, // Private by default
      new Date()
    ]);

    return result.rows[0];
  }

  /**
   * Get recent analyses
   * @param {number} limit - Number of analyses to fetch
   */
  async getRecentAnalyses(limit = 20) {
    const query = `
      SELECT event_data FROM portfolio_timeline
      WHERE event_type = 'oss_analysis'
      ORDER BY event_timestamp DESC
      LIMIT $1
    `;

    const result = await this.pool.query(query, [limit]);
    return result.rows.map(row => row.event_data);
  }

  // ============================================================================
  // Batch Analysis
  // ============================================================================

  /**
   * Analyze trending repos and generate integration plan
   * @param {string} language - Programming language filter
   * @param {number} limit - Number of repos to analyze
   */
  async analyzeTrending(language = '', limit = 20) {
    console.log(`[OSSTrendingAnalyzer] Fetching trending ${language || 'all'} repos...`);

    // Fetch trending repos
    const repos = await this.fetchGitHubTrending(language);
    const topRepos = repos.slice(0, limit);

    console.log(`[OSSTrendingAnalyzer] Analyzing ${topRepos.length} repos...`);

    // Analyze each repo
    const analyses = [];
    for (const repo of topRepos) {
      const analysis = await this.analyzeRepo(repo);
      if (analysis && analysis.integrations.length > 0) {
        analyses.push(analysis);
        await this.saveAnalysis(analysis);
      }
    }

    // Create integration plan
    const allIntegrations = analyses.flatMap(a => a.integrations);
    const plan = await this.createIntegrationPlan(allIntegrations);

    console.log(`[OSSTrendingAnalyzer] Analysis complete: ${analyses.length} repos, ${allIntegrations.length} integration suggestions`);

    return {
      repos: topRepos.length,
      analyzed: analyses.length,
      integrations: allIntegrations.length,
      compatible: plan.compatibleIntegrations.length,
      breaking: plan.breakingIntegrations.length,
      plan
    };
  }
}

module.exports = OSSTrendingAnalyzer;
