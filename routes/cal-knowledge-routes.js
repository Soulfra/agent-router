/**
 * CAL Knowledge API Routes
 *
 * Public API for accessing CAL's learned knowledge:
 * - Migration knowledge (what fails, what works)
 * - Skill progression (mastered vs failing)
 * - Failure patterns (repeated mistakes)
 * - Doc knowledge (learned from URLs/docs)
 *
 * All endpoints are public and return JSON for community learning
 */

const express = require('express');
const router = express.Router();
const path = require('path');

const CalMigrationLearner = require('../lib/cal-migration-learner');
const CalSkillTracker = require('../lib/cal-skill-tracker');
const CalFailureLearner = require('../lib/cal-failure-learner');
const CalDocLearner = require('../lib/cal-doc-learner');

// Initialize learners
const migrationLearner = new CalMigrationLearner();
const skillTracker = new CalSkillTracker();
const failureLearner = new CalFailureLearner();
const docLearner = new CalDocLearner();

// Get global error interceptor (if available)
let errorInterceptor = null;
try {
  const CalErrorInterceptor = require('../lib/cal-error-interceptor');
  // Try to get the global instance from router.js
  errorInterceptor = global.calErrorInterceptor || new CalErrorInterceptor();
  if (!global.calErrorInterceptor) {
    errorInterceptor.init().catch(err => console.error('[KnowledgeAPI] Error interceptor init failed:', err));
  }
} catch (err) {
  console.warn('[KnowledgeAPI] Error interceptor not available');
}

// Load all systems on startup
(async () => {
  console.log('[KnowledgeAPI] Loading CAL knowledge systems...');
  await Promise.all([
    migrationLearner.load(),
    skillTracker.load(),
    failureLearner.load(),
    docLearner.load()
  ]);
  console.log('[KnowledgeAPI] ✓ All knowledge systems loaded');
})();

/**
 * GET /api/cal-knowledge/summary
 * Overall summary of all CAL knowledge
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = {
      migrations: migrationLearner.getSummary(),
      skills: await skillTracker.getSummary(),
      docs: docLearner.getSummary(),
      generatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal-knowledge/migrations
 * Get all migration knowledge
 */
