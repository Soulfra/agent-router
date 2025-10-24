/**
 * Dungeon Master AI
 *
 * DND-style AI guide that narrates the quest journey using local Ollama.
 *
 * Personality:
 * - Wise and encouraging (like a DND Dungeon Master)
 * - Cryptic but helpful (gives hints, not direct answers)
 * - Celebrates victories, encourages during struggles
 * - References fantasy/RPG lore
 *
 * Uses:
 * - Quest introductions ("A new challenge appears...")
 * - Progress updates ("You grow stronger...")
 * - Quest completions ("Victory is yours!")
 * - Hints when user is stuck
 * - Encouragement during long quests
 *
 * Usage:
 *   const dm = new DungeonMasterAI({ ollamaUrl, model });
 *   const intro = await dm.generateQuestIntro(quest);
 *   const progress = await dm.generateProgressNarrative(quest, progress);
 *   const hint = await dm.generateHint(quest, userContext);
 */

class DungeonMasterAI {
  constructor(config = {}) {
    this.ollamaUrl = config.ollamaUrl || 'http://127.0.0.1:11434';
    this.model = config.model || 'llama3.2:3b';
    this.enabled = config.enabled !== false;
    this.db = config.db || null;

    // DND Master personality prompts
    this.personality = {
      tone: 'wise, encouraging, slightly cryptic',
      style: 'fantasy RPG dungeon master',
      characteristics: [
        'Speaks in second person ("You")',
        'Uses fantasy metaphors',
        'Celebrates victories enthusiastically',
        'Encourages during struggles',
        'Gives cryptic hints, not direct answers',
        'References the "realm" and "journey"'
      ]
    };

    console.log('[DungeonMasterAI] Initialized with model:', this.model);
  }

  /**
   * Generate quest introduction narrative
   */
  async generateQuestIntro(quest) {
    if (!this.enabled) {
      return quest.narrative_intro || `New quest: ${quest.quest_name}`;
    }

    // Use existing narrative if available
    if (quest.narrative_intro) {
      return quest.narrative_intro;
    }

    const prompt = this._buildPrompt({
      action: 'introduce_quest',
      quest_name: quest.quest_name,
      quest_description: quest.quest_description,
      quest_type: quest.quest_type,
      difficulty: quest.difficulty,
      reward: quest.reward_description
    });

    const narrative = await this._generateNarrative(prompt);

    return narrative || `A new quest appears: ${quest.quest_name}. ${quest.quest_description}`;
  }

  /**
   * Generate progress update narrative
   */
  async generateProgressNarrative(quest, progress) {
    if (!this.enabled) {
      return `Progress: ${progress.current_count}/${quest.required_count}`;
    }

    // Use template if available
    if (quest.narrative_progress) {
      let narrative = quest.narrative_progress;
      narrative = narrative.replace(/{current_count}/g, progress.current_count);
      narrative = narrative.replace(/{required_count}/g, quest.required_count);
      narrative = narrative.replace(/{current_value}/g, progress.current_value || 0);
      narrative = narrative.replace(/{required_value}/g, quest.required_value || 0);
      return narrative;
    }

    const percentComplete = (progress.current_count / quest.required_count) * 100;

    const prompt = this._buildPrompt({
      action: 'progress_update',
      quest_name: quest.quest_name,
      current_count: progress.current_count,
      required_count: quest.required_count,
      percent_complete: percentComplete,
      difficulty: quest.difficulty
    });

    const narrative = await this._generateNarrative(prompt);

    return narrative || `You progress on your quest... ${progress.current_count}/${quest.required_count}`;
  }

