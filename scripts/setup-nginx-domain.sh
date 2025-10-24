#!/bin/bash
#
# Set up nginx reverse proxy for domain
#
# Usage:
#   ./scripts/setup-nginx-domain.sh <hetzner-ip> <domain>
#   ./scripts/setup-nginx-domain.sh 123.45.67.89 calriven.com
#

set -e

HETZNER_IP=$1
DOMAIN=$2

if [ -z "$HETZNER_IP" ] || [ -z "$DOMAIN" ]; then
  echo "❌ Error: Hetzner IP and domain required"
  echo ""
  echo "Usage: $0 <hetzner-ip> <domain>"
  echo ""
  echo "Example:"
  echo "  $0 123.45.67.89 calriven.com"
  exit 1
fi

echo "🌐 Setting up nginx for $DOMAIN → $HETZNER_IP"
echo ""

echo "📋 Step 1: Creating nginx configuration..."
ssh root@$HETZNER_IP << NGINX_EOF
cat > /etc/nginx/sites-available/$DOMAIN << 'CONFIG_EOF'
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Increase body size for file uploads
    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # WebSocket support
        proxy_read_timeout 86400;
    }
}
CONFIG_EOF

# Enable site
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

# Test nginx config
nginx -t

# Reload nginx
systemctl reload nginx

echo "  ✓ nginx configured for $DOMAIN"
NGINX_EOF

echo ""
echo "✅ Domain configured!"
echo ""
echo "📝 DNS Setup Required:"
echo "   Add these DNS records for $DOMAIN:"
echo "   A record:     $DOMAIN → $HETZNER_IP"
echo "   A record: www.$DOMAIN → $HETZNER_IP"
echo ""
echo "🔍 Test (once DNS propagates):"
echo "   curl http://$DOMAIN/health"
echo ""
echo "🔒 Add SSL (recommended):"
echo "   ./scripts/setup-ssl.sh $HETZNER_IP $DOMAIN"
echo ""
