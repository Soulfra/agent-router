#!/bin/bash
# CLI Status Checker for CalOS Agent Router
# Helps Cal (or any agent) check current authentication and configuration status

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  📊 CalOS CLI Status Check"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Current timestamp
echo -e "${BLUE}📅 Current Time:${NC}"
echo "   $(date)"
echo ""

# System info
echo -e "${BLUE}💻 System Info:${NC}"
echo "   User: $(whoami)"
echo "   Host: $(hostname)"
echo "   Dir:  $(pwd)"
echo ""

# Git configuration
echo -e "${BLUE}🔧 Git Configuration:${NC}"

# Global config
GLOBAL_NAME=$(git config --global user.name 2>/dev/null || echo "not set")
GLOBAL_EMAIL=$(git config --global user.email 2>/dev/null || echo "not set")
echo -e "   Global: ${GREEN}$GLOBAL_NAME <$GLOBAL_EMAIL>${NC}"

# Local config (if exists)
LOCAL_NAME=$(git config --local user.name 2>/dev/null || echo "")
LOCAL_EMAIL=$(git config --local user.email 2>/dev/null || echo "")

if [ -n "$LOCAL_NAME" ] || [ -n "$LOCAL_EMAIL" ]; then
    if [ "$LOCAL_EMAIL" != "$GLOBAL_EMAIL" ]; then
        echo -e "   Local:  ${YELLOW}$LOCAL_NAME <$LOCAL_EMAIL> ⚠️  OVERRIDE${NC}"
        echo -e "   ${YELLOW}⚠️  Local config overrides global - commits won't show on your GitHub profile!${NC}"
        echo -e "   ${YELLOW}   Fix: git config --local --unset user.name && git config --local --unset user.email${NC}"
    else
        echo -e "   Local:  ${GREEN}$LOCAL_NAME <$LOCAL_EMAIL> ✅ Matches global${NC}"
    fi
else
    echo -e "   Local:  ${GREEN}None (using global) ✅${NC}"
fi

echo ""

# GitHub CLI
echo -e "${BLUE}🐙 GitHub CLI:${NC}"
if command -v gh &> /dev/null; then
    if gh auth status &> /dev/null; then
        GH_USER=$(gh api user -q .login 2>/dev/null || echo "unknown")
        echo -e "   ${GREEN}✅ Logged in as: $GH_USER${NC}"

        # Check scopes
        if gh auth status 2>&1 | grep -q "gist"; then
            echo -e "   ${GREEN}   ✅ Gist scope enabled${NC}"
        else
            echo -e "   ${YELLOW}   ⚠️  Gist scope not enabled${NC}"
        fi

        if gh auth status 2>&1 | grep -q "repo"; then
            echo -e "   ${GREEN}   ✅ Repo scope enabled${NC}"
        else
            echo -e "   ${YELLOW}   ⚠️  Repo scope not enabled${NC}"
        fi
    else
        echo -e "   ${RED}❌ Not logged in${NC}"
        echo -e "   ${YELLOW}   Run: gh auth login${NC}"
    fi
else
    echo -e "   ${RED}❌ GitHub CLI not installed${NC}"
    echo -e "   ${YELLOW}   Install: brew install gh${NC}"
fi
echo ""

# Railway CLI
echo -e "${BLUE}🚂 Railway CLI:${NC}"
if command -v railway &> /dev/null; then
    if railway whoami &> /dev/null; then
        RAILWAY_USER=$(railway whoami 2>&1)
        echo -e "   ${GREEN}✅ Logged in as: $RAILWAY_USER${NC}"
    else
        echo -e "   ${RED}❌ Not logged in${NC}"
        echo -e "   ${YELLOW}   Run: railway login${NC}"
    fi
else
    echo -e "   ${RED}❌ Railway CLI not installed${NC}"
    echo -e "   ${YELLOW}   Install: npm install -g @railway/cli${NC}"
fi
echo ""

# Git remote
echo -e "${BLUE}🔗 Git Remote:${NC}"
if git remote -v &> /dev/null; then
    REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "not set")
    if [ "$REMOTE_URL" != "not set" ]; then
        echo -e "   ${GREEN}✅ Origin: $REMOTE_URL${NC}"
    else
        echo -e "   ${YELLOW}⚠️  No origin remote set${NC}"
        echo -e "   ${YELLOW}   Run: git remote add origin https://github.com/Soulfra/agent-router.git${NC}"
    fi
