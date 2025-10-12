#!/usr/bin/env node

/**
 * Test Code Playground
 * Tests sandbox execution for Python, JavaScript, Go, Bash
 */

const SandboxExecutor = require('../lib/sandbox-executor');

async function testPlayground() {
  console.log('🧪 Testing Code Playground...\n');

  const executor = new SandboxExecutor();

  // Test 1: Python
  console.log('Test 1: Python execution');
  try {
    const result = await executor.execute({
      code: 'print("Hello from Python!")\nimport hashlib\nprint(hashlib.sha256(b"test").hexdigest())',
      language: 'python'
    });
    console.log('✓ Python:', result.success ? 'Success' : 'Failed');
    console.log('  Output:', result.stdout);
    if (result.stderr) console.log('  Error:', result.stderr);
    console.log('  Duration:', result.duration, 'ms');
  } catch (error) {
    console.error('✗ Python failed:', error.message);
  }
  console.log('');

  // Test 2: JavaScript
  console.log('Test 2: JavaScript execution');
  try {
    const result = await executor.execute({
      code: 'console.log("Hello from JavaScript!");\nconst crypto = require("crypto");\nconst hash = crypto.createHash("sha256").update("test").digest("hex");\nconsole.log(hash);',
      language: 'javascript'
    });
    console.log('✓ JavaScript:', result.success ? 'Success' : 'Failed');
    console.log('  Output:', result.stdout);
    if (result.stderr) console.log('  Error:', result.stderr);
    console.log('  Duration:', result.duration, 'ms');
  } catch (error) {
    console.error('✗ JavaScript failed:', error.message);
  }
  console.log('');

  // Test 3: Bash
  console.log('Test 3: Bash execution');
  try {
    const result = await executor.execute({
      code: 'echo "Hello from Bash!"\necho -n "test" | sha256sum | cut -d" " -f1',
      language: 'bash'
    });
    console.log('✓ Bash:', result.success ? 'Success' : 'Failed');
    console.log('  Output:', result.stdout);
    if (result.stderr) console.log('  Error:', result.stderr);
    console.log('  Duration:', result.duration, 'ms');
  } catch (error) {
    console.error('✗ Bash failed:', error.message);
  }
  console.log('');

  // Test 4: Timeout handling
  console.log('Test 4: Timeout handling');
  try {
    const result = await executor.execute({
      code: 'import time\ntime.sleep(15)\nprint("Should timeout")',
      language: 'python',
      timeout: 2000 // 2 second timeout
    });
    console.log('✓ Timeout:', result.exitCode === 124 ? 'Worked' : 'Failed');
    console.log('  Stderr:', result.stderr);
    console.log('  Duration:', result.duration, 'ms');
  } catch (error) {
    console.error('✗ Timeout test failed:', error.message);
  }
  console.log('');

  // Test 5: Error handling
  console.log('Test 5: Error handling');
  try {
    const result = await executor.execute({
      code: 'print(undefined_variable)',
      language: 'python'
    });
    console.log('✓ Error handling:', !result.success ? 'Worked' : 'Failed');
    console.log('  Exit code:', result.exitCode);
    console.log('  Stderr:', result.stderr.substring(0, 100), '...');
  } catch (error) {
    console.error('✗ Error handling test failed:', error.message);
  }
  console.log('');

  // Test 6: Go (if available)
  console.log('Test 6: Go execution (may fail if Go not installed)');
  try {
    const result = await executor.execute({
      code: 'package main\nimport "fmt"\nfunc main() {\n    fmt.Println("Hello from Go!")\n}',
      language: 'go'
    });
    console.log('✓ Go:', result.success ? 'Success' : 'Failed');
    console.log('  Output:', result.stdout);
    if (result.stderr) console.log('  Error:', result.stderr);
  } catch (error) {
    console.error('✗ Go test failed (may not be installed):', error.message);
  }
  console.log('');

  console.log('✅ Playground tests complete!');
}

testPlayground().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
