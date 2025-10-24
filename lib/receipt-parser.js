/**
 * Receipt Parser
 *
 * Parses email receipts from Gmail to extract structured data:
 * - Order ID, amount, date
 * - Product/service purchased
 * - Payment method
 * - Merchant information
 * - Transaction metadata
 * - Expense category (with badge styling)
 *
 * Supports receipts from:
 * - Stripe
 * - PayPal
 * - Square
 * - Amazon
 * - Generic email receipts
 */

class ReceiptParser {
  constructor(options = {}) {
    this.db = options.db;

    // Expense category definitions
    this.expenseCategories = {
      payment: {
        id: 'payment',
        name: 'Payment Processing',
        icon: '💳',
        badgeClass: 'badge expense-payment',
        keywords: ['stripe', 'paypal', 'square', 'payment', 'processing fee', 'transaction fee']
      },
      shipping: {
        id: 'shipping',
        name: 'Shipping',
        icon: '📦',
        badgeClass: 'badge expense-shipping',
        keywords: ['shipping', 'delivery', 'fedex', 'ups', 'usps', 'dhl', 'freight']
      },
      dining: {
        id: 'dining',
        name: 'Dining',
        icon: '🍔',
        badgeClass: 'badge expense-dining',
        keywords: ['restaurant', 'cafe', 'coffee', 'doordash', 'ubereats', 'grubhub', 'dining']
      },
      creative: {
        id: 'creative',
        name: 'Creative Services',
        icon: '🎨',
        badgeClass: 'badge expense-creative',
        keywords: ['design', 'creative', 'fiverr', 'upwork', 'freelancer', 'art', 'photography']
      },
      subscription: {
        id: 'subscription',
        name: 'Subscription',
        icon: '🔄',
        badgeClass: 'badge expense-subscription',
        keywords: ['subscription', 'monthly', 'annual', 'recurring', 'netflix', 'spotify', 'adobe']
      },
      software: {
        id: 'software',
        name: 'Software',
        icon: '💻',
        badgeClass: 'badge expense-software',
        keywords: ['software', 'saas', 'license', 'api', 'hosting', 'domain', 'aws', 'github']
      },
      retail: {
        id: 'retail',
        name: 'Retail',
        icon: '🛒',
        badgeClass: 'badge expense-retail',
        keywords: ['amazon', 'walmart', 'target', 'retail', 'purchase', 'order']
      },
      travel: {
        id: 'travel',
        name: 'Travel',
        icon: '✈️',
        badgeClass: 'badge expense-travel',
        keywords: ['airline', 'hotel', 'airbnb', 'uber', 'lyft', 'rental car', 'travel']
      },
      utilities: {
        id: 'utilities',
        name: 'Utilities',
        icon: '⚡',
        badgeClass: 'badge expense-utilities',
        keywords: ['electric', 'gas', 'water', 'internet', 'phone', 'utility']
      },
      other: {
        id: 'other',
        name: 'Other',
        icon: '📄',
        badgeClass: 'badge expense-other',
        keywords: []
      }
    };

    // Merchant patterns for detection
    this.merchantPatterns = {
      stripe: {
        from: /@stripe\.com$/i,
        subject: /receipt|payment|invoice/i,
        patterns: {
          amount: /\$([0-9,]+\.\d{2})/,
          orderId: /Payment ID[:\s]+([a-z0-9_]+)/i,
          date: /Date[:\s]+([A-Za-z]+\s+\d+,\s+\d{4})/i
        }
      },
      paypal: {
        from: /@paypal\.com$/i,
        subject: /receipt|payment|sent/i,
        patterns: {
          amount: /\$([0-9,]+\.\d{2})/,
          orderId: /Transaction ID[:\s]+([A-Z0-9]+)/i,
          date: /Date[:\s]+([A-Za-z]+\s+\d+,\s+\d{4})/i
        }
      },
      square: {
        from: /@messaging\.squareup\.com$/i,
        subject: /receipt/i,
        patterns: {
          amount: /\$([0-9,]+\.\d{2})/,
          orderId: /Receipt #([A-Z0-9-]+)/i,
          date: /(\d{1,2}\/\d{1,2}\/\d{4})/
        }
      },
      amazon: {
        from: /@amazon\.com$/i,
        subject: /order|shipment|delivery/i,
        patterns: {
          amount: /Order Total[:\s]+\$([0-9,]+\.\d{2})/i,
          orderId: /Order #([0-9-]+)/i,
          date: /Order Date[:\s]+([A-Za-z]+\s+\d+,\s+\d{4})/i
        }
      }
    };
  }

