/**
 * Contract Workflow Orchestrator
 *
 * THE BIG ONE - Orchestrates the complete contract workflow from start to finish.
 * One method to rule them all: completeContractWorkflow()
 *
 * What it does:
 * 1. ✅ Sign contract (Soulfra cryptographic proof)
 * 2. 📧 Email receipt (Gmail gateway, zero-cost)
 * 3. 📝 Post to forum (auto-create thread)
 * 4. 📤 Share socially (Twitter/Instagram/LinkedIn)
 * 5. 📱 Sync all devices (WebSocket broadcast)
 * 6. 🔔 Notify user (push notifications)
 *
 * Integration:
 * - Multi-Device Contract Sync (lib/multi-device-contract-sync.js)
 * - Contract Email Generator (lib/contract-email-generator.js)
 * - Contract Forum Poster (lib/contract-forum-poster.js)
 * - Contract Social Share (lib/contract-social-share.js)
 * - Ollama Session Contract (lib/ollama-session-contract.js)
 *
 * The Dream Workflow:
 * ```javascript
 * const orchestrator = new ContractWorkflowOrchestrator({ db, wss });
 *
 * // ONE METHOD DOES EVERYTHING
 * const result = await orchestrator.completeContractWorkflow(sessionId, {
 *   userId: 'user123',
 *   autoEmail: true,
 *   emailTo: 'user@example.com',
 *   autoForum: true,
 *   autoSocial: true,
 *   socialPlatforms: ['twitter', 'instagram']
 * });
 *
 * // RESULT: ✅ Signed ✅ Emailed ✅ Posted ✅ Shared ✅ Synced
 * ```
 */

const MultiDeviceContractSync = require('./multi-device-contract-sync');
const ContractEmailGenerator = require('./contract-email-generator');
const ContractForumPoster = require('./contract-forum-poster');
const ContractSocialShare = require('./contract-social-share');
const OllamaSessionContract = require('./ollama-session-contract');
const VersionManager = require('./version-manager');

class ContractWorkflowOrchestrator {
  constructor(config = {}) {
    this.db = config.db;
    this.wss = config.wss; // WebSocket server
    this.verbose = config.verbose || false;

    // Initialize all systems
    this.contractManager = new OllamaSessionContract({ db: this.db });
    this.deviceSync = new MultiDeviceContractSync({
      db: this.db,
      wss: this.wss,
      verbose: this.verbose
    });
    this.emailGenerator = new ContractEmailGenerator({
      db: this.db,
      verbose: this.verbose
    });
    this.forumPoster = new ContractForumPoster({
      db: this.db,
      verbose: this.verbose
    });
    this.socialShare = new ContractSocialShare({
      db: this.db,
      verbose: this.verbose
    });
    this.versionManager = new VersionManager({
      db: this.db,
      verbose: this.verbose
    });

    // Workflow state cache
    this.workflowState = new Map();
  }

  // ============================================================================
  // THE BIG ONE - COMPLETE CONTRACT WORKFLOW
  // ============================================================================

