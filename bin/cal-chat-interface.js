#!/usr/bin/env node
/**
 * Cal Chat Interface - Natural Language Task Execution
 *
 * User says: "Cal, deploy lessons to calriven.com"
 * Cal extracts task → breaks down with CalTaskDelegator → executes → logs result
 *
 * Usage:
 *   npm run cal:chat
 *   > Cal, deploy lessons to GitHub Pages
 *   > Cal, run E2E tests on lessons.calriven.com
 *   > Cal, publish to Gist
 */

const readline = require('readline');
const CalConversationLearner = require('../lib/cal-conversation-learner');
const CalTaskDelegator = require('../lib/cal-task-delegator');
const DeploymentOrchestrator = require('../lib/deployment-orchestrator');
const E2ETestRunner = require('../lib/e2e-test-runner');

class CalChatInterface {
  constructor() {
    this.conversationLearner = new CalConversationLearner({
      conversationLog: './data/cal-chat-log.json',
      taskHistory: './data/cal-task-history.json'
    });

    this.taskDelegator = new CalTaskDelegator({
      verbose: true
    });

    this.deployer = new DeploymentOrchestrator({
      github: {
        repo: process.env.GITHUB_REPO || 'Soulfra/agent-router',
        token: process.env.GITHUB_TOKEN,
        branch: 'main'
      }
    });

    this.conversationHistory = [];
  }

  async start() {
    console.log('\n🤖 Cal Chat Interface - Autonomous Task Execution\n');
    console.log('Examples:');
    console.log('  "Cal, deploy lessons to GitHub Pages"');
    console.log('  "Cal, run E2E tests on lessons.calriven.com"');
    console.log('  "Cal, publish to Gist"');
    console.log('  "Cal, show deployment status"\n');
    console.log('Type "exit" or "quit" to end the session.\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'You: '
    });

    rl.prompt();

