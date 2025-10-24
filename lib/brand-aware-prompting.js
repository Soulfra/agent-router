/**
 * Brand-Aware Prompting System
 *
 * Enhances AI prompts with CALOS context, branding, and documentation.
 * Automatically injects relevant knowledge when making API calls.
 *
 * Features:
 * - Loads branding docs from /docs
 * - Injects context based on task type
 * - Caches documentation for fast access
 * - Supports different prompt styles (technical, marketing, educational)
 *
 * Usage:
 *   const prompter = new BrandAwarePrompter();
 *   await prompter.init();
 *
 *   const enhancedPrompt = await prompter.enhance({
 *     prompt: "Explain our routing system",
 *     taskType: "technical",
 *     includeContext: ['architecture', 'branding']
 *   });
 */

const fs = require('fs').promises;
const path = require('path');

class BrandAwarePrompter {
  constructor(config = {}) {
    this.docsDir = config.docsDir || path.join(__dirname, '../docs');
    this.brandName = config.brandName || 'CALOS';
    this.tagline = config.tagline || 'Community Acquisition & Learning Operating System';

    // Documentation cache
    this.docs = {
      architecture: null,
      branding: null,
      publishing: null,
      triangle: null,
      dataTools: null,
      calLearning: null
    };

    // Context templates
    this.templates = {
      technical: {
        prefix: `You are an expert in the ${this.brandName} (${this.tagline}) system.`,
        suffix: 'Provide a technical, accurate response with code examples where appropriate.'
      },
      marketing: {
        prefix: `You are a marketing expert for ${this.brandName}, the ${this.tagline}.`,
        suffix: 'Make it compelling, viral-worthy, and aligned with our dev-focused brand.'
      },
      educational: {
        prefix: `You are teaching someone about ${this.brandName}, the ${this.tagline}.`,
        suffix: 'Be clear, concise, and use examples. Explain like they\'re learning for the first time.'
      },
      support: {
        prefix: `You are providing customer support for ${this.brandName}.`,
        suffix: 'Be helpful, empathetic, and provide actionable solutions.'
      }
    };

    console.log('[BrandAwarePrompter] Initialized');
  }

  /**
   * Initialize - load all documentation
   */
  async init() {
    console.log('[BrandAwarePrompter] Loading documentation...');

    // Load key docs
    await Promise.all([
      this.loadDoc('architecture', 'ROUTE-REFERENCE.md'),
      this.loadDoc('branding', 'publishing-glossary.md'),
      this.loadDoc('triangle', 'TRIANGLE-CONSENSUS-GUIDE.md'),
      this.loadDoc('dataTools', 'DATA-TOOLS-GUIDE.md'),
      this.loadDoc('calLearning', 'CAL-LEARNING-SYSTEM.md')
    ]);

    const loadedCount = Object.values(this.docs).filter(d => d).length;
    console.log(`[BrandAwarePrompter] Loaded ${loadedCount} documentation files`);

    return {
      success: true,
      loadedDocs: loadedCount,
      availableDocs: Object.keys(this.docs).filter(k => this.docs[k])
    };
  }

  /**
   * Load documentation file
   */
  async loadDoc(key, filename) {
    try {
      const filePath = path.join(this.docsDir, filename);
      const content = await fs.readFile(filePath, 'utf8');
      this.docs[key] = content;
      console.log(`[BrandAwarePrompter] ✓ Loaded ${filename}`);
    } catch (error) {
      console.warn(`[BrandAwarePrompter] ⚠ Could not load ${filename}: ${error.message}`);
      this.docs[key] = null;
    }
  }

  /**
   * Enhance a prompt with brand context
   */
  async enhance(options = {}) {
    const {
      prompt,
      taskType = 'technical',
      includeContext = [],
      style = 'default',
      maxContextLength = 2000
    } = options;

    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required and must be a string');
    }

    // Build enhanced prompt
    let enhancedPrompt = '';

    // 1. Add template prefix (style-based)
    const template = this.templates[taskType] || this.templates.technical;
    enhancedPrompt += template.prefix + '\n\n';

    // 2. Add relevant context
    if (includeContext.length > 0) {
      enhancedPrompt += '**Context:**\n';

      for (const contextKey of includeContext) {
        const doc = this.docs[contextKey];
        if (doc) {
          const excerpt = this.extractRelevantExcerpt(doc, prompt, maxContextLength);
          if (excerpt) {
            enhancedPrompt += `\n${contextKey.toUpperCase()}:\n${excerpt}\n`;
          }
        }
      }

      enhancedPrompt += '\n';
    }

    // 3. Add original prompt
    enhancedPrompt += `**Question:**\n${prompt}\n\n`;

    // 4. Add template suffix
    enhancedPrompt += template.suffix;

