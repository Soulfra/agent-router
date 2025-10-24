/**
 * CALOS Pricing Calculator
 *
 * Calculate exact pricing based on usage.
 *
 * Model: Stripe/AWS/Vercel style usage-based pricing
 *
 * Pricing Components:
 * 1. Transcripts: $0.05 each after free tier
 * 2. POS Transactions: 2.6% + $0.10 (in-person), 2.9% + $0.30 (online)
 * 3. Crypto Charges: 1.5% per charge
 * 4. Locations: $10/month per additional location
 * 5. API Requests: $0.001 per request after free tier
 * 6. Base subscription: $0 (Free), $29 (Pro), $99 (Enterprise)
 *
 * Usage:
 *   const calc = new PricingCalculator();
 *   const price = calc.calculate({
 *     transcripts: 50,
 *     posTransactions: 500,
 *     cryptoCharges: 10,
 *     locations: 3,
 *     apiRequests: 10000
 *   });
 *   console.log(price.total); // $157.50
 *   console.log(price.recommendedTier); // 'pro'
 */

class PricingCalculator {
  constructor() {
    // Tier pricing
    this.tiers = {
      free: {
        name: 'Free',
        baseCost: 0,
        limits: {
          transcripts: 5,
          posTransactions: 100,
          cryptoCharges: 0,
          locations: 1,
          apiRequests: 100
        },
        features: {
          whiteLabel: false,
          multiDomain: false,
          apiAccess: false,
          prioritySupport: false,
          quickbooksSync: false
        }
      },
      pro: {
        name: 'Pro',
        baseCost: 29,
        limits: {
          transcripts: Infinity,
          posTransactions: Infinity,
          cryptoCharges: Infinity,
          locations: 5,
          apiRequests: 10000
        },
        features: {
          whiteLabel: true,
          multiDomain: false,
          apiAccess: false,
          prioritySupport: true,
          quickbooksSync: true
        }
      },
      enterprise: {
        name: 'Enterprise',
        baseCost: 99,
        limits: {
          transcripts: Infinity,
          posTransactions: Infinity,
          cryptoCharges: Infinity,
          locations: Infinity,
          apiRequests: Infinity
        },
        features: {
          whiteLabel: true,
          multiDomain: true,
          apiAccess: true,
          prioritySupport: true,
          quickbooksSync: true,
          sla: true,
          airGapped: true
        }
      },
      selfHosted: {
        name: 'Self-Hosted',
        baseCost: 0,
        limits: {
          transcripts: Infinity,
          posTransactions: Infinity,
          cryptoCharges: Infinity,
          locations: Infinity,
          apiRequests: Infinity
        },
        features: {
          whiteLabel: true,
          multiDomain: true,
          apiAccess: true,
          prioritySupport: false,
          quickbooksSync: true,
          fullSourceCode: true
        }
      }
    };

    // Usage-based pricing (after free tier)
    this.usagePricing = {
      transcriptCost: 0.05,                    // $0.05 per transcript
      posTransactionFeePercent: 0.026,         // 2.6% per in-person transaction
      posTransactionFeeFixed: 0.10,            // + $0.10 per in-person transaction
      posOnlineFeePercent: 0.029,              // 2.9% per online transaction
      posOnlineFeeFixed: 0.30,                 // + $0.30 per online transaction
      cryptoFeePercent: 0.015,                 // 1.5% per crypto charge
      locationCost: 10,                        // $10 per additional location
      apiRequestCost: 0.001                    // $0.001 per request
    };

    // Marketplace revenue split
    this.marketplaceSplit = {
      creatorPercent: 0.70,  // Creator gets 70%
      platformPercent: 0.30  // We get 30%
    };
  }

