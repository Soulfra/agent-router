#!/usr/bin/env node

/**
 * Compact and Grade CLI Tool
 *
 * Usage:
 *   node bin/compact-and-grade.js <path-to-project>
 *   node bin/compact-and-grade.js examples/tilemap-game/
 *   node bin/compact-and-grade.js project.html
 *
 * Options:
 *   --no-ollama          Skip Ollama AI evaluation
 *   --no-local           Skip local grading
 *   --aggressive         Use aggressive minification
 *   --output <file>      Save report to file
 */

const fs = require('fs').promises;
const path = require('path');
const CompactionPipeline = require('../lib/compaction-pipeline');
const CodeCompactor = require('../lib/code-compactor');

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
🚀 Compact and Grade - Code Compaction & AI Evaluation Tool

Usage:
  node bin/compact-and-grade.js <path-to-project> [options]

Examples:
  # Compact and grade a directory
  node bin/compact-and-grade.js examples/tilemap-game/

  # Compact and grade a single HTML file
  node bin/compact-and-grade.js project.html

  # Skip Ollama evaluation
  node bin/compact-and-grade.js project.html --no-ollama

  # Save report to file
  node bin/compact-and-grade.js project.html --output report.txt

Options:
  --no-ollama          Skip Ollama AI evaluation (faster, local only)
  --no-local           Skip local grading (AI only)
  --aggressive         Use aggressive minification (single-line code)
  --output <file>      Save report to file
  --help, -h           Show this help message

Pipeline Stages:
  1. 🗜️  Compaction    - Minify HTML, CSS, JS (remove whitespace, comments)
  2. 📦 Preprocessing  - Separate content into visual/logic/audio tracks
  3. 📊 Local Grading  - Math-based grading (color theory, algorithms)
  4. 🤖 Ollama AI      - Soulfra model evaluation (brand-aware)

Requirements:
  - Ollama running (ollama serve) if using --ollama
  - Soulfra model installed (ollama create soulfra-model -f ollama-models/soulfra-model)
`);
  process.exit(0);
}

// Extract options
const projectPath = args.find(arg => !arg.startsWith('--'));
const options = {
  useOllama: !args.includes('--no-ollama'),
  useLocalGraders: !args.includes('--no-local'),
  aggressive: args.includes('--aggressive'),
  outputFile: args.includes('--output') ? args[args.indexOf('--output') + 1] : null
};

if (!projectPath) {
  console.error('❌ Error: Project path required');
  console.error('Usage: node bin/compact-and-grade.js <path-to-project>');
  process.exit(1);
}

/**
 * Load project from path (file or directory)
 */
async function loadProject(projectPath) {
  const fullPath = path.resolve(process.cwd(), projectPath);

  try {
    const stats = await fs.stat(fullPath);

    if (stats.isFile()) {
      // Single HTML file
      const content = await fs.readFile(fullPath, 'utf-8');
      const compactor = new CodeCompactor();
      const extracted = compactor.extractFromHTML(content);

      return {
        html: extracted.html,
        css: extracted.css,
        js: extracted.js,
        title: path.basename(fullPath, path.extname(fullPath)),
        source: 'file'
      };

    } else if (stats.isDirectory()) {
      // Directory - look for HTML, CSS, JS files
      const files = await fs.readdir(fullPath);

      const project = {
        html: '',
        css: '',
        js: '',
        title: path.basename(fullPath),
        source: 'directory'
      };

      for (const file of files) {
        const filePath = path.join(fullPath, file);
        const ext = path.extname(file).toLowerCase();

        try {
          const content = await fs.readFile(filePath, 'utf-8');

          switch (ext) {
            case '.html':
            case '.htm':
              project.html += content + '\n';
              break;

            case '.css':
              project.css += content + '\n';
              break;

            case '.js':
              project.js += content + '\n';
              break;
          }
        } catch (err) {
          // Skip files that can't be read
          continue;
        }
      }

      // If HTML contains embedded CSS/JS, extract them
      if (project.html && (!project.css || !project.js)) {
        const compactor = new CodeCompactor();
        const extracted = compactor.extractFromHTML(project.html);

        if (!project.css && extracted.css) {
          project.css = extracted.css;
        }

        if (!project.js && extracted.js) {
          project.js = extracted.js;
        }
      }

      return project;

    } else {
      throw new Error('Invalid path: must be file or directory');
    }

  } catch (error) {
    throw new Error(`Failed to load project: ${error.message}`);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Compact and Grade - Code Compaction & AI Evaluation');
  console.log('═'.repeat(60));
  console.log('');

  try {
    // Load project
    console.log(`📂 Loading project from: ${projectPath}`);
    const project = await loadProject(projectPath);

    console.log(`✅ Loaded ${project.source}: ${project.title}`);
    console.log(`   HTML: ${project.html.length} bytes`);
    console.log(`   CSS:  ${project.css.length} bytes`);
    console.log(`   JS:   ${project.js.length} bytes`);
    console.log('');

    // Create pipeline
    const pipeline = new CompactionPipeline({
      useOllama: options.useOllama,
      useLocalGraders: options.useLocalGraders,
      aggressive: options.aggressive
    });

    // Run pipeline
    console.log('🚀 Running pipeline...');
    console.log('═'.repeat(60));
    console.log('');

    const result = await pipeline.run(project);

    // Generate report
    const report = pipeline.generateReport(result);

    // Display report
    console.log('');
    console.log(report);

    // Save to file if requested
    if (options.outputFile) {
      const outputPath = path.resolve(process.cwd(), options.outputFile);
      await fs.writeFile(outputPath, report, 'utf-8');
      console.log(`\n💾 Report saved to: ${outputPath}`);
    }

    // Save HTML5 file if compaction succeeded
    if (result.stages.compaction && result.stages.compaction.html5File) {
      const html5Path = path.join(
        path.dirname(path.resolve(projectPath)),
        `${project.title}-compacted.html`
      );

      await fs.writeFile(html5Path, result.stages.compaction.html5File, 'utf-8');
      console.log(`💾 Compacted HTML5 saved to: ${html5Path}`);
    }

    // Exit with appropriate code
    if (result.errors && result.errors.length > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    console.error('');

    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// Run main
main();
