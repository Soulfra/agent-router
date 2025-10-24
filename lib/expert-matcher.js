/**
 * Expert Matcher System
 *
 * Finds skilled developers/experts for job requirements using:
 * - GitHub API (search users by skills, language, location)
 * - LinkedIn API (if available)
 * - Portfolio analysis
 * - Contribution history
 *
 * Purpose: "Interview people about concepts and ideas and get them contracting jobs or careers"
 *
 * Workflow:
 * 1. Parse job requirements
 * 2. Search GitHub for developers with matching skills
 * 3. Analyze their portfolios and contributions
 * 4. Rank by expertise level
 * 5. Provide interview scheduling links
 */

const { EventEmitter } = require('events');

class ExpertMatcher extends EventEmitter {
  constructor(options = {}) {
    super();

    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.cache = new Map();
    this.cacheExpiry = options.cacheExpiry || 3600000; // 1 hour

    console.log('[ExpertMatcher] Initialized');
  }

  /**
   * Find experts for a job posting
   */
  async findExpertsForJob(job) {
    console.log(`[ExpertMatcher] Finding experts for job: ${job.title}`);

    // Extract skills from job
    const skills = this._extractSkillsFromJob(job);
    console.log(`[ExpertMatcher] Extracted skills: ${skills.join(', ')}`);

    // Search for experts
    const experts = await this._searchGitHubExperts(skills, {
      location: job.location,
      limit: 20
    });

    // Rank experts by relevance
    const rankedExperts = this._rankExperts(experts, skills);

    console.log(`[ExpertMatcher] Found ${rankedExperts.length} potential experts`);

    return {
      job: {
        id: job.job_id,
        title: job.title,
        company: job.company_name
      },
      skills,
      experts: rankedExperts.slice(0, 10), // Top 10
      totalFound: rankedExperts.length
    };
  }

  /**
   * Extract skills from job posting
   */
  _extractSkillsFromJob(job) {
    const skillKeywords = new Set();

    // Common tech skills
    const techSkills = [
      'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'ruby', 'go', 'rust', 'php',
      'react', 'vue', 'angular', 'node', 'nodejs', 'express', 'django', 'flask', 'rails',
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform',
      'sql', 'postgresql', 'mysql', 'mongodb', 'redis',
      'git', 'ci/cd', 'devops', 'agile', 'scrum',
      'machine learning', 'ai', 'data science', 'deep learning',
      'figma', 'design', 'ui', 'ux'
    ];

    const text = `${job.title} ${job.description || ''} ${job.requirements || ''} ${job.preferred_skills || ''}`.toLowerCase();

    // Find matching tech skills
    techSkills.forEach(skill => {
      if (text.includes(skill)) {
        skillKeywords.add(skill);
      }
    });

    // Extract from preferred_skills JSON if available
    if (job.preferred_skills && typeof job.preferred_skills === 'object') {
      if (Array.isArray(job.preferred_skills)) {
        job.preferred_skills.forEach(skill => {
          if (skill && typeof skill === 'string') {
            skillKeywords.add(skill.toLowerCase());
          }
        });
      }
    }

    return Array.from(skillKeywords);
  }

  /**
   * Search GitHub for experts with matching skills
   */
  async _searchGitHubExperts(skills, options = {}) {
    const { location, limit = 20 } = options;
    const experts = [];

    // Search GitHub users for each skill
    for (const skill of skills.slice(0, 3)) { // Limit to top 3 skills
      const cacheKey = `github:${skill}:${location || 'any'}`;

      // Check cache
      if (this._isCached(cacheKey)) {
        const cached = this.cache.get(cacheKey).data;
        experts.push(...cached);
        continue;
      }

      try {
        const users = await this._searchGitHubUsers(skill, location, limit);
        experts.push(...users);

        // Cache result
        this._cacheResult(cacheKey, users);

        // Rate limit: wait 1 second between searches
        await this._sleep(1000);
      } catch (error) {
        console.warn(`[ExpertMatcher] GitHub search failed for ${skill}: ${error.message}`);
      }
    }

    // Deduplicate by username
    const uniqueExperts = this._deduplicateExperts(experts);

    return uniqueExperts;
  }

  /**
   * Search GitHub users API
   */
  async _searchGitHubUsers(skill, location, limit) {
    // Build search query
    let query = `language:${skill} type:user`;
    if (location) {
      query += ` location:"${location}"`;
    }

    const url = `https://api.github.com/search/users?q=${encodeURIComponent(query)}&sort=followers&order=desc&per_page=${limit}`;

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'CALOS-Expert-Matcher'
    };

    if (this.githubToken) {
      headers['Authorization'] = `token ${this.githubToken}`;
    }

    // Note: In production, use fetch or axios
    // For now, return mock data structure
    console.log(`[ExpertMatcher] Would search GitHub: ${url}`);

