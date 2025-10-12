/**
 * Microsoft OAuth Provider Configuration
 *
 * Covers: Hotmail, Live.com, MSN, Outlook.com, Passport.com
 *
 * Setup instructions:
 * 1. Go to https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade
 * 2. Click "New registration"
 * 3. Fill in:
 *    - Name: CALOS
 *    - Supported account types: Personal Microsoft accounts only
 *    - Redirect URI (Web): http://localhost:5001/api/auth/oauth/callback
 * 4. After creation:
 *    - Go to "Certificates & secrets" → New client secret
 *    - Copy Application (client) ID and Client secret value
 *    - Go to "API permissions" → Add Microsoft Graph → User.Read, email, profile
 */

module.exports = {
  provider_id: 'microsoft',
  display_name: 'Microsoft Account',
  provider_type: 'oauth2',

  // OAuth 2.0 endpoints (using common endpoint for personal accounts)
  auth_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  userinfo_url: 'https://graph.microsoft.com/v1.0/me',
  revoke_url: null,

  // Configuration
  scopes: ['User.Read', 'email', 'profile', 'openid', 'offline_access'],
  response_type: 'code',
  grant_type: 'authorization_code',

  // User field mapping (Microsoft Graph uses different field names)
  email_field: 'mail', // or 'userPrincipalName' as fallback
  name_field: 'displayName',
  id_field: 'id',

  // Metadata
  icon_url: 'https://www.microsoft.com/favicon.ico',
  docs_url: 'https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow',
  legacy_provider: true, // Legacy email provider
  email_domains: ['hotmail.com', 'live.com', 'msn.com', 'outlook.com', 'passport.com'],

  // Credentials
  client_id: process.env.MICROSOFT_CLIENT_ID || 'YOUR_MICROSOFT_CLIENT_ID',
  client_secret: process.env.MICROSOFT_CLIENT_SECRET || 'YOUR_MICROSOFT_CLIENT_SECRET',

  // Status
  is_enabled: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
  requires_manual_setup: true
};
