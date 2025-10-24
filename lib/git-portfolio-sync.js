// Git Portfolio Sync - GitHub/GitLab/Bitbucket Activity Aggregation
//
// Syncs git activity from multiple platforms into git_portfolio_stats table
// Integrates with existing content-curator.js GitHub trending scraper

const axios = require('axios');
const crypto = require('crypto');

class GitPortfolioSync {
  constructor(pool) {
    this.pool = pool;
    this.cache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
  }

  // ============================================================================
  // GitHub Integration
  // ============================================================================

  /**
   * Sync GitHub activity for a user
   * @param {number} userId - User ID
   * @param {string} username - GitHub username
   * @param {string} accessToken - Optional GitHub personal access token for higher rate limits
   */
  async syncGitHub(userId, username, accessToken = null) {
    try {
      const headers = {
        'User-Agent': 'CALOS-Portfolio-Sync/1.0',
        'Accept': 'application/vnd.github.v3+json'
      };

      if (accessToken) {
        headers['Authorization'] = `token ${accessToken}`;
      }

      // Fetch user profile
      const userResponse = await axios.get(`https://api.github.com/users/${username}`, {
        headers,
        timeout: 10000
      });

      const user = userResponse.data;

      // Fetch user's repos
      const reposResponse = await axios.get(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, {
        headers,
        timeout: 10000
      });

      const repos = reposResponse.data;

      // Calculate stats
      const totalRepos = user.public_repos;
      const publicRepos = repos.filter(r => !r.private).length;
      const privateRepos = totalRepos - publicRepos;

      const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
      const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
      const totalWatchers = repos.reduce((sum, repo) => sum + repo.watchers_count, 0);

      // Language breakdown
      const languages = {};
      for (const repo of repos.slice(0, 50)) { // Top 50 repos
        if (repo.language) {
          languages[repo.language] = (languages[repo.language] || 0) + 1;
        }
      }

      // Fetch contribution graph (requires authenticated API or scraping)
      let contributionGraph = {};
      let totalCommits = 0;
      let commitsThisYear = 0;
      let commitsThisMonth = 0;

      // Try to fetch commit activity (limited without auth)
      try {
        const eventsResponse = await axios.get(`https://api.github.com/users/${username}/events/public?per_page=100`, {
          headers,
          timeout: 10000
        });

        const events = eventsResponse.data;
        const now = new Date();
        const thisYear = now.getFullYear();
        const thisMonth = now.getMonth();

        for (const event of events) {
          if (event.type === 'PushEvent') {
            const eventDate = new Date(event.created_at);
            const commits = event.payload?.commits?.length || 0;

            totalCommits += commits;

            if (eventDate.getFullYear() === thisYear) {
              commitsThisYear += commits;
            }

            if (eventDate.getFullYear() === thisYear && eventDate.getMonth() === thisMonth) {
              commitsThisMonth += commits;
            }

            // Build contribution graph
            const dateKey = eventDate.toISOString().split('T')[0];
            contributionGraph[dateKey] = (contributionGraph[dateKey] || 0) + commits;
          }
        }
      } catch (err) {
        console.warn('[GitPortfolioSync] Could not fetch commit events:', err.message);
      }

      // Fetch PR stats (limited without auth)
      let totalPRs = 0;
      let prsMerged = 0;

      try {
        const searchResponse = await axios.get(`https://api.github.com/search/issues?q=author:${username}+type:pr&per_page=100`, {
          headers,
          timeout: 10000
        });

        totalPRs = searchResponse.data.total_count;
        prsMerged = searchResponse.data.items.filter(pr => pr.pull_request?.merged_at).length;
      } catch (err) {
        console.warn('[GitPortfolioSync] Could not fetch PR stats:', err.message);
      }

      // Fetch issue stats
      let totalIssues = 0;
      let issuesClosed = 0;

      try {
        const searchResponse = await axios.get(`https://api.github.com/search/issues?q=author:${username}+type:issue&per_page=100`, {
          headers,
          timeout: 10000
        });

        totalIssues = searchResponse.data.total_count;
        issuesClosed = searchResponse.data.items.filter(issue => issue.state === 'closed').length;
      } catch (err) {
        console.warn('[GitPortfolioSync] Could not fetch issue stats:', err.message);
      }

      // Upsert to database
      const query = `
        INSERT INTO git_portfolio_stats (
          user_id, platform, username, profile_url,
          total_repos, public_repos, private_repos,
          total_commits, commits_this_year, commits_this_month,
          total_prs, prs_merged, total_issues, issues_closed,
          total_stars, total_forks, total_watchers,
          followers, following,
          contribution_graph, languages,
          last_synced_at, sync_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        ON CONFLICT (platform, username) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          profile_url = EXCLUDED.profile_url,
          total_repos = EXCLUDED.total_repos,
          public_repos = EXCLUDED.public_repos,
          private_repos = EXCLUDED.private_repos,
          total_commits = EXCLUDED.total_commits,
          commits_this_year = EXCLUDED.commits_this_year,
          commits_this_month = EXCLUDED.commits_this_month,
          total_prs = EXCLUDED.total_prs,
          prs_merged = EXCLUDED.prs_merged,
          total_issues = EXCLUDED.total_issues,
          issues_closed = EXCLUDED.issues_closed,
          total_stars = EXCLUDED.total_stars,
          total_forks = EXCLUDED.total_forks,
          total_watchers = EXCLUDED.total_watchers,
          followers = EXCLUDED.followers,
          following = EXCLUDED.following,
          contribution_graph = EXCLUDED.contribution_graph,
          languages = EXCLUDED.languages,
          last_synced_at = EXCLUDED.last_synced_at,
          sync_status = EXCLUDED.sync_status
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        userId, 'github', username, user.html_url,
        totalRepos, publicRepos, privateRepos,
        totalCommits, commitsThisYear, commitsThisMonth,
        totalPRs, prsMerged, totalIssues, issuesClosed,
        totalStars, totalForks, totalWatchers,
        user.followers, user.following,
        JSON.stringify(contributionGraph), JSON.stringify(languages),
        new Date(), 'completed'
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('[GitPortfolioSync] Error syncing GitHub:', error.message);

      // Mark as failed
      await this.pool.query(`
        INSERT INTO git_portfolio_stats (
          user_id, platform, username, sync_status, sync_error, last_synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (platform, username) DO UPDATE SET
          sync_status = EXCLUDED.sync_status,
          sync_error = EXCLUDED.sync_error,
          last_synced_at = EXCLUDED.last_synced_at
      `, [userId, 'github', username, 'failed', error.message, new Date()]);

      throw error;
    }
  }

  // ============================================================================
  // GitLab Integration
  // ============================================================================

  /**
   * Sync GitLab activity for a user
   * @param {number} userId - User ID
   * @param {string} username - GitLab username
   * @param {string} accessToken - Optional GitLab personal access token
   */
  async syncGitLab(userId, username, accessToken = null) {
    try {
      const headers = {
        'User-Agent': 'CALOS-Portfolio-Sync/1.0'
      };

      if (accessToken) {
        headers['PRIVATE-TOKEN'] = accessToken;
      }

      // Fetch user profile
      const userResponse = await axios.get(`https://gitlab.com/api/v4/users?username=${username}`, {
        headers,
        timeout: 10000
      });

      if (!userResponse.data || userResponse.data.length === 0) {
        throw new Error('GitLab user not found');
      }

      const user = userResponse.data[0];
      const userId_gitlab = user.id;

      // Fetch user's projects
      const projectsResponse = await axios.get(`https://gitlab.com/api/v4/users/${userId_gitlab}/projects?per_page=100&order_by=updated_at`, {
        headers,
        timeout: 10000
      });

      const projects = projectsResponse.data;

      // Calculate stats
      const totalRepos = projects.length;
      const publicRepos = projects.filter(p => p.visibility === 'public').length;
      const privateRepos = totalRepos - publicRepos;

      const totalStars = projects.reduce((sum, proj) => sum + proj.star_count, 0);
      const totalForks = projects.reduce((sum, proj) => sum + proj.forks_count, 0);

      // Language breakdown (GitLab doesn't provide this easily, approximate from project languages)
      const languages = {};
      // Note: Would need to fetch each project's languages endpoint for accurate data

      // Fetch commit activity (limited without project access)
      let totalCommits = 0;
      let commitsThisYear = 0;
      let commitsThisMonth = 0;
      const contributionGraph = {};

      // Fetch events for contribution timeline
      try {
        const eventsResponse = await axios.get(`https://gitlab.com/api/v4/users/${userId_gitlab}/events?per_page=100`, {
          headers,
          timeout: 10000
        });

        const events = eventsResponse.data;
        const now = new Date();
        const thisYear = now.getFullYear();
        const thisMonth = now.getMonth();

        for (const event of events) {
          if (event.action_name === 'pushed to' || event.action_name === 'pushed new') {
            const eventDate = new Date(event.created_at);
            const commits = event.push_data?.commit_count || 1;

            totalCommits += commits;

            if (eventDate.getFullYear() === thisYear) {
              commitsThisYear += commits;
            }

            if (eventDate.getFullYear() === thisYear && eventDate.getMonth() === thisMonth) {
              commitsThisMonth += commits;
            }

            const dateKey = eventDate.toISOString().split('T')[0];
            contributionGraph[dateKey] = (contributionGraph[dateKey] || 0) + commits;
          }
        }
      } catch (err) {
        console.warn('[GitPortfolioSync] Could not fetch GitLab events:', err.message);
      }

      // Upsert to database
      const query = `
        INSERT INTO git_portfolio_stats (
          user_id, platform, username, profile_url,
          total_repos, public_repos, private_repos,
          total_commits, commits_this_year, commits_this_month,
          total_stars, total_forks,
          contribution_graph, languages,
          last_synced_at, sync_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (platform, username) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          profile_url = EXCLUDED.profile_url,
          total_repos = EXCLUDED.total_repos,
          public_repos = EXCLUDED.public_repos,
          private_repos = EXCLUDED.private_repos,
          total_commits = EXCLUDED.total_commits,
          commits_this_year = EXCLUDED.commits_this_year,
          commits_this_month = EXCLUDED.commits_this_month,
          total_stars = EXCLUDED.total_stars,
          total_forks = EXCLUDED.total_forks,
          contribution_graph = EXCLUDED.contribution_graph,
          languages = EXCLUDED.languages,
          last_synced_at = EXCLUDED.last_synced_at,
          sync_status = EXCLUDED.sync_status
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        userId, 'gitlab', username, user.web_url,
        totalRepos, publicRepos, privateRepos,
        totalCommits, commitsThisYear, commitsThisMonth,
        totalStars, totalForks,
        JSON.stringify(contributionGraph), JSON.stringify(languages),
        new Date(), 'completed'
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('[GitPortfolioSync] Error syncing GitLab:', error.message);

      await this.pool.query(`
        INSERT INTO git_portfolio_stats (
          user_id, platform, username, sync_status, sync_error, last_synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (platform, username) DO UPDATE SET
          sync_status = EXCLUDED.sync_status,
          sync_error = EXCLUDED.sync_error,
          last_synced_at = EXCLUDED.last_synced_at
      `, [userId, 'gitlab', username, 'failed', error.message, new Date()]);

      throw error;
    }
  }

  // ============================================================================
  // Bitbucket Integration
  // ============================================================================

  /**
   * Sync Bitbucket activity for a user
   * @param {number} userId - User ID
   * @param {string} username - Bitbucket username
   * @param {string} accessToken - Optional Bitbucket app password
   */
  async syncBitbucket(userId, username, accessToken = null) {
    try {
      const headers = {
        'User-Agent': 'CALOS-Portfolio-Sync/1.0'
      };

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      // Fetch user profile
      const userResponse = await axios.get(`https://api.bitbucket.org/2.0/users/${username}`, {
        headers,
        timeout: 10000
      });

