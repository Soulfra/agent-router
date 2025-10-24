require('dotenv').config();
const OpenAI = require('openai');
const axios = require('axios');
const DataSource = require('../sources/data-source');
const OllamaTools = require('../lib/ollama-tools');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize DataSource (supports both API and local database mode)
let dataSource = null;

/**
 * Initialize data source with database connection
 * @param {object} db - Database connection (optional, for local mode)
 * @param {object} vaultBridge - VaultBridge instance (optional, for contextual key retrieval)
 */
function initDataSource(db = null, vaultBridge = null) {
  dataSource = new DataSource({
    mode: 'api', // Default to API mode
    db: db,
    vaultBridge: vaultBridge, // For contextual API key retrieval
    caching: true // Enable caching by default
  });
}

// Initialize with default API mode
initDataSource();

/**
 * Run an AI agent with the given input and context
 * @param {string} agent - Agent name: 'gpt4', '@gpt-3.5', '@claude', '@ollama', etc.
 * @param {string} input - User input/prompt
 * @param {object} context - Additional context (files, history, etc.)
 * @returns {Promise<string>} - Agent response
 */
async function runAgent(agent, input, context = {}) {
  try {
    // Normalize agent ID (remove @ if present)
    const agentId = agent.startsWith('@') ? agent.substring(1) : agent;

    // Handle Ollama variants (@ollama, @ollama:codellama, @ollama:codellama:7b, etc.)
    if (agentId.startsWith('ollama')) {
      // Extract model name after 'ollama:' prefix
      // @ollama → mistral (default)
      // @ollama:mistral → mistral
      // @ollama:codellama:7b → codellama:7b
      const modelPart = agentId.substring('ollama'.length);
      const model = modelPart.startsWith(':') ? modelPart.substring(1) : 'mistral';
      return await runOllama(model || 'mistral', input, context);
    }

    switch (agentId) {
      case 'gpt4':
      case 'gpt-4':
        return await runOpenAI('gpt-4', input, context);

      case 'gpt-3.5':
      case 'gpt3.5':
        return await runOpenAI('gpt-3.5-turbo', input, context);

      case 'claude':
      case 'claude-3':
        return await runClaude(input, context);

      case 'deepseek':
        return await runDeepSeek(input, context);

      case 'filewatcher':
        return `Files in context: ${JSON.stringify(context.open_files || [])}`;

      case 'n8n-bridge':
        return '⚠️ n8n bridge not yet implemented. Coming soon!';

      case 'script-toolkit':
        return '⚠️ Script toolkit integration available via bridge on port 5002.';

      case 'browser':
      case 'puppeteer':
      case 'selenium':
        return await runBrowserAgent(input, context);

      case 'hn':
      case 'hackernews':
      case 'hacker-news':
        return await runHNAgent(input, context);

      case 'github':
      case 'gh':
        return await runGitHubAgent(input, context);

      case 'price':
      case 'price-agent':
        return await runPriceAgent(input, context);

      default:
        return `❌ Agent '${agent}' not recognized. Available: @gpt4, @gpt-3.5, @claude, @deepseek, @ollama, @browser, @hn, @github, @price`;
    }
  } catch (error) {
    console.error(`Error running agent ${agent}:`, error.message);
    return `❌ Error: ${error.message}`;
  }
}

/**
 * Run OpenAI models (GPT-4, GPT-3.5, etc.)
 */
async function runOpenAI(model, input, context) {
  const messages = [
    { role: 'system', content: 'You are Cal, a helpful AI assistant in the CalOS operating system.' }
  ];

  // Add context if provided
  if (context.history && Array.isArray(context.history)) {
    messages.push(...context.history);
  }

  messages.push({ role: 'user', content: input });

  // Use DataSource (handles both API and local mode)
  return await dataSource.fetchOpenAI(model, messages, {
    temperature: 0.7,
    max_tokens: 1000,
    context: context // Pass context for local mode detection
  });
}

/**
 * Run Claude (Anthropic)
 */
async function runClaude(input, context) {
  const messages = [];

  // Add conversation history if provided
  if (context.history && Array.isArray(context.history)) {
    messages.push(...context.history.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    })));
  }

  messages.push({ role: 'user', content: input });

  // Use DataSource (handles both API and local mode)
  return await dataSource.fetchClaude(messages, {
    max_tokens: 1024,
    system: 'You are Cal, a helpful AI assistant in the CalOS operating system.',
    context: context // Pass context for local mode detection
  });
}

/**
 * Run DeepSeek
 */
async function runDeepSeek(input, context) {
  const messages = [
    { role: 'system', content: 'You are Cal, a helpful AI assistant in the CalOS operating system.' }
  ];

  if (context.history && Array.isArray(context.history)) {
    messages.push(...context.history);
  }

  messages.push({ role: 'user', content: input });

  // Use DataSource (handles both API and local mode)
  return await dataSource.fetchDeepSeek(messages, {
    temperature: 0.7,
    max_tokens: 1000,
    context: context // Pass context for local mode detection
  });
}

