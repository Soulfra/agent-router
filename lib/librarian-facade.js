/**
 * Librarian Facade
 *
 * The "know-it-all" interface that appears omniscient but only orchestrates
 * fetch operations across isolated databases via symbolic mappings.
 *
 * This is the illusion: the librarian doesn't store data, it just knows
 * where to find it and how to connect it semantically.
 *
 * Key Concepts:
 * - Acts as unified knowledge interface
 * - Orchestrates queries across isolated services
 * - Returns unified results as if from single source
 * - Each service remains unaware of others
 * - "Tricked" into cooperation via symbolic references
 */

class LibrarianFacade {
  constructor({ tripleStore, symbolicRouter, apiKeyActivityTracker = null, webSearchAdapter = null }) {
    this.tripleStore = tripleStore;
    this.symbolicRouter = symbolicRouter;
    this.apiKeyActivityTracker = apiKeyActivityTracker;
    this.webSearchAdapter = webSearchAdapter;

    console.log('[Librarian] Facade initialized - ready to appear omniscient');
    if (webSearchAdapter) {
      console.log('[Librarian] Web search enabled - can fetch real-time data');
    }
  }

  /**
   * Query the "librarian" - appears to know everything
   * Actually just orchestrates fetches across services
   */
  async query(question, options = {}) {
    console.log(`[Librarian] Query: "${question}"`);

    // Parse question into semantic structure
    const semanticQuery = this.parseQuestion(question);

    // Resolve query via triple store + symbolic router
    const results = await this.resolveQuery(semanticQuery, options);

    // Unify results to appear as single source
    return this.unifyResults(results, semanticQuery);
  }

  /**
   * Parse natural language question into semantic query
   */
  parseQuestion(question) {
    const lowerQ = question.toLowerCase();

    // Pattern: "Show me X"
    if (lowerQ.match(/show me|give me|get me|find|list/)) {
      if (lowerQ.includes('npc') && lowerQ.includes('dialogue')) {
        return {
          type: 'triple_query',
          subject: 'gaming:npc',
          predicate: 'hasDialogue',
          object: '?'
        };
      }

      if (lowerQ.includes('commit') && lowerQ.includes('review')) {
        return {
          type: 'triple_query',
          subject: 'git:commit',
          predicate: 'analyzedBy',
          object: '?'
        };
      }

      if (lowerQ.includes('quest') && lowerQ.includes('diagram')) {
        return {
          type: 'triple_query',
          subject: 'gaming:quest',
          predicate: 'hasStructure',
          object: '?'
        };
      }

      if (lowerQ.includes('map') && lowerQ.includes('visual')) {
        return {
          type: 'triple_query',
          subject: 'gaming:map',
          predicate: 'visualizedBy',
          object: '?'
        };
      }
    }

    // Pattern: Fraud detection queries
    if (lowerQ.match(/suspicious|fraud|stolen|suspicious/)) {
      // Extract API key ID from question
      const keyMatch = question.match(/api[_\s]?key[:\s]+(\d+|[a-zA-Z0-9_-]+)/i) ||
                       question.match(/key[:\s]+(\d+)/i);
      if (keyMatch) {
        return {
          type: 'fraud_detection',
          target: 'api_key',
          target_id: keyMatch[1],
          analysis: 'full'
        };
      }
    }

    // Pattern: "Show me IPs for key X"
    if (lowerQ.match(/show|list|get/) && lowerQ.match(/ip|address/) && lowerQ.match(/key|api/)) {
      const keyMatch = question.match(/key[:\s]+(\d+|[a-zA-Z0-9_-]+)/i);
      if (keyMatch) {
        return {
          type: 'fraud_query',
          query_type: 'ips_for_key',
          key_id: keyMatch[1]
        };
      }
    }

    // Pattern: "Show me services for key X"
    if (lowerQ.match(/show|list|get/) && lowerQ.match(/service/) && lowerQ.match(/key|api/)) {
      const keyMatch = question.match(/key[:\s]+(\d+|[a-zA-Z0-9_-]+)/i);
      if (keyMatch) {
        return {
          type: 'fraud_query',
          query_type: 'services_for_key',
          key_id: keyMatch[1]
        };
      }
    }

    // Pattern: "Has IP X used multiple keys?"
    if (lowerQ.match(/has|check/) && lowerQ.match(/ip|address/) && lowerQ.match(/multiple|many|different/) && lowerQ.match(/key/)) {
      const ipMatch = question.match(/ip[:\s]+([0-9.]+)/i);
      if (ipMatch) {
        return {
          type: 'fraud_query',
          query_type: 'keys_for_ip',
          ip_address: ipMatch[1]
        };
      }
    }

    // Pattern: Web search for current/recent information
    if (this.webSearchAdapter && this.webSearchAdapter.needsWebSearch(question)) {
      return {
        type: 'web_search',
        query: question,
        reason: 'Query requires real-time/current information'
      };
    }

    // Pattern: "What is X"
    if (lowerQ.match(/what is|describe|explain/)) {
      // Extract URI if present
      const uriMatch = question.match(/(\w+:\w+[\w_]*)/);
      if (uriMatch) {
        return {
          type: 'fetch',
          uri: uriMatch[1]
        };
      }
    }

    // Default: semantic search
    return {
      type: 'semantic',
      query: question
    };
  }

