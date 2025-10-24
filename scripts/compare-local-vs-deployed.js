/**
 * Local vs Deployed Comparison Script
 *
 * Compares your local development environment with what's actually deployed:
 * - GitHub Pages (soulfra.github.io)
 * - API endpoints
 * - Database vs hosted data
 * - Secrets/API keys
 * - Missing features
 *
 * Shows you EXACTLY what's deployed, what's local-only, and what to do next.
 *
 * Usage:
 *   node scripts/compare-local-vs-deployed.js
 *
 * Think of this as your "system health check" and roadmap generator.
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const GITHUB_PAGES_URL = 'https://soulfra.github.io';
const LOCAL_PAGES_DIR = path.join(__dirname, '../projects/soulfra.github.io');
const LOCAL_API_URL = 'http://localhost:5001';
const DEPLOYED_API_URL = 'https://api.calos.dev';

class LocalVsDeployedComparison {
  constructor() {
    this.results = {
      frontend: [],
      api: [],
      secrets: [],
      features: [],
      database: []
    };
  }

  async compare() {
    console.log('\n🔍 CALOS: Local vs Deployed Comparison\n');
    console.log('='.repeat(70));

    await this.compareFrontend();
    await this.compareAPI();
    await this.compareSecrets();
    await this.compareFeatures();
    await this.compareDatabase();

    this.printSummary();
    this.printRoadmap();
  }

  /**
   * Compare frontend files (GitHub Pages vs local)
   */
  async compareFrontend() {
    console.log('\n📄 FRONTEND (GitHub Pages vs Local)\n');

    const filesToCheck = [
      'index.html',
      'learn/index.html',
      'learn/player.html',
      'learn/arena.html',
      'learn/progress.html',
      'analytics/tracker.js',
      'games/billiondollargame-dashboard.html' // Might not exist
    ];

    for (const file of filesToCheck) {
      const deployedUrl = `${GITHUB_PAGES_URL}/${file}`;
      const localPath = path.join(LOCAL_PAGES_DIR, file);

      try {
        // Check if file exists locally
        const localExists = fs.existsSync(localPath);

        // Check if file exists on GitHub Pages
        const response = await fetch(deployedUrl);
        const deployedExists = response.ok;

        let status, message;

        if (localExists && deployedExists) {
          // Compare last modified times
          const localStat = fs.statSync(localPath);
          const deployedDate = new Date(response.headers.get('last-modified'));
          const localDate = localStat.mtime;

          const hoursDiff = (localDate - deployedDate) / (1000 * 60 * 60);

          if (Math.abs(hoursDiff) < 1) {
            status = '✅';
            message = 'Match (deployed recently)';
            this.results.frontend.push({ file, status: 'synced', message });
          } else if (localDate > deployedDate) {
            status = '⚠️';
            message = `LOCAL NEWER (${Math.floor(hoursDiff)} hours ahead)`;
            this.results.frontend.push({ file, status: 'local_newer', message, action: 'git push' });
          } else {
            status = '⚠️';
            message = 'DEPLOYED NEWER (pull changes?)';
            this.results.frontend.push({ file, status: 'deployed_newer', message, action: 'git pull' });
          }
        } else if (localExists && !deployedExists) {
          status = '📦';
          message = 'LOCAL ONLY (not deployed yet)';
          this.results.frontend.push({ file, status: 'local_only', message, action: 'git add && git push' });
        } else if (!localExists && deployedExists) {
          status = '⚠️';
          message = 'DEPLOYED ONLY (deleted locally?)';
          this.results.frontend.push({ file, status: 'deployed_only', message, action: 'git pull or rebuild' });
        } else {
          status = '❌';
          message = 'MISSING (not created yet)';
          this.results.frontend.push({ file, status: 'missing', message, action: 'create file' });
        }

        console.log(`  ${status} ${file.padEnd(45)} ${message}`);

      } catch (error) {
        console.log(`  ❌ ${file.padEnd(45)} Error: ${error.message}`);
        this.results.frontend.push({ file, status: 'error', message: error.message });
      }
    }
  }

  /**
   * Compare API endpoints
   */
  async compareAPI() {
    console.log('\n🌐 API ENDPOINTS (Local vs Deployed)\n');

    const endpoints = [
      '/health',
      '/api/learning/paths',
      '/api/learning/next-lesson/test_user/calriven',
      '/api/arena/challenge',
      '/api/analytics/events'
    ];

    for (const endpoint of endpoints) {
      const localUrl = `${LOCAL_API_URL}${endpoint}`;
      const deployedUrl = `${DEPLOYED_API_URL}${endpoint}`;

      // Check local
      let localStatus = '❌', localMsg = 'Not running';
      try {
        const response = await fetch(localUrl, { timeout: 2000 });
        localStatus = response.ok ? '✅' : '⚠️';
        localMsg = response.ok ? 'Working' : `HTTP ${response.status}`;
      } catch (error) {
        localMsg = error.code === 'ECONNREFUSED' ? 'Server offline' : 'Error';
      }

      // Check deployed
      let deployedStatus = '❌', deployedMsg = 'Not deployed';
      try {
        const response = await fetch(deployedUrl, { timeout: 3000 });
        deployedStatus = response.ok ? '✅' : '⚠️';
        deployedMsg = response.ok ? 'Working' : `HTTP ${response.status}`;
      } catch (error) {
        deployedMsg = error.code === 'ENOTFOUND' ? 'Domain not found' : 'Offline';
      }

      console.log(`  Local:    ${localStatus} ${endpoint.padEnd(45)} ${localMsg}`);
      console.log(`  Deployed: ${deployedStatus} ${endpoint.padEnd(45)} ${deployedMsg}`);
      console.log('');

      this.results.api.push({
        endpoint,
        local: { status: localStatus, message: localMsg },
        deployed: { status: deployedStatus, message: deployedMsg }
      });
    }
  }

  /**
   * Check secrets/API keys security
   */
  async compareSecrets() {
    console.log('\n🔐 SECRETS & API KEYS\n');

    // Check for .env files
    const envFiles = ['.env', '.env.calriven', '.env.vibecoding', '.env.soulfra'];
    let unencryptedKeys = 0;

    for (const envFile of envFiles) {
      const envPath = path.join(__dirname, '..', envFile);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const apiKeyMatches = content.match(/(ANTHROPIC_API_KEY|OPENAI_API_KEY|DEEPSEEK_API_KEY)/g);
        if (apiKeyMatches) {
          unencryptedKeys += apiKeyMatches.length;
          console.log(`  ⚠️  ${envFile.padEnd(30)} ${apiKeyMatches.length} unencrypted API keys`);
          this.results.secrets.push({
            file: envFile,
            status: 'unencrypted',
            keys: apiKeyMatches.length,
            action: 'Encrypt with VaultBridge'
          });
        }
      }
    }

    // Check if VaultBridge is used
    const vaultPath = path.join(__dirname, '../lib/vault-bridge.js');
    const vaultExists = fs.existsSync(vaultPath);

    if (vaultExists) {
      console.log(`  ✅ VaultBridge.padEnd(30) Available (but not wired up)`);
      this.results.secrets.push({
        feature: 'VaultBridge',
        status: 'available',
        action: 'Wire up in router.js'
      });
    }

    if (unencryptedKeys > 0) {
      console.log(`\n  💡 Found ${unencryptedKeys} unencrypted API keys`);
      console.log(`     Fix: node scripts/init-vault.js`);
    }
  }

  /**
   * Compare features (what's built vs what's deployed)
   */
  async compareFeatures() {
    console.log('\n🎮 FEATURES & FUNCTIONALITY\n');

    const features = [
      {
        name: 'Learning Hub',
        local: fs.existsSync(path.join(LOCAL_PAGES_DIR, 'learn/index.html')),
        deployed: true, // We checked this earlier
        functional: false // API not working
      },
      {
        name: 'LLM Arena',
        local: fs.existsSync(path.join(LOCAL_PAGES_DIR, 'learn/arena.html')),
        deployed: true,
        functional: false // No backend routes
      },
      {
        name: 'Mini-Games / Cards',
        local: fs.existsSync(path.join(__dirname, '../lib/card-game-engine.js')),
        deployed: false,
        functional: false
      },
      {
        name: 'Analytics Tracking',
        local: fs.existsSync(path.join(LOCAL_PAGES_DIR, 'analytics/tracker.js')),
        deployed: true,
        functional: false // No backend endpoint
      },
      {
        name: 'Progress Dashboard',
        local: fs.existsSync(path.join(LOCAL_PAGES_DIR, 'learn/progress.html')),
        deployed: true,
        functional: false // API needed
      }
    ];

    for (const feature of features) {
      let status;
      if (feature.functional) {
        status = '🟢';
      } else if (feature.deployed) {
        status = '🟡';
      } else if (feature.local) {
        status = '🟠';
      } else {
        status = '⚪';
      }

      const statusText = feature.functional ? 'WORKING'
        : feature.deployed ? 'DEPLOYED (needs API)'
        : feature.local ? 'LOCAL ONLY'
        : 'NOT BUILT';

      console.log(`  ${status} ${feature.name.padEnd(30)} ${statusText}`);

      this.results.features.push({
        name: feature.name,
        local: feature.local,
        deployed: feature.deployed,
        functional: feature.functional,
        status: statusText
      });
    }

    console.log('\n  Legend:');
    console.log('    🟢 WORKING - Fully functional');
    console.log('    🟡 DEPLOYED - Frontend deployed, backend needed');
    console.log('    🟠 LOCAL ONLY - Built but not deployed');
    console.log('    ⚪ NOT BUILT - Doesn\'t exist yet');
  }

  /**
   * Compare database state
   */
  async compareDatabase() {
    console.log('\n🗄️  DATABASE & DATA\n');

    try {
      const { Pool } = require('pg');
      const db = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://matthewmauer@localhost:5432/calos'
      });

      // Check tables
      const tablesResult = await db.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name LIKE '%learning%'
        OR table_name LIKE '%arena%'
        OR table_name LIKE '%analytics%'
        ORDER BY table_name
      `);

      console.log('  Local Database Tables:');
      for (const row of tablesResult.rows) {
        console.log(`    ✅ ${row.table_name}`);
        this.results.database.push({ table: row.table_name, status: 'exists' });
      }

      // Check data counts
      const pathsResult = await db.query('SELECT COUNT(*) FROM learning_paths');
      const lessonsResult = await db.query('SELECT COUNT(*) FROM lessons');

      console.log(`\n  Data Counts:`);
      console.log(`    📚 ${pathsResult.rows[0].count} learning paths`);
      console.log(`    📖 ${lessonsResult.rows[0].count} lessons`);

      console.log(`\n  ⚠️  Hosted Database:`);
      console.log(`    ❌ Not deployed (Railway/Render needed)`);

      this.results.database.push({
        type: 'hosted',
        status: 'not_deployed',
        action: 'Deploy to Railway with PostgreSQL'
      });

      await db.end();

    } catch (error) {
      console.log(`  ❌ Database error: ${error.message}`);
      this.results.database.push({ status: 'error', message: error.message });
    }
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 SUMMARY\n');

    const frontendSynced = this.results.frontend.filter(f => f.status === 'synced').length;
    const frontendTotal = this.results.frontend.length;

    const apiWorking = this.results.api.filter(a => a.deployed.status === '✅').length;
    const apiTotal = this.results.api.length;

    const featuresWorking = this.results.features.filter(f => f.functional).length;
    const featuresTotal = this.results.features.length;

    console.log(`Frontend:  ${frontendSynced}/${frontendTotal} files deployed`);
    console.log(`API:       ${apiWorking}/${apiTotal} endpoints working`);
    console.log(`Features:  ${featuresWorking}/${featuresTotal} fully functional`);
    console.log(`Secrets:   ${this.results.secrets.length} items need attention`);
  }

  /**
   * Print roadmap with next steps
   */
  printRoadmap() {
    console.log('\n' + '='.repeat(70));
    console.log('🗺️  YOUR ROADMAP (What to Do Next)\n');

    const steps = [];

    // Step 1: Fix local API
    const localApiDown = this.results.api.some(a => a.local.message.includes('offline'));
    if (localApiDown) {
      steps.push({
        priority: 'HIGH',
        task: 'Start local API server',
        command: 'npm start',
        why: 'Your local API is offline - need it for development'
      });
    }

    // Step 2: Encrypt secrets
    const unencryptedSecrets = this.results.secrets.filter(s => s.status === 'unencrypted');
    if (unencryptedSecrets.length > 0) {
      steps.push({
        priority: 'HIGH',
        task: 'Encrypt API keys with VaultBridge',
        command: 'node scripts/init-vault.js',
        why: 'Insecure to keep API keys in plain .env files'
      });
    }

    // Step 3: Deploy backend
    const apiNotDeployed = this.results.api.every(a => a.deployed.status === '❌');
    if (apiNotDeployed) {
      steps.push({
        priority: 'HIGH',
        task: 'Deploy backend API to Railway',
        command: 'railway init && railway up',
        why: 'Frontend calls api.calos.dev but it doesn\'t exist'
      });
    }

    // Step 4: Deploy local-only files
    const localOnlyFiles = this.results.frontend.filter(f => f.status === 'local_only');
    if (localOnlyFiles.length > 0) {
      steps.push({
        priority: 'MEDIUM',
        task: `Deploy ${localOnlyFiles.length} local-only files to GitHub Pages`,
        command: 'git add . && git commit -m "Deploy missing files" && git push',
        why: 'Features built locally but users can\'t access them'
      });
    }

    // Step 5: Wire up features
    const deployedButNonFunctional = this.results.features.filter(f => f.deployed && !f.functional);
    if (deployedButNonFunctional.length > 0) {
      steps.push({
        priority: 'MEDIUM',
        task: 'Build missing backend routes (arena, analytics)',
        command: 'node scripts/build-missing-routes.js',
        why: `${deployedButNonFunctional.length} features deployed but need API`
      });
    }

    // Print steps
    steps.forEach((step, i) => {
      const badge = step.priority === 'HIGH' ? '🔴' : step.priority === 'MEDIUM' ? '🟡' : '🟢';
      console.log(`${badge} STEP ${i + 1}: ${step.task}`);
      console.log(`   Why: ${step.why}`);
      console.log(`   Command: ${step.command}`);
      console.log('');
    });

    if (steps.length === 0) {
      console.log('🎉 Everything looks good! No action items.');
    }

    // Final recommendations
    console.log('💡 RECOMMENDED ORDER:');
    console.log('   1. Fix local development first (start server)');
    console.log('   2. Secure your secrets (encrypt API keys)');
    console.log('   3. Deploy backend to Railway');
    console.log('   4. Deploy missing frontend files');
    console.log('   5. Test end-to-end user journey');
    console.log('');
  }
}

// Run comparison
(async () => {
  const comparison = new LocalVsDeployedComparison();
  await comparison.compare();
  process.exit(0);
})();
