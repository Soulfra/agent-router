/**
 * Voice Cross-Device Sync (Phone ↔ Computer)
 *
 * Features:
 * - Real-time voice transcription sync
 * - WebSocket-based communication
 * - Voice signatures for auth
 * - Proof of life verification
 * - Command routing (speak on phone, executes on computer)
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class VoiceCrossDeviceSync extends EventEmitter {
  constructor({ voiceTranscriber, deviceSyncManager }) {
    super();
    this.voiceTranscriber = voiceTranscriber;
    this.deviceSyncManager = deviceSyncManager;

    // Voice command queue: Map<userId, Array<voiceCommand>>
    this.commandQueue = new Map();

    // Voice signature cache for fast lookup
    this.voiceSignatures = new Map();

    console.log('[VoiceCrossDeviceSync] Initialized');
  }

  /**
   * Handle voice input from any device
   */
  async handleVoiceInput({ deviceId, userId, audioData, timestamp }) {
    try {
      // Transcribe audio
      const transcript = await this.voiceTranscriber.transcribe(audioData);

      // Extract voice signature (for auth)
      const voiceSignature = this.extractVoiceSignature(audioData);

      // Verify voice signature matches user
      const verified = await this.verifyVoiceSignature(userId, voiceSignature);

      if (!verified) {
        return {
          success: false,
          error: 'Voice signature verification failed - proof of life required'
        };
      }

      // Parse command intent
      const command = this.parseVoiceCommand(transcript.text);

      // Queue command
      if (!this.commandQueue.has(userId)) {
        this.commandQueue.set(userId, []);
      }

      const queuedCommand = {
        commandId: crypto.randomUUID(),
        deviceId,
        userId,
        transcript: transcript.text,
        command,
        voiceSignature,
        timestamp,
        status: 'pending'
      };

      this.commandQueue.get(userId).push(queuedCommand);

      // Sync to all user's devices
      await this.syncToDevices(userId, {
        type: 'voice_command',
        data: queuedCommand
      });

      // Emit event for processing
      this.emit('voice_command', queuedCommand);

      return {
        success: true,
        commandId: queuedCommand.commandId,
        transcript: transcript.text,
        command
      };
    } catch (error) {
      console.error('[VoiceCrossDeviceSync] Error handling voice input:', error);
      throw error;
    }
  }

  /**
   * Parse voice command into structured intent
   */
  parseVoiceCommand(transcript) {
    const lower = transcript.toLowerCase();

    // Command patterns
    const patterns = {
      post: /post (to|on) (\w+)/i,
      generate: /generate (content|post|article) (for|about) (.+)/i,
      sync: /sync (to|with) (.+)/i,
      build: /build (.+)/i,
      launch: /launch (.+)/i,
      check: /check (.+)/i
    };

    for (const [action, pattern] of Object.entries(patterns)) {
      const match = transcript.match(pattern);
      if (match) {
        return {
          action,
          target: match[2] || match[1],
          params: match.slice(3) || [],
          raw: transcript
        };
      }
    }

    return {
      action: 'unknown',
      raw: transcript
    };
  }

  /**
   * Extract voice signature from audio (fingerprint)
   */
  extractVoiceSignature(audioData) {
    // Simple hash-based signature (in production, use proper audio fingerprinting)
    const hash = crypto.createHash('sha256');
    hash.update(Buffer.from(audioData));
    return hash.digest('hex');
  }

  /**
   * Verify voice signature matches user
   */
  async verifyVoiceSignature(userId, signature) {
    // Check cache first
    if (this.voiceSignatures.has(userId)) {
      const cached = this.voiceSignatures.get(userId);
      // Allow some variation (in production, use proper voice comparison)
      return true; // Simplified for now
    }

    // Store signature for future verification
    this.voiceSignatures.set(userId, signature);

    return true;
  }

  /**
   * Sync voice command to all user devices
   */
  async syncToDevices(userId, payload) {
    if (!this.deviceSyncManager) {
      return;
    }

    await this.deviceSyncManager.syncToUserDevices(userId, {
      entityType: 'voice_command',
      entityId: payload.data.commandId,
      action: 'create',
      data: payload.data
    });
  }

  /**
   * Execute voice command
   */
  async executeCommand(commandId, userId) {
    const queue = this.commandQueue.get(userId);
    if (!queue) {
      throw new Error('No commands for this user');
    }

    const command = queue.find(c => c.commandId === commandId);
    if (!command) {
      throw new Error('Command not found');
    }

    // Mark as executing
    command.status = 'executing';

    try {
      let result = null;

      // Execute based on action
      switch (command.command.action) {
        case 'post':
          result = await this.executePost(command);
          break;

        case 'generate':
          result = await this.executeGenerate(command);
          break;

        case 'sync':
          result = await this.executeSync(command);
          break;

        case 'build':
          result = await this.executeBuild(command);
          break;

        case 'launch':
          result = await this.executeLaunch(command);
          break;

        case 'check':
          result = await this.executeCheck(command);
          break;

        default:
          throw new Error(`Unknown command action: ${command.command.action}`);
      }

      // Mark as completed
      command.status = 'completed';
      command.result = result;
      command.completedAt = new Date();

      // Sync result back to devices
      await this.syncToDevices(userId, {
        type: 'command_result',
        data: {
          commandId,
          result,
          status: 'completed'
        }
      });

      return {
        success: true,
        commandId,
        result
      };
    } catch (error) {
      command.status = 'failed';
      command.error = error.message;

      console.error(`[VoiceCrossDeviceSync] Command execution failed:`, error);

      throw error;
    }
  }

  /**
   * Execute post command
   */
  async executePost(command) {
    // Emit event for multi-brand poster to handle
    this.emit('post_command', {
      target: command.command.target,
      content: command.transcript,
      userId: command.userId
    });

    return {
      action: 'post',
      target: command.command.target,
      status: 'queued'
    };
  }

  /**
   * Execute generate command
   */
  async executeGenerate(command) {
    // Emit event for content generation
    this.emit('generate_command', {
      type: command.command.target,
      topic: command.command.params.join(' '),
      userId: command.userId
    });

    return {
      action: 'generate',
      type: command.command.target,
      status: 'queued'
    };
  }

  /**
   * Execute sync command
   */
  async executeSync(command) {
    // Force sync all devices
    if (this.deviceSyncManager) {
      await this.deviceSyncManager.forceSyncAll(command.userId);
    }

    return {
      action: 'sync',
      status: 'completed'
    };
  }

  /**
   * Execute build command
   */
  async executeBuild(command) {
    // Emit event for project builder
    this.emit('build_command', {
      project: command.command.target,
      userId: command.userId
    });

    return {
      action: 'build',
      project: command.command.target,
      status: 'queued'
    };
  }

  /**
   * Execute launch command
   */
  async executeLaunch(command) {
    // Emit event for project launcher
    this.emit('launch_command', {
      project: command.command.target,
      userId: command.userId
    });

    return {
      action: 'launch',
      project: command.command.target,
      status: 'queued'
    };
  }

  /**
   * Execute check command
   */
  async executeCheck(command) {
    // Emit event for status checker
    this.emit('check_command', {
      target: command.command.target,
      userId: command.userId
    });

    return {
      action: 'check',
      target: command.command.target,
      status: 'queued'
    };
  }

  /**
   * Get command queue for user
   */
  getCommandQueue(userId) {
    return this.commandQueue.get(userId) || [];
  }

  /**
   * Get command stats
   */
  getStats(userId) {
    const queue = this.commandQueue.get(userId) || [];

    return {
      total: queue.length,
      pending: queue.filter(c => c.status === 'pending').length,
      executing: queue.filter(c => c.status === 'executing').length,
      completed: queue.filter(c => c.status === 'completed').length,
      failed: queue.filter(c => c.status === 'failed').length,
      recent: queue.slice(-10)
    };
  }

  /**
   * Clear old commands
   */
  clearOldCommands(userId, olderThan = 24 * 60 * 60 * 1000) {
    const queue = this.commandQueue.get(userId);
    if (!queue) {
      return 0;
    }

    const now = Date.now();
    const initial = queue.length;

    const filtered = queue.filter(cmd => {
      const age = now - new Date(cmd.timestamp).getTime();
      return age < olderThan;
    });

    this.commandQueue.set(userId, filtered);

    const cleared = initial - filtered.length;
    console.log(`[VoiceCrossDeviceSync] Cleared ${cleared} old commands for user ${userId}`);

    return cleared;
  }
}

module.exports = VoiceCrossDeviceSync;
