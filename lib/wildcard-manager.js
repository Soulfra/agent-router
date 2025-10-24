/**
 * Wildcard Manager
 *
 * Allows players to customize game cards (wildcards, prompts, responses).
 * Players can edit existing cards or create their own versions.
 *
 * Features:
 * - Edit wildcard text/effects
 * - Create custom cards
 * - Card approval system (prevent abuse)
 * - Version history tracking
 * - Group-specific card collections
 *
 * Philosophy:
 * Like CAH blank cards - let players make it their own.
 * Keep it funny, keep it creative, keep it chaos.
 */

const crypto = require('crypto');

class WildcardManager {
  constructor(options = {}) {
    this.db = options.db;
    this.cardGameEngine = options.cardGameEngine;

    // Custom card collections per group
    // groupId -> Map(cardId -> card data)
    this.groupCardCollections = new Map();

    // Card edit history
    // cardId -> [{ editedBy, oldValue, newValue, timestamp }]
    this.cardHistory = new Map();

    this.config = {
      // Moderation settings
      maxCustomCardsPerPlayer: options.maxCustomCardsPerPlayer || 20,
      maxCustomCardsPerGroup: options.maxCustomCardsPerGroup || 500,
      requireApproval: options.requireApproval || false, // Group admin approval
      profanityFilter: options.profanityFilter || true,

      // Text limits
      maxCardTextLength: options.maxCardTextLength || 200,
      maxPromptLength: options.maxPromptLength || 150,
      maxResponseLength: options.maxResponseLength || 100,

      // Banned words (basic filter)
      bannedWords: options.bannedWords || [],

      // Card types that can be edited
      editableTypes: ['wild', 'prompt', 'response', 'custom']
    };

    console.log('[WildcardManager] Initialized');
  }