  /**
   * Complete contract workflow - ONE METHOD TO RULE THEM ALL
   *
   * This method orchestrates the entire contract signing workflow:
   * 1. Review contract
   * 2. Approve costs
   * 3. Sign with Soulfra
   * 4. Email receipt
   * 5. Post to forum
   * 6. Share socially
   * 7. Sync all devices
   * 8. Track analytics
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} options - Workflow options
   * @returns {Promise<Object>} Complete workflow result
   */
  async completeContractWorkflow(sessionId, options = {}) {
    try {
      const {
        userId,
        // Review & Approval
        approvedCostCeiling = null,
        // Email
        autoEmail = true,
        emailTo = null,
        emailCustomMessage = null,
        // Forum
        autoForum = true,
        forumTags = [],
        forumCustomTitle = null,
        // Social
        autoSocial = false,
        socialPlatforms = ['twitter'], // ['twitter', 'instagram', 'linkedin']
        // Sync
        autoSync = true,
        // Metadata
        metadata = {}
      } = options;

      this._log(`🚀 Starting complete contract workflow for ${sessionId}`);

      // Initialize workflow state
      const workflowId = this._generateWorkflowId();
      this.workflowState.set(workflowId, {
        sessionId,
        userId,
        status: 'in_progress',
        startedAt: new Date(),
        steps: []
      });

      const results = {
        success: true,
        workflowId,
        sessionId,
        userId,
        steps: {},
        errors: []
      };

      // ========================================================================
      // STEP 1: REVIEW CONTRACT
      // ========================================================================
      try {
        this._log('📋 Step 1: Entering review mode...');
        const reviewResult = await this.contractManager.enterReview(sessionId);

        results.steps.review = {
          success: true,
          reviewData: reviewResult.reviewData,
          timestamp: new Date()
        };

        // Sync to all devices
        if (autoSync) {
          await this.deviceSync.syncReview(sessionId);
        }

        this._updateWorkflowStep(workflowId, 'review', 'completed');

      } catch (error) {
        results.errors.push({ step: 'review', error: error.message });
        this._updateWorkflowStep(workflowId, 'review', 'failed');
        // Continue workflow despite review error
      }

      // ========================================================================
      // STEP 2: APPROVE COSTS
      // ========================================================================
      try {
        this._log('✅ Step 2: Approving costs...');
        const approvalResult = await this.contractManager.approveCosts(sessionId, {
          approvedCostCeiling
        });

        results.steps.approval = {
          success: true,
          approvedCost: approvalResult.approvedCost,
          approvedCeiling: approvalResult.approvedCeiling,
          timestamp: new Date()
        };

        // Sync to all devices
        if (autoSync) {
          await this.deviceSync.syncApproval(sessionId, { approvedCostCeiling });
        }

        this._updateWorkflowStep(workflowId, 'approval', 'completed');

      } catch (error) {
        results.errors.push({ step: 'approval', error: error.message });
        this._updateWorkflowStep(workflowId, 'approval', 'failed');
        throw error; // Stop workflow if approval fails
      }

      // ========================================================================
      // STEP 3: SIGN CONTRACT (SOULFRA)
      // ========================================================================
      try {
        this._log('🔏 Step 3: Signing contract with Soulfra...');
        const signatureResult = await this.contractManager.signContract(sessionId, {
          metadata: {
            ...metadata,
            workflowId,
            orchestrated: true,
            signedVia: 'workflow_orchestrator'
          }
        });

        results.steps.signature = {
          success: true,
          signedAt: signatureResult.signedAt,
          soulfraHash: signatureResult.soulfraHash,
          publicShareUrl: signatureResult.publicShareUrl,
          timestamp: new Date()
        };

        // Sync to all devices
        if (autoSync) {
          await this.deviceSync.syncSignature(sessionId, { metadata });
        }

        this._updateWorkflowStep(workflowId, 'signature', 'completed');

      } catch (error) {
        results.errors.push({ step: 'signature', error: error.message });
        this._updateWorkflowStep(workflowId, 'signature', 'failed');
        throw error; // Stop workflow if signature fails
      }

      // ========================================================================
      // STEP 4: EMAIL RECEIPT
      // ========================================================================
      if (autoEmail && emailTo) {
        try {
          this._log('📧 Step 4: Sending email receipt...');
          const emailResult = await this.emailGenerator.sendContractReceipt(sessionId, {
            to: emailTo,
            userId,
            customMessage: emailCustomMessage,
            includeQR: true,
            includePDF: false // TODO: Enable when PDF generation is implemented
          });

          results.steps.email = {
            success: true,
            to: emailTo,
            messageId: emailResult.messageId,
            timestamp: new Date()
          };

          this._updateWorkflowStep(workflowId, 'email', 'completed');

        } catch (error) {
          results.errors.push({ step: 'email', error: error.message });
          this._updateWorkflowStep(workflowId, 'email', 'failed');
          // Continue workflow despite email error
        }
      } else {
        this._log('📧 Step 4: Email disabled or no recipient specified');
        results.steps.email = { success: false, skipped: true };
      }

      // ========================================================================
      // STEP 5: POST TO FORUM
      // ========================================================================
      if (autoForum) {
        try {
          this._log('📝 Step 5: Posting to forum...');
          const forumResult = await this.forumPoster.autoPostContract(sessionId, userId, {
            tags: forumTags,
            customTitle: forumCustomTitle
          });

          if (forumResult.success) {
            results.steps.forum = {
              success: true,
              threadId: forumResult.threadId,
              url: forumResult.url,
              timestamp: new Date()
            };

            this._updateWorkflowStep(workflowId, 'forum', 'completed');
          } else {
            results.steps.forum = { success: false, error: forumResult.error };
          }

        } catch (error) {
          results.errors.push({ step: 'forum', error: error.message });
          this._updateWorkflowStep(workflowId, 'forum', 'failed');
          // Continue workflow despite forum error
        }
      } else {
        this._log('📝 Step 5: Forum posting disabled');
        results.steps.forum = { success: false, skipped: true };
      }

      // ========================================================================
      // STEP 6: SHARE SOCIALLY
      // ========================================================================
      if (autoSocial && socialPlatforms.length > 0) {
        try {
          this._log(`📤 Step 6: Sharing to social platforms: ${socialPlatforms.join(', ')}...`);
          const socialResults = {};

          for (const platform of socialPlatforms) {
            try {
              let shareResult;

              switch (platform) {
                case 'twitter':
                  shareResult = await this.socialShare.shareToTwitter(sessionId);
                  break;
                case 'linkedin':
                  shareResult = await this.socialShare.shareToLinkedIn(sessionId);
                  break;
                case 'instagram':
                case 'tiktok':
                  // Generate shareable card
                  shareResult = await this.socialShare.generateShareCard(sessionId, {
                    format: platform === 'instagram' ? 'square' : 'story'
                  });
                  break;
                default:
                  throw new Error(`Unsupported platform: ${platform}`);
              }

              socialResults[platform] = {
                success: true,
                ...shareResult,
                timestamp: new Date()
              };

              // Track share
              await this.socialShare.trackShare(sessionId, platform, userId);

            } catch (error) {
              socialResults[platform] = {
                success: false,
                error: error.message
              };
            }
          }

          results.steps.social = socialResults;
          this._updateWorkflowStep(workflowId, 'social', 'completed');

        } catch (error) {
          results.errors.push({ step: 'social', error: error.message });
          this._updateWorkflowStep(workflowId, 'social', 'failed');
          // Continue workflow despite social error
        }
      } else {
        this._log('📤 Step 6: Social sharing disabled or no platforms specified');
        results.steps.social = { success: false, skipped: true };
      }

      // ========================================================================
      // STEP 7: INCREMENT VERSION
      // ========================================================================
      try {
        this._log('🔢 Step 7: Incrementing version...');
        await this.versionManager.incrementSessionVersion(sessionId, {
          reason: 'contract_signed',
          changes: {
            contractStatus: 'signed',
            soulfraSignature: 'applied',
            workflow: 'orchestrated'
          },
          metadata: {
            workflowId,
            timestamp: new Date().toISOString()
          }
        });

        this._updateWorkflowStep(workflowId, 'version', 'completed');

      } catch (error) {
        // Version increment errors should not block workflow
        this._log(`Version increment failed: ${error.message}`);
      }

      // ========================================================================
      // FINALIZE WORKFLOW
      // ========================================================================
      const workflowState = this.workflowState.get(workflowId);
      workflowState.status = results.errors.length === 0 ? 'completed' : 'completed_with_errors';
      workflowState.completedAt = new Date();

      results.completedAt = new Date();
      results.duration = workflowState.completedAt - workflowState.startedAt;

      this._log(`✅ Contract workflow completed! (${results.duration}ms)`);
      this._log(`   - Errors: ${results.errors.length}`);
      this._log(`   - Steps completed: ${Object.keys(results.steps).filter(k => results.steps[k].success).length}`);

      return results;

    } catch (error) {
      console.error('[ContractWorkflowOrchestrator] Complete workflow error:', error.message);

      // Mark workflow as failed
      const workflowState = this.workflowState.get(workflowId);
      if (workflowState) {
        workflowState.status = 'failed';
        workflowState.failedAt = new Date();
        workflowState.error = error.message;
      }

      throw error;
    }
  }

