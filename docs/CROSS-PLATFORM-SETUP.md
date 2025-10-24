# Cross-Platform Setup Guide

## Overview

The CALOS Agent Router auto-onboarding system works seamlessly across **macOS, Linux, Windows, WSL, Docker, and all CI/CD platforms**. This guide explains the cross-platform detection logic and troubleshooting.

## Supported Platforms

### ✅ Full Support

| Platform | Shell | Package Manager | Status |
|----------|-------|----------------|--------|
| macOS | bash, zsh | npm, pnpm, yarn | ✅ Tested |
| Linux | bash, sh | npm, pnpm, yarn | ✅ Tested |
| Windows 10/11 | PowerShell | npm, pnpm, yarn | ✅ Tested |
| Windows Terminal | PowerShell, CMD | npm, pnpm, yarn | ✅ Tested |
| WSL (Ubuntu) | bash | npm, pnpm, yarn | ✅ Tested |
| Docker (Unix) | sh, bash | npm | ✅ Tested |
| Docker (Windows) | PowerShell | npm | ✅ Tested |
| GitHub Actions | bash | npm | ✅ Tested |
| CircleCI | bash | npm | ✅ Tested |
| GitLab CI | bash | npm | ✅ Tested |

## Cross-Platform Features

### 1. Docker Detection

Works on all platforms:

**Unix/Linux:**
- Checks `/.dockerenv` file
- Checks `/proc/1/cgroup` for docker/containerd

**Windows:**
- Checks `C:\.containerenv`
- Checks `DOCKER_CONTAINER` environment variable

**Universal:**
- Environment variable: `DOCKER_CONTAINER=true`

### 2. Path Handling

Uses Node.js `path` module for cross-platform path handling:
- Automatically handles `/` (Unix) vs `\` (Windows)
- Uses `path.resolve()` for absolute paths
- Uses `path.relative()` for path comparisons

### 3. Color Output

**Unix/macOS:**
- ANSI color codes work in Terminal.app, iTerm2, etc.

**Windows:**
- Windows Terminal: Full color support (detected via `WT_SESSION`)
- PowerShell: Basic color support
- CMD: Limited color support
- ConEmu: Full color support (detected via `ConEmuANSI`)

**Disable colors:**
```bash
# Any platform
TERM=dumb npm install
```

### 4. Line Endings

`.gitattributes` ensures consistent line endings:
- Scripts (`.js`, `.sh`): Always LF (Unix-style)
- Windows scripts (`.bat`, `.cmd`, `.ps1`): CRLF
- Auto-detection for text files

## Platform-Specific Instructions

### macOS

```bash
# Standard install
npm install

# Disable setup prompt
export SKIP_SETUP_CHECK=1
npm install
```

### Linux (Ubuntu, Debian, etc.)

```bash
# Standard install
npm install

# Production deployment
NODE_ENV=production npm install
```

### Windows (PowerShell)

```powershell
# Standard install
npm install

# Disable setup prompt
$env:SKIP_SETUP_CHECK = "1"
npm install

# Production deployment
$env:NODE_ENV = "production"
npm install
```

### Windows (Command Prompt)

```cmd
REM Standard install
npm install

REM Disable setup prompt
set SKIP_SETUP_CHECK=1
npm install

REM Production deployment
set NODE_ENV=production
npm install
```

### WSL (Windows Subsystem for Linux)

```bash
# Works exactly like Linux
npm install

# Production
NODE_ENV=production npm install
```

### Docker (Unix-based images)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./

# Setup prompt automatically skipped in Docker
RUN npm install

COPY . .
CMD ["npm", "start"]
```

### Docker (Windows containers)

```dockerfile
FROM mcr.microsoft.com/windows/servercore:ltsc2022
WORKDIR /app
COPY package*.json ./

# Setup prompt automatically skipped
RUN npm install

COPY . .
CMD ["npm", "start"]
```

## CI/CD Platform Examples

### GitHub Actions

```yaml
name: Deploy
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install  # Auto-skips setup (CI=true)
      - run: npm test
```

### CircleCI

```yaml
version: 2.1
jobs:
  build:
    docker:
      - image: node:18
    steps:
      - checkout
      - run: npm install  # Auto-skips setup (CI=true)
      - run: npm test
```

### GitLab CI

```yaml
image: node:18

stages:
  - build
  - test

build:
  stage: build
  script:
    - npm install  # Auto-skips setup (CI=true)
    - npm run build
```

### Travis CI

```yaml
language: node_js
node_js:
  - "18"
install:
  - npm install  # Auto-skips setup (CI=true)
script:
  - npm test
```

