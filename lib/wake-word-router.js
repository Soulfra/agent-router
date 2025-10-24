/**
 * Wake Word Router
 *
 * "People aren't going to want to learn our terms - use catch phrases or wake words"
 *
 * Problem:
 * - Technical jargon is barrier to entry
 * - Need natural language interface
 * - "what's next" vs "show todos" should both work
 * - Support wake words like "hey cal", "ask ralph"
 * - Fuzzy matching for "close enough" commands
 *
 * Solution:
 * - Natural language command router
 * - Wake words trigger specific AI instances
 * - Catch phrases map to actions
 * - Fuzzy matching for variations
 * - Extensible command registry
 *
 * Examples:
 * - "hey cal, what's next?" → Cal instance + show todos
 * - "ask ralph about this" → Ralph instance + query
 * - "what do i need to do" → Show pending todos
 * - "add buy milk to list" → Create todo
 * - "check price of bitcoin" → Fetch data
 */

const FuzzyMatcher = require('./fuzzy-matcher');

class WakeWordRouter {
  constructor(options = {}) {
    this.fuzzyMatcher = new FuzzyMatcher({
      maxDistance: 3,
      minSimilarity: 0.6
    });

    // Dependencies
    this.decisionTodo = options.decisionTodo;
    this.aiInstanceRegistry = options.aiInstanceRegistry;
    this.calFetch = options.calFetch; // Data fetching utility
    this.timeAwareAI = options.timeAwareAI; // Time-aware AI wrapper

    // Command registry
    this.commands = new Map();
    this.wakeWords = new Map();

    // Initialize default commands and wake words
    this.initializeDefaults();

    console.log('[WakeWordRouter] Initialized');
  }

