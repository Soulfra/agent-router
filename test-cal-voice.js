#!/usr/bin/env node

/**
 * Test Cal Voice Integration
 *
 * Tests the full voice → brand creation flow:
 * 1. Text command simulation (no actual voice input)
 * 2. Command parsing
 * 3. Brand generation via Ollama
 * 4. Project creation
 * 5. Registry update
 * 6. Multi-platform sync
 *
 * Usage:
 *   node test-cal-voice.js
 */

const CalAutonomousVoiceIntegration = require('./lib/cal-autonomous-voice-integration');

// CLI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log('═══════════════════════════════════════', 'bright');
  log(`  ${title}`, 'bright');
  log('═══════════════════════════════════════', 'bright');
  console.log('');
}

async function main() {
  try {
    log('\n🤖 Cal Voice Integration Test\n', 'bright');

    // 1. Initialize Cal
    logSection('Step 1: Initialize Cal');
    const cal = new CalAutonomousVoiceIntegration({
      verbose: true
    });

    const initResult = await cal.init();

    if (!initResult.success) {
      log(`❌ Initialization failed: ${initResult.error}`, 'red');
      process.exit(1);
    }

    log('✅ Cal initialized successfully', 'green');

    // 2. Get system status
    logSection('Step 2: System Status');
    const status = await cal.getStatus();

    log('Cal Status:', 'cyan');
    log(`  Initialized: ${status.initialized ? '✅' : '❌'}`);
    log(`  Capabilities: ${status.capabilities.join(', ')}`);

    if (status.subsystems.whisper) {
      log(`\nWhisper Status:`, 'cyan');
      log(`  API Available: ${status.subsystems.whisper.apiAvailable ? '✅' : '❌'}`);
      log(`  Local Available: ${status.subsystems.whisper.localAvailable ? '✅' : '❌'}`);
      log(`  Mode: ${status.subsystems.whisper.mode}`);
    }

    // 3. Test brand status command
    logSection('Step 3: Test Brand Status Command');
    const statusCmd = 'status of Soulfra';
    log(`Command: "${statusCmd}"`, 'yellow');

    const statusResult = await cal.processTextCommand(statusCmd);

    if (statusResult.success && statusResult.result.success) {
      log('\n✅ Status command succeeded', 'green');
      log(JSON.stringify(statusResult.result.brand, null, 2), 'dim');
    } else {
      log('\n❌ Status command failed', 'red');
      if (statusResult.error) log(`Error: ${statusResult.error}`, 'red');
      if (statusResult.result && statusResult.result.message) {
        log(`Message: ${statusResult.result.message}`, 'yellow');
      }
    }

    // 4. Test brand creation command (will create actual project)
    logSection('Step 4: Test Brand Creation Command');
    const createCmd = 'create a new brand called TestBrand for testing Cal voice integration';
    log(`Command: "${createCmd}"`, 'yellow');
    log('\n⚠️  This will create an actual project folder and update registry!', 'yellow');
    log('Press Ctrl+C to cancel within 3 seconds...\n', 'dim');

    await new Promise(resolve => setTimeout(resolve, 3000));

    const createResult = await cal.processTextCommand(createCmd);

    if (createResult.success) {
      log('\n✅ Brand creation command executed', 'green');

      if (createResult.result.success) {
        log('\n✅ Brand created successfully!', 'green');

        if (createResult.result.brand) {
          log('\nBrand Details:', 'cyan');
          log(`  Name: ${createResult.result.brand.name}`);
          log(`  Domain: ${createResult.result.brand.domain}`);
          log(`  Tagline: ${createResult.result.brand.tagline}`);
          log(`  Tier: ${createResult.result.brand.tier}`);
          log(`  Type: ${createResult.result.brand.type}`);
          log(`  Status: ${createResult.result.brand.status}`);
        }

        if (createResult.result.projectPath) {
          log(`\n📁 Project created at: ${createResult.result.projectPath}`, 'cyan');
        }

        if (createResult.result.syncResult) {
          log('\n📤 Sync Results:', 'cyan');
          log(`  GitHub: ${createResult.result.syncResult.github.success ? '✅' : '❌'}`);
          log(`  Sheets: ${createResult.result.syncResult.sheets.success ? '✅' : '❌'}`);
          log(`  Gist: ${createResult.result.syncResult.gist.success ? '✅' : '❌'}`);
          log(`  GoDaddy: ${createResult.result.syncResult.godaddy.success ? '✅' : '❌'}`);
        }
      } else {
        log('\n❌ Brand creation failed', 'red');
        if (createResult.result.error) {
          log(`Error: ${createResult.result.error}`, 'red');
        }
        if (createResult.result.message) {
          log(`Message: ${createResult.result.message}`, 'yellow');
        }
      }
    } else {
      log('\n❌ Command execution failed', 'red');
      log(`Error: ${createResult.error}`, 'red');
    }

    // 5. Test deployment monitoring
    logSection('Step 5: Test Deployment Monitoring');
    log('Starting deployment monitor (will run for 30 seconds)...', 'yellow');

    const monitorResult = await cal.startMonitoring();

    if (monitorResult.success) {
      log('✅ Monitoring started', 'green');
      log('Cal is now watching deployments...', 'dim');

      // Let it run for 30 seconds
      await new Promise(resolve => setTimeout(resolve, 30000));

      const stopResult = cal.stopMonitoring();
      log(`\n${stopResult.message}`, 'cyan');
    } else {
      log(`❌ Monitoring failed: ${monitorResult.error}`, 'red');
    }

    // 6. Final status
    logSection('Final Status');
    const finalStatus = await cal.getStatus();

    log('Test Complete!', 'green');
    log('\nFinal System Status:', 'cyan');
    log(JSON.stringify({
      initialized: finalStatus.initialized,
      capabilities: finalStatus.capabilities,
      subsystems: {
        whisper: finalStatus.subsystems.whisper?.mode,
        deploymentMonitor: finalStatus.subsystems.deploymentMonitor?.monitoring ? 'active' : 'stopped',
        registrySync: finalStatus.subsystems.registrySync?.lastSync ? 'synced' : 'not synced'
      }
    }, null, 2), 'dim');

    log('\n✅ All tests complete!\n', 'green');

  } catch (error) {
    log(`\n❌ Test failed: ${error.message}\n`, 'red');
    if (process.env.VERBOSE) {
      console.error(error);
    }
    process.exit(1);
  }
}

// Run tests
main();
