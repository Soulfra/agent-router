/**
 * Symbolic Router
 *
 * Resolves symbolic URIs (e.g., "git:commit_abc") to actual API calls
 * across isolated services. This is the "hack" that makes isolated
 * databases communicate via symbolic references without knowing about each other.
 *
 * Service Endpoints:
 * - git: Port 11435 (/api/git/*)
 * - copilot: Port 11437 (/api/copilot/*)
 * - gaming: Port 11436 (/api/gaming/*)
 * - ocr: Port 11436 (/api/ocr/*)
 * - visual: Port 5001 (/api/visual/*)
 * - knowledge: Database queries
 */

const axios = require('axios');

class SymbolicRouter {
  constructor({ tripleStore, gitAdapter, copilotAdapter, gamingAdapter, ocrAdapter, db }) {
    this.tripleStore = tripleStore;
    this.adapters = {
      git: gitAdapter,
      copilot: copilotAdapter,
      gaming: gamingAdapter,
      ocr: ocrAdapter
    };
    this.db = db;

    // Service endpoint mappings
    this.serviceEndpoints = {
      git: 'http://localhost:5001/api/git',
      copilot: 'http://localhost:5001/api/copilot',
      gaming: 'http://localhost:5001/api/gaming',
      ocr: 'http://localhost:5001/api/ocr',
      visual: 'http://localhost:5001/api/visual',
      knowledge: 'database' // Special case - direct DB queries
    };
  }

  /**
   * Fetch data for a symbolic URI
   * Example: fetch("git:commit_abc123") → calls Git service
   */
  async fetch(uri, options = {}) {
    const { service, resource } = this.parseURI(uri);

    console.log(`[SymbolicRouter] Fetching ${uri} (service: ${service}, resource: ${resource})`);

    // Route to appropriate service
    switch (service) {
      case 'git':
        return this.fetchFromGit(resource, options);
      case 'copilot':
        return this.fetchFromCopilot(resource, options);
      case 'gaming':
        return this.fetchFromGaming(resource, options);
      case 'ocr':
        return this.fetchFromOCR(resource, options);
      case 'visual':
        return this.fetchFromVisual(resource, options);
      case 'knowledge':
        return this.fetchFromKnowledge(resource, options);
      default:
        throw new Error(`Unknown service: ${service}`);
    }
  }

  /**
   * Fetch data from Git service
   */
  async fetchFromGit(resource, options) {
    // Parse resource type
    const [type, ...rest] = resource.split('_');
    const identifier = rest.join('_');

    const endpoint = this.serviceEndpoints.git;

    try {
      // Make real HTTP call to Git service
      const response = await axios.get(`${endpoint}/${type}/${identifier}`);
      return {
        uri: `git:${resource}`,
        type,
        data: response.data
      };
    } catch (error) {
      console.error(`[SymbolicRouter] Git service error: ${error.message}`);
      // Return minimal fallback on error
      return {
        uri: `git:${resource}`,
        type,
        error: error.message,
        data: { note: 'Git service unavailable, using fallback' }
      };
    }
  }

  /**
   * Fetch data from Copilot service
   */
  async fetchFromCopilot(resource, options) {
    const [type, ...rest] = resource.split('_');
    const identifier = rest.join('_');

    const endpoint = this.serviceEndpoints.copilot;

    try {
      // Make real HTTP call to Copilot service
      const response = await axios.get(`${endpoint}/${type}/${identifier}`);
      return {
        uri: `copilot:${resource}`,
        type,
        data: response.data
      };
    } catch (error) {
      console.error(`[SymbolicRouter] Copilot service error: ${error.message}`);
      // Return minimal fallback on error
      return {
        uri: `copilot:${resource}`,
        type,
        error: error.message,
        data: { note: 'Copilot service unavailable, using fallback' }
      };
    }
  }

  /**
   * Fetch data from Gaming service
   */
  async fetchFromGaming(resource, options) {
    const [type, ...rest] = resource.split('_');
    const identifier = rest.join('_');

    const endpoint = this.serviceEndpoints.gaming;

    try {
      // Make real HTTP call to Gaming service
      const response = await axios.get(`${endpoint}/${type}/${identifier}`);
      return {
        uri: `gaming:${resource}`,
        type,
        data: response.data
      };
    } catch (error) {
      console.error(`[SymbolicRouter] Gaming service error: ${error.message}`);
      // Return minimal fallback on error
      return {
        uri: `gaming:${resource}`,
        type,
        error: error.message,
        data: { note: 'Gaming service unavailable, using fallback' }
      };
    }
  }

