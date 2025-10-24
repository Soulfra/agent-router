/**
 * Cal Conversation Learner
 *
 * Extracts tasks and intent from conversations, allowing Cal to execute
 * autonomously without explicit instructions.
 *
 * Features:
 * - Parse natural language for tasks
 * - Extract tools/files needed
 * - Determine priority
 * - Execute tasks autonomously
 * - Learn from execution results
 *
 * Example:
 * User: "we need to teach cal to figure out this remote for you"
 * Cal extracts:
 * - Intent: Fix git remote configuration
 * - Tools: git, bash
 * - Files: scripts/check-cli-status.sh
 * - Priority: high
 * Then executes without being asked.
 */

const OpenAI = require('openai');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class CalConversationLearner {
  constructor(options = {}) {
    this.openai = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY
    });

    this.conversationLog = options.conversationLog || './data/cal-conversation-log.json';
    this.taskHistory = options.taskHistory || './data/cal-task-history.json';
    this.lastProcessedIndex = 0;
    this.tasks = [];
    this.executedTasks = [];

    // Cal's understanding of tools and their capabilities
    this.toolMap = {
      git: {
        capabilities: ['remote', 'commit', 'push', 'status', 'config', 'branch'],
        files: ['scripts/check-cli-status.sh', 'CAL_CHECKLIST.md']
      },
      npm: {
        capabilities: ['install', 'start', 'test', 'run'],
        files: ['package.json']
      },
      bash: {
        capabilities: ['grep', 'find', 'sed', 'awk', 'curl'],
        files: []
      },
      database: {
        capabilities: ['migrate', 'query', 'backup'],
        files: ['database/migrations/*.sql']
      },
      deploy: {
        capabilities: ['railway', 'render', 'vercel', 'github-pages'],
        files: ['railway.json', 'deployment/render.yaml', 'vercel.json']
      }
    };

    console.log('[CalConversationLearner] Initialized');
  }

  /**
   * Extract tasks from conversation messages
   */
  async extractTasks(messages) {
    if (!messages || messages.length === 0) {
      return [];
    }

    const prompt = `You are Cal, an autonomous AI assistant. Analyze this conversation and extract actionable tasks.

Conversation:
${messages.map((m, i) => `[${i}] ${m.role}: ${m.content}`).join('\n')}

Extract tasks in JSON format:
{
  "tasks": [
    {
      "intent": "Brief description of what needs to be done",
      "tools": ["tool1", "tool2"],
      "files": ["file1.js", "file2.md"],
      "commands": ["command to run"],
      "priority": "high|medium|low",
      "reason": "Why this task is needed",
      "context": "Relevant context from conversation"
    }
  ]
}

Available tools: ${Object.keys(this.toolMap).join(', ')}

Focus on:
- Git operations (remote, commit, push, config)
- Script execution
- File creation/modification
- System configuration
- Deployment tasks
- OAuth/login setup
- Domain management

Only extract tasks that can be executed autonomously.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a task extraction system. Return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3
      });

      const content = response.choices[0].message.content;

      // Try to parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[CalConversationLearner] No JSON found in response');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.tasks || [];

    } catch (error) {
      console.error('[CalConversationLearner] Error extracting tasks:', error);
      return [];
    }
  }

  /**
   * Execute a task autonomously
   */
  async executeTask(task) {
    console.log(`[CalConversationLearner] Executing: ${task.intent}`);

    const result = {
      task: task.intent,
      startTime: new Date().toISOString(),
      success: false,
      output: '',
      error: null
    };

    try {
      // Execute commands
      for (const command of task.commands || []) {
        console.log(`[CalConversationLearner] Running: ${command}`);

        const { stdout, stderr } = await execAsync(command, {
          cwd: process.cwd(),
          timeout: 60000 // 1 minute timeout
        });

        result.output += stdout;
        if (stderr) {
          result.output += '\nSTDERR:\n' + stderr;
        }
      }

      // Create/modify files if needed
      for (const file of task.files || []) {
        if (file.content) {
          console.log(`[CalConversationLearner] Creating: ${file.path}`);
          await fs.writeFile(file.path, file.content, 'utf8');
          result.output += `\nCreated: ${file.path}`;
        }
      }

      result.success = true;
      result.endTime = new Date().toISOString();

      // Save to task history
      this.executedTasks.push(result);
      await this.saveTaskHistory();

      console.log(`[CalConversationLearner] ✓ Task completed: ${task.intent}`);

      return result;

    } catch (error) {
      result.error = error.message;
      result.endTime = new Date().toISOString();

      console.error(`[CalConversationLearner] ✗ Task failed: ${task.intent}`, error);

      // Save failure for learning
      this.executedTasks.push(result);
      await this.saveTaskHistory();

      return result;
    }
  }

  /**
   * Analyze conversation and execute tasks
   */
  async processConversation(messages) {
    console.log(`[CalConversationLearner] Processing ${messages.length} messages`);

    // Extract tasks
    const tasks = await this.extractTasks(messages);

    if (tasks.length === 0) {
      console.log('[CalConversationLearner] No actionable tasks found');
      return { tasks: [], executed: [] };
    }

    console.log(`[CalConversationLearner] Found ${tasks.length} tasks`);

    // Execute high-priority tasks immediately
    const results = [];
    for (const task of tasks) {
      if (task.priority === 'high') {
        const result = await this.executeTask(task);
        results.push(result);
      } else {
        // Queue lower priority tasks
        this.tasks.push(task);
      }
    }

    return {
      tasks,
      executed: results
    };
  }

  /**
   * Monitor conversation log file for new messages
   */
  async monitorConversations() {
    try {
      // Load conversation log
      const logPath = path.resolve(this.conversationLog);

      // Create if doesn't exist
      try {
        await fs.access(logPath);
      } catch {
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        await fs.writeFile(logPath, JSON.stringify({ messages: [] }), 'utf8');
      }

      const data = await fs.readFile(logPath, 'utf8');
      const log = JSON.parse(data);

      // Get new messages since last check
      const newMessages = log.messages.slice(this.lastProcessedIndex);

      if (newMessages.length > 0) {
        console.log(`[CalConversationLearner] Processing ${newMessages.length} new messages`);

        const result = await this.processConversation(newMessages);

        this.lastProcessedIndex = log.messages.length;

        return result;
      }

      return { tasks: [], executed: [] };

    } catch (error) {
      console.error('[CalConversationLearner] Error monitoring conversations:', error);
      return { tasks: [], executed: [] };
    }
  }

  /**
   * Add message to conversation log
   */
  async logConversation(role, content) {
    try {
      const logPath = path.resolve(this.conversationLog);

      let log = { messages: [] };
      try {
        const data = await fs.readFile(logPath, 'utf8');
        log = JSON.parse(data);
      } catch {
        // New log file
      }

      log.messages.push({
        role,
        content,
        timestamp: new Date().toISOString()
      });

      await fs.writeFile(logPath, JSON.stringify(log, null, 2), 'utf8');

    } catch (error) {
      console.error('[CalConversationLearner] Error logging conversation:', error);
    }
  }

  /**
   * Save task history
   */
  async saveTaskHistory() {
    try {
      const historyPath = path.resolve(this.taskHistory);
      await fs.mkdir(path.dirname(historyPath), { recursive: true });
      await fs.writeFile(
        historyPath,
        JSON.stringify({
          tasks: this.executedTasks,
          lastUpdated: new Date().toISOString()
        }, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('[CalConversationLearner] Error saving task history:', error);
    }
  }

  /**
   * Get learning statistics
   */
  getStats() {
    const successCount = this.executedTasks.filter(t => t.success).length;
    const failureCount = this.executedTasks.filter(t => !t.success).length;

    return {
      totalTasks: this.executedTasks.length,
      successful: successCount,
      failed: failureCount,
      successRate: this.executedTasks.length > 0
        ? (successCount / this.executedTasks.length * 100).toFixed(1) + '%'
        : '0%',
      queuedTasks: this.tasks.length,
      lastExecuted: this.executedTasks.length > 0
        ? this.executedTasks[this.executedTasks.length - 1].endTime
        : null
    };
  }
}

module.exports = CalConversationLearner;
