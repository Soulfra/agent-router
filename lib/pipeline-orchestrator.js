/**
 * Pipeline Orchestrator
 *
 * Master coordinator for voice-driven automated workflows.
 * Manages the complete pipeline:
 * 1. Receive voice command (transcribed)
 * 2. Parse intent
 * 3. Route to 12 domain AIs
 * 4. Collect and judge results
 * 5. Build final artifact
 * 6. Deploy
 * 7. Notify user
 */

const { v4: uuidv4 } = require('uuid');
const IntentParser = require('./intent-parser');
const DomainChallengeBuilder = require('./domain-challenge-builder');
const EventEmitter = require('events');

class PipelineOrchestrator extends EventEmitter {
  constructor(db, config = {}) {
    super();
    this.db = db;
    this.intentParser = new IntentParser();
    this.challengeBuilder = new DomainChallengeBuilder(
      db,
      config.ollamaUrl || 'http://localhost:11434'
    );

    // Active jobs (in-memory queue)
    this.jobs = new Map();

    // Configuration
    this.config = {
      maxConcurrentJobs: config.maxConcurrentJobs || 3,
      defaultTimeout: config.defaultTimeout || 120000, // 2 minutes
      autoJudge: config.autoJudge !== false, // Auto-pick winner
      autoDeploy: config.autoDeploy !== false // Auto-deploy to GitHub
    };
  }

  /**
   * Submit a voice command for processing
   *
   * @param {String} text - Transcribed voice command
   * @param {Object} metadata - User session, source, etc.
   * @returns {String} - Job ID for tracking
   */
  async submit(text, metadata = {}) {
    // Parse intent
    const intent = this.intentParser.parse(text);

    // Validate
    const validation = this.intentParser.validate(intent);
    if (!validation.valid) {
      throw new Error(`Invalid command: ${validation.errors.join(', ')}`);
    }

    // Create job
    const jobId = uuidv4();
    const job = {
      jobId,
      intent,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        source: metadata.source || 'voice'
      },
      status: 'queued',
      progress: 0,
      steps: [],
      error: null,
      result: null
    };

    this.jobs.set(jobId, job);
    console.log(`[Pipeline] Job ${jobId} queued: ${intent.action} ${intent.artifact}`);

    // Emit event
    this.emit('job:created', job);

    // Start processing (async)
    this.process(jobId).catch(error => {
      console.error(`[Pipeline] Job ${jobId} failed:`, error.message);
      this.updateJob(jobId, {
        status: 'failed',
        error: error.message
      });
      this.emit('job:failed', { jobId, error: error.message });
    });

