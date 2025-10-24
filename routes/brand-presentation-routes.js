/**
 * Brand Presentation Routes
 * Handles generation of pitch decks, brand guidelines, and presentations
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const BrandPresentationGenerator = require('../lib/brand-presentation-generator');

// Initialize generator
const generator = new BrandPresentationGenerator();

// In-memory cache for generated presentations (temporary storage)
// In production, use Redis or a database
const presentationCache = new Map();

/**
 * GET /api/brand-presentation/templates
 * List available templates
 */
router.get('/templates', (req, res) => {
  try {
    const templates = [
      {
        id: 'pitchDeck',
        name: 'Pitch Deck',
        description: 'Investor presentation (10 slides)',
        slides: 10,
        icon: '📈'
      },
      {
        id: 'brandGuidelines',
        name: 'Brand Guidelines',
        description: 'Logo, colors, voice (7 slides)',
        slides: 7,
        icon: '🎨'
      },
      {
        id: 'domainModels',
        name: 'Domain Models',
        description: 'AI model showcase (8 slides)',
        slides: 8,
        icon: '🧠'
      },
      {
        id: 'productRoadmap',
        name: 'Product Roadmap',
        description: '2025 vision and milestones (7 slides)',
        slides: 7,
        icon: '🗺️'
      },
      {
        id: 'feedbackLoop',
        name: 'Feedback Loop',
        description: 'Community engagement (6 slides)',
        slides: 6,
        icon: '🔄'
      }
    ];

    res.json({ templates });
  } catch (error) {
    console.error('[BrandPresentationAPI] Error listing templates:', error);
    res.status(500).json({ error: 'Failed to list templates', message: error.message });
  }
});

/**
 * GET /api/brand-presentation/brands
 * List available brands
 */
router.get('/brands', (req, res) => {
  try {
    const brands = [
      {
        id: 'calos',
        name: 'CALOS',
        tagline: 'Operating System for AI Agents',
        icon: '🌐'
      },
      {
        id: 'soulfra',
        name: 'Soulfra',
        tagline: 'Universal Identity Without KYC',
        icon: '🔐'
      },
      {
        id: 'deathtodata',
        name: 'DeathToData',
        tagline: 'Search Engine Philosophy',
        icon: '💀'
      },
      {
        id: 'roughsparks',
        name: 'RoughSparks',
        tagline: 'Creative Sparks for Builders',
        icon: '⚡'
      }
    ];

    res.json({ brands });
  } catch (error) {
    console.error('[BrandPresentationAPI] Error listing brands:', error);
    res.status(500).json({ error: 'Failed to list brands', message: error.message });
  }
});

/**
 * POST /api/brand-presentation/generate
 * Generate a brand presentation
 */