  /**
   * Initialize default commands and wake words
   */
  initializeDefaults() {
    // ===== WAKE WORDS (AI Instance Triggers) =====

    this.registerWakeWord({
      name: 'cal',
      patterns: [
        { pattern: 'hey cal', aliases: ['hi cal', 'yo cal', 'cal'] },
        { pattern: 'ask cal', aliases: ['cal can you', 'cal help'] }
      ],
      instance: 'cal',
      description: 'Trigger Cal (Claude Code) instance'
    });

    this.registerWakeWord({
      name: 'ralph',
      patterns: [
        { pattern: 'hey ralph', aliases: ['hi ralph', 'yo ralph', 'ralph'] },
        { pattern: 'ask ralph', aliases: ['ralph can you', 'ralph help'] }
      ],
      instance: 'ralph',
      description: 'Trigger Ralph (Ollama) instance'
    });

    // ===== TODO COMMANDS =====

    this.registerCommand({
      name: 'list_todos',
      patterns: [
        {
          pattern: 'what\'s next',
          aliases: ['whats next', 'what is next', 'show next', 'next task'],
          keywords: ['next', 'whats']
        },
        {
          pattern: 'show todos',
          aliases: ['list todos', 'show tasks', 'list tasks', 'what do i need to do'],
          keywords: ['show', 'list', 'todo', 'task']
        },
        {
          pattern: 'pending tasks',
          aliases: ['pending todos', 'what\'s pending', 'whats pending'],
          keywords: ['pending']
        }
      ],
      action: 'list_todos',
      handler: async (input, context) => {
        return await this._handleListTodos(input, context);
      },
      description: 'Show pending todos'
    });

    this.registerCommand({
      name: 'add_todo',
      patterns: [
        {
          pattern: 'add to list',
          aliases: ['add task', 'add todo', 'create task', 'new task', 'new todo'],
          keywords: ['add', 'create', 'new']
        },
        {
          pattern: 'remind me',
          aliases: ['remember to', 'don\'t forget'],
          keywords: ['remind', 'remember', 'forget']
        }
      ],
      action: 'add_todo',
      handler: async (input, context) => {
        return await this._handleAddTodo(input, context);
      },
      description: 'Add a new todo'
    });

    this.registerCommand({
      name: 'mark_done',
      patterns: [
        {
          pattern: 'mark done',
          aliases: ['mark complete', 'done', 'complete', 'finish', 'finished'],
          keywords: ['done', 'complete', 'finish']
        },
        {
          pattern: 'check off',
          aliases: ['cross off', 'tick off'],
          keywords: ['check', 'cross', 'tick']
        }
      ],
      action: 'mark_done',
      handler: async (input, context) => {
        return await this._handleMarkDone(input, context);
      },
      description: 'Mark todo as complete'
    });

    // ===== DATA FETCH COMMANDS =====

    this.registerCommand({
      name: 'check_price',
      patterns: [
        {
          pattern: 'check price',
          aliases: ['check cost', 'what\'s the price', 'whats the price', 'price of', 'cost of'],
          keywords: ['price', 'cost']
        },
        {
          pattern: 'how much',
          aliases: ['how much is', 'how much does'],
          keywords: ['how', 'much']
        }
      ],
      action: 'fetch_price',
      handler: async (input, context) => {
        return await this._handleFetchPrice(input, context);
      },
      description: 'Fetch price/cost data'
    });

    this.registerCommand({
      name: 'fetch_data',
      patterns: [
        {
          pattern: 'get data',
          aliases: ['fetch data', 'pull data', 'retrieve data'],
          keywords: ['get', 'fetch', 'pull', 'retrieve', 'data']
        },
        {
          pattern: 'look up',
          aliases: ['lookup', 'search for', 'find'],
          keywords: ['lookup', 'search', 'find']
        }
      ],
      action: 'fetch_data',
      handler: async (input, context) => {
        return await this._handleFetchData(input, context);
      },
      description: 'Fetch external data'
    });

    // ===== TIME/DATE COMMANDS =====

    this.registerCommand({
      name: 'what_time',
      patterns: [
        {
          pattern: 'what time is it',
          aliases: ['what\'s the time', 'whats the time', 'current time', 'time'],
          keywords: ['time']
        },
        {
          pattern: 'what day is it',
          aliases: ['what\'s the date', 'whats the date', 'current date', 'today\'s date', 'todays date'],
          keywords: ['day', 'date', 'today']
        }
      ],
      action: 'get_time',
      handler: async (input, context) => {
        return await this._handleGetTime(input, context);
      },
      description: 'Get current time/date'
    });

    // ===== HELP COMMANDS =====

    this.registerCommand({
      name: 'help',
      patterns: [
        {
          pattern: 'help',
          aliases: ['help me', 'what can you do', 'what can i say', 'commands'],
          keywords: ['help', 'commands']
        }
      ],
      action: 'show_help',
      handler: async (input, context) => {
        return await this._handleHelp(input, context);
      },
      description: 'Show available commands'
    });

    console.log(`[WakeWordRouter] Registered ${this.commands.size} commands, ${this.wakeWords.size} wake words`);
  }

  /**
   * Register a wake word (AI instance trigger)
   */
  registerWakeWord({ name, patterns, instance, description }) {
    this.wakeWords.set(name, {
      name,
      patterns,
      instance,
      description
    });

    console.log(`[WakeWordRouter] Registered wake word: ${name} → ${instance}`);
  }

  /**
   * Register a command
   */
  registerCommand({ name, patterns, action, handler, description }) {
    this.commands.set(name, {
      name,
      patterns,
      action,
      handler,
      description
    });

    console.log(`[WakeWordRouter] Registered command: ${name} (${action})`);
  }

