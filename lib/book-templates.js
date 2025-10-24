/**
 * Book Templates
 *
 * Pre-built book structures for common use cases.
 * Templates define chapter layouts, content types, and generation strategies.
 *
 * Usage:
 *   const BookTemplates = require('./book-templates');
 *   const template = BookTemplates.multiplayerGuide();
 *   const sections = template.generateSections();
 */

class BookTemplates {
  /**
   * Multiplayer Portal Guide
   * Complete guide for CALOS multiplayer system
   */
  static multiplayerGuide() {
    return {
      name: 'CALOS Multiplayer Portal Guide',
      subtitle: 'Master the Art of Bucket Battles and Portal Collaboration',
      template: 'game-guide',
      targetPages: 250,

      generateSections() {
        return [
          // Part 1: Getting Started
          {
            level: 1,
            title: 'Introduction',
            content: `
Welcome to the CALOS Multiplayer Portal System - where AI bucket instances become Pokémon-style companions for competitive and collaborative gameplay!

In this guide, you'll learn:
- How to choose your perfect starter bucket
- Battle strategies for each bucket type
- Trading techniques to build your dream team
- Advanced portal management for competitive play
- Collaboration patterns for team workflows

Whether you're a solo player climbing the leaderboards or building a collaborative portal empire, this guide has everything you need to become a CALOS multiplayer master.
            `
          },

          // Chapter 1: Choosing Your Starter
          {
            level: 2,
            title: 'Chapter 1: Choosing Your Starter',
            content: `
Your journey begins with selecting one of 12 unique bucket starters. Each starter has distinct stats, personalities, and strengths:

**Technical Starters** (🔧)
- Best for: Code generation, debugging, architecture
- Key stats: High accuracy, good speed
- Examples: Code Master, Debug Specialist, Architecture Guru

**Creative Starters** (🎨)
- Best for: Content creation, brainstorming, artistic tasks
- Key stats: High creativity, variable speed
- Examples: Content Creator, Idea Generator, Story Weaver

**Business Starters** (💼)
- Best for: Strategy, analytics, reports
- Key stats: Balanced all-around
- Examples: Strategy Consultant, Data Analyst, Report Writer

**Choosing Strategy:**
1. Consider your primary use case
2. Review starter stats (speed, accuracy, creativity, cost)
3. Check rarity tiers (Legendary starters are rare but powerful)
4. Test in practice mode before committing
            `
          },

          // Chapter 2: Battle Mechanics
          {
            level: 2,
            title: 'Chapter 2: Battle Mechanics',
            content: `
Bucket battles are the core competitive element of CALOS multiplayer. Two players challenge each other with a prompt, and both buckets respond. The winner is determined by battle type:

**Battle Types:**

1. **Speed Battles**
   - Winner: Fastest response
   - Strategy: Use lightweight models (Gemma2, Mistral)
   - Best for: Quick-fire challenges

2. **Quality Battles**
   - Winner: Highest quality response (voted by community)
   - Strategy: Use powerful models (CodeLlama, Llama 70B)
   - Best for: Complex problems

3. **Creativity Battles**
   - Winner: Most creative/original response
   - Strategy: Use creative models with high temperature
   - Best for: Artistic/brainstorming challenges

4. **Cost Battles**
   - Winner: Lowest cost per token
   - Strategy: Optimize prompts for efficiency
   - Best for: Budget-conscious players

**Battle Rewards:**
- Winner: 50 karma
- Loser: 10 karma (participation)
- Leaderboard rank based on win/loss ratio
            `
          },

          // Chapter 3: Trading Strategies
          {
            level: 2,
            title: 'Chapter 3: Trading Strategies',
            content: `
Trading allows players to swap bucket starters, building diverse teams for different challenges.

**Trade Types:**

1. **Permanent Swap**
   - Both players exchange starters permanently
   - Use when you want a complete role change

2. **Temporary Loan**
   - Borrow a starter for 24 hours
   - Perfect for specific challenges

**Trading Tips:**
- Trade complementary starters (technical for creative)
- Consider domain compatibility (Soulfra bucket → Soulfra-themed tasks)
- Check starter stats before accepting trades
- Build relationships with other players for future trades

**Trade Etiquette:**
- Honor temporary trade durations
- Don't exploit beginners
- Offer fair trades (similar rarity/stats)
- Use chat to negotiate terms
            `
          },

          // Chapter 4: Portal Management
          {
            level: 2,
            title: 'Chapter 4: Portal Management',
            content: `
Portals are multiplayer lobbies where players gather to chat, battle, and collaborate.

**Portal Settings:**
- Max players (2-100)
- Visibility (private, friends-only, public)
- Allowed activities (chat, battles, trades)
- Portal theme (custom branding)

**Portal Roles:**

1. **Owner**
   - Create portal
   - Manage settings
   - Moderate chat
   - Close portal

2. **Member**
   - Join portal
   - Participate in activities
   - View leaderboards

**Advanced Portal Features:**
- Portal-specific leaderboards
- Custom battle formats
- Team tournaments
- Collaboration workflows
            `
          },

          // Chapter 5: Collaborative Workflows
          {
            level: 2,
            title: 'Chapter 5: Collaborative Workflows',
            content: `
Collaborative tasks allow multiple players to chain their buckets together for complex workflows.

**Workflow Types:**

1. **Chain Workflows**
   - Bucket A → Bucket B → Bucket C
   - Example: Brainstorm → Refine → Format
   - Best for: Multi-stage tasks

2. **Parallel Workflows**
   - Multiple buckets work simultaneously
   - Compare outputs, pick best
   - Best for: A/B testing

3. **Competitive Workflows**
   - Buckets compete on sub-tasks
   - Winner determined by quality
   - Best for: High-stakes projects

**Collaboration Best Practices:**
- Choose complementary buckets
- Define clear handoff points
- Review intermediate outputs
- Award karma fairly
            `
          },

          // Chapter 6: Leaderboards and Rankings
          {
            level: 2,
            title: 'Chapter 6: Leaderboards and Rankings',
            content: `
Climb the ranks through battles, trades, and collaborations.

**Ranking Tiers:**
- Newcomer (0-100 karma)
- Bronze (100-500 karma)
- Silver (500-1000 karma)
- Gold (1000-5000 karma)
- Legend (5000+ karma)

**Leaderboard Types:**

1. **Portal Leaderboard**
   - Rankings within specific portal
   - Based on portal-specific activities

2. **Global Leaderboard**
   - Cross-portal rankings
   - Based on all activities

**Karma Sources:**
- Battle wins: 50 karma
- Battle participation: 10 karma
- Trades completed: 20 karma
- Collaborations: 25 karma/player
- Daily login streaks: 5 karma/day
            `
          },

          // Chapter 7: Advanced Strategies
          {
            level: 2,
            title: 'Chapter 7: Advanced Strategies',
            content: `
Pro tips for competitive play:

**Meta Strategies:**
1. **Counter-picking**: Choose starters that counter opponent's strengths
2. **Stat optimization**: Min-max stats for specific battle types
3. **Domain synergy**: Match bucket domains to task categories

**Resource Management:**
- Balance karma spending on new starters vs upgrades
- Manage API costs (bucket usage = real costs)
- Optimize prompts for efficiency

**Team Building:**
- Maintain diverse starter collection
- Specialize in 2-3 battle types
- Build trading network for missing pieces

**Tournament Prep:**
- Study opponent's battle history
- Practice common prompt patterns
- Warm up buckets before matches
            `
          },

          // Appendix
          {
            level: 2,
            title: 'Appendix A: Starter Stats Reference',
            content: `
Complete stat breakdown for all 12 starters:

(Generated from database - see API endpoint /api/starters for latest)

**Technical Starters:**
- Code Master: Speed 75, Accuracy 95, Creativity 60, Cost 70
- Debug Specialist: Speed 80, Accuracy 90, Creativity 55, Cost 75
- Architecture Guru: Speed 70, Accuracy 92, Creativity 65, Cost 68

**Creative Starters:**
- Content Creator: Speed 78, Accuracy 80, Creativity 95, Cost 72
- Idea Generator: Speed 85, Accuracy 75, Creativity 90, Cost 70
- Story Weaver: Speed 82, Accuracy 82, Creativity 92, Cost 74

**Business Starters:**
- Strategy Consultant: Speed 80, Accuracy 85, Creativity 75, Cost 76
- Data Analyst: Speed 77, Accuracy 90, Creativity 70, Cost 78
- Report Writer: Speed 85, Accuracy 88, Creativity 72, Cost 74
            `
          },

          {
            level: 2,
            title: 'Appendix B: API Reference',
            content: `
Quick reference for CALOS multiplayer API endpoints:

**Starter Selection:**
- GET /api/starters - List all starters
- POST /api/starters/choose - Choose starter
- GET /api/starters/my-starter/:userId - Get user's starter

**Portal Management:**
- POST /api/multiplayer/create-portal - Create portal
- POST /api/multiplayer/join-portal - Join portal
- GET /api/multiplayer/active-portals - List portals

**Battles:**
- POST /api/multiplayer/challenge-battle - Challenge player
- POST /api/multiplayer/execute-battle/:battleId - Execute battle

**Trading:**
- POST /api/multiplayer/offer-trade - Offer trade
- POST /api/multiplayer/accept-trade/:tradeId - Accept trade

**Leaderboards:**
- GET /api/multiplayer/leaderboard/:portalId - Portal leaderboard
- GET /api/multiplayer/global-leaderboard - Global leaderboard
            `
          }
        ];
      }
    };
  }

