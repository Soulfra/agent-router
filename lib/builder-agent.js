/**
 * Builder Agent - Orchestrates AI-driven implementation from specs
 *
 * This agent:
 * 1. Reads the Tool Calling System spec
 * 2. Breaks it into tasks
 * 3. Sends tasks to Ollama model
 * 4. Writes generated files
 * 5. Runs tests
 * 6. Grades results
 * 7. Incorporates teacher feedback
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

class BuilderAgent {
  constructor(config = {}) {
    this.ollama = config.ollama || 'deepseek-coder:33b';
    this.ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
    this.spec = null;
    this.tasks = [];
    this.currentTask = null;
    this.testResults = [];
    this.comments = [];
    this.broadcast = config.broadcast || (() => {}); // WebSocket broadcast function
    this.baseDir = path.join(__dirname, '..');

    // Code Indexer for finding existing code
    this.codeIndexer = null;
    if (config.db) {
      const CodeIndexer = require('./code-indexer');
      this.codeIndexer = new CodeIndexer(config.db);
    }
  }

  /**
   * Load and parse spec into tasks
   */
  async loadSpec(specPath) {
    try {
      const spec = fs.readFileSync(specPath, 'utf8');
      this.spec = spec;
      this.tasks = this.parseSpecIntoTasks(spec);

      this.log(`✓ Loaded spec with ${this.tasks.length} tasks`);
      return this.tasks;
    } catch (error) {
      this.log(`❌ Failed to load spec: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load spec from string (for autonomous mode)
   */
  async loadSpecFromString(specString) {
    try {
      this.spec = specString;
      this.tasks = this.parseSpecIntoTasks(specString);

      this.log(`✓ Loaded spec from string with ${this.tasks.length} tasks`);
      return this.tasks;
    } catch (error) {
      this.log(`❌ Failed to parse spec string: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse markdown spec into actionable tasks
   */
  parseSpecIntoTasks(markdown) {
    const tasks = [];

    // Extract deployment checklist items (most actionable)
    const checklistMatch = markdown.match(/## 9\. Deployment Checklist[\s\S]*?(?=##|$)/);

    if (checklistMatch) {
      const checklistText = checklistMatch[0];

      // Parse phases
      const phaseRegex = /### Phase \d+:.*?\n([\s\S]*?)(?=###|$)/g;
      let phaseMatch;

      while ((phaseMatch = phaseRegex.exec(checklistText)) !== null) {
        const phaseTitle = phaseMatch[0].match(/### Phase (\d+): (.*)/);
        const phaseNum = phaseTitle ? phaseTitle[1] : '1';
        const phaseDesc = phaseTitle ? phaseTitle[2] : 'Unknown Phase';

        // Extract checkboxes
        const checkboxes = phaseMatch[1].match(/- \[ \] (.*)/g) || [];

        for (const checkbox of checkboxes) {
          const description = checkbox.replace('- [ ] ', '').trim();
          tasks.push({
            description,
            status: 'pending',
            phase: phaseNum,
            phaseDescription: phaseDesc
          });
        }
      }
    }

    // If no checklist found, create generic tasks from section headers
    if (tasks.length === 0) {
      const sections = markdown.match(/## \d+\. (.*)/g) || [];
      sections.forEach((section, idx) => {
        const title = section.replace(/## \d+\. /, '');
        if (!title.includes('Appendix') && !title.includes('Summary')) {
          tasks.push({
            description: `Implement: ${title}`,
            status: 'pending',
            phase: String(Math.floor(idx / 2) + 1)
          });
        }
      });
    }

    return tasks;
  }

  /**
   * Implement a single task
   */
  async implementTask(taskId) {
    const task = this.tasks[taskId];
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    this.currentTask = task;
    task.status = 'in_progress';

    this.log(`\n▶️  Starting task: ${task.description}`);
    this.broadcast({ type: 'task_update', taskId, status: 'in_progress' });

    try {
      // Build prompt for Ollama (now async because it searches for code)
      const prompt = await this.buildPrompt(task);

      // Query Ollama
      this.log('🤖 Querying Ollama model...');
      const response = await this.queryOllama(prompt);

      // Parse files from response
      const files = this.parseFilesFromResponse(response);

      if (files.length === 0) {
        throw new Error('Model did not generate any files');
      }

      // Write files
      const written = [];
      for (const file of files) {
        await this.writeFile(file.path, file.content);
        written.push(file.path);
      }

      task.status = 'completed';
      this.log(`✅ Completed: Generated ${written.length} file(s)`);
      this.broadcast({ type: 'task_update', taskId, status: 'completed' });

      return {
        task,
        files: written,
        modelOutput: response
      };

    } catch (error) {
      task.status = 'failed';
      this.log(`❌ Task failed: ${error.message}`);
      this.broadcast({ type: 'task_update', taskId, status: 'failed' });
      throw error;
    }
  }

  /**
   * Search for relevant code in codebase
   */
  async searchRelevantCode(task) {
    if (!this.codeIndexer) {
      return [];
    }

    try {
      // Extract keywords from task description
      const keywords = task.description
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3);

      if (keywords.length === 0) {
        return [];
      }

      // Search for relevant code snippets
      const query = keywords.join(' ');
      const results = await this.codeIndexer.searchCode(query, {
        limit: 5
      });

      this.log(`  🔍 Found ${results.length} relevant code snippets`);

      return results.map(r => ({
        file: r.file_path,
        function: r.function_name,
        description: r.description,
        code: r.code.substring(0, 500) // Limit code preview
      }));

    } catch (error) {
      console.error('[BuilderAgent] Code search error:', error);
      return [];
    }
  }

  /**
   * Build prompt for Ollama
   */
  async buildPrompt(task) {
    // Extract relevant context from spec
    const contextFromSpec = this.extractRelevantContext(task);

    // Search for relevant existing code
    const existingCode = await this.searchRelevantCode(task);

    // Get recent teacher comments
    const recentComments = this.comments.slice(-3);

    const prompt = `You are an expert developer building the CalOS Tool Calling System.

CURRENT TASK:
${task.description}

SPEC CONTEXT:
${contextFromSpec}

${existingCode.length > 0 ? `
EXISTING CODE (reuse patterns when possible):
${existingCode.map(c => `
File: ${c.file}${c.function ? ` - Function: ${c.function}` : ''}
${c.description || ''}
\`\`\`
${c.code}
\`\`\`
`).join('\n')}
` : ''}

${recentComments.length > 0 ? `
TEACHER FEEDBACK:
${recentComments.map(c => `[${c.type.toUpperCase()}] ${c.text}`).join('\n')}
` : ''}

INSTRUCTIONS:
1. Write complete, production-ready code
2. Follow the specification exactly
3. Include proper error handling
4. Add JSDoc comments for documentation
5. Make code modular and testable

OUTPUT FORMAT:
Output files using this EXACT format:

FILE: /path/to/file.js
\`\`\`javascript
// Complete file content here
\`\`\`

FILE: /another/file.js
\`\`\`javascript
// More file content
\`\`\`

IMPORTANT:
- Use ABSOLUTE paths from agent-router root (e.g., /agent-router/lib/file.js)
- Include ALL necessary code (no placeholders or TODOs)
- Each file must be complete and runnable

Generate the implementation now:`;

    return prompt;
  }

  /**
   * Extract relevant context from spec for this task
   */
  extractRelevantContext(task) {
    if (!this.spec) return '';

    const description = task.description.toLowerCase();

    // Find relevant sections
    let context = '';

    // If task mentions specific file, find its section
    if (description.includes('tool-registry')) {
      context = this.extractSection('2.1 Schema Definition');
      context += '\n' + this.extractSection('2.2 Tool Definitions');
    } else if (description.includes('tool-executor')) {
      context = this.extractSection('5.2 Tool Executor');
    } else if (description.includes('claude-code')) {
      context = this.extractSection('5.3 Claude Code Bridge');
    } else if (description.includes('rss-poster')) {
      context = this.extractSection('5.4 RSS Poster');
    } else if (description.includes('test')) {
      context = this.extractSection('6. Test Specifications');
    } else if (description.includes('training')) {
      context = this.extractSection('7. Training Data Generation');
    }

    // Fallback: include implementation section
    if (!context) {
      context = this.extractSection('5. Implementation Components');
    }

    // Limit context size (keep under ~2000 chars)
    return context.substring(0, 2000);
  }

  /**
   * Extract a section from the spec
   */
  extractSection(heading) {
    if (!this.spec) return '';

    const headingPattern = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`###? ${headingPattern}([\\s\\S]*?)(?=###?|$)`, 'i');
    const match = this.spec.match(regex);

    return match ? match[1].trim() : '';
  }

  /**
   * Query Ollama model
   */
  async queryOllama(prompt) {
    try {
      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: this.ollama,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.2, // Low temperature for precise code generation
          top_p: 0.9,
          num_predict: 4000 // Allow longer responses for complete files
        }
      });

      return response.data.response;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama is not running. Start it with: ollama serve');
      }
      throw error;
    }
  }

  /**
   * Parse files from model output
   */
  parseFilesFromResponse(response) {
    const files = [];

    // Match FILE: path followed by code block
    const fileRegex = /FILE:\s*([^\n]+)\n```(\w+)?\n([\s\S]*?)\n```/g;

    let match;
    while ((match = fileRegex.exec(response)) !== null) {
      const filePath = match[1].trim();
      const language = match[2] || 'javascript';
      const content = match[3].trim();

      // Normalize path (remove /agent-router prefix if present)
      let normalizedPath = filePath.replace(/^\/agent-router\//, '');

      files.push({
        path: normalizedPath,
        language,
        content
      });
    }

    return files;
  }

  /**
   * Write file with safety checks
   */
  async writeFile(filePath, content) {
    // Ensure path is relative and safe
    const safePath = path.join(this.baseDir, filePath);

    // Safety check: must be within baseDir
    if (!safePath.startsWith(this.baseDir)) {
      throw new Error(`Unsafe path: ${filePath}`);
    }

    // Create directory if needed
    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      this.log(`  📁 Created directory: ${path.relative(this.baseDir, dir)}`);
    }

    // Write file
    fs.writeFileSync(safePath, content, 'utf8');

    this.log(`  ✓ Wrote: ${filePath} (${content.length} bytes)`);

    // Broadcast to UI
    this.broadcast({
      type: 'file_written',
      path: filePath,
      content: content.substring(0, 1000) // Send preview
    });
  }

  /**
   * Run tests for specific phase
   */
  async runTests(phase) {
    this.log(`\n🧪 Running tests for Phase ${phase}...`);

    const testFiles = {
      '1': ['test/tool-executor.test.js', 'test/tool-registry.test.js'],
      '2': ['test/tool-integration.test.js'],
      '3': ['test/tool-e2e.test.js']
    };

    const files = testFiles[phase] || [];

    if (files.length === 0) {
      this.log('  ⚠️  No tests defined for this phase');
      return { results: [], grade: 'N/A', passed: 0, total: 0 };
    }

    const results = [];

    for (const testFile of files) {
      this.log(`  🧪 Running: ${testFile}`);
      const result = await this.runSingleTest(testFile);
      results.push(result);

      // Broadcast result
      this.broadcast({
        type: 'test_result',
        result
      });
    }

    // Grade results
    const grade = this.gradeTests(results);
    const passed = results.filter(r => r.success).length;

    this.log(`\n  📊 Test Results: ${passed}/${results.length} passed (Grade: ${grade})`);

    return {
      results,
      grade,
      passed,
      total: results.length
    };
  }

  /**
   * Run a single test file
   */
  async runSingleTest(testFile) {
    const testPath = path.join(this.baseDir, testFile);

    // Check if test file exists
    if (!fs.existsSync(testPath)) {
      return {
        file: testFile,
        success: false,
        output: '',
        error: `Test file not found: ${testFile}`,
        grade: 'F'
      };
    }

    try {
      const { stdout, stderr } = await execPromise(
        `npm test -- ${testFile}`,
        { cwd: this.baseDir, timeout: 30000 }
      );

      return {
        file: testFile,
        success: true,
        output: stdout,
        error: stderr,
        grade: 'A+'
      };
    } catch (error) {
      return {
        file: testFile,
        success: false,
        output: error.stdout || '',
        error: error.stderr || error.message,
        grade: 'F'
      };
    }
  }

  /**
   * Grade test results (A+ to F)
   */
  gradeTests(results) {
    if (results.length === 0) return 'N/A';

    const passRate = results.filter(r => r.success).length / results.length;

    if (passRate >= 0.95) return 'A+';
    if (passRate >= 0.90) return 'A';
    if (passRate >= 0.80) return 'B';
    if (passRate >= 0.70) return 'C';
    return 'F';
  }

  /**
   * Add teacher comment
   */
  addComment(type, text) {
    const comment = {
      type, // suggestion, issue, approved, needs_revision
      text,
      timestamp: new Date().toISOString()
    };

    this.comments.push(comment);

    this.log(`💬 Teacher comment [${type}]: ${text.substring(0, 50)}...`);

    return comment;
  }

  /**
   * Get build progress
   */
  getProgress() {
    const total = this.tasks.length;
    const completed = this.tasks.filter(t => t.status === 'completed').length;
    const failed = this.tasks.filter(t => t.status === 'failed').length;
    const inProgress = this.tasks.filter(t => t.status === 'in_progress').length;

    return {
      total,
      completed,
      failed,
      inProgress,
      pending: total - completed - failed - inProgress,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }

  /**
   * Get summary report
   */
  getSummary() {
    const progress = this.getProgress();
    const testsPassed = this.testResults.filter(r => r.success).length;
    const testsFailed = this.testResults.filter(r => !r.success).length;

    return {
      progress,
      tests: {
        passed: testsPassed,
        failed: testsFailed,
        total: testsPassed + testsFailed
      },
      comments: this.comments.length,
      currentTask: this.currentTask ? this.currentTask.description : 'None'
    };
  }

  /**
   * Log to terminal and console
   */
  log(message) {
    console.log(message);
    this.broadcast({
      type: 'terminal',
      message
    });
  }

  /**
   * Generate training example from successful build
   */
  generateTrainingExample(task, files, testResults) {
    // Create a training example showing successful implementation
    const example = {
      text: this.formatTrainingText(task, files, testResults),
      metadata: {
        task: task.description,
        phase: task.phase,
        grade: this.gradeTests(testResults),
        files: files.length,
        timestamp: new Date().toISOString()
      }
    };

    return example;
  }

  /**
   * Format training text for fine-tuning
   */
  formatTrainingText(task, files, testResults) {
    const grade = this.gradeTests(testResults);
    const filesText = files.map(f => `- ${f}`).join('\n');
    const testsText = testResults.map(r =>
      `${r.success ? '✅' : '❌'} ${r.file}`
    ).join('\n');

    return `<|im_start|>system
You are an expert developer building systems from specifications.
<|im_end|>
<|im_start|>user
Task: ${task.description}
Phase: ${task.phase}
<|im_end|>
<|im_start|>assistant
I'll implement this task following the specification.

Generated files:
${filesText}

Test results:
${testsText}

Grade: ${grade}
<|im_end|>`;
  }
}

module.exports = BuilderAgent;
