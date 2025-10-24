/**
 * Timeline Content Aggregator
 *
 * Transforms user activity timelines into compelling narratives.
 * Turns scattered events (tweets, commits, podcast listens) into
 * coherent stories suitable for publishing (blogs, ebooks, articles).
 *
 * What It Does:
 * - Aggregates activity from local-culture-tracker
 * - Builds chronological narratives
 * - Identifies story arcs (learning journeys, projects, discoveries)
 * - Extracts key moments (breakthroughs, milestones, pivots)
 * - Generates multiple output formats (blog, book chapter, thread)
 *
 * Use Cases:
 * - "My Journey from Web2 to Web3" (blog series)
 * - "How I Built X in 30 Days" (case study)
 * - "Lessons from 100 GitHub Commits" (ebook chapter)
 * - "From Zero to Published Author" (success story)
 *
 * Integrates with:
 * - LocalCultureTracker (lib/local-culture-tracker.js) - Activity data
 * - VoiceNarrativeBuilder (lib/voice-narrative-builder.js) - Story structure
 * - ContentPublisher (lib/content-publisher.js) - Publishing pipeline
 * - RidiculousLoreGenerator (lib/ridiculous-lore-generator.js) - Add flavor
 *
 * Usage:
 *   const aggregator = new TimelineContentAggregator({
 *     cultureTracker, narrativeBuilder, db
 *   });
 *
 *   // Build timeline from user activity
 *   const timeline = await aggregator.buildTimeline({
 *     userId: 'user123',
 *     startDate: '2025-10-01',
 *     endDate: '2025-10-31',
 *     theme: 'crypto-journey'
 *   });
 *
 *   // Generate publishable content
 *   const content = await aggregator.generateContent({
 *     timeline,
 *     format: 'blog-series',
 *     style: 'inspirational'
 *   });
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class TimelineContentAggregator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.cultureTracker = options.cultureTracker;
    this.narrativeBuilder = options.narrativeBuilder;
    this.db = options.db;

    if (!this.cultureTracker) {
      throw new Error('LocalCultureTracker required');
    }

    // Story arc templates
    this.arcTemplates = {
      'learning-journey': {
        name: 'Learning Journey',
        structure: ['discovery', 'struggle', 'breakthrough', 'mastery'],
        tone: 'inspirational',
        targetLength: 2000 // words
      },
      'project-build': {
        name: 'Building a Project',
        structure: ['idea', 'planning', 'execution', 'launch', 'reflection'],
        tone: 'practical',
        targetLength: 3000
      },
      'career-pivot': {
        name: 'Career Pivot',
        structure: ['dissatisfaction', 'exploration', 'decision', 'transition', 'success'],
        tone: 'reflective',
        targetLength: 2500
      },
      'skill-acquisition': {
        name: 'Learning a Skill',
        structure: ['zero-to-one', 'plateau', 'breakthrough', 'confidence'],
        tone: 'educational',
        targetLength: 1500
      },
      'community-contribution': {
        name: 'Contributing to Community',
        structure: ['lurker', 'first-post', 'regular', 'leader'],
        tone: 'community-focused',
        targetLength: 1800
      }
    };

    // Output formats
    this.outputFormats = {
      'blog-post': {
        structure: ['hook', 'intro', 'body', 'conclusion', 'cta'],
        maxWords: 1500,
        includeImages: true
      },
      'blog-series': {
        structure: ['series-intro', 'episodes', 'series-conclusion'],
        episodeCount: 3-5,
        maxWordsPerEpisode: 1000
      },
      'book-chapter': {
        structure: ['chapter-intro', 'sections', 'key-takeaways', 'exercises'],
        maxWords: 3000,
        includeCode: true
      },
      'twitter-thread': {
        structure: ['hook-tweet', 'story-tweets', 'conclusion-tweet'],
        maxTweets: 15,
        tweetLength: 280
      },
      'case-study': {
        structure: ['problem', 'approach', 'solution', 'results', 'learnings'],
        maxWords: 2500,
        includeMetrics: true
      }
    };

    // Narrative styles
    this.styles = {
      'inspirational': {
        voice: 'First-person, encouraging, relatable',
        keywords: ['journey', 'discovered', 'breakthrough', 'learned'],
        emotion: 'hope, determination'
      },
      'practical': {
        voice: 'Second-person, actionable, clear',
        keywords: ['how-to', 'step-by-step', 'practical', 'tips'],
        emotion: 'confidence, clarity'
      },
      'reflective': {
        voice: 'First-person, thoughtful, vulnerable',
        keywords: ['realized', 'questioned', 'struggled', 'understood'],
        emotion: 'wisdom, humility'
      },
      'technical': {
        voice: 'Third-person, precise, detailed',
        keywords: ['implemented', 'analyzed', 'optimized', 'measured'],
        emotion: 'precision, expertise'
      },
      'entertaining': {
        voice: 'First-person, humorous, self-aware',
        keywords: ['hilariously', 'obviously', 'classic', 'wild'],
        emotion: 'humor, relatability'
      }
    };

    console.log('[TimelineContentAggregator] Initialized');
  }

  /**
   * Build timeline from user activity
   */
  async buildTimeline(options) {
    const {
      userId,
      startDate,
      endDate,
      theme = null,
      minActivities = 10
    } = options;

    console.log(`[TimelineContentAggregator] Building timeline for ${userId} (${startDate} → ${endDate})`);

    // Get user profile from culture tracker
    const profile = await this.cultureTracker.getActivityProfile();

    // Load activities in date range
    const activities = await this._loadActivitiesInRange(userId, startDate, endDate);

    if (activities.length < minActivities) {
      throw new Error(`Not enough activities (${activities.length} < ${minActivities})`);
    }

    // Group activities by date
    const dayGroups = this._groupByDay(activities);

    // Identify key moments
    const keyMoments = this._identifyKeyMoments(activities, profile);

    // Detect story arc
    const storyArc = this._detectStoryArc(activities, keyMoments, theme);

    // Build timeline
    const timeline = {
      timelineId: crypto.randomBytes(16).toString('hex'),
      userId,
      startDate,
      endDate,
      duration: this._calculateDuration(startDate, endDate),

      // Statistics
      stats: {
        totalActivities: activities.length,
        uniqueDays: Object.keys(dayGroups).length,
        platforms: this._countPlatforms(activities),
        primaryInterests: this._extractTopInterests(activities)
      },

      // Narrative elements
      storyArc,
      keyMoments,
      dayGroups,

      // Metadata
      profile,
      createdAt: Date.now()
    };

    console.log(`[TimelineContentAggregator] Timeline built: ${timeline.stats.totalActivities} activities, ${timeline.keyMoments.length} key moments`);

    return timeline;
  }

  /**
   * Generate content from timeline
   */
  async generateContent(options) {
    const {
      timeline,
      format = 'blog-post',
      style = 'inspirational',
      customPrompt = null
    } = options;

    console.log(`[TimelineContentAggregator] Generating ${format} in ${style} style`);

    const formatSpec = this.outputFormats[format];
    const styleSpec = this.styles[style];

    if (!formatSpec || !styleSpec) {
      throw new Error(`Invalid format (${format}) or style (${style})`);
    }

    // Build narrative structure
    const narrative = await this._buildNarrative(timeline, formatSpec, styleSpec);

    // Generate sections
    const sections = await this._generateSections(narrative, timeline, formatSpec, styleSpec);

    // Add metadata
    const content = {
      contentId: crypto.randomBytes(16).toString('hex'),
      timelineId: timeline.timelineId,
      format,
      style,

      // Content
      title: this._generateTitle(timeline, style),
      subtitle: this._generateSubtitle(timeline),
      sections,
      wordCount: this._countWords(sections),

      // Publishing metadata
      metadata: {
        author: timeline.userId,
        publishDate: new Date().toISOString(),
        tags: this._generateTags(timeline),
        seo: this._generateSEO(timeline, sections)
      },

      createdAt: Date.now()
    };

    console.log(`[TimelineContentAggregator] Content generated: ${content.title} (${content.wordCount} words)`);

    return content;
  }

  /**
   * Identify key moments in timeline
   */
  _identifyKeyMoments(activities, profile) {
    const moments = [];

    // Streak milestones
    if (profile.streakDays >= 7) {
      moments.push({
        type: 'streak-milestone',
        date: this._findStreakDate(activities, 7),
        title: '7-Day Streak Achieved',
        significance: 'consistency',
        emoji: '🔥'
      });
    }

    // First activity moments
    const firstByPlatform = this._findFirstByPlatform(activities);
    for (const [platform, activity] of Object.entries(firstByPlatform)) {
      moments.push({
        type: 'first-activity',
        date: activity.timestamp,
        title: `First ${platform} Activity`,
        description: activity.content.substring(0, 100),
        significance: 'beginning',
        emoji: '🎯'
      });
    }

    // High-engagement moments (lots of activity in one day)
    const peakDays = this._findPeakEngagementDays(activities);
    peakDays.forEach(day => {
      moments.push({
        type: 'peak-engagement',
        date: day.date,
        title: `Peak Activity Day`,
        description: `${day.count} activities across ${day.platforms.length} platforms`,
        significance: 'intensity',
        emoji: '⚡'
      });
    });

    // Interest shifts (new topic appears)
    const interestShifts = this._detectInterestShifts(activities);
    interestShifts.forEach(shift => {
      moments.push({
        type: 'interest-shift',
        date: shift.date,
        title: `Discovered ${shift.newInterest}`,
        description: shift.context,
        significance: 'pivot',
        emoji: '💡'
      });
    });

    // Sort by date
    moments.sort((a, b) => a.date - b.date);

    return moments;
  }

  /**
   * Detect story arc from activities
   */
  _detectStoryArc(activities, keyMoments, theme) {
    // Determine arc type based on pattern
    let arcType = theme || 'learning-journey'; // Default

    // Check for project-build pattern (lots of commits/GitHub activity)
    const githubActivity = activities.filter(a => a.platform === 'github').length;
    if (githubActivity > activities.length * 0.5) {
      arcType = 'project-build';
    }

    // Check for skill-acquisition pattern (progression in one topic)
    const topicProgression = this._hasTopicProgression(activities);
    if (topicProgression) {
      arcType = 'skill-acquisition';
    }

    const template = this.arcTemplates[arcType];

    // Map key moments to arc stages
    const stages = template.structure.map((stageName, index) => {
      const stageStart = index / template.structure.length;
      const stageEnd = (index + 1) / template.structure.length;

      // Find moments in this stage
      const stageMoments = keyMoments.filter(m => {
        const position = (m.date - activities[0].timestamp) / (activities[activities.length - 1].timestamp - activities[0].timestamp);
        return position >= stageStart && position < stageEnd;
      });

      return {
        name: stageName,
        moments: stageMoments,
        position: { start: stageStart, end: stageEnd }
      };
    });

    return {
      type: arcType,
      template,
      stages
    };
  }

  /**
   * Build narrative structure
   */
  async _buildNarrative(timeline, formatSpec, styleSpec) {
    const arc = timeline.storyArc;

    return {
      hook: this._generateHook(timeline, styleSpec),
      arc: arc.stages.map(stage => ({
        stage: stage.name,
        moments: stage.moments,
        narrative: this._generateStageNarrative(stage, timeline, styleSpec)
      })),
      conclusion: this._generateConclusion(timeline, styleSpec)
    };
  }

  /**
   * Generate sections for content
   */
  async _generateSections(narrative, timeline, formatSpec, styleSpec) {
    const sections = [];

    // Hook section
    sections.push({
      type: 'hook',
      content: narrative.hook,
      wordCount: this._countWordsInText(narrative.hook)
    });

    // Arc sections
    narrative.arc.forEach((stageData, index) => {
      sections.push({
        type: 'arc-stage',
        title: this._formatStageName(stageData.stage),
        content: stageData.narrative,
        moments: stageData.moments,
        wordCount: this._countWordsInText(stageData.narrative)
      });
    });

    // Conclusion section
    sections.push({
      type: 'conclusion',
      content: narrative.conclusion,
      wordCount: this._countWordsInText(narrative.conclusion)
    });

    return sections;
  }

  /**
   * Generate hook (opening)
   */
  _generateHook(timeline, styleSpec) {
    const firstMoment = timeline.keyMoments[0];
    const stats = timeline.stats;

    if (styleSpec.emotion.includes('humor')) {
      return `${firstMoment.emoji} It started with ${firstMoment.title.toLowerCase()}. ${stats.totalActivities} activities later, here's what happened...`;
    } else if (styleSpec.emotion.includes('hope')) {
      return `${firstMoment.emoji} ${firstMoment.title} marked the beginning of a ${this._calculateDuration(timeline.startDate, timeline.endDate)}-day journey that would change everything.`;
    } else {
      return `Between ${new Date(timeline.startDate).toLocaleDateString()} and ${new Date(timeline.endDate).toLocaleDateString()}, ${stats.totalActivities} small actions led to one big transformation.`;
    }
  }

  /**
   * Generate stage narrative
   */
  _generateStageNarrative(stage, timeline, styleSpec) {
    if (stage.moments.length === 0) {
      return `During the ${stage.name} phase, I continued building momentum...`;
    }

    const moment = stage.moments[0];
    const verb = styleSpec.keywords[Math.floor(Math.random() * styleSpec.keywords.length)];

    return `${moment.emoji} **${moment.title}**: ${moment.description || `I ${verb} something important during this phase.`}`;
  }

  /**
   * Generate conclusion
   */
  _generateConclusion(timeline, styleSpec) {
    const duration = this._calculateDuration(timeline.startDate, timeline.endDate);
    const stats = timeline.stats;

    return `After ${duration} days and ${stats.totalActivities} activities across ${Object.keys(stats.platforms).length} platforms, the journey continues. ${this._generateCallToAction(styleSpec)}`;
  }

  /**
   * Generate call to action
   */
  _generateCallToAction(styleSpec) {
    if (styleSpec.emotion.includes('confidence')) {
      return 'Want to start your own journey? Begin with one small action today.';
    } else if (styleSpec.emotion.includes('humor')) {
      return 'Your turn. Go forth and create timeline-worthy moments. 💀';
    } else {
      return 'What will your timeline look like in 30 days?';
    }
  }

  /**
   * Generate title
   */
  _generateTitle(timeline, style) {
    const duration = this._calculateDuration(timeline.startDate, timeline.endDate);
    const primaryInterest = timeline.stats.primaryInterests[0] || 'learning';

    return `${duration} Days of ${this._capitalize(primaryInterest)}: A Journey`;
  }

  /**
   * Generate subtitle
   */
  _generateSubtitle(timeline) {
    const stats = timeline.stats;
    return `${stats.totalActivities} activities across ${Object.keys(stats.platforms).length} platforms`;
  }

  /**
   * Generate tags
   */
  _generateTags(timeline) {
    const interests = timeline.stats.primaryInterests;
    const platforms = Object.keys(timeline.stats.platforms);

    return [...interests, ...platforms, 'timeline', 'journey', 'learning'].slice(0, 10);
  }

  /**
   * Generate SEO metadata
   */
  _generateSEO(timeline, sections) {
    const firstSection = sections[0];

    return {
      description: firstSection.content.substring(0, 155),
      keywords: this._generateTags(timeline).join(', '),
      ogTitle: this._generateTitle(timeline, 'inspirational'),
      ogDescription: firstSection.content.substring(0, 200)
    };
  }

  // Utility methods
  _groupByDay(activities) {
    const groups = {};
    activities.forEach(activity => {
      const date = new Date(activity.timestamp).toDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(activity);
    });
    return groups;
  }

  _countPlatforms(activities) {
    const platforms = {};
    activities.forEach(a => {
      platforms[a.platform] = (platforms[a.platform] || 0) + 1;
    });
    return platforms;
  }

  _extractTopInterests(activities) {
    const interests = {};
    activities.forEach(a => {
      a.interests.forEach(interest => {
        interests[interest] = (interests[interest] || 0) + 1;
      });
    });

    return Object.entries(interests)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([interest, _]) => interest);
  }

  _findFirstByPlatform(activities) {
    const first = {};
    activities.forEach(activity => {
      if (!first[activity.platform]) {
        first[activity.platform] = activity;
      }
    });
    return first;
  }

  _findPeakEngagementDays(activities) {
    const dayGroups = this._groupByDay(activities);
    const peaks = [];

    for (const [date, acts] of Object.entries(dayGroups)) {
      if (acts.length >= 5) {
        peaks.push({
          date: new Date(date).getTime(),
          count: acts.length,
          platforms: [...new Set(acts.map(a => a.platform))]
        });
      }
    }

    return peaks.sort((a, b) => b.count - a.count).slice(0, 3);
  }

  _detectInterestShifts(activities) {
    const shifts = [];
    let currentInterests = new Set();

    activities.forEach(activity => {
      activity.interests.forEach(interest => {
        if (!currentInterests.has(interest)) {
          shifts.push({
            date: activity.timestamp,
            newInterest: interest,
            context: activity.content.substring(0, 100)
          });
          currentInterests.add(interest);
        }
      });
    });

    return shifts;
  }

  _hasTopicProgression(activities) {
    // Simple heuristic: check if one topic dominates and increases over time
    const interests = this._extractTopInterests(activities);
    return interests.length > 0 && interests[0].length > 0;
  }

  _findStreakDate(activities, days) {
    // Simplified: return first activity date
    return activities[0]?.timestamp || Date.now();
  }

  _formatStageName(stage) {
    return stage.split('-').map(word => this._capitalize(word)).join(' ');
  }

  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  _calculateDuration(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  }

  _countWords(sections) {
    return sections.reduce((sum, section) => sum + section.wordCount, 0);
  }

  _countWordsInText(text) {
    return text.split(/\s+/).length;
  }

  async _loadActivitiesInRange(userId, startDate, endDate) {
    if (!this.db) return [];

    try {
      const result = await this.db.query(`
        SELECT * FROM local_culture_activities
        WHERE user_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
        ORDER BY timestamp ASC
      `, [userId, new Date(startDate), new Date(endDate)]);

      return result.rows.map(row => ({
        activityId: row.activity_id,
        userId: row.user_id,
        platform: row.platform,
        action: row.action,
        content: row.content,
        interests: JSON.parse(row.interests || '[]'),
        timestamp: new Date(row.timestamp).getTime()
      }));

    } catch (error) {
      console.error('[TimelineContentAggregator] Load activities error:', error.message);
      return [];
    }
  }
}

module.exports = TimelineContentAggregator;
