/**
 * Shared Emoji API Client
 * Used across all brand frontends
 */

class EmojiAPI {
  constructor(baseURL) {
    this.baseURL = baseURL || (
      window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://api.calos.fun'
    );
  }

  async vibeCheck(message, context = {}) {
    const response = await fetch(`${this.baseURL}/api/cringeproof/vibe-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context })
    });
    return response.json();
  }

  async scoreEmoji(emoji, context = {}) {
    const response = await fetch(`${this.baseURL}/api/cringeproof/score-emoji`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji, context })
    });
    return response.json();
  }

  async getThemedDeck(theme, ageGroup = 'teen', count = 40) {
    const response = await fetch(
      `${this.baseURL}/api/cringeproof/themed-deck/${theme}?ageGroup=${ageGroup}&count=${count}`
    );
    return response.json();
  }

  async getStats() {
    const response = await fetch(`${this.baseURL}/api/cringeproof/stats`);
    return response.json();
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmojiAPI;
}
