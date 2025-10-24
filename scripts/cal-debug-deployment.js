#!/usr/bin/env node
/**
 * Cal Debug Deployment
 * Uses CalDebugger to analyze deployment issues autonomously
 */

const CalDebugger = require('../lib/cal-debugger');
const chalk = require('chalk');

async function debugDeployment() {
  console.log(chalk.cyan.bold('\n🤖 Cal Debugging Deployment Issues\n'));

  const calDebugger = new CalDebugger({ verbose: true });

  // The problem: HTTP server returns 404 for /lessons when serving from public/
  const problem = {
    filePath: 'public/lessons/index.html',
    errorMessage: `
HTTP Server Logs:
- Server serving from: public/
- GET /lessons → 404 Not found
- GET / → 200 OK (directory listing)

Expected behavior: /lessons should load /lessons/index.html
Actual behavior: 404 error

Directory structure:
public/
  lessons/
    index.html
    app.js
    lessons.json
    style.css
  labs/
    *.html
`,
    code: `
// Current server command:
npx http-server public -p 8080

// Logs show:
[2025-10-24T13:18:59.181Z]  "GET /lessons" → 404
    `,
    context: {
      taskType: 'deployment-debugging',
      serverType: 'http-server',
      expectedRoute: '/lessons',
      actualFile: 'public/lessons/index.html'
    }
  };

  console.log(chalk.yellow('Problem Description:'));
  console.log(chalk.gray(problem.errorMessage));
  console.log('\n');

  try {
    const result = await calDebugger.debug(problem);

    console.log('\n');
    console.log(chalk.cyan.bold('📊 Cal\'s Analysis:\n'));
    console.log(result);

  } catch (error) {
    console.error(chalk.red('\n❌ Cal\'s debugging failed:'), error.message);
    console.log(chalk.yellow('\n💡 Manual diagnosis:'));
    console.log(chalk.white(`
The issue is: http-server doesn't auto-route /lessons to /lessons/index.html

Solutions:
1. Access via full path: http://localhost:8080/lessons/index.html
2. Access via directory: http://localhost:8080/lessons/ (trailing slash)
3. Change server root: npx http-server public/lessons -p 8080
4. Deploy to GitHub Pages (handles routing automatically)
    `));
  }
}

debugDeployment();
