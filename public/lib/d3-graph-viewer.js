/**
 * D3 Graph Viewer
 *
 * Interactive force-directed graph visualization for knowledge graphs.
 * Built with D3.js v7.
 *
 * Features:
 * - Force-directed layout with collision detection
 * - Drag nodes to reposition
 * - Zoom and pan
 * - Click node to see details
 * - Filter by type/category
 * - Search concepts
 * - Color-coded by type
 * - Edge labels on hover
 *
 * Usage:
 *   const viewer = new D3GraphViewer('#container');
 *   viewer.load(graphData);
 */

class D3GraphViewer {
  constructor(containerSelector, options = {}) {
    this.container = d3.select(containerSelector);
    this.options = {
      width: options.width || 1200,
      height: options.height || 800,
      nodeRadius: options.nodeRadius || 8,
      linkDistance: options.linkDistance || 100,
      chargeStrength: options.chargeStrength || -300,
      collisionRadius: options.collisionRadius || 30,
      colors: options.colors || this._getDefaultColors(),
      ...options
    };

    this.simulation = null;
    this.svg = null;
    this.g = null;
    this.link = null;
    this.node = null;
    this.label = null;

    this._init();
  }

  /**
   * Initialize SVG and simulation
   * @private
   */
  _init() {
    // Create SVG
    this.svg = this.container
      .append('svg')
      .attr('width', this.options.width)
      .attr('height', this.options.height)
      .attr('viewBox', [0, 0, this.options.width, this.options.height])
      .style('background', '#fafafa');

    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    this.svg.call(zoom);

    // Create group for graph elements
    this.g = this.svg.append('g');

    // Add arrow markers for directed edges
    this.svg.append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', '#999');
  }

  /**
   * Load and render graph data
   *
   * @param {Object} graphData - Graph with nodes and edges
   */
  load(graphData) {
    console.log('[D3GraphViewer] Loading graph:', graphData.metadata);

    this.graphData = graphData;

    // Clear existing graph
    if (this.simulation) {
      this.simulation.stop();
    }
    this.g.selectAll('*').remove();

    // Prepare data
    const nodes = graphData.nodes.map(d => ({ ...d }));
    const links = graphData.edges.map(d => ({ ...d }));

    // Create force simulation
    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(d => this._getLinkDistance(d))
      )
      .force('charge', d3.forceManyBody()
        .strength(this.options.chargeStrength)
      )
      .force('center', d3.forceCenter(
        this.options.width / 2,
        this.options.height / 2
      ))
      .force('collision', d3.forceCollide()
        .radius(this.options.collisionRadius)
      );

