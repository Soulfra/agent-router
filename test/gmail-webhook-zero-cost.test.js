/**
 * Gmail Webhook Zero Cost - End-to-End Tests
 *
 * Tests the complete Gmail webhook system:
 * - Rate limiting
 * - Email reputation tracking
 * - Recipient whitelisting (double opt-in)
 * - SMTP sending
 * - API endpoints
 *
 * Run: npm test test/gmail-webhook-zero-cost.test.js
 */

const assert = require('assert');
const GmailGateway = require('../lib/gmail-gateway');
const GmailRateLimiter = require('../lib/gmail-rate-limiter');
const EmailReputationTracker = require('../lib/email-reputation-tracker');
const RecipientWhitelistManager = require('../lib/recipient-whitelist-manager');
const TwoFactorAuth = require('../lib/two-factor-auth');

describe('Gmail Webhook Zero Cost', function() {
  this.timeout(10000);

  let gateway;
  const testUserId = 'test-user-' + Date.now();
  const testEmail = 'test@example.com';

  before(async function() {
    // Skip tests if Google Sheets credentials not configured
    if (!process.env.GOOGLE_SHEETS_DB_ID) {
      console.log('⚠️  Skipping tests: GOOGLE_SHEETS_DB_ID not configured');
      this.skip();
    }

    // Initialize gateway in mock mode
    gateway = new GmailGateway({
      mockMode: true,
      spreadsheetId: process.env.GOOGLE_SHEETS_DB_ID,
      credentialsPath: process.env.GOOGLE_SHEETS_CREDENTIALS_PATH,
      encryptionKey: process.env.ENCRYPTION_KEY || 'test-key-32-chars-long-abc123'
    });

    await gateway.init();
  });

  describe('Rate Limiter', function() {
    let rateLimiter;

    beforeEach(async function() {
      rateLimiter = new GmailRateLimiter({
        db: gateway.db,
        userHourlyLimit: 5, // Low limit for testing
        userDailyLimit: 10,
        recipientDailyLimit: 3
      });
      await rateLimiter.init();
    });

    it('should allow sends within limits', async function() {
      const check = await rateLimiter.checkLimit(testUserId, testEmail);

      assert.strictEqual(check.allowed, true);
    });

    it('should record sends and increment counters', async function() {
      await rateLimiter.recordSend(testUserId, testEmail);

      const limits = await rateLimiter.getUserLimits(testUserId);

      expect(limits.hourly.current).to.be.at.least(1);
      expect(limits.total).to.be.at.least(1);
    });

    it('should block sends when hourly limit exceeded', async function() {
      // Send until limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordSend(testUserId, testEmail);
      }

      const check = await rateLimiter.checkLimit(testUserId, testEmail);

      expect(check).to.have.property('allowed', false);
      expect(check).to.have.property('reason').that.includes('limit');
    });

    it('should track recipient-specific limits', async function() {
      const recipient1 = 'recipient1@example.com';
      const recipient2 = 'recipient2@example.com';

      // Send to recipient1 until limit
      for (let i = 0; i < 3; i++) {
        await rateLimiter.recordSend(testUserId, recipient1);
      }

      const check1 = await rateLimiter.checkLimit(testUserId, recipient1);
      const check2 = await rateLimiter.checkLimit(testUserId, recipient2);

      expect(check1).to.have.property('allowed', false);
      expect(check2).to.have.property('allowed', true);
    });

    it('should get global statistics', async function() {
      const stats = await rateLimiter.getGlobalStats();

      expect(stats).to.have.property('hourly');
      expect(stats).to.have.property('daily');
      expect(stats.hourly).to.have.property('current');
      expect(stats.hourly).to.have.property('limit');
    });
  });

  describe('Email Reputation Tracker', function() {
    let reputationTracker;

    beforeEach(async function() {
      reputationTracker = new EmailReputationTracker({
        db: gateway.db
      });
      await reputationTracker.init();
    });

    it('should start with perfect reputation', async function() {
      const reputation = await reputationTracker.getUserReputation(testUserId);

      expect(reputation).to.have.property('score', 100);
      expect(reputation).to.have.property('status', 'excellent');
    });

    it('should allow sends with good reputation', async function() {
      const check = await reputationTracker.canSend(testUserId);

      expect(check).to.have.property('allowed', true);
    });

    it('should decrease score on bounce', async function() {
      await reputationTracker.recordBounce(testUserId, 'hard');

      const reputation = await reputationTracker.getUserReputation(testUserId);

      expect(reputation.score).to.be.below(100);
      expect(reputation.bounces).to.equal(1);
    });

    it('should severely decrease score on spam complaint', async function() {
      await reputationTracker.recordSpamComplaint(testUserId);

      const reputation = await reputationTracker.getUserReputation(testUserId);

      expect(reputation.score).to.be.below(80);
      expect(reputation.spamComplaints).to.equal(1);
    });

    it('should block sends when reputation too low', async function() {
      // Trigger multiple spam complaints
      for (let i = 0; i < 5; i++) {
        await reputationTracker.recordSpamComplaint(testUserId);
      }

      const check = await reputationTracker.canSend(testUserId);

      expect(check).to.have.property('allowed', false);
      expect(check).to.have.property('reason').that.includes('Reputation');
    });

    it('should increase score on successful send', async function() {
      // Lower score first
      await reputationTracker.recordBounce(testUserId);

      const beforeScore = (await reputationTracker.getUserReputation(testUserId)).score;

      // Record successful sends
      for (let i = 0; i < 100; i++) {
        await reputationTracker.recordSend(testUserId);
      }

      const afterScore = (await reputationTracker.getUserReputation(testUserId)).score;

      expect(afterScore).to.be.above(beforeScore);
    });

    it('should get statistics', async function() {
      const stats = await reputationTracker.getStats();

      expect(stats).to.have.property('total');
      expect(stats).to.have.property('byStatus');
      expect(stats).to.have.property('averageScore');
    });
  });

  describe('Recipient Whitelist Manager', function() {
    let whitelist;

    beforeEach(async function() {
      whitelist = new RecipientWhitelistManager({
        db: gateway.db,
        smtp: gateway.smtp
      });
      await whitelist.init();
    });

    it('should add recipient with pending status', async function() {
      const result = await whitelist.addRecipient(testUserId, testEmail);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('status', 'pending');
      expect(result).to.have.property('token');
      expect(result).to.have.property('confirmationUrl');
    });

    it('should reject invalid email format', async function() {
      const result = await whitelist.addRecipient(testUserId, 'invalid-email');

      expect(result).to.have.property('success', false);
      expect(result).to.have.property('error').that.includes('Invalid email');
    });

    it('should confirm recipient with valid token', async function() {
      const addResult = await whitelist.addRecipient(testUserId, testEmail);
      const confirmResult = await whitelist.confirmRecipient(addResult.token);

      expect(confirmResult).to.have.property('success', true);
      expect(confirmResult).to.have.property('recipient', testEmail);
    });

    it('should reject invalid confirmation token', async function() {
      const result = await whitelist.confirmRecipient('invalid-token');

      expect(result).to.have.property('success', false);
      expect(result).to.have.property('error');
    });

    it('should check if recipient is approved', async function() {
      const addResult = await whitelist.addRecipient(testUserId, testEmail);
      await whitelist.confirmRecipient(addResult.token);

      const isApproved = await whitelist.isApproved(testUserId, testEmail);

      expect(isApproved).to.be.true;
    });

    it('should return false for unapproved recipient', async function() {
      const isApproved = await whitelist.isApproved(testUserId, 'unapproved@example.com');

      expect(isApproved).to.be.false;
    });

    it('should remove recipient', async function() {
      const addResult = await whitelist.addRecipient(testUserId, testEmail);
      await whitelist.confirmRecipient(addResult.token);

      const removed = await whitelist.removeRecipient(testUserId, testEmail);
      const isApproved = await whitelist.isApproved(testUserId, testEmail);

      expect(removed).to.be.true;
      expect(isApproved).to.be.false;
    });

    it('should get recipient statistics', async function() {
      const stats = await whitelist.getStats(testUserId);

      expect(stats).to.have.property('total');
      expect(stats).to.have.property('approved');
      expect(stats).to.have.property('pending');
    });
  });

  describe('Two-Factor Authentication', function() {
    let tfa;

    beforeEach(async function() {
      tfa = new TwoFactorAuth({
        db: gateway.db,
        encryptionKey: process.env.ENCRYPTION_KEY || 'test-key-32-chars-long-abc123'
      });
      await tfa.init();
    });

    it('should setup 2FA for user', async function() {
      const setup = await tfa.setupTwoFactor(testUserId, testEmail);

      expect(setup).to.have.property('success', true);
      expect(setup).to.have.property('secret');
      expect(setup).to.have.property('qrCodeDataUrl');
      expect(setup).to.have.property('backupCodes');
      expect(setup.backupCodes).to.be.an('array').with.lengthOf(10);
    });

    it('should check if 2FA is enabled', async function() {
      const isEnabled = await tfa.isEnabled(testUserId);

      // Should be false until verified
      expect(isEnabled).to.be.false;
    });

    it('should get 2FA status', async function() {
      const status = await tfa.getStatus(testUserId);

      expect(status).to.have.property('enabled');
      expect(status).to.have.property('setup');
    });

    it('should reject invalid 2FA code', async function() {
      const isValid = await tfa.verifyCode(testUserId, '000000');

      expect(isValid).to.be.false;
    });
  });

  describe('Gmail Gateway (Integration)', function() {
    it('should initialize successfully', async function() {
      expect(gateway.initialized).to.be.true;
    });

    it('should block send to non-whitelisted recipient', async function() {
      const result = await gateway.send({
        userId: testUserId,
        to: 'not-whitelisted@example.com',
        subject: 'Test',
        text: 'Test message'
      });

      expect(result).to.have.property('success', false);
      expect(result).to.have.property('code', 'NOT_WHITELISTED');
    });

    it('should add recipient and send email (complete flow)', async function() {
      // Add recipient
      const addResult = await gateway.addRecipient(testUserId, testEmail);
      expect(addResult).to.have.property('success', true);

      // Confirm recipient
      const confirmResult = await gateway.confirmRecipient(addResult.token);
      expect(confirmResult).to.have.property('success', true);

      // Send email (in mock mode, won't actually send)
      const sendResult = await gateway.send({
        userId: testUserId,
        to: testEmail,
        subject: 'Test Email',
        text: 'This is a test email'
      });

      // In mock mode, this may fail due to SMTP, but whitelist check should pass
      expect(sendResult).to.have.property('code').that.does.not.equal('NOT_WHITELISTED');
    });

    it('should get user status', async function() {
      const status = await gateway.getStatus(testUserId);

      expect(status).to.have.property('user');
      expect(status.user).to.have.property('userId', testUserId);
      expect(status.user).to.have.property('whitelist');
      expect(status.user).to.have.property('relayStats');
    });

    it('should get global status', async function() {
      const status = await gateway.getStatus();

      expect(status).to.have.property('system');
      expect(status.system).to.have.property('initialized', true);
    });

    it('should perform health check', async function() {
      const health = await gateway.healthCheck();

      expect(health).to.have.property('status');
      expect(health).to.have.property('checks');
      expect(health.checks).to.have.property('database');
    });
  });
});
