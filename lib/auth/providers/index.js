/**
 * OAuth Provider Registry
 *
 * Central registry for all OAuth provider configurations
 */

const google = require('./google');
const github = require('./github');
const microsoft = require('./microsoft');
const yahoo = require('./yahoo');
const aol = require('./aol');

// Registry of all providers
const PROVIDERS = {
  google,
  github,
  microsoft,
  yahoo,
  aol
};

/**
 * Get all provider configurations
 */
function getAllProviders() {
  return Object.values(PROVIDERS);
}

/**
 * Get provider configuration by ID
 */
function getProvider(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }
  return provider;
}

/**
 * Get enabled providers (those with credentials configured)
 */
function getEnabledProviders() {
  return Object.values(PROVIDERS).filter(p => p.is_enabled);
}

/**
 * Get legacy providers
 */
function getLegacyProviders() {
  return Object.values(PROVIDERS).filter(p => p.legacy_provider);
}

/**
 * Detect provider from email domain
 */
function detectProviderFromEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  for (const provider of Object.values(PROVIDERS)) {
    if (provider.email_domains.includes(domain)) {
      return provider.provider_id;
    }
  }

  return null;
}

/**
 * Sync providers to database
 * Updates database with current provider configurations
 */
async function syncProvidersToDatabase(db) {
  console.log('[OAuth] Syncing provider configurations to database...');

  for (const provider of Object.values(PROVIDERS)) {
    try {
      await db.query(`
        INSERT INTO oauth_providers (
          provider_id,
          display_name,
          provider_type,
          auth_url,
          token_url,
          userinfo_url,
          revoke_url,
          scopes,
          response_type,
          grant_type,
          client_id,
          client_secret,
          email_field,
          name_field,
          id_field,
          icon_url,
          docs_url,
          legacy_provider,
          email_domains,
          is_enabled,
          requires_manual_setup
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        ON CONFLICT (provider_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          auth_url = EXCLUDED.auth_url,
          token_url = EXCLUDED.token_url,
          userinfo_url = EXCLUDED.userinfo_url,
          revoke_url = EXCLUDED.revoke_url,
          scopes = EXCLUDED.scopes,
          client_id = EXCLUDED.client_id,
          client_secret = EXCLUDED.client_secret,
          email_field = EXCLUDED.email_field,
          name_field = EXCLUDED.name_field,
          id_field = EXCLUDED.id_field,
          icon_url = EXCLUDED.icon_url,
          docs_url = EXCLUDED.docs_url,
          email_domains = EXCLUDED.email_domains,
          is_enabled = EXCLUDED.is_enabled,
          updated_at = CURRENT_TIMESTAMP
      `, [
        provider.provider_id,
        provider.display_name,
        provider.provider_type,
        provider.auth_url,
        provider.token_url,
        provider.userinfo_url || null,
        provider.revoke_url || null,
        provider.scopes,
        provider.response_type,
        provider.grant_type,
        provider.client_id,
        provider.client_secret || null,
        provider.email_field,
        provider.name_field,
        provider.id_field,
        provider.icon_url || null,
        provider.docs_url || null,
        provider.legacy_provider,
        provider.email_domains,
        provider.is_enabled,
        provider.requires_manual_setup
      ]);

      console.log(`[OAuth] ✓ Synced ${provider.provider_id} (${provider.is_enabled ? 'enabled' : 'disabled'})`);

    } catch (error) {
      console.error(`[OAuth] Failed to sync ${provider.provider_id}:`, error.message);
    }
  }

  console.log('[OAuth] Provider sync complete');
}

module.exports = {
  PROVIDERS,
  getAllProviders,
  getProvider,
  getEnabledProviders,
  getLegacyProviders,
  detectProviderFromEmail,
  syncProvidersToDatabase
};
