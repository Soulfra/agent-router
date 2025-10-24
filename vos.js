#!/usr/bin/env node
/**
 * VOS - Verify Operating System
 *
 * 3-step verification for CalOS:
 * 1. Backend Check (server + Ollama)
 * 2. Offline Check (PWA + localStorage + offline tools)
 * 3. System Check (platform detection + Capacitor plugins)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function success(msg) {
  log(`✅ ${msg}`, 'green');
}

function error(msg) {
  log(`❌ ${msg}`, 'red');
}

function info(msg) {
  log(`ℹ️  ${msg}`, 'cyan');
}

function step(num, msg) {
  log(`\n${num}/3 ${msg}`, 'bright');
}

// Step 1: Backend Check
async function checkBackend() {
  step(1, 'Backend............');

  let serverOk = false;
  let ollamaOk = false;
  let serverInfo = '';
  let ollamaModels = 0;

  // Check server
  try {
    const res = await axios.get('http://127.0.0.1:5001/health', { timeout: 3000 });
    if (res.data && res.data.status === 'ok') {
      serverOk = true;
      serverInfo = `Port 5001 (uptime: ${Math.round(res.data.uptime)}s)`;
    }
  } catch (e) {
    serverInfo = `Not running (${e.code || e.message})`;
  }

  // Check Ollama
  try {
    const res = await axios.get('http://127.0.0.1:11434/api/tags', { timeout: 3000 });
    if (res.data && res.data.models) {
      ollamaOk = true;
      ollamaModels = res.data.models.length;
    }
  } catch (e) {
    // Ollama not running
  }

  if (serverOk && ollamaOk) {
    success(`Online (5001, 11434 - ${ollamaModels} models)`);
    return true;
  } else if (serverOk) {
    info(`Partial (Server: ${serverInfo}, Ollama: offline)`);
    return false;
  } else {
    error(`Offline (Server: ${serverInfo})`);
    info('   Start with: npm run start:quiet');
    return false;
  }
}

// Step 2: Offline Check
async function checkOffline() {
  step(2, 'Offline............');

  const checks = {
    index: false,
    serviceWorker: false,
    offlineTools: 0
  };

  // Check index.html exists
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    checks.index = true;

    const content = fs.readFileSync(indexPath, 'utf8');

    // Check for service worker
    if (content.includes('registerServiceWorker') || content.includes('serviceWorker')) {
      checks.serviceWorker = true;
    }

    // Count offline tools (localStorage, calculator, etc.)
    if (content.includes('localStorage')) checks.offlineTools++;
    if (content.includes('window.CalOS')) checks.offlineTools++;
    if (content.includes('platform')) checks.offlineTools++;
    if (content.includes('files:')) checks.offlineTools++;
    if (content.includes('keys:')) checks.offlineTools++;
  }

  if (checks.index && checks.serviceWorker && checks.offlineTools >= 3) {
    success(`Ready (PWA + ${checks.offlineTools} features)`);
    return true;
  } else if (checks.index) {
    info(`Partial (Index: ${checks.index}, SW: ${checks.serviceWorker}, Tools: ${checks.offlineTools})`);
    return false;
  } else {
    error('Not configured');
    return false;
  }
}

// Step 3: System Check
async function checkSystem() {
  step(3, 'System.............');

  const checks = {
    capacitor: false,
    platform: 'Unknown',
    plugins: 0,
    ios: false
  };

  // Check package.json for Capacitor
  const pkgPath = path.join(__dirname, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    if (pkg.dependencies) {
      if (pkg.dependencies['@capacitor/core']) checks.capacitor = true;
      if (pkg.dependencies['@capacitor/device']) checks.plugins++;
      if (pkg.dependencies['@capacitor/haptics']) checks.plugins++;
      if (pkg.dependencies['@capacitor/status-bar']) checks.plugins++;
      if (pkg.dependencies['@capacitor/network']) checks.plugins++;
      if (pkg.dependencies['@capacitor/ios']) checks.ios = true;
    }
  }

  // Check for iOS project
  const iosPath = path.join(__dirname, 'ios');
  if (fs.existsSync(iosPath) && checks.ios) {
    checks.platform = 'iOS';
  } else if (checks.capacitor) {
    checks.platform = 'Web (Capacitor ready)';
  } else {
    checks.platform = 'Web';
  }

  if (checks.capacitor && checks.plugins >= 3 && checks.ios) {
    success(`${checks.platform} (${checks.plugins} plugins)`);
    return true;
  } else if (checks.capacitor) {
    info(`${checks.platform} (${checks.plugins} plugins)`);
    return false;
  } else {
    error(`${checks.platform} (no Capacitor)`);
    return false;
  }
}

// Main VOS function
async function runVOS() {
  log('\n🔍 VOS - Verify Operating System\n', 'cyan');

  const results = {
    backend: await checkBackend(),
    offline: await checkOffline(),
    system: await checkSystem()
  };

  const score = Object.values(results).filter(Boolean).length;

  log('\n' + '─'.repeat(40));

  if (score === 3) {
    log('\n✨ CalOS Operational', 'green');
    log('   All systems ready\n', 'green');
    process.exit(0);
  } else if (score === 2) {
    log('\n⚠️  CalOS Partially Ready', 'yellow');
    log(`   ${score}/3 checks passed\n`, 'yellow');
    process.exit(1);
  } else {
    log('\n❌ CalOS Not Ready', 'red');
    log(`   ${score}/3 checks passed\n`, 'red');
    log('   Quick fixes:', 'cyan');
    if (!results.backend) log('   • Start backend: npm run start:quiet', 'cyan');
    if (!results.offline) log('   • Check public/index.html exists', 'cyan');
    if (!results.system) log('   • Install Capacitor: npm install @capacitor/core', 'cyan');
    log('');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runVOS().catch(err => {
    error(`VOS failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { runVOS };
