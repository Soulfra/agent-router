/**
 * Grading Routes
 *
 * Multi-track grading API
 * Routes submissions to specialized graders (visual, logic, audio)
 */

const express = require('express');
const router = express.Router();
const VisualGrader = require('../lib/grading/visual-grader');
const LogicGrader = require('../lib/grading/logic-grader');
const AudioGrader = require('../lib/grading/audio-grader');
const SubmissionPreprocessor = require('../lib/submission-preprocessor');

let db;
let visualGrader;
let logicGrader;
let audioGrader;
let preprocessor;

/**
 * Initialize grading routes
 */
function init(database) {
  db = database;
  visualGrader = new VisualGrader();
  logicGrader = new LogicGrader();
  audioGrader = new AudioGrader();
  preprocessor = new SubmissionPreprocessor();
  console.log('[Grading API] Initialized');
}

/**
 * POST /api/grading/visual/:id
 * Grade visual/CSS track
 */
router.post('/visual/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get submission
    const submission = await getSubmission(id);

    // Prepare visual track content
    const preprocessed = {
      raw: submission.raw_content,
      tracks: submission.tracks,
      metadata: submission.metadata
    };

    const visualContent = preprocessor.prepareForTrack(preprocessed, 'visual');

    if (!visualContent) {
      return res.status(400).json({
        success: false,
        error: 'No visual content found in submission'
      });
    }

    // Grade visual track
    const result = await visualGrader.evaluate(visualContent, {
      submissionId: id,
      userId: submission.user_id,
      challengeId: submission.challenge_id
    });

    // Store grading result
    await storeGradingResult(id, 'visual', result);

    res.json({
      success: true,
      track: 'visual',
      result
    });

  } catch (error) {
    console.error('Visual grading error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/grading/logic/:id
 * Grade logic/code track
 */
router.post('/logic/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get submission
    const submission = await getSubmission(id);

    // Prepare logic track content
    const preprocessed = {
      raw: submission.raw_content,
      tracks: submission.tracks,
      metadata: submission.metadata
    };

    const logicContent = preprocessor.prepareForTrack(preprocessed, 'logic');

    if (!logicContent) {
      return res.status(400).json({
        success: false,
        error: 'No logic content found in submission'
      });
    }

    // Detect language
    const language = submission.content_type === 'python' ? 'python' : 'javascript';

    // Grade logic track
    const result = await logicGrader.evaluate(logicContent, language, {
      submissionId: id,
      userId: submission.user_id,
      challengeId: submission.challenge_id
    });

    // Store grading result
    await storeGradingResult(id, 'logic', result);

    res.json({
      success: true,
      track: 'logic',
      result
    });

  } catch (error) {
    console.error('Logic grading error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/grading/audio/:id
 * Grade audio track
 */
router.post('/audio/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get submission
    const submission = await getSubmission(id);

    // Prepare audio track content
    const preprocessed = {
      raw: submission.raw_content,
      tracks: submission.tracks,
      metadata: submission.metadata
    };

    const audioContent = preprocessor.prepareForTrack(preprocessed, 'audio');

    if (!audioContent) {
      return res.status(400).json({
        success: false,
        error: 'No audio content found in submission'
      });
    }

    // Grade audio track
    const result = await audioGrader.evaluate(audioContent, {
      submissionId: id,
      userId: submission.user_id,
      challengeId: submission.challenge_id
    });

    // Store grading result
    await storeGradingResult(id, 'audio', result);

    res.json({
      success: true,
      track: 'audio',
      result
    });

  } catch (error) {
    console.error('Audio grading error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/grading/all/:id
 * Grade all applicable tracks
 */
router.post('/all/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get submission
    const submission = await getSubmission(id);

    const gradingTracks = submission.grading_tracks;

    if (!gradingTracks || gradingTracks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No grading tracks determined for submission'
      });
    }

    const results = {};
    const preprocessed = {
      raw: submission.raw_content,
      tracks: submission.tracks,
      metadata: submission.metadata
    };

    // Grade each track
    for (const track of gradingTracks) {
      const content = preprocessor.prepareForTrack(preprocessed, track);

      if (!content) continue;

      let result;

      switch (track) {
        case 'visual':
          result = await visualGrader.evaluate(content, {
            submissionId: id,
            userId: submission.user_id,
            challengeId: submission.challenge_id
          });
          break;

        case 'logic':
          const language = submission.content_type === 'python' ? 'python' : 'javascript';
          result = await logicGrader.evaluate(content, language, {
            submissionId: id,
            userId: submission.user_id,
            challengeId: submission.challenge_id
          });
          break;

        case 'audio':
          result = await audioGrader.evaluate(content, {
            submissionId: id,
            userId: submission.user_id,
            challengeId: submission.challenge_id
          });
          break;

        default:
          continue;
      }

      results[track] = result;

      // Store result
      await storeGradingResult(id, track, result);
    }

    // Calculate combined score
    const combinedScore = calculateCombinedScore(results);

    res.json({
      success: true,
      tracks: Object.keys(results),
      results,
      combined: combinedScore
    });

  } catch (error) {
    console.error('Multi-track grading error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/grading/:id/results
 * Get all grading results for a submission
 */
router.get('/:id/results', async (req, res) => {
  try {
    const { id } = req.params;

    const results = await db.query(
      `SELECT * FROM grading_results
       WHERE submission_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    if (results.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No grading results found'
      });
    }

    // Organize by track
    const byTrack = {};
    results.rows.forEach(row => {
      byTrack[row.track] = row;
    });

    // Calculate combined score
    const combinedScore = calculateCombinedScore(
      Object.fromEntries(
        Object.entries(byTrack).map(([track, data]) => [track, data.result])
      )
    );

    res.json({
      success: true,
      results: byTrack,
      combined: combinedScore,
      count: results.rows.length
    });

  } catch (error) {
    console.error('Get results error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/grading/:id/results/:track
 * Get specific track result
 */
router.get('/:id/results/:track', async (req, res) => {
  try {
    const { id, track } = req.params;

    const result = await db.query(
      `SELECT * FROM grading_results
       WHERE submission_id = $1 AND track = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [id, track]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No ${track} grading result found`
      });
    }

    res.json({
      success: true,
      result: result.rows[0]
    });

  } catch (error) {
    console.error('Get track result error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/grading/:id/report
 * Generate comprehensive grading report
 */
router.post('/:id/report', async (req, res) => {
  try {
    const { id } = req.params;

    // Get submission
    const submission = await getSubmission(id);

    // Get all grading results
    const results = await db.query(
      `SELECT * FROM grading_results
       WHERE submission_id = $1`,
      [id]
    );

    if (results.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No grading results found. Please grade submission first.'
      });
    }

    // Organize results by track
    const byTrack = {};
    results.rows.forEach(row => {
      byTrack[row.track] = row.result;
    });

    // Generate detailed reports
    const reports = {};
    const preprocessed = {
      raw: submission.raw_content,
      tracks: submission.tracks,
      metadata: submission.metadata
    };

    for (const [track, result] of Object.entries(byTrack)) {
      const content = preprocessor.prepareForTrack(preprocessed, track);

      if (!content) continue;

      switch (track) {
        case 'visual':
          reports[track] = visualGrader.generateReport(result, content);
          break;

        case 'logic':
          const language = submission.content_type === 'python' ? 'python' : 'javascript';
          reports[track] = logicGrader.generateReport(result, content, language);
          break;

        case 'audio':
          reports[track] = audioGrader.generateReport(result, content);
          break;
      }
    }

    // Calculate combined metrics
    const combined = calculateCombinedScore(byTrack);

    res.json({
      success: true,
      submission: {
        id: submission.id,
        fileName: submission.file_name,
        contentType: submission.content_type,
        gradingTracks: submission.grading_tracks,
        metadata: submission.metadata
      },
      reports,
      combined,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/grading/leaderboard
 * Get top scores across all submissions
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const track = req.query.track || 'combined';
    const limit = parseInt(req.query.limit) || 10;

    let query;

    if (track === 'combined') {
      // Calculate average score across all tracks
      query = `
        SELECT
          s.id,
          s.user_id,
          s.challenge_id,
          s.file_name,
          s.content_type,
          AVG((gr.result->>'overall')::float) as score,
          s.created_at
        FROM submissions s
        JOIN grading_results gr ON s.id = gr.submission_id
        GROUP BY s.id
        ORDER BY score DESC
        LIMIT $1
      `;
    } else {
      // Get scores for specific track
      query = `
        SELECT
          s.id,
          s.user_id,
          s.challenge_id,
          s.file_name,
          s.content_type,
          (gr.result->>'overall')::float as score,
          s.created_at
        FROM submissions s
        JOIN grading_results gr ON s.id = gr.submission_id
        WHERE gr.track = $2
        ORDER BY score DESC
        LIMIT $1
      `;
    }

    const params = track === 'combined' ? [limit] : [limit, track];
    const results = await db.query(query, params);

    res.json({
      success: true,
      track,
      leaderboard: results.rows,
      count: results.rows.length
    });

  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper: Get submission from database
 */
async function getSubmission(id) {
  const result = await db.query(
    'SELECT * FROM submissions WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error('Submission not found');
  }

  return result.rows[0];
}

/**
 * Helper: Store grading result
 */
async function storeGradingResult(submissionId, track, result) {
  await db.query(
    `INSERT INTO grading_results
     (submission_id, track, result, score)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (submission_id, track)
     DO UPDATE SET result = $3, score = $4, updated_at = NOW()`,
    [submissionId, track, JSON.stringify(result), result.overall]
  );
}

/**
 * Helper: Calculate combined score from multiple tracks
 */
function calculateCombinedScore(results) {
  const tracks = Object.keys(results);

  if (tracks.length === 0) {
    return { overall: 0, tracks: {} };
  }

  // Calculate weighted average
  const weights = {
    visual: 0.3,
    logic: 0.5,
    audio: 0.2
  };

  let totalScore = 0;
  let totalWeight = 0;

  const trackScores = {};

  for (const track of tracks) {
    const weight = weights[track] || 0.33;
    const score = results[track].overall || 0;

    totalScore += score * weight;
    totalWeight += weight;
    trackScores[track] = score;
  }

  const overall = totalWeight > 0 ? totalScore / totalWeight : 0;

  return {
    overall: Math.round(overall * 100) / 100,
    tracks: trackScores,
    tracksGraded: tracks.length
  };
}

module.exports = { router, init };
