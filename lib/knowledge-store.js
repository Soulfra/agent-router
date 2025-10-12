/**
 * Knowledge Store - CRUD operations for notes and knowledge base
 * Handles storage, retrieval, search (text + semantic), and relationships
 */

const crypto = require('crypto');

class KnowledgeStore {
  constructor(db) {
    this.db = db;

    // Lazy-load embeddings generator
    this.embedder = null;
  }

  /**
   * Get or initialize embeddings generator
   */
  getEmbedder() {
    if (!this.embedder) {
      const EmbeddingsGenerator = require('./embeddings');
      this.embedder = new EmbeddingsGenerator({
        provider: 'openai',
        db: this.db,
        cache: true
      });
    }
    return this.embedder;
  }

  /**
   * Create a new note
   */
  async createNote(data) {
    const {
      title,
      content,
      source = 'manual',
      sourceFile = null,
      sourcePath = null,
      mimeType = null,
      tags = [],
      category = null,
      audioPath = null,
      transcriptionConfidence = null,
      userId = null,
      sessionId = null
    } = data;

    // Generate embedding for semantic search
    let embedding = null;
    try {
      const embedder = this.getEmbedder();
      const textToEmbed = `${title || ''}\n${content}`.trim();
      embedding = await embedder.generate(textToEmbed);
      console.log(`✓ Generated embedding for note (${embedding.length} dimensions)`);
    } catch (error) {
      console.error('⚠️  Failed to generate embedding:', error.message);
      // Continue without embedding - note can still be saved
    }

    const result = await this.db.query(`
      INSERT INTO notes (
        title, content, source, source_file, source_path, mime_type,
        tags, category, audio_path, transcription_confidence,
        user_id, session_id, embedding
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      title, content, source, sourceFile, sourcePath, mimeType,
      tags, category, audioPath, transcriptionConfidence,
      userId, sessionId, embedding ? `[${embedding.join(',')}]` : null
    ]);

    const note = result.rows[0];

    // Log access
    await this.logAccess(note.id, 'create', userId, sessionId);

    return note;
  }

  /**
   * Get note by ID
   */
  async getNote(noteId, userId = null, sessionId = null) {
    const result = await this.db.query(`
      SELECT * FROM notes
      WHERE id = $1 AND status = 'active'
    `, [noteId]);

    if (result.rows.length === 0) {
      return null;
    }

    const note = result.rows[0];

    // Update accessed_at
    await this.db.query(`
      UPDATE notes SET accessed_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [noteId]);

    // Log access
    await this.logAccess(noteId, 'view', userId, sessionId);

    return note;
  }

