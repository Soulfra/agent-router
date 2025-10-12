# Changelog

All notable changes to CalOS Agent Router will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-10-12

### Added
- **Lofi Streaming System**: Complete music streaming room with real-time features
  - Session tracking (UPC-style pairing from visit → close)
  - Live viewer count with room-based WebSocket broadcasting
  - Heatmap click/hover tracking with canvas visualization
  - Song request queue with badge-gated permissions
  - Active vs total viewer metrics display
  - AI chat assistant integration in lofi room
  - Slash commands (/recommend, /lookup, /stats, /help)
- **Badge System Integration**: Reputation-based permissions
  - 7-tier badge system (Newcomer → Legend)
  - Trust score calculation based on voting behavior
  - Permission gating for song requests (requires Contributor badge)
- **Session Tracker Library**: Visit duration and interaction tracking
- **Heatmap Tracker Library**: Client-side interaction visualization
- **Room-Based Broadcasting**: WebSocket messages scoped to specific rooms
- **Comprehensive Database Migration**: Tables for sessions, heatmaps, song requests, room state

### Changed
- WebSocket system enhanced with room support (`join_room`, `leave_room` messages)
- Scheduler now includes stale session cleanup (every 30 minutes)
- Stats bar redesigned to show 5 metrics instead of 3

### Fixed
- Device stats endpoint added for badge permission checking
- Session tracking properly integrated with WebSocket lifecycle

## [1.0.0] - 2025-10-11

### Added
- **Core Agent Router**: Multi-provider AI routing system
  - Support for OpenAI (GPT-4, GPT-3.5)
  - Support for Anthropic Claude
  - Support for DeepSeek
  - Support for local Ollama models
- **Specialized Agents**:
  - Browser Agent (Puppeteer integration)
  - Hacker News Agent
  - GitHub Agent
  - Price Agent (crypto & stocks)
- **ELO Rating System**: Chess.com-style voting for recipes
  - Cooking recipe matchups
  - Real-time leaderboard
  - Spam prevention with device fingerprinting
  - Rate limiting by user tier
  - Suspicious activity detection
- **Domain Portfolio Management**:
  - Domain swiper interface
  - Domain voting system
  - Portfolio tracking
- **Authentication System**:
  - SSO support
  - OAuth consumer (Sign in WITH Google/GitHub)
  - OAuth provider (Sign in WITH CalOS)
  - Session management
- **Developer Portal**:
  - API key management
  - SDK documentation
  - Usage analytics
- **Challenge System**:
  - Challenge creation and judging
  - Leaderboards
  - Reward distribution
- **Onboarding System**:
  - Multi-step user onboarding
  - Profile creation
  - Skill assessment
- **Skills Engine**:
  - XP progression system
  - Skill trees
  - Achievement tracking
- **Price Worker**:
  - Automatic crypto price fetching
  - Stock price tracking
  - Historical data with candles (5m, 1h, daily)
- **Scheduler System**:
  - Automated data processing
  - Configurable task scheduling
  - Task management API
- **WebSocket System**:
  - Real-time messaging
  - Church mode (multi-agent responses)
  - Online user tracking
- **Database Support**:
  - PostgreSQL for production
  - SQLite for development
  - Migration system
- **Frontend Pages**:
  - Unified feed
  - Chat interface
  - Builder interface
  - Network visualization
  - Price dashboard
  - Status monitoring

### Infrastructure
- Express.js REST API
- WebSocket server (ws)
- PostgreSQL database with pgvector
- Better-SQLite3 for local development
- PM2-ready process management
- CORS support
- Body parser middleware
- JWT authentication
- Stripe payment integration
- IIIF image server
- RSS feed generation
- Voice pipeline (transcription)

## [Unreleased]

### Planned Features
- Docker containerization
- Nginx reverse proxy configuration
- GitHub Actions CI/CD pipeline
- Comprehensive API documentation
- Architecture documentation
- AI visualizations for music
- Real audio player integration
- Song skip voting system
- Advanced heatmap analytics

---

## Version History

- **v1.1.0** - Lofi Streaming System with AI Assistant
- **v1.0.0** - Initial Release with Core Agent Router

## Conventional Commit Types

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features (bumps MINOR version)
- `fix:` - Bug fixes (bumps PATCH version)
- `docs:` - Documentation changes (no version bump)
- `style:` - Code style changes (no version bump)
- `refactor:` - Code refactoring (no version bump)
- `perf:` - Performance improvements (bumps PATCH version)
- `test:` - Test additions/changes (no version bump)
- `chore:` - Build process/tooling changes (no version bump)
- `BREAKING CHANGE:` - Breaking API changes (bumps MAJOR version)