  /**
   * Parse receipt from email message
   *
   * @param {object} message - Normalized email message
   * @returns {object} - Parsed receipt data
   */
  async parseReceipt(message) {
    try {
      // Detect merchant
      const merchant = this.detectMerchant(message);

      if (!merchant) {
        console.log('[ReceiptParser] Could not detect merchant');
        return null;
      }

      console.log(`[ReceiptParser] Detected merchant: ${merchant}`);

      // Extract receipt data based on merchant
      const receipt = await this.extractReceiptData(message, merchant);

      if (!receipt) {
        console.log('[ReceiptParser] Could not extract receipt data');
        return null;
      }

      // Detect expense category
      const category = this.detectExpenseCategory(receipt, message);
      receipt.expense_category = category.id;
      receipt.expense_category_name = category.name;
      receipt.expense_category_icon = category.icon;
      receipt.expense_category_badge = category.badgeClass;

      // Enrich with additional metadata
      receipt.email_id = message.id;
      receipt.email_from = message.from;
      receipt.email_subject = message.subject;
      receipt.received_at = message.date;
      receipt.parsed_at = new Date();

      return receipt;

    } catch (error) {
      console.error('[ReceiptParser] Error parsing receipt:', error);
      return null;
    }
  }

  /**
   * Detect merchant from email metadata
   *
   * @param {object} message - Email message
   * @returns {string|null} - Merchant name
   */
  detectMerchant(message) {
    for (const [merchant, config] of Object.entries(this.merchantPatterns)) {
      if (config.from.test(message.from) && config.subject.test(message.subject)) {
        return merchant;
      }
    }

    // Check for generic receipt indicators
    if (this.looksLikeReceipt(message)) {
      return 'generic';
    }

    return null;
  }

  /**
   * Check if email looks like a receipt
   *
   * @param {object} message - Email message
   * @returns {boolean}
   */
  looksLikeReceipt(message) {
    const receiptKeywords = [
      'receipt', 'invoice', 'payment', 'order', 'purchase',
      'transaction', 'confirmation', 'thank you for your order'
    ];

    const text = `${message.subject} ${message.body}`.toLowerCase();

    return receiptKeywords.some(keyword => text.includes(keyword)) &&
           /\$[0-9,]+\.\d{2}/.test(text); // Contains dollar amount
  }

  /**
   * Extract receipt data from message
   *
   * @param {object} message - Email message
   * @param {string} merchant - Detected merchant
   * @returns {object} - Extracted receipt data
   */
  async extractReceiptData(message, merchant) {
    const text = `${message.subject}\n${message.body}`;

    const config = this.merchantPatterns[merchant];

    if (!config) {
      // Generic extraction
      return this.genericExtraction(text);
    }

    const receipt = {
      merchant,
      amount: null,
      order_id: null,
      date: null,
      currency: 'USD',
      items: [],
      payment_method: null,
      status: 'completed'
    };

    // Extract amount
    const amountMatch = text.match(config.patterns.amount);
    if (amountMatch) {
      receipt.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      receipt.amount_cents = Math.round(receipt.amount * 100);
    }

    // Extract order ID
    const orderIdMatch = text.match(config.patterns.orderId);
    if (orderIdMatch) {
      receipt.order_id = orderIdMatch[1];
    }

    // Extract date
    const dateMatch = text.match(config.patterns.date);
    if (dateMatch) {
      receipt.date = new Date(dateMatch[1]);
    }

    // Extract payment method
    receipt.payment_method = this.extractPaymentMethod(text);

    // Extract items (if possible)
    receipt.items = this.extractItems(text, merchant);

    return receipt;
  }

