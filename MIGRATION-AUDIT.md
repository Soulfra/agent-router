# Database Migration Audit

Generated: 2025-10-22

## Summary

- **Total migrations:** 138 (95 in `database/migrations/`, 43 in `migrations/`)
- **Duplicate numbers:** 46 conflicts
- **Current DB:** PostgreSQL (`DB_TYPE=postgres`)
- **SQLite usage:** 1 file (`data/oauth-processing.db` - local logs)

## Status

- ❌ Duplicate migration numbers cause unpredictable execution order
- ❌ Two directories scanned by auto-migrator
- ⚠️ Some migrations have dependencies on others (foreign keys)
- ✅ Migration tracking table exists (`migration_history`)

## Duplicate Migration Numbers

| Number | Count | Files |
|--------|-------|-------|
| 005 | 2 | algo_trading, iiif_system |
| 007 | 2 | domain_portfolio, profile_swiper |
| 008 | 3 | developer_system, domain_challenges, onboarding_system |
| 009 | 2 | domain_voting, elo_system |
| 010 | 3 | code_index, user_auth, agent_activity_log |
| 011 | 4 | admin_roles, rooms_credentials, skills_system, vault_bridge |
| 012 | 2 | actions_effects, model_pricing |
| 013 | 3 | scheduling_verification, oauth_providers, usage_events |
| 014 | 4 | elo_spam_prevention, mailer_campaigns, email_router, knowledge_graph |
| 015 | 3 | game_leagues, user_devices, row_level_security |
| 016 | 3 | lofi_system, oauth_provider_system, multi_provider_tracking |
| 017 | 2 | payments_recruiting, project_context |
| 018 | 2 | model_council, voice_usage_tracking |
| 019 | 2 | autonomous_mode, service_credentials |
| 020 | 3 | platform_licensing, session_blocks, learning_platform |
| 021 | 2 | usage_based_pricing, data_literacy_features |
| 025 | 2 | device_pairing, model_usage_tracking |
| 026 | 2 | training_tasks, bucket_system |
| 027 | 2 | account_warming, request_lifecycle |
| 030 | 2 | credits_system, model_benchmarks |
| 031 | 2 | bucket_artifacts, documentation_registry |
| 032 | 2 | domain_code_library, vanity_handles |
| 033 | 3 | context_airlock, encryption_paths, vanity_handles_tables |
| 034 | 2 | domain_parameters, telegram_bot |
| 035 | 2 | voucher_system, workflows_system |
| 036 | 3 | affiliate_system, automated_flows, feature_gates |
| 037 | 3 | component_relationships, identity_resolution, mailbox_system |
| 040 | 3 | fix_oauth_providers, session_analytics, agent_wallets |
| 041 | 3 | bounce_tracking, dependency_vendoring, remove_cookie_tracking |
| 055 | 2 | content_curation, user_playstyles_tracking |
| 056 | 2 | content_forum, decision_tracking |
| 057 | 2 | author_workflow, marketplace_reputation |
| 058 | 2 | federation, idea_growth_tracking |
| 059 | 2 | builder_case_studies, community_graph |
| 060 | 3 | accessibility_preferences, ai_cost_analytics, gmail_webhooks |
| 061 | 3 | recruiting_integration, context_token_tracking, documentation_tracking |
| 062 | 2 | relationship_graph, price_audit_log |
| 063 | 2 | family_tree_spheres, arbitrage_detection |
| 064 | 2 | guardian_bug_reports, correlation_tracking |
| 065 | 2 | guardian_patch_applications, fix_timestamps |
| 066 | 2 | ai_conversations, sharding_events |
| 067 | 2 | add_icon_emoji, knowledge_patterns |
| 068 | 2 | user_data_vault, knowledge_integration |
| 069 | 2 | user_brands, embed_system |
| 070 | 2 | user_llm_usage, portfolio_system |
| 071 | 2 | ollama_streaming_sessions, bucket_portfolio_integration |

## Migration Categories

### Core Platform (001-010)
- Time differentials, pricing, data replication
- Knowledge system
- Guardian tables
- User auth, admin roles

### Feature Systems (011-030)
- Skills, actions/effects, ELO, OAuth
- Mailer campaigns, email router
- Lofi system, model council
- Platform licensing, usage-based pricing

### Advanced Features (031-042)
- Bucket system, documentation registry
- Domain management, workflows
- Identity resolution, mailbox system
- App store, asset system

### Specialized Systems (043-083)
- User tiers/quotas
- Accessibility preferences
- Recruiting, relationship graph, family tree
- Guardian bug reports, AI conversations
- Branding, LLM usage tracking
- Communication preferences, scheduling
- POS terminal, crypto payments, marketplace
- License verification, telemetry, pricing

### Root Migrations (006-071)
- Submissions grading, compaction results
- Agent activity, vault bridge
- Model pricing, usage events
- Knowledge graph, row-level security
- Multi-provider tracking, project context
- Learning platform, data literacy
- Translation cache, virtual filesystem
- Content systems, community graph
- Gmail webhooks, embed system
- Portfolio, bucket integration

## Recommended Actions

### 1. Sequential Renumbering (Recommended)

Renumber ALL migrations sequentially from 001-138:

```
database/migrations/
  001_time_differentials.sql
  002_pricing_tables.sql
  ...
  138_bucket_portfolio_integration.sql
```

### 2. Merge Strategy

Keep `database/migrations/` as primary:
- Move all from `migrations/` → `database/migrations/`
- Renumber to eliminate duplicates
- Update `migration_history` table

### 3. Dependency Resolution

Some migrations depend on others:
- Foreign keys reference tables from earlier migrations
- Must maintain logical order

### 4. Testing Plan

After renumbering:
1. Fresh DB test (drop, recreate, run all)
2. Incremental test (existing migration_history)
3. Verify all systems work

## Files Using SQLite

Only `lib/oauth-processing-logger.js` uses SQLite for local logging.
All other systems should use PostgreSQL.

## Next Steps

1. ✅ Phase 1: Audit complete
2. ⏳ Phase 2: Renumber migrations
3. ⏳ Phase 3: Convert SQLite → PostgreSQL
4. ⏳ Phase 4: Cleanup
5. ⏳ Phase 5: Test

---

**Status:** Audit complete, ready for renumbering
