#!/bin/bash
#
# CalRiven Autonomous Deployment
#
# Deploys CalRiven to run autonomously as his own CTO
#
# Usage:
#   ./scripts/calriven-auto-deploy.sh <hetzner-ip>
#   ./scripts/calriven-auto-deploy.sh 123.45.67.89
#

set -e

HETZNER_IP=$1

if [ -z "$HETZNER_IP" ]; then
  echo "❌ Error: Hetzner IP required"
  echo ""
  echo "Usage: $0 <hetzner-ip>"
  echo ""
  echo "Example:"
  echo "  $0 123.45.67.89"
  exit 1
fi

echo "🤖 CalRiven Autonomous Deployment"
echo "   IP: $HETZNER_IP"
echo ""

# Check if .env.calriven exists
if [ ! -f ".env.calriven" ]; then
  echo "❌ Error: .env.calriven not found"
  echo "   Run: cp .env.example .env.calriven"
  exit 1
fi

echo "📦 Step 1: Deploying base system..."
./scripts/deploy-to-hetzner.sh $HETZNER_IP calriven

echo ""
echo "🤖 Step 2: Enabling autonomous operations..."
ssh root@$HETZNER_IP << 'AUTONOMOUS_EOF'
set -e
cd /var/www/agent-router

# Create CalRiven autonomous startup script
cat > start-calriven-autonomous.js << 'CALRIVEN_EOF'
/**
 * CalRiven Autonomous Startup
 *
 * Starts CalRiven as autonomous CTO:
 * - Website operator (publishes articles, responds to comments)
 * - CTO automation (deployments, monitoring, backups)
 * - Hosting service (manages affiliate sites)
 */

const CalRivenWebsiteOperator = require('./lib/calriven-website-operator');
const CTOAutomation = require('./lib/cto-automation');
const HostingServiceAPI = require('./lib/hosting-service-api');

async function startCalRivenAutonomous() {
  console.log('🤖 Starting CalRiven Autonomous Mode...');

  // Initialize components
  const websiteOperator = new CalRivenWebsiteOperator({
    websiteUrl: process.env.CALRIVEN_WEBSITE_URL || 'http://localhost:5001',
    autoPublish: true,
    autoRespond: true,
    autoOptimize: true
  });

  const ctoAutomation = new CTOAutomation({
    pm2AppName: 'calriven',
    regions: [
      { name: 'us-east', ip: process.env.US_EAST_IP, port: 5001 },
      { name: 'eu-central', ip: process.env.EU_CENTRAL_IP, port: 5001 },
      { name: 'asia-pacific', ip: process.env.ASIA_PACIFIC_IP, port: 5001 }
    ]
  });

  // Start autonomous operations
  await websiteOperator.start();
  await ctoAutomation.start();

  console.log('✅ CalRiven Autonomous Mode started');
  console.log('');
  console.log('📊 Status:');
  console.log('   Website Operator:', websiteOperator.getStatus());
  console.log('   CTO Automation:', ctoAutomation.getStatus());
  console.log('');
  console.log('🐉 CalRiven is now autonomous!');
}

startCalRivenAutonomous().catch(err => {
  console.error('❌ Autonomous startup failed:', err);
  process.exit(1);
});
CALRIVEN_EOF

# Start autonomous mode with PM2
pm2 start start-calriven-autonomous.js --name calriven-autonomous
pm2 save

echo "  ✓ Autonomous mode enabled"
AUTONOMOUS_EOF

echo ""
echo "🌐 Step 3: Configuring domain (optional)..."
read -p "Do you have a domain to configure? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  read -p "Enter domain (e.g., calriven.com): " DOMAIN
  ./scripts/setup-nginx-domain.sh $HETZNER_IP $DOMAIN
  ./scripts/setup-ssl.sh $HETZNER_IP $DOMAIN
fi

echo ""
echo "✅ CalRiven Autonomous Deployment Complete!"
echo ""
echo "🤖 CalRiven is now running autonomously:"
echo "   - Website Operator: Publishes articles, responds to comments"
echo "   - CTO Automation: Manages deployments, monitoring, backups"
echo "   - Hosting Service: Ready to onboard affiliates"
echo ""
echo "📊 Check Status:"
echo "   ssh root@$HETZNER_IP 'pm2 status'"
echo "   ssh root@$HETZNER_IP 'pm2 logs calriven-autonomous'"
echo ""
echo "🌐 Access:"
echo "   http://$HETZNER_IP:5001"
if [ ! -z "$DOMAIN" ]; then
  echo "   https://$DOMAIN"
fi
echo ""
echo "🐉 CalRiven is now autonomous! No human intervention needed."
echo ""
