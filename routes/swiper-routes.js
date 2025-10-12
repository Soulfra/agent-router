/**
 * Profile Swiper Routes
 * Tinder-style interface for generating and matching profile combinations
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const ProfileGenerator = require('../lib/profile-generator');
const APIAuthMiddleware = require('../middleware/api-auth');

// Initialize profile generator
const generator = new ProfileGenerator();

// API auth middleware (will be initialized by parent)
let apiAuth = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  apiAuth = new APIAuthMiddleware(database);
  return router;
}

/**
 * Optional API key authentication middleware
 * If X-API-Key header is present, validates it and tracks usage
 * If not present, allows request to continue (for internal UI usage)
 */
const optionalApiAuth = [
  async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    // If no API key, skip authentication (internal usage)
    if (!apiKey) {
      return next();
    }

    // If API key present, validate it
    if (!apiAuth) {
      return res.status(503).json({
        status: 'error',
        error: 'API authentication not initialized'
      });
    }

    // Run API key validation
    return apiAuth.validateKey(req, res, next);
  },
  async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    // Skip rate limiting if no API key
    if (!apiKey || !apiAuth) {
      return next();
    }

    // Run rate limit check
    return apiAuth.checkRateLimit(req, res, next);
  },
  async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    // Skip usage tracking if no API key
    if (!apiKey || !apiAuth) {
      return next();
    }

    // Track API usage
    return apiAuth.trackUsage(req, res, next);
  }
];

// Load seed data on startup
const seedDataDir = path.join(__dirname, '../data');

try {
  const firstNamesData = JSON.parse(fs.readFileSync(path.join(seedDataDir, 'seed-first-names.json'), 'utf8'));
  const lastNamesData = JSON.parse(fs.readFileSync(path.join(seedDataDir, 'seed-last-names.json'), 'utf8'));
  const domainsData = JSON.parse(fs.readFileSync(path.join(seedDataDir, 'seed-domains.json'), 'utf8'));
  const phonePatternsData = JSON.parse(fs.readFileSync(path.join(seedDataDir, 'seed-phone-patterns.json'), 'utf8'));

  generator.loadData({
    firstNames: firstNamesData.first_names,
    lastNames: lastNamesData.last_names,
    domains: domainsData.domains,
    phonePatterns: phonePatternsData.phone_patterns
  });

  console.log('[Swiper] Loaded seed data:', generator.getStats());
} catch (error) {
  console.error('[Swiper] Error loading seed data:', error.message);
}

/**
 * GET /api/swiper/profile
 * Generate a random profile combination
 *
 * Query params:
 * - weighted: boolean (use popularity weighting)
 * - countryCode: string (specific country for phone)
 * - sessionId: string (for duplicate tracking)
 */