    // Draw links
    this.link = this.g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => this._getLinkColor(d))
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.sqrt(d.weight || 1))
      .attr('marker-end', d =>
        d.type === 'prerequisite' ? 'url(#arrowhead)' : null
      );

    // Draw link labels (shown on hover)
    this.linkLabel = this.g.append('g')
      .attr('class', 'link-labels')
      .selectAll('text')
      .data(links)
      .join('text')
      .attr('class', 'link-label')
      .attr('text-anchor', 'middle')
      .attr('dy', -5)
      .attr('font-size', '10px')
      .attr('fill', '#666')
      .attr('opacity', 0)
      .text(d => d.label || d.type);

    // Draw nodes
    this.node = this.g.append('g')
      .attr('class', 'nodes')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => this._getNodeRadius(d))
      .attr('fill', d => this._getNodeColor(d))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .call(this._drag(this.simulation))
      .on('mouseover', (event, d) => this._showNodeTooltip(event, d))
      .on('mouseout', () => this._hideNodeTooltip())
      .on('click', (event, d) => this._onNodeClick(event, d));

    // Draw labels
    this.label = this.g.append('g')
      .attr('class', 'labels')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .attr('dx', 12)
      .attr('dy', 4)
      .attr('font-size', '11px')
      .attr('fill', '#333')
      .text(d => d.label.length > 30 ? d.label.substring(0, 30) + '...' : d.label)
      .style('pointer-events', 'none');

    // Update positions on each tick
    this.simulation.on('tick', () => {
      this.link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      this.linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      this.node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      this.label
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });
  }

  /**
   * Filter nodes by type or category
   *
   * @param {Object} filters - { type: 'heading', category: 'section' }
   */
  filter(filters) {
    const { type, category } = filters;

    this.node
      .attr('opacity', d => {
        if (type && d.type !== type) return 0.1;
        if (category && d.category !== category) return 0.1;
        return 1;
      });

    this.label
      .attr('opacity', d => {
        if (type && d.type !== type) return 0.1;
        if (category && d.category !== category) return 0.1;
        return 1;
      });

    this.link
      .attr('opacity', d => {
        const sourceVisible = (!type || d.source.type === type) &&
                              (!category || d.source.category === category);
        const targetVisible = (!type || d.target.type === type) &&
                              (!category || d.target.category === category);
        return (sourceVisible && targetVisible) ? 0.6 : 0.1;
      });
  }

  /**
   * Clear all filters
   */
  clearFilters() {
    this.node.attr('opacity', 1);
    this.label.attr('opacity', 1);
    this.link.attr('opacity', 0.6);
  }

  /**
   * Highlight a specific node and its connections
   *
   * @param {string} nodeId - Node ID to highlight
   */
  highlight(nodeId) {
    const connectedNodeIds = new Set([nodeId]);

    // Find connected nodes
    this.graphData.edges.forEach(edge => {
      if (edge.source === nodeId || edge.source.id === nodeId) {
        connectedNodeIds.add(edge.target.id || edge.target);
      }
      if (edge.target === nodeId || edge.target.id === nodeId) {
        connectedNodeIds.add(edge.source.id || edge.source);
      }
    });

    // Highlight connected nodes
    this.node
      .attr('opacity', d => connectedNodeIds.has(d.id) ? 1 : 0.2)
      .attr('stroke-width', d => d.id === nodeId ? 4 : 2);

    this.label
      .attr('opacity', d => connectedNodeIds.has(d.id) ? 1 : 0.2)
      .attr('font-weight', d => d.id === nodeId ? 'bold' : 'normal');

    this.link
      .attr('opacity', d => {
        const sourceId = d.source.id || d.source;
        const targetId = d.target.id || d.target;
        return (sourceId === nodeId || targetId === nodeId) ? 0.8 : 0.1;
      });
  }

  /**
   * Clear highlight
   */
  clearHighlight() {
    this.node
      .attr('opacity', 1)
      .attr('stroke-width', 2);

    this.label
      .attr('opacity', 1)
      .attr('font-weight', 'normal');

    this.link
      .attr('opacity', 0.6);
  }

  /**
   * Search for nodes by label
   *
   * @param {string} query - Search query
   */
  search(query) {
    if (!query) {
      this.clearHighlight();
      return;
    }

    const lowerQuery = query.toLowerCase();
    const matches = this.graphData.nodes.filter(n =>
      n.label.toLowerCase().includes(lowerQuery)
    );

    if (matches.length === 0) {
      return;
    }

    // Highlight matches
    const matchIds = new Set(matches.map(m => m.id));

    this.node
      .attr('opacity', d => matchIds.has(d.id) ? 1 : 0.2)
      .attr('stroke-width', d => matchIds.has(d.id) ? 4 : 2);

    this.label
      .attr('opacity', d => matchIds.has(d.id) ? 1 : 0.2)
      .attr('font-weight', d => matchIds.has(d.id) ? 'bold' : 'normal');

    this.link.attr('opacity', 0.2);

    // Zoom to fit matches
    const xs = matches.map(m => m.x).filter(x => x);
    const ys = matches.map(m => m.y).filter(y => y);

    if (xs.length > 0 && ys.length > 0) {
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const scale = 0.8 / Math.max(
        (maxX - minX) / this.options.width,
        (maxY - minY) / this.options.height
      );

      this.svg.transition()
        .duration(750)
        .call(
          d3.zoom().transform,
          d3.zoomIdentity
            .translate(this.options.width / 2, this.options.height / 2)
            .scale(Math.min(scale, 2))
            .translate(-centerX, -centerY)
        );
    }
  }

  /**
   * Get default color scheme
   * @private
   */
  _getDefaultColors() {
    return {
      heading: '#667eea',
      term: '#764ba2',
      code: '#f093fb',
      'inline-code': '#4facfe',
      default: '#888'
    };
  }

  /**
   * Get node color by type
   * @private
   */
  _getNodeColor(node) {
    return this.options.colors[node.type] || this.options.colors.default;
  }

  /**
   * Get node radius by weight
   * @private
   */
  _getNodeRadius(node) {
    return this.options.nodeRadius + Math.sqrt(node.weight || 1);
  }

  /**
   * Get link color by type
   * @private
   */
  _getLinkColor(link) {
    const colors = {
      'co-occurrence': '#ccc',
      'prerequisite': '#f59e0b',
      'parent-child': '#10b981',
      'default': '#999'
    };
    return colors[link.type] || colors.default;
  }

  /**
   * Get link distance by type
   * @private
   */
  _getLinkDistance(link) {
    const distances = {
      'parent-child': 80,
      'prerequisite': 120,
      'co-occurrence': 150,
      'default': 100
    };
    return distances[link.type] || distances.default;
  }

  /**
   * Drag behavior
   * @private
   */
  _drag(simulation) {
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended);
  }

  /**
   * Show node tooltip
   * @private
   */
  _showNodeTooltip(event, node) {
    // Show link labels for connected edges
    this.linkLabel
      .attr('opacity', d => {
        const sourceId = d.source.id || d.source;
        const targetId = d.target.id || d.target;
        return (sourceId === node.id || targetId === node.id) ? 1 : 0;
      });

    // Could add a tooltip div here
    if (this.options.onHover) {
      this.options.onHover(node);
    }
  }

  /**
   * Hide node tooltip
   * @private
   */
  _hideNodeTooltip() {
    this.linkLabel.attr('opacity', 0);

    if (this.options.onHoverEnd) {
      this.options.onHoverEnd();
    }
  }

  /**
   * Handle node click
   * @private
   */
  _onNodeClick(event, node) {
    if (this.options.onClick) {
      this.options.onClick(node);
    } else {
      // Default: highlight connections
      this.highlight(node.id);
    }
  }

  /**
   * Export graph as image (PNG)
   */
  exportImage() {
    const svgData = new XMLSerializer().serializeToString(this.svg.node());
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = this.options.width;
    canvas.height = this.options.height;

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');

      const downloadLink = document.createElement('a');
      downloadLink.download = 'graph.png';
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }

  /**
   * Destroy viewer
   */
  destroy() {
    if (this.simulation) {
      this.simulation.stop();
    }
    this.container.selectAll('*').remove();
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.D3GraphViewer = D3GraphViewer;
}
