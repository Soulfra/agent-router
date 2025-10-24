# Premium Features (Cloud-Only)

These features are only available on the cloud-hosted version at [calos.ai/email](https://calos.ai/email).

## Why Premium?

The core email functionality is **open source** (AGPLv3) and can be self-hosted. However, these premium features require our infrastructure and are **not included** in the self-hosted version.

## Premium Features

### 1. **Email Templates** (`templates.js`)
- Pre-designed email templates
- Template variables
- Custom HTML/CSS
- Template versioning

**Why Cloud-Only:** Requires template storage, rendering engine, and CDN.

---

### 2. **A/B Testing** (`ab-testing.js`)
- Test subject lines
- Test email content
- Test send times
- Automatic winner selection

**Why Cloud-Only:** Requires statistical analysis, test coordination across users.

---

### 3. **Analytics Dashboard** (`analytics-dashboard.js`)
- Open rate tracking
- Click tracking
- Geographic distribution
- Device/client breakdown
- Custom reports

**Why Cloud-Only:** Requires pixel tracking, link wrapping, data warehousing.

---

### 4. **Webhooks** (`webhooks.js`)
- Email opened
- Link clicked
- Email bounced
- Spam complaint
- Unsubscribe

**Why Cloud-Only:** Requires webhook management, retry logic, event queueing.

---

### 5. **Team Collaboration** (`team-collaboration.js`)
- Multi-user access
- Role-based permissions
- Shared templates
- Activity logs
- Team analytics

**Why Cloud-Only:** Requires user management, auth system, shared state.

---

### 6. **Advanced Deliverability** (`deliverability.js`)
- Dedicated IP addresses
- Domain warm-up
- SPF/DKIM/DMARC setup
- Bounce handling
- List cleaning

**Why Cloud-Only:** Requires IP pool management, DNS configuration, reputation monitoring.

---

### 7. **Compliance & Security** (`compliance.js`)
- GDPR compliance tools
- Data export/deletion
- Audit logs
- SOC2/HIPAA compliance
- Data encryption at rest

**Why Cloud-Only:** Requires secure infrastructure, compliance certifications.

---

### 8. **Priority Support** (`support.js`)
- Email support (< 24hr response)
- Slack/Discord support
- Video calls
- Custom integrations
- Dedicated account manager (Enterprise)

**Why Cloud-Only:** Requires support team.

---

## Pricing

| Feature | Free | Pro ($10/mo) | Enterprise ($50/mo) |
|---------|------|--------------|---------------------|
| Core email sending | ✓ | ✓ | ✓ |
| Templates | - | ✓ | ✓ |
| A/B Testing | - | ✓ | ✓ |
| Analytics | Basic | Advanced | Advanced |
| Webhooks | - | ✓ | ✓ |
| Team (users) | 1 | 5 | Unlimited |
| Deliverability | Shared IP | Shared IP | Dedicated IP |
| Compliance | - | - | ✓ |
| Support | Community | Email | Priority + Calls |

---

## Implementation Status

- [ ] Templates
- [ ] A/B Testing
- [ ] Analytics Dashboard
- [ ] Webhooks
- [ ] Team Collaboration
- [ ] Advanced Deliverability
- [ ] Compliance Tools
- [ ] Priority Support

---

## For Self-Hosters

If you're self-hosting and want these features, you have two options:

1. **Upgrade to Cloud** - Move to our hosted version
2. **Build Yourself** - These are not in the open source code, but you can implement similar features

**Note:** We may open-source some of these features in the future, but they will always require cloud infrastructure to function properly.

---

## License

Premium features are **proprietary** and not included in the AGPLv3 license.

Core features remain open source.
