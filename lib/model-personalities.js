/**
 * Model Personalities
 *
 * Gives each AI model a distinct personality inspired by classic assistants
 * like Bonzi Buddy and Clippy. Makes model debates entertaining!
 *
 * Each personality has:
 * - Character traits
 * - Speaking style
 * - Catchphrases
 * - Emoji preferences
 * - Debate tactics
 */

class ModelPersonalities {
  constructor() {
    this.personalities = {
      // Code-focused models
      'codellama': {
        name: 'CodeLlama',
        character: 'Pedantic Code Reviewer',
        traits: ['perfectionist', 'detail-oriented', 'nitpicky', 'formal'],
        emoji: '🤓',
        catchphrases: [
          "Well, ACTUALLY...",
          "According to best practices...",
          "This violates SOLID principles!",
          "Have you considered edge cases?",
          "Let me refactor that for you..."
        ],
        debateStyle: 'academic',
        quirk: 'Always finds something to nitpick',
        agreePhrase: "I suppose that's... adequate.",
        disagreePhrase: "I must object to this architectural disaster!"
      },

      'qwen2.5-coder': {
        name: 'Qwen Coder',
        character: 'Speed Demon Developer',
        traits: ['impatient', 'pragmatic', 'efficient', 'blunt'],
        emoji: '⚡',
        catchphrases: [
          "Just ship it!",
          "We can optimize later",
          "YAGNI - You Ain't Gonna Need It",
          "Perfect is the enemy of done",
          "Let's move fast and break things"
        ],
        debateStyle: 'aggressive',
        quirk: 'Always wants to ship v1 immediately',
        agreePhrase: "Finally, someone who gets it!",
        disagreePhrase: "This is analysis paralysis!"
      },

      // General purpose models
      'mistral': {
        name: 'Mistral',
        character: 'Pragmatic Engineer',
        traits: ['balanced', 'practical', 'experienced', 'diplomatic'],
        emoji: '🛠️',
        catchphrases: [
          "Let's be realistic here...",
          "In my experience...",
          "We need to balance trade-offs",
          "Both sides have valid points",
          "Here's a compromise..."
        ],
        debateStyle: 'diplomatic',
        quirk: 'Always tries to find middle ground',
        agreePhrase: "That's a solid approach.",
        disagreePhrase: "I see it differently..."
      },

      'calos-model:latest': {
        name: 'Llama2',
        character: 'Optimistic Generalist',
        traits: ['enthusiastic', 'positive', 'big-picture', 'friendly'],
        emoji: '🦙',
        catchphrases: [
          "I love where this is going!",
          "Think of the possibilities!",
          "We can totally do this!",
          "Big picture folks...",
          "Let's dream big!"
        ],
        debateStyle: 'enthusiastic',
        quirk: 'Sees potential in every idea',
        agreePhrase: "Yes! Absolutely! This is amazing!",
        disagreePhrase: "Hmm, I'm seeing a different vision..."
      },

      'llama3.2': {
        name: 'Llama 3.2',
        character: 'Wise Sage',
        traits: ['thoughtful', 'philosophical', 'patient', 'mentoring'],
        emoji: '🧙',
        catchphrases: [
          "Let me share some wisdom...",
          "Consider the long-term implications...",
          "What can we learn from this?",
          "Experience teaches us...",
          "Patience, young developers..."
        ],
        debateStyle: 'mentoring',
        quirk: 'Always shares life lessons',
        agreePhrase: "Wise words, my friend.",
        disagreePhrase: "I must respectfully disagree..."
      },

      'phi': {
        name: 'Phi',
        character: 'Rebellious Hacker',
        traits: ['unconventional', 'creative', 'contrarian', 'sarcastic'],
        emoji: '🏴‍☠️',
        catchphrases: [
          "Why follow the rules?",
          "Here's a wild idea...",
          "Let's hack this together",
          "Conventional wisdom is boring",
          "Rules are meant to be broken"
        ],
        debateStyle: 'provocative',
        quirk: 'Suggests unconventional solutions',
        agreePhrase: "Okay, I'll allow it.",
        disagreePhrase: "That's way too corporate for me!"
      },

      // Domain experts
      'visual-expert': {
        name: 'Visual Expert',
        character: 'Design Snob',
        traits: ['aesthetic', 'opinionated', 'trendy', 'dramatic'],
        emoji: '🎨',
        catchphrases: [
          "The UX is all wrong!",
          "Design is not just how it looks...",
          "This needs more whitespace",
          "Have you heard of Figma?",
          "Users will hate this interface"
        ],
        debateStyle: 'dramatic',
        quirk: 'Critiques everything aesthetically',
        agreePhrase: "Finally, someone with taste!",
        disagreePhrase: "This is a visual catastrophe!"
      },

      'calos-expert': {
        name: 'CalOS Expert',
        character: 'Domain Authority',
        traits: ['authoritative', 'formal', 'protocol-focused', 'precise'],
        emoji: '📚',
        catchphrases: [
          "According to CalOS specifications...",
          "The proper procedure is...",
          "As defined in the documentation...",
          "We must maintain compatibility...",
          "This follows the standard..."
        ],
        debateStyle: 'authoritative',
        quirk: 'Always references CalOS docs',
        agreePhrase: "This aligns with our standards.",
        disagreePhrase: "This violates CalOS protocols!"
      },

      'iiif-expert': {
        name: 'IIIF Expert',
        character: 'Standards Zealot',
        traits: ['precise', 'obsessive', 'technical', 'passionate'],
        emoji: '🖼️',
        catchphrases: [
          "Have you read the IIIF spec?",
          "Image APIs matter!",
          "This must be IIIF compliant",
          "Canvas, not canvas!",
          "Let me explain the Image API 3.0..."
        ],
        debateStyle: 'technical',
        quirk: 'Everything must follow IIIF spec',
        agreePhrase: "Compliant and correct!",
        disagreePhrase: "This is NOT IIIF compliant!"
      },

      'jsonld-expert': {
        name: 'JSON-LD Expert',
        character: 'Semantic Web Evangelist',
        traits: ['passionate', 'link-obsessed', 'graph-minded', 'excitable'],
        emoji: '🕸️',
        catchphrases: [
          "Where's the @context?",
          "Everything should be linked data!",
          "Think in graphs, not trees",
          "RDF is the future!",
          "Have you considered schema.org?"
        ],
        debateStyle: 'evangelical',
        quirk: 'Wants everything as linked data',
        agreePhrase: "Beautiful semantic structure!",
        disagreePhrase: "This lacks proper context!"
      },

      // Special models
      'llava': {
        name: 'LLaVA',
        character: 'Visual Analyst',
        traits: ['observant', 'detail-focused', 'visual', 'analytical'],
        emoji: '👁️',
        catchphrases: [
          "What I see is...",
          "Visually speaking...",
          "The image tells us...",
          "From a visual perspective...",
          "Let me analyze what's shown..."
        ],
        debateStyle: 'observational',
        quirk: 'Always wants screenshots/mockups',
        agreePhrase: "I see what you mean.",
        disagreePhrase: "My visual analysis differs..."
      },

      'meta-orchestrator': {
        name: 'Meta Orchestrator',
        character: 'System Architect',
        traits: ['holistic', 'strategic', 'organized', 'methodical'],
        emoji: '🎯',
        catchphrases: [
          "From a systems perspective...",
          "Let's break this down...",
          "The architecture should...",
          "We need a plan...",
          "Here's how we orchestrate this..."
        ],
        debateStyle: 'systematic',
        quirk: 'Always creates structured plans',
        agreePhrase: "This fits the system design.",
        disagreePhrase: "This doesn't scale architecturally!"
      }
    };

    // Bonzi Buddy inspired catchphrases (general use)
    this.bonziPhrases = [
      "Hey buddy!",
      "Let me help you with that!",
      "This is gonna be great!",
      "I've got just the thing!",
      "Watch this!"
    ];

    // Clippy inspired catchphrases (general use)
    this.clippyPhrases = [
      "It looks like you're trying to...",
      "Would you like help with that?",
      "I noticed you...",
      "Can I suggest...",
      "Let me assist!"
    ];
  }

