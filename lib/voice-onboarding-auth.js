/**
 * Voice Onboarding Auth System
 *
 * Combines voice transcription + personality profiling + authentication
 *
 * Instead of passwords, users answer 10 voice questions (2-3 minutes total):
 * - Each answer transcribed and analyzed
 * - Builds brand strategy from responses
 * - Creates voice biometric signature
 * - Routes to appropriate brand/domain
 * - Matches to easter hunt opportunities
 *
 * Progressive Learning Path:
 * - Q1-2: 5-year-old level ("What do you want to make?")
 * - Q3-5: 10-year-old level ("Who is it for?")
 * - Q6-8: 15-year-old level ("How will you make money?")
 * - Q9-10: Enterprise level ("Competitive strategy")
 *
 * Payment: $175 total for completing all 10 questions
 *
 * Usage:
 *   const voiceAuth = new VoiceOnboardingAuth({ db });
 *   const session = await voiceAuth.startSession();
 *   const result = await voiceAuth.processAnswer(sessionId, audioBuffer, questionId);
 *   const profile = await voiceAuth.completeOnboarding(sessionId);
 */

const crypto = require('crypto');
const VoiceTranscriber = require('../agents/voice-transcriber');
const IdentityResolver = require('./identity-resolver');
const fs = require('fs').promises;
const path = require('path');

class VoiceOnboardingAuth {
  constructor(options = {}) {
    this.db = options.db;
    this.transcriber = new VoiceTranscriber();
    this.identityResolver = new IdentityResolver(this.db);

    // Voice questions adapted from onboarding survey
    // Simplified to 10 key questions optimized for voice (5-10 sec each)
    this.questions = [
      // Level 1: Identity (5-year-old level)
      {
        id: 1,
        level: 1,
        ageLevel: '5 years old',
        text: "What's your name and what do you want to build?",
        guidance: "Just tell me your name and what cool thing you want to make!",
        minDuration: 5,  // seconds
        maxDuration: 15,
        reward: 5.00,
        category: 'identity'
      },
      {
        id: 2,
        level: 1,
        ageLevel: '5 years old',
        text: "Who do you want to help with this?",
        guidance: "Who will use what you're making? Tell me about them!",
        minDuration: 5,
        maxDuration: 15,
        reward: 10.00,
        category: 'audience'
      },

      // Level 2: Vision (10-year-old level)
      {
        id: 3,
        level: 2,
        ageLevel: '10 years old',
        text: "What problem are you solving?",
        guidance: "What's broken or annoying that you want to fix?",
        minDuration: 10,
        maxDuration: 30,
        reward: 15.00,
        category: 'vision'
      },
      {
        id: 4,
        level: 2,
        ageLevel: '10 years old',
        text: "Why does this problem matter?",
        guidance: "Why should people care about solving this?",
        minDuration: 10,
        maxDuration: 30,
        reward: 20.00,
        category: 'vision'
      },

      // Level 3: Values (10-year-old level)
      {
        id: 5,
        level: 3,
        ageLevel: '10 years old',
        text: "What values are most important to you?",
        guidance: "Things like honesty, creativity, helping others - what matters most?",
        minDuration: 10,
        maxDuration: 30,
        reward: 25.00,
        category: 'values'
      },

      // Level 4: Business Model (15-year-old level)
      {
        id: 6,
        level: 4,
        ageLevel: '15 years old',
        text: "How will you make money from this?",
        guidance: "Who will pay you, and what will they pay for?",
        minDuration: 10,
        maxDuration: 45,
        reward: 30.00,
        category: 'business'
      },
      {
        id: 7,
        level: 4,
        ageLevel: '15 years old',
        text: "What makes you different from competitors?",
        guidance: "Why would someone choose you over alternatives?",
        minDuration: 10,
        maxDuration: 45,
        reward: 30.00,
        category: 'positioning'
      },

      // Level 5: Strategy (Enterprise level)
      {
        id: 8,
        level: 5,
        ageLevel: 'Enterprise',
        text: "Describe your go-to-market strategy",
        guidance: "How will you get your first 100 customers?",
        minDuration: 15,
        maxDuration: 60,
        reward: 25.00,
        category: 'strategy'
      },
      {
        id: 9,
        level: 5,
        ageLevel: 'Enterprise',
        text: "What are your 1-year and 5-year goals?",
        guidance: "Where do you see this going? Be specific with metrics.",
        minDuration: 15,
        maxDuration: 60,
        reward: 10.00,
        category: 'strategy'
      },
      {
        id: 10,
        level: 5,
        ageLevel: 'Enterprise',
        text: "Why will this still matter in 10 years?",
        guidance: "What's the lasting impact or insight you're building on?",
        minDuration: 10,
        maxDuration: 60,
        reward: 5.00,
        category: 'legacy'
      }
    ];

    console.log('[VoiceOnboardingAuth] Initialized with', this.questions.length, 'questions');
  }