router.get('/profile', optionalApiAuth, async (req, res) => {
  try {
    const { weighted, countryCode, sessionId } = req.query;

    const options = {
      weighted: weighted === 'true',
      countryCode: countryCode || undefined
    };

    const profile = generator.generateProfile(options);

    res.json({
      status: 'ok',
      profile,
      stats: generator.getStats()
    });

  } catch (error) {
    console.error('[Swiper] Error generating profile:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/swiper/swipe
 * Record a swipe action (left/right)
 *
 * Body:
 * - profile: object (the profile card that was swiped)
 * - direction: string ('left' or 'right')
 * - sessionId: string (optional)
 * - userId: string (optional)
 */
router.post('/swipe', optionalApiAuth, async (req, res) => {
  try {
    const { profile, direction, sessionId, userId } = req.body;

    if (!profile) {
      return res.status(400).json({
        status: 'error',
        message: 'profile is required'
      });
    }

    if (!direction || !['left', 'right'].includes(direction)) {
      return res.status(400).json({
        status: 'error',
        message: 'direction must be "left" or "right"'
      });
    }

    const db = req.app.locals.db;
    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not initialized'
      });
    }

    let matchId = null;

    // If swiped right, save to profile_matches
    if (direction === 'right') {
      const matchResult = await db.query(`
        INSERT INTO profile_matches (
          first_name,
          last_name,
          email,
          phone,
          domain,
          country_code,
          country_name,
          metadata,
          match_score,
          first_name_origin,
          last_name_origin,
          generation_method,
          session_id,
          user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        profile.first_name,
        profile.last_name,
        profile.email,
        profile.phone_formatted || profile.phone,
        profile.domain,
        profile.country_code,
        profile.country_name,
        profile.metadata || {},
        profile.match_score || 50,
        profile.metadata?.first_name_origin || null,
        profile.metadata?.last_name_origin || null,
        'swiper',
        sessionId || null,
        userId || null
      ]);

      matchId = matchResult.rows[0].id;
      console.log(`[Swiper] Created match ${matchId}: ${profile.full_name}`);
    }

    // Record in swipe_history
    await db.query(`
      INSERT INTO swipe_history (
        profile_data,
        direction,
        match_id,
        session_id,
        user_id
      )
      VALUES ($1, $2, $3, $4, $5)
    `, [
      profile,
      direction,
      matchId,
      sessionId || null,
      userId || null
    ]);

    res.json({
      status: 'ok',
      direction,
      match_id: matchId,
      message: direction === 'right' ? 'Match saved!' : 'Profile rejected'
    });

  } catch (error) {
    console.error('[Swiper] Error recording swipe:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/swiper/matches
 * Get all accepted profile matches
 *
 * Query params:
 * - sessionId: string (filter by session)
 * - userId: string (filter by user)
 * - limit: number (default: 50)
 * - offset: number (pagination)
 */
router.get('/matches', optionalApiAuth, async (req, res) => {
  try {
    const { sessionId, userId, limit = 50, offset = 0 } = req.query;

    const db = req.app.locals.db;
    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not initialized'
      });
    }

    let query = `
      SELECT
        id,
        first_name,
        last_name,
        full_name,
        email,
        phone,
        domain,
        domain_type,
        country_code,
        country_name,
        match_score,
        metadata,
        exported,
        created_at
      FROM profile_matches
      WHERE 1=1
    `;

    const params = [];

    if (sessionId) {
      params.push(sessionId);
      query += ` AND session_id = $${params.length}`;
    }

    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;

    params.push(parseInt(limit));
    query += ` LIMIT $${params.length}`;

    params.push(parseInt(offset));
    query += ` OFFSET $${params.length}`;

    const result = await db.query(query, params);

    res.json({
      status: 'ok',
      count: result.rows.length,
      matches: result.rows
    });

  } catch (error) {
    console.error('[Swiper] Error fetching matches:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/swiper/stats
 * Get swipe statistics
 *
 * Query params:
 * - sessionId: string (filter by session)
 * - userId: string (filter by user)
 */
router.get('/stats', optionalApiAuth, async (req, res) => {
  try {
    const { sessionId, userId } = req.query;

    const db = req.app.locals.db;
    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not initialized'
      });
    }

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (sessionId) {
      params.push(sessionId);
      whereClause += ` AND session_id = $${params.length}`;
    }

    if (userId) {
      params.push(userId);
      whereClause += ` AND user_id = $${params.length}`;
    }

    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total_swipes,
        COUNT(*) FILTER (WHERE direction = 'right') as accepted,
        COUNT(*) FILTER (WHERE direction = 'left') as rejected,
        ROUND(100.0 * COUNT(*) FILTER (WHERE direction = 'right') / NULLIF(COUNT(*), 0), 2) as accept_rate
      FROM swipe_history
      ${whereClause}
    `, params);

    const topDomainsResult = await db.query(`
      SELECT
        domain,
        COUNT(*) as count
      FROM profile_matches
      ${whereClause.replace('swipe_history', 'profile_matches')}
      GROUP BY domain
      ORDER BY count DESC
      LIMIT 5
    `, params);

    const topNamesResult = await db.query(`
      SELECT
        first_name,
        last_name,
        COUNT(*) as count
      FROM profile_matches
      ${whereClause.replace('swipe_history', 'profile_matches')}
      GROUP BY first_name, last_name
      ORDER BY count DESC
      LIMIT 5
    `, params);

    res.json({
      status: 'ok',
      stats: statsResult.rows[0],
      top_domains: topDomainsResult.rows,
      top_names: topNamesResult.rows,
      generator_stats: generator.getStats()
    });

  } catch (error) {
    console.error('[Swiper] Error fetching stats:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/swiper/export
 * Export matches to various formats
 *
 * Body:
 * - format: string ('vcard', 'csv', 'json')
 * - sessionId: string (optional - filter)
 * - userId: string (optional - filter)
 * - matchIds: array (optional - specific IDs)
 */
router.post('/export', optionalApiAuth, async (req, res) => {
  try {
    const { format, sessionId, userId, matchIds } = req.body;

    if (!format || !['vcard', 'csv', 'json'].includes(format)) {
      return res.status(400).json({
        status: 'error',
        message: 'format must be "vcard", "csv", or "json"'
      });
    }

    const db = req.app.locals.db;
    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not initialized'
      });
    }

    // Build query to get matches
    let query = 'SELECT * FROM profile_matches WHERE 1=1';
    const params = [];

    if (matchIds && matchIds.length > 0) {
      params.push(matchIds);
      query += ` AND id = ANY($${params.length})`;
    } else {
      if (sessionId) {
        params.push(sessionId);
        query += ` AND session_id = $${params.length}`;
      }
      if (userId) {
        params.push(userId);
        query += ` AND user_id = $${params.length}`;
      }
    }

    const result = await db.query(query, params);
    const matches = result.rows;

    if (matches.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No matches found to export'
      });
    }

    let output;
    let contentType;

    // Generate export based on format
    if (format === 'json') {
      output = JSON.stringify(matches, null, 2);
      contentType = 'application/json';
    } else if (format === 'csv') {
      output = generateCSV(matches);
      contentType = 'text/csv';
    } else if (format === 'vcard') {
      output = generateVCard(matches);
      contentType = 'text/vcard';
    }

    // Record export in database
    await db.query(`
      INSERT INTO contact_exports (
        export_format,
        profile_ids,
        profile_count,
        session_id,
        user_id
      )
      VALUES ($1, $2, $3, $4, $5)
    `, [
      format,
      matches.map(m => m.id),
      matches.length,
      sessionId || null,
      userId || null
    ]);

    // Send file download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="matches.${format}"`);
    res.send(output);

  } catch (error) {
    console.error('[Swiper] Error exporting matches:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/swiper/seed
 * Seed database with names and domains (for initial setup)
 */
router.post('/seed', async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not initialized'
      });
    }

    const seedDataDir = path.join(__dirname, '../data');

    // Seed first names
    const firstNamesData = JSON.parse(fs.readFileSync(path.join(seedDataDir, 'seed-first-names.json'), 'utf8'));
    for (const fn of firstNamesData.first_names) {
      await db.query(`
        INSERT INTO first_names (name, gender, origin, popularity)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) DO NOTHING
      `, [fn.name, fn.gender, fn.origin, fn.popularity]);
    }

    // Seed last names
    const lastNamesData = JSON.parse(fs.readFileSync(path.join(seedDataDir, 'seed-last-names.json'), 'utf8'));
    for (const ln of lastNamesData.last_names) {
      await db.query(`
        INSERT INTO last_names (name, origin, frequency)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO NOTHING
      `, [ln.name, ln.origin, ln.frequency]);
    }

    // Seed domains
    const domainsData = JSON.parse(fs.readFileSync(path.join(seedDataDir, 'seed-domains.json'), 'utf8'));
    for (const d of domainsData.domains) {
      await db.query(`
        INSERT INTO domain_names (domain, type)
        VALUES ($1, $2)
        ON CONFLICT (domain) DO NOTHING
      `, [d.domain, d.type]);
    }

    // Seed phone patterns
    const phonePatternsData = JSON.parse(fs.readFileSync(path.join(seedDataDir, 'seed-phone-patterns.json'), 'utf8'));
    for (const pp of phonePatternsData.phone_patterns) {
      await db.query(`
        INSERT INTO phone_patterns (country_code, country_name, pattern, example, dial_code)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (country_code, pattern) DO NOTHING
      `, [pp.country_code, pp.country_name, pp.pattern, pp.example, pp.dial_code]);
    }

    console.log('[Swiper] Database seeded successfully');

    res.json({
      status: 'ok',
      message: 'Database seeded successfully',
      counts: {
        first_names: firstNamesData.first_names.length,
        last_names: lastNamesData.last_names.length,
        domains: domainsData.domains.length,
        phone_patterns: phonePatternsData.phone_patterns.length
      }
    });

  } catch (error) {
    console.error('[Swiper] Error seeding database:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * DELETE /api/swiper/clear
 * Clear all matches and swipe history (for testing)
 */
router.delete('/clear', async (req, res) => {
  try {
    const { sessionId } = req.query;

    const db = req.app.locals.db;
    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not initialized'
      });
    }

    if (sessionId) {
      await db.query('DELETE FROM swipe_history WHERE session_id = $1', [sessionId]);
      await db.query('DELETE FROM profile_matches WHERE session_id = $1', [sessionId]);
    } else {
      await db.query('TRUNCATE TABLE swipe_history, profile_matches, contact_exports RESTART IDENTITY CASCADE');
    }

    generator.clearCache();

    res.json({
      status: 'ok',
      message: sessionId ? `Cleared data for session ${sessionId}` : 'All swiper data cleared'
    });

  } catch (error) {
    console.error('[Swiper] Error clearing data:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Helper functions for export formats

function generateCSV(matches) {
  const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Domain', 'Country', 'Match Score'];
  const rows = matches.map(m => [
    m.first_name,
    m.last_name,
    m.email,
    m.phone,
    m.domain,
    m.country_name,
    m.match_score
  ]);

  let csv = headers.join(',') + '\n';
  for (const row of rows) {
    csv += row.map(field => `"${field}"`).join(',') + '\n';
  }

  return csv;
}

function generateVCard(matches) {
  let vcard = '';

  for (const match of matches) {
    vcard += 'BEGIN:VCARD\n';
    vcard += 'VERSION:3.0\n';
    vcard += `FN:${match.full_name}\n`;
    vcard += `N:${match.last_name};${match.first_name};;;\n`;
    vcard += `EMAIL:${match.email}\n`;
    vcard += `TEL:${match.phone}\n`;
    vcard += `NOTE:Match Score: ${match.match_score}, Domain: ${match.domain}\n`;
    vcard += 'END:VCARD\n\n';
  }

  return vcard;
}

module.exports = { router, initRoutes };
