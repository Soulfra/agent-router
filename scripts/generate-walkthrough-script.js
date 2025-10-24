#!/usr/bin/env node

/**
 * Walkthrough Script Generator
 *
 * Scans the CALOS codebase and generates:
 * - Recording walkthrough sequence
 * - Feature cards for quick reference
 * - Demo commands
 * - Talking points
 *
 * Usage:
 *   node scripts/generate-walkthrough-script.js
 *   # OR
 *   npm run generate:walkthrough
 */

const fs = require('fs').promises;
const path = require('path');

class WalkthroughGenerator {
  constructor() {
    this.baseDir = path.join(__dirname, '..');
    this.features = [];
  }

  async generate() {
    console.log('🎙️  Scanning CALOS codebase for walkthrough...\n');

    // Scan for features
    await this.scanFeatures();

    // Generate walkthrough sequence
    await this.generateWalkthroughSequence();

    // Generate feature cards
    await this.generateFeatureCards();

    // Generate recording checklist
    await this.generateRecordingChecklist();

    console.log('\n✅ Walkthrough documentation generated!');
    console.log('\n📁 Created:');
    console.log('   - docs/WALKTHROUGH_SEQUENCE.md');
    console.log('   - docs/FEATURE_CARDS/*.md');
    console.log('   - RECORDING_CHECKLIST.md');
    console.log('\n🎬 Ready to record! Check RECORDING_CHECKLIST.md to start.\n');
  }

