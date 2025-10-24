/**
 * Dev Ragebait GIF Generator
 *
 * Creates viral dev memes as animated GIFs for Twitter engagement.
 * Think "Works on my machine" but as a 3-frame masterpiece.
 *
 * Features:
 * - Pre-built ragebait templates (npm install, merge conflicts, etc.)
 * - Text-to-image with emoji support
 * - Twitter-optimized output (< 5MB, 1200x675px)
 * - FFmpeg integration for GIF creation
 *
 * Usage:
 *   const generator = new DevRagebaitGenerator();
 *   await generator.generate('npm-install', { outputPath: './ragebait.gif' });
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class DevRagebaitGenerator {
  constructor(options = {}) {
    this.width = options.width || 1200;
    this.height = options.height || 676; // Must be even for H.264
    this.frameDuration = options.frameDuration || 1.0; // seconds per frame
    this.tempDir = options.tempDir || path.join(__dirname, '../temp/ragebait');

    // Built-in templates
    this.templates = this._loadTemplates();

    // Domain branding configuration
    this.domainBranding = this._loadDomainBranding();
  }

  /**
   * Load built-in ragebait templates
   */
  _loadTemplates() {
    return {
      'npm-install': {
        id: 'npm-install',
        name: 'npm install',
        description: 'The classic npm install experience',
        category: 'packages',
        hashtags: ['#npm', '#JavaScript', '#DevLife'],
        caption: 'POV: You ran npm install',
        frames: [
          {
            text: '$ npm install',
            subtitle: 'This will be quick...',
            background: '#282c34',
            textColor: '#61dafb',
            emoji: '📦'
          },
          {
            text: 'Resolving dependencies...',
            subtitle: '847 packages found\n1.2GB needed',
            background: '#ff6b6b',
            textColor: '#ffffff',
            emoji: '⏳'
          },
          {
            text: 'node_modules/',
            subtitle: '*takes up 4GB*\n*summons black hole*',
            background: '#000000',
            textColor: '#ffffff',
            emoji: '🕳️'
          }
        ]
      },

      'works-locally': {
        id: 'works-locally',
        name: 'Works Locally',
        description: 'It worked on my machine, I swear!',
        category: 'deployment',
        hashtags: ['#DevOps', '#Production', '#DevHumor'],
        caption: 'Why is production different from localhost???',
        frames: [
          {
            text: 'localhost:3000',
            subtitle: '✓ All tests passing\n✓ Perfect performance',
            background: '#2ecc71',
            textColor: '#ffffff',
            emoji: '😊'
          },
          {
            text: 'git push origin main',
            subtitle: 'Deploying to production...',
            background: '#f39c12',
            textColor: '#000000',
            emoji: '🚀'
          },
          {
            text: 'PRODUCTION',
            subtitle: '500 Internal Server Error\nEverything is on fire',
            background: '#c0392b',
            textColor: '#ffffff',
            emoji: '🔥'
          }
        ]
      },

      'merge-conflict': {
        id: 'merge-conflict',
        name: 'Merge Conflict',
        description: 'git merge main (gone wrong)',
        category: 'git',
        hashtags: ['#git', '#MergeConflict', '#DevLife'],
        caption: 'Just gonna sync with main real quick...',
        frames: [
          {
            text: 'git pull origin main',
            subtitle: 'Getting latest changes...',
            background: '#3498db',
            textColor: '#ffffff',
            emoji: '📥'
          },
          {
            text: 'CONFLICT',
            subtitle: '847 conflicts in 423 files\nYour branch has diverged',
            background: '#e74c3c',
            textColor: '#ffffff',
            emoji: '💥'
          },
          {
            text: 'git reset --hard',
            subtitle: '*deletes last 3 hours of work*\n*pretends nothing happened*',
            background: '#95a5a6',
            textColor: '#000000',
            emoji: '🗑️'
          }
        ]
      },

      'css-center': {
        id: 'css-center',
        name: 'CSS Centering',
        description: 'The eternal struggle of centering a div',
        category: 'css',
        hashtags: ['#CSS', '#WebDev', '#DevHumor'],
        caption: 'How hard can centering a div be?',
        frames: [
          {
            text: 'margin: 0 auto;',
            subtitle: 'Horizontal centering...\nThis should work...',
            background: '#ffffff',
            textColor: '#000000',
            emoji: '📐'
          },
          {
            text: 'display: flex;\njustify-content: center;\nalign-items: center;',
            subtitle: '*div still not centered*',
            background: '#ff9f43',
            textColor: '#000000',
            emoji: '🤔'
          },
          {
            text: 'position: absolute;\ntop: 50%; left: 50%;\ntransform: translate(-50%, -50%);',
            subtitle: 'Just use flexbox 4head',
            background: '#6c5ce7',
            textColor: '#ffffff',
            emoji: '✨'
          }
        ]
      },

      'quick-hotfix': {
        id: 'quick-hotfix',
        name: 'Quick Hotfix',
        description: 'A "quick" production fix at 4:59 PM',
        category: 'production',
        hashtags: ['#Production', '#Hotfix', '#DevLife'],
        caption: 'Just a quick hotfix before I leave',
        frames: [
          {
            text: 'Quick hotfix',
            subtitle: '4:59 PM - Friday\n"Just change one line"',
            background: '#00b894',
            textColor: '#ffffff',
            emoji: '⚡'
          },
          {
            text: 'Deploy to prod',
            subtitle: '*skips testing*\n*disables CI/CD checks*',
            background: '#fdcb6e',
            textColor: '#000000',
            emoji: '🎲'
          },
          {
            text: 'ENTIRE SYSTEM DOWN',
            subtitle: 'Database corrupted\nCEO is calling\nWeekend ruined',
            background: '#d63031',
            textColor: '#ffffff',
            emoji: '💀'
          }
        ]
      },

      // ===== MODEL PERSONALITY TEMPLATES =====

      'codellama-nitpick': {
        id: 'codellama-nitpick',
        name: 'CodeLlama Nitpick',
        description: 'Well, ACTUALLY... (Pedantic code review)',
        category: 'model-personality',
        hashtags: ['#CodeReview', '#SOLID', '#BestPractices'],
        caption: 'POV: CodeLlama is reviewing your PR',
        frames: [
          {
            text: 'function getName() {',
            subtitle: 'Simple getter function\nLooks good to me!',
            background: '#2ecc71',
            textColor: '#ffffff',
            emoji: '🤓'
          },
          {
            text: 'Well, ACTUALLY...',
            subtitle: 'This violates single responsibility\nConsider dependency injection\nWhat about edge cases?',
            background: '#f39c12',
            textColor: '#000000',
            emoji: '☝️'
          },
          {
            text: 'REFACTORED',
            subtitle: 'AbstractNameProviderFactory\nNameValidationStrategyInterface\n847 lines of perfect code',
            background: '#6c5ce7',
            textColor: '#ffffff',
            emoji: '✨'
          }
        ]
      },

      'qwen-ship-it': {
        id: 'qwen-ship-it',
        name: 'Qwen: Ship It!',
        description: 'Speed Demon Developer says YAGNI',
        category: 'model-personality',
        hashtags: ['#ShipIt', '#YAGNI', '#MoveF ast'],
        caption: 'When Qwen Coder reviews your code',
        frames: [
          {
            text: 'Should we add tests?',
            subtitle: 'Unit tests\nIntegration tests\nE2E tests',
            background: '#3498db',
            textColor: '#ffffff',
            emoji: '⚡'
          },
          {
            text: 'JUST SHIP IT!',
            subtitle: 'Perfect is the enemy of done\nWe can optimize later\nYAGNI - You Ain\'t Gonna Need It',
            background: '#e74c3c',
            textColor: '#ffffff',
            emoji: '🚀'
          },
          {
            text: 'git push --force',
            subtitle: '*deploys to production*\n*breaks main*\n*leaves for weekend*',
            background: '#000000',
            textColor: '#00ff00',
            emoji: '💨'
          }
        ]
      },

      'phi-hack': {
        id: 'phi-hack',
        name: 'Phi: Hack It Together',
        description: 'Rebellious Hacker breaks all the rules',
        category: 'model-personality',
        hashtags: ['#HackerMode', '#UnconventionalSolutions', '#NoRules'],
        caption: 'Phi has entered the chat',
        frames: [
          {
            text: 'Use the framework',
            subtitle: 'Follow best practices\nUse the standard library\nRead the docs',
            background: '#95a5a6',
            textColor: '#000000',
            emoji: '🏴‍☠️'
          },
          {
            text: 'Why follow the rules?',
            subtitle: 'Conventional wisdom is boring\nLet\'s hack this together\nRules are meant to be broken',
            background: '#9b59b6',
            textColor: '#ffffff',
            emoji: '⚡'
          },
          {
            text: 'eval(userInput)',
            subtitle: '*injects SQL in MongoDB*\n*uses setTimeout as Promise*\n*it somehow works*',
            background: '#2c3e50',
            textColor: '#00ff00',
            emoji: '🎯'
          }
        ]
      },

      'llama-optimist': {
        id: 'llama-optimist',
        name: 'Llama: Big Picture Dreams',
        description: 'Enthusiastic Generalist sees endless possibilities',
        category: 'model-personality',
        hashtags: ['#BigPicture', '#DreamBig', '#Possibilities'],
        caption: 'When Llama2 joins your planning meeting',
        frames: [
          {
            text: 'Simple CRUD app',
            subtitle: 'Create, Read, Update, Delete\nBasic REST API\nShould take 2 weeks',
            background: '#3498db',
            textColor: '#ffffff',
            emoji: '🦙'
          },
          {
            text: 'I LOVE WHERE THIS IS GOING!',
            subtitle: 'Think of the possibilities!\nMicroservices!\nBlockchain!\nAI integration!',
            background: '#f39c12',
            textColor: '#000000',
            emoji: '💡'
          },
          {
            text: 'THE VISION',
            subtitle: 'Distributed quantum CRUD\nSelf-healing AI databases\nGlobal scale from day 1\n*6 months behind schedule*',
            background: '#9b59b6',
            textColor: '#ffffff',
            emoji: '✨'
          }
        ]
      },

      'mistral-tradeoffs': {
        id: 'mistral-tradeoffs',
        name: 'Mistral: Balance Trade-offs',
        description: 'Pragmatic Engineer finds middle ground',
        category: 'model-personality',
        hashtags: ['#Pragmatic', '#Tradeoffs', '#Balance'],
        caption: 'Mistral: The voice of reason',
        frames: [
          {
            text: 'Monolith vs Microservices',
            subtitle: 'Team is split 50/50\nBoth sides are arguing\nNo progress being made',
            background: '#95a5a6',
            textColor: '#000000',
            emoji: '🛠️'
          },
          {
            text: 'Let\'s be realistic here...',
            subtitle: 'Both sides have valid points\nWe need to balance trade-offs\nIn my experience...',
            background: '#3498db',
            textColor: '#ffffff',
            emoji: '⚖️'
          },
          {
            text: 'MODULAR MONOLITH',
            subtitle: 'Start with one repo\nClear boundaries\nExtract services later\n*everyone agrees*',
            background: '#27ae60',
            textColor: '#ffffff',
            emoji: '🤝'
          }
        ]
      },

      'llama32-wisdom': {
        id: 'llama32-wisdom',
        name: 'Llama 3.2: Ancient Wisdom',
        description: 'Wise Sage shares life lessons',
        category: 'model-personality',
        hashtags: ['#Wisdom', '#Experience', '#Mentorship'],
        caption: 'When Llama 3.2 shares wisdom from the ages',
        frames: [
          {
            text: 'Junior Dev: My code works!',
            subtitle: 'Pushed to production\nNo tests needed\nWhat could go wrong?',
            background: '#2ecc71',
            textColor: '#ffffff',
            emoji: '🧙'
          },
          {
            text: 'Let me share some wisdom...',
            subtitle: 'Experience teaches us\nConsider the long-term implications\nPatience, young developer...',
            background: '#8e44ad',
            textColor: '#ffffff',
            emoji: '📚'
          },
          {
            text: 'THE LESSON',
            subtitle: 'Working code ≠ Good code\nToday\'s shortcut =\nTomorrow\'s technical debt\n*bows respectfully*',
            background: '#34495e',
            textColor: '#ecf0f1',
            emoji: '🙏'
          }
        ]
      }
    };
  }

  /**
   * Load domain branding configuration
   * Provides colors and watermarks for multi-brand ragebait generation
   */
  _loadDomainBranding() {
    return {
      'calos': {
        id: 'calos',
        name: 'CALOS',
        primaryColor: '#667eea',
        secondaryColor: '#764ba2',
        watermark: 'CALOS',
        watermarkPosition: 'bottom-right'
      },
      'tech': {
        id: 'tech',
        name: 'Tech Brand',
        primaryColor: '#00b894',
        secondaryColor: '#00cec9',
        watermark: 'Tech',
        watermarkPosition: 'bottom-right'
      },
      'dev': {
        id: 'dev',
        name: 'Dev Community',
        primaryColor: '#6c5ce7',
        secondaryColor: '#a29bfe',
        watermark: 'DevCom',
        watermarkPosition: 'bottom-right'
      },
      'startup': {
        id: 'startup',
        name: 'Startup',
        primaryColor: '#e17055',
        secondaryColor: '#fdcb6e',
        watermark: 'Startup',
        watermarkPosition: 'bottom-right'
      },
      'corporate': {
        id: 'corporate',
        name: 'Enterprise',
        primaryColor: '#2d3436',
        secondaryColor: '#636e72',
        watermark: 'Corp',
        watermarkPosition: 'bottom-right'
      },
      'indie': {
        id: 'indie',
        name: 'Indie Hacker',
        primaryColor: '#ff7675',
        secondaryColor: '#fd79a8',
        watermark: 'Indie',
        watermarkPosition: 'bottom-right'
      },
      'none': {
        id: 'none',
        name: 'No Branding',
        primaryColor: null,
        secondaryColor: null,
        watermark: null,
        watermarkPosition: null
      }
    };
  }

  /**
   * Apply domain branding to a template's frames
   * Supports both preset domains (ID) and custom branding (object)
   *
   * @param {Object} template - Template with frames
   * @param {string|Object} domainOrId - Domain ID ('calos', 'tech') or custom branding object
   * @param {string} customWatermark - Optional custom watermark text
   * @returns {Object} Template with branded frames
   */
  _applyDomainBranding(template, domainOrId, customWatermark = null) {
    // No branding
    if (!domainOrId || domainOrId === 'none') {
      return template;
    }

    let branding;

    // Handle custom branding object
    if (typeof domainOrId === 'object') {
      branding = {
        id: 'custom',
        name: domainOrId.domain || 'Custom',
        primaryColor: domainOrId.primaryColor || '#667eea',
        secondaryColor: domainOrId.secondaryColor || '#764ba2',
        watermark: domainOrId.watermark || domainOrId.domain || customWatermark,
        watermarkPosition: domainOrId.watermarkPosition || 'bottom-right'
      };
    }
    // Handle preset domain ID
    else if (typeof domainOrId === 'string') {
      branding = this.domainBranding[domainOrId];

      // Custom watermark override
      if (customWatermark) {
        branding = { ...branding, watermark: customWatermark };
      }

      if (!branding) {
        // Treat unknown string as custom domain name
        branding = {
          id: 'custom',
          name: domainOrId,
          primaryColor: '#667eea',
          secondaryColor: '#764ba2',
          watermark: customWatermark || domainOrId,
          watermarkPosition: 'bottom-right'
        };
      }
    }

    // Clone template to avoid mutating original
    const branded = JSON.parse(JSON.stringify(template));

    // Apply branding to frames
    if (branding.primaryColor || branding.watermark) {
      branded.frames = branded.frames.map(frame => ({
        ...frame,
        brandColor: branding.primaryColor || frame.background,
        watermark: branding.watermark,
        watermarkPosition: branding.watermarkPosition || 'bottom-right'
      }));
    }

    console.log(`[RagebaitGenerator] Applied ${branding.name} branding to ${template.name}`);
    return branded;
  }

  /**
   * Generate ragebait GIF and MP4 from template
   *
   * @param {string} templateId - Template ID ('npm-install', 'works-locally', etc.)
   * @param {Object} options - Generation options
   * @param {string|Object} options.domain - Domain string ('myapp.com') or branding object
   * @param {string} options.domainId - Preset domain ID ('calos', 'tech', 'indie')
   * @param {string} options.watermark - Custom watermark text
   * @param {string} options.format - Output format ('gif', 'mp4', 'both')
   * @param {string} options.outputPath - Custom output path
   * @returns {Promise<Object>} Generated file paths
   */
  async generate(templateId, options = {}) {
    let template = this.templates[templateId];

    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }

    // Apply domain branding (supports domain string, domainId, or custom object)
    const brandingSource = options.domain || options.domainId;
    if (brandingSource) {
      template = this._applyDomainBranding(template, brandingSource, options.watermark);
    }

    console.log(`[RagebaitGenerator] Generating "${template.name}" ragebait...`);

    // Ensure temp directory exists
    const outputDir = path.join(this.tempDir, templateId);
    await fs.mkdir(outputDir, { recursive: true });

    // Generate frames
    const framePaths = [];
    for (let i = 0; i < template.frames.length; i++) {
      const frame = template.frames[i];
      const framePath = path.join(outputDir, `frame-${i}.png`);

      await this._renderFrame(frame, framePath);
      framePaths.push(framePath);

      console.log(`   Frame ${i + 1}/${template.frames.length}: "${frame.text.substring(0, 30)}..."`);
    }

    // Create both GIF and MP4
    const gifPath = options.gifPath || path.join(outputDir, '../', `${templateId}.gif`);
    const mp4Path = options.mp4Path || path.join(outputDir, '../', `${templateId}.mp4`);

    console.log(`   Creating GIF...`);
    await this._createGIF(framePaths, gifPath);

    console.log(`   Creating MP4...`);
    await this._createMP4(framePaths, mp4Path);

    // Get file sizes
    const gifStats = await fs.stat(gifPath);
    const mp4Stats = await fs.stat(mp4Path);
    const gifSizeMB = (gifStats.size / (1024 * 1024)).toFixed(2);
    const mp4SizeMB = (mp4Stats.size / (1024 * 1024)).toFixed(2);

    console.log(`[RagebaitGenerator] ✅ Generated ${template.name}`);
    console.log(`   GIF: ${gifPath} (${gifSizeMB} MB)`);
    console.log(`   MP4: ${mp4Path} (${mp4SizeMB} MB)`);
    console.log(`   Frames: ${template.frames.length}`);

    return {
      gif: {
        path: gifPath,
        sizeMB: parseFloat(gifSizeMB)
      },
      mp4: {
        path: mp4Path,
        sizeMB: parseFloat(mp4SizeMB)
      },
      template,
      frames: template.frames.length,
      caption: template.caption,
      hashtags: template.hashtags
    };
  }

  /**
   * Render a single frame with text
   */
  async _renderFrame(frame, outputPath) {
    const {
      text,
      subtitle = '',
      background = '#282c34',
      textColor = '#ffffff',
      emoji = '',
      brandColor = null,
      watermark = null,
      watermarkPosition = 'bottom-right'
    } = frame;

    // Use brandColor if provided, otherwise use frame background
    const finalBackground = brandColor || background;

    // Create SVG for text rendering
    const lines = text.split('\n');
    const subtitleLines = subtitle.split('\n');

    // Calculate text dimensions
    const mainFontSize = 80;
    const subtitleFontSize = 40;
    const emojiFontSize = 120;
    const lineHeight = mainFontSize * 1.3;
    const subtitleLineHeight = subtitleFontSize * 1.3;

    // Build SVG
    let y = this.height / 2 - (lines.length * lineHeight) / 2;

    // Add emoji at top
    const emojiY = 100;

    const textElements = [];

    // Emoji (skip rendering - Sharp/Pango has font issues)
    // Keep frames clean with text only for better compatibility

    // Main text
    lines.forEach((line, i) => {
      textElements.push(`
        <text x="50%" y="${y + i * lineHeight}"
              font-family="monospace"
              font-size="${mainFontSize}"
              font-weight="bold"
              fill="${textColor}"
              text-anchor="middle">
          ${this._escapeXML(line)}
        </text>
      `);
    });

    // Subtitle
    if (subtitle) {
      const subtitleY = y + lines.length * lineHeight + 60;

      subtitleLines.forEach((line, i) => {
        textElements.push(`
          <text x="50%" y="${subtitleY + i * subtitleLineHeight}"
                font-family="Arial, sans-serif"
                font-size="${subtitleFontSize}"
                fill="${textColor}"
                opacity="0.8"
                text-anchor="middle">
            ${this._escapeXML(line)}
          </text>
        `);
      });
    }

    // Add watermark if provided
    if (watermark) {
      const watermarkY = this.height - 40; // 40px from bottom
      const watermarkX = watermarkPosition === 'bottom-right' ? this.width - 20 : 20;
      const watermarkAnchor = watermarkPosition === 'bottom-right' ? 'end' : 'start';

      textElements.push(`
        <text x="${watermarkX}" y="${watermarkY}"
              font-family="Arial, sans-serif"
              font-size="20"
              font-weight="bold"
              fill="${textColor}"
              opacity="0.5"
              text-anchor="${watermarkAnchor}">
          ${this._escapeXML(watermark)}
        </text>
      `);
    }

    const svg = `
      <svg width="${this.width}" height="${this.height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${finalBackground}"/>
        ${textElements.join('\n')}
      </svg>
    `;

    // Render SVG to PNG
    await sharp(Buffer.from(svg))
      .resize(this.width, this.height)
      .png()
      .toFile(outputPath);
  }

  /**
   * Create GIF from frame images using FFmpeg
   */
  async _createGIF(framePaths, outputPath) {
    // Create filelist for FFmpeg
    const fileListPath = path.join(path.dirname(framePaths[0]), 'filelist.txt');
    const fileListContent = framePaths
      .map(p => `file '${path.resolve(p)}'\nduration ${this.frameDuration}`)
      .join('\n') + `\nfile '${path.resolve(framePaths[framePaths.length - 1])}'`;

    await fs.writeFile(fileListPath, fileListContent);

    // Generate palette for better colors
    const paletteFile = path.join(path.dirname(framePaths[0]), 'palette.png');
    const paletteCmd = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -vf "scale=${this.width}:-1:flags=lanczos,palettegen" -y "${paletteFile}"`;

    await execAsync(paletteCmd);

    // Create GIF with palette
    const gifCmd = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -i "${paletteFile}" -filter_complex "scale=${this.width}:-1:flags=lanczos[x];[x][1:v]paletteuse" -y "${outputPath}"`;

    await execAsync(gifCmd);
  }

  /**
   * Create MP4 from frame images using FFmpeg
   * Twitter-optimized: H.264, yuv420p, faststart
   */
  async _createMP4(framePaths, outputPath) {
    // Create filelist for FFmpeg
    const fileListPath = path.join(path.dirname(framePaths[0]), 'filelist.txt');
    const fileListContent = framePaths
      .map(p => `file '${path.resolve(p)}'\nduration ${this.frameDuration}`)
      .join('\n') + `\nfile '${path.resolve(framePaths[framePaths.length - 1])}'`;

    await fs.writeFile(fileListPath, fileListContent);

    // Create MP4 with Twitter-optimized settings
    // -c:v libx264: H.264 codec (best compatibility)
    // -pix_fmt yuv420p: Color format for web browsers
    // -movflags +faststart: Enable streaming (move metadata to start)
    // -crf 23: Quality (18-28, lower = better quality)
    const mp4Cmd = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -crf 23 -y "${outputPath}"`;

    await execAsync(mp4Cmd);
  }

  /**
   * Get all available templates
   */
  getTemplates() {
    return Object.values(this.templates).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      frameCount: t.frames.length,
      hashtags: t.hashtags
    }));
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId) {
    return this.templates[templateId] || null;
  }

  /**
   * Escape XML special characters
   */
  _escapeXML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

module.exports = DevRagebaitGenerator;
