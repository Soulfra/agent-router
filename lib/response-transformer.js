/**
 * Response Transformer
 *
 * "Vortex Exit" - Applies domain transformations to generated code
 *
 * Responsibilities:
 * - Validate against domain style guide
 * - Detect anti-patterns
 * - Apply style transformations (indent, quotes, naming)
 * - Add documentation if required
 * - Return transformed code + metadata
 *
 * Note: This does basic transformations. For complex refactoring,
 * consider using AST-based tools like prettier or eslint --fix
 */

class ResponseTransformer {
  constructor(options = {}) {
    this.db = options.db;

    console.log('[ResponseTransformer] Initialized');
  }

  /**
   * Transform response according to domain style
   *
   * @param {string} response - Raw model response
   * @param {object} enrichedContext - Context from DomainContextEnricher
   * @returns {Promise<object>} - { transformed, violations, changes }
   */
  async transform(response, enrichedContext) {
    const { styleGuide, antiPatterns } = enrichedContext;

    const result = {
      original: response,
      transformed: response,
      violations: [],
      changes: [],
      antiPatternsDetected: []
    };

    try {
      // 1. Extract code blocks from response
      const codeBlocks = this._extractCodeBlocks(response);

      if (codeBlocks.length === 0) {
        console.log('[ResponseTransformer] No code blocks found, returning unchanged');
        return result;
      }

      // 2. Detect anti-patterns
      if (antiPatterns && antiPatterns.length > 0) {
        result.antiPatternsDetected = this._detectAntiPatterns(codeBlocks, antiPatterns);
      }

      // 3. Apply style transformations to each code block
      if (styleGuide) {
        for (const block of codeBlocks) {
          const transformed = this._applyStyleTransformations(block.code, styleGuide);

          if (transformed !== block.code) {
            // Replace in response
            result.transformed = result.transformed.replace(block.code, transformed);
            result.changes.push({
              type: 'style_applied',
              block: block.language || 'unknown',
              details: 'Applied domain style guide'
            });
          }
        }
      }

      // 4. Check for style violations
      if (styleGuide) {
        result.violations = this._checkStyleViolations(codeBlocks, styleGuide);
      }

      console.log(`[ResponseTransformer] Transformation complete: ${result.changes.length} changes, ${result.violations.length} violations, ${result.antiPatternsDetected.length} anti-patterns`);

      return result;

    } catch (error) {
      console.error('[ResponseTransformer] Transform error:', error.message);
      return result;
    }
  }

