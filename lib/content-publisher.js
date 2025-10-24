/**
 * Content Publisher
 *
 * Automated book publishing / ebook generation / website cloning system.
 * Transforms documentation and content into distributable digital formats.
 *
 * Features:
 * - Multi-format output (EPUB, PDF, HTML, Markdown, JSON)
 * - Template-based generation (books, courses, docs)
 * - AI-enhanced content (use bucket models to expand docs)
 * - Scraper-friendly formats (intentionally easy to copy)
 * - Distribution automation (GitHub Pages, NPM, Gumroad)
 *
 * Usage:
 *   const publisher = new ContentPublisher({ db, bucketOrchestrator });
 *   await publisher.publish({
 *     sourceType: 'markdown',
 *     sourcePath: 'MULTIPLAYER_PORTAL_SYSTEM.md',
 *     outputFormat: 'epub',
 *     template: 'game-guide'
 *   });
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const DocumentGenerator = require('./document-generator');

class ContentPublisher {
  constructor(options = {}) {
    this.db = options.db;
    this.bucketOrchestrator = options.bucketOrchestrator;
    this.outputDir = options.outputDir || path.join(__dirname, '../public/downloads');
    this.tempDir = options.tempDir || path.join(__dirname, '../temp/publishing');

    // Generators
    this.documentGenerator = new DocumentGenerator(this.tempDir);
    this.ebookGenerator = null; // Lazy-load
    this.websiteCloner = null; // Lazy-load

    // Template registry
    this.templates = this._loadTemplates();

    // Publication tracking
    this.publications = new Map(); // publicationId -> status

    console.log('[ContentPublisher] Initialized');
  }

  /**
   * Load template registry
   * @private
   */
  _loadTemplates() {
    return {
      // Book templates
      'game-guide': {
        name: 'Game Guide',
        description: 'Complete guide for games/interactive systems',
        structure: ['cover', 'toc', 'intro', 'chapters', 'appendix', 'index'],
        aiEnhancement: true,
        targetPages: 200
      },
      'technical-manual': {
        name: 'Technical Manual',
        description: 'API docs and technical reference',
        structure: ['cover', 'toc', 'quickstart', 'api-reference', 'examples', 'troubleshooting'],
        aiEnhancement: false,
        targetPages: 150
      },
      'business-guide': {
        name: 'Business Guide',
        description: 'Business strategy and monetization',
        structure: ['cover', 'toc', 'overview', 'strategies', 'case-studies', 'action-plan'],
        aiEnhancement: true,
        targetPages: 120
      },
      'tutorial-course': {
        name: 'Tutorial Course',
        description: 'Step-by-step educational content',
        structure: ['cover', 'toc', 'prerequisites', 'lessons', 'exercises', 'quiz', 'certificate'],
        aiEnhancement: true,
        targetPages: 100
      },
      'reference-docs': {
        name: 'Reference Documentation',
        description: 'Structured API/technical reference',
        structure: ['toc', 'overview', 'reference', 'examples'],
        aiEnhancement: false,
        targetPages: 80
      }
    };
  }

  // ============================================================================
  // Main Publishing Methods
  // ============================================================================

  /**
   * Publish content to multiple formats
   *
   * @param {Object} options - Publishing options
   * @returns {Promise<Object>} - Publication result
   */
  async publish(options) {
    const {
      sourceType = 'markdown',  // 'markdown', 'database', 'template'
      sourcePath,               // Path to source file or identifier
      outputFormat = 'all',     // 'epub', 'pdf', 'html', 'markdown', 'json', 'all'
      template = 'game-guide',  // Template to use
      title = 'Generated Publication',
      aiEnhancement = true,     // Use AI to expand content
      aiModel = null,           // Specific bucket to use (default: auto-select)
      metadata = {}             // Additional metadata
    } = options;

    const publicationId = uuidv4();

    console.log(`[ContentPublisher] Starting publication ${publicationId}...`);
    console.log(`  Source: ${sourceType} (${sourcePath})`);
    console.log(`  Template: ${template}`);
    console.log(`  Output: ${outputFormat}`);

    this.publications.set(publicationId, {
      status: 'processing',
      startedAt: Date.now(),
      sourceType,
      sourcePath,
      template
    });

    try {
      // Step 1: Load source content
      const content = await this._loadContent(sourceType, sourcePath);

      // Step 2: Apply template structure
      const structuredContent = await this._applyTemplate(content, template, {
        title,
        aiEnhancement,
        aiModel,
        metadata
      });

      // Step 3: Generate outputs
      const outputs = await this._generateOutputs(structuredContent, outputFormat, {
        publicationId,
        title
      });

      // Step 4: Save metadata
      await this._savePublication({
        publicationId,
        title,
        sourceType,
        sourcePath,
        template,
        outputs,
        metadata
      });

      // Update status
      this.publications.set(publicationId, {
        status: 'completed',
        startedAt: this.publications.get(publicationId).startedAt,
        completedAt: Date.now(),
        outputs
      });

      console.log(`[ContentPublisher] Publication ${publicationId} completed`);

      return {
        publicationId,
        title,
        outputs,
        stats: this._calculateStats(structuredContent, outputs)
      };

    } catch (error) {
      console.error(`[ContentPublisher] Publication ${publicationId} failed:`, error);

      this.publications.set(publicationId, {
        status: 'failed',
        error: error.message,
        startedAt: this.publications.get(publicationId).startedAt,
        failedAt: Date.now()
      });

      throw error;
    }
  }

  // ============================================================================
  // Content Loading
  // ============================================================================

  /**
   * Load content from various sources
   * @private
   */
  async _loadContent(sourceType, sourcePath) {
    switch (sourceType) {
      case 'markdown':
        return await this._loadMarkdownFile(sourcePath);

      case 'database':
        return await this._loadDatabaseContent(sourcePath);

      case 'template':
        return await this._loadTemplateContent(sourcePath);

      default:
        throw new Error(`Unknown source type: ${sourceType}`);
    }
  }

  /**
   * Load markdown file
   * @private
   */
  async _loadMarkdownFile(filePath) {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(__dirname, '..', filePath);

    const markdown = await fs.readFile(fullPath, 'utf-8');

    // Parse markdown structure
    const sections = this._parseMarkdown(markdown);

    return {
      type: 'markdown',
      raw: markdown,
      sections
    };
  }

  /**
   * Parse markdown into sections
   * @private
   */
  _parseMarkdown(markdown) {
    const lines = markdown.split('\n');
    const sections = [];
    let currentSection = null;

    for (const line of lines) {
      // Detect headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        const [, hashes, title] = headingMatch;
        const level = hashes.length;

        if (currentSection) {
          sections.push(currentSection);
        }

        currentSection = {
          level,
          title: title.trim(),
          content: []
        };
      } else if (currentSection) {
        currentSection.content.push(line);
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    // Join content arrays
    sections.forEach(section => {
      section.content = section.content.join('\n').trim();
    });

    return sections;
  }

  /**
   * Load content from database
   * @private
   */
  async _loadDatabaseContent(identifier) {
    // identifier could be: "bucket:bucket_technical_01", "portal:1", etc.
    const [type, id] = identifier.split(':');

    switch (type) {
      case 'bucket':
        return await this._loadBucketContent(id);

      case 'portal':
        return await this._loadPortalContent(id);

      case 'starters':
        return await this._loadStartersContent();

      default:
        throw new Error(`Unknown database content type: ${type}`);
    }
  }

  /**
   * Load bucket content
   * @private
   */
  async _loadBucketContent(bucketId) {
    const query = `
      SELECT
        bi.*,
        dp.domain_name,
        dp.brand_name,
        dp.primary_color
      FROM bucket_instances bi
      LEFT JOIN domain_portfolio dp ON bi.domain_context = dp.domain_name
      WHERE bi.bucket_id = $1
    `;

    const result = await this.db.query(query, [bucketId]);

    if (result.rows.length === 0) {
      throw new Error(`Bucket not found: ${bucketId}`);
    }

    const bucket = result.rows[0];

    return {
      type: 'bucket',
      bucket,
      sections: [
        {
          level: 1,
          title: bucket.bucket_name,
          content: bucket.description || `${bucket.bucket_name} powered by ${bucket.ollama_model}`
        }
      ]
    };
  }

  /**
   * Load all starters content
   * @private
   */
  async _loadStartersContent() {
    const query = `
      SELECT
        bi.*,
        dp.domain_name,
        dp.brand_name,
        dp.primary_color
      FROM bucket_instances bi
      LEFT JOIN domain_portfolio dp ON bi.domain_context = dp.domain_name
      WHERE bi.status = 'active'
      ORDER BY bi.category, bi.bucket_name
    `;

    const result = await this.db.query(query);

    const sections = [];

    // Intro section
    sections.push({
      level: 1,
      title: 'CALOS Starters - Choose Your Companion',
      content: `Explore the 12 unique AI starters, each with distinct personalities and capabilities.`
    });

    // Group by category
    const categories = {
      technical: [],
      creative: [],
      business: []
    };

    result.rows.forEach(bucket => {
      const cat = bucket.category?.toLowerCase() || 'technical';
      if (categories[cat]) {
        categories[cat].push(bucket);
      }
    });

    // Generate sections for each category
    for (const [category, buckets] of Object.entries(categories)) {
      if (buckets.length === 0) continue;

      sections.push({
        level: 2,
        title: `${category.charAt(0).toUpperCase() + category.slice(1)} Starters`,
        content: `Starters optimized for ${category} tasks.`
      });

      buckets.forEach(bucket => {
        sections.push({
          level: 3,
          title: bucket.bucket_name,
          content: `**Model:** ${bucket.ollama_model}\n\n**Domain:** ${bucket.brand_name || bucket.domain_context}\n\n${bucket.description || 'A powerful AI companion.'}`
        });
      });
    }

    return {
      type: 'starters',
      sections
    };
  }

  /**
   * Load portal content
   * @private
   */
  async _loadPortalContent(portalId) {
    // Load portal details, battles, chat, etc.
    const query = `SELECT * FROM portal_instances WHERE portal_id = $1`;
    const result = await this.db.query(query, [portalId]);

    if (result.rows.length === 0) {
      throw new Error(`Portal not found: ${portalId}`);
    }

    const portal = result.rows[0];

    return {
      type: 'portal',
      portal,
      sections: [
        {
          level: 1,
          title: portal.portal_name,
          content: `Portal created ${new Date(portal.created_at).toLocaleDateString()}`
        }
      ]
    };
  }

  /**
   * Load template content
   * @private
   */
  async _loadTemplateContent(templateName) {
    // Generate content from template
    const BookTemplates = require('./book-templates');
    const template = BookTemplates[templateName];

    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    return {
      type: 'template',
      template: templateName,
      sections: template.generateSections()
    };
  }

  // ============================================================================
  // Template Application
  // ============================================================================

  /**
   * Apply template structure to content
   * @private
   */
  async _applyTemplate(content, templateName, options) {
    const template = this.templates[templateName];

    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    console.log(`[ContentPublisher] Applying template: ${template.name}`);

    const structured = {
      title: options.title,
      template: templateName,
      metadata: {
        ...options.metadata,
        generatedAt: new Date().toISOString(),
        template: template.name,
        description: template.description
      },
      chapters: []
    };

    // Apply template structure
    for (const part of template.structure) {
      switch (part) {
        case 'cover':
          structured.chapters.push(this._generateCover(options.title, options.metadata));
          break;

        case 'toc':
          // TOC generated after all chapters
          break;

        case 'intro':
          structured.chapters.push(this._generateIntro(content, options));
          break;

        case 'chapters':
          // Main content
          const chapters = this._sectionsToChapters(content.sections);
          structured.chapters.push(...chapters);
          break;

        case 'appendix':
          structured.chapters.push(this._generateAppendix(content));
          break;

        case 'index':
          structured.chapters.push(this._generateIndex(content));
          break;

        default:
          console.warn(`[ContentPublisher] Unknown template part: ${part}`);
      }
    }

    // AI enhancement
    if (template.aiEnhancement && options.aiEnhancement) {
      await this._enhanceWithAI(structured, options.aiModel);
    }

    return structured;
  }

  /**
   * Generate cover chapter
   * @private
   */
  _generateCover(title, metadata) {
    return {
      type: 'cover',
      title: title,
      content: `# ${title}\n\n${metadata.subtitle || ''}\n\n${metadata.author || 'CALOS AI'}\n\n${new Date().getFullYear()}`,
      metadata
    };
  }

  /**
   * Generate intro chapter
   * @private
   */
  _generateIntro(content, options) {
    return {
      type: 'intro',
      title: 'Introduction',
      content: `Welcome to ${options.title}!\n\nThis guide will help you master the concepts and features covered in this publication.`,
      metadata: {}
    };
  }

  /**
   * Convert sections to chapters
   * @private
   */
  _sectionsToChapters(sections) {
    const chapters = [];
    let currentChapter = null;

    sections.forEach(section => {
      if (section.level === 1 || section.level === 2) {
        // New chapter
        if (currentChapter) {
          chapters.push(currentChapter);
        }

        currentChapter = {
          type: 'chapter',
          title: section.title,
          content: section.content,
          subsections: [],
          metadata: {}
        };
      } else if (currentChapter) {
        // Subsection
        currentChapter.subsections.push({
          title: section.title,
          content: section.content
        });
      }
    });

    if (currentChapter) {
      chapters.push(currentChapter);
    }

    return chapters;
  }

  /**
   * Generate appendix
   * @private
   */
  _generateAppendix(content) {
    return {
      type: 'appendix',
      title: 'Appendix',
      content: '## Additional Resources\n\n- CALOS Documentation: https://docs.calos.ai\n- Community Forum: https://forum.calos.ai\n- GitHub: https://github.com/calos',
      metadata: {}
    };
  }

  /**
   * Generate index
   * @private
   */
  _generateIndex(content) {
    return {
      type: 'index',
      title: 'Index',
      content: '## Index\n\n(Generated automatically)',
      metadata: {}
    };
  }

  /**
   * Enhance content with AI
   * @private
   */
  async _enhanceWithAI(structured, aiModel) {
    if (!this.bucketOrchestrator) {
      console.warn('[ContentPublisher] No bucket orchestrator - skipping AI enhancement');
      return;
    }

    console.log('[ContentPublisher] Enhancing content with AI...');

    // Select model
    const bucket = aiModel
      ? this.bucketOrchestrator.buckets.get(aiModel)
      : Array.from(this.bucketOrchestrator.buckets.values())[0];

    if (!bucket) {
      console.warn('[ContentPublisher] No bucket available for AI enhancement');
      return;
    }

    // Enhance each chapter intro
    for (const chapter of structured.chapters) {
      if (chapter.type !== 'chapter') continue;

      try {
        const prompt = `Write a brief, engaging introduction (2-3 sentences) for a book chapter titled "${chapter.title}". Make it compelling and informative.`;

        const response = await bucket.chat([{ role: 'user', content: prompt }]);

        chapter.aiIntro = response.content;
      } catch (error) {
        console.error('[ContentPublisher] AI enhancement error:', error.message);
      }
    }
  }

  // ============================================================================
  // Output Generation
  // ============================================================================

  /**
   * Generate output files in requested formats
   * @private
   */
  async _generateOutputs(structured, outputFormat, options) {
    const outputs = {};
    const formats = outputFormat === 'all'
      ? ['markdown', 'html', 'pdf', 'epub']
      : [outputFormat];

    for (const format of formats) {
      try {
        outputs[format] = await this._generateFormat(structured, format, options);
      } catch (error) {
        console.error(`[ContentPublisher] Error generating ${format}:`, error.message);
        outputs[format] = { error: error.message };
      }
    }

    return outputs;
  }

  /**
   * Generate specific format
   * @private
   */
  async _generateFormat(structured, format, options) {
    switch (format) {
      case 'markdown':
        return await this._generateMarkdown(structured, options);

      case 'html':
        return await this._generateHTML(structured, options);

      case 'pdf':
        return await this._generatePDF(structured, options);

      case 'epub':
        return await this._generateEPUB(structured, options);

      case 'json':
        return await this._generateJSON(structured, options);

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Generate Markdown output
   * @private
   */
  async _generateMarkdown(structured, options) {
    const lines = [];

    // Title
    lines.push(`# ${structured.title}\n`);

    // Metadata
    if (structured.metadata) {
      lines.push(`**Generated:** ${structured.metadata.generatedAt}`);
      lines.push(`**Template:** ${structured.metadata.template}\n`);
    }

    // Chapters
    for (const chapter of structured.chapters) {
      if (chapter.type === 'cover') continue;

      lines.push(`\n## ${chapter.title}\n`);

      if (chapter.aiIntro) {
        lines.push(`*${chapter.aiIntro}*\n`);
      }

      lines.push(chapter.content);

      // Subsections
      if (chapter.subsections) {
        chapter.subsections.forEach(sub => {
          lines.push(`\n### ${sub.title}\n`);
          lines.push(sub.content);
        });
      }

      lines.push('\n---\n');
    }

    const markdown = lines.join('\n');

    // Save to file
    const filename = `${this._sanitizeFilename(structured.title)}_${options.publicationId}.md`;
    const filepath = path.join(this.outputDir, filename);

    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.writeFile(filepath, markdown, 'utf-8');

    return {
      format: 'markdown',
      path: filepath,
      filename,
      url: `/downloads/${filename}`,
      size: Buffer.byteLength(markdown, 'utf-8')
    };
  }

  /**
   * Generate HTML output
   * @private
   */
  async _generateHTML(structured, options) {
    // Simple HTML wrapper
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${structured.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1 { color: #667eea; }
    h2 { color: #764ba2; margin-top: 40px; }
    h3 { color: #3b82f6; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${structured.title}</h1>
  ${structured.chapters.map(chapter => `
    <section>
      <h2>${chapter.title}</h2>
      ${chapter.aiIntro ? `<p><em>${chapter.aiIntro}</em></p>` : ''}
      ${this._markdownToHTML(chapter.content)}
      ${chapter.subsections ? chapter.subsections.map(sub => `
        <h3>${sub.title}</h3>
        ${this._markdownToHTML(sub.content)}
      `).join('') : ''}
    </section>
  `).join('')}
</body>
</html>
    `;

    const filename = `${this._sanitizeFilename(structured.title)}_${options.publicationId}.html`;
    const filepath = path.join(this.outputDir, filename);

    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.writeFile(filepath, html, 'utf-8');

    return {
      format: 'html',
      path: filepath,
      filename,
      url: `/downloads/${filename}`,
      size: Buffer.byteLength(html, 'utf-8')
    };
  }

  /**
   * Generate PDF output
   * @private
   */
  async _generatePDF(structured, options) {
    // Use existing DocumentGenerator
    const notes = structured.chapters.map(chapter => ({
      title: chapter.title,
      content: chapter.content,
      created_at: new Date(),
      tags: []
    }));

    return await this.documentGenerator.generatePDF(notes, {
      title: structured.title
    });
  }

  /**
   * Generate EPUB output
   * @private
   */
  async _generateEPUB(structured, options) {
    // Load EbookGenerator lazily
    if (!this.ebookGenerator) {
      const EbookGenerator = require('./ebook-generator');
      this.ebookGenerator = new EbookGenerator({ outputDir: this.outputDir });
    }

    return await this.ebookGenerator.generateEPUB(structured, options);
  }

  /**
   * Generate JSON output
   * @private
   */
  async _generateJSON(structured, options) {
    const json = JSON.stringify(structured, null, 2);

    const filename = `${this._sanitizeFilename(structured.title)}_${options.publicationId}.json`;
    const filepath = path.join(this.outputDir, filename);

    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.writeFile(filepath, json, 'utf-8');

    return {
      format: 'json',
      path: filepath,
      filename,
      url: `/downloads/${filename}`,
      size: Buffer.byteLength(json, 'utf-8')
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Basic markdown to HTML conversion
   * @private
   */
  _markdownToHTML(markdown) {
    return markdown
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(.+)$/gm, '<p>$1</p>');
  }

  /**
   * Sanitize filename
   * @private
   */
  _sanitizeFilename(filename) {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  }

  /**
   * Calculate publication stats
   * @private
   */
  _calculateStats(structured, outputs) {
    const totalContent = structured.chapters
      .map(ch => ch.content + (ch.subsections || []).map(s => s.content).join(''))
      .join('');

    const wordCount = totalContent.split(/\s+/).length;
    const pageCount = Math.ceil(wordCount / 250); // ~250 words per page

    return {
      chapters: structured.chapters.length,
      wordCount,
      estimatedPages: pageCount,
      formats: Object.keys(outputs).filter(k => !outputs[k].error),
      totalSize: Object.values(outputs)
        .filter(o => o.size)
        .reduce((sum, o) => sum + o.size, 0)
    };
  }

  /**
   * Save publication metadata
   * @private
   */
  async _savePublication(data) {
    if (!this.db) return;

    try {
      const query = `
        INSERT INTO publications (
          publication_id, title, source_type, source_path,
          template, outputs, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (publication_id) DO UPDATE
        SET outputs = EXCLUDED.outputs, metadata = EXCLUDED.metadata
      `;

      await this.db.query(query, [
        data.publicationId,
        data.title,
        data.sourceType,
        data.sourcePath,
        data.template,
        JSON.stringify(data.outputs),
        JSON.stringify(data.metadata)
      ]);
    } catch (error) {
      // Table might not exist yet - that's OK
      console.warn('[ContentPublisher] Could not save publication metadata:', error.message);
    }
  }

  /**
   * Get publication status
   */
  getPublicationStatus(publicationId) {
    return this.publications.get(publicationId) || null;
  }

  /**
   * List all publications
   */
  listPublications() {
    return Array.from(this.publications.entries()).map(([id, data]) => ({
      publicationId: id,
      ...data
    }));
  }
}

module.exports = ContentPublisher;
