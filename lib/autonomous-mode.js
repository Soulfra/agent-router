/**
 * Autonomous Mode - Self-Building System Orchestrator
 *
 * This is the "copilot mode" that connects all autonomous systems:
 * - Builder Agent (generates code)
 * - Model Council (multi-model debate & consensus)
 * - Pattern Learner (learns from history)
 * - Code Indexer (finds existing code)
 * - Browser Agent (tests UI)
 *
 * Vision: You describe what you want, the system builds it autonomously.
 *
 * Example:
 *   User: "Build a visitor counter widget"
 *   System: *searches existing code* → *model debate* → *generates* → *tests* → *deploys*
 *   Time: 3 minutes instead of 2 hours
 */

const BuilderAgent = require('./builder-agent');
const ModelCouncil = require('./model-council');
const PatternLearner = require('./pattern-learner');
const CodeIndexer = require('./code-indexer');
const IntentParser = require('./intent-parser');

class AutonomousMode {
  constructor(options = {}) {
    this.db = options.db;
    this.agentRegistry = options.agentRegistry;
    this.broadcast = options.broadcast || (() => {});
    this.enabled = options.enabled !== false; // Default ON

    // Initialize subsystems
    this.builder = new BuilderAgent({
      ollama: 'deepseek-coder:33b',
      broadcast: this.broadcast,
      db: this.db // Pass db so Builder can use Code Indexer
    });

    this.council = new ModelCouncil(this.agentRegistry, {
      broadcast: this.broadcast,
      enableDebates: true,
      modelTimeout: 90000
    });

    this.patternLearner = new PatternLearner(this.db);
    this.codeIndexer = new CodeIndexer(this.db);
    this.intentParser = new IntentParser();

    // State
    this.activeSessions = new Map();
    this.history = [];

    console.log('[AutonomousMode] Initialized', {
      enabled: this.enabled,
      systems: ['Builder', 'Council', 'PatternLearner', 'CodeIndexer', 'IntentParser']
    });
  }

  /**
   * Main entry point: User describes what they want
   *
   * @param {string} prompt - User's natural language request
   * @param {object} options - Additional options
   * @returns {Promise<object>} - Build result
   */
  async handleRequest(prompt, options = {}) {
    if (!this.enabled) {
      return {
        success: false,
        message: 'Autonomous mode is disabled. Enable it first.',
        manualMode: true
      };
    }

    const sessionId = options.sessionId || require('crypto').randomUUID();
    const startTime = Date.now();

    try {
      console.log(`[AutonomousMode] Processing: "${prompt}"`);

      // Save session to database
      if (this.db) {
        await this.db.query(
          `INSERT INTO autonomous_sessions (session_id, prompt, created_at)
           VALUES ($1, $2, NOW())`,
          [sessionId, prompt]
        );
      }

      this.broadcast({
        type: 'autonomous_start',
        sessionId,
        prompt,
        timestamp: new Date().toISOString()
      });

      // Step 1: Parse intent
      const intent = await this.parseIntent(prompt);
      this.broadcast({
        type: 'autonomous_intent',
        sessionId,
        intent
      });

      // Step 2: Search for similar patterns
      const similarPatterns = await this.findSimilarPatterns(intent);
      this.broadcast({
        type: 'autonomous_patterns',
        sessionId,
        patterns: similarPatterns
      });

      // Step 3: Search existing codebase
      const existingCode = await this.searchExistingCode(intent);
      this.broadcast({
        type: 'autonomous_existing_code',
        sessionId,
        existingCode
      });

      // Step 4: Model Council debate
      const councilResult = await this.startCouncilSession(prompt, {
        sessionId,
        context: {
          intent,
          similarPatterns,
          existingCode
        }
      });

      this.broadcast({
        type: 'autonomous_council_complete',
        sessionId,
        consensus: councilResult.consensus
      });

      // Step 5: Builder Agent implements consensus
      const buildResult = await this.implement(councilResult, options);

      // Step 6: Learn from this session
      await this.learnFromSession(sessionId, {
        prompt,
        intent,
        patterns: similarPatterns,
        existingCode,
        consensus: councilResult.consensus,
        result: buildResult
      });

      // Update database with results
      if (this.db) {
        await this.db.query(
          `UPDATE autonomous_sessions
           SET intent = $1,
               similar_patterns = $2,
               existing_code = $3,
               council_session_id = $4,
               consensus = $5,
               result = $6,
               success = $7,
               files_generated = $8,
               tests_passed = $9,
               tests_failed = $10,
               completed_at = NOW()
           WHERE session_id = $11`,
          [
            JSON.stringify(intent),
            JSON.stringify(similarPatterns),
            JSON.stringify(existingCode),
            councilResult.sessionId || null,
            JSON.stringify(councilResult.consensus),
            JSON.stringify(buildResult),
            true,
            JSON.stringify(buildResult.files || []),
            buildResult.testsPassed || 0,
            buildResult.testsFailed || 0,
            sessionId
          ]
        );
      }

      this.broadcast({
        type: 'autonomous_complete',
        sessionId,
        result: buildResult
      });

      const timeTaken = Date.now() - startTime;

      return {
        success: true,
        sessionId,
        result: buildResult,
        timeTaken
      };

    } catch (error) {
      console.error('[AutonomousMode] Error:', error);

      // Update database with error
      if (this.db) {
        await this.db.query(
          `UPDATE autonomous_sessions
           SET success = $1,
               error_message = $2,
               completed_at = NOW()
           WHERE session_id = $3`,
          [false, error.message, sessionId]
        );
      }

      this.broadcast({
        type: 'autonomous_error',
        sessionId,
        error: error.message
      });

      return {
        success: false,
        sessionId,
        error: error.message
      };
    }
  }