  /**
   * Route natural language input to appropriate handler
   *
   * @param {string} input - User's natural language input
   * @param {object} context - Additional context (optional)
   * @returns {Promise<object>} Response
   */
  async route(input, context = {}) {
    if (!input || typeof input !== 'string') {
      return {
        success: false,
        error: 'Invalid input'
      };
    }

    console.log(`[WakeWordRouter] Routing: "${input}"`);

    try {
      // Step 1: Check for wake words (AI instance triggers)
      const wakeWordMatch = this._matchWakeWord(input);
      if (wakeWordMatch) {
        console.log(`[WakeWordRouter] Wake word matched: ${wakeWordMatch.name} → ${wakeWordMatch.instance}`);

        // Extract prompt after wake word
        const prompt = this._extractPromptAfterWakeWord(input, wakeWordMatch);

        // Route to AI instance
        return await this._routeToAIInstance(wakeWordMatch.instance, prompt, context);
      }

      // Step 2: Check for commands
      const commandMatch = this._matchCommand(input);
      if (commandMatch) {
        console.log(`[WakeWordRouter] Command matched: ${commandMatch.name} (${commandMatch.action})`);

        // Execute command handler
        return await commandMatch.handler(input, context);
      }

      // Step 3: No match found
      return {
        success: false,
        matched: false,
        error: 'No matching command found',
        suggestion: 'Try "help" to see available commands',
        input
      };

    } catch (error) {
      console.error('[WakeWordRouter] Routing error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Match input against wake words
   * @private
   */
  _matchWakeWord(input) {
    const wakeWordList = Array.from(this.wakeWords.values());

    for (const wakeWord of wakeWordList) {
      const match = this.fuzzyMatcher.match(input, wakeWord.patterns);

      if (match && match.matched) {
        return {
          ...wakeWord,
          match
        };
      }
    }

    return null;
  }

  /**
   * Match input against commands
   * @private
   */
  _matchCommand(input) {
    const commandList = Array.from(this.commands.values());

    for (const command of commandList) {
      const match = this.fuzzyMatcher.match(input, command.patterns);

      if (match && match.matched) {
        return {
          ...command,
          match
        };
      }
    }

    return null;
  }

  /**
   * Extract prompt after wake word
   * @private
   */
  _extractPromptAfterWakeWord(input, wakeWordMatch) {
    // Find the matched pattern in input
    const patternStr = typeof wakeWordMatch.match.pattern === 'string'
      ? wakeWordMatch.match.pattern
      : wakeWordMatch.match.pattern.pattern;

    const normalized = this.fuzzyMatcher.normalize(input);
    const normalizedPattern = this.fuzzyMatcher.normalize(patternStr);

    // Find pattern position and extract everything after
    const index = normalized.indexOf(normalizedPattern);
    if (index !== -1) {
      return input.substring(index + patternStr.length).trim();
    }

    return input;
  }

  /**
   * Route to AI instance
   * @private
   */
  async _routeToAIInstance(instanceName, prompt, context) {
    if (!this.aiInstanceRegistry) {
      return {
        success: false,
        error: 'AI Instance Registry not available'
      };
    }

    console.log(`[WakeWordRouter] Routing to AI instance: ${instanceName}`);

    try {
      const response = await this.aiInstanceRegistry.ask(instanceName, {
        prompt,
        ...context
      });

      return {
        success: true,
        type: 'ai_response',
        instance: instanceName,
        response
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to query ${instanceName}: ${error.message}`
      };
    }
  }

  // ===== COMMAND HANDLERS =====

  /**
   * Handle list todos
   * @private
   */
  async _handleListTodos(input, context) {
    if (!this.decisionTodo) {
      return {
        success: false,
        error: 'DecisionTodo not available'
      };
    }

    try {
      const todos = await this.decisionTodo.searchTodos({
        status: 'pending',
        limit: 10
      });

      return {
        success: true,
        type: 'todo_list',
        action: 'list_todos',
        todos,
        count: todos.length
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to list todos: ${error.message}`
      };
    }
  }

  /**
   * Handle add todo
   * @private
   */
  async _handleAddTodo(input, context) {
    if (!this.decisionTodo) {
      return {
        success: false,
        error: 'DecisionTodo not available'
      };
    }

    // Extract todo title from input
    const title = this._extractTodoTitle(input);

    if (!title) {
      return {
        success: false,
        error: 'Could not extract todo title from input'
      };
    }

    try {
      const todo = await this.decisionTodo.createTodo({
        title,
        description: `Created via natural language: "${input}"`,
        priority: 'medium',
        status: 'pending',
        ...context
      });

      return {
        success: true,
        type: 'todo_created',
        action: 'add_todo',
        todo
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to add todo: ${error.message}`
      };
    }
  }

  /**
   * Handle mark done
   * @private
   */
  async _handleMarkDone(input, context) {
    if (!this.decisionTodo) {
      return {
        success: false,
        error: 'DecisionTodo not available'
      };
    }

    // Extract todo identifier (ID or title fragment)
    const identifier = this._extractTodoIdentifier(input);

    if (!identifier) {
      return {
        success: false,
        error: 'Could not extract todo identifier from input'
      };
    }

    try {
      // Search for todo
      const todos = await this.decisionTodo.searchTodos({
        title: identifier,
        status: 'pending',
        limit: 1
      });

      if (todos.length === 0) {
        return {
          success: false,
          error: `No pending todo found matching: ${identifier}`
        };
      }

      const todo = todos[0];

      // Mark as complete
      const updated = await this.decisionTodo.updateTodo(todo.todo_id, {
        status: 'completed'
      });

      return {
        success: true,
        type: 'todo_completed',
        action: 'mark_done',
        todo: updated
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to mark todo done: ${error.message}`
      };
    }
  }

  /**
   * Handle fetch price
   * @private
   */
  async _handleFetchPrice(input, context) {
    // Extract asset/item from input
    const item = this._extractItemName(input);

    return {
      success: true,
      type: 'fetch_price',
      action: 'fetch_price',
      item,
      message: `Would fetch price for: ${item}`,
      note: 'Integrate with cal-fetch or price API'
    };
  }

  /**
   * Handle fetch data
   * @private
   */
  async _handleFetchData(input, context) {
    return {
      success: true,
      type: 'fetch_data',
      action: 'fetch_data',
      message: 'Would fetch data based on input',
      note: 'Integrate with cal-fetch utility'
    };
  }

  /**
   * Handle get time
   * @private
   */
  async _handleGetTime(input, context) {
    const now = new Date();

    return {
      success: true,
      type: 'time_info',
      action: 'get_time',
      timestamp: now.toISOString(),
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' })
    };
  }

  /**
   * Handle help
   * @private
   */
  async _handleHelp(input, context) {
    const commandList = Array.from(this.commands.values()).map(c => ({
      name: c.name,
      description: c.description,
      examples: c.patterns.slice(0, 2).map(p =>
        typeof p === 'string' ? p : p.pattern
      )
    }));

    const wakeWordList = Array.from(this.wakeWords.values()).map(w => ({
      name: w.name,
      instance: w.instance,
      description: w.description,
      examples: w.patterns.slice(0, 2).map(p =>
        typeof p === 'string' ? p : p.pattern
      )
    }));

    return {
      success: true,
      type: 'help',
      action: 'show_help',
      commands: commandList,
      wakeWords: wakeWordList
    };
  }

  // ===== EXTRACTION UTILITIES =====

  /**
   * Extract todo title from input
   * @private
   */
  _extractTodoTitle(input) {
    // Remove command words
    const cleaned = input
      .replace(/^(add|create|new|remind me to|remember to|don't forget to?)\s+/i, '')
      .replace(/\s+(to list|to todo|to tasks?)$/i, '')
      .trim();

    return cleaned || null;
  }

  /**
   * Extract todo identifier from input
   * @private
   */
  _extractTodoIdentifier(input) {
    // Remove command words
    const cleaned = input
      .replace(/^(mark|check|cross|tick)\s+(done|complete|off|finished?)\s*/i, '')
      .trim();

    return cleaned || null;
  }

  /**
   * Extract item name from input
   * @private
   */
  _extractItemName(input) {
    // Remove command words
    const cleaned = input
      .replace(/^(check|what's|whats|how much is|price of|cost of)\s+/i, '')
      .replace(/\s+(price|cost)$/i, '')
      .trim();

    return cleaned || null;
  }

  /**
   * Get router statistics
   */
  getStats() {
    return {
      commands: this.commands.size,
      wakeWords: this.wakeWords.size,
      commandList: Array.from(this.commands.keys()),
      wakeWordList: Array.from(this.wakeWords.keys())
    };
  }
}

module.exports = WakeWordRouter;
