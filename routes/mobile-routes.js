/**
 * Mobile Routes
 *
 * API endpoints for the mobile-home.html "McDonald's Drive-Thru" experience
 * Provides stats, network info, and mobile-optimized features
 */

const express = require('express');
const router = express.Router();
const os = require('os');
const crypto = require('crypto');
const QRGenerator = require('../lib/qr-generator');
const DevRagebaitGenerator = require('../lib/dev-ragebait-generator');
const fs = require('fs').promises;
const path = require('path');

// Database connection (injected via initRoutes)
let db = null;

// Initialize QR generator
const qrGenerator = new QRGenerator({
  baseUrl: process.env.BASE_URL || 'http://localhost:5001'
});

// Initialize ragebait generator
const ragebaitGenerator = new DevRagebaitGenerator();

/**
 * Initialize routes with database connection
 * Following Cal's graceful degradation pattern - database is optional
 */
function initRoutes(database) {
  db = database;

  if (!db) {
    console.log('[MobileRoutes] Running in API mode (no database)');
    console.log('[MobileRoutes] ✓ Ragebait generator available');
    console.log('[MobileRoutes] ✗ QR login, stats, and counters unavailable');
  } else {
    console.log('[MobileRoutes] Running with full database support');
  }

  return router;
}

/**
 * GET /api/mobile/qr-login
 * Generate QR code for iPhone camera login
 * Requires database for session tracking
 */