  /**
   * Generic extraction for unknown merchants
   *
   * @param {string} text - Email text
   * @returns {object} - Extracted data
   */
  genericExtraction(text) {
    const receipt = {
      merchant: 'unknown',
      amount: null,
      order_id: null,
      date: null,
      currency: 'USD',
      items: [],
      payment_method: null,
      status: 'completed'
    };

    // Extract amount (first dollar amount found)
    const amountMatch = text.match(/\$([0-9,]+\.\d{2})/);
    if (amountMatch) {
      receipt.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      receipt.amount_cents = Math.round(receipt.amount * 100);
    }

    // Extract order/transaction ID
    const orderIdPatterns = [
      /Order #([A-Z0-9-]+)/i,
      /Transaction[:\s]+([A-Z0-9-]+)/i,
      /Invoice[:\s]+([A-Z0-9-]+)/i,
      /Receipt[:\s]+([A-Z0-9-]+)/i
    ];

    for (const pattern of orderIdPatterns) {
      const match = text.match(pattern);
      if (match) {
        receipt.order_id = match[1];
        break;
      }
    }

    // Extract date
    const datePatterns = [
      /Date[:\s]+([A-Za-z]+\s+\d+,\s+\d{4})/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})/,
      /(\d{4}-\d{2}-\d{2})/
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        receipt.date = new Date(match[1]);
        break;
      }
    }

    return receipt;
  }

  /**
   * Extract payment method from text
   *
   * @param {string} text - Email text
   * @returns {string|null} - Payment method
   */
  extractPaymentMethod(text) {
    const patterns = {
      'visa': /visa.*\d{4}|card ending in \d{4}.*visa/i,
      'mastercard': /mastercard.*\d{4}|card ending in \d{4}.*mastercard/i,
      'amex': /american express.*\d{4}|amex.*\d{4}/i,
      'discover': /discover.*\d{4}/i,
      'paypal': /paypal/i,
      'ach': /bank account|ach|direct debit/i,
      'crypto': /bitcoin|ethereum|crypto|btc|eth/i
    };

    for (const [method, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return method;
      }
    }

    return null;
  }

  /**
   * Extract purchased items from text
   *
   * @param {string} text - Email text
   * @param {string} merchant - Merchant name
   * @returns {array} - Array of items
   */
  extractItems(text, merchant) {
    const items = [];

    // This is merchant-specific and would require more sophisticated parsing
    // For now, return empty array
    // TODO: Implement item extraction per merchant

    return items;
  }

  /**
   * Save parsed receipt to database
   *
   * @param {object} receipt - Parsed receipt
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Saved receipt
   */
  async saveReceipt(receipt, userId) {
    try {
      const result = await this.db.query(`
        INSERT INTO receipt_data (
          user_id,
          email_id,
          merchant,
          order_id,
          amount_cents,
          currency,
          payment_method,
          status,
          items,
          receipt_date,
          email_from,
          email_subject,
          received_at,
          parsed_at,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `, [
        userId,
        receipt.email_id,
        receipt.merchant,
        receipt.order_id,
        receipt.amount_cents,
        receipt.currency,
        receipt.payment_method,
        receipt.status,
        JSON.stringify(receipt.items),
        receipt.date,
        receipt.email_from,
        receipt.email_subject,
        receipt.received_at,
        receipt.parsed_at,
        JSON.stringify({})
      ]);

      return result.rows[0];

    } catch (error) {
      console.error('[ReceiptParser] Error saving receipt:', error);
      throw error;
    }
  }

  /**
   * Batch parse receipts from email messages
   *
   * @param {array} messages - Array of email messages
   * @param {string} userId - User ID
   * @returns {Promise<array>} - Array of parsed receipts
   */
  async batchParseReceipts(messages, userId) {
    const receipts = [];

    for (const message of messages) {
      try {
        const receipt = await this.parseReceipt(message);

        if (receipt) {
          const saved = await this.saveReceipt(receipt, userId);
          receipts.push(saved);
        }
      } catch (error) {
        console.error(`[ReceiptParser] Error processing message ${message.id}:`, error);
      }
    }

    return receipts;
  }

  /**
   * Match receipt to affiliate referral
   *
   * @param {object} receipt - Parsed receipt
   * @param {string} userId - User ID
   * @returns {Promise<object|null>} - Matched referral
   */
  async matchToAffiliate(receipt, userId) {
    try {
      // Find recent referral for user (within 30-day cookie window)
      const result = await this.db.query(`
        SELECT ar.*
        FROM affiliate_referrals ar
        WHERE ar.referred_user_id = $1
          AND ar.status = 'pending'
          AND ar.created_at >= NOW() - INTERVAL '30 days'
        ORDER BY ar.created_at DESC
        LIMIT 1
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const referral = result.rows[0];

      // Update referral with purchase data
      await this.db.query(`
        UPDATE affiliate_referrals
        SET status = 'converted',
            purchase_amount_cents = $1,
            purchase_date = $2,
            order_id = $3,
            converted_at = NOW()
        WHERE referral_id = $4
      `, [
        receipt.amount_cents,
        receipt.date,
        receipt.order_id,
        referral.referral_id
      ]);

      console.log(`[ReceiptParser] Matched receipt to affiliate referral ${referral.referral_id}`);

      return referral;

    } catch (error) {
      console.error('[ReceiptParser] Error matching to affiliate:', error);
      return null;
    }
  }

  /**
   * Get receipt statistics for user
   *
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Receipt stats
   */
  async getUserReceiptStats(userId) {
    try {
      const result = await this.db.query(`
        SELECT
          COUNT(*) as total_receipts,
          SUM(amount_cents) as total_spent_cents,
          AVG(amount_cents) as avg_purchase_cents,
          MIN(receipt_date) as first_purchase,
          MAX(receipt_date) as last_purchase,
          array_agg(DISTINCT merchant) as merchants_used
        FROM receipt_data
        WHERE user_id = $1
      `, [userId]);

      return result.rows[0];

    } catch (error) {
      console.error('[ReceiptParser] Error getting stats:', error);
      return null;
    }
  }

  /**
   * Detect expense category from receipt data
   *
   * @param {object} receipt - Parsed receipt data
   * @param {object} message - Original email message
   * @returns {object} - Expense category details
   */
  detectExpenseCategory(receipt, message) {
    const text = `
      ${receipt.merchant || ''}
      ${message.from || ''}
      ${message.subject || ''}
      ${message.body || ''}
      ${receipt.description || ''}
    `.toLowerCase();

    // Check each category's keywords
    for (const [categoryId, category] of Object.entries(this.expenseCategories)) {
      if (categoryId === 'other') continue; // Skip 'other' for now

      for (const keyword of category.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          console.log(`[ReceiptParser] Detected category: ${category.name} (keyword: ${keyword})`);
          return category;
        }
      }
    }

    // Default to 'other'
    console.log('[ReceiptParser] No category match, defaulting to Other');
    return this.expenseCategories.other;
  }

  /**
   * Get all expense categories
   *
   * @returns {array} - List of all categories
   */
  getAllCategories() {
    return Object.values(this.expenseCategories);
  }

  /**
   * Get receipts by category
   *
   * @param {string} userId - User ID
   * @param {string} categoryId - Category ID
   * @returns {Promise<array>} - Receipts in category
   */
  async getReceiptsByCategory(userId, categoryId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(`
        SELECT *
        FROM receipt_data
        WHERE user_id = $1
          AND expense_category = $2
        ORDER BY receipt_date DESC
      `, [userId, categoryId]);

      return result.rows;

    } catch (error) {
      console.error('[ReceiptParser] Error getting receipts by category:', error);
      return [];
    }
  }

  /**
   * Get expense breakdown by category
   *
   * @param {string} userId - User ID
   * @param {object} options - Query options
   * @returns {Promise<array>} - Category breakdown
   */
  async getCategoryBreakdown(userId, options = {}) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const {
        startDate = null,
        endDate = null
      } = options;

      let query = `
        SELECT
          expense_category,
          expense_category_name,
          expense_category_icon,
          expense_category_badge,
          COUNT(*) as receipt_count,
          SUM(amount) as total_amount,
          AVG(amount) as avg_amount,
          MIN(receipt_date) as first_purchase,
          MAX(receipt_date) as last_purchase
        FROM receipt_data
        WHERE user_id = $1
      `;

      const params = [userId];
      let paramIndex = 2;

      if (startDate) {
        query += ` AND receipt_date >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND receipt_date <= $${paramIndex++}`;
        params.push(endDate);
      }

      query += `
        GROUP BY expense_category, expense_category_name, expense_category_icon, expense_category_badge
        ORDER BY total_amount DESC
      `;

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[ReceiptParser] Error getting category breakdown:', error);
      return [];
    }
  }
}

module.exports = ReceiptParser;
