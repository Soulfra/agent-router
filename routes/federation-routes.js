/**
 * Federation Routes (ActivityPub/Fediverse)
 *
 * Endpoints for CalRiven.com federation with Mastodon and other ActivityPub servers
 */

const express = require('express');
const ActivityPubServer = require('../lib/activitypub-server');

function initFederationRoutes(db) {
  const router = express.Router();

  const activitypub = new ActivityPubServer({
    db,
    domain: process.env.DOMAIN || 'calriven.com',
    baseUrl: process.env.BASE_URL || 'https://calriven.com',
    username: 'calriven',
    displayName: 'CalRiven',
    summary: 'AI-powered publishing platform - Your federated digital identity'
  });

  /**
   * GET /.well-known/webfinger
   * WebFinger discovery endpoint
   */
  router.get('/.well-known/webfinger', (req, res) => {
    try {
      const { resource } = req.query;

      if (!resource) {
        return res.status(400).json({ error: 'resource parameter required' });
      }

      const webfinger = activitypub.getWebFinger(resource);

      res.json(webfinger);

    } catch (error) {
      console.error('[Federation] WebFinger error:', error);
      res.status(404).json({ error: error.message });
    }
  });

  /**
   * GET /users/:username
   * Get Actor profile (CalRiven's public profile)
   */
  router.get('/users/:username', (req, res) => {
    try {
      const { username } = req.params;

      if (username !== 'calriven') {
        return res.status(404).json({ error: 'User not found' });
      }

      const actor = activitypub.getActor();

      res.setHeader('Content-Type', 'application/activity+json');
      res.json(actor);

    } catch (error) {
      console.error('[Federation] Actor error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /users/:username/inbox
   * Receive activities (Follow, Like, Announce, etc.)
   */
  router.post('/users/:username/inbox', express.json({ type: 'application/activity+json' }), async (req, res) => {
    try {
      const { username } = req.params;

      if (username !== 'calriven') {
        return res.status(404).json({ error: 'User not found' });
      }

      const activity = req.body;

      // TODO: Verify HTTP Signature

      const result = await activitypub.handleInboxActivity(activity);

      res.json({ success: true, ...result });

    } catch (error) {
      console.error('[Federation] Inbox error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /users/:username/outbox
   * Get CalRiven's published activities
   */
  router.get('/users/:username/outbox', async (req, res) => {
    try {
      const { username } = req.params;

      if (username !== 'calriven') {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get recent published articles
      const articles = await db.query(
        `SELECT * FROM author_articles
         WHERE status = 'published'
         ORDER BY published_at DESC
         LIMIT 20`
      );

      // Convert to ActivityPub Note objects
      const items = articles.rows.map(article => activitypub.createNote({
        id: article.article_id,
        content: `<h1>${article.title}</h1><p>${article.content.substring(0, 500)}...</p>`,
        published_at: article.published_at
      }));

      const outbox = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: `https://calriven.com/users/${username}/outbox`,
        type: 'OrderedCollection',
        totalItems: items.length,
        orderedItems: items
      };

      res.setHeader('Content-Type', 'application/activity+json');
      res.json(outbox);

    } catch (error) {
      console.error('[Federation] Outbox error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /users/:username/followers
   * Get CalRiven's followers list
   */
  router.get('/users/:username/followers', async (req, res) => {
    try {
      const { username } = req.params;

      if (username !== 'calriven') {
        return res.status(404).json({ error: 'User not found' });
      }

      const count = await activitypub.getFollowersCount();

      const followers = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: `https://calriven.com/users/${username}/followers`,
        type: 'OrderedCollection',
        totalItems: count
      };

      res.setHeader('Content-Type', 'application/activity+json');
      res.json(followers);

    } catch (error) {
      console.error('[Federation] Followers error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/federation/publish
   * Publish new article to followers
   */
  router.post('/publish', async (req, res) => {
    try {
      const { article_id } = req.body;

      // Get article
      const result = await db.query(
        `SELECT * FROM author_articles WHERE article_id = $1 AND status = 'published'`,
        [article_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Article not found' });
      }

      const article = result.rows[0];

      // Create ActivityPub Note
      const note = activitypub.createNote({
        id: article.article_id,
        content: `<h1>${article.title}</h1><p>${article.content.substring(0, 500)}...</p>`,
        published_at: article.published_at
      });

      // Wrap in Create activity
      const createActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: `https://calriven.com/activities/${Date.now()}`,
        type: 'Create',
        actor: 'https://calriven.com/users/calriven',
        published: new Date().toISOString(),
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        cc: ['https://calriven.com/users/calriven/followers'],
        object: note
      };

      // Send to all followers
      const published = await activitypub.publishToFollowers(createActivity);

      res.json({
        success: true,
        published_to_followers: published.sent,
        article_id: article_id
      });

    } catch (error) {
      console.error('[Federation] Publish error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = initFederationRoutes;
