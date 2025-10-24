# OAuth Starter (Python)

**Multi-provider OAuth with auto-subdomain creation**

FastAPI-based OAuth system supporting Twitter/X, GitHub, Discord, and LinkedIn. Works **standalone** (SQLite) OR **integrated** with Cal orchestrator (Supabase).

---

## 🚀 Quick Start

### Standalone Mode (SQLite)

```bash
# Install
pip install oauth-starter

# Or from source
git clone https://github.com/coldstartkit/oauth-starter-python
cd oauth-starter-python
pip install -e .

# Configure
cp .env.example .env
# Edit .env - add OAuth credentials

# Run
uvicorn oauth_starter.app:app --reload

# Visit http://localhost:8000/docs
```

### Integrated Mode (Supabase)

```bash
# Set Supabase URL in .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_DB_PASSWORD=your-password
DATABASE_MODE=supabase

# Run
uvicorn oauth_starter.app:app --reload
```

---

## 📚 Features

- ✅ **Twitter/X OAuth 2.0** with PKCE
- ✅ **GitHub OAuth** with repo expertise extraction
- ✅ **Discord OAuth**
- ✅ **LinkedIn OAuth**
- ✅ **Auto-subdomain creation** (@handle → handle.yourdomain.com)
- ✅ **Activity tracking** (30-day expiration)
- ✅ **Leaderboard** (top 1000 = immunity)
- ✅ **Expertise extraction** from bio/repos
- ✅ **SQLite** (standalone) OR **Supabase** (integrated)
- ✅ **Cal orchestrator** integration

---

## 🔑 Get OAuth Credentials

### Twitter/X
1. Visit https://developer.x.com/en/portal/dashboard
2. Create app → Get Client ID and Secret
3. Callback URL: `http://localhost:8000/auth/callback/twitter`

### GitHub
1. Visit https://github.com/settings/developers
2. New OAuth App → Get Client ID and Secret
3. Callback URL: `http://localhost:8000/auth/callback/github`

### Discord
1. Visit https://discord.com/developers/applications
2. New Application → OAuth2 → Get Client ID and Secret
3. Redirect URL: `http://localhost:8000/auth/callback/discord`

### LinkedIn
1. Visit https://www.linkedin.com/developers/apps
2. Create app → Auth → Get Client ID and Secret
3. Redirect URL: `http://localhost:8000/auth/callback/linkedin`

---

## 🛠️ Usage

### Python API

```python
from oauth_starter import SocialAuth, Database

# Initialize
db = Database(mode="sqlite")  # or "supabase"
auth = SocialAuth(db)

# Get OAuth URL
auth_url = auth.get_auth_url("twitter", redirect_path="/dashboard")
print(f"Visit: {auth_url}")

# Handle callback (in your route handler)
user, session = await auth.handle_callback("twitter", code, state)
print(f"Logged in: {user.username}")
```

### FastAPI Routes

```python
from fastapi import FastAPI
from oauth_starter.app import app

# Use built-in app
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### Standalone Example

```python
# Install: pip install oauth-starter
from oauth_starter import Database, SocialAuth

# SQLite mode (standalone)
db = Database(mode="sqlite")
auth = SocialAuth(db, callback_base_url="http://localhost:8000")

# Twitter OAuth
url = auth.get_auth_url("twitter")
# User visits URL, gets redirected back with code
user, session = await auth.handle_callback("twitter", code, state)

print(f"User: {user.username}")
print(f"Subdomain: {user.vanity_subdomain}.yourdomain.com")
print(f"Expertise: {user.expertise}")
```

---

## 🌐 API Endpoints

### OAuth
- `GET /auth/{provider}` - Start OAuth flow
- `GET /auth/callback/{provider}` - OAuth callback
- `GET /auth/me` - Get current user
- `POST /auth/logout` - Logout

### Users
- `GET /users/{username}` - Get user by username

### Activity
- `POST /activity` - Log activity
- `GET /activity/leaderboard/{domain}` - Get leaderboard
- `GET /activity/me` - Get my activity

### Cal Integration
- `GET /cal/status` - Status for Cal orchestrator
- `POST /cal/integrate` - Cal integration endpoint

### Admin
- `POST /admin/cleanup` - Cleanup expired data

---

## 🔧 Configuration

### Environment Variables

```bash
# Database
DATABASE_MODE=auto  # auto, sqlite, supabase
SQLITE_PATH=./oauth.db
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_DB_PASSWORD=your-password

