/**
 * Magento Documentation Scraper
 *
 * Scrapes Magento 2 developer documentation and certification guides to extract:
 * - Developer certification exam topics
 * - Code examples and best practices
 * - API references
 * - Module development guides
 *
 * Sources:
 * - https://developer.adobe.com/commerce/php/
 * - https://experienceleague.adobe.com/docs/commerce.html
 * - Magento 2 certification study guides
 */

const DocScraper = require('../doc-scraper');

class MagentoScraper extends DocScraper {
  constructor(config = {}) {
    super(config);

    this.baseUrls = {
      devDocs: 'https://developer.adobe.com/commerce/php/',
      certGuide: 'https://experienceleague.adobe.com/docs/commerce.html',
      communityDocs: 'https://devdocs.magento.com/'
    };

    // Certification topics (Magento 2 Certified Professional Developer)
    this.certificationTopics = [
      {
        name: 'Magento Architecture and Customization Techniques',
        weight: '33%',
        subtopics: [
          'Describe Magento\'s module-based architecture',
          'Describe Magento\'s directory structure',
          'Utilize configuration and configuration variables scope',
          'Demonstrate how to use dependency injection (DI)',
          'Demonstrate ability to use plugins',
          'Configure event observers and scheduled jobs',
          'Utilize the CLI'
        ]
      },
      {
        name: 'Request Flow Processing',
        weight: '7%',
        subtopics: [
          'Describe how to use Magento modes',
          'Demonstrate ability to create a frontend controller with different response types',
          'Demonstrate how to use URL rewrites for a catalog product view'
        ]
      },
      {
        name: 'Customizing the Magento UI',
        weight: '15%',
        subtopics: [
          'Demonstrate ability to utilize themes and the template structure',
          'Demonstrate ability to use layout and XML schema',
          'Utilize JavaScript in Magento'
        ]
      },
      {
        name: 'Working with Databases in Magento',
        weight: '18%',
        subtopics: [
          'Describe the basic concepts of models, resource models, and collections',
          'Describe how entity load and save occurs',
          'Describe how to filter, sort, and specify the selected values for collections and repositories',
          'Demonstrate ability to use declarative schema'
        ]
      },
      {
        name: 'Developing with Adminhtml',
        weight: '11%',
        subtopics: [
          'Create a controller for an admin router',
          'Define basic terms and elements of system configuration, including scopes, website, store, store view',
          'Define / identify basic terms and elements of ACL',
          'Set up a menu item',
          'Create appropriate permissions for users'
        ]
      },
      {
        name: 'Customizing Magento Business Logic',
        weight: '16%',
        subtopics: [
          'Identify/describe standard product types',
          'Describe category properties in Magento',
          'Define how products are related to the category',
          'Describe the difference in behavior of different product types in the cart',
          'Describe native shipment functionality in Magento',
          'Describe and customize operations available in the customer account area'
        ]
      }
    ];

    console.log('[MagentoScraper] Initialized with certification topics');
  }

  /**
   * Scrape Magento 2 Developer Documentation
   */
  async scrapeDevDocs(options = {}) {
    const startUrl = options.url || this.baseUrls.devDocs;

    console.log('[MagentoScraper] Scraping Magento developer docs...');

    const pages = await this.crawl(startUrl, {
      maxPages: options.maxPages || 100,
      maxDepth: options.maxDepth || 2,
      urlFilter: (url) => {
        // Only scrape developer docs, skip changelog/release notes
        return url.includes('developer.adobe.com/commerce') &&
               !url.includes('/release-notes/') &&
               !url.includes('/changelog/');
      },
      contentSelector: '.main-content, main, article',
      headingSelector: 'h1, h2, h3, h4',
      codeSelector: 'pre code, .code-block'
    });

    // Organize by topic
    const organizedDocs = this.organizeByCertificationTopic(pages);

    // Save to file
    const filename = `magento-dev-docs-${Date.now()}.json`;
    await this.saveToFile(organizedDocs, filename);

    return organizedDocs;
  }

