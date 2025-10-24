/**
 * @calos/sdk - CALOS Platform SDK
 *
 * Official JavaScript/TypeScript SDK for integrating CALOS AI routing
 * into your applications.
 *
 * @example
 * ```javascript
 * import { CALOS } from '@calos/sdk';
 *
 * const calos = new CALOS({
 *   apiKey: 'sk-tenant-abc123',
 *   baseURL: 'https://api.calos.dev'
 * });
 *
 * const response = await calos.chat.complete({
 *   prompt: 'Write a recipe for chocolate cake',
 *   model: 'gpt-4'
 * });
 * ```
 *
 * @version 1.0.0
 * @license MIT
 */

const VERSION = '1.0.0';

/**
 * Custom error classes
 */
class CALOSError extends Error {
  constructor(message, statusCode, response) {
    super(message);
    this.name = 'CALOSError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

class AuthenticationError extends CALOSError {
  constructor(message, response) {
    super(message, 401, response);
    this.name = 'AuthenticationError';
  }
}

class RateLimitError extends CALOSError {
  constructor(message, response) {
    super(message, 429, response);
    this.name = 'RateLimitError';
  }
}

class UsageLimitError extends CALOSError {
  constructor(message, response) {
    super(message, 429, response);
    this.name = 'UsageLimitError';
  }
}

class APIError extends CALOSError {
  constructor(message, statusCode, response) {
    super(message, statusCode, response);
    this.name = 'APIError';
  }
}

/**
 * Base HTTP client
 */
class APIClient {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://api.calos.dev';
    this.timeout = config.timeout || 60000;
    this.maxRetries = config.maxRetries || 3;
    this.headers = config.headers || {};
  }

  /**
   * Make HTTP request with retries
   */
  async request(method, path, options = {}) {
    const url = `${this.baseURL}${path}`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': `calos-sdk-js/${VERSION}`,
      'X-CALOS-SDK-Version': VERSION,
      ...this.headers,
      ...options.headers
    };

    const config = {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeout)
    };

    if (options.body) {
      config.body = JSON.stringify(options.body);
    }

    // Retry logic
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, config);

        // Handle different status codes
        if (response.ok) {
          // Check if response is JSON
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return await response.json();
          }
          return await response.text();
        }

        // Parse error response
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: response.statusText };
        }

        // Throw appropriate error
        if (response.status === 401) {
          throw new AuthenticationError(
            errorData.message || errorData.error || 'Invalid API key',
            errorData
          );
        }

        if (response.status === 429) {
          if (errorData.error === 'Usage limit exceeded') {
            throw new UsageLimitError(
              errorData.message || 'Usage limit exceeded for this billing period',
              errorData
            );
          }
          throw new RateLimitError(
            errorData.message || 'Rate limit exceeded',
            errorData
          );
        }

        throw new APIError(
          errorData.message || errorData.error || 'API request failed',
          response.status,
          errorData
        );

      } catch (error) {
        lastError = error;

        // Don't retry on auth errors or usage limits
        if (error instanceof AuthenticationError ||
            error instanceof UsageLimitError) {
          throw error;
        }

        // Exponential backoff for retries
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  /**
   * GET request
   */
  async get(path, options = {}) {
    return this.request('GET', path, options);
  }

  /**
   * POST request
   */
  async post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  /**
   * PUT request
   */
  async put(path, body, options = {}) {
    return this.request('PUT', path, { ...options, body });
  }

  /**
   * DELETE request
   */
  async delete(path, options = {}) {
    return this.request('DELETE', path, options);
  }
}

/**
 * Chat resource - AI chat completions
 */
class Chat {
  constructor(client) {
    this.client = client;
  }

  /**
   * Create a chat completion
   *
   * @param {Object} params - Completion parameters
   * @param {string} params.prompt - The prompt to send to the model
   * @param {string} [params.model] - Model to use (default: auto-routed)
   * @param {number} [params.maxTokens] - Maximum tokens to generate
   * @param {number} [params.temperature] - Sampling temperature (0-1)
   * @param {boolean} [params.stream] - Enable streaming (use stream() method instead)
   * @returns {Promise<Object>} Completion response
   */
  async complete(params) {
    return await this.client.post('/v1/chat/completions', {
      prompt: params.prompt,
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature
    });
  }

