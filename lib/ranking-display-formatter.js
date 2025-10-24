/**
 * Ranking Display Formatter
 *
 * Formats difficulty rankings and complexity analysis for display:
 * - ASCII art badges and charts
 * - Color-coded terminal output
 * - HTML/Markdown reports
 * - JSON for APIs
 * - Comparison tables
 */

class RankingDisplayFormatter {
  constructor() {
    // Terminal colors (ANSI)
    this.colors = {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      dim: '\x1b[2m',

      // Text colors
      black: '\x1b[30m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',

      // Background colors
      bgBlack: '\x1b[40m',
      bgRed: '\x1b[41m',
      bgGreen: '\x1b[42m',
      bgYellow: '\x1b[43m',
      bgBlue: '\x1b[44m',
      bgMagenta: '\x1b[45m',
      bgCyan: '\x1b[46m',
      bgWhite: '\x1b[47m'
    };

    // Difficulty colors
    this.difficultyColors = {
      trivial: 'green',
      easy: 'cyan',
      medium: 'yellow',
      hard: 'magenta',
      expert: 'red',
      master: 'red'
    };
  }

  /**
   * Format ranking as ASCII badge
   */
  formatBadge(ranking, useColor = true) {
    const difficulty = ranking.baseDifficulty.toUpperCase();
    const stars = '★'.repeat(ranking.stars) + '☆'.repeat(5 - ranking.stars);
    const icon = ranking.rankings ? this.getDifficultyIcon(ranking.baseDifficulty) : '●';

    const color = useColor ? this.getColor(this.difficultyColors[ranking.baseDifficulty]) : '';
    const reset = useColor ? this.colors.reset : '';

    let badge = '';
    badge += color;
    badge += '╔════════════════════════════╗\n';
    badge += `║ ${icon} ${difficulty.padEnd(22)} ║\n`;
    badge += `║ ${stars.padEnd(26)} ║\n`;
    badge += '╚════════════════════════════╝';
    badge += reset;

    return badge;
  }

  /**
   * Format full ranking report
   */
  formatReport(ranking, options = {}) {
    const {
      useColor = true,
      includeBreakdown = true,
      includeComparisons = true,
      includeTime = true
    } = options;

    let report = '';

    // Header
    report += this.formatHeader(ranking, useColor);
    report += '\n\n';

    // Main difficulty
    report += this.formatDifficultySummary(ranking, useColor);
    report += '\n\n';

    // Comparisons
    if (includeComparisons && ranking.rankings) {
      report += this.formatComparisons(ranking.rankings, useColor);
      report += '\n\n';
    }

    // Scores
    if (ranking.composite) {
      report += this.formatScores(ranking.composite, useColor);
      report += '\n\n';
    }

    // Time estimate
    if (includeTime && ranking.estimatedTime) {
      report += this.formatTimeEstimate(ranking.estimatedTime, useColor);
      report += '\n\n';
    }

    // Breakdown
    if (includeBreakdown && ranking.breakdown) {
      report += this.formatBreakdown(ranking.breakdown, useColor);
      report += '\n';
    }

    return report;
  }

  /**
   * Format header
   */
  formatHeader(ranking, useColor) {
    const bold = useColor ? this.colors.bold : '';
    const reset = useColor ? this.colors.reset : '';

    return `${bold}🎯 Difficulty Ranking Report${reset}\n${'═'.repeat(60)}`;
  }

  /**
   * Format difficulty summary
   */
  formatDifficultySummary(ranking, useColor) {
    const color = useColor ? this.getColor(this.difficultyColors[ranking.baseDifficulty]) : '';
    const bold = useColor ? this.colors.bold : '';
    const reset = useColor ? this.colors.reset : '';

    const icon = this.getDifficultyIcon(ranking.baseDifficulty);
    const stars = '★'.repeat(ranking.stars) + '☆'.repeat(5 - ranking.stars);

    let summary = '';
    summary += `${color}${bold}${icon} ${ranking.baseDifficulty.toUpperCase()}${reset} ${stars}\n`;

    if (ranking.description) {
      summary += `${ranking.description}`;
    }

    return summary;
  }

