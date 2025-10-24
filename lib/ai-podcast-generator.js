/**
 * AI Podcast Generator - Midnight Gospel for Code
 *
 * Converts code session transcripts into engaging podcast-style conversations
 * Like NotebookLM but specifically designed for coding/tech discussions
 *
 * Features:
 * - Multi-persona conversations (@matthewmauer, @calriven, @roughsparks)
 * - Midnight Gospel style (philosophical + technical)
 * - Domain-aware content generation
 * - Context model integration
 * - Export to script, audio, blog post, video
 *
 * Usage:
 *   const generator = new AIPodcastGenerator({ llmRouter });
 *   const podcast = await generator.generate({
 *     transcript: sessionTranscript,
 *     personas: ['matthewmauer', 'calriven'],
 *     style: 'midnight-gospel',
 *     domain: 'calriven.com'
 *   });
 */

const MultiLLMRouter = require('./multi-llm-router');

class AIPodcastGenerator {
  constructor(options = {}) {
    this.llmRouter = options.llmRouter || new MultiLLMRouter({
      enableFallback: true,
      enableCostTracking: true
    });

    // Persona configurations
    this.personas = this._loadPersonas();

    // Podcast styles
    this.styles = this._loadStyles();

    // Domain configurations (maps to your 7 domains)
    this.domains = this._loadDomains();

    console.log('[AIPodcastGenerator] Initialized');
  }

  /**
   * Load persona configurations
   */
  _loadPersonas() {
    return {
      matthewmauer: {
        name: 'Matthew Mauer',
        handle: '@matthewmauer',
        role: 'Host',
        voice: 'thoughtful, exploring, curious',
        expertise: ['systems thinking', 'philosophy', 'integration'],
        style: 'Asks deep questions, connects ideas, sees patterns',
        domains: ['all'],
        tts_voice: 'onyx' // OpenAI TTS voice
      },
      calriven: {
        name: 'Cal Riven',
        handle: '@calriven',
        role: 'Technical Expert',
        voice: 'precise, analytical, direct',
        expertise: ['architecture', 'algorithms', 'performance'],
        style: 'Gets into technical details, explains clearly, practical',
        domains: ['calriven.com'],
        tts_voice: 'echo'
      },
      roughsparks: {
        name: 'Rough Sparks',
        handle: '@roughsparks',
        role: 'Creative Technologist',
        voice: 'energetic, experimental, visual',
        expertise: ['ui/ux', 'design systems', 'creative coding'],
        style: 'Thinks visually, experiments, pushes boundaries',
        domains: ['roughsparks.com'],
        tts_voice: 'fable'
      }
    };
  }

  /**
   * Load podcast styles
   */
  _loadStyles() {
    return {
      'midnight-gospel': {
        name: 'Midnight Gospel',
        description: 'Philosophical + technical, meandering conversations',
        tone: 'Curious, exploratory, connecting unexpected ideas',
        format: 'Host asks questions, guest explores, tangents are encouraged',
        length: 'medium' // 15-25 min
      },
      'deep-dive': {
        name: 'Deep Technical Dive',
        description: 'Focused technical exploration',
        tone: 'Analytical, detailed, systematic',
        format: 'Problem → Solution → Implementation → Reflection',
        length: 'long' // 30-45 min
      },
      'quick-takes': {
        name: 'Quick Takes',
        description: 'Short, focused insights',
        tone: 'Punchy, direct, actionable',
        format: 'Insight → Example → Takeaway',
        length: 'short' // 5-10 min
      },
      'interview': {
        name: 'Code Interview',
        description: 'Traditional interview format',
        tone: 'Professional, informative, engaging',
        format: 'Q&A with follow-ups',
        length: 'medium' // 20-30 min
      }
    };
  }