# OAuth
OAUTH_CALLBACK_BASE_URL=http://localhost:8000
PARENT_DOMAIN=soulfra.com
AUTO_CREATE_SUBDOMAIN=true

# Providers
TWITTER_CLIENT_ID=xxx
TWITTER_CLIENT_SECRET=xxx
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
DISCORD_CLIENT_ID=xxx
DISCORD_CLIENT_SECRET=xxx
LINKEDIN_CLIENT_ID=xxx
LINKEDIN_CLIENT_SECRET=xxx
```

### Database Modes

**Auto (default)**: Uses Supabase if `SUPABASE_URL` is set, else SQLite

**SQLite (standalone)**: Local database, no external dependencies
```bash
DATABASE_MODE=sqlite
SQLITE_PATH=./oauth.db
```

**Supabase (integrated)**: PostgreSQL + instant API
```bash
DATABASE_MODE=supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_DB_PASSWORD=your-password
```

---

## 🚢 Deployment

### Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

Add environment variables in Railway dashboard.

### Vercel (Serverless)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Add environment variables
vercel env add TWITTER_CLIENT_ID
vercel env add GITHUB_CLIENT_ID
# ... etc
```

### Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY . .
RUN pip install -e .

CMD ["uvicorn", "oauth_starter.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t oauth-starter .
docker run -p 8000:8000 --env-file .env oauth-starter
```

---

## 🎯 Cal Orchestrator Integration

OAuth Starter can work **standalone** OR integrate with **Cal orchestrator** for coordinated multi-service deployments.

### Standalone Mode
```python
# Works independently
db = Database(mode="sqlite")
auth = SocialAuth(db)
```

### Integrated Mode (via Cal)
```python
# Cal coordinates with other services
db = Database(mode="supabase")  # Shared database
auth = SocialAuth(db)

# Cal can query status
# GET /cal/status

# Cal can coordinate actions
# POST /cal/integrate
```

### Cal Orchestrator Endpoints

**Status Endpoint**: Cal queries to check if service is healthy
```bash
curl http://localhost:8000/cal/status
```

Response:
```json
{
  "service": "oauth-starter",
  "version": "0.1.0",
  "mode": "supabase",
  "features": ["twitter-oauth", "github-oauth", "subdomain-creation"],
  "endpoints": {
    "auth": "/auth/{provider}",
    "me": "/auth/me"
  }
}
```

**Integration Endpoint**: Cal sends coordination requests
```bash
curl -X POST http://localhost:8000/cal/integrate \
  -H "Content-Type: application/json" \
  -d '{"action": "create_user", "userId": "user_123"}'
```

---

## 🧪 Development

### Quick Validation

```bash
# 1. Install package
cd oauth-starter-python
pip install -e .

# 2. Run integration tests
python validate.py

# 3. Run unit tests
pytest

# 4. Run demo
python demo.py
```

### Test Suite

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run all tests
pytest

# Run with coverage
pytest --cov=oauth_starter --cov-report=html

# Run specific test file
pytest tests/test_auth.py
pytest tests/test_database.py

# Format code
black oauth_starter/
ruff check oauth_starter/
```

### Running the Demo

```bash
# Standalone demo (no Node.js required)
python demo.py

# Visit http://localhost:8000/login.html
```

---

## 📄 License

MIT

---

**Part of ColdStartKit** - Startup launch templates by Soulfra Network

GitHub: https://github.com/coldstartkit/oauth-starter-python