  /**
   * Format comparisons table
   */
  formatComparisons(rankings, useColor) {
    const cyan = useColor ? this.colors.cyan : '';
    const reset = useColor ? this.colors.reset : '';

    let table = `${cyan}📊 Difficulty Comparisons:${reset}\n`;
    table += '┌────────────┬──────────────────────────────┐\n';

    const systems = [
      { name: 'Sudoku', key: 'sudoku', icon: '🧩' },
      { name: 'Crossword', key: 'crossword', icon: '📰' },
      { name: 'LeetCode', key: 'leetcode', icon: '💻' },
      { name: 'Gaming', key: 'gaming', icon: '🎮' },
      { name: 'Climbing', key: 'climbing', icon: '🧗' }
    ];

    for (let i = 0; i < systems.length; i++) {
      const system = systems[i];
      const value = rankings[system.key] || 'N/A';

      table += `│ ${system.icon} ${system.name.padEnd(8)} │ ${value.padEnd(28)} │\n`;

      if (i < systems.length - 1) {
        table += '├────────────┼──────────────────────────────┤\n';
      }
    }

    table += '└────────────┴──────────────────────────────┘';

    return table;
  }

  /**
   * Format scores
   */
  formatScores(composite, useColor) {
    const cyan = useColor ? this.colors.cyan : '';
    const reset = useColor ? this.colors.reset : '';

    let scores = `${cyan}📈 Composite Score:${reset}\n`;

    if (composite.weighted !== undefined) {
      scores += `   Weighted Score: ${composite.weighted.toFixed(2)}\n`;
    }

    if (composite.normalized !== undefined) {
      const bar = this.createProgressBar(composite.normalized, 100, 30, useColor);
      scores += `   Normalized:     ${bar} ${composite.normalized.toFixed(1)}/100`;
    }

    return scores;
  }

  /**
   * Format time estimate
   */
  formatTimeEstimate(estimatedTime, useColor) {
    const cyan = useColor ? this.colors.cyan : '';
    const reset = useColor ? this.colors.reset : '';

    let time = `${cyan}⏱️  Estimated Solving Time:${reset}\n`;
    time += `   ${estimatedTime.display}\n`;

    if (estimatedTime.range) {
      time += `   Range: ${estimatedTime.range.min}-${estimatedTime.range.max} minutes`;
    }

    return time;
  }

  /**
   * Format breakdown table
   */
  formatBreakdown(breakdown, useColor) {
    const cyan = useColor ? this.colors.cyan : '';
    const dim = useColor ? this.colors.dim : '';
    const reset = useColor ? this.colors.reset : '';

    let table = `${cyan}🔍 Difficulty Breakdown:${reset}\n\n`;

    for (const item of breakdown) {
      table += `${item.factor} ${dim}(${item.weight})${reset}\n`;
      table += `   Score: ${item.score} → Contribution: ${item.contribution}\n`;

      if (item.details && item.details.length > 0) {
        table += '   Details:\n';
        for (const detail of item.details) {
          table += `     • ${detail}\n`;
        }
      }

      table += '\n';
    }

    return table;
  }

  /**
   * Format comparison table
   */
  formatComparisonTable(rankings, useColor = true) {
    const bold = useColor ? this.colors.bold : '';
    const reset = useColor ? this.colors.reset : '';

    let table = `${bold}Difficulty Comparison${reset}\n`;
    table += '┌────────────────────┬──────────┬───────┬──────────────┐\n';
    table += '│ Name               │ Rank     │ Stars │ Time         │\n';
    table += '├────────────────────┼──────────┼───────┼──────────────┤\n';

    for (const ranking of rankings) {
      const name = ranking.name || 'Unknown';
      const difficulty = ranking.baseDifficulty;
      const stars = '★'.repeat(ranking.stars);
      const time = ranking.estimatedTime?.display || 'N/A';

      const color = useColor ? this.getColor(this.difficultyColors[difficulty]) : '';
      const resetColor = useColor ? this.colors.reset : '';

      table += `│ ${name.padEnd(18)} │ ${color}${difficulty.padEnd(8)}${resetColor} │ ${stars.padEnd(5)} │ ${time.padEnd(12)} │\n`;
    }

    table += '└────────────────────┴──────────┴───────┴──────────────┘';

    return table;
  }