  /**
   * Load domain configurations
   */
  _loadDomains() {
    return {
      'soulfra.com': {
        focus: ['accessibility', 'voice', 'inclusive design', 'ethics'],
        preferred_personas: ['matthewmauer'],
        tone: 'thoughtful, empathetic, exploratory'
      },
      'calriven.com': {
        focus: ['architecture', 'systems', 'performance', 'technical depth'],
        preferred_personas: ['matthewmauer', 'calriven'],
        tone: 'analytical, precise, technical'
      },
      'roughsparks.com': {
        focus: ['ui/ux', 'design systems', 'creative coding', 'experiments'],
        preferred_personas: ['roughsparks', 'matthewmauer'],
        tone: 'creative, experimental, visual'
      },
      'deathtodata.com': {
        focus: ['privacy', 'data ethics', 'open source', 'transparency'],
        preferred_personas: ['matthewmauer'],
        tone: 'critical, principled, rebellious'
      },
      'finishthisidea.com': {
        focus: ['prototyping', 'rapid development', 'mvp', 'iteration'],
        preferred_personas: ['matthewmauer', 'calriven'],
        tone: 'practical, action-oriented, iterative'
      },
      'hookclinic.com': {
        focus: ['marketing', 'hooks', 'storytelling', 'engagement'],
        preferred_personas: ['matthewmauer', 'roughsparks'],
        tone: 'compelling, attention-grabbing, strategic'
      },
      'businessaiclassroom.com': {
        focus: ['ai education', 'business automation', 'practical ai'],
        preferred_personas: ['matthewmauer', 'calriven'],
        tone: 'educational, accessible, practical'
      }
    };
  }

  /**
   * Generate podcast from transcript
   *
   * @param {Object} options
   * @param {string} options.transcript - Raw transcript of code session
   * @param {Array<string>} options.personas - Personas to use (e.g., ['matthewmauer', 'calriven'])
   * @param {string} options.style - Podcast style (e.g., 'midnight-gospel')
   * @param {string} options.domain - Target domain (e.g., 'calriven.com')
   * @param {number} options.targetLength - Target length in minutes
   * @returns {Promise<Object>} Podcast script and metadata
   */
  async generate(options) {
    const {
      transcript,
      personas = ['matthewmauer', 'calriven'],
      style = 'midnight-gospel',
      domain = null,
      targetLength = 20
    } = options;

    console.log(`[AIPodcastGenerator] Generating podcast...`);
    console.log(`  Personas: ${personas.join(', ')}`);
    console.log(`  Style: ${style}`);
    console.log(`  Domain: ${domain || 'generic'}`);

    // Step 1: Extract key topics and themes from transcript
    const analysis = await this._analyzeTranscript(transcript, domain);

    // Step 2: Generate conversation outline
    const outline = await this._generateOutline(analysis, personas, style, targetLength);

    // Step 3: Generate full conversation script
    const script = await this._generateScript(outline, personas, style, analysis);

    // Step 4: Add metadata
    const podcast = {
      id: this._generateId(),
      title: analysis.title,
      description: analysis.description,
      personas,
      style,
      domain,
      targetLength,
      actualLength: script.estimatedLength,
      script,
      outline,
      analysis,
      metadata: {
        generatedAt: new Date().toISOString(),
        wordCount: script.wordCount,
        segmentCount: script.segments.length
      }
    };

    console.log(`[AIPodcastGenerator] Generated podcast: ${podcast.title}`);
    console.log(`  Segments: ${podcast.script.segments.length}`);
    console.log(`  Estimated length: ${podcast.actualLength} min`);

    return podcast;
  }