## Environment Variables

All platforms support these environment variables:

| Variable | Effect | Example |
|----------|--------|---------|
| `CI` | Skip setup in CI/CD | `CI=true npm install` |
| `NODE_ENV` | Skip setup in production | `NODE_ENV=production npm install` |
| `SKIP_SETUP_CHECK` | Manual skip | `SKIP_SETUP_CHECK=1 npm install` |
| `npm_config_global` | Skip for global install | Auto-set by npm |
| `DOCKER_CONTAINER` | Force Docker detection | `DOCKER_CONTAINER=true` |
| `WT_SESSION` | Windows Terminal detection | Auto-set by Windows Terminal |
| `ConEmuANSI` | ConEmu color support | Auto-set by ConEmu |
| `FORCE_COLOR` | Force color output | `FORCE_COLOR=1 npm install` |

## Testing Cross-Platform Compatibility

Run the test suite:

```bash
# All platforms
node scripts/test-check-setup.js
```

Expected output:
```
🧪 Testing check-setup.js environment detection

✅ CI Environment - PASSED (skipped)
✅ Manual Skip Flag - PASSED (skipped)
✅ Global Install - PASSED (skipped)
✅ Production Environment - PASSED (skipped)
✅ Docker Environment (Unix) - PASSED (skipped)
✅ Windows Docker - PASSED (skipped)
✅ Windows Terminal with Color - PASSED (showed setup)
✅ Windows PowerShell - PASSED (showed setup)
✅ Local Development (simulated TTY) - PASSED (showed setup)

==================================================
✅ All tests passed!
==================================================
```

## Troubleshooting

### Setup prompt shows on Windows when it shouldn't

**Cause:** Running in non-production context

**Fix:**
```powershell
# PowerShell
$env:NODE_ENV = "production"
npm install

# CMD
set NODE_ENV=production
npm install
```

### Colors don't work in Windows CMD

**Cause:** CMD has limited ANSI color support

**Fix:** Use Windows Terminal or PowerShell instead

```powershell
# Install Windows Terminal
winget install Microsoft.WindowsTerminal
```

### Line ending issues on Windows

**Cause:** Git auto-converting LF to CRLF

**Fix:** `.gitattributes` handles this automatically. To reset:

```bash
# Remove cached files
git rm --cached -r .
git reset --hard
```

### Setup prompt shows in Docker

**Cause:** Custom Docker setup without detection markers

**Fix:** Add environment variable to Dockerfile

```dockerfile
ENV DOCKER_CONTAINER=true
```

### Path errors on Windows

**Cause:** Hardcoded Unix paths (`/` instead of `\`)

**Fix:** We use Node.js `path` module - no manual fixes needed

### Node.js not found on Windows

**Cause:** Node not in PATH

**Fix:**
```powershell
# Add Node to PATH (PowerShell as Admin)
[Environment]::SetEnvironmentVariable(
  "Path",
  $env:Path + ";C:\Program Files\nodejs",
  "Machine"
)
```

## Known Limitations

1. **Windows CMD color support** - Limited ANSI color support in legacy CMD (use Windows Terminal instead)
2. **Windows shebang** - `#!/usr/bin/env node` ignored on Windows (npm handles it)
3. **WSL path translation** - WSL uses Unix paths, may cause issues with Windows paths (use WSL paths consistently)

## Development Tips

### Testing on Multiple Platforms

**macOS/Linux:**
```bash
npm install  # Local dev
CI=true npm install  # Simulate CI
NODE_ENV=production npm install  # Simulate production
```

**Windows (PowerShell):**
```powershell
npm install  # Local dev
$env:CI = "true"; npm install  # Simulate CI
$env:NODE_ENV = "production"; npm install  # Simulate production
```

### Debugging Environment Detection

```bash
# See what environment is detected
node -e "console.log(process.platform, process.env.CI, process.env.NODE_ENV)"

# Test Docker detection
node -e "console.log(require('fs').existsSync('/.dockerenv'))"

# Test path handling
node -e "console.log(require('path').sep)"
```

## Support

- 📖 Main docs: `docs/DEPLOYMENT-SETUP.md`
- 🐛 Issues: https://github.com/calos/agent-router/issues
- 💬 Discord: https://discord.gg/calos

Report cross-platform issues with:
- Platform (macOS/Linux/Windows)
- Shell (bash/zsh/PowerShell/CMD)
- Node version (`node --version`)
- npm version (`npm --version`)
- Error message or unexpected behavior
