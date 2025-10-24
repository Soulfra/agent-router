/**
 * Copilot Service Adapter
 *
 * Implements Language Server Protocol (LSP) compatibility for AI-powered
 * code completion and autonomous building.
 *
 * Supported Operations:
 * - complete: Code completion (LSP textDocument/completion)
 * - build: Autonomous feature building
 * - refactor: Code refactoring
 * - explain: Code explanation
 * - fix: Bug fixing
 *
 * Port: 11437
 * Models: codellama:13b, deepseek-coder-instruct:6.7b, claude-3.5-sonnet (API)
 */

class CopilotAdapter {
  constructor(options = {}) {
    this.ollamaPort = options.ollamaPort || 11437;
    this.ollamaHost = options.ollamaHost || 'http://localhost';
    this.defaultModel = options.defaultModel || 'codellama:13b';
    this.codeIndexer = options.codeIndexer; // Optional: search existing code
    this.triangleConsensus = options.triangleConsensus; // Optional: multi-model debate
  }

  /**
   * Main entry point for Copilot service requests
   *
   * @param {Object} request - Service request
   * @param {string} request.operation - copilot operation type
   * @param {Object} request.context - code context
   * @param {string} request.prompt - user prompt
   * @returns {Promise<Object>} LSP-formatted response
   */
  async handle(request) {
    const { operation, context = {}, prompt } = request;

    switch (operation) {
      case 'complete':
        return this.complete(context, prompt);

      case 'build':
        return this.build(context, prompt);

      case 'refactor':
        return this.refactor(context, prompt);

      case 'explain':
        return this.explain(context, prompt);

      case 'fix':
        return this.fix(context, prompt);

      default:
        throw new Error(`Unknown copilot operation: ${operation}`);
    }
  }

  /**
   * Code completion (LSP textDocument/completion)
   *
   * @param {Object} context - LSP context
   * @param {Object} context.textDocument - Document info
   * @param {Object} context.position - Cursor position
   * @param {string} context.surrounding_code - Code around cursor
   * @returns {Promise<Object>} LSP CompletionList
   */
  async complete(context, customPrompt) {
    const {
      textDocument = {},
      position = {},
      surrounding_code = '',
      language = 'javascript'
    } = context;

    const { uri, version } = textDocument;
    const { line, character } = position;

    // Search for similar patterns in codebase
    let similarCode = [];
    if (this.codeIndexer) {
      similarCode = await this.codeIndexer.search(surrounding_code, { limit: 3 });
    }

    const prompt = customPrompt || `
      Provide code completion for this context.

      File: ${uri || 'unknown'}
      Language: ${language}
      Position: Line ${line}, Column ${character}

      Code:
      \`\`\`${language}
      ${surrounding_code}
      [CURSOR HERE]
      \`\`\`

      ${similarCode.length > 0 ? `Similar patterns found:\n${similarCode.map(c => c.code).join('\n---\n')}` : ''}

      Provide 3-5 completion suggestions ranked by relevance.

      Return JSON array:
      [
        {
          "label": "onClick",
          "kind": 5,
          "detail": "(event: MouseEvent) => void",
          "documentation": "Click handler function",
          "insertText": "onClick",
          "sortText": "0"
        }
      ]

      LSP CompletionItemKind values:
      1=Text, 2=Method, 3=Function, 4=Constructor, 5=Field, 6=Variable,
      7=Class, 8=Interface, 9=Module, 10=Property, 11=Unit, 12=Value,
      13=Enum, 14=Keyword, 15=Snippet
    `;

    const response = await this._callOllama({
      model: 'deepseek-coder-instruct:6.7b', // Best for completions
      prompt,
      format: 'json'
    });

    const items = this._parseJSON(response);

    // Return LSP CompletionList
    return {
      isIncomplete: false,
      items: Array.isArray(items) ? items : [items]
    };
  }

