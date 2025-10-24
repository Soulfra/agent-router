/**
 * Discord Invite Rotator
 *
 * Randomly rotates Discord invites across all 12 BillionDollarGame brands
 * for cross-promotion and network effect.
 *
 * Features:
 * - Random invite selection
 * - Weighted rotation (prioritize new brands)
 * - Tracking (which invites get clicked)
 * - A/B testing (compare conversion rates)
 */

class DiscordInviteRotator {
  constructor(options = {}) {
    // Discord invite links for each brand
    this.invites = {
      'soulfra.com': {
        invite: 'https://discord.gg/soulfra',
        fallback: '/discord/soulfra',
        weight: 2, // Higher weight = shown more often
        brandName: 'Soulfra',
        description: 'Universal identity without KYC',
        clicks: 0,
        conversions: 0 // Join count
      },
      'calriven.com': {
        invite: 'https://discord.gg/calriven',
        fallback: '/discord/calriven',
        weight: 2,
        brandName: 'Calriven',
        description: 'AI reasoning platform',
        clicks: 0,
        conversions: 0
      },
      'deathtodata.com': {
        invite: 'https://discord.gg/deathtodata',
        fallback: '/discord/deathtodata',
        weight: 3, // Prioritize this one
        brandName: 'DeathToData',
        description: 'Privacy-first search',
        clicks: 0,
        conversions: 0
      },
      'finishthisidea.com': {
        invite: 'https://discord.gg/finishthisidea',
        fallback: '/discord/finishthisidea',
        weight: 1,
        brandName: 'FinishThisIdea',
        description: 'Crowdsource your side hustle',
        clicks: 0,
        conversions: 0
      },
      'finishthisrepo.com': {
        invite: 'https://discord.gg/finishthisrepo',
        fallback: '/discord/finishthisrepo',
        weight: 1,
        brandName: 'FinishThisRepo',
        description: 'Open source bounties',
        clicks: 0,
        conversions: 0
      },
      'ipomyagent.com': {
        invite: 'https://discord.gg/ipomyagent',
        fallback: '/discord/ipomyagent',
        weight: 1,
        brandName: 'IPOMyAgent',
        description: 'IPO your AI agent',
        clicks: 0,
        conversions: 0
      },
      'hollowtown.com': {
        invite: 'https://discord.gg/hollowtown',
        fallback: '/discord/hollowtown',
        weight: 1,
        brandName: 'Hollowtown',
        description: 'Gothic design studio',
        clicks: 0,
        conversions: 0
      },
      'coldstartkit.com': {
        invite: 'https://discord.gg/coldstartkit',
        fallback: '/discord/coldstartkit',
        weight: 1,
        brandName: 'ColdStartKit',
        description: 'Launch faster',
        clicks: 0,
        conversions: 0
      },
      'brandaidkit.com': {
        invite: 'https://discord.gg/brandaidkit',
        fallback: '/discord/brandaidkit',
        weight: 1,
        brandName: 'BrandAidKit',
        description: 'Brand in a box',
        clicks: 0,
        conversions: 0
      },
      'dealordelete.com': {
        invite: 'https://discord.gg/dealordelete',
        fallback: '/discord/dealordelete',
        weight: 1,
        brandName: 'DealOrDelete',
        description: 'Validate or kill your startup',
        clicks: 0,
        conversions: 0
      },
      'saveorsink.com': {
        invite: 'https://discord.gg/saveorsink',
        fallback: '/discord/saveorsink',
        weight: 1,
        brandName: 'SaveOrSink',
        description: 'Financial survival mode',
        clicks: 0,
        conversions: 0
      },
      'cringeproof.com': {
        invite: 'https://discord.gg/cringeproof',
        fallback: '/discord/cringeproof',
        weight: 1,
        brandName: 'CringeProof',
        description: 'Test your messaging',
        clicks: 0,
        conversions: 0
      }
    };

    this.config = {
      rotationStrategy: options.rotationStrategy || 'weighted', // 'random', 'weighted', 'sequential'
      excludeCurrent: options.excludeCurrent !== false, // Don't show current brand's invite
      maxInvites: options.maxInvites || 3, // Show 3 random invites
      ...options
    };

    console.log('[DiscordInviteRotator] Initialized');
  }

