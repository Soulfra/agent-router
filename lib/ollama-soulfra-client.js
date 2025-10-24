/**
 * Ollama Soulfra Client
 *
 * Connects to local Ollama instance using the custom Soulfra model
 * Sends code for AI-based evaluation with brand-aware context
 */

const axios = require('axios');

class OllamaSoulfraClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL || process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = options.model || 'soulfra-model';
    this.timeout = options.timeout || 60000; // 60 seconds
    this.streamEnabled = options.stream !== false;
  }

  /**
   * Generate completion from Soulfra model
   * @param {string} prompt - The prompt to send
   * @param {object} options - Generation options
   * @returns {Promise<object>} Response with text and metadata
   */
  async generate(prompt, options = {}) {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/generate`,
        {
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 0.9,
            top_k: options.top_k || 40,
            num_predict: options.maxTokens || 2000
          }
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        text: response.data.response,
        model: response.data.model,
        context: response.data.context,
        totalDuration: response.data.total_duration,
        loadDuration: response.data.load_duration,
        promptEvalCount: response.data.prompt_eval_count,
        evalCount: response.data.eval_count,
        evalDuration: response.data.eval_duration
      };

    } catch (error) {
      throw new Error(`Ollama generation failed: ${error.message}`);
    }
  }

  /**
   * Stream completion from Soulfra model
   * @param {string} prompt - The prompt to send
   * @param {function} onChunk - Callback for each chunk
   * @param {object} options - Generation options
   */
  async *stream(prompt, options = {}) {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/generate`,
        {
          model: this.model,
          prompt: prompt,
          stream: true,
          options: {
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 0.9,
            top_k: options.top_k || 40,
            num_predict: options.maxTokens || 2000
          }
        },
        {
          timeout: this.timeout,
          responseType: 'stream',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            yield {
              text: data.response || '',
              done: data.done || false,
              context: data.context,
              totalDuration: data.total_duration,
              evalCount: data.eval_count
            };
          } catch (err) {
            // Skip invalid JSON lines
            continue;
          }
        }
      }

    } catch (error) {
      throw new Error(`Ollama streaming failed: ${error.message}`);
    }
  }

  /**
   * Evaluate code with Soulfra model
   * Sends code and gets back AI-generated evaluation
   *
   * @param {object} codeData - { html, css, js, type, description }
   * @returns {Promise<object>} Evaluation response
   */
  async evaluateCode(codeData) {
    const { html, css, js, type, description } = codeData;

    // Build evaluation prompt
    const prompt = this._buildEvaluationPrompt({
      html,
      css,
      js,
      type,
      description
    });

    const response = await this.generate(prompt, {
      temperature: 0.5, // Lower temperature for more consistent evaluation
      maxTokens: 1500
    });

    // Parse evaluation from response
    return this._parseEvaluation(response.text, response);
  }

  /**
   * Grade code with structured feedback
   * Returns scores for different aspects
   */
  async gradeCode(codeData) {
    const { html, css, js, type } = codeData;

    const prompt = this._buildGradingPrompt({
      html,
      css,
      js,
      type
    });

    const response = await this.generate(prompt, {
      temperature: 0.3, // Very low temp for consistent scoring
      maxTokens: 1000
    });

    // Parse structured grades
    return this._parseGrades(response.text, response);
  }

  /**
   * Build evaluation prompt for Soulfra model
   */
  _buildEvaluationPrompt(data) {
    const { html, css, js, type, description } = data;

    let prompt = `Evaluate this ${type || 'code'} submission:\n\n`;

    if (description) {
      prompt += `Description: ${description}\n\n`;
    }

    if (css) {
      prompt += `CSS:\n\`\`\`css\n${css}\n\`\`\`\n\n`;
    }

    if (js) {
      prompt += `JavaScript:\n\`\`\`javascript\n${js}\n\`\`\`\n\n`;
    }

    if (html) {
      prompt += `HTML:\n\`\`\`html\n${html}\n\`\`\`\n\n`;
    }

    prompt += `Provide a detailed evaluation covering:\n`;
    prompt += `1. Visual Design (if CSS): Colors, layout, aesthetics\n`;
    prompt += `2. Code Quality (if JS): Logic, structure, best practices\n`;
    prompt += `3. Soulfra Brand Alignment: Does it match Soulfra's creative/collaborative identity?\n`;
    prompt += `4. Strengths: What works well\n`;
    prompt += `5. Improvements: What could be better\n`;
    prompt += `6. Overall Score: Rate 0-100\n`;

    return prompt;
  }

  /**
   * Build grading prompt for structured scoring
   */
  _buildGradingPrompt(data) {
    const { html, css, js, type } = data;

    let prompt = `Grade this ${type || 'code'} on the following criteria (0-100 for each):\n\n`;

    if (css) {
      prompt += `CSS:\n\`\`\`css\n${css}\n\`\`\`\n\n`;
      prompt += `Grade the CSS on:\n`;
      prompt += `- Color Theory: Harmony, contrast, brand colors (#667eea, #764ba2)\n`;
      prompt += `- Layout: Grid/flexbox usage, responsiveness\n`;
      prompt += `- Aesthetics: Visual appeal, modern design\n`;
      prompt += `\n`;
    }

    if (js) {
      prompt += `JavaScript:\n\`\`\`javascript\n${js}\n\`\`\`\n\n`;
      prompt += `Grade the JavaScript on:\n`;
      prompt += `- Algorithm Quality: Efficiency, data structures\n`;
      prompt += `- Code Structure: Organization, modularity\n`;
      prompt += `- Best Practices: Modern patterns, error handling\n`;
      prompt += `\n`;
    }

    prompt += `Respond with scores in this format:\n`;
    prompt += `COLOR_THEORY: [0-100]\n`;
    prompt += `LAYOUT: [0-100]\n`;
    prompt += `AESTHETICS: [0-100]\n`;
    prompt += `ALGORITHM: [0-100]\n`;
    prompt += `STRUCTURE: [0-100]\n`;
    prompt += `BEST_PRACTICES: [0-100]\n`;
    prompt += `OVERALL: [0-100]\n`;
    prompt += `\nThen provide brief feedback for each category.`;

    return prompt;
  }

  /**
   * Parse evaluation response
   */
  _parseEvaluation(text, metadata) {
    // Extract overall score
    const scoreMatch = text.match(/(?:overall|score|rating).*?(\d+)(?:\/100)?/i);
    const overallScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    // Extract sections
    const evaluation = {
      overall: overallScore,
      rawText: text,
      sections: {},
      metadata: {
        model: metadata.model,
        evalDuration: metadata.evalDuration,
        evalCount: metadata.evalCount
      }
    };

    // Try to parse structured sections
    const sections = {
      'Visual Design': /visual design:?\s*([\s\S]*?)(?=\n\d+\.|$)/i,
      'Code Quality': /code quality:?\s*([\s\S]*?)(?=\n\d+\.|$)/i,
      'Brand Alignment': /brand alignment:?\s*([\s\S]*?)(?=\n\d+\.|$)/i,
      'Strengths': /strengths?:?\s*([\s\S]*?)(?=\n\d+\.|$)/i,
      'Improvements': /improvements?:?\s*([\s\S]*?)(?=\n\d+\.|$)/i
    };

    for (const [name, regex] of Object.entries(sections)) {
      const match = text.match(regex);
      if (match) {
        evaluation.sections[name] = match[1].trim();
      }
    }

    return evaluation;
  }

  /**
   * Parse structured grades from response
   */
  _parseGrades(text, metadata) {
    const grades = {
      colorTheory: 0,
      layout: 0,
      aesthetics: 0,
      algorithm: 0,
      structure: 0,
      bestPractices: 0,
      overall: 0,
      feedback: {},
      metadata: {
        model: metadata.model,
        evalDuration: metadata.evalDuration
      }
    };

    // Extract numeric scores
    const scorePatterns = {
      colorTheory: /COLOR_THEORY:\s*(\d+)/i,
      layout: /LAYOUT:\s*(\d+)/i,
      aesthetics: /AESTHETICS:\s*(\d+)/i,
      algorithm: /ALGORITHM:\s*(\d+)/i,
      structure: /STRUCTURE:\s*(\d+)/i,
      bestPractices: /BEST_PRACTICES:\s*(\d+)/i,
      overall: /OVERALL:\s*(\d+)/i
    };

    for (const [key, pattern] of Object.entries(scorePatterns)) {
      const match = text.match(pattern);
      if (match) {
        grades[key] = parseInt(match[1]);
      }
    }

    // Extract feedback text
    const feedbackStart = text.indexOf('feedback');
    if (feedbackStart !== -1) {
      grades.rawFeedback = text.substring(feedbackStart).trim();
    } else {
      grades.rawFeedback = text;
    }

    return grades;
  }

  /**
   * Check if Ollama is running
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseURL}/api/tags`, {
        timeout: 5000
      });

      return {
        running: true,
        models: response.data.models || []
      };
    } catch (error) {
      return {
        running: false,
        error: error.message
      };
    }
  }

  /**
   * Check if Soulfra model is installed
   */
  async checkSoulfraModel() {
    try {
      const health = await this.healthCheck();

      if (!health.running) {
        return {
          installed: false,
          reason: 'Ollama not running'
        };
      }

      const hasSoulfra = health.models.some(m => m.name.includes('soulfra'));

      return {
        installed: hasSoulfra,
        models: health.models.map(m => m.name)
      };

    } catch (error) {
      return {
        installed: false,
        error: error.message
      };
    }
  }

  /**
   * Pull/update Soulfra model
   */
  async pullModel() {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/pull`,
        {
          name: this.model,
          stream: false
        },
        {
          timeout: 300000 // 5 minutes for model download
        }
      );

      return {
        success: true,
        status: response.data.status
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = OllamaSoulfraClient;
