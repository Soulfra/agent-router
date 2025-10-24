/**
 * Contract Social Share
 *
 * Share signed contracts to social media platforms (Twitter, Instagram, TikTok, LinkedIn).
 * Generate shareable cards, videos, and QR codes for UGC influencer content.
 *
 * Features:
 * - Twitter sharing with contract summary
 * - Instagram/TikTok story cards (image + QR code)
 * - LinkedIn professional posts
 * - Shareable contract cards (PNG/JPG)
 * - Video generation with contract timeline
 * - QR codes for verification
 * - Hashtag generation
 * - Analytics tracking
 *
 * Integration:
 * - QR Generator (lib/qr-generator.js) - Verification QR codes
 * - Dev Ragebait Generator (lib/dev-ragebait-generator.js) - Shareable cards
 * - Contract data from Ollama sessions
 */

const QRGenerator = require('./qr-generator');
const crypto = require('crypto');

class ContractSocialShare {
  constructor(config = {}) {
    this.db = config.db;
    this.verbose = config.verbose || false;

    // QR generator
    this.qrGenerator = new QRGenerator();

    // Social platforms
    this.platforms = {
      twitter: config.twitter || false,
      instagram: config.instagram || false,
      tiktok: config.tiktok || false,
      linkedin: config.linkedin || false
    };

    // Base URL for share links
    this.baseUrl = config.baseUrl || process.env.BASE_URL || 'http://localhost:5001';
  }

  // ============================================================================
  // TWITTER SHARING
  // ============================================================================

  /**
   * Generate Twitter share link
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} options - Share options
   * @returns {Promise<Object>} Share data
   */
  async shareToTwitter(sessionId, options = {}) {
    try {
      const {
        customText = null,
        hashtags = []
      } = options;

      // Get contract data
      const contractData = await this._getContractData(sessionId);

      // Generate tweet text
      const tweetText = customText || this._generateTweetText(contractData);

      // Generate hashtags
      const allHashtags = [...hashtags, ...this._generateHashtags(contractData)];

      // Create Twitter share URL
      const shareUrl = new URL('https://twitter.com/intent/tweet');
      shareUrl.searchParams.set('text', tweetText);
      shareUrl.searchParams.set('hashtags', allHashtags.join(','));
      shareUrl.searchParams.set('url', `${this.baseUrl}${contractData.publicShareUrl}`);

      this._log(`🐦 Twitter share link generated for ${sessionId}`);

      return {
        success: true,
        platform: 'twitter',
        shareUrl: shareUrl.toString(),
        text: tweetText,
        hashtags: allHashtags,
        verificationUrl: `${this.baseUrl}${contractData.publicShareUrl}`
      };

    } catch (error) {
      console.error('[ContractSocialShare] Twitter share error:', error.message);
      throw error;
    }
  }

  /**
   * Generate tweet text from contract data
   *
   * @param {Object} contractData - Contract data
   * @returns {string} Tweet text
   */
  _generateTweetText(contractData) {
    const cost = contractData.totalCost.toFixed(2);
    const model = contractData.primaryModel.split(':').pop();

    return `✅ Just signed an AI contract on ${model}!\n\n💰 Cost: $${cost}\n💬 Messages: ${contractData.messageCount}\n🔐 Cryptographically verified with Soulfra\n\nCheck it out:`;
  }

  // ============================================================================
  // INSTAGRAM/TIKTOK CARDS
  // ============================================================================

  /**
   * Generate shareable card for Instagram/TikTok
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} options - Card options
   * @returns {Promise<Object>} Card data
   */
  async generateShareCard(sessionId, options = {}) {
    try {
      const {
        format = 'square', // 'square', 'story', 'post'
        theme = 'gradient', // 'gradient', 'dark', 'light'
        includeQR = true
      } = options;

      // Get contract data
      const contractData = await this._getContractData(sessionId);

      // Generate QR code
      let qrCodeDataUrl = null;
      if (includeQR) {
        qrCodeDataUrl = await this.qrGenerator.generate({
          data: `${this.baseUrl}${contractData.publicShareUrl}`,
          size: 200,
          format: 'data-url'
        });
      }

      // Generate card HTML
      const cardHtml = this._generateCardHtml(contractData, {
        format,
        theme,
        qrCodeDataUrl
      });

      this._log(`📸 Share card generated for ${sessionId}`);

      return {
        success: true,
        sessionId,
        cardHtml,
        format,
        theme,
        includeQR,
        dimensions: this._getCardDimensions(format),
        instructions: 'Use screenshot tool or HTML-to-image converter to save as PNG/JPG'
      };

    } catch (error) {
      console.error('[ContractSocialShare] Generate card error:', error.message);
      throw error;
    }
  }

