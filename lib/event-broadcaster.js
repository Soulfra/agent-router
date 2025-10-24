/**
 * Event Broadcaster
 *
 * Implements wave/pulse/echo event propagation across distributed systems.
 * Events propagate through the network with TTL to prevent infinite loops,
 * creating a "wave" effect across all connected instances.
 *
 * Features:
 * - Wave propagation with TTL
 * - Event filtering and subscriptions
 * - Multi-instance coordination
 * - Propagation path tracking
 * - Echo detection and prevention
 * - WebSocket integration
 * - Shard-aware broadcasting
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class EventBroadcaster extends EventEmitter {
  constructor(options = {}) {
    super();

    // WebSocket server (from router.js)
    this.wss = options.wss || null;

    // Shard manager integration
    this.shardManager = options.shardManager || null;

    // Event configuration
    this.defaultTTL = options.defaultTTL || 10; // Max hops
    this.maxEventAge = options.maxEventAge || 60000; // 60s max age

    // Event tracking
    this.seenEvents = new Map(); // event_id -> { timestamp, ttl, path }
    this.eventCleanupInterval = options.eventCleanupInterval || 30000; // 30s

    // Subscriptions (pattern-based)
    this.subscriptions = new Map(); // client_id -> [patterns]

    // Statistics
    this.stats = {
      eventsBroadcast: 0,
      eventsReceived: 0,
      echoesDetected: 0,
      wavesPropagated: 0,
      subscriptionsActive: 0
    };

    // Instance ID (unique per instance)
    this.instanceId = options.instanceId || this._generateInstanceId();

    // Start cleanup
    this._startEventCleanup();

    console.log(`[EventBroadcaster] Initialized (instance: ${this.instanceId})`);
  }

  /**
   * Broadcast an event with wave propagation
   *
   * @param {string} type - Event type (e.g., 'price.update', 'arbitrage.detected')
   * @param {Object} data - Event data
   * @param {Object} options - Broadcast options
   * @returns {string} Event ID
   */
  broadcast(type, data, options = {}) {
    const event = this._createEvent(type, data, options);

    this.stats.eventsBroadcast++;

    console.log(`[EventBroadcaster] Broadcasting ${type} (id: ${event.id}, ttl: ${event.ttl})`);

    // Track this event
    this._trackEvent(event);

    // Propagate to local subscribers
    this._propagateToLocal(event);

    // Propagate to WebSocket clients
    this._propagateToWebSocket(event);

    // Propagate to other instances (if configured)
    this._propagateToInstances(event);

    // Store in shard (if configured)
    this._storeEvent(event);

    return event.id;
  }

  /**
   * Receive an event from another instance (handles echoes)
   *
   * @param {Object} event - Event object
   * @returns {boolean} True if processed, false if echo detected
   */
  receive(event) {
    this.stats.eventsReceived++;

    // Check if we've seen this event before (echo detection)
    if (this._isEcho(event)) {
      this.stats.echoesDetected++;
      console.log(`[EventBroadcaster] Echo detected for ${event.type} (id: ${event.id})`);
      return false;
    }

    // Check TTL
    if (event.ttl <= 0) {
      console.log(`[EventBroadcaster] Event ${event.id} expired (ttl: 0)`);
      return false;
    }

    // Check event age
    const age = Date.now() - new Date(event.timestamp).getTime();
    if (age > this.maxEventAge) {
      console.log(`[EventBroadcaster] Event ${event.id} too old (age: ${age}ms)`);
      return false;
    }

    console.log(`[EventBroadcaster] Receiving ${event.type} (id: ${event.id}, ttl: ${event.ttl})`);

    // Track this event
    this._trackEvent(event);

    // Decrement TTL for propagation
    const propagatedEvent = {
      ...event,
      ttl: event.ttl - 1,
      path: [...event.path, this.instanceId]
    };

    // Propagate to local subscribers
    this._propagateToLocal(propagatedEvent);

    // Propagate to WebSocket clients
    this._propagateToWebSocket(propagatedEvent);

    // Continue wave propagation (if TTL > 0)
    if (propagatedEvent.ttl > 0) {
      this._propagateToInstances(propagatedEvent);
      this.stats.wavesPropagated++;
    }

    return true;
  }

  /**
   * Subscribe to event patterns
   *
   * @param {string} clientId - Client identifier
   * @param {Array<string>} patterns - Event patterns (e.g., ['price.*', 'arbitrage.*'])
   */
  subscribe(clientId, patterns) {
    if (!Array.isArray(patterns)) {
      patterns = [patterns];
    }

    this.subscriptions.set(clientId, patterns);
    this.stats.subscriptionsActive = this.subscriptions.size;

    console.log(`[EventBroadcaster] Client ${clientId} subscribed to ${patterns.join(', ')}`);
  }

  /**
   * Unsubscribe from event patterns
   *
   * @param {string} clientId - Client identifier
   */
  unsubscribe(clientId) {
    this.subscriptions.delete(clientId);
    this.stats.subscriptionsActive = this.subscriptions.size;

    console.log(`[EventBroadcaster] Client ${clientId} unsubscribed`);
  }

  /**
   * Create event object
   * @private
   */
  _createEvent(type, data, options) {
    const eventId = options.eventId || this._generateEventId();

    return {
      id: eventId,
      type,
      data,
      timestamp: new Date().toISOString(),
      ttl: options.ttl !== undefined ? options.ttl : this.defaultTTL,
      path: [this.instanceId], // Track propagation path
      origin: this.instanceId,
      metadata: options.metadata || {}
    };
  }

  /**
   * Track event to prevent echo loops
   * @private
   */
  _trackEvent(event) {
    this.seenEvents.set(event.id, {
      timestamp: Date.now(),
      ttl: event.ttl,
      path: event.path,
      type: event.type
    });
  }

  /**
   * Check if event is an echo (already seen)
   * @private
   */
  _isEcho(event) {
    return this.seenEvents.has(event.id);
  }

  /**
   * Propagate to local EventEmitter subscribers
   * @private
   */
  _propagateToLocal(event) {
    // Emit to pattern-based listeners
    this.emit(event.type, event);

    // Emit wildcard
    this.emit('*', event);

    // Emit specific patterns (e.g., 'price.*' matches 'price.update')
    const typeParts = event.type.split('.');
    for (let i = 1; i <= typeParts.length; i++) {
      const pattern = typeParts.slice(0, i).join('.') + '.*';
      this.emit(pattern, event);
    }
  }

  /**
   * Propagate to WebSocket clients (with subscription filtering)
   * @private
   */
  _propagateToWebSocket(event) {
    if (!this.wss) return;

    let clientCount = 0;

    this.wss.clients.forEach((client) => {
      if (client.readyState !== 1) return; // 1 = OPEN

      // Get client subscriptions
      const clientId = client.clientId || 'unknown';
      const patterns = this.subscriptions.get(clientId);

      // If no subscriptions, send all events
      if (!patterns || patterns.length === 0) {
        client.send(JSON.stringify({
          type: 'event',
          event
        }));
        clientCount++;
        return;
      }

      // Check if event matches any subscription pattern
      for (const pattern of patterns) {
        if (this._matchesPattern(event.type, pattern)) {
          client.send(JSON.stringify({
            type: 'event',
            event
          }));
          clientCount++;
          break;
        }
      }
    });

    if (clientCount > 0) {
      console.log(`[EventBroadcaster] Sent ${event.type} to ${clientCount} WebSocket clients`);
    }
  }

  /**
   * Propagate to other instances (via HTTP/WebSocket/ActivityPub)
   * @private
   */
  _propagateToInstances(event) {
    // TODO: Implement instance-to-instance propagation
    // This could use:
    // - HTTP POST to known instances
    // - WebSocket connections to peer instances
    // - ActivityPub federation
    // - Redis pub/sub
    // - RabbitMQ/Kafka

    // For now, this is a placeholder
    // The wave propagation architecture is in place for when we add peer connections
  }

  /**
   * Store event in database shard (for persistence/history)
   * @private
   */
  async _storeEvent(event) {
    if (!this.shardManager) return;

    try {
      // Use event type as shard key for related events to be on same shard
      await this.shardManager.query(event.type, `
        INSERT INTO event_log (
          event_id,
          event_type,
          event_data,
          timestamp,
          ttl,
          propagation_path,
          origin_instance,
          recorded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        event.id,
        event.type,
        JSON.stringify(event.data),
        event.timestamp,
        event.ttl,
        JSON.stringify(event.path),
        event.origin,
        new Date()
      ]);
    } catch (error) {
      // Don't fail broadcast if storage fails
      if (!error.message.includes('does not exist')) {
        console.error('[EventBroadcaster] Error storing event:', error.message);
      }
    }
  }

  /**
   * Check if event type matches subscription pattern
   * @private
   */
  _matchesPattern(eventType, pattern) {
    // Exact match
    if (eventType === pattern) return true;

    // Wildcard match
    if (pattern === '*') return true;

    // Pattern match (e.g., 'price.*' matches 'price.update')
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix + '.');
    }

    return false;
  }

  /**
   * Clean up old events from memory
   * @private
   */
  _cleanupOldEvents() {
    const now = Date.now();
    let cleaned = 0;

    for (const [eventId, eventInfo] of this.seenEvents.entries()) {
      if (now - eventInfo.timestamp > this.maxEventAge) {
        this.seenEvents.delete(eventId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[EventBroadcaster] Cleaned up ${cleaned} old events`);
    }
  }

  /**
   * Start automatic event cleanup
   * @private
   */
  _startEventCleanup() {
    this.cleanupTimer = setInterval(() => {
      this._cleanupOldEvents();
    }, this.eventCleanupInterval);

    console.log(`[EventBroadcaster] Event cleanup started (interval: ${this.eventCleanupInterval}ms)`);
  }

  /**
   * Stop event cleanup
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('[EventBroadcaster] Event cleanup stopped');
    }
  }

  /**
   * Generate unique event ID
   * @private
   */
  _generateEventId() {
    return `${this.instanceId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Generate unique instance ID
   * @private
   */
  _generateInstanceId() {
    return `instance_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      instanceId: this.instanceId,
      seenEventsCount: this.seenEvents.size,
      maxEventAge: this.maxEventAge,
      defaultTTL: this.defaultTTL
    };
  }

  /**
   * Get event propagation trace
   *
   * @param {string} eventId - Event ID to trace
   * @returns {Object|null} Event trace info
   */
  getEventTrace(eventId) {
    return this.seenEvents.get(eventId) || null;
  }

  /**
   * Clear all tracked events
   */
  clearTracking() {
    const count = this.seenEvents.size;
    this.seenEvents.clear();
    console.log(`[EventBroadcaster] Cleared ${count} tracked events`);
    return count;
  }
}

module.exports = EventBroadcaster;
