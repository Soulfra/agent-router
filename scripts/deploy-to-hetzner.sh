#!/bin/bash
#
# Hetzner Deployment Script
# Deploys your working local setup to Hetzner VPS
#
# Usage:
#   ./scripts/deploy-to-hetzner.sh <hetzner-ip> [brand]
#   ./scripts/deploy-to-hetzner.sh 123.45.67.89 calriven
#

set -e  # Exit on error

HETZNER_IP=$1
BRAND=${2:-calriven}  # Default to calriven

if [ -z "$HETZNER_IP" ]; then
  echo "❌ Error: Hetzner IP required"
  echo ""
  echo "Usage: $0 <hetzner-ip> [brand]"
  echo ""
  echo "Examples:"
  echo "  $0 123.45.67.89 calriven"
  echo "  $0 123.45.67.89 soulfra"
  echo "  $0 123.45.67.89 vibecoding"
  exit 1
fi

echo "🚀 Deploying to Hetzner VPS"
echo "   IP: $HETZNER_IP"
echo "   Brand: $BRAND"
echo ""

# Check if .env file exists for brand
if [ ! -f ".env.$BRAND" ]; then
  echo "❌ Error: .env.$BRAND not found"
  echo "   Available: .env.calriven, .env.soulfra, .env.vibecoding"
  exit 1
fi

echo "📦 Step 1: Installing dependencies on Hetzner..."
ssh root@$HETZNER_IP << 'INSTALL_EOF'
set -e
echo "  → Updating apt packages..."
apt update -qq
echo "  → Installing Node.js, PostgreSQL, nginx, git..."
apt install -y nodejs npm postgresql nginx git curl > /dev/null 2>&1
echo "  → Installing PM2 process manager..."
npm install -g pm2 > /dev/null 2>&1
echo "  ✓ Dependencies installed"
INSTALL_EOF

echo ""
echo "📁 Step 2: Copying project to Hetzner..."
echo "  → Syncing files (excluding node_modules)..."
rsync -avz --progress \
  --exclude node_modules \
  --exclude .git \
  --exclude database/backups \
  --exclude oauth-exports \
  --exclude .unicode-cache \
  . root@$HETZNER_IP:/var/www/agent-router/

echo ""
echo "⚙️  Step 3: Setting up environment and database..."
ssh root@$HETZNER_IP << SETUP_EOF
set -e
cd /var/www/agent-router

echo "  → Copying $BRAND environment config..."
cp .env.$BRAND .env

echo "  → Installing npm packages..."
npm install > /dev/null 2>&1

echo "  → Setting up PostgreSQL database..."
# Check if database exists
DB_EXISTS=\$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='calos'")
if [ "\$DB_EXISTS" != "1" ]; then
  echo "  → Creating database 'calos'..."
  sudo -u postgres createdb calos
  sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
fi

echo "  → Running database migrations..."
DB_USER=postgres DB_PASSWORD=postgres node scripts/auto-migrate.js --quiet

echo "  ✓ Database ready"
SETUP_EOF

echo ""
echo "🚀 Step 4: Starting application with PM2..."
ssh root@$HETZNER_IP << START_EOF
set -e
cd /var/www/agent-router

# Stop existing process if running
pm2 delete $BRAND 2>/dev/null || true

# Start with environment variables
DB_USER=postgres DB_PASSWORD=postgres pm2 start router.js \
  --name $BRAND \
  --env production

# Save PM2 process list
pm2 save

# Set up PM2 to start on boot
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true

echo "  ✓ Application started"
START_EOF

echo ""
echo "✅ Deployment Complete!"
echo ""
echo "📊 Server Info:"
echo "   HTTP: http://$HETZNER_IP:5001"
echo "   Brand: $BRAND"
echo ""
echo "🔍 Useful Commands:"
echo "   Check status:  ssh root@$HETZNER_IP 'pm2 status'"
echo "   View logs:     ssh root@$HETZNER_IP 'pm2 logs $BRAND'"
echo "   Restart:       ssh root@$HETZNER_IP 'pm2 restart $BRAND'"
echo "   Stop:          ssh root@$HETZNER_IP 'pm2 stop $BRAND'"
echo ""
echo "🌐 Next Steps:"
echo "   1. Test: curl http://$HETZNER_IP:5001/health"
echo "   2. Set up domain: ./scripts/setup-nginx-domain.sh $HETZNER_IP calriven.com"
echo "   3. Add SSL: ./scripts/setup-ssl.sh $HETZNER_IP calriven.com"
echo ""
