/**
 * Voice Forum Auto-Poster
 *
 * Automatically extracts forum-worthy insights from voice journals and posts them:
 * - Extract discussion-worthy topics from narratives
 * - Generate engaging discussion questions
 * - Tag topics appropriately
 * - Track engagement metrics
 * - Integrate with existing forum system (lib/content-forum.js)
 *
 * Usage:
 *   const autoPoster = new VoiceForumAutoPoster({ llmRouter, contentForum, db });
 *
 *   const posts = await autoPoster.extractAndPost({
 *     narrative,
 *     userId: 'user123',
 *     userName: 'Alice'
 *   });
 *
 *   // posts → [{ threadId: 'thread_123', title: 'Zero-Knowledge Proofs...', url: '...' }]
 */

const { EventEmitter } = require('events');

class VoiceForumAutoPoster extends EventEmitter {
  constructor(options = {}) {
    super();

    this.llmRouter = options.llmRouter;
    this.contentForum = options.contentForum;
    this.db = options.db;

    // Minimum quality thresholds
    this.thresholds = {
      minInsightScore: 7, // Out of 10
      minWordCount: 100,
      minEngagementPotential: 6, // Out of 10
      minNovelty: 5 // Out of 10
    };

    // Topic categories for tagging
    this.topicCategories = {
      tech: ['AI', 'dev', 'coding', 'tools', 'frameworks', 'apis', 'databases'],
      privacy: ['encryption', 'zero-knowledge', 'data-rights', 'surveillance', 'tracking'],
      business: ['startup', 'product', 'growth', 'revenue', 'marketing', 'strategy'],
      design: ['UI', 'UX', 'design-system', 'aesthetics', 'branding', 'visual'],
      philosophy: ['ethics', 'future', 'society', 'philosophy', 'human-ai'],
      math: ['algorithms', 'optimization', 'proofs', 'theory', 'mathematics'],
      research: ['paper', 'study', 'research', 'experiment', 'analysis']
    };

    // Forum post types
    this.postTypes = {
      discussion: {
        title: 'Discussion',
        description: 'Open-ended conversation starter',
        flair: '💭 Discussion'
      },
      insight: {
        title: 'Insight',
        description: 'Novel realization or connection',
        flair: '💡 Insight'
      },
      question: {
        title: 'Question',
        description: 'Seeking community input',
        flair: '❓ Question'
      },
      showoff: {
        title: 'Show & Tell',
        description: 'Sharing something built or discovered',
        flair: '🚀 Show & Tell'
      },
      debate: {
        title: 'Debate',
        description: 'Controversial topic for discussion',
        flair: '⚡ Debate'
      }
    };

    console.log('[VoiceForumAutoPoster] Initialized with', Object.keys(this.topicCategories).length, 'topic categories');
  }

  /**
   * Extract forum-worthy insights and post them
   */
  async extractAndPost(input) {
    const {
      narrative, // Voice narrative from VoiceNarrativeBuilder
      userId,
      userName,
      autoPost = true,
      dryRun = false
    } = input;

    console.log(`[VoiceForumAutoPoster] Extracting insights from narrative for user ${userId}`);

    // Extract potential forum posts
    const insights = await this._extractInsights(narrative);

    console.log(`[VoiceForumAutoPoster] Found ${insights.length} potential forum posts`);

    // Filter by quality thresholds
    const qualified = insights.filter(insight => {
      return (
        insight.score >= this.thresholds.minInsightScore &&
        insight.wordCount >= this.thresholds.minWordCount &&
        insight.engagementPotential >= this.thresholds.minEngagementPotential &&
        insight.novelty >= this.thresholds.minNovelty
      );
    });

    console.log(`[VoiceForumAutoPoster] ${qualified.length} insights meet quality thresholds`);

    if (dryRun) {
      return {
        extracted: insights,
        qualified,
        wouldPost: qualified.length,
        dryRun: true
      };
    }

    // Post to forum
    const posts = [];

    if (autoPost && qualified.length > 0) {
      for (const insight of qualified) {
        try {
          const post = await this._postToForum({
            insight,
            userId,
            userName,
            narrativeId: narrative.metadata?.sessionId
          });

          posts.push(post);

          this.emit('post:created', {
            userId,
            threadId: post.threadId,
            title: insight.title,
            type: insight.type
          });

        } catch (error) {
          console.error('[VoiceForumAutoPoster] Post error:', error.message);
          this.emit('post:error', {
            userId,
            insight: insight.title,
            error: error.message
          });
        }
      }
    }

    return {
      extracted: insights,
      qualified,
      posted: posts,
      count: posts.length
    };
  }

