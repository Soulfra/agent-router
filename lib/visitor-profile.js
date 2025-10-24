/**
 * Visitor Profiling Engine
 *
 * Automatically builds "resumes" of visitor interests based on behavior
 * Privacy-first: All data stored locally, syncs only when user authorizes
 *
 * Tracks:
 * - Pages visited
 * - Time on page
 * - What they clicked
 * - What they built/tried
 * - Questions they asked
 *
 * Builds:
 * - Interest profile (e.g., "receipt parsing", "email automation")
 * - Skill level (beginner/advanced)
 * - Project ideas (what they're trying to build)
 * - Tech stack (browser, OS, tools)
 *
 * @license AGPLv3
 */

class VisitorProfile {
  constructor(fingerprintId) {
    this.fingerprintId = fingerprintId;
    this.profile = this.loadProfile();
    this.sessionStart = Date.now();
    this.currentPage = window.location.pathname;

    // Start tracking
    this.initTracking();
  }

  /**
   * Load profile from localStorage
   */
  loadProfile() {
    const key = `profile_${this.fingerprintId}`;
    const stored = localStorage.getItem(key);

    if (stored) {
      return JSON.parse(stored);
    }

    // Create new profile
    return {
      id: this.fingerprintId,
      created: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      visits: 0,
      totalTime: 0, // seconds
      pages: [],
      clicks: [],
      interests: {},
      skillLevel: 'beginner',
      projectIdeas: [],
      techStack: {
        browser: navigator.userAgent,
        os: navigator.platform,
        screen: `${screen.width}x${screen.height}`,
        language: navigator.language
      },
      behavior: {
        searchQueries: [],
        formsSubmitted: [],
        downloadsClicked: [],
        featuresExplored: []
      }
    };
  }

  /**
   * Save profile to localStorage
   */
  saveProfile() {
    const key = `profile_${this.fingerprintId}`;
    localStorage.setItem(key, JSON.stringify(this.profile));
    console.log('[VisitorProfile] Profile saved:', this.fingerprintId);
  }

  /**
   * Initialize tracking
   */
  initTracking() {
    console.log('[VisitorProfile] Tracking initialized for:', this.fingerprintId);

    // Track page visit
    this.trackPageVisit();

    // Track clicks
    document.addEventListener('click', (e) => this.trackClick(e));

    // Track page exit
    window.addEventListener('beforeunload', () => this.trackPageExit());

    // Track form submissions
    document.addEventListener('submit', (e) => this.trackFormSubmit(e));

    // Track scroll depth
    this.trackScrollDepth();
  }

  /**
   * Track page visit
   */
  trackPageVisit() {
    this.profile.visits++;
    this.profile.lastSeen = new Date().toISOString();

    const page = {
      url: window.location.href,
      pathname: window.location.pathname,
      title: document.title,
      timestamp: new Date().toISOString(),
      timeOnPage: 0
    };

    this.profile.pages.push(page);

    // Extract interests from page
    this.extractInterestsFromPage(page);

    console.log('[VisitorProfile] Page visit tracked:', page.pathname);
  }

  /**
   * Track page exit
   */
  trackPageExit() {
    const timeOnPage = (Date.now() - this.sessionStart) / 1000; // seconds
    this.profile.totalTime += timeOnPage;

    // Update last page's time
    if (this.profile.pages.length > 0) {
      this.profile.pages[this.profile.pages.length - 1].timeOnPage = timeOnPage;
    }

    this.saveProfile();

    console.log('[VisitorProfile] Page exit tracked:', Math.round(timeOnPage), 'seconds');
  }

  /**
   * Track click
   */
  trackClick(event) {
    const element = event.target;
    const click = {
      element: element.tagName,
      text: element.textContent?.substring(0, 100),
      href: element.href || null,
      className: element.className,
      timestamp: new Date().toISOString()
    };

    this.profile.clicks.push(click);

    // Extract interest from click
    this.extractInterestFromClick(click);

    // Check for feature exploration
    this.checkFeatureExploration(click);
  }

  /**
   * Track form submission
   */
  trackFormSubmit(event) {
    const form = event.target;
    const formData = new FormData(form);
    const data = {};

    // Extract NON-sensitive form data only
    for (const [key, value] of formData.entries()) {
      if (!this.isSensitiveField(key)) {
        data[key] = typeof value === 'string' ? value.substring(0, 100) : 'file';
      }
    }

    const submission = {
      formId: form.id || 'unknown',
      action: form.action,
      data: data,
      timestamp: new Date().toISOString()
    };

    this.profile.behavior.formsSubmitted.push(submission);

    // Extract project idea from form
    if (data.use_case || data.project) {
      this.profile.projectIdeas.push({
        idea: data.use_case || data.project,
        timestamp: new Date().toISOString()
      });
    }

    console.log('[VisitorProfile] Form submitted:', submission.formId);
  }

  /**
   * Check if field is sensitive (don't track)
   */
  isSensitiveField(fieldName) {
    const sensitive = ['password', 'email', 'phone', 'ssn', 'credit', 'card', 'cvv', 'api_key', 'token'];
    return sensitive.some(s => fieldName.toLowerCase().includes(s));
  }

