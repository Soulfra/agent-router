/**
 * Output Formatter & Sanitizer
 *
 * Cleans and formats LLM outputs:
 * - Remove PowerPoint/slide artifacts
 * - Clean markdown formatting
 * - Remove metadata and thinking steps
 * - Normalize whitespace
 * - Fix code block syntax
 */

class OutputFormatter {
  constructor() {
    // Patterns for artifacts to remove
    this.artifactPatterns = [
      // PowerPoint / Slide artifacts
      /\[Slide \d+\]/gi,
      /---slide---/gi,
      /^Slide \d+:/gmi,
      /\*\*Slide \d+\*\*/gi,

      // Presentation markers
      /^##\s*Slide\s+\d+/gmi,
      /^###\s*Slide\s+\d+/gmi,
      /\[Next Slide\]/gi,
      /\[Previous Slide\]/gi,

      // Thinking/reasoning artifacts
      /<thinking>[\s\S]*?<\/thinking>/gi,
      /\[Thinking\][\s\S]*?\[\/Thinking\]/gi,
      /^Thought:.*$/gmi,
      /^Internal reasoning:.*$/gmi,

      // LLM metadata
      /\[Response starts\]/gi,
      /\[Response ends\]/gi,
      /^Response:/gmi,
      /^Output:/gmi,

      // Common artifacts
      /\[REDACTED\]/gi,
      /\[PLACEHOLDER\]/gi,
      /\[TODO\]/gi,
      /\[DRAFT\]/gi
    ];
  }

  /**
   * Clean and format output
   */
  format(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let cleaned = text;

    // Remove artifacts
    if (options.removeArtifacts !== false) {
      cleaned = this.removeArtifacts(cleaned);
    }

    // Clean markdown
    if (options.cleanMarkdown !== false) {
      cleaned = this.cleanMarkdown(cleaned);
    }

    // Normalize whitespace
    if (options.normalizeWhitespace !== false) {
      cleaned = this.normalizeWhitespace(cleaned);
    }

    // Fix code blocks
    if (options.fixCodeBlocks !== false) {
      cleaned = this.fixCodeBlocks(cleaned);
    }

    return cleaned.trim();
  }

  /**
   * Remove PowerPoint/slide and thinking artifacts
   */
  removeArtifacts(text) {
    let cleaned = text;

    // Remove all known artifact patterns
    this.artifactPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    return cleaned;
  }

  /**
   * Clean markdown formatting
   */
  cleanMarkdown(text) {
    let cleaned = text;

    // Fix excessive heading levels (no more than 3 #)
    cleaned = cleaned.replace(/^#{4,}\s+/gm, '### ');

    // Remove excessive newlines in lists
    cleaned = cleaned.replace(/(\n-.*\n)\n+(?=-)/g, '$1');

    // Fix bold/italic markers
    cleaned = cleaned.replace(/\*\*\*\*/g, '**');
    cleaned = cleaned.replace(/____/g, '__');

    // Remove trailing spaces on lines
    cleaned = cleaned.replace(/ +$/gm, '');

    // Fix broken links
    cleaned = cleaned.replace(/\[([^\]]+)\]\(\s*\)/g, '$1');

    return cleaned;
  }

