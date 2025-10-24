#!/bin/bash

# Post-Template Creation Setup Script
# Runs after "Use this template" to customize the repo

echo "🚀 Setting up OAuth Starter..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Copy .env.example to .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${GREEN}✓${NC} Created .env file"
else
  echo -e "${BLUE}ℹ${NC} .env already exists, skipping"
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

echo ""
echo -e "${GREEN}✓ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit .env - add your OAuth credentials"
echo "  2. See docs/SOCIAL-AUTH-SETUP.md for OAuth setup guide"
echo "  3. Test locally: npm start"
echo "  4. Deploy: vercel"
echo ""
echo "Questions? https://coldstartkit.com/docs/oauth-starter"
