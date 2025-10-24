# Data Tools Guide

> **Cross-platform keyboard shortcuts, universal data scraping, CSV export, and chart visualization**

## 📊 Overview

The CALOS Data Tools system provides a comprehensive suite for data operations across all platforms (Mac, Windows, Linux):

1. **Keyboard Shortcuts** - Cross-platform shortcut manager (⌘ on Mac, Ctrl on Windows/Linux)
2. **Table Scraping** - Extract tabular data from any source (HTML, URLs, JSON, CSV)
3. **CSV Export** - Universal CSV export with Excel support (UTF-8 BOM)
4. **Chart Builder** - Generate candlestick, line, bar, and other charts

---

## 🎹 Keyboard Shortcuts

### Implementation

**Server-side (Node.js):**
```javascript
const KeyboardShortcutManager = require('./lib/keyboard-shortcut-manager');
const manager = new KeyboardShortcutManager();

manager.register('save', 'Mod+S', () => saveDocument());
manager.register('export', 'Mod+E', () => exportData());
```

**Client-side (Browser):**
```html
<script src="/lib/keyboard-shortcut-manager.js"></script>
<script src="/lib/keyboard-shortcuts.js"></script>
<!-- Shortcuts auto-install on page load -->
```

### Global Shortcuts

| Shortcut | Action | Description |
|----------|--------|-------------|
| **Navigation** | | |
| `Mod+K` | Open Launcher | Main app launcher |
| `Mod+H` | Open Hub | Interface hub |
| `Mod+D` | Open Docs | Documentation |
| `Mod+R` | Ragebait Generator | Dev meme generator |
| `Mod+Shift+K` | CAL Knowledge Browser | View learned knowledge |
| `Mod+[` | Go Back | Browser back |
| `Mod+]` | Go Forward | Browser forward |
| **Data Operations** | | |
| `Mod+E` | Export to CSV | Export current data |
| `Mod+S` | Save Data | Save current work |
| `Mod+Shift+R` | Refresh Data | Reload data |
| `Mod+Shift+D` | Download Data | Download processed data |
| **UI Controls** | | |
| `Mod+F` | Focus Search | Jump to search field |
| `Mod+/` | Show Shortcuts | Keyboard help modal |
| `Mod+,` | Open Settings | Settings dialog |
| `Escape` | Close Modal | Close any open modal |
| **Dev Tools** | | |
| `Mod+Shift+J` | Open Console | Browser console |
| `Mod+Shift+E` | Error Viewer | Live error dashboard |
| `Mod+Shift+C` | Copy Debug Info | Debug info to clipboard |

> **Note:** `Mod` = `⌘ Cmd` on Mac, `Ctrl` on Windows/Linux

### Custom Shortcuts

Add page-specific shortcuts:

```javascript
window.calosShortcuts.register('custom:action', 'Mod+Shift+X', () => {
  console.log('Custom action triggered!');
}, {
  description: 'My Custom Action',
  global: false
});
```

---

## 🔍 Universal Table Scraper

Extract tabular data from any source.

### API

**Endpoint:** `POST /api/data-tools/scrape`

**Request:**
```json
{
  "source": "https://example.com/data",
  "selector": "table.data-table",
  "options": {
    "parseNumbers": true,
    "parseDates": true,
    "trimWhitespace": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "headers": ["Name", "Email", "Date"],
    "rows": [
      ["John Doe", "john@example.com", "2025-01-01"],
      ["Jane Smith", "jane@example.com", "2025-01-02"]
    ],
    "metadata": {
      "source": "html",
      "rowCount": 2,
      "columnCount": 3
    }
  }
}
```

### Usage (Node.js)

```javascript
const UniversalTableScraper = require('./lib/universal-table-scraper');
const scraper = new UniversalTableScraper();

// Scrape from URL
const data = await scraper.scrape('https://example.com/data');

// Scrape from HTML string
const data = await scraper.scrape('<table>...</table>');

// Scrape from JSON
const data = await scraper.scrape([
  { name: 'John', email: 'john@example.com' },
  { name: 'Jane', email: 'jane@example.com' }
]);

// Scrape from CSV
const data = await scraper.scrape('name,email\nJohn,john@example.com');
```

### Supported Sources

- **HTML Tables** - Any `<table>` element
- **URLs** - Fetches and parses automatically
- **JSON Arrays** - Converts to table format
- **CSV Strings** - Auto-detects delimiter
- **DOM Elements** - Direct DOM node scraping

---

## 💾 CSV Export Engine

Export data to CSV with Excel support.

### API

**Endpoint:** `POST /api/data-tools/export-csv`

**Request:**
```json
{
  "data": [
    { "name": "John", "email": "john@example.com", "age": 30 },
    { "name": "Jane", "email": "jane@example.com", "age": 25 }
  ],
  "options": {
    "delimiter": ",",
    "bom": true,
    "dateFormat": "iso"
  },
  "filename": "export.csv"
}
```

**Response:** CSV file download

