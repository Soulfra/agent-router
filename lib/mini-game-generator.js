/**
 * Mini-Game Generator - Daily Wordle-Style Challenges
 *
 * Generates daily educational mini-games using Triangle Consensus.
 * Each game is domain-specific and teaches concepts related to the learning path.
 *
 * Game Types (Coding):
 * - CodeOrdle: Guess the coding term/concept
 * - API Battle: Identify which AI provider wrote which response
 * - Pattern Match: Complete the code pattern
 * - Debug Hunt: Find the bug in code snippet
 * - Syntax Master: Fix syntax errors
 *
 * Game Types (Data Literacy):
 * - Data Cleaner: Normalize messy data (addresses, ZIP codes, phone numbers)
 * - Breach Hunter: Track email leaks using +tags (privacy technique)
 * - Record Matcher: Fuzzy match duplicate records (identity resolution)
 * - OSINT Detective: Given partial data, discover linked information
 * - Identity Verifier: Match data points like real ID verification systems
 */

class MiniGameGenerator {
  constructor(db, triangleEngine) {
    this.db = db;
    this.triangleEngine = triangleEngine;

    this.gameTypes = [
      'codeordle',
      'api_battle',
      'pattern_match',
      'debug_hunt',
      'syntax_master',
      'data_cleaner',
      'breach_hunter',
      'record_matcher',
      'osint_detective',
      'identity_verifier'
    ];

    console.log('[MiniGameGenerator] Initialized');
  }

  /**
   * Generate today's mini-games for all active learning paths
   * (Run this daily via cron at midnight)
   */
  async generateDailyGames() {
    try {
      console.log('[MiniGameGenerator] Generating daily games...');

      // Get all active learning paths
      const pathsResult = await this.db.query(
        `SELECT lp.*, dp.domain_name, dp.tagline
         FROM learning_paths lp
         JOIN domain_portfolio dp ON lp.domain_id = dp.domain_id
         WHERE lp.active = true`
      );

      const generatedGames = [];

      for (const path of pathsResult.rows) {
        try {
          // Check if game already exists for today
          const existingResult = await this.db.query(
            `SELECT game_id FROM mini_games
             WHERE path_id = $1 AND available_date = CURRENT_DATE`,
            [path.path_id]
          );

          if (existingResult.rows.length > 0) {
            console.log(`[MiniGameGenerator] Game already exists for ${path.path_slug} today`);
            continue;
          }

          // Pick random game type
          const gameType = this.gameTypes[Math.floor(Math.random() * this.gameTypes.length)];

          // Generate game using Triangle Consensus
          const game = await this.generateGame(gameType, path);

          // Store game in database
          const gameResult = await this.db.query(
            `INSERT INTO mini_games (
              path_id, game_type, game_title, game_description,
              game_data, available_date, xp_reward, active, created_at
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, true, NOW())
            RETURNING *`,
            [
              path.path_id,
              gameType,
              game.title,
              game.description,
              JSON.stringify(game.gameData),
              game.xpReward || 50
            ]
          );

          generatedGames.push(gameResult.rows[0]);

          console.log(`[MiniGameGenerator] Generated ${gameType} for ${path.path_slug}`);
        } catch (error) {
          console.error(`[MiniGameGenerator] Failed to generate game for ${path.path_slug}:`, error.message);
        }
      }

      console.log(`[MiniGameGenerator] Generated ${generatedGames.length} games`);
      return generatedGames;
    } catch (error) {
      console.error('[MiniGameGenerator] Generate daily games error:', error);
      throw error;
    }
  }

