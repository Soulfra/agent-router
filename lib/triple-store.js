/**
 * Triple Store
 *
 * RDF-style semantic database for symbolic mappings across isolated services.
 * Stores triples (subject-predicate-object) that define relationships between
 * resources in different databases/services, creating the "librarian illusion"
 * of unified knowledge while maintaining isolated closed-loop systems.
 *
 * Example Triples:
 * - git:commit_abc123 hasContext copilot:code_review_123
 * - gaming:npc_shopkeeper hasDialogue visual:dialogue_tree_merchant
 * - ocr:image_doc123 extractedFrom git:repo_docs
 */

class TripleStore {
  constructor(db) {
    this.db = db;
    // In-memory cache for fast lookup
    this.triples = new Map(); // subject -> [{predicate, object}]
    this.inverseIndex = new Map(); // object -> [{predicate, subject}]
  }

  /**
   * Add a triple to the store
   */
  async addTriple(subject, predicate, object, metadata = {}) {
    // Validate URIs
    this.validateURI(subject, 'subject');
    this.validateURI(object, 'object');

    // Store in database
    if (this.db) {
      try {
        await this.db.query(`
          INSERT INTO semantic_triples (subject, predicate, object, metadata)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (subject, predicate, object) DO UPDATE
          SET metadata = $4, updated_at = NOW()
        `, [subject, predicate, object, JSON.stringify(metadata)]);
      } catch (error) {
        // Table might not exist yet, continue with in-memory only
        console.warn('[TripleStore] Database storage unavailable, using memory only');
      }
    }

    // Update in-memory cache
    if (!this.triples.has(subject)) {
      this.triples.set(subject, []);
    }
    this.triples.get(subject).push({ predicate, object, metadata });

    // Update inverse index (for querying objects)
    if (!this.inverseIndex.has(object)) {
      this.inverseIndex.set(object, []);
    }
    this.inverseIndex.get(object).push({ predicate, subject, metadata });

    console.log(`[TripleStore] Added: ${subject} --${predicate}--> ${object}`);
    return { subject, predicate, object };
  }

  /**
   * Query triples by subject
   */
  async queryBySubject(subject, predicate = null) {
    const triples = this.triples.get(subject) || [];

    if (predicate) {
      return triples.filter(t => t.predicate === predicate);
    }

    return triples;
  }

  /**
   * Query triples by object (inverse query)
   */
  async queryByObject(object, predicate = null) {
    const triples = this.inverseIndex.get(object) || [];

    if (predicate) {
      return triples.filter(t => t.predicate === predicate);
    }

    return triples;
  }

  /**
   * Query triples by predicate
   */
  async queryByPredicate(predicate) {
    const results = [];

    for (const [subject, triples] of this.triples.entries()) {
      for (const triple of triples) {
        if (triple.predicate === predicate) {
          results.push({
            subject,
            predicate,
            object: triple.object,
            metadata: triple.metadata
          });
        }
      }
    }

    return results;
  }

  /**
   * SPARQL-like query (simplified)
   * Example: query("?x", "hasDialogue", "visual:tree_123")
   */
  async query(subject, predicate, object) {
    const results = [];

    // Subject is variable
    if (subject === '?' || subject.startsWith('?')) {
      if (object && object !== '?' && !object.startsWith('?')) {
        // Query by object
        const triples = await this.queryByObject(object, predicate !== '?' ? predicate : null);
        for (const t of triples) {
          results.push({ [subject]: t.subject, predicate: t.predicate, object });
        }
      } else {
        // Query by predicate
        const triples = await this.queryByPredicate(predicate);
        for (const t of triples) {
          results.push({ [subject]: t.subject, predicate, object: t.object });
        }
      }
    }
    // Object is variable
    else if (object === '?' || object.startsWith('?')) {
      const triples = await this.queryBySubject(subject, predicate !== '?' ? predicate : null);
      for (const t of triples) {
        results.push({ subject, predicate: t.predicate, [object]: t.object });
      }
    }
    // Exact match
    else {
      const triples = await this.queryBySubject(subject, predicate);
      const match = triples.find(t => t.object === object);
      if (match) {
        results.push({ subject, predicate, object });
      }
    }

    return results;
  }