### Usage (Node.js)

```javascript
const CSVExportEngine = require('./lib/csv-export-engine');
const exporter = new CSVExportEngine();

// Export to string
const csv = exporter.export(data, {
  columns: ['name', 'email', 'age'],
  headers: { name: 'Full Name', email: 'Email Address' },
  bom: true // UTF-8 BOM for Excel
});

// Export to file
await exporter.exportToFile(data, './output.csv');

// Streaming (large datasets)
const stream = exporter.createStream(['name', 'email', 'age']);
dataStream.pipe(stream).pipe(fs.createWriteStream('./output.csv'));
```

### Usage (Browser)

```javascript
const exporter = new CSVExportEngine();

// Export and download
const csv = exporter.export(data);
exporter.createBrowserDownload(data, 'export.csv');
```

### Features

- ✅ **UTF-8 BOM** - Automatic Excel UTF-8 support
- ✅ **Nested Objects** - Flattens with dot notation (`user.address.city`)
- ✅ **Custom Headers** - Rename columns
- ✅ **Date Formatting** - ISO, locale, or unix timestamp
- ✅ **Number Formatting** - Fixed, scientific, or auto
- ✅ **Streaming** - Handle large datasets efficiently

---

## 📈 Chart Builder

Generate charts with candlestick support.

### API

**Endpoint:** `POST /api/data-tools/charts/generate`

**Request:**
```json
{
  "type": "candlestick",
  "data": [
    { "date": "2025-01-01", "open": 100, "high": 105, "low": 98, "close": 102 },
    { "date": "2025-01-02", "open": 102, "high": 108, "low": 101, "close": 107 }
  ],
  "options": {
    "title": "Stock Price",
    "width": 800,
    "height": 400
  }
}
```

**Response:**
```json
{
  "success": true,
  "image": "base64_encoded_png",
  "format": "png",
  "width": 800,
  "height": 400
}
```

### Usage (Node.js)

```javascript
const ChartBuilder = require('./lib/chart-builder');
const builder = new ChartBuilder();

// Generate candlestick chart
const chart = await builder.build('candlestick', data, {
  title: 'Stock Price',
  xAxis: 'date',
  yAxis: { open: 'open', high: 'high', low: 'low', close: 'close' }
});

// Save to file
await builder.exportToFile(chart, './chart.png', 'png');
await builder.exportToFile(chart, './chart.svg', 'svg');
```

### Supported Chart Types

| Type | Description | Data Format |
|------|-------------|-------------|
| `candlestick` | OHLC candlestick chart | `{ date, open, high, low, close }` |
| `line` | Line chart | `{ x, y }` |
| `bar` | Bar chart | `{ category, value }` |
| `area` | Area chart | `{ x, y }` |
| `scatter` | Scatter plot | `{ x, y }` |
| `heatmap` | Heatmap | `{ x, y, value }` |

### Example: Candlestick Chart

```javascript
const data = [
  { date: '2025-01-01', open: 100, high: 105, low: 98, close: 102 },
  { date: '2025-01-02', open: 102, high: 108, low: 101, close: 107 },
  { date: '2025-01-03', open: 107, high: 110, low: 104, close: 106 }
];

const chart = await builder.build('candlestick', data, {
  title: 'BTC/USD',
  width: 1200,
  height: 600,
  backgroundColor: '#0a0a0a',
  textColor: '#ffffff'
});
```

---

## 📊 Data Dashboard

Interactive dashboard combining all tools.