  /**
   * Generate a single game using Triangle Consensus
   */
  async generateGame(gameType, path) {
    try {
      switch (gameType) {
        case 'codeordle':
          return await this.generateCodeOrdle(path);

        case 'api_battle':
          return await this.generateAPIBattle(path);

        case 'pattern_match':
          return await this.generatePatternMatch(path);

        case 'debug_hunt':
          return await this.generateDebugHunt(path);

        case 'syntax_master':
          return await this.generateSyntaxMaster(path);

        case 'data_cleaner':
          return await this.generateDataCleaner(path);

        case 'breach_hunter':
          return await this.generateBreachHunter(path);

        case 'record_matcher':
          return await this.generateRecordMatcher(path);

        case 'osint_detective':
          return await this.generateOSINTDetective(path);

        case 'identity_verifier':
          return await this.generateIdentityVerifier(path);

        default:
          throw new Error(`Unknown game type: ${gameType}`);
      }
    } catch (error) {
      console.error(`[MiniGameGenerator] Generate ${gameType} error:`, error);
      throw error;
    }
  }

  /**
   * Generate CodeOrdle game (Wordle for coding terms)
   */
  async generateCodeOrdle(path) {
    const prompt = `You are creating a "CodeOrdle" game - like Wordle but for coding concepts related to "${path.path_name}".

Generate a 5-letter coding term or abbreviation that developers should know. It should be:
- Exactly 5 letters
- Related to ${path.domain_name} concepts
- A real programming term (API, ASYNC, CACHE, FETCH, etc.)

Provide:
1. The 5-letter solution word (uppercase)
2. A helpful hint (one sentence, no more than 15 words)
3. 3 additional related terms for context

Format your response as JSON:
{
  "solution": "CACHE",
  "hint": "Temporary storage to speed up data retrieval",
  "relatedTerms": ["REDIS", "MEMCACHE", "STORE"]
}`;

    const response = await this.triangleEngine.query(prompt, {
      taskType: 'mini_game_generation',
      pathId: path.path_id
    });

    // Parse Triangle consensus response
    const gameData = this.extractJSON(response.consensus);

    return {
      title: `CodeOrdle: ${path.domain_name}`,
      description: `Guess the 5-letter coding term! ${gameData.hint}`,
      gameData: {
        solution: gameData.solution.toUpperCase(),
        hint: gameData.hint,
        relatedTerms: gameData.relatedTerms || [],
        maxAttempts: 6
      },
      xpReward: 50
    };
  }

  /**
   * Generate API Battle game (guess which AI wrote which response)
   */
  async generateAPIBattle(path) {
    const prompt = `Generate a coding question related to "${path.path_name}".

Question should be:
- Simple enough to answer in 2-3 sentences
- Related to ${path.domain_name} concepts
- Something that different AI models might answer differently

Provide just the question (no answer).`;

    const questionResponse = await this.triangleEngine.query(prompt, {
      taskType: 'mini_game_generation',
      pathId: path.path_id
    });

    const question = questionResponse.consensus;

    // Now get responses from all 3 providers
    const responses = {
      openai: questionResponse.responses.openai || 'Response from OpenAI',
      anthropic: questionResponse.responses.anthropic || 'Response from Anthropic',
      deepseek: questionResponse.responses.deepseek || 'Response from DeepSeek'
    };

    // Shuffle responses
    const providers = ['openai', 'anthropic', 'deepseek'];
    const shuffledProviders = this.shuffleArray([...providers]);

    return {
      title: `API Battle: Who Said What?`,
      description: `Can you identify which AI provider gave which response?`,
      gameData: {
        question,
        responses: {
          A: responses[shuffledProviders[0]],
          B: responses[shuffledProviders[1]],
          C: responses[shuffledProviders[2]]
        },
        correctAnswers: {
          A: shuffledProviders[0],
          B: shuffledProviders[1],
          C: shuffledProviders[2]
        }
      },
      xpReward: 75
    };
  }