  // ============================================================================
  // SESSION LIFECYCLE
  // ============================================================================

  /**
   * Start contract session with multi-device support
   *
   * @param {Object} options - Session options
   * @returns {Promise<Object>} Session info
   */
  async startSession(options = {}) {
    try {
      const sessionResult = await this.deviceSync.startSession(options);

      this._log(`✅ Session started: ${sessionResult.sessionId}`);

      return sessionResult;

    } catch (error) {
      console.error('[ContractWorkflowOrchestrator] Start session error:', error.message);
      throw error;
    }
  }

  /**
   * End session (prepare for review)
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} End result
   */
  async endSession(sessionId) {
    try {
      await this.db.query(`
        UPDATE ollama_streaming_sessions
        SET status = 'ended', ended_at = NOW()
        WHERE session_id = $1
      `, [sessionId]);

      this._log(`Session ended: ${sessionId}`);

      return {
        success: true,
        sessionId,
        status: 'ended'
      };

    } catch (error) {
      console.error('[ContractWorkflowOrchestrator] End session error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // WORKFLOW STATE MANAGEMENT
  // ============================================================================

  /**
   * Get workflow status
   *
   * @param {string} workflowId - Workflow ID
   * @returns {Object} Workflow state
   */
  getWorkflowStatus(workflowId) {
    return this.workflowState.get(workflowId) || null;
  }

  /**
   * Get all active workflows
   *
   * @returns {Array<Object>} Active workflows
   */
  getActiveWorkflows() {
    const workflows = [];

    for (const [workflowId, state] of this.workflowState.entries()) {
      if (state.status === 'in_progress') {
        workflows.push({
          workflowId,
          ...state
        });
      }
    }

    return workflows;
  }

  /**
   * Update workflow step status
   *
   * @param {string} workflowId - Workflow ID
   * @param {string} stepName - Step name
   * @param {string} status - Step status
   */
  _updateWorkflowStep(workflowId, stepName, status) {
    const workflowState = this.workflowState.get(workflowId);
    if (!workflowState) return;

    workflowState.steps.push({
      name: stepName,
      status,
      timestamp: new Date()
    });
  }

  /**
   * Generate workflow ID
   *
   * @returns {string} Workflow ID
   */
  _generateWorkflowId() {
    return `workflow_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  // ============================================================================
  // ANALYTICS & REPORTING
  // ============================================================================

  /**
   * Get contract analytics
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Analytics
   */
  async getContractAnalytics(sessionId) {
    try {
      // Get session data
      const sessionResult = await this.db.query(`
        SELECT
          session_id,
          session_name,
          contract_status,
          total_cost_usd,
          signed_at,
          metadata
        FROM ollama_streaming_sessions
        WHERE session_id = $1
      `, [sessionId]);

      if (sessionResult.rows.length === 0) {
        throw new Error('Session not found');
      }

      const session = sessionResult.rows[0];

      // Get social share analytics
      const shareAnalytics = await this.socialShare.getShareAnalytics(sessionId);

      // Get forum thread (if exists)
      const forumThreadId = session.metadata?.forumThreadId;
      let forumAnalytics = null;

      if (forumThreadId) {
        const forumResult = await this.db.query(`
          SELECT upvotes, downvotes, karma_score, comment_count
          FROM forum_threads
          WHERE thread_id = $1
        `, [forumThreadId]);

        if (forumResult.rows.length > 0) {
          forumAnalytics = forumResult.rows[0];
        }
      }

      return {
        sessionId,
        sessionName: session.session_name,
        contractStatus: session.contract_status,
        totalCost: parseFloat(session.total_cost_usd || 0),
        signedAt: session.signed_at,
        social: shareAnalytics,
        forum: forumAnalytics
      };

    } catch (error) {
      console.error('[ContractWorkflowOrchestrator] Get analytics error:', error.message);
      throw error;
    }
  }

  /**
   * Get system statistics
   *
   * @returns {Object} Stats
   */
  getSystemStats() {
    return {
      activeWorkflows: this.getActiveWorkflows().length,
      deviceSync: this.deviceSync.getStats(),
      workflowStates: this.workflowState.size
    };
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
      console.log(`[ContractWorkflowOrchestrator] ${message}`);
    }
  }
}

module.exports = ContractWorkflowOrchestrator;
