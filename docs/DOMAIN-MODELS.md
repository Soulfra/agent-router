# Domain-Specific Models

The CalOS Agent Router includes 5 specialized Ollama models optimized for different domains. Each model is fine-tuned with domain-specific expertise through custom Modelfiles.

## Overview

### Why Domain Models?

Domain-specific models provide:
- **Better Quality**: Specialized expertise leads to more accurate, contextual responses
- **Zero Cost**: Local Ollama models run free (no API costs)
- **Privacy**: Sensitive data stays on your machine
- **Speed**: Local models often faster than cloud APIs for simple tasks
- **Consistency**: Domain-trained models follow consistent patterns

### The 5 Domains

| Domain | Model Name | Base Model | Use Cases |
|--------|-----------|------------|-----------|
| **Cryptography** | `soulfra-model` | codellama:7b-instruct | Ed25519 signatures, zero-knowledge proofs, Soulfra identity, cryptographic protocols |
| **Data Processing** | `deathtodata-model` | qwen2.5-coder:1.5b | CSV/JSON parsing, ETL pipelines, enum validation, data transformation |
| **Publishing** | `publishing-model` | llama3.2:3b | Technical documentation, README files, API docs, tutorials |
| **CalOS Platform** | `calos-model` | llama3.2:3b | CalOS architecture, skills/XP system, actions/effects, gamification |
| **Creative/Whimsical** | `drseuss-model` | llama3.2:3b | Playful explanations, Dr. Seuss style, creative metaphors |

## Installation

### 1. Build All Domain Models

From the `agent-router` directory:

```bash
# Build all 5 models
cd modelfiles

ollama create soulfra-model -f Modelfile.soulfra
ollama create deathtodata-model -f Modelfile.deathtodata
ollama create publishing-model -f Modelfile.publishing
ollama create calos-model -f Modelfile.calos
ollama create drseuss-model -f Modelfile.drseuss
```

### 2. Verify Installation

```bash
# Check that all models are available
ollama list | grep -E "(soulfra|deathtodata|publishing|calos|drseuss)"
```

You should see all 5 models listed.

### 3. Test a Model

```bash
ollama run soulfra-model "Explain Ed25519 signatures"
```

## Usage

### Automatic Routing

The router automatically detects the domain from your prompt and routes to the appropriate model:

```javascript
const MultiLLMRouter = require('./lib/multi-llm-router');

const router = new MultiLLMRouter({
  strategy: 'smart',
  ollamaEnabled: true
});

// Automatically routed to soulfra-model
const cryptoResponse = await router.complete({
  prompt: 'Generate an Ed25519 key pair for Soulfra identity'
});

// Automatically routed to deathtodata-model
const dataResponse = await router.complete({
  prompt: 'Parse this CSV and validate enums'
});

// Automatically routed to publishing-model
const docsResponse = await router.complete({
  prompt: 'Write API documentation for this endpoint'
});
```

### Explicit Domain Selection

Force a specific domain:

```javascript
const response = await router.complete({
  prompt: 'Explain blockchain',
  taskType: 'cryptography' // Force cryptography domain
});
```

### Domain Keywords

The router detects domains using keyword matching:

**Cryptography**: `cryptograph`, `encrypt`, `signature`, `ed25519`, `soulfra`, `zero-knowledge`, `proof-of-work`, `identity`

**Data**: `csv`, `parse`, `etl`, `transform`, `enum`, `array`, `import`, `export`

**Publishing**: `document`, `readme`, `markdown`, `api documentation`, `tutorial`, `guide`

**CalOS**: `calos`, `skill xp`, `action effect`, `gamification`, `progression`

**Whimsical**: `whimsical`, `dr seuss`, `playful`, `fun explanation`

## Domain Model Details

### 1. Soulfra Cryptography Model

**Model**: `soulfra-model`
**Base**: codellama:7b-instruct
**Temperature**: 0.2 (precise, deterministic)

**Expertise**:
- Ed25519 elliptic curve cryptography
- Zero-knowledge proof systems
- Soulfra identity verification
- Proof-of-personhood mechanisms
- Self-sovereign identity (no KYC)
- Cryptographic protocol design
- Signature verification
- Key management

**Example Prompts**:
```javascript
// Generate signature code
await router.complete({
  prompt: 'Implement Ed25519 signature verification in JavaScript',
  taskType: 'cryptography'
});

// Explain concepts
await router.complete({
  prompt: 'How does Soulfra verify identity without centralized authority?',
  taskType: 'cryptography'
});

// Design protocols
await router.complete({
  prompt: 'Design a zero-knowledge proof for age verification',
  taskType: 'cryptography'
});
```