  async scanFeatures() {
    console.log('Scanning features...');

    // Scan package.json scripts
    const pkg = JSON.parse(await fs.readFile(path.join(this.baseDir, 'package.json'), 'utf8'));

    // Scan lib/ directory
    const libFiles = await fs.readdir(path.join(this.baseDir, 'lib'));

    // Scan public/ HTML files
    const publicFiles = await fs.readdir(path.join(this.baseDir, 'public'));
    const htmlFiles = publicFiles.filter(f => f.endsWith('.html'));

    // Scan migrations
    const migrations = await fs.readdir(path.join(this.baseDir, 'database/migrations'));

    // Define major features (manually curated for best walkthrough)
    this.features = [
      {
        name: 'Quest System',
        priority: 1,
        category: 'Game Platform',
        files: ['lib/quest-engine.js', 'lib/dungeon-master-ai.js', 'database/migrations/141_quest_system.sql'],
        urls: ['http://localhost:5001/game-launcher'],
        demoTime: 10,
        talkingPoints: [
          'Quest-driven platform - unlock apps through gameplay',
          'DND Master narrates your journey',
          'Invite quests, forum quests, collaboration quests',
          'Example: Invite 5 friends → unlock Pro tier'
        ],
        commands: ['npm start', 'open http://localhost:5001/game-launcher']
      },
      {
        name: 'Room Mascots',
        priority: 2,
        category: 'AI Personalities',
        files: ['lib/room-mascot-manager.js', 'lib/room-manager.js'],
        urls: ['http://localhost:5001/rooms'],
        demoTime: 8,
        talkingPoints: [
          'Each room has unique AI personality (like podcast filters)',
          '7 personality types: Meme, Creative, Technical, Zen, etc.',
          'Meme bot: "bruh fr fr here\'s the fix 💀"',
          'Zen bot: "Slow down, quality over speed..."',
          'Custom mascots trained on room code via Ollama'
        ],
        commands: ['npm run ollama:start', 'npm start']
      },
      {
        name: 'Self-Hosted Bot Platform',
        priority: 3,
        category: 'Bot Building',
        files: ['lib/bot-builder.js', 'lib/ollama-bot-trainer.js', 'bin/bot-create'],
        urls: ['http://localhost:5001/bot-builder-dashboard'],
        demoTime: 10,
        talkingPoints: [
          '100% self-hosted, zero cloud dependencies',
          'CLI wizard creates bots in 5 minutes',
          'Train custom personalities with local Ollama',
          'Meme bot personality (funny but functional)',
          'Zero API costs - everything runs locally'
        ],
        commands: ['npm run bot:create', 'npm run ollama:start']
      },
      {
        name: 'Invite System & Circles',
        priority: 4,
        category: 'Viral Growth',
        files: ['lib/invite-quest-tracker.js', 'lib/affiliate-tracker.js', 'database/migrations/063_family_tree_and_spheres.sql'],
        urls: ['http://localhost:5001/invites'],
        demoTime: 8,
        talkingPoints: [
          'Invite tree visualization (who invited whom)',
          'Sphere targeting - invite from college, company, interest groups',
          'Suggested circles: "Invite 47 more Stanford classmates"',
          'Quest integration - invites unlock features',
          'Viral growth mechanics'
        ],
        commands: []
      },
      {
        name: 'Forum & Lore System',
        priority: 5,
        category: 'Community',
        files: ['lib/forum-quest-integration.js', 'lib/lore-bot-generator.js', 'database/migrations/100_game_lore_system.sql'],
        urls: ['http://localhost:5001/forum'],
        demoTime: 7,
        talkingPoints: [
          'Forum participation unlocks features',
          'Quality scoring (upvotes + comments)',
          'Lore bot generates discussions (marked as bot content)',
          'Game lore drives organic conversations',
          'Quest progress through forum engagement'
        ],
        commands: []
      },
      {
        name: 'Multiplayer Portals',
        priority: 6,
        category: 'Collaboration',
        files: ['lib/multiplayer-portal-manager.js', 'database/migrations/071_bucket_portfolio_integration.sql'],
        urls: ['http://localhost:5001/portals'],
        demoTime: 8,
        talkingPoints: [
          'Pokémon-style multiplayer for bucket instances',
          'Real-time chat with WebSockets',
          'Bucket battles (PvP)',
          'Collaborative tasks',
          'Leaderboards and karma'
        ],
        commands: []
      },
      {
        name: 'Network Radar & Process Monitor',
        priority: 7,
        category: 'DevOps',
        files: ['lib/network-traffic-monitor.js', 'lib/network-analytics.js', 'lib/shell-process-manager.js'],
        urls: ['http://localhost:5001/network-radar', 'http://localhost:5001/process-monitor'],
        demoTime: 6,
        talkingPoints: [
          'Real-time network traffic visualization',
          'Process monitoring dashboard',
          'Track connections, bandwidth, protocols',
          'Process CPU/memory stats',
          'CalRiven as CTO can auto-manage'
        ],
        commands: ['npm start']
      },
      {
        name: 'Gmail Relay (Zero Cost)',
        priority: 8,
        category: 'Email',
        files: ['lib/gmail-relay-zero-cost.js', 'lib/google-sheets-db-adapter.js'],
        urls: [],
        demoTime: 5,
        talkingPoints: [
          'Free email relay - no Mailchimp/SendGrid',
          'Uses Gmail SMTP (500/day free)',
          'Google Sheets as database',
          'Double opt-in whitelist',
          'Zero cost alternative'
        ],
        commands: ['npm run gmail:setup:free', 'npm run gmail:poll']
      },
      {
        name: 'CalRiven AI (CTO/CEO)',
        priority: 9,
        category: 'AI Agent',
        files: ['lib/calriven-persona.js', 'lib/company-structure.js', 'lib/calriven-autonomous-mode.js'],
        urls: [],
        demoTime: 7,
        talkingPoints: [
          'AI CTO/CEO with autonomous decision-making',
          'Company structure: you\'re owner, CalRiven is CTO',
          'Autonomous mode - auto-runs tasks',
          'Privacy-first (encrypted vault)',
          'Makes executive decisions within limits'
        ],
        commands: []
      },
      {
        name: 'Pricing & Licensing',
        priority: 10,
        category: 'Business Model',
        files: ['lib/pricing-calculator.js', 'lib/license-verifier.js', 'database/migrations/082_pricing_system.sql'],
        urls: ['http://localhost:5001/pricing-calculator'],
        demoTime: 5,
        talkingPoints: [
          'Development (localhost): $0 forever',
          'Community: $0 + share data OR contribute code',
          'Pro: $29/mo',
          'Self-Hosted: One-time $99 (unlimited)',
          'Quest unlocks - earn features through gameplay'
        ],
        commands: []
      }
    ];

    console.log(`Found ${this.features.length} major features to demonstrate\n`);
  }