  /**
   * Analyze transcript to extract key topics and themes
   */
  async _analyzeTranscript(transcript, domain) {
    const domainContext = domain ? this.domains[domain] : null;
    const focusAreas = domainContext?.focus?.join(', ') || 'general coding';

    const prompt = `Analyze this code session transcript and extract:
1. Main topics discussed
2. Key technical concepts
3. Interesting insights or "aha" moments
4. Philosophical or deeper questions raised
5. Connections to broader themes

Focus areas: ${focusAreas}

Transcript:
${transcript}

Return JSON with:
{
  "title": "Compelling podcast title",
  "description": "2-sentence description",
  "topics": ["topic1", "topic2", ...],
  "key_concepts": ["concept1", "concept2", ...],
  "insights": ["insight1", "insight2", ...],
  "questions": ["question1", "question2", ...],
  "themes": ["theme1", "theme2", ...]
}`;

    const response = await this.llmRouter.route({
      prompt,
      context: {
        domain: domain || 'general',
        task: 'analysis',
        format: 'json'
      }
    });

    try {
      return JSON.parse(response.content);
    } catch (error) {
      console.error('[AIPodcastGenerator] Failed to parse analysis:', error.message);
      return {
        title: 'Code Session Discussion',
        description: 'A conversation about code and technology.',
        topics: [],
        key_concepts: [],
        insights: [],
        questions: [],
        themes: []
      };
    }
  }

  /**
   * Generate conversation outline
   */
  async _generateOutline(analysis, personas, style, targetLength) {
    const styleConfig = this.styles[style];
    const personaDetails = personas.map(p => this.personas[p]);

    const prompt = `Create a podcast outline for a ${styleConfig.name} style conversation.

Participants:
${personaDetails.map(p => `- ${p.name} (${p.role}): ${p.style}`).join('\n')}

Topics: ${analysis.topics.join(', ')}
Key Concepts: ${analysis.key_concepts.join(', ')}
Insights: ${analysis.insights.join(', ')}

Style: ${styleConfig.description}
Tone: ${styleConfig.tone}
Format: ${styleConfig.format}
Target Length: ${targetLength} minutes

Create a natural conversation flow with:
- Engaging opening
- 3-5 main segments exploring the topics
- Natural transitions between ideas
- Moments of curiosity and discovery
- Satisfying conclusion

Return JSON array of segments:
[
  {
    "segment": 1,
    "title": "Segment title",
    "duration_min": 3,
    "topics": ["topic1"],
    "speaker_focus": "matthewmauer",
    "tone": "curious, exploratory",
    "key_points": ["point1", "point2"]
  },
  ...
]`;

    const response = await this.llmRouter.route({
      prompt,
      context: {
        task: 'outline generation',
        format: 'json'
      }
    });

    try {
      return JSON.parse(response.content);
    } catch (error) {
      console.error('[AIPodcastGenerator] Failed to parse outline:', error.message);
      return [];
    }
  }

  /**
   * Generate full conversation script from outline
   */
  async _generateScript(outline, personas, style, analysis) {
    const styleConfig = this.styles[style];
    const segments = [];
    let totalWordCount = 0;

    for (const outlineSegment of outline) {
      const segmentScript = await this._generateSegment(
        outlineSegment,
        personas,
        style,
        analysis
      );

      segments.push(segmentScript);
      totalWordCount += segmentScript.wordCount;
    }

    // Estimate length (avg 150 words per minute)
    const estimatedLength = Math.round(totalWordCount / 150);

    return {
      segments,
      wordCount: totalWordCount,
      estimatedLength
    };
  }

  /**
   * Generate a single segment of the conversation
   */
  async _generateSegment(outlineSegment, personas, style, analysis) {
    const personaDetails = personas.map(p => this.personas[p]);
    const styleConfig = this.styles[style];

    const prompt = `Generate a natural conversation for this podcast segment.

Segment: ${outlineSegment.title}
Duration: ${outlineSegment.duration_min} minutes (~${outlineSegment.duration_min * 150} words)
Topics: ${outlineSegment.topics.join(', ')}
Key Points: ${outlineSegment.key_points.join(', ')}
Tone: ${outlineSegment.tone}

Participants:
${personaDetails.map(p => `- ${p.name} (${p.handle}): ${p.style}`).join('\n')}

Style: ${styleConfig.description}
Format: ${styleConfig.format}

Write natural dialogue where:
- Speakers have distinct voices and perspectives
- Conversation flows organically with follow-ups and tangents
- Technical concepts are explained clearly but not dumbed down
- There's curiosity, discovery, and "aha" moments
- Use "um", "like", "you know" sparingly for naturalness
- Include pauses [pause] for breath/thinking

Return JSON:
{
  "dialogue": [
    {
      "speaker": "matthewmauer",
      "text": "What's fascinating about this is...",
      "timestamp": "0:00"
    },
    ...
  ]
}`;

    const response = await this.llmRouter.route({
      prompt,
      context: {
        task: 'dialogue generation',
        format: 'json'
      }
    });

    try {
      const parsed = JSON.parse(response.content);
      const dialogue = parsed.dialogue || [];
      const wordCount = dialogue.reduce((sum, line) => {
        return sum + line.text.split(' ').length;
      }, 0);

      return {
        ...outlineSegment,
        dialogue,
        wordCount
      };
    } catch (error) {
      console.error('[AIPodcastGenerator] Failed to parse segment:', error.message);
      return {
        ...outlineSegment,
        dialogue: [],
        wordCount: 0
      };
    }
  }

