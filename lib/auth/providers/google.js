/**
 * Google OAuth Provider Configuration
 *
 * Setup instructions:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a new project or select existing
 * 3. Enable Google+ API
 * 4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
 * 5. Add authorized redirect URIs:
 *    - http://localhost:5001/api/auth/oauth/callback
 *    - https://your-domain.com/api/auth/oauth/callback
 * 6. Copy Client ID and Client Secret
 */

module.exports = {
  provider_id: 'google',
  display_name: 'Google',
  provider_type: 'oauth2',

  // OAuth 2.0 endpoints
  auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_url: 'https://oauth2.googleapis.com/token',
  userinfo_url: 'https://www.googleapis.com/oauth2/v2/userinfo',
  revoke_url: 'https://oauth2.googleapis.com/revoke',

  // Configuration
  scopes: ['email', 'profile', 'openid'],
  response_type: 'code',
  grant_type: 'authorization_code',

  // User field mapping
  email_field: 'email',
  name_field: 'name',
  id_field: 'id',

  // Metadata
  icon_url: 'https://www.google.com/favicon.ico',
  docs_url: 'https://developers.google.com/identity/protocols/oauth2',
  legacy_provider: false,
  email_domains: ['gmail.com', 'googlemail.com'],

  // Credentials (to be set via environment variables)
  client_id: process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID',
  client_secret: process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET',

  // Status
  is_enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  requires_manual_setup: true
};
