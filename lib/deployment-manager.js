/**
 * Deployment Manager
 *
 * Handles staging → production content promotion
 * Craigslist-style environment switching with theme control
 */

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class DeploymentManager {
  constructor(db, options = {}) {
    this.db = db;
    this.environment = process.env.NODE_ENV || 'development';
    this.stagingDb = options.stagingDb || db; // Separate staging DB connection
    this.productionDb = options.productionDb || db;

    // Deployment settings
    this.backupDir = options.backupDir || path.join(__dirname, '../../backups');
    this.deploymentLockFile = path.join(__dirname, '../../.deployment.lock');

    // Theme settings
    this.stagingTheme = 'staging'; // Colorful, full-featured
    this.productionTheme = 'production'; // Minimal, B&W, Craigslist-style
  }

  /**
   * Check current environment
   */
  getEnvironment() {
    return {
      env: this.environment,
      theme: this.environment === 'production' ? this.productionTheme : this.stagingTheme,
      isProduction: this.environment === 'production',
      isStaging: this.environment === 'staging',
      isDevelopment: this.environment === 'development'
    };
  }

  /**
   * Check if deployment is in progress
   */
  async isDeploymentLocked() {
    try {
      await fs.access(this.deploymentLockFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Lock deployment (prevent concurrent deployments)
   */
  async lockDeployment(deployer) {
    const lockData = {
      deployer,
      timestamp: new Date().toISOString(),
      pid: process.pid
    };

    await fs.writeFile(this.deploymentLockFile, JSON.stringify(lockData, null, 2));
    console.log(`[Deployment] Locked by ${deployer} (PID: ${process.pid})`);
  }

  /**
   * Unlock deployment
   */
  async unlockDeployment() {
    try {
      await fs.unlink(this.deploymentLockFile);
      console.log('[Deployment] Lock released');
    } catch (error) {
      console.error('[Deployment] Failed to release lock:', error.message);
    }
  }

  /**
   * Create backup before deployment
   */
  async createBackup(label = 'manual') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${label}-${timestamp}`;
    const backupPath = path.join(this.backupDir, backupName);

    console.log(`[Deployment] Creating backup: ${backupName}`);

    await fs.mkdir(backupPath, { recursive: true });

    // Backup database
    const dbBackupPath = path.join(backupPath, 'database.sql');
    await this.backupDatabase(dbBackupPath);

    // Backup config files
    const configFiles = [
      '.env',
      '.env.staging',
      '.env.production',
      'package.json',
      'package-lock.json'
    ];

    for (const file of configFiles) {
      const sourcePath = path.join(__dirname, '../../', file);
      const destPath = path.join(backupPath, file);

      try {
        await fs.copyFile(sourcePath, destPath);
      } catch (error) {
        console.warn(`[Deployment] Could not backup ${file}:`, error.message);
      }
    }

    // Backup public assets
    const publicDir = path.join(__dirname, '../public');
    const publicBackup = path.join(backupPath, 'public');

    try {
      await fs.cp(publicDir, publicBackup, { recursive: true });
    } catch (error) {
      console.warn('[Deployment] Could not backup public assets:', error.message);
    }

    console.log(`[Deployment] Backup created: ${backupPath}`);

    // Keep only last 10 backups
    await this.cleanOldBackups(10);

    return backupPath;
  }

  /**
   * Backup database
   */
  async backupDatabase(outputPath) {
    return new Promise((resolve, reject) => {
      const dbUrl = process.env.DATABASE_URL || 'postgresql://calos:calos@localhost:5432/calos';
      const cmd = `pg_dump ${dbUrl} > ${outputPath}`;

      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.warn('[Deployment] Database backup failed:', error.message);
          resolve(); // Don't fail deployment if backup fails
        } else {
          console.log('[Deployment] Database backed up');
          resolve();
        }
      });
    });
  }

  /**
   * Clean old backups (keep N most recent)
   */
  async cleanOldBackups(keepCount = 10) {
    try {
      const backups = await fs.readdir(this.backupDir);
      const backupDirs = backups
        .filter(name => name.startsWith('backup-'))
        .sort()
        .reverse();

      const toDelete = backupDirs.slice(keepCount);

      for (const backup of toDelete) {
        const backupPath = path.join(this.backupDir, backup);
        await fs.rm(backupPath, { recursive: true, force: true });
        console.log(`[Deployment] Deleted old backup: ${backup}`);
      }
    } catch (error) {
      console.error('[Deployment] Failed to clean old backups:', error.message);
    }
  }

  /**
   * Promote content from staging to production
   */
  async promoteToProduction(options = {}) {
    const { deployer = 'system', skipBackup = false, dryRun = false } = options;

    console.log('\n=================================================');
    console.log('🚀 Promoting Staging → Production');
    console.log('=================================================\n');

    // Check if deployment is locked
    if (await this.isDeploymentLocked()) {
      throw new Error('Deployment already in progress');
    }

    try {
      // Lock deployment
      await this.lockDeployment(deployer);

      // Create backup
      if (!skipBackup && !dryRun) {
        await this.createBackup('pre-deploy');
      }

      // Get content to promote
      const contentStats = await this.getPromotableContent();

      console.log('[Deployment] Content to promote:');
      console.log(`  - Email rules: ${contentStats.emailRules}`);
      console.log(`  - Routing rules: ${contentStats.routingRules}`);
      console.log(`  - OAuth providers: ${contentStats.oauthProviders}`);
      console.log(`  - Agents: ${contentStats.agents}`);
      console.log('');

      if (dryRun) {
        console.log('[Deployment] Dry run - no changes made');
        return { success: true, dryRun: true, stats: contentStats };
      }

      // Promote each content type
      const results = {
        emailRules: await this.promoteEmailRules(),
        routingRules: await this.promoteRoutingRules(),
        oauthProviders: await this.promoteOAuthProviders(),
        agents: await this.promoteAgents()
      };

      // Switch theme to production
      await this.switchTheme('production');

      // Clear production cache
      await this.clearProductionCache();

      console.log('\n✅ Promotion Complete!');
      console.log('=================================================\n');

      return {
        success: true,
        results,
        stats: contentStats,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[Deployment] Promotion failed:', error.message);
      throw error;

    } finally {
      await this.unlockDeployment();
    }
  }

  /**
   * Get content that can be promoted
   */
  async getPromotableContent() {
    // Count staging content ready for promotion
    const emailRules = await this.stagingDb.query(
      'SELECT COUNT(*) FROM email_routing_rules WHERE is_active = true'
    );

    const routingRules = await this.stagingDb.query(
      'SELECT COUNT(*) FROM routing_rules WHERE enabled = true'
    );

    const oauthProviders = await this.stagingDb.query(
      'SELECT COUNT(*) FROM oauth_providers WHERE enabled = true'
    );

    const agents = await this.stagingDb.query(
      'SELECT COUNT(*) FROM agents WHERE status = $1',
      ['active']
    );

    return {
      emailRules: parseInt(emailRules.rows[0]?.count || 0),
      routingRules: parseInt(routingRules.rows[0]?.count || 0),
      oauthProviders: parseInt(oauthProviders.rows[0]?.count || 0),
      agents: parseInt(agents.rows[0]?.count || 0)
    };
  }

  /**
   * Promote email routing rules
   */
  async promoteEmailRules() {
    console.log('[Deployment] Promoting email rules...');

    // Get staging rules
    const stagingRules = await this.stagingDb.query(`
      SELECT * FROM email_routing_rules
      WHERE is_active = true
        AND is_auto_learned = false
    `);

    let promoted = 0;

    for (const rule of stagingRules.rows) {
      // Check if rule exists in production
      const existing = await this.productionDb.query(
        'SELECT id FROM email_routing_rules WHERE pattern = $1 AND user_id = $2',
        [rule.pattern, rule.user_id]
      );

      if (existing.rows.length > 0) {
        // Update existing rule
        await this.productionDb.query(`
          UPDATE email_routing_rules
          SET
            target_category = $1,
            confidence = $2,
            description = $3,
            updated_at = NOW()
          WHERE id = $4
        `, [rule.target_category, rule.confidence, rule.description, existing.rows[0].id]);
      } else {
        // Insert new rule
        await this.productionDb.query(`
          INSERT INTO email_routing_rules (
            user_id, account_id, rule_type, pattern, target_category,
            priority, confidence, description, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          rule.user_id, rule.account_id, rule.rule_type, rule.pattern,
          rule.target_category, rule.priority, rule.confidence,
          rule.description, true
        ]);
      }

      promoted++;
    }

    console.log(`[Deployment] ✓ Promoted ${promoted} email rules`);
    return { promoted, total: stagingRules.rows.length };
  }

  /**
   * Promote general routing rules
   */
  async promoteRoutingRules() {
    console.log('[Deployment] Promoting routing rules...');

    const stagingRules = await this.stagingDb.query(`
      SELECT * FROM routing_rules WHERE enabled = true
    `);

    let promoted = 0;

    for (const rule of stagingRules.rows) {
      const existing = await this.productionDb.query(
        'SELECT id FROM routing_rules WHERE name = $1',
        [rule.name]
      );

      if (existing.rows.length > 0) {
        await this.productionDb.query(`
          UPDATE routing_rules
          SET
            pattern = $1,
            action = $2,
            priority = $3,
            updated_at = NOW()
          WHERE id = $4
        `, [rule.pattern, rule.action, rule.priority, existing.rows[0].id]);
      } else {
        await this.productionDb.query(`
          INSERT INTO routing_rules (name, pattern, action, priority, enabled)
          VALUES ($1, $2, $3, $4, $5)
        `, [rule.name, rule.pattern, rule.action, rule.priority, true]);
      }

      promoted++;
    }

    console.log(`[Deployment] ✓ Promoted ${promoted} routing rules`);
    return { promoted, total: stagingRules.rows.length };
  }

  /**
   * Promote OAuth providers
   */
  async promoteOAuthProviders() {
    console.log('[Deployment] Promoting OAuth providers...');

    const stagingProviders = await this.stagingDb.query(`
      SELECT * FROM oauth_providers WHERE enabled = true
    `);

    let promoted = 0;

    for (const provider of stagingProviders.rows) {
      const existing = await this.productionDb.query(
        'SELECT provider_id FROM oauth_providers WHERE provider_id = $1',
        [provider.provider_id]
      );

      if (existing.rows.length > 0) {
        await this.productionDb.query(`
          UPDATE oauth_providers
          SET
            client_id = $1,
            scopes = $2,
            enabled = $3,
            updated_at = NOW()
          WHERE provider_id = $4
        `, [provider.client_id, provider.scopes, true, provider.provider_id]);
      } else {
        await this.productionDb.query(`
          INSERT INTO oauth_providers (
            provider_id, provider_name, client_id, scopes,
            authorization_url, token_url, user_info_url, enabled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          provider.provider_id, provider.provider_name, provider.client_id,
          provider.scopes, provider.authorization_url, provider.token_url,
          provider.user_info_url, true
        ]);
      }

      promoted++;
    }

    console.log(`[Deployment] ✓ Promoted ${promoted} OAuth providers`);
    return { promoted, total: stagingProviders.rows.length };
  }

  /**
   * Promote agents
   */
  async promoteAgents() {
    console.log('[Deployment] Promoting agents...');

    const stagingAgents = await this.stagingDb.query(`
      SELECT * FROM agents WHERE status = 'active'
    `);

    let promoted = 0;

    for (const agent of stagingAgents.rows) {
      const existing = await this.productionDb.query(
        'SELECT id FROM agents WHERE name = $1',
        [agent.name]
      );

      if (existing.rows.length > 0) {
        await this.productionDb.query(`
          UPDATE agents
          SET
            config = $1,
            status = $2,
            updated_at = NOW()
          WHERE id = $3
        `, [agent.config, 'active', existing.rows[0].id]);
      } else {
        await this.productionDb.query(`
          INSERT INTO agents (name, config, status)
          VALUES ($1, $2, $3)
        `, [agent.name, agent.config, 'active']);
      }

      promoted++;
    }

    console.log(`[Deployment] ✓ Promoted ${promoted} agents`);
    return { promoted, total: stagingAgents.rows.length };
  }

  /**
   * Switch theme
   */
  async switchTheme(theme) {
    console.log(`[Deployment] Switching theme to: ${theme}`);

    const themeConfig = {
      current: theme,
      timestamp: new Date().toISOString()
    };

    const themeFile = path.join(__dirname, '../public/.theme');
    await fs.writeFile(themeFile, JSON.stringify(themeConfig, null, 2));

    console.log(`[Deployment] ✓ Theme switched to ${theme}`);
  }

  /**
   * Clear production cache
   */
  async clearProductionCache() {
    console.log('[Deployment] Clearing production cache...');

    // Clear Redis cache if available
    if (process.env.REDIS_URL) {
      // TODO: Implement Redis cache clear
    }

    // Clear file-based cache
    const cacheDir = path.join(__dirname, '../../cache');

    try {
      await fs.rm(cacheDir, { recursive: true, force: true });
      await fs.mkdir(cacheDir, { recursive: true });
      console.log('[Deployment] ✓ Cache cleared');
    } catch (error) {
      console.warn('[Deployment] Cache clear failed:', error.message);
    }
  }

  /**
   * Rollback to previous backup
   */
  async rollback(backupName) {
    console.log('\n=================================================');
    console.log('↩️  Rolling Back Deployment');
    console.log('=================================================\n');

    const backupPath = path.join(this.backupDir, backupName);

    // Verify backup exists
    try {
      await fs.access(backupPath);
    } catch {
      throw new Error(`Backup not found: ${backupName}`);
    }

    console.log(`[Rollback] Restoring from: ${backupName}`);

    // Restore database
    const dbBackup = path.join(backupPath, 'database.sql');

    try {
      await this.restoreDatabase(dbBackup);
    } catch (error) {
      console.error('[Rollback] Database restore failed:', error.message);
    }

    // Restore config files
    const configFiles = ['.env', '.env.production', 'package.json'];

    for (const file of configFiles) {
      const backupFile = path.join(backupPath, file);
      const destFile = path.join(__dirname, '../../', file);

      try {
        await fs.copyFile(backupFile, destFile);
        console.log(`[Rollback] ✓ Restored ${file}`);
      } catch (error) {
        console.warn(`[Rollback] Could not restore ${file}:`, error.message);
      }
    }

    console.log('\n✅ Rollback Complete!');
    console.log('=================================================\n');

    return { success: true, backup: backupName };
  }

  /**
   * Restore database from backup
   */
  async restoreDatabase(backupPath) {
    return new Promise((resolve, reject) => {
      const dbUrl = process.env.DATABASE_URL || 'postgresql://calos:calos@localhost:5432/calos';
      const cmd = `psql ${dbUrl} < ${backupPath}`;

      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          console.log('[Rollback] ✓ Database restored');
          resolve();
        }
      });
    });
  }

  /**
   * Get deployment history
   */
  async getDeploymentHistory(limit = 10) {
    try {
      const backups = await fs.readdir(this.backupDir);
      const backupInfo = [];

      for (const backup of backups.sort().reverse().slice(0, limit)) {
        const backupPath = path.join(this.backupDir, backup);
        const stats = await fs.stat(backupPath);

        backupInfo.push({
          name: backup,
          path: backupPath,
          created: stats.birthtime,
          size: stats.size
        });
      }

      return backupInfo;
    } catch (error) {
      console.error('[Deployment] Failed to get history:', error.message);
      return [];
    }
  }
}

module.exports = DeploymentManager;
