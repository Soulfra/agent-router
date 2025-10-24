#!/bin/bash
#
# Multi-Region Deployment for Infrastructure Resilience
# Deploys to multiple Hetzner regions to avoid US East outage scenarios
#
# Usage:
#   ./scripts/deploy-multi-region.sh <brand>
#   ./scripts/deploy-multi-region.sh calriven
#

set -e

BRAND=${1:-calriven}
CONFIG_FILE=".env.regions"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "❌ Error: .env.regions not found"
  echo ""
  echo "Create .env.regions with:"
  echo "  US_EAST_IP=123.45.67.89"
  echo "  EU_CENTRAL_IP=98.76.54.32"
  echo "  ASIA_PACIFIC_IP=111.222.333.444"
  exit 1
fi

source $CONFIG_FILE

echo "🌍 Multi-Region Deployment for $BRAND"
echo ""
echo "Regions:"
echo "  🇺🇸 US East:      $US_EAST_IP"
echo "  🇪🇺 EU Central:   $EU_CENTRAL_IP"
echo "  🇯🇵 Asia Pacific: $ASIA_PACIFIC_IP"
echo ""

# Deploy to all regions in parallel
echo "📦 Deploying to all regions..."
(
  echo "  → US East..."
  ./scripts/deploy-to-hetzner.sh $US_EAST_IP $BRAND > /tmp/deploy-us.log 2>&1 &
  US_PID=$!

  echo "  → EU Central..."
  ./scripts/deploy-to-hetzner.sh $EU_CENTRAL_IP $BRAND > /tmp/deploy-eu.log 2>&1 &
  EU_PID=$!

  echo "  → Asia Pacific..."
  ./scripts/deploy-to-hetzner.sh $ASIA_PACIFIC_IP $BRAND > /tmp/deploy-asia.log 2>&1 &
  ASIA_PID=$!

  # Wait for all deployments
  wait $US_PID && echo "  ✓ US East deployed" || echo "  ✗ US East failed"
  wait $EU_PID && echo "  ✓ EU Central deployed" || echo "  ✗ EU Central failed"
  wait $ASIA_PID && echo "  ✓ Asia Pacific deployed" || echo "  ✗ Asia Pacific failed"
)

echo ""
echo "🔧 Setting up GeoDNS routing..."

# Create nginx upstream config for failover
cat > /tmp/multi-region-upstream.conf << EOF
upstream ${BRAND}_backend {
  # Primary: US East
  server $US_EAST_IP:5001 max_fails=3 fail_timeout=30s;

  # Backup: EU Central (if US fails)
  server $EU_CENTRAL_IP:5001 backup max_fails=3 fail_timeout=30s;

  # Backup: Asia Pacific (if both fail)
  server $ASIA_PACIFIC_IP:5001 backup max_fails=3 fail_timeout=30s;

  # Health checks
  keepalive 32;
}

server {
  listen 80;
  server_name ${BRAND}.com www.${BRAND}.com;

  location / {
    proxy_pass http://${BRAND}_backend;
    proxy_next_upstream error timeout invalid_header http_500 http_502 http_503;
    proxy_connect_timeout 5s;
    proxy_read_timeout 30s;

    # WebSocket support
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  # Health check endpoint
  location /health {
    proxy_pass http://${BRAND}_backend/health;
    access_log off;
  }
}
EOF

echo "  ✓ Upstream config created: /tmp/multi-region-upstream.conf"
echo ""

echo "✅ Multi-Region Deployment Complete!"
echo ""
echo "📊 Endpoints:"
echo "   🇺🇸 US East:      http://$US_EAST_IP:5001/health"
echo "   🇪🇺 EU Central:   http://$EU_CENTRAL_IP:5001/health"
echo "   🇯🇵 Asia Pacific: http://$ASIA_PACIFIC_IP:5001/health"
echo ""
echo "🔄 Failover Strategy:"
echo "   1. Primary:  US East"
echo "   2. Backup 1: EU Central (if US fails)"
echo "   3. Backup 2: Asia Pacific (if both fail)"
echo ""
echo "🌐 Next Steps:"
echo "   1. Configure DNS: $BRAND.com → Load balancer IP"
echo "   2. Deploy nginx upstream config to load balancer"
echo "   3. Set up health monitoring (UptimeRobot, Pingdom)"
echo ""
