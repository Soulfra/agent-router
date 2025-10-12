/**
 * Document Generator
 * Generate documents in various formats from notes
 * Supports: PDF, Markdown, HTML, DOCX, JSON
 */

const fs = require('fs');
const path = require('path');

class DocumentGenerator {
  constructor(outputDir = '/tmp/calos-exports') {
    this.outputDir = outputDir;

    // Create output directory
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Lazy-load heavy dependencies
    this.PDFDocument = null;
    this.marked = null;
    this.officegen = null;
  }

  /**
   * Generate document from notes
   */
  async generate(notes, format, options = {}) {
    const {
      template = 'summary',      // 'summary', 'report', 'outline', 'blog', 'custom'
      title = 'Generated Document',
      includeMetadata = true,
      customTemplate = null
    } = options;

    switch (format) {
      case 'pdf':
        return await this.generatePDF(notes, { template, title, includeMetadata });

      case 'markdown':
      case 'md':
        return await this.generateMarkdown(notes, { template, title, includeMetadata });

      case 'html':
        return await this.generateHTML(notes, { template, title, includeMetadata });

      case 'docx':
        return await this.generateDOCX(notes, { template, title, includeMetadata });

      case 'json':
        return await this.generateJSON(notes, { template, title, includeMetadata });

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Generate PDF document
   */
  async generatePDF(notes, options = {}) {
    if (!this.PDFDocument) {
      this.PDFDocument = require('pdfkit');
    }

    const { title = 'Generated Document', includeMetadata = true } = options;

    const filename = `${this.sanitizeFilename(title)}_${Date.now()}.pdf`;
    const outputPath = path.join(this.outputDir, filename);

    return new Promise((resolve, reject) => {
      try {
        const doc = new this.PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Title
        doc.fontSize(24).text(title, { align: 'center' });
        doc.moveDown();

        // Metadata
        if (includeMetadata) {
          doc.fontSize(10).fillColor('gray')
            .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' })
            .text(`Total Notes: ${notes.length}`, { align: 'center' });
          doc.fillColor('black');
          doc.moveDown(2);
        }

        // Content
        notes.forEach((note, index) => {
          // Note title
          doc.fontSize(16).fillColor('blue').text(note.title || `Note ${index + 1}`);
          doc.fontSize(10).fillColor('gray').text(new Date(note.created_at).toLocaleString());
          doc.fillColor('black');
          doc.moveDown(0.5);

          // Note content
          doc.fontSize(12).text(note.content, {
            align: 'justify',
            lineGap: 5
          });

          // Tags
          if (note.tags && note.tags.length > 0) {
            doc.moveDown(0.5);
            doc.fontSize(10).fillColor('gray').text(`Tags: ${note.tags.join(', ')}`);
            doc.fillColor('black');
          }

          doc.moveDown(2);

          // Page break for long documents
          if (index < notes.length - 1 && doc.y > 650) {
            doc.addPage();
          }
        });

        doc.end();

        stream.on('finish', () => {
          resolve({
            path: outputPath,
            filename: filename,
            format: 'pdf',
            size: fs.statSync(outputPath).size
          });
        });

        stream.on('error', reject);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate Markdown document
   */
  async generateMarkdown(notes, options = {}) {
    const { title = 'Generated Document', includeMetadata = true } = options;

    const filename = `${this.sanitizeFilename(title)}_${Date.now()}.md`;
    const outputPath = path.join(this.outputDir, filename);

    let markdown = `# ${title}\n\n`;

    if (includeMetadata) {
      markdown += `> Generated: ${new Date().toLocaleString()}\n`;
      markdown += `> Total Notes: ${notes.length}\n\n`;
      markdown += `---\n\n`;
    }

    notes.forEach((note, index) => {
      markdown += `## ${note.title || `Note ${index + 1}`}\n\n`;
      markdown += `*${new Date(note.created_at).toLocaleString()}*\n\n`;
      markdown += `${note.content}\n\n`;

      if (note.tags && note.tags.length > 0) {
        markdown += `**Tags:** ${note.tags.map(t => `#${t}`).join(', ')}\n\n`;
      }

      if (note.category) {
        markdown += `**Category:** ${note.category}\n\n`;
      }

      markdown += `---\n\n`;
    });

    fs.writeFileSync(outputPath, markdown);

    return {
      path: outputPath,
      filename: filename,
      format: 'markdown',
      size: fs.statSync(outputPath).size,
      content: markdown
    };
  }

  /**
   * Generate HTML document
   */
  async generateHTML(notes, options = {}) {
    if (!this.marked) {
      const { marked } = require('marked');
      this.marked = marked;
    }

    const { title = 'Generated Document', includeMetadata = true } = options;

    const filename = `${this.sanitizeFilename(title)}_${Date.now()}.html`;
    const outputPath = path.join(this.outputDir, filename);

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
    }
    h2 {
      color: #34495e;
      margin-top: 40px;
      border-bottom: 1px solid #ecf0f1;
      padding-bottom: 5px;
    }
    .metadata {
      background: #ecf0f1;
      padding: 15px;
      border-radius: 5px;
      font-size: 0.9em;
      color: #7f8c8d;
      margin-bottom: 30px;
    }
    .note {
      margin-bottom: 40px;
      padding: 20px;
      background: #fff;
      border-left: 4px solid #3498db;
    }
    .note-meta {
      font-size: 0.9em;
      color: #7f8c8d;
      margin-bottom: 15px;
    }
    .tags {
      margin-top: 15px;
    }
    .tag {
      display: inline-block;
      background: #3498db;
      color: white;
      padding: 3px 10px;
      border-radius: 3px;
      font-size: 0.85em;
      margin-right: 5px;
    }
    hr {
      border: none;
      border-top: 1px solid #ecf0f1;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(title)}</h1>
`;

    if (includeMetadata) {
      html += `  <div class="metadata">
    <strong>Generated:</strong> ${new Date().toLocaleString()}<br>
    <strong>Total Notes:</strong> ${notes.length}
  </div>\n`;
    }

    notes.forEach((note, index) => {
      html += `  <div class="note">
    <h2>${this.escapeHtml(note.title || `Note ${index + 1}`)}</h2>
    <div class="note-meta">${new Date(note.created_at).toLocaleString()}</div>
    <div class="content">${this.marked(note.content)}</div>
`;

      if (note.tags && note.tags.length > 0) {
        html += `    <div class="tags">`;
        note.tags.forEach(tag => {
          html += `<span class="tag">#${this.escapeHtml(tag)}</span>`;
        });
        html += `</div>\n`;
      }

      html += `  </div>\n`;

      if (index < notes.length - 1) {
        html += `  <hr>\n`;
      }
    });

    html += `</body>
</html>`;

    fs.writeFileSync(outputPath, html);

    return {
      path: outputPath,
      filename: filename,
      format: 'html',
      size: fs.statSync(outputPath).size,
      content: html
    };
  }

  /**
   * Generate DOCX document
   */
  async generateDOCX(notes, options = {}) {
    if (!this.officegen) {
      this.officegen = require('officegen');
    }

    const { title = 'Generated Document', includeMetadata = true } = options;

    const filename = `${this.sanitizeFilename(title)}_${Date.now()}.docx`;
    const outputPath = path.join(this.outputDir, filename);

    return new Promise((resolve, reject) => {
      try {
        const docx = this.officegen('docx');

        // Set document properties
        docx.setDocTitle(title);
        docx.setDocSubject('Generated from CalOS Knowledge Base');
        docx.creator = 'CalOS';

        // Title
        const titlePara = docx.createP();
        titlePara.addText(title, { font_size: 24, bold: true });

        // Metadata
        if (includeMetadata) {
          const metaPara = docx.createP();
          metaPara.addText(`Generated: ${new Date().toLocaleString()}`, { font_size: 10, color: '808080' });
          metaPara.addLineBreak();
          metaPara.addText(`Total Notes: ${notes.length}`, { font_size: 10, color: '808080' });
        }

        docx.createP().addLineBreak();

        // Content
        notes.forEach((note, index) => {
          // Note title
          const noteTitlePara = docx.createP();
          noteTitlePara.addText(note.title || `Note ${index + 1}`, { font_size: 16, bold: true, color: '2980b9' });

          // Date
          const datePara = docx.createP();
          datePara.addText(new Date(note.created_at).toLocaleString(), { font_size: 9, color: '7f8c8d' });

          // Content
          const contentPara = docx.createP();
          contentPara.addText(note.content, { font_size: 12 });

          // Tags
          if (note.tags && note.tags.length > 0) {
            const tagsPara = docx.createP();
            tagsPara.addText(`Tags: ${note.tags.join(', ')}`, { font_size: 10, color: '7f8c8d' });
          }

          // Spacing
          docx.createP().addLineBreak();
        });

        const out = fs.createWriteStream(outputPath);

        out.on('close', () => {
          resolve({
            path: outputPath,
            filename: filename,
            format: 'docx',
            size: fs.statSync(outputPath).size
          });
        });

        out.on('error', reject);

        docx.generate(out);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate JSON export
   */
  async generateJSON(notes, options = {}) {
    const { title = 'Generated Document', includeMetadata = true } = options;

    const filename = `${this.sanitizeFilename(title)}_${Date.now()}.json`;
    const outputPath = path.join(this.outputDir, filename);

    const data = {
      title: title,
      generated_at: new Date().toISOString(),
      total_notes: notes.length,
      notes: notes.map(note => ({
        id: note.id,
        title: note.title,
        content: note.content,
        source: note.source,
        category: note.category,
        tags: note.tags,
        created_at: note.created_at,
        updated_at: note.updated_at
      }))
    };

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    return {
      path: outputPath,
      filename: filename,
      format: 'json',
      size: fs.statSync(outputPath).size,
      content: data
    };
  }

  /**
   * Generate summary from notes using AI
   */
  async generateAISummary(notes, aiProvider) {
    const notesText = notes.map(n => `${n.title}\n${n.content}`).join('\n\n---\n\n');

    const prompt = `Please provide a concise summary of the following notes:\n\n${notesText}\n\nSummary:`;

    // This would integrate with your AI provider
    // For now, return a placeholder
    return {
      summary: 'AI summary generation requires AI provider integration',
      notesCount: notes.length
    };
  }

  /**
   * Sanitize filename
   */
  sanitizeFilename(filename) {
    return filename
      .replace(/[^a-z0-9_\-]/gi, '_')
      .toLowerCase()
      .substring(0, 50);
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Get supported formats
   */
  getSupportedFormats() {
    return [
      { format: 'pdf', name: 'PDF Document', extension: '.pdf' },
      { format: 'markdown', name: 'Markdown', extension: '.md' },
      { format: 'html', name: 'HTML', extension: '.html' },
      { format: 'docx', name: 'Word Document', extension: '.docx' },
      { format: 'json', name: 'JSON', extension: '.json' }
    ];
  }

  /**
   * Get available templates
   */
  getAvailableTemplates() {
    return [
      { id: 'summary', name: 'Summary', description: 'Simple summary of notes' },
      { id: 'report', name: 'Report', description: 'Detailed report format' },
      { id: 'outline', name: 'Outline', description: 'Bullet-point outline' },
      { id: 'blog', name: 'Blog Post', description: 'Blog-style format' }
    ];
  }

  /**
   * Cleanup old exports (older than 24 hours)
   */
  async cleanup() {
    try {
      const files = fs.readdirSync(this.outputDir);
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;

      let cleaned = 0;

      files.forEach(file => {
        const filePath = path.join(this.outputDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > ONE_DAY) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      });

      if (cleaned > 0) {
        console.log(`🗑️  Cleaned up ${cleaned} old export files`);
      }
    } catch (error) {
      console.error('Export cleanup error:', error.message);
    }
  }
}

module.exports = DocumentGenerator;

// Cleanup old files daily
setInterval(() => {
  const generator = new DocumentGenerator();
  generator.cleanup();
}, 24 * 60 * 60 * 1000);
