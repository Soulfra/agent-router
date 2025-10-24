/**
 * Voice Narrative Builder
 *
 * Transforms rambling voice transcripts into coherent narratives.
 *
 * Takes: 20-minute brain dump about random ideas
 * Outputs: Structured story with themes, insights, and actionable items
 *
 * Features:
 * - Story arc extraction (beginning, middle, end)
 * - Theme identification
 * - Key insight highlighting
 * - Tangent mapping
 * - Coherent narrative structuring
 * - Multiple output formats (blog, podcast script, thread)
 *
 * Usage:
 *   const builder = new VoiceNarrativeBuilder({ llmRouter });
 *   const narrative = await builder.build({
 *     transcript: rawTranscript,
 *     metadata: { date, duration, sessionType }
 *   });
 */

class VoiceNarrativeBuilder {
  constructor(options = {}) {
    this.llmRouter = options.llmRouter;

    if (!this.llmRouter) {
      throw new Error('[VoiceNarrativeBuilder] LLM router required');
    }

    this.sessionTypes = {
      morning: {
        focus: 'Planning, energy, fresh ideas',
        tone: 'Optimistic, exploratory',
        structure: 'What I want to accomplish today'
      },
      midday: {
        focus: 'Progress check, pivots, insights',
        tone: 'Reflective, adaptive',
        structure: 'What I learned so far'
      },
      evening: {
        focus: 'Reflection, learnings, next steps',
        tone: 'Thoughtful, synthesizing',
        structure: 'What I discovered today'
      },
      freeform: {
        focus: 'Whatever comes to mind',
        tone: 'Natural, unstructured',
        structure: 'Stream of consciousness'
      }
    };

    console.log('[VoiceNarrativeBuilder] Initialized');
  }

  /**
   * Build narrative from transcript
   */
  async build(input) {
    const {
      transcript,
      metadata = {},
      outputFormats = ['story', 'insights', 'actionable']
    } = input;

    console.log(`[VoiceNarrativeBuilder] Building narrative from ${transcript.length} chars`);

    const narrative = {
      metadata,
      rawTranscript: transcript,
      analysis: {},
      outputs: {}
    };

    // Step 1: Analyze structure
    narrative.analysis.structure = await this._analyzeStructure(transcript, metadata);

    // Step 2: Extract themes
    narrative.analysis.themes = await this._extractThemes(transcript);

    // Step 3: Identify key insights
    narrative.analysis.insights = await this._extractInsights(transcript);

    // Step 4: Map tangents
    narrative.analysis.tangents = await this._mapTangents(transcript);

    // Step 5: Extract actionable items
    narrative.analysis.actionable = await this._extractActionable(transcript);

    // Step 6: Build outputs
    for (const format of outputFormats) {
      narrative.outputs[format] = await this._buildOutput(format, narrative.analysis, transcript, metadata);
    }

    console.log(`[VoiceNarrativeBuilder] Narrative built with ${narrative.analysis.themes.length} themes`);

    return narrative;
  }

  /**
   * Analyze story structure
   */
  async _analyzeStructure(transcript, metadata) {
    const sessionType = metadata.sessionType || 'freeform';
    const sessionConfig = this.sessionTypes[sessionType];

    const prompt = `Analyze this voice transcript and identify the story structure.

Transcript:
${transcript}

Session type: ${sessionType} (${sessionConfig.focus})

Identify:
1. **Beginning** - How did they start? What was the initial thought?
2. **Middle** - What ideas developed? What connections were made?
3. **End** - Where did they land? What was the conclusion?
4. **Flow** - Did ideas build on each other, or jump around?

Respond in JSON:
{
  "beginning": "brief summary",
  "middle": "brief summary",
  "end": "brief summary",
  "flow": "linear" | "branching" | "circular" | "chaotic",
  "energy": "high" | "medium" | "low",
  "clarity": "clear" | "exploratory" | "confused"
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'fact',
      maxTokens: 500,
      temperature: 0.3,
      responseFormat: { type: 'json_object' }
    });

    return JSON.parse(response.text);
  }

  /**
   * Extract main themes
   */
  async _extractThemes(transcript) {
    const prompt = `Extract the main themes from this voice transcript.

Transcript:
${transcript}

List 3-7 themes, ordered by prominence. For each theme:
- Give it a short name (2-4 words)
- Brief description (1 sentence)
- Why it matters

Respond in JSON:
{
  "themes": [
    {
      "name": "theme name",
      "description": "what this theme is about",
      "significance": "why this matters",
      "keywords": ["key", "words"]
    }
  ]
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'fact',
      maxTokens: 800,
      temperature: 0.4,
      responseFormat: { type: 'json_object' }
    });