  /**
   * Autonomous feature building
   *
   * @param {Object} context - Build context
   * @param {string} prompt - Feature description
   * @returns {Promise<Object>} Build result with generated code
   */
  async build(context, prompt) {
    const {
      project_context = '',
      file_structure = [],
      coding_style = 'idiomatic'
    } = context;

    // Step 1: Search existing code for patterns
    let existingPatterns = [];
    if (this.codeIndexer) {
      existingPatterns = await this.codeIndexer.search(prompt, { limit: 5 });
    }

    // Step 2: Use Triangle Consensus for quality (if available)
    let buildPlan;
    if (this.triangleConsensus) {
      buildPlan = await this.triangleConsensus.debate(prompt, {
        context: existingPatterns,
        style: coding_style
      });
    } else {
      buildPlan = await this._generateBuildPlan(prompt, existingPatterns);
    }

    // Step 3: Generate code
    const codePrompt = `
      Build this feature following the plan:

      ${prompt}

      Plan:
      ${JSON.stringify(buildPlan, null, 2)}

      ${existingPatterns.length > 0 ? `\nExisting patterns to follow:\n${existingPatterns.map(p => p.code).join('\n---\n')}` : ''}

      Coding style: ${coding_style}

      Generate complete, production-ready code.

      Return JSON:
      {
        "files": [
          {
            "path": "src/components/Button.jsx",
            "code": "...",
            "description": "Reusable button component"
          }
        ],
        "tests": [
          {
            "path": "src/components/Button.test.jsx",
            "code": "...",
            "description": "Unit tests for Button"
          }
        ],
        "documentation": "Brief usage guide"
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt: codePrompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Code refactoring
   */
  async refactor(context, customPrompt) {
    const { code, language = 'javascript', refactor_type = 'general' } = context;

    if (!code) {
      throw new Error('Missing required context: code');
    }

    const prompt = customPrompt || `
      Refactor this code for better ${refactor_type === 'general' ? 'quality' : refactor_type}.

      Language: ${language}
      Refactor type: ${refactor_type}

      Original code:
      \`\`\`${language}
      ${code}
      \`\`\`

      Refactor for:
      ${refactor_type === 'performance' ? '- Performance optimization\n- Reduce complexity\n- Eliminate bottlenecks' : ''}
      ${refactor_type === 'readability' ? '- Clearer variable names\n- Better structure\n- Add comments' : ''}
      ${refactor_type === 'general' ? '- DRY principle\n- SOLID principles\n- Best practices' : ''}

      Return JSON:
      {
        "refactored_code": "...",
        "changes": [
          { "type": "extracted_function", "description": "...", "reason": "..." }
        ],
        "improvement_summary": "..."
      }
    `;

    const response = await this._callOllama({
      model: 'deepseek-coder-instruct:6.7b',
      prompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Code explanation
   */
  async explain(context, customPrompt) {
    const { code, language = 'javascript', detail_level = 'medium' } = context;

    if (!code) {
      throw new Error('Missing required context: code');
    }

    const prompt = customPrompt || `
      Explain this code in ${detail_level} detail.

      Language: ${language}

      Code:
      \`\`\`${language}
      ${code}
      \`\`\`

      ${detail_level === 'high' ? 'Provide line-by-line explanation.' : ''}
      ${detail_level === 'medium' ? 'Explain key concepts and logic flow.' : ''}
      ${detail_level === 'low' ? 'Provide brief summary only.' : ''}

      Return JSON:
      {
        "summary": "Brief overview",
        "explanation": "${detail_level === 'high' ? 'Detailed' : 'Concise'} explanation",
        ${detail_level === 'high' ? '"line_by_line": { "1": "...", "2": "..." },' : ''}
        "key_concepts": ["concept1", "concept2"],
        "complexity": "O(...)",
        "potential_issues": ["issue1", "issue2"]
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Bug fixing
   */
  async fix(context, customPrompt) {
    const {
      code,
      language = 'javascript',
      error_message = '',
      stack_trace = ''
    } = context;

    if (!code) {
      throw new Error('Missing required context: code');
    }

    const prompt = customPrompt || `
      Fix the bug in this code.

      Language: ${language}

      Code:
      \`\`\`${language}
      ${code}
      \`\`\`

      ${error_message ? `Error: ${error_message}\n` : ''}
      ${stack_trace ? `Stack trace:\n${stack_trace}\n` : ''}

      Identify the bug and provide a fix.

      Return JSON:
      {
        "bug_identified": "Description of the bug",
        "root_cause": "Why this bug occurred",
        "fixed_code": "...",
        "explanation": "How the fix works",
        "prevention": "How to prevent this bug in the future"
      }
    `;

    const response = await this._callOllama({
      model: 'deepseek-coder-instruct:6.7b',
      prompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Generate build plan (simplified consensus without Triangle)
   */
  async _generateBuildPlan(prompt, existingPatterns) {
    const planPrompt = `
      Create a build plan for this feature:

      ${prompt}

      ${existingPatterns.length > 0 ? `Existing patterns:\n${existingPatterns.map(p => p.description).join(', ')}` : ''}

      Return JSON:
      {
        "steps": [
          { "step": 1, "description": "Create component file", "file": "src/..." },
          { "step": 2, "description": "Add state management", "file": "src/..." }
        ],
        "dependencies": ["react", "..."],
        "testing_strategy": "Unit tests + integration tests"
      }
    `;

    const response = await this._callOllama({
      model: this.defaultModel,
      prompt: planPrompt,
      format: 'json'
    });

    return this._parseJSON(response);
  }

  /**
   * Call Ollama on Copilot-optimized port 11437
   */
  async _callOllama(request) {
    const url = `${this.ollamaHost}:${this.ollamaPort}/api/generate`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        prompt: request.prompt,
        format: request.format || 'json',
        stream: false,
        options: {
          temperature: 0.3, // Lower temperature for code generation
          top_p: 0.9
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  /**
   * Parse JSON response from LLM
   */
  _parseJSON(response) {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.match(/```\s*([\s\S]*?)\s*```/);

      const jsonString = jsonMatch ? jsonMatch[1] : response;
      return JSON.parse(jsonString.trim());
    } catch (error) {
      // If parsing fails, return raw response
      return { raw_response: response, parse_error: error.message };
    }
  }

  /**
   * Format response for API (LSP-compatible)
   */
  format(data) {
    return {
      service: 'copilot',
      port: this.ollamaPort,
      data,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = CopilotAdapter;
