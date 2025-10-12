/**
 * Heatmap Tracker
 *
 * Tracks user interactions (clicks, hovers, scrolls) and "casts shadows"
 * on a canvas overlay to visualize where users are interacting.
 *
 * Inspired by the user's request: "almost like a duration, or a click, or
 * heatmap where we can cast a shadow idk."
 */

class HeatmapTracker {
  constructor(options = {}) {
    this.deviceId = options.deviceId || null;
    this.sessionId = options.sessionId || null;
    this.page = options.page || 'unknown';
    this.roomName = options.roomName || null;
    this.apiEndpoint = options.apiEndpoint || '/api/lofi/track-heatmap';

    // Tracking settings
    this.trackClicks = options.trackClicks !== false;
    this.trackHovers = options.trackHovers !== false;
    this.trackScrolls = options.trackScrolls !== false;

    // Throttle settings
    this.hoverThrottle = options.hoverThrottle || 500; // ms
    this.scrollThrottle = options.scrollThrottle || 1000; // ms

    // Batch settings
    this.batchSize = options.batchSize || 10;
    this.batchTimeout = options.batchTimeout || 5000; // ms

    // State
    this.eventQueue = [];
    this.lastHoverTime = 0;
    this.lastScrollTime = 0;
    this.batchTimer = null;
    this.isTracking = false;

    // Canvas for visualization
    this.canvas = options.canvas || document.getElementById('heatmap-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.heatmapData = [];

    // Bind methods
    this.handleClick = this.handleClick.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  /**
   * Start tracking
   */
  start() {
    if (this.isTracking) return;

    this.isTracking = true;

    // Set up canvas
    if (this.canvas) {
      this.resizeCanvas();
      window.addEventListener('resize', this.handleResize);
    }

    // Add event listeners
    if (this.trackClicks) {
      document.addEventListener('click', this.handleClick);
    }

    if (this.trackHovers) {
      document.addEventListener('mousemove', this.handleMouseMove);
    }

    if (this.trackScrolls) {
      window.addEventListener('scroll', this.handleScroll);
    }

    console.log('🎯 Heatmap tracking started');
  }

  /**
   * Stop tracking
   */
  stop() {
    if (!this.isTracking) return;

    this.isTracking = false;

    // Remove event listeners
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleResize);

    // Flush remaining events
    this.flushBatch();

    console.log('🛑 Heatmap tracking stopped');
  }

  /**
   * Handle click events
   */
  handleClick(event) {
    const interaction = this.createInteraction('click', event);
    this.queueInteraction(interaction);
    this.drawShadow(interaction.xPosition, interaction.yPosition, 'rgba(255, 100, 100, 0.5)');
  }

  /**
   * Handle mouse move (throttled)
   */
  handleMouseMove(event) {
    const now = Date.now();
    if (now - this.lastHoverTime < this.hoverThrottle) return;

    this.lastHoverTime = now;

    const interaction = this.createInteraction('hover', event);
    this.queueInteraction(interaction);
    this.drawShadow(interaction.xPosition, interaction.yPosition, 'rgba(100, 100, 255, 0.3)', 20);
  }

  /**
   * Handle scroll events (throttled)
   */
  handleScroll(event) {
    const now = Date.now();
    if (now - this.lastScrollTime < this.scrollThrottle) return;

    this.lastScrollTime = now;

    // Use center of viewport for scroll position
    const x = window.innerWidth / 2;
    const y = window.scrollY + (window.innerHeight / 2);

    const interaction = {
      interactionType: 'scroll',
      xPosition: 0.5,
      yPosition: Math.min(y / document.body.scrollHeight, 1),
      rawX: Math.floor(x),
      rawY: Math.floor(y),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };

    this.queueInteraction(interaction);
  }

  /**
   * Create interaction object from event
   */
  createInteraction(type, event) {
    const target = event.target;

    // Normalize coordinates (0-1 range)
    const xPosition = event.clientX / window.innerWidth;
    const yPosition = (event.clientY + window.scrollY) / document.body.scrollHeight;

    return {
      interactionType: type,
      xPosition: Math.round(xPosition * 10000) / 10000,
      yPosition: Math.round(yPosition * 10000) / 10000,
      rawX: event.clientX,
      rawY: event.clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      elementId: target.id || null,
      elementClass: target.className || null,
      elementTag: target.tagName || null
    };
  }

  /**
   * Queue interaction for batch sending
   */
  queueInteraction(interaction) {
    this.eventQueue.push(interaction);

    // Send immediately if batch size reached
    if (this.eventQueue.length >= this.batchSize) {
      this.flushBatch();
    } else {
      // Schedule batch send if not already scheduled
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.flushBatch();
        }, this.batchTimeout);
      }
    }
  }

  /**
   * Send batched interactions to server
   */
  async flushBatch() {
    if (this.eventQueue.length === 0) return;

    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const batch = this.eventQueue.splice(0);

    // Send each interaction (could be optimized to send as batch)
    for (const interaction of batch) {
      try {
        await fetch(this.apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: this.sessionId,
            deviceId: this.deviceId,
            page: this.page,
            roomName: this.roomName,
            ...interaction
          })
        });
      } catch (error) {
        console.error('Failed to send heatmap data:', error);
      }
    }
  }

  /**
   * Draw shadow on canvas
   */
  drawShadow(x, y, color = 'rgba(255, 255, 255, 0.3)', radius = 30) {
    if (!this.ctx || !this.canvas) return;

    // Convert normalized coordinates to canvas coordinates
    const canvasX = x * this.canvas.width;
    const canvasY = y * this.canvas.height;

    // Create radial gradient
    const gradient = this.ctx.createRadialGradient(canvasX, canvasY, 0, canvasX, canvasY, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    // Draw circle
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(canvasX, canvasY, radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Store for fade effect
    this.heatmapData.push({
      x: canvasX,
      y: canvasY,
      radius,
      color,
      timestamp: Date.now()
    });

    // Limit stored data
    if (this.heatmapData.length > 100) {
      this.heatmapData.shift();
    }
  }

  /**
   * Resize canvas to match window
   */
  resizeCanvas() {
    if (!this.canvas) return;

    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * Handle window resize
   */
  handleResize() {
    this.resizeCanvas();
  }

  /**
   * Clear canvas
   */
  clearCanvas() {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Animate heatmap (fade effect)
   */
  animate() {
    if (!this.isTracking) return;

    this.clearCanvas();

    const now = Date.now();
    const maxAge = 10000; // 10 seconds

    // Draw all recent shadows with fade
    this.heatmapData = this.heatmapData.filter(point => {
      const age = now - point.timestamp;
      if (age > maxAge) return false;

      const opacity = 1 - (age / maxAge);

      const gradient = this.ctx.createRadialGradient(
        point.x, point.y, 0,
        point.x, point.y, point.radius
      );

      const baseColor = point.color.replace(/[\d.]+\)$/, `${opacity * 0.5})`);
      gradient.addColorStop(0, baseColor);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
      this.ctx.fill();

      return true;
    });

    requestAnimationFrame(() => this.animate());
  }

  /**
   * Load and visualize heatmap data from server
   */
  async loadHeatmap() {
    try {
      const response = await fetch(`/api/lofi/heatmap?page=${this.page}&room=${this.roomName || ''}`);
      const data = await response.json();

      if (data.status === 'success') {
        this.visualizeHeatmap(data.heatmap);
      }
    } catch (error) {
      console.error('Failed to load heatmap:', error);
    }
  }

  /**
   * Visualize aggregated heatmap data
   */
  visualizeHeatmap(heatmapData) {
    if (!this.ctx || !this.canvas) return;

    this.clearCanvas();

    for (const point of heatmapData) {
      const x = point.x_bucket * this.canvas.width;
      const y = point.y_bucket * this.canvas.height;
      const intensity = Math.min(point.interaction_count / 100, 1);

      // Color based on interaction type and intensity
      let color;
      switch (point.interaction_type) {
        case 'click':
          color = `rgba(255, 100, 100, ${intensity * 0.7})`;
          break;
        case 'hover':
          color = `rgba(100, 100, 255, ${intensity * 0.5})`;
          break;
        case 'scroll':
          color = `rgba(100, 255, 100, ${intensity * 0.5})`;
          break;
        default:
          color = `rgba(255, 255, 255, ${intensity * 0.5})`;
      }

      const radius = 20 + (intensity * 30);

      const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HeatmapTracker;
}