  /**
   * Parse user intent from natural language
   */
  async parseIntent(prompt) {
    const intent = this.intentParser.parse(prompt);

    // Enhance with AI understanding
    const enhanced = {
      ...intent,
      category: this.categorizeRequest(prompt),
      complexity: this.estimateComplexity(prompt),
      requiredSystems: this.identifyRequiredSystems(prompt)
    };

    console.log('[AutonomousMode] Parsed intent:', enhanced);
    return enhanced;
  }

  /**
   * Find similar patterns we've built before
   */
  async findSimilarPatterns(intent) {
    try {
      const patterns = await this.patternLearner.findSimilar(intent.action, {
        limit: 5,
        minSimilarity: 0.6
      });

      console.log(`[AutonomousMode] Found ${patterns.length} similar patterns`);
      return patterns;
    } catch (error) {
      console.error('[AutonomousMode] Pattern search error:', error);
      return [];
    }
  }

  /**
   * Search existing codebase for related code
   */
  async searchExistingCode(intent) {
    try {
      // Generate search queries from intent
      const queries = [
        intent.action,
        intent.target,
        ...(intent.parameters || [])
      ].filter(Boolean);

      const results = [];

      for (const query of queries) {
        const matches = await this.codeIndexer.search(query, {
          limit: 3,
          threshold: 0.7
        });

        results.push(...matches);
      }

      // Deduplicate
      const unique = Array.from(new Set(results.map(r => r.file_path)))
        .map(path => results.find(r => r.file_path === path));

      console.log(`[AutonomousMode] Found ${unique.length} relevant code files`);
      return unique;
    } catch (error) {
      console.error('[AutonomousMode] Code search error:', error);
      return [];
    }
  }

  /**
   * Start Model Council collaborative session
   */
  async startCouncilSession(prompt, options) {
    try {
      const sessionId = await this.council.startSession(prompt, {
        ...options,
        metadata: {
          autonomousMode: true,
          ...options.context
        }
      });

      // Wait for council to finish
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Council session timeout'));
        }, 300000); // 5 minute timeout

        this.council.once(`session_complete_${sessionId}`, (result) => {
          clearTimeout(timeout);
          resolve(result);
        });

        this.council.once(`session_error_${sessionId}`, (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error) {
      console.error('[AutonomousMode] Council error:', error);
      throw error;
    }
  }

  /**
   * Builder Agent implements the consensus
   */
  async implement(councilResult, options = {}) {
    try {
      const { consensus, proposals } = councilResult;

      // Create implementation spec from consensus
      const spec = this.createImplementationSpec(consensus, proposals);

      // Load spec into Builder Agent
      await this.builder.loadSpecFromString(spec);

      // Execute build
      const result = await this.builder.executeAll({
        autoTest: options.autoTest !== false,
        autoDeploy: options.autoDeploy === true
      });

      return result;

    } catch (error) {
      console.error('[AutonomousMode] Implementation error:', error);
      throw error;
    }
  }

