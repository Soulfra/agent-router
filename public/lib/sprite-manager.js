/**
 * SpriteManager - Sprite sheet management for CalOS
 *
 * Provides:
 * - Sprite sheet loading and caching
 * - Sprite animation (frame-by-frame)
 * - Sprite atlas support
 * - Batch rendering for performance
 * - Sprite metadata management
 *
 * Usage:
 *   const manager = new SpriteManager(canvas);
 *   await manager.loadSpriteSheet('icons', '/sprites/icons.png', {
 *     frameWidth: 32,
 *     frameHeight: 32
 *   });
 *   manager.drawSprite('icons', 0, x, y);
 */

class SpriteManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;

    // Loaded sprite sheets
    this.spriteSheets = new Map(); // name => { image, metadata }

    // Active animations
    this.animations = new Map(); // animationId => { spriteSheet, frames, currentFrame, ... }

    // Cache for sprite bounds
    this.spriteCache = new Map(); // key => { x, y, width, height }
  }

  // ============================================================================
  // SPRITE SHEET LOADING
  // ============================================================================

  /**
   * Load sprite sheet from URL
   *
   * @param {string} name - Unique name for this sprite sheet
   * @param {string} url - Image URL
   * @param {Object} metadata - Sprite sheet metadata
   * @returns {Promise}
   */
  async loadSpriteSheet(name, url, metadata = {}) {
    const {
      frameWidth = 32,
      frameHeight = 32,
      frames = null, // Total frames (auto-calculate if null)
      columns = null, // Frames per row (auto-calculate if null)
      rows = null, // Frame rows (auto-calculate if null)
      padding = 0, // Pixels between frames
      offset = { x: 0, y: 0 } // Starting offset
    } = metadata;

    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        // Calculate grid dimensions
        const actualColumns = columns || Math.floor((image.width - offset.x) / (frameWidth + padding));
        const actualRows = rows || Math.floor((image.height - offset.y) / (frameHeight + padding));
        const totalFrames = frames || (actualColumns * actualRows);

        const spriteSheet = {
          name,
          image,
          frameWidth,
          frameHeight,
          frames: totalFrames,
          columns: actualColumns,
          rows: actualRows,
          padding,
          offset
        };

        this.spriteSheets.set(name, spriteSheet);
        console.log(`[SpriteManager] Loaded sprite sheet "${name}": ${totalFrames} frames (${actualColumns}x${actualRows})`);

        resolve(spriteSheet);
      };

      image.onerror = (error) => {
        console.error(`[SpriteManager] Failed to load sprite sheet "${name}":`, error);
        reject(error);
      };

      image.src = url;
    });
  }

  /**
   * Load sprite sheet from database
   */
  async loadSpriteSheetFromDB(name) {
    try {
      const response = await fetch(`/api/sprites/${name}`);
      if (!response.ok) {
        throw new Error(`Sprite sheet "${name}" not found`);
      }

      const data = await response.json();
      const { image_url, frame_width, frame_height, frames, columns, rows, metadata } = data.sprite;

      return this.loadSpriteSheet(name, image_url, {
        frameWidth: frame_width,
        frameHeight: frame_height,
        frames,
        columns,
        rows,
        ...metadata
      });
    } catch (error) {
      console.error(`[SpriteManager] Failed to load sprite from database:`, error);
      throw error;
    }
  }

  /**
   * Unload sprite sheet
   */
  unloadSpriteSheet(name) {
    this.spriteSheets.delete(name);
    // Clear related cache entries
    this.spriteCache.forEach((value, key) => {
      if (key.startsWith(name + ':')) {
        this.spriteCache.delete(key);
      }
    });
  }

  // ============================================================================
  // SPRITE RENDERING
  // ============================================================================

  /**
   * Draw a single sprite frame
   *
   * @param {string} spriteSheetName - Name of sprite sheet
   * @param {number} frameIndex - Frame index (0-based)
   * @param {number} x - X position on canvas
   * @param {number} y - Y position on canvas
   * @param {Object} options - Rendering options
   */
  drawSprite(spriteSheetName, frameIndex, x, y, options = {}) {
    const {
      width = null, // Render width (null = frame width)
      height = null, // Render height (null = frame height)
      alpha = 1,
      rotation = 0,
      flipX = false,
      flipY = false,
      centerOrigin = false
    } = options;

    const spriteSheet = this.spriteSheets.get(spriteSheetName);
    if (!spriteSheet) {
      console.warn(`[SpriteManager] Sprite sheet "${spriteSheetName}" not loaded`);
      return;
    }

    if (frameIndex < 0 || frameIndex >= spriteSheet.frames) {
      console.warn(`[SpriteManager] Frame index ${frameIndex} out of bounds`);
      return;
    }

    // Calculate source rectangle
    const col = frameIndex % spriteSheet.columns;
    const row = Math.floor(frameIndex / spriteSheet.columns);

    const sx = spriteSheet.offset.x + col * (spriteSheet.frameWidth + spriteSheet.padding);
    const sy = spriteSheet.offset.y + row * (spriteSheet.frameHeight + spriteSheet.padding);
    const sw = spriteSheet.frameWidth;
    const sh = spriteSheet.frameHeight;

    // Calculate destination rectangle
    const dw = width || sw;
    const dh = height || sh;
    const dx = centerOrigin ? x - dw / 2 : x;
    const dy = centerOrigin ? y - dh / 2 : y;

    // Render
    this.ctx.save();

    this.ctx.globalAlpha = alpha;

    // Apply transformations
    if (rotation !== 0 || flipX || flipY) {
      this.ctx.translate(x, y);
      if (rotation !== 0) this.ctx.rotate(rotation);
      if (flipX || flipY) this.ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      this.ctx.translate(-x, -y);
    }

    this.ctx.drawImage(
      spriteSheet.image,
      sx, sy, sw, sh,
      dx, dy, dw, dh
    );

    this.ctx.restore();
  }

  /**
   * Draw sprite at specific row/column
   */
  drawSpriteByGrid(spriteSheetName, col, row, x, y, options = {}) {
    const spriteSheet = this.spriteSheets.get(spriteSheetName);
    if (!spriteSheet) return;

    const frameIndex = row * spriteSheet.columns + col;
    this.drawSprite(spriteSheetName, frameIndex, x, y, options);
  }

  // ============================================================================
  // SPRITE ANIMATION
  // ============================================================================

  /**
   * Create sprite animation
   *
   * @param {string} spriteSheetName - Sprite sheet to animate
   * @param {Array} frames - Frame indices to animate
   * @param {Object} options - Animation options
   * @returns {string} Animation ID
   */
  createAnimation(spriteSheetName, frames, options = {}) {
    const {
      fps = 12,
      loop = true,
      onComplete = null
    } = options;

    const animationId = Math.random().toString(36).substr(2, 9);

    const animation = {
      spriteSheet: spriteSheetName,
      frames,
      currentFrame: 0,
      fps,
      loop,
      onComplete,
      lastFrameTime: Date.now(),
      isPlaying: true
    };

    this.animations.set(animationId, animation);

    return animationId;
  }

  /**
   * Update animation frame
   */
  updateAnimation(animationId) {
    const animation = this.animations.get(animationId);
    if (!animation || !animation.isPlaying) return;

    const now = Date.now();
    const frameTime = 1000 / animation.fps;

    if (now - animation.lastFrameTime >= frameTime) {
      animation.currentFrame++;

      if (animation.currentFrame >= animation.frames.length) {
        if (animation.loop) {
          animation.currentFrame = 0;
        } else {
          animation.isPlaying = false;
          if (animation.onComplete) animation.onComplete();
        }
      }

      animation.lastFrameTime = now;
    }
  }

  /**
   * Draw animated sprite
   */
  drawAnimation(animationId, x, y, options = {}) {
    const animation = this.animations.get(animationId);
    if (!animation) return;

    this.updateAnimation(animationId);

    const frameIndex = animation.frames[animation.currentFrame];
    this.drawSprite(animation.spriteSheet, frameIndex, x, y, options);
  }

  /**
   * Play animation
   */
  playAnimation(animationId) {
    const animation = this.animations.get(animationId);
    if (animation) {
      animation.isPlaying = true;
    }
  }

  /**
   * Pause animation
   */
  pauseAnimation(animationId) {
    const animation = this.animations.get(animationId);
    if (animation) {
      animation.isPlaying = false;
    }
  }

  /**
   * Stop animation and reset to first frame
   */
  stopAnimation(animationId) {
    const animation = this.animations.get(animationId);
    if (animation) {
      animation.isPlaying = false;
      animation.currentFrame = 0;
    }
  }

  /**
   * Remove animation
   */
  removeAnimation(animationId) {
    this.animations.delete(animationId);
  }

  // ============================================================================
  // BATCH RENDERING
  // ============================================================================

  /**
   * Draw multiple sprites in a batch (more efficient)
   *
   * @param {Array} sprites - Array of { spriteSheet, frame, x, y, options }
   */
  drawBatch(sprites) {
    sprites.forEach(({ spriteSheet, frame, x, y, options = {} }) => {
      this.drawSprite(spriteSheet, frame, x, y, options);
    });
  }

  // ============================================================================
  // SPRITE ATLAS SUPPORT
  // ============================================================================

  /**
   * Load sprite atlas (JSON with named sprites)
   *
   * @param {string} name - Atlas name
   * @param {string} imageUrl - Sprite sheet image URL
   * @param {string} atlasUrl - Atlas JSON URL
   */
  async loadAtlas(name, imageUrl, atlasUrl) {
    try {
      // Load atlas JSON
      const response = await fetch(atlasUrl);
      const atlasData = await response.json();

      // Load image
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = imageUrl;
      });

      // Store atlas
      this.spriteSheets.set(name, {
        name,
        image,
        isAtlas: true,
        sprites: atlasData.sprites || atlasData.frames // Support different formats
      });

      console.log(`[SpriteManager] Loaded atlas "${name}" with ${Object.keys(atlasData.sprites || atlasData.frames).length} sprites`);

      return true;
    } catch (error) {
      console.error(`[SpriteManager] Failed to load atlas "${name}":`, error);
      throw error;
    }
  }

  /**
   * Draw sprite from atlas by name
   */
  drawAtlasSprite(atlasName, spriteName, x, y, options = {}) {
    const atlas = this.spriteSheets.get(atlasName);
    if (!atlas || !atlas.isAtlas) {
      console.warn(`[SpriteManager] Atlas "${atlasName}" not loaded`);
      return;
    }

    const spriteData = atlas.sprites[spriteName];
    if (!spriteData) {
      console.warn(`[SpriteManager] Sprite "${spriteName}" not found in atlas "${atlasName}"`);
      return;
    }

    const {
      width = null,
      height = null,
      alpha = 1,
      rotation = 0,
      centerOrigin = false
    } = options;

    // Handle different atlas formats
    const sx = spriteData.x || spriteData.frame?.x || 0;
    const sy = spriteData.y || spriteData.frame?.y || 0;
    const sw = spriteData.w || spriteData.width || spriteData.frame?.w || 0;
    const sh = spriteData.h || spriteData.height || spriteData.frame?.h || 0;

    const dw = width || sw;
    const dh = height || sh;
    const dx = centerOrigin ? x - dw / 2 : x;
    const dy = centerOrigin ? y - dh / 2 : y;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;

    if (rotation !== 0) {
      this.ctx.translate(x, y);
      this.ctx.rotate(rotation);
      this.ctx.translate(-x, -y);
    }

    this.ctx.drawImage(
      atlas.image,
      sx, sy, sw, sh,
      dx, dy, dw, dh
    );

    this.ctx.restore();
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Check if sprite sheet is loaded
   */
  isLoaded(name) {
    return this.spriteSheets.has(name);
  }

  /**
   * Get sprite sheet info
   */
  getSpriteSheetInfo(name) {
    const spriteSheet = this.spriteSheets.get(name);
    if (!spriteSheet) return null;

    return {
      name: spriteSheet.name,
      frames: spriteSheet.frames,
      frameWidth: spriteSheet.frameWidth,
      frameHeight: spriteSheet.frameHeight,
      columns: spriteSheet.columns,
      rows: spriteSheet.rows,
      isAtlas: spriteSheet.isAtlas || false
    };
  }

  /**
   * Get all loaded sprite sheets
   */
  getLoadedSheets() {
    return Array.from(this.spriteSheets.keys());
  }

  /**
   * Clear all sprite sheets
   */
  clear() {
    this.spriteSheets.clear();
    this.animations.clear();
    this.spriteCache.clear();
  }

  /**
   * Get memory usage estimate
   */
  getMemoryUsage() {
    let totalPixels = 0;

    this.spriteSheets.forEach((sheet) => {
      if (sheet.image) {
        totalPixels += sheet.image.width * sheet.image.height;
      }
    });

    // Estimate: 4 bytes per pixel (RGBA)
    const bytes = totalPixels * 4;
    const mb = (bytes / (1024 * 1024)).toFixed(2);

    return {
      sheets: this.spriteSheets.size,
      totalPixels,
      estimatedMB: mb
    };
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

if (typeof window !== 'undefined') {
  window.CalOSSpriteManager = SpriteManager;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpriteManager;
}
