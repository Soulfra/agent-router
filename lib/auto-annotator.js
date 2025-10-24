const ScreenshotOCR = require('./screenshot-ocr');

/**
 * Automatically generates annotations from OCR-detected UI elements
 * Creates boxes, arrows, and text labels based on buttons and form fields
 */
class AutoAnnotator {
  constructor() {
    this.ocr = new ScreenshotOCR();
  }

  /**
   * Generate annotations from a screenshot using OCR
   * @param {string} imagePath - Path to screenshot
   * @param {Object} options - Annotation options
   * @returns {Promise<Array>} Array of annotation objects for screenshot-annotator
   */
  async annotateFromOCR(imagePath, options = {}) {
    const {
      highlightButtons = true,
      highlightFormFields = true,
      highlightCredentials = true,
      stepNumber = 1,
      stepTitle = ''
    } = options;

    console.log(`[AutoAnnotator] Analyzing ${imagePath}...`);

    // Extract all information from screenshot
    const ocrData = await this.ocr.processScreenshot(imagePath);

    const annotations = [];

    // Add title annotation if provided
    if (stepTitle) {
      annotations.push(this.createTitleAnnotation(stepTitle, stepNumber));
    }

    // Highlight buttons
    if (highlightButtons && ocrData.buttons.length > 0) {
      console.log(`[AutoAnnotator] Found ${ocrData.buttons.length} buttons`);
      for (const button of ocrData.buttons) {
        annotations.push(this.createButtonAnnotation(button, stepNumber));
      }
    }

    // Highlight form fields
    if (highlightFormFields && ocrData.formFields.length > 0) {
      console.log(`[AutoAnnotator] Found ${ocrData.formFields.length} form fields`);
      for (const field of ocrData.formFields) {
        annotations.push(this.createFormAnnotation(field, stepNumber));
      }
    }

    // Highlight credentials
    if (highlightCredentials && (ocrData.credentials.clientId || ocrData.credentials.clientSecret)) {
      console.log(`[AutoAnnotator] Found credentials for ${ocrData.credentials.provider}`);

      // Find credential locations in OCR elements
      const credElements = this.findCredentialLocations(ocrData.elements, ocrData.credentials);

      for (const credElement of credElements) {
        annotations.push(this.createCredentialAnnotation(credElement, stepNumber));
      }
    }

    console.log(`[AutoAnnotator] Generated ${annotations.length} annotations`);
    return annotations;
  }

  /**
   * Create title annotation at top of image
   * @param {string} title - Step title
   * @param {number} stepNumber - Step number
   * @returns {Object} Title annotation
   */
  createTitleAnnotation(title, stepNumber) {
    return {
      type: 'text',
      position: { x: 20, y: 20, width: 800, height: 60 },
      color: '#ffffff',
      text: `Step ${stepNumber}: ${title}`,
      font_size: 24,
      font_weight: 'bold',
      background_color: 'rgba(0, 0, 0, 0.7)',
      padding: 10
    };
  }

  /**
   * Create pulsing box annotation for clickable button
   * @param {Object} button - Button data from OCR
   * @param {number} stepNumber - Step number
   * @returns {Object} Button annotation
   */
  createButtonAnnotation(button, stepNumber) {
    // Expand bounding box slightly for better visibility
    const padding = 10;

    return {
      type: 'box',
      position: {
        x: Math.max(0, button.bbox.x - padding),
        y: Math.max(0, button.bbox.y - padding),
        width: button.bbox.width + padding * 2,
        height: button.bbox.height + padding * 2
      },
      color: '#00ff00', // Green for action items
      width: 4,
      borderRadius: 8,
      style: 'pulse', // Pulsing animation to draw attention
      text: `Click "${button.text}"`,
      text_position: 'top', // Place label above the box
      font_size: 16,
      font_weight: 'bold'
    };
  }

  /**
   * Create blue box annotation for form field
   * @param {Object} field - Form field data from OCR
   * @param {number} stepNumber - Step number
   * @returns {Object} Form field annotation
   */
  createFormAnnotation(field, stepNumber) {
    const padding = 8;

    return {
      type: 'box',
      position: {
        x: Math.max(0, field.bbox.x - padding),
        y: Math.max(0, field.bbox.y - padding),
        width: field.bbox.width + padding * 2,
        height: field.bbox.height + padding * 2
      },
      color: '#0099ff', // Blue for form fields
      width: 3,
      borderRadius: 6,
      style: 'dashed',
      text: `Fill: ${field.label}`,
      text_position: 'left',
      font_size: 14
    };
  }

  /**
   * Create yellow highlight annotation for credentials
   * @param {Object} credElement - Credential element with location
   * @param {number} stepNumber - Step number
   * @returns {Object} Credential annotation
   */
  createCredentialAnnotation(credElement, stepNumber) {
    const padding = 12;

    return {
      type: 'box',
      position: {
        x: Math.max(0, credElement.bbox.x - padding),
        y: Math.max(0, credElement.bbox.y - padding),
        width: credElement.bbox.width + padding * 2,
        height: credElement.bbox.height + padding * 2
      },
      color: '#ffcc00', // Yellow for credentials
      width: 5,
      borderRadius: 10,
      style: 'pulse', // Pulse to emphasize importance
      text: `Copy ${credElement.type}`,
      text_position: 'bottom',
      font_size: 16,
      font_weight: 'bold',
      background_color: 'rgba(255, 204, 0, 0.2)' // Subtle yellow highlight
    };
  }

