/**
 * Public Data Routes - ipconfig.io Style API
 *
 * Returns all publicly available information about a request:
 * - IP address and geolocation
 * - Browser/device information
 * - Network details (ISP, timezone)
 * - Feature detection (ES5/ES6, APIs, etc.)
 *
 * Like ipconfig.io but built from top to bottom with our own servers
 */

const express = require('express');
const router = express.Router();

/**
 * Parse browser and OS from user agent
 */
function parseUserAgent(userAgent) {
  const browsers = {
    'Chrome': /Chrome\/(\d+)/,
    'Firefox': /Firefox\/(\d+)/,
    'Safari': /Version\/(\d+).*Safari/,
    'Edge': /Edg\/(\d+)/,
    'Opera': /Opera\/(\d+)/,
    'IE': /MSIE (\d+)/
  };

  const oses = {
    'Windows': /Windows NT (\d+\.\d+)/,
    'macOS': /Mac OS X (\d+[._]\d+)/,
    'iOS': /iPhone OS (\d+[._]\d+)/,
    'Android': /Android (\d+\.\d+)/,
    'Linux': /Linux/
  };

  let browser = 'Unknown';
  let browserVersion = '0';
  let os = 'Unknown';

  for (const [name, regex] of Object.entries(browsers)) {
    const match = userAgent.match(regex);
    if (match) {
      browser = name;
      browserVersion = match[1];
      break;
    }
  }

  for (const [name, regex] of Object.entries(oses)) {
    if (regex.test(userAgent)) {
      os = name;
      break;
    }
  }

  return { browser, browserVersion, os };
}

/**
 * Detect device type
 */
function detectDevice(userAgent) {
  const mobile = /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent);
  const tablet = /iPad|Android.*Tablet/i.test(userAgent);

  if (tablet) return 'tablet';
  if (mobile) return 'mobile';
  return 'desktop';
}

/**
 * Initialize routes with dependencies
 */
function initializeRoutes(db, { geoResolver } = {}) {
  /**
   * GET /api/public-data
   * Returns all public information about the request
   */
  router.get('/', async (req, res) => {
    try {
      // Extract IP address
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                 req.headers['x-real-ip'] ||
                 req.connection.remoteAddress ||
                 req.socket.remoteAddress ||
                 'Unknown';

      // Parse user agent
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const { browser, browserVersion, os } = parseUserAgent(userAgent);
      const deviceType = detectDevice(userAgent);

      // Get geolocation (if geo-resolver is available)
      let geolocation = null;
      if (geoResolver && ip !== 'Unknown' && !ip.startsWith('::')) {
        try {
          geolocation = await geoResolver.resolve(ip);
        } catch (error) {
          console.error('[PublicData] Geolocation error:', error);
        }
      }

      // Detect features from headers
      const features = {
        acceptEncoding: req.headers['accept-encoding']?.split(',').map(e => e.trim()) || [],
        acceptLanguage: req.headers['accept-language']?.split(',')[0]?.split(';')[0] || 'Unknown',
        dnt: req.headers['dnt'] === '1', // Do Not Track
        connection: req.headers['connection'] || 'Unknown',
        upgradeInsecureRequests: req.headers['upgrade-insecure-requests'] === '1'
      };

      // Build response
      const publicData = {
        timestamp: new Date().toISOString(),
        request: {
          ip,
          method: req.method,
          protocol: req.protocol,
          secure: req.secure,
          host: req.get('host')
        },
        browser: {
          name: browser,
          version: browserVersion,
          userAgent,
          os
        },
        device: {
          type: deviceType,
          mobile: deviceType === 'mobile' || deviceType === 'tablet'
        },
        geolocation: geolocation ? {
          country: geolocation.country || null,
          countryCode: geolocation.countryCode || null,
          region: geolocation.regionName || null,
          city: geolocation.city || null,
          zip: geolocation.zip || null,
          lat: geolocation.lat || null,
          lon: geolocation.lon || null,
          timezone: geolocation.timezone || null,
          isp: geolocation.isp || null,
          org: geolocation.org || null
        } : null,
        features,
        headers: {
          referer: req.headers['referer'] || null,
          acceptLanguage: req.headers['accept-language'] || null,
          acceptEncoding: req.headers['accept-encoding'] || null
        }
      };

      // Log to session analytics if database available
      if (db) {
        try {
          await db.query(`
            INSERT INTO public_data_requests (ip, user_agent, country, city, request_data)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING
          `, [
            ip,
            userAgent,
            geolocation?.country || null,
            geolocation?.city || null,
            JSON.stringify(publicData)
          ]);
        } catch (dbError) {
          // Table might not exist yet, silently fail
          console.log('[PublicData] Database logging skipped (table may not exist)');
        }
      }

      // Return public data
      res.json(publicData);

    } catch (error) {
      console.error('[PublicData] Error:', error);
      res.status(500).json({
        error: 'Failed to retrieve public data',
        message: error.message
      });
    }
  });

  /**
   * GET /api/public-data/ip
   * Returns only IP address (like ifconfig.me)
   */
  router.get('/ip', (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection.remoteAddress ||
               req.socket.remoteAddress ||
               'Unknown';

    res.send(ip);
  });

  /**
   * GET /api/public-data/user-agent
   * Returns only user agent string
   */
  router.get('/user-agent', (req, res) => {
    res.send(req.headers['user-agent'] || 'Unknown');
  });

  return router;
}

module.exports = { initializeRoutes };
