# Lesson 2: Privacy-First Data Handling

**Track:** Zero-Dependency Development
**Lesson:** 2 of 6
**XP Reward:** 130
**Time:** 40 minutes
**Prerequisites:** Lesson 1 (CalOS Schema)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Implement privacy-first data practices
- ✅ Encrypt sensitive data
- ✅ Minimize data collection
- ✅ Handle user consent
- ✅ Implement data deletion

## Privacy Principles

1. **Collect Minimum Data:** Only collect what's needed
2. **Encrypt Everything:** Sensitive data must be encrypted
3. **Local Storage First:** Keep data local when possible
4. **User Control:** Users can view and delete their data
5. **No Tracking:** Zero telemetry or analytics

## Data Encryption

```javascript
const crypto = require('crypto');

class DataEncryption {
  constructor(encryptionKey) {
    // Key must be 32 bytes for AES-256
    this.key = Buffer.from(encryptionKey, 'hex');
    this.algorithm = 'aes-256-gcm';
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decrypt(encrypted, iv, authTag) {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

module.exports = DataEncryption;
```

## Minimal Data Collection

```javascript
// Good: Minimal data
const user = {
  userId: generateUserId(),
  username: username,
  // NO email, NO phone, NO real name
};

// Bad: Excessive data
const user = {
  userId: generateUserId(),
  username: username,
  email: email,
  phone: phone,
  realName: name,
  address: address,  // Why would you need this?
  birthdate: birthdate,
  ip: ipAddress
};
```

## User Data Deletion

```javascript
async function deleteUserData(userId) {
  const db = new DatabaseClient(process.env.DATABASE_URL);

  try {
    // Delete in correct order (foreign keys)
    await db.query('DELETE FROM player_cards WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM user_progress WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM achievements WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM users WHERE user_id = $1', [userId]);

    console.log(`User ${userId} data deleted`);
    return { success: true };

  } catch (error) {
    console.error('Deletion error:', error);
    throw error;
  } finally {
    await db.close();
  }
}
```

## Summary

You've learned:
- ✅ Privacy-first principles
- ✅ How to encrypt sensitive data
- ✅ Minimal data collection
- ✅ User data deletion

## Next Lesson

**Lesson 3: Split Licensing Strategy**

Learn about CalOS's unique dual-licensing model.

## Quiz

1. What encryption algorithm does CalOS use?
   - a) AES-128
   - b) AES-256-GCM
   - c) RSA
   - d) MD5

2. What data should you collect?
   - a) Everything possible
   - b) Only what's necessary
   - c) As much as users allow
   - d) Only email

3. Can users delete their data?
   - a) Yes, always
   - b) No
   - c) After 30 days
   - d) Only admins can

**Answers:** 1-b, 2-b, 3-a

---

**🎴 Achievement Unlocked:** Privacy Guardian (+130 XP)