  /**
   * Find locations of credentials in OCR elements
   * @param {Array} elements - OCR elements with coordinates
   * @param {Object} credentials - Detected credentials
   * @returns {Array} Elements containing credentials with type labels
   */
  findCredentialLocations(elements, credentials) {
    const credElements = [];

    if (credentials.clientId) {
      // Find element containing client ID
      const clientIdElement = this.findElementContainingText(elements, credentials.clientId);
      if (clientIdElement) {
        credElements.push({
          ...clientIdElement,
          type: 'Client ID',
          value: credentials.clientId
        });
      }
    }

    if (credentials.clientSecret) {
      // Find element containing client secret
      const clientSecretElement = this.findElementContainingText(elements, credentials.clientSecret);
      if (clientSecretElement) {
        credElements.push({
          ...clientSecretElement,
          type: 'Client Secret',
          value: credentials.clientSecret
        });
      }
    }

    return credElements;
  }

  /**
   * Find OCR element containing specific text
   * @param {Array} elements - OCR elements
   * @param {string} searchText - Text to find
   * @returns {Object|null} Element with bounding box
   */
  findElementContainingText(elements, searchText) {
    // Look for exact match first
    for (const element of elements) {
      if (element.text === searchText) {
        return element;
      }
    }

    // Look for partial match (in case OCR split the text)
    const searchWords = searchText.split(/[\s._-]+/);
    const matches = [];

    for (const word of searchWords) {
      const match = elements.find(el => el.text.includes(word));
      if (match) {
        matches.push(match);
      }
    }

    // If we found multiple matches near each other, combine them
    if (matches.length > 0) {
      const minX = Math.min(...matches.map(el => el.bbox.x));
      const minY = Math.min(...matches.map(el => el.bbox.y));
      const maxX = Math.max(...matches.map(el => el.bbox.x + el.bbox.width));
      const maxY = Math.max(...matches.map(el => el.bbox.y + el.bbox.height));

      return {
        text: searchText,
        bbox: {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        },
        confidence: Math.max(...matches.map(el => el.confidence))
      };
    }

    return null;
  }

  /**
   * Create arrow pointing to an element
   * @param {Object} targetElement - Element to point at
   * @param {string} label - Arrow label
   * @param {string} direction - Arrow direction (top, bottom, left, right)
   * @returns {Object} Arrow annotation
   */
  createArrowAnnotation(targetElement, label, direction = 'top') {
    const arrowLength = 100;
    const targetX = targetElement.bbox.x + targetElement.bbox.width / 2;
    const targetY = targetElement.bbox.y + targetElement.bbox.height / 2;

    let startX, startY, endX, endY;

    switch (direction) {
      case 'top':
        startX = targetX;
        startY = targetElement.bbox.y - arrowLength;
        endX = targetX;
        endY = targetElement.bbox.y;
        break;
      case 'bottom':
        startX = targetX;
        startY = targetElement.bbox.y + targetElement.bbox.height + arrowLength;
        endX = targetX;
        endY = targetElement.bbox.y + targetElement.bbox.height;
        break;
      case 'left':
        startX = targetElement.bbox.x - arrowLength;
        startY = targetY;
        endX = targetElement.bbox.x;
        endY = targetY;
        break;
      case 'right':
        startX = targetElement.bbox.x + targetElement.bbox.width + arrowLength;
        startY = targetY;
        endX = targetElement.bbox.x + targetElement.bbox.width;
        endY = targetY;
        break;
    }

    return {
      type: 'arrow',
      from: { x: startX, y: startY },
      to: { x: endX, y: endY },
      color: '#ff0066',
      width: 4,
      text: label,
      font_size: 14,
      font_weight: 'bold'
    };
  }

  /**
   * Generate sequential annotations for multi-step tutorial
   * @param {Array} screenshots - Array of screenshot paths
   * @param {Array} stepTitles - Title for each step
   * @returns {Promise<Array>} Array of {path, annotations} for each screenshot
   */
  async generateTutorialAnnotations(screenshots, stepTitles = []) {
    const results = [];

    for (let i = 0; i < screenshots.length; i++) {
      const screenshot = screenshots[i];
      const stepNumber = i + 1;
      const stepTitle = stepTitles[i] || `Step ${stepNumber}`;

      console.log(`[AutoAnnotator] Processing step ${stepNumber}: ${stepTitle}`);

      const annotations = await this.annotateFromOCR(screenshot, {
        stepNumber,
        stepTitle,
        highlightButtons: true,
        highlightFormFields: true,
        highlightCredentials: true
      });

      results.push({
        path: screenshot,
        stepNumber,
        stepTitle,
        annotations
      });
    }

    return results;
  }
}

module.exports = AutoAnnotator;
