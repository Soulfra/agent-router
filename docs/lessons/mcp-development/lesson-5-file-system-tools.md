# Lesson 5: File System Tools

**Track:** Privacy-First MCP Development
**Lesson:** 5 of 8
**XP Reward:** 110
**Time:** 40 minutes
**Prerequisites:** Lesson 3 (Build First Tool), Lesson 4 (RPG Integration)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Use file system MCP tools safely
- ✅ Read files from the project directory
- ✅ Write files with proper validation
- ✅ List directory contents
- ✅ Understand sandboxing and security

## File System MCP Tools

The MCP server provides three file system tools:

### 1. `filesystem_read` - Read Files

```javascript
// Request
{
  tool: 'filesystem_read',
  input: {
    path: './package.json'
  }
}

// Response
{
  content: '{"name": "agent-router", "version": "1.0.0", ...}',
  path: './package.json',
  size: 1234,
  encoding: 'utf8'
}
```

### 2. `filesystem_write` - Write Files

```javascript
// Request
{
  tool: 'filesystem_write',
  input: {
    path: './output/result.txt',
    content: 'Hello, World!',
    encoding: 'utf8' // optional, default: 'utf8'
  }
}

// Response
{
  path: './output/result.txt',
  bytesWritten: 13,
  success: true
}
```

### 3. `filesystem_list` - List Directory

```javascript
// Request
{
  tool: 'filesystem_list',
  input: {
    path: './lib',
    recursive: false // optional
  }
}

// Response
{
  path: './lib',
  entries: [
    {
      name: 'agent-selector.js',
      type: 'file',
      size: 5432,
      modified: '2025-01-15T10:30:00Z'
    },
    {
      name: 'mcp-server',
      type: 'directory',
      size: 0,
      modified: '2025-01-15T10:30:00Z'
    }
  ],
  count: 2
}
```

## Security: Sandboxing

**IMPORTANT:** File system tools are sandboxed to the project directory only.

### What's Allowed ✅

```javascript
// Read files in project
filesystem_read({ path: './package.json' })
filesystem_read({ path: './lib/some-file.js' })
filesystem_read({ path: './docs/README.md' })

// Write files in project
filesystem_write({ path: './output/data.json', content: '{}' })
filesystem_write({ path: './logs/app.log', content: 'Log entry' })
```

### What's Blocked ❌

```javascript
// Access outside project directory
filesystem_read({ path: '../../../etc/passwd' })  // BLOCKED
filesystem_read({ path: '/etc/hosts' })           // BLOCKED
filesystem_read({ path: '~/.ssh/id_rsa' })        // BLOCKED

// Write to system directories
filesystem_write({ path: '/usr/bin/evil', content: '...' })  // BLOCKED
```

The MCP server validates all paths and rejects any that escape the project directory.

## Example 1: Read Configuration File

```javascript
async function readConfig() {
  try {
    const response = await fetch('http://localhost:3100/mcp/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'filesystem_read',
        input: {
          path: './package.json'
        }
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    const result = data.result;
    const config = JSON.parse(result.content);

    console.log('Package name:', config.name);
    console.log('Version:', config.version);
    console.log('Dependencies:', Object.keys(config.dependencies || {}));

    return config;

  } catch (error) {
    console.error('Failed to read config:', error);
    throw error;
  }
}

// Usage
readConfig();
```

## Example 2: Write Log File

```javascript
async function writeLog(message) {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    const response = await fetch('http://localhost:3100/mcp/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'filesystem_write',
        input: {
          path: './logs/app.log',
          content: logEntry
        }
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    console.log(`Logged: ${message}`);
    return data.result;

  } catch (error) {
    console.error('Failed to write log:', error);
    throw error;
  }
}

// Usage
writeLog('User completed lesson 5');
```

## Example 3: List Project Files

```javascript
async function listProjectFiles(directory = './lib') {
  try {
    const response = await fetch('http://localhost:3100/mcp/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'filesystem_list',
        input: {
          path: directory,
          recursive: false
        }
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    const result = data.result;

    console.log(`\nFiles in ${result.path}:`);
    console.log('─'.repeat(50));

    result.entries.forEach(entry => {
      const icon = entry.type === 'directory' ? '📁' : '📄';
      const size = entry.type === 'file' ? ` (${entry.size} bytes)` : '';
      console.log(`${icon} ${entry.name}${size}`);
    });

    console.log('─'.repeat(50));
    console.log(`Total: ${result.count} entries`);

    return result;

  } catch (error) {
    console.error('Failed to list files:', error);
    throw error;
  }
}

// Usage
listProjectFiles('./lib');
```

## Lab: Build a File Browser

Create an interactive file browser that lets you navigate the project directory.

### HTML Structure