  /**
   * Generate card HTML
   *
   * @param {Object} contractData - Contract data
   * @param {Object} options - Card options
   * @returns {string} Card HTML
   */
  _generateCardHtml(contractData, options = {}) {
    const { format, theme, qrCodeDataUrl } = options;

    const dimensions = this._getCardDimensions(format);
    const colors = this._getThemeColors(theme);

    const sha256Short = contractData.soulfraHash?.sha256?.substring(0, 12) || 'N/A';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contract Card</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${dimensions.width}px;
      height: ${dimensions.height}px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${colors.background};
    }
    .card {
      width: 100%;
      height: 100%;
      padding: 60px;
      color: ${colors.text};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .header {
      text-align: center;
    }
    .icon {
      font-size: 80px;
      margin-bottom: 20px;
    }
    .title {
      font-size: 48px;
      font-weight: 700;
      margin-bottom: 16px;
      line-height: 1.2;
    }
    .subtitle {
      font-size: 28px;
      opacity: 0.9;
    }
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin: 40px 0;
    }
    .stat {
      text-align: center;
      padding: 30px;
      background: ${colors.statBg};
      border-radius: 20px;
    }
    .stat-value {
      font-size: 56px;
      font-weight: 700;
      margin-bottom: 8px;
      color: ${colors.accent};
    }
    .stat-label {
      font-size: 22px;
      opacity: 0.8;
    }
    .footer {
      text-align: center;
    }
    .qr-container {
      margin-bottom: 20px;
    }
    .qr-code {
      width: 200px;
      height: 200px;
      padding: 20px;
      background: white;
      border-radius: 20px;
    }
    .proof {
      font-size: 18px;
      opacity: 0.8;
      margin-top: 20px;
      font-family: 'Courier New', monospace;
    }
    .branding {
      font-size: 24px;
      font-weight: 600;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon">🔏</div>
      <div class="title">Contract Signed</div>
      <div class="subtitle">${contractData.sessionName}</div>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">$${contractData.totalCost.toFixed(2)}</div>
        <div class="stat-label">Total Cost</div>
      </div>
      <div class="stat">
        <div class="stat-value">${contractData.messageCount}</div>
        <div class="stat-label">Messages</div>
      </div>
    </div>

    <div class="footer">
      ${qrCodeDataUrl ? `
        <div class="qr-container">
          <img src="${qrCodeDataUrl}" class="qr-code" alt="Verification QR">
        </div>
      ` : ''}
      <div class="proof">
        🔐 Soulfra Proof: ${sha256Short}...
      </div>
      <div class="branding">
        Built with ❤️ by CALOS
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Get card dimensions based on format
   *
   * @param {string} format - Format ('square', 'story', 'post')
   * @returns {Object} Dimensions
   */
  _getCardDimensions(format) {
    const dimensions = {
      square: { width: 1080, height: 1080 }, // Instagram square
      story: { width: 1080, height: 1920 },  // Instagram/TikTok story
      post: { width: 1080, height: 1350 }    // Instagram post
    };

    return dimensions[format] || dimensions.square;
  }

  /**
   * Get theme colors
   *
   * @param {string} theme - Theme name
   * @returns {Object} Colors
   */
  _getThemeColors(theme) {
    const themes = {
      gradient: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        text: 'white',
        statBg: 'rgba(255,255,255,0.2)',
        accent: '#fbbf24'
      },
      dark: {
        background: '#111827',
        text: 'white',
        statBg: '#1f2937',
        accent: '#667eea'
      },
      light: {
        background: '#f9fafb',
        text: '#111827',
        statBg: 'white',
        accent: '#667eea'
      }
    };

    return themes[theme] || themes.gradient;
  }

  // ============================================================================
  // LINKEDIN SHARING
  // ============================================================================

  /**
   * Generate LinkedIn share link
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} options - Share options
   * @returns {Promise<Object>} Share data
   */
  async shareToLinkedIn(sessionId, options = {}) {
    try {
      const {
        customText = null
      } = options;

      // Get contract data
      const contractData = await this._getContractData(sessionId);

      // Generate professional post text
      const postText = customText || this._generateLinkedInText(contractData);

      // Create LinkedIn share URL
      const shareUrl = new URL('https://www.linkedin.com/sharing/share-offsite/');
      shareUrl.searchParams.set('url', `${this.baseUrl}${contractData.publicShareUrl}`);

      this._log(`💼 LinkedIn share link generated for ${sessionId}`);

      return {
        success: true,
        platform: 'linkedin',
        shareUrl: shareUrl.toString(),
        text: postText,
        verificationUrl: `${this.baseUrl}${contractData.publicShareUrl}`
      };

    } catch (error) {
      console.error('[ContractSocialShare] LinkedIn share error:', error.message);
      throw error;
    }
  }

  /**
   * Generate LinkedIn post text
   *
   * @param {Object} contractData - Contract data
   * @returns {string} Post text
   */
  _generateLinkedInText(contractData) {
    const signedDate = new Date(contractData.signedAt).toLocaleDateString();

    return `
🚀 Just completed an AI-powered contract workflow!

I'm excited to share that I've successfully implemented a DocuSign-like contract system for AI work sessions using CALOS.

Key highlights:
✅ Cryptographically signed with Soulfra 5-layer proof
✅ Multi-device sync (phone + computer)
✅ Real-time collaboration
✅ Immutable record for compliance

Session details:
• Model: ${contractData.primaryModel}
• Messages: ${contractData.messageCount}
• Cost: $${contractData.totalCost.toFixed(2)}
• Signed: ${signedDate}

This represents the future of transparent, verifiable AI work. The contract can be independently verified at any time using cryptographic proof.

#AI #Blockchain #Innovation #TechLeadership #Automation
    `.trim();
  }

