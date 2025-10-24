#!/usr/bin/env node

/**
 * Start Router in Quiet Mode
 *
 * Reduces console spam by setting LOG_LEVEL=error
 * Only shows critical errors, not info/debug messages
 *
 * Usage:
 *   node start-quiet.js
 *   npm run start:quiet
 */

// Set log level to error only (reduce spam)
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

// Patch console.log to respect LOG_LEVEL
const originalLog = console.log;
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_LEVELS = {
  'debug': 0,
  'info': 1,
  'warn': 2,
  'error': 3,
  'silent': 4
};

const currentLevel = LOG_LEVELS[LOG_LEVEL] || LOG_LEVELS['info'];

// Only log if message level >= current level
console.log = function(...args) {
  if (currentLevel <= LOG_LEVELS['info']) {
    originalLog.apply(console, args);
  }
};

console.info = function(...args) {
  if (currentLevel <= LOG_LEVELS['info']) {
    originalInfo.apply(console, args);
  }
};

console.warn = function(...args) {
  if (currentLevel <= LOG_LEVELS['warn']) {
    originalWarn.apply(console, args);
  }
};

console.error = function(...args) {
  if (currentLevel <= LOG_LEVELS['error']) {
    originalError.apply(console, args);
  }
};

console.log(''); // Empty line for spacing
console.error('🤫 Starting in QUIET mode (LOG_LEVEL=' + LOG_LEVEL + ')');
console.error('💡 To see all logs: LOG_LEVEL=debug node router.js --local');
console.error(''); // Empty line

// Start the router
require('./router.js');
