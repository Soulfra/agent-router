#!/usr/bin/env node
/**
 * CALOS Start-All Launcher
 *
 * Starts everything needed for CALOS to run:
 * 1. Main API router (port 5001)
 * 2. Cal autonomous learning loop (background)
 * 3. Guardian monitoring (integrated)
 * 4. AI conversation logging (integrated)
 *
 * Usage:
 *   node start-all.js
 *   npm run start:all
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

console.log('╔════════════════════════════════════════════════╗');
console.log('║           CALOS Full Stack Launcher            ║');
console.log('╚════════════════════════════════════════════════╝\n');

// Check environment
const requiredEnvVars = ['DB_NAME', 'DB_USER'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error(`❌ Missing environment variables: ${missingVars.join(', ')}`);
  console.error('   Create a .env file with database config\n');
  process.exit(1);
}

console.log('Environment check:');
console.log(`  DB_NAME: ${process.env.DB_NAME}`);
console.log(`  DB_USER: ${process.env.DB_USER}`);
console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✓ set' : '✗ not set (Cal will use Ollama)'}`);
console.log('');

// Start main router
console.log('🚀 Starting CALOS Router (port 5001)...\n');

const router = spawn('node', ['router.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: process.env
});

router.on('error', (error) => {
  console.error('❌ Failed to start router:', error);
  process.exit(1);
});

router.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Router exited with code ${code}`);
    process.exit(code);
  }
});

// Wait a bit for router to start
setTimeout(() => {
  console.log('\n🤖 Starting Cal Autonomous Loop...\n');

  const cal = spawn('node', ['scripts/cal-autonomous-loop.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env
  });

  cal.on('error', (error) => {
    console.error('❌ Failed to start Cal loop:', error);
  });

  cal.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ Cal loop exited with code ${code}`);
    }
  });

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down CALOS...');
    router.kill();
    cal.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\nShutting down CALOS...');
    router.kill();
    cal.kill();
    process.exit(0);
  });

}, 3000);

console.log('\n✅ CALOS is starting up...');
console.log('\nServices:');
console.log('  • Router API: http://localhost:5001');
console.log('  • Cal Loop: Running in background');
console.log('  • Guardian: Monitoring every 60s');
console.log('  • AI Logging: Enabled (tracks OpenAI calls)');
console.log('\nPress Ctrl+C to stop all services\n');