else
    echo -e "   ${RED}❌ Not a git repository${NC}"
fi
echo ""

# Environment configuration
echo -e "${BLUE}📧 Email Configuration (.env):${NC}"
if [ -f ".env" ]; then
    EMAIL_FROM=$(grep "EMAIL_FROM_ADDRESS=" .env 2>/dev/null | cut -d'=' -f2)
    EMAIL_NAME=$(grep "EMAIL_FROM_NAME=" .env 2>/dev/null | cut -d'=' -f2)

    if [ -n "$EMAIL_FROM" ]; then
        echo -e "   From: ${GREEN}$EMAIL_NAME <$EMAIL_FROM>${NC}"
    else
        echo -e "   ${YELLOW}⚠️  EMAIL_FROM_ADDRESS not set in .env${NC}"
    fi

    DOMAIN=$(grep "DOMAIN=" .env 2>/dev/null | cut -d'=' -f2 || echo "not set")
    if [ "$DOMAIN" != "not set" ]; then
        echo -e "   Domain: ${GREEN}$DOMAIN${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠️  No .env file found${NC}"
fi
echo ""

# Database configuration
echo -e "${BLUE}🗄️  Database Configuration:${NC}"
if [ -f ".env" ]; then
    DB_TYPE=$(grep "^DB_TYPE=" .env 2>/dev/null | cut -d'=' -f2 || echo "postgres")
    DB_HOST=$(grep "^DB_HOST=" .env 2>/dev/null | cut -d'=' -f2)
    DB_NAME=$(grep "^DB_NAME=" .env 2>/dev/null | cut -d'=' -f2)
    DB_USER=$(grep "^DB_USER=" .env 2>/dev/null | cut -d'=' -f2)
    DATABASE_URL=$(grep "^DATABASE_URL=" .env 2>/dev/null | cut -d'=' -f2)

    if [ -n "$DATABASE_URL" ]; then
        echo -e "   ${GREEN}✅ DATABASE_URL set (production mode)${NC}"
    elif [ -n "$DB_HOST" ]; then
        echo -e "   Type: ${GREEN}$DB_TYPE${NC}"
        echo -e "   Host: ${GREEN}$DB_HOST${NC}"
        echo -e "   Database: ${GREEN}$DB_NAME${NC}"
        echo -e "   User: ${GREEN}$DB_USER${NC}"
    else
        echo -e "   ${YELLOW}⚠️  No database configured${NC}"
    fi
fi
echo ""

# Deployment status
echo -e "${BLUE}🚀 Deployment Status:${NC}"

# Check if code is pushed
if git remote -v &> /dev/null; then
    UNPUSHED=$(git log origin/main..HEAD 2>/dev/null | wc -l || echo "0")
    UNPUSHED=$(echo "$UNPUSHED" | tr -d ' ')

    if [ "$UNPUSHED" = "0" ]; then
        echo -e "   ${GREEN}✅ All commits pushed to GitHub${NC}"
    else
        echo -e "   ${YELLOW}⚠️  $UNPUSHED unpushed commits${NC}"
        echo -e "   ${YELLOW}   Run: git push origin main${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠️  No remote configured${NC}"
fi

# Check deployment configs
if [ -f "deployment/render.yaml" ]; then
    echo -e "   ${GREEN}✅ Render config exists${NC}"
fi

if [ -f "railway.json" ]; then
    echo -e "   ${GREEN}✅ Railway config exists${NC}"
fi

if [ -f "vercel.json" ]; then
    echo -e "   ${GREEN}✅ Vercel config exists${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${GREEN}✨ Status check complete!${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Quick actions
echo -e "${BLUE}💡 Quick Actions:${NC}"
echo ""
echo "  Fix git identity:"
echo "    git config --local --unset user.name"
echo "    git config --local --unset user.email"
echo ""
echo "  Login to services:"
echo "    gh auth login"
echo "    railway login"
echo ""
echo "  Push to GitHub:"
echo "    git push -u origin main"
echo ""
echo "  Deploy:"
echo "    ./deploy-to-railway.sh"
echo "    # OR go to render.com and connect GitHub"
echo ""