  async generateWalkthroughSequence() {
    console.log('Generating walkthrough sequence...');

    const intro = `# 🎙️ CALOS System Walkthrough

**Total Duration:** 60-75 minutes
**Recording Method:** Phone audio + optional screen recording
**Edit Later:** Remove white noise, add timestamps

---

## Pre-Recording Checklist

Before you start recording:

1. **Start all services:**
   \`\`\`bash
   npm run ollama:start  # Start Ollama (local AI)
   npm start             # Start CALOS server
   \`\`\`

2. **Open browser tabs:**
   - http://localhost:5001 (main app)
   - http://localhost:5001/game-launcher (quest system)
   - http://localhost:5001/bot-builder-dashboard (bot platform)
   - http://localhost:5001/network-radar (monitoring)

3. **Audio setup:**
   - Phone on airplane mode (prevent interruptions)
   - Place phone 6-12 inches from mouth
   - Quiet room (minimal background noise)
   - Test recording first (say "testing 1 2 3")

4. **Have ready:**
   - This walkthrough doc open
   - Terminal window visible
   - Browser with localhost tabs

---

## Recording Segments

`;

    let sequence = intro;
    let currentTime = 0;

    sequence += `## Segment 0: Introduction (5 min)\n\n`;
    sequence += `**Start Time:** 00:00\n\n`;
    sequence += `**What to say:**\n\n`;
    sequence += `"Hey, I'm going to walk you through CALOS - the entire system I've built.\n\n`;
    sequence += `It's basically a quest-driven game platform where you unlock apps and features through invites, forum posts, and collaboration.\n\n`;
    sequence += `It sounds complicated but it's actually really intuitive once you see it.\n\n`;
    sequence += `I have like ${await this.countMigrations()} database migrations now which is insane, so instead of trying to explain all that, I'm just going to show you how it actually works.\n\n`;
    sequence += `Let's dive in..."\n\n`;
    sequence += `**Show:** Main dashboard at http://localhost:5001\n\n`;
    sequence += `---\n\n`;

    currentTime += 5;

    // Generate segments for each feature
    this.features.forEach((feature, index) => {
      const segmentNum = index + 1;
      currentTime += feature.demoTime;

      sequence += `## Segment ${segmentNum}: ${feature.name} (${feature.demoTime} min)\n\n`;
      sequence += `**Start Time:** ${this.formatTime(currentTime - feature.demoTime)}\n`;
      sequence += `**Category:** ${feature.category}\n\n`;

      sequence += `**What to say:**\n\n`;
      feature.talkingPoints.forEach(point => {
        sequence += `- "${point}"\n`;
      });
      sequence += `\n`;

      if (feature.urls.length > 0) {
        sequence += `**Show:**\n`;
        feature.urls.forEach(url => {
          sequence += `- ${url}\n`;
        });
        sequence += `\n`;
      }

      if (feature.commands.length > 0) {
        sequence += `**Commands to run:**\n\`\`\`bash\n`;
        feature.commands.forEach(cmd => {
          sequence += `${cmd}\n`;
        });
        sequence += `\`\`\`\n\n`;
      }

      sequence += `**Files to reference:**\n`;
      feature.files.forEach(file => {
        sequence += `- \`${file}\`\n`;
      });
      sequence += `\n`;

      sequence += `---\n\n`;
    });

    // Wrap-up
    currentTime += 5;
    sequence += `## Segment ${this.features.length + 1}: Wrap-Up (5 min)\n\n`;
    sequence += `**Start Time:** ${this.formatTime(currentTime - 5)}\n\n`;
    sequence += `**What to say:**\n\n`;
    sequence += `"So that's CALOS - a quest-driven platform where the game mechanics drive feature unlocks and viral growth.\n\n`;
    sequence += `Everything runs locally with Ollama, zero API costs, completely self-hosted if you want.\n\n`;
    sequence += `The quest system makes it engaging, the DND Master makes it fun, the room mascots make each space unique.\n\n`;
    sequence += `And all of this is built to grow organically through invite circles and forum engagement.\n\n`;
    sequence += `Hope this walkthrough helped you understand how it all fits together!"\n\n`;
    sequence += `**End recording.**\n\n`;

    // Save
    const docsDir = path.join(this.baseDir, 'docs');
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(
      path.join(docsDir, 'WALKTHROUGH_SEQUENCE.md'),
      sequence
    );
  }

  async generateFeatureCards() {
    console.log('Generating feature cards...');

    const cardsDir = path.join(this.baseDir, 'docs/FEATURE_CARDS');
    await fs.mkdir(cardsDir, { recursive: true });

    for (const feature of this.features) {
      const card = this.createFeatureCard(feature);
      const filename = feature.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.md';
      await fs.writeFile(path.join(cardsDir, filename), card);
    }
  }

  createFeatureCard(feature) {
    let card = `# ${feature.name} - Quick Reference Card\n\n`;
    card += `**Category:** ${feature.category}\n`;
    card += `**Demo Time:** ${feature.demoTime} minutes\n`;
    card += `**Priority:** ${feature.priority}\n\n`;
    card += `---\n\n`;

    card += `## What It Is\n\n`;
    card += `${feature.talkingPoints[0]}\n\n`;

    card += `## Key Talking Points\n\n`;
    feature.talkingPoints.forEach((point, i) => {
      if (i > 0) card += `${i}. ${point}\n`;
    });
    card += `\n`;

    if (feature.urls.length > 0) {
      card += `## Demo URLs\n\n`;
      feature.urls.forEach(url => {
        card += `- ${url}\n`;
      });
      card += `\n`;
    }

    if (feature.commands.length > 0) {
      card += `## Commands\n\n`;
      card += `\`\`\`bash\n`;
      feature.commands.forEach(cmd => {
        card += `${cmd}\n`;
      });
      card += `\`\`\`\n\n`;
    }

    card += `## Files\n\n`;
    feature.files.forEach(file => {
      card += `- \`${file}\`\n`;
    });
    card += `\n`;

    card += `## What to Show\n\n`;
    card += `1. Open the demo URL\n`;
    card += `2. Explain the key concept\n`;
    card += `3. Demonstrate the main feature\n`;
    card += `4. Show a real example\n`;
    card += `5. Explain why it matters\n\n`;

    return card;
  }

