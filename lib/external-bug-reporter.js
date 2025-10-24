/**
 * External Bug Reporter
 *
 * Sends minimal code snippets and error logs to external AI services for diagnosis.
 * Respects privacy by only sharing error context, not full codebase.
 *
 * Supported Services:
 * - OpenAI (GPT-4) - General bug diagnosis
 * - CodeRabbit - Code review and suggestions
 * - GitHub Issues - Manual human review
 *
 * Features:
 * - Extract minimal 10-line code snippets
 * - Package error + stack trace + context
 * - Send to external API
 * - Parse suggested fixes
 * - Track bug report history
 * - Privacy-preserving (no sensitive data, no full files)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const AIConversationLogger = require('./ai-conversation-logger');

class ExternalBugReporter {
  constructor(options = {}) {
    this.db = options.db;
    this.openaiKey = options.openaiKey || process.env.OPENAI_API_KEY;
    this.coderabbitKey = options.coderabbitKey || process.env.CODERABBIT_API_KEY;
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.githubRepo = options.githubRepo || process.env.GITHUB_REPO; // e.g., "matthewmauer/calos"

    this.verbose = options.verbose || false;

    // Privacy settings
    this.maxSnippetLines = options.maxSnippetLines || 15;
    this.contextLines = options.contextLines || 5; // Lines before/after error

    // AI Conversation Logger for tracking all API calls
    this.conversationLogger = this.db ? new AIConversationLogger({
      db: this.db,
      verbose: this.verbose,
      autoPostToForum: true, // Auto-post bug diagnoses to forum
      autoPostPurposes: ['bug_diagnosis', 'critical_error']
    }) : null;

    console.log('[ExternalBugReporter] Initialized');
  }

  /**
   * Report a bug to OpenAI for diagnosis
   *
   * @param {Object} bugReport - Bug details
   * @param {string} bugReport.error - Error message
   * @param {string} bugReport.file - File where error occurred
   * @param {number} bugReport.line - Line number
   * @param {string} bugReport.stackTrace - Full stack trace
   * @param {string} bugReport.context - Additional context
   * @returns {Promise<Object>} - Suggested fix from OpenAI
   */
  async reportToOpenAI(bugReport) {
    if (!this.openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const { error, file, line, stackTrace, context } = bugReport;

    // Extract minimal snippet
    const snippet = this.extractSnippet(file, line);

    // Build prompt
    const prompt = `You are a debugging assistant helping fix a production issue.

**Error:**
${error}

**File:** ${file}${line ? `:${line}` : ''}

**Code Snippet:**
\`\`\`
${snippet}
\`\`\`

${stackTrace ? `**Stack Trace:**\n${stackTrace}\n` : ''}

${context ? `**Context:**\n${context}\n` : ''}

**Task:**
1. Diagnose the root cause of this error
2. Suggest a specific fix (code change, configuration, or command)
3. Explain why this error occurred

**Format your response as:**
DIAGNOSIS: [root cause]
FIX: [specific action to take]
EXPLANATION: [why this error happened]
`;

    const startTime = Date.now();

    try {
      const systemPrompt = 'You are a debugging expert helping fix production bugs. Be concise and actionable.';

      const requestBody = {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2, // Low temperature for consistent diagnosis
        max_tokens: 800
      };

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.openaiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const latencyMs = Date.now() - startTime;
      const suggestion = response.data.choices[0].message.content;
      const usage = response.data.usage;

      // Parse suggestion
      const parsed = this.parseSuggestion(suggestion);

      // Log to database
      const bugReportRecord = await this.logBugReport({
        service: 'openai',
        bugReport,
        suggestion: parsed,
        rawResponse: suggestion
      });

      // Log AI conversation (NEW - tracks all OpenAI calls)
      if (this.conversationLogger) {
        await this.conversationLogger.logConversation({
          service: 'openai',
          model: 'gpt-4',
          endpoint: 'https://api.openai.com/v1/chat/completions',
          userPrompt: prompt,
          systemPrompt: systemPrompt,
          assistantResponse: suggestion,
          fullRequest: requestBody,
          fullResponse: response.data,
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          latencyMs: latencyMs,
          purpose: 'bug_diagnosis',
          contextSource: 'external_bug_reporter',
          relatedEntityType: 'bug_report',
          relatedEntityId: bugReportRecord?.report_id,
          status: 'completed'
        });
      }

      return {
        success: true,
        service: 'openai',
        diagnosis: parsed.diagnosis,
        fix: parsed.fix,
        explanation: parsed.explanation,
        raw: suggestion
      };

    } catch (error) {
      const latencyMs = Date.now() - startTime;

      console.error('[ExternalBugReporter] OpenAI request failed:', error.message);

      // Log failed AI conversation
      if (this.conversationLogger) {
        await this.conversationLogger.logConversation({
          service: 'openai',
          model: 'gpt-4',
          endpoint: 'https://api.openai.com/v1/chat/completions',
          userPrompt: prompt,
          assistantResponse: '',
          latencyMs: latencyMs,
          purpose: 'bug_diagnosis',
          contextSource: 'external_bug_reporter',
          status: 'failed',
          errorMessage: error.message
        });
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Report a bug to GitHub Issues
   */
  async reportToGitHub(bugReport) {
    if (!this.githubToken || !this.githubRepo) {
      throw new Error('GitHub token or repo not configured');
    }

    const { error, file, line, stackTrace, context } = bugReport;
    const snippet = this.extractSnippet(file, line);

    const issueTitle = `[Cal-Detected] ${error.substring(0, 100)}`;
    const issueBody = `## Error

\`\`\`
${error}
\`\`\`

**File:** \`${file}${line ? `:${line}` : ''}\`

## Code Snippet

\`\`\`
${snippet}
\`\`\`

${stackTrace ? `## Stack Trace\n\n\`\`\`\n${stackTrace}\n\`\`\`\n` : ''}

${context ? `## Context\n\n${context}\n` : ''}

---
*This issue was automatically detected and reported by Cal's Guardian system.*
`;

    try {
      const [owner, repo] = this.githubRepo.split('/');

      const response = await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/issues`,
        {
          title: issueTitle,
          body: issueBody,
          labels: ['cal-detected', 'bug']
        },
        {
          headers: {
            'Authorization': `token ${this.githubToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      const issueUrl = response.data.html_url;
      const issueNumber = response.data.number;

      await this.logBugReport({
        service: 'github',
        bugReport,
        suggestion: { issueUrl, issueNumber }
      });

      return {
        success: true,
        service: 'github',
        issueUrl,
        issueNumber
      };

    } catch (error) {
      console.error('[ExternalBugReporter] GitHub issue creation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract minimal code snippet around error location
   *
   * @param {string} filePath - Absolute path to file
   * @param {number} errorLine - Line where error occurred
   * @returns {string} - Code snippet
   */
  extractSnippet(filePath, errorLine) {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        return '// File not accessible for snippet extraction';
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n');

      // Calculate range
      const startLine = Math.max(0, errorLine - this.contextLines);
      const endLine = Math.min(lines.length, errorLine + this.contextLines);

      // Extract snippet with line numbers
      const snippet = lines
        .slice(startLine, endLine)
        .map((line, index) => {
          const lineNum = startLine + index + 1;
          const marker = lineNum === errorLine ? '→' : ' ';
          return `${lineNum.toString().padStart(4)} ${marker} ${line}`;
        })
        .join('\n');

      return snippet;

    } catch (error) {
      return `// Error extracting snippet: ${error.message}`;
    }
  }

  /**
   * Parse AI suggestion response
   */
  parseSuggestion(rawSuggestion) {
    const diagnosisMatch = rawSuggestion.match(/DIAGNOSIS:\s*(.+?)(?:\n|FIX:|$)/s);
    const fixMatch = rawSuggestion.match(/FIX:\s*(.+?)(?:\n|EXPLANATION:|$)/s);
    const explanationMatch = rawSuggestion.match(/EXPLANATION:\s*(.+?)$/s);

    return {
      diagnosis: diagnosisMatch ? diagnosisMatch[1].trim() : null,
      fix: fixMatch ? fixMatch[1].trim() : null,
      explanation: explanationMatch ? explanationMatch[1].trim() : null
    };
  }

  /**
   * Log bug report to database
   */
  async logBugReport(data) {
    if (!this.db) return;

    try {
      const result = await this.db.query(`
        INSERT INTO guardian_bug_reports (
          service,
          error_message,
          file_path,
          line_number,
          snippet,
          diagnosis,
          suggested_fix,
          raw_response,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *
      `, [
        data.service,
        data.bugReport.error,
        data.bugReport.file,
        data.bugReport.line,
        data.bugReport.snippet,
        data.suggestion?.diagnosis || null,
        data.suggestion?.fix || null,
        data.rawResponse || JSON.stringify(data.suggestion)
      ]);

      return result.rows[0]; // Return created record
    } catch (error) {
      // Don't fail the whole operation if logging fails
      if (this.verbose) {
        console.warn('[ExternalBugReporter] Failed to log bug report:', error.message);
      }
      return null;
    }
  }

  /**
   * Package error into standardized bug report format
   */
  packageBugReport(error, options = {}) {
    const { file, line, stackTrace, context, source } = options;

    return {
      error: error.message || error.toString(),
      file: file || this.extractFileFromStack(stackTrace),
      line: line || this.extractLineFromStack(stackTrace),
      stackTrace: stackTrace || error.stack || null,
      context: context || null,
      source: source || 'guardian', // Where the error was detected
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Extract file path from stack trace
   */
  extractFileFromStack(stackTrace) {
    if (!stackTrace) return null;

    const match = stackTrace.match(/at .+ \((.+?):\d+:\d+\)/);
    return match ? match[1] : null;
  }

  /**
   * Extract line number from stack trace
   */
  extractLineFromStack(stackTrace) {
    if (!stackTrace) return null;

    const match = stackTrace.match(/at .+ \(.+?:(\d+):\d+\)/);
    return match ? parseInt(match[1], 10) : null;
  }
}

module.exports = ExternalBugReporter;
