/**
 * Librarian Routes
 *
 * API endpoints for the "omniscient librarian" facade that orchestrates
 * queries across isolated services via symbolic mappings.
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function createLibrarianRoutes({ librarian, tripleStore, symbolicRouter }) {
  if (!librarian) {
    throw new Error('LibrarianFacade required for librarian routes');
  }

  // ============================================================================
  // QUERY (Unified Interface)
  // ============================================================================

  /**
   * POST /api/librarian/query
   * Query the librarian with natural language or semantic queries
   *
   * Request body:
   * {
   *   "question": "Show me NPCs with dialogues",
   *   "options": { "limit": 10 }
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "query": {...},
   *   "results": {...},
   *   "metadata": {
   *     "services_accessed": ["gaming", "visual"],
   *     "unified_by": "librarian-facade"
   *   }
   * }
   */
  router.post('/query', async (req, res) => {
    try {
      const { question, options = {} } = req.body;

      if (!question) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: question'
        });
      }

      const result = await librarian.query(question, options);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[LibrarianRoutes] Query error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // TRIPLE OPERATIONS
  // ============================================================================

  /**
   * POST /api/librarian/triple
   * Perform RDF-style triple query (subject-predicate-object)
   *
   * Request body:
   * {
   *   "subject": "gaming:npc_shopkeeper",
   *   "predicate": "hasDialogue",
   *   "object": "?"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "triples": [...],
   *   "count": 1
   * }
   */
  router.post('/triple', async (req, res) => {
    try {
      const { subject, predicate, object } = req.body;

      if (!subject || !predicate || !object) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: subject, predicate, object'
        });
      }

      const triples = await tripleStore.query(subject, predicate, object);

      // Enrich with data
      const enriched = await Promise.all(
        triples.map(async (triple) => {
          const data = {};
          // Fetch subject data if concrete
          if (!subject.startsWith('?')) {
            try {
              data.subject = await symbolicRouter.fetch(subject);
            } catch (e) {
              data.subject = { error: e.message };
            }
          }
          // Fetch object data if concrete
          if (!object.startsWith('?') && triple[object]) {
            try {
              data.object = await symbolicRouter.fetch(triple[object]);
            } catch (e) {
              data.object = { error: e.message };
            }
          }
          return { triple, data };
        })
      );

      res.json({
        success: true,
        triples: enriched,
        count: triples.length
      });
    } catch (error) {
      console.error('[LibrarianRoutes] Triple query error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/librarian/triple/add
   * Add a new triple to the store
   */
  router.post('/triple/add', async (req, res) => {
    try {
      const { subject, predicate, object, metadata = {} } = req.body;

      if (!subject || !predicate || !object) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: subject, predicate, object'
        });
      }

      const triple = await tripleStore.addTriple(subject, predicate, object, metadata);

      res.json({
        success: true,
        triple
      });
    } catch (error) {
      console.error('[LibrarianRoutes] Add triple error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // FETCH (Direct URI Resolution)
  // ============================================================================

  /**
   * POST /api/librarian/fetch
   * Fetch data for a symbolic URI
   *
   * Request body:
   * {
   *   "uri": "gaming:npc_shopkeeper"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "uri": "gaming:npc_shopkeeper",
   *   "data": {...},
   *   "related": [...]
   * }
   */
  router.post('/fetch', async (req, res) => {
    try {
      const { uri, options = {} } = req.body;

      if (!uri) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: uri'
        });
      }

      const data = await symbolicRouter.fetch(uri, options);

      // Also fetch related triples
      const related = await tripleStore.queryBySubject(uri);

      res.json({
        success: true,
        uri,
        data,
        related: related.map(t => ({
          predicate: t.predicate,
          object: t.object
        }))
      });
    } catch (error) {
      console.error('[LibrarianRoutes] Fetch error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // MAP (View Symbolic Mappings)
  // ============================================================================

  /**
   * GET /api/librarian/map
   * View all symbolic mappings (triples)
   *
   * Response:
   * {
   *   "success": true,
   *   "services": ["git", "copilot", "gaming", "ocr", "visual"],
   *   "triples": [...],
   *   "stats": {...}
   * }
   */
  router.get('/map', async (req, res) => {
    try {
      const stats = tripleStore.getStats();
      const services = tripleStore.getServices();

      // Get sample triples for each service
      const serviceMappings = {};
      for (const service of services) {
        serviceMappings[service] = await tripleStore.queryByService(service);
      }

      res.json({
        success: true,
        services,
        stats,
        mappings: serviceMappings
      });
    } catch (error) {
      console.error('[LibrarianRoutes] Map error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/librarian/map/export
   * Export triples as RDF N-Triples format
   */
  router.get('/map/export', async (req, res) => {
    try {
      const ntriples = tripleStore.exportNTriples();

      res.type('text/plain');
      res.send(ntriples);
    } catch (error) {
      console.error('[LibrarianRoutes] Export error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // STATS & HEALTH
  // ============================================================================

  /**
   * GET /api/librarian/stats
   * Get librarian statistics (demonstrate omniscience)
   */
  router.get('/stats', async (req, res) => {
    try {
      const stats = await librarian.getStats();

      res.json({
        success: true,
        ...stats
      });
    } catch (error) {
      console.error('[LibrarianRoutes] Stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/librarian/health
   * Health check
   */
  router.get('/health', async (req, res) => {
    try {
      const health = await librarian.health();

      res.json({
        success: true,
        ...health
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/librarian/demo
   * Demonstrate the "illusion" (how it works)
   */
  router.get('/demo', async (req, res) => {
    try {
      const demo = await librarian.demonstrateIllusion();

      res.json({
        success: true,
        ...demo
      });
    } catch (error) {
      console.error('[LibrarianRoutes] Demo error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // SERVICE STATUS
  // ============================================================================

  /**
   * GET /api/librarian/services
   * Get status of all services
   */
  router.get('/services', async (req, res) => {
    try {
      const status = await symbolicRouter.getServiceStatus();

      res.json({
        success: true,
        services: status
      });
    } catch (error) {
      console.error('[LibrarianRoutes] Service status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/librarian/discovery
   * Service discovery - shows all ports and what's running on them
   *
   * Response:
   * {
   *   "success": true,
   *   "main_router": {...},
   *   "ollama_services": [...],
   *   "mobile_access": {...}
   * }
   */
  router.get('/discovery', async (req, res) => {
    try {
      const os = require('os');
      const interfaces = os.networkInterfaces();

      // Get local IP
      let localIP = null;
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localIP = iface.address;
            break;
          }
        }
        if (localIP) break;
      }

      const port = process.env.PORT || 5001;

      // Service status
      const serviceStatus = await symbolicRouter.getServiceStatus();

      res.json({
        success: true,
        main_router: {
          port: port,
          host: '0.0.0.0',
          description: 'Main CalOS Router - All API endpoints',
          urls: {
            localhost: `http://localhost:${port}`,
            mobile: localIP ? `http://${localIP}:${port}` : null,
            websocket: `ws://localhost:${port}`
          },
          endpoints: {
            librarian: `/api/librarian/*`,
            gaming: `/api/gaming/*`,
            git: `/api/git/*`,
            copilot: `/api/copilot/*`,
            ocr: `/api/ocr/*`,
            visual: `/api/visual/*`
          }
        },
        ollama_services: [
          {
            name: 'Git Service',
            port: 11435,
            url: `http://localhost:11435`,
            description: 'Ollama instance for git operations',
            features: ['commit messages', 'code review', 'PR analysis'],
            status: serviceStatus.git || false
          },
          {
            name: 'Gaming + OCR Service',
            port: 11436,
            url: `http://localhost:11436`,
            description: 'Shared Ollama instance for gaming and OCR',
            features: ['NPC dialogue', 'quest generation', 'image OCR', 'text extraction'],
            status: serviceStatus.gaming || serviceStatus.ocr || false
          },
          {
            name: 'Copilot Service',
            port: 11437,
            url: `http://localhost:11437`,
            description: 'Ollama instance for code copilot',
            features: ['code completion', 'build scripts', 'refactoring'],
            status: serviceStatus.copilot || false
          }
        ],
        mobile_access: {
          enabled: localIP !== null,
          local_ip: localIP,
          mobile_url: localIP ? `http://${localIP}:${port}` : null,
          pwa_installable: true,
          instructions: localIP
            ? `Open ${localIP}:${port} in your phone's browser (must be on same WiFi network)`
            : 'Local IP not detected - check network connection'
        },
        network_info: {
          hostname: os.hostname(),
          platform: os.platform(),
          network_interfaces: Object.keys(interfaces).filter(name => {
            return interfaces[name].some(iface =>
              iface.family === 'IPv4' && !iface.internal
            );
          })
        }
      });
    } catch (error) {
      console.error('[LibrarianRoutes] Discovery error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // FRAUD DETECTION & API KEY VERIFICATION
  // ============================================================================

  /**
   * POST /api/librarian/verify-key
   * Verify if an API key shows suspicious activity
   *
   * Request body:
   * {
   *   "key_id": "123",
   *   "ip_address": "1.2.3.4" (optional - verify if key is being used from known IP)
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "key_id": "123",
   *   "suspicious": false,
   *   "analysis": {...},
   *   "ip_verification": {...}
   * }
   */
  router.post('/verify-key', async (req, res) => {
    try {
      const { key_id, ip_address } = req.body;

      if (!key_id) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: key_id'
        });
      }

      // Use librarian to perform fraud detection
      const fraudAnalysis = await librarian.query(`Is API key ${key_id} suspicious?`);

      // If IP provided, verify it's a known IP for this key
      let ipVerification = null;
      if (ip_address) {
        const ipQuery = await librarian.query(`Show me IPs for key ${key_id}`);
        const knownIPs = ipQuery.results?.results?.ips || [];
        const isKnownIP = knownIPs.some(ip => ip.ip === ip_address);

        ipVerification = {
          ip_address,
          is_known_ip: isKnownIP,
          known_ips: knownIPs.map(ip => ip.ip),
          warning: !isKnownIP && knownIPs.length > 0 ? 'Key used from new IP address' : null
        };
      }

      const analysis = fraudAnalysis.results?.analysis || {};

      res.json({
        success: true,
        key_id,
        suspicious: analysis.suspicious || false,
        analysis: {
          flags: analysis.flags || {},
          details: analysis.details || {}
        },
        ip_verification: ipVerification,
        recommendation: fraudAnalysis.results?.recommendation || 'Unable to analyze key activity'
      });
    } catch (error) {
      console.error('[LibrarianRoutes] Verify key error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/librarian/analyze-ip
   * Analyze an IP address for suspicious activity (credential stuffing)
   *
   * Request body:
   * {
   *   "ip_address": "1.2.3.4"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "ip_address": "1.2.3.4",
   *   "suspicious": false,
   *   "unique_keys_used": 2,
   *   "warning": null
   * }
   */
  router.post('/analyze-ip', async (req, res) => {
    try {
      const { ip_address } = req.body;

      if (!ip_address) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: ip_address'
        });
      }

      // Query for keys used by this IP
      const query = await librarian.query(`Has IP ${ip_address} used multiple keys?`);

      res.json({
        success: true,
        ...query.results
      });
    } catch (error) {
      console.error('[LibrarianRoutes] Analyze IP error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createLibrarianRoutes;