  /**
   * Extract interests from page
   */
  extractInterestsFromPage(page) {
    const keywords = {
      'receipt-parsing': ['receipt', 'ocr', 'expense', 'categorize'],
      'email-automation': ['email', 'send', 'relay', 'newsletter'],
      'payment-processing': ['payment', 'pos', 'stripe', 'charge', 'terminal'],
      'privacy-tools': ['privacy', 'encryption', 'secure', 'obfuscate'],
      'developer-tools': ['sdk', 'api', 'code', 'integration'],
      'mobile-development': ['mobile', 'ios', 'android', 'pwa'],
      'automation': ['automation', 'workflow', 'ragebait', 'meme']
    };

    const pageText = (page.pathname + page.title).toLowerCase();

    for (const [interest, words] of Object.entries(keywords)) {
      if (words.some(word => pageText.includes(word))) {
        this.profile.interests[interest] = (this.profile.interests[interest] || 0) + 1;
      }
    }
  }

  /**
   * Extract interest from click
   */
  extractInterestFromClick(click) {
    const text = (click.text || '').toLowerCase();
    const href = (click.href || '').toLowerCase();

    const keywords = {
      'receipt-parsing': ['receipt', 'parse', 'ocr'],
      'email-automation': ['email', 'send'],
      'payment-processing': ['payment', 'pos', 'charge'],
      'privacy-tools': ['privacy', 'dashboard'],
      'developer-tools': ['demo', 'sdk', 'docs', 'api']
    };

    for (const [interest, words] of Object.entries(keywords)) {
      if (words.some(word => text.includes(word) || href.includes(word))) {
        this.profile.interests[interest] = (this.profile.interests[interest] || 0) + 1;
      }
    }
  }

  /**
   * Check for feature exploration
   */
  checkFeatureExploration(click) {
    const features = [
      { name: 'Receipt Parser', keywords: ['receipt', 'parse'] },
      { name: 'Email Relay', keywords: ['email', 'send'] },
      { name: 'POS Terminal', keywords: ['pos', 'payment'] },
      { name: 'Privacy Dashboard', keywords: ['privacy'] },
      { name: 'SDK Demo', keywords: ['demo', 'sdk'] }
    ];

    const text = (click.text || '').toLowerCase();

    for (const feature of features) {
      if (feature.keywords.some(k => text.includes(k))) {
        if (!this.profile.behavior.featuresExplored.includes(feature.name)) {
          this.profile.behavior.featuresExplored.push(feature.name);
          console.log('[VisitorProfile] Feature explored:', feature.name);
        }
      }
    }
  }

  /**
   * Track scroll depth
   */
  trackScrollDepth() {
    let maxScroll = 0;

    window.addEventListener('scroll', () => {
      const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;

      if (scrollPercentage > maxScroll) {
        maxScroll = scrollPercentage;
      }
    });

    window.addEventListener('beforeunload', () => {
      const currentPage = this.profile.pages[this.profile.pages.length - 1];
      if (currentPage) {
        currentPage.scrollDepth = Math.round(maxScroll);
      }
    });
  }

  /**
   * Determine skill level from behavior
   */
  determineSkillLevel() {
    const indicators = {
      beginner: 0,
      intermediate: 0,
      advanced: 0
    };

    // Time spent (advanced users spend less time)
    const avgTimePerPage = this.profile.totalTime / this.profile.visits;
    if (avgTimePerPage < 30) indicators.advanced += 2;
    else if (avgTimePerPage < 120) indicators.intermediate += 1;
    else indicators.beginner += 1;

    // Features explored
    const featuresExplored = this.profile.behavior.featuresExplored.length;
    if (featuresExplored > 5) indicators.advanced += 2;
    else if (featuresExplored > 2) indicators.intermediate += 1;

    // Direct navigation vs exploration
    const directNavigation = this.profile.pages.filter(p => p.scrollDepth < 20).length;
    if (directNavigation > this.profile.visits * 0.5) indicators.advanced += 1;

    // Determine level
    const max = Math.max(indicators.beginner, indicators.intermediate, indicators.advanced);
    if (indicators.advanced === max) return 'advanced';
    if (indicators.intermediate === max) return 'intermediate';
    return 'beginner';
  }

  /**
   * Build resume/summary of visitor
   */
  buildResume() {
    // Determine skill level
    this.profile.skillLevel = this.determineSkillLevel();

    // Get top interests
    const topInterests = Object.entries(this.profile.interests)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([interest, score]) => ({ interest, score }));

    return {
      id: this.fingerprintId,
      summary: {
        visits: this.profile.visits,
        totalTime: Math.round(this.profile.totalTime),
        avgTimePerPage: Math.round(this.profile.totalTime / this.profile.visits),
        lastSeen: this.profile.lastSeen,
        created: this.profile.created
      },
      interests: topInterests,
      skillLevel: this.profile.skillLevel,
      projectIdeas: this.profile.projectIdeas,
      featuresExplored: this.profile.behavior.featuresExplored,
      techStack: this.profile.techStack,
      engagement: {
        clicksPerVisit: this.profile.clicks.length / this.profile.visits,
        formsSubmitted: this.profile.behavior.formsSubmitted.length,
        downloadsClicked: this.profile.behavior.downloadsClicked.length
      }
    };
  }

  /**
   * Get profile data
   */
  getProfile() {
    return this.profile;
  }

  /**
   * Export profile (for sync/backup)
   */
  exportProfile() {
    return JSON.stringify(this.profile, null, 2);
  }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VisitorProfile;
}

// Export for browser
if (typeof window !== 'undefined') {
  window.VisitorProfile = VisitorProfile;
}
