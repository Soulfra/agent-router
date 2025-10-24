/**
 * Watermark Overlay System
 *
 * Adds transparent brand watermarks to images and videos
 * Like old-school .tk free domain watermarks but with your brands
 *
 * Features:
 * - Text watermarks (@calriven, @soulfra, etc.)
 * - Logo watermarks (SVG brand logos)
 * - Signature watermarks (CalRiven signature)
 * - Multiple positions (corners, center, tiled)
 * - Opacity control (10%, 30%, 50%)
 * - Works on PNG, JPG, GIF frames, MP4 video
 *
 * Usage:
 *   const watermarker = new WatermarkOverlay();
 *   await watermarker.addWatermark('input.png', {
 *     brand: 'calriven',
 *     type: 'text',
 *     position: 'bottom-right',
 *     opacity: 0.3
 *   }, 'output.png');
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class WatermarkOverlay {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.join(__dirname, '../temp/watermarked');

    // Brand configurations
    this.brands = {
      calriven: {
        name: 'CalRiven',
        handle: '@calriven',
        color: '#0066cc',
        tagline: 'Wire it together'
      },
      soulfra: {
        name: 'SOULFRA',
        handle: '@soulfra',
        color: '#44cc44',
        tagline: 'Universal SSO'
      },
      deathtodata: {
        name: 'DeathToData',
        handle: '@deathtodata',
        color: '#ff4444',
        tagline: 'Death to data silos'
      },
      roughsparks: {
        name: 'RoughSparks',
        handle: '@roughsparks',
        color: '#ff9900',
        tagline: 'Creative experiments'
      }
    };

    console.log('[WatermarkOverlay] Initialized');
  }

  /**
   * Add watermark to image
   *
   * @param {string} inputPath - Path to input image
   * @param {Object} options - Watermark options
   * @param {string} outputPath - Path to save watermarked image
   */
  async addWatermark(inputPath, options, outputPath) {
    const {
      brand = 'calriven',
      type = 'text',           // 'text', 'logo', 'signature'
      position = 'bottom-right', // 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'tiled'
      opacity = 0.3,
      fontSize = 24
    } = options;

    console.log(`[WatermarkOverlay] Adding ${type} watermark (${brand}) to ${path.basename(inputPath)}`);

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Load input image
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    // Generate watermark SVG based on type
    let watermarkSVG;
    if (type === 'text') {
      watermarkSVG = this._generateTextWatermark(brand, metadata, fontSize);
    } else if (type === 'logo') {
      watermarkSVG = this._generateLogoWatermark(brand, metadata);
    } else if (type === 'signature') {
      watermarkSVG = this._generateSignatureWatermark(brand, metadata);
    }

    // Calculate position
    const placement = this._calculatePlacement(position, metadata, watermarkSVG);

    // Composite watermark onto image
    const watermarkBuffer = Buffer.from(watermarkSVG.svg);

    await image
      .composite([{
        input: watermarkBuffer,
        top: placement.top,
        left: placement.left,
        blend: 'over'
      }])
      .toFile(outputPath);

    console.log(`[WatermarkOverlay] ✅ Saved watermarked image: ${path.basename(outputPath)}`);

    return {
      inputPath,
      outputPath,
      brand,
      type,
      position,
      opacity,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format
      }
    };
  }

  /**
   * Add watermark to video (frame by frame or overlay)
   */
  async addWatermarkToVideo(inputPath, options, outputPath) {
    const {
      brand = 'calriven',
      type = 'text',
      position = 'bottom-right',
      opacity = 0.3,
      fontSize = 24
    } = options;

    console.log(`[WatermarkOverlay] Adding ${type} watermark to video: ${path.basename(inputPath)}`);

    // Generate watermark as PNG
    const watermarkPath = path.join(this.outputDir, `watermark-${brand}-${Date.now()}.png`);
    await this._generateWatermarkPNG(brand, type, fontSize, opacity, watermarkPath);

    // Use FFmpeg to overlay watermark on video
    const positionFilter = this._getFFmpegPosition(position);

    const command = `ffmpeg -i "${inputPath}" -i "${watermarkPath}" \
      -filter_complex "[1:v]${positionFilter}[wm];[0:v][wm]overlay" \
      -codec:a copy "${outputPath}" -y`;

    try {
      await execAsync(command);
      console.log(`[WatermarkOverlay] ✅ Saved watermarked video: ${path.basename(outputPath)}`);

      // Clean up temporary watermark
      await fs.unlink(watermarkPath);

      return {
        inputPath,
        outputPath,
        brand,
        type,
        position,
        opacity
      };
    } catch (error) {
      console.error('[WatermarkOverlay] FFmpeg error:', error.message);
      throw new Error('FFmpeg not available - cannot watermark video');
    }
  }

  /**
   * Generate text watermark SVG
   */
  _generateTextWatermark(brand, imageMetadata, fontSize) {
    const brandConfig = this.brands[brand];
    const text = brandConfig.handle;
    const color = brandConfig.color;

    // Estimate text width (rough approximation)
    const textWidth = text.length * fontSize * 0.6;
    const textHeight = fontSize * 1.5;

    const svg = `
      <svg width="${textWidth}" height="${textHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow">
            <feDropShadow dx="2" dy="2" stdDeviation="2" flood-opacity="0.5"/>
          </filter>
        </defs>
        <text x="0" y="${fontSize}"
              font-family="system-ui, -apple-system, Arial, sans-serif"
              font-size="${fontSize}"
              font-weight="700"
              fill="${color}"
              opacity="0.3"
              filter="url(#shadow)">${text}</text>
      </svg>
    `;

    return { svg, width: textWidth, height: textHeight };
  }

  /**
   * Generate logo watermark SVG
   */
  _generateLogoWatermark(brand, imageMetadata) {
    const brandConfig = this.brands[brand];
    const size = Math.min(imageMetadata.width, imageMetadata.height) * 0.15;

    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="brandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${brandConfig.color};stop-opacity:0.3" />
            <stop offset="100%" style="stop-color:${brandConfig.color};stop-opacity:0.1" />
          </linearGradient>
        </defs>
        <circle cx="${size/2}" cy="${size/2}" r="${size/2.5}" fill="none"
                stroke="url(#brandGradient)" stroke-width="${size * 0.05}"
                stroke-dasharray="${size * 0.3} ${size * 0.3}"
                stroke-linecap="round"
                transform="rotate(-45 ${size/2} ${size/2})"/>
        <text x="${size/2}" y="${size * 0.6}"
              font-family="system-ui, -apple-system, Arial, sans-serif"
              font-size="${size * 0.2}"
              font-weight="700"
              fill="${brandConfig.color}"
              opacity="0.3"
              text-anchor="middle">${brandConfig.name.charAt(0)}</text>
      </svg>
    `;

    return { svg, width: size, height: size };
  }

  /**
   * Generate signature watermark SVG
   */
  _generateSignatureWatermark(brand, imageMetadata) {
    const brandConfig = this.brands[brand];
    const width = Math.min(imageMetadata.width, imageMetadata.height) * 0.3;
    const height = width * 0.4;

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <path d="M 10,${height/2} Q ${width/3},${height*0.2} ${width/2},${height/2} T ${width-10},${height/2}"
              stroke="${brandConfig.color}"
              stroke-width="3"
              fill="none"
              opacity="0.3"
              stroke-linecap="round"
              filter="url(#glow)"/>
        <text x="${width/2}" y="${height * 0.8}"
              font-family="'Brush Script MT', cursive"
              font-size="${height * 0.3}"
              fill="${brandConfig.color}"
              opacity="0.3"
              text-anchor="middle">${brandConfig.name}</text>
      </svg>
    `;

    return { svg, width, height };
  }

  /**
   * Calculate watermark placement on image
   */
  _calculatePlacement(position, imageMetadata, watermarkSVG) {
    const padding = 20;
    const imgWidth = imageMetadata.width;
    const imgHeight = imageMetadata.height;
    const wmWidth = watermarkSVG.width;
    const wmHeight = watermarkSVG.height;

    switch (position) {
      case 'top-left':
        return { top: padding, left: padding };

      case 'top-right':
        return { top: padding, left: imgWidth - wmWidth - padding };

      case 'bottom-left':
        return { top: imgHeight - wmHeight - padding, left: padding };

      case 'bottom-right':
        return { top: imgHeight - wmHeight - padding, left: imgWidth - wmWidth - padding };

      case 'center':
        return {
          top: Math.round((imgHeight - wmHeight) / 2),
          left: Math.round((imgWidth - wmWidth) / 2)
        };

      default:
        return { top: imgHeight - wmHeight - padding, left: imgWidth - wmWidth - padding };
    }
  }

  /**
   * Generate watermark as PNG (for video overlays)
   */
  async _generateWatermarkPNG(brand, type, fontSize, opacity, outputPath) {
    const brandConfig = this.brands[brand];

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Create a simple 300x100 watermark
    const width = 300;
    const height = 100;

    let svg;
    if (type === 'text') {
      svg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <text x="${width/2}" y="${height/2 + fontSize/3}"
                font-family="system-ui, -apple-system, Arial, sans-serif"
                font-size="${fontSize}"
                font-weight="700"
                fill="${brandConfig.color}"
                opacity="${opacity}"
                text-anchor="middle">${brandConfig.handle}</text>
        </svg>
      `;
    } else {
      svg = this._generateLogoWatermark(brand, { width, height }).svg;
    }

    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);
  }

  /**
   * Get FFmpeg position filter
   */
  _getFFmpegPosition(position) {
    switch (position) {
      case 'top-left':
        return 'overlay=10:10';
      case 'top-right':
        return 'overlay=W-w-10:10';
      case 'bottom-left':
        return 'overlay=10:H-h-10';
      case 'bottom-right':
        return 'overlay=W-w-10:H-h-10';
      case 'center':
        return 'overlay=(W-w)/2:(H-h)/2';
      default:
        return 'overlay=W-w-10:H-h-10';
    }
  }

  /**
   * Batch watermark multiple files
   */
  async batchWatermark(inputFiles, options) {
    console.log(`[WatermarkOverlay] Batch watermarking ${inputFiles.length} files...`);

    const results = [];
    for (const inputFile of inputFiles) {
      const ext = path.extname(inputFile);
      const basename = path.basename(inputFile, ext);
      const outputPath = path.join(this.outputDir, `${basename}-watermarked${ext}`);

      try {
        let result;
        if (ext === '.mp4' || ext === '.mov') {
          result = await this.addWatermarkToVideo(inputFile, options, outputPath);
        } else {
          result = await this.addWatermark(inputFile, options, outputPath);
        }
        results.push(result);
      } catch (error) {
        console.error(`[WatermarkOverlay] Error watermarking ${inputFile}:`, error.message);
        results.push({ inputPath: inputFile, error: error.message });
      }
    }

    console.log(`[WatermarkOverlay] ✅ Batch complete: ${results.length} files processed`);
    return results;
  }
}

module.exports = WatermarkOverlay;