  async generateRecordingChecklist() {
    console.log('Generating recording checklist...');

    const checklist = `# 🎬 Recording Checklist

## Before You Start

### Environment Setup
- [ ] Run \`npm run ollama:start\` (wait for Ollama to be ready)
- [ ] Run \`npm start\` (wait for server on port 5001)
- [ ] Open browser to http://localhost:5001
- [ ] Check all demo URLs are loading

### Audio Setup
- [ ] Phone on **airplane mode** (no interruptions)
- [ ] Quiet room (close windows, turn off fans)
- [ ] Phone placed 6-12 inches from mouth
- [ ] Voice memo app ready
- [ ] Test recording ("testing 1 2 3", play back to check)

### Reference Materials
- [ ] \`docs/WALKTHROUGH_SEQUENCE.md\` open on computer
- [ ] Terminal window visible for commands
- [ ] Browser with localhost tabs open
- [ ] \`docs/FEATURE_CARDS/\` folder available for quick reference

### Optional (Recommended)
- [ ] Screen recording app ready (QuickTime, OBS, etc.)
- [ ] Water nearby (stay hydrated!)
- [ ] Comfortable seating
- [ ] Good lighting (if doing video)

---

## During Recording

### Pacing
- Speak clearly and naturally (don't rush)
- Pause between segments (easier to edit)
- If you mess up, just pause and restart that sentence
- You can edit out mistakes later

### Audio Quality Tips
- Don't touch/move phone during recording
- Avoid paper rustling near mic
- Minimize keyboard/mouse clicks if possible
- Speak at consistent volume

### Content Tips
- Follow the walkthrough sequence loosely (not rigidly)
- Show, don't just tell (demonstrate features)
- Explain WHY things matter, not just WHAT they do
- Be yourself - natural beats perfect

---

## After Recording

### Immediate Steps
- [ ] Save recording with descriptive name (\`calos-walkthrough-YYYY-MM-DD.m4a\`)
- [ ] Transfer to computer
- [ ] Make backup copy

### Editing (Optional)
- [ ] Use Audacity (free) or iMovie to edit
- [ ] Remove white noise (Audacity: Effect > Noise Reduction)
- [ ] Cut out long pauses/mistakes
- [ ] Normalize audio levels
- [ ] Add timestamps in description

### Optional Enhancements
- [ ] Sync with screen recording
- [ ] Add chapter markers
- [ ] Create separate clips per feature
- [ ] Add intro/outro music (optional)

---

## Estimated Timeline

- Recording: 60-75 minutes
- Editing (basic): 30-60 minutes
- Editing (detailed): 2-3 hours
- **Total:** 1.5-4 hours for full walkthrough

---

## Quick Start

\`\`\`bash
# Terminal 1: Start Ollama
npm run ollama:start

# Terminal 2: Start CALOS
npm start

# Wait 10 seconds, then open browser
open http://localhost:5001

# Start recording on phone
# Follow docs/WALKTHROUGH_SEQUENCE.md
# Hit record and go!
\`\`\`

---

## Tips for Success

1. **Don't aim for perfection** - Authentic > polished
2. **Edit later** - Just keep talking, fix mistakes in post
3. **Show the journey** - Explain your thinking, not just the code
4. **Be enthusiastic** - Your excitement is contagious
5. **Take breaks** - Record in segments if needed

---

**Ready? Hit record and start with Segment 0 (Introduction)!**
`;

    await fs.writeFile(
      path.join(this.baseDir, 'RECORDING_CHECKLIST.md'),
      checklist
    );
  }

  formatTime(minutes) {
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  async countMigrations() {
    try {
      const migrations = await fs.readdir(path.join(this.baseDir, 'database/migrations'));
      return migrations.filter(f => f.endsWith('.sql')).length;
    } catch {
      return 100; // fallback
    }
  }
}

// Run if called directly
if (require.main === module) {
  const generator = new WalkthroughGenerator();
  generator.generate().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = WalkthroughGenerator;