  /**
   * Fetch data from OCR service
   */
  async fetchFromOCR(resource, options) {
    const [type, ...rest] = resource.split('_');
    const identifier = rest.join('_');

    const endpoint = this.serviceEndpoints.ocr;

    try {
      // Make real HTTP call to OCR service
      const response = await axios.get(`${endpoint}/${type}/${identifier}`);
      return {
        uri: `ocr:${resource}`,
        type,
        data: response.data
      };
    } catch (error) {
      console.error(`[SymbolicRouter] OCR service error: ${error.message}`);
      // Return minimal fallback on error
      return {
        uri: `ocr:${resource}`,
        type,
        error: error.message,
        data: { note: 'OCR service unavailable, using fallback' }
      };
    }
  }

  /**
   * Fetch data from Visual generation service
   */
  async fetchFromVisual(resource, options) {
    const [type, ...rest] = resource.split('_');
    const identifier = rest.join('_');

    const endpoint = this.serviceEndpoints.visual;

    try {
      // Make real HTTP call to Visual service
      const response = await axios.get(`${endpoint}/${type}/${identifier}`);
      return {
        uri: `visual:${resource}`,
        type,
        data: response.data
      };
    } catch (error) {
      console.error(`[SymbolicRouter] Visual service error: ${error.message}`);
      // Return minimal fallback on error
      return {
        uri: `visual:${resource}`,
        type,
        error: error.message,
        data: { note: 'Visual service unavailable, using fallback' }
      };
    }
  }

  /**
   * Fetch data from Knowledge database
   */
  async fetchFromKnowledge(resource, options) {
    if (!this.db) {
      throw new Error('Database not available for knowledge queries');
    }

    const [type, ...rest] = resource.split('_');
    const identifier = rest.join('_');

    switch (type) {
      case 'concept':
        const result = await this.db.query(`
          SELECT * FROM knowledge_concepts WHERE concept_slug = $1
        `, [identifier]);

        if (result.rows.length === 0) {
          return null;
        }

        return {
          uri: `knowledge:concept_${identifier}`,
          type: 'concept',
          data: result.rows[0]
        };

      case 'tutorial':
        return {
          uri: `knowledge:tutorial_${identifier}`,
          type: 'tutorial',
          data: {
            tutorial_id: identifier,
            title: 'How to build X',
            demonstrates_uri: `gaming:quest_${identifier}`
          }
        };

      default:
        throw new Error(`Unknown Knowledge resource type: ${type}`);
    }
  }

  /**
   * Resolve a triple query across services
   * Example: resolve("gaming:npc_shopkeeper", "hasDialogue", "?")
   * Returns: The dialogue tree data from Visual service
   */
  async resolve(subject, predicate, object) {
    // Query triple store for relationships
    const triples = await this.tripleStore.query(subject, predicate, object);

    if (triples.length === 0) {
      console.log(`[SymbolicRouter] No triples found for query: ${subject} ${predicate} ${object}`);
      return [];
    }

    // Fetch data for each result
    const results = [];
    for (const triple of triples) {
      // Determine which URI to fetch
      const fetchURI = object === '?' || object.startsWith('?') ? triple[object] : subject;

      try {
        const data = await this.fetch(fetchURI);
        results.push({
          triple,
          data
        });
      } catch (error) {
        console.error(`[SymbolicRouter] Failed to fetch ${fetchURI}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Parse URI into components
   */
  parseURI(uri) {
    const [service, ...rest] = uri.split(':');
    return {
      service,
      resource: rest.join(':')
    };
  }

  /**
   * Test connection to a service
   */
  async testService(service) {
    try {
      if (service === 'knowledge') {
        if (!this.db) return false;
        const result = await this.db.query('SELECT 1');
        return result.rows.length > 0;
      }

      const endpoint = this.serviceEndpoints[service];
      if (!endpoint) return false;

      // Try health endpoint
      const response = await axios.get(`${endpoint}/health`, { timeout: 3000 });
      return response.data.success === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get service status for all services
   */
  async getServiceStatus() {
    const services = Object.keys(this.serviceEndpoints);
    const status = {};

    for (const service of services) {
      status[service] = await this.testService(service);
    }

    return status;
  }
}

module.exports = SymbolicRouter;