  /**
   * Calculate pricing based on usage
   *
   * @param {Object} usage - Usage data
   * @returns {Object} - Pricing breakdown
   */
  calculate(usage = {}) {
    const {
      transcripts = 0,
      posTransactions = 0,
      posOnlineTransactions = 0,
      cryptoCharges = 0,
      locations = 1,
      apiRequests = 0,
      posTransactionAvgAmount = 50,      // Average transaction amount in dollars
      cryptoChargeAvgAmount = 100        // Average crypto charge in dollars
    } = usage;

    // Determine recommended tier
    const recommendedTier = this.recommendTier(usage);

    // Get tier details
    const tier = this.tiers[recommendedTier];

    // Calculate costs
    const costs = {
      // Base subscription cost
      subscription: tier.baseCost,

      // Transcript costs (after free tier)
      transcripts: this.calculateTranscriptCost(transcripts, recommendedTier),

      // POS transaction fees
      posInPerson: this.calculatePOSCost(posTransactions, posTransactionAvgAmount, false),
      posOnline: this.calculatePOSCost(posOnlineTransactions, posTransactionAvgAmount, true),

      // Crypto fees
      crypto: this.calculateCryptoCost(cryptoCharges, cryptoChargeAvgAmount),

      // Additional locations
      locations: this.calculateLocationCost(locations, recommendedTier),

      // API requests
      apiRequests: this.calculateAPICost(apiRequests, recommendedTier)
    };

    // Calculate total
    const total = Object.values(costs).reduce((sum, cost) => sum + cost, 0);

    // Savings vs competitors
    const savings = this.calculateSavings(usage, total);

    return {
      tier: recommendedTier,
      tierName: tier.name,
      costs,
      total,
      savings,
      breakdown: this.generateBreakdown(costs),
      features: tier.features,
      limits: tier.limits
    };
  }

  /**
   * Recommend tier based on usage
   *
   * @param {Object} usage
   * @returns {string} - Tier name
   */
  recommendTier(usage) {
    const {
      transcripts = 0,
      posTransactions = 0,
      cryptoCharges = 0,
      locations = 1,
      apiRequests = 0
    } = usage;

    // Check if Free tier is sufficient
    if (
      transcripts <= this.tiers.free.limits.transcripts &&
      posTransactions <= this.tiers.free.limits.posTransactions &&
      cryptoCharges <= this.tiers.free.limits.cryptoCharges &&
      locations <= this.tiers.free.limits.locations &&
      apiRequests <= this.tiers.free.limits.apiRequests
    ) {
      return 'free';
    }

    // Check if Pro tier is sufficient
    if (
      locations <= this.tiers.pro.limits.locations &&
      apiRequests <= this.tiers.pro.limits.apiRequests
    ) {
      return 'pro';
    }

    // Otherwise, recommend Enterprise
    return 'enterprise';
  }

  /**
   * Calculate transcript cost
   *
   * @param {number} transcripts
   * @param {string} tier
   * @returns {number}
   */
  calculateTranscriptCost(transcripts, tier) {
    const freeTier = this.tiers[tier].limits.transcripts;
    if (transcripts <= freeTier) return 0;

    const billable = transcripts - (typeof freeTier === 'number' ? freeTier : 0);
    return billable * this.usagePricing.transcriptCost;
  }

  /**
   * Calculate POS transaction cost
   *
   * @param {number} transactions
   * @param {number} avgAmount - Average transaction amount
   * @param {boolean} isOnline
   * @returns {number}
   */
  calculatePOSCost(transactions, avgAmount, isOnline = false) {
    if (transactions === 0) return 0;

    const feePercent = isOnline
      ? this.usagePricing.posOnlineFeePercent
      : this.usagePricing.posTransactionFeePercent;

    const feeFixed = isOnline
      ? this.usagePricing.posOnlineFeeFixed
      : this.usagePricing.posTransactionFeeFixed;

    // Calculate fees per transaction
    const totalTransactionAmount = transactions * avgAmount;
    const percentageFee = totalTransactionAmount * feePercent;
    const fixedFee = transactions * feeFixed;

    return percentageFee + fixedFee;
  }

  /**
   * Calculate crypto charge cost
   *
   * @param {number} charges
   * @param {number} avgAmount - Average charge amount
   * @returns {number}
   */
  calculateCryptoCost(charges, avgAmount) {
    if (charges === 0) return 0;

    const totalChargeAmount = charges * avgAmount;
    return totalChargeAmount * this.usagePricing.cryptoFeePercent;
  }

  /**
   * Calculate location cost
   *
   * @param {number} locations
   * @param {string} tier
   * @returns {number}
   */
  calculateLocationCost(locations, tier) {
    const included = this.tiers[tier].limits.locations;
    if (locations <= included) return 0;

    const additional = locations - (typeof included === 'number' ? included : 0);
    return additional * this.usagePricing.locationCost;
  }