  /**
   * Format as markdown
   */
  formatMarkdown(ranking) {
    let md = '';

    // Header
    md += `# 🎯 Difficulty Ranking\n\n`;

    // Badge
    const icon = this.getDifficultyIcon(ranking.baseDifficulty);
    const stars = '⭐'.repeat(ranking.stars);
    md += `## ${icon} ${ranking.baseDifficulty.toUpperCase()} ${stars}\n\n`;

    if (ranking.description) {
      md += `${ranking.description}\n\n`;
    }

    // Comparisons
    if (ranking.rankings) {
      md += `## 📊 Difficulty Comparisons\n\n`;
      md += `| System | Difficulty |\n`;
      md += `|--------|------------|\n`;
      md += `| 🧩 Sudoku | ${ranking.rankings.sudoku} |\n`;
      md += `| 📰 Crossword | ${ranking.rankings.crossword} |\n`;
      md += `| 💻 LeetCode | ${ranking.rankings.leetcode} |\n`;
      md += `| 🎮 Gaming | ${ranking.rankings.gaming} |\n`;
      md += `| 🧗 Climbing | ${ranking.rankings.climbing} |\n\n`;
    }

    // Scores
    if (ranking.composite) {
      md += `## 📈 Scores\n\n`;
      md += `- **Weighted Score:** ${ranking.composite.weighted?.toFixed(2) || 'N/A'}\n`;
      md += `- **Normalized:** ${ranking.composite.normalized?.toFixed(1) || 'N/A'}/100\n\n`;
    }

    // Time
    if (ranking.estimatedTime) {
      md += `## ⏱️ Estimated Time\n\n`;
      md += `${ranking.estimatedTime.display}\n\n`;
    }

    // Breakdown
    if (ranking.breakdown && ranking.breakdown.length > 0) {
      md += `## 🔍 Breakdown\n\n`;

      for (const item of ranking.breakdown) {
        md += `### ${item.factor}\n\n`;
        md += `- **Score:** ${item.score}\n`;
        md += `- **Weight:** ${item.weight}\n`;
        md += `- **Contribution:** ${item.contribution}\n\n`;

        if (item.details && item.details.length > 0) {
          md += `**Details:**\n\n`;
          for (const detail of item.details) {
            md += `- ${detail}\n`;
          }
          md += '\n';
        }
      }
    }

    return md;
  }

  /**
   * Format as HTML
   */
  formatHTML(ranking) {
    const color = this.getDifficultyHTMLColor(ranking.baseDifficulty);
    const icon = this.getDifficultyIcon(ranking.baseDifficulty);
    const stars = '⭐'.repeat(ranking.stars);

    let html = `
<!DOCTYPE html>
<html>
<head>
  <title>Difficulty Ranking</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .badge {
      background: ${color};
      color: white;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
      margin-bottom: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .badge h1 {
      margin: 0;
      font-size: 2.5em;
    }
    .card {
      background: white;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 20px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #eee;
    }
    .progress-bar {
      background: #eee;
      height: 30px;
      border-radius: 15px;
      overflow: hidden;
    }
    .progress-fill {
      background: ${color};
      height: 100%;
      transition: width 0.3s ease;
    }
  </style>
</head>
<body>
  <div class="badge">
    <h1>${icon} ${ranking.baseDifficulty.toUpperCase()}</h1>
    <p style="font-size: 1.5em; margin: 10px 0;">${stars}</p>
    <p>${ranking.description || ''}</p>
  </div>
`;

    // Comparisons
    if (ranking.rankings) {
      html += `
  <div class="card">
    <h2>📊 Difficulty Comparisons</h2>
    <table>
      <tr><td>🧩 Sudoku</td><td>${ranking.rankings.sudoku}</td></tr>
      <tr><td>📰 Crossword</td><td>${ranking.rankings.crossword}</td></tr>
      <tr><td>💻 LeetCode</td><td>${ranking.rankings.leetcode}</td></tr>
      <tr><td>🎮 Gaming</td><td>${ranking.rankings.gaming}</td></tr>
      <tr><td>🧗 Climbing</td><td>${ranking.rankings.climbing}</td></tr>
    </table>
  </div>
`;
    }

    // Scores
    if (ranking.composite) {
      html += `
  <div class="card">
    <h2>📈 Scores</h2>
    <p><strong>Weighted Score:</strong> ${ranking.composite.weighted?.toFixed(2) || 'N/A'}</p>
    <p><strong>Normalized:</strong></p>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${ranking.composite.normalized || 0}%"></div>
    </div>
    <p style="text-align: center; margin-top: 5px;">${ranking.composite.normalized?.toFixed(1) || 0}/100</p>
  </div>
`;
    }

    // Time
    if (ranking.estimatedTime) {
      html += `
  <div class="card">
    <h2>⏱️ Estimated Time</h2>
    <p><strong>${ranking.estimatedTime.display}</strong></p>
    <p>Range: ${ranking.estimatedTime.range?.min || 0}-${ranking.estimatedTime.range?.max || 0} minutes</p>
  </div>
`;
    }

    html += `
</body>
</html>
`;

    return html;
  }

