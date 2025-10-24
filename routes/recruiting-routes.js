/**
 * Recruiting Routes - Resume upload and talent ranking
 *
 * Handles:
 * - Resume uploads (PDF/DOCX/TXT)
 * - Resume parsing and skill extraction
 * - Candidate scoring and ranking
 * - Top performer identification for OSS programs
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const ResumeParser = require('../lib/resume-parser');
const TalentRanker = require('../lib/talent-ranker');

/**
 * Configure multer for resume uploads
 */
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/resumes');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const userId = req.user?.userId || req.user?.user_id || 'anonymous';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `resume_${userId}_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.pdf', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowedExts.includes(ext)) {
      return cb(new Error(`Invalid file type. Allowed: ${allowedExts.join(', ')}`));
    }

    // Check mimetype
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Invalid file mimetype'));
    }

    cb(null, true);
  }
});

/**
 * Initialize routes with database connection
 */
function initializeRoutes(db) {
  if (!db) {
    throw new Error('Database connection required for recruiting routes');
  }

  const resumeParser = new ResumeParser();
  const talentRanker = new TalentRanker(db);

  /**
   * POST /api/recruiting/resume/upload
   * Upload and parse resume
   */
  router.post('/resume/upload', upload.single('resume'), async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Parse the resume
      const parsed = await resumeParser.parseResume(req.file.path);

      if (!parsed) {
        return res.status(500).json({ error: 'Failed to parse resume' });
      }

      // Store parsed resume in database
      await db.query(
        `INSERT INTO job_applications (
          user_id, parsed_resume, resume_file_path, status
        ) VALUES ($1, $2, $3, 'pending')
        ON CONFLICT (user_id) DO UPDATE SET
          parsed_resume = EXCLUDED.parsed_resume,
          resume_file_path = EXCLUDED.resume_file_path,
          updated_at = NOW()`,
        [userId, JSON.stringify(parsed), req.file.path]
      );

      // Update user profile with resume skills
      await db.query(
        `UPDATE user_profiles
        SET resume_skills = $1
        WHERE user_id = $2`,
        [JSON.stringify(parsed.skills), userId]
      );

      // Calculate initial talent score
      const score = await talentRanker.scoreCandidate(userId);

      if (score) {
        await talentRanker.saveRanking(userId, score);
      }

      res.json({
        success: true,
        message: 'Resume uploaded and parsed successfully',
        parsed: {
          contact: parsed.contact,
          skills: parsed.skills,
          experience: parsed.experience,
          education: parsed.education,
          projects: parsed.projects,
          summary: parsed.summary,
          wordCount: parsed.wordCount
        },
        score: score ? {
          total_score: score.total_score,
          percentile: score.percentile,
          is_top_performer: score.is_top_performer
        } : null
      });

    } catch (error) {
      console.error('[Recruiting] Error uploading resume:', error);

      // Clean up file if it exists
      if (req.file?.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('[Recruiting] Error cleaning up file:', unlinkError);
        }
      }

      res.status(500).json({
        error: 'Failed to upload resume',
        details: error.message
      });
    }
  });

  /**
   * GET /api/recruiting/resume/parsed
   * Get parsed resume data for current user
   */
  router.get('/resume/parsed', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const result = await db.query(
        `SELECT parsed_resume, created_at, updated_at
        FROM job_applications
        WHERE user_id = $1
        LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No resume found' });
      }

      res.json({
        parsed_resume: result.rows[0].parsed_resume,
        uploaded_at: result.rows[0].created_at,
        updated_at: result.rows[0].updated_at
      });

    } catch (error) {
      console.error('[Recruiting] Error fetching parsed resume:', error);
      res.status(500).json({
        error: 'Failed to fetch resume',
        details: error.message
      });
    }
  });

  /**
   * GET /api/recruiting/score
   * Get talent score for current user
   */
  router.get('/score', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const requiredSkills = req.query.skills
        ? req.query.skills.split(',').map(s => s.trim())
        : null;

      const score = await talentRanker.scoreCandidate(userId, requiredSkills);

      if (!score) {
        return res.status(500).json({ error: 'Failed to calculate score' });
      }

      // Save ranking for future reference
      await talentRanker.saveRanking(userId, score);

      res.json(score);

    } catch (error) {
      console.error('[Recruiting] Error calculating score:', error);
      res.status(500).json({
        error: 'Failed to calculate score',
        details: error.message
      });
    }
  });

  /**
   * GET /api/recruiting/rankings
   * Get ranked list of all candidates (admin/recruiter view)
   */
  router.get('/rankings', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // TODO: Add admin/recruiter check

      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const requiredSkills = req.query.skills
        ? req.query.skills.split(',').map(s => s.trim())
        : null;

      const rankings = await talentRanker.rankAllCandidates(limit, requiredSkills);

      res.json({
        count: rankings.length,
        limit: limit,
        rankings: rankings
      });

    } catch (error) {
      console.error('[Recruiting] Error fetching rankings:', error);
      res.status(500).json({
        error: 'Failed to fetch rankings',
        details: error.message
      });
    }
  });

  /**
   * GET /api/recruiting/top-performers
   * Get top 10% performers for OSS programs
   */
  router.get('/top-performers', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // TODO: Add admin check

      const topPercent = Math.min(parseInt(req.query.percent) || 10, 50);
      const topPerformers = await talentRanker.getTopPerformers(topPercent);

      res.json({
        top_percent: topPercent,
        count: topPerformers.length,
        performers: topPerformers
      });

    } catch (error) {
      console.error('[Recruiting] Error fetching top performers:', error);
      res.status(500).json({
        error: 'Failed to fetch top performers',
        details: error.message
      });
    }
  });

  /**
   * POST /api/recruiting/apply/:jobId
   * Apply to a specific job posting
   */
  router.post('/apply/:jobId', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const jobId = parseInt(req.params.jobId);
      const { coverLetter } = req.body;

      // Check if job exists
      const jobResult = await db.query(
        `SELECT * FROM job_postings WHERE job_id = $1`,
        [jobId]
      );

      if (jobResult.rows.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const job = jobResult.rows[0];

      // Check if user has uploaded resume
      const resumeResult = await db.query(
        `SELECT parsed_resume FROM job_applications WHERE user_id = $1 LIMIT 1`,
        [userId]
      );

      if (resumeResult.rows.length === 0) {
        return res.status(400).json({
          error: 'Please upload your resume before applying'
        });
      }

      const parsed = resumeResult.rows[0].parsed_resume;
      const candidateSkills = parsed.skills || [];

      // Calculate skill match
      const requiredSkills = job.required_skills || [];
      const skillMatchScore = resumeParser.calculateSkillMatch(candidateSkills, requiredSkills);

      // Create application
      await db.query(
        `UPDATE job_applications
        SET
          job_id = $1,
          cover_letter = $2,
          skill_match_score = $3,
          status = 'applied',
          updated_at = NOW()
        WHERE user_id = $4`,
        [jobId, coverLetter, skillMatchScore, userId]
      );

      res.json({
        success: true,
        message: 'Application submitted successfully',
        job_id: jobId,
        skill_match_score: skillMatchScore
      });

    } catch (error) {
      console.error('[Recruiting] Error submitting application:', error);
      res.status(500).json({
        error: 'Failed to submit application',
        details: error.message
      });
    }
  });

  /**
   * GET /api/recruiting/jobs
   * List available job postings
   */
  router.get('/jobs', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;

      const result = await db.query(
        `SELECT
          job_id, title, company, location, job_type,
          required_skills, description, salary_range,
          created_at
        FROM job_postings
        WHERE is_active = true
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      res.json({
        count: result.rows.length,
        jobs: result.rows
      });

    } catch (error) {
      console.error('[Recruiting] Error fetching jobs:', error);
      res.status(500).json({
        error: 'Failed to fetch jobs',
        details: error.message
      });
    }
  });

  /**
   * GET /api/recruiting/jobs/:jobId
   * Get specific job details
   */
  router.get('/jobs/:jobId', async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);

      const result = await db.query(
        `SELECT * FROM job_postings WHERE job_id = $1`,
        [jobId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json(result.rows[0]);

    } catch (error) {
      console.error('[Recruiting] Error fetching job:', error);
      res.status(500).json({
        error: 'Failed to fetch job',
        details: error.message
      });
    }
  });

  /**
   * GET /api/recruiting/my-applications
   * Get current user's applications
   */
  router.get('/my-applications', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const result = await db.query(
        `SELECT
          ja.application_id, ja.job_id, ja.skill_match_score,
          ja.status, ja.created_at, ja.updated_at,
          jp.title as job_title, jp.company, jp.location
        FROM job_applications ja
        LEFT JOIN job_postings jp ON ja.job_id = jp.job_id
        WHERE ja.user_id = $1
        ORDER BY ja.created_at DESC`,
        [userId]
      );

      res.json({
        count: result.rows.length,
        applications: result.rows
      });

    } catch (error) {
      console.error('[Recruiting] Error fetching applications:', error);
      res.status(500).json({
        error: 'Failed to fetch applications',
        details: error.message
      });
    }
  });

  /**
   * POST /api/recruiting/refresh-score
   * Recalculate score for current user (after completing surveys, etc.)
   */
  router.post('/refresh-score', async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const score = await talentRanker.scoreCandidate(userId);

      if (!score) {
        return res.status(500).json({ error: 'Failed to calculate score' });
      }

      await talentRanker.saveRanking(userId, score);

      res.json({
        success: true,
        message: 'Score refreshed successfully',
        score: score
      });

    } catch (error) {
      console.error('[Recruiting] Error refreshing score:', error);
      res.status(500).json({
        error: 'Failed to refresh score',
        details: error.message
      });
    }
  });

  return router;
}

module.exports = { initializeRoutes };
