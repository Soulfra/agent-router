/**
 * IIIF Image Management Routes
 * Handles image upload, manifest generation, and IIIF server integration
 */

const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Ensure storage directories exist
const storageDir = path.join(__dirname, '../storage/images');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

/**
 * POST /api/iiif/upload
 * Upload an image for IIIF processing
 */
router.post('/upload', async (req, res) => {
  try {
    const { file, filename, title, description, userId, sessionId } = req.body;

    if (!file) {
      return res.status(400).json({
        status: 'error',
        message: 'file (base64) is required'
      });
    }

    // Decode base64 image
    const buffer = Buffer.from(file, 'base64');
    const imageId = crypto.randomBytes(16).toString('hex');
    const ext = filename ? path.extname(filename) : '.jpg';
    const imagePath = path.join(storageDir, `${imageId}${ext}`);

    // Get image metadata
    const metadata = await sharp(buffer).metadata();

    // Save original image
    await sharp(buffer).toFile(imagePath);

    // Create thumbnail
    const thumbnailPath = path.join(storageDir, `${imageId}_thumb.jpg`);
    await sharp(buffer).resize(300, 300, { fit: 'inside' }).toFile(thumbnailPath);

    // Store in database if available
    const db = req.app.locals.db;
    if (db) {
      const result = await db.query(`
        INSERT INTO iiif_images (filename, original_filename, width, height, format, storage_path, thumbnail_path, title, description, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        `${imageId}${ext}`,
        filename || 'uploaded.jpg',
        metadata.width,
        metadata.height,
        metadata.format,
        imagePath,
        thumbnailPath,
        title || filename || 'Untitled',
        description || '',
        userId || sessionId || 'anonymous'
      ]);

      res.json({
        status: 'ok',
        image: result.rows[0],
        iiifUrl: `http://localhost:${process.env.PORT || 5001}/iiif/${imageId}${ext}/full/max/0/default.jpg`
      });
    } else {
      res.json({
        status: 'ok',
        image: {
          id: imageId,
          filename: `${imageId}${ext}`,
          width: metadata.width,
          height: metadata.height
        },
        iiifUrl: `http://localhost:${process.env.PORT || 5001}/iiif/${imageId}${ext}/full/max/0/default.jpg`
      });
    }
  } catch (error) {
    console.error('Failed to upload image:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/iiif/manifest/:imageId
 * Generate IIIF Presentation API manifest for an image
 */
router.get('/manifest/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;
    const db = req.app.locals.db;

    if (db) {
      const result = await db.query('SELECT * FROM iiif_images WHERE filename LIKE $1', [`${imageId}%`]);
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Image not found' });
      }

      const image = result.rows[0];
      const PORT = process.env.PORT || 5001;

      const manifest = {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        'id': `http://localhost:${PORT}/api/iiif/manifest/${imageId}`,
        'type': 'Manifest',
        'label': { 'en': [image.title || 'Untitled'] },
        'summary': { 'en': [image.description || ''] },
        'items': [{
          'id': `http://localhost:${PORT}/api/iiif/manifest/${imageId}/canvas/1`,
          'type': 'Canvas',
          'label': { 'en': ['Canvas 1'] },
          'height': image.height,
          'width': image.width,
          'items': [{
            'id': `http://localhost:${PORT}/api/iiif/manifest/${imageId}/page/1`,
            'type': 'AnnotationPage',
            'items': [{
              'id': `http://localhost:${PORT}/api/iiif/manifest/${imageId}/annotation/1`,
              'type': 'Annotation',
              'motivation': 'painting',
              'body': {
                'id': `http://localhost:${PORT}/iiif/${image.filename}/full/max/0/default.jpg`,
                'type': 'Image',
                'format': `image/${image.format}`,
                'height': image.height,
                'width': image.width
              },
              'target': `http://localhost:${PORT}/api/iiif/manifest/${imageId}/canvas/1`
            }]
          }]
        }]
      };

      res.json(manifest);
    } else {
      res.status(503).json({ status: 'error', message: 'Database not initialized' });
    }
  } catch (error) {
    console.error('Failed to generate manifest:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/iiif/images
 * Get all IIIF images
 */
router.get('/images', async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (db) {
      const result = await db.query('SELECT * FROM iiif_images ORDER BY created_at DESC');
      res.json({
        status: 'ok',
        images: result.rows
      });
    } else {
      res.status(503).json({ status: 'error', message: 'Database not initialized' });
    }
  } catch (error) {
    console.error('Failed to get images:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = router;
