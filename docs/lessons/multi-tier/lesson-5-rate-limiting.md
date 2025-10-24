# Lesson 5: Rate Limiting

**Track:** Multi-Tier System Architecture
**Lesson:** 5 of 7
**XP Reward:** 120
**Time:** 30 minutes
**Prerequisites:** Lesson 4 (Billing)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Implement rate limiting
- ✅ Use sliding window algorithm
- ✅ Handle rate limit headers
- ✅ Provide user feedback
- ✅ Prevent abuse

## Rate Limiter Implementation

```javascript
class RateLimiter {
  constructor() {
    this.requests = new Map();
  }

  check(userId, limit, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get user's request timestamps
    if (!this.requests.has(userId)) {
      this.requests.set(userId, []);
    }

    const timestamps = this.requests.get(userId);

    // Remove old requests outside window
    const recentRequests = timestamps.filter(time => time > windowStart);

    // Check if limit exceeded
    if (recentRequests.length >= limit) {
      const oldestRequest = recentRequests[0];
      const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);

      return {
        allowed: false,
        retryAfter: retryAfter,
        remaining: 0,
        limit: limit
      };
    }

    // Add current request
    recentRequests.push(now);
    this.requests.set(userId, recentRequests);

    return {
      allowed: true,
      remaining: limit - recentRequests.length,
      limit: limit,
      reset: Math.ceil((now + windowMs) / 1000)
    };
  }

  cleanup() {
    // Periodically cleanup old entries
    const now = Date.now();
    for (const [userId, timestamps] of this.requests.entries()) {
      const recent = timestamps.filter(time => time > now - 3600000); // 1 hour
      if (recent.length === 0) {
        this.requests.delete(userId);
      } else {
        this.requests.set(userId, recent);
      }
    }
  }
}

module.exports = RateLimiter;
```

## Middleware Usage

```javascript
const rateLimiter = new RateLimiter();

async function rateLimitMiddleware(req, res, next) {
  const userId = req.userId; // From auth
  const limit = 100; // 100 requests
  const windowMs = 3600000; // per hour

  const result = rateLimiter.check(userId, limit, windowMs);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);

  if (!result.allowed) {
    res.setHeader('X-RateLimit-Reset', result.reset);
    res.setHeader('Retry-After', result.retryAfter);

    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Rate limit exceeded',
      retryAfter: result.retryAfter
    }));
    return;
  }

  next();
}
```

## Summary

You've learned:
- ✅ Rate limiting algorithms
- ✅ Implementation strategies
- ✅ HTTP headers for rate limits
- ✅ Abuse prevention

## Next Lesson

**Lesson 6: Multi-Project Management**

Learn how to manage multiple projects per user.

## Quiz

1. What's a sliding window?
   - a) Fixed time periods
   - b) Rolling time window
   - c) Random periods
   - d) No window

2. What HTTP status for rate limit?
   - a) 200
   - b) 400
   - c) 429
   - d) 500

3. When should rate limits reset?
   - a) Never
   - b) After fixed period
   - c) When user upgrades
   - d) Daily at midnight

**Answers:** 1-b, 2-c, 3-b

---

**🎴 Achievement Unlocked:** Rate Limit Master (+120 XP)
