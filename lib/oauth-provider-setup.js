/**
 * OAuth Provider Database Configuration
 *
 * This script configures OAuth providers in the database using credentials
 * from environment variables. It creates/updates the oauth_providers table
 * with the necessary configuration for encrypted passthrough authentication.
 *
 * Usage:
 *   node lib/oauth-provider-setup.js
 *
 * Environment variables required:
 *   - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   - MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
 *   - GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
 *   - OAUTH_CALLBACK_URL
 */

const crypto = require('crypto');

class OAuthProviderSetup {
  constructor({ db }) {
    this.db = db;

    // OAuth provider configurations
    this.providers = [
      {
        provider_id: 'google',
        name: 'Google',
        authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
        token_url: 'https://oauth2.googleapis.com/token',
        userinfo_url: 'https://www.googleapis.com/oauth2/v2/userinfo',
        scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.readonly'],
        client_id_env: 'GOOGLE_CLIENT_ID',
        client_secret_env: 'GOOGLE_CLIENT_SECRET',
        email_domains: ['gmail.com', 'googlemail.com'],
        supports_pkce: true,
        user_id_field: 'id',
        email_field: 'email',
        name_field: 'name',
        picture_field: 'picture'
      },
      {
        provider_id: 'microsoft',
        name: 'Microsoft',
        authorization_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userinfo_url: 'https://graph.microsoft.com/v1.0/me',
        scopes: ['openid', 'email', 'profile', 'User.Read', 'Files.Read'],
        client_id_env: 'MICROSOFT_CLIENT_ID',
        client_secret_env: 'MICROSOFT_CLIENT_SECRET',
        email_domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
        supports_pkce: true,
        user_id_field: 'id',
        email_field: 'mail',
        name_field: 'displayName',
        picture_field: 'userPrincipalName'
      },
      {
        provider_id: 'github',
        name: 'GitHub',
        authorization_url: 'https://github.com/login/oauth/authorize',
        token_url: 'https://github.com/login/oauth/access_token',
        userinfo_url: 'https://api.github.com/user',
        scopes: ['user:email', 'read:user'],
        client_id_env: 'GITHUB_CLIENT_ID',
        client_secret_env: 'GITHUB_CLIENT_SECRET',
        email_domains: [],
        supports_pkce: false,
        user_id_field: 'id',
        email_field: 'email',
        name_field: 'name',
        picture_field: 'avatar_url'
      },
      {
        provider_id: 'icloud',
        name: 'iCloud',
        authorization_url: 'https://appleid.apple.com/auth/authorize',
        token_url: 'https://appleid.apple.com/auth/token',
        userinfo_url: 'https://appleid.apple.com/auth/userinfo',
        scopes: ['name', 'email'],
        client_id_env: 'ICLOUD_CLIENT_ID',
        client_secret_env: 'ICLOUD_CLIENT_SECRET',
        email_domains: ['icloud.com', 'me.com', 'mac.com'],
        supports_pkce: true,
        user_id_field: 'sub',
        email_field: 'email',
        name_field: 'name',
        picture_field: null
      }
    ];
  }

