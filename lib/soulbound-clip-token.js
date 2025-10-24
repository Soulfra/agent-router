/**
 * Soulbound Clip Token Manager
 *
 * Non-transferable NFTs (ERC-721) that prove clip authorship and track performance.
 * Inspired by Ethereum soulbound tokens + Vitalik's identity vision.
 *
 * What Are Soulbound Tokens?
 * - NFTs that CAN'T be sold/transferred
 * - Permanently bound to wallet that earned them
 * - Prove achievements, reputation, participation
 * - Like Steam achievements but on-chain
 *
 * Why For Clips?
 * - Proves "I clipped the best ZKP moment, not bought it"
 * - Builds provable reputation as top clipper
 * - Track record: "10 viral clips, $2,450 earned"
 * - Can't fake by buying tokens
 *
 * Token Metadata:
 * - clipId: Unique clip identifier
 * - clipper: Fan's wallet address (permanent owner)
 * - views: Total views of clip
 * - bountyEarned: Total $ earned from clip
 * - contentHash: IPFS/Arweave hash of clip video
 * - timestamp: When clip was created
 * - streamId: Original stream it came from
 * - viral: Boolean (>100k views)
 *
 * Smart Contract (Ethereum/Polygon/Base):
 * ```solidity
 * contract SoulboundClipToken is ERC721 {
 *   struct ClipMetadata {
 *     string clipId;
 *     address clipper;
 *     uint256 views;
 *     uint256 bountyEarned;  // in wei
 *     string contentHash;
 *     uint256 timestamp;
 *     bool viral;
 *     bool soulbound;  // Always true
 *   }
 *
 *   // Override transfer to prevent selling
 *   function _transfer(...) internal override {
 *     require(false, "Soulbound: transfer disabled");
 *   }
 * }
 * ```
 *
 * Integrates with:
 * - ClipBountyManager (lib/clip-bounty-manager.js)
 * - SoulfraSigner (lib/soulfra-signer.js)
 * - ChallengeChain (lib/challenge-chain.js) for PoW minting
 * - UserDataVault (lib/user-data-vault.js) for private storage
 *
 * Usage:
 *   const soulbound = new SoulboundClipToken({
 *     web3Provider, contractAddress, db
 *   });
 *
 *   // Mint token after fan solves PoW challenge
 *   const token = await soulbound.mint({
 *     clipId: 'zkp-explained-clip-23',
 *     clipper: '0x123...',
 *     contentHash: 'ipfs://Qm...',
 *     metadata: { title: 'ZKP Mind-Blow', ... }
 *   });
 *
 *   // Update performance (clip goes viral)
 *   await soulbound.updateMetrics(tokenId, {
 *     views: 150000,
 *     bountyEarned: 375.50
 *   });
 *
 *   // Query user's clip history
 *   const tokens = await soulbound.getTokensByWallet('0x123...');
 *   // → [{ tokenId, clipId, views: 150k, viral: true, ... }]
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class SoulboundClipToken extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.soulfraSigner = options.soulfraSigner;
    this.vault = options.vault;
    this.challengeChain = options.challengeChain; // PoW verification

    // Web3 config (optional - can work without blockchain)
    this.web3Enabled = options.web3Enabled || false;
    this.web3Provider = options.web3Provider; // ethers.js provider
    this.contractAddress = options.contractAddress; // Deployed contract
    this.contract = null; // Will be initialized if web3Enabled

    // Token config
    this.config = {
      viralThreshold: 100000, // 100k views = viral
      maxTokensPerWallet: 1000, // Prevent spam
      requirePoW: options.requirePoW !== false, // Require challenge completion (default: true)
      challengeDifficulty: options.challengeDifficulty || 4, // PoW leading zeros
      enableIPFS: options.enableIPFS || false,
      enableArweave: options.enableArweave || false
    };

    // In-memory token registry (synced with blockchain if enabled)
    this.tokens = new Map(); // tokenId → token data

    // Initialize web3 if enabled
    if (this.web3Enabled && this.web3Provider && this.contractAddress) {
      this._initWeb3();
    }

    console.log('[SoulboundClipToken] Initialized', this.web3Enabled ? '(Web3 enabled)' : '(Database only)');
  }

  /**
   * Mint new soulbound token for clip
   */
  async mint(options) {
    const {
      clipId,
      clipper, // Wallet address (0x123...)
      contentHash = null, // IPFS/Arweave hash
      metadata = {},
      challengeProof = null // PoW challenge solution
    } = options;

    if (!clipId || !clipper) {
      throw new Error('clipId and clipper required');
    }

    // Validate PoW if required
    if (this.config.requirePoW) {
      if (!challengeProof) {
        throw new Error('Challenge proof required for minting (prevents bot spam)');
      }

      // Verify challenge with ChallengeChain
      if (this.challengeChain) {
        try {
          const isValid = await this._verifyChallengeProof(clipper, challengeProof);
          if (!isValid) {
            throw new Error('Invalid challenge proof');
          }
          console.log(`[SoulboundClipToken] PoW challenge verified for ${clipper}`);
        } catch (error) {
          throw new Error(`Challenge verification failed: ${error.message}`);
        }
      }
    }

    // Check max tokens per wallet
    const walletTokenCount = await this._getWalletTokenCount(clipper);
    if (walletTokenCount >= this.config.maxTokensPerWallet) {
      throw new Error(`Max tokens per wallet reached (${this.config.maxTokensPerWallet})`);
    }

    // Generate token ID
    const tokenId = crypto.randomBytes(16).toString('hex');

    // Build token data
    const token = {
      tokenId,
      clipId,
      clipper,
      views: 0,
      bountyEarned: 0,
      contentHash,
      timestamp: Date.now(),
      viral: false,
      soulbound: true, // Always true
      metadata: {
        ...metadata,
        mintedAt: new Date().toISOString()
      },
      challengeProof
    };

    // Sign with Soulfra hash (cryptographic proof)
    if (this.soulfraSigner) {
      const signed = this.soulfraSigner.sign(token, {
        action: 'mint_soulbound_clip_token',
        timestamp: token.timestamp
      });
      token.soulfraHash = signed.soulfraHash;
    }

    // Store in database
    if (this.db) {
      await this._saveToken(token);
    }

    // Store in vault (encrypted)
    if (this.vault) {
      await this.vault.store(clipper, 'soulbound_tokens', tokenId, token);
    }

    // Mint on-chain if web3 enabled
    if (this.web3Enabled && this.contract) {
      try {
        const tx = await this.contract.mint(
          clipper,
          tokenId,
          contentHash || '',
          JSON.stringify(metadata)
        );
        await tx.wait();

        token.onChain = true;
        token.txHash = tx.hash;

        console.log(`[SoulboundClipToken] Minted on-chain: ${tx.hash}`);
      } catch (error) {
        console.error('[SoulboundClipToken] On-chain mint failed:', error.message);
        token.onChain = false;
      }
    }

    this.tokens.set(tokenId, token);

    this.emit('token:minted', {
      tokenId,
      clipId,
      clipper,
      onChain: token.onChain || false
    });

    console.log(`[SoulboundClipToken] Minted: ${tokenId} for ${clipper.substring(0, 10)}...`);

    return token;
  }

  /**
   * Update token metrics (views, bounty)
   */
  async updateMetrics(tokenId, metrics) {
    const {
      views = null,
      bountyEarned = null
    } = metrics;

    let token = this.tokens.get(tokenId);

    if (!token) {
      // Try loading from database
      token = await this._loadToken(tokenId);
      if (!token) {
        throw new Error(`Token not found: ${tokenId}`);
      }
    }

    // Update metrics
    if (views !== null) {
      token.views = views;
      token.viral = views >= this.config.viralThreshold;
    }

    if (bountyEarned !== null) {
      token.bountyEarned = bountyEarned;
    }

    token.metadata.lastUpdated = new Date().toISOString();

    // Update database
    if (this.db) {
      await this._updateTokenMetrics(token);
    }

    // Update vault
    if (this.vault) {
      await this.vault.store(token.clipper, 'soulbound_tokens', tokenId, token);
    }

    // Update on-chain if web3 enabled
    if (this.web3Enabled && this.contract && token.onChain) {
      try {
        const tx = await this.contract.updateMetrics(
          tokenId,
          views || 0,
          bountyEarned || 0
        );
        await tx.wait();

        console.log(`[SoulboundClipToken] Updated on-chain: ${tx.hash}`);
      } catch (error) {
        console.error('[SoulboundClipToken] On-chain update failed:', error.message);
      }
    }

    this.emit('metrics:updated', {
      tokenId,
      views: token.views,
      viral: token.viral,
      bountyEarned: token.bountyEarned
    });

    console.log(`[SoulboundClipToken] Updated: ${tokenId} → ${token.views} views${token.viral ? ' (VIRAL!)' : ''}`);

    return token;
  }

  /**
   * Get all tokens for a wallet
   */
  async getTokensByWallet(wallet) {
    const tokens = [];

    // Check in-memory cache
    for (const token of this.tokens.values()) {
      if (token.clipper === wallet) {
        tokens.push(token);
      }
    }

    // Query database if available
    if (this.db) {
      try {
        const result = await this.db.query(`
          SELECT * FROM soulbound_clip_tokens
          WHERE clipper = $1
          ORDER BY timestamp DESC
        `, [wallet]);

        for (const row of result.rows) {
          const tokenId = row.token_id;

          // Skip if already in memory
          if (this.tokens.has(tokenId)) continue;

          const token = this._rowToToken(row);
          tokens.push(token);
          this.tokens.set(tokenId, token);
        }
      } catch (error) {
        console.error('[SoulboundClipToken] Query wallet tokens error:', error.message);
      }
    }

    return tokens.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get wallet statistics
   */
  async getWalletStats(wallet) {
    const tokens = await this.getTokensByWallet(wallet);

    const stats = {
      wallet,
      totalTokens: tokens.length,
      viralTokens: tokens.filter(t => t.viral).length,
      totalViews: tokens.reduce((sum, t) => sum + t.views, 0),
      totalBounty: tokens.reduce((sum, t) => sum + t.bountyEarned, 0),
      avgViewsPerClip: tokens.length > 0 ? tokens.reduce((sum, t) => sum + t.views, 0) / tokens.length : 0,
      bestClip: tokens.length > 0 ? tokens.sort((a, b) => b.views - a.views)[0] : null,
      rank: null // Calculated separately
    };

    return stats;
  }

  /**
   * Get leaderboard (top clippers)
   */
  async getLeaderboard(options = {}) {
    const {
      metric = 'totalViews', // totalViews | viralTokens | totalBounty
      limit = 10
    } = options;

    // Aggregate by wallet
    const walletStats = new Map();

    for (const token of this.tokens.values()) {
      const wallet = token.clipper;

      const stats = walletStats.get(wallet) || {
        wallet,
        totalTokens: 0,
        viralTokens: 0,
        totalViews: 0,
        totalBounty: 0
      };

      stats.totalTokens++;
      if (token.viral) stats.viralTokens++;
      stats.totalViews += token.views;
      stats.totalBounty += token.bountyEarned;

      walletStats.set(wallet, stats);
    }

    // Sort by metric
    const leaderboard = Array.from(walletStats.values())
      .sort((a, b) => {
        switch (metric) {
          case 'totalViews':
            return b.totalViews - a.totalViews;
          case 'viralTokens':
            return b.viralTokens - a.viralTokens;
          case 'totalBounty':
            return b.totalBounty - a.totalBounty;
          default:
            return b.totalViews - a.totalViews;
        }
      })
      .slice(0, limit);

    // Add ranks
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return leaderboard;
  }

  /**
   * Verify token ownership (can't be transferred)
   */
  async verifyOwnership(tokenId, wallet) {
    const token = this.tokens.get(tokenId) || await this._loadToken(tokenId);

    if (!token) {
      return { valid: false, reason: 'Token not found' };
    }

    if (token.clipper !== wallet) {
      return { valid: false, reason: 'Not owner' };
    }

    if (!token.soulbound) {
      return { valid: false, reason: 'Not soulbound' };
    }

    return {
      valid: true,
      token,
      message: 'Verified soulbound owner'
    };
  }

  /**
   * Initialize web3 connection
   */
  async _initWeb3() {
    try {
      const { ethers } = require('ethers');

      const provider = new ethers.providers.JsonRpcProvider(this.web3Provider);

      // Load contract ABI (simplified)
      const abi = [
        'function mint(address to, string calldata tokenId, string calldata contentHash, string calldata metadata) external',
        'function updateMetrics(string calldata tokenId, uint256 views, uint256 bountyEarned) external',
        'function ownerOf(string calldata tokenId) external view returns (address)',
        'function tokenMetadata(string calldata tokenId) external view returns (string)'
      ];

      this.contract = new ethers.Contract(this.contractAddress, abi, provider.getSigner());

      console.log('[SoulboundClipToken] Web3 initialized:', this.contractAddress);
    } catch (error) {
      console.error('[SoulboundClipToken] Web3 init failed:', error.message);
      this.web3Enabled = false;
    }
  }

  /**
   * Get token count for wallet
   */
  async _getWalletTokenCount(wallet) {
    const tokens = await this.getTokensByWallet(wallet);
    return tokens.length;
  }

  /**
   * Save token to database
   */
  async _saveToken(token) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO soulbound_clip_tokens (
          token_id,
          clip_id,
          clipper,
          views,
          bounty_earned,
          content_hash,
          timestamp,
          viral,
          soulbound,
          metadata,
          challenge_proof,
          soulfra_hash,
          on_chain,
          tx_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        token.tokenId,
        token.clipId,
        token.clipper,
        token.views,
        token.bountyEarned,
        token.contentHash,
        new Date(token.timestamp),
        token.viral,
        token.soulbound,
        JSON.stringify(token.metadata),
        token.challengeProof,
        JSON.stringify(token.soulfraHash),
        token.onChain || false,
        token.txHash || null
      ]);
    } catch (error) {
      if (!error.message.includes('does not exist')) {
        console.error('[SoulboundClipToken] Save token error:', error.message);
      }
    }
  }

  /**
   * Load token from database
   */
  async _loadToken(tokenId) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        SELECT * FROM soulbound_clip_tokens WHERE token_id = $1
      `, [tokenId]);

      if (result.rows.length === 0) return null;

      const token = this._rowToToken(result.rows[0]);
      this.tokens.set(tokenId, token);

      return token;
    } catch (error) {
      console.error('[SoulboundClipToken] Load token error:', error.message);
      return null;
    }
  }

  /**
   * Update token metrics in database
   */
  async _updateTokenMetrics(token) {
    if (!this.db) return;

    try {
      await this.db.query(`
        UPDATE soulbound_clip_tokens
        SET views = $1, bounty_earned = $2, viral = $3, metadata = $4
        WHERE token_id = $5
      `, [
        token.views,
        token.bountyEarned,
        token.viral,
        JSON.stringify(token.metadata),
        token.tokenId
      ]);
    } catch (error) {
      if (!error.message.includes('does not exist')) {
        console.error('[SoulboundClipToken] Update metrics error:', error.message);
      }
    }
  }

  /**
   * Convert database row to token object
   */
  _rowToToken(row) {
    return {
      tokenId: row.token_id,
      clipId: row.clip_id,
      clipper: row.clipper,
      views: row.views || 0,
      bountyEarned: parseFloat(row.bounty_earned || 0),
      contentHash: row.content_hash,
      timestamp: new Date(row.timestamp).getTime(),
      viral: row.viral || false,
      soulbound: row.soulbound !== false,
      metadata: JSON.parse(row.metadata || '{}'),
      challengeProof: row.challenge_proof,
      soulfraHash: JSON.parse(row.soulfra_hash || 'null'),
      onChain: row.on_chain || false,
      txHash: row.tx_hash
    };
  }

  /**
   * Verify PoW challenge proof
   * Ensures user solved challenge before minting (prevents bot spam)
   */
  async _verifyChallengeProof(userId, challengeProof) {
    if (!this.challengeChain) {
      // No challenge chain configured, skip verification
      return true;
    }

    try {
      // Challenge proof format: { sessionId, response, timestamp }
      const { sessionId, response, timestamp } = challengeProof;

      if (!sessionId || !response) {
        return false;
      }

      // Verify proof hasn't expired (10 minutes)
      const age = Date.now() - timestamp;
      if (age > 600000) {
        console.log('[SoulboundClipToken] Challenge proof expired');
        return false;
      }

      // Verify the response is valid for the session
      // This checks if user actually solved the PoW challenge
      const isValid = await this._validateChallengeResponse(sessionId, response);

      if (isValid) {
        console.log(`[SoulboundClipToken] Challenge proof valid for user ${userId}`);
      } else {
        console.log(`[SoulboundClipToken] Challenge proof invalid for user ${userId}`);
      }

      return isValid;

    } catch (error) {
      console.error('[SoulboundClipToken] Challenge verification error:', error.message);
      return false;
    }
  }

  /**
   * Validate challenge response (simplified verification)
   */
  async _validateChallengeResponse(sessionId, response) {
    // In production, this would call challenge-chain to verify
    // For now, we do simplified hash validation

    // Response should be a hash that meets difficulty requirement
    if (typeof response !== 'string' || response.length !== 64) {
      return false;
    }

    // Check if response hash starts with required zeros (difficulty)
    const difficulty = this.config.challengeDifficulty || 4;
    const requiredPrefix = '0'.repeat(difficulty);

    const hash = crypto.createHash('sha256')
      .update(sessionId + response)
      .digest('hex');

    return hash.startsWith(requiredPrefix);
  }
}

module.exports = SoulboundClipToken;
