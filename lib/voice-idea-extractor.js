/**
 * Voice Idea Extractor
 *
 * Extracts actionable work from voice transcripts:
 * - Dev tasks → GitHub issues
 * - Math concepts → Research notes with notation
 * - Product ideas → Idea tracker
 * - Research questions → Investigation list
 *
 * Detects patterns like:
 * - "I should build X"
 * - "What if we used matrix multiplication..."
 * - "This could be a SaaS"
 * - "Need to research Y"
 *
 * Usage:
 *   const extractor = new VoiceIdeaExtractor({ llmRouter, githubToken });
 *   const extracted = await extractor.extract({
 *     transcript,
 *     narrative, // from VoiceNarrativeBuilder
 *     metadata
 *   });
 */

const { Octokit } = require('@octokit/rest');

class VoiceIdeaExtractor {
  constructor(options = {}) {
    this.llmRouter = options.llmRouter;
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.db = options.db;

    // Initialize GitHub client
    if (this.githubToken) {
      this.octokit = new Octokit({ auth: this.githubToken });
    }

    // Pattern matchers
    this.patterns = {
      devTasks: [
        /i should build/i,
        /need to (fix|add|update|create|implement)/i,
        /todo:?/i,
        /we could (make|build|add)/i,
        /what if we (added|built|created)/i
      ],
      mathConcepts: [
        /(matrix|vector|tensor|algorithm)/i,
        /(calculus|derivative|integral)/i,
        /(probability|statistics|distribution)/i,
        /(graph theory|topology)/i,
        /mathematical/i,
        /equation/i
      ],
      productIdeas: [
        /this could be (a|an) (saas|product|service|app)/i,
        /people would pay for/i,
        /business idea/i,
        /startup/i,
        /monetize/i
      ],
      researchQuestions: [
        /i wonder (if|whether|how)/i,
        /curious about/i,
        /need to (research|look into|investigate)/i,
        /question:/i
      ]
    };

    console.log('[VoiceIdeaExtractor] Initialized');
  }

  /**
   * Extract all ideas from transcript
   */
  async extract(input) {
    const { transcript, narrative, metadata = {} } = input;

    console.log(`[VoiceIdeaExtractor] Extracting ideas from transcript`);

    const extracted = {
      metadata,
      devTasks: [],
      mathConcepts: [],
      productIdeas: [],
      researchQuestions: [],
      created: {}
    };

    // Use narrative actionable items if available
    const actionable = narrative?.analysis?.actionable || [];

    // Step 1: Extract dev tasks
    extracted.devTasks = await this._extractDevTasks(transcript, actionable);

    // Step 2: Extract math concepts
    extracted.mathConcepts = await this._extractMathConcepts(transcript);

    // Step 3: Extract product ideas
    extracted.productIdeas = await this._extractProductIdeas(transcript, actionable);

    // Step 4: Extract research questions
    extracted.researchQuestions = await this._extractResearchQuestions(transcript, actionable);

    console.log(`[VoiceIdeaExtractor] Extracted:`, {
      devTasks: extracted.devTasks.length,
      mathConcepts: extracted.mathConcepts.length,
      productIdeas: extracted.productIdeas.length,
      researchQuestions: extracted.researchQuestions.length
    });

    return extracted;
  }

  /**
   * Extract and create artifacts
   */
  async createArtifacts(extracted, options = {}) {
    const created = {};

    // Create GitHub issues
    if (options.createGitHubIssues && this.octokit && extracted.devTasks.length > 0) {
      created.githubIssues = await this._createGitHubIssues(
        extracted.devTasks,
        options.githubRepo
      );
    }

    // Save math notes
    if (options.saveMathNotes && extracted.mathConcepts.length > 0) {
      created.mathNotes = await this._saveMathNotes(extracted.mathConcepts);
    }

    // Save product ideas
    if (options.saveProductIdeas && extracted.productIdeas.length > 0) {
      created.productIdeas = await this._saveProductIdeas(extracted.productIdeas);
    }

    // Save research questions
    if (options.saveResearch && extracted.researchQuestions.length > 0) {
      created.researchNotes = await this._saveResearchQuestions(extracted.researchQuestions);
    }

    return created;
  }

  /**
   * Extract dev tasks
   */
  async _extractDevTasks(transcript, actionable) {
    // Filter actionable items for tasks
    const taskItems = actionable.filter(a => a.type === 'task');

    if (taskItems.length === 0) {
      // Fallback: Use LLM to extract
      return await this._llmExtractDevTasks(transcript);
    }

    // Convert actionable tasks to dev task format
    return taskItems.map(task => ({
      task: task.action,
      context: task.context,
      priority: task.priority,
      timeframe: task.timeframe,
      estimatedEffort: this._estimateEffort(task.action),
      tags: this._extractTags(task.action),
      source: 'narrative_builder'
    }));
  }