  /**
   * Create implementation spec from Model Council consensus
   */
  createImplementationSpec(consensus, proposals) {
    // Convert consensus into actionable spec
    return `
# Implementation Spec: ${consensus.title || 'Feature'}

## Objective
${consensus.description}

## Approach
${consensus.approach}

## Components
${consensus.components ? consensus.components.map((c, i) => `${i + 1}. ${c}`).join('\n') : 'TBD'}

## Implementation Steps
${consensus.steps ? consensus.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : 'TBD'}

## Model Proposals (for reference)
${proposals.map(p => `- ${p.model}: ${p.summary}`).join('\n')}

## Testing Requirements
- Unit tests for core functionality
- Integration tests for API endpoints
- UI testing if applicable

## Deployment Checklist
- [ ] Code generated
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Git commit created
`;
  }

  /**
   * Learn from this autonomous session
   */
  async learnFromSession(sessionId, data) {
    try {
      // Record pattern with PatternLearner
      await this.patternLearner.recordPattern({
        sessionId,
        action: data.intent.action,
        context: data.intent,
        similarPatterns: data.patterns,
        existingCode: data.existingCode,
        consensus: data.consensus,
        result: data.result,
        success: data.result.success
      });

      // Save patterns to database
      if (this.db && data.patterns && data.patterns.length > 0) {
        for (const pattern of data.patterns) {
          await this.db.query(
            `INSERT INTO autonomous_patterns
             (session_id, action, context, similarity_score, matched_session_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              sessionId,
              data.intent.action,
              JSON.stringify(pattern.context || {}),
              pattern.similarity || 0,
              pattern.sessionId || null
            ]
          );
        }
      }

      // Save code matches to database
      if (this.db && data.existingCode && data.existingCode.length > 0) {
        for (const codeMatch of data.existingCode) {
          await this.db.query(
            `INSERT INTO autonomous_code_matches
             (session_id, file_path, match_score, match_reason)
             VALUES ($1, $2, $3, $4)`,
            [
              sessionId,
              codeMatch.file_path || codeMatch.path,
              codeMatch.similarity || codeMatch.score || 0,
              codeMatch.reason || 'Semantic similarity'
            ]
          );
        }
      }

      // Update history
      this.history.push({
        sessionId,
        timestamp: new Date(),
        prompt: data.prompt,
        success: data.result.success
      });

      console.log('[AutonomousMode] Session learned');
    } catch (error) {
      console.error('[AutonomousMode] Learning error:', error);
    }
  }

  /**
   * Categorize request type
   */
  categorizeRequest(prompt) {
    const lower = prompt.toLowerCase();

    if (lower.match(/build|create|make|add/)) return 'create';
    if (lower.match(/fix|debug|repair/)) return 'fix';
    if (lower.match(/improve|optimize|refactor/)) return 'improve';
    if (lower.match(/test|check|verify/)) return 'test';
    if (lower.match(/explain|document|describe/)) return 'explain';

    return 'unknown';
  }

  /**
   * Estimate complexity (simple heuristic)
   */
  estimateComplexity(prompt) {
    const words = prompt.split(/\s+/).length;
    const features = (prompt.match(/and|with|also|plus/gi) || []).length;

    if (words > 50 || features > 5) return 'high';
    if (words > 20 || features > 2) return 'medium';
    return 'low';
  }

  /**
   * Identify which systems are needed
   */
  identifyRequiredSystems(prompt) {
    const systems = [];
    const lower = prompt.toLowerCase();

    if (lower.match(/ui|interface|page|button|form/)) systems.push('ui');
    if (lower.match(/api|endpoint|route/)) systems.push('api');
    if (lower.match(/database|table|migration/)) systems.push('database');
    if (lower.match(/websocket|realtime|live/)) systems.push('websocket');
    if (lower.match(/test|spec/)) systems.push('testing');

    return systems;
  }

  /**
   * Enable/disable autonomous mode
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`[AutonomousMode] ${enabled ? 'Enabled' : 'Disabled'}`);

    this.broadcast({
      type: 'autonomous_mode_changed',
      enabled
    });
  }

  /**
   * Get autonomous mode status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      activeSessions: this.activeSessions.size,
      historyCount: this.history.length,
      systems: {
        builder: !!this.builder,
        council: !!this.council,
        patternLearner: !!this.patternLearner,
        codeIndexer: !!this.codeIndexer,
        intentParser: !!this.intentParser
      }
    };
  }

  /**
   * Get session history
   */
  getHistory(limit = 10) {
    return this.history.slice(-limit).reverse();
  }
}

module.exports = AutonomousMode;
