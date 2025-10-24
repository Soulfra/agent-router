#!/usr/bin/env node

/**
 * Daily Voice Journal Starter
 *
 * Interactive CLI to start/manage daily voice journaling
 *
 * Usage:
 *   node scripts/start-daily-journal.js
 *   npm run journal:start
 */

const http = require('http');
const readline = require('readline');

// Colors for terminal output
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

const API_HOST = process.env.CALOS_API_HOST || 'localhost';
const API_PORT = process.env.CALOS_API_PORT || 5001;
const BASE_URL = `http://${API_HOST}:${API_PORT}`;

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Prompt user for input
 */
function prompt(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer.trim());
    });
  });
}

/**
 * Make API request
 */
function apiRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: `/api/voice-journal${path}`,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Print header
 */
function printHeader() {
  console.log(`
${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════╗
║                                                            ║
║           📝 Daily Voice Journal Starter 🎙️                ║
║                                                            ║
║  Transform your rambling thoughts into coherent narratives ║
║  Extract actionable work • Route to brand domains          ║
║  Auto-publish everywhere • Build daily creative habit      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
  `);
}

/**
 * Print menu
 */
function printMenu() {
  console.log(`
${colors.bright}What would you like to do?${colors.reset}

  ${colors.green}1.${colors.reset} Start daily autonomous mode
  ${colors.green}2.${colors.reset} Stop autonomous mode
  ${colors.green}3.${colors.reset} Process recording now
  ${colors.green}4.${colors.reset} View status
  ${colors.green}5.${colors.reset} View session history
  ${colors.green}6.${colors.reset} View analytics & streak
  ${colors.green}7.${colors.reset} Update schedule
  ${colors.green}8.${colors.reset} View platform status
  ${colors.green}9.${colors.reset} Exit

  `);
}

/**
 * Start autonomous mode
 */
async function startAutonomousMode() {
  console.log(`\n${colors.cyan}Starting Daily Autonomous Mode${colors.reset}\n`);

  const userId = await prompt('User ID [default_user]: ') || 'default_user';
  const schedule = await prompt('Daily time (HH:MM) [09:00]: ') || '09:00';
  const timezone = await prompt('Timezone [America/New_York]: ') || 'America/New_York';

  console.log(`\n${colors.yellow}Auto-publish platforms (comma-separated):${colors.reset}`);
  console.log('  Options: mastodon, blog, twitter, youtube, newsletter, podcast');
  const platformsInput = await prompt('[mastodon,blog]: ') || 'mastodon,blog';
  const autoPub = platformsInput.split(',').map(p => p.trim());

  const autoExtract = await prompt('Extract ideas/tasks? [yes]: ') !== 'no';
  const autoRoute = await prompt('Route to brand domains? [yes]: ') !== 'no';

  console.log(`\n${colors.yellow}Prompt type:${colors.reset}`);
  console.log('  1. daily-reflection (what happened today)');
  console.log('  2. morning-planning (what to accomplish)');
  console.log('  3. evening-review (what did you learn)');
  const promptChoice = await prompt('[1]: ') || '1';
  const promptType = {
    '1': 'daily-reflection',
    '2': 'morning-planning',
    '3': 'evening-review'
  }[promptChoice] || 'daily-reflection';

  try {
    console.log(`\n${colors.dim}Starting autonomous mode...${colors.reset}`);

    const result = await apiRequest('POST', '/start', {
      userId,
      schedule,
      timezone,
      autoPub,
      autoExtract,
      autoRoute,
      promptType
    });

    console.log(`\n${colors.green}✓ Autonomous mode started!${colors.reset}`);
    console.log(`\n${colors.bright}Configuration:${colors.reset}`);
    console.log(`  User: ${userId}`);
    console.log(`  Schedule: ${schedule} ${timezone}`);
    console.log(`  Auto-publish: ${autoPub.join(', ')}`);
    console.log(`  Extract ideas: ${autoExtract ? 'yes' : 'no'}`);
    console.log(`  Route to brands: ${autoRoute ? 'yes' : 'no'}`);
    console.log(`  Prompt type: ${promptType}`);
    console.log(`\n${colors.cyan}The system will now monitor for recordings and prompt you daily!${colors.reset}\n`);
  } catch (error) {
    console.error(`\n${colors.red}✗ Error: ${error.message}${colors.reset}\n`);
  }
}

/**
 * Stop autonomous mode
 */
async function stopAutonomousMode() {
  console.log(`\n${colors.cyan}Stopping Autonomous Mode${colors.reset}\n`);

  const userId = await prompt('User ID [default_user]: ') || 'default_user';

  try {
    await apiRequest('POST', '/stop', { userId });
    console.log(`\n${colors.green}✓ Autonomous mode stopped for ${userId}${colors.reset}\n`);
  } catch (error) {
    console.error(`\n${colors.red}✗ Error: ${error.message}${colors.reset}\n`);
  }
}

