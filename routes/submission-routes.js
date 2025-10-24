/**
 * Submission Routes
 *
 * File upload and content submission API
 * Preprocesses submissions and routes to grading tracks
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const SubmissionPreprocessor = require('../lib/submission-preprocessor');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/submissions');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common code file types
    const allowedExts = ['.js', '.py', '.html', '.css', '.json', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed`));
    }
  }
});

let db;
let preprocessor;

/**
 * Initialize submission routes
 */
function init(database) {
  db = database;
  preprocessor = new SubmissionPreprocessor();
  console.log('[Submission API] Initialized');
}

/**
 * POST /api/submissions/upload
 * Upload and preprocess a code submission
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Read file content
    const filePath = req.file.path;
    const content = await fs.readFile(filePath, 'utf-8');

    // Preprocess submission
    const preprocessed = preprocessor.preprocessSubmission(content, req.file.originalname);

    // Determine grading tracks
    const gradingTracks = preprocessor.determineGradingTracks(preprocessed);

    // Store in database
    const submissionId = await storeSubmission({
      userId: req.body.userId || 'anonymous',
      challengeId: req.body.challengeId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      filePath: filePath,
      contentType: preprocessed.type,
      rawContent: content,
      tracks: preprocessed.tracks,
      gradingTracks: gradingTracks,
      metadata: preprocessed.metadata
    });

    // Get submission info
    const info = preprocessor.getSubmissionInfo(preprocessed);

    res.json({
      success: true,
      submissionId,
      info,
      gradingTracks,
      message: `Submission preprocessed successfully. Ready for ${gradingTracks.join(', ')} grading.`
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/submissions/text
 * Submit code as text (no file upload)
 */
router.post('/text', async (req, res) => {
  try {
    const { code, fileName, userId, challengeId } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code content required'
      });
    }

    // Preprocess submission
    const preprocessed = preprocessor.preprocessSubmission(code, fileName || 'submission.txt');

    // Determine grading tracks
    const gradingTracks = preprocessor.determineGradingTracks(preprocessed);

    // Store in database
    const submissionId = await storeSubmission({
      userId: userId || 'anonymous',
      challengeId: challengeId,
      fileName: fileName || 'submission.txt',
      fileSize: code.length,
      filePath: null,
      contentType: preprocessed.type,
      rawContent: code,
      tracks: preprocessed.tracks,
      gradingTracks: gradingTracks,
      metadata: preprocessed.metadata
    });

    // Get submission info
    const info = preprocessor.getSubmissionInfo(preprocessed);

    res.json({
      success: true,
      submissionId,
      info,
      gradingTracks,
      message: `Submission preprocessed successfully. Ready for ${gradingTracks.join(', ')} grading.`
    });

  } catch (error) {
    console.error('Text submission error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/submissions/:id
 * Get submission details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const submission = await db.query(
      'SELECT * FROM submissions WHERE id = $1',
      [id]
    );

    if (submission.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }

    res.json({
      success: true,
      submission: submission.rows[0]
    });

  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/submissions/:id/track/:track
 * Get specific track content for grading
 */
router.get('/:id/track/:track', async (req, res) => {
  try {
    const { id, track } = req.params;

    const submission = await db.query(
      'SELECT * FROM submissions WHERE id = $1',
      [id]
    );

    if (submission.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }

    const sub = submission.rows[0];
    const tracks = sub.tracks;

    // Prepare content for specific track
    const preprocessed = {
      raw: sub.raw_content,
      tracks: tracks,
      metadata: sub.metadata
    };

    const content = preprocessor.prepareForTrack(preprocessed, track);

    if (!content) {
      return res.status(404).json({
        success: false,
        error: `Track '${track}' not found in submission`
      });
    }

    res.json({
      success: true,
      track,
      content,
      metadata: {
        submissionId: id,
        contentType: sub.content_type,
        size: content.length
      }
    });

  } catch (error) {
    console.error('Get track error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/submissions/user/:userId
 * Get all submissions for a user
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const submissions = await db.query(
      `SELECT id, user_id, challenge_id, file_name, content_type,
              grading_tracks, metadata, created_at
       FROM submissions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({
      success: true,
      submissions: submissions.rows,
      count: submissions.rows.length
    });

  } catch (error) {
    console.error('Get user submissions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/submissions/challenge/:challengeId
 * Get all submissions for a challenge
 */
router.get('/challenge/:challengeId', async (req, res) => {
  try {
    const { challengeId } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const submissions = await db.query(
      `SELECT id, user_id, file_name, content_type,
              grading_tracks, metadata, created_at
       FROM submissions
       WHERE challenge_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [challengeId, limit, offset]
    );

    res.json({
      success: true,
      submissions: submissions.rows,
      count: submissions.rows.length
    });

  } catch (error) {
    console.error('Get challenge submissions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/submissions/:id
 * Delete a submission
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get submission to delete file
    const submission = await db.query(
      'SELECT file_path FROM submissions WHERE id = $1',
      [id]
    );

    if (submission.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }

    // Delete file if exists
    const filePath = submission.rows[0].file_path;
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.warn('Failed to delete file:', err.message);
      }
    }

    // Delete from database
    await db.query('DELETE FROM submissions WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Submission deleted'
    });

  } catch (error) {
    console.error('Delete submission error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/submissions/:id/reprocess
 * Reprocess a submission (update tracks)
 */
router.post('/:id/reprocess', async (req, res) => {
  try {
    const { id } = req.params;

    // Get submission
    const submission = await db.query(
      'SELECT * FROM submissions WHERE id = $1',
      [id]
    );

    if (submission.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }

    const sub = submission.rows[0];

    // Reprocess with latest preprocessor
    const preprocessed = preprocessor.preprocessSubmission(sub.raw_content, sub.file_name);
    const gradingTracks = preprocessor.determineGradingTracks(preprocessed);

    // Update database
    await db.query(
      `UPDATE submissions
       SET tracks = $1, grading_tracks = $2, metadata = $3, updated_at = NOW()
       WHERE id = $4`,
      [preprocessed.tracks, gradingTracks, preprocessed.metadata, id]
    );

    const info = preprocessor.getSubmissionInfo(preprocessed);

    res.json({
      success: true,
      message: 'Submission reprocessed',
      info,
      gradingTracks
    });

  } catch (error) {
    console.error('Reprocess error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/submissions/stats
 * Get submission statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total_submissions,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT challenge_id) as challenges_attempted,
        content_type,
        COUNT(*) as count_by_type
      FROM submissions
      GROUP BY content_type
    `);

    // Get grading track stats
    const trackStats = await db.query(`
      SELECT
        unnest(grading_tracks) as track,
        COUNT(*) as count
      FROM submissions
      GROUP BY track
    `);

    res.json({
      success: true,
      stats: {
        overview: stats.rows[0] || {},
        byType: stats.rows,
        byTrack: trackStats.rows
      }
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper: Store submission in database
 */
async function storeSubmission(data) {
  const result = await db.query(
    `INSERT INTO submissions
     (user_id, challenge_id, file_name, file_size, file_path,
      content_type, raw_content, tracks, grading_tracks, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      data.userId,
      data.challengeId,
      data.fileName,
      data.fileSize,
      data.filePath,
      data.contentType,
      data.rawContent,
      JSON.stringify(data.tracks),
      data.gradingTracks,
      JSON.stringify(data.metadata)
    ]
  );

  return result.rows[0].id;
}

module.exports = { router, init };
