/**
 * Cal Voice Brand Builder
 *
 * Connects Cal's autonomous system with voice handler and Ollama to build brands.
 * Enables "yap to AI and it builds brands" functionality.
 *
 * Flow:
 * 1. Voice command: "Create a new brand called EcoTrack for environmental monitoring"
 * 2. Whisper transcribes → Cal parses command
 * 3. Cal uses Ollama to generate brand content (tagline, colors, features, tools)
 * 4. Cal creates brand folder/project structure
 * 5. Cal updates BRANDS_REGISTRY.json
 * 6. Cal triggers sync to all platforms (GitHub, Sheets, Gist, GoDaddy)
 * 7. Cal trains brand-specific Ollama model on generated docs
 *
 * Example:
 *   const builder = new CalVoiceBrandBuilder({ whisper, ollama, registry });
 *   await builder.processVoiceCommand(audioBuffer);
 *   // Transcribes, parses, generates brand, creates project, syncs
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class CalVoiceBrandBuilder {
  constructor(options = {}) {
    // Dependencies
    this.whisperHandler = options.whisperHandler; // WhisperVoiceHandler instance
    this.ollamaTrainer = options.ollamaTrainer; // OllamaBotTrainer instance
    this.registrySync = options.registrySync; // BrandRegistrySync instance

    this.config = {
      registryPath: options.registryPath || path.join(__dirname, '../brands/BRANDS_REGISTRY.json'),
      projectsRoot: options.projectsRoot || path.join(__dirname, '../projects'),
      ollamaModel: options.ollamaModel || 'llama3.2:3b',
      verbose: options.verbose || false
    };

    this.registry = null;

    console.log('[CalVoiceBrandBuilder] Initialized');
    console.log('[CalVoiceBrandBuilder] Cal can now build brands via voice commands');
  }

  /**
   * Process voice command from audio buffer
   */
  async processVoiceCommand(audioBuffer) {
    try {
      console.log('[CalVoiceBrandBuilder] Processing voice command...');

      // 1. Transcribe audio
      const transcription = await this.whisperHandler.voiceToCommand(audioBuffer);

      if (this.config.verbose) {
        console.log('[CalVoiceBrandBuilder] Transcribed:', transcription.text);
        console.log('[CalVoiceBrandBuilder] Command:', transcription.command);
      }

      // 2. Route command
      const result = await this.routeCommand(transcription.command);

      return {
        success: true,
        transcription,
        result
      };

    } catch (error) {
      console.error('[CalVoiceBrandBuilder] Error processing voice command:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Route parsed command to appropriate handler
   */
  async routeCommand(command) {
    switch (command.type) {
      case 'create_brand':
        return await this.createBrand(command.name, command.description);

      case 'deploy':
        return await this.deployBrand(command.target);

      case 'add_feature':
        return await this.addFeatureToBrand(command.feature, command.brand);

      case 'status':
        return await this.getBrandStatus(command.target);

      default:
        return {
          success: false,
          message: `Unknown command type: ${command.type}`,
          suggestion: 'Try: "Create a new brand called X" or "Deploy Y"'
        };
    }
  }

  /**
   * Create a new brand
   *
   * Steps:
   * 1. Use Ollama to generate brand content
   * 2. Create brand folder structure
   * 3. Add to BRANDS_REGISTRY.json
   * 4. Sync to all platforms
   * 5. Train brand-specific Ollama model
   */
  async createBrand(brandName, description = null) {
    try {
      console.log(`[CalVoiceBrandBuilder] Creating brand: ${brandName}`);

      // Load registry
      await this.loadRegistry();

      // Check if brand already exists
      const existing = this.registry.brands.find(b =>
        b.name.toLowerCase() === brandName.toLowerCase()
      );

      if (existing) {
        return {
          success: false,
          message: `Brand "${brandName}" already exists (${existing.domain})`,
          existing
        };
      }

      // 1. Generate brand content using Ollama
      const brandContent = await this.generateBrandContent(brandName, description);

      // 2. Create brand folder structure
      const projectPath = await this.createBrandFolder(brandContent);

      // 3. Add to registry
      const brandEntry = await this.addToRegistry(brandContent);

      // 4. Sync to all platforms
      const syncResult = await this.registrySync.syncAll();

      // 5. Train brand-specific Ollama model (async)
      this.trainBrandModel(brandContent).catch(err => {
        console.error('[CalVoiceBrandBuilder] Model training failed:', err.message);
      });

      return {
        success: true,
        brand: brandEntry,
        projectPath,
        syncResult,
        message: `✅ Brand "${brandName}" created successfully!`
      };

    } catch (error) {
      console.error('[CalVoiceBrandBuilder] Error creating brand:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate brand content using Ollama
   */
  async generateBrandContent(brandName, description) {
    console.log(`[CalVoiceBrandBuilder] Generating content for ${brandName} using Ollama...`);

    const prompt = `You are a brand strategist. Create a complete brand identity for a new tech startup.

Brand Name: ${brandName}
${description ? `Description: ${description}` : ''}

Generate the following in JSON format:
{
  "name": "${brandName}",
  "domain": "[suggest .com domain]",
  "tagline": "[10-15 word compelling tagline]",
  "tier": "[foundation/business/creative/additional]",
  "type": "[platform/identity/content/productivity/development/marketplace/gaming/templates/branding/social/technical]",
  "colors": {
    "primary": "[hex color]",
    "secondary": "[hex color]",
    "accent": "[hex color]"
  },
  "features": ["feature 1", "feature 2", "feature 3", "feature 4"],
  "tools": ["tool1", "tool2", "tool3", "tool4"],
  "revenue": "[revenue model description]",
  "ollamaModels": ["${brandName.toLowerCase()}-model"]
}

Only respond with valid JSON, no other text.`;

    try {
      // Call Ollama API
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const command = `ollama run ${this.config.ollamaModel} "${escapedPrompt}"`;

      const { stdout } = await execAsync(command);

      // Parse JSON response
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Ollama did not return valid JSON');
      }

      const brandContent = JSON.parse(jsonMatch[0]);

      if (this.config.verbose) {
        console.log('[CalVoiceBrandBuilder] Generated brand content:', brandContent);
      }

      return brandContent;

    } catch (error) {
      console.error('[CalVoiceBrandBuilder] Ollama generation failed, using defaults:', error.message);

      // Fallback to basic generation
      return {
        name: brandName,
        domain: `${brandName.toLowerCase().replace(/\s+/g, '')}.com`,
        tagline: description || `Innovative solutions with ${brandName}`,
        tier: 'additional',
        type: 'platform',
        colors: {
          primary: '#3498db',
          secondary: '#2ecc71',
          accent: '#e74c3c'
        },
        features: [
          'Easy to use interface',
          'Real-time collaboration',
          'Secure and private',
          'Mobile-friendly'
        ],
        tools: ['core-engine', 'api-gateway', 'analytics-dashboard'],
        revenue: 'Freemium ($0-$49/mo)',
        ollamaModels: [`${brandName.toLowerCase()}-model`]
      };
    }
  }

  /**
   * Create brand folder structure
   */
  async createBrandFolder(brandContent) {
    const folderName = brandContent.domain.replace('.com', '');
    const projectPath = path.join(this.config.projectsRoot, `${folderName}.github.io`);

    console.log(`[CalVoiceBrandBuilder] Creating project folder: ${projectPath}`);

    try {
      // Create directory
      await fs.mkdir(projectPath, { recursive: true });

      // Create index.html
      const html = this.generateIndexHTML(brandContent);
      await fs.writeFile(path.join(projectPath, 'index.html'), html);

      // Create CSS theme
      const css = this.generateThemeCSS(brandContent);
      await fs.mkdir(path.join(projectPath, 'themes'), { recursive: true });
      await fs.writeFile(path.join(projectPath, 'themes', `${folderName}.css`), css);

      // Create README.md
      const readme = this.generateReadme(brandContent);
      await fs.writeFile(path.join(projectPath, 'README.md'), readme);

      // Create package.json
      const packageJson = this.generatePackageJson(brandContent);
      await fs.writeFile(path.join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));

      console.log(`[CalVoiceBrandBuilder] ✅ Project created at ${projectPath}`);

      return projectPath;

    } catch (error) {
      console.error('[CalVoiceBrandBuilder] Error creating folder:', error);
      throw error;
    }
  }

  /**
   * Generate index.html
   */
  generateIndexHTML(brand) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brand.name} - ${brand.tagline}</title>
  <link rel="stylesheet" href="themes/${brand.domain.replace('.com', '')}.css">
</head>
<body>
  <header>
    <h1>${brand.name}</h1>
    <p class="tagline">${brand.tagline}</p>
  </header>

  <main>
    <section class="features">
      <h2>Features</h2>
      <ul>
        ${brand.features.map(f => `<li>${f}</li>`).join('\n        ')}
      </ul>
    </section>

    <section class="cta">
      <h2>Get Started</h2>
      <p>Experience ${brand.name} today.</p>
      <button class="btn-primary">Sign Up Free</button>
    </section>
  </main>

  <footer>
    <p>&copy; ${new Date().getFullYear()} ${brand.name}. Part of the CALOS ecosystem.</p>
  </footer>
</body>
</html>`;
  }

  /**
   * Generate theme CSS
   */
  generateThemeCSS(brand) {
    return `:root {
  --primary: ${brand.colors.primary};
  --secondary: ${brand.colors.secondary};
  --accent: ${brand.colors.accent};
  --bg: #1a1a1a;
  --text: #ffffff;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}

header {
  text-align: center;
  padding: 4rem 2rem;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
}

h1 {
  font-size: 3rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.tagline {
  font-size: 1.5rem;
  opacity: 0.9;
}

main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 4rem 2rem;
}

section {
  margin-bottom: 4rem;
}

h2 {
  font-size: 2rem;
  margin-bottom: 1.5rem;
  color: var(--primary);
}

ul {
  list-style: none;
}

li {
  padding: 0.75rem 0;
  padding-left: 1.5rem;
  position: relative;
}

li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: var(--accent);
  font-weight: bold;
}

.btn-primary {
  background: var(--accent);
  color: white;
  border: none;
  padding: 1rem 2rem;
  font-size: 1.1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

footer {
  text-align: center;
  padding: 2rem;
  opacity: 0.7;
}

.cta {
  text-align: center;
  background: rgba(255,255,255,0.05);
  padding: 3rem;
  border-radius: 12px;
}`;
  }

  /**
   * Generate README.md
   */
  generateReadme(brand) {
    return `# ${brand.name}

${brand.tagline}

## Features

${brand.features.map(f => `- ${f}`).join('\n')}

## Tools

${brand.tools.map(t => `- ${t}`).join('\n')}

## Revenue Model

${brand.revenue}

## Part of CALOS Ecosystem

${brand.name} is part of the [CALOS](https://soulfra.com) 12-brand ecosystem, providing universal identity and AI-powered services.

---

Built with ❤️ by the CALOS team
`;
  }

  /**
   * Generate package.json
   */
  generatePackageJson(brand) {
    return {
      name: brand.domain.replace('.com', ''),
      version: '1.0.0',
      description: brand.tagline,
      main: 'index.html',
      scripts: {
        start: 'npx serve .',
        deploy: 'bash ../deploy.sh'
      },
      keywords: brand.features.slice(0, 5),
      author: 'CALOS Team',
      license: 'MIT'
    };
  }

  /**
   * Add brand to registry
   */
  async addToRegistry(brandContent) {
    await this.loadRegistry();

    // Determine next ID and launch order
    const nextId = Math.max(...this.registry.brands.map(b => b.id)) + 1;
    const nextLaunchOrder = Math.max(...this.registry.brands.map(b => b.launchOrder)) + 1;

    const brandEntry = {
      id: nextId,
      domain: brandContent.domain,
      name: brandContent.name,
      tagline: brandContent.tagline,
      tier: brandContent.tier,
      launchOrder: nextLaunchOrder,
      type: brandContent.type,
      status: 'planned',
      tools: brandContent.tools,
      ollamaModels: brandContent.ollamaModels,
      colors: brandContent.colors,
      features: brandContent.features,
      revenue: brandContent.revenue,
      dependencies: [],
      github: {
        repo: `Soulfra/${brandContent.domain.replace('.com', '')}.github.io`,
        url: null,
        status: 'planned'
      },
      godaddy: {
        domain: brandContent.domain,
        status: 'available',
        registrar: null,
        expiresAt: null
      },
      social: {
        twitter: null,
        discord: null
      }
    };

    // Add to registry
    this.registry.brands.push(brandEntry);
    this.registry.totalBrands++;
    this.registry.lastUpdated = new Date().toISOString();

    // Save registry
    await fs.writeFile(
      this.config.registryPath,
      JSON.stringify(this.registry, null, 2)
    );

    console.log(`[CalVoiceBrandBuilder] ✅ Added ${brandContent.name} to registry (ID: ${nextId})`);

    return brandEntry;
  }

  /**
   * Train brand-specific Ollama model
   */
  async trainBrandModel(brandContent) {
    if (!this.ollamaTrainer) {
      console.log('[CalVoiceBrandBuilder] Ollama trainer not available, skipping model training');
      return;
    }

    console.log(`[CalVoiceBrandBuilder] Training Ollama model for ${brandContent.name}...`);

    try {
      // Create brand documentation
      const docs = `
Brand: ${brandContent.name}
Domain: ${brandContent.domain}
Tagline: ${brandContent.tagline}
Type: ${brandContent.type}
Tier: ${brandContent.tier}

Features:
${brandContent.features.map(f => `- ${f}`).join('\n')}

Tools:
${brandContent.tools.map(t => `- ${t}`).join('\n')}

Revenue Model:
${brandContent.revenue}
`;

      // Train model
      const modelName = brandContent.ollamaModels[0];
      await this.ollamaTrainer.trainFromDocs(docs, modelName);

      console.log(`[CalVoiceBrandBuilder] ✅ Trained model: ${modelName}`);

    } catch (error) {
      console.error('[CalVoiceBrandBuilder] Model training failed:', error.message);
    }
  }

  /**
   * Deploy brand
   */
  async deployBrand(brandName) {
    // TODO: Implement deployment logic
    return {
      success: false,
      message: 'Deployment not yet implemented',
      suggestion: 'Use deploy.sh script manually for now'
    };
  }

  /**
   * Add feature to brand
   */
  async addFeatureToBrand(feature, brandName) {
    // TODO: Implement feature addition
    return {
      success: false,
      message: 'Feature addition not yet implemented'
    };
  }

  /**
   * Get brand status
   */
  async getBrandStatus(brandName) {
    await this.loadRegistry();

    const brand = this.registry.brands.find(b =>
      b.name.toLowerCase() === brandName.toLowerCase() ||
      b.domain.toLowerCase().includes(brandName.toLowerCase())
    );

    if (!brand) {
      return {
        success: false,
        message: `Brand "${brandName}" not found`
      };
    }

    return {
      success: true,
      brand: {
        name: brand.name,
        domain: brand.domain,
        status: brand.status,
        githubStatus: brand.github.status,
        godaddyStatus: brand.godaddy.status,
        tier: brand.tier,
        launchOrder: brand.launchOrder
      }
    };
  }

  /**
   * Load registry from JSON
   */
  async loadRegistry() {
    if (this.registry) return this.registry;

    const content = await fs.readFile(this.config.registryPath, 'utf8');
    this.registry = JSON.parse(content);

    return this.registry;
  }
}

module.exports = CalVoiceBrandBuilder;
