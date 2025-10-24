/**
 * PR & Hype Generation System
 *
 * Auto-generates press releases, social media content, and sharing links
 * for job postings and company announcements.
 *
 * Features:
 * - Multiple PR templates (announcement, mission, impact, skill-focused)
 * - Social media copy generation (Twitter, LinkedIn, HN)
 * - UTM tracking for analytics
 * - Share link generation
 */

class PRGenerator {
  constructor() {
    this.templates = {
      announcement: this.generateAnnouncement.bind(this),
      mission: this.generateMission.bind(this),
      impact: this.generateImpact.bind(this),
      skillFocus: this.generateSkillFocus.bind(this)
    };
  }

  /**
   * Generate all PR content for a job posting
   */
  generateAll(job, options = {}) {
    const {
      includeTemplates = ['announcement', 'mission', 'impact', 'skillFocus'],
      baseUrl = 'https://calos.ai',
      utm_source = 'hiring',
      utm_medium = 'social'
    } = options;

    const result = {
      job_id: job.job_id,
      job_title: job.title,
      company: job.company,
      generated_at: new Date().toISOString(),
      templates: {},
      social_media: {},
      share_links: {}
    };

    // Generate PR templates
    includeTemplates.forEach(template => {
      if (this.templates[template]) {
        result.templates[template] = this.templates[template](job);
      }
    });

    // Generate social media content
    result.social_media = {
      twitter: this.generateTwitterThread(job),
      linkedin: this.generateLinkedInPost(job),
      hackernews: this.generateHackerNewsPost(job)
    };

    // Generate share links with UTM tracking
    const jobUrl = `${baseUrl}/jobs/${job.job_id}`;
    result.share_links = {
      twitter: this.generateTwitterShareLink(job, jobUrl, utm_source, utm_medium),
      linkedin: this.generateLinkedInShareLink(job, jobUrl, utm_source, utm_medium),
      email: this.generateEmailShareLink(job, jobUrl, utm_source, utm_medium),
      direct: `${jobUrl}?utm_source=${utm_source}&utm_medium=${utm_medium}&utm_campaign=hiring`
    };

    return result;
  }

  /**
   * "We're Hiring!" announcement template
   */
  generateAnnouncement(job) {
    const salary = job.salary_range ? `\n\n**Salary:** ${job.salary_range}` : '';
    const location = job.location ? `\n**Location:** ${job.location}` : '';

    return {
      headline: `${job.company} is Hiring: ${job.title}`,
      subheading: `Join our team and help shape the future`,
      body: `We're excited to announce a new opening on our team!

**Position:** ${job.title}
**Company:** ${job.company}${location}
**Type:** ${job.job_type || 'Full-time'}${salary}

${job.description}

**Key Skills:**
${(job.required_skills || []).slice(0, 5).map(skill => `• ${skill}`).join('\n')}

**Why Join Us:**
• Work on cutting-edge technology
• Collaborate with world-class talent
• Make a real impact on the world
• Competitive compensation and benefits
• Remote-friendly culture

**Ready to Apply?**
Visit our careers page to learn more and submit your application.

---

*${job.company} is committed to building diverse and inclusive teams. We encourage applications from candidates of all backgrounds.*`,
      cta: `Apply Now`,
      tags: ['hiring', 'jobs', 'careers', ...this.extractTopSkills(job.required_skills, 3)]
    };
  }

  /**
   * "Join the Revolution" mission-focused template
   */
  generateMission(job) {
    const missionStatements = {
      'CALOS': 'democratizing AI and making it accessible to everyone',
      'Soulfra': 'building the cryptographic metaverse of tomorrow',
      'default': 'changing the world for the better'
    };

    const mission = missionStatements[job.company] || missionStatements.default;

    return {
      headline: `Help Us ${this.capitalize(mission)}`,
      subheading: `${job.title} - ${job.company}`,
      body: `## The Mission

At ${job.company}, we're not just building products – we're ${mission}.

Every line of code, every design decision, every conversation matters. We're looking for exceptional people who want to make a real difference.

## The Role

**${job.title}**

${job.description}

## What You'll Do

${this.generateResponsibilities(job)}

## What We're Looking For

${this.generateIdealCandidate(job)}

## Why This Matters

The work you do here will directly impact thousands (soon millions) of people. You'll have the autonomy to make decisions, the support to take risks, and the opportunity to see your ideas come to life.

## Ready to Change the World?

We're looking for people who:
• Think differently and challenge the status quo
• Care deeply about their craft
• Want to work with the best and learn from everyone
• Believe technology should serve humanity

If that sounds like you, let's talk.`,
      cta: `Join the Revolution`,
      tags: ['mission-driven', 'impact', job.company.toLowerCase(), ...this.extractTopSkills(job.required_skills, 2)]
    };
  }

