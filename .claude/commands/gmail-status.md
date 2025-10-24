Check Gmail webhook system status for user: $ARGUMENTS

If no user provided, shows global system status.

**Usage:**
- `/project:gmail-status` - Global status
- `/project:gmail-status user123` - User-specific status

**Code:**

```javascript
const GmailGateway = require('./lib/gmail-gateway');
const gateway = new GmailGateway();
await gateway.init();

const userId = '$ARGUMENTS'.trim() || null;
const status = await gateway.getStatus(userId);

console.log(JSON.stringify(status, null, 2));
```

**What You'll See:**

### Global Status
```json
{
  "system": {
    "initialized": true,
    "poller": {
      "active": 3,
      "pollInterval": 60000
    },
    "smtp": {
      "provider": "gmail",
      "limits": {
        "daily": 500,
        "free": true
      }
    }
  }
}
```

### User Status
```json
{
  "user": {
    "userId": "user123",
    "rateLimits": {
      "hourly": { "current": 12, "limit": 50, "resetAt": "..." },
      "daily": { "current": 143, "limit": 500, "resetAt": "..." },
      "monthly": { "current": 2341, "limit": 10000, "resetAt": "..." }
    },
    "whitelist": {
      "total": 15,
      "approved": 12,
      "pending": 3,
      "rejected": 0
    },
    "reputation": {
      "score": 98,
      "status": "good",
      "bounces": 2,
      "spamComplaints": 0
    },
    "relayStats": {
      "total_relayed": 287,
      "successful": 285,
      "failed": 2,
      "last_relay": "2025-10-20T12:00:00Z"
    }
  }
}
```

Use this to monitor:
- Rate limit usage
- Whitelist status
- Reputation health
- Recent activity
