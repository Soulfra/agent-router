#!/usr/bin/env node

/**
 * Model Benchmarking Script
 *
 * Like Bitcoin mining benchmarks - measure tokens/second for each model
 * to enable predictable block times and optimal chunk sizing.
 *
 * Usage:
 *   node scripts/benchmark-models.js               # Benchmark all active models
 *   node scripts/benchmark-models.js codellama:7b  # Benchmark specific model
 *   node scripts/benchmark-models.js --quick       # Quick test (fewer iterations)
 */

const { Pool } = require('pg');
const axios = require('axios');
const tokenCounter = require('../lib/token-counter');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Standardized test prompts of various lengths
const TEST_PROMPTS = [
  {
    name: 'tiny',
    tokens: 50,
    prompt: 'What is 2+2? Answer briefly.'
  },
  {
    name: 'small',
    tokens: 100,
    prompt: 'Explain what JavaScript is in 2-3 sentences.'
  },
  {
    name: 'medium',
    tokens: 500,
    prompt: `Write a function in JavaScript that takes an array of numbers and returns the sum.
Include error handling and comments explaining the code.`
  },
  {
    name: 'large',
    tokens: 1000,
    prompt: `Explain the concept of map-reduce in distributed computing.
Include examples of how it works, common use cases, and compare it to traditional processing approaches.
Provide code examples in Python or JavaScript.`
  },
  {
    name: 'xlarge',
    tokens: 2000,
    prompt: `Write a comprehensive guide to building a REST API in Node.js with Express.
Cover: routing, middleware, authentication, error handling, database integration, and deployment.
Include code examples for each section and explain best practices.`
  }
];

