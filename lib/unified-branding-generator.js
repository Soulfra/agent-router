/**
 * Unified Branding Generator
 *
 * Like Airbnb's Bélo rebrand but for friend groups, sports teams, and communities.
 * Generates custom logos, icons, and color schemes per group.
 *
 * Philosophy:
 * - Every group gets a unique visual identity
 * - Simple, recognizable symbols (like Airbnb's Bélo)
 * - Color schemes that represent group type
 * - SVG-based for scalability
 * - Can generate from group name, type, or custom prompts
 */

const crypto = require('crypto');

class UnifiedBrandingGenerator {
  constructor(options = {}) {
    this.ollamaClient = options.ollamaClient; // Optional AI for custom designs
    this.db = options.db;

    this.config = {
      // Group type color schemes
      colorSchemes: {
        friend_group: {
          primary: '#667eea',
          secondary: '#764ba2',
          accent: '#f093fb',
          gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        },
        sports_team: {
          primary: '#ff6b6b',
          secondary: '#4ecdc4',
          accent: '#ffe66d',
          gradient: 'linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 100%)'
        },
        community: {
          primary: '#4ecdc4',
          secondary: '#44a08d',
          accent: '#6c5ce7',
          gradient: 'linear-gradient(135deg, #4ecdc4 0%, #44a08d 100%)'
        },
        study_group: {
          primary: '#6c5ce7',
          secondary: '#a29bfe',
          accent: '#fd79a8',
          gradient: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)'
        },
        gaming_squad: {
          primary: '#00b894',
          secondary: '#00cec9',
          accent: '#fdcb6e',
          gradient: 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)'
        },
        family: {
          primary: '#fd79a8',
          secondary: '#fdcb6e',
          accent: '#e17055',
          gradient: 'linear-gradient(135deg, #fd79a8 0%, #fdcb6e 100%)'
        }
      },

      // Icon templates (like Airbnb's Bélo)
      iconTemplates: {
        // Simple geometric shapes
        circle: { type: 'shape', shape: 'circle' },
        triangle: { type: 'shape', shape: 'triangle' },
        square: { type: 'shape', shape: 'square' },
        hexagon: { type: 'shape', shape: 'hexagon' },
        star: { type: 'shape', shape: 'star' },

        // Abstract symbols
        unity: { type: 'symbol', symbol: 'people-holding-hands' },
        trophy: { type: 'symbol', symbol: 'trophy' },
        flame: { type: 'symbol', symbol: 'flame' },
        heart: { type: 'symbol', symbol: 'heart' },
        shield: { type: 'symbol', symbol: 'shield' },

        // Letter-based (first letter of group name)
        letter: { type: 'letter' },

        // Custom SVG paths
        custom: { type: 'custom' }
      },

      // Emoji fallbacks (quick and easy)
      emojiFallbacks: {
        friend_group: ['🔥', '✨', '💫', '🌟', '⭐', '💎', '🎯', '🚀'],
        sports_team: ['🏆', '⚡', '💪', '🎯', '🏅', '🥇', '⚽', '🏀'],
        community: ['🌍', '🌎', '🌏', '🤝', '💬', '📢', '🎪', '🎭'],
        study_group: ['📚', '🎓', '✏️', '📝', '🧠', '💡', '🔬', '🎨'],
        gaming_squad: ['🎮', '🕹️', '👾', '🎯', '⚔️', '🛡️', '🏹', '🎲'],
        family: ['❤️', '🏠', '👨‍👩‍👧‍👦', '🌳', '🌸', '☀️', '🌺', '🦋']
      },

