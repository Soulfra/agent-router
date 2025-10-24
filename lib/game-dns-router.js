/**
 * GameDNSRouter
 *
 * Custom DNS management for game hosting:
 * - *.calos.games → Your apps
 * - Cloudflare DNS API (easy, managed)
 * - Self-hosted BIND9/PowerDNS (full control)
 *
 * Examples:
 *   cards.calos.games → GitHub Pages app
 *   poker.calos.games → Google Drive app
 *   chess.calos.games → Your own server
 *
 * Usage:
 *   const dns = new GameDNSRouter({ provider: 'cloudflare' });
 *   await dns.createRecord('cards.calos.games', 'CNAME', 'user.github.io');
 */

const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class GameDNSRouter {
  constructor(options = {}) {
    this.provider = options.provider || process.env.DNS_PROVIDER || 'cloudflare';
    this.db = options.db;

    // Cloudflare config
    this.cloudflare = {
      apiToken: options.cloudflareToken || process.env.CLOUDFLARE_API_TOKEN,
      zoneId: options.zoneId || process.env.CLOUDFLARE_ZONE_ID,
      apiUrl: 'https://api.cloudflare.com/client/v4'
    };

    // Self-hosted DNS config
    this.selfHosted = {
      zoneFile: options.zoneFile || '/etc/bind/zones/calos.games.zone',
      namedReload: options.namedReload || 'sudo systemctl reload bind9'
    };

    console.log(`[GameDNSRouter] Initialized (provider: ${this.provider})`);
  }

  /**
   * Create DNS record for a game
   * @param {string} subdomain - Subdomain (e.g., 'cards.calos.games')
   * @param {string} type - Record type (CNAME, A, AAAA)
   * @param {string} target - Target (IP or domain)
   * @param {object} options - Additional options
   * @returns {Promise<object>} - Created record
   */
  async createRecord(subdomain, type, target, options = {}) {
    const {
      ttl = 300,
      proxied = true // Cloudflare proxy (DDoS protection)
    } = options;

    console.log(`[GameDNSRouter] Creating ${type} record: ${subdomain} → ${target}`);

    try {
      let record;

      if (this.provider === 'cloudflare') {
        record = await this.cloudflareCreateRecord(subdomain, type, target, ttl, proxied);
      } else if (this.provider === 'self-hosted') {
        record = await this.selfHostedCreateRecord(subdomain, type, target, ttl);
      } else {
        throw new Error(`Unknown DNS provider: ${this.provider}`);
      }

      // Save to database
      if (this.db) {
        await this.saveRecord(subdomain, type, target, record);
      }

      return record;
    } catch (error) {
      console.error('[GameDNSRouter] Failed to create record:', error);
      throw error;
    }
  }

  /**
   * Create record via Cloudflare API
   * @param {string} subdomain - Subdomain
   * @param {string} type - Record type
   * @param {string} target - Target
   * @param {number} ttl - TTL
   * @param {boolean} proxied - Cloudflare proxy
   * @returns {Promise<object>} - Created record
   */
  async cloudflareCreateRecord(subdomain, type, target, ttl, proxied) {
    if (!this.cloudflare.apiToken || !this.cloudflare.zoneId) {
      throw new Error('Cloudflare API token and zone ID required');
    }

    try {
      const response = await axios.post(
        `${this.cloudflare.apiUrl}/zones/${this.cloudflare.zoneId}/dns_records`,
        {
          type,
          name: subdomain,
          content: target,
          ttl,
          proxied: type === 'CNAME' ? proxied : false // Only CNAME/A can be proxied
        },
        {
          headers: {
            'Authorization': `Bearer ${this.cloudflare.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`[GameDNSRouter] Cloudflare record created: ${response.data.result.id}`);

      return {
        id: response.data.result.id,
        name: response.data.result.name,
        type: response.data.result.type,
        content: response.data.result.content,
        proxied: response.data.result.proxied,
        ttl: response.data.result.ttl
      };
    } catch (error) {
      console.error('[GameDNSRouter] Cloudflare error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create record in self-hosted BIND9 zone file
   * @param {string} subdomain - Subdomain
   * @param {string} type - Record type
   * @param {string} target - Target
   * @param {number} ttl - TTL
   * @returns {Promise<object>} - Created record
   */
  async selfHostedCreateRecord(subdomain, type, target, ttl) {
    try {
      // Generate zone record line
      const recordLine = `${subdomain}. ${ttl} IN ${type} ${target}`;

      // Append to zone file
      await execAsync(`echo "${recordLine}" | sudo tee -a ${this.selfHosted.zoneFile}`);

      // Increment zone serial number
      await this.incrementZoneSerial();

      // Reload BIND9
      await execAsync(this.selfHosted.namedReload);

      console.log(`[GameDNSRouter] Self-hosted record created: ${subdomain}`);

      return {
        name: subdomain,
        type,
        content: target,
        ttl
      };
    } catch (error) {
      console.error('[GameDNSRouter] Self-hosted error:', error);
      throw error;
    }
  }

  /**
   * Increment zone serial number (BIND9 requirement)
   */
  async incrementZoneSerial() {
    try {
      // Read zone file
      const { stdout: zoneContent } = await execAsync(`sudo cat ${this.selfHosted.zoneFile}`);

      // Find SOA serial
      const serialMatch = zoneContent.match(/(\d{10})\s*;\s*serial/i);
      if (!serialMatch) {
        console.warn('[GameDNSRouter] Could not find zone serial');
        return;
      }

      const oldSerial = serialMatch[1];
      const newSerial = (parseInt(oldSerial) + 1).toString();

      // Replace serial
      await execAsync(
        `sudo sed -i 's/${oldSerial}/${newSerial}/' ${this.selfHosted.zoneFile}`
      );

      console.log(`[GameDNSRouter] Zone serial updated: ${oldSerial} → ${newSerial}`);
    } catch (error) {
      console.warn('[GameDNSRouter] Failed to increment serial:', error.message);
    }
  }

  /**
   * Delete DNS record
   * @param {string} subdomain - Subdomain
   * @returns {Promise<boolean>} - Success
   */
  async deleteRecord(subdomain) {
    console.log(`[GameDNSRouter] Deleting record: ${subdomain}`);

    try {
      if (this.provider === 'cloudflare') {
        await this.cloudflareDeleteRecord(subdomain);
      } else if (this.provider === 'self-hosted') {
        await this.selfHostedDeleteRecord(subdomain);
      }

      // Delete from database
      if (this.db) {
        await this.db.query(
          'DELETE FROM dns_records WHERE subdomain = $1',
          [subdomain]
        );
      }

      return true;
    } catch (error) {
      console.error('[GameDNSRouter] Failed to delete record:', error);
      throw error;
    }
  }

  /**
   * Delete record via Cloudflare API
   * @param {string} subdomain - Subdomain
   */
  async cloudflareDeleteRecord(subdomain) {
    // First, find the record ID
    const response = await axios.get(
      `${this.cloudflare.apiUrl}/zones/${this.cloudflare.zoneId}/dns_records?name=${subdomain}`,
      {
        headers: {
          'Authorization': `Bearer ${this.cloudflare.apiToken}`
        }
      }
    );

    const record = response.data.result[0];
    if (!record) {
      console.warn(`[GameDNSRouter] Record not found: ${subdomain}`);
      return;
    }

    // Delete the record
    await axios.delete(
      `${this.cloudflare.apiUrl}/zones/${this.cloudflare.zoneId}/dns_records/${record.id}`,
      {
        headers: {
          'Authorization': `Bearer ${this.cloudflare.apiToken}`
        }
      }
    );

    console.log(`[GameDNSRouter] Cloudflare record deleted: ${record.id}`);
  }

  /**
   * Delete record from self-hosted zone file
   * @param {string} subdomain - Subdomain
   */
  async selfHostedDeleteRecord(subdomain) {
    // Remove lines containing subdomain
    await execAsync(
      `sudo sed -i '/${subdomain}\\./d' ${this.selfHosted.zoneFile}`
    );

    // Increment serial and reload
    await this.incrementZoneSerial();
    await execAsync(this.selfHosted.namedReload);

    console.log(`[GameDNSRouter] Self-hosted record deleted: ${subdomain}`);
  }

  /**
   * List all DNS records
   * @returns {Promise<Array>} - DNS records
   */
  async listRecords() {
    try {
      if (this.provider === 'cloudflare') {
        return await this.cloudflareListRecords();
      } else if (this.provider === 'self-hosted') {
        return await this.selfHostedListRecords();
      }
    } catch (error) {
      console.error('[GameDNSRouter] Failed to list records:', error);
      throw error;
    }
  }

  /**
   * List records via Cloudflare API
   * @returns {Promise<Array>} - DNS records
   */
  async cloudflareListRecords() {
    const response = await axios.get(
      `${this.cloudflare.apiUrl}/zones/${this.cloudflare.zoneId}/dns_records`,
      {
        headers: {
          'Authorization': `Bearer ${this.cloudflare.apiToken}`
        }
      }
    );

    return response.data.result.map(record => ({
      id: record.id,
      name: record.name,
      type: record.type,
      content: record.content,
      proxied: record.proxied,
      ttl: record.ttl
    }));
  }

  /**
   * List records from self-hosted zone file
   * @returns {Promise<Array>} - DNS records
   */
  async selfHostedListRecords() {
    const { stdout: zoneContent } = await execAsync(`sudo cat ${this.selfHosted.zoneFile}`);

    const lines = zoneContent.split('\n');
    const records = [];

    for (const line of lines) {
      // Parse zone file lines (skip comments and empty lines)
      if (line.trim().startsWith(';') || !line.trim()) continue;

      const match = line.match(/^([\w.-]+)\.\s+(\d+)\s+IN\s+(\w+)\s+(.+)$/);
      if (match) {
        records.push({
          name: match[1],
          ttl: parseInt(match[2]),
          type: match[3],
          content: match[4]
        });
      }
    }

    return records;
  }

  /**
   * Save record to database
   * @param {string} subdomain - Subdomain
   * @param {string} type - Record type
   * @param {string} target - Target
   * @param {object} record - Record details
   */
  async saveRecord(subdomain, type, target, record) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO dns_records (
          subdomain, record_type, target, provider, record_id, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (subdomain) DO UPDATE SET
          record_type = $2, target = $3, record_id = $5, metadata = $6, updated_at = NOW()`,
        [
          subdomain,
          type,
          target,
          this.provider,
          record.id || null,
          JSON.stringify(record)
        ]
      );

      console.log(`[GameDNSRouter] Record saved to database: ${subdomain}`);
    } catch (error) {
      console.warn('[GameDNSRouter] Failed to save record:', error.message);
    }
  }

  /**
   * Point a game subdomain to a deployment
   * @param {string} gameName - Game name (e.g., 'cards')
   * @param {string} deploymentType - 'github' or 'google-drive'
   * @param {string} target - Target URL
   * @returns {Promise<object>} - DNS record
   */
  async pointGameToDeploy ment(gameName, deploymentType, target) {
    const subdomain = `${gameName}.calos.games`;

    let type, finalTarget;

    if (deploymentType === 'github') {
      // GitHub Pages: CNAME to username.github.io
      type = 'CNAME';
      finalTarget = target.replace('https://', '').replace(/\/$/, '');
    } else if (deploymentType === 'google-drive') {
      // Google Drive: Redirect via Cloudflare Worker or CNAME to proxy
      type = 'CNAME';
      finalTarget = 'drive-proxy.calos.dev'; // Your proxy server
    } else {
      // Custom target
      type = 'CNAME';
      finalTarget = target;
    }

    return await this.createRecord(subdomain, type, finalTarget);
  }
}

module.exports = GameDNSRouter;
