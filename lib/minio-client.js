/**
 * MinIO Client for Model Storage
 *
 * Stores model files, versions, rankings in S3-compatible bucket:
 * - GGUF model files
 * - Model metadata (family, parameters, quantization)
 * - Rankings per use case
 * - Version tracking
 *
 * Bucket structure:
 * /models/ollama/mistral-7b-v0.3/model.gguf
 * /models/metadata/mistral-7b.json
 * /rankings/casual_chat.json
 * /rankings/technical_code.json
 */

const { Client } = require('minio');
const fs = require('fs');
const path = require('path');

class MinIOModelClient {
  constructor(options = {}) {
    this.db = options.db;

    // MinIO connection config
    this.config = {
      endPoint: options.endPoint || process.env.MINIO_ENDPOINT || 'localhost',
      port: options.port || parseInt(process.env.MINIO_PORT) || 9000,
      useSSL: options.useSSL || process.env.MINIO_USE_SSL === 'true',
      accessKey: options.accessKey || process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: options.secretKey || process.env.MINIO_SECRET_KEY || 'minioadmin'
    };

    this.bucketName = options.bucketName || 'calos-models';

    // Initialize MinIO client
    try {
      this.client = new Client(this.config);
      console.log('[MinIO] Client initialized:', this.config.endPoint);
    } catch (error) {
      console.warn('[MinIO] Failed to initialize:', error.message);
      this.client = null;
    }
  }

  /**
   * Initialize bucket (create if doesn't exist)
   */
  async init() {
    if (!this.client) return false;

    try {
      const exists = await this.client.bucketExists(this.bucketName);

      if (!exists) {
        await this.client.makeBucket(this.bucketName, 'us-east-1');
        console.log(`[MinIO] Created bucket: ${this.bucketName}`);
      } else {
        console.log(`[MinIO] Bucket exists: ${this.bucketName}`);
      }

      return true;

    } catch (error) {
      console.error('[MinIO] Init error:', error.message);
      return false;
    }
  }

  /**
   * Upload model file to bucket
   *
   * @param {string} localPath - Local file path
   * @param {object} metadata - Model metadata
   * @returns {Promise<string>} - Object path in bucket
   */
  async uploadModel(localPath, metadata) {
    if (!this.client) {
      throw new Error('MinIO client not initialized');
    }

    const {
      modelId,
      modelName,
      modelVersion = 'latest',
      family = 'unknown',
      quantization = null,
      parameterCount = null
    } = metadata;

    // Build object path: /models/{family}/{modelName}-{version}/model.gguf
    const fileName = path.basename(localPath);
    const objectPath = `models/${family}/${modelName}-${modelVersion}/${fileName}`;

    try {
      // Upload file
      const fileStats = fs.statSync(localPath);

      await this.client.fPutObject(
        this.bucketName,
        objectPath,
        localPath,
        {
          'Content-Type': 'application/octet-stream',
          'X-Model-ID': modelId,
          'X-Model-Family': family,
          'X-Model-Version': modelVersion
        }
      );

      console.log(`[MinIO] Uploaded: ${objectPath} (${fileStats.size} bytes)`);

      // Save metadata to database
      if (this.db) {
        await this._saveModelMetadata({
          modelId,
          modelName,
          modelVersion,
          bucketName: this.bucketName,
          objectPath,
          objectSize: fileStats.size,
          fileFormat: path.extname(localPath).substring(1),
          quantization,
          parameterCount,
          family,
          isDownloaded: true,
          localPath,
          uploadedAt: new Date()
        });
      }

      return objectPath;

    } catch (error) {
      console.error('[MinIO] Upload error:', error.message);
      throw error;
    }
  }

  /**
   * Download model from bucket
   *
   * @param {string} modelId - Model identifier
   * @param {string} localPath - Where to save locally
   * @returns {Promise<string>} - Local path
   */
  async downloadModel(modelId, localPath) {
    if (!this.client) {
      throw new Error('MinIO client not initialized');
    }

    try {
      // Get object path from database
      const metadata = await this._getModelMetadata(modelId);

      if (!metadata) {
        throw new Error(`Model not found: ${modelId}`);
      }

      // Download
      await this.client.fGetObject(
        this.bucketName,
        metadata.objectPath,
        localPath
      );

      console.log(`[MinIO] Downloaded: ${modelId} → ${localPath}`);

      // Update database
      if (this.db) {
        await this.db.query(
          `UPDATE model_storage
           SET is_downloaded = true,
               local_path = $1,
               last_accessed = CURRENT_TIMESTAMP
           WHERE model_id = $2`,
          [localPath, modelId]
        );
      }

      return localPath;

    } catch (error) {
      console.error('[MinIO] Download error:', error.message);
      throw error;
    }
  }

