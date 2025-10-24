const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

/**
 * OCR wrapper for extracting text and credentials from screenshots
 * Uses tesseract-ocr for text extraction with coordinate detection
 */
class ScreenshotOCR {
  constructor() {
    this.tesseractPath = 'tesseract'; // Assumes tesseract is in PATH
  }

  /**
   * Extract plain text from an image
   * @param {string} imagePath - Path to screenshot
   * @returns {Promise<string>} Extracted text
   */
  async extractText(imagePath) {
    try {
      const { stdout } = await execAsync(`${this.tesseractPath} "${imagePath}" -`);
      return stdout.trim();
    } catch (error) {
      console.error(`[OCR] Failed to extract text from ${imagePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Extract text with bounding box coordinates using HOCR format
   * @param {string} imagePath - Path to screenshot
   * @returns {Promise<Array>} Array of {text, bbox: {x, y, width, height}, confidence}
   */
  async extractWithCoordinates(imagePath) {
    try {
      const hocrPath = imagePath.replace(/\.(png|jpg|jpeg)$/i, '.hocr');
      await execAsync(`${this.tesseractPath} "${imagePath}" "${hocrPath.replace('.hocr', '')}" hocr`);

      const hocrContent = await fs.readFile(hocrPath, 'utf-8');
      const elements = this.parseHOCR(hocrContent);

      // Clean up HOCR file
      await fs.unlink(hocrPath).catch(() => {});

      return elements;
    } catch (error) {
      console.error(`[OCR] Failed to extract coordinates from ${imagePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Parse HOCR XML format to extract text with bounding boxes
   * @param {string} hocr - HOCR XML content
   * @returns {Array} Parsed elements with text and coordinates
   */
  parseHOCR(hocr) {
    const elements = [];

    // Match ocrx_word elements with bounding boxes
    const wordRegex = /<span class=['"]ocrx_word['"] id=['"][^'"]+['"] title=['"]bbox (\d+) (\d+) (\d+) (\d+);[^'"]*x_wconf (\d+)['"]>([^<]+)<\/span>/g;

    let match;
    while ((match = wordRegex.exec(hocr)) !== null) {
      const [, x1, y1, x2, y2, confidence, text] = match;

      elements.push({
        text: text.trim(),
        bbox: {
          x: parseInt(x1),
          y: parseInt(y1),
          width: parseInt(x2) - parseInt(x1),
          height: parseInt(y2) - parseInt(y1)
        },
        confidence: parseInt(confidence)
      });
    }

    return elements;
  }

  /**
   * Find OAuth credentials in extracted text
   * @param {string} text - OCR extracted text
   * @returns {Object} {clientId, clientSecret, provider}
   */
  async findCredentials(text) {
    const credentials = {
      clientId: null,
      clientSecret: null,
      provider: null
    };

    // Normalize text for better matching (handle OCR spacing issues)
    const normalizedText = text.replace(/\s+/g, ' ');

    // GitHub patterns - Multiple formats
    // Format 1: "Client ID" label followed by value
    const githubClientIdMatch1 = normalizedText.match(/(?:Client\s*ID|Application\s*ID)[:\s]+(Iv1\.[a-zA-Z0-9]{16,})/i);
    // Format 2: Just the Iv1. pattern anywhere in text
    const githubClientIdMatch2 = normalizedText.match(/(Iv1\.[a-zA-Z0-9]{16,})/);
    // Format 3: Spaces between characters (OCR artifact)
    const githubClientIdMatch3 = normalizedText.match(/I\s*v\s*1\s*\.\s*([a-zA-Z0-9\s]{16,})/i);

    // GitHub secret patterns
    const githubSecretMatch1 = normalizedText.match(/(?:Client\s*secret|Application\s*secret)[:\s]+([a-f0-9]{40}|[A-Za-z0-9._~-]{40,})/i);
    const githubSecretMatch2 = normalizedText.match(/\b([a-f0-9]{40})\b/); // 40-char hex string

    if (githubClientIdMatch1 || githubClientIdMatch2 || githubClientIdMatch3 || text.match(/github/i)) {
      credentials.provider = 'github';

      // Try all patterns
      if (githubClientIdMatch1) {
        credentials.clientId = githubClientIdMatch1[1];
      } else if (githubClientIdMatch2) {
        credentials.clientId = githubClientIdMatch2[1];
      } else if (githubClientIdMatch3) {
        // Remove spaces from OCR artifact
        credentials.clientId = 'Iv1.' + githubClientIdMatch3[1].replace(/\s+/g, '');
      }

      if (githubSecretMatch1) {
        credentials.clientSecret = githubSecretMatch1[1];
      } else if (githubSecretMatch2) {
        credentials.clientSecret = githubSecretMatch2[1];
      }
    }

    // Google patterns
    const googleClientIdMatch = normalizedText.match(/(?:Client\s*ID)[:\s]+([0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com)/i);
    const googleSecretMatch1 = normalizedText.match(/(?:Client\s*secret)[:\s]+(GOCSPX-[A-Za-z0-9_-]{28})/i);
    const googleSecretMatch2 = normalizedText.match(/(GOCSPX-[A-Za-z0-9_-]{28})/);

    if (googleClientIdMatch || googleSecretMatch1 || googleSecretMatch2 || text.match(/google|oauth.*2\.0/i)) {
      credentials.provider = 'google';
      credentials.clientId = googleClientIdMatch ? googleClientIdMatch[1] : null;
      credentials.clientSecret = googleSecretMatch1 ? googleSecretMatch1[1] : (googleSecretMatch2 ? googleSecretMatch2[1] : null);
    }

    // Microsoft patterns
    const microsoftClientIdMatch = normalizedText.match(/(?:Application.*ID|Client\s*ID)[:\s]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const microsoftSecretMatch = normalizedText.match(/(?:Client\s*secret|Secret\s*value)[:\s]+([A-Za-z0-9._~-]{34,})/i);

    if (microsoftClientIdMatch || text.match(/microsoft|azure/i)) {
      credentials.provider = 'microsoft';
      credentials.clientId = microsoftClientIdMatch ? microsoftClientIdMatch[1] : null;
      credentials.clientSecret = microsoftSecretMatch ? microsoftSecretMatch[1] : null;
    }

    return credentials;
  }

  /**
   * Find clickable buttons and their positions from HOCR data
   * @param {Array} hocrElements - Parsed HOCR elements
   * @returns {Array} Button elements with text and positions
   */
  async findButtons(hocrElements) {
    const buttons = [];
    const buttonKeywords = [
      'new', 'create', 'register', 'add', 'generate', 'save', 'submit',
      'oauth', 'app', 'application', 'developer', 'settings', 'continue',
      'sign in', 'login', 'authorize', 'copy', 'credentials'
    ];

    // Group words that are close together (likely part of same button)
    const grouped = this.groupNearbyWords(hocrElements);

    for (const group of grouped) {
      const text = group.map(el => el.text).join(' ').toLowerCase();

      // Check if this group contains button-like text
      const isButton = buttonKeywords.some(keyword => text.includes(keyword));

      if (isButton && group.length > 0) {
        // Calculate bounding box for entire group
        const minX = Math.min(...group.map(el => el.bbox.x));
        const minY = Math.min(...group.map(el => el.bbox.y));
        const maxX = Math.max(...group.map(el => el.bbox.x + el.bbox.width));
        const maxY = Math.max(...group.map(el => el.bbox.y + el.bbox.height));

        buttons.push({
          text: group.map(el => el.text).join(' '),
          bbox: {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
          },
          confidence: Math.max(...group.map(el => el.confidence))
        });
      }
    }

    return buttons;
  }

  /**
   * Group words that are vertically and horizontally close together
   * @param {Array} elements - HOCR elements
   * @returns {Array} Groups of elements
   */
  groupNearbyWords(elements) {
    const groups = [];
    const used = new Set();

    for (let i = 0; i < elements.length; i++) {
      if (used.has(i)) continue;

      const group = [elements[i]];
      used.add(i);

      // Find nearby words (within 50px horizontally, 10px vertically)
      for (let j = i + 1; j < elements.length; j++) {
        if (used.has(j)) continue;

        const last = group[group.length - 1];
        const current = elements[j];

        const horizontalDist = Math.abs(current.bbox.x - (last.bbox.x + last.bbox.width));
        const verticalDist = Math.abs(current.bbox.y - last.bbox.y);

        if (horizontalDist < 50 && verticalDist < 10) {
          group.push(current);
          used.add(j);
        }
      }

      if (group.length > 0) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Find form fields and their labels from HOCR data
   * @param {Array} hocrElements - Parsed HOCR elements
   * @returns {Array} Form fields with labels and positions
   */
  async findFormFields(hocrElements) {
    const fields = [];
    const fieldLabels = [
      'application name', 'homepage url', 'callback url', 'redirect uri',
      'authorization callback', 'description', 'website', 'privacy policy',
      'terms of service', 'authorized domains', 'redirect uris'
    ];

    const grouped = this.groupNearbyWords(hocrElements);

    for (const group of grouped) {
      const text = group.map(el => el.text).join(' ').toLowerCase();

      const matchedLabel = fieldLabels.find(label => text.includes(label));

      if (matchedLabel && group.length > 0) {
        const minX = Math.min(...group.map(el => el.bbox.x));
        const minY = Math.min(...group.map(el => el.bbox.y));
        const maxX = Math.max(...group.map(el => el.bbox.x + el.bbox.width));
        const maxY = Math.max(...group.map(el => el.bbox.y + el.bbox.height));

        fields.push({
          label: group.map(el => el.text).join(' '),
          matchedLabel: matchedLabel,
          bbox: {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
          },
          confidence: Math.max(...group.map(el => el.confidence))
        });
      }
    }

    return fields;
  }

  /**
   * Process a screenshot to extract all useful information
   * @param {string} imagePath - Path to screenshot
   * @returns {Promise<Object>} {text, credentials, buttons, formFields, elements}
   */
  async processScreenshot(imagePath) {
    console.log(`[OCR] Processing screenshot: ${imagePath}`);

    // Extract plain text for credential detection
    const text = await this.extractText(imagePath);

    // Extract text with coordinates for UI element detection
    const elements = await this.extractWithCoordinates(imagePath);

    // Find credentials
    const credentials = await this.findCredentials(text);

    // Find buttons
    const buttons = await this.findButtons(elements);

    // Find form fields
    const formFields = await this.findFormFields(elements);

    console.log(`[OCR] Found ${buttons.length} buttons, ${formFields.length} form fields`);
    if (credentials.clientId) {
      console.log(`[OCR] Detected ${credentials.provider} credentials`);
    }

    return {
      text,
      credentials,
      buttons,
      formFields,
      elements
    };
  }
}

module.exports = ScreenshotOCR;
