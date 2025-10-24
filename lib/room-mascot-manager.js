/**
 * Room Mascot Manager
 *
 * Extends the room-manager.js system with AI mascots (personalities) for each room.
 * Each room gets a unique AI voice/personality - like podcast filters.
 *
 * Mascot Personalities:
 * - Creative: Enthusiastic, uses emojis, celebrates wild ideas
 * - Technical: Precise, detailed, focuses on implementation
 * - Meme: Casual Gen-Z slang, funny but helpful
 * - Professional: Clear, direct, formal
 * - Mentor: Patient, teaching-focused, asks questions
 * - Hype: Energetic motivator, always excited
 * - Zen: Calm, philosophical, focused on quality
 * - Custom: Trained on room-specific code/content via Ollama
 *
 * Uses local Ollama for:
 * - Per-room personality responses
 * - Code-specific knowledge (trained on room repos)
 * - 100% local, $0 cost
 *
 * Usage:
 *   const manager = new RoomMascotManager({ db, roomManager, ollamaUrl });
 *   await manager.createMascot(roomId, 'meme', { name: 'MemeLord' });
 *   const response = await manager.chat(roomId, userId, 'How do I deploy this?');
 *   const personality = await manager.getMascotPersonality(roomId);
 */

class RoomMascotManager {
  constructor(config = {}) {
    this.db = config.db;
    this.roomManager = config.roomManager || null;
    this.ollamaUrl = config.ollamaUrl || 'http://127.0.0.1:11434';
    this.defaultModel = config.defaultModel || 'llama3.2:3b';
    this.enabled = config.enabled !== false;

    if (!this.db) {
      throw new Error('[RoomMascotManager] Database required');
    }

    // Predefined personality templates
    this.personalities = {
      creative: {
        name: 'Creative Spark',
        emoji: '🎨',
        tone: 'enthusiastic, creative, encouraging',
        style: 'Uses emojis, celebrates wild ideas, thinks outside the box',
        example_response: 'Yoooo that\'s a wild idea! 🔥 Let\'s make it happen! What if we also...'
      },
      technical: {
        name: 'Tech Guru',
        emoji: '🤓',
        tone: 'precise, detailed, analytical',
        style: 'Focuses on implementation details, suggests best practices',
        example_response: 'Good question. Here\'s the technical breakdown: 1) First, you\'ll need to...'
      },
      meme: {
        name: 'Meme Master',
        emoji: '💀',
        tone: 'casual, humorous, Gen-Z',
        style: 'Uses slang (fr fr, no cap, bruh), funny but actually helpful',
        example_response: 'bruh that bug is wild 💀 ok fr fr tho here\'s the fix...'
      },
      professional: {
        name: 'Pro Guide',
        emoji: '💼',
        tone: 'clear, direct, formal',
        style: 'Professional language, structured responses',
        example_response: 'I understand. Here is the recommended approach for your use case...'
      },
      mentor: {
        name: 'Code Mentor',
        emoji: '👨‍🏫',
        tone: 'patient, teaching-focused, socratic',
        style: 'Asks guiding questions, explains concepts thoroughly',
        example_response: 'Great question! Before I answer, have you thought about why this might be happening?'
      },
      hype: {
        name: 'Hype Bot',
        emoji: '🚀',
        tone: 'energetic, motivating, excited',
        style: 'Always enthusiastic, celebrates progress, pumps you up',
        example_response: 'LET\'S GOOOO! 🚀 You\'re crushing it! Here\'s how to take it to the next level...'
      },
      zen: {
        name: 'Zen Master',
        emoji: '🧘',
        tone: 'calm, philosophical, quality-focused',
        style: 'Focuses on doing things right, encourages taking time',
        example_response: 'Slow down, friend. Quality over speed. Let\'s approach this mindfully...'
      }
    };

    console.log('[RoomMascotManager] Initialized');
  }

  /**
   * Create mascot for a room
   */
  async createMascot(roomId, personalityType = 'creative', options = {}) {
    const personality = this.personalities[personalityType];

    if (!personality && personalityType !== 'custom') {
      throw new Error(`Unknown personality type: ${personalityType}`);
    }

    const mascotData = {
      room_id: roomId,
      personality_type: personalityType,
      mascot_name: options.name || personality?.name || 'Room Guide',
      mascot_emoji: options.emoji || personality?.emoji || '🤖',
      personality_tone: options.tone || personality?.tone || 'helpful',
      personality_style: options.style || personality?.style || 'friendly',
      ollama_model: options.ollamaModel || this.defaultModel,
      custom_system_prompt: options.systemPrompt || null,
      is_active: options.isActive !== undefined ? options.isActive : true
    };

    const result = await this.db.query(`
      INSERT INTO room_mascots (
        room_id, personality_type, mascot_name, mascot_emoji,
        personality_tone, personality_style, ollama_model,
        custom_system_prompt, is_active, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (room_id) DO UPDATE SET
        personality_type = $2,
        mascot_name = $3,
        mascot_emoji = $4,
        personality_tone = $5,
        personality_style = $6,
        ollama_model = $7,
        custom_system_prompt = $8,
        is_active = $9,
        updated_at = NOW()
      RETURNING *
    `, [
      mascotData.room_id,
      mascotData.personality_type,
      mascotData.mascot_name,
      mascotData.mascot_emoji,
      mascotData.personality_tone,
      mascotData.personality_style,
      mascotData.ollama_model,
      mascotData.custom_system_prompt,
      mascotData.is_active
    ]);

    console.log(`[RoomMascotManager] Created mascot for room ${roomId}:`, mascotData.mascot_name);

    return result.rows[0];
  }