### 2. DeathToData Processing Model

**Model**: `deathtodata-model`
**Base**: qwen2.5-coder:1.5b
**Temperature**: 0.3 (balanced)

**Expertise**:
- CSV/JSON/XML/YAML parsing
- ETL pipeline design
- Data transformation and cleaning
- Enum type validation
- Array operations
- Schema design and validation
- Gateway/API data imports
- Data normalization

**Example Prompts**:
```javascript
// Parse and transform
await router.complete({
  prompt: 'Parse this CSV and convert to JSON: name,age\\nAlice,30\\nBob,25',
  taskType: 'data'
});

// Validate data
await router.complete({
  prompt: 'Validate these enum values against schema',
  taskType: 'data'
});

// ETL pipeline
await router.complete({
  prompt: 'Design an ETL pipeline to import user data from CSV into PostgreSQL',
  taskType: 'data'
});
```

### 3. Publishing Content Model

**Model**: `publishing-model`
**Base**: llama3.2:3b
**Temperature**: 0.7 (creative but structured)

**Expertise**:
- Technical documentation
- API documentation (OpenAPI, REST)
- README files
- Markdown formatting
- Tutorials and guides
- Code examples
- Documentation best practices
- **NO PowerPoint/slide formatting**

**Example Prompts**:
```javascript
// Write docs
await router.complete({
  prompt: 'Write API documentation for a user authentication endpoint',
  taskType: 'publishing'
});

// Create README
await router.complete({
  prompt: 'Generate a README for a Node.js microservice router',
  taskType: 'publishing'
});

// Tutorial
await router.complete({
  prompt: 'Create a beginner tutorial for using this library',
  taskType: 'publishing'
});
```

### 4. CalOS Platform Model

**Model**: `calos-model`
**Base**: llama3.2:3b
**Temperature**: 0.5 (balanced)

**Expertise**:
- CalOS kernel architecture
- 10 Skills system (99 levels each)
- RuneScape XP formula
- 18+ Actions engine
- Action → Effect mappings
- Gamification mechanics
- Progression systems
- Platform integration

**Example Prompts**:
```javascript
// Architecture
await router.complete({
  prompt: 'Explain CalOS kernel architecture and layer separation',
  taskType: 'calos'
});

// Skills system
await router.complete({
  prompt: 'How does the CalOS skills XP progression work?',
  taskType: 'calos'
});

// Actions
await router.complete({
  prompt: 'Map these user actions to CalOS effects',
  taskType: 'calos'
});
```

### 5. Dr. Seuss Creative Model

**Model**: `drseuss-model`
**Base**: llama3.2:3b
**Temperature**: 0.9 (very creative)

**Expertise**:
- Whimsical, playful writing
- Rhyme and rhythm
- Creative metaphors
- Storytelling
- Making complex topics fun
- Dr. Seuss-inspired style
- Engaging explanations
- Character creation

**Example Prompts**:
```javascript
// Whimsical explanation
await router.complete({
  prompt: 'Explain how APIs work in Dr. Seuss style',
  taskType: 'whimsical'
});

// Creative metaphor
await router.complete({
  prompt: 'Describe databases using a playful analogy',
  taskType: 'whimsical'
});

// Fun tutorial
await router.complete({
  prompt: 'Teach Git commands in a whimsical, fun way',
  taskType: 'whimsical'
});
```

## Output Formatting

All domain model responses are automatically cleaned:

### Artifacts Removed
- PowerPoint/slide markers (`[Slide 1]`, `---slide---`)
- Thinking tags (`<thinking>...</thinking>`)
- Placeholder markers (`[TODO]`, `[PLACEHOLDER]`)
- Excessive whitespace

