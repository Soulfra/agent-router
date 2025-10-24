/**
 * Social OAuth Authentication System
 *
 * Multi-provider OAuth for viral growth:
 * - Twitter: Auto-create subdomain from @handle, extract expertise from bio
 * - GitHub: Pull repos/skills, track contributions
 * - Discord: Community integration, roles/badges
 * - LinkedIn: Professional network, B2B connections
 *
 * On first login:
 * - Auto-create vanity subdomain (@yourhandle.soulfra.com)
 * - Extract expertise tags from bio/repos
 * - Add to leaderboard
 * - Generate referral code
 * - Track social graph for connections
 */

const crypto = require('crypto');

class SocialAuth {
  constructor(options = {}) {
    this.providers = {
      twitter: {
        name: 'Twitter',
        clientId: options.twitterClientId || process.env.TWITTER_CLIENT_ID,
        clientSecret: options.twitterClientSecret || process.env.TWITTER_CLIENT_SECRET,
        authUrl: 'https://twitter.com/i/oauth2/authorize',
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        userInfoUrl: 'https://api.twitter.com/2/users/me',
        scope: 'tweet.read users.read follows.read',
        enabled: options.twitterEnabled !== false
      },
      github: {
        name: 'GitHub',
        clientId: options.githubClientId || process.env.GITHUB_CLIENT_ID,
        clientSecret: options.githubClientSecret || process.env.GITHUB_CLIENT_SECRET,
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        scope: 'read:user user:email',
        enabled: options.githubEnabled !== false
      },
      discord: {
        name: 'Discord',
        clientId: options.discordClientId || process.env.DISCORD_CLIENT_ID,
        clientSecret: options.discordClientSecret || process.env.DISCORD_CLIENT_SECRET,
        authUrl: 'https://discord.com/api/oauth2/authorize',
        tokenUrl: 'https://discord.com/api/oauth2/token',
        userInfoUrl: 'https://discord.com/api/users/@me',
        scope: 'identify email guilds',
        enabled: options.discordEnabled !== false
      },
      linkedin: {
        name: 'LinkedIn',
        clientId: options.linkedinClientId || process.env.LINKEDIN_CLIENT_ID,
        clientSecret: options.linkedinClientSecret || process.env.LINKEDIN_CLIENT_SECRET,
        authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        userInfoUrl: 'https://api.linkedin.com/v2/me',
        scope: 'r_liteprofile r_emailaddress',
        enabled: options.linkedinEnabled !== false
      }
    };

    this.users = new Map(); // userId => social profiles
    this.sessions = new Map(); // sessionId => userId
    this.oauthStates = new Map(); // state => { provider, redirectUrl, timestamp }

    this.config = {
      callbackBaseUrl: options.callbackBaseUrl || 'http://localhost:5001',
      sessionExpiry: options.sessionExpiry || 30 * 24 * 60 * 60 * 1000, // 30 days
      autoCreateSubdomain: options.autoCreateSubdomain !== false,
      extractExpertise: options.extractExpertise !== false,
      ...options
    };

    console.log('[SocialAuth] Initialized');
  }

  /**
   * Generate OAuth authorization URL
   * @param {string} provider - Provider name (twitter, github, discord, linkedin)
   * @param {string} redirectUrl - Where to redirect after auth
   */
  getAuthUrl(provider, redirectUrl = '/') {
    const providerConfig = this.providers[provider];

    if (!providerConfig || !providerConfig.enabled) {
      throw new Error(`Provider ${provider} not configured or disabled`);
    }

    // Generate secure random state
    const state = crypto.randomBytes(32).toString('hex');

    // Store state for verification
    this.oauthStates.set(state, {
      provider,
      redirectUrl,
      timestamp: Date.now()
    });

    // Clean up old states (> 10 minutes)
    this._cleanupOldStates();

    // Build OAuth URL
    const callbackUrl = `${this.config.callbackBaseUrl}/auth/callback/${provider}`;

    const params = new URLSearchParams({
      client_id: providerConfig.clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: providerConfig.scope,
      state
    });

    return `${providerConfig.authUrl}?${params.toString()}`;
  }

  /**
   * Handle OAuth callback
   * @param {string} provider - Provider name
   * @param {string} code - Auth code from provider
   * @param {string} state - State parameter for CSRF protection
   */
  async handleCallback(provider, code, state) {
    // Verify state
    const stateData = this.oauthStates.get(state);

    if (!stateData || stateData.provider !== provider) {
      throw new Error('Invalid state parameter');
    }

    // Remove used state
    this.oauthStates.delete(state);

    const providerConfig = this.providers[provider];

    // Exchange code for access token
    const tokenData = await this._exchangeCodeForToken(provider, code);

    // Get user info from provider
    const userInfo = await this._getUserInfo(provider, tokenData.access_token);

    // Create or update user profile
    const user = await this._createOrUpdateUser(provider, userInfo, tokenData);

    // Create session
    const sessionId = this._createSession(user.userId);

    return {
      success: true,
      user,
      sessionId,
      redirectUrl: stateData.redirectUrl
    };
  }

