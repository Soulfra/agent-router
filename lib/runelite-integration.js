/**
 * RuneLite Integration
 *
 * Connects to RuneLite HTTP API to capture real-time game events.
 * Monitors player actions, XP gains, loot, deaths, and other significant moments.
 *
 * What It Does:
 * - Listen for game events (XP drops, loot, level-ups, deaths)
 * - Track player stats, inventory, equipment, location
 * - Detect clipworthy moments (rare drops, boss kills, achievements)
 * - Provide data for stream overlays and AI research
 *
 * RuneLite HTTP API:
 * - Default: http://localhost:8080
 * - Endpoints: /status, /player, /inventory, /events
 * - WebSocket: ws://localhost:8080/events
 *
 * Event Types:
 * - XP_GAINED: Player gains XP in a skill
 * - LOOT_RECEIVED: Player receives loot (drops, rewards)
 * - LEVEL_UP: Player levels up a skill
 * - PLAYER_DEATH: Player dies
 * - NPC_KILLED: Player kills an NPC
 * - QUEST_COMPLETED: Player completes a quest
 * - ACHIEVEMENT_EARNED: Achievement diary task completed
 * - REGION_CHANGED: Player moves to new area
 *
 * Use Cases:
 * - Stream overlay: "73 Agility! 💪" appears when you level up
 * - Auto-clip: Twisted bow drop triggers clip bounty
 * - AI research: "Just killed Zulrah" → wiki lookup appears
 * - Timeline: Track your entire session for blog post
 *
 * Integrates with:
 * - OSRSWikiClient (lib/osrs-wiki-client.js) - Item/NPC lookups
 * - OSRSEventNarrator (lib/osrs-event-narrator.js) - Events → text
 * - TimelineContentAggregator (lib/timeline-content-aggregator.js) - Session tracking
 * - ClipBountyManager (lib/clip-bounty-manager.js) - Auto-clip rare drops
 *
 * Usage:
 *   const runelite = new RuneLiteIntegration({
 *     apiUrl: 'http://localhost:8080',
 *     wikiClient
 *   });
 *
 *   await runelite.connect();
 *
 *   runelite.on('xp_gained', (event) => {
 *     console.log(`+${event.xpGained} ${event.skill} XP`);
 *   });
 *
 *   runelite.on('loot_received', (event) => {
 *     console.log(`Loot: ${event.itemName} x${event.quantity}`);
 *   });
 */

const { EventEmitter } = require('events');
const fetch = require('node-fetch');
const WebSocket = require('ws');