  /**
   * Format as JSON
   */
  formatJSON(ranking) {
    return JSON.stringify(ranking, null, 2);
  }

  /**
   * Create progress bar
   */
  createProgressBar(value, max, width, useColor) {
    const percent = (value / max) * 100;
    const filled = Math.round((width * percent) / 100);
    const empty = width - filled;

    const color = useColor ? this.colors.cyan : '';
    const dim = useColor ? this.colors.dim : '';
    const reset = useColor ? this.colors.reset : '';

    return `${color}${'█'.repeat(filled)}${reset}${dim}${'░'.repeat(empty)}${reset}`;
  }

  /**
   * Get ANSI color code
   */
  getColor(colorName) {
    return this.colors[colorName] || '';
  }

  /**
   * Get difficulty icon
   */
  getDifficultyIcon(difficulty) {
    const icons = {
      trivial: '🟢',
      easy: '🔵',
      medium: '🟡',
      hard: '🟠',
      expert: '🔴',
      master: '🟣'
    };

    return icons[difficulty] || '⚪';
  }

  /**
   * Get difficulty HTML color
   */
  getDifficultyHTMLColor(difficulty) {
    const colors = {
      trivial: '#28a745',
      easy: '#5cb85c',
      medium: '#ffc107',
      hard: '#fd7e14',
      expert: '#dc3545',
      master: '#6f42c1'
    };

    return colors[difficulty] || '#6c757d';
  }

  /**
   * Format leaderboard
   */
  formatLeaderboard(rankings, useColor = true) {
    const bold = useColor ? this.colors.bold : '';
    const reset = useColor ? this.colors.reset : '';

    let board = `${bold}🏆 Leaderboard${reset}\n`;
    board += '═'.repeat(60) + '\n\n';

    // Sort by difficulty (descending)
    const sorted = [...rankings].sort((a, b) => {
      const order = ['trivial', 'easy', 'medium', 'hard', 'expert', 'master'];
      return order.indexOf(b.baseDifficulty) - order.indexOf(a.baseDifficulty);
    });

    for (let i = 0; i < sorted.length; i++) {
      const rank = i + 1;
      const medal = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `${rank}.`;
      const ranking = sorted[i];

      const color = useColor ? this.getColor(this.difficultyColors[ranking.baseDifficulty]) : '';
      const resetColor = useColor ? this.colors.reset : '';

      const name = ranking.name || `Entry ${i + 1}`;
      const difficulty = ranking.baseDifficulty.toUpperCase();
      const stars = '★'.repeat(ranking.stars);

      board += `${medal} ${color}${difficulty.padEnd(8)}${resetColor} ${stars} - ${name}\n`;
    }

    return board;
  }
}

module.exports = RankingDisplayFormatter;
