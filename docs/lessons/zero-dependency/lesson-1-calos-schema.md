# Lesson 1: Understanding CalOS Schema

**Track:** Zero-Dependency Development
**Lesson:** 1 of 6
**XP Reward:** 100
**Time:** 25 minutes
**Prerequisites:** None

## Learning Objectives

By the end of this lesson, you will:
- ✅ Understand zero-dependency philosophy
- ✅ Learn CalOS schema design principles
- ✅ Explore database structure
- ✅ Use built-in Node.js modules only
- ✅ Avoid external dependencies

## Zero-Dependency Philosophy

**Why zero dependencies?**

1. **Security:** No npm packages with vulnerabilities
2. **Privacy:** No telemetry or tracking
3. **Simplicity:** Easy to audit and understand
4. **Performance:** Smaller bundle size
5. **Control:** You own every line of code

## CalOS Schema Structure

CalOS uses PostgreSQL with a carefully designed schema:

### Core Tables

```sql
-- Users
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cards
CREATE TABLE cards (
  card_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rarity TEXT NOT NULL,
  attack INTEGER,
  defense INTEGER,
  special INTEGER,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player Cards (Collection)
CREATE TABLE player_cards (
  player_card_id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id),
  card_id TEXT REFERENCES cards(card_id),
  quantity INTEGER DEFAULT 1,
  acquired_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Built-in Node.js Modules

CalOS uses ONLY built-in modules:

```javascript
// Database
const { Pool } = require('pg');  // Only for PostgreSQL driver

// HTTP Server
const http = require('http');
const https = require('https');

// File System
const fs = require('fs');
const path = require('path');

// Crypto
const crypto = require('crypto');

// URL Parsing
const url = require('url');
const querystring = require('querystring');

// No Express, no Axios, no Lodash, nothing!
```

## Lab: Query Database with Pure Node.js

```javascript
// db-client.js - Zero-dependency database client

const { Pool } = require('pg');

class DatabaseClient {
  constructor(connectionString) {
    this.pool = new Pool({
      connectionString: connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });
  }

  async query(text, params = []) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      console.log(`[DB] Query executed in ${duration}ms`);
      return result;

    } catch (error) {
      console.error('[DB] Query error:', error);
      throw error;
    }
  }

  async getUser(userId) {
    const result = await this.query(
      'SELECT * FROM users WHERE user_id = $1',
      [userId]
    );
    return result.rows[0];
  }

  async getUserCards(userId) {
    const result = await this.query(`
      SELECT
        c.card_id,
        c.name,
        c.rarity,
        c.attack,
        c.defense,
        c.special,
        pc.quantity
      FROM player_cards pc
      JOIN cards c ON c.card_id = pc.card_id
      WHERE pc.user_id = $1
      ORDER BY c.rarity DESC, c.name ASC
    `, [userId]);

    return result.rows;
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = DatabaseClient;
```

### Usage Example

```javascript
const DatabaseClient = require('./db-client');

async function example() {
  const db = new DatabaseClient(process.env.DATABASE_URL);

  // Get user
  const user = await db.getUser('user123');
  console.log('User:', user);

  // Get cards
  const cards = await db.getUserCards('user123');
  console.log(`User has ${cards.length} cards`);

  await db.close();
}

example();
```

## Schema Design Principles

### 1. Normalize Data

```sql
-- Good: Normalized
CREATE TABLE users (user_id TEXT PRIMARY KEY, username TEXT);
CREATE TABLE player_cards (
  user_id TEXT REFERENCES users(user_id),
  card_id TEXT REFERENCES cards(card_id)
);

-- Bad: Denormalized (user data duplicated)
CREATE TABLE player_cards (
  user_id TEXT,
  username TEXT,
  card_id TEXT
);
```

### 2. Use Indexes

```sql
-- Add indexes for frequently queried columns
CREATE INDEX idx_player_cards_user_id ON player_cards(user_id);
CREATE INDEX idx_player_cards_card_id ON player_cards(card_id);
CREATE INDEX idx_cards_rarity ON cards(rarity);
```

### 3. Use Constraints

```sql
-- Ensure data integrity
CREATE TABLE cards (
  card_id TEXT PRIMARY KEY,
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  attack INTEGER CHECK (attack >= 0 AND attack <= 100),
  defense INTEGER CHECK (defense >= 0 AND defense <= 100)
);
```

## Summary

You've learned:
- ✅ Why zero dependencies matter
- ✅ CalOS schema structure
- ✅ How to use built-in Node.js modules
- ✅ Database design principles

## Next Lesson

**Lesson 2: Privacy-First Data Handling**

Learn how to handle user data with privacy as the top priority.

## Quiz

1. Why use zero dependencies?
   - a) It's trendy
   - b) Security, privacy, and control
   - c) Faster development
   - d) Better documentation

2. What's the only external package CalOS uses?
   - a) Express
   - b) pg (PostgreSQL driver)
   - c) Axios
   - d) None

3. What's the benefit of database indexes?
   - a) Faster queries
   - b) More storage
   - c) Better security
   - d) Easier to read

**Answers:** 1-b, 2-b, 3-a

---

**🎴 Achievement Unlocked:** Zero-Dependency Pioneer (+100 XP)
