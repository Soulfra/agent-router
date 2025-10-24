# CALOS Email API - Open Source & Self-Hostable

**Zero-dependency email API • Self-hostable • Cloud-hosted option**

Send emails from your app in 3 lines of code. Open source alternative to Mailchimp/SendGrid.

[![License: AGPL](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![SDK License: MIT](https://img.shields.io/badge/SDK-MIT-green.svg)](sdk/email-sdk/LICENSE)

---

## 🚀 Quick Start

### Cloud-Hosted (5 minutes)

```bash
npm install @calos/email-sdk
```

```javascript
const calos = require('@calos/email-sdk');

await calos.email.send({
  apiKey: 'calos_abc123...',  // Free tier: 100 emails/month
  to: 'customer@example.com',
  subject: 'Welcome!',
  body: 'Thanks for signing up.'
});
```

**Get free API key:** [calos.ai/email](https://calos.ai/email)

---

### Self-Hosted (2 hours)

```bash
git clone https://github.com/calos/agent-router.git
cd agent-router
docker-compose up -d
```

[Full deployment guide →](deployment/DEPLOY.md)

---

## ✨ Features

### Core (Open Source - AGPLv3)

| Feature | Description | Status |
|---------|-------------|--------|
| **Gmail Webhook** | Zero-cost relay via Gmail API | ✅ |
| **Double Opt-In** | Anti-spam whitelist | ✅ |
| **Rate Limiting** | 50/hour, 500/day per user | ✅ |
| **Reputation Tracking** | Auto-block bad actors | ✅ |
| **2FA** | TOTP authenticator apps | ✅ |
| **API Keys** | Tiered access control | ✅ |
| **Zero Cost** | Google Sheets + Gmail SMTP | ✅ |

### Premium (Cloud-Only)

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Emails/month | 100 | 10,000 | Unlimited |
| Templates | - | ✓ | ✓ |
| A/B Testing | - | ✓ | ✓ |
| Analytics | Basic | Advanced | Advanced |
| Webhooks | - | ✓ | ✓ |
| Team | 1 user | 5 users | Unlimited |
| Support | Community | Email | Priority |
| Price | $0 | $10/mo | $50/mo |

[See all premium features →](premium/README.md)

---

## 📖 Why CALOS Email?

### vs. Mailchimp/SendGrid

| | CALOS | Mailchimp | SendGrid |
|-|-------|-----------|----------|
| **Cost** | $0-50/mo | $13-350/mo | $20-90/mo |
| **Open Source** | ✓ | ✗ | ✗ |
| **Self-Hostable** | ✓ | ✗ | ✗ |
| **Setup Time** | 5 min | 30 min | 1 hour |

### vs. Building Yourself

| | CALOS | DIY |
|-|-------|-----|
| **Development Time** | 0 | 20-40 hours |
| **Maintenance** | 0 (cloud) | Ongoing |
| **Features** | All included | You build |
| **Security** | Built-in | You implement |

---

## 🏗️ Architecture

```
User App (SDK 5KB, zero deps)
    ↓
CALOS API (api.calos.ai or self-hosted)
    ├─ Rate Limiter
    ├─ Whitelist Manager
    ├─ Reputation Tracker
    └─ API Key Manager
    ↓
Google Sheets (Free DB)
    ↓
Free SMTP (Gmail 500/day or Brevo 300/day)
    ↓
Recipient ✓
```

---

## 📚 Documentation

- **[API Reference](docs/GMAIL_GATEWAY_API.md)** - Complete API docs
- **[Deployment Guide](deployment/DEPLOY.md)** - Deploy to Render/Railway/Docker
- **[Architecture](docs/HOSTED_SERVICE_ARCHITECTURE.md)** - System design
- **[SDK Docs](sdk/email-sdk/README.md)** - Client SDK usage

---

## 🎯 Use Cases

### Transactional Emails
- Welcome emails
- Password resets
- Order confirmations
- Receipts

### Marketing
- Newsletters
- Product updates
- Announcements

### Notifications
- Alert emails
- Digest emails
- Reminders

---

## 🔐 Security

- API keys hashed (SHA-256)
- OAuth tokens encrypted (AES-256-GCM)
- HTTPS only
- Rate limiting
- Reputation tracking
- Double opt-in

---

## 📦 What's Included

### Server (AGPLv3)
```
lib/
├── gmail-gateway.js              # Main API
├── gmail-rate-limiter.js         # Rate limiting
├── email-reputation-tracker.js   # Reputation
├── recipient-whitelist-manager.js # Whitelist
├── two-factor-auth.js            # 2FA
└── api-key-manager.js            # API keys
```

### SDK (MIT)
```
sdk/email-sdk/
├── index.js      # 5KB, zero dependencies
├── index.d.ts    # TypeScript types
└── README.md     # Documentation
```

### Premium (Proprietary)
```
premium/
├── templates.js               # Email templates
├── ab-testing.js              # A/B testing
├── analytics-dashboard.js     # Analytics
└── webhooks.js                # Event webhooks
```

---

## 🚢 Deploy

### Render.com (Free)

1. Push to GitHub
2. Connect to Render
3. Add env vars
4. Deploy

**Cost:** $0/month

### Railway.app

```bash
railway up
```

**Cost:** $5/month credit (free)

### Docker

```bash
docker-compose up -d
```

**Cost:** Depends on hosting

[Full deployment guide →](deployment/DEPLOY.md)

---

## 💰 Pricing

### Free Tier
- 100 emails/month
- Core features
- Community support
- **No credit card**

### Pro ($10/month)
- 10,000 emails/month
- Templates + A/B testing
- Analytics dashboard
- Email support

### Enterprise ($50/month)
- Unlimited emails
- White-label
- Dedicated IP
- Priority support

[Full pricing →](https://calos.ai/email/pricing)

---

## 🤝 Contributing

We welcome contributions!

**Areas we need help:**
- Email templates
- Analytics dashboard
- Webhooks
- Documentation
- Tests

[Contributing guide →](CONTRIBUTING.md)

---

## 📜 License

- **Server:** [AGPLv3](LICENSE) (open source, self-hostable)
- **SDK:** [MIT](sdk/email-sdk/LICENSE) (maximum compatibility)
- **Premium:** Proprietary (cloud-only)

---

## 🗺️ Roadmap

### Q1 2025 ✓
- [x] Core email functionality
- [x] API key management
- [x] Rate limiting
- [x] Reputation tracking
- [x] 2FA support

### Q2 2025
- [ ] Email templates
- [ ] A/B testing
- [ ] Analytics dashboard
- [ ] Webhooks

### Q3 2025
- [ ] SMS sending
- [ ] Push notifications

---

## ❓ FAQ

**Q: Can I self-host for free?**
A: Yes! Core features are open source. You just need a server (~$5/mo).

**Q: What's the catch?**
A: No catch. We make money from the cloud version with premium features.

**Q: Can I use this for my SaaS?**
A: Yes! Perfect for transactional emails.

**Q: How is this different from Mailchimp?**
A: Open source, self-hostable, cheaper, simpler.

---

## 🆘 Support

- **Discord:** [discord.gg/calos](https://discord.gg/calos)
- **Email:** support@calos.ai
- **Docs:** [docs.calos.ai/email](https://docs.calos.ai/email)
- **Issues:** [GitHub Issues](https://github.com/calos/agent-router/issues)

---

## ⭐ Star Us

If you find this useful, please star on GitHub!

[![GitHub stars](https://img.shields.io/github/stars/calos/agent-router.svg?style=social&label=Star)](https://github.com/calos/agent-router)

---

**Built with ❤️ by [CALOS](https://calos.ai)**

*Open source email • Self-hostable • Just works*