router.post('/generate', async (req, res) => {
  try {
    const { brand, template, format = 'pdf' } = req.body;

    if (!brand) {
      return res.status(400).json({ error: 'Brand is required' });
    }

    if (!template) {
      return res.status(400).json({ error: 'Template is required' });
    }

    const validBrands = ['calos', 'soulfra', 'deathtodata', 'roughsparks'];
    if (!validBrands.includes(brand)) {
      return res.status(400).json({ error: `Invalid brand. Must be one of: ${validBrands.join(', ')}` });
    }

    const validTemplates = ['pitchDeck', 'brandGuidelines', 'domainModels', 'productRoadmap', 'feedbackLoop'];
    if (!validTemplates.includes(template)) {
      return res.status(400).json({ error: `Invalid template. Must be one of: ${validTemplates.join(', ')}` });
    }

    console.log(`[BrandPresentationAPI] Generating ${template} for ${brand} (format: ${format})...`);

    // Generate presentation
    const outputDir = path.join(__dirname, '../output/presentations');
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `${brand}-${template}-${Date.now()}.${format}`);

    // Generate presentation using the main generate() method
    const result = await generator.generate(template, brand, {
      format,
      outputPath
    });

    // Generate unique ID and cache the result
    const presentationId = crypto.randomBytes(16).toString('hex');
    presentationCache.set(presentationId, {
      ...result,
      brand,
      template,
      format,
      createdAt: Date.now()
    });

    // Auto-cleanup after 1 hour
    setTimeout(() => {
      presentationCache.delete(presentationId);
      // Also delete the file
      fs.unlink(result.outputPath).catch(() => {});
    }, 60 * 60 * 1000);

    res.json({
      success: true,
      id: presentationId,
      brand,
      template,
      format,
      slides: result.slides,
      slideCount: result.slides.length,
      outputPath: result.outputPath,
      metadata: result.metadata
    });

  } catch (error) {
    console.error('[BrandPresentationAPI] Error generating presentation:', error);
    res.status(500).json({
      error: 'Failed to generate presentation',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/brand-presentation/download/:id
 * Download a generated presentation
 */
router.get('/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { format } = req.query;

    const cached = presentationCache.get(id);
    if (!cached) {
      return res.status(404).json({ error: 'Presentation not found or expired' });
    }

    // If format is different, regenerate
    let outputPath = cached.outputPath;
    if (format && format !== cached.format) {
      console.log(`[BrandPresentationAPI] Regenerating ${id} as ${format}...`);

      const outputDir = path.join(__dirname, '../output/presentations');
      const newOutputPath = path.join(outputDir, `${cached.brand}-${cached.template}-${Date.now()}.${format}`);

      // Regenerate with new format using main generate() method
      const result = await generator.generate(cached.template, cached.brand, {
        format,
        outputPath: newOutputPath
      });

      outputPath = result.outputPath;
    }

    // Check if file exists
    try {
      await fs.access(outputPath);
    } catch (err) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Set appropriate headers
    const filename = path.basename(outputPath);
    const mimeTypes = {
      pdf: 'application/pdf',
      gif: 'image/gif',
      mp4: 'video/mp4',
      md: 'text/markdown',
      markdown: 'text/markdown'
    };

    const ext = path.extname(outputPath).slice(1);
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream the file
    const fileStream = require('fs').createReadStream(outputPath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('[BrandPresentationAPI] Error downloading presentation:', error);
    res.status(500).json({ error: 'Failed to download presentation', message: error.message });
  }
});

/**
 * GET /api/brand-presentation/preview/:id
 * Get presentation preview data
 */
router.get('/preview/:id', (req, res) => {
  try {
    const { id } = req.params;

    const cached = presentationCache.get(id);
    if (!cached) {
      return res.status(404).json({ error: 'Presentation not found or expired' });
    }

    res.json({
      id,
      brand: cached.brand,
      template: cached.template,
      format: cached.format,
      slides: cached.slides,
      slideCount: cached.slides.length,
      metadata: cached.metadata,
      createdAt: cached.createdAt
    });

  } catch (error) {
    console.error('[BrandPresentationAPI] Error fetching preview:', error);
    res.status(500).json({ error: 'Failed to fetch preview', message: error.message });
  }
});

/**
 * DELETE /api/brand-presentation/:id
 * Delete a generated presentation
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const cached = presentationCache.get(id);
    if (!cached) {
      return res.status(404).json({ error: 'Presentation not found' });
    }

    // Delete file
    try {
      await fs.unlink(cached.outputPath);
    } catch (err) {
      console.warn('[BrandPresentationAPI] Failed to delete file:', err.message);
    }

    // Remove from cache
    presentationCache.delete(id);

    res.json({ success: true, message: 'Presentation deleted' });

  } catch (error) {
    console.error('[BrandPresentationAPI] Error deleting presentation:', error);
    res.status(500).json({ error: 'Failed to delete presentation', message: error.message });
  }
});

/**
 * GET /api/brand-presentation/slide/:id/:slideNumber
 * Serve individual slide PNG image
 */
router.get('/slide/:id/:slideNumber', async (req, res) => {
  try {
    const { id, slideNumber } = req.params;

    const cached = presentationCache.get(id);
    if (!cached) {
      return res.status(404).json({ error: 'Presentation not found or expired' });
    }

    // Get slide image path
    const slideNum = parseInt(slideNumber);
    if (isNaN(slideNum) || slideNum < 1 || slideNum > cached.slideCount) {
      return res.status(400).json({ error: `Invalid slide number. Must be 1-${cached.slideCount}` });
    }

    const slidePath = path.join(__dirname, '../temp/presentations', `slide-${slideNum}.png`);

    // Check if file exists
    try {
      await fs.access(slidePath);
    } catch (err) {
      return res.status(404).json({ error: 'Slide image not found' });
    }

    // Stream the PNG
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const fileStream = require('fs').createReadStream(slidePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('[BrandPresentationAPI] Error serving slide:', error);
    res.status(500).json({ error: 'Failed to serve slide', message: error.message });
  }
});

// Cleanup old presentations every hour
setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  for (const [id, data] of presentationCache.entries()) {
    if (now - data.createdAt > maxAge) {
      fs.unlink(data.outputPath).catch(() => {});
      presentationCache.delete(id);
      console.log(`[BrandPresentationAPI] Cleaned up expired presentation: ${id}`);
    }
  }
}, 60 * 60 * 1000);

module.exports = router;