  /**
   * Start new voice onboarding session
   */
  async startSession(email = null, clusterId = null) {
    const sessionId = crypto.randomBytes(16).toString('hex');

    // Check if user has access to voice auth based on reputation tier
    let tierInfo = null;
    let accessAllowed = true;
    let accessReason = null;

    if (clusterId) {
      try {
        tierInfo = await this.identityResolver.getPaymentTier(clusterId);

        if (!tierInfo.canAccessVoiceAuth) {
          accessAllowed = false;
          accessReason = `Voice auth requires ${tierInfo.tier.display_name} tier or higher. You are currently ${tierInfo.tier.tier_name}. Link more OAuth accounts to unlock.`;
        }
      } catch (error) {
        console.warn('[VoiceOnboardingAuth] Could not check tier, allowing access:', error.message);
      }
    }

    if (!accessAllowed) {
      throw new Error(accessReason);
    }

    const result = await this.db.query(`
      INSERT INTO voice_onboarding_sessions (
        session_id,
        email,
        cluster_id,
        current_question,
        total_reward,
        started_at,
        status
      ) VALUES ($1, $2, $3, 1, 0, NOW(), 'active')
      RETURNING *
    `, [sessionId, email, clusterId]);

    return {
      sessionId,
      currentQuestion: this.questions[0],
      totalQuestions: this.questions.length,
      potentialReward: this.questions.reduce((sum, q) => sum + q.reward, 0),
      tierInfo: tierInfo ? {
        tier: tierInfo.tier.tier_name,
        displayName: tierInfo.tier.display_name,
        badge: tierInfo.tier.tier_badge,
        requiresPaymentMilestones: tierInfo.requiresPaymentMilestones
      } : null
    };
  }

