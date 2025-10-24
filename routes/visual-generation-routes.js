/**
 * Visual Generation Routes
 *
 * RESTful API for generating visual assets, diagrams, and product pages.
 * Handles Mermaid diagrams, DOT files, tilemaps, badges, dialogue trees, and product catalogs.
 *
 * Uses port 5001 (main router)
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function createVisualGenerationRoutes({
  fileOutputService,
  DialogueTreeGenerator,
  VisualAssetRenderer,
  ProductCatalog,
  ollamaClient,
  clarityEngine
}) {
  if (!fileOutputService) {
    throw new Error('FileOutputService required for visual generation routes');
  }

  const visualRenderer = new VisualAssetRenderer();

  // ============================================================================
  // MERMAID DIAGRAM GENERATION
  // ============================================================================

  /**
   * POST /api/visual/mermaid
   * Generate Mermaid diagram from graph data
   *
   * Request body:
   * {
   *   "graph": {
   *     "nodes": [...],
   *     "edges": [...]
   *   },
   *   "include_risk_scores": true,
   *   "save_to_file": true
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "mermaid": "graph TD\n...",
   *   "file": {
   *     "url": "/generated/diagrams/mermaid_*.mermaid",
   *     "filename": "..."
   *   }
   * }
   */
  router.post('/mermaid', async (req, res) => {
    try {
      const { graph, include_risk_scores = true, save_to_file = true } = req.body;

      if (!graph) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: graph'
        });
      }

      // Generate Mermaid using ClarityEngine if available
      let mermaid;
      if (clarityEngine && typeof clarityEngine.graphToMermaid === 'function') {
        mermaid = clarityEngine.graphToMermaid(graph, include_risk_scores);
      } else {
        // Fallback: Simple Mermaid generation
        mermaid = generateSimpleMermaid(graph);
      }

      let fileInfo = null;
      if (save_to_file) {
        fileInfo = await fileOutputService.saveMermaid(mermaid);
      }

      res.json({
        success: true,
        mermaid,
        file: fileInfo
      });
    } catch (error) {
      console.error('[VisualGenRoutes] Mermaid generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // DOT (GRAPHVIZ) GENERATION
  // ============================================================================

  /**
   * POST /api/visual/dot
   * Generate GraphViz DOT file from graph data
   *
   * Request body:
   * {
   *   "graph": {
   *     "nodes": [...],
   *     "edges": [...]
   *   },
   *   "include_risk_scores": true,
   *   "save_to_file": true
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "dot": "digraph Dependencies {...}",
   *   "file": {
   *     "url": "/generated/diagrams/graph_*.dot"
   *   }
   * }
   */
  router.post('/dot', async (req, res) => {
    try {
      const { graph, include_risk_scores = true, save_to_file = true } = req.body;

      if (!graph) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: graph'
        });
      }

      // Generate DOT using ClarityEngine if available
      let dot;
      if (clarityEngine && typeof clarityEngine.graphToDot === 'function') {
        dot = clarityEngine.graphToDot(graph, include_risk_scores);
      } else {
        // Fallback: Simple DOT generation
        dot = generateSimpleDot(graph);
      }

      let fileInfo = null;
      if (save_to_file) {
        fileInfo = await fileOutputService.saveDot(dot);
      }

      res.json({
        success: true,
        dot,
        file: fileInfo
      });
    } catch (error) {
      console.error('[VisualGenRoutes] DOT generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // DIALOGUE TREE GENERATION (MMORPG)
  // ============================================================================

  /**
   * POST /api/visual/dialogue-tree
   * Generate MMORPG quest dialogue tree
   *
   * Request body:
   * {
   *   "quest_name": "The Healer's Request",
   *   "npc_name": "Village Elder",
   *   "quest_type": "fetch",
   *   "difficulty": "medium",
   *   "use_ai": true,
   *   "output_formats": ["mermaid", "dot", "json"]
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "dialogue_tree": { ... },
   *   "mermaid": "...",
   *   "dot": "...",
   *   "files": {
   *     "mermaid": { "url": "..." },
   *     "dot": { "url": "..." },
   *     "json": { "url": "..." }
   *   }
   * }
   */
  router.post('/dialogue-tree', async (req, res) => {
    try {
      const {
        quest_name,
        npc_name = 'NPC',
        quest_type = 'fetch',
        difficulty = 'medium',
        use_ai = false,
        output_formats = ['mermaid', 'dot', 'json']
      } = req.body;

      if (!quest_name) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: quest_name'
        });
      }

      const generator = new DialogueTreeGenerator();

      // Generate dialogue tree
      if (use_ai && ollamaClient) {
        await generator.generateWithAI(ollamaClient, {
          quest_name,
          npc_name,
          quest_type,
          difficulty
        });
      } else {
        generator.buildQuestTree({
          quest_name,
          npc_name,
          quest_type,
          difficulty
        });
      }

      // Export to requested formats
      const result = {
        success: true,
        dialogue_tree: generator.toJSON(),
        files: {}
      };

      if (output_formats.includes('mermaid')) {
        const mermaid = generator.toMermaid();
        result.mermaid = mermaid;
        result.files.mermaid = await fileOutputService.saveMermaid(
          mermaid,
          `dialogue_${quest_name.toLowerCase().replace(/\s+/g, '_')}.mermaid`
        );
      }

      if (output_formats.includes('dot')) {
        const dot = generator.toDot();
        result.dot = dot;
        result.files.dot = await fileOutputService.saveDot(
          dot,
          `dialogue_${quest_name.toLowerCase().replace(/\s+/g, '_')}.dot`
        );
      }

      if (output_formats.includes('json')) {
        result.files.json = await fileOutputService.saveJSON(
          generator.toJSON(),
          'diagrams',
          `dialogue_${quest_name.toLowerCase().replace(/\s+/g, '_')}.json`
        );
      }

      res.json(result);
    } catch (error) {
      console.error('[VisualGenRoutes] Dialogue tree error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // BADGE GENERATION
  // ============================================================================

  /**
   * POST /api/visual/badge
   * Generate badge SVG
   *
   * Request body:
   * {
   *   "id": "veteran",
   *   "name": "Veteran",
   *   "icon": "⭐",
   *   "color": "#f59e0b",
   *   "description": "Long-time community member",
   *   "type": "badge" // or "shield"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "svg": "...",
   *   "file": {
   *     "url": "/generated/badges/badge_*.svg"
   *   }
   * }
   */
  router.post('/badge', async (req, res) => {
    try {
      const {
        id,
        name,
        icon = '🏆',
        color = '#667eea',
        description = '',
        type = 'badge',
        rank = 'bronze'
      } = req.body;

      if (!id || !name) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: id, name'
        });
      }

      let svg;
      if (type === 'shield') {
        svg = visualRenderer.generateShieldSVG({ id, name, icon, color, rank });
      } else {
        svg = visualRenderer.generateBadgeSVG({ id, name, icon, color, description });
      }

      const fileInfo = await fileOutputService.saveBadgeSVG(
        svg,
        `${type}_${id}.svg`
      );

      res.json({
        success: true,
        svg,
        file: fileInfo
      });
    } catch (error) {
      console.error('[VisualGenRoutes] Badge generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // TILEMAP GENERATION
  // ============================================================================

  /**
   * POST /api/visual/tilemap
   * Generate tilemap SVG
   *
   * Request body:
   * {
   *   "name": "dark_forest",
   *   "width": 20,
   *   "height": 15,
   *   "tiles": [0, 1, 1, 2, ...],
   *   "output_format": "svg" // or "ascii"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "svg": "...",
   *   "file": {
   *     "url": "/generated/tilemaps/tilemap_*.svg"
   *   }
   * }
   */
  router.post('/tilemap', async (req, res) => {
    try {
      const {
        name = 'Map',
        width,
        height,
        tiles,
        output_format = 'svg'
      } = req.body;

      if (!width || !height || !tiles) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: width, height, tiles'
        });
      }

      const tilemapData = { name, width, height, tiles };

      if (output_format === 'ascii') {
        const ascii = visualRenderer.generateTilemapASCII(tilemapData);
        res.json({
          success: true,
          ascii,
          format: 'ascii'
        });
      } else {
        const svg = visualRenderer.generateTilemapSVG(tilemapData);
        const fileInfo = await fileOutputService.saveBadgeSVG(
          svg,
          `tilemap_${name.toLowerCase().replace(/\s+/g, '_')}.svg`
        );

        res.json({
          success: true,
          svg,
          file: fileInfo
        });
      }
    } catch (error) {
      console.error('[VisualGenRoutes] Tilemap generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // PRODUCT PAGE GENERATION
  // ============================================================================

  /**
   * POST /api/visual/product-page
   * Generate product page with AI descriptions
   *
   * Request body:
   * {
   *   "name": "Premium Headphones",
   *   "category": "electronics",
   *   "price_range": "medium",
   *   "brand_colors": ["#667eea", "#764ba2"]
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "product": {
   *     "name": "...",
   *     "description": "...",
   *     "price": "...",
   *     "features": [...],
   *     "specifications": {...}
   *   },
   *   "file": {
   *     "url": "/generated/products/product_*.html"
   *   }
   * }
   */
  router.post('/product-page', async (req, res) => {
    try {
      const productConfig = req.body;

      if (!productConfig.name) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: name'
        });
      }

      if (!ollamaClient) {
        return res.status(503).json({
          success: false,
          error: 'Ollama client not available for AI generation'
        });
      }

      const productCatalog = new ProductCatalog(ollamaClient, fileOutputService);
      const product = await productCatalog.generateProductPage(productConfig);

      const fileInfo = await fileOutputService.saveProductPage(
        product.html,
        `product_${product.name.toLowerCase().replace(/\s+/g, '_')}.html`
      );

      res.json({
        success: true,
        product: {
          name: product.name,
          description: product.description,
          price: product.price,
          features: product.features,
          specifications: product.specifications
        },
        file: fileInfo
      });
    } catch (error) {
      console.error('[VisualGenRoutes] Product page error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // PRODUCT CATALOG GENERATION
  // ============================================================================

  /**
   * POST /api/visual/product-catalog
   * Generate multi-product catalog
   *
   * Request body:
   * {
   *   "catalog_name": "Summer Collection 2024",
   *   "products": [
   *     { "name": "Product 1", "category": "..." },
   *     { "name": "Product 2", "category": "..." }
   *   ],
   *   "brand_colors": ["#667eea", "#764ba2"]
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "catalog": {
   *     "catalog_name": "...",
   *     "products": [...]
   *   },
   *   "files": {
   *     "catalog": { "url": "..." },
   *     "products": [...]
   *   }
   * }
   */
  router.post('/product-catalog', async (req, res) => {
    try {
      const { catalog_name, products, brand_colors } = req.body;

      if (!products || products.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: products (must be non-empty array)'
        });
      }

      if (!ollamaClient) {
        return res.status(503).json({
          success: false,
          error: 'Ollama client not available for AI generation'
        });
      }

      const productCatalog = new ProductCatalog(ollamaClient, fileOutputService);
      const catalog = await productCatalog.generateCatalog(products, {
        catalog_name,
        brand_colors
      });

      // Save catalog index
      const catalogFile = await fileOutputService.saveProductPage(
        catalog.catalog_html,
        `catalog_${catalog_name.toLowerCase().replace(/\s+/g, '_')}.html`
      );

      // Save individual product pages
      const productFiles = [];
      for (const product of catalog.products) {
        const file = await fileOutputService.saveProductPage(
          product.html,
          `product_${product.name.toLowerCase().replace(/\s+/g, '_')}.html`
        );
        productFiles.push(file);
      }

      res.json({
        success: true,
        catalog: {
          catalog_name: catalog.catalog_name,
          products: catalog.products.map(p => ({
            name: p.name,
            description: p.description,
            price: p.price
          }))
        },
        files: {
          catalog: catalogFile,
          products: productFiles
        }
      });
    } catch (error) {
      console.error('[VisualGenRoutes] Catalog generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  /**
   * GET /api/visual/health
   * Check if visual generation service is operational
   */
  router.get('/health', async (req, res) => {
    try {
      res.json({
        success: true,
        service: 'visual-generation',
        status: 'operational',
        capabilities: {
          mermaid: true,
          dot: true,
          dialogue_trees: true,
          badges: true,
          tilemaps: true,
          product_pages: ollamaClient ? true : false,
          product_catalogs: ollamaClient ? true : false
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

/**
 * Fallback: Simple Mermaid generator
 */
function generateSimpleMermaid(graph) {
  let mermaid = 'graph TD\n';

  for (const node of graph.nodes || []) {
    const nodeId = node.id || node.name;
    mermaid += `    ${nodeId}["${node.name}"]\n`;
  }

  for (const edge of graph.edges || []) {
    mermaid += `    ${edge.from} --> ${edge.to}\n`;
  }

  return mermaid;
}

/**
 * Fallback: Simple DOT generator
 */
function generateSimpleDot(graph) {
  let dot = 'digraph Dependencies {\n';
  dot += '  node [shape=box];\n\n';

  for (const node of graph.nodes || []) {
    const nodeId = node.id || node.name;
    dot += `  ${nodeId} [label="${node.name}"];\n`;
  }

  for (const edge of graph.edges || []) {
    dot += `  ${edge.from} -> ${edge.to};\n`;
  }

  dot += '}\n';
  return dot;
}

module.exports = createVisualGenerationRoutes;