  /**
   * LLM extraction for dev tasks (fallback)
   */
  async _llmExtractDevTasks(transcript) {
    const prompt = `Extract development tasks from this voice transcript.

Transcript:
${transcript}

Find mentions of:
- "I should build/fix/add/update..."
- "Need to implement..."
- "TODO: ..."
- Technical work to be done

For each task:
- What needs to be done
- Why it matters (context)
- Estimated effort (small/medium/large)
- Priority (high/medium/low)

Respond in JSON:
{
  "tasks": [
    {
      "task": "what to do",
      "context": "why this matters",
      "priority": "high" | "medium" | "low",
      "timeframe": "now" | "soon" | "someday",
      "estimatedEffort": "small" | "medium" | "large",
      "tags": ["tag1", "tag2"]
    }
  ]
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'fact',
      maxTokens: 1000,
      temperature: 0.3,
      responseFormat: { type: 'json_object' }
    });

    const data = JSON.parse(response.text);
    return data.tasks || [];
  }

  /**
   * Extract math concepts
   */
  async _extractMathConcepts(transcript) {
    // Check if transcript contains math keywords
    const hasMath = this.patterns.mathConcepts.some(pattern => pattern.test(transcript));

    if (!hasMath) {
      return [];
    }

    const prompt = `Extract mathematical concepts from this voice transcript.

Transcript:
${transcript}

Find mentions of:
- Algorithms or mathematical approaches
- Formulas or equations
- Mathematical structures (matrices, graphs, etc.)
- Mathematical problems or solutions

For each concept:
- Name the concept
- Explain how it was discussed
- Write mathematical notation (LaTeX)
- Note potential applications

Respond in JSON:
{
  "concepts": [
    {
      "name": "concept name",
      "description": "what was discussed",
      "notation": "LaTeX notation (if applicable)",
      "applications": "potential uses",
      "relatedTopics": ["topic1", "topic2"],
      "difficulty": "beginner" | "intermediate" | "advanced"
    }
  ]
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'fact',
      maxTokens: 1500,
      temperature: 0.4,
      responseFormat: { type: 'json_object' }
    });

