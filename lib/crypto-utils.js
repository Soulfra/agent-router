/**
 * Crypto Utils
 * Safe cryptographic operations using Node.js crypto module
 *
 * NO process spawning - all operations use built-in JavaScript
 * Pattern: Like /time and /system endpoints - pure JS utilities
 */

const crypto = require('crypto');

class CryptoUtils {
  /**
   * Hash text using specified algorithm
   * @param {string} text - Text to hash
   * @param {string} algorithm - Hash algorithm (sha256, sha512, md5, sha1)
   * @returns {object} - Hash result
   */
  hash(text, algorithm = 'sha256') {
    const validAlgorithms = ['sha256', 'sha512', 'md5', 'sha1', 'sha384'];

    if (!validAlgorithms.includes(algorithm)) {
      throw new Error(`Unsupported algorithm: ${algorithm}. Valid: ${validAlgorithms.join(', ')}`);
    }

    const hash = crypto.createHash(algorithm).update(text).digest('hex');

    return {
      algorithm,
      input: text,
      hash,
      length: hash.length
    };
  }

  /**
   * Generate HMAC signature
   * @param {string} text - Text to sign
   * @param {string} secret - Secret key
   * @param {string} algorithm - Hash algorithm (sha256, sha512)
   * @returns {object} - HMAC result
   */
  hmac(text, secret, algorithm = 'sha256') {
    const validAlgorithms = ['sha256', 'sha512', 'sha1'];

    if (!validAlgorithms.includes(algorithm)) {
      throw new Error(`Unsupported algorithm: ${algorithm}. Valid: ${validAlgorithms.join(', ')}`);
    }

    const signature = crypto.createHmac(algorithm, secret).update(text).digest('hex');

    return {
      algorithm,
      input: text,
      signature,
      length: signature.length
    };
  }

  /**
   * Base64 encode text
   * @param {string} text - Text to encode
   * @returns {object} - Encoded result
   */
  base64Encode(text) {
    const encoded = Buffer.from(text, 'utf-8').toString('base64');

    return {
      input: text,
      encoded,
      inputLength: text.length,
      outputLength: encoded.length
    };
  }

  /**
   * Base64 decode text
   * @param {string} encoded - Base64 encoded text
   * @returns {object} - Decoded result
   */
  base64Decode(encoded) {
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');

      return {
        input: encoded,
        decoded,
        inputLength: encoded.length,
        outputLength: decoded.length
      };
    } catch (error) {
      throw new Error(`Invalid base64: ${error.message}`);
    }
  }

  /**
   * Generate random bytes as hex
   * @param {number} length - Number of bytes to generate
   * @returns {object} - Random bytes result
   */
  randomBytes(length = 16) {
    if (length < 1 || length > 1024) {
      throw new Error('Length must be between 1 and 1024 bytes');
    }

    const bytes = crypto.randomBytes(length);

    return {
      hex: bytes.toString('hex'),
      base64: bytes.toString('base64'),
      length,
      outputLength: bytes.toString('hex').length
    };
  }

  /**
   * Generate UUID v4
   * @returns {object} - UUID result
   */
  uuid() {
    const uuid = crypto.randomUUID();

    return {
      uuid,
      version: 4,
      format: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    };
  }

  /**
   * Compare two strings in constant time (timing-safe)
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {object} - Comparison result
   */
  timingSafeEqual(a, b) {
    if (a.length !== b.length) {
      return {
        equal: false,
        reason: 'Length mismatch',
        lengthA: a.length,
        lengthB: b.length
      };
    }

    const bufferA = Buffer.from(a, 'utf-8');
    const bufferB = Buffer.from(b, 'utf-8');

    const equal = crypto.timingSafeEqual(bufferA, bufferB);

    return {
      equal,
      length: a.length
    };
  }

  /**
   * Get list of supported algorithms
   * @returns {object} - Available algorithms
   */
  getSupportedAlgorithms() {
    return {
      hash: ['sha256', 'sha512', 'md5', 'sha1', 'sha384'],
      hmac: ['sha256', 'sha512', 'sha1'],
      encoding: ['base64'],
      random: ['bytes', 'uuid']
    };
  }
}

module.exports = CryptoUtils;
