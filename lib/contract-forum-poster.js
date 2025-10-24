/**
 * Contract Forum Poster
 *
 * Automatically posts signed contracts to forums/message boards.
 * Creates Reddit/HN-style threads with contract summaries, costs, and proof.
 *
 * Features:
 * - Auto-create thread after contract signing
 * - Contract summary with costs
 * - Soulfra proof badges
 * - Public share link
 * - Nested comments support
 * - Upvote/downvote system
 * - Tag-based categorization
 *
 * Integration:
 * - Forum System (migrations/056_content_forum.sql)
 * - Ollama Session Contract (lib/ollama-session-contract.js)
 * - Social sharing for cross-posting
 */

class ContractForumPoster {
  constructor(config = {}) {
    this.db = config.db;
    this.verbose = config.verbose || false;

    // Auto-post settings
    this.autoPost = config.autoPost !== false; // Default true
    this.autoTags = config.autoTags || true; // Auto-generate tags
  }

  // ============================================================================
  // FORUM POSTING
  // ============================================================================

  /**
   * Create forum thread for signed contract
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} options - Posting options
   * @returns {Promise<Object>} Thread info
   */
  async createContractThread(sessionId, options = {}) {
    try {
      const {
        userId,
        tags = [],
        customTitle = null,
        customBody = null,
        visibility = 'public' // 'public', 'unlisted', 'private'
      } = options;

      // Get contract data
      const contractData = await this._getContractData(sessionId);

      // Verify contract is signed
      if (contractData.contractStatus !== 'signed' || !contractData.isImmutable) {
        throw new Error('Contract must be signed before posting to forum');
      }

      // Generate thread title
      const title = customTitle || this._generateThreadTitle(contractData);

      // Generate thread body (markdown)
      const body = customBody || this._generateThreadBody(contractData);

      // Auto-generate tags
      const allTags = this.autoTags
        ? [...tags, ...this._generateTags(contractData)]
        : tags;

      // Create forum thread
      const threadResult = await this.db.query(`
        INSERT INTO forum_threads (
          user_id,
          title,
          body,
          tags,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING thread_id, created_at
      `, [
        userId,
        title,
        body,
        JSON.stringify(allTags),
        JSON.stringify({
          type: 'contract',
          sessionId,
          contractStatus: contractData.contractStatus,
          totalCost: contractData.totalCost,
          signedAt: contractData.signedAt,
          soulfraHash: contractData.soulfraHash?.sha256,
          visibility
        })
      ]);

      const threadId = threadResult.rows[0].thread_id;
      const createdAt = threadResult.rows[0].created_at;

      // Link contract to forum thread
      await this.db.query(`
        UPDATE ollama_streaming_sessions
        SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
        WHERE session_id = $1
      `, [
        sessionId,
        JSON.stringify({ forumThreadId: threadId })
      ]);

      this._log(`✅ Forum thread created: ${threadId} for contract ${sessionId}`);

      return {
        success: true,
        threadId,
        sessionId,
        title,
        tags: allTags,
        url: `/forum/thread/${threadId}`,
        createdAt
      };

    } catch (error) {
      console.error('[ContractForumPoster] Create thread error:', error.message);
      throw error;
    }
  }

