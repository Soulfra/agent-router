# Production Routing Guide

## Overview

This guide explains how to deploy CALOS Agent Router to production with proper domain routing, fixing the common port/IP issues that occur when moving from `localhost:5001` to production domains.

## The Problem

**Local development:**
```
✅ http://localhost:5001/feed.html
✅ ws://localhost:5001
```

**Production (broken):**
```
❌ http://123.45.67.89:5001/feed.html  (exposed port)
❌ https://yourdomain.com:5001/feed.html  (port in URL)
❌ http://yourdomain.com/feed.html  (wrong protocol)
```

**Production (fixed):**
```
✅ https://yourdomain.com/feed.html
✅ wss://yourdomain.com
```

## How It Works

### 1. Dynamic Base URL Detection

The router now automatically detects the correct base URL from request headers:

```javascript
function getBaseURL(req) {
  // 1. Check environment variable (most reliable)
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }

  // 2. Detect from proxy headers (Render, Railway, nginx)
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  return `${protocol}://${host}`;
}
```

### 2. Trust Proxy Setting

Express now trusts reverse proxy headers:

```javascript
app.set('trust proxy', 1);
```

This allows Express to read:
- `X-Forwarded-Proto` (https/http)
- `X-Forwarded-Host` (yourdomain.com)
- `X-Forwarded-For` (client IP)

### 3. Fixed Hardcoded URLs

All hardcoded `localhost:5001` URLs now use `getBaseURL(req)`:

**Before:**
```javascript
link: 'http://localhost:5001/feed.html'
```

**After:**
```javascript
const baseURL = getBaseURL(req);
link: `${baseURL}/feed.html`
```

## Deployment Options

### Option 1: Render.com (Easiest)

**No reverse proxy needed** - Render handles everything!

1. **Push to GitHub**
   ```bash
   git push origin main
   ```

2. **Deploy to Render**
   - Go to [render.com](https://render.com)
   - Connect GitHub repo
   - Render reads `deployment/render.yaml` automatically

3. **Set Environment Variables**
   ```bash
   BASE_URL=https://your-app.onrender.com
   PORT=5001
   NODE_ENV=production
   OPENAI_API_KEY=sk-...
   ANTHROPIC_API_KEY=sk-ant-...
   ```

4. **Done!**
   Your app is live at: `https://your-app.onrender.com`

---

### Option 2: Railway.app

**No reverse proxy needed** - Railway handles routing!

1. **Install CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Deploy**
   ```bash
   railway up
   ```

3. **Set Variables**
   ```bash
   railway variables set BASE_URL=https://your-app.up.railway.app
   railway variables set PORT=5001
   railway variables set NODE_ENV=production
   ```

4. **Get Domain**
   ```bash
   railway domain
   ```

---

### Option 3: Docker + nginx (VPS/Self-hosted)

**Perfect for DigitalOcean, AWS, Azure, GCP**

#### Step 1: Build and Run Docker Container

```bash
# Build
cd deployment
docker build -t calos-router .

# Run
docker run -d \
  --name calos-router \
  --restart unless-stopped \
  -p 5001:5001 \
  -e NODE_ENV=production \
  -e BASE_URL=https://yourdomain.com \
  -e OPENAI_API_KEY=sk-... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  calos-router
```

#### Step 2: Install nginx

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

#### Step 3: Configure nginx

```bash
# Copy config
sudo cp deployment/nginx.conf /etc/nginx/sites-available/calos-router

# Update domain name
sudo nano /etc/nginx/sites-available/calos-router
# Change 'yourdomain.com' to your actual domain

# Enable site
sudo ln -s /etc/nginx/sites-available/calos-router /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

#### Step 4: Get SSL Certificate (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

**Done!** Your app is live at: `https://yourdomain.com`

---

### Option 4: Docker + Caddy (Simpler Alternative)

**Easier than nginx** - automatic HTTPS!

#### Step 1: Run Docker Container (same as above)

```bash
docker run -d \
  --name calos-router \
  --restart unless-stopped \
  -p 5001:5001 \
  -e NODE_ENV=production \
  -e BASE_URL=https://yourdomain.com \
  -e OPENAI_API_KEY=sk-... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  calos-router
```

#### Step 2: Install Caddy

```bash
# Ubuntu/Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

#### Step 3: Configure Caddy

```bash
# Copy Caddyfile
sudo cp deployment/Caddyfile /etc/caddy/Caddyfile

# Update domain
sudo nano /etc/caddy/Caddyfile
# Change 'yourdomain.com' to your actual domain

# Reload
sudo systemctl reload caddy
```

**Done!** Caddy automatically gets SSL certificate and handles HTTPS!

---

## Environment Variables

### Required for All Deployments

```bash
# Base URL (production domain)
BASE_URL=https://yourdomain.com

# Node environment
NODE_ENV=production

# Port (default: 5001)
PORT=5001

# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Optional

```bash
# Database (if using PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calos
DB_USER=postgres
DB_PASSWORD=your_password

# CORS (default: *)
CORS_ORIGIN=https://yourdomain.com

# WebSocket URL (auto-detected if not set)
WS_URL=wss://yourdomain.com
```

