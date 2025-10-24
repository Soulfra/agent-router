/**
 * Public Meme API Routes
 *
 * Free API for meme generation with rate limiting
 * - No authentication required
 * - Rate limited: 100 requests/day per IP
 * - Returns base64 data URLs for instant preview
 */

const express = require('express');
const router = express.Router();
const DevRagebaitGenerator = require('../lib/dev-ragebait-generator');
const { createRateLimiter } = require('../middleware/rate-limiter');

// Create custom rate limiter for public API
// 100 requests per day per IP (more generous than voting)
const crypto = require('crypto');
const publicApiLimits = new Map();

function createPublicApiLimiter(maxRequests = 100, windowMs = 24 * 60 * 60 * 1000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `public-api:${ip}`;
    const now = Date.now();

    let entry = publicApiLimits.get(key);

    if (!entry || now > entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + windowMs
      };
      publicApiLimits.set(key, entry);
    }

    if (entry.count >= maxRequests) {
      const resetIn = Math.ceil((entry.resetAt - now) / 1000);
      const resetInHours = Math.ceil(resetIn / 3600);

      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        limit: maxRequests,
        window: '24 hours',
        resetInSeconds: resetIn,
        resetInHours,
        message: `You've reached your daily limit of ${maxRequests} requests. Try again in ${resetInHours} hours.`,
        suggestion: 'Contact us for higher limits or enterprise API access'
      });
    }

    entry.count++;

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());

    next();
  };
}

// Cleanup expired entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of publicApiLimits.entries()) {
    if (now > value.resetAt) {
      publicApiLimits.delete(key);
    }
  }
}, 60 * 60 * 1000);

// Apply rate limiting to all public API routes
const apiLimiter = createPublicApiLimiter(100, 24 * 60 * 60 * 1000); // 100/day

/**
 * GET /api/public/memes/
 * API root - returns overview and available endpoints
 */
router.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}/api/public/memes`;

  res.json({
    success: true,
    name: 'CALOS Meme Generator API',
    version: '1.0.0',
    description: 'Free API for generating viral dev memes in GIF and MP4 formats',
    documentation: `${req.protocol}://${req.get('host')}/api-docs-memes.html`,
    rateLimit: {
      limit: 100,
      window: '24 hours',
      scope: 'per IP address'
    },
    endpoints: {
      root: {
        method: 'GET',
        path: '/',
        description: 'This endpoint - API overview'
      },
      templates: {
        method: 'GET',
        path: '/templates',
        description: 'List all available meme templates',
        url: `${baseUrl}/templates`
      },
      generate: {
        method: 'POST',
        path: '/generate/:templateId',
        description: 'Generate a meme from a template',
        example: `${baseUrl}/generate/npm-install`,
        body: {
          format: 'both | gif | mp4 (optional)',
          quality: 'high | medium | low (optional)'
        }
      },
      stats: {
        method: 'GET',
        path: '/stats',
        description: 'Check your API usage and rate limit status',
        url: `${baseUrl}/stats`
      },
      health: {
        method: 'GET',
        path: '/health',
        description: 'Health check endpoint',
        url: `${baseUrl}/health`
      },
      openapi: {
        method: 'GET',
        path: '/openapi.json',
        description: 'Machine-readable OpenAPI specification',
        url: `${baseUrl}/openapi.json`
      }
    },
    examples: {
      curl: {
        listTemplates: `curl ${baseUrl}/templates`,
        generate: `curl -X POST ${baseUrl}/generate/npm-install`,
        checkUsage: `curl ${baseUrl}/stats`
      },
      javascript: `fetch('${baseUrl}/generate/npm-install', { method: 'POST' }).then(r => r.json())`,
      python: `requests.post('${baseUrl}/generate/npm-install').json()`
    },
    support: {
      docs: `${req.protocol}://${req.get('host')}/api-docs-memes.html`,
      dashboard: `${req.protocol}://${req.get('host')}/edutech-dashboard.html`,
      github: 'https://github.com/calos/agent-router'
    }
  });
});

/**
 * GET /api/public/memes/templates
 * List all available meme templates
 */
router.get('/templates', apiLimiter, (req, res) => {
  try {
    const generator = new DevRagebaitGenerator();
    const templates = generator.getTemplates();

    res.json({
      success: true,
      count: templates.length,
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        hashtags: t.hashtags,
        frameCount: t.frames?.length || 0
      }))
    });
  } catch (err) {
    console.error('[Public API] Error listing templates:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to load templates',
      message: err.message
    });
  }
});

/**
 * POST /api/public/memes/generate/:templateId
 * Generate a meme from a template
 *
 * Request body (optional):
 * {
 *   "format": "both" | "gif" | "mp4",  // default: "both"
 *   "quality": "high" | "medium" | "low"  // default: "medium"
 * }
 */
