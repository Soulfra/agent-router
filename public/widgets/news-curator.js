/**
 * News Curator Widget
 *
 * Displays curated news feed in unified-feed.html
 * Integrates with Content Curation API
 */

class NewsCuratorWidget {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container ${containerId} not found`);
      return;
    }

    this.articles = [];
    this.loading = false;
    this.configured = false;

    this.init();
  }

  async init() {
    await this.checkConfiguration();
    this.render();
    await this.loadArticles();

    // Auto-refresh every 5 minutes
    setInterval(() => this.loadArticles(), 5 * 60 * 1000);
  }

  async checkConfiguration() {
    try {
      const response = await fetch('/api/curation/config');
      if (response.ok) {
        const data = await response.json();
        this.configured = data.status === 'success' && data.config;
      }
    } catch (error) {
      console.log('[NewsCurator] No configuration found - user needs to setup');
    }
  }

  async loadArticles() {
    if (!this.configured) return;

    this.loading = true;
    this.render();

    try {
      const response = await fetch('/api/curation/feed?limit=10');
      const data = await response.json();

      if (data.status === 'success') {
        this.articles = data.items || [];
        this.render();
      }
    } catch (error) {
      console.error('[NewsCurator] Error loading articles:', error);
    } finally {
      this.loading = false;
    }
  }

  render() {
    if (!this.configured) {
      this.container.innerHTML = `
        <div class="widget news-curator-widget" style="background: #1a1a1a; border-radius: 12px; padding: 1.5rem; color: #e0e0e0;">
          <div class="widget-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="margin: 0; font-size: 1.2rem;">📰 News Curator</h3>
          </div>
          <div style="text-align: center; padding: 2rem;">
            <p style="color: #888; margin-bottom: 1rem;">Set up your personalized news feed</p>
            <a href="/content-curator.html" style="display: inline-block; background: #0080ff; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
              Configure Now →
            </a>
          </div>
        </div>
      `;
      return;
    }

    const articlesHTML = this.articles.length > 0
      ? this.articles.map(article => this.renderArticle(article)).join('')
      : '<div style="text-align: center; padding: 2rem; color: #888;">No articles yet. Check back soon!</div>';

    this.container.innerHTML = `
      <div class="widget news-curator-widget" style="background: #1a1a1a; border-radius: 12px; padding: 1.5rem; color: #e0e0e0;">
        <div class="widget-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0; font-size: 1.2rem;">📰 Curated News</h3>
          <div style="display: flex; gap: 0.5rem;">
            <button onclick="newsCurator.loadArticles()" style="background: #252525; border: 1px solid #333; color: #e0e0e0; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">
              🔄 Refresh
            </button>
            <a href="/content-curator.html" style="background: #252525; border: 1px solid #333; color: #e0e0e0; padding: 0.5rem 1rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem;">
              ⚙️ Settings
            </a>
          </div>
        </div>

        ${this.loading ? '<div style="text-align: center; padding: 2rem; color: #888;">Loading...</div>' : ''}

        <div class="articles-list" style="max-height: 600px; overflow-y: auto;">
          ${articlesHTML}
        </div>
      </div>
    `;
  }

  renderArticle(article) {
    const timeAgo = this.formatTimeAgo(new Date(article.publishedAt));

    return `
      <div class="article-card" style="background: #252525; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; border-left: 3px solid #0080ff; transition: all 0.2s; cursor: pointer;" onmouseover="this.style.background='#2a2a2a'" onmouseout="this.style.background='#252525'" onclick="window.open('${article.url}', '_blank')">
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.8rem; color: #888;">
          <span>${article.sourceIcon}</span>
          <span>${article.source}</span>
          ${article.author ? `<span>· ${article.author}</span>` : ''}
          <span>· ${timeAgo}</span>
        </div>

        <h4 style="margin: 0 0 0.5rem 0; font-size: 1rem; line-height: 1.4; color: #0080ff;">
          ${article.title}
        </h4>

        ${article.description ? `
          <p style="margin: 0 0 0.75rem 0; font-size: 0.9rem; color: #aaa; line-height: 1.5;">
            ${article.description.slice(0, 150)}${article.description.length > 150 ? '...' : ''}
          </p>
        ` : ''}

        <div style="display: flex; gap: 1rem; font-size: 0.8rem; color: #666;">
          ${article.score > 0 ? `<span>⬆️ ${article.score}</span>` : ''}
          ${article.comments > 0 ? `<span>💬 ${article.comments}</span>` : ''}
          ${article.topics && article.topics.length > 0 ? `
            <span style="margin-left: auto;">
              ${article.topics.slice(0, 3).map(topic => `<span style="background: #333; padding: 0.2rem 0.5rem; border-radius: 3px; margin-left: 0.25rem;">${topic}</span>`).join('')}
            </span>
          ` : ''}
        </div>
      </div>
    `;
  }

  formatTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 172800) return 'Yesterday';
    return `${Math.floor(seconds / 86400)}d ago`;
  }
}

// Make globally available
if (typeof window !== 'undefined') {
  window.NewsCuratorWidget = NewsCuratorWidget;
}
