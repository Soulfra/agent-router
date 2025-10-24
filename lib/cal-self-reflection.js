/**
 * Cal Self-Reflection System
 *
 * Cal reflects on his work, learns from mistakes, and improves over time.
 * Periodically reviews recent attempts and extracts lessons.
 *
 * Workflow:
 * 1. Review recent task attempts from learning system
 * 2. Identify patterns in successes and failures
 * 3. Use Ollama to analyze what's working vs what's not
 * 4. Extract actionable lessons
 * 5. Update knowledge base with new patterns
 * 6. Update pattern confidence scores
 *
 * Usage:
 *   const reflection = new CalSelfReflection();
 *   const insights = await reflection.reflect({
 *     period: '24h', // or '7d', '30d'
 *     minAttempts: 5
 *   });
 *   // Returns: { lessons: [...], patterns: [...], improvements: [...] }
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class CalSelfReflection {
  constructor(options = {}) {
    this.config = {
      ollamaModel: options.ollamaModel || 'calos-expert',
      knowledgeBase: options.knowledgeBase, // CalKnowledgeBase instance
      learningSystem: options.learningSystem, // CalLearningSystem instance
      verbose: options.verbose || false
    };

    console.log('[CalSelfReflection] Initialized with model:', this.config.ollamaModel);
  }

  /**
   * Reflect on recent work
   */
  async reflect(options = {}) {
    const { period = '24h', minAttempts = 5 } = options;

    console.log(`[CalSelfReflection] Reflecting on last ${period}...`);

    if (!this.config.learningSystem) {
      throw new Error('Learning system not configured');
    }

    try {
      // Step 1: Get recent lessons
      const recentLessons = await this.config.learningSystem.getRecentLessons(50);

      if (recentLessons.length < minAttempts) {
        console.log(`[CalSelfReflection] Not enough data yet (${recentLessons.length} lessons)`);
        return {
          lessons: [],
          patterns: [],
          improvements: [],
          message: 'Need more attempts before reflection can be meaningful'
        };
      }

      // Step 2: Get stats
      const stats = await this.config.learningSystem.getStats();

      console.log(`[CalSelfReflection] Analyzing ${recentLessons.length} lessons...`);
      console.log(`[CalSelfReflection] Success rate: ${(stats.success_rate * 100).toFixed(1)}%`);

      // Step 3: Group lessons by task type
      const groupedLessons = this.groupLessonsByType(recentLessons);

      // Step 4: Analyze each task type
      const insights = [];

      for (const [taskType, lessons] of Object.entries(groupedLessons)) {
        if (lessons.length < 2) continue; // Need at least 2 attempts to learn

        const insight = await this.analyzeTaskType(taskType, lessons);
        insights.push(insight);
      }

      // Step 5: Extract overall patterns
      const overallInsights = await this.extractOverallPatterns(recentLessons, stats);

      // Step 6: Generate actionable improvements
      const improvements = await this.generateImprovements(insights, stats);

      // Step 7: Update knowledge base with new patterns
      await this.updateKnowledgeBase(insights);

      console.log(`[CalSelfReflection] ✅ Reflection complete`);
      console.log(`[CalSelfReflection] Found ${insights.length} task-specific insights`);
      console.log(`[CalSelfReflection] Generated ${improvements.length} improvements`);

      return {
        lessons: insights,
        patterns: overallInsights,
        improvements,
        stats: {
          totalLessons: recentLessons.length,
          successRate: stats.success_rate,
          uniqueTasks: stats.unique_tasks,
          avgConfidence: stats.avg_confidence
        }
      };

    } catch (error) {
      console.error('[CalSelfReflection] Reflection failed:', error.message);
      throw error;
    }
  }

  /**
   * Group lessons by task type
   */
  groupLessonsByType(lessons) {
    const grouped = {};

    for (const lesson of lessons) {
      if (!grouped[lesson.task_type]) {
        grouped[lesson.task_type] = [];
      }
      grouped[lesson.task_type].push(lesson);
    }

    return grouped;
  }

  /**
   * Analyze a specific task type
   */
  async analyzeTaskType(taskType, lessons) {
    const successes = lessons.filter(l => l.outcome === 'success');
    const failures = lessons.filter(l => l.outcome === 'failure');

    console.log(`[CalSelfReflection] Analyzing ${taskType}: ${successes.length} successes, ${failures.length} failures`);

    const prompt = this.buildAnalysisPrompt(taskType, successes, failures);

    const command = `ollama run ${this.config.ollamaModel} "${prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

    try {
      const { stdout } = await execPromise(command, {
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      const analysis = this.parseAnalysis(stdout);

      return {
        taskType,
        successCount: successes.length,
        failureCount: failures.length,
        successRate: successes.length / lessons.length,
        ...analysis
      };

    } catch (error) {
      console.error(`[CalSelfReflection] Analysis failed for ${taskType}:`, error.message);
      return {
        taskType,
        successCount: successes.length,
        failureCount: failures.length,
        successRate: successes.length / lessons.length,
        whatWorked: 'Analysis failed',
        whatFailed: error.message,
        lesson: 'Need to investigate manually'
      };
    }
  }

  /**
   * Build analysis prompt for Ollama
   */
  buildAnalysisPrompt(taskType, successes, failures) {
    let prompt = `You are Cal, an autonomous AI reflecting on your recent work. Analyze your performance on ${taskType} tasks.

TASK TYPE: ${taskType}
ATTEMPTS: ${successes.length + failures.length} (${successes.length} successes, ${failures.length} failures)
`;

    if (successes.length > 0) {
      prompt += `\nSUCCESSFUL ATTEMPTS:\n`;
      successes.slice(0, 5).forEach((s, i) => {
        prompt += `${i + 1}. ${s.summary}\n`;
        if (s.what_worked) prompt += `   What worked: ${s.what_worked}\n`;
      });
    }

    if (failures.length > 0) {
      prompt += `\nFAILED ATTEMPTS:\n`;
      failures.slice(0, 5).forEach((f, i) => {
        prompt += `${i + 1}. ${f.summary}\n`;
        if (f.what_failed) prompt += `   What failed: ${f.what_failed}\n`;
        if (f.error_message) prompt += `   Error: ${f.error_message}\n`;
      });
    }

    prompt += `\nINSTRUCTIONS:
1. Identify what's working well for ${taskType} tasks
2. Identify what's causing failures
3. Extract a clear lesson for next time
4. Suggest a specific improvement

Output format (plain text):
WHAT_WORKED: [What approaches are succeeding]
WHAT_FAILED: [What approaches are failing]
LESSON: [Key takeaway for future ${taskType} tasks]
IMPROVEMENT: [Specific action to take next time]`;

    return prompt;
  }

  /**
   * Parse Ollama analysis response
   */
  parseAnalysis(response) {
    const whatWorkedMatch = response.match(/WHAT_WORKED:\s*(.+?)(?=\nWHAT_FAILED:|$)/s);
    const whatFailedMatch = response.match(/WHAT_FAILED:\s*(.+?)(?=\nLESSON:|$)/s);
    const lessonMatch = response.match(/LESSON:\s*(.+?)(?=\nIMPROVEMENT:|$)/s);
    const improvementMatch = response.match(/IMPROVEMENT:\s*(.+?)$/s);

    return {
      whatWorked: whatWorkedMatch ? whatWorkedMatch[1].trim() : 'Unknown',
      whatFailed: whatFailedMatch ? whatFailedMatch[1].trim() : 'Unknown',
      lesson: lessonMatch ? lessonMatch[1].trim() : 'Unknown',
      improvement: improvementMatch ? improvementMatch[1].trim() : 'Unknown'
    };
  }

  /**
   * Extract overall patterns across all tasks
   */
  async extractOverallPatterns(lessons, stats) {
    // Find common success patterns
    const successes = lessons.filter(l => l.outcome === 'success');
    const failures = lessons.filter(l => l.outcome === 'failure');

    const patterns = {
      commonSuccessFactors: [],
      commonFailureFactors: [],
      emergingPatterns: []
    };

    // Extract common words from success lessons
    const successWords = this.extractKeywords(successes.map(s => s.lesson || s.what_worked || ''));
    const failureWords = this.extractKeywords(failures.map(f => f.lesson || f.what_failed || ''));

    patterns.commonSuccessFactors = successWords.slice(0, 5);
    patterns.commonFailureFactors = failureWords.slice(0, 5);

    // Identify emerging patterns (things that are working better over time)
    const recentSuccesses = successes.slice(0, 10);
    const olderSuccesses = successes.slice(10, 20);

    if (recentSuccesses.length > 0 && olderSuccesses.length > 0) {
      const recentRate = recentSuccesses.length / (recentSuccesses.length + failures.slice(0, 10).length);
      const olderRate = olderSuccesses.length / (olderSuccesses.length + failures.slice(10, 20).length);

      if (recentRate > olderRate + 0.1) {
        patterns.emergingPatterns.push('Success rate improving over time');
      } else if (recentRate < olderRate - 0.1) {
        patterns.emergingPatterns.push('Success rate declining - need to investigate');
      }
    }

    return patterns;
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(texts) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should']);

    const wordCounts = {};

    for (const text of texts) {
      const words = text.toLowerCase().match(/\b\w+\b/g) || [];
      for (const word of words) {
        if (word.length > 3 && !stopWords.has(word)) {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
      }
    }

    return Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);
  }

  /**
   * Generate actionable improvements
   */
  async generateImprovements(insights, stats) {
    const improvements = [];

    // Low success rate - need fundamental improvement
    if (stats.success_rate < 0.5) {
      improvements.push({
        priority: 'high',
        action: 'Review core approach - success rate below 50%',
        reason: 'Failing more than succeeding indicates systematic issue'
      });
    }

    // Consistent failures in specific task type
    for (const insight of insights) {
      if (insight.failureCount > insight.successCount) {
        improvements.push({
          priority: 'high',
          action: `Focus on ${insight.taskType} - failing ${insight.failureCount}/${insight.successCount + insight.failureCount} attempts`,
          reason: insight.whatFailed,
          suggestion: insight.improvement
        });
      }
    }

    // Low confidence - need more learning
    if (stats.avg_confidence < 0.6) {
      improvements.push({
        priority: 'medium',
        action: 'Increase confidence by attempting more diverse tasks',
        reason: 'Low average confidence indicates uncertainty'
      });
    }

    // High success rate - can tackle harder problems
    if (stats.success_rate > 0.8) {
      improvements.push({
        priority: 'low',
        action: 'Ready for more complex tasks',
        reason: 'High success rate shows strong fundamentals'
      });
    }

    return improvements;
  }

  /**
   * Update knowledge base with new patterns
   */
  async updateKnowledgeBase(insights) {
    if (!this.config.knowledgeBase) {
      return;
    }

    for (const insight of insights) {
      try {
        // Add successful pattern
        if (insight.successRate > 0.7 && insight.whatWorked !== 'Unknown') {
          await this.config.knowledgeBase.add(
            'patterns',
            insight.taskType,
            'pattern',
            insight.whatWorked
          );
        }

        // Add anti-pattern (what failed)
        if (insight.failureCount > 0 && insight.whatFailed !== 'Unknown') {
          await this.config.knowledgeBase.add(
            'antiPatterns',
            insight.taskType,
            'antiPattern',
            insight.whatFailed
          );
        }

        if (this.config.verbose) {
          console.log(`[CalSelfReflection] Updated knowledge base for ${insight.taskType}`);
        }

      } catch (error) {
        console.warn(`[CalSelfReflection] Failed to update knowledge base for ${insight.taskType}:`, error.message);
      }
    }
  }

  /**
   * Generate reflection report (human-readable summary)
   */
  generateReport(reflectionResult) {
    let report = `\n=== CAL SELF-REFLECTION REPORT ===\n\n`;

    report += `📊 STATS:\n`;
    report += `  Total lessons: ${reflectionResult.stats.totalLessons}\n`;
    report += `  Success rate: ${(reflectionResult.stats.successRate * 100).toFixed(1)}%\n`;
    report += `  Unique tasks: ${reflectionResult.stats.uniqueTasks}\n`;
    report += `  Avg confidence: ${(reflectionResult.stats.avgConfidence * 100).toFixed(1)}%\n\n`;

    if (reflectionResult.lessons.length > 0) {
      report += `🎓 TASK-SPECIFIC LESSONS:\n`;
      for (const lesson of reflectionResult.lessons) {
        report += `\n  ${lesson.taskType} (${lesson.successCount}/${lesson.successCount + lesson.failureCount} succeeded):\n`;
        report += `    ✅ What worked: ${lesson.whatWorked}\n`;
        if (lesson.failureCount > 0) {
          report += `    ❌ What failed: ${lesson.whatFailed}\n`;
        }
        report += `    💡 Lesson: ${lesson.lesson}\n`;
        report += `    🔧 Improvement: ${lesson.improvement}\n`;
      }
    }

    if (reflectionResult.patterns.commonSuccessFactors.length > 0) {
      report += `\n🌟 COMMON SUCCESS FACTORS:\n`;
      report += `  ${reflectionResult.patterns.commonSuccessFactors.slice(0, 5).join(', ')}\n`;
    }

    if (reflectionResult.patterns.commonFailureFactors.length > 0) {
      report += `\n⚠️  COMMON FAILURE FACTORS:\n`;
      report += `  ${reflectionResult.patterns.commonFailureFactors.slice(0, 5).join(', ')}\n`;
    }

    if (reflectionResult.improvements.length > 0) {
      report += `\n🎯 ACTIONABLE IMPROVEMENTS:\n`;
      for (const imp of reflectionResult.improvements) {
        const emoji = imp.priority === 'high' ? '🔴' : imp.priority === 'medium' ? '🟡' : '🟢';
        report += `  ${emoji} ${imp.action}\n`;
        if (imp.reason) report += `     Reason: ${imp.reason}\n`;
        if (imp.suggestion) report += `     Suggestion: ${imp.suggestion}\n`;
      }
    }

    report += `\n=== END REPORT ===\n`;

    return report;
  }
}

module.exports = CalSelfReflection;
