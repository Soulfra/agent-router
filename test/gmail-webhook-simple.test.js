/**
 * Gmail Webhook Zero Cost - Simple Tests
 *
 * Basic tests for Gmail webhook system using Node's assert
 *
 * Run: npm test
 */

const assert = require('assert');

describe('Gmail Webhook System (Simple)', function() {
  this.timeout(5000);

  describe('Module Loading', function() {
    it('should load GmailGateway module', function() {
      const GmailGateway = require('../lib/gmail-gateway');
      assert.ok(GmailGateway);
    });

    it('should load GmailRateLimiter module', function() {
      const GmailRateLimiter = require('../lib/gmail-rate-limiter');
      assert.ok(GmailRateLimiter);
    });

    it('should load EmailReputationTracker module', function() {
      const EmailReputationTracker = require('../lib/email-reputation-tracker');
      assert.ok(EmailReputationTracker);
    });

    it('should load RecipientWhitelistManager module', function() {
      const RecipientWhitelistManager = require('../lib/recipient-whitelist-manager');
      assert.ok(RecipientWhitelistManager);
    });

    it('should load TwoFactorAuth module', function() {
      const TwoFactorAuth = require('../lib/two-factor-auth');
      assert.ok(TwoFactorAuth);
    });
  });

  describe('Module Instantiation', function() {
    it('should create GmailGateway instance', function() {
      const GmailGateway = require('../lib/gmail-gateway');
      const gateway = new GmailGateway({ mockMode: true });
      assert.ok(gateway);
      assert.strictEqual(gateway.mockMode, true);
    });

    it('should create GmailRateLimiter instance', function() {
      const GmailRateLimiter = require('../lib/gmail-rate-limiter');
      const limiter = new GmailRateLimiter();
      assert.ok(limiter);
      assert.strictEqual(limiter.userLimits.hourly, 50);
    });

    it('should create EmailReputationTracker instance', function() {
      const EmailReputationTracker = require('../lib/email-reputation-tracker');
      const tracker = new EmailReputationTracker();
      assert.ok(tracker);
      assert.strictEqual(tracker.thresholds.excellent, 90);
    });

    it('should create RecipientWhitelistManager instance', function() {
      const RecipientWhitelistManager = require('../lib/recipient-whitelist-manager');
      const whitelist = new RecipientWhitelistManager();
      assert.ok(whitelist);
      assert.strictEqual(whitelist.maxPendingPerUser, 20);
    });

    it('should create TwoFactorAuth instance', function() {
      const TwoFactorAuth = require('../lib/two-factor-auth');
      const tfa = new TwoFactorAuth();
      assert.ok(tfa);
      assert.strictEqual(tfa.digits, 6);
    });
  });

  describe('API Routes', function() {
    it('should load gmail webhook routes', function() {
      const routes = require('../routes/gmail-webhook-zero-cost-routes');
      assert.ok(routes);
    });
  });

  describe('Configuration Validation', function() {
    it('should have default rate limits configured', function() {
      const GmailRateLimiter = require('../lib/gmail-rate-limiter');
      const limiter = new GmailRateLimiter();

      assert.strictEqual(limiter.userLimits.hourly, 50);
      assert.strictEqual(limiter.userLimits.daily, 500);
      assert.strictEqual(limiter.userLimits.monthly, 10000);
      assert.strictEqual(limiter.recipientLimits.daily, 10);
      assert.strictEqual(limiter.globalLimits.hourly, 100);
      assert.strictEqual(limiter.globalLimits.daily, 500);
    });

    it('should have default reputation thresholds configured', function() {
      const EmailReputationTracker = require('../lib/email-reputation-tracker');
      const tracker = new EmailReputationTracker();

      assert.strictEqual(tracker.thresholds.excellent, 90);
      assert.strictEqual(tracker.thresholds.good, 70);
      assert.strictEqual(tracker.thresholds.warning, 50);
      assert.strictEqual(tracker.thresholds.blocked, 0);
    });

    it('should have default 2FA settings configured', function() {
      const TwoFactorAuth = require('../lib/two-factor-auth');
      const tfa = new TwoFactorAuth();

      assert.strictEqual(tfa.issuer, 'CALOS');
      assert.strictEqual(tfa.digits, 6);
      assert.strictEqual(tfa.period, 30);
      assert.strictEqual(tfa.window, 1);
      assert.strictEqual(tfa.maxAttempts, 5);
      assert.strictEqual(tfa.backupCodeCount, 10);
    });
  });
});
