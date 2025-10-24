/**
 * Command Router - Natural Language Command Processing
 *
 * Routes plain text commands to appropriate tools:
 * - Ragebait generator
 * - Podcast generator
 * - File explorer
 * - Vanity handles
 * - Artifact builder
 * - Brand presentation
 *
 * Usage:
 *   const router = new CommandRouter({ llmRouter });
 *   const result = await router.route("make ragebait about kubernetes");
 */

const MultiLLMRouter = require('./multi-llm-router');

class CommandRouter {
  constructor(options = {}) {
    this.llmRouter = options.llmRouter || new MultiLLMRouter({
      enableFallback: true,
      enableCostTracking: true
    });

    // CalRiven persona for personality and rules
    this.calrivenPersona = null;  // Lazy loaded
    this.brand = options.brand || 'calriven';  // Default brand

    // Tool registry
    this.tools = {
      ragebait: null,  // Lazy loaded
      podcast: null,
      fileExplorer: null,
      vanityHandles: null,
      artifactBuilder: null,
      brandPresentation: null,
      watermark: null
    };

    // Personality rules (customer isn't always right)
    this.personalityRules = {
      pushback: true,  // Challenge the user when appropriate
      sarcasm: true,   // Use sarcasm for obvious requests
      honesty: true,   // Be brutally honest
      catchphrases: ['WE ALREADY HAVE THIS', 'Wire it together', 'Sign everything']
    };

    console.log('[CommandRouter] Initialized with brand:', this.brand);
  }

  /**
   * Route command to appropriate tool
   *
   * @param {string} command - Plain text command
   * @param {Object} context - Additional context (userId, sessionId, etc.)
   * @returns {Promise<Object>} { success, tool, message, data, status }
   */
  async route(command, context = {}) {
    console.log(`[CommandRouter] Processing: "${command}"`);

    try {
      // Step 1: Apply personality filter (CalRiven rules)
      const personalityCheck = await this._applyPersonalityFilter(command, context);
      if (!personalityCheck.allowed) {
        return {
          success: false,
          tool: null,
          message: personalityCheck.message,
          data: { personality: 'calriven', reason: personalityCheck.reason },
          status: 'rejected'
        };
      }

      // Step 2: Parse command intent and extract parameters
      const intent = await this._parseIntent(command);

      console.log(`[CommandRouter] Intent: ${intent.tool} - ${intent.action}`);

      // Step 3: Route to appropriate tool
      const result = await this._executeIntent(intent, context);

      // Step 4: Apply CalRiven personality to response
      const brandedResponse = await this._applyBrandPersonality(result, command);

      return {
        success: true,
        tool: intent.tool,
        action: intent.action,
        message: brandedResponse.message,
        data: brandedResponse.data,
        status: 'success',
        brand: this.brand
      };

    } catch (error) {
      console.error('[CommandRouter] Error:', error.message);
      return {
        success: false,
        tool: null,
        message: `Error: ${error.message}`,
        data: null,
        status: 'error'
      };
    }
  }

  /**
   * Parse command to determine intent and parameters (simple regex-based for now)
   */
  async _parseIntent(command) {
    const cmd = command.toLowerCase().trim();

    // Ragebait patterns
    if (cmd.match(/\b(make|generate|create)\s+(ragebait|meme)\s+about\s+(\w+)/i)) {
      const topic = cmd.match(/about\s+(\w+)/i)[1];
      return {
        tool: 'ragebait',
        action: 'generate',
        parameters: { topic },
        confidence: 1.0
      };
    }

    // Podcast patterns
    if (cmd.match(/\b(make|generate|create)\s+podcast/i)) {
      return {
        tool: 'podcast',
        action: 'generate',
        parameters: { source: 'today' },
        confidence: 1.0
      };
    }

    // File explorer patterns
    if (cmd.match(/\b(check|scan|show|list)\s+(all\s+)?(repos|repositories)/i)) {
      return {
        tool: 'file-explorer',
        action: 'scan',
        parameters: {},
        confidence: 1.0
      };
    }

    // Vanity handles patterns
    if (cmd.match(/\b(is|check)\s+@?(\w+)\s+(available|taken)/i)) {
      const match = cmd.match(/\b(is|check)\s+@?(\w+)\s+(available|taken)/i);
      const handle = match[2];  // Extract the second capture group
      return {
        tool: 'vanity-handles',
        action: 'check',
        parameters: { handle },
        confidence: 1.0
      };
    }

    if (cmd.match(/\b(claim|get|take)\s+@?(\w+)/i)) {
      const handle = cmd.match(/@?(\w+)/)[1];
      return {
        tool: 'vanity-handles',
        action: 'claim',
        parameters: { handle },
        confidence: 1.0
      };
    }

    if (cmd.match(/\b(show|list|get)\s+premium\s+handles/i)) {
      return {
        tool: 'vanity-handles',
        action: 'premium',
        parameters: {},
        confidence: 1.0
      };
    }

    // Artifact builder patterns
    if (cmd.match(/\b(build|create|make)\s+(logo|svg|icon)/i)) {
      return {
        tool: 'artifact-builder',
        action: 'build',
        parameters: { type: 'logo', prompt: command },
        confidence: 1.0
      };
    }

    // Watermark patterns
    if (cmd.match(/\bwatermark/i) ||
        cmd.match(/\b(add|apply|put)\s+(text|logo|signature)/i) ||
        cmd.match(/\b(text|logo|signature)\s+watermark/i)) {
      const typeMatch = cmd.match(/\b(text|logo|signature)/i);
      const positionMatch = cmd.match(/\b(top-left|top-right|bottom-left|bottom-right|center)\b/i);
      const opacityMatch = cmd.match(/(\d+)%\s+opacity/i);

      return {
        tool: 'watermark',
        action: 'add',
        parameters: {
          type: typeMatch ? typeMatch[1].toLowerCase() : 'text',
          position: positionMatch ? positionMatch[1].toLowerCase() : 'bottom-right',
          opacity: opacityMatch ? parseInt(opacityMatch[1]) / 100 : 0.3,
          target: 'latest' // Will watermark most recent asset
        },
        confidence: 1.0
      };
    }

    // Default: low confidence
    throw new Error('Could not understand command. Try: "make ragebait about kubernetes", "check all repos", "add watermark to latest"');
  }