/**
 * Process recording
 */
async function processRecording() {
  console.log(`\n${colors.cyan}Process Recording${colors.reset}\n`);

  const userId = await prompt('User ID [default_user]: ') || 'default_user';
  const audioPath = await prompt('Audio file path: ');

  if (!audioPath) {
    console.log(`\n${colors.red}Audio file path required${colors.reset}\n`);
    return;
  }

  console.log(`\n${colors.yellow}Publish to platforms (comma-separated):${colors.reset}`);
  console.log('  Options: mastodon, blog, twitter, youtube, newsletter, podcast');
  const platformsInput = await prompt('[mastodon,blog]: ') || 'mastodon,blog';
  const platforms = platformsInput.split(',').map(p => p.trim());

  const githubRepo = await prompt('GitHub repo for issues (optional): ') || null;

  try {
    console.log(`\n${colors.dim}Processing recording... (this may take a few minutes)${colors.reset}\n`);

    const result = await apiRequest('POST', '/process', {
      userId,
      audioPath,
      platforms,
      githubRepo
    });

    console.log(`\n${colors.green}✓ Recording processed successfully!${colors.reset}`);
    console.log(`\n${colors.bright}Session ID:${colors.reset} ${result.session.sessionId}`);

    if (result.session.narrative) {
      console.log(`\n${colors.bright}Narrative:${colors.reset}`);
      console.log(`  Title: ${result.session.narrative.title}`);
      console.log(`  Themes: ${result.session.narrative.themes?.join(', ') || 'none'}`);
      console.log(`  Insights: ${result.session.narrative.insights || 0}`);
    }

    if (result.session.routing) {
      console.log(`\n${colors.bright}Routing:${colors.reset}`);
      console.log(`  Brand: ${result.session.routing.primaryBrand}`);
      console.log(`  Domain: ${result.session.routing.primaryDomain}`);
      console.log(`  Confidence: ${result.session.routing.confidence}%`);
    }

    if (result.session.published) {
      console.log(`\n${colors.bright}Published to:${colors.reset}`);
      for (const [platform, url] of Object.entries(result.session.published.urls || {})) {
        console.log(`  ${platform}: ${url}`);
      }
    }

    if (result.session.extracted) {
      console.log(`\n${colors.bright}Extracted:${colors.reset}`);
      console.log(`  Dev tasks: ${result.session.extracted.devTasks}`);
      console.log(`  Math concepts: ${result.session.extracted.mathConcepts}`);
      console.log(`  Product ideas: ${result.session.extracted.productIdeas}`);
      console.log(`  Research questions: ${result.session.extracted.researchQuestions}`);
    }

    console.log();
  } catch (error) {
    console.error(`\n${colors.red}✗ Error: ${error.message}${colors.reset}\n`);
  }
}

/**
 * View status
 */
async function viewStatus() {
  const userId = await prompt('User ID (leave blank for all): ') || null;

  try {
    const result = await apiRequest('GET', `/status${userId ? `?userId=${userId}` : ''}`);

    console.log(`\n${colors.bright}Voice Journal Status${colors.reset}\n`);

    if (userId) {
      console.log(`User: ${userId}`);
      console.log(`Status: ${result.status.status || 'inactive'}`);
      console.log(`Active sessions: ${result.status.activeSessions || 0}`);

      if (result.status.schedule) {
        console.log(`\n${colors.bright}Schedule:${colors.reset}`);
        console.log(`  Time: ${result.status.schedule.schedule}`);
        console.log(`  Timezone: ${result.status.schedule.timezone}`);
        console.log(`  Platforms: ${result.status.schedule.autoPub?.join(', ')}`);
      }
    } else {
      console.log(`Total schedules: ${result.status.totalSchedules || 0}`);
      console.log(`Active sessions: ${result.status.activeSessions || 0}`);

      if (result.status.schedules?.length > 0) {
        console.log(`\n${colors.bright}Active schedules:${colors.reset}`);
        for (const schedule of result.status.schedules) {
          console.log(`  ${schedule.userId}: ${schedule.schedule} (${schedule.status})`);
        }
      }
    }

    console.log();
  } catch (error) {
    console.error(`\n${colors.red}✗ Error: ${error.message}${colors.reset}\n`);
  }
}

/**
 * View session history
 */
