#!/usr/bin/env node

/**
 * Code Indexer CLI
 *
 * Usage:
 *   node bin/index-code.js github <owner/repo>
 *   node bin/index-code.js local <path>
 *   node bin/index-code.js search <query>
 *   node bin/index-code.js stats
 */

require('dotenv').config();
const { Pool } = require('pg');
const CodeIndexer = require('../lib/code-indexer');

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    showHelp();
    process.exit(1);
  }

  const indexer = new CodeIndexer(db);

  try {
    switch (command) {
      case 'github': {
        const repo = args[1];
        if (!repo) {
          console.error('❌ Please specify a GitHub repo (owner/repo)');
          process.exit(1);
        }

        console.log(`🔍 Indexing GitHub repo: ${repo}\n`);
        const result = await indexer.indexGitHubRepo(repo);

        console.log(`\n✅ Success!`);
        console.log(`   Repo: ${result.repo.name}`);
        console.log(`   Snippets: ${result.snippets.length}`);
        console.log(`   Language: ${result.repo.language}`);
        break;
      }

      case 'local': {
        const dirPath = args[1];
        const name = args[2];

        if (!dirPath) {
          console.error('❌ Please specify a directory path');
          process.exit(1);
        }

        console.log(`🔍 Indexing local directory: ${dirPath}\n`);
        const result = await indexer.indexLocalDirectory(dirPath, name);

        console.log(`\n✅ Success!`);
        console.log(`   Collection: ${result.repo.name}`);
        console.log(`   Snippets: ${result.snippets.length}`);
        break;
      }

      case 'search': {
        const query = args.slice(1).join(' ');
        if (!query) {
          console.error('❌ Please specify a search query');
          process.exit(1);
        }

        console.log(`🔍 Searching for: "${query}"\n`);
        const results = await indexer.searchCode(query, { limit: 5 });

        if (results.length === 0) {
          console.log('No results found.');
        } else {
          results.forEach((result, i) => {
            console.log(`${i + 1}. ${result.filename} - ${result.function_name || 'script'}`);
            console.log(`   Language: ${result.language}`);
            console.log(`   Repo: ${result.repo_name}`);
            console.log(`   ${result.description || 'No description'}`);
            console.log('');
          });
        }
        break;
      }

      case 'stats': {
        console.log('📊 Repository Statistics\n');
        const stats = await indexer.getStats();

        if (stats.length === 0) {
          console.log('No repositories indexed yet.');
          console.log('\nIndex your first repo:');
          console.log('  node bin/index-code.js github anthropics/anthropic-sdk-python');
        } else {
          stats.forEach(stat => {
            console.log(`📦 ${stat.name}`);
            console.log(`   Source: ${stat.source}`);
            console.log(`   Language: ${stat.language}`);
            console.log(`   Snippets: ${stat.total_snippets}`);
            console.log(`   Uses: ${stat.total_uses || 0}`);
            console.log(`   Last indexed: ${stat.last_indexed || 'never'}`);
            console.log('');
          });
        }
        break;
      }

      case 'cookbook': {
        // Auto-detect cookbook locations
        const cookbookPaths = [
          process.env.HOME + '/Desktop/cookbook',
          process.env.HOME + '/cookbook',
          process.env.HOME + '/scripts',
          process.env.HOME + '/Desktop/scripts'
        ];

        console.log('🔍 Looking for cookbook directories...\n');

        for (const cookbookPath of cookbookPaths) {
          const fs = require('fs');
          if (fs.existsSync(cookbookPath)) {
            console.log(`Found: ${cookbookPath}`);
            const result = await indexer.indexLocalDirectory(cookbookPath, 'cookbook');

            console.log(`✅ Indexed ${result.snippets.length} snippets from cookbook\n`);
          }
        }
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }

    await db.end();
    process.exit(0);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    console.error(error.stack);
    await db.end();
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
📚 CalOS Code Indexer

Index your GitHub repos, cookbook, and scripts so calos-expert
can use YOUR ACTUAL CODE instead of giving canned responses.

Usage:
  node bin/index-code.js <command> [args]

Commands:
  github <owner/repo>        Index a GitHub repository
  local <path> [name]        Index a local directory
  cookbook                   Auto-detect and index cookbook
  search <query>             Search indexed code
  stats                      Show indexing statistics

Examples:
  # Index your GitHub repos
  node bin/index-code.js github yourusername/my-scripts
  node bin/index-code.js github anthropics/anthropic-sdk-python

  # Index local directories
  node bin/index-code.js local ~/Desktop/cookbook
  node bin/index-code.js local ~/scripts "My Scripts"

  # Auto-index cookbook
  node bin/index-code.js cookbook

  # Search your code
  node bin/index-code.js search "webhook automation"
  node bin/index-code.js search "API client"

  # View statistics
  node bin/index-code.js stats

Prerequisites:
  - PostgreSQL database (run migration 010_add_code_index.sql)
  - GitHub CLI (for GitHub repos): brew install gh && gh auth login

Once indexed, calos-expert will automatically use your real code examples!
  `.trim());
}

main();