  /**
   * Generate Pattern Match game (complete the code pattern)
   */
  async generatePatternMatch(path) {
    const prompt = `Create a code pattern matching game for "${path.path_name}".

Generate a short code snippet (3-5 lines) with ONE blank that the user must fill in.
The blank should test knowledge of ${path.domain_name} concepts.

Provide:
1. The code snippet with {{BLANK}} placeholder
2. The correct answer (single word or short phrase)
3. 3 plausible wrong answers
4. A brief explanation

Format as JSON:
{
  "codeSnippet": "const data = await fetch(url)\\nconst json = await data.{{BLANK}}()",
  "correctAnswer": "json",
  "wrongAnswers": ["parse", "stringify", "text"],
  "explanation": "The .json() method parses response body as JSON"
}`;

    const response = await this.triangleEngine.query(prompt, {
      taskType: 'mini_game_generation',
      pathId: path.path_id
    });

    const gameData = this.extractJSON(response.consensus);

    // Create shuffled options
    const allOptions = [gameData.correctAnswer, ...gameData.wrongAnswers];
    const shuffledOptions = this.shuffleArray(allOptions);

    return {
      title: `Pattern Match: Fill in the Blank`,
      description: `Complete the code snippet with the correct term`,
      gameData: {
        codeSnippet: gameData.codeSnippet,
        options: shuffledOptions,
        correctAnswer: gameData.correctAnswer,
        explanation: gameData.explanation
      },
      xpReward: 60
    };
  }

  /**
   * Generate Debug Hunt game (find the bug)
   */
  async generateDebugHunt(path) {
    const prompt = `Create a "Debug Hunt" game for "${path.path_name}".

Write a short code snippet (4-6 lines) with ONE subtle bug.
The bug should be related to ${path.domain_name} concepts.

Provide:
1. The buggy code
2. Which line number contains the bug (1-indexed)
3. A brief description of the bug
4. The corrected line

Format as JSON:
{
  "buggyCode": "function fetchUser(id) {\\n  const user = await getUser(id)\\n  return user\\n}",
  "bugLine": 2,
  "bugDescription": "Missing 'async' keyword on function declaration",
  "correctedLine": "async function fetchUser(id) {"
}`;

    const response = await this.triangleEngine.query(prompt, {
      taskType: 'mini_game_generation',
      pathId: path.path_id
    });

    const gameData = this.extractJSON(response.consensus);

    return {
      title: `Debug Hunt: Find the Bug`,
      description: `There's a bug hiding in this code. Can you find it?`,
      gameData: {
        buggyCode: gameData.buggyCode,
        totalLines: gameData.buggyCode.split('\n').length,
        bugLine: gameData.bugLine,
        bugDescription: gameData.bugDescription,
        correctedLine: gameData.correctedLine
      },
      xpReward: 80
    };
  }

  /**
   * Generate Syntax Master game (fix syntax errors)
   */
  async generateSyntaxMaster(path) {
    const prompt = `Create a "Syntax Master" game for "${path.path_name}".

Write a single line of code with 2-3 syntax errors.
Errors should be related to ${path.domain_name} concepts.

Provide:
1. The broken code (one line)
2. The corrected code
3. A list of the specific errors

Format as JSON:
{
  "brokenCode": "const users = await db.query('SELECT * FROM users WHERE id = ' + userId",
  "correctedCode": "const users = await db.query('SELECT * FROM users WHERE id = $1', [userId])",
  "errors": [
    "Missing closing parenthesis",
    "SQL injection vulnerability (should use parameterized query)",
    "Missing array wrapper for parameters"
  ]
}`;

    const response = await this.triangleEngine.query(prompt, {
      taskType: 'mini_game_generation',
      pathId: path.path_id
    });

    const gameData = this.extractJSON(response.consensus);

    return {
      title: `Syntax Master: Fix the Code`,
      description: `This code has multiple syntax errors. Can you fix them all?`,
      gameData: {
        brokenCode: gameData.brokenCode,
        correctedCode: gameData.correctedCode,
        errors: gameData.errors,
        errorCount: gameData.errors.length
      },
      xpReward: 70
    };
  }

