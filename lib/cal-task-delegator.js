/**
 * Cal Task Delegator
 *
 * Breaks down complex tasks into smaller, manageable steps.
 * Cal uses this to plan work before starting, avoiding getting stuck.
 *
 * Workflow:
 * 1. Receive high-level task description
 * 2. Query knowledge base for similar task patterns
 * 3. Review past attempts at similar tasks
 * 4. Use Ollama to break task into steps
 * 5. Prioritize steps (dependencies, complexity)
 * 6. Return step-by-step plan
 *
 * Usage:
 *   const delegator = new CalTaskDelegator();
 *   const plan = await delegator.breakDown({
 *     description: 'Build OAuth server for Google and GitHub',
 *     type: 'oauth-server',
 *     constraints: ['Must use localhost:3000', 'Save tokens to .env']
 *   });
 *   // Returns: [{ step: 1, task: 'Create server', ... }, ...]
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class CalTaskDelegator {
  constructor(options = {}) {
    this.config = {
      ollamaModel: options.ollamaModel || 'calos-expert',
      knowledgeBase: options.knowledgeBase, // CalKnowledgeBase instance
      learningSystem: options.learningSystem, // CalLearningSystem instance
      verbose: options.verbose || false
    };

    console.log('[CalTaskDelegator] Initialized with model:', this.config.ollamaModel);
  }

  /**
   * Break down a task into steps
   */
  async breakDown(taskSpec) {
    const { description, type, constraints = [], features = [] } = taskSpec;

    console.log(`[CalTaskDelegator] Breaking down task: ${description}`);

    try {
      // Step 1: Gather knowledge about similar tasks
      const knowledge = await this.gatherTaskKnowledge(type);

      // Step 2: Review past attempts
      const pastAttempts = await this.reviewPastAttempts(type);

      // Step 3: Generate task breakdown using Ollama
      const steps = await this.generateTaskBreakdown(
        description,
        type,
        constraints,
        features,
        knowledge,
        pastAttempts
      );

      // Step 4: Prioritize steps (detect dependencies)
      const prioritizedSteps = this.prioritizeSteps(steps);

      console.log(`[CalTaskDelegator] ✅ Task broken into ${prioritizedSteps.length} steps`);

      if (this.config.verbose) {
        prioritizedSteps.forEach((step, i) => {
          console.log(`  ${i + 1}. ${step.task} (priority: ${step.priority})`);
        });
      }

      return {
        taskDescription: description,
        taskType: type,
        totalSteps: prioritizedSteps.length,
        steps: prioritizedSteps,
        estimatedComplexity: this.estimateComplexity(prioritizedSteps),
        suggestedApproach: this.suggestApproach(prioritizedSteps, knowledge)
      };

    } catch (error) {
      console.error('[CalTaskDelegator] Task breakdown failed:', error.message);
      throw error;
    }
  }

  /**
   * Gather knowledge about similar tasks
   */
  async gatherTaskKnowledge(taskType) {
    const knowledge = {
      concepts: [],
      patterns: [],
      antiPatterns: [],
      examples: []
    };

    if (this.config.knowledgeBase) {
      try {
        // Query knowledge base for task type
        const kbResult = await this.config.knowledgeBase.search(taskType);

        // Group results
        kbResult.forEach(item => {
          if (item.type === 'concept') knowledge.concepts.push(item.content);
          if (item.type === 'pattern') knowledge.patterns.push(item.content);
          if (item.type === 'antiPattern') knowledge.antiPatterns.push(item.content);
          if (item.type === 'example') knowledge.examples.push(JSON.parse(item.content));
        });

        if (this.config.verbose) {
          console.log(`[CalTaskDelegator] Found ${kbResult.length} relevant knowledge items`);
        }
      } catch (error) {
        console.warn('[CalTaskDelegator] Knowledge base query failed:', error.message);
      }
    }

    return knowledge;
  }

  /**
   * Review past attempts at similar tasks
   */
  async reviewPastAttempts(taskType) {
    if (!this.config.learningSystem) {
      return { successes: [], failures: [] };
    }

    try {
      const lessons = await this.config.learningSystem.getRelevantLessons(taskType, 10);

      const successes = lessons.filter(l => l.outcome === 'success');
      const failures = lessons.filter(l => l.outcome === 'failure');

      if (this.config.verbose) {
        console.log(`[CalTaskDelegator] Past attempts: ${successes.length} successes, ${failures.length} failures`);
      }

      return { successes, failures };

    } catch (error) {
      console.warn('[CalTaskDelegator] Learning system query failed:', error.message);
      return { successes: [], failures: [] };
    }
  }

  /**
   * Generate task breakdown using Ollama
   */
  async generateTaskBreakdown(description, type, constraints, features, knowledge, pastAttempts) {
    console.log('[CalTaskDelegator] Generating task breakdown with Ollama...');

    const prompt = this.buildBreakdownPrompt(
      description,
      type,
      constraints,
      features,
      knowledge,
      pastAttempts
    );

    const command = `ollama run ${this.config.ollamaModel} "${prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

    try {
      const { stdout } = await execPromise(command, {
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      // Parse response
      const steps = this.parseSteps(stdout);

      return steps;

    } catch (error) {
      console.error('[CalTaskDelegator] Ollama error:', error.message);
      throw new Error(`Task breakdown failed: ${error.message}`);
    }
  }

  /**
   * Build breakdown prompt
   */
  buildBreakdownPrompt(description, type, constraints, features, knowledge, pastAttempts) {
    let prompt = `You are Cal, an autonomous task planning AI. Break down this task into clear, actionable steps.

TASK: ${description}
TYPE: ${type}
`;

    if (features.length > 0) {
      prompt += `\nFEATURES REQUIRED:\n${features.map(f => `- ${f}`).join('\n')}\n`;
    }

    if (constraints.length > 0) {
      prompt += `\nCONSTRAINTS:\n${constraints.map(c => `- ${c}`).join('\n')}\n`;
    }

    if (knowledge.patterns.length > 0) {
      prompt += `\nBEST PRACTICES TO FOLLOW:\n${knowledge.patterns.slice(0, 5).map(p => `- ${p}`).join('\n')}\n`;
    }

    if (knowledge.antiPatterns.length > 0) {
      prompt += `\nAVOID THESE MISTAKES:\n${knowledge.antiPatterns.slice(0, 5).map(p => `- ${p}`).join('\n')}\n`;
    }

    if (pastAttempts.successes.length > 0) {
      prompt += `\nWHAT WORKED BEFORE:\n${pastAttempts.successes.slice(0, 3).map(s => `- ${s.summary}: ${s.what_worked || s.lesson}`).join('\n')}\n`;
    }

    if (pastAttempts.failures.length > 0) {
      prompt += `\nWHAT FAILED BEFORE (don't repeat):\n${pastAttempts.failures.slice(0, 3).map(f => `- ${f.summary}: ${f.what_failed || f.lesson}`).join('\n')}\n`;
    }

    if (knowledge.examples.length > 0) {
      const example = knowledge.examples[0];
      prompt += `\nEXAMPLE APPROACH:\n${example.title}\n`;
    }

    prompt += `\nINSTRUCTIONS:
1. Break the task into 5-10 clear steps
2. Each step should be specific and actionable
3. Order steps logically (dependencies first)
4. Include testing/validation steps
5. Estimate complexity (low/medium/high)

Output format (plain text, one step per line):
STEP 1: [Action to take] | COMPLEXITY: [low/medium/high] | DEPENDS_ON: [step numbers or none]
STEP 2: [Action to take] | COMPLEXITY: [low/medium/high] | DEPENDS_ON: [step numbers or none]
...

Example:
STEP 1: Create Express server with port 3000 | COMPLEXITY: low | DEPENDS_ON: none
STEP 2: Set up OAuth configuration for Google | COMPLEXITY: medium | DEPENDS_ON: 1
STEP 3: Implement callback handler for token exchange | COMPLEXITY: high | DEPENDS_ON: 1,2

Now break down the task above:`;

    return prompt;
  }

  /**
   * Parse steps from Ollama response
   */
  parseSteps(response) {
    const steps = [];
    const lines = response.split('\n');

    for (const line of lines) {
      // Match: STEP N: [task] | COMPLEXITY: [level] | DEPENDS_ON: [deps]
      const match = line.match(/STEP\s+(\d+):\s*(.+?)\s*\|\s*COMPLEXITY:\s*(\w+)\s*\|\s*DEPENDS_ON:\s*(.+)/i);

      if (match) {
        const [, stepNum, task, complexity, dependsOn] = match;

        steps.push({
          step: parseInt(stepNum),
          task: task.trim(),
          complexity: complexity.toLowerCase(),
          dependsOn: dependsOn.toLowerCase() === 'none' ? [] : dependsOn.split(',').map(d => parseInt(d.trim())),
          priority: 0, // Will be set by prioritizeSteps()
          status: 'pending'
        });
      }
    }

    // Fallback: if parsing failed, return generic steps
    if (steps.length === 0) {
      console.warn('[CalTaskDelegator] Failed to parse steps, returning generic breakdown');
      return [
        { step: 1, task: 'Set up project structure', complexity: 'low', dependsOn: [], priority: 1, status: 'pending' },
        { step: 2, task: 'Implement core functionality', complexity: 'high', dependsOn: [1], priority: 2, status: 'pending' },
        { step: 3, task: 'Add error handling', complexity: 'medium', dependsOn: [2], priority: 3, status: 'pending' },
        { step: 4, task: 'Test implementation', complexity: 'medium', dependsOn: [3], priority: 4, status: 'pending' }
      ];
    }

    return steps;
  }

  /**
   * Prioritize steps based on dependencies
   */
  prioritizeSteps(steps) {
    // Topological sort: steps with no dependencies go first
    const sorted = [];
    const completed = new Set();

    while (sorted.length < steps.length) {
      let foundStep = false;

      for (const step of steps) {
        if (sorted.includes(step)) continue;

        // Check if all dependencies are completed
        const allDepsCompleted = step.dependsOn.every(dep => completed.has(dep));

        if (allDepsCompleted) {
          step.priority = sorted.length + 1;
          sorted.push(step);
          completed.add(step.step);
          foundStep = true;
        }
      }

      if (!foundStep && sorted.length < steps.length) {
        // Circular dependency or invalid deps - just add remaining steps
        for (const step of steps) {
          if (!sorted.includes(step)) {
            step.priority = sorted.length + 1;
            sorted.push(step);
          }
        }
        break;
      }
    }

    return sorted;
  }

  /**
   * Estimate overall task complexity
   */
  estimateComplexity(steps) {
    const complexityScores = {
      low: 1,
      medium: 2,
      high: 3
    };

    const totalScore = steps.reduce((sum, step) => {
      return sum + (complexityScores[step.complexity] || 2);
    }, 0);

    const avgScore = totalScore / steps.length;

    if (avgScore < 1.5) return 'low';
    if (avgScore < 2.5) return 'medium';
    return 'high';
  }

  /**
   * Suggest approach based on steps and knowledge
   */
  suggestApproach(steps, knowledge) {
    const approach = [];

    // General advice
    if (steps.length > 8) {
      approach.push('This is a complex task. Consider splitting into multiple sessions.');
    }

    const highComplexitySteps = steps.filter(s => s.complexity === 'high');
    if (highComplexitySteps.length > 0) {
      approach.push(`Focus extra attention on: ${highComplexitySteps.map(s => `Step ${s.step}`).join(', ')}`);
    }

    // Add knowledge-based advice
    if (knowledge.patterns.length > 0) {
      approach.push(`Follow patterns: ${knowledge.patterns[0]}`);
    }

    if (knowledge.antiPatterns.length > 0) {
      approach.push(`Avoid: ${knowledge.antiPatterns[0]}`);
    }

    return approach.join(' ');
  }

  /**
   * Update step status (for tracking progress)
   */
  updateStepStatus(plan, stepNumber, status) {
    const step = plan.steps.find(s => s.step === stepNumber);
    if (step) {
      step.status = status;
      console.log(`[CalTaskDelegator] Step ${stepNumber} → ${status}`);
    }
    return plan;
  }

  /**
   * Get next pending step
   */
  getNextStep(plan) {
    return plan.steps.find(s => s.status === 'pending');
  }

  /**
   * Get progress summary
   */
  getProgress(plan) {
    const completed = plan.steps.filter(s => s.status === 'completed').length;
    const total = plan.steps.length;
    const percentage = Math.round((completed / total) * 100);

    return {
      completed,
      total,
      percentage,
      remaining: total - completed
    };
  }
}

module.exports = CalTaskDelegator;