  /**
   * CALOS Technical Reference
   * Complete API documentation
   */
  static technicalReference() {
    return {
      name: 'CALOS Technical Reference',
      subtitle: 'Complete API and Architecture Documentation',
      template: 'technical-manual',
      targetPages: 150,

      generateSections() {
        return [
          {
            level: 1,
            title: 'Introduction',
            content: 'Complete technical reference for CALOS API, architecture, and integration patterns.'
          },
          {
            level: 2,
            title: 'Architecture Overview',
            content: 'System architecture, components, and data flow.'
          },
          {
            level: 2,
            title: 'API Reference',
            content: 'Complete API endpoint documentation with examples.'
          }
        ];
      }
    };
  }

  /**
   * Portfolio Building Guide
   * Business-focused portfolio system guide
   */
  static portfolioGuide() {
    return {
      name: 'Building Your AI Portfolio with CALOS',
      subtitle: 'Showcase Your Work, Track Analytics, Monetize Your Skills',
      template: 'business-guide',
      targetPages: 120,

      generateSections() {
        return [
          {
            level: 1,
            title: 'Introduction',
            content: 'Learn how to build, customize, and monetize your CALOS-powered portfolio.'
          },
          {
            level: 2,
            title: 'Portfolio Setup',
            content: 'Step-by-step guide to creating your first portfolio.'
          },
          {
            level: 2,
            title: 'Analytics and Insights',
            content: 'Track your portfolio performance with built-in analytics.'
          },
          {
            level: 2,
            title: 'Monetization Strategies',
            content: 'Turn your portfolio into a revenue stream.'
          }
        ];
      }
    };
  }

  /**
   * Workflow Automation Course
   * Tutorial-style workflow building course
   */
  static workflowCourse() {
    return {
      name: 'Mastering CALOS Workflows',
      subtitle: 'From Beginner to Expert in Workflow Automation',
      template: 'tutorial-course',
      targetPages: 100,

      generateSections() {
        return [
          {
            level: 1,
            title: 'Course Overview',
            content: 'Welcome to the CALOS Workflow Automation course!'
          },
          {
            level: 2,
            title: 'Lesson 1: Your First Workflow',
            content: 'Build a simple workflow from scratch.'
          },
          {
            level: 2,
            title: 'Lesson 2: Conditional Logic',
            content: 'Add decision points to your workflows.'
          },
          {
            level: 2,
            title: 'Lesson 3: Database Integration',
            content: 'Connect workflows to your database.'
          }
        ];
      }
    };
  }
}

module.exports = BookTemplates;
