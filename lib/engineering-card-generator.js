/**
 * EngineeringCardGenerator
 *
 * AI-powered card generator that analyzes codebases and creates educational
 * culture pack cards for teaching engineering through roasting.
 *
 * Features:
 * - Scans project files for patterns/anti-patterns
 * - Extracts design decisions from code
 * - Generates prompt/response cards
 * - Uses CringeProof to rate decisions
 * - Assigns rarity based on complexity
 * - Cal can run this to generate cards on demand
 *
 * Usage:
 *   const generator = new EngineeringCardGenerator();
 *   const cards = await generator.generateFromCodebase('/path/to/project');
 *   const pack = await generator.createCulturePack(cards, 'my-codebase');
 */

const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

class EngineeringCardGenerator {
  constructor(options = {}) {
    this.anthropic = options.anthropic; // Anthropic SDK instance
    this.cringeProofEngine = options.cringeProofEngine; // For rating decisions
    this.outputDir = options.outputDir || path.join(__dirname, '../data/culture-packs');

    // Pattern detection rules
    this.antiPatterns = [
      { name: 'God Object', regex: /class\s+\w+\s*{[\s\S]{2000,}}/g, severity: 'high' },
      { name: 'Nested Callbacks', regex: /\w+\([^)]*function[^}]*{[^}]*function[^}]*{[^}]*function/g, severity: 'high' },
      { name: 'Magic Numbers', regex: /\b\d{2,}\b(?!\s*[;,)])/g, severity: 'medium' },
      { name: 'Global Variables', regex: /^(?:var|let|const)\s+\w+\s*=/gm, severity: 'medium' },
      { name: 'Empty Catch', regex: /catch\s*\([^)]*\)\s*{\s*}/g, severity: 'high' },
      { name: 'TODO Comments', regex: /\/\/\s*TODO:/gi, severity: 'low' },
      { name: 'Console.log Debugging', regex: /console\.log\(/g, severity: 'low' },
      { name: 'Long Parameter List', regex: /function\s+\w+\s*\([^)]{80,}\)/g, severity: 'medium' },
      { name: 'Hardcoded Strings', regex: /=\s*["'][^"']{20,}["']/g, severity: 'medium' },
      { name: 'Copy-Paste Code', regex: /(\w{40,})\s*[\s\S]{1,500}\1/g, severity: 'high' }
    ];

    // Good patterns to celebrate
    this.goodPatterns = [
      { name: 'Design Pattern (Factory)', regex: /class\s+\w*Factory/g },
      { name: 'Design Pattern (Singleton)', regex: /private\s+static\s+instance/g },
      { name: 'Design Pattern (Observer)', regex: /class\s+\w*Observer/g },
      { name: 'Type Safety', regex: /:\s*(string|number|boolean|interface|type)/g },
      { name: 'Error Handling', regex: /try\s*{[\s\S]*?}\s*catch/g },
      { name: 'Unit Tests', regex: /(describe|test|it)\s*\(/g },
      { name: 'Documentation', regex: /\/\*\*[\s\S]*?\*\//g },
      { name: 'Async/Await', regex: /async\s+function|await\s+/g }
    ];

    // Rarity tiers based on complexity/severity
    this.rarityTiers = {
      common: { min: 0, max: 20 },      // Simple patterns
      rare: { min: 21, max: 40 },       // Moderate complexity
      epic: { min: 41, max: 60 },       // Advanced patterns
      legendary: { min: 61, max: 80 },  // Expert-level
      mythic: { min: 81, max: 100 }     // Ultra-rare anti-patterns
    };
  }

  /**
   * Generate cards from a codebase
   * @param {string} projectPath - Path to project root
   * @param {object} options - Generation options
   * @returns {Promise<Array>} - Array of generated cards
   */
  async generateFromCodebase(projectPath, options = {}) {
    const {
      filePattern = '**/*.{js,ts,jsx,tsx,py,java,go,rs}',
      maxFiles = 50,
      includeTests = false
    } = options;

    console.log(`[EngineeringCardGenerator] Scanning ${projectPath}...`);

    // Find files to analyze
    const files = await glob(filePattern, {
      cwd: projectPath,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        ...(includeTests ? [] : ['**/*.test.*', '**/*.spec.*'])
      ],
      absolute: true
    });

    const filesToAnalyze = files.slice(0, maxFiles);
    console.log(`[EngineeringCardGenerator] Found ${files.length} files, analyzing ${filesToAnalyze.length}`);

    // Analyze each file
    const detections = [];
    for (const filePath of filesToAnalyze) {
      const fileDetections = await this.analyzeFile(filePath, projectPath);
      detections.push(...fileDetections);
    }

    console.log(`[EngineeringCardGenerator] Detected ${detections.length} patterns`);

    // Generate cards from detections
    const cards = await this.generateCards(detections, projectPath);

    console.log(`[EngineeringCardGenerator] Generated ${cards.length} cards`);

    return cards;
  }

  /**
   * Analyze a single file for patterns
   * @param {string} filePath - File to analyze
   * @param {string} projectRoot - Project root path
   * @returns {Promise<Array>} - Detected patterns
   */
  async analyzeFile(filePath, projectRoot) {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(projectRoot, filePath);
    const detections = [];

    // Check anti-patterns
    for (const pattern of this.antiPatterns) {
      const matches = content.match(pattern.regex);
      if (matches && matches.length > 0) {
        detections.push({
          type: 'anti-pattern',
          name: pattern.name,
          severity: pattern.severity,
          file: relativePath,
          count: matches.length,
          examples: matches.slice(0, 2).map(m => m.substring(0, 100))
        });
      }
    }

    // Check good patterns
    for (const pattern of this.goodPatterns) {
      const matches = content.match(pattern.regex);
      if (matches && matches.length > 0) {
        detections.push({
          type: 'good-pattern',
          name: pattern.name,
          file: relativePath,
          count: matches.length
        });
      }
    }

    // Check file size (god objects)
    const lines = content.split('\n').length;
    if (lines > 500) {
      detections.push({
        type: 'anti-pattern',
        name: 'God Object',
        severity: 'high',
        file: relativePath,
        count: 1,
        metadata: { lines }
      });
    }

    return detections;
  }

  /**
   * Generate cards from detected patterns
   * @param {Array} detections - Detected patterns
   * @param {string} projectPath - Project path
   * @returns {Promise<Array>} - Generated cards
   */
  async generateCards(detections, projectPath) {
    const cards = [];

    // Group by pattern name
    const grouped = detections.reduce((acc, d) => {
      if (!acc[d.name]) acc[d.name] = [];
      acc[d.name].push(d);
      return acc;
    }, {});

    // Generate cards for each pattern
    for (const [patternName, instances] of Object.entries(grouped)) {
      const isAntiPattern = instances[0].type === 'anti-pattern';
      const severity = instances[0].severity || 'medium';

      // Calculate rarity based on severity and frequency
      const rarity = this.calculateRarity(severity, instances.length, isAntiPattern);

      // Generate prompt and response
      const card = await this.generateCard(patternName, instances, rarity, isAntiPattern);

      if (card) {
        cards.push(card);
      }
    }

    return cards;
  }

  /**
   * Generate a single card
   * @param {string} patternName - Pattern name
   * @param {Array} instances - Pattern instances
   * @param {string} rarity - Card rarity
   * @param {boolean} isAntiPattern - Is this an anti-pattern?
   * @returns {Promise<object>} - Generated card
   */
  async generateCard(patternName, instances, rarity, isAntiPattern) {
    // Create prompt based on pattern type
    const prompt = isAntiPattern
      ? `Who thought ___ was a good idea?`
      : `This code uses ___`;

    // Create response with context
    const fileList = [...new Set(instances.map(i => i.file))].slice(0, 3);
    const totalCount = instances.reduce((sum, i) => sum + i.count, 0);

    const response = isAntiPattern
      ? `${patternName.toLowerCase()} (found ${totalCount}x in ${fileList.join(', ')})`
      : `${patternName} pattern`;

    // Get cringe score if available
    let cringeScore = null;
    if (this.cringeProofEngine && isAntiPattern) {
      try {
        cringeScore = await this.cringeProofEngine.scoreCode({
          pattern: patternName,
          instances: instances.length
        });
      } catch (err) {
        console.warn('[EngineeringCardGenerator] CringeProof unavailable:', err.message);
      }
    }

    return {
      prompt,
      response,
      rarity,
      metadata: {
        pattern: patternName,
        type: isAntiPattern ? 'anti-pattern' : 'good-pattern',
        instances: instances.length,
        files: fileList,
        cringeScore,
        generated: true,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Calculate rarity tier
   * @param {string} severity - Pattern severity
   * @param {number} frequency - How many times found
   * @param {boolean} isAntiPattern - Is anti-pattern?
   * @returns {string} - Rarity tier
   */
  calculateRarity(severity, frequency, isAntiPattern) {
    let score = 0;

    // Severity contribution
    if (severity === 'high') score += 40;
    else if (severity === 'medium') score += 20;
    else score += 10;

    // Frequency contribution (capped)
    score += Math.min(frequency * 5, 30);

    // Anti-patterns are rarer (teaching value)
    if (isAntiPattern) score += 20;

    // Find matching tier
    for (const [tier, range] of Object.entries(this.rarityTiers)) {
      if (score >= range.min && score <= range.max) {
        return tier;
      }
    }

    return 'common';
  }

  /**
   * Create a culture pack from generated cards
   * @param {Array} cards - Generated cards
   * @param {string} packId - Pack identifier
   * @param {object} options - Pack options
   * @returns {Promise<object>} - Culture pack
   */
  async createCulturePack(cards, packId, options = {}) {
    const {
      name = `${packId} Engineering Pack`,
      description = 'Generated from real codebase patterns',
      emoji = '🤖',
      controversial = true,
      teachingTool = true
    } = options;

    // Extract unique prompts and responses
    const prompts = [...new Set(cards.map(c => c.prompt))];
    const responses = cards.map(c => c.response);

    // Determine overall rarity (highest rarity found)
    const rarityOrder = ['common', 'rare', 'epic', 'legendary', 'mythic'];
    const maxRarity = cards.reduce((max, card) => {
      const cardRarityIndex = rarityOrder.indexOf(card.rarity);
      const maxRarityIndex = rarityOrder.indexOf(max);
      return cardRarityIndex > maxRarityIndex ? card.rarity : max;
    }, 'common');

    // Build pack
    const pack = {
      packId,
      name,
      description,
      emoji,
      controversial,
      teachingTool,
      rarity: maxRarity,
      tags: ['generated', 'codebase-analysis', 'teaching'],
      prompts,
      responses,
      metadata: {
        generated: true,
        cardCount: cards.length,
        timestamp: new Date().toISOString(),
        rarityDistribution: cards.reduce((acc, c) => {
          acc[c.rarity] = (acc[c.rarity] || 0) + 1;
          return acc;
        }, {})
      }
    };

    // Save to file
    const outputPath = path.join(this.outputDir, `${packId}.json`);
    await fs.writeFile(outputPath, JSON.stringify(pack, null, 2));

    console.log(`[EngineeringCardGenerator] Created pack: ${outputPath}`);
    console.log(`  - ${prompts.length} unique prompts`);
    console.log(`  - ${responses.length} responses`);
    console.log(`  - Rarity: ${maxRarity}`);
    console.log(`  - Teaching tool: ${teachingTool}`);

    return pack;
  }

  /**
   * Use AI to generate enhanced cards with Cal
   * @param {string} projectPath - Path to project
   * @param {object} options - Generation options
   * @returns {Promise<Array>} - AI-enhanced cards
   */
  async generateWithAI(projectPath, options = {}) {
    if (!this.anthropic) {
      throw new Error('Anthropic SDK required for AI generation');
    }

    console.log('[EngineeringCardGenerator] Scanning codebase with AI...');

    // First pass: detect patterns
    const cards = await this.generateFromCodebase(projectPath, options);

    // Second pass: enhance with AI
    const enhancedCards = [];

    for (const card of cards.slice(0, 10)) { // Limit to avoid rate limits
      try {
        const enhanced = await this.enhanceCardWithAI(card, projectPath);
        enhancedCards.push(enhanced);
      } catch (err) {
        console.warn(`[EngineeringCardGenerator] AI enhancement failed:`, err.message);
        enhancedCards.push(card); // Use original
      }
    }

    return enhancedCards;
  }

  /**
   * Enhance a card using AI (Cal)
   * @param {object} card - Card to enhance
   * @param {string} projectPath - Project path
   * @returns {Promise<object>} - Enhanced card
   */
  async enhanceCardWithAI(card, projectPath) {
    const prompt = `You are a senior developer reviewing code patterns.

Pattern found: ${card.metadata.pattern}
Type: ${card.metadata.type}
Files: ${card.metadata.files.join(', ')}
Instances: ${card.metadata.instances}

Generate a funny, educational prompt and response for a Cards Against Humanity-style game that teaches developers about this pattern.

Format:
Prompt: <fill-in-the-blank prompt>
Response: <witty response that teaches the concept>
Roast: <one-line roast explaining why this is good/bad>

Make it Gen Z friendly, use developer humor, and be educational.`;

    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const aiResponse = message.content[0].text;

    // Parse AI response
    const promptMatch = aiResponse.match(/Prompt:\s*(.+)/i);
    const responseMatch = aiResponse.match(/Response:\s*(.+)/i);
    const roastMatch = aiResponse.match(/Roast:\s*(.+)/i);

    return {
      ...card,
      prompt: promptMatch ? promptMatch[1].trim() : card.prompt,
      response: responseMatch ? responseMatch[1].trim() : card.response,
      metadata: {
        ...card.metadata,
        roast: roastMatch ? roastMatch[1].trim() : null,
        aiEnhanced: true
      }
    };
  }
}

module.exports = EngineeringCardGenerator;
