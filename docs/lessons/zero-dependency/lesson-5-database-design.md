# Lesson 5: Database Design

**Track:** Zero-Dependency Development
**Lesson:** 5 of 6
**XP Reward:** 120
**Time:** 35 minutes
**Prerequisites:** Lesson 4 (Build Without Dependencies)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Design efficient database schemas
- ✅ Use indexes properly
- ✅ Implement migrations
- ✅ Handle relationships
- ✅ Optimize queries

## Schema Design Patterns

### One-to-Many

```sql
CREATE TABLE users (
  user_id TEXT PRIMARY KEY
);

CREATE TABLE cards (
  card_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id)
);
```

### Many-to-Many

```sql
CREATE TABLE users (user_id TEXT PRIMARY KEY);
CREATE TABLE cards (card_id TEXT PRIMARY KEY);

CREATE TABLE user_cards (
  user_id TEXT REFERENCES users(user_id),
  card_id TEXT REFERENCES cards(card_id),
  PRIMARY KEY (user_id, card_id)
);
```

## Indexes

```sql
-- Single column index
CREATE INDEX idx_cards_rarity ON cards(rarity);

-- Composite index
CREATE INDEX idx_user_cards ON user_cards(user_id, card_id);

-- Partial index
CREATE INDEX idx_active_users ON users(user_id) WHERE active = true;
```

## Query Optimization

```sql
-- Bad: N+1 query
SELECT * FROM users;
-- Then for each user: SELECT * FROM cards WHERE user_id = ?

-- Good: Single query with JOIN
SELECT
  u.user_id,
  u.username,
  c.card_id,
  c.name
FROM users u
LEFT JOIN cards c ON c.user_id = u.user_id;
```

## Summary

You've learned:
- ✅ Database design patterns
- ✅ Index strategies
- ✅ Query optimization
- ✅ Relationships

## Next Lesson

**Lesson 6: Deployment Without Vendors**

Learn how to deploy without relying on cloud vendors.

## Quiz

1. What's a composite index?
   - a) Index on one column
   - b) Index on multiple columns
   - c) Unique index
   - d) Primary key

2. What's the N+1 query problem?
   - a) Missing index
   - b) Multiple queries in loop
   - c) Slow database
   - d) Too many rows

3. When should you use indexes?
   - a) On every column
   - b) On frequently queried columns
   - c) Never
   - d) Only primary keys

**Answers:** 1-b, 2-b, 3-b

---

**🎴 Achievement Unlocked:** Database Architect (+120 XP)