  /**
   * Generate quest completion narrative
   */
  async generateCompletionNarrative(quest) {
    if (!this.enabled) {
      return `Quest completed: ${quest.quest_name}!`;
    }

    // Use existing narrative if available
    if (quest.narrative_complete) {
      return quest.narrative_complete;
    }

    const prompt = this._buildPrompt({
      action: 'complete_quest',
      quest_name: quest.quest_name,
      difficulty: quest.difficulty,
      reward: quest.reward_description
    });

    const narrative = await this._generateNarrative(prompt);

    return narrative || `Victory! You have completed: ${quest.quest_name}`;
  }

  /**
   * Generate hint for stuck user
   */
  async generateHint(quest, userContext = {}) {
    if (!this.enabled) {
      return `Hint: ${quest.quest_description}`;
    }

    const prompt = this._buildPrompt({
      action: 'give_hint',
      quest_name: quest.quest_name,
      quest_type: quest.quest_type,
      quest_description: quest.quest_description,
      current_progress: userContext.current_count || 0,
      time_stuck: userContext.days_since_started || 0
    });

    const narrative = await this._generateNarrative(prompt);

    return narrative || `Hint: ${quest.quest_description}`;
  }

  /**
   * Generate encouragement for long quest
   */
  async generateEncouragement(quest, userContext = {}) {
    if (!this.enabled) {
      return `Keep going! You're ${userContext.percent_complete}% complete.`;
    }

    const prompt = this._buildPrompt({
      action: 'encourage',
      quest_name: quest.quest_name,
      percent_complete: userContext.percent_complete || 0,
      days_in_progress: userContext.days_in_progress || 0,
      difficulty: quest.difficulty
    });

    const narrative = await this._generateNarrative(prompt);

    return narrative || `You're making progress, traveler. Keep going!`;
  }

  /**
   * Generate welcome message for new user
   */
  async generateWelcome(userName = 'traveler') {
    if (!this.enabled) {
      return `Welcome to CALOS, ${userName}!`;
    }

    const prompt = this._buildPrompt({
      action: 'welcome_new_user',
      user_name: userName
    });

    const narrative = await this._generateNarrative(prompt);

    return narrative || `Welcome to the realm, ${userName}. Your journey begins...`;
  }

  /**
   * Generate quest chain unlock narrative
   */
  async generateQuestChainUnlock(previousQuest, newQuest) {
    if (!this.enabled) {
      return `New quest unlocked: ${newQuest.quest_name}`;
    }

    const prompt = this._buildPrompt({
      action: 'unlock_quest_chain',
      previous_quest: previousQuest.quest_name,
      new_quest: newQuest.quest_name,
      difficulty: newQuest.difficulty
    });

    const narrative = await this._generateNarrative(prompt);

    return narrative || `Your victory has unlocked a new challenge: ${newQuest.quest_name}`;
  }

  /**
   * Build prompt for Ollama
   */
  _buildPrompt(context) {
    const basePrompt = `You are the Dungeon Master, a wise and encouraging guide in a fantasy RPG realm.

Your personality:
- Tone: ${this.personality.tone}
- Style: ${this.personality.style}
- Always speak in second person ("You")
- Use fantasy metaphors (journey, realm, challenges, allies, etc.)
- Keep responses to 1-3 sentences
- Be encouraging but not cheesy
- Celebrate victories enthusiastically
- Give cryptic hints, not direct instructions

Context: ${JSON.stringify(context, null, 2)}

Generate a ${context.action.replace(/_/g, ' ')} narrative.

Output ONLY the narrative text, nothing else:`;

    return basePrompt;
  }