  /**
   * "Change the World" impact-focused template
   */
  generateImpact(job) {
    return {
      headline: `Top Talent Wanted: ${job.title}`,
      subheading: `${job.company} - Building the Future`,
      body: `## We're Not Looking for Just Anyone

We're looking for the **top 1%** – people who are:
• Passionate about their craft
• Constantly learning and evolving
• Driven by impact, not just paychecks
• Comfortable with ambiguity and rapid change

## The Opportunity

**${job.title}** at ${job.company}

${job.description}

## The Impact

Your work will:
• Reach users worldwide
• Push the boundaries of what's possible
• Set new standards in the industry
• Inspire the next generation of builders

## The Team

You'll work alongside:
• Engineers from top tech companies (FAANG+)
• Open-source contributors and maintainers
• Designers who've shipped products to millions
• Leaders who've built and scaled successful startups

## The Skills

**Must Have:**
${(job.required_skills || []).map(skill => `• ${skill}`).join('\n')}

**Nice to Have:**
${(job.preferred_skills || []).slice(0, 5).map(skill => `• ${skill}`).join('\n') || '• A growth mindset and passion for learning'}

## The Compensation

We believe in paying top talent what they're worth.${job.salary_range ? `\n\nRange: ${job.salary_range}` : ' Compensation is competitive and includes equity.'}

## Apply Now

Don't wait. The best opportunities go to those who act fast.`,
      cta: `Apply to Change the World`,
      tags: ['top-talent', 'impact', 'innovation', ...this.extractTopSkills(job.required_skills, 2)]
    };
  }

  /**
   * Skill-focused template
   */
  generateSkillFocus(job) {
    const primarySkills = (job.required_skills || []).slice(0, 3);
    const skillsText = primarySkills.join(', ');

    return {
      headline: `${skillsText} Expert Wanted`,
      subheading: `${job.title} at ${job.company}`,
      body: `## Are You a ${skillsText} Expert?

${job.company} is hiring a **${job.title}** who lives and breathes these technologies.

## The Tech Stack

**Core Skills:**
${(job.required_skills || []).map(skill => `• ${skill}`).join('\n')}

**Bonus Points:**
${(job.preferred_skills || []).map(skill => `• ${skill}`).join('\n') || '• Contributions to open-source projects\n• Technical blog or portfolio\n• Conference talks or teaching experience'}

## What You'll Build

${job.description}

## The Learning Opportunity

At ${job.company}, you'll:
• Work with cutting-edge technologies
• Learn from senior engineers and mentors
• Attend conferences and workshops
• Contribute to open-source projects
• Share knowledge through blog posts and talks

## The Environment

${job.location || 'Remote-first'} • ${job.job_type || 'Full-time'} • Fast-paced • Collaborative • Learning-focused

## Apply

If you're passionate about ${primarySkills[0]} and want to level up your skills while building world-class products, we want to hear from you.`,
      cta: `Show Us Your Skills`,
      tags: ['engineering', 'tech-stack', ...this.extractTopSkills(job.required_skills, 5)]
    };
  }

  /**
   * Generate Twitter thread
   */
  generateTwitterThread(job) {
    const skills = (job.required_skills || []).slice(0, 3).join(', ');

    return [
      `🚀 We're hiring! ${job.title} at ${job.company}\n\n${job.description.slice(0, 150)}...`,
      `💡 Key skills: ${skills}\n\n${job.location || 'Remote'} • ${job.job_type || 'Full-time'}${job.salary_range ? ` • ${job.salary_range}` : ''}`,
      `🌟 Why join us?\n• Work with top talent\n• Make real impact\n• Cutting-edge tech\n• Growth opportunities`,
      `Ready to apply? Check out the full job description and apply here: [LINK]`,
      `RT if you know someone perfect for this role! 🔄`
    ];
  }

