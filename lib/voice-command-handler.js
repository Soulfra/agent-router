/**
 * Voice Command Handler
 *
 * Parses voice transcriptions into actionable commands for guided OAuth setup
 *
 * Commands:
 * - "done" / "next" / "finished" → Move to next step
 * - "screenshot" / "capture" → Take screenshot
 * - "cancel" / "stop" → Abort setup
 * - Anything else → Treat as answer to current question
 *
 * Usage:
 *   const handler = new VoiceCommandHandler();
 *   const result = await handler.handleCommand(transcript, context);
 */

class VoiceCommandHandler {
  constructor(options = {}) {
    this.debug = options.debug || false;
  }

  /**
   * Parse voice transcript into command
   *
   * @param {string} transcript - Raw voice transcription
   * @param {object} context - Current context (step, question, etc.)
   * @returns {object} Command object with action and data
   */
  async handleCommand(transcript, context = {}) {
    const normalized = transcript.toLowerCase().trim();

    if (this.debug) {
      console.log(`[VoiceCmd] Input: "${transcript}"`);
      console.log(`[VoiceCmd] Context:`, context);
    }

    // Command: Done / Next
    if (this.matchesPattern(normalized, ['done', 'next', 'finished', 'continue', 'okay', 'got it'])) {
      return {
        action: 'next',
        transcript,
        confidence: 'high'
      };
    }

    // Command: Screenshot
    if (this.matchesPattern(normalized, ['screenshot', 'capture', 'take picture', 'snap'])) {
      return {
        action: 'screenshot',
        transcript,
        confidence: 'high'
      };
    }

    // Command: Cancel
    if (this.matchesPattern(normalized, ['cancel', 'stop', 'quit', 'exit', 'abort'])) {
      return {
        action: 'cancel',
        transcript,
        confidence: 'high'
      };
    }

    // Command: Repeat / Help
    if (this.matchesPattern(normalized, ['repeat', 'what', 'help', 'again', 'say again'])) {
      return {
        action: 'repeat',
        transcript,
        confidence: 'high'
      };
    }

    // Command: Back / Previous
    if (this.matchesPattern(normalized, ['back', 'previous', 'go back', 'undo'])) {
      return {
        action: 'back',
        transcript,
        confidence: 'high'
      };
    }

    // If we're waiting for an answer, treat as answer
    if (context.waitingFor === 'answer') {
      return {
        action: 'answer',
        value: transcript,
        question: context.question,
        confidence: 'medium'
      };
    }

    // If we're waiting for credentials, parse them
    if (context.waitingFor === 'client_id') {
      const clientId = this.parseClientId(transcript);
      return {
        action: 'answer',
        value: clientId,
        field: 'client_id',
        confidence: clientId ? 'high' : 'low'
      };
    }

    if (context.waitingFor === 'client_secret') {
      const clientSecret = this.parseClientSecret(transcript);
      return {
        action: 'answer',
        value: clientSecret,
        field: 'client_secret',
        confidence: clientSecret ? 'medium' : 'low'
      };
    }

    // Default: unclear command
    return {
      action: 'unclear',
      transcript,
      confidence: 'low',
      suggestion: 'Try saying "done", "screenshot", or answer the question'
    };
  }

  /**
   * Check if transcript matches any pattern
   */
  matchesPattern(text, patterns) {
    return patterns.some(pattern => {
      // Exact match or contains
      return text === pattern || text.includes(pattern);
    });
  }

  /**
   * Parse Client ID from voice transcription
   * Examples:
   * - "Iv1.abc123def456"
   * - "I v 1 dot abc 123 def 456"
   * - "capital I v one dot..."
   */
  parseClientId(transcript) {
    const cleaned = transcript
      .toLowerCase()
      .replace(/\s+/g, '') // Remove spaces
      .replace(/dot/g, '.')
      .replace(/dash/g, '-')
      .replace(/underscore/g, '_');

    // GitHub OAuth Client IDs start with Iv1.
    if (cleaned.startsWith('iv1.') || cleaned.startsWith('iv1')) {
      return 'Iv1.' + cleaned.substring(3).replace(/\./g, '');
    }

    // Just return cleaned version if it looks like an ID
    if (/^[a-z0-9._-]{10,}$/i.test(cleaned)) {
      return cleaned;
    }

    return transcript; // Return original if can't parse
  }

  /**
   * Parse Client Secret from voice transcription
   * These are long alphanumeric strings
   */
  parseClientSecret(transcript) {
    const cleaned = transcript
      .toLowerCase()
      .replace(/\s+/g, '') // Remove spaces
      .replace(/dash/g, '-')
      .replace(/underscore/g, '_')
      .replace(/tilde/g, '~');

    // Client secrets are usually 40+ characters
    if (cleaned.length >= 20 && /^[a-z0-9._~-]+$/i.test(cleaned)) {
      return cleaned;
    }

    return transcript; // Return original if can't parse
  }

  /**
   * Extract URL from transcript
   */
  extractUrl(transcript) {
    const urlMatch = transcript.match(/https?:\/\/[^\s]+/);
    return urlMatch ? urlMatch[0] : null;
  }

  /**
   * Parse yes/no answer
   */
  parseYesNo(transcript) {
    const normalized = transcript.toLowerCase().trim();

    if (this.matchesPattern(normalized, ['yes', 'yep', 'yeah', 'sure', 'correct', 'right', 'affirmative'])) {
      return true;
    }

    if (this.matchesPattern(normalized, ['no', 'nope', 'nah', 'wrong', 'incorrect', 'negative'])) {
      return false;
    }

    return null; // Unclear
  }

  /**
   * Parse numeric answer
   */
  parseNumber(transcript) {
    // Try direct number
    const num = parseInt(transcript.replace(/\D/g, ''));
    if (!isNaN(num)) return num;

    // Try word-to-number
    const wordMap = {
      'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
      'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
      'ten': 10
    };

    const normalized = transcript.toLowerCase().trim();
    if (wordMap[normalized] !== undefined) {
      return wordMap[normalized];
    }

    return null;
  }
}

module.exports = VoiceCommandHandler;