  /**
   * Generate narrative using Ollama
   */
  async _generateNarrative(prompt) {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          temperature: 0.9, // Higher for creative narrative
          max_tokens: 150,
          stream: false
        })
      });

      if (!response.ok) {
        console.warn('[DungeonMasterAI] Ollama request failed:', response.status);
        return null;
      }

      const data = await response.json();
      const narrative = data.response?.trim();

      return narrative;
    } catch (error) {
      console.error('[DungeonMasterAI] Generation error:', error.message);
      return null;
    }
  }

  /**
   * Save narrative to database
   */
  async saveNarrative(userId, questId, narrativeType, narrativeText, contextData = {}) {
    if (!this.db) {
      console.warn('[DungeonMasterAI] No database configured, cannot save narrative');
      return null;
    }

    try {
      const result = await this.db.query(`
        INSERT INTO dungeon_master_narrative (
          user_id, quest_id, narrative_type, narrative_text, context_data
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING narrative_id
      `, [
        userId,
        questId,
        narrativeType,
        narrativeText,
        JSON.stringify(contextData)
      ]);

      return result.rows[0].narrative_id;
    } catch (error) {
      console.error('[DungeonMasterAI] Save narrative error:', error.message);
      return null;
    }
  }

  /**
   * Get unread narratives for user
   */
  async getUnreadNarratives(userId, markAsShown = false) {
    if (!this.db) {
      return [];
    }

    const result = await this.db.query(`
      SELECT * FROM dungeon_master_narrative
      WHERE user_id = $1 AND was_shown = false
      ORDER BY created_at ASC
    `, [userId]);

    const narratives = result.rows;

    if (markAsShown && narratives.length > 0) {
      const narrativeIds = narratives.map(n => n.narrative_id);
      await this.db.query(`
        UPDATE dungeon_master_narrative
        SET was_shown = true, shown_at = NOW()
        WHERE narrative_id = ANY($1)
      `, [narrativeIds]);
    }

    return narratives;
  }

  /**
   * Generate context-aware message based on user state
   */
  async generateContextMessage(userId, userStats, recentActivity = {}) {
    if (!this.enabled) {
      return null;
    }

    const prompt = `You are the Dungeon Master guiding a user through quests.

User stats:
- Quests completed: ${userStats.quests_completed || 0}
- Quests in progress: ${userStats.quests_in_progress || 0}
- Total karma: ${userStats.total_karma_earned || 0}

Recent activity:
${JSON.stringify(recentActivity, null, 2)}

Generate a short, encouraging message for this user (1-2 sentences).
If they're doing well, celebrate. If they're stuck, encourage.
Always maintain your wise, cryptic Dungeon Master personality.

Output ONLY the message:`;

    const message = await this._generateNarrative(prompt);

    if (message) {
      await this.saveNarrative(
        userId,
        null, // No specific quest
        'context_message',
        message,
        { user_stats: userStats, recent_activity: recentActivity }
      );
    }

    return message;
  }

  /**
   * Predefined narrative templates (fallback)
   */
  getTemplate(templateType, vars = {}) {
    const templates = {
      quest_unlock: [
        `A new challenge appears before you: ${vars.quest_name}. Will you answer the call?`,
        `The realm presents you with a new trial: ${vars.quest_name}. Prove your worth!`,
        `Your journey leads to ${vars.quest_name}. Adventure awaits...`
      ],
      progress: [
        `You grow stronger with each step. ${vars.current}/${vars.required} complete.`,
        `Your determination shines through. Progress: ${vars.current}/${vars.required}`,
        `The path ahead becomes clearer. ${vars.current} of ${vars.required} achieved.`
      ],
      completion: [
        `Victory is yours! ${vars.quest_name} is complete!`,
        `Well done, traveler! You have conquered ${vars.quest_name}!`,
        `The realm honors your achievement. ${vars.quest_name} completed!`
      ],
      encouragement: [
        `Keep faith, traveler. Your efforts will be rewarded.`,
        `The journey is long, but you are capable.`,
        `Every challenge overcome makes you stronger.`
      ],
      hint: [
        `Seek allies to aid your cause...`,
        `The answer lies in the community you build...`,
        `Sometimes the greatest power comes from helping others...`
      ]
    };

    const templateList = templates[templateType] || [];
    const randomTemplate = templateList[Math.floor(Math.random() * templateList.length)];

    return randomTemplate || 'Your journey continues...';
  }
}

module.exports = DungeonMasterAI;
