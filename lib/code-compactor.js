/**
 * Code Compactor
 *
 * Minifies and compresses HTML, CSS, and JavaScript code
 * Creates "5html" single-file format (HTML5 with inline CSS/JS)
 * Optimizes for AI token efficiency
 */

class CodeCompactor {
  constructor(options = {}) {
    this.options = {
      minifyHTML: options.minifyHTML !== false,
      minifyCSS: options.minifyCSS !== false,
      minifyJS: options.minifyJS !== false,
      removeComments: options.removeComments !== false,
      combineFiles: options.combineFiles !== false,
      aggressiveMinification: options.aggressiveMinification || false
    };
  }

  /**
   * Compact a full project
   * @param {Object} project - { html, css, js, files }
   * @returns {Object} Compacted project with stats
   */
  compact(project) {
    const original = {
      html: project.html || '',
      css: project.css || '',
      js: project.js || ''
    };

    // Calculate original sizes
    const originalSize = this._calculateSize(original);
    const originalTokens = this._estimateTokens(original);

    // Compact each part
    const compacted = {
      html: this.compactHTML(original.html),
      css: this.compactCSS(original.css),
      js: this.compactJS(original.js)
    };

    // Create single-file "5html" format
    const html5File = this.createHTML5SingleFile({
      html: compacted.html,
      css: compacted.css,
      js: compacted.js,
      title: project.title || 'Compacted Project'
    });

    // Calculate compacted sizes
    const compactedSize = this._calculateSize(compacted);
    const compactedTokens = this._estimateTokens(compacted);

    // Calculate savings
    const stats = {
      original: {
        size: originalSize,
        tokens: originalTokens,
        html: original.html.length,
        css: original.css.length,
        js: original.js.length
      },
      compacted: {
        size: compactedSize,
        tokens: compactedTokens,
        html: compacted.html.length,
        css: compacted.css.length,
        js: compacted.js.length
      },
      html5File: {
        size: html5File.length,
        tokens: this._estimateTokens({ html: html5File })
      },
      reduction: {
        size: Math.round(((originalSize - compactedSize) / originalSize) * 100),
        tokens: Math.round(((originalTokens - compactedTokens) / originalTokens) * 100)
      },
      timestamp: new Date().toISOString()
    };

    return {
      original,
      compacted,
      html5File,
      stats
    };
  }

  /**
   * Compact HTML
   */
  compactHTML(html) {
    if (!html || !this.options.minifyHTML) return html;

    let compacted = html;

    // Remove comments
    if (this.options.removeComments) {
      compacted = compacted.replace(/<!--[\s\S]*?-->/g, '');
    }

    // Remove whitespace between tags
    compacted = compacted.replace(/>\s+</g, '><');

    // Remove leading/trailing whitespace
    compacted = compacted.replace(/^\s+|\s+$/gm, '');

    // Remove empty lines
    compacted = compacted.replace(/\n\s*\n/g, '\n');

    // Aggressive: Remove all newlines (single line HTML)
    if (this.options.aggressiveMinification) {
      compacted = compacted.replace(/\n/g, '');
    }

    return compacted.trim();
  }

