# Hetzner Deployment Guide

**Deploy your working local setup to Hetzner VPS in 3 commands**

Last Updated: 2025-10-22

---

## Prerequisites

- ✅ Project works locally (`npm run start:verified`)
- ✅ API keys configured in `.env.calriven` (or `.env.soulfra`, `.env.vibecoding`)
- ✅ SSH key added to your machine (`ssh-keygen` if you don't have one)
- ⏳ Hetzner account (create at hetzner.com)

---

## Step 1: Create Hetzner VPS (5 minutes)

### 1.1 Sign Up
1. Go to [hetzner.com](https://hetzner.com)
2. Click "Sign Up" or "Console"
3. Create account (requires email verification)

### 1.2 Create Cloud Server
1. Click "Add Server"
2. Select location: **Nuremberg, Germany** (or closest to you)
3. Select image: **Ubuntu 24.04**
4. Select type: **CPX21** (€10.19/mo, 4GB RAM, 2 vCPU) ← Recommended
   - Or CPX11 (€4.51/mo, 2GB RAM) if testing
5. Add SSH Key:
   - Copy your public key: `cat ~/.ssh/id_rsa.pub`
   - Paste into Hetzner
6. Click "Create & Buy Now"

### 1.3 Get IP Address
- Wait ~60 seconds for server to start
- Note the IPv4 address (e.g., `123.45.67.89`)

---

## Step 2: Deploy Application (1 command)

```bash
# Deploy CalRiven brand
./scripts/deploy-to-hetzner.sh 123.45.67.89 calriven

# OR deploy Soulfra brand
./scripts/deploy-to-hetzner.sh 123.45.67.89 soulfra

# OR deploy VibeCoding brand
./scripts/deploy-to-hetzner.sh 123.45.67.89 vibecoding
```

**What this does:**
1. Installs Node.js, PostgreSQL, nginx, PM2 on Hetzner
2. Copies your project to `/var/www/agent-router/`
3. Copies `.env.calriven` → `.env` (or whatever brand you chose)
4. Runs `npm install` and database migrations
5. Starts application with PM2 (auto-restart on crash/reboot)

**Expected output:**
```
✅ Deployment Complete!

📊 Server Info:
   HTTP: http://123.45.67.89:5001
   Brand: calriven

🔍 Useful Commands:
   Check status:  ssh root@123.45.67.89 'pm2 status'
   View logs:     ssh root@123.45.67.89 'pm2 logs calriven'
```

---

## Step 3: Test Deployment

```bash
# Test health endpoint
curl http://123.45.67.89:5001/health

# Expected response:
# {"status":"ok","uptime":123,"services":{"database":"ok"}}
```

**If it works:** ✅ Your app is live!

**If it doesn't work:**
```bash
# Check logs
ssh root@123.45.67.89 'pm2 logs calriven --lines 50'

# Check if app is running
ssh root@123.45.67.89 'pm2 status'

# Restart app
ssh root@123.45.67.89 'pm2 restart calriven'
```

---

## Step 4: Point Your Domain (Optional)

### 4.1 Update DNS

Go to your domain registrar (Namecheap, GoDaddy, Cloudflare, etc.) and add:

**A Records:**
```
calriven.com      → 123.45.67.89
www.calriven.com  → 123.45.67.89
```

Wait 5-10 minutes for DNS propagation.

### 4.2 Configure Nginx

```bash
./scripts/setup-nginx-domain.sh 123.45.67.89 calriven.com
```

**What this does:**
- Creates nginx reverse proxy config
- Routes `calriven.com` → `localhost:5001`
- Enables WebSocket support
- Increases file upload size limit

### 4.3 Test Domain

```bash
curl http://calriven.com/health
```

---

## Step 5: Add SSL (Recommended)

```bash
./scripts/setup-ssl.sh 123.45.67.89 calriven.com
```

**What this does:**
- Installs Let's Encrypt certbot
- Obtains free SSL certificate
- Configures nginx to redirect HTTP → HTTPS
- Sets up auto-renewal (every 90 days)

**Test:**
```bash
curl https://calriven.com/health
```

---

## Multi-Brand Deployment

You can run multiple brands on separate Hetzner VPS instances:

### Option A: Separate VPS per Brand

```bash
# CalRiven on VPS 1
./scripts/deploy-to-hetzner.sh 123.45.67.89 calriven
./scripts/setup-nginx-domain.sh 123.45.67.89 calriven.com
./scripts/setup-ssl.sh 123.45.67.89 calriven.com

# Soulfra on VPS 2
./scripts/deploy-to-hetzner.sh 98.76.54.32 soulfra
./scripts/setup-nginx-domain.sh 98.76.54.32 soulfra.com
./scripts/setup-ssl.sh 98.76.54.32 soulfra.com

# VibeCoding on VPS 3
./scripts/deploy-to-hetzner.sh 111.222.333.444 vibecoding
./scripts/setup-nginx-domain.sh 111.222.333.444 vibecoding.com
./scripts/setup-ssl.sh 111.222.333.444 vibecoding.com
```

**Cost:** €10/mo × 3 = €30/mo

### Option B: Single VPS, Multiple Domains

```bash
# Deploy all brands to same VPS on different ports
ssh root@123.45.67.89
cd /var/www/agent-router

# CalRiven on port 5001
PORT=5001 pm2 start router.js --name calriven

# Soulfra on port 5002
PORT=5002 pm2 start router.js --name soulfra

# VibeCoding on port 5003
PORT=5003 pm2 start router.js --name vibecoding
```

Then configure nginx to route by domain:
```bash
./scripts/setup-nginx-domain.sh 123.45.67.89 calriven.com   # → localhost:5001
./scripts/setup-nginx-domain.sh 123.45.67.89 soulfra.com    # → localhost:5002
./scripts/setup-nginx-domain.sh 123.45.67.89 vibecoding.com # → localhost:5003
```

**Cost:** €10/mo for all brands

---

## Costs

### Hetzner VPS Pricing
| Plan | RAM | vCPU | Storage | Price/mo |
|------|-----|------|---------|----------|
| CPX11 | 2GB | 2 | 40GB | €4.51 |
| CPX21 | 4GB | 2 | 80GB | €10.19 ← **Recommended** |
| CPX31 | 8GB | 4 | 160GB | €21.66 |

### Additional Costs
- **SSL Certificate:** Free (Let's Encrypt)
- **Domain:** ~$10-15/year (Namecheap, GoDaddy, etc.)
- **Backups:** €1-2/mo (optional, automated Hetzner backups)

### Total Monthly Cost (Example)
- **Single Brand:** €10.19/mo (VPS) = ~$11 USD/mo
- **Three Brands (separate VPS):** €30.57/mo = ~$33 USD/mo
- **Three Brands (shared VPS):** €10.19/mo = ~$11 USD/mo

---

## Useful Commands

### Check Application Status
```bash
ssh root@<hetzner-ip> 'pm2 status'
```

### View Logs
```bash
ssh root@<hetzner-ip> 'pm2 logs calriven'
ssh root@<hetzner-ip> 'pm2 logs calriven --lines 100'
```

### Restart Application
```bash
ssh root@<hetzner-ip> 'pm2 restart calriven'
```

### Update Code
```bash
# After making changes locally
rsync -avz --exclude node_modules . root@<hetzner-ip>:/var/www/agent-router/
ssh root@<hetzner-ip> 'cd /var/www/agent-router && npm install && pm2 restart calriven'
```

### Database Migrations
```bash
ssh root@<hetzner-ip>
cd /var/www/agent-router
DB_USER=postgres DB_PASSWORD=postgres node scripts/auto-migrate.js
pm2 restart calriven
```

### Check Disk Space
```bash
ssh root@<hetzner-ip> 'df -h'
```

### Check Memory Usage
```bash
ssh root@<hetzner-ip> 'free -h'
```

---

## Troubleshooting

### Application Won't Start

**Check logs:**
```bash
ssh root@<hetzner-ip> 'pm2 logs calriven --lines 50'
```

**Common issues:**
- Missing API keys in .env
- PostgreSQL not running: `ssh root@<hetzner-ip> 'systemctl status postgresql'`
- Port 5001 already in use: `ssh root@<hetzner-ip> 'lsof -ti:5001'`

### Domain Not Working

**Check DNS:**
```bash
dig calriven.com
# Should show A record pointing to Hetzner IP
```

**Check nginx:**
```bash
ssh root@<hetzner-ip> 'nginx -t'
ssh root@<hetzner-ip> 'systemctl status nginx'
```

### SSL Certificate Failed

**Requires:**
- Domain DNS must point to Hetzner IP (check with `dig`)
- Port 80 must be open (certbot uses HTTP challenge)
- nginx must be running

**Retry:**
```bash
./scripts/setup-ssl.sh <hetzner-ip> <domain>
```

---

## Security Checklist

### ✅ Implemented
- [x] SSH key authentication (password login disabled by default)
- [x] Firewall (Hetzner Cloud Firewall)
- [x] SSL/TLS encryption (Let's Encrypt)
- [x] Environment variables (not in code)
- [x] Database password protected

### ⚠️ Recommended
- [ ] Enable Hetzner Cloud Firewall (allow only 22, 80, 443)
- [ ] Set up automated backups (Hetzner Backups feature)
- [ ] Configure fail2ban (blocks brute-force SSH attacks)
- [ ] Enable UFW firewall on VPS
- [ ] Set up monitoring (UptimeRobot, Pingdom, etc.)

**Enable firewall:**
```bash
ssh root@<hetzner-ip>
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw enable
```

---

## Backup & Restore

### Enable Hetzner Backups
1. Go to Hetzner Console
2. Click your server
3. Enable "Backups" (€1-2/mo)
4. Backups run automatically every night

### Manual Database Backup
```bash
ssh root@<hetzner-ip>
sudo -u postgres pg_dump calos > /root/calos-backup-$(date +%Y%m%d).sql
```

### Restore Database
```bash
scp root@<hetzner-ip>:/root/calos-backup-*.sql ./
ssh root@<hetzner-ip>
sudo -u postgres psql calos < calos-backup-*.sql
```

---

## What You Just Deployed

✅ **CalRiven Dragon Knowledge System**
- Omniscient AI persona
- LibrarianFacade knowledge orchestration
- Encrypted UserDataVault (AES-256-GCM)
- Namespace isolation
- Cryptographic signing (Ed25519)

✅ **Multi-Brand Infrastructure**
- Brand-specific .env configurations
- Soulfra, CalRiven, VibeCoding support
- Shared database, isolated namespaces

✅ **BYOK System**
- 3-tier key fallback (tenant → user → platform)
- Encrypted credential storage
- Hybrid model routing

✅ **100+ Features**
- Gmail webhook (zero-cost email)
- Dev ragebait generator
- Lofi streaming
- Portfolio analytics
- OAuth system
- And 95+ more

**Everything that works locally now works on Hetzner.**

---

## Next Steps

1. ✅ Deploy to Hetzner (`./scripts/deploy-to-hetzner.sh`)
2. ✅ Test health endpoint (`curl http://<ip>:5001/health`)
3. ⏳ Point domain (`./scripts/setup-nginx-domain.sh`)
4. ⏳ Add SSL (`./scripts/setup-ssl.sh`)
5. ⏳ Monitor logs (`pm2 logs calriven`)
6. ⏳ Add more features, deploy updates

**You're live. Ship it.** 🚀
