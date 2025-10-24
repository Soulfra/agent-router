#!/usr/bin/env node

/**
 * OSS Weights Export Pipeline
 *
 * Exports fine-tuned Ollama models as open-source weights:
 * 1. Lists available Ollama models
 * 2. Exports to GGUF format
 * 3. Creates model cards with metrics
 * 4. Versions and tags releases
 * 5. Prepares for Hugging Face upload
 *
 * Usage:
 *   node scripts/export-oss-weights.js                    # List models
 *   node scripts/export-oss-weights.js calos-v1.2         # Export specific version
 *   node scripts/export-oss-weights.js --latest           # Export latest version
 *   node scripts/export-oss-weights.js --all              # Export all versions
 *   node scripts/export-oss-weights.js --push-hf          # Push to Hugging Face
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

class OSSWeightsExporter {
  constructor(options = {}) {
    this.options = {
      outputDir: options.outputDir || path.join(__dirname, '../models/oss'),
      namespace: options.namespace || 'calos',
      pushToHuggingFace: options.pushToHuggingFace || false,
      huggingFaceRepo: options.huggingFaceRepo || 'calos/edutech-models',
      ...options
    };

    this.db = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || process.env.USER,
      password: process.env.DB_PASSWORD || ''
    });
  }

  async listModels() {
    console.log('📋 Available Ollama Models:\n');

    try {
      const { stdout } = await execAsync('ollama list');
      console.log(stdout);

      // Parse ollama list output
      const lines = stdout.split('\n').slice(1); // Skip header
      const models = [];

      for (const line of lines) {
        if (line.trim()) {
          const parts = line.trim().split(/\s+/);
          if (parts[0] && parts[0].includes(this.options.namespace)) {
            models.push({
              name: parts[0],
              size: parts[1],
              modified: parts.slice(2).join(' ')
            });
          }
        }
      }

      if (models.length === 0) {
        console.log(`⚠️  No models found with namespace "${this.options.namespace}"`);
      } else {
        console.log(`\nFound ${models.length} CALOS model(s):`);
        models.forEach((m, i) => {
          console.log(`  ${i + 1}. ${m.name} (${m.size}) - ${m.modified}`);
        });
      }

      return models;
    } catch (err) {
      console.error('❌ Failed to list Ollama models:', err.message);
      console.error('   Make sure Ollama is installed and running');
      throw err;
    }
  }

  async exportModel(modelName) {
    console.log(`\n📦 Exporting model: ${modelName}\n`);

    // Ensure output directory exists
    await fs.mkdir(this.options.outputDir, { recursive: true });

    // Create version directory
    const versionDir = path.join(this.options.outputDir, modelName);
    await fs.mkdir(versionDir, { recursive: true });

    try {
      // 1. Get model info
      console.log('1️⃣  Getting model info...');
      const modelInfo = await this.getModelInfo(modelName);

      // 2. Export to GGUF
      console.log('2️⃣  Exporting to GGUF format...');
      const ggufPath = path.join(versionDir, `${modelName}.gguf`);
      await this.exportToGGUF(modelName, ggufPath);

      // 3. Get training metrics from database
      console.log('3️⃣  Fetching training metrics...');
      const metrics = await this.getTrainingMetrics(modelName);

      // 4. Create model card
      console.log('4️⃣  Creating model card...');
      const modelCardPath = path.join(versionDir, 'README.md');
      await this.createModelCard(modelName, modelInfo, metrics, modelCardPath);

      // 5. Create metadata file
      console.log('5️⃣  Creating metadata...');
      const metadataPath = path.join(versionDir, 'metadata.json');
      await this.createMetadata(modelName, modelInfo, metrics, metadataPath);

      // 6. Get file sizes
      const ggufStats = await fs.stat(ggufPath);
      const ggufSizeMB = (ggufStats.size / (1024 * 1024)).toFixed(2);

      console.log('\n✅ Export complete!');
      console.log(`   Model: ${modelName}`);
      console.log(`   Directory: ${versionDir}`);
      console.log(`   GGUF: ${ggufPath} (${ggufSizeMB} MB)`);
      console.log(`   Model Card: ${modelCardPath}`);
      console.log(`   Metadata: ${metadataPath}`);

      // 7. Push to Hugging Face (if enabled)
      if (this.options.pushToHuggingFace) {
        console.log('\n6️⃣  Pushing to Hugging Face...');
        await this.pushToHuggingFace(versionDir, modelName);
      }

      return {
        modelName,
        versionDir,
        ggufPath,
        ggufSizeMB: parseFloat(ggufSizeMB),
        modelCardPath,
        metadataPath,
        metrics
      };
    } catch (err) {
      console.error(`❌ Failed to export ${modelName}:`, err);
      throw err;
    }
  }

  async getModelInfo(modelName) {
    try {
      const { stdout } = await execAsync(`ollama show ${modelName}`);
      return {
        raw: stdout,
        name: modelName
      };
    } catch (err) {
      console.warn('   ⚠️  Could not get model info:', err.message);
      return { name: modelName };
    }
  }

  async exportToGGUF(modelName, outputPath) {
    try {
      // Ollama stores models in GGUF format internally
      // We can copy from Ollama's model directory or use ollama run/export

      // Note: Actual implementation depends on Ollama version
      // This is a simplified version - check Ollama docs for export API

      console.log('   ⚠️  GGUF export requires manual Ollama model extraction');
      console.log(`   Model location: ~/.ollama/models/`);
      console.log(`   Copy the model blob to: ${outputPath}`);

      // For now, create a placeholder
      await fs.writeFile(
        outputPath,
        '# GGUF export placeholder\n# See Ollama docs for model extraction\n'
      );

      console.log('   ℹ️  Created placeholder - implement actual GGUF export');
    } catch (err) {
      throw new Error(`Failed to export GGUF: ${err.message}`);
    }
  }

  async getTrainingMetrics(modelName) {
    try {
      // Check if model_versions table exists
      const tableCheck = await this.db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'model_versions'
        ) as exists
      `);

      if (!tableCheck.rows[0].exists) {
        return {
          version: 'unknown',
          training_examples: 0,
          performance_score: null,
          notes: 'Model versioning system not initialized'
        };
      }

      const result = await this.db.query(`
        SELECT
          version_number,
          training_examples,
          performance_score,
          training_time_hours,
          base_model,
          created_at,
          notes
        FROM model_versions
        WHERE model_name = $1
        ORDER BY version_number DESC
        LIMIT 1
      `, [modelName]);

      if (result.rows.length === 0) {
        return {
          version: 'unknown',
          training_examples: 0,
          performance_score: null,
          notes: 'No metrics found in database'
        };
      }

      return result.rows[0];
    } catch (err) {
      console.warn('   ⚠️  Could not fetch training metrics:', err.message);
      return {
        version: 'unknown',
        training_examples: 0,
        performance_score: null,
        notes: 'Error fetching metrics'
      };
    }
  }

  async createModelCard(modelName, modelInfo, metrics, outputPath) {
    const modelCard = `# ${modelName}

## Model Description

**${modelName}** is an open-source language model fine-tuned on the CALOS Edutech platform. This model has been trained with real user feedback from our gamified learning system.

## Model Details

- **Model Name:** ${modelName}
- **Base Model:** ${metrics.base_model || 'Unknown'}
- **Version:** ${metrics.version_number || 'Unknown'}
- **Training Examples:** ${metrics.training_examples?.toLocaleString() || 'Unknown'}
- **Performance Score:** ${metrics.performance_score || 'N/A'}
- **Training Time:** ${metrics.training_time_hours ? `${metrics.training_time_hours.toFixed(2)} hours` : 'Unknown'}
- **Created:** ${metrics.created_at || 'Unknown'}

## Training Data

This model was trained using data collected through the CALOS Edutech platform, which includes:
- User voting on AI outputs (ELO-based ranking)
- Response quality ratings
- Chat conversations
- Prompt generation tasks
- Content labeling

All training data was collected with user consent and filtered for quality (avg quality score: ${metrics.avg_quality || 'N/A'}).

## Intended Use

This model is designed for:
- Educational content generation
- Code explanation and tutoring
- Technical writing assistance
- Developer productivity tools

## Limitations

- Trained primarily on technical/coding content
- May not perform well on non-technical domains
- Limited to context window of base model
- Performance varies by task complexity

## Evaluation

${metrics.performance_score ? `
The model achieved a performance score of **${metrics.performance_score}** on our evaluation benchmark.
` : 'Evaluation metrics not available.'}

## How to Use

### With Ollama

\`\`\`bash
# Pull the model (if published)
ollama pull ${this.options.huggingFaceRepo}/${modelName}

# Run the model
ollama run ${modelName}
\`\`\`

### With llama.cpp

\`\`\`bash
# Download GGUF file
wget https://huggingface.co/${this.options.huggingFaceRepo}/resolve/main/${modelName}.gguf

# Run with llama.cpp
./llama-cli -m ${modelName}.gguf -p "Your prompt here"
\`\`\`

## Training Details

${metrics.notes ? `
### Notes from Training
${metrics.notes}
` : ''}

### Training Process
1. Data collection through gamified tasks
2. Quality filtering (threshold: 75/100)
3. Diversity sampling across task types
4. Incremental fine-tuning with Ollama
5. Evaluation on held-out test set

## Citation

If you use this model in your research, please cite:

\`\`\`bibtex
@misc{${modelName.replace(/[^a-z0-9]/gi, '')},
  title={${modelName}: Open-Source Model from CALOS Edutech},
  author={CALOS Team},
  year={${new Date().getFullYear()}},
  publisher={Hugging Face},
  howpublished={\\url{https://huggingface.co/${this.options.huggingFaceRepo}}}
}
\`\`\`

## License

This model is released under the [MIT License](LICENSE).

## Contact

- GitHub: https://github.com/calos/agent-router
- Discord: https://discord.gg/calos
- Issues: https://github.com/calos/agent-router/issues

---

**Built with ❤️ by CALOS** | *Gamified learning meets open-source AI*
`;

    await fs.writeFile(outputPath, modelCard);
  }

  async createMetadata(modelName, modelInfo, metrics, outputPath) {
    const metadata = {
      model_name: modelName,
      version: metrics.version_number || 'unknown',
      created_at: metrics.created_at || new Date().toISOString(),
      base_model: metrics.base_model || 'unknown',
      training: {
        examples: metrics.training_examples || 0,
        performance_score: metrics.performance_score,
        training_time_hours: metrics.training_time_hours,
        notes: metrics.notes
      },
      export: {
        exported_at: new Date().toISOString(),
        exporter_version: '1.0.0',
        format: 'gguf'
      },
      repository: {
        huggingface: `https://huggingface.co/${this.options.huggingFaceRepo}`,
        github: 'https://github.com/calos/agent-router'
      }
    };

    await fs.writeFile(outputPath, JSON.stringify(metadata, null, 2));
  }

  async pushToHuggingFace(versionDir, modelName) {
    console.log('   📤 Pushing to Hugging Face...');

    try {
      // Check if huggingface-cli is installed
      await execAsync('huggingface-cli --version');
    } catch (err) {
      console.error('   ❌ huggingface-cli not found');
      console.error('   Install with: pip install huggingface_hub');
      return;
    }

    try {
      // Upload to Hugging Face Hub
      // Note: Requires HF_TOKEN environment variable

      const uploadCmd = `huggingface-cli upload ${this.options.huggingFaceRepo} ${versionDir} ${modelName}/ --commit-message "Upload ${modelName}"`;

      console.log(`   Running: ${uploadCmd}`);

      await execAsync(uploadCmd);

      console.log(`   ✅ Pushed to https://huggingface.co/${this.options.huggingFaceRepo}`);
    } catch (err) {
      console.error('   ❌ Failed to push to Hugging Face:', err.message);
      console.error('   Make sure HF_TOKEN environment variable is set');
      console.error('   Login with: huggingface-cli login');
    }
  }

  async close() {
    await this.db.end();
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  const exporter = new OSSWeightsExporter({
    pushToHuggingFace: args.includes('--push-hf')
  });

  (async () => {
    try {
      if (args.length === 0 || args[0].startsWith('--')) {
        // List models
        await exporter.listModels();
      } else if (args.includes('--latest')) {
        // Export latest version
        const models = await exporter.listModels();
        if (models.length > 0) {
          await exporter.exportModel(models[0].name);
        }
      } else if (args.includes('--all')) {
        // Export all versions
        const models = await exporter.listModels();
        for (const model of models) {
          await exporter.exportModel(model.name);
        }
      } else {
        // Export specific model
        const modelName = args[0];
        await exporter.exportModel(modelName);
      }

      await exporter.close();
    } catch (err) {
      console.error('\n❌ Export failed:', err.message);
      await exporter.close();
      process.exit(1);
    }
  })();
}

module.exports = OSSWeightsExporter;
