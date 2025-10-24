/**
 * GoogleDriveAppPublisher
 *
 * Publishes web apps to Google Drive for easy distribution via:
 * - https://drive.google.com/start/apps
 * - Google Workspace Marketplace
 *
 * Makes apps accessible through Google's infrastructure without
 * requiring users to download/install anything.
 *
 * Usage:
 *   const publisher = new GoogleDriveAppPublisher({ credentials });
 *   await publisher.publishApp('/path/to/app', {
 *     name: 'My Card Game',
 *     description: 'Awesome card game',
 *     category: 'GAMES'
 *   });
 */

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const { createReadStream } = require('fs');

class GoogleDriveAppPublisher {
  constructor(options = {}) {
    this.credentials = options.credentials || {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI
    };

    this.db = options.db;
    this.auth = null;
    this.drive = null;

    console.log('[GoogleDriveAppPublisher] Initialized');
  }

  /**
   * Initialize Google APIs with user OAuth tokens
   * @param {object} tokens - OAuth tokens
   */
  async initialize(tokens) {
    const { clientId, clientSecret, redirectUri } = this.credentials;

    this.auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    this.auth.setCredentials(tokens);

    this.drive = google.drive({ version: 'v3', auth: this.auth });

    console.log('[GoogleDriveAppPublisher] APIs initialized');
  }

  /**
   * Publish an app to Google Drive
   * @param {string} appPath - Path to app directory
   * @param {object} options - Publish options
   * @returns {Promise<object>} - Publication result
   */
  async publishApp(appPath, options = {}) {
    const {
      name,
      description = 'Built with CALOS Agent Router',
      category = 'PRODUCTIVITY', // GAMES, PRODUCTIVITY, EDUCATION, etc.
      public: isPublic = true
    } = options;

    if (!name) throw new Error('App name required');
    if (!this.drive) throw new Error('Must call initialize() first');

    console.log(`[GoogleDriveAppPublisher] Publishing ${name}...`);

    try {
      // 1. Create app folder in Drive
      const folder = await this.createAppFolder(name, description);

      // 2. Upload app files
      const files = await this.uploadAppFiles(appPath, folder.id);

      // 3. Create index.html redirector (for drive.google.com/start/apps)
      const indexUrl = await this.createIndexRedirector(folder.id, name, files);

      // 4. Set permissions (public if requested)
      if (isPublic) {
        await this.makePublic(folder.id);
      }

      // 5. Generate shareable link
      const shareLink = this.generateShareLink(folder.id);

      // 6. Save to database
      if (this.db) {
        await this.saveDeployment(name, folder.id, shareLink, options);
      }

      return {
        success: true,
        folderId: folder.id,
        shareLink,
        appUrl: indexUrl,
        files: files.length
      };
    } catch (error) {
      console.error('[GoogleDriveAppPublisher] Error:', error);
      throw error;
    }
  }

  /**
   * Create app folder in Google Drive
   * @param {string} name - App name
   * @param {string} description - App description
   * @returns {Promise<object>} - Created folder
   */
  async createAppFolder(name, description) {
    try {
      const { data: folder } = await this.drive.files.create({
        requestBody: {
          name,
          description,
          mimeType: 'application/vnd.google-apps.folder'
        },
        fields: 'id, name, webViewLink'
      });

      console.log(`[GoogleDriveAppPublisher] Created folder: ${folder.id}`);

      return folder;
    } catch (error) {
      console.error('[GoogleDriveAppPublisher] Failed to create folder:', error);
      throw error;
    }
  }

  /**
   * Upload app files to Drive folder
   * @param {string} appPath - App directory
   * @param {string} folderId - Drive folder ID
   * @returns {Promise<Array>} - Uploaded files
   */
  async uploadAppFiles(appPath, folderId) {
    try {
      const uploadedFiles = [];

      // Read all files in app directory
      const files = await this.getAllFiles(appPath);

      for (const file of files) {
        const relativePath = path.relative(appPath, file);
        const fileName = path.basename(file);

        // Upload file
        const { data: uploadedFile } = await this.drive.files.create({
          requestBody: {
            name: fileName,
            parents: [folderId]
          },
          media: {
            body: createReadStream(file)
          },
          fields: 'id, name, webViewLink, webContentLink'
        });

        uploadedFiles.push({
          id: uploadedFile.id,
          name: fileName,
          path: relativePath,
          viewLink: uploadedFile.webViewLink,
          downloadLink: uploadedFile.webContentLink
        });

        console.log(`[GoogleDriveAppPublisher] Uploaded: ${fileName}`);
      }

      return uploadedFiles;
    } catch (error) {
      console.error('[GoogleDriveAppPublisher] Failed to upload files:', error);
      throw error;
    }
  }

