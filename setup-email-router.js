/**
 * Email Router Setup & Integration
 *
 * Initializes the email routing system with all components:
 * - Email poller with Gmail & Microsoft adapters
 * - AI classifier with Ollama
 * - API routes
 * - Real-time event handling
 */

const EmailPoller = require('./lib/email-poller');
const EmailClassifier = require('./lib/email-classifier');
const GmailAdapter = require('./lib/email-adapters/gmail');
const MicrosoftAdapter = require('./lib/email-adapters/microsoft');
const emailRoutes = require('./routes/email');

/**
 * Initialize email router system
 */
async function setupEmailRouter(app, db) {
  console.log('\n=================================================');
  console.log('🚀 Initializing Email Router System');
  console.log('=================================================\n');

  // Step 1: Create email classifier
  console.log('[Setup] Creating AI email classifier...');
  const emailClassifier = new EmailClassifier(db, {
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama2',
    confidenceThreshold: 0.6,
    useRulesFirst: true
  });
  console.log('✓ Email classifier ready\n');

  // Step 2: Create email poller
  console.log('[Setup] Creating email poller...');
  const emailPoller = new EmailPoller(db, {
    defaultPollInterval: 60000, // 1 minute
    maxMessagesPerPoll: 50,
    enableAutoClassification: true
  });
  console.log('✓ Email poller ready\n');

  // Step 3: Register email adapters
  console.log('[Setup] Registering email adapters...');

  const gmailAdapter = new GmailAdapter({ maxResults: 50 });
  emailPoller.registerAdapter('gmail', gmailAdapter);
  console.log('  ✓ Gmail adapter registered');

  const microsoftAdapter = new MicrosoftAdapter({ maxResults: 50 });
  emailPoller.registerAdapter('microsoft', microsoftAdapter);
  console.log('  ✓ Microsoft adapter registered\n');

  // Step 4: Set up event handlers
  console.log('[Setup] Setting up event handlers...');

  // When a new message is stored, classify it
  emailPoller.on('message', async (event) => {
    try {
      console.log(`[EmailPoller] New message: ${event.subject}`);
      await emailClassifier.classify(event.messageId);
    } catch (error) {
      console.error('[EmailPoller] Classification error:', error.message);
    }
  });

  // When a batch completes
  emailPoller.on('batch-complete', (event) => {
    console.log(`[EmailPoller] Batch complete for account ${event.accountId}: ${event.messageCount} messages, ${event.errorCount} errors`);
  });

  // When polling starts
  emailPoller.on('started', (event) => {
    console.log(`[EmailPoller] Started polling ${event.accountCount} account(s)`);
  });

  // When an error occurs
  emailPoller.on('error', (event) => {
    console.error(`[EmailPoller] Error on account ${event.accountId}:`, event.error);
  });

  console.log('✓ Event handlers configured\n');

  // Step 5: Initialize API routes
  console.log('[Setup] Initializing API routes...');
  emailRoutes.init({
    db,
    emailPoller,
    emailClassifier
  });

  app.use('/api/email', emailRoutes.router);
  console.log('✓ API routes mounted at /api/email\n');

  // Step 6: Start email poller
  console.log('[Setup] Starting email poller...');
  await emailPoller.start();
  console.log('✓ Email poller started\n');

  console.log('=================================================');
  console.log('✅ Email Router System Ready!');
  console.log('=================================================');
  console.log('');
  console.log('📍 Available Endpoints:');
  console.log('  GET    /api/email/accounts           - List email accounts');
  console.log('  POST   /api/email/accounts           - Add email account');
  console.log('  PATCH  /api/email/accounts/:id       - Update account');
  console.log('  DELETE /api/email/accounts/:id       - Remove account');
  console.log('  POST   /api/email/accounts/:id/sync  - Manual sync');
  console.log('');
  console.log('  GET    /api/email/inbox              - Unified inbox');
  console.log('  GET    /api/email/messages/:id       - Get message');
  console.log('  PATCH  /api/email/messages/:id       - Update message');
  console.log('  POST   /api/email/messages/:id/classify - Classify message');
  console.log('');
  console.log('  GET    /api/email/categories         - Category stats');
  console.log('  GET    /api/email/stats              - Classification stats');
  console.log('');
  console.log('  GET    /api/email/rules              - Routing rules');
  console.log('  POST   /api/email/rules              - Create rule');
  console.log('  DELETE /api/email/rules/:id          - Delete rule');
  console.log('');
  console.log('  GET    /api/email/status             - System status');
  console.log('');
  console.log('🎨 UI:');
  console.log('  Web:    http://localhost:5001/email-dashboard.html');
  console.log('  Mobile: EmailScreen.js (React Native)');
  console.log('');
  console.log('🤖 Features:');
  console.log('  ✓ Multi-account email (Gmail, Outlook, Yahoo, AOL)');
  console.log('  ✓ AI classification with local Ollama');
  console.log('  ✓ Learning from user corrections');
  console.log('  ✓ Drag-and-drop reclassification (BinaryTree style)');
  console.log('  ✓ Auto-routing rules');
  console.log('  ✓ Real-time polling');
  console.log('  ✓ Unified inbox across accounts');
  console.log('');

  return {
    emailPoller,
    emailClassifier,
    gmailAdapter,
    microsoftAdapter
  };
}

/**
 * Graceful shutdown
 */
async function shutdownEmailRouter(emailPoller) {
  console.log('\n[Shutdown] Stopping email poller...');
  await emailPoller.stop();
  console.log('✓ Email poller stopped');
}

module.exports = {
  setupEmailRouter,
  shutdownEmailRouter
};
