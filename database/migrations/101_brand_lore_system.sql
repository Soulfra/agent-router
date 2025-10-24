-- ============================================================================
-- Brand Lore System for Multi-Domain Empire
-- ============================================================================
-- Replaces video game lore with YOUR BRAND lore (CALOS, Soulfra, CalRiven, etc.)
-- Uses the same bot system but discusses YOUR tech, philosophy, and ecosystem
--
-- Strategy: Build discussions around YOUR brand mythology, not someone else's games
-- Example topics: "Why does Soulfra prioritize zero-knowledge?", "CALOS routing explained"
-- ============================================================================

-- Rename tables to reflect brand focus
ALTER TABLE IF EXISTS game_lore_games RENAME TO brand_domains;
ALTER TABLE IF EXISTS game_lore_characters RENAME TO brand_personas;
ALTER TABLE IF EXISTS game_lore_events RENAME TO brand_milestones;
ALTER TABLE IF EXISTS game_lore_locations RENAME TO brand_projects;
ALTER TABLE IF EXISTS game_lore_fragments RENAME TO brand_knowledge;
ALTER TABLE IF EXISTS game_lore_discussion_templates RENAME TO brand_discussion_templates;
ALTER TABLE IF EXISTS game_lore_bot_posts RENAME TO brand_bot_posts;

-- Update column names to match brand terminology
ALTER TABLE brand_domains RENAME COLUMN franchise TO ecosystem;
ALTER TABLE brand_domains RENAME COLUMN developer TO creator;
ALTER TABLE brand_domains RENAME COLUMN release_year TO founded_year;
ALTER TABLE brand_domains RENAME COLUMN genre TO focus_area;

ALTER TABLE brand_personas RENAME COLUMN species TO persona_type;
ALTER TABLE brand_personas RENAME COLUMN faction TO domain_affiliation;

ALTER TABLE brand_milestones RENAME COLUMN event_type TO milestone_type;
ALTER TABLE brand_milestones RENAME COLUMN location TO project_scope;

ALTER TABLE brand_projects RENAME COLUMN location_type TO project_type;
ALTER TABLE brand_projects RENAME COLUMN parent_location_id TO parent_project_id;
ALTER TABLE brand_projects RENAME COLUMN inhabitants TO contributors;

ALTER TABLE brand_knowledge RENAME COLUMN fragment_type TO knowledge_type;

ALTER TABLE brand_discussion_templates RENAME COLUMN suitable_for_games TO suitable_for_domains;

ALTER TABLE brand_bot_posts RENAME COLUMN game_id TO domain_id;

-- Clear old video game data
TRUNCATE brand_domains CASCADE;

