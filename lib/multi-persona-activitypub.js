/**
 * Multi-Persona ActivityPub System
 *
 * Extends ActivityPub to support multiple personas/actors per brand:
 * - Alice @alice@soulfra.com (privacy activist)
 * - Bob @bob@deathtodata.com (anti-surveillance)
 * - CalRiven @calriven@calriven.com (AI publisher)
 * - RoughSpark @roughspark@roughsparks.com (designer)
 * - etc.
 *
 * Each persona has:
 * - Unique WebFinger identity
 * - Separate inbox/outbox
 * - Own followers/following
 * - Distinct personality/voice
 *
 * Usage:
 *   const multiPersona = new MultiPersonaActivityPub({ db, domain });
 *
 *   // Create persona
 *   await multiPersona.createPersona({
 *     username: 'alice',
 *     displayName: 'Alice Privacy',
 *     summary: 'Privacy activist fighting data brokers',
 *     brand: 'soulfra',
 *     personality: 'activist',
 *     topics: ['privacy', 'zero-knowledge', 'data-rights']
 *   });
 *
 *   // Post as persona
 *   await multiPersona.post({
 *     username: 'alice',
 *     content: 'Data brokers are destroying privacy...',
 *     language: 'en'
 *   });
 */

const crypto = require('crypto');
const axios = require('axios');
const { EventEmitter } = require('events');