    const data = JSON.parse(response.text);
    return data.concepts || [];
  }

  /**
   * Extract product ideas
   */
  async _extractProductIdeas(transcript, actionable) {
    // Filter actionable items for ideas
    const ideaItems = actionable.filter(a => a.type === 'idea');

    if (ideaItems.length === 0) {
      // Fallback: Use LLM
      return await this._llmExtractProductIdeas(transcript);
    }

    return ideaItems.map(idea => ({
      idea: idea.action,
      context: idea.context,
      marketSize: 'unknown',
      difficulty: 'unknown',
      monetization: 'unknown',
      source: 'narrative_builder'
    }));
  }

  /**
   * LLM extraction for product ideas (fallback)
   */
  async _llmExtractProductIdeas(transcript) {
    const prompt = `Extract product/business ideas from this voice transcript.

Transcript:
${transcript}

Find mentions of:
- "This could be a SaaS/product/app..."
- "People would pay for..."
- Business opportunities
- Monetization ideas

For each idea:
- What's the product/service
- Who would use it (target market)
- How to monetize
- Estimated difficulty to build

Respond in JSON:
{
  "ideas": [
    {
      "idea": "product description",
      "targetMarket": "who would use this",
      "monetization": "how to make money",
      "difficulty": "low" | "medium" | "high",
      "marketSize": "niche" | "medium" | "large",
      "uniqueValue": "what makes this special"
    }
  ]
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 1000,
      temperature: 0.5,
      responseFormat: { type: 'json_object' }
    });

    const data = JSON.parse(response.text);
    return data.ideas || [];
  }

  /**
   * Extract research questions
   */
  async _extractResearchQuestions(transcript, actionable) {
    // Filter actionable items for research
    const researchItems = actionable.filter(a => a.type === 'research');

    if (researchItems.length === 0) {
      // Fallback: Use LLM
      return await this._llmExtractResearch(transcript);
    }

    return researchItems.map(research => ({
      question: research.action,
      context: research.context,
      priority: research.priority,
      source: 'narrative_builder'
    }));
  }

  /**
   * LLM extraction for research (fallback)
   */
  async _llmExtractResearch(transcript) {
    const prompt = `Extract research questions from this voice transcript.

Transcript:
${transcript}

Find questions or curiosities like:
- "I wonder if..."
- "Curious about..."
- "Need to research..."
- "How does X work?"

For each question:
- What's the question
- Why it's interesting
- Where to start researching

Respond in JSON:
{
  "questions": [
    {
      "question": "the question",
      "motivation": "why this is interesting",
      "startingPoints": ["resource1", "resource2"],
      "difficulty": "easy" | "medium" | "hard"
    }
  ]
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'fact',
      maxTokens: 1000,
      temperature: 0.4,
      responseFormat: { type: 'json_object' }
    });

    const data = JSON.parse(response.text);
    return data.questions || [];
  }

  /**
   * Create GitHub issues from dev tasks
   */
  async _createGitHubIssues(tasks, repoFullName) {
    if (!this.octokit) {
      console.warn('[VoiceIdeaExtractor] GitHub token not configured');
      return [];
    }

    if (!repoFullName) {
      console.warn('[VoiceIdeaExtractor] GitHub repo not specified');
      return [];
    }

    const [owner, repo] = repoFullName.split('/');
    const created = [];

    for (const task of tasks) {
      try {
        const issue = await this.octokit.issues.create({
          owner,
          repo,
          title: task.task,
          body: `**Context:** ${task.context}

**Priority:** ${task.priority}
**Estimated Effort:** ${task.estimatedEffort}
**Timeframe:** ${task.timeframe}

---

*Created from voice journal session*`,
          labels: task.tags || []
        });

        created.push({
          task: task.task,
          issueNumber: issue.data.number,
          url: issue.data.html_url
        });

        console.log(`[VoiceIdeaExtractor] Created GitHub issue #${issue.data.number}: ${task.task}`);
      } catch (error) {
        console.error(`[VoiceIdeaExtractor] Error creating GitHub issue:`, error.message);
      }
    }

    return created;
  }

  /**
   * Save math notes to database
   */
  async _saveMathNotes(concepts) {
    if (!this.db) return [];

    const saved = [];

    for (const concept of concepts) {
      try {
        const result = await this.db.query(`
          INSERT INTO voice_math_notes (
            concept_name,
            description,
            notation,
            applications,
            related_topics,
            difficulty,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING note_id
        `, [
          concept.name,
          concept.description,
          concept.notation,
          concept.applications,
          JSON.stringify(concept.relatedTopics || []),
          concept.difficulty
        ]);

        saved.push({
          concept: concept.name,
          noteId: result.rows[0].note_id
        });

        console.log(`[VoiceIdeaExtractor] Saved math note: ${concept.name}`);
      } catch (error) {
        console.error(`[VoiceIdeaExtractor] Error saving math note:`, error.message);
      }
    }

    return saved;
  }

  /**
   * Save product ideas to database
   */
  async _saveProductIdeas(ideas) {
    if (!this.db) return [];

    const saved = [];

    for (const idea of ideas) {
      try {
        const result = await this.db.query(`
          INSERT INTO voice_product_ideas (
            idea_description,
            target_market,
            monetization,
            difficulty,
            market_size,
            unique_value,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING idea_id
        `, [
          idea.idea,
          idea.targetMarket || null,
          idea.monetization || null,
          idea.difficulty || null,
          idea.marketSize || null,
          idea.uniqueValue || null
        ]);

        saved.push({
          idea: idea.idea,
          ideaId: result.rows[0].idea_id
        });

        console.log(`[VoiceIdeaExtractor] Saved product idea: ${idea.idea}`);
      } catch (error) {
        console.error(`[VoiceIdeaExtractor] Error saving product idea:`, error.message);
      }
    }

    return saved;
  }

  /**
   * Save research questions to database
   */
  async _saveResearchQuestions(questions) {
    if (!this.db) return [];

    const saved = [];

    for (const q of questions) {
      try {
        const result = await this.db.query(`
          INSERT INTO voice_research_questions (
            question,
            motivation,
            starting_points,
            difficulty,
            status,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
          RETURNING question_id
        `, [
          q.question,
          q.motivation || null,
          JSON.stringify(q.startingPoints || []),
          q.difficulty || null,
          'new'
        ]);

        saved.push({
          question: q.question,
          questionId: result.rows[0].question_id
        });

        console.log(`[VoiceIdeaExtractor] Saved research question: ${q.question}`);
      } catch (error) {
        console.error(`[VoiceIdeaExtractor] Error saving research question:`, error.message);
      }
    }

    return saved;
  }

  /**
   * Estimate effort for task
   */
  _estimateEffort(taskDescription) {
    const text = taskDescription.toLowerCase();

    // Large effort indicators
    if (text.includes('rebuild') || text.includes('refactor entire') || text.includes('migrate')) {
      return 'large';
    }

    // Small effort indicators
    if (text.includes('fix typo') || text.includes('update text') || text.includes('small change')) {
      return 'small';
    }

    // Default to medium
    return 'medium';
  }

  /**
   * Extract tags from task description
   */
  _extractTags(taskDescription) {
    const tags = [];
    const text = taskDescription.toLowerCase();

    if (text.includes('bug') || text.includes('fix')) tags.push('bug');
    if (text.includes('feature') || text.includes('add')) tags.push('enhancement');
    if (text.includes('refactor')) tags.push('refactor');
    if (text.includes('test')) tags.push('testing');
    if (text.includes('docs') || text.includes('documentation')) tags.push('documentation');
    if (text.includes('ui') || text.includes('frontend')) tags.push('frontend');
    if (text.includes('backend') || text.includes('api')) tags.push('backend');

    return tags;
  }
}

module.exports = VoiceIdeaExtractor;
