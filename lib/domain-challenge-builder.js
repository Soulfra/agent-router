/**
 * Domain Challenge Builder
 *
 * Orchestrates AI code generation across 12 domain-specific Ollama models
 * Teacher/student pattern: Human judges competing implementations
 */

const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

class DomainChallengeBuilder {
  constructor(db, ollamaUrl = 'http://localhost:11434') {
    this.db = db;
    this.ollamaUrl = ollamaUrl;

    // Map domain names to their AI models
    this.domainModels = {
      'soulfra.com': 'soulfra-ai',
      'deathtodata.com': 'deathtodata-ai',
      'finishthisidea.com': 'finishthisidea-ai',
      'dealordelete.com': 'dealordelete-ai',
      'saveorsink.com': 'saveorsink-ai',
      'cringeproof.com': 'cringeproof-ai',
      'finishthisrepo.com': 'finishthisrepo-ai',
      'ipomyagent.com': 'ipomyagent-ai',
      'hollowtown.com': 'hollowtown-ai',
      'hookclinic.com': 'hookclinic-ai',
      'businessaiclassroom.com': 'businessaiclassroom-ai',
      'roughsparks.com': 'roughsparks-ai'
    };
  }

  /**
   * Create a new challenge and generate implementations from all domains
   */
  async createChallenge(challengePrompt, challengeType = 'component', expectedServices = []) {
    // 1. Create challenge in database
    const challengeQuery = `
      INSERT INTO domain_challenges (
        challenge_id, challenge_prompt, challenge_type, expected_services, status
      ) VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *;
    `;

    const challengeId = uuidv4();
    const challengeResult = await this.db.query(challengeQuery, [
      challengeId,
      challengePrompt,
      challengeType,
      expectedServices
    ]);

    const challenge = challengeResult.rows[0];

    // 2. Get all active domains
    const domainsQuery = `
      SELECT domain_id, domain_name, brand_name, primary_color, secondary_color, services
      FROM domain_portfolio
      WHERE status = 'active'
      ORDER BY domain_name;
    `;
    const domainsResult = await this.db.query(domainsQuery);
    const domains = domainsResult.rows;

    // 3. Generate implementations from each domain's AI model
    const implementations = [];

    for (const domain of domains) {
      try {
        console.log(`🤖 Generating implementation for ${domain.domain_name}...`);

        const implementation = await this.generateImplementation(
          challengeId,
          domain,
          challengePrompt,
          challengeType
        );

        implementations.push(implementation);

        console.log(`✅ ${domain.domain_name} completed (${implementation.code_length} chars)`);
      } catch (error) {
        console.error(`❌ ${domain.domain_name} failed:`, error.message);

        // Insert failed implementation with error message
        await this.db.query(`
          INSERT INTO domain_implementations (
            implementation_id, challenge_id, domain_id, model_name,
            implementation_code, description, syntax_valid
          ) VALUES ($1, $2, $3, $4, $5, $6, FALSE)
        `, [
          uuidv4(),
          challengeId,
          domain.domain_id,
          this.domainModels[domain.domain_name] || 'unknown',
          `// Error generating code: ${error.message}`,
          'Implementation failed to generate',
        ]);
      }
    }

    // 4. Update challenge status
    await this.db.query(`
      UPDATE domain_challenges
      SET status = 'judging'
      WHERE challenge_id = $1
    `, [challengeId]);

    return {
      challenge,
      implementations,
      total: implementations.length,
      domains: domains.length
    };
  }

