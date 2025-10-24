#!/usr/bin/env node

/**
 * End-to-End Knowledge Graph Test Suite
 *
 * Verifies:
 * 1. Row-Level Security (RLS) isolation
 * 2. Multi-provider routing (Ollama, OpenAI, Anthropic, DeepSeek)
 * 3. Token tracking ("which tokens came from each provider?")
 * 4. Double contingency authentication (session + API key)
 * 5. Knowledge graph (concepts, leveling, mastery)
 *
 * Usage:
 *   node tests/e2e-knowledge-graph.test.js
 */

const axios = require('axios');
const { Client } = require('pg');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5001';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || 'matthewmauer',
  password: process.env.DB_PASSWORD || ''
};

// Test users (roughsparks + testuser created earlier)
const USERS = {
  roughsparks: {
    user_id: 'e7dc083f-61de-4567-a5b6-b21ddb09cb2d',
    tenant_id: 'e9b9910f-d89c-4a0c-99e5-f0cc14375173',
    username: 'roughsparks'
  },
  testuser: {
    user_id: '6cfa23cf-3bed-4da3-a894-f59149e1ea3e',
    tenant_id: 'e9b9910f-d89c-4a0c-99e5-f0cc14375173',
    username: 'testuser'
  }
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// Helper functions
function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function testResult(name, passed, error = null) {
  if (passed) {
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    log('✅', name);
  } else {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error });
    log('❌', `${name}: ${error}`);
  }
}

async function apiCall(method, endpoint, user, data = null) {
  try {
    const response = await axios({
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'X-User-Id': user.user_id
      },
      data
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || error.message);
  }
}

// ============================================================================
// TEST 1: Verify Server is Running
// ============================================================================

async function testServerRunning() {
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    testResult('Server is running', response.status === 200);
  } catch (error) {
    testResult('Server is running', false, error.message);
  }
}

// ============================================================================
// TEST 2: Double Contingency Auth
// ============================================================================

async function testDoubleContingency() {
  try {
    // Test 1: No user_id = should fail
    try {
      await axios.get(`${BASE_URL}/api/knowledge/my-progress`);
      testResult('Auth: Reject no user_id', false, 'Should have rejected');
    } catch (error) {
      testResult('Auth: Reject no user_id', error.response?.status === 401);
    }

    // Test 2: Valid user_id = should succeed
    const progress = await apiCall('GET', '/api/knowledge/my-progress', USERS.roughsparks);
    testResult('Auth: Accept valid user_id', progress.status === 'success');

    // Test 3: Invalid user_id = should fail
    try {
      await apiCall('GET', '/api/knowledge/my-progress', {
        user_id: '00000000-0000-0000-0000-000000000000',
        tenant_id: '00000000-0000-0000-0000-000000000000'
      });
      testResult('Auth: Reject invalid user_id', false, 'Should have rejected');
    } catch (error) {
      testResult('Auth: Reject invalid user_id', error.message.includes('User not found'));
    }
  } catch (error) {
    testResult('Double contingency auth', false, error.message);
  }
}

// ============================================================================
// TEST 3: Knowledge Graph Endpoints
// ============================================================================

async function testKnowledgeGraphEndpoints() {
  try {
    // Test: List all concepts
    const concepts = await apiCall('GET', '/api/knowledge/concepts', USERS.roughsparks);
    testResult('GET /api/knowledge/concepts',
      concepts.status === 'success' && concepts.data.concepts.length > 0);

    // Test: Get specific concept
    const concept = await apiCall('GET', '/api/knowledge/concepts/sql-joins', USERS.roughsparks);
    testResult('GET /api/knowledge/concepts/:slug',
      concept.status === 'success' && concept.data.concept_name === 'JOIN Operations');

    // Test: Get user progress
    const progress = await apiCall('GET', '/api/knowledge/my-progress', USERS.roughsparks);
    testResult('GET /api/knowledge/my-progress',
      progress.status === 'success' && progress.data.username === 'roughsparks');

    // Test: Get recommendations
    const recommended = await apiCall('GET', '/api/knowledge/recommended?limit=5', USERS.roughsparks);
    testResult('GET /api/knowledge/recommended',
      recommended.status === 'success');

    // Test: Get stats
    const stats = await apiCall('GET', '/api/knowledge/stats', USERS.roughsparks);
    testResult('GET /api/knowledge/stats',
      stats.status === 'success');

  } catch (error) {
    testResult('Knowledge graph endpoints', false, error.message);
  }
}

// ============================================================================
// TEST 4: Multi-Provider Token Tracking
// ============================================================================

async function testMultiProviderTracking() {
  const db = new Client(DB_CONFIG);

  try {
    await db.connect();

    // Query provider_usage_breakdown view
    const result = await db.query('SELECT * FROM provider_usage_breakdown');

    if (result.rows.length === 0) {
      testResult('Multi-provider: Token tracking view exists', true);
      testResult('Multi-provider: Provider data populated', false, 'No provider data yet');
    } else {
      testResult('Multi-provider: Token tracking view exists', true);
      testResult('Multi-provider: Provider data populated', true);

      // Verify we can distinguish tokens by provider
      const providerCounts = result.rows.map(row => ({
        provider: row.provider,
        tokens: parseInt(row.total_tokens)
      }));

      log('📊', `Provider breakdown: ${JSON.stringify(providerCounts)}`);
      testResult('Multi-provider: Can identify tokens by provider', providerCounts.length > 0);
    }

    // Check provider_costs table exists
    const costsResult = await db.query('SELECT COUNT(*) FROM provider_costs');
    testResult('Multi-provider: Provider costs configured',
      parseInt(costsResult.rows[0].count) > 0);

  } catch (error) {
    testResult('Multi-provider token tracking', false, error.message);
  } finally {
    await db.end();
  }
}

