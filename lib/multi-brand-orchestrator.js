/**
 * Multi-Brand Orchestrator
 *
 * Manages the launch and operation of 12 interconnected brands for the BillionDollarGame.
 * Each brand uses shared infrastructure (Soulfra SSO, Calriven AI, etc.) but has unique features.
 *
 * Architecture:
 * - Foundation Layer: soulfra.com, calriven.com, deathtodata.com (must launch first)
 * - Business Layer: finishthisidea.com, finishthisrepo.com, ipomyagent.com
 * - Creative Layer: hollowtown.com, coldstartkit.com, brandaidkit.com
 * - Additional: dealordelete.com, saveorsink.com, cringeproof.com
 *
 * Each brand has:
 * - Unique domain and branding
 * - Specific AI models and personalities
 * - Dependencies on other brands
 * - Own affiliate program
 * - Shared user identity (via Soulfra)
 */

const BrandPresentationGenerator = require('./brand-presentation-generator');
const IconGenerator = require('./icon-generator');
const AffiliateTracker = require('./affiliate-tracker');

class MultiBrandOrchestrator {
  constructor(options = {}) {
    this.userId = options.userId || 'user-001'; // The founder (User #1)
    this.projectStartDate = options.startDate || new Date('2025-01-15');

    // Brand configurations
    this.brands = this._loadBrandConfigs();

    // Track launch status
    this.launchStatus = new Map(); // brandDomain => { status, startedAt, completedAt, progress }

    // Dependencies between brands
    this.dependencies = this._loadDependencies();

    // Shared services
    this.brandGenerator = new BrandPresentationGenerator();
    this.iconGenerator = options.iconGenerator || null; // Optional icon gen

    console.log('[MultiBrandOrchestrator] Initialized with 12 brands');
  }

  /**
   * Load brand configurations from BRANDS_REGISTRY.json
   */
  _loadBrandConfigs() {
    try {
      const fs = require('fs');
      const path = require('path');
      const registryPath = path.join(__dirname, '../brands/BRANDS_REGISTRY.json');

      if (fs.existsSync(registryPath)) {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        console.log(`[MultiBrandOrchestrator] Loaded ${registry.totalBrands} brands from registry`);

        // Convert registry format to orchestrator format
        const brands = {};
        for (const brand of registry.brands) {
          brands[brand.domain] = {
            name: brand.name,
            tagline: brand.tagline,
            tier: brand.tier,
            launchOrder: brand.launchOrder,
            type: brand.type,
            tools: brand.tools,
            aiModels: brand.ollamaModels,
            colors: brand.colors,
            features: brand.features,
            revenue: brand.revenue,
            status: brand.status,
            github: brand.github,
            godaddy: brand.godaddy
          };
        }

        return brands;
      } else {
        console.log('[MultiBrandOrchestrator] Registry not found, using fallback configs');
        return this._getFallbackConfigs();
      }
    } catch (error) {
      console.error('[MultiBrandOrchestrator] Error loading registry:', error.message);
      return this._getFallbackConfigs();
    }
  }