  /**
   * Extract JSON from Triangle response (handles markdown code blocks)
   */
  extractJSON(text) {
    try {
      // Try direct parse first
      return JSON.parse(text);
    } catch (e) {
      // Try extracting from markdown code block
      const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // Try finding JSON object
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }

      throw new Error('Could not extract JSON from response');
    }
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get today's game for a path
   */
  async getTodaysGame(pathSlug) {
    try {
      const result = await this.db.query(
        `SELECT mg.*
         FROM mini_games mg
         JOIN learning_paths lp ON mg.path_id = lp.path_id
         WHERE lp.path_slug = $1
           AND mg.available_date = CURRENT_DATE
           AND mg.active = true
         LIMIT 1`,
        [pathSlug]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('[MiniGameGenerator] Get today\'s game error:', error);
      throw error;
    }
  }

  /**
   * Get game statistics
   */
  async getGameStats(gameId) {
    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) AS total_attempts,
          COUNT(CASE WHEN success = true THEN 1 END) AS successful_attempts,
          ROUND(COUNT(CASE WHEN success = true THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) AS success_rate,
          COUNT(DISTINCT user_id) AS unique_players
        FROM mini_game_attempts
        WHERE game_id = $1`,
        [gameId]
      );

      return result.rows[0];
    } catch (error) {
      console.error('[MiniGameGenerator] Get game stats error:', error);
      throw error;
    }
  }

  /**
   * Get user's game history
   */
  async getUserGameHistory(userId, limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT
          mga.*,
          mg.game_type,
          mg.game_title,
          mg.xp_reward,
          lp.path_name,
          lp.path_slug
        FROM mini_game_attempts mga
        JOIN mini_games mg ON mga.game_id = mg.game_id
        JOIN learning_paths lp ON mg.path_id = lp.path_id
        WHERE mga.user_id = $1
        ORDER BY mga.attempted_at DESC
        LIMIT $2`,
        [userId, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('[MiniGameGenerator] Get user game history error:', error);
      throw error;
    }
  }

  /**
   * Generate a custom game on-demand (for special events, challenges, etc.)
   */
  async generateCustomGame(gameType, customPrompt, pathId) {
    try {
      const pathResult = await this.db.query(
        `SELECT lp.*, dp.domain_name
         FROM learning_paths lp
         JOIN domain_portfolio dp ON lp.domain_id = dp.domain_id
         WHERE lp.path_id = $1`,
        [pathId]
      );

      if (pathResult.rows.length === 0) {
        throw new Error(`Learning path not found: ${pathId}`);
      }

      const path = pathResult.rows[0];

      // Use custom prompt or fallback to standard generation
      if (customPrompt) {
        const response = await this.triangleEngine.query(customPrompt, {
          taskType: 'custom_mini_game',
          pathId: path.path_id
        });

        const gameData = this.extractJSON(response.consensus);

        return {
          title: gameData.title || `Custom ${gameType} Challenge`,
          description: gameData.description || 'A special challenge for you!',
          gameData: gameData.gameData || gameData,
          xpReward: gameData.xpReward || 100
        };
      } else {
        return await this.generateGame(gameType, path);
      }
    } catch (error) {
      console.error('[MiniGameGenerator] Generate custom game error:', error);
      throw error;
    }
  }

  // ============================================================================
  // DATA LITERACY GAME TYPES
  // ============================================================================

  /**
   * Generate Data Cleaner game (normalize messy data)
   */
  async generateDataCleaner(path) {
    const prompt = `Create a "Data Cleaner" game - teaching data normalization.

Generate 5 messy data records that need cleaning. Focus on common data quality issues:
- Leading/trailing zeros in ZIP codes (02134 vs 2134)
- Phone number formats (555-1234 vs 5551234 vs (555) 123-4567)
- Address abbreviations (St vs Street, Ave vs Avenue)
- Name formatting (JOHN DOE vs John Doe vs john doe)
- Email case sensitivity

Provide:
1. Array of 5 messy records (original values)
2. Array of 5 cleaned records (correct normalized values)
3. List of normalization rules applied
4. 3 common mistakes beginners make

Format as JSON:
{
  "messy": ["555-12 34", "john  doe", "123 main st", "02134", "User@EMAIL.COM"],
  "cleaned": ["555-1234", "John Doe", "123 Main Street", "02134", "user@email.com"],
  "rules": ["Remove extra spaces", "Capitalize names properly", "Standardize addresses", "Preserve leading zeros in ZIP", "Lowercase emails"],
  "commonMistakes": ["Removing leading zeros from ZIP codes", "Over-correcting name case", "Losing data during normalization"]
}`;

    const response = await this.triangleEngine.query(prompt, {
      taskType: 'mini_game_generation',
      pathId: path.path_id
    });

    const gameData = this.extractJSON(response.consensus);

    return {
      title: `Data Cleaner: Fix the Mess`,
      description: `Normalize these ${gameData.messy.length} messy records`,
      gameData: {
        messy: gameData.messy,
        cleaned: gameData.cleaned,
        rules: gameData.rules,
        commonMistakes: gameData.commonMistakes
      },
      xpReward: 90
    };
  }

  /**
   * Generate Breach Hunter game (track email leaks with +tags)
   */
  async generateBreachHunter(path) {
    const prompt = `Create a "Breach Hunter" game - teaching email tagging for privacy.

Concept: user+amazon@gmail.com lets you track which service leaked your email.

Generate a scenario:
1. User created 5 tagged emails for different services
2. User started receiving spam to 2 of them
3. Player must identify which services leaked the email

Provide:
1. Array of 5 services with their tagged emails
2. Array of 2 services that leaked (breached)
3. Clues about spam received
4. Explanation of how email tagging works

Format as JSON:
{
  "services": [
    {"name": "Amazon", "taggedEmail": "user+amazon@gmail.com"},
    {"name": "Facebook", "taggedEmail": "user+facebook@gmail.com"},
    {"name": "SketchySite", "taggedEmail": "user+sketchy@gmail.com"},
    {"name": "Newsletter", "taggedEmail": "user+news@gmail.com"},
    {"name": "OnlineStore", "taggedEmail": "user+store@gmail.com"}
  ],
  "breached": ["SketchySite", "Newsletter"],
  "clues": ["Received spam selling diet pills to user+sketchy@gmail.com", "Got phishing email at user+news@gmail.com"],
  "explanation": "Email tags let you track leaks. If spam arrives at user+amazon@gmail.com, Amazon leaked your email."
}`;

    const response = await this.triangleEngine.query(prompt, {
      taskType: 'mini_game_generation',
      pathId: path.path_id
    });

    const gameData = this.extractJSON(response.consensus);

    return {
      title: `Breach Hunter: Track the Leak`,
      description: `Which services leaked your email? Use +tags to find out!`,
      gameData: {
        services: gameData.services,
        breached: gameData.breached,
        clues: gameData.clues,
        explanation: gameData.explanation
      },
      xpReward: 85
    };
  }

  /**
   * Generate Record Matcher game (fuzzy matching for identity resolution)
   */
  async generateRecordMatcher(path) {
    const prompt = `Create a "Record Matcher" game - teaching fuzzy matching and deduplication.

Generate 10 customer records, some of which are duplicates (same person, slightly different data):
- Name variations (Jon Smith vs John Smith vs J. Smith)
- Email variations (john@gmail.com vs john.smith@gmail.com)
- Address variations (123 Main St vs 123 Main Street)
- Phone variations (555-1234 vs 5551234)

Provide:
1. Array of 10 records with person_id, name, email, address, phone
2. Correct grouping showing which records are the same person
3. Matching rules to use (Levenshtein distance, common tokens, etc.)

Format as JSON:
{
  "records": [
    {"id": 1, "name": "John Smith", "email": "john@gmail.com", "phone": "555-1234"},
    {"id": 2, "name": "Jon Smith", "email": "john@gmail.com", "phone": "555-1234"},
    {"id": 3, "name": "Jane Doe", "email": "jane@yahoo.com", "phone": "555-5678"}
  ],
  "correctGroups": [[1, 2], [3]],
  "matchingRules": ["Names within 2 char edits are likely same", "Exact email match = same person", "Same phone = same person"]
}`;

    const response = await this.triangleEngine.query(prompt, {
      taskType: 'mini_game_generation',
      pathId: path.path_id
    });

    const gameData = this.extractJSON(response.consensus);

    return {
      title: `Record Matcher: Find Duplicates`,
      description: `Group records that belong to the same person (fuzzy matching)`,
      gameData: {
        records: gameData.records,
        correctGroups: gameData.correctGroups,
        matchingRules: gameData.matchingRules
      },
      xpReward: 100
    };
  }

  /**
   * Generate OSINT Detective game (discover linked information)
   */
  async generateOSINTDetective(path) {
    const prompt = `Create an "OSINT Detective" game - teaching how data points link together.

Given partial information, what else can you discover? Teach OSINT concepts and privacy implications.

Scenario: You have this about a person:
- Email address
- Partial phone number
- City location
- Social media username

What can you discover? What techniques would you use?

Provide:
1. Initial data points (3-4 pieces of info)
2. Discoverable information (5-7 things you could learn)
3. OSINT techniques used
4. Privacy implications

Format as JSON:
{
  "initialData": {
    "email": "john.smith.nyc@gmail.com",
    "phone_partial": "555-12XX",
    "city": "New York",
    "username": "johnsmith_dev"
  },
  "discoverable": [
    "Full name: John Smith",
    "Employer: Tech company (from username '_dev')",
    "Location: NYC (from email)",
    "Likely phone: 555-12XX (from area code)",
    "GitHub profile: github.com/johnsmith_dev"
  ],
  "techniques": ["Email OSINT", "Username correlation", "Geolocation from metadata", "Social media scraping"],
  "privacyNote": "This shows why protecting PII is critical. Small data leaks enable full profiling."
}`;

    const response = await this.triangleEngine.query(prompt, {
      taskType: 'mini_game_generation',
      pathId: path.path_id
    });

    const gameData = this.extractJSON(response.consensus);

    return {
      title: `OSINT Detective: Connect the Dots`,
      description: `Given partial data, what can you discover about this person?`,
      gameData: {
        initialData: gameData.initialData,
        discoverable: gameData.discoverable,
        techniques: gameData.techniques,
        privacyNote: gameData.privacyNote
      },
      xpReward: 95
    };
  }

  /**
   * Generate Identity Verifier game (match data like real ID verification)
   */
  async generateIdentityVerifier(path) {
    const prompt = `Create an "Identity Verifier" game - like real identity verification services.

You're verifying someone's identity. You have:
- Their claimed name
- Their claimed address
- Their IP address

You need to ask them questions only the real person would know (like credit bureaus do):
"Which of these addresses have you lived at?"
"What car did you own in 2015?"

Generate:
1. Person's real profile (name, address history, phone, etc.)
2. 5 verification questions with multiple choice answers (1 correct, 3 plausible wrong)
3. How each question helps verify identity
4. Privacy concerns about this data

Format as JSON:
{
  "profile": {
    "name": "John Smith",
    "addresses": ["123 Main St, Boston MA", "456 Oak Ave, NYC"],
    "phones": ["555-1234"],
    "employer": "Tech Corp"
  },
  "questions": [
    {
      "question": "Which address have you lived at?",
      "options": ["123 Main St, Boston MA", "789 Elm St, Boston MA", "321 Pine St, Boston MA", "None of these"],
      "correct": "123 Main St, Boston MA",
      "verifies": "Confirms address history"
    }
  ],
  "privacyNote": "Identity verification requires lots of personal data. This is how Experian/Equifax work."
}`;

    const response = await this.triangleEngine.query(prompt, {
      taskType: 'mini_game_generation',
      pathId: path.path_id
    });

    const gameData = this.extractJSON(response.consensus);

    return {
      title: `Identity Verifier: Ask the Right Questions`,
      description: `Verify this person's identity like credit bureaus do`,
      gameData: {
        profile: gameData.profile,
        questions: gameData.questions,
        privacyNote: gameData.privacyNote
      },
      xpReward: 100
    };
  }
}

module.exports = MiniGameGenerator;
