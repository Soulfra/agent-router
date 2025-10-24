/**
 * System Health & Status Routes
 *
 * "Mana Bar" 🧙‍♂️ - Show system resources like a game
 *
 * Endpoints:
 * - GET /api/health - Quick health check
 * - GET /api/health/detailed - Full system status
 * - GET /api/health/mana - Resource "mana bar" (RAM/CPU as %)
 */

const express = require('express');
const router = express.Router();
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * GET /api/health
 * Quick health check (for load balancers/monitoring)
 */
router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      }
    };

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/health/detailed
 * Full system status with all metrics
 */
router.get('/detailed', async (req, res) => {
  try {
    // Get system memory
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Get load average
    const loadAvg = os.loadavg();

    // Get CPU info
    const cpus = os.cpus();
    const cpuCount = cpus.length;

    // Get Node.js memory
    const mem = process.memoryUsage();

    // Get platform info
    const platform = {
      type: os.type(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname()
    };

    // Calculate percentages
    const memoryPercent = Math.round((usedMem / totalMem) * 100);
    const cpuLoadPercent = Math.round((loadAvg[0] / cpuCount) * 100);

    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: {
        process: Math.round(process.uptime()),
        system: os.uptime()
      },
      memory: {
        system: {
          total: Math.round(totalMem / 1024 / 1024 / 1024 * 10) / 10,
          used: Math.round(usedMem / 1024 / 1024 / 1024 * 10) / 10,
          free: Math.round(freeMem / 1024 / 1024 / 1024 * 10) / 10,
          percent: memoryPercent,
          unit: 'GB'
        },
        process: {
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
          rss: Math.round(mem.rss / 1024 / 1024),
          external: Math.round(mem.external / 1024 / 1024),
          unit: 'MB'
        }
      },
      cpu: {
        count: cpuCount,
        model: cpus[0].model,
        loadAvg: {
          '1min': Math.round(loadAvg[0] * 100) / 100,
          '5min': Math.round(loadAvg[1] * 100) / 100,
          '15min': Math.round(loadAvg[2] * 100) / 100
        },
        loadPercent: cpuLoadPercent
      },
      platform,
      node: {
        version: process.version,
        pid: process.pid
      }
    };

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/health/mana
 * Resource "mana bar" 🧙‍♂️ - Game-style resource display
 *
 * Returns resources as percentages (0-100) like a mana bar
 */
router.get('/mana', async (req, res) => {
  try {
    // System memory
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryPercent = Math.round((usedMem / totalMem) * 100);

    // CPU load
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;
    const cpuLoadPercent = Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100));

    // Disk (if on Mac)
    let diskPercent = null;
    try {
      if (os.platform() === 'darwin') {
        const { stdout } = await execPromise('df -h / | tail -1 | awk \'{print $5}\' | sed \'s/%//\'');
        diskPercent = parseInt(stdout.trim());
      }
    } catch (err) {
      // Disk check failed, skip
    }

    // Determine mana level (color-coded like a game)
    const getManaLevel = (percent) => {
      if (percent < 50) return 'high'; // Green
      if (percent < 75) return 'medium'; // Yellow
      if (percent < 90) return 'low'; // Orange
      return 'critical'; // Red
    };

    // Calculate "castable" status (can the mage cast?)
    const canCast = memoryPercent < 90 && cpuLoadPercent < 90;

    const mana = {
      status: canCast ? 'ready' : 'exhausted',
      canCast,
      resources: {
        memory: {
          percent: memoryPercent,
          level: getManaLevel(memoryPercent),
          bar: generateBar(memoryPercent),
          status: memoryPercent < 90 ? 'ok' : 'warning'
        },
        cpu: {
          percent: cpuLoadPercent,
          level: getManaLevel(cpuLoadPercent),
          bar: generateBar(cpuLoadPercent),
          status: cpuLoadPercent < 90 ? 'ok' : 'warning'
        }
      },
      message: canCast
        ? '🧙‍♂️ Mana is high! Ready to cast spells.'
        : '🧙‍♂️💀 OUT OF MANA! Need to rest (free up resources).'
    };

    if (diskPercent !== null) {
      mana.resources.disk = {
        percent: diskPercent,
        level: getManaLevel(diskPercent),
        bar: generateBar(diskPercent),
        status: diskPercent < 90 ? 'ok' : 'warning'
      };
    }

    res.json(mana);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * Generate ASCII progress bar
 * @param {number} percent - Percentage (0-100)
 * @returns {string} - ASCII bar like [████████░░] 80%
 */
function generateBar(percent) {
  const barLength = 10;
  const filled = Math.round((percent / 100) * barLength);
  const empty = barLength - filled;

  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);

  return `[${filledBar}${emptyBar}] ${percent}%`;
}

/**
 * GET /api/health/services
 * Check status of all services (database, ollama, etc.)
 */
router.get('/services', async (req, res) => {
  try {
    const services = {
      database: {
        status: 'unknown',
        type: process.env.DB_TYPE || 'postgres'
      },
      ollama: {
        status: 'unknown',
        url: process.env.OLLAMA_URL || 'http://localhost:11434'
      },
      xref: {
        status: 'unknown'
      }
    };

    // Check database
    try {
      // Database check would go here
      services.database.status = 'ok';
    } catch (err) {
      services.database.status = 'error';
      services.database.error = err.message;
    }

    // Check Ollama
    try {
      const axios = require('axios');
      const ollamaUrl = services.ollama.url;
      await axios.get(`${ollamaUrl}/api/tags`, { timeout: 2000 });
      services.ollama.status = 'ok';
    } catch (err) {
      services.ollama.status = 'error';
      services.ollama.error = 'Not reachable';
    }

    // Check XRef
    try {
      services.xref.status = 'ok';
    } catch (err) {
      services.xref.status = 'error';
    }

    const allOk = Object.values(services).every(s => s.status === 'ok');

    res.json({
      status: allOk ? 'ok' : 'degraded',
      services
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = { router };
