require('dotenv').config();

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL ERROR INTERCEPTOR - Initialize FIRST to capture all errors
// ═══════════════════════════════════════════════════════════════════════════
const CalErrorInterceptor = require('./lib/cal-error-interceptor');
const globalErrorInterceptor = new CalErrorInterceptor();

// Initialize and install handlers immediately
(async () => {
  await globalErrorInterceptor.init();
  globalErrorInterceptor.installHandlers();

  // Make globally available for API routes
  global.calErrorInterceptor = globalErrorInterceptor;
})().catch(err => {
  console.error('[FATAL] Failed to initialize error interceptor:', err);
});

// Suppress libvips duplicate class warning (express-iiif + sharp conflict)
process.env.SHARP_IGNORE_GLOBAL_LIBVIPS = '1';

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const cors = require('cors');
const { runAgent, checkOllamaAvailability, initDataSource } = require('./agents/agent-runner');
const RoutingEngine = require('./routing/routing-engine');
const AgentRegistry = require('./routing/agent-registry');
const GitHubActionHandler = require('./agents/github-action-handler');
const VoiceTranscriber = require('./agents/voice-transcriber');
const LearningLoop = require('./agents/learning-loop');
const PriceWorker = require('./lib/price-worker');
const Scheduler = require('./lib/scheduler');
const AutoMigrate = require('./scripts/auto-migrate');
const MultiLLMRouter = require('./lib/multi-llm-router');
const UnicodeManager = require('./lib/unicode-manager');
const AICostAnalytics = require('./lib/ai-cost-analytics');
const AICostAlerts = require('./lib/ai-cost-alerts');
const AIABTesting = require('./lib/ai-ab-testing');
const AIInstanceRegistry = require('./lib/ai-instance-registry');
const WorkspaceWebSocketHandler = require('./lib/workspace-websocket-handler');
const QRGenerator = require('./lib/qr-generator');
const WasmSecurity = require('./lib/wasm-security');
const MultiBrandOrchestrator = require('./lib/multi-brand-orchestrator');
const Bonjour = require('bonjour-service');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // Fix for Ollama proxy (Node 18 fetch is buggy)

// Parse command line arguments
const args = process.argv.slice(2);
const localMode = args.includes('--local') || !!process.env.DATABASE_URL; // Auto-enable for Railway/production
const dbType = process.env.DB_TYPE || 'postgres'; // 'postgres' or 'sqlite'

// Database connection (lazy initialization)
let db = null;

// Model Discovery Service (initialized after database)
let modelDiscovery = null;

// Multi-LLM Router for CalRiven AI Persona
let llmRouter = null;

// Unicode Manager for mathematical symbols and special characters
let unicodeManager = null;

// AI Cost Analytics & Monitoring
let aiCostAnalytics = null;
let aiCostAlerts = null;
let aiABTesting = null;
let aiInstanceRegistry = null;

// Workspace collaboration handler (initialized after database)
let workspaceHandler = null;

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize routing system
const agentRegistry = new AgentRegistry();
const router = new RoutingEngine(agentRegistry);

// Initialize learning system components
const voiceTranscriber = new VoiceTranscriber();
const learningLoop = new LearningLoop();

// Initialize multi-brand orchestrator for BillionDollarGame
const brandOrchestrator = new MultiBrandOrchestrator({
  userId: 'user-001',
  startDate: new Date('2025-01-15')
});

// Trust proxy for production deployments (Render, Railway, nginx, etc.)
// This allows Express to read X-Forwarded-* headers correctly
app.set('trust proxy', 1);

// WASM Security - CSP headers and WASM detection
const wasmSecurity = new WasmSecurity({
  verbose: process.env.WASM_SECURITY_VERBOSE === 'true',
  strictMode: process.env.WASM_STRICT_MODE === 'true',
  maxCompilationsPerMinute: parseInt(process.env.WASM_MAX_COMPILATIONS_PER_MINUTE) || 10
});

// Middleware
const corsGitHubPages = require('./middleware/cors-github-pages');
app.use(corsGitHubPages); // Enable GitHub Pages → localhost CORS

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));

// Security: CSP headers to prevent WASM attacks (skip for UI pages that need CDN)
app.use((req, res, next) => {
  // Allow builder, hub, and UI pages to use their own CSP meta tags for CDN scripts
  const skipCSP = ['/builder.html', '/hub.html', '/chat.html', '/oauth-upload.html', '/qr-mobile-login.html'].some(path => req.path.includes(path));
  if (skipCSP) return next();

  // Apply WASM CSP to API routes and other pages
  wasmSecurity.cspMiddleware({
    allowWasm: process.env.ALLOW_WASM === 'true',
    allowUnsafeEval: false,
    reportUri: '/api/csp-violation-report'
  })(req, res, next);
});

// Security: WASM upload scanning
app.use(wasmSecurity.uploadScanMiddleware({
  blockUntrusted: true
}));

// Security: WASM compilation rate limiting
app.use(wasmSecurity.rateLimitMiddleware());

app.use(bodyParser.json());

// Cal Integration: UX/Behavior Tracking
const UXBehaviorTracker = require('./middleware/ux-behavior-tracking');
const CalConversationLearner = require('./lib/cal-conversation-learner');

let uxTracker = null;
let globalConversationLearner = null;

/**
 * Get base URL for the current request
 * Handles production deployments with reverse proxies
 * @param {Request} req - Express request object
 * @returns {string} - Base URL (e.g., https://yourdomain.com or http://localhost:5001)
 */
function getBaseURL(req) {
  // Use environment variable if set (most reliable for production)
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }

  // Otherwise, detect from request headers (works with reverse proxies)
  const protocol = req.headers['x-forwarded-proto'] ||
                   (req.headers['x-forwarded-ssl'] === 'on' ? 'https' :
                   (req.secure ? 'https' : 'http'));

  const host = req.headers['x-forwarded-host'] ||
               req.headers['host'] ||
               `localhost:${PORT}`;

  return `${protocol}://${host}`;
}

/**
 * Get WebSocket URL for the current request
 * @param {Request} req - Express request object
 * @returns {string} - WebSocket URL (e.g., wss://yourdomain.com or ws://localhost:5001)
 */
function getWebSocketURL(req) {
  const baseURL = getBaseURL(req);
  return baseURL.replace(/^http/, 'ws');
}

// Helper function to check if API keys are configured
async function checkKeysConfigured() {
  try {
    // Check if Ollama is running (sufficient for local-only use)
    const ollamaAvailable = await checkOllamaAvailability();
    if (ollamaAvailable) {
      console.log('[Router] ✓ Ollama detected - allowing access');
      return true;
    }

    // Check .env keys first
    const requiredProviders = ['openai', 'anthropic'];
    for (const provider of requiredProviders) {
      const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
      if (envKey && envKey.length > 0) {
        return true;
      }
    }

    // If no env keys, check keyring/database
    if (keyring && db) {
      for (const provider of requiredProviders) {
        try {
          const key = await keyring.getCredential(provider, 'api_key', 'system');
          if (key) {
            return true;
          }
        } catch (err) {
          // Key not found, continue
        }
      }
    }
  } catch (error) {
    console.error('Error checking key configuration:', error);
  }

  return false;
}

// Homepage redirect (MUST come before static middleware)
app.get('/', async (req, res) => {
  // Allow bypass with ?skip=true or ?hub=true
  if (req.query.skip === 'true' || req.query.hub === 'true') {
    return res.redirect('/hub.html');
  }

  // Direct to builder interface (streamlined, mobile-optimized)
  res.redirect('/builder.html');
});

// Proxy Ollama API to avoid CORS issues (browser can't fetch localhost:11434 from localhost:5001)
app.get('/api/ollama/tags', async (req, res) => {
  try {
    // Use 127.0.0.1 instead of localhost to avoid IPv6 issues (Node tries ::1 first and fails)
    const response = await fetch('http://127.0.0.1:11434/api/tags');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[Ollama Proxy] Error:', error.message);
    res.status(503).json({ error: 'Ollama offline', details: error.message });
  }
});

// Chat with Ollama models (simple query endpoint)
app.post('/api/ollama/chat', async (req, res) => {
  try {
    const { model, prompt, stream = false } = req.body;

    if (!model || !prompt) {
      return res.status(400).json({ error: 'Missing required fields: model, prompt' });
    }

    console.log(`[Ollama Chat] Model: ${model}, Prompt: "${prompt.substring(0, 50)}..."`);

    // Call Ollama generate API
    const response = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false // Always return complete response for simplicity
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();

    res.json({
      success: true,
      model,
      prompt,
      response: data.response,
      context: data.context,
      eval_count: data.eval_count,
      eval_duration: data.eval_duration
    });

  } catch (error) {
    console.error('[Ollama Chat] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to query Ollama',
      details: error.message
    });
  }
});

// Web Search endpoint (get current 2025 data)
app.get('/api/search', async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Missing required parameter: q' });
    }

    console.log(`[Web Search] Query: "${q}"`);

    // WebSearchAdapter is initialized later when database is ready
    // For now, provide a simple DuckDuckGo search
    const axios = require('axios');
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q,
        format: 'json',
        no_html: 1,
        skip_disambig: 1
      },
      timeout: 10000
    });

    const data = response.data;
    const results = [];

    // Abstract (main answer)
    if (data.Abstract) {
      results.push({
        title: data.Heading || q,
        snippet: data.Abstract,
        url: data.AbstractURL,
        source: data.AbstractSource || 'DuckDuckGo',
        type: 'abstract'
      });
    }

    // Related topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, limit - 1)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.FirstURL.split('/').pop().replace(/_/g, ' '),
            snippet: topic.Text,
            url: topic.FirstURL,
            source: 'DuckDuckGo',
            type: 'related'
          });
        }
      }
    }

    res.json({
      success: true,
      query: q,
      count: results.length,
      results,
      timestamp: new Date().toISOString(),
      year: new Date().getFullYear() // Should show 2025!
    });

  } catch (error) {
    console.error('[Web Search] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Search failed',
      details: error.message
    });
  }
});

// Unified API Gateway - Multi-domain, multi-model routing
const UnifiedAPIGateway = require('./lib/unified-api-gateway');
const unified = new UnifiedAPIGateway({
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  encryptionKey: process.env.ENCRYPTION_KEY
});

