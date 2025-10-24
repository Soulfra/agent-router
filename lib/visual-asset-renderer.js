/**
 * Visual Asset Renderer
 *
 * Generates visual assets (SVG badges, shields, simple tilemaps)
 * programmatically. For complex image generation, uses visual-expert model.
 */

class VisualAssetRenderer {
  constructor() {
    this.TILE_COLORS = {
      0: '#2c3e50', // EMPTY - dark gray
      1: '#34495e', // WALL - gray
      2: '#ecf0f1', // FLOOR - white
      3: '#f39c12', // DOOR - orange
      4: '#3498db', // WATER - blue
      5: '#e74c3c', // LAVA - red
      6: '#27ae60', // GRASS - green
      7: '#f1c40f', // CHEST - gold
      8: '#c0392b', // ENEMY - dark red
      9: '#9b59b6', // NPC - purple
      10: '#1abc9c' // SPAWN - teal
    };

    this.TILE_SIZE = 32; // pixels
  }

  /**
   * Generate SVG badge
   */
  generateBadgeSVG(badgeConfig) {
    const {
      id,
      name,
      icon,
      color = '#667eea',
      description = ''
    } = badgeConfig;

    const width = 200;
    const height = 80;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="badge-gradient-${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${this.darkenColor(color)};stop-opacity:1" />
    </linearGradient>
    <filter id="shadow-${id}">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
    </filter>
  </defs>

  <!-- Badge background -->
  <rect x="0" y="0" width="${width}" height="${height}" rx="10" ry="10"
        fill="url(#badge-gradient-${id})" filter="url(#shadow-${id})"/>

  <!-- Icon circle -->
  <circle cx="40" cy="40" r="25" fill="rgba(255,255,255,0.2)"/>

  <!-- Icon text -->
  <text x="40" y="50" font-size="30" text-anchor="middle" fill="white">${icon}</text>

  <!-- Badge name -->
  <text x="75" y="35" font-size="18" font-weight="bold" fill="white" font-family="Arial, sans-serif">
    ${name}
  </text>

  <!-- Description -->
  <text x="75" y="55" font-size="12" fill="rgba(255,255,255,0.8)" font-family="Arial, sans-serif">
    ${description.substring(0, 30)}${description.length > 30 ? '...' : ''}
  </text>
</svg>`;

    return svg;
  }

  /**
   * Generate shield SVG (more ornate than badge)
   */
  generateShieldSVG(shieldConfig) {
    const {
      id,
      name,
      icon,
      color = '#667eea',
      rank = 'bronze'
    } = shieldConfig;

    const width = 150;
    const height = 180;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shield-gradient-${id}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${this.darkenColor(color)};stop-opacity:1" />
    </linearGradient>
    <filter id="shield-shadow-${id}">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- Shield shape -->
  <path d="M 75,10
           C 100,10 120,15 130,25
           L 140,140
           C 140,160 75,170 75,170
           C 75,170 10,160 10,140
           L 20,25
           C 30,15 50,10 75,10 Z"
        fill="url(#shield-gradient-${id})"
        stroke="#2c3e50"
        stroke-width="3"
        filter="url(#shield-shadow-${id})"/>

  <!-- Inner decoration -->
  <path d="M 75,30
           C 95,30 110,35 115,40
           L 120,120
           C 120,135 75,145 75,145
           C 75,145 30,135 30,120
           L 35,40
           C 40,35 55,30 75,30 Z"
        fill="rgba(255,255,255,0.15)"
        stroke="rgba(255,255,255,0.3)"
        stroke-width="2"/>

  <!-- Icon -->
  <text x="75" y="90" font-size="50" text-anchor="middle" fill="white">${icon}</text>

  <!-- Name banner -->
  <rect x="25" y="140" width="100" height="25" rx="5" fill="rgba(0,0,0,0.3)"/>
  <text x="75" y="158" font-size="14" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial, sans-serif">
    ${name.toUpperCase()}
  </text>

  <!-- Rank -->
  <text x="75" y="25" font-size="10" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="Arial, sans-serif">
    ${rank.toUpperCase()}
  </text>
</svg>`;

    return svg;
  }

