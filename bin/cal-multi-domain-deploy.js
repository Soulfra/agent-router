#!/usr/bin/env node
/**
 * Cal Multi-Domain Deploy
 *
 * Template-based deployment to ALL verified domains at once
 * Uses {{domain}} variables like Word mail merge
 *
 * Usage:
 *   npm run cal:domains
 *   node bin/cal-multi-domain-deploy.js --domains="calriven.com,soulfra.com"
 */

const DomainVerifier = require('../lib/domain-verifier');
const E2ETestRunner = require('../lib/e2e-test-runner');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const chalk = require('chalk');

const execAsync = promisify(exec);

class CalMultiDomainDeploy {
  constructor() {
    this.domainVerifier = new DomainVerifier();
    this.deploymentResults = [];
    this.testResults = [];
  }

  async execute(options = {}) {
    console.log(chalk.cyan.bold('\n🌐 Cal Multi-Domain Deployment System\n'));
    console.log(chalk.gray('─'.repeat(80)));

    try {
      // Step 1: Verify domains
      const domains = await this.getVerifiedDomains(options.domains);

      // Step 2: Deploy to each domain
      for (const domain of domains) {
        await this.deployToDomain(domain);
      }

      // Step 3: Test all deployed sites
      await this.testAllDeployments();

      // Step 4: Report
      this.report();

      return {
        success: this.deploymentResults.every(r => r.success),
        deployed: this.deploymentResults.length,
        tested: this.testResults.length
      };

    } catch (error) {
      console.error(chalk.red('\n❌ Deployment failed:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Get verified domains
   */
  async getVerifiedDomains(domainList) {
    console.log(chalk.yellow('\n📋 Step 1: Verifying Domains\n'));

    let domainsToVerify;

    if (domainList) {
      // User provided specific domains
      domainsToVerify = domainList.split(',').map(d => d.trim());
      console.log(chalk.gray(`   User specified: ${domainsToVerify.join(', ')}`));
    } else {
      // Use all known domains
      domainsToVerify = this.domainVerifier.knownDomains;
      console.log(chalk.gray(`   Using all ${domainsToVerify.length} known domains`));
    }

    const verified = [];

    for (const domain of domainsToVerify) {
      const result = await this.domainVerifier.verify(domain);
      if (result.verified) {
        verified.push(domain);
        console.log(chalk.green(`   ✅ ${domain}`));
      } else {
        console.log(chalk.red(`   ❌ ${domain} - ${result.error}`));
      }
    }

    console.log(chalk.green(`\n✅ Verified ${verified.length}/${domainsToVerify.length} domains\n`));

    return verified;
  }

  /**
   * Deploy to a single domain using templates
   */
  async deployToDomain(domain) {
    console.log(chalk.yellow(`\n🚀 Step 2: Deploying to ${domain}\n`));

    const startTime = Date.now();

    try {
      // Create domain-specific files using templates
      const subdomain = `lessons.${domain}`;

      // Update CNAME
      await this.replaceTemplate('public/CNAME', {
        domain: subdomain
      });

      // Update sitemap
      await this.replaceTemplate('public/sitemap.xml', {
        domain: subdomain
      });

      console.log(chalk.gray(`   ✅ Updated CNAME and sitemap for ${subdomain}`));

      // Commit and push (if git configured)
      try {
        await execAsync(`git add public/CNAME public/sitemap.xml`);
        await execAsync(`git commit -m "Deploy to ${subdomain}" || echo "No changes"`);
        await execAsync(`git push origin main`);

        console.log(chalk.green(`   ✅ Pushed to GitHub`));

        this.deploymentResults.push({
          domain,
          subdomain,
          success: true,
          duration: Date.now() - startTime,
          url: `https://${subdomain}/lessons`,
          timestamp: new Date().toISOString()
        });

      } catch (gitError) {
        console.log(chalk.yellow(`   ⚠️  Git push skipped: ${gitError.message}`));

        this.deploymentResults.push({
          domain,
          subdomain,
          success: false,
          error: gitError.message,
          duration: Date.now() - startTime
        });
      }

    } catch (error) {
      console.error(chalk.red(`   ❌ Deployment failed: ${error.message}`));

      this.deploymentResults.push({
        domain,
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Replace template variables in a file
   */
  async replaceTemplate(filePath, variables) {
    let content = await fs.readFile(filePath, 'utf8');

    // Replace {{domain}} with actual domain
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      content = content.replace(regex, value);

      // Also replace literal domain references
      if (key === 'domain') {
        // Replace lessons.calriven.com → lessons.{{new_domain}}
        content = content.replace(/lessons\.calriven\.com/g, value);
        content = content.replace(/lessons\.soulfra\.com/g, value);
        content = content.replace(/lessons\.deathtodata\.com/g, value);
      }
    }

    await fs.writeFile(filePath, content, 'utf8');
  }

  /**
   * Test all deployed sites
   */
  async testAllDeployments() {
    console.log(chalk.yellow('\n🧪 Step 3: Testing Deployed Sites\n'));

    // Wait for GitHub Pages to deploy
    console.log(chalk.gray('   Waiting 60s for GitHub Pages...\n'));
    await new Promise(resolve => setTimeout(resolve, 60000));

    for (const deployment of this.deploymentResults.filter(d => d.success)) {
      console.log(chalk.gray(`   Testing: ${deployment.url}`));

      try {
        const runner = new E2ETestRunner({
          domain: deployment.subdomain,
          screenshotDir: `./test-results/domains/${deployment.domain}`
        });

        const testResult = await runner.runAllTests();

        this.testResults.push({
          domain: deployment.domain,
          url: deployment.url,
          success: testResult.success,
          tests: testResult.tests
        });

        if (testResult.success) {
          console.log(chalk.green(`   ✅ All tests passed`));
        } else {
          console.log(chalk.yellow(`   ⚠️  Some tests failed`));
        }

      } catch (error) {
        console.error(chalk.red(`   ❌ Testing failed: ${error.message}`));

        this.testResults.push({
          domain: deployment.domain,
          url: deployment.url,
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Report results
   */
  report() {
    console.log(chalk.gray('\n' + '─'.repeat(80)));
    console.log(chalk.cyan.bold('\n📊 Multi-Domain Deployment Report\n'));
    console.log(chalk.gray('─'.repeat(80)));

    // Deployments
    console.log(chalk.white.bold('\n🚀 Deployments:\n'));
    this.deploymentResults.forEach(d => {
      if (d.success) {
        console.log(chalk.green(`   ✅ ${d.domain}`));
        console.log(chalk.gray(`      URL: ${d.url}`));
        console.log(chalk.gray(`      Duration: ${d.duration}ms`));
      } else {
        console.log(chalk.red(`   ❌ ${d.domain}`));
        console.log(chalk.gray(`      Error: ${d.error}`));
      }
    });

    // Tests
    console.log(chalk.white.bold('\n🧪 Live Site Tests:\n'));
    this.testResults.forEach(t => {
      if (t.success) {
        console.log(chalk.green(`   ✅ ${t.domain} - All tests passed`));
      } else {
        console.log(chalk.yellow(`   ⚠️  ${t.domain} - Some tests failed`));
      }
    });

    // Summary
    const deployed = this.deploymentResults.filter(d => d.success).length;
    const tested = this.testResults.filter(t => t.success).length;

    console.log(chalk.white.bold('\n📈 Summary:\n'));
    console.log(chalk.white(`   Deployed: ${deployed}/${this.deploymentResults.length}`));
    console.log(chalk.white(`   Tested: ${tested}/${this.testResults.length}`));

    console.log(chalk.gray('\n' + '─'.repeat(80)));
    console.log(chalk.cyan.bold('\n✨ Cal Multi-Domain Deploy Complete!\n'));
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const domainsArg = args.find(a => a.startsWith('--domains='));
  const domains = domainsArg ? domainsArg.split('=')[1] : null;

  const deployer = new CalMultiDomainDeploy();
  deployer.execute({ domains })
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = CalMultiDomainDeploy;