  /**
   * Compact CSS
   */
  compactCSS(css) {
    if (!css || !this.options.minifyCSS) return css;

    let compacted = css;

    // Remove comments
    if (this.options.removeComments) {
      compacted = compacted.replace(/\/\*[\s\S]*?\*\//g, '');
    }

    // Remove whitespace around selectors and properties
    compacted = compacted.replace(/\s*{\s*/g, '{');
    compacted = compacted.replace(/\s*}\s*/g, '}');
    compacted = compacted.replace(/\s*:\s*/g, ':');
    compacted = compacted.replace(/\s*;\s*/g, ';');
    compacted = compacted.replace(/;\s*}/g, '}'); // Remove last semicolon before }

    // Remove empty rules
    compacted = compacted.replace(/[^{}]+{\s*}/g, '');

    // Compress colors (e.g., #ffffff -> #fff)
    compacted = compacted.replace(/#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3/g, '#$1$2$3');

    // Remove unnecessary zeros (0.5 -> .5)
    compacted = compacted.replace(/\b0\.(\d+)/g, '.$1');

    // Remove units from zero values (0px -> 0)
    compacted = compacted.replace(/\b0(?:px|em|rem|%|vh|vw)\b/g, '0');

    // Remove leading/trailing whitespace
    compacted = compacted.replace(/^\s+|\s+$/gm, '');

    // Remove empty lines
    compacted = compacted.replace(/\n\s*\n/g, '\n');

    // Aggressive: Single line CSS
    if (this.options.aggressiveMinification) {
      compacted = compacted.replace(/\n/g, '');
    }

    return compacted.trim();
  }

  /**
   * Compact JavaScript
   */
  compactJS(js) {
    if (!js || !this.options.minifyJS) return js;

    let compacted = js;

    // Remove single-line comments
    if (this.options.removeComments) {
      compacted = compacted.replace(/\/\/.*$/gm, '');
    }

    // Remove multi-line comments
    if (this.options.removeComments) {
      compacted = compacted.replace(/\/\*[\s\S]*?\*\//g, '');
    }

    // Remove leading/trailing whitespace
    compacted = compacted.replace(/^\s+|\s+$/gm, '');

    // Remove empty lines
    compacted = compacted.replace(/\n\s*\n/g, '\n');

    // Compress whitespace (but preserve necessary spaces)
    // Be careful not to break valid JS syntax
    compacted = compacted.replace(/\s+/g, ' ');

    // Remove spaces around operators (careful with regex)
    compacted = compacted.replace(/\s*([=+\-*/<>!&|,;{}()[\]])\s*/g, '$1');

    // Aggressive: Remove all newlines (single line JS)
    if (this.options.aggressiveMinification) {
      compacted = compacted.replace(/\n/g, '');
    }

    return compacted.trim();
  }

  /**
   * Create HTML5 single-file format
   * Combines HTML, CSS, and JS into one file
   */
  createHTML5SingleFile(parts) {
    const { html, css, js, title } = parts;

    // Extract body content from HTML if it has full document structure
    let bodyContent = html;
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      bodyContent = bodyMatch[1].trim();
    }

    // Build single-file HTML5
    const html5 = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${css ? `<style>${css}</style>` : ''}
</head>
<body>
${bodyContent}
${js ? `<script>${js}</script>` : ''}
</body>
</html>`;

    // Minify the combined HTML
    return this.compactHTML(html5);
  }

  /**
   * Extract separate files from single HTML file
   * Opposite of createHTML5SingleFile
   */
  extractFromHTML(html) {
    const extracted = {
      html: '',
      css: '',
      js: ''
    };

    // Extract CSS from <style> tags
    const styleMatches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    if (styleMatches) {
      extracted.css = styleMatches
        .map(m => m.replace(/<\/?style[^>]*>/gi, ''))
        .join('\n\n');
    }

    // Extract JavaScript from <script> tags
    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scriptMatches) {
      extracted.js = scriptMatches
        .map(m => m.replace(/<\/?script[^>]*>/gi, ''))
        .join('\n\n');
    }

    // Extract HTML (remove styles and scripts)
    extracted.html = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

    return extracted;
  }

  /**
   * Calculate total size in bytes
   */
  _calculateSize(parts) {
    return Object.values(parts).reduce((total, content) => {
      return total + (typeof content === 'string' ? content.length : 0);
    }, 0);
  }

  /**
   * Estimate token count (rough approximation)
   * Most tokenizers: 1 token ≈ 4 characters
   */
  _estimateTokens(parts) {
    const totalChars = this._calculateSize(parts);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Compact a full directory of files
   */
  compactDirectory(files) {
    const project = {
      html: '',
      css: '',
      js: '',
      title: 'Project'
    };

    // Aggregate files by type
    for (const [filename, content] of Object.entries(files)) {
      const ext = filename.split('.').pop().toLowerCase();

      switch (ext) {
        case 'html':
        case 'htm':
          project.html += content + '\n';
          break;

        case 'css':
          project.css += content + '\n';
          break;

        case 'js':
          project.js += content + '\n';
          break;
      }
    }

    return this.compact(project);
  }

  /**
   * Generate compaction report
   */
  generateReport(compactionResult) {
    const { stats } = compactionResult;

    const report = {
      summary: {
        originalSize: `${(stats.original.size / 1024).toFixed(2)} KB`,
        compactedSize: `${(stats.compacted.size / 1024).toFixed(2)} KB`,
        html5Size: `${(stats.html5File.size / 1024).toFixed(2)} KB`,
        reductionPercentage: `${stats.reduction.size}%`,
        tokenSavings: `${stats.reduction.tokens}%`
      },
      breakdown: {
        html: {
          original: stats.original.html,
          compacted: stats.compacted.html,
          reduction: Math.round(((stats.original.html - stats.compacted.html) / stats.original.html) * 100) + '%'
        },
        css: {
          original: stats.original.css,
          compacted: stats.compacted.css,
          reduction: Math.round(((stats.original.css - stats.compacted.css) / stats.original.css) * 100) + '%'
        },
        js: {
          original: stats.original.js,
          compacted: stats.compacted.js,
          reduction: Math.round(((stats.original.js - stats.compacted.js) / stats.original.js) * 100) + '%'
        }
      },
      tokenEstimate: {
        originalTokens: stats.original.tokens,
        compactedTokens: stats.compacted.tokens,
        tokensSaved: stats.original.tokens - stats.compacted.tokens,
        costSavings: this._estimateCostSavings(stats.original.tokens, stats.compacted.tokens)
      },
      timestamp: stats.timestamp
    };

    return report;
  }

  /**
   * Estimate cost savings (based on typical AI model pricing)
   * Assuming ~$0.03 per 1K tokens
   */
  _estimateCostSavings(originalTokens, compactedTokens) {
    const tokensSaved = originalTokens - compactedTokens;
    const costPer1kTokens = 0.03;
    const savings = (tokensSaved / 1000) * costPer1kTokens;

    return {
      tokensSaved,
      dollarsSaved: savings.toFixed(4),
      percentSaved: Math.round(((originalTokens - compactedTokens) / originalTokens) * 100)
    };
  }

  /**
   * Format compaction result for display
   */
  formatForDisplay(compactionResult) {
    const report = this.generateReport(compactionResult);

    return `
📦 Compaction Results
${'='.repeat(50)}

📊 Summary:
   Original Size:    ${report.summary.originalSize}
   Compacted Size:   ${report.summary.compactedSize}
   HTML5 File:       ${report.summary.html5Size}
   Reduction:        ${report.summary.reductionPercentage}

💰 Token Savings:
   Original Tokens:  ${report.tokenEstimate.originalTokens.toLocaleString()}
   Compacted Tokens: ${report.tokenEstimate.compactedTokens.toLocaleString()}
   Tokens Saved:     ${report.tokenEstimate.tokensSaved.toLocaleString()}
   Cost Savings:     $${report.tokenEstimate.dollarsSaved}
   Reduction:        ${report.tokenEstimate.percentSaved}%

📁 Breakdown:
   HTML:  ${report.breakdown.html.original} → ${report.breakdown.html.compacted} (${report.breakdown.html.reduction})
   CSS:   ${report.breakdown.css.original} → ${report.breakdown.css.compacted} (${report.breakdown.css.reduction})
   JS:    ${report.breakdown.js.original} → ${report.breakdown.js.compacted} (${report.breakdown.js.reduction})

⏰ Timestamp: ${report.timestamp}
`;
  }
}

module.exports = CodeCompactor;
