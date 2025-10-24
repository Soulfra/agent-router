/**
 * Branding Enforcement Middleware
 *
 * Enforces CALOS branding based on domain and license tier.
 *
 * Branding Rules:
 * - calos.sh (any tier): Full CALOS branding (logo, footer, colors)
 * - Self-hosted + Community tier: "Powered by CALOS" footer required
 * - Self-hosted + Pro/Enterprise: White-label allowed (no branding)
 *
 * What Gets Injected:
 * - Full branding: Header logo, footer, CALOS colors
 * - Minimal branding: Footer text only ("Powered by CALOS")
 * - No branding: Nothing
 *
 * Usage:
 *   const { brandingMiddleware } = require('./lib/middleware/branding-middleware');
 *
 *   app.use(licenseMiddleware);    // Check tier first
 *   app.use(brandingMiddleware);   // Then inject branding
 *
 * Templates can then render:
 *   <%- req.branding.header %>
 *   <%- req.branding.footer %>
 */

/**
 * Check if domain is CALOS official domain
 *
 * @param {string} hostname
 * @returns {boolean}
 */
function isCALOSDomain(hostname) {
  const calosDomains = [
    'calos.sh',
    'www.calos.sh',
    /^[\w-]+\.calos\.sh$/,  // *.calos.sh subdomains
    'localhost',            // For testing
    '127.0.0.1'
  ];

  return calosDomains.some(pattern => {
    if (typeof pattern === 'string') {
      return hostname === pattern;
    } else {
      return pattern.test(hostname);
    }
  });
}

/**
 * Get branding level based on domain and tier
 *
 * @param {string} hostname
 * @param {string} tier - License tier (development, community, pro, enterprise)
 * @returns {string} - Branding level (full, minimal, none)
 */
function getBrandingLevel(hostname, tier) {
  // CALOS official domains always get full branding
  if (isCALOSDomain(hostname)) {
    return 'full';
  }

  // Self-hosted: Check tier
  switch (tier) {
    case 'development':
      // Localhost = no branding required
      return 'none';

    case 'community':
      // Community tier = minimal branding ("Powered by CALOS")
      return 'minimal';

    case 'pro':
    case 'enterprise':
      // Pro/Enterprise = white-label allowed
      return 'none';

    default:
      // Unknown tier = require minimal branding (safe default)
      return 'minimal';
  }
}

/**
 * Generate full branding HTML (logo + footer)
 *
 * @param {string} hostname
 * @returns {Object} - { header, footer, css }
 */
function getFullBranding(hostname) {
  return {
    header: `
      <div class="calos-branding-header" data-branding-level="full">
        <a href="https://calos.sh" class="calos-logo-link">
          <svg class="calos-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="calos-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="45" fill="url(#calos-gradient)" />
            <text x="50" y="65" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="white" text-anchor="middle">C</text>
          </svg>
          <span class="calos-logo-text">CALOS</span>
        </a>
      </div>
    `,
    footer: `
      <div class="calos-branding-footer" data-branding-level="full">
        <div class="calos-footer-content">
          <div class="calos-footer-logo">
            <svg class="calos-logo-small" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="calos-gradient-footer" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="45" fill="url(#calos-gradient-footer)" />
              <text x="50" y="65" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="white" text-anchor="middle">C</text>
            </svg>
          </div>
          <div class="calos-footer-text">
            <p><strong>Powered by CALOS</strong></p>
            <p class="calos-footer-tagline">Open source • Self-host free • Fair trade</p>
          </div>
          <div class="calos-footer-links">
            <a href="https://calos.sh" target="_blank">Home</a>
            <a href="https://calos.sh/marketplace" target="_blank">Marketplace</a>
            <a href="https://calos.sh/pricing" target="_blank">Pricing</a>
            <a href="https://docs.calos.sh" target="_blank">Docs</a>
            <a href="https://github.com/calos/agent-router" target="_blank">GitHub</a>
          </div>
        </div>
      </div>
    `,
    css: '/calos-branding.css',
    js: '/calos-branding.js',
    preventRemoval: true  // Client-side JS will re-inject if removed
  };
}

/**
 * Generate minimal branding HTML (footer only)
 *
 * @returns {Object} - { header, footer, css }
 */
