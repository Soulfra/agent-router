/**
 * Credential Provider
 * Reads API keys from macOS Keychain via keyring-manager.sh
 * Falls back to .env for compatibility
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Path to keyring manager in script-toolkit
const KEYRING_MANAGER_PATH = path.join(__dirname, '../../../script-toolkit/lib/keyring-manager.sh');

class CredentialProvider {
  constructor() {
    this.cache = new Map();
    this.keyringAvailable = this._checkKeyringAvailable();
  }

  /**
   * Check if keyring manager is available
   */
  _checkKeyringAvailable() {
    try {
      return fs.existsSync(KEYRING_MANAGER_PATH);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get credential from keyring
   * @param {string} name - Credential name (e.g., 'openai', 'anthropic', 'github')
   * @returns {string|null} - Credential value or null
   */
  _getFromKeyring(name) {
    if (!this.keyringAvailable) {
      return null;
    }

    try {
      const value = execSync(`"${KEYRING_MANAGER_PATH}" get "${name}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      }).trim();

      return value || null;
    } catch (error) {
      // Credential not found in keyring
      return null;
    }
  }

  /**
   * Get credential from environment variable
   * @param {string} envVar - Environment variable name
   * @returns {string|null} - Credential value or null
   */
  _getFromEnv(envVar) {
    return process.env[envVar] || null;
  }

  /**
   * Get credential with fallback strategy
   * 1. Try keyring
   * 2. Fall back to environment variable
   * 3. Return null if not found
   *
   * @param {string} name - Credential name
   * @param {string} envVar - Environment variable name (fallback)
   * @returns {string|null} - Credential value or null
   */
  get(name, envVar) {
    // Check cache first
    const cacheKey = `${name}:${envVar}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Try keyring first
    let value = this._getFromKeyring(name);

    // Fall back to environment variable
    if (!value && envVar) {
      value = this._getFromEnv(envVar);
    }

    // Cache result
    if (value) {
      this.cache.set(cacheKey, value);
    }

    return value;
  }

  /**
   * Get OpenAI API key
   */
  getOpenAIKey() {
    return this.get('openai', 'OPENAI_API_KEY');
  }

  /**
   * Get Anthropic API key
   */
  getAnthropicKey() {
    return this.get('anthropic', 'ANTHROPIC_API_KEY');
  }

  /**
   * Get DeepSeek API key
   */
  getDeepSeekKey() {
    return this.get('deepseek', 'DEEPSEEK_API_KEY');
  }

  /**
   * Get GitHub token
   */
  getGitHubToken() {
    return this.get('github', 'GITHUB_TOKEN');
  }

  /**
   * Get Ollama URL
   */
  getOllamaURL() {
    return this.get('ollama_url', 'OLLAMA_API_URL') || 'http://localhost:11434';
  }

  /**
   * Clear cache (useful for credential rotation)
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Check if keyring is available
   */
  isKeyringAvailable() {
    return this.keyringAvailable;
  }

  /**
   * Get status of credential sources
   */
  getStatus() {
    const status = {
      keyringAvailable: this.keyringAvailable,
      credentials: {
        openai: {
          source: null,
          available: false
        },
        anthropic: {
          source: null,
          available: false
        },
        deepseek: {
          source: null,
          available: false
        },
        github: {
          source: null,
          available: false
        }
      }
    };

    // Check each credential
    for (const [name, envVar] of [
      ['openai', 'OPENAI_API_KEY'],
      ['anthropic', 'ANTHROPIC_API_KEY'],
      ['deepseek', 'DEEPSEEK_API_KEY'],
      ['github', 'GITHUB_TOKEN']
    ]) {
      const fromKeyring = this._getFromKeyring(name);
      const fromEnv = this._getFromEnv(envVar);

      if (fromKeyring) {
        status.credentials[name].source = 'keyring';
        status.credentials[name].available = true;
      } else if (fromEnv) {
        status.credentials[name].source = 'env';
        status.credentials[name].available = true;
      }
    }

    return status;
  }

  /**
   * Import credentials from .env file to keyring
   * @param {string} envFilePath - Path to .env file
   */
  importFromEnv(envFilePath) {
    if (!this.keyringAvailable) {
      throw new Error('Keyring manager not available');
    }

    try {
      execSync(`"${KEYRING_MANAGER_PATH}" import-env "${envFilePath}"`, {
        encoding: 'utf8',
        stdio: 'inherit'
      });

      // Clear cache after import
      this.clearCache();

      return true;
    } catch (error) {
      throw new Error(`Failed to import credentials: ${error.message}`);
    }
  }
}

// Export singleton instance
const credentialProvider = new CredentialProvider();

module.exports = credentialProvider;
module.exports.CredentialProvider = CredentialProvider;
