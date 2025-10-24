/**
 * Calculator Engine
 *
 * Evaluates mathematical expressions safely.
 * Supports basic arithmetic, advanced functions, and formatting.
 *
 * Examples:
 * - "2 + 2" → 4
 * - "sqrt(16)" → 4
 * - "sin(45)" → 0.7071...
 * - "50% of 100" → 50
 */

class CalculatorEngine {
  constructor() {
    // Math constants
    this.constants = {
      pi: Math.PI,
      e: Math.E,
      phi: (1 + Math.sqrt(5)) / 2  // Golden ratio
    };

    // Supported functions
    this.functions = {
      // Trigonometry
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      asin: Math.asin,
      acos: Math.acos,
      atan: Math.atan,

      // Logarithms
      log: Math.log10,
      ln: Math.log,
      log2: Math.log2,

      // Power & roots
      sqrt: Math.sqrt,
      cbrt: Math.cbrt,
      pow: Math.pow,
      exp: Math.exp,

      // Rounding
      abs: Math.abs,
      ceil: Math.ceil,
      floor: Math.floor,
      round: Math.round,

      // Min/Max
      min: Math.min,
      max: Math.max,

      // Random
      random: Math.random
    };
  }

  /**
   * Calculate result from expression
   * @param {string} expression - Math expression
   * @returns {number} Result
   */
  calculate(expression) {
    // Preprocess expression
    let processed = this.preprocess(expression);

    try {
      // Evaluate safely
      const result = this.evaluate(processed);

      // Validate result
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Invalid result');
      }

      return result;
    } catch (error) {
      throw new Error(`Calculation error: ${error.message}`);
    }
  }

  /**
   * Preprocess expression
   * - Handle percentage operations
   * - Replace constants
   * - Convert implicit multiplication
   */
  preprocess(expression) {
    let expr = expression.trim();

    // Handle "X% of Y" → (X/100) * Y
    expr = expr.replace(/(\d+\.?\d*)\s*%\s*of\s*(\d+\.?\d*)/gi, '($1/100)*$2');

    // Handle "X%" → X/100
    expr = expr.replace(/(\d+\.?\d*)%/g, '($1/100)');

    // Replace constants (case-insensitive)
    for (const [name, value] of Object.entries(this.constants)) {
      const regex = new RegExp(`\\b${name}\\b`, 'gi');
      expr = expr.replace(regex, value.toString());
    }

    // Convert implicit multiplication: 2(3+4) → 2*(3+4)
    expr = expr.replace(/(\d)\(/g, '$1*(');

    // Convert implicit multiplication: (3+4)5 → (3+4)*5
    expr = expr.replace(/\)(\d)/g, ')*$1');

    // Convert ^ to ** for exponentiation
    expr = expr.replace(/\^/g, '**');

    return expr;
  }

  /**
   * Evaluate expression safely
   * Uses a custom evaluator instead of eval() for security
   */
  evaluate(expression) {
    // Tokenize
    const tokens = this.tokenize(expression);

    // Convert to RPN (Reverse Polish Notation)
    const rpn = this.toRPN(tokens);

    // Evaluate RPN
    return this.evaluateRPN(rpn);
  }

  /**
   * Tokenize expression
   */
  tokenize(expression) {
    const tokens = [];
    let current = '';
    let i = 0;

    while (i < expression.length) {
      const char = expression[i];

      // Skip whitespace
      if (/\s/.test(char)) {
        if (current) {
          tokens.push(this.identifyToken(current));
          current = '';
        }
        i++;
        continue;
      }

      // Numbers (including decimals)
      if (/[\d.]/.test(char)) {
        current += char;
        i++;
        continue;
      }

      // Letters (functions or constants)
      if (/[a-zA-Z]/.test(char)) {
        current += char;
        i++;
        continue;
      }

      // Operators and parentheses
      if (/[+\-*\/()^]/.test(char)) {
        if (current) {
          tokens.push(this.identifyToken(current));
          current = '';
        }
        tokens.push({ type: 'operator', value: char });
        i++;
        continue;
      }

      // Handle ** for exponentiation
      if (char === '*' && expression[i + 1] === '*') {
        if (current) {
          tokens.push(this.identifyToken(current));
          current = '';
        }
        tokens.push({ type: 'operator', value: '**' });
        i += 2;
        continue;
      }

      // Unknown character
      throw new Error(`Invalid character: ${char}`);
    }

    // Add last token
    if (current) {
      tokens.push(this.identifyToken(current));
    }

    return tokens;
  }

  /**
   * Identify token type
   */
  identifyToken(str) {
    // Number
    if (/^[\d.]+$/.test(str)) {
      return { type: 'number', value: parseFloat(str) };
    }

    // Function
    if (this.functions[str]) {
      return { type: 'function', value: str };
    }

    // Constant
    if (this.constants[str]) {
      return { type: 'number', value: this.constants[str] };
    }

    throw new Error(`Unknown identifier: ${str}`);
  }

  /**
   * Convert tokens to Reverse Polish Notation using Shunting Yard algorithm
   */
  toRPN(tokens) {
    const output = [];
    const operators = [];

    const precedence = {
      '+': 1,
      '-': 1,
      '*': 2,
      '/': 2,
      '**': 3,
      '^': 3
    };

    for (const token of tokens) {
      if (token.type === 'number') {
        output.push(token);
      } else if (token.type === 'function') {
        operators.push(token);
      } else if (token.type === 'operator') {
        if (token.value === '(') {
          operators.push(token);
        } else if (token.value === ')') {
          // Pop until '('
          while (operators.length > 0 && operators[operators.length - 1].value !== '(') {
            output.push(operators.pop());
          }
          operators.pop(); // Remove '('

          // If there's a function, pop it
          if (operators.length > 0 && operators[operators.length - 1].type === 'function') {
            output.push(operators.pop());
          }
        } else {
          // Regular operator
          while (
            operators.length > 0 &&
            operators[operators.length - 1].type === 'operator' &&
            operators[operators.length - 1].value !== '(' &&
            precedence[operators[operators.length - 1].value] >= precedence[token.value]
          ) {
            output.push(operators.pop());
          }
          operators.push(token);
        }
      }
    }

    // Pop remaining operators
    while (operators.length > 0) {
      output.push(operators.pop());
    }

    return output;
  }

  /**
   * Evaluate RPN expression
   */
  evaluateRPN(rpn) {
    const stack = [];

    for (const token of rpn) {
      if (token.type === 'number') {
        stack.push(token.value);
      } else if (token.type === 'operator') {
        const b = stack.pop();
        const a = stack.pop();

        switch (token.value) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          case '/':
            if (b === 0) throw new Error('Division by zero');
            stack.push(a / b);
            break;
          case '**':
          case '^':
            stack.push(Math.pow(a, b));
            break;
          default:
            throw new Error(`Unknown operator: ${token.value}`);
        }
      } else if (token.type === 'function') {
        const arg = stack.pop();
        const func = this.functions[token.value];

        if (!func) {
          throw new Error(`Unknown function: ${token.value}`);
        }

        stack.push(func(arg));
      }
    }

    if (stack.length !== 1) {
      throw new Error('Invalid expression');
    }

    return stack[0];
  }

  /**
   * Format result for display
   * @param {number} result - Calculation result
   * @param {object} options - Formatting options
   * @returns {string} Formatted result
   */
  format(result, options = {}) {
    const {
      precision = 10,
      maxDecimals = 6,
      notation = 'auto'  // 'auto', 'fixed', 'scientific'
    } = options;

    // Handle special values
    if (!isFinite(result)) {
      return result.toString();
    }

    // Round to precision
    let rounded = parseFloat(result.toPrecision(precision));

    // Limit decimal places
    const decimals = rounded.toString().split('.')[1];
    if (decimals && decimals.length > maxDecimals) {
      rounded = parseFloat(rounded.toFixed(maxDecimals));
    }

    // Choose notation
    if (notation === 'scientific' || (notation === 'auto' && (Math.abs(rounded) > 1e9 || Math.abs(rounded) < 1e-6))) {
      return rounded.toExponential(maxDecimals);
    }

    return rounded.toString();
  }

  /**
   * Get list of supported functions
   */
  getSupportedFunctions() {
    return Object.keys(this.functions);
  }

  /**
   * Get list of supported constants
   */
  getSupportedConstants() {
    return Object.keys(this.constants);
  }
}

module.exports = CalculatorEngine;
