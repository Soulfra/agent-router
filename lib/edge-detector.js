/**
 * Edge Detector
 *
 * Detects and analyzes edges in code:
 * - Object properties (each property = edge)
 * - Function calls (each call = edge)
 * - Dependencies (imports, API calls)
 * - Call graphs (function → function edges)
 * - Data flow (variable → function edges)
 *
 * Think of edges like connections in a graph:
 * - Node: Variable, function, module
 * - Edge: Property access, function call, import
 *
 * Example:
 *   const player = { x: 10, y: 20, score: 0 }  // 3 edges
 *   function move() { updateScore(); checkCollision(); }  // 2 edges
 */

class EdgeDetector {
  constructor() {
    this.edgeTypes = {
      property: 'property',
      call: 'call',
      import: 'import',
      export: 'export',
      parameter: 'parameter',
      return: 'return'
    };
  }

  /**
   * Analyze all edges in code
   * @param {string} code - Code to analyze
   * @param {string} language - Programming language
   * @returns {object} Edge analysis
   */
  analyze(code, language = 'javascript') {
    const analysis = {
      language,
      objects: this.analyzeObjectEdges(code, language),
      functions: this.analyzeFunctionEdges(code, language),
      dependencies: this.analyzeDependencyEdges(code, language),
      callGraph: this.buildCallGraph(code, language),
      dataFlow: this.analyzeDataFlow(code, language)
    };

    // Calculate totals
    analysis.totalEdges = this.calculateTotalEdges(analysis);
    analysis.edgeDensity = this.calculateEdgeDensity(code, analysis.totalEdges);
    analysis.complexity = this.calculateComplexityFromEdges(analysis);

    return analysis;
  }

