/**
 * Google Piggyback Integration
 *
 * "we can build our index while piggybacking for awhile"
 *
 * Instead of rebuilding Google Drive/Sheets, USE them for:
 * - Storage (Google Drive API)
 * - Initial "database" (Google Sheets as tables)
 * - Collaboration (existing Google infra)
 *
 * BUT build our OWN:
 * - Idea growth index
 * - Momentum tracking
 * - Potential scoring
 *
 * This lets us:
 * - Start fast (no infrastructure)
 * - Migrate slowly (build our index)
 * - Dogfood continuously (track real usage)
 *
 * Use Cases:
 * - Store ideas in Google Sheets (free 1M cells)
 * - Track activity in our index
 * - Migrate high-value ideas to our DB
 * - Keep using Google for storage
 */

const { google } = require('googleapis');
const { Pool } = require('pg');

class GooglePiggyback {
  constructor(config = {}) {
    this.pool = config.pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });

    // Google Auth
    this.credentials = config.credentials || {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI
    };

    this.auth = null;
    this.drive = null;
    this.sheets = null;

    // Piggyback configuration
    this.sheetId = config.sheetId || process.env.GOOGLE_SHEET_ID;
    this.driveFolder = config.driveFolder || process.env.GOOGLE_DRIVE_FOLDER;

    console.log('[GooglePiggyback] Initialized');
  }

  /**
   * Initialize Google APIs
   */
  async initialize(tokens) {
    try {
      // Create OAuth2 client
      const { clientId, clientSecret, redirectUri } = this.credentials;

      this.auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

      // Set credentials
      if (tokens) {
        this.auth.setCredentials(tokens);
      }

      // Initialize APIs
      this.drive = google.drive({ version: 'v3', auth: this.auth });
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });

      console.log('[GooglePiggyback] APIs initialized');
    } catch (error) {
      console.error('[GooglePiggyback] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Submit idea to Google Sheets
   *
   * Sheet structure:
   * | ID | Title | Description | Category | Submitted | Creator | Growth | Potential |
   *
   * @param {Object} idea
   * @returns {Object} Submitted idea
   */
  async submitIdea(idea) {
    try {
      const { title, description, category, creatorId } = idea;

      // Generate ID
      const ideaId = `idea_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Prepare row
      const row = [
        ideaId,
        title,
        description,
        category || 'general',
        new Date().toISOString(),
        creatorId,
        0, // Initial growth score
        0  // Initial potential score
      ];

      // Append to sheet
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.sheetId,
        range: 'Ideas!A:H', // Ideas sheet, columns A-H
        valueInputOption: 'RAW',
        resource: {
          values: [row]
        }
      });

      // Also track in our index (this is what makes us unique)
      await this.pool.query(`
        INSERT INTO idea_index (
          idea_id,
          source,
          source_id,
          title,
          created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [ideaId, 'google_sheets', this.sheetId, title]);

      console.log(`[GooglePiggyback] Idea submitted: ${ideaId}`);

      return {
        ideaId,
        title,
        description,
        category,
        creatorId,
        source: 'google_sheets',
        submitted: new Date()
      };
    } catch (error) {
      console.error('[GooglePiggyback] Error submitting idea:', error);
      throw error;
    }
  }

  /**
   * Get ideas from Google Sheets
   *
   * Returns all ideas, but ENRICHED with our growth data
   */
  async getIdeas(options = {}) {
    try {
      const { category, minPotential = 0, limit = 100 } = options;

      // Read from sheet
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'Ideas!A:H'
      });

      const rows = response.data.values || [];

      if (rows.length === 0) {
        return [];
      }

      // Parse rows (skip header)
      const ideas = rows.slice(1).map(row => ({
        ideaId: row[0],
        title: row[1],
        description: row[2],
        category: row[3],
        submitted: row[4],
        creatorId: row[5],
        growth: parseFloat(row[6]) || 0,
        potential: parseFloat(row[7]) || 0
      }));

      // Filter by category
      let filtered = ideas;
      if (category) {
        filtered = ideas.filter(idea => idea.category === category);
      }

      // Filter by potential
      filtered = filtered.filter(idea => idea.potential >= minPotential);

      // Limit results
      filtered = filtered.slice(0, limit);

      // Enrich with our growth data
      const enriched = await Promise.all(
        filtered.map(async (idea) => {
          const growthData = await this.pool.query(`
            SELECT growth_state, inflection
            FROM idea_growth_state
            WHERE idea_id = $1
            ORDER BY updated_at DESC
            LIMIT 1
          `, [idea.ideaId]);

          return {
            ...idea,
            growthData: growthData.rows[0] || null
          };
        })
      );

      return enriched;
    } catch (error) {
      console.error('[GooglePiggyback] Error getting ideas:', error);
      throw error;
    }
  }

  /**
   * Update growth scores in Google Sheets
   *
   * Called after our index recalculates growth/potential
   */
  async updateGrowthScores(ideaId, growth, potential) {
    try {
      // Find row with this ideaId
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: 'Ideas!A:A'
      });

      const ids = response.data.values || [];
      const rowIndex = ids.findIndex(row => row[0] === ideaId);

      if (rowIndex === -1) {
        console.warn(`[GooglePiggyback] Idea not found in sheet: ${ideaId}`);
        return;
      }

      // Update growth & potential columns (G and H)
      const rowNumber = rowIndex + 1; // 1-indexed
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: `Ideas!G${rowNumber}:H${rowNumber}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[growth, potential]]
        }
      });

      console.log(`[GooglePiggyback] Updated growth scores for ${ideaId}`);
    } catch (error) {
      console.error('[GooglePiggyback] Error updating scores:', error);
      throw error;
    }
  }

  /**
   * Migrate high-potential ideas to our database
   *
   * "build our index while piggybacking"
   *
   * When an idea reaches threshold (e.g., potential > 70), migrate it:
   * - Copy to our marketplace_ideas table
   * - Keep tracking in Google Sheets
   * - Sync bidirectionally
   */
  async migrateHighPotentialIdeas(threshold = 70) {
    try {
      const ideas = await this.getIdeas({ minPotential: threshold });

      let migrated = 0;

      for (const idea of ideas) {
        // Check if already migrated
        const existing = await this.pool.query(`
          SELECT id FROM marketplace_ideas WHERE title = $1
        `, [idea.title]);

        if (existing.rows.length > 0) {
          console.log(`[GooglePiggyback] Already migrated: ${idea.title}`);
          continue;
        }

        // Migrate to our database
        await this.pool.query(`
          INSERT INTO marketplace_ideas (
            creator_id,
            title,
            description,
            category,
            metadata,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          idea.creatorId,
          idea.title,
          idea.description,
          idea.category,
          JSON.stringify({ source: 'google_sheets', originalId: idea.ideaId }),
          idea.submitted
        ]);

        migrated++;
        console.log(`[GooglePiggyback] Migrated: ${idea.title}`);
      }

      return { migrated, threshold };
    } catch (error) {
      console.error('[GooglePiggyback] Migration error:', error);
      throw error;
    }
  }

  /**
   * Store file in Google Drive
   *
   * Use Drive for file storage, our DB for metadata
   */
  async storeFile(filePath, metadata = {}) {
    try {
      const fileMetadata = {
        name: metadata.name || filePath.split('/').pop(),
        parents: this.driveFolder ? [this.driveFolder] : []
      };

      const media = {
        mimeType: metadata.mimeType || 'application/octet-stream',
        body: require('fs').createReadStream(filePath)
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media,
        fields: 'id, name, webViewLink, webContentLink'
      });

      const file = response.data;

      // Track in our index
      await this.pool.query(`
        INSERT INTO file_index (
          file_id,
          source,
          source_id,
          name,
          url,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        file.id,
        'google_drive',
        this.driveFolder,
        file.name,
        file.webViewLink,
        JSON.stringify(metadata)
      ]);

      return {
        fileId: file.id,
        name: file.name,
        viewUrl: file.webViewLink,
        downloadUrl: file.webContentLink,
        source: 'google_drive'
      };
    } catch (error) {
      console.error('[GooglePiggyback] Error storing file:', error);
      throw error;
    }
  }

  /**
   * Get file from Google Drive
   */
  async getFile(fileId) {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType, webViewLink, webContentLink, createdTime'
      });

      return response.data;
    } catch (error) {
      console.error('[GooglePiggyback] Error getting file:', error);
      throw error;
    }
  }

  /**
   * Export Google Sheets data to our database
   *
   * For migration: move everything to our DB
   */
  async exportToDatabase() {
    try {
      const ideas = await this.getIdeas();

      let exported = 0;

      for (const idea of ideas) {
        // Check if exists
        const existing = await this.pool.query(`
          SELECT id FROM marketplace_ideas WHERE title = $1
        `, [idea.title]);

        if (existing.rows.length > 0) {
          continue;
        }

        // Export
        await this.pool.query(`
          INSERT INTO marketplace_ideas (
            creator_id,
            title,
            description,
            category,
            metadata,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          idea.creatorId,
          idea.title,
          idea.description,
          idea.category,
          JSON.stringify({ source: 'google_sheets', originalId: idea.ideaId }),
          idea.submitted
        ]);

        exported++;
      }

      console.log(`[GooglePiggyback] Exported ${exported} ideas to database`);

      return { exported, total: ideas.length };
    } catch (error) {
      console.error('[GooglePiggyback] Export error:', error);
      throw error;
    }
  }
}

module.exports = GooglePiggyback;