  /**
   * Calculate API request cost
   *
   * @param {number} requests
   * @param {string} tier
   * @returns {number}
   */
  calculateAPICost(requests, tier) {
    const freeTier = this.tiers[tier].limits.apiRequests;
    if (requests <= freeTier) return 0;

    const billable = requests - (typeof freeTier === 'number' ? freeTier : 0);
    return billable * this.usagePricing.apiRequestCost;
  }

  /**
   * Calculate savings vs competitors
   *
   * @param {Object} usage
   * @param {number} calosTotal
   * @returns {Object}
   */
  calculateSavings(usage, calosTotal) {
    const { posTransactions = 0, posTransactionAvgAmount = 50 } = usage;

    // Square pricing (2.6% + $0.10)
    const squareTotal = posTransactions * (posTransactionAvgAmount * 0.026 + 0.10);

    // Shopify pricing (2.9% + $0.30 + $29/mo base)
    const shopifyTotal = 29 + posTransactions * (posTransactionAvgAmount * 0.029 + 0.30);

    // Calculate savings
    const vsSquare = squareTotal - calosTotal;
    const vsShopify = shopifyTotal - calosTotal;

    return {
      vsSquare: vsSquare > 0 ? vsSquare : 0,
      vsShopify: vsShopify > 0 ? vsShopify : 0
    };
  }

  /**
   * Generate pricing breakdown (human-readable)
   *
   * @param {Object} costs
   * @returns {Array}
   */
  generateBreakdown(costs) {
    const breakdown = [];

    if (costs.subscription > 0) {
      breakdown.push({
        item: 'Base Subscription',
        cost: costs.subscription,
        formatted: `$${costs.subscription.toFixed(2)}/mo`
      });
    }

    if (costs.transcripts > 0) {
      breakdown.push({
        item: 'Transcripts',
        cost: costs.transcripts,
        formatted: `$${costs.transcripts.toFixed(2)}/mo`
      });
    }

    if (costs.posInPerson > 0) {
      breakdown.push({
        item: 'POS (In-Person)',
        cost: costs.posInPerson,
        formatted: `$${costs.posInPerson.toFixed(2)}/mo`
      });
    }

    if (costs.posOnline > 0) {
      breakdown.push({
        item: 'POS (Online)',
        cost: costs.posOnline,
        formatted: `$${costs.posOnline.toFixed(2)}/mo`
      });
    }

    if (costs.crypto > 0) {
      breakdown.push({
        item: 'Crypto Payments',
        cost: costs.crypto,
        formatted: `$${costs.crypto.toFixed(2)}/mo`
      });
    }

    if (costs.locations > 0) {
      breakdown.push({
        item: 'Additional Locations',
        cost: costs.locations,
        formatted: `$${costs.locations.toFixed(2)}/mo`
      });
    }

    if (costs.apiRequests > 0) {
      breakdown.push({
        item: 'API Requests',
        cost: costs.apiRequests,
        formatted: `$${costs.apiRequests.toFixed(2)}/mo`
      });
    }

    return breakdown;
  }

  /**
   * Calculate marketplace creator earnings
   *
   * @param {number} salePrice - Theme/plugin sale price
   * @returns {Object}
   */
  calculateMarketplaceEarnings(salePrice) {
    const creatorEarnings = salePrice * this.marketplaceSplit.creatorPercent;
    const platformFee = salePrice * this.marketplaceSplit.platformPercent;

    return {
      salePrice,
      creatorEarnings,
      platformFee,
      split: `${this.marketplaceSplit.creatorPercent * 100}/${this.marketplaceSplit.platformPercent * 100}`
    };
  }

  /**
   * Get tier comparison
   *
   * @returns {Array}
   */
  getTierComparison() {
    return Object.keys(this.tiers).map(tierKey => {
      const tier = this.tiers[tierKey];
      return {
        tier: tierKey,
        name: tier.name,
        baseCost: tier.baseCost,
        limits: tier.limits,
        features: tier.features
      };
    });
  }
}

module.exports = PricingCalculator;
