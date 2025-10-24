# Deployment Setup Guide

## Auto-Onboarding Behavior

The CALOS Agent Router includes an auto-onboarding system that detects when API keys are missing and prompts you to configure them. This system is **smart enough to skip** in production/deployment scenarios.

## When Setup Prompts Appear

✅ **Local development** - `npm install` in project directory
- Shows colorful setup prompt with 4 options
- Guides you through configuration

## When Setup Prompts are Skipped

❌ **CI/CD pipelines** - Automatically detected
- GitHub Actions
- CircleCI
- Travis CI
- Any environment with `CI=true`

❌ **Production deployments** - Set `NODE_ENV=production`
```bash
NODE_ENV=production npm install
```

❌ **Docker builds** - Automatically detected
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install  # Skips setup prompt automatically
```

❌ **Global installs** - Automatically detected
```bash
npm install -g calos-agent-router  # Skips setup prompt
```

❌ **Installed as dependency** - Automatically detected
```bash
# In another project:
npm install calos-agent-router  # Skips setup prompt
```

❌ **Manual override** - Use environment variable
```bash
export SKIP_SETUP_CHECK=1
npm install
```

## Deployment Workflows

### Docker Deployment

```dockerfile
FROM node:18
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (setup prompt auto-skipped in Docker)
RUN npm install

# Copy application
COPY . .

# Set production environment
ENV NODE_ENV=production

# Provide API keys via environment variables
ENV OPENAI_API_KEY=${OPENAI_API_KEY}
ENV ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

# Start server
CMD ["npm", "start"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: calos-agent-router
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: router
        image: calos-agent-router:latest
        env:
        - name: NODE_ENV
          value: "production"
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: openai
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: anthropic
```

### Heroku Deployment

```bash
# Set environment variables (skips setup prompt)
heroku config:set NODE_ENV=production
heroku config:set OPENAI_API_KEY=sk-...
heroku config:set ANTHROPIC_API_KEY=sk-ant-...

# Deploy
git push heroku main
```

### AWS/Azure/GCP

All cloud providers: Set these environment variables in your deployment config:
- `NODE_ENV=production` (skips setup prompt)
- `OPENAI_API_KEY=sk-...`
- `ANTHROPIC_API_KEY=sk-ant-...`

## API Key Configuration Methods

### 1. Environment Variables (.env file)
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Database Keyring
```bash
npm run setup  # Interactive wizard
# or
node scripts/store-system-keys.js  # Manual entry
```

### 3. Cloud Secrets (Production)
- AWS Secrets Manager
- Azure Key Vault
- GCP Secret Manager
- HashiCorp Vault

## Troubleshooting

### Setup prompt shows in CI/CD
Make sure `CI=true` is set (most CI systems set this automatically).

### Setup prompt shows in Docker
Check that `/.dockerenv` exists (standard in Docker containers).

### Setup prompt shows in production
Set `NODE_ENV=production` environment variable.

### Force skip setup prompt
```bash
export SKIP_SETUP_CHECK=1
npm install
```

### Force show setup prompt
```bash
unset CI
unset NODE_ENV
unset SKIP_SETUP_CHECK
npm install
```

## Testing Setup Detection

Run the test suite:
```bash
node scripts/test-check-setup.js
```

Expected output:
```
✅ CI Environment - PASSED (skipped)
✅ Manual Skip Flag - PASSED (skipped)
✅ Global Install - PASSED (skipped)
✅ Production Environment - PASSED (skipped)
✅ Local Development - PASSED (showed setup)
```

## Support

- 📖 Docs: `docs/SETUP.md`
- 🐛 Issues: https://github.com/calos/agent-router/issues
- 💬 Discord: https://discord.gg/calos
