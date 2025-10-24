/**
 * Voice Wake Word Module
 *
 * Mac integration for voice-activated Model Council sessions.
 * Uses macOS native speech recognition and osascript for system integration.
 *
 * Wake words:
 * - "Hey Cal"
 * - "Okay CalOS"
 * - "CalOS build..."
 *
 * Example:
 * "Hey Cal, let's build a developer portal"
 * → Triggers Model Council session
 */

const { exec } = require('child_process');
const EventEmitter = require('events');

class VoiceWakeWord extends EventEmitter {
  constructor(modelCouncil, options = {}) {
    super();

    this.modelCouncil = modelCouncil;
    this.config = {
      enabled: options.enabled !== false,
      wakeWords: options.wakeWords || ['hey cal', 'okay calos', 'cal build'],
      platform: process.platform,
      useMacSpeech: options.useMacSpeech !== false && process.platform === 'darwin',
      notificationsEnabled: options.notificationsEnabled !== false,
      ...options
    };

    this.listening = false;

    console.log('[VoiceWakeWord] Initialized', {
      platform: this.config.platform,
      macSpeech: this.config.useMacSpeech,
      notifications: this.config.notificationsEnabled
    });
  }

  /**
   * Start listening for wake words
   */
  start() {
    if (!this.config.enabled) {
      console.log('[VoiceWakeWord] Disabled in config');
      return false;
    }

    if (this.listening) {
      console.log('[VoiceWakeWord] Already listening');
      return false;
    }

    this.listening = true;

    console.log('[VoiceWakeWord] 🎤 Listening for wake words:', this.config.wakeWords.join(', '));

    // Show Mac notification
    this.showNotification('CalOS Voice Ready', 'Say "Hey Cal" to start building');

    // Note: Actual wake word detection would require additional setup
    // This is a stub that shows how it would integrate
    // Real implementation could use:
    // - macOS Shortcuts with voice triggers
    // - Automator workflows
    // - External speech recognition service

    this.emit('listening', { wakeWords: this.config.wakeWords });

    return true;
  }

  /**
   * Stop listening
   */
  stop() {
    this.listening = false;
    console.log('[VoiceWakeWord] Stopped listening');
    this.emit('stopped');
  }

  /**
   * Handle voice command (called when wake word detected)
   *
   * @param {String} command - Full voice command text
   */
  async handleCommand(command) {
    console.log(`[VoiceWakeWord] Received command: "${command}"`);

    // Check if command starts with wake word
    const normalizedCommand = command.toLowerCase().trim();

    let detectedWakeWord = null;
    for (const wakeWord of this.config.wakeWords) {
      if (normalizedCommand.startsWith(wakeWord)) {
        detectedWakeWord = wakeWord;
        break;
      }
    }

    if (!detectedWakeWord) {
      console.log('[VoiceWakeWord] No wake word detected');
      return null;
    }

    // Extract task from command
    const task = normalizedCommand
      .replace(detectedWakeWord, '')
      .trim()
      .replace(/^(let's|let us|please|can you)\s+/i, '')
      .replace(/^build\s+/i, '');

    if (!task || task.length < 5) {
      this.showNotification('CalOS', 'Please describe what you want to build');
      this.speak('What would you like me to build?');
      return null;
    }

    console.log(`[VoiceWakeWord] Extracted task: "${task}"`);

    // Show notification
    this.showNotification('CalOS Council Starting', `Building: ${task}`);

    // Speak response
    this.speak(`Okay, I'll get the council working on ${task}`);

    // Start council session
    try {
      const sessionId = await this.modelCouncil.startSession(task, {
        metadata: {
          source: 'voice',
          wakeWord: detectedWakeWord,
          originalCommand: command
        }
      });

      console.log(`[VoiceWakeWord] Started council session: ${sessionId}`);

      this.emit('command_handled', { command, task, sessionId });

      // Monitor session progress
      this.monitorSession(sessionId);

      return sessionId;

    } catch (error) {
      console.error('[VoiceWakeWord] Failed to start session:', error);
      this.showNotification('CalOS Error', `Failed to start: ${error.message}`);
      this.speak('Sorry, something went wrong');
      return null;
    }
  }

  /**
   * Monitor council session and provide voice updates
   * @private
   */
  monitorSession(sessionId) {
    const handleProposal = (data) => {
      if (data.sessionId === sessionId && data.proposal) {
        this.showNotification(
          `${data.proposal.emoji} ${data.proposal.modelDisplay}`,
          'Proposal received'
        );
      }
    };

    const handleComplete = (data) => {
      if (data.sessionId === sessionId) {
        this.showNotification(
          'CalOS Council Complete',
          `Winner: ${data.winner?.model || 'Unknown'}`
        );

        this.speak(`The council has reached a decision. ${data.winner?.model} won the vote.`);

        // Clean up listeners
        this.modelCouncil.removeListener('session:proposal', handleProposal);
        this.modelCouncil.removeListener('session:completed', handleComplete);
      }
    };

    this.modelCouncil.on('session:proposal', handleProposal);
    this.modelCouncil.on('session:completed', handleComplete);
  }

  /**
   * Show macOS notification
   * @private
   */
  showNotification(title, message) {
    if (!this.config.notificationsEnabled || this.config.platform !== 'darwin') {
      return;
    }

    const script = `display notification "${this.escapeAppleScript(message)}" with title "${this.escapeAppleScript(title)}"`;

    exec(`osascript -e '${script}'`, (error) => {
      if (error) {
        console.error('[VoiceWakeWord] Notification failed:', error.message);
      }
    });
  }

  /**
   * Speak text using macOS speech synthesis
   * @private
   */
  speak(text) {
    if (!this.config.useMacSpeech || this.config.platform !== 'darwin') {
      return;
    }

    const escaped = this.escapeAppleScript(text);
    const script = `say "${escaped}"`;

    exec(`osascript -e '${script}'`, (error) => {
      if (error) {
        console.error('[VoiceWakeWord] Speech failed:', error.message);
      }
    });
  }

  /**
   * Escape string for AppleScript
   * @private
   */
  escapeAppleScript(str) {
    return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
  }

  /**
   * Create macOS Shortcut for voice activation (helper)
   *
   * This generates an AppleScript that can be used to create a Shortcut
   * in macOS that triggers when the wake word is spoken.
   *
   * To use:
   * 1. Open Shortcuts app
   * 2. Create new shortcut
   * 3. Add "Run AppleScript" action
   * 4. Paste generated script
   * 5. Add voice trigger with wake word
   */
  generateMacShortcut() {
    return `
-- CalOS Voice Wake Word Shortcut
-- This script sends voice commands to the CalOS agent-router

on run {input, parameters}
    set voiceCommand to input as text

    -- Send to CalOS API
    set apiUrl to "http://localhost:5001/api/voice/wake-word"
    set jsonData to "{\\"command\\": \\"" & voiceCommand & "\\"}"

    do shell script "curl -X POST " & quoted form of apiUrl & " -H 'Content-Type: application/json' -d " & quoted form of jsonData

    return "CalOS activated"
end run
`.trim();
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      listening: this.listening,
      enabled: this.config.enabled,
      platform: this.config.platform,
      macSupport: this.config.useMacSpeech && this.config.platform === 'darwin',
      wakeWords: this.config.wakeWords
    };
  }
}

module.exports = VoiceWakeWord;