  /**
   * Extract insights from narrative
   */
  async _extractInsights(narrative) {
    const prompt = `Extract forum-worthy discussion topics from this voice journal narrative.

Narrative:
Title: ${narrative.title}
${narrative.narrative ? `Content: ${narrative.narrative}` : `Story: ${narrative.outputs?.story?.narrative || ''}`}

Themes: ${narrative.themes?.join(', ')}
Insights: ${narrative.insights?.map(i => i.text).join('; ')}
Tangents: ${narrative.tangents?.join(', ')}

Requirements:
1. Find 1-5 discussion-worthy topics
2. Must be interesting to a tech/privacy/business community
3. Should spark conversation or debate
4. Novel insights preferred over common knowledge
5. Include specific, actionable discussion points

For each topic, provide:
- title: Engaging forum post title (under 100 chars)
- body: Detailed post body (200-500 words)
- type: discussion | insight | question | showoff | debate
- tags: 3-5 relevant tags
- discussionQuestions: 2-3 questions to spark engagement
- score: Quality score 1-10
- engagementPotential: How engaging 1-10
- novelty: How novel/unique 1-10

Respond in JSON:
{
  "insights": [
    {
      "title": "post title",
      "body": "post body with context and details",
      "type": "discussion",
      "tags": ["tag1", "tag2"],
      "discussionQuestions": ["question 1?", "question 2?"],
      "score": 8,
      "engagementPotential": 7,
      "novelty": 6
    }
  ]
}`;

    const response = await this.llmRouter.complete({
      prompt,
      taskType: 'analytical',
      maxTokens: 2000,
      temperature: 0.7,
      responseFormat: { type: 'json_object' }
    });

    const result = JSON.parse(response.text);

    // Add word counts
    return (result.insights || []).map(insight => ({
      ...insight,
      wordCount: insight.body.split(/\s+/).length
    }));
  }

