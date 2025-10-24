/**
 * Cal Autonomous Voice Integration
 *
 * Integrates Cal's autonomous system with voice handler to enable:
 * - Voice-powered brand creation
 * - Autonomous deployment monitoring via voice commands
 * - Voice status checks for all systems
 *
 * Combines:
 * - CalVoiceBrandBuilder (voice → brand creation)
 * - CalDeploymentMonitor (deployment health checks)
 * - WhisperVoiceHandler (speech-to-text)
 * - BrandRegistrySync (multi-platform sync)
 * - RemoteControlManager (GitHub, gists, chats)
 *
 * Example:
 *   const cal = new CalAutonomousVoiceIntegration();
 *   await cal.init();
 *   await cal.processVoiceCommand(audioBuffer);
 *   // Cal transcribes, parses, executes, and reports back
 */

const WhisperVoiceHandler = require('./whisper-voice-handler');
const CalVoiceBrandBuilder = require('./cal-voice-brand-builder');
const CalDeploymentMonitor = require('./cal-deployment-monitor');
const BrandRegistrySync = require('./brand-registry-sync');
const RemoteControlManager = require('./remote-control-manager');
const OllamaBotTrainer = require('./ollama-bot-trainer');

class CalAutonomousVoiceIntegration {
  constructor(options = {}) {
    this.config = {
      openaiKey: options.openaiKey || process.env.OPENAI_API_KEY,
      githubToken: options.githubToken || process.env.GITHUB_TOKEN,
      sheetsId: options.sheetsId || process.env.GOOGLE_SHEETS_DB_ID,
      slackWebhook: options.slackWebhook || process.env.SLACK_WEBHOOK_URL,
      discordWebhook: options.discordWebhook || process.env.DISCORD_WEBHOOK_URL,
      verbose: options.verbose || false
    };

    // Initialize all subsystems
    this.whisper = null;
    this.brandBuilder = null;
    this.deploymentMonitor = null;
    this.registrySync = null;
    this.remoteControl = null;
    this.ollamaTrainer = null;

    this.isInitialized = false;

    console.log('[CalAutonomousVoiceIntegration] Cal is starting up...');
  }

