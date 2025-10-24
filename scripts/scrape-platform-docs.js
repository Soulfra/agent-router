#!/usr/bin/env node

/**
 * Platform Documentation Scraper CLI
 *
 * Usage:
 *   node scripts/scrape-platform-docs.js magento
 *   node scripts/scrape-platform-docs.js shopify
 *   node scripts/scrape-platform-docs.js woocommerce
 *   node scripts/scrape-platform-docs.js --all
 */

const MagentoScraper = require('../lib/scrapers/magento-scraper');

async function main() {
  const args = process.argv.slice(2);
  const platform = args[0] || 'magento';

  console.log('='.repeat(60));
  console.log('  CALOS Platform Documentation Scraper');
  console.log('='.repeat(60));
  console.log();

  if (platform === 'magento' || platform === '--all') {
    console.log('[CLI] Scraping Magento documentation...');
    const scraper = new MagentoScraper({ verbose: true });

    try {
      const result = await scraper.runFullScrape({
        maxPages: 50,
        maxDepth: 2
      });

      console.log();
      console.log('✅ Magento scrape complete!');
      console.log(`   Pages: ${result.organizedDocs.allPages.length}`);
      console.log(`   Questions: ${result.examQuestions.length}`);
      console.log(`   Topics covered: ${Object.keys(result.organizedDocs.pagesByTopic).length}`);
      console.log();
    } catch (error) {
      console.error('❌ Magento scrape failed:', error.message);
      process.exit(1);
    }
  }

  if (platform === 'shopify' || platform === '--all') {
    console.log('[CLI] Shopify scraper not yet implemented');
  }

  if (platform === 'woocommerce' || platform === '--all') {
    console.log('[CLI] WooCommerce scraper not yet implemented');
  }

  console.log();
  console.log('='.repeat(60));
  console.log('  Scraping complete! Check temp/scraped-docs/ for output');
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
