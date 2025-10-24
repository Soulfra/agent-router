/**
 * File Explorer Routes
 *
 * API endpoints for browsing your Desktop, git repos, projects, themes
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const DesktopScanner = require('../lib/desktop-scanner');
const GitAnalyzer = require('../lib/git-analyzer');

const scanner = new DesktopScanner();
const gitAnalyzer = new GitAnalyzer();

/**
 * GET /api/explorer/scan
 * Full desktop scan
 */
router.get('/scan', async (req, res) => {
  try {
    const results = await scanner.scan();
    res.json({
      success: true,
      ...results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/explorer/git
 * Quick scan - just git repos
 */
router.get('/git', async (req, res) => {
  try {
    const repos = await scanner.quickScanGit();
    res.json({
      success: true,
      repos,
      total: repos.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/explorer/tree
 * Get directory tree
 */
router.get('/tree', async (req, res) => {
  try {
    const startPath = req.query.path || scanner.rootPath;
    const maxDepth = parseInt(req.query.depth) || 3;

    const tree = await scanner.getTree(startPath, maxDepth);

    res.json({
      success: true,
      tree
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/explorer/analyze/:repo
 * Deep analysis of specific git repo
 */
router.get('/analyze', async (req, res) => {
  try {
    const repoPath = req.query.path;

    if (!repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Missing path parameter'
      });
    }

    // Security: ensure path is under Desktop
    const desktopPath = path.join(require('os').homedir(), 'Desktop');
    const absolutePath = path.resolve(repoPath);

    if (!absolutePath.startsWith(desktopPath)) {
      return res.status(403).json({
        success: false,
        error: 'Path must be under ~/Desktop'
      });
    }

    const analysis = await gitAnalyzer.analyze(absolutePath);

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/explorer/compare
 * Compare local repos with GitHub account
 */
router.get('/compare', async (req, res) => {
  try {
    const username = req.query.username || 'Soulfra';

    // Get local repos
    const repos = await scanner.quickScanGit();

    // Compare with GitHub
    const comparison = await gitAnalyzer.compareWithGitHub(repos, username);

    res.json({
      success: true,
      comparison
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/explorer/file
 * Read file contents
 */
router.get('/file', async (req, res) => {
  try {
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'Missing path parameter'
      });
    }

    // Security: ensure path is under Desktop
    const desktopPath = path.join(require('os').homedir(), 'Desktop');
    const absolutePath = path.resolve(filePath);

    if (!absolutePath.startsWith(desktopPath)) {
      return res.status(403).json({
        success: false,
        error: 'Path must be under ~/Desktop'
      });
    }

    // Check if file exists
    const stats = await fs.stat(absolutePath);

    if (!stats.isFile()) {
      return res.status(400).json({
        success: false,
        error: 'Not a file'
      });
    }

    // Check file size (max 1MB for preview)
    if (stats.size > 1024 * 1024) {
      return res.json({
        success: true,
        preview: false,
        message: 'File too large for preview',
        size: stats.size
      });
    }

    // Read file
    const content = await fs.readFile(absolutePath, 'utf8');

    res.json({
      success: true,
      preview: true,
      content,
      size: stats.size,
      modified: stats.mtime,
      path: absolutePath
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/explorer/diff
 * Get git diff for file or repo
 */
router.get('/diff', async (req, res) => {
  try {
    const repoPath = req.query.repo;
    const file = req.query.file || null;

    if (!repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Missing repo parameter'
      });
    }

    const diff = await gitAnalyzer.getDiff(repoPath, file);

    res.json({
      success: true,
      diff: diff || 'No changes'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/explorer/history
 * Get git commit history
 */
router.get('/history', async (req, res) => {
  try {
    const repoPath = req.query.repo;
    const limit = parseInt(req.query.limit) || 10;

    if (!repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Missing repo parameter'
      });
    }

    const history = await gitAnalyzer.getHistory(repoPath, limit);

    res.json({
      success: true,
      history,
      total: history.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/explorer/clear-cache
 * Clear git analyzer cache
 */
router.post('/clear-cache', (req, res) => {
  try {
    gitAnalyzer.clearCache();
    res.json({
      success: true,
      message: 'Cache cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/explorer/summary
 * Quick summary of desktop
 */
router.get('/summary', async (req, res) => {
  try {
    const repos = await scanner.quickScanGit();

    const summary = {
      total: repos.length,
      withRemote: repos.filter(r => r.remote).length,
      withoutRemote: repos.filter(r => !r.remote).length,
      dirty: repos.filter(r => !r.status.clean).length,
      clean: repos.filter(r => r.status.clean).length,
      github: repos.filter(r => r.remoteUrl && r.remoteUrl.includes('github.com')).length,
      repos: repos.map(r => ({
        name: r.name,
        path: r.path,
        remote: r.remoteUrl,
        clean: r.status.clean,
        changes: r.status.total
      }))
    };

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/explorer/recordings
 * Scan for audio recording files (for CalRiven recording mission)
 */
router.get('/recordings', async (req, res) => {
  try {
    const searchPaths = [
      path.join(require('os').homedir(), 'Downloads'),
      path.join(require('os').homedir(), 'Desktop'),
      '/tmp'
    ];

    const audioExtensions = ['.m4a', '.mp3', '.wav', '.aac', '.ogg', '.flac'];
    const recordings = [];

    for (const searchPath of searchPaths) {
      try {
        const files = await fs.readdir(searchPath);

        for (const file of files) {
          // Check if audio file
          const isAudio = audioExtensions.some(ext => file.toLowerCase().endsWith(ext));

          if (isAudio) {
            const filePath = path.join(searchPath, file);
            const stats = await fs.stat(filePath);

            // Check if looks like a walkthrough recording (heuristic)
            const keywords = ['calos', 'walkthrough', 'recording', 'demo', 'system'];
            const looksLikeWalkthrough = keywords.some(keyword =>
              file.toLowerCase().includes(keyword)
            );

            // Estimate duration (rough: ~1MB per minute)
            const estimatedDurationMinutes = Math.round(stats.size / 1024 / 1024);

            recordings.push({
              filename: file,
              path: filePath,
              size: stats.size,
              sizeFormatted: formatBytes(stats.size),
              estimatedDurationMinutes,
              modified: stats.mtime,
              created: stats.birthtime,
              extension: path.extname(file),
              looksLikeWalkthrough,
              location: path.basename(searchPath)
            });
          }
        }
      } catch (error) {
        // Directory doesn't exist or no permission
        continue;
      }
    }

    // Sort by modified date (most recent first)
    recordings.sort((a, b) => b.modified - a.modified);

    res.json({
      success: true,
      recordings,
      total: recordings.length,
      walkthroughCandidates: recordings.filter(r => r.looksLikeWalkthrough).length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper: Format bytes to human-readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

module.exports = router;