### Markdown Cleaned
- Fixed heading levels (max 3 #)
- Balanced code blocks
- Proper list formatting
- Working links
- Normalized whitespace

### Code Blocks Fixed
- Language identifiers added
- Common typos fixed (js → javascript)
- Closing backticks ensured
- Proper formatting

## Configuration

### Enable/Disable Domains

```javascript
const router = new MultiLLMRouter({
  strategy: 'smart',
  ollamaEnabled: true, // Enable Ollama for domain models
  openaiEnabled: false,
  anthropicEnabled: false,
  deepseekEnabled: false
});
```

### Custom Model Names

Modify `lib/provider-adapters/ollama-adapter.js`:

```javascript
this.domainModels = {
  cryptography: 'my-crypto-model',  // Custom model name
  data: 'deathtodata-model',
  publishing: 'publishing-model',
  calos: 'calos-model',
  whimsical: 'drseuss-model'
};
```

### Routing Strategy

```javascript
const router = new MultiLLMRouter({
  strategy: 'smart',     // Intelligent routing (default)
  // strategy: 'cheapest', // Always use free models
  // strategy: 'fastest',  // Lowest latency
  // strategy: 'best-quality' // Highest quality
});
```

## Testing

Run the complete test suite:

```bash
npm run test:domain
```

Tests include:
- ✅ Domain routing for all 5 models
- ✅ Keyword inference
- ✅ Output formatting (PPT removal)
- ✅ Markdown cleaning
- ✅ Model availability
- ✅ Statistics tracking
- ✅ Integration workflows

## Performance

### Latency Benchmarks

| Model | Avg Latency | Context Window | Size |
|-------|------------|----------------|------|
| soulfra-model | ~5-15s | 16K tokens | 3.8 GB |
| deathtodata-model | ~2-8s | 8K tokens | 986 MB |
| publishing-model | ~4-12s | 8K tokens | 2.0 GB |
| calos-model | ~4-12s | 8K tokens | 2.0 GB |
| drseuss-model | ~4-12s | 8K tokens | 2.0 GB |

*Benchmarks on M1 Mac with 16GB RAM*

### Cost Comparison

| Provider | Cost per 1M tokens |
|----------|-------------------|
| Ollama (all domains) | **$0.00** |
| DeepSeek | $0.14 |
| OpenAI GPT-3.5 | $3.00 |
| Anthropic Claude | $15.00 |

## Advanced Usage

### Multi-Domain Workflows

```javascript
// Workflow combining multiple domains
async function buildSecureAPI() {
  // 1. Design crypto (soulfra-model)
  const crypto = await router.complete({
    prompt: 'Design Ed25519 authentication for API',
    taskType: 'cryptography'
  });

  // 2. Process data (deathtodata-model)
  const data = await router.complete({
    prompt: 'Design JSON schema for user data',
    taskType: 'data'
  });

  // 3. Document (publishing-model)
  const docs = await router.complete({
    prompt: 'Write API docs for secure user authentication',
    taskType: 'publishing'
  });

  return { crypto, data, docs };
}
```

### Custom Domain Detection

Extend keyword detection in `lib/multi-llm-router.js`:

```javascript
_inferTaskType(prompt) {
  const lower = prompt.toLowerCase();

  // Add custom keywords
  if (lower.includes('my-custom-keyword')) {
    return 'cryptography'; // Route to specific domain
  }

  // ... existing logic
}
```

### Streaming Responses

```javascript
const response = await router.stream(
  {
    prompt: 'Explain Ed25519 in detail',
    taskType: 'cryptography'
  },
  (chunk) => {
    process.stdout.write(chunk); // Stream output in real-time
  }
);
```

## Troubleshooting

### Model Not Found

```
Error: Ollama model 'soulfra-model' not found
```

**Solution**: Build the model:
```bash
cd modelfiles
ollama create soulfra-model -f Modelfile.soulfra
```

### Ollama Not Running

```
Error: Ollama provider not available. Is Ollama running?
```

**Solution**: Start Ollama:
```bash
ollama serve
```

### Wrong Model Selected

The router chose the wrong domain model.

**Solution**: Explicitly specify taskType:
```javascript
await router.complete({
  prompt: 'Your prompt',
  taskType: 'cryptography' // Force specific domain
});
```

### Poor Quality Output

**Solution**: Check model temperature and try rebuilding:
```bash
ollama rm soulfra-model
ollama create soulfra-model -f Modelfile.soulfra
```

## Future Enhancements

### Planned Features

1. **Lorax Integration**: Multi-LoRA adapter serving for scaling to 1000s of models
2. **Fine-tuning Pipeline**: Custom training on domain-specific datasets
3. **Model Versioning**: Track and rollback model versions
4. **A/B Testing**: Compare domain models vs general models
5. **Hybrid Routing**: Mix local + cloud for optimal cost/quality

### Contributing Models

Want to add a new domain model?

1. Create Modelfile in `modelfiles/Modelfile.mymodel`
2. Add to `ollama-adapter.js` domainModels mapping
3. Add keyword detection in `multi-llm-router.js`
4. Add tests in `test/domain-models.test.js`
5. Update this documentation

## References

- [Ollama Documentation](https://github.com/ollama/ollama)
- [Modelfile Syntax](https://github.com/ollama/ollama/blob/main/docs/modelfile.md)
- [Lorax Multi-LoRA](https://github.com/predibase/lorax)
- [CalOS Architecture](../CALOS-ARCHITECTURE.md)
- [Soulfra Identity](../SOULFRA-IDENTITY.md)

## License

MIT License - See LICENSE file for details.
