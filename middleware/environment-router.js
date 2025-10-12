/**
 * Environment Router Middleware
 *
 * Craigslist-style domain redirect logic
 * example.com → example.org (or vice versa)
 * Staging vs Production environment detection
 */

class EnvironmentRouter {
  constructor(options = {}) {
    this.productionDomains = options.productionDomains || [
      'yourdomain.org',
      'www.yourdomain.org',
      'yourdomain.com', // redirects to .org
      'www.yourdomain.com'
    ];

    this.stagingDomains = options.stagingDomains || [
      'staging.yourdomain.com',
      'staging.yourdomain.org',
      'dev.yourdomain.com',
      'localhost'
    ];

    // Redirect rules
    this.redirects = options.redirects || {
      'yourdomain.com': 'yourdomain.org',
      'www.yourdomain.com': 'www.yourdomain.org'
    };

    this.enableRedirects = options.enableRedirects !== false;
    this.forceHttps = options.forceHttps !== false;
  }

  /**
   * Detect environment from hostname
   */
  detectEnvironment(hostname) {
    // Normalize hostname
    hostname = hostname.toLowerCase().replace(/:\d+$/, '');

    // Check if staging
    if (this.stagingDomains.some(domain => hostname.includes(domain))) {
      return {
        type: 'staging',
        theme: 'staging',
        isProduction: false,
        isStaging: true,
        hostname
      };
    }

    // Check if production
    if (this.productionDomains.some(domain => hostname === domain)) {
      return {
        type: 'production',
        theme: 'production',
        isProduction: true,
        isStaging: false,
        hostname
      };
    }

    // Default to development
    return {
      type: 'development',
      theme: 'staging',
      isProduction: false,
      isStaging: false,
      hostname
    };
  }

  /**
   * Check if domain should redirect
   */
  shouldRedirect(hostname) {
    if (!this.enableRedirects) {
      return null;
    }

    hostname = hostname.toLowerCase().replace(/:\d+$/, '');

    // Check redirect rules
    for (const [from, to] of Object.entries(this.redirects)) {
      if (hostname === from || hostname === `www.${from}`) {
        return to;
      }
    }

    return null;
  }

  /**
   * Express middleware
   */
  middleware() {
    return (req, res, next) => {
      const hostname = req.hostname || req.get('host') || 'localhost';
      const protocol = req.protocol || (req.secure ? 'https' : 'http');

      // Detect environment
      const environment = this.detectEnvironment(hostname);

      // Attach to request
      req.environment = environment;

      // Attach to res.locals for templates
      res.locals.environment = environment;
      res.locals.isProduction = environment.isProduction;
      res.locals.isStaging = environment.isStaging;
      res.locals.theme = environment.theme;

      // Check for HTTPS redirect
      if (this.forceHttps && environment.isProduction && protocol !== 'https') {
        const redirectUrl = `https://${hostname}${req.originalUrl}`;
        console.log(`[EnvironmentRouter] HTTPS redirect: ${redirectUrl}`);
        return res.redirect(301, redirectUrl);
      }

      // Check for domain redirect
      const redirectDomain = this.shouldRedirect(hostname);

      if (redirectDomain) {
        const redirectUrl = `${protocol}://${redirectDomain}${req.originalUrl}`;
        console.log(`[EnvironmentRouter] Domain redirect: ${hostname} → ${redirectDomain}`);
        return res.redirect(301, redirectUrl);
      }

      // Log environment (staging only)
      if (environment.isStaging) {
        console.log(`[EnvironmentRouter] ${req.method} ${req.path} [${environment.type}]`);
      }

      next();
    };
  }

  /**
   * Get environment info
   */
  getEnvironmentInfo(req) {
    return req.environment || this.detectEnvironment(req.hostname);
  }

  /**
   * Check if request is from production
   */
  isProduction(req) {
    const env = this.getEnvironmentInfo(req);
    return env.isProduction;
  }

  /**
   * Check if request is from staging
   */
  isStaging(req) {
    const env = this.getEnvironmentInfo(req);
    return env.isStaging;
  }
}

module.exports = EnvironmentRouter;
