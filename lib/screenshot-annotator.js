/**
 * Screenshot Annotator
 *
 * Adds visual annotations to screenshots:
 * - Arrows pointing to elements
 * - Text boxes with instructions
 * - Highlight boxes/circles
 * - Numbered steps
 * - Click animations
 *
 * Like Skitch/Monosnap but automated using sharp
 *
 * Usage:
 *   const annotator = new ScreenshotAnnotator();
 *   await annotator.annotate('screenshot.png', annotations, 'output.png');
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

class ScreenshotAnnotator {
  constructor(options = {}) {
    this.defaultColor = options.defaultColor || '#00ff00';
    this.defaultTextColor = options.defaultTextColor || '#ffffff';
    this.defaultFontSize = options.defaultFontSize || 18;
    this.arrowWidth = options.arrowWidth || 4;
    this.boxPadding = options.boxPadding || 20;
  }

  /**
   * Generate SVG for an arrow
   */
  generateArrowSVG(annotation) {
    const { from, to, color = this.defaultColor, width = this.arrowWidth } = annotation;

    // Calculate arrow direction
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);

    // Arrowhead size
    const headLength = 20;
    const headWidth = 15;

    // Arrowhead points
    const headPoint1X = to.x - headLength * Math.cos(angle - Math.PI / 6);
    const headPoint1Y = to.y - headLength * Math.sin(angle - Math.PI / 6);
    const headPoint2X = to.x - headLength * Math.cos(angle + Math.PI / 6);
    const headPoint2Y = to.y - headLength * Math.sin(angle + Math.PI / 6);

    // Calculate bounding box
    const minX = Math.min(from.x, to.x, headPoint1X, headPoint2X);
    const maxX = Math.max(from.x, to.x, headPoint1X, headPoint2X);
    const minY = Math.min(from.y, to.y, headPoint1Y, headPoint2Y);
    const maxY = Math.max(from.y, to.y, headPoint1Y, headPoint2Y);

    const svgWidth = maxX - minX + 20;
    const svgHeight = maxY - minY + 20;

    // Adjust coordinates relative to bounding box
    const adjustX = (x) => x - minX + 10;
    const adjustY = (y) => y - minY + 10;

    const svg = `
      <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
            <feOffset dx="2" dy="2" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.5"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <line x1="${adjustX(from.x)}" y1="${adjustY(from.y)}"
              x2="${adjustX(to.x)}" y2="${adjustY(to.y)}"
              stroke="${color}" stroke-width="${width}"
              stroke-linecap="round" filter="url(#shadow)"/>
        <polygon points="${adjustX(to.x)},${adjustY(to.y)} ${adjustX(headPoint1X)},${adjustY(headPoint1Y)} ${adjustX(headPoint2X)},${adjustY(headPoint2Y)}"
                 fill="${color}" filter="url(#shadow)"/>
      </svg>
    `;

    return {
      input: Buffer.from(svg),
      top: Math.round(minY),
      left: Math.round(minX)
    };
  }

  /**
   * Generate SVG for a highlight box
   */
  generateBoxSVG(annotation) {
    const {
      position,
      color = this.defaultColor,
      width = 4,
      borderRadius = 8,
      style = 'solid' // 'solid', 'dashed', 'pulse'
    } = annotation;

    const { x, y, width: boxWidth, height: boxHeight } = position;

    const strokeDasharray = style === 'dashed' ? '10,5' : 'none';
    const pulseAnimation = style === 'pulse' ? `
      <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/>
    ` : '';

    const svg = `
      <svg width="${boxWidth + width * 2}" height="${boxHeight + width * 2}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <rect x="${width}" y="${width}" width="${boxWidth}" height="${boxHeight}"
              rx="${borderRadius}" ry="${borderRadius}"
              fill="none" stroke="${color}" stroke-width="${width}"
              stroke-dasharray="${strokeDasharray}"
              filter="url(#glow)">
          ${pulseAnimation}
        </rect>
      </svg>
    `;

    return {
      input: Buffer.from(svg),
      top: Math.round(y - width),
      left: Math.round(x - width)
    };
  }

  /**
   * Generate SVG for a circle highlight
   */
  generateCircleSVG(annotation) {
    const {
      position,
      color = this.defaultColor,
      width = 4
    } = annotation;

    const { x, y, width: diameter } = position;
    const radius = diameter / 2;

    const svg = `
      <svg width="${diameter + width * 2}" height="${diameter + width * 2}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <circle cx="${radius + width}" cy="${radius + width}" r="${radius}"
                fill="none" stroke="${color}" stroke-width="${width}"
                filter="url(#glow)">
          <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/>
        </circle>
      </svg>
    `;

    return {
      input: Buffer.from(svg),
      top: Math.round(y - width),
      left: Math.round(x - width)
    };
  }

  /**
   * Generate SVG for text label
   */
  generateTextSVG(annotation) {
    const {
      text,
      position,
      color = this.defaultTextColor,
      backgroundColor = '#333333',
      fontSize = this.defaultFontSize,
      fontWeight = 'bold',
      padding = this.boxPadding
    } = annotation;

    const { x, y } = position;

    // Estimate text width (rough approximation)
    const charWidth = fontSize * 0.6;
    const textWidth = text.length * charWidth;
    const boxWidth = textWidth + padding * 2;
    const boxHeight = fontSize + padding * 2;

    const svg = `
      <svg width="${boxWidth + 10}" height="${boxHeight + 10}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
            <feOffset dx="2" dy="2"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.6"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <rect x="5" y="5" width="${boxWidth}" height="${boxHeight}"
              rx="8" ry="8"
              fill="${backgroundColor}" filter="url(#shadow)"/>
        <text x="${5 + boxWidth / 2}" y="${5 + boxHeight / 2 + fontSize / 3}"
              font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}"
              fill="${color}" text-anchor="middle">${text}</text>
      </svg>
    `;

    return {
      input: Buffer.from(svg),
      top: Math.round(y),
      left: Math.round(x)
    };
  }

  /**
   * Generate SVG for a numbered step badge
   */
  generateStepBadgeSVG(stepNumber, position, color = '#2196F3') {
    const { x, y } = position;
    const size = 40;

    const svg = `
      <svg width="${size + 10}" height="${size + 10}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
            <feOffset dx="1" dy="1"/>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <circle cx="${size / 2 + 5}" cy="${size / 2 + 5}" r="${size / 2}"
                fill="${color}" filter="url(#shadow)"/>
        <text x="${size / 2 + 5}" y="${size / 2 + 13}"
              font-family="Arial, sans-serif" font-size="24" font-weight="bold"
              fill="white" text-anchor="middle">${stepNumber}</text>
      </svg>
    `;

    return {
      input: Buffer.from(svg),
      top: Math.round(y),
      left: Math.round(x)
    };
  }

  /**
   * Generate click/tap animation SVG
   */
  generateClickAnimationSVG(position, color = '#ff9800') {
    const { x, y } = position;
    const size = 60;

    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size / 2}" cy="${size / 2}" r="20"
                fill="none" stroke="${color}" stroke-width="3">
          <animate attributeName="r" from="10" to="25" dur="0.6s" repeatCount="indefinite"/>
          <animate attributeName="opacity" from="1" to="0" dur="0.6s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${size / 2}" cy="${size / 2}" r="10"
                fill="${color}" opacity="0.8"/>
      </svg>
    `;

    return {
      input: Buffer.from(svg),
      top: Math.round(y - size / 2),
      left: Math.round(x - size / 2)
    };
  }

  /**
   * Main annotation function
   */
  async annotate(inputPath, annotations, outputPath) {
    try {
      // Load the base image
      let image = sharp(inputPath);
      const metadata = await image.metadata();

      console.log(`[Annotator] Processing ${path.basename(inputPath)}...`);
      console.log(`[Annotator] Image size: ${metadata.width}x${metadata.height}`);
      console.log(`[Annotator] Annotations: ${annotations.length}`);

      // Prepare composite operations
      const composites = [];

      for (const annotation of annotations) {
        let composite = null;

        switch (annotation.type) {
          case 'arrow':
            composite = this.generateArrowSVG(annotation);
            console.log(`[Annotator]   + Arrow from (${annotation.from.x},${annotation.from.y}) to (${annotation.to.x},${annotation.to.y})`);
            break;

          case 'box':
            composite = this.generateBoxSVG(annotation);
            console.log(`[Annotator]   + Box at (${annotation.position.x},${annotation.position.y})`);
            break;

          case 'circle':
            composite = this.generateCircleSVG(annotation);
            console.log(`[Annotator]   + Circle at (${annotation.position.x},${annotation.position.y})`);
            break;

          case 'text':
            composite = this.generateTextSVG(annotation);
            console.log(`[Annotator]   + Text "${annotation.text}" at (${annotation.position.x},${annotation.position.y})`);
            break;

          case 'step':
            composite = this.generateStepBadgeSVG(annotation.stepNumber, annotation.position, annotation.color);
            console.log(`[Annotator]   + Step badge ${annotation.stepNumber} at (${annotation.position.x},${annotation.position.y})`);
            break;

          case 'click':
            composite = this.generateClickAnimationSVG(annotation.position, annotation.color);
            console.log(`[Annotator]   + Click animation at (${annotation.position.x},${annotation.position.y})`);
            break;

          default:
            console.warn(`[Annotator]   ⚠ Unknown annotation type: ${annotation.type}`);
        }

        if (composite) {
          composites.push(composite);
        }
      }

      // Apply all composites
      if (composites.length > 0) {
        image = image.composite(composites);
      }

      // Save annotated image
      await image.toFile(outputPath);

      const stats = await fs.stat(outputPath);
      console.log(`[Annotator] ✓ Saved to ${path.basename(outputPath)} (${(stats.size / 1024).toFixed(2)} KB)`);

      return {
        success: true,
        outputPath,
        fileSize: stats.size,
        annotationCount: annotations.length
      };

    } catch (error) {
      console.error(`[Annotator] ✗ Error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Batch annotate multiple screenshots
   */
  async annotateBatch(screenshots, outputDir) {
    const results = [];

    for (const screenshot of screenshots) {
      const outputPath = path.join(
        outputDir,
        `annotated-${path.basename(screenshot.inputPath)}`
      );

      const result = await this.annotate(
        screenshot.inputPath,
        screenshot.annotations,
        outputPath
      );

      results.push({
        ...result,
        inputPath: screenshot.inputPath
      });
    }

    return results;
  }
}

