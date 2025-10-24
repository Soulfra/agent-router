/**
 * Voice Onboarding Auth Routes
 *
 * API routes for the voice onboarding system that combines:
 * - Voice transcription
 * - Personality profiling
 * - Authentication
 * - Brand strategy building
 * - Easter hunt matching
 *
 * Routes:
 * - POST /api/voice-onboarding/start - Start new session
 * - POST /api/voice-onboarding/answer - Submit voice answer
 * - GET /api/voice-onboarding/session/:sessionId - Get session status
 * - GET /api/voice-onboarding/questions - Get all questions
 * - GET /api/voice-onboarding/leaderboard - Get leaderboard
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const VoiceOnboardingAuth = require('../lib/voice-onboarding-auth');

// Initialize voice auth system
const voiceAuth = new VoiceOnboardingAuth();

// Configure multer for audio upload
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadDir = path.join(__dirname, '../uploads/voice-onboarding');
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}.webm`;
      cb(null, uniqueName);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/mp4'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio format. Please use WebM, MP3, WAV, or MP4.'));
    }
  }
});

/**
 * POST /api/voice-onboarding/start
 * Start a new voice onboarding session
 *
 * Body:
 * {
 *   "email": "user@example.com",
 *   "username": "optional_username"
 * }
 *
 * Response:
 * {
 *   "sessionId": "abc123",
 *   "currentQuestion": { id: 1, text: "...", ... },
 *   "totalQuestions": 10
 * }
 */
router.post('/start', async (req, res) => {
  try {
    const { email, username } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required'
      });
    }

    const result = await voiceAuth.startSession(email, username);

    res.json({
      sessionId: result.sessionId,
      currentQuestion: result.currentQuestion,
      totalQuestions: 10,
      status: 'started'
    });

  } catch (error) {
    console.error('Error starting voice onboarding session:', error);
    res.status(500).json({
      error: 'Failed to start session',
      message: error.message
    });
  }
});

/**
 * POST /api/voice-onboarding/answer
 * Submit a voice answer for the current question
 *
 * Multipart form data:
 * - audio: Audio file (webm, mp3, wav)
 * - sessionId: Session ID
 * - questionId: Question ID
 *
 * Response:
 * {
 *   "transcript": "My name is John...",
 *   "analysis": { keywords: [...], sentiment: "positive", ... },
 *   "reward": 5.00,
 *   "nextQuestion": { id: 2, ... } | null,
 *   "progress": {
 *     "completed": 1,
 *     "total": 10,
 *     "percentage": 10
 *   }
 * }
 */
router.post('/answer', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId, questionId } = req.body;
    const audioFile = req.file;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    if (!questionId) {
      return res.status(400).json({ error: 'Question ID is required' });
    }

    if (!audioFile) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    // Read audio file as buffer
    const audioBuffer = await fs.readFile(audioFile.path);

    // Process the answer
    const result = await voiceAuth.processAnswer(
      sessionId,
      audioBuffer,
      parseInt(questionId)
    );

    // Clean up uploaded file
    await fs.unlink(audioFile.path).catch(() => {});

    res.json({
      transcript: result.transcript,
      analysis: result.analysis,
      reward: result.reward,
      nextQuestion: result.nextQuestion,
      progress: result.progress,
      session: result.session
    });

  } catch (error) {
    console.error('Error processing voice answer:', error);

    // Clean up uploaded file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    res.status(500).json({
      error: 'Failed to process answer',
      message: error.message
    });
  }
});

