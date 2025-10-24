#!/usr/bin/env node

/**
 * Analyze and Publish CLI Tool
 *
 * End-to-end pipeline: GitHub Clone → Compact → Analyze Depth → Grade → Publish
 *
 * Usage:
 *   node bin/analyze-and-publish.js owner/repo
 *   node bin/analyze-and-publish.js project-directory/
 *   node bin/analyze-and-publish.js owner/repo --publish-issue 123
 *   node bin/analyze-and-publish.js owner/repo --publish-pr 45
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const CompactionPipeline = require('../lib/compaction-pipeline');
const GitHubPublisher = require('../lib/github-publisher');
const CodeCompactor = require('../lib/code-compactor');

// Parse arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
🚀 Analyze and Publish - End-to-End Code Analysis Pipeline

Usage:
  node bin/analyze-and-publish.js <source> [options]

Source can be:
  - GitHub repo: owner/repo
  - Local directory: path/to/project/
  - Single HTML file: path/to/file.html

Options:
  --publish-issue <num>   Publish results to GitHub issue
  --publish-pr <num>      Publish results to GitHub PR
  --create-issue          Create new GitHub issue with results
  --no-ollama             Skip Ollama AI evaluation
  --no-depth              Skip depth analysis
  --aggressive            Use aggressive minification
  --output <file>         Save report to file

Examples:
  # Analyze GitHub repo
  node bin/analyze-and-publish.js anthropics/anthropic-sdk-python

  # Analyze and publish to issue
  node bin/analyze-and-publish.js myorg/myrepo --publish-issue 42

  # Analyze local project
  node bin/analyze-and-publish.js examples/tilemap-game/

  # Analyze and create new issue
  node bin/analyze-and-publish.js examples/tilemap-game/ --create-issue

Pipeline Stages:
  1. 📥 INTAKE    - Clone from GitHub or load local files
  2. 🗜️  COMPACT   - Minify HTML/CSS/JS (60-70% reduction)
  3. 📦 PREPROCESS - Separate visual/logic/audio tracks
  4. 🔍 ANALYZE   - Depth analysis & difficulty ranking
  5. 📊 GRADE     - Multi-track grading (visual, logic, audio)
  6. 🤖 OLLAMA    - AI-based evaluation (optional)
  7. 📤 OUTTAKE   - Publish results to GitHub
`);
  process.exit(0);
}

// Extract options
const source = args.find(arg => !arg.startsWith('--'));
const options = {
  publishIssue: args.includes('--publish-issue') ? args[args.indexOf('--publish-issue') + 1] : null,
  publishPR: args.includes('--publish-pr') ? args[args.indexOf('--publish-pr') + 1] : null,
  createIssue: args.includes('--create-issue'),
  useOllama: !args.includes('--no-ollama'),
  useDepth: !args.includes('--no-depth'),
  aggressive: args.includes('--aggressive'),
  output: args.includes('--output') ? args[args.indexOf('--output') + 1] : null
};

if (!source) {
  console.error('❌ Error: Source required (GitHub repo or local path)');
  console.error('Usage: node bin/analyze-and-publish.js <source>');
  process.exit(1);
}

/**
 * Clone GitHub repo to temp directory
 */