/**
 * Run Ollama (local LLM) with ReACT pattern (Reasoning + Acting)
 *
 * Ollama can now use tools autonomously:
 * 1. Ollama reasons about what to do
 * 2. Ollama calls a tool (fetch_api, query_database, etc.)
 * 3. We execute the tool and return results
 * 4. Ollama sees results and continues or finishes
 */
async function runOllama(model, input, context) {
  // Initialize tools with database access and receipt processing
  const tools = new OllamaTools({
    db: context.db || null,
    allowDangerousCommands: context.allowDangerousCommands || false,
    receiptParser: context.receiptParser || null,
    ocrAdapter: context.ocrAdapter || null
  });

  // Enhanced system prompt with tool definitions
  const systemPrompt = `You are Cal, an autonomous AI assistant in the CalOS operating system.

${tools.getToolDefinitions()}

When you need information or want to perform actions, use the tools above.
Think step by step. When you have the final answer, respond normally without tool calls.`;

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // Add conversation history
  if (context.history && Array.isArray(context.history)) {
    messages.push(...context.history);
  }

  messages.push({ role: 'user', content: input });

  // ReACT loop: max 10 iterations to prevent infinite loops
  const maxIterations = context.maxIterations || 10;
  let finalResponse = '';

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Get Ollama's response
    const response = await dataSource.fetchOllama(model, messages, {
      timeout: 60000,
      context: context
    });

    // Check if Ollama wants to use tools
    const toolCalls = tools.parseToolCalls(response);

    if (toolCalls.length === 0) {
      // No tools needed - Ollama has the final answer
      finalResponse = response;
      break;
    }

    // Log tool usage
    if (context.verbose) {
      console.log(`[ReACT Iteration ${iteration + 1}] Tool calls:`, toolCalls.map(t => t.tool));
    }

    // Execute all tool calls
    const toolResults = [];
    for (const call of toolCalls) {
      const result = await tools.executeTool(call.tool, call.args);
      toolResults.push({
        tool: call.tool,
        args: call.args,
        result: result
      });
    }

    // Add Ollama's response to conversation
    messages.push({
      role: 'assistant',
      content: response
    });

    // Add tool results to conversation
    const resultsText = toolResults.map(tr => {
      return `TOOL: ${tr.tool}\nRESULT: ${JSON.stringify(tr.result, null, 2)}`;
    }).join('\n\n');

    messages.push({
      role: 'user',
      content: `${resultsText}\n\nContinue reasoning with these results, or provide your final answer.`
    });
  }

  // Check if we hit max iterations
  if (!finalResponse) {
    finalResponse = `[Max iterations reached after ${maxIterations} tool calls. Task may be incomplete.]`;
  }

  // Optionally return tool execution log
  if (context.returnToolLog) {
    return {
      response: finalResponse,
      toolLog: tools.getExecutionLog()
    };
  }

  return finalResponse;
}

/**
 * Run Browser Agent (Puppeteer)
 */
async function runBrowserAgent(input, context) {
  const BrowserAgent = require('./browser-agent');

  try {
    const agent = new BrowserAgent({
      headless: context.headless !== false,
      timeout: context.timeout || 30000
    });

    return await agent.process(input, context);

  } catch (error) {
    if (error.message.includes('Cannot find module')) {
      return '⚠️ Browser agent requires Puppeteer. Install with:\n   cd agent-router && npm install puppeteer';
    }
    throw error;
  }
}

/**
 * Run HN Agent (Hacker News scraper)
 */
async function runHNAgent(input, context) {
  const HNAgent = require('./hn-agent');

  try {
    const agent = new HNAgent({
      headless: context.headless !== false,
      timeout: context.timeout || 30000
    });

    return await agent.process(input, context);

  } catch (error) {
    if (error.message.includes('Cannot find module')) {
      return '⚠️ HN agent requires Puppeteer and Cheerio. Install with:\n   cd agent-router && npm install puppeteer cheerio';
    }
    throw error;
  }
}

/**
 * Run GitHub Agent (OSS Discovery)
 */
async function runGitHubAgent(input, context) {
  const GitHubAgent = require('./github-agent');

  try {
    const agent = new GitHubAgent();
    return await agent.process(input, context);

  } catch (error) {
    if (error.message.includes('Cannot find module')) {
      return '⚠️ GitHub agent requires gh CLI. Install with:\n   brew install gh\n   gh auth login';
    }
    throw error;
  }
}

/**
 * Run Price Agent (Natural Language Price Queries)
 */
async function runPriceAgent(input, context) {
  const { runPriceAgent } = require('./price-agent');

  try {
    return await runPriceAgent(input, context);
  } catch (error) {
    return `⚠️ Price agent error: ${error.message}\n   Make sure the router is running with: calos-start`;
  }
}

/**
 * Check if Ollama is available
 */
async function checkOllamaAvailability() {
  const ollamaUrl = process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434';

  try {
    const response = await axios.get(`${ollamaUrl}/api/tags`, { timeout: 3000 });
    return {
      available: true,
      models: response.data.models || []
    };
  } catch (error) {
    return {
      available: false,
      models: []
    };
  }
}

module.exports = { runAgent, checkOllamaAvailability, initDataSource };
