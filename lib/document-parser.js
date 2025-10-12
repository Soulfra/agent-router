/**
 * Document Parser
 * Extracts text content from various document formats
 * Supports: PDF, TXT, MD, DOCX, HTML
 */

const fs = require('fs');
const path = require('path');

class DocumentParser {
  constructor() {
    // Lazy-load heavy dependencies
    this.pdfParse = null;
    this.mammoth = null;
    this.htmlToText = null;
  }

  /**
   * Parse document based on file type
   */
  async parse(filePath, mimeType = null) {
    // Detect MIME type from file extension if not provided
    if (!mimeType) {
      mimeType = this.detectMimeType(filePath);
    }

    try {
      switch (mimeType) {
        case 'application/pdf':
          return await this.parsePDF(filePath);

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/msword':
          return await this.parseDOCX(filePath);

        case 'text/html':
          return await this.parseHTML(filePath);

        case 'text/markdown':
        case 'text/plain':
          return await this.parseText(filePath);

        default:
          // Try as plain text fallback
          return await this.parseText(filePath);
      }
    } catch (error) {
      throw new Error(`Failed to parse document: ${error.message}`);
    }
  }

  /**
   * Parse PDF file
   */
  async parsePDF(filePath) {
    if (!this.pdfParse) {
      this.pdfParse = require('pdf-parse');
    }

    const dataBuffer = fs.readFileSync(filePath);
    const data = await this.pdfParse(dataBuffer);

    return {
      text: data.text,
      metadata: {
        pages: data.numpages,
        info: data.info,
        version: data.version
      },
      chunks: this.chunkText(data.text, 1000) // Split into chunks
    };
  }

  /**
   * Parse DOCX file
   */
  async parseDOCX(filePath) {
    if (!this.mammoth) {
      this.mammoth = require('mammoth');
    }

    const result = await this.mammoth.extractRawText({ path: filePath });

    return {
      text: result.value,
      metadata: {
        messages: result.messages // Parsing warnings/errors
      },
      chunks: this.chunkText(result.value, 1000)
    };
  }

  /**
   * Parse HTML file
   */
  async parseHTML(filePath) {
    if (!this.htmlToText) {
      const { convert } = require('html-to-text');
      this.htmlToText = convert;
    }

    const html = fs.readFileSync(filePath, 'utf8');

    const text = this.htmlToText(html, {
      wordwrap: false,
      preserveNewlines: true,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' }
      ]
    });

    return {
      text: text,
      metadata: {},
      chunks: this.chunkText(text, 1000)
    };
  }

  /**
   * Parse plain text or markdown
   */
  async parseText(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');

    return {
      text: text,
      metadata: {},
      chunks: this.chunkText(text, 1000)
    };
  }

  /**
   * Parse from buffer (for uploaded files in memory)
   */
  async parseBuffer(buffer, mimeType, filename = 'document') {
    // Save to temp file
    const tempDir = '/tmp/calos-uploads';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const ext = this.getExtensionFromMimeType(mimeType);
    const tempPath = path.join(tempDir, `${Date.now()}_${filename}${ext}`);

    fs.writeFileSync(tempPath, buffer);

    try {
      const result = await this.parse(tempPath, mimeType);

      // Cleanup temp file
      fs.unlinkSync(tempPath);

      return result;
    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }

  /**
   * Chunk text into smaller pieces for embedding
   */
  chunkText(text, maxChunkSize = 1000, overlap = 200) {
    const chunks = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = '';
    let currentSize = 0;

    for (const sentence of sentences) {
      const sentenceSize = sentence.length;

      if (currentSize + sentenceSize > maxChunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push(currentChunk.trim());

        // Start new chunk with overlap
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlap / 5)); // Approximate word count
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
        currentSize = currentChunk.length;
      } else {
        currentChunk += sentence;
        currentSize += sentenceSize;
      }
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Detect MIME type from file extension
   */
  detectMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.html': 'text/html',
      '.htm': 'text/html'
    };

    return mimeTypes[ext] || 'text/plain';
  }

  /**
   * Get file extension from MIME type
   */
  getExtensionFromMimeType(mimeType) {
    const extensions = {
      'application/pdf': '.pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/msword': '.doc',
      'text/plain': '.txt',
      'text/markdown': '.md',
      'text/html': '.html'
    };

    return extensions[mimeType] || '.txt';
  }

  /**
   * Extract metadata from document
   */
  async extractMetadata(filePath, mimeType = null) {
    const stats = fs.statSync(filePath);

    if (!mimeType) {
      mimeType = this.detectMimeType(filePath);
    }

    const metadata = {
      filename: path.basename(filePath),
      mimeType: mimeType,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    };

    // Try to get word count
    try {
      const parsed = await this.parse(filePath, mimeType);
      metadata.wordCount = parsed.text.split(/\s+/).length;
      metadata.characterCount = parsed.text.length;
    } catch (error) {
      console.error('Failed to extract text for metadata:', error.message);
    }

    return metadata;
  }

  /**
   * Validate file type
   */
  isSupported(mimeType) {
    const supported = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
      'text/html'
    ];

    return supported.includes(mimeType);
  }

  /**
   * Get supported formats
   */
  getSupportedFormats() {
    return [
      { ext: '.pdf', mime: 'application/pdf', name: 'PDF Document' },
      { ext: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'Word Document (DOCX)' },
      { ext: '.doc', mime: 'application/msword', name: 'Word Document (DOC)' },
      { ext: '.txt', mime: 'text/plain', name: 'Plain Text' },
      { ext: '.md', mime: 'text/markdown', name: 'Markdown' },
      { ext: '.html', mime: 'text/html', name: 'HTML' }
    ];
  }
}

module.exports = DocumentParser;
