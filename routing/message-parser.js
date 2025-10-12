/**
 * Message Parser
 * Parses routing metadata from user messages:
 * - @mentions (e.g., @ollama, @gpt4, @claude)
 * - #topics for context routing
 * - !priority for urgent tasks
 * - Email-like headers
 */

class MessageParser {
  constructor() {
    // Regex patterns for parsing
    this.patterns = {
      mention: /@(\w+)/g,
      topic: /#(\w+)/g,
      priority: /!(urgent|high|normal|low)/i,
      header: /^(\w+):\s*(.+)$/gm,
      bcc: /\bbcc:\s*([^,\n]+)/gi,
      cc: /\bcc:\s*([^,\n]+)/gi,
      to: /\bto:\s*([^,\n]+)/gi,
      from: /\bfrom:\s*([^,\n]+)/i,
      subject: /\bsubject:\s*(.+)/i
    };
  }

  /**
   * Parse a message and extract routing metadata
   */
  parse(input, context = {}) {
    const message = {
      raw: input,
      from: context.from || 'user',
      to: [],
      cc: [],
      bcc: [],
      mentions: [],
      topics: [],
      priority: 'normal',
      subject: null,
      content: input,
      routing: {
        explicit: false, // Did user explicitly mention agents?
        fallback: null,
        timeout: 30000,
        delegation: null
      },
      timestamp: new Date().toISOString()
    };

    // Extract @mentions
    const mentions = [...input.matchAll(this.patterns.mention)];
    message.mentions = mentions.map(m => m[1].toLowerCase());

    // If @mentions found, those are explicit routing targets
    if (message.mentions.length > 0) {
      message.to = message.mentions.map(m => `@${m}`);
      message.routing.explicit = true;
    }

    // Extract #topics
    const topics = [...input.matchAll(this.patterns.topic)];
    message.topics = topics.map(t => t[1].toLowerCase());

    // Extract !priority
    const priorityMatch = input.match(this.patterns.priority);
    if (priorityMatch) {
      message.priority = priorityMatch[1].toLowerCase();
    }

    // Extract email-like headers (if message starts with headers)
    const headerMatches = [...input.matchAll(this.patterns.header)];
    for (const match of headerMatches) {
      const key = match[1].toLowerCase();
      const value = match[2].trim();

      switch (key) {
        case 'to':
          message.to = value.split(',').map(v => v.trim());
          message.routing.explicit = true;
          break;
        case 'cc':
          message.cc = value.split(',').map(v => v.trim());
          break;
        case 'bcc':
          message.bcc = value.split(',').map(v => v.trim());
          break;
        case 'subject':
          message.subject = value;
          break;
        case 'priority':
          message.priority = value.toLowerCase();
          break;
        case 'fallback':
          message.routing.fallback = value;
          break;
      }
    }

    // Clean content - remove headers and routing metadata
    message.content = this.cleanContent(input);

    // Add context
    message.context = context;

    return message;
  }

  /**
   * Remove routing metadata from content
   */
  cleanContent(input) {
    let cleaned = input;

    // Remove header lines
    cleaned = cleaned.replace(/^(\w+):\s*(.+)$/gm, '');

    // Keep @mentions, #topics, !priority in content for now
    // (they provide context for the AI)

    return cleaned.trim();
  }

  /**
   * Classify message intent based on content
   */
  classifyIntent(content) {
    const lower = content.toLowerCase();

    // Code-related
    if (/(code|debug|implement|refactor|fix|bug|error|function)/i.test(lower)) {
      return 'code';
    }

    // Creative tasks
    if (/(write|create|design|brainstorm|story|poem|creative)/i.test(lower)) {
      return 'creative';
    }

    // Analysis/reasoning
    if (/(analyze|explain|compare|evaluate|reason|think|solve)/i.test(lower)) {
      return 'reasoning';
    }

    // Quick facts
    if (/(what is|define|who is|when did|where is)/i.test(lower)) {
      return 'fact';
    }

    // Workflow/automation
    if (/(automate|workflow|schedule|trigger|n8n|script)/i.test(lower)) {
      return 'workflow';
    }

    return 'general';
  }

  /**
   * Suggest agents based on intent
   */
  suggestAgents(intent) {
    const suggestions = {
      code: ['@ollama:codellama', '@gpt4', '@claude'],
      creative: ['@claude', '@gpt4', '@ollama:mistral'],
      reasoning: ['@gpt4', '@claude', '@deepseek'],
      fact: ['@ollama', '@gpt-3.5'],
      workflow: ['@n8n-bridge', '@script-toolkit'],
      general: ['@gpt4', '@claude', '@ollama']
    };

    return suggestions[intent] || suggestions.general;
  }

  /**
   * Format a message for display (with routing info)
   */
  formatForDisplay(message) {
    let display = '';

    if (message.subject) {
      display += `Subject: ${message.subject}\n`;
    }

    if (message.to.length > 0) {
      display += `To: ${message.to.join(', ')}\n`;
    }

    if (message.cc.length > 0) {
      display += `Cc: ${message.cc.join(', ')}\n`;
    }

    if (message.priority !== 'normal') {
      display += `Priority: ${message.priority}\n`;
    }

    if (message.topics.length > 0) {
      display += `Topics: ${message.topics.map(t => '#' + t).join(', ')}\n`;
    }

    if (display) {
      display += '\n';
    }

    display += message.content;

    return display;
  }
}

module.exports = MessageParser;