  /**
   * Upload rankings JSON
   *
   * @param {string} useCase - Use case category
   * @param {object} rankings - Rankings data
   */
  async uploadRankings(useCase, rankings) {
    if (!this.client) {
      throw new Error('MinIO client not initialized');
    }

    const objectPath = `rankings/${useCase}.json`;

    try {
      const json = JSON.stringify(rankings, null, 2);
      const buffer = Buffer.from(json);

      await this.client.putObject(
        this.bucketName,
        objectPath,
        buffer,
        {
          'Content-Type': 'application/json',
          'X-Use-Case': useCase,
          'X-Updated': new Date().toISOString()
        }
      );

      console.log(`[MinIO] Uploaded rankings: ${objectPath}`);
      return objectPath;

    } catch (error) {
      console.error('[MinIO] Upload rankings error:', error.message);
      throw error;
    }
  }

  /**
   * Download rankings JSON
   *
   * @param {string} useCase - Use case category
   * @returns {Promise<object>} - Rankings data
   */
  async downloadRankings(useCase) {
    if (!this.client) {
      throw new Error('MinIO client not initialized');
    }

    const objectPath = `rankings/${useCase}.json`;

    try {
      const chunks = [];

      const stream = await this.client.getObject(this.bucketName, objectPath);

      return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => {
          const json = Buffer.concat(chunks).toString('utf-8');
          resolve(JSON.parse(json));
        });
        stream.on('error', reject);
      });

    } catch (error) {
      if (error.code === 'NoSuchKey') {
        return null; // Rankings not found
      }
      console.error('[MinIO] Download rankings error:', error.message);
      throw error;
    }
  }

  /**
   * List all models in bucket
   */
  async listModels() {
    if (!this.client) {
      throw new Error('MinIO client not initialized');
    }

    try {
      const stream = this.client.listObjectsV2(this.bucketName, 'models/', true);
      const objects = [];

      return new Promise((resolve, reject) => {
        stream.on('data', obj => objects.push(obj));
        stream.on('end', () => resolve(objects));
        stream.on('error', reject);
      });

    } catch (error) {
      console.error('[MinIO] List models error:', error.message);
      throw error;
    }
  }

  /**
   * Get model metadata from database
   * @private
   */
  async _getModelMetadata(modelId) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(
        'SELECT * FROM model_storage WHERE model_id = $1',
        [modelId]
      );

      return result.rows[0] || null;

    } catch (error) {
      console.error('[MinIO] Get metadata error:', error.message);
      return null;
    }
  }

  /**
   * Save model metadata to database
   * @private
   */
  async _saveModelMetadata(metadata) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO model_storage (
          model_id, model_name, model_version,
          bucket_name, object_path, object_size,
          file_format, quantization, parameter_count,
          family, is_downloaded, local_path, uploaded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (model_id) DO UPDATE SET
          object_path = EXCLUDED.object_path,
          object_size = EXCLUDED.object_size,
          is_downloaded = EXCLUDED.is_downloaded,
          local_path = EXCLUDED.local_path,
          uploaded_at = EXCLUDED.uploaded_at`,
        [
          metadata.modelId,
          metadata.modelName,
          metadata.modelVersion,
          metadata.bucketName,
          metadata.objectPath,
          metadata.objectSize,
          metadata.fileFormat,
          metadata.quantization,
          metadata.parameterCount,
          metadata.family,
          metadata.isDownloaded,
          metadata.localPath,
          metadata.uploadedAt
        ]
      );

      console.log(`[MinIO] Saved metadata: ${metadata.modelId}`);

    } catch (error) {
      console.error('[MinIO] Save metadata error:', error.message);
    }
  }

  /**
   * Check if MinIO is available
   */
  async isAvailable() {
    if (!this.client) return false;

    try {
      await this.client.bucketExists(this.bucketName);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = MinIOModelClient;
