#!/usr/bin/env node

/**
 * Dependency Mirror System
 *
 * Prevents left-pad style incidents by mirroring critical packages to MinIO.
 *
 * Features:
 * - Mirror npm packages locally
 * - Verify checksums and integrity
 * - Automatic mirroring on first use
 * - Support for npm, GitHub releases, CDNs
 * - Track dependencies and build graph
 *
 * Usage:
 *   const mirror = new DependencyMirror({ db, minioClient });
 *   await mirror.vendor('left-pad', '1.3.0');
 *   const pkg = await mirror.get('left-pad', '1.3.0');
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

class DependencyMirror {
  constructor(options = {}) {
    this.db = options.db;
    this.minioClient = options.minioClient;
    this.bucketName = options.bucketName || 'calos-packages';

    if (!this.db) {
      throw new Error('Database connection required for DependencyMirror');
    }

    if (!this.minioClient) {
      throw new Error('MinIO client required for DependencyMirror');
    }

    // Configuration
    this.npmRegistry = options.npmRegistry || 'https://registry.npmjs.org';
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.tempDir = options.tempDir || '/tmp/calos-mirror';

    // Auto-vendor settings
    this.autoVendorOnUse = options.autoVendorOnUse !== false; // Default true
    this.vendorDependencies = options.vendorDependencies || 'critical'; // 'all', 'critical', 'none'

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Initialize the mirror system
   */
  async init() {
    try {
      // Ensure MinIO bucket exists
      const exists = await this.minioClient.bucketExists(this.bucketName);

      if (!exists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        console.log(`[Mirror] Created bucket: ${this.bucketName}`);
      }

      console.log('[Mirror] Dependency mirror system initialized');
      return true;

    } catch (error) {
      console.error('[Mirror] Initialization error:', error.message);
      return false;
    }
  }

  /**
   * Vendor a package (mirror it to MinIO)
   *
   * @param {string} packageName - Package name
   * @param {string} version - Version (or 'latest')
   * @param {object} options - Additional options
   * @returns {Promise<object>} - Vendored package info
   */
  async vendor(packageName, version = 'latest', options = {}) {
    const {
      packageType = 'npm',
      reason = 'manual',
      analyzeDependencies = true,
      force = false
    } = options;

    console.log(`[Mirror] Vendoring ${packageName}@${version}...`);

    try {
      // Resolve version if 'latest'
      if (version === 'latest') {
        version = await this.resolveLatestVersion(packageName, packageType);
      }

      // Check if already vendored
      if (!force) {
        const existing = await this.getVendoredPackage(packageName, version, packageType);
        if (existing && existing.vendor_status === 'mirrored') {
          console.log(`[Mirror] Already vendored: ${packageName}@${version}`);
          return existing;
        }
      }

      // Queue or create vendor entry
      const packageId = await this.queueVendor(packageName, version, packageType, reason);

      // Download package
      const downloadPath = await this.downloadPackage(packageName, version, packageType);

      // Calculate checksums
      const checksums = await this.calculateChecksums(downloadPath);

      // Upload to MinIO
      const objectPath = `packages/${packageType}/${packageName}/${packageName}-${version}.tar.gz`;
      await this.uploadToMinIO(downloadPath, objectPath);

      // Get package metadata
      const metadata = await this.fetchPackageMetadata(packageName, version, packageType);

      // Update database
      await this.updateVendoredPackage(packageId, {
        minioObjectPath: objectPath,
        objectSize: fs.statSync(downloadPath).size,
        checksumSha256: checksums.sha256,
        checksumMd5: checksums.md5,
        vendorStatus: 'mirrored',
        ...metadata
      });

      // Analyze dependencies if requested
      if (analyzeDependencies && metadata.dependencies) {
        await this.analyzeDependencies(packageId, metadata.dependencies);
      }

      // Clean up temp file
      fs.unlinkSync(downloadPath);

      console.log(`[Mirror] Successfully vendored ${packageName}@${version}`);

      return await this.getVendoredPackage(packageName, version, packageType);

    } catch (error) {
      console.error(`[Mirror] Vendor error for ${packageName}@${version}:`, error.message);

      // Mark as failed
      await this.db.query(
        `UPDATE vendored_packages
         SET vendor_status = 'failed',
             vendor_reason = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE package_name = $2 AND package_version = $3 AND package_type = $4`,
        [error.message, packageName, version, packageType]
      );

      throw error;
    }
  }

  /**
   * Get a vendored package (auto-vendor if not present)
   *
   * @param {string} packageName - Package name
   * @param {string} version - Version
   * @param {string} packageType - Package type
   * @returns {Promise<object|null>} - Package info or null
   */
  async get(packageName, version = 'latest', packageType = 'npm') {
    // Try to get from database
    let pkg = await this.getVendoredPackage(packageName, version, packageType);

    if (pkg && pkg.vendor_status === 'mirrored') {
      // Update access time
      await this.logPackageUsage(pkg.id, 'get');
      return pkg;
    }

    // Auto-vendor if enabled
    if (this.autoVendorOnUse) {
      console.log(`[Mirror] Auto-vendoring ${packageName}@${version}...`);
      pkg = await this.vendor(packageName, version, { packageType, reason: 'auto-vendor' });
      return pkg;
    }

    return null;
  }

  /**
   * Download a package to temp directory
   *
   * @param {string} packageName - Package name
   * @param {string} version - Version
   * @param {string} packageType - Package type
   * @returns {Promise<string>} - Local file path
   */
  async downloadPackage(packageName, version, packageType) {
    const tempFile = path.join(this.tempDir, `${packageName}-${version}.tar.gz`);

    if (packageType === 'npm') {
      // Get tarball URL from npm registry
      const registryUrl = `${this.npmRegistry}/${packageName}/${version}`;
      const response = await axios.get(registryUrl);
      const tarballUrl = response.data.dist.tarball;

      // Download tarball
      const tarballResponse = await axios.get(tarballUrl, { responseType: 'stream' });
      const writer = fs.createWriteStream(tempFile);

      tarballResponse.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(tempFile));
        writer.on('error', reject);
      });

    } else if (packageType === 'github') {
      // Download GitHub release tarball
      const [owner, repo] = packageName.split('/');
      const releaseUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${version}`;

      const headers = {};
      if (this.githubToken) {
        headers['Authorization'] = `token ${this.githubToken}`;
      }

      const response = await axios.get(releaseUrl, {
        responseType: 'stream',
        headers
      });

      const writer = fs.createWriteStream(tempFile);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(tempFile));
        writer.on('error', reject);
      });

    } else {
      throw new Error(`Unsupported package type: ${packageType}`);
    }
  }

  /**
   * Calculate file checksums
   */
  async calculateChecksums(filePath) {
    const fileBuffer = fs.readFileSync(filePath);

    return {
      sha256: crypto.createHash('sha256').update(fileBuffer).digest('hex'),
      md5: crypto.createHash('md5').update(fileBuffer).digest('hex')
    };
  }

  /**
   * Upload file to MinIO
   */
  async uploadToMinIO(localPath, objectPath) {
    const metadata = {
      'Content-Type': 'application/gzip',
      'X-Uploaded-At': new Date().toISOString()
    };

    await this.minioClient.fPutObject(
      this.bucketName,
      objectPath,
      localPath,
      metadata
    );

    console.log(`[Mirror] Uploaded to MinIO: ${objectPath}`);
  }

  /**
   * Fetch package metadata from registry
   */
  async fetchPackageMetadata(packageName, version, packageType) {
    if (packageType === 'npm') {
      const url = `${this.npmRegistry}/${packageName}/${version}`;
      const response = await axios.get(url);
      const data = response.data;

      return {
        description: data.description,
        author: data.author?.name || data.author,
        license: data.license,
        homepage: data.homepage,
        repositoryUrl: data.repository?.url,
        dependencies: data.dependencies || {},
        devDependencies: data.devDependencies || {},
        peerDependencies: data.peerDependencies || {}
      };

    } else if (packageType === 'github') {
      const [owner, repo] = packageName.split('/');
      const url = `https://api.github.com/repos/${owner}/${repo}`;

      const headers = {};
      if (this.githubToken) {
        headers['Authorization'] = `token ${this.githubToken}`;
      }

      const response = await axios.get(url, { headers });
      const data = response.data;

      return {
        description: data.description,
        author: data.owner.login,
        license: data.license?.spdx_id,
        homepage: data.html_url,
        repositoryUrl: data.clone_url,
        dependencies: {},
        devDependencies: {},
        peerDependencies: {}
      };
    }

    return {};
  }

  /**
   * Resolve 'latest' version to actual version number
   */
  async resolveLatestVersion(packageName, packageType) {
    if (packageType === 'npm') {
      const url = `${this.npmRegistry}/${packageName}/latest`;
      const response = await axios.get(url);
      return response.data.version;

    } else if (packageType === 'github') {
      const [owner, repo] = packageName.split('/');
      const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

      const headers = {};
      if (this.githubToken) {
        headers['Authorization'] = `token ${this.githubToken}`;
      }

      const response = await axios.get(url, { headers });
      return response.data.tag_name.replace(/^v/, '');
    }

    throw new Error(`Cannot resolve latest version for ${packageType}`);
  }

  /**
   * Get vendored package from database
   */
  async getVendoredPackage(packageName, version, packageType) {
    const result = await this.db.query(
      `SELECT * FROM vendored_packages
       WHERE package_name = $1
         AND package_version = $2
         AND package_type = $3`,
      [packageName, version, packageType]
    );

    return result.rows[0] || null;
  }

  /**
   * Queue package for vendoring
   */
  async queueVendor(packageName, version, packageType, reason) {
    const result = await this.db.query(
      'SELECT queue_package_vendor($1, $2, $3, 0, $4) as package_id',
      [packageName, version, packageType, reason]
    );

    return result.rows[0].package_id;
  }

  /**
   * Update vendored package in database
   */
  async updateVendoredPackage(packageId, updates) {
    await this.db.query(
      `UPDATE vendored_packages SET
        minio_bucket = $1,
        minio_object_path = $2,
        object_size = $3,
        checksum_sha256 = $4,
        checksum_md5 = $5,
        description = $6,
        author = $7,
        license = $8,
        homepage = $9,
        repository_url = $10,
        dependencies = $11,
        dev_dependencies = $12,
        peer_dependencies = $13,
        vendor_status = $14,
        mirrored_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $15`,
      [
        this.bucketName,
        updates.minioObjectPath,
        updates.objectSize,
        updates.checksumSha256,
        updates.checksumMd5,
        updates.description,
        updates.author,
        updates.license,
        updates.homepage,
        updates.repositoryUrl,
        JSON.stringify(updates.dependencies || {}),
        JSON.stringify(updates.devDependencies || {}),
        JSON.stringify(updates.peerDependencies || {}),
        updates.vendorStatus,
        packageId
      ]
    );
  }

  /**
   * Analyze package dependencies and store graph
   */
  async analyzeDependencies(packageId, dependencies, depthLevel = 0) {
    for (const [depName, depVersion] of Object.entries(dependencies)) {
      // Insert dependency relationship
      await this.db.query(
        `INSERT INTO package_dependencies (
          parent_package_id,
          child_package_name,
          child_package_version,
          dependency_type,
          depth_level
        ) VALUES ($1, $2, $3, 'runtime', $4)
        ON CONFLICT DO NOTHING`,
        [packageId, depName, depVersion, depthLevel]
      );

      // If vendorDependencies is 'all' or 'critical', vendor dependencies too
      if (this.vendorDependencies === 'all' || (this.vendorDependencies === 'critical' && depthLevel === 0)) {
        try {
          await this.vendor(depName, depVersion, {
            reason: 'dependency',
            analyzeDependencies: depthLevel < 2 // Limit depth to prevent recursion
          });
        } catch (error) {
          console.warn(`[Mirror] Failed to vendor dependency ${depName}@${depVersion}:`, error.message);
        }
      }
    }
  }

  /**
   * Log package usage
   */
  async logPackageUsage(packageId, usageType = 'get', context = {}) {
    await this.db.query(
      `INSERT INTO package_usage_log (
        package_id,
        used_by,
        usage_type,
        from_vendor,
        used_at
      ) VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)`,
      [packageId, context.usedBy || 'unknown', usageType]
    );

    // Update access time
    await this.db.query(
      'UPDATE vendored_packages SET accessed_at = CURRENT_TIMESTAMP WHERE id = $1',
      [packageId]
    );
  }

  /**
   * List all vendored packages
   */
  async list(options = {}) {
    const {
      status = null,
      critical = null,
      limit = 100,
      offset = 0
    } = options;

    let query = 'SELECT * FROM vendored_packages WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND vendor_status = $${paramIndex++}`;
      params.push(status);
    }

    if (critical !== null) {
      query += ` AND is_critical = $${paramIndex++}`;
      params.push(critical);
    }

    query += ` ORDER BY mirrored_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Mark package as critical (must be vendored)
   */
  async markCritical(packageName, version, packageType = 'npm') {
    await this.db.query(
      `UPDATE vendored_packages
       SET is_critical = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE package_name = $1
         AND package_version = $2
         AND package_type = $3`,
      [packageName, version, packageType]
    );

    // Ensure it's vendored
    const pkg = await this.get(packageName, version, packageType);

    if (!pkg || pkg.vendor_status !== 'mirrored') {
      await this.vendor(packageName, version, { packageType, reason: 'marked-critical' });
    }
  }

  /**
   * Verify package integrity
   */
  async verify(packageName, version, packageType = 'npm') {
    const pkg = await this.getVendoredPackage(packageName, version, packageType);

    if (!pkg) {
      throw new Error(`Package not vendored: ${packageName}@${version}`);
    }

    // Download from MinIO to temp
    const tempFile = path.join(this.tempDir, `verify-${packageName}-${version}.tar.gz`);
    await this.minioClient.fGetObject(this.bucketName, pkg.minio_object_path, tempFile);

    // Calculate checksum
    const checksums = await this.calculateChecksums(tempFile);

    // Compare
    const valid = checksums.sha256 === pkg.checksum_sha256;

    // Clean up
    fs.unlinkSync(tempFile);

    // Update verification time
    if (valid) {
      await this.db.query(
        'UPDATE vendored_packages SET last_verified_at = CURRENT_TIMESTAMP WHERE id = $1',
        [pkg.id]
      );
    }

    return {
      valid,
      expected: pkg.checksum_sha256,
      actual: checksums.sha256
    };
  }
}

module.exports = DependencyMirror;
