/**
 * OCR Service Adapter
 *
 * Integrates Tesseract OCR with visual AI models for text extraction
 * from images, screenshots, maps, and documents.
 *
 * Supported Operations:
 * - extract_text: Extract text from image using Tesseract
 * - image_to_markdown: Convert image (screenshot, document) to markdown
 * - translate_visual: Visual content translation with LLM enhancement
 * - analyze_map: Extract text from game map screenshots
 * - describe_image: Generate image descriptions using vision models
 *
 * Port: 11436 (shared with Gaming - visual processing)
 * Models: llava:7b, bakllava, Tesseract OCR
 * Dependencies: tesseract.js or tesseract CLI
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp'); // Image preprocessing

class OCRAdapter {
  constructor(options = {}) {
    this.ollamaPort = options.ollamaPort || 11436;
    this.ollamaHost = options.ollamaHost || 'http://localhost';
    this.defaultModel = options.defaultModel || 'llava:latest'; // 4.7GB, better than llava:7b
    this.tesseractPath = options.tesseractPath || 'tesseract'; // CLI path
    this.tmpDir = options.tmpDir || '/tmp/calos-ocr';
    this.iiifServer = options.iiifServer; // Optional IIIF integration
  }

  /**
   * Main entry point for OCR service requests
   *
   * @param {Object} request - Service request
   * @param {string} request.operation - OCR operation type
   * @param {Object} request.context - Image context
   * @param {string} request.prompt - user prompt
   * @returns {Promise<Object>} OCR-formatted response
   */
  async handle(request) {
    const { operation, context = {}, prompt } = request;

    // Ensure tmp directory exists
    await this._ensureTmpDir();

    switch (operation) {
      case 'extract_text':
        return this.extractText(context, prompt);

      case 'image_to_markdown':
        return this.imageToMarkdown(context, prompt);

      case 'translate_visual':
        return this.translateVisual(context, prompt);

      case 'analyze_map':
        return this.analyzeMap(context, prompt);

      case 'describe_image':
        return this.describeImage(context, prompt);

      default:
        throw new Error(`Unknown OCR operation: ${operation}`);
    }
  }

  /**
   * Extract text from image using Tesseract OCR
   *
   * @param {Object} context
   * @param {string} context.image_url - URL or path to image
   * @param {string} context.image_base64 - Base64 encoded image
   * @param {string} context.language - OCR language (default: eng)
   * @param {Array} context.preprocessing - Preprocessing steps
   * @returns {Promise<Object>} Extracted text with confidence scores
   */
  async extractText(context, customPrompt) {
    const {
      image_url,
      image_base64,
      language = 'eng',
      preprocessing = ['deskew', 'enhance']
    } = context;

    if (!image_url && !image_base64) {
      throw new Error('Missing required context: image_url or image_base64');
    }

    // Download/prepare image
    const imagePath = await this._prepareImage(image_url, image_base64);

    // Preprocess image
    const processedPath = await this._preprocessImage(imagePath, preprocessing);

    // Run Tesseract OCR
    const ocrResult = await this._runTesseract(processedPath, language);

    // Parse Tesseract output
    const { text, confidence, bounding_boxes } = this._parseTesseractOutput(ocrResult);

    // Optional: Enhance with LLM (fix OCR errors, improve formatting)
    let enhanced_text = text;
    if (customPrompt || text.length > 0) {
      enhanced_text = await this._enhanceOCRText(text, customPrompt);
    }

    // Cleanup
    await this._cleanupFile(imagePath);
    if (processedPath !== imagePath) {
      await this._cleanupFile(processedPath);
    }

    return {
      text,
      enhanced_text,
      confidence,
      bounding_boxes,
      language,
      preprocessing_applied: preprocessing
    };
  }

  /**
   * Convert image (screenshot, document) to markdown
   */
  async imageToMarkdown(context, customPrompt) {
    const {
      image_url,
      image_base64,
      document_type = 'general' // general, code, table, form
    } = context;

    // Extract text using Tesseract
    const ocrResult = await this.extractText({
      image_url,
      image_base64,
      preprocessing: ['deskew', 'enhance', 'denoise']
    });

    // Use LLM to convert to structured markdown
    const prompt = customPrompt || `
      Convert this OCR-extracted text to well-formatted markdown.

      Document type: ${document_type}

      OCR Text:
      ${ocrResult.text}

      ${document_type === 'code' ? 'Preserve code formatting and syntax.' : ''}
      ${document_type === 'table' ? 'Convert to markdown table format.' : ''}
      ${document_type === 'form' ? 'Structure as key-value pairs.' : ''}

      Return JSON:
      {
        "markdown": "# Title\\n\\n Content...",
        "structure": {
          "headings": ["Title", "Section 1"],
          "sections": 3,
          "has_code": false,
          "has_tables": true
        }
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      format: 'json'
    });

    const result = this._parseJSON(response);

    return {
      ...result,
      original_ocr: ocrResult
    };
  }

  /**
   * Translate visual content with LLM enhancement
   */
  async translateVisual(context, customPrompt) {
    const {
      image_url,
      image_base64,
      target_language = 'English',
      preserve_formatting = true
    } = context;

    // Extract text
    const ocrResult = await this.extractText({
      image_url,
      image_base64
    });

    // Translate with LLM
    const prompt = customPrompt || `
      Translate this text to ${target_language}.

      Original text:
      ${ocrResult.text}

      ${preserve_formatting ? 'Preserve original formatting (line breaks, spacing).' : ''}

      Return JSON:
      {
        "translated_text": "...",
        "source_language_detected": "...",
        "confidence": 0.95
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      format: 'json'
    });

    const translation = this._parseJSON(response);

    return {
      ...translation,
      original_text: ocrResult.text,
      original_confidence: ocrResult.confidence
    };
  }

  /**
   * Analyze game map screenshot
   */
  async analyzeMap(context, customPrompt) {
    const {
      image_url,
      image_base64,
      extract_locations = true,
      extract_labels = true
    } = context;

    // Extract text from map
    const ocrResult = await this.extractText({
      image_url,
      image_base64,
      preprocessing: ['deskew', 'enhance', 'denoise', 'threshold']
    });

    // Use LLM to structure map data
    const prompt = customPrompt || `
      Analyze this game map OCR text and extract structured data.

      OCR Text:
      ${ocrResult.text}

      Bounding boxes (location labels):
      ${JSON.stringify(ocrResult.bounding_boxes, null, 2)}

      Extract:
      ${extract_locations ? '- Location names and coordinates\n' : ''}
      ${extract_labels ? '- NPC labels, shop names, quest markers\n' : ''}
      - Points of interest

      Return JSON:
      {
        "locations": [
          { "name": "Hollowtown Square", "x": 120, "y": 80 }
        ],
        "npcs": [
          { "name": "Shopkeeper", "x": 50, "y": 100 }
        ],
        "pois": [
          { "type": "shop", "name": "General Store", "x": 55, "y": 95 }
        ]
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      format: 'json'
    });

    const mapData = this._parseJSON(response);

    return {
      ...mapData,
      ocr_confidence: ocrResult.confidence,
      raw_ocr_text: ocrResult.text
    };
  }

  /**
   * Describe image using vision model
   */
  async describeImage(context, customPrompt) {
    const {
      image_url,
      image_base64,
      detail_level = 'medium'
    } = context;

    if (!image_url && !image_base64) {
      throw new Error('Missing required context: image_url or image_base64');
    }

    // For vision models (llava), we need to send image data
    const imagePath = await this._prepareImage(image_url, image_base64);
    const imageBase64 = await this._imageToBase64(imagePath);

    const prompt = customPrompt || `
      Describe this image in ${detail_level} detail.

      ${detail_level === 'high' ? 'Provide detailed description of all elements, colors, composition.' : ''}
      ${detail_level === 'medium' ? 'Describe main subjects, colors, and overall scene.' : ''}
      ${detail_level === 'low' ? 'Provide brief summary only.' : ''}

      Return JSON:
      {
        "description": "...",
        "main_subjects": ["person", "building"],
        "colors": ["blue", "green"],
        "mood": "calm",
        "text_detected": "any visible text"
      }
    `;

    const response = await this._callOllama({
      model: 'llava:7b', // Vision model
      prompt,
      images: [imageBase64],
      format: 'json'
    });

    // Cleanup
    await this._cleanupFile(imagePath);

    return this._parseJSON(response);
  }

  /**
   * Prepare image from URL or base64
   */
  async _prepareImage(url, base64) {
    const tmpPath = path.join(this.tmpDir, `img-${Date.now()}.png`);

    if (base64) {
      // Decode base64 and save
      const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      await fs.writeFile(tmpPath, buffer);
    } else if (url) {
      // Download from URL
      if (url.startsWith('http')) {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        await fs.writeFile(tmpPath, Buffer.from(buffer));
      } else {
        // Local file path
        await fs.copyFile(url, tmpPath);
      }
    }

    return tmpPath;
  }

  /**
   * Preprocess image for better OCR results
   */
  async _preprocessImage(imagePath, steps) {
    if (!steps || steps.length === 0) {
      return imagePath;
    }

    const processedPath = imagePath.replace('.png', '-processed.png');
    let pipeline = sharp(imagePath);

    for (const step of steps) {
      switch (step) {
        case 'deskew':
          // Note: sharp doesn't have deskew, would need external library
          // For now, skip (Tesseract has built-in deskewing)
          break;

        case 'enhance':
          pipeline = pipeline.normalize().sharpen();
          break;

        case 'denoise':
          pipeline = pipeline.median(3);
          break;

        case 'grayscale':
          pipeline = pipeline.grayscale();
          break;

        case 'threshold':
          pipeline = pipeline.threshold(128);
          break;

        case 'resize':
          // Upscale small images for better OCR
          pipeline = pipeline.resize({ width: 2000, fit: 'inside' });
          break;
      }
    }

    await pipeline.toFile(processedPath);
    return processedPath;
  }

  /**
   * Run Tesseract OCR on image
   */
  async _runTesseract(imagePath, language) {
    try {
      // Check if Tesseract is installed
      await execAsync('tesseract --version');
    } catch (error) {
      throw new Error(
        'Tesseract OCR is not installed. Install: brew install tesseract (macOS) or apt install tesseract-ocr (Linux)'
      );
    }

    // Run Tesseract with TSV output for bounding boxes
    const outputBase = imagePath.replace(/\.\w+$/, '');

    // Get plain text
    await execAsync(`tesseract "${imagePath}" "${outputBase}" -l ${language}`);
    const text = await fs.readFile(`${outputBase}.txt`, 'utf-8');

    // Get TSV with bounding boxes
    await execAsync(`tesseract "${imagePath}" "${outputBase}-tsv" -l ${language} tsv`);
    const tsv = await fs.readFile(`${outputBase}-tsv.tsv`, 'utf-8');

    // Cleanup Tesseract output files
    await this._cleanupFile(`${outputBase}.txt`);
    await this._cleanupFile(`${outputBase}-tsv.tsv`);

    return { text, tsv };
  }

  /**
   * Parse Tesseract TSV output
   */
  _parseTesseractOutput(ocrResult) {
    const { text, tsv } = ocrResult;

    const lines = tsv.split('\n').slice(1); // Skip header
    const bounding_boxes = [];
    let totalConfidence = 0;
    let wordCount = 0;

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 12) continue;

      const [level, page_num, block_num, par_num, line_num, word_num,
             left, top, width, height, conf, text_content] = parts;

      // Only include word-level (level 5) with confidence
      if (level === '5' && conf !== '-1' && text_content.trim()) {
        bounding_boxes.push({
          text: text_content.trim(),
          x: parseInt(left),
          y: parseInt(top),
          w: parseInt(width),
          h: parseInt(height),
          confidence: parseFloat(conf) / 100
        });

        totalConfidence += parseFloat(conf);
        wordCount++;
      }
    }

    const avgConfidence = wordCount > 0 ? totalConfidence / wordCount / 100 : 0;

    return {
      text: text.trim(),
      confidence: Math.round(avgConfidence * 100) / 100,
      bounding_boxes
    };
  }

  /**
   * Enhance OCR text using LLM (fix common OCR errors)
   */
  async _enhanceOCRText(text, customPrompt) {
    const prompt = customPrompt || `
      Fix common OCR errors in this text:

      ${text}

      Common OCR errors to fix:
      - 1 → l (lowercase L)
      - 0 → O (letter O)
      - 5 → S
      - Spacing issues
      - Word breaks

      Return only the corrected text (no JSON, no explanations).
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      stream: false
    });

    return response.trim();
  }

  /**
   * Convert image to base64 for vision models
   */
  async _imageToBase64(imagePath) {
    const buffer = await fs.readFile(imagePath);
    return buffer.toString('base64');
  }

  /**
   * Ensure tmp directory exists
   */
  async _ensureTmpDir() {
    try {
      await fs.mkdir(this.tmpDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Cleanup temporary file
   */
  async _cleanupFile(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // File might not exist
    }
  }

  /**
   * Call Ollama on OCR/Visual port 11436
   */
  async _callOllama(request) {
    const url = `${this.ollamaHost}:${this.ollamaPort}/api/generate`;

    const body = {
      model: request.model || this.defaultModel,
      prompt: request.prompt,
      stream: false
    };

    // Add images for vision models
    if (request.images) {
      body.images = request.images;
    }

    // Add format if specified
    if (request.format) {
      body.format = request.format;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  /**
   * Parse JSON response from LLM
   */
  _parseJSON(response) {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.match(/```\s*([\s\S]*?)\s*```/);

      const jsonString = jsonMatch ? jsonMatch[1] : response;
      return JSON.parse(jsonString.trim());
    } catch (error) {
      // If parsing fails, return raw response
      return { raw_response: response, parse_error: error.message };
    }
  }

  /**
   * Format response for API
   */
  format(data) {
    return {
      service: 'ocr',
      port: this.ollamaPort,
      data,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = OCRAdapter;