    rl.on('line', async (input) => {
      const message = input.trim();

      if (!message) {
        rl.prompt();
        return;
      }

      if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
        console.log('\n👋 Goodbye!\n');
        rl.close();
        process.exit(0);
      }

      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: message
      });

      // Log conversation
      await this.conversationLearner.logConversation('user', message);

      // Process message
      await this.processMessage(message);

      rl.prompt();
    });

    rl.on('close', () => {
      console.log('\n👋 Cal signing off.\n');
      process.exit(0);
    });
  }

  async processMessage(message) {
    try {
      // Extract tasks from message
      const tasks = await this.conversationLearner.extractTasks([
        ...this.conversationHistory,
        { role: 'user', content: message }
      ]);

      if (tasks.length === 0) {
        console.log('\nCal: I didn\'t detect any actionable tasks. Can you be more specific?\n');
        return;
      }

      console.log(`\nCal: I found ${tasks.length} task(s) to execute:\n`);

      for (const task of tasks) {
        console.log(`  • ${task.intent} (${task.priority})\n`);

        // Check if this is a deployment task
        if (this.isDeploymentTask(task)) {
          await this.handleDeployment(task);
        }
        // Check if this is a testing task
        else if (this.isTestingTask(task)) {
          await this.handleTesting(task);
        }
        // Check if this is a status/info task
        else if (this.isStatusTask(task)) {
          await this.handleStatus(task);
        }
        // Generic task execution
        else {
          await this.handleGenericTask(task);
        }
      }

    } catch (error) {
      console.error('\nCal: ❌ Error processing message:', error.message, '\n');
      await this.conversationLearner.logConversation('system', `Error: ${error.message}`);
    }
  }

  isDeploymentTask(task) {
    const deployKeywords = ['deploy', 'publish', 'push', 'release', 'github pages', 'gitlab', 'gist'];
    return deployKeywords.some(kw => task.intent.toLowerCase().includes(kw));
  }

  isTestingTask(task) {
    const testKeywords = ['test', 'e2e', 'validate', 'check', 'verify'];
    return testKeywords.some(kw => task.intent.toLowerCase().includes(kw));
  }

  isStatusTask(task) {
    const statusKeywords = ['status', 'show', 'list', 'history', 'stats'];
    return statusKeywords.some(kw => task.intent.toLowerCase().includes(kw));
  }

  async handleDeployment(task) {
    console.log(`Cal: Starting deployment task...\n`);

    try {
      // Break down deployment task
      const plan = await this.taskDelegator.breakDown({
        description: task.intent,
        type: 'deployment',
        constraints: [],
        features: []
      });

      console.log(`Cal: Created ${plan.totalSteps}-step plan (${plan.estimatedComplexity} complexity)\n`);

      // Execute deployment
      const results = await this.deployer.deployAll({
        platforms: this.extractPlatforms(task.intent),
        source: 'public/lessons',
        message: `Deploy via Cal chat: ${task.intent}`
      });

      console.log(`Cal: ✅ Deployment complete!\n`);
      console.log('Results:');
      results.forEach(r => {
        console.log(`  ${r.success ? '✅' : '❌'} ${r.platform}: ${r.url || r.error}`);
      });
      console.log('');

      // Log result
      await this.conversationLearner.logConversation('assistant',
        `Deployed to ${results.length} platform(s). ${results.filter(r => r.success).length} succeeded.`
      );

    } catch (error) {
      console.error(`Cal: ❌ Deployment failed: ${error.message}\n`);
      await this.conversationLearner.logConversation('assistant', `Deployment failed: ${error.message}`);
    }
  }

  async handleTesting(task) {
    console.log(`Cal: Starting E2E tests...\n`);

    try {
      // Extract domain from task
      const domain = this.extractDomain(task.intent) || 'lessons.calriven.com';

      const runner = new E2ETestRunner({ domain });
      const results = await runner.runAllTests();

      if (results.success) {
        console.log(`Cal: ✅ All tests passed!\n`);
      } else {
        console.log(`Cal: ⚠️  Some tests failed. Check test-results/test-results.json\n`);
      }

      await this.conversationLearner.logConversation('assistant',
        `E2E tests ${results.success ? 'passed' : 'failed'} for ${domain}`
      );

    } catch (error) {
      console.error(`Cal: ❌ Testing failed: ${error.message}\n`);
      await this.conversationLearner.logConversation('assistant', `Testing failed: ${error.message}`);
    }
  }

  async handleStatus(task) {
    console.log(`Cal: Fetching status...\n`);

    try {
      const stats = this.conversationLearner.getStats();

      console.log('Task History:');
      console.log(`  Total tasks executed: ${stats.totalTasks}`);
      console.log(`  Successful: ${stats.successful}`);
      console.log(`  Failed: ${stats.failed}`);
      console.log(`  Success rate: ${stats.successRate}`);
      console.log(`  Queued tasks: ${stats.queuedTasks}`);
      if (stats.lastExecuted) {
        console.log(`  Last executed: ${stats.lastExecuted}`);
      }
      console.log('');

      await this.conversationLearner.logConversation('assistant', 'Displayed task statistics');

    } catch (error) {
      console.error(`Cal: ❌ Status check failed: ${error.message}\n`);
    }
  }

  async handleGenericTask(task) {
    console.log(`Cal: Executing generic task...\n`);

    try {
      // Use CalConversationLearner to execute
      const result = await this.conversationLearner.executeTask(task);

      if (result.success) {
        console.log(`Cal: ✅ Task completed successfully!\n`);
        if (result.output) {
          console.log('Output:');
          console.log(result.output);
          console.log('');
        }
      } else {
        console.log(`Cal: ❌ Task failed: ${result.error}\n`);
      }

      await this.conversationLearner.logConversation('assistant',
        result.success ? 'Task completed' : `Task failed: ${result.error}`
      );

    } catch (error) {
      console.error(`Cal: ❌ Execution failed: ${error.message}\n`);
    }
  }

  extractPlatforms(intent) {
    const platforms = [];

    if (intent.toLowerCase().includes('github')) platforms.push('github');
    if (intent.toLowerCase().includes('gitlab')) platforms.push('gitlab');
    if (intent.toLowerCase().includes('gist')) platforms.push('gist');
    if (intent.toLowerCase().includes('docker')) platforms.push('docker');
    if (intent.toLowerCase().includes('apache')) platforms.push('apache');

    // Default to GitHub if none specified
    return platforms.length > 0 ? platforms : ['github'];
  }

  extractDomain(intent) {
    // Look for domain patterns
    const domainMatch = intent.match(/([a-z0-9-]+\.)+[a-z]{2,}/i);
    return domainMatch ? domainMatch[0] : null;
  }
}

// Start the interface
if (require.main === module) {
  const chat = new CalChatInterface();
  chat.start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = CalChatInterface;