class ModelBenchmark {
  constructor() {
    this.db = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/postgres'
    });
  }

  /**
   * Get list of active Ollama models
   */
  async getOllamaModels() {
    try {
      const response = await axios.get(`${OLLAMA_URL}/api/tags`);
      return response.data.models || [];
    } catch (error) {
      console.error('Failed to get Ollama models:', error.message);
      return [];
    }
  }

  /**
   * Run single benchmark test
   */
  async runTest(modelId, prompt, promptName) {
    const startTime = Date.now();

    try {
      const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
        model: modelId,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9
        }
      }, {
        timeout: 120000 // 2 minute timeout
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Extract metrics
      const responseText = response.data.response || '';
      const promptTokens = tokenCounter.count(prompt, modelId);
      const responseTokens = tokenCounter.count(responseText, modelId);
      const tokensPerSecond = responseTokens / (responseTime / 1000);

      return {
        success: true,
        promptTokens,
        responseTokens,
        responseTime,
        tokensPerSecond,
        promptName
      };

    } catch (error) {
      console.error(`  ✗ ${promptName} failed:`, error.message);
      return {
        success: false,
        error: error.message,
        promptName
      };
    }
  }

  /**
   * Ensure model exists in benchmark table (for FK constraint)
   */
  async ensureModelExists(modelId) {
    try {
      const modelParts = modelId.split(':');
      const modelFamily = modelParts[0];
      const modelSize = modelParts[1] || 'unknown';

      await this.db.query(`
        INSERT INTO model_benchmarks (model_id, model_family, model_size, is_internal)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (model_id) DO NOTHING
      `, [modelId, modelFamily, modelSize]);
    } catch (error) {
      console.error('  Failed to ensure model exists:', error.message);
    }
  }

  /**
   * Benchmark single model
   */
  async benchmarkModel(modelId, quick = false) {
    console.log(`\n🔬 Benchmarking ${modelId}...`);

    // Ensure model exists in benchmarks table (for FK constraint)
    await this.ensureModelExists(modelId);

    // Select prompts (all or subset for quick test)
    const prompts = quick
      ? [TEST_PROMPTS[0], TEST_PROMPTS[2], TEST_PROMPTS[3]] // tiny, medium, large
      : TEST_PROMPTS;

    const results = [];

    for (const testPrompt of prompts) {
      process.stdout.write(`  Running ${testPrompt.name} test...`);
      const result = await this.runTest(modelId, testPrompt.prompt, testPrompt.name);

      if (result.success) {
        console.log(` ✓ ${result.tokensPerSecond.toFixed(1)} tokens/sec`);
        results.push(result);

        // Save measurement
        await this.saveMeasurement(modelId, result);
      }

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Calculate aggregate stats
    if (results.length > 0) {
      const stats = this.calculateStats(results);
      await this.saveBenchmark(modelId, stats);

      console.log(`\n📊 Results for ${modelId}:`);
      console.log(`   Average: ${stats.avg.toFixed(1)} tokens/sec`);
      console.log(`   Median:  ${stats.p50.toFixed(1)} tokens/sec`);
      console.log(`   P95:     ${stats.p95.toFixed(1)} tokens/sec`);
      console.log(`   Range:   ${stats.min.toFixed(1)} - ${stats.max.toFixed(1)} tokens/sec`);
      console.log(`   Tests:   ${results.length} successful`);

      return stats;
    }

    return null;
  }

  /**
   * Calculate statistics from results
   */
  calculateStats(results) {
    const tpsValues = results.map(r => r.tokensPerSecond).sort((a, b) => a - b);
    const promptTokens = results.map(r => r.promptTokens);
    const responseTokens = results.map(r => r.responseTokens);

    return {
      avg: tpsValues.reduce((a, b) => a + b) / tpsValues.length,
      p50: this.percentile(tpsValues, 0.5),
      p95: this.percentile(tpsValues, 0.95),
      min: Math.min(...tpsValues),
      max: Math.max(...tpsValues),
      avgPromptTokens: Math.round(promptTokens.reduce((a, b) => a + b) / promptTokens.length),
      avgResponseTokens: Math.round(responseTokens.reduce((a, b) => a + b) / responseTokens.length),
      measurementCount: results.length
    };
  }

  /**
   * Calculate percentile
   */
  percentile(arr, p) {
    const index = Math.ceil(arr.length * p) - 1;
    return arr[Math.max(0, index)];
  }

  /**
   * Save measurement to database
   */
  async saveMeasurement(modelId, result) {
    try {
      await this.db.query(`
        INSERT INTO benchmark_measurements (
          model_id, prompt_tokens, response_tokens, response_time_ms,
          prompt_type, measurement_source
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        modelId,
        result.promptTokens,
        result.responseTokens,
        result.responseTime,
        result.promptName,
        'benchmark-script'
      ]);
    } catch (error) {
      console.error('  Failed to save measurement:', error.message);
    }
  }

  /**
   * Save benchmark summary to database
   */
  async saveBenchmark(modelId, stats) {
    try {
      // Get model info
      const modelParts = modelId.split(':');
      const modelFamily = modelParts[0];
      const modelSize = modelParts[1] || 'unknown';

      // Detect hardware
      const hardware = await this.detectHardware();

      await this.db.query(`
        INSERT INTO model_benchmarks (
          model_id, model_family, model_size,
          avg_tokens_per_second, p50_tokens_per_second, p95_tokens_per_second,
          min_tokens_per_second, max_tokens_per_second,
          avg_prompt_tokens, avg_response_tokens,
          measurements_count,
          hardware_spec, benchmark_date, is_internal
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), true)
        ON CONFLICT (model_id) DO UPDATE SET
          avg_tokens_per_second = EXCLUDED.avg_tokens_per_second,
          p50_tokens_per_second = EXCLUDED.p50_tokens_per_second,
          p95_tokens_per_second = EXCLUDED.p95_tokens_per_second,
          min_tokens_per_second = EXCLUDED.min_tokens_per_second,
          max_tokens_per_second = EXCLUDED.max_tokens_per_second,
          avg_prompt_tokens = EXCLUDED.avg_prompt_tokens,
          avg_response_tokens = EXCLUDED.avg_response_tokens,
          measurements_count = EXCLUDED.measurements_count,
          hardware_spec = EXCLUDED.hardware_spec,
          benchmark_date = NOW(),
          updated_at = NOW()
      `, [
        modelId, modelFamily, modelSize,
        stats.avg, stats.p50, stats.p95,
        stats.min, stats.max,
        stats.avgPromptTokens, stats.avgResponseTokens,
        stats.measurementCount,
        hardware
      ]);

      console.log(`   ✓ Saved to database`);
    } catch (error) {
      console.error('  Failed to save benchmark:', error.message);
    }
  }

  /**
   * Detect hardware specs
   */
  async detectHardware() {
    const os = require('os');
    const platform = os.platform();
    const arch = os.arch();
    const cpus = os.cpus();
    const totalMem = (os.totalmem() / (1024 ** 3)).toFixed(0); // GB

    let hardware = `${platform} ${arch}, ${cpus.length} cores, ${totalMem}GB RAM`;

    // Try to detect GPU on macOS
    if (platform === 'darwin') {
      try {
        const { execSync } = require('child_process');
        const sysInfo = execSync('sysctl -n machdep.cpu.brand_string').toString().trim();
        hardware = `${sysInfo}, ${totalMem}GB RAM`;
      } catch (e) {
        // Ignore
      }
    }

    return hardware;
  }

  /**
   * Generate benchmark report
   */
  async generateReport() {
    const result = await this.db.query(`
      SELECT
        model_id,
        model_family,
        avg_tokens_per_second,
        p50_tokens_per_second,
        p95_tokens_per_second,
        is_fast,
        is_slow,
        measurements_count,
        hardware_spec,
        benchmark_date
      FROM model_benchmarks
      WHERE is_active = true
      ORDER BY avg_tokens_per_second DESC
    `);

    console.log('\n\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                  MODEL BENCHMARK REPORT                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (result.rows.length === 0) {
      console.log('No benchmarks found. Run benchmarks first.\n');
      return;
    }

    console.log('Model                      Avg TPS    P50     P95     Speed   Tests');
    console.log('─────────────────────────────────────────────────────────────────────');

    for (const row of result.rows) {
      // Skip if no benchmark data
      if (!row.avg_tokens_per_second) {
        continue;
      }

      const modelName = row.model_id.padEnd(24);
      const avgTps = row.avg_tokens_per_second.toFixed(1).padStart(7);
      const p50 = row.p50_tokens_per_second.toFixed(1).padStart(6);
      const p95 = row.p95_tokens_per_second.toFixed(1).padStart(6);
      const speed = row.is_fast ? '⚡ Fast' : row.is_slow ? '🐌 Slow' : '⚖️  Mid';
      const tests = String(row.measurements_count || 0).padStart(5);

      console.log(`${modelName} ${avgTps}   ${p50}   ${p95}   ${speed}   ${tests}`);
    }

    console.log('\n');
  }

  /**
   * Close database connection
   */
  async close() {
    await this.db.end();
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const report = args.includes('--report');
  const modelFilter = args.find(arg => !arg.startsWith('--'));

  const benchmark = new ModelBenchmark();

  try {
    if (report) {
      // Just show report
      await benchmark.generateReport();
      return;
    }

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║          MODEL THROUGHPUT BENCHMARKING SYSTEM                  ║');
    console.log('║   Like Bitcoin mining benchmarks - measure tokens/second       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Mode: ${quick ? 'QUICK (3 tests)' : 'FULL (5 tests)'}`);
    console.log(`Ollama URL: ${OLLAMA_URL}`);
    console.log('');

    // Get available models
    const models = await benchmark.getOllamaModels();

    if (models.length === 0) {
      console.log('⚠️  No Ollama models found. Make sure Ollama is running.');
      return;
    }

    // Filter models if specified
    let modelsToTest = models;
    if (modelFilter) {
      modelsToTest = models.filter(m => m.name.includes(modelFilter));
      if (modelsToTest.length === 0) {
        console.log(`⚠️  No models matching "${modelFilter}" found.`);
        return;
      }
    }

    console.log(`Found ${modelsToTest.length} models to benchmark:\n`);

    // Benchmark each model
    for (const model of modelsToTest) {
      await benchmark.benchmarkModel(model.name, quick);
    }

    // Show report
    await benchmark.generateReport();

    console.log('✅ Benchmarking complete!\n');
    console.log('💡 Use these benchmarks for:');
    console.log('   - Optimal chunk sizing (target block time)');
    console.log('   - Pre-flight time estimation');
    console.log('   - Model selection based on speed');
    console.log('   - Performance comparison vs papers/specs\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await benchmark.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ModelBenchmark;