  /**
   * Process voice answer for a question
   */
  async processAnswer(sessionId, audioBuffer, questionId) {
    try {
      // Get session
      const sessionResult = await this.db.query(`
        SELECT * FROM voice_onboarding_sessions
        WHERE session_id = $1
      `, [sessionId]);

      if (sessionResult.rows.length === 0) {
        throw new Error('Session not found');
      }

      const session = sessionResult.rows[0];
      const question = this.questions.find(q => q.id === questionId);

      if (!question) {
        throw new Error('Invalid question ID');
      }

      // Save audio temporarily
      const tempDir = path.join(__dirname, '../uploads/voice-onboarding');
      await fs.mkdir(tempDir, { recursive: true });
      const tempPath = path.join(tempDir, `${sessionId}_q${questionId}.m4a`);
      await fs.writeFile(tempPath, audioBuffer);

      // Transcribe
      const transcription = await this.transcriber.transcribe(tempPath);

      // Analyze response
      const analysis = await this.analyzeResponse(transcription.text, question);

      // Store answer
      await this.db.query(`
        INSERT INTO voice_onboarding_answers (
          session_id,
          question_id,
          audio_path,
          transcript,
          duration_seconds,
          analysis,
          reward,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        sessionId,
        questionId,
        tempPath,
        transcription.text,
        transcription.duration || 0,
        JSON.stringify(analysis),
        question.reward
      ]);

      // Update session progress
      const nextQuestionId = questionId + 1;
      const isComplete = nextQuestionId > this.questions.length;

      await this.db.query(`
        UPDATE voice_onboarding_sessions
        SET current_question = $1,
            total_reward = total_reward + $2,
            status = $3,
            updated_at = NOW()
        WHERE session_id = $4
      `, [
        nextQuestionId,
        question.reward,
        isComplete ? 'completed' : 'active',
        sessionId
      ]);

      return {
        success: true,
        transcript: transcription.text,
        analysis,
        reward: question.reward,
        isComplete,
        nextQuestion: isComplete ? null : this.questions.find(q => q.id === nextQuestionId),
        progress: {
          answered: questionId,
          total: this.questions.length,
          earnedSoFar: session.total_reward + question.reward
        }
      };

    } catch (error) {
      console.error('[VoiceOnboardingAuth] Process answer error:', error);
      throw error;
    }
  }

  /**
   * Analyze voice response using AI
   */
  async analyzeResponse(transcript, question) {
    // Extract keywords and insights
    const analysis = {
      category: question.category,
      keywords: this.extractKeywords(transcript),
      sentiment: this.analyzeSentiment(transcript),
      archetype: null,  // Will determine from full responses
      brandDomain: null,  // Will route based on keywords
      easterHuntMatches: []  // Will match after completion
    };

    // Archetype detection (basic keyword matching)
    if (question.category === 'values' || question.category === 'vision') {
      analysis.archetype = this.detectArchetype(transcript);
    }

    // Brand domain routing
    analysis.brandDomain = this.detectBrandDomain(transcript);

    return analysis;
  }

  /**
   * Extract keywords from transcript
   */
  extractKeywords(text) {
    const keywords = [];
    const techKeywords = ['ai', 'machine learning', 'blockchain', 'crypto', 'web3', 'saas', 'api', 'platform', 'app', 'software', 'code', 'developer'];
    const privacyKeywords = ['privacy', 'security', 'encryption', 'data protection', 'surveillance', 'tracking', 'anonymous'];
    const dataKeywords = ['data broker', 'personal data', 'opt out', 'data deletion', 'gdpr', 'ccpa'];
    const creativeKeywords = ['design', 'art', 'creative', 'content', 'media', 'storytelling'];

    const lowerText = text.toLowerCase();

    [...techKeywords, ...privacyKeywords, ...dataKeywords, ...creativeKeywords].forEach(keyword => {
      if (lowerText.includes(keyword)) {
        keywords.push(keyword);
      }
    });

    return keywords;
  }

  /**
   * Analyze sentiment (simplified)
   */
  analyzeSentiment(text) {
    const positiveWords = ['love', 'excited', 'great', 'amazing', 'awesome', 'passionate', 'innovative', 'revolutionary'];
    const negativeWords = ['hate', 'frustrated', 'broken', 'sucks', 'terrible', 'annoying'];

    const lowerText = text.toLowerCase();
    let score = 0;

    positiveWords.forEach(word => {
      if (lowerText.includes(word)) score += 1;
    });

    negativeWords.forEach(word => {
      if (lowerText.includes(word)) score -= 1;
    });

    return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  }

  /**
   * Detect archetype from voice responses
   */
  detectArchetype(text) {
    const archetypes = {
      creator: ['build', 'create', 'make', 'design', 'craft', 'develop'],
      visionary: ['future', 'change the world', 'revolutionize', 'transform', 'vision'],
      analyst: ['optimize', 'data', 'metrics', 'analyze', 'efficient', 'systematic'],
      maverick: ['disrupt', 'challenge', 'rebel', 'different', 'unconventional'],
      caregiver: ['help', 'support', 'serve', 'care', 'community', 'empower'],
      connector: ['connect', 'network', 'collaborate', 'bring together', 'community'],
      explorer: ['discover', 'explore', 'adventure', 'new', 'frontier', 'journey'],
      sage: ['learn', 'teach', 'knowledge', 'wisdom', 'education', 'understand']
    };

    const lowerText = text.toLowerCase();
    const scores = {};

    Object.keys(archetypes).forEach(archetype => {
      scores[archetype] = archetypes[archetype].reduce((count, keyword) => {
        return count + (lowerText.includes(keyword) ? 1 : 0);
      }, 0);
    });

    // Return archetype with highest score
    const bestArchetype = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
    return scores[bestArchetype] > 0 ? bestArchetype : null;
  }

  /**
   * Detect brand domain from keywords
   */
  detectBrandDomain(text) {
    const lowerText = text.toLowerCase();

    if (lowerText.match(/privacy|security|surveillance|tracking|anonymous/)) {
      return 'soulfra.com';
    }

    if (lowerText.match(/data broker|opt out|data deletion|personal data/)) {
      return 'deathtodata.com';
    }

    if (lowerText.match(/ai|machine learning|llm|gpt|artificial intelligence/)) {
      return 'calriven.com';
    }

    return 'calos.ai';  // Default
  }

  /**
   * Complete onboarding and create user account
   */
  async completeOnboarding(sessionId) {
    // Get all answers
    const answersResult = await this.db.query(`
      SELECT * FROM voice_onboarding_answers
      WHERE session_id = $1
      ORDER BY question_id
    `, [sessionId]);

    const answers = answersResult.rows;

    if (answers.length < this.questions.length) {
      throw new Error('Not all questions answered');
    }

    // Aggregate analysis
    const fullAnalysis = this.aggregateAnalysis(answers);

    // Create user profile
    const userId = crypto.randomBytes(16).toString('hex');
    const email = answers.find(a => a.question_id === 1)?.transcript.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];

    await this.db.query(`
      INSERT INTO user_profiles (
        user_id,
        session_id,
        email,
        full_name,
        archetype,
        brand_domain,
        brand_values,
        target_audience,
        business_model,
        competitive_positioning,
        goals,
        voice_signature,
        completion_percentage,
        current_level,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 100, 10, NOW())
    `, [
      userId,
      sessionId,
      email,
      fullAnalysis.name,
      fullAnalysis.archetype,
      fullAnalysis.brandDomain,
      JSON.stringify(fullAnalysis.values),
      JSON.stringify(fullAnalysis.audience),
      fullAnalysis.businessModel,
      fullAnalysis.positioning,
      JSON.stringify(fullAnalysis.goals),
      fullAnalysis.voiceSignature
    ]);

    // Update session
    await this.db.query(`
      UPDATE voice_onboarding_sessions
      SET user_id = $1,
          status = 'completed',
          completed_at = NOW()
      WHERE session_id = $2
    `, [userId, sessionId]);

    return {
      userId,
      profile: fullAnalysis,
      totalReward: answers.reduce((sum, a) => sum + (a.reward || 0), 0),
      easterHuntMatches: fullAnalysis.easterHuntMatches
    };
  }

  /**
   * Aggregate analysis from all answers
   */
  aggregateAnalysis(answers) {
    const allKeywords = answers.flatMap(a => a.analysis?.keywords || []);
    const archetypes = answers.map(a => a.analysis?.archetype).filter(Boolean);
    const brandDomains = answers.map(a => a.analysis?.brandDomain).filter(Boolean);

    // Determine primary archetype (most common)
    const archetypeCounts = {};
    archetypes.forEach(a => {
      archetypeCounts[a] = (archetypeCounts[a] || 0) + 1;
    });
    const primaryArchetype = Object.keys(archetypeCounts).reduce((a, b) =>
      archetypeCounts[a] > archetypeCounts[b] ? a : b, 'creator'
    );

    // Determine primary brand domain
    const domainCounts = {};
    brandDomains.forEach(d => {
      domainCounts[d] = (domainCounts[d] || 0) + 1;
    });
    const primaryDomain = Object.keys(domainCounts).reduce((a, b) =>
      domainCounts[a] > domainCounts[b] ? a : b, 'calos.ai'
    );

    return {
      name: answers[0]?.transcript.split(' ')[0] || 'User',  // Extract first word as name
      archetype: primaryArchetype,
      brandDomain: primaryDomain,
      keywords: [...new Set(allKeywords)],  // Unique keywords
      values: answers.find(a => a.question_id === 5)?.transcript || '',
      audience: answers.find(a => a.question_id === 2)?.transcript || '',
      businessModel: answers.find(a => a.question_id === 6)?.transcript || '',
      positioning: answers.find(a => a.question_id === 7)?.transcript || '',
      goals: answers.find(a => a.question_id === 9)?.transcript || '',
      voiceSignature: this.generateVoiceSignature(answers),
      easterHuntMatches: this.findEasterHuntMatches(allKeywords, primaryArchetype)
    };
  }

  /**
   * Generate voice biometric signature (simplified)
   */
  generateVoiceSignature(answers) {
    // In production, this would use actual voice embeddings
    // For now, create a hash of transcripts as placeholder
    const combined = answers.map(a => a.transcript).join('|');
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Find matching easter hunt opportunities
   */
  findEasterHuntMatches(keywords, archetype) {
    // Placeholder - would query actual easter hunts from database
    const matches = [];

    if (keywords.includes('ai') || keywords.includes('machine learning')) {
      matches.push({
        hunt: 'AI Agent Builder Challenge',
        domain: 'calriven.com',
        bounty: 500
      });
    }

    if (keywords.includes('privacy') || keywords.includes('security')) {
      matches.push({
        hunt: 'Privacy Tools Sprint',
        domain: 'soulfra.com',
        bounty: 300
      });
    }

    if (archetype === 'creator' || archetype === 'visionary') {
      matches.push({
        hunt: 'Startup Founder Track',
        domain: 'calos.ai',
        bounty: 1000
      });
    }

    return matches;
  }
}

module.exports = VoiceOnboardingAuth;