  /**
   * Create a streaming chat completion
   *
   * @param {Object} params - Completion parameters
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise<Object>} Final completion response
   */
  async stream(params, onChunk) {
    const url = `${this.client.baseURL}/v1/chat/stream`;
    const headers = {
      'Authorization': `Bearer ${this.client.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': `calos-sdk-js/${VERSION}`
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: params.prompt,
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        stream: true
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new APIError(error.message || 'Stream failed', response.status, error);
    }

    // Read Server-Sent Events
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let usage = null;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep last incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          if (data === '[DONE]') {
            break;
          }

          try {
            const chunk = JSON.parse(data);

            if (chunk.content) {
              fullText += chunk.content;
              if (onChunk) {
                onChunk(chunk.content);
              }
            }

            if (chunk.usage) {
              usage = chunk.usage;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    return {
      content: fullText,
      usage,
      provider: usage?.provider || 'unknown',
      model: params.model || 'auto'
    };
  }
}

/**
 * Usage resource - Track usage and billing
 */
class Usage {
  constructor(client) {
    this.client = client;
  }

  /**
   * Get current period usage
   *
   * @returns {Promise<Object>} Usage statistics
   */
  async getCurrent() {
    return await this.client.get('/v1/usage/current');
  }

  /**
   * Get usage breakdown by provider
   *
   * @param {Object} params - Query parameters
   * @param {number} [params.days=30] - Number of days to query
   * @returns {Promise<Array>} Usage by provider
   */
  async getByProvider(params = {}) {
    const days = params.days || 30;
    return await this.client.get(`/v1/usage/by-provider?days=${days}`);
  }

  /**
   * Get unbilled usage
   *
   * @returns {Promise<Object>} Unbilled usage stats
   */
  async getUnbilled() {
    return await this.client.get('/v1/usage/unbilled');
  }
}

/**
 * Tenants resource - Manage tenant settings (super admin only)
 */
class Tenants {
  constructor(client) {
    this.client = client;
  }

  /**
   * List all tenants (super admin only)
   *
   * @returns {Promise<Array>} List of tenants
   */
  async list() {
    return await this.client.get('/api/admin/tenants');
  }

  /**
   * Get tenant details
   *
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Tenant details
   */
  async get(tenantId) {
    return await this.client.get(`/api/admin/tenants/${tenantId}`);
  }

  /**
   * Update tenant
   *
   * @param {string} tenantId - Tenant ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated tenant
   */
  async update(tenantId, updates) {
    return await this.client.put(`/api/admin/tenants/${tenantId}`, updates);
  }
}

/**
 * Main CALOS SDK client
 */
class CALOS {
  /**
   * Initialize CALOS client
   *
   * @param {Object} config - Configuration options
   * @param {string} config.apiKey - Your CALOS API key (required)
   * @param {string} [config.baseURL='https://api.calos.dev'] - API base URL
   * @param {number} [config.timeout=60000] - Request timeout in ms
   * @param {number} [config.maxRetries=3] - Max retry attempts
   * @param {Object} [config.headers] - Additional headers
   *
   * @example
   * ```javascript
   * const calos = new CALOS({
   *   apiKey: 'sk-tenant-abc123',
   *   baseURL: 'https://yoursubdomain.calos.dev'
   * });
   * ```
   */
  constructor(config) {
    if (!config || !config.apiKey) {
      throw new Error('API key is required. Get one at https://calos.dev/dashboard');
    }

    this._client = new APIClient(config);

    // Initialize resources
    this.chat = new Chat(this._client);
    this.usage = new Usage(this._client);
    this.tenants = new Tenants(this._client);
  }

  /**
   * Get SDK version
   *
   * @returns {string} SDK version
   */
  static get version() {
    return VERSION;
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CALOS,
    CALOSError,
    AuthenticationError,
    RateLimitError,
    UsageLimitError,
    APIError
  };
}

export {
  CALOS,
  CALOSError,
  AuthenticationError,
  RateLimitError,
  UsageLimitError,
  APIError
};

export default CALOS;
