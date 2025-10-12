#!/usr/bin/env node

/**
 * Soulfra Code Generator CLI
 *
 * Generate production-ready code in any language from specifications.
 *
 * Usage:
 *   generate-code <spec-file> <language> [options]
 *
 * Examples:
 *   generate-code api-spec.md python --output ./generated
 *   generate-code model.json javascript --output ./src
 *   generate-code functions.yaml rust --output ./lib
 */

const fs = require('fs');
const path = require('path');
const CodeGenerator = require('../lib/code-generator');

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printUsage() {
  log('\n⚡ Soulfra Code Generator', 'blue');
  log('════════════════════════════════════════\n', 'blue');

  log('Usage:', 'cyan');
  log('  generate-code <spec-file> <language> [options]\n', 'white');

  log('Supported Languages:', 'cyan');
  log('  python, lua, javascript, typescript', 'white');
  log('  csharp, ruby, go, rust, cobol', 'white');
  log('  java, php, swift, kotlin\n', 'white');

  log('Options:', 'cyan');
  log('  --output <dir>    Output directory (default: ./generated)', 'white');
  log('  --force           Overwrite existing files', 'white');
  log('  --no-tests        Skip test generation', 'white');
  log('  --no-docs         Skip documentation generation\n', 'white');

  log('Examples:', 'cyan');
  log('  # Generate Python code from markdown spec', 'yellow');
  log('  generate-code api-spec.md python --output ./src\n', 'yellow');

  log('  # Generate JavaScript from JSON schema', 'yellow');
  log('  generate-code model.json javascript\n', 'yellow');

  log('  # Generate Rust library', 'yellow');
  log('  generate-code lib-spec.md rust --output ./lib\n', 'yellow');

  log('Spec Format:', 'cyan');
  log('  Markdown, JSON, or YAML files describing:', 'white');
  log('    - Functions/methods to generate', 'white');
  log('    - API endpoints', 'white');
  log('    - Data models/schemas', 'white');
  log('    - Classes/modules\n', 'white');
}

async function main() {
  const args = {
    specFile: null,
    language: null,
    output: './generated',
    force: false,
    tests: true,
    docs: true
  };

  // Parse arguments
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);

      if (key === 'output') {
        args.output = process.argv[++i];
      } else if (key === 'force') {
        args.force = true;
      } else if (key === 'no-tests') {
        args.tests = false;
      } else if (key === 'no-docs') {
        args.docs = false;
      }
    } else {
      if (!args.specFile) {
        args.specFile = arg;
      } else if (!args.language) {
        args.language = arg;
      }
    }
  }

  // Validate arguments
  if (!args.specFile || !args.language) {
    printUsage();
    process.exit(1);
  }

  if (!fs.existsSync(args.specFile)) {
    log(`\n❌ Error: Spec file not found: ${args.specFile}`, 'red');
    process.exit(1);
  }

  // Check if output directory exists
  if (fs.existsSync(args.output) && !args.force) {
    log(`\n⚠️  Output directory exists: ${args.output}`, 'yellow');
    log('Use --force to overwrite', 'yellow');
    process.exit(1);
  }

  log('\n⚡ Soulfra Code Generator', 'blue');
  log('════════════════════════════════════════', 'blue');

  log(`\nSpec File: ${args.specFile}`, 'cyan');
  log(`Language: ${args.language}`, 'cyan');
  log(`Output: ${args.output}`, 'cyan');

  // Read specification
  log('\n1️⃣  Reading specification...', 'yellow');
  const specContent = fs.readFileSync(args.specFile, 'utf8');

  // Create generator
  const generator = new CodeGenerator({
    generateTests: args.tests,
    generateDocs: args.docs
  });

  // Generate code
  log('2️⃣  Generating code...', 'yellow');

  try {
    const result = await generator.generate(specContent, args.language, args.output);

    log('✅ Code generation complete!', 'green');

    log('\n📊 Summary:', 'blue');
    log(`   Language: ${result.language}`, 'cyan');
    log(`   Output: ${result.outputDir}`, 'cyan');
    log(`   Source files: ${result.summary.sourceFiles}`, 'cyan');
    log(`   Test files: ${result.summary.testFiles}`, 'cyan');
    log(`   Doc files: ${result.summary.docFiles}`, 'cyan');
    log(`   Config files: ${result.summary.configFiles}`, 'cyan');

    log('\n📁 Generated Files:', 'blue');
    for (const file of result.files) {
      const icon = file.type === 'source' ? '📄' :
                   file.type === 'test' ? '🧪' :
                   file.type === 'doc' ? '📖' : '⚙️';

      log(`   ${icon} ${file.path} (${file.size} bytes)`, 'white');
    }

    log('\n✅ Done!\n', 'green');

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    if (error.stack) {
      log(`\n${error.stack}`, 'red');
    }
    process.exit(1);
  }
}

main();
