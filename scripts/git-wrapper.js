#!/usr/bin/env node

/**
 * Git & Gists Wrapper
 * 
 * Quick git operations and GitHub Gists integration
 * Usage: npm run git:quick "message" or npm run git:backup
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const https = require('https');
const fs = require('fs').promises;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

async function gitQuick(message = 'Quick update') {
  console.log(colors.cyan + '🔧 Quick git commit+push...' + colors.reset);
  
  try {
    await execPromise('git add .');
    await execPromise(`git commit -m "${message}"`);
    await execPromise('git push');
    
    console.log(colors.green + '✓ Committed and pushed!' + colors.reset);
  } catch (error) {
    console.error(colors.red + '✗ Git operation failed:' + colors.reset, error.message);
  }
}

async function backupToGist(files = ['.env.example', 'package.json', 'router.js']) {
  console.log(colors.cyan + '💾 Backing up to GitHub Gist...' + colors.reset);
  
  const gistToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!gistToken) {
    console.error(colors.red + '✗ GITHUB_TOKEN not set in environment' + colors.reset);
    console.log(colors.yellow + 'Create token at: https://github.com/settings/tokens' + colors.reset);
    return;
  }
  
  const gistFiles = {};
  
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      gistFiles[file] = { content };
    } catch (error) {
      console.log(colors.yellow + `⚠ Skipping ${file}: ${error.message}` + colors.reset);
    }
  }
  
  const gistData = JSON.stringify({
    description: `CALOS Platform Backup - ${new Date().toISOString()}`,
    public: false,
    files: gistFiles
  });
  
  const options = {
    hostname: 'api.github.com',
    path: '/gists',
    method: 'POST',
    headers: {
      'Authorization': `token ${gistToken}`,
      'User-Agent': 'CALOS-Platform',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(gistData)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 201) {
          const gist = JSON.parse(data);
          console.log(colors.green + '✓ Backed up to gist!' + colors.reset);
          console.log(colors.cyan + gist.html_url + colors.reset);
          resolve(gist);
        } else {
          console.error(colors.red + '✗ Gist creation failed:' + colors.reset, data);
          reject(new Error(data));
        }
      });
    });
    
    req.on('error', reject);
    req.write(gistData);
    req.end();
  });
}

async function shareSnippet(file) {
  console.log(colors.cyan + `📤 Sharing ${file} as public gist...` + colors.reset);
  
  const gistToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!gistToken) {
    console.error(colors.red + '✗ GITHUB_TOKEN not set' + colors.reset);
    return;
  }
  
  const content = await fs.readFile(file, 'utf8');
  
  const gistData = JSON.stringify({
    description: `CALOS: ${file}`,
    public: true,
    files: {
      [file]: { content }
    }
  });
  
  const options = {
    hostname: 'api.github.com',
    path: '/gists',
    method: 'POST',
    headers: {
      'Authorization': `token ${gistToken}`,
      'User-Agent': 'CALOS-Platform',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(gistData)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 201) {
          const gist = JSON.parse(data);
          console.log(colors.green + '✓ Shared!' + colors.reset);
          console.log(colors.cyan + gist.html_url + colors.reset);
          resolve(gist);
        } else {
          reject(new Error(data));
        }
      });
    });
    
    req.on('error', reject);
    req.write(gistData);
    req.end();
  });
}

// CLI
const command = process.argv[2];
const arg = process.argv[3];

switch(command) {
  case 'quick':
    gitQuick(arg || 'Quick update');
    break;
  case 'backup':
    backupToGist();
    break;
  case 'share':
    if (!arg) {
      console.error(colors.red + 'Usage: npm run git:share <file>' + colors.reset);
      process.exit(1);
    }
    shareSnippet(arg);
    break;
  default:
    console.log('Git Wrapper Commands:');
    console.log('  npm run git:quick "message" - Quick commit + push');
    console.log('  npm run git:backup           - Backup configs to private gist');
    console.log('  npm run git:share <file>     - Share file as public gist');
}
