/**
 * Chat + File Explorer Bridge
 *
 * Connects SoulFra OS chat interface with:
 * - File Explorer (browse/edit Desktop/repos)
 * - CALOS Domain Platform (manage 250+ domains)
 * - Auto-deployment on file changes
 *
 * Enables natural language commands like:
 * - "show me the soulfra repo"
 * - "edit index.html and deploy to soulfra.com"
 * - "list all domains and their temperatures"
 * - "create DNS template for calriven.com"
 *
 * Architecture:
 * [SoulFra OS Chat] ← WebSocket ← [This Bridge] → [File Explorer API]
 *                                        ↓
 *                                 [CALOS Domain Platform]
 *                                        ↓
 *                                 [GoDaddy + GitHub]
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const WebSocket = require('ws');

class ChatFileExplorerBridge extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.fileExplorerUrl = options.fileExplorerUrl || 'http://localhost:3000';
    this.chatServerUrl = options.chatServerUrl || 'http://localhost:5001';
    this.domainPlatform = options.domainPlatform; // CALOSDomainPlatform instance

    // State
    this.currentDirectory = options.rootPath || process.env.HOME + '/Desktop';
    this.openFiles = new Map(); // path → { content, modified, autoSave }
    this.watchedPaths = new Set();

    // WebSocket connections
    this.chatSocket = null;
    this.fileExplorerSocket = null;

    // Command registry
    this.commands = this.registerCommands();

    console.log(chalk.cyan.bold('\n🌉 Chat + File Explorer Bridge\n'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.white(`  File Explorer: ${this.fileExplorerUrl}`));
    console.log(chalk.white(`  Chat Server: ${this.chatServerUrl}`));
    console.log(chalk.white(`  Current Dir: ${this.currentDirectory}`));
    console.log(chalk.gray('─'.repeat(80) + '\n'));
  }

  /**
   * Initialize bridge - connect to chat and file explorer
   */
  async initialize() {
    console.log(chalk.yellow('📋 Initializing Bridge\n'));

    try {
      // Connect to file explorer API
      const fileExplorerStatus = await axios.get(`${this.fileExplorerUrl}/api/health`);
      console.log(chalk.green(`   ✅ File Explorer connected (${fileExplorerStatus.data.status})`));
    } catch (error) {
      console.warn(chalk.yellow(`   ⚠️  File Explorer not available: ${error.message}`));
      console.log(chalk.gray('      Start with: cd ~/Desktop/file-explorer && node bin/file-explorer.js ~/Desktop'));
    }

    // Connect to chat server
    try {
      const chatStatus = await axios.get(`${this.chatServerUrl}/api/health`);
      console.log(chalk.green(`   ✅ Chat server connected (${chatStatus.data.status})`));
    } catch (error) {
      console.warn(chalk.yellow(`   ⚠️  Chat server not available: ${error.message}`));
      console.log(chalk.gray('      Start with: npm start'));
    }

    // Initialize WebSocket connections
    await this.initWebSockets();

    console.log(chalk.gray('─'.repeat(80) + '\n'));

    return {
      success: true,
      fileExplorer: true,
      chatServer: true
    };
  }

  /**
   * Initialize WebSocket connections
   */
  async initWebSockets() {
    // Chat WebSocket (receive commands from SoulFra OS)
    try {
      this.chatSocket = new WebSocket(`${this.chatServerUrl.replace('http', 'ws')}/ws/chat`);

      this.chatSocket.on('open', () => {
        console.log(chalk.green('   ✅ Chat WebSocket connected'));
      });

      this.chatSocket.on('message', async (data) => {
        const message = JSON.parse(data);
        await this.handleChatMessage(message);
      });

      this.chatSocket.on('error', (error) => {
        console.error(chalk.red(`   ❌ Chat WebSocket error: ${error.message}`));
      });
    } catch (error) {
      console.warn(chalk.yellow(`   ⚠️  Chat WebSocket not available: ${error.message}`));
    }

    // File Explorer WebSocket (watch for file changes)
    try {
      this.fileExplorerSocket = new WebSocket(`${this.fileExplorerUrl.replace('http', 'ws')}/ws/files`);

      this.fileExplorerSocket.on('open', () => {
        console.log(chalk.green('   ✅ File Explorer WebSocket connected'));
      });

      this.fileExplorerSocket.on('message', async (data) => {
        const message = JSON.parse(data);
        await this.handleFileChange(message);
      });
    } catch (error) {
      console.warn(chalk.yellow(`   ⚠️  File Explorer WebSocket not available: ${error.message}`));
    }
  }

  /**
   * Handle chat message from SoulFra OS
   */
  async handleChatMessage(message) {
    const { type, content, userId } = message;

    console.log(chalk.cyan(`\n💬 Chat Message: ${content}`));

    // Parse natural language command
    const command = this.parseCommand(content);

    if (!command) {
      this.sendChatResponse({
        type: 'text',
        content: 'I didn\'t understand that command. Try "help" to see what I can do.'
      });
      return;
    }

    // Execute command
    try {
      const result = await this.executeCommand(command, userId);
      this.sendChatResponse(result);
    } catch (error) {
      console.error(chalk.red(`   ❌ Command failed: ${error.message}`));
      this.sendChatResponse({
        type: 'error',
        content: error.message
      });
    }
  }

  /**
   * Parse natural language command
   */
  parseCommand(input) {
    const normalized = input.toLowerCase().trim();

    // File browser commands
    if (normalized.match(/^(ls|list|show|browse)/)) {
      return { action: 'list', path: this.currentDirectory };
    }

    if (normalized.match(/^cd (.+)/)) {
      const [, path] = normalized.match(/^cd (.+)/);
      return { action: 'cd', path };
    }

    if (normalized.match(/^(cat|read|show|open) (.+)/)) {
      const [, , filepath] = normalized.match(/^(cat|read|show|open) (.+)/);
      return { action: 'read', filepath };
    }

    if (normalized.match(/^edit (.+)/)) {
      const [, filepath] = normalized.match(/^edit (.+)/);
      return { action: 'edit', filepath };
    }

    if (normalized.match(/^save/)) {
      return { action: 'save' };
    }

    // Domain platform commands
    if (normalized.match(/^(list|show) (domains|brands)/)) {
      return { action: 'listDomains' };
    }

    if (normalized.match(/^(setup|deploy) (.+\.com)/)) {
      const [, , domain] = normalized.match(/^(setup|deploy) (.+\.com)/);
      return { action: 'setupDomain', domain };
    }

    if (normalized.match(/^(temperature|temp|rating) (.+\.com)/)) {
      const [, , domain] = normalized.match(/^(temperature|temp|rating) (.+\.com)/);
      return { action: 'domainTemp', domain };
    }

    if (normalized.match(/^dns (.+\.com)/)) {
      const [, domain] = normalized.match(/^dns (.+\.com)/);
      return { action: 'dnsRecords', domain };
    }

    // Git commands
    if (normalized.match(/^git (.+)/)) {
      const [, gitCmd] = normalized.match(/^git (.+)/);
      return { action: 'git', command: gitCmd };
    }

    // Help
    if (normalized.match(/^help/)) {
      return { action: 'help' };
    }

    return null;
  }

  /**
   * Execute parsed command
   */
  async executeCommand(command, userId) {
    const handler = this.commands[command.action];

    if (!handler) {
      throw new Error(`Unknown action: ${command.action}`);
    }

    return await handler.call(this, command, userId);
  }

  /**
   * Register command handlers
   */
  registerCommands() {
    return {
      // File browser commands
      list: async (cmd) => {
        const response = await axios.get(`${this.fileExplorerUrl}/api/files`, {
          params: { path: cmd.path }
        });

        const files = response.data.files || [];

        return {
          type: 'file-list',
          content: this.formatFileList(files),
          data: files
        };
      },

      cd: async (cmd) => {
        const newPath = path.resolve(this.currentDirectory, cmd.path);

        // Verify path exists
        const response = await axios.get(`${this.fileExplorerUrl}/api/files`, {
          params: { path: newPath }
        });

        this.currentDirectory = newPath;

        return {
          type: 'text',
          content: `Changed directory to ${newPath}`
        };
      },

      read: async (cmd) => {
        const filepath = path.resolve(this.currentDirectory, cmd.filepath);

        const response = await axios.get(`${this.fileExplorerUrl}/api/file`, {
          params: { path: filepath }
        });

        return {
          type: 'file-content',
          content: response.data.content,
          filepath,
          metadata: {
            size: response.data.size,
            modified: response.data.modified
          }
        };
      },

      edit: async (cmd) => {
        const filepath = path.resolve(this.currentDirectory, cmd.filepath);

        // Open file for editing
        const response = await axios.get(`${this.fileExplorerUrl}/api/file`, {
          params: { path: filepath }
        });

        this.openFiles.set(filepath, {
          content: response.data.content,
          modified: false,
          autoSave: true
        });

        return {
          type: 'file-editor',
          content: response.data.content,
          filepath,
          instructions: 'File opened for editing. Type your changes and say "save" when done.'
        };
      },

      save: async (cmd) => {
        // Save all open files
        const saved = [];

        for (const [filepath, file] of this.openFiles) {
          if (file.modified) {
            await axios.post(`${this.fileExplorerUrl}/api/file`, {
              path: filepath,
              content: file.content
            });

            saved.push(filepath);
            file.modified = false;
          }
        }

        return {
          type: 'text',
          content: `Saved ${saved.length} file(s): ${saved.join(', ')}`
        };
      },

      // Domain platform commands
      listDomains: async () => {
        if (!this.domainPlatform) {
          throw new Error('Domain platform not initialized');
        }

        const dashboard = await this.domainPlatform.getDashboard();

        return {
          type: 'domain-dashboard',
          content: this.formatDomainDashboard(dashboard),
          data: dashboard
        };
      },

      setupDomain: async (cmd) => {
        if (!this.domainPlatform) {
          throw new Error('Domain platform not initialized');
        }

        const result = await this.domainPlatform.setupBrand(cmd.domain);

        return {
          type: 'domain-setup',
          content: `✅ Setup complete for ${cmd.domain}`,
          data: result
        };
      },

      domainTemp: async (cmd) => {
        if (!this.domainPlatform) {
          throw new Error('Domain platform not initialized');
        }

        const dashboard = await this.domainPlatform.getDashboard();
        const temp = dashboard.temperatures.find(t => t.domain === cmd.domain);

        if (!temp) {
          throw new Error(`Domain not found: ${cmd.domain}`);
        }

        return {
          type: 'domain-temperature',
          content: `${cmd.domain}: ${temp.score}/100 (${temp.rating})`,
          data: temp
        };
      },

      dnsRecords: async (cmd) => {
        if (!this.domainPlatform || !this.domainPlatform.godaddy) {
          throw new Error('GoDaddy API not initialized');
        }

        const records = await this.domainPlatform.godaddy.getDNSRecords(cmd.domain);

        return {
          type: 'dns-records',
          content: this.formatDNSRecords(cmd.domain, records),
          data: records
        };
      },

      // Git commands
      git: async (cmd) => {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        const { stdout, stderr } = await execAsync(`git ${cmd.command}`, {
          cwd: this.currentDirectory
        });

        return {
          type: 'git-output',
          content: stdout || stderr,
          command: cmd.command
        };
      },

      // Help
      help: async () => {
        return {
          type: 'help',
          content: this.formatHelp()
        };
      }
    };
  }

  /**
   * Handle file change from file explorer
   */
  async handleFileChange(message) {
    const { type, path: filepath, content } = message;

    console.log(chalk.magenta(`\n📝 File Changed: ${filepath}`));

    // Update open file if it's being edited
    if (this.openFiles.has(filepath)) {
      const file = this.openFiles.get(filepath);
      file.content = content;
      file.modified = true;

      // Auto-save if enabled
      if (file.autoSave) {
        console.log(chalk.green(`   ✅ Auto-saving ${filepath}`));
        await this.executeCommand({ action: 'save' });
      }
    }

    // Emit event for auto-deployment
    this.emit('fileChange', { filepath, content, type });
  }

  /**
   * Send response to chat
   */
  sendChatResponse(response) {
    if (this.chatSocket && this.chatSocket.readyState === WebSocket.OPEN) {
      this.chatSocket.send(JSON.stringify(response));
    } else {
      console.log(chalk.yellow('   ⚠️  Chat socket not connected, response:'));
      console.log(response);
    }
  }

  /**
   * Format file list for chat display
   */
  formatFileList(files) {
    let output = `📂 ${this.currentDirectory}\n\n`;

    files.forEach(file => {
      const icon = file.type === 'directory' ? '📁' : '📄';
      const size = file.size ? ` (${this.formatBytes(file.size)})` : '';
      output += `${icon} ${file.name}${size}\n`;
    });

    return output;
  }

  /**
   * Format domain dashboard for chat display
   */
  formatDomainDashboard(dashboard) {
    let output = `🌐 CALOS Domain Platform Dashboard\n\n`;
    output += `Brands: ${dashboard.brands}\n`;
    output += `Deployed: ${dashboard.deployed}\n`;
    output += `Planned: ${dashboard.planned}\n\n`;
    output += `🌡️  Temperature Rankings:\n\n`;

    dashboard.temperatures.slice(0, 10).forEach((temp, i) => {
      output += `${i + 1}. ${temp.domain} - ${temp.score}/100 ${temp.rating}\n`;
    });

    if (dashboard.temperatures.length > 10) {
      output += `... and ${dashboard.temperatures.length - 10} more\n`;
    }

    return output;
  }

  /**
   * Format DNS records for chat display
   */
  formatDNSRecords(domain, records) {
    let output = `🌍 DNS Records for ${domain}\n\n`;

    const types = ['A', 'CNAME', 'MX', 'TXT', 'NS'];

    types.forEach(type => {
      const typeRecords = records.filter(r => r.type === type);
      if (typeRecords.length > 0) {
        output += `${type} Records:\n`;
        typeRecords.forEach(r => {
          output += `  ${r.name || '@'} → ${r.data} (TTL: ${r.ttl})\n`;
        });
        output += '\n';
      }
    });

    return output;
  }

  /**
   * Format help text
   */
  formatHelp() {
    return `🌉 Chat + File Explorer Bridge Commands

📂 File Browser:
  ls, list, show          - List files in current directory
  cd <path>               - Change directory
  cat, read, open <file>  - Read file contents
  edit <file>             - Edit file (auto-save enabled)
  save                    - Save all open files

🌐 Domain Platform:
  list domains            - Show all domains and temperatures
  setup <domain.com>      - Setup brand infrastructure
  temperature <domain.com> - Show domain temperature rating
  dns <domain.com>        - Show DNS records

🔧 Git:
  git <command>           - Execute git command in current directory

❓ Help:
  help                    - Show this help message

Examples:
  "show me the Desktop"
  "cd repos/soulfra"
  "edit index.html"
  "list domains"
  "setup calriven.com"
  "temperature soulfra.com"
  "dns deathtodata.com"
  "git status"
`;
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Watch path for changes (auto-deploy on save)
   */
  watchPath(filepath, callback) {
    this.watchedPaths.add(filepath);

    this.on('fileChange', (event) => {
      if (event.filepath === filepath) {
        callback(event);
      }
    });
  }

  /**
   * Auto-deploy on file change
   */
  async enableAutoDeployment(domain, watchPaths = []) {
    console.log(chalk.cyan(`\n🚀 Auto-deployment enabled for ${domain}\n`));

    watchPaths.forEach(filepath => {
      this.watchPath(filepath, async (event) => {
        console.log(chalk.yellow(`   📝 File changed: ${event.filepath}`));
        console.log(chalk.yellow(`   🚀 Deploying to ${domain}...`));

        try {
          // Use CalMultiDomainDeploy to deploy changes
          const { CalMultiDomainDeploy } = require('../bin/cal-multi-domain-deploy');
          const deployer = new CalMultiDomainDeploy({
            domains: [domain],
            silent: true
          });

          await deployer.execute();

          console.log(chalk.green(`   ✅ Deployed to ${domain}`));

          this.sendChatResponse({
            type: 'deployment-success',
            content: `✅ Auto-deployed ${event.filepath} to ${domain}`
          });

        } catch (error) {
          console.error(chalk.red(`   ❌ Deployment failed: ${error.message}`));

          this.sendChatResponse({
            type: 'deployment-error',
            content: `❌ Auto-deployment failed: ${error.message}`
          });
        }
      });
    });

    return {
      domain,
      watchPaths,
      autoDeployEnabled: true
    };
  }
}

module.exports = ChatFileExplorerBridge;