class RuneLiteIntegration extends EventEmitter {
  constructor(options = {}) {
    super();

    this.apiUrl = options.apiUrl || 'http://localhost:8080';
    this.wsUrl = options.wsUrl || 'ws://localhost:8080/events';
    this.wikiClient = options.wikiClient;
    this.pollInterval = options.pollInterval || 5000; // 5 seconds

    // Connection state
    this.connected = false;
    this.ws = null;
    this.pollTimer = null;

    // Player state
    this.player = {
      username: null,
      combatLevel: null,
      skills: {},
      location: null,
      world: null
    };

    // Session tracking
    this.session = {
      startTime: null,
      events: [],
      totalXP: 0,
      lootValue: 0,
      deaths: 0,
      killCount: {}
    };

    // Clipworthy detection
    this.clipworthyThresholds = {
      lootValue: 1000000, // 1M GP = clipworthy
      rareDrops: ['Twisted bow', 'Scythe of vitur', 'Dragon warhammer', 'Primordial crystal'],
      bosses: ['Zulrah', 'Vorkath', 'Theatre of Blood', 'Chambers of Xeric']
    };

    // Event tracking
    this.stats = {
      totalEvents: 0,
      eventsByType: {},
      clipworthyEvents: 0,
      lastEventTime: null
    };

    console.log('[RuneLiteIntegration] Initialized');
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Connect to RuneLite HTTP API and WebSocket
   */
  async connect() {
    console.log('[RuneLiteIntegration] Connecting to RuneLite...');

    try {
      // Check if RuneLite HTTP API is available
      const status = await this._checkStatus();
      if (!status) {
        throw new Error('RuneLite HTTP API not responding');
      }

      console.log('[RuneLiteIntegration] HTTP API connected');

      // Connect WebSocket for real-time events
      await this._connectWebSocket();

      // Start polling for state updates
      this._startPolling();

      this.connected = true;
      this.session.startTime = Date.now();

      this.emit('connected', {
        player: this.player,
        timestamp: Date.now()
      });

      console.log('[RuneLiteIntegration] Connected successfully');

    } catch (error) {
      console.error('[RuneLiteIntegration] Connection error:', error.message);
      throw error;
    }
  }

  /**
   * Disconnect from RuneLite
   */
  disconnect() {
    console.log('[RuneLiteIntegration] Disconnecting...');

    this.connected = false;

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Stop polling
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.emit('disconnected', {
      sessionDuration: Date.now() - this.session.startTime,
      totalEvents: this.stats.totalEvents,
      timestamp: Date.now()
    });

    console.log('[RuneLiteIntegration] Disconnected');
  }

  /**
   * Check RuneLite HTTP API status
   */
  async _checkStatus() {
    try {
      const response = await fetch(`${this.apiUrl}/status`, {
        timeout: 5000
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.status === 'ok';

    } catch (error) {
      return false;
    }
  }

  /**
   * Connect to RuneLite WebSocket
   */
  async _connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          console.log('[RuneLiteIntegration] WebSocket connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          this._handleWebSocketMessage(data);
        });

        this.ws.on('error', (error) => {
          console.error('[RuneLiteIntegration] WebSocket error:', error.message);
          this.emit('error', { type: 'websocket', error: error.message });
        });

        this.ws.on('close', () => {
          console.log('[RuneLiteIntegration] WebSocket closed');

          // Auto-reconnect if still connected
          if (this.connected) {
            console.log('[RuneLiteIntegration] Attempting to reconnect...');
            setTimeout(() => this._connectWebSocket(), 5000);
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Start polling for player state
   */
  _startPolling() {
    this.pollTimer = setInterval(async () => {
      try {
        await this._updatePlayerState();
      } catch (error) {
        console.error('[RuneLiteIntegration] Poll error:', error.message);
      }
    }, this.pollInterval);
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /**
   * Handle WebSocket message
   */
  _handleWebSocketMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      if (!message.type) {
        return;
      }

      this._processEvent(message);

    } catch (error) {
      console.error('[RuneLiteIntegration] Message parse error:', error.message);
    }
  }

  /**
   * Process game event
   */
  _processEvent(event) {
    this.stats.totalEvents++;
    this.stats.lastEventTime = Date.now();

    // Track by type
    this.stats.eventsByType[event.type] = (this.stats.eventsByType[event.type] || 0) + 1;

    // Add to session
    this.session.events.push({
      ...event,
      timestamp: Date.now()
    });

    // Detect clipworthy moments
    const clipworthy = this._isClipworthy(event);
    if (clipworthy) {
      this.stats.clipworthyEvents++;
      event.clipworthy = true;
    }

    // Emit specific event types
    switch (event.type) {
      case 'XP_GAINED':
        this._handleXPGained(event);
        break;
      case 'LOOT_RECEIVED':
        this._handleLootReceived(event);
        break;
      case 'LEVEL_UP':
        this._handleLevelUp(event);
        break;
      case 'PLAYER_DEATH':
        this._handlePlayerDeath(event);
        break;
      case 'NPC_KILLED':
        this._handleNPCKilled(event);
        break;
      case 'QUEST_COMPLETED':
        this._handleQuestCompleted(event);
        break;
      case 'ACHIEVEMENT_EARNED':
        this._handleAchievementEarned(event);
        break;
      case 'REGION_CHANGED':
        this._handleRegionChanged(event);
        break;
      default:
        console.log(`[RuneLiteIntegration] Unknown event type: ${event.type}`);
    }

    // Emit generic event
    this.emit('event', event);
  }

  /**
   * Handle XP gained event
   */
  _handleXPGained(event) {
    const { skill, xpGained, totalXP, level } = event;

    this.session.totalXP += xpGained;

    // Update player skills
    if (!this.player.skills[skill]) {
      this.player.skills[skill] = { level: 1, xp: 0 };
    }
    this.player.skills[skill].xp = totalXP;
    this.player.skills[skill].level = level;

    this.emit('xp_gained', {
      skill,
      xpGained,
      totalXP,
      level,
      timestamp: Date.now()
    });

    console.log(`[RuneLiteIntegration] XP: +${xpGained} ${skill} (Total: ${totalXP})`);
  }

  /**
   * Handle loot received event
   */
  async _handleLootReceived(event) {
    const { itemId, itemName, quantity, source, value } = event;

    this.session.lootValue += value || 0;

    // Lookup item in wiki if we have a client
    let itemData = null;
    if (this.wikiClient && itemName) {
      try {
        itemData = await this.wikiClient.getItem(itemName);
      } catch (error) {
        console.error('[RuneLiteIntegration] Wiki lookup error:', error.message);
      }
    }

    this.emit('loot_received', {
      itemId,
      itemName,
      quantity,
      source,
      value,
      itemData,
      clipworthy: event.clipworthy,
      timestamp: Date.now()
    });

    console.log(`[RuneLiteIntegration] Loot: ${itemName} x${quantity} (${value} GP)`);
  }

  /**
   * Handle level up event
   */
  _handleLevelUp(event) {
    const { skill, level } = event;

    // Update player skills
    if (!this.player.skills[skill]) {
      this.player.skills[skill] = { level: 1, xp: 0 };
    }
    this.player.skills[skill].level = level;

    this.emit('level_up', {
      skill,
      level,
      clipworthy: true, // Level ups are always clipworthy
      timestamp: Date.now()
    });

    console.log(`[RuneLiteIntegration] Level up! ${skill} ${level}`);
  }

  /**
   * Handle player death event
   */
  _handlePlayerDeath(event) {
    const { cause, location } = event;

    this.session.deaths++;

    this.emit('player_death', {
      cause,
      location,
      deathCount: this.session.deaths,
      timestamp: Date.now()
    });

    console.log(`[RuneLiteIntegration] Death: ${cause} at ${location}`);
  }

  /**
   * Handle NPC killed event
   */
  async _handleNPCKilled(event) {
    const { npcId, npcName } = event;

    // Track kill count
    this.session.killCount[npcName] = (this.session.killCount[npcName] || 0) + 1;

    // Lookup NPC in wiki
    let npcData = null;
    if (this.wikiClient && npcName) {
      try {
        npcData = await this.wikiClient.getMonster(npcName);
      } catch (error) {
        console.error('[RuneLiteIntegration] Wiki lookup error:', error.message);
      }
    }

    this.emit('npc_killed', {
      npcId,
      npcName,
      killCount: this.session.killCount[npcName],
      npcData,
      clipworthy: event.clipworthy,
      timestamp: Date.now()
    });

    console.log(`[RuneLiteIntegration] Killed: ${npcName} (KC: ${this.session.killCount[npcName]})`);
  }

  /**
   * Handle quest completed event
   */
  _handleQuestCompleted(event) {
    const { questName, questPoints } = event;

    this.emit('quest_completed', {
      questName,
      questPoints,
      clipworthy: true, // Quests are always clipworthy
      timestamp: Date.now()
    });

    console.log(`[RuneLiteIntegration] Quest: ${questName} (+${questPoints} QP)`);
  }

  /**
   * Handle achievement earned event
   */
  _handleAchievementEarned(event) {
    const { achievementName, tier } = event;

    this.emit('achievement_earned', {
      achievementName,
      tier,
      clipworthy: true,
      timestamp: Date.now()
    });

    console.log(`[RuneLiteIntegration] Achievement: ${achievementName} (${tier})`);
  }

  /**
   * Handle region changed event
   */
  _handleRegionChanged(event) {
    const { regionName, regionId } = event;

    this.player.location = regionName;

    this.emit('region_changed', {
      regionName,
      regionId,
      timestamp: Date.now()
    });

    console.log(`[RuneLiteIntegration] Location: ${regionName}`);
  }

  // ============================================================================
  // Clipworthy Detection
  // ============================================================================

  /**
   * Determine if event is clipworthy
   */
  _isClipworthy(event) {
    switch (event.type) {
      case 'LEVEL_UP':
        return true; // All level ups are clipworthy

      case 'LOOT_RECEIVED':
        // Rare drops or high-value items
        if (this.clipworthyThresholds.rareDrops.includes(event.itemName)) {
          return true;
        }
        if (event.value >= this.clipworthyThresholds.lootValue) {
          return true;
        }
        return false;

      case 'NPC_KILLED':
        // Boss kills
        return this.clipworthyThresholds.bosses.some(boss =>
          event.npcName.includes(boss)
        );

      case 'QUEST_COMPLETED':
      case 'ACHIEVEMENT_EARNED':
        return true;

      case 'PLAYER_DEATH':
        // Deaths at bosses are clipworthy (funny content)
        return event.location && this.clipworthyThresholds.bosses.some(boss =>
          event.location.includes(boss)
        );

      default:
        return false;
    }
  }

  // ============================================================================
  // Player State Polling
  // ============================================================================

  /**
   * Update player state via HTTP API
   */
  async _updatePlayerState() {
    try {
      const response = await fetch(`${this.apiUrl}/player`);

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      // Update player info
      if (data.username) this.player.username = data.username;
      if (data.combatLevel) this.player.combatLevel = data.combatLevel;
      if (data.world) this.player.world = data.world;
      if (data.location) this.player.location = data.location;

      // Update skills
      if (data.skills) {
        for (const [skill, stats] of Object.entries(data.skills)) {
          this.player.skills[skill] = {
            level: stats.level,
            xp: stats.xp,
            boostedLevel: stats.boostedLevel
          };
        }
      }

    } catch (error) {
      // Silent fail for polling
    }
  }

  // ============================================================================
  // Public Query Methods
  // ============================================================================

  /**
   * Get current player state
   */
  getPlayerState() {
    return {
      ...this.player,
      connected: this.connected,
      sessionDuration: this.session.startTime
        ? Date.now() - this.session.startTime
        : 0
    };
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    return {
      ...this.session,
      duration: this.session.startTime
        ? Date.now() - this.session.startTime
        : 0,
      eventStats: this.stats
    };
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 10) {
    return this.session.events.slice(-limit);
  }

  /**
   * Get clipworthy events
   */
  getClipworthyEvents() {
    return this.session.events.filter(e => e.clipworthy);
  }
}

module.exports = RuneLiteIntegration;
