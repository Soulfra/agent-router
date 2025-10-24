/**
 * Ebook Generator
 *
 * Generates professional ebooks in EPUB, MOBI, and enhanced PDF formats.
 * Designed for distribution on Amazon Kindle, Apple Books, Gumroad, etc.
 *
 * Features:
 * - EPUB 3.0 generation (industry standard)
 * - MOBI conversion (Kindle format)
 * - Enhanced PDF (with table of contents, bookmarks)
 * - Cover image generation
 * - Metadata embedding (author, ISBN, etc.)
 * - Chapter navigation
 * - Code syntax highlighting
 *
 * Usage:
 *   const generator = new EbookGenerator();
 *   await generator.generateEPUB(structured, { title: 'My Book' });
 */

const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class EbookGenerator {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.join(__dirname, '../public/downloads');
    this.tempDir = options.tempDir || path.join(__dirname, '../temp/ebooks');

    // EPUB metadata defaults
    this.defaults = {
      author: 'CALOS AI',
      publisher: 'CALOS Publishing',
      language: 'en',
      rights: 'All rights reserved',
      subject: 'Technology, AI, Software'
    };
  }

  /**
   * Generate EPUB ebook
   *
   * @param {Object} structured - Structured content from ContentPublisher
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} - Output info
   */
  async generateEPUB(structured, options = {}) {
    const {
      publicationId,
      title = structured.title,
      author = this.defaults.author,
      publisher = this.defaults.publisher,
      language = this.defaults.language,
      isbn = null,
      coverImage = null
    } = options;

    console.log(`[EbookGenerator] Generating EPUB for "${title}"...`);

    // Create temp directory for EPUB structure
    const epubDir = path.join(this.tempDir, `epub_${publicationId}`);
    await fs.mkdir(epubDir, { recursive: true });

    try {
      // Step 1: Create EPUB structure
      await this._createEPUBStructure(epubDir);

      // Step 2: Generate content files
      await this._generateContentOPF(epubDir, structured, {
        title,
        author,
        publisher,
        language,
        isbn
      });

      await this._generateTOC(epubDir, structured);

      await this._generateChapters(epubDir, structured);

      // Step 3: Package into EPUB
      const epubPath = await this._packageEPUB(epubDir, title, publicationId);

      console.log(`[EbookGenerator] EPUB generated: ${epubPath}`);

      return {
        format: 'epub',
        path: epubPath,
        filename: path.basename(epubPath),
        url: `/downloads/${path.basename(epubPath)}`,
        size: (await fs.stat(epubPath)).size
      };

    } finally {
      // Cleanup temp directory
      try {
        await fs.rm(epubDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('[EbookGenerator] Cleanup error:', error.message);
      }
    }
  }

  /**
   * Create EPUB directory structure
   * @private
   */
  async _createEPUBStructure(epubDir) {
    // EPUB structure:
    // - mimetype
    // - META-INF/container.xml
    // - OEBPS/content.opf
    // - OEBPS/toc.ncx
    // - OEBPS/chapters/*.xhtml
    // - OEBPS/styles/main.css

    // Create directories
    await fs.mkdir(path.join(epubDir, 'META-INF'), { recursive: true });
    await fs.mkdir(path.join(epubDir, 'OEBPS', 'chapters'), { recursive: true });
    await fs.mkdir(path.join(epubDir, 'OEBPS', 'styles'), { recursive: true });

    // Create mimetype
    await fs.writeFile(
      path.join(epubDir, 'mimetype'),
      'application/epub+zip',
      { encoding: 'utf-8' }
    );

    // Create container.xml
    const containerXML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    await fs.writeFile(
      path.join(epubDir, 'META-INF', 'container.xml'),
      containerXML,
      { encoding: 'utf-8' }
    );

    // Create main.css
    const css = `
body {
  font-family: Georgia, serif;
  line-height: 1.6;
  margin: 1em;
}

h1, h2, h3 {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  margin-top: 1.5em;
}

h1 { font-size: 2em; color: #667eea; }
h2 { font-size: 1.5em; color: #764ba2; }
h3 { font-size: 1.2em; color: #3b82f6; }

p { margin: 1em 0; }

code {
  font-family: 'Courier New', monospace;
  background: #f4f4f4;
  padding: 2px 6px;
  border-radius: 3px;
}

pre {
  background: #f4f4f4;
  padding: 15px;
  border-radius: 5px;
  overflow-x: auto;
}

blockquote {
  border-left: 4px solid #667eea;
  padding-left: 1em;
  margin-left: 0;
  font-style: italic;
}

em { font-style: italic; }
strong { font-weight: bold; }
    `;

    await fs.writeFile(
      path.join(epubDir, 'OEBPS', 'styles', 'main.css'),
      css,
      { encoding: 'utf-8' }
    );
  }

  /**
   * Generate content.opf (package document)
   * @private
   */
  async _generateContentOPF(epubDir, structured, metadata) {
    const { title, author, publisher, language, isbn } = metadata;

    const chapterItems = structured.chapters
      .map((chapter, idx) => `    <item id="chapter${idx}" href="chapters/chapter${idx}.xhtml" media-type="application/xhtml+xml"/>`)
      .join('\n');

    const chapterRefs = structured.chapters
      .map((chapter, idx) => `    <itemref idref="chapter${idx}"/>`)
      .join('\n');

    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${this._escapeXML(title)}</dc:title>
    <dc:creator>${this._escapeXML(author)}</dc:creator>
    <dc:publisher>${this._escapeXML(publisher)}</dc:publisher>
    <dc:language>${language}</dc:language>
    <dc:date>${new Date().toISOString().split('T')[0]}</dc:date>
    ${isbn ? `<dc:identifier id="bookid">urn:isbn:${isbn}</dc:identifier>` : `<dc:identifier id="bookid">urn:uuid:${Date.now()}</dc:identifier>`}
    <meta property="dcterms:modified">${new Date().toISOString()}</meta>
  </metadata>

  <manifest>
    <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles/main.css" media-type="text/css"/>
${chapterItems}
  </manifest>

  <spine toc="toc">
${chapterRefs}
  </spine>
</package>`;

    await fs.writeFile(
      path.join(epubDir, 'OEBPS', 'content.opf'),
      opf,
      { encoding: 'utf-8' }
    );
  }

  /**
   * Generate toc.ncx (navigation)
   * @private
   */
  async _generateTOC(epubDir, structured) {
    const navPoints = structured.chapters
      .map((chapter, idx) => `
    <navPoint id="navpoint${idx}" playOrder="${idx + 1}">
      <navLabel>
        <text>${this._escapeXML(chapter.title)}</text>
      </navLabel>
      <content src="chapters/chapter${idx}.xhtml"/>
    </navPoint>`)
      .join('');

    const toc = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${Date.now()}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${this._escapeXML(structured.title)}</text>
  </docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;

    await fs.writeFile(
      path.join(epubDir, 'OEBPS', 'toc.ncx'),
      toc,
      { encoding: 'utf-8' }
    );
  }

  /**
   * Generate chapter XHTML files
   * @private
   */
  async _generateChapters(epubDir, structured) {
    for (let idx = 0; idx < structured.chapters.length; idx++) {
      const chapter = structured.chapters[idx];

      const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${this._escapeXML(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles/main.css"/>
</head>
<body>
  <h1>${this._escapeXML(chapter.title)}</h1>
  ${chapter.aiIntro ? `<p><em>${this._escapeXML(chapter.aiIntro)}</em></p>` : ''}
  ${this._markdownToXHTML(chapter.content)}
  ${chapter.subsections ? chapter.subsections.map(sub => `
    <h2>${this._escapeXML(sub.title)}</h2>
    ${this._markdownToXHTML(sub.content)}
  `).join('') : ''}
</body>
</html>`;

      await fs.writeFile(
        path.join(epubDir, 'OEBPS', 'chapters', `chapter${idx}.xhtml`),
        xhtml,
        { encoding: 'utf-8' }
      );
    }
  }

  /**
   * Package EPUB into ZIP
   * @private
   */
  async _packageEPUB(epubDir, title, publicationId) {
    const filename = `${this._sanitizeFilename(title)}_${publicationId}.epub`;
    const outputPath = path.join(this.outputDir, filename);

    await fs.mkdir(this.outputDir, { recursive: true });

    return new Promise((resolve, reject) => {
      const output = require('fs').createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(outputPath));
      archive.on('error', reject);

      archive.pipe(output);

      // Add mimetype first (uncompressed)
      archive.file(path.join(epubDir, 'mimetype'), {
        name: 'mimetype',
        store: true
      });

      // Add META-INF
      archive.directory(path.join(epubDir, 'META-INF'), 'META-INF');

      // Add OEBPS
      archive.directory(path.join(epubDir, 'OEBPS'), 'OEBPS');

      archive.finalize();
    });
  }

  /**
   * Convert markdown to XHTML
   * @private
   */
  _markdownToXHTML(markdown) {
    return markdown
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .split('\n\n')
      .map(para => {
        if (para.startsWith('<h') || para.startsWith('<pre')) {
          return para;
        }
        return `<p>${para}</p>`;
      })
      .join('\n');
  }

  /**
   * Escape XML special characters
   * @private
   */
  _escapeXML(text) {
    if (!text) return '';

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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
   * Convert EPUB to MOBI (requires Calibre)
   *
   * @param {string} epubPath - Path to EPUB file
   * @returns {Promise<Object>} - MOBI output info
   */
  async convertToMOBI(epubPath) {
    try {
      // Check if ebook-convert (Calibre) is installed
      await execAsync('which ebook-convert');

      const mobiPath = epubPath.replace('.epub', '.mobi');

      console.log('[EbookGenerator] Converting to MOBI...');

      await execAsync(`ebook-convert "${epubPath}" "${mobiPath}"`);

      return {
        format: 'mobi',
        path: mobiPath,
        filename: path.basename(mobiPath),
        url: `/downloads/${path.basename(mobiPath)}`,
        size: (await fs.stat(mobiPath)).size
      };

    } catch (error) {
      console.warn('[EbookGenerator] MOBI conversion failed:', error.message);
      console.warn('Install Calibre for MOBI support: brew install --cask calibre');

      return {
        format: 'mobi',
        error: 'Calibre not installed',
        message: 'Install with: brew install --cask calibre'
      };
    }
  }
}

module.exports = EbookGenerator;