**URL:** [http://localhost:5001/data-dashboard.html](http://localhost:5001/data-dashboard.html)

### Features

1. **Table Scraper Tab**
   - Paste URL or HTML
   - Auto-detect tables
   - Export scraped data to CSV
   - Visualize in charts

2. **Charts Tab**
   - Select chart type
   - Paste JSON data
   - Generate and preview
   - Download PNG/SVG

3. **CSV Tools Tab**
   - Paste CSV data
   - Parse and preview
   - Export processed data

4. **Live Data Tab**
   - Real-time error monitoring
   - Error pattern charts
   - Integration with CAL Knowledge

### Keyboard Shortcuts (Dashboard)

- `Mod+E` - Export current data to CSV
- `Mod+S` - Save current work
- `Mod+/` - Show keyboard shortcuts help
- `Mod+F` - Focus search field
- `Escape` - Close modals

---

## 🔗 API Reference

### Base URL

```
http://localhost:5001/api/data-tools
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/scrape` | Scrape table data |
| `POST` | `/scrape-multiple` | Scrape all tables from source |
| `POST` | `/export-csv` | Export data to CSV |
| `POST` | `/parse-csv` | Parse CSV to JSON |
| `POST` | `/charts/generate` | Generate chart (returns base64 PNG) |
| `POST` | `/charts/download` | Generate and download chart |
| `POST` | `/transform` | Transform data (filter, map, sort) |
| `GET` | `/formats` | Get supported formats |
| `GET` | `/examples` | Get example data |

### Transform Data

Filter, map, and transform datasets:

```bash
curl -X POST http://localhost:5001/api/data-tools/transform \
  -H "Content-Type: application/json" \
  -d '{
    "data": [...],
    "operations": [
      { "type": "filter", "field": "age", "operator": ">", "value": 25 },
      { "type": "sort", "field": "name", "order": "asc" },
      { "type": "limit", "count": 10 }
    ]
  }'
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install cheerio canvas node-fetch
```

### 2. Start Server

```bash
npm start
```

### 3. Open Dashboard

Navigate to: [http://localhost:5001/data-dashboard.html](http://localhost:5001/data-dashboard.html)

### 4. Test Keyboard Shortcuts

Press `Mod+/` on any page to see available shortcuts.

---

## 🎯 Use Cases

### Web Scraping

Scrape product data from e-commerce sites:

```javascript
const data = await scraper.scrape('https://example.com/products');
const csv = exporter.export(data);
```

### Financial Charts

Generate candlestick charts from API data:

```javascript
const prices = await fetch('https://api.example.com/ohlc');
const chart = await builder.build('candlestick', prices);
```

### Data Export

Export database query results to CSV:

```javascript
const results = await db.query('SELECT * FROM users');
csvEngine.toDownloadResponse(res, results, 'users.csv');
```

### Error Analytics

Visualize error patterns:

```javascript
const errors = await fetch('/api/cal-knowledge/live-errors');
const chart = await builder.build('bar', errors.data);
```

---

## 📚 Files Reference

### Core Libraries

- `lib/keyboard-shortcut-manager.js` - Cross-platform keyboard shortcuts
- `lib/universal-table-scraper.js` - Universal data scraping
- `lib/csv-export-engine.js` - CSV export with streaming
- `lib/chart-builder.js` - Chart generation (candlestick, line, bar, etc.)

### Frontend

- `public/lib/keyboard-shortcuts.js` - Global shortcut registry
- `public/data-dashboard.html` - Interactive data dashboard

### API Routes

- `routes/data-tools-routes.js` - All data tools API endpoints

### Integration

- `router.js:258-260` - Data tools routes registration

---

## 🔧 Configuration

### Keyboard Shortcuts

```javascript
const manager = new KeyboardShortcutManager({
  debug: true // Log all shortcut triggers
});
```

### Table Scraper

```javascript
const scraper = new UniversalTableScraper({
  tableSelector: 'table.data',
  headerSelector: 'thead th',
  parseNumbers: true,
  parseDates: true,
  trimWhitespace: true
});
```

### CSV Exporter

```javascript
const exporter = new CSVExportEngine({
  delimiter: ',',
  bom: true, // UTF-8 BOM for Excel
  dateFormat: 'iso',
  numberFormat: 'auto'
});
```

### Chart Builder

```javascript
const builder = new ChartBuilder({
  width: 1200,
  height: 600,
  backgroundColor: '#0a0a0a',
  textColor: '#ffffff',
  gridColor: '#333333'
});
```

---

## 🎨 Customization

### Add Custom Keyboard Shortcuts

```javascript
// In your page's JavaScript
window.calosShortcuts.register('myapp:action', 'Mod+Shift+A', () => {
  // Your custom action
}, {
  description: 'My Custom Action',
  global: false
});
```

### Add Custom Chart Type

```javascript
// Extend ChartBuilder
ChartBuilder.prototype._buildCustomChart = function(data, options) {
  // Your custom chart implementation
};
```

### Custom CSV Formatting

```javascript
const exporter = new CSVExportEngine({
  formatValue: (value, column) => {
    if (column === 'price') return '$' + value.toFixed(2);
    return value;
  }
});
```

---

## 🐛 Troubleshooting

### Keyboard Shortcuts Not Working

1. Check browser console for errors
2. Ensure scripts are loaded:
   ```html
   <script src="/lib/keyboard-shortcut-manager.js"></script>
   <script src="/lib/keyboard-shortcuts.js"></script>
   ```
3. Press `Mod+/` to verify installation

### Scraping Returns Empty Data

1. Check source URL is accessible
2. Verify table selector: `document.querySelectorAll('table')`
3. Enable debug mode: `new UniversalTableScraper({ debug: true })`

### CSV Export in Excel Shows Gibberish

1. Ensure BOM is enabled: `{ bom: true }`
2. File should start with UTF-8 BOM (`\uFEFF`)

### Charts Not Generating

1. Check `canvas` package is installed: `npm install canvas`
2. Verify data format matches chart type
3. Check server logs for errors

---

## 📖 Examples

See `docs/examples/` for complete examples:

- `keyboard-shortcuts-demo.html` - Keyboard shortcut examples
- `table-scraper-demo.js` - Scraping examples
- `csv-export-demo.js` - CSV export examples
- `chart-builder-demo.js` - Chart generation examples

---

**Built with ❤️ by CALOS**

*Cross-platform data tools • Keyboard shortcuts • Table scraping • CSV export • Chart visualization*
