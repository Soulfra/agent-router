/**
 * Google Sheets Database Adapter
 *
 * Makes Google Sheets act like a database
 * Free alternative to PostgreSQL
 *
 * Why?
 * - Free (10M cells, 100 requests/min)
 * - No hosting costs
 * - Built-in auth (Google OAuth)
 * - Easy to inspect/debug
 *
 * Limitations:
 * - Slower than real database
 * - 100 requests/min rate limit
 * - No transactions
 * - Manual schema management
 *
 * Perfect for:
 * - Hobby projects
 * - MVPs
 * - Learning
 * - Low-volume apps (<1000 users)
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleSheetsDBAdapter {
  constructor(config = {}) {
    // Spreadsheet ID (from URL)
    this.spreadsheetId = config.spreadsheetId || process.env.GOOGLE_SHEETS_DB_ID;

    // Service account credentials
    const credentialsPath = config.credentialsPath ||
      process.env.GOOGLE_SHEETS_CREDENTIALS_PATH ||
      path.join(__dirname, '../config/google-sheets-credentials.json');

    // Load credentials
    if (fs.existsSync(credentialsPath)) {
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

      this.auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    } else if (process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT) {
      // Support env var with JSON string
      const credentials = JSON.parse(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT);

      this.auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    } else {
      console.warn('[GoogleSheetsDB] No credentials found, adapter will not work');
    }

    this.sheets = null;
    this.initialized = false;

    // Sheet names (like table names)
    this.sheetNames = {
      configs: 'gmail_webhook_configs',
      relayLogs: 'email_relay_logs',
      sendAsAliases: 'gmail_send_as_aliases',
      sentEmails: 'gmail_sent_emails'
    };

    console.log('[GoogleSheetsDB] Initialized');
  }

  /**
   * Initialize connection to Google Sheets
   */
  async init() {
    if (this.initialized) return;

    try {
      const authClient = await this.auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: authClient });
      this.initialized = true;

      console.log('[GoogleSheetsDB] Connected to Google Sheets');

      // Ensure sheets exist
      await this.ensureSheetsExist();

    } catch (error) {
      console.error('[GoogleSheetsDB] Failed to initialize:', error.message);
      throw error;
    }
  }

  /**
   * Ensure all required sheets exist
   * Creates them if they don't
   */
  async ensureSheetsExist() {
    try {
      // Get existing sheets
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });

      const existingSheets = response.data.sheets.map(s => s.properties.title);

      // Create missing sheets
      const requests = [];

      for (const [key, sheetName] of Object.entries(this.sheetNames)) {
        if (!existingSheets.includes(sheetName)) {
          console.log(`[GoogleSheetsDB] Creating sheet: ${sheetName}`);

          requests.push({
            addSheet: {
              properties: {
                title: sheetName,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 26
                }
              }
            }
          });
        }
      }

      if (requests.length > 0) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: { requests }
        });
      }

      // Initialize headers for each sheet
      await this.initializeHeaders();

    } catch (error) {
      console.error('[GoogleSheetsDB] Error ensuring sheets exist:', error.message);
      throw error;
    }
  }

  /**
   * Initialize column headers for each sheet
   */
  async initializeHeaders() {
    const headers = {
      [this.sheetNames.configs]: [
        'id', 'user_id', 'email_address', 'access_token', 'refresh_token',
        'relay_from_address', 'relay_rules', 'last_history_id',
        'last_webhook_at', 'enabled', 'created_at', 'updated_at'
      ],
      [this.sheetNames.relayLogs]: [
        'id', 'user_id', 'original_from', 'relayed_from', 'recipient_to',
        'subject', 'gmail_message_id', 'relay_message_id', 'status',
        'error_message', 'created_at'
      ],
      [this.sheetNames.sendAsAliases]: [
        'id', 'user_id', 'send_as_email', 'display_name', 'reply_to_address',
        'verification_status', 'verification_sent_at', 'is_default',
        'is_primary', 'signature', 'created_at', 'updated_at'
      ],
      [this.sheetNames.sentEmails]: [
        'id', 'user_id', 'send_as_email', 'recipient_to', 'subject',
        'gmail_message_id', 'thread_id', 'status', 'error_message', 'created_at'
      ]
    };

    try {
      for (const [sheetName, columns] of Object.entries(headers)) {
        // Check if headers already exist
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A1:Z1`
        });

        const existingHeaders = response.data.values?.[0] || [];

        if (existingHeaders.length === 0) {
          // Write headers
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            requestBody: {
              values: [columns]
            }
          });

          console.log(`[GoogleSheetsDB] Initialized headers for ${sheetName}`);
        }
      }
    } catch (error) {
      console.error('[GoogleSheetsDB] Error initializing headers:', error.message);
    }
  }

  /**
   * Query rows from a sheet (like SELECT * FROM table WHERE ...)
   *
   * @param {string} sheetName - Sheet name (table)
   * @param {Object} where - Filter conditions
   * @returns {Array} Matching rows
   */
  async query(sheetName, where = {}) {
    await this.init();

    try {
      // Get all rows
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`
      });

      const rows = response.data.values || [];

      if (rows.length === 0) return [];

      // First row is headers
      const headers = rows[0];
      const dataRows = rows.slice(1);

      // Convert to objects
      const objects = dataRows.map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          const value = row[index];

          // Parse JSON columns
          if (header === 'relay_rules' && value) {
            try {
              obj[header] = JSON.parse(value);
            } catch {
              obj[header] = value;
            }
          } else if (header === 'enabled' || header === 'is_default' || header === 'is_primary') {
            // Parse booleans
            obj[header] = value === 'true' || value === true;
          } else {
            obj[header] = value;
          }
        });
        return obj;
      });

      // Filter by where clause
      if (Object.keys(where).length === 0) {
        return objects;
      }

      return objects.filter(obj => {
        return Object.entries(where).every(([key, value]) => {
          return obj[key] === value;
        });
      });

    } catch (error) {
      console.error('[GoogleSheetsDB] Query error:', error.message);
      return [];
    }
  }

  /**
   * Insert a new row (like INSERT INTO table ...)
   *
   * @param {string} sheetName - Sheet name
   * @param {Object} data - Data to insert
   * @returns {Object} Inserted row with ID
   */
  async insert(sheetName, data) {
    await this.init();

    try {
      // Get headers
      const headersResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1:Z1`
      });

      const headers = headersResponse.data.values?.[0] || [];

      // Generate ID if not provided
      if (!data.id) {
        data.id = this.generateId();
      }

      // Add timestamps
      if (!data.created_at) {
        data.created_at = new Date().toISOString();
      }
      if (!data.updated_at) {
        data.updated_at = new Date().toISOString();
      }

      // Convert object to row array
      const row = headers.map(header => {
        const value = data[header];

        // Stringify JSON columns
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(value);
        }

        return value || '';
      });

      // Append row
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:A`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [row]
        }
      });

      console.log(`[GoogleSheetsDB] Inserted row into ${sheetName}:`, data.id);

      return data;

    } catch (error) {
      console.error('[GoogleSheetsDB] Insert error:', error.message);
      throw error;
    }
  }

  /**
   * Update rows (like UPDATE table SET ... WHERE ...)
   *
   * @param {string} sheetName - Sheet name
   * @param {Object} where - Filter conditions
   * @param {Object} updates - Fields to update
   */
  async update(sheetName, where, updates) {
    await this.init();

    try {
      // Get all rows
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`
      });

      const rows = response.data.values || [];
      if (rows.length === 0) return;

      const headers = rows[0];
      const dataRows = rows.slice(1);

      // Find matching rows
      const updateRequests = [];
      let updatedCount = 0;

      dataRows.forEach((row, rowIndex) => {
        const obj = {};
        headers.forEach((header, colIndex) => {
          obj[header] = row[colIndex];
        });

        // Check if row matches where clause
        const matches = Object.entries(where).every(([key, value]) => {
          return obj[key] === value;
        });

        if (matches) {
          // Update fields
          Object.entries(updates).forEach(([key, value]) => {
            const colIndex = headers.indexOf(key);
            if (colIndex >= 0) {
              const cellAddress = this.columnToLetter(colIndex) + (rowIndex + 2); // +2 because header is row 1, and we're 0-indexed

              let cellValue = value;
              if (typeof value === 'object' && value !== null) {
                cellValue = JSON.stringify(value);
              }

              updateRequests.push({
                range: `${sheetName}!${cellAddress}`,
                values: [[cellValue]]
              });
            }
          });

          // Update updated_at timestamp
          const updatedAtIndex = headers.indexOf('updated_at');
          if (updatedAtIndex >= 0) {
            const cellAddress = this.columnToLetter(updatedAtIndex) + (rowIndex + 2);
            updateRequests.push({
              range: `${sheetName}!${cellAddress}`,
              values: [[new Date().toISOString()]]
            });
          }

          updatedCount++;
        }
      });

      // Batch update
      if (updateRequests.length > 0) {
        await this.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data: updateRequests
          }
        });

        console.log(`[GoogleSheetsDB] Updated ${updatedCount} rows in ${sheetName}`);
      }

    } catch (error) {
      console.error('[GoogleSheetsDB] Update error:', error.message);
      throw error;
    }
  }

  /**
   * Delete rows (like DELETE FROM table WHERE ...)
   *
   * @param {string} sheetName - Sheet name
   * @param {Object} where - Filter conditions
   */
  async delete(sheetName, where) {
    await this.init();

    try {
      // Get all rows
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`
      });

      const rows = response.data.values || [];
      if (rows.length === 0) return;

      const headers = rows[0];
      const dataRows = rows.slice(1);

      // Find matching rows (in reverse order for deletion)
      const rowsToDelete = [];

      dataRows.forEach((row, rowIndex) => {
        const obj = {};
        headers.forEach((header, colIndex) => {
          obj[header] = row[colIndex];
        });

        // Check if row matches where clause
        const matches = Object.entries(where).every(([key, value]) => {
          return obj[key] === value;
        });

        if (matches) {
          rowsToDelete.push(rowIndex + 1); // +1 because header is row 0
        }
      });

      // Delete rows (in reverse order to maintain indices)
      const sheetId = await this.getSheetId(sheetName);
      const deleteRequests = rowsToDelete.reverse().map(rowIndex => ({
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex,
            endIndex: rowIndex + 1
          }
        }
      }));

      if (deleteRequests.length > 0) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: { requests: deleteRequests }
        });

        console.log(`[GoogleSheetsDB] Deleted ${deleteRequests.length} rows from ${sheetName}`);
      }

    } catch (error) {
      console.error('[GoogleSheetsDB] Delete error:', error.message);
      throw error;
    }
  }

  /**
   * Get sheet ID by name
   * @private
   */
  async getSheetId(sheetName) {
    const response = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId
    });

    const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
    return sheet?.properties?.sheetId || 0;
  }

  /**
   * Convert column index to letter (0 → A, 1 → B, etc.)
   * @private
   */
  columnToLetter(column) {
    let temp, letter = '';
    while (column >= 0) {
      temp = column % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      column = (column - temp) / 26 - 1;
    }
    return letter;
  }

  /**
   * Generate unique ID
   * @private
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Count rows in a sheet
   *
   * @param {string} sheetName - Sheet name
   * @param {Object} where - Filter conditions
   * @returns {number} Count
   */
  async count(sheetName, where = {}) {
    const rows = await this.query(sheetName, where);
    return rows.length;
  }

  /**
   * Get a single row (like SELECT * FROM table WHERE ... LIMIT 1)
   *
   * @param {string} sheetName - Sheet name
   * @param {Object} where - Filter conditions
   * @returns {Object|null} Row or null
   */
  async findOne(sheetName, where) {
    const rows = await this.query(sheetName, where);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Clear all data from a sheet (keeps headers)
   *
   * @param {string} sheetName - Sheet name
   */
  async truncate(sheetName) {
    await this.init();

    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A2:Z`
      });

      console.log(`[GoogleSheetsDB] Truncated ${sheetName}`);

    } catch (error) {
      console.error('[GoogleSheetsDB] Truncate error:', error.message);
      throw error;
    }
  }
}

module.exports = GoogleSheetsDBAdapter;
