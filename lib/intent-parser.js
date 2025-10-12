/**
 * Intent Parser
 *
 * Parses natural language voice commands into structured intents
 * for the pipeline orchestrator.
 *
 * Examples:
 * - "Create a logo for Soulfra" → { action: 'create', artifact: 'logo', domain: 'soulfra' }
 * - "Build a button component" → { action: 'create', artifact: 'component', type: 'button' }
 * - "Make an email signup form for all domains" → { action: 'create', artifact: 'component', type: 'form', scope: 'all' }
 */

class IntentParser {
  constructor() {
    // Domain name mappings (handle variations)
    this.domainNames = {
      'soulfra': 'soulfra.com',
      'soul fra': 'soulfra.com',
      'death to data': 'deathtodata.com',
      'deathtodata': 'deathtodata.com',
      'finish this idea': 'finishthisidea.com',
      'finishthisidea': 'finishthisidea.com',
      'deal or delete': 'dealordelete.com',
      'dealordelete': 'dealordelete.com',
      'save or sink': 'saveorsink.com',
      'saveorsink': 'saveorsink.com',
      'cringe proof': 'cringeproof.com',
      'cringeproof': 'cringeproof.com',
      'finish this repo': 'finishthisrepo.com',
      'finishthisrepo': 'finishthisrepo.com',
      'ipo my agent': 'ipomyagent.com',
      'ipomyagent': 'ipomyagent.com',
      'hollow town': 'hollowtown.com',
      'hollowtown': 'hollowtown.com',
      'hook clinic': 'hookclinic.com',
      'hookclinic': 'hookclinic.com',
      'business ai classroom': 'businessaiclassroom.com',
      'businessaiclassroom': 'businessaiclassroom.com',
      'rough sparks': 'roughsparks.com',
      'roughsparks': 'roughsparks.com'
    };

    // Action keywords
    this.actionKeywords = {
      create: ['create', 'make', 'build', 'generate', 'design'],
      update: ['update', 'modify', 'change', 'edit', 'improve'],
      deploy: ['deploy', 'publish', 'push', 'release'],
      test: ['test', 'check', 'verify', 'validate']
    };

    // Artifact types
    this.artifactTypes = {
      logo: ['logo', 'icon', 'brand mark', 'symbol'],
      component: ['component', 'widget', 'element', 'module'],
      page: ['page', 'landing page', 'site', 'website'],
      animation: ['animation', 'transition', 'effect'],
      svg: ['svg', 'vector', 'graphic'],
      button: ['button', 'cta', 'call to action'],
      form: ['form', 'input', 'signup', 'email capture'],
      card: ['card', 'tile', 'panel'],
      navigation: ['nav', 'navigation', 'menu', 'navbar'],
      hero: ['hero', 'banner', 'header section'],
      footer: ['footer', 'bottom section']
    };

    // Component sub-types
    this.componentTypes = [
      'button', 'form', 'card', 'navigation', 'hero', 'footer',
      'modal', 'dropdown', 'tooltip', 'accordion', 'tabs',
      'carousel', 'grid', 'list', 'table', 'chart'
    ];

    // Color keywords
    this.colorKeywords = {
      'red': ['red', 'crimson', 'scarlet'],
      'purple': ['purple', 'violet', 'lavender'],
      'blue': ['blue', 'azure', 'navy'],
      'green': ['green', 'emerald', 'lime'],
      'orange': ['orange', 'tangerine'],
      'pink': ['pink', 'magenta', 'rose'],
      'teal': ['teal', 'cyan', 'turquoise'],
      'amber': ['amber', 'yellow', 'gold']
    };

    // Style keywords
    this.styleKeywords = {
      minimal: ['minimal', 'minimalist', 'simple', 'clean'],
      modern: ['modern', 'contemporary', 'sleek'],
      bold: ['bold', 'strong', 'dramatic', 'powerful'],
      playful: ['playful', 'fun', 'whimsical', 'quirky'],
      professional: ['professional', 'corporate', 'business'],
      creative: ['creative', 'artistic', 'unique', 'innovative']
    };
  }

  /**
   * Parse natural language command into structured intent
   */
  parse(text) {
    const normalized = text.toLowerCase().trim();

    const intent = {
      raw: text,
      action: this.extractAction(normalized),
      artifact: this.extractArtifact(normalized),
      domain: this.extractDomain(normalized),
      scope: this.extractScope(normalized),
      attributes: {
        colors: this.extractColors(normalized),
        style: this.extractStyle(normalized),
        type: this.extractType(normalized)
      },
      confidence: 0
    };

    // Calculate confidence score
    intent.confidence = this.calculateConfidence(intent);

    // Add suggestions if confidence is low
    if (intent.confidence < 0.6) {
      intent.suggestions = this.generateSuggestions(intent);
    }

    return intent;
  }

