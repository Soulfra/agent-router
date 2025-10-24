/**
 * Certification Validator
 *
 * Validates user knowledge against platform certifications using:
 * - Scraped documentation content
 * - LLM-generated questions (via Ollama)
 * - Multiple question types (multiple choice, code completion, true/false)
 *
 * Supports:
 * - Magento 2 Certified Professional Developer
 * - Shopify App Developer
 * - WooCommerce Developer
 * - Stripe Certified Developer
 * - QuickBooks API Developer
 */

const MultiLLMRouter = require('./multi-llm-router');

class CertificationValidator {
  constructor(config = {}) {
    this.db = config.db;
    this.llmRouter = config.llmRouter || new MultiLLMRouter({
      strategy: 'smart',
      ollamaEnabled: true
    });

    // Certification settings
    this.passingScore = config.passingScore || 75; // 75% to pass
    this.questionCount = config.questionCount || 60;
    this.timeLimitMinutes = config.timeLimitMinutes || 90;

    if (!this.db) {
      throw new Error('Database connection required');
    }

    console.log('[CertificationValidator] Initialized');
  }

  /**
   * Get certification by slug
   */
  async getCertification(certSlug) {
    const result = await this.db.query(
      'SELECT * FROM platform_certifications WHERE cert_slug = $1',
      [certSlug]
    );

    if (result.rows.length === 0) {
      throw new Error(`Certification not found: ${certSlug}`);
    }

    return result.rows[0];
  }

  /**
   * Get user's certification attempts
   */
  async getUserCertificationProgress(userId, certSlug) {
    const result = await this.db.query(
      `SELECT uc.*, pc.cert_name, pc.pass_percentage
       FROM user_certifications uc
       JOIN platform_certifications pc ON uc.cert_id = pc.cert_id
       WHERE uc.user_id = $1 AND pc.cert_slug = $2`,
      [userId, certSlug]
    );

    return result.rows[0] || null;
  }

  /**
   * Generate exam questions using LLM based on certification content
   */
  async generateExamQuestions(certification, count = 60) {
    const { cert_data } = certification;

    if (!cert_data || !cert_data.examQuestions) {
      throw new Error('Certification does not have question bank');
    }

    console.log(`[CertificationValidator] Generating ${count} exam questions...`);

    // Mix question types
    const questionTypes = {
      'multiple-choice': Math.floor(count * 0.6),  // 60% multiple choice
      'true-false': Math.floor(count * 0.2),       // 20% true/false
      'code-completion': Math.floor(count * 0.15), // 15% code
      'fill-blank': Math.floor(count * 0.05)       // 5% fill in blank
    };

    const generatedQuestions = [];

    // Use scraped questions as base
    const scrapedQuestions = cert_data.examQuestions || [];

    for (const [type, typeCount] of Object.entries(questionTypes)) {
      const questionsOfType = scrapedQuestions.filter(q => q.type === type);

      if (questionsOfType.length >= typeCount) {
        // Use scraped questions directly
        const selected = this.shuffleArray(questionsOfType).slice(0, typeCount);
        generatedQuestions.push(...selected);
      } else {
        // Generate additional questions using LLM
        const needed = typeCount - questionsOfType.length;
        generatedQuestions.push(...questionsOfType);

        for (let i = 0; i < needed; i++) {
          const llmQuestion = await this.generateQuestionWithLLM(certification, type);
          generatedQuestions.push(llmQuestion);
        }
      }
    }

    // Shuffle all questions
    return this.shuffleArray(generatedQuestions).slice(0, count);
  }

