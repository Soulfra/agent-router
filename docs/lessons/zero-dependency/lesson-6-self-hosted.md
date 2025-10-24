# Lesson 6: Deployment Without Vendors

**Track:** Zero-Dependency Development
**Lesson:** 6 of 6
**XP Reward:** 120
**Time:** 35 minutes
**Prerequisites:** Lesson 5 (Database Design)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Deploy without cloud vendors
- ✅ Self-host on VPS
- ✅ Configure PostgreSQL
- ✅ Set up process management
- ✅ Handle backups

## Self-Hosting Options

### Option 1: VPS (Recommended)
- DigitalOcean Droplet ($5/month)
- Linode ($5/month)
- Vultr ($5/month)
- Hetzner ($4/month)

### Option 2: Dedicated Server
- OVH
- Hetzner Dedicated
- Full control, more expensive

### Option 3: Home Server
- Raspberry Pi
- Old computer
- Free but requires maintenance

## VPS Setup

```bash
# 1. Create VPS with Ubuntu 22.04
# 2. SSH into server
ssh root@your-server-ip

# 3. Update system
apt update && apt upgrade -y

# 4. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 5. Install PostgreSQL
apt install -y postgresql postgresql-contrib

# 6. Install PM2
npm install -g pm2

# 7. Create database
sudo -u postgres createdb calos
sudo -u postgres createuser calos_user -P

# 8. Clone your code
git clone https://github.com/your/repo.git
cd repo
npm install --production

# 9. Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Backup Strategy

```bash
#!/bin/bash
# backup.sh

# Database backup
pg_dump calos > backup_$(date +%Y%m%d).sql

# Upload to backup server (optional)
scp backup_*.sql backup-server:/backups/

# Keep only last 7 days
find . -name "backup_*.sql" -mtime +7 -delete
```

## Summary

**Congratulations! You've completed the Zero-Dependency track!**

You've learned:
- ✅ Zero-dependency philosophy
- ✅ Privacy-first data handling
- ✅ Licensing strategies
- ✅ Building without npm packages
- ✅ Database design
- ✅ Self-hosted deployment

## Quiz

1. What's the cheapest VPS option?
   - a) $1/month
   - b) $5/month
   - c) $50/month
   - d) $100/month

2. How often should you backup?
   - a) Never
   - b) Daily
   - c) Weekly
   - d) Monthly

3. What manages Node.js processes?
   - a) node
   - b) npm
   - c) PM2
   - d) Docker

**Answers:** 1-b, 2-b, 3-c

---

**🎴 Achievement Unlocked:** Self-Hosting Expert (+120 XP)
**🏆 Track Complete:** Zero-Dependency Development (Total: 720 XP)
