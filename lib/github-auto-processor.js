/**
 * GitHub Auto-Processor
 *
 * Cal + Ollama automatically process GitHub links
 *
 * Features:
 * - Auto-detect GitHub URLs in requests
 * - Extract repo stats (stars, forks, issues, traffic)
 * - Parse README, detect tech stack
 * - Generate analytics report via Ollama
 * - Email insights via gmail-relay-zero-cost
 * - Track in campaign_conversions for ad attribution
 *
 * Use Case: "Like our own adblocker but accepts ads and harvests data"
 */

const { Octokit } = require('@octokit/rest');
const axios = require('axios');

class GitHubAutoProcessor {
  constructor(options = {}) {
    this.db = options.db;
    this.ollamaClient = options.ollamaClient; // Ollama HTTP client
    this.gmailRelay = options.gmailRelay; // Gmail zero-cost relay
    this.campaignManager = options.campaignManager; // For conversion tracking

    this.config = {
      ollamaModel: options.ollamaModel || 'mistral:latest',
      ollamaHost: options.ollamaHost || 'http://127.0.0.1:11434',
      emailRecipients: options.emailRecipients || [], // Who gets analytics emails
      autoTrackConversions: options.autoTrackConversions !== false,
      cacheExpiry: options.cacheExpiry || 3600000 // 1 hour
    };

    // GitHub API client (works without token for public repos)
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN || undefined
    });

    // Cache for repo data
    this.cache = new Map();

    console.log('[GitHubAutoProcessor] Initialized');
    console.log(`  Ollama Model: ${this.config.ollamaModel}`);
    console.log(`  Email Recipients: ${this.config.emailRecipients.length}`);
  }

  /**
   * Process GitHub URL - main entry point
   */
  async processURL(url, context = {}) {
    try {
      console.log(`[GitHubAutoProcessor] Processing: ${url}`);

      // Extract repo info from URL
      const repoInfo = this._parseGitHubURL(url);
      if (!repoInfo) {
        return { success: false, error: 'Invalid GitHub URL' };
      }

      // Check cache
      const cacheKey = `${repoInfo.owner}/${repoInfo.repo}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.config.cacheExpiry) {
          console.log(`[GitHubAutoProcessor] Cache hit: ${cacheKey}`);
          return { success: true, data: cached.data, cached: true };
        }
      }

      // Fetch repo data
      const repoData = await this._fetchRepoData(repoInfo);

      // Analyze with Ollama
      const analysis = await this._analyzeWithOllama(repoData);

      // Store analytics
      const analyticsId = await this._storeAnalytics({
        url,
        repoInfo,
        repoData,
        analysis,
        context
      });

      // Send email report
      if (this.config.emailRecipients.length > 0 && this.gmailRelay) {
        await this._sendEmailReport({
          url,
          repoData,
          analysis,
          analyticsId
        });
      }

      // Track conversion if campaign context
      if (context.campaign_id && this.campaignManager && this.config.autoTrackConversions) {
        await this._trackConversion({
          campaign_id: context.campaign_id,
          variant_id: context.variant_id,
          url,
          repoData,
          analyticsId
        });
      }

      // Cache result
      this.cache.set(cacheKey, {
        data: { repoData, analysis, analyticsId },
        timestamp: Date.now()
      });

      return {
        success: true,
        data: {
          repoData,
          analysis,
          analyticsId
        }
      };

    } catch (error) {
      console.error('[GitHubAutoProcessor] Error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Parse GitHub URL to extract owner/repo
   */
  _parseGitHubURL(url) {
    // Patterns: https://github.com/owner/repo, github.com/owner/repo, owner/repo
    const patterns = [
      /github\.com\/([^\/]+)\/([^\/\?#]+)/i,
      /^([^\/]+)\/([^\/]+)$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, '')
        };
      }
    }

    return null;
  }

  /**
   * Fetch repo data from GitHub API
   */
  async _fetchRepoData(repoInfo) {
    const { owner, repo } = repoInfo;

    // Fetch main repo data
    const { data: repoData } = await this.octokit.repos.get({
      owner,
      repo
    });

    // Fetch additional stats (parallel)
    const [readme, languages, contributors, traffic] = await Promise.allSettled([
      this._fetchREADME(owner, repo),
      this._fetchLanguages(owner, repo),
      this._fetchContributors(owner, repo),
      this._fetchTraffic(owner, repo) // Requires auth + push access
    ]);

    return {
      // Basic info
      owner: repoData.owner.login,
      repo: repoData.name,
      description: repoData.description,
      url: repoData.html_url,

      // Stats
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      watchers: repoData.watchers_count,
      openIssues: repoData.open_issues_count,

      // Activity
      createdAt: repoData.created_at,
      updatedAt: repoData.updated_at,
      pushedAt: repoData.pushed_at,

      // Tech
      language: repoData.language,
      languages: languages.status === 'fulfilled' ? languages.value : {},
      topics: repoData.topics || [],

      // Social
      license: repoData.license?.spdx_id || 'None',
      defaultBranch: repoData.default_branch,

      // Content
      readme: readme.status === 'fulfilled' ? readme.value : null,

      // People
      contributors: contributors.status === 'fulfilled' ? contributors.value : [],

      // Traffic (if available)
      traffic: traffic.status === 'fulfilled' ? traffic.value : null
    };
  }

  async _fetchREADME(owner, repo) {
    try {
      const { data } = await this.octokit.repos.getReadme({
        owner,
        repo
      });
      // Decode base64 content
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (error) {
      return null;
    }
  }

  async _fetchLanguages(owner, repo) {
    try {
      const { data } = await this.octokit.repos.listLanguages({
        owner,
        repo
      });
      return data;
    } catch (error) {
      return {};
    }
  }

  async _fetchContributors(owner, repo) {
    try {
      const { data } = await this.octokit.repos.listContributors({
        owner,
        repo,
        per_page: 10
      });
      return data.map(c => ({
        login: c.login,
        contributions: c.contributions
      }));
    } catch (error) {
      return [];
    }
  }

  async _fetchTraffic(owner, repo) {
    try {
      // Requires push access to repo
      const { data: views } = await this.octokit.repos.getViews({
        owner,
        repo
      });
      const { data: clones } = await this.octokit.repos.getClones({
        owner,
        repo
      });
      return { views, clones };
    } catch (error) {
      return null;
    }
  }

  /**
   * Analyze repo data with Ollama
   */
  async _analyzeWithOllama(repoData) {
    const prompt = `Analyze this GitHub repository and provide insights:

Repository: ${repoData.owner}/${repoData.repo}
Description: ${repoData.description}
Stars: ${repoData.stars} | Forks: ${repoData.forks} | Issues: ${repoData.openIssues}
Language: ${repoData.language}
Topics: ${repoData.topics.join(', ')}

README Preview:
${repoData.readme ? repoData.readme.slice(0, 1000) : 'No README'}

Provide:
1. Tech Stack Summary (3-5 key technologies)
2. Use Case (what problem does it solve?)
3. Popularity Assessment (low/medium/high based on stars/activity)
4. Business Potential (monetization opportunities)
5. Integration Ideas (how could we use this in our platform?)

Be concise and actionable.`;

    try {
      const response = await axios.post(`${this.config.ollamaHost}/api/generate`, {
        model: this.config.ollamaModel,
        prompt,
        stream: false
      });

      return response.data.response;
    } catch (error) {
      console.error('[GitHubAutoProcessor] Ollama error:', error.message);
      return `Analysis unavailable: ${error.message}`;
    }
  }

  /**
   * Store analytics in database
   */
  async _storeAnalytics({ url, repoInfo, repoData, analysis, context }) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        INSERT INTO github_analytics (
          url,
          owner,
          repo,
          stars,
          forks,
          issues,
          language,
          topics,
          description,
          readme_preview,
          ollama_analysis,
          context,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING id
      `, [
        url,
        repoInfo.owner,
        repoInfo.repo,
        repoData.stars,
        repoData.forks,
        repoData.openIssues,
        repoData.language,
        JSON.stringify(repoData.topics),
        repoData.description,
        repoData.readme ? repoData.readme.slice(0, 1000) : null,
        analysis,
        JSON.stringify(context)
      ]);

      return result.rows[0].id;
    } catch (error) {
      // Table might not exist yet
      console.warn('[GitHubAutoProcessor] Failed to store analytics:', error.message);
      return null;
    }
  }

  /**
   * Send email report via Gmail relay
   */
  async _sendEmailReport({ url, repoData, analysis, analyticsId }) {
    if (!this.gmailRelay) return;

    const subject = `GitHub Analytics: ${repoData.owner}/${repoData.repo}`;
    const body = `
GitHub Repository Analysis

Repository: ${repoData.owner}/${repoData.repo}
URL: ${url}

📊 Stats:
⭐ Stars: ${repoData.stars}
🔱 Forks: ${repoData.forks}
🐛 Open Issues: ${repoData.openIssues}
👥 Contributors: ${repoData.contributors.length}

💻 Tech:
Language: ${repoData.language}
Topics: ${repoData.topics.join(', ')}
License: ${repoData.license}

🤖 AI Analysis:
${analysis}

📈 Activity:
Created: ${repoData.createdAt}
Last Updated: ${repoData.updatedAt}
Last Push: ${repoData.pushedAt}

🔗 View Full Report: http://localhost:5001/api/auto-analytics/github/${analyticsId}

---
Auto-generated by Cal + Ollama
`;

    for (const recipient of this.config.emailRecipients) {
      try {
        await this.gmailRelay.send({
          userId: 'cal',
          to: recipient,
          subject,
          body
        });
        console.log(`[GitHubAutoProcessor] Email sent to ${recipient}`);
      } catch (error) {
        console.error(`[GitHubAutoProcessor] Email failed: ${error.message}`);
      }
    }
  }

  /**
   * Track conversion for ad attribution
   */
  async _trackConversion({ campaign_id, variant_id, url, repoData, analyticsId }) {
    if (!this.campaignManager) return;

    try {
      // Value GitHub interactions based on stars (rough heuristic)
      const conversionValueCents = Math.min(repoData.stars * 10, 10000); // Max $100

      await this.campaignManager.recordConversion({
        campaign_id,
        variant_id,
        conversion_type: 'github_analysis',
        conversion_value_cents: conversionValueCents,
        ai_cost_cents: 0, // Ollama is free
        metadata: {
          url,
          repo: `${repoData.owner}/${repoData.repo}`,
          stars: repoData.stars,
          analytics_id: analyticsId
        }
      });

      console.log(`[GitHubAutoProcessor] Tracked conversion for campaign ${campaign_id}`);
    } catch (error) {
      console.error('[GitHubAutoProcessor] Conversion tracking failed:', error.message);
    }
  }

  /**
   * Auto-detect and process GitHub URLs in text
   */
  async processText(text, context = {}) {
    // Find all GitHub URLs
    const githubURLPattern = /https?:\/\/github\.com\/[^\s]+/gi;
    const urls = text.match(githubURLPattern) || [];

    if (urls.length === 0) {
      return { success: true, processed: 0 };
    }

    console.log(`[GitHubAutoProcessor] Found ${urls.length} GitHub URLs`);

    const results = [];
    for (const url of urls) {
      const result = await this.processURL(url, context);
      results.push(result);
    }

    return {
      success: true,
      processed: results.length,
      results
    };
  }

  /**
   * Get analytics summary
   */
  async getSummary(limit = 10) {
    if (!this.db) {
      return { success: false, error: 'Database not available' };
    }

    try {
      const result = await this.db.query(`
        SELECT
          id,
          url,
          owner,
          repo,
          stars,
          forks,
          language,
          created_at
        FROM github_analytics
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);

      return {
        success: true,
        analytics: result.rows
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = GitHubAutoProcessor;
