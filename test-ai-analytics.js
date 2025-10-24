#!/usr/bin/env node

/**
 * AI Cost Analytics Test Script
 *
 * Demonstrates:
 * 1. Recording AI usage (simulated)
 * 2. Computing cost candles
 * 3. Detecting trends ("is the curve going up or down?")
 * 4. Checking alerts (🟢🟡🔴 status)
 * 5. Creating A/B experiments ("wiggle something")
 */

require('dotenv').config();

const { Pool } = require('pg');
const AICostAnalytics = require('./lib/ai-cost-analytics');
const AICostAlerts = require('./lib/ai-cost-alerts');
const AIABTesting = require('./lib/ai-ab-testing');
const AIInstanceRegistry = require('./lib/ai-instance-registry');

async function main() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  📊 AI Cost Analytics Demo                        ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  // Initialize database
  console.log('🗄️  Connecting to database...');
  const db = new Pool({
    user: process.env.DB_USER || 'matthewmauer',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'calos',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432
  });

  try {
    await db.query('SELECT NOW()');
    console.log('✓ Database connected');
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    process.exit(1);
  }

  // Initialize components
  console.log('');
  console.log('🔧 Initializing AI Analytics components...');

  const aiCostAnalytics = new AICostAnalytics({ db });
  console.log('✓ AI Cost Analytics initialized');

  const aiInstanceRegistry = new AIInstanceRegistry({
    db,
    aiCostAnalytics,
    multiLLMRouter: null // Not needed for this demo
  });
  console.log('✓ AI Instance Registry initialized');

  const aiCostAlerts = new AICostAlerts({
    db,
    aiCostAnalytics,
    aiInstanceRegistry
  });
  console.log('✓ AI Cost Alerts initialized');

  const aiABTesting = new AIABTesting({
    db,
    aiCostAnalytics,
    aiInstanceRegistry
  });
  console.log('✓ AI A/B Testing initialized');

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Demo 1: Record Sample Usage
  console.log('📝 Demo 1: Recording Sample AI Usage');
  console.log('─────────────────────────────────────────────────');

  const samples = [
    { instance: 'cal', provider: 'claude-code', model: 'claude-sonnet-4.5', promptTokens: 1200, completionTokens: 300, cost: 0, latency: 850, success: true },
    { instance: 'ralph', provider: 'ollama', model: 'mistral:latest', promptTokens: 1500, completionTokens: 500, cost: 0, latency: 1200, success: true },
    { instance: 'deepthink', provider: 'deepseek', model: 'deepseek-chat', promptTokens: 2500, completionTokens: 500, cost: 0.81, latency: 2100, success: true },
    { instance: 'cal', provider: 'claude-code', model: 'claude-sonnet-4.5', promptTokens: 1400, completionTokens: 400, cost: 0, latency: 920, success: true },
    { instance: 'ralph', provider: 'ollama', model: 'mistral:latest', promptTokens: 1700, completionTokens: 500, cost: 0, latency: 1350, success: true }
  ];

  for (const sample of samples) {
    await aiCostAnalytics.recordUsage({
      instanceName: sample.instance,
      provider: sample.provider,
      model: sample.model,
      promptTokens: sample.promptTokens,
      completionTokens: sample.completionTokens,
      cost: sample.cost,
      latency: sample.latency,
      success: sample.success
    });
    const totalTokens = sample.promptTokens + sample.completionTokens;
    console.log(`  ✓ Recorded: ${sample.instance} (${totalTokens} tokens: ${sample.promptTokens} context + ${sample.completionTokens} completion, $${sample.cost.toFixed(4)}, ${sample.latency}ms)`);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Demo 2: Compute Cost Candles
  console.log('📈 Demo 2: Computing Cost Candles (OHLC)');
  console.log('─────────────────────────────────────────────────');

  try {
    const candles = await aiCostAnalytics.computeCostCandles({
      timeframe: '1h',
      from: new Date(Date.now() - 24 * 60 * 60 * 1000),
      to: new Date()
    });

    if (candles.length > 0) {
      console.log(`  Found ${candles.length} candles`);
      const latest = candles[candles.length - 1];
      console.log('');
      console.log('  Latest candle:');
      console.log(`    Time: ${new Date(latest.timestamp).toLocaleTimeString()}`);
      console.log(`    Requests: ${latest.requestCount}`);
      console.log(`    Total Cost: $${latest.totalCost.toFixed(4)}`);
      console.log(`    OHLC: Open=$${latest.ohlc.open.toFixed(4)}, High=$${latest.ohlc.high.toFixed(4)}, Low=$${latest.ohlc.low.toFixed(4)}, Close=$${latest.ohlc.close.toFixed(4)}`);
    } else {
      console.log('  (No candles available yet - need more historical data)');
    }
  } catch (error) {
    console.log(`  ⚠️  Error: ${error.message}`);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Demo 3: Detect Trends
  console.log('📊 Demo 3: Trend Detection (Is the curve going up or down?)');
  console.log('─────────────────────────────────────────────────');

  try {
    const trend = await aiCostAnalytics.detectTrend({
      lookbackPeriod: '24h'
    });

    console.log('  Overall trend:');
    console.log(`    Direction: ${trend.direction.toUpperCase()} ${trend.direction === 'increasing' ? '📈' : trend.direction === 'decreasing' ? '📉' : '➡️'}`);
    console.log(`    Slope: ${trend.slope.toFixed(6)}`);
    console.log(`    Change: ${trend.percentChange >= 0 ? '+' : ''}${trend.percentChange.toFixed(2)}%`);
    console.log(`    Confidence: ${(trend.confidence * 100).toFixed(1)}%`);
    console.log(`    Data Points: ${trend.dataPoints}`);
  } catch (error) {
    console.log(`  ⚠️  Error: ${error.message}`);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Demo 4: Check Alerts
  console.log('🚨 Demo 4: Cost Alerts (🟢🟡🔴 Status)');
  console.log('─────────────────────────────────────────────────');

  const instances = ['cal', 'ralph', 'deepthink'];

  for (const instanceName of instances) {
    try {
      const status = await aiCostAlerts.checkThresholds(instanceName);
      console.log(`  ${status.status.emoji} ${instanceName}:`);
      console.log(`    Status: ${status.status.name} (${status.status.color})`);

      if (status.alerts.length > 0) {
        console.log(`    Alerts:`);
        status.alerts.forEach(alert => {
          console.log(`      - ${alert.type}: ${alert.message}`);
        });
      } else {
        console.log(`    No alerts`);
      }
    } catch (error) {
      console.log(`  ⚠️  ${instanceName}: ${error.message}`);
    }
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Demo 5: Create A/B Experiment
  console.log('🧪 Demo 5: A/B Testing ("Wiggle something")');
  console.log('─────────────────────────────────────────────────');

  try {
    const experimentId = aiABTesting.createExperiment({
      name: 'Cost Optimization Test',
      description: 'Test if Ollama is cheaper than DeepSeek for general tasks',
      metric: 'cost',
      variants: [
        { name: 'control', instanceName: 'deepthink', weight: 0.5 },
        { name: 'test', instanceName: 'ralph', weight: 0.5 }
      ],
      minSampleSize: 10,
      autoPromote: true
    });

    console.log(`  ✓ Created experiment: ${experimentId}`);
    console.log(`    Name: Cost Optimization Test`);
    console.log(`    Metric: cost`);
    console.log(`    Variants:`);
    console.log(`      - Control: deepthink (DeepSeek)`);
    console.log(`      - Test: ralph (Ollama)`);
    console.log(`    Min Sample Size: 10`);
    console.log(`    Auto-Promote: Yes`);

    // Simulate some test results
    console.log('');
    console.log('  Simulating test results...');

    for (let i = 0; i < 5; i++) {
      aiABTesting.recordResult(experimentId, 'control', {
        instanceName: 'deepthink',
        cost: 0.0008 + Math.random() * 0.0002,
        latency: 2000 + Math.random() * 500,
        tokens: 2500,
        success: true
      });

      aiABTesting.recordResult(experimentId, 'test', {
        instanceName: 'ralph',
        cost: 0.0000, // Free!
        latency: 1500 + Math.random() * 300,
        tokens: 2500,
        success: true
      });
    }

    const experimentStatus = aiABTesting.getExperimentStatus(experimentId);
    console.log('');
    console.log('  Experiment status:');
    console.log(`    Status: ${experimentStatus.status}`);
    console.log(`    Results:`);

    experimentStatus.results.forEach(result => {
      console.log(`      ${result.variant}:`);
      console.log(`        Samples: ${result.samples}`);
      console.log(`        Avg Cost: $${result.avgCost.toFixed(6)}`);
      console.log(`        Avg Latency: ${result.avgLatency.toFixed(0)}ms`);
      console.log(`        Success Rate: ${(result.successRate * 100).toFixed(1)}%`);
    });

    if (experimentStatus.winner) {
      console.log('');
      console.log(`  🏆 Winner: ${experimentStatus.winner} (confidence: ${(experimentStatus.confidence * 100).toFixed(1)}%)`);
    }

  } catch (error) {
    console.log(`  ⚠️  Error: ${error.message}`);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Demo 6: Provider Comparison
  console.log('⚖️  Demo 6: Provider Comparison');
  console.log('─────────────────────────────────────────────────');

  try {
    const comparison = await aiCostAnalytics.compareProviders({
      from: new Date(Date.now() - 24 * 60 * 60 * 1000),
      to: new Date(),
      minRequests: 1
    });

    if (comparison.length > 0) {
      console.log('  Provider rankings:');
      console.log('');

      comparison.forEach((provider, index) => {
        console.log(`  ${index + 1}. ${provider.instanceName} (${provider.provider})`);
        console.log(`     Cost: $${provider.metrics.totalCost.toFixed(4)} (avg $${provider.metrics.avgCost.toFixed(6)}/request)`);
        console.log(`     Latency: ${provider.metrics.avgLatency.toFixed(0)}ms`);
        console.log(`     Efficiency Score: ${provider.efficiencyScore.toFixed(2)}`);
        console.log(`     Requests: ${provider.metrics.requestCount}`);
        console.log('');
      });
    } else {
      console.log('  (Not enough data for comparison)');
    }
  } catch (error) {
    console.log(`  ⚠️  Error: ${error.message}`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('✅ AI Cost Analytics Demo Complete!');
  console.log('');
  console.log('📍 Dashboard: http://localhost:5001/ai-cost-dashboard.html');
  console.log('📍 API Docs: http://localhost:5001/api/ai-analytics/*');
  console.log('');

  await db.end();
}

main().catch(error => {
  console.error('');
  console.error('❌ Demo failed:', error);
  console.error('');
  process.exit(1);
});