  /**
   * Get all files recursively from a directory
   * @param {string} dir - Directory path
   * @returns {Promise<Array>} - File paths
   */
  async getAllFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules, .git, etc.
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await this.getAllFiles(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Create index.html redirector for the app
   * @param {string} folderId - Drive folder ID
   * @param {string} appName - App name
   * @param {Array} files - Uploaded files
   * @returns {Promise<string>} - App URL
   */
  async createIndexRedirector(folderId, appName, files) {
    try {
      // Find main HTML file
      const mainFile = files.find(f =>
        f.name === 'index.html' ||
        f.name === 'app.html' ||
        f.name.endsWith('.html')
      );

      if (!mainFile) {
        console.warn('[GoogleDriveAppPublisher] No HTML file found');
        return null;
      }

      // Generate public URL for the HTML file
      const appUrl = mainFile.downloadLink || mainFile.viewLink;

      console.log(`[GoogleDriveAppPublisher] App URL: ${appUrl}`);

      return appUrl;
    } catch (error) {
      console.warn('[GoogleDriveAppPublisher] Failed to create redirector:', error.message);
      return null;
    }
  }

  /**
   * Make a folder/file public
   * @param {string} fileId - File/folder ID
   */
  async makePublic(fileId) {
    try {
      await this.drive.permissions.create({
        fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });

      console.log(`[GoogleDriveAppPublisher] Made public: ${fileId}`);
    } catch (error) {
      console.warn('[GoogleDriveAppPublisher] Failed to make public:', error.message);
    }
  }

  /**
   * Generate shareable link
   * @param {string} folderId - Folder ID
   * @returns {string} - Share link
   */
  generateShareLink(folderId) {
    return `https://drive.google.com/drive/folders/${folderId}`;
  }

  /**
   * Save deployment to database
   * @param {string} name - App name
   * @param {string} folderId - Drive folder ID
   * @param {string} shareLink - Share link
   * @param {object} options - Deployment options
   */
  async saveDeployment(name, folderId, shareLink, options) {
    try {
      await this.db.query(
        `INSERT INTO google_drive_deployments (
          app_name, folder_id, share_link, app_url,
          is_public, category, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          name,
          folderId,
          shareLink,
          options.appUrl || shareLink,
          options.public !== false,
          options.category || 'PRODUCTIVITY',
          JSON.stringify({
            description: options.description,
            files: options.files || 0
          })
        ]
      );

      console.log(`[GoogleDriveAppPublisher] Deployment saved to database`);
    } catch (error) {
      console.warn('[GoogleDriveAppPublisher] Failed to save deployment:', error.message);
    }
  }

  /**
   * Publish to Google Workspace Marketplace
   * (Requires Workspace Marketplace API setup)
   * @param {string} appPath - App directory
   * @param {object} options - Marketplace options
   */
  async publishToMarketplace(appPath, options = {}) {
    console.log('[GoogleDriveAppPublisher] Marketplace publishing not yet implemented');
    console.log('  See: https://developers.google.com/workspace/marketplace/how-to-publish');

    // TODO: Implement Google Workspace Marketplace API
    // Requires:
    // 1. OAuth consent screen configured
    // 2. Workspace Marketplace API enabled
    // 3. App manifest (manifest.json)
    // 4. Store listing details
    // 5. Screenshots/assets

    return {
      success: false,
      message: 'Marketplace publishing coming soon. Use Drive distribution for now.'
    };
  }

  /**
   * Create web app script (Google Apps Script alternative)
   * @param {string} appName - App name
   * @param {string} htmlContent - HTML content
   * @returns {Promise<object>} - Web app details
   */
  async createWebApp(appName, htmlContent) {
    try {
      // Create Google Apps Script project
      // This would host the app at script.google.com/macros/s/{ID}/exec

      console.log('[GoogleDriveAppPublisher] Web app creation not yet implemented');
      console.log('  Alternative: Use Drive hosting or deploy to GitHub Pages');

      // TODO: Implement Google Apps Script web app hosting
      // Requires:
      // 1. Google Apps Script API enabled
      // 2. Create script project
      // 3. Add HTML file
      // 4. Deploy as web app
      // 5. Set permissions

      return {
        success: false,
        message: 'Google Apps Script hosting coming soon'
      };
    } catch (error) {
      console.error('[GoogleDriveAppPublisher] Web app creation failed:', error);
      throw error;
    }
  }

  /**
   * Delete an app from Drive
   * @param {string} folderId - Folder ID
   */
  async deleteApp(folderId) {
    try {
      await this.drive.files.delete({ fileId: folderId });
      console.log(`[GoogleDriveAppPublisher] Deleted: ${folderId}`);

      return { success: true };
    } catch (error) {
      console.error('[GoogleDriveAppPublisher] Failed to delete:', error);
      throw error;
    }
  }

  /**
   * List published apps
   * @returns {Promise<Array>} - Published apps
   */
  async listPublishedApps() {
    try {
      const { data } = await this.drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id, name, description, webViewLink, createdTime)',
        orderBy: 'createdTime desc'
      });

      return data.files || [];
    } catch (error) {
      console.error('[GoogleDriveAppPublisher] Failed to list apps:', error);
      throw error;
    }
  }
}

module.exports = GoogleDriveAppPublisher;