      const user = userResponse.data;

      // Fetch user's repositories
      const reposResponse = await axios.get(`https://api.bitbucket.org/2.0/repositories/${username}?pagelen=100`, {
        headers,
        timeout: 10000
      });

      const repos = reposResponse.data.values || [];

      // Calculate stats
      const totalRepos = repos.length;
      const publicRepos = repos.filter(r => !r.is_private).length;
      const privateRepos = totalRepos - publicRepos;

      // Bitbucket doesn't have stars, but has watchers
      const totalWatchers = repos.length; // Placeholder

      // Language breakdown
      const languages = {};
      for (const repo of repos) {
        if (repo.language) {
          languages[repo.language] = (languages[repo.language] || 0) + 1;
        }
      }

      // Commits (would need to fetch per-repo)
      const totalCommits = 0; // Placeholder
      const commitsThisYear = 0;
      const commitsThisMonth = 0;
      const contributionGraph = {};

      // Upsert to database
      const query = `
        INSERT INTO git_portfolio_stats (
          user_id, platform, username, profile_url,
          total_repos, public_repos, private_repos,
          total_commits, commits_this_year, commits_this_month,
          total_watchers,
          contribution_graph, languages,
          last_synced_at, sync_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (platform, username) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          profile_url = EXCLUDED.profile_url,
          total_repos = EXCLUDED.total_repos,
          public_repos = EXCLUDED.public_repos,
          private_repos = EXCLUDED.private_repos,
          total_commits = EXCLUDED.total_commits,
          commits_this_year = EXCLUDED.commits_this_year,
          commits_this_month = EXCLUDED.commits_this_month,
          total_watchers = EXCLUDED.total_watchers,
          contribution_graph = EXCLUDED.contribution_graph,
          languages = EXCLUDED.languages,
          last_synced_at = EXCLUDED.last_synced_at,
          sync_status = EXCLUDED.sync_status
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        userId, 'bitbucket', username, user.links.html.href,
        totalRepos, publicRepos, privateRepos,
        totalCommits, commitsThisYear, commitsThisMonth,
        totalWatchers,
        JSON.stringify(contributionGraph), JSON.stringify(languages),
        new Date(), 'completed'
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('[GitPortfolioSync] Error syncing Bitbucket:', error.message);

      await this.pool.query(`
        INSERT INTO git_portfolio_stats (
          user_id, platform, username, sync_status, sync_error, last_synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (platform, username) DO UPDATE SET
          sync_status = EXCLUDED.sync_status,
          sync_error = EXCLUDED.sync_error,
          last_synced_at = EXCLUDED.last_synced_at
      `, [userId, 'bitbucket', username, 'failed', error.message, new Date()]);

      throw error;
    }
  }

  // ============================================================================
  // Unified Sync
  // ============================================================================

  /**
   * Sync all platforms for a user
   * @param {number} userId - User ID
   * @param {object} platforms - { github: 'username', gitlab: 'username', bitbucket: 'username' }
   * @param {object} tokens - { github: 'token', gitlab: 'token', bitbucket: 'token' }
   */
  async syncAll(userId, platforms, tokens = {}) {
    const results = {};

    if (platforms.github) {
      try {
        results.github = await this.syncGitHub(userId, platforms.github, tokens.github);
      } catch (err) {
        results.github = { error: err.message };
      }
    }

    if (platforms.gitlab) {
      try {
        results.gitlab = await this.syncGitLab(userId, platforms.gitlab, tokens.gitlab);
      } catch (err) {
        results.gitlab = { error: err.message };
      }
    }

    if (platforms.bitbucket) {
      try {
        results.bitbucket = await this.syncBitbucket(userId, platforms.bitbucket, tokens.bitbucket);
      } catch (err) {
        results.bitbucket = { error: err.message };
      }
    }

    return results;
  }

  /**
   * Get stats for a user across all platforms
   * @param {number} userId - User ID
   */
  async getStats(userId) {
    const query = `
      SELECT * FROM git_portfolio_stats
      WHERE user_id = $1
      ORDER BY platform, last_synced_at DESC
    `;

    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }
}

module.exports = GitPortfolioSync;