  /**
   * Generate implementation from a specific domain's AI model
   */
  async generateImplementation(challengeId, domain, prompt, challengeType) {
    const modelName = this.domainModels[domain.domain_name];

    if (!modelName) {
      throw new Error(`No model configured for ${domain.domain_name}`);
    }

    // Enhance prompt with domain context
    const enhancedPrompt = `
${prompt}

Requirements:
- Use domain brand colors: ${domain.primary_color} (primary), ${domain.secondary_color} (secondary)
- Available services: ${domain.services ? domain.services.join(', ') : 'none'}
- Target output type: ${challengeType}

Return only the code implementation without explanation. Include comments to explain your design decisions.
    `.trim();

    const startTime = Date.now();

    // Call Ollama API
    const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
      model: modelName,
      prompt: enhancedPrompt,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9
      }
    });

    const generationTime = Date.now() - startTime;
    const code = response.data.response.trim();

    // Analyze code quality
    const codeAnalysis = this.analyzeCode(code, domain);

    // Insert implementation into database
    const implQuery = `
      INSERT INTO domain_implementations (
        implementation_id, challenge_id, domain_id, model_name,
        implementation_code, implementation_type, description,
        generation_time_ms, code_length, has_comments,
        uses_domain_colors, uses_expected_services
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;

    const implementationId = uuidv4();
    const values = [
      implementationId,
      challengeId,
      domain.domain_id,
      modelName,
      code,
      challengeType,
      `Implementation by ${domain.brand_name}`,
      generationTime,
      code.length,
      codeAnalysis.hasComments,
      codeAnalysis.usesDomainColors,
      codeAnalysis.usesExpectedServices
    ];

    const result = await this.db.query(implQuery, values);
    return result.rows[0];
  }

  /**
   * Analyze code quality metrics
   */
  analyzeCode(code, domain) {
    const hasComments = /\/\/|\/\*|\*\/|<!--/.test(code);

    // Check if domain colors are used
    const usesDomainColors = (
      code.includes(domain.primary_color) ||
      code.includes(domain.secondary_color)
    );

    // Check if services are referenced
    const usesExpectedServices = domain.services?.some(service =>
      code.toLowerCase().includes(service.toLowerCase())
    ) || false;

    return {
      hasComments,
      usesDomainColors,
      usesExpectedServices
    };
  }

  /**
   * Get challenge with all implementations (for judging interface)
   */
  async getChallengeDetails(challengeId) {
    const challengeQuery = `
      SELECT * FROM domain_challenges
      WHERE challenge_id = $1;
    `;
    const challengeResult = await this.db.query(challengeQuery, [challengeId]);

    if (challengeResult.rows.length === 0) {
      throw new Error('Challenge not found');
    }

    const challenge = challengeResult.rows[0];

    const implQuery = `
      SELECT
        di.*,
        dp.domain_name,
        dp.brand_name,
        dp.brand_tagline,
        dp.primary_color,
        dp.secondary_color
      FROM domain_implementations di
      JOIN domain_portfolio dp ON di.domain_id = dp.domain_id
      WHERE di.challenge_id = $1
      ORDER BY RANDOM();
    `;
    const implResult = await this.db.query(implQuery, [challengeId]);

    return {
      challenge,
      implementations: implResult.rows
    };
  }

  /**
   * Submit judgment for an implementation
   */
  async judgeImplementation(implementationId, sessionId, voteDirection, feedback = null) {
    const judgmentQuery = `
      INSERT INTO domain_judgments (
        judgment_id, implementation_id, session_id, vote_direction,
        teacher_comment, creativity_score, functionality_score,
        code_quality_score, brand_alignment_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const values = [
      uuidv4(),
      implementationId,
      sessionId,
      voteDirection,
      feedback?.comment || null,
      feedback?.creativity || null,
      feedback?.functionality || null,
      feedback?.codeQuality || null,
      feedback?.brandAlignment || null
    ];

    const result = await this.db.query(judgmentQuery, values);

    // Trigger score recalculation happens automatically via database trigger

    return result.rows[0];
  }

  /**
   * Get leaderboard of domain performance
   */
  async getLeaderboard() {
    const query = `SELECT * FROM challenge_leaderboard;`;
    const result = await this.db.query(query);
    return result.rows;
  }

  /**
   * Complete a challenge and determine winner
   */
  async completeChallenge(challengeId) {
    // Call database function to determine winner
    const query = `SELECT determine_challenge_winner($1) as winner_implementation_id;`;
    const result = await this.db.query(query, [challengeId]);

    const winnerImplId = result.rows[0].winner_implementation_id;

    // Get updated challenge details
    const challengeQuery = `
      SELECT
        dc.*,
        dp.domain_name as winner_domain,
        dp.brand_name as winner_brand
      FROM domain_challenges dc
      LEFT JOIN domain_portfolio dp ON dc.winner_domain_id = dp.domain_id
      WHERE dc.challenge_id = $1;
    `;
    const challengeResult = await this.db.query(challengeQuery, [challengeId]);

    return {
      challenge: challengeResult.rows[0],
      winner_implementation_id: winnerImplId
    };
  }

  /**
   * Get all challenges
   */
  async getAllChallenges(status = null) {
    let query = `SELECT * FROM challenge_details`;

    if (status) {
      query += ` WHERE status = $1`;
      const result = await this.db.query(query, [status]);
      return result.rows;
    }

    const result = await this.db.query(query);
    return result.rows;
  }

  /**
   * Export winning implementation for training data
   */
  async exportWinner(challengeId) {
    const query = `
      SELECT
        dc.challenge_prompt,
        dc.challenge_type,
        di.implementation_code,
        di.total_score,
        dp.domain_name,
        dp.brand_name,
        dp.primary_color,
        dp.secondary_color
      FROM domain_challenges dc
      JOIN domain_implementations di ON dc.winner_domain_id = di.domain_id
        AND di.challenge_id = dc.challenge_id
      JOIN domain_portfolio dp ON dc.winner_domain_id = dp.domain_id
      WHERE dc.challenge_id = $1;
    `;

    const result = await this.db.query(query, [challengeId]);

    if (result.rows.length === 0) {
      throw new Error('No winner found for this challenge');
    }

    return result.rows[0];
  }

  /**
   * Test Ollama connection and list available models
   */
  async testConnection() {
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`);
      return {
        connected: true,
        models: response.data.models || []
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
}

module.exports = DomainChallengeBuilder;
