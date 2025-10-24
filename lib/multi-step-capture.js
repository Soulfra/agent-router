#!/usr/bin/env node
/**
 * Multi-Step Screenshot Capture
 *
 * Captures multiple screenshots as it walks through a multi-step process
 * - Uses doc-parser.js to get structured steps
 * - Navigates through each step with Puppeteer
 * - Takes screenshot BEFORE and AFTER each action
 * - Stores screenshots with step numbers
 * - Auto-generates annotations for each step
 *
 * Usage:
 *   const capture = new MultiStepCapture();
 *   await capture.captureFlow('github', steps);
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const DocParser = require('./doc-parser');

class MultiStepCapture {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.screenshotDir = options.screenshotDir || path.join(__dirname, '..', 'oauth-screenshots');
    this.slowMo = options.slowMo || 500; // Slow down actions for better screenshots
    this.docParser = new DocParser();
  }

  /**
   * Ensure output directory exists
   */
  async ensureDirectory(dir) {
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Capture entire OAuth setup flow for a provider
   */
  async captureFlow(provider, options = {}) {
    console.log(`\n🎬 Multi-Step Capture: ${provider.toUpperCase()}`);
    console.log('='.repeat(50));

    // Parse steps from documentation
    const steps = await this.docParser.parseOAuthGuide(provider);
    console.log(`📚 Parsed ${steps.length} steps from documentation\n`);

    // Create provider-specific directory
    const timestamp = new Date().toISOString().split('T')[0];
    const providerDir = path.join(this.screenshotDir, `${provider}-${timestamp}`);
    await this.ensureDirectory(providerDir);

    const browser = await puppeteer.launch({
      headless: this.headless,
      slowMo: this.slowMo,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1400, height: 900 }
    });

    const screenshots = [];

    try {
      const page = await browser.newPage();

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        console.log(`\n📍 Step ${step.number}/${steps.length}: ${step.title}`);

        // Navigate to URL if specified
        if (step.url) {
          console.log(`   Navigating to: ${step.url}`);
          try {
            await page.goto(step.url, {
              waitUntil: 'networkidle2',
              timeout: 30000
            });
            await page.waitForTimeout(2000); // Wait for any dynamic content
          } catch (error) {
            console.log(`   ⚠ Navigation warning: ${error.message}`);
            console.log(`   Continuing with current page...`);
          }
        }

        // Take screenshot BEFORE action
        const beforePath = path.join(providerDir, `${provider}-step-${step.number}-before.png`);
        await page.screenshot({ path: beforePath, fullPage: false });
        console.log(`   ✓ Screenshot (before): ${path.basename(beforePath)}`);

        screenshots.push({
          step: step.number,
          type: 'before',
          path: beforePath,
          title: step.title,
          description: step.actions[0]?.raw || ''
        });

        // Try to perform actions (if possible without authentication)
        let actionPerformed = false;
        for (const action of step.actions) {
          if (action.type === 'click') {
            const clicked = await this.tryClick(page, action.target);
            if (clicked) {
              actionPerformed = true;
              console.log(`   ✓ Clicked: ${action.target}`);
              await page.waitForTimeout(1500);
              break;
            }
          }
        }

        // Take screenshot AFTER action (or just wait a bit)
        if (!actionPerformed) {
          await page.waitForTimeout(1000);
        }

        const afterPath = path.join(providerDir, `${provider}-step-${step.number}-after.png`);
        await page.screenshot({ path: afterPath, fullPage: false });
        console.log(`   ✓ Screenshot (after): ${path.basename(afterPath)}`);

        screenshots.push({
          step: step.number,
          type: 'after',
          path: afterPath,
          title: step.title,
          description: step.actions[0]?.raw || ''
        });
      }

      console.log(`\n✅ Capture complete!`);
      console.log(`   Total screenshots: ${screenshots.length}`);
      console.log(`   Output directory: ${providerDir}`);

      return {
        success: true,
        provider,
        steps: steps.length,
        screenshots,
        directory: providerDir
      };

    } catch (error) {
      console.error(`\n❌ Capture failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Try to click an element by text content
   * Returns true if successful
   */
  async tryClick(page, text) {
    try {
      // Try different selector strategies
      const selectors = [
        `button::-p-text(${text})`,
        `a::-p-text(${text})`,
        `*[aria-label*="${text}"]`,
        `button[title*="${text}"]`
      ];

      for (const selector of selectors) {
        try {
          await page.click(selector, { timeout: 2000 });
          return true;
        } catch {
          // Try next selector
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Capture screenshots for demonstration (public pages only)
   * This doesn't actually create OAuth apps, just documents the UI
   */
  async capturePublicPages(provider) {
    console.log(`\n📸 Capturing Public Pages: ${provider.toUpperCase()}`);

    const steps = await this.docParser.parseOAuthGuide(provider);
    const timestamp = new Date().toISOString().split('T')[0];
    const providerDir = path.join(this.screenshotDir, `${provider}-${timestamp}`);
    await this.ensureDirectory(providerDir);

    const browser = await puppeteer.launch({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1400, height: 900 }
    });

    const screenshots = [];

    try {
      const page = await browser.newPage();

      // Only capture landing pages (steps with URLs that are publicly accessible)
      const publicSteps = steps.filter(step => step.url);

      for (const step of publicSteps) {
        console.log(`\n📍 ${step.title}`);
        console.log(`   URL: ${step.url}`);

        try {
          await page.goto(step.url, {
            waitUntil: 'networkidle2',
            timeout: 30000
          });
          await page.waitForTimeout(2000);

          const screenshotPath = path.join(providerDir, `${provider}-step-${step.number}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });

          console.log(`   ✓ Screenshot: ${path.basename(screenshotPath)}`);

          screenshots.push({
            step: step.number,
            path: screenshotPath,
            title: step.title,
            url: step.url
          });
        } catch (error) {
          console.log(`   ⚠ Could not access: ${error.message}`);
        }
      }

      console.log(`\n✅ Public page capture complete!`);
      console.log(`   Screenshots: ${screenshots.length}`);

      return {
        success: true,
        provider,
        screenshots,
        directory: providerDir
      };

    } catch (error) {
      console.error(`\n❌ Capture failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    } finally {
      await browser.close();
    }
  }
}

// CLI interface
if (require.main === module) {
  const provider = process.argv[2] || 'github';
  const mode = process.argv[3] || 'public'; // 'public' or 'full'

  const capture = new MultiStepCapture({ headless: true });

  const run = async () => {
    if (mode === 'full') {
      return await capture.captureFlow(provider);
    } else {
      return await capture.capturePublicPages(provider);
    }
  };

  run()
    .then(result => {
      if (result.success) {
        console.log('\n✅ Success!');
        process.exit(0);
      } else {
        console.error('\n❌ Failed!');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = MultiStepCapture;
