const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

/**
 * Cursor Animator
 *
 * Adds animated cursor overlays to video frames:
 * - Cursor movement between points (smooth transitions)
 * - Click animations (ripple effect)
 * - Coordinate-based keyframes
 * - Multiple cursor styles (default, pointer, click)
 *
 * Creates professional screencast feel like Loom/ente.io tutorials
 */
class CursorAnimator {
  constructor(options = {}) {
    this.cursorSize = options.cursorSize || 32;
    this.clickRippleSize = options.clickRippleSize || 60;
    this.transitionFrames = options.transitionFrames || 10; // Frames for smooth movement
    this.clickAnimationFrames = options.clickAnimationFrames || 5;
    this.cursorColor = options.cursorColor || '#000000';
  }

  /**
   * Generate cursor SVG (default pointer cursor)
   */
  generateCursorSVG(x, y, style = 'default') {
    const size = this.cursorSize;

    let cursorPath;
    if (style === 'pointer' || style === 'default') {
      // Standard pointer cursor
      cursorPath = `
        <path d="M 0 0 L 0 ${size * 0.75} L ${size * 0.25} ${size * 0.6} L ${size * 0.4} ${size} L ${size * 0.55} ${size * 0.95} L ${size * 0.4} ${size * 0.55} L ${size * 0.7} ${size * 0.45} Z"
              fill="${this.cursorColor}" stroke="white" stroke-width="1.5"/>
      `;
    } else if (style === 'click') {
      // Cursor with click state (slightly smaller)
      cursorPath = `
        <path d="M 0 0 L 0 ${size * 0.7} L ${size * 0.25} ${size * 0.55} L ${size * 0.35} ${size * 0.9} L ${size * 0.5} ${size * 0.85} L ${size * 0.4} ${size * 0.5} L ${size * 0.65} ${size * 0.4} Z"
              fill="${this.cursorColor}" stroke="white" stroke-width="1.5"/>
      `;
    }

    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="cursor-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
            <feOffset dx="1" dy="1" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.4"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#cursor-shadow)">
          ${cursorPath}
        </g>
      </svg>
    `;

    return Buffer.from(svg);
  }

  /**
   * Generate click ripple effect SVG
   */
  generateClickRippleSVG(x, y, frame, maxFrames) {
    const progress = frame / maxFrames;
    const radius = (this.clickRippleSize / 2) * progress;
    const opacity = 1 - progress;

    const svg = `
      <svg width="${this.clickRippleSize}" height="${this.clickRippleSize}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${this.clickRippleSize / 2}" cy="${this.clickRippleSize / 2}"
                r="${radius}"
                fill="none"
                stroke="#4a90e2"
                stroke-width="3"
                opacity="${opacity}"/>
        <circle cx="${this.clickRippleSize / 2}" cy="${this.clickRippleSize / 2}"
                r="${radius * 0.7}"
                fill="#4a90e2"
                opacity="${opacity * 0.3}"/>
      </svg>
    `;

    return Buffer.from(svg);
  }

  /**
   * Interpolate cursor position between two points (ease-in-out)
   */
  interpolatePosition(start, end, progress) {
    // Ease-in-out cubic
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    return {
      x: Math.round(start.x + (end.x - start.x) * eased),
      y: Math.round(start.y + (end.y - start.y) * eased)
    };
  }

  /**
   * Generate cursor keyframes from step annotations
   * @param {Array} steps - Steps with annotations containing click coordinates
   * @param {number} fps - Frames per second
   * @returns {Array} Cursor keyframes with { frame, x, y, action }
   */
  generateKeyframesFromSteps(steps, fps = 0.5) {
    const keyframes = [];
    const framesPerStep = Math.round(1 / fps); // e.g., 0.5 fps = 2 seconds = 2 frames at 1fps
    let currentFrame = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const annotations = step.annotations || [];

      // Find clickable elements (boxes with "Click" text)
      const clickableElements = annotations.filter(a =>
        a.type === 'box' && a.text && a.text.toLowerCase().includes('click')
      );

      if (clickableElements.length > 0) {
        // Get center of first clickable element
        const element = clickableElements[0];
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;

        // Add keyframe for cursor movement to this position
        keyframes.push({
          frame: currentFrame,
          x: centerX,
          y: centerY,
          action: 'move',
          stepNumber: step.stepNumber,
          stepTitle: step.stepTitle
        });

        // Add click action
        keyframes.push({
          frame: currentFrame + Math.round(framesPerStep * 0.3),
          x: centerX,
          y: centerY,
          action: 'click',
          stepNumber: step.stepNumber
        });
      } else {
        // No clickable element - place cursor in default position (top-left of first annotation)
        if (annotations.length > 0) {
          const firstAnnotation = annotations[0];
          keyframes.push({
            frame: currentFrame,
            x: firstAnnotation.x || 100,
            y: firstAnnotation.y || 100,
            action: 'idle',
            stepNumber: step.stepNumber
          });
        }
      }

      currentFrame += framesPerStep;
    }

    return keyframes;
  }

  /**
   * Generate all cursor frames with smooth transitions
   * @param {Array} keyframes - Cursor keyframes from generateKeyframesFromSteps
   * @param {number} totalFrames - Total frames in video
   * @returns {Array} Frame-by-frame cursor data
   */
  generateCursorFrames(keyframes, totalFrames) {
    const frames = [];

    for (let frameNum = 0; frameNum < totalFrames; frameNum++) {
      // Find surrounding keyframes
      let prevKeyframe = keyframes[0];
      let nextKeyframe = keyframes[keyframes.length - 1];

      for (let i = 0; i < keyframes.length - 1; i++) {
        if (keyframes[i].frame <= frameNum && keyframes[i + 1].frame > frameNum) {
          prevKeyframe = keyframes[i];
          nextKeyframe = keyframes[i + 1];
          break;
        }
      }

      // Interpolate position
      const frameDiff = nextKeyframe.frame - prevKeyframe.frame;
      const progress = frameDiff > 0 ? (frameNum - prevKeyframe.frame) / frameDiff : 1;

      const position = this.interpolatePosition(
        { x: prevKeyframe.x, y: prevKeyframe.y },
        { x: nextKeyframe.x, y: nextKeyframe.y },
        progress
      );

      // Determine if we're in click animation
      const isClicking = keyframes.some(kf =>
        kf.action === 'click' &&
        frameNum >= kf.frame &&
        frameNum < kf.frame + this.clickAnimationFrames
      );

      const clickKeyframe = isClicking ? keyframes.find(kf =>
        kf.action === 'click' && frameNum >= kf.frame && frameNum < kf.frame + this.clickAnimationFrames
      ) : null;

      frames.push({
        frame: frameNum,
        x: position.x,
        y: position.y,
        style: isClicking ? 'click' : 'pointer',
        isClicking,
        clickFrame: clickKeyframe ? frameNum - clickKeyframe.frame : null
      });
    }

    return frames;
  }

  /**
   * Add cursor overlay to image
   * @param {string} imagePath - Path to input image
   * @param {string} outputPath - Path to output image
   * @param {Object} cursorData - { x, y, style, isClicking, clickFrame }
   */
  async addCursorToImage(imagePath, outputPath, cursorData) {
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    const composites = [];

    // Add click ripple if clicking
    if (cursorData.isClicking && cursorData.clickFrame !== null) {
      const rippleSVG = this.generateClickRippleSVG(
        cursorData.x,
        cursorData.y,
        cursorData.clickFrame,
        this.clickAnimationFrames
      );

      composites.push({
        input: rippleSVG,
        top: Math.max(0, Math.round(cursorData.y - this.clickRippleSize / 2)),
        left: Math.max(0, Math.round(cursorData.x - this.clickRippleSize / 2))
      });
    }

    // Add cursor
    const cursorSVG = this.generateCursorSVG(cursorData.x, cursorData.y, cursorData.style);
    composites.push({
      input: cursorSVG,
      top: Math.max(0, Math.round(cursorData.y)),
      left: Math.max(0, Math.round(cursorData.x))
    });

    await image
      .composite(composites)
      .toFile(outputPath);
  }

  /**
   * Add cursor overlays to all frames
   * @param {Array} framePaths - Paths to frame images
   * @param {Array} cursorFrames - Cursor data for each frame
   * @param {string} outputDir - Directory for output frames
   * @returns {Promise<Array>} Paths to frames with cursor overlays
   */
  async addCursorToFrames(framePaths, cursorFrames, outputDir) {
    await fs.mkdir(outputDir, { recursive: true });

    const outputPaths = [];

    for (let i = 0; i < framePaths.length; i++) {
      const framePath = framePaths[i];
      const cursorData = cursorFrames[i] || cursorFrames[cursorFrames.length - 1];

      const outputPath = path.join(
        outputDir,
        `cursor-${path.basename(framePath)}`
      );

      await this.addCursorToImage(framePath, outputPath, cursorData);
      outputPaths.push(outputPath);

      console.log(`  [Cursor] Frame ${i + 1}/${framePaths.length}: cursor at (${cursorData.x}, ${cursorData.y})`);
    }

    return outputPaths;
  }
}

module.exports = CursorAnimator;
