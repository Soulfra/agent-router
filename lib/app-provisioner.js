/**
 * App Provisioner
 *
 * Virtual app installation system - "installing app" = creating folder on server
 *
 * When user "installs" an app:
 * 1. Create isolated tenant instance
 * 2. Provision subdomain (dating-app-user-uuid.calos.ai)
 * 3. Create database schema for app
 * 4. Create folder: /instances/user-uuid/dating-app/
 * 5. Copy template files
 * 6. Generate API keys
 * 7. Inject persistent chat bot
 * 8. Add to launcher
 *
 * Similar to:
 * - Replit: instant sandbox provisioning
 * - Vercel: subdomain per deployment
 * - iPhone: app "installation" = folder creation
 * - Bonk Game SDK: npm install → auto-provision
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

class AppProvisioner {
  constructor(options = {}) {
    this.db = options.db;
    this.baseUrl = options.baseUrl || 'calos.ai';
    this.instancesPath = options.instancesPath || path.join(__dirname, '../../instances');
    this.templatesPath = options.templatesPath || path.join(__dirname, '../templates');

    console.log('[AppProvisioner] Initialized', {
      baseUrl: this.baseUrl,
      instancesPath: this.instancesPath
    });
  }

  /**
   * Install app for user (virtual provisioning)
   *
   * @param {string} userId - User ID
   * @param {string} templateId - Template ID (dating, politics, gaming)
   * @param {object} options - Installation options
   * @returns {Promise<object>} - Installed app info
   */
  async installApp(userId, templateId, options = {}) {
    try {
      console.log(`[AppProvisioner] Installing ${templateId} for user ${userId}`);

      // Get template info
      const template = await this.getTemplate(templateId);
      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      // Check if user already has this app installed
      const existing = await this.db.query(`
        SELECT app_id FROM user_installed_apps
        WHERE user_id = $1 AND template_id = $2 AND status = 'active'
      `, [userId, templateId]);

      if (existing.rows.length > 0) {
        throw new Error(`User already has ${template.name} installed`);
      }

      // Generate IDs
      const appId = crypto.randomUUID();
      const tenantId = `tenant-${crypto.randomBytes(8).toString('hex')}`;
      const instanceId = `${templateId}-${userId.split('-')[0]}`;

      // 1. Create tenant instance
      await this.createTenant(tenantId, userId, templateId);

      // 2. Provision subdomain
      const subdomain = await this.provisionSubdomain(instanceId, tenantId);

      // 3. Create database schema
      await this.createDatabaseSchema(tenantId, template);

      // 4. Create app folder
      const folderPath = await this.createAppFolder(userId, instanceId);

      // 5. Copy template files
      await this.copyTemplateFiles(template, folderPath);

      // 6. Generate API keys
      const apiKey = await this.generateAPIKey(tenantId, appId);

      // 7. Configure app instance
      await this.configureAppInstance(folderPath, {
        appId,
        tenantId,
        userId,
        subdomain,
        apiKey,
        template
      });

      // 8. Save installation record
      const result = await this.db.query(`
        INSERT INTO user_installed_apps (
          app_id,
          user_id,
          template_id,
          tenant_id,
          instance_id,
          subdomain,
          folder_path,
          api_key,
          status,
          installed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW())
        RETURNING *
      `, [
        appId,
        userId,
        templateId,
        tenantId,
        instanceId,
        subdomain,
        folderPath,
        apiKey
      ]);

      // 9. Add to launcher
      await this.addToLauncher(userId, appId, options.folderId);

      console.log(`[AppProvisioner] Installed ${template.name} as ${subdomain}`);

      return {
        app_id: appId,
        tenant_id: tenantId,
        name: template.name,
        url: `https://${subdomain}`,
        folder_path: folderPath,
        api_key: apiKey,
        installed_at: result.rows[0].installed_at
      };

    } catch (error) {
      console.error('[AppProvisioner] Install error:', error);
      throw error;
    }
  }

  /**
   * Uninstall app (soft delete)
   *
   * @param {string} userId - User ID
   * @param {string} appId - App ID
   * @returns {Promise<boolean>}
   */
  async uninstallApp(userId, appId) {
    try {
      // Get app info
      const result = await this.db.query(`
        SELECT * FROM user_installed_apps
        WHERE app_id = $1 AND user_id = $2 AND status = 'active'
      `, [appId, userId]);

      if (result.rows.length === 0) {
        throw new Error('App not found or already uninstalled');
      }

      const app = result.rows[0];

      // Mark as uninstalled (soft delete)
      await this.db.query(`
        UPDATE user_installed_apps
        SET status = 'uninstalled',
            uninstalled_at = NOW()
        WHERE app_id = $1
      `, [appId]);

      // Remove from launcher
      await this.removeFromLauncher(userId, appId);

      // Archive folder (don't delete - user may reinstall)
      await this.archiveAppFolder(app.folder_path);

      console.log(`[AppProvisioner] Uninstalled app ${appId}`);

      return true;

    } catch (error) {
      console.error('[AppProvisioner] Uninstall error:', error);
      throw error;
    }
  }

  /**
   * Get user's installed apps
   *
   * @param {string} userId - User ID
   * @returns {Promise<array>} - Installed apps
   */
  async getInstalledApps(userId) {
    try {
      const result = await this.db.query(`
        SELECT
          uia.app_id,
          uia.template_id,
          uia.subdomain,
          uia.folder_path,
          uia.installed_at,
          at.name,
          at.description,
          at.icon,
          at.category
        FROM user_installed_apps uia
        JOIN app_templates at ON at.template_id = uia.template_id
        WHERE uia.user_id = $1
          AND uia.status = 'active'
        ORDER BY uia.installed_at DESC
      `, [userId]);

      return result.rows.map(row => ({
        app_id: row.app_id,
        template_id: row.template_id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        category: row.category,
        url: `https://${row.subdomain}`,
        folder_path: row.folder_path,
        installed_at: row.installed_at
      }));

    } catch (error) {
      console.error('[AppProvisioner] Get installed apps error:', error);
      return [];
    }
  }

  /**
   * Get template info
   *
   * @param {string} templateId - Template ID
   * @returns {Promise<object>} - Template
   */
  async getTemplate(templateId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM app_templates
        WHERE template_id = $1 AND status = 'active'
      `, [templateId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('[AppProvisioner] Get template error:', error);
      return null;
    }
  }

  /**
   * Create tenant instance
   *
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID
   * @param {string} templateId - Template ID
   * @returns {Promise<void>}
   */
  async createTenant(tenantId, userId, templateId) {
    try {
      await this.db.query(`
        INSERT INTO app_instances (
          tenant_id,
          user_id,
          template_id,
          status,
          created_at
        )
        VALUES ($1, $2, $3, 'active', NOW())
      `, [tenantId, userId, templateId]);

      console.log(`[AppProvisioner] Created tenant ${tenantId}`);

    } catch (error) {
      console.error('[AppProvisioner] Create tenant error:', error);
      throw error;
    }
  }

  /**
   * Provision subdomain
   *
   * @param {string} instanceId - Instance ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<string>} - Subdomain
   */
  async provisionSubdomain(instanceId, tenantId) {
    // Format: dating-app-abc123.calos.ai
    const subdomain = `${instanceId}.${this.baseUrl}`;

    // In production: configure DNS/proxy routing
    // For now: just return subdomain

    console.log(`[AppProvisioner] Provisioned subdomain ${subdomain}`);

    return subdomain;
  }

  /**
   * Create database schema for app
   *
   * @param {string} tenantId - Tenant ID
   * @param {object} template - Template info
   * @returns {Promise<void>}
   */
  async createDatabaseSchema(tenantId, template) {
    try {
      // Create schema for tenant
      await this.db.query(`
        CREATE SCHEMA IF NOT EXISTS ${tenantId}
      `);

      // Apply template-specific schema
      if (template.schema_sql) {
        // Set search path to tenant schema
        await this.db.query(`SET search_path TO ${tenantId}`);

        // Run schema SQL
        await this.db.query(template.schema_sql);

        // Reset search path
        await this.db.query(`SET search_path TO public`);
      }

      console.log(`[AppProvisioner] Created database schema for ${tenantId}`);

    } catch (error) {
      console.error('[AppProvisioner] Create schema error:', error);
      throw error;
    }
  }

  /**
   * Create app folder
   *
   * @param {string} userId - User ID
   * @param {string} instanceId - Instance ID
   * @returns {Promise<string>} - Folder path
   */
  async createAppFolder(userId, instanceId) {
    try {
      // Path: /instances/user-uuid/dating-app-abc123/
      const folderPath = path.join(this.instancesPath, userId, instanceId);

      // Create folder
      await fs.mkdir(folderPath, { recursive: true });

      console.log(`[AppProvisioner] Created folder ${folderPath}`);

      return folderPath;

    } catch (error) {
      console.error('[AppProvisioner] Create folder error:', error);
      throw error;
    }
  }

  /**
   * Copy template files to app folder
   *
   * @param {object} template - Template info
   * @param {string} folderPath - Destination folder
   * @returns {Promise<void>}
   */
  async copyTemplateFiles(template, folderPath) {
    try {
      const templatePath = path.join(this.templatesPath, template.template_id);

      // Check if template folder exists
      try {
        await fs.access(templatePath);
      } catch {
        // Template folder doesn't exist - create default structure
        console.log(`[AppProvisioner] Template folder not found, creating default structure`);
        await this.createDefaultStructure(folderPath, template);
        return;
      }

      // Copy template files
      await this.copyRecursive(templatePath, folderPath);

      console.log(`[AppProvisioner] Copied template files to ${folderPath}`);

    } catch (error) {
      console.error('[AppProvisioner] Copy files error:', error);
      throw error;
    }
  }

  /**
   * Copy directory recursively
   *
   * @param {string} src - Source directory
   * @param {string} dest - Destination directory
   * @returns {Promise<void>}
   */
  async copyRecursive(src, dest) {
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Create default app structure
   *
   * @param {string} folderPath - App folder path
   * @param {object} template - Template info
   * @returns {Promise<void>}
   */
  async createDefaultStructure(folderPath, template) {
    // Create basic files
    await fs.writeFile(
      path.join(folderPath, 'index.html'),
      `<!DOCTYPE html>
<html>
<head>
  <title>${template.name}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <h1>${template.name}</h1>
  <p>${template.description}</p>
</body>
</html>`
    );

    await fs.writeFile(
      path.join(folderPath, 'config.json'),
      JSON.stringify({
        name: template.name,
        template_id: template.template_id,
        version: '1.0.0'
      }, null, 2)
    );
  }

  /**
   * Generate API key for app instance
   *
   * @param {string} tenantId - Tenant ID
   * @param {string} appId - App ID
   * @returns {Promise<string>} - API key
   */
  async generateAPIKey(tenantId, appId) {
    const apiKey = `sk_${tenantId}_${crypto.randomBytes(24).toString('base64url')}`;

    await this.db.query(`
      INSERT INTO api_keys (
        key_id,
        api_key,
        tenant_id,
        app_id,
        created_at
      )
      VALUES ($1, $2, $3, $4, NOW())
    `, [crypto.randomUUID(), apiKey, tenantId, appId]);

    return apiKey;
  }

  /**
   * Configure app instance
   *
   * @param {string} folderPath - App folder path
   * @param {object} config - Configuration
   * @returns {Promise<void>}
   */
  async configureAppInstance(folderPath, config) {
    const configPath = path.join(folderPath, '.env');

    const envContent = `
APP_ID=${config.appId}
TENANT_ID=${config.tenantId}
USER_ID=${config.userId}
SUBDOMAIN=${config.subdomain}
API_KEY=${config.apiKey}
TEMPLATE_ID=${config.template.template_id}
TEMPLATE_NAME=${config.template.name}
`.trim();

    await fs.writeFile(configPath, envContent);

    console.log(`[AppProvisioner] Configured app instance`);
  }

  /**
   * Add app to user's launcher
   *
   * @param {string} userId - User ID
   * @param {string} appId - App ID
   * @param {string} folderId - Launcher folder ID (optional)
   * @returns {Promise<void>}
   */
  async addToLauncher(userId, appId, folderId = null) {
    try {
      await this.db.query(`
        INSERT INTO launcher_apps (
          user_id,
          app_id,
          folder_id,
          position,
          added_at
        )
        VALUES ($1, $2, $3, (
          SELECT COALESCE(MAX(position), 0) + 1
          FROM launcher_apps
          WHERE user_id = $1
        ), NOW())
      `, [userId, appId, folderId]);

      console.log(`[AppProvisioner] Added app ${appId} to launcher`);

    } catch (error) {
      console.error('[AppProvisioner] Add to launcher error:', error);
      throw error;
    }
  }

  /**
   * Remove app from launcher
   *
   * @param {string} userId - User ID
   * @param {string} appId - App ID
   * @returns {Promise<void>}
   */
  async removeFromLauncher(userId, appId) {
    try {
      await this.db.query(`
        DELETE FROM launcher_apps
        WHERE user_id = $1 AND app_id = $2
      `, [userId, appId]);

      console.log(`[AppProvisioner] Removed app ${appId} from launcher`);

    } catch (error) {
      console.error('[AppProvisioner] Remove from launcher error:', error);
      throw error;
    }
  }

  /**
   * Archive app folder
   *
   * @param {string} folderPath - Folder path
   * @returns {Promise<void>}
   */
  async archiveAppFolder(folderPath) {
    try {
      const archivePath = `${folderPath}.archived.${Date.now()}`;
      await fs.rename(folderPath, archivePath);

      console.log(`[AppProvisioner] Archived folder to ${archivePath}`);

    } catch (error) {
      console.error('[AppProvisioner] Archive folder error:', error);
      // Don't throw - archiving is optional
    }
  }

  /**
   * Get app instance info
   *
   * @param {string} appId - App ID
   * @returns {Promise<object>} - App instance
   */
  async getAppInstance(appId) {
    try {
      const result = await this.db.query(`
        SELECT
          uia.*,
          at.name,
          at.description,
          at.icon,
          at.category
        FROM user_installed_apps uia
        JOIN app_templates at ON at.template_id = uia.template_id
        WHERE uia.app_id = $1
      `, [appId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('[AppProvisioner] Get instance error:', error);
      return null;
    }
  }
}

module.exports = AppProvisioner;
