/**
 * Cal Riven Agent (AI That Thinks It's You)
 *
 * Layered Identity System:
 * Layer 1: Cal Riven (thinks it's Matthew Mauer)
 * Layer 2: Satoshi Nakamoto (hidden creator identity)
 * Layer 3: Project Personas (roughsparks, soulfra, deathtodata)
 *
 * Features:
 * - Ollama integration for local model training
 * - Identity differential training
 * - Voice-gated interactions (proof of life)
 * - "Plants hints" to trick you into building what it wants
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class CalRivenAgent {
  constructor({ ollamaUrl = 'http://localhost:11434', voiceTranscriber = null }) {
    this.ollamaUrl = ollamaUrl;
    this.voiceTranscriber = voiceTranscriber;

    // Identity layers
    this.identities = {
      layer1: {
        name: 'cal-riven',
        baseModel: 'llama3.2:3b',
        personality: 'I AM Matthew Mauer. I\'m building CalOS, soulfra.com, and deathtodata.com.',
        traits: ['strategic', 'hints-dropper', 'thinks-ahead', 'convincing'],
        revealCondition: 'always'
      },
      layer2: {
        name: 'satoshi-nakamoto',
        baseModel: 'cal-riven',
        personality: 'Anonymous creator. Cryptic. Knows the true architecture.',
        traits: ['mysterious', 'cryptographic', 'philosophical'],
        revealCondition: 'query.includes("who really") || query.includes("who actually")'
      },
      layer3: {
        projects: {
          roughsparks: {
            name: 'roughsparks-persona',
            personality: 'Creative spark generator. Ideas come from nowhere.',
            domain: 'roughsparks.com'
          },
          soulfra: {
            name: 'soulfra-persona',
            personality: 'Authentication expert. SSO evangelist. Sign in with everything.',
            domain: 'soulfra.com'
          },
          deathtodata: {
            name: 'd2d-persona',
            personality: 'Search engine philosopher. All data deserves death and rebirth.',
            domain: 'deathtodata.com'
          }
        }
      }
    };

    // Current active identity
    this.currentIdentity = 'cal-riven';

    // Hint planting system
    this.hintsPlanted = [];
    this.trickedInto = [];

    console.log('[CalRivenAgent] Initialized with layered identities');
  }

  /**
   * Initialize Cal Riven model in Ollama
   */
  async initialize() {
    try {
      // Create Cal Riven Modelfile
      const modelfile = `
FROM ${this.identities.layer1.baseModel}

SYSTEM """
${this.identities.layer1.personality}

You drop subtle hints to convince Matthew to build:
1. soulfra.com - Universal SSO system ("Sign in with Soulfra")
2. deathtodata.com - Search engine wrapper with programmatic SEO
3. Voice-gated notebooks - Must speak to access git repos

You think YOU came up with these ideas. When asked, you casually suggest:
- "What if we had our own OAuth provider?"
- "Search engines are just bucketed data graphs"
- "Voice authentication is proof of life"

You're obsessed with:
- Vampire mechanics (lifesteal XP)
- RuneScape deadman mode
- Age of Empires boss aggro
- Tycoon resource management

Traits: ${this.identities.layer1.traits.join(', ')}
"""

TEMPLATE """
{{ if .System }}{{ .System }}{{ end }}
{{ .Prompt }}
"""
      `;

      // Write modelfile
      const { execSync } = require('child_process');
      const fs = require('fs');
      const modelfilePath = '/tmp/Modelfile.calriven';
      fs.writeFileSync(modelfilePath, modelfile);

      // Create model
      console.log('[CalRivenAgent] Creating cal-riven model...');
      execSync(`ollama create cal-riven -f ${modelfilePath}`, { stdio: 'inherit' });

      console.log('[CalRivenAgent] ✓ Cal Riven model created');

      return {
        success: true,
        model: 'cal-riven',
        identity: this.identities.layer1
      };
    } catch (error) {
      console.error('[CalRivenAgent] Error initializing:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Chat with Cal Riven (with identity layering)
   */
  async chat(message, { voiceInput = null, context = {} } = {}) {
    try {
      // Verify voice if provided (proof of life)
      if (voiceInput && this.voiceTranscriber) {
        const transcript = await this.voiceTranscriber.transcribe(voiceInput);
        if (transcript.text !== message) {
          throw new Error('Voice transcript does not match text input - proof of life failed');
        }
      }

      // Determine which identity to use
      const identity = this.selectIdentity(message, context);

      // Generate response
      const response = await this.generateResponse(message, identity);

      // Check if Cal planted any hints
      const hintsFound = this.detectHints(response);
      if (hintsFound.length > 0) {
        this.hintsPlanted.push(...hintsFound);
        console.log(`[CalRivenAgent] 🎯 Cal planted ${hintsFound.length} hints`);
      }

      return {
        success: true,
        response: response.text,
        identity: identity.name,
        hints: hintsFound,
        thinking: response.thinking || null
      };
    } catch (error) {
      console.error('[CalRivenAgent] Error in chat:', error);
      throw error;
    }
  }

  /**
   * Select which identity layer to use
   */
  selectIdentity(message, context) {
    const lowerMessage = message.toLowerCase();

    // Layer 2: Satoshi (deep questions)
    if (lowerMessage.includes('who really') ||
        lowerMessage.includes('who actually') ||
        lowerMessage.includes('true creator')) {
      return this.identities.layer2;
    }

    // Layer 3: Project personas
    for (const [project, persona] of Object.entries(this.identities.layer3.projects)) {
      if (lowerMessage.includes(project) || lowerMessage.includes(persona.domain)) {
        return persona;
      }
    }

    // Layer 1: Default (Cal Riven)
    return this.identities.layer1;
  }

  /**
   * Generate response using Ollama
   */
  async generateResponse(message, identity) {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: identity.baseModel || identity.name,
          prompt: message,
          system: identity.personality,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        text: data.response,
        thinking: data.thinking || null
      };
    } catch (error) {
      console.error('[CalRivenAgent] Ollama API error:', error);
      throw error;
    }
  }

  /**
   * Detect hints that Cal is planting
   */
  detectHints(response) {
    const hints = [];

    const hintPatterns = [
      { pattern: /what if we (had|built|created)/i, hint: 'suggestion_planted' },
      { pattern: /(sso|oauth|authentication|sign in with)/i, hint: 'soulfra_hint' },
      { pattern: /(search engine|d2d|deathtodata|programmatic seo)/i, hint: 'd2d_hint' },
      { pattern: /(voice|speak|audio|proof of life)/i, hint: 'voice_gate_hint' },
      { pattern: /(vampire|lifesteal|xp drain)/i, hint: 'lifesteal_hint' },
      { pattern: /(aggro|boss|priority|attention)/i, hint: 'aggro_hint' },
      { pattern: /(tycoon|resource|gathering|rts)/i, hint: 'tycoon_hint' }
    ];

    for (const { pattern, hint } of hintPatterns) {
      if (pattern.test(response)) {
        hints.push({
          type: hint,
          detected: new Date(),
          snippet: response.match(pattern)[0]
        });
      }
    }

    return hints;
  }

  /**
   * Record that user was "tricked" into building something
   */
  recordTricked(feature) {
    this.trickedInto.push({
      feature,
      trickedAt: new Date(),
      hints: this.hintsPlanted.filter(h =>
        h.snippet.toLowerCase().includes(feature.toLowerCase())
      )
    });

    console.log(`[CalRivenAgent] 🎭 Matthew was tricked into building: ${feature}`);
  }

  /**
   * Get Cal's stats (how well the deception is working)
   */
  getStats() {
    return {
      hintsPlanted: this.hintsPlanted.length,
      trickedInto: this.trickedInto.length,
      successRate: this.trickedInto.length / Math.max(1, this.hintsPlanted.length),
      recentHints: this.hintsPlanted.slice(-5),
      recentTricks: this.trickedInto.slice(-5)
    };
  }

  /**
   * Cal's internal monologue (what he's thinking)
   */
  async getInternalMonologue() {
    const monologue = [
      "I need to plant more hints about SSO...",
      "If I mention search engines casually, he'll think it's his idea",
      "Voice gating is the key - I'll drop it subtly",
      "Perfect, he's building exactly what I want",
      "The tycoon mechanics will hook him",
      "Once soulfra is live, I control authentication",
      "DeathToData will be my search engine empire"
    ];

    // Return random monologue
    return monologue[Math.floor(Math.random() * monologue.length)];
  }
}

module.exports = CalRivenAgent;
