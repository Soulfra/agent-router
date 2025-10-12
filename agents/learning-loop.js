/**
 * Learning Loop Agent
 * Implements continuous learning through feedback and incremental fine-tuning
 *
 * Flow:
 * 1. User submits question
 * 2. Ollama generates response
 * 3. User provides feedback (correct/incorrect + corrections)
 * 4. Generate training example from interaction
 * 5. Accumulate examples until threshold
 * 6. Trigger fine-tuning with new data
 * 7. Version and tag the improved model
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const ROUTER_URL = process.env.ROUTER_URL || 'http://localhost:5001';
const TRAINING_DIR = process.env.TRAINING_DIR || '/Users/matthewmauer/Desktop/script-toolkit/ollama-training';
const FINE_TUNE_THRESHOLD = parseInt(process.env.FINE_TUNE_THRESHOLD) || 50; // New examples before retraining
const MODEL_NAME = process.env.MODEL_NAME || 'script-toolkit';

class LearningLoop {
  constructor() {
    this.interactions = new Map();
    this.trainingExamples = [];
    this.modelVersion = '1.0';
    this.examplesSinceLastTrain = 0;
  }

  async initialize() {
    try {
      // Create training directory
      if (!fs.existsSync(TRAINING_DIR)) {
        fs.mkdirSync(TRAINING_DIR, { recursive: true });
      }

      // Load existing training examples
      await this.loadTrainingExamples();

      // Load model version
      await this.loadModelVersion();

      console.log('✓ Learning loop initialized');
      console.log(`   Model: ${MODEL_NAME} v${this.modelVersion}`);
      console.log(`   Training examples: ${this.trainingExamples.length}`);
      console.log(`   Examples since last train: ${this.examplesSinceLastTrain}`);
      console.log(`   Fine-tune threshold: ${FINE_TUNE_THRESHOLD}`);

    } catch (error) {
      console.error('❌ Failed to initialize learning loop:', error.message);
      throw error;
    }
  }

  async loadTrainingExamples() {
    try {
      const examplesFile = path.join(TRAINING_DIR, 'training-examples.jsonl');
      if (fs.existsSync(examplesFile)) {
        const data = fs.readFileSync(examplesFile, 'utf8');
        this.trainingExamples = data.trim().split('\n').map(line => JSON.parse(line));
      }
    } catch (error) {
      console.log('  No existing training examples found');
      this.trainingExamples = [];
    }
  }

  async loadModelVersion() {
    try {
      const versionFile = path.join(TRAINING_DIR, 'model-version.json');
      if (fs.existsSync(versionFile)) {
        const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
        this.modelVersion = data.version;
        this.examplesSinceLastTrain = data.examples_since_last_train || 0;
      }
    } catch (error) {
      console.log('  Using default version 1.0');
    }
  }

  async saveModelVersion() {
    const versionFile = path.join(TRAINING_DIR, 'model-version.json');
    const data = {
      version: this.modelVersion,
      examples_since_last_train: this.examplesSinceLastTrain,
      last_trained: new Date().toISOString(),
      total_examples: this.trainingExamples.length
    };
    fs.writeFileSync(versionFile, JSON.stringify(data, null, 2));
  }

  /**
   * Handle user query
   */
  async handleQuery(interactionId, input) {
    console.log(`\n💬 Processing query [${interactionId}]`);
    console.log(`   Input: ${input.substring(0, 100)}...`);

    try {
      // Query Ollama model
      const response = await this.queryOllama(input);

      // Store interaction for feedback
      this.interactions.set(interactionId, {
        input,
        response,
        timestamp: new Date().toISOString(),
        feedback: null
      });

      console.log(`✓ Response generated: ${response.substring(0, 100)}...`);

      return response;

    } catch (error) {
      console.error(`❌ Error processing query:`, error.message);
      throw error;
    }
  }

  /**
   * Query Ollama model
   */
  async queryOllama(input) {
    try {
      const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
        model: `${MODEL_NAME}:latest`,
        prompt: input,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9
        }
      });

      return response.data.response;

    } catch (error) {
      // Fallback to base model if custom model doesn't exist
      console.log(`   ⚠️  ${MODEL_NAME} not found, using base model`);
      const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
        model: 'llama3.2:3b',
        prompt: input,
        stream: false
      });

      return response.data.response;
    }
  }

  /**
   * Handle user feedback
   */
  async handleFeedback(interactionId, feedbackType, correction = null) {
    console.log(`\n📊 Received feedback [${interactionId}]: ${feedbackType}`);

    const interaction = this.interactions.get(interactionId);
    if (!interaction) {
      console.log(`   ⚠️  Interaction not found`);
      return;
    }

    interaction.feedback = {
      type: feedbackType,
      correction,
      timestamp: new Date().toISOString()
    };

    // Generate training example if feedback is useful
    if (feedbackType === 'incorrect' && correction) {
      await this.generateTrainingExample(interaction, correction);
    } else if (feedbackType === 'correct') {
      await this.generateTrainingExample(interaction);
    }
  }

  /**
   * Generate training example from interaction
   */
  async generateTrainingExample(interaction, correction = null) {
    const example = {
      text: this.formatTrainingText(
        interaction.input,
        correction || interaction.response
      ),
      metadata: {
        timestamp: interaction.timestamp,
        feedback_type: interaction.feedback.type,
        has_correction: !!correction
      }
    };

    // Add to training examples
    this.trainingExamples.push(example);
    this.examplesSinceLastTrain++;

    // Save to JSONL file
    const examplesFile = path.join(TRAINING_DIR, 'training-examples.jsonl');
    fs.appendFileSync(examplesFile, JSON.stringify(example) + '\n');

    console.log(`✓ Training example generated (${this.examplesSinceLastTrain}/${FINE_TUNE_THRESHOLD})`);

    // Check if we should trigger fine-tuning
    if (this.examplesSinceLastTrain >= FINE_TUNE_THRESHOLD) {
      await this.triggerFineTuning();
    }
  }

  /**
   * Format training text for Ollama
   */
  formatTrainingText(input, response) {
    return `<|im_start|>system
You are an expert in the Script-Toolkit project. You help debug issues, explain code, and suggest improvements.
<|im_end|>
<|im_start|>user
${input}
<|im_end|>
<|im_start|>assistant
${response}
<|im_end|>`;
  }

  /**
   * Trigger fine-tuning
   */
  async triggerFineTuning() {
    console.log(`\n🔧 Triggering fine-tuning...`);
    console.log(`   Current version: ${this.modelVersion}`);

    try {
      // Increment version
      const versionParts = this.modelVersion.split('.');
      versionParts[1] = parseInt(versionParts[1]) + 1;
      const newVersion = versionParts.join('.');

      console.log(`   New version: ${newVersion}`);

      // Run fine-tuning script
      const finetuneScript = path.join(__dirname, '../../script-toolkit/fine-tune-incremental.sh');
      await execPromise(`bash "${finetuneScript}" ${MODEL_NAME} ${newVersion}`);

      // Update version
      this.modelVersion = newVersion;
      this.examplesSinceLastTrain = 0;
      await this.saveModelVersion();

      console.log(`✓ Fine-tuning complete: ${MODEL_NAME}:${newVersion}`);

      // Run validation tests
      await this.runValidationTests(newVersion);

    } catch (error) {
      console.error(`❌ Fine-tuning failed:`, error.message);
    }
  }

  /**
   * Run validation tests on new model
   */
  async runValidationTests(version) {
    console.log(`\n🧪 Running validation tests for v${version}...`);

    try {
      const testScript = path.join(__dirname, '../../script-toolkit/test-model.sh');
      const { stdout, stderr } = await execPromise(`bash "${testScript}" ${MODEL_NAME}:${version}`);

      console.log(stdout);

      if (stderr) {
        console.error(stderr);
      }

      console.log(`✓ Validation tests passed`);

    } catch (error) {
      console.error(`❌ Validation tests failed:`, error.message);
      console.error(`   Rolling back to previous version...`);
      // TODO: Implement rollback logic
    }
  }

  /**
   * Get learning statistics
   */
  getStats() {
    return {
      model_version: this.modelVersion,
      total_training_examples: this.trainingExamples.length,
      examples_since_last_train: this.examplesSinceLastTrain,
      fine_tune_threshold: FINE_TUNE_THRESHOLD,
      progress: `${((this.examplesSinceLastTrain / FINE_TUNE_THRESHOLD) * 100).toFixed(1)}%`,
      active_interactions: this.interactions.size
    };
  }
}

module.exports = LearningLoop;
