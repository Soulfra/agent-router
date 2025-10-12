/**
 * GitHub OAuth Provider Configuration
 *
 * Setup instructions:
 * 1. Go to https://github.com/settings/developers
 * 2. Click "New OAuth App"
 * 3. Fill in:
 *    - Application name: CALOS
 *    - Homepage URL: http://localhost:5001
 *    - Authorization callback URL: http://localhost:5001/api/auth/oauth/callback
 * 4. Copy Client ID and Client Secret
 */

module.exports = {
  provider_id: 'github',
  display_name: 'GitHub',
  provider_type: 'oauth2',

  // OAuth 2.0 endpoints
  auth_url: 'https://github.com/login/oauth/authorize',
  token_url: 'https://github.com/login/oauth/access_token',
  userinfo_url: 'https://api.github.com/user',
  revoke_url: null, // GitHub doesn't have a revoke endpoint

  // Configuration
  scopes: ['user:email', 'read:user'],
  response_type: 'code',
  grant_type: 'authorization_code',

  // User field mapping
  email_field: 'email',
  name_field: 'name',
  id_field: 'id',

  // Metadata
  icon_url: 'https://github.com/favicon.ico',
  docs_url: 'https://docs.github.com/en/developers/apps/building-oauth-apps',
  legacy_provider: false,
  email_domains: [],

  // Credentials
  client_id: process.env.GITHUB_CLIENT_ID || 'YOUR_GITHUB_CLIENT_ID',
  client_secret: process.env.GITHUB_CLIENT_SECRET || 'YOUR_GITHUB_CLIENT_SECRET',

  // Status
  is_enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  requires_manual_setup: true
};
