/**
 * Legal Linker
 *
 * Automatically embeds case law citations and legal references into documents.
 * Converts plain text references into clickable links to the case law database.
 *
 * Features:
 * - Auto-detect legal citations (case names, regulations, statutes)
 * - Link to case-law.html with proper anchors
 * - Generate structured data (JSON-LD) for SEO
 * - Track citation usage for analytics
 *
 * Usage:
 *   const linker = new LegalLinker();
 *   const linkedHtml = linker.autoCiteCaseLaw(htmlContent, 'crypto');
 *   const structuredData = linker.generateStructuredData(linkedHtml);
 */

class LegalLinker {
  constructor() {
    // Case law database (matches case-law.html)
    this.caseLawDatabase = [
      // CRYPTO
      {
        name: 'SEC v. Ripple Labs, Inc.',
        shortName: 'SEC v. Ripple',
        anchor: 'sec-v-ripple',
        citation: 'No. 20-cv-10832 (S.D.N.Y. 2023)',
        year: 2023,
        industry: 'crypto',
        keywords: ['XRP', 'securities', 'SEC', 'cryptocurrency']
      },
      {
        name: 'Tornado Cash Sanctions',
        shortName: 'Tornado Cash',
        anchor: 'tornado-cash',
        citation: 'Treasury Department OFAC Sanctions (August 2022)',
        year: 2022,
        industry: 'crypto',
        keywords: ['AML', 'sanctions', 'mixer', 'OFAC']
      },
      {
        name: 'Coinbase, Inc. v. Bielski',
        shortName: 'Coinbase v. Bielski',
        anchor: 'coinbase-v-bielski',
        citation: 'No. 22-105 (U.S. Supreme Court 2023)',
        year: 2023,
        industry: 'crypto',
        keywords: ['arbitration', 'user agreements', 'Supreme Court']
      },

      // FINANCE
      {
        name: 'PCI-DSS v4.0 Standard',
        shortName: 'PCI-DSS',
        anchor: 'pci-dss',
        citation: 'PCI Security Standards Council (March 2024)',
        year: 2024,
        industry: 'finance',
        keywords: ['card security', 'payment', 'PCI']
      },
      {
        name: 'Gramm-Leach-Bliley Act Privacy Rule',
        shortName: 'GLBA',
        anchor: 'glba',
        citation: '15 U.S.C. § 6801–6809',
        year: 1999,
        industry: 'finance',
        keywords: ['financial privacy', 'GLBA', 'FTC']
      },

      // HEALTHCARE
      {
        name: 'HIPAA Privacy Rule',
        shortName: 'HIPAA Privacy Rule',
        anchor: 'hipaa-privacy-rule',
        citation: '45 CFR Part 160 and Part 164',
        year: 2003,
        industry: 'healthcare',
        keywords: ['HIPAA', 'PHI', 'privacy', 'health data']
      },
      {
        name: 'HIPAA Security Rule',
        shortName: 'HIPAA Security Rule',
        anchor: 'hipaa-security-rule',
        citation: '45 CFR Part 164, Subpart C',
        year: 2005,
        industry: 'healthcare',
        keywords: ['HIPAA', 'security', 'ePHI', 'encryption']
      },
      {
        name: 'HITECH Act',
        shortName: 'HITECH',
        anchor: 'hitech',
        citation: 'Health Information Technology for Economic and Clinical Health Act (2009)',
        year: 2009,
        industry: 'healthcare',
        keywords: ['HITECH', 'breach notification', 'business associate']
      },

      // LEGAL SERVICES
      {
        name: 'Upjohn v. United States',
        shortName: 'Upjohn',
        anchor: 'upjohn',
        citation: '449 U.S. 383 (1981)',
        year: 1981,
        industry: 'legal',
        keywords: ['attorney-client privilege', 'confidentiality']
      },
      {
        name: 'ABA Model Rule 1.6',
        shortName: 'ABA Rule 1.6',
        anchor: 'aba-rule-1-6',
        citation: 'ABA Model Rules of Professional Conduct',
        year: 2002,
        industry: 'legal',
        keywords: ['confidentiality', 'legal ethics', 'ABA']
      },
      {
        name: 'Legal Ethics Opinion 477R',
        shortName: 'Opinion 477R',
        anchor: 'opinion-477r',
        citation: 'ABA Formal Opinion 477R (2017)',
        year: 2017,
        industry: 'legal',
        keywords: ['cloud computing', 'legal ethics', 'data security']
      },

      // EDUCATION
      {
        name: 'FERPA',
        shortName: 'FERPA',
        anchor: 'ferpa',
        citation: '20 U.S.C. § 1232g',
        year: 1974,
        industry: 'education',
        keywords: ['FERPA', 'student privacy', 'education records']
      },
      {
        name: 'COPPA',
        shortName: 'COPPA',
        anchor: 'coppa',
        citation: '15 U.S.C. §§ 6501–6506',
        year: 1998,
        industry: 'education',
        keywords: ['COPPA', 'children', 'parental consent']
      },
      {
        name: 'Owasso Independent School District v. Falvo',
        shortName: 'Owasso v. Falvo',
        anchor: 'owasso-v-falvo',
        citation: '534 U.S. 426 (2002)',
        year: 2002,
        industry: 'education',
        keywords: ['FERPA', 'peer grading', 'Supreme Court']
      },

      // GENERAL / PRIVACY
      {
        name: 'GDPR',
        shortName: 'GDPR',
        anchor: 'gdpr',
        citation: 'EU Regulation 2016/679',
        year: 2018,
        industry: 'all',
        keywords: ['GDPR', 'privacy', 'EU', 'data protection']
      },
      {
        name: 'CCPA',
        shortName: 'CCPA',
        anchor: 'ccpa',
        citation: 'California Civil Code § 1798.100 et seq.',
        year: 2020,
        industry: 'all',
        keywords: ['CCPA', 'California', 'privacy', 'data deletion']
      },
      {
        name: 'Schrems II',
        shortName: 'Schrems II',
        anchor: 'schrems-ii',
        citation: 'Data Protection Commissioner v. Facebook Ireland (C-311/18)',
        year: 2020,
        industry: 'all',
        keywords: ['GDPR', 'data transfers', 'Privacy Shield', 'EU']
      }
    ];
  }

