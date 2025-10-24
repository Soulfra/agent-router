/**
 * Google Sheets Sync
 *
 * Automatically sync platform analytics to Google Sheets for easy viewing:
 * - Usage statistics by tenant
 * - Domain analytics across portfolio
 * - CRUD operation logs
 * - Affiliate performance
 * - Revenue tracking
 *
 * Uses Google Service Account for authentication
 */

const fs = require('fs').promises;
const https = require('https');

class GoogleSheetsSync {
  constructor(db, options = {}) {
    this.db = db;
    this.enabled = options.enabled !== false;
    this.serviceAccountPath = options.serviceAccountPath || process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT;
    this.spreadsheetId = options.spreadsheetId || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    // Cache for auth tokens
    this.accessToken = null;
    this.tokenExpiry = null;

    console.log('[GoogleSheets] Initialized', {
      enabled: this.enabled,
      hasServiceAccount: !!this.serviceAccountPath,
      hasSpreadsheetId: !!this.spreadsheetId
    });
  }

  /**
   * Authenticate with Google using service account
   */
  async authenticate() {
    if (!this.serviceAccountPath) {
      throw new Error('Google Sheets service account not configured');
    }

    // Check if token is still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Load service account credentials
    const credentials = JSON.parse(await fs.readFile(this.serviceAccountPath, 'utf8'));

    // Create JWT
    const jwt = this._createJWT(credentials);

    // Exchange JWT for access token
    const tokenResponse = await this._exchangeJWT(jwt);

    this.accessToken = tokenResponse.access_token;
    this.tokenExpiry = Date.now() + (tokenResponse.expires_in * 1000) - 60000; // 1 min buffer

    console.log('[GoogleSheets] Authenticated successfully');
    return this.accessToken;
  }

  /**
   * Create JSON Web Token for service account
   * @private
   */
  _createJWT(credentials) {
    const crypto = require('crypto');

    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedClaim = Buffer.from(JSON.stringify(claim)).toString('base64url');

    const signatureInput = `${encodedHeader}.${encodedClaim}`;
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(signatureInput)
      .sign(credentials.private_key, 'base64url');

    return `${signatureInput}.${signature}`;
  }

