/**
 * GIFRenderer - Animated GIF and APNG renderer for CalOS
 *
 * Provides:
 * - GIF playback with frame control
 * - APNG support
 * - Play/pause/stop controls
 * - Frame-by-frame navigation
 * - Speed control
 *
 * Note: This is a simplified implementation. For production use,
 * consider using libgif.js or similar libraries for full GIF support.
 *
 * Usage:
 *   const renderer = new GIFRenderer(canvas);
 *   await renderer.load('/path/to/animation.gif');
 *   renderer.play();
 */

class GIFRenderer {
  constructor(canvas) {
    if (!canvas) {
      throw new Error('GIFRenderer requires a canvas element');
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Animation state
    this.image = null;
    this.frames = [];
    this.currentFrame = 0;
    this.isPlaying = false;
    this.loop = true;
    this.speed = 1; // Playback speed multiplier

    // Timing
    this.lastFrameTime = 0;
    this.animationId = null;

    // Metadata
    this.width = 0;
    this.height = 0;
    this.frameCount = 0;
  }

  // ============================================================================
  // IMAGE LOADING
  // ============================================================================

  /**
   * Load animated image
   *
   * Note: Browser native support for animated GIFs is limited.
   * This implementation uses a simple frame extraction approach.
   * For full GIF support, use a library like gif.js or libgif.js
   */
  async load(url) {
    try {
      // Check if it's a GIF or APNG
      const response = await fetch(url);
      const blob = await response.blob();
      const type = blob.type;

      if (type === 'image/gif') {
        return await this._loadGIF(url);
      } else if (type === 'image/apng' || type === 'image/png') {
        return await this._loadAPNG(url);
      } else {
        // Fallback: load as static image
        return await this._loadStatic(url);
      }
    } catch (error) {
      console.error('[GIFRenderer] Failed to load image:', error);
      throw error;
    }
  }

  /**
   * Load GIF (simplified - uses browser native playback)
   */
  async _loadGIF(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        this.image = img;
        this.width = img.width;
        this.height = img.height;

        // For GIF, we rely on browser's native animation
        // This is a limitation - for full control, use gif.js library

        // Create single "frame" that references the animated image
        this.frames = [{
          image: img,
          delay: 100, // Default delay
          x: 0,
          y: 0
        }];

        this.frameCount = 1;
        this.currentFrame = 0;

        console.log(`[GIFRenderer] Loaded GIF: ${this.width}x${this.height}`);
        resolve();
      };

      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Load APNG (Animated PNG)
   */
  async _loadAPNG(url) {
    // APNG requires special parsing
    // For now, fall back to static image
    // In production, use a library like apng-canvas
    return this._loadStatic(url);
  }

  /**
   * Load static image
   */
  async _loadStatic(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        this.image = img;
        this.width = img.width;
        this.height = img.height;

        this.frames = [{
          image: img,
          delay: 0,
          x: 0,
          y: 0
        }];

        this.frameCount = 1;
        this.currentFrame = 0;

        console.log(`[GIFRenderer] Loaded static image: ${this.width}x${this.height}`);
        resolve();
      };

      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Load from sprite sheet (alternative for animated images)
   */
  async loadFromSpriteSheet(imageUrl, frameData) {
    const {
      frameWidth,
      frameHeight,
      frames,
      columns,
      delay = 100
    } = frameData;

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        this.image = img;
        this.width = frameWidth;
        this.height = frameHeight;
        this.frameCount = frames;

        // Extract frames from sprite sheet
        this.frames = [];
        for (let i = 0; i < frames; i++) {
          const col = i % columns;
          const row = Math.floor(i / columns);

          this.frames.push({
            image: img,
            delay: Array.isArray(delay) ? delay[i] : delay,
            x: col * frameWidth,
            y: row * frameHeight,
            width: frameWidth,
            height: frameHeight
          });
        }

        console.log(`[GIFRenderer] Loaded sprite animation: ${frames} frames at ${frameWidth}x${frameHeight}`);
        resolve();
      };

      img.onerror = reject;
      img.src = imageUrl;
    });
  }

  // ============================================================================
  // PLAYBACK CONTROL
  // ============================================================================

  /**
   * Play animation
   */
  play() {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.lastFrameTime = Date.now();
    this._animate();
  }

  /**
   * Pause animation
   */
  pause() {
    this.isPlaying = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Stop animation and reset to first frame
   */
  stop() {
    this.pause();
    this.currentFrame = 0;
    this.render();
  }

  /**
   * Toggle play/pause
   */
  toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Main animation loop
   */
  _animate() {
    if (!this.isPlaying) return;

    const now = Date.now();
    const frame = this.frames[this.currentFrame];
    const frameDelay = (frame.delay || 100) / this.speed;

    if (now - this.lastFrameTime >= frameDelay) {
      this.currentFrame++;

      if (this.currentFrame >= this.frames.length) {
        if (this.loop) {
          this.currentFrame = 0;
        } else {
          this.pause();
          return;
        }
      }

      this.lastFrameTime = now;
      this.render();
    }

    this.animationId = requestAnimationFrame(() => this._animate());
  }

  // ============================================================================
  // FRAME CONTROL
  // ============================================================================

  /**
   * Go to specific frame
   */
  goToFrame(frameIndex) {
    if (frameIndex >= 0 && frameIndex < this.frames.length) {
      this.currentFrame = frameIndex;
      this.render();
    }
  }

  /**
   * Next frame
   */
  nextFrame() {
    this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    this.render();
  }

  /**
   * Previous frame
   */
  previousFrame() {
    this.currentFrame = this.currentFrame - 1;
    if (this.currentFrame < 0) {
      this.currentFrame = this.frames.length - 1;
    }
    this.render();
  }

  /**
   * Set playback speed
   */
  setSpeed(speed) {
    this.speed = Math.max(0.1, Math.min(10, speed));
  }

  /**
   * Set loop mode
   */
  setLoop(loop) {
    this.loop = loop;
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  /**
   * Render current frame to canvas
   */
  render(options = {}) {
    const {
      x = 0,
      y = 0,
      width = this.canvas.width,
      height = this.canvas.height,
      clear = true,
      fitMode = 'contain' // contain, cover, fill, none
    } = options;

    if (clear) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    if (this.frames.length === 0) return;

    const frame = this.frames[this.currentFrame];

    // Calculate dimensions based on fit mode
    let dx = x;
    let dy = y;
    let dw = width;
    let dh = height;

    if (fitMode === 'contain' || fitMode === 'cover') {
      const imgRatio = this.width / this.height;
      const canvasRatio = width / height;

      if ((fitMode === 'contain' && imgRatio > canvasRatio) ||
          (fitMode === 'cover' && imgRatio < canvasRatio)) {
        // Fit to width
        dw = width;
        dh = width / imgRatio;
        dy = y + (height - dh) / 2;
      } else {
        // Fit to height
        dh = height;
        dw = height * imgRatio;
        dx = x + (width - dw) / 2;
      }
    } else if (fitMode === 'none') {
      dw = this.width;
      dh = this.height;
    }

    // Draw frame
    if (frame.width && frame.height) {
      // Sprite sheet frame
      this.ctx.drawImage(
        frame.image,
        frame.x, frame.y, frame.width, frame.height,
        dx, dy, dw, dh
      );
    } else {
      // Full image
      this.ctx.drawImage(frame.image, dx, dy, dw, dh);
    }
  }

  /**
   * Render to specific position with scaling
   */
  renderAt(x, y, width, height, options = {}) {
    return this.render({
      x,
      y,
      width,
      height,
      ...options
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get current frame index
   */
  getCurrentFrame() {
    return this.currentFrame;
  }

  /**
   * Get total frame count
   */
  getFrameCount() {
    return this.frames.length;
  }

  /**
   * Check if playing
   */
  isAnimationPlaying() {
    return this.isPlaying;
  }

  /**
   * Get animation info
   */
  getInfo() {
    return {
      width: this.width,
      height: this.height,
      frameCount: this.frameCount,
      currentFrame: this.currentFrame,
      isPlaying: this.isPlaying,
      loop: this.loop,
      speed: this.speed
    };
  }

  /**
   * Export current frame as data URL
   */
  exportFrame(format = 'image/png', quality = 1.0) {
    return this.canvas.toDataURL(format, quality);
  }

  /**
   * Dispose and cleanup
   */
  dispose() {
    this.pause();
    this.image = null;
    this.frames = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

// ============================================================================
// HELPER: Create GIF player element
// ============================================================================

/**
 * Create a self-contained GIF player element
 */
class GIFPlayer {
  constructor(url, options = {}) {
    const {
      width = 300,
      height = 200,
      controls = true,
      autoplay = true,
      loop = true
    } = options;

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'calos-gif-player';
    this.container.style.cssText = `
      display: inline-block;
      position: relative;
      width: ${width}px;
      height: ${height + (controls ? 40 : 0)}px;
    `;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.cssText = `
      width: 100%;
      height: ${height}px;
      display: block;
      background: #000;
    `;

    this.container.appendChild(this.canvas);

    // Create controls
    if (controls) {
      this._createControls();
    }

    // Create renderer
    this.renderer = new GIFRenderer(this.canvas);
    this.renderer.setLoop(loop);

    // Load and play
    this.load(url, autoplay);
  }

  /**
   * Create playback controls
   */
  _createControls() {
    const controls = document.createElement('div');
    controls.className = 'calos-gif-controls';
    controls.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: #f0f0f0;
      border-top: 1px solid #ddd;
    `;

    // Play/Pause button
    const playBtn = document.createElement('button');
    playBtn.textContent = '⏸';
    playBtn.onclick = () => {
      this.renderer.toggle();
      playBtn.textContent = this.renderer.isAnimationPlaying() ? '⏸' : '▶';
    };

    // Previous frame
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '⏮';
    prevBtn.onclick = () => this.renderer.previousFrame();

    // Next frame
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '⏭';
    nextBtn.onclick = () => this.renderer.nextFrame();

    // Frame counter
    const frameCounter = document.createElement('span');
    frameCounter.style.cssText = 'flex: 1; text-align: center; font-size: 12px;';
    frameCounter.textContent = '0 / 0';

    setInterval(() => {
      frameCounter.textContent = `${this.renderer.getCurrentFrame() + 1} / ${this.renderer.getFrameCount()}`;
    }, 100);

    controls.appendChild(playBtn);
    controls.appendChild(prevBtn);
    controls.appendChild(frameCounter);
    controls.appendChild(nextBtn);

    this.container.appendChild(controls);
  }

  /**
   * Load GIF
   */
  async load(url, autoplay = true) {
    await this.renderer.load(url);
    this.renderer.render();
    if (autoplay) {
      this.renderer.play();
    }
  }

  /**
   * Get container element
   */
  getElement() {
    return this.container;
  }
}

// ============================================================================
// GLOBAL INSTANCES
// ============================================================================

if (typeof window !== 'undefined') {
  window.CalOSGIFRenderer = GIFRenderer;
  window.CalOSGIFPlayer = GIFPlayer;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GIFRenderer, GIFPlayer };
}
