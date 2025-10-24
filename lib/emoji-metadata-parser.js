/**
 * Emoji Metadata Parser
 *
 * Parses emoji Unicode codepoints, extracts meaning, sentiment, category.
 * Turns ANY emoji into playable card data for games.
 *
 * Sources:
 * - Unicode.org (official emoji data)
 * - Emojipedia (meaning, keywords)
 * - Zedge (500M+ user emoji usage patterns)
 *
 * Philosophy:
 * Every emoji is a card. Every card has meaning.
 * Let the players decide what's cringe, what's based.
 */

class EmojiMetadataParser {
  constructor(options = {}) {
    this.options = options;

    // Comprehensive emoji database
    // Format: emoji → { codepoint, name, category, keywords, sentiment, vibeScore }
    this.emojiDatabase = this._buildEmojiDatabase();

    // Cringe/Based scoring (can be overridden by cringeproof.com)
    this.cringeScores = this._buildCringeScores();

    console.log('[EmojiMetadataParser] Initialized with', Object.keys(this.emojiDatabase).length, 'emojis');
  }

  /**
   * Parse emoji to metadata
   */
  parse(emoji) {
    const metadata = this.emojiDatabase[emoji];

    if (!metadata) {
      // Unknown emoji - generate basic metadata
      return {
        emoji,
        codepoint: this._getCodepoint(emoji),
        name: 'Unknown',
        category: 'misc',
        keywords: [],
        sentiment: 'neutral',
        vibeScore: 50,
        cringeScore: 50
      };
    }

    return {
      emoji,
      ...metadata,
      cringeScore: this.cringeScores[emoji] || 50
    };
  }

