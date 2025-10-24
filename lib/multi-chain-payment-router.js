/**
 * Multi-Chain Payment Router
 *
 * Routes clip bounty payments through optimal blockchain based on:
 * - Amount (BTC for large, Solana for tiny, Monero for privacy)
 * - Speed (Solana for instant, Lightning for fast)
 * - Privacy (Monero for anonymous, mixer for semi-private)
 * - Fees (optimize for lowest cost)
 *
 * Supported Chains:
 * - Bitcoin (BTC) - Large payments, Lightning for small/fast
 * - Ethereum (ETH) - Smart contracts, NFT integration
 * - Solana (SOL) - Fast/cheap microtransactions
 * - Monero (XMR) - Full privacy, untraceable
 *
 * Payment Types:
 * - Clip bounties (fan earnings)
 * - Viral bonuses (high-view rewards)
 * - Halloween bonuses (2x multiplier)
 * - Creator splits (70/30 revenue share)
 *
 * Integrates with:
 * - CryptoVaultMixer (lib/crypto-vault-mixer.js) - Privacy mixing
 * - ClipBountyManager (lib/clip-bounty-manager.js) - Bounty calculations
 * - SoulboundClipToken (lib/soulbound-clip-token.js) - NFT tracking
 *
 * Usage:
 *   const router = new MultiChainPaymentRouter({
 *     mixer, db, config
 *   });
 *
 *   // Route payment
 *   const payment = await router.route({
 *     from: 'creator_wallet',
 *     to: 'fan_wallet',
 *     amount: 5.50,
 *     reason: 'clip_bounty',
 *     clipId: 'clip_abc123',
 *     preferences: { privacy: 'high', speed: 'normal' }
 *   });
 *
 *   // Execute payment
 *   const result = await router.execute(payment);
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class MultiChainPaymentRouter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.mixer = options.mixer;
    this.db = options.db;

    // Chain config
    this.chains = {
      BTC: {
        name: 'Bitcoin',
        minAmount: 0.001, // ~$50 at $50k BTC
        maxAmount: Infinity,
        avgFee: 0.0001, // ~$5
        confirmationTime: 600000, // 10 minutes
        privacyLevel: 'medium',
        enabled: options.btcEnabled !== false
      },

      BTC_LIGHTNING: {
        name: 'Bitcoin Lightning',
        minAmount: 0.00001, // ~$0.50
        maxAmount: 0.1, // ~$5k
        avgFee: 0.000001, // ~$0.05
        confirmationTime: 1000, // 1 second
        privacyLevel: 'low',
        enabled: options.lightningEnabled !== false
      },

      ETH: {
        name: 'Ethereum',
        minAmount: 0.01, // ~$30
        maxAmount: Infinity,
        avgFee: 0.003, // ~$9 gas
        confirmationTime: 180000, // 3 minutes
        privacyLevel: 'low',
        enabled: options.ethEnabled !== false
      },

      SOL: {
        name: 'Solana',
        minAmount: 0.01, // ~$2
        maxAmount: 100, // ~$20k
        avgFee: 0.000005, // ~$0.0001
        confirmationTime: 400, // 400ms
        privacyLevel: 'low',
        enabled: options.solEnabled !== false
      },

      XMR: {
        name: 'Monero',
        minAmount: 0.01, // ~$2
        maxAmount: Infinity,
        avgFee: 0.001, // ~$0.20
        confirmationTime: 1200000, // 20 minutes
        privacyLevel: 'maximum', // Untraceable
        enabled: options.xmrEnabled !== false
      }
    };

    // Exchange rates (USD)
    this.exchangeRates = {
      BTC: 50000,
      ETH: 3000,
      SOL: 150,
      XMR: 160
    };

    // Routing preferences
    this.preferences = {
      privacy: {
        low: ['SOL', 'BTC_LIGHTNING', 'ETH', 'BTC', 'XMR'],
        medium: ['BTC', 'ETH', 'XMR', 'SOL', 'BTC_LIGHTNING'],
        high: ['XMR', 'BTC', 'ETH', 'SOL'],
        maximum: ['XMR']
      },

      speed: {
        instant: ['SOL', 'BTC_LIGHTNING', 'ETH', 'BTC', 'XMR'],
        fast: ['BTC_LIGHTNING', 'SOL', 'ETH', 'BTC', 'XMR'],
        normal: ['ETH', 'BTC', 'SOL', 'BTC_LIGHTNING', 'XMR'],
        patient: ['BTC', 'XMR', 'ETH', 'SOL', 'BTC_LIGHTNING']
      },

      cost: {
        minimize: ['SOL', 'BTC_LIGHTNING', 'XMR', 'BTC', 'ETH'],
        balanced: ['SOL', 'ETH', 'BTC_LIGHTNING', 'BTC', 'XMR'],
        dont_care: ['SOL', 'BTC_LIGHTNING', 'ETH', 'BTC', 'XMR']
      }
    };

    // Payment tracking
    this.pendingPayments = new Map();
    this.completedPayments = new Map();

    console.log('[MultiChainPaymentRouter] Initialized');
  }

  /**
   * Route payment to optimal chain
   */
  async route(options) {
    const {
      from,
      to,
      amount,
      currency = 'USD', // Amount is in USD by default
      reason,
      clipId,
      preferences = {},
      metadata = {}
    } = options;

    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    // User preferences
    const privacy = preferences.privacy || 'medium';
    const speed = preferences.speed || 'normal';
    const cost = preferences.cost || 'balanced';

    // Score each chain
    const scores = [];

    for (const [chain, config] of Object.entries(this.chains)) {
      if (!config.enabled) continue;

      const score = this._scoreChain(chain, config, {
        amount,
        currency,
        privacy,
        speed,
        cost
      });

      scores.push({
        chain,
        config,
        score,
        ...score.breakdown
      });
    }

    // Sort by score (highest first)
    scores.sort((a, b) => b.score.total - a.score.total);

    // Get best chain
    const bestRoute = scores[0];
    if (!bestRoute) {
      throw new Error('No available chains for payment');
    }

    // Convert amount to chain currency
    const chainAmount = this._convertAmount(amount, currency, bestRoute.chain);

    // Calculate actual fees
    const fees = this._calculateFees(chainAmount, bestRoute.chain);

    // Determine if privacy mixing needed
    const needsMixing = privacy === 'high' || privacy === 'maximum' || amount > 100;

    // Create payment plan
    const payment = {
      paymentId: crypto.randomBytes(32).toString('hex'),
      from,
      to,
      amount,
      currency,
      chain: bestRoute.chain,
      chainAmount,
      fees,
      reason,
      clipId,
      privacy,
      speed,
      cost,
      needsMixing,
      metadata,
      status: 'pending',
      createdAt: Date.now(),
      estimatedConfirmation: Date.now() + bestRoute.config.confirmationTime,
      alternatives: scores.slice(1, 3).map(s => ({
        chain: s.chain,
        score: s.score.total,
        fees: this._calculateFees(this._convertAmount(amount, currency, s.chain), s.chain)
      }))
    };

    // Store payment
    this.pendingPayments.set(payment.paymentId, payment);

    // Track in database
    if (this.db) {
      await this._trackPayment(payment);
    }

    this.emit('payment:routed', {
      paymentId: payment.paymentId,
      chain: payment.chain,
      amount: payment.chainAmount,
      privacy,
      speed
    });

    console.log(`[MultiChainPaymentRouter] Routed ${amount} ${currency} → ${bestRoute.chain} (score: ${bestRoute.score.total.toFixed(2)})`);

    return payment;
  }

  /**
   * Execute payment
   */
  async execute(payment) {
    const paymentId = payment.paymentId || payment;
    const paymentData = typeof payment === 'string'
      ? this.pendingPayments.get(payment)
      : payment;

    if (!paymentData) {
      throw new Error(`Payment not found: ${paymentId}`);
    }

    console.log(`[MultiChainPaymentRouter] Executing payment: ${paymentData.paymentId} (${paymentData.chain})`);

    try {
      paymentData.status = 'executing';

      // Step 1: Privacy mixing (if needed)
      let mixId = null;
      if (paymentData.needsMixing && this.mixer) {
        console.log(`[MultiChainPaymentRouter] Mixing payment for privacy: ${paymentData.paymentId}`);

        const mixed = await this.mixer.mix({
          from: paymentData.from,
          to: paymentData.to,
          amount: paymentData.chainAmount,
          currency: paymentData.chain,
          urgency: paymentData.speed === 'instant' ? 'urgent' : 'normal'
        });

        mixId = mixed.mixId;
        paymentData.mixId = mixId;

        console.log(`[MultiChainPaymentRouter] Mixed: ${mixId} (${mixed.splits.length} splits)`);
      }

      // Step 2: Execute on-chain transaction
      const tx = await this._executeOnChain(paymentData);
      paymentData.txHash = tx.hash;
      paymentData.status = 'confirmed';
      paymentData.confirmedAt = Date.now();

      // Move to completed
      this.pendingPayments.delete(paymentData.paymentId);
      this.completedPayments.set(paymentData.paymentId, paymentData);

      this.emit('payment:completed', {
        paymentId: paymentData.paymentId,
        chain: paymentData.chain,
        txHash: tx.hash,
        amount: paymentData.chainAmount,
        duration: paymentData.confirmedAt - paymentData.createdAt
      });

      console.log(`[MultiChainPaymentRouter] Payment completed: ${paymentData.paymentId} (tx: ${tx.hash})`);

      return {
        paymentId: paymentData.paymentId,
        status: 'confirmed',
        txHash: tx.hash,
        chain: paymentData.chain,
        amount: paymentData.chainAmount,
        fees: paymentData.fees,
        confirmedAt: paymentData.confirmedAt
      };

    } catch (error) {
      console.error(`[MultiChainPaymentRouter] Payment failed: ${paymentData.paymentId}`, error.message);

      paymentData.status = 'failed';
      paymentData.error = error.message;

      this.emit('payment:failed', {
        paymentId: paymentData.paymentId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Score chain for payment
   */
  _scoreChain(chain, config, context) {
    const { amount, currency, privacy, speed, cost } = context;

    let score = 0;
    const breakdown = {};

    // Convert amount to chain currency
    const chainAmount = this._convertAmount(amount, currency, chain);

    // Amount fit (0-30 points)
    if (chainAmount >= config.minAmount && chainAmount <= config.maxAmount) {
      // Optimal range
      const range = config.maxAmount - config.minAmount;
      const position = (chainAmount - config.minAmount) / range;

      // Prefer mid-range (bell curve)
      const optimalPosition = 0.3; // 30% into range
      const distance = Math.abs(position - optimalPosition);
      breakdown.amountFit = Math.max(0, 30 - (distance * 60));
    } else if (chainAmount < config.minAmount) {
      // Too small
      breakdown.amountFit = 0;
    } else {
      // Above max (still ok for BTC/ETH/XMR)
      breakdown.amountFit = 10;
    }
    score += breakdown.amountFit;

    // Privacy match (0-25 points)
    const privacyLevels = { low: 0, medium: 1, high: 2, maximum: 3 };
    const requiredPrivacy = privacyLevels[privacy];
    const chainPrivacy = privacyLevels[config.privacyLevel];

    if (chainPrivacy >= requiredPrivacy) {
      // Meets requirement
      breakdown.privacyMatch = 25;
    } else {
      // Insufficient privacy
      breakdown.privacyMatch = (chainPrivacy / requiredPrivacy) * 15;
    }
    score += breakdown.privacyMatch;

    // Speed match (0-20 points)
    const speedScores = {
      instant: c => c < 5000 ? 20 : c < 60000 ? 10 : 0,
      fast: c => c < 60000 ? 20 : c < 300000 ? 15 : 5,
      normal: c => c < 600000 ? 20 : 10,
      patient: c => 20 // Any speed ok
    };
    breakdown.speedMatch = speedScores[speed](config.confirmationTime);
    score += breakdown.speedMatch;

    // Cost efficiency (0-25 points)
    const feeInUSD = config.avgFee * this.exchangeRates[chain.replace('_LIGHTNING', '')];
    const feeRatio = feeInUSD / amount;

    if (cost === 'minimize') {
      // Penalize high fees heavily
      breakdown.costEfficiency = feeRatio < 0.01 ? 25 : feeRatio < 0.05 ? 15 : feeRatio < 0.1 ? 5 : 0;
    } else if (cost === 'balanced') {
      // Reasonable fee range
      breakdown.costEfficiency = feeRatio < 0.05 ? 25 : feeRatio < 0.1 ? 20 : feeRatio < 0.2 ? 10 : 0;
    } else {
      // Don't care about fees
      breakdown.costEfficiency = 15;
    }
    score += breakdown.costEfficiency;

    return {
      total: score,
      breakdown
    };
  }

  /**
   * Convert amount between currencies
   */
  _convertAmount(amount, fromCurrency, toChain) {
    // Remove _LIGHTNING suffix for rate lookup
    const baseChain = toChain.replace('_LIGHTNING', '');

    if (fromCurrency === 'USD') {
      // USD to crypto
      return amount / this.exchangeRates[baseChain];
    } else if (fromCurrency === toChain || fromCurrency === baseChain) {
      // Same currency
      return amount;
    } else {
      // Crypto to crypto (via USD)
      const usdAmount = amount * this.exchangeRates[fromCurrency];
      return usdAmount / this.exchangeRates[baseChain];
    }
  }

  /**
   * Calculate fees for chain
   */
  _calculateFees(chainAmount, chain) {
    const config = this.chains[chain];
    const baseFee = config.avgFee;

    // Dynamic fees based on network congestion (simplified)
    const congestionMultiplier = 1.0; // TODO: fetch from chain

    const chainFee = baseFee * congestionMultiplier;
    const chainFeeUSD = chainFee * this.exchangeRates[chain.replace('_LIGHTNING', '')];

    return {
      chain: chainFee,
      chainCurrency: chain,
      usd: chainFeeUSD,
      congestion: congestionMultiplier
    };
  }

  /**
   * Execute on-chain transaction (stub)
   */
  async _executeOnChain(payment) {
    // TODO: Integrate with actual blockchain APIs
    // - Bitcoin: bitcoinjs-lib, Lightning: lnd
    // - Ethereum: ethers.js, web3.js
    // - Solana: @solana/web3.js
    // - Monero: monero-javascript

    console.log(`[MultiChainPaymentRouter] Simulating ${payment.chain} transaction...`);

    // Simulate network delay
    const delay = this.chains[payment.chain].confirmationTime / 10;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Return mock transaction
    return {
      hash: crypto.randomBytes(32).toString('hex'),
      chain: payment.chain,
      from: payment.from,
      to: payment.to,
      amount: payment.chainAmount,
      fee: payment.fees.chain,
      timestamp: Date.now(),
      confirmations: 1
    };
  }

  /**
   * Get payment status
   */
  getPaymentStatus(paymentId) {
    const pending = this.pendingPayments.get(paymentId);
    if (pending) return { status: pending.status, payment: pending };

    const completed = this.completedPayments.get(paymentId);
    if (completed) return { status: 'completed', payment: completed };

    return { status: 'not_found', payment: null };
  }

  /**
   * Get recommended chain for amount
   */
  getRecommendedChain(amount, currency = 'USD', privacy = 'medium') {
    // Quick routing without full score calculation
    const amountUSD = currency === 'USD' ? amount : amount * this.exchangeRates[currency];

    // Privacy first
    if (privacy === 'maximum') {
      return 'XMR';
    }

    // Amount-based routing
    if (amountUSD < 1) {
      return 'SOL'; // Microtransactions
    } else if (amountUSD < 10) {
      return 'BTC_LIGHTNING'; // Small/fast
    } else if (amountUSD < 100) {
      return privacy === 'high' ? 'XMR' : 'SOL'; // Medium payments
    } else if (amountUSD < 1000) {
      return privacy === 'high' ? 'XMR' : 'ETH'; // Large payments
    } else {
      return privacy === 'high' ? 'XMR' : 'BTC'; // Very large
    }
  }

  /**
   * Batch payments for efficiency
   */
  async batchRoute(payments) {
    const routes = [];

    for (const payment of payments) {
      try {
        const route = await this.route(payment);
        routes.push(route);
      } catch (error) {
        console.error(`[MultiChainPaymentRouter] Batch route failed for payment:`, error.message);
        routes.push({ error: error.message, payment });
      }
    }

    // Group by chain for batch execution
    const byChain = {};
    for (const route of routes) {
      if (route.error) continue;

      if (!byChain[route.chain]) {
        byChain[route.chain] = [];
      }
      byChain[route.chain].push(route);
    }

    console.log(`[MultiChainPaymentRouter] Batched ${payments.length} payments across ${Object.keys(byChain).length} chains`);

    return {
      routes,
      byChain,
      totalPayments: payments.length,
      successfulRoutes: routes.filter(r => !r.error).length
    };
  }

  /**
   * Track payment in database
   */
  async _trackPayment(payment) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO multi_chain_payments (
          payment_id,
          from_address,
          to_address,
          amount,
          currency,
          chain,
          chain_amount,
          fees_chain,
          fees_usd,
          reason,
          clip_id,
          privacy,
          speed,
          needs_mixing,
          mix_id,
          status,
          created_at,
          estimated_confirmation
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        payment.paymentId,
        payment.from,
        payment.to,
        payment.amount,
        payment.currency,
        payment.chain,
        payment.chainAmount,
        payment.fees.chain,
        payment.fees.usd,
        payment.reason,
        payment.clipId,
        payment.privacy,
        payment.speed,
        payment.needsMixing,
        payment.mixId,
        payment.status,
        new Date(payment.createdAt),
        new Date(payment.estimatedConfirmation)
      ]);

    } catch (error) {
      if (!error.message.includes('does not exist')) {
        console.error('[MultiChainPaymentRouter] Track payment error:', error.message);
      }
    }
  }

  /**
   * Get router statistics
   */
  getStats() {
    const pending = Array.from(this.pendingPayments.values());
    const completed = Array.from(this.completedPayments.values());

    // Group by chain
    const byChain = {};
    for (const payment of [...pending, ...completed]) {
      if (!byChain[payment.chain]) {
        byChain[payment.chain] = { count: 0, volume: 0, fees: 0 };
      }
      byChain[payment.chain].count++;
      byChain[payment.chain].volume += payment.amount;
      byChain[payment.chain].fees += payment.fees.usd;
    }

    // Average confirmation time
    const confirmedPayments = completed.filter(p => p.confirmedAt);
    const avgConfirmationTime = confirmedPayments.length > 0
      ? confirmedPayments.reduce((sum, p) => sum + (p.confirmedAt - p.createdAt), 0) / confirmedPayments.length
      : 0;

    return {
      totalPayments: pending.length + completed.length,
      pending: pending.length,
      completed: completed.length,
      byChain,
      avgConfirmationTime,
      enabledChains: Object.entries(this.chains)
        .filter(([_, config]) => config.enabled)
        .map(([chain, _]) => chain)
    };
  }

  /**
   * Update exchange rates (call periodically)
   */
  async updateExchangeRates() {
    // TODO: Fetch from CoinGecko, Binance, etc.
    console.log('[MultiChainPaymentRouter] Exchange rates updated');
  }
}

module.exports = MultiChainPaymentRouter;
