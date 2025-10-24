/**
 * Cross-Platform Auto-Publisher
 *
 * Publishes voice journal content across multiple platforms:
 * - Mastodon/ActivityPub (via ActivityPubServer)
 * - Blog posts (via Content Publishing System)
 * - Twitter/X threads
 * - YouTube scripts (with optional audio/video)
 * - Newsletter drafts
 * - Podcast RSS feed
 *
 * Takes processed narrative and routing from:
 * - VoiceNarrativeBuilder (story, insights, actionable)
 * - BrandVoiceContentRouter (domain routing)
 *
 * Usage:
 *   const publisher = new CrossPlatformAutoPublisher({
 *     db,
 *     activityPubServer,
 *     contentPublisher,
 *     twitterClient,
 *     youtubeClient
 *   });
 *
 *   const results = await publisher.publish({
 *     narrative,
 *     routing,
 *     platforms: ['mastodon', 'blog', 'twitter'],
 *     schedule: 'immediate' | Date
 *   });
 */

const fs = require('fs').promises;
const path = require('path');

class CrossPlatformAutoPublisher {
  constructor(options = {}) {
    this.db = options.db;
    this.activityPubServer = options.activityPubServer;
    this.contentPublisher = options.contentPublisher;
    this.twitterClient = options.twitterClient;
    this.youtubeClient = options.youtubeClient;
    this.newsletterService = options.newsletterService;
    this.podcastRSSGenerator = options.podcastRSSGenerator;

    // NEW: Multi-language & viral optimization support
    this.multiPersonaActivityPub = options.multiPersonaActivityPub;
    this.translationPipeline = options.translationPipeline;
    this.viralOptimizer = options.viralOptimizer;
    this.languageDetector = options.languageDetector;

    // NEW: UTM tracking for SEO/marketing analytics
    this.utmGenerator = options.utmGenerator;
    this.linkEnricher = options.linkEnricher;
    this.learningPathGenerator = options.learningPathGenerator;

    // Platform configurations
    this.platforms = {
      mastodon: {
        enabled: !!this.activityPubServer,
        format: 'federated_post',
        maxLength: 500,
        supportImages: true,
        supportThreads: true
      },
      blog: {
        enabled: !!this.contentPublisher,
        format: 'markdown',
        supportImages: true,
        supportHTML: true
      },
      twitter: {
        enabled: !!this.twitterClient,
        format: 'thread',
        maxLength: 280,
        supportImages: true,
        supportThreads: true
      },
      youtube: {
        enabled: !!this.youtubeClient,
        format: 'video_script',
        supportAudio: true,
        supportVideo: true
      },
      newsletter: {
        enabled: !!this.newsletterService,
        format: 'html_email',
        supportImages: true
      },
      podcast: {
        enabled: !!this.podcastRSSGenerator,
        format: 'audio_episode',
        supportChapters: true
      }
    };

    console.log('[CrossPlatformAutoPublisher] Initialized with platforms:',
      Object.keys(this.platforms).filter(p => this.platforms[p].enabled)
    );
  }