/**
 * GET /api/voice-onboarding/session/:sessionId
 * Get session status and progress
 *
 * Response:
 * {
 *   "sessionId": "abc123",
 *   "email": "user@example.com",
 *   "currentQuestion": 3,
 *   "questionsCompleted": 2,
 *   "totalReward": 15.00,
 *   "detectedArchetype": "creator",
 *   "detectedBrandDomain": "soulfra.com",
 *   "status": "active",
 *   "progress": {
 *     "completed": 2,
 *     "total": 10,
 *     "percentage": 20
 *   }
 * }
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await voiceAuth.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    const progress = {
      completed: session.questions_completed,
      total: session.total_questions,
      percentage: Math.round((session.questions_completed / session.total_questions) * 100)
    };

    res.json({
      sessionId: session.session_id,
      email: session.email,
      username: session.username,
      currentQuestion: session.current_question,
      questionsCompleted: session.questions_completed,
      totalReward: parseFloat(session.total_reward),
      detectedArchetype: session.detected_archetype,
      detectedBrandDomain: session.detected_brand_domain,
      interestKeywords: session.interest_keywords,
      easterHuntMatches: session.easter_hunt_matches,
      status: session.status,
      progress,
      startedAt: session.started_at,
      completedAt: session.completed_at
    });

  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({
      error: 'Failed to fetch session',
      message: error.message
    });
  }
});

/**
 * GET /api/voice-onboarding/questions
 * Get all questions in the voice onboarding
 *
 * Response:
 * {
 *   "questions": [
 *     {
 *       "id": 1,
 *       "level": 1,
 *       "ageLevel": "5 years old",
 *       "text": "What's your name and what do you want to build?",
 *       "guidance": "Just tell me...",
 *       "minDuration": 5,
 *       "maxDuration": 15,
 *       "reward": 5.00,
 *       "category": "identity"
 *     },
 *     ...
 *   ],
 *   "totalReward": 175.00
 * }
 */
router.get('/questions', (req, res) => {
  try {
    const questions = voiceAuth.questions;
    const totalReward = questions.reduce((sum, q) => sum + q.reward, 0);

    res.json({
      questions,
      totalReward,
      totalQuestions: questions.length
    });

  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({
      error: 'Failed to fetch questions',
      message: error.message
    });
  }
});

/**
 * GET /api/voice-onboarding/leaderboard
 * Get leaderboard of completed sessions
 *
 * Response:
 * {
 *   "leaderboard": [
 *     {
 *       "username": "john",
 *       "archetype": "creator",
 *       "reward": 175.00,
 *       "completionPercentage": 100,
 *       "avgQuality": 85,
 *       "completedAt": "2025-01-15T10:30:00Z"
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const result = await voiceAuth.db.query(`
      SELECT
        vos.username,
        vos.detected_archetype as archetype,
        vos.total_reward as reward,
        vos.completion_percentage,
        AVG(voa.quality_score)::numeric(5,2) as avg_quality,
        vos.completed_at
      FROM voice_onboarding_sessions vos
      LEFT JOIN voice_onboarding_answers voa ON vos.session_id = voa.session_id
      WHERE vos.status = 'completed'
      GROUP BY vos.session_id
      ORDER BY vos.completion_percentage DESC, vos.total_reward DESC, vos.completed_at ASC
      LIMIT $1
    `, [limit]);

    res.json({
      leaderboard: result.rows.map(row => ({
        username: row.username || 'Anonymous',
        archetype: row.archetype,
        reward: parseFloat(row.reward),
        completionPercentage: row.completion_percentage,
        avgQuality: parseFloat(row.avg_quality) || null,
        completedAt: row.completed_at
      }))
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      error: 'Failed to fetch leaderboard',
      message: error.message
    });
  }
});

/**
 * GET /api/voice-onboarding/analytics
 * Get analytics for voice onboarding system
 *
 * Response:
 * {
 *   "totalSessions": 150,
 *   "completedSessions": 45,
 *   "activeSessions": 23,
 *   "abandonedSessions": 82,
 *   "totalRewardsEarned": 7875.00,
 *   "avgRewardPerSession": 52.50,
 *   "pendingPayouts": 1575.00,
 *   "approvedPayouts": 3150.00,
 *   "paidPayouts": 3150.00,
 *   "maxRewardSessions": 45,
 *   "archetypeDistribution": {
 *     "creator": 15,
 *     "visionary": 8,
 *     ...
 *   }
 * }
 */