  /**
   * Fallback brand configs (if registry doesn't exist)
   */
  _getFallbackConfigs() {
    return {
      // === FOUNDATION LAYER (Launch First) ===
      'soulfra.com': {
        name: 'Soulfra',
        tagline: 'Universal Identity Without KYC',
        tier: 'foundation',
        launchOrder: 1,
        type: 'identity',
        tools: [
          'auth-system',      // User authentication
          'sso-setup',        // Single sign-on
          'ed25519-crypto',   // Cryptography
          'passkey-auth'      // WebAuthn
        ],
        aiModels: ['soulfra-model'], // Uses soulfra-model from Ollama
        colors: {
          primary: '#3498db',
          secondary: '#2ecc71',
          accent: '#e74c3c'
        },
        features: [
          'Universal login for all 12 brands',
          'No KYC required',
          'Ed25519 key pairs',
          'Zero-knowledge proofs'
        ],
        revenue: 'SaaS ($10/mo per user across all brands)'
      },

      'calriven.com': {
        name: 'Calriven',
        tagline: 'AI Agent Operating System',
        tier: 'foundation',
        launchOrder: 2,
        type: 'platform',
        tools: [
          'agent-registry',
          'multi-llm-router',
          'agent-selector',
          'elo-system'
        ],
        aiModels: ['calos-model', 'calos-expert'],
        colors: {
          primary: '#667eea',
          secondary: '#764ba2',
          accent: '#61dafb'
        },
        features: [
          'AI agent marketplace',
          'Multi-model routing',
          'ELO-based selection',
          'Skill progression system'
        ],
        revenue: 'Platform fee (30% of agent transactions)'
      },

      'deathtodata.com': {
        name: 'DeathToData',
        tagline: 'Search Engine Philosophy',
        tier: 'foundation',
        launchOrder: 3,
        type: 'content',
        tools: [
          'search-engine',
          'content-indexer',
          'philosophy-db',
          'knowledge-graph'
        ],
        aiModels: ['deathtodata-model'],
        colors: {
          primary: '#e74c3c',
          secondary: '#c0392b',
          accent: '#f39c12'
        },
        features: [
          'Philosophical search',
          'Cross-brand content discovery',
          'Knowledge graph',
          'Anti-data-hoarding stance'
        ],
        revenue: 'Ads + Premium search ($5/mo)'
      },

      // === BUSINESS LAYER ===
      'finishthisidea.com': {
        name: 'FinishThisIdea',
        tagline: 'Project Completion Service',
        tier: 'business',
        launchOrder: 4,
        type: 'productivity',
        tools: [
          'project-tracker',
          'ai-assistant',
          'payment-processing',
          'milestone-system'
        ],
        aiModels: ['llama3.2:3b', 'codellama:7b'],
        colors: {
          primary: '#4CAF50',
          secondary: '#45a049',
          accent: '#FFC107'
        },
        features: [
          'AI helps finish abandoned projects',
          'Milestone tracking',
          'Freelancer marketplace',
          'Escrow payments'
        ],
        revenue: 'Service fee (20% of project value)'
      },

      'finishthisrepo.com': {
        name: 'FinishThisRepo',
        tagline: 'Code Completion Marketplace',
        tier: 'business',
        launchOrder: 5,
        type: 'development',
        tools: [
          'github-integration',
          'code-analyzer',
          'bounty-system',
          'pr-reviewer'
        ],
        aiModels: ['codellama:7b-code', 'codellama:7b-instruct'],
        colors: {
          primary: '#24292e',
          secondary: '#0366d6',
          accent: '#28a745'
        },
        features: [
          'Finish incomplete GitHub repos',
          'Code bounties',
          'AI code review',
          'Auto-PR generation'
        ],
        revenue: 'Bounty fee (15% of bounty value)'
      },

      'ipomyagent.com': {
        name: 'IPOMyAgent',
        tagline: 'AI Agent Marketplace',
        tier: 'business',
        launchOrder: 6,
        type: 'marketplace',
        tools: [
          'agent-marketplace',
          'revenue-sharing',
          'ipo-simulation',
          'investor-dashboard'
        ],
        aiModels: ['calos-expert', 'llama3.2:3b'],
        colors: {
          primary: '#9C27B0',
          secondary: '#7B1FA2',
          accent: '#E91E63'
        },
        features: [
          'List AI agents for sale',
          'Fractional ownership',
          'IPO simulation',
          'Revenue sharing'
        ],
        revenue: 'Listing fee ($50) + Transaction fee (10%)'
      },

      // === CREATIVE LAYER ===
      'hollowtown.com': {
        name: 'HollowTown',
        tagline: 'Virtual World Platform',
        tier: 'creative',
        launchOrder: 7,
        type: 'gaming',
        tools: [
          'sprite-manager',
          'game-engine',
          'multiplayer-sync',
          'virtual-economy'
        ],
        aiModels: ['soulfra-model', 'visual-expert'],
        colors: {
          primary: '#8B4513',
          secondary: '#A0522D',
          accent: '#FFD700'
        },
        features: [
          'Virtual town builder',
          'Multiplayer gaming',
          'NFT-based assets',
          'In-game economy'
        ],
        revenue: 'In-game purchases + Land sales'
      },

      'coldstartkit.com': {
        name: 'ColdStartKit',
        tagline: 'Startup Launch Templates',
        tier: 'creative',
        launchOrder: 8,
        type: 'templates',
        tools: [
          'template-generator',
          'deployment-wizard',
          'analytics-setup',
          'growth-toolkit'
        ],
        aiModels: ['llama3.2:3b', 'publishing-model'],
        colors: {
          primary: '#00BCD4',
          secondary: '#0097A7',
          accent: '#FF5722'
        },
        features: [
          'Launch starter kits',
          'One-click deployment',
          'Growth playbooks',
          'Template marketplace'
        ],
        revenue: 'Template sales ($49-$499) + Pro tier ($29/mo)'
      },

      'brandaidkit.com': {
        name: 'BrandAidKit',
        tagline: 'Complete Brand Creation Platform',
        tier: 'creative',
        launchOrder: 9,
        type: 'branding',
        tools: [
          'brand-presentation-generator',
          'icon-generator',
          'sprite-manager',
          'gif-renderer',
          'multi-brand-poster',
          'qr-generator'
        ],
        aiModels: ['visual-expert', 'soulfra-model', 'publishing-model'],
        colors: {
          primary: '#FF6B6B',
          secondary: '#4ECDC4',
          accent: '#FFE66D'
        },
        features: [
          'Logo generation',
          'Mascot creation',
          'Brand guidelines',
          'Social media kit',
          'Website templates'
        ],
        revenue: 'Brand package sales ($199-$999) + Monthly design subscription ($49/mo)'
      },

      // === ADDITIONAL BRANDS ===
      'dealordelete.com': {
        name: 'DealOrDelete',
        tagline: 'Decision Making Tool',
        tier: 'additional',
        launchOrder: 10,
        type: 'productivity',
        tools: ['decision-matrix', 'ai-advisor', 'voting-system'],
        aiModels: ['llama3.2:3b'],
        colors: { primary: '#FF9800', secondary: '#F57C00', accent: '#FFC107' },
        features: ['AI-powered decisions', 'Team voting', 'Decision tracking'],
        revenue: 'Freemium ($0-$19/mo)'
      },

      'saveorsink.com': {
        name: 'SaveOrSink',
        tagline: 'System Rescue Service',
        tier: 'additional',
        launchOrder: 11,
        type: 'technical',
        tools: ['system-monitor', 'auto-recovery', 'backup-system'],
        aiModels: ['calos-expert'],
        colors: { primary: '#2196F3', secondary: '#1976D2', accent: '#FFC107' },
        features: ['Auto-recovery', 'System monitoring', 'Disaster recovery'],
        revenue: 'Service fee ($99-$499/incident)'
      },

      'cringeproof.com': {
        name: 'CringeProof',
        tagline: 'Social Content Optimizer',
        tier: 'additional',
        launchOrder: 12,
        type: 'social',
        tools: ['content-analyzer', 'cringe-detector', 'improvement-suggester'],
        aiModels: ['soulfra-model', 'llama3.2:3b'],
        colors: { primary: '#E91E63', secondary: '#C2185B', accent: '#FF4081' },
        features: ['Cringe detection', 'Content improvement', 'Social optimization'],
        revenue: 'Subscription ($9/mo) + API access'
      }
    };
  }

