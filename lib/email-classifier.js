/**
 * AI Email Classifier
 *
 * Intelligently routes emails into categories using local Ollama
 * Learns from user corrections to improve accuracy over time
 * BinaryTree-style invisible routing with drag-and-drop corrections
 */

const axios = require('axios');

class EmailClassifier {
  constructor(db, options = {}) {
    this.db = db;

    // Ollama configuration
    this.ollamaUrl = options.ollamaUrl || 'http://localhost:11434';
    this.model = options.model || 'calos-model:latest';

    // Classification settings
    this.confidenceThreshold = options.confidenceThreshold || 0.6;
    this.useRulesFirst = options.useRulesFirst !== false; // Try rules before AI
    this.categories = options.categories || [
      'work',
      'personal',
      'side_project',
      'urgent',
      'marketing',
      'spam'
    ];
  }

  /**
   * Classify an email message
   *
   * 1. Try existing routing rules first (fast)
   * 2. Fall back to AI classification if no rule matches
   * 3. Store classification with confidence score
   */
  async classify(messageId) {
    try {
      // Get message details
      const message = await this.getMessage(messageId);

      if (!message) {
        throw new Error(`Message not found: ${messageId}`);
      }

      console.log(`\n[Classifier] Classifying message: "${message.subject}"`);
      console.log(`[Classifier] From: ${message.from_address}`);

      // Step 1: Try routing rules first (fast path)
      if (this.useRulesFirst) {
        const ruleMatch = await this.matchRoutingRule(message);

        if (ruleMatch) {
          console.log(`[Classifier] ✓ Matched rule #${ruleMatch.rule_id} (${ruleMatch.category})`);
          await this.applyRule(messageId, ruleMatch.rule_id);
          return {
            category: ruleMatch.category,
            confidence: ruleMatch.confidence,
            method: 'rule',
            ruleId: ruleMatch.rule_id
          };
        }
      }

      // Step 2: AI classification (slower, more flexible)
      console.log('[Classifier] No rule matched, using AI...');
      const aiResult = await this.classifyWithAI(message);

      // Store AI classification
      await this.storeClassification(messageId, aiResult);

      // If confidence is high, consider creating a rule
      if (aiResult.confidence >= 0.8) {
        await this.considerNewRule(message, aiResult);
      }

      return aiResult;

    } catch (error) {
      console.error('[Classifier] Error:', error.message);
      throw error;
    }
  }

  /**
   * Match message against existing routing rules
   */
  async matchRoutingRule(message) {
    const result = await this.db.query(`
      SELECT
        id as rule_id,
        rule_type,
        pattern,
        target_category as category,
        confidence,
        priority
      FROM email_routing_rules
      WHERE user_id = (
        SELECT user_id FROM email_accounts WHERE id = $1
      )
      AND is_active = true
      ORDER BY priority DESC, confidence DESC
    `, [message.account_id]);

    const rules = result.rows;

    // Try each rule in priority order
    for (const rule of rules) {
      const matches = this.testRule(rule, message);

      if (matches) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Test if a rule matches a message
   */
  testRule(rule, message) {
    const pattern = rule.pattern.toLowerCase();

    switch (rule.rule_type) {
      case 'sender':
        return message.from_address?.toLowerCase() === pattern;

      case 'domain':
        const domain = message.from_address?.split('@')[1]?.toLowerCase();
        return domain === pattern;

      case 'keyword':
        const subject = (message.subject || '').toLowerCase();
        const body = (message.body_preview || '').toLowerCase();
        return subject.includes(pattern) || body.includes(pattern);

      case 'subject_pattern':
        return (message.subject || '').toLowerCase().includes(pattern);

      default:
        return false;
    }
  }

  /**
   * Classify email using AI (Ollama)
   */
  async classifyWithAI(message) {
    try {
      // Build prompt
      const prompt = this.buildClassificationPrompt(message);

      // Call Ollama
      const response = await axios.post(
        `${this.ollamaUrl}/api/generate`,
        {
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3, // Lower temperature for more consistent classification
            top_p: 0.9
          }
        },
        {
          timeout: 30000 // 30 second timeout
        }
      );

      const aiResponse = response.data.response;

      // Parse AI response
      const parsed = this.parseAIResponse(aiResponse);

      console.log(`[Classifier] AI result: ${parsed.category} (${parsed.confidence})`);
      console.log(`[Classifier] Reasoning: ${parsed.reasoning}`);

      return {
        category: parsed.category,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        method: 'ai',
        model: this.model
      };

    } catch (error) {
      console.error('[Classifier] AI classification failed:', error.message);

      // Fallback to simple heuristic
      return this.fallbackClassification(message);
    }
  }

  /**
   * Build classification prompt for AI
   */
  buildClassificationPrompt(message) {
    const categories = this.categories.join(', ');

    return `You are an email classification assistant. Analyze this email and categorize it into one of these categories: ${categories}.

Email Details:
From: ${message.from_address}
Subject: ${message.subject}
Preview: ${message.body_preview}

Respond ONLY in this exact JSON format:
{
  "category": "one of the categories above",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}

Classification:`;
  }

  /**
   * Parse AI response into structured data
   */
  parseAIResponse(response) {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate category
        if (!this.categories.includes(parsed.category)) {
          parsed.category = 'personal'; // Default fallback
        }

        // Ensure confidence is in valid range
        parsed.confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5));