async function cloneRepo(repo) {
  console.log(`📥 Cloning ${repo}...`);

  const tempDir = path.join('/tmp', `calos-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const proc = spawn('gh', ['repo', 'clone', repo, tempDir]);

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Cloned to ${tempDir}`);
        resolve({ path: tempDir, repo });
      } else {
        reject(new Error(`Failed to clone: ${stderr}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Load project from local directory or file
 */
async function loadProject(sourcePath) {
  const fullPath = path.resolve(process.cwd(), sourcePath);

  try {
    const stats = await fs.stat(fullPath);

    if (stats.isFile()) {
      // Single HTML file
      console.log(`📂 Loading file: ${sourcePath}`);
      const content = await fs.readFile(fullPath, 'utf-8');
      const compactor = new CodeCompactor();
      const extracted = compactor.extractFromHTML(content);

      return {
        html: extracted.html,
        css: extracted.css,
        js: extracted.js,
        title: path.basename(fullPath, path.extname(fullPath)),
        source: fullPath,
        type: 'file'
      };

    } else if (stats.isDirectory()) {
      // Directory - look for HTML, CSS, JS files
      console.log(`📂 Loading directory: ${sourcePath}`);
      const files = await fs.readdir(fullPath);

      const project = {
        html: '',
        css: '',
        js: '',
        title: path.basename(fullPath),
        source: fullPath,
        type: 'directory'
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

      // Extract embedded CSS/JS from HTML if needed
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
  console.log('🚀 Analyze and Publish - End-to-End Pipeline');
  console.log('═'.repeat(60));
  console.log('');

  let project = null;
  let repoInfo = null;
  let tempDir = null;

  try {
    // Stage 1: INTAKE - Clone or load project
    if (source.includes('/') && !source.startsWith('.') && !source.startsWith('/')) {
      // Looks like a GitHub repo (owner/repo)
      const cloneResult = await cloneRepo(source);
      project = await loadProject(cloneResult.path);
      repoInfo = { repo: source, url: `https://github.com/${source}` };
      tempDir = cloneResult.path;
    } else {
      // Local file or directory
      project = await loadProject(source);
    }

    console.log(`✅ Loaded project: ${project.title}`);
    console.log(`   HTML: ${project.html.length} bytes`);
    console.log(`   CSS:  ${project.css.length} bytes`);
    console.log(`   JS:   ${project.js.length} bytes`);
    console.log('');

    // Stage 2-6: Run compaction pipeline
    const pipeline = new CompactionPipeline({
      useOllama: options.useOllama,
      useLocalGraders: true,
      useDepthAnalysis: options.useDepth,
      aggressive: options.aggressive
    });

    console.log('🚀 Running analysis pipeline...');
    console.log('═'.repeat(60));
    console.log('');

    const result = await pipeline.run(project);

    // Generate report
    const report = pipeline.generateReport(result);

    // Display report
    console.log('');
    console.log(report);

    // Save to file if requested
    if (options.output) {
      const outputPath = path.resolve(process.cwd(), options.output);
      await fs.writeFile(outputPath, report, 'utf-8');
      console.log(`\n💾 Report saved to: ${outputPath}`);
    }

    // Stage 7: OUTTAKE - Publish to GitHub
    if (options.publishIssue || options.publishPR || options.createIssue) {
      console.log('');
      console.log('📤 Publishing results to GitHub...');

      if (!repoInfo) {
        console.warn('⚠️  Warning: Cannot publish - source is not a GitHub repo');
      } else {
        const publisher = new GitHubPublisher();

        try {
          if (options.publishIssue) {
            const issueNum = parseInt(options.publishIssue);
            const published = await publisher.publishToIssue(
              repoInfo.repo,
              issueNum,
              result
            );
            console.log(`✅ Published to issue: ${published.url}`);
          }

          if (options.publishPR) {
            const prNum = parseInt(options.publishPR);
            const published = await publisher.publishToPR(
              repoInfo.repo,
              prNum,
              result
            );
            console.log(`✅ Published to PR: ${published.url}`);
          }

          if (options.createIssue) {
            const title = `Code Analysis Report: ${project.title}`;
            const labels = ['analysis', 'automated'];

            const published = await publisher.createIssue(
              repoInfo.repo,
              title,
              result,
              labels
            );
            console.log(`✅ Created issue: ${published.url}`);
          }

        } catch (error) {
          console.error(`❌ Failed to publish: ${error.message}`);
        }
      }
    }

    // Cleanup temp directory
    if (tempDir) {
      console.log('');
      console.log('🧹 Cleaning up temp directory...');
      await fs.rm(tempDir, { recursive: true, force: true });
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

    // Cleanup temp directory on error
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors
      }
    }

    process.exit(1);
  }
}

// Run main
main();