router.get('/qr-login', async (req, res) => {
  // Graceful degradation: require database for QR login
  if (!db) {
    return res.status(503).json({
      error: 'QR login unavailable in API mode',
      message: 'Database required for session tracking. Try ragebait generator instead!'
    });
  }

  try {
    // Generate session ID for this QR code
    const sessionId = crypto.randomBytes(16).toString('hex');

    // Get local IP for the QR code URL
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';

    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIP = iface.address;
          break;
        }
      }
      if (localIP !== 'localhost') break;
    }

    // Create login URL with session ID
    const loginUrl = `http://${localIP}:5001/auth-dashboard.html?session=${sessionId}&source=mobile-qr`;

    // Generate QR code
    const qrDataUrl = await qrGenerator.generateQR(loginUrl, {
      errorCorrectionLevel: 'H',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Store session in database (for verification later)
    try {
      await db.run(`
        INSERT INTO qr_login_sessions (session_id, created_at, expires_at, status)
        VALUES (?, datetime('now'), datetime('now', '+5 minutes'), 'pending')
      `, [sessionId]);
    } catch (dbErr) {
      console.warn('Could not store QR session in DB:', dbErr.message);
    }

    res.json({
      qr: qrDataUrl,
      sessionId,
      loginUrl,
      expiresIn: 300 // 5 minutes
    });

  } catch (err) {
    console.error('Error generating QR login code:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

/**
 * GET /api/mobile/stats
 * Get statistics for "billions served" counter
 */
router.get('/stats', async (req, res) => {
  try {
    // Query database for real stats
    const totalRequests = await getTotalRequests();
    const mvpCount = await getMVPCount();
    const apiCallCount = await getAPICallCount();
    const activeUsers = await getActiveUsers();

    res.json({
      totalRequests,
      mvpCount,
      apiCallCount,
      activeUsers,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('Error fetching mobile stats:', err);

    // Return demo values if error
    res.json({
      totalRequests: 420690000,
      mvpCount: 1337,
      apiCallCount: 69420,
      activeUsers: 42,
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/network/info
 * Get local network information
 */
router.get('/info', (req, res) => {
  try {
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';

    // Find local IP (prefer WiFi/Ethernet over loopback)
    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        // Skip loopback and non-IPv4
        if (iface.family === 'IPv4' && !iface.internal) {
          localIP = iface.address;
          break;
        }
      }
      if (localIP !== 'localhost') break;
    }

    // Fun fake metrics (onion layers, ARPANET hops)
    const onionLayers = Math.floor(Math.random() * 3) + 5; // 5-7 layers
    const arpanetHops = Math.floor(Math.random() * 5) + 2; // 2-6 hops

    res.json({
      localIP,
      hostname: os.hostname(),
      platform: os.platform(),
      uptime: os.uptime(),
      // Joke metrics
      onionLayers,
      arpanetHops,
      paranoia: onionLayers >= 7 ? 'maximum' : 'moderate',
      vintage: arpanetHops <= 3 ? 'classic' : 'modern'
    });
  } catch (err) {
    console.error('Error fetching network info:', err);
    res.status(500).json({ error: 'Failed to get network info' });
  }
});

/**
 * GET /api/mobile/meme
 * Get random programming meme
 */
router.get('/meme', (req, res) => {
  const memes = [
    { text: '"It works on my iPhone" 🤷‍♂️', category: 'testing' },
    { text: '"Just one more git push" - Famous last words', category: 'git' },
    { text: '"Why use many server when one server do trick?" 🖥️', category: 'devops' },
    { text: '"npm install --save leftpad" 📦', category: 'javascript' },
    { text: '"setTimeout(() => { fixBug(); }, 0)" - Classic', category: 'javascript' },
    { text: '"// TODO: Make this work" - 6 months ago', category: 'comments' },
    { text: '"Works in production, fails in dev" 🔥', category: 'deployment' },
    { text: '"200 OK - Actually returns 500" 😅', category: 'http' },
    { text: '"Have you tried turning it off and on again?" 💻', category: 'support' },
    { text: '"This will only take 5 minutes" - 3 hours ago', category: 'estimates' },
    { text: '"Let\'s just monkey-patch it" 🐵', category: 'fixes' },
    { text: '"console.log(\'here\')" - Debugging in 2025', category: 'debugging' }
  ];

  const randomMeme = memes[Math.floor(Math.random() * memes.length)];
  res.json(randomMeme);
});

/**
 * GET /api/mobile/ragebait/templates
 * Get all available ragebait templates
 */
router.get('/ragebait/templates', (req, res) => {
  try {
    const templates = ragebaitGenerator.getTemplates();
    res.json({
      templates,
      count: templates.length
    });
  } catch (err) {
    console.error('Error fetching ragebait templates:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * GET /api/mobile/ragebait/domains
 * Get available domain branding options
 */
router.get('/ragebait/domains', (req, res) => {
  try {
    const domains = Object.values(ragebaitGenerator.domainBranding);
    res.json({
      success: true,
      domains: domains
    });
  } catch (err) {
    console.error('Error fetching domains:', err);
    res.status(500).json({
      error: 'Failed to fetch domains',
      message: err.message
    });
  }
});

/**
 * POST /api/mobile/ragebait/generate/:templateId
 * Generate ragebait GIF and MP4 from template
 */
router.post('/ragebait/generate/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const { domainId } = req.body; // Optional domain branding

    const template = ragebaitGenerator.getTemplate(templateId);
    if (!template) {
      return res.status(404).json({ error: `Template "${templateId}" not found` });
    }

    console.log(`[RagebaitAPI] Generating "${template.name}"${domainId ? ` with ${domainId} branding` : ''}...`);

    // Generate both GIF and MP4 with optional domain branding
    const result = await ragebaitGenerator.generate(templateId, { domainId });

    // Read the GIF file
    const gifBuffer = await fs.readFile(result.gif.path);
    const gifBase64 = gifBuffer.toString('base64');
    const gifDataUrl = `data:image/gif;base64,${gifBase64}`;

    // Read the MP4 file
    const mp4Buffer = await fs.readFile(result.mp4.path);
    const mp4Base64 = mp4Buffer.toString('base64');
    const mp4DataUrl = `data:video/mp4;base64,${mp4Base64}`;

    res.json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        caption: result.caption,
        hashtags: result.hashtags
      },
      gif: {
        dataUrl: gifDataUrl,
        path: result.gif.path,
        sizeMB: result.gif.sizeMB,
        frames: result.frames
      },
      mp4: {
        dataUrl: mp4DataUrl,
        path: result.mp4.path,
        sizeMB: result.mp4.sizeMB,
        frames: result.frames
      },
      shareText: `${result.caption}\n\n${result.hashtags.join(' ')}\n\nGenerated with CALOS 🚀`
    });

  } catch (err) {
    console.error('Error generating ragebait:', err);
    res.status(500).json({
      error: 'Failed to generate ragebait',
      message: err.message
    });
  }
});

/**
 * GET /api/mobile/ragebait/:templateId/preview
 * Get preview info for a template (without generating GIF)
 */
router.get('/ragebait/:templateId/preview', (req, res) => {
  try {
    const { templateId } = req.params;
    const template = ragebaitGenerator.getTemplate(templateId);

    if (!template) {
      return res.status(404).json({ error: `Template "${templateId}" not found` });
    }

    res.json({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      caption: template.caption,
      hashtags: template.hashtags,
      frames: template.frames.map((f, i) => ({
        number: i + 1,
        text: f.text,
        subtitle: f.subtitle,
        emoji: f.emoji
      }))
    });
  } catch (err) {
    console.error('Error fetching ragebait preview:', err);
    res.status(500).json({ error: 'Failed to fetch preview' });
  }
});

/**
 * POST /api/mobile/increment
 * Increment a counter (for "billions served" game)
 * Requires database for persistent counters
 */
router.post('/increment', async (req, res) => {
  // Graceful degradation: require database for counters
  if (!db) {
    return res.status(503).json({
      error: 'Counters unavailable in API mode',
      message: 'Database required for persistent counters'
    });
  }

  try {
    const { counter } = req.body;

    if (!counter) {
      return res.status(400).json({ error: 'Counter name required' });
    }

    // Increment counter in database
    await incrementCounter(counter);

    res.json({
      success: true,
      counter,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('Error incrementing counter:', err);
    res.status(500).json({ error: 'Failed to increment counter' });
  }
});

// Helper functions

async function getTotalRequests() {
  try {
    const result = await db.get(`
      SELECT COUNT(*) as count
      FROM visit_sessions
      WHERE created_at > datetime('now', '-30 days')
    `);
    return result?.count || 420690000;
  } catch (err) {
    return 420690000; // Demo value
  }
}

async function getMVPCount() {
  try {
    // Count autonomous builds or deployments
    const result = await db.get(`
      SELECT COUNT(*) as count
      FROM autonomous_builds
      WHERE status = 'deployed'
    `);
    return result?.count || 1337;
  } catch (err) {
    return 1337; // Demo value
  }
}

async function getAPICallCount() {
  try {
    const result = await db.get(`
      SELECT COUNT(*) as count
      FROM api_requests
      WHERE created_at > datetime('now', '-7 days')
    `);
    return result?.count || 69420;
  } catch (err) {
    return 69420; // Demo value
  }
}

async function getActiveUsers() {
  try {
    const result = await db.get(`
      SELECT COUNT(DISTINCT device_id) as count
      FROM visit_sessions
      WHERE last_seen > datetime('now', '-1 hour')
    `);
    return result?.count || 42;
  } catch (err) {
    return 42; // Demo value
  }
}

async function incrementCounter(counterName) {
  try {
    await db.run(`
      INSERT INTO mobile_counters (name, count, updated_at)
      VALUES (?, 1, datetime('now'))
      ON CONFLICT(name) DO UPDATE SET
        count = count + 1,
        updated_at = datetime('now')
    `, [counterName]);
  } catch (err) {
    console.error('Error incrementing counter:', err);
  }
}

// ============================================================================
// TELEMETRY & ATTRIBUTION TRACKING (Privacy-First)
// ============================================================================

const AttributionTracker = require('../lib/attribution-tracker');
const attributionTracker = new AttributionTracker();

// Initialize attribution tracker
attributionTracker.init().catch(err => {
  console.warn('[MobileRoutes] Attribution tracker init failed:', err.message);
});

/**
 * POST /api/telemetry/attribution
 * Privacy-first SDK usage tracking (opt-in only)
 *
 * Tracks ONLY:
 * - Domain using SDK
 * - SDK version
 * - Privacy mode
 * - Timestamp
 *
 * Does NOT track:
 * - User data
 * - IPs
 * - Cookies
 * - PII
 */
router.post('/telemetry/attribution', async (req, res) => {
  try {
    const { domain, version, privacyMode, timestamp } = req.body;

    // Validate required fields
    if (!domain || !version) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['domain', 'version']
      });
    }

    // Record attribution
    const result = await attributionTracker.record({
      domain,
      version,
      privacyMode: privacyMode || 'unknown',
      timestamp: timestamp || new Date().toISOString()
    });

    res.json({
      success: true,
      action: result.action,
      message: 'Attribution recorded (privacy-first)'
    });

  } catch (error) {
    console.error('[Telemetry] Attribution failed:', error.message);
    res.status(500).json({
      error: 'Attribution tracking failed',
      message: error.message
    });
  }
});

/**
 * GET /api/telemetry/stats
 * Get SDK usage statistics
 */
router.get('/telemetry/stats', async (req, res) => {
  try {
    const stats = await attributionTracker.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[Telemetry] Stats failed:', error.message);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

/**
 * GET /api/telemetry/export
 * Export all attribution data (admin only)
 */
router.get('/telemetry/export', async (req, res) => {
  try {
    const result = await attributionTracker.exportAll();

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        count: result.data.length
      });
    } else {
      res.status(500).json({
        error: 'Export failed',
        message: result.error
      });
    }
  } catch (error) {
    console.error('[Telemetry] Export failed:', error.message);
    res.status(500).json({
      error: 'Export failed',
      message: error.message
    });
  }
});

module.exports = initRoutes;
module.exports.router = router;