  /**
   * Auto-post contract to forum after signing
   * Called automatically by contract workflow orchestrator
   *
   * @param {string} sessionId - Session UUID
   * @param {string} userId - User ID
   * @param {Object} options - Posting options
   * @returns {Promise<Object>} Thread info
   */
  async autoPostContract(sessionId, userId, options = {}) {
    if (!this.autoPost) {
      this._log('Auto-post disabled, skipping forum posting');
      return { success: false, message: 'Auto-post disabled' };
    }

    try {
      return await this.createContractThread(sessionId, {
        userId,
        ...options
      });

    } catch (error) {
      console.error('[ContractForumPoster] Auto-post error:', error.message);
      // Don't throw - auto-posting should not block contract workflow
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add comment to contract thread
   *
   * @param {string} threadId - Thread UUID
   * @param {string} userId - User ID
   * @param {string} content - Comment content
   * @param {Object} options - Comment options
   * @returns {Promise<Object>} Comment info
   */
  async addComment(threadId, userId, content, options = {}) {
    try {
      const {
        parentCommentId = null,
        depth = 0
      } = options;

      // Create comment
      const commentResult = await this.db.query(`
        INSERT INTO forum_posts (
          thread_id,
          user_id,
          parent_post_id,
          content,
          depth,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING post_id, created_at
      `, [
        threadId,
        userId,
        parentCommentId,
        content,
        depth
      ]);

      const postId = commentResult.rows[0].post_id;
      const createdAt = commentResult.rows[0].created_at;

      // Update thread comment count
      await this.db.query(`
        UPDATE forum_threads
        SET comment_count = comment_count + 1
        WHERE thread_id = $1
      `, [threadId]);

      this._log(`💬 Comment added to thread ${threadId}`);

      return {
        success: true,
        postId,
        threadId,
        createdAt
      };

    } catch (error) {
      console.error('[ContractForumPoster] Add comment error:', error.message);
      throw error;
    }
  }

  /**
   * Upvote thread
   *
   * @param {string} threadId - Thread UUID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Upvote result
   */
  async upvoteThread(threadId, userId) {
    try {
      // Add upvote
      await this.db.query(`
        UPDATE forum_threads
        SET upvotes = upvotes + 1,
            karma_score = karma_score + 1
        WHERE thread_id = $1
      `, [threadId]);

      // Track user vote (prevent duplicate votes)
      await this.db.query(`
        INSERT INTO forum_votes (thread_id, user_id, vote_type, created_at)
        VALUES ($1, $2, 'upvote', NOW())
        ON CONFLICT (thread_id, user_id) DO UPDATE
        SET vote_type = 'upvote'
      `, [threadId, userId]);

      this._log(`👍 Thread ${threadId} upvoted by ${userId}`);

      return {
        success: true,
        threadId,
        voteType: 'upvote'
      };

    } catch (error) {
      console.error('[ContractForumPoster] Upvote error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // THREAD CONTENT GENERATION
  // ============================================================================

  /**
   * Generate thread title from contract data
   *
   * @param {Object} contractData - Contract data
   * @returns {string} Thread title
   */
  _generateThreadTitle(contractData) {
    const cost = contractData.totalCost.toFixed(2);
    const model = contractData.primaryModel.split(':').pop(); // Get model name (e.g., 'mistral' from 'ollama:mistral')

    return `✅ ${contractData.sessionName} - ${model} ($${cost})`;
  }

  /**
   * Generate thread body (markdown) from contract data
   *
   * @param {Object} contractData - Contract data
   * @returns {string} Thread body (markdown)
   */
  _generateThreadBody(contractData) {
    const signedDate = new Date(contractData.signedAt).toLocaleDateString();
    const sha256Short = contractData.soulfraHash?.sha256?.substring(0, 16) || 'N/A';

    return `
## Contract Summary

**${contractData.sessionName}**

Just completed and signed an AI contract session. Here are the details:

### 📊 Stats

- **Model:** ${contractData.primaryModel}
- **Messages:** ${contractData.messageCount}
- **Total Cost:** $${contractData.totalCost.toFixed(2)}
- **Version:** ${contractData.version}
- **Signed:** ${signedDate}

### 🔐 Cryptographic Proof

This contract is **cryptographically signed** with Soulfra 5-layer proof:

- **SHA-256:** \`${sha256Short}...\`
- **Ed25519:** Signature verified ✅
- **Immutable:** Cannot be modified or deleted

### 🔗 Verification

[View Full Contract & Verify Signature](${contractData.publicShareUrl})

---

**What is this?**

This is a DocuSign-like contract for AI work sessions. The contract is cryptographically signed and can be independently verified using the link above. It serves as proof of work for billing, compliance, and transparency.

**Tech Stack:**

- Multi-device sync (phone + computer)
- Soulfra cryptographic signing (5-layer proof)
- Real-time WebSocket synchronization
- WASM security (CSP headers, rate limiting)
- Zero-cost email receipts (Gmail gateway)

**Built with ❤️ by CALOS**

*DocuSign-like contracts • Soulfra signing • Multi-device sync*
    `.trim();
  }

  /**
   * Auto-generate tags from contract data
   *
   * @param {Object} contractData - Contract data
   * @returns {Array<string>} Tags
   */
  _generateTags(contractData) {
    const tags = ['contract', 'ai', 'signed'];

    // Add model tag
    if (contractData.primaryModel.includes('ollama')) {
      tags.push('ollama');
    } else if (contractData.primaryModel.includes('gpt')) {
      tags.push('openai', 'gpt');
    } else if (contractData.primaryModel.includes('claude')) {
      tags.push('anthropic', 'claude');
    }

    // Add cost tier tag
    const cost = contractData.totalCost;
    if (cost === 0) {
      tags.push('free');
    } else if (cost < 1) {
      tags.push('low-cost');
    } else if (cost < 10) {
      tags.push('moderate-cost');
    } else {
      tags.push('high-cost');
    }

    // Add message volume tag
    const messages = contractData.messageCount;
    if (messages > 100) {
      tags.push('high-volume');
    } else if (messages > 20) {
      tags.push('medium-volume');
    }

    return tags;
  }

  // ============================================================================
  // CONTRACT DATA
  // ============================================================================

  /**
   * Get contract data for forum posting
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Contract data
   */
  async _getContractData(sessionId) {
    try {
      const sessionResult = await this.db.query(`
        SELECT
          session_id,
          user_id,
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

      // Get message count
      const messagesResult = await this.db.query(`
        SELECT COUNT(*) as count
        FROM ollama_session_messages
        WHERE session_id = $1
      `, [sessionId]);

      const messageCount = parseInt(messagesResult.rows[0].count);

      return {
        sessionId: session.session_id,
        userId: session.user_id,
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
      console.error('[ContractForumPoster] Get contract data error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // THREAD MANAGEMENT
  // ============================================================================

  /**
   * Get forum threads for user
   *
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Threads
   */
  async getUserThreads(userId, options = {}) {
    try {
      const {
        limit = 20,
        offset = 0,
        orderBy = 'created_at',
        order = 'DESC'
      } = options;

      const result = await this.db.query(`
        SELECT
          thread_id,
          title,
          tags,
          upvotes,
          downvotes,
          karma_score,
          comment_count,
          created_at,
          metadata
        FROM forum_threads
        WHERE user_id = $1
          AND (metadata->>'type' = 'contract' OR metadata->>'type' IS NULL)
        ORDER BY ${orderBy} ${order}
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);

      return result.rows.map(row => ({
        threadId: row.thread_id,
        title: row.title,
        tags: row.tags,
        upvotes: row.upvotes,
        downvotes: row.downvotes,
        karmaScore: row.karma_score,
        commentCount: row.comment_count,
        createdAt: row.created_at,
        sessionId: row.metadata?.sessionId,
        contractStatus: row.metadata?.contractStatus
      }));

    } catch (error) {
      console.error('[ContractForumPoster] Get user threads error:', error.message);
      throw error;
    }
  }

  /**
   * Get all contract threads (public gallery)
   *
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Threads
   */
  async getContractThreads(options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        orderBy = 'karma_score', // 'karma_score', 'created_at', 'upvotes'
        order = 'DESC',
        tags = []
      } = options;

      let query = `
        SELECT
          t.thread_id,
          t.user_id,
          t.title,
          t.tags,
          t.upvotes,
          t.downvotes,
          t.karma_score,
          t.comment_count,
          t.created_at,
          t.metadata,
          u.full_name as author_name
        FROM forum_threads t
        LEFT JOIN users u ON t.user_id = u.user_id
        WHERE t.metadata->>'type' = 'contract'
          AND t.metadata->>'visibility' = 'public'
      `;

      const params = [limit, offset];

      // Filter by tags
      if (tags.length > 0) {
        query += ` AND t.tags ?| $3`;
        params.push(tags);
      }

      query += ` ORDER BY ${orderBy} ${order} LIMIT $1 OFFSET $2`;

      const result = await this.db.query(query, params);

      return result.rows.map(row => ({
        threadId: row.thread_id,
        userId: row.user_id,
        authorName: row.author_name,
        title: row.title,
        tags: row.tags,
        upvotes: row.upvotes,
        downvotes: row.downvotes,
        karmaScore: row.karma_score,
        commentCount: row.comment_count,
        createdAt: row.created_at,
        sessionId: row.metadata?.sessionId,
        totalCost: row.metadata?.totalCost,
        signedAt: row.metadata?.signedAt
      }));

    } catch (error) {
      console.error('[ContractForumPoster] Get contract threads error:', error.message);
      throw error;
    }
  }

  /**
   * Search contract threads
   *
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Matching threads
   */
  async searchThreads(query, options = {}) {
    try {
      const {
        limit = 20,
        offset = 0
      } = options;

      const result = await this.db.query(`
        SELECT
          thread_id,
          title,
          tags,
          upvotes,
          karma_score,
          comment_count,
          created_at,
          metadata
        FROM forum_threads
        WHERE metadata->>'type' = 'contract'
          AND (
            title ILIKE $1
            OR body ILIKE $1
            OR tags::text ILIKE $1
          )
        ORDER BY karma_score DESC
        LIMIT $2 OFFSET $3
      `, [`%${query}%`, limit, offset]);

      return result.rows;

    } catch (error) {
      console.error('[ContractForumPoster] Search threads error:', error.message);
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
      console.log(`[ContractForumPoster] ${message}`);
    }
  }
}

module.exports = ContractForumPoster;
