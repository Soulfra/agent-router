/**
 * Ollama Session Contract Manager
 *
 * Implements DocuSign-like contract workflow for Ollama streaming sessions.
 * Sessions become "contracts" that can be reviewed, approved, and signed with Soulfra cryptographic proof.
 *
 * Contract Lifecycle:
 * 1. draft      → Session is active, user chatting
 * 2. review     → User reviews session summary, costs, messages
 * 3. approved   → User approves costs (contract terms)
 * 4. signed     → User signs with Soulfra (cryptographic proof)
 * 5. executed   → Contract is in effect (billed, invoiced)
 * 6. completed  → Session fully closed
 *
 * Features:
 * - DocuSign-like contract signing workflow
 * - Soulfra cryptographic signatures (SHA256, SHA512, SHA3-512, Blake3, Ed25519)
 * - Session immutability after signing
 * - PDF export with cryptographic proof
 * - Public share URLs for signed contracts
 * - Cost approval gates
 * - Version tracking for contract changes
 */

const crypto = require('crypto');
const SoulfraSigner = require('./soulfra-signer');

class OllamaSessionContract {
  constructor(config = {}) {
    this.db = config.db;
    this.soulfraSigner = config.soulfraSigner || new SoulfraSigner();
    this.verbose = config.verbose || false;

    if (!this.db) {
      throw new Error('Database connection required');
    }
  }

  /**
   * Transition session to review mode
   * User can review messages, costs, and timeline before approving
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Review data
   */
  async enterReview(sessionId) {
    try {
      // Get session
      const session = await this._getSession(sessionId);

      // Verify session can be reviewed
      if (session.contract_status !== 'draft') {
        throw new Error(`Cannot review session in ${session.contract_status} status`);
      }

      if (session.status !== 'ended') {
        throw new Error('Session must be ended before review');
      }

      // Update contract status
      await this.db.query(`
        UPDATE ollama_streaming_sessions
        SET contract_status = 'review'
        WHERE session_id = $1
      `, [sessionId]);

      // Get full review data
      const reviewData = await this.getReviewData(sessionId);

      this._log(`Session ${sessionId} entered review mode`);

      return {
        success: true,
        sessionId,
        contractStatus: 'review',
        reviewData
      };

    } catch (error) {
      console.error('[OllamaSessionContract] Enter review error:', error.message);
      throw error;
    }
  }

  /**
   * Get review data for contract
   * Shows summary, costs, messages, timeline
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Review data
   */
  async getReviewData(sessionId) {
    try {
      // Get session summary
      const summaryResult = await this.db.query(`
        SELECT * FROM ollama_session_summary
        WHERE session_id = $1
      `, [sessionId]);

      if (summaryResult.rows.length === 0) {
        throw new Error('Session not found');
      }

      const summary = summaryResult.rows[0];

      // Get messages
      const messagesResult = await this.db.query(`
        SELECT
          message_id,
          role,
          content,
          timestamp,
          model,
          provider,
          tokens,
          cost_usd
        FROM ollama_session_messages
        WHERE session_id = $1
        ORDER BY timestamp ASC
      `, [sessionId]);

      // Get context streams
      const streamsResult = await this.db.query(`
        SELECT
          stream_id,
          source_model,
          target_model,
          target_provider,
          message_count,
          total_tokens,
          streamed_at,
          reason,
          cost_usd
        FROM ollama_context_streams
        WHERE session_id = $1
        ORDER BY streamed_at ASC
      `, [sessionId]);

      // Build timeline (interleaved messages + context streams)
      const timeline = this._buildTimeline(messagesResult.rows, streamsResult.rows);

      // Contract terms
      const terms = this._generateContractTerms(summary);

      return {
        summary,
        messages: messagesResult.rows,
        contextStreams: streamsResult.rows,
        timeline,
        terms,
        totalCost: parseFloat(summary.total_cost) || 0,
        estimatedHourlyRate: parseFloat(summary.cost_per_hour) || 0
      };

    } catch (error) {
      console.error('[OllamaSessionContract] Get review data error:', error.message);
      throw error;
    }
  }

  /**
   * Approve contract costs
   * User agrees to pay the session costs
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} options - Approval options
   * @returns {Promise<Object>} Approval result
   */
  async approveCosts(sessionId, options = {}) {
    try {
      const { approvedCostCeiling = null } = options;

      // Get session
      const session = await this._getSession(sessionId);

      // Verify can approve
      if (session.contract_status !== 'review') {
        throw new Error(`Cannot approve costs in ${session.contract_status} status`);
      }

      // Get current costs
      const summary = await this.db.query(`
        SELECT total_cost FROM ollama_session_summary
        WHERE session_id = $1
      `, [sessionId]);

      const currentCost = parseFloat(summary.rows[0]?.total_cost) || 0;

      // Check ceiling if provided
      if (approvedCostCeiling !== null && currentCost > approvedCostCeiling) {
        throw new Error(`Current cost ${currentCost} exceeds approved ceiling ${approvedCostCeiling}`);
      }

      // Update session
      await this.db.query(`
        UPDATE ollama_streaming_sessions
        SET
          contract_status = 'approved',
          approved_at = NOW(),
          approved_cost_usd = $2,
          estimated_cost_usd = $3
        WHERE session_id = $1
      `, [sessionId, approvedCostCeiling || currentCost, currentCost]);

      this._log(`Session ${sessionId} costs approved: $${currentCost}`);

      return {
        success: true,
        sessionId,
        contractStatus: 'approved',
        approvedCost: currentCost,
        approvedCeiling: approvedCostCeiling
      };

    } catch (error) {
      console.error('[OllamaSessionContract] Approve costs error:', error.message);
      throw error;
    }
  }