  /**
   * Exchange JWT for access token
   * @private
   */
  async _exchangeJWT(jwt) {
    return new Promise((resolve, reject) => {
      const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;

      const options = {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Token exchange failed: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Make API request to Google Sheets
   * @private
   */
  async _apiRequest(method, path, body = null) {
    const token = await this.authenticate();

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'sheets.googleapis.com',
        path: `/v4/spreadsheets${path}`,
        method: method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data ? JSON.parse(data) : null);
          } else {
            reject(new Error(`API request failed: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Create new spreadsheet
   */
  async createSpreadsheet(title = 'CALOS Analytics') {
    const token = await this.authenticate();

    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        properties: { title },
        sheets: [
          { properties: { title: 'Usage Stats' } },
          { properties: { title: 'Domain Analytics' } },
          { properties: { title: 'CRUD Operations' } },
          { properties: { title: 'Affiliate Performance' } },
          { properties: { title: 'Revenue Tracking' } }
        ]
      });

      const options = {
        hostname: 'sheets.googleapis.com',
        path: '/v4/spreadsheets',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            const spreadsheet = JSON.parse(data);
            this.spreadsheetId = spreadsheet.spreadsheetId;
            console.log('[GoogleSheets] Created spreadsheet:', spreadsheet.spreadsheetUrl);
            resolve(spreadsheet);
          } else {
            reject(new Error(`Failed to create spreadsheet: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Update sheet with data
   */
  async updateSheet(sheetName, data) {
    if (!this.spreadsheetId) {
      throw new Error('Spreadsheet ID not set. Create or set a spreadsheet first.');
    }

    const range = `${sheetName}!A1`;

    await this._apiRequest('PUT', `/${this.spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
      values: data
    });

    console.log('[GoogleSheets] Updated sheet:', sheetName);
  }

  /**
   * Sync usage statistics to Google Sheets
   */
  async syncUsageStats() {
    if (!this.enabled) return;

    console.log('[GoogleSheets] Syncing usage stats...');

    // Fetch usage data from database
    const result = await this.db.query(`
      SELECT
        t.tenant_id,
        t.name as tenant_name,
        t.pricing_model,
        SUM(l.prompt_tokens + l.completion_tokens) as total_tokens,
        COUNT(*) as total_requests,
        SUM(l.cost_cents) as total_cost_cents,
        MIN(l.created_at) as first_request,
        MAX(l.created_at) as last_request
      FROM tenants t
      LEFT JOIN llm_logs l ON t.tenant_id = l.tenant_id
      WHERE l.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY t.tenant_id, t.name, t.pricing_model
      ORDER BY total_tokens DESC
    `);

    // Format data for spreadsheet
    const data = [
      ['Tenant ID', 'Tenant Name', 'Pricing Model', 'Total Tokens', 'Total Requests', 'Total Cost ($)', 'First Request', 'Last Request']
    ];

    for (const row of result.rows) {
      data.push([
        row.tenant_id,
        row.tenant_name,
        row.pricing_model,
        parseInt(row.total_tokens || 0),
        parseInt(row.total_requests || 0),
        (parseFloat(row.total_cost_cents || 0) / 100).toFixed(2),
        row.first_request ? new Date(row.first_request).toLocaleDateString() : 'N/A',
        row.last_request ? new Date(row.last_request).toLocaleDateString() : 'N/A'
      ]);
    }

    await this.updateSheet('Usage Stats', data);
  }

  /**
   * Sync domain analytics to Google Sheets
   */
  async syncDomainAnalytics() {
    if (!this.enabled) return;

    console.log('[GoogleSheets] Syncing domain analytics...');

    // Fetch domain data
    const result = await this.db.query(`
      SELECT
        dp.domain_id,
        dp.domain_name,
        dp.status,
        dp.primary_focus,
        COUNT(DISTINCT da.session_id) as sessions,
        COUNT(da.event_id) as total_events,
        AVG(da.time_on_page) as avg_time_on_page,
        COUNT(DISTINCT da.user_fingerprint) as unique_visitors
      FROM domain_portfolio dp
      LEFT JOIN domain_analytics da ON dp.domain_id = da.domain_id
      WHERE da.timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY dp.domain_id, dp.domain_name, dp.status, dp.primary_focus
      ORDER BY sessions DESC
    `);

    const data = [
      ['Domain', 'Status', 'Primary Focus', 'Sessions', 'Total Events', 'Avg Time on Page (s)', 'Unique Visitors']
    ];

    for (const row of result.rows) {
      data.push([
        row.domain_name,
        row.status,
        row.primary_focus,
        parseInt(row.sessions || 0),
        parseInt(row.total_events || 0),
        parseFloat(row.avg_time_on_page || 0).toFixed(2),
        parseInt(row.unique_visitors || 0)
      ]);
    }

    await this.updateSheet('Domain Analytics', data);
  }

  /**
   * Sync CRUD operations to Google Sheets
   */
  async syncCRUDOperations() {
    if (!this.enabled) return;

    console.log('[GoogleSheets] Syncing CRUD operations...');

    // Fetch recent CRUD operations
    const result = await this.db.query(`
      SELECT
        operation_type,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT domain_id) as unique_domains,
        SUM(file_size) as total_bytes,
        MAX(timestamp) as last_operation
      FROM crud_operations_log
      WHERE timestamp >= NOW() - INTERVAL '7 days'
      GROUP BY operation_type
      ORDER BY count DESC
    `);

    const data = [
      ['Operation Type', 'Count', 'Unique Users', 'Unique Domains', 'Total Bytes', 'Last Operation']
    ];

    for (const row of result.rows) {
      data.push([
        row.operation_type.toUpperCase(),
        parseInt(row.count),
        parseInt(row.unique_users || 0),
        parseInt(row.unique_domains || 0),
        parseInt(row.total_bytes || 0),
        new Date(row.last_operation).toLocaleString()
      ]);
    }

    await this.updateSheet('CRUD Operations', data);
  }

  /**
   * Sync affiliate performance to Google Sheets
   */
  async syncAffiliatePerformance() {
    if (!this.enabled) return;

    console.log('[GoogleSheets] Syncing affiliate performance...');

    // Fetch affiliate data
    const result = await this.db.query(`
      SELECT
        program_name,
        COUNT(*) as conversions,
        SUM(commission_amount_cents) as total_commission_cents,
        COUNT(DISTINCT referrer_id) as unique_referrers,
        MAX(conversion_date) as last_conversion
      FROM affiliate_conversions
      WHERE conversion_date >= NOW() - INTERVAL '30 days'
      GROUP BY program_name
      ORDER BY total_commission_cents DESC
    `);

    const data = [
      ['Program', 'Conversions', 'Total Commission ($)', 'Unique Referrers', 'Last Conversion']
    ];

    for (const row of result.rows) {
      data.push([
        row.program_name,
        parseInt(row.conversions),
        (parseFloat(row.total_commission_cents || 0) / 100).toFixed(2),
        parseInt(row.unique_referrers || 0),
        new Date(row.last_conversion).toLocaleDateString()
      ]);
    }

    await this.updateSheet('Affiliate Performance', data);
  }

  /**
   * Sync revenue tracking to Google Sheets
   */
  async syncRevenueTracking() {
    if (!this.enabled) return;

    console.log('[GoogleSheets] Syncing revenue tracking...');

    // Fetch revenue data by source
    const result = await this.db.query(`
      SELECT
        revenue_source,
        SUM(amount_cents) as total_revenue_cents,
        COUNT(*) as transaction_count,
        AVG(amount_cents) as avg_transaction_cents,
        MAX(transaction_date) as last_transaction
      FROM revenue_tracking
      WHERE transaction_date >= NOW() - INTERVAL '30 days'
      GROUP BY revenue_source
      ORDER BY total_revenue_cents DESC
    `);

    const data = [
      ['Revenue Source', 'Total Revenue ($)', 'Transactions', 'Avg Transaction ($)', 'Last Transaction']
    ];

    let totalRevenue = 0;

    for (const row of result.rows) {
      const revenue = parseFloat(row.total_revenue_cents || 0) / 100;
      totalRevenue += revenue;

      data.push([
        row.revenue_source,
        revenue.toFixed(2),
        parseInt(row.transaction_count),
        (parseFloat(row.avg_transaction_cents || 0) / 100).toFixed(2),
        new Date(row.last_transaction).toLocaleDateString()
      ]);
    }

    // Add total row
    data.push(['', '', '', '', '']);
    data.push(['TOTAL', totalRevenue.toFixed(2), '', '', '']);

    await this.updateSheet('Revenue Tracking', data);
  }

  /**
   * Sync all data (run this on a schedule)
   */
  async syncAll() {
    if (!this.enabled) {
      console.log('[GoogleSheets] Sync disabled');
      return;
    }

    console.log('[GoogleSheets] Starting full sync...');

    try {
      // Create spreadsheet if needed
      if (!this.spreadsheetId) {
        await this.createSpreadsheet();
      }

      // Sync all sheets
      await this.syncUsageStats();
      await this.syncDomainAnalytics();
      await this.syncCRUDOperations();
      await this.syncAffiliatePerformance();
      await this.syncRevenueTracking();

      console.log('[GoogleSheets] Full sync complete!');
    } catch (error) {
      console.error('[GoogleSheets] Sync error:', error.message);
      throw error;
    }
  }

  /**
   * Get spreadsheet URL
   */
  getSpreadsheetUrl() {
    if (!this.spreadsheetId) return null;
    return `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`;
  }
}

module.exports = GoogleSheetsSync;
