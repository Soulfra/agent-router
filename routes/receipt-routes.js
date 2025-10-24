/**
 * Receipt Upload & Parsing Routes
 *
 * Unified endpoints for receipt processing:
 * - Upload receipt images → OCR → Parse → Categorize
 * - Parse receipt text → Categorize
 * - Get expense breakdown by category
 *
 * Integrates:
 * - OCR Adapter (Tesseract + LLaVA)
 * - Receipt Parser (expense categorization)
 * - Badge system (category badges)
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

// Configure multer for receipt uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../receipts/uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `receipt-${timestamp}-${Math.random().toString(36).substr(2, 9)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (PNG/JPEG) and PDFs are allowed'));
    }
  }
});

/**
 * Initialize routes with dependencies
 */
function createReceiptRoutes({ ocrAdapter, receiptParser, db }) {
  if (!ocrAdapter || !receiptParser) {
    throw new Error('OCR adapter and receipt parser required');
  }

  // ============================================================================
  // RECEIPT IMAGE UPLOAD & SCAN
  // ============================================================================

  /**
   * POST /api/receipts/upload
   * Upload receipt image, OCR, and auto-categorize
   *
   * Body (multipart/form-data):
   * - receipt: Image file (PNG/JPEG/PDF)
   * - userId (optional): User ID for saving to database
   *
   * Response:
   * {
   *   "success": true,
   *   "receipt": {
   *     "merchant": "Bob's Burgers",
   *     "amount": "$42.50",
   *     "category": "Dining",
   *     "category_icon": "🍔",
   *     "category_badge": "badge expense-dining"
   *   },
   *   "ocr": {
   *     "text": "...",
   *     "confidence": 0.92
   *   }
   * }
   */
  router.post('/upload', upload.single('receipt'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No receipt image uploaded'
        });
      }

      const userId = req.body.userId || null;

      console.log(`[ReceiptRoutes] Processing receipt upload: ${req.file.path}`);

      // Step 1: OCR the image
      const ocrResult = await ocrAdapter.handle({
        operation: 'extract_text',
        context: {
          image_url: req.file.path,
          preprocessing: ['deskew', 'enhance', 'denoise']
        }
      });

      if (!ocrResult.text) {
        return res.status(400).json({
          success: false,
          error: 'Could not extract text from image',
          ocr_confidence: ocrResult.confidence
        });
      }

      console.log(`[ReceiptRoutes] OCR extracted ${ocrResult.text.length} characters`);

      // Step 2: Parse receipt from OCR text
      const message = {
        id: `upload_${Date.now()}`,
        from: 'receipt@upload.local',
        subject: 'Uploaded Receipt',
        body: ocrResult.enhanced_text || ocrResult.text,
        date: new Date().toISOString()
      };

      const receipt = await receiptParser.parseReceipt(message);

      // Step 3: Save to database if userId provided and db available
      if (userId && db && receipt) {
        try {
          await db.query(`
            INSERT INTO receipt_data (
              user_id,
              merchant,
              amount,
              order_id,
              receipt_date,
              expense_category,
              expense_category_name,
              expense_category_icon,
              expense_category_badge,
              ocr_text,
              ocr_confidence,
              image_path
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            userId,
            receipt.merchant,
            receipt.amount,
            receipt.order_id,
            receipt.receipt_date || new Date(),
            receipt.expense_category,
            receipt.expense_category_name,
            receipt.expense_category_icon,
            receipt.expense_category_badge,
            ocrResult.text,
            ocrResult.confidence,
            req.file.path
          ]);

          console.log(`[ReceiptRoutes] Saved receipt to database for user ${userId}`);
        } catch (dbError) {
          console.error('[ReceiptRoutes] Database save error:', dbError);
          // Continue anyway - don't fail the request
        }
      }

      res.json({
        success: true,
        receipt: receipt ? {
          merchant: receipt.merchant || 'Unknown',
          amount: receipt.amount || 'N/A',
          order_id: receipt.order_id || 'N/A',
          date: receipt.receipt_date || new Date().toISOString(),
          category: receipt.expense_category_name,
          category_icon: receipt.expense_category_icon,
          category_badge: receipt.expense_category_badge
        } : null,
        ocr: {
          text: ocrResult.text.substring(0, 500),
          confidence: ocrResult.confidence,
          enhanced: !!ocrResult.enhanced_text
        },
        saved_to_db: !!(userId && db && receipt)
      });

    } catch (error) {
      console.error('[ReceiptRoutes] Upload error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // RECEIPT TEXT PARSING
  // ============================================================================

  /**
   * POST /api/receipts/parse
   * Parse receipt from text (email, copy-paste, etc.)
   *
   * Body (JSON):
   * {
   *   "text": "Receipt text...",
   *   "merchant": "stripe|paypal|square|amazon|auto",
   *   "userId": "user123" // optional
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "receipt": {
   *     "merchant": "Stripe",
   *     "amount": "$29.00",
   *     "category": "Payment Processing",
   *     "category_icon": "💳",
   *     "category_badge": "badge expense-payment"
   *   }
   * }
   */
  router.post('/parse', async (req, res) => {
    try {
      const { text, merchant = 'auto', userId = null } = req.body;

      if (!text) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: text'
        });
      }

      // Create mock email message
      const message = {
        id: `text_${Date.now()}`,
        from: merchant !== 'auto' ? `noreply@${merchant}.com` : 'unknown@example.com',
        subject: 'Receipt',
        body: text,
        date: new Date().toISOString()
      };

      const receipt = await receiptParser.parseReceipt(message);

      if (!receipt) {
        return res.status(400).json({
          success: false,
          error: 'Could not parse receipt from text',
          suggestion: 'Upload an image using /api/receipts/upload instead'
        });
      }

      // Save to database if userId provided
      if (userId && db) {
        try {
          await db.query(`
            INSERT INTO receipt_data (
              user_id,
              merchant,
              amount,
              order_id,
              receipt_date,
              expense_category,
              expense_category_name,
              expense_category_icon,
              expense_category_badge,
              raw_text
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            userId,
            receipt.merchant,
            receipt.amount,
            receipt.order_id,
            receipt.receipt_date || new Date(),
            receipt.expense_category,
            receipt.expense_category_name,
            receipt.expense_category_icon,
            receipt.expense_category_badge,
            text
          ]);
        } catch (dbError) {
          console.error('[ReceiptRoutes] Database save error:', dbError);
        }
      }

      res.json({
        success: true,
        receipt: {
          merchant: receipt.merchant,
          amount: receipt.amount,
          order_id: receipt.order_id,
          date: receipt.receipt_date,
          category: receipt.expense_category_name,
          category_icon: receipt.expense_category_icon,
          category_badge: receipt.expense_category_badge
        },
        saved_to_db: !!(userId && db)
      });

    } catch (error) {
      console.error('[ReceiptRoutes] Parse error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // EXPENSE CATEGORIES
  // ============================================================================

  /**
   * GET /api/receipts/categories
   * Get all expense categories with badge info
   *
   * Response:
   * {
   *   "categories": [
   *     {
   *       "id": "dining",
   *       "name": "Dining",
   *       "icon": "🍔",
   *       "badgeClass": "badge expense-dining"
   *     },
   *     ...
   *   ]
   * }
   */
  router.get('/categories', async (req, res) => {
    try {
      const categories = receiptParser.getAllCategories();

      res.json({
        success: true,
        categories: categories.map(cat => ({
          id: cat.id,
          name: cat.name,
          icon: cat.icon,
          badgeClass: cat.badgeClass
        }))
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/receipts/breakdown/:userId
   * Get expense breakdown by category for a user
   *
   * Query params:
   * - startDate (optional): Filter start date
   * - endDate (optional): Filter end date
   *
   * Response:
   * {
   *   "breakdown": [
   *     {
   *       "category": "dining",
   *       "name": "Dining",
   *       "icon": "🍔",
   *       "badge": "badge expense-dining",
   *       "total": 250.00,
   *       "count": 8
   *     },
   *     ...
   *   ]
   * }
   */
  router.get('/breakdown/:userId', async (req, res) => {
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      const breakdown = await receiptParser.getCategoryBreakdown(userId, {
        startDate,
        endDate
      });

      res.json({
        success: true,
        breakdown: breakdown.map(row => ({
          category: row.expense_category,
          name: row.expense_category_name,
          icon: row.expense_category_icon,
          badge: row.expense_category_badge,
          total: parseFloat(row.total_amount) || 0,
          count: parseInt(row.receipt_count) || 0,
          avg: parseFloat(row.avg_amount) || 0
        }))
      });

    } catch (error) {
      console.error('[ReceiptRoutes] Breakdown error:', error);
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
   * GET /api/receipts/health
   * Check receipt processing system health
   */
  router.get('/health', async (req, res) => {
    const status = {
      success: true,
      services: {}
    };

    // Check OCR
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      await execAsync('tesseract --version');
      status.services.ocr = 'operational';
    } catch (error) {
      status.services.ocr = 'tesseract_not_installed';
      status.warning = 'Install Tesseract: brew install tesseract';
    }

    // Check receipt parser
    status.services.receipt_parser = receiptParser ? 'operational' : 'unavailable';

    // Check database
    status.services.database = db ? 'operational' : 'unavailable';

    res.json(status);
  });

  return router;
}

module.exports = createReceiptRoutes;
