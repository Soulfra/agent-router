/**
 * Multi-Model Query Routes
 *
 * Query all available models simultaneously and compare responses.
 * Supports both JSON output (for API/terminal) and visual grid (for browser).
 *
 * Endpoints:
 * - POST /api/models/query-all - Query all models with a question
 * - GET /api/models/list - List all available models
 * - POST /api/models/save-comparison - Save comparison to feed/notes
 * - POST /api/multi-model/compare - Full reasoning comparison with research + bias detection
 */

const express = require('express');

function initRoutes(multiLLMRouter, db) {
  const router = express.Router();

  // Lazy-load heavy dependencies
  let ModelReasoningComparator = null;
  let AutonomousResearchAgent = null;
  let UserDataVault = null;

  function getComparator() {
    if (!ModelReasoningComparator) {
      ModelReasoningComparator = require('../lib/model-reasoning-comparator');
      AutonomousResearchAgent = require('../lib/autonomous-research-agent');
      UserDataVault = require('../lib/user-data-vault');
    }
    return new ModelReasoningComparator({
      llmRouter: multiLLMRouter,
      vault: new UserDataVault({ db }),
      db
    });
  }

  /**
   * GET /api/models/list
   * Get all available models with metadata
   */
  router.get('/list', async (req, res) => {
    try {
      const models = [];

      // Get models from each provider
      for (const [providerName, provider] of Object.entries(multiLLMRouter.providers)) {
        if (provider.isAvailable()) {
          const providerModels = provider.getModels();
          providerModels.forEach(model => {
            models.push({
              provider: providerName,
              name: model.name,
              contextWindow: model.contextWindow,
              cost: model.cost,
              source: model.source || 'api',
              domain: model.domain || null,
              available: true
            });
          });
        }
      }

      res.json({
        success: true,
        count: models.length,
        models: models
      });

    } catch (error) {
      console.error('[MultiModelAPI] List error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/models/query-all
   * Query all models with the same question
   *
   * Body:
   * {
   *   "question": "Explain quantum computing",
   *   "format": "json" | "visual",
   *   "maxTokens": 500,
   *   "temperature": 0.7
   * }
   */
  router.post('/query-all', async (req, res) => {
    try {
      const {
        question,
        format = 'json',
        maxTokens = 500,
        temperature = 0.7
      } = req.body;

      if (!question) {
        return res.status(400).json({
          success: false,
          error: 'Question is required'
        });
      }

      console.log(`[MultiModelAPI] Querying all models: "${question.substring(0, 50)}..."`);

      const startTime = Date.now();
      const results = [];

      // Collect all model requests
      const requests = [];
      for (const [providerName, provider] of Object.entries(multiLLMRouter.providers)) {
        if (provider.isAvailable()) {
          const providerModels = provider.getModels();
          providerModels.forEach(model => {
            requests.push({
              provider: providerName,
              model: model.name,
              cost: model.cost,
              contextWindow: model.contextWindow
            });
          });
        }
      }

      // Execute all requests in parallel
      const responses = await Promise.allSettled(
        requests.map(async (req) => {
          const modelStartTime = Date.now();

          try {
            const response = await multiLLMRouter.complete({
              prompt: question,
              model: req.model,
              preferredProvider: req.provider,
              maxTokens: maxTokens,
              temperature: temperature
            });

            return {
              provider: req.provider,
              model: req.model,
              status: 'success',
              response: response.text,
              latency: Date.now() - modelStartTime,
              tokens: response.usage?.total_tokens || 0,
              cost: calculateCost(req.cost, response.usage?.total_tokens || 0),
              finishReason: response.finishReason
            };

          } catch (error) {
            return {
              provider: req.provider,
              model: req.model,
              status: 'error',
              error: error.message,
              latency: Date.now() - modelStartTime,
              tokens: 0,
              cost: 0
            };
          }
        })
      );

      // Process results
      const successful = [];
      const failed = [];

      responses.forEach((result, index) => {
        const modelResult = result.status === 'fulfilled' ? result.value : {
          ...requests[index],
          status: 'error',
          error: 'Promise rejected',
          latency: 0,
          tokens: 0,
          cost: 0
        };

        if (modelResult.status === 'success') {
          successful.push(modelResult);
        } else {
          failed.push(modelResult);
        }

        results.push(modelResult);
      });

      const totalLatency = Date.now() - startTime;
      const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
      const totalTokens = results.reduce((sum, r) => sum + (r.tokens || 0), 0);

      // Format response based on requested format
      if (format === 'visual') {
        // Return HTML for browser display
        const html = generateGridHTML(question, results, {
          totalLatency,
          totalCost,
          totalTokens,
          successCount: successful.length,
          failureCount: failed.length
        });

        res.send(html);

      } else {
        // Return JSON for API/terminal
        res.json({
          success: true,
          question: question,
          timestamp: new Date().toISOString(),
          summary: {
            totalModels: results.length,
            successful: successful.length,
            failed: failed.length,
            totalLatency: totalLatency,
            totalCost: totalCost,
            totalTokens: totalTokens,
            averageLatency: Math.round(totalLatency / results.length),
            averageCost: totalCost / results.length
          },
          models: results
        });
      }

    } catch (error) {
      console.error('[MultiModelAPI] Query error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/models/save-comparison
   * Save multi-model comparison to feed or notes
   *
   * Body:
   * {
   *   "question": "...",
   *   "results": [...],
   *   "saveAs": "feed" | "note"
   * }
   */
  router.post('/save-comparison', async (req, res) => {
    try {
      const { question, results, saveAs = 'feed' } = req.body;

      if (!question || !results) {
        return res.status(400).json({
          success: false,
          error: 'Question and results are required'
        });
      }

      if (saveAs === 'feed') {
        // Save to activity feed
        // TODO: Implement feed save logic
        res.json({
          success: true,
          message: 'Saved to feed',
          saveAs: 'feed'
        });

      } else if (saveAs === 'note') {
        // Save to notes
        const note = {
          title: `Multi-Model Comparison: ${question.substring(0, 50)}...`,
          content: formatResultsAsMarkdown(question, results),
          source: 'multi-model-comparison',
          category: 'ai-responses',
          tags: ['multi-model', 'comparison', 'ai'],
          created_at: new Date()
        };

        // Insert into notes table
        const result = await db.query(
          `INSERT INTO notes (title, content, source, category, tags, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [note.title, note.content, note.source, note.category, JSON.stringify(note.tags), note.created_at]
        );

        res.json({
          success: true,
          message: 'Saved to notes',
          saveAs: 'note',
          noteId: result.rows[0].id
        });

      } else {
        res.status(400).json({
          success: false,
          error: 'Invalid saveAs value. Use "feed" or "note".'
        });
      }

    } catch (error) {
      console.error('[MultiModelAPI] Save error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/multi-model/compare
   * Full reasoning comparison with research + bias detection
   *
   * Body:
   * {
   *   "query": "What pirate treasure was found in 2025?",
   *   "forceRefresh": false
   * }
   */
  router.post('/compare', async (req, res) => {
    try {
      const { query, forceRefresh = false } = req.body;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query is required'
        });
      }

      console.log(`[MultiModelComparison] Starting comparison: "${query}"`);

      // Get comparator
      const comparator = getComparator();

      // Create researcher
      if (!AutonomousResearchAgent) {
        AutonomousResearchAgent = require('../lib/autonomous-research-agent');
        UserDataVault = require('../lib/user-data-vault');
      }

      const vault = new UserDataVault({ db });
      const researcher = new AutonomousResearchAgent({ vault });

      // Run comparison
      const comparison = await comparator.compareAll(query, {
        researcher,
        forceRefresh,
        cutoffDate: new Date('2024-10-01')
      });

      // Clean up
      await researcher.close();

      console.log(`[MultiModelComparison] Complete. Best: ${comparison.bestModel.name} (${comparison.bestModel.score.toFixed(1)})`);

      res.json({
        success: true,
        ...comparison
      });

    } catch (error) {
      console.error('[MultiModelComparison] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

/**
 * Calculate cost for a model response
 * @param {number} costPer1kTokens - Cost per 1000 tokens
 * @param {number} tokens - Total tokens used
 * @returns {number} Total cost
 */
function calculateCost(costPer1kTokens, tokens) {
  return (costPer1kTokens * tokens) / 1000;
}

/**
 * Generate grid HTML for visual display
 * @param {string} question - The question asked
 * @param {array} results - Model results
 * @param {object} summary - Summary statistics
 * @returns {string} HTML string
 */
function generateGridHTML(question, results, summary) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Multi-Model Comparison</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      padding: 20px;
      margin: 0;
    }
    .header {
      max-width: 1400px;
      margin: 0 auto 30px;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 10px;
    }
    .question {
      font-size: 1.1rem;
      color: #00d4ff;
      margin-bottom: 20px;
      padding: 15px;
      background: rgba(0, 212, 255, 0.1);
      border-radius: 8px;
      border-left: 3px solid #00d4ff;
    }
    .summary {
      display: flex;
      gap: 20px;
      margin-bottom: 30px;
      flex-wrap: wrap;
    }
    .stat {
      background: #16213e;
      padding: 10px 15px;
      border-radius: 6px;
    }
    .stat-label {
      font-size: 0.85rem;
      color: #aaa;
    }
    .stat-value {
      font-size: 1.3rem;
      font-weight: 600;
      color: #00d4ff;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .model-card {
      background: #16213e;
      border-radius: 8px;
      padding: 15px;
      border: 1px solid #2a2a4e;
    }
    .model-card.error {
      border-color: #ff3860;
      background: rgba(255, 56, 96, 0.1);
    }
    .model-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid #2a2a4e;
    }
    .model-name {
      font-weight: 600;
      font-size: 0.95rem;
    }
    .provider-badge {
      font-size: 0.75rem;
      padding: 3px 8px;
      border-radius: 4px;
      background: rgba(0, 212, 255, 0.2);
      color: #00d4ff;
    }
    .model-response {
      font-size: 0.9rem;
      line-height: 1.5;
      color: #ddd;
      margin-bottom: 10px;
      max-height: 200px;
      overflow-y: auto;
    }
    .model-meta {
      display: flex;
      gap: 15px;
      font-size: 0.8rem;
      color: #aaa;
    }
    .meta-item {
      display: flex;
      gap: 5px;
    }
    .error-message {
      color: #ff3860;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🤖 Multi-Model Comparison</h1>
    <div class="question">
      <strong>Question:</strong> ${escapeHtml(question)}
    </div>
    <div class="summary">
      <div class="stat">
        <div class="stat-label">Total Models</div>
        <div class="stat-value">${summary.successCount + summary.failureCount}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Successful</div>
        <div class="stat-value">${summary.successCount}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Failed</div>
        <div class="stat-value">${summary.failureCount}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Total Time</div>
        <div class="stat-value">${summary.totalLatency}ms</div>
      </div>
      <div class="stat">
        <div class="stat-label">Total Cost</div>
        <div class="stat-value">$${summary.totalCost.toFixed(4)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Total Tokens</div>
        <div class="stat-value">${summary.totalTokens}</div>
      </div>
    </div>
  </div>

  <div class="grid">
    ${results.map(model => `
      <div class="model-card ${model.status === 'error' ? 'error' : ''}">
        <div class="model-header">
          <div class="model-name">${escapeHtml(model.model)}</div>
          <div class="provider-badge">${escapeHtml(model.provider)}</div>
        </div>
        ${model.status === 'success' ? `
          <div class="model-response">${escapeHtml(model.response)}</div>
          <div class="model-meta">
            <div class="meta-item">
              <span>⏱️</span>
              <span>${model.latency}ms</span>
            </div>
            <div class="meta-item">
              <span>📊</span>
              <span>${model.tokens} tokens</span>
            </div>
            <div class="meta-item">
              <span>💰</span>
              <span>$${model.cost.toFixed(5)}</span>
            </div>
          </div>
        ` : `
          <div class="error-message">❌ Error: ${escapeHtml(model.error)}</div>
        `}
      </div>
    `).join('')}
  </div>
</body>
</html>
  `;
}

/**
 * Format results as markdown for notes
 * @param {string} question - The question
 * @param {array} results - Model results
 * @returns {string} Markdown string
 */
function formatResultsAsMarkdown(question, results) {
  let markdown = `# Multi-Model Comparison\n\n`;
  markdown += `**Question:** ${question}\n\n`;
  markdown += `**Timestamp:** ${new Date().toISOString()}\n\n`;
  markdown += `---\n\n`;

  results.forEach(model => {
    markdown += `## ${model.model} (${model.provider})\n\n`;

    if (model.status === 'success') {
      markdown += `${model.response}\n\n`;
      markdown += `- **Latency:** ${model.latency}ms\n`;
      markdown += `- **Tokens:** ${model.tokens}\n`;
      markdown += `- **Cost:** $${model.cost.toFixed(5)}\n\n`;
    } else {
      markdown += `**Error:** ${model.error}\n\n`;
    }

    markdown += `---\n\n`;
  });

  return markdown;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

module.exports = { initRoutes };
