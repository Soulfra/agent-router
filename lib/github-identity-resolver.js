/**
 * GitHub Identity Resolver
 *
 * Automatically detects GitHub identity from git config and links to database.
 * Solves the "who am I?" problem when building systems that need GitHub attribution.
 *
 * What It Does:
 * - Auto-detect GitHub username/email from git config
 * - Link GitHub account to database user
 * - Support multiple GitHub accounts per user
 * - Resolve GitHub → RuneLite username linkage
 * - Track repos, branches, and commit attribution
 *
 * Use Cases:
 * - Chat logs: Attribute messages to GitHub accounts
 * - Activity tracking: Link game events to developers
 * - Multi-account support: Same person, multiple GitHub accounts
 * - Repo context: Know which repo/branch you're working in
 *
 * Integrates with:
 * - SoulfraIdentity (lib/soulfra-identity.js) - Zero-knowledge identity
 * - RuneLiteChatLogger (lib/runelite-chat-logger.js) - Chat attribution
 * - RuneLiteAccountTracker (lib/runelite-account-tracker.js) - Activity linking
 *
 * Usage:
 *   const resolver = new GitHubIdentityResolver({ db });
 *
 *   // Auto-detect from git config
 *   const identity = await resolver.getCurrentIdentity();
 *   // → { githubUsername: 'Soulfra', email: '211064529+...', repo: '...' }
 *
 *   // Link to database user
 *   await resolver.linkToUser({
 *     githubUsername: 'Soulfra',
 *     userId: 123
 *   });
 *
 *   // Link to RuneLite account
 *   await resolver.linkRuneLiteAccount({
 *     githubUsername: 'Soulfra',
 *     runeliteUsername: 'MyOSRSName'
 *   });
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const { EventEmitter } = require('events');

const execAsync = promisify(exec);

class GitHubIdentityResolver extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.cwd = options.cwd || process.cwd();

    // Cached identity
    this.currentIdentity = null;
    this.lastResolved = null;

    console.log('[GitHubIdentityResolver] Initialized');
  }

  // ============================================================================
  // Identity Detection
  // ============================================================================

  /**
   * Get current GitHub identity from git config
   */
  async getCurrentIdentity() {
    console.log('[GitHubIdentityResolver] Detecting GitHub identity...');

    // Check cache (5 minute TTL)
    if (this.currentIdentity && Date.now() - this.lastResolved < 300000) {
      return this.currentIdentity;
    }

    try {
      // Get git user name
      const { stdout: username } = await execAsync('git config --get user.name', {
        cwd: this.cwd
      });

      // Get git email
      const { stdout: email } = await execAsync('git config --get user.email', {
        cwd: this.cwd
      });

      // Get remote URL (to extract GitHub username)
      const { stdout: remote } = await execAsync('git remote -v', {
        cwd: this.cwd
      });

      // Get current branch
      const { stdout: branch } = await execAsync('git branch --show-current', {
        cwd: this.cwd
      });

      // Parse remote URL
      const remoteMatch = remote.match(/github\.com[:/]([^/]+)\/([^.\s]+)/);
      const githubUsername = remoteMatch ? remoteMatch[1] : username.trim();
      const repo = remoteMatch ? remoteMatch[2] : null;

      this.currentIdentity = {
        githubUsername: githubUsername.trim(),
        gitName: username.trim(),
        email: email.trim(),
        repo,
        branch: branch.trim(),
        remoteUrl: remoteMatch ? remoteMatch[0] : null,
        detectedAt: Date.now()
      };

      this.lastResolved = Date.now();

      console.log(`[GitHubIdentityResolver] Detected: ${this.currentIdentity.githubUsername} (${this.currentIdentity.email})`);

      this.emit('identity_detected', this.currentIdentity);

      return this.currentIdentity;

    } catch (error) {
      console.error('[GitHubIdentityResolver] Detection error:', error.message);
      throw new Error('Not a git repository or git not configured');
    }
  }

  /**
   * Get GitHub user ID from GitHub API (if gh CLI is available)
   */
  async getGitHubUserID(githubUsername) {
    try {
      // Try using gh CLI
      const { stdout } = await execAsync(`gh api users/${githubUsername} --jq .id`);
      return stdout.trim();
    } catch (error) {
      console.log('[GitHubIdentityResolver] Could not get GitHub user ID (gh CLI not available)');
      return null;
    }
  }

  /**
   * Check if gh CLI is authenticated
   */
  async isGitHubCLIAuthenticated() {
    try {
      await execAsync('gh auth status');
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Database Linkage
  // ============================================================================

  /**
   * Link GitHub identity to database user
   */
  async linkToUser(options) {
    const {
      githubUsername,
      userId,
      email = null,
      githubUserID = null,
      isPrimary = false
    } = options;

    if (!this.db) {
      throw new Error('Database not configured');
    }

    console.log(`[GitHubIdentityResolver] Linking ${githubUsername} → user ${userId}`);

    try {
      // Check if already linked
      const existing = await this.db.query(
        'SELECT * FROM github_identities WHERE github_username = $1',
        [githubUsername]
      );

      if (existing.rows.length > 0) {
        console.log('[GitHubIdentityResolver] GitHub identity already linked');
        return existing.rows[0];
      }

      // Try to get GitHub user ID from API
      const resolvedGitHubUserID = githubUserID || await this.getGitHubUserID(githubUsername);

      // Insert new linkage
      const result = await this.db.query(`
        INSERT INTO github_identities (
          user_id,
          github_username,
          github_email,
          github_user_id,
          is_primary
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [userId, githubUsername, email, resolvedGitHubUserID, isPrimary]);

      console.log('[GitHubIdentityResolver] GitHub identity linked successfully');

      this.emit('identity_linked', {
        githubUsername,
        userId,
        id: result.rows[0].id
      });

      return result.rows[0];

    } catch (error) {
      console.error('[GitHubIdentityResolver] Link error:', error.message);
      throw error;
    }
  }

  /**
   * Get database user for GitHub username
   */
  async getUserByGitHub(githubUsername) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    try {
      const result = await this.db.query(`
        SELECT gi.*, u.*
        FROM github_identities gi
        JOIN users u ON gi.user_id = u.id
        WHERE gi.github_username = $1
      `, [githubUsername]);

      return result.rows.length > 0 ? result.rows[0] : null;

    } catch (error) {
      console.error('[GitHubIdentityResolver] User lookup error:', error.message);
      return null;
    }
  }

  /**
   * Get all GitHub identities for a user
   */
  async getGitHubIdentitiesForUser(userId) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    try {
      const result = await this.db.query(`
        SELECT * FROM github_identities
        WHERE user_id = $1
        ORDER BY is_primary DESC, created_at ASC
      `, [userId]);

      return result.rows;

    } catch (error) {
      console.error('[GitHubIdentityResolver] Identities lookup error:', error.message);
      return [];
    }
  }

  // ============================================================================
  // RuneLite Account Linkage
  // ============================================================================

  /**
   * Link GitHub account to RuneLite username
   */
  async linkRuneLiteAccount(options) {
    const {
      githubUsername,
      runeliteUsername,
      isActive = true
    } = options;

    if (!this.db) {
      throw new Error('Database not configured');
    }

    console.log(`[GitHubIdentityResolver] Linking ${githubUsername} → RuneLite: ${runeliteUsername}`);

    try {
      // Get GitHub identity ID
      const githubIdentity = await this.db.query(
        'SELECT id FROM github_identities WHERE github_username = $1',
        [githubUsername]
      );

      if (githubIdentity.rows.length === 0) {
        throw new Error(`GitHub identity ${githubUsername} not found. Link to user first.`);
      }

      const githubIdentityId = githubIdentity.rows[0].id;

      // Check if already linked
      const existing = await this.db.query(
        'SELECT * FROM runelite_accounts WHERE github_identity_id = $1 AND runelite_username = $2',
        [githubIdentityId, runeliteUsername]
      );

      if (existing.rows.length > 0) {
        console.log('[GitHubIdentityResolver] RuneLite account already linked');
        return existing.rows[0];
      }

      // Insert linkage
      const result = await this.db.query(`
        INSERT INTO runelite_accounts (
          github_identity_id,
          runelite_username,
          is_active
        ) VALUES ($1, $2, $3)
        RETURNING *
      `, [githubIdentityId, runeliteUsername, isActive]);

      console.log('[GitHubIdentityResolver] RuneLite account linked successfully');

      this.emit('runelite_linked', {
        githubUsername,
        runeliteUsername,
        id: result.rows[0].id
      });

      return result.rows[0];

    } catch (error) {
      console.error('[GitHubIdentityResolver] RuneLite link error:', error.message);
      throw error;
    }
  }

  /**
   * Get RuneLite usernames for GitHub account
   */
  async getRuneLiteAccounts(githubUsername) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    try {
      const result = await this.db.query(`
        SELECT ra.*
        FROM runelite_accounts ra
        JOIN github_identities gi ON ra.github_identity_id = gi.id
        WHERE gi.github_username = $1 AND ra.is_active = true
        ORDER BY ra.created_at DESC
      `, [githubUsername]);

      return result.rows;

    } catch (error) {
      console.error('[GitHubIdentityResolver] RuneLite accounts lookup error:', error.message);
      return [];
    }
  }

  /**
   * Get primary RuneLite account for GitHub user
   */
  async getPrimaryRuneLiteAccount(githubUsername) {
    const accounts = await this.getRuneLiteAccounts(githubUsername);
    return accounts.length > 0 ? accounts[0] : null;
  }

  // ============================================================================
  // Auto-Resolution
  // ============================================================================

  /**
   * Auto-resolve and link current identity
   * Detects GitHub from git config and links to database if not already linked
   */
  async autoResolve(options = {}) {
    const {
      createUserIfNotExists = false,
      linkRuneLite = false,
      runeliteUsername = null
    } = options;

    console.log('[GitHubIdentityResolver] Auto-resolving identity...');

    // Detect GitHub identity
    const identity = await this.getCurrentIdentity();

    // Check if linked to database
    let user = await this.getUserByGitHub(identity.githubUsername);

    if (!user && createUserIfNotExists) {
      // Create new user
      const newUser = await this.db.query(`
        INSERT INTO users (username, email)
        VALUES ($1, $2)
        RETURNING *
      `, [identity.githubUsername, identity.email]);

      user = newUser.rows[0];

      // Link GitHub identity
      await this.linkToUser({
        githubUsername: identity.githubUsername,
        userId: user.id,
        email: identity.email,
        isPrimary: true
      });

      console.log(`[GitHubIdentityResolver] Created new user: ${user.username} (ID: ${user.id})`);
    }

    // Link RuneLite if requested
    if (linkRuneLite && runeliteUsername && user) {
      await this.linkRuneLiteAccount({
        githubUsername: identity.githubUsername,
        runeliteUsername
      });
    }

    const resolved = {
      ...identity,
      user,
      linkedToDatabase: !!user
    };

    this.emit('auto_resolved', resolved);

    return resolved;
  }

  // ============================================================================
  // Repo Context
  // ============================================================================

  /**
   * Get current repo context
   */
  async getRepoContext() {
    const identity = await this.getCurrentIdentity();

    return {
      repo: identity.repo,
      branch: identity.branch,
      remoteUrl: identity.remoteUrl,
      githubUsername: identity.githubUsername
    };
  }

  /**
   * Check if in specific repo
   */
  async isInRepo(repoName) {
    const identity = await this.getCurrentIdentity();
    return identity.repo === repoName;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Clear cached identity (force re-detection)
   */
  clearCache() {
    this.currentIdentity = null;
    this.lastResolved = null;
    console.log('[GitHubIdentityResolver] Cache cleared');
  }

  /**
   * Get resolver stats
   */
  getStats() {
    return {
      hasCachedIdentity: !!this.currentIdentity,
      lastResolved: this.lastResolved,
      currentIdentity: this.currentIdentity
    };
  }
}

module.exports = GitHubIdentityResolver;
