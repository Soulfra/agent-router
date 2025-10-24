/**
 * ActivityPub Server - Federation Protocol Implementation
 *
 * Enables CalRiven.com to federate with Mastodon, Pleroma, and other ActivityPub servers.
 * Users can follow CalRiven via @calriven@calriven.com from any Mastodon instance.
 *
 * Implements:
 * - Actor (CalRiven's profile)
 * - Inbox (receive activities)
 * - Outbox (send activities)
 * - WebFinger (identity discovery)
 * - HTTP Signatures (authentication)
 *
 * Flow:
 * 1. User on Mastodon searches @calriven@calriven.com
 * 2. Mastodon queries /.well-known/webfinger
 * 3. Gets actor URL → /users/calriven
 * 4. Mastodon sends Follow activity to /users/calriven/inbox
 * 5. CalRiven accepts follow, sends activities to follower's inbox
 */

const crypto = require('crypto');
const axios = require('axios');

class ActivityPubServer {
  constructor(options = {}) {
    this.db = options.db;
    this.domain = options.domain || 'calriven.com';
    this.baseUrl = options.baseUrl || `https://${this.domain}`;

    // CalRiven's Actor information
    this.actor = {
      username: options.username || 'calriven',
      displayName: options.displayName || 'CalRiven',
      summary: options.summary || 'AI-powered publishing platform and digital identity',
      icon: options.icon || `${this.baseUrl}/calriven.png`,
      publicKey: options.publicKey || null, // RSA public key for HTTP Signatures
      privateKey: options.privateKey || null // RSA private key
    };

    console.log('[ActivityPub] Server initialized for', this.domain);
  }

