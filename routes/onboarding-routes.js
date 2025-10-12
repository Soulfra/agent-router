/**
 * Onboarding Routes
 *
 * API endpoints for progressive user onboarding survey system
 * with payment incentives for brand/idea building
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Database connection (injected via initRoutes)
let db = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;
  return router;
}

/**
 * POST /api/onboarding/start
 * Initialize new onboarding session
 */
router.post('/start', async (req, res) => {
  try {
    const sessionId = uuidv4();

    await db.query(`
      INSERT INTO user_profiles (session_id, current_level, completion_percentage)
      VALUES ($1, 1, 0)
    `, [sessionId]);

    res.json({
      success: true,
      sessionId,
      currentLevel: 1,
      message: 'Onboarding session started'
    });

  } catch (error) {
    console.error('[Onboarding] Start error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/onboarding/archetypes
 * Get all available archetypes
 */
router.get('/archetypes', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, slug, description, icon, traits, example_brands, color
      FROM archetypes
      ORDER BY id
    `);

    res.json({
      success: true,
      archetypes: result.rows
    });

  } catch (error) {
    console.error('[Onboarding] Archetypes error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/onboarding/questions/:level
 * Get all questions for a specific level
 */
router.get('/questions/:level', async (req, res) => {
  try {
    const level = parseInt(req.params.level);

    if (level < 1 || level > 10) {
      return res.status(400).json({ error: 'Level must be between 1 and 10' });
    }

    const result = await db.query(`
      SELECT id, level, question_order, question_text, question_type,
             options, placeholder, help_text, base_reward, category,
             validation_rules
      FROM survey_questions
      WHERE level = $1
      ORDER BY question_order
    `, [level]);

    res.json({
      success: true,
      level,
      questions: result.rows
    });

  } catch (error) {
    console.error('[Onboarding] Questions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/onboarding/submit
 * Submit answer to a question and calculate rewards
 */
router.post('/submit', async (req, res) => {
  try {
    const { sessionId, questionId, answer, answerMetadata = {} } = req.body;

    if (!sessionId || !questionId || !answer) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, questionId, answer'
      });
    }

    // Get profile
    const profileResult = await db.query(`
      SELECT id, current_level, completed_levels, earned_amount
      FROM user_profiles
      WHERE session_id = $1
    `, [sessionId]);

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const profile = profileResult.rows[0];

    // Get question details
    const questionResult = await db.query(`
      SELECT level, question_order, base_reward, question_type, category
      FROM survey_questions
      WHERE id = $1
    `, [questionId]);

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = questionResult.rows[0];

    // Save response
    await db.query(`
      INSERT INTO survey_responses (profile_id, question_id, answer, answer_metadata)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (profile_id, question_id)
      DO UPDATE SET
        answer = EXCLUDED.answer,
        answer_metadata = EXCLUDED.answer_metadata,
        updated_at = NOW()
    `, [profile.id, questionId, answer, JSON.stringify(answerMetadata)]);

    // Calculate quality score (simple length-based for now)
    let qualityScore = 50;
    if (typeof answer === 'string') {
      if (answer.length > 500) qualityScore = 100;
      else if (answer.length > 200) qualityScore = 80;
      else if (answer.length > 100) qualityScore = 70;
      else if (answer.length > 50) qualityScore = 60;
    }

    await db.query(`
      UPDATE survey_responses
      SET quality_score = $1
      WHERE profile_id = $2 AND question_id = $3
    `, [qualityScore, profile.id, questionId]);

    // Update earned amount
    const newEarned = parseFloat(profile.earned_amount) + parseFloat(question.base_reward);

    // Check if level is complete
    const levelQuestionsResult = await db.query(`
      SELECT COUNT(*) as total
      FROM survey_questions
      WHERE level = $1
    `, [question.level]);

    const answeredResult = await db.query(`
      SELECT COUNT(*) as answered
      FROM survey_responses sr
      JOIN survey_questions sq ON sr.question_id = sq.id
      WHERE sr.profile_id = $1 AND sq.level = $2
    `, [profile.id, question.level]);

    const totalQuestions = parseInt(levelQuestionsResult.rows[0].total);
    const answeredQuestions = parseInt(answeredResult.rows[0].answered);
    const levelComplete = answeredQuestions >= totalQuestions;

    // Update profile if level complete
    if (levelComplete && !profile.completed_levels.includes(question.level)) {
      const newCompletedLevels = [...profile.completed_levels, question.level];
      const nextLevel = question.level < 10 ? question.level + 1 : 10;
      const completionPct = Math.round((newCompletedLevels.length / 10) * 100);

      await db.query(`
        UPDATE user_profiles
        SET
          current_level = $1,
          completed_levels = $2,
          completion_percentage = $3,
          earned_amount = $4,
          completed_at = CASE WHEN $5 = 100 THEN NOW() ELSE completed_at END
        WHERE id = $6
      `, [nextLevel, newCompletedLevels, completionPct, newEarned, completionPct, profile.id]);
    } else {
      await db.query(`
        UPDATE user_profiles
        SET earned_amount = $1
        WHERE id = $2
      `, [newEarned, profile.id]);
    }

    // Handle archetype selection
    if (question.category === 'archetype' && answerMetadata.archetypeId) {
      await db.query(`
        UPDATE user_profiles
        SET archetype_id = $1
        WHERE id = $2
      `, [answerMetadata.archetypeId, profile.id]);
    }

    // Handle basic identity updates
    if (question.category === 'identity' && question.question_order === 1) {
      await db.query(`UPDATE user_profiles SET full_name = $1 WHERE id = $2`, [answer, profile.id]);
    }
    if (question.category === 'identity' && question.question_order === 2) {
      await db.query(`UPDATE user_profiles SET preferred_name = $1 WHERE id = $2`, [answer, profile.id]);
    }
    if (question.category === 'identity' && question.question_order === 3) {
      await db.query(`UPDATE user_profiles SET email = $1 WHERE id = $2`, [answer, profile.id]);
    }
    if (question.category === 'domain') {
      await db.query(`UPDATE user_profiles SET domain_interest = $1 WHERE id = $2`, [answer, profile.id]);
    }

    res.json({
      success: true,
      levelComplete,
      nextLevel: levelComplete && question.level < 10 ? question.level + 1 : question.level,
      earnedThisAnswer: question.base_reward,
      totalEarned: newEarned,
      qualityScore
    });

  } catch (error) {
    console.error('[Onboarding] Submit error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/onboarding/progress/:sessionId
 * Get user progress and stats
 */
router.get('/progress/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await db.query(`
      SELECT
        up.id,
        up.session_id,
        up.full_name,
        up.preferred_name,
        up.email,
        up.domain_interest,
        up.current_level,
        up.completed_levels,
        up.completion_percentage,
        up.earned_amount,
        up.payout_status,
        up.created_at,
        up.completed_at,
        a.name as archetype_name,
        a.slug as archetype_slug,
        a.color as archetype_color
      FROM user_profiles up
      LEFT JOIN archetypes a ON up.archetype_id = a.id
      WHERE up.session_id = $1
    `, [sessionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const profile = result.rows[0];

    // Get answer count
    const answersResult = await db.query(`
      SELECT COUNT(*) as total
      FROM survey_responses
      WHERE profile_id = $1
    `, [profile.id]);

    // Get quality stats
    const qualityResult = await db.query(`
      SELECT AVG(quality_score) as avg_quality
      FROM survey_responses
      WHERE profile_id = $1 AND quality_score IS NOT NULL
    `, [profile.id]);

    res.json({
      success: true,
      profile: {
        ...profile,
        total_answers: parseInt(answersResult.rows[0].total),
        avg_quality_score: qualityResult.rows[0].avg_quality ?
          Math.round(parseFloat(qualityResult.rows[0].avg_quality)) : null
      }
    });

  } catch (error) {
    console.error('[Onboarding] Progress error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/onboarding/brand-idea
 * Submit brand idea for bonus
 */
router.post('/brand-idea', async (req, res) => {
  try {
    const {
      sessionId,
      brandName,
      tagline,
      description,
      targetAudience,
      uniqueValueProp,
      businessModel,
      revenueStreams = [],
      brandPersonality = [],
      brandValues = [],
      competitors = [],
      differentiation
    } = req.body;

    if (!sessionId || !brandName || !description) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, brandName, description'
      });
    }

    // Get profile
    const profileResult = await db.query(`
      SELECT id, earned_amount
      FROM user_profiles
      WHERE session_id = $1
    `, [sessionId]);

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const profile = profileResult.rows[0];

    // Calculate viability and actionability scores
    let viabilityScore = 50;
    let actionabilityScore = 50;
    let bonusAmount = 20;

    // Simple scoring based on completeness
    const fields = [description, targetAudience, uniqueValueProp, differentiation];
    const filledFields = fields.filter(f => f && f.length > 50).length;
    viabilityScore = 50 + (filledFields * 10);

    if (businessModel && revenueStreams.length > 0) actionabilityScore += 20;
    if (competitors.length > 0) actionabilityScore += 15;
    if (uniqueValueProp && uniqueValueProp.length > 100) actionabilityScore += 15;

    // Bonus increases with quality
    if (viabilityScore > 80 && actionabilityScore > 80) bonusAmount = 50;
    else if (viabilityScore > 70 || actionabilityScore > 70) bonusAmount = 35;

    // Insert brand idea
    await db.query(`
      INSERT INTO brand_ideas (
        profile_id, brand_name, tagline, description, target_audience,
        unique_value_prop, business_model, revenue_streams, brand_personality,
        brand_values, competitors, differentiation, viability_score,
        actionability_score, bonus_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      profile.id, brandName, tagline, description, targetAudience,
      uniqueValueProp, businessModel, revenueStreams, brandPersonality,
      brandValues, competitors, differentiation, viabilityScore,
      actionabilityScore, bonusAmount
    ]);

    // Update earned amount
    const newEarned = parseFloat(profile.earned_amount) + bonusAmount;
    await db.query(`
      UPDATE user_profiles
      SET earned_amount = $1
      WHERE id = $2
    `, [newEarned, profile.id]);

    res.json({
      success: true,
      viabilityScore,
      actionabilityScore,
      bonusEarned: bonusAmount,
      totalEarned: newEarned,
      message: 'Brand idea submitted successfully'
    });

  } catch (error) {
    console.error('[Onboarding] Brand idea error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/onboarding/leaderboard
 * Get top users by completion
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM onboarding_leaderboard
      LIMIT 20
    `);

    res.json({
      success: true,
      leaderboard: result.rows
    });

  } catch (error) {
    console.error('[Onboarding] Leaderboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, initRoutes };
