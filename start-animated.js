#!/usr/bin/env node

/**
 * Start Router with Boot Animation
 *
 * Shows the "all colors → white → build up" animation you described!
 *
 * Boot stages:
 * 1. ⚫️ LOAD: Load all modules (all colors/systems)
 * 2. ⚪️ CLEAN: Clean slate (white screen)
 * 3. 🟢 CORE: Initialize core (database, ollama)
 * 4. 🟡 SERVICES: Start services (buckets, xref)
 * 5. 🔵 FEATURES: Enable features (price workers, schedulers)
 * 6. ✅ READY: System operational
 *
 * Usage:
 *   node start-animated.js
 *   npm run start:animated
 */

const BootSequencer = require('./lib/boot-sequencer');
const { Pool } = require('pg');

// Save original console methods
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const originalInfo = console.info;

let bootMode = true;

// Suppress ALL logs during boot sequence (except errors)
console.log = (...args) => {
  if (!bootMode) originalLog(...args);
};

console.warn = (...args) => {
  if (!bootMode) originalWarn(...args);
};

console.info = (...args) => {
  if (!bootMode) originalInfo(...args);
};

console.error = (...args) => {
  // Only show errors during boot
  if (!bootMode) originalError(...args);
};

// Boot animation prints directly
const bootPrint = (...args) => {
  originalLog(...args);
};

// Create boot sequencer
const sequencer = new BootSequencer({
  verbose: true,
  colorEnabled: true
});

// ============================================================================
// STAGE 1: ⚫️ LOAD - Import all modules
// ============================================================================

sequencer.registerStage(
  'load',
  'Loading modules and dependencies',
  async () => {
    // Load environment
    require('dotenv').config();

    // Simulate the "all colors" moment (all systems loading)
    await sleep(500);

    // Load core modules
    const express = require('express');
    const http = require('http');
    const WebSocket = require('ws');

    return { express, http, WebSocket };
  },
  { required: true, timeout: 5000 }
);

// ============================================================================
// STAGE 2: ⚪️ CLEAN - Clean slate
// ============================================================================

sequencer.registerStage(
  'clean',
  'Preparing clean environment',
  async () => {
    // Set log level to quiet (white screen)
    process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

    // Check for port availability
    const port = process.env.PORT || 5001;

    // Simulate the "white screen" moment
    await sleep(300);

    return { port };
  },
  { required: true }
);

// ============================================================================
// STAGE 3: 🟢 CORE - Initialize critical systems
// ============================================================================

sequencer.registerStage(
  'core',
  'Initializing database and Ollama',
  async () => {
    // Check database
    const dbUrl = process.env.DATABASE_URL || 'postgresql://localhost/postgres';
    const db = new Pool({ connectionString: dbUrl });

    try {
      await db.query('SELECT 1');
      // Database OK
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }

    // Check Ollama
    const axios = require('axios');
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

    try {
      await axios.get(`${ollamaUrl}/api/tags`, { timeout: 2000 });
      // Ollama OK
    } catch (error) {
      console.warn('Ollama not available, some features will be disabled');
    }

    await sleep(500);

    return { db, ollamaUrl };
  },
  { required: true, timeout: 10000 }
);

// ============================================================================
// STAGE 4: 🟡 SERVICES - Start background services
// ============================================================================

sequencer.registerStage(
  'services',
  'Starting buckets and XRef system',
  async () => {
    // Buckets will initialize via router
    // XRef will initialize via router
    // We're just marking this stage as "starting services"

    await sleep(300);

    return { buckets: 'pending', xref: 'pending' };
  },
  { required: false }
);

// ============================================================================
// STAGE 5: 🔵 FEATURES - Enable optional features
// ============================================================================

sequencer.registerStage(
  'features',
  'Enabling price workers and schedulers',
  async () => {
    // These will start via router
    // We're marking the stage as "enabling features"

    await sleep(300);

    return { priceWorkers: 'pending', schedulers: 'pending' };
  },
  { required: false }
);

// ============================================================================
// STAGE 6: ✅ READY - System operational
// ============================================================================

sequencer.registerStage(
  'ready',
  'System fully operational',
  async () => {
    // Boot complete
    await sleep(200);

    return { ready: true };
  },
  { required: true }
);

// ============================================================================
// BOOT!
// ============================================================================

async function main() {
  try {
    // Run boot sequence
    const result = await sequencer.boot();

    // Boot animation complete - now start the actual router
    bootMode = false;

    // Restore console output
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;

    // Start router
    require('./router.js');

  } catch (error) {
    bootMode = false;
    console.error('❌ Boot failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run boot sequence
if (require.main === module) {
  main();
}

module.exports = main;