      // Mascot suggestions
      mascotSuggestions: {
        friend_group: ['phoenix', 'dragon', 'unicorn', 'wolf', 'eagle'],
        sports_team: ['lion', 'tiger', 'bear', 'hawk', 'shark'],
        community: ['owl', 'tree', 'mountain', 'river', 'sun'],
        study_group: ['owl', 'book', 'lightbulb', 'atom', 'rocket'],
        gaming_squad: ['dragon', 'knight', 'wizard', 'ninja', 'robot'],
        family: ['tree', 'house', 'heart', 'sun', 'garden']
      }
    };

    console.log('[UnifiedBrandingGenerator] Initialized');
  }

  /**
   * Generate complete branding package for a group
   */
  async generateGroupBranding({ name, type, customColors = null, customIcon = null }) {
    try {
      // Get color scheme
      const colors = customColors || this.getColorScheme(type);

      // Generate icon
      const icon = customIcon || await this.generateIcon({ name, type, colors });

      // Generate mascot suggestion
      const mascot = this.suggestMascot(type);

      // Generate logo variations
      const logos = this.generateLogoVariations({ name, icon, colors });

      // Generate usage guidelines
      const guidelines = this.generateBrandGuidelines({ name, type, colors, icon });

      return {
        success: true,
        branding: {
          name,
          type,
          colors,
          icon,
          mascot,
          logos,
          guidelines,
          metadata: {
            generated_at: new Date().toISOString(),
            version: '1.0'
          }
        }
      };

    } catch (error) {
      console.error('[UnifiedBrandingGenerator] Error generating branding:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate icon (SVG or emoji)
   */
  async generateIcon({ name, type, colors, style = 'simple' }) {
    // Try to generate SVG icon
    if (style === 'svg') {
      return this.generateSVGIcon({ name, type, colors });
    }

    // Fallback to emoji
    return this.generateEmojiIcon(type);
  }

  /**
   * Generate SVG icon
   */
  generateSVGIcon({ name, type, colors }) {
    const firstLetter = name.charAt(0).toUpperCase();

    // Simple circle with letter (like Airbnb's Bélo but with initials)
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <defs>
          <linearGradient id="gradient-${type}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${colors.primary};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${colors.secondary};stop-opacity:1" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="45" fill="url(#gradient-${type})" />
        <text x="50" y="50" font-family="Arial, sans-serif" font-size="40" font-weight="bold"
              fill="white" text-anchor="middle" dominant-baseline="central">
          ${firstLetter}
        </text>
      </svg>
    `.trim();

    return {
      type: 'svg',
      svg,
      format: 'svg',
      preview: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    };
  }

  /**
   * Generate emoji icon
   */
  generateEmojiIcon(type) {
    const emojis = this.config.emojiFallbacks[type] || this.config.emojiFallbacks.friend_group;
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];

    return {
      type: 'emoji',
      emoji,
      format: 'unicode'
    };
  }

  /**
   * Get color scheme for group type
   */
  getColorScheme(type) {
    return this.config.colorSchemes[type] || this.config.colorSchemes.friend_group;
  }

  /**
   * Suggest mascot for group type
   */
  suggestMascot(type) {
    const suggestions = this.config.mascotSuggestions[type] || this.config.mascotSuggestions.friend_group;
    return {
      primary: suggestions[0],
      alternatives: suggestions.slice(1)
    };
  }

  /**
   * Generate logo variations (full, compact, icon-only)
   */
  generateLogoVariations({ name, icon, colors }) {
    return {
      full: {
        description: 'Full logo with name',
        format: 'svg',
        usage: 'Website headers, banners, print materials',
        svg: this._generateFullLogo(name, icon, colors)
      },
      compact: {
        description: 'Compact version with abbreviated name',
        format: 'svg',
        usage: 'Mobile apps, small displays',
        svg: this._generateCompactLogo(name, icon, colors)
      },
      iconOnly: {
        description: 'Icon without text',
        format: icon.format,
        usage: 'App icons, favicons, profile pictures',
        data: icon.type === 'svg' ? icon.svg : icon.emoji
      }
    };
  }

  /**
   * Generate full logo SVG
   */
  _generateFullLogo(name, icon, colors) {
    const iconSVG = icon.type === 'svg' ? icon.svg : this._emojiToSVG(icon.emoji, colors);

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100" width="300" height="100">
        <defs>
          <linearGradient id="text-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:${colors.primary};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${colors.secondary};stop-opacity:1" />
          </linearGradient>
        </defs>
        ${iconSVG}
        <text x="120" y="55" font-family="Arial, sans-serif" font-size="32" font-weight="bold"
              fill="url(#text-gradient)">
          ${name}
        </text>
      </svg>
    `.trim();
  }

  /**
   * Generate compact logo SVG
   */
  _generateCompactLogo(name, icon, colors) {
    const abbreviated = name.split(' ').map(word => word.charAt(0)).join('').toUpperCase();
    const iconSVG = icon.type === 'svg' ? icon.svg : this._emojiToSVG(icon.emoji, colors);

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 100" width="150" height="100">
        ${iconSVG}
        <text x="120" y="55" font-family="Arial, sans-serif" font-size="28" font-weight="bold"
              fill="${colors.primary}">
          ${abbreviated}
        </text>
      </svg>
    `.trim();
  }

  /**
   * Convert emoji to SVG placeholder
   */
  _emojiToSVG(emoji, colors) {
    return `
      <circle cx="50" cy="50" r="40" fill="${colors.primary}" opacity="0.2" />
      <text x="50" y="60" font-size="50" text-anchor="middle">${emoji}</text>
    `;
  }

  /**
   * Generate brand guidelines
   */
  generateBrandGuidelines({ name, type, colors, icon }) {
    return {
      colors: {
        primary: {
          hex: colors.primary,
          usage: 'Primary brand color for main elements, buttons, headers'
        },
        secondary: {
          hex: colors.secondary,
          usage: 'Secondary color for accents, backgrounds, gradients'
        },
        accent: {
          hex: colors.accent,
          usage: 'Accent color for highlights, calls-to-action'
        }
      },
      typography: {
        heading: {
          font: 'Arial, sans-serif',
          weight: 'bold',
          usage: 'Group name, titles, headers'
        },
        body: {
          font: 'Arial, sans-serif',
          weight: 'normal',
          usage: 'Body text, descriptions, posts'
        }
      },
      spacing: {
        iconPadding: '10px minimum around icon',
        logoMargin: '20px minimum clear space'
      },
      usage: {
        do: [
          'Use on white or light backgrounds for best contrast',
          'Maintain aspect ratio when scaling',
          'Use gradient versions for digital media',
          'Keep icon centered and balanced'
        ],
        dont: [
          'Distort or skew the logo',
          'Change colors outside brand palette',
          'Add shadows or effects',
          'Place on busy backgrounds without proper contrast'
        ]
      }
    };
  }

  /**
   * Generate custom icon using AI (if Ollama available)
   */
  async generateCustomIconWithAI({ name, type, description }) {
    if (!this.ollamaClient) {
      console.log('[UnifiedBrandingGenerator] Ollama not available, using fallback');
      return this.generateEmojiIcon(type);
    }

    try {
      const prompt = `
Generate a simple SVG icon design concept for a ${type} called "${name}".
Description: ${description || 'No additional description'}

Respond with a JSON object containing:
{
  "concept": "Brief description of the icon concept",
  "emoji": "Best emoji representation",
  "colors": ["color1", "color2", "color3"],
  "shapes": ["primary shape", "secondary shape"]
}
`.trim();

      const response = await this.ollamaClient.chat({
        model: 'mistral:latest',
        messages: [{ role: 'user', content: prompt }],
        stream: false
      });

      const aiSuggestion = JSON.parse(response.message.content);

      return {
        type: 'ai-generated',
        concept: aiSuggestion.concept,
        emoji: aiSuggestion.emoji,
        colors: aiSuggestion.colors,
        shapes: aiSuggestion.shapes,
        format: 'concept'
      };

    } catch (error) {
      console.warn('[UnifiedBrandingGenerator] AI generation failed:', error.message);
      return this.generateEmojiIcon(type);
    }
  }

  /**
   * Save branding to database
   */
  async saveBranding(groupId, branding) {
    if (!this.db) {
      console.warn('[UnifiedBrandingGenerator] No database configured');
      return { success: false, error: 'Database not configured' };
    }

    try {
      await this.db.query(`
        UPDATE groups
        SET branding = $1, updated_at = NOW()
        WHERE group_id = $2
      `, [JSON.stringify(branding), groupId]);

      return { success: true };

    } catch (error) {
      console.error('[UnifiedBrandingGenerator] Error saving branding:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get branding for group
   */
  async getBranding(groupId) {
    if (!this.db) {
      return { success: false, error: 'Database not configured' };
    }

    try {
      const result = await this.db.query(`
        SELECT branding FROM groups WHERE group_id = $1
      `, [groupId]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Group not found' };
      }

      return {
        success: true,
        branding: result.rows[0].branding
      };

    } catch (error) {
      console.error('[UnifiedBrandingGenerator] Error getting branding:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate branding preview HTML
   */
  generateBrandingPreview(branding) {
    const { name, colors, icon, logos } = branding;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} - Branding Preview</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 40px;
      background: #f5f5f5;
    }
    .preview-container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    h1 {
      color: ${colors.primary};
      margin-bottom: 30px;
    }
    .color-palette {
      display: flex;
      gap: 20px;
      margin: 30px 0;
    }
    .color-swatch {
      width: 100px;
      height: 100px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
      font-weight: bold;
    }
    .logo-preview {
      margin: 40px 0;
      padding: 30px;
      background: #f9f9f9;
      border-radius: 8px;
    }
    .icon-preview {
      font-size: 80px;
      text-align: center;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="preview-container">
    <h1>${name} Brand Guidelines</h1>

    <h2>Color Palette</h2>
    <div class="color-palette">
      <div class="color-swatch" style="background: ${colors.primary}">
        Primary<br>${colors.primary}
      </div>
      <div class="color-swatch" style="background: ${colors.secondary}">
        Secondary<br>${colors.secondary}
      </div>
      <div class="color-swatch" style="background: ${colors.accent}">
        Accent<br>${colors.accent}
      </div>
    </div>

    <h2>Icon</h2>
    <div class="icon-preview">
      ${icon.type === 'emoji' ? icon.emoji : '📐 SVG Icon'}
    </div>

    <h2>Logo Variations</h2>
    <div class="logo-preview">
      <p><strong>Full Logo:</strong> For headers, banners, print materials</p>
      <p><strong>Compact Logo:</strong> For mobile apps, small displays</p>
      <p><strong>Icon Only:</strong> For app icons, favicons, profile pictures</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Export branding assets as downloadable package
   */
  async exportBrandingPackage(branding) {
    return {
      success: true,
      package: {
        'brand-colors.json': JSON.stringify(branding.colors, null, 2),
        'brand-guidelines.json': JSON.stringify(branding.guidelines, null, 2),
        'logo-full.svg': branding.logos.full.svg,
        'logo-compact.svg': branding.logos.compact.svg,
        'icon.svg': branding.icon.type === 'svg' ? branding.icon.svg : null,
        'preview.html': this.generateBrandingPreview(branding)
      }
    };
  }
}

module.exports = UnifiedBrandingGenerator;