router.post('/generate/:templateId', apiLimiter, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { format = 'both', quality = 'medium' } = req.body;

    const generator = new DevRagebaitGenerator();

    // Validate template exists
    const templates = generator.getTemplates();
    const template = templates.find(t => t.id === templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        templateId,
        availableTemplates: templates.map(t => t.id)
      });
    }

    // Generate meme
    const result = await generator.generate(templateId, {
      gifPath: `/tmp/public-api-${Date.now()}.gif`,
      mp4Path: `/tmp/public-api-${Date.now()}.mp4`
    });

    // Build response based on requested format
    const response = {
      success: true,
      template: {
        id: result.template.id,
        name: result.template.name,
        description: result.template.description
      },
      caption: result.caption,
      shareText: result.shareText,
      hashtags: result.hashtags,
      frames: result.gif.frames,
      generatedAt: new Date().toISOString()
    };

    if (format === 'gif' || format === 'both') {
      response.gif = {
        dataUrl: result.gif.dataUrl,
        sizeMB: result.gif.sizeMB,
        path: result.gif.path
      };
    }

    if (format === 'mp4' || format === 'both') {
      response.mp4 = {
        dataUrl: result.mp4.dataUrl,
        sizeMB: result.mp4.sizeMB,
        path: result.mp4.path
      };
    }

    res.json(response);

  } catch (err) {
    console.error('[Public API] Error generating meme:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to generate meme',
      message: err.message
    });
  }
});

/**
 * GET /api/public/memes/stats
 * Get API usage statistics
 */
router.get('/stats', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const key = `public-api:${ip}`;
  const entry = publicApiLimits.get(key);
  const now = Date.now();

  if (!entry || now > entry.resetAt) {
    return res.json({
      success: true,
      usage: {
        used: 0,
        limit: 100,
        remaining: 100,
        resetAt: new Date(now + 24 * 60 * 60 * 1000).toISOString()
      }
    });
  }

  res.json({
    success: true,
    usage: {
      used: entry.count,
      limit: 100,
      remaining: Math.max(0, 100 - entry.count),
      resetAt: new Date(entry.resetAt).toISOString(),
      resetIn: Math.ceil((entry.resetAt - now) / 1000)
    }
  });
});

/**
 * GET /api/public/memes/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: {
      templates: '/api/public/memes/templates',
      generate: '/api/public/memes/generate/:templateId',
      stats: '/api/public/memes/stats'
    }
  });
});

/**
 * GET /api/public/memes/openapi.json
 * Machine-readable OpenAPI specification
 */
router.get('/openapi.json', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  res.json({
    openapi: '3.0.3',
    info: {
      title: 'CALOS Meme Generator API',
      version: '1.0.0',
      description: 'Free API for generating viral dev memes in GIF and MP4 formats. No authentication required, rate limited to 100 requests per day per IP.',
      contact: {
        name: 'CALOS Development',
        url: 'https://github.com/calos/agent-router'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: `${baseUrl}/api/public/memes`,
        description: 'Meme Generator API'
      }
    ],
    tags: [
      {
        name: 'Templates',
        description: 'Browse available meme templates'
      },
      {
        name: 'Generation',
        description: 'Generate memes'
      },
      {
        name: 'Monitoring',
        description: 'API usage and health'
      }
    ],
    paths: {
      '/': {
        get: {
          summary: 'API Overview',
          description: 'Returns API overview with all available endpoints',
          tags: ['Monitoring'],
          responses: {
            '200': {
              description: 'API overview',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      name: { type: 'string' },
                      version: { type: 'string' },
                      endpoints: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/templates': {
        get: {
          summary: 'List Templates',
          description: 'Get list of all available meme templates',
          tags: ['Templates'],
          responses: {
            '200': {
              description: 'List of templates',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      count: { type: 'integer' },
                      templates: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            description: { type: 'string' },
                            category: { type: 'string' },
                            hashtags: { type: 'array', items: { type: 'string' } },
                            frameCount: { type: 'integer' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '429': {
              description: 'Rate limit exceeded'
            }
          }
        }
      },
      '/generate/{templateId}': {
        post: {
          summary: 'Generate Meme',
          description: 'Generate a meme from specified template. Returns base64 data URLs for instant preview.',
          tags: ['Generation'],
          parameters: [
            {
              name: 'templateId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Template ID (e.g., npm-install, works-locally)'
            }
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    format: {
                      type: 'string',
                      enum: ['both', 'gif', 'mp4'],
                      default: 'both',
                      description: 'Output format'
                    },
                    quality: {
                      type: 'string',
                      enum: ['high', 'medium', 'low'],
                      default: 'medium',
                      description: 'Output quality'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Meme generated successfully',
              headers: {
                'X-RateLimit-Limit': {
                  schema: { type: 'integer' },
                  description: 'Rate limit maximum (100)'
                },
                'X-RateLimit-Remaining': {
                  schema: { type: 'integer' },
                  description: 'Remaining requests'
                },
                'X-RateLimit-Reset': {
                  schema: { type: 'string' },
                  description: 'Reset timestamp (ISO 8601)'
                }
              },
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      template: { type: 'object' },
                      caption: { type: 'string' },
                      gif: {
                        type: 'object',
                        properties: {
                          dataUrl: { type: 'string' },
                          sizeMB: { type: 'string' }
                        }
                      },
                      mp4: {
                        type: 'object',
                        properties: {
                          dataUrl: { type: 'string' },
                          sizeMB: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'Template not found'
            },
            '429': {
              description: 'Rate limit exceeded'
            }
          }
        }
      },
      '/stats': {
        get: {
          summary: 'Usage Statistics',
          description: 'Check your API usage and rate limit status',
          tags: ['Monitoring'],
          responses: {
            '200': {
              description: 'Usage stats',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      usage: {
                        type: 'object',
                        properties: {
                          used: { type: 'integer' },
                          limit: { type: 'integer' },
                          remaining: { type: 'integer' },
                          resetAt: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/health': {
        get: {
          summary: 'Health Check',
          description: 'Verify API is operational',
          tags: ['Monitoring'],
          responses: {
            '200': {
              description: 'API is healthy'
            }
          }
        }
      }
    }
  });
});

module.exports = router;
