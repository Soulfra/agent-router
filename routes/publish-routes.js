/**
 * Publishing Routes
 *
 * API endpoints for automated content publishing.
 * Generate ebooks, PDFs, websites from documentation and database content.
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function createPublishRoutes({ db, contentPublisher, bucketOrchestrator }) {
  if (!contentPublisher) {
    throw new Error('ContentPublisher required for publish routes');
  }

  // ============================================================================
  // PUBLISHING
  // ============================================================================

  /**
   * POST /api/publish/generate
   * Generate publication from source
   *
   * Request:
   * {
   *   "sourceType": "markdown",
   *   "sourcePath": "MULTIPLAYER_PORTAL_SYSTEM.md",
   *   "outputFormat": "epub",
   *   "template": "game-guide",
   *   "title": "CALOS Multiplayer Guide",
   *   "aiEnhancement": true,
   *   "metadata": {}
   * }
   */
  router.post('/generate', async (req, res) => {
    try {
      const {
        sourceType,
        sourcePath,
        outputFormat,
        template,
        title,
        aiEnhancement,
        aiModel,
        metadata
      } = req.body;

      if (!sourceType || !sourcePath) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: sourceType, sourcePath'
        });
      }

      const result = await contentPublisher.publish({
        sourceType,
        sourcePath,
        outputFormat: outputFormat || 'all',
        template: template || 'game-guide',
        title: title || 'Generated Publication',
        aiEnhancement: aiEnhancement !== false,
        aiModel,
        metadata
      });

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      console.error('[PublishRoutes] Generate error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/publish/generate-book
   * Generate book from template
   *
   * Request:
   * {
   *   "template": "multiplayer-guide",
   *   "outputFormat": "epub",
   *   "aiEnhancement": true
   * }
   */
  router.post('/generate-book', async (req, res) => {
    try {
      const {
        template,
        outputFormat,
        aiEnhancement,
        metadata
      } = req.body;

      if (!template) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: template'
        });
      }

      // Generate from template
      const result = await contentPublisher.publish({
        sourceType: 'template',
        sourcePath: template,
        outputFormat: outputFormat || 'all',
        template: 'game-guide',
        aiEnhancement: aiEnhancement !== false,
        metadata
      });

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      console.error('[PublishRoutes] Generate book error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/publish/generate-from-database
   * Generate publication from database content
   *
   * Request:
   * {
   *   "contentType": "starters",
   *   "outputFormat": "pdf",
   *   "template": "reference-docs"
   * }
   */
  router.post('/generate-from-database', async (req, res) => {
    try {
      const {
        contentType,
        contentId,
        outputFormat,
        template,
        title,
        aiEnhancement
      } = req.body;

      if (!contentType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: contentType'
        });
      }

      // Build database identifier
      const sourcePath = contentId
        ? `${contentType}:${contentId}`
        : contentType;

      const result = await contentPublisher.publish({
        sourceType: 'database',
        sourcePath,
        outputFormat: outputFormat || 'all',
        template: template || 'reference-docs',
        title: title || `CALOS ${contentType} Documentation`,
        aiEnhancement: aiEnhancement !== false
      });

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      console.error('[PublishRoutes] Generate from database error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // PUBLICATION STATUS
  // ============================================================================

  /**
   * GET /api/publish/status/:publicationId
   * Get publication status
   */
  router.get('/status/:publicationId', async (req, res) => {
    try {
      const { publicationId } = req.params;

      const status = contentPublisher.getPublicationStatus(publicationId);

      if (!status) {
        return res.status(404).json({
          success: false,
          error: 'Publication not found'
        });
      }

      res.json({
        success: true,
        publicationId,
        ...status
      });

    } catch (error) {
      console.error('[PublishRoutes] Status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/publish/list
   * List all publications
   */
  router.get('/list', async (req, res) => {
    try {
      const publications = contentPublisher.listPublications();

      res.json({
        success: true,
        count: publications.length,
        publications
      });

    } catch (error) {
      console.error('[PublishRoutes] List error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // QUICK PUBLISH ENDPOINTS
  // ============================================================================

  /**
   * POST /api/publish/multiplayer-guide
   * Quick publish: CALOS Multiplayer Guide
   */
  router.post('/multiplayer-guide', async (req, res) => {
    try {
      const { outputFormat = 'all', aiEnhancement = true } = req.body;

      const result = await contentPublisher.publish({
        sourceType: 'markdown',
        sourcePath: 'MULTIPLAYER_PORTAL_SYSTEM.md',
        outputFormat,
        template: 'game-guide',
        title: 'CALOS Multiplayer Portal Guide',
        aiEnhancement,
        metadata: {
          subtitle: 'Master the Art of Bucket Battles and Portal Collaboration',
          author: 'CALOS AI',
          category: 'Gaming, AI, Software'
        }
      });

      res.json({
        success: true,
        message: 'Multiplayer guide generated!',
        ...result
      });

    } catch (error) {
      console.error('[PublishRoutes] Multiplayer guide error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/publish/portfolio-guide
   * Quick publish: Portfolio Building Guide
   */
  router.post('/portfolio-guide', async (req, res) => {
    try {
      const { outputFormat = 'all', aiEnhancement = true } = req.body;

      const result = await contentPublisher.publish({
        sourceType: 'markdown',
        sourcePath: 'PORTFOLIO_HUB_COMPLETE.md',
        outputFormat,
        template: 'business-guide',
        title: 'Building Your AI Portfolio with CALOS',
        aiEnhancement,
        metadata: {
          subtitle: 'Showcase Your Work, Track Analytics, Monetize Your Skills',
          author: 'CALOS AI',
          category: 'Business, AI, Software'
        }
      });

      res.json({
        success: true,
        message: 'Portfolio guide generated!',
        ...result
      });

    } catch (error) {
      console.error('[PublishRoutes] Portfolio guide error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/publish/starter-catalog
   * Quick publish: Starter Catalog (from database)
   */
  router.post('/starter-catalog', async (req, res) => {
    try {
      const { outputFormat = 'pdf', aiEnhancement = true } = req.body;

      const result = await contentPublisher.publish({
        sourceType: 'database',
        sourcePath: 'starters',
        outputFormat,
        template: 'reference-docs',
        title: 'CALOS Starter Catalog',
        aiEnhancement,
        metadata: {
          subtitle: 'Complete Reference for All 12 Bucket Starters',
          author: 'CALOS AI'
        }
      });

      res.json({
        success: true,
        message: 'Starter catalog generated!',
        ...result
      });

    } catch (error) {
      console.error('[PublishRoutes] Starter catalog error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // TEMPLATES
  // ============================================================================

  /**
   * GET /api/publish/templates
   * List available templates
   */
  router.get('/templates', async (req, res) => {
    try {
      const BookTemplates = require('../lib/book-templates');

      const templates = [
        {
          id: 'multiplayer-guide',
          name: 'CALOS Multiplayer Portal Guide',
          type: 'game-guide',
          description: 'Complete guide for multiplayer system',
          pages: 250
        },
        {
          id: 'technical-reference',
          name: 'CALOS Technical Reference',
          type: 'technical-manual',
          description: 'Complete API and architecture docs',
          pages: 150
        },
        {
          id: 'portfolio-guide',
          name: 'Building Your AI Portfolio',
          type: 'business-guide',
          description: 'Portfolio building and monetization',
          pages: 120
        },
        {
          id: 'workflow-course',
          name: 'Mastering CALOS Workflows',
          type: 'tutorial-course',
          description: 'Workflow automation course',
          pages: 100
        }
      ];

      res.json({
        success: true,
        count: templates.length,
        templates
      });

    } catch (error) {
      console.error('[PublishRoutes] Templates error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  router.get('/health', async (req, res) => {
    res.json({
      success: true,
      service: 'publishing',
      features: [
        'markdown-to-ebook',
        'database-to-pdf',
        'template-generation',
        'ai-enhancement',
        'multi-format-output'
      ],
      formats: ['epub', 'pdf', 'html', 'markdown', 'json'],
      templates: ['game-guide', 'technical-manual', 'business-guide', 'tutorial-course', 'reference-docs']
    });
  });

  return router;
}

module.exports = createPublishRoutes;