  /**
   * Initialize all Cal systems
   */
  async init() {
    try {
      console.log('[CalAutonomousVoiceIntegration] Initializing Cal subsystems...');

      // 1. Initialize Whisper voice handler
      this.whisper = new WhisperVoiceHandler({
        openaiKey: this.config.openaiKey,
        verbose: this.config.verbose
      });

      // 2. Initialize brand registry sync
      this.registrySync = new BrandRegistrySync({
        githubToken: this.config.githubToken,
        sheetsId: this.config.sheetsId,
        verbose: this.config.verbose
      });

      // 3. Initialize remote control manager
      this.remoteControl = new RemoteControlManager({
        githubToken: this.config.githubToken,
        slackWebhook: this.config.slackWebhook,
        discordWebhook: this.config.discordWebhook,
        verbose: this.config.verbose
      });

      // 4. Initialize Ollama trainer
      this.ollamaTrainer = new OllamaBotTrainer({
        verbose: this.config.verbose
      });

      // 5. Initialize brand builder
      this.brandBuilder = new CalVoiceBrandBuilder({
        whisperHandler: this.whisper,
        ollamaTrainer: this.ollamaTrainer,
        registrySync: this.registrySync,
        verbose: this.config.verbose
      });

      // 6. Initialize deployment monitor
      this.deploymentMonitor = new CalDeploymentMonitor({
        githubToken: this.config.githubToken,
        verbose: this.config.verbose
      });

      this.isInitialized = true;

      console.log('[CalAutonomousVoiceIntegration] ✅ Cal is fully operational');
      console.log('[CalAutonomousVoiceIntegration] 🎤 Voice commands enabled');
      console.log('[CalAutonomousVoiceIntegration] 🤖 Autonomous monitoring active');

      return {
        success: true,
        message: 'Cal is ready to accept voice commands'
      };

    } catch (error) {
      console.error('[CalAutonomousVoiceIntegration] Initialization error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process voice command
   */
  async processVoiceCommand(audioBuffer) {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Cal not initialized. Call init() first.'
      };
    }

    try {
      console.log('[CalAutonomousVoiceIntegration] 🎤 Processing voice command...');

      // Use brand builder to handle voice command
      const result = await this.brandBuilder.processVoiceCommand(audioBuffer);

      // If successful, notify via chat
      if (result.success && result.result.success) {
        await this.notifySuccess(result);
      }

      return result;

    } catch (error) {
      console.error('[CalAutonomousVoiceIntegration] Error processing voice command:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process text command (bypass voice transcription)
   */
  async processTextCommand(text) {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Cal not initialized. Call init() first.'
      };
    }

    try {
      console.log(`[CalAutonomousVoiceIntegration] 💬 Processing text command: "${text}"`);

      // Parse command manually
      const command = this.whisper._parseCommand(text.toLowerCase());

      // Route to brand builder
      const result = await this.brandBuilder.routeCommand(command);

      return {
        success: true,
        command,
        result
      };

    } catch (error) {
      console.error('[CalAutonomousVoiceIntegration] Error processing text command:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start autonomous deployment monitoring
   */
  async startMonitoring() {
    if (!this.deploymentMonitor) {
      return {
        success: false,
        error: 'Deployment monitor not initialized'
      };
    }

    console.log('[CalAutonomousVoiceIntegration] 👁️ Starting autonomous deployment monitoring...');

    await this.deploymentMonitor.startMonitoring();

    return {
      success: true,
      message: 'Cal is now monitoring deployments autonomously'
    };
  }

  /**
   * Stop autonomous monitoring
   */
  stopMonitoring() {
    if (!this.deploymentMonitor) {
      return {
        success: false,
        error: 'Deployment monitor not initialized'
      };
    }

    console.log('[CalAutonomousVoiceIntegration] 🛑 Stopping deployment monitoring...');

    this.deploymentMonitor.stopMonitoring();

    return {
      success: true,
      message: 'Deployment monitoring stopped'
    };
  }

  /**
   * Get full system status
   */
  async getStatus() {
    const status = {
      timestamp: new Date().toISOString(),
      initialized: this.isInitialized,
      subsystems: {
        whisper: null,
        brandBuilder: null,
        deploymentMonitor: null,
        registrySync: null,
        remoteControl: null
      },
      capabilities: []
    };

    if (this.whisper) {
      status.subsystems.whisper = this.whisper.getStatus();
      status.capabilities.push('voice-transcription');
    }

    if (this.brandBuilder) {
      status.capabilities.push('brand-creation', 'voice-commands');
    }

    if (this.deploymentMonitor) {
      status.subsystems.deploymentMonitor = this.deploymentMonitor.getStatus();
      status.capabilities.push('deployment-monitoring', 'auto-healing');
    }

    if (this.registrySync) {
      status.subsystems.registrySync = this.registrySync.getStatus();
      status.capabilities.push('multi-platform-sync');
    }

    if (this.remoteControl) {
      status.subsystems.remoteControl = await this.remoteControl.getStatus();
      status.capabilities.push('github-control', 'chat-notifications');
    }

    return status;
  }

  /**
   * Notify success via chat systems
   */
  async notifySuccess(result) {
    if (!this.remoteControl) return;

    const message = this.formatSuccessMessage(result);

    await this.remoteControl.chat.post({
      message,
      platform: 'all'
    });
  }

  /**
   * Format success message for chat
   */
  formatSuccessMessage(result) {
    if (!result.transcription || !result.result) {
      return '✅ Cal executed a command successfully';
    }

    const { transcription, result: cmdResult } = result;

    let message = '🤖 **Cal Voice Command Executed**\n\n';
    message += `🎤 **Voice Input:** "${transcription.text}"\n`;
    message += `🔍 **Command:** ${transcription.command.type}\n`;

    if (cmdResult.brand) {
      message += `\n✅ **Brand Created:** ${cmdResult.brand.name}\n`;
      message += `🌐 **Domain:** ${cmdResult.brand.domain}\n`;
      message += `📝 **Tagline:** ${cmdResult.brand.tagline}\n`;
      message += `🎨 **Tier:** ${cmdResult.brand.tier}\n`;
    }

    if (cmdResult.syncResult) {
      message += `\n📤 **Synced to:**\n`;
      if (cmdResult.syncResult.github.success) message += '- ✅ GitHub\n';
      if (cmdResult.syncResult.sheets.success) message += '- ✅ Google Sheets\n';
      if (cmdResult.syncResult.gist.success) message += '- ✅ GitHub Gist\n';
      if (cmdResult.syncResult.godaddy.success) message += '- ✅ GoDaddy DNS Check\n';
    }

    return message;
  }

  /**
   * Test voice integration with sample text
   */
  async test() {
    console.log('[CalAutonomousVoiceIntegration] 🧪 Running integration test...\n');

    const testCommands = [
      'create a new brand called EcoTrack for environmental monitoring',
      'status of Soulfra',
      'deploy EcoTrack'
    ];

    const results = [];

    for (const cmd of testCommands) {
      console.log(`\n📝 Testing command: "${cmd}"`);

      const result = await this.processTextCommand(cmd);

      results.push({
        command: cmd,
        success: result.success,
        result
      });

      console.log(`Result:`, result.success ? '✅' : '❌');
      if (result.result && result.result.message) {
        console.log(`Message: ${result.result.message}`);
      }
    }

    console.log('\n[CalAutonomousVoiceIntegration] Test complete\n');

    return results;
  }
}

module.exports = CalAutonomousVoiceIntegration;
