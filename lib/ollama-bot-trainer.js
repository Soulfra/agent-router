/**
 * Ollama Bot Trainer
 *
 * Train local Ollama models to create custom bot personalities.
 *
 * Instead of generic "professional" or "meme" bots, train a model on:
 * - Your company's support docs → Support bot
 * - Your product documentation → Product expert bot
 * - Your code repositories → Code helper bot
 * - Your brand voice/style → Brand-consistent bot
 *
 * 100% local, 100% private, 100% FREE.
 *
 * Usage:
 *   const trainer = new OllamaBot Trainer();
 *
 *   // Train on documentation
 *   await trainer.trainFromDocs('./docs', {
 *     modelName: 'calos-support-bot',
 *     baseModel: 'llama2'
 *   });
 *
 *   // Use trained model in bot
 *   const bot = new TelegramBot({
 *     token: '...',
 *     ollamaModel: 'calos-support-bot'
 *   });
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

class OllamaBotTrainer {
  constructor(options = {}) {
    this.config = {
      ollamaHost: options.ollamaHost || 'http://localhost:11434',
      tempDir: options.tempDir || path.join(__dirname, '../temp/ollama-training'),
      maxContextSize: options.maxContextSize || 4096
    };

    console.log('[OllamaBotTrainer] Initialized');
  }

  /**
   * Train model from documentation directory
   */
  async trainFromDocs(docsPath, options = {}) {
    const { modelName, baseModel = 'llama2', personality = 'helpful' } = options;

    console.log(`[OllamaBotTrainer] Training ${modelName} from docs at ${docsPath}...`);

    // 1. Read all docs
    const docs = await this._readDocs(docsPath);

    // 2. Create training prompt
    const trainingPrompt = this._createTrainingPrompt(docs, personality);

    // 3. Create Modelfile
    const modelfile = this._createModelfile(baseModel, trainingPrompt, personality);

    // 4. Save Modelfile
    await fs.mkdir(this.config.tempDir, { recursive: true });
    const modelfilePath = path.join(this.config.tempDir, `Modelfile.${modelName}`);
    await fs.writeFile(modelfilePath, modelfile, 'utf8');

    // 5. Create model via Ollama
    await this._createOllamaModel(modelName, modelfilePath);

    console.log(`[OllamaBotTrainer] ✅ Model trained: ${modelName}`);

    return {
      modelName,
      baseModel,
      docsCount: docs.length,
      modelfilePath
    };
  }

  /**
   * Train from code repository
   */
  async trainFromCode(repoPath, options = {}) {
    const { modelName, baseModel = 'codellama', language = 'javascript' } = options;

    console.log(`[OllamaBotTrainer] Training ${modelName} from code at ${repoPath}...`);

    // 1. Read code files
    const codeFiles = await this._readCodeFiles(repoPath, language);

    // 2. Create code-specific training prompt
    const trainingPrompt = this._createCodeTrainingPrompt(codeFiles, language);

    // 3. Create Modelfile
    const modelfile = this._createModelfile(baseModel, trainingPrompt, 'code-expert');

    // 4. Save and create model
    await fs.mkdir(this.config.tempDir, { recursive: true });
    const modelfilePath = path.join(this.config.tempDir, `Modelfile.${modelName}`);
    await fs.writeFile(modelfilePath, modelfile, 'utf8');

    await this._createOllamaModel(modelName, modelfilePath);

    console.log(`[OllamaBotTrainer] ✅ Code model trained: ${modelName}`);

    return {
      modelName,
      baseModel,
      filesCount: codeFiles.length,
      language
    };
  }

  /**
   * Train from conversation examples
   */
  async trainFromConversations(conversations, options = {}) {
    const { modelName, baseModel = 'neural-chat', style = 'casual' } = options;

    console.log(`[OllamaBotTrainer] Training ${modelName} from ${conversations.length} conversations...`);

    // Create conversational training prompt
    const trainingPrompt = this._createConversationalPrompt(conversations, style);

    // Create Modelfile
    const modelfile = this._createModelfile(baseModel, trainingPrompt, style);

    // Save and create model
    await fs.mkdir(this.config.tempDir, { recursive: true });
    const modelfilePath = path.join(this.config.tempDir, `Modelfile.${modelName}`);
    await fs.writeFile(modelfilePath, modelfile, 'utf8');

    await this._createOllamaModel(modelName, modelfilePath);

    console.log(`[OllamaBotTrainer] ✅ Conversational model trained: ${modelName}`);

    return {
      modelName,
      baseModel,
      conversationsCount: conversations.length
    };
  }

  /**
   * Read all documentation files
   */
  async _readDocs(docsPath) {
    const docs = [];
    const files = await this._getAllFiles(docsPath, ['.md', '.txt']);

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      docs.push({
        path: file,
        content,
        title: path.basename(file, path.extname(file))
      });
    }

    return docs;
  }

  /**
   * Read code files
   */
  async _readCodeFiles(repoPath, language) {
    const extensions = {
      javascript: ['.js', '.jsx', '.ts', '.tsx'],
      python: ['.py'],
      go: ['.go'],
      rust: ['.rs'],
      java: ['.java']
    };

    const exts = extensions[language] || ['.js'];
    const files = await this._getAllFiles(repoPath, exts);

    const codeFiles = [];
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      codeFiles.push({
        path: file,
        content,
        filename: path.basename(file)
      });
    }

    return codeFiles;
  }

  /**
   * Get all files with extensions
   */
  async _getAllFiles(dir, extensions) {
    const files = [];

    async function scan(currentDir) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules, .git, etc.
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scan(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    await scan(dir);
    return files;
  }

  /**
   * Create training prompt from docs
   */
  _createTrainingPrompt(docs, personality) {
    const personalityPrompts = {
      helpful: 'You are a helpful assistant. You answer questions clearly and concisely based on the documentation provided.',
      professional: 'You are a professional support agent. You provide accurate, detailed answers with references to documentation.',
      casual: 'You are a friendly helper. You explain things in simple terms and use a conversational tone.',
      meme: 'You are a casual, humorous helper. You use slang and emojis but still provide accurate information.'
    };

    let prompt = personalityPrompts[personality] || personalityPrompts.helpful;
    prompt += '\n\nYou have access to the following documentation:\n\n';

    // Add docs (truncated to fit context)
    for (const doc of docs.slice(0, 10)) {
      prompt += `\n## ${doc.title}\n\n`;
      prompt += doc.content.substring(0, 500);
      prompt += '\n\n';
    }

    return prompt;
  }

  /**
   * Create code training prompt
   */
  _createCodeTrainingPrompt(codeFiles, language) {
    let prompt = `You are a ${language} code expert. You help developers by explaining code, suggesting improvements, and answering questions about the codebase.\n\n`;
    prompt += `You have deep knowledge of this codebase:\n\n`;

    // Add code samples
    for (const file of codeFiles.slice(0, 10)) {
      prompt += `\n### ${file.filename}\n\n\`\`\`${language}\n`;
      prompt += file.content.substring(0, 800);
      prompt += '\n```\n\n';
    }

    return prompt;
  }

  /**
   * Create conversational training prompt
   */
  _createConversationalPrompt(conversations, style) {
    let prompt = `You are a ${style} chatbot. Here are example conversations showing your style:\n\n`;

    for (const conv of conversations.slice(0, 20)) {
      prompt += `User: ${conv.user}\n`;
      prompt += `You: ${conv.assistant}\n\n`;
    }

    prompt += 'Continue in this style for all future conversations.';

    return prompt;
  }

  /**
   * Create Modelfile for Ollama
   */
  _createModelfile(baseModel, systemPrompt, personality) {
    return `FROM ${baseModel}

# System prompt (personality + knowledge)
SYSTEM """
${systemPrompt}
"""

# Parameters
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER num_ctx ${this.config.maxContextSize}

# Stop sequences
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|endoftext|>"

# Template
TEMPLATE """
{{ if .System }}{{ .System }}{{ end }}

User: {{ .Prompt }}
Assistant:
"""
`;
  }

  /**
   * Create Ollama model
   */
  async _createOllamaModel(modelName, modelfilePath) {
    console.log(`[OllamaBotTrainer] Creating Ollama model: ${modelName}...`);

    try {
      const { stdout, stderr } = await execPromise(`ollama create ${modelName} -f ${modelfilePath}`);

      if (stderr && !stderr.includes('success')) {
        console.warn(`[OllamaBotTrainer] Warning: ${stderr}`);
      }

      console.log(`[OllamaBotTrainer] Model created successfully`);
    } catch (error) {
      console.error(`[OllamaBotTrainer] Failed to create model:`, error.message);
      throw error;
    }
  }

  /**
   * Test model
   */
  async testModel(modelName, prompt) {
    console.log(`[OllamaBotTrainer] Testing model: ${modelName}...`);

    try {
      const response = await fetch(`${this.config.ollamaHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt,
          stream: false
        })
      });

      const data = await response.json();

      return data.response;
    } catch (error) {
      console.error(`[OllamaBotTrainer] Test failed:`, error.message);
      throw error;
    }
  }

  /**
   * List trained models
   */
  async listModels() {
    try {
      const response = await fetch(`${this.config.ollamaHost}/api/tags`);
      const data = await response.json();

      return data.models || [];
    } catch (error) {
      console.error(`[OllamaBotTrainer] Failed to list models:`, error.message);
      return [];
    }
  }

  /**
   * Delete model
   */
  async deleteModel(modelName) {
    console.log(`[OllamaBotTrainer] Deleting model: ${modelName}...`);

    try {
      await execPromise(`ollama rm ${modelName}`);
      console.log(`[OllamaBotTrainer] Model deleted`);
    } catch (error) {
      console.error(`[OllamaBotTrainer] Failed to delete model:`, error.message);
      throw error;
    }
  }
}

module.exports = OllamaBotTrainer;