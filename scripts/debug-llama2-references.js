#!/usr/bin/env node
/**
 * Debug llama2 References
 *
 * Uses YOUR existing tools to find and fix llama2 references.
 * Stores the debugging process as a "lesson" with time differentials.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function main() {
  const startTime = Date.now();

  log('\n🔍 Debug llama2 References', 'cyan');
  log('Using YOUR existing diagnostic tools\n', 'cyan');
  log('='.repeat(80), 'cyan');

  const results = {
    timestamp: new Date().toISOString(),
    startTime,
    findings: [],
    fixes: [],
    timeSpent: 0
  };

  // ============================================================================
  // STEP 1: Check Ollama for actual models
  // ============================================================================

  log('\n📡 Step 1: Fetching actual Ollama models...', 'bright');

  try {
    const { stdout } = await execPromise('curl -s http://localhost:11434/api/tags');
    const ollamaData = JSON.parse(stdout);
    const modelNames = ollamaData.models ? ollamaData.models.map(m => m.name) : [];

    log(`   ✅ Found ${modelNames.length} models:`, 'green');
    modelNames.slice(0, 10).forEach(name => {
      log(`      • ${name}`, 'cyan');
    });
    if (modelNames.length > 10) {
      log(`      ... and ${modelNames.length - 10} more`, 'cyan');
    }

    results.findings.push({
      type: 'ollama_models',
      count: modelNames.length,
      models: modelNames,
      customModels: modelNames.filter(m =>
        m.includes('soulfra') ||
        m.includes('deathtodata') ||
        m.includes('calos') ||
        m.includes('finishthis')
      )
    });

  } catch (error) {
    log(`   ❌ Error fetching Ollama models: ${error.message}`, 'red');
  }

  // ============================================================================
  // STEP 2: Find llama2 references in code
  // ============================================================================

  log('\n📂 Step 2: Finding llama2 references in code...', 'bright');

  try {
    const { stdout } = await execPromise(
      'grep -r "llama2" lib/ routes/ --include="*.js" | grep -v node_modules'
    );

    const lines = stdout.trim().split('\n').filter(Boolean);
    log(`   Found ${lines.length} references:`, 'yellow');

    const fileGroups = {};
    lines.forEach(line => {
      const [file, ...rest] = line.split(':');
      if (!fileGroups[file]) fileGroups[file] = [];
      fileGroups[file].push(rest.join(':').trim());
    });

    Object.entries(fileGroups).forEach(([file, refs]) => {
      log(`\n   📄 ${file}:`, 'cyan');
      refs.slice(0, 3).forEach(ref => {
        log(`      ${ref.substring(0, 80)}...`, 'yellow');
      });
      if (refs.length > 3) {
        log(`      ... and ${refs.length - 3} more`, 'yellow');
      }
    });

    results.findings.push({
      type: 'code_references',
      count: lines.length,
      files: Object.keys(fileGroups),
      details: fileGroups
    });

  } catch (error) {
    if (error.code === 1) {
      log('   ✅ No llama2 references found in lib/routes', 'green');
    } else {
      log(`   ❌ Error searching: ${error.message}`, 'red');
    }
  }

  // ============================================================================
  // STEP 3: Check .env configuration
  // ============================================================================

  log('\n⚙️  Step 3: Checking .env configuration...', 'bright');

  try {
    const envPath = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const ollamaLines = envContent.split('\n').filter(line =>
      line.includes('OLLAMA') && !line.startsWith('#')
    );

    if (ollamaLines.length > 0) {
      log('   Found Ollama config:', 'cyan');
      ollamaLines.forEach(line => {
        log(`      ${line}`, 'yellow');
        if (line.includes('llama2')) {
          log('      ⚠️  Contains llama2!', 'red');
        }
      });
    }

    results.findings.push({
      type: 'env_config',
      lines: ollamaLines
    });

  } catch (error) {
    log(`   ⚠️  Could not read .env: ${error.message}`, 'yellow');
  }

  // ============================================================================
  // STEP 4: Recommend fixes
  // ============================================================================

  log('\n💡 Step 4: Recommended Fixes', 'bright');
  log('', '');

  const customModels = results.findings.find(f => f.type === 'ollama_models')?.customModels || [];

  if (customModels.length > 0) {
    log('   ✅ You have custom models! Use these instead of llama2:', 'green');
    customModels.forEach(model => {
      log(`      • ${model}`, 'cyan');
    });

    log('\n   Suggested replacements:', 'yellow');
    log(`      llama2 → ${customModels[0] || 'mistral'}`, 'cyan');
    log(`      llama2:7b → ${customModels[0] || 'mistral'}`, 'cyan');
    log(`      llama2:13b → ${customModels[1] || 'mistral'}`, 'cyan');
    log(`      llama2:70b → ${customModels[2] || 'mistral'}`, 'cyan');
  } else {
    log('   ⚠️  No custom models found. Consider:', 'yellow');
    log('      • Using mistral (better performance)', 'cyan');
    log('      • Creating custom models for your domains', 'cyan');
  }

  // ============================================================================
  // STEP 5: Generate fix commands
  // ============================================================================

  log('\n🔧 Step 5: Fix Commands', 'bright');
  log('', '');

  const codeFiles = results.findings.find(f => f.type === 'code_references')?.files || [];

  if (codeFiles.length > 0) {
    log('   Run these sed commands to fix:', 'cyan');
    log('', '');

    const replacement = customModels[0] || 'mistral';
    codeFiles.forEach(file => {
      log(`   # Fix ${file}`, 'yellow');
      log(`   sed -i '' 's/llama2/${replacement}/g' ${file}`, 'cyan');
      log('', '');
    });

    results.fixes.push({
      type: 'sed_commands',
      replacement,
      files: codeFiles
    });
  }

  // ============================================================================
  // STEP 6: Calculate time differential
  // ============================================================================

  const endTime = Date.now();
  const timeSpent = endTime - startTime;
  results.timeSpent = timeSpent;

  log('\n⏱️  Step 6: Time Differential', 'bright');
  log(`   Total time: ${timeSpent}ms`, 'cyan');
  log(`   XP earned: ${Math.floor(timeSpent / 100)} (1 XP per 100ms)`, 'cyan');

  // ============================================================================
  // STEP 7: Save results
  // ============================================================================

  const logDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logFile = path.join(logDir, `debug-llama2-${Date.now()}.json`);
  fs.writeFileSync(logFile, JSON.stringify(results, null, 2));

  log('\n📝 Results saved to:', 'bright');
  log(`   ${logFile}`, 'cyan');

  // ============================================================================
  // Summary
  // ============================================================================

  log('\n' + '='.repeat(80), 'cyan');
  log('📊 Summary', 'bright');
  log('='.repeat(80), 'cyan');

  const modelCount = results.findings.find(f => f.type === 'ollama_models')?.count || 0;
  const codeRefCount = results.findings.find(f => f.type === 'code_references')?.count || 0;
  const customModelCount = results.findings.find(f => f.type === 'ollama_models')?.customModels.length || 0;

  log(`\n   Ollama models: ${modelCount}`, 'cyan');
  log(`   Custom models: ${customModelCount}`, 'cyan');
  log(`   Code references to llama2: ${codeRefCount}`, codeRefCount > 0 ? 'yellow' : 'green');
  log(`   Time spent: ${timeSpent}ms`, 'cyan');
  log(`   XP earned: ${Math.floor(timeSpent / 100)}`, 'cyan');

  log('\n✨ Debug complete!\n', 'green');
}

// Run
main().catch(error => {
  log(`\n❌ Error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