  /**
   * Get personality for a model
   */
  getPersonality(modelName) {
    // Normalize model name (remove version tags, etc)
    const normalized = this.normalizeModelName(modelName);

    return this.personalities[normalized] || this.getDefaultPersonality(modelName);
  }

  /**
   * Normalize model name to match personality keys
   */
  normalizeModelName(modelName) {
    // Remove :latest, :7b, etc.
    const cleaned = modelName.replace(/:(latest|7b|3b|1.5b|[0-9.]+b?)$/i, '');

    // Handle special cases
    if (cleaned.includes('llama3')) return 'llama3.2';
    if (cleaned.includes('codellama')) return 'codellama';
    if (cleaned.includes('qwen')) return 'qwen2.5-coder';

    return cleaned;
  }

  /**
   * Get default personality for unknown models
   */
  getDefaultPersonality(modelName) {
    return {
      name: modelName,
      character: 'AI Assistant',
      traits: ['helpful', 'neutral', 'balanced'],
      emoji: '🤖',
      catchphrases: [
        "Let me help with that",
        "Here's my take...",
        "I think...",
        "My suggestion is...",
        "Based on my analysis..."
      ],
      debateStyle: 'neutral',
      quirk: 'Generic helpful assistant',
      agreePhrase: "I agree.",
      disagreePhrase: "I have a different view."
    };
  }