  /**
   * Update note
   */
  async updateNote(noteId, updates, userId = null, sessionId = null) {
    const allowedFields = ['title', 'content', 'tags', 'category', 'status'];
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex++;
      }
    });

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(noteId);

    const result = await this.db.query(`
      UPDATE notes
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex} AND status != 'deleted'
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new Error('Note not found or cannot be updated');
    }

    // Log access
    await this.logAccess(noteId, 'edit', userId, sessionId);

    return result.rows[0];
  }

  /**
   * Delete note (soft delete)
   */
  async deleteNote(noteId, userId = null, sessionId = null) {
    const result = await this.db.query(`
      UPDATE notes
      SET status = 'deleted'
      WHERE id = $1 AND status != 'deleted'
      RETURNING id
    `, [noteId]);

    if (result.rows.length === 0) {
      throw new Error('Note not found or already deleted');
    }

    // Log access
    await this.logAccess(noteId, 'delete', userId, sessionId);

    return { success: true, id: noteId };
  }

  /**
   * Search notes (full-text search)
   */
  async searchNotes(query, options = {}) {
    const {
      limit = 50,
      offset = 0,
      category = null,
      tags = null,
      source = null,
      userId = null
    } = options;

    const conditions = ["status = 'active'"];
    const values = [query];
    let paramIndex = 2;

    // Add filters
    if (category) {
      conditions.push(`category = $${paramIndex}`);
      values.push(category);
      paramIndex++;
    }

    if (tags && tags.length > 0) {
      conditions.push(`tags && $${paramIndex}`);
      values.push(tags);
      paramIndex++;
    }

    if (source) {
      conditions.push(`source = $${paramIndex}`);
      values.push(source);
      paramIndex++;
    }

    if (userId) {
      conditions.push(`user_id = $${paramIndex}`);
      values.push(userId);
      paramIndex++;
    }

    values.push(limit);
    values.push(offset);

    const result = await this.db.query(`
      SELECT
        id,
        title,
        LEFT(content, 300) as preview,
        source,
        category,
        tags,
        created_at,
        updated_at,
        ts_rank(to_tsvector('english', title || ' ' || content), plainto_tsquery('english', $1)) as rank
      FROM notes
      WHERE ${conditions.join(' AND ')}
        AND to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', $1)
      ORDER BY rank DESC, updated_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, values);

    return result.rows;
  }

  /**
   * Semantic search (using embeddings)
   * Note: Requires embeddings to be generated first
   */
  async semanticSearch(queryEmbedding, options = {}) {
    const {
      limit = 10,
      similarityThreshold = 0.7,
      category = null,
      userId = null
    } = options;

    const conditions = ["status = 'active'", "embedding IS NOT NULL"];
    const values = [JSON.stringify(queryEmbedding)];
    let paramIndex = 2;

    if (category) {
      conditions.push(`category = $${paramIndex}`);
      values.push(category);
      paramIndex++;
    }

    if (userId) {
      conditions.push(`user_id = $${paramIndex}`);
      values.push(userId);
      paramIndex++;
    }

    values.push(limit);

    const result = await this.db.query(`
      SELECT
        id,
        title,
        LEFT(content, 300) as preview,
        source,
        category,
        tags,
        created_at,
        1 - (embedding <=> $1::vector) as similarity
      FROM notes
      WHERE ${conditions.join(' AND ')}
        AND (1 - (embedding <=> $1::vector)) > ${similarityThreshold}
      ORDER BY embedding <=> $1::vector
      LIMIT $${paramIndex}
    `, values);

    return result.rows;
  }

  /**
   * Get recent notes
   */
  async getRecentNotes(limit = 20, userId = null) {
    const conditions = ["status = 'active'"];
    const values = [];

    if (userId) {
      conditions.push(`user_id = $1`);
      values.push(userId);
      values.push(limit);
    } else {
      values.push(limit);
    }

    const result = await this.db.query(`
      SELECT
        id,
        title,
        LEFT(content, 200) as preview,
        source,
        category,
        tags,
        created_at,
        updated_at,
        accessed_at
      FROM notes
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${values.length}
    `, values);

    return result.rows;
  }

  /**
   * Get notes by category
   */
  async getNotesByCategory(category, limit = 50, userId = null) {
    const conditions = ["status = 'active'", "category = $1"];
    const values = [category];

    if (userId) {
      conditions.push(`user_id = $2`);
      values.push(userId);
      values.push(limit);
    } else {
      values.push(limit);
    }

    const result = await this.db.query(`
      SELECT
        id,
        title,
        LEFT(content, 200) as preview,
        source,
        tags,
        created_at,
        updated_at
      FROM notes
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${values.length}
    `, values);

    return result.rows;
  }

  /**
   * Get notes by tags
   */
  async getNotesByTags(tags, limit = 50, userId = null) {
    const conditions = ["status = 'active'", "tags && $1"];
    const values = [tags];

    if (userId) {
      conditions.push(`user_id = $2`);
      values.push(userId);
      values.push(limit);
    } else {
      values.push(limit);
    }

    const result = await this.db.query(`
      SELECT
        id,
        title,
        LEFT(content, 200) as preview,
        source,
        category,
        tags,
        created_at,
        updated_at
      FROM notes
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${values.length}
    `, values);

    return result.rows;
  }

  /**
   * Get all unique categories
   */
  async getCategories(userId = null) {
    const conditions = ["status = 'active'", "category IS NOT NULL"];
    const values = [];

    if (userId) {
      conditions.push(`user_id = $1`);
      values.push(userId);
    }

    const result = await this.db.query(`
      SELECT category, COUNT(*) as count
      FROM notes
      WHERE ${conditions.join(' AND ')}
      GROUP BY category
      ORDER BY count DESC, category ASC
    `, values);

    return result.rows;
  }

  /**
   * Get all unique tags
   */
  async getTags(userId = null) {
    const conditions = ["status = 'active'"];
    const values = [];

    if (userId) {
      conditions.push(`user_id = $1`);
      values.push(userId);
    }

    const result = await this.db.query(`
      SELECT UNNEST(tags) as tag, COUNT(*) as count
      FROM notes
      WHERE ${conditions.join(' AND ')}
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `, values);

    return result.rows;
  }

  /**
   * Get note statistics
   */
  async getStatistics(userId = null) {
    const conditions = [];
    const values = [];

    if (userId) {
      conditions.push(`user_id = $1`);
      values.push(userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.db.query(`
      SELECT
        COUNT(*) as total_notes,
        COUNT(*) FILTER (WHERE source = 'voice') as voice_notes,
        COUNT(*) FILTER (WHERE source = 'upload') as uploaded_docs,
        COUNT(*) FILTER (WHERE source = 'manual') as manual_notes,
        COUNT(*) FILTER (WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days') as notes_this_week,
        COUNT(*) FILTER (WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days') as notes_this_month
      FROM notes
      ${whereClause}
    `, values);

    return result.rows[0];
  }

  /**
   * Create document chunk for large documents
   */
  async createChunk(noteId, chunkIndex, content, metadata = {}) {
    const result = await this.db.query(`
      INSERT INTO document_chunks (note_id, chunk_index, content, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [noteId, chunkIndex, content, metadata]);

    return result.rows[0];
  }

  /**
   * Get chunks for a note
   */
  async getChunks(noteId) {
    const result = await this.db.query(`
      SELECT * FROM document_chunks
      WHERE note_id = $1
      ORDER BY chunk_index ASC
    `, [noteId]);

    return result.rows;
  }

  /**
   * Log note access
   */
  async logAccess(noteId, accessType, userId = null, sessionId = null) {
    await this.db.query(`
      INSERT INTO note_access_log (note_id, access_type, user_id, session_id)
      VALUES ($1, $2, $3, $4)
    `, [noteId, accessType, userId, sessionId]);
  }

  /**
   * Create note relationship
   */
  async createRelationship(sourceNoteId, targetNoteId, relationshipType, metadata = {}) {
    const result = await this.db.query(`
      INSERT INTO note_relationships (source_note_id, target_note_id, relationship_type, metadata)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (source_note_id, target_note_id, relationship_type) DO NOTHING
      RETURNING *
    `, [sourceNoteId, targetNoteId, relationshipType, metadata]);

    return result.rows[0];
  }

  /**
   * Get related notes
   */
  async getRelatedNotes(noteId, relationshipType = null) {
    const conditions = ['nr.source_note_id = $1'];
    const values = [noteId];

    if (relationshipType) {
      conditions.push('nr.relationship_type = $2');
      values.push(relationshipType);
    }

    const result = await this.db.query(`
      SELECT
        n.id,
        n.title,
        LEFT(n.content, 200) as preview,
        nr.relationship_type,
        nr.created_at as related_at
      FROM note_relationships nr
      JOIN notes n ON n.id = nr.target_note_id
      WHERE ${conditions.join(' AND ')} AND n.status = 'active'
      ORDER BY nr.created_at DESC
    `, values);

    return result.rows;
  }

  /**
   * Save knowledge chat message
   */
  async saveChatMessage(sessionId, userQuery, aiResponse, options = {}) {
    const {
      sourceNotes = [],
      contextChunks = [],
      model = null,
      latencyMs = null,
      confidenceScore = null,
      voiceInput = false,
      voiceOutput = false,
      audioPath = null
    } = options;

    const result = await this.db.query(`
      INSERT INTO knowledge_chats (
        session_id, user_query, ai_response, source_notes, context_chunks,
        model, latency_ms, confidence_score,
        voice_input, voice_output, audio_path
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      sessionId, userQuery, aiResponse, sourceNotes, contextChunks,
      model, latencyMs, confidenceScore,
      voiceInput, voiceOutput, audioPath
    ]);

    return result.rows[0];
  }

  /**
   * Get chat history
   */
  async getChatHistory(sessionId, limit = 50) {
    const result = await this.db.query(`
      SELECT * FROM knowledge_chats
      WHERE session_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [sessionId, limit]);

    return result.rows.reverse(); // Oldest first
  }

  /**
   * Create approval request
   */
  async createApproval(actionType, proposedData, options = {}) {
    const {
      reasoning = null,
      relatedNotes = [],
      sessionId = null,
      userId = null
    } = options;

    const result = await this.db.query(`
      INSERT INTO knowledge_approvals (
        action_type, proposed_data, reasoning,
        related_notes, session_id, user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [actionType, proposedData, reasoning, relatedNotes, sessionId, userId]);

    return result.rows[0];
  }

  /**
   * Update approval status
   */
  async updateApproval(approvalId, approved) {
    const status = approved ? 'approved' : 'rejected';
    const timestampField = approved ? 'approved_at' : 'rejected_at';

    const result = await this.db.query(`
      UPDATE knowledge_approvals
      SET status = $1, ${timestampField} = CURRENT_TIMESTAMP
      WHERE id = $2 AND status = 'pending'
      RETURNING *
    `, [status, approvalId]);

    if (result.rows.length === 0) {
      throw new Error('Approval not found or already processed');
    }

    return result.rows[0];
  }

  /**
   * Get pending approvals
   */
  async getPendingApprovals(userId = null, sessionId = null) {
    const conditions = ["status = 'pending'", "expires_at > CURRENT_TIMESTAMP"];
    const values = [];

    if (userId) {
      conditions.push(`user_id = $${values.length + 1}`);
      values.push(userId);
    }

    if (sessionId) {
      conditions.push(`session_id = $${values.length + 1}`);
      values.push(sessionId);
    }

    const result = await this.db.query(`
      SELECT * FROM knowledge_approvals
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `, values);

    return result.rows;
  }
}

module.exports = KnowledgeStore;
