/**
 * E2E Test Runner with Puppeteer
 * Tests deployed GitHub Pages and validates all pages work
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class E2ETestRunner {
  constructor(options = {}) {
    this.domain = options.domain || 'lessons.calriven.com';
    this.screenshotDir = options.screenshotDir || 'test-results/screenshots';
    this.headless = options.headless !== false;
    this.timeout = options.timeout || 30000;
  }

  async init() {
    // Ensure screenshot directory exists
    await fs.mkdir(this.screenshotDir, { recursive: true });

    // Launch browser
    this.browser = await puppeteer.launch({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(this.timeout);
  }

  async testMainPage() {
    const url = `https://${this.domain}/lessons/`;
    console.log(`Testing: ${url}`);

    try {
      await this.page.goto(url, { waitUntil: 'networkidle0' });

      // Check title
      const title = await this.page.title();
      console.log(`  ✅ Title: ${title}`);

      // Screenshot
      const screenshotPath = path.join(this.screenshotDir, 'homepage.png');
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  ✅ Screenshot: ${screenshotPath}`);

      // Check for lesson list
      const hasLessonList = await this.page.$('.lesson-list') !== null ||
                            await this.page.$('[data-lesson]') !== null;
      console.log(`  ${hasLessonList ? '✅' : '❌'} Lesson list present`);

      return {
        url,
        success: true,
        title,
        screenshot: screenshotPath,
        hasLessonList
      };
    } catch (error) {
      console.error(`  ❌ Failed: ${error.message}`);
      return {
        url,
        success: false,
        error: error.message
      };
    }
  }

  async testSitemap() {
    const url = `https://${this.domain}/sitemap.xml`;
    console.log(`\nTesting sitemap: ${url}`);

    try {
      await this.page.goto(url);
      const content = await this.page.content();

      // Extract URLs from sitemap
      const urlMatches = content.match(/<loc>(.*?)<\/loc>/g) || [];
      const urls = urlMatches.map(match =>
        match.replace(/<\/?loc>/g, '')
      );

      console.log(`  ✅ Found ${urls.length} URLs in sitemap`);

      return {
        url,
        success: true,
        urls,
        count: urls.length
      };
    } catch (error) {
      console.error(`  ❌ Sitemap failed: ${error.message}`);
      return {
        url,
        success: false,
        error: error.message
      };
    }
  }

  async testAllSitemapUrls() {
    console.log(`\nTesting all sitemap URLs...`);

    // Get sitemap URLs
    const sitemapResult = await this.testSitemap();
    if (!sitemapResult.success) {
      return { success: false, error: 'Sitemap fetch failed' };
    }

    const results = [];

    for (const url of sitemapResult.urls) {
      try {
        console.log(`\nTesting: ${url}`);
        await this.page.goto(url, { waitUntil: 'networkidle0' });

        const title = await this.page.title();
        console.log(`  ✅ Title: ${title}`);

        // Screenshot
        const filename = url.split('/').pop().replace(/[^a-z0-9]/gi, '-') + '.png';
        const screenshotPath = path.join(this.screenshotDir, filename);
        await this.page.screenshot({ path: screenshotPath, fullPage: true });

        results.push({
          url,
          success: true,
          title,
          screenshot: screenshotPath
        });
      } catch (error) {
        console.error(`  ❌ Failed: ${error.message}`);
        results.push({
          url,
          success: false,
          error: error.message
        });
      }
    }

    const passedCount = results.filter(r => r.success).length;
    console.log(`\n✅ Passed: ${passedCount}/${results.length}`);

    return {
      success: passedCount === results.length,
      total: results.length,
      passed: passedCount,
      failed: results.length - passedCount,
      results
    };
  }

  async testServiceWorker() {
    console.log(`\nTesting Service Worker...`);

    try {
      const url = `https://${this.domain}/lessons/`;
      await this.page.goto(url, { waitUntil: 'networkidle0' });

      // Check if service worker is registered
      const swRegistered = await this.page.evaluate(() => {
        return navigator.serviceWorker.getRegistration()
          .then(reg => !!reg)
          .catch(() => false);
      });

      console.log(`  ${swRegistered ? '✅' : '❌'} Service Worker registered`);

      return {
        success: swRegistered,
        registered: swRegistered
      };
    } catch (error) {
      console.error(`  ❌ Service Worker test failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async testOfflineMode() {
    console.log(`\nTesting offline mode...`);

    try {
      const url = `https://${this.domain}/lessons/`;

      // First visit to cache
      await this.page.goto(url, { waitUntil: 'networkidle0' });
      console.log(`  ✅ Initial load complete`);

      // Wait for service worker to cache
      await this.page.waitForTimeout(2000);

      // Go offline
      await this.page.setOfflineMode(true);
      console.log(`  📡 Offline mode enabled`);

      // Reload
      await this.page.reload();
      const offlineTitle = await this.page.title();
      console.log(`  ✅ Offline load title: ${offlineTitle}`);

      // Screenshot
      const screenshotPath = path.join(this.screenshotDir, 'offline-mode.png');
      await this.page.screenshot({ path: screenshotPath, fullPage: true });

      // Back online
      await this.page.setOfflineMode(false);

      return {
        success: true,
        offlineTitle,
        screenshot: screenshotPath
      };
    } catch (error) {
      console.error(`  ❌ Offline test failed: ${error.message}`);
      await this.page.setOfflineMode(false); // Ensure we're back online
      return {
        success: false,
        error: error.message
      };
    }
  }

  async runAllTests() {
    console.log(`\n🧪 Starting E2E tests for ${this.domain}\n`);

    const startTime = Date.now();

    await this.init();

    const results = {
      domain: this.domain,
      timestamp: new Date().toISOString(),
      tests: {}
    };

    // Run all tests
    results.tests.mainPage = await this.testMainPage();
    results.tests.sitemap = await this.testSitemap();
    results.tests.allPages = await this.testAllSitemapUrls();
    results.tests.serviceWorker = await this.testServiceWorker();
    results.tests.offlineMode = await this.testOfflineMode();

    await this.cleanup();

    const endTime = Date.now();
    results.duration = endTime - startTime;

    // Summary
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 Test Summary`);
    console.log(`${'='.repeat(50)}`);
    console.log(`Domain: ${this.domain}`);
    console.log(`Duration: ${(results.duration / 1000).toFixed(2)}s`);
    console.log(`Main Page: ${results.tests.mainPage.success ? '✅' : '❌'}`);
    console.log(`Sitemap: ${results.tests.sitemap.success ? '✅' : '❌'} (${results.tests.sitemap.count || 0} URLs)`);
    console.log(`All Pages: ${results.tests.allPages.success ? '✅' : '❌'} (${results.tests.allPages.passed}/${results.tests.allPages.total})`);
    console.log(`Service Worker: ${results.tests.serviceWorker.success ? '✅' : '❌'}`);
    console.log(`Offline Mode: ${results.tests.offlineMode.success ? '✅' : '❌'}`);
    console.log(`${'='.repeat(50)}\n`);

    // Overall success
    results.success = Object.values(results.tests).every(t => t.success);

    // Save results
    const resultsPath = path.join(this.screenshotDir, 'test-results.json');
    await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
    console.log(`📄 Results saved to: ${resultsPath}\n`);

    return results;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// CLI usage
if (require.main === module) {
  const domain = process.argv[2] || 'lessons.calriven.com';

  const runner = new E2ETestRunner({ domain });

  runner.runAllTests()
    .then(results => {
      process.exit(results.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = E2ETestRunner;
