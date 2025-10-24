/**
 * Brand Presentation Generator
 *
 * Creates professional brand presentations, pitch decks, and domain visualizations
 * Similar to dev-ragebait-generator but for serious business presentations
 *
 * Features:
 * - Multi-brand support (CALOS, Soulfra, DeathToData, RoughSparks)
 * - Domain model integration (uses your 5 specialized models)
 * - Template-based slide generation
 * - Export to PDF, GIF, MP4, Markdown
 * - QR code generation for mobile sharing
 * - Auto-content generation using domain models
 *
 * Usage:
 *   const generator = new BrandPresentationGenerator();
 *   await generator.generate('pitchDeck', 'calos', {
 *     outputPath: './pitch.pdf',
 *     template: 'investor-deck'
 *   });
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const MultiLLMRouter = require('./multi-llm-router');

class BrandPresentationGenerator {
  constructor(options = {}) {
    // Slide dimensions (16:9 aspect ratio)
    this.width = options.width || 1920;
    this.height = options.height || 1080;
    this.frameDuration = options.frameDuration || 3.0; // seconds per slide
    this.tempDir = options.tempDir || path.join(__dirname, '../temp/presentations');

    // Brand configurations
    this.brands = this._loadBrands();

    // Domain model configuration
    this.domainModels = this._loadDomainModels();

    // Presentation templates
    this.templates = this._loadTemplates();

    // Multi-LLM Router (for content generation)
    // Use provided router or create new one
    this.llmRouter = options.llmRouter || new MultiLLMRouter({
      strategy: 'smart',
      ollamaEnabled: true
    });
  }

  /**
   * Load brand configurations
   */
  _loadBrands() {
    return {
      calos: {
        name: 'CALOS',
        tagline: 'Operating System for AI Agents',
        domain: 'calos.ai',
        colors: {
          primary: '#667eea',
          secondary: '#764ba2',
          accent: '#61dafb',
          background: '#1a1a2e',
          text: '#ffffff'
        },
        logo: '🌐', // Emoji logo (can be replaced with actual logo path)
        personality: 'Technical, innovative, developer-focused',
        keywords: ['AI', 'Agents', 'Automation', 'Platform', 'Kernel'],
        description: 'CALOS is an operating system designed for AI agents, featuring skill progression, action/effect systems, and seamless integration.'
      },
      soulfra: {
        name: 'Soulfra',
        tagline: 'Universal Identity Without KYC',
        domain: 'soulfra.com',
        colors: {
          primary: '#3498db',
          secondary: '#2ecc71',
          accent: '#e74c3c',
          background: '#2c3e50',
          text: '#ffffff'
        },
        logo: '🔐',
        personality: 'Security-focused, trustworthy, privacy-first',
        keywords: ['Identity', 'SSO', 'Ed25519', 'Zero-Knowledge', 'Authentication'],
        description: 'Soulfra provides universal single sign-on without centralized KYC, using Ed25519 cryptography and zero-knowledge proofs.'
      },
      deathtodata: {
        name: 'DeathToData',
        tagline: 'Search Engine Philosophy',
        domain: 'deathtodata.com',
        colors: {
          primary: '#e74c3c',
          secondary: '#c0392b',
          accent: '#f39c12',
          background: '#000000',
          text: '#ffffff'
        },
        logo: '💀',
        personality: 'Philosophical, data-driven, rebellious',
        keywords: ['Search', 'SEO', 'Data', 'Philosophy', 'Discovery'],
        description: 'DeathToData reimagines search engines with programmatic SEO and philosophical approaches to information discovery.'
      },
      roughsparks: {
        name: 'RoughSparks',
        tagline: 'Creative Sparks for Builders',
        domain: 'roughsparks.com',
        colors: {
          primary: '#ff6b6b',
          secondary: '#f39c12',
          accent: '#9b59b6',
          background: '#2d3436',
          text: '#ffffff'
        },
        logo: '✨',
        personality: 'Creative, spontaneous, inspiring',
        keywords: ['Creativity', 'Ideas', 'Inspiration', 'Innovation', 'Design'],
        description: 'RoughSparks provides creative sparks and idea generation tools for builders, makers, and entrepreneurs.'
      }
    };
  }

  /**
   * Load domain model configuration
   */
  _loadDomainModels() {
    return {
      cryptography: {
        model: 'soulfra-model',
        name: 'Cryptography',
        icon: '🔐',
        description: 'Ed25519, zero-knowledge proofs, identity verification',
        color: '#3498db',
        useCases: [
          'Digital signatures',
          'Identity verification',
          'Zero-knowledge proofs',
          'Secure authentication'
        ]
      },
      data: {
        model: 'deathtodata-model',
        name: 'Data Processing',
        icon: '📊',
        description: 'CSV/JSON parsing, ETL, validation, transformation',
        color: '#e74c3c',
        useCases: [
          'Data transformation',
          'ETL pipelines',
          'Schema validation',
          'API integrations'
        ]
      },
      publishing: {
        model: 'publishing-model',
        name: 'Publishing',
        icon: '📝',
        description: 'Technical documentation, API docs, tutorials',
        color: '#2ecc71',
        useCases: [
          'API documentation',
          'README files',
          'Tutorials',
          'Technical guides'
        ]
      },
      calos: {
        model: 'calos-model',
        name: 'CALOS Platform',
        icon: '🌐',
        description: 'Skills, XP, actions, effects, gamification',
        color: '#667eea',
        useCases: [
          'Skill progression',
          'Action/effect systems',
          'Gamification',
          'Platform integration'
        ]
      },
      whimsical: {
        model: 'drseuss-model',
        name: 'Creative Writing',
        icon: '🎨',
        description: 'Whimsical explanations, storytelling, metaphors',
        color: '#9b59b6',
        useCases: [
          'Engaging content',
          'Creative explanations',
          'Storytelling',
          'Marketing copy'
        ]
      }
    };
  }

  /**
   * Load presentation templates
   */
  _loadTemplates() {
    return {
      pitchDeck: {
        id: 'pitchDeck',
        name: 'Investor Pitch Deck',
        description: 'Classic pitch deck structure for investors',
        slides: [
          { type: 'cover', title: 'Cover Slide', subtitle: 'Brand name + tagline' },
          { type: 'problem', title: 'The Problem', subtitle: 'What pain point do you solve?' },
          { type: 'solution', title: 'Our Solution', subtitle: 'How do you solve it?' },
          { type: 'market', title: 'Market Opportunity', subtitle: 'TAM, SAM, SOM' },
          { type: 'product', title: 'Product Demo', subtitle: 'Show your product' },
          { type: 'traction', title: 'Traction', subtitle: 'Metrics and growth' },
          { type: 'business-model', title: 'Business Model', subtitle: 'How you make money' },
          { type: 'competition', title: 'Competition', subtitle: 'Competitive landscape' },
          { type: 'team', title: 'The Team', subtitle: 'Who are you?' },
          { type: 'ask', title: 'The Ask', subtitle: 'Funding and next steps' }
        ]
      },
      brandGuidelines: {
        id: 'brandGuidelines',
        name: 'Brand Guidelines',
        description: 'Visual identity and brand standards',
        slides: [
          { type: 'cover', title: 'Brand Guidelines', subtitle: 'Our visual identity' },
          { type: 'overview', title: 'Brand Overview', subtitle: 'Mission, vision, values' },
          { type: 'logo', title: 'Logo Usage', subtitle: 'Do\'s and don\'ts' },
          { type: 'colors', title: 'Color Palette', subtitle: 'Primary and secondary colors' },
          { type: 'typography', title: 'Typography', subtitle: 'Fonts and usage' },
          { type: 'voice', title: 'Brand Voice', subtitle: 'Tone and personality' },
          { type: 'imagery', title: 'Imagery', subtitle: 'Photography and illustration style' }
        ]
      },
      domainModels: {
        id: 'domainModels',
        name: 'Domain Model Showcase',
        description: 'Visualize your 5 domain-specific models',
        slides: [
          { type: 'cover', title: 'Domain Models', subtitle: '5 Specialized AI Models' },
          { type: 'overview', title: 'Why Domain Models?', subtitle: 'Specialization benefits' },
          { type: 'crypto', title: 'Cryptography Model', subtitle: 'Soulfra identity & security' },
          { type: 'data', title: 'Data Processing Model', subtitle: 'DeathToData ETL' },
          { type: 'publishing', title: 'Publishing Model', subtitle: 'Documentation & content' },
          { type: 'calos', title: 'CALOS Model', subtitle: 'Platform & gamification' },
          { type: 'whimsical', title: 'Creative Model', subtitle: 'Whimsical explanations' },
          { type: 'architecture', title: 'Routing Architecture', subtitle: 'How it all connects' }
        ]
      },
      productRoadmap: {
        id: 'productRoadmap',
        name: 'Product Roadmap',
        description: 'Timeline and feature releases',
        slides: [
          { type: 'cover', title: 'Product Roadmap', subtitle: 'Where we\'re headed' },
          { type: 'vision', title: 'Vision', subtitle: '3-year vision' },
          { type: 'q1', title: 'Q1 2025', subtitle: 'Current quarter' },
          { type: 'q2', title: 'Q2 2025', subtitle: 'Next quarter' },
          { type: 'q3', title: 'Q3 2025', subtitle: 'Mid-year' },
          { type: 'q4', title: 'Q4 2025', subtitle: 'End of year' },
          { type: 'future', title: 'Beyond 2025', subtitle: 'Long-term vision' }
        ]
      },
      feedbackLoop: {
        id: 'feedbackLoop',
        name: 'Feedback Loop Presentation',
        description: 'Show your development process and community involvement',
        slides: [
          { type: 'cover', title: 'What We\'re Building', subtitle: 'Community-driven development' },
          { type: 'philosophy', title: 'Our Philosophy', subtitle: 'Build in public' },
          { type: 'current', title: 'Current State', subtitle: 'Where we are today' },
          { type: 'next', title: 'What\'s Next', subtitle: 'Upcoming features' },
          { type: 'feedback', title: 'We Need Your Feedback', subtitle: 'How to contribute' },
          { type: 'community', title: 'Join the Community', subtitle: 'Discord, Twitter, GitHub' }
        ]
      }
    };
  }

  /**
   * Generate presentation
   */
  async generate(templateType, brand, options = {}) {
    try {
      console.log(`[BrandPresentationGenerator] Generating ${templateType} for ${brand}...`);

      // Validate inputs
      const brandConfig = this.brands[brand];
      if (!brandConfig) {
        throw new Error(`Unknown brand: ${brand}. Available: ${Object.keys(this.brands).join(', ')}`);
      }

      const template = this.templates[templateType];
      if (!template) {
        throw new Error(`Unknown template: ${templateType}. Available: ${Object.keys(this.templates).join(', ')}`);
      }

      // Ensure temp directory exists
      await fs.mkdir(this.tempDir, { recursive: true });

      // Generate content for each slide using domain models
      const slides = await this._generateSlideContent(template, brandConfig, options);

      // Render slides as images
      const slideImages = await this._renderSlides(slides, brandConfig);

      // Export based on format
      const outputFormat = options.format || 'pdf';
      let outputPath;

      switch (outputFormat) {
        case 'pdf':
          outputPath = await this._exportPDF(slideImages, options.outputPath);
          break;
        case 'gif':
          outputPath = await this._exportGIF(slideImages, options.outputPath);
          break;
        case 'mp4':
          outputPath = await this._exportMP4(slideImages, options.outputPath);
          break;
        case 'markdown':
          outputPath = await this._exportMarkdown(slides, options.outputPath);
          break;
        default:
          throw new Error(`Unsupported format: ${outputFormat}`);
      }

      // Generate QR code for sharing
      const qrCode = options.generateQR ? await this._generateQRCode(outputPath) : null;

      console.log(`[BrandPresentationGenerator] ✅ Generated: ${outputPath}`);

      return {
        success: true,
        outputPath,
        qrCode,
        brand: brandConfig.name,
        template: template.name,
        slideCount: slides.length,
        slides, // Include slides data for preview
        format: outputFormat,
        metadata: {
          generatedAt: new Date().toISOString(),
          brand: brandConfig.name,
          template: template.name,
          slideCount: slides.length
        }
      };
    } catch (error) {
      console.error('[BrandPresentationGenerator] Error:', error);
      throw error;
    }
  }

  /**
   * Generate content for slides using domain models
   */
  async _generateSlideContent(template, brandConfig, options) {
    const slides = [];

    for (const slideTemplate of template.slides) {
      const slide = {
        ...slideTemplate,
        brand: brandConfig.name,
        content: await this._generateContent(slideTemplate, brandConfig, options)
      };

      slides.push(slide);
    }

    return slides;
  }

  /**
   * Generate content for a specific slide
   */
  async _generateContent(slideTemplate, brandConfig, options) {
    // If custom content provided, use it
    if (options.customContent && options.customContent[slideTemplate.type]) {
      return options.customContent[slideTemplate.type];
    }

    // Base content structure
    const content = {
      title: slideTemplate.title.replace('Brand', brandConfig.name),
      subtitle: slideTemplate.subtitle,
      body: []
    };

    // Generate body content based on slide type
    switch (slideTemplate.type) {
      case 'cover':
        content.body = [
          `${brandConfig.logo} ${brandConfig.name}`,
          brandConfig.tagline,
          brandConfig.domain
        ];
        break;

      case 'problem':
        content.body = await this._generateProblemSlide(brandConfig);
        break;

      case 'solution':
        content.body = await this._generateSolutionSlide(brandConfig);
        break;

      case 'market':
        content.body = await this._generateMarketSlide(brandConfig);
        break;

      case 'product':
        content.body = await this._generateProductSlide(brandConfig);
        break;

      case 'traction':
        content.body = await this._generateTractionSlide(brandConfig);
        break;

      case 'business-model':
        content.body = await this._generateBusinessModelSlide(brandConfig);
        break;

      case 'competition':
        content.body = await this._generateCompetitionSlide(brandConfig);
        break;

      case 'team':
        content.body = await this._generateTeamSlide(brandConfig);
        break;

      case 'ask':
        content.body = await this._generateAskSlide(brandConfig);
        break;

      default:
        // Use LLM for any other slide types
        content.body = await this._generateWithLLM(slideTemplate.type, brandConfig);
    }

    return content;
  }

  /**
   * Generate problem slide content using LLM
   */
  async _generateProblemSlide(brandConfig) {
    if (!this.llmRouter) {
      return [
        'Current challenges in the space:',
        '• Fragmented solutions',
        '• Poor developer experience',
        '• Limited scalability',
        `${brandConfig.name} solves these problems.`
      ];
    }

    try {
      const prompt = `You are creating a pitch deck for ${brandConfig.name} - ${brandConfig.tagline}.

Domain: ${brandConfig.domain}
Keywords: ${brandConfig.keywords.join(', ')}

Generate the "Problem" slide content. List 3-4 major pain points that ${brandConfig.name} solves.
Format as bullet points. Be specific and compelling.`;

      const response = await this.llmRouter.complete({
        prompt,
        maxTokens: 300,
        taskType: 'creative'
      });

      return this._parseListResponse(response.text);
    } catch (error) {
      console.error('[BrandPresentation] LLM generation failed:', error.message);
      return ['Problem slide content generation failed'];
    }
  }

  /**
   * Generate solution slide content using LLM
   */
  async _generateSolutionSlide(brandConfig) {
    if (!this.llmRouter) {
      return [
        brandConfig.description,
        '',
        'Key features:',
        ...brandConfig.keywords.map(k => `• ${k}`)
      ];
    }

    try {
      const prompt = `You are creating a pitch deck for ${brandConfig.name} - ${brandConfig.tagline}.

Description: ${brandConfig.description}
Keywords: ${brandConfig.keywords.join(', ')}

Generate the "Solution" slide content. Explain how ${brandConfig.name} solves the problems.
Include 3-4 key benefits. Format as bullet points.`;

      const response = await this.llmRouter.complete({
        prompt,
        maxTokens: 300,
        taskType: 'creative'
      });

      return this._parseListResponse(response.text);
    } catch (error) {
      console.error('[BrandPresentation] LLM generation failed:', error.message);
      return [brandConfig.description];
    }
  }

  /**
   * Generate market slide content using LLM
   */
  async _generateMarketSlide(brandConfig) {
    if (!this.llmRouter) {
      return [
        'Target Market',
        `• ${brandConfig.name} serves developers and businesses`,
        '• Total Addressable Market (TAM): $XX billion',
        '• Serviceable Addressable Market (SAM): $XX billion'
      ];
    }

    try {
      const prompt = `Generate market analysis for ${brandConfig.name} - ${brandConfig.tagline}.
Domain: ${brandConfig.domain}

Include:
- Target audience
- Market size estimates
- Growth trends

Format as bullet points.`;

      const response = await this.llmRouter.complete({
        prompt,
        maxTokens: 300,
        preferredProvider: 'ollama', // Use local model for speed
        taskType: 'analysis'
      });

      return this._parseListResponse(response.text);
    } catch (error) {
      return ['Market analysis generation failed'];
    }
  }

  /**
   * Generate product slide content
   */
  async _generateProductSlide(brandConfig) {
    if (!this.llmRouter) {
      return [
        `${brandConfig.name} Product Features`,
        ...brandConfig.keywords.map(k => `• ${k}`),
        '• Developer-friendly',
        '• Scalable architecture'
      ];
    }

    try {
      const prompt = `Describe the product features of ${brandConfig.name}.
Tagline: ${brandConfig.tagline}
Keywords: ${brandConfig.keywords.join(', ')}

List 4-5 core features. Be specific and technical. Format as bullet points.`;

      const response = await this.llmRouter.complete({
        prompt,
        maxTokens: 300,
        preferredProvider: 'ollama',
        taskType: 'technical'
      });

      return this._parseListResponse(response.text);
    } catch (error) {
      return brandConfig.keywords.map(k => `• ${k}`);
    }
  }

  /**
   * Generate traction slide content
   */
  async _generateTractionSlide(brandConfig) {
    return [
      'Early Traction',
      '• Active development',
      '• Growing community',
      '• Positive feedback',
      '• Ready for scale'
    ];
  }

  /**
   * Generate business model slide
   */
  async _generateBusinessModelSlide(brandConfig) {
    return [
      'Business Model',
      '• Freemium tier',
      '• Pro subscriptions',
      '• Enterprise licensing',
      '• API usage fees'
    ];
  }

  /**
   * Generate competition slide
   */
  async _generateCompetitionSlide(brandConfig) {
    return [
      `Why ${brandConfig.name}?`,
      '• More developer-friendly',
      '• Better performance',
      '• Lower cost',
      '• Superior experience'
    ];
  }

  /**
   * Generate team slide
   */
  async _generateTeamSlide(brandConfig) {
    return [
      'Team',
      '• Experienced founders',
      '• Domain expertise',
      '• Proven track record',
      '• Passionate about solving this problem'
    ];
  }

  /**
   * Generate ask slide
   */
  async _generateAskSlide(brandConfig) {
    return [
      'The Ask',
      '• Raising seed round',
      '• Use of funds:',
      '  - Product development',
      '  - Team growth',
      '  - Marketing & sales',
      `Let's build the future of ${brandConfig.keywords[0]} together.`
    ];
  }

  /**
   * Generate content with LLM for unknown slide types
   */
  async _generateWithLLM(slideType, brandConfig) {
    if (!this.llmRouter) {
      return [`Content for ${slideType}`];
    }

    try {
      const prompt = `Generate pitch deck slide content for ${brandConfig.name}.
Slide type: ${slideType}
Tagline: ${brandConfig.tagline}
Domain: ${brandConfig.domain}

Create compelling content for this slide type. Format as bullet points.`;

      const response = await this.llmRouter.complete({
        prompt,
        maxTokens: 300,
        taskType: 'creative'
      });

      return this._parseListResponse(response.text);
    } catch (error) {
      return [`Content for ${slideType}`];
    }
  }

  /**
   * Parse LLM response into list format
   * Extracts bullet points, removes preamble/explanations
   */
  _parseListResponse(text) {
    // Split by lines and filter out empty ones
    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // Extract only bullet point lines
    const bullets = lines.filter(line => {
      // Match bullet markers: •, -, *, numbered lists, or lines starting with **
      return line.match(/^[•\-*]\s+/) ||
             line.match(/^\d+\.\s+/) ||
             line.match(/^\*\*/);
    });

    // If we found bullets, use those
    if (bullets.length > 0) {
      return bullets.map(line => {
        // Normalize bullet format
        return line
          .replace(/^[•\-*]\s+/, '')    // Remove bullet markers
          .replace(/^\d+\.\s+/, '')     // Remove numbers
          .replace(/^\*\*/, '')         // Remove bold markers
          .trim();
      });
    }

    // Fallback: no clear bullets, return first few meaningful lines
    return lines
      .filter(line => !line.match(/^(Here|The|This|Based on|I'll|Let me)/i))
      .slice(0, 5);
  }

  /**
   * Render slides as images
   */
  async _renderSlides(slides, brandConfig) {
    const imagesPaths = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const imagePath = path.join(this.tempDir, `slide-${i + 1}.png`);

      await this._renderSlide(slide, brandConfig, imagePath);
      imagesPaths.push(imagePath);
    }

    return imagesPaths;
  }

  /**
   * Render a single slide as an image
   */
  async _renderSlide(slide, brandConfig, outputPath) {
    // Create SVG for the slide
    const svg = this._createSlideSVG(slide, brandConfig);

    // Convert SVG to PNG using sharp
    await sharp(Buffer.from(svg))
      .resize(this.width, this.height)
      .png()
      .toFile(outputPath);
  }

  /**
   * Create SVG for a slide
   */
  _createSlideSVG(slide, brandConfig) {
    const { colors } = brandConfig;
    const { title, subtitle, body } = slide.content;

    // Format bullets for slide display (remove markdown, truncate)
    const formattedBullets = this._formatForSlide(body);

    // Build body text elements with proper positioning
    const bodyElements = [];
    let currentY = 480; // Start below subtitle
    const bulletFontSize = 36;
    const lineHeight = bulletFontSize * 1.4;
    const maxBulletWidth = 60; // characters

    formattedBullets.forEach((bullet, bulletIndex) => {
      // Wrap long bullets into multiple lines
      const wrappedLines = this._wrapText(bullet, maxBulletWidth);

      wrappedLines.forEach((line, lineIndex) => {
        const isFirstLine = lineIndex === 0;

        bodyElements.push(`
          <text x="${isFirstLine ? '8%' : '10%'}" y="${currentY}"
                font-family="Arial, sans-serif"
                font-size="${bulletFontSize}"
                fill="${colors.text}">
            ${isFirstLine ? '•' : ''} ${this._escapeXml(line)}
          </text>
        `);

        currentY += lineHeight;
      });

      // Add spacing between bullets
      currentY += lineHeight * 0.3;
    });

    return `
      <svg width="${this.width}" height="${this.height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background gradient -->
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${colors.primary};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${colors.secondary};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>

        <!-- Title -->
        <text x="50%" y="180" text-anchor="middle"
              font-family="Arial, sans-serif"
              font-size="72"
              font-weight="bold"
              fill="${colors.text}">
          ${this._escapeXml(title)}
        </text>

        <!-- Subtitle -->
        <text x="50%" y="280" text-anchor="middle"
              font-family="Arial, sans-serif"
              font-size="42"
              fill="${colors.text}"
              opacity="0.8">
          ${this._escapeXml(subtitle)}
        </text>

        <!-- Body content (bullets) -->
        ${bodyElements.join('')}

        <!-- Brand logo/watermark -->
        <text x="95%" y="1020" text-anchor="end"
              font-family="Arial, sans-serif"
              font-size="28"
              fill="${colors.text}"
              opacity="0.5">
          ${brandConfig.domain}
        </text>
      </svg>
    `;
  }

  /**
   * Export slides as PDF
   */
  async _exportPDF(slideImages, outputPath) {
    // Use ImageMagick to convert images to PDF
    const output = outputPath || path.join(this.tempDir, 'presentation.pdf');
    const imagesStr = slideImages.join(' ');

    await execAsync(`convert ${imagesStr} ${output}`);

    return output;
  }

  /**
   * Export slides as GIF
   */
  async _exportGIF(slideImages, outputPath) {
    const output = outputPath || path.join(this.tempDir, 'presentation.gif');
    const delay = Math.floor(this.frameDuration * 100); // convert to centiseconds
    const imagesStr = slideImages.join(' ');

    await execAsync(`convert -delay ${delay} -loop 0 ${imagesStr} ${output}`);

    return output;
  }

  /**
   * Export slides as MP4
   */
  async _exportMP4(slideImages, outputPath) {
    const output = outputPath || path.join(this.tempDir, 'presentation.mp4');
    const pattern = path.join(this.tempDir, 'slide-%d.png');

    await execAsync(
      `ffmpeg -framerate ${1 / this.frameDuration} -i ${pattern} ` +
      `-c:v libx264 -pix_fmt yuv420p ${output}`
    );

    return output;
  }

  /**
   * Export slides as Markdown
   */
  async _exportMarkdown(slides, outputPath) {
    const output = outputPath || path.join(this.tempDir, 'presentation.md');

    const markdown = slides.map((slide, i) => {
      const { title, subtitle, body } = slide.content;
      return `
## Slide ${i + 1}: ${title}

### ${subtitle}

${body.join('\n\n')}

---
`;
    }).join('\n');

    await fs.writeFile(output, markdown);

    return output;
  }

  /**
   * Generate QR code for sharing
   */
  async _generateQRCode(url) {
    // Implementation depends on QR code library
    // For now, return placeholder
    return { qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(url) };
  }

  /**
   * Helper: Escape XML special characters
   */
  _escapeXml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Helper: Wrap text to fit within max width
   * Returns array of lines
   */
  _wrapText(text, maxChars = 60) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (testLine.length <= maxChars) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Helper: Format content for slide display
   * Strips markdown, truncates bullets, ensures readability
   */
  _formatForSlide(bullets, maxBullets = 5) {
    const formatted = bullets
      .map(bullet => {
        // Strip markdown formatting
        let clean = bullet
          .replace(/^\*+\s+/g, '')           // Remove leading asterisks
          .replace(/\*\*(.+?)\*\*/g, '$1')   // Remove bold markers
          .replace(/\*(.+?)\*/g, '$1')       // Remove italic markers
          .replace(/^#+\s+/g, '')            // Remove headers
          .replace(/^[-•+]\s+/g, '')         // Remove bullet markers (including +)
          .replace(/^\d+\.\s+/g, '')         // Remove numbered lists
          .trim();

        // Truncate to readable length
        if (clean.length > 80) {
          clean = clean.substring(0, 77) + '...';
        }

        return clean;
      })
      .filter(b => b.length > 0)           // Remove empty lines
      .filter(b => !b.match(/^(Here|The|This|Based on|I'll|Let me|POV:)/i))  // Remove LLM preamble
      .filter(b => !b.match(/^(Sub-point|Note:|Example:)/i))  // Remove sub-bullets
      .slice(0, maxBullets);               // Limit bullets

    return formatted;
  }

  /**
   * Get available brands
   */
  getBrands() {
    return Object.keys(this.brands).map(key => ({
      id: key,
      name: this.brands[key].name,
      tagline: this.brands[key].tagline,
      domain: this.brands[key].domain
    }));
  }

  /**
   * Get available templates
   */
  getTemplates() {
    return Object.keys(this.templates).map(key => ({
      id: key,
      name: this.templates[key].name,
      description: this.templates[key].description,
      slideCount: this.templates[key].slides.length
    }));
  }

  /**
   * Get domain models
   */
  getDomainModels() {
    return Object.keys(this.domainModels).map(key => ({
      id: key,
      ...this.domainModels[key]
    }));
  }
}

module.exports = BrandPresentationGenerator;
