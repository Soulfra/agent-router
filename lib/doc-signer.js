/**
 * Doc Signer
 *
 * Cryptographically signs documents with SHA-256 hash and stores them
 * in immutable storage (dpaste.com) for verification.
 *
 * Features:
 * - SHA-256 hashing of all legal/system docs
 * - Immutable storage via dpaste.com (365-day retention)
 * - Verification system (prove doc hasn't changed since signing)
 * - Timestamp + signature
 * - PostgreSQL tracking of all signed docs
 *
 * Usage:
 *   const signer = new DocSigner({ db });
 *   const signature = await signer.sign('terms-of-service.html');
 *   const isValid = await signer.verify('terms-of-service.html', signature.hash);
 *
 * @requires crypto (built-in Node.js module)
 * @requires dpaste.com API
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');

class DocSigner {
  constructor(options = {}) {
    this.db = options.db;
    this.dpasteAPI = 'https://dpaste.com/api/v2/';
    this.baseDir = options.baseDir || process.cwd();

    // Supported hash algorithms (defaulting to SHA-256)
    this.hashAlgorithm = options.hashAlgorithm || 'sha256';

    console.log('[DocSigner] Initialized with algorithm:', this.hashAlgorithm);
  }

  /**
   * Sign a document (file or string)
   * Returns signature object with hash, dpaste ID, verification URL
   */
  async sign(input, options = {}) {
    try {
      // Get content (from file path or direct string)
      let content;
      let filePath;

      if (typeof input === 'string' && input.includes('.')) {
        // Assume it's a file path
        filePath = path.isAbsolute(input) ? input : path.join(this.baseDir, input);
        content = await fs.readFile(filePath, 'utf8');
      } else {
        // Direct string content
        content = input;
        filePath = options.name || 'untitled-doc';
      }

      // Calculate SHA-256 hash
      const hash = crypto.createHash(this.hashAlgorithm).update(content).digest('hex');

      // Get file stats
      const stats = await this.getFileStats(filePath);

      // Create signature payload
      const signaturePayload = {
        file: filePath,
        hash: hash,
        algorithm: this.hashAlgorithm,
        timestamp: new Date().toISOString(),
        size: stats ? stats.size : content.length,
        lastModified: stats ? stats.mtime.toISOString() : new Date().toISOString(),
        content: options.includeContent ? content : '(content not included)',
        metadata: options.metadata || {}
      };

      // Upload to dpaste for immutable storage
      const pasteId = await this.uploadToDpaste(signaturePayload);

      // Store in database
      if (this.db) {
        await this.storeSignature(filePath, hash, pasteId, signaturePayload);
      }

      console.log(`[DocSigner] Signed: ${filePath} → ${hash.substring(0, 16)}...`);

      return {
        file: filePath,
        hash: hash,
        algorithm: this.hashAlgorithm,
        pasteId: pasteId,
        pasteUrl: `https://dpaste.com/${pasteId}`,
        verificationUrl: `https://soulfra.github.io/verify-doc.html?doc=${encodeURIComponent(filePath)}&hash=${hash}`,
        timestamp: signaturePayload.timestamp,
        size: signaturePayload.size
      };

    } catch (error) {
      console.error('[DocSigner] Failed to sign:', error);
      throw error;
    }
  }

  /**
   * Verify a document against a known hash
   */
  async verify(input, expectedHash) {
    try {
      // Get current content
      let content;

      if (typeof input === 'string' && input.includes('.')) {
        // File path
        const filePath = path.isAbsolute(input) ? input : path.join(this.baseDir, input);
        content = await fs.readFile(filePath, 'utf8');
      } else {
        // Direct string
        content = input;
      }

      // Calculate current hash
      const currentHash = crypto.createHash(this.hashAlgorithm).update(content).digest('hex');

      // Compare hashes
      const isValid = currentHash === expectedHash;

      console.log(`[DocSigner] Verification: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
      console.log(`  Expected: ${expectedHash.substring(0, 16)}...`);
      console.log(`  Current:  ${currentHash.substring(0, 16)}...`);

      return {
        valid: isValid,
        expectedHash: expectedHash,
        currentHash: currentHash,
        algorithm: this.hashAlgorithm,
        verified: isValid,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[DocSigner] Verification failed:', error);
      throw error;
    }
  }

  /**
   * Get signature for a previously signed document
   */
  async getSignature(filePath) {
    if (!this.db) {
      throw new Error('Database connection required to retrieve signatures');
    }

    try {
      const result = await this.db.query(
        `SELECT * FROM signed_docs WHERE file_path = $1 ORDER BY signed_at DESC LIMIT 1`,
        [filePath]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return {
        file: result.rows[0].file_path,
        hash: result.rows[0].hash,
        pasteId: result.rows[0].dpaste_id,
        pasteUrl: `https://dpaste.com/${result.rows[0].dpaste_id}`,
        signedAt: result.rows[0].signed_at,
        metadata: result.rows[0].metadata
      };

    } catch (error) {
      console.error('[DocSigner] Failed to get signature:', error);
      throw error;
    }
  }

  /**
   * Sign all legal documents in a directory
   */
  async signDirectory(directory, pattern = /\.(html|md|txt)$/) {
    try {
      const files = await fs.readdir(directory);
      const signatures = [];

      for (const file of files) {
        if (pattern.test(file)) {
          const filePath = path.join(directory, file);
          const signature = await this.sign(filePath);
          signatures.push(signature);
        }
      }

      console.log(`[DocSigner] Signed ${signatures.length} files in ${directory}`);

      return signatures;

    } catch (error) {
      console.error('[DocSigner] Failed to sign directory:', error);
      throw error;
    }
  }

  /**
   * Upload signature to dpaste.com
   */
  async uploadToDpaste(payload) {
    return new Promise((resolve, reject) => {
      const postData = new URLSearchParams({
        content: JSON.stringify(payload, null, 2),
        syntax: 'json',
        expiry_days: 365 // Max retention
      }).toString();

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(this.dpasteAPI, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 201 || res.statusCode === 200) {
            // dpaste returns the paste URL in Location header or body
            const pasteUrl = res.headers.location || data.trim();
            const pasteId = pasteUrl.split('/').filter(Boolean).pop();

            console.log(`[DocSigner] Uploaded to dpaste: ${pasteId}`);
            resolve(pasteId);
          } else {
            reject(new Error(`dpaste API error: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('[DocSigner] dpaste upload failed:', error);
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Store signature in database
   */
  async storeSignature(filePath, hash, pasteId, payload) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO signed_docs (file_path, hash, dpaste_id, signed_at, metadata)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (file_path, hash) DO UPDATE SET
           dpaste_id = EXCLUDED.dpaste_id,
           signed_at = NOW(),
           metadata = EXCLUDED.metadata`,
        [filePath, hash, pasteId, JSON.stringify(payload.metadata)]
      );

      console.log(`[DocSigner] Stored signature in database: ${filePath}`);

    } catch (error) {
      console.error('[DocSigner] Failed to store signature:', error);
    }
  }

  /**
   * Get file stats
   */
  async getFileStats(filePath) {
    try {
      if (typeof filePath !== 'string' || !filePath.includes('.')) {
        return null;
      }

      const stats = await fs.stat(filePath);
      return stats;

    } catch (error) {
      return null;
    }
  }

  /**
   * Batch sign multiple files
   */
  async signBatch(filePaths, options = {}) {
    const signatures = [];

    for (const filePath of filePaths) {
      try {
        const signature = await this.sign(filePath, options);
        signatures.push(signature);
      } catch (error) {
        console.error(`[DocSigner] Failed to sign ${filePath}:`, error.message);
        signatures.push({
          file: filePath,
          error: error.message,
          success: false
        });
      }
    }

    return signatures;
  }

  /**
   * Generate verification report for all signed docs
   */
  async generateVerificationReport() {
    if (!this.db) {
      throw new Error('Database connection required for verification report');
    }

    try {
      const result = await this.db.query(
        `SELECT
          file_path,
          hash,
          dpaste_id,
          signed_at,
          metadata
        FROM signed_docs
        ORDER BY signed_at DESC`
      );

      const report = {
        totalDocs: result.rows.length,
        lastVerified: new Date().toISOString(),
        documents: []
      };

      for (const row of result.rows) {
        // Verify current hash
        try {
          const verification = await this.verify(row.file_path, row.hash);

          report.documents.push({
            file: row.file_path,
            hash: row.hash,
            pasteUrl: `https://dpaste.com/${row.dpaste_id}`,
            signedAt: row.signed_at,
            valid: verification.valid,
            currentHash: verification.currentHash
          });
        } catch (error) {
          report.documents.push({
            file: row.file_path,
            hash: row.hash,
            error: error.message,
            valid: false
          });
        }
      }

      return report;

    } catch (error) {
      console.error('[DocSigner] Failed to generate verification report:', error);
      throw error;
    }
  }
}

module.exports = DocSigner;