  /**
   * Post insight to forum
   */
  async _postToForum(options) {
    const { insight, userId, userName, narrativeId } = options;

    if (!this.contentForum) {
      throw new Error('ContentForum not configured');
    }

    // Add discussion questions to body
    const bodyWithQuestions = `${insight.body}

**Discussion Questions:**
${insight.discussionQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

    // Determine flair
    const postTypeConfig = this.postTypes[insight.type] || this.postTypes.discussion;
    const flair = postTypeConfig.flair;

    // Create thread
    const thread = await this.contentForum.createThread({
      userId,
      userName,
      title: insight.title,
      body: bodyWithQuestions,
      url: null,
      contentId: narrativeId,
      tags: insight.tags,
      flair
    });

    // Track in database
    if (this.db) {
      await this._trackForumPost({
        threadId: thread.id,
        userId,
        narrativeId,
        insightData: insight
      });
    }

    console.log(`[VoiceForumAutoPoster] Posted: ${insight.title} (thread ${thread.id})`);

    return {
      threadId: thread.id,
      title: insight.title,
      url: `/forum/thread/${thread.id}`,
      type: insight.type,
      tags: insight.tags
    };
  }

  /**
   * Track forum post in database
   */
  async _trackForumPost(options) {
    const { threadId, userId, narrativeId, insightData } = options;

    try {
      await this.db.query(`
        INSERT INTO voice_forum_posts (
          thread_id,
          user_id,
          voice_session_id,
          insight_title,
          insight_type,
          quality_score,
          engagement_potential,
          novelty_score,
          tags,
          discussion_questions,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        threadId,
        userId,
        narrativeId,
        insightData.title,
        insightData.type,
        insightData.score,
        insightData.engagementPotential,
        insightData.novelty,
        JSON.stringify(insightData.tags),
        JSON.stringify(insightData.discussionQuestions)
      ]);
    } catch (error) {
      console.error('[VoiceForumAutoPoster] Tracking error:', error.message);
    }
  }

  /**
   * Get forum post performance
   */
  async getPostPerformance(threadId) {
    if (!this.contentForum) {
      throw new Error('ContentForum not configured');
    }

    const thread = await this.contentForum.getThreadWithComments(threadId);

    const performance = {
      threadId,
      title: thread.title,
      views: thread.views || 0,
      upvotes: thread.upvotes || 0,
      comments: thread.comment_count || 0,
      engagement: this._calculateEngagement({
        views: thread.views,
        upvotes: thread.upvotes,
        comments: thread.comment_count
      }),
      ageHours: this._getAgeHours(thread.created_at)
    };

    return performance;
  }

  /**
   * Calculate engagement score
   */
  _calculateEngagement(metrics) {
    const { views, upvotes, comments } = metrics;

    if (views === 0) return 0;

    // Engagement = (upvotes * 2 + comments * 5) / views * 100
    const engagementRate = ((upvotes * 2 + comments * 5) / views) * 100;

    return Math.min(Math.round(engagementRate), 100);
  }

  /**
   * Get age in hours
   */
  _getAgeHours(createdAt) {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now - created;
    return Math.round(diffMs / (1000 * 60 * 60));
  }

  /**
   * Get top performing posts
   */
  async getTopPosts(userId = null, limit = 10) {
    if (!this.db) {
      throw new Error('Database required');
    }

    const query = userId
      ? `SELECT
           vfp.*,
           t.title,
           t.upvotes,
           t.comment_count,
           t.views
         FROM voice_forum_posts vfp
         JOIN forum_threads t ON t.thread_id = vfp.thread_id
         WHERE vfp.user_id = $1
         ORDER BY t.upvotes DESC, t.comment_count DESC
         LIMIT $2`
      : `SELECT
           vfp.*,
           t.title,
           t.upvotes,
           t.comment_count,
           t.views
         FROM voice_forum_posts vfp
         JOIN forum_threads t ON t.thread_id = vfp.thread_id
         ORDER BY t.upvotes DESC, t.comment_count DESC
         LIMIT $1`;

    const params = userId ? [userId, limit] : [limit];

    try {
      const result = await this.db.query(query, params);

      return result.rows.map(row => ({
        threadId: row.thread_id,
        title: row.title,
        type: row.insight_type,
        upvotes: row.upvotes || 0,
        comments: row.comment_count || 0,
        views: row.views || 0,
        engagement: this._calculateEngagement({
          views: row.views,
          upvotes: row.upvotes,
          comments: row.comment_count
        }),
        qualityScore: row.quality_score,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('[VoiceForumAutoPoster] Top posts query error:', error.message);
      return [];
    }
  }

  /**
   * Get posting statistics
   */
  async getStats(userId = null) {
    if (!this.db) {
      throw new Error('Database required');
    }

    const query = userId
      ? `SELECT
           COUNT(*) as total_posts,
           AVG(quality_score) as avg_quality,
           AVG(engagement_potential) as avg_engagement_potential,
           AVG(novelty_score) as avg_novelty,
           COUNT(DISTINCT insight_type) as unique_types
         FROM voice_forum_posts
         WHERE user_id = $1`
      : `SELECT
           COUNT(*) as total_posts,
           AVG(quality_score) as avg_quality,
           AVG(engagement_potential) as avg_engagement_potential,
           AVG(novelty_score) as avg_novelty,
           COUNT(DISTINCT insight_type) as unique_types
         FROM voice_forum_posts`;

    const params = userId ? [userId] : [];

    try {
      const result = await this.db.query(query, params);
      const row = result.rows[0];

      return {
        totalPosts: parseInt(row.total_posts) || 0,
        avgQuality: parseFloat(row.avg_quality) || 0,
        avgEngagementPotential: parseFloat(row.avg_engagement_potential) || 0,
        avgNovelty: parseFloat(row.avg_novelty) || 0,
        uniqueTypes: parseInt(row.unique_types) || 0
      };
    } catch (error) {
      console.error('[VoiceForumAutoPoster] Stats error:', error.message);
      return {
        totalPosts: 0,
        avgQuality: 0,
        avgEngagementPotential: 0,
        avgNovelty: 0,
        uniqueTypes: 0
      };
    }
  }

  /**
   * Update quality thresholds
   */
  updateThresholds(newThresholds) {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds
    };

    console.log('[VoiceForumAutoPoster] Updated thresholds:', this.thresholds);
  }

  /**
   * Suggest tags for content
   */
  suggestTags(content) {
    const contentLower = content.toLowerCase();
    const suggestedTags = [];

    for (const [category, keywords] of Object.entries(this.topicCategories)) {
      const matches = keywords.filter(keyword => contentLower.includes(keyword.toLowerCase()));

      if (matches.length > 0) {
        suggestedTags.push(category);
        suggestedTags.push(...matches.slice(0, 2)); // Add top 2 matching keywords
      }
    }

    return [...new Set(suggestedTags)].slice(0, 5); // Unique, max 5
  }

  /**
   * Preview forum post (without posting)
   */
  async preview(narrative, userId) {
    const result = await this.extractAndPost({
      narrative,
      userId,
      userName: 'Preview User',
      autoPost: false,
      dryRun: true
    });

    return result;
  }
}

module.exports = VoiceForumAutoPoster;