---

## Testing Production Routing

### 1. Check Base URL Detection

```bash
curl https://yourdomain.com/feed/json | jq '.feed.link'
```

Expected: `https://yourdomain.com/feed.html` (NOT localhost)

### 2. Check WebSocket URL

```bash
curl https://yourdomain.com/api/network-info | jq '.websocket'
```

Expected: `wss://yourdomain.com` (NOT ws://localhost)

### 3. Check RSS Feed URLs

```bash
curl https://yourdomain.com/feed/rss | grep -o '<link>.*</link>'
```

Expected: `<link>https://yourdomain.com/feed.html</link>`

### 4. Check Health Endpoint

```bash
curl https://yourdomain.com/health
```

Expected: `{"status":"ok", ...}`

---

## Common Issues & Solutions

### Issue 1: URLs still show localhost

**Cause:** `BASE_URL` environment variable not set

**Solution:**
```bash
export BASE_URL=https://yourdomain.com
# Or add to .env file
```

### Issue 2: Port shows in production URLs

**Cause:** Reverse proxy not forwarding headers correctly

**Solution (nginx):**
```nginx
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
```

**Solution (Caddy):**
```
# Caddy does this automatically!
```

### Issue 3: WebSocket connection fails

**Cause:** nginx not configured for WebSocket upgrade

**Solution:**
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
```

### Issue 4: 502 Bad Gateway

**Cause:** App not listening on correct port

**Check:**
```bash
docker logs calos-router
# Should see: "🚀 HTTP Server: http://localhost:5001"
```

**Solution:**
```bash
docker exec calos-router env | grep PORT
# Should show: PORT=5001
```

### Issue 5: Mixed content warnings (HTTP/HTTPS)

**Cause:** Base URL using http:// instead of https://

**Solution:**
```bash
export BASE_URL=https://yourdomain.com  # Note: https, not http
```

---

## Domain Setup

### 1. Point Domain to Server

**Render/Railway:**
- Add custom domain in dashboard
- Add CNAME record: `your-app.onrender.com`

**VPS (DigitalOcean, AWS, etc.):**
```
Type: A
Name: @
Value: 123.45.67.89 (your server IP)

Type: A
Name: www
Value: 123.45.67.89
```

### 2. Wait for DNS Propagation

```bash
# Check DNS
dig yourdomain.com

# Check SSL (after nginx/Caddy setup)
curl -I https://yourdomain.com
```

---

## Load Balancing (Multiple Instances)

### nginx Load Balancer

```nginx
upstream calos_backend {
    least_conn;  # Or: ip_hash, round_robin
    server localhost:5001;
    server localhost:5002;
    server localhost:5003;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    location / {
        proxy_pass http://calos_backend;
        # ... rest of proxy config
    }
}
```

### Caddy Load Balancer

```
yourdomain.com {
    reverse_proxy localhost:5001 localhost:5002 localhost:5003 {
        lb_policy least_conn
        health_uri /health
    }
}
```

---

## Performance Tuning

### 1. Enable Caching (nginx)

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=calos_cache:10m max_size=1g;

location / {
    proxy_cache calos_cache;
    proxy_cache_valid 200 10m;
    proxy_cache_key "$scheme$request_method$host$request_uri";
    proxy_pass http://localhost:5001;
}
```

### 2. Enable Compression (nginx)

```nginx
gzip on;
gzip_vary on;
gzip_types text/plain text/css application/json application/javascript;
```

### 3. Rate Limiting (nginx)

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

location /api/ {
    limit_req zone=api_limit burst=20 nodelay;
    proxy_pass http://localhost:5001;
}
```

---

## Monitoring

### 1. Check Application Logs

```bash
# Docker
docker logs -f calos-router

# PM2
pm2 logs calos-router

# systemd
journalctl -u calos-router -f
```

### 2. Check nginx/Caddy Logs

```bash
# nginx
tail -f /var/log/nginx/calos-router-access.log
tail -f /var/log/nginx/calos-router-error.log

# Caddy
journalctl -u caddy -f
```

### 3. Monitor Health

```bash
# Every 60 seconds
watch -n 60 'curl -s https://yourdomain.com/health | jq'
```

---

## Security Checklist

- [ ] HTTPS enabled (Let's Encrypt)
- [ ] Security headers configured (HSTS, X-Frame-Options, etc.)
- [ ] Rate limiting enabled
- [ ] CORS configured (not `*` in production)
- [ ] API keys in environment variables (not in code)
- [ ] Database credentials secured
- [ ] Firewall rules configured (only 80/443 open)
- [ ] Regular security updates
- [ ] Backup strategy in place

---

## Support

- 📖 Deployment Guide: `deployment/DEPLOY.md`
- 📖 Cross-Platform Guide: `docs/CROSS-PLATFORM-SETUP.md`
- 🐛 Issues: https://github.com/calos/agent-router/issues
- 💬 Discord: https://discord.gg/calos

---

**Built with ❤️ for production-ready deployments**

*Works on Render • Railway • Docker • nginx • Caddy • AWS • Azure • GCP*