  /**
   * Export podcast to different formats
   */
  async export(podcast, format = 'script') {
    switch (format) {
      case 'script':
        return this._exportScript(podcast);
      case 'markdown':
        return this._exportMarkdown(podcast);
      case 'json':
        return JSON.stringify(podcast, null, 2);
      case 'blog-post':
        return this._exportBlogPost(podcast);
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }

  /**
   * Export as plain text script
   */
  _exportScript(podcast) {
    let script = `# ${podcast.title}\n\n`;
    script += `${podcast.description}\n\n`;
    script += `**Participants:** ${podcast.personas.join(', ')}\n`;
    script += `**Style:** ${podcast.style}\n`;
    script += `**Length:** ~${podcast.actualLength} min\n\n`;
    script += `---\n\n`;

    for (const segment of podcast.script.segments) {
      script += `## ${segment.title}\n\n`;

      for (const line of segment.dialogue) {
        const persona = this.personas[line.speaker];
        script += `**${persona.name}**: ${line.text}\n\n`;
      }

      script += `\n`;
    }

    return script;
  }

  /**
   * Export as markdown blog post
   */
  _exportMarkdown(podcast) {
    let md = `---\n`;
    md += `title: "${podcast.title}"\n`;
    md += `description: "${podcast.description}"\n`;
    md += `date: ${new Date().toISOString()}\n`;
    md += `personas: [${podcast.personas.map(p => `"${p}"`).join(', ')}]\n`;
    md += `style: ${podcast.style}\n`;
    md += `domain: ${podcast.domain || 'general'}\n`;
    md += `length: ${podcast.actualLength} min\n`;
    md += `---\n\n`;

    md += `# ${podcast.title}\n\n`;
    md += `${podcast.description}\n\n`;

    for (const segment of podcast.script.segments) {
      md += `## ${segment.title}\n\n`;

      for (const line of segment.dialogue) {
        const persona = this.personas[line.speaker];
        md += `**${persona.handle}**: ${line.text}\n\n`;
      }
    }

    return md;
  }

  /**
   * Export as blog post with custom formatting
   */
  async _exportBlogPost(podcast) {
    const prompt = `Convert this podcast transcript into an engaging blog post.

Title: ${podcast.title}
Description: ${podcast.description}

Transcript:
${podcast.script.segments.map(seg => {
  return `## ${seg.title}\n\n` + seg.dialogue.map(line => {
    const persona = this.personas[line.speaker];
    return `${persona.name}: ${line.text}`;
  }).join('\n\n');
}).join('\n\n')}

Write a blog post that:
- Has compelling intro and conclusion
- Extracts key insights
- Includes code examples if mentioned
- Uses headers, lists, and formatting
- Maintains the conversational feel
- Links ideas together smoothly

Return markdown formatted blog post.`;

    const response = await this.llmRouter.route({
      prompt,
      context: {
        task: 'blog post generation',
        format: 'markdown'
      }
    });

    return response.content;
  }

  /**
   * Generate unique podcast ID
   */
  _generateId() {
    return `podcast_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

module.exports = AIPodcastGenerator;