    const data = JSON.parse(response.text);
    return data.themes || [];
  }

  /**
   * Extract key insights
   */
  async _extractInsights(transcript) {
    const prompt = `Extract the key insights from this voice transcript.

Transcript:
${transcript}

Find moments where the speaker:
- Had a realization
- Made a connection
- Solved a problem
- Asked an important question

List 3-10 insights, ordered by importance.

Respond in JSON:
{
  "insights": [
    {
      "insight": "the key realization",
      "context": "what led to this insight",
      "implications": "what this means",
      "type": "realization" | "connection" | "solution" | "question"
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
    return data.insights || [];
  }

  /**
   * Map tangents and digressions
   */
  async _mapTangents(transcript) {
    const prompt = `Map the tangents in this voice transcript.

Transcript:
${transcript}

A tangent is when the speaker goes off on a related (or unrelated) topic.
Tangents can be valuable - they show connections the speaker's brain made.

Identify tangents and classify them:
- **Valuable**: Led to an insight or interesting connection
- **Dead-end**: Didn't go anywhere useful
- **To-explore**: Worth coming back to later

Respond in JSON:
{
  "tangents": [
    {
      "topic": "what the tangent was about",
      "trigger": "what prompted this tangent",
      "value": "valuable" | "dead-end" | "to-explore",
      "note": "why this tangent matters (or doesn't)"
    }
  ]
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 800,
      temperature: 0.5,
      responseFormat: { type: 'json_object' }
    });

    const data = JSON.parse(response.text);
    return data.tangents || [];
  }

  /**
   * Extract actionable items
   */
  async _extractActionable(transcript) {
    const prompt = `Extract actionable items from this voice transcript.

Transcript:
${transcript}

Find mentions of:
- **Tasks**: "I should build...", "Need to fix...", "Have to..."
- **Research**: "I wonder if...", "Need to look into...", "Curious about..."
- **Ideas**: "What if we...", "Could be a product...", "This would solve..."
- **Decisions**: "I'm going to...", "Let's try...", "Commit to..."

Respond in JSON:
{
  "actionable": [
    {
      "type": "task" | "research" | "idea" | "decision",
      "action": "what to do",
      "priority": "high" | "medium" | "low",
      "timeframe": "now" | "soon" | "someday",
      "context": "why this matters"
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
    return data.actionable || [];
  }

  /**
   * Build output format
   */
  async _buildOutput(format, analysis, transcript, metadata) {
    switch (format) {
      case 'story':
        return await this._buildStory(analysis, transcript, metadata);

      case 'insights':
        return this._buildInsightsList(analysis);

      case 'actionable':
        return this._buildActionableList(analysis);

      case 'blog':
        return await this._buildBlogPost(analysis, transcript, metadata);

      case 'podcast':
        return await this._buildPodcastScript(analysis, transcript, metadata);

      case 'thread':
        return await this._buildTwitterThread(analysis);

      default:
        return null;
    }
  }

  /**
   * Build coherent story narrative
   */
  async _buildStory(analysis, transcript, metadata) {
    const themesText = analysis.themes.map(t => `- ${t.name}: ${t.description}`).join('\n');
    const insightsText = analysis.insights.map((i, idx) => `${idx + 1}. ${i.insight}`).join('\n');

    const prompt = `Transform this voice transcript into a coherent narrative story.

Original transcript:
${transcript}

Structure analysis:
- Beginning: ${analysis.structure.beginning}
- Middle: ${analysis.structure.middle}
- End: ${analysis.structure.end}
- Flow: ${analysis.structure.flow}

Main themes:
${themesText}

Key insights:
${insightsText}

Write a narrative that:
1. Follows a clear story arc (beginning → middle → end)
2. Weaves themes together naturally
3. Highlights key insights
4. Preserves the speaker's voice and energy
5. Makes tangents feel intentional (not random)
6. Ends with a clear takeaway

Keep the informal, conversational tone. Length: 500-800 words.

Respond in JSON:
{
  "title": "compelling title",
  "subtitle": "one-line summary",
  "narrative": "full narrative text",
  "takeaway": "key takeaway (1 sentence)"
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 1500,
      temperature: 0.7,
      responseFormat: { type: 'json_object' }
    });

    return JSON.parse(response.text);
  }

  /**
   * Build insights list
   */
  _buildInsightsList(analysis) {
    return {
      total: analysis.insights.length,
      insights: analysis.insights.map((insight, idx) => ({
        number: idx + 1,
        ...insight
      }))
    };
  }

  /**
   * Build actionable items list
   */
  _buildActionableList(analysis) {
    const byPriority = {
      high: analysis.actionable.filter(a => a.priority === 'high'),
      medium: analysis.actionable.filter(a => a.priority === 'medium'),
      low: analysis.actionable.filter(a => a.priority === 'low')
    };

    const byType = {
      tasks: analysis.actionable.filter(a => a.type === 'task'),
      research: analysis.actionable.filter(a => a.type === 'research'),
      ideas: analysis.actionable.filter(a => a.type === 'idea'),
      decisions: analysis.actionable.filter(a => a.type === 'decision')
    };

    return {
      total: analysis.actionable.length,
      byPriority,
      byType,
      all: analysis.actionable
    };
  }

  /**
   * Build blog post
   */
  async _buildBlogPost(analysis, transcript, metadata) {
    const story = await this._buildStory(analysis, transcript, metadata);

    const prompt = `Convert this narrative into a blog post.

Title: ${story.title}
Subtitle: ${story.subtitle}
Narrative: ${story.narrative}

Transform into blog format:
1. **Opening hook** - Grab attention
2. **Context setting** - What's this about?
3. **Main content** - The narrative (with headings)
4. **Key takeaways** - Bullet points
5. **Closing** - Call to action or next steps

Add markdown formatting (## headings, **bold**, etc.)

Respond in JSON:
{
  "title": "blog title",
  "subtitle": "subtitle or tagline",
  "content": "full blog post in markdown",
  "excerpt": "2-sentence summary for preview",
  "readingTime": estimated reading time in minutes (number),
  "tags": ["tag1", "tag2"]
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 2000,
      temperature: 0.6,
      responseFormat: { type: 'json_object' }
    });

    return JSON.parse(response.text);
  }

  /**
   * Build podcast script
   */
  async _buildPodcastScript(analysis, transcript, metadata) {
    const story = await this._buildStory(analysis, transcript, metadata);

    const prompt = `Convert this narrative into a podcast episode script.

Title: ${story.title}
Narrative: ${story.narrative}

Create a conversational script as if you're explaining this to a friend over coffee.

Include:
1. **Intro** (hook + what this episode is about)
2. **Main content** (conversational, natural, tangents OK)
3. **Key points** (important takeaways)
4. **Outro** (summary + what's next)

Mark sections with timestamps (00:00, 02:30, etc.)

Respond in JSON:
{
  "episodeTitle": "podcast episode title",
  "description": "episode description (2-3 sentences)",
  "script": "full script with [00:00] timestamps",
  "duration": estimated duration in minutes (number),
  "chapters": [
    { "time": "00:00", "title": "Intro" },
    { "time": "02:00", "title": "Main Topic" }
  ]
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 2000,
      temperature: 0.7,
      responseFormat: { type: 'json_object' }
    });

    return JSON.parse(response.text);
  }

  /**
   * Build Twitter thread
   */
  async _buildTwitterThread(analysis) {
    const themesText = analysis.themes.slice(0, 3).map(t => t.name).join(', ');
    const insightsText = analysis.insights.slice(0, 5).map(i => `- ${i.insight}`).join('\n');

    const prompt = `Create a Twitter thread from these insights.

Main themes: ${themesText}

Key insights:
${insightsText}

Create 5-10 tweets that:
1. Start with a hook
2. Share the best insights (one per tweet)
3. Build on each other
4. End with a takeaway or question

Each tweet max 280 characters. Use line breaks for readability.

Respond in JSON:
{
  "tweets": [
    { "number": 1, "text": "tweet text" },
    { "number": 2, "text": "tweet text" }
  ],
  "threadSummary": "one-line summary of thread"
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'creative',
      maxTokens: 1000,
      temperature: 0.7,
      responseFormat: { type: 'json_object' }
    });

    return JSON.parse(response.text);
  }

  /**
   * Get narrative summary
   */
  summarize(narrative) {
    return {
      themes: narrative.analysis.themes.length,
      insights: narrative.analysis.insights.length,
      tangents: narrative.analysis.tangents.length,
      actionable: narrative.analysis.actionable.length,
      outputs: Object.keys(narrative.outputs),
      story: narrative.outputs.story ? {
        title: narrative.outputs.story.title,
        takeaway: narrative.outputs.story.takeaway
      } : null
    };
  }
}

module.exports = VoiceNarrativeBuilder;
