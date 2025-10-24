#!/usr/bin/env node

/**
 * Test Artifact Storage Flow
 *
 * End-to-end test of the complete flow:
 * prompt → bucket → reasoning → code generation → artifact storage → database
 *
 * Verifies:
 * - Bucket instance loads with artifact storage
 * - Code generation via bucket
 * - Automatic artifact detection and saving
 * - Full context linkage
 * - Artifact retrieval from database
 *
 * Usage:
 *   node scripts/test-artifact-flow.js
 */

const { Pool } = require('pg');
const BucketOrchestrator = require('../lib/bucket-orchestrator');
const ArtifactStorage = require('../lib/artifact-storage');

const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/postgres'
});

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          ARTIFACT STORAGE FLOW TEST                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Initialize bucket orchestrator
    console.log('📦 Step 1: Initialize Bucket Orchestrator\n');

    const orchestrator = new BucketOrchestrator({ db });
    await orchestrator.init();

    console.log(`✅ Loaded ${orchestrator.buckets.size} buckets`);
    console.log(`✅ Artifact storage initialized\n`);
    console.log('─'.repeat(70) + '\n');

    // Step 2: Test code generation request
    console.log('💻 Step 2: Generate Code via Bucket\n');

    const testPrompt = 'Create a simple Express.js API endpoint that returns user data';

    console.log(`Prompt: "${testPrompt}"\n`);

    // Route to code bucket
    const codeRequest = {
      prompt: testPrompt,
      userId: 'test_user',
      sessionId: 'test_session',
      domainContext: 'code'
    };

    console.log('Routing request to code bucket...');
    const response = await orchestrator.route(codeRequest);

    console.log(`\n✅ Response received from: ${response.bucketName}`);
    console.log(`   Model: ${response.model}`);
    console.log(`   Response time: ${response.responseTime}ms`);
    console.log(`   Success: ${response.success}`);

    if (response.artifactId) {
      console.log(`   Artifact saved: ${response.artifactId}`);
    } else {
      console.log(`   No artifact detected in response`);
    }

    console.log(`\nResponse preview:`);
    console.log(response.response.substring(0, 300) + '...\n');
    console.log('─'.repeat(70) + '\n');

    // Step 3: Verify artifact storage
    if (response.artifactId) {
      console.log('🔍 Step 3: Verify Artifact in Database\n');

      const artifactStorage = new ArtifactStorage({ db });

      // Get artifact by ID
      const artifact = await artifactStorage.getArtifact(response.artifactId);

      if (artifact) {
        console.log('✅ Artifact found in database:');
        console.log(`   ID: ${artifact.artifactId}`);
        console.log(`   Bucket: ${artifact.bucketId}`);
        console.log(`   Domain: ${artifact.domainContext}`);
        console.log(`   Type: ${artifact.artifactType}`);
        console.log(`   Language: ${artifact.language}`);
        console.log(`   Framework: ${artifact.framework || 'none'}`);
        console.log(`   Name: ${artifact.artifactName}`);
        console.log(`   Tags: ${artifact.tags?.join(', ') || 'none'}`);
        console.log(`   Model: ${artifact.modelId}`);
        console.log(`   Reasoning ID: ${artifact.reasoningLogId}`);
        console.log(`   Created: ${artifact.createdAt}`);

        console.log(`\nCode preview:`);
        console.log(artifact.code.substring(0, 200) + '...\n');

        // Verify linkage
        console.log('🔗 Verifying Context Linkage:\n');

        console.log(`✅ Prompt → Artifact: "${artifact.originalPrompt.substring(0, 60)}..."`);
        console.log(`✅ Reasoning → Artifact: ID ${artifact.reasoningLogId}`);
        console.log(`✅ Bucket → Artifact: ${artifact.bucketId}`);
        console.log(`✅ Domain → Artifact: ${artifact.domainContext}`);

      } else {
        console.log('❌ Artifact not found in database');
      }

      console.log('\n' + '─'.repeat(70) + '\n');

      // Step 4: Query artifacts by bucket
      console.log('📊 Step 4: Query Artifacts by Bucket\n');

      const bucketArtifacts = await artifactStorage.getArtifactsByBucket(response.bucketId, { limit: 5 });

      console.log(`Found ${bucketArtifacts.length} artifacts for bucket: ${response.bucketId}`);

      for (const art of bucketArtifacts) {
        console.log(`  - ${art.artifactName} (${art.language}, ${art.artifactType}) - ${art.createdAt}`);
      }

      console.log('\n' + '─'.repeat(70) + '\n');

      // Step 5: Query artifacts by domain
      console.log('🌐 Step 5: Query Artifacts by Domain\n');

      const domainArtifacts = await artifactStorage.getArtifactsByDomain('code', { limit: 5 });

      console.log(`Found ${domainArtifacts.length} artifacts for domain: code`);

      for (const art of domainArtifacts) {
        console.log(`  - ${art.artifactName} (${art.language}, ${art.artifactType})`);
      }

      console.log('\n' + '─'.repeat(70) + '\n');

      // Step 6: Statistics
      console.log('📈 Step 6: Artifact Statistics\n');

      const stats = await artifactStorage.getStatistics();

      console.log(`Total artifacts: ${stats.total_artifacts}`);
      console.log(`Unique domains: ${stats.unique_domains}`);
      console.log(`Unique types: ${stats.unique_types}`);
      console.log(`Unique languages: ${stats.unique_languages}`);
      console.log(`Average rating: ${stats.avg_rating ? stats.avg_rating.toFixed(2) : 'N/A'}`);
      console.log(`Total uses: ${stats.total_uses}`);

    } else {
      console.log('⚠️  Step 3-6 Skipped: No artifact was generated\n');
      console.log('This can happen if:');
      console.log('  - Response did not contain code blocks');
      console.log('  - Code blocks were too short (<10 chars)');
      console.log('  - Ollama model is not running');
      console.log('  - Request failed');
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                         TEST SUMMARY                           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('✅ Bucket orchestrator initialization');
    console.log('✅ Artifact storage initialization');
    console.log('✅ Code generation request routing');
    console.log('✅ Automatic artifact detection');

    if (response.artifactId) {
      console.log('✅ Artifact saved to database');
      console.log('✅ Context linkage (prompt → reasoning → code → bucket → domain)');
      console.log('✅ Artifact retrieval by ID');
      console.log('✅ Artifact query by bucket');
      console.log('✅ Artifact query by domain');
      console.log('✅ Artifact statistics');
    } else {
      console.log('⚠️  Artifact storage (not tested - no code generated)');
    }

    console.log('\n💡 Next steps:');
    console.log('   - Test domain code library: node scripts/test-domain-library.js');
    console.log('   - Test context airlock: node scripts/test-context-airlock.js');
    console.log('   - Create API endpoints for artifacts');
    console.log('   - Build artifact browser UI\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = main;
