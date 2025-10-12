#!/bin/bash

# Soulfra Git Hooks Setup
# Installs pre-commit and pre-push hooks for cryptographic code signing

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$REPO_ROOT/.githooks"
GIT_HOOKS_DIR="$REPO_ROOT/.git/hooks"

echo ""
echo "🔐 Soulfra Git Hooks Setup"
echo "════════════════════════════════════════"
echo ""

# Check if we're in a git repository
if [ ! -d "$REPO_ROOT/.git" ]; then
  echo "❌ Error: Not a git repository"
  echo "   Run this script from within a git repository"
  exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo "❌ Error: Node.js not found"
  echo "   Please install Node.js to use Soulfra hooks"
  exit 1
fi

# Check if required dependencies are available
if [ ! -f "$REPO_ROOT/lib/soulfra-signer.js" ]; then
  echo "❌ Error: soulfra-signer.js not found"
  echo "   Please ensure lib/soulfra-signer.js exists"
  exit 1
fi

echo "✓ Git repository detected"
echo "✓ Node.js found: $(node --version)"
echo "✓ Soulfra signer found"
echo ""

# Create .git/hooks directory if it doesn't exist
mkdir -p "$GIT_HOOKS_DIR"

# Install pre-commit hook
echo "📝 Installing pre-commit hook..."
if [ -f "$GIT_HOOKS_DIR/pre-commit" ]; then
  echo "   ⚠️  Existing pre-commit hook found"
  echo "   Backing up to pre-commit.backup"
  mv "$GIT_HOOKS_DIR/pre-commit" "$GIT_HOOKS_DIR/pre-commit.backup"
fi

ln -s "$HOOKS_DIR/pre-commit" "$GIT_HOOKS_DIR/pre-commit"
chmod +x "$GIT_HOOKS_DIR/pre-commit"
echo "   ✓ pre-commit hook installed"

# Install pre-push hook
echo "📝 Installing pre-push hook..."
if [ -f "$GIT_HOOKS_DIR/pre-push" ]; then
  echo "   ⚠️  Existing pre-push hook found"
  echo "   Backing up to pre-push.backup"
  mv "$GIT_HOOKS_DIR/pre-push" "$GIT_HOOKS_DIR/pre-push.backup"
fi

ln -s "$HOOKS_DIR/pre-push" "$GIT_HOOKS_DIR/pre-push"
chmod +x "$GIT_HOOKS_DIR/pre-push"
echo "   ✓ pre-push hook installed"

# Create .soulfra directory structure
echo ""
echo "📁 Setting up Soulfra directories..."
mkdir -p "$REPO_ROOT/.soulfra/audit"
echo "   ✓ .soulfra/audit created"

# Add .soulfra to .gitignore if not already there
if ! grep -q "^.soulfra/$" "$REPO_ROOT/.gitignore" 2>/dev/null; then
  echo "" >> "$REPO_ROOT/.gitignore"
  echo "# Soulfra identity and audit trails (keep local)" >> "$REPO_ROOT/.gitignore"
  echo ".soulfra/" >> "$REPO_ROOT/.gitignore"
  echo "   ✓ Added .soulfra/ to .gitignore"
else
  echo "   ✓ .soulfra/ already in .gitignore"
fi

echo ""
echo "✅ Soulfra Git Hooks Installed!"
echo "════════════════════════════════════════"
echo ""
echo "What happens now:"
echo ""
echo "  Pre-Commit Hook (runs before commit):"
echo "    • Validates code (lint, tests)"
echo "    • Generates SoulfraHash signature"
echo "    • Creates immutable audit trail"
echo "    • Saves to .soulfra/audit/"
echo ""
echo "  Pre-Push Hook (runs before push):"
echo "    • Verifies all commit signatures"
echo "    • Validates cryptographic integrity"
echo "    • Updates Ollama models"
echo "    • Optional Web3 anchoring"
echo ""
echo "Your identity will be generated on first commit."
echo "Keep .soulfra/identity.json safe - it's your cryptographic identity!"
echo ""
echo "Try it now:"
echo "  git commit -m \"Test Soulfra hooks\""
echo ""
