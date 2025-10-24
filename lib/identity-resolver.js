/**
 * Identity Resolver
 *
 * Connects all identity fragments into a unified identity graph:
 * - Cookie IDs → Device Fingerprints → User Accounts → Vanity Handles →
 *   Badge Levels → Affiliate Codes → Email Addresses → Geolocations
 *
 * Tracks complete attribution paths:
 * Ad impression → Click → Cookie → Landing → Signup → Device → Purchase → Receipt
 *
 * Like reverse programmatic SEO - tracking users back through digital ads
 */

const crypto = require('crypto');

class IdentityResolver {
  constructor(options = {}) {
    this.db = options.db;
    this.cookieMaxAge = options.cookieMaxAge || 30 * 24 * 60 * 60 * 1000; // 30 days
  }

  /**
   * Create or update identity graph entry
   *
   * @param {object} fragments - Identity fragments to connect
   * @returns {Promise<object>} - Identity graph entry
   */
  async resolveIdentity(fragments) {
    try {
      // Generate or use existing identity ID
      const identityId = fragments.identity_id || crypto.randomUUID();

      // Find existing identity by any fragment
      const existing = await this.findIdentityByFragments(fragments);

      if (existing) {
        // Update existing identity with new fragments
        return await this.mergeIdentityFragments(existing.identity_id, fragments);
      }

      // Create new identity
      return await this.createIdentity(identityId, fragments);

    } catch (error) {
      console.error('[IdentityResolver] Error resolving identity:', error);
      throw error;
    }
  }

  /**
   * Find identity by any known fragment
   *
   * @param {object} fragments - Identity fragments
   * @returns {Promise<object|null>} - Identity entry
   */
  async findIdentityByFragments(fragments) {
    try {
      const conditions = [];
      const values = [];
      let paramCount = 1;

      if (fragments.user_id) {
        conditions.push(`user_id = $${paramCount++}`);
        values.push(fragments.user_id);
      }

      if (fragments.cookie_id) {
        conditions.push(`cookie_id = $${paramCount++}`);
        values.push(fragments.cookie_id);
      }

      if (fragments.device_fingerprint) {
        conditions.push(`device_fingerprint = $${paramCount++}`);
        values.push(fragments.device_fingerprint);
      }

      if (fragments.email) {
        conditions.push(`email = $${paramCount++}`);
        values.push(fragments.email.toLowerCase());
      }

      if (fragments.vanity_handle) {
        conditions.push(`vanity_handle = $${paramCount++}`);
        values.push(fragments.vanity_handle.toLowerCase());
      }

      if (conditions.length === 0) {
        return null;
      }

      const result = await this.db.query(`
        SELECT *
        FROM identity_graph
        WHERE ${conditions.join(' OR ')}
        ORDER BY last_seen DESC
        LIMIT 1
      `, values);

      return result.rows[0] || null;

    } catch (error) {
      console.error('[IdentityResolver] Error finding identity:', error);
      return null;
    }
  }

  /**
   * Create new identity entry
   *
   * @param {string} identityId - Identity ID
   * @param {object} fragments - Identity fragments
   * @returns {Promise<object>} - Created identity
   */
  async createIdentity(identityId, fragments) {
    try {
      const result = await this.db.query(`
        INSERT INTO identity_graph (
          identity_id,
          user_id,
          cookie_id,
          device_fingerprint,
          email,
          vanity_handle,
          badge_level,
          affiliate_code,
          ip_address,
          location,
          user_agent,
          platform,
          first_seen,
          last_seen,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), $13)
        RETURNING *
      `, [
        identityId,
        fragments.user_id || null,
        fragments.cookie_id || null,
        fragments.device_fingerprint || null,
        fragments.email ? fragments.email.toLowerCase() : null,
        fragments.vanity_handle ? fragments.vanity_handle.toLowerCase() : null,
        fragments.badge_level || 'newcomer',
        fragments.affiliate_code || null,
        fragments.ip_address || null,
        fragments.location ? JSON.stringify(fragments.location) : null,
        fragments.user_agent || null,
        fragments.platform || null,
        JSON.stringify(fragments.metadata || {})
      ]);

      console.log(`[IdentityResolver] Created identity ${identityId}`);

      return result.rows[0];

    } catch (error) {
      console.error('[IdentityResolver] Error creating identity:', error);
      throw error;
    }
  }

