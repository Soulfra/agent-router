/**
 * Talent Ranking System
 *
 * Scores and ranks candidates based on multiple factors:
 * - Survey completion and quality
 * - Resume skill matches
 * - Brand idea contributions
 * - Project portfolio strength
 * - Overall engagement metrics
 *
 * Identifies top 10% for hiring through OSS programs (OpenRouter, YC, etc.)
 */

const ResumeParser = require('./resume-parser');

class TalentRanker {
  constructor(db) {
    this.db = db;
    this.resumeParser = new ResumeParser();

    if (!this.db) {
      console.warn('[TalentRanker] No database connection - ranker disabled');
    }

    // Scoring weights (total = 100)
    this.weights = {
      surveyCompletion: 20,      // Survey progress (0-100%)
      surveyQuality: 25,          // Quality of survey answers
      skillMatch: 25,             // Resume skills vs job requirements
      brandIdeas: 15,             // Brand idea contributions
      portfolio: 10,              // GitHub projects and activity
      engagement: 5               // Overall platform engagement
    };

    // Top performer threshold
    this.topPerformerPercentile = 90; // Top 10%
  }

  /**
   * Calculate comprehensive score for a candidate
   * @param {number} userId - User ID to score
   * @param {array} requiredSkills - Optional job skills to match against
   * @returns {Promise<object>} Score breakdown and ranking
   */
  async scoreCandidate(userId, requiredSkills = null) {
    if (!this.db) return null;

    try {
      const scores = {
        surveyCompletion: await this._scoreSurveyCompletion(userId),
        surveyQuality: await this._scoreSurveyQuality(userId),
        skillMatch: await this._scoreSkillMatch(userId, requiredSkills),
        brandIdeas: await this._scoreBrandIdeas(userId),
        portfolio: await this._scorePortfolio(userId),
        engagement: await this._scoreEngagement(userId)
      };

      // Calculate weighted total (0-100)
      const totalScore = Object.keys(scores).reduce((sum, key) => {
        return sum + (scores[key] * this.weights[key] / 100);
      }, 0);

      // Get percentile rank
      const percentile = await this._getPercentileRank(userId, totalScore);

      // Determine if top performer
      const isTopPerformer = percentile >= this.topPerformerPercentile;

      // Generate recommendation summary
      const recommendation = await this._generateRecommendation(userId, scores, totalScore);

      return {
        user_id: userId,
        total_score: Math.round(totalScore * 100) / 100,
        percentile: percentile,
        is_top_performer: isTopPerformer,
        scores: scores,
        recommendation: recommendation,
        calculated_at: new Date()
      };

    } catch (error) {
      console.error('[TalentRanker] Error scoring candidate:', error);
      return null;
    }
  }

  /**
   * Score survey completion (0-100)
   */
  async _scoreSurveyCompletion(userId) {
    try {
      const result = await this.db.query(
        `SELECT
          up.survey_level,
          COUNT(sr.response_id) as responses_count
        FROM user_profiles up
        LEFT JOIN survey_responses sr ON up.session_id = sr.session_id
        WHERE up.user_id = $1
        GROUP BY up.survey_level`,
        [userId]
      );

      if (result.rows.length === 0) return 0;

      const level = result.rows[0].survey_level || 0;
      const responsesCount = result.rows[0].responses_count || 0;

      // Max 10 levels
      const levelScore = (level / 10) * 100;

      // Bonus for actual responses (some levels might be skipped)
      const responseBonus = Math.min(responsesCount * 2, 20);

      return Math.min(levelScore + responseBonus, 100);

    } catch (error) {
      console.error('[TalentRanker] Error scoring survey completion:', error);
      return 0;
    }
  }