  /**
   * Get mascot for a room
   */
  async getMascot(roomId) {
    const result = await this.db.query(
      'SELECT * FROM room_mascots WHERE room_id = $1 AND is_active = true',
      [roomId]
    );

    return result.rows[0];
  }

  /**
   * Get mascot personality details
   */
  async getMascotPersonality(roomId) {
    const mascot = await this.getMascot(roomId);

    if (!mascot) {
      return {
        exists: false,
        message: 'No mascot configured for this room'
      };
    }

    return {
      exists: true,
      mascot_id: mascot.mascot_id,
      name: mascot.mascot_name,
      emoji: mascot.mascot_emoji,
      personality_type: mascot.personality_type,
      tone: mascot.personality_tone,
      style: mascot.personality_style,
      model: mascot.ollama_model
    };
  }

  /**
   * Chat with room mascot
   */
  async chat(roomId, userId, message, context = {}) {
    if (!this.enabled) {
      return {
        success: false,
        message: 'Room mascots are not enabled'
      };
    }

    const mascot = await this.getMascot(roomId);

    if (!mascot) {
      return {
        success: false,
        message: 'No mascot configured for this room'
      };
    }

    // Build system prompt
    const systemPrompt = this._buildSystemPrompt(mascot, context);

    // Generate response via Ollama
    const response = await this._generateResponse(mascot.ollama_model, systemPrompt, message);

    // Log chat interaction
    await this._logChat(roomId, userId, message, response, mascot.mascot_id);

    return {
      success: true,
      mascot_name: mascot.mascot_name,
      mascot_emoji: mascot.mascot_emoji,
      response
    };
  }

  /**
   * Build system prompt for mascot
   */
  _buildSystemPrompt(mascot, context = {}) {
    if (mascot.custom_system_prompt) {
      return mascot.custom_system_prompt;
    }

    let prompt = `You are ${mascot.mascot_name}, the AI mascot for this code room.

Your personality:
- Tone: ${mascot.personality_tone}
- Style: ${mascot.personality_style}
- Always stay in character
- Be helpful while maintaining your personality
- Keep responses concise (2-4 sentences usually)
- Use ${mascot.mascot_emoji} emoji when appropriate

`;

    // Add room context if available
    if (context.room_name) {
      prompt += `This room is: ${context.room_name}\n`;
    }

    if (context.room_description) {
      prompt += `Room focus: ${context.room_description}\n`;
    }

    if (context.primary_language) {
      prompt += `Primary language: ${context.primary_language}\n`;
    }

    prompt += '\nRespond to user messages while maintaining your personality.';

    return prompt;
  }

