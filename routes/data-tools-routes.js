/**
 * Data Tools API Routes
 *
 * Endpoints for universal data operations:
 * - Table scraping (HTML, URLs, databases)
 * - CSV export/import
 * - Chart generation (candlestick, line, bar, etc.)
 * - Data transformations
 */

const express = require('express');
const router = express.Router();

const UniversalTableScraper = require('../lib/universal-table-scraper');
const CSVExportEngine = require('../lib/csv-export-engine');
const ChartBuilder = require('../lib/chart-builder');

// Initialize tools
const scraper = new UniversalTableScraper();
const csvEngine = new CSVExportEngine();
const chartBuilder = new ChartBuilder();

/**
 * POST /api/data-tools/scrape
 * Scrape table data from any source
 */
router.post('/scrape', async (req, res) => {
  try {
    const { source, selector, options } = req.body;

    if (!source) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: source'
      });
    }

    const scraped = await scraper.scrape(source, {
      tableSelector: selector,
      ...options
    });

    if (!scraped) {
      return res.status(404).json({
        success: false,
        error: 'No tables found in source'
      });
    }

    res.json({
      success: true,
      data: scraped,
      metadata: scraped.metadata
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/data-tools/scrape-multiple
 * Scrape all tables from a source
 */
router.post('/scrape-multiple', async (req, res) => {
  try {
    const { source, options } = req.body;

    if (!source) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: source'
      });
    }

    const tables = await scraper.scrapeAll(source, options);

    res.json({
      success: true,
      tables,
      count: tables.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/data-tools/export-csv
 * Export data to CSV
 */
router.post('/export-csv', async (req, res) => {
  try {
    const { data, options, filename } = req.body;

    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: data'
      });
    }

    const csv = csvEngine.export(data, options);

    // Return as downloadable file
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'export.csv'}"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/data-tools/parse-csv
 * Parse CSV string to JSON
 */
router.post('/parse-csv', async (req, res) => {
  try {
    const { csv, options } = req.body;

    if (!csv) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: csv'
      });
    }

    const data = csvEngine.parse(csv, options);

    res.json({
      success: true,
      data,
      rowCount: data.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/data-tools/charts/generate
 * Generate chart from data
 */
router.post('/charts/generate', async (req, res) => {
  try {
    const { type, data, options } = req.body;

    if (!type || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, data'
      });
    }

    const chart = await chartBuilder.build(type, data, options);

    // Return base64 encoded image
    const base64 = chart.buffer.toString('base64');

    res.json({
      success: true,
      image: base64,
      format: 'png',
      width: options?.width || 800,
      height: options?.height || 400
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/data-tools/charts/download
 * Generate and download chart
 */
router.post('/charts/download', async (req, res) => {
  try {
    const { type, data, options, format, filename } = req.body;

    if (!type || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, data'
      });
    }

    const chart = await chartBuilder.build(type, data, options);

    // Set appropriate headers
    if (format === 'svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Content-Disposition', `attachment; filename="${filename || 'chart.svg'}"`);
      res.send(chart.svg);
    } else {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${filename || 'chart.png'}"`);
      res.send(chart.buffer);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/data-tools/transform
 * Transform data (flatten, filter, map, etc.)
 */
router.post('/transform', async (req, res) => {
  try {
    const { data, operations } = req.body;

    if (!data || !operations) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: data, operations'
      });
    }

    let result = data;

    for (const op of operations) {
      switch (op.type) {
        case 'filter':
          result = result.filter(item => {
            const value = item[op.field];
            return op.operator === '==' ? value == op.value :
                   op.operator === '!=' ? value != op.value :
                   op.operator === '>' ? value > op.value :
                   op.operator === '<' ? value < op.value :
                   op.operator === '>=' ? value >= op.value :
                   op.operator === '<=' ? value <= op.value :
                   false;
          });
          break;

        case 'map':
          result = result.map(item => {
            const mapped = {};
            for (const [key, value] of Object.entries(op.mapping)) {
              mapped[key] = item[value];
            }
            return mapped;
          });
          break;

        case 'sort':
          result = result.sort((a, b) => {
            const aVal = a[op.field];
            const bVal = b[op.field];
            return op.order === 'desc' ? bVal - aVal : aVal - bVal;
          });
          break;

        case 'limit':
          result = result.slice(0, op.count);
          break;

        default:
          throw new Error(`Unknown operation: ${op.type}`);
      }
    }

    res.json({
      success: true,
      data: result,
      count: result.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/data-tools/formats
 * Get supported formats and chart types
 */
router.get('/formats', (req, res) => {
  res.json({
    success: true,
    scraping: {
      sources: ['html', 'url', 'json', 'csv', 'dom'],
      options: ['tableSelector', 'headerSelector', 'rowSelector', 'includeHidden', 'parseNumbers']
    },
    csv: {
      export: ['csv', 'json'],
      options: ['delimiter', 'bom', 'dateFormat', 'numberFormat']
    },
    charts: {
      types: ['candlestick', 'ohlc', 'line', 'bar', 'area', 'heatmap', 'scatter'],
      formats: ['png', 'svg'],
      options: ['width', 'height', 'title', 'colors']
    }
  });
});

/**
 * GET /api/data-tools/examples
 * Get example data for testing
 */
router.get('/examples', (req, res) => {
  res.json({
    success: true,
    examples: {
      candlestick: [
        { date: '2025-01-01', open: 100, high: 105, low: 98, close: 102 },
        { date: '2025-01-02', open: 102, high: 108, low: 101, close: 107 },
        { date: '2025-01-03', open: 107, high: 110, low: 104, close: 106 }
      ],
      line: [
        { date: '2025-01-01', value: 100 },
        { date: '2025-01-02', value: 120 },
        { date: '2025-01-03', value: 115 }
      ],
      bar: [
        { category: 'A', value: 50 },
        { category: 'B', value: 75 },
        { category: 'C', value: 60 }
      ]
    }
  });
});

module.exports = router;
