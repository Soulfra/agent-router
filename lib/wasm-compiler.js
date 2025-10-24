/**
 * WASM Compiler
 *
 * Compile to WebAssembly from various sources:
 * - AssemblyScript → WASM
 * - JavaScript (subset) → WASM
 * - C/C++/Rust → WASM (via external tools)
 *
 * "Assembly to webassembly to wasm" - compile between formats
 *
 * Similar to:
 * - Emscripten: C/C++ → WASM
 * - AssemblyScript Compiler: TypeScript-like → WASM
 * - wasm-pack: Rust → WASM
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class WasmCompiler {
  constructor(options = {}) {
    this.db = options.db;
    this.cacheDir = options.cacheDir || path.join(__dirname, '../../.wasm-cache');
    this.buildDir = options.buildDir || path.join(__dirname, '../../.wasm-build');

    // Compiler paths (if installed)
    this.compilers = {
      assemblyscript: 'asc', // AssemblyScript compiler
      emscripten: 'emcc', // Emscripten (C/C++)
      wasmpack: 'wasm-pack' // Rust
    };

    console.log('[WasmCompiler] Initialized');
  }

  /**
   * Compile to WebAssembly
   *
   * @param {string} sourcePath - Source file path
   * @param {string} outputPath - Output WASM path
   * @param {object} options - Compilation options
   * @returns {Promise<object>} - Compilation result
   */
  async compile(sourcePath, outputPath, options = {}) {
    try {
      console.log(`[WasmCompiler] Compiling ${sourcePath} to ${outputPath}`);

      // Ensure directories exist
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.mkdir(this.buildDir, { recursive: true });

      // Detect source language
      const ext = path.extname(sourcePath);
      let compiler = null;

      switch (ext) {
        case '.as': // AssemblyScript
          compiler = 'assemblyscript';
          break;
        case '.c':
        case '.cpp':
        case '.cc':
          compiler = 'emscripten';
          break;
        case '.rs': // Rust
          compiler = 'wasmpack';
          break;
        case '.wat': // WebAssembly Text Format
          compiler = 'wat2wasm';
          break;
        default:
          throw new Error(`Unsupported source file type: ${ext}`);
      }

      // Check if compiler is available
      const compilerAvailable = await this.checkCompiler(compiler);

      if (!compilerAvailable) {
        console.warn(`[WasmCompiler] ${compiler} not available, generating stub`);
        return await this.generateStubWasm(sourcePath, outputPath, options);
      }

      // Compile based on source type
      let result;
      switch (compiler) {
        case 'assemblyscript':
          result = await this.compileAssemblyScript(sourcePath, outputPath, options);
          break;
        case 'emscripten':
          result = await this.compileEmscripten(sourcePath, outputPath, options);
          break;
        case 'wasmpack':
          result = await this.compileRust(sourcePath, outputPath, options);
          break;
        case 'wat2wasm':
          result = await this.compileWat(sourcePath, outputPath, options);
          break;
        default:
          throw new Error(`Unsupported compiler: ${compiler}`);
      }

      // Generate JavaScript bindings
      await this.generateBindings(outputPath, options);

      console.log('[WasmCompiler] Compilation successful');

      return result;

    } catch (error) {
      console.error('[WasmCompiler] Compilation error:', error);
      throw error;
    }
  }

  /**
   * Compile AssemblyScript to WASM
   *
   * @param {string} sourcePath - Source file path
   * @param {string} outputPath - Output WASM path
   * @param {object} options - Options
   * @returns {Promise<object>} - Compilation result
   */
  async compileAssemblyScript(sourcePath, outputPath, options = {}) {
    try {
      const optimizationLevel = options.optimize ? '-O3' : '-O0';

      const command = `${this.compilers.assemblyscript} ${sourcePath} -o ${outputPath} ${optimizationLevel} --sourceMap`;

      const { stdout, stderr } = await execAsync(command);

      if (stderr) {
        console.warn('[WasmCompiler] AssemblyScript warnings:', stderr);
      }

      const stats = await fs.stat(outputPath);
      const content = await fs.readFile(outputPath);
      const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);

      return {
        source: sourcePath,
        output: outputPath,
        compiler: 'assemblyscript',
        size: stats.size,
        hash,
        optimized: options.optimize || false
      };

    } catch (error) {
      console.error('[WasmCompiler] AssemblyScript compilation error:', error);
      throw error;
    }
  }

  /**
   * Compile C/C++ to WASM via Emscripten
   *
   * @param {string} sourcePath - Source file path
   * @param {string} outputPath - Output WASM path
   * @param {object} options - Options
   * @returns {Promise<object>} - Compilation result
   */
  async compileEmscripten(sourcePath, outputPath, options = {}) {
    try {
      const optimizationLevel = options.optimize ? '-O3' : '-O0';

      const command = `${this.compilers.emscripten} ${sourcePath} -o ${outputPath} ${optimizationLevel} -s WASM=1 -s STANDALONE_WASM`;

      const { stdout, stderr } = await execAsync(command);

      if (stderr) {
        console.warn('[WasmCompiler] Emscripten warnings:', stderr);
      }

      const stats = await fs.stat(outputPath);
      const content = await fs.readFile(outputPath);
      const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);

      return {
        source: sourcePath,
        output: outputPath,
        compiler: 'emscripten',
        size: stats.size,
        hash,
        optimized: options.optimize || false
      };

    } catch (error) {
      console.error('[WasmCompiler] Emscripten compilation error:', error);
      throw error;
    }
  }

  /**
   * Compile Rust to WASM
   *
   * @param {string} sourcePath - Source file path
   * @param {string} outputPath - Output WASM path
   * @param {object} options - Options
   * @returns {Promise<object>} - Compilation result
   */
  async compileRust(sourcePath, outputPath, options = {}) {
    try {
      const projectDir = path.dirname(sourcePath);

      const command = `cd ${projectDir} && ${this.compilers.wasmpack} build --target web`;

      const { stdout, stderr } = await execAsync(command);

      if (stderr) {
        console.warn('[WasmCompiler] wasm-pack warnings:', stderr);
      }

      // Copy output to destination
      const wasmOutput = path.join(projectDir, 'pkg', 'index_bg.wasm');
      await fs.copyFile(wasmOutput, outputPath);

      const stats = await fs.stat(outputPath);
      const content = await fs.readFile(outputPath);
      const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);

      return {
        source: sourcePath,
        output: outputPath,
        compiler: 'wasm-pack',
        size: stats.size,
        hash,
        optimized: true
      };

    } catch (error) {
      console.error('[WasmCompiler] Rust compilation error:', error);
      throw error;
    }
  }

  /**
   * Compile WAT (WebAssembly Text Format) to WASM
   *
   * @param {string} sourcePath - Source file path
   * @param {string} outputPath - Output WASM path
   * @param {object} options - Options
   * @returns {Promise<object>} - Compilation result
   */
  async compileWat(sourcePath, outputPath, options = {}) {
    try {
      const command = `wat2wasm ${sourcePath} -o ${outputPath}`;

      const { stdout, stderr } = await execAsync(command);

      if (stderr) {
        console.warn('[WasmCompiler] wat2wasm warnings:', stderr);
      }

      const stats = await fs.stat(outputPath);
      const content = await fs.readFile(outputPath);
      const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);

      return {
        source: sourcePath,
        output: outputPath,
        compiler: 'wat2wasm',
        size: stats.size,
        hash
      };

    } catch (error) {
      console.error('[WasmCompiler] WAT compilation error:', error);
      throw error;
    }
  }

  /**
   * Generate stub WASM (when compiler not available)
   *
   * @param {string} sourcePath - Source file path
   * @param {string} outputPath - Output WASM path
   * @param {object} options - Options
   * @returns {Promise<object>} - Stub result
   */
  async generateStubWasm(sourcePath, outputPath, options = {}) {
    // Minimal WASM module that does nothing
    const stubWasm = Buffer.from([
      0x00, 0x61, 0x73, 0x6d, // Magic number
      0x01, 0x00, 0x00, 0x00  // Version
    ]);

    await fs.writeFile(outputPath, stubWasm);

    return {
      source: sourcePath,
      output: outputPath,
      compiler: 'stub',
      size: stubWasm.length,
      hash: crypto.createHash('sha256').update(stubWasm).digest('hex').substring(0, 8),
      stub: true
    };
  }

  /**
   * Generate JavaScript bindings for WASM module
   *
   * @param {string} wasmPath - WASM file path
   * @param {object} options - Options
   * @returns {Promise<string>} - Bindings file path
   */
  async generateBindings(wasmPath, options = {}) {
    const bindingsPath = wasmPath.replace('.wasm', '.js');

    const bindingsCode = `
// Auto-generated WASM bindings
let wasmModule = null;
let wasmInstance = null;

async function loadWasm() {
  if (wasmInstance) return wasmInstance;

  try {
    const wasmPath = '${path.basename(wasmPath)}';
    const response = await fetch(wasmPath);
    const buffer = await response.arrayBuffer();

    const result = await WebAssembly.instantiate(buffer, {
      env: {
        // Import functions here
        abort: (msg, file, line, col) => {
          console.error('WASM abort:', msg, file, line, col);
        }
      }
    });

    wasmModule = result.module;
    wasmInstance = result.instance;

    return wasmInstance;
  } catch (error) {
    console.error('Failed to load WASM:', error);
    throw error;
  }
}

// Export loader
export { loadWasm };
export default loadWasm;
`.trim();

    await fs.writeFile(bindingsPath, bindingsCode);

    console.log(`[WasmCompiler] Generated bindings at ${bindingsPath}`);

    return bindingsPath;
  }

  /**
   * Check if compiler is available
   *
   * @param {string} compiler - Compiler name
   * @returns {Promise<boolean>}
   */
  async checkCompiler(compiler) {
    try {
      const command = this.compilers[compiler];
      if (!command) return false;

      await execAsync(`${command} --version`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Optimize WASM file
   *
   * @param {string} wasmPath - WASM file path
   * @param {object} options - Optimization options
   * @returns {Promise<object>} - Optimization result
   */
  async optimizeWasm(wasmPath, options = {}) {
    try {
      // Use wasm-opt if available
      const optimizerAvailable = await this.checkCompiler('wasmopt');

      if (!optimizerAvailable) {
        console.warn('[WasmCompiler] wasm-opt not available, skipping optimization');
        const stats = await fs.stat(wasmPath);
        return {
          original_size: stats.size,
          optimized_size: stats.size,
          reduction: 0
        };
      }

      const optimizedPath = wasmPath.replace('.wasm', '.opt.wasm');
      const optimizationLevel = options.level || '-O3';

      const command = `wasm-opt ${wasmPath} -o ${optimizedPath} ${optimizationLevel}`;

      await execAsync(command);

      const originalStats = await fs.stat(wasmPath);
      const optimizedStats = await fs.stat(optimizedPath);

      // Replace original with optimized
      await fs.copyFile(optimizedPath, wasmPath);
      await fs.unlink(optimizedPath);

      const reduction = ((originalStats.size - optimizedStats.size) / originalStats.size * 100).toFixed(2);

      console.log(`[WasmCompiler] Optimized WASM: ${originalStats.size} → ${optimizedStats.size} bytes (${reduction}% reduction)`);

      return {
        original_size: originalStats.size,
        optimized_size: optimizedStats.size,
        reduction
      };

    } catch (error) {
      console.error('[WasmCompiler] Optimization error:', error);
      throw error;
    }
  }

  /**
   * Decompile WASM to WAT (text format)
   *
   * @param {string} wasmPath - WASM file path
   * @param {string} outputPath - Output WAT path
   * @returns {Promise<string>} - WAT content
   */
  async decompileToWat(wasmPath, outputPath) {
    try {
      const command = `wasm2wat ${wasmPath} -o ${outputPath}`;

      await execAsync(command);

      const watContent = await fs.readFile(outputPath, 'utf8');

      console.log(`[WasmCompiler] Decompiled to WAT: ${outputPath}`);

      return watContent;

    } catch (error) {
      console.error('[WasmCompiler] Decompilation error:', error);
      throw error;
    }
  }
}

module.exports = WasmCompiler;