        return {
          category: parsed.category,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning || 'AI classification'
        };
      }

      // If JSON parsing fails, try to extract category from text
      for (const category of this.categories) {
        if (response.toLowerCase().includes(category)) {
          return {
            category,
            confidence: 0.5,
            reasoning: 'Category extracted from text response'
          };
        }
      }

      throw new Error('Could not parse AI response');

    } catch (error) {
      console.error('[Classifier] Failed to parse AI response:', error.message);

      return {
        category: 'personal',
        confidence: 0.3,
        reasoning: 'Fallback classification due to parse error'
      };
    }
  }

  /**
   * Fallback classification using simple heuristics
   */
  fallbackClassification(message) {
    const subject = (message.subject || '').toLowerCase();
    const from = (message.from_address || '').toLowerCase();
    const preview = (message.body_preview || '').toLowerCase();

    // Spam indicators
    if (
      subject.includes('unsubscribe') ||
      subject.includes('click here') ||
      subject.includes('offer expires') ||
      from.includes('noreply')
    ) {
      return { category: 'spam', confidence: 0.7, reasoning: 'Spam indicators detected', method: 'heuristic' };
    }

    // Marketing indicators
    if (
      subject.includes('newsletter') ||
      subject.includes('sale') ||
      subject.includes('discount') ||
      preview.includes('promotional')
    ) {
      return { category: 'marketing', confidence: 0.6, reasoning: 'Marketing indicators', method: 'heuristic' };
    }

    // Urgent indicators
    if (
      subject.includes('urgent') ||
      subject.includes('asap') ||
      subject.includes('important') ||
      subject.includes('action required')
    ) {
      return { category: 'urgent', confidence: 0.7, reasoning: 'Urgent keywords', method: 'heuristic' };
    }

    // Default to personal
    return { category: 'personal', confidence: 0.4, reasoning: 'Default classification', method: 'heuristic' };
  }

  /**
   * Store classification result in database
   */
  async storeClassification(messageId, result) {
    // Update message with classification
    await this.db.query(`
      UPDATE email_messages
      SET
        ai_category = $1,
        ai_confidence = $2,
        ai_reasoning = $3,
        ai_classified_at = NOW()
      WHERE id = $4
    `, [result.category, result.confidence, result.reasoning, messageId]);

    // Store in classification history
    await this.db.query(`
      INSERT INTO email_classification_history (
        message_id,
        classified_as,
        confidence,
        reasoning,
        model_name,
        model_version,
        classified_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      messageId,
      result.category,
      result.confidence,
      result.reasoning,
      result.method === 'ai' ? this.model : result.method,
      '1.0'
    ]);
  }

  /**
   * Apply routing rule to message
   */
  async applyRule(messageId, ruleId) {
    await this.db.query('SELECT apply_routing_rule($1, $2)', [messageId, ruleId]);
  }

  /**
   * Consider creating a new rule based on high-confidence classification
   */
  async considerNewRule(message, result) {
    // Only create rules for high confidence AI classifications
    if (result.confidence < 0.8 || result.method !== 'ai') {
      return;
    }

    // Check if rule already exists for this sender
    const existing = await this.db.query(`
      SELECT id FROM email_routing_rules
      WHERE user_id = (SELECT user_id FROM email_accounts WHERE id = $1)
        AND rule_type = 'sender'
        AND pattern = $2
    `, [message.account_id, message.from_address]);

    if (existing.rows.length > 0) {
      return; // Rule already exists
    }

    console.log(`[Classifier] Creating new learned rule for ${message.from_address} → ${result.category}`);

    // Create new rule
    await this.db.query(`
      INSERT INTO email_routing_rules (
        user_id,
        account_id,
        rule_type,
        pattern,
        target_category,
        priority,
        confidence,
        is_auto_learned
      ) VALUES (
        (SELECT user_id FROM email_accounts WHERE id = $1),
        $1,
        'sender',
        $2,
        $3,
        5,
        $4,
        true
      )
    `, [message.account_id, message.from_address, result.category, result.confidence]);
  }

  /**
   * Handle user correction (drag-and-drop reclassification)
   */
  async handleCorrection(messageId, newCategory) {
    console.log(`[Classifier] User corrected message ${messageId} → ${newCategory}`);

    // Use database function to learn from correction
    await this.db.query('SELECT learn_from_correction($1, $2)', [messageId, newCategory]);

    // Update classification history
    await this.db.query(`
      UPDATE email_classification_history
      SET
        was_correct = false,
        corrected_to = $2
      WHERE message_id = $1
        AND was_correct IS NULL
    `, [messageId, newCategory]);

    console.log('[Classifier] ✓ Learned from correction');
  }

  /**
   * Get message by ID
   */
  async getMessage(messageId) {
    const result = await this.db.query(`
      SELECT
        m.*,
        a.user_id
      FROM email_messages m
      JOIN email_accounts a ON a.id = m.account_id
      WHERE m.id = $1
    `, [messageId]);

    return result.rows[0];
  }

  /**
   * Get classification stats for user
   */
  async getStats(userId) {
    const result = await this.db.query(`
      SELECT
        COUNT(*) FILTER (WHERE ai_category IS NOT NULL) as total_classified,
        COUNT(*) FILTER (WHERE user_corrected = true) as total_corrected,
        ROUND(
          COUNT(*) FILTER (WHERE user_corrected = false AND ai_category IS NOT NULL)::NUMERIC /
          NULLIF(COUNT(*) FILTER (WHERE ai_category IS NOT NULL)::NUMERIC, 0) * 100,
          2
        ) as accuracy_percentage
      FROM email_messages m
      JOIN email_accounts a ON a.id = m.account_id
      WHERE a.user_id = $1
    `, [userId]);

    return result.rows[0];
  }
}

module.exports = EmailClassifier;
