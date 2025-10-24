/**
 * CORS Middleware for GitHub Pages
 *
 * Allows GitHub Pages (soulfra.github.io) to call localhost API
 * Enables "bridge" pattern where static site hits dynamic backend
 *
 * Security:
 * - Only allows specific origins
 * - Only allows specific headers
 * - Only allows specific methods
 * - Handles preflight OPTIONS requests
 *
 * @version 1.0.0
 * @license MIT
 */

const corsGitHubPages = (req, res, next) => {
  const origin = req.headers.origin;

  // Allowed origins
  const allowedOrigins = [
    'https://soulfra.github.io',
    'http://localhost:5001',
    'http://localhost:5002',
    'http://127.0.0.1:5001',
    'http://127.0.0.1:5002',
    // Add your local IP for mobile testing
    `http://192.168.1.${req.headers['x-forwarded-for']?.split('.').pop() || '87'}:5001`
  ];

  // Check if origin is allowed
  if (allowedOrigins.includes(origin) || origin?.startsWith('http://192.168.1.')) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'false'); // Don't send cookies
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, X-User-API-Key, X-Device-Fingerprint, X-User-ID, X-Client-IP, Authorization'
    );
    res.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.header(
      'Access-Control-Max-Age',
      '86400' // 24 hours
    );
  }

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }

  next();
};

module.exports = corsGitHubPages;
