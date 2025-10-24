/**
 * Cal Code Writer
 *
 * Cal writes code autonomously using Ollama.
 * Queries knowledge base first, applies lessons learned, generates code, validates syntax.
 *
 * Workflow:
 * 1. Receive task spec
 * 2. Query knowledge base for relevant patterns
 * 3. Review past lessons on similar tasks
 * 4. Generate code using Ollama
 * 5. Validate syntax
 * 6. Write to file
 * 7. Record attempt in learning system
 *
 * Usage:
 *   const writer = new CalCodeWriter();
 *   await writer.writeFile('oauth-server.js', {
 *     type: 'oauth',
 *     description: 'OAuth redirect server for Google/GitHub',
 *     features: ['authorization_code', 'token_exchange', 'callback_handling']
 *   });
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');

class CalCodeWriter {
  constructor(options = {}) {
    this.config = {
      ollamaModel: options.ollamaModel || 'calos-expert',
      knowledgeBase: options.knowledgeBase, // CalKnowledgeBase instance
      learningSystem: options.learningSystem, // CalLearningSystem instance
      verbose: options.verbose || false,
      maxRetries: options.maxRetries || 3
    };

    console.log('[CalCodeWriter] Initialized with model:', this.config.ollamaModel);
  }

  /**
   * Write a file based on spec
   */
  async writeFile(filePath, spec) {
    const taskId = `write-${path.basename(filePath)}-${Date.now()}`;
    let attempt = 0;

    console.log(`[CalCodeWriter] Task: Write ${filePath}`);
    console.log(`[CalCodeWriter] Spec:`, spec);

    while (attempt < this.config.maxRetries) {
      attempt++;

      try {
        console.log(`[CalCodeWriter] Attempt ${attempt}/${this.config.maxRetries}`);

        // Step 1: Gather knowledge
        const knowledge = await this.gatherKnowledge(spec);

        // Step 2: Generate code
        const code = await this.generateCode(filePath, spec, knowledge, attempt);

        // Step 3: Validate syntax
        const validationResult = await this.validateSyntax(code, filePath);

        if (!validationResult.valid) {
          console.error(`[CalCodeWriter] Syntax validation failed:`, validationResult.errors);

          // Record failure and retry
          if (this.config.learningSystem) {
            await this.config.learningSystem.recordAttempt(
              taskId,
              spec.type,
              attempt,
              'ollama-generation',
              'failure',
              {
                error_message: validationResult.errors.join('; '),
                code_generated: code.substring(0, 500)
              }
            );
          }

          continue;
        }

        // Step 4: Write file
        await fs.writeFile(filePath, code);

        console.log(`[CalCodeWriter] ✅ Successfully wrote ${filePath}`);

        // Record success
        if (this.config.learningSystem) {
          await this.config.learningSystem.recordAttempt(
            taskId,
            spec.type,
            attempt,
            'ollama-generation',
            'success',
            {
              code_generated: code.substring(0, 500),
              tests_passed: 1
            }
          );

          await this.config.learningSystem.recordSuccess(
            spec.type,
            `Successfully wrote ${path.basename(filePath)}`,
            {
              whatWorked: `Used Ollama model ${this.config.ollamaModel} with knowledge base`,
              lesson: `Pattern works for ${spec.type} files`,
              confidence: 0.9
            }
          );
        }

        return {
          success: true,
          filePath,
          attempt,
          code
        };

      } catch (error) {
        console.error(`[CalCodeWriter] Attempt ${attempt} failed:`, error.message);

        // Record failure
        if (this.config.learningSystem) {
          await this.config.learningSystem.recordAttempt(
            taskId,
            spec.type,
            attempt,
            'ollama-generation',
            'failure',
            {
              error_message: error.message
            }
          );
        }

        if (attempt >= this.config.maxRetries) {
          // Final failure
          if (this.config.learningSystem) {
            await this.config.learningSystem.recordFailure(
              spec.type,
              `Failed to write ${path.basename(filePath)} after ${attempt} attempts`,
              {
                whatFailed: `Ollama generation or syntax validation`,
                errorMessage: error.message,
                lesson: `Need better approach for ${spec.type} files`,
                confidence: 0.8
              }
            );
          }

          throw error;
        }
      }
    }
  }

  /**
   * Gather knowledge before writing code
   */
  async gatherKnowledge(spec) {
    const knowledge = {
      concepts: [],
      patterns: [],
      antiPatterns: [],
      examples: [],
      lessons: []
    };

    // Query knowledge base
    if (this.config.knowledgeBase) {
      try {
        const kbResult = await this.config.knowledgeBase.query(spec.type);

        knowledge.concepts = kbResult.concepts || [];
        knowledge.patterns = kbResult.patterns || [];
        knowledge.antiPatterns = kbResult.antiPatterns || [];
        knowledge.examples = kbResult.examples || [];

        if (this.config.verbose) {
          console.log(`[CalCodeWriter] Found ${knowledge.patterns.length} patterns, ${knowledge.antiPatterns.length} anti-patterns`);
        }
      } catch (error) {
        console.warn('[CalCodeWriter] Knowledge base query failed:', error.message);
      }
    }

    // Get lessons learned
    if (this.config.learningSystem) {
      try {
        knowledge.lessons = await this.config.learningSystem.getRelevantLessons(spec.type, 5);

        if (this.config.verbose) {
          console.log(`[CalCodeWriter] Found ${knowledge.lessons.length} relevant lessons`);
        }
      } catch (error) {
        console.warn('[CalCodeWriter] Learning system query failed:', error.message);
      }
    }

    return knowledge;
  }

  /**
   * Generate code using Ollama
   */
  async generateCode(filePath, spec, knowledge, attempt) {
    console.log('[CalCodeWriter] Generating code using Ollama...');

    // Build prompt
    const prompt = this.buildPrompt(filePath, spec, knowledge, attempt);

    // Call Ollama
    const command = `ollama run ${this.config.ollamaModel} "${prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

    try {
      const { stdout } = await execPromise(command, {
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      // Extract code from response
      const code = this.extractCode(stdout);

      return code;

    } catch (error) {
      console.error('[CalCodeWriter] Ollama error:', error.message);
      throw new Error(`Ollama generation failed: ${error.message}`);
    }
  }

  /**
   * Build prompt for Ollama
   */
  buildPrompt(filePath, spec, knowledge, attempt) {
    let prompt = `You are Cal, an autonomous coding AI. Write a complete, production-ready Node.js file.

FILE: ${filePath}
TYPE: ${spec.type}
DESCRIPTION: ${spec.description}
`;

    if (spec.features && spec.features.length > 0) {
      prompt += `\nFEATURES REQUIRED:\n${spec.features.map(f => `- ${f}`).join('\n')}\n`;
    }

    // Add knowledge
    if (knowledge.patterns.length > 0) {
      prompt += `\nBEST PRACTICES (must follow):\n${knowledge.patterns.slice(0, 5).map(p => `- ${p}`).join('\n')}\n`;
    }

    if (knowledge.antiPatterns.length > 0) {
      prompt += `\nAVOID THESE MISTAKES:\n${knowledge.antiPatterns.slice(0, 5).map(p => `- ${p}`).join('\n')}\n`;
    }

    // Add lessons learned
    if (knowledge.lessons.length > 0) {
      const successLessons = knowledge.lessons.filter(l => l.outcome === 'success');
      const failureLessons = knowledge.lessons.filter(l => l.outcome === 'failure');

      if (successLessons.length > 0) {
        prompt += `\nWHAT WORKED BEFORE:\n${successLessons.slice(0, 3).map(l => `- ${l.lesson}`).join('\n')}\n`;
      }

      if (failureLessons.length > 0) {
        prompt += `\nWHAT FAILED BEFORE (don't repeat):\n${failureLessons.slice(0, 3).map(l => `- ${l.lesson}`).join('\n')}\n`;
      }
    }

    // Add examples if available
    if (knowledge.examples.length > 0) {
      const example = knowledge.examples[0];
      prompt += `\nEXAMPLE PATTERN:\n${example.title}\n\`\`\`javascript\n${example.code}\n\`\`\`\n`;
    }

    // Add retry context
    if (attempt > 1) {
      prompt += `\nNOTE: This is attempt #${attempt}. Previous attempts had issues. Double-check syntax and logic.\n`;
    }

    prompt += `\nIMPORTANT RULES:
- Write COMPLETE, working code (no placeholders like "// TODO" or "// implement this")
- Include proper error handling (try-catch blocks)
- Add JSDoc comments for all functions
- Use async/await for async operations
- Include 'use strict' if needed
- Add module.exports at the end
- NO syntax errors
- NO undefined variables
- Code must be ready to run immediately

Output ONLY the JavaScript code, nothing else. Start with /** and end with module.exports = ...`;

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
    // But skip any markdown formatting
    let code = response.trim();

    // Remove any leading/trailing markdown
    code = code.replace(/^```(?:javascript|js)?\n/, '');
    code = code.replace(/\n```$/, '');

    return code;
  }

  /**
   * Validate JavaScript syntax
   */
  async validateSyntax(code, filePath) {
    // Write to temp file
    const tempPath = path.join('/tmp', `cal-validate-${Date.now()}.js`);

    try {
      await fs.writeFile(tempPath, code);

      // Use Node.js to check syntax
      await execPromise(`node --check "${tempPath}"`);

      // Syntax is valid
      await fs.unlink(tempPath);

      return {
        valid: true,
        errors: []
      };

    } catch (error) {
      // Syntax error
      await fs.unlink(tempPath).catch(() => {});

      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Get Cal's code writing stats
   */
  async getStats() {
    if (!this.config.learningSystem) {
      return { error: 'Learning system not configured' };
    }

    const stats = await this.config.learningSystem.getStats();

    return {
      totalAttempts: stats.total_lessons,
      successRate: stats.success_rate,
      avgConfidence: stats.avg_confidence,
      uniqueTasks: stats.unique_tasks
    };
  }
}

module.exports = CalCodeWriter;