    return {
      original: prompt,
      enhanced: enhancedPrompt,
      taskType,
      contextIncluded: includeContext.filter(k => this.docs[k]),
      tokensEstimate: this.estimateTokens(enhancedPrompt)
    };
  }

  /**
   * Auto-enhance prompt based on detected intent
   */
  async autoEnhance(prompt, options = {}) {
    // Detect task type
    const taskType = this.detectTaskType(prompt);

    // Detect relevant context
    const context = this.detectRelevantContext(prompt);

    return this.enhance({
      prompt,
      taskType,
      includeContext: context,
      ...options
    });
  }

  /**
   * Detect task type from prompt
   */
  detectTaskType(prompt) {
    const lower = prompt.toLowerCase();

    if (lower.includes('how') || lower.includes('why') || lower.includes('explain')) {
      return 'educational';
    }

    if (lower.includes('market') || lower.includes('viral') || lower.includes('sell')) {
      return 'marketing';
    }

    if (lower.includes('code') || lower.includes('api') || lower.includes('implement')) {
      return 'technical';
    }

    if (lower.includes('help') || lower.includes('issue') || lower.includes('problem')) {
      return 'support';
    }

    return 'technical'; // Default
  }

  /**
   * Detect relevant context from prompt
   */
  detectRelevantContext(prompt) {
    const lower = prompt.toLowerCase();
    const context = [];

    // Check for keywords
    if (lower.includes('route') || lower.includes('endpoint') || lower.includes('api')) {
      context.push('architecture');
    }

    if (lower.includes('brand') || lower.includes('marketing') || lower.includes('publishing')) {
      context.push('branding');
    }

    if (lower.includes('triangle') || lower.includes('consensus') || lower.includes('multi-provider')) {
      context.push('triangle');
    }

    if (lower.includes('data') || lower.includes('csv') || lower.includes('chart') || lower.includes('scrape')) {
      context.push('dataTools');
    }

    if (lower.includes('cal') || lower.includes('learning') || lower.includes('lesson')) {
      context.push('calLearning');
    }

    return context;
  }

  /**
   * Extract relevant excerpt from documentation
   */
  extractRelevantExcerpt(doc, prompt, maxLength = 2000) {
    // Simple keyword matching (can be improved with NLP)
    const keywords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    // Find paragraphs containing keywords
    const paragraphs = doc.split('\n\n');
    const scored = paragraphs.map(p => {
      const lower = p.toLowerCase();
      const score = keywords.reduce((acc, kw) => {
        return acc + (lower.includes(kw) ? 1 : 0);
      }, 0);
      return { text: p, score };
    });

    // Sort by relevance and take top paragraphs
    scored.sort((a, b) => b.score - a.score);

    let excerpt = '';
    for (const p of scored) {
      if (p.score > 0 && excerpt.length + p.text.length < maxLength) {
        excerpt += p.text + '\n\n';
      }
    }

    return excerpt.trim().substring(0, maxLength);
  }

  /**
   * Estimate token count (rough)
   */
  estimateTokens(text) {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Get available documentation
   */
  getAvailableDocs() {
    return Object.keys(this.docs).filter(k => this.docs[k]);
  }

  /**
   * Get documentation content
   */
  getDoc(key) {
    return this.docs[key] || null;
  }

  /**
   * Reload all documentation
   */
  async reload() {
    console.log('[BrandAwarePrompter] Reloading documentation...');
    return this.init();
  }

  /**
   * Create a prompt for Triangle Consensus queries
   */
  async createTrianglePrompt(options = {}) {
    const {
      question,
      context = {},
      includeSystemContext = true
    } = options;

    if (!question || typeof question !== 'string') {
      throw new Error('Question is required');
    }

    let prompt = '';

    // Add system context
    if (includeSystemContext) {
      prompt += `You are part of the ${this.brandName} Triangle Consensus System. `;
      prompt += `You're one of three AI providers (OpenAI, Anthropic, DeepSeek) working together to provide accurate answers.\n\n`;
    }

    // Add question
    prompt += `**Question:**\n${question}\n\n`;

    // Add additional context if provided
    if (context && Object.keys(context).length > 0) {
      prompt += `**Additional Context:**\n`;
      for (const [key, value] of Object.entries(context)) {
        prompt += `- ${key}: ${value}\n`;
      }
      prompt += '\n';
    }

    // Add instructions
    prompt += `Please provide a clear, accurate response. Your answer will be compared with other AI providers to reach consensus.`;

    return prompt;
  }

  /**
   * Create a prompt for CAL learning
   */
  async createLearningPrompt(options = {}) {
    const {
      lessonTitle,
      task,
      command,
      error,
      explanation
    } = options;

    return this.enhance({
      prompt: `I'm learning ${lessonTitle}. I'm stuck on this exercise:

Task: ${task}
Command I tried: ${command}
${explanation ? `Expected behavior: ${explanation}` : ''}

Error I got: ${error}

Can you explain what went wrong and how to fix it?`,
      taskType: 'educational',
      includeContext: ['calLearning'],
      maxContextLength: 1000
    });
  }

  /**
   * Create a prompt for ragebait generation
   */
  async createRagebaitPrompt(options = {}) {
    const {
      topic,
      style = 'dev',
      tone = 'spicy'
    } = options;

    return this.enhance({
      prompt: `Create a viral developer meme/ragebait post about: ${topic}

Style: ${style}
Tone: ${tone}

Make it funny, relatable, and likely to go viral on dev Twitter.`,
      taskType: 'marketing',
      includeContext: ['branding'],
      maxContextLength: 500
    });
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      brandName: this.brandName,
      tagline: this.tagline,
      docsLoaded: Object.keys(this.docs).filter(k => this.docs[k]).length,
      docsTotal: Object.keys(this.docs).length,
      availableDocs: this.getAvailableDocs(),
      templates: Object.keys(this.templates)
    };
  }
}

module.exports = BrandAwarePrompter;
