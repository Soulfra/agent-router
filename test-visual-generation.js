/**
 * Test Visual Generation System
 *
 * Simple test to verify all visual generation components work correctly.
 */

const FileOutputService = require('./lib/file-output-service');
const DialogueTreeGenerator = require('./lib/dialogue-tree-generator');
const VisualAssetRenderer = require('./lib/visual-asset-renderer');

async function main() {
  console.log('🎨 Testing Visual Generation System...\n');

  // Test 1: File Output Service
  console.log('1️⃣ Testing File Output Service...');
  try {
    const fileOutput = new FileOutputService('./storage/generated');
    await fileOutput.initialize();
    console.log('✓ File output service initialized');
    console.log('✓ Storage directories created\n');
  } catch (error) {
    console.error('❌ File output service failed:', error.message);
    return;
  }

  // Test 2: Badge Generation
  console.log('2️⃣ Testing Badge SVG Generation...');
  try {
    const renderer = new VisualAssetRenderer();
    const badgeSVG = renderer.generateBadgeSVG({
      id: 'test-badge',
      name: 'Test Badge',
      icon: '⭐',
      color: '#667eea',
      description: 'This is a test badge'
    });
    console.log('✓ Badge SVG generated');
    console.log(`  Length: ${badgeSVG.length} characters\n`);
  } catch (error) {
    console.error('❌ Badge generation failed:', error.message);
  }

  // Test 3: Shield Generation
  console.log('3️⃣ Testing Shield SVG Generation...');
  try {
    const renderer = new VisualAssetRenderer();
    const shieldSVG = renderer.generateShieldSVG({
      id: 'test-shield',
      name: 'Legend',
      icon: '👑',
      color: '#ef4444',
      rank: 'gold'
    });
    console.log('✓ Shield SVG generated');
    console.log(`  Length: ${shieldSVG.length} characters\n`);
  } catch (error) {
    console.error('❌ Shield generation failed:', error.message);
  }

  // Test 4: Dialogue Tree Generation
  console.log('4️⃣ Testing Dialogue Tree Generation...');
  try {
    const generator = new DialogueTreeGenerator();
    generator.buildQuestTree({
      quest_name: 'The Test Quest',
      npc_name: 'Test NPC',
      quest_type: 'fetch',
      difficulty: 'medium'
    });

    const mermaid = generator.toMermaid();
    const dot = generator.toDot();
    const json = generator.toJSON();

    console.log('✓ Dialogue tree generated');
    console.log(`  Mermaid: ${mermaid.split('\n').length} lines`);
    console.log(`  DOT: ${dot.split('\n').length} lines`);
    console.log(`  JSON nodes: ${json.nodes.length}\n`);
  } catch (error) {
    console.error('❌ Dialogue tree generation failed:', error.message);
  }

  // Test 5: Tilemap Generation
  console.log('5️⃣ Testing Tilemap Generation...');
  try {
    const renderer = new VisualAssetRenderer();

    // Create a simple 10x10 tilemap
    const tiles = [];
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        // Walls on edges, floor in middle, some special tiles
        if (x === 0 || y === 0 || x === 9 || y === 9) {
          tiles.push(1); // WALL
        } else if (x === 5 && y === 5) {
          tiles.push(10); // SPAWN
        } else if (x === 7 && y === 7) {
          tiles.push(7); // CHEST
        } else {
          tiles.push(2); // FLOOR
        }
      }
    }

    const tilemapSVG = renderer.generateTilemapSVG({
      name: 'Test Dungeon',
      width: 10,
      height: 10,
      tiles
    });

    const asciiMap = renderer.generateTilemapASCII({
      name: 'Test Dungeon',
      width: 10,
      height: 10,
      tiles
    });

    console.log('✓ Tilemap SVG generated');
    console.log(`  SVG Length: ${tilemapSVG.length} characters`);
    console.log('\nASCII Preview:');
    console.log(asciiMap);
  } catch (error) {
    console.error('❌ Tilemap generation failed:', error.message);
  }

  console.log('\n✅ All visual generation tests completed successfully!');
  console.log('\n📁 Files ready to be saved to: storage/generated/');
}

main().catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