  /**
   * Generate a single question using LLM
   */
  async generateQuestionWithLLM(certification, questionType) {
    const { cert_name, cert_data } = certification;

    // Pick random topic from certification
    const topics = cert_data.organizedDocs?.certificationTopics || [];
    const topic = topics[Math.floor(Math.random() * topics.length)];

    let prompt;

    switch (questionType) {
      case 'multiple-choice':
        prompt = `You are creating a ${cert_name} certification exam question.

Topic: ${topic.name}
Subtopics: ${topic.subtopics.join(', ')}

Generate a multiple-choice question with 4 answer choices (A, B, C, D).
Only one answer should be correct.

Format your response as JSON:
{
  "question": "Your question text here",
  "choices": ["A) First choice", "B) Second choice", "C) Third choice", "D) Fourth choice"],
  "correctAnswer": "B",
  "explanation": "Why B is correct"
}`;
        break;

      case 'true-false':
        prompt = `You are creating a ${cert_name} certification exam question.

Topic: ${topic.name}

Generate a true/false statement about this topic.

Format your response as JSON:
{
  "question": "Your statement here",
  "answer": true,
  "explanation": "Why this is true/false"
}`;
        break;

      case 'code-completion':
        prompt = `You are creating a ${cert_name} certification exam question.

Topic: ${topic.name}

Generate a code completion question. Provide incomplete code and ask what should fill the blank.

Format your response as JSON:
{
  "question": "What should replace _____ in the following code?",
  "code": "<?php\\nclass Example {\\n    public function test() {\\n        return _____;\\n    }\\n}",
  "choices": ["A) $this", "B) self", "C) parent", "D) static"],
  "correctAnswer": "A",
  "explanation": "Why A is correct"
}`;
        break;

      default:
        throw new Error(`Unknown question type: ${questionType}`);
    }

    try {
      const response = await this.llmRouter.route({
        prompt,
        systemPrompt: 'You are an expert certification exam writer. Always respond with valid JSON only, no additional text.',
        model: 'calos-model', // Use local Ollama model
        temperature: 0.7
      });

      // Parse LLM response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('LLM did not return valid JSON');
      }

      const questionData = JSON.parse(jsonMatch[0]);

      return {
        type: questionType,
        topic: topic.name,
        ...questionData,
        generatedByLLM: true
      };
    } catch (error) {
      console.error(`[CertificationValidator] Error generating question with LLM:`, error.message);

      // Fallback to template question
      return this.createFallbackQuestion(topic, questionType);
    }
  }

  /**
   * Create fallback question if LLM generation fails
   */
  createFallbackQuestion(topic, questionType) {
    if (questionType === 'multiple-choice') {
      return {
        type: 'multiple-choice',
        topic: topic.name,
        question: `Which of the following is a key concept in "${topic.name}"?`,
        choices: topic.subtopics.slice(0, 4),
        correctAnswer: 0,
        explanation: 'This is a core concept of the topic.',
        isFallback: true
      };
    }

    return {
      type: questionType,
      topic: topic.name,
      question: `True or False: "${topic.subtopics[0]}" is an important concept.`,
      answer: true,
      explanation: 'This subtopic is listed in the certification guide.',
      isFallback: true
    };
  }

  /**
   * Validate user's exam answers
   */
  validateExamAnswers(questions, userAnswers) {
    let correctCount = 0;
    const results = [];

    questions.forEach((question, index) => {
      const userAnswer = userAnswers[index];
      let isCorrect = false;

      switch (question.type) {
        case 'multiple-choice':
        case 'code-completion':
        case 'fill-blank':
          isCorrect = userAnswer === question.correctAnswer;
          break;

        case 'true-false':
          isCorrect = userAnswer === question.answer;
          break;

        default:
          isCorrect = false;
      }

      if (isCorrect) {
        correctCount++;
      }

      results.push({
        questionIndex: index,
        userAnswer,
        correctAnswer: question.correctAnswer || question.answer,
        isCorrect,
        explanation: question.explanation
      });
    });

    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= this.passingScore;

    return {
      score,
      passed,
      correctCount,
      totalQuestions: questions.length,
      results
    };
  }

  /**
   * Start a new certification exam
   */
  async startExam(userId, certSlug) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Get certification
      const certResult = await client.query(
        'SELECT * FROM platform_certifications WHERE cert_slug = $1',
        [certSlug]
      );

      if (certResult.rows.length === 0) {
        throw new Error(`Certification not found: ${certSlug}`);
      }

      const certification = certResult.rows[0];

      // Generate exam questions
      const questions = await this.generateExamQuestions(
        certification,
        certification.question_count
      );

      // Create exam record
      const examResult = await client.query(
        `INSERT INTO certification_exams (
          user_id, cert_id, started_at, questions
        ) VALUES ($1, $2, NOW(), $3)
        RETURNING exam_id, started_at`,
        [userId, certification.cert_id, JSON.stringify(questions)]
      );

      await client.query('COMMIT');

      console.log(`[CertificationValidator] Exam started for user ${userId}: ${certSlug}`);

      // Return exam WITHOUT answers (send to frontend)
      const exam = examResult.rows[0];
      const questionsWithoutAnswers = questions.map(q => {
        const { correctAnswer, answer, explanation, ...questionData } = q;
        return questionData;
      });

      return {
        examId: exam.exam_id,
        certName: certification.cert_name,
        questionCount: questions.length,
        timeLimitMinutes: certification.time_limit_minutes,
        startedAt: exam.started_at,
        questions: questionsWithoutAnswers
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[CertificationValidator] Error starting exam:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Submit exam and grade it
   */
  async submitExam(examId, userAnswers) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Get exam with questions
      const examResult = await client.query(
        `SELECT * FROM certification_exams WHERE exam_id = $1`,
        [examId]
      );

      if (examResult.rows.length === 0) {
        throw new Error(`Exam not found: ${examId}`);
      }

      const exam = examResult.rows[0];

      if (exam.submitted_at) {
        throw new Error('Exam already submitted');
      }

      const questions = exam.questions;
      const timeSpent = Math.floor((Date.now() - new Date(exam.started_at).getTime()) / 1000);

      // Validate answers
      const validation = this.validateExamAnswers(questions, userAnswers);

      // Update exam record
      await client.query(
        `UPDATE certification_exams
         SET submitted_at = NOW(),
             score = $1,
             passed = $2,
             answers = $3,
             time_spent_seconds = $4
         WHERE exam_id = $5`,
        [validation.score, validation.passed, JSON.stringify(userAnswers), timeSpent, examId]
      );

      // Update or create user certification record
      const userCertResult = await client.query(
        `SELECT * FROM user_certifications
         WHERE user_id = $1 AND cert_id = $2`,
        [exam.user_id, exam.cert_id]
      );

      if (userCertResult.rows.length === 0) {
        // First attempt
        await client.query(
          `INSERT INTO user_certifications (
            user_id, cert_id, passed, score, attempts, last_attempt_at, certified_at
          ) VALUES ($1, $2, $3, $4, 1, NOW(), $5)`,
          [exam.user_id, exam.cert_id, validation.passed, validation.score, validation.passed ? 'NOW()' : null]
        );
      } else {
        // Subsequent attempt
        const existingCert = userCertResult.rows[0];
        const newAttempts = existingCert.attempts + 1;
        const bestScore = Math.max(existingCert.score || 0, validation.score);
        const isPassed = existingCert.passed || validation.passed;

        await client.query(
          `UPDATE user_certifications
           SET score = $1,
               passed = $2,
               attempts = $3,
               last_attempt_at = NOW(),
               certified_at = CASE WHEN $2 = true AND certified_at IS NULL THEN NOW() ELSE certified_at END
           WHERE user_id = $4 AND cert_id = $5`,
          [bestScore, isPassed, newAttempts, exam.user_id, exam.cert_id]
        );
      }

      await client.query('COMMIT');

      console.log(`[CertificationValidator] Exam submitted: ${validation.passed ? 'PASSED' : 'FAILED'} (${validation.score}%)`);

      return {
        examId,
        ...validation,
        timeSpentSeconds: timeSpent
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[CertificationValidator] Error submitting exam:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Shuffle array (Fisher-Yates algorithm)
   */
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

module.exports = CertificationValidator;