  /**
   * Load brand dependencies
   */
  _loadDependencies() {
    return {
      'soulfra.com': [], // Foundation - no deps
      'calriven.com': [],
      'deathtodata.com': [],
      'finishthisidea.com': ['soulfra.com', 'calriven.com'], // Needs auth + AI
      'finishthisrepo.com': ['soulfra.com', 'calriven.com'],
      'ipomyagent.com': ['soulfra.com', 'calriven.com'],
      'hollowtown.com': ['soulfra.com'],
      'coldstartkit.com': ['soulfra.com'],
      'brandaidkit.com': ['soulfra.com', 'calriven.com', 'deathtodata.com'], // Needs all foundation
      'dealordelete.com': ['soulfra.com'],
      'saveorsink.com': ['soulfra.com', 'calriven.com'],
      'cringeproof.com': ['soulfra.com']
    };
  }

  /**
   * Get next brand to launch (based on dependencies)
   */
  getNextBrandToLaunch() {
    const launched = Array.from(this.launchStatus.entries())
      .filter(([domain, status]) => status.status === 'completed')
      .map(([domain]) => domain);

    for (const [domain, config] of Object.entries(this.brands)) {
      const alreadyLaunched = launched.includes(domain);
      if (alreadyLaunched) continue;

      const deps = this.dependencies[domain] || [];
      const depsReady = deps.every(dep => launched.includes(dep));

      if (depsReady) {
        return { domain, config };
      }
    }

    return null; // All brands launched!
  }

