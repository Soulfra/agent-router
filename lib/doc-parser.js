#!/usr/bin/env node
/**
 * Documentation Parser
 *
 * Parses markdown documentation files into structured step-by-step instructions
 * that can be used for:
 * - Automated screenshot capture
 * - Auto-annotation generation
 * - OAuth app creation automation
 * - Tutorial GIF generation
 *
 * Usage:
 *   const parser = new DocParser();
 *   const steps = await parser.parseOAuthGuide('github');
 */

const fs = require('fs').promises;
const path = require('path');

class DocParser {
  constructor(options = {}) {
    this.docsDir = options.docsDir || path.join(__dirname, '..', 'docs');
  }

  /**
   * Parse OAuth setup guide for a specific provider
   * Returns structured steps with actions, selectors, and expected results
   */
  async parseOAuthGuide(provider) {
    const guidePath = path.join(this.docsDir, 'OAUTH-SETUP-GUIDE.md');
    const content = await fs.readFile(guidePath, 'utf-8');

    // Extract section for this provider
    const providerSection = this.extractProviderSection(content, provider);

    if (!providerSection) {
      throw new Error(`No documentation found for provider: ${provider}`);
    }

    // Parse steps from the section
    const steps = this.parseSteps(providerSection, provider);

    console.log(`[DocParser] Parsed ${steps.length} steps for ${provider}`);
    return steps;
  }

  /**
   * Extract the section for a specific OAuth provider
   */
  extractProviderSection(content, provider) {
    const providerNames = {
      github: 'GitHub OAuth Setup',
      google: 'Google OAuth Setup',
      microsoft: 'Microsoft OAuth Setup',
      icloud: 'iCloud OAuth Setup'
    };

    const sectionTitle = providerNames[provider.toLowerCase()];
    if (!sectionTitle) return null;

    // Find section start and end
    const sectionRegex = new RegExp(`## ${sectionTitle}([\\s\\S]*?)(?=\\n## |$)`, 'i');
    const match = content.match(sectionRegex);

    return match ? match[1] : null;
  }

  /**
   * Parse steps from a documentation section
   */
  parseSteps(sectionContent, provider) {
    const steps = [];

    // Match all numbered steps (### 1. Step Title)
    const stepRegex = /### (\d+)\.\s+(.+?)(?=\n### \d+\.|$)/gs;
    const matches = [...sectionContent.matchAll(stepRegex)];

    for (const match of matches) {
      const stepNumber = parseInt(match[1]);
      const stepTitle = match[2].trim();
      const stepContent = match[0];

      const step = {
        number: stepNumber,
        title: stepTitle,
        provider: provider,
        actions: this.extractActions(stepContent),
        url: this.extractURL(stepContent),
        selectors: this.extractSelectors(stepContent),
        values: this.extractValues(stepContent),
        screenshot: `${provider}-step-${stepNumber}.png`
      };

      steps.push(step);
    }

    return steps;
  }