  /**
   * Auto-cite case law in HTML content
   * Replaces case names with links to case-law.html
   *
   * @param {string} html - HTML content
   * @param {string} industry - Industry filter (optional)
   * @returns {string} - HTML with embedded case law links
   */
  autoCiteCaseLaw(html, industry = null) {
    let linkedHtml = html;

    // Filter database by industry if specified
    let database = this.caseLawDatabase;
    if (industry && industry !== 'all') {
      database = database.filter(law => law.industry === industry || law.industry === 'all');
    }

    // Sort by name length (longest first) to avoid partial matches
    database.sort((a, b) => b.name.length - a.name.length);

    // Replace each case law reference with a link
    database.forEach(law => {
      // Try full name first
      const fullRegex = new RegExp(`\\b${this.escapeRegex(law.name)}\\b`, 'gi');
      linkedHtml = linkedHtml.replace(fullRegex, (match) => {
        return this.createCaseLawLink(match, law);
      });

      // Then try short name
      if (law.shortName !== law.name) {
        const shortRegex = new RegExp(`\\b${this.escapeRegex(law.shortName)}\\b`, 'gi');
        linkedHtml = linkedHtml.replace(shortRegex, (match) => {
          return this.createCaseLawLink(match, law);
        });
      }
    });

    return linkedHtml;
  }

  /**
   * Create a case law link
   *
   * @param {string} text - Original text
   * @param {object} law - Case law object
   * @returns {string} - HTML link
   */
  createCaseLawLink(text, law) {
    return `<a href="/case-law.html#${law.anchor}" class="case-law-link" data-industry="${law.industry}" data-year="${law.year}" title="${law.citation}">${text}</a>`;
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Generate structured data (JSON-LD) for SEO
   * Used by search engines to understand legal citations
   *
   * @param {string} html - HTML content
   * @param {object} metadata - Page metadata
   * @returns {object} - JSON-LD structured data
   */
  generateStructuredData(html, metadata = {}) {
    // Extract cited cases from HTML
    const citedCases = this.extractCitedCases(html);

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "LegalDocument",
      "name": metadata.title || "CalOS Legal Document",
      "description": metadata.description || "Legal documentation and compliance information",
      "inLanguage": "en-US",
      "datePublished": metadata.datePublished || new Date().toISOString(),
      "dateModified": metadata.dateModified || new Date().toISOString(),
      "publisher": {
        "@type": "Organization",
        "name": "CalOS",
        "url": "https://soulfra.github.io"
      }
    };

    // Add citations
    if (citedCases.length > 0) {
      structuredData.citation = citedCases.map(law => {
        if (law.industry === 'all' && law.keywords.includes('GDPR')) {
          return {
            "@type": "Legislation",
            "name": law.name,
            "legislationIdentifier": law.citation,
            "legislationDate": law.year.toString()
          };
        } else {
          return {
            "@type": "LegalCase",
            "name": law.name,
            "caseNumber": law.citation,
            "datePublished": law.year.toString()
          };
        }
      });
    }

    return structuredData;
  }

  /**
   * Extract cited cases from HTML
   */
  extractCitedCases(html) {
    const cited = [];
    this.caseLawDatabase.forEach(law => {
      const regex = new RegExp(`\\b${this.escapeRegex(law.name)}\\b`, 'i');
      if (regex.test(html)) {
        cited.push(law);
      }
    });
    return cited;
  }

  /**
   * Get case law by anchor
   */
  getCaseLawByAnchor(anchor) {
    return this.caseLawDatabase.find(law => law.anchor === anchor);
  }

  /**
   * Get case law by industry
   */
  getCaseLawByIndustry(industry) {
    return this.caseLawDatabase.filter(law => law.industry === industry || law.industry === 'all');
  }

  /**
   * Generate citation list for a document
   * Used in "References" section at bottom of legal docs
   */
  generateCitationList(html, industry = null) {
    const cited = this.extractCitedCases(html);

    // Filter by industry if specified
    let filtered = cited;
    if (industry && industry !== 'all') {
      filtered = cited.filter(law => law.industry === industry || law.industry === 'all');
    }

    // Generate HTML list
    let listHtml = '<div class="citation-list">\n';
    listHtml += '  <h3>Legal Citations</h3>\n';
    listHtml += '  <ul>\n';

    filtered.forEach(law => {
      listHtml += `    <li><strong>${law.name}</strong>, ${law.citation} (${law.year})</li>\n`;
    });

    listHtml += '  </ul>\n';
    listHtml += '</div>\n';

    return listHtml;
  }

  /**
   * Track citation usage (for analytics)
   * Call this when a case law link is clicked
   */
  trackCitationClick(anchor, industry, pageName) {
    if (typeof window !== 'undefined' && window.Analytics) {
      window.Analytics.track('case_law_clicked', {
        anchor: anchor,
        industry: industry,
        page: pageName,
        timestamp: Date.now()
      });
    }
  }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LegalLinker;
} else if (typeof window !== 'undefined') {
  window.LegalLinker = LegalLinker;
}