router.get('/migrations', async (req, res) => {
  try {
    const summary = migrationLearner.getSummary();
    const broken = migrationLearner.getBrokenMigrations();

    res.json({
      success: true,
      summary,
      brokenMigrations: broken,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal-knowledge/migrations/:filename
 * Get knowledge about a specific migration
 */
router.get('/migrations/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    const shouldSkip = migrationLearner.shouldSkip(filename);
    const migration = migrationLearner.knowledge.migrations[filename] || null;

    res.json({
      success: true,
      migration: {
        filename,
        shouldSkip,
        ...migration
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal-knowledge/skills
 * Get all skills CAL is tracking
 */
router.get('/skills', async (req, res) => {
  try {
    const summary = await skillTracker.getSummary();
    const mastered = skillTracker.getMasteredSkills();
    const needingWork = skillTracker.getSkillsNeedingWork();

    res.json({
      success: true,
      summary,
      masteredSkills: mastered,
      skillsNeedingWork: needingWork,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal-knowledge/skills/:skillId
 * Get details about a specific skill
 */
router.get('/skills/:skillId', async (req, res) => {
  try {
    const { skillId } = req.params;

    const skill = skillTracker.getSkill(skillId);
    const isMastered = skillTracker.isMastered(skillId);

    res.json({
      success: true,
      skill: {
        ...skill,
        isMastered
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal-knowledge/failures
 * Get failure patterns and learned alternatives
 */
router.get('/failures', async (req, res) => {
  try {
    const allFailures = Object.keys(failureLearner.knowledge.failures).map(taskId => {
      return {
        taskId,
        summary: failureLearner.getSummary(taskId)
      };
    });

    res.json({
      success: true,
      failures: allFailures,
      totalTasks: allFailures.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal-knowledge/failures/:taskId
 * Get failure details for a specific task
 */
router.get('/failures/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const summary = failureLearner.getSummary(taskId);
    const alternatives = failureLearner.getAlternatives(taskId);

    res.json({
      success: true,
      task: {
        taskId,
        summary,
        alternatives
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal-knowledge/docs
 * Get documentation knowledge
 */
router.get('/docs', async (req, res) => {
  try {
    const summary = docLearner.getSummary();

    res.json({
      success: true,
      summary,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal-knowledge/docs/search?q=term
 * Search documentation knowledge
 */
router.get('/docs/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Missing query parameter: q'
      });
    }

    const results = docLearner.query(q);

    res.json({
      success: true,
      query: q,
      results,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cal-knowledge/docs/learn
 * Teach CAL from a URL
 */
router.post('/docs/learn', async (req, res) => {
  try {
    const { url, forceRefresh } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: url'
      });
    }

    const analysis = await docLearner.learnFromUrl(url, { forceRefresh });

    res.json({
      success: true,
      url,
      analysis,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal-knowledge/error-solution?error=message
 * Get solution for an error message
 */
router.get('/error-solution', async (req, res) => {
  try {
    const { error } = req.query;

    if (!error) {
      return res.status(400).json({
        success: false,
        error: 'Missing query parameter: error'
      });
    }

    // Check all learners for solutions
    const solutions = {
      migrations: null,
      docs: null,
      failures: null
    };

    // Check migration patterns
    const migrationFix = await migrationLearner.getSuggestedFix('unknown', error);
    if (migrationFix) {
      solutions.migrations = migrationFix;
    }

    // Check doc knowledge
    const docSolution = docLearner.getSolutionForError(error);
    if (docSolution) {
      solutions.docs = docSolution;
    }

    // Check if this error pattern has been seen before
    const errorPattern = error.substring(0, 100);
    const failureSummary = failureLearner.getSummary(errorPattern);
    if (failureSummary && failureSummary.recommendation) {
      solutions.failures = failureSummary.recommendation;
    }

    const hasSolutions = Object.values(solutions).some(s => s !== null);

    res.json({
      success: true,
      error,
      solutions,
      hasSolutions,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal-knowledge/best-practices
 * Get all learned best practices
 */
router.get('/best-practices', async (req, res) => {
  try {
    const practices = docLearner.knowledge.bestPractices
      .sort((a, b) => b.confidence - a.confidence);

    res.json({
      success: true,
      bestPractices: practices,
      total: practices.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal-knowledge/export
 * Export all knowledge as JSON
 */
router.get('/export', async (req, res) => {
  try {
    const fullExport = {
      migrations: {
        summary: migrationLearner.getSummary(),
        knowledge: migrationLearner.knowledge
      },
      skills: {
        summary: await skillTracker.getSummary(),
        skills: skillTracker.skills
      },
      failures: {
        knowledge: failureLearner.knowledge
      },
      docs: {
        summary: docLearner.getSummary(),
        knowledge: {
          bestPractices: docLearner.knowledge.bestPractices,
          errorSolutions: docLearner.knowledge.errorSolutions,
          topics: docLearner.knowledge.topics
        }
      },
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    };

    res.json({
      success: true,
      export: fullExport
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal-knowledge/live-errors
 * Get real-time errors as they occur (for error dashboard)
 */
router.get('/live-errors', async (req, res) => {
  try {
    if (!errorInterceptor) {
      return res.status(503).json({
        success: false,
        error: 'Error interceptor not available',
        liveErrors: []
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const liveErrors = errorInterceptor.getLiveErrors(limit);
    const summary = errorInterceptor.getSummary();

    res.json({
      success: true,
      liveErrors,
      summary,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cal-knowledge/report-error
 * Manually report an error for learning
 */
router.post('/report-error', async (req, res) => {
  try {
    if (!errorInterceptor) {
      return res.status(503).json({
        success: false,
        error: 'Error interceptor not available'
      });
    }

    const { error, context } = req.body;

    if (!error) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: error'
      });
    }

    const captured = await errorInterceptor.capture(error, {
      ...context,
      type: 'manual-report',
      source: 'api'
    });

    const suggestedFix = await errorInterceptor.getSuggestedFix(error);

    res.json({
      success: true,
      captured,
      suggestedFix,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
