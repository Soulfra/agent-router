/**
 * Concurrency Control Utilities
 *
 * Provides Semaphore and Mutex implementations for managing
 * concurrent agent executions and preventing overload.
 */

/**
 * Semaphore - Limits concurrent access to a resource
 *
 * Usage:
 *   const sem = new Semaphore(5); // Max 5 concurrent operations
 *   await sem.acquire();
 *   try {
 *     // Do work
 *   } finally {
 *     sem.release();
 *   }
 */
class Semaphore {
  constructor(maxConcurrent = 1) {
    this.maxConcurrent = maxConcurrent;
    this.current = 0;
    this.queue = [];
  }

  /**
   * Acquire a permit (blocks if none available)
   */
  async acquire() {
    if (this.current < this.maxConcurrent) {
      this.current++;
      return Promise.resolve();
    }

    // Wait in queue
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  /**
   * Release a permit
   */
  release() {
    if (this.queue.length > 0) {
      // Wake up next waiting task
      const resolve = this.queue.shift();
      resolve();
    } else {
      this.current--;
    }
  }

  /**
   * Try to acquire without blocking
   * @returns {boolean} - True if acquired, false if busy
   */
  tryAcquire() {
    if (this.current < this.maxConcurrent) {
      this.current++;
      return true;
    }
    return false;
  }

  /**
   * Get current usage stats
   */
  getStats() {
    return {
      current: this.current,
      max: this.maxConcurrent,
      queued: this.queue.length,
      available: this.maxConcurrent - this.current
    };
  }

  /**
   * Execute function with automatic acquire/release
   */
  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

/**
 * Mutex - Mutual exclusion lock (binary semaphore)
 *
 * Usage:
 *   const mutex = new Mutex();
 *   await mutex.lock();
 *   try {
 *     // Critical section
 *   } finally {
 *     mutex.unlock();
 *   }
 */
class Mutex extends Semaphore {
  constructor() {
    super(1);
  }

  async lock() {
    return await this.acquire();
  }

  unlock() {
    return this.release();
  }

  tryLock() {
    return this.tryAcquire();
  }

  async runExclusive(fn) {
    return await this.run(fn);
  }
}

/**
 * Agent Load Balancer
 *
 * Manages semaphores for multiple agents and provides
 * load balancing and overflow handling.
 */
class AgentLoadBalancer {
  constructor() {
    this.semaphores = new Map();
    this.stats = new Map();
  }

  /**
   * Register an agent with concurrency limit
   */
  register(agentId, maxConcurrent) {
    this.semaphores.set(agentId, new Semaphore(maxConcurrent));
    this.stats.set(agentId, {
      totalRequests: 0,
      activeRequests: 0,
      queuedRequests: 0,
      rejectedRequests: 0
    });
  }

  /**
   * Execute task for an agent with concurrency control
   */
  async execute(agentId, taskFn, options = {}) {
    const { timeout = null, onOverload = null } = options;

    const semaphore = this.semaphores.get(agentId);
    if (!semaphore) {
      throw new Error(`Agent ${agentId} not registered`);
    }

    const stats = this.stats.get(agentId);
    stats.totalRequests++;

    // Try to acquire immediately
    if (!semaphore.tryAcquire()) {
      stats.queuedRequests++;

      if (onOverload) {
        // Call overflow handler (e.g., delegate to another agent)
        const result = await onOverload();
        stats.queuedRequests--;
        return result;
      }

      // Wait for slot to become available
      if (timeout) {
        // Acquire with timeout
        await Promise.race([
          semaphore.acquire(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ]).catch(error => {
          stats.queuedRequests--;
          stats.rejectedRequests++;
          throw error;
        });
      } else {
        await semaphore.acquire();
      }

      stats.queuedRequests--;
    }

    stats.activeRequests++;

    try {
      const result = await taskFn();
      return result;
    } finally {
      stats.activeRequests--;
      semaphore.release();
    }
  }

  /**
   * Get agent statistics
   */
  getAgentStats(agentId) {
    const semaphore = this.semaphores.get(agentId);
    const stats = this.stats.get(agentId);

    if (!semaphore || !stats) {
      return null;
    }

    const semStats = semaphore.getStats();

    return {
      agentId,
      current: semStats.current,
      max: semStats.max,
      queued: semStats.queued,
      available: semStats.available,
      totalRequests: stats.totalRequests,
      rejectedRequests: stats.rejectedRequests
    };
  }

  /**
   * Get all agents' statistics
   */
  getAllStats() {
    const allStats = [];
    for (const agentId of this.semaphores.keys()) {
      allStats.push(this.getAgentStats(agentId));
    }
    return allStats;
  }

  /**
   * Get least loaded agent from list
   */
  getLeastLoaded(agentIds) {
    let bestAgent = null;
    let lowestLoad = Infinity;

    for (const agentId of agentIds) {
      const stats = this.getAgentStats(agentId);
      if (!stats) continue;

      const load = stats.current + stats.queued;
      if (load < lowestLoad) {
        lowestLoad = load;
        bestAgent = agentId;
      }
    }

    return bestAgent;
  }

  /**
   * Check if agent is available (has capacity)
   */
  isAvailable(agentId) {
    const stats = this.getAgentStats(agentId);
    return stats && stats.available > 0;
  }
}

/**
 * Rate Limiter - Limits operations per time window
 *
 * Usage:
 *   const limiter = new RateLimiter(10, 1000); // 10 ops per 1000ms
 *   await limiter.acquire();
 *   // Do work
 */
class RateLimiter {
  constructor(maxOps, windowMs) {
    this.maxOps = maxOps;
    this.windowMs = windowMs;
    this.timestamps = [];
  }

  async acquire() {
    const now = Date.now();

    // Remove timestamps outside window
    this.timestamps = this.timestamps.filter(ts => now - ts < this.windowMs);

    if (this.timestamps.length < this.maxOps) {
      this.timestamps.push(now);
      return;
    }

    // Wait until oldest timestamp expires
    const oldestTimestamp = this.timestamps[0];
    const waitTime = this.windowMs - (now - oldestTimestamp);

    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Retry
    return await this.acquire();
  }

  getStats() {
    const now = Date.now();
    const recent = this.timestamps.filter(ts => now - ts < this.windowMs);

    return {
      current: recent.length,
      max: this.maxOps,
      available: this.maxOps - recent.length,
      windowMs: this.windowMs
    };
  }
}

module.exports = {
  Semaphore,
  Mutex,
  AgentLoadBalancer,
  RateLimiter
};
