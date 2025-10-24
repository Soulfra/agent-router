#!/bin/bash
# Quick deploy to Railway with PostgreSQL
# Usage: ./deploy-to-railway.sh

set -e  # Exit on error

echo "🚀 CalOS Railway Deployment"
echo "=========================================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found"
    echo "Install: npm install -g @railway/cli"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Please login to Railway first:"
    echo "   railway login"
    echo ""
    read -p "Press Enter after logging in..."
fi

# Check if project exists
if ! railway status &> /dev/null; then
    echo "📦 No Railway project found. Creating..."
    echo ""
    echo "Please select:"
    echo "1. Create new project (recommended)"
    echo "2. Link existing project"
    read -p "Choice (1-2): " choice

    case $choice in
        1)
            echo "Creating new Railway project..."
            railway init
            ;;
        2)
            echo "Linking existing project..."
            railway link
            ;;
        *)
            echo "Invalid choice"
            exit 1
            ;;
    esac
fi

echo ""
echo "✅ Railway project ready"
echo ""

# Check if PostgreSQL is added
echo "🔍 Checking for PostgreSQL addon..."
if ! railway variables | grep -q "DATABASE_URL"; then
    echo "📊 PostgreSQL not found. Adding..."
    echo ""
    echo "Please run: railway add"
    echo "Then select: PostgreSQL"
    echo ""
    read -p "Press Enter after adding PostgreSQL..."
else
    echo "✅ PostgreSQL found"
fi

echo ""
echo "🗄️  Exporting local database..."
./scripts/export-db-for-railway.sh

echo ""
echo "🚀 Deploying to Railway..."
railway up

echo ""
echo "⏳ Waiting for deployment to complete (30s)..."
sleep 30

echo ""
echo "📊 Importing database schema and data..."
railway run psql $DATABASE_URL < railway-db-export/schema.sql
railway run psql $DATABASE_URL < railway-db-export/learning_data.sql

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📍 Your API URL:"
railway domain
echo ""

# Get the domain
DOMAIN=$(railway domain 2>&1 | grep -o 'https://[^ ]*' | head -1)

if [ -n "$DOMAIN" ]; then
    echo "🧪 Testing API endpoint..."
    echo "GET $DOMAIN/api/learning/paths"
    echo ""

    # Test the endpoint
    RESPONSE=$(curl -s "$DOMAIN/api/learning/paths")

    if echo "$RESPONSE" | grep -q "success"; then
        echo "✅ API is working!"
        echo ""
        echo "$RESPONSE" | head -20
    else
        echo "⚠️  API responded but may have errors"
        echo "$RESPONSE"
    fi

    echo ""
    echo "🎯 Next steps:"
    echo "1. Update frontend API URL in projects/soulfra.github.io/learn/index.html"
    echo "   Change API_BASE to: '$DOMAIN'"
    echo ""
    echo "2. Commit and push to GitHub:"
    echo "   cd projects/soulfra.github.io"
    echo "   git add learn/index.html"
    echo "   git commit -m 'Update API endpoint to Railway'"
    echo "   git push origin main"
    echo ""
    echo "3. Test the deployed learning hub:"
    echo "   https://soulfra.github.io/learn/"
else
    echo "⚠️  Could not get Railway domain. Check manually:"
    echo "   railway domain"
fi

echo ""
echo "📚 Full deployment guide: cat RAILWAY_DEPLOYMENT_GUIDE.md"