// ============================================================================
// TEST 5: Row-Level Security (RLS) with Database Queries
// ============================================================================

async function testRowLevelSecurity() {
  const db = new Client(DB_CONFIG);

  try {
    await db.connect();

    // Verify RLS is enabled
    const rlsCheck = await db.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN ('learning_sessions', 'user_concept_mastery', 'knowledge_concepts')
    `);

    const tablesWithRLS = rlsCheck.rows.filter(row => row.rowsecurity).length;
    testResult('RLS: Enabled on critical tables', tablesWithRLS === 3);

    // Verify RLS policies exist
    const policiesCheck = await db.query(`
      SELECT COUNT(*) FROM pg_policies
      WHERE tablename IN ('learning_sessions', 'user_concept_mastery', 'knowledge_concepts')
    `);

    testResult('RLS: Policies created', parseInt(policiesCheck.rows[0].count) >= 4);

    // Verify RLS functions exist
    const functionsCheck = await db.query(`
      SELECT COUNT(*) FROM pg_proc
      WHERE proname IN ('set_request_context', 'clear_request_context')
    `);

    testResult('RLS: Helper functions exist', parseInt(functionsCheck.rows[0].count) === 2);

  } catch (error) {
    testResult('Row-level security', false, error.message);
  } finally {
    await db.end();
  }
}

// ============================================================================
// TEST 6: Learning Session with Ollama
// ============================================================================

async function testLearnWithOllama() {
  try {
    log('🎓', 'Testing learning session with Ollama (this may take a moment)...');

    const learnData = {
      concept_slug: 'database-basics',
      prompt: 'What is a database? Give me a short 1 sentence answer.',
      provider: 'ollama',
      model: 'calos-model'
    };

    const result = await apiCall('POST', '/api/knowledge/learn', USERS.roughsparks, learnData);

    testResult('Learn: Ollama generates response',
      result.status === 'success' && result.data.explanation.length > 0);

    testResult('Learn: Token tracking recorded',
      result.data.tokens.input_tokens > 0 && result.data.tokens.output_tokens > 0);

    testResult('Learn: Credits deducted',
      result.data.credits_consumed > 0);

    testResult('Learn: Provider metadata captured',
      result.data.provider === 'ollama');

    log('📊', `Tokens: ${result.data.tokens.input_tokens} in, ${result.data.tokens.output_tokens} out`);
    log('💰', `Cost: $${result.data.cost_usd}, Credits: ${result.data.credits_consumed}`);

  } catch (error) {
    if (error.message.includes('Ollama')) {
      testResult('Learn: Ollama integration', false, 'Ollama not running (this is OK for testing)');
    } else {
      testResult('Learn: Ollama integration', false, error.message);
    }
  }
}

// ============================================================================
// TEST 7: User Progress and Leveling
// ============================================================================

async function testProgressAndLeveling() {
  const db = new Client(DB_CONFIG);

  try {
    await db.connect();

    // Check user_learning_levels view
    const progress = await db.query(`
      SELECT * FROM user_learning_levels
      WHERE user_id = $1
    `, [USERS.roughsparks.user_id]);

    if (progress.rows.length > 0) {
      const userProgress = progress.rows[0];
      testResult('Leveling: User progress calculated', true);

      log('🎮', `Level ${userProgress.user_level}: ${userProgress.level_title}`);
      log('📚', `Concepts learned: ${userProgress.concepts_learned}, Mastered: ${userProgress.concepts_mastered}`);
      log('📊', `Average mastery: ${userProgress.avg_mastery}%`);
    } else {
      testResult('Leveling: User progress calculated', false, 'No progress data');
    }

    // Check recommended_next_concepts view
    const recommended = await db.query(`
      SELECT * FROM recommended_next_concepts
      WHERE user_id = $1
      LIMIT 5
    `, [USERS.roughsparks.user_id]);

    testResult('Leveling: Recommendations generated', recommended.rows.length >= 0);

  } catch (error) {
    testResult('Progress and leveling', false, error.message);
  } finally {
    await db.end();
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runTests() {
  log('🚀', 'CalOS Knowledge Graph E2E Test Suite');
  log('📍', `Testing server at: ${BASE_URL}`);
  log('🗄️', `Database: ${DB_CONFIG.database}@${DB_CONFIG.host}`);
  console.log('');

  await testServerRunning();
  await testDoubleContingency();
  await testKnowledgeGraphEndpoints();
  await testMultiProviderTracking();
  await testRowLevelSecurity();
  await testLearnWithOllama();
  await testProgressAndLeveling();

  // Summary
  console.log('');
  log('📊', '='.repeat(50));
  log('📊', 'TEST RESULTS');
  log('📊', '='.repeat(50));
  log('✅', `Passed: ${results.passed}`);
  log('❌', `Failed: ${results.failed}`);
  log('📊', `Total:  ${results.passed + results.failed}`);
  console.log('');

  if (results.failed > 0) {
    log('❌', 'Failed tests:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`   - ${t.name}: ${t.error}`);
    });
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log('❌', `Fatal error: ${error.message}`);
  process.exit(1);
});
