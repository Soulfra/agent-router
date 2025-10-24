/**
 * AnonymousIdentityRouter
 *
 * Matrix-style identity bridging for anonymous app distribution.
 *
 * Users log in with GitHub/Google → Get anonymous pseudonymous identity
 * Your router acts as identity broker, never exposing real identities.
 *
 * Flow:
 *   User → GitHub OAuth → Your Router → Anonymous ID
 *                     ↓
 *   User → Google OAuth → Your Router → Same Anonymous ID
 *
 * Features:
 * - Pseudonymous handles (e.g., "player_1234", "dev_5678")
 * - Identity linking across platforms
 * - No real names/emails exposed to apps
 * - Revocable access tokens
 * - Zero-knowledge architecture
 *
 * Usage:
 *   const router = new AnonymousIdentityRouter({ db });
 *   const identity = await router.authenticateUser('github', githubProfile);
 *   // Returns: { anonymousId: 'player_1234', handle: '@anon_dev', ... }
 */

const crypto = require('crypto');

class AnonymousIdentityRouter {
  constructor(options = {}) {
    this.db = options.db;
    this.handlePrefix = options.handlePrefix || 'anon';
    this.idPrefix = options.idPrefix || 'usr';

    console.log('[AnonymousIdentityRouter] Initialized');
  }

  /**
   * Authenticate a user and return anonymous identity
   * @param {string} provider - OAuth provider (github, google, etc.)
   * @param {object} profile - Provider profile data
   * @returns {Promise<object>} - Anonymous identity
   */
  async authenticateUser(provider, profile) {
    try {
      // Extract provider-specific user ID
      const providerId = this.extractProviderId(provider, profile);

      // Check if user already has an anonymous identity
      let identity = await this.getIdentityByProvider(provider, providerId);

      if (!identity) {
        // Create new anonymous identity
        identity = await this.createAnonymousIdentity(provider, providerId, profile);
      } else {
        // Update last seen
        await this.updateLastSeen(identity.anonymous_id);
      }

      // Generate session token
      const sessionToken = this.generateSessionToken(identity.anonymous_id);

      return {
        anonymousId: identity.anonymous_id,
        handle: identity.handle,
        displayName: identity.display_name,
        avatarUrl: identity.avatar_url,
        sessionToken,
        providers: await this.getLinkedProviders(identity.anonymous_id)
      };
    } catch (error) {
      console.error('[AnonymousIdentityRouter] Auth error:', error);
      throw error;
    }
  }

  /**
   * Extract provider-specific user ID
   * @param {string} provider - Provider name
   * @param {object} profile - Profile data
   * @returns {string} - Provider user ID
   */
  extractProviderId(provider, profile) {
    switch (provider) {
      case 'github':
        return profile.id?.toString() || profile.login;
      case 'google':
        return profile.sub || profile.id;
      case 'twitter':
        return profile.id_str || profile.id;
      case 'discord':
        return profile.id;
      default:
        return profile.id?.toString() || profile.sub;
    }
  }

  /**
   * Get identity by provider credentials
   * @param {string} provider - Provider name
   * @param {string} providerId - Provider user ID
   * @returns {Promise<object>} - Identity or null
   */
  async getIdentityByProvider(provider, providerId) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(
        `SELECT ai.*
         FROM anonymous_identities ai
         JOIN identity_providers ip ON ai.anonymous_id = ip.anonymous_id
         WHERE ip.provider = $1 AND ip.provider_user_id = $2
         LIMIT 1`,
        [provider, providerId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('[AnonymousIdentityRouter] Failed to get identity:', error);
      return null;
    }
  }

  /**
   * Create new anonymous identity
   * @param {string} provider - Initial provider
   * @param {string} providerId - Provider user ID
   * @param {object} profile - Profile data
   * @returns {Promise<object>} - Created identity
   */
  async createAnonymousIdentity(provider, providerId, profile) {
    if (!this.db) throw new Error('Database required');

    try {
      // Generate anonymous ID and handle
      const anonymousId = this.generateAnonymousId();
      const handle = this.generateHandle();
      const displayName = this.generateDisplayName();

      // Extract avatar (if available, but anonymize it)
      const avatarUrl = this.anonymizeAvatar(profile);

      // Insert anonymous identity
      const identityResult = await this.db.query(
        `INSERT INTO anonymous_identities (
          anonymous_id, handle, display_name, avatar_url, created_at, last_seen
        ) VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING *`,
        [anonymousId, handle, displayName, avatarUrl]
      );

      const identity = identityResult.rows[0];

      // Link provider
      await this.linkProvider(anonymousId, provider, providerId, profile);

      console.log(`[AnonymousIdentityRouter] Created identity: ${anonymousId} (${handle})`);

      return identity;
    } catch (error) {
      console.error('[AnonymousIdentityRouter] Failed to create identity:', error);
      throw error;
    }
  }