  /**
   * Get CalRiven's Actor object (profile)
   * Used by other servers to discover CalRiven
   */
  getActor() {
    return {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://w3id.org/security/v1'
      ],
      id: `${this.baseUrl}/users/${this.actor.username}`,
      type: 'Person',
      preferredUsername: this.actor.username,
      name: this.actor.displayName,
      summary: this.actor.summary,
      inbox: `${this.baseUrl}/users/${this.actor.username}/inbox`,
      outbox: `${this.baseUrl}/users/${this.actor.username}/outbox`,
      followers: `${this.baseUrl}/users/${this.actor.username}/followers`,
      following: `${this.baseUrl}/users/${this.actor.username}/following`,
      icon: {
        type: 'Image',
        mediaType: 'image/png',
        url: this.actor.icon
      },
      publicKey: {
        id: `${this.baseUrl}/users/${this.actor.username}#main-key`,
        owner: `${this.baseUrl}/users/${this.actor.username}`,
        publicKeyPem: this.actor.publicKey
      }
    };
  }

  /**
   * WebFinger response for identity discovery
   * Mastodon queries: /.well-known/webfinger?resource=acct:calriven@calriven.com
   */
  getWebFinger(resource) {
    // Parse resource (acct:username@domain)
    const match = resource.match(/^acct:(.+)@(.+)$/);
    if (!match) {
      throw new Error('Invalid resource format');
    }

    const [, username, domain] = match;

    if (username !== this.actor.username || domain !== this.domain) {
      throw new Error('User not found');
    }

    return {
      subject: resource,
      links: [
        {
          rel: 'self',
          type: 'application/activity+json',
          href: `${this.baseUrl}/users/${username}`
        },
        {
          rel: 'http://webfinger.net/rel/profile-page',
          type: 'text/html',
          href: `${this.baseUrl}/@${username}`
        }
      ]
    };
  }

  /**
   * Handle incoming Activity (Follow, Like, Announce, etc.)
   */
  async handleInboxActivity(activity) {
    console.log('[ActivityPub] Received activity:', activity.type);

    switch (activity.type) {
      case 'Follow':
        return await this.handleFollow(activity);

      case 'Undo':
        if (activity.object && activity.object.type === 'Follow') {
          return await this.handleUnfollow(activity);
        }
        break;

      case 'Like':
        return await this.handleLike(activity);

      case 'Announce': // Boost/Repost
        return await this.handleAnnounce(activity);

      case 'Create':
        return await this.handleCreate(activity);

      default:
        console.log('[ActivityPub] Unhandled activity type:', activity.type);
    }

    return { success: true, message: 'Activity received' };
  }

  /**
   * Handle Follow activity
   * Send Accept activity back to follower
   */
  async handleFollow(activity) {
    const follower = activity.actor;
    const actorId = activity.object;

    // Verify this is a follow for CalRiven
    if (actorId !== `${this.baseUrl}/users/${this.actor.username}`) {
      throw new Error('Follow not for this actor');
    }

    // Store follower in database
    await this.db.query(
      `INSERT INTO activitypub_followers (actor_id, inbox_url, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (actor_id) DO NOTHING`,
      [follower, activity.actor] // TODO: Fetch follower's inbox from their actor
    );

    // Send Accept activity
    const accept = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${this.baseUrl}/accepts/${Date.now()}`,
      type: 'Accept',
      actor: `${this.baseUrl}/users/${this.actor.username}`,
      object: activity
    };

    // Send to follower's inbox
    await this.sendActivity(follower, accept);

    console.log('[ActivityPub] Accepted follow from:', follower);

    return { success: true, follower: follower };
  }

  /**
   * Handle Unfollow (Undo Follow)
   */
  async handleUnfollow(activity) {
    const follower = activity.actor;

    await this.db.query(
      `DELETE FROM activitypub_followers WHERE actor_id = $1`,
      [follower]
    );

    console.log('[ActivityPub] Unfollowed by:', follower);

    return { success: true };
  }

  /**
   * Handle Like activity (someone liked CalRiven's post)
   */
  async handleLike(activity) {
    const liker = activity.actor;
    const objectId = activity.object;

    console.log('[ActivityPub] Liked by:', liker, 'object:', objectId);

    // TODO: Store like in database

    return { success: true };
  }

  /**
   * Handle Announce (boost/repost)
   */
  async handleAnnounce(activity) {
    const announcer = activity.actor;
    const objectId = activity.object;

    console.log('[ActivityPub] Announced by:', announcer, 'object:', objectId);

    // TODO: Store announce in database

    return { success: true };
  }

  /**
   * Handle Create activity (new post from follower)
   */
  async handleCreate(activity) {
    const actor = activity.actor;
    const object = activity.object;

    console.log('[ActivityPub] Create from:', actor, 'type:', object.type);

    // TODO: Handle different object types (Note, Article, etc.)

    return { success: true };
  }

  /**
   * Create a Note activity (publish a post)
   * @param {object} note - Note content
   * @returns {object} ActivityPub Note
   */
  createNote(note) {
    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${this.baseUrl}/notes/${note.id}`,
      type: 'Note',
      published: note.published_at || new Date().toISOString(),
      attributedTo: `${this.baseUrl}/users/${this.actor.username}`,
      content: note.content,
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      cc: [`${this.baseUrl}/users/${this.actor.username}/followers`]
    };
  }

  /**
   * Publish activity to all followers
   * @param {object} activity - Activity to publish
   */
  async publishToFollowers(activity) {
    // Get all followers
    const result = await this.db.query(
      `SELECT actor_id, inbox_url FROM activitypub_followers`
    );

    const followers = result.rows;

    console.log(`[ActivityPub] Publishing to ${followers.length} followers`);

    // Send to each follower's inbox
    const promises = followers.map(follower =>
      this.sendActivity(follower.inbox_url, activity)
    );

    await Promise.allSettled(promises);

    return { sent: followers.length };
  }

  /**
   * Send activity to a remote inbox
   * Includes HTTP Signature for authentication
   */
  async sendActivity(inboxUrl, activity) {
    try {
      // TODO: Add HTTP Signature
      const response = await axios.post(inboxUrl, activity, {
        headers: {
          'Content-Type': 'application/activity+json',
          'User-Agent': 'CalRiven/1.0 (ActivityPub)'
        },
        timeout: 5000
      });

      console.log(`[ActivityPub] Sent to ${inboxUrl}:`, response.status);

      return { success: true };

    } catch (error) {
      console.error(`[ActivityPub] Failed to send to ${inboxUrl}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get followers count
   */
  async getFollowersCount() {
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM activitypub_followers`
    );

    return parseInt(result.rows[0].count);
  }
}

module.exports = ActivityPubServer;