  /**
   * Resolve query using triple store and symbolic router
   */
  async resolveQuery(semanticQuery, options) {
    switch (semanticQuery.type) {
      case 'triple_query':
        return this.resolveTripleQuery(semanticQuery, options);

      case 'fetch':
        return this.resolveFetch(semanticQuery, options);

      case 'semantic':
        return this.resolveSemanticSearch(semanticQuery, options);

      case 'web_search':
        return this.resolveWebSearch(semanticQuery, options);

      case 'fraud_detection':
        return this.resolveFraudDetection(semanticQuery, options);

      case 'fraud_query':
        return this.resolveFraudQuery(semanticQuery, options);

      default:
        throw new Error(`Unknown query type: ${semanticQuery.type}`);
    }
  }

  /**
   * Resolve a triple query (subject-predicate-object)
   */
  async resolveTripleQuery(query, options) {
    const { subject, predicate, object } = query;

    // Query triple store for matching triples
    const triples = await this.tripleStore.query(subject, predicate, object);

    if (triples.length === 0) {
      return {
        type: 'triple_query',
        found: false,
        triples: [],
        message: 'No symbolic mappings found for this query'
      };
    }

    // Fetch data for each triple via symbolic router
    const enrichedTriples = [];

    for (const triple of triples) {
      // Determine which URIs to fetch
      const urisToFetch = [];

      // Add subject if it's a concrete URI
      if (!subject.startsWith('?')) {
        urisToFetch.push(subject);
      } else if (triple[subject]) {
        urisToFetch.push(triple[subject]);
      }

      // Add object if it's a concrete URI
      if (!object.startsWith('?')) {
        urisToFetch.push(object);
      } else if (triple[object]) {
        urisToFetch.push(triple[object]);
      }

      // Fetch data for each URI
      const fetchedData = {};
      for (const uri of urisToFetch) {
        try {
          fetchedData[uri] = await this.symbolicRouter.fetch(uri);
        } catch (error) {
          console.error(`[Librarian] Failed to fetch ${uri}:`, error.message);
          fetchedData[uri] = { error: error.message };
        }
      }

      enrichedTriples.push({
        triple,
        data: fetchedData
      });
    }

    return {
      type: 'triple_query',
      found: true,
      triples: enrichedTriples,
      count: triples.length
    };
  }

  /**
   * Resolve a direct URI fetch
   */
  async resolveFetch(query, options) {
    const { uri } = query;

    try {
      const data = await this.symbolicRouter.fetch(uri, options);

      // Also fetch related triples
      const relatedTriples = await this.tripleStore.queryBySubject(uri);

      return {
        type: 'fetch',
        found: true,
        uri,
        data,
        related: relatedTriples.map(t => ({
          predicate: t.predicate,
          object: t.object
        }))
      };
    } catch (error) {
      return {
        type: 'fetch',
        found: false,
        uri,
        error: error.message
      };
    }
  }

  /**
   * Resolve a semantic search across all services
   */
  async resolveSemanticSearch(query, options) {
    const { query: searchQuery } = query;

    // Get all services
    const services = this.tripleStore.getServices();

    // Search across each service
    const results = [];

    for (const service of services) {
      try {
        // Get all subjects for this service
        const subjects = this.tripleStore.getServiceSubjects(service);

        // For demo, return sample data
        if (subjects.length > 0) {
          results.push({
            service,
            matches: subjects.slice(0, 3), // Limit results
            score: Math.random() // Mock relevance score
          });
        }
      } catch (error) {
        console.error(`[Librarian] Semantic search failed for ${service}:`, error.message);
      }
    }

    return {
      type: 'semantic',
      query: searchQuery,
      results: results.sort((a, b) => b.score - a.score)
    };
  }

