/**
 * Idea State Manager
 *
 * "component or effect or state where we can see the growth and potential of ideas"
 *
 * React-style state management for IDEAS, not UI.
 *
 * Like React's useState/useEffect but for:
 * - Idea growth (state changes over time)
 * - Inflection points (effects trigger on events)
 * - Real-time updates (components react to changes)
 * - Observable patterns (subscribe to idea momentum)
 *
 * Concepts:
 * - State: Current growth metrics
 * - Effects: Triggered on inflection points
 * - Components: React to state changes
 * - Reducers: Update state based on actions
 *
 * Use Cases:
 * - Track idea state: "Is this growing?"
 * - React to changes: "Idea just took off! → Notify creator"
 * - Observe patterns: "What ideas are trending?"
 * - Predict futures: "Will this be big?"
 */

const EventEmitter = require('events');
const { Pool } = require('pg');
const IdeaGrowthTracker = require('./idea-growth-tracker');

class IdeaStateManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.pool = config.pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });

    this.growthTracker = config.growthTracker || new IdeaGrowthTracker(config);

    // State store (in-memory cache)
    this.states = new Map(); // ideaId → currentState

    // Subscribers (components that react to state changes)
    this.subscribers = new Map(); // ideaId → Set<callback>

    // Effects (functions that run on state changes)
    this.effects = new Map(); // effectName → callback

    console.log('[IdeaStateManager] Initialized');
  }

  /**
   * Initialize state for an idea
   *
   * Like React's useState() but for an idea's growth metrics
   *
   * @param {string} ideaId
   * @returns {Object} Initial state
   */
  async initializeState(ideaId) {
    try {
      // Load from database if exists
      const existingState = await this.growthTracker.getGrowthState(ideaId);

      if (existingState) {
        const state = {
          ideaId,
          growth: existingState.growth_state,
          inflection: existingState.inflection,
          updatedAt: existingState.updated_at,
          initialized: true
        };

        this.states.set(ideaId, state);
        return state;
      }

      // Initialize with zero state
      const zeroState = {
        ideaId,
        growth: {
          velocity: { current: 0, shortTerm: 0, mediumTerm: 0, longTerm: 0 },
          acceleration: { current: 0, shortTerm: 0 },
          momentum: 0,
          potential: 0,
          stage: { type: 'DORMANT', emoji: '💤', description: 'No activity yet' },
          uniqueUsers: 0,
          totalActivities: 0,
          lastActivity: null
        },
        inflection: { isInflection: false, type: null },
        updatedAt: new Date(),
        initialized: true
      };

      this.states.set(ideaId, zeroState);
      return zeroState;
    } catch (error) {
      console.error('[IdeaStateManager] Error initializing state:', error);
      throw error;
    }
  }

  /**
   * Get current state
   *
   * Like reading state: const [state, setState] = useState()
   *
   * @param {string} ideaId
   * @returns {Object} Current state
   */
  async getState(ideaId) {
    if (this.states.has(ideaId)) {
      return this.states.get(ideaId);
    }

    return await this.initializeState(ideaId);
  }

  /**
   * Update state
   *
   * Like setState() in React
   *
   * @param {string} ideaId
   * @param {string} activityType - What happened
   * @param {Object} metadata - Additional context
   * @returns {Object} New state
   */
  async updateState(ideaId, activityType, metadata = {}) {
    try {
      // Get current state
      const currentState = await this.getState(ideaId);

      // Track activity (calculates new growth metrics)
      const update = await this.growthTracker.trackActivity(ideaId, activityType, metadata);

      // New state
      const newState = {
        ideaId,
        growth: update.growth,
        inflection: update.inflection,
        updatedAt: new Date(),
        initialized: true
      };

      // Store new state
      this.states.set(ideaId, newState);

      // Trigger effects
      await this.triggerEffects(ideaId, currentState, newState);

      // Notify subscribers (components that are watching this idea)
      this.notifySubscribers(ideaId, newState);

      // Emit event
      this.emit('stateChange', {
        ideaId,
        oldState: currentState,
        newState,
        activityType,
        metadata
      });

      return newState;
    } catch (error) {
      console.error('[IdeaStateManager] Error updating state:', error);
      throw error;
    }
  }

  /**
   * Subscribe to state changes
   *
   * Like useEffect(() => {}, [dependency]) in React
   *
   * Components can "watch" an idea and react to changes
   *
   * @param {string} ideaId - Idea to watch
   * @param {Function} callback - Called when state changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(ideaId, callback) {
    if (!this.subscribers.has(ideaId)) {
      this.subscribers.set(ideaId, new Set());
    }

    this.subscribers.get(ideaId).add(callback);

    console.log(`[IdeaStateManager] Subscribed to ${ideaId}`);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(ideaId)?.delete(callback);
      console.log(`[IdeaStateManager] Unsubscribed from ${ideaId}`);
    };
  }

  /**
   * Notify subscribers of state change
   * @private
   */
  notifySubscribers(ideaId, newState) {
    const subscribers = this.subscribers.get(ideaId);

    if (!subscribers || subscribers.size === 0) {
      return;
    }

    subscribers.forEach(callback => {
      try {
        callback(newState);
      } catch (error) {
        console.error('[IdeaStateManager] Subscriber callback error:', error);
      }
    });
  }

  /**
   * Register effect
   *
   * Like useEffect() in React, but for idea growth events
   *
   * Effects run when:
   * - Inflection points detected
   * - Thresholds crossed
   * - Patterns matched
   *
   * Example effects:
   * - "Idea takes off → Notify creator"
   * - "Potential > 70 → Migrate to our DB"
   * - "Peak detected → Surface in trending"
   *
   * @param {string} effectName - Unique name
   * @param {Function} callback - Effect function (oldState, newState) => {}
   */
  registerEffect(effectName, callback) {
    this.effects.set(effectName, callback);
    console.log(`[IdeaStateManager] Registered effect: ${effectName}`);
  }

  /**
   * Trigger effects
   * @private
   */
  async triggerEffects(ideaId, oldState, newState) {
    for (const [effectName, callback] of this.effects.entries()) {
      try {
        await callback(ideaId, oldState, newState);
      } catch (error) {
        console.error(`[IdeaStateManager] Effect error (${effectName}):`, error);
      }
    }
  }

  /**
   * Built-in effects
   */
  setupDefaultEffects() {
    // Effect: Notify on takeoff
    this.registerEffect('notifyTakeoff', async (ideaId, oldState, newState) => {
      if (newState.inflection.type === 'TAKEOFF') {
        this.emit('ideaTakeoff', {
          ideaId,
          growth: newState.growth,
          message: newState.inflection.message
        });

        console.log(`🚀 [Effect:Takeoff] Idea ${ideaId} is taking off!`);
      }
    });

    // Effect: Migrate high-potential ideas
    this.registerEffect('migrateHighPotential', async (ideaId, oldState, newState) => {
      const oldPotential = oldState.growth?.potential || 0;
      const newPotential = newState.growth.potential;

      // Crossed threshold?
      if (oldPotential < 70 && newPotential >= 70) {
        this.emit('highPotential', {
          ideaId,
          potential: newPotential,
          threshold: 70
        });

        console.log(`📈 [Effect:HighPotential] Idea ${ideaId} potential: ${newPotential}`);
      }
    });

    // Effect: Alert on peak
    this.registerEffect('alertPeak', async (ideaId, oldState, newState) => {
      if (newState.inflection.type === 'PEAK') {
        this.emit('ideaPeak', {
          ideaId,
          growth: newState.growth,
          message: newState.inflection.message
        });

        console.log(`📊 [Effect:Peak] Idea ${ideaId} reached peak`);
      }
    });

    // Effect: Track declining ideas
    this.registerEffect('trackDecline', async (ideaId, oldState, newState) => {
      if (newState.growth.stage.type === 'DECLINING') {
        this.emit('ideaDecline', {
          ideaId,
          growth: newState.growth
        });

        console.log(`📉 [Effect:Decline] Idea ${ideaId} losing momentum`);
      }
    });

    console.log('[IdeaStateManager] Default effects registered');
  }

  /**
   * Reducer pattern (for complex state updates)
   *
   * Like Redux reducers: (state, action) => newState
   *
   * @param {string} ideaId
   * @param {string} actionType
   * @param {Object} payload
   * @returns {Object} New state
   */
  async dispatch(ideaId, actionType, payload = {}) {
    const currentState = await this.getState(ideaId);

    // Reducer logic
    let newState;

    switch (actionType) {
      case 'ACTIVITY':
        newState = await this.updateState(ideaId, payload.activityType, payload.metadata);
        break;

      case 'RESET':
        newState = await this.initializeState(ideaId);
        break;

      case 'SET_POTENTIAL':
        newState = {
          ...currentState,
          growth: {
            ...currentState.growth,
            potential: payload.potential
          },
          updatedAt: new Date()
        };
        this.states.set(ideaId, newState);
        break;

      default:
        console.warn(`[IdeaStateManager] Unknown action: ${actionType}`);
        return currentState;
    }

    return newState;
  }

  /**
   * Get observable stream
   *
   * Like RxJS observables - continuous stream of state updates
   *
   * @param {string} ideaId
   * @returns {Object} Observable-like object
   */
  observe(ideaId) {
    const observable = {
      subscribe: (callback) => this.subscribe(ideaId, callback),

      // Get current value
      getValue: () => this.getState(ideaId),

      // Map/transform
      map: (fn) => {
        const mapped = {
          subscribe: (callback) => this.subscribe(ideaId, (state) => {
            callback(fn(state));
          })
        };
        return mapped;
      },

      // Filter
      filter: (predicate) => {
        const filtered = {
          subscribe: (callback) => this.subscribe(ideaId, (state) => {
            if (predicate(state)) {
              callback(state);
            }
          })
        };
        return filtered;
      }
    };

    return observable;
  }

  /**
   * Batch update (update multiple ideas)
   */
  async batchUpdate(updates) {
    const results = [];

    for (const { ideaId, activityType, metadata } of updates) {
      const newState = await this.updateState(ideaId, activityType, metadata);
      results.push(newState);
    }

    return results;
  }

  /**
   * Get all states
   */
  getAllStates() {
    return Array.from(this.states.entries()).map(([ideaId, state]) => ({
      ideaId,
      ...state
    }));
  }

  /**
   * Get high-momentum ideas
   */
  getHighMomentumIdeas(threshold = 50) {
    return this.getAllStates()
      .filter(state => state.growth?.momentum >= threshold)
      .sort((a, b) => b.growth.momentum - a.growth.momentum);
  }

  /**
   * Get trending ideas
   */
  getTrendingIdeas(limit = 10) {
    return this.getAllStates()
      .filter(state => state.growth?.stage?.type === 'ACCELERATING')
      .sort((a, b) => b.growth.potential - a.growth.potential)
      .slice(0, limit);
  }
}

module.exports = IdeaStateManager;
