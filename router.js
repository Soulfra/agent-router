require('dotenv').config();
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
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const localMode = args.includes('--local');
const dbType = process.env.DB_TYPE || 'postgres'; // 'postgres' or 'sqlite'

// Database connection (lazy initialization)
let db = null;

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

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
app.use(bodyParser.json());

// Serve static files (web interface)
app.use(express.static(path.join(__dirname, 'public')));

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

// Session Tracker (for visit duration tracking)
const SessionTracker = require('./lib/session-tracker');
let sessionTracker = null; // Will be initialized after DB connection

// Auth Routes (SSO)
const { router: authRouter, initRoutes: initAuthRoutes } = require('./routes/auth-routes');
let authRoutes = null; // Will be initialized after DB connection

// OAuth Routes (Consumer - Sign in WITH Google/GitHub/etc)
const { router: oauthRouter, initRoutes: initOAuthRoutes } = require('./routes/oauth-routes');
let oauthRoutes = null; // Will be initialized after DB connection

// OAuth Provider Routes (Provider - Sign in WITH CalOS)
const { router: oauthProviderRouter, initRoutes: initOAuthProviderRoutes } = require('./routes/oauth-provider-routes');
let oauthProviderRoutes = null; // Will be initialized after DB connection

// Skills Routes
const skillsEngine = require('./lib/skills-engine');
// Skills routes don't exist yet - they're part of calculator routes

// Calculator Routes
const { router: calculatorRouter, initRoutes: initCalculatorRoutes } = require('./routes/calculator-routes');
let calculatorRoutes = null; // Will be initialized after DB connection

// Actions Routes
const { router: actionsRouter, initRoutes: initActionsRoutes } = require('./routes/actions-routes');
let actionsRoutes = null; // Will be initialized after DB connection

// Unified Feed routes
app.get('/', (req, res) => {
  res.redirect('/feed.html');
});

app.get('/unified', (req, res) => {
  res.redirect('/unified-feed.html');
});

app.get('/feed', (req, res) => {
  res.redirect('/feed.html');
});

app.get('/feed/preview', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'feed-preview.html'));
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

      db = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'calos',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || ''
      });

      // Test connection
      await db.query('SELECT NOW()');
      console.log('✓ PostgreSQL connected');

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

  // Initialize routes with database connection
  if (db) {
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

    // Initialize lofi streaming routes
    lofiRoutes = initLofiRoutes(db, broadcast, sessionTracker);
    app.use('/api/lofi', lofiRoutes);
    console.log('✓ Lofi streaming system initialized');

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

  // Initialize learning system
  try {
    await voiceTranscriber.initialize();
    await learningLoop.initialize();
  } catch (error) {
    console.error('⚠️  Learning system initialization failed:', error.message);
    console.error('   Voice transcription and learning loop will be unavailable');
  }

  // Initialize price worker in local mode
  if (localMode && db) {
    try {
      const priceWorker = new PriceWorker({ db });
      priceWorker.start();
      console.log('✓ Price worker started - automatic price fetching enabled');

      // Store reference globally for management
      global.priceWorker = priceWorker;
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
  ws.on('message', (data) => {
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CalOS Agent Router',
    uptime: process.uptime(),
    clients: clients.size,
    timestamp: new Date().toISOString()
  });
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
    <link>http://localhost:5001/feed.html</link>
    <atom:link href="http://localhost:5001/feed/rss" rel="self" type="application/rss+xml" />
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

    res.json({
      status: 'ok',
      feed: {
        title: 'CalOS Feed',
        description: 'Real-time activity feed from CalOS agent router',
        link: 'http://localhost:5001/feed.html',
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
app.post('/agent', async (req, res) => {
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

    res.json({
      status: 'ok',
      logs,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /agent endpoint:', error);

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

// Start server
const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  CalOS Intelligent Router              ║');
  console.log('║  with Smart Orchestration              ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n🚀 HTTP Server:     http://localhost:${PORT}`);
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
  console.log(`\n📡 Endpoints:`);
  console.log(`   POST   /agent              - Run AI agents`);
  console.log(`   POST   /routing/suggest    - Get routing suggestions`);
  console.log(`   GET    /agents             - View agent status`);
  console.log(`   GET    /agents/:id         - Get specific agent`);
  console.log(`   POST   /agents/:id/out-of-office  - Set OOO`);
  console.log(`   GET    /memory             - Get conversation history`);
  console.log(`   DELETE /memory             - Clear history`);
  console.log(`   GET    /health             - Health check`);
  console.log(`\n🎓 Learning Loop:`);
  console.log(`   POST   /transcribe-voice   - Transcribe audio to text`);
  console.log(`   POST   /learning-loop      - Submit query for learning`);
  console.log(`   POST   /learning-feedback  - Provide feedback/corrections`);
  console.log(`   GET    /learning-stats     - View learning statistics`);
  console.log(`\n💡 Examples:`);
  console.log(`   "@ollama help me debug this code"`);
  console.log(`   "to: @gpt4, @claude\\ncc: @ollama\\nCompare these approaches"`);
  console.log(`   "!urgent fix production bug"`);
  console.log(`\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
