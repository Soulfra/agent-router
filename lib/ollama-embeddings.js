/**
 * Ollama Embeddings
 *
 * Generate vector embeddings using Ollama's local models
 * Uses nomic-embed-text for fast, free, local embeddings
 *
 * Pattern: Pure JavaScript, no process spawning
 */

const http = require('http');

class OllamaEmbeddings {
  constructor(options = {}) {
    // Use 127.0.0.1 instead of localhost to avoid IPv6 issues
    this.baseUrl = options.baseUrl || process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434';
    this.model = options.model || 'nomic-embed-text:latest';
    this.timeout = options.timeout || 30000; // 30 seconds
  }

  /**
   * Generate embedding for text
   * @param {string} text - Text to embed
   * @returns {Promise<Array<number>>} - Embedding vector
   */
  async generate(text) {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    try {
      const response = await this._makeRequest('/api/embeddings', {
        model: this.model,
        prompt: text
      });

      if (!response.embedding || !Array.isArray(response.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }

      return response.embedding;

    } catch (error) {
      console.error('Ollama embedding error:', error.message);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Generate embeddings in batch (sequential for Ollama)
   * @param {Array<string>} texts - Array of texts to embed
   * @returns {Promise<Array<Array<number>>>} - Array of embedding vectors
   */
  async generateBatch(texts) {
    const embeddings = [];

    for (const text of texts) {
      try {
        const embedding = await this.generate(text);
        embeddings.push(embedding);
      } catch (error) {
        console.error(`Failed to embed text "${text.substring(0, 50)}...":`, error.message);
        // Push null for failed embeddings
        embeddings.push(null);
      }
    }

    return embeddings;
  }

  /**
   * Check if Ollama is available
   * @returns {Promise<boolean>} - True if available
   */
  async isAvailable() {
    try {
      const response = await this._makeRequest('/api/tags', {}, 'GET');

      // Check if our embedding model is available
      if (response.models && Array.isArray(response.models)) {
        const hasModel = response.models.some(m =>
          m.name === this.model || m.name.startsWith('nomic-embed-text')
        );

        if (!hasModel) {
          console.warn(`⚠️  Model ${this.model} not found in Ollama. Available models:`,
            response.models.map(m => m.name).join(', '));
        }

        return hasModel;
      }

      return false;

    } catch (error) {
      console.error('Ollama availability check failed:', error.message);
      return false;
    }
  }

  /**
   * Get embedding model info
   * @returns {Promise<object>} - Model information
   */
  async getModelInfo() {
    try {
      const response = await this._makeRequest('/api/show', {
        name: this.model
      });

      return {
        name: response.name || this.model,
        size: response.size || 'unknown',
        family: response.details?.family || 'unknown',
        parameters: response.details?.parameter_size || 'unknown'
      };

    } catch (error) {
      return {
        name: this.model,
        error: error.message
      };
    }
  }

  /**
   * Internal: Make HTTP request to Ollama API
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request data
   * @param {string} method - HTTP method
   * @returns {Promise<object>} - Response data
   */
  _makeRequest(endpoint, data = {}, method = 'POST') {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.baseUrl);
      const postData = method === 'POST' ? JSON.stringify(data) : null;

      const options = {
        hostname: url.hostname,
        port: url.port || 11434,
        path: url.pathname,
        method: method,
        headers: method === 'POST' ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        } : {},
        timeout: this.timeout
      };

      const req = http.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);

            if (res.statusCode >= 400) {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (postData) {
        req.write(postData);
      }

      req.end();
    });
  }
}

module.exports = OllamaEmbeddings;
