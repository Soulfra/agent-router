/**
 * Artifact Builder
 *
 * Builds production-ready artifacts from AI-generated code.
 * Supports:
 * - SVG logos and graphics
 * - HTML/CSS/JS components
 * - Complete pages
 * - Animations
 *
 * Features:
 * - Code validation and minification
 * - Preview generation
 * - Asset optimization
 * - Brand color injection
 */

const { v4: uuidv4 } = require('uuid');

class ArtifactBuilder {
  constructor(config = {}) {
    this.config = {
      outputDir: config.outputDir || '/tmp/artifacts',
      includePreview: config.includePreview !== false,
      minify: config.minify !== false
    };
  }

  /**
   * Build artifact from AI-generated code
   *
   * @param {String} type - Artifact type (logo, component, page, animation)
   * @param {String} code - AI-generated code
   * @param {Object} metadata - Domain colors, brand name, etc.
   * @returns {Object} - Built artifact with files
   */
  async build(type, code, metadata = {}) {
    const artifact = {
      id: uuidv4(),
      type,
      timestamp: new Date().toISOString(),
      files: [],
      preview: null,
      metadata
    };

    // Route to appropriate builder
    switch (type) {
      case 'logo':
      case 'svg':
        return await this.buildSVG(code, metadata, artifact);

      case 'component':
        return await this.buildComponent(code, metadata, artifact);

      case 'page':
        return await this.buildPage(code, metadata, artifact);

      case 'animation':
        return await this.buildAnimation(code, metadata, artifact);

      default:
        throw new Error(`Unsupported artifact type: ${type}`);
    }
  }

  /**
   * Build SVG logo/graphic
   */
  async buildSVG(code, metadata, artifact) {
    // Extract SVG from code (might be wrapped in HTML)
    const svgContent = this.extractSVG(code);

    // Inject brand colors if not present
    const enhancedSVG = this.injectBrandColors(svgContent, metadata);

    // Optimize SVG
    const optimized = this.optimizeSVG(enhancedSVG);

    // Create files
    artifact.files = [
      {
        name: `${metadata.domain || 'logo'}.svg`,
        content: optimized,
        type: 'image/svg+xml',
        size: optimized.length
      }
    ];

    // Generate PNG preview (placeholder - requires sharp or similar)
    if (this.config.includePreview) {
      artifact.preview = {
        type: 'svg',
        dataUrl: `data:image/svg+xml;base64,${Buffer.from(optimized).toString('base64')}`
      };
    }

    return artifact;
  }

  /**
   * Build HTML/CSS/JS component
   */
  async buildComponent(code, metadata, artifact) {
    // Extract HTML, CSS, JS from code
    const parsed = this.parseComponent(code);

    // Inject brand colors
    parsed.css = this.injectBrandColors(parsed.css, metadata);

    // Create standalone HTML file
    const standalone = this.createStandaloneHTML(parsed, metadata);

    artifact.files = [
      {
        name: `${metadata.brand || 'component'}.html`,
        content: standalone,
        type: 'text/html',
        size: standalone.length
      }
    ];

    // If component has separate files, add them
    if (parsed.css.length > 200) {
      artifact.files.push({
        name: `${metadata.brand || 'component'}.css`,
        content: parsed.css,
        type: 'text/css',
        size: parsed.css.length
      });
    }

    if (parsed.js && parsed.js.length > 100) {
      artifact.files.push({
        name: `${metadata.brand || 'component'}.js`,
        content: parsed.js,
        type: 'application/javascript',
        size: parsed.js.length
      });
    }

    // Generate preview
    if (this.config.includePreview) {
      artifact.preview = {
        type: 'html',
        url: `/artifacts/preview/${artifact.id}`,
        html: standalone
      };
    }

    return artifact;
  }

  /**
   * Build complete page
   */
  async buildPage(code, metadata, artifact) {
    // Parse full page structure
    const parsed = this.parsePage(code);

    // Inject metadata (title, description, etc.)
    const enhanced = this.injectPageMetadata(parsed, metadata);

    // Create index.html
    artifact.files = [
      {
        name: 'index.html',
        content: enhanced,
        type: 'text/html',
        size: enhanced.length
      }
    ];

    // Generate preview
    if (this.config.includePreview) {
      artifact.preview = {
        type: 'page',
        url: `/artifacts/preview/${artifact.id}`,
        html: enhanced
      };
    }

    return artifact;
  }

  /**
   * Build CSS/JS animation
   */
  async buildAnimation(code, metadata, artifact) {
    // Parse animation code
    const parsed = this.parseAnimation(code);

    // Create demo HTML with animation
    const demo = this.createAnimationDemo(parsed, metadata);

    artifact.files = [
      {
        name: 'animation.html',
        content: demo,
        type: 'text/html',
        size: demo.length
      }
    ];

    if (this.config.includePreview) {
      artifact.preview = {
        type: 'animation',
        url: `/artifacts/preview/${artifact.id}`,
        html: demo
      };
    }

    return artifact;
  }