  /**
   * Merge new fragments into existing identity
   *
   * @param {string} identityId - Existing identity ID
   * @param {object} fragments - New fragments to merge
   * @returns {Promise<object>} - Updated identity
   */
  async mergeIdentityFragments(identityId, fragments) {
    try {
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (fragments.user_id) {
        updates.push(`user_id = $${paramCount++}`);
        values.push(fragments.user_id);
      }

      if (fragments.cookie_id) {
        updates.push(`cookie_id = $${paramCount++}`);
        values.push(fragments.cookie_id);
      }

      if (fragments.device_fingerprint) {
        updates.push(`device_fingerprint = $${paramCount++}`);
        values.push(fragments.device_fingerprint);
      }

      if (fragments.email) {
        updates.push(`email = $${paramCount++}`);
        values.push(fragments.email.toLowerCase());
      }

      if (fragments.vanity_handle) {
        updates.push(`vanity_handle = $${paramCount++}`);
        values.push(fragments.vanity_handle.toLowerCase());
      }

      if (fragments.badge_level) {
        updates.push(`badge_level = $${paramCount++}`);
        values.push(fragments.badge_level);
      }

      if (fragments.affiliate_code) {
        updates.push(`affiliate_code = $${paramCount++}`);
        values.push(fragments.affiliate_code);
      }

      if (fragments.ip_address) {
        updates.push(`ip_address = $${paramCount++}`);
        values.push(fragments.ip_address);
      }

      if (fragments.location) {
        updates.push(`location = $${paramCount++}`);
        values.push(JSON.stringify(fragments.location));
      }

      if (fragments.user_agent) {
        updates.push(`user_agent = $${paramCount++}`);
        values.push(fragments.user_agent);
      }

      if (fragments.platform) {
        updates.push(`platform = $${paramCount++}`);
        values.push(fragments.platform);
      }

      updates.push(`last_seen = NOW()`);

      values.push(identityId);

      const result = await this.db.query(`
        UPDATE identity_graph
        SET ${updates.join(', ')}
        WHERE identity_id = $${paramCount}
        RETURNING *
      `, values);

      console.log(`[IdentityResolver] Merged fragments into identity ${identityId}`);

      return result.rows[0];

    } catch (error) {
      console.error('[IdentityResolver] Error merging fragments:', error);
      throw error;
    }
  }

  /**
   * Track attribution event (ad click, landing, signup, purchase)
   *
   * @param {object} event - Attribution event
   * @returns {Promise<object>} - Tracked event
   */
  async trackAttributionEvent(event) {
    try {
      // Find or create identity
      const identity = await this.resolveIdentity({
        cookie_id: event.cookie_id,
        device_fingerprint: event.device_fingerprint,
        user_id: event.user_id,
        ip_address: event.ip_address,
        user_agent: event.user_agent,
        platform: event.platform
      });

      // Save attribution event
      const result = await this.db.query(`
        INSERT INTO attribution_events (
          event_id,
          identity_id,
          event_type,
          event_data,
          referrer,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_content,
          utm_term,
          affiliate_code,
          ip_address,
          user_agent,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        RETURNING *
      `, [
        crypto.randomUUID(),
        identity.identity_id,
        event.event_type, // 'ad_click', 'landing', 'signup', 'purchase'
        JSON.stringify(event.event_data || {}),
        event.referrer || null,
        event.utm_source || null,
        event.utm_medium || null,
        event.utm_campaign || null,
        event.utm_content || null,
        event.utm_term || null,
        event.affiliate_code || null,
        event.ip_address || null,
        event.user_agent || null
      ]);

      console.log(`[IdentityResolver] Tracked ${event.event_type} for identity ${identity.identity_id}`);

      return result.rows[0];

    } catch (error) {
      console.error('[IdentityResolver] Error tracking event:', error);
      throw error;
    }
  }

  /**
   * Get complete attribution path for user
   *
   * @param {string} userId - User ID
   * @returns {Promise<array>} - Attribution path
   */
  async getAttributionPath(userId) {
    try {
      // Get identity
      const identity = await this.findIdentityByFragments({ user_id: userId });

      if (!identity) {
        return [];
      }

      // Get all events for this identity
      const result = await this.db.query(`
        SELECT *
        FROM attribution_events
        WHERE identity_id = $1
        ORDER BY created_at ASC
      `, [identity.identity_id]);

      return result.rows;

    } catch (error) {
      console.error('[IdentityResolver] Error getting attribution path:', error);
      return [];
    }
  }

