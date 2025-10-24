/**
 * File Output Service
 *
 * Handles saving generated files (diagrams, images, HTML) to disk
 * and returning file URLs for API responses.
 *
 * Storage structure:
 * - storage/generated/diagrams/*.mermaid
 * - storage/generated/diagrams/*.dot
 * - storage/generated/tilemaps/*.png
 * - storage/generated/badges/*.svg
 * - storage/generated/badges/*.png
 * - storage/generated/products/*.html
 * - storage/generated/products/images/*.png
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class FileOutputService {
  constructor(baseStoragePath = './storage/generated') {
    this.baseStoragePath = baseStoragePath;
    this.subdirectories = {
      diagrams: 'diagrams',
      tilemaps: 'tilemaps',
      badges: 'badges',
      products: 'products',
      productImages: 'products/images'
    };
  }

  /**
   * Initialize storage directories
   */
  async initialize() {
    try {
      // Create base directory
      await fs.mkdir(this.baseStoragePath, { recursive: true });

      // Create subdirectories
      for (const subdir of Object.values(this.subdirectories)) {
        const dirPath = path.join(this.baseStoragePath, subdir);
        await fs.mkdir(dirPath, { recursive: true });
      }

      console.log('[FileOutputService] Storage directories initialized');
      return true;
    } catch (error) {
      console.error('[FileOutputService] Failed to initialize directories:', error);
      throw error;
    }
  }

  /**
   * Generate unique filename with timestamp and hash
   */
  generateFilename(prefix, extension) {
    const timestamp = Date.now();
    const randomHash = crypto.randomBytes(4).toString('hex');
    return `${prefix}_${timestamp}_${randomHash}.${extension}`;
  }

  /**
   * Save Mermaid diagram
   */
  async saveMermaid(content, filename = null) {
    try {
      const fname = filename || this.generateFilename('mermaid', 'mermaid');
      const filePath = path.join(this.baseStoragePath, this.subdirectories.diagrams, fname);

      await fs.writeFile(filePath, content, 'utf8');

      return {
        success: true,
        filename: fname,
        path: filePath,
        url: `/generated/diagrams/${fname}`,
        type: 'mermaid'
      };
    } catch (error) {
      console.error('[FileOutputService] Failed to save Mermaid:', error);
      throw error;
    }
  }

  /**
   * Save GraphViz DOT file
   */
  async saveDot(content, filename = null) {
    try {
      const fname = filename || this.generateFilename('graph', 'dot');
      const filePath = path.join(this.baseStoragePath, this.subdirectories.diagrams, fname);

      await fs.writeFile(filePath, content, 'utf8');

      return {
        success: true,
        filename: fname,
        path: filePath,
        url: `/generated/diagrams/${fname}`,
        type: 'dot'
      };
    } catch (error) {
      console.error('[FileOutputService] Failed to save DOT:', error);
      throw error;
    }
  }

  /**
   * Save tilemap image (PNG)
   */
  async saveTilemap(buffer, filename = null) {
    try {
      const fname = filename || this.generateFilename('tilemap', 'png');
      const filePath = path.join(this.baseStoragePath, this.subdirectories.tilemaps, fname);

      await fs.writeFile(filePath, buffer);

      return {
        success: true,
        filename: fname,
        path: filePath,
        url: `/generated/tilemaps/${fname}`,
        type: 'tilemap'
      };
    } catch (error) {
      console.error('[FileOutputService] Failed to save tilemap:', error);
      throw error;
    }
  }

  /**
   * Save badge SVG
   */
  async saveBadgeSVG(content, filename = null) {
    try {
      const fname = filename || this.generateFilename('badge', 'svg');
      const filePath = path.join(this.baseStoragePath, this.subdirectories.badges, fname);

      await fs.writeFile(filePath, content, 'utf8');

      return {
        success: true,
        filename: fname,
        path: filePath,
        url: `/generated/badges/${fname}`,
        type: 'badge_svg'
      };
    } catch (error) {
      console.error('[FileOutputService] Failed to save badge SVG:', error);
      throw error;
    }
  }

  /**
   * Save badge PNG
   */
  async saveBadgePNG(buffer, filename = null) {
    try {
      const fname = filename || this.generateFilename('badge', 'png');
      const filePath = path.join(this.baseStoragePath, this.subdirectories.badges, fname);

      await fs.writeFile(filePath, buffer);

      return {
        success: true,
        filename: fname,
        path: filePath,
        url: `/generated/badges/${fname}`,
        type: 'badge_png'
      };
    } catch (error) {
      console.error('[FileOutputService] Failed to save badge PNG:', error);
      throw error;
    }
  }

  /**
   * Save product page HTML
   */
  async saveProductPage(content, filename = null) {
    try {
      const fname = filename || this.generateFilename('product', 'html');
      const filePath = path.join(this.baseStoragePath, this.subdirectories.products, fname);

      await fs.writeFile(filePath, content, 'utf8');

      return {
        success: true,
        filename: fname,
        path: filePath,
        url: `/generated/products/${fname}`,
        type: 'product_page'
      };
    } catch (error) {
      console.error('[FileOutputService] Failed to save product page:', error);
      throw error;
    }
  }

  /**
   * Save product image
   */
  async saveProductImage(buffer, filename = null) {
    try {
      const fname = filename || this.generateFilename('product_img', 'png');
      const filePath = path.join(this.baseStoragePath, this.subdirectories.productImages, fname);

      await fs.writeFile(filePath, buffer);

      return {
        success: true,
        filename: fname,
        path: filePath,
        url: `/generated/products/images/${fname}`,
        type: 'product_image'
      };
    } catch (error) {
      console.error('[FileOutputService] Failed to save product image:', error);
      throw error;
    }
  }

  /**
   * Save JSON data
   */
  async saveJSON(data, subdir, filename = null) {
    try {
      const fname = filename || this.generateFilename('data', 'json');
      const filePath = path.join(this.baseStoragePath, subdir, fname);

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

      return {
        success: true,
        filename: fname,
        path: filePath,
        url: `/generated/${subdir}/${fname}`,
        type: 'json'
      };
    } catch (error) {
      console.error('[FileOutputService] Failed to save JSON:', error);
      throw error;
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(subdir) {
    try {
      const dirPath = path.join(this.baseStoragePath, subdir);
      const files = await fs.readdir(dirPath);

      return files.map(file => ({
        filename: file,
        url: `/generated/${subdir}/${file}`,
        path: path.join(dirPath, file)
      }));
    } catch (error) {
      console.error('[FileOutputService] Failed to list files:', error);
      return [];
    }
  }

  /**
   * Delete file
   */
  async deleteFile(subdir, filename) {
    try {
      const filePath = path.join(this.baseStoragePath, subdir, filename);
      await fs.unlink(filePath);
      return { success: true, deleted: filename };
    } catch (error) {
      console.error('[FileOutputService] Failed to delete file:', error);
      throw error;
    }
  }

  /**
   * Get file stats
   */
  async getFileStats(subdir, filename) {
    try {
      const filePath = path.join(this.baseStoragePath, subdir, filename);
      const stats = await fs.stat(filePath);

      return {
        filename,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        url: `/generated/${subdir}/${filename}`
      };
    } catch (error) {
      console.error('[FileOutputService] Failed to get file stats:', error);
      return null;
    }
  }
}

module.exports = FileOutputService;
