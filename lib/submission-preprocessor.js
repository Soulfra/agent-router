/**
 * Submission Preprocessor
 *
 * Separates content by type to avoid clogging AI pipelines
 * - Strips CSS from logic evaluation
 * - Routes content to appropriate grading tracks
 */

class SubmissionPreprocessor {
  constructor() {
    // Content type patterns
    this.patterns = {
      css: /(?:\/\*[\s\S]*?\*\/|<style[^>]*>[\s\S]*?<\/style>|\.[\w-]+\s*\{[^}]*\})/gi,
      html: /(?:<[^>]+>)/gi,
      javascript: /(?:function\s+\w+|const\s+\w+\s*=|class\s+\w+|=>)/gi,
      python: /(?:def\s+\w+|class\s+\w+|import\s+\w+|from\s+\w+)/gi,
      comments: {
        js: /(?:\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
        python: /#.*$/gm,
        css: /\/\*[\s\S]*?\*\//gm
      }
    };
  }

  /**
   * Main preprocessing function
   * Separates submission into tracks
   */
  preprocessSubmission(rawContent, fileName = '') {
    const fileExt = this.getFileExtension(fileName);
    const contentType = this.detectContentType(rawContent, fileExt);

    const separated = {
      raw: rawContent,
      type: contentType,
      tracks: {}
    };

    switch (contentType) {
      case 'full-stack':
        // Web app with HTML, CSS, and JS
        separated.tracks = this.separateFullStack(rawContent);
        break;

      case 'python':
        // Pure Python code
        separated.tracks = {
          logic: this.cleanCode(rawContent, 'python'),
          raw_python: rawContent
        };
        break;

      case 'javascript':
        // Pure JavaScript
        separated.tracks = {
          logic: this.cleanCode(rawContent, 'javascript'),
          raw_javascript: rawContent
        };
        break;

      case 'css':
        // Pure CSS/styling
        separated.tracks = {
          visual: rawContent,
          raw_css: rawContent
        };
        break;

      case 'audio':
        // Audio synthesis code
        separated.tracks = {
          audio: rawContent,
          logic: this.cleanCode(rawContent, 'javascript'), // Audio often uses JS
          raw_audio: rawContent
        };
        break;

      default:
        // Unknown type - store as-is
        separated.tracks = {
          unknown: rawContent
        };
    }

    // Calculate sizes for each track
    separated.sizes = {};
    for (const [track, content] of Object.entries(separated.tracks)) {
      separated.sizes[track] = content.length;
    }

    // Metadata
    separated.metadata = {
      originalSize: rawContent.length,
      processedSize: this.getTotalProcessedSize(separated.tracks),
      reduction: this.calculateReduction(rawContent.length, separated.tracks),
      timestamp: new Date().toISOString()
    };

    return separated;
  }

  /**
   * Separate full-stack web app into HTML, CSS, JS
   */
  separateFullStack(content) {
    const tracks = {
      html: '',
      css: '',
      javascript: '',
      visual: '',  // CSS for visual grading
      logic: ''    // JS for logic grading
    };

    // Extract CSS (both <style> tags and inline styles)
    const styleMatches = content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    if (styleMatches) {
      tracks.css = styleMatches.map(m => m.replace(/<\/?style[^>]*>/gi, '')).join('\n\n');
      tracks.visual = tracks.css;
    }

    // Extract JavaScript (both <script> tags and inline)
    const scriptMatches = content.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scriptMatches) {
      tracks.javascript = scriptMatches.map(m => m.replace(/<\/?script[^>]*>/gi, '')).join('\n\n');
      tracks.logic = this.cleanCode(tracks.javascript, 'javascript');
    }

    // Extract HTML (remove scripts and styles)
    tracks.html = content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