  /**
   * Publish content across all requested platforms
   */
  async publish(input) {
    const {
      narrative,
      routing,
      platforms = ['mastodon', 'blog'],
      schedule = 'immediate',
      metadata = {},
      // NEW: Multi-language & viral options
      targetLanguages = [],
      autoTranslate = false,
      viralOptimize = true,
      personaUsername = null, // For multi-persona Mastodon
      targetAudience = 'tech',
      // NEW: UTM tracking options
      enrichLinks = true, // Auto-enrich all links with UTM parameters
      generateLearningPath = false, // Generate learning path from products
      brand = null,
      sessionId = null
    } = input;

    console.log(`[CrossPlatformAutoPublisher] Publishing to ${platforms.length} platforms`);

    const results = {
      metadata,
      published: {},
      scheduled: {},
      errors: {},
      urls: {},
      translations: {},
      optimizations: {},
      utmTracking: {},
      learningPaths: {},
      timestamp: new Date().toISOString()
    };

    // Determine brand domain for publishing
    const primaryBrand = brand || routing.primary.brand;
    const domain = routing.primary.domain;

    // NEW: Generate learning path from narrative products
    if (generateLearningPath && this.learningPathGenerator) {
      console.log('[CrossPlatformAutoPublisher] Generating learning paths');

      for (const language of ['en', ...targetLanguages]) {
        const narrativeForLang = language === 'en' ? narrative : { ...narrative };

        try {
          const learningPath = await this.learningPathGenerator.generateFromNarrative({
            narrative: narrativeForLang,
            platform: platforms[0], // Use primary platform
            language,
            persona: personaUsername,
            brand: primaryBrand,
            sessionId
          });

          if (learningPath) {
            results.learningPaths[language] = learningPath;
            console.log(`[CrossPlatformAutoPublisher] Learning path generated for ${language}: ${learningPath.totalSteps} steps`);
          }
        } catch (error) {
          console.error(`[CrossPlatformAutoPublisher] Learning path generation error (${language}):`, error.message);
        }
      }
    }

    // NEW: Auto-translate to multiple languages
    if (autoTranslate && targetLanguages.length > 0 && this.translationPipeline) {
      console.log(`[CrossPlatformAutoPublisher] Auto-translating to ${targetLanguages.length} languages`);

      const translationResult = await this.translationPipeline.translateNarrative({
        narrative,
        targetLanguages,
        brand: primaryBrand,
        sourceLanguage: 'en'
      });

      results.translations = translationResult.translations;
      console.log(`[CrossPlatformAutoPublisher] Translated to ${Object.keys(results.translations).length} languages`);
    }

    // Publish to each platform (English + all translations)
    const languagesToPublish = ['en', ...targetLanguages];

    for (const language of languagesToPublish) {
      // Get narrative for this language
      const narrativeForLang = language === 'en'
        ? narrative
        : { ...narrative, outputs: results.translations[language] };

      for (const platform of platforms) {
        if (!this.platforms[platform]?.enabled) {
          results.errors[`${platform}-${language}`] = 'Platform not enabled or client not configured';
          continue;
        }

        try {
          // NEW: Viral optimization
          let optimizedContent = null;
          if (viralOptimize && this.viralOptimizer) {
            const content = this._extractContentForOptimization(narrativeForLang, platform);

            optimizedContent = await this.viralOptimizer.optimize({
              content: { ...content, language },
              platform,
              targetAudience,
              goal: 'engagement'
            });

            results.optimizations[`${platform}-${language}`] = {
              predictedEngagement: optimizedContent.predictedEngagement,
              hook: optimizedContent.hook,
              hashtags: optimizedContent.hashtags,
              bestTime: optimizedContent.bestTime
            };

            console.log(`[CrossPlatformAutoPublisher] Optimized for ${platform}-${language}: ${optimizedContent.predictedEngagement}% engagement`);
          }

          // NEW: Enrich content with UTM tracking BEFORE publishing
          let enrichedNarrative = narrativeForLang;
          if (enrichLinks && this.linkEnricher) {
            try {
              // Enrich all content formats
              for (const formatKey of Object.keys(narrativeForLang.outputs || {})) {
                const format = narrativeForLang.outputs[formatKey];

                if (format.content) {
                  const enriched = await this.linkEnricher.enrichContent({
                    content: format.content,
                    platform,
                    language,
                    persona: personaUsername,
                    brand: primaryBrand,
                    sessionId,
                    narrative: narrativeForLang,
                    topics: narrativeForLang.themes || [],
                    contentType: 'markdown'
                  });

                  format.content = enriched;
                }

                if (format.narrative) {
                  const enriched = await this.linkEnricher.enrichContent({
                    content: format.narrative,
                    platform,
                    language,
                    persona: personaUsername,
                    brand: primaryBrand,
                    sessionId,
                    narrative: narrativeForLang,
                    topics: narrativeForLang.themes || [],
                    contentType: 'markdown'
                  });

                  format.narrative = enriched;
                }
              }

              enrichedNarrative = narrativeForLang;
              results.utmTracking[`${platform}-${language}`] = { enriched: true };

              console.log(`[CrossPlatformAutoPublisher] Links enriched with UTM tracking for ${platform}-${language}`);
            } catch (error) {
              console.error(`[CrossPlatformAutoPublisher] Link enrichment error (${platform}-${language}):`, error.message);
              results.utmTracking[`${platform}-${language}`] = { enriched: false, error: error.message };
            }
          }

          if (schedule === 'immediate') {
            results.published[`${platform}-${language}`] = await this._publishToPlatform(
              platform,
              enrichedNarrative,
              routing,
              metadata,
              {
                language,
                optimizedContent,
                personaUsername,
                targetAudience,
                brand: primaryBrand,
                sessionId
              }
            );
          } else {
            results.scheduled[`${platform}-${language}`] = await this._schedulePlatform(
              platform,
              enrichedNarrative,
              routing,
              schedule,
              metadata,
              {
                language,
                optimizedContent,
                personaUsername,
                brand: primaryBrand,
                sessionId
              }
            );
          }

          // Extract URLs
          const key = `${platform}-${language}`;
          if (results.published[key]?.url) {
            results.urls[key] = results.published[key].url;
          }

          console.log(`[CrossPlatformAutoPublisher] Published to ${platform} (${language}): ${results.urls[key] || 'scheduled'}`);
        } catch (error) {
          console.error(`[CrossPlatformAutoPublisher] Error publishing to ${platform}-${language}:`, error.message);
          results.errors[`${platform}-${language}`] = error.message;
        }
      }
    }

    // Save publication record to database
    if (this.db) {
      await this._savePublicationRecord(narrative, routing, results);
    }

    return results;
  }

