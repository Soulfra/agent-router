/**
 * Resume Parser
 *
 * Extracts text and structured data from resumes in various formats:
 * - PDF (using pdf-parse)
 * - DOCX (using mammoth)
 * - TXT (plain text)
 *
 * Parses resume into structured fields:
 * - Contact info (name, email, phone)
 * - Skills (programming languages, frameworks, tools)
 * - Experience (job titles, companies, dates)
 * - Education (degrees, schools, dates)
 * - Projects/Portfolio links
 */

const mammoth = require('mammoth');
const fs = require('fs').promises;
const path = require('path');

class ResumeParser {
  constructor() {
    // Common skill keywords for tech roles
    this.skillKeywords = [
      // Programming languages
      'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'ruby', 'go', 'rust',
      'php', 'swift', 'kotlin', 'scala', 'r', 'matlab', 'sql',
      // Frontend
      'react', 'vue', 'angular', 'svelte', 'html', 'css', 'sass', 'tailwind',
      'next.js', 'nuxt', 'gatsby',
      // Backend
      'node.js', 'express', 'django', 'flask', 'fastapi', 'spring', 'rails',
      '.net', 'laravel', 'nest.js',
      // Databases
      'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'cassandra',
      'dynamodb', 'firestore',
      // Cloud/DevOps
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins',
      'github actions', 'ci/cd',
      // AI/ML
      'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy', 'opencv',
      'nlp', 'machine learning', 'deep learning', 'llm',
      // Other
      'git', 'rest api', 'graphql', 'websocket', 'microservices', 'agile'
    ];

    this.degreeKeywords = [
      'bachelor', 'master', 'phd', 'doctorate', 'associate', 'diploma',
      'b.s.', 'm.s.', 'b.a.', 'm.a.', 'mba', 'degree'
    ];
  }

  /**
   * Parse resume from file path
   * @param {string} filePath - Path to resume file
   * @returns {Promise<object>} Parsed resume data
   */
  async parseResume(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    let text = '';

    try {
      if (ext === '.pdf') {
        text = await this._parsePDF(filePath);
      } else if (ext === '.docx') {
        text = await this._parseDOCX(filePath);
      } else if (ext === '.txt') {
        text = await this._parseTXT(filePath);
      } else {
        throw new Error(`Unsupported file format: ${ext}`);
      }

      // Parse structured data from text
      const parsed = {
        rawText: text,
        contact: this._extractContact(text),
        skills: this._extractSkills(text),
        experience: this._extractExperience(text),
        education: this._extractEducation(text),
        projects: this._extractProjects(text),
        summary: this._generateSummary(text),
        wordCount: text.split(/\s+/).length,
        parsedAt: new Date()
      };

      return parsed;

    } catch (error) {
      console.error('[ResumeParser] Error parsing resume:', error);
      throw error;
    }
  }

  /**
   * Parse PDF resume
   */
  async _parsePDF(filePath) {
    // Use pdf.js-extract (Node.js native, no browser APIs)
    const { PDFExtract } = require('pdf.js-extract');
    const pdfExtract = new PDFExtract();
    const data = await pdfExtract.extract(filePath, {});

    // Extract text from all pages
    let text = '';
    for (const page of data.pages) {
      for (const item of page.content) {
        if (item.str) {
          text += item.str + ' ';
        }
      }
      text += '\n'; // Add newline between pages
    }

    return text.trim();
  }