  /**
   * Extract action verbs from step content
   * (Click, Go to, Select, Fill in, Copy, etc.)
   */
  extractActions(content) {
    const actions = [];
    const lines = content.split('\n');

    const actionPatterns = [
      /^-\s+(Click|Select|Go to|Navigate to|Open|Fill in|Enter|Copy|Add|Create|Generate)\s+"?([^"]+)"?/i,
      /^\*\*(.+?)\*\*:?\s*(.+)/,
      /^>\s+(.+)/
    ];

    for (const line of lines) {
      for (const pattern of actionPatterns) {
        const match = line.match(pattern);
        if (match) {
          actions.push({
            type: match[1] ? match[1].toLowerCase() : 'instruction',
            target: match[2] ? match[2].trim() : match[1].trim(),
            raw: line.trim()
          });
          break;
        }
      }
    }

    return actions;
  }

  /**
   * Extract URL from step content
   */
  extractURL(content) {
    const urlMatch = content.match(/https?:\/\/[^\s\n]+/);
    return urlMatch ? urlMatch[0] : null;
  }

  /**
   * Extract CSS/DOM selectors from step content
   * Looks for quoted button/link text that can be used as selectors
   */
  extractSelectors(content) {
    const selectors = [];

    // Find quoted text that represents buttons/links
    const quotedText = content.match(/"([^"]+)"/g);
    if (quotedText) {
      for (const text of quotedText) {
        const cleaned = text.replace(/"/g, '');
        selectors.push({
          type: 'text',
          value: cleaned,
          selector: `button:contains("${cleaned}"), a:contains("${cleaned}"), *[aria-label*="${cleaned}"]`
        });
      }
    }

    // Find code-formatted selectors
    const codeBlocks = content.match(/`([^`]+)`/g);
    if (codeBlocks) {
      for (const code of codeBlocks) {
        const cleaned = code.replace(/`/g, '');
        // Check if it looks like a URL or selector
        if (cleaned.includes('.') || cleaned.includes('#') || cleaned.includes('[')) {
          selectors.push({
            type: 'css',
            value: cleaned,
            selector: cleaned
          });
        }
      }
    }

    return selectors;
  }

  /**
   * Extract form values and configuration from step content
   */
  extractValues(content) {
    const values = {};

    // Extract field names and example values
    const fieldPatterns = [
      /^-\s+(.+?):\s+`(.+?)`/gm,  // - Field: `value`
      /^\*\*(.+?)\*\*:\s*`?(.+?)`?$/gm,  // **Field**: value
      /^(.+?):\s+`(.+?)`/gm  // Field: `value`
    ];

    for (const pattern of fieldPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const fieldName = match[1].trim();
        const fieldValue = match[2].trim();

        // Skip if it looks like a heading or URL
        if (!fieldName.includes('#') && !fieldValue.startsWith('http')) {
          values[fieldName] = fieldValue;
        }
      }
    }

    return values;
  }

  /**
   * Generate annotation instructions from parsed steps
   * Returns annotation objects ready for database insertion
   */
  generateAnnotations(steps, snapshotId) {
    const annotations = [];

    for (const step of steps) {
      const mainAction = step.actions[0];
      if (!mainAction) continue;

      // Determine annotation type based on action
      let annotationType = 'arrow'; // Default
      let color = '#00ff00';

      if (mainAction.type === 'fill in' || mainAction.type === 'enter') {
        annotationType = 'box';
        color = '#0099ff';
      } else if (mainAction.type === 'copy') {
        annotationType = 'box';
        color = '#ff0099';
      }

      // Create annotation object
      const annotation = {
        snapshot_id: snapshotId,
        step_number: step.number,
        step_title: step.title,
        step_description: mainAction.raw,
        selector: step.selectors[0]?.selector || 'body',
        annotation_type: annotationType,
        position: { x: 100, y: 100 + (step.number * 80), width: 200, height: 50 },
        color: color,
        text_content: step.title
      };

      annotations.push(annotation);
    }

    return annotations;
  }

  /**
   * Parse all providers and return complete guide structure
   */
  async parseAllProviders() {
    const providers = ['github', 'google', 'microsoft'];
    const allSteps = {};

    for (const provider of providers) {
      try {
        allSteps[provider] = await this.parseOAuthGuide(provider);
      } catch (error) {
        console.error(`[DocParser] Failed to parse ${provider}: ${error.message}`);
      }
    }

    return allSteps;
  }
}

// CLI interface
if (require.main === module) {
  const provider = process.argv[2] || 'all';

  const parser = new DocParser();

  if (provider === 'all') {
    parser.parseAllProviders()
      .then(allSteps => {
        console.log('\n📚 Parsed OAuth Setup Guide:\n');
        for (const [prov, steps] of Object.entries(allSteps)) {
          console.log(`${prov.toUpperCase()}:`);
          steps.forEach(step => {
            console.log(`  ${step.number}. ${step.title}`);
            console.log(`     Actions: ${step.actions.length}`);
            console.log(`     URL: ${step.url || 'N/A'}`);
          });
          console.log('');
        }
      })
      .catch(error => {
        console.error('❌ Parse failed:', error.message);
        process.exit(1);
      });
  } else {
    parser.parseOAuthGuide(provider)
      .then(steps => {
        console.log(`\n📚 ${provider.toUpperCase()} OAuth Setup Steps:\n`);
        steps.forEach(step => {
          console.log(`${step.number}. ${step.title}`);
          console.log(`   URL: ${step.url || 'N/A'}`);
          console.log(`   Actions: ${step.actions.map(a => a.raw).join('; ')}`);
          console.log('');
        });
      })
      .catch(error => {
        console.error('❌ Parse failed:', error.message);
        process.exit(1);
      });
  }
}

module.exports = DocParser;