  /**
   * Publish to specific platform
   */
  async _publishToPlatform(platform, narrative, routing, metadata, options = {}) {
    switch (platform) {
      case 'mastodon':
        return await this._publishToMastodon(narrative, routing, metadata, options);

      case 'blog':
        return await this._publishToBlog(narrative, routing, metadata, options);

      case 'twitter':
        return await this._publishToTwitter(narrative, routing, metadata, options);

      case 'youtube':
        return await this._publishToYouTube(narrative, routing, metadata, options);

      case 'newsletter':
        return await this._publishToNewsletter(narrative, routing, metadata, options);

      case 'podcast':
        return await this._publishToPodcast(narrative, routing, metadata, options);

      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  /**
   * NEW: Extract content for viral optimization
   */
  _extractContentForOptimization(narrative, platform) {
    const story = narrative.outputs.story;
    const blog = narrative.outputs.blog;
    const thread = narrative.outputs.thread;

    switch (platform) {
      case 'mastodon':
      case 'twitter':
        return {
          title: story?.title || blog?.title || '',
          body: story?.subtitle || blog?.excerpt || thread?.tweets[0]?.text || ''
        };

      case 'blog':
        return {
          title: blog?.title || story?.title || '',
          body: blog?.content || story?.narrative || ''
        };

      default:
        return {
          title: story?.title || '',
          body: story?.narrative || ''
        };
    }
  }

  /**
   * Publish to Mastodon via ActivityPub
   */
  async _publishToMastodon(narrative, routing, metadata, options = {}) {
    const {
      language = 'en',
      optimizedContent = null,
      personaUsername = null
    } = options;

    // NEW: Use multi-persona ActivityPub if available
    if (personaUsername && this.multiPersonaActivityPub) {
      const story = narrative.outputs.story;
      const blog = narrative.outputs.blog;

      // Use optimized content if available
      const content = optimizedContent
        ? `${optimizedContent.hook}\n\n${optimizedContent.body}\n\n${optimizedContent.hashtags.join(' ')}`
        : (blog ? blog.excerpt : story.subtitle);

      const result = await this.multiPersonaActivityPub.post({
        username: personaUsername,
        content,
        language,
        visibility: 'public'
      });

      return {
        platform: 'mastodon',
        language,
        persona: result.persona,
        url: result.url,
        postId: result.noteId,
        optimized: !!optimizedContent,
        published: true,
        timestamp: new Date().toISOString()
      };
    }

    // Fallback to old single-actor system
    if (!this.activityPubServer) {
      throw new Error('ActivityPub server not configured');
    }

    const story = narrative.outputs.story;
    const blog = narrative.outputs.blog;

    // Use optimized content if available
    const content = optimizedContent
      ? `${optimizedContent.hook}\n\n${optimizedContent.body}\n\n${optimizedContent.hashtags.join(' ')}`
      : (blog ? blog.excerpt : story.subtitle);

    const title = optimizedContent?.hook || story.title;

    // Create federated post
    const post = await this.activityPubServer.createNote({
      actor: routing.primary.domain,
      content: `${title}\n\n${content}`,
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      cc: []
    });

    return {
      platform: 'mastodon',
      language,
      url: post.id,
      postId: post.id,
      optimized: !!optimizedContent,
      published: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Publish to blog
   */
  async _publishToBlog(narrative, routing, metadata, options = {}) {
    const {
      language = 'en',
      optimizedContent = null
    } = options;

    if (!this.contentPublisher) {
      throw new Error('Content publisher not configured');
    }

    const blog = narrative.outputs.blog;
    if (!blog) {
      throw new Error('Blog format not generated in narrative');
    }

    // Use optimized content if available
    const title = optimizedContent?.hook || blog.title;
    const content = optimizedContent?.body || blog.content;
    const tags = optimizedContent?.hashtags.map(h => h.replace('#', '')) || blog.tags || [];

    // Generate slug from title (with language suffix)
    const slug = language === 'en'
      ? this._generateSlug(title)
      : `${this._generateSlug(title)}-${language}`;

    // Publish via content publishing system
    const published = await this.contentPublisher.publish({
      title,
      subtitle: blog.subtitle,
      content,
      excerpt: blog.excerpt,
      format: 'markdown',
      slug,
      tags,
      category: 'voice-journal',
      author: routing.primary.brand,
      metadata: {
        ...metadata,
        language,
        themes: narrative.analysis?.themes?.map(t => t.name) || [],
        readingTime: blog.readingTime,
        optimized: !!optimizedContent,
        predictedEngagement: optimizedContent?.predictedEngagement
      }
    });

    return {
      platform: 'blog',
      language,
      url: `https://${routing.primary.domain}/blog/${slug}`,
      slug,
      optimized: !!optimizedContent,
      published: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Publish to Twitter/X
   */
  async _publishToTwitter(narrative, routing, metadata) {
    if (!this.twitterClient) {
      throw new Error('Twitter client not configured');
    }

    const thread = narrative.outputs.thread;
    if (!thread) {
      throw new Error('Twitter thread format not generated in narrative');
    }

    const tweets = thread.tweets;
    const tweetIds = [];

    let previousTweetId = null;

    for (const tweet of tweets) {
      const response = await this.twitterClient.v2.tweet(
        tweet.text,
        previousTweetId ? { reply: { in_reply_to_tweet_id: previousTweetId } } : undefined
      );

      tweetIds.push(response.data.id);
      previousTweetId = response.data.id;
    }

    return {
      platform: 'twitter',
      url: `https://twitter.com/i/web/status/${tweetIds[0]}`,
      tweetIds,
      threadLength: tweets.length,
      published: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Publish to YouTube (generate script + upload if audio available)
   */
  async _publishToYouTube(narrative, routing, metadata) {
    if (!this.youtubeClient) {
      throw new Error('YouTube client not configured');
    }

    const podcast = narrative.outputs.podcast;
    if (!podcast) {
      throw new Error('Podcast format not generated in narrative');
    }

    // Save script to file
    const scriptPath = await this._saveYouTubeScript(podcast, routing);

    // If audio file available, upload video
    let videoId = null;
    if (metadata.audioFilePath) {
      videoId = await this._uploadYouTubeVideo(podcast, metadata.audioFilePath, routing);
    }

    return {
      platform: 'youtube',
      url: videoId ? `https://youtube.com/watch?v=${videoId}` : null,
      videoId,
      scriptPath,
      published: !!videoId,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Publish to newsletter (draft for review)
   */
  async _publishToNewsletter(narrative, routing, metadata) {
    if (!this.newsletterService) {
      throw new Error('Newsletter service not configured');
    }

    const blog = narrative.outputs.blog;
    if (!blog) {
      throw new Error('Blog format not generated in narrative');
    }

    // Create newsletter draft
    const draft = await this.newsletterService.createDraft({
      subject: blog.title,
      subtitle: blog.subtitle,
      content: blog.content,
      excerpt: blog.excerpt,
      tags: blog.tags,
      sender: routing.primary.brand,
      metadata: {
        ...metadata,
        voiceJournal: true,
        themes: narrative.analysis.themes.map(t => t.name)
      }
    });

    return {
      platform: 'newsletter',
      draftId: draft.id,
      draftUrl: draft.editUrl,
      published: false, // Draft only
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Publish to podcast RSS feed
   */
  async _publishToPodcast(narrative, routing, metadata) {
    if (!this.podcastRSSGenerator) {
      throw new Error('Podcast RSS generator not configured');
    }

    const podcast = narrative.outputs.podcast;
    if (!podcast) {
      throw new Error('Podcast format not generated in narrative');
    }

    // Add episode to RSS feed
    const episode = await this.podcastRSSGenerator.addEpisode({
      title: podcast.episodeTitle,
      description: podcast.description,
      script: podcast.script,
      chapters: podcast.chapters,
      duration: podcast.duration,
      audioUrl: metadata.audioFilePath || null,
      brand: routing.primary.brand,
      metadata: {
        ...metadata,
        themes: narrative.analysis.themes.map(t => t.name)
      }
    });

    return {
      platform: 'podcast',
      episodeId: episode.id,
      rssUrl: episode.rssUrl,
      published: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Schedule publication for later
   */
  async _schedulePlatform(platform, narrative, routing, schedule, metadata) {
    if (!this.db) {
      throw new Error('Database required for scheduling');
    }

    const scheduleDate = new Date(schedule);

    const result = await this.db.query(`
      INSERT INTO voice_journal_scheduled_publications (
        platform,
        narrative_data,
        routing_data,
        metadata,
        scheduled_for,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING publication_id
    `, [
      platform,
      JSON.stringify(narrative),
      JSON.stringify(routing),
      JSON.stringify(metadata),
      scheduleDate,
      'scheduled'
    ]);

    return {
      platform,
      publicationId: result.rows[0].publication_id,
      scheduledFor: scheduleDate.toISOString(),
      published: false
    };
  }

  /**
   * Save publication record to database
   */
  async _savePublicationRecord(narrative, routing, results) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO voice_journal_publications (
          session_id,
          brand,
          domain,
          platforms,
          urls,
          errors,
          narrative_summary,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        narrative.metadata.sessionId || null,
        routing.primary.brand,
        routing.primary.domain,
        JSON.stringify(Object.keys(results.published)),
        JSON.stringify(results.urls),
        JSON.stringify(results.errors),
        JSON.stringify({
          title: narrative.outputs.story?.title,
          themes: narrative.analysis.themes.map(t => t.name),
          insights: narrative.analysis.insights.length
        })
      ]);
    } catch (error) {
      console.error('[CrossPlatformAutoPublisher] Error saving publication record:', error.message);
    }
  }

  /**
   * Generate URL-friendly slug from title
   */
  _generateSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Save YouTube script to file
   */
  async _saveYouTubeScript(podcast, routing) {
    const timestamp = new Date().toISOString().split('T')[0];
    const slug = this._generateSlug(podcast.episodeTitle);
    const filename = `${timestamp}-${slug}-youtube-script.md`;
    const dir = path.join(process.cwd(), 'content', 'youtube-scripts', routing.primary.brand);

    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, filename);

    const content = `# ${podcast.episodeTitle}

**Brand:** ${routing.primary.brand}
**Duration:** ${podcast.duration} minutes
**Generated:** ${new Date().toISOString()}

---

## Description

${podcast.description}

---

## Script

${podcast.script}

---

## Chapters

${podcast.chapters.map(ch => `- **${ch.time}** - ${ch.title}`).join('\n')}
`;

    await fs.writeFile(filePath, content, 'utf-8');

    console.log(`[CrossPlatformAutoPublisher] Saved YouTube script: ${filePath}`);

    return filePath;
  }

  /**
   * Upload video to YouTube
   */
  async _uploadYouTubeVideo(podcast, audioFilePath, routing) {
    // Placeholder - actual implementation would use YouTube Data API v3
    // This would:
    // 1. Convert audio to video (add static image or waveform)
    // 2. Upload video with metadata
    // 3. Set description, tags, chapters
    // 4. Return video ID

    console.log('[CrossPlatformAutoPublisher] YouTube video upload not yet implemented');
    return null;
  }

  /**
   * Publish to multiple brands (cross-post)
   */
  async publishMultiBrand(input) {
    const { narrative, routing, platforms = ['mastodon', 'blog'] } = input;

    const results = {
      primary: null,
      secondary: []
    };

    // Publish to primary brand
    results.primary = await this.publish({
      narrative,
      routing: {
        primary: routing.primary,
        secondary: []
      },
      platforms,
      metadata: { ...input.metadata, brandType: 'primary' }
    });

    // Publish to secondary brands if cross-post enabled
    if (routing.crossPost && routing.secondary.length > 0) {
      for (const secondaryBrand of routing.secondary) {
        try {
          const secondaryResults = await this.publish({
            narrative,
            routing: {
              primary: secondaryBrand,
              secondary: []
            },
            platforms,
            metadata: { ...input.metadata, brandType: 'secondary' }
          });

          results.secondary.push(secondaryResults);
        } catch (error) {
          console.error(`[CrossPlatformAutoPublisher] Error publishing to secondary brand ${secondaryBrand.brand}:`, error.message);
        }
      }
    }

    return results;
  }

  /**
   * Get platform status
   */
  getPlatformStatus() {
    const status = {};

    for (const [platform, config] of Object.entries(this.platforms)) {
      status[platform] = {
        enabled: config.enabled,
        format: config.format,
        capabilities: {
          images: config.supportImages || false,
          threads: config.supportThreads || false,
          html: config.supportHTML || false,
          audio: config.supportAudio || false,
          video: config.supportVideo || false,
          chapters: config.supportChapters || false
        },
        maxLength: config.maxLength || null
      };
    }

    return status;
  }

  /**
   * Test publication (dry run)
   */
  async testPublish(input) {
    const { narrative, routing, platforms = ['mastodon', 'blog'] } = input;

    const results = {
      dryRun: true,
      platforms: {},
      contentPreview: {}
    };

    for (const platform of platforms) {
      results.platforms[platform] = {
        enabled: this.platforms[platform]?.enabled || false,
        wouldPublish: this.platforms[platform]?.enabled || false
      };

      // Generate content preview
      if (platform === 'mastodon') {
        const story = narrative.outputs.story;
        results.contentPreview[platform] = {
          title: story.title,
          content: story.subtitle,
          characterCount: (story.title + story.subtitle).length
        };
      } else if (platform === 'blog') {
        const blog = narrative.outputs.blog;
        results.contentPreview[platform] = {
          title: blog.title,
          slug: this._generateSlug(blog.title),
          readingTime: blog.readingTime,
          tags: blog.tags
        };
      } else if (platform === 'twitter') {
        const thread = narrative.outputs.thread;
        results.contentPreview[platform] = {
          threadLength: thread.tweets.length,
          tweets: thread.tweets.map(t => ({
            text: t.text,
            length: t.text.length
          }))
        };
      }
    }

    return results;
  }
}

module.exports = CrossPlatformAutoPublisher;