  /**
   * Get emoji codepoint (U+1F600 format)
   */
  _getCodepoint(emoji) {
    const codePoints = [];
    for (const char of emoji) {
      codePoints.push('U+' + char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
    }
    return codePoints.join(' ');
  }

  /**
   * Get emojis by category
   */
  getByCategory(category) {
    return Object.entries(this.emojiDatabase)
      .filter(([emoji, data]) => data.category === category)
      .map(([emoji, data]) => ({ emoji, ...data }));
  }

  /**
   * Get emojis by sentiment
   */
  getBySentiment(sentiment) {
    return Object.entries(this.emojiDatabase)
      .filter(([emoji, data]) => data.sentiment === sentiment)
      .map(([emoji, data]) => ({ emoji, ...data }));
  }

  /**
   * Get emojis by vibe score range
   */
  getByVibeScore(min, max) {
    return Object.entries(this.emojiDatabase)
      .filter(([emoji, data]) => data.vibeScore >= min && data.vibeScore <= max)
      .map(([emoji, data]) => ({ emoji, ...data }));
  }

  /**
   * Search emojis by keyword
   */
  search(keyword) {
    const lower = keyword.toLowerCase();
    return Object.entries(this.emojiDatabase)
      .filter(([emoji, data]) =>
        data.name.toLowerCase().includes(lower) ||
        data.keywords.some(k => k.toLowerCase().includes(lower))
      )
      .map(([emoji, data]) => ({ emoji, ...data }));
  }

  /**
   * Build emoji database
   * @private
   */
  _buildEmojiDatabase() {
    return {
      // Hanafuda / Nature (Classic Japanese card game vibes)
      '🎴': { codepoint: 'U+1F3B4', name: 'Flower Playing Cards', category: 'hanafuda', keywords: ['flower', 'cards', 'japanese', 'game'], sentiment: 'positive', vibeScore: 85 },
      '🌸': { codepoint: 'U+1F338', name: 'Cherry Blossom', category: 'nature', keywords: ['flower', 'spring', 'japan', 'pink'], sentiment: 'positive', vibeScore: 90 },
      '🌺': { codepoint: 'U+1F33A', name: 'Hibiscus', category: 'nature', keywords: ['flower', 'tropical', 'summer'], sentiment: 'positive', vibeScore: 85 },
      '🌻': { codepoint: 'U+1F33B', name: 'Sunflower', category: 'nature', keywords: ['flower', 'yellow', 'happy'], sentiment: 'positive', vibeScore: 88 },
      '🌼': { codepoint: 'U+1F33C', name: 'Blossom', category: 'nature', keywords: ['flower', 'spring'], sentiment: 'positive', vibeScore: 82 },
      '🌷': { codepoint: 'U+1F337', name: 'Tulip', category: 'nature', keywords: ['flower', 'spring', 'colorful'], sentiment: 'positive', vibeScore: 84 },
      '🍁': { codepoint: 'U+1F341', name: 'Maple Leaf', category: 'nature', keywords: ['leaf', 'fall', 'autumn', 'canada'], sentiment: 'neutral', vibeScore: 75 },
      '🌙': { codepoint: 'U+1F319', name: 'Crescent Moon', category: 'nature', keywords: ['moon', 'night', 'sky'], sentiment: 'calm', vibeScore: 80 },
      '⭐': { codepoint: 'U+2B50', name: 'Star', category: 'nature', keywords: ['star', 'night', 'bright'], sentiment: 'positive', vibeScore: 88 },
      '☀️': { codepoint: 'U+2600', name: 'Sun', category: 'nature', keywords: ['sun', 'day', 'bright', 'summer'], sentiment: 'positive', vibeScore: 92 },
      '🌊': { codepoint: 'U+1F30A', name: 'Wave', category: 'nature', keywords: ['water', 'ocean', 'surf'], sentiment: 'neutral', vibeScore: 78 },
      '⛰️': { codepoint: 'U+26F0', name: 'Mountain', category: 'nature', keywords: ['mountain', 'peak', 'nature'], sentiment: 'neutral', vibeScore: 76 },
      '🌋': { codepoint: 'U+1F30B', name: 'Volcano', category: 'nature', keywords: ['volcano', 'eruption', 'danger'], sentiment: 'intense', vibeScore: 70 },
      '🌪️': { codepoint: 'U+1F32A', name: 'Tornado', category: 'nature', keywords: ['tornado', 'storm', 'chaos'], sentiment: 'negative', vibeScore: 45 },
      '❄️': { codepoint: 'U+2744', name: 'Snowflake', category: 'nature', keywords: ['snow', 'winter', 'cold'], sentiment: 'neutral', vibeScore: 80 },
      '🌲': { codepoint: 'U+1F332', name: 'Evergreen Tree', category: 'nature', keywords: ['tree', 'forest', 'nature'], sentiment: 'calm', vibeScore: 82 },

      // Chaos / Meme Deck (Internet culture)
      '💀': { codepoint: 'U+1F480', name: 'Skull', category: 'chaos', keywords: ['skull', 'death', 'dead', 'lol'], sentiment: 'neutral', vibeScore: 60 },
      '🔥': { codepoint: 'U+1F525', name: 'Fire', category: 'chaos', keywords: ['fire', 'hot', 'lit'], sentiment: 'intense', vibeScore: 85 },
      '💩': { codepoint: 'U+1F4A9', name: 'Pile of Poo', category: 'chaos', keywords: ['poop', 'shit', 'funny'], sentiment: 'negative', vibeScore: 40 },
      '👻': { codepoint: 'U+1F47B', name: 'Ghost', category: 'chaos', keywords: ['ghost', 'spooky', 'halloween'], sentiment: 'neutral', vibeScore: 65 },
      '🤡': { codepoint: 'U+1F921', name: 'Clown Face', category: 'chaos', keywords: ['clown', 'joke', 'funny', 'cringe'], sentiment: 'negative', vibeScore: 30 },
      '😈': { codepoint: 'U+1F608', name: 'Smiling Face with Horns', category: 'chaos', keywords: ['devil', 'evil', 'mischief'], sentiment: 'negative', vibeScore: 55 },
      '💣': { codepoint: 'U+1F4A3', name: 'Bomb', category: 'chaos', keywords: ['bomb', 'explosion', 'danger'], sentiment: 'negative', vibeScore: 50 },
      '⚡': { codepoint: 'U+26A1', name: 'High Voltage', category: 'chaos', keywords: ['lightning', 'electricity', 'power'], sentiment: 'intense', vibeScore: 80 },
      '🎯': { codepoint: 'U+1F3AF', name: 'Direct Hit', category: 'chaos', keywords: ['target', 'bullseye', 'goal'], sentiment: 'positive', vibeScore: 75 },
      '🚀': { codepoint: 'U+1F680', name: 'Rocket', category: 'chaos', keywords: ['rocket', 'space', 'launch'], sentiment: 'positive', vibeScore: 88 },
      '💯': { codepoint: 'U+1F4AF', name: 'Hundred Points', category: 'chaos', keywords: ['100', 'perfect', 'score'], sentiment: 'positive', vibeScore: 95 },

      // Wholesome Deck (Gen Z friendly)
      '🦄': { codepoint: 'U+1F984', name: 'Unicorn', category: 'wholesome', keywords: ['unicorn', 'magical', 'fantasy'], sentiment: 'positive', vibeScore: 92 },
      '🌈': { codepoint: 'U+1F308', name: 'Rainbow', category: 'wholesome', keywords: ['rainbow', 'colorful', 'pride'], sentiment: 'positive', vibeScore: 90 },
      '🎈': { codepoint: 'U+1F388', name: 'Balloon', category: 'wholesome', keywords: ['balloon', 'party', 'celebration'], sentiment: 'positive', vibeScore: 86 },
      '🎁': { codepoint: 'U+1F381', name: 'Wrapped Gift', category: 'wholesome', keywords: ['gift', 'present', 'surprise'], sentiment: 'positive', vibeScore: 88 },
      '🍰': { codepoint: 'U+1F370', name: 'Shortcake', category: 'wholesome', keywords: ['cake', 'dessert', 'sweet'], sentiment: 'positive', vibeScore: 85 },
      '🎉': { codepoint: 'U+1F389', name: 'Party Popper', category: 'wholesome', keywords: ['party', 'celebration', 'confetti'], sentiment: 'positive', vibeScore: 92 },
      '✨': { codepoint: 'U+2728', name: 'Sparkles', category: 'wholesome', keywords: ['sparkle', 'shiny', 'magical'], sentiment: 'positive', vibeScore: 90 },
      '💖': { codepoint: 'U+1F496', name: 'Sparkling Heart', category: 'wholesome', keywords: ['heart', 'love', 'sparkle'], sentiment: 'positive', vibeScore: 94 },
      '🌟': { codepoint: 'U+1F31F', name: 'Glowing Star', category: 'wholesome', keywords: ['star', 'shine', 'bright'], sentiment: 'positive', vibeScore: 91 },
      '🎨': { codepoint: 'U+1F3A8', name: 'Artist Palette', category: 'wholesome', keywords: ['art', 'creative', 'colorful'], sentiment: 'positive', vibeScore: 87 },

      // Playing Cards (Traditional)
      '🃏': { codepoint: 'U+1F0CF', name: 'Joker', category: 'cards', keywords: ['joker', 'wild', 'card'], sentiment: 'neutral', vibeScore: 70 },
      '♠️': { codepoint: 'U+2660', name: 'Spade Suit', category: 'cards', keywords: ['spade', 'card', 'suit'], sentiment: 'neutral', vibeScore: 65 },
      '♥️': { codepoint: 'U+2665', name: 'Heart Suit', category: 'cards', keywords: ['heart', 'card', 'suit'], sentiment: 'positive', vibeScore: 80 },
      '♦️': { codepoint: 'U+2666', name: 'Diamond Suit', category: 'cards', keywords: ['diamond', 'card', 'suit'], sentiment: 'neutral', vibeScore: 70 },
      '♣️': { codepoint: 'U+2663', name: 'Club Suit', category: 'cards', keywords: ['club', 'card', 'suit'], sentiment: 'neutral', vibeScore: 65 },

      // Gen Z Slang Emojis
      '😭': { codepoint: 'U+1F62D', name: 'Loudly Crying Face', category: 'emotion', keywords: ['crying', 'sad', 'lol'], sentiment: 'negative', vibeScore: 55 },
      '😂': { codepoint: 'U+1F602', name: 'Face with Tears of Joy', category: 'emotion', keywords: ['laughing', 'lol', 'funny'], sentiment: 'positive', vibeScore: 88 },
      '💅': { codepoint: 'U+1F485', name: 'Nail Polish', category: 'emotion', keywords: ['nails', 'slay', 'confidence'], sentiment: 'positive', vibeScore: 82 },
      '👀': { codepoint: 'U+1F440', name: 'Eyes', category: 'emotion', keywords: ['eyes', 'look', 'watching'], sentiment: 'neutral', vibeScore: 72 },
      '🤔': { codepoint: 'U+1F914', name: 'Thinking Face', category: 'emotion', keywords: ['thinking', 'hmm', 'wondering'], sentiment: 'neutral', vibeScore: 70 },
      '😎': { codepoint: 'U+1F60E', name: 'Smiling Face with Sunglasses', category: 'emotion', keywords: ['cool', 'sunglasses', 'confident'], sentiment: 'positive', vibeScore: 85 },
      '🙄': { codepoint: 'U+1F644', name: 'Face with Rolling Eyes', category: 'emotion', keywords: ['eyeroll', 'annoyed', 'whatever'], sentiment: 'negative', vibeScore: 45 },
      '💪': { codepoint: 'U+1F4AA', name: 'Flexed Biceps', category: 'emotion', keywords: ['strong', 'muscle', 'power'], sentiment: 'positive', vibeScore: 86 },
      '🙌': { codepoint: 'U+1F64C', name: 'Raising Hands', category: 'emotion', keywords: ['celebrate', 'praise', 'yay'], sentiment: 'positive', vibeScore: 89 },

      // Food Emojis
      '🍕': { codepoint: 'U+1F355', name: 'Pizza', category: 'food', keywords: ['pizza', 'food', 'italian'], sentiment: 'positive', vibeScore: 84 },
      '🍔': { codepoint: 'U+1F354', name: 'Hamburger', category: 'food', keywords: ['burger', 'food', 'fast'], sentiment: 'positive', vibeScore: 82 },
      '🌮': { codepoint: 'U+1F32E', name: 'Taco', category: 'food', keywords: ['taco', 'mexican', 'food'], sentiment: 'positive', vibeScore: 83 },
      '🍜': { codepoint: 'U+1F35C', name: 'Steaming Bowl', category: 'food', keywords: ['noodles', 'ramen', 'soup'], sentiment: 'positive', vibeScore: 81 },
      '🍣': { codepoint: 'U+1F363', name: 'Sushi', category: 'food', keywords: ['sushi', 'japanese', 'fish'], sentiment: 'positive', vibeScore: 80 }
    };
  }

  /**
   * Build cringe scores
   * (Can be overridden by cringeproof.com API)
   * @private
   */
  _buildCringeScores() {
    return {
      // Maximum cringe
      '🤡': 95, // Clown
      '💩': 85, // Poop
      '🙄': 80, // Eye roll

      // Medium cringe
      '😭': 60, // Crying (overused)
      '💀': 55, // Skull (ironic)

      // Low cringe (based)
      '🎴': 10, // Hanafuda (cultured)
      '🌸': 15, // Cherry blossom
      '🔥': 20, // Fire (always based)
      '💯': 18, // 100

      // Neutral
      '😂': 50, // Tears of joy
      '🤔': 48 // Thinking
    };
  }

  /**
   * Get themed deck
   */
  getThemedDeck(theme, ageGroup = 'teen', count = 40) {
    let emojis = [];

    switch (theme) {
      case 'hanafuda':
        emojis = this.getByCategory('hanafuda').concat(this.getByCategory('nature'));
        break;

      case 'chaos':
        emojis = this.getByCategory('chaos');
        break;

      case 'wholesome':
        emojis = this.getByCategory('wholesome');
        break;

      case 'cards':
        emojis = this.getByCategory('cards');
        break;

      case 'meme':
        emojis = this.getByCategory('chaos').concat(this.getByCategory('emotion'));
        break;

      case 'food':
        emojis = this.getByCategory('food');
        break;

      default:
        // Random mix
        emojis = Object.entries(this.emojiDatabase).map(([emoji, data]) => ({ emoji, ...data }));
    }

    // Shuffle and limit
    emojis = this._shuffle(emojis).slice(0, count);

    return emojis.map(e => ({
      type: 'emoji',
      emoji: e.emoji,
      text: e.emoji,
      name: e.name,
      category: e.category,
      sentiment: e.sentiment,
      vibeScore: e.vibeScore,
      cringeScore: this.cringeScores[e.emoji] || 50,
      metadata: {
        keywords: e.keywords,
        codepoint: e.codepoint
      }
    }));
  }

  /**
   * Shuffle array
   * @private
   */
  _shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get stats
   */
  getStats() {
    const categories = {};
    const sentiments = {};

    Object.values(this.emojiDatabase).forEach(data => {
      categories[data.category] = (categories[data.category] || 0) + 1;
      sentiments[data.sentiment] = (sentiments[data.sentiment] || 0) + 1;
    });

    return {
      totalEmojis: Object.keys(this.emojiDatabase).length,
      categories,
      sentiments,
      avgVibeScore: Object.values(this.emojiDatabase).reduce((sum, d) => sum + d.vibeScore, 0) / Object.keys(this.emojiDatabase).length
    };
  }
}

module.exports = EmojiMetadataParser;
