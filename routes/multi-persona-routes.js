/**
 * Multi-Persona ActivityPub Routes
 *
 * API endpoints for managing multiple Mastodon personas:
 * - Create personas (Alice, Bob, CalRiven, etc.)
 * - Post as specific persona
 * - View persona stats
 * - Manage followers
 * - Route content to best persona
 */

const express = require('express');
const router = express.Router();

let multiPersonaActivityPub = null;

// Initialize with multi-persona system
function initMultiPersona(instance) {
  multiPersonaActivityPub = instance;
}

/**
 * GET /api/personas
 * List all personas
 */
router.get('/', async (req, res) => {
  try {
    if (!multiPersonaActivityPub) {
      return res.status(503).json({ error: 'Multi-persona system not initialized' });
    }

    const { brand } = req.query;

    const personas = brand
      ? await multiPersonaActivityPub.getPersonasByBrand(brand)
      : await multiPersonaActivityPub.db.query('SELECT persona_id, username, display_name, brand, personality, topics FROM activitypub_personas ORDER BY created_at DESC');

    const result = brand ? personas : personas.rows.map(p => ({
      ...p,
      topics: JSON.parse(p.topics || '[]'),
      webfinger: `@${p.username}@${multiPersonaActivityPub.domain}`
    }));

    res.json({ personas: result });
  } catch (error) {
    console.error('[MultiPersonaRoutes] List error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/personas
 * Create new persona
 */
router.post('/', async (req, res) => {
  try {
    if (!multiPersonaActivityPub) {
      return res.status(503).json({ error: 'Multi-persona system not initialized' });
    }

    const {
      username,
      displayName,
      summary,
      brand,
      personality = 'technical',
      topics = [],
      icon = null,
      preferredLanguages = ['en']
    } = req.body;

    if (!username || !displayName || !brand) {
      return res.status(400).json({ error: 'username, displayName, and brand are required' });
    }

    const result = await multiPersonaActivityPub.createPersona({
      username,
      displayName,
      summary,
      brand,
      personality,
      topics,
      icon,
      preferredLanguages
    });

    res.json({
      success: true,
      persona: result
    });
  } catch (error) {
    console.error('[MultiPersonaRoutes] Create error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/personas/:username
 * Get persona details
 */
router.get('/:username', async (req, res) => {
  try {
    if (!multiPersonaActivityPub) {
      return res.status(503).json({ error: 'Multi-persona system not initialized' });
    }

    const { username } = req.params;

    const persona = await multiPersonaActivityPub.getPersona(username);

    if (!persona) {
      return res.status(404).json({ error: 'Persona not found' });
    }

    res.json({ persona });
  } catch (error) {
    console.error('[MultiPersonaRoutes] Get error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/personas/:username/actor
 * Get ActivityPub actor object (for federation)
 */
router.get('/:username/actor', async (req, res) => {
  try {
    if (!multiPersonaActivityPub) {
      return res.status(503).json({ error: 'Multi-persona system not initialized' });
    }

    const { username } = req.params;

    const actor = await multiPersonaActivityPub.getActor(username);

    res.setHeader('Content-Type', 'application/activity+json');
    res.json(actor);
  } catch (error) {
    console.error('[MultiPersonaRoutes] Actor error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/personas/:username/post
 * Post content as persona
 */
router.post('/:username/post', async (req, res) => {
  try {
    if (!multiPersonaActivityPub) {
      return res.status(503).json({ error: 'Multi-persona system not initialized' });
    }

    const { username } = req.params;
    const {
      content,
      language = 'en',
      visibility = 'public',
      inReplyTo = null,
      attachments = []
    } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const result = await multiPersonaActivityPub.post({
      username,
      content,
      language,
      visibility,
      inReplyTo,
      attachments
    });

    res.json({
      success: true,
      post: result
    });
  } catch (error) {
    console.error('[MultiPersonaRoutes] Post error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/personas/:username/stats
 * Get persona statistics
 */
router.get('/:username/stats', async (req, res) => {
  try {
    if (!multiPersonaActivityPub) {
      return res.status(503).json({ error: 'Multi-persona system not initialized' });
    }

    const { username } = req.params;

    const stats = await multiPersonaActivityPub.getPersonaStats(username);

    res.json({ stats });
  } catch (error) {
    console.error('[MultiPersonaRoutes] Stats error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/personas/route
 * Route content to best persona based on topics
 */
router.post('/route', async (req, res) => {
  try {
    if (!multiPersonaActivityPub) {
      return res.status(503).json({ error: 'Multi-persona system not initialized' });
    }

    const { brand, topics = [] } = req.body;

    if (!brand) {
      return res.status(400).json({ error: 'brand is required' });
    }

    const persona = await multiPersonaActivityPub.routeToPersona(brand, topics);

    res.json({ persona });
  } catch (error) {
    console.error('[MultiPersonaRoutes] Route error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /.well-known/webfinger
 * WebFinger endpoint for persona discovery
 */
router.get('/.well-known/webfinger', async (req, res) => {
  try {
    if (!multiPersonaActivityPub) {
      return res.status(503).json({ error: 'Multi-persona system not initialized' });
    }

    const { resource } = req.query;

    if (!resource) {
      return res.status(400).json({ error: 'resource parameter required' });
    }

    const webfinger = await multiPersonaActivityPub.getWebFinger(resource);

    res.setHeader('Content-Type', 'application/jrd+json');
    res.json(webfinger);
  } catch (error) {
    console.error('[MultiPersonaRoutes] WebFinger error:', error.message);
    res.status(404).json({ error: error.message });
  }
});

module.exports = router;
module.exports.initMultiPersona = initMultiPersona;
