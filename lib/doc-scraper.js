/**
 * Documentation Scraper
 *
 * Scrapes platform documentation (Magento, Shopify, WooCommerce, etc.) to extract:
 * - Certification requirements
 * - Test questions
 * - Code examples
 * - Best practices
 * - API references
 *
 * Output format: JSON with structured lessons, topics, quizzes
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

class DocScraper {
  constructor(config = {}) {
    this.verbose = config.verbose || false;
    this.outputDir = config.outputDir || path.join(__dirname, '../temp/scraped-docs');
    this.userAgent = config.userAgent || 'CALOS Documentation Scraper (Educational Use)';
    this.requestDelay = config.requestDelay || 1000; // 1 second between requests

    // Rate limiting
    this.lastRequestTime = 0;

    console.log('[DocScraper] Initialized');
  }

  /**
   * Sleep for rate limiting
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Rate-limited HTTP request
   */
  async fetch(url) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.requestDelay) {
      await this.sleep(this.requestDelay - timeSinceLastRequest);
    }

    if (this.verbose) {
      console.log(`[DocScraper] Fetching: ${url}`);
    }

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 10000
      });

      this.lastRequestTime = Date.now();
      return response.data;
    } catch (error) {
      console.error(`[DocScraper] Error fetching ${url}:`, error.message);
      throw error;
    }
  }

  /**
   * Parse HTML with Cheerio
   */
  parseHTML(html) {
    return cheerio.load(html);
  }

  /**
   * Extract text from element, removing extra whitespace
   */
  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract code blocks from HTML
   */
  extractCodeBlocks($, selector = 'pre code, code.language-*') {
    const codeBlocks = [];

    $(selector).each((i, el) => {
      const code = $(el).text();
      const language = $(el).attr('class')?.match(/language-(\w+)/)?.[1] || 'unknown';

      codeBlocks.push({
        language,
        code: code.trim()
      });
    });

    return codeBlocks;
  }

  /**
   * Extract sections from documentation page
   */
  extractSections($, config = {}) {
    const {
      contentSelector = 'main, .content, article',
      headingSelector = 'h1, h2, h3',
      paragraphSelector = 'p',
      codeSelector = 'pre code'
    } = config;

    const sections = [];
    let currentSection = null;

    $(contentSelector).find(`${headingSelector}, ${paragraphSelector}, ${codeSelector}`).each((i, el) => {
      const tagName = el.tagName.toLowerCase();

      if (tagName.match(/^h[1-6]$/)) {
        // New section
        if (currentSection) {
          sections.push(currentSection);
        }

        currentSection = {
          level: parseInt(tagName[1]),
          title: this.cleanText($(el).text()),
          content: [],
          codeBlocks: []
        };
      } else if (currentSection) {
        // Add content to current section
        if (tagName === 'p') {
          currentSection.content.push(this.cleanText($(el).text()));
        } else if (el.tagName.toLowerCase() === 'code' && $(el).parent('pre').length > 0) {
          const language = $(el).attr('class')?.match(/language-(\w+)/)?.[1] || 'unknown';
          currentSection.codeBlocks.push({
            language,
            code: $(el).text().trim()
          });
        }
      }
    });

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Extract quiz/test questions from documentation
   */
  extractQuizQuestions($, config = {}) {
    const {
      questionSelector = '.quiz-question, .exam-question, .question',
      answerSelector = '.answer, .option',
      correctAnswerSelector = '.correct, [data-correct="true"]'
    } = config;

    const questions = [];

    $(questionSelector).each((i, questionEl) => {
      const questionText = this.cleanText($(questionEl).find('.question-text, p').first().text());

      const answers = [];
      $(questionEl).find(answerSelector).each((j, answerEl) => {
        const answerText = this.cleanText($(answerEl).text());
        const isCorrect = $(answerEl).is(correctAnswerSelector) ||
                         $(answerEl).find(correctAnswerSelector).length > 0;

        answers.push({
          text: answerText,
          correct: isCorrect
        });
      });

      if (questionText && answers.length > 0) {
        questions.push({
          question: questionText,
          answers,
          type: answers.length > 2 ? 'multiple-choice' : 'true-false'
        });
      }
    });

    return questions;
  }

  /**
   * Extract links from page (for crawling)
   */
  extractLinks($, baseUrl, selector = 'a[href]') {
    const links = new Set();

    $(selector).each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      let fullUrl;
      try {
        fullUrl = new URL(href, baseUrl).href;
      } catch (error) {
        return; // Invalid URL
      }

      // Only keep links from same domain
      const baseHost = new URL(baseUrl).hostname;
      const linkHost = new URL(fullUrl).hostname;

      if (linkHost === baseHost) {
        links.add(fullUrl);
      }
    });

    return Array.from(links);
  }

  /**
   * Scrape a single documentation page
   */
  async scrapePage(url, config = {}) {
    try {
      const html = await this.fetch(url);
      const $ = this.parseHTML(html);

      const pageData = {
        url,
        title: $('title').text() || $('h1').first().text() || 'Untitled',
        sections: this.extractSections($, config),
        codeBlocks: this.extractCodeBlocks($),
        quizQuestions: this.extractQuizQuestions($, config),
        links: config.extractLinks ? this.extractLinks($, url) : [],
        scrapedAt: new Date().toISOString()
      };

      if (this.verbose) {
        console.log(`[DocScraper] Scraped: ${pageData.title} (${pageData.sections.length} sections, ${pageData.codeBlocks.length} code blocks)`);
      }

      return pageData;
    } catch (error) {
      console.error(`[DocScraper] Error scraping ${url}:`, error.message);
      throw error;
    }
  }

  /**
   * Crawl documentation starting from index page
   */
  async crawl(startUrl, options = {}) {
    const {
      maxPages = 50,
      maxDepth = 3,
      urlFilter = null,
      ...config
    } = options;

    const visited = new Set();
    const queue = [{ url: startUrl, depth: 0 }];
    const pages = [];

    console.log(`[DocScraper] Starting crawl from: ${startUrl}`);

    while (queue.length > 0 && visited.size < maxPages) {
      const { url, depth } = queue.shift();

      if (visited.has(url) || depth > maxDepth) {
        continue;
      }

      visited.add(url);

      try {
        const pageData = await this.scrapePage(url, { ...config, extractLinks: depth < maxDepth });
        pages.push(pageData);

        // Add new links to queue
        if (depth < maxDepth) {
          for (const link of pageData.links) {
            if (!visited.has(link)) {
              // Apply URL filter if provided
              if (!urlFilter || urlFilter(link)) {
                queue.push({ url: link, depth: depth + 1 });
              }
            }
          }
        }

        console.log(`[DocScraper] Progress: ${visited.size}/${maxPages} pages, ${queue.length} queued`);
      } catch (error) {
        console.error(`[DocScraper] Skipping ${url} due to error`);
      }
    }

    console.log(`[DocScraper] Crawl complete: ${pages.length} pages scraped`);
    return pages;
  }

  /**
   * Save scraped data to JSON file
   */
  async saveToFile(data, filename) {
    await fs.mkdir(this.outputDir, { recursive: true });
    const filepath = path.join(this.outputDir, filename);

    await fs.writeFile(filepath, JSON.stringify(data, null, 2));

    console.log(`[DocScraper] Saved to: ${filepath}`);
    return filepath;
  }

  /**
   * Load scraped data from JSON file
   */
  async loadFromFile(filename) {
    const filepath = path.join(this.outputDir, filename);
    const data = await fs.readFile(filepath, 'utf8');
    return JSON.parse(data);
  }
}

module.exports = DocScraper;