  /**
   * Get all triples for a service namespace
   */
  async queryByService(servicePrefix) {
    const results = [];

    for (const [subject, triples] of this.triples.entries()) {
      if (subject.startsWith(servicePrefix + ':')) {
        for (const triple of triples) {
          results.push({
            subject,
            predicate: triple.predicate,
            object: triple.object,
            metadata: triple.metadata
          });
        }
      }
    }

    return results;
  }

  /**
   * Parse URI into service and resource
   * Example: "git:commit_abc123" -> {service: "git", resource: "commit_abc123"}
   */
  parseURI(uri) {
    const [service, ...rest] = uri.split(':');
    return {
      service,
      resource: rest.join(':')
    };
  }

  /**
   * Validate URI format
   */
  validateURI(uri, type) {
    if (!uri || typeof uri !== 'string') {
      throw new Error(`Invalid ${type} URI: must be a string`);
    }

    if (!uri.includes(':')) {
      throw new Error(`Invalid ${type} URI: ${uri} - must include namespace (e.g., "service:resource")`);
    }

    return true;
  }

  /**
   * Get all subjects for a service
   */
  getServiceSubjects(service) {
    const subjects = [];

    for (const subject of this.triples.keys()) {
      if (subject.startsWith(service + ':')) {
        subjects.push(subject);
      }
    }

    return subjects;
  }

  /**
   * Load pre-defined symbolic mappings
   */
  async loadDefaultMappings() {
    console.log('[TripleStore] Loading default symbolic mappings...');

    // Git ↔ Copilot
    await this.addTriple('git:commit', 'analyzedBy', 'copilot:code_review', { type: 'service_link' });
    await this.addTriple('git:diff', 'explainedBy', 'copilot:explanation', { type: 'service_link' });

    // Gaming ↔ Visual
    await this.addTriple('gaming:npc', 'hasDialogue', 'visual:dialogue_tree', { type: 'service_link' });
    await this.addTriple('gaming:map', 'visualizedBy', 'visual:tilemap', { type: 'service_link' });
    await this.addTriple('gaming:quest', 'hasStructure', 'visual:mermaid', { type: 'service_link' });

    // OCR ↔ Visual
    await this.addTriple('ocr:text_extraction', 'producesStructure', 'visual:markdown', { type: 'service_link' });
    await this.addTriple('ocr:map_analysis', 'creates', 'gaming:map_data', { type: 'service_link' });

    // Git ↔ Visual
    await this.addTriple('git:pull_request', 'visualizedAs', 'visual:mermaid', { type: 'service_link' });
    await this.addTriple('git:repo_structure', 'diagrammedAs', 'visual:dot', { type: 'service_link' });

    // Copilot ↔ Gaming
    await this.addTriple('copilot:code_gen', 'implements', 'gaming:asset_logic', { type: 'service_link' });

    // Cross-domain
    await this.addTriple('knowledge:concept', 'hasExample', 'copilot:code_snippet', { type: 'knowledge_link' });
    await this.addTriple('knowledge:tutorial', 'demonstrates', 'gaming:quest_system', { type: 'knowledge_link' });

    console.log('[TripleStore] Loaded 12 default mappings');
    return this.triples.size;
  }

  /**
   * Export all triples as RDF N-Triples format
   */
  exportNTriples() {
    const lines = [];

    for (const [subject, triples] of this.triples.entries()) {
      for (const triple of triples) {
        lines.push(`<${subject}> <${triple.predicate}> <${triple.object}> .`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get statistics
   */
  getStats() {
    const subjects = this.triples.size;
    let predicates = new Set();
    let objectCount = 0;

    for (const triples of this.triples.values()) {
      for (const triple of triples) {
        predicates.add(triple.predicate);
        objectCount++;
      }
    }

    return {
      subjects,
      unique_predicates: predicates.size,
      total_triples: objectCount,
      services: this.getServices()
    };
  }

  /**
   * Get all unique services
   */
  getServices() {
    const services = new Set();

    for (const subject of this.triples.keys()) {
      const { service } = this.parseURI(subject);
      services.add(service);
    }

    return Array.from(services);
  }
}

module.exports = TripleStore;
