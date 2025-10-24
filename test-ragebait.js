#!/usr/bin/env node
/**
 * Test Ragebait Generator
 *
 * Quick test to generate a dev ragebait GIF
 */

const DevRagebaitGenerator = require('./lib/dev-ragebait-generator');

async function test() {
  console.log('🔥 Testing Dev Ragebait Generator\n');

  const generator = new DevRagebaitGenerator();

  // List templates
  console.log('📋 Available Templates:');
  const templates = generator.getTemplates();
  templates.forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.name} - ${t.description}`);
  });

  console.log('\n🎨 Generating "npm install" ragebait...\n');

  try {
    const result = await generator.generate('npm-install');

    console.log('\n✅ Success!');
    console.log(`   GIF: ${result.path}`);
    console.log(`   Size: ${result.sizeMB} MB`);
    console.log(`   Frames: ${result.frames}`);
    console.log(`   Caption: ${result.caption}`);
    console.log(`   Hashtags: ${result.hashtags.join(', ')}`);

    // Open the GIF
    const { exec } = require('child_process');
    if (process.platform === 'darwin') {
      exec(`open "${result.path}"`);
      console.log('\n🎉 Opening GIF...');
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
  }
}

test();
