/**
 * Glossary Routes
 *
 * API endpoints for interactive documentation glossary/wordmap.
 * Generates knowledge graphs from markdown documentation.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const GlossaryBuilder = require('../lib/glossary-builder');

const builder = new GlossaryBuilder();

// Cache for generated graphs (avoid re-parsing on every request)
const graphCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/glossary/graph/:docName
 * Get knowledge graph for a specific documentation file
 *
 * Example: /api/glossary/graph/content-publishing-system
 */
router.get('/graph/:docName', async (req, res) => {
  try {
    const { docName } = req.params;

    // Map doc name to file path
    const docFiles = {
      'content-publishing-system': 'CONTENT_PUBLISHING_SYSTEM.md',
      'multiplayer-portal': 'MULTIPLAYER_PORTAL_SYSTEM.md',
      'portfolio-hub': 'PORTFOLIO_HUB_COMPLETE.md',
      'gmail-webhook': 'docs/GMAIL_WEBHOOK_ZERO_COST.md',
      'ragebait': 'docs/RAGEBAIT-API.md'
    };

    const fileName = docFiles[docName];
    if (!fileName) {
      return res.status(404).json({
        success: false,
        error: `Documentation not found: ${docName}`,
        available: Object.keys(docFiles)
      });
    }

    // Check cache
    const cacheKey = docName;
    const cached = graphCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log(`[GlossaryRoutes] Returning cached graph for ${docName}`);
      return res.json({
        success: true,
        cached: true,
        ...cached.data
      });
    }

    // Build graph
    const filePath = path.join(__dirname, '..', fileName);
    const graph = await builder.buildFromMarkdown(filePath);

    // Cache result
    graphCache.set(cacheKey, {
      timestamp: Date.now(),
      data: graph
    });

    res.json({
      success: true,
      cached: false,
      ...graph
    });

  } catch (error) {
    console.error('[GlossaryRoutes] Error generating graph:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/glossary/combined
 * Get combined knowledge graph from all documentation
 */
router.get('/combined', async (req, res) => {
  try {
    // Check cache
    const cacheKey = 'combined';
    const cached = graphCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log('[GlossaryRoutes] Returning cached combined graph');
      return res.json({
        success: true,
        cached: true,
        ...cached.data
      });
    }

    // Build combined graph from all docs
    const docFiles = [
      'CONTENT_PUBLISHING_SYSTEM.md',
      'MULTIPLAYER_PORTAL_SYSTEM.md',
      'PORTFOLIO_HUB_COMPLETE.md'
    ];

    const filePaths = docFiles.map(f => path.join(__dirname, '..', f));
    const graph = await builder.buildFromMultiple(filePaths);

    // Cache result
    graphCache.set(cacheKey, {
      timestamp: Date.now(),
      data: graph
    });

    res.json({
      success: true,
      cached: false,
      ...graph
    });

  } catch (error) {
    console.error('[GlossaryRoutes] Error generating combined graph:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/glossary/hierarchy/:docName
 * Get hierarchical glossary (traditional tree view)
 */
router.get('/hierarchy/:docName', async (req, res) => {
  try {
    const { docName } = req.params;

    // Get or build graph
    const graphResponse = await new Promise((resolve, reject) => {
      const mockReq = { params: { docName } };
      const mockRes = {
        json: (data) => resolve(data),
        status: (code) => ({
          json: (data) => reject(new Error(data.error))
        })
      };
      router.stack.find(r => r.route?.path === '/graph/:docName')
        .route.stack[0].handle(mockReq, mockRes);
    });

    if (!graphResponse.success) {
      return res.status(404).json(graphResponse);
    }

    // Generate hierarchy
    const hierarchy = builder.generateHierarchicalGlossary({
      nodes: graphResponse.nodes,
      edges: graphResponse.edges
    });

    res.json({
      success: true,
      docName,
      hierarchy
    });

  } catch (error) {
    console.error('[GlossaryRoutes] Error generating hierarchy:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/glossary/network/:docName
 * Get concept network analysis (InfraNodus-style)
 */
router.get('/network/:docName', async (req, res) => {
  try {
    const { docName } = req.params;

    // Map doc name to file path
    const docFiles = {
      'content-publishing-system': 'CONTENT_PUBLISHING_SYSTEM.md',
      'multiplayer-portal': 'MULTIPLAYER_PORTAL_SYSTEM.md',
      'portfolio-hub': 'PORTFOLIO_HUB_COMPLETE.md'
    };

    const fileName = docFiles[docName];
    if (!fileName) {
      return res.status(404).json({
        success: false,
        error: `Documentation not found: ${docName}`
      });
    }

    // Build or get from cache
    const filePath = path.join(__dirname, '..', fileName);
    const graph = await builder.buildFromMarkdown(filePath);

    // Generate network analysis
    const network = builder.generateConceptNetwork(graph);

    res.json({
      success: true,
      docName,
      ...network
    });

  } catch (error) {
    console.error('[GlossaryRoutes] Error generating network:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/glossary/search
 * Search for concepts across all documentation
 *
 * Query params:
 * - q: Search query
 * - doc: Filter by specific document (optional)
 * - type: Filter by concept type (optional)
 */
router.get('/search', async (req, res) => {
  try {
    const { q, doc, type } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    // Get combined graph
    const cacheKey = 'combined';
    let graph;

    const cached = graphCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      graph = cached.data;
    } else {
      // Build on demand
      const docFiles = [
        'CONTENT_PUBLISHING_SYSTEM.md',
        'MULTIPLAYER_PORTAL_SYSTEM.md',
        'PORTFOLIO_HUB_COMPLETE.md'
      ];
      const filePaths = docFiles.map(f => path.join(__dirname, '..', f));
      graph = await builder.buildFromMultiple(filePaths);

      graphCache.set(cacheKey, {
        timestamp: Date.now(),
        data: graph
      });
    }

    // Search concepts
    const query = q.toLowerCase();
    let results = graph.nodes.filter(node => {
      const matchesQuery = node.label.toLowerCase().includes(query) ||
                           node.definition.toLowerCase().includes(query);

      const matchesDoc = !doc || node.sources.some(s => s.includes(doc));
      const matchesType = !type || node.type === type;

      return matchesQuery && matchesDoc && matchesType;
    });

    // Sort by relevance (exact match first, then by weight)
    results.sort((a, b) => {
      const aExact = a.label.toLowerCase() === query ? 1 : 0;
      const bExact = b.label.toLowerCase() === query ? 1 : 0;

      if (aExact !== bExact) return bExact - aExact;
      return b.weight - a.weight;
    });

    // Limit results
    results = results.slice(0, 50);

    res.json({
      success: true,
      query: q,
      filters: { doc, type },
      count: results.length,
      results
    });

  } catch (error) {
    console.error('[GlossaryRoutes] Error searching:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/glossary/concept/:conceptId
 * Get detailed information about a specific concept
 */
router.get('/concept/:conceptId', async (req, res) => {
  try {
    const { conceptId } = req.params;

    // Get combined graph
    const cacheKey = 'combined';
    let graph;

    const cached = graphCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      graph = cached.data;
    } else {
      const docFiles = [
        'CONTENT_PUBLISHING_SYSTEM.md',
        'MULTIPLAYER_PORTAL_SYSTEM.md',
        'PORTFOLIO_HUB_COMPLETE.md'
      ];
      const filePaths = docFiles.map(f => path.join(__dirname, '..', f));
      graph = await builder.buildFromMultiple(filePaths);

      graphCache.set(cacheKey, {
        timestamp: Date.now(),
        data: graph
      });
    }

    // Find concept
    const concept = graph.nodes.find(n => n.id === conceptId);
    if (!concept) {
      return res.status(404).json({
        success: false,
        error: 'Concept not found'
      });
    }

    // Find related concepts (direct connections)
    const relatedEdges = graph.edges.filter(
      e => e.source === conceptId || e.target === conceptId
    );

    const related = relatedEdges.map(edge => {
      const relatedId = edge.source === conceptId ? edge.target : edge.source;
      const relatedNode = graph.nodes.find(n => n.id === relatedId);

      return {
        ...relatedNode,
        relationship: edge.type,
        relationshipLabel: edge.label,
        weight: edge.weight
      };
    });

    res.json({
      success: true,
      concept,
      related,
      relationshipCount: related.length
    });

  } catch (error) {
    console.error('[GlossaryRoutes] Error fetching concept:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/glossary/stats
 * Get overall glossary statistics
 */
router.get('/stats', async (req, res) => {
  try {
    // Get combined graph
    const cacheKey = 'combined';
    let graph;

    const cached = graphCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      graph = cached.data;
    } else {
      const docFiles = [
        'CONTENT_PUBLISHING_SYSTEM.md',
        'MULTIPLAYER_PORTAL_SYSTEM.md',
        'PORTFOLIO_HUB_COMPLETE.md'
      ];
      const filePaths = docFiles.map(f => path.join(__dirname, '..', f));
      graph = await builder.buildFromMultiple(filePaths);

      graphCache.set(cacheKey, {
        timestamp: Date.now(),
        data: graph
      });
    }

    // Calculate stats
    const typeCount = {};
    const categoryCount = {};

    for (const node of graph.nodes) {
      typeCount[node.type] = (typeCount[node.type] || 0) + 1;
      categoryCount[node.category] = (categoryCount[node.category] || 0) + 1;
    }

    const relationshipTypes = {};
    for (const edge of graph.edges) {
      relationshipTypes[edge.type] = (relationshipTypes[edge.type] || 0) + 1;
    }

    res.json({
      success: true,
      stats: {
        totalConcepts: graph.nodes.length,
        totalRelationships: graph.edges.length,
        documents: graph.metadata.sourceFiles.length,
        byType: typeCount,
        byCategory: categoryCount,
        relationshipTypes,
        density: (graph.edges.length * 2) / (graph.nodes.length * (graph.nodes.length - 1)),
        avgConnectionsPerConcept: (graph.edges.length * 2) / graph.nodes.length
      }
    });

  } catch (error) {
    console.error('[GlossaryRoutes] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/glossary/clear-cache
 * Clear the graph cache (force regeneration)
 */
router.post('/clear-cache', (req, res) => {
  const cacheSize = graphCache.size;
  graphCache.clear();

  res.json({
    success: true,
    message: `Cleared ${cacheSize} cached graph(s)`,
    clearedCount: cacheSize
  });
});

module.exports = router;