  /**
   * Exchange auth code for access token
   */
  async _exchangeCodeForToken(provider, code) {
    const providerConfig = this.providers[provider];
    const callbackUrl = `${this.config.callbackBaseUrl}/auth/callback/${provider}`;

    const response = await fetch(providerConfig.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_id: providerConfig.clientId,
        client_secret: providerConfig.clientSecret,
        code,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to exchange code for token: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get user info from provider
   */
  async _getUserInfo(provider, accessToken) {
    const providerConfig = this.providers[provider];

    const response = await fetch(providerConfig.userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Create or update user profile
   */
  async _createOrUpdateUser(provider, providerUserInfo, tokenData) {
    // Extract universal user data
    const userData = this._normalizeUserData(provider, providerUserInfo);

    // Check if user exists (by social ID or email)
    let user = this._findExistingUser(provider, userData.socialId, userData.email);

    if (user) {
      // Update existing user
      user.socialProfiles[provider] = {
        id: userData.socialId,
        username: userData.username,
        displayName: userData.displayName,
        avatarUrl: userData.avatarUrl,
        bio: userData.bio,
        followers: userData.followers,
        following: userData.following,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : null,
        updatedAt: new Date().toISOString()
      };
    } else {
      // Create new user
      const userId = this._generateUserId();

      user = {
        userId,
        email: userData.email,
        primaryProvider: provider,
        socialProfiles: {
          [provider]: {
            id: userData.socialId,
            username: userData.username,
            displayName: userData.displayName,
            avatarUrl: userData.avatarUrl,
            bio: userData.bio,
            followers: userData.followers,
            following: userData.following,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : null,
            createdAt: new Date().toISOString()
          }
        },
        vanitySubdomain: null, // Will be created if autoCreateSubdomain enabled
        expertise: [], // Will be extracted from bio/repos
        connections: [], // Will be populated from social graph
        referralCode: this._generateReferralCode(userData.username),
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      // Auto-create subdomain from handle
      if (this.config.autoCreateSubdomain && userData.username) {
        user.vanitySubdomain = this._sanitizeSubdomain(userData.username);
      }

      // Extract expertise
      if (this.config.extractExpertise && userData.bio) {
        user.expertise = this._extractExpertise(userData.bio, provider);
      }

      this.users.set(userId, user);
    }

    return user;
  }

  /**
   * Normalize user data from different providers
   */
  _normalizeUserData(provider, providerData) {
    switch (provider) {
      case 'twitter':
        return {
          socialId: providerData.data?.id || providerData.id,
          username: providerData.data?.username || providerData.username,
          displayName: providerData.data?.name || providerData.name,
          avatarUrl: providerData.data?.profile_image_url || providerData.profile_image_url,
          bio: providerData.data?.description || providerData.description || '',
          followers: providerData.data?.public_metrics?.followers_count || 0,
          following: providerData.data?.public_metrics?.following_count || 0,
          email: null // Twitter doesn't provide email via OAuth
        };

      case 'github':
        return {
          socialId: providerData.id.toString(),
          username: providerData.login,
          displayName: providerData.name || providerData.login,
          avatarUrl: providerData.avatar_url,
          bio: providerData.bio || '',
          followers: providerData.followers || 0,
          following: providerData.following || 0,
          email: providerData.email
        };

      case 'discord':
        return {
          socialId: providerData.id,
          username: providerData.username,
          displayName: providerData.global_name || providerData.username,
          avatarUrl: providerData.avatar ?
            `https://cdn.discordapp.com/avatars/${providerData.id}/${providerData.avatar}.png` : null,
          bio: providerData.bio || '',
          followers: 0,
          following: 0,
          email: providerData.email
        };

      case 'linkedin':
        return {
          socialId: providerData.id,
          username: providerData.localizedFirstName?.toLowerCase().replace(/\s/g, '') || 'user',
          displayName: `${providerData.localizedFirstName} ${providerData.localizedLastName}`,
          avatarUrl: providerData.profilePicture?.displayImage || null,
          bio: '', // LinkedIn requires additional API call for headline
          followers: 0,
          following: 0,
          email: null // Requires additional API call
        };

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Extract expertise tags from bio
   */
  _extractExpertise(bio, provider) {
    const expertise = [];
    const keywords = [
      // Programming languages
      'javascript', 'typescript', 'python', 'rust', 'go', 'solidity', 'react', 'vue', 'node',
      // Skills
      'design', 'marketing', 'sales', 'devops', 'security', 'crypto', 'web3', 'ai', 'ml',
      // Roles
      'founder', 'ceo', 'cto', 'developer', 'engineer', 'designer', 'marketer',
      // Domains
      'defi', 'nft', 'dao', 'saas', 'fintech', 'healthtech'
    ];

    const bioLower = bio.toLowerCase();

    keywords.forEach(keyword => {
      if (bioLower.includes(keyword)) {
        expertise.push(keyword);
      }
    });

    return expertise;
  }

  /**
   * Find existing user by social ID or email
   */
  _findExistingUser(provider, socialId, email) {
    for (const user of this.users.values()) {
      // Check if user has this social provider linked
      if (user.socialProfiles[provider]?.id === socialId) {
        return user;
      }

      // Check email match (if provided)
      if (email && user.email === email) {
        return user;
      }
    }

    return null;
  }

  /**
   * Create session
   */
  _createSession(userId) {
    const sessionId = crypto.randomBytes(32).toString('hex');

    this.sessions.set(sessionId, {
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.sessionExpiry
    });

    return sessionId;
  }

  /**
   * Verify session
   */
  verifySession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { valid: false, error: 'Session not found' };
    }

    if (session.expiresAt < Date.now()) {
      this.sessions.delete(sessionId);
      return { valid: false, error: 'Session expired' };
    }

    const user = this.users.get(session.userId);

    return { valid: true, user };
  }

  /**
   * Logout (destroy session)
   */
  logout(sessionId) {
    this.sessions.delete(sessionId);
    return { success: true };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  _generateUserId() {
    return `user_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  _generateReferralCode(username) {
    return `${username}_${crypto.randomBytes(4).toString('hex')}`.toLowerCase();
  }

  _sanitizeSubdomain(username) {
    return username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 63);
  }

  _cleanupOldStates() {
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);

    for (const [state, data] of this.oauthStates.entries()) {
      if (data.timestamp < tenMinutesAgo) {
        this.oauthStates.delete(state);
      }
    }
  }
}

module.exports = SocialAuth;