  /**
   * Analyze object property edges
   */
  analyzeObjectEdges(code, language) {
    const objects = [];

    // Match object literals
    let objectMatches;
    if (language === 'javascript') {
      // Match: const obj = { ... }
      objectMatches = code.match(/(?:const|let|var)\s+(\w+)\s*=\s*{([^}]*)}/g);
    } else if (language === 'python') {
      // Match: obj = { ... }
      objectMatches = code.match(/(\w+)\s*=\s*{([^}]*)}/g);
    }

    if (objectMatches) {
      for (const match of objectMatches) {
        const [, name, body] = match.match(/(\w+)\s*=\s*{([^}]*)}/) || [];

        if (!name || !body) continue;

        // Count properties (edges)
        const properties = this.extractProperties(body);

        const objAnalysis = {
          name,
          type: 'object',
          edges: properties.length,
          properties: properties.map(p => ({
            name: p.name,
            type: p.type,
            nested: p.nested,
            edgeType: this.edgeTypes.property
          })),
          depth: this.calculateObjectDepth(body)
        };

        objects.push(objAnalysis);
      }
    }

    // Also detect arrays
    const arrayMatches = code.match(/(?:const|let|var)\s+(\w+)\s*=\s*\[([^\]]*)\]/g);
    if (arrayMatches) {
      for (const match of arrayMatches) {
        const [, name, body] = match.match(/(\w+)\s*=\s*\[([^\]]*)\]/) || [];

        if (!name) continue;

        // Count elements (edges)
        const elements = body.split(',').filter(e => e.trim());

        objects.push({
          name,
          type: 'array',
          edges: elements.length,
          properties: [],
          depth: 1
        });
      }
    }

    return {
      count: objects.length,
      items: objects,
      totalEdges: objects.reduce((sum, obj) => sum + obj.edges, 0),
      averageEdges: objects.length > 0
        ? objects.reduce((sum, obj) => sum + obj.edges, 0) / objects.length
        : 0
    };
  }

  /**
   * Extract properties from object body
   */
  extractProperties(body) {
    const properties = [];

    // Split by comma (rough heuristic)
    const parts = body.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Match: key: value
      const match = trimmed.match(/(\w+)\s*:\s*(.+)/);
      if (match) {
        const [, name, value] = match;

        properties.push({
          name,
          value: value.trim(),
          type: this.detectValueType(value.trim()),
          nested: /^\{/.test(value.trim()) || /^\[/.test(value.trim())
        });
      }
    }

    return properties;
  }

  /**
   * Detect value type
   */
  detectValueType(value) {
    if (/^\d+$/.test(value)) return 'number';
    if (/^["'].*["']$/.test(value)) return 'string';
    if (/^(true|false)$/.test(value)) return 'boolean';
    if (/^\{/.test(value)) return 'object';
    if (/^\[/.test(value)) return 'array';
    if (/\w+\(/.test(value)) return 'function-call';
    return 'unknown';
  }

  /**
   * Calculate object nesting depth
   */
  calculateObjectDepth(body) {
    let maxDepth = 1;
    let currentDepth = 1;

    for (const char of body) {
      if (char === '{' || char === '[') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}' || char === ']') {
        currentDepth = Math.max(1, currentDepth - 1);
      }
    }

    return maxDepth;
  }

  /**
   * Analyze function call edges
   */
  analyzeFunctionEdges(code, language) {
    const functions = [];

    // Match function declarations
    let funcMatches;
    if (language === 'javascript') {
      funcMatches = code.match(/function\s+(\w+)\s*\([^)]*\)\s*{[\s\S]*?^}/gm);
    } else if (language === 'python') {
      funcMatches = code.match(/def\s+(\w+)\s*\([^)]*\):[\s\S]*?(?=\ndef|\nclass|$)/gm);
    }

    if (funcMatches) {
      for (const funcCode of funcMatches) {
        const nameMatch = funcCode.match(/(?:function|def)\s+(\w+)/);
        const name = nameMatch ? nameMatch[1] : 'anonymous';

        // Extract parameters (incoming edges)
        const params = this.extractParameters(funcCode);

        // Extract function calls (outgoing edges)
        const calls = this.extractFunctionCalls(funcCode);

        // Extract property accesses (data edges)
        const propertyAccesses = this.extractPropertyAccesses(funcCode);

        // Extract return statements (outgoing data edges)
        const returns = this.extractReturns(funcCode);

        const funcAnalysis = {
          name,
          type: 'function',
          incomingEdges: params.length,
          outgoingEdges: calls.length,
          dataEdges: propertyAccesses.length,
          returnEdges: returns.length,
          totalEdges: params.length + calls.length + propertyAccesses.length + returns.length,
          parameters: params.map(p => ({ name: p, edgeType: this.edgeTypes.parameter })),
          calls: calls.map(c => ({ name: c, edgeType: this.edgeTypes.call })),
          propertyAccesses: propertyAccesses.map(p => ({ name: p, edgeType: this.edgeTypes.property })),
          returns: returns.map(r => ({ value: r, edgeType: this.edgeTypes.return }))
        };

        functions.push(funcAnalysis);
      }
    }

    return {
      count: functions.length,
      items: functions,
      totalEdges: functions.reduce((sum, f) => sum + f.totalEdges, 0),
      averageEdges: functions.length > 0
        ? functions.reduce((sum, f) => sum + f.totalEdges, 0) / functions.length
        : 0
    };
  }

  /**
   * Extract function parameters
   */
  extractParameters(funcCode) {
    const match = funcCode.match(/(?:function|def)\s+\w+\s*\(([^)]*)\)/);
    if (!match || !match[1]) return [];

    return match[1].split(',')
      .map(p => p.trim().split(/\s+/)[0]) // Handle type annotations
      .filter(p => p && p !== '');
  }

  /**
   * Extract function calls
   */
  extractFunctionCalls(code) {
    const calls = [];
    const matches = code.match(/\b(\w+)\s*\(/g);

    if (matches) {
      for (const match of matches) {
        const name = match.replace(/\s*\(/, '');
        // Filter out keywords
        if (!['if', 'for', 'while', 'switch', 'function', 'return', 'def'].includes(name)) {
          calls.push(name);
        }
      }
    }

    return [...new Set(calls)]; // Unique calls
  }

  /**
   * Extract property accesses
   */
  extractPropertyAccesses(code) {
    const accesses = [];

    // Match: obj.prop or obj['prop']
    const matches = code.match(/\b(\w+)\.(\w+)/g);

    if (matches) {
      for (const match of matches) {
        accesses.push(match);
      }
    }

    return [...new Set(accesses)];
  }

  /**
   * Extract return statements
   */
  extractReturns(code) {
    const returns = [];
    const matches = code.match(/return\s+([^;}\n]+)/g);

    if (matches) {
      for (const match of matches) {
        const value = match.replace(/return\s+/, '').trim();
        returns.push(value);
      }
    }

    return returns;
  }

  /**
   * Analyze dependency edges (imports, requires, APIs)
   */
  analyzeDependencyEdges(code, language) {
    const dependencies = {
      imports: [],
      exports: [],
      apiCalls: [],
      externalLibraries: [],
      totalEdges: 0
    };

    // Detect imports
    const importMatches = code.match(/(?:import|require|from)\s+['"]([\w\-/.@]+)['"]/g);
    if (importMatches) {
      for (const match of importMatches) {
        const [, module] = match.match(/['"]([\w\-/.@]+)['"]/) || [];
        if (module) {
          dependencies.imports.push({
            module,
            edgeType: this.edgeTypes.import
          });
        }
      }
    }

    // Detect exports
    const exportMatches = code.match(/export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g);
    if (exportMatches) {
      for (const match of exportMatches) {
        const [, name] = match.match(/export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/) || [];
        if (name) {
          dependencies.exports.push({
            name,
            edgeType: this.edgeTypes.export
          });
        }
      }
    }

    // Detect API calls
    const apiPatterns = [
      /fetch\s*\(/g,
      /axios\.\w+\s*\(/g,
      /XMLHttpRequest/g,
      /http\.\w+\s*\(/g
    ];

    for (const pattern of apiPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        dependencies.apiCalls.push(...matches.map(m => ({
          call: m,
          edgeType: 'api'
        })));
      }
    }

    dependencies.totalEdges =
      dependencies.imports.length +
      dependencies.exports.length +
      dependencies.apiCalls.length;

    return dependencies;
  }

  /**
   * Build call graph (function → function edges)
   */
  buildCallGraph(code, language) {
    const graph = {
      nodes: [],
      edges: [],
      clusters: []
    };

    // Extract all function names
    let funcMatches;
    if (language === 'javascript') {
      funcMatches = code.match(/function\s+(\w+)/g);
    } else if (language === 'python') {
      funcMatches = code.match(/def\s+(\w+)/g);
    }

    if (!funcMatches) return graph;

    const functionNames = funcMatches.map(m =>
      m.replace(/(?:function|def)\s+/, '')
    );

    // Add nodes
    for (const name of functionNames) {
      graph.nodes.push({ name, type: 'function' });
    }

    // Find call edges
    for (const funcMatch of code.matchAll(/(?:function|def)\s+(\w+)\s*\([^)]*\)[\s:]\s*[{\n][\s\S]*?(?=\n(?:function|def)|$)/g)) {
      const callerName = funcMatch[1];
      const funcBody = funcMatch[0];

      // Find calls to other functions
      for (const targetName of functionNames) {
        if (targetName === callerName) continue;

        const callPattern = new RegExp(`\\b${targetName}\\s*\\(`, 'g');
        const callCount = (funcBody.match(callPattern) || []).length;

        if (callCount > 0) {
          graph.edges.push({
            from: callerName,
            to: targetName,
            count: callCount,
            type: 'call'
          });
        }
      }
    }

    // Detect clusters (groups of related functions)
    graph.clusters = this.detectClusters(graph);

    return graph;
  }

  /**
   * Detect function clusters (strongly connected components)
   */
  detectClusters(graph) {
    const clusters = [];
    const visited = new Set();

    for (const node of graph.nodes) {
      if (visited.has(node.name)) continue;

      const cluster = this.findConnectedFunctions(node.name, graph, visited);
      if (cluster.length > 1) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Find all functions connected to a given function
   */
  findConnectedFunctions(startName, graph, visited) {
    const cluster = [startName];
    const queue = [startName];
    visited.add(startName);

    while (queue.length > 0) {
      const current = queue.shift();

      // Find neighbors
      for (const edge of graph.edges) {
        if (edge.from === current && !visited.has(edge.to)) {
          cluster.push(edge.to);
          queue.push(edge.to);
          visited.add(edge.to);
        }
      }
    }

    return cluster;
  }

  /**
   * Analyze data flow (variable → function edges)
   */
  analyzeDataFlow(code, language) {
    const flow = {
      variables: [],
      flows: [],
      totalFlows: 0
    };

    // Extract variable declarations
    let varMatches;
    if (language === 'javascript') {
      varMatches = code.match(/(?:const|let|var)\s+(\w+)\s*=/g);
    } else if (language === 'python') {
      varMatches = code.match(/(\w+)\s*=/g);
    }

    if (!varMatches) return flow;

    const variableNames = varMatches.map(m =>
      m.replace(/(?:const|let|var)\s+/, '').replace(/\s*=$/, '').trim()
    );

    flow.variables = variableNames;

    // Find where variables are used
    for (const varName of variableNames) {
      // Find function calls that use this variable
      const usagePattern = new RegExp(`\\b${varName}\\b`, 'g');
      const usageCount = (code.match(usagePattern) || []).length - 1; // -1 for declaration

      if (usageCount > 0) {
        flow.flows.push({
          variable: varName,
          usages: usageCount,
          type: 'data-flow'
        });
        flow.totalFlows += usageCount;
      }
    }

    return flow;
  }

  /**
   * Calculate total edges across all categories
   */
  calculateTotalEdges(analysis) {
    return (
      analysis.objects.totalEdges +
      analysis.functions.totalEdges +
      analysis.dependencies.totalEdges +
      analysis.callGraph.edges.length +
      analysis.dataFlow.totalFlows
    );
  }

  /**
   * Calculate edge density (edges per line of code)
   */
  calculateEdgeDensity(code, totalEdges) {
    const lines = code.split('\n').filter(line => line.trim()).length;
    return lines > 0 ? totalEdges / lines : 0;
  }

  /**
   * Calculate complexity from edge analysis
   */
  calculateComplexityFromEdges(analysis) {
    // Cyclomatic complexity approximation from edges
    const callGraphComplexity = analysis.callGraph.edges.length;
    const dataFlowComplexity = analysis.dataFlow.totalFlows * 0.5;
    const objectComplexity = analysis.objects.totalEdges * 0.3;

    return {
      callGraph: callGraphComplexity,
      dataFlow: dataFlowComplexity,
      objects: objectComplexity,
      total: callGraphComplexity + dataFlowComplexity + objectComplexity
    };
  }

  /**
   * Generate edge report
   */
  generateReport(analysis) {
    let report = '';

    report += '📊 Edge Analysis Report\n';
    report += '═'.repeat(60) + '\n\n';

    // Objects
    report += `📦 Objects: ${analysis.objects.count}\n`;
    report += `   Total Edges: ${analysis.objects.totalEdges}\n`;
    report += `   Average Edges: ${analysis.objects.averageEdges.toFixed(2)}\n\n`;

    if (analysis.objects.items.length > 0) {
      report += '   Top Objects:\n';
      for (const obj of analysis.objects.items.slice(0, 5)) {
        report += `     - ${obj.name} (${obj.type}): ${obj.edges} edges, depth ${obj.depth}\n`;
      }
      report += '\n';
    }

    // Functions
    report += `🔧 Functions: ${analysis.functions.count}\n`;
    report += `   Total Edges: ${analysis.functions.totalEdges}\n`;
    report += `   Average Edges: ${analysis.functions.averageEdges.toFixed(2)}\n\n`;

    if (analysis.functions.items.length > 0) {
      report += '   Top Functions:\n';
      for (const func of analysis.functions.items.slice(0, 5)) {
        report += `     - ${func.name}: ${func.totalEdges} edges (${func.incomingEdges} in, ${func.outgoingEdges} out)\n`;
      }
      report += '\n';
    }

    // Dependencies
    report += `📚 Dependencies:\n`;
    report += `   Imports: ${analysis.dependencies.imports.length}\n`;
    report += `   Exports: ${analysis.dependencies.exports.length}\n`;
    report += `   API Calls: ${analysis.dependencies.apiCalls.length}\n\n`;

    // Call Graph
    report += `🔗 Call Graph:\n`;
    report += `   Functions: ${analysis.callGraph.nodes.length}\n`;
    report += `   Calls: ${analysis.callGraph.edges.length}\n`;
    report += `   Clusters: ${analysis.callGraph.clusters.length}\n\n`;

    if (analysis.callGraph.clusters.length > 0) {
      report += '   Function Clusters:\n';
      for (const cluster of analysis.callGraph.clusters.slice(0, 3)) {
        report += `     - ${cluster.join(', ')}\n`;
      }
      report += '\n';
    }

    // Data Flow
    report += `🌊 Data Flow:\n`;
    report += `   Variables: ${analysis.dataFlow.variables.length}\n`;
    report += `   Total Flows: ${analysis.dataFlow.totalFlows}\n\n`;

    // Summary
    report += `📈 Summary:\n`;
    report += `   Total Edges: ${analysis.totalEdges}\n`;
    report += `   Edge Density: ${analysis.edgeDensity.toFixed(3)} edges/line\n`;
    report += `   Complexity Score: ${analysis.complexity.total.toFixed(2)}\n`;

    return report;
  }
}

module.exports = EdgeDetector;