  // ============================================================================
  // HASHTAG GENERATION
  // ============================================================================

  /**
   * Generate hashtags from contract data
   *
   * @param {Object} contractData - Contract data
   * @returns {Array<string>} Hashtags
   */
  _generateHashtags(contractData) {
    const hashtags = ['AI', 'Contract', 'Soulfra', 'CALOS'];

    // Add model-specific hashtags
    if (contractData.primaryModel.includes('ollama')) {
      hashtags.push('Ollama', 'LocalAI');
    } else if (contractData.primaryModel.includes('gpt')) {
      hashtags.push('OpenAI', 'ChatGPT');
    } else if (contractData.primaryModel.includes('claude')) {
      hashtags.push('Anthropic', 'Claude');
    }

    // Add cost tier
    if (contractData.totalCost === 0) {
      hashtags.push('Free');
    } else if (contractData.totalCost < 1) {
      hashtags.push('Affordable');
    }

    // Add tech hashtags
    hashtags.push('Blockchain', 'Crypto', 'Web3', 'Automation');

    return hashtags;
  }

  // ============================================================================
  // CONTRACT DATA
  // ============================================================================

  /**
   * Get contract data for sharing
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Contract data
   */
  async _getContractData(sessionId) {
    try {
      const sessionResult = await this.db.query(`
        SELECT
          session_id,
          session_name,
          primary_model,
          contract_status,
          version,
          total_cost_usd,
          signed_at,
          soulfra_hash,
          public_share_url,
          is_immutable
        FROM ollama_streaming_sessions
        WHERE session_id = $1
      `, [sessionId]);

      if (sessionResult.rows.length === 0) {
        throw new Error('Session not found');
      }

      const session = sessionResult.rows[0];

      // Verify signed
      if (session.contract_status !== 'signed' || !session.is_immutable) {
        throw new Error('Contract must be signed before sharing');
      }

      // Get message count
      const messagesResult = await this.db.query(`
        SELECT COUNT(*) as count
        FROM ollama_session_messages
        WHERE session_id = $1
      `, [sessionId]);

      const messageCount = parseInt(messagesResult.rows[0].count);

      return {
        sessionId: session.session_id,
        sessionName: session.session_name || 'Unnamed Session',
        primaryModel: session.primary_model,
        contractStatus: session.contract_status,
        version: session.version,
        totalCost: parseFloat(session.total_cost_usd || 0),
        signedAt: session.signed_at,
        soulfraHash: session.soulfra_hash,
        publicShareUrl: session.public_share_url,
        isImmutable: session.is_immutable,
        messageCount
      };

    } catch (error) {
      console.error('[ContractSocialShare] Get contract data error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  /**
   * Track share event
   *
   * @param {string} sessionId - Session UUID
   * @param {string} platform - Platform name
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async trackShare(sessionId, platform, userId) {
    try {
      // Track share in database
      await this.db.query(`
        INSERT INTO social_shares (
          session_id,
          user_id,
          platform,
          shared_at
        ) VALUES ($1, $2, $3, NOW())
      `, [sessionId, userId, platform]);

      // Update session share count
      await this.db.query(`
        UPDATE ollama_streaming_sessions
        SET metadata = COALESCE(metadata, '{}'::jsonb) ||
          jsonb_build_object('shareCount', COALESCE((metadata->>'shareCount')::int, 0) + 1)
        WHERE session_id = $1
      `, [sessionId]);

      this._log(`📊 Share tracked: ${platform} for ${sessionId}`);

    } catch (error) {
      console.error('[ContractSocialShare] Track share error:', error.message);
      // Don't throw - tracking failures should not block sharing
    }
  }

  /**
   * Get share analytics for session
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Analytics
   */
  async getShareAnalytics(sessionId) {
    try {
      const result = await this.db.query(`
        SELECT
          platform,
          COUNT(*) as share_count,
          MAX(shared_at) as last_shared
        FROM social_shares
        WHERE session_id = $1
        GROUP BY platform
        ORDER BY share_count DESC
      `, [sessionId]);

      const totalShares = result.rows.reduce((sum, row) => sum + parseInt(row.share_count), 0);

      return {
        sessionId,
        totalShares,
        byPlatform: result.rows.map(row => ({
          platform: row.platform,
          shareCount: parseInt(row.share_count),
          lastShared: row.last_shared
        }))
      };

    } catch (error) {
      console.error('[ContractSocialShare] Get analytics error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Log message if verbose mode enabled
   * @private
   */
  _log(message) {
    if (this.verbose) {
      console.log(`[ContractSocialShare] ${message}`);
    }
  }
}

module.exports = ContractSocialShare;