app.post('/api/unified/chat', async (req, res) => {
  try {
    const result = await unified.chat(req.body);
    res.json(result);
  } catch (error) {
    console.error('[Unified API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Serve static files (web interface)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/schemas', express.static(path.join(__dirname, 'schemas')));
app.use('/oauth-exports', express.static(path.join(__dirname, 'oauth-exports')));

// Serve Soulfra GitHub content
app.use('/soulfra', express.static(path.join(__dirname, 'projects', 'soulfra.github.io')));
console.log('[Router] Soulfra GitHub content available at /soulfra/');

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-DOMAIN ROUTING: Brand-Specific Folders
// ═══════════════════════════════════════════════════════════════════════════
// Route all 12 domains to their brand-specific folders
const BRAND_DOMAIN_MAP = {
  'soulfra.com': 'soulfra',
  'www.soulfra.com': 'soulfra',
  'calriven.com': 'calriven',
  'www.calriven.com': 'calriven',
  'deathtodata.com': 'deathtodata',
  'www.deathtodata.com': 'deathtodata',
  'finishthisidea.com': 'finishthisidea',
  'www.finishthisidea.com': 'finishthisidea',
  'finishthisrepo.com': 'finishthisrepo',
  'www.finishthisrepo.com': 'finishthisrepo',
  'ipomyagent.com': 'ipomyagent',
  'www.ipomyagent.com': 'ipomyagent',
  'hollowtown.com': 'hollowtown',
  'www.hollowtown.com': 'hollowtown',
  'coldstartkit.com': 'coldstartkit',
  'www.coldstartkit.com': 'coldstartkit',
  'brandaidkit.com': 'brandaidkit',
  'www.brandaidkit.com': 'brandaidkit',
  'dealordelete.com': 'dealordelete',
  'www.dealordelete.com': 'dealordelete',
  'saveorsink.com': 'saveorsink',
  'www.saveorsink.com': 'saveorsink',
  'cringeproof.com': 'cringeproof',
  'www.cringeproof.com': 'cringeproof'
};

// Hostname-based brand routing middleware
app.use((req, res, next) => {
  const hostname = req.hostname || req.headers.host?.split(':')[0] || 'localhost';
  const brandFolder = BRAND_DOMAIN_MAP[hostname];

  // If this is a known brand domain, serve from its brand folder
  if (brandFolder) {
    const brandPath = path.join(__dirname, 'public', 'brands', brandFolder);

    // Try to serve from brand-specific folder first
    express.static(brandPath)(req, res, (err) => {
      if (err) {
        // If file not found in brand folder, fall through to shared or public
        next();
      }
    });
  } else {
    // Not a brand domain, continue to default routing
    next();
  }
});

console.log('[Router] Multi-domain routing enabled for 12 brands');

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-DISCOVERY: Clean URL Routing for All HTML Files
// ═══════════════════════════════════════════════════════════════════════════
// Automatically route all HTML files without .html extension
// Example: soulfra-os.html → /soulfra-os AND /soulfra-os.html both work
// New files are auto-discovered on server restart
const publicDir = path.join(__dirname, 'public');
const htmlFiles = fs.readdirSync(publicDir)
  .filter(f => f.endsWith('.html'))
  .map(f => f.replace('.html', ''));

app.use((req, res, next) => {
  const cleanPath = req.path.replace(/^\//, '').replace(/\/$/, '');

  // Skip API routes and files with extensions
  if (cleanPath.startsWith('api/') || cleanPath.includes('.')) {
    return next();
  }

  // Check if clean path matches an HTML file
  if (htmlFiles.includes(cleanPath)) {
    return res.sendFile(path.join(publicDir, cleanPath + '.html'));
  }

  next();
});

// IIIF Image Server
const iiif = require('express-iiif').default;
app.use('/iiif', iiif({
  imageDir: path.join(__dirname, 'storage/images'),
  version: 3,
  cache: {
    enabled: true,
    dir: path.join(__dirname, 'storage/cache')
  }
}));

// IIIF API Routes
const iiifRoutes = require('./routes/iiif-routes');
app.use('/api/iiif', iiifRoutes);

// Web Scraper Routes
const scraperRoutes = require('./routes/scraper-routes');
app.use('/api', scraperRoutes);

// Gmail Webhook Routes (Zero Cost)
const gmailWebhookRoutes = require('./routes/gmail-webhook-zero-cost-routes');
app.use('/api/gmail/webhook', gmailWebhookRoutes);

// Edutech Report Routes (Live Dashboard)
const edutechRoutes = require('./routes/edutech-report-routes');
app.use('/api/edutech', edutechRoutes);

// Public Meme API Routes (Free API with rate limiting)
const publicMemeRoutes = require('./routes/public-meme-api-routes');
app.use('/api/public/memes', publicMemeRoutes);

// CAL Knowledge API Routes (Public knowledge browser for migrations, skills, failures, docs)
const calKnowledgeRoutes = require('./routes/cal-knowledge-routes');
app.use('/api/cal-knowledge', calKnowledgeRoutes);

// Data Tools API Routes (Universal table scraping, CSV export, chart generation)
const dataToolsRoutes = require('./routes/data-tools-routes');
app.use('/api/data-tools', dataToolsRoutes);

// Embed Routes (Osano-like embeddable scripts for any website)
const embedRoutes = require('./routes/embed-routes');
app.use('/', embedRoutes);

// Portfolio Routes (Unified analytics hub: AI chats, git, embed, authorship, rewards)
const portfolioRoutes = require('./routes/portfolio-routes');
app.use('/', portfolioRoutes);

// File Explorer Routes (Desktop scanner & git analyzer)
const fileExplorerRoutes = require('./routes/file-explorer-routes');
app.use('/api/explorer', fileExplorerRoutes);

// Brand Presentation Routes (Pitch decks, brand guidelines, presentations)
const brandPresentationRoutes = require('./routes/brand-presentation-routes');
app.use('/api/brand-presentation', brandPresentationRoutes);

// Alpha Discovery Routes (Track doc views, find investment alpha)
const alphaDiscoveryRoutes = require('./routes/alpha-discovery-routes');
app.use('/api/alpha', alphaDiscoveryRoutes);

// Subdomain Registry Routes (is-a.dev style subdomain registration)
const subdomainRegistryRoutes = require('./routes/subdomain-registry-routes');
app.use('/api/subdomains', subdomainRegistryRoutes);

// CringeProof Routes (Emoji vibe checking, card games, social awareness)
const createCringeProofRoutes = require('./routes/cringeproof-routes');
let cringeProofRoutes = null; // Will be initialized after Ollama check

// Social OAuth Routes (Twitter/X, GitHub, Discord, LinkedIn login)
const socialAuthRoutes = require('./routes/social-auth-routes');
app.use('/auth', socialAuthRoutes);

// QR Login Routes (Hybrid frontend/backend QR authentication with Google Sheets)
const qrLoginRoutes = require('./routes/qr-login-routes');
app.use('/api/v1/qr-login', qrLoginRoutes);

// Simple Builder API (No database required - works in API mode)
const builderRouter = express.Router();

// Store build state globally (in production, use Redis or DB)
// sessionId => { model, tasks, generatedFiles: [{ filename, code, task }] }
const buildSessions = new Map();

// POST /api/builder/start - Start a new build
builderRouter.post('/start', async (req, res) => {
  try {
    const { model = 'llama3.2:3b' } = req.body;
    const sessionId = Date.now().toString();

    // Return a simple task list for the AI to implement
    const tasks = [
      { id: 1, description: 'Initialize project structure', status: 'pending', type: 'setup' },
      { id: 2, description: 'Create package.json with dependencies', status: 'pending', type: 'config' },
      { id: 3, description: 'Set up Express server', status: 'pending', type: 'backend' },
      { id: 4, description: 'Create database schema', status: 'pending', type: 'database' },
      { id: 5, description: 'Implement API endpoints', status: 'pending', type: 'backend' },
      { id: 6, description: 'Add authentication middleware', status: 'pending', type: 'security' },
      { id: 7, description: 'Create frontend components', status: 'pending', type: 'frontend' },
      { id: 8, description: 'Set up WebSocket connections', status: 'pending', type: 'realtime' },
      { id: 9, description: 'Write unit tests', status: 'pending', type: 'testing' },
      { id: 10, description: 'Add error handling', status: 'pending', type: 'quality' },
      { id: 11, description: 'Create documentation', status: 'pending', type: 'docs' },
      { id: 12, description: 'Deploy to production', status: 'pending', type: 'deployment' }
    ];

    buildSessions.set(sessionId, {
      model,
      tasks,
      generatedFiles: [],  // Store all generated code here
      createdAt: new Date().toISOString()
    });

    res.json({
      status: 'ok',
      sessionId,
      model,
      tasks,
      message: 'Build tasks generated successfully'
    });
  } catch (error) {
    console.error('[Builder API] Start error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/builder/implement/:taskId - Implement a specific task with REAL Ollama
builderRouter.post('/implement/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { sessionId } = req.body;

    // Get the session (default to latest if not provided)
    let session = sessionId ? buildSessions.get(sessionId) : Array.from(buildSessions.values()).pop();
    if (!session) {
      return res.status(404).json({ error: 'No active build session found' });
    }

    const task = session.tasks[parseInt(taskId)];
    if (!task) {
      return res.status(404).json({ error: `Task ${taskId} not found` });
    }

    console.log(`[Builder] Calling Ollama to implement: ${task.description}`);

    // REAL Ollama API call
    const ollamaResponse = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: session.model,
        prompt: `You are a code generator. Generate code for this task: ${task.description}\n\nProvide a concise implementation with comments.`,
        stream: false
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama API error: ${ollamaResponse.statusText}`);
    }

    const ollamaData = await ollamaResponse.json();
    const generatedCode = ollamaData.response || 'No code generated';

    // Store FULL code in session
    const filename = `${task.type}-${taskId}.js`;
    session.generatedFiles.push({
      filename,
      code: generatedCode,  // FULL code, not truncated
      task: task.description,
      timestamp: new Date().toISOString()
    });

    const result = {
      taskId: parseInt(taskId),
      status: 'completed',
      files: [filename],
      code: generatedCode.substring(0, 500), // Preview only (for display)
      fullCodeLength: generatedCode.length,
      summary: `Generated ${task.type} implementation`,
      timestamp: new Date().toISOString()
    };

    console.log(`[Builder] ✓ Task ${taskId} completed with real Ollama output (${generatedCode.length} chars)`);

    res.json({
      status: 'ok',
      result
    });
  } catch (error) {
    console.error('[Builder API] Implement error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/builder/export/:sessionId - Export project as downloadable file
builderRouter.get('/export/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { format = 'txt' } = req.query; // Support: txt, json

    const session = buildSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session.generatedFiles || session.generatedFiles.length === 0) {
      return res.status(400).json({ error: 'No files generated yet' });
    }

    console.log(`[Builder] Exporting session ${sessionId} as ${format}`);

    // Load export service
    const BuilderExportService = require('./lib/builder-export-service');
    const exporter = new BuilderExportService();

    // Get user preferences from query params or defaults
    const preferences = {
      projectName: req.query.projectName || `project-${sessionId}`,
      branding: {
        domain: req.query.domain || req.hostname || 'calos.com',
        colors: req.query.colors ? req.query.colors.split(',') : ['#667eea']
      },
      fileType: req.query.fileType || 'js',
      author: req.query.author || 'CALOS User'
    };

    if (format === 'json') {
      // Export as JSON structure
      const exportData = {
        sessionId,
        createdAt: session.createdAt,
        exportedAt: new Date().toISOString(),
        model: session.model,
        files: session.generatedFiles,
        preferences
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="project-${sessionId}.json"`);
      res.json(exportData);
    } else {
      // Export as text file (default)
      const fileBuffer = await exporter.exportAsTarball(sessionId, session, preferences);

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="project-${sessionId}.txt"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    }

    console.log(`[Builder] ✓ Exported ${session.generatedFiles.length} files`);
  } catch (error) {
    console.error('[Builder API] Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/builder/session/:sessionId - Get session details
builderRouter.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = buildSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      status: 'ok',
      session: {
        sessionId,
        model: session.model,
        createdAt: session.createdAt,
        taskCount: session.tasks.length,
        completedTasks: session.tasks.filter(t => t.status === 'completed').length,
        generatedFiles: session.generatedFiles.length,
        files: session.generatedFiles.map(f => ({
          filename: f.filename,
          task: f.task,
          size: f.code.length,
          timestamp: f.timestamp
        }))
      }
    });
  } catch (error) {
    console.error('[Builder API] Session error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use('/api/builder', builderRouter);
console.log('✓ Simple Builder API initialized (no database required)');

// Profile Swiper Routes
const { router: swiperRouter, initRoutes: initSwiperRoutes } = require('./routes/swiper-routes');
let swiperRoutes = null; // Will be initialized after DB connection

// Developer Portal Routes
const { router: developerRouter, initRoutes: initDeveloperRoutes } = require('./routes/developer-routes');
let developerRoutes = null; // Will be initialized after DB connection

// Onboarding Routes
const { initRoutes: initOnboardingRoutes } = require('./routes/onboarding-routes');
let onboardingRoutes = null; // Will be initialized after DB connection

// Domain Voting Routes
const { initRoutes: initDomainVotingRoutes } = require('./routes/domain-voting-routes');
let domainVotingRoutes = null; // Will be initialized after DB connection

// ELO Rating Routes
const { router: eloRouter, initRoutes: initEloRoutes } = require('./routes/elo-routes');
let eloRoutes = null; // Will be initialized after DB connection

// Lofi Streaming Routes
const initLofiRoutes = require('./routes/lofi-routes');
let lofiRoutes = null; // Will be initialized after DB connection

// Mobile Routes (McDonald's Drive-Thru)
const initMobileRoutes = require('./routes/mobile-routes');
let mobileRoutes = null; // Will be initialized after DB connection

// Session Tracker (for visit duration tracking)
const SessionTracker = require('./lib/session-tracker');
let sessionTracker = null; // Will be initialized after DB connection

// Auth Routes (SSO)
const { router: authRouter, initRoutes: initAuthRoutes } = require('./routes/auth-routes');
const { initMiddleware: initSSOMiddleware } = require('./middleware/sso-auth');
let authRoutes = null; // Will be initialized after DB connection

// OAuth Routes (Consumer - Sign in WITH Google/GitHub/etc)
const { router: oauthRouter, initRoutes: initOAuthRoutes } = require('./routes/oauth-routes');
let oauthRoutes = null; // Will be initialized after DB connection

// OAuth Provider Routes (Provider - Sign in WITH CalOS)
const { router: oauthProviderRouter, initRoutes: initOAuthProviderRoutes } = require('./routes/oauth-provider-routes');
let oauthProviderRoutes = null; // Will be initialized after DB connection

// Passkey/WebAuthn Routes (Biometric authentication)
const initPasskeyRoutes = require('./routes/passkey-routes');
let passkeyRoutes = null; // Will be initialized after DB connection

// Documentation Snapshot Routes (OAuth setup tutorials with screenshots/GIFs)
const initDocsRoutes = require('./routes/docs-routes');
let docsSnapshotRoutes = null; // Will be initialized after DB connection

// OAuth Screenshot Upload Routes (Upload screenshots to generate OAuth docs)
const oauthUploadRoutes = require('./routes/oauth-upload-routes');

// Workspace Collaboration Routes (Real-time collaborative workspace)
const initWorkspaceRoutes = require('./routes/workspace-routes');
let workspaceRoutes = null; // Will be initialized after workspace handler

// Skills Routes
const skillsEngine = require('./lib/skills-engine');
// Skills routes don't exist yet - they're part of calculator routes

// Calculator Routes
const { router: calculatorRouter, initRoutes: initCalculatorRoutes } = require('./routes/calculator-routes');
let calculatorRoutes = null; // Will be initialized after DB connection

// Actions Routes
const { router: actionsRouter, initRoutes: initActionsRoutes } = require('./routes/actions-routes');
let actionsRoutes = null; // Will be initialized after DB connection

// Model Council Routes (Multi-model collaborative building)
const { router: councilRouter, initRoutes: initCouncilRoutes } = require('./routes/model-council-routes');
let councilRoutes = null; // Will be initialized after DB connection

// Autonomous Mode Routes (Copilot mode - describe what you want, system builds it)
const { router: autonomousRouter, initRoutes: initAutonomousRoutes } = require('./routes/autonomous-routes');
let autonomousRoutes = null; // Will be initialized after DB connection

// Session Block Routes (Blockchain-inspired session management with priority queuing)
const { router: sessionBlockRouter, initRoutes: initSessionBlockRoutes } = require('./routes/session-block-routes');
const SessionOrchestrator = require('./lib/session-orchestrator');
let sessionBlockRoutes = null; // Will be initialized after DB connection
let sessionOrchestrator = null; // Will be initialized after DB connection

// Diagnostic Routes (Model routing and system health testing)
const { router: diagnosticRouter, initRoutes: initDiagnosticRoutes } = require('./routes/diagnostic-routes');
let diagnosticRoutes = null; // Will be initialized after DB connection

// Unicode Routes (Mathematical symbols and character lookup)
const { initRoutes: initUnicodeRoutes } = require('./routes/unicode-routes');
let unicodeRoutes = null; // Will be initialized after UnicodeManager

// Multi-Model Routes (Query all models simultaneously)
const { initRoutes: initMultiModelRoutes } = require('./routes/multi-model-routes');
let multiModelRoutes = null; // Will be initialized after MultiLLMRouter

// AI Analytics Routes (Cost monitoring, alerts, A/B testing)
const aiAnalyticsRoutes = require('./routes/ai-analytics-routes');
let analyticsRoutes = null; // Will be initialized after AI components

// Agency Routes (Fractional Executive Agency system)
const { router: agencyRouter, initializeAgencyRoutes } = require('./routes/agency-routes');
const FractionalExecutiveAgency = require('./lib/fractional-executive-agency');
const AgencyActivityFeed = require('./lib/agency-activity-feed');
let fractionalAgency = null; // Will be initialized after DB connection
let agencyActivityFeed = null; // Will be initialized after DB connection

// Model Registry Routes (Ollama proxy and model discovery)
const { router: modelRegistryRouter, initializeModelRoutes } = require('./routes/model-registry-routes');
let modelRegistryRoutes = null; // Will be initialized after model discovery

// CALOS Pricing & License System Routes
const pricingRoutes = require('./routes/pricing-routes');
const licenseRoutes = require('./routes/license-routes');
const enterpriseRoutes = require('./routes/enterprise-routes');
const LicenseVerifier = require('./lib/license-verifier');
const { usageTrackingMiddleware } = require('./lib/middleware/usage-tracking-middleware');
const { telemetryMiddleware } = require('./lib/telemetry/telemetry-middleware');
const { brandingMiddleware } = require('./lib/middleware/branding-middleware');
let licenseVerifier = null; // Will be initialized after DB connection

// Context Haiku Compression (context → haiku → back out)
const ContextHaikuCompressor = require('./lib/context-haiku');
let contextHaiku = null; // Will be initialized after DB connection

// Ollama Routes (Ollama model management and chat)
const ollamaRoutes = require('./routes/ollama-routes');

// Unified Chat Routes (Multi-LLM: DeepSeek, Anthropic, OpenAI, Ollama)
const unifiedChatRoutes = require('./routes/unified-chat-routes');

// Job Analysis Routes (Job scraping, analysis, lesson plan generation)
const jobAnalysisRoutes = require('./routes/job-analysis-routes');

// Matching Routes (Family exclusion/inclusion system)
const { initializeRoutes: initMatchingRoutes } = require('./routes/matching-routes');
const RelationshipRouter = require('./lib/relationship-router');
let matchingRoutes = null; // Will be initialized after DB connection

// Public Data Routes (ipconfig.io style data collection)
const { initializeRoutes: initPublicDataRoutes } = require('./routes/public-data-routes');
let publicDataRoutes = null; // Will be initialized after DB connection

// Knowledge Learning Routes (Cal's debugging pattern learning)
const { initializeRoutes: initKnowledgeLearningRoutes } = require('./routes/knowledge-learning-routes');
const createLearningRoutes = require('./routes/learning-routes');
const LearningEngine = require('./lib/learning-engine');
const CalLearningLoop = require('./lib/cal-learning-loop');
const { createCalRoutes } = require('./routes/cal-routes');
const UnifiedKnowledgeInterface = require('./lib/unified-knowledge-interface');

// Cal's Meta-Learning System
const GuardianAgent = require('./agents/guardian-agent');
const ForumMonitor = require('./agents/forum-monitor');
const AgentMesh = require('./lib/agent-mesh');
const CalStudentLauncher = require('./lib/cal-student-launcher');
const CalMetaOrchestrator = require('./lib/cal-meta-orchestrator');
const SkillsEngine = require('./lib/skills-engine');
const KnowledgeEnricher = require('./middleware/knowledge-enricher');
const PatternLearner = require('./lib/pattern-learner');
const KnowledgeStore = require('./lib/knowledge-store');
const PatternMatcher = require('./lib/pattern-matcher');
let knowledgeLearningRoutes = null; // Will be initialized after DB connection
let unifiedKnowledge = null; // Unified knowledge interface
let knowledgeEnricher = null; // Knowledge enrichment middleware
let patternLearner = null; // Pattern learner (SQLite)

// Admin Routes (God Mode - Platform management)
const { router: adminRouter, initRoutes: initAdminRoutes } = require('./routes/admin-routes');
let adminRoutes = null; // Will be initialized after DB connection

// Bucket System Routes (12-bucket integration with reasoning logs)
const { router: bucketRouter, initRoutes: initBucketRoutes } = require('./routes/bucket-routes');
const BucketOrchestrator = require('./lib/bucket-orchestrator');
const BucketMapReduce = require('./lib/bucket-map-reduce');
const UsageTracker = require('./lib/usage-tracker');
let bucketRoutes = null; // Will be initialized after DB connection
let bucketOrchestrator = null; // Will be initialized after DB connection

// XRef System Routes (Cross-reference tracking - "xrefs hotkey: x")
const { router: xrefRouter, initRoutes: initXrefRoutes } = require('./routes/xref-routes');
let xrefRoutes = null; // Will be initialized after DB connection
let usageTracker = null; // Will be initialized after DB connection

// A/B Testing & Gamification Systems (New integrated systems)
const DevicePairingManager = require('./lib/device-pairing');
const TrainingTasksManager = require('./lib/training-tasks');
const AccountWarmer = require('./lib/account-warmer');
const ExperimentManager = require('./lib/experiment-manager');
const UserProfileDetector = require('./lib/user-profile-detector');
const ModelVersionManager = require('./lib/model-version-manager');
const ModelWrappers = require('./lib/model-wrappers');
const ModelDiscoveryService = require('./lib/model-discovery-service');
const GeoResolver = require('./lib/geo-resolver');
const IdentityResolver = require('./lib/identity-resolver');
const DomainContextEnricher = require('./lib/domain-context-enricher');
const ResponseFilter = require('./lib/response-filter');
const AgentActivityLogger = require('./lib/agent-activity-logger');

// Credits & Twilio System (Prepaid credits, phone verification, SMS/calls)
const { initializeRoutes: initCreditsRoutes } = require('./routes/credits-routes');
const { initRoutes: initTwilioRoutes } = require('./routes/twilio-routes');
let creditsRoutes = null; // Will be initialized after DB connection
let twilioRoutes = null; // Will be initialized after DB connection
let stripe = null; // Stripe client for credit purchases
let twilioClient = null; // Twilio client for SMS/calls

// Usage Tracking & Cost Guard (Tier quotas, daily limits, cost monitoring)
const CostGuard = require('./middleware/cost-guard');
const { initializeRoutes: initUsageRoutes } = require('./routes/usage-routes');
let costGuard = null; // Will be initialized after DB connection
let usageRoutes = null; // Will be initialized after DB connection

// Recruiting Routes (Resume upload, talent ranking, OSS program identification)
const { initializeRoutes: initRecruitingRoutes } = require('./routes/recruiting-routes');
let recruitingRoutes = null; // Will be initialized after DB connection

// Documentation Registry System (Version-aware documentation fetching)
// TEMPORARILY DISABLED - export mismatch
// const DocumentationRegistry = require('./lib/documentation-registry');
// const { initRoutes: initDocumentationRoutes } = require('./routes/documentation-routes');
// let documentationRegistry = null; // Will be initialized after DB connection
// let documentationRoutes = null; // Will be initialized after DB connection

// Tenant API Keys & Subscription Management (Two-layer API key system)
const { initRoutes: initTenantApiKeyRoutes } = require('./routes/tenant-api-key-routes');
const { initRoutes: initBYOKRoutes } = require('./routes/byok-routes');
const { initRoutes: initSubscriptionRoutes } = require('./routes/subscription-routes');
const { initRoutes: initSchemaDashboardRoutes } = require('./routes/schema-dashboard-routes');
const { initRoutes: initKnowledgeGraphRoutes } = require('./routes/knowledge-graph-routes');
const { initRoutes: initVoiceProjectRoutes } = require('./routes/voice-project-routes');
const { initRoutes: initTriangleRoutes } = require('./routes/triangle-routes');
const { initRoutes: initDatabaseQueryRoutes } = require('./routes/database-query-routes');
const { initRoutes: initCampaignRoutes } = require('./routes/campaign-routes');
const CampaignManager = require('./lib/campaign-manager');
const Keyring = require('./lib/keyring');
const VaultBridge = require('./lib/vault-bridge');
const TierGate = require('./middleware/tier-gate');
const ModelClarityEngine = require('./lib/model-clarity-engine');
const MultiProviderRouter = require('./lib/multi-provider-router');
const TriangleConsensusEngine = require('./lib/triangle-consensus-engine');
let tenantApiKeyRoutes = null; // Will be initialized after DB connection
let byokRoutes = null; // Will be initialized after DB connection
let billingRoutes = null; // Will be initialized after DB connection
let adminAnalyticsRoutes = null; // Will be initialized after DB connection
let usageTrackingRoutes = null; // Will be initialized after DB connection
let subscriptionRoutes = null; // Will be initialized after DB connection
let schemaDashboardRoutes = null; // Will be initialized after DB connection
let knowledgeGraphRoutes = null; // Will be initialized after DB connection
let voiceProjectRoutes = null; // Will be initialized after DB connection
let triangleRoutes = null; // Will be initialized after DB connection
let databaseQueryRoutes = null; // Will be initialized after DB + Triangle connection
let campaignManager = null; // Campaign manager for Ad Gateway
let campaignRoutes = null; // Will be initialized after DB connection
let multiProviderRouter = null; // Multi-provider router for OpenAI/Anthropic/DeepSeek
let triangleEngine = null; // Triangle consensus engine
let keyring = null; // Keyring for BYOK encryption
let vaultBridge = null; // VaultBridge for contextual API key retrieval
let tierGate = null; // TierGate for tier-based usage enforcement
let modelClarityEngine = null; // ModelClarityEngine for real-time pricing & model selection

// Multi-Service Routing System (Git, Copilot, Gaming, OCR)
const { FormatRouter } = require('./middleware/format-router');
const GitAdapter = require('./lib/service-adapters/git-adapter');
const CopilotAdapter = require('./lib/service-adapters/copilot-adapter');
const GamingAdapter = require('./lib/service-adapters/gaming-adapter');
const OCRAdapter = require('./lib/service-adapters/ocr-adapter');
const ReceiptParser = require('./lib/receipt-parser');
const createGitRoutes = require('./routes/git-routes');
const createCopilotRoutes = require('./routes/copilot-routes');
const createGamingRoutes = require('./routes/gaming-routes');
const createOCRRoutes = require('./routes/ocr-routes');
let formatRouter = null; // Format router middleware
let gitAdapter = null; // Git service adapter (port 11435)
let copilotAdapter = null; // Copilot service adapter (port 11437)
let gamingAdapter = null; // Gaming service adapter (port 11436)
let ocrAdapter = null; // OCR service adapter (port 11436)
let receiptParser = null; // Receipt parser (expense categorization)
let gitRoutes = null; // Git API routes
let copilotRoutes = null; // Copilot API routes
let gamingRoutes = null; // Gaming API routes
let ocrRoutes = null; // OCR API routes
let receiptRoutes = null; // Receipt API routes

// Visual Generation System (Mermaid, DOT, Tilemaps, Badges, Product Pages)
const FileOutputService = require('./lib/file-output-service');
const DialogueTreeGenerator = require('./lib/dialogue-tree-generator');
const VisualAssetRenderer = require('./lib/visual-asset-renderer');
const ProductCatalog = require('./lib/product-catalog');
const createVisualGenerationRoutes = require('./routes/visual-generation-routes');
let fileOutputService = null; // File output service for saving generated files
let visualGenerationRoutes = null; // Visual generation API routes

// Librarian Illusion System (Symbolic mappings across isolated services)
const TripleStore = require('./lib/triple-store');
const SymbolicRouter = require('./lib/symbolic-router');
const LibrarianFacade = require('./lib/librarian-facade');
const createLibrarianRoutes = require('./routes/librarian-routes');
let tripleStore = null; // RDF-style triple store for symbolic mappings
let symbolicRouter = null; // Resolves symbolic URIs to API calls
let librarianFacade = null; // Omniscient orchestration interface
let librarianRoutes = null; // Librarian API routes

// Web Search Adapter (Real-time data fetching like Perplexity)
const WebSearchAdapter = require('./lib/web-search-adapter');
let webSearchAdapter = null; // Fetches current information from the web

// Translation Adapter (Multi-language support with auto-detection)
const TranslationAdapter = require('./lib/translation-adapter');
const TranslationDBManager = require('./lib/translation-db-manager');
const createTranslationRoutes = require('./routes/translation-routes');
let translationAdapter = null; // Provides translation for 40+ languages
let translationDBManager = null; // Manages translation database cache
let translationRoutes = null; // Translation API routes

// API Key Activity Tracker (Fraud detection via usage pattern analysis)
const ApiKeyActivityTracker = require('./middleware/api-key-activity-tracker');
let apiKeyActivityTracker = null; // Tracks API key usage across services

// Voucher & Gift Card System
const { initRoutes: initVoucherRoutes } = require('./routes/voucher-routes');
let voucherRoutes = null; // Will be initialized after DB connection

// Auto-Provisioning System
const { initRoutes: initProvisionRoutes } = require('./routes/provision-routes');
let provisionRoutes = null; // Will be initialized after DB connection

// Payment Methods & ACH
const { initRoutes: initPaymentRoutes } = require('./routes/payment-routes');
let paymentRoutes = null; // Will be initialized after DB connection

// Affiliate Tracking System
const AffiliateTracker = require('./lib/affiliate-tracker');
const initAffiliateRoutes = require('./routes/affiliate-routes');
let affiliateTracker = null; // Will be initialized after DB connection
let affiliateRoutes = null; // Will be initialized after DB connection

// Handle Registry System (@username vanity handles like Discord/Twitter)
const HandleRegistry = require('./lib/handle-registry');
const { initializeRoutes: initHandleRoutes } = require('./routes/handle-routes');
let handleRegistry = null; // Will be initialized after DB connection
let handleRoutes = null; // Will be initialized after DB connection

// Path-Based Encryption System (Signal-style E2E with challenge chains)
const PathBasedEncryption = require('./lib/path-based-encryption');
const ChallengeChain = require('./lib/challenge-chain');
const { initRoutes: initSecureMessagingRoutes } = require('./routes/secure-messaging-routes');
let pathEncryption = null; // Will be initialized after DB connection
let challengeChain = null; // Will be initialized after DB connection
let secureMessagingRoutes = null; // Will be initialized after DB connection

// Feature Gate Manager (Unified access control for all features)
const FeatureGateManager = require('./lib/feature-gate-manager');
const { initRoutes: initFeatureAnalyticsRoutes } = require('./routes/feature-analytics-routes');
let featureGate = null; // Will be initialized after DB connection
let featureAnalyticsRoutes = null; // Will be initialized after DB connection

// Wrapped/Leaderboard System (READ from existing analytics)
const { initRoutes: initWrappedRoutes } = require('./routes/wrapped-routes');
const { initRoutes: initLeaderboardRoutes } = require('./routes/leaderboard-routes');
const { initRoutes: initMarketplaceRoutes } = require('./routes/marketplace-routes');
const { initRoutes: initActivityFeedRoutes } = require('./routes/activity-feed-routes');
const { initRoutes: initMetricsBundleRoutes } = require('./routes/metrics-bundle-routes');
const { initRoutes: initCurationRoutes } = require('./routes/curation-routes');
const { initRoutes: initForumRoutes } = require('./routes/forum-routes');
const initAuthorRoutes = require('./routes/author-routes');
const initIdentityRoutes = require('./routes/identity-routes');
const initFederationRoutes = require('./routes/federation-routes');
const initBuilderRoutes = require('./routes/builder-routes');
let wrappedRoutes = null; // Will be initialized after DB connection
let leaderboardRoutes = null; // Will be initialized after DB connection
let marketplaceRoutes = null; // Will be initialized after DB connection
let authorRoutes = null; // Will be initialized after DB connection
let identityRoutes = null; // Will be initialized after DB connection
let federationRoutes = null; // Will be initialized after DB connection
let builderRoutes = null; // Will be initialized after DB connection
let activityFeedRoutes = null; // Will be initialized after DB connection
let metricsBundleRoutes = null; // Will be initialized after DB connection
let curationRoutes = null; // Will be initialized after DB connection
let forumRoutes = null; // Will be initialized after DB connection

let devicePairing = null; // Will be initialized after DB connection
let trainingTasks = null; // Will be initialized after DB connection
let accountWarmer = null; // Will be initialized after DB connection
let experimentManager = null; // Will be initialized after DB connection
let userProfileDetector = null; // Will be initialized after DB connection
let modelVersionManager = null; // Will be initialized after DB connection
let modelWrappers = null; // Will be initialized after DB connection
let geoResolver = null; // Will be initialized after DB connection
let identityResolver = null; // Will be initialized after DB connection
let domainContextEnricher = null; // Will be initialized after DB connection
let agentActivityLogger = null; // Will be initialized after DB connection

// Unified Feed routes
app.get('/unified', (req, res) => {
  res.redirect('/unified-feed.html');
});

app.get('/feed', (req, res) => {
  res.redirect('/feed.html');
});

app.get('/feed/preview', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'feed-preview.html'));
});

// Auto-generated launcher page (/apps)
app.get('/apps', async (req, res) => {
  try {
    const publicDir = path.join(__dirname, 'public');
    const htmlFiles = fs.readdirSync(publicDir)
      .filter(f => f.endsWith('.html') && !f.startsWith('index'));

    const categorizeApp = (filename) => {
      const lower = filename.toLowerCase();
      if (lower.includes('dashboard') || lower.includes('admin') || lower.includes('enterprise')) return 'Dashboard';
      if (lower.includes('oauth') || lower.includes('login') || lower.includes('auth')) return 'Auth';
      if (lower.includes('chat') || lower.includes('builder') || lower.includes('hub')) return 'Tools';
      if (lower.includes('pricing') || lower.includes('calculator')) return 'Business';
      if (lower.includes('os') || lower.includes('vault')) return 'Platform';
      return 'Other';
    };

    const apps = htmlFiles.map(f => {
      const slug = f.replace('.html', '');
      const name = slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      return {
        name,
        slug,
        category: categorizeApp(f)
      };
    });

    const categories = [...new Set(apps.map(a => a.category))].sort();
    const appsByCategory = {};
    categories.forEach(cat => {
      appsByCategory[cat] = apps.filter(a => a.category === cat).sort((a, b) => a.name.localeCompare(b.name));
    });

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>All Apps | CALOS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 {
      font-size: 48px;
      font-weight: 800;
      margin-bottom: 16px;
      text-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .subtitle {
      font-size: 18px;
      opacity: 0.9;
      margin-bottom: 40px;
    }
    .category {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .category h2 {
      font-size: 24px;
      margin-bottom: 16px;
      opacity: 0.9;
    }
    .app-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .app-card {
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      padding: 16px;
      text-decoration: none;
      color: white;
      transition: all 0.2s;
      cursor: pointer;
    }
    .app-card:hover {
      background: rgba(255, 255, 255, 0.25);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    }
    .app-name {
      font-weight: 600;
      font-size: 16px;
    }
    .app-url {
      font-size: 12px;
      opacity: 0.7;
      margin-top: 4px;
      font-family: 'SF Mono', Monaco, monospace;
    }
    .stats {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 32px;
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
    }
    .stat {
      display: flex;
      flex-direction: column;
    }
    .stat-value {
      font-size: 32px;
      font-weight: 800;
    }
    .stat-label {
      font-size: 14px;
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 All CALOS Apps</h1>
    <p class="subtitle">Auto-discovered from public/ folder</p>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${apps.length}</div>
        <div class="stat-label">Total Apps</div>
      </div>
      <div class="stat">
        <div class="stat-value">${categories.length}</div>
        <div class="stat-label">Categories</div>
      </div>
    </div>

    ${categories.map(category => `
      <div class="category">
        <h2>${category} (${appsByCategory[category].length})</h2>
        <div class="app-grid">
          ${appsByCategory[category].map(app => `
            <a href="/${app.slug}" class="app-card">
              <div class="app-name">${app.name}</div>
              <div class="app-url">/${app.slug}</div>
            </a>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </div>
</body>
</html>`);
  } catch (error) {
    res.status(500).send(`<h1>Error loading apps</h1><pre>${error.message}</pre>`);
  }
});

// Note: /theater, /dashboard, /tools are automatically served by express.static
// from public/theater.html, public/dashboard.html, public/tools.html

// Ensure memory directory exists
const memoryDir = path.join(__dirname, '../memory');
if (!fs.existsSync(memoryDir)) {
  fs.mkdirSync(memoryDir, { recursive: true });
}

/**
 * Initialize database connection for --local mode
 */
async function initDatabase() {
  if (!localMode) {
    console.log('ℹ️  Running in API mode (use --local for database caching)');
    return null;
  }

  console.log(`🗄️  Initializing ${dbType} database for local mode...`);

  try {
    if (dbType === 'postgres') {
      const { Pool } = require('pg');

      // Use DATABASE_URL if available (Railway/production), otherwise use individual params (local)
      if (process.env.DATABASE_URL) {
        db = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: {
            rejectUnauthorized: false // Railway/production requires SSL
          }
        });
        console.log('✓ PostgreSQL connected (Production/Railway)');
      } else {
        db = new Pool({
          host: process.env.DB_HOST || 'localhost',
          port: process.env.DB_PORT || 5432,
          database: process.env.DB_NAME || 'calos',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || ''
        });
        console.log('✓ PostgreSQL connected (Local)');
      }

      // Test connection
      await db.query('SELECT NOW()');

      // Run auto-migrations (ensures database "JUST WORKS")
      console.log('🔄 Running auto-migrations...');
      const autoMigrate = new AutoMigrate({ quiet: true }); // Quiet mode hides optional feature errors
      try {
        const result = await autoMigrate.migrate();
        if (result.success) {
          console.log(`✓ Database migrations complete (${result.executed} executed${result.optionalFailed > 0 ? `, ${result.optionalFailed} optional skipped` : ''})`);
        } else {
          console.warn(`⚠ ${result.criticalFailed} CRITICAL migration failures`);
        }
      } catch (error) {
        console.error('⚠ Auto-migration error:', error.message);
        console.error('   Continuing with existing database state...');
      }

      // Verify new systems tables
      try {
        const tableCheck = await db.query(`
          SELECT COUNT(*) as count
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name IN ('users', 'user_sessions', 'skills', 'user_skills', 'action_definitions', 'effect_definitions')
        `);
        const tableCount = parseInt(tableCheck.rows[0].count);
        if (tableCount === 6) {
          console.log(`✓ New systems tables verified (${tableCount}/6)`);
        } else {
          console.log(`⚠ New systems tables incomplete (${tableCount}/6) - run migrations`);
        }
      } catch (error) {
        console.error('⚠ Could not verify new tables:', error.message);
      }

      // Initialize DataSource with database
      initDataSource(db);

      // Make database available to routes
      app.locals.db = db;

      // Initialize Cal's conversation learner and UX tracker
      globalConversationLearner = new CalConversationLearner({
        conversationLog: './data/cal-chat-log.json',
        taskHistory: './data/cal-task-history.json'
      });

      uxTracker = new UXBehaviorTracker({
        db,
        conversationLearner: globalConversationLearner,
        verbose: process.env.UX_TRACKING_VERBOSE === 'true'
      });

      // Initialize UX tracking database table
      await uxTracker.initializeDatabase();

      // Apply UX tracking middleware to all requests
      app.use(uxTracker.middleware());

      console.log('✓ Cal conversation learner initialized');
      console.log('✓ UX behavior tracking enabled');

      return db;

    } else if (dbType === 'sqlite') {
      const Database = require('better-sqlite3');
      const dbPath = process.env.DB_PATH || path.join(__dirname, '../memory/calos.db');

      db = new Database(dbPath);
      console.log(`✓ SQLite database: ${dbPath}`);

      // Wrap SQLite in async query interface for compatibility
      db.query = async (sql, params = []) => {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);
        return { rows };
      };

      // Initialize DataSource with database
      initDataSource(db);

      return db;

    } else {
      throw new Error(`Unsupported database type: ${dbType}`);
    }

  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    console.error('   Falling back to API mode without caching');
    return null;
  }
}

// Initialize database and check Ollama availability on startup
(async () => {
  // Initialize database if --local mode
  await initDatabase();

  // Initialize glossary routes (Interactive knowledge graph / wordmap)
  // NOTE: Glossary reads from filesystem, doesn't require database
  const glossaryRoutes = require('./routes/glossary-routes');
  app.use('/api/glossary', glossaryRoutes);
  console.log('✓ Interactive glossary / knowledge graph initialized');

  // Initialize routes with database connection
  if (db) {
    // Initialize CALOS License System (MUST come first - enforces licensing)
    try {
      licenseVerifier = new LicenseVerifier({ db });
      await licenseVerifier.initialize();

      // Attach license verifier to app locals (available in routes)
      app.locals.licenseVerifier = licenseVerifier;

      // Attach database to all requests (required by pricing/license middleware)
      app.use((req, res, next) => {
        req.db = db;
        req.licenseVerifier = licenseVerifier;
        next();
      });

      // Mount license, pricing, and enterprise routes
      app.use('/api/pricing', pricingRoutes);
      app.use('/api/license', licenseRoutes);
      app.use('/api/enterprise', enterpriseRoutes);

      // Add licensing middleware (checks license for each request)
      const { licenseMiddleware } = require('./lib/middleware/license-middleware');
      app.use(licenseMiddleware);

      // Add branding middleware (injects CALOS™ branding based on tier)
      app.use(brandingMiddleware);

      // Add telemetry middleware (tracks feature usage)
      app.use(telemetryMiddleware);

      // Add usage tracking middleware (meters billable usage)
      app.use(usageTrackingMiddleware);

      console.log('✓ CALOS™ Pricing & License System initialized');
      console.log('  - Pricing calculator API: /api/pricing/calculate');
      console.log('  - License verification: /api/license/verify');
      console.log('  - Enterprise dashboard: /api/enterprise/customers');
      console.log('  - Usage tracking: Enabled');
      console.log('  - Telemetry: Enabled');
    } catch (error) {
      console.error('⚠ License system initialization failed:', error.message);
      console.log('  Continuing without licensing enforcement...');
    }

    // Initialize swiper routes with API auth support
    swiperRoutes = initSwiperRoutes(db);
    app.use('/api/swiper', swiperRoutes);
    console.log('✓ Profile swiper system initialized');

    // Initialize developer portal routes
    developerRoutes = initDeveloperRoutes(db);
    app.use('/api/developers', developerRoutes);
    console.log('✓ Developer SDK system initialized');

    // Initialize onboarding routes
    onboardingRoutes = initOnboardingRoutes(db);
    app.use('/api/onboarding', onboardingRoutes);
    console.log('✓ Onboarding system initialized');

    // Initialize domain voting routes
    domainVotingRoutes = initDomainVotingRoutes(db);
    app.use('/api/domain-voting', domainVotingRoutes);
    console.log('✓ Domain voting system initialized');

    // Initialize ELO rating routes
    eloRoutes = initEloRoutes(db, broadcast);
    app.use('/api/elo', eloRoutes);
    console.log('✓ ELO rating system initialized');

    // Initialize session tracker
    sessionTracker = new SessionTracker(db);
    console.log('✓ Session tracker initialized');

    // Initialize knowledge systems (Cal's memory)
    patternLearner = new PatternLearner();
    unifiedKnowledge = new UnifiedKnowledgeInterface({
      db,
      patternLearner,
      knowledgeStore: new KnowledgeStore(db),
      patternMatcher: new PatternMatcher({ db })
    });
    knowledgeEnricher = new KnowledgeEnricher({
      knowledgeInterface: unifiedKnowledge,
      enabled: true
    });

    // Make knowledge systems globally available
    app.locals.unifiedKnowledge = unifiedKnowledge;
    app.locals.knowledgeEnricher = knowledgeEnricher;
    app.locals.patternLearner = patternLearner;

    console.log('✓ Unified knowledge system initialized (Cal can now remember patterns)');

    // Initialize lofi streaming routes
    lofiRoutes = initLofiRoutes(db, broadcast, sessionTracker);
    app.use('/api/lofi', lofiRoutes);
    console.log('✓ Lofi streaming system initialized');

    // Mobile routes initialized outside db block (Cal's graceful degradation)
    // See line ~1690 for mobile routes initialization

    // Initialize SSO middleware (provides createSession, requireAuth, etc)
    initSSOMiddleware(db);

    // Initialize auth routes (SSO)
    authRoutes = initAuthRoutes(db);
    app.use('/api/auth', authRoutes);
    console.log('✓ SSO authentication system initialized');

    // Initialize OAuth consumer routes (Sign in WITH Google/GitHub/etc)
    oauthRoutes = initOAuthRoutes(db);
    app.use('/api/auth/oauth', oauthRoutes);
    console.log('✓ OAuth consumer (Google/GitHub/etc) initialized');

    // Initialize OAuth provider routes (Sign in WITH CalOS)
    oauthProviderRoutes = initOAuthProviderRoutes(db);
    app.use('/oauth/provider', oauthProviderRoutes);
    console.log('✓ OAuth provider (Sign in with CalOS) initialized');

    // Initialize passkey/WebAuthn routes (Biometric authentication)
    const { requireAuth } = require('./middleware/sso-auth');
    passkeyRoutes = initPasskeyRoutes(db, require('./middleware/sso-auth'));
    app.use('/api/auth/passkey', passkeyRoutes);
    console.log('✓ Passkey/WebAuthn biometric authentication initialized');

    // Initialize documentation snapshot routes (OAuth tutorials)
    docsSnapshotRoutes = initDocsRoutes(db);
    app.use('/api/docs', docsSnapshotRoutes);
    console.log('✓ Documentation snapshot system initialized (OAuth tutorials with screenshots/GIFs)');

    // Initialize OAuth screenshot upload routes
    app.use('/api/oauth', oauthUploadRoutes);
    console.log('✓ OAuth screenshot upload routes initialized');

    // Initialize skills engine
    skillsEngine.initEngine(db);
    console.log('✓ Skills progression system initialized');

    // Initialize calculator routes
    calculatorRoutes = initCalculatorRoutes(db);
    app.use('/api/calculators', calculatorRoutes);
    console.log('✓ XP calculator tools initialized');

    // Initialize actions routes
    actionsRoutes = initActionsRoutes(db);
    app.use('/api/actions', actionsRoutes);
    console.log('✓ Actions/effects system initialized');

    // Initialize Model Council routes
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    councilRoutes = initCouncilRoutes(db, agentRegistry, { ollamaUrl });
    app.use('/api/council', councilRoutes);
    console.log('✓ Model Council system initialized');

    // Initialize Autonomous Mode routes (copilot mode)
    autonomousRoutes = initAutonomousRoutes(db, agentRegistry, {
      broadcast,
      enabled: true, // Default: ON - this is the "copilot mode"
      unifiedKnowledge: unifiedKnowledge // Cal's memory for pattern matching
    });
    // Apply knowledge enricher to inject learned patterns into AI requests
    app.use('/api/autonomous', knowledgeEnricher.middleware(), autonomousRoutes);
    console.log('✓ Autonomous Mode (copilot) initialized with knowledge enrichment');

    // Initialize Session Block System (blockchain-inspired with priority queuing)
    sessionOrchestrator = new SessionOrchestrator({
      db,
      broadcast,
      ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434'
    });
    sessionOrchestrator.start(); // Start processing queue
    sessionBlockRoutes = initSessionBlockRoutes(sessionOrchestrator);
    app.use('/api/blocks', sessionBlockRoutes);
    console.log('✓ Session Block System initialized (blockchain-style with gas/priority)');

    // Initialize Workspace Collaboration Handler (real-time collaborative workspace)
    workspaceHandler = new WorkspaceWebSocketHandler({
      db,
      sessionOrchestrator,
      roomManager: null // TODO: integrate with room manager when needed
    });
    console.log('✓ Workspace Collaboration System initialized (real-time human + AI collaboration)');

    // Initialize Workspace API routes
    workspaceRoutes = initWorkspaceRoutes(workspaceHandler);
    app.use('/api/workspace', workspaceRoutes);
    console.log('✓ Workspace API routes initialized');

    // Initialize Diagnostic Routes (model routing tests and system health)
    diagnosticRoutes = initDiagnosticRoutes(sessionOrchestrator.modelWrapper);
    app.use('/api/diagnostic', diagnosticRoutes);
    console.log('✓ Diagnostic system initialized (testing/debugging tools)');

    // Initialize Unicode Manager for mathematical notation support
    unicodeManager = new UnicodeManager();
    await unicodeManager.initialize();
    console.log('✓ Unicode Manager initialized (mathematical symbols and special characters)');

    // Initialize Unicode API routes
    unicodeRoutes = initUnicodeRoutes(unicodeManager);
    app.use('/api/unicode', unicodeRoutes);
    console.log('✓ Unicode API initialized (character lookup and search)');

    // Initialize Ollama Routes (model management and chat)
    app.use('/api/ollama', ollamaRoutes);
    console.log('✓ Ollama routes initialized');

    // Initialize Unified Chat Routes (Multi-LLM: DeepSeek, Anthropic, OpenAI, Ollama)
    app.use('/api', unifiedChatRoutes);
    console.log('✓ Unified chat routes initialized (DeepSeek, Anthropic, OpenAI, Ollama)');

    // Initialize Job Analysis Routes (Job scraping, analysis, lesson plan generation)
    app.use('/api', jobAnalysisRoutes);
    console.log('✓ Job analysis routes initialized');

    // Initialize Fractional Executive Agency System
    console.log('🤝 Initializing Fractional Executive Agency...');
    fractionalAgency = new FractionalExecutiveAgency({ db });

    // Bootstrap with CalRiven + AgentZero
    try {
      await fractionalAgency.bootstrap();
      console.log('✓ Fractional Executive Agency bootstrapped (CalRiven + AgentZero)');
    } catch (error) {
      console.error('⚠️  Agency bootstrap failed:', error.message);
    }

    // Initialize Agency Activity Feed
    const AgentActivityLogger = require('./lib/agent-activity-logger');
    const activityLogger = new AgentActivityLogger({ db });
    agencyActivityFeed = new AgencyActivityFeed({
      agency: fractionalAgency,
      activityLogger
    });
    console.log('✓ Agency Activity Feed initialized');

    // Initialize Agency Routes
    initializeAgencyRoutes({
      agency: fractionalAgency,
      activityFeed: agencyActivityFeed
    });
    app.use('/api/agency', agencyRouter);
    console.log('✓ Agency API routes initialized');
    console.log('  - Dashboard: http://localhost:3000/agency-dashboard.html');
    console.log('  - API: /api/agency/dashboard, /api/agency/activity-feed, /api/agency/agents');

    // Initialize Model Registry Routes (Ollama proxy)
    if (modelDiscovery) {
      initializeModelRoutes({ discoveryService: modelDiscovery });
      app.use('/api/models', modelRegistryRouter);
      console.log('✓ Model Registry routes initialized (Ollama proxy beyond localhost)');
      console.log('  - /api/models - List all models');
      console.log('  - /api/models/ollama/tags - Ollama tags proxy');
      console.log('  - /api/models/ollama/chat - Ollama chat proxy');
    }

    // Initialize Context Haiku Compression
    contextHaiku = new ContextHaikuCompressor({ db });
    console.log('✓ Context Haiku Compression initialized');
    console.log('🤝 Fractional Executive Agency System ready!');

    // Initialize Admin God Mode routes
    adminRoutes = initAdminRoutes(db);
    app.use('/api/admin', adminRoutes);
    console.log('✓ Admin God Mode initialized');

    // Initialize Usage Tracker (tracks every model request for pattern discovery)
    usageTracker = new UsageTracker({ db });
    console.log('✓ Usage Tracker initialized');

    // Initialize Bucket Orchestrator (12-bucket integration system)
    bucketOrchestrator = new BucketOrchestrator({
      db,
      usageTracker,
      modelWrapper: sessionOrchestrator ? sessionOrchestrator.modelWrapper : null,
      workflowBuilder: null // TODO: Add when available
    });
    await bucketOrchestrator.init();
    console.log('✓ Bucket Orchestrator initialized (12-bucket system with reasoning logs)');

    // Initialize Bucket routes
    bucketRoutes = initBucketRoutes({ bucketOrchestrator });
    app.use('/api/buckets', bucketRoutes);
    console.log('✓ Bucket API routes initialized');

    // Initialize XRef routes (Cross-reference tracking)
    xrefRoutes = initXrefRoutes({ db });
    app.use('/api/xref', xrefRoutes);
    console.log('✓ XRef API routes initialized');

    // Initialize A/B Testing & Gamification Systems
    console.log('🎮 Initializing A/B Testing & Gamification Systems...');

    // Device Pairing (QR codes, WiFi proximity, trust elevation)
    devicePairing = new DevicePairingManager({ db });
    const { initRoutes: initDevicePairingRoutes } = require('./routes/device-pairing-routes');
    const devicePairingRoutes = initDevicePairingRoutes(db);
    app.use('/api/auth', devicePairingRoutes);
    console.log('✓ Device Pairing system initialized (QR codes, WiFi proximity, trust levels)');

    // User Profile Detector (ICP segmentation)
    userProfileDetector = new UserProfileDetector({ db });
    console.log('✓ User Profile Detector initialized (8 ICP segments)');

    // Geo Resolver (IP → Location)
    geoResolver = new GeoResolver({ db, cacheEnabled: true });
    console.log('✓ Geo Resolver initialized (IP → geolocation with caching)');

    // Identity Resolver (Cookie/Device/User → unified identity graph)
    identityResolver = new IdentityResolver({ db });
    console.log('✓ Identity Resolver initialized (unified identity tracking)');

    // Domain Context Enricher (domain-specific parameters + style guides)
    domainContextEnricher = new DomainContextEnricher({ db });
    console.log('✓ Domain Context Enricher initialized (domain-specific prompts)');

    // Agent Activity Logger (track what agents are doing)
    agentActivityLogger = new AgentActivityLogger({ db });
    console.log('✓ Agent Activity Logger initialized (tracks all agent actions)');

    // Model Version Manager (A/B testing different model versions)
    modelVersionManager = new ModelVersionManager({ db, ollamaAdapter: null });
    console.log('✓ Model Version Manager initialized (version control + traffic splitting)');

    // Model Wrappers (output format variations)
    modelWrappers = new ModelWrappers({ db, outputFormatter: null });
    console.log('✓ Model Wrappers initialized (9 built-in wrappers)');

    // Training Tasks (gamified data collection)
    trainingTasks = new TrainingTasksManager({
      db,
      skillsEngine,
      actionsEngine: null // Actions engine exists but not directly exposed yet
    });
    console.log('✓ Training Tasks Manager initialized (9 task types, XP rewards)');

    // Account Warming (TikTok-style account warming)
    accountWarmer = new AccountWarmer({
      db,
      trainingTasks,
      devicePairing
    });
    console.log('✓ Account Warmer initialized (4 progression phases: Observer → Expert)');

    // Experiment Manager (multi-armed bandit optimization)
    experimentManager = new ExperimentManager({
      db,
      modelVersionManager,
      modelWrappers
    });
    console.log('✓ Experiment Manager initialized (A/B testing with statistical significance)');

    // Initialize API Routes for new systems
    const { initRoutes: initTrainingTasksRoutes } = require('./routes/training-tasks-routes');
    const trainingTasksRoutes = initTrainingTasksRoutes(db, trainingTasks);
    app.use('/api/training', trainingTasksRoutes);
    console.log('✓ Training Tasks API routes initialized');

    const { initRoutes: initAccountWarmingRoutes } = require('./routes/account-warming-routes');
    const accountWarmingRoutes = initAccountWarmingRoutes(db, accountWarmer);
    app.use('/api/warmup', accountWarmingRoutes);
    console.log('✓ Account Warming API routes initialized');

    const { initRoutes: initExperimentRoutes } = require('./routes/experiment-routes');
    const experimentRoutes = initExperimentRoutes(db, experimentManager);
    app.use('/api/experiments', experimentRoutes);
    console.log('✓ Experiment (A/B Testing) API routes initialized');

    console.log('🎮 A/B Testing & Gamification Systems ready!');

    // Initialize Credits & Twilio System (Prepaid credits, phone verification, SMS/calls)
    console.log('💳 Initializing Credits & Twilio System...');

    // Initialize Stripe client for credit purchases
    if (process.env.STRIPE_SECRET_KEY) {
      stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      console.log('✓ Stripe client initialized');
    } else {
      console.warn('⚠️  STRIPE_SECRET_KEY not set - credit purchases will be disabled');
    }

    // Initialize Twilio client for SMS/calls
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      twilioClient = require('twilio')(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      console.log('✓ Twilio client initialized');
    } else {
      console.warn('⚠️  TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set - SMS/calls will be disabled');
    }

    // Initialize credits routes
    creditsRoutes = initCreditsRoutes(db, stripe);
    app.use('/api/credits', creditsRoutes);
    console.log('✓ Credits system initialized (packages, purchases, balance)');

    // Initialize Twilio routes
    twilioRoutes = initTwilioRoutes(db, twilioClient);
    app.use('/api/twilio', twilioRoutes);
    console.log('✓ Twilio system initialized (phone verification, SMS, calls)');

    // Initialize Cost Guard middleware for tier quotas
    costGuard = new CostGuard({ db, enabled: true });
    console.log('✓ Cost Guard initialized (developer/free/paid tier enforcement)');

    // Initialize Usage Tracker routes
    usageRoutes = initUsageRoutes(db);
    app.use('/api/usage', usageRoutes);
    console.log('✓ Usage tracking routes initialized (quotas, analytics, daily limits)');

    // Initialize Recruiting routes
    recruitingRoutes = initRecruitingRoutes(db);
    app.use('/api/recruiting', recruitingRoutes);
    console.log('✓ Recruiting system initialized (resume upload, talent ranking, OSS identification)');

    // Initialize Matching routes (Family exclusion/inclusion system)
    const relationshipRouter = new RelationshipRouter({
      db,
      collaborationMatcher: null,
      defaultMode: 'exclusion'
    });
    matchingRoutes = initMatchingRoutes(db, { relationshipRouter });
    app.use('/api/matching', matchingRoutes);
    console.log('✓ Matching system initialized (family exclusion/inclusion, sphere grouping)');

    // Initialize Public Data routes (ipconfig.io style data collection)
    publicDataRoutes = initPublicDataRoutes(db, { geoResolver });
    app.use('/api/public-data', publicDataRoutes);
    console.log('✓ Public data collection initialized (IP, geolocation, browser, device)');

    // Initialize Knowledge Learning routes (Cal's debugging pattern learning)
    knowledgeLearningRoutes = initKnowledgeLearningRoutes(db, {
      knowledgeGraph: null,
      unifiedKnowledge: unifiedKnowledge
    });
    // Apply knowledge enricher middleware to inject learned patterns
    app.use('/api/knowledge', knowledgeEnricher.middleware(), knowledgeLearningRoutes);
    console.log('✓ Knowledge learning system initialized (debugging patterns, solutions)');

    console.log('💳 Credits & Twilio System ready!');

    // TEMPORARILY DISABLED - Documentation Registry System
    // TODO: Fix export/import mismatch in documentation-routes.js
    /*
    console.log('📚 Initializing Documentation Registry System...');

    documentationRegistry = new DocumentationRegistry({
      db,
      githubToken: process.env.GITHUB_TOKEN
    });

    documentationRegistry.startFetchWorker();
    documentationRoutes = initDocumentationRoutes(db, documentationRegistry);
    app.use('/api/docs', documentationRoutes);
    console.log('✓ Documentation Registry initialized (npm, GitHub, CDN support)');
    console.log('📚 Documentation Registry System ready!');
    */

    // Initialize Tenant API Keys & Subscription Management (Two-layer API key system)
    console.log('🔑 Initializing API Key & Subscription System...');

    // Initialize keyring for BYOK encryption
    keyring = new Keyring(db);
    console.log('✓ Keyring initialized for BYOK (AES-256-GCM encryption)');

    // Initialize VaultBridge for contextual API key retrieval
    vaultBridge = new VaultBridge({
      keyring,
      db
    });
    console.log('✓ VaultBridge initialized (contextual key retrieval: BYOK → user → system)');

    // Re-initialize DataSource with VaultBridge for contextual key retrieval
    initDataSource(db, vaultBridge);
    console.log('✓ DataSource updated with VaultBridge');

    // Initialize TierGate for usage enforcement
    tierGate = new TierGate({
      db,
      mode: process.env.CALOS_MODE || 'cloud' // 'oss' or 'cloud'
    });
    console.log(`✓ TierGate initialized (mode: ${process.env.CALOS_MODE || 'cloud'})`);

    // Make systems available to routes via app.locals
    app.locals.keyring = keyring;
    app.locals.vaultBridge = vaultBridge;
    app.locals.tierGate = tierGate;

    // Initialize ModelClarityEngine for real-time pricing & model selection
    // Will be initialized later after PriceWorker is available
    // (see below in pricing section)

    // Initialize tenant API key routes (Layer 1: Customer → CALOS)
    tenantApiKeyRoutes = initTenantApiKeyRoutes(db);
    app.use('/api/keys', tenantApiKeyRoutes);
    console.log('✓ Tenant API key system initialized (sk-tenant-xxx)');

    // Initialize BYOK routes (Layer 2: Tenant's own provider keys)
    byokRoutes = initBYOKRoutes(db, keyring);
    app.use('/api/byok', byokRoutes);
    console.log('✓ BYOK (Bring Your Own Key) system initialized');

    // Initialize billing routes (User billing dashboard)
    billingRoutes = require('./routes/billing-routes');
    app.use('/api/billing', billingRoutes);
    console.log('✓ User billing dashboard initialized');

    // Initialize usage tracking routes (GitHub Pages bridge tracking)
    usageTrackingRoutes = require('./routes/usage-tracking-routes');
    app.use('/api/usage', usageTrackingRoutes);
    console.log('✓ Usage tracking system initialized');

    // Initialize admin analytics routes (Revenue/cost/profit analytics)
    adminAnalyticsRoutes = require('./routes/admin-analytics-routes');
    app.use('/api/admin/analytics', adminAnalyticsRoutes);
    console.log('✓ Admin analytics dashboard initialized');

    // Initialize subscription routes (Stripe integration)
    subscriptionRoutes = initSubscriptionRoutes(db);
    app.use('/api/subscriptions', subscriptionRoutes);
    console.log('✓ Stripe subscription system initialized (plans, upgrades, cancellation)');

    // Initialize schema dashboard routes (Schema management tools)
    schemaDashboardRoutes = initSchemaDashboardRoutes(db);
    app.use('/api/schema-dashboard', schemaDashboardRoutes);
    console.log('✓ Schema management dashboard initialized');

    // Initialize knowledge graph routes (AI-powered learning system)
    knowledgeGraphRoutes = initKnowledgeGraphRoutes(db);
    app.use('/api/knowledge', knowledgeGraphRoutes);
    console.log('✓ Knowledge graph & AI learning system initialized');

    // Initialize voice project routes (voice → project tagging & export)
    voiceProjectRoutes = initVoiceProjectRoutes(db);
    app.use('/api/voice', voiceProjectRoutes);
    console.log('✓ Voice project routing & export system initialized');

    // Initialize voice onboarding auth routes (voice login questionnaire)
    const voiceOnboardingRoutes = require('./routes/voice-onboarding-routes');
    app.use('/api/voice-onboarding', voiceOnboardingRoutes);
    console.log('✓ Voice onboarding auth system initialized (10-question login)');

    // Initialize learning platform routes (CryptoZombies-style system)
    const learningEngine = new LearningEngine(db);
    const learningRoutes = createLearningRoutes({
      db,
      learningEngine,
      miniGameGenerator: null, // TODO: implement
      dripCampaignManager: null // TODO: implement
    });
    app.use('/api/learning', learningRoutes);
    app.locals.learningEngine = learningEngine; // Make available to other routes
    console.log('✓ Learning platform API initialized (paths, progress, lessons)');

    // Initialize free learning routes (anonymous sessions, privacy-first)
    const freeLearningRoutes = require('./routes/free-learning-routes');
    app.use('/api/learning', freeLearningRoutes); // Mount on same path as authenticated learning
    console.log('✓ Free learning API initialized (anonymous sessions, cookie snapshot, privacy-first)');

    // Initialize Cal learning loop (auto-run debug lessons)
    const calLoop = new CalLearningLoop({ db, interval: 60000 }); // Run every minute
    const calRoutes = createCalRoutes({ db, calLoop });
    app.use('/api/cal', calRoutes);
    app.locals.calLoop = calLoop; // Make available globally
    console.log('✓ Cal learning loop initialized (debugging tier tracking)');

    // Initialize Cal's Meta-Learning System
    console.log('🧠 Initializing Cal Meta-Learning System...');

    // 1. Guardian Agent (autonomous system monitor)
    const guardian = new GuardianAgent({
      db,
      model: 'mistral:7b',
      verbose: false,
      receiptParser,
      ocrAdapter
    });
    app.locals.guardian = guardian;
    console.log('✓ Guardian Agent initialized (auto-healing & monitoring)');

    // 2. Cal Student Launcher (10-milestone journey tracker)
    const calStudentLauncher = new CalStudentLauncher({ db });
    app.locals.calStudentLauncher = calStudentLauncher;
    console.log('✓ Cal Student Launcher initialized (journey milestones)');

    // 3. Agent Mesh (distributed agent network)
    const agentMesh = new AgentMesh({ healthCheckInterval: 30000, maxHops: 5 });
    agentMesh.registerNode('cal', {
      type: 'student',
      capabilities: ['debugging', 'learning', 'teaching'],
      status: 'online'
    });
    agentMesh.registerNode('guardian', {
      type: 'monitor',
      capabilities: ['health_check', 'auto_heal', 'diagnostics'],
      status: 'online'
    });
    agentMesh.connect('cal', 'guardian'); // Cal and Guardian can communicate
    app.locals.agentMesh = agentMesh;
    console.log('✓ Agent Mesh initialized (mycelium network active)');

    // 4. Forum Monitor (Cal monitors forums and auto-responds)
    const forumMonitor = new ForumMonitor();
    app.locals.forumMonitor = forumMonitor;
    console.log('✓ Forum Monitor initialized (community engagement)');

    // 5. Skills Engine (multi-skill progression system)
    SkillsEngine.initEngine(db);
    app.locals.skillsEngine = SkillsEngine;
    console.log('✓ Skills Engine initialized (RuneScape-style progression)');

    // 6. Meta-Orchestrator (coordinates all tracks)
    const metaOrchestrator = new CalMetaOrchestrator({
      db,
      calLoop,
      guardian,
      forumMonitor,
      studentLauncher: calStudentLauncher,
      agentMesh,
      skillsEngine: SkillsEngine,
      learningEngine,
      userId: 'cal',
      cycleInterval: 300000 // 5 minutes
    });
    app.locals.metaOrchestrator = metaOrchestrator;
    console.log('✓ Meta-Orchestrator initialized (multi-track coordination)');

    // Start Guardian monitoring (runs every 60s with timeout protection)
    setInterval(async () => {
      try {
        // Add 45s timeout to prevent blocking
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout of 45000ms exceeded')), 45000)
        );

        const result = await Promise.race([
          guardian.monitor(),
          timeoutPromise
        ]);

        if (result && (result.severity === 'error' || result.severity === 'warning')) {
          console.log(`[Guardian] ${result.severity.toUpperCase()}: ${result.message.substring(0, 100)}...`);
        }
      } catch (error) {
        console.error('[Guardian] Monitoring failed:', error.message);
      }
    }, 60000);

    // Start Meta-Orchestrator (auto-start Cal's multi-dimensional learning)
    setTimeout(async () => {
      console.log('🚀 Starting Cal Meta-Learning Orchestrator...');
      await metaOrchestrator.start();
    }, 5000); // Wait 5s for everything to be ready

    console.log('🔑 API Key & Subscription System ready!');

    // Initialize Triangle Consensus System (Multi-provider consensus queries)
    console.log('🔺 Initializing Triangle Consensus System...');
    try {
      // Initialize MultiProviderRouter
      multiProviderRouter = new MultiProviderRouter({ db, vaultBridge });
      console.log('✓ Multi-provider router initialized (OpenAI, Anthropic, DeepSeek)');

      // Initialize Triangle Consensus Engine
      triangleEngine = new TriangleConsensusEngine({
        multiProviderRouter,
        vaultBridge,
        modelClarityEngine,
        db
      });
      console.log('✓ Triangle Consensus Engine initialized (truth by triangulation)');

      // Initialize triangle routes
      triangleRoutes = initTriangleRoutes(db, triangleEngine);
      app.use('/api', triangleRoutes);
      console.log('✓ Triangle API routes initialized (/api/chat/triangle, /api/triangle/batch, /api/triangle/stats)');

      // Initialize database query routes
      databaseQueryRoutes = initDatabaseQueryRoutes(db, triangleEngine);
      app.use('/api', databaseQueryRoutes);
      console.log('✓ Database Query routes initialized (/api/database/query, /api/database/schema, /api/database/tables)');

      console.log('🔺 Triangle Consensus System ready!');
    } catch (error) {
      console.warn('⚠️  Triangle Consensus System failed to initialize:', error.message);
      console.log('🔺 Continuing without Triangle Consensus System...');
    }

    // Initialize Multi-Service Routing System
    console.log('🔀 Initializing Multi-Service Routing System...');
    try {
      // Initialize service adapters
      gitAdapter = new GitAdapter({
        ollamaPort: 11435,
        ollamaHost: process.env.OLLAMA_HOST || 'http://localhost'
      });
      console.log('✓ Git adapter initialized (port 11435)');

      copilotAdapter = new CopilotAdapter({
        ollamaPort: 11437,
        ollamaHost: process.env.OLLAMA_HOST || 'http://localhost',
        // TODO: Wire up code indexer and triangle consensus when available
        // codeIndexer: codeIndexer,
        // triangleConsensus: triangleEngine
      });
      console.log('✓ Copilot adapter initialized (port 11437)');

      gamingAdapter = new GamingAdapter({
        ollamaPort: 11436,
        ollamaHost: process.env.OLLAMA_HOST || 'http://localhost',
        db
      });
      console.log('✓ Gaming adapter initialized (port 11436)');

      ocrAdapter = new OCRAdapter({
        ollamaPort: 11436,
        ollamaHost: process.env.OLLAMA_HOST || 'http://localhost'
      });
      console.log('✓ OCR adapter initialized (port 11436, Tesseract integration)');

      receiptParser = new ReceiptParser({ db });
      console.log('✓ Receipt parser initialized (10 expense categories)');

      // Initialize format router middleware
      formatRouter = new FormatRouter({
        db,
        ollamaHost: process.env.OLLAMA_HOST || 'http://localhost'
      });
      app.use(formatRouter.middleware());
      console.log('✓ Format router middleware initialized (auto-detects service type)');

      // Initialize and mount service routes (with activity tracking)
      gitRoutes = createGitRoutes({ gitAdapter });
      app.use('/api/git',
        apiKeyActivityTracker ? apiKeyActivityTracker.trackActivity : (req, res, next) => next(),
        gitRoutes
      );
      console.log('✓ Git routes initialized (/api/git/commit-message, /api/git/review-pr, etc.)');

      copilotRoutes = createCopilotRoutes({ copilotAdapter });
      app.use('/api/copilot',
        apiKeyActivityTracker ? apiKeyActivityTracker.trackActivity : (req, res, next) => next(),
        copilotRoutes
      );
      console.log('✓ Copilot routes initialized (/api/copilot/complete, /api/copilot/build, etc.)');

      gamingRoutes = createGamingRoutes({ db, gamingAdapter });
      app.use('/api/gaming',
        apiKeyActivityTracker ? apiKeyActivityTracker.trackActivity : (req, res, next) => next(),
        gamingRoutes
      );
      console.log('✓ Gaming routes initialized (/api/gaming/npc-dialogue, /api/gaming/generate-map, etc.)');

      ocrRoutes = createOCRRoutes({ ocrAdapter });
      app.use('/api/ocr',
        apiKeyActivityTracker ? apiKeyActivityTracker.trackActivity : (req, res, next) => next(),
        ocrRoutes
      );
      console.log('✓ OCR routes initialized (/api/ocr/extract-text, /api/ocr/describe-image, etc.)');

      const createReceiptRoutes = require('./routes/receipt-routes');
      receiptRoutes = createReceiptRoutes({ ocrAdapter, receiptParser, db });
      app.use('/api/receipts',
        apiKeyActivityTracker ? apiKeyActivityTracker.trackActivity : (req, res, next) => next(),
        receiptRoutes
      );
      console.log('✓ Receipt routes initialized (/api/receipts/upload, /api/receipts/parse, /api/receipts/categories, etc.)');

      console.log('🔀 Multi-Service Routing System ready! (5 services × 3 ports = 15+ specialized endpoints)');
      if (apiKeyActivityTracker) {
        console.log('✓ Activity tracking enabled for fraud detection');
      }
    } catch (error) {
      console.warn('⚠️  Multi-Service Routing System failed to initialize:', error.message);
      console.log('🔀 Continuing without Multi-Service Routing System...');
    }

    // Initialize Visual Generation System
    console.log('🎨 Initializing Visual Generation System...');
    try {
      // Initialize file output service
      fileOutputService = new FileOutputService('./storage/generated');
      await fileOutputService.initialize();
      console.log('✓ File output service initialized (storage/generated/)');

      // Get ClarityEngine if available for Mermaid/DOT generation
      const clarityEngine = modelClarityEngine || null;

      // Initialize and mount visual generation routes (with activity tracking)
      visualGenerationRoutes = createVisualGenerationRoutes({
        fileOutputService,
        DialogueTreeGenerator,
        VisualAssetRenderer,
        ProductCatalog,
        ollamaClient: ollama,
        clarityEngine
      });
      app.use('/api/visual',
        apiKeyActivityTracker ? apiKeyActivityTracker.trackActivity : (req, res, next) => next(),
        visualGenerationRoutes
      );
      console.log('✓ Visual generation routes initialized');
      console.log('  - /api/visual/mermaid - Generate Mermaid diagrams');
      console.log('  - /api/visual/dot - Generate GraphViz DOT files');
      console.log('  - /api/visual/dialogue-tree - Generate MMORPG quest dialogue trees');
      console.log('  - /api/visual/badge - Generate badge/shield SVGs');
      console.log('  - /api/visual/tilemap - Generate tilemap SVGs');
      console.log('  - /api/visual/product-page - Generate product pages with AI');
      console.log('  - /api/visual/product-catalog - Generate multi-product catalogs');

      // Serve generated files statically
      app.use('/generated', express.static(path.join(__dirname, 'storage', 'generated')));
      console.log('✓ Generated files served at /generated/*');

      console.log('🎨 Visual Generation System ready! (Mermaid, DOT, Tilemaps, Badges, Products)');
    } catch (error) {
      console.warn('⚠️  Visual Generation System failed to initialize:', error.message);
      console.log('🎨 Continuing without Visual Generation System...');
    }

    // Initialize Web Search Adapter
    console.log('🌐 Initializing Web Search Adapter...');
    try {
      webSearchAdapter = new WebSearchAdapter({
        cache: null, // TODO: integrate with existing cache system
        timeout: 10000
      });
      console.log('✓ Web search adapter initialized (DuckDuckGo)');
      console.log('  Real-time data available for current events, news, etc.');
      console.log('🌐 Web Search ready! (Like Perplexity/Comet)');
    } catch (error) {
      console.warn('⚠️  Web Search Adapter failed to initialize:', error.message);
      console.log('🌐 Continuing without web search capability...');
    }

    // Initialize Translation Adapter
    console.log('🌍 Initializing Translation Adapter...');
    try {
      translationAdapter = new TranslationAdapter({
        cache: null, // Using database cache instead
        timeout: 10000
      });
      console.log('✓ Translation adapter initialized (MyMemory API)');
      console.log('  40+ languages supported with auto-detection');

      // Initialize Translation Database Manager
      try {
        translationDBManager = new TranslationDBManager({
          db,
          translationAdapter
        });
        console.log('✓ Translation database manager initialized');
        console.log('  Database cache for instant offline translations');
        console.log('  No API rate limits with pre-loaded translations');
      } catch (dbError) {
        console.warn('⚠️  Translation DB Manager failed to initialize:', dbError.message);
        console.log('  Falling back to API-only mode');
      }

      console.log('🌍 Translation System ready! (Multi-language support)');
    } catch (error) {
      console.warn('⚠️  Translation Adapter failed to initialize:', error.message);
      console.log('🌍 Continuing without translation capability...');
    }

    // Initialize Librarian Illusion System
    console.log('🎭 Initializing Librarian Illusion System...');
    try {
      // Initialize triple store (RDF-style semantic mappings)
      tripleStore = new TripleStore(db);
      await tripleStore.loadDefaultMappings();
      console.log('✓ Triple store initialized with default symbolic mappings');

      // Initialize symbolic router (resolves URIs to API calls)
      symbolicRouter = new SymbolicRouter({
        tripleStore,
        gitAdapter,
        copilotAdapter,
        gamingAdapter,
        ocrAdapter,
        db
      });
      console.log('✓ Symbolic router initialized');

      // Initialize librarian facade (omniscient orchestrator)
      librarianFacade = new LibrarianFacade({
        tripleStore,
        symbolicRouter,
        webSearchAdapter, // Enable real-time web search
        apiKeyActivityTracker: null // Will be set later after tracker is initialized
      });
      console.log('✓ Librarian facade initialized - ready to appear omniscient');

      // Initialize and mount librarian routes
      librarianRoutes = createLibrarianRoutes({
        librarian: librarianFacade,
        tripleStore,
        symbolicRouter
      });
      app.use('/api/librarian', librarianRoutes);
      console.log('✓ Librarian routes initialized');
      console.log('  - /api/librarian/query - Natural language semantic queries');
      console.log('  - /api/librarian/triple - RDF triple queries (e.g., ?x hasDialogue ?)');
      console.log('  - /api/librarian/fetch - Direct symbolic URI resolution');
      console.log('  - /api/librarian/map - View symbolic mappings across services');
      console.log('  - /api/librarian/stats - System statistics');
      console.log('  - /api/librarian/demo - Demonstrate the illusion');

      console.log('🎭 Librarian Illusion System ready! (Isolated services cooperate via symbols)');
    } catch (error) {
      console.warn('⚠️  Librarian Illusion System failed to initialize:', error.message);
      console.log('🎭 Continuing without Librarian Illusion System...');
    }

    // Initialize Translation Routes
    if (translationAdapter) {
      try {
        translationRoutes = createTranslationRoutes({
          translationAdapter,
          translationDBManager
        });
        app.use('/api/translate', translationRoutes);
        console.log('✓ Translation routes initialized');
        console.log('  - /api/translate - Translate text between languages');
        console.log('  - /api/translate/detect - Auto-detect user language');
        console.log('  - /api/translate/languages - List all supported languages');
        console.log('  - /api/translate/ui/:lang - Get UI translations');
        console.log('  - /api/translate/cached/:lang - Get cached translations (database)');
        console.log('  - /api/translate/cached - Get specific translation with auto-cache');
        console.log('  - /api/translate/preload - Pre-load translations for multiple strings');
        console.log('🌍 Translation API ready! (Server-verified translations)');
      } catch (error) {
        console.warn('⚠️  Translation routes failed to initialize:', error.message);
      }
    }

    // Initialize API Key Activity Tracker
    console.log('🔐 Initializing API Key Activity Tracker...');
    try {
      apiKeyActivityTracker = new ApiKeyActivityTracker({
        tripleStore,
        db
      });
      console.log('✓ API Key Activity Tracker initialized');
      console.log('  Tracking API key usage across services for fraud detection');
      console.log('  Detecting: Multi-IP usage, credential stuffing, unusual patterns');

      // Link tracker to Librarian for fraud detection queries
      if (librarianFacade) {
        librarianFacade.apiKeyActivityTracker = apiKeyActivityTracker;
        console.log('✓ Fraud detection queries linked to Librarian');
      }

      console.log('🔐 API Key Activity Tracker ready!');
    } catch (error) {
      console.warn('⚠️  API Key Activity Tracker failed to initialize:', error.message);
      console.log('🔐 Continuing without API Key Activity Tracker...');
    }

    // Initialize Voucher & Gift Card System
    console.log('🎁 Initializing Voucher & Gift Card System...');
    voucherRoutes = initVoucherRoutes(db);
    app.use('/api/vouchers', voucherRoutes);
    console.log('✓ Voucher & gift card system initialized (CALOS-5USD-XYZ123)');
    console.log('🎁 Voucher System ready!');

    // Initialize Auto-Provisioning System
    console.log('🚀 Initializing Auto-Provisioning System...');
    provisionRoutes = initProvisionRoutes(db);
    app.use('/api/provision', provisionRoutes);
    console.log('✓ Auto-provisioning initialized (instant test accounts with free credits)');
    console.log('🚀 Auto-Provision System ready!');

    // Initialize Payment Methods & ACH
    console.log('💳 Initializing Payment Methods & ACH System...');
    paymentRoutes = initPaymentRoutes(db);
    app.use('/api/payments', paymentRoutes);
    console.log('✓ Payment methods initialized (credit cards, ACH bank transfers)');
    console.log('💳 Payment System ready!');

    // Initialize Affiliate Tracking System
    console.log('🤝 Initializing Affiliate Tracking System...');
    affiliateTracker = new AffiliateTracker(db);
    affiliateRoutes = initAffiliateRoutes(db, affiliateTracker);
    app.use('/api/affiliates', affiliateRoutes);
    console.log('✓ Affiliate tracking initialized (Google, Adobe, WordPress partnerships)');
    console.log('🤝 Affiliate System ready!');

    // Initialize Campaign Manager (Ad Gateway)
    console.log('📢 Initializing Ad Gateway Campaign Manager...');
    campaignManager = new CampaignManager({
      db,
      experimentManager,
      affiliateTracker,
      multiProviderRouter,
      triangleEngine
    });
    campaignRoutes = initCampaignRoutes(db, campaignManager);
    app.use('/api', campaignRoutes);
    console.log('✓ Ad Gateway initialized (/api/campaigns, A/B testing, BYOK support)');
    console.log('📢 Campaign Manager ready!');

    // Initialize Handle Registry System (@username vanity handles)
    console.log('🏷️  Initializing Handle Registry System...');
    handleRegistry = new HandleRegistry({ db });
    handleRoutes = initHandleRoutes(db, handleRegistry);
    app.use('/api/handles', handleRoutes);
    console.log('✓ Handle registry initialized (@username system like Discord/Twitter)');
    console.log('🏷️  Handle System ready!');

    // Initialize Path-Based Encryption System (E2E with challenge chains)
    console.log('🔐 Initializing Path-Based Encryption System...');
    try {
      pathEncryption = new PathBasedEncryption({
        db,
        sessionBlockManager: sessionOrchestrator,
        botDetector: null // Challenge chain has its own PoW logic
      });
      console.log('✓ Path-based encryption initialized (derives keys from interaction paths)');

      challengeChain = new ChallengeChain({
        db,
        botDetector: null, // Uses internal PoW verification
        pathEncryption
      });
      console.log('✓ Challenge chain initialized (PoW sequences for key derivation)');

      secureMessagingRoutes = initSecureMessagingRoutes(db, challengeChain, pathEncryption);
      app.use('/api/secure', secureMessagingRoutes);
      console.log('✓ Secure messaging routes initialized (encrypted messages with path-derived keys)');
      console.log('🔐 Path-Based Encryption System ready!');
    } catch (error) {
      console.warn('⚠️  Path-Based Encryption System failed to initialize:', error.message);
      console.log('🔐 Continuing without Path-Based Encryption System...');
    }

    // Initialize Feature Gate Manager (unified access control)
    console.log('🚦 Initializing Feature Gate Manager...');
    try {
      featureGate = new FeatureGateManager({ db });
      console.log('✓ Feature gate manager initialized (unified access control)');

      featureAnalyticsRoutes = initFeatureAnalyticsRoutes(db, featureGate);
      app.use('/api/feature-analytics', featureAnalyticsRoutes);
      console.log('✓ Feature analytics routes initialized (top producers tracking)');
      console.log('🚦 Feature Gate System ready!');
    } catch (error) {
      console.warn('⚠️  Feature Gate Manager failed to initialize:', error.message);
      console.log('🚦 Continuing without Feature Gate Manager...');
    }

    // Initialize Wrapped/Leaderboard System (READ from existing analytics)
    console.log('📊 Initializing Wrapped/Leaderboard System...');
    try {
      wrappedRoutes = initWrappedRoutes(db);
      app.use('/api/wrapped', wrappedRoutes);
      console.log('✓ Wrapped routes initialized (Spotify-style user summaries)');

      leaderboardRoutes = initLeaderboardRoutes(db);
      app.use('/api/leaderboard', leaderboardRoutes);
      console.log('✓ Leaderboard routes initialized (real-time rankings)');

      marketplaceRoutes = initMarketplaceRoutes(db);
      app.use('/api/marketplace', marketplaceRoutes);
      console.log('✓ Marketplace routes initialized (GE-style demand pricing)');

      activityFeedRoutes = initActivityFeedRoutes(db);
      app.use('/api/activity', activityFeedRoutes);
      console.log('✓ Activity feed routes initialized (live event stream)');

      curationRoutes = initCurationRoutes(db);
      app.use('/api/curation', curationRoutes);
      console.log('✓ Content curation routes initialized (news aggregation, newsletters)');

      forumRoutes = initForumRoutes(db);
      app.use('/api/forum', forumRoutes);
      console.log('✓ Forum routes initialized (discussions, voting, karma)');

      // Initialize AI Cost Analytics & Monitoring System
      console.log('📊 Initializing AI Cost Analytics System...');
      try {
        // Initialize AI Cost Analytics engine
        aiCostAnalytics = new AICostAnalytics({ db });
        console.log('✓ AI Cost Analytics engine initialized (candles, trends, projections)');

        // Initialize AI Instance Registry (named instances: cal, ralph, etc.)
        aiInstanceRegistry = new AIInstanceRegistry({
          multiLLMRouter: llmRouter,
          db,
          aiCostAnalytics
        });
        console.log('✓ AI Instance Registry initialized (cal, ralph, deepthink, gpt, claude)');

        // Initialize AI Cost Alerts (circuit breakers, fallbacks)
        aiCostAlerts = new AICostAlerts({
          db,
          aiCostAnalytics,
          aiInstanceRegistry
        });
        console.log('✓ AI Cost Alerts initialized (🟢🟡🔴 status, circuit breakers)');

        // Initialize AI A/B Testing (provider comparison)
        aiABTesting = new AIABTesting({
          db,
          aiCostAnalytics,
          aiInstanceRegistry
        });
        console.log('✓ AI A/B Testing initialized (experiment framework)');

        // Initialize analytics routes
        analyticsRoutes = aiAnalyticsRoutes({
          db,
          aiCostAnalytics,
          aiCostAlerts,
          aiABTesting,
          aiInstanceRegistry
        });
        app.use('/api/ai-analytics', analyticsRoutes);
        console.log('✓ AI Analytics API routes initialized (/api/ai-analytics/*)');

        // Make components available via app.locals
        app.locals.aiCostAnalytics = aiCostAnalytics;
        app.locals.aiCostAlerts = aiCostAlerts;
        app.locals.aiABTesting = aiABTesting;
        app.locals.aiInstanceRegistry = aiInstanceRegistry;

        console.log('📊 AI Cost Analytics System ready!');
      } catch (error) {
        console.warn('⚠️  AI Cost Analytics System failed to initialize:', error.message);
        console.log('📊 Continuing without AI Cost Analytics...');
      }

      authorRoutes = initAuthorRoutes(db, llmRouter);
      app.use('/api/author', authorRoutes);
      console.log('✓ Author workflow routes initialized (write, test, publish executable docs)');

      identityRoutes = initIdentityRoutes(db);
      app.use('/api/identity', identityRoutes);
      console.log('✓ CalRiven identity routes initialized (email/domain verification, reputation)');

      federationRoutes = initFederationRoutes(db);
      app.use('/api/federation', federationRoutes);
      app.use('/', federationRoutes); // Mount WebFinger at root
      console.log('✓ ActivityPub federation routes initialized (Mastodon/Fediverse compatibility)');

      // Initialize CalRiven AI Persona (if LLM router available)
      const CalRivenPersona = require('./lib/calriven-persona');
      const calrivenPersona = llmRouter ? new CalRivenPersona({
        db,
        llmRouter,
        calrivenPrivateKey: process.env.CALRIVEN_PRIVATE_KEY,
        calrivenPublicKey: process.env.CALRIVEN_PUBLIC_KEY
      }) : null;

      builderRoutes = initBuilderRoutes(db, calrivenPersona);
      app.use('/api/builder', builderRoutes);
      console.log('✓ Builder case study routes initialized ($1 → company auto-updating dashboards)');

      // User preferences routes (accessibility settings, theme, language)
      const initPreferencesRoutes = require('./routes/preferences-routes');
      const UserContextTransformer = require('./lib/user-context-transformer');
      const userContextTransformer = new UserContextTransformer({ db });
      const preferencesRoutes = initPreferencesRoutes(db, userContextTransformer);
      app.use('/api/preferences', preferencesRoutes);
      console.log('✓ User preferences routes initialized (accessibility, theme, settings persistence to AI)');

      metricsBundleRoutes = initMetricsBundleRoutes(db);
      app.use('/api/metrics', metricsBundleRoutes);
      console.log('✓ Metrics bundle routes initialized (efficient single-response reads)');

      console.log('📊 CalRiven Platform Ready! (Wrapped/Leaderboard/Author/Identity/Federation/Builders)');
    } catch (error) {
      console.warn('⚠️  Wrapped/Leaderboard System failed to initialize:', error.message);
      console.log('📊 Continuing without Wrapped/Leaderboard System...');
    }
  }

  // Initialize Multi-LLM Router for CalRiven AI Persona (ALWAYS initialize, even if DB fails)
  console.log('🤖 Initializing Multi-LLM Router...');
  try {
    llmRouter = new MultiLLMRouter({
      strategy: 'smart',
      fallback: true,
      costOptimize: true
    });
    console.log('✓ Multi-LLM Router initialized for CalRiven AI');

    // Initialize Multi-Model Comparison Routes (query all models simultaneously)
    multiModelRoutes = initMultiModelRoutes(llmRouter, db);
    // Apply cost guard middleware to model query routes (quota + credit enforcement)
    if (costGuard) {
      app.use('/api/models', costGuard.checkBeforeRequest.bind(costGuard), costGuard.trackAfterRequest.bind(costGuard));
    }
    app.use('/api/models', multiModelRoutes);
    console.log('✓ Multi-Model Comparison routes initialized (query all models)');
    if (costGuard) {
      console.log('✓ Cost guard applied to /api/models routes');
    }

    // Initialize Process Management (CalRiven's background job awareness)
    const ShellProcessManager = require('./lib/shell-process-manager');
    const ProcessMiningAnalyzer = require('./lib/process-mining-analyzer');
    const { initRoutes: initProcessRoutes } = require('./routes/process-management-routes');

    const processManager = new ShellProcessManager({
      checkInterval: 5000,      // Check every 5s
      stuckThreshold: 60000,    // 60s = stuck
      autoCleanup: true         // Auto cleanup orphans/zombies
    });
    const processAnalyzer = new ProcessMiningAnalyzer({ manager: processManager });

    app.use('/api/processes', initProcessRoutes(processManager, processAnalyzer));
    console.log('✓ Process management routes initialized (CalRiven can monitor background jobs)');

    // Initialize Network Traffic Radar (CalRiven's network awareness)
    const NetworkTrafficMonitor = require('./lib/network-traffic-monitor');
    const NetworkAnalytics = require('./lib/network-analytics');
    const { initRoutes: initNetworkRadarRoutes } = require('./routes/network-radar-routes');

    const networkMonitor = new NetworkTrafficMonitor({
      trackRequests: true,
      trackConnections: true,
      trackBandwidth: true,
      geoLookup: true,
      rapidRequestThreshold: 100,    // 100 req/min = suspicious
      portScanThreshold: 10,          // 10 paths/min = scanning
      connectionCheckInterval: 5000   // Check connections every 5s
    });

    const networkAnalytics = new NetworkAnalytics({ monitor: networkMonitor });

    // Start monitoring
    await networkMonitor.init(PORT);

    // Apply middleware to track all requests
    app.use(networkMonitor.middleware());

    // Mount network radar routes
    app.use('/api/network-radar', initNetworkRadarRoutes(networkMonitor, networkAnalytics));
    console.log('✓ Network traffic radar initialized (CalRiven can monitor network traffic)');

    // Update CalRiven persona with process and network awareness
    if (calrivenPersona) {
      calrivenPersona.processManager = processManager;
      calrivenPersona.processAnalyzer = processAnalyzer;
      calrivenPersona.networkMonitor = networkMonitor;
      calrivenPersona.networkAnalytics = networkAnalytics;
      console.log('✓ CalRiven AI persona updated with process & network awareness');
    }

  } catch (error) {
    console.warn('⚠️  Multi-LLM Router failed to initialize:', error.message);
    console.log('🤖 Continuing without Multi-LLM Router...');
  }

  // Check Ollama availability and dynamically register models
  const ollama = await checkOllamaAvailability();
  if (ollama.available) {
    console.log(`✓ Ollama available with ${ollama.models.length} models`);
    // Dynamically register all available Ollama models
    await agentRegistry.registerOllamaModels(ollama.models);
  } else {
    console.log('⚠️  Ollama not available (optional - install from https://ollama.ai)');
    agentRegistry.updateStatus('@ollama', 'offline');
  }

  // Initialize CringeProof routes (emoji vibe scoring powered by Ollama)
  try {
    const EmojiVibeScorer = require('./lib/emoji-vibe-scorer');
    const emojiVibeScorer = new EmojiVibeScorer({
      ollamaClient: ollama.available, // Pass availability boolean
      ollamaModel: 'cringeproof:latest'
    });

    cringeProofRoutes = createCringeProofRoutes({
      db,
      emojiVibeScorer,
      calLearningLoop: learningLoop
    });

    app.use('/api/cringeproof', cringeProofRoutes);
    console.log('✓ CringeProof emoji vibe checker initialized');
    if (ollama.available) {
      console.log('  - Using Ollama model: cringeproof:latest');
    } else {
      console.log('  - Using fallback scoring (no Ollama)');
    }

    // Initialize game completion feedback loop
    try {
      const ActivityLeaderboard = require('./lib/activity-leaderboard');
      const QuestEngine = require('./lib/quest-engine');
      const EloCalculator = require('./lib/elo-calculator');
      const GameCompletionHandler = require('./lib/game-completion-handler');

      const activityLeaderboard = new ActivityLeaderboard({ db });
      const questEngine = new QuestEngine({ db });
      const eloCalculator = new EloCalculator();

      const gameCompletionHandler = new GameCompletionHandler({
        emojiVibeScorer,
        activityLeaderboard,
        questEngine,
        eloCalculator
      });

      // Store for use in WebSocket handlers
      app.set('gameCompletionHandler', gameCompletionHandler);
      app.set('activityLeaderboard', activityLeaderboard);
      app.set('questEngine', questEngine);
      app.set('eloCalculator', eloCalculator);

      console.log('✓ Game completion feedback loop initialized');
      console.log('  - Leaderboard tracking enabled');
      console.log('  - Quest progress enabled');
      console.log('  - ELO rating system enabled');

      // Initialize card game WebSocket handler (connects everything!)
      try {
        const CardGameEngine = require('./lib/card-game-engine');
        const CardGameWebSocketHandler = require('./lib/card-game-websocket-handler');
        const CulturePackManager = require('./lib/culture-pack-manager');
        const EngineeringCardGenerator = require('./lib/engineering-card-generator');

        // Initialize culture pack manager
        const culturePackManager = new CulturePackManager({ db });
        await culturePackManager.loadPacks();

        // Initialize engineering card generator (Cal AI integration)
        const engineeringCardGenerator = new EngineeringCardGenerator({
          anthropic: anthropic, // Reuse existing Anthropic client
          cringeProofEngine: emojiVibeScorer, // Use CringeProof for rating
          outputDir: path.join(__dirname, 'data/culture-packs')
        });

        const cardGameEngine = new CardGameEngine({
          db,
          culturePackManager
        });

        const cardGameWSHandler = new CardGameWebSocketHandler({
          db,
          cardGameEngine,
          aiCardPlayer: null, // Optional AI bot system
          botPool: null, // Optional bot pool
          gameCompletionHandler
        });

        // Store for WebSocket connection routing
        app.set('cardGameWSHandler', cardGameWSHandler);
        app.set('cardGameEngine', cardGameEngine);
        app.set('culturePackManager', culturePackManager);
        app.set('engineeringCardGenerator', engineeringCardGenerator);

        console.log('✓ Card game WebSocket handler ready');
        console.log('  - Multi-player support enabled');
        console.log('  - Real-time game state sync');
        console.log('  - Battle.net style lobbies ready');
        console.log(`  - ${culturePackManager.packs.size} culture packs loaded`);
        console.log(`  - Active rotation: ${culturePackManager.activeRotation.join(', ')}`);
        console.log('  - Cal AI card generation ready 🤖');
      } catch (error) {
        console.warn('⚠️  Card game handler failed:', error.message);
        console.log('  Card games will not be available...');
      }
    } catch (error) {
      console.warn('⚠️  Game completion handler failed:', error.message);
      console.log('  Card games will work but without feedback loop...');
    }
  } catch (error) {
    console.error('⚠️  CringeProof initialization failed:', error.message);
    console.log('  Continuing without emoji vibe checker...');
  }

  // Initialize Model Discovery Service
  if (db) {
    try {
      modelDiscovery = new ModelDiscoveryService({ db });
      // Run initial discovery (non-blocking)
      modelDiscovery.discover().catch(err => {
        console.warn('⚠️  Initial model discovery failed:', err.message);
      });
      console.log('✓ Model Discovery Service initialized');
    } catch (error) {
      console.error('⚠️  Model Discovery Service failed to initialize:', error.message);
    }
  }

  // Initialize learning system
  try {
    await voiceTranscriber.initialize();
    await learningLoop.initialize();
  } catch (error) {
    console.error('⚠️  Learning system initialization failed:', error.message);
    console.error('   Voice transcription and learning loop will be unavailable');
  }

  // Initialize mobile routes (Cal's graceful degradation - works with or without database)
  mobileRoutes = initMobileRoutes(db); // db might be null, ragebait still works
  app.use('/api/mobile', mobileRoutes);
  app.use('/api/network', mobileRoutes);
  if (db) {
    console.log('✓ Mobile Drive-Thru initialized (full features)');
  } else {
    console.log('✓ Mobile Drive-Thru initialized (API mode - ragebait available)');
  }

  // Initialize price worker in local mode
  if (localMode && db) {
    try {
      const priceWorker = new PriceWorker({ db });
      priceWorker.start();
      console.log('✓ Price worker started - automatic price fetching enabled');

      // Store reference globally for management
      global.priceWorker = priceWorker;

      // Initialize ModelClarityEngine with PriceWorker for crypto/stock correlations
      if (modelClarityEngine === null) {
        modelClarityEngine = new ModelClarityEngine({
          db,
          pricingSource: priceWorker, // For crypto/stock price correlations
          cacheTTL: 3600000 // 1 hour cache
        });
        console.log('✓ ModelClarityEngine initialized (real-time pricing + crypto correlations)');

        // Make available to routes
        app.locals.modelClarityEngine = modelClarityEngine;
      }
    } catch (error) {
      console.error('⚠️  Price worker initialization failed:', error.message);
      console.error('   Automatic price fetching will be unavailable');
    }

    // Initialize scheduler for automated data processing
    try {
      const scheduler = new Scheduler({
        errorHandler: (taskName, error) => {
          console.error(`[Scheduler] Task "${taskName}" failed:`, error.message);
        }
      });

      // Helper to run scripts
      const runScript = (scriptName, args = '') => {
        return new Promise((resolve, reject) => {
          const cmd = `DB_USER=${process.env.DB_USER || process.env.USER} node scripts/${scriptName} ${args}`;
          exec(cmd, { cwd: __dirname }, (error, stdout, stderr) => {
            if (error) {
              console.error(`[Scheduler] ${scriptName} error:`, stderr);
              reject(error);
            } else {
              console.log(`[Scheduler] ${scriptName} output:`, stdout);
              resolve(stdout);
            }
          });
        });
      };

      // Schedule: Compute 5-minute candles every 5 minutes
      scheduler.schedule('compute-candles-5m', async () => {
        console.log('[Scheduler] Computing 5-minute candles...');
        await runScript('compute-candles.js', '--timeframe 5m --from "1 hour ago"');
      }, {
        interval: 5 * 60 * 1000, // 5 minutes
        runImmediately: false
      });

      // Schedule: Compute hourly candles every hour
      scheduler.schedule('compute-candles-1h', async () => {
        console.log('[Scheduler] Computing hourly candles...');
        await runScript('compute-candles.js', '--timeframe 1h --from "2 days ago"');
      }, {
        interval: 60 * 60 * 1000, // 1 hour
        runImmediately: false
      });

      // Schedule: Compute daily candles at midnight
      scheduler.schedule('compute-candles-daily', async () => {
        console.log('[Scheduler] Computing daily candles...');
        await runScript('compute-candles.js', '--timeframe 1d --from "30 days ago"');
      }, {
        interval: 24 * 60 * 60 * 1000, // 24 hours
        runImmediately: false
      });

      // Schedule: Clean old cache every 6 hours
      scheduler.schedule('clean-cache', async () => {
        console.log('[Scheduler] Cleaning old price cache...');
        await db.query('SELECT clean_old_price_cache()');
        console.log('[Scheduler] Cache cleaned');
      }, {
        interval: 6 * 60 * 60 * 1000, // 6 hours
        runImmediately: false
      });

      // Schedule: Clean old scheduler logs every 24 hours
      scheduler.schedule('clean-scheduler-logs', async () => {
        console.log('[Scheduler] Cleaning old scheduler logs...');
        await db.query('SELECT clean_old_scheduler_logs()');
        console.log('[Scheduler] Scheduler logs cleaned');
      }, {
        interval: 24 * 60 * 60 * 1000, // 24 hours
        runImmediately: false
      });

      // Schedule: Clean stale sessions every 30 minutes
      scheduler.schedule('clean-stale-sessions', async () => {
        if (sessionTracker) {
          console.log('[Scheduler] Cleaning stale sessions...');
          const cleaned = await sessionTracker.cleanupStaleSessions();
          console.log(`[Scheduler] Cleaned ${cleaned} stale sessions`);
        }
      }, {
        interval: 30 * 60 * 1000, // 30 minutes
        runImmediately: false
      });

      // Start the scheduler
      scheduler.start();
      console.log('✓ Scheduler started - automated data processing enabled');
      console.log('  • 5-minute candles: every 5 minutes');
      console.log('  • Hourly candles: every hour');
      console.log('  • Daily candles: every 24 hours');
      console.log('  • Cache cleanup: every 6 hours');
      console.log('  • Log cleanup: every 24 hours');
      console.log('  • Stale session cleanup: every 30 minutes');

      // Store reference globally for management
      global.scheduler = scheduler;
    } catch (error) {
      console.error('⚠️  Scheduler initialization failed:', error.message);
      console.error('   Automated data processing will be unavailable');
    }
  }
})();

// WebSocket connections
const clients = new Set();
const clientRooms = new Map(); // ws -> Set of room names

wss.on('connection', (ws) => {
  clients.add(ws);
  clientRooms.set(ws, new Set());

  // Store client metadata
  ws.sessionId = null;
  ws.deviceId = null;
  ws.rooms = clientRooms.get(ws);

  console.log('✓ Client connected via WebSocket');

  ws.send(JSON.stringify({
    type: 'connection',
    message: 'Connected to CalOS Agent Router',
    timestamp: new Date().toISOString()
  }));

  // Broadcast updated online count to all clients
  broadcast({
    type: 'online_users',
    count: clients.size
  });

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);

      // Add timestamp if not present
      if (!message.timestamp) {
        message.timestamp = new Date().toISOString();
      }

      // Handle different message types
      switch (message.type) {
        case 'chat':
          // User chat message
          broadcast({
            type: 'chat',
            user: message.user || 'User',
            message: message.message,
            timestamp: message.timestamp
          });
          break;

        case 'agent_response':
          // Agent response to chat
          broadcast({
            type: 'agent_response',
            agent: message.agent,
            message: message.message,
            timestamp: message.timestamp
          });
          break;

        case 'church':
          // Church mode: all agents respond to same message
          broadcast({
            type: 'church',
            message: message.message,
            agents: message.agents || [],
            timestamp: message.timestamp
          });
          break;

        case 'system':
          // System events (ollama started, etc)
          broadcast({
            type: 'system',
            event: message.event,
            message: message.message,
            timestamp: message.timestamp
          });
          break;

        case 'archive':
          // Archive session to Messages sidebar
          broadcast({
            type: 'archive',
            sessionId: message.sessionId,
            messages: message.messages,
            timestamp: message.timestamp
          });
          break;

        case 'ping':
          // Ping/pong for keepalive
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;

        case 'start_session':
          // Start session tracking
          if (sessionTracker && message.deviceId) {
            const sessionId = sessionTracker.startSession(
              message.deviceId,
              message.userId || null,
              message.page || 'unknown',
              {
                userAgent: message.userAgent,
                referrer: message.referrer,
                ip: message.ip
              }
            );
            ws.sessionId = sessionId;
            ws.deviceId = message.deviceId;
            ws.send(JSON.stringify({
              type: 'session_started',
              sessionId,
              timestamp: new Date().toISOString()
            }));
          }
          break;

        case 'join_room':
          // Join a room (e.g., lofi-stream)
          if (message.room) {
            ws.rooms.add(message.room);

            // Track in session tracker
            if (sessionTracker && ws.sessionId) {
              const result = sessionTracker.joinRoom(ws.sessionId, message.room);

              // Broadcast updated viewer count to room
              broadcastToRoom(message.room, {
                type: 'room_viewers',
                room: message.room,
                count: sessionTracker.getRoomCount(message.room)
              });

              // Update database
              if (db) {
                db.query('SELECT update_room_viewers($1, $2)', [
                  message.room,
                  sessionTracker.getRoomCount(message.room)
                ]).catch(err => console.error('Error updating room viewers:', err));
              }
            }

            ws.send(JSON.stringify({
              type: 'room_joined',
              room: message.room,
              timestamp: new Date().toISOString()
            }));
          }
          break;

        case 'leave_room':
          // Leave a room
          if (message.room && ws.rooms.has(message.room)) {
            ws.rooms.delete(message.room);

            // Track in session tracker
            if (sessionTracker && ws.sessionId) {
              sessionTracker.leaveRoom(ws.sessionId);

              // Broadcast updated viewer count to room
              broadcastToRoom(message.room, {
                type: 'room_viewers',
                room: message.room,
                count: sessionTracker.getRoomCount(message.room)
              });

              // Update database
              if (db) {
                db.query('SELECT update_room_viewers($1, $2)', [
                  message.room,
                  sessionTracker.getRoomCount(message.room)
                ]).catch(err => console.error('Error updating room viewers:', err));
              }
            }

            ws.send(JSON.stringify({
              type: 'room_left',
              room: message.room,
              timestamp: new Date().toISOString()
            }));
          }
          break;

        case 'heartbeat':
          // Update activity
          if (sessionTracker && ws.sessionId) {
            sessionTracker.updateActivity(ws.sessionId);
          }
          ws.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: new Date().toISOString() }));
          break;

        // Builder system messages
        case 'builder_terminal':
        case 'builder_task_update':
        case 'builder_file_written':
        case 'builder_test_result':
        case 'builder_progress':
          // Echo builder messages to all connected builder clients
          // (Future: room-based isolation per project)
          broadcast({
            type: message.type,
            ...message
          });
          break;

        // Workspace collaboration messages
        case 'workspace_create':
        case 'workspace_join':
        case 'workspace_leave':
        case 'file_update':
        case 'cursor_update':
        case 'file_lock':
        case 'file_unlock':
        case 'git_command':
        case 'terminal_command':
        case 'chat_message':
        case 'voice_toggle':
          // Route to workspace handler
          if (workspaceHandler) {
            workspaceHandler.handleMessage(ws, JSON.stringify(message));
          } else {
            console.warn('[WebSocket] Workspace handler not initialized');
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Workspace system not available',
              timestamp: new Date().toISOString()
            }));
          }
          break;

        // Card game messages (Battle.net style multiplayer)
        case 'game_create':
        case 'game_join':
        case 'game_start':
        case 'game_play_card':
        case 'game_draw_card':
        case 'game_judge_vote':
        case 'game_leave':
        case 'bot_spawn':
        case 'spectator_join':
          // Route to card game handler
          if (app.get('cardGameWSHandler')) {
            await app.get('cardGameWSHandler').handleMessage(ws, data);
          } else {
            console.warn('[WebSocket] Card game handler not initialized');
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Card game system not available',
              timestamp: new Date().toISOString()
            }));
          }
          break;

        default:
          console.log(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
        timestamp: new Date().toISOString()
      }));
    }
  });

  ws.on('close', async () => {
    // End session tracking
    if (sessionTracker && ws.sessionId) {
      const roomsToNotify = Array.from(ws.rooms);

      await sessionTracker.endSession(ws.sessionId);

      // Notify rooms of updated viewer counts
      for (const room of roomsToNotify) {
        broadcastToRoom(room, {
          type: 'room_viewers',
          room,
          count: sessionTracker.getRoomCount(room)
        });

        // Update database
        if (db) {
          db.query('SELECT update_room_viewers($1, $2)', [
            room,
            sessionTracker.getRoomCount(room)
          ]).catch(err => console.error('Error updating room viewers:', err));
        }
      }
    }

    clients.delete(ws);
    clientRooms.delete(ws);
    console.log('✗ Client disconnected');

    // Broadcast updated online count to remaining clients
    broadcast({
      type: 'online_users',
      count: clients.size
    });
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Broadcast to all connected WebSocket clients
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Broadcast to clients in a specific room
function broadcastToRoom(roomName, data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.rooms && client.rooms.has(roomName)) {
      client.send(message);
    }
  });
}

/**
 * Model Discovery API Routes
 */

// Trigger model discovery refresh
app.post('/api/models/discover', async (req, res) => {
  try {
    if (!modelDiscovery) {
      return res.status(503).json({
        status: 'error',
        message: 'Model Discovery Service not available'
      });
    }

    const results = await modelDiscovery.discover();

    res.json({
      status: 'ok',
      discovery: results
    });
  } catch (error) {
    console.error('Model discovery failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get discovered models
app.get('/api/models/discovered', async (req, res) => {
  try {
    if (!modelDiscovery) {
      return res.status(503).json({
        status: 'error',
        message: 'Model Discovery Service not available'
      });
    }

    const { provider, family, capabilities, limit } = req.query;

    const options = {
      provider,
      family,
      capabilities: capabilities ? JSON.parse(capabilities) : undefined,
      limit: limit ? parseInt(limit) : 1000
    };

    const models = await modelDiscovery.getCachedModels(options);

    res.json({
      status: 'ok',
      count: models.length,
      models
    });
  } catch (error) {
    console.error('Failed to get discovered models:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get discovery stats
app.get('/api/models/stats', (req, res) => {
  try {
    if (!modelDiscovery) {
      return res.status(503).json({
        status: 'error',
        message: 'Model Discovery Service not available'
      });
    }

    const stats = modelDiscovery.getStats();

    res.json({
      status: 'ok',
      stats
    });
  } catch (error) {
    console.error('Failed to get discovery stats:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENGINEERING CARD GENERATION API - Cal AI integration
// ═══════════════════════════════════════════════════════════════════════════

// Generate engineering cards from a codebase
app.post('/api/cards/generate', async (req, res) => {
  try {
    const engineeringCardGenerator = app.get('engineeringCardGenerator');

    if (!engineeringCardGenerator) {
      return res.status(503).json({
        status: 'error',
        message: 'Engineering Card Generator not available'
      });
    }

    const {
      projectPath = process.cwd(),
      packId,
      packName,
      maxFiles = 30,
      useAI = false
    } = req.body;

    console.log(`[API] Generating cards from: ${projectPath}`);

    // Generate cards
    const cards = useAI
      ? await engineeringCardGenerator.generateWithAI(projectPath, { maxFiles })
      : await engineeringCardGenerator.generateFromCodebase(projectPath, { maxFiles });

    // Create culture pack
    const pack = await engineeringCardGenerator.createCulturePack(cards, packId, {
      name: packName || `${packId} Engineering Pack`,
      description: `Generated from ${projectPath}`,
      emoji: '🤖',
      controversial: true,
      teachingTool: true
    });

    // Reload culture packs to include new pack
    const culturePackManager = app.get('culturePackManager');
    if (culturePackManager) {
      await culturePackManager.loadPacks();
    }

    res.json({
      status: 'ok',
      pack,
      cards: cards.length,
      message: `Generated ${cards.length} cards from ${projectPath}`
    });
  } catch (error) {
    console.error('Card generation failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get available culture packs
app.get('/api/cards/packs', (req, res) => {
  try {
    const culturePackManager = app.get('culturePackManager');

    if (!culturePackManager) {
      return res.status(503).json({
        status: 'error',
        message: 'Culture Pack Manager not available'
      });
    }

    const packs = Array.from(culturePackManager.packs.values()).map(pack => ({
      packId: pack.packId,
      name: pack.name,
      description: pack.description,
      emoji: pack.emoji,
      rarity: pack.rarity,
      controversial: pack.controversial,
      teachingTool: pack.teachingTool,
      tags: pack.tags,
      promptCount: pack.prompts?.length || 0,
      responseCount: pack.responses?.length || 0
    }));

    res.json({
      status: 'ok',
      packs,
      total: packs.length,
      activeRotation: culturePackManager.activeRotation
    });
  } catch (error) {
    console.error('Failed to get culture packs:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get a specific culture pack
app.get('/api/cards/packs/:packId', (req, res) => {
  try {
    const culturePackManager = app.get('culturePackManager');

    if (!culturePackManager) {
      return res.status(503).json({
        status: 'error',
        message: 'Culture Pack Manager not available'
      });
    }

    const pack = culturePackManager.getPack(req.params.packId);

    if (!pack) {
      return res.status(404).json({
        status: 'error',
        message: `Pack not found: ${req.params.packId}`
      });
    }

    res.json({
      status: 'ok',
      pack
    });
  } catch (error) {
    console.error('Failed to get culture pack:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Reload culture packs (after adding new ones)
app.post('/api/cards/packs/reload', async (req, res) => {
  try {
    const culturePackManager = app.get('culturePackManager');

    if (!culturePackManager) {
      return res.status(503).json({
        status: 'error',
        message: 'Culture Pack Manager not available'
      });
    }

    await culturePackManager.loadPacks();

    res.json({
      status: 'ok',
      packsLoaded: culturePackManager.packs.size,
      activeRotation: culturePackManager.activeRotation,
      message: 'Culture packs reloaded successfully'
    });
  } catch (error) {
    console.error('Failed to reload culture packs:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  // Check if API keys are configured
  let keysConfigured = false;
  let providers = {};

  try {
    // Check .env keys first
    const requiredProviders = ['openai', 'anthropic'];
    for (const provider of requiredProviders) {
      const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
      providers[provider] = !!(envKey && envKey.length > 0);
      if (providers[provider]) {
        keysConfigured = true;
      }
    }

    // If no env keys, check keyring/database
    if (!keysConfigured && keyring && db) {
      for (const provider of requiredProviders) {
        try {
          const key = await keyring.getCredential(provider, 'api_key', 'system');
          providers[provider] = !!key;
          if (key) {
            keysConfigured = true;
          }
        } catch (err) {
          // Key not found, keep as false
        }
      }
    }
  } catch (error) {
    // Error checking keys - treat as not configured
    console.error('Error checking key configuration:', error);
  }

  res.json({
    status: 'ok',
    service: 'CalOS Agent Router',
    uptime: process.uptime(),
    clients: clients.size,
    timestamp: new Date().toISOString(),
    keysConfigured,
    providers
  });
});

// ============================================================================
// Database Query Endpoints
// ============================================================================

/**
 * GET /api/user-sessions
 * Query user_sessions table from PostgreSQL
 */
app.get('/api/user-sessions', async (req, res) => {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/calos'
    });

    const result = await pool.query(`
      SELECT user_id, email, role, created_at, ip
      FROM user_sessions
      ORDER BY created_at DESC
      LIMIT 100
    `);

    await pool.end();

    res.json({
      sessions: result.rows,
      count: result.rowCount
    });

  } catch (error) {
    console.error('[User Sessions] Error:', error);
    res.status(500).json({
      error: 'Failed to query user sessions',
      message: error.message
    });
  }
});

/**
 * GET /api/conversations
 * Query conversations table from PostgreSQL
 */
app.get('/api/conversations', async (req, res) => {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/calos'
    });

    const result = await pool.query(`
      SELECT conversation_id, user_id, message_count, created_at, updated_at
      FROM conversations
      ORDER BY updated_at DESC
      LIMIT 100
    `);

    await pool.end();

    res.json({
      conversations: result.rows,
      count: result.rowCount
    });

  } catch (error) {
    console.error('[Conversations] Error:', error);
    res.status(500).json({
      error: 'Failed to query conversations',
      message: error.message
    });
  }
});

/**
 * GET /api/env-info
 * Get environment info (which .env is active, which keys are set)
 */
app.get('/api/env-info', (req, res) => {
  try {
    res.json({
      env: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ? true : false,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? true : false,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ? true : false,
        DATABASE_URL: process.env.DATABASE_URL ? true : false,
        PORT: process.env.PORT || 5001
      },
      platform: process.platform,
      nodeVersion: process.version,
      cwd: process.cwd()
    });
  } catch (error) {
    console.error('[Env Info] Error:', error);
    res.status(500).json({
      error: 'Failed to get env info',
      message: error.message
    });
  }
});

// ============================================================================
// QR Code & Network Access Endpoints
// ============================================================================

/**
 * GET /api/qr-code
 * Generate QR code for mobile access
 * Query params:
 *   - path: URL path to encode (default: "/oauth-upload.html")
 *   - format: "png" or "terminal" (default: "png")
 */
app.get('/api/qr-code', async (req, res) => {
  try {
    const { path = '/oauth-upload.html', format = 'png' } = req.query;

    const qrGen = new QRGenerator({
      port: PORT,
      serviceName: 'CalOS OAuth'
    });

    const url = qrGen.generateLocalURL(path);

    if (format === 'terminal') {
      const qrCode = await qrGen.generateTerminal(url);
      res.type('text/plain').send(qrCode);
    } else {
      // PNG format
      const qrBuffer = await qrGen.generateQRBuffer(url, {
        width: 400,
        errorCorrectionLevel: 'M'
      });
      res.type('image/png').send(qrBuffer);
    }
  } catch (error) {
    console.error('[QR Code] Error generating QR code:', error);
    res.status(500).json({
      error: 'Failed to generate QR code',
      message: error.message
    });
  }
});

/**
 * GET /api/network-info
 * Get local network information (IP, timestamp, etc.)
 * Used by LocalNetworkDetector for device pairing
 */
app.get('/api/network-info', async (req, res) => {
  try {
    const LocalNetworkDetector = require('./lib/local-network-detector');
    const detector = new LocalNetworkDetector();
    const info = await detector.detect();

    res.json(info);
  } catch (error) {
    console.error('[Network Info] Error:', error);
    res.status(500).json({
      error: 'Failed to get network info',
      message: error.message
    });
  }
});

/**
 * GET /api/apps
 * Auto-discover all available HTML applications
 *
 * Returns JSON list of all apps with:
 * - name: Human-readable name
 * - slug: URL-friendly name
 * - url: Full .html URL
 * - cleanUrl: Clean URL without .html
 * - category: Auto-detected category
 */
app.get('/api/apps', (req, res) => {
  try {
    const publicDir = path.join(__dirname, 'public');
    const htmlFiles = fs.readdirSync(publicDir)
      .filter(f => f.endsWith('.html') && !f.startsWith('index'));

    // Categorize apps based on name patterns
    const categorizeApp = (filename) => {
      const lower = filename.toLowerCase();
      if (lower.includes('dashboard') || lower.includes('admin') || lower.includes('enterprise')) return 'dashboard';
      if (lower.includes('oauth') || lower.includes('login') || lower.includes('auth')) return 'auth';
      if (lower.includes('chat') || lower.includes('builder') || lower.includes('hub')) return 'tools';
      if (lower.includes('pricing') || lower.includes('calculator')) return 'business';
      if (lower.includes('os') || lower.includes('vault')) return 'platform';
      return 'other';
    };

    const apps = htmlFiles.map(f => {
      const slug = f.replace('.html', '');
      const name = slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      return {
        name,
        slug,
        url: `/${f}`,
        cleanUrl: `/${slug}`,
        category: categorizeApp(f)
      };
    });

    // Sort by category, then name
    apps.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });

    res.json({
      success: true,
      total: apps.length,
      apps,
      categories: {
        platform: apps.filter(a => a.category === 'platform').length,
        dashboard: apps.filter(a => a.category === 'dashboard').length,
        tools: apps.filter(a => a.category === 'tools').length,
        business: apps.filter(a => a.category === 'business').length,
        auth: apps.filter(a => a.category === 'auth').length,
        other: apps.filter(a => a.category === 'other').length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to discover apps',
      message: error.message
    });
  }
});

/**
 * GET /api/network/domains.json
 * Raw API of all domains/subdomains across the 12-brand network
 * (Like is-a.dev's v2.json)
 *
 * Returns array of domain records with owner info and DNS records
 */
app.get('/api/network/domains.json', async (req, res) => {
  try {
    const domains = [];

    // Add main 12 brands
    Object.entries(brandOrchestrator.brands).forEach(([domain, config]) => {
      domains.push({
        domain,
        subdomain: null, // Main domain, no subdomain
        owner: {
          username: 'soulfra',
          github: 'soulfra',
          discord: '830872854677422150' // placeholder
        },
        parent: null,
        brand: {
          name: config.name,
          tagline: config.tagline,
          tier: config.tier,
          launchOrder: config.launchOrder
        },
        records: {
          // Placeholder DNS - in production, pull from real DNS config
          CNAME: `${domain}`
        },
        discordInvite: `/discord/${domain.replace('.com', '')}`,
        status: brandOrchestrator.launchStatus.get(domain)?.status || 'pending',
        createdAt: '2025-01-15T00:00:00Z'
      });
    });

    // Add user subdomains from registry
    try {
      const { registry } = require('./routes/subdomain-registry-routes');
      const result = await registry.getAllSubdomains({ status: 'active' });

      if (result.success && result.subdomains) {
        result.subdomains.forEach(sub => {
          domains.push({
            domain: sub.fullDomain,
            subdomain: sub.subdomain,
            owner: {
              username: sub.owner.username,
              github: sub.owner.github,
              discord: sub.owner.discord,
              email: sub.owner.email
            },
            parent: sub.parentDomain,
            brand: null, // User subdomain, not a brand
            records: sub.records,
            metadata: sub.metadata,
            status: sub.status,
            createdAt: sub.createdAt
          });
        });
      }
    } catch (subErr) {
      console.error('[NetworkDomains] Error loading subdomains:', subErr.message);
      // Continue without subdomains if registry not ready
    }

    res.json(domains);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get network domains',
      message: error.message
    });
  }
});

/**
 * GET /api/network/discord/random
 * Get random Discord invite(s) for cross-promotion
 *
 * Query params:
 * - count: Number of invites to return (default: 1)
 * - currentBrand: Current brand domain to exclude (optional)
 */
const DiscordInviteRotator = require('./lib/discord-invite-rotator');
const discordRotator = new DiscordInviteRotator();

app.get('/api/network/discord/random', (req, res) => {
  try {
    const count = parseInt(req.query.count) || 1;
    const currentBrand = req.query.currentBrand || null;

    const invites = discordRotator.getRandomInvite({
      currentBrand,
      count: Math.min(count, 5) // Max 5 invites
    });

    res.json({
      success: true,
      invites: Array.isArray(invites) ? invites : [invites],
      total: Array.isArray(invites) ? invites.length : 1
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get Discord invites',
      message: error.message
    });
  }
});

/**
 * GET /api/network/discord/all
 * Get all Discord invites
 */
app.get('/api/network/discord/all', (req, res) => {
  try {
    const invites = discordRotator.getAllInvites();

    res.json({
      success: true,
      invites,
      total: invites.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get Discord invites',
      message: error.message
    });
  }
});

/**
 * POST /api/network/discord/track-click
 * Track Discord invite click
 *
 * Body: { domain: "soulfra.com", trackingId: "..." }
 */
app.post('/api/network/discord/track-click', (req, res) => {
  try {
    const { domain, trackingId } = req.body;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'domain required'
      });
    }

    const result = discordRotator.trackClick(domain, trackingId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to track click',
      message: error.message
    });
  }
});

/**
 * GET /api/network/discord/analytics
 * Get Discord invite analytics
 */
app.get('/api/network/discord/analytics', (req, res) => {
  try {
    const analytics = discordRotator.getAnalytics();
    res.json(analytics);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics',
      message: error.message
    });
  }
});

/**
 * Brand A/B Router Endpoints
 * Random routing for A/B testing conversion rates
 */
const BrandABRouter = require('./lib/brand-ab-router');
const brandRouter = new BrandABRouter();

/**
 * GET /api/network/route-random
 * Route user to random brand for A/B testing
 *
 * Query params:
 * - sessionId: Existing session ID (optional)
 * - referer: Where user came from (optional)
 */
app.get('/api/network/route-random', (req, res) => {
  try {
    const { sessionId, referer } = req.query;

    const result = brandRouter.route({ sessionId, referer });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to route user',
      message: error.message
    });
  }
});

/**
 * POST /api/network/track-conversion
 * Track A/B test conversion
 *
 * Body: { sessionId: "...", conversionData: {...} }
 */
app.post('/api/network/track-conversion', (req, res) => {
  try {
    const { sessionId, conversionData } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId required'
      });
    }

    const result = brandRouter.trackConversion(sessionId, conversionData);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to track conversion',
      message: error.message
    });
  }
});

/**
 * POST /api/network/track-bounce
 * Track user bounce (left without converting)
 *
 * Body: { sessionId: "...", timeOnSite: 120 }
 */
app.post('/api/network/track-bounce', (req, res) => {
  try {
    const { sessionId, timeOnSite } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId required'
      });
    }

    const result = brandRouter.trackBounce(sessionId, timeOnSite);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to track bounce',
      message: error.message
    });
  }
});

/**
 * GET /api/network/ab-test/analytics
 * Get A/B test analytics
 */
app.get('/api/network/ab-test/analytics', (req, res) => {
  try {
    const analytics = brandRouter.getAnalytics();
    res.json(analytics);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics',
      message: error.message
    });
  }
});

/**
 * GET /api/network/ab-test/results
 * Get A/B test results with winner
 */
app.get('/api/network/ab-test/results', (req, res) => {
  try {
    const results = brandRouter.getABTestResults();
    res.json(results);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get results',
      message: error.message
    });
  }
});

/**
 * GET /api/billiondollargame/status
 * Get the current status of all 12 brands in the BillionDollarGame
 *
 * Returns:
 * - userId: The founder (User #1)
 * - startDate: When the project started
 * - currentDay: Days since project start
 * - brandsLaunched: Number of brands completed
 * - totalBrands: Total number of brands (12)
 * - brands: Array of brand objects with status
 * - totalFunding: Current crowdfunding total
 */
app.get('/api/billiondollargame/status', (req, res) => {
  try {
    const status = brandOrchestrator.getStatus();

    // Add brand details from config
    const enrichedBrands = status.brands.map(brand => {
      const domain = brand.domain;
      const config = brandOrchestrator.brands[domain];

      return {
        ...brand,
        tagline: config.tagline,
        tier: config.tier,
        type: config.type,
        tools: config.tools,
        aiModels: config.aiModels,
        colors: config.colors,
        features: config.features,
        revenue: config.revenue
      };
    });

    res.json({
      ...status,
      brands: enrichedBrands,
      totalFunding: 0 // TODO: Wire to crowdfund-bounty-system when created
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get BillionDollarGame status',
      message: error.message
    });
  }
});

/**
 * GET /api/network-info
 * Get network access information
 */
app.get('/api/network-info', (req, res) => {
  try {
    const qrGen = new QRGenerator({
      port: PORT,
      serviceName: 'CalOS Router'
    });

    const serviceInfo = qrGen.getServiceInfo('/oauth-upload.html');

    res.json({
      ...serviceInfo,
      endpoints: {
        oauth: qrGen.generateLocalURL('/oauth-upload.html'),
        health: qrGen.generateLocalURL('/health'),
        qrCode: qrGen.generateLocalURL('/api/qr-code')
      }
    });
  } catch (error) {
    console.error('[Network Info] Error:', error);
    res.status(500).json({
      error: 'Failed to get network info',
      message: error.message
    });
  }
});

// Keyring status endpoint
app.get('/api/keyring/status', async (req, res) => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      mode: db ? 'database' : 'api-only',
      ollama: {
        available: false,
        models: 0
      },
      environmentKeys: {
        openai: !!process.env.OPENAI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        github: !!process.env.GITHUB_TOKEN
      },
      keyring: {
        available: !!keyring,
        systemKeychain: false,
        credentials: []
      }
    };

    // Check Ollama
    const ollamaAvailable = await checkOllamaAvailability();
    if (ollamaAvailable) {
      status.ollama.available = true;
      status.ollama.models = 22; // We know from startup there are 22 models
    }

    // Check keyring credentials
    if (keyring && db) {
      status.keyring.systemKeychain = keyring.useSystemKeychain || false;

      const providers = ['openai', 'anthropic', 'github', 'stripe'];
      for (const provider of providers) {
        try {
          const key = await keyring.getCredential(provider, 'api_key', 'system');
          if (key) {
            status.keyring.credentials.push({
              service: provider,
              type: 'api_key',
              stored: true,
              preview: key.substring(0, 8) + '...'
            });
          }
        } catch (err) {
          // Credential not found
        }
      }
    }

    res.json(status);
  } catch (error) {
    console.error('[Keyring Status] Error:', error);
    res.status(500).json({
      error: 'Failed to get keyring status',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {}
  };

  try {
    // Check database
    if (db) {
      try {
        await db.query('SELECT 1');
        health.services.database = { status: 'ok', type: 'postgres' };
      } catch (error) {
        health.services.database = { status: 'error', error: error.message };
        health.status = 'degraded';
      }
    } else {
      health.services.database = { status: 'disabled', message: 'Running in API mode' };
    }

    // Check Meta-Orchestrator
    if (app.locals.metaOrchestrator) {
      health.services.metaOrchestrator = {
        status: app.locals.metaOrchestrator.isRunning ? 'running' : 'stopped',
        cycle: app.locals.metaOrchestrator.currentCycle || 0,
        tier: app.locals.metaOrchestrator.currentTier || 1
      };
    }

    // Check Guardian
    if (app.locals.guardian) {
      health.services.guardian = { status: 'initialized' };
    }

    // Check CalLearningLoop
    if (app.locals.calLoop) {
      health.services.calLoop = { status: 'initialized' };
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    health.memory = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024)
    };

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Detailed health check endpoint
app.get('/api/health/detailed', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('./package.json').version,
    node: process.version,
    services: {},
    database: {},
    system: {}
  };

  try {
    // Database checks
    if (db) {
      try {
        // Connection test
        await db.query('SELECT NOW()');
        health.services.database = { status: 'ok', type: 'postgres' };

        // Table checks
        const tableResult = await db.query(`
          SELECT COUNT(*) as count
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name IN ('user_tree_progress', 'tree_node_completions', 'learning_paths')
        `);
        health.database.criticalTables = parseInt(tableResult.rows[0].count) === 3 ? 'ok' : 'missing';

        // Migration count
        const migrationResult = await db.query('SELECT COUNT(*) as count FROM migration_history WHERE success = TRUE');
        health.database.migrations = parseInt(migrationResult.rows[0].count);
      } catch (error) {
        health.services.database = { status: 'error', error: error.message };
        health.status = 'degraded';
      }
    }

    // Service checks
    const services = ['metaOrchestrator', 'guardian', 'calLoop', 'studentLauncher', 'forumMonitor', 'agentMesh'];
    for (const service of services) {
      if (app.locals[service]) {
        health.services[service] = {
          status: 'initialized',
          running: app.locals[service].isRunning || null
        };
      }
    }

    // System info
    health.system = {
      platform: process.platform,
      arch: process.arch,
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB'
      },
      cpu: process.cpuUsage()
    };

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Message storage and verification endpoints
const MessageStore = require('./lib/message-store');
const messageStore = new MessageStore();

// Safe utility classes (no process spawning)
const CryptoUtils = require('./lib/crypto-utils');
const TextUtils = require('./lib/text-utils');
const DataUtils = require('./lib/data-utils');
const cryptoUtils = new CryptoUtils();
const textUtils = new TextUtils();
const dataUtils = new DataUtils();

// Store message to database
app.post('/api/message', async (req, res) => {
  try {
    const { sessionId, type, user, agent, message, timestamp, metadata } = req.body;

    if (!type || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'type and message are required'
      });
    }

    const stored = await messageStore.store({
      sessionId,
      type,
      user,
      agent,
      message,
      timestamp,
      metadata
    });

    // Broadcast to WebSocket clients
    broadcast({
      type: 'message_stored',
      data: stored
    });

    res.json({
      status: 'stored',
      id: stored.id,
      hash: stored.hash,
      formattedHtml: stored.formattedHtml
    });
  } catch (error) {
    console.error('Failed to store message:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Verify message storage
app.get('/api/verify', async (req, res) => {
  try {
    const { sessionId } = req.query;

    const verification = await messageStore.verify(sessionId || null);

    res.json({
      status: 'ok',
      verified: verification.verified,
      sessions: verification.sessions,
      totalMessages: verification.totalMessages,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Verification failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get messages for a session
app.get('/api/messages/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 100 } = req.query;

    const messages = await messageStore.getMessages(sessionId, parseInt(limit));

    res.json({
      status: 'ok',
      sessionId,
      messages,
      count: messages.length
    });
  } catch (error) {
    console.error('Failed to get messages:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get message hashes for verification
app.get('/api/hashes/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const hashes = await messageStore.getHashes(sessionId);

    res.json({
      status: 'ok',
      sessionId,
      hashes,
      count: hashes.length
    });
  } catch (error) {
    console.error('Failed to get hashes:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Code Playground endpoints
const SandboxExecutor = require('./lib/sandbox-executor');
const sandboxExecutor = new SandboxExecutor();

// Execute code in sandbox
app.post('/api/playground/execute', async (req, res) => {
  try {
    const { code, language, sessionId, args = [] } = req.body;

    if (!code) {
      return res.status(400).json({
        status: 'error',
        message: 'code is required'
      });
    }

    if (!language) {
      return res.status(400).json({
        status: 'error',
        message: 'language is required'
      });
    }

    // Check if language is supported
    if (!sandboxExecutor.isSupported(language)) {
      return res.status(400).json({
        status: 'error',
        message: `Unsupported language: ${language}`,
        supported: sandboxExecutor.getSupportedLanguages()
      });
    }

    // Execute code
    const result = await sandboxExecutor.execute({
      code,
      language,
      args
    });

    // Store execution to database
    await messageStore.store({
      sessionId: sessionId || 'playground',
      type: 'code_execution',
      message: code,
      timestamp: new Date().toISOString(),
      metadata: {
        language,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: result.duration,
        success: result.success
      }
    });

    // Broadcast to WebSocket clients
    broadcast({
      type: 'code_execution',
      data: {
        code,
        language,
        ...result
      }
    });

    res.json({
      status: 'ok',
      ...result
    });
  } catch (error) {
    console.error('Failed to execute code:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get supported languages
app.get('/api/playground/languages', (req, res) => {
  res.json({
    status: 'ok',
    languages: sandboxExecutor.getSupportedLanguages()
  });
});

// Verification statistics endpoint
app.get('/api/verification-stats', async (req, res) => {
  try {
    if (!db || !localMode) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Verification stats require --local mode with database'
      });
    }

    // Overall stats
    const overallStats = await db.query(`
      SELECT
        COUNT(*) as total_queries,
        COUNT(latency_ms) as queries_with_timing,
        COUNT(*) FILTER (WHERE cache_hit) as cache_hits,
        ROUND(100.0 * COUNT(*) FILTER (WHERE cache_hit) / NULLIF(COUNT(*), 0), 2) as cache_hit_rate
      FROM ai_responses
    `);

    // Latency stats
    const latencyStats = await db.query(`
      SELECT
        ROUND(AVG(latency_ms)::numeric, 2) as avg_latency,
        MIN(latency_ms) as min_latency,
        MAX(latency_ms) as max_latency,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) as p50_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99_latency
      FROM ai_responses
      WHERE latency_ms IS NOT NULL
    `);

    // Cache performance
    const cachePerformance = await db.query(`
      SELECT
        ROUND(AVG(latency_ms) FILTER (WHERE cache_hit)::numeric, 2) as cache_hit_latency,
        ROUND(AVG(latency_ms) FILTER (WHERE NOT cache_hit)::numeric, 2) as cache_miss_latency
      FROM ai_responses
      WHERE latency_ms IS NOT NULL
    `);

    // Response categories
    const responseCategories = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE latency_ms < 100) as fast_responses,
        COUNT(*) FILTER (WHERE latency_ms >= 100 AND latency_ms <= 5000) as normal_responses,
        COUNT(*) FILTER (WHERE latency_ms > 5000) as slow_responses
      FROM ai_responses
      WHERE latency_ms IS NOT NULL
    `);

    // Recent queries
    const recentQueries = await db.query(`
      SELECT
        request_timestamp,
        provider,
        model,
        query_text,
        latency_ms,
        cache_hit
      FROM ai_responses
      ORDER BY request_timestamp DESC
      LIMIT 10
    `);

    res.json({
      status: 'ok',
      totalQueries: parseInt(overallStats.rows[0].total_queries),
      queriesWithTiming: parseInt(overallStats.rows[0].queries_with_timing),
      cacheHits: parseInt(overallStats.rows[0].cache_hits),
      cacheHitRate: parseFloat(overallStats.rows[0].cache_hit_rate),
      avgLatency: parseFloat(latencyStats.rows[0].avg_latency),
      minLatency: parseFloat(latencyStats.rows[0].min_latency),
      maxLatency: parseFloat(latencyStats.rows[0].max_latency),
      p50Latency: parseFloat(latencyStats.rows[0].p50_latency),
      p95Latency: parseFloat(latencyStats.rows[0].p95_latency),
      p99Latency: parseFloat(latencyStats.rows[0].p99_latency),
      cacheHitLatency: parseFloat(cachePerformance.rows[0].cache_hit_latency),
      cacheMissLatency: parseFloat(cachePerformance.rows[0].cache_miss_latency),
      fastResponses: parseInt(responseCategories.rows[0].fast_responses),
      normalResponses: parseInt(responseCategories.rows[0].normal_responses),
      slowResponses: parseInt(responseCategories.rows[0].slow_responses),
      recentQueries: recentQueries.rows
    });
  } catch (error) {
    console.error('Failed to get verification stats:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Price/Market Data endpoints
const PricingSource = require('./sources/pricing-source');
const pricingSource = new PricingSource({ db });

// Oracle Service - Multi-source validated price oracle
const OracleService = require('./lib/oracle-service');
const oracleService = new OracleService({ db });

// Get cryptocurrency price
app.get('/api/price/crypto/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { currency = 'usd' } = req.query;

    const price = await pricingSource.getCryptoPrice(symbol, currency);

    res.json({
      status: 'ok',
      ...price
    });
  } catch (error) {
    console.error(`Failed to get crypto price for ${req.params.symbol}:`, error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get stock price
app.get('/api/price/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    const price = await pricingSource.getStockPrice(symbol);

    res.json({
      status: 'ok',
      ...price
    });
  } catch (error) {
    console.error(`Failed to get stock price for ${req.params.symbol}:`, error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Convenience endpoints for popular cryptos
app.get('/api/price/btc', async (req, res) => {
  try {
    const { currency = 'usd' } = req.query;
    const price = await pricingSource.getCryptoPrice('btc', currency);
    res.json({ status: 'ok', ...price });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/price/eth', async (req, res) => {
  try {
    const { currency = 'usd' } = req.query;
    const price = await pricingSource.getCryptoPrice('eth', currency);
    res.json({ status: 'ok', ...price });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get multiple prices at once
app.post('/api/price/batch', async (req, res) => {
  try {
    const { crypto = [], stocks = [], currency = 'usd' } = req.body;

    const results = {
      status: 'ok',
      crypto: {},
      stocks: {}
    };

    // Fetch crypto prices
    if (crypto.length > 0) {
      const cryptoPrices = await pricingSource.getMultipleCryptoPrices(crypto, currency);
      cryptoPrices.forEach(price => {
        if (price.error) {
          results.crypto[price.symbol] = { error: price.error };
        } else {
          results.crypto[price.symbol] = price;
        }
      });
    }

    // Fetch stock prices
    if (stocks.length > 0) {
      const stockPrices = await pricingSource.getMultipleStockPrices(stocks);
      stockPrices.forEach(price => {
        if (price.error) {
          results.stocks[price.symbol] = { error: price.error };
        } else {
          results.stocks[price.symbol] = price;
        }
      });
    }

    res.json(results);
  } catch (error) {
    console.error('Batch price fetch failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get latest prices from database
app.get('/api/price/latest', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not available'
      });
    }

    const result = await db.query('SELECT * FROM latest_prices ORDER BY recorded_at DESC LIMIT 50');

    res.json({
      status: 'ok',
      prices: result.rows
    });
  } catch (error) {
    console.error('Failed to get latest prices:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get price performance (24h stats)
app.get('/api/price/performance', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not available'
      });
    }

    const result = await db.query('SELECT * FROM price_performance_24h ORDER BY volatility_percent DESC');

    res.json({
      status: 'ok',
      performance: result.rows
    });
  } catch (error) {
    console.error('Failed to get price performance:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get price worker stats
app.get('/api/price/worker/stats', async (req, res) => {
  try {
    if (!global.priceWorker) {
      return res.status(503).json({
        status: 'error',
        message: 'Price worker not running (requires --local mode)'
      });
    }

    const stats = global.priceWorker.getStats();

    res.json({
      status: 'ok',
      worker: stats
    });
  } catch (error) {
    console.error('Failed to get worker stats:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get historical price data for a symbol (for charting)
app.get('/api/price/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { hours = 24, limit = 100 } = req.query;

    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not available (requires --local mode)'
      });
    }

    const result = await db.query(`
      SELECT
        symbol,
        price,
        change_24h,
        volume_24h,
        recorded_at
      FROM price_history
      WHERE symbol = $1
        AND recorded_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
      ORDER BY recorded_at ASC
      LIMIT $2
    `, [symbol.toUpperCase(), parseInt(limit)]);

    res.json({
      status: 'ok',
      symbol: symbol.toUpperCase(),
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error(`Failed to get price history for ${req.params.symbol}:`, error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get chart data for a symbol (formatted for Chart.js)
app.get('/api/price/chart/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { hours = 24, interval = 15 } = req.query; // interval in minutes

    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not available (requires --local mode)'
      });
    }

    // Get historical data with sampling
    const result = await db.query(`
      SELECT
        symbol,
        AVG(price) as price,
        AVG(change_24h) as change_24h,
        AVG(volume_24h) as volume_24h,
        DATE_TRUNC('minute', recorded_at) as time_bucket
      FROM price_history
      WHERE symbol = $1
        AND recorded_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
      GROUP BY symbol, DATE_TRUNC('minute', recorded_at)
      ORDER BY time_bucket ASC
    `, [symbol.toUpperCase()]);

    // Format for Chart.js
    const labels = result.rows.map(row => new Date(row.time_bucket).toISOString());
    const prices = result.rows.map(row => parseFloat(row.price));
    const volumes = result.rows.map(row => parseFloat(row.volume_24h || 0));

    res.json({
      status: 'ok',
      symbol: symbol.toUpperCase(),
      timeRange: `${hours}h`,
      labels,
      datasets: {
        price: prices,
        volume: volumes
      },
      latest: result.rows.length > 0 ? {
        price: prices[prices.length - 1],
        time: labels[labels.length - 1]
      } : null
    });
  } catch (error) {
    console.error(`Failed to get chart data for ${req.params.symbol}:`, error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================
// Algo Trading & Candles API
// ============================================================

// Get OHLCV candles for a symbol (for backtesting)
app.get('/api/candles/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const {
      timeframe = '1h',
      from = null,
      to = null,
      limit = 1000
    } = req.query;

    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not available (requires --local mode)'
      });
    }

    // Build query
    let query = `
      SELECT
        symbol,
        asset_type,
        timeframe,
        open_price,
        high_price,
        low_price,
        close_price,
        volume,
        trades_count,
        change_percent,
        candle_start,
        candle_end
      FROM price_candles
      WHERE symbol = $1 AND timeframe = $2
    `;

    const params = [symbol.toUpperCase(), timeframe];

    if (from) {
      params.push(from);
      query += ` AND candle_start >= $${params.length}`;
    }

    if (to) {
      params.push(to);
      query += ` AND candle_start <= $${params.length}`;
    }

    query += ` ORDER BY candle_start DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({
      status: 'ok',
      symbol: symbol.toUpperCase(),
      timeframe,
      count: result.rows.length,
      candles: result.rows.reverse() // Return in chronological order
    });

  } catch (error) {
    console.error(`Failed to get candles for ${req.params.symbol}:`, error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get latest candle for each symbol/timeframe
app.get('/api/candles/latest', async (req, res) => {
  try {
    const { timeframe = '1h' } = req.query;

    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not available (requires --local mode)'
      });
    }

    const result = await db.query(`
      SELECT * FROM latest_candles
      WHERE timeframe = $1
      ORDER BY symbol
    `, [timeframe]);

    res.json({
      status: 'ok',
      timeframe,
      count: result.rows.length,
      candles: result.rows
    });

  } catch (error) {
    console.error('Failed to get latest candles:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================
// Oracle Price API (Multi-source validated real-time prices)
// ============================================================

// Get validated price from oracle (real-time, multi-source)
app.get('/api/oracle/price/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { currency = 'usd', multiSource = 'true' } = req.query;

    const oracleResponse = await oracleService.getPrice(symbol, {
      currency,
      multiSource: multiSource !== 'false' // Default true unless explicitly disabled
    });

    res.json({
      status: 'ok',
      oracle: oracleResponse
    });
  } catch (error) {
    console.error(`Oracle price fetch failed for ${req.params.symbol}:`, error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get multiple validated prices from oracle (batch)
app.post('/api/oracle/prices', async (req, res) => {
  try {
    const { symbols = [], currency = 'usd', multiSource = true } = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'symbols array is required and must not be empty'
      });
    }

    const oracleResponses = await oracleService.getPrices(symbols, {
      currency,
      multiSource
    });

    res.json({
      status: 'ok',
      count: Object.keys(oracleResponses).length,
      prices: oracleResponses
    });
  } catch (error) {
    console.error('Oracle batch price fetch failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get oracle statistics
app.get('/api/oracle/stats', async (req, res) => {
  try {
    const stats = oracleService.getStats();

    res.json({
      status: 'ok',
      oracle: stats
    });
  } catch (error) {
    console.error('Failed to get oracle stats:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get recent arbitrage opportunities
app.get('/api/oracle/arbitrage', async (req, res) => {
  try {
    const { symbol = null, minSpread = 2, hours = 24, limit = 50 } = req.query;

    const ArbitrageDetector = require('./lib/arbitrage-detector');
    const arbitrageDetector = new ArbitrageDetector({ db });

    const opportunities = await arbitrageDetector.getOpportunities({
      symbol,
      minSpread: parseFloat(minSpread),
      hours: parseInt(hours),
      limit: parseInt(limit)
    });

    res.json({
      status: 'ok',
      count: opportunities.length,
      opportunities
    });
  } catch (error) {
    console.error('Failed to get arbitrage opportunities:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get source reliability scores
app.get('/api/oracle/sources', async (req, res) => {
  try {
    const ArbitrageDetector = require('./lib/arbitrage-detector');
    const arbitrageDetector = new ArbitrageDetector({ db });

    const sources = await arbitrageDetector.getSourceReliability();

    res.json({
      status: 'ok',
      count: sources.length,
      sources
    });
  } catch (error) {
    console.error('Failed to get source reliability:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Clear oracle cache
app.post('/api/oracle/cache/clear', async (req, res) => {
  try {
    const clearedCount = oracleService.clearCache();

    res.json({
      status: 'ok',
      message: `Cleared ${clearedCount} cached entries`
    });
  } catch (error) {
    console.error('Failed to clear oracle cache:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================
// Scheduler Management API
// ============================================================

// Get scheduler status and statistics
app.get('/api/scheduler/stats', async (req, res) => {
  try {
    if (!global.scheduler) {
      return res.status(503).json({
        status: 'error',
        message: 'Scheduler not available (requires --local mode)'
      });
    }

    const stats = global.scheduler.getStats();

    res.json({
      status: 'ok',
      scheduler: stats
    });

  } catch (error) {
    console.error('Failed to get scheduler stats:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get scheduler job history
app.get('/api/scheduler/history', async (req, res) => {
  try {
    if (!global.scheduler) {
      return res.status(503).json({
        status: 'error',
        message: 'Scheduler not available (requires --local mode)'
      });
    }

    const { limit = 100 } = req.query;
    const history = global.scheduler.getHistory(parseInt(limit));

    res.json({
      status: 'ok',
      count: history.length,
      history
    });

  } catch (error) {
    console.error('Failed to get scheduler history:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Run a scheduled job immediately
app.post('/api/scheduler/run/:taskName', async (req, res) => {
  try {
    if (!global.scheduler) {
      return res.status(503).json({
        status: 'error',
        message: 'Scheduler not available (requires --local mode)'
      });
    }

    const { taskName } = req.params;
    await global.scheduler.runNow(taskName);

    res.json({
      status: 'ok',
      message: `Task "${taskName}" executed`,
      task: taskName
    });

  } catch (error) {
    console.error(`Failed to run task ${req.params.taskName}:`, error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Enable/disable a scheduled task
app.post('/api/scheduler/task/:taskName/:action', async (req, res) => {
  try {
    if (!global.scheduler) {
      return res.status(503).json({
        status: 'error',
        message: 'Scheduler not available (requires --local mode)'
      });
    }

    const { taskName, action } = req.params;

    if (action === 'enable') {
      global.scheduler.enable(taskName);
    } else if (action === 'disable') {
      global.scheduler.disable(taskName);
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid action. Use "enable" or "disable"'
      });
    }

    res.json({
      status: 'ok',
      message: `Task "${taskName}" ${action}d`,
      task: taskName,
      action
    });

  } catch (error) {
    console.error(`Failed to ${req.params.action} task ${req.params.taskName}:`, error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get scheduler logs from database
app.get('/api/scheduler/logs', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not available (requires --local mode)'
      });
    }

    const { limit = 50, status = null } = req.query;

    let query = 'SELECT * FROM scheduler_log';
    const params = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ` ORDER BY started_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({
      status: 'ok',
      count: result.rows.length,
      logs: result.rows
    });

  } catch (error) {
    console.error('Failed to get scheduler logs:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Serve monitoring dashboard
app.use('/monitoring', express.static(path.join(__dirname, 'monitoring')));

// Proxy Mission Control feed endpoints (if Mission Control is running on 3003)
// Generate RSS feed from MessageStore
app.get('/feed/rss', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const messages = await messageStore.getRecent(limit);

    // Get base URL for production deployments
    const baseURL = getBaseURL(req);

    // Build RSS XML
    const items = messages.map(msg => {
      const title = `[${msg.type}] ${msg.user || msg.agent || 'System'}`;
      const description = msg.formatted_html || msg.message || '';
      const pubDate = new Date(msg.timestamp).toUTCString();

      return `
    <item>
      <title>${escapeXml(title)}</title>
      <description><![CDATA[${description}]]></description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${msg.hash || msg.id}</guid>
    </item>`;
    }).join('');

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CalOS Feed</title>
    <description>Real-time activity feed from CalOS agent router</description>
    <link>${baseURL}/feed.html</link>
    <atom:link href="${baseURL}/feed/rss" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml');
    res.send(rssXml);
  } catch (error) {
    res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CalOS Feed - Error</title>
    <description>Error generating RSS feed: ${escapeXml(error.message)}</description>
  </channel>
</rss>`);
  }
});

// Generate JSON feed from MessageStore
app.get('/feed/json', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const messages = await messageStore.getRecent(limit);

    // Get base URL for production deployments
    const baseURL = getBaseURL(req);

    res.json({
      status: 'ok',
      feed: {
        title: 'CalOS Feed',
        description: 'Real-time activity feed from CalOS agent router',
        link: `${baseURL}/feed.html`,
        lastUpdated: new Date().toISOString()
      },
      messages: messages.map(msg => ({
        id: msg.id,
        type: msg.type,
        user: msg.user,
        agent: msg.agent,
        message: msg.message,
        formattedHtml: msg.formatted_html,
        timestamp: msg.timestamp,
        hash: msg.hash
      }))
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Feed search with semantic/hybrid search
app.post('/feed/search', async (req, res) => {
  try {
    const {
      query,
      method = 'hybrid', // 'text', 'semantic', or 'hybrid'
      limit = 10,
      similarityThreshold = 0.7,
      type = null,
      sessionId = null
    } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Query parameter is required'
      });
    }

    let results;
    const options = {
      limit,
      similarityThreshold,
      type,
      sessionId
    };

    switch (method) {
      case 'text':
        results = await messageStore._textSearch(query, options);
        break;

      case 'semantic':
        results = await messageStore.semanticSearch(query, options);
        break;

      case 'hybrid':
      default:
        results = await messageStore.hybridSearch(query, options);
        break;
    }

    res.json({
      status: 'ok',
      query,
      method,
      count: results.length,
      results: results.map(msg => ({
        id: msg.id,
        type: msg.type,
        user: msg.user,
        agent: msg.agent,
        message: msg.message,
        formattedHtml: msg.formatted_html,
        timestamp: msg.timestamp,
        hash: msg.hash,
        similarity: msg.similarity || null,
        score: msg.score || null,
        matchType: msg.matchType || 'text'
      }))
    });

  } catch (error) {
    console.error('Feed search error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Helper function to escape XML
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// Main agent endpoint (REST) - Now with intelligent routing!
app.post('/api/agent', async (req, res) => {
  const requestStartTime = Date.now(); // Track request duration
  try {
    const { input, context = {}, target_agents = null } = req.body;

    if (!input) {
      return res.status(400).json({
        status: 'error',
        message: 'Input is required'
      });
    }

    // Enable local mode in context if --local flag is set
    if (localMode) {
      context.local = true;
    }

    // Add receipt processing dependencies to context
    context.receiptParser = receiptParser;
    context.ocrAdapter = ocrAdapter;
    context.db = db;

    // ============================================================================
    // PHASE 1: Profile Detection & System Context Injection
    // ============================================================================

    // Inject server-side system context (date/time, location, etc.)
    context.serverTime = new Date().toISOString();
    context.serverDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    context.serverTimestamp = Date.now();

    // Extract session info from headers
    const sessionId = req.headers['x-session-id'] || req.body.sessionId || context.sessionId;
    const userId = req.headers['x-user-id'] || req.body.userId || context.userId;

    if (sessionId) context.sessionId = sessionId;
    if (userId) context.userId = userId;

    // Extract client IP & resolve geolocation
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                     req.headers['x-real-ip'] ||
                     req.connection.remoteAddress ||
                     req.socket.remoteAddress ||
                     req.ip;

    context.clientIp = clientIp;

    if (geoResolver && clientIp && !clientIp.includes('127.0.0.1') && !clientIp.includes('::1')) {
      try {
        const geolocation = await geoResolver.resolve(clientIp);
        if (geolocation) {
          context.geolocation = {
            city: geolocation.city,
            region: geolocation.regionName,
            country: geolocation.country,
            countryCode: geolocation.countryCode,
            lat: geolocation.lat,
            lon: geolocation.lon,
            timezone: geolocation.timezone,
            isp: geolocation.isp
          };
          console.log(`[Geo] Resolved ${clientIp} → ${geolocation.city}, ${geolocation.region}, ${geolocation.country}`);
        }
      } catch (error) {
        console.warn('[Geo] Resolution failed:', error.message);
      }
    }

    // Extract domain origin & cookies
    const originHeader = req.headers['origin'] || req.headers['referer'] || '';
    const originDomain = originHeader ? new URL(originHeader).hostname : context.platform?.split('-')[0] || 'unknown';

    context.originDomain = originDomain;
    context.cookies = req.headers['cookie'] || '';

    // Map domain to visual branding (for UI consistency)
    const domainColors = {
      'soulfra.com': '#667eea',
      'deathtodata.com': '#ef4444',
      'finishthisidea.com': '#10b981',
      'dealordelete.com': '#f59e0b',
      'saveorsink.com': '#06b6d4'
    };
    context.domainColor = domainColors[originDomain] || '#667eea';

    // Build unified identity graph
    if (identityResolver) {
      try {
        const identityFragments = {
          user_id: userId,
          cookie_id: context.cookies ? context.cookies.split(';').find(c => c.includes('session_id'))?.split('=')[1] : null,
          ip_address: clientIp,
          device_fingerprint: req.headers['user-agent'] || null,
          session_id: sessionId
        };

        const identityGraph = await identityResolver.resolveIdentity(identityFragments);
        context.identityId = identityGraph.identity_id;
        context.identityGraph = identityGraph;
      } catch (error) {
        console.warn('[Identity] Resolution failed:', error.message);
      }
    }

    // Domain-specific privacy & feature settings
    if (originDomain === 'deathtodata.com') {
      // Death To Data: Incognito/privacy mode
      context.privacyMode = 'incognito';
      context.trackingDisabled = true;
      context.ephemeralSession = true;
      console.log('[Privacy] Incognito mode enabled for deathtodata.com');
    } else if (originDomain === 'soulfra.com') {
      // Soulfra: Nonprofit/voice/accessibility context
      context.domainContext = 'nonprofit';
      context.features = ['voice', 'accessibility', 'inclusive', 'audio'];
      console.log('[Domain] Nonprofit context enabled for soulfra.com');
    }

    // Detect user profile/ICP segment using UserProfileDetector
    if (userProfileDetector && !context.detectedProfile) {
      try {
        const profileResult = await userProfileDetector.detectProfile({
          prompt: input,
          sessionHistory: context.sessionHistory || [],
          userId: context.userId
        });

        context.detectedProfile = profileResult.profile;
        context.profileConfidence = profileResult.confidence;
        context.profileKeywords = profileResult.keywords;

        console.log(`[Profile] Detected: ${profileResult.profile} (${Math.round(profileResult.confidence * 100)}% confidence)`);
      } catch (error) {
        console.error('[Profile] Detection failed:', error.message);
        context.detectedProfile = 'casual'; // Fallback
      }
    }

    // ============================================================================
    // PHASE 2: Domain Context Enrichment
    // ============================================================================

    // Enrich with domain-specific parameters, style guides, patterns
    if (domainContextEnricher && context.originDomain && context.originDomain !== 'unknown') {
      try {
        const enriched = await domainContextEnricher.enrich(
          input,
          context.domainContext || context.originDomain,
          {
            includePatterns: true,
            includeStyleGuide: true,
            includeAntiPatterns: true,
            maxPatterns: 3
          }
        );

        context.domainParameters = enriched.parameters;
        context.styleGuide = enriched.styleGuide;
        context.domainAntiPatterns = enriched.antiPatterns;
        context.topPatterns = enriched.topPatterns;

        console.log(`[Domain] Enriched context for: ${context.originDomain}`);
      } catch (error) {
        console.warn('[Domain] Enrichment failed:', error.message);
      }
    }

    // Map domain to recommended buckets
    if (bucketOrchestrator && bucketOrchestrator.domainMap && context.originDomain) {
      const recommendedBuckets = bucketOrchestrator.domainMap.get(context.originDomain) || [];
      if (recommendedBuckets.length > 0) {
        context.recommendedBuckets = recommendedBuckets;
        console.log(`[Buckets] Recommended for ${context.originDomain}: ${recommendedBuckets.join(', ')}`);
      }
    }

    // Check if document needs chunking (bucket map-reduce)
    if (bucketOrchestrator && !target_agents) {
      const mapReduce = new BucketMapReduce({
        bucketOrchestrator,
        maxTokens: 4096,
        overlapTokens: 200,
        safetyMargin: 500
      });

      const needsChunking = mapReduce.needsMapReduce(input);

      if (needsChunking) {
        console.log('[Agent] Document needs chunking, using bucket map-reduce...');

        broadcast({
          type: 'agent_start',
          input,
          routing: { rule: 'map-reduce-chunking', intent: 'large-document-processing' },
          timestamp: new Date().toISOString()
        });

        const startTime = Date.now();
        const result = await mapReduce.execute({
          document: input,
          systemPrompt: '',
          strategy: 'auto',
          userId: context.userId,
          sessionId: context.sessionId,
          context
        });
        const duration = Date.now() - startTime;

        broadcast({
          type: 'agent_complete',
          input,
          logs: [{
            agent: 'bucket-map-reduce',
            result: result.response,
            duration,
            metadata: result.metadata,
            timestamp: new Date().toISOString()
          }],
          timestamp: new Date().toISOString()
        });

        return res.json({
          status: 'ok',
          logs: [{
            agent: 'bucket-map-reduce',
            result: result.response,
            duration,
            metadata: result.metadata,
            timestamp: new Date().toISOString()
          }],
          timestamp: new Date().toISOString()
        });
      }
    }

    // Use routing engine to determine agents
    let routedAgents;
    let routingInfo;

    if (target_agents && Array.isArray(target_agents)) {
      // User explicitly specified agents (backward compatibility)
      routedAgents = target_agents;
      routingInfo = { rule: 'explicit-user-specified', delegated: false };
    } else {
      // Use intelligent routing
      const routingDecision = router.route(input, context);
      routedAgents = routingDecision.agents.primary;
      routingInfo = routingDecision.routing;

      // Include CC and BCC agents
      const ccAgents = routingDecision.agents.cc || [];
      const bccAgents = routingDecision.agents.bcc || [];

      console.log(`📧 Routing:`);
      console.log(`   Primary: ${routedAgents.join(', ')}`);
      if (ccAgents.length > 0) console.log(`   CC: ${ccAgents.join(', ')}`);
      if (bccAgents.length > 0) console.log(`   BCC: ${bccAgents.join(', ')}`);
      console.log(`   Rule: ${routingInfo.rule}`);
      console.log(`   Intent: ${routingInfo.intent}`);

      // Add all CC and BCC to execution list
      routedAgents = [...routedAgents, ...ccAgents, ...bccAgents];
    }

    // Broadcast start event with routing info
    broadcast({
      type: 'agent_start',
      input,
      target_agents: routedAgents,
      routing: routingInfo,
      timestamp: new Date().toISOString()
    });

    const logs = [];
    for (const agentId of routedAgents) {
      console.log(`→ Running ${agentId}...`);

      // Track agent load
      agentRegistry.incrementLoad(agentId);

      const startTime = Date.now();

      try {
        const result = await runAgent(agentId, input, context);
        const duration = Date.now() - startTime;

        const logEntry = {
          agent: agentId,
          result,
          duration,
          timestamp: new Date().toISOString()
        };

        logs.push(logEntry);

        // Record success stats
        agentRegistry.recordRequest(agentId, true, duration);

        // Broadcast each agent result as it completes
        broadcast({
          type: 'agent_response',
          ...logEntry,
          input
        });

        console.log(`✓ ${agentId} completed in ${duration}ms`);

      } catch (error) {
        const duration = Date.now() - startTime;

        // Record failure stats
        agentRegistry.recordRequest(agentId, false, duration);

        const logEntry = {
          agent: agentId,
          result: `❌ Error: ${error.message}`,
          duration,
          timestamp: new Date().toISOString(),
          error: true
        };

        logs.push(logEntry);

        console.error(`✗ ${agentId} failed after ${duration}ms:`, error.message);

      } finally {
        // Always decrement load
        agentRegistry.decrementLoad(agentId);
      }
    }

    // Save to memory
    const memoryPath = path.join(memoryDir, 'agent_log.json');
    let memory = [];

    if (fs.existsSync(memoryPath)) {
      try {
        memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
      } catch (err) {
        console.error('Error reading memory file:', err);
        memory = [];
      }
    }

    memory.push({
      timestamp: new Date().toISOString(),
      input,
      context,
      logs
    });

    // Keep only last 1000 entries
    if (memory.length > 1000) {
      memory = memory.slice(-1000);
    }

    fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));

    // Broadcast completion
    broadcast({
      type: 'agent_complete',
      input,
      logs,
      timestamp: new Date().toISOString()
    });

    // ============================================================================
    // PHASE 4: Multi-Project Response Filtering
    // ============================================================================

    // Filter response for multiple domains if configured
    if (context.originDomain && logs && logs.length > 0) {
      const responseFilter = new ResponseFilter({
        db,
        domainMap: bucketOrchestrator ? bucketOrchestrator.domainMap : null
      });

      const filtered = await responseFilter.filterForDomains({
        response: logs[0].result,
        originDomain: context.originDomain,
        targetDomains: context.targetDomains || [context.originDomain],
        detectedProfile: context.detectedProfile
      });

      // Add filtering metadata to context
      context.filteredResponses = filtered.byDomain;
      context.routingDepth = filtered.depth;
      context.affectedDomains = filtered.domains;
      context.suggestedVersion = filtered.suggestedVersion;

      console.log(`[Filter] Response filtered for ${filtered.depth} domain(s): ${filtered.domains.join(', ')}`);

      // Log filtering event for analytics
      if (filtered.depth > 1) {
        await responseFilter.logFilteredResponse({
          originDomain: context.originDomain,
          affectedDomains: filtered.domains,
          routingDepth: filtered.depth,
          suggestedVersion: filtered.suggestedVersion,
          detectedProfile: context.detectedProfile,
          sessionId: context.sessionId
        });
      }
    }

    // ============================================================================
    // PHASE 5: Agent Activity Logging
    // ============================================================================

    // Log agent activity with full context
    if (agentActivityLogger && logs && logs.length > 0) {
      const requestDuration = Date.now() - requestStartTime;
      const primaryLog = logs[0]; // Primary agent response

      try {
        const activityId = await agentActivityLogger.logActivity({
          agent: primaryLog.agent,
          user_id: userId,
          session_id: sessionId,
          device_id: context.deviceId || null,
          identity_id: context.identityId || null,
          origin_domain: context.originDomain,
          input: input,
          result: primaryLog.result,
          context: context,
          duration_ms: requestDuration,
          status: 'success'
        });

        console.log(`[AgentActivity] Logged activity: ${activityId}`);
      } catch (error) {
        console.warn('[AgentActivity] Failed to log activity:', error.message);
      }
    }

    res.json({
      status: 'ok',
      logs,
      context, // Include enriched context with all metadata
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /agent endpoint:', error);

    // Log error activity
    if (agentActivityLogger) {
      const requestDuration = Date.now() - requestStartTime;
      try {
        await agentActivityLogger.logActivity({
          agent: '@system',
          user_id: userId || 'anonymous',
          session_id: sessionId || 'unknown',
          device_id: null,
          identity_id: null,
          origin_domain: context?.originDomain || 'unknown',
          input: input || '',
          result: null,
          context: context || {},
          duration_ms: requestDuration,
          status: 'error',
          error_message: error.message
        });
      } catch (logError) {
        console.warn('[AgentActivity] Failed to log error activity:', logError.message);
      }
    }

    broadcast({
      type: 'agent_error',
      error: error.message,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Agent Activity Query Endpoints
// ============================================================================

/**
 * GET /api/agent/activity - Retrieve agent activity logs
 *
 * Query parameters:
 * - user_id: Filter by user
 * - session_id: Filter by session
 * - domain: Filter by origin domain
 * - agent: Filter by agent (@ollama:mistral, @gpt4, @claude)
 * - limit: Number of records (default: 50, max: 500)
 * - offset: Pagination offset
 */
app.get('/api/agent/activity', async (req, res) => {
  try {
    if (!agentActivityLogger) {
      return res.status(503).json({
        status: 'error',
        message: 'Agent activity logging not available'
      });
    }

    const {
      user_id = null,
      session_id = null,
      domain = null,
      agent = null,
      limit = 50,
      offset = 0
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 50, 500);
    const parsedOffset = parseInt(offset) || 0;

    let activities = [];
    let queryType = 'recent'; // Track which query path was used

    // Route to appropriate query method
    if (user_id) {
      queryType = 'by_user';
      activities = await agentActivityLogger.getActivityByUser(user_id, {
        limit: parsedLimit,
        offset: parsedOffset,
        agent,
        domain
      });
    } else if (session_id) {
      queryType = 'by_session';
      activities = await agentActivityLogger.getActivityBySession(session_id, {
        limit: parsedLimit,
        offset: parsedOffset
      });
    } else if (domain) {
      queryType = 'by_domain';
      activities = await agentActivityLogger.getActivityByDomain(domain, {
        limit: parsedLimit,
        offset: parsedOffset,
        agent
      });
    } else {
      queryType = 'recent';
      // Get recent activity across all users
      activities = await agentActivityLogger.getRecentActivity(parsedLimit);
    }

    // Build filters object showing what was actually applied
    const appliedFilters = {
      query_type: queryType,
      limit: parsedLimit,
      offset: parsedOffset
    };

    // Only include filters that were actually used
    if (user_id) appliedFilters.user_id = user_id;
    if (session_id) appliedFilters.session_id = session_id;
    if (domain) appliedFilters.domain = domain;
    if (agent) appliedFilters.agent = agent;

    res.json({
      status: 'ok',
      count: activities.length,
      activities,
      filters: appliedFilters
    });

  } catch (error) {
    console.error('[API] /api/agent/activity error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/agent/stats - Get agent statistics
 *
 * Query parameters:
 * - agent: Filter by specific agent
 * - domain: Filter by domain
 * - start_date: Start date (ISO format)
 * - end_date: End date (ISO format)
 */
app.get('/api/agent/stats', async (req, res) => {
  try {
    if (!agentActivityLogger) {
      return res.status(503).json({
        status: 'error',
        message: 'Agent activity logging not available'
      });
    }

    const {
      agent = null,
      domain = null,
      start_date = null,
      end_date = null
    } = req.query;

    const stats = await agentActivityLogger.getAgentStats({
      agent,
      domain,
      startDate: start_date ? new Date(start_date) : null,
      endDate: end_date ? new Date(end_date) : null
    });

    // Build filters object showing what was actually applied
    const appliedFilters = {};
    if (agent) appliedFilters.agent = agent;
    if (domain) appliedFilters.domain = domain;
    if (start_date) appliedFilters.start_date = start_date;
    if (end_date) appliedFilters.end_date = end_date;

    res.json({
      status: 'ok',
      stats,
      filters: Object.keys(appliedFilters).length > 0 ? appliedFilters : null
    });

  } catch (error) {
    console.error('[API] /api/agent/stats error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// PHASE 5: File System Integration Endpoint
// ============================================================================

/**
 * POST /api/agent/files - Project folder & file operations
 *
 * Supports: read, write, list, create, delete operations
 * Scoped to domain for security (prevents cross-domain access)
 */
app.post('/api/agent/files', async (req, res) => {
  try {
    const { operation, filePath, content, context = {} } = req.body;

    // Validate operation
    const allowedOperations = ['read', 'write', 'list', 'create', 'delete', 'info'];
    if (!allowedOperations.includes(operation)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid operation. Allowed: ${allowedOperations.join(', ')}`
      });
    }

    // Extract context (same as /api/agent)
    const sessionId = req.headers['x-session-id'] || req.body.sessionId || context.sessionId;
    const userId = req.headers['x-user-id'] || req.body.userId || context.userId;
    const originHeader = req.headers['origin'] || req.headers['referer'] || '';
    const originDomain = originHeader ? new URL(originHeader).hostname : context.platform?.split('-')[0] || 'unknown';

    // Inject system context
    context.serverTime = new Date().toISOString();
    context.sessionId = sessionId;
    context.userId = userId;
    context.originDomain = originDomain;

    // Security: Scope file operations to domain-specific folder
    const basePath = path.join(__dirname, 'projects', originDomain);

    // Ensure base path exists
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
      console.log(`[Files] Created project folder: ${basePath}`);
    }

    // Resolve and validate file path (prevent directory traversal)
    const safePath = filePath ? path.resolve(basePath, filePath) : basePath;
    if (!safePath.startsWith(basePath)) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied: Path outside domain scope'
      });
    }

    let result = {};

    // Execute operation
    switch (operation) {
      case 'list':
        if (!fs.existsSync(safePath)) {
          result = { files: [] };
        } else {
          const items = fs.readdirSync(safePath).map(name => {
            const itemPath = path.join(safePath, name);
            const stats = fs.statSync(itemPath);
            return {
              name,
              type: stats.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime
            };
          });
          result = { files: items };
        }
        break;

      case 'read':
        if (!fs.existsSync(safePath)) {
          return res.status(404).json({
            status: 'error',
            message: 'File not found'
          });
        }
        const fileContent = fs.readFileSync(safePath, 'utf8');
        result = { content: fileContent, path: filePath };
        break;

      case 'write':
        if (!content) {
          return res.status(400).json({
            status: 'error',
            message: 'Content is required for write operation'
          });
        }
        fs.writeFileSync(safePath, content, 'utf8');
        result = { written: true, path: filePath, bytes: content.length };
        break;

      case 'create':
        if (fs.existsSync(safePath)) {
          return res.status(409).json({
            status: 'error',
            message: 'File or directory already exists'
          });
        }
        if (content) {
          fs.writeFileSync(safePath, content, 'utf8');
          result = { created: 'file', path: filePath };
        } else {
          fs.mkdirSync(safePath, { recursive: true });
          result = { created: 'directory', path: filePath };
        }
        break;

      case 'delete':
        if (!fs.existsSync(safePath)) {
          return res.status(404).json({
            status: 'error',
            message: 'File or directory not found'
          });
        }
        const stats = fs.statSync(safePath);
        if (stats.isDirectory()) {
          fs.rmSync(safePath, { recursive: true });
          result = { deleted: 'directory', path: filePath };
        } else {
          fs.unlinkSync(safePath);
          result = { deleted: 'file', path: filePath };
        }
        break;

      case 'info':
        if (!fs.existsSync(safePath)) {
          return res.status(404).json({
            status: 'error',
            message: 'File or directory not found'
          });
        }
        const itemStats = fs.statSync(safePath);
        result = {
          name: path.basename(safePath),
          type: itemStats.isDirectory() ? 'directory' : 'file',
          size: itemStats.size,
          created: itemStats.birthtime,
          modified: itemStats.mtime,
          path: filePath
        };
        break;
    }

    console.log(`[Files] ${operation} operation for ${originDomain}: ${filePath || '/'}`);

    res.json({
      status: 'ok',
      operation,
      result,
      context,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Files] Operation failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get memory/history
app.get('/memory', (req, res) => {
  try {
    const memoryPath = path.join(memoryDir, 'agent_log.json');

    if (!fs.existsSync(memoryPath)) {
      return res.json([]);
    }

    const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
    const limit = parseInt(req.query.limit) || 100;

    res.json(memory.slice(-limit));
  } catch (error) {
    console.error('Error reading memory:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Clear memory
app.delete('/memory', (req, res) => {
  try {
    const memoryPath = path.join(memoryDir, 'agent_log.json');

    if (fs.existsSync(memoryPath)) {
      fs.unlinkSync(memoryPath);
    }

    res.json({
      status: 'ok',
      message: 'Memory cleared'
    });
  } catch (error) {
    console.error('Error clearing memory:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get agent registry status
app.get('/agents', (req, res) => {
  try {
    const summary = agentRegistry.getSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get specific agent status
app.get('/agents/:agentId', (req, res) => {
  try {
    const agentId = req.params.agentId.startsWith('@')
      ? req.params.agentId
      : `@${req.params.agentId}`;

    const agent = agentRegistry.get(agentId);
    if (!agent) {
      return res.status(404).json({
        status: 'error',
        message: `Agent ${agentId} not found`
      });
    }

    res.json(agent);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Set agent out of office
app.post('/agents/:agentId/out-of-office', (req, res) => {
  try {
    const agentId = req.params.agentId.startsWith('@')
      ? req.params.agentId
      : `@${req.params.agentId}`;

    const { until, delegate } = req.body;

    if (!until) {
      return res.status(400).json({
        status: 'error',
        message: 'until date is required'
      });
    }

    const success = agentRegistry.setOutOfOffice(agentId, until, delegate);

    if (!success) {
      return res.status(404).json({
        status: 'error',
        message: `Agent ${agentId} not found`
      });
    }

    res.json({
      status: 'ok',
      message: `${agentId} set out of office until ${until}`
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Clear out of office
app.delete('/agents/:agentId/out-of-office', (req, res) => {
  try {
    const agentId = req.params.agentId.startsWith('@')
      ? req.params.agentId
      : `@${req.params.agentId}`;

    const success = agentRegistry.clearOutOfOffice(agentId);

    if (!success) {
      return res.status(404).json({
        status: 'error',
        message: `Agent ${agentId} not found`
      });
    }

    res.json({
      status: 'ok',
      message: `${agentId} out of office cleared`
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get routing suggestions (without executing)
app.post('/routing/suggest', (req, res) => {
  try {
    const { input } = req.body;

    if (!input) {
      return res.status(400).json({
        status: 'error',
        message: 'Input is required'
      });
    }

    const suggestion = router.suggest(input);
    res.json(suggestion);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// GitHub action handler endpoint
app.post('/github-action', async (req, res) => {
  try {
    const notification = req.body;

    if (!notification.type) {
      return res.status(400).json({
        status: 'error',
        message: 'Notification type is required'
      });
    }

    console.log(`📧 Received GitHub notification: ${notification.type}`);

    const handler = new GitHubActionHandler();
    const result = await handler.handle(notification);

    res.json({
      status: 'ok',
      notification_type: notification.type,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error handling GitHub action:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Voice transcription endpoint
app.post('/transcribe-voice', async (req, res) => {
  try {
    const { audio, format = 'webm' } = req.body;

    if (!audio) {
      return res.status(400).json({
        status: 'error',
        message: 'Audio data is required'
      });
    }

    console.log(`🎤 Transcribing voice (format: ${format})...`);

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio, 'base64');

    // Transcribe
    const transcription = await voiceTranscriber.transcribe(audioBuffer, format);

    console.log(`✓ Transcription complete: ${transcription.length} characters`);

    res.json({
      status: 'ok',
      transcription,
      length: transcription.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Voice transcription error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Learning loop query endpoint
app.post('/learning-loop', async (req, res) => {
  try {
    const { interaction_id, input, timestamp } = req.body;

    if (!interaction_id || !input) {
      return res.status(400).json({
        status: 'error',
        message: 'interaction_id and input are required'
      });
    }

    console.log(`💬 Learning loop query [${interaction_id}]`);

    // Handle query through learning loop
    const response = await learningLoop.handleQuery(interaction_id, input);

    // Get current stats
    const stats = learningLoop.getStats();

    res.json({
      status: 'ok',
      response,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Learning loop error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Learning loop feedback endpoint
app.post('/learning-feedback', async (req, res) => {
  try {
    const { interaction_id, feedback_type, correction, timestamp } = req.body;

    if (!interaction_id || !feedback_type) {
      return res.status(400).json({
        status: 'error',
        message: 'interaction_id and feedback_type are required'
      });
    }

    console.log(`📊 Learning feedback [${interaction_id}]: ${feedback_type}`);

    // Handle feedback
    await learningLoop.handleFeedback(interaction_id, feedback_type, correction);

    // Get updated stats
    const stats = learningLoop.getStats();

    res.json({
      status: 'ok',
      message: 'Feedback recorded',
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Learning feedback error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get learning loop statistics
app.get('/learning-stats', (req, res) => {
  try {
    const stats = learningLoop.getStats();
    res.json({
      status: 'ok',
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Time utilities endpoint
app.get('/time', (req, res) => {
  try {
    const TimeUtils = require('../lib/time-utils');
    const timeUtils = new TimeUtils();

    const { action, timestamp, timezone, city } = req.query;

    let result;

    switch (action) {
      case 'unix':
        result = { timestamp: timeUtils.getUnixTimestamp() };
        break;

      case 'convert':
        if (!timestamp) {
          return res.status(400).json({ status: 'error', message: 'timestamp parameter required' });
        }
        result = { human: timeUtils.timestampToHuman(parseInt(timestamp)) };
        break;

      case 'timezone':
      case 'worldclock':
        const tz = timezone || city;
        if (!tz) {
          return res.status(400).json({ status: 'error', message: 'timezone or city parameter required' });
        }
        result = timeUtils.getTimeInTimezone(tz);
        break;

      default:
        result = {
          currentTime: new Date().toLocaleString(),
          unixTimestamp: timeUtils.getUnixTimestamp(),
          actions: ['unix', 'convert', 'timezone', 'worldclock']
        };
    }

    res.json({
      status: 'ok',
      ...result,
      requestTime: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// System info endpoint
app.get('/system', (req, res) => {
  try {
    const SystemInfo = require('../lib/system-info');
    const systemInfo = new SystemInfo();

    const { action } = req.query;

    let result;

    switch (action) {
      case 'uptime':
        result = systemInfo.getUptime();
        break;

      case 'memory':
        result = systemInfo.getMemoryUsage();
        break;

      case 'components':
        result = { components: systemInfo.listComponents() };
        break;

      case 'processes':
        result = { processes: systemInfo.getRunningProcesses() };
        break;

      case 'ports':
        result = { ports: systemInfo.getListeningPorts() };
        break;

      default:
        result = systemInfo.getSummary();
    }

    res.json({
      status: 'ok',
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Safe Utility Endpoints (No Process Spawning)
// Pattern: Like /time and /system - pure JavaScript utilities
// ============================================================================

// Crypto utilities
app.post('/api/crypto/hash', (req, res) => {
  try {
    const { text, algorithm = 'sha256' } = req.body;
    const result = cryptoUtils.hash(text, algorithm);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/crypto/hmac', (req, res) => {
  try {
    const { text, secret, algorithm = 'sha256' } = req.body;
    const result = cryptoUtils.hmac(text, secret, algorithm);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/crypto/base64-encode', (req, res) => {
  try {
    const { text } = req.body;
    const result = cryptoUtils.base64Encode(text);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/crypto/base64-decode', (req, res) => {
  try {
    const { encoded } = req.body;
    const result = cryptoUtils.base64Decode(encoded);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/crypto/random-bytes', (req, res) => {
  try {
    const { length = 16 } = req.body;
    const result = cryptoUtils.randomBytes(length);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/crypto/uuid', (req, res) => {
  try {
    const result = cryptoUtils.uuid();
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// Text utilities
app.post('/api/text/count', (req, res) => {
  try {
    const { text, pattern, caseSensitive = true } = req.body;
    const result = textUtils.count(text, pattern, caseSensitive);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/text/replace', (req, res) => {
  try {
    const { text, pattern, replacement, replaceAll = true } = req.body;
    const result = textUtils.replace(text, pattern, replacement, replaceAll);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/text/case', (req, res) => {
  try {
    const { text, caseType } = req.body;
    const result = textUtils.changeCase(text, caseType);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/text/count-all', (req, res) => {
  try {
    const { text } = req.body;
    const result = textUtils.countAll(text);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/text/slugify', (req, res) => {
  try {
    const { text } = req.body;
    const result = textUtils.slugify(text);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/text/truncate', (req, res) => {
  try {
    const { text, length = 100, suffix = '...' } = req.body;
    const result = textUtils.truncate(text, length, suffix);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// Data utilities
app.post('/api/data/parse-json', (req, res) => {
  try {
    const { json } = req.body;
    const result = dataUtils.parseJSON(json);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/data/stringify-json', (req, res) => {
  try {
    const { data, pretty = false, indent = 2 } = req.body;
    const result = dataUtils.stringifyJSON(data, pretty, indent);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/data/parse-csv', (req, res) => {
  try {
    const { csv, delimiter = ',', hasHeader = true } = req.body;
    const result = dataUtils.parseCSV(csv, { delimiter, hasHeader });
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/data/to-csv', (req, res) => {
  try {
    const { data, delimiter = ',', includeHeader = true } = req.body;
    const result = dataUtils.toCSV(data, { delimiter, includeHeader });
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/data/filter', (req, res) => {
  try {
    const { data, key, operator, value } = req.body;
    const result = dataUtils.filter(data, key, operator, value);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/data/sort', (req, res) => {
  try {
    const { data, key = null, order = 'asc' } = req.body;
    const result = dataUtils.sort(data, key, order);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/data/unique', (req, res) => {
  try {
    const { data } = req.body;
    const result = dataUtils.unique(data);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

app.post('/api/data/group-by', (req, res) => {
  try {
    const { data, key } = req.body;
    const result = dataUtils.groupBy(data, key);
    res.json({ status: 'ok', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// List available utilities
app.get('/api/utils/list', (req, res) => {
  res.json({
    status: 'ok',
    utilities: {
      crypto: {
        endpoints: [
          'POST /api/crypto/hash',
          'POST /api/crypto/hmac',
          'POST /api/crypto/base64-encode',
          'POST /api/crypto/base64-decode',
          'POST /api/crypto/random-bytes',
          'POST /api/crypto/uuid'
        ],
        algorithms: cryptoUtils.getSupportedAlgorithms()
      },
      text: {
        endpoints: [
          'POST /api/text/count',
          'POST /api/text/replace',
          'POST /api/text/case',
          'POST /api/text/count-all',
          'POST /api/text/slugify',
          'POST /api/text/truncate'
        ],
        operations: textUtils.getSupportedOperations()
      },
      data: {
        endpoints: [
          'POST /api/data/parse-json',
          'POST /api/data/stringify-json',
          'POST /api/data/parse-csv',
          'POST /api/data/to-csv',
          'POST /api/data/filter',
          'POST /api/data/sort',
          'POST /api/data/unique',
          'POST /api/data/group-by'
        ],
        operations: dataUtils.getSupportedOperations()
      }
    },
    timestamp: new Date().toISOString()
  });
});

// ============================================================================

// ============================================================================
// Knowledge Management API
// Voice-first note-taking with NotebookLM-style features
// ============================================================================

// Initialize knowledge system (lazy)
let knowledgeStore = null;
let documentParser = null;
let documentGenerator = null;
let ttsEngine = null;

function initKnowledgeSystem() {
  if (!db) {
    throw new Error('Knowledge system requires database (run with --local)');
  }

  if (!knowledgeStore) {
    const KnowledgeStore = require('./lib/knowledge-store');
    knowledgeStore = new KnowledgeStore(db);
  }

  if (!documentParser) {
    const DocumentParser = require('./lib/document-parser');
    documentParser = new DocumentParser();
  }

  if (!documentGenerator) {
    const DocumentGenerator = require('./lib/document-generator');
    documentGenerator = new DocumentGenerator();
  }

  if (!ttsEngine) {
    const TTSEngine = require('./lib/tts-engine');
    ttsEngine = new TTSEngine({ provider: 'openai' });
  }

  return { knowledgeStore, documentParser, documentGenerator, ttsEngine };
}

// Create note
app.post('/api/notes', async (req, res) => {
  try {
    const { knowledgeStore } = initKnowledgeSystem();

    const note = await knowledgeStore.createNote(req.body);

    // Broadcast to all connected WebSocket clients
    broadcast({
      type: 'voice_note',
      message: note.content,
      timestamp: note.created_at,
      metadata: {
        noteId: note.id,
        title: note.title,
        source: note.source,
        category: note.category,
        tags: note.tags
      }
    });

    res.json({
      status: 'ok',
      note: note
    });
  } catch (error) {
    console.error('Failed to create note:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get note by ID
app.get('/api/notes/:id', async (req, res) => {
  try {
    const { knowledgeStore } = initKnowledgeSystem();

    // Validate note ID
    const noteId = parseInt(req.params.id);
    if (isNaN(noteId) || noteId <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid note ID'
      });
    }

    const note = await knowledgeStore.getNote(
      noteId,
      req.query.userId,
      req.query.sessionId
    );

    if (!note) {
      return res.status(404).json({
        status: 'error',
        message: 'Note not found'
      });
    }

    res.json({
      status: 'ok',
      note: note
    });
  } catch (error) {
    console.error('Failed to get note:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Update note
app.put('/api/notes/:id', async (req, res) => {
  try {
    const { knowledgeStore } = initKnowledgeSystem();

    const note = await knowledgeStore.updateNote(
      parseInt(req.params.id),
      req.body,
      req.body.userId,
      req.body.sessionId
    );

    res.json({
      status: 'ok',
      note: note
    });
  } catch (error) {
    console.error('Failed to update note:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Delete note
app.delete('/api/notes/:id', async (req, res) => {
  try {
    const { knowledgeStore } = initKnowledgeSystem();

    const result = await knowledgeStore.deleteNote(
      parseInt(req.params.id),
      req.query.userId,
      req.query.sessionId
    );

    res.json({
      status: 'ok',
      deleted: result.success
    });
  } catch (error) {
    console.error('Failed to delete note:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Search notes (with semantic search fallback)
app.get('/api/notes/search', async (req, res) => {
  try {
    const { knowledgeStore } = initKnowledgeSystem();

    const { q, limit, offset, category, tags, source, userId, semantic } = req.query;

    if (!q) {
      return res.status(400).json({
        status: 'error',
        message: 'query parameter q is required'
      });
    }

    let notes;

    // Try semantic search first if requested
    if (semantic === 'true') {
      try {
        const embedder = knowledgeStore.getEmbedder();
        const queryEmbedding = await embedder.generate(q);
        notes = await knowledgeStore.semanticSearch(queryEmbedding, {
          limit: parseInt(limit) || 50,
          category,
          userId
        });
        console.log(`✓ Semantic search returned ${notes.length} results`);
      } catch (error) {
        console.error('⚠️  Semantic search failed, falling back to text search:', error.message);
        notes = await knowledgeStore.searchNotes(q, {
          limit: parseInt(limit) || 50,
          offset: parseInt(offset) || 0,
          category,
          tags: tags ? tags.split(',') : null,
          source,
          userId
        });
      }
    } else {
      // Standard full-text search
      notes = await knowledgeStore.searchNotes(q, {
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0,
        category,
        tags: tags ? tags.split(',') : null,
        source,
        userId
      });
    }

    res.json({
      status: 'ok',
      notes: notes,
      count: notes.length,
      searchType: semantic === 'true' ? 'semantic' : 'fulltext'
    });
  } catch (error) {
    console.error('Failed to search notes:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get recent notes
app.get('/api/notes/recent', async (req, res) => {
  try {
    const { knowledgeStore } = initKnowledgeSystem();

    const notes = await knowledgeStore.getRecentNotes(
      parseInt(req.query.limit) || 20,
      req.query.userId
    );

    res.json({
      status: 'ok',
      notes: notes
    });
  } catch (error) {
    console.error('Failed to get recent notes:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Upload document
app.post('/api/notes/upload', async (req, res) => {
  try {
    const { knowledgeStore, documentParser } = initKnowledgeSystem();

    const { file, mimeType, userId, sessionId, category, tags } = req.body;

    if (!file) {
      return res.status(400).json({
        status: 'error',
        message: 'file (base64) is required'
      });
    }

    // Parse document
    const buffer = Buffer.from(file, 'base64');
    const parsed = await documentParser.parseBuffer(buffer, mimeType);

    // Create note
    const note = await knowledgeStore.createNote({
      title: req.body.filename || 'Uploaded Document',
      content: parsed.text,
      source: 'upload',
      sourceFile: req.body.filename,
      mimeType: mimeType,
      tags: tags || [],
      category: category || 'uploads',
      userId,
      sessionId
    });

    // Create chunks if document is large
    if (parsed.chunks && parsed.chunks.length > 1) {
      for (let i = 0; i < parsed.chunks.length; i++) {
        await knowledgeStore.createChunk(note.id, i, parsed.chunks[i], {
          pageCount: parsed.metadata.pages
        });
      }
    }

    res.json({
      status: 'ok',
      note: note,
      chunks: parsed.chunks.length,
      metadata: parsed.metadata
    });
  } catch (error) {
    console.error('Failed to upload document:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Chat with knowledge base
app.post('/api/notes/chat', async (req, res) => {
  try {
    const { knowledgeStore } = initKnowledgeSystem();

    const { query, sessionId, voiceInput = false, voiceOutput = false } = req.body;

    if (!query) {
      return res.status(400).json({
        status: 'error',
        message: 'query is required'
      });
    }

    // Search relevant notes (semantic search would go here)
    const relevantNotes = await knowledgeStore.searchNotes(query, { limit: 5 });

    // Generate AI response using relevant notes as context
    const context = relevantNotes.map(n => `${n.title}: ${n.preview}`).join('\n\n');

    const aiPrompt = `Based on these notes:\n\n${context}\n\nUser question: ${query}\n\nProvide a helpful answer:`;

    // Call AI (placeholder - integrate with your AI system)
    const aiResponse = `Based on your notes, here's what I found... (AI integration needed)`;

    // Save chat message
    const chat = await knowledgeStore.saveChatMessage(
      sessionId || `session_${Date.now()}`,
      query,
      aiResponse,
      {
        sourceNotes: relevantNotes.map(n => n.id),
        voiceInput,
        voiceOutput
      }
    );

    // Generate TTS if voice output requested
    let audioPath = null;
    if (voiceOutput && ttsEngine) {
      audioPath = await ttsEngine.speak(aiResponse);
    }

    res.json({
      status: 'ok',
      response: aiResponse,
      sourceNotes: relevantNotes,
      audioPath: audioPath,
      chatId: chat.id
    });
  } catch (error) {
    console.error('Failed to chat with knowledge base:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Generate document from notes
app.post('/api/notes/generate', async (req, res) => {
  try {
    const { knowledgeStore, documentGenerator } = initKnowledgeSystem();

    const { noteIds, format, title, template = 'summary' } = req.body;

    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'noteIds array is required'
      });
    }

    if (!format) {
      return res.status(400).json({
        status: 'error',
        message: 'format is required (pdf, markdown, html, docx, json)'
      });
    }

    // Fetch notes
    const notes = [];
    for (const noteId of noteIds) {
      const note = await knowledgeStore.getNote(noteId);
      if (note) {
        notes.push(note);
      }
    }

    if (notes.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No notes found'
      });
    }

    // Generate document
    const result = await documentGenerator.generate(notes, format, {
      title: title || `Generated Document`,
      template: template
    });

    res.json({
      status: 'ok',
      ...result
    });
  } catch (error) {
    console.error('Failed to generate document:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Text-to-speech endpoint
app.post('/api/tts/speak', async (req, res) => {
  try {
    const { ttsEngine } = initKnowledgeSystem();

    const { text, voice = 'alloy', format = 'mp3', speed = 1.0 } = req.body;

    if (!text) {
      return res.status(400).json({
        status: 'error',
        message: 'text is required'
      });
    }

    const audioPath = await ttsEngine.speak(text, { voice, format, speed });

    res.json({
      status: 'ok',
      audioPath: audioPath,
      voice: voice,
      format: format
    });
  } catch (error) {
    console.error('Failed to generate speech:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get note statistics
app.get('/api/notes/stats', async (req, res) => {
  try {
    const { knowledgeStore } = initKnowledgeSystem();

    const stats = await knowledgeStore.getStatistics(req.query.userId);

    res.json({
      status: 'ok',
      stats: stats
    });
  } catch (error) {
    console.error('Failed to get statistics:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get categories
app.get('/api/notes/categories', async (req, res) => {
  try {
    const { knowledgeStore } = initKnowledgeSystem();

    const categories = await knowledgeStore.getCategories(req.query.userId);

    res.json({
      status: 'ok',
      categories: categories
    });
  } catch (error) {
    console.error('Failed to get categories:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get tags
app.get('/api/notes/tags', async (req, res) => {
  try {
    const { knowledgeStore } = initKnowledgeSystem();

    const tags = await knowledgeStore.getTags(req.query.userId);

    res.json({
      status: 'ok',
      tags: tags
    });
  } catch (error) {
    console.error('Failed to get tags:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Domain Portfolio Routes
// ============================================================================

const domainRoutes = require('./routes/domain-routes');
if (localMode && db) {
  domainRoutes.init(db);
  app.use('/api/domains', domainRoutes.router);
  console.log('✓ Domain portfolio routes enabled');
}

// ============================================================================
// Domain Challenge Routes (Teacher/Student Testing System)
// ============================================================================

const challengeRoutes = require('./routes/challenge-routes');
if (localMode && db) {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  challengeRoutes.init(db, ollamaUrl);
  app.use('/api/challenges', challengeRoutes.router);
  console.log('✓ Domain challenge routes enabled');
}

// ============================================================================
// Voice Pipeline Routes (Voice-Driven Automation)
// ============================================================================

const voicePipelineRoutes = require('./routes/voice-pipeline-routes');
if (localMode && db) {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  voicePipelineRoutes.init(db, {
    ollamaUrl,
    autoJudge: true,  // Auto-select winner
    autoDeploy: false // Manual deploy for now
  });
  app.use('/api/voice', voicePipelineRoutes.router);
  console.log('✓ Voice pipeline routes enabled');
}

// ============================================================================
// AI Builder Workshop Endpoints
// ============================================================================

const BuilderAgent = require('./lib/builder-agent');
let builderAgent = null;

// Start new build
app.post('/api/builder/start', async (req, res) => {
  try {
    const { model } = req.body;

    // Initialize builder agent
    builderAgent = new BuilderAgent({
      ollama: model || 'deepseek-coder:33b',
      broadcast: (data) => {
        // Broadcast to all WebSocket clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      }
    });

    // Load spec
    const specPath = path.join(__dirname, '../docs/TOOL-CALLING-SYSTEM-SPEC.md');
    const tasks = await builderAgent.loadSpec(specPath);

    res.json({
      status: 'ok',
      tasks,
      message: `Builder initialized with ${tasks.length} tasks`
    });
  } catch (error) {
    console.error('Failed to start builder:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Implement a specific task
app.post('/api/builder/implement/:taskId', async (req, res) => {
  try {
    if (!builderAgent) {
      return res.status(400).json({
        status: 'error',
        error: 'Builder not initialized. Call /api/builder/start first.'
      });
    }

    const taskId = parseInt(req.params.taskId);
    const result = await builderAgent.implementTask(taskId);

    res.json({
      status: 'ok',
      result
    });
  } catch (error) {
    console.error('Failed to implement task:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Run tests for a phase
app.post('/api/builder/test/:phase', async (req, res) => {
  try {
    if (!builderAgent) {
      return res.status(400).json({
        status: 'error',
        error: 'Builder not initialized'
      });
    }

    const phase = req.params.phase;
    const results = await builderAgent.runTests(phase);

    res.json({
      status: 'ok',
      results
    });
  } catch (error) {
    console.error('Failed to run tests:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Add teacher comment
app.post('/api/builder/comment', async (req, res) => {
  try {
    if (!builderAgent) {
      return res.status(400).json({
        status: 'error',
        error: 'Builder not initialized'
      });
    }

    const { type, text } = req.body;

    if (!type || !text) {
      return res.status(400).json({
        status: 'error',
        error: 'type and text are required'
      });
    }

    const comment = builderAgent.addComment(type, text);

    res.json({
      status: 'ok',
      comment,
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Failed to add comment:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Get build progress
app.get('/api/builder/progress', (req, res) => {
  try {
    if (!builderAgent) {
      return res.json({
        status: 'ok',
        progress: { total: 0, completed: 0, failed: 0, pending: 0, percent: 0 }
      });
    }

    const progress = builderAgent.getProgress();
    res.json({
      status: 'ok',
      progress
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Get build summary
app.get('/api/builder/summary', (req, res) => {
  try {
    if (!builderAgent) {
      return res.json({
        status: 'ok',
        summary: { progress: {}, tests: {}, comments: 0 }
      });
    }

    const summary = builderAgent.getSummary();
    res.json({
      status: 'ok',
      summary
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// VANITY HANDLES API - @username System
// ============================================================================

// Initialize vanity handles manager (lazy load when db available)
let vanityHandlesManager = null;

function getVanityHandlesManager() {
  if (!vanityHandlesManager && db) {
    const VanityHandlesManager = require('./lib/vanity-handles-manager');
    vanityHandlesManager = new VanityHandlesManager(db);
  }
  return vanityHandlesManager;
}

// Check handle availability
app.get('/api/vanity/check/:handle', async (req, res) => {
  try {
    const manager = getVanityHandlesManager();
    if (!manager) {
      return res.status(503).json({
        success: false,
        error: 'Database not available (requires --local mode)'
      });
    }

    const { handle } = req.params;
    const result = await manager.checkAvailability(handle);

    res.json(result);
  } catch (error) {
    console.error('[API] Error checking handle:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Claim a handle
app.post('/api/vanity/claim', async (req, res) => {
  try {
    const manager = getVanityHandlesManager();
    if (!manager) {
      return res.status(503).json({
        success: false,
        error: 'Database not available (requires --local mode)'
      });
    }

    const { handle } = req.body;
    const userId = req.session?.userId || req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Must be logged in to claim a handle'
      });
    }

    // Get IP and user agent
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    const result = await manager.claimHandle(userId, handle, ipAddress, userAgent);

    res.json(result);
  } catch (error) {
    console.error('[API] Error claiming handle:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get premium handles
app.get('/api/vanity/premium', async (req, res) => {
  try {
    const manager = getVanityHandlesManager();
    if (!manager) {
      return res.status(503).json({
        success: false,
        error: 'Database not available (requires --local mode)'
      });
    }

    const handles = await manager.getPremiumHandles();

    res.json({
      success: true,
      handles
    });
  } catch (error) {
    console.error('[API] Error getting premium handles:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get recent handle changes
app.get('/api/vanity/recent-changes', async (req, res) => {
  try {
    const manager = getVanityHandlesManager();
    if (!manager) {
      return res.status(503).json({
        success: false,
        error: 'Database not available (requires --local mode)'
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const changes = await manager.getRecentChanges(limit);

    res.json({
      success: true,
      changes
    });
  } catch (error) {
    console.error('[API] Error getting recent changes:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get stats
app.get('/api/vanity/stats', async (req, res) => {
  try {
    const manager = getVanityHandlesManager();
    if (!manager) {
      return res.status(503).json({
        success: false,
        error: 'Database not available (requires --local mode)'
      });
    }

    const stats = await manager.getStats();

    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('[API] Error getting stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user by handle
app.get('/api/vanity/user/:handle', async (req, res) => {
  try {
    const manager = getVanityHandlesManager();
    if (!manager) {
      return res.status(503).json({
        success: false,
        error: 'Database not available (requires --local mode)'
      });
    }

    const { handle } = req.params;
    const user = await manager.getUserByHandle(handle);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Don't expose email
    delete user.email;

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('[API] Error getting user by handle:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// COMMAND CENTER ROUTES
// ============================================================================

// Lazy-load CommandRouter (brand-specific instances)
let commandRouters = {};
function getCommandRouter(brand = 'calriven') {
  if (!commandRouters[brand]) {
    const CommandRouter = require('./lib/command-router');
    commandRouters[brand] = new CommandRouter({ llmRouter, brand });
  }
  return commandRouters[brand];
}

// Execute command from command center
app.post('/api/command', async (req, res) => {
  try {
    const { command, context } = req.body;

    if (!command || typeof command !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Command is required'
      });
    }

    const brand = context?.brand || 'calriven';
    console.log(`[API] Command received (${brand}): "${command}"`);

    const router = getCommandRouter(brand);
    const result = await router.route(command, context || {});

    res.json(result);

  } catch (error) {
    console.error('[API] Error executing command:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      status: 'error'
    });
  }
});

// Get command suggestions based on partial input
app.get('/api/command/suggestions', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.json({ suggestions: [] });
    }

    const router = getCommandRouter();
    const suggestions = await router.getSuggestions(q);

    res.json({ suggestions });

  } catch (error) {
    console.error('[API] Error getting suggestions:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Asset Preview API endpoints
app.get('/api/assets/list', async (req, res) => {
  try {
    const ragebaitDir = path.join(__dirname, 'temp/ragebait');

    // Ensure directory exists
    if (!fs.existsSync(ragebaitDir)) {
      return res.json({ assets: [], total: 0 });
    }

    const files = await fs.promises.readdir(ragebaitDir);
    const assets = [];

    for (const file of files) {
      if (file.startsWith('.')) continue; // Skip hidden files

      const filePath = path.join(ragebaitDir, file);
      const stats = await fs.promises.stat(filePath);

      if (!stats.isFile()) continue;

      const ext = path.extname(file);
      const watermarked = file.includes('-watermarked');

      assets.push({
        name: file,
        path: filePath,
        url: `/temp/ragebait/${file}`,
        ext,
        size: stats.size,
        mtime: stats.mtimeMs,
        watermarked,
        type: watermarked ? 'watermarked' : 'original'
      });
    }

    res.json({
      assets,
      total: assets.length,
      watermarked: assets.filter(a => a.watermarked).length,
      original: assets.filter(a => !a.watermarked).length
    });

  } catch (error) {
    console.error('[API] Error listing assets:', error.message);
    res.status(500).json({
      error: error.message,
      assets: []
    });
  }
});

app.get('/api/assets/download', async (req, res) => {
  try {
    const { path: assetPath } = req.query;

    if (!assetPath) {
      return res.status(400).json({ error: 'Path parameter required' });
    }

    // Security: ensure path is within ragebait directory
    const ragebaitDir = path.join(__dirname, 'temp/ragebait');
    const requestedPath = path.resolve(assetPath);
    const allowedPath = path.resolve(ragebaitDir);

    if (!requestedPath.startsWith(allowedPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(requestedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(requestedPath);

  } catch (error) {
    console.error('[API] Error downloading asset:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get command center status (all tools)
app.get('/api/command/status', async (req, res) => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      tools: {
        ragebait: { status: 'ready', emoji: '🟢' },
        podcast: { status: 'ready', emoji: '🟢' },
        'file-explorer': { status: 'ready', emoji: '🟢' },
        'vanity-handles': { status: 'ready', emoji: '🟢' },
        'artifact-builder': { status: 'ready', emoji: '🟢' },
        'brand-presentation': { status: 'ready', emoji: '🟢' }
      }
    };

    // Check if file explorer is running
    try {
      const fetch = require('node-fetch');
      await fetch('http://localhost:3030/api/scan', { timeout: 1000 });
      status.tools['file-explorer'].status = 'ready';
      status.tools['file-explorer'].emoji = '🟢';
    } catch (e) {
      status.tools['file-explorer'].status = 'offline';
      status.tools['file-explorer'].emoji = '🔴';
    }

    res.json(status);

  } catch (error) {
    console.error('[API] Error getting status:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================

// Introspection endpoint
app.get('/introspect', (req, res) => {
  try {
    const SystemInfo = require('../lib/system-info');
    const systemInfo = new SystemInfo();

    const { format = 'json' } = req.query;

    // Get all components
    const components = systemInfo.listComponents();

    if (format === 'xml') {
      // Generate XML representation
      const xmlbuilder = require('xmlbuilder');
      const xml = xmlbuilder.create('calos', { version: '1.0', encoding: 'UTF-8' });

      const componentsEl = xml.ele('components');

      for (const component of components) {
        const compEl = componentsEl.ele('component')
          .att('id', component.id)
          .att('status', component.status);

        compEl.ele('name', component.name);
        compEl.ele('description', component.description);
        compEl.ele('type', component.type);

        if (component.port) {
          compEl.ele('port', component.port);
        }

        if (component.path) {
          compEl.ele('path', component.path);
        }
      }

      res.set('Content-Type', 'application/xml');
      res.send(xml.end({ pretty: true }));
    } else {
      // JSON format
      res.json({
        status: 'ok',
        components: components,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Test AI conversation logging (verify system works)
app.post('/api/test-ai-logging', async (req, res) => {
  try {
    const ExternalBugReporter = require('./lib/external-bug-reporter');
    const reporter = new ExternalBugReporter({
      db,
      verbose: true
    });

    console.log('[Test] Testing AI conversation logging...');

    const result = await reporter.reportToOpenAI({
      error: 'Test error for conversation logging verification',
      file: '/test/example.js',
      line: 42,
      context: 'This is a test to verify AI conversations are being logged to the database'
    });

    if (result.success) {
      // Check if conversation was logged
      const check = await db.query(
        'SELECT conversation_id, service, model, purpose FROM ai_conversations ORDER BY created_at DESC LIMIT 1'
      );

      res.json({
        success: true,
        message: 'AI conversation logging working correctly',
        openai_response: result.diagnosis,
        logged_to_database: check.rows.length > 0,
        conversation_id: check.rows[0]?.conversation_id
      });
    } else {
      res.json({
        success: false,
        error: result.error,
        message: 'OpenAI call failed (check API key)'
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Test failed - check if ai_conversations table exists (run migrations)'
    });
  }
});

// Start server
const PORT = process.env.PORT || 5001;
// Bind host - use BIND_HOST env var for localhost-only mode (privacy)
// Default: 0.0.0.0 (all interfaces) for development/mobile access
// CalRiven private mode: 127.0.0.1 (localhost only, no external access)
const HOST = process.env.BIND_HOST || process.env.HOST || '0.0.0.0';

// Initialize QR Generator
const qrGenerator = new QRGenerator({
  port: PORT,
  serviceName: 'CalOS Router'
});

// Initialize mDNS/Bonjour
let bonjourService = null;

server.listen(PORT, HOST, async () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  CalOS Intelligent Router              ║');
  console.log('║  with Smart Orchestration              ║');
  console.log('╚════════════════════════════════════════╝');

  const localIP = qrGenerator.getLocalIP();
  const mainURL = qrGenerator.generateLocalURL('/');
  const oauthURL = qrGenerator.generateLocalURL('/oauth-upload.html');

  console.log(`\n🚀 HTTP Server:     http://localhost:${PORT}`);
  if (localIP && localIP !== 'localhost') {
    console.log(`📱 Mobile Access:   http://${localIP}:${PORT}`);

    // Start mDNS/Bonjour service advertisement
    try {
      const bonjour = new Bonjour();
      bonjourService = bonjour.publish({
        name: 'CalOS Router',
        type: 'http',
        port: PORT,
        txt: {
          path: '/mobile-access.html',
          version: '1.0.0',
          oauth: '/oauth-upload.html'
        }
      });
      console.log(`📡 mDNS:            calos-router.local (auto-discovery enabled)`);
    } catch (error) {
      console.error('⚠️  mDNS:            Failed to start (continuing without auto-discovery)');
    }

    // Display QR code for OAuth upload page
    console.log('\n📱 OAuth Upload - Scan with phone:\n');
    const qrCode = await qrGenerator.generateTerminal(oauthURL);
    console.log(qrCode);
  }
  console.log(`🔌 WebSocket:       ws://localhost:${PORT}`);

  if (localMode && db) {
    console.log(`🗄️  Database Mode:   ${dbType.toUpperCase()} (--local)`);
    console.log(`   • Caching AI responses for offline use`);
    console.log(`   • Semantic search enabled`);
  } else if (localMode && !db) {
    console.log(`⚠️  Local Mode:      Failed (using API fallback)`);
  } else {
    console.log(`☁️  API Mode:        Live (use --local for caching)`);
  }

  console.log(`\n🤖 Intelligent Routing:`);
  console.log(`   • @mentions support (@gpt4, @claude, @ollama)`);
  console.log(`   • Smart query classification`);
  console.log(`   • Auto-delegation when busy/offline`);
  console.log(`   • Email-like features (CC, BCC)`);
  console.log(`\n📡 Key Endpoints:`);
  console.log(`   POST   /api/agent              - Run AI agents`);
  console.log(`   POST   /api/oauth/upload-screenshots - Upload OAuth screenshots`);
  console.log(`   GET    /api/qr-code            - Get QR code (NEW)`);
  console.log(`   GET    /api/network-info       - Network info (NEW)`);
  console.log(`   GET    /health                 - Health check`);
  console.log(`\n🎓 Learning Loop:`);
  console.log(`   POST   /transcribe-voice       - Transcribe audio to text`);
  console.log(`   POST   /learning-loop          - Submit query for learning`);
  console.log(`   POST   /learning-feedback      - Provide feedback/corrections`);
  console.log(`   GET    /learning-stats         - View learning statistics`);
  console.log(`\n💡 Mobile Access:`);
  console.log(`   • OAuth Upload: ${oauthURL}`);
  console.log(`   • GET /api/qr-code?path=/oauth-upload.html for QR image`);

  // Check brand presentation dependencies
  console.log(`\n🎨 Brand Presentations:`);
  try {
    await execAsync('which convert');
    await execAsync('which ffmpeg');
    console.log(`   ✓ ImageMagick installed (PDF/GIF export)`);
    console.log(`   ✓ FFmpeg installed (MP4 export)`);
  } catch (error) {
    console.log(`   ⚠️  ImageMagick/FFmpeg not found`);
    console.log(`   ℹ️  Brand presentations limited to Markdown export only`);
    console.log(`   ℹ️  Install: brew install imagemagick ffmpeg (macOS)`);
    console.log(`   ℹ️           apt-get install imagemagick ffmpeg (Linux)`);
  }

  console.log(`\n`);
});

// Note: Graceful shutdown now handled by CalErrorInterceptor
// SIGTERM, SIGINT, uncaughtException, unhandledRejection all captured globally