-- Seed YOUR BRAND data
INSERT INTO brand_domains (slug, name, ecosystem, focus_area, founded_year, creator, description, complexity_level)
VALUES
  (
    'soulfra',
    'Soulfra',
    'CALOS Ecosystem',
    'Identity & Privacy',
    2024,
    'CALOS, Inc.',
    'Privacy-first identity platform using zero-knowledge proofs and cryptographic verification. Dark aesthetic with soul-themed branding. Zero-dependency browser SDK for receipts, email, and payments.',
    10
  ),
  (
    'calos',
    'CALOS Business OS',
    'CALOS Ecosystem',
    'Business Automation',
    2024,
    'CALOS, Inc.',
    'Unified business automation platform with AI routing, POS, transcripts, and multi-domain branding. Agent-based architecture with ELO voting for model selection.',
    9
  ),
  (
    'calriven',
    'CalRiven',
    'CALOS Ecosystem',
    'Publishing & Federation',
    2024,
    'CALOS, Inc.',
    'Federated publishing platform for content creators. Multi-domain content distribution with cross-linking and SEO optimization.',
    8
  ),
  (
    'vibecoding',
    'VibeCoding',
    'CALOS Ecosystem',
    'Knowledge Vault',
    2024,
    'CALOS, Inc.',
    'Knowledge management and librarian platform. Dragon-themed branding. Stores and retrieves information across your domain empire.',
    9
  ),
  (
    'perplexityvault',
    'Perplexity Vault',
    'CALOS Ecosystem',
    'Research & Search',
    2025,
    'CALOS, Inc.',
    'Web search and research aggregation platform. Vault metaphor for saved searches. Purple/blue/gold color scheme. DuckDuckGo integration.',
    8
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  ecosystem = EXCLUDED.ecosystem,
  focus_area = EXCLUDED.focus_area,
  founded_year = EXCLUDED.founded_year,
  creator = EXCLUDED.creator,
  description = EXCLUDED.description,
  complexity_level = EXCLUDED.complexity_level;

-- Seed brand personas (characters → personas)
TRUNCATE brand_personas CASCADE;

INSERT INTO brand_personas (domain_id, slug, name, role, persona_type, domain_affiliation, backstory, motivations)
VALUES
  (
    (SELECT id FROM brand_domains WHERE slug = 'soulfra'),
    'soulfra-guardian',
    'The Soulfra Guardian',
    'Privacy Advocate',
    'AI Persona',
    'Soulfra',
    'An AI persona that embodies Soulfra''s zero-knowledge philosophy. Protects user privacy through cryptographic verification and never stores PII.',
    'Ensure users maintain sovereignty over their own data. Make privacy the default, not the exception.'
  ),
  (
    (SELECT id FROM brand_domains WHERE slug = 'calos'),
    'calos-router',
    'CALOS Agent Router',
    'System Orchestrator',
    'AI Agent',
    'CALOS',
    'Multi-model AI routing system with ELO-based selection. Routes requests to the best model based on performance history and context.',
    'Optimize cost and quality by selecting the right AI model for each task. Free tier using local Ollama, paid tier with OpenAI/Claude.'
  ),
  (
    (SELECT id FROM brand_domains WHERE slug = 'vibecoding'),
    'vibecoding-dragon',
    'The VibeCoding Dragon',
    'Knowledge Keeper',
    'Mythical Guide',
    'VibeCoding',
    'A dragon that hoards knowledge instead of gold. Represents the librarian aspect of VibeCoding - storing and retrieving information.',
    'Build a comprehensive knowledge graph across all CALOS domains. Make information discoverable through semantic search.'
  )
ON CONFLICT (slug) DO NOTHING;

-- Seed brand milestones (events → milestones)
TRUNCATE brand_milestones CASCADE;

INSERT INTO brand_milestones (domain_id, slug, name, milestone_type, timeline, project_scope, description, significance)
VALUES
  (
    (SELECT id FROM brand_domains WHERE slug = 'calos'),
    'unified-api-launch',
    'Unified API Gateway Launch',
    'product_launch',
    'October 2025',
    'Multi-Domain Empire',
    'Launched unified API gateway fronting OpenAI, Ollama, and web search. Single endpoint for all AI needs across 5 domains.',
    10
  ),
  (
    (SELECT id FROM brand_domains WHERE slug = 'soulfra'),
    'zero-knowledge-sdk',
    'Zero-Knowledge SDK Release',
    'technology',
    'October 2025',
    'Soulfra Platform',
    'Released zero-dependency browser SDK using AES-256-GCM encryption. No npm install required - just copy/paste.',
    9
  ),
  (
    (SELECT id FROM brand_domains WHERE slug = 'perplexityvault'),
    'perplexity-vault-brand',
    'Perplexity Vault Brand Launch',
    'branding',
    'October 2025',
    'New Domain',
    'Created new brand identity for search-focused domain. Vault metaphor for saved searches, purple/blue/gold color scheme.',
    8
  )
ON CONFLICT (slug) DO NOTHING;

-- Seed brand projects (locations → projects)
TRUNCATE brand_projects CASCADE;

INSERT INTO brand_projects (domain_id, slug, name, project_type, description, significance)
VALUES
  (
    (SELECT id FROM brand_domains WHERE slug = 'soulfra'),
    'soulfra-github-io',
    'soulfra.github.io',
    'website',
    'GitHub Pages site for CalOS Platform. Zero-dependency SDK, privacy dashboard, and GIST-ready single file. Now live at https://soulfra.github.io',
    'Primary marketing funnel and developer onboarding for Soulfra platform.'
  ),
  (
    (SELECT id FROM brand_domains WHERE slug = 'calos'),
    'agent-router',
    'Agent Router Platform',
    'repository',
    'Main CALOS repository with AI routing, Gmail webhook, lofi streaming, ELO voting, and community acquisition tools.',
    'Core infrastructure powering all CALOS domains.'
  ),
  (
    (SELECT id FROM brand_domains WHERE slug = 'vibecoding'),
    'knowledge-vault',
    'VibeCoding Knowledge Vault',
    'platform',
    'Knowledge management system using vector embeddings and semantic search. Dragon-themed librarian for domain empire.',
    'Long-term memory system for all CALOS brands.'
  )
ON CONFLICT (slug) DO NOTHING;

-- Seed brand knowledge (lore fragments → knowledge)
TRUNCATE brand_knowledge CASCADE;

INSERT INTO brand_knowledge (domain_id, slug, title, knowledge_type, content, source, interpretation_difficulty)
VALUES
  (
    (SELECT id FROM brand_domains WHERE slug = 'soulfra'),
    'zero-knowledge-philosophy',
    'Why Soulfra Uses Zero-Knowledge Proofs',
    'philosophy',
    'Soulfra prioritizes user privacy by design. Zero-knowledge proofs allow verification without revealing the underlying data. This means users can prove they own an email or identity without exposing PII to servers.',
    'Soulfra Documentation',
    7
  ),
  (
    (SELECT id FROM brand_domains WHERE slug = 'calos'),
    'elo-voting-system',
    'CALOS ELO Voting for Model Selection',
    'technology',
    'CALOS uses an ELO rating system (like chess) to track AI model performance. When multiple models could handle a request, the system chooses based on past performance. Better models rise in rating, poor performers drop. This optimizes cost and quality automatically.',
    'CALOS Agent Router Code',
    6
  ),
  (
    (SELECT id FROM brand_domains WHERE slug = 'vibecoding'),
    'dragon-mythology',
    'The VibeCoding Dragon Metaphor',
    'mythology',
    'Dragons hoard treasure. VibeCoding''s dragon hoards knowledge. Just as dragons protect their gold, VibeCoding protects and organizes information across the CALOS ecosystem. The dragon represents wisdom, longevity, and careful curation.',
    'VibeCoding Brand Guide',
    4
  ),
  (
    (SELECT id FROM brand_domains WHERE slug = 'perplexityvault'),
    'vault-metaphor',
    'Why "Vault" for Search?',
    'branding',
    'Perplexity Vault uses the vault metaphor to represent saved searches and knowledge preservation. Unlike ephemeral search engines, the Vault stores your research history, builds connections, and surfaces insights over time. Your searches become a knowledge asset.',
    'Perplexity Vault Concept Doc',
    5
  )
ON CONFLICT (slug) DO NOTHING;

-- Update discussion templates to focus on YOUR brands
TRUNCATE brand_discussion_templates CASCADE;

INSERT INTO brand_discussion_templates (slug, template_type, title_template, body_template, suitable_for_domains, engagement_potential)
VALUES
  (
    'brand-philosophy-theory',
    'theory',
    'Theory: Why {domain_name} prioritizes {core_value}?',
    'I''ve been thinking about {domain_name}''s philosophy. At first glance, it seems like they just {surface_feature}, but if you dig into {evidence_1} and {evidence_2}, there''s a deeper strategy.

What if the real reason {domain_name} focuses on {core_value} is because {theory}? This would explain:

1. {reason_1}
2. {reason_2}
3. {reason_3}

Am I overthinking this, or is there a master plan here?

**Tagged as bot-generated content for transparency**',
    ARRAY[(SELECT id FROM brand_domains WHERE slug = 'soulfra'), (SELECT id FROM brand_domains WHERE slug = 'calos')],
    9
  ),
  (
    'brand-tech-analysis',
    'analysis',
    'Deep Dive: How {domain_name}''s {technology} actually works',
    'Let''s break down {technology} in {domain_name}:

**The Tech**: {tech_description}

**Why It Matters**: {significance}

**How It Compares**: Traditional solutions like {competitor_1} do {old_approach}. But {domain_name} takes a different route by {new_approach}.

**My Take**: {interpretation}

What do you think? Is this the future or just hype?

**Tagged as bot-generated content for transparency**',
    ARRAY[(SELECT id FROM brand_domains WHERE slug = 'soulfra'), (SELECT id FROM brand_domains WHERE slug = 'calos'), (SELECT id FROM brand_domains WHERE slug = 'perplexityvault')],
    8
  ),
  (
    'brand-cross-domain',
    'question',
    'Question: How do {domain_1} and {domain_2} work together?',
    'Can someone explain the relationship between {domain_1} and {domain_2}?

From what I understand:
- {domain_1} handles {function_1}
- {domain_2} handles {function_2}

But how do they actually integrate? Is there a unified API? Do they share data? Or are they independent brands that just cross-link?

I''m trying to understand the CALOS ecosystem architecture.

**Tagged as bot-generated content for transparency**',
    ARRAY[(SELECT id FROM brand_domains WHERE slug = 'soulfra'), (SELECT id FROM brand_domains WHERE slug = 'calos'), (SELECT id FROM brand_domains WHERE slug = 'vibecoding')],
    10
  )
ON CONFLICT (slug) DO NOTHING;

-- Add comments
COMMENT ON TABLE brand_domains IS 'YOUR brand domains (not video games)';
COMMENT ON TABLE brand_personas IS 'Brand personas and AI agents (not game characters)';
COMMENT ON TABLE brand_milestones IS 'Major brand milestones (not game events)';
COMMENT ON TABLE brand_projects IS 'Brand projects and platforms (not game locations)';
COMMENT ON TABLE brand_knowledge IS 'Brand knowledge and philosophy (not game lore)';
COMMENT ON TABLE brand_discussion_templates IS 'Discussion templates for YOUR brands';
COMMENT ON TABLE brand_bot_posts IS 'Bot posts about YOUR brands (ALWAYS marked as bot content)';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Brand Lore System Migration Complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Replaced video game lore with YOUR brand lore:';
  RAISE NOTICE '  • 5 brand domains (Soulfra, CALOS, CalRiven, VibeCoding, Perplexity Vault)';
  RAISE NOTICE '  • 3 brand personas (Guardian, Router, Dragon)';
  RAISE NOTICE '  • 3 major milestones';
  RAISE NOTICE '  • 3 brand projects';
  RAISE NOTICE '  • 4 knowledge fragments';
  RAISE NOTICE '  • 3 discussion templates';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Update lib/lore-bot-generator.js to use new table names';
  RAISE NOTICE '  2. Generate test post: node scripts/test-multi-domain-empire.js';
  RAISE NOTICE '  3. Review generated content';
  RAISE NOTICE '';
END $$;
