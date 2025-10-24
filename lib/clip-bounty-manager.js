/**
 * Clip Bounty Manager
 *
 * Fan economy system where viewers get PAID to clip best moments from streams.
 *
 * How It Works:
 * 1. Fan watches stream, marks timestamp as "clipworthy" (via emoji or manual)
 * 2. System auto-generates clip (video + transcription + UTM tracking)
 * 3. Fan submits clip to platforms (TikTok, YouTube Shorts, Twitter)
 * 4. Clip goes viral → earns views/engagement
 * 5. Fan gets paid bounty: views × $0.0025 + engagement bonus
 * 6. Creator gets 70%, fan gets 30%
 *
 * Bounty Formula:
 * Base bounty = views × $0.0025
 * Engagement multiplier = (likes + comments + shares) / views
 * Total = base × (1 + engagement_multiplier)
 *
 * Example:
 * - Clip gets 50k views, 5k likes, 500 comments, 1k shares
 * - Base: 50k × $0.0025 = $125
 * - Engagement: (5k + 500 + 1k) / 50k = 0.13 → 13% bonus
 * - Total: $125 × 1.13 = $141.25
 * - Fan gets: $141.25 × 0.30 = $42.38
 * - Creator gets: $141.25 × 0.70 = $98.88
 *
 * Integrates with:
 * - StreamEmojiController (lib/stream-emoji-controller.js)
 * - UTMCampaignGenerator (lib/utm-campaign-generator.js)
 * - VoiceActorManager (lib/voice-actor-manager.js) for audio
 * - ContentPublisher (lib/content-publisher.js) for distribution
 *
 * Usage:
 *   const manager = new ClipBountyManager({ db, utmGenerator });
 *
 *   // Fan submits clip
 *   const clip = await manager.submitClip({
 *     streamId: 'stream_123',
 *     userId: 'fan_456',
 *     startTime: 300,
 *     endTime: 330,
 *     title: 'Zero-Knowledge Proofs Explained',
 *     keywords: ['zkp', 'privacy', 'halloween', 'crypto']
 *   });
 *
 *   // Track clip performance
 *   await manager.updateClipMetrics({
 *     clipId: clip.id,
 *     views: 50000,
 *     likes: 5000,
 *     comments: 500,
 *     shares: 1000
 *   });
 *
 *   // Calculate bounty
 *   const bounty = await manager.calculateBounty(clip.id);
 *   // → { total: 141.25, fanShare: 42.38, creatorShare: 98.88 }
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class ClipBountyManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.utmGenerator = options.utmGenerator;
    this.voiceActorManager = options.voiceActorManager;
    this.contentPublisher = options.contentPublisher;

    // Crypto payment integrations
    this.soulboundToken = options.soulboundToken; // SoulboundClipToken
    this.paymentRouter = options.paymentRouter; // MultiChainPaymentRouter
    this.cryptoMixer = options.cryptoMixer; // CryptoVaultMixer

    // Bounty config
    this.config = {
      // Revenue split
      creatorShare: 0.70, // 70% to creator
      fanShare: 0.30, // 30% to fan

      // Pricing
      baseRatePerView: 0.0025, // $0.0025 per view
      engagementBonus: true, // Enable engagement multiplier
      viralBonus: {
        enabled: true,
        threshold: 100000, // 100k views = viral
        multiplier: 1.5 // 50% bonus for viral clips
      },

      // Halloween special (Oct 22 → Nov 2)
      halloweenBonus: {
        enabled: true,
        startDate: new Date('2025-10-22'),
        endDate: new Date('2025-11-02'),
        multiplier: 2.0 // 2x bounties during Halloween
      },

      // Quality thresholds
      minClipLength: 10, // 10 seconds minimum
      maxClipLength: 60, // 60 seconds maximum
      minViewsForPayout: 1000, // Need 1k views to get paid

      // Crypto payment options
      cryptoEnabled: options.cryptoEnabled !== false,
      defaultPaymentChain: 'auto', // auto | BTC | ETH | SOL | XMR
      privacyLevel: 'medium', // low | medium | high | maximum
      autoMintNFT: true, // Automatically mint soulbound NFT on clip submission

      // Payout timing
      payoutDelay: 7 * 24 * 60 * 60 * 1000, // 7 days (let metrics stabilize)
      minPayoutAmount: 10 // $10 minimum payout
    };

    // Clip status tracking
    this.clips = new Map(); // clipId → clip data

    console.log('[ClipBountyManager] Initialized');
  }

  /**
   * Submit clip from fan
   */
  async submitClip(options) {
    const {
      streamId,
      userId,
      startTime, // seconds
      endTime, // seconds
      title,
      description = null,
      keywords = [],
      platform = 'tiktok', // Where fan will post it
      metadata = {}
    } = options;

    // Validate clip length
    const duration = endTime - startTime;
    if (duration < this.config.minClipLength) {
      throw new Error(`Clip too short (min ${this.config.minClipLength}s)`);
    }
    if (duration > this.config.maxClipLength) {
      throw new Error(`Clip too long (max ${this.config.maxClipLength}s)`);
    }

    const clipId = crypto.randomBytes(16).toString('hex');

    const clip = {
      clipId,
      streamId,
      userId,
      startTime,
      endTime,
      duration,
      title,
      description,
      keywords,
      platform,
      status: 'pending', // pending → processing → ready → published → paid
      metrics: {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        engagementRate: 0
      },
      bounty: {
        calculated: false,
        amount: 0,
        fanShare: 0,
        creatorShare: 0,
        paid: false
      },
      utmTracking: {},
      submittedAt: Date.now(),
      metadata
    };

    // Generate UTM tracking URLs
    if (this.utmGenerator) {
      const campaign = `clip-${clipId.substring(0, 8)}`;

      clip.utmTracking = {
        campaign,
        source: platform,
        medium: 'video',
        content: `fan-${userId.substring(0, 8)}`,
        term: keywords.join('-')
      };

      // Generate tracked URL for clip
      clip.trackedUrl = this.utmGenerator.addUTMParams({
        url: `https://yourdomain.com/clip/${clipId}`,
        ...clip.utmTracking
      });
    }

    // Save to database
    if (this.db) {
      await this._saveClip(clip);
    }

    this.clips.set(clipId, clip);

    // Mint soulbound NFT if crypto enabled
    if (this.config.cryptoEnabled && this.config.autoMintNFT && this.soulboundToken) {
      try {
        const contentHash = crypto.createHash('sha256')
          .update(JSON.stringify({ clipId, streamId, startTime, endTime, userId }))
          .digest('hex');

        const token = await this.soulboundToken.mint({
          clipId,
          clipper: userId, // Wallet address
          contentHash,
          metadata: {
            title,
            duration,
            keywords,
            submittedAt: clip.submittedAt
          }
        });

        clip.nftTokenId = token.tokenId;
        clip.nftMinted = true;

        console.log(`[ClipBountyManager] Soulbound NFT minted: ${token.tokenId} for clip ${clipId}`);

      } catch (error) {
        console.error(`[ClipBountyManager] NFT minting failed for ${clipId}:`, error.message);
        // Don't fail clip submission if NFT fails
        clip.nftMinted = false;
      }
    }

    this.emit('clip:submitted', {
      clipId,
      userId,
      streamId,
      duration,
      nftMinted: clip.nftMinted
    });

    console.log(`[ClipBountyManager] Clip submitted: ${clipId} (${duration}s)`);

    return clip;
  }

  /**
   * Update clip metrics (views, engagement)
   */
  async updateClipMetrics(options) {
    const {
      clipId,
      views = 0,
      likes = 0,
      comments = 0,
      shares = 0,
      timestamp = Date.now()
    } = options;

    const clip = this.clips.get(clipId) || await this._loadClip(clipId);

    if (!clip) {
      throw new Error(`Clip not found: ${clipId}`);
    }

    // Update metrics
    clip.metrics.views = views;
    clip.metrics.likes = likes;
    clip.metrics.comments = comments;
    clip.metrics.shares = shares;

    // Calculate engagement rate
    if (views > 0) {
      clip.metrics.engagementRate = (likes + comments + shares) / views;
    }

    clip.metrics.lastUpdated = timestamp;

    // Auto-calculate bounty if views threshold met
    if (views >= this.config.minViewsForPayout && !clip.bounty.calculated) {
      await this.calculateBounty(clipId);
    }

    // Save updates
    if (this.db) {
      await this._updateClipMetrics(clip);
    }

    this.emit('metrics:updated', {
      clipId,
      views,
      engagementRate: clip.metrics.engagementRate
    });

    console.log(`[ClipBountyManager] Metrics updated: ${clipId} → ${views} views`);

    return clip;
  }

  /**
   * Calculate bounty for clip
   */
  async calculateBounty(clipId) {
    const clip = this.clips.get(clipId) || await this._loadClip(clipId);

    if (!clip) {
      throw new Error(`Clip not found: ${clipId}`);
    }

    const { views, engagementRate } = clip.metrics;

    // Base bounty
    let baseBounty = views * this.config.baseRatePerView;

    // Engagement multiplier
    let multiplier = 1.0;

    if (this.config.engagementBonus) {
      multiplier += engagementRate;
    }

    // Viral bonus
    if (this.config.viralBonus.enabled && views >= this.config.viralBonus.threshold) {
      multiplier *= this.config.viralBonus.multiplier;
    }

    // Halloween bonus
    if (this._isHalloweenPeriod(clip.submittedAt)) {
      multiplier *= this.config.halloweenBonus.multiplier;
      console.log(`[ClipBountyManager] 🎃 Halloween bonus applied! ${this.config.halloweenBonus.multiplier}x`);
    }

    const totalBounty = baseBounty * multiplier;

    // Split revenue
    const creatorShare = totalBounty * this.config.creatorShare;
    const fanShare = totalBounty * this.config.fanShare;

    // Update clip
    clip.bounty.calculated = true;
    clip.bounty.amount = totalBounty;
    clip.bounty.creatorShare = creatorShare;
    clip.bounty.fanShare = fanShare;
    clip.bounty.multiplier = multiplier;
    clip.bounty.calculatedAt = Date.now();

    // Check if eligible for payout
    const age = Date.now() - clip.submittedAt;
    const eligibleForPayout =
      age >= this.config.payoutDelay &&
      fanShare >= this.config.minPayoutAmount;

    clip.bounty.eligibleForPayout = eligibleForPayout;

    // Save updates
    if (this.db) {
      await this._updateClipBounty(clip);
    }

    this.emit('bounty:calculated', {
      clipId,
      totalBounty,
      fanShare,
      creatorShare,
      multiplier,
      eligibleForPayout
    });

    console.log(`[ClipBountyManager] Bounty calculated: ${clipId} → $${totalBounty.toFixed(2)} (fan: $${fanShare.toFixed(2)})`);

    return {
      total: totalBounty,
      creatorShare,
      fanShare,
      multiplier,
      eligibleForPayout
    };
  }

  /**
   * Pay bounty to fan
   */
  async payBounty(clipId, options = {}) {
    const clip = this.clips.get(clipId) || await this._loadClip(clipId);

    if (!clip) {
      throw new Error(`Clip not found: ${clipId}`);
    }

    if (clip.bounty.paid) {
      throw new Error('Bounty already paid');
    }

    if (!clip.bounty.eligibleForPayout) {
      throw new Error('Not eligible for payout yet');
    }

    // Payment options
    const {
      paymentMethod = 'crypto', // 'crypto' | 'stripe' | 'paypal'
      wallet = clip.userId, // Wallet address (defaults to userId)
      paymentChain = this.config.defaultPaymentChain,
      privacy = this.config.privacyLevel,
      speed = 'normal'
    } = options;

    let paymentResult = null;

    // Crypto payment (preferred method)
    if (paymentMethod === 'crypto' && this.config.cryptoEnabled && this.paymentRouter) {
      try {
        console.log(`[ClipBountyManager] Routing crypto payment for clip ${clipId}`);

        // Route payment through multi-chain router
        const payment = await this.paymentRouter.route({
          from: 'platform_treasury', // Platform wallet
          to: wallet,
          amount: clip.bounty.fanShare,
          currency: 'USD',
          reason: 'clip_bounty',
          clipId,
          preferences: {
            privacy,
            speed,
            cost: 'minimize'
          },
          metadata: {
            views: clip.metrics.views,
            engagement: clip.metrics.engagementRate,
            viral: clip.metrics.views >= this.config.viralBonus.threshold,
            halloween: this._isHalloweenPeriod(clip.submittedAt)
          }
        });

        // Execute payment on-chain
        paymentResult = await this.paymentRouter.execute(payment.paymentId);

        // Update soulbound NFT with earnings
        if (this.soulboundToken && clip.nftTokenId) {
          await this.soulboundToken.updateMetrics({
            tokenId: clip.nftTokenId,
            views: clip.metrics.views,
            bountyEarned: clip.bounty.fanShare,
            viral: clip.metrics.views >= this.config.viralBonus.threshold
          });
        }

        console.log(`[ClipBountyManager] Crypto payment sent: ${payment.chain} (tx: ${paymentResult.txHash})`);

        clip.bounty.paymentChain = payment.chain;
        clip.bounty.paymentTxHash = paymentResult.txHash;
        clip.bounty.paymentMixed = payment.needsMixing;

      } catch (error) {
        console.error(`[ClipBountyManager] Crypto payment failed for ${clipId}:`, error.message);
        throw new Error(`Payment failed: ${error.message}`);
      }
    } else {
      // Fallback: traditional payment (Stripe, PayPal, etc.)
      console.log(`[ClipBountyManager] Traditional payment for clip ${clipId}: ${paymentMethod}`);
      // TODO: Integrate with Stripe/PayPal APIs
    }

    clip.bounty.paid = true;
    clip.bounty.paidAt = Date.now();
    clip.bounty.paymentMethod = paymentMethod;
    clip.status = 'paid';

    // Save updates
    if (this.db) {
      await this._updateClipBounty(clip);
    }

    this.emit('bounty:paid', {
      clipId,
      userId: clip.userId,
      amount: clip.bounty.fanShare,
      paymentMethod,
      chain: clip.bounty.paymentChain,
      txHash: clip.bounty.paymentTxHash,
      nftUpdated: !!clip.nftTokenId
    });

    console.log(`[ClipBountyManager] Bounty paid: ${clipId} → $${clip.bounty.fanShare.toFixed(2)} to ${clip.userId}`);

    return {
      success: true,
      amount: clip.bounty.fanShare,
      clipId,
      userId: clip.userId,
      paymentMethod,
      paymentChain: clip.bounty.paymentChain,
      txHash: clip.bounty.paymentTxHash,
      paymentResult
    };
  }

  /**
   * Get top performing clips
   */
  async getTopClips(options = {}) {
    const {
      metric = 'views', // views | engagement | bounty
      limit = 10,
      userId = null,
      streamId = null
    } = options;

    let clips = Array.from(this.clips.values());

    // Filter by user
    if (userId) {
      clips = clips.filter(c => c.userId === userId);
    }

    // Filter by stream
    if (streamId) {
      clips = clips.filter(c => c.streamId === streamId);
    }

    // Sort by metric
    clips.sort((a, b) => {
      switch (metric) {
        case 'views':
          return b.metrics.views - a.metrics.views;
        case 'engagement':
          return b.metrics.engagementRate - a.metrics.engagementRate;
        case 'bounty':
          return b.bounty.amount - a.bounty.amount;
        default:
          return b.metrics.views - a.metrics.views;
      }
    });

    return clips.slice(0, limit);
  }

  /**
   * Get fan earnings summary
   */
  async getFanEarnings(userId) {
    const userClips = Array.from(this.clips.values()).filter(c => c.userId === userId);

    const total = userClips.reduce((sum, clip) => sum + clip.bounty.fanShare, 0);
    const paid = userClips.filter(c => c.bounty.paid).reduce((sum, clip) => sum + clip.bounty.fanShare, 0);
    const pending = total - paid;

    const stats = {
      userId,
      totalClips: userClips.length,
      totalEarnings: total,
      paidEarnings: paid,
      pendingEarnings: pending,
      totalViews: userClips.reduce((sum, clip) => sum + clip.metrics.views, 0),
      avgViewsPerClip: userClips.length > 0 ? userClips.reduce((sum, clip) => sum + clip.metrics.views, 0) / userClips.length : 0,
      bestClip: userClips.length > 0 ? userClips.sort((a, b) => b.metrics.views - a.metrics.views)[0] : null
    };

    return stats;
  }

  /**
   * Get leaderboard (top earners)
   */
  async getLeaderboard(limit = 10) {
    const userEarnings = new Map();

    for (const clip of this.clips.values()) {
      const current = userEarnings.get(clip.userId) || {
        userId: clip.userId,
        totalEarnings: 0,
        clipCount: 0,
        totalViews: 0
      };

      current.totalEarnings += clip.bounty.fanShare;
      current.clipCount++;
      current.totalViews += clip.metrics.views;

      userEarnings.set(clip.userId, current);
    }

    const leaderboard = Array.from(userEarnings.values())
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .slice(0, limit);

    return leaderboard;
  }

  /**
   * Check if date is during Halloween period
   */
  _isHalloweenPeriod(timestamp) {
    if (!this.config.halloweenBonus.enabled) return false;

    const date = new Date(timestamp);
    return date >= this.config.halloweenBonus.startDate &&
           date <= this.config.halloweenBonus.endDate;
  }

  /**
   * Save clip to database
   */
  async _saveClip(clip) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO stream_clips (
          clip_id,
          stream_id,
          user_id,
          start_time,
          end_time,
          duration,
          title,
          description,
          keywords,
          platform,
          status,
          utm_campaign,
          tracked_url,
          submitted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        clip.clipId,
        clip.streamId,
        clip.userId,
        clip.startTime,
        clip.endTime,
        clip.duration,
        clip.title,
        clip.description,
        JSON.stringify(clip.keywords),
        clip.platform,
        clip.status,
        clip.utmTracking.campaign,
        clip.trackedUrl,
        new Date(clip.submittedAt)
      ]);

    } catch (error) {
      if (!error.message.includes('does not exist')) {
        console.error('[ClipBountyManager] Save clip error:', error.message);
      }
    }
  }

  /**
   * Load clip from database
   */
  async _loadClip(clipId) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        SELECT * FROM stream_clips WHERE clip_id = $1
      `, [clipId]);

      if (result.rows.length === 0) return null;

      const row = result.rows[0];

      // Reconstruct clip object
      const clip = {
        clipId: row.clip_id,
        streamId: row.stream_id,
        userId: row.user_id,
        startTime: row.start_time,
        endTime: row.end_time,
        duration: row.duration,
        title: row.title,
        description: row.description,
        keywords: JSON.parse(row.keywords || '[]'),
        platform: row.platform,
        status: row.status,
        metrics: {
          views: row.views || 0,
          likes: row.likes || 0,
          comments: row.comments || 0,
          shares: row.shares || 0,
          engagementRate: row.engagement_rate || 0
        },
        bounty: {
          calculated: row.bounty_calculated || false,
          amount: parseFloat(row.bounty_amount || 0),
          fanShare: parseFloat(row.fan_share || 0),
          creatorShare: parseFloat(row.creator_share || 0),
          paid: row.bounty_paid || false
        },
        utmTracking: {
          campaign: row.utm_campaign
        },
        trackedUrl: row.tracked_url,
        submittedAt: new Date(row.submitted_at).getTime()
      };

      this.clips.set(clipId, clip);

      return clip;

    } catch (error) {
      console.error('[ClipBountyManager] Load clip error:', error.message);
      return null;
    }
  }

  /**
   * Update clip metrics in database
   */
  async _updateClipMetrics(clip) {
    if (!this.db) return;

    try {
      await this.db.query(`
        UPDATE stream_clips
        SET views = $1, likes = $2, comments = $3, shares = $4, engagement_rate = $5, metrics_updated_at = NOW()
        WHERE clip_id = $6
      `, [
        clip.metrics.views,
        clip.metrics.likes,
        clip.metrics.comments,
        clip.metrics.shares,
        clip.metrics.engagementRate,
        clip.clipId
      ]);

    } catch (error) {
      if (!error.message.includes('does not exist')) {
        console.error('[ClipBountyManager] Update metrics error:', error.message);
      }
    }
  }

  /**
   * Update clip bounty in database
   */
  async _updateClipBounty(clip) {
    if (!this.db) return;

    try {
      await this.db.query(`
        UPDATE stream_clips
        SET bounty_calculated = $1, bounty_amount = $2, fan_share = $3, creator_share = $4,
            bounty_paid = $5, bounty_calculated_at = $6, bounty_paid_at = $7
        WHERE clip_id = $8
      `, [
        clip.bounty.calculated,
        clip.bounty.amount,
        clip.bounty.fanShare,
        clip.bounty.creatorShare,
        clip.bounty.paid,
        clip.bounty.calculatedAt ? new Date(clip.bounty.calculatedAt) : null,
        clip.bounty.paidAt ? new Date(clip.bounty.paidAt) : null,
        clip.clipId
      ]);

    } catch (error) {
      if (!error.message.includes('does not exist')) {
        console.error('[ClipBountyManager] Update bounty error:', error.message);
      }
    }
  }
}

module.exports = ClipBountyManager;