  /**
   * Get random Discord invite(s) for cross-promotion
   * @param {object} context - Current context (current brand, user preferences, etc.)
   * @returns {object} Random invite or array of invites
   */
  getRandomInvite(context = {}) {
    const { currentBrand, count = 1 } = context;

    // Get available brands
    let available = Object.entries(this.invites);

    // Exclude current brand if enabled
    if (this.config.excludeCurrent && currentBrand) {
      available = available.filter(([domain]) => domain !== currentBrand);
    }

    // Select based on strategy
    let selected = [];

    if (this.config.rotationStrategy === 'weighted') {
      selected = this._selectWeighted(available, count);
    } else if (this.config.rotationStrategy === 'sequential') {
      selected = this._selectSequential(available, count);
    } else {
      selected = this._selectRandom(available, count);
    }

    // Format response
    const invites = selected.map(([domain, data]) => ({
      domain,
      invite: data.invite,
      fallback: data.fallback,
      brandName: data.brandName,
      description: data.description,
      trackingId: this._generateTrackingId(domain)
    }));

    return count === 1 ? invites[0] : invites;
  }

  /**
   * Get all invites for navigation menu
   */
  getAllInvites() {
    return Object.entries(this.invites).map(([domain, data]) => ({
      domain,
      invite: data.invite,
      fallback: data.fallback,
      brandName: data.brandName,
      description: data.description,
      stats: {
        clicks: data.clicks,
        conversions: data.conversions,
        conversionRate: data.clicks > 0 ? (data.conversions / data.clicks * 100).toFixed(1) : 0
      }
    }));
  }

  /**
   * Track invite click
   */
  trackClick(domain, trackingId) {
    if (this.invites[domain]) {
      this.invites[domain].clicks++;

      return {
        success: true,
        domain,
        clicks: this.invites[domain].clicks,
        invite: this.invites[domain].invite
      };
    }

    return { success: false, error: 'Invalid domain' };
  }

  /**
   * Track invite conversion (user joined Discord)
   */
  trackConversion(domain) {
    if (this.invites[domain]) {
      this.invites[domain].conversions++;

      return {
        success: true,
        domain,
        conversions: this.invites[domain].conversions
      };
    }

    return { success: false, error: 'Invalid domain' };
  }

  /**
   * Get analytics
   */
  getAnalytics() {
    const stats = [];

    Object.entries(this.invites).forEach(([domain, data]) => {
      stats.push({
        domain,
        brandName: data.brandName,
        clicks: data.clicks,
        conversions: data.conversions,
        conversionRate: data.clicks > 0 ? ((data.conversions / data.clicks) * 100).toFixed(1) : 0,
        weight: data.weight
      });
    });

    // Sort by clicks
    stats.sort((a, b) => b.clicks - a.clicks);

    const totalClicks = stats.reduce((sum, s) => sum + s.clicks, 0);
    const totalConversions = stats.reduce((sum, s) => sum + s.conversions, 0);

    return {
      success: true,
      stats,
      totals: {
        clicks: totalClicks,
        conversions: totalConversions,
        conversionRate: totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(1) : 0
      }
    };
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Select random invites (equal probability)
   */
  _selectRandom(available, count) {
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /**
   * Select invites based on weight (higher weight = more likely)
   */
  _selectWeighted(available, count) {
    const selected = [];
    const pool = [...available];

    for (let i = 0; i < count && pool.length > 0; i++) {
      // Calculate total weight
      const totalWeight = pool.reduce((sum, [, data]) => sum + data.weight, 0);

      // Random selection based on weight
      let random = Math.random() * totalWeight;
      let selectedIndex = 0;

      for (let j = 0; j < pool.length; j++) {
        random -= pool[j][1].weight;
        if (random <= 0) {
          selectedIndex = j;
          break;
        }
      }

      // Add to selected and remove from pool
      selected.push(pool[selectedIndex]);
      pool.splice(selectedIndex, 1);
    }

    return selected;
  }

  /**
   * Select invites sequentially (round-robin)
   */
  _selectSequential(available, count) {
    if (!this._sequentialIndex) {
      this._sequentialIndex = 0;
    }

    const selected = [];
    for (let i = 0; i < count && available.length > 0; i++) {
      selected.push(available[this._sequentialIndex % available.length]);
      this._sequentialIndex++;
    }

    return selected;
  }

  /**
   * Generate tracking ID for invite
   */
  _generateTrackingId(domain) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${domain.replace('.com', '')}-${timestamp}-${random}`;
  }
}

module.exports = DiscordInviteRotator;
