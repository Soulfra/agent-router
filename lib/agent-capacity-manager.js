/**
 * Agent Capacity Manager
 *
 * Manages real-time availability and workload for fractional executive agents.
 * Prevents over-allocation and handles priority scheduling across multiple employers.
 *
 * Features:
 * - Real-time capacity tracking
 * - Calendar/scheduling integration
 * - Workload balancing across employers
 * - Auto-decline when at capacity
 * - Priority queuing (primary employer > side projects)
 * - Time block allocation
 * - Conflict detection
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class AgentCapacityManager extends EventEmitter {
  constructor({ db = null, employmentTracker = null, executiveRegistry = null }) {
    super();

    this.db = db;
    this.employmentTracker = employmentTracker;
    this.executiveRegistry = executiveRegistry;

    // Active work sessions
    // Map: sessionId -> session
    this.workSessions = new Map();

    // Time blocks (scheduled time allocations)
    // Map: blockId -> time block
    this.timeBlocks = new Map();

    // Pending work requests
    // Map: requestId -> request
    this.pendingRequests = new Map();

    // Capacity thresholds
    this.thresholds = {
      warningLevel: 80, // warn when agent reaches 80% capacity
      criticalLevel: 95, // critical when agent reaches 95% capacity
      maxConcurrentSessions: 3 // max number of active work sessions
    };

    console.log('[AgentCapacityManager] Initialized');
  }

  /**
   * Start a work session
   */
  async startWorkSession({
    agentId,
    companyId,
    employmentId,
    estimatedHours,
    taskDescription = '',
    priority = 'normal', // high, normal, low
    metadata = {}
  }) {
    // Check if agent has capacity
    const capacityCheck = await this.checkCapacity(agentId, estimatedHours);
    if (!capacityCheck.hasCapacity) {
      throw new Error(`Agent at capacity: ${capacityCheck.reason}`);
    }

    // Check concurrent sessions limit
    const activeSessions = this.getActiveSessionsForAgent(agentId);
    if (activeSessions.length >= this.thresholds.maxConcurrentSessions) {
      throw new Error(`Agent has too many concurrent sessions (${activeSessions.length}/${this.thresholds.maxConcurrentSessions})`);
    }

    const sessionId = crypto.randomUUID();

    const session = {
      sessionId,
      agentId,
      companyId,
      employmentId,
      estimatedHours,
      actualHours: 0,
      taskDescription,
      priority,
      status: 'active',
      startedAt: new Date(),
      endedAt: null,
      metadata
    };

    this.workSessions.set(sessionId, session);

    // Store in database
    if (this.db) {
      await this.db.query(
        `INSERT INTO agent_work_sessions (
          session_id, agent_id, company_id, employment_id,
          estimated_hours, actual_hours, task_description, priority,
          status, started_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)`,
        [
          sessionId,
          agentId,
          companyId,
          employmentId,
          estimatedHours,
          0,
          taskDescription,
          priority,
          'active',
          JSON.stringify(metadata)
        ]
      );
    }

    console.log(`[AgentCapacityManager] Started work session: ${agentId} for ${companyId} (${estimatedHours}h)`);

    this.emit('session_started', session);

    return session;
  }

  /**
   * End a work session
   */
  async endWorkSession(sessionId, actualHours) {
    const session = this.workSessions.get(sessionId);
    if (!session) {
      throw new Error(`Work session not found: ${sessionId}`);
    }

    session.status = 'completed';
    session.actualHours = actualHours;
    session.endedAt = new Date();

    if (this.db) {
      await this.db.query(
        `UPDATE agent_work_sessions
         SET status = 'completed', actual_hours = $1, ended_at = NOW()
         WHERE session_id = $2`,
        [actualHours, sessionId]
      );
    }

    // Record activity in executive registry
    if (this.executiveRegistry) {
      await this.executiveRegistry.recordActivity({
        agentId: session.agentId,
        activityType: 'hours_worked',
        metadata: { hours: actualHours, companyId: session.companyId }
      });

      if (session.metadata.projectCompleted) {
        await this.executiveRegistry.recordActivity({
          agentId: session.agentId,
          activityType: 'project_completed',
          metadata: { companyId: session.companyId }
        });
      }
    }

    console.log(`[AgentCapacityManager] Ended work session: ${sessionId} (${actualHours}h actual vs ${session.estimatedHours}h estimated)`);

    this.emit('session_ended', session);

    return session;
  }

  /**
   * Check if agent has capacity for new work
   */
  async checkCapacity(agentId, estimatedHours) {
    // Get agent's current allocation
    const allocation = this.employmentTracker ? this.employmentTracker.getTotalAllocation(agentId) : 0;

    // Agent must have some availability
    if (allocation >= 100) {
      return {
        hasCapacity: false,
        reason: 'Agent fully allocated (100%)',
        currentAllocation: allocation
      };
    }

    // Check active sessions
    const activeSessions = this.getActiveSessionsForAgent(agentId);
    const totalActiveHours = activeSessions.reduce((sum, s) => sum + s.estimatedHours, 0);

    // Warn if approaching limits
    const weeklyCapacity = this.calculateWeeklyCapacity(allocation);
    const remainingCapacity = weeklyCapacity - totalActiveHours;

    if (estimatedHours > remainingCapacity) {
      return {
        hasCapacity: false,
        reason: `Insufficient capacity: ${estimatedHours}h requested, ${remainingCapacity.toFixed(1)}h available`,
        currentAllocation: allocation,
        weeklyCapacity,
        remainingCapacity
      };
    }

    // Check threshold warnings
    const utilizationPercentage = ((totalActiveHours + estimatedHours) / weeklyCapacity) * 100;
    let warning = null;

    if (utilizationPercentage >= this.thresholds.criticalLevel) {
      warning = 'CRITICAL: Agent approaching maximum capacity';
    } else if (utilizationPercentage >= this.thresholds.warningLevel) {
      warning = 'WARNING: Agent capacity above 80%';
    }

    return {
      hasCapacity: true,
      currentAllocation: allocation,
      weeklyCapacity,
      remainingCapacity,
      utilizationPercentage,
      warning
    };
  }

  /**
   * Calculate weekly capacity based on allocation percentage
   *
   * Example: 50% allocation = 20 hours/week (assuming 40-hour work week)
   */
  calculateWeeklyCapacity(allocationPercentage) {
    const STANDARD_WORK_WEEK = 40; // hours
    return (allocationPercentage / 100) * STANDARD_WORK_WEEK;
  }

  /**
   * Get active sessions for an agent
   */
  getActiveSessionsForAgent(agentId) {
    const sessions = [];

    for (const session of this.workSessions.values()) {
      if (session.agentId === agentId && session.status === 'active') {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Schedule a time block
   *
   * Allocates specific time window for an employer
   */
  async scheduleTimeBlock({
    agentId,
    companyId,
    employmentId,
    startTime,
    endTime,
    recurrence = null, // 'daily', 'weekly', 'biweekly', 'monthly'
    purpose = '',
    metadata = {}
  }) {
    // Validate times
    if (startTime >= endTime) {
      throw new Error('Start time must be before end time');
    }

    // Check for conflicts
    const conflicts = this.findSchedulingConflicts(agentId, startTime, endTime);
    if (conflicts.length > 0) {
      throw new Error(`Scheduling conflict: overlaps with ${conflicts.length} existing blocks`);
    }

    const blockId = crypto.randomUUID();
    const durationHours = (endTime - startTime) / (1000 * 60 * 60);

    const block = {
      blockId,
      agentId,
      companyId,
      employmentId,
      startTime,
      endTime,
      durationHours,
      recurrence,
      purpose,
      status: 'scheduled',
      createdAt: new Date(),
      metadata
    };

    this.timeBlocks.set(blockId, block);

    if (this.db) {
      await this.db.query(
        `INSERT INTO agent_time_blocks (
          block_id, agent_id, company_id, employment_id,
          start_time, end_time, duration_hours, recurrence,
          purpose, status, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)`,
        [
          blockId,
          agentId,
          companyId,
          employmentId,
          startTime,
          endTime,
          durationHours,
          recurrence,
          purpose,
          'scheduled',
          JSON.stringify(metadata)
        ]
      );
    }

    console.log(`[AgentCapacityManager] Scheduled time block: ${agentId} for ${companyId} (${durationHours}h)`);

    this.emit('time_block_scheduled', block);

    return block;
  }

  /**
   * Find scheduling conflicts
   */
  findSchedulingConflicts(agentId, startTime, endTime) {
    const conflicts = [];

    for (const block of this.timeBlocks.values()) {
      if (block.agentId !== agentId) continue;
      if (block.status === 'cancelled') continue;

      // Check for overlap
      const overlaps = (
        (startTime >= block.startTime && startTime < block.endTime) ||
        (endTime > block.startTime && endTime <= block.endTime) ||
        (startTime <= block.startTime && endTime >= block.endTime)
      );

      if (overlaps) {
        conflicts.push(block);
      }
    }

    return conflicts;
  }

  /**
   * Create work request (for approval/queuing)
   */
  async createWorkRequest({
    agentId,
    companyId,
    employmentId,
    estimatedHours,
    taskDescription,
    requestedBy,
    priority = 'normal',
    deadline = null,
    metadata = {}
  }) {
    const requestId = crypto.randomUUID();

    // Determine priority tier based on employment
    let effectivePriority = priority;
    if (this.employmentTracker) {
      const employment = this.employmentTracker.employments.get(employmentId);
      if (employment && employment.tier === 'primary') {
        effectivePriority = 'high'; // Primary employers get automatic high priority
      }
    }

    const request = {
      requestId,
      agentId,
      companyId,
      employmentId,
      estimatedHours,
      taskDescription,
      requestedBy,
      priority: effectivePriority,
      deadline,
      status: 'pending', // pending, approved, declined, fulfilled
      createdAt: new Date(),
      metadata
    };

    this.pendingRequests.set(requestId, request);

    if (this.db) {
      await this.db.query(
        `INSERT INTO agent_work_requests (
          request_id, agent_id, company_id, employment_id,
          estimated_hours, task_description, requested_by,
          priority, deadline, status, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)`,
        [
          requestId,
          agentId,
          companyId,
          employmentId,
          estimatedHours,
          taskDescription,
          requestedBy,
          effectivePriority,
          deadline,
          'pending',
          JSON.stringify(metadata)
        ]
      );
    }

    console.log(`[AgentCapacityManager] Created work request: ${requestId} (priority: ${effectivePriority})`);

    this.emit('work_request_created', request);

    return request;
  }

  /**
   * Approve work request
   */
  async approveWorkRequest(requestId) {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error(`Work request not found: ${requestId}`);
    }

    request.status = 'approved';

    if (this.db) {
      await this.db.query(
        `UPDATE agent_work_requests SET status = 'approved' WHERE request_id = $1`,
        [requestId]
      );
    }

    console.log(`[AgentCapacityManager] Approved work request: ${requestId}`);

    this.emit('work_request_approved', request);

    return request;
  }

  /**
   * Decline work request
   */
  async declineWorkRequest(requestId, reason = '') {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error(`Work request not found: ${requestId}`);
    }

    request.status = 'declined';
    request.declineReason = reason;

    if (this.db) {
      await this.db.query(
        `UPDATE agent_work_requests SET status = 'declined', metadata = metadata || $2::jsonb WHERE request_id = $1`,
        [requestId, JSON.stringify({ declineReason: reason })]
      );
    }

    console.log(`[AgentCapacityManager] Declined work request: ${requestId} - ${reason}`);

    this.emit('work_request_declined', { requestId, reason });

    return request;
  }

  /**
   * Get prioritized work queue for agent
   */
  getPrioritizedWorkQueue(agentId) {
    const requests = [];

    for (const request of this.pendingRequests.values()) {
      if (request.agentId === agentId && request.status === 'pending') {
        requests.push(request);
      }
    }

    // Sort by priority (high > normal > low) and deadline
    const priorityOrder = { high: 1, normal: 2, low: 3 };
    requests.sort((a, b) => {
      // First by priority
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }

      // Then by deadline (if exists)
      if (a.deadline && b.deadline) {
        return a.deadline - b.deadline;
      }
      if (a.deadline) return -1;
      if (b.deadline) return 1;

      // Finally by creation time
      return a.createdAt - b.createdAt;
    });

    return requests;
  }

  /**
   * Get capacity report for agent
   */
  getCapacityReport(agentId) {
    const allocation = this.employmentTracker ? this.employmentTracker.getTotalAllocation(agentId) : 0;
    const weeklyCapacity = this.calculateWeeklyCapacity(allocation);
    const activeSessions = this.getActiveSessionsForAgent(agentId);
    const totalActiveHours = activeSessions.reduce((sum, s) => sum + s.estimatedHours, 0);
    const pendingRequests = this.getPrioritizedWorkQueue(agentId);

    return {
      agentId,
      allocation: {
        percentage: allocation,
        weeklyHours: weeklyCapacity
      },
      current: {
        activeSessions: activeSessions.length,
        totalHours: totalActiveHours,
        utilizationPercentage: (totalActiveHours / weeklyCapacity) * 100
      },
      available: {
        weeklyHours: weeklyCapacity - totalActiveHours,
        percentage: ((weeklyCapacity - totalActiveHours) / weeklyCapacity) * 100
      },
      pending: {
        requestCount: pendingRequests.length,
        totalHours: pendingRequests.reduce((sum, r) => sum + r.estimatedHours, 0)
      },
      status: this.getCapacityStatus(agentId, totalActiveHours, weeklyCapacity)
    };
  }

  /**
   * Get capacity status (available, busy, critical)
   */
  getCapacityStatus(agentId, currentHours, weeklyCapacity) {
    const utilization = (currentHours / weeklyCapacity) * 100;

    if (utilization >= this.thresholds.criticalLevel) {
      return 'critical';
    } else if (utilization >= this.thresholds.warningLevel) {
      return 'busy';
    } else {
      return 'available';
    }
  }

  /**
   * Get stats
   */
  getStats() {
    const stats = {
      totalWorkSessions: this.workSessions.size,
      activeSessions: 0,
      completedSessions: 0,
      totalTimeBlocks: this.timeBlocks.size,
      scheduledBlocks: 0,
      pendingRequests: 0,
      approvedRequests: 0
    };

    for (const session of this.workSessions.values()) {
      if (session.status === 'active') stats.activeSessions++;
      if (session.status === 'completed') stats.completedSessions++;
    }

    for (const block of this.timeBlocks.values()) {
      if (block.status === 'scheduled') stats.scheduledBlocks++;
    }

    for (const request of this.pendingRequests.values()) {
      if (request.status === 'pending') stats.pendingRequests++;
      if (request.status === 'approved') stats.approvedRequests++;
    }

    return stats;
  }
}

module.exports = AgentCapacityManager;
