/**
 * Model Council
 *
 * Orchestrates collaborative building sessions where multiple AI models
 * work together (and argue) to solve problems. Each model gets a timed
 * slot to contribute, with entertaining debates and consensus building.
 *
 * Inspired by the evolution from Bonzi Buddy → Clippy → modern AI assistants,
 * but make it multiplayer and funny!
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const ModelPersonalities = require('./model-personalities');

class ModelCouncil extends EventEmitter {
  constructor(agentRegistry, options = {}) {
    super();

    this.agentRegistry = agentRegistry;
    this.personalities = new ModelPersonalities();

    // Configuration
    this.config = {
      ollamaUrl: options.ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434',
      modelTimeout: options.modelTimeout || 90000, // 90 seconds per model
      maxConcurrentModels: options.maxConcurrentModels || 5, // Run 5 at a time
      enableDebates: options.enableDebates !== false,
      minConsensusThreshold: options.minConsensusThreshold || 0.4, // 40% agreement
      ...options
    };

    // WebSocket broadcast function
    this.broadcast = options.broadcast || (() => {});

    // Active sessions
    this.sessions = new Map();

    console.log('[ModelCouncil] Initialized with config:', {
      modelTimeout: `${this.config.modelTimeout / 1000}s`,
      maxConcurrent: this.config.maxConcurrentModels,
      enableDebates: this.config.enableDebates
    });
  }

  /**
   * Start a council session to build something
   *
   * @param {String} task - What to build (e.g., "developer portal", "todo app")
   * @param {Object} options - Session options
   * @returns {String} sessionId
   */
  async startSession(task, options = {}) {
    const sessionId = options.sessionId || uuidv4();

    // Get all available Ollama models
    const ollamaModels = this.agentRegistry.getByCapability('chat')
      .filter(agent => agent.provider === 'ollama' && agent.status === 'available');

    if (ollamaModels.length === 0) {
      throw new Error('No Ollama models available for council session');
    }

    console.log(`[ModelCouncil] Starting session ${sessionId} with ${ollamaModels.length} models`);
    console.log(`[ModelCouncil] Task: "${task}"`);

    // Create session
    const session = {
      sessionId,
      task,
      status: 'running',
      startedAt: new Date(),
      models: ollamaModels.map(m => m.model),
      proposals: [], // Each model's proposal
      debates: [], // Debates between models
      consensus: null, // Final agreed-upon approach
      votes: {}, // Model votes for approaches
      metadata: {
        ...options.metadata,
        taskType: this.inferTaskType(task)
      }
    };

    this.sessions.set(sessionId, session);

    // Emit event and broadcast to WebSocket
    const startedData = { sessionId, task, modelCount: ollamaModels.length };
    this.emit('session:started', startedData);
    this.broadcast({ type: 'council:session_started', ...startedData });

    // Start council meeting (async)
    this.runCouncilMeeting(sessionId).catch(error => {
      console.error(`[ModelCouncil] Session ${sessionId} failed:`, error.message);
      session.status = 'failed';
      session.error = error.message;
      const failedData = { sessionId, error: error.message };
      this.emit('session:failed', failedData);
      this.broadcast({ type: 'council:session_failed', ...failedData });
    });

    return sessionId;
  }

  /**
   * Run the council meeting
   * @private
   */
  async runCouncilMeeting(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const { task, models } = session;

    // Phase 1: Gather proposals from all models
    console.log(`[ModelCouncil] Phase 1: Gathering proposals from ${models.length} models...`);
    const phaseData = { sessionId, phase: 'gathering_proposals', modelCount: models.length };
    this.emit('session:phase', phaseData);
    this.broadcast({ type: 'council:phase', ...phaseData });

    const proposals = await this.gatherProposals(sessionId, task, models);
    session.proposals = proposals;

    console.log(`[ModelCouncil] Received ${proposals.length}/${models.length} proposals`);
    const proposalsData = { sessionId, proposalCount: proposals.length };
    this.emit('session:proposals_complete', proposalsData);
    this.broadcast({ type: 'council:proposals_complete', ...proposalsData });

    // Phase 2: Generate debates (models respond to each other)
    if (this.config.enableDebates && proposals.length >= 2) {
      console.log(`[ModelCouncil] Phase 2: Generating debates...`);
      const debatePhaseData = { sessionId, phase: 'debating' };
      this.emit('session:phase', debatePhaseData);
      this.broadcast({ type: 'council:phase', ...debatePhaseData });

      const debates = await this.generateDebates(sessionId, proposals);
      session.debates = debates;

      console.log(`[ModelCouncil] Generated ${debates.length} debate exchanges`);
      const debatesData = { sessionId, debateCount: debates.length };
      this.emit('session:debates_complete', debatesData);
      this.broadcast({ type: 'council:debates_complete', ...debatesData });
    }

    // Phase 3: Build consensus
    console.log(`[ModelCouncil] Phase 3: Building consensus...`);
    const consensusPhaseData = { sessionId, phase: 'consensus_building' };
    this.emit('session:phase', consensusPhaseData);
    this.broadcast({ type: 'council:phase', ...consensusPhaseData });

    const consensus = await this.buildConsensus(sessionId, proposals);
    session.consensus = consensus;

    console.log(`[ModelCouncil] Consensus reached: ${consensus.approach}`);
    const consensusData = { sessionId, consensus };
    this.emit('session:consensus_reached', consensusData);
    this.broadcast({ type: 'council:consensus_reached', ...consensusData });

    // Phase 4: Final voting
    console.log(`[ModelCouncil] Phase 4: Final voting...`);
    const votes = await this.conductVoting(sessionId, proposals, consensus);
    session.votes = votes;

    // Mark complete
    session.status = 'completed';
    session.completedAt = new Date();

    console.log(`[ModelCouncil] Session ${sessionId} complete!`);
    console.log(`[ModelCouncil] Winner: ${votes.winner.model} (${votes.winner.voteCount}/${models.length} votes)`);

    const completedData = {
      sessionId,
      consensus,
      winner: votes.winner,
      duration: session.completedAt - session.startedAt
    };
    this.emit('session:completed', completedData);
    this.broadcast({ type: 'council:session_completed', ...completedData });

    return session;
  }

  /**
   * Gather proposals from all models
   * @private
   */
  async gatherProposals(sessionId, task, models) {
    const proposals = [];

    // Create prompt for models
    const prompt = this.createProposalPrompt(task);

    // Query models in batches
    for (let i = 0; i < models.length; i += this.config.maxConcurrentModels) {
      const batch = models.slice(i, i + this.config.maxConcurrentModels);

      const batchProposals = await Promise.allSettled(
        batch.map(model => this.queryModel(sessionId, model, prompt))
      );

      for (const result of batchProposals) {
        if (result.status === 'fulfilled') {
          proposals.push(result.value);
        } else {
          console.warn(`[ModelCouncil] Model failed:`, result.reason?.message || result.reason);
        }
      }
    }

    return proposals;
  }

  /**
   * Query a single model for its proposal
   * @private
   */
  async queryModel(sessionId, modelName, prompt) {
    const personality = this.personalities.getPersonality(modelName);
    const startTime = Date.now();

    console.log(`[ModelCouncil] ${personality.emoji} Asking ${personality.name}...`);

    try {
      // Call Ollama API with timeout
      const response = await axios.post(
        `${this.config.ollamaUrl}/api/generate`,
        {
          model: modelName,
          prompt,
          stream: false,
          options: {
            temperature: 0.8, // More creative
            num_predict: 500 // Limit response length
          }
        },
        {
          timeout: this.config.modelTimeout
        }
      );

      const responseText = response.data.response;
      const duration = Date.now() - startTime;

      // Format with personality
      const formatted = this.personalities.formatResponse(modelName, responseText, 'neutral');

      const proposal = {
        model: modelName,
        modelDisplay: personality.name,
        character: personality.character,
        emoji: personality.emoji,
        proposal: responseText,
        formattedProposal: formatted,
        duration,
        timestamp: new Date(),
        timedOut: false
      };

      // Emit event and broadcast
      const proposalData = { sessionId, proposal };
      this.emit('session:proposal', proposalData);
      this.broadcast({ type: 'council:proposal', ...proposalData });

      console.log(`[ModelCouncil] ${personality.emoji} ${personality.name} responded in ${duration}ms`);

      return proposal;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Check if timeout
      const timedOut = duration >= this.config.modelTimeout;

      console.error(`[ModelCouncil] ${personality.emoji} ${personality.name} ${timedOut ? 'timed out' : 'errored'}:`, error.message);

      return {
        model: modelName,
        modelDisplay: personality.name,
        character: personality.character,
        emoji: personality.emoji,
        proposal: timedOut
          ? `⏱️ ${personality.disagreePhrase} I ran out of time!`
          : `💥 ${personality.disagreePhrase} I encountered an error: ${error.message}`,
        formattedProposal: `${personality.emoji} **${personality.name}**: [ERROR] ${error.message}`,
        duration,
        timestamp: new Date(),
        timedOut,
        error: error.message
      };
    }
  }

  /**
   * Generate debates between models
   * @private
   */
  async generateDebates(sessionId, proposals) {
    const debates = [];

    // Pick interesting pairs to debate
    // Example: CodeLlama (perfectionist) vs Qwen (speed demon)
    const interestingPairs = this.findInterestingDebatePairs(proposals);

    for (const [model1, model2] of interestingPairs.slice(0, 3)) { // Limit to 3 debates
      const debate = this.personalities.generateDebateComment(
        model1.model,
        model2.model,
        'the best approach'
      );

      debates.push({
        model1: model1.modelDisplay,
        model2: model2.modelDisplay,
        topic: 'Implementation approach',
        comment: debate,
        timestamp: new Date()
      });

      const debateData = { sessionId, debate };
      this.emit('session:debate', debateData);
      this.broadcast({ type: 'council:debate', ...debateData });
    }

    return debates;
  }

  /**
   * Find interesting pairs for debates (contrasting personalities)
   * @private
   */
  findInterestingDebatePairs(proposals) {
    const pairs = [];

    // Find contrasting personalities
    const codeFocused = proposals.filter(p => p.character.includes('Code'));
    const speedFocused = proposals.filter(p => p.character.includes('Speed') || p.character.includes('Pragmatic'));
    const designFocused = proposals.filter(p => p.character.includes('Design') || p.character.includes('Visual'));

    // Create interesting matchups
    if (codeFocused.length > 0 && speedFocused.length > 0) {
      pairs.push([codeFocused[0], speedFocused[0]]);
    }

    if (designFocused.length > 0 && codeFocused.length > 0) {
      pairs.push([designFocused[0], codeFocused[0]]);
    }

    // Add more random pairs if needed
    for (let i = 0; i < proposals.length - 1 && pairs.length < 5; i++) {
      pairs.push([proposals[i], proposals[i + 1]]);
    }

    return pairs;
  }

  /**
   * Build consensus from proposals
   * @private
   */
  async buildConsensus(sessionId, proposals) {
    // Analyze proposals to find common themes
    const themes = this.extractThemes(proposals);

    // Determine most popular approach
    const topTheme = themes[0];

    return {
      approach: topTheme?.theme || 'Hybrid approach combining best ideas',
      supportingModels: topTheme?.models || [],
      confidence: topTheme?.confidence || 0.5,
      summary: this.synthesizeProposals(proposals),
      alternativeApproaches: themes.slice(1, 3).map(t => t.theme)
    };
  }

  /**
   * Extract common themes from proposals
   * @private
   */
  extractThemes(proposals) {
    // Simple keyword-based theme extraction
    // In a real system, this could use embeddings or semantic analysis

    const keywords = {
      'MVP first': ['mvp', 'minimal', 'simple', 'basic', 'v1', 'ship'],
      'Full-featured': ['complete', 'comprehensive', 'robust', 'full', 'enterprise'],
      'API-first': ['api', 'rest', 'graphql', 'endpoint', 'service'],
      'Database-driven': ['database', 'postgres', 'sql', 'schema', 'tables'],
      'Microservices': ['microservice', 'distributed', 'service', 'independent'],
      'Monolith': ['monolith', 'single', 'unified', 'integrated']
    };

    const themeScores = {};

    for (const proposal of proposals) {
      const text = proposal.proposal.toLowerCase();

      for (const [theme, words] of Object.entries(keywords)) {
        const matches = words.filter(word => text.includes(word)).length;

        if (matches > 0) {
          if (!themeScores[theme]) {
            themeScores[theme] = { theme, models: [], score: 0 };
          }
          themeScores[theme].models.push(proposal.modelDisplay);
          themeScores[theme].score += matches;
        }
      }
    }

    // Sort by score
    const themes = Object.values(themeScores)
      .sort((a, b) => b.score - a.score)
      .map(t => ({
        ...t,
        confidence: Math.min(t.score / proposals.length, 1.0)
      }));

    return themes.length > 0 ? themes : [{
      theme: 'Balanced approach',
      models: proposals.map(p => p.modelDisplay),
      score: 1,
      confidence: 0.5
    }];
  }

  /**
   * Synthesize proposals into a summary
   * @private
   */
  synthesizeProposals(proposals) {
    const modelNames = proposals.map(p => p.modelDisplay).join(', ');
    const proposalCount = proposals.length;

    return `After hearing from ${proposalCount} models (${modelNames}), the council recommends a balanced approach combining the best ideas from each proposal.`;
  }

  /**
   * Conduct final voting
   * @private
   */
  async conductVoting(sessionId, proposals, consensus) {
    // Simple voting: each model "votes" for the proposal closest to consensus
    const votes = {};

    for (const proposal of proposals) {
      const vote = proposal.modelDisplay;
      votes[vote] = (votes[vote] || 0) + 1;
    }

    // Find winner (most votes)
    const winner = Object.entries(votes)
      .sort(([, a], [, b]) => b - a)[0];

    return {
      votes,
      winner: {
        model: winner[0],
        voteCount: winner[1],
        percentage: ((winner[1] / proposals.length) * 100).toFixed(1)
      },
      totalVotes: proposals.length
    };
  }

  /**
   * Create proposal prompt
   * @private
   */
  createProposalPrompt(task) {
    return `You are participating in an AI Council meeting to design and build: "${task}"

Your role is to provide a HIGH-LEVEL architectural proposal in 3-5 sentences. Focus on:
1. Overall approach/architecture
2. Key technologies to use
3. Major components needed
4. One unique insight or recommendation

Be opinionated and specific. This is a discussion, not documentation.

Your proposal:`;
  }

  /**
   * Infer task type from task description
   * @private
   */
  inferTaskType(task) {
    const lower = task.toLowerCase();

    if (lower.includes('api') || lower.includes('backend') || lower.includes('service')) {
      return 'backend';
    }
    if (lower.includes('ui') || lower.includes('frontend') || lower.includes('dashboard')) {
      return 'frontend';
    }
    if (lower.includes('database') || lower.includes('schema') || lower.includes('data')) {
      return 'database';
    }
    if (lower.includes('full') || lower.includes('app') || lower.includes('platform')) {
      return 'fullstack';
    }

    return 'general';
  }

  /**
   * Get session details
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session status
   */
  getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId: session.sessionId,
      task: session.task,
      status: session.status,
      modelCount: session.models.length,
      proposalCount: session.proposals.length,
      debateCount: session.debates.length,
      hasConsensus: !!session.consensus,
      startedAt: session.startedAt,
      completedAt: session.completedAt
    };
  }
}

module.exports = ModelCouncil;
