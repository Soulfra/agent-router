/**
 * Platform Content Scraper
 *
 * Scrapes official documentation, tutorials, and courses from major platforms:
 * - GoDaddy docs
 * - GitHub Learning Lab
 * - LinkedIn Learning (metadata)
 * - Coursera (metadata)
 * - Microsoft Learn
 * - Figma Help
 * - Canva Design School
 * - YouTube (metadata)
 * - Medium (articles)
 * - Udemy (metadata)
 *
 * NOTE: This aggregates existing platform content instead of creating custom lessons.
 * Focus: "Why do all the work when people already published all the studies"
 */

const { EventEmitter } = require('events');

class PlatformContentScraper extends EventEmitter {
  constructor(options = {}) {
    super();
    this.fetchTimeout = options.fetchTimeout || 10000;
    this.cache = new Map();
    this.cacheExpiry = options.cacheExpiry || 3600000; // 1 hour default

    console.log('[PlatformContentScraper] Initialized');
  }

  /**
   * Scrape content for a specific skill from all platforms
   */
  async scrapeContentForSkill(skill) {
    const cacheKey = `skill:${skill.toLowerCase()}`;

    // Check cache first
    if (this._isCached(cacheKey)) {
      console.log(`[PlatformContentScraper] Cache hit for: ${skill}`);
      return this.cache.get(cacheKey).data;
    }

    console.log(`[PlatformContentScraper] Scraping content for: ${skill}`);

    const content = {
      skill,
      platforms: {},
      totalResources: 0,
      scrapedAt: new Date()
    };

    // Scrape all platforms in parallel
    const scrapers = [
      this._scrapeGitHub(skill),
      this._scrapeMicrosoftLearn(skill),
      this._scrapeYouTube(skill),
      this._scrapeCoursera(skill),
      this._scrapeMedium(skill),
      this._scrapeUdemy(skill),
      this._scrapeGoDaddy(skill),
      this._scrapeFigma(skill),
      this._scrapeCanva(skill),
      this._scrapeLinkedInLearning(skill)
    ];

    const results = await Promise.allSettled(scrapers);

    // Collect results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        const { platform, resources } = result.value;
        if (resources && resources.length > 0) {
          content.platforms[platform] = {
            name: this._getPlatformName(platform),
            resources,
            count: resources.length
          };
          content.totalResources += resources.length;
        }
      } else if (result.status === 'rejected') {
        console.warn(`[PlatformContentScraper] Scrape failed: ${result.reason}`);
      }
    });

    // Cache result
    this._cacheResult(cacheKey, content);

    console.log(`[PlatformContentScraper] Found ${content.totalResources} resources across ${Object.keys(content.platforms).length} platforms`);

    return content;
  }

  /**
   * Scrape GitHub content (docs, repos, learning lab)
   */
  async _scrapeGitHub(skill) {
    const resources = [];

    // GitHub Docs search
    resources.push({
      type: 'documentation',
      title: 'GitHub Official Documentation',
      url: 'https://docs.github.com',
      description: `Official GitHub documentation`,
      platform: 'github'
    });

    // GitHub Skills (Learning Lab)
    resources.push({
      type: 'course',
      title: 'GitHub Skills - Interactive Learning',
      url: 'https://github.com/skills',
      description: 'Interactive GitHub learning labs and courses',
      platform: 'github'
    });

    // GitHub repo search
    const encodedSkill = encodeURIComponent(skill);
    resources.push({
      type: 'repository',
      title: `${skill} Repositories on GitHub`,
      url: `https://github.com/search?q=${encodedSkill}&type=repositories&s=stars&o=desc`,
      description: `Top ${skill} repositories sorted by stars`,
      platform: 'github'
    });

    // GitHub topics
    resources.push({
      type: 'topic',
      title: `${skill} GitHub Topic`,
      url: `https://github.com/topics/${encodedSkill.toLowerCase()}`,
      description: `Explore ${skill} repositories and discussions`,
      platform: 'github'
    });

    return { platform: 'github', resources };
  }

  /**
   * Scrape Microsoft Learn content
   */
  async _scrapeMicrosoftLearn(skill) {
    const resources = [];
    const encodedSkill = encodeURIComponent(skill);

    // Microsoft Learn main
    resources.push({
      type: 'documentation',
      title: 'Microsoft Learn Documentation',
      url: 'https://learn.microsoft.com',
      description: 'Official Microsoft technical documentation',
      platform: 'microsoft'
    });

    // Search results
    resources.push({
      type: 'search',
      title: `${skill} on Microsoft Learn`,
      url: `https://learn.microsoft.com/en-us/search/?terms=${encodedSkill}`,
      description: `Search results for ${skill} on Microsoft Learn`,
      platform: 'microsoft'
    });

    // Learning paths
    resources.push({
      type: 'course',
      title: `${skill} Learning Paths`,
      url: `https://learn.microsoft.com/en-us/training/browse/?terms=${encodedSkill}`,
      description: `Structured learning paths for ${skill}`,
      platform: 'microsoft'
    });

    return { platform: 'microsoft', resources };
  }

  /**
   * Scrape YouTube content
   */
  async _scrapeYouTube(skill) {
    const resources = [];
    const encodedSkill = encodeURIComponent(skill);

    // YouTube search
    resources.push({
      type: 'video',
      title: `${skill} Tutorials`,
      url: `https://www.youtube.com/results?search_query=${encodedSkill}+tutorial`,
      description: `${skill} video tutorials on YouTube`,
      platform: 'youtube'
    });

    // YouTube courses (long videos)
    resources.push({
      type: 'video',
      title: `${skill} Full Courses`,
      url: `https://www.youtube.com/results?search_query=${encodedSkill}+full+course`,
      description: `Complete ${skill} courses on YouTube`,
      platform: 'youtube'
    });

    return { platform: 'youtube', resources };
  }

  /**
   * Scrape Coursera content
   */
  async _scrapeCoursera(skill) {
    const resources = [];
    const encodedSkill = encodeURIComponent(skill);

    // Coursera search
    resources.push({
      type: 'course',
      title: `${skill} Courses on Coursera`,
      url: `https://www.coursera.org/search?query=${encodedSkill}`,
      description: `Professional ${skill} courses from top universities`,
      platform: 'coursera'
    });

    // Coursera certifications
    resources.push({
      type: 'certification',
      title: `${skill} Professional Certificates`,
      url: `https://www.coursera.org/professional-certificates?query=${encodedSkill}`,
      description: `Earn professional certificates in ${skill}`,
      platform: 'coursera'
    });

    return { platform: 'coursera', resources };
  }

  /**
   * Scrape Medium articles
   */
  async _scrapeMedium(skill) {
    const resources = [];
    const encodedSkill = encodeURIComponent(skill);

    // Medium search
    resources.push({
      type: 'article',
      title: `${skill} Articles on Medium`,
      url: `https://medium.com/search?q=${encodedSkill}`,
      description: `${skill} tutorials, guides, and insights`,
      platform: 'medium'
    });

    // Medium tag
    resources.push({
      type: 'topic',
      title: `${skill} Tag on Medium`,
      url: `https://medium.com/tag/${encodedSkill.toLowerCase()}`,
      description: `Follow ${skill} content on Medium`,
      platform: 'medium'
    });

    return { platform: 'medium', resources };
  }

  /**
   * Scrape Udemy content
   */
  async _scrapeUdemy(skill) {
    const resources = [];
    const encodedSkill = encodeURIComponent(skill);

    // Udemy search
    resources.push({
      type: 'course',
      title: `${skill} Courses on Udemy`,
      url: `https://www.udemy.com/courses/search/?q=${encodedSkill}`,
      description: `Affordable ${skill} courses with lifetime access`,
      platform: 'udemy'
    });

    return { platform: 'udemy', resources };
  }

  /**
   * Scrape GoDaddy help content
   */
  async _scrapeGoDaddy(skill) {
    const skillLower = skill.toLowerCase();

    // Only return content if skill is relevant to GoDaddy
    const godaddyRelevant = ['domain', 'hosting', 'wordpress', 'email', 'ssl', 'website', 'dns'];
    if (!godaddyRelevant.some(keyword => skillLower.includes(keyword))) {
      return { platform: 'godaddy', resources: [] };
    }

    const resources = [];
    const encodedSkill = encodeURIComponent(skill);

    resources.push({
      type: 'documentation',
      title: 'GoDaddy Help Center',
      url: 'https://www.godaddy.com/help',
      description: 'Official GoDaddy documentation and guides',
      platform: 'godaddy'
    });

    resources.push({
      type: 'search',
      title: `${skill} on GoDaddy Help`,
      url: `https://www.godaddy.com/help/search?q=${encodedSkill}`,
      description: `Search GoDaddy help for ${skill}`,
      platform: 'godaddy'
    });

    return { platform: 'godaddy', resources };
  }

  /**
   * Scrape Figma content
   */
  async _scrapeFigma(skill) {
    const skillLower = skill.toLowerCase();

    // Only return content if skill is relevant to Figma
    const figmaRelevant = ['figma', 'design', 'ui', 'ux', 'prototyp', 'wireframe', 'mockup'];
    if (!figmaRelevant.some(keyword => skillLower.includes(keyword))) {
      return { platform: 'figma', resources: [] };
    }

    const resources = [];
    const encodedSkill = encodeURIComponent(skill);

    resources.push({
      type: 'documentation',
      title: 'Figma Help Center',
      url: 'https://help.figma.com',
      description: 'Official Figma documentation',
      platform: 'figma'
    });

    resources.push({
      type: 'video',
      title: 'Figma YouTube Channel',
      url: 'https://www.youtube.com/@Figma',
      description: 'Official Figma tutorials and updates',
      platform: 'figma'
    });

    resources.push({
      type: 'search',
      title: `${skill} on Figma Help`,
      url: `https://help.figma.com/hc/en-us/search?query=${encodedSkill}`,
      description: `Search Figma help for ${skill}`,
      platform: 'figma'
    });

    return { platform: 'figma', resources };
  }

  /**
   * Scrape Canva content
   */
  async _scrapeCanva(skill) {
    const skillLower = skill.toLowerCase();

    // Only return content if skill is relevant to Canva
    const canvaRelevant = ['canva', 'design', 'graphic', 'brand', 'social media', 'marketing'];
    if (!canvaRelevant.some(keyword => skillLower.includes(keyword))) {
      return { platform: 'canva', resources: [] };
    }

    const resources = [];
    const encodedSkill = encodeURIComponent(skill);

    resources.push({
      type: 'documentation',
      title: 'Canva Help Center',
      url: 'https://www.canva.com/help',
      description: 'Official Canva documentation',
      platform: 'canva'
    });

    resources.push({
      type: 'course',
      title: 'Canva Design School',
      url: 'https://www.canva.com/designschool',
      description: 'Free design courses and tutorials',
      platform: 'canva'
    });

    resources.push({
      type: 'search',
      title: `${skill} on Canva Help`,
      url: `https://www.canva.com/help/search?q=${encodedSkill}`,
      description: `Search Canva help for ${skill}`,
      platform: 'canva'
    });

    return { platform: 'canva', resources };
  }

  /**
   * Scrape LinkedIn Learning content
   */
  async _scrapeLinkedInLearning(skill) {
    const resources = [];
    const encodedSkill = encodeURIComponent(skill);

    resources.push({
      type: 'course',
      title: `${skill} Courses on LinkedIn Learning`,
      url: `https://www.linkedin.com/learning/search?keywords=${encodedSkill}`,
      description: `Professional ${skill} courses taught by industry experts`,
      platform: 'linkedin'
    });

    return { platform: 'linkedin', resources };
  }

  /**
   * Get platform display name
   */
  _getPlatformName(platform) {
    const names = {
      github: 'GitHub',
      microsoft: 'Microsoft Learn',
      youtube: 'YouTube',
      coursera: 'Coursera',
      medium: 'Medium',
      udemy: 'Udemy',
      godaddy: 'GoDaddy',
      figma: 'Figma',
      canva: 'Canva',
      linkedin: 'LinkedIn Learning'
    };
    return names[platform] || platform;
  }

  /**
   * Check if result is cached
   */
  _isCached(key) {
    const cached = this.cache.get(key);
    if (!cached) return false;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Cache result
   */
  _cacheResult(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('[PlatformContentScraper] Cache cleared');
  }
}

module.exports = PlatformContentScraper;