    // Mock response structure - in production, make actual API call
    return this._generateMockExperts(skill, location, limit);
  }

  /**
   * Generate mock experts for testing (replace with real API calls)
   */
  _generateMockExperts(skill, location, limit) {
    const mockUsers = [];

    for (let i = 0; i < Math.min(limit, 10); i++) {
      mockUsers.push({
        username: `${skill}_expert_${i + 1}`,
        name: `Expert ${i + 1}`,
        avatarUrl: `https://avatars.githubusercontent.com/u/${i}`,
        profileUrl: `https://github.com/${skill}_expert_${i + 1}`,
        bio: `${skill} developer with ${Math.floor(Math.random() * 10) + 1} years experience`,
        location: location || 'Remote',
        followers: Math.floor(Math.random() * 1000) + 100,
        publicRepos: Math.floor(Math.random() * 200) + 50,
        primarySkill: skill,
        skills: [skill, 'git', 'open-source'],
        company: i % 3 === 0 ? `Tech Company ${i}` : null,
        blog: i % 2 === 0 ? `https://${skill}expert${i}.dev` : null,
        hireable: i % 2 === 0,
        expertiseLevel: this._calculateExpertiseLevel(Math.floor(Math.random() * 1000) + 100, Math.floor(Math.random() * 200) + 50)
      });
    }

    return mockUsers;
  }

  /**
   * Rank experts by relevance to job requirements
   */
  _rankExperts(experts, requiredSkills) {
    return experts.map(expert => {
      let score = 0;

      // Score based on followers (max 30 points)
      score += Math.min(expert.followers / 100, 30);

      // Score based on public repos (max 20 points)
      score += Math.min(expert.publicRepos / 10, 20);

      // Score based on matching skills (max 50 points)
      const matchingSkills = requiredSkills.filter(skill =>
        expert.skills.some(expertSkill =>
          expertSkill.toLowerCase().includes(skill.toLowerCase())
        )
      );
      score += matchingSkills.length * 10;

      // Bonus for hireable (10 points)
      if (expert.hireable) score += 10;

      // Bonus for having blog/portfolio (5 points)
      if (expert.blog) score += 5;

      // Bonus for company experience (5 points)
      if (expert.company) score += 5;

      return {
        ...expert,
        matchScore: Math.round(score),
        matchingSkills,
        relevance: score > 70 ? 'high' : score > 40 ? 'medium' : 'low'
      };
    }).sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Calculate expertise level
   */
  _calculateExpertiseLevel(followers, repos) {
    const score = followers + (repos * 2);

    if (score > 500) return 'expert';
    if (score > 200) return 'advanced';
    if (score > 100) return 'intermediate';
    return 'beginner';
  }

  /**
   * Deduplicate experts by username
   */
  _deduplicateExperts(experts) {
    const seen = new Set();
    const unique = [];

    for (const expert of experts) {
      if (!seen.has(expert.username)) {
        seen.add(expert.username);
        unique.push(expert);
      }
    }

    return unique;
  }

  /**
   * Get expert interview suggestions
   * Returns list of experts to interview for a specific skill/concept
   */
  async getExpertsForInterview(skillOrConcept) {
    console.log(`[ExpertMatcher] Finding interview candidates for: ${skillOrConcept}`);

    const experts = await this._searchGitHubExperts([skillOrConcept], { limit: 10 });

    return {
      skill: skillOrConcept,
      interviewCandidates: experts.map(expert => ({
        ...expert,
        interviewTopics: this._suggestInterviewTopics(skillOrConcept),
        estimatedRate: this._estimateInterviewRate(expert.expertiseLevel),
        availability: 'Check profile' // In production, integrate with calendar API
      }))
    };
  }

  /**
   * Suggest interview topics for a skill
   */
  _suggestInterviewTopics(skill) {
    const genericTopics = [
      `Best practices in ${skill}`,
      `Common pitfalls and how to avoid them`,
      `Real-world ${skill} projects and case studies`,
      `Career advice for ${skill} developers`,
      `Future trends in ${skill}`
    ];

    return genericTopics;
  }

  /**
   * Estimate interview rate based on expertise level
   */
  _estimateInterviewRate(expertiseLevel) {
    const rates = {
      expert: { min: 150, max: 300, currency: 'USD' },
      advanced: { min: 100, max: 200, currency: 'USD' },
      intermediate: { min: 50, max: 100, currency: 'USD' },
      beginner: { min: 25, max: 50, currency: 'USD' }
    };

    return rates[expertiseLevel] || rates.intermediate;
  }

  /**
   * Format expert for job recommendation email
   */
  formatExpertForEmail(expert, job) {
    return {
      subject: `${expert.name} - ${job.title} Match`,
      body: `
Hi ${expert.name},

We found your GitHub profile and think you'd be a great fit for this opportunity:

**${job.title}** at ${job.company}
${job.location}

Your profile shows expertise in: ${expert.matchingSkills.join(', ')}

Match Score: ${expert.matchScore}/100
Relevance: ${expert.relevance}

Would you be interested in:
1. Applying for this position
2. A paid interview about ${expert.primarySkill} ($${expert.estimatedRate?.min}-$${expert.estimatedRate?.max}/hour)
3. Contract work opportunities

View job details: [JOB_URL]
Schedule interview: [CALENDAR_URL]

Best regards,
CALOS Talent Team
      `.trim()
    };
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
   * Sleep helper
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('[ExpertMatcher] Cache cleared');
  }
}

module.exports = ExpertMatcher;
