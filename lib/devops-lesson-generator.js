/**
 * DevOps Lesson Generator
 *
 * Generates teaching content from Cal's actual failures and debugging process.
 * Turns real-world DevOps problems into lessons for calriven.com.
 *
 * Takes failures from cal_failures database and generates:
 * - Lesson markdown with problem → solution → learning
 * - Code examples from actual fixes
 * - Common pitfalls section
 * - Related skills (SQL, Docker, CI/CD, etc.)
 *
 * Usage:
 *   const generator = new DevOpsLessonGenerator({ db });
 *   const lesson = await generator.generateFromFailures({
 *     errorType: 'command-execution',
 *     failures: [...]
 *   });
 */

class DevOpsLessonGenerator {
  constructor(options = {}) {
    this.db = options.db;
  }

  /**
   * Generate a lesson from a group of failures
   */
  async generateFromFailures(options = {}) {
    const { errorType, failures } = options;

    // Analyze failures to extract patterns
    const analysis = this.analyzeFailures(failures);

    // Generate lesson content
    const lesson = {
      id: `devops-${errorType}-${Date.now()}`,
      title: this.generateTitle(errorType, analysis),
      errorType,
      themes: this.extractThemes(errorType),
      suggestedBrand: this.suggestBrand(errorType),
      difficulty: this.calculateDifficulty(failures),
      xp: this.calculateXP(failures),
      timeEstimate: this.estimateTime(failures),
      content: this.generateMarkdown(errorType, analysis, failures),
      metadata: {
        generatedAt: new Date().toISOString(),
        failureCount: failures.length,
        lessonsAffected: this.getLessonsAffected(failures),
        relatedSkills: this.getRelatedSkills(errorType)
      }
    };

    return lesson;
  }

  /**
   * Analyze failures to find patterns
   */
  analyzeFailures(failures) {
    const analysis = {
      commonError: null,
      affectedLessons: new Set(),
      firstOccurrence: null,
      lastOccurrence: null,
      totalOccurrences: 0,
      rootCause: null,
      solution: null
    };

    failures.forEach(failure => {
      if (!analysis.commonError) {
        analysis.commonError = failure.error;
      }

      if (failure.lesson_id) {
        analysis.affectedLessons.add(failure.lesson_id);
      }

      if (!analysis.firstOccurrence || new Date(failure.first_seen) < new Date(analysis.firstOccurrence)) {
        analysis.firstOccurrence = failure.first_seen;
      }

      if (!analysis.lastOccurrence || new Date(failure.last_seen) > new Date(analysis.lastOccurrence)) {
        analysis.lastOccurrence = failure.last_seen;
      }

      analysis.totalOccurrences += failure.count;
    });

    // Determine root cause and solution based on error type
    const insights = this.determineInsights(failures[0].error_type, analysis.commonError);
    analysis.rootCause = insights.rootCause;
    analysis.solution = insights.solution;

    return analysis;
  }

  /**
   * Determine root cause and solution
   */
  determineInsights(errorType, errorMessage) {
    const insights = {
      rootCause: '',
      solution: ''
    };

    if (errorType === 'command-execution') {
      insights.rootCause = 'Node.js exec() was called with an undefined command string';
      insights.solution = 'Validate command strings before passing to exec(), use TypeScript for type safety, or add runtime checks';
    } else if (errorType === 'ssl-connection') {
      insights.rootCause = 'PostgreSQL connection attempted over SSL when server doesn\'t support it';
      insights.solution = 'Add "?sslmode=disable" to DATABASE_URL or configure PostgreSQL to support SSL';
    } else if (errorType === 'css-loading') {
      insights.rootCause = 'CSS files not loading due to incorrect paths or MIME types';
      insights.solution = 'Use absolute paths for CSS, configure server to serve correct MIME types';
    } else if (errorType === 'file-processing') {
      insights.rootCause = 'File operations failing due to permissions or missing files';
      insights.solution = 'Check file exists before processing, handle ENOENT errors gracefully';
    } else {
      insights.rootCause = 'Unknown error type - needs manual investigation';
      insights.solution = 'Review error logs and add proper error handling';
    }

    return insights;
  }

  /**
   * Generate lesson title
   */
  generateTitle(errorType, analysis) {
    const titles = {
      'command-execution': `Debugging Command Execution Errors in Node.js`,
      'ssl-connection': `Fixing PostgreSQL SSL Connection Issues`,
      'css-loading': `Troubleshooting CSS Loading in Production`,
      'file-processing': `Handling File Operations Safely in Node.js`,
      'undefined-value': `Preventing Undefined Value Errors`,
      'timeout': `Debugging and Fixing Timeout Errors`
    };

    return titles[errorType] || `Debugging ${errorType} Errors`;
  }

  /**
   * Extract themes for brand routing
   */
  extractThemes(errorType) {
    const themeMap = {
      'command-execution': ['nodejs', 'devops', 'debugging', 'process', 'shell'],
      'ssl-connection': ['database', 'postgresql', 'ssl', 'security', 'devops'],
      'css-loading': ['frontend', 'css', 'deployment', 'web', 'debugging'],
      'file-processing': ['nodejs', 'filesystem', 'errors', 'io', 'debugging'],
      'undefined-value': ['javascript', 'typescript', 'type-safety', 'debugging'],
      'timeout': ['performance', 'async', 'debugging', 'nodejs']
    };

    return themeMap[errorType] || ['debugging', 'devops'];
  }