  /**
   * Resolve web search query - fetch real-time information from the internet
   */
  async resolveWebSearch(query, options) {
    if (!this.webSearchAdapter) {
      return {
        type: 'web_search',
        found: false,
        error: 'Web search not available',
        fallback_message: 'Cannot fetch real-time data without web search adapter'
      };
    }

    const { query: searchQuery, reason } = query;
    const limit = options.limit || 5;

    try {
      console.log(`[Librarian] Web search triggered: "${searchQuery}" (${reason})`);

      // Perform web search
      const searchResults = await this.webSearchAdapter.search(searchQuery, { limit });

      // Check if we got results
      if (!searchResults.results || searchResults.results.length === 0) {
        return {
          type: 'web_search',
          found: false,
          query: searchQuery,
          message: 'No web results found for this query'
        };
      }

      // Format results for display
      return {
        type: 'web_search',
        found: true,
        query: searchQuery,
        results: searchResults.results.map(r => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
          source: r.source,
          relevance: r.relevance
        })),
        count: searchResults.count,
        source: searchResults.source,
        timestamp: searchResults.timestamp,
        reason
      };
    } catch (error) {
      console.error(`[Librarian] Web search failed: ${error.message}`);
      return {
        type: 'web_search',
        found: false,
        error: error.message,
        query: searchQuery
      };
    }
  }

  /**
   * Unify results to appear as single source
   */
  unifyResults(results, semanticQuery) {
    return {
      query: semanticQuery,
      results,
      metadata: {
        queried_at: new Date().toISOString(),
        services_accessed: this.extractServices(results),
        unified_by: 'librarian-facade'
      }
    };
  }

  /**
   * Extract which services were accessed
   */
  extractServices(results) {
    const services = new Set();

    if (results.triples) {
      for (const t of results.triples) {
        for (const uri in t.data) {
          const [service] = uri.split(':');
          services.add(service);
        }
      }
    }

    if (results.uri) {
      const [service] = results.uri.split(':');
      services.add(service);
    }

    if (results.results) {
      for (const r of results.results) {
        if (r.service) services.add(r.service);
      }
    }

    return Array.from(services);
  }

  /**
   * Get librarian statistics (to demonstrate omniscience)
   */
  async getStats() {
    const tripleStats = this.tripleStore.getStats();
    const serviceStatus = await this.symbolicRouter.getServiceStatus();

    return {
      triple_store: tripleStats,
      services: serviceStatus,
      capabilities: {
        semantic_query: true,
        cross_service_resolution: true,
        unified_results: true,
        appears_omniscient: true
      },
      illusion: {
        appears_to_know: 'everything',
        actually_knows: 'where to fetch',
        databases_aware_of_each_other: false,
        hack_method: 'symbolic_mapping'
      }
    };
  }

  /**
   * Demonstrate the "hack" - show how isolated systems are connected
   */
  async demonstrateIllusion() {
    const demo = {
      title: 'The Librarian Illusion',
      description: 'Each database thinks it\'s autonomous. The librarian tricks them into cooperating via symbols.',

      example_1: {
        user_asks: 'Show me NPC dialogues',
        librarian_thinks: 'Query triple store for gaming:npc hasDialogue ?',
        triple_found: 'gaming:npc hasDialogue visual:dialogue_tree',
        fetches_from: ['gaming service (port 11436)', 'visual service (port 5001)'],
        services_know_each_other: false,
        result: 'Unified dialogue data appears as if from single source'
      },

      example_2: {
        user_asks: 'Analyze git commit',
        librarian_thinks: 'Query triple store for git:commit analyzedBy ?',
        triple_found: 'git:commit analyzedBy copilot:code_review',
        fetches_from: ['git service (port 11435)', 'copilot service (port 11437)'],
        services_know_each_other: false,
        result: 'Combined commit + review data returned'
      },

      the_hack: 'Symbolic URIs (e.g., "gaming:npc_123") act as universal references. Triple store maps relationships. Symbolic router resolves to actual API calls. Services remain isolated.',

      testing: {
        triple_test: 'Query with variables: gaming:npc hasDialogue ?',
        single_test: 'Direct fetch: gaming:npc_shopkeeper',
        verification: 'Both work. Services never directly communicate. Librarian orchestrates everything.'
      }
    };

    return demo;
  }

  /**
   * Health check
   */
  async health() {
    const serviceStatus = await this.symbolicRouter.getServiceStatus();
    const healthyServices = Object.values(serviceStatus).filter(v => v === true).length;
    const totalServices = Object.keys(serviceStatus).length;

    return {
      status: healthyServices > 0 ? 'operational' : 'degraded',
      services: serviceStatus,
      healthy: healthyServices,
      total: totalServices,
      triple_store: {
        triples: this.tripleStore.triples.size,
        services: this.tripleStore.getServices().length
      }
    };
  }

  /**
   * Resolve fraud detection query - full analysis of an API key
   */
  async resolveFraudDetection(query, options) {
    if (!this.apiKeyActivityTracker) {
      return {
        type: 'fraud_detection',
        found: false,
        error: 'API Key Activity Tracker not available'
      };
    }

    const { target_id } = query;

    try {
      // Get suspicious activity analysis
      const analysis = await this.apiKeyActivityTracker.detectSuspiciousActivity(target_id);

      // Get usage history
      const history = await this.apiKeyActivityTracker.getKeyUsageHistory(target_id, 50);

      return {
        type: 'fraud_detection',
        found: true,
        target: 'api_key',
        target_id,
        analysis,
        history,
        recommendation: analysis.suspicious
          ? 'This API key shows suspicious activity. Review usage patterns and consider revoking if confirmed stolen.'
          : 'This API key appears to have normal usage patterns.'
      };
    } catch (error) {
      return {
        type: 'fraud_detection',
        found: false,
        error: error.message
      };
    }
  }

  /**
   * Resolve fraud query - specific queries about API keys or IPs
   */
  async resolveFraudQuery(query, options) {
    if (!this.apiKeyActivityTracker) {
      return {
        type: 'fraud_query',
        found: false,
        error: 'API Key Activity Tracker not available'
      };
    }

    const { query_type } = query;

    try {
      switch (query_type) {
        case 'ips_for_key': {
          const keyURI = `api_key:${query.key_id}`;
          const ipTriples = await this.tripleStore.query(keyURI, 'usedFromIP', '?');

          const ips = ipTriples.map(t => ({
            ip: t['?'].replace('ip:', ''),
            first_seen: t.metadata?.timestamp,
            user_agent: t.metadata?.user_agent
          }));

          return {
            type: 'fraud_query',
            found: true,
            query_type: 'ips_for_key',
            key_id: query.key_id,
            results: {
              unique_ips: ips.length,
              ips: ips
            },
            warning: ips.length > 3 ? 'Multiple IPs detected - potential sharing or theft' : null
          };
        }

        case 'services_for_key': {
          const keyURI = `api_key:${query.key_id}`;
          const serviceTriples = await this.tripleStore.query(keyURI, 'accessed', '?');

          const services = {};
          for (const triple of serviceTriples) {
            const [service] = triple['?'].split(':');
            if (!services[service]) {
              services[service] = 0;
            }
            services[service]++;
          }

          return {
            type: 'fraud_query',
            found: true,
            query_type: 'services_for_key',
            key_id: query.key_id,
            results: {
              services: Object.keys(services),
              access_counts: services,
              total_accesses: serviceTriples.length
            }
          };
        }

        case 'keys_for_ip': {
          const ipURI = `ip:${query.ip_address}`;
          const keyTriples = await this.tripleStore.query(ipURI, 'usedKey', '?');

          const keys = keyTriples.map(t => ({
            key_id: t['?'].replace('api_key:', ''),
            first_seen: t.metadata?.timestamp
          }));

          // Check for credential stuffing
          const stuffingAnalysis = await this.apiKeyActivityTracker.detectCredentialStuffing(query.ip_address);

          return {
            type: 'fraud_query',
            found: true,
            query_type: 'keys_for_ip',
            ip_address: query.ip_address,
            results: {
              unique_keys: keys.length,
              keys: keys,
              credential_stuffing: stuffingAnalysis
            },
            warning: stuffingAnalysis.suspicious ? 'Potential credential stuffing detected' : null
          };
        }

        default:
          return {
            type: 'fraud_query',
            found: false,
            error: `Unknown fraud query type: ${query_type}`
          };
      }
    } catch (error) {
      return {
        type: 'fraud_query',
        found: false,
        error: error.message
      };
    }
  }
}

module.exports = LibrarianFacade;
