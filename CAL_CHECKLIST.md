# Checklist for Cal (or Any AI Agent)

**Quick reference before making commits or deployments**

## Before Any Git Operations

```bash
# 1. Check current identity
./scripts/check-cli-status.sh

# Look for:
# ✅ Git identity using global (Soulfra)
# ❌ Local override detected

# 2. If local override exists, remove it:
git config --local --unset user.name
git config --local --unset user.email
```

## Current Correct Identity

```
Name:  Soulfra
Email: 211064529+Soulfra@users.noreply.github.com
```

**Not** `Cal <cal@calos.dev>` ❌

## Before Making a Commit

```bash
# Verify identity
git config user.name    # Should be: Soulfra
git config user.email   # Should be: 211064529+Soulfra@users.noreply.github.com

# Add timestamp to commit message
git commit -m "Your commit message

$(date)"
```

## Email Addresses to Use

**Current (.env):**
```
EMAIL_FROM_ADDRESS=team@soulfra.com
EMAIL_FROM_NAME=Soulfra Team
```

**Brand-specific:**
- Soulfra: `team@soulfra.com`
- CalRiven: `team@calriven.com`
- CALOS: `support@calos.dev`

**Never use:**
- ❌ `cal@calos.dev` (AI persona, not real email)
- ❌ `noreply@soulfra.com` (too generic)

## CLI Authentication Status

**Check with:**
```bash
./scripts/check-cli-status.sh
```

**Current status:**
- ✅ GitHub CLI: Logged in as Soulfra (gist + repo scopes)
- ❌ Railway CLI: Not logged in

**To fix Railway:**
```bash
railway login  # Opens browser
```

## Timestamps

**System time:**
```bash
date
# Wed Oct 22 22:51:29 EDT 2025
```

**Git commit timestamps are automatic:**
```bash
git log --format="%ai"  # Shows commit timestamp
```

## Deployment Quick Actions

**1. Check if code is pushed:**
```bash
git status
git log origin/main..HEAD  # Shows unpushed commits
```

**2. Push to GitHub:**
```bash
git push -u origin main
```

**3. Deploy:**
```bash
# Option A: Railway
railway login
railway up

# Option B: Render
# Go to render.com → Connect GitHub → Auto-deploys

# Option C: Vercel
# Click deploy button in DEPLOY.md
```

## Gist Operations

**Check gist access:**
```bash
gh auth status  # Look for "gist" scope
```

**Create a gist:**
```bash
gh gist create file.txt --public
```

**List gists:**
```bash
gh gist list
```

## Common Mistakes to Avoid

1. ❌ **Setting local git config** - Always use global
2. ❌ **Using cal@calos.dev** - Not a real email
3. ❌ **Forgetting to check status** - Run status script first
4. ❌ **Pushing without checking identity** - Commits won't show on profile
5. ❌ **Using noreply@** - Use team@ instead

## If You Get Confused

**Run this:**
```bash
./scripts/check-cli-status.sh
```

**It shows:**
- Current time
- Who you're committing as
- What email is configured
- CLI authentication status
- Deployment readiness

## Quick Commands Reference

```bash
# Check everything
./scripts/check-cli-status.sh

# Fix git identity
git config --local --unset user.name
git config --local --unset user.email

# Verify identity
git config user.name && git config user.email

# Login to services
gh auth login
railway login

# Deploy
git push -u origin main
railway up  # OR go to render.com

# Check timestamp
date
```

## When in Doubt

1. Run status check
2. Verify identity matches Soulfra
3. Check timestamp
4. Proceed with operation

---

**Last updated:** Wed Oct 22 22:51:29 EDT 2025

**Status:** ✅ Identity fixed, ready to push and deploy
