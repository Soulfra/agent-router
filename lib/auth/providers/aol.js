/**
 * AOL OAuth Provider Configuration
 *
 * Note: AOL uses Yahoo's OAuth infrastructure after the merger
 *
 * Setup instructions:
 * 1. AOL and Yahoo share the same OAuth system
 * 2. Go to https://developer.yahoo.com/apps/ (yes, Yahoo Developer Portal)
 * 3. Create app with callback domain for AOL logins
 * 4. Use the same credentials but with AOL-specific endpoints
 */

module.exports = {
  provider_id: 'aol',
  display_name: 'AOL',
  provider_type: 'oauth2',

  // OAuth 2.0 endpoints (AOL-branded but Yahoo infrastructure)
  auth_url: 'https://api.login.aol.com/oauth2/request_auth',
  token_url: 'https://api.login.aol.com/oauth2/get_token',
  userinfo_url: 'https://api.login.aol.com/openid/v1/userinfo',
  revoke_url: 'https://api.login.aol.com/oauth2/revoke',

  // Configuration
  scopes: ['openid', 'email', 'profile'],
  response_type: 'code',
  grant_type: 'authorization_code',

  // User field mapping
  email_field: 'email',
  name_field: 'name',
  id_field: 'sub',

  // Metadata
  icon_url: 'https://www.aol.com/favicon.ico',
  docs_url: 'https://developer.yahoo.com/oauth2/guide/', // Same docs as Yahoo
  legacy_provider: true,
  email_domains: ['aol.com', 'aim.com'],

  // Credentials (can use same Yahoo credentials or separate AOL app)
  client_id: process.env.AOL_CLIENT_ID || process.env.YAHOO_CLIENT_ID || 'YOUR_AOL_CLIENT_ID',
  client_secret: process.env.AOL_CLIENT_SECRET || process.env.YAHOO_CLIENT_SECRET || 'YOUR_AOL_CLIENT_SECRET',

  // Status
  is_enabled: !!(
    (process.env.AOL_CLIENT_ID && process.env.AOL_CLIENT_SECRET) ||
    (process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET)
  ),
  requires_manual_setup: true
};