  /**
   * Score quality of survey answers (0-100)
   */
  async _scoreSurveyQuality(userId) {
    try {
      const result = await this.db.query(
        `SELECT
          AVG(sr.quality_score)::INTEGER as avg_quality,
          COUNT(*) as total_responses,
          AVG(LENGTH(sr.answer))::INTEGER as avg_length
        FROM survey_responses sr
        JOIN user_profiles up ON sr.session_id = up.session_id
        WHERE up.user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0 || !result.rows[0].total_responses) return 0;

      const avgQuality = result.rows[0].avg_quality || 0;
      const avgLength = result.rows[0].avg_length || 0;

      // Base on quality score (already 0-100)
      let score = avgQuality;

      // Bonus for detailed answers (>300 chars avg)
      if (avgLength > 300) score += 10;
      else if (avgLength > 150) score += 5;

      return Math.min(score, 100);

    } catch (error) {
      console.error('[TalentRanker] Error scoring survey quality:', error);
      return 0;
    }
  }

  /**
   * Score skill match from resume (0-100)
   */
  async _scoreSkillMatch(userId, requiredSkills = null) {
    try {
      // Get user's resume data if stored
      const resumeResult = await this.db.query(
        `SELECT parsed_resume FROM job_applications WHERE user_id = $1 LIMIT 1`,
        [userId]
      );

      if (resumeResult.rows.length === 0 || !resumeResult.rows[0].parsed_resume) {
        // Try to get from user profile
        const profileResult = await this.db.query(
          `SELECT resume_skills FROM user_profiles WHERE user_id = $1`,
          [userId]
        );

        if (profileResult.rows.length === 0 || !profileResult.rows[0].resume_skills) {
          return 0;
        }

        const skills = profileResult.rows[0].resume_skills;

        if (!requiredSkills || requiredSkills.length === 0) {
          // No required skills - score based on number of skills
          return Math.min((skills.length / 10) * 100, 100);
        }

        // Calculate match score
        return this.resumeParser.calculateSkillMatch(skills, requiredSkills);
      }

      const parsedResume = resumeResult.rows[0].parsed_resume;
      const candidateSkills = parsedResume.skills || [];

      if (!requiredSkills || requiredSkills.length === 0) {
        // No required skills - score based on breadth of skills
        return Math.min((candidateSkills.length / 10) * 100, 100);
      }

      // Calculate match score vs required skills
      return this.resumeParser.calculateSkillMatch(candidateSkills, requiredSkills);

    } catch (error) {
      console.error('[TalentRanker] Error scoring skill match:', error);
      return 0;
    }
  }

  /**
   * Score brand idea contributions (0-100)
   */
  async _scoreBrandIdeas(userId) {
    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) as ideas_count,
          AVG(viability_score)::INTEGER as avg_viability,
          AVG(actionability_score)::INTEGER as avg_actionability,
          COUNT(*) FILTER (WHERE viability_score >= 80 AND actionability_score >= 80) as excellent_ideas
        FROM brand_ideas
        WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0 || !result.rows[0].ideas_count) return 0;

      const ideasCount = result.rows[0].ideas_count || 0;
      const avgViability = result.rows[0].avg_viability || 0;
      const avgActionability = result.rows[0].avg_actionability || 0;
      const excellentIdeas = result.rows[0].excellent_ideas || 0;

      // Base score from idea quality
      const qualityScore = (avgViability + avgActionability) / 2;

      // Bonus for volume (up to 20 points)
      const volumeBonus = Math.min(ideasCount * 5, 20);

      // Bonus for excellent ideas (up to 30 points)
      const excellenceBonus = Math.min(excellentIdeas * 10, 30);

      return Math.min(qualityScore + volumeBonus + excellenceBonus, 100);

    } catch (error) {
      console.error('[TalentRanker] Error scoring brand ideas:', error);
      return 0;
    }
  }

  /**
   * Score portfolio/projects (0-100)
   */
  async _scorePortfolio(userId) {
    try {
      // Get resume data with projects
      const resumeResult = await this.db.query(
        `SELECT parsed_resume FROM job_applications WHERE user_id = $1 LIMIT 1`,
        [userId]
      );

      if (resumeResult.rows.length === 0 || !resumeResult.rows[0].parsed_resume) {
        return 0;
      }

      const parsedResume = resumeResult.rows[0].parsed_resume;
      const projects = parsedResume.projects || [];
      const githubUrl = parsedResume.contact?.github || null;

      let score = 0;

      // Projects listed
      score += Math.min(projects.length * 15, 50);

      // GitHub profile linked
      if (githubUrl) score += 30;

      // Experience level
      const experience = parsedResume.experience || [];
      score += Math.min(experience.length * 5, 20);

      return Math.min(score, 100);

    } catch (error) {
      console.error('[TalentRanker] Error scoring portfolio:', error);
      return 0;
    }
  }

  /**
   * Score overall platform engagement (0-100)
   */
  async _scoreEngagement(userId) {
    try {
      const result = await this.db.query(
        `SELECT
          COUNT(DISTINCT DATE(created_at)) as active_days,
          COUNT(*) as total_actions,
          MAX(created_at) as last_active
        FROM (
          SELECT created_at FROM survey_responses WHERE session_id IN (SELECT session_id FROM user_profiles WHERE user_id = $1)
          UNION ALL
          SELECT created_at FROM brand_ideas WHERE user_id = $1
          UNION ALL
          SELECT created_at FROM job_applications WHERE user_id = $1
        ) as activities`,
        [userId]
      );

      if (result.rows.length === 0) return 0;

      const activeDays = result.rows[0].active_days || 0;
      const totalActions = result.rows[0].total_actions || 0;
      const lastActive = result.rows[0].last_active ? new Date(result.rows[0].last_active) : null;

      let score = 0;

      // Active days (up to 40 points)
      score += Math.min(activeDays * 4, 40);

      // Total actions (up to 30 points)
      score += Math.min(totalActions * 2, 30);

      // Recency bonus (up to 30 points)
      if (lastActive) {
        const daysSinceActive = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceActive < 1) score += 30;
        else if (daysSinceActive < 7) score += 20;
        else if (daysSinceActive < 30) score += 10;
      }

      return Math.min(score, 100);

    } catch (error) {
      console.error('[TalentRanker] Error scoring engagement:', error);
      return 0;
    }
  }

  /**
   * Get percentile rank (0-100)
   */
  async _getPercentileRank(userId, userScore) {
    try {
      // This is a simplified version - in production, you'd cache scores
      // For now, just return a placeholder that could be calculated
      // by scoring all users and comparing

      // Assume normal distribution with mean 50, stddev 20
      // This is a rough estimate
      if (userScore >= 90) return 99;
      if (userScore >= 80) return 95;
      if (userScore >= 70) return 85;
      if (userScore >= 60) return 70;
      if (userScore >= 50) return 50;
      if (userScore >= 40) return 30;
      if (userScore >= 30) return 15;
      return 5;

    } catch (error) {
      console.error('[TalentRanker] Error calculating percentile:', error);
      return 50;
    }
  }

  /**
   * Generate hiring recommendation
   */
  async _generateRecommendation(userId, scores, totalScore) {
    try {
      const strengths = [];
      const improvements = [];

      // Analyze each dimension
      if (scores.surveyCompletion >= 80) {
        strengths.push('Excellent survey completion and commitment');
      } else if (scores.surveyCompletion < 40) {
        improvements.push('Complete more survey levels to showcase engagement');
      }

      if (scores.surveyQuality >= 80) {
        strengths.push('High-quality, thoughtful survey responses');
      } else if (scores.surveyQuality < 50) {
        improvements.push('Provide more detailed and insightful answers');
      }

      if (scores.skillMatch >= 75) {
        strengths.push('Strong technical skill match');
      } else if (scores.skillMatch < 40) {
        improvements.push('Develop more relevant technical skills');
      }

      if (scores.brandIdeas >= 70) {
        strengths.push('Creative brand ideas with high viability');
      } else if (scores.brandIdeas < 30) {
        improvements.push('Submit more brand ideas to demonstrate strategic thinking');
      }

      if (scores.portfolio >= 60) {
        strengths.push('Solid project portfolio and GitHub presence');
      } else if (scores.portfolio < 30) {
        improvements.push('Build more projects and maintain GitHub profile');
      }

      // Overall recommendation
      let recommendation = '';

      if (totalScore >= 85) {
        recommendation = '🌟 STRONG HIRE - Top tier candidate for OSS programs (OpenRouter, YC). ';
      } else if (totalScore >= 70) {
        recommendation = '✅ HIRE - Solid candidate with strong potential. ';
      } else if (totalScore >= 50) {
        recommendation = '🤔 MAYBE - Shows promise but needs development. ';
      } else {
        recommendation = '❌ NOT READY - Needs significant improvement before consideration. ';
      }

      recommendation += strengths.length > 0
        ? `Strengths: ${strengths.join(', ')}. `
        : '';

      recommendation += improvements.length > 0
        ? `Areas for improvement: ${improvements.join(', ')}.`
        : '';

      return recommendation;

    } catch (error) {
      console.error('[TalentRanker] Error generating recommendation:', error);
      return 'Unable to generate recommendation';
    }
  }

  /**
   * Rank all candidates and identify top performers
   * @param {number} limit - Number of top candidates to return
   * @param {array} requiredSkills - Optional skills filter
   * @returns {Promise<array>} Ranked list of candidates
   */
  async rankAllCandidates(limit = 50, requiredSkills = null) {
    if (!this.db) return [];

    try {
      // Get all users who have engaged with the system
      const usersResult = await this.db.query(
        `SELECT DISTINCT user_id
        FROM user_profiles
        WHERE survey_level > 0 OR earned_amount > 0
        ORDER BY user_id`
      );

      const rankings = [];

      for (const row of usersResult.rows) {
        const score = await this.scoreCandidate(row.user_id, requiredSkills);
        if (score) {
          rankings.push(score);
        }
      }

      // Sort by total score descending
      rankings.sort((a, b) => b.total_score - a.total_score);

      // Return top N
      return rankings.slice(0, limit);

    } catch (error) {
      console.error('[TalentRanker] Error ranking candidates:', error);
      return [];
    }
  }

  /**
   * Get top performers for OSS programs
   * @param {number} topPercent - Top percentage to include (default 10)
   * @returns {Promise<array>} Top performers with contact info
   */
  async getTopPerformers(topPercent = 10) {
    if (!this.db) return [];

    try {
      const allRankings = await this.rankAllCandidates(1000);

      const cutoffIndex = Math.ceil(allRankings.length * (topPercent / 100));
      const topPerformers = allRankings.slice(0, cutoffIndex);

      // Enrich with contact information
      const enriched = [];

      for (const performer of topPerformers) {
        const contactResult = await this.db.query(
          `SELECT
            u.email,
            ja.parsed_resume
          FROM users u
          LEFT JOIN job_applications ja ON u.user_id = ja.user_id
          WHERE u.user_id = $1
          LIMIT 1`,
          [performer.user_id]
        );

        if (contactResult.rows.length > 0) {
          const contact = contactResult.rows[0].parsed_resume?.contact || {};
          enriched.push({
            ...performer,
            email: contactResult.rows[0].email,
            contact: {
              linkedin: contact.linkedin,
              github: contact.github,
              website: contact.website
            }
          });
        }
      }

      return enriched;

    } catch (error) {
      console.error('[TalentRanker] Error getting top performers:', error);
      return [];
    }
  }

  /**
   * Save ranking to database for caching
   */
  async saveRanking(userId, ranking) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO candidate_rankings (
          user_id, total_score, percentile, is_top_performer,
          scores, recommendation
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id)
        DO UPDATE SET
          total_score = EXCLUDED.total_score,
          percentile = EXCLUDED.percentile,
          is_top_performer = EXCLUDED.is_top_performer,
          scores = EXCLUDED.scores,
          recommendation = EXCLUDED.recommendation,
          updated_at = NOW()`,
        [
          userId,
          ranking.total_score,
          ranking.percentile,
          ranking.is_top_performer,
          JSON.stringify(ranking.scores),
          ranking.recommendation
        ]
      );

    } catch (error) {
      // Table might not exist yet (created in migration)
      console.error('[TalentRanker] Error saving ranking:', error);
    }
  }
}

module.exports = TalentRanker;