  /**
   * Sign contract with Soulfra cryptographic signature
   * Makes session immutable (cannot be modified after signing)
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} options - Signing options
   * @returns {Promise<Object>} Signing result with Soulfra hash
   */
  async signContract(sessionId, options = {}) {
    try {
      const { metadata = {} } = options;

      // Get session
      const session = await this._getSession(sessionId);

      // Verify can sign
      if (session.contract_status !== 'approved') {
        throw new Error(`Cannot sign contract in ${session.contract_status} status`);
      }

      if (session.is_immutable) {
        throw new Error('Session already signed and immutable');
      }

      // Get full contract data for signing
      const contractData = await this.getReviewData(sessionId);

      // Generate Soulfra signature
      const signableData = {
        sessionId: session.session_id,
        userId: session.user_id,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        durationSeconds: session.duration_seconds,
        totalMessages: contractData.summary.total_messages,
        totalTokens: contractData.summary.total_tokens,
        totalCost: contractData.totalCost,
        approvedCost: session.approved_cost_usd,
        domainId: session.domain_id,
        primaryModel: session.primary_model,
        messages: contractData.messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          model: m.model,
          tokens: m.tokens,
          cost: m.cost_usd
        })),
        contextStreams: contractData.contextStreams.map(s => ({
          sourceModel: s.source_model,
          targetModel: s.target_model,
          messageCount: s.message_count,
          streamedAt: s.streamed_at,
          cost: s.cost_usd
        }))
      };

      const signedData = this.soulfraSigner.sign(signableData, {
        purpose: 'ollama_session_contract',
        domain: session.domain_id,
        ...metadata
      });

      // Update session with Soulfra signature
      await this.db.query(`
        UPDATE ollama_streaming_sessions
        SET
          contract_status = 'signed',
          signed_at = NOW(),
          soulfra_hash = $2,
          soulfra_signed_at = NOW(),
          soulfra_version = $3,
          is_immutable = true,
          immutable_since = NOW()
        WHERE session_id = $1
      `, [sessionId, JSON.stringify(signedData.soulfraHash), signedData.version]);

      // Generate public share URL
      const shareUrl = await this._generateShareUrl(sessionId);

      await this.db.query(`
        UPDATE ollama_streaming_sessions
        SET public_share_url = $2
        WHERE session_id = $1
      `, [sessionId, shareUrl]);

      this._log(`Session ${sessionId} signed with Soulfra signature`);

      return {
        success: true,
        sessionId,
        contractStatus: 'signed',
        signedAt: new Date(),
        soulfraHash: signedData.soulfraHash,
        soulfraVersion: signedData.version,
        isImmutable: true,
        publicShareUrl: shareUrl
      };

    } catch (error) {
      console.error('[OllamaSessionContract] Sign contract error:', error.message);
      throw error;
    }
  }

  /**
   * Verify Soulfra signature on a signed contract
   * Checks cryptographic integrity
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Verification result
   */
  async verifySignature(sessionId) {
    try {
      // Get session
      const session = await this._getSession(sessionId);

      if (!session.soulfra_hash) {
        throw new Error('Session not signed (no Soulfra hash)');
      }

      // Get contract data
      const contractData = await this.getReviewData(sessionId);

      // Rebuild signable data (same structure as signing)
      const signableData = {
        sessionId: session.session_id,
        userId: session.user_id,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        durationSeconds: session.duration_seconds,
        totalMessages: contractData.summary.total_messages,
        totalTokens: contractData.summary.total_tokens,
        totalCost: contractData.totalCost,
        approvedCost: session.approved_cost_usd,
        domainId: session.domain_id,
        primaryModel: session.primary_model,
        messages: contractData.messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          model: m.model,
          tokens: m.tokens,
          cost: m.cost_usd
        })),
        contextStreams: contractData.contextStreams.map(s => ({
          sourceModel: s.source_model,
          targetModel: s.target_model,
          messageCount: s.message_count,
          streamedAt: s.streamed_at,
          cost: s.cost_usd
        }))
      };

      // Verify signature
      const isValid = this.soulfraSigner.verify(signableData, session.soulfra_hash);

      return {
        success: true,
        sessionId,
        isValid,
        soulfraHash: session.soulfra_hash,
        signedAt: session.soulfra_signed_at,
        version: session.soulfra_version
      };

    } catch (error) {
      console.error('[OllamaSessionContract] Verify signature error:', error.message);
      throw error;
    }
  }

  /**
   * Export signed contract as PDF
   * Includes session summary, messages, costs, and Soulfra signature proof
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} PDF generation result
   */
  async exportPDF(sessionId) {
    try {
      // Get session
      const session = await this._getSession(sessionId);

      if (!session.is_immutable) {
        throw new Error('Session must be signed before exporting PDF');
      }

      // Get contract data
      const contractData = await this.getReviewData(sessionId);

      // TODO: Implement PDF generation (requires PDF library like pdfkit or puppeteer)
      // For now, return stub
      const pdfUrl = `/api/ollama/session/${sessionId}/contract.pdf`;

      await this.db.query(`
        UPDATE ollama_streaming_sessions
        SET contract_pdf_url = $2
        WHERE session_id = $1
      `, [sessionId, pdfUrl]);

      this._log(`Session ${sessionId} PDF export prepared`);

      return {
        success: true,
        sessionId,
        pdfUrl,
        message: 'PDF export stub (implementation pending)'
      };

    } catch (error) {
      console.error('[OllamaSessionContract] Export PDF error:', error.message);
      throw error;
    }
  }

  /**
   * Get public contract data (for share URLs)
   * Only shows signed, immutable contracts
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Public contract data
   */
  async getPublicContract(sessionId) {
    try {
      // Get session
      const session = await this._getSession(sessionId);

      if (!session.is_immutable) {
        throw new Error('Only signed contracts can be viewed publicly');
      }

      // Get contract data
      const contractData = await this.getReviewData(sessionId);

      return {
        success: true,
        sessionId,
        contractStatus: session.contract_status,
        signedAt: session.signed_at,
        soulfraHash: session.soulfra_hash,
        summary: contractData.summary,
        messages: contractData.messages,
        contextStreams: contractData.contextStreams,
        timeline: contractData.timeline,
        totalCost: contractData.totalCost,
        isImmutable: true,
        publicShareUrl: session.public_share_url
      };

    } catch (error) {
      console.error('[OllamaSessionContract] Get public contract error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Get session from database
   * @private
   */
  async _getSession(sessionId) {
    const result = await this.db.query(`
      SELECT * FROM ollama_streaming_sessions
      WHERE session_id = $1
    `, [sessionId]);

    if (result.rows.length === 0) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return result.rows[0];
  }

  /**
   * Build timeline from messages and context streams
   * @private
   */
  _buildTimeline(messages, contextStreams) {
    const timeline = [];

    // Add messages
    messages.forEach(msg => {
      timeline.push({
        type: 'message',
        timestamp: msg.timestamp,
        data: msg
      });
    });

    // Add context streams
    contextStreams.forEach(stream => {
      timeline.push({
        type: 'context_stream',
        timestamp: stream.streamed_at,
        data: stream
      });
    });

    // Sort by timestamp
    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return timeline;
  }

  /**
   * Generate contract terms
   * @private
   */
  _generateContractTerms(summary) {
    const durationFormatted = summary.duration_formatted || 'N/A';
    const totalCost = parseFloat(summary.total_cost) || 0;

    return `
OLLAMA STREAMING SESSION CONTRACT

Session ID: ${summary.session_id}
User ID: ${summary.user_id}
Session Name: ${summary.session_name || 'Untitled Session'}

DURATION:
${durationFormatted} (${summary.duration_seconds || 0} seconds)

SERVICES:
- Primary Model: ${summary.primary_model}
- Total Messages: ${summary.total_messages}
- Total Tokens: ${summary.total_tokens}
- Context Streams: ${summary.context_stream_count}

COSTS:
- Total Cost: $${totalCost.toFixed(6)} USD
- Ollama Cost: $${parseFloat(summary.ollama_cost || 0).toFixed(6)} USD
- External Cost: $${parseFloat(summary.external_cost || 0).toFixed(6)} USD
- Estimated Hourly Rate: $${parseFloat(summary.cost_per_hour || 0).toFixed(2)} USD/hour

By signing this contract, you agree to pay the total cost of $${totalCost.toFixed(6)} USD
for the AI services rendered during this session.

This contract is cryptographically signed using Soulfra Layer0 standard
and is immutable after signature.
`.trim();
  }

  /**
   * Generate public share URL
   * @private
   */
  async _generateShareUrl(sessionId) {
    // Generate random token for share URL
    const shareToken = crypto.randomBytes(16).toString('hex');

    // TODO: Store share token in database for validation
    // For now, use simple URL format
    return `/ollama/session/${sessionId}/contract?token=${shareToken}`;
  }

  /**
   * Log message if verbose mode enabled
   * @private
   */
  _log(message) {
    if (this.verbose) {
      console.log(`[OllamaSessionContract] ${message}`);
    }
  }
}

module.exports = OllamaSessionContract;