async function viewHistory() {
  const userId = await prompt('User ID [default_user]: ') || 'default_user';
  const limit = await prompt('Number of sessions [10]: ') || '10';

  try {
    const result = await apiRequest('GET', `/sessions?userId=${userId}&limit=${limit}`);

    console.log(`\n${colors.bright}Session History${colors.reset}\n`);
    console.log(`Total sessions: ${result.total}`);

    if (result.sessions?.length > 0) {
      console.log();
      for (const session of result.sessions) {
        console.log(`${colors.cyan}${session.session_id}${colors.reset}`);
        console.log(`  Status: ${session.status}`);
        console.log(`  Brand: ${session.primary_brand || 'not routed'}`);
        console.log(`  Created: ${new Date(session.created_at).toLocaleString()}`);
        if (session.narrative_summary?.title) {
          console.log(`  Title: ${session.narrative_summary.title}`);
        }
        if (session.published_platforms?.length > 0) {
          console.log(`  Published: ${session.published_platforms.join(', ')}`);
        }
        console.log();
      }
    } else {
      console.log(`\n${colors.dim}No sessions found${colors.reset}\n`);
    }
  } catch (error) {
    console.error(`\n${colors.red}✗ Error: ${error.message}${colors.reset}\n`);
  }
}

/**
 * View analytics
 */
async function viewAnalytics() {
  const userId = await prompt('User ID [default_user]: ') || 'default_user';

  try {
    const result = await apiRequest('GET', `/analytics?userId=${userId}`);

    console.log(`\n${colors.bright}Voice Journal Analytics${colors.reset}\n`);

    const analytics = result.analytics;

    console.log(`${colors.green}🔥 Current streak: ${analytics.streak || 0} days${colors.reset}`);
    console.log();
    console.log(`Total sessions: ${analytics.total_sessions || 0}`);
    console.log(`Completed: ${analytics.completed_sessions || 0}`);
    console.log(`Days active: ${analytics.days_active || 0}`);
    console.log(`Brands used: ${analytics.brands_used || 0}`);

    if (analytics.brands?.length > 0) {
      console.log(`  (${analytics.brands.join(', ')})`);
    }

    console.log();
  } catch (error) {
    console.error(`\n${colors.red}✗ Error: ${error.message}${colors.reset}\n`);
  }
}

/**
 * Update schedule
 */
async function updateSchedule() {
  console.log(`\n${colors.cyan}Update Schedule${colors.reset}\n`);
  console.log(`${colors.dim}Leave fields blank to keep current values${colors.reset}\n`);

  const userId = await prompt('User ID [default_user]: ') || 'default_user';
  const schedule = await prompt('Daily time (HH:MM): ');
  const timezone = await prompt('Timezone: ');
  const platformsInput = await prompt('Platforms (comma-separated): ');
  const autoPub = platformsInput ? platformsInput.split(',').map(p => p.trim()) : undefined;

  try {
    await apiRequest('PUT', '/schedule', {
      userId,
      schedule: schedule || undefined,
      timezone: timezone || undefined,
      autoPub
    });

    console.log(`\n${colors.green}✓ Schedule updated${colors.reset}\n`);
  } catch (error) {
    console.error(`\n${colors.red}✗ Error: ${error.message}${colors.reset}\n`);
  }
}

/**
 * View platform status
 */
async function viewPlatforms() {
  try {
    const result = await apiRequest('GET', '/platforms');

    console.log(`\n${colors.bright}Platform Status${colors.reset}\n`);

    for (const [platform, status] of Object.entries(result.platforms)) {
      const enabled = status.enabled ? `${colors.green}✓` : `${colors.red}✗`;
      console.log(`${enabled} ${platform}${colors.reset} (${status.format})`);

      const caps = [];
      if (status.capabilities.images) caps.push('images');
      if (status.capabilities.threads) caps.push('threads');
      if (status.capabilities.audio) caps.push('audio');
      if (status.capabilities.video) caps.push('video');

      if (caps.length > 0) {
        console.log(`    ${colors.dim}${caps.join(', ')}${colors.reset}`);
      }

      if (status.maxLength) {
        console.log(`    ${colors.dim}max length: ${status.maxLength}${colors.reset}`);
      }
    }

    console.log();
  } catch (error) {
    console.error(`\n${colors.red}✗ Error: ${error.message}${colors.reset}\n`);
  }
}

/**
 * Main menu loop
 */
async function main() {
  printHeader();

  let running = true;

  while (running) {
    printMenu();

    const choice = await prompt(`${colors.bright}Enter choice [1-9]:${colors.reset} `);

    switch (choice) {
      case '1':
        await startAutonomousMode();
        break;
      case '2':
        await stopAutonomousMode();
        break;
      case '3':
        await processRecording();
        break;
      case '4':
        await viewStatus();
        break;
      case '5':
        await viewHistory();
        break;
      case '6':
        await viewAnalytics();
        break;
      case '7':
        await updateSchedule();
        break;
      case '8':
        await viewPlatforms();
        break;
      case '9':
        running = false;
        break;
      default:
        console.log(`\n${colors.red}Invalid choice${colors.reset}\n`);
    }
  }

  console.log(`\n${colors.cyan}Goodbye! Keep journaling! 📝${colors.reset}\n`);
  rl.close();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`\n${colors.red}Fatal error: ${error.message}${colors.reset}\n`);
    process.exit(1);
  });
}

module.exports = { main };
