/**
 * Glossary Builder
 *
 * Extracts concepts, terms, and relationships from documentation files
 * to build an interactive knowledge graph / glossary / wordmap.
 *
 * Features:
 * - Parse markdown documentation
 * - Extract concepts (headings, bold terms, code blocks)
 * - Detect relationships (co-occurrence, references, prerequisites)
 * - Build graph structure (nodes + edges)
 * - Export as JSON for D3.js visualization
 *
 * Usage:
 *   const builder = new GlossaryBuilder();
 *   const graph = await builder.buildFromMarkdown('CONTENT_PUBLISHING_SYSTEM.md');
 */

const fs = require('fs').promises;
const path = require('path');

class GlossaryBuilder {
  constructor(options = {}) {
    this.options = {
      minTermLength: options.minTermLength || 3,
      maxTermLength: options.maxTermLength || 50,
      coOccurrenceWindow: options.coOccurrenceWindow || 100, // chars
      ...options
    };

    // Common stop words to ignore
    this.stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
      'can', 'could', 'may', 'might', 'must', 'shall', 'this', 'that', 'these',
      'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
      'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
      'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same',
      'so', 'than', 'too', 'very'
    ]);
  }

  /**
   * Build glossary graph from markdown file
   *
   * @param {string} markdownPath - Path to markdown file
   * @returns {Promise<Object>} - Graph structure
   */
  async buildFromMarkdown(markdownPath) {
    console.log(`[GlossaryBuilder] Building from ${markdownPath}...`);

    const markdown = await fs.readFile(markdownPath, 'utf-8');

    // Extract concepts
    const concepts = this._extractConcepts(markdown);

    // Detect relationships
    const relationships = this._detectRelationships(markdown, concepts);

    // Build graph structure
    const graph = {
      metadata: {
        sourceFile: path.basename(markdownPath),
        generatedAt: new Date().toISOString(),
        conceptCount: concepts.length,
        relationshipCount: relationships.length
      },
      nodes: concepts,
      edges: relationships
    };

    console.log(`[GlossaryBuilder] Extracted ${concepts.length} concepts, ${relationships.length} relationships`);

    return graph;
  }

  /**
   * Build glossary graph from multiple markdown files
   *
   * @param {string[]} markdownPaths - Paths to markdown files
   * @returns {Promise<Object>} - Combined graph structure
   */
  async buildFromMultiple(markdownPaths) {
    console.log(`[GlossaryBuilder] Building from ${markdownPaths.length} files...`);

    const graphs = await Promise.all(
      markdownPaths.map(path => this.buildFromMarkdown(path))
    );

    // Merge graphs
    const allConcepts = new Map();
    const allRelationships = [];

    for (const graph of graphs) {
      for (const node of graph.nodes) {
        if (allConcepts.has(node.id)) {
          // Merge: increase weight, add source
          const existing = allConcepts.get(node.id);
          existing.weight += node.weight;
          existing.sources.push(node.sources[0]);
        } else {
          allConcepts.set(node.id, { ...node, sources: [node.sources[0]] });
        }
      }

      allRelationships.push(...graph.edges);
    }

    return {
      metadata: {
        sourceFiles: markdownPaths.map(p => path.basename(p)),
        generatedAt: new Date().toISOString(),
        conceptCount: allConcepts.size,
        relationshipCount: allRelationships.length
      },
      nodes: Array.from(allConcepts.values()),
      edges: allRelationships
    };
  }

  /**
   * Extract concepts from markdown
   * @private
   */
  _extractConcepts(markdown) {
    const concepts = new Map();

    // 1. Extract from headings (# ## ###)
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;

    while ((match = headingRegex.exec(markdown)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = this._slugify(text);

      if (!concepts.has(id)) {
        concepts.set(id, {
          id,
          label: text,
          type: 'heading',
          category: this._categorizeByLevel(level),
          weight: 10 - level, // Higher weight for h1, lower for h6
          definition: this._extractDefinition(markdown, match.index),
          sources: [path.basename(markdown)]
        });
      }
    }

    // 2. Extract from bold terms (**term**)
    const boldRegex = /\*\*([^*]+)\*\*/g;
    while ((match = boldRegex.exec(markdown)) !== null) {
      const text = match[1].trim();
      const id = this._slugify(text);

      // Skip if too short or too long
      if (text.length < this.options.minTermLength || text.length > this.options.maxTermLength) {
        continue;
      }

      // Skip stop words
      if (this.stopWords.has(text.toLowerCase())) {
        continue;
      }

      if (!concepts.has(id)) {
        concepts.set(id, {
          id,
          label: text,
          type: 'term',
          category: 'terminology',
          weight: 2,
          definition: this._extractDefinition(markdown, match.index),
          sources: [path.basename(markdown)]
        });
      } else {
        // Increment weight if already exists
        concepts.get(id).weight += 1;
      }
    }

    // 3. Extract from code blocks (API names, class names)
    const codeBlockRegex = /```[\s\S]*?```/g;
    while ((match = codeBlockRegex.exec(markdown)) !== null) {
      const code = match[0];

      // Extract class/function names
      const classRegex = /class\s+(\w+)/g;
      const functionRegex = /(?:async\s+)?function\s+(\w+)/g;
      const constRegex = /const\s+(\w+)\s*=/g;

      const extractors = [classRegex, functionRegex, constRegex];

      for (const regex of extractors) {
        let codeMatch;
        while ((codeMatch = regex.exec(code)) !== null) {
          const name = codeMatch[1];
          const id = this._slugify(name);

          if (!concepts.has(id)) {
            concepts.set(id, {
              id,
              label: name,
              type: 'code',
              category: 'implementation',
              weight: 3,
              definition: `Code entity: ${name}`,
              sources: [path.basename(markdown)]
            });
          } else {
            concepts.get(id).weight += 1;
          }
        }
      }
    }

    // 4. Extract from backtick terms (`term`)
    const backtickRegex = /`([^`]+)`/g;
    while ((match = backtickRegex.exec(markdown)) !== null) {
      const text = match[1].trim();
      const id = this._slugify(text);

      // Only include if it looks like a term (not code)
      if (text.length < this.options.minTermLength || text.includes('(') || text.includes('{')) {
        continue;
      }

      if (!concepts.has(id)) {
        concepts.set(id, {
          id,
          label: text,
          type: 'inline-code',
          category: 'technical',
          weight: 1,
          definition: this._extractDefinition(markdown, match.index),
          sources: [path.basename(markdown)]
        });
      } else {
        concepts.get(id).weight += 0.5;
      }
    }

    return Array.from(concepts.values());
  }

  /**
   * Detect relationships between concepts
   * @private
   */
  _detectRelationships(markdown, concepts) {
    const relationships = [];
    const conceptMap = new Map(concepts.map(c => [c.label.toLowerCase(), c]));

    // 1. Co-occurrence relationships
    // If two concepts appear within N characters, they're related
    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const concept1 = concepts[i];
        const concept2 = concepts[j];

        // Find all occurrences
        const regex1 = new RegExp(this._escapeRegex(concept1.label), 'gi');
        const regex2 = new RegExp(this._escapeRegex(concept2.label), 'gi');

        const matches1 = [...markdown.matchAll(regex1)];
        const matches2 = [...markdown.matchAll(regex2)];

        // Check if any occurrences are within window
        let coOccurrences = 0;
        for (const m1 of matches1) {
          for (const m2 of matches2) {
            const distance = Math.abs(m1.index - m2.index);
            if (distance < this.options.coOccurrenceWindow) {
              coOccurrences++;
            }
          }
        }

        if (coOccurrences > 0) {
          relationships.push({
            source: concept1.id,
            target: concept2.id,
            type: 'co-occurrence',
            weight: coOccurrences,
            label: `appears with (${coOccurrences}x)`
          });
        }
      }
    }

    // 2. Prerequisite relationships
    // Look for phrases like "requires", "depends on", "uses", "built on"
    const prerequisiteRegex = /(\w[\w\s]+?)\s+(requires?|depends?\s+on|uses?|built\s+on)\s+(\w[\w\s]+)/gi;
    let match;

    while ((match = prerequisiteRegex.exec(markdown)) !== null) {
      const source = match[1].trim();
      const relationship = match[2].trim();
      const target = match[3].trim();

      const sourceConcept = conceptMap.get(source.toLowerCase());
      const targetConcept = conceptMap.get(target.toLowerCase());

      if (sourceConcept && targetConcept) {
        relationships.push({
          source: sourceConcept.id,
          target: targetConcept.id,
          type: 'prerequisite',
          weight: 5,
          label: relationship
        });
      }
    }

    // 3. Hierarchical relationships (parent-child from headings)
    const headings = concepts.filter(c => c.type === 'heading');
    for (let i = 0; i < headings.length - 1; i++) {
      const current = headings[i];
      const next = headings[i + 1];

      // If next heading is deeper level, it's a child
      const currentLevel = this._getCategoryLevel(current.category);
      const nextLevel = this._getCategoryLevel(next.category);

      if (nextLevel > currentLevel) {
        relationships.push({
          source: current.id,
          target: next.id,
          type: 'parent-child',
          weight: 3,
          label: 'contains'
        });
      }
    }

    return relationships;
  }

  /**
   * Extract definition for a concept (surrounding text)
   * @private
   */
  _extractDefinition(markdown, index) {
    // Get 200 chars after the concept
    const snippet = markdown.substring(index, index + 200);

    // Get first sentence or paragraph
    const firstSentence = snippet.match(/[^.!?]+[.!?]/)?.[0] || snippet.substring(0, 100);

    return firstSentence.trim().replace(/\n/g, ' ');
  }

  /**
   * Categorize by heading level
   * @private
   */
  _categorizeByLevel(level) {
    const categories = {
      1: 'document',
      2: 'section',
      3: 'subsection',
      4: 'topic',
      5: 'subtopic',
      6: 'detail'
    };
    return categories[level] || 'unknown';
  }

  /**
   * Get numeric level for category
   * @private
   */
  _getCategoryLevel(category) {
    const levels = {
      'document': 1,
      'section': 2,
      'subsection': 3,
      'topic': 4,
      'subtopic': 5,
      'detail': 6
    };
    return levels[category] || 0;
  }

  /**
   * Slugify text to create IDs
   * @private
   */
  _slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  }

  /**
   * Escape regex special characters
   * @private
   */
  _escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Export graph as JSON
   *
   * @param {Object} graph - Graph structure
   * @param {string} outputPath - Output file path
   */
  async exportJSON(graph, outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(graph, null, 2), 'utf-8');
    console.log(`[GlossaryBuilder] Exported to ${outputPath}`);
  }

  /**
   * Generate hierarchical glossary (traditional view)
   *
   * @param {Object} graph - Graph structure
   * @returns {Object} - Hierarchical structure
   */
  generateHierarchicalGlossary(graph) {
    const hierarchy = {
      document: [],
      sections: {}
    };

    // Group by category
    for (const node of graph.nodes) {
      if (node.type === 'heading') {
        if (node.category === 'document') {
          hierarchy.document.push(node);
        } else if (node.category === 'section') {
          if (!hierarchy.sections[node.label]) {
            hierarchy.sections[node.label] = {
              ...node,
              subsections: []
            };
          }
        } else if (node.category === 'subsection') {
          // Find parent section from edges
          const parentEdge = graph.edges.find(
            e => e.target === node.id && e.type === 'parent-child'
          );

          if (parentEdge) {
            const parent = graph.nodes.find(n => n.id === parentEdge.source);
            if (parent && hierarchy.sections[parent.label]) {
              hierarchy.sections[parent.label].subsections.push(node);
            }
          }
        }
      }
    }

    return hierarchy;
  }

  /**
   * Generate concept network (InfraNodus-style)
   *
   * @param {Object} graph - Graph structure
   * @returns {Object} - Network analysis
   */
  generateConceptNetwork(graph) {
    // Calculate network metrics
    const nodeDegrees = new Map();
    const clusters = new Map();

    // Calculate degree (number of connections) for each node
    for (const edge of graph.edges) {
      nodeDegrees.set(edge.source, (nodeDegrees.get(edge.source) || 0) + 1);
      nodeDegrees.set(edge.target, (nodeDegrees.get(edge.target) || 0) + 1);
    }

    // Identify hubs (high-degree nodes)
    const hubs = Array.from(nodeDegrees.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nodeId, degree]) => {
        const node = graph.nodes.find(n => n.id === nodeId);
        return { ...node, degree };
      });

    // Identify structural gaps (nodes with low connectivity in same category)
    const gaps = graph.nodes
      .filter(node => (nodeDegrees.get(node.id) || 0) < 2)
      .slice(0, 20);

    return {
      metrics: {
        totalNodes: graph.nodes.length,
        totalEdges: graph.edges.length,
        avgDegree: graph.edges.length * 2 / graph.nodes.length,
        density: (graph.edges.length * 2) / (graph.nodes.length * (graph.nodes.length - 1))
      },
      hubs,
      gaps,
      suggestions: this._generateSuggestions(hubs, gaps)
    };
  }

  /**
   * Generate AI suggestions for missing content
   * @private
   */
  _generateSuggestions(hubs, gaps) {
    const suggestions = [];

    // Suggest connections for isolated nodes
    for (const gap of gaps.slice(0, 5)) {
      suggestions.push({
        type: 'connect',
        concept: gap.label,
        suggestion: `Consider adding examples or use cases for "${gap.label}" to connect it with other concepts.`
      });
    }

    // Suggest expansion for hubs
    for (const hub of hubs.slice(0, 3)) {
      suggestions.push({
        type: 'expand',
        concept: hub.label,
        suggestion: `"${hub.label}" is a central concept (${hub.degree} connections). Consider creating a dedicated guide or deep-dive section.`
      });
    }

    return suggestions;
  }
}

module.exports = GlossaryBuilder;