function getMinimalBranding() {
  return {
    header: '',  // No header branding
    footer: `
      <div class="calos-branding-footer calos-branding-minimal" data-branding-level="minimal">
        <p class="calos-footer-minimal-text">
          Powered by <a href="https://calos.sh" target="_blank" class="calos-link">CALOS</a>
          • <a href="https://calos.sh/pricing" target="_blank" class="calos-link">Upgrade to remove this</a>
        </p>
      </div>
    `,
    css: '/calos-branding.css',
    js: '/calos-branding.js',
    preventRemoval: true  // Client-side JS will re-inject if removed
  };
}

/**
 * Generate no branding (white-label)
 *
 * @returns {Object} - { header, footer, css }
 */
function getNoBranding() {
  return {
    header: '',
    footer: '',
    css: null,
    js: null,
    preventRemoval: false
  };
}

/**
 * Branding middleware
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function brandingMiddleware(req, res, next) {
  try {
    // Get hostname and license tier
    const hostname = req.hostname || req.headers.host || 'localhost';
    const tier = req.license?.tier || 'community';

    // Determine branding level
    const brandingLevel = getBrandingLevel(hostname, tier);

    // Generate branding HTML
    let branding;
    switch (brandingLevel) {
      case 'full':
        branding = getFullBranding(hostname);
        break;
      case 'minimal':
        branding = getMinimalBranding();
        break;
      case 'none':
      default:
        branding = getNoBranding();
        break;
    }

    // Attach to request
    req.branding = {
      level: brandingLevel,
      ...branding
    };

    // Add branding headers (for client-side detection)
    res.setHeader('X-CALOS-Branding-Level', brandingLevel);
    if (branding.preventRemoval) {
      res.setHeader('X-CALOS-Branding-Required', 'true');
    }

    next();
  } catch (error) {
    console.error('[BrandingMiddleware] Error:', error.message);

    // Fallback: Minimal branding (safe default)
    req.branding = getMinimalBranding();
    req.branding.level = 'minimal';

    next();
  }
}

/**
 * Serve branding assets (CSS/JS)
 *
 * Usage:
 *   app.use('/calos-branding.css', serveBrandingCSS);
 *   app.use('/calos-branding.js', serveBrandingJS);
 */
function serveBrandingCSS(req, res) {
  res.setHeader('Content-Type', 'text/css');
  res.setHeader('Cache-Control', 'public, max-age=86400');  // Cache for 1 day

  // Serve CSS from file (will create in next step)
  res.sendFile('public/styles/calos-branding.css', { root: process.cwd() });
}

function serveBrandingJS(req, res) {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  // Serve JS from file (will create in next step)
  res.sendFile('public/components/calos-branding.js', { root: process.cwd() });
}

/**
 * Helper: Inject branding into HTML response
 *
 * Usage in templates:
 *   <%- req.branding.header %>
 *   <%- req.branding.footer %>
 *
 * Or use this helper to auto-inject:
 *   const html = injectBranding(htmlString, req.branding);
 *
 * @param {string} html - HTML string
 * @param {Object} branding - Branding object from req.branding
 * @returns {string} - HTML with branding injected
 */
function injectBranding(html, branding) {
  if (!branding || branding.level === 'none') {
    return html;
  }

  let result = html;

  // Inject CSS link in <head>
  if (branding.css) {
    const cssLink = `<link rel="stylesheet" href="${branding.css}">`;
    result = result.replace('</head>', `${cssLink}\n</head>`);
  }

  // Inject JS before </body>
  if (branding.js) {
    const jsScript = `<script src="${branding.js}"></script>`;
    result = result.replace('</body>', `${jsScript}\n</body>`);
  }

  // Inject header after <body>
  if (branding.header) {
    result = result.replace('<body>', `<body>\n${branding.header}`);
  }

  // Inject footer before </body>
  if (branding.footer) {
    result = result.replace('</body>', `${branding.footer}\n</body>`);
  }

  return result;
}

/**
 * Express response wrapper to auto-inject branding
 *
 * Usage:
 *   app.use(autoInjectBranding);
 *
 * This wraps res.send() to automatically inject branding into HTML responses
 */
function autoInjectBranding(req, res, next) {
  const originalSend = res.send;

  res.send = function (data) {
    // Only inject into HTML responses
    const contentType = res.getHeader('Content-Type') || '';
    if (contentType.includes('text/html') && typeof data === 'string') {
      data = injectBranding(data, req.branding);
    }

    originalSend.call(this, data);
  };

  next();
}

module.exports = {
  brandingMiddleware,
  serveBrandingCSS,
  serveBrandingJS,
  injectBranding,
  autoInjectBranding,
  isCALOSDomain,
  getBrandingLevel
};
