# Content Curation & Forum System - Complete Flow

## Overview

The content curation and forum system is a complete pipeline for aggregating news/content from multiple sources, personalizing it for users, and enabling discussions around that content.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACES                              │
├─────────────────────────────────────────────────────────────────────┤
│  - Wizard UI (content-curator.html)                                 │
│  - Unified Feed (unified-feed.html)                                 │
│  - Voice Commands (Hey Cal...)                                       │
│  - Forum UI (to be built)                                           │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       API LAYER (Express Routes)                     │
├─────────────────────────────────────────────────────────────────────┤
│  /api/curation/*  - Content curation endpoints                      │
│  /api/forum/*     - Forum discussion endpoints                       │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                              │
├─────────────────────────────────────────────────────────────────────┤
│  ContentCurator    - Aggregation, filtering, ranking                │
│  ContentForum      - Discussions, voting, karma                      │
│  VoiceContentBridge - Voice command integration                      │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DATA SOURCES                                   │
├─────────────────────────────────────────────────────────────────────┤
│  - Hacker News API                                                   │
│  - Reddit API                                                        │
│  - GitHub Trending                                                   │
│  - Custom RSS Feeds                                                  │
│  - NewsAPI.org (via Python)                                          │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     DATABASE (PostgreSQL)                            │
├─────────────────────────────────────────────────────────────────────┤
│  - curation_configs         - User preferences                       │
│  - curated_content          - Content cache                          │
│  - forum_threads            - Discussion threads                     │
│  - forum_posts              - Comments (nested)                      │
│  - forum_votes              - Upvotes/downvotes                      │
│  - forum_karma              - User karma scores                      │
└─────────────────────────────────────────────────────────────────────┘
```

## User Flows

### Flow 1: Configure Content Preferences (First-Time Setup)

1. **User navigates to `/content-curator.html`**
   - Wizard-style interface with 5 steps

2. **Step 1: Choose Topics**
   - Select from: AI, Crypto, Startups, Tech, Programming, etc.
   - User selects: `["ai", "crypto", "programming"]`

3. **Step 2: Select Sources**
   - Choose from: Hacker News, Reddit, GitHub Trending, etc.
   - User selects: `["hackernews", "reddit"]`

4. **Step 3: Add Custom RSS Feeds (Optional)**
   - User can add custom RSS feed URLs
   - Example: `https://example.com/rss`

5. **Step 4: Configure Delivery**
   - Frequency: Daily, Weekly, Realtime
   - Delivery time: 09:00
   - Email (optional): user@example.com

6. **Step 5: Review & Activate**
   - Preview configuration
   - Click "Activate Feed"

7. **Backend Processing**
   ```javascript
   POST /api/curation/configure
   {
     topics: ["ai", "crypto", "programming"],
     sources: ["hackernews", "reddit"],
     customRSS: [],
     frequency: "daily",
     deliveryTime: "09:00",
     email: "user@example.com"
   }
   ```

8. **Database Storage**
   - Configuration saved to `curation_configs` table
   - User redirected to `/unified-feed.html`

### Flow 2: View Personalized Feed

1. **User lands on `/unified-feed.html`**
   - News Curator Widget loads automatically

2. **Widget Initialization**
   ```javascript
   // Check if user has configuration
   GET /api/curation/config

   if (configured) {
     // Load curated feed
     GET /api/curation/feed?limit=10
   } else {
     // Show "Configure Now" button
   }
   ```

3. **Content Aggregation** (happens in ContentCurator)
   - Fetch from all configured sources:
     - Hacker News: Top 30 stories
     - Reddit: Hot posts from /r/programming, /r/technology
     - GitHub: Trending repositories

4. **Content Filtering**
   - Filter by user's topics (ai, crypto, programming)
   - Extract topics from titles using keyword matching

5. **Content Ranking**
   ```javascript
   // Recency score (exponential decay, 24-hour half-life)
   recencyScore = exp(-ageHours / 24)

   // Engagement score (log scale)
   engagementScore = log(1 + upvotes + comments * 2) / 10

   // Combined score (60% recency, 40% engagement)
   totalScore = recencyScore * 0.6 + engagementScore * 0.4
   ```

6. **Display in Widget**
   - Show top 10 articles
   - Each article shows:
     - Source icon (🔶 HN, 🤖 Reddit, ⭐ GitHub)
     - Title (clickable)
     - Description
     - Upvotes, comments
     - Topics/tags
     - Time ago

7. **Auto-Refresh**
   - Widget refreshes every 5 minutes
   - Uses in-memory cache (5-minute TTL)

### Flow 3: Voice Command Integration

1. **User says wake word**: "Hey Cal, show me AI news"

2. **Wake Word Detection** (lib/voice-wake-word.js)
   - Detects wake word: "hey cal"
   - Extracts command: "show me AI news"
   - Emits event: `command`

3. **Voice-Content Bridge** (lib/voice-content-bridge.js)
   - Listens for `command` event
   - Matches pattern: `/show me (.*?) news/i`
   - Extracts topic: "ai"

4. **Content Retrieval**
   ```javascript
   // Get or create temporary config for "ai" topic
   await curator.saveConfiguration(userId, {
     topics: ["ai"],
     sources: ["hackernews", "reddit", "github-trending"]
   })

   // Get curated feed
   const feed = await curator.getCuratedFeed(userId, { limit: 10 })

   // Filter by topic
   const aiArticles = feed.items.filter(item =>
     item.topics.includes("ai")
   )
   ```

5. **Response**
   ```javascript
   // Broadcast via WebSocket
   broadcast({
     type: "curated_content",
     message: "Here are the top AI articles:",
     items: aiArticles.slice(0, 5)
   })
   ```

6. **Display**
   - Articles appear in unified feed
   - Voice response: "Here are 5 AI articles"

**Supported Voice Commands:**
- "Hey Cal, show me [topic] news"
- "Hey Cal, what's trending in [topic]"
- "Hey Cal, curated feed"
- "Hey Cal, Hacker News"
- "Hey Cal, Reddit [subreddit]"
- "Hey Cal, GitHub trending"

### Flow 4: Forum Discussions (BBS-Style)

1. **User clicks article in feed**
   - Article opens in new tab
   - "Discuss" button shown below article

2. **Create Discussion Thread**
   ```javascript
   POST /api/forum/threads
   {
     title: "New AI model from OpenAI",
     body: "What do you think about this?",
     url: "https://openai.com/article",
     contentId: 123,  // Links to curated_content
     tags: ["ai", "openai"],
     flair: "Discussion"
   }
   ```

3. **Database Storage**
   - Thread saved to `forum_threads` table
   - Initial score: 0
   - Comment count: 0

4. **View Thread**
   ```javascript
   GET /api/forum/threads/456
   ```

   Response includes:
   - Thread metadata (title, body, author, score)
   - Nested comments (recursive SQL query)
   - User's votes

5. **Add Comment**
   ```javascript
   POST /api/forum/posts
   {
     threadId: 456,
     parentId: null,  // Top-level comment
     body: "Great article! I think..."
   }
   ```

6. **Database Triggers**
   - `forum_threads.comment_count` incremented
   - `forum_threads.last_activity_at` updated
   - `forum_karma.comments_created` incremented

7. **Reply to Comment** (Nested)
   ```javascript
   POST /api/forum/posts
   {
     threadId: 456,
     parentId: 789,  // Reply to comment 789
     body: "I agree, but..."
   }
   ```

   - Depth automatically calculated (parent.depth + 1)
   - Supports unlimited nesting

8. **Vote on Thread/Comment**
   ```javascript
   POST /api/forum/vote/thread/456
   { voteType: "up" }
   ```

   - Upsert vote in `forum_votes` table
   - Triggers recalculate thread score:
     ```sql
     score = upvotes - downvotes
     ```

9. **Karma System**
   - Post karma: Sum of thread scores
   - Comment karma: Sum of comment scores
   - Total karma: post_karma + comment_karma
   - Updates on vote changes (via triggers)

10. **Hot Algorithm** (Reddit-style)
    ```sql
    hotness = score / POWER((age_hours + 2), 1.5)
    ```

    - Balances score vs. time
    - Recent high-scoring threads rise to top
    - Old threads decay over time

11. **Leaderboard**
    ```javascript
    GET /api/forum/leaderboard?limit=10
    ```

    - Top users by total karma
    - Shows post karma, comment karma
    - Activity stats (threads created, comments created)

### Flow 5: Newsletter Generation

1. **User clicks "Generate Newsletter"**
   - Or scheduled via cron job

2. **Content Selection**
   ```javascript
   GET /api/curation/newsletter?limit=10&format=html
   ```

3. **Newsletter Generation** (lib/content-curator.js)
   - Get user's curated feed (top 10 items)
   - Generate HTML email:
     ```html
     <h1>Your Daily Curated Feed</h1>
     <p>Top 10 articles from your topics</p>

     <!-- Article 1 -->
     <div class="article">
       <h2>Title</h2>
       <p>Description</p>
       <a href="url">Read more</a>
       <div>🔶 Hacker News · 156 points · 42 comments</div>
     </div>
     ```

4. **Email Delivery** (future)
   - Integration with SendGrid/Mailgun
   - Store in `newsletter_delivery_log`
   - Track opens, clicks

5. **RSS Feed** (future)
   - Generate personal RSS feed
   - Subscribe in feed reader

## Integration Points

### WebSocket Integration

The content curation system can push updates via WebSocket:

```javascript
// unified-feed.js
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'curated_content') {
    // Display new articles in feed
    message.items.forEach(item => {
      addArticleToFeed(item);
    });
  }
}
```

### Voice Wake Word Integration

Connect wake word detector to voice-content bridge:

```javascript
// router.js
const VoiceWakeWord = require('./lib/voice-wake-word');
const VoiceContentBridge = require('./lib/voice-content-bridge');

const wakeWord = new VoiceWakeWord({
  wakeWords: ['hey cal', 'okay calos']
});

const voiceBridge = new VoiceContentBridge({
  contentCurator: curator,
  wakeWordDetector: wakeWord,
  broadcast: (msg) => wss.broadcast(msg)
});

wakeWord.start();
```

## Database Schema

### Content Curation Tables

**curation_configs**
- Stores user preferences
- Topics (JSON array): `["ai", "crypto"]`
- Sources (JSON array): `["hackernews", "reddit"]`
- Custom RSS feeds (JSON array)
- Delivery settings (frequency, time, email)

**curated_content**
- Content cache (shared across all users)
- External ID (source-specific, unique)
- Title, URL, description, content
- Source, author, icon
- Score, comments (engagement metrics)
- Topics (JSON array, extracted keywords)
- Published timestamp

**curation_reading_history**
- User engagement tracking
- Read duration, clicked, bookmarked
- Rating, feedback
- Used for future ML recommendations

**newsletter_delivery_log**
- Email delivery tracking
- Opens, clicks
- Bounce/failure tracking

### Forum Tables

**forum_threads**
- Discussion threads
- Links to curated_content (optional)
- Title, body, URL
- Author, score, votes
- Comment count, view count
- Flags: pinned, locked, archived
- Tags, flair

**forum_posts**
- Comments (nested)
- Parent post ID (for threading)
- Depth (nesting level, 0 = top-level)
- Author, body
- Score, votes
- Deleted flag (soft delete)
- Edit history in metadata JSONB

**forum_votes**
- Vote records (upvote/downvote)
- Links to thread OR post (not both)
- One vote per user per item
- Triggers update score on insert/update/delete

**forum_karma**
- User karma aggregation
- Post karma, comment karma, total
- Activity stats (threads/comments created)
- Updated via triggers

## API Endpoints

### Content Curation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/curation/configure` | Save user preferences |
| GET | `/api/curation/config` | Get user preferences |
| GET | `/api/curation/feed` | Get personalized feed |
| GET | `/api/curation/sources/hackernews` | Hacker News feed |
| GET | `/api/curation/sources/reddit/:subreddit` | Reddit feed |
| GET | `/api/curation/sources/github-trending` | GitHub trending |
| POST | `/api/curation/sources/rss` | Fetch custom RSS |
| GET | `/api/curation/newsletter` | Generate newsletter |
| POST | `/api/curation/newsletter/send` | Send newsletter |
| GET | `/api/curation/preview` | Preview without config |
| GET | `/api/curation/stats` | Curation statistics |

### Forum

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/forum/threads` | Create thread |
| GET | `/api/forum/threads/:id` | Get thread with comments |
| GET | `/api/forum/hot` | Hot threads (trending) |
| GET | `/api/forum/new` | New threads (recent) |
| GET | `/api/forum/top` | Top threads (by score) |
| GET | `/api/forum/tags/:tag` | Threads by tag |
| PUT | `/api/forum/threads/:id` | Update thread |
| DELETE | `/api/forum/threads/:id` | Delete thread |
| POST | `/api/forum/posts` | Create comment |
| PUT | `/api/forum/posts/:id` | Update comment |
| DELETE | `/api/forum/posts/:id` | Delete comment |
| POST | `/api/forum/vote/thread/:id` | Vote on thread |
| POST | `/api/forum/vote/post/:id` | Vote on post |
| DELETE | `/api/forum/vote/thread/:id` | Remove vote |
| GET | `/api/forum/karma/:userId` | Get user karma |
| POST | `/api/forum/karma/:userId/update` | Recalculate karma |
| GET | `/api/forum/leaderboard` | Karma leaderboard |

## Testing

Run comprehensive test suite:

```bash
./scripts/test-content-system.sh
```

Tests include:
- ✓ Configure content curation
- ✓ Get curation configuration
- ✓ Get curated feed
- ✓ Hacker News integration
- ✓ Reddit integration
- ✓ GitHub Trending integration
- ✓ Preview feed
- ✓ Curation statistics
- ✓ Newsletter generation
- ✓ Create forum thread
- ✓ Get thread with comments
- ✓ Create comment
- ✓ Vote on thread/post
- ✓ Hot/new/top threads
- ✓ User karma
- ✓ Karma leaderboard
- ✓ Python news aggregator

## Python Integration

For NewsAPI.org (70,000+ sources):

```bash
python scripts/news-aggregator.py \
  --sources newsapi,hackernews,reddit \
  --topics ai,crypto,startups \
  --output ./news.json
```

Requires NewsAPI key in config:
```json
{
  "newsapi_key": "your-api-key-here"
}
```

## Future Enhancements

1. **Machine Learning Recommendations**
   - Use reading history for personalized ranking
   - Collaborative filtering (users with similar tastes)
   - Topic modeling (automatic topic extraction)

2. **Real-time Notifications**
   - Push notifications for breaking news
   - Browser notifications for trending threads
   - Email digests (already implemented)

3. **Social Features**
   - Follow users
   - Private messages
   - User profiles with bio
   - Badges/achievements

4. **Advanced Forum Features**
   - Markdown support in posts
   - Code syntax highlighting
   - Image uploads
   - Thread search (full-text search)
   - Saved posts
   - User blocking/muting

5. **Analytics Dashboard**
   - Reading habits (time spent, topics read)
   - Engagement metrics (votes, comments)
   - Source breakdown
   - Trending topics over time

6. **Multi-language Support**
   - Translate articles
   - Interface localization

7. **Mobile App**
   - React Native or Flutter
   - Offline reading
   - Push notifications

## File Structure

```
agent-router/
├── migrations/
│   ├── 055_content_curation.sql      # Content curation schema
│   └── 056_content_forum.sql         # Forum discussion schema
├── lib/
│   ├── content-curator.js            # Content aggregation engine
│   ├── content-forum.js              # Forum manager
│   └── voice-content-bridge.js       # Voice command integration
├── routes/
│   ├── curation-routes.js            # Curation API endpoints
│   └── forum-routes.js               # Forum API endpoints
├── public/
│   ├── content-curator.html          # Configuration wizard
│   ├── unified-feed.html             # Main feed view
│   ├── unified-feed.js               # Feed WebSocket client
│   └── widgets/
│       ├── news-curator.js           # News curator widget
│       ├── world-clock.js            # World clock widget
│       └── system-status.js          # System status widget
├── scripts/
│   ├── news-aggregator.py            # Python news fetcher
│   └── test-content-system.sh        # Integration tests
└── docs/
    └── CONTENT_FLOW.md               # This file
```

## Quick Start

1. **Configure your preferences**
   - Visit `/content-curator.html`
   - Follow the 5-step wizard

2. **View your feed**
   - Visit `/unified-feed.html`
   - Click "Widgets" tab
   - See curated articles

3. **Try voice commands**
   - Say "Hey Cal, show me AI news"
   - Say "Hey Cal, curated feed"

4. **Join discussions**
   - Click on any article
   - Start a discussion thread
   - Upvote, comment, reply

5. **Track your karma**
   - Visit `/api/forum/karma/YOUR_USER_ID`
   - See your ranking on leaderboard

## Support

For questions or issues, see:
- API documentation: `/api/docs`
- GitHub issues: [repo]/issues
- Forum meta thread: `/api/forum/tags/meta`
