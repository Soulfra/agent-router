/**
 * SEO Optimizer
 *
 * Generates SEO-optimized content for legal/compliance documentation:
 * - Structured data (JSON-LD) for rich snippets
 * - Meta tags (Open Graph, Twitter Cards)
 * - Sitemap generation
 * - Keyword optimization
 * - Dragon keyword tracking (high-difficulty, high-value)
 *
 * Features:
 * - Schema.org markup for legal documents
 * - Breadcrumb navigation
 * - Article structured data
 * - Organization structured data
 * - FAQ structured data
 *
 * Usage:
 *   const optimizer = new SEOOptimizer();
 *   const metaTags = optimizer.generateMetaTags({
 *     title: 'CalOS Privacy Policy',
 *     description: 'Privacy-first automation platform',
 *     keywords: ['privacy', 'HIPAA', 'GDPR']
 *   });
 */

class SEOOptimizer {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://soulfra.github.io';
    this.siteName = options.siteName || 'CalOS';
    this.twitterHandle = options.twitterHandle || '@calos';

    // Dragon keywords (high-difficulty 60+, high-volume 1k+)
    this.dragonKeywords = [
      { keyword: 'privacy-first automation', difficulty: 65, volume: 2400, intent: 'commercial' },
      { keyword: 'HIPAA compliant platform', difficulty: 72, volume: 3600, intent: 'commercial' },
      { keyword: 'crypto payment gateway', difficulty: 78, volume: 5400, intent: 'commercial' },
      { keyword: 'self-hosted CRM', difficulty: 68, volume: 1800, intent: 'commercial' },
      { keyword: 'zero-knowledge auth', difficulty: 70, volume: 1200, intent: 'informational' },
      { keyword: 'GDPR compliance software', difficulty: 75, volume: 4200, intent: 'commercial' },
      { keyword: 'open source payments', difficulty: 62, volume: 2100, intent: 'informational' },
      { keyword: 'PCI-DSS compliance', difficulty: 69, volume: 3900, intent: 'commercial' }
    ];
  }

  /**
   * Generate all SEO meta tags for a page
   */
  generateMetaTags(page) {
    const {
      title,
      description,
      keywords = [],
      image,
      url,
      type = 'website',
      datePublished,
      dateModified,
      author = 'CalOS Team'
    } = page;

    const fullUrl = url ? `${this.baseUrl}${url}` : this.baseUrl;
    const fullImage = image ? `${this.baseUrl}${image}` : `${this.baseUrl}/og-image.png`;

    return `
<!-- Primary Meta Tags -->
<title>${title} | ${this.siteName}</title>
<meta name="title" content="${title} | ${this.siteName}">
<meta name="description" content="${description}">
<meta name="keywords" content="${keywords.join(', ')}">
<meta name="author" content="${author}">
<link rel="canonical" href="${fullUrl}">

<!-- Open Graph / Facebook -->
<meta property="og:type" content="${type}">
<meta property="og:url" content="${fullUrl}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${fullImage}">
<meta property="og:site_name" content="${this.siteName}">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:url" content="${fullUrl}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${fullImage}">
<meta name="twitter:creator" content="${this.twitterHandle}">

${datePublished ? `<meta property="article:published_time" content="${datePublished}">` : ''}
${dateModified ? `<meta property="article:modified_time" content="${dateModified}">` : ''}

<!-- Robots -->
<meta name="robots" content="index, follow">
<meta name="googlebot" content="index, follow">
`.trim();
  }

  /**
   * Generate structured data (JSON-LD) for legal documents
   */
  generateLegalDocumentSchema(doc) {
    const {
      title,
      description,
      url,
      datePublished,
      dateModified,
      citations = [],
      industry
    } = doc;

    const schema = {
      "@context": "https://schema.org",
      "@type": "LegalDocument",
      "name": title,
      "description": description,
      "url": `${this.baseUrl}${url}`,
      "inLanguage": "en-US",
      "datePublished": datePublished || new Date().toISOString(),
      "dateModified": dateModified || new Date().toISOString(),
      "publisher": {
        "@type": "Organization",
        "name": this.siteName,
        "url": this.baseUrl,
        "logo": {
          "@type": "ImageObject",
          "url": `${this.baseUrl}/logo.png`
        }
      }
    };

    // Add citations
    if (citations.length > 0) {
      schema.citation = citations;
    }

    // Add industry-specific keywords
    if (industry) {
      schema.about = {
        "@type": "Thing",
        "name": industry.charAt(0).toUpperCase() + industry.slice(1) + " Industry"
      };
    }

    return schema;
  }

  /**
   * Generate Organization schema
   */
  generateOrganizationSchema() {
    return {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": this.siteName,
      "url": this.baseUrl,
      "logo": `${this.baseUrl}/logo.png`,
      "description": "Privacy-first automation platform with HIPAA, GDPR, and PCI-DSS compliance",
      "sameAs": [
        "https://github.com/soulfra",
        "https://mastodon.social/@calos"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "Customer Support",
        "email": "support@soulfra.com"
      }
    };
  }

  /**
   * Generate Breadcrumb schema
   */
  generateBreadcrumbSchema(breadcrumbs) {
    const items = breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": crumb.name,
      "item": `${this.baseUrl}${crumb.url}`
    }));

    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": items
    };
  }

  /**
   * Generate FAQ schema (for compliance questions)
   */
  generateFAQSchema(faqs) {
    const mainEntity = faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }));

    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": mainEntity
    };
  }

  /**
   * Generate sitemap entry
   */
  generateSitemapEntry(page) {
    const {
      url,
      lastmod,
      changefreq = 'monthly',
      priority = 0.8
    } = page;

    return `
  <url>
    <loc>${this.baseUrl}${url}</loc>
    <lastmod>${lastmod || new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`.trim();
  }

  /**
   * Generate full sitemap.xml
   */
  generateSitemap(pages) {
    const entries = pages.map(page => this.generateSitemapEntry(page)).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
  }

  /**
   * Optimize content for dragon keywords
   * Returns keyword density recommendations
   */
  analyzeKeywordDensity(content, targetKeyword) {
    const wordCount = content.split(/\s+/).length;
    const keywordCount = (content.match(new RegExp(targetKeyword, 'gi')) || []).length;
    const density = (keywordCount / wordCount) * 100;

    // Optimal density: 1-2% for primary keyword
    const optimal = density >= 1 && density <= 2;

    return {
      keyword: targetKeyword,
      count: keywordCount,
      wordCount: wordCount,
      density: density.toFixed(2) + '%',
      optimal: optimal,
      recommendation: optimal
        ? 'Keyword density is optimal'
        : density < 1
        ? `Add ${Math.ceil(wordCount * 0.015 - keywordCount)} more mentions`
        : `Reduce keyword mentions by ${Math.ceil(keywordCount - wordCount * 0.02)}`
    };
  }

  /**
   * Get dragon keywords by intent
   */
  getDragonKeywords(intent = null, minVolume = 1000, minDifficulty = 60) {
    let keywords = this.dragonKeywords;

    // Filter by intent
    if (intent) {
      keywords = keywords.filter(k => k.intent === intent);
    }

    // Filter by volume
    keywords = keywords.filter(k => k.volume >= minVolume);

    // Filter by difficulty
    keywords = keywords.filter(k => k.difficulty >= minDifficulty);

    return keywords;
  }

  /**
   * Generate robots.txt
   */
  generateRobotsTxt() {
    return `User-agent: *
Allow: /

# Disallow admin pages
Disallow: /admin/
Disallow: /api/

# Sitemap
Sitemap: ${this.baseUrl}/sitemap.xml

# Crawl delay (optional)
Crawl-delay: 1`;
  }

  /**
   * Generate structured data script tag
   */
  generateStructuredDataScript(schema) {
    return `<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`;
  }

  /**
   * Calculate SEO score for a page
   */
  calculateSEOScore(page) {
    const {
      title,
      description,
      content,
      keywords = [],
      headings = [],
      images = [],
      links = []
    } = page;

    let score = 0;
    const issues = [];

    // Title (max 10 points)
    if (title && title.length >= 30 && title.length <= 60) {
      score += 10;
    } else if (title) {
      score += 5;
      issues.push(`Title should be 30-60 characters (currently ${title.length})`);
    } else {
      issues.push('Missing title');
    }

    // Description (max 10 points)
    if (description && description.length >= 120 && description.length <= 160) {
      score += 10;
    } else if (description) {
      score += 5;
      issues.push(`Description should be 120-160 characters (currently ${description.length})`);
    } else {
      issues.push('Missing description');
    }

    // Keywords (max 10 points)
    if (keywords.length >= 5 && keywords.length <= 10) {
      score += 10;
    } else if (keywords.length > 0) {
      score += 5;
      issues.push('Keywords should be 5-10 terms');
    } else {
      issues.push('Missing keywords');
    }

    // Content length (max 15 points)
    const wordCount = content ? content.split(/\s+/).length : 0;
    if (wordCount >= 1000) {
      score += 15;
    } else if (wordCount >= 500) {
      score += 10;
      issues.push(`Content should be 1000+ words (currently ${wordCount})`);
    } else if (wordCount >= 300) {
      score += 5;
      issues.push(`Content too short (${wordCount} words)`);
    } else {
      issues.push('Content too short');
    }

    // Headings (max 10 points)
    if (headings.length >= 3) {
      score += 10;
    } else if (headings.length > 0) {
      score += 5;
      issues.push('Add more headings for better structure');
    } else {
      issues.push('Missing headings');
    }

    // Images (max 10 points)
    if (images.length >= 2 && images.every(img => img.alt)) {
      score += 10;
    } else if (images.length > 0) {
      score += 5;
      if (!images.every(img => img.alt)) {
        issues.push('All images need alt text');
      }
    } else {
      issues.push('Add images to improve engagement');
    }

    // Internal links (max 10 points)
    const internalLinks = links.filter(l => l.internal).length;
    if (internalLinks >= 3) {
      score += 10;
    } else if (internalLinks > 0) {
      score += 5;
      issues.push('Add more internal links');
    } else {
      issues.push('Missing internal links');
    }

    // External links (max 5 points)
    const externalLinks = links.filter(l => !l.internal).length;
    if (externalLinks >= 2) {
      score += 5;
    } else {
      issues.push('Add external links to authoritative sources');
    }

    // Mobile friendly (max 10 points)
    // Assume true for now, would need actual testing
    score += 10;

    // HTTPS (max 10 points)
    // Assume true for GitHub Pages
    score += 10;

    return {
      score: Math.round(score),
      maxScore: 100,
      grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
      issues: issues
    };
  }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SEOOptimizer;
} else if (typeof window !== 'undefined') {
  window.SEOOptimizer = SEOOptimizer;
}
