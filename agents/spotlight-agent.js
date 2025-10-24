/**
 * Spotlight Agent
 *
 * Universal query handler inspired by macOS Spotlight.
 * Handles calculations, conversions, definitions, file search, and more.
 *
 * Query Types:
 * - Calculations: "2+2", "sqrt(16)", "sin(45)"
 * - Conversions: "100 USD to EUR", "5 feet to meters", "100F to C"
 * - Definitions: "define recursion", "what is REST API"
 * - File Search: "index.js", "kind:pdf README"
 * - Web Search: "weather NYC", "stock AAPL"
 * - Actions: "open Safari", "create event"
 */

const QueryTypeDetector = require('../lib/query-type-detector');
const CalculatorEngine = require('../lib/calculator-engine');
const UnitConverter = require('../lib/unit-converter');
const KnowledgeQueryEngine = require('../lib/knowledge-query-engine');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class SpotlightAgent {
  constructor(options = {}) {
    this.detector = new QueryTypeDetector();
    this.calculator = new CalculatorEngine();
    this.converter = new UnitConverter();
    this.knowledgeEngine = new KnowledgeQueryEngine();

    this.searchPaths = options.searchPaths || [
      process.env.HOME,
      '/Applications',
      '/Users'
    ];
  }

  /**
   * Process a Spotlight-style query
   * @param {string} input - User query
   * @param {object} context - Additional context
   * @returns {Promise<string>} Result
   */
  async process(input, context = {}) {
    const query = input.trim();

    if (!query) {
      return this.help();
    }

    const startTime = Date.now();

    try {
      // Detect query type
      const queryType = this.detector.detect(query);

      let result;

      switch (queryType) {
        case 'calculation':
          result = await this.handleCalculation(query);
          break;

        case 'conversion':
          result = await this.handleConversion(query);
          break;

        case 'definition':
          result = await this.handleDefinition(query);
          break;

        case 'file-search':
          result = await this.handleFileSearch(query);
          break;

        case 'web-search':
          result = await this.handleWebSearch(query);
          break;

        case 'action':
          result = await this.handleAction(query);
          break;

        default:
          result = await this.handleIntelligentFallback(query);
      }

      const duration = Date.now() - startTime;

      return this.formatResult(result, queryType, duration);

    } catch (error) {
      return `❌ Error: ${error.message}\n\n💡 Try rephrasing your query or use 'calos help' for examples.`;
    }
  }

  /**
   * Handle calculation queries
   */
  async handleCalculation(query) {
    try {
      const result = this.calculator.calculate(query);

      return {
        success: true,
        result,
        expression: query,
        formatted: this.calculator.format(result)
      };
    } catch (error) {
      throw new Error(`Calculation failed: ${error.message}`);
    }
  }

  /**
   * Handle unit conversion queries
   */
  async handleConversion(query) {
    try {
      // Parse: "100 USD to EUR" or "5 feet to meters"
      const match = query.match(/(\d+\.?\d*)\s+(\w+)\s+to\s+(\w+)/i);

      if (!match) {
        throw new Error('Invalid conversion format. Use: <value> <from-unit> to <to-unit>');
      }

      const [, value, fromUnit, toUnit] = match;

      const result = await this.converter.convert(
        parseFloat(value),
        fromUnit,
        toUnit
      );

      return {
        success: true,
        result,
        value: parseFloat(value),
        fromUnit,
        toUnit,
        formatted: `${value} ${fromUnit} = ${result.value} ${result.unit}`
      };
    } catch (error) {
      throw new Error(`Conversion failed: ${error.message}`);
    }
  }

  /**
   * Handle definition queries
   */
  async handleDefinition(query) {
    // Extract term: "define X" or "what is X"
    const term = query
      .replace(/^(define|what is|explain)\s+/i, '')
      .trim();

    try {
      // Search knowledge base first
      const knowledge = await this.knowledgeEngine.query(term);

      if (knowledge && knowledge.length > 0) {
        return {
          success: true,
          term,
          definition: knowledge[0].content,
          source: knowledge[0].source || 'Knowledge Base'
        };
      }

      // Fallback: web search
      return {
        success: true,
        term,
        definition: `No local definition found. Searching web for "${term}"...`,
        source: 'Web Search',
        webFallback: true
      };

    } catch (error) {
      throw new Error(`Definition lookup failed: ${error.message}`);
    }
  }

  /**
   * Handle file search queries
   */
  async handleFileSearch(query) {
    try {
      // Parse filters: "kind:pdf README" → kind=pdf, query=README
      const filters = this.parseSearchFilters(query);

      const results = await this.searchFiles(filters.query, filters);

      return {
        success: true,
        query: filters.query,
        filters,
        results: results.slice(0, 10), // Top 10 results
        totalCount: results.length
      };

    } catch (error) {
      throw new Error(`File search failed: ${error.message}`);
    }
  }

  /**
   * Handle web search queries
   */
  async handleWebSearch(query) {
    return {
      success: true,
      query,
      message: `Searching web for: "${query}"`,
      suggestion: `Use '@google ${query}' for Google search or '@hn ${query}' for Hacker News`
    };
  }

  /**
   * Handle action queries
   */
  async handleAction(query) {
    const actionMatch = query.match(/^(open|launch|start|create)\s+(.+)/i);

    if (!actionMatch) {
      throw new Error('Invalid action format');
    }

    const [, action, target] = actionMatch;

    switch (action.toLowerCase()) {
      case 'open':
      case 'launch':
      case 'start':
        return await this.openApplication(target);

      case 'create':
        return await this.createItem(target);

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Intelligent fallback for ambiguous queries
   */
  async handleIntelligentFallback(query) {
    // Try multiple strategies

    // 1. Check if it's a file
    const fileResults = await this.searchFiles(query, {});
    if (fileResults.length > 0) {
      return {
        success: true,
        query,
        type: 'file-search',
        results: fileResults.slice(0, 5)
      };
    }

    // 2. Check knowledge base
    const knowledge = await this.knowledgeEngine.query(query);
    if (knowledge && knowledge.length > 0) {
      return {
        success: true,
        query,
        type: 'knowledge',
        results: knowledge.slice(0, 3)
      };
    }

    // 3. Default: suggest web search
    return {
      success: true,
      query,
      type: 'suggestion',
      message: `No local results found. Try:\n  • Web search: @google ${query}\n  • Definition: define ${query}\n  • File: find ${query}`
    };
  }

  /**
   * Search files
   */
  async searchFiles(query, filters = {}) {
    const results = [];

    // Use mdfind (Spotlight CLI) on macOS
    if (process.platform === 'darwin') {
      try {
        const mdfindResults = await this.mdfindSearch(query, filters);
        results.push(...mdfindResults);
      } catch (error) {
        // Fallback to manual search
      }
    }

    // Fallback: manual search
    if (results.length === 0) {
      const manualResults = await this.manualFileSearch(query, filters);
      results.push(...manualResults);
    }

    return results;
  }

  /**
   * Use macOS mdfind (Spotlight CLI)
   */
  async mdfindSearch(query, filters) {
    return new Promise((resolve) => {
      let args = [query];

      // Add kind filter if specified
      if (filters.kind) {
        args = [`kMDItemKind == '*${filters.kind}*'`, '-name', query];
      }

      const proc = spawn('mdfind', args);

      let stdout = '';
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', () => {
        const files = stdout.split('\n').filter(f => f.trim());
        resolve(files.map(path => ({ path, name: path.split('/').pop() })));
      });

      proc.on('error', () => {
        resolve([]);
      });

      // Timeout after 2 seconds
      setTimeout(() => {
        proc.kill();
        resolve([]);
      }, 2000);
    });
  }

  /**
   * Manual file search fallback
   */
  async manualFileSearch(query, filters) {
    const results = [];

    for (const searchPath of this.searchPaths) {
      try {
        const found = await this.recursiveFileSearch(searchPath, query, filters, 0, 3);
        results.push(...found);

        if (results.length >= 20) break; // Limit results
      } catch (error) {
        // Skip inaccessible directories
        continue;
      }
    }

    return results;
  }

  /**
   * Recursive file search
   */
  async recursiveFileSearch(dir, query, filters, depth, maxDepth) {
    if (depth > maxDepth) return [];

    const results = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden and system files
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(dir, entry.name);

        // Check if name matches query
        if (entry.name.toLowerCase().includes(query.toLowerCase())) {
          // Check kind filter
          if (filters.kind) {
            const ext = path.extname(entry.name).substring(1);
            if (ext.toLowerCase() !== filters.kind.toLowerCase()) {
              continue;
            }
          }

          results.push({
            path: fullPath,
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file'
          });
        }

        // Recurse into directories
        if (entry.isDirectory()) {
          const subResults = await this.recursiveFileSearch(
            fullPath,
            query,
            filters,
            depth + 1,
            maxDepth
          );
          results.push(...subResults);
        }

        if (results.length >= 20) break;
      }
    } catch (error) {
      // Skip inaccessible directories
    }

    return results;
  }

  /**
   * Parse search filters from query
   */
  parseSearchFilters(query) {
    const filters = {};
    let cleanQuery = query;

    // Extract kind: filter
    const kindMatch = query.match(/kind:(\w+)/i);
    if (kindMatch) {
      filters.kind = kindMatch[1];
      cleanQuery = query.replace(/kind:\w+/i, '').trim();
    }

    // Extract date: filter
    const dateMatch = query.match(/date:(\w+)/i);
    if (dateMatch) {
      filters.date = dateMatch[1];
      cleanQuery = cleanQuery.replace(/date:\w+/i, '').trim();
    }

    return {
      ...filters,
      query: cleanQuery
    };
  }

  /**
   * Open application
   */
  async openApplication(appName) {
    return new Promise((resolve) => {
      const proc = spawn('open', ['-a', appName]);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            action: 'open',
            target: appName,
            message: `Opened ${appName}`
          });
        } else {
          resolve({
            success: false,
            action: 'open',
            target: appName,
            error: `Failed to open ${appName}`
          });
        }
      });

      proc.on('error', (error) => {
        resolve({
          success: false,
          action: 'open',
          target: appName,
          error: error.message
        });
      });
    });
  }

  /**
   * Create item (event, note, etc.)
   */
  async createItem(itemType) {
    return {
      success: false,
      action: 'create',
      target: itemType,
      message: `Create ${itemType} not yet implemented. Try '@cal create event' for calendar events.`
    };
  }

  /**
   * Format result for display
   */
  formatResult(result, queryType, duration) {
    let output = '';

    if (queryType === 'calculation' && result.success) {
      output += `🧮 ${result.expression} = ${result.formatted}\n`;
    } else if (queryType === 'conversion' && result.success) {
      output += `🔄 ${result.formatted}\n`;
    } else if (queryType === 'definition' && result.success) {
      output += `📖 ${result.term}\n\n`;
      output += `${result.definition}\n\n`;
      output += `Source: ${result.source}\n`;
    } else if (queryType === 'file-search' && result.success) {
      output += `📁 Found ${result.totalCount} file(s) matching "${result.query}"\n\n`;
      for (const file of result.results) {
        output += `  ${file.name}\n`;
        output += `  ${file.path}\n\n`;
      }
    } else if (queryType === 'action' && result.success) {
      output += `✓ ${result.message}\n`;
    } else if (result.type === 'suggestion') {
      output += `💡 ${result.message}\n`;
    } else if (result.message) {
      output += result.message + '\n';
    }

    output += `\n⏱️  ${duration}ms`;

    return output;
  }

  /**
   * Help message
   */
  help() {
    return `
🔍 Spotlight Query System

Usage:
  calos "<query>"

Examples:

📐 Calculations:
  calos "2+2"
  calos "sqrt(16)"
  calos "sin(45)"

🔄 Conversions:
  calos "100 USD to EUR"
  calos "5 feet to meters"
  calos "100F to C"

📖 Definitions:
  calos "define recursion"
  calos "what is REST API"

📁 File Search:
  calos "index.js"
  calos "kind:pdf README"

🌐 Web Search:
  calos "weather NYC"
  calos "@google latest news"

⚡ Actions:
  calos "open Safari"
  calos "create event"

Type any query and Spotlight will figure out what you want!
    `.trim();
  }
}

module.exports = SpotlightAgent;
