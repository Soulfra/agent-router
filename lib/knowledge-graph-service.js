/**
 * Knowledge Graph Service
 *
 * Manages the knowledge graph for the CalOS personal operating system
 * - Imports curriculum data (CS50, custom courses)
 * - Builds concept dependency graphs
 * - Calculates user progression and levels
 * - Generates personalized learning paths
 */

const axios = require('axios');

class KnowledgeGraphService {
  constructor(db) {
    this.db = db;
    console.log('[KnowledgeGraph] Initialized');
  }

  /**
   * Import CS50 SQL curriculum into knowledge graph
   */
  async importCS50Curriculum() {
    console.log('[KnowledgeGraph] Importing CS50 SQL curriculum...');

    const cs50Concepts = [
      // Week 0: Querying
      {
        name: 'Database Basics',
        slug: 'database-basics',
        category: 'querying',
        difficulty: 1,
        description: 'Introduction to relational databases, tables, rows, and columns',
        prerequisites: []
      },
      {
        name: 'SELECT Statements',
        slug: 'sql-select',
        category: 'querying',
        difficulty: 1,
        description: 'Retrieving data from database tables using SELECT',
        prerequisites: ['database-basics']
      },
      {
        name: 'WHERE Clause',
        slug: 'sql-where',
        category: 'querying',
        difficulty: 1,
        description: 'Filtering query results with conditions',
        prerequisites: ['sql-select']
      },
      {
        name: 'Pattern Matching (LIKE)',
        slug: 'sql-like',
        category: 'querying',
        difficulty: 1,
        description: 'Searching for patterns in text data',
        prerequisites: ['sql-where']
      },
      {
        name: 'Sorting (ORDER BY)',
        slug: 'sql-order-by',
        category: 'querying',
        difficulty: 1,
        description: 'Ordering query results in ascending or descending order',
        prerequisites: ['sql-select']
      },
      {
        name: 'Aggregate Functions',
        slug: 'sql-aggregates',
        category: 'querying',
        difficulty: 1,
        description: 'Using AVG, COUNT, MAX, MIN, SUM to summarize data',
        prerequisites: ['sql-select']
      },
      {
        name: 'DISTINCT Keyword',
        slug: 'sql-distinct',
        category: 'querying',
        difficulty: 1,
        description: 'Removing duplicate values from query results',
        prerequisites: ['sql-select']
      },
      {
        name: 'NULL Handling',
        slug: 'sql-null',
        category: 'querying',
        difficulty: 1,
        description: 'Working with NULL values and IS NULL checks',
        prerequisites: ['sql-where']
      },

      // Week 1: Relating
      {
        name: 'Relational Database Design',
        slug: 'relational-design',
        category: 'database-design',
        difficulty: 2,
        description: 'Understanding relationships between tables (one-to-one, one-to-many, many-to-many)',
        prerequisites: ['database-basics']
      },
      {
        name: 'Entity Relationship Diagrams',
        slug: 'er-diagrams',
        category: 'database-design',
        difficulty: 2,
        description: 'Visual representation of database structure with ER diagrams',
        prerequisites: ['relational-design']
      },
      {
        name: 'Primary and Foreign Keys',
        slug: 'keys',
        category: 'database-design',
        difficulty: 2,
        description: 'Unique identifiers and connecting tables through key relationships',
        prerequisites: ['relational-design']
      },
      {
        name: 'Subqueries',
        slug: 'sql-subqueries',
        category: 'querying',
        difficulty: 2,
        description: 'Nested queries within other queries for dynamic value lookup',
        prerequisites: ['sql-select', 'sql-where']
      },
      {
        name: 'JOIN Operations',
        slug: 'sql-joins',
        category: 'querying',
        difficulty: 2,
        description: 'Combining data from multiple tables (INNER, LEFT, RIGHT, FULL, NATURAL)',
        prerequisites: ['keys']
      },
      {
        name: 'Set Operations',
        slug: 'sql-set-operations',
        category: 'querying',
        difficulty: 2,
        description: 'UNION, INTERSECT, EXCEPT for combining query results',
        prerequisites: ['sql-select']
      },
      {
        name: 'GROUP BY Clause',
        slug: 'sql-group-by',
        category: 'querying',
        difficulty: 2,
        description: 'Grouping data for aggregate calculations',
        prerequisites: ['sql-aggregates']
      },
      {
        name: 'HAVING Clause',
        slug: 'sql-having',
        category: 'querying',
        difficulty: 2,
        description: 'Filtering grouped data after aggregation',
        prerequisites: ['sql-group-by']
      },

      // Week 2: Designing
      {
        name: 'Database Schema Design',
        slug: 'schema-design',
        category: 'database-design',
        difficulty: 3,
        description: 'Creating tables with appropriate columns and relationships',
        prerequisites: ['relational-design']
      },
      {
        name: 'Data Types',
        slug: 'data-types',
        category: 'database-design',
        difficulty: 3,
        description: 'Understanding storage classes (integer, real, text, blob) and type affinities',
        prerequisites: ['database-basics']
      },
      {
        name: 'Table Constraints',
        slug: 'table-constraints',
        category: 'database-design',
        difficulty: 3,
        description: 'PRIMARY KEY, FOREIGN KEY, and ensuring data integrity',
        prerequisites: ['keys']
      },
      {
        name: 'Column Constraints',
        slug: 'column-constraints',
        category: 'database-design',
        difficulty: 3,
        description: 'NOT NULL, UNIQUE, CHECK, DEFAULT for column validation',
        prerequisites: ['table-constraints']
      },
      {
        name: 'Table Manipulation (DDL)',
        slug: 'ddl-operations',
        category: 'database-design',
        difficulty: 3,
        description: 'CREATE TABLE, ALTER TABLE, DROP TABLE commands',
        prerequisites: ['schema-design']
      },
      {
        name: 'Database Normalization',
        slug: 'normalization',
        category: 'database-design',
        difficulty: 3,
        description: 'Reducing redundancy and improving data integrity',
        prerequisites: ['schema-design', 'relational-design']
      },

      // Week 3: Writing
      {
        name: 'INSERT Statements',
        slug: 'sql-insert',
        category: 'writing',
        difficulty: 3,
        description: 'Adding data to database tables',
        prerequisites: ['sql-select']
      },
      {
        name: 'UPDATE Statements',
        slug: 'sql-update',
        category: 'writing',
        difficulty: 3,
        description: 'Modifying existing data in tables',
        prerequisites: ['sql-where']
      },
      {
        name: 'DELETE Statements',
        slug: 'sql-delete',
        category: 'writing',
        difficulty: 3,
        description: 'Removing rows from tables',
        prerequisites: ['sql-where']
      },
      {
        name: 'Foreign Key Constraints',
        slug: 'foreign-key-actions',
        category: 'database-design',
        difficulty: 3,
        description: 'ON DELETE CASCADE, RESTRICT, SET NULL actions',
        prerequisites: ['table-constraints']
      },
      {
        name: 'Triggers',
        slug: 'sql-triggers',
        category: 'writing',
        difficulty: 4,
        description: 'Automated actions in response to INSERT, UPDATE, DELETE',
        prerequisites: ['sql-insert', 'sql-update', 'sql-delete']
      },
      {
        name: 'CSV Import',
        slug: 'csv-import',
        category: 'writing',
        difficulty: 3,
        description: 'Importing data from CSV files',
        prerequisites: ['sql-insert']
      },
      {
        name: 'String Functions',
        slug: 'sql-string-functions',
        category: 'querying',
        difficulty: 3,
        description: 'trim(), upper(), lower() for text manipulation',
        prerequisites: ['sql-select']
      },
      {
        name: 'Data Cleaning',
        slug: 'data-cleaning',
        category: 'writing',
        difficulty: 3,
        description: 'Normalizing and correcting data inconsistencies',
        prerequisites: ['sql-string-functions', 'sql-update']
      },

      // Week 4: Viewing
      {
        name: 'Views',
        slug: 'sql-views',
        category: 'viewing',
        difficulty: 4,
        description: 'Creating virtual tables from queries',
        prerequisites: ['sql-select', 'sql-joins']
      },
      {
        name: 'Temporary Views',
        slug: 'temp-views',
        category: 'viewing',
        difficulty: 4,
        description: 'Session-specific views that are automatically dropped',
        prerequisites: ['sql-views']
      },
      {
        name: 'Common Table Expressions (CTEs)',
        slug: 'sql-ctes',
        category: 'viewing',
        difficulty: 4,
        description: 'WITH clause for temporary named result sets',
        prerequisites: ['sql-subqueries']
      },
      {
        name: 'Data Aggregation Views',
        slug: 'aggregation-views',
        category: 'viewing',
        difficulty: 4,
        description: 'Views that summarize data using aggregates',
        prerequisites: ['sql-views', 'sql-aggregates']
      },
      {
        name: 'Data Partitioning',
        slug: 'data-partitioning',
        category: 'viewing',
        difficulty: 4,
        description: 'Breaking large datasets into logical segments',
        prerequisites: ['sql-views']
      },
      {
        name: 'Data Security with Views',
        slug: 'view-security',
        category: 'viewing',
        difficulty: 4,
        description: 'Limiting data visibility and anonymizing sensitive columns',
        prerequisites: ['sql-views']
      },
      {
        name: 'Soft Deletion',
        slug: 'soft-deletion',
        category: 'writing',
        difficulty: 4,
        description: 'Marking records as deleted without removing them',
        prerequisites: ['sql-update', 'sql-views']
      },

      // Week 5: Optimizing
      {
        name: 'Database Indexes',
        slug: 'indexes',
        category: 'optimization',
        difficulty: 5,
        description: 'Creating indexes to speed up query performance',
        prerequisites: ['sql-select']
      },
      {
        name: 'B-Tree Data Structure',
        slug: 'b-tree',
        category: 'optimization',
        difficulty: 5,
        description: 'Understanding how indexes use B-trees for fast lookups',
        prerequisites: ['indexes']
      },
      {
        name: 'Partial Indexes',
        slug: 'partial-indexes',
        category: 'optimization',
        difficulty: 5,
        description: 'Indexes on subsets of table data',
        prerequisites: ['indexes']
      },
      {
        name: 'Query Performance Analysis',
        slug: 'query-analysis',
        category: 'optimization',
        difficulty: 5,
        description: 'Using EXPLAIN QUERY PLAN to understand query execution',
        prerequisites: ['indexes']
      },
      {
        name: 'ACID Properties',
        slug: 'acid-properties',
        category: 'optimization',
        difficulty: 5,
        description: 'Atomicity, Consistency, Isolation, Durability for transactions',
        prerequisites: ['database-basics']
      },
      {
        name: 'Transactions',
        slug: 'transactions',
        category: 'optimization',
        difficulty: 5,
        description: 'BEGIN TRANSACTION, COMMIT, ROLLBACK for atomic operations',
        prerequisites: ['acid-properties']
      },
      {
        name: 'Concurrency Control',
        slug: 'concurrency',
        category: 'optimization',
        difficulty: 5,
        description: 'Handling multiple simultaneous database operations with locking',
        prerequisites: ['transactions']
      },

      // Week 6: Scaling
      {
        name: 'Database Management Systems',
        slug: 'dbms-comparison',
        category: 'scaling',
        difficulty: 6,
        description: 'Comparing SQLite, MySQL, PostgreSQL architectures',
        prerequisites: ['database-basics']
      },
      {
        name: 'Vertical Scaling',
        slug: 'vertical-scaling',
        category: 'scaling',
        difficulty: 6,
        description: 'Increasing single server computing power',
        prerequisites: ['dbms-comparison']
      },
      {
        name: 'Horizontal Scaling',
        slug: 'horizontal-scaling',
        category: 'scaling',
        difficulty: 6,
        description: 'Adding multiple servers to distribute load',
        prerequisites: ['vertical-scaling']
      },
      {
        name: 'Database Replication',
        slug: 'replication',
        category: 'scaling',
        difficulty: 6,
        description: 'Single-leader, multi-leader, and leaderless replication',
        prerequisites: ['horizontal-scaling']
      },
      {
        name: 'Sharding',
        slug: 'sharding',
        category: 'scaling',
        difficulty: 6,
        description: 'Distributing large datasets across multiple servers',
        prerequisites: ['horizontal-scaling']
      },
      {
        name: 'Access Control',
        slug: 'access-control',
        category: 'scaling',
        difficulty: 6,
        description: 'User account management and granting/revoking privileges',
        prerequisites: ['dbms-comparison']
      }
    ];

    const conceptMap = new Map(); // slug -> concept_id

    // Insert concepts
    for (const concept of cs50Concepts) {
      try {
        const result = await this.db.query(
          `INSERT INTO knowledge_concepts (
            concept_name, concept_slug, category, difficulty_level,
            source_curriculum, description, prerequisites
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (concept_slug) DO UPDATE SET
            concept_name = $1,
            category = $3,
            difficulty_level = $4,
            description = $6,
            updated_at = NOW()
          RETURNING concept_id`,
          [
            concept.name,
            concept.slug,
            concept.category,
            concept.difficulty,
            'CS50-SQL',
            concept.description,
            [] // Will update prerequisites later
          ]
        );

        conceptMap.set(concept.slug, result.rows[0].concept_id);
      } catch (error) {
        console.error(`[KnowledgeGraph] Error inserting concept ${concept.slug}:`, error.message);
      }
    }

    console.log(`[KnowledgeGraph] Inserted ${conceptMap.size} concepts`);

    // Build dependencies
    for (const concept of cs50Concepts) {
      if (concept.prerequisites.length === 0) continue;

      const conceptId = conceptMap.get(concept.slug);
      const prerequisiteIds = concept.prerequisites
        .map(slug => conceptMap.get(slug))
        .filter(id => id);

      // Update prerequisites array
      await this.db.query(
        `UPDATE knowledge_concepts SET prerequisites = $1 WHERE concept_id = $2`,
        [prerequisiteIds, conceptId]
      );

      // Insert dependency edges
      for (const prereqId of prerequisiteIds) {
        try {
          await this.db.query(
            `INSERT INTO concept_dependencies (concept_id, requires_concept_id, strength)
            VALUES ($1, $2, $3)
            ON CONFLICT (concept_id, requires_concept_id) DO NOTHING`,
            [conceptId, prereqId, 8] // High strength (8/10) for CS50 prerequisites
          );
        } catch (error) {
          console.error(`[KnowledgeGraph] Error creating dependency:`, error.message);
        }
      }
    }

    console.log('[KnowledgeGraph] CS50 curriculum import complete');

    // Return stats
    const stats = await this.db.query(`
      SELECT
        COUNT(DISTINCT concept_id) as concepts,
        COUNT(DISTINCT category) as categories
      FROM knowledge_concepts
      WHERE source_curriculum = 'CS50-SQL'
    `);

    const deps = await this.db.query(`
      SELECT COUNT(*) as dependencies
      FROM concept_dependencies
    `);

    return {
      concepts: parseInt(stats.rows[0].concepts),
      categories: parseInt(stats.rows[0].categories),
      dependencies: parseInt(deps.rows[0].dependencies)
    };
  }

