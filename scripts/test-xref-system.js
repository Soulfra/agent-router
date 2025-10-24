#!/usr/bin/env node

/**
 * Test XRef System
 *
 * Tests the cross-reference tracking system:
 * 1. Record component relationships
 * 2. Query usages (xrefs)
 * 3. Query dependencies
 * 4. Build graphs
 * 5. Get statistics
 */

const { Pool } = require('pg');
const XRefMapper = require('../lib/xref-mapper');

const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/postgres'
});

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    XREF SYSTEM TEST                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    const xrefMapper = new XRefMapper({ db });

    // Step 1: Record some test relationships
    console.log('📝 Step 1: Recording Test Relationships\n');

    // Simulate a request using a bucket, model, domain, and pattern
    const testRequestId = 'test_request_' + Date.now();
    const testPatternId = 'pattern_123';
    const testBucketId = 'bucket-code';
    const testModelId = 'deepseek-r1';
    const testDomainId = 'code';

    console.log(`Test Request ID: ${testRequestId}\n`);

    // Generate a test UUID for user
    const testUserId = '00000000-0000-0000-0000-000000000001';

    // Record bucket usage
    console.log('Recording bucket usage...');
    await xrefMapper.recordBucketUsage(testRequestId, testBucketId, {
      userId: testUserId,
      sessionId: 'test_session'
    });
    console.log('✅ Recorded: request → uses_bucket → bucket-code\n');

    // Record model usage
    console.log('Recording model usage...');
    await xrefMapper.recordModelUsage(testRequestId, testModelId, {
      userId: testUserId,
      sessionId: 'test_session'
    }, 1234, true);
    console.log('✅ Recorded: request → uses_model → deepseek-r1\n');

    // Record domain usage
    console.log('Recording domain usage...');
    await xrefMapper.record({
      sourceType: 'request',
      sourceId: testRequestId,
      targetType: 'domain',
      targetId: testDomainId,
      relationshipType: 'uses_domain',
      context: {
        userId: testUserId,
        sessionId: 'test_session'
      },
      success: true
    });
    console.log('✅ Recorded: request → uses_domain → code\n');

    // Record pattern usage
    console.log('Recording pattern usage...');
    await xrefMapper.recordPatternUsage(testRequestId, testPatternId, {
      userId: testUserId,
      sessionId: 'test_session'
    });
    console.log('✅ Recorded: request → uses_pattern → pattern_123\n');

    console.log('─'.repeat(70) + '\n');

    // Step 2: Query usages (xrefs - where is this component used?)
    console.log('🔍 Step 2: Query Usages (XRefs)\n');

    // Find all usages of the bucket
    console.log(`Finding all usages of bucket: ${testBucketId}...`);
    const bucketUsages = await xrefMapper.findUsages('bucket', testBucketId, { limit: 10 });
    console.log(`Found ${bucketUsages.length} usages:`);
    for (const usage of bucketUsages.slice(0, 3)) {
      console.log(`  - ${usage.source_type}:${usage.source_id} (${usage.relationship_type})`);
    }
    console.log();

    // Find all usages of the model
    console.log(`Finding all usages of model: ${testModelId}...`);
    const modelUsages = await xrefMapper.findUsages('model', testModelId, { limit: 10 });
    console.log(`Found ${modelUsages.length} usages:`);
    for (const usage of modelUsages.slice(0, 3)) {
      console.log(`  - ${usage.source_type}:${usage.source_id} (${usage.relationship_type})`);
    }
    console.log();

    // Find all usages of the pattern
    console.log(`Finding all usages of pattern: ${testPatternId}...`);
    const patternUsages = await xrefMapper.findUsages('pattern', testPatternId, { limit: 10 });
    console.log(`Found ${patternUsages.length} usages:`);
    for (const usage of patternUsages.slice(0, 3)) {
      console.log(`  - ${usage.source_type}:${usage.source_id} (${usage.relationship_type})`);
    }
    console.log();

    console.log('─'.repeat(70) + '\n');

    // Step 3: Query dependencies (what does this component use?)
    console.log('🔗 Step 3: Query Dependencies\n');

    console.log(`Finding all dependencies of request: ${testRequestId}...`);
    const requestDeps = await xrefMapper.findDependencies('request', testRequestId, { limit: 10 });
    console.log(`Found ${requestDeps.length} dependencies:`);
    for (const dep of requestDeps) {
      console.log(`  - ${dep.target_type}:${dep.target_id} (${dep.relationship_type})`);
    }
    console.log();

    console.log('─'.repeat(70) + '\n');

    // Step 4: Build graph
    console.log('📊 Step 4: Build Component Graph\n');

    console.log(`Building graph for model: ${testModelId} (depth 2)...`);
    const modelGraph = await xrefMapper.buildGraph('model', testModelId, { depth: 2, format: 'nodes-links' });
    console.log(`Graph built:`);
    console.log(`  Nodes: ${modelGraph.nodes.length}`);
    console.log(`  Links: ${modelGraph.links.length}`);
    if (modelGraph.nodes.length > 0) {
      console.log(`\n  Sample nodes:`);
      for (const node of modelGraph.nodes.slice(0, 5)) {
        console.log(`    - ${node.id} (type: ${node.type})`);
      }
    }
    if (modelGraph.links.length > 0) {
      console.log(`\n  Sample links:`);
      for (const link of modelGraph.links.slice(0, 5)) {
        console.log(`    - ${link.source} → ${link.target} (${link.relationshipType})`);
      }
    }
    console.log();

    console.log('─'.repeat(70) + '\n');

    // Step 5: Get statistics
    console.log('📈 Step 5: Component Statistics\n');

    // Wait a moment for trigger to update stats
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(`Getting stats for model: ${testModelId}...`);
    const modelStats = await xrefMapper.getStats('model', testModelId);
    if (modelStats) {
      console.log(`  Total uses: ${modelStats.total_uses}`);
      console.log(`  Successful uses: ${modelStats.successful_uses}`);
      console.log(`  Success rate: ${(modelStats.success_rate * 100).toFixed(1)}%`);
      console.log(`  Avg execution time: ${modelStats.avg_execution_time_ms}ms`);
      console.log(`  Unique users: ${modelStats.unique_users}`);
    } else {
      console.log('  No stats available yet (may need more time for trigger)');
    }
    console.log();

    console.log(`Getting stats for bucket: ${testBucketId}...`);
    const bucketStats = await xrefMapper.getStats('bucket', testBucketId);
    if (bucketStats) {
      console.log(`  Total uses: ${bucketStats.total_uses}`);
      console.log(`  Success rate: ${(bucketStats.success_rate * 100).toFixed(1)}%`);
      console.log(`  Unique users: ${bucketStats.unique_users}`);
    } else {
      console.log('  No stats available yet');
    }
    console.log();

    console.log('─'.repeat(70) + '\n');

    // Step 6: Most used components
    console.log('🏆 Step 6: Most Used Components\n');

    console.log('Getting most used models...');
    const mostUsedModels = await xrefMapper.getMostUsed({ componentType: 'model', limit: 5 });
    console.log(`Found ${mostUsedModels.length} most used models:`);
    for (const comp of mostUsedModels) {
      console.log(`  - ${comp.component_id}: ${comp.total_uses} uses (${(comp.success_rate * 100).toFixed(1)}% success)`);
    }
    console.log();

    console.log('Getting most used buckets...');
    const mostUsedBuckets = await xrefMapper.getMostUsed({ componentType: 'bucket', limit: 5 });
    console.log(`Found ${mostUsedBuckets.length} most used buckets:`);
    for (const comp of mostUsedBuckets) {
      console.log(`  - ${comp.component_id}: ${comp.total_uses} uses`);
    }
    console.log();

    console.log('─'.repeat(70) + '\n');

    // Step 7: Export xref data
    console.log('📦 Step 7: Export XRef Data\n');

    console.log(`Exporting complete xref data for model: ${testModelId}...`);
    const exportData = await xrefMapper.export('model', testModelId);
    if (exportData) {
      console.log(`  Component: ${exportData.component.type}:${exportData.component.id}`);
      console.log(`  Usages: ${exportData.usages.length}`);
      console.log(`  Dependencies: ${exportData.dependencies.length}`);
      console.log(`  Stats: ${exportData.stats ? 'Available' : 'Not available'}`);
      console.log(`  Exported at: ${exportData.exportedAt}`);
    }
    console.log();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                         TEST SUMMARY                           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('✅ XRef system initialized');
    console.log('✅ Recorded 4 test relationships');
    console.log('✅ Queried usages (xrefs)');
    console.log('✅ Queried dependencies');
    console.log('✅ Built component graph');
    console.log('✅ Retrieved statistics');
    console.log('✅ Listed most used components');
    console.log('✅ Exported xref data\n');

    console.log('💡 Key Features Demonstrated:');
    console.log('   ✓ Cross-reference tracking (xrefs hotkey: x)');
    console.log('   ✓ Dependency resolution');
    console.log('   ✓ Graph visualization (D3.js format)');
    console.log('   ✓ Usage statistics');
    console.log('   ✓ Component popularity tracking');
    console.log('   ✓ Data export for debugging\n');

    console.log('🚀 Next Steps:');
    console.log('   - Test API endpoints: curl http://localhost:5001/api/xref/model/deepseek-r1/usages');
    console.log('   - View component graph: GET /api/xref/:type/:id/graph');
    console.log('   - Check statistics: GET /api/xref/:type/:id/stats');
    console.log('   - Build real-time dashboard with WebSocket updates\n');

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