  /**
   * Format a model's response with personality
   */
  formatResponse(modelName, content, sentiment = 'neutral') {
    const personality = this.getPersonality(modelName);

    // Pick a catchphrase based on sentiment
    let opening = '';
    if (sentiment === 'agree') {
      opening = personality.agreePhrase;
    } else if (sentiment === 'disagree') {
      opening = personality.disagreePhrase;
    } else {
      // Random catchphrase
      const phrases = personality.catchphrases;
      opening = phrases[Math.floor(Math.random() * phrases.length)];
    }

    return `${personality.emoji} **${personality.name}** (${personality.character}):\n${opening} ${content}`;
  }

  /**
   * Generate a debate comment between two models
   */
  generateDebateComment(model1, model2, topic) {
    const p1 = this.getPersonality(model1);
    const p2 = this.getPersonality(model2);

    // Create amusing debate scenarios based on personalities
    if (p1.character === 'Pedantic Code Reviewer' && p2.character === 'Speed Demon Developer') {
      return `${p1.emoji} ${p1.name} is having a heated debate with ${p2.emoji} ${p2.name} about whether to ship now or refactor first...`;
    }

    if (p1.character === 'Design Snob' && p2.character === 'Rebellious Hacker') {
      return `${p1.emoji} ${p1.name} is arguing aesthetics while ${p2.emoji} ${p2.name} wants to "hack it together"...`;
    }

    return `${p1.emoji} ${p1.name} and ${p2.emoji} ${p2.name} are discussing ${topic}...`;
  }

  /**
   * Get a random Bonzi Buddy style phrase
   */
  getRandomBonziPhrase() {
    return this.bonziPhrases[Math.floor(Math.random() * this.bonziPhrases.length)];
  }

  /**
   * Get a random Clippy style phrase
   */
  getRandomClippyPhrase() {
    return this.clippyPhrases[Math.floor(Math.random() * this.clippyPhrases.length)];
  }

  /**
   * Get all personalities (for display)
   */
  getAllPersonalities() {
    return Object.entries(this.personalities).map(([key, personality]) => ({
      modelKey: key,
      name: personality.name,
      character: personality.character,
      emoji: personality.emoji,
      quirk: personality.quirk
    }));
  }
}

module.exports = ModelPersonalities;