  /**
   * Encrypt sensitive data before storing in database
   */
  encrypt(text) {
    if (!text) return null;

    // Use a consistent encryption key from environment or generate one
    const encryptionKey = process.env.OAUTH_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(encryptionKey.slice(0, 32)), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Setup all OAuth providers in the database
   */
  async setup() {
    console.log('🔐 Setting up OAuth providers...\n');

    const results = {
      configured: [],
      skipped: [],
      errors: []
    };

    for (const provider of this.providers) {
      try {
        const clientId = process.env[provider.client_id_env];
        const clientSecret = process.env[provider.client_secret_env];

        if (!clientId || !clientSecret ||
            clientId.startsWith('your-') ||
            clientSecret.startsWith('your-')) {
          console.log(`⏭️  Skipping ${provider.name}: credentials not configured in .env`);
          results.skipped.push(provider.name);
          continue;
        }

        // Encrypt client secret
        const encryptedSecret = this.encrypt(clientSecret);

        // Upsert provider configuration
        await this.db.query(`
          INSERT INTO oauth_providers (
            provider_id, name, authorization_url, token_url, userinfo_url,
            scopes, client_id, client_secret, email_domains, supports_pkce,
            user_id_field, email_field, name_field, picture_field,
            is_active, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, NOW(), NOW())
          ON CONFLICT (provider_id)
          DO UPDATE SET
            name = EXCLUDED.name,
            authorization_url = EXCLUDED.authorization_url,
            token_url = EXCLUDED.token_url,
            userinfo_url = EXCLUDED.userinfo_url,
            scopes = EXCLUDED.scopes,
            client_id = EXCLUDED.client_id,
            client_secret = EXCLUDED.client_secret,
            email_domains = EXCLUDED.email_domains,
            supports_pkce = EXCLUDED.supports_pkce,
            user_id_field = EXCLUDED.user_id_field,
            email_field = EXCLUDED.email_field,
            name_field = EXCLUDED.name_field,
            picture_field = EXCLUDED.picture_field,
            is_active = true,
            updated_at = NOW()
        `, [
          provider.provider_id,
          provider.name,
          provider.authorization_url,
          provider.token_url,
          provider.userinfo_url,
          provider.scopes,
          clientId,
          encryptedSecret,
          provider.email_domains,
          provider.supports_pkce,
          provider.user_id_field,
          provider.email_field,
          provider.name_field,
          provider.picture_field
        ]);

        console.log(`✅ Configured ${provider.name} (${provider.provider_id})`);
        results.configured.push(provider.name);

      } catch (error) {
        console.error(`❌ Error configuring ${provider.name}:`, error.message);
        results.errors.push({ provider: provider.name, error: error.message });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 OAuth Provider Setup Summary');
    console.log('='.repeat(60));
    console.log(`✅ Configured: ${results.configured.length} providers`);
    if (results.configured.length > 0) {
      results.configured.forEach(name => console.log(`   - ${name}`));
    }

    console.log(`\n⏭️  Skipped: ${results.skipped.length} providers`);
    if (results.skipped.length > 0) {
      results.skipped.forEach(name => console.log(`   - ${name}`));
    }

    if (results.errors.length > 0) {
      console.log(`\n❌ Errors: ${results.errors.length}`);
      results.errors.forEach(({ provider, error }) => {
        console.log(`   - ${provider}: ${error}`);
      });
    }

    console.log('\n💡 Next Steps:');
    if (results.skipped.length > 0) {
      console.log('   1. Add OAuth credentials to .env for skipped providers');
      console.log('   2. Get credentials from provider developer consoles:');
      console.log('      - Google: https://console.cloud.google.com/apis/credentials');
      console.log('      - Microsoft: https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps');
      console.log('      - GitHub: https://github.com/settings/developers');
      console.log('   3. Run this script again to configure them');
    }
    if (results.configured.length > 0) {
      console.log('   - Test OAuth flows at: http://localhost:5001/api/auth/oauth/providers');
      console.log('   - Integrate "Sign in with..." buttons in your frontend');
    }

    return results;
  }

  /**
   * List currently configured providers
   */
  async list() {
    const result = await this.db.query(`
      SELECT
        provider_id,
        name,
        is_active,
        email_domains,
        supports_pkce,
        created_at,
        updated_at
      FROM oauth_providers
      ORDER BY provider_id
    `);

    console.log('\n📋 Configured OAuth Providers:\n');

    if (result.rows.length === 0) {
      console.log('   No providers configured yet. Run setup() first.');
      return;
    }

    result.rows.forEach(provider => {
      const status = provider.is_active ? '✅' : '❌';
      const domains = provider.email_domains.length > 0
        ? ` (${provider.email_domains.join(', ')})`
        : '';
      const pkce = provider.supports_pkce ? '🔐 PKCE' : '';

      console.log(`${status} ${provider.name}${domains}`);
      console.log(`   ID: ${provider.provider_id} ${pkce}`);
      console.log(`   Updated: ${provider.updated_at.toISOString()}`);
      console.log('');
    });
  }

  /**
   * Test provider configuration
   */
  async test(providerId) {
    const result = await this.db.query(
      'SELECT * FROM oauth_providers WHERE provider_id = $1',
      [providerId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Provider '${providerId}' not found in database`);
    }

    const provider = result.rows[0];

    console.log(`\n🧪 Testing ${provider.name} Configuration:\n`);
    console.log(`✅ Provider ID: ${provider.provider_id}`);
    console.log(`✅ Name: ${provider.name}`);
    console.log(`✅ Authorization URL: ${provider.authorization_url}`);
    console.log(`✅ Token URL: ${provider.token_url}`);
    console.log(`✅ Userinfo URL: ${provider.userinfo_url}`);
    console.log(`✅ Scopes: ${provider.scopes.join(', ')}`);
    console.log(`✅ Client ID: ${provider.client_id.slice(0, 20)}...`);
    console.log(`✅ Client Secret: ${provider.client_secret ? '[ENCRYPTED]' : '[MISSING]'}`);
    console.log(`✅ PKCE Support: ${provider.supports_pkce ? 'Yes' : 'No'}`);
    console.log(`✅ Email Domains: ${provider.email_domains.join(', ') || 'None'}`);
    console.log(`✅ Active: ${provider.is_active ? 'Yes' : 'No'}`);

    console.log('\n💡 Test OAuth flow:');
    console.log(`   http://localhost:5001/api/auth/oauth/${providerId}/authorize`);

    return provider;
  }
}

// CLI interface
if (require.main === module) {
  const { Pool } = require('pg');

  const db = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'calos',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });

  const setup = new OAuthProviderSetup({ db });

  const command = process.argv[2];
  const arg = process.argv[3];

  (async () => {
    try {
      if (command === 'setup') {
        await setup.setup();
      } else if (command === 'list') {
        await setup.list();
      } else if (command === 'test' && arg) {
        await setup.test(arg);
      } else {
        console.log('OAuth Provider Setup Utility\n');
        console.log('Usage:');
        console.log('  node lib/oauth-provider-setup.js setup       - Configure providers from .env');
        console.log('  node lib/oauth-provider-setup.js list        - List configured providers');
        console.log('  node lib/oauth-provider-setup.js test <id>   - Test provider configuration');
        console.log('\nExamples:');
        console.log('  node lib/oauth-provider-setup.js setup');
        console.log('  node lib/oauth-provider-setup.js test google');
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    } finally {
      await db.end();
    }
  })();
}

module.exports = OAuthProviderSetup;