  /**
   * Execute parsed intent by routing to appropriate tool
   */
  async _executeIntent(intent, context) {
    const { tool, action, parameters } = intent;

    switch (tool) {
      case 'ragebait':
        return await this._executeRagebait(action, parameters, context);

      case 'podcast':
        return await this._executePodcast(action, parameters, context);

      case 'file-explorer':
        return await this._executeFileExplorer(action, parameters, context);

      case 'vanity-handles':
        return await this._executeVanityHandles(action, parameters, context);

      case 'artifact-builder':
        return await this._executeArtifactBuilder(action, parameters, context);

      case 'brand-presentation':
        return await this._executeBrandPresentation(action, parameters, context);

      case 'watermark':
        return await this._executeWatermark(action, parameters, context);

      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  }

  /**
   * Execute ragebait generation
   */
  async _executeRagebait(action, parameters, context) {
    if (!this.tools.ragebait) {
      const DevRagebaitGenerator = require('./dev-ragebait-generator');
      this.tools.ragebait = new DevRagebaitGenerator();
    }

    const topic = parameters.topic || 'coding';

    // Map topic to template (using actual available templates)
    const templateMap = {
      'kubernetes': 'quick-hotfix',
      'k8s': 'quick-hotfix',
      'npm': 'npm-install',
      'git': 'merge-conflict',
      'docker': 'works-locally',
      'css': 'css-center',
      'hotfix': 'quick-hotfix',
      'node_modules': 'npm-install',
      'merge': 'merge-conflict',
      'codellama': 'codellama-nitpick',
      'qwen': 'qwen-ship-it',
      'phi': 'phi-hack',
      'llama': 'llama-optimist',
      'mistral': 'mistral-tradeoffs'
    };

    const templateId = templateMap[topic.toLowerCase()] || 'works-locally';
    const outputPath = `/tmp/ragebait-${Date.now()}.mp4`;

    const result = await this.tools.ragebait.generate(templateId, {
      outputPath,
      domainId: parameters.domain || null
    });

    return {
      message: `Generated ragebait about ${topic}`,
      data: {
        type: 'ragebait',
        template: templateId,
        gifPath: result.gifPath,
        mp4Path: result.mp4Path,
        caption: result.caption,
        hashtags: result.hashtags,
        metadata: {
          width: result.width,
          height: result.height,
          duration: result.duration,
          fileSize: result.fileSize
        }
      }
    };
  }

  /**
   * Execute podcast generation
   */
  async _executePodcast(action, parameters, context) {
    if (!this.tools.podcast) {
      const AIPodcastGenerator = require('./ai-podcast-generator');
      this.tools.podcast = new AIPodcastGenerator({ llmRouter: this.llmRouter });
    }

    // Get transcript source
    let transcript = parameters.transcript;

    if (!transcript && parameters.source === 'today') {
      // TODO: Get today's session transcript from session manager
      transcript = 'Today\'s coding session transcript...';
    }

    const podcast = await this.tools.podcast.generate({
      transcript,
      personas: parameters.personas || ['matthewmauer', 'calriven'],
      style: parameters.style || 'midnight-gospel',
      domain: parameters.domain || null,
      targetLength: parameters.length || 20
    });

    return {
      message: `Created podcast: ${podcast.title}`,
      data: {
        type: 'podcast',
        podcast
      }
    };
  }

  /**
   * Execute file explorer operations
   */
  async _executeFileExplorer(action, parameters, context) {
    // File explorer is external service at localhost:3030
    const fetch = require('node-fetch');

    if (action === 'scan') {
      const response = await fetch('http://localhost:3030/api/scan');
      const repos = await response.json();

      return {
        message: `Found ${repos.total} repositories`,
        data: {
          type: 'repo-list',
          repos: repos.repos,
          total: repos.total
        }
      };
    }

    if (action === 'status') {
      const repoPath = parameters.path;
      const response = await fetch(`http://localhost:3030/api/git/status?path=${encodeURIComponent(repoPath)}`);
      const status = await response.json();

      return {
        message: `Repository status for ${repoPath}`,
        data: {
          type: 'git-status',
          status
        }
      };
    }

    throw new Error(`Unknown file-explorer action: ${action}`);
  }

  /**
   * Execute vanity handles operations (uses manager directly, not HTTP)
   */
  async _executeVanityHandles(action, parameters, context) {
    // Lazy-load VanityHandlesManager
    if (!this.tools.vanityHandles) {
      const VanityHandlesManager = require('./vanity-handles-manager');
      const db = context.db || null;  // TODO: Get from global context
      this.tools.vanityHandles = new VanityHandlesManager(db);
    }

    const manager = this.tools.vanityHandles;

    if (action === 'check') {
      const handle = parameters.handle.replace('@', '');

      if (!manager.db) {
        // Fallback: return simulated response if no database
        return {
          message: `@${handle} availability check (database not connected)`,
          data: {
            type: 'handle-availability',
            handle,
            available: null,
            note: 'Database not connected - start with database to check real availability'
          }
        };
      }

      const result = await manager.checkAvailability(handle);

      if (result.available) {
        return {
          message: `@${handle} is available! 🎉`,
          data: {
            type: 'handle-availability',
            handle,
            available: true
          }
        };
      } else {
        return {
          message: `@${handle} is not available. ${result.reason}`,
          data: {
            type: 'handle-availability',
            handle,
            available: false,
            reason: result.reason,
            premium: result.premium,
            price: result.price
          }
        };
      }
    }

    if (action === 'claim') {
      const handle = parameters.handle.replace('@', '');
      const userId = context.userId || 1; // TODO: Get from auth

      if (!manager.db) {
        throw new Error('Database not connected - cannot claim handles');
      }

      const result = await manager.claimHandle(userId, handle);

      if (result.success) {
        return {
          message: `Successfully claimed @${result.handle}! 🎉`,
          data: {
            type: 'handle-claim',
            handle: result.handle
          }
        };
      } else {
        throw new Error(result.error);
      }
    }

    if (action === 'premium') {
      if (!manager.db) {
        return {
          message: 'Premium handles (database not connected)',
          data: {
            type: 'premium-handles',
            handles: [],
            note: 'Database not connected - start with database to see premium handles'
          }
        };
      }

      const handles = await manager.getPremiumHandles();

      return {
        message: `Found ${handles.length} premium handles`,
        data: {
          type: 'premium-handles',
          handles
        }
      };
    }

    throw new Error(`Unknown vanity-handles action: ${action}`);
  }

  /**
   * Execute artifact builder
   */
  async _executeArtifactBuilder(action, parameters, context) {
    if (!this.tools.artifactBuilder) {
      const ArtifactBuilder = require('./artifact-builder');
      this.tools.artifactBuilder = new ArtifactBuilder({ llmRouter: this.llmRouter });
    }

    const artifact = await this.tools.artifactBuilder.build({
      type: parameters.type || 'logo',
      prompt: parameters.prompt,
      style: parameters.style
    });

    return {
      message: `Built ${parameters.type}: ${artifact.title}`,
      data: {
        type: 'artifact',
        artifact
      }
    };
  }

  /**
   * Execute brand presentation
   */
  async _executeBrandPresentation(action, parameters, context) {
    if (!this.tools.brandPresentation) {
      const BrandPresentationGenerator = require('./brand-presentation-generator');
      this.tools.brandPresentation = new BrandPresentationGenerator({ llmRouter: this.llmRouter });
    }

    const presentation = await this.tools.brandPresentation.generate({
      brand: parameters.brand,
      topic: parameters.topic,
      slideCount: parameters.slides || 10
    });

    return {
      message: `Created presentation: ${presentation.title}`,
      data: {
        type: 'presentation',
        presentation
      }
    };
  }

  /**
   * Execute watermark overlay
   */
  async _executeWatermark(action, parameters, context) {
    if (!this.tools.watermark) {
      const WatermarkOverlay = require('./watermark-overlay');
      this.tools.watermark = new WatermarkOverlay();
    }

    const { type, position, opacity, target } = parameters;

    // Find the latest generated asset
    const fs = require('fs').promises;
    const path = require('path');
    const ragebaitDir = path.join(__dirname, '../temp/ragebait');

    try {
      const files = await fs.readdir(ragebaitDir);
      if (files.length === 0) {
        throw new Error('No assets found to watermark. Generate some content first.');
      }

      // Get most recent file
      const filePaths = files
        .filter(f => !f.startsWith('.'))  // Ignore hidden files
        .map(f => path.join(ragebaitDir, f));

      const statsWithPaths = await Promise.all(
        filePaths.map(async (p) => ({ path: p, stat: await fs.stat(p) }))
      );

      // Sort by modification time (newest first)
      statsWithPaths.sort((a, b) => b.stat.mtime - a.stat.mtime);
      const latest = statsWithPaths[0].path;

      const ext = path.extname(latest);
      const basename = path.basename(latest, ext);
      const outputPath = path.join(ragebaitDir, `${basename}-watermarked${ext}`);

      // Add watermark
      let result;
      if (ext === '.mp4' || ext === '.mov') {
        result = await this.tools.watermark.addWatermarkToVideo(latest, {
          brand: this.brand,
          type,
          position,
          opacity
        }, outputPath);
      } else {
        result = await this.tools.watermark.addWatermark(latest, {
          brand: this.brand,
          type,
          position,
          opacity,
          fontSize: 24
        }, outputPath);
      }

      return {
        message: `Added ${type} watermark (@${this.brand}) to ${path.basename(latest)}`,
        data: {
          type: 'watermark',
          original: latest,
          watermarked: outputPath,
          brand: this.brand,
          watermarkType: type,
          position,
          opacity
        }
      };

    } catch (error) {
      throw new Error(`Failed to watermark: ${error.message}`);
    }
  }

  /**
   * Get command suggestions based on partial input
   */
  async getSuggestions(partialCommand) {
    const suggestions = [
      'make ragebait about kubernetes',
      'create podcast from today',
      'check all repos',
      'is @god available',
      'claim @myhandle',
      'build logo for SOULFRA',
      'scan repositories',
      'show premium handles',
      'create presentation about AI',
      'add watermark to latest',
      'add logo watermark bottom-right',
      'add text watermark with 50% opacity'
    ];

    // Simple filter for now
    return suggestions.filter(s =>
      s.toLowerCase().includes(partialCommand.toLowerCase())
    );
  }

  /**
   * Apply personality filter - CalRiven decides if request is valid
   * "Customer isn't always right" - reject bad/redundant requests
   */
  async _applyPersonalityFilter(command, context) {
    const cmd = command.toLowerCase();

    // Check for redundant requests (things we already have)
    const redundantPatterns = [
      /build.*command.*center/i,
      /create.*command.*interface/i,
      /make.*unified.*dashboard/i,
      /build.*file.*explorer.*again/i
    ];

    for (const pattern of redundantPatterns) {
      if (cmd.match(pattern)) {
        return {
          allowed: false,
          reason: 'redundant',
          message: `WE ALREADY HAVE THIS. You're literally using the command center right now. Stop asking me to rebuild things that exist.`
        };
      }
    }

    // Check for vague requests
    if (cmd.length < 10 && !cmd.match(/(check|scan|show|list)/)) {
      return {
        allowed: false,
        reason: 'too_vague',
        message: `Be more specific. I'm not a mind reader. What exactly do you want?`
      };
    }

    // Check for "please" (we don't need that shit)
    if (cmd.includes('please') || cmd.includes('kindly')) {
      return {
        allowed: true,
        message: `You don't need to say please. Just tell me what you want.`
      };
    }

    // All good
    return { allowed: true };
  }

  /**
   * Apply brand personality to response (CalRiven style)
   */
  async _applyBrandPersonality(result, originalCommand) {
    // Add CalRiven catchphrases to responses
    const responses = { ...result };

    // Random chance to add a catchphrase
    if (Math.random() < 0.3 && this.personalityRules.catchphrases.length > 0) {
      const catchphrase = this.personalityRules.catchphrases[
        Math.floor(Math.random() * this.personalityRules.catchphrases.length)
      ];
      responses.message += ` ${catchphrase}.`;
    }

    // Sign the response
    responses.message += ' —CalRiven';

    return responses;
  }
}

module.exports = CommandRouter;