  /**
   * Get identity graph for user
   *
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Complete identity graph
   */
  async getIdentityGraph(userId) {
    try {
      const identity = await this.findIdentityByFragments({ user_id: userId });

      if (!identity) {
        return null;
      }

      // Get attribution events
      const events = await this.getAttributionPath(userId);

      // Get devices
      const devices = await this.db.query(`
        SELECT *
        FROM user_devices
        WHERE user_id = $1
        ORDER BY last_seen DESC
      `, [userId]);

      // Get receipts
      const receipts = await this.db.query(`
        SELECT *
        FROM receipt_data
        WHERE user_id = $1
        ORDER BY receipt_date DESC
      `, [userId]);

      // Get affiliate referrals
      const referrals = await this.db.query(`
        SELECT *
        FROM affiliate_referrals
        WHERE referred_user_id = $1
        ORDER BY created_at DESC
      `, [userId]);

      return {
        identity: identity,
        attribution_events: events,
        devices: devices.rows,
        receipts: receipts.rows,
        referrals: referrals.rows,
        graph: this.buildGraphVisualization(identity, events, devices.rows, receipts.rows, referrals.rows)
      };

    } catch (error) {
      console.error('[IdentityResolver] Error getting identity graph:', error);
      return null;
    }
  }

  /**
   * Build graph visualization data
   *
   * @param {object} identity - Identity entry
   * @param {array} events - Attribution events
   * @param {array} devices - User devices
   * @param {array} receipts - User receipts
   * @param {array} referrals - Affiliate referrals
   * @returns {object} - Graph visualization data
   */
  buildGraphVisualization(identity, events, devices, receipts, referrals) {
    const nodes = [];
    const edges = [];

    // Central identity node
    nodes.push({
      id: identity.identity_id,
      type: 'identity',
      label: identity.vanity_handle || identity.email || 'Anonymous',
      data: identity
    });

    // Cookie node
    if (identity.cookie_id) {
      nodes.push({
        id: identity.cookie_id,
        type: 'cookie',
        label: `Cookie ${identity.cookie_id.substring(0, 8)}...`
      });
      edges.push({
        from: identity.cookie_id,
        to: identity.identity_id,
        type: 'tracked_as'
      });
    }

    // Device nodes
    devices.forEach(device => {
      nodes.push({
        id: device.fingerprint,
        type: 'device',
        label: device.nickname || device.platform
      });
      edges.push({
        from: device.fingerprint,
        to: identity.identity_id,
        type: 'owned_by'
      });
    });

    // Receipt nodes
    receipts.forEach(receipt => {
      nodes.push({
        id: receipt.order_id,
        type: 'purchase',
        label: `$${(receipt.amount_cents / 100).toFixed(2)}`
      });
      edges.push({
        from: identity.identity_id,
        to: receipt.order_id,
        type: 'purchased'
      });
    });

    // Affiliate nodes
    referrals.forEach(referral => {
      if (!nodes.find(n => n.id === referral.affiliate_code)) {
        nodes.push({
          id: referral.affiliate_code,
          type: 'affiliate',
          label: referral.affiliate_code
        });
      }
      edges.push({
        from: referral.affiliate_code,
        to: identity.identity_id,
        type: 'referred'
      });
    });

    // Attribution event nodes
    events.forEach(event => {
      nodes.push({
        id: event.event_id,
        type: 'event',
        label: event.event_type
      });
      edges.push({
        from: identity.identity_id,
        to: event.event_id,
        type: 'triggered'
      });
    });

    return { nodes, edges };
  }

  /**
   * Find potential duplicate identities (same person, multiple identities)
   *
   * @returns {Promise<array>} - Potential duplicates
   */
  async findDuplicateIdentities() {
    try {
      // Find identities with matching fingerprints/emails
      const result = await this.db.query(`
        SELECT
          array_agg(identity_id) as identity_ids,
          COUNT(*) as count,
          device_fingerprint,
          email
        FROM identity_graph
        WHERE device_fingerprint IS NOT NULL OR email IS NOT NULL
        GROUP BY device_fingerprint, email
        HAVING COUNT(*) > 1
        ORDER BY count DESC
      `);

      return result.rows;

    } catch (error) {
      console.error('[IdentityResolver] Error finding duplicates:', error);
      return [];
    }
  }

  /**
   * Merge duplicate identities
   *
   * @param {string} primaryId - Primary identity to keep
   * @param {string} duplicateId - Duplicate identity to merge
   * @returns {Promise<boolean>} - Success
   */
  async mergeDuplicateIdentities(primaryId, duplicateId) {
    try {
      // Update all attribution events
      await this.db.query(`
        UPDATE attribution_events
        SET identity_id = $1
        WHERE identity_id = $2
      `, [primaryId, duplicateId]);

      // Delete duplicate identity
      await this.db.query(`
        DELETE FROM identity_graph
        WHERE identity_id = $1
      `, [duplicateId]);

      console.log(`[IdentityResolver] Merged ${duplicateId} into ${primaryId}`);

      return true;

    } catch (error) {
      console.error('[IdentityResolver] Error merging identities:', error);
      return false;
    }
  }
}

module.exports = IdentityResolver;