  /**
   * Generate LinkedIn post
   */
  generateLinkedInPost(job) {
    const skills = (job.required_skills || []).slice(0, 5).join(', ');

    return `🎯 Exciting Opportunity at ${job.company}!

We're looking for an exceptional ${job.title} to join our team.

${job.description}

🔑 Key Requirements:
${(job.required_skills || []).slice(0, 5).map(skill => `• ${skill}`).join('\n')}

📍 Location: ${job.location || 'Remote'}
💼 Type: ${job.job_type || 'Full-time'}${job.salary_range ? `\n💰 Salary: ${job.salary_range}` : ''}

Why ${job.company}?
✓ Work on cutting-edge technology
✓ Collaborate with world-class talent
✓ Make a meaningful impact
✓ Competitive compensation and growth opportunities

Interested or know someone who would be a great fit?

👉 Apply here: [LINK]

#hiring #jobs #${skills.replace(/,/g, ' #')} #tech #careers`;
  }

  /**
   * Generate Hacker News "Who's Hiring" format
   */
  generateHackerNewsPost(job) {
    const skills = (job.required_skills || []).join(', ');

    return `${job.company} | ${job.title} | ${job.location || 'Remote'} | ${job.job_type || 'Full-time'}${job.salary_range ? ` | ${job.salary_range}` : ''}

${job.description}

Tech Stack: ${skills}

${job.preferred_skills && job.preferred_skills.length > 0 ? `Bonus: ${job.preferred_skills.join(', ')}\n\n` : ''}Apply: [LINK]`;
  }

  /**
   * Generate Twitter share link
   */
  generateTwitterShareLink(job, jobUrl, utm_source, utm_medium) {
    const text = `Check out this opportunity: ${job.title} at ${job.company}!`;
    const url = `${jobUrl}?utm_source=${utm_source}&utm_medium=twitter&utm_campaign=hiring`;
    const hashtags = this.extractTopSkills(job.required_skills, 3).join(',');

    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=${hashtags}`;
  }

  /**
   * Generate LinkedIn share link
   */
  generateLinkedInShareLink(job, jobUrl, utm_source, utm_medium) {
    const url = `${jobUrl}?utm_source=${utm_source}&utm_medium=linkedin&utm_campaign=hiring`;

    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  }

  /**
   * Generate email share link
   */
  generateEmailShareLink(job, jobUrl, utm_source, utm_medium) {
    const subject = `Check out this job: ${job.title} at ${job.company}`;
    const body = `I thought you might be interested in this opportunity:\n\n${job.title} at ${job.company}\n${job.location || 'Remote'}\n\n${jobUrl}?utm_source=${utm_source}&utm_medium=email&utm_campaign=hiring`;

    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  extractTopSkills(skills, limit = 3) {
    if (!skills || !Array.isArray(skills)) return [];
    return skills.slice(0, limit).map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  generateResponsibilities(job) {
    if (job.raw_data && job.raw_data.responsibilities) {
      return job.raw_data.responsibilities.map(r => `• ${r}`).join('\n');
    }

    return `• Build and ship features that matter
• Collaborate with cross-functional teams
• Write clean, maintainable code
• Contribute to technical decisions
• Mentor and learn from teammates`;
  }

  generateIdealCandidate(job) {
    const skills = (job.required_skills || []).slice(0, 5);
    const experience = job.raw_data?.experience_years || '3+';

    return `**Technical Skills:**
${skills.map(s => `• ${s}`).join('\n')}

**Experience:**
• ${experience} years in relevant role
• Track record of shipping products
• Strong problem-solving abilities
• Excellent communication skills

**Mindset:**
• Growth-oriented and eager to learn
• Comfortable with ambiguity
• Passionate about building great products
• Team-first attitude`;
  }
}

module.exports = PRGenerator;