  /**
   * Parse DOCX resume
   */
  async _parseDOCX(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  /**
   * Parse TXT resume
   */
  async _parseTXT(filePath) {
    return await fs.readFile(filePath, 'utf-8');
  }

  /**
   * Extract contact information
   */
  _extractContact(text) {
    const contact = {
      email: null,
      phone: null,
      linkedin: null,
      github: null,
      website: null
    };

    // Email
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) contact.email = emailMatch[1];

    // Phone
    const phoneMatch = text.match(/(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/);
    if (phoneMatch) contact.phone = phoneMatch[1];

    // LinkedIn
    const linkedinMatch = text.match(/(linkedin\.com\/in\/[\w-]+)/i);
    if (linkedinMatch) contact.linkedin = `https://${linkedinMatch[1]}`;

    // GitHub
    const githubMatch = text.match(/(github\.com\/[\w-]+)/i);
    if (githubMatch) contact.github = `https://${githubMatch[1]}`;

    // Website
    const websiteMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (websiteMatch && !websiteMatch[1].includes('linkedin') && !websiteMatch[1].includes('github')) {
      contact.website = websiteMatch[1];
    }

    return contact;
  }

  /**
   * Extract skills
   */
  _extractSkills(text) {
    const textLower = text.toLowerCase();
    const foundSkills = [];

    for (const skill of this.skillKeywords) {
      if (textLower.includes(skill.toLowerCase())) {
        foundSkills.push(skill);
      }
    }

    // Remove duplicates and sort
    return [...new Set(foundSkills)].sort();
  }

  /**
   * Extract work experience
   */
  _extractExperience(text) {
    const experiences = [];

    // Look for common job title patterns
    const jobTitlePatterns = [
      /(?:software|senior|junior|lead|principal)\s+(?:engineer|developer|architect|designer)/gi,
      /(?:full[- ]?stack|front[- ]?end|back[- ]?end)\s+(?:engineer|developer)/gi,
      /(?:data|machine learning|ml|ai)\s+(?:engineer|scientist)/gi,
      /product\s+manager/gi,
      /engineering\s+manager/gi,
      /cto|ceo|founder/gi
    ];

    for (const pattern of jobTitlePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        experiences.push({
          title: match[0],
          // Could extract company/dates with more complex regex
          company: null,
          dates: null
        });
      }
    }

    return experiences;
  }

  /**
   * Extract education
   */
  _extractEducation(text) {
    const education = [];
    const textLower = text.toLowerCase();

    for (const degree of this.degreeKeywords) {
      if (textLower.includes(degree)) {
        // Extract the line containing the degree
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.toLowerCase().includes(degree)) {
            education.push({
              degree: line.trim(),
              school: null, // Could extract with more complex parsing
              year: this._extractYear(line)
            });
            break;
          }
        }
      }
    }

    return education;
  }

  /**
   * Extract projects and portfolio links
   */
  _extractProjects(text) {
    const projects = [];

    // Look for GitHub repos
    const githubRepoPattern = /github\.com\/[\w-]+\/[\w-]+/gi;
    const matches = text.matchAll(githubRepoPattern);

    for (const match of matches) {
      projects.push({
        type: 'github',
        url: `https://${match[0]}`
      });
    }

    return projects;
  }

  /**
   * Generate a brief summary
   */
  _generateSummary(text) {
    // Extract first 200 characters as summary
    const lines = text.split('\n').filter(line => line.trim().length > 0);

    // Try to find a summary section
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().match(/summary|profile|about/)) {
        const summaryText = lines.slice(i + 1, i + 4).join(' ');
        if (summaryText.length > 50) {
          return summaryText.substring(0, 300) + '...';
        }
      }
    }

    // Fallback: first few lines
    return lines.slice(0, 3).join(' ').substring(0, 300) + '...';
  }

  /**
   * Extract year from text
   */
  _extractYear(text) {
    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? parseInt(yearMatch[0]) : null;
  }

  /**
   * Calculate skill match score vs job requirements
   * @param {array} candidateSkills - Skills from resume
   * @param {array} requiredSkills - Required skills from job posting
   * @returns {number} Match score (0-100)
   */
  calculateSkillMatch(candidateSkills, requiredSkills) {
    if (!requiredSkills || requiredSkills.length === 0) return 100;
    if (!candidateSkills || candidateSkills.length === 0) return 0;

    const candidateSkillsLower = candidateSkills.map(s => s.toLowerCase());
    const requiredSkillsLower = requiredSkills.map(s => s.toLowerCase());

    let matchCount = 0;
    for (const required of requiredSkillsLower) {
      if (candidateSkillsLower.some(c => c.includes(required) || required.includes(c))) {
        matchCount++;
      }
    }

    return Math.round((matchCount / requiredSkills.length) * 100);
  }
}

module.exports = ResumeParser;