  /**
   * Extract SVG from code (handles various formats)
   */
  extractSVG(code) {
    // Try to extract <svg>...</svg> tag
    const svgMatch = code.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      return svgMatch[0];
    }

    // If code is already SVG, return as-is
    if (code.trim().startsWith('<svg')) {
      return code;
    }

    // Generate basic SVG if not found
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <text x="100" y="100" text-anchor="middle" font-size="20">Logo</text>
</svg>`;
  }

  /**
   * Inject brand colors into SVG/CSS
   */
  injectBrandColors(content, metadata) {
    if (!metadata.colors) return content;

    const { primary, secondary } = metadata.colors;

    // Replace common color placeholders
    let enhanced = content;

    // Replace hex colors with brand colors
    if (primary) {
      enhanced = enhanced.replace(/#667eea/gi, primary);
      enhanced = enhanced.replace(/rgb\(102,\s*126,\s*234\)/gi, primary);
    }

    if (secondary) {
      enhanced = enhanced.replace(/#764ba2/gi, secondary);
      enhanced = enhanced.replace(/rgb\(118,\s*75,\s*162\)/gi, secondary);
    }

    // Replace CSS custom properties
    if (primary) {
      enhanced = enhanced.replace(/--primary-color:\s*[^;]+;/gi, `--primary-color: ${primary};`);
    }
    if (secondary) {
      enhanced = enhanced.replace(/--secondary-color:\s*[^;]+;/gi, `--secondary-color: ${secondary};`);
    }

    return enhanced;
  }

  /**
   * Optimize SVG (basic cleanup)
   */
  optimizeSVG(svg) {
    // Remove comments
    let optimized = svg.replace(/<!--[\s\S]*?-->/g, '');

    // Remove extra whitespace
    optimized = optimized.replace(/\s+/g, ' ');

    // Remove empty attributes
    optimized = optimized.replace(/\s+[a-z-]+=""\s*/gi, ' ');

    return optimized.trim();
  }

  /**
   * Parse component into HTML, CSS, JS
   */
  parseComponent(code) {
    const result = {
      html: '',
      css: '',
      js: ''
    };

    // Extract <style> tags
    const styleMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch) {
      result.css = styleMatch[1].trim();
    }

    // Extract <script> tags
    const scriptMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch) {
      result.js = scriptMatch[1].trim();
    }

    // Extract HTML (remove style and script tags)
    result.html = code
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .trim();

    return result;
  }

  /**
   * Create standalone HTML file from component parts
   */
  createStandaloneHTML(parsed, metadata) {
    const brandName = metadata.brand || 'Component';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandName} Component</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      padding: 20px;
    }

    ${parsed.css}
  </style>
</head>
<body>
  ${parsed.html}

  ${parsed.js ? `<script>${parsed.js}</script>` : ''}
</body>
</html>`;
  }

  /**
   * Parse full page HTML
   */
  parsePage(code) {
    // If already a complete HTML document, return as-is
    if (code.includes('<!DOCTYPE') || code.includes('<html')) {
      return code;
    }

    // Otherwise wrap in HTML structure
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page</title>
</head>
<body>
  ${code}
</body>
</html>`;
  }

  /**
   * Inject page metadata (title, description, etc.)
   */
  injectPageMetadata(html, metadata) {
    let enhanced = html;

    // Inject title
    if (metadata.brand) {
      enhanced = enhanced.replace(/<title>.*?<\/title>/i, `<title>${metadata.brand}</title>`);
    }

    // Inject meta description
    if (metadata.description) {
      const metaTag = `<meta name="description" content="${metadata.description}">`;
      enhanced = enhanced.replace('</head>', `  ${metaTag}\n</head>`);
    }

    // Inject brand colors as CSS variables
    if (metadata.colors) {
      const colorVars = `<style>
  :root {
    --primary-color: ${metadata.colors.primary};
    --secondary-color: ${metadata.colors.secondary};
  }
</style>`;
      enhanced = enhanced.replace('</head>', `  ${colorVars}\n</head>`);
    }

    return enhanced;
  }

  /**
   * Parse animation code
   */
  parseAnimation(code) {
    // Similar to parseComponent but focused on animations
    return this.parseComponent(code);
  }

  /**
   * Create animation demo HTML
   */
  createAnimationDemo(parsed, metadata) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${metadata.brand || 'Animation'} Demo</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f5f5f5;
    }

    ${parsed.css}
  </style>
</head>
<body>
  ${parsed.html}

  ${parsed.js ? `<script>${parsed.js}</script>` : ''}
</body>
</html>`;
  }

  /**
   * Validate artifact before deployment
   */
  validate(artifact) {
    const errors = [];

    if (!artifact.files || artifact.files.length === 0) {
      errors.push('No files generated');
    }

    artifact.files.forEach((file, index) => {
      if (!file.name) {
        errors.push(`File ${index} missing name`);
      }
      if (!file.content || file.content.length === 0) {
        errors.push(`File ${index} has empty content`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = ArtifactBuilder;