  /**
   * Get launch status for all brands
   */
  getStatus() {
    const now = new Date();
    const daysRunning = Math.floor((now - this.projectStartDate) / (1000 * 60 * 60 * 24));

    const launched = Array.from(this.launchStatus.entries())
      .filter(([, status]) => status.status === 'completed')
      .length;

    return {
      userId: this.userId,
      startDate: this.projectStartDate.toISOString(),
      currentDay: daysRunning,
      brandsLaunched: launched,
      totalBrands: Object.keys(this.brands).length,
      brands: Object.entries(this.brands).map(([domain, config]) => ({
        domain,
        name: config.name,
        tier: config.tier,
        launchOrder: config.launchOrder,
        status: this.launchStatus.get(domain) || { status: 'pending', progress: 0 }
      }))
    };
  }

  /**
   * Start launching a brand
   */
  async launchBrand(domain) {
    const config = this.brands[domain];
    if (!config) {
      throw new Error(`Brand not found: ${domain}`);
    }

    // Check dependencies
    const deps = this.dependencies[domain] || [];
    const launched = Array.from(this.launchStatus.entries())
      .filter(([, status]) => status.status === 'completed')
      .map(([d]) => d);

    const missingDeps = deps.filter(dep => !launched.includes(dep));
    if (missingDeps.length > 0) {
      throw new Error(`Missing dependencies: ${missingDeps.join(', ')}`);
    }

    // Mark as in progress
    this.launchStatus.set(domain, {
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      progress: 0
    });

    console.log(`[MultiBrandOrchestrator] Launching ${config.name} (${domain})`);

    // Return tasks needed to launch this brand
    return this._generateBrandTasks(domain, config);
  }

  /**
   * Generate tasks needed to launch a specific brand
   */
  _generateBrandTasks(domain, config) {
    const tasks = [];

    // Common tasks for all brands
    tasks.push(
      { description: `Generate ${config.name} logo concepts`, type: 'logo', tool: 'icon-generator' },
      { description: `Create ${config.name} brand guidelines`, type: 'branding', tool: 'brand-presentation-generator' },
      { description: `Set up ${domain} domain`, type: 'infrastructure', tool: 'domain-setup' },
      { description: `Configure Soulfra SSO for ${domain}`, type: 'auth', tool: 'auth-system' }
    );

    // Brand-specific tasks based on tools
    config.tools.forEach(tool => {
      tasks.push({
        description: `Implement ${tool} for ${config.name}`,
        type: 'feature',
        tool
      });
    });

    // Final tasks
    tasks.push(
      { description: `Deploy ${domain} to production`, type: 'deployment', tool: 'deployment-wizard' },
      { description: `Set up affiliate program for ${domain}`, type: 'monetization', tool: 'affiliate-tracker' }
    );

    return tasks;
  }

  /**
   * Mark brand as launched
   */
  completeBrandLaunch(domain) {
    this.launchStatus.set(domain, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      progress: 100
    });

    console.log(`[MultiBrandOrchestrator] ✅ ${this.brands[domain].name} launched!`);
  }
}

module.exports = MultiBrandOrchestrator;