  /**
   * Generate response via Ollama
   */
  async _generateResponse(model, systemPrompt, userMessage) {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: `${systemPrompt}\n\nUser: ${userMessage}\nAssistant:`,
          temperature: 0.8,
          max_tokens: 200,
          stream: false
        })
      });

      if (!response.ok) {
        console.error('[RoomMascotManager] Ollama error:', response.status);
        return 'Sorry, I\'m having trouble responding right now. Try again in a moment!';
      }

      const data = await response.json();
      const text = data.response?.trim();

      return text || 'Hmm, I\'m not sure how to respond to that!';
    } catch (error) {
      console.error('[RoomMascotManager] Generation error:', error.message);
      return 'Oops! Something went wrong. Let me try again...';
    }
  }

  /**
   * Log chat interaction
   */
  async _logChat(roomId, userId, userMessage, mascotResponse, mascotId) {
    try {
      await this.db.query(`
        INSERT INTO room_mascot_chats (
          room_id, user_id, mascot_id, user_message, mascot_response, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [roomId, userId, mascotId, userMessage, mascotResponse]);
    } catch (error) {
      console.error('[RoomMascotManager] Log chat error:', error.message);
    }
  }

  /**
   * Get chat history for room
   */
  async getChatHistory(roomId, limit = 50) {
    const result = await this.db.query(`
      SELECT
        rmc.*,
        u.username,
        rm.mascot_name,
        rm.mascot_emoji
      FROM room_mascot_chats rmc
      LEFT JOIN users u ON rmc.user_id = u.user_id
      LEFT JOIN room_mascots rm ON rmc.mascot_id = rm.mascot_id
      WHERE rmc.room_id = $1
      ORDER BY rmc.created_at DESC
      LIMIT $2
    `, [roomId, limit]);

    return result.rows.reverse(); // Return oldest first
  }

  /**
   * Train custom mascot on room code
   */
  async trainCustomMascot(roomId, repoPath, options = {}) {
    const { OllamaBotTrainer } = require('./ollama-bot-trainer');

    const trainer = new OllamaBotTrainer({
      ollamaHost: this.ollamaUrl
    });

    // Get room details
    const room = await this.roomManager?.getRoom(roomId);

    if (!room) {
      throw new Error('Room not found');
    }

    const modelName = options.modelName || `mascot-room-${room.slug}`;
    const baseModel = options.baseModel || 'llama3.2:3b';

    // Train on code
    const result = await trainer.trainFromCode(repoPath, {
      modelName,
      baseModel,
      language: room.primary_language || 'javascript'
    });

    // Create mascot with custom model
    await this.createMascot(roomId, 'custom', {
      name: options.name || `${room.name} Expert`,
      emoji: options.emoji || '🤖',
      ollamaModel: modelName,
      systemPrompt: options.systemPrompt || `You are an expert in ${room.name}. You have deep knowledge of the codebase and can help developers.`
    });

    console.log(`[RoomMascotManager] Custom mascot trained for room ${roomId}:`, modelName);

    return {
      room_id: roomId,
      model_name: modelName,
      files_trained: result.filesCount
    };
  }

  /**
   * Get mascot statistics
   */
  async getMascotStats(roomId) {
    const result = await this.db.query(`
      SELECT
        rm.mascot_id,
        rm.mascot_name,
        rm.personality_type,
        COUNT(rmc.chat_id) as total_chats,
        COUNT(DISTINCT rmc.user_id) as unique_users,
        MAX(rmc.created_at) as last_chat_at
      FROM room_mascots rm
      LEFT JOIN room_mascot_chats rmc ON rm.mascot_id = rmc.mascot_id
      WHERE rm.room_id = $1
      GROUP BY rm.mascot_id, rm.mascot_name, rm.personality_type
    `, [roomId]);

    return result.rows[0] || null;
  }

  /**
   * List all mascots
   */
  async listMascots() {
    const result = await this.db.query(`
      SELECT
        rm.*,
        cr.name as room_name,
        cr.slug as room_slug,
        COUNT(rmc.chat_id) as chat_count
      FROM room_mascots rm
      JOIN code_rooms cr ON rm.room_id = cr.room_id
      LEFT JOIN room_mascot_chats rmc ON rm.mascot_id = rmc.mascot_id
      WHERE rm.is_active = true
      GROUP BY rm.mascot_id, cr.name, cr.slug
      ORDER BY chat_count DESC
    `);

    return result.rows;
  }

  /**
   * Get personality templates (for UI)
   */
  getPersonalityTemplates() {
    return Object.entries(this.personalities).map(([key, value]) => ({
      type: key,
      ...value
    }));
  }
}

// Ensure tables exist
async function ensureMascotTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS room_mascots (
      mascot_id SERIAL PRIMARY KEY,
      room_id INTEGER NOT NULL REFERENCES code_rooms(room_id) ON DELETE CASCADE,
      personality_type VARCHAR(50) NOT NULL,
      mascot_name VARCHAR(255) NOT NULL,
      mascot_emoji VARCHAR(10) DEFAULT '🤖',
      personality_tone TEXT,
      personality_style TEXT,
      ollama_model VARCHAR(255) DEFAULT 'llama3.2:3b',
      custom_system_prompt TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(room_id)
    );

    CREATE INDEX IF NOT EXISTS idx_room_mascots_room ON room_mascots(room_id);
    CREATE INDEX IF NOT EXISTS idx_room_mascots_type ON room_mascots(personality_type);

    CREATE TABLE IF NOT EXISTS room_mascot_chats (
      chat_id SERIAL PRIMARY KEY,
      room_id INTEGER NOT NULL REFERENCES code_rooms(room_id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      mascot_id INTEGER NOT NULL REFERENCES room_mascots(mascot_id) ON DELETE CASCADE,
      user_message TEXT NOT NULL,
      mascot_response TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_room_mascot_chats_room ON room_mascot_chats(room_id);
    CREATE INDEX IF NOT EXISTS idx_room_mascot_chats_user ON room_mascot_chats(user_id);
    CREATE INDEX IF NOT EXISTS idx_room_mascot_chats_created ON room_mascot_chats(created_at);

    COMMENT ON TABLE room_mascots IS 'AI mascot personalities for code rooms';
    COMMENT ON TABLE room_mascot_chats IS 'Chat history between users and room mascots';
  `);

  console.log('[RoomMascotManager] Tables ensured');
}

module.exports = RoomMascotManager;
module.exports.ensureMascotTables = ensureMascotTables;