  /**
   * Edit existing card
   */
  async editCard(cardId, editedBy, newData, context = {}) {
    try {
      const { groupId, gameId } = context;

      // Get original card
      const originalCard = await this._getCard(cardId, groupId);
      if (!originalCard) {
        return { success: false, error: 'Card not found' };
      }

      // Check if card is editable
      if (!originalCard.editable) {
        return { success: false, error: 'This card cannot be edited' };
      }

      if (!this.config.editableTypes.includes(originalCard.type)) {
        return { success: false, error: 'This card type cannot be edited' };
      }

      // Validate new text
      const validation = this._validateCardText(newData.text, originalCard.type);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Create edited version
      const editedCard = {
        ...originalCard,
        text: newData.text || originalCard.text,
        effect: newData.effect || originalCard.effect,
        color: newData.color || originalCard.color,
        customEffectText: newData.customEffectText,
        editedBy,
        editedAt: Date.now(),
        originalCardId: originalCard.originalCardId || cardId,
        version: (originalCard.version || 0) + 1,
        approved: this.config.requireApproval ? false : true
      };

      // Store edit history
      this._recordCardEdit(cardId, editedBy, originalCard, editedCard);

      // Save to group collection
      if (groupId) {
        this._addCardToGroupCollection(groupId, editedCard);
      }

      // Store in database
      if (this.db) {
        await this._storeCustomCardInDB(editedCard, groupId);
      }

      console.log(`[WildcardManager] Card edited: ${cardId} by ${editedBy}`);

      return {
        success: true,
        card: editedCard,
        requiresApproval: this.config.requireApproval && !editedCard.approved
      };

    } catch (error) {
      console.error('[WildcardManager] Error editing card:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create custom card
   */
  async createCustomCard(createdBy, cardData, context = {}) {
    try {
      const { groupId } = context;

      // Check player's custom card limit
      const playerCardCount = await this._getPlayerCardCount(createdBy, groupId);
      if (playerCardCount >= this.config.maxCustomCardsPerPlayer) {
        return {
          success: false,
          error: `You've reached the limit of ${this.config.maxCustomCardsPerPlayer} custom cards`
        };
      }

      // Check group's custom card limit
      if (groupId) {
        const groupCardCount = this._getGroupCardCount(groupId);
        if (groupCardCount >= this.config.maxCustomCardsPerGroup) {
          return {
            success: false,
            error: `This group has reached the limit of ${this.config.maxCustomCardsPerGroup} custom cards`
          };
        }
      }

      // Validate card data
      const validation = this._validateCardData(cardData);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Create card
      const customCard = {
        cardId: `custom-${crypto.randomUUID()}`,
        type: cardData.type || 'custom',
        text: cardData.text,
        effect: cardData.effect,
        color: cardData.color,
        customEffectText: cardData.customEffectText,
        createdBy,
        createdAt: Date.now(),
        editable: true,
        approved: this.config.requireApproval ? false : true,
        version: 1,
        metadata: {
          groupId,
          upvotes: 0,
          downvotes: 0,
          timesPlayed: 0
        }
      };

      // Save to group collection
      if (groupId) {
        this._addCardToGroupCollection(groupId, customCard);
      }

      // Store in database
      if (this.db) {
        await this._storeCustomCardInDB(customCard, groupId);
      }

      console.log(`[WildcardManager] Custom card created: ${customCard.cardId} by ${createdBy}`);

      return {
        success: true,
        card: customCard,
        requiresApproval: this.config.requireApproval && !customCard.approved
      };

    } catch (error) {
      console.error('[WildcardManager] Error creating custom card:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Approve custom card (group admin)
   */
  async approveCard(cardId, approvedBy, groupId) {
    try {
      const card = await this._getCard(cardId, groupId);
      if (!card) {
        return { success: false, error: 'Card not found' };
      }

      // Check if user is group admin (would check permissions here)
      // For now, just approve it
      card.approved = true;
      card.approvedBy = approvedBy;
      card.approvedAt = Date.now();

      // Update in collection
      if (groupId) {
        const collection = this.groupCardCollections.get(groupId);
        if (collection) {
          collection.set(cardId, card);
        }
      }

      // Update database
      if (this.db) {
        await this._updateCardApprovalInDB(cardId, approvedBy);
      }

      console.log(`[WildcardManager] Card approved: ${cardId} by ${approvedBy}`);

      return {
        success: true,
        card
      };

    } catch (error) {
      console.error('[WildcardManager] Error approving card:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete custom card
   */
  async deleteCard(cardId, deletedBy, groupId) {
    try {
      const card = await this._getCard(cardId, groupId);
      if (!card) {
        return { success: false, error: 'Card not found' };
      }

      // Only creator or group admin can delete
      if (card.createdBy !== deletedBy) {
        // Would check if deletedBy is group admin here
        return { success: false, error: 'Only the creator can delete this card' };
      }

      // Remove from collection
      if (groupId) {
        const collection = this.groupCardCollections.get(groupId);
        if (collection) {
          collection.delete(cardId);
        }
      }

      // Delete from database
      if (this.db) {
        await this._deleteCardFromDB(cardId);
      }

      console.log(`[WildcardManager] Card deleted: ${cardId} by ${deletedBy}`);

      return {
        success: true,
        cardId
      };

    } catch (error) {
      console.error('[WildcardManager] Error deleting card:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get group's custom cards
   */
  getGroupCards(groupId, options = {}) {
    const { includeUnapproved = false, cardType = null } = options;

    const collection = this.groupCardCollections.get(groupId);
    if (!collection) return [];

    let cards = Array.from(collection.values());

    // Filter by approval status
    if (!includeUnapproved) {
      cards = cards.filter(c => c.approved !== false);
    }

    // Filter by card type
    if (cardType) {
      cards = cards.filter(c => c.type === cardType);
    }

    // Sort by popularity (upvotes, times played)
    cards.sort((a, b) => {
      const aScore = (a.metadata?.upvotes || 0) + (a.metadata?.timesPlayed || 0);
      const bScore = (b.metadata?.upvotes || 0) + (b.metadata?.timesPlayed || 0);
      return bScore - aScore;
    });

    return cards;
  }

  /**
   * Vote on custom card (upvote/downvote)
   */
  async voteCard(cardId, votedBy, vote, groupId) {
    try {
      const card = await this._getCard(cardId, groupId);
      if (!card) {
        return { success: false, error: 'Card not found' };
      }

      if (vote === 'up') {
        card.metadata.upvotes = (card.metadata.upvotes || 0) + 1;
      } else if (vote === 'down') {
        card.metadata.downvotes = (card.metadata.downvotes || 0) + 1;
      }

      // Update collection
      if (groupId) {
        const collection = this.groupCardCollections.get(groupId);
        if (collection) {
          collection.set(cardId, card);
        }
      }

      // Update database
      if (this.db) {
        await this._updateCardVotesInDB(cardId, card.metadata);
      }

      return {
        success: true,
        card,
        votes: {
          upvotes: card.metadata.upvotes,
          downvotes: card.metadata.downvotes
        }
      };

    } catch (error) {
      console.error('[WildcardManager] Error voting card:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get card edit history
   */
  getCardHistory(cardId) {
    return this.cardHistory.get(cardId) || [];
  }

  /**
   * Validate card text
   * @private
   */
  _validateCardText(text, cardType) {
    if (!text || text.trim().length === 0) {
      return { valid: false, error: 'Card text cannot be empty' };
    }

    // Check length limits
    const maxLength = cardType === 'prompt'
      ? this.config.maxPromptLength
      : cardType === 'response'
        ? this.config.maxResponseLength
        : this.config.maxCardTextLength;

    if (text.length > maxLength) {
      return {
        valid: false,
        error: `Text too long (max ${maxLength} characters)`
      };
    }

    // Profanity filter (basic)
    if (this.config.profanityFilter) {
      const lowerText = text.toLowerCase();
      for (const word of this.config.bannedWords) {
        if (lowerText.includes(word.toLowerCase())) {
          return {
            valid: false,
            error: 'Card contains inappropriate content'
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate card data
   * @private
   */
  _validateCardData(cardData) {
    if (!cardData.type) {
      return { valid: false, error: 'Card type is required' };
    }

    const textValidation = this._validateCardText(cardData.text, cardData.type);
    if (!textValidation.valid) {
      return textValidation;
    }

    // Validate effect if provided
    if (cardData.effect) {
      const validEffects = [
        'skip', 'reverse', 'draw2', 'draw4', 'wild',
        'trade', 'steal', 'custom'
      ];

      if (!validEffects.includes(cardData.effect)) {
        return { valid: false, error: 'Invalid card effect' };
      }
    }

    return { valid: true };
  }

  /**
   * Record card edit in history
   * @private
   */
  _recordCardEdit(cardId, editedBy, oldCard, newCard) {
    const history = this.cardHistory.get(cardId) || [];

    history.push({
      editedBy,
      timestamp: Date.now(),
      oldValue: {
        text: oldCard.text,
        effect: oldCard.effect,
        color: oldCard.color
      },
      newValue: {
        text: newCard.text,
        effect: newCard.effect,
        color: newCard.color
      }
    });

    this.cardHistory.set(cardId, history);
  }

  /**
   * Add card to group collection
   * @private
   */
  _addCardToGroupCollection(groupId, card) {
    if (!this.groupCardCollections.has(groupId)) {
      this.groupCardCollections.set(groupId, new Map());
    }

    const collection = this.groupCardCollections.get(groupId);
    collection.set(card.cardId, card);
  }

  /**
   * Get card
   * @private
   */
  async _getCard(cardId, groupId) {
    if (groupId) {
      const collection = this.groupCardCollections.get(groupId);
      if (collection && collection.has(cardId)) {
        return collection.get(cardId);
      }
    }

    // Try database
    if (this.db) {
      try {
        const result = await this.db.query(
          'SELECT * FROM custom_cards WHERE card_id = $1',
          [cardId]
        );

        if (result.rows.length > 0) {
          return this._parseCardFromDB(result.rows[0]);
        }
      } catch (error) {
        console.warn('[WildcardManager] Error fetching card from DB:', error.message);
      }
    }

    return null;
  }

  /**
   * Get player's custom card count
   * @private
   */
  async _getPlayerCardCount(playerId, groupId) {
    if (groupId) {
      const collection = this.groupCardCollections.get(groupId);
      if (collection) {
        return Array.from(collection.values())
          .filter(c => c.createdBy === playerId)
          .length;
      }
    }

    return 0;
  }

  /**
   * Get group's custom card count
   * @private
   */
  _getGroupCardCount(groupId) {
    const collection = this.groupCardCollections.get(groupId);
    return collection ? collection.size : 0;
  }

  /**
   * Store custom card in database
   * @private
   */
  async _storeCustomCardInDB(card, groupId) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO custom_cards (
          card_id,
          group_id,
          card_type,
          card_text,
          card_effect,
          card_color,
          custom_effect_text,
          created_by,
          approved,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (card_id) DO UPDATE SET
          card_text = $4,
          card_effect = $5,
          card_color = $6,
          custom_effect_text = $7,
          metadata = $10,
          updated_at = NOW()
      `, [
        card.cardId,
        groupId,
        card.type,
        card.text,
        card.effect,
        card.color,
        card.customEffectText,
        card.createdBy,
        card.approved,
        JSON.stringify(card.metadata)
      ]);

    } catch (error) {
      console.warn('[WildcardManager] Failed to store custom card:', error.message);
    }
  }

  /**
   * Update card approval in database
   * @private
   */
  async _updateCardApprovalInDB(cardId, approvedBy) {
    if (!this.db) return;

    try {
      await this.db.query(`
        UPDATE custom_cards
        SET approved = true,
            approved_by = $1,
            approved_at = NOW()
        WHERE card_id = $2
      `, [approvedBy, cardId]);

    } catch (error) {
      console.warn('[WildcardManager] Failed to update card approval:', error.message);
    }
  }

  /**
   * Update card votes in database
   * @private
   */
  async _updateCardVotesInDB(cardId, metadata) {
    if (!this.db) return;

    try {
      await this.db.query(`
        UPDATE custom_cards
        SET metadata = $1
        WHERE card_id = $2
      `, [JSON.stringify(metadata), cardId]);

    } catch (error) {
      console.warn('[WildcardManager] Failed to update card votes:', error.message);
    }
  }

  /**
   * Delete card from database
   * @private
   */
  async _deleteCardFromDB(cardId) {
    if (!this.db) return;

    try {
      await this.db.query(
        'DELETE FROM custom_cards WHERE card_id = $1',
        [cardId]
      );

    } catch (error) {
      console.warn('[WildcardManager] Failed to delete card:', error.message);
    }
  }

  /**
   * Parse card from database row
   * @private
   */
  _parseCardFromDB(row) {
    return {
      cardId: row.card_id,
      type: row.card_type,
      text: row.card_text,
      effect: row.card_effect,
      color: row.card_color,
      customEffectText: row.custom_effect_text,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at).getTime(),
      approved: row.approved,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? new Date(row.approved_at).getTime() : null,
      editable: true,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    };
  }

  /**
   * Get stats
   */
  getStats() {
    const totalGroups = this.groupCardCollections.size;
    let totalCards = 0;
    let approvedCards = 0;

    for (const collection of this.groupCardCollections.values()) {
      totalCards += collection.size;
      approvedCards += Array.from(collection.values())
        .filter(c => c.approved !== false)
        .length;
    }

    return {
      totalGroups,
      totalCards,
      approvedCards,
      pendingCards: totalCards - approvedCards,
      cardHistoryEntries: this.cardHistory.size
    };
  }
}

module.exports = WildcardManager;
