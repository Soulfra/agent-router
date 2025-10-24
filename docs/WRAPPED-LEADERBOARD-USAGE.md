# Wrapped/Leaderboard System - Usage Guide

## Overview

The Wrapped/Leaderboard system provides **real-time analytics and rankings** by reading from existing analytics tables. Like Spotify Wrapped meets RuneScape Grand Exchange - personalized summaries, live leaderboards, and dynamic marketplace pricing.

**Philosophy**: READ from existing data instead of building new infrastructure.

**Key Features**:
- 🎯 Spotify Wrapped-style personalized summaries
- 🏆 Real-time leaderboards (who's online NOW)
- 💰 Dynamic marketplace pricing (demand-based like RuneScape GE)
- 📡 Live activity feed (real-time event streaming)
- 📦 Metrics bundling (one API call for everything)

---

## Wrapped Routes (`/api/wrapped/*`)

Spotify-style personalized usage summaries.

### GET /api/wrapped/me

Complete personalized summary (your "year in review").

**Query Parameters:**
- `period`: `day`, `week`, `month`, `quarter`, `year`, `alltime` (default: `year`)

**Response:**
```json
{
  "status": "success",
  "data": {
    "period": {
      "label": "Year",
      "startDate": "2024-10-14T...",
      "endDate": "2025-10-14T...",
      "daysInPeriod": 365
    },
    "user": {
      "username": "alice",
      "memberSince": "2024-01-15T...",
      "currentBadge": "gold",
      "reputationScore": 85.5,
      "trustScore": 92.3
    },
    "highlights": {
      "totalUses": 1250,
      "successRate": 96,
      "activeDays": 180,
      "uniqueFeatures": 15,
      "creditsSpent": 5000
    },
    "topFeatures": [
      {
        "feature": "secure_messaging",
        "uses": 450,
        "creditsUsed": 2250
      }
    ],
    "aiUsage": {
      "totalRequests": 800,
      "totalTokens": 250000,
      "totalCost": "125.50",
      "uniqueModels": 3,
      "favoriteModel": "gpt-4",
      "avgResponseTime": 1250
    },
    "credits": {
      "remaining": 3000,
      "totalPurchased": 10000,
      "totalUsed": 7000
    },
    "milestones": [
      {
        "title": "Power User",
        "description": "You made 1,250 feature requests!"
      },
      {
        "title": "Consistent Creator",
        "description": "Active 180 days this year"
      }
    ]
  }
}
```

**Use Case**: Dashboard "Your 2025 Wrapped" section

---

### GET /api/wrapped/me/features

Detailed feature usage breakdown.

**Response:**
```json
{
  "status": "success",
  "data": {
    "period": { "label": "Year", ... },
    "features": [
      {
        "feature": "secure_messaging",
        "displayName": "Secure Messaging",
        "category": "messaging",
        "uses": 450,
        "successfulUses": 440,
        "blockedAttempts": 10,
        "creditsSpent": 2250,
        "firstUse": "2024-01-20T...",
        "latestUse": "2025-10-14T...",
        "activeDays": 120
      }
    ],
    "count": 15
  }
}
```

---

### GET /api/wrapped/me/models

AI model usage patterns.

**Response:**
```json
{
  "data": {
    "models": [
      {
        "model": "gpt-4",
        "requests": 500,
        "promptTokens": 150000,
        "completionTokens": 100000,
        "totalTokens": 250000,
        "totalCost": "125.00",
        "avgResponseTime": 1200,
        "firstUse": "2024-01-15T...",
        "latestUse": "2025-10-14T..."
      }
    ]
  }
}
```

---

### GET /api/wrapped/me/spending

Credits and spending summary.

**Response:**
```json
{
  "data": {
    "currentBalance": {
      "creditsRemaining": 3000,
      "totalPurchased": 10000,
      "totalUsed": 7000
    },
    "periodSpending": {
      "byFeature": [
        { "feature": "secure_messaging", "creditsSpent": 2250, "uses": 450 }
      ],
      "byDay": [
        { "date": "2025-10-13", "creditsSpent": 50, "uses": 10 }
      ],
      "aiCosts": [
        { "model": "gpt-4", "totalCost": "125.00", "requests": 500 }
      ]
    }
  }
}
```

---

### GET /api/wrapped/me/milestones

User achievements and milestones.

**Response:**
```json
{
  "data": {
    "milestones": [
      {
        "category": "usage",
        "title": "1000 Uses",
        "description": "You've made 1,250 feature requests",
        "achieved": true,
        "progress": 100
      },
      {
        "category": "reputation",
        "title": "Trusted Member",
        "description": "Reputation score: 85.5",
        "achieved": true,
        "progress": 100
      }
    ],
    "totalAchieved": 8
  }
}
```

---

## Leaderboard Routes (`/api/leaderboard/*`)

Real-time rankings - who's active RIGHT NOW.

### GET /api/leaderboard/live

Currently active users (last 15 minutes).

**Query Parameters:**
- `window`: `5min`, `15min`, `1hour`, `24hour` (default: `15min`)
- `limit`: max results (default: 50, max: 100)

**Response:**
```json
{
  "status": "success",
  "data": {
    "timeWindow": "15min",
    "onlineCount": 23,
    "users": [
      {
        "userId": "uuid",
        "username": "alice",
        "badge": "gold",
        "reputation": 85.5,
        "featuresUsed": 3,
        "totalActions": 15,
        "lastActive": "2025-10-14T10:55:00Z",
        "minutesAgo": 2,
        "creditsSpent": 50
      }
    ]
  }
}
```

**Use Case**: "Online Now: 23 users" widget

---

### GET /api/leaderboard/reputation

Top users by reputation score.

**Response:**
```json
{
  "data": {
    "leaderboard": [
      {
        "rank": 1,
        "userId": "uuid",
        "username": "alice",
        "badge": "platinum",
        "reputationScore": 95.5,
        "trustScore": 98.0,
        "totalVotes": 500,
        "daysActive": 365
      }
    ],
    "count": 100
  }
}
```

---

### GET /api/leaderboard/usage

Most active users by feature usage.

**Query Parameters:**
- `window`: `24hour`, `week`, `alltime` (default: `week`)

**Response:**
```json
{
  "data": {
    "timeWindow": "week",
    "leaderboard": [
      {
        "rank": 1,
        "username": "alice",
        "totalUses": 250,
        "uniqueFeatures": 15,
        "activeDays": 7,
        "creditsSpent": 1000
      }
    ]
  }
}
```

---

### GET /api/leaderboard/spending

Top spenders by credits used.

---

### GET /api/leaderboard/ai

AI power users by model requests.

---

### GET /api/leaderboard/features/:featureName

Top users for a specific feature.

**Example**: `GET /api/leaderboard/features/secure_messaging`

---

### GET /api/leaderboard/me

My rankings across all leaderboards.

**Response:**
```json
{
  "data": {
    "user": {
      "username": "alice",
      "badge": "gold",
      "reputation": 85.5
    },
    "rankings": {
      "reputation": { "rank": 25, "score": 85.5 },
      "usage": { "rank": 10, "uses": 250 },
      "spending": { "rank": 15, "creditsUsed": 5000 },
      "ai": { "rank": 8, "requests": 800 }
    }
  }
}
```

---

## Marketplace Routes (`/api/marketplace/*`)

RuneScape Grand Exchange-style dynamic pricing.

### Concept

Prices fluctuate based on:
- **Demand** (blocked attempts = unmet demand → price ↑)
- **Supply** (existing unlocks → price ↓)
- **Platform tax** (2% on all transactions)

**Dynamic pricing formula:**
```
price = base_price * (1 + (demand/10 * 0.1)) * (1 - (supply/10 * 0.05))
total = price + (price * 0.02)  // 2% platform tax
```

---

### GET /api/marketplace/features

All features with dynamic pricing.

**Query Parameters:**
- `category`: filter by category
- `sort`: `price`, `demand`, `trending` (default: `demand`)

**Response:**
```json
{
  "data": {
    "features": [
      {
        "feature": "secure_messaging",
        "displayName": "Secure Messaging",
        "category": "messaging",
        "pricing": {
          "basePrice": 500,
          "currentPrice": 550,
          "tax": 11,
          "totalPrice": 561,
          "priceChange": 10
        },
        "market": {
          "demand": 15,
          "supply": 50,
          "recentPurchases": 5,
          "demandIndicator": "high"
        }
      }
    ],
    "platformTaxRate": "2.0%"
  }
}
```

---

### GET /api/marketplace/features/:featureName

Detailed market data for specific feature.

**Response:**
```json
{
  "data": {
    "feature": {
      "name": "secure_messaging",
      "displayName": "Secure Messaging"
    },
    "pricing": {
      "basePrice": 500,
      "currentPrice": 550,
      "tax": 11,
      "totalPrice": 561,
      "priceChange": 10,
      "avgMarketPrice": 520
    },
    "market": {
      "demand": 15,
      "supply": 50,
      "recentPurchases": 5,
      "recentUsage": 120,
      "totalRevenue": "2600.00",
      "demandIndicator": "high",
      "supplyIndicator": "medium"
    },
    "priceHistory": [
      { "date": "2025-10-13", "avgPrice": 540, "purchases": 2 }
    ]
  }
}
```

---

### GET /api/marketplace/trending

Trending items (high demand, recent purchases).

**Response:**
```json
{
  "data": {
    "trending": [
      {
        "feature": "telegram_bot",
        "displayName": "Telegram Bot",
        "basePrice": 300,
        "metrics": {
          "demand24h": 10,
          "demand7d": 25,
          "purchases24h": 3,
          "purchases7d": 8,
          "trendScore": 45
        },
        "trendIndicator": "🔥 Hot"
      }
    ]
  }
}
```

---

### GET /api/marketplace/demand

Demand indicators (blocked attempts = unmet demand).

**Response:**
```json
{
  "data": {
    "demandSignals": [
      {
        "feature": "secure_messaging",
        "displayName": "Secure Messaging",
        "blockReason": "Active subscription required",
        "uniqueUsers": 15,
        "totalAttempts": 45,
        "currentPrice": 500,
        "demandLevel": "high"
      }
    ],
    "message": "Blocked attempts indicate unmet demand - opportunities for upsells"
  }
}
```

---

### POST /api/marketplace/calculate-price

Calculate dynamic price for item.

**Request:**
```json
{
  "featureName": "secure_messaging",
  "basePrice": 500
}
```

**Response:**
```json
{
  "data": {
    "calculation": {
      "basePrice": 500,
      "demandAdjustment": 50,
      "demandCount": 15,
      "supplyCount": 50,
      "dynamicPrice": 550,
      "platformTax": 11,
      "totalPrice": 561,
      "priceChange": 10
    },
    "breakdown": {
      "demandMultiplier": "10.0% per 10 blocked attempts",
      "supplyDiscount": "5.0% per 10 unlocks",
      "platformTaxRate": "2.0%"
    }
  }
}
```

---

## Activity Feed Routes (`/api/activity/*`)

Live feed of platform activity - who's doing what RIGHT NOW.

### GET /api/activity/live

Latest activity (last 1 minute, for polling).

**Query Parameters:**
- `since`: timestamp to get events after (ISO string)

**Response:**
```json
{
  "data": {
    "events": [
      {
        "eventId": "feature_usage_1728...",
        "eventType": "feature_usage",
        "icon": "🎯",
        "message": "alice used secure_messaging",
        "color": "blue",
        "user": {
          "userId": "uuid",
          "username": "alice",
          "badge": "gold"
        },
        "timestamp": "2025-10-14T10:58:30Z",
        "timeAgo": "5s ago"
      }
    ],
    "count": 15,
    "nextPoll": "2025-10-14T10:58:40Z"
  }
}
```

**Use Case**: Poll every 10 seconds for live updates

---

### GET /api/activity/stream

Server-Sent Events (SSE) endpoint for live streaming.

**Usage:**
```javascript
const eventSource = new EventSource('/api/activity/stream');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('New event:', data);
};
```

---

### GET /api/activity/stats

Real-time platform statistics.

**Query Parameters:**
- `window`: `5min`, `15min`, `1hour`, `24hour` (default: `5min`)

**Response:**
```json
{
  "data": {
    "timeWindow": "5min",
    "stats": {
      "activeUsers": 23,
      "featureRequests": 150,
      "aiRequests": 50,
      "purchases": 2,
      "revenue": "10.00",
      "eventsPerMinute": 40
    },
    "timestamp": "2025-10-14T10:59:00Z"
  }
}
```

---

## Metrics Bundle Routes (`/api/metrics/*`)

Efficient single-response reads - load entire dashboard in ONE call.

### GET /api/metrics/bundle

Complete dashboard bundle - ALL metrics in one call.

**Response:**
```json
{
  "data": {
    "user": {
      "wrapped": {
        "totalUses": 1250,
        "uniqueFeatures": 15,
        "activeDays": 180,
        "creditsSpent": 5000
      },
      "rankings": {
        "usage": 10,
        "spending": 15,
        "reputation": 85.5
      }
    },
    "marketplace": {
      "topDemand": [
        { "feature": "secure_messaging", "demand": 15, "price": 500 }
      ],
      "trending": [
        { "feature": "telegram_bot", "demand24h": 10, "usage24h": 50 }
      ]
    },
    "activity": {
      "recent": [
        { "feature": "api_access", "username": "bob", "secondsAgo": 5 }
      ]
    },
    "platform": {
      "activeUsers": 23,
      "totalRequests": 150,
      "successRate": 96
    }
  },
  "meta": {
    "bundleVersion": "1.0",
    "queryTime": "45ms",
    "timestamp": "2025-10-14T11:00:00Z",
    "queriesExecuted": 6,
    "note": "All metrics fetched in single request"
  }
}
```

**Use Case**: Load dashboard with single API call instead of 6+ separate calls

---

### GET /api/metrics/bundle/user

User-focused bundle (no platform stats).

**Query Parameters:**
- `period`: `30 days`, `7 days`, etc.

---

### GET /api/metrics/bundle/platform

Platform-wide bundle (admin only).

---

### POST /api/metrics/bundle/custom

Custom metric selection - choose what to bundle.

**Request:**
```json
{
  "metrics": ["wrapped", "rankings", "marketplace"]
}
```

---

### GET /api/metrics/health

System health check with key metrics.

**Response:**
```json
{
  "status": "healthy",
  "data": {
    "activeUsersLastHour": 45,
    "requestsPerMinute": 120,
    "errorRatePercent": 2.5,
    "databaseConnected": true,
    "responseTime": "23ms"
  }
}
```

---

## Best Practices

### 1. Use Metrics Bundle for Dashboards

Instead of:
```javascript
// ❌ 6 separate API calls
const wrapped = await fetch('/api/wrapped/me');
const rankings = await fetch('/api/leaderboard/me');
const marketplace = await fetch('/api/marketplace/trending');
// ...
```

Do:
```javascript
// ✅ 1 API call
const dashboard = await fetch('/api/metrics/bundle');
```

### 2. Poll Live Activity

```javascript
// Poll every 10 seconds
setInterval(async () => {
  const { nextPoll } = await fetch(`/api/activity/live?since=${lastCheck}`);
  lastCheck = nextPoll;
}, 10000);
```

### 3. Use SSE for Real-Time

For truly real-time updates, use SSE:
```javascript
const eventSource = new EventSource('/api/activity/stream');
eventSource.onmessage = (event) => {
  // Update UI with new activity
};
```

### 4. Cache Wrapped Summaries

Wrapped summaries change slowly - cache for 1 hour:
```javascript
const wrapped = await fetch('/api/wrapped/me?period=year', {
  cache: 'force-cache',
  next: { revalidate: 3600 }
});
```

---

## Summary

| Category | Purpose | Key Feature |
|----------|---------|-------------|
| **Wrapped** | Personalized summaries | Spotify-style "Your Year" |
| **Leaderboard** | Live rankings | Who's online NOW |
| **Marketplace** | Dynamic pricing | RuneScape GE demand-based pricing |
| **Activity** | Live events | Real-time feed + SSE |
| **Metrics Bundle** | Efficient reads | 1 API call for everything |

All routes READ from existing analytics tables - no new infrastructure needed.