    return jobId;
  }

  /**
   * Process a job through the pipeline
   */
  async process(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    try {
      // Update status
      this.updateJob(jobId, { status: 'processing', progress: 10 });
      this.emit('job:started', job);

      // Step 1: Route to appropriate pipeline
      const pipelineType = this.determinePipeline(job.intent);
      this.addStep(jobId, `Routing to ${pipelineType} pipeline`);

      // Step 2: Generate from all domain AIs
      this.updateJob(jobId, { progress: 20 });
      const implementations = await this.generateImplementations(jobId, job.intent);

      this.addStep(jobId, `Generated ${implementations.length} implementations from domain AIs`);
      this.updateJob(jobId, { progress: 50 });

      // Step 3: Judge and select winner (if auto-judge enabled)
      let winner = null;
      if (this.config.autoJudge) {
        winner = await this.selectWinner(implementations);
        this.addStep(jobId, `Selected winner: ${winner.domain_name} (score: ${winner.total_score})`);
        this.updateJob(jobId, { progress: 70 });
      } else {
        // Require manual judging
        this.updateJob(jobId, {
          status: 'awaiting_judgment',
          progress: 50,
          implementations
        });
        this.emit('job:awaiting_judgment', { jobId, implementations });
        return; // Wait for manual judgment
      }

      // Step 4: Build final artifact
      const artifact = await this.buildArtifact(job.intent, winner);
      this.addStep(jobId, `Built artifact: ${artifact.type}`);
      this.updateJob(jobId, { progress: 85 });

      // Step 5: Deploy (if enabled)
      let deploymentUrl = null;
      if (this.config.autoDeploy) {
        deploymentUrl = await this.deploy(artifact, job.intent);
        this.addStep(jobId, `Deployed to: ${deploymentUrl}`);
      }
      this.updateJob(jobId, { progress: 95 });

      // Step 6: Complete
      this.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        result: {
          winner,
          artifact,
          deploymentUrl
        }
      });

      this.emit('job:completed', {
        jobId,
        artifact,
        deploymentUrl
      });

      console.log(`[Pipeline] Job ${jobId} completed successfully`);

    } catch (error) {
      throw error;
    }
  }

  /**
   * Determine which pipeline to use
   */
  determinePipeline(intent) {
    if (intent.artifact === 'logo' || intent.artifact === 'svg') {
      return 'graphic';
    } else if (intent.artifact === 'component') {
      return 'component';
    } else if (intent.artifact === 'page') {
      return 'page';
    } else if (intent.artifact === 'animation') {
      return 'animation';
    }
    return 'generic';
  }

  /**
   * Generate implementations from all domain AIs
   */
  async generateImplementations(jobId, intent) {
    // Convert intent to challenge prompt
    const prompt = this.intentParser.toChallengePrompt(intent);

    console.log(`[Pipeline] Creating challenge: "${prompt}"`);

    // Determine challenge type
    const challengeType = intent.artifact === 'component' ? 'component' :
                          intent.artifact === 'logo' ? 'svg' :
                          intent.artifact === 'page' ? 'feature' : 'component';

    // Create challenge
    const result = await this.challengeBuilder.createChallenge(
      prompt,
      challengeType,
      intent.attributes.services || []
    );

    // Store challenge ID with job
    this.updateJob(jobId, {
      challengeId: result.challenge.challenge_id
    });

    return result.implementations;
  }

  /**
   * Auto-select winner based on scores
   */
  async selectWinner(implementations) {
    if (implementations.length === 0) {
      throw new Error('No implementations to judge');
    }

    // Calculate scores for each
    const scored = implementations.map(impl => {
      let score = 0;

      // Automatic quality metrics
      if (impl.syntax_valid) score += 10;
      if (impl.has_comments) score += 5;
      if (impl.uses_domain_colors) score += 15;
      if (impl.uses_expected_services) score += 10;

      // Code length bonus
      if (impl.code_length >= 100 && impl.code_length <= 1000) {
        score += 10;
      } else if (impl.code_length >= 50 && impl.code_length <= 2000) {
        score += 5;
      }

      // Generation time bonus (faster = better)
      if (impl.generation_time_ms < 5000) score += 5;
      else if (impl.generation_time_ms < 10000) score += 3;

      return {
        ...impl,
        total_score: score
      };
    });

    // Sort by score
    scored.sort((a, b) => b.total_score - a.total_score);

    // Return winner
    return scored[0];
  }

  /**
   * Build final artifact from winning implementation
   */
  async buildArtifact(intent, winner) {
    const artifact = {
      type: intent.artifact,
      domain: winner.domain_name,
      brand: winner.brand_name,
      code: winner.implementation_code,
      metadata: {
        colors: {
          primary: winner.primary_color,
          secondary: winner.secondary_color
        },
        generatedBy: winner.model_name,
        score: winner.total_score,
        generationTime: winner.generation_time_ms
      }
    };

    // Save to database (for history/tracking)
    await this.saveArtifact(artifact);

    return artifact;
  }

  /**
   * Deploy artifact (placeholder - will be implemented by auto-deployer)
   */
  async deploy(artifact, intent) {
    // This will be handled by AutoDeployer class
    // For now, return mock URL
    const filename = `${intent.artifact}-${Date.now()}.html`;
    return `https://your-domain.com/artifacts/${filename}`;
  }

  /**
   * Save artifact to database
   */
  async saveArtifact(artifact) {
    const query = `
      INSERT INTO pipeline_artifacts (
        artifact_id, artifact_type, domain_name, code_content, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *;
    `;

    const values = [
      uuidv4(),
      artifact.type,
      artifact.domain,
      artifact.code,
      JSON.stringify(artifact.metadata)
    ];

    try {
      const result = await this.db.query(query, values);
      return result.rows[0];
    } catch (error) {
      // Table might not exist yet, ignore error
      console.warn('[Pipeline] Failed to save artifact to database:', error.message);
      return null;
    }
  }

  /**
   * Get job status
   */
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  /**
   * Get active jobs
   */
  getActiveJobs() {
    return Array.from(this.jobs.values())
      .filter(job => job.status === 'processing' || job.status === 'queued');
  }

  /**
   * Update job
   */
  updateJob(jobId, updates) {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
      this.emit('job:updated', job);
    }
  }

  /**
   * Add step to job
   */
  addStep(jobId, description) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.steps.push({
        description,
        timestamp: new Date().toISOString()
      });
      this.emit('job:step', { jobId, description });
    }
  }

  /**
   * Cancel job
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && job.status !== 'completed' && job.status !== 'failed') {
      this.updateJob(jobId, {
        status: 'cancelled',
        error: 'Cancelled by user'
      });
      this.emit('job:cancelled', { jobId });
      return true;
    }
    return false;
  }

  /**
   * Clean up old jobs (keep last 100)
   */
  cleanup() {
    const jobs = Array.from(this.jobs.values())
      .sort((a, b) => new Date(b.metadata.createdAt) - new Date(a.metadata.createdAt));

    if (jobs.length > 100) {
      const toRemove = jobs.slice(100);
      toRemove.forEach(job => {
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          this.jobs.delete(job.jobId);
        }
      });
      console.log(`[Pipeline] Cleaned up ${toRemove.length} old jobs`);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const jobs = Array.from(this.jobs.values());

    return {
      total: jobs.length,
      queued: jobs.filter(j => j.status === 'queued').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length,
      averageProcessingTime: this.calculateAverageTime(jobs.filter(j => j.status === 'completed'))
    };
  }

  /**
   * Calculate average processing time
   */
  calculateAverageTime(jobs) {
    if (jobs.length === 0) return 0;

    const times = jobs.map(job => {
      const created = new Date(job.metadata.createdAt);
      const lastStep = job.steps[job.steps.length - 1];
      if (!lastStep) return 0;

      const completed = new Date(lastStep.timestamp);
      return completed - created;
    });

    const sum = times.reduce((a, b) => a + b, 0);
    return Math.round(sum / times.length);
  }
}

module.exports = PipelineOrchestrator;