  /**
   * Normalize whitespace
   */
  normalizeWhitespace(text) {
    let cleaned = text;

    // Replace multiple spaces with single space (except in code blocks)
    const parts = this._splitByCodeBlocks(cleaned);

    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) { // Not in code block
        parts[i] = parts[i]
          .replace(/ {2,}/g, ' ') // Multiple spaces -> single space
          .replace(/\n{3,}/g, '\n\n'); // Multiple newlines -> max 2
      }
    }

    cleaned = parts.join('');

    // Remove spaces around newlines
    cleaned = cleaned.replace(/ *\n */g, '\n');

    return cleaned;
  }

  /**
   * Fix code block formatting
   */
  fixCodeBlocks(text) {
    let cleaned = text;

    // Ensure code blocks have language identifier
    cleaned = cleaned.replace(/^```\n/gm, '```plaintext\n');

    // Fix common language typos
    const langMap = {
      'js': 'javascript',
      'py': 'python',
      'rb': 'ruby',
      'ts': 'typescript',
      'sh': 'bash',
      'yml': 'yaml'
    };

    Object.keys(langMap).forEach(short => {
      const full = langMap[short];
      cleaned = cleaned.replace(new RegExp('^```' + short + '\\n', 'gm'), '```' + full + '\\n');
    });

    // Ensure closing backticks
    // Count all ``` at start of line
    const allBlocks = (cleaned.match(/^```/gm) || []).length;

    // If odd number, add closing backtick
    if (allBlocks % 2 !== 0) {
      // Add missing closing backticks
      cleaned += '\n```';
    }

    return cleaned;
  }

  /**
   * Remove specific section by heading
   */
  removeSection(text, sectionHeading) {
    const regex = new RegExp(
      `^#{1,3}\\s+${sectionHeading}\\s*$[\\s\\S]*?(?=^#{1,3}\\s+|$)`,
      'gmi'
    );
    return text.replace(regex, '');
  }

  /**
   * Extract specific section by heading
   */
  extractSection(text, sectionHeading) {
    const regex = new RegExp(
      `^#{1,3}\\s+${sectionHeading}\\s*$([\\s\\S]*?)(?=^#{1,3}\\s+|$)`,
      'gmi'
    );
    const match = regex.exec(text);
    return match ? match[1].trim() : null;
  }

  /**
   * Split text by code blocks
   * @private
   */
  _splitByCodeBlocks(text) {
    const parts = [];
    let current = '';
    let inCodeBlock = false;

    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          // End of code block
          current += line + '\n';
          parts.push(current);
          current = '';
          inCodeBlock = false;
        } else {
          // Start of code block
          parts.push(current);
          current = line + '\n';
          inCodeBlock = true;
        }
      } else {
        current += line + '\n';
      }
    }

    // Add remaining content
    if (current) {
      parts.push(current);
    }

    return parts;
  }

  /**
   * Convert to clean plain text (remove all markdown)
   */
  toPlainText(text) {
    let plain = text;

    // Remove code blocks content
    plain = plain.replace(/```[\s\S]*?```/g, '[code]');

    // Remove inline code
    plain = plain.replace(/`([^`]+)`/g, '$1');

    // Remove links
    plain = plain.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove images
    plain = plain.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

    // Remove headings markers
    plain = plain.replace(/^#+\s+/gm, '');

    // Remove bold/italic
    plain = plain.replace(/\*\*([^*]+)\*\*/g, '$1');
    plain = plain.replace(/\*([^*]+)\*/g, '$1');
    plain = plain.replace(/__([^_]+)__/g, '$1');
    plain = plain.replace(/_([^_]+)_/g, '$1');

    // Remove list markers
    plain = plain.replace(/^\s*[-*+]\s+/gm, '');
    plain = plain.replace(/^\s*\d+\.\s+/gm, '');

    // Remove blockquotes
    plain = plain.replace(/^>\s+/gm, '');

    // Normalize whitespace
    plain = plain.replace(/\n{3,}/g, '\n\n');

    return plain.trim();
  }

  /**
   * Validate markdown syntax
   */
  validateMarkdown(text) {
    const errors = [];

    // Check for unmatched code blocks
    const openBlocks = (text.match(/^```/gm) || []).length;
    if (openBlocks % 2 !== 0) {
      errors.push('Unmatched code block backticks');
    }

    // Check for broken links
    const brokenLinks = text.match(/\[([^\]]+)\]\(\s*\)/g);
    if (brokenLinks) {
      errors.push(`Found ${brokenLinks.length} broken links`);
    }

    // Check for excessive heading levels
    const badHeadings = text.match(/^#{5,}\s+/gm);
    if (badHeadings) {
      errors.push(`Found ${badHeadings.length} headings with too many levels (> 4)`);
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}

module.exports = new OutputFormatter();