// CLI interface
if (require.main === module) {
  const annotator = new ScreenshotAnnotator();

  // Example usage
  const exampleScreenshot = process.argv[2];
  const exampleOutput = process.argv[3] || 'annotated-screenshot.png';

  if (!exampleScreenshot) {
    console.log('Screenshot Annotator\n');
    console.log('Usage:');
    console.log('  node screenshot-annotator.js <input.png> [output.png]\n');
    console.log('Example annotations:');
    console.log(`
      const annotations = [
        {
          type: 'arrow',
          from: { x: 100, y: 100 },
          to: { x: 300, y: 200 },
          color: '#00ff00'
        },
        {
          type: 'box',
          position: { x: 250, y: 150, width: 200, height: 100 },
          color: '#ff0000',
          style: 'pulse'
        },
        {
          type: 'text',
          text: 'Click here',
          position: { x: 100, y: 50 },
          color: '#ffffff',
          backgroundColor: '#333333'
        },
        {
          type: 'step',
          stepNumber: 1,
          position: { x: 50, y: 50 }
        }
      ];
    `);
    process.exit(0);
  }

  // Test with example annotations
  const exampleAnnotations = [
    {
      type: 'box',
      position: { x: 50, y: 50, width: 300, height: 100 },
      color: '#00ff00',
      style: 'pulse'
    },
    {
      type: 'text',
      text: 'Example Annotation',
      position: { x: 60, y: 20 }
    },
    {
      type: 'step',
      stepNumber: 1,
      position: { x: 10, y: 40 }
    }
  ];

  annotator.annotate(exampleScreenshot, exampleAnnotations, exampleOutput)
    .then(result => {
      if (result.success) {
        console.log('\n✅ Annotation complete!');
        process.exit(0);
      } else {
        console.error('\n❌ Annotation failed');
        process.exit(1);
      }
    });
}

module.exports = ScreenshotAnnotator;
