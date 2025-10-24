# Lesson 2: BYOK Implementation

**Track:** Multi-Tier System Architecture
**Lesson:** 2 of 7
**XP Reward:** 140
**Time:** 40 minutes
**Prerequisites:** Lesson 1 (Tier System)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Understand Bring Your Own Key (BYOK)
- ✅ Implement API key validation
- ✅ Store keys securely
- ✅ Handle key rotation
- ✅ Track key usage

## What is BYOK?

BYOK allows users to bring their own API keys (e.g., Anthropic, OpenAI) instead of using yours.

**Benefits:**
- User pays for their own API usage
- You don't pay for AI costs
- User has full control
- Better for privacy

## Key Storage

```javascript
const crypto = require('crypto');

class KeyManager {
  constructor(db, encryptionKey) {
    this.db = db;
    this.encryptionKey = Buffer.from(encryptionKey, 'hex');
  }

  encrypt(apiKey) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decrypt(encrypted, iv, authTag) {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  async storeKey(userId, provider, apiKey) {
    const { encrypted, iv, authTag } = this.encrypt(apiKey);

    await this.db.query(`
      INSERT INTO user_api_keys (user_id, provider, encrypted_key, iv, auth_tag)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, provider) DO UPDATE
      SET encrypted_key = $3, iv = $4, auth_tag = $5, updated_at = NOW()
    `, [userId, provider, encrypted, iv, authTag]);

    return { success: true };
  }

  async getKey(userId, provider) {
    const result = await this.db.query(
      'SELECT encrypted_key, iv, auth_tag FROM user_api_keys WHERE user_id = $1 AND provider = $2',
      [userId, provider]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const { encrypted_key, iv, auth_tag } = result.rows[0];
    return this.decrypt(encrypted_key, iv, auth_tag);
  }
}

module.exports = KeyManager;
```

## Usage Tracking

```javascript
async function trackKeyUsage(userId, provider, tokens, cost) {
  await db.query(`
    INSERT INTO api_key_usage (user_id, provider, tokens_used, cost_usd)
    VALUES ($1, $2, $3, $4)
  `, [userId, provider, tokens, cost]);
}
```

## Summary

You've learned:
- ✅ BYOK concept and benefits
- ✅ Secure key storage
- ✅ Key encryption/decryption
- ✅ Usage tracking

## Next Lesson

**Lesson 3: Usage Tracking**

Learn how to track and display API usage metrics.

## Quiz

1. What does BYOK stand for?
   - a) Buy Your Own Key
   - b) Bring Your Own Key
   - c) Build Your Own Key
   - d) Backup Your Own Key

2. How should API keys be stored?
   - a) Plain text
   - b) Base64 encoded
   - c) AES-256 encrypted
   - d) Not stored

3. Who pays for BYOK API usage?
   - a) You
   - b) The user
   - c) The API provider
   - d) No one

**Answers:** 1-b, 2-c, 3-b

---

**🎴 Achievement Unlocked:** BYOK Master (+140 XP)