  /**
   * Suggest brand for content
   */
  suggestBrand(errorType) {
    const brandMap = {
      'command-execution': 'calriven', // DevOps content
      'ssl-connection': 'soulfra',     // Security/auth
      'css-loading': 'roughsparks',    // Design/frontend
      'file-processing': 'calriven',   // Technical
      'undefined-value': 'calriven',   // Code quality
      'timeout': 'calriven'            // Performance
    };

    return brandMap[errorType] || 'calriven';
  }

  /**
   * Calculate difficulty
   */
  calculateDifficulty(failures) {
    const totalFailures = failures.reduce((sum, f) => sum + f.count, 0);
    if (totalFailures >= 10) return 'advanced';
    if (totalFailures >= 5) return 'intermediate';
    return 'beginner';
  }

  /**
   * Calculate XP reward
   */
  calculateXP(failures) {
    const baseXP = 100;
    const failureCount = failures.reduce((sum, f) => sum + f.count, 0);
    return baseXP + (failureCount * 10);
  }

  /**
   * Estimate time to complete
   */
  estimateTime(failures) {
    const minutes = 20 + (failures.length * 5);
    return `${minutes} minutes`;
  }

  /**
   * Get affected lessons
   */
  getLessonsAffected(failures) {
    return [...new Set(failures.map(f => f.lesson_id).filter(Boolean))];
  }

  /**
   * Get related DevOps skills
   */
  getRelatedSkills(errorType) {
    const skillMap = {
      'command-execution': ['Node.js', 'Shell scripting', 'Process management', 'Error handling'],
      'ssl-connection': ['PostgreSQL', 'SSL/TLS', 'Database administration', 'Security'],
      'css-loading': ['HTTP servers', 'MIME types', 'Static assets', 'CDN'],
      'file-processing': ['File I/O', 'Error handling', 'Permissions', 'Node.js fs module'],
      'undefined-value': ['TypeScript', 'Type safety', 'Runtime validation', 'Defensive programming'],
      'timeout': ['Async programming', 'Performance', 'Monitoring', 'Debugging']
    };

    return skillMap[errorType] || ['Debugging', 'DevOps'];
  }

  /**
   * Generate markdown content
   */
  generateMarkdown(errorType, analysis, failures) {
    const markdown = `# ${this.generateTitle(errorType, analysis)}

**What Happened:** Cal encountered ${analysis.totalOccurrences} instances of this error across ${analysis.affectedLessons.size} lessons.

**Error Type:** \`${errorType}\`

## The Problem

Cal was working on lessons when this error appeared:

\`\`\`
${analysis.commonError}
\`\`\`

**Affected lessons:**
${Array.from(analysis.affectedLessons).map(lesson => `- ${lesson}`).join('\n')}

**Timeline:**
- First seen: ${new Date(analysis.firstOccurrence).toLocaleString()}
- Last seen: ${new Date(analysis.lastOccurrence).toLocaleString()}
- Total occurrences: ${analysis.totalOccurrences}

## Root Cause

${analysis.rootCause}

### Why This Happens

This type of error commonly occurs when:
1. Data validation is missing
2. Type checking isn't enforced
3. Error handling is insufficient
4. Dependencies aren't properly initialized

## The Solution

${analysis.solution}

### Implementation Example

\`\`\`javascript
// ❌ Before (causes error)
const { exec } = require('child_process');
const command = config.command; // Could be undefined
exec(command, callback); // Crashes if undefined

// ✅ After (safe)
const { exec } = require('child_process');
const command = config.command;

if (!command || typeof command !== 'string') {
  throw new Error('Command must be a non-empty string');
}

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error('Command failed:', error);
    return;
  }
  console.log(stdout);
});
\`\`\`

## Common Pitfalls

1. **Assuming data exists** - Always validate inputs
2. **Missing error handlers** - Use try/catch and error callbacks
3. **No type checking** - Consider TypeScript for type safety
4. **Silent failures** - Log errors for debugging

## Related DevOps Skills

${this.getRelatedSkills(errorType).map(skill => `- ${skill}`).join('\n')}

## What Cal Learned

Cal now checks:
- ✅ All command strings before execution
- ✅ Type safety at runtime
- ✅ Proper error handling
- ✅ Database logging of all errors

## Lab Exercise

Try fixing a similar bug in your own code:

1. Find a place where you pass variables to external functions
2. Add validation before the function call
3. Add error handling
4. Test with invalid inputs
5. Log results to database

## Summary

- **Problem:** ${analysis.commonError}
- **Root Cause:** ${analysis.rootCause}
- **Solution:** ${analysis.solution}
- **Lessons Affected:** ${analysis.affectedLessons.size}
- **Total Occurrences:** ${analysis.totalOccurrences}

Cal turned this bug into a lesson. Now you can avoid it too.

---

**Generated by Cal's Auto Media Company** - Learn from real debugging sessions.
`;

    return markdown;
  }
}

module.exports = DevOpsLessonGenerator;