    return tracks;
  }

  /**
   * Clean code for logic evaluation (remove comments, whitespace)
   */
  cleanCode(code, language = 'javascript') {
    let cleaned = code;

    // Remove comments based on language
    switch (language) {
      case 'javascript':
      case 'typescript':
        cleaned = cleaned.replace(this.patterns.comments.js, '');
        break;

      case 'python':
        cleaned = cleaned.replace(this.patterns.comments.python, '');
        break;

      case 'css':
        cleaned = cleaned.replace(this.patterns.comments.css, '');
        break;
    }

    // Remove excessive whitespace
    cleaned = cleaned
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    // Remove empty lines
    cleaned = cleaned.replace(/\n\s*\n/g, '\n');

    return cleaned;
  }

  /**
   * Strip CSS from mixed content (for logic evaluation)
   */
  stripCSS(content) {
    // Remove <style> tags and their content
    let stripped = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove inline style attributes
    stripped = stripped.replace(/\s+style="[^"]*"/gi, '');

    // Remove CSS rules (standalone)
    stripped = stripped.replace(/\.[\w-]+\s*\{[^}]*\}/gi, '');

    // Remove CSS comments
    stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');

    return stripped;
  }

  /**
   * Extract only CSS from content
   */
  extractCSS(content) {
    const cssChunks = [];

    // Extract from <style> tags
    const styleMatches = content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    if (styleMatches) {
      cssChunks.push(...styleMatches.map(m => m.replace(/<\/?style[^>]*>/gi, '')));
    }

    // Extract standalone CSS rules
    const ruleMatches = content.match(/\.[\w-]+\s*\{[^}]*\}/gi);
    if (ruleMatches) {
      cssChunks.push(...ruleMatches);
    }

    return cssChunks.join('\n\n');
  }

  /**
   * Detect content type from content and filename
   */
  detectContentType(content, fileExtension = '') {
    // Check file extension first
    const ext = fileExtension.toLowerCase();

    if (ext === '.py') return 'python';
    if (ext === '.js') return 'javascript';
    if (ext === '.css') return 'css';
    if (ext === '.html' || ext === '.htm') return 'full-stack';

    // Analyze content patterns
    const hasHTML = /<[^>]+>/.test(content);
    const hasCSS = /\{[^}]*:[^}]+\}/.test(content) || /<style/.test(content);
    const hasJS = /function|const|let|var|=>/.test(content) || /<script/.test(content);
    const hasPython = /def\s+\w+|class\s+\w+|import\s+/.test(content);
    const hasAudio = /audio|AudioContext|createOscillator|frequency|sound/.test(content);

    if (hasHTML && (hasCSS || hasJS)) return 'full-stack';
    if (hasPython) return 'python';
    if (hasAudio) return 'audio';
    if (hasJS && !hasHTML) return 'javascript';
    if (hasCSS && !hasHTML && !hasJS) return 'css';

    return 'unknown';
  }

  /**
   * Get file extension from filename
   */
  getFileExtension(fileName) {
    if (!fileName) return '';
    const match = fileName.match(/\.[^.]+$/);
    return match ? match[0] : '';
  }

  /**
   * Calculate total size of processed tracks
   */
  getTotalProcessedSize(tracks) {
    return Object.values(tracks)
      .filter(content => typeof content === 'string')
      .reduce((total, content) => total + content.length, 0);
  }

  /**
   * Calculate reduction percentage
   */
  calculateReduction(originalSize, tracks) {
    // Calculate size of logic/code tracks only (what actually gets sent to AI)
    const relevantTracks = ['logic', 'audio'];
    const processedSize = Object.entries(tracks)
      .filter(([track]) => relevantTracks.includes(track))
      .reduce((total, [, content]) => total + content.length, 0);

    if (processedSize === 0) return 0;

    const reduction = ((originalSize - processedSize) / originalSize) * 100;
    return Math.round(reduction * 10) / 10; // Round to 1 decimal
  }

  /**
   * Determine which grading tracks to use
   */
  determineGradingTracks(preprocessed) {
    const tracks = [];

    if (preprocessed.tracks.visual || preprocessed.tracks.css) {
      tracks.push('visual');
    }

    if (preprocessed.tracks.logic || preprocessed.tracks.javascript || preprocessed.tracks.python) {
      tracks.push('logic');
    }

    if (preprocessed.tracks.audio) {
      tracks.push('audio');
    }

    if (tracks.length === 0) {
      tracks.push('general'); // Fallback
    }

    return tracks;
  }

  /**
   * Get submission info for display
   */
  getSubmissionInfo(preprocessed) {
    const tracks = this.determineGradingTracks(preprocessed);

    return {
      type: preprocessed.type,
      originalSize: preprocessed.metadata.originalSize,
      processedSize: preprocessed.metadata.processedSize,
      reduction: preprocessed.metadata.reduction,
      gradingTracks: tracks,
      breakdown: preprocessed.sizes
    };
  }

  /**
   * Prepare content for specific grading track
   */
  prepareForTrack(preprocessed, track) {
    switch (track) {
      case 'visual':
        return preprocessed.tracks.visual || preprocessed.tracks.css || '';

      case 'logic':
        return preprocessed.tracks.logic || preprocessed.tracks.javascript || preprocessed.tracks.python || '';

      case 'audio':
        return preprocessed.tracks.audio || '';

      default:
        return preprocessed.raw;
    }
  }

  /**
   * Extract metadata about code structure
   */
  extractCodeMetadata(code, language) {
    const metadata = {
      language,
      lineCount: code.split('\n').length,
      characterCount: code.length,
      functions: 0,
      classes: 0,
      imports: 0
    };

    // Count functions
    if (language === 'python') {
      metadata.functions = (code.match(/def\s+\w+/g) || []).length;
      metadata.classes = (code.match(/class\s+\w+/g) || []).length;
      metadata.imports = (code.match(/(?:import|from)\s+\w+/g) || []).length;
    } else if (language === 'javascript') {
      metadata.functions = (code.match(/function\s+\w+|const\s+\w+\s*=\s*(?:\([^)]*\)|[\w,\s]+)\s*=>/g) || []).length;
      metadata.classes = (code.match(/class\s+\w+/g) || []).length;
      metadata.imports = (code.match(/import\s+.*from/g) || []).length;
    }

    return metadata;
  }

  /**
   * Extract CSS metadata
   */
  extractCSSMetadata(css) {
    return {
      ruleCount: (css.match(/\{[^}]*\}/g) || []).length,
      selectorCount: (css.match(/[^{}\s]+(?=\s*\{)/g) || []).length,
      colorCount: (css.match(/#[0-9a-fA-F]{3,6}|rgb|hsl/g) || []).length,
      characterCount: css.length,
      hasAnimations: /animation|@keyframes|transition/.test(css),
      hasGridOrFlex: /grid|flex/.test(css)
    };
  }
}

module.exports = SubmissionPreprocessor;
