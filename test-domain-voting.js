/**
 * Standalone test for domain voting system
 * Tests API endpoints without full router
 */

const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

// Initialize minimal express app
const app = express();
app.use(bodyParser.json());

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

// Initialize domain voting routes
const { initRoutes } = require('./routes/domain-voting-routes');
const domainVotingRoutes = initRoutes(db);
app.use('/api/domain-voting', domainVotingRoutes);

// Start server
const PORT = 5002; // Use different port to avoid conflicts
const server = app.listen(PORT, () => {
  console.log(`✓ Domain voting test server running on http://localhost:${PORT}`);
  console.log(`\nTest endpoints:`);
  console.log(`  GET  http://localhost:${PORT}/api/domain-voting/card`);
  console.log(`  POST http://localhost:${PORT}/api/domain-voting/vote`);
  console.log(`  POST http://localhost:${PORT}/api/domain-voting/feedback`);
  console.log(`  GET  http://localhost:${PORT}/api/domain-voting/stats`);
  console.log(`  GET  http://localhost:${PORT}/api/domain-voting/pending-rewards/:sessionId`);
  console.log(`\nPress Ctrl+C to stop\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down test server...');
  server.close(() => {
    db.end();
    process.exit(0);
  });
});