  /**
   * Organize scraped pages by certification topic
   */
  organizeByCertificationTopic(pages) {
    const organized = {
      certificationTopics: this.certificationTopics,
      pagesByTopic: {},
      allPages: pages,
      metadata: {
        totalPages: pages.length,
        totalSections: pages.reduce((sum, p) => sum + p.sections.length, 0),
        totalCodeBlocks: pages.reduce((sum, p) => sum + p.codeBlocks.length, 0),
        scrapedAt: new Date().toISOString()
      }
    };

    // Initialize topics
    this.certificationTopics.forEach(topic => {
      organized.pagesByTopic[topic.name] = {
        weight: topic.weight,
        subtopics: topic.subtopics,
        pages: []
      };
    });

    // Categorize pages by topic using keyword matching
    const topicKeywords = {
      'Magento Architecture and Customization Techniques': [
        'module', 'architecture', 'dependency injection', 'plugin', 'observer',
        'di.xml', 'etc/module.xml', 'registration.php', 'cron', 'cli', 'command'
      ],
      'Request Flow Processing': [
        'controller', 'router', 'response', 'url rewrite', 'mode', 'developer mode',
        'production mode', 'frontend controller'
      ],
      'Customizing the Magento UI': [
        'theme', 'layout', 'template', 'xml', 'phtml', 'javascript', 'requirejs',
        'knockout', 'ui component', 'less', 'css'
      ],
      'Working with Databases in Magento': [
        'model', 'resource model', 'collection', 'repository', 'schema', 'db_schema.xml',
        'entity', 'attribute', 'eav', 'migration', 'setup script'
      ],
      'Developing with Adminhtml': [
        'admin', 'adminhtml', 'acl', 'menu', 'system config', 'backend', 'permissions',
        'authorization', 'system.xml', 'acl.xml', 'menu.xml'
      ],
      'Customizing Magento Business Logic': [
        'product', 'category', 'cart', 'checkout', 'order', 'shipment', 'customer',
        'account', 'catalog', 'quote', 'sales', 'inventory'
      ]
    };

    pages.forEach(page => {
      const pageText = JSON.stringify(page).toLowerCase();

      // Find best matching topic
      let bestTopic = null;
      let bestScore = 0;

      Object.entries(topicKeywords).forEach(([topic, keywords]) => {
        const score = keywords.reduce((count, keyword) => {
          return count + (pageText.includes(keyword.toLowerCase()) ? 1 : 0);
        }, 0);

        if (score > bestScore) {
          bestScore = score;
          bestTopic = topic;
        }
      });

      if (bestTopic && bestScore > 0) {
        organized.pagesByTopic[bestTopic].pages.push({
          ...page,
          matchScore: bestScore
        });
      }
    });

    return organized;
  }

  /**
   * Generate certification exam questions from scraped content
   */
  generateExamQuestions(organizedDocs, questionsPerTopic = 10) {
    const examQuestions = [];

    Object.entries(organizedDocs.pagesByTopic).forEach(([topicName, topicData]) => {
      const topicQuestions = [];

      // Extract code-based questions
      topicData.pages.forEach(page => {
        page.codeBlocks.forEach(codeBlock => {
          if (codeBlock.language === 'php' && codeBlock.code.length > 50) {
            // Create a "what does this code do?" question
            topicQuestions.push({
              type: 'code-analysis',
              topic: topicName,
              question: `What is the purpose of the following code?\n\n\`\`\`${codeBlock.language}\n${codeBlock.code}\n\`\`\``,
              sourceUrl: page.url,
              difficulty: codeBlock.code.length > 200 ? 'hard' : 'medium'
            });
          }

          if (codeBlock.language === 'xml' && codeBlock.code.includes('<config')) {
            // Create a "what does this XML configure?" question
            topicQuestions.push({
              type: 'xml-configuration',
              topic: topicName,
              question: `What does this XML configuration define?\n\n\`\`\`xml\n${codeBlock.code}\n\`\`\``,
              sourceUrl: page.url,
              difficulty: 'medium'
            });
          }
        });

        // Extract text-based questions from section titles
        page.sections.forEach(section => {
          if (section.title.includes('How to') || section.title.includes('Overview')) {
            topicQuestions.push({
              type: 'concept',
              topic: topicName,
              question: `Explain: ${section.title}`,
              context: section.content.slice(0, 3).join(' '),
              sourceUrl: page.url,
              difficulty: 'easy'
            });
          }
        });
      });

      // Select top N questions for this topic
      const selectedQuestions = topicQuestions
        .sort(() => Math.random() - 0.5) // Shuffle
        .slice(0, questionsPerTopic);

      examQuestions.push(...selectedQuestions);
    });

    return examQuestions;
  }

  /**
   * Full scrape workflow: docs → organize → generate questions
   */
  async runFullScrape(options = {}) {
    console.log('[MagentoScraper] Starting full Magento scrape workflow...');

    // Step 1: Scrape docs
    const organizedDocs = await this.scrapeDevDocs(options);

    // Step 2: Generate exam questions
    const examQuestions = this.generateExamQuestions(organizedDocs, 10);

    const fullData = {
      organizedDocs,
      examQuestions,
      metadata: {
        totalQuestions: examQuestions.length,
        questionsByType: examQuestions.reduce((acc, q) => {
          acc[q.type] = (acc[q.type] || 0) + 1;
          return acc;
        }, {}),
        questionsByDifficulty: examQuestions.reduce((acc, q) => {
          acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
          return acc;
        }, {})
      }
    };

    // Save complete dataset
    const filename = `magento-certification-${Date.now()}.json`;
    await this.saveToFile(fullData, filename);

    console.log('[MagentoScraper] Full scrape complete!');
    console.log(`  - Pages scraped: ${organizedDocs.allPages.length}`);
    console.log(`  - Questions generated: ${examQuestions.length}`);
    console.log(`  - Saved to: ${filename}`);

    return fullData;
  }
}

module.exports = MagentoScraper;
