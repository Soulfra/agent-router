#!/bin/bash
#
# Set up Let's Encrypt SSL certificate with certbot
#
# Usage:
#   ./scripts/setup-ssl.sh <hetzner-ip> <domain>
#   ./scripts/setup-ssl.sh 123.45.67.89 calriven.com
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

echo "🔒 Setting up SSL for $DOMAIN"
echo ""

echo "📦 Step 1: Installing certbot..."
ssh root@$HETZNER_IP << 'CERTBOT_EOF'
set -e
apt update -qq
apt install -y certbot python3-certbot-nginx > /dev/null 2>&1
echo "  ✓ certbot installed"
CERTBOT_EOF

echo ""
echo "🔐 Step 2: Obtaining SSL certificate..."
echo "   (This will modify nginx config automatically)"
ssh root@$HETZNER_IP << SSL_EOF
set -e
certbot --nginx -d $DOMAIN -d www.$DOMAIN \
  --non-interactive \
  --agree-tos \
  --email admin@$DOMAIN \
  --redirect

echo "  ✓ SSL certificate obtained"

# Test auto-renewal
certbot renew --dry-run

echo "  ✓ Auto-renewal configured"
SSL_EOF

echo ""
echo "✅ SSL Setup Complete!"
echo ""
echo "🔒 Your site is now secured:"
echo "   https://$DOMAIN"
echo "   https://www.$DOMAIN"
echo ""
echo "🔄 Certificate auto-renews every 90 days"
echo ""
echo "🔍 Test:"
echo "   curl https://$DOMAIN/health"
echo ""