  /**
   * Generate simple tilemap SVG representation
   */
  generateTilemapSVG(tilemapData) {
    const { tiles, width, height, name = 'Map' } = tilemapData;

    const tileSize = this.TILE_SIZE;
    const svgWidth = width * tileSize;
    const svgHeight = height * tileSize + 40; // +40 for title

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <!-- Map title -->
  <rect x="0" y="0" width="${svgWidth}" height="40" fill="#2c3e50"/>
  <text x="${svgWidth / 2}" y="25" font-size="18" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial, sans-serif">
    ${name}
  </text>

  <!-- Tiles -->
  <g transform="translate(0, 40)">
`;

    // Render each tile
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tileIndex = y * width + x;
        const tileType = tiles[tileIndex] || 0;
        const color = this.TILE_COLORS[tileType] || '#2c3e50';

        const posX = x * tileSize;
        const posY = y * tileSize;

        svg += `    <rect x="${posX}" y="${posY}" width="${tileSize}" height="${tileSize}" fill="${color}" stroke="#1a1a1a" stroke-width="1"/>\n`;

        // Add icon for special tiles
        if (tileType === 7) { // CHEST
          svg += `    <text x="${posX + tileSize/2}" y="${posY + tileSize/2 + 6}" font-size="20" text-anchor="middle" fill="#2c3e50">📦</text>\n`;
        } else if (tileType === 8) { // ENEMY
          svg += `    <text x="${posX + tileSize/2}" y="${posY + tileSize/2 + 6}" font-size="20" text-anchor="middle" fill="white">👹</text>\n`;
        } else if (tileType === 9) { // NPC
          svg += `    <text x="${posX + tileSize/2}" y="${posY + tileSize/2 + 6}" font-size="20" text-anchor="middle" fill="white">🧙</text>\n`;
        } else if (tileType === 10) { // SPAWN
          svg += `    <text x="${posX + tileSize/2}" y="${posY + tileSize/2 + 6}" font-size="20" text-anchor="middle" fill="white">⭐</text>\n`;
        }
      }
    }

    svg += `  </g>

  <!-- Legend -->
  <g transform="translate(10, ${height * tileSize + 45})">
    <text x="0" y="0" font-size="10" fill="#7f8c8d" font-family="Arial, sans-serif">
      Legend: Wall, Floor, Water, Grass, Chest📦, Enemy👹, NPC🧙, Spawn⭐
    </text>
  </g>
</svg>`;

    return svg;
  }

  /**
   * Generate simple ASCII tilemap (for debugging/testing)
   */
  generateTilemapASCII(tilemapData) {
    const { tiles, width, height } = tilemapData;

    const TILE_CHARS = {
      0: '  ', // EMPTY
      1: '██', // WALL
      2: '░░', // FLOOR
      3: '▓▓', // DOOR
      4: '≈≈', // WATER
      5: '▒▒', // LAVA
      6: '▓░', // GRASS
      7: '[]', // CHEST
      8: '☠☠', // ENEMY
      9: '♦♦', // NPC
      10: '**'  // SPAWN
    };

    let ascii = '';
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tileIndex = y * width + x;
        const tileType = tiles[tileIndex] || 0;
        ascii += TILE_CHARS[tileType] || '??';
      }
      ascii += '\n';
    }

    return ascii;
  }

  /**
   * Darken a hex color
   */
  darkenColor(hex, percent = 20) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;

    return '#' + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
  }

  /**
   * Generate product showcase card SVG
   */
  generateProductCardSVG(productConfig) {
    const {
      name,
      price,
      description,
      color = '#667eea',
      image_icon = '🎁'
    } = productConfig;

    const width = 300;
    const height = 400;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="product-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f8f9fa;stop-opacity:1" />
    </linearGradient>
    <filter id="card-shadow">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.15"/>
    </filter>
  </defs>

  <!-- Card background -->
  <rect x="0" y="0" width="${width}" height="${height}" rx="15" ry="15"
        fill="url(#product-gradient)"
        stroke="#e0e0e0"
        stroke-width="1"
        filter="url(#card-shadow)"/>

  <!-- Image placeholder -->
  <rect x="20" y="20" width="260" height="200" rx="10" fill="${color}" opacity="0.2"/>
  <text x="150" y="130" font-size="80" text-anchor="middle">${image_icon}</text>

  <!-- Product name -->
  <text x="150" y="260" font-size="22" font-weight="bold" text-anchor="middle" fill="#2c3e50" font-family="Arial, sans-serif">
    ${name}
  </text>

  <!-- Description -->
  <foreignObject x="20" y="280" width="260" height="60">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 14px; color: #7f8c8d; text-align: center; line-height: 1.4;">
      ${description.substring(0, 80)}${description.length > 80 ? '...' : ''}
    </div>
  </foreignObject>

  <!-- Price -->
  <rect x="20" y="350" width="260" height="40" rx="8" fill="${color}"/>
  <text x="150" y="378" font-size="24" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial, sans-serif">
    ${price}
  </text>
</svg>`;

    return svg;
  }
}

module.exports = VisualAssetRenderer;
