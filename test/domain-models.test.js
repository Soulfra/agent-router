/**
 * Domain Models Test Suite
 *
 * Tests for 5 specialized Ollama models and domain routing:
 * - soulfra-model: Cryptography & identity
 * - deathtodata-model: Data analysis & ETL
 * - publishing-model: Content & documentation
 * - calos-model: CalOS platform
 * - drseuss-model: Creative & whimsical
 */

const MultiLLMRouter = require('../lib/multi-llm-router');
const assert = require('assert');

// Test configuration
const OLLAMA_AVAILABLE = process.env.TEST_OLLAMA !== 'false';
const TIMEOUT = 30000; // 30 seconds per test

describe('Domain Models & Routing', function() {
  this.timeout(TIMEOUT);

  let router;

  before(function() {
    // Initialize router with all providers
    router = new MultiLLMRouter({
      strategy: 'smart',
      ollamaEnabled: OLLAMA_AVAILABLE,
      openaiEnabled: false, // Focus on Ollama for these tests
      anthropicEnabled: false,
      deepseekEnabled: false
    });
  });

  // Test 1: Cryptography Domain (soulfra-model)
  describe('Cryptography Domain', function() {
    it('should route cryptography queries to soulfra-model', async function() {
      if (!OLLAMA_AVAILABLE) return this.skip();

      const request = {
        prompt: 'Explain how Ed25519 signature schemes work in the Soulfra identity system',
        taskType: 'cryptography',
        maxTokens: 200
      };

      const response = await router.complete(request);

      assert.ok(response.text, 'Response should have text');
      assert.strictEqual(response.provider, 'ollama', 'Should use Ollama');
      assert.strictEqual(response.model, 'soulfra-model', 'Should use soulfra-model');
      assert.ok(response.text.length > 50, 'Response should be substantive');
    });

    it('should infer cryptography taskType from keywords', function() {
      const prompts = [
        'How does encryption work?',
        'Explain zero-knowledge proofs',
        'What is Ed25519?',
        'Generate a cryptographic signature',
        'Soulfra identity verification'
      ];

      prompts.forEach(prompt => {
        const taskType = router._inferTaskType(prompt);
        assert.strictEqual(taskType, 'cryptography', `Should infer cryptography for: ${prompt}`);
      });
    });

    it('should remove artifacts from cryptography responses', async function() {
      if (!OLLAMA_AVAILABLE) return this.skip();

      const request = {
        prompt: 'Explain public key cryptography',
        taskType: 'cryptography',
        maxTokens: 150
      };

      const response = await router.complete(request);

      // Check for artifacts that should be removed
      assert.ok(!response.text.includes('[Slide'), 'Should not contain slide markers');
      assert.ok(!response.text.includes('<thinking>'), 'Should not contain thinking tags');
      assert.ok(!response.text.includes('[TODO]'), 'Should not contain TODO markers');
    });
  });

  // Test 2: Data Processing Domain (deathtodata-model)
  describe('Data Processing Domain', function() {
    it('should route data queries to deathtodata-model', async function() {
      if (!OLLAMA_AVAILABLE) return this.skip();

      const request = {
        prompt: 'Parse this CSV and convert to JSON: name,age\\nAlice,30\\nBob,25',
        taskType: 'data',
        maxTokens: 200
      };

      const response = await router.complete(request);

      assert.ok(response.text, 'Response should have text');
      assert.strictEqual(response.provider, 'ollama', 'Should use Ollama');
      assert.strictEqual(response.model, 'deathtodata-model', 'Should use deathtodata-model');
    });

    it('should infer data taskType from keywords', function() {
      const prompts = [
        'Parse this CSV file',
        'Transform this data with ETL',
        'Validate enum values',
        'Convert array to object',
        'Import data into gateway',
        'Export to JSON'
      ];

      prompts.forEach(prompt => {
        const taskType = router._inferTaskType(prompt);
        assert.strictEqual(taskType, 'data', `Should infer data for: ${prompt}`);
      });
    });
  });

  // Test 3: Publishing Domain (publishing-model)
  describe('Publishing Domain', function() {
    it('should route documentation queries to publishing-model', async function() {
      if (!OLLAMA_AVAILABLE) return this.skip();

      const request = {
        prompt: 'Write a README for a Node.js API router',
        taskType: 'publishing',
        maxTokens: 200
      };

      const response = await router.complete(request);

      assert.ok(response.text, 'Response should have text');
      assert.strictEqual(response.provider, 'ollama', 'Should use Ollama');
      assert.strictEqual(response.model, 'publishing-model', 'Should use publishing-model');
    });

    it('should infer publishing taskType from keywords', function() {
      const prompts = [
        'Write documentation for this API',
        'Create a README file',
        'Generate markdown docs',
        'Write an API guide',
        'Create a tutorial'
      ];

      prompts.forEach(prompt => {
        const taskType = router._inferTaskType(prompt);
        assert.strictEqual(taskType, 'publishing', `Should infer publishing for: ${prompt}`);
      });
    });

    it('publishing model should NOT produce PPT artifacts', async function() {
      if (!OLLAMA_AVAILABLE) return this.skip();

      const request = {
        prompt: 'Document the steps to deploy an application',
        taskType: 'publishing',
        maxTokens: 200
      };

      const response = await router.complete(request);

      // Publishing model is specifically trained to avoid presentation formats
      assert.ok(!response.text.includes('[Slide'), 'Should not contain slide markers');
      assert.ok(!response.text.includes('**Slide'), 'Should not contain slide headings');
      assert.ok(!response.text.includes('---slide---'), 'Should not contain slide separators');
    });
  });

  // Test 4: CalOS Domain (calos-model)
  describe('CalOS Domain', function() {
    it('should route CalOS queries to calos-model', async function() {
      if (!OLLAMA_AVAILABLE) return this.skip();

      const request = {
        prompt: 'Explain the CalOS skills system with XP levels',
        taskType: 'calos',
        maxTokens: 200
      };

      const response = await router.complete(request);

      assert.ok(response.text, 'Response should have text');
      assert.strictEqual(response.provider, 'ollama', 'Should use Ollama');
      assert.strictEqual(response.model, 'calos-model', 'Should use calos-model');
    });

    it('should infer calos taskType from keywords', function() {
      const prompts = [
        'Explain CalOS architecture',
        'How do skills and XP work?',
        'What are CalOS actions and effects?',
        'Describe CalOS gamification',
        'CalOS progression system'
      ];

      prompts.forEach(prompt => {
        const taskType = router._inferTaskType(prompt);
        assert.strictEqual(taskType, 'calos', `Should infer calos for: ${prompt}`);
      });
    });
  });

  // Test 5: Whimsical Domain (drseuss-model)
  describe('Whimsical Domain', function() {
    it('should route whimsical queries to drseuss-model', async function() {
      if (!OLLAMA_AVAILABLE) return this.skip();

      const request = {
        prompt: 'Explain how APIs work in a whimsical, Dr. Seuss style',
        taskType: 'whimsical',
        maxTokens: 200
      };

      const response = await router.complete(request);

      assert.ok(response.text, 'Response should have text');
      assert.strictEqual(response.provider, 'ollama', 'Should use Ollama');
      assert.strictEqual(response.model, 'drseuss-model', 'Should use drseuss-model');
    });

    it('should infer whimsical taskType from keywords', function() {
      const prompts = [
        'Explain this in a whimsical way',
        'Write in Dr. Seuss style',
        'Make a playful explanation',
        'Fun explanation of databases'
      ];

      prompts.forEach(prompt => {
        const taskType = router._inferTaskType(prompt);
        assert.strictEqual(taskType, 'whimsical', `Should infer whimsical for: ${prompt}`);
      });
    });
  });

  // Test 6: Output Formatting
  describe('Output Formatting', function() {
    it('should remove PowerPoint artifacts from all responses', async function() {
      if (!OLLAMA_AVAILABLE) return this.skip();

      const requests = [
        { prompt: 'Explain REST APIs', taskType: 'publishing' },
        { prompt: 'Parse CSV data', taskType: 'data' },
        { prompt: 'Ed25519 signatures', taskType: 'cryptography' }
      ];

      for (const request of requests) {
        request.maxTokens = 150;
        const response = await router.complete(request);

        // Check for common artifacts
        assert.ok(!response.text.includes('[Slide'), 'No slide markers');
        assert.ok(!response.text.includes('Slide 1'), 'No slide numbers');
        assert.ok(!response.text.includes('<thinking>'), 'No thinking tags');
        assert.ok(!response.text.includes('[PLACEHOLDER]'), 'No placeholders');
      }
    });

    it('should properly format markdown in responses', async function() {
      if (!OLLAMA_AVAILABLE) return this.skip();

      const request = {
        prompt: 'Write a simple JavaScript function that adds two numbers',
        taskType: 'code',
        maxTokens: 200
      };

      const response = await router.complete(request);

      // Check markdown formatting
      const codeBlockMatches = response.text.match(/```/g);
      if (codeBlockMatches && codeBlockMatches.length > 0) {
        // Code blocks should be properly closed (even number of backticks)
        // If odd, the formatter should have fixed it
        assert.strictEqual(codeBlockMatches.length % 2, 0, 'Code blocks should be balanced');
      }

      // Should not have excessive newlines (more than 2)
      assert.ok(!response.text.includes('\n\n\n'), 'No excessive newlines (max 2)');
    });
  });

  // Test 7: Model Availability
  describe('Model Availability', function() {
    it('should list all domain models as available', function() {
      const providers = router.getAvailableProviders();
      const ollama = providers.find(p => p.name === 'ollama');

      if (!OLLAMA_AVAILABLE || !ollama) return this.skip();

      const modelNames = ollama.models.map(m => m.name);

      assert.ok(modelNames.includes('soulfra-model'), 'Should have soulfra-model');
      assert.ok(modelNames.includes('deathtodata-model'), 'Should have deathtodata-model');
      assert.ok(modelNames.includes('publishing-model'), 'Should have publishing-model');
      assert.ok(modelNames.includes('calos-model'), 'Should have calos-model');
      assert.ok(modelNames.includes('drseuss-model'), 'Should have drseuss-model');
    });

    it('should report correct domain for each model', function() {
      const providers = router.getAvailableProviders();
      const ollama = providers.find(p => p.name === 'ollama');

      if (!OLLAMA_AVAILABLE || !ollama) return this.skip();

      const soulfra = ollama.models.find(m => m.name === 'soulfra-model');
      const deathtodata = ollama.models.find(m => m.name === 'deathtodata-model');
      const publishing = ollama.models.find(m => m.name === 'publishing-model');
      const calos = ollama.models.find(m => m.name === 'calos-model');
      const drseuss = ollama.models.find(m => m.name === 'drseuss-model');

      assert.strictEqual(soulfra?.domain, 'cryptography');
      assert.strictEqual(deathtodata?.domain, 'data');
      assert.strictEqual(publishing?.domain, 'publishing');
      assert.strictEqual(calos?.domain, 'calos');
      assert.strictEqual(drseuss?.domain, 'whimsical');
    });
  });

  // Test 8: Statistics Tracking
  describe('Statistics Tracking', function() {
    it('should track usage statistics per domain model', async function() {
      if (!OLLAMA_AVAILABLE) return this.skip();

      // Reset stats
      router.stats.byProvider.ollama = {
        requests: 0,
        successes: 0,
        failures: 0,
        tokens: 0,
        cost: 0,
        averageLatency: 0
      };

      const request = {
        prompt: 'Quick test',
        taskType: 'cryptography',
        maxTokens: 50
      };

      await router.complete(request);

      const stats = router.getStats();
      const ollamaStats = stats.byProvider.ollama;

      assert.strictEqual(ollamaStats.requests, 1, 'Should track request');
      assert.strictEqual(ollamaStats.successes, 1, 'Should track success');
      assert.strictEqual(ollamaStats.cost, 0, 'Ollama should be free');
      assert.ok(ollamaStats.averageLatency > 0, 'Should track latency');
    });
  });

  // Test 9: Integration - Full Flow
  describe('Integration Tests', function() {
    it('should handle complex multi-domain workflow', async function() {
      if (!OLLAMA_AVAILABLE) return this.skip();

      // Simulate a workflow using multiple domains
      const workflow = [
        {
          prompt: 'Generate Ed25519 key pair',
          expectedTaskType: 'cryptography',
          expectedModel: 'soulfra-model'
        },
        {
          prompt: 'Parse user data CSV',
          expectedTaskType: 'data',
          expectedModel: 'deathtodata-model'
        },
        {
          prompt: 'Document the API endpoints',
          expectedTaskType: 'publishing',
          expectedModel: 'publishing-model'
        }
      ];

      for (const step of workflow) {
        const response = await router.complete({
          prompt: step.prompt,
          maxTokens: 100
        });

        assert.strictEqual(response.provider, 'ollama');
        assert.strictEqual(response.model, step.expectedModel);
        assert.ok(response.text.length > 20, 'Should generate meaningful response');
        assert.ok(!response.text.includes('[Slide'), 'Should have clean output');
      }
    });
  });
});
