/**
 * Attribution Tracker - Privacy-First Usage Analytics
 *
 * Tracks SDK usage WITHOUT surveillance:
 * - Stores data in YOUR Google Sheets (not Big Tech)
 * - Only tracks: domain, version, timestamp
 * - NO user data, IPs, cookies, or PII
 * - Opt-in only (telemetry: true in SDK config)
 *
 * This is how you track adoption WITHOUT becoming Google Analytics
 *
 * @license AGPLv3
 */

const GoogleSheetsAdapter = require('./google-sheets-db-adapter');

class AttributionTracker {
  constructor() {
    this.sheetsAdapter = null;
    this.sheetName = 'SDK_Attribution';
  }

  /**
   * Initialize with Google Sheets
   */
  async init() {
    try {
      this.sheetsAdapter = new GoogleSheetsAdapter();
      await this.sheetsAdapter.init();

      // Create attribution sheet if it doesn't exist
      await this.ensureSheet();

      console.log('[AttributionTracker] Initialized (privacy-first mode)');
    } catch (error) {
      console.error('[AttributionTracker] Init failed:', error.message);
      // Don't throw - telemetry is optional
    }
  }

  /**
   * Ensure attribution sheet exists
   */
  async ensureSheet() {
    try {
      // Check if sheet exists
      const sheets = await this.sheetsAdapter.sheets.spreadsheets.get({
        spreadsheetId: this.sheetsAdapter.spreadsheetId
      });

      const sheetExists = sheets.data.sheets.some(
        s => s.properties.title === this.sheetName
      );

      if (!sheetExists) {
        // Create sheet with headers
        await this.sheetsAdapter.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.sheetsAdapter.spreadsheetId,
          requestBody: {
            requests: [{
              addSheet: {
                properties: {
                  title: this.sheetName
                }
              }
            }]
          }
        });

        // Add headers
        await this.sheetsAdapter.sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetsAdapter.spreadsheetId,
          range: `${this.sheetName}!A1:E1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[
              'Timestamp',
              'Domain',
              'SDK Version',
              'Privacy Mode',
              'First Seen'
            ]]
          }
        });

        console.log('[AttributionTracker] Created sheet with headers');
      }
    } catch (error) {
      console.error('[AttributionTracker] Sheet creation failed:', error.message);
    }
  }

  /**
   * Record attribution (privacy-first)
   *
   * @param {Object} data - Attribution data
   * @param {string} data.domain - Domain using SDK
   * @param {string} data.version - SDK version
   * @param {string} data.privacyMode - Privacy mode setting
   * @param {string} data.timestamp - ISO timestamp
   */
  async record(data) {
    if (!this.sheetsAdapter) {
      console.warn('[AttributionTracker] Not initialized, skipping');
      return { success: false, reason: 'not_initialized' };
    }

    try {
      // Validate data
      if (!data.domain || !data.version) {
        return { success: false, reason: 'invalid_data' };
      }

      // Check if domain already exists
      const existing = await this.getDomain(data.domain);

      if (existing) {
        // Update last seen timestamp
        await this.updateDomain(data.domain, data);
        return {
          success: true,
          action: 'updated',
          domain: data.domain
        };
      } else {
        // Add new domain
        await this.addDomain(data);
        return {
          success: true,
          action: 'created',
          domain: data.domain
        };
      }

    } catch (error) {
      console.error('[AttributionTracker] Record failed:', error.message);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Get domain attribution data
   */
  async getDomain(domain) {
    try {
      const response = await this.sheetsAdapter.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetsAdapter.spreadsheetId,
        range: `${this.sheetName}!A2:E`
      });

      const rows = response.data.values || [];

      const domainRow = rows.find(row => row[1] === domain);

      if (domainRow) {
        return {
          timestamp: domainRow[0],
          domain: domainRow[1],
          version: domainRow[2],
          privacyMode: domainRow[3],
          firstSeen: domainRow[4]
        };
      }

      return null;
    } catch (error) {
      console.error('[AttributionTracker] Get domain failed:', error.message);
      return null;
    }
  }

  /**
   * Add new domain
   */
  async addDomain(data) {
    const row = [
      data.timestamp,
      data.domain,
      data.version,
      data.privacyMode,
      data.timestamp // First seen = current timestamp
    ];

    await this.sheetsAdapter.sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetsAdapter.spreadsheetId,
      range: `${this.sheetName}!A:E`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [row]
      }
    });

    console.log(`[AttributionTracker] Added new domain: ${data.domain}`);
  }

  /**
   * Update existing domain
   */
  async updateDomain(domain, data) {
    try {
      const response = await this.sheetsAdapter.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetsAdapter.spreadsheetId,
        range: `${this.sheetName}!A2:E`
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[1] === domain);

      if (rowIndex !== -1) {
        const existingFirstSeen = rows[rowIndex][4];

        // Update row (keep first seen, update rest)
        const updatedRow = [
          data.timestamp,
          data.domain,
          data.version,
          data.privacyMode,
          existingFirstSeen
        ];

        await this.sheetsAdapter.sheets.spreadsheets.values.update({
          spreadsheetId: this.sheetsAdapter.spreadsheetId,
          range: `${this.sheetName}!A${rowIndex + 2}:E${rowIndex + 2}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [updatedRow]
          }
        });

        console.log(`[AttributionTracker] Updated domain: ${domain}`);
      }
    } catch (error) {
      console.error('[AttributionTracker] Update failed:', error.message);
    }
  }

  /**
   * Get attribution stats
   */
  async getStats() {
    try {
      const response = await this.sheetsAdapter.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetsAdapter.spreadsheetId,
        range: `${this.sheetName}!A2:E`
      });

      const rows = response.data.values || [];

      const stats = {
        totalDomains: rows.length,
        byVersion: {},
        byPrivacyMode: {},
        recentDomains: [],
        oldestDomains: []
      };

      // Aggregate stats
      rows.forEach(row => {
        const [timestamp, domain, version, privacyMode, firstSeen] = row;

        // By version
        stats.byVersion[version] = (stats.byVersion[version] || 0) + 1;

        // By privacy mode
        stats.byPrivacyMode[privacyMode] = (stats.byPrivacyMode[privacyMode] || 0) + 1;

        // Recent domains (last 10)
        stats.recentDomains.push({
          domain,
          timestamp,
          version,
          privacyMode
        });

        // Oldest domains (first 10)
        stats.oldestDomains.push({
          domain,
          firstSeen,
          version,
          privacyMode
        });
      });

      // Sort and limit
      stats.recentDomains = stats.recentDomains
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);

      stats.oldestDomains = stats.oldestDomains
        .sort((a, b) => new Date(a.firstSeen) - new Date(b.firstSeen))
        .slice(0, 10);

      return stats;

    } catch (error) {
      console.error('[AttributionTracker] Get stats failed:', error.message);
      return {
        totalDomains: 0,
        byVersion: {},
        byPrivacyMode: {},
        recentDomains: [],
        oldestDomains: []
      };
    }
  }

  /**
   * Export all attribution data
   */
  async exportAll() {
    try {
      const response = await this.sheetsAdapter.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetsAdapter.spreadsheetId,
        range: `${this.sheetName}!A1:E`
      });

      return {
        success: true,
        data: response.data.values || []
      };
    } catch (error) {
      console.error('[AttributionTracker] Export failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = AttributionTracker;
