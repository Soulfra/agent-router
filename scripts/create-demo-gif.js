#!/usr/bin/env node
/**
 * Create Demo GIF with Varied Annotations
 *
 * Proves the GIF pipeline works by creating 5 frames with different annotations
 * on the same base screenshot. Each frame highlights a different step.
 *
 * Usage:
 *   node scripts/create-demo-gif.js
 */

const path = require('path');
const ScreenshotAnnotator = require('../lib/screenshot-annotator');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function createDemoGIF() {
  console.log('🎬 Creating Demo GIF with Varied Annotations\n');

  const baseScreenshot = path.join(__dirname, '../oauth-screenshots/github-2025-10-20/base-screenshot.png');
  const outputDir = path.join(__dirname, '../oauth-exports/demo');
  const annotator = new ScreenshotAnnotator();

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Define 5 different annotation configs (different positions, colors, styles)
  const annotationConfigs = [
    {
      step: 1,
      title: 'Step 1: Navigate to Settings',
      annotations: [{
        annotation_type: 'box',
        position: { x: 50, y: 50, width: 250, height: 80 },
        color: '#00ff00',
        text_content: '1. Settings',
        style: 'solid'
      }]
    },
    {
      step: 2,
      title: 'Step 2: Open Developer Settings',
      annotations: [{
        annotation_type: 'box',
        position: { x: 20, y: 200, width: 200, height: 400 },
        color: '#ff6600',
        text_content: '2. Developer Settings',
        style: 'dashed'
      }]
    },
    {
      step: 3,
      title: 'Step 3: Click New OAuth App',
      annotations: [{
        annotation_type: 'box',
        position: { x: 400, y: 150, width: 350, height: 90 },
        color: '#0099ff',
        text_content: '3. New OAuth App',
        style: 'pulse'
      }]
    },
    {
      step: 4,
      title: 'Step 4: Fill Application Form',
      annotations: [{
        annotation_type: 'box',
        position: { x: 300, y: 250, width: 700, height: 350 },
        color: '#ff0099',
        text_content: '4. Fill Form Fields',
        style: 'solid'
      }]
    },
    {
      step: 5,
      title: 'Step 5: Copy OAuth Credentials',
      annotations: [{
        annotation_type: 'box',
        position: { x: 350, y: 600, width: 600, height: 120 },
        color: '#ffff00',
        text_content: '5. Copy Client ID & Secret',
        style: 'pulse'
      }]
    }
  ];

  console.log(`📸 Base screenshot: ${path.basename(baseScreenshot)}\n`);

  // Create annotated frames
  const frames = [];
  for (let i = 0; i < annotationConfigs.length; i++) {
    const config = annotationConfigs[i];
    const outputPath = path.join(outputDir, `frame-${i + 1}.png`);

    console.log(`   Frame ${i + 1}/5: ${config.title}`);

    await annotator.annotate(baseScreenshot, config.annotations, outputPath);

    frames.push({
      path: outputPath,
      frameNumber: i,
      timestamp: i * 2000 // 2 seconds per frame
    });
  }

  console.log(`\n✓ Created ${frames.length} annotated frames\n`);

  // Create filelist for FFmpeg
  const fileListPath = path.join(outputDir, 'filelist.txt');
  const frameDuration = 0.5; // 2 FPS
  const fileListContent = frames
    .map(f => `file '${path.resolve(f.path)}'\nduration ${frameDuration}`)
    .join('\n') + `\nfile '${path.resolve(frames[frames.length - 1].path)}'`;

  await fs.writeFile(fileListPath, fileListContent);

  console.log('🎨 Generating GIF with FFmpeg...\n');

  // Generate palette
  const paletteFile = path.join(outputDir, 'palette.png');
  const paletteCmd = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -vf "scale=1200:-1:flags=lanczos,palettegen" -y "${paletteFile}"`;

  console.log('   Creating color palette...');
  await execAsync(paletteCmd);

  // Create GIF
  const gifPath = path.join(outputDir, '../github-tutorial-demo.gif');
  const gifCmd = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -i "${paletteFile}" -filter_complex "scale=1200:-1:flags=lanczos[x];[x][1:v]paletteuse" -y "${gifPath}"`;

  console.log('   Generating GIF...');
  await execAsync(gifCmd);

  // Get file size
  const stats = await fs.stat(gifPath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`\n✅ Success!\n`);
  console.log(`   Output: ${path.relative(process.cwd(), gifPath)}`);
  console.log(`   Size: ${fileSizeMB} MB`);
  console.log(`   Frames: ${frames.length}`);
  console.log(`   Duration: ${(frames.length * frameDuration).toFixed(1)}s\n`);

  // Open the GIF
  if (process.platform === 'darwin') {
    console.log('🎉 Opening GIF...\n');
    await execAsync(`open "${gifPath}"`);
  }

  return gifPath;
}

// Run if called directly
if (require.main === module) {
  createDemoGIF()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = createDemoGIF;
