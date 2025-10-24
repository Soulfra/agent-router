/**
 * OCR Service Routes
 *
 * RESTful API for OCR and visual processing using the OCR Adapter.
 * Handles text extraction, image-to-markdown, map analysis, and image description.
 *
 * Requires Tesseract OCR installed: brew install tesseract (macOS) or apt install tesseract-ocr (Linux)
 *
 * Uses port 11436 (Gaming/Visual Models with OCR)
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: '/tmp/calos-ocr-uploads/' });

/**
 * Initialize routes with dependencies
 */
function createOCRRoutes({ ocrAdapter }) {
  if (!ocrAdapter) {
    throw new Error('OCRAdapter required for OCR routes');
  }

  // ============================================================================
  // TEXT EXTRACTION
  // ============================================================================

  /**
   * POST /api/ocr/extract-text
   * Extract text from image using Tesseract OCR
   *
   * Request body:
   * {
   *   "image_url": "https://example.com/image.png",
   *   OR
   *   "image_base64": "data:image/png;base64,...",
   *   "language": "eng", // optional
   *   "preprocessing": ["deskew", "enhance", "denoise"] // optional
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "text": "Extracted text from image",
   *   "enhanced_text": "LLM-corrected text (OCR errors fixed)",
   *   "confidence": 0.92,
   *   "bounding_boxes": [
   *     { "text": "Hello", "x": 10, "y": 20, "w": 50, "h": 20, "confidence": 0.95 }
   *   ],
   *   "language": "eng",
   *   "preprocessing_applied": ["deskew", "enhance"]
   * }
   */
  router.post('/extract-text', async (req, res) => {
    try {
      const { image_url, image_base64, language, preprocessing, custom_prompt } = req.body;

      if (!image_url && !image_base64) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: image_url or image_base64'
        });
      }

      const result = await ocrAdapter.handle({
        operation: 'extract_text',
        context: { image_url, image_base64, language, preprocessing },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[OCRRoutes] Extract text error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/ocr/extract-text/upload
   * Extract text from uploaded image file
   */
  router.post('/extract-text/upload', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const { language, preprocessing } = req.body;

      const result = await ocrAdapter.handle({
        operation: 'extract_text',
        context: {
          image_url: req.file.path, // Local file path
          language: language || 'eng',
          preprocessing: preprocessing ? JSON.parse(preprocessing) : ['deskew', 'enhance']
        }
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[OCRRoutes] Extract text upload error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // IMAGE TO MARKDOWN
  // ============================================================================

  /**
   * POST /api/ocr/image-to-markdown
   * Convert image (screenshot, document) to markdown
   *
   * Request body:
   * {
   *   "image_url": "https://example.com/screenshot.png",
   *   "document_type": "general" // general, code, table, form
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "markdown": "# Title\n\nContent...",
   *   "structure": {
   *     "headings": ["Title", "Section 1"],
   *     "sections": 3,
   *     "has_code": false,
   *     "has_tables": true
   *   },
   *   "original_ocr": { ... }
   * }
   */
  router.post('/image-to-markdown', async (req, res) => {
    try {
      const { image_url, image_base64, document_type, custom_prompt } = req.body;

      if (!image_url && !image_base64) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: image_url or image_base64'
        });
      }

      const result = await ocrAdapter.handle({
        operation: 'image_to_markdown',
        context: { image_url, image_base64, document_type },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[OCRRoutes] Image to markdown error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // VISUAL TRANSLATION
  // ============================================================================

  /**
   * POST /api/ocr/translate
   * Translate text from image
   *
   * Request body:
   * {
   *   "image_url": "https://example.com/french-sign.png",
   *   "target_language": "English",
   *   "preserve_formatting": true
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "translated_text": "Welcome to our restaurant",
   *   "source_language_detected": "French",
   *   "confidence": 0.95,
   *   "original_text": "Bienvenue dans notre restaurant"
   * }
   */
  router.post('/translate', async (req, res) => {
    try {
      const { image_url, image_base64, target_language, preserve_formatting, custom_prompt } = req.body;

      if (!image_url && !image_base64) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: image_url or image_base64'
        });
      }

      const result = await ocrAdapter.handle({
        operation: 'translate_visual',
        context: { image_url, image_base64, target_language, preserve_formatting },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[OCRRoutes] Translate error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // GAME MAP ANALYSIS
  // ============================================================================

  /**
   * POST /api/ocr/analyze-map
   * Extract data from game map screenshot
   *
   * Request body:
   * {
   *   "image_url": "https://example.com/game-map.png",
   *   "extract_locations": true,
   *   "extract_labels": true
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "locations": [
   *     { "name": "Hollowtown Square", "x": 120, "y": 80 }
   *   ],
   *   "npcs": [
   *     { "name": "Shopkeeper", "x": 50, "y": 100 }
   *   ],
   *   "pois": [
   *     { "type": "shop", "name": "General Store", "x": 55, "y": 95 }
   *   ],
   *   "ocr_confidence": 0.87,
   *   "raw_ocr_text": "..."
   * }
   */
  router.post('/analyze-map', async (req, res) => {
    try {
      const { image_url, image_base64, extract_locations, extract_labels, custom_prompt } = req.body;

      if (!image_url && !image_base64) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: image_url or image_base64'
        });
      }

      const result = await ocrAdapter.handle({
        operation: 'analyze_map',
        context: { image_url, image_base64, extract_locations, extract_labels },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[OCRRoutes] Analyze map error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // IMAGE DESCRIPTION (Vision Models)
  // ============================================================================

  /**
   * POST /api/ocr/describe-image
   * Describe image using vision models (llava)
   *
   * Request body:
   * {
   *   "image_url": "https://example.com/photo.jpg",
   *   "detail_level": "medium" // low, medium, high
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "description": "A person standing in front of a mountain...",
   *   "main_subjects": ["person", "mountain", "sky"],
   *   "colors": ["blue", "green", "white"],
   *   "mood": "peaceful",
   *   "text_detected": "Welcome to Nature"
   * }
   */
  router.post('/describe-image', async (req, res) => {
    try {
      const { image_url, image_base64, detail_level, custom_prompt } = req.body;

      if (!image_url && !image_base64) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: image_url or image_base64'
        });
      }

      const result = await ocrAdapter.handle({
        operation: 'describe_image',
        context: { image_url, image_base64, detail_level },
        prompt: custom_prompt
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[OCRRoutes] Describe image error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  /**
   * GET /api/ocr/health
   * Check if OCR service is operational
   */
  router.get('/health', async (req, res) => {
    try {
      // Check if Tesseract is installed
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);

      try {
        await execAsync('tesseract --version');
        res.json({
          success: true,
          service: 'ocr',
          port: 11436,
          status: 'operational',
          tesseract: 'installed'
        });
      } catch (tesseractError) {
        res.json({
          success: true,
          service: 'ocr',
          port: 11436,
          status: 'degraded',
          tesseract: 'not_installed',
          warning: 'Tesseract OCR is not installed. Text extraction will fail. Install: brew install tesseract (macOS) or apt install tesseract-ocr (Linux)'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createOCRRoutes;
