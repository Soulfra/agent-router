/**
 * Gmail Monitor - Auto-handle GitHub Notifications
 * Monitors Gmail for GitHub notifications and routes to appropriate handlers
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const ROUTER_URL = process.env.ROUTER_URL || 'http://localhost:5001';
const CHECK_INTERVAL = parseInt(process.env.GMAIL_CHECK_INTERVAL) || 60000; // 60 seconds
const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH || './gmail-credentials.json';
const TOKEN_PATH = process.env.GMAIL_TOKEN_PATH || './gmail-token.json';

class GmailMonitor {
  constructor() {
    this.isProcessing = false;
    this.auth = null;
    this.gmail = null;
  }

  /**
   * Initialize Gmail API client
   */
  async initialize() {
    try {
      // Load credentials
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

      this.auth = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      // Load token
      if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        this.auth.setCredentials(token);
      } else {
        throw new Error(`Token not found at ${TOKEN_PATH}. Run authorize script first.`);
      }

      this.gmail = google.gmail({ version: 'v1', auth: this.auth });

      console.log('✓ Gmail API initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Gmail API:', error.message);
      throw error;
    }
  }

  /**
   * Check for new GitHub notifications
   */
  async checkNotifications() {
    if (this.isProcessing) {
      console.log('⏳ Previous check still processing...');
      return;
    }

    try {
      this.isProcessing = true;
      console.log(`\n🔍 Checking Gmail for GitHub notifications... [${new Date().toISOString()}]`);

      // Query: unread emails from GitHub
      const query = 'from:notifications@github.com is:unread';

      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 10
      });

      const messages = response.data.messages || [];

      if (messages.length === 0) {
        console.log('✓ No new GitHub notifications');
        return;
      }

      console.log(`📬 Found ${messages.length} new notification(s)`);

      // Process each notification
      for (const message of messages) {
        await this.processNotification(message.id);
      }

    } catch (error) {
      console.error('❌ Error checking notifications:', error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single notification
   */
  async processNotification(messageId) {
    try {
      // Get full message
      const message = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const headers = message.data.payload.headers;
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
      const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';

      console.log(`\n📧 Processing: ${subject}`);

      // Extract GitHub notification type
      const notificationType = this.classifyNotification(subject);

      if (!notificationType) {
        console.log('⚠️  Unrecognized notification type, skipping');
        return;
      }

      // Get email body
      const body = this.extractBody(message.data.payload);

      // Extract relevant info
      const notificationData = {
        type: notificationType,
        subject,
        body,
        messageId
      };

      console.log(`   Type: ${notificationType}`);

      // Send to GitHub action handler
      await axios.post(`${ROUTER_URL}/github-action`, notificationData);

      // Mark as read
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });

      console.log('✓ Notification processed and marked as read');

    } catch (error) {
      console.error(`❌ Error processing notification ${messageId}:`, error.message);
    }
  }

  /**
   * Classify GitHub notification type
   */
  classifyNotification(subject) {
    const patterns = {
      'pr_review_request': /requested your review|Review requested/i,
      'pr_mention': /mentioned you.*pull request/i,
      'issue_mention': /mentioned you.*issue/i,
      'issue_assigned': /assigned you to.*issue/i,
      'pr_commented': /commented on.*pull request/i,
      'issue_commented': /commented on.*issue/i,
      'security_alert': /security.*alert|vulnerability|dependabot/i,
      'pages_failure': /pages build.*fail|deployment.*fail/i,
      'workflow_failure': /workflow.*fail|action.*fail/i
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(subject)) {
        return type;
      }
    }

    return null;
  }

  /**
   * Extract email body text
   */
  extractBody(payload) {
    if (payload.body && payload.body.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf8');
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf8');
        }
      }
    }

    return '';
  }

  /**
   * Start monitoring
   */
  start() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  Gmail Monitor - GitHub Notifications ║');
    console.log('║  Auto-respond to GitHub emails         ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    console.log(`📧 Gmail Account: Configured`);
    console.log(`🔗 CALOS Router: ${ROUTER_URL}`);
    console.log(`⏱️  Check Interval: ${CHECK_INTERVAL / 1000}s`);
    console.log('');
    console.log('🚀 Monitor started. Watching for GitHub notifications...');
    console.log('');

    // Check immediately
    this.checkNotifications();

    // Then check periodically
    setInterval(() => {
      this.checkNotifications();
    }, CHECK_INTERVAL);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start monitor
(async () => {
  const monitor = new GmailMonitor();
  await monitor.initialize();
  monitor.start();
})();