```html
<!DOCTYPE html>
<html>
<head>
  <title>File Browser</title>
  <style>
    body {
      font-family: monospace;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .breadcrumb {
      padding: 10px;
      background: #1a1a2e;
      border-radius: 5px;
      margin-bottom: 10px;
    }

    .file-list {
      background: #1a1a2e;
      border-radius: 5px;
      padding: 10px;
    }

    .file-entry {
      padding: 10px;
      margin: 5px 0;
      background: #2a2a3e;
      border-radius: 5px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .file-entry:hover {
      background: #3a3a4e;
    }

    .file-entry.directory {
      border-left: 3px solid #667eea;
    }

    .file-entry.file {
      border-left: 3px solid #64ffda;
    }

    .file-name {
      flex: 1;
    }

    .file-size {
      color: #888;
      margin-left: 10px;
    }

    .file-content {
      background: #1a1a2e;
      padding: 15px;
      border-radius: 5px;
      margin-top: 10px;
      max-height: 400px;
      overflow-y: auto;
    }

    button {
      padding: 8px 15px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      margin: 5px;
    }

    button:hover {
      background: #764ba2;
    }

    pre {
      background: #0f0f23;
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>📁 File Browser</h1>

  <div class="breadcrumb">
    <strong>Current Path:</strong> <span id="currentPath">./</span>
    <button onclick="navigateUp()">⬆️ Up</button>
    <button onclick="navigateTo('./')">🏠 Home</button>
  </div>

  <div class="file-list" id="fileList">
    <p>Loading...</p>
  </div>

  <div class="file-content" id="fileContent" style="display: none;">
    <h3>File Content: <span id="fileName"></span></h3>
    <button onclick="closeFile()">Close</button>
    <pre id="contentDisplay"></pre>
  </div>

  <script>
    let currentPath = './';

    async function listFiles(path) {
      try {
        const response = await fetch('http://localhost:3100/mcp/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'filesystem_list',
            input: { path: path }
          })
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error);
        }

        displayFiles(data.result);
        currentPath = path;
        document.getElementById('currentPath').textContent = path;

      } catch (error) {
        document.getElementById('fileList').innerHTML =
          `<p style="color: #ff6b6b;">Error: ${error.message}</p>`;
      }
    }

    function displayFiles(result) {
      const fileList = document.getElementById('fileList');

      if (result.entries.length === 0) {
        fileList.innerHTML = '<p>Empty directory</p>';
        return;
      }

      const html = result.entries.map(entry => {
        const icon = entry.type === 'directory' ? '📁' : '📄';
        const sizeText = entry.type === 'file' ?
          `<span class="file-size">${formatBytes(entry.size)}</span>` : '';
        const className = entry.type === 'directory' ? 'directory' : 'file';
        const onclick = entry.type === 'directory' ?
          `navigateTo('${currentPath}/${entry.name}')` :
          `openFile('${currentPath}/${entry.name}')`;

        return `
          <div class="file-entry ${className}" onclick="${onclick}">
            <span class="file-name">${icon} ${entry.name}</span>
            ${sizeText}
          </div>
        `;
      }).join('');

      fileList.innerHTML = html;
    }

    async function openFile(path) {
      try {
        const response = await fetch('http://localhost:3100/mcp/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'filesystem_read',
            input: { path: path }
          })
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error);
        }

        document.getElementById('fileName').textContent = path;
        document.getElementById('contentDisplay').textContent = data.result.content;
        document.getElementById('fileContent').style.display = 'block';

      } catch (error) {
        alert('Failed to read file: ' + error.message);
      }
    }

    function closeFile() {
      document.getElementById('fileContent').style.display = 'none';
    }

    function navigateTo(path) {
      listFiles(path);
    }

    function navigateUp() {
      const parts = currentPath.split('/').filter(p => p && p !== '.');
      if (parts.length > 0) {
        parts.pop();
        const newPath = parts.length > 0 ? './' + parts.join('/') : './';
        navigateTo(newPath);
      }
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    // Load on page load
    window.addEventListener('load', () => {
      listFiles('./');
    });
  </script>
</body>
</html>
```

Save as `public/labs/file-browser.html` and open in browser.

## Best Practices

### 1. Always Validate Paths

```javascript
function validatePath(path) {
  // Ensure path starts with ./
  if (!path.startsWith('./')) {
    throw new Error('Path must start with ./');
  }

  // Block parent directory references
  if (path.includes('..')) {
    throw new Error('Parent directory access not allowed');
  }

  // Block absolute paths
  if (path.startsWith('/')) {
    throw new Error('Absolute paths not allowed');
  }

  return true;
}
```

### 2. Handle Binary Files

```javascript
async function readFile(path) {
  // Check file extension
  const ext = path.split('.').pop().toLowerCase();
  const isBinary = ['jpg', 'png', 'gif', 'pdf', 'zip'].includes(ext);

  if (isBinary) {
    console.warn('Binary file detected. Cannot display as text.');
    return null;
  }

  // Read as text
  return await filesystem_read({ path });
}
```

### 3. Create Directories First

```javascript
async function ensureDirectory(dirPath) {
  try {
    await filesystem_list({ path: dirPath });
  } catch (error) {
    // Directory doesn't exist, create it
    await filesystem_write({
      path: `${dirPath}/.gitkeep`,
      content: ''
    });
  }
}
```

## Summary

You've learned:
- ✅ How to use file system MCP tools (read, write, list)
- ✅ How sandboxing protects your system
- ✅ How to build a file browser with fetch()
- ✅ Best practices for file operations

## Next Lesson

**Lesson 6: Code Analysis Tools**

Learn how to search code using grep and find tools.

## Quiz

1. What directory can MCP file tools access?
   - a) Any directory on the system
   - b) Only the project directory
   - c) Only the home directory
   - d) Only the /tmp directory

2. Which tool reads file contents?
   - a) filesystem_open
   - b) filesystem_read
   - c) file_get_contents
   - d) read_file

3. What happens if you try to access `../../../etc/passwd`?
   - a) It reads the file
   - b) It's blocked by sandboxing
   - c) It returns an empty file
   - d) It crashes the server

**Answers:** 1-b, 2-b, 3-b

---

**🎴 Achievement Unlocked:** File System Expert (+110 XP)
