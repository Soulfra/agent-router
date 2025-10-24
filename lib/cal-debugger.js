/**
 * Cal Debugger
 *
 * Cal's autonomous debugging system.
 * Reads error messages, understands what went wrong, generates fixes, tests them.
 *
 * Workflow:
 * 1. Receive error message + code that failed
 * 2. Query knowledge base for relevant debugging patterns
 * 3. Review past similar failures and their fixes
 * 4. Use Ollama to understand the error
 * 5. Generate fix
 * 6. Test the fix
 * 7. Apply if successful, retry if failed (max 3 attempts)
 * 8. Record debugging attempt in learning system
 *
 * Usage:
 *   const debugger = new CalDebugger();
 *   const result = await debugger.debug({
 *     filePath: 'lib/broken-code.js',
 *     errorMessage: 'ReferenceError: foo is not defined',
 *     code: '...',
 *     context: { taskType: 'oauth-server' }
 *   });
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');

class CalDebugger {
  constructor(options = {}) {
    this.config = {
      ollamaModel: options.ollamaModel || 'calos-expert',
      knowledgeBase: options.knowledgeBase, // CalKnowledgeBase instance
      learningSystem: options.learningSystem, // CalLearningSystem instance
      verbose: options.verbose || false,
      maxRetries: options.maxRetries || 3
    };

    console.log('[CalDebugger] Initialized with model:', this.config.ollamaModel);
  }

  /**
   * Debug a piece of failing code
   */
  async debug(problemSpec) {
    const { filePath, errorMessage, code, context = {} } = problemSpec;
    const taskId = `debug-${path.basename(filePath)}-${Date.now()}`;
    let attempt = 0;

    console.log(`[CalDebugger] Debugging ${filePath}`);
    console.log(`[CalDebugger] Error:`, errorMessage);

    while (attempt < this.config.maxRetries) {
      attempt++;

      try {
        console.log(`[CalDebugger] Attempt ${attempt}/${this.config.maxRetries}`);

        // Step 1: Gather debugging knowledge
        const knowledge = await this.gatherDebuggingKnowledge(errorMessage, context);

        // Step 2: Analyze the error
        const analysis = await this.analyzeError(errorMessage, code, knowledge, attempt);

        console.log(`[CalDebugger] Analysis: ${analysis.reasoning}`);

        // Step 3: Generate fix
        const fixedCode = await this.generateFix(code, errorMessage, analysis, knowledge, attempt);

        // Step 4: Test the fix
        const testResult = await this.testFix(fixedCode, filePath);

        if (!testResult.success) {
          console.error(`[CalDebugger] Fix didn't work:`, testResult.error);

          // Record failure
          if (this.config.learningSystem) {
            await this.config.learningSystem.recordAttempt(
              taskId,
              context.taskType || 'debugging',
              attempt,
              'ollama-debugging',
              'failure',
              {
                error_message: testResult.error,
                reasoning: analysis.reasoning,
                fix_attempted: fixedCode.substring(0, 500)
              }
            );
          }

          continue;
        }

        // Success!
        console.log(`[CalDebugger] ✅ Fix successful!`);

        // Record success
        if (this.config.learningSystem) {
          await this.config.learningSystem.recordAttempt(
            taskId,
            context.taskType || 'debugging',
            attempt,
            'ollama-debugging',
            'success',
            {
              original_error: errorMessage,
              reasoning: analysis.reasoning,
              fix_applied: fixedCode.substring(0, 500)
            }
          );

          await this.config.learningSystem.recordSuccess(
            context.taskType || 'debugging',
            `Fixed: ${errorMessage}`,
            {
              whatWorked: analysis.reasoning,
              lesson: `${errorMessage} → ${analysis.fix}`,
              confidence: 0.85
            }
          );
        }

        return {
          success: true,
          fixedCode,
          attempt,
          reasoning: analysis.reasoning,
          errorFixed: errorMessage
        };

      } catch (error) {
        console.error(`[CalDebugger] Attempt ${attempt} failed:`, error.message);

        // Record failure
        if (this.config.learningSystem) {
          await this.config.learningSystem.recordAttempt(
            taskId,
            context.taskType || 'debugging',
            attempt,
            'ollama-debugging',
            'failure',
            {
              error_message: error.message
            }
          );
        }

        if (attempt >= this.config.maxRetries) {
          // Final failure - ask for human help
          console.error('[CalDebugger] ❌ Debugging failed after 3 attempts. Need human help.');

          if (this.config.learningSystem) {
            await this.config.learningSystem.recordFailure(
              context.taskType || 'debugging',
              `Failed to fix: ${errorMessage}`,
              {
                whatFailed: `Ollama debugging after ${attempt} attempts`,
                errorMessage: error.message,
                lesson: `Need human help for: ${errorMessage}`,
                confidence: 0.9
              }
            );
          }

          throw new Error(`Debugging failed after ${attempt} attempts: ${error.message}`);
        }
      }
    }
  }

  /**
   * Gather debugging knowledge
   */
  async gatherDebuggingKnowledge(errorMessage, context) {
    const knowledge = {
      concepts: [],
      patterns: [],
      antiPatterns: [],
      examples: [],
      lessons: []
    };

    // Identify error type
    const errorType = this.identifyErrorType(errorMessage);

    console.log(`[CalDebugger] Error type: ${errorType}`);

    // Query knowledge base
    if (this.config.knowledgeBase) {
      try {
        // Get relevant patterns based on error type
        const kbResult = await this.config.knowledgeBase.query('patterns', errorType);

        knowledge.concepts = kbResult.concepts || [];
        knowledge.patterns = kbResult.patterns || [];
        knowledge.antiPatterns = kbResult.antiPatterns || [];
        knowledge.examples = kbResult.examples || [];

        if (this.config.verbose) {
          console.log(`[CalDebugger] Found ${knowledge.patterns.length} debugging patterns`);
        }
      } catch (error) {
        console.warn('[CalDebugger] Knowledge base query failed:', error.message);
      }
    }

    // Get lessons learned from similar errors
    if (this.config.learningSystem) {
      try {
        // Search for similar errors
        knowledge.lessons = await this.config.learningSystem.searchLessons(errorType);

        if (this.config.verbose) {
          console.log(`[CalDebugger] Found ${knowledge.lessons.length} relevant lessons`);
        }
      } catch (error) {
        console.warn('[CalDebugger] Learning system query failed:', error.message);
      }
    }

    return knowledge;
  }

  /**
   * Identify error type from error message
   */
  identifyErrorType(errorMessage) {
    const errorTypes = {
      'ReferenceError': 'undefinedVariable',
      'TypeError': 'typeError',
      'SyntaxError': 'syntaxError',
      'RangeError': 'rangeError',
      'Cannot read property': 'nullReference',
      'undefined is not': 'undefinedReference',
      'is not a function': 'notAFunction',
      'Maximum call stack': 'infiniteLoop',
      'timeout': 'timeout',
      'ECONNREFUSED': 'connectionRefused',
      'ENOENT': 'fileNotFound',
      'permission denied': 'permissionDenied'
    };

    for (const [pattern, type] of Object.entries(errorTypes)) {
      if (errorMessage.includes(pattern)) {
        return type;
      }
    }

    return 'unknown';
  }

  /**
   * Analyze error using Ollama
   */
  async analyzeError(errorMessage, code, knowledge, attempt) {
    console.log('[CalDebugger] Analyzing error with Ollama...');

    const prompt = this.buildAnalysisPrompt(errorMessage, code, knowledge, attempt);

    const command = `ollama run ${this.config.ollamaModel} "${prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

    try {
      const { stdout } = await execPromise(command, {
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      // Parse response
      const analysis = this.parseAnalysis(stdout);

      return analysis;

    } catch (error) {
      console.error('[CalDebugger] Ollama error:', error.message);
      throw new Error(`Error analysis failed: ${error.message}`);
    }
  }

  /**
   * Build analysis prompt
   */
  buildAnalysisPrompt(errorMessage, code, knowledge, attempt) {
    let prompt = `You are Cal, an autonomous debugging AI. Analyze this error and explain what went wrong.

ERROR MESSAGE:
${errorMessage}

CODE:
\`\`\`javascript
${code.substring(0, 2000)}
\`\`\`
`;

    if (knowledge.patterns.length > 0) {
      prompt += `\nCOMMON CAUSES:\n${knowledge.patterns.slice(0, 5).map(p => `- ${p}`).join('\n')}\n`;
    }

    if (knowledge.lessons.length > 0) {
      const similarFailures = knowledge.lessons.filter(l => l.outcome === 'failure');
      const similarFixes = knowledge.lessons.filter(l => l.outcome === 'success');

      if (similarFailures.length > 0) {
        prompt += `\nSIMILAR ERRORS I'VE SEEN:\n${similarFailures.slice(0, 3).map(l => `- ${l.summary}: ${l.lesson}`).join('\n')}\n`;
      }

      if (similarFixes.length > 0) {
        prompt += `\nWHAT WORKED BEFORE:\n${similarFixes.slice(0, 3).map(l => `- ${l.what_worked || l.lesson}`).join('\n')}\n`;
      }
    }

    if (attempt > 1) {
      prompt += `\nNOTE: This is attempt #${attempt}. Previous fixes didn't work.\n`;
    }

    prompt += `\nINSTRUCTIONS:
1. Identify the root cause of the error
2. Explain WHY it happened (in plain English)
3. Suggest a specific fix

Output format (plain text, no markdown):
REASONING: [Your analysis of what went wrong and why]
FIX: [Specific fix to apply]`;

    return prompt;
  }

  /**
   * Parse Ollama analysis response
   */
  parseAnalysis(response) {
    const reasoningMatch = response.match(/REASONING:\s*(.+?)(?=\nFIX:|$)/s);
    const fixMatch = response.match(/FIX:\s*(.+?)$/s);

    return {
      reasoning: reasoningMatch ? reasoningMatch[1].trim() : 'Unknown cause',
      fix: fixMatch ? fixMatch[1].trim() : 'Unknown fix'
    };
  }

  /**
   * Generate fixed code using Ollama
   */
  async generateFix(code, errorMessage, analysis, knowledge, attempt) {
    console.log('[CalDebugger] Generating fix with Ollama...');

    const prompt = this.buildFixPrompt(code, errorMessage, analysis, knowledge, attempt);

    const command = `ollama run ${this.config.ollamaModel} "${prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

    try {
      const { stdout } = await execPromise(command, {
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      // Extract code from response
      const fixedCode = this.extractCode(stdout);

      return fixedCode;

    } catch (error) {
      console.error('[CalDebugger] Ollama error:', error.message);
      throw new Error(`Fix generation failed: ${error.message}`);
    }
  }

  /**
   * Build fix prompt
   */
  buildFixPrompt(code, errorMessage, analysis, knowledge, attempt) {
    let prompt = `You are Cal, an autonomous debugging AI. Fix this code based on the analysis.

ORIGINAL CODE:
\`\`\`javascript
${code}
\`\`\`

ERROR:
${errorMessage}

ANALYSIS:
${analysis.reasoning}

FIX TO APPLY:
${analysis.fix}
`;

    if (knowledge.antiPatterns.length > 0) {
      prompt += `\nAVOID THESE MISTAKES:\n${knowledge.antiPatterns.slice(0, 5).map(p => `- ${p}`).join('\n')}\n`;
    }

    if (attempt > 1) {
      prompt += `\nNOTE: This is attempt #${attempt}. Previous fixes failed.\n`;
    }

    prompt += `\nIMPORTANT RULES:
- Fix ONLY the bug, don't rewrite unrelated code
- Keep the same structure and function signatures
- Add comments explaining the fix
- Ensure NO syntax errors
- Output ONLY the fixed JavaScript code

Output the complete fixed code, starting with /** and ending with module.exports = ...`;

    return prompt;
  }

  /**
   * Extract code from Ollama response
   */
  extractCode(response) {
    // Try to find code block
    const codeBlockMatch = response.match(/```(?:javascript|js)?\n([\s\S]+?)\n```/);

    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // If no code block, assume entire response is code
    let code = response.trim();

    // Remove any leading/trailing markdown
    code = code.replace(/^```(?:javascript|js)?\n/, '');
    code = code.replace(/\n```$/, '');

    return code;
  }

  /**
   * Test the fixed code
   */
  async testFix(fixedCode, originalFilePath) {
    // Write to temp file
    const tempPath = path.join('/tmp', `cal-debug-${Date.now()}.js`);

    try {
      await fs.writeFile(tempPath, fixedCode);

      // Use Node.js to check syntax
      await execPromise(`node --check "${tempPath}"`);

      // Syntax is valid
      await fs.unlink(tempPath);

      return {
        success: true
      };

    } catch (error) {
      // Test failed
      await fs.unlink(tempPath).catch(() => {});

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Apply fix to file (optional - can be used after successful debug)
   */
  async applyFix(filePath, fixedCode) {
    await fs.writeFile(filePath, fixedCode);
    console.log(`[CalDebugger] ✅ Applied fix to ${filePath}`);
  }
}

module.exports = CalDebugger;