  /**
   * Extract code blocks from response
   * @private
   */
  _extractCodeBlocks(response) {
    const blocks = [];

    // Match markdown code blocks: ```language\ncode\n```
    const markdownRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = markdownRegex.exec(response)) !== null) {
      const language = match[1] || 'unknown';
      const code = match[2];

      blocks.push({
        language,
        code,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }

    return blocks;
  }

  /**
   * Detect anti-patterns in code
   * @private
   */
  _detectAntiPatterns(codeBlocks, antiPatterns) {
    const detected = [];

    for (const block of codeBlocks) {
      for (const antiPattern of antiPatterns) {
        // Check if anti-pattern is present
        if (antiPattern.auto_detect_pattern) {
          try {
            const regex = new RegExp(antiPattern.auto_detect_pattern, 'gi');
            if (regex.test(block.code)) {
              detected.push({
                antiPattern: antiPattern.anti_pattern_name,
                severity: antiPattern.severity,
                reason: antiPattern.why_bad,
                location: block.language
              });
            }
          } catch (error) {
            // Invalid regex, skip
          }
        } else {
          // Simple text match
          if (block.code.includes(antiPattern.bad_code_example)) {
            detected.push({
              antiPattern: antiPattern.anti_pattern_name,
              severity: antiPattern.severity,
              reason: antiPattern.why_bad,
              location: block.language
            });
          }
        }
      }
    }

    return detected;
  }

  /**
   * Apply style transformations
   * @private
   */
  _applyStyleTransformations(code, styleGuide) {
    let transformed = code;

    // 1. Fix indentation (simple approach - convert tabs to spaces or vice versa)
    if (styleGuide.indent_style === 'spaces' && styleGuide.indent_size) {
      const spaces = ' '.repeat(styleGuide.indent_size);
      transformed = transformed.replace(/\t/g, spaces);
    } else if (styleGuide.indent_style === 'tabs') {
      // Convert multiple spaces to tabs (heuristic)
      const spacesPattern = new RegExp(`^ {${styleGuide.indent_size || 2},}`, 'gm');
      transformed = transformed.replace(spacesPattern, (match) => {
        return '\t'.repeat(Math.floor(match.length / (styleGuide.indent_size || 2)));
      });
    }

    // 2. Fix quotes (single vs double)
    if (styleGuide.quote_style === 'single') {
      // Replace double quotes with single (simple heuristic, not perfect)
      transformed = transformed.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, "'$1'");
    } else if (styleGuide.quote_style === 'double') {
      // Replace single quotes with double
      transformed = transformed.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"');
    }

    // 3. Trailing commas
    if (styleGuide.trailing_commas === true) {
      // Add trailing commas to arrays/objects (basic heuristic)
      // This is complex and would benefit from AST parsing
      // Skipping for now
    }

    return transformed;
  }

  /**
   * Check for style violations
   * @private
   */
  _checkStyleViolations(codeBlocks, styleGuide) {
    const violations = [];

    for (const block of codeBlocks) {
      // 1. Check line length
      if (styleGuide.line_length) {
        const lines = block.code.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].length > styleGuide.line_length) {
            violations.push({
              type: 'line_too_long',
              line: i + 1,
              length: lines[i].length,
              max: styleGuide.line_length,
              severity: 'warning'
            });
          }
        }
      }

      // 2. Check for tabs vs spaces
      if (styleGuide.indent_style === 'spaces' && block.code.includes('\t')) {
        violations.push({
          type: 'uses_tabs',
          expected: 'spaces',
          severity: 'warning'
        });
      }

      // 3. Check for wrong quote style
      if (styleGuide.quote_style === 'single' && /"[^"]*"/.test(block.code)) {
        violations.push({
          type: 'wrong_quotes',
          expected: 'single',
          found: 'double',
          severity: 'info'
        });
      } else if (styleGuide.quote_style === 'double' && /'[^']*'/.test(block.code)) {
        violations.push({
          type: 'wrong_quotes',
          expected: 'double',
          found: 'single',
          severity: 'info'
        });
      }

      // 4. Check for missing docstrings (if required)
      if (styleGuide.requires_docstrings) {
        // Check for function definitions without docstrings
        const functionRegex = /function\s+\w+|const\s+\w+\s*=\s*\([^)]*\)\s*=>/g;
        const docstringRegex = /\/\*\*[\s\S]*?\*\/|'''[\s\S]*?'''|"""[\s\S]*?"""/g;

        const functions = (block.code.match(functionRegex) || []).length;
        const docstrings = (block.code.match(docstringRegex) || []).length;

        if (functions > docstrings) {
          violations.push({
            type: 'missing_docstrings',
            functions,
            docstrings,
            severity: 'warning'
          });
        }
      }

      // 5. Check naming conventions (basic heuristic)
      if (styleGuide.variable_case) {
        const varRegex = /(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        let match;

        while ((match = varRegex.exec(block.code)) !== null) {
          const varName = match[1];

          if (styleGuide.variable_case === 'camelCase' && !this._isCamelCase(varName)) {
            violations.push({
              type: 'wrong_naming_convention',
              variable: varName,
              expected: 'camelCase',
              severity: 'info'
            });
          } else if (styleGuide.variable_case === 'snake_case' && !this._isSnakeCase(varName)) {
            violations.push({
              type: 'wrong_naming_convention',
              variable: varName,
              expected: 'snake_case',
              severity: 'info'
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * Check if string is camelCase
   * @private
   */
  _isCamelCase(str) {
    return /^[a-z][a-zA-Z0-9]*$/.test(str);
  }

  /**
   * Check if string is snake_case
   * @private
   */
  _isSnakeCase(str) {
    return /^[a-z][a-z0-9_]*$/.test(str);
  }

  /**
   * Format transformation result for display
   */
  formatResult(result) {
    const { violations, changes, antiPatternsDetected } = result;

    let output = '';

    if (changes.length > 0) {
      output += '✅ Transformations Applied:\n';
      for (const change of changes) {
        output += `   - ${change.type}: ${change.details}\n`;
      }
      output += '\n';
    }

    if (antiPatternsDetected.length > 0) {
      output += '⚠️  Anti-Patterns Detected:\n';
      for (const ap of antiPatternsDetected) {
        output += `   - [${ap.severity}] ${ap.antiPattern}: ${ap.reason}\n`;
      }
      output += '\n';
    }

    if (violations.length > 0) {
      output += '📋 Style Violations:\n';
      for (const violation of violations.slice(0, 5)) {
        if (violation.type === 'line_too_long') {
          output += `   - Line ${violation.line}: ${violation.length} chars (max: ${violation.max})\n`;
        } else if (violation.type === 'wrong_quotes') {
          output += `   - Quote style: expected ${violation.expected}, found ${violation.found}\n`;
        } else if (violation.type === 'missing_docstrings') {
          output += `   - Missing docstrings: ${violation.functions - violation.docstrings} functions\n`;
        } else {
          output += `   - ${violation.type}\n`;
        }
      }

      if (violations.length > 5) {
        output += `   ... and ${violations.length - 5} more\n`;
      }
    }

    return output || 'No transformations needed';
  }
}

module.exports = ResponseTransformer;