  /**
   * Extract action from text
   */
  extractAction(text) {
    for (const [action, keywords] of Object.entries(this.actionKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return action;
      }
    }
    return 'create'; // Default action
  }

  /**
   * Extract artifact type
   */
  extractArtifact(text) {
    for (const [artifact, keywords] of Object.entries(this.artifactTypes)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return artifact;
      }
    }
    return 'component'; // Default artifact
  }

  /**
   * Extract specific domain
   */
  extractDomain(text) {
    for (const [name, domain] of Object.entries(this.domainNames)) {
      if (text.includes(name)) {
        return domain;
      }
    }
    return null; // All domains
  }

  /**
   * Extract scope (single, multiple, all domains)
   */
  extractScope(text) {
    if (text.includes('all domains') || text.includes('every domain') || text.includes('all sites')) {
      return 'all';
    }
    if (text.includes('multiple') || text.includes('several')) {
      return 'multiple';
    }
    return 'single';
  }

  /**
   * Extract color preferences
   */
  extractColors(text) {
    const colors = [];
    for (const [color, keywords] of Object.entries(this.colorKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        colors.push(color);
      }
    }

    // Also check for "brand colors" or "domain colors"
    if (text.includes('brand color') || text.includes('domain color')) {
      colors.push('brand');
    }

    return colors;
  }

  /**
   * Extract style preferences
   */
  extractStyle(text) {
    for (const [style, keywords] of Object.entries(this.styleKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return style;
      }
    }
    return null;
  }

  /**
   * Extract component type
   */
  extractType(text) {
    for (const type of this.componentTypes) {
      if (text.includes(type)) {
        return type;
      }
    }
    return null;
  }

  /**
   * Calculate confidence score (0-1)
   */
  calculateConfidence(intent) {
    let score = 0.5; // Base score

    // Higher confidence if we found specific action
    if (intent.action && intent.action !== 'create') {
      score += 0.1;
    }

    // Higher confidence if we found artifact type
    if (intent.artifact) {
      score += 0.2;
    }

    // Higher confidence if domain specified
    if (intent.domain) {
      score += 0.2;
    }

    // Higher confidence if attributes found
    if (intent.attributes.colors?.length > 0) {
      score += 0.1;
    }
    if (intent.attributes.style) {
      score += 0.1;
    }
    if (intent.attributes.type) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Generate suggestions for ambiguous commands
   */
  generateSuggestions(intent) {
    const suggestions = [];

    if (!intent.artifact || intent.artifact === 'component') {
      suggestions.push('Try specifying what to create (logo, button, form, etc.)');
    }

    if (!intent.domain && intent.scope === 'single') {
      suggestions.push('Which domain? Try: "for Soulfra" or "for Death To Data"');
    }

    if (intent.attributes.colors.length === 0) {
      suggestions.push('Want specific colors? Try: "using red" or "with brand colors"');
    }

    return suggestions;
  }

  /**
   * Convert intent to challenge prompt
   */
  toChallengePrompt(intent) {
    let prompt = '';

    // Build prompt from intent
    if (intent.artifact === 'logo') {
      prompt = `Create a logo`;
      if (intent.domain) {
        prompt += ` for ${intent.domain}`;
      }
      if (intent.attributes.style) {
        prompt += ` with a ${intent.attributes.style} style`;
      }
      if (intent.attributes.colors.length > 0) {
        prompt += `. Use ${intent.attributes.colors.join(' and ')} colors`;
      }
      prompt += '. Include SVG markup.';
    } else if (intent.artifact === 'component') {
      const type = intent.attributes.type || 'generic';
      prompt = `Create a ${type} component`;
      if (intent.attributes.style) {
        prompt += ` with a ${intent.attributes.style} design`;
      }
      prompt += '. Use domain brand colors and include hover effects.';
    } else if (intent.artifact === 'page') {
      prompt = `Create a landing page`;
      if (intent.domain) {
        prompt += ` for ${intent.domain}`;
      }
      prompt += '. Include hero section, features, and CTA. Use domain brand colors.';
    } else {
      prompt = `Create a ${intent.artifact}`;
      if (intent.domain) {
        prompt += ` for ${intent.domain}`;
      }
      if (intent.attributes.style) {
        prompt += ` with ${intent.attributes.style} styling`;
      }
    }

    return prompt;
  }

  /**
   * Validate intent is actionable
   */
  validate(intent) {
    const errors = [];

    if (!intent.action) {
      errors.push('No action specified');
    }

    if (!intent.artifact) {
      errors.push('No artifact type specified');
    }

    if (intent.scope === 'multiple' && !intent.domain) {
      errors.push('Multiple domains requested but none specified');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Parse batch commands (multiple intents in one message)
   */
  parseBatch(text) {
    // Split on conjunctions and line breaks
    const segments = text
      .split(/\s+(?:and then|then|also|next)\s+/i)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return segments.map(segment => this.parse(segment));
  }
}

module.exports = IntentParser;