router.get('/analytics', async (req, res) => {
  try {
    // Get basic analytics
    const analyticsResult = await voiceAuth.db.query(`
      SELECT * FROM voice_onboarding_payment_analytics
    `);
    const analytics = analyticsResult.rows[0];

    // Get archetype distribution
    const archetypeResult = await voiceAuth.db.query(`
      SELECT
        detected_archetype,
        COUNT(*) as count
      FROM voice_onboarding_sessions
      WHERE detected_archetype IS NOT NULL
      GROUP BY detected_archetype
      ORDER BY count DESC
    `);

    const archetypeDistribution = {};
    archetypeResult.rows.forEach(row => {
      archetypeDistribution[row.detected_archetype] = parseInt(row.count);
    });

    // Get domain distribution
    const domainResult = await voiceAuth.db.query(`
      SELECT
        detected_brand_domain,
        COUNT(*) as count
      FROM voice_onboarding_sessions
      WHERE detected_brand_domain IS NOT NULL
      GROUP BY detected_brand_domain
      ORDER BY count DESC
    `);

    const domainDistribution = {};
    domainResult.rows.forEach(row => {
      domainDistribution[row.detected_brand_domain] = parseInt(row.count);
    });

    res.json({
      totalSessions: parseInt(analytics.total_sessions),
      completedSessions: parseInt(analytics.completed_sessions),
      activeSessions: parseInt(analytics.active_sessions),
      abandonedSessions: parseInt(analytics.abandoned_sessions),
      totalRewardsEarned: parseFloat(analytics.total_rewards_earned),
      avgRewardPerSession: parseFloat(analytics.avg_reward_per_session),
      pendingPayouts: parseFloat(analytics.pending_payouts),
      approvedPayouts: parseFloat(analytics.approved_payouts),
      paidPayouts: parseFloat(analytics.paid_payouts),
      maxRewardSessions: parseInt(analytics.max_reward_sessions),
      archetypeDistribution,
      domainDistribution
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      error: 'Failed to fetch analytics',
      message: error.message
    });
  }
});

/**
 * GET /api/voice-onboarding/easter-hunts
 * Get available easter hunt opportunities
 *
 * Query params:
 * - archetype: Filter by archetype (optional)
 * - domain: Filter by domain (optional)
 * - status: Filter by status (default: 'active')
 *
 * Response:
 * {
 *   "opportunities": [
 *     {
 *       "huntId": "ai-agent-builder",
 *       "name": "AI Agent Builder Challenge",
 *       "description": "Build autonomous AI agents...",
 *       "domain": "calriven.com",
 *       "bounty": 500.00,
 *       "difficulty": "intermediate",
 *       "slotsAvailable": 3
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/easter-hunts', async (req, res) => {
  try {
    const { archetype, domain, status = 'active' } = req.query;

    let query = `
      SELECT * FROM easter_hunt_opportunities
      WHERE status = $1
    `;
    const params = [status];

    if (archetype) {
      query += ` AND $${params.length + 1} = ANY(required_archetypes)`;
      params.push(archetype);
    }

    if (domain) {
      query += ` AND domain = $${params.length + 1}`;
      params.push(domain);
    }

    query += ` ORDER BY bounty DESC`;

    const result = await voiceAuth.db.query(query, params);

    res.json({
      opportunities: result.rows.map(row => ({
        huntId: row.hunt_id,
        name: row.name,
        description: row.description,
        domain: row.domain,
        requiredArchetypes: row.required_archetypes,
        requiredKeywords: row.required_keywords,
        requiredSkills: row.required_skills,
        bounty: parseFloat(row.bounty),
        equityPercentage: parseFloat(row.equity_percentage),
        difficulty: row.difficulty,
        timeCommitment: row.time_commitment,
        slotsAvailable: row.slots_available - row.slots_filled
      }))
    });

  } catch (error) {
    console.error('Error fetching easter hunts:', error);
    res.status(500).json({
      error: 'Failed to fetch easter hunts',
      message: error.message
    });
  }
});

/**
 * Error handler
 */
router.use((error, req, res, next) => {
  console.error('Voice onboarding route error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

module.exports = router;