  /**
   * Get all concepts
   */
  async getAllConcepts(filters = {}) {
    const { category, difficulty_min, difficulty_max, limit = 100 } = filters;

    let query = 'SELECT * FROM knowledge_concepts WHERE 1=1';
    const params = [];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (difficulty_min) {
      params.push(difficulty_min);
      query += ` AND difficulty_level >= $${params.length}`;
    }

    if (difficulty_max) {
      params.push(difficulty_max);
      query += ` AND difficulty_level <= $${params.length}`;
    }

    query += ` ORDER BY difficulty_level ASC, concept_name ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Get concept by slug
   */
  async getConceptBySlug(slug) {
    const result = await this.db.query(
      `SELECT * FROM knowledge_concepts WHERE concept_slug = $1`,
      [slug]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const concept = result.rows[0];

    // Get dependencies
    const deps = await this.db.query(
      `SELECT
        kc.concept_id,
        kc.concept_name,
        kc.concept_slug,
        kc.difficulty_level,
        cd.strength
      FROM concept_dependencies cd
      JOIN knowledge_concepts kc ON kc.concept_id = cd.requires_concept_id
      WHERE cd.concept_id = $1
      ORDER BY cd.strength DESC`,
      [concept.concept_id]
    );

    concept.dependencies = deps.rows;

    return concept;
  }

  /**
   * Get user's progress
   */
  async getUserProgress(userId) {
    const result = await this.db.query(
      `SELECT * FROM user_learning_levels WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        user_id: userId,
        concepts_learned: 0,
        concepts_mastered: 0,
        avg_mastery: 0,
        total_interactions: 0,
        learning_sessions: 0,
        user_level: 0,
        level_title: 'Beginner'
      };
    }

    return result.rows[0];
  }

  /**
   * Get recommended next concepts for user
   */
  async getRecommendedConcepts(userId, limit = 10) {
    const result = await this.db.query(
      `SELECT * FROM recommended_next_concepts
      WHERE user_id = $1 AND readiness_score >= 70
      ORDER BY readiness_score DESC, difficulty_level ASC
      LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }

  /**
   * Get knowledge graph stats
   */
  async getStats() {
    const result = await this.db.query(`SELECT * FROM knowledge_graph_stats`);
    return result.rows.reduce((acc, row) => {
      acc[row.metric] = row.value;
      return acc;
    }, {});
  }
}

module.exports = KnowledgeGraphService;