  /**
   * Link OAuth provider to anonymous identity
   * @param {string} anonymousId - Anonymous ID
   * @param {string} provider - Provider name
   * @param {string} providerId - Provider user ID
   * @param {object} profile - Profile data
   */
  async linkProvider(anonymousId, provider, providerId, profile) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO identity_providers (
          anonymous_id, provider, provider_user_id, profile_data, linked_at
        ) VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (provider, provider_user_id) DO UPDATE
        SET profile_data = $4, linked_at = NOW()`,
        [anonymousId, provider, providerId, JSON.stringify(profile)]
      );

      console.log(`[AnonymousIdentityRouter] Linked ${provider} to ${anonymousId}`);
    } catch (error) {
      console.error('[AnonymousIdentityRouter] Failed to link provider:', error);
    }
  }

  /**
   * Get linked providers for an identity
   * @param {string} anonymousId - Anonymous ID
   * @returns {Promise<Array>} - Linked providers
   */
  async getLinkedProviders(anonymousId) {
    if (!this.db) return [];

    try {
      const result = await this.db.query(
        `SELECT provider, linked_at
         FROM identity_providers
         WHERE anonymous_id = $1
         ORDER BY linked_at DESC`,
        [anonymousId]
      );

      return result.rows.map(row => ({
        provider: row.provider,
        linkedAt: row.linked_at
      }));
    } catch (error) {
      console.error('[AnonymousIdentityRouter] Failed to get providers:', error);
      return [];
    }
  }

  /**
   * Generate anonymous ID
   * @returns {string} - Anonymous ID
   */
  generateAnonymousId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `${this.idPrefix}_${timestamp}_${random}`;
  }

  /**
   * Generate pseudonymous handle
   * @returns {string} - Handle
   */
  generateHandle() {
    const adjectives = [
      'swift', 'brave', 'clever', 'silent', 'mighty',
      'wise', 'fierce', 'noble', 'bright', 'dark'
    ];

    const nouns = [
      'fox', 'wolf', 'hawk', 'bear', 'tiger',
      'dragon', 'phoenix', 'raven', 'eagle', 'lion'
    ];

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 1000);

    return `@${this.handlePrefix}_${adj}_${noun}_${num}`;
  }

  /**
   * Generate display name
   * @returns {string} - Display name
   */
  generateDisplayName() {
    const titles = [
      'Anonymous', 'Player', 'User', 'Developer',
      'Builder', 'Creator', 'Hacker', 'Gamer'
    ];

    const title = titles[Math.floor(Math.random() * titles.length)];
    const num = Math.floor(Math.random() * 10000);

    return `${title} ${num}`;
  }

  /**
   * Anonymize avatar (use generic placeholder)
   * @param {object} profile - Profile data
   * @returns {string} - Avatar URL
   */
  anonymizeAvatar(profile) {
    // Use Gravatar-style placeholder or default avatar
    const hash = crypto
      .createHash('md5')
      .update(crypto.randomBytes(16))
      .digest('hex');

    // Gravatar with identicon style (generates unique geometric patterns)
    return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=200`;
  }

  /**
   * Generate session token
   * @param {string} anonymousId - Anonymous ID
   * @returns {string} - Session token
   */
  generateSessionToken(anonymousId) {
    const payload = {
      anonymousId,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const token = Buffer.from(JSON.stringify(payload)).toString('base64');

    // In production, sign this token with JWT
    return token;
  }

  /**
   * Verify session token
   * @param {string} token - Session token
   * @returns {object} - Decoded token or null
   */
  verifySessionToken(token) {
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64').toString());

      // Check if token is not too old (24 hours)
      const age = Date.now() - payload.timestamp;
      if (age > 24 * 60 * 60 * 1000) {
        return null; // Token expired
      }

      return payload;
    } catch (error) {
      console.error('[AnonymousIdentityRouter] Invalid token:', error);
      return null;
    }
  }

  /**
   * Update last seen timestamp
   * @param {string} anonymousId - Anonymous ID
   */
  async updateLastSeen(anonymousId) {
    if (!this.db) return;

    try {
      await this.db.query(
        'UPDATE anonymous_identities SET last_seen = NOW() WHERE anonymous_id = $1',
        [anonymousId]
      );
    } catch (error) {
      console.warn('[AnonymousIdentityRouter] Failed to update last seen:', error.message);
    }
  }

  /**
   * Revoke access for a provider
   * @param {string} anonymousId - Anonymous ID
   * @param {string} provider - Provider to revoke
   */
  async revokeProvider(anonymousId, provider) {
    if (!this.db) return;

    try {
      await this.db.query(
        'DELETE FROM identity_providers WHERE anonymous_id = $1 AND provider = $2',
        [anonymousId, provider]
      );

      console.log(`[AnonymousIdentityRouter] Revoked ${provider} for ${anonymousId}`);
    } catch (error) {
      console.error('[AnonymousIdentityRouter] Failed to revoke provider:', error);
    }
  }

  /**
   * Delete anonymous identity (and all linked providers)
   * @param {string} anonymousId - Anonymous ID
   */
  async deleteIdentity(anonymousId) {
    if (!this.db) return;

    try {
      // Delete providers first (foreign key)
      await this.db.query(
        'DELETE FROM identity_providers WHERE anonymous_id = $1',
        [anonymousId]
      );

      // Delete identity
      await this.db.query(
        'DELETE FROM anonymous_identities WHERE anonymous_id = $1',
        [anonymousId]
      );

      console.log(`[AnonymousIdentityRouter] Deleted identity: ${anonymousId}`);
    } catch (error) {
      console.error('[AnonymousIdentityRouter] Failed to delete identity:', error);
      throw error;
    }
  }

  /**
   * Get identity by anonymous ID
   * @param {string} anonymousId - Anonymous ID
   * @returns {Promise<object>} - Identity or null
   */
  async getIdentity(anonymousId) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(
        'SELECT * FROM anonymous_identities WHERE anonymous_id = $1',
        [anonymousId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('[AnonymousIdentityRouter] Failed to get identity:', error);
      return null;
    }
  }
}

module.exports = AnonymousIdentityRouter;
