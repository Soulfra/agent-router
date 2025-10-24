/**
 * ParticleEngine - Particle system for CalOS
 *
 * Provides:
 * - Sparkle/twinkle effects
 * - Confetti explosions
 * - Smoke/fog effects
 * - Explosion effects
 * - Snow/rain effects
 * - Custom particle emitters
 *
 * Usage:
 *   const engine = new ParticleEngine(canvas, animationEngine);
 *   engine.confetti({ x: 200, y: 100 });
 *   engine.sparkle({ x: 150, y: 50 });
 */

class ParticleEngine {
  constructor(canvas, animationEngine = null) {
    if (!canvas) {
      // Create default canvas
      canvas = document.createElement('canvas');
      canvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 9999;
      `;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      document.body.appendChild(canvas);

      // Resize handler
      window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      });
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = animationEngine;

    this.particles = []; // Active particles
    this.emitters = new Map(); // Active emitters
    this.isRunning = false;
    this.animationId = null;
  }

  // ============================================================================
  // CORE PARTICLE SYSTEM
  // ============================================================================

  /**
   * Start particle update loop
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this._update();
  }

  /**
   * Stop particle update loop
   */
  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Main update loop
   */
  _update() {
    if (!this.isRunning) return;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Update all particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];

      // Update position
      particle.x += particle.vx;
      particle.y += particle.vy;

      // Apply forces
      if (particle.gravity) {
        particle.vy += particle.gravity;
      }

      if (particle.friction) {
        particle.vx *= particle.friction;
        particle.vy *= particle.friction;
      }

      // Update life
      particle.life -= particle.decay;

      // Update alpha based on life
      particle.alpha = Math.max(0, particle.life);

      // Update rotation
      if (particle.rotation !== undefined) {
        particle.rotation += particle.rotationSpeed || 0;
      }

      // Remove dead particles
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      // Render particle
      this._renderParticle(particle);
    }

    // Update emitters
    this.emitters.forEach((emitter, id) => {
      if (emitter.active) {
        emitter.emit();
      }
    });

    // Stop if no particles and no active emitters
    if (this.particles.length === 0 && this.emitters.size === 0) {
      this.stop();
    }

    this.animationId = requestAnimationFrame(() => this._update());
  }

  /**
   * Render a single particle
   */
  _renderParticle(particle) {
    this.ctx.save();

    this.ctx.globalAlpha = particle.alpha;
    this.ctx.translate(particle.x, particle.y);

    if (particle.rotation !== undefined) {
      this.ctx.rotate(particle.rotation);
    }

    if (particle.shape === 'circle') {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
      this.ctx.fillStyle = particle.color;
      this.ctx.fill();
    } else if (particle.shape === 'square') {
      this.ctx.fillStyle = particle.color;
      this.ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
    } else if (particle.shape === 'star') {
      this._drawStar(0, 0, 5, particle.size, particle.size / 2, particle.color);
    } else if (particle.shape === 'line') {
      this.ctx.strokeStyle = particle.color;
      this.ctx.lineWidth = particle.lineWidth || 2;
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(particle.vx * 2, particle.vy * 2);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Draw star shape
   */
  _drawStar(x, y, points, outerRadius, innerRadius, color) {
    this.ctx.beginPath();
    this.ctx.fillStyle = color;

    for (let i = 0; i < points * 2; i++) {
      const angle = (Math.PI * i) / points - Math.PI / 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;

      if (i === 0) {
        this.ctx.moveTo(px, py);
      } else {
        this.ctx.lineTo(px, py);
      }
    }

    this.ctx.closePath();
    this.ctx.fill();
  }

  /**
   * Add particle to system
   */
  addParticle(particle) {
    const defaults = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 5,
      color: '#fff',
      alpha: 1,
      life: 1,
      decay: 0.01,
      gravity: 0,
      friction: 1,
      shape: 'circle'
    };

    this.particles.push({ ...defaults, ...particle });

    // Auto-start if not running
    if (!this.isRunning) {
      this.start();
    }
  }

  // ============================================================================
  // CONFETTI EFFECT
  // ============================================================================

  /**
   * Create confetti explosion
   */
  confetti(options = {}) {
    const {
      x = this.canvas.width / 2,
      y = this.canvas.height / 2,
      count = 50,
      colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
      spread = 360,
      velocity = 5
    } = options;

    for (let i = 0; i < count; i++) {
      const angle = (Math.random() * spread - spread / 2) * (Math.PI / 180);
      const speed = Math.random() * velocity + 2;

      this.addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 2,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: Math.random() > 0.5 ? 'square' : 'circle',
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        life: 1,
        decay: 0.005 + Math.random() * 0.005,
        gravity: 0.15,
        friction: 0.98
      });
    }
  }

  // ============================================================================
  // SPARKLE EFFECT
  // ============================================================================

  /**
   * Create sparkle effect
   */
  sparkle(options = {}) {
    const {
      x = this.canvas.width / 2,
      y = this.canvas.height / 2,
      count = 10,
      color = '#ffff00',
      radius = 30
    } = options;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const distance = Math.random() * radius;

      this.addParticle({
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        vx: Math.cos(angle) * 2,
        vy: Math.sin(angle) * 2,
        size: Math.random() * 4 + 2,
        color,
        shape: 'star',
        life: 1,
        decay: 0.02,
        friction: 0.95
      });
    }
  }

  // ============================================================================
  // EXPLOSION EFFECT
  // ============================================================================

  /**
   * Create explosion effect
   */
  explosion(options = {}) {
    const {
      x = this.canvas.width / 2,
      y = this.canvas.height / 2,
      count = 30,
      color = '#ff6600',
      velocity = 8
    } = options;

    // Outer particles (fast)
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * velocity + velocity / 2;

      this.addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 6 + 3,
        color: Math.random() > 0.5 ? color : '#ffff00',
        shape: 'circle',
        life: 1,
        decay: 0.015,
        friction: 0.96
      });
    }

    // Inner particles (slow, smoke-like)
    for (let i = 0; i < count / 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2;

      this.addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 15 + 10,
        color: '#888888',
        shape: 'circle',
        life: 1,
        decay: 0.008,
        friction: 0.98
      });
    }
  }

  // ============================================================================
  // SMOKE EFFECT
  // ============================================================================

  /**
   * Create smoke effect
   */
  smoke(options = {}) {
    const {
      x = this.canvas.width / 2,
      y = this.canvas.height,
      count = 5,
      color = '#888888'
    } = options;

    for (let i = 0; i < count; i++) {
      this.addParticle({
        x: x + (Math.random() - 0.5) * 20,
        y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -Math.random() * 2 - 1,
        size: Math.random() * 20 + 15,
        color,
        shape: 'circle',
        life: 1,
        decay: 0.005,
        friction: 0.99
      });
    }
  }

  // ============================================================================
  // SNOW EFFECT
  // ============================================================================

  /**
   * Create snow effect
   */
  snow(options = {}) {
    const {
      count = 10,
      color = '#ffffff'
    } = options;

    for (let i = 0; i < count; i++) {
      this.addParticle({
        x: Math.random() * this.canvas.width,
        y: -10,
        vx: (Math.random() - 0.5) * 0.5,
        vy: Math.random() * 1 + 0.5,
        size: Math.random() * 4 + 2,
        color,
        shape: 'circle',
        life: 2,
        decay: 0.001,
        friction: 1
      });
    }
  }

  // ============================================================================
  // RAIN EFFECT
  // ============================================================================

  /**
   * Create rain effect
   */
  rain(options = {}) {
    const {
      count = 10,
      color = '#6699cc'
    } = options;

    for (let i = 0; i < count; i++) {
      this.addParticle({
        x: Math.random() * this.canvas.width,
        y: -10,
        vx: 0,
        vy: Math.random() * 5 + 5,
        size: Math.random() * 2 + 1,
        color,
        shape: 'line',
        lineWidth: 1,
        life: 1,
        decay: 0.005,
        friction: 1
      });
    }
  }

  // ============================================================================
  // TRAIL EFFECT
  // ============================================================================

  /**
   * Create trail effect (follow cursor)
   */
  trail(x, y, options = {}) {
    const {
      color = '#4a9eff',
      size = 5,
      count = 1
    } = options;

    for (let i = 0; i < count; i++) {
      this.addParticle({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        size: Math.random() * size + size / 2,
        color,
        shape: 'circle',
        life: 1,
        decay: 0.02,
        friction: 0.95
      });
    }
  }

  // ============================================================================
  // EMITTER SYSTEM
  // ============================================================================

  /**
   * Create particle emitter
   */
  createEmitter(options = {}) {
    const {
      x = 0,
      y = 0,
      rate = 10, // Particles per second
      duration = null, // null = infinite
      particleOptions = {}
    } = options;

    const emitter = {
      x,
      y,
      rate,
      duration,
      particleOptions,
      active: true,
      elapsed: 0,
      lastEmit: 0,

      emit: function() {
        const now = Date.now();
        const interval = 1000 / this.rate;

        if (now - this.lastEmit >= interval) {
          // Emit particle
          const particleOpts = typeof this.particleOptions === 'function'
            ? this.particleOptions()
            : { ...this.particleOptions };

          particleOpts.x = this.x;
          particleOpts.y = this.y;

          this.engine.addParticle(particleOpts);
          this.lastEmit = now;
        }

        // Check duration
        if (this.duration !== null) {
          this.elapsed += 16; // Approximate frame time
          if (this.elapsed >= this.duration) {
            this.active = false;
          }
        }
      }.bind({ ...emitter, engine: this })
    };

    const id = Math.random().toString(36).substr(2, 9);
    this.emitters.set(id, emitter.emit.bind(emitter));

    // Auto-start engine
    if (!this.isRunning) {
      this.start();
    }

    return id;
  }

  /**
   * Stop emitter
   */
  stopEmitter(id) {
    this.emitters.delete(id);
  }

  /**
   * Stop all emitters
   */
  stopAllEmitters() {
    this.emitters.clear();
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Clear all particles
   */
  clear() {
    this.particles = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Get particle count
   */
  getParticleCount() {
    return this.particles.length;
  }

  /**
   * Get active emitter count
   */
  getEmitterCount() {
    return this.emitters.size;
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

if (typeof window !== 'undefined') {
  window.CalOSParticleEngine = ParticleEngine;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParticleEngine;
}
