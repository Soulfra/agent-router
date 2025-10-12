/**
 * Yahoo OAuth Provider Configuration
 *
 * Setup instructions:
 * 1. Go to https://developer.yahoo.com/apps/
 * 2. Click "Create an App"
 * 3. Fill in:
 *    - Application Name: CALOS
 *    - Application Type: Web Application
 *    - Callback Domain: localhost (for development) or your domain
 *    - API Permissions: OpenID Connect Permissions (email, profile)
 * 4. After creation, copy Client ID and Client Secret
 */

module.exports = {
  provider_id: 'yahoo',
  display_name: 'Yahoo!',
  provider_type: 'oauth2',

  // OAuth 2.0 endpoints
  auth_url: 'https://api.login.yahoo.com/oauth2/request_auth',
  token_url: 'https://api.login.yahoo.com/oauth2/get_token',
  userinfo_url: 'https://api.login.yahoo.com/openid/v1/userinfo',
  revoke_url: 'https://api.login.yahoo.com/oauth2/revoke',

  // Configuration
  scopes: ['openid', 'email', 'profile'],
  response_type: 'code',
  grant_type: 'authorization_code',

  // User field mapping
  email_field: 'email',
  name_field: 'name',
  id_field: 'sub', // Yahoo uses 'sub' for user ID in OpenID Connect

  // Metadata
  icon_url: 'https://www.yahoo.com/favicon.ico',
  docs_url: 'https://developer.yahoo.com/oauth2/guide/',
  legacy_provider: true,
  email_domains: ['yahoo.com', 'ymail.com', 'rocketmail.com'],

  // Credentials
  client_id: process.env.YAHOO_CLIENT_ID || 'YOUR_YAHOO_CLIENT_ID',
  client_secret: process.env.YAHOO_CLIENT_SECRET || 'YOUR_YAHOO_CLIENT_SECRET',

  // Status
  is_enabled: !!(process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET),
  requires_manual_setup: true
};