class MultiPersonaActivityPub extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.domain = options.domain || 'calriven.com';
    this.baseUrl = options.baseUrl || `https://${this.domain}`;

    // Persona personalities
    this.personalities = {
      activist: {
        tone: 'Passionate, direct, no-bullshit',
        style: 'Short punchy sentences, calls to action',
        emojis: ['💪', '🔥', '⚡', '🎯']
      },
      technical: {
        tone: 'Analytical, precise, educational',
        style: 'Detailed explanations, code examples',
        emojis: ['💻', '🔧', '📊', '🧠']
      },
      creative: {
        tone: 'Playful, visual, inspiring',
        style: 'Metaphors, stories, visuals',
        emojis: ['✨', '🎨', '🌈', '💡']
      },
      business: {
        tone: 'Strategic, analytical, growth-focused',
        style: 'Metrics, case studies, ROI',
        emojis: ['📈', '💰', '🚀', '🎯']
      },
      whimsical: {
        tone: 'Fun, quirky, approachable',
        style: 'Rhymes, wordplay, humor',
        emojis: ['🎩', '🦄', '🎪', '🎭']
      }
    };

    console.log('[MultiPersonaActivityPub] Initialized for', this.domain);
  }

  /**
   * Create new persona
   */
  async createPersona(options) {
    const {
      username,
      displayName,
      summary,
      brand,
      personality = 'technical',
      topics = [],
      icon = null,
      preferredLanguages = ['en']
    } = options;

    if (!this.db) {
      throw new Error('Database required for persona management');
    }

    // Generate RSA key pair for HTTP signatures
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    try {
      const result = await this.db.query(`
        INSERT INTO activitypub_personas (
          username,
          domain,
          display_name,
          summary,
          brand,
          personality,
          topics,
          icon_url,
          preferred_languages,
          public_key,
          private_key,
          actor_id,
          inbox_url,
          outbox_url,
          followers_url,
          following_url,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
        RETURNING persona_id
      `, [
        username,
        this.domain,
        displayName,
        summary,
        brand,
        personality,
        JSON.stringify(topics),
        icon || `${this.baseUrl}/avatars/${username}.png`,
        JSON.stringify(preferredLanguages),
        publicKey,
        privateKey,
        `${this.baseUrl}/users/${username}`,
        `${this.baseUrl}/users/${username}/inbox`,
        `${this.baseUrl}/users/${username}/outbox`,
        `${this.baseUrl}/users/${username}/followers`,
        `${this.baseUrl}/users/${username}/following`
      ]);

      const personaId = result.rows[0].persona_id;

      console.log(`[MultiPersonaActivityPub] Created persona: @${username}@${this.domain} (ID: ${personaId})`);

      this.emit('persona:created', {
        personaId,
        username,
        brand,
        personality
      });

      return {
        personaId,
        username,
        actorId: `${this.baseUrl}/users/${username}`,
        webfinger: `@${username}@${this.domain}`
      };
    } catch (error) {
      console.error('[MultiPersonaActivityPub] Create persona error:', error.message);
      throw error;
    }
  }

  /**
   * Get persona by username
   */
  async getPersona(username) {
    if (!this.db) {
      throw new Error('Database required');
    }

    const result = await this.db.query(`
      SELECT * FROM activitypub_personas
      WHERE username = $1 AND domain = $2
    `, [username, this.domain]);

    if (result.rows.length === 0) {
      return null;
    }

    const persona = result.rows[0];

    // Parse JSON fields
    persona.topics = JSON.parse(persona.topics || '[]');
    persona.preferred_languages = JSON.parse(persona.preferred_languages || '["en"]');

    return persona;
  }

  /**
   * Get Actor object for persona (ActivityPub profile)
   */
  async getActor(username) {
    const persona = await this.getPersona(username);

    if (!persona) {
      throw new Error(`Persona not found: ${username}`);
    }

    return {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://w3id.org/security/v1'
      ],
      id: persona.actor_id,
      type: 'Person',
      preferredUsername: persona.username,
      name: persona.display_name,
      summary: persona.summary,
      inbox: persona.inbox_url,
      outbox: persona.outbox_url,
      followers: persona.followers_url,
      following: persona.following_url,
      icon: {
        type: 'Image',
        mediaType: 'image/png',
        url: persona.icon_url
      },
      publicKey: {
        id: `${persona.actor_id}#main-key`,
        owner: persona.actor_id,
        publicKeyPem: persona.public_key
      }
    };
  }

  /**
   * WebFinger response for persona
   */
  async getWebFinger(resource) {
    // Parse resource (acct:username@domain)
    const match = resource.match(/^acct:(.+)@(.+)$/);
    if (!match) {
      throw new Error('Invalid resource format');
    }

    const [, username, domain] = match;

    if (domain !== this.domain) {
      throw new Error('Domain mismatch');
    }

    const persona = await this.getPersona(username);

    if (!persona) {
      throw new Error(`Persona not found: ${username}`);
    }

    return {
      subject: resource,
      links: [
        {
          rel: 'self',
          type: 'application/activity+json',
          href: persona.actor_id
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
   * Post content as persona
   */
  async post(options) {
    const {
      username,
      content,
      language = 'en',
      visibility = 'public',
      inReplyTo = null,
      attachments = []
    } = options;

    const persona = await this.getPersona(username);

    if (!persona) {
      throw new Error(`Persona not found: ${username}`);
    }

    // Adapt content to personality
    const adaptedContent = await this._adaptToPersonality(content, persona.personality, language);

    // Create Note activity
    const noteId = `${persona.actor_id}/posts/${Date.now()}`;
    const note = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: noteId,
      type: 'Note',
      published: new Date().toISOString(),
      attributedTo: persona.actor_id,
      content: adaptedContent,
      contentMap: {
        [language]: adaptedContent
      },
      to: visibility === 'public'
        ? ['https://www.w3.org/ns/activitystreams#Public']
        : [],
      cc: [persona.followers_url],
      inReplyTo,
      attachment: attachments
    };

    // Create Create activity
    const activity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${noteId}/activity`,
      type: 'Create',
      actor: persona.actor_id,
      published: new Date().toISOString(),
      to: note.to,
      cc: note.cc,
      object: note
    };

    // Save to database
    if (this.db) {
      await this.db.query(`
        INSERT INTO activitypub_posts (
          persona_id,
          note_id,
          content,
          language,
          visibility,
          activity_data,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        persona.persona_id,
        noteId,
        adaptedContent,
        language,
        visibility,
        JSON.stringify(activity)
      ]);
    }

    // Send to followers
    await this._deliverToFollowers(persona, activity);

    console.log(`[MultiPersonaActivityPub] Posted as @${username}: ${adaptedContent.substring(0, 50)}...`);

    this.emit('post:created', {
      personaId: persona.persona_id,
      username,
      noteId,
      content: adaptedContent,
      language
    });

    return {
      noteId,
      url: noteId,
      persona: `@${username}@${this.domain}`,
      content: adaptedContent
    };
  }

  /**
   * Adapt content to persona's personality
   */
  async _adaptToPersonality(content, personality, language) {
    const personalityConfig = this.personalities[personality];

    if (!personalityConfig) {
      return content;
    }

    // Add personality-specific emojis
    const emojis = personalityConfig.emojis;
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

    // For now, simple adaptation - add emoji
    // TODO: Use LLM to fully rewrite in personality style
    return `${randomEmoji} ${content}`;
  }

  /**
   * Deliver activity to all followers
   */
  async _deliverToFollowers(persona, activity) {
    if (!this.db) return;

    // Get followers
    const result = await this.db.query(`
      SELECT follower_inbox_url
      FROM activitypub_followers
      WHERE persona_id = $1 AND status = 'accepted'
    `, [persona.persona_id]);

    const followers = result.rows;

    // Deliver to each follower's inbox
    for (const follower of followers) {
      try {
        await this._signedRequest(
          follower.follower_inbox_url,
          activity,
          persona.private_key,
          persona.actor_id
        );
      } catch (error) {
        console.error(`[MultiPersonaActivityPub] Delivery error to ${follower.follower_inbox_url}:`, error.message);
      }
    }

    console.log(`[MultiPersonaActivityPub] Delivered to ${followers.length} followers`);
  }

  /**
   * Send signed HTTP request (HTTP Signatures)
   */
  async _signedRequest(url, body, privateKey, actorId) {
    const parsedUrl = new URL(url);
    const date = new Date().toUTCString();
    const bodyString = JSON.stringify(body);
    const digest = 'SHA-256=' + crypto.createHash('sha256').update(bodyString).digest('base64');

    const stringToSign = `(request-target): post ${parsedUrl.pathname}\nhost: ${parsedUrl.host}\ndate: ${date}\ndigest: ${digest}`;

    const signer = crypto.createSign('sha256');
    signer.update(stringToSign);
    signer.end();

    const signature = signer.sign(privateKey, 'base64');

    const signatureHeader = `keyId="${actorId}#main-key",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${signature}"`;

    await axios.post(url, body, {
      headers: {
        'Host': parsedUrl.host,
        'Date': date,
        'Digest': digest,
        'Signature': signatureHeader,
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json'
      }
    });
  }

  /**
   * Handle incoming Follow activity
   */
  async handleFollow(personaUsername, followerActorId, activity) {
    const persona = await this.getPersona(personaUsername);

    if (!persona) {
      throw new Error(`Persona not found: ${personaUsername}`);
    }

    // Fetch follower info
    const followerResponse = await axios.get(followerActorId, {
      headers: { 'Accept': 'application/activity+json' }
    });

    const follower = followerResponse.data;

    // Save follower
    await this.db.query(`
      INSERT INTO activitypub_followers (
        persona_id,
        follower_actor_id,
        follower_inbox_url,
        follower_data,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (persona_id, follower_actor_id) DO UPDATE SET
        status = 'accepted',
        updated_at = NOW()
    `, [
      persona.persona_id,
      followerActorId,
      follower.inbox,
      JSON.stringify(follower),
      'accepted'
    ]);

    // Send Accept activity
    const accept = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${activity.id}/accept`,
      type: 'Accept',
      actor: persona.actor_id,
      object: activity
    };

    await this._signedRequest(
      follower.inbox,
      accept,
      persona.private_key,
      persona.actor_id
    );

    console.log(`[MultiPersonaActivityPub] @${personaUsername} accepted follow from ${followerActorId}`);

    this.emit('follower:added', {
      personaId: persona.persona_id,
      username: personaUsername,
      followerActorId
    });

    return accept;
  }

  /**
   * Get all personas for a brand
   */
  async getPersonasByBrand(brand) {
    if (!this.db) {
      throw new Error('Database required');
    }

    const result = await this.db.query(`
      SELECT persona_id, username, display_name, personality, topics
      FROM activitypub_personas
      WHERE brand = $1 AND domain = $2
      ORDER BY created_at DESC
    `, [brand, this.domain]);

    return result.rows.map(row => ({
      ...row,
      topics: JSON.parse(row.topics || '[]'),
      webfinger: `@${row.username}@${this.domain}`
    }));
  }

  /**
   * Route content to best persona for topic
   */
  async routeToPersona(brand, topics = []) {
    const personas = await this.getPersonasByBrand(brand);

    if (personas.length === 0) {
      throw new Error(`No personas found for brand: ${brand}`);
    }

    // Simple topic matching - choose persona with most overlapping topics
    let bestPersona = personas[0];
    let bestScore = 0;

    for (const persona of personas) {
      const overlap = topics.filter(t => persona.topics.includes(t)).length;
      if (overlap > bestScore) {
        bestScore = overlap;
        bestPersona = persona;
      }
    }

    console.log(`[MultiPersonaActivityPub] Routed to @${bestPersona.username} (${bestScore} topic matches)`);

    return bestPersona;
  }

  /**
   * Get persona statistics
   */
  async getPersonaStats(username) {
    if (!this.db) {
      throw new Error('Database required');
    }

    const persona = await this.getPersona(username);

    if (!persona) {
      throw new Error(`Persona not found: ${username}`);
    }

    const stats = await this.db.query(`
      SELECT
        (SELECT COUNT(*) FROM activitypub_followers WHERE persona_id = $1 AND status = 'accepted') as followers_count,
        (SELECT COUNT(*) FROM activitypub_posts WHERE persona_id = $1) as posts_count,
        (SELECT MAX(created_at) FROM activitypub_posts WHERE persona_id = $1) as last_post_at
    `, [persona.persona_id]);

    return {
      username,
      webfinger: `@${username}@${this.domain}`,
      ...stats.rows[0]
    };
  }
}

module.exports = MultiPersonaActivityPub;
