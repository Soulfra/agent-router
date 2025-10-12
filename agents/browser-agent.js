/**
 * Browser Automation Agent
 *
 * Uses Puppeteer for web automation, scraping, testing, and screenshots.
 * Capabilities:
 * - Web scraping
 * - Screenshots
 * - Form filling
 * - Click automation
 * - JavaScript execution
 * - PDF generation
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class BrowserAgent {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.timeout = options.timeout || 30000;
    this.screenshotDir = options.screenshotDir || path.join(__dirname, '../../memory/screenshots');

    // Ensure screenshot directory exists
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  /**
   * Process browser automation request
   * @param {string} input - User command
   * @param {object} context - Additional context
   * @returns {Promise<string>} - Result
   */
  async process(input, context = {}) {
    const lowerInput = input.toLowerCase();

    // Parse command
    if (lowerInput.includes('screenshot') || lowerInput.includes('capture')) {
      return await this.screenshot(input, context);
    }

    if (lowerInput.includes('scrape') || lowerInput.includes('extract')) {
      return await this.scrape(input, context);
    }

    if (lowerInput.includes('click') || lowerInput.includes('navigate')) {
      return await this.navigate(input, context);
    }

    if (lowerInput.includes('fill') || lowerInput.includes('type') || lowerInput.includes('form')) {
      return await this.fillForm(input, context);
    }

    if (lowerInput.includes('pdf')) {
      return await this.generatePDF(input, context);
    }

    // Default: general web automation
    return await this.scrape(input, context);
  }

  /**
   * Take screenshot of a URL
   */
  async screenshot(input, context = {}) {
    const url = this._extractURL(input);

    if (!url) {
      return '❌ No URL found. Usage: "@browser screenshot https://example.com"';
    }

    let browser;
    try {
      console.log(`📸 Taking screenshot of ${url}`);

      browser = await puppeteer.launch({ headless: this.headless });
      const page = await browser.newPage();

      await page.setViewport({
        width: context.width || 1920,
        height: context.height || 1080
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: this.timeout });

      const filename = `screenshot_${Date.now()}.png`;
      const filepath = path.join(this.screenshotDir, filename);

      await page.screenshot({
        path: filepath,
        fullPage: context.fullPage || false
      });

      console.log(`✓ Screenshot saved: ${filepath}`);

      return `✓ Screenshot captured: ${url}\nSaved to: ${filepath}\nSize: ${this._getFileSize(filepath)}`;

    } catch (error) {
      console.error('Screenshot error:', error.message);
      return `❌ Screenshot failed: ${error.message}`;

    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Scrape content from a URL
   */
  async scrape(input, context = {}) {
    const url = this._extractURL(input);

    if (!url) {
      return '❌ No URL found. Usage: "@browser scrape https://example.com"';
    }

    let browser;
    try {
      console.log(`🕷️  Scraping ${url}`);

      browser = await puppeteer.launch({ headless: this.headless });
      const page = await browser.newPage();

      await page.goto(url, { waitUntil: 'networkidle2', timeout: this.timeout });

      // Extract based on selector if provided
      if (context.selector) {
        const elements = await page.$$(context.selector);
        const texts = await Promise.all(
          elements.map(el => page.evaluate(element => element.textContent, el))
        );
        return `✓ Scraped ${texts.length} elements:\n\n${texts.join('\n')}`;
      }

      // Extract page title and main content
      const data = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent.trim()),
          paragraphs: Array.from(document.querySelectorAll('p')).slice(0, 5).map(p => p.textContent.trim()),
          links: Array.from(document.querySelectorAll('a')).slice(0, 10).map(a => ({
            text: a.textContent.trim(),
            href: a.href
          }))
        };
      });

      let result = `✓ Scraped: ${url}\n\n`;
      result += `Title: ${data.title}\n\n`;

      if (data.headings.length > 0) {
        result += `Headings:\n${data.headings.slice(0, 10).map(h => `  • ${h}`).join('\n')}\n\n`;
      }

      if (data.paragraphs.length > 0) {
        result += `Content Preview:\n${data.paragraphs.slice(0, 3).join('\n\n')}\n\n`;
      }

      if (data.links.length > 0) {
        result += `Links:\n${data.links.slice(0, 5).map(l => `  • ${l.text}: ${l.href}`).join('\n')}`;
      }

      return result;

    } catch (error) {
      console.error('Scraping error:', error.message);
      return `❌ Scraping failed: ${error.message}`;

    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Navigate and interact with page
   */
  async navigate(input, context = {}) {
    const url = this._extractURL(input);

    if (!url) {
      return '❌ No URL found. Usage: "@browser navigate to https://example.com and click button"';
    }

    let browser;
    try {
      console.log(`🧭 Navigating to ${url}`);

      browser = await puppeteer.launch({ headless: this.headless });
      const page = await browser.newPage();

      await page.goto(url, { waitUntil: 'networkidle2', timeout: this.timeout });

      // Parse and execute actions
      const actions = [];

      if (input.includes('click')) {
        const selector = context.selector || this._extractSelector(input, 'click');
        if (selector) {
          await page.click(selector);
          actions.push(`Clicked: ${selector}`);
        }
      }

      if (input.includes('scroll')) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        actions.push('Scrolled to bottom');
      }

      // Wait a bit for actions to complete
      await page.waitForTimeout(2000);

      const result = `✓ Navigation complete: ${url}\nActions performed:\n${actions.map(a => `  • ${a}`).join('\n')}`;

      return result;

    } catch (error) {
      console.error('Navigation error:', error.message);
      return `❌ Navigation failed: ${error.message}`;

    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Fill and submit forms
   */
  async fillForm(input, context = {}) {
    const url = this._extractURL(input);

    if (!url) {
      return '❌ No URL found. Usage: "@browser fill form at https://example.com"';
    }

    if (!context.formData || Object.keys(context.formData).length === 0) {
      return '❌ No form data provided. Add formData to context: { email: "test@example.com", ... }';
    }

    let browser;
    try {
      console.log(`📝 Filling form at ${url}`);

      browser = await puppeteer.launch({ headless: this.headless });
      const page = await browser.newPage();

      await page.goto(url, { waitUntil: 'networkidle2', timeout: this.timeout });

      // Fill form fields
      const filled = [];
      for (const [selector, value] of Object.entries(context.formData)) {
        try {
          await page.type(selector, value);
          filled.push(selector);
        } catch (err) {
          console.warn(`Could not fill ${selector}:`, err.message);
        }
      }

      // Submit if requested
      if (context.submit) {
        const submitSelector = context.submitSelector || 'button[type="submit"]';
        await page.click(submitSelector);
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
      }

      return `✓ Form filled: ${url}\nFilled fields:\n${filled.map(f => `  • ${f}`).join('\n')}`;

    } catch (error) {
      console.error('Form filling error:', error.message);
      return `❌ Form filling failed: ${error.message}`;

    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Generate PDF from URL
   */
  async generatePDF(input, context = {}) {
    const url = this._extractURL(input);

    if (!url) {
      return '❌ No URL found. Usage: "@browser pdf https://example.com"';
    }

    let browser;
    try {
      console.log(`📄 Generating PDF of ${url}`);

      browser = await puppeteer.launch({ headless: this.headless });
      const page = await browser.newPage();

      await page.goto(url, { waitUntil: 'networkidle2', timeout: this.timeout });

      const filename = `page_${Date.now()}.pdf`;
      const filepath = path.join(this.screenshotDir, filename);

      await page.pdf({
        path: filepath,
        format: 'A4',
        printBackground: true
      });

      console.log(`✓ PDF saved: ${filepath}`);

      return `✓ PDF generated: ${url}\nSaved to: ${filepath}\nSize: ${this._getFileSize(filepath)}`;

    } catch (error) {
      console.error('PDF generation error:', error.message);
      return `❌ PDF generation failed: ${error.message}`;

    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Internal: Extract URL from input
   */
  _extractURL(input) {
    const urlMatch = input.match(/https?:\/\/[^\s]+/);
    return urlMatch ? urlMatch[0] : null;
  }

  /**
   * Internal: Extract selector from input
   */
  _extractSelector(input, action) {
    // Simple heuristic - improve with NLP if needed
    const afterAction = input.split(action)[1];
    if (!afterAction) return null;

    // Look for quoted strings
    const quoted = afterAction.match(/["']([^"']+)["']/);
    if (quoted) return quoted[1];

    // Look for CSS selectors
    const selector = afterAction.match(/[#\.][\w-]+/);
    return selector ? selector[0] : null;
  }

  /**
   * Internal: Get file size in readable format
   */
  _getFileSize(filepath) {
    const stats = fs.statSync(filepath);
    const bytes = stats.size;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}

module.exports = BrowserAgent;
