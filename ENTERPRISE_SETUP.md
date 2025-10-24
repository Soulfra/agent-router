# CALOS Enterprise System Setup

## Quick Start

### 1. Run the setup script
```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/calos
./scripts/setup-enterprise.sh
```

This will:
- ✅ Create all pricing/licensing tables
- ✅ Create test customer with demo data
- ✅ Generate sample telemetry events
- ✅ Set up culture analysis data

### 2. Start the server
```bash
npm start
```

### 3. Access the dashboards

**Enterprise Dashboard** (Admin View)
```
http://localhost:5001/enterprise-dashboard.html
```
- View all customers
- See stats (revenue, conversions, etc.)
- Create new licenses
- Revoke access

**Culture Profile** (Customer Analysis)
```
http://localhost:5001/culture-profile.html
```
- Analyzes customer usage patterns
- Shows "culture" (how they use your platform)
- Identifies upsell opportunities
- Health score (0-100)

---

## What is This?

### The "Enterprise White-Label" Model

You're not building a SaaS subscription platform like Stripe checkout. You're building an **enterprise platform** like:
- Unity (game engine licensing)
- Unreal Engine (licensing + telemetry)
- VS Code (free + telemetry + enterprise licensing)

### How It Works

```
Customer deploys your code on their domain
    ↓
License "phones home" to verify (lib/license-verifier.js)
    ↓
Telemetry tracks usage (lib/telemetry/)
    ↓
Culture Analyzer processes patterns (lib/culture-analyzer.js)
    ↓
You see insights in enterprise dashboard
    ↓
Identify upsell opportunities
    ↓
Manual sales (wire transfer, net-30, etc.)
```

### The "Scientist" Part

The **Culture Analyzer** is your "scientist" - it analyzes telemetry to understand:

- **Feature Usage**: Which features they use most
- **Behavior Patterns**: Peak hours, working days, session duration
- **Team Size**: Estimated from concurrent users
- **Tech Stack**: Detected from user agents, API calls
- **Health Score**: 0-100 based on engagement
- **Upsell Opportunities**: Approaching limits, high usage, multi-domain

Example insights:
```
"This customer uses POS heavily but never touches crypto"
→ Upsell: Crypto integration training

"Peak usage Mon-Fri 9-5pm, low errors, 8-person team"
→ Health: Excellent (score: 92)

"Using 95% of API limit on free tier, 200 events/day"
→ Upsell: Strong Pro upgrade candidate (HIGH priority)
```

---

## Architecture

### You Already Had
1. ✅ License verification (`lib/license-verifier.js`)
2. ✅ Branding middleware (`lib/middleware/branding-middleware.js`)
3. ✅ Telemetry system (`lib/telemetry/`)
4. ✅ Domain router (12 domains → one server)
5. ✅ Usage tracking (`lib/middleware/usage-tracking-middleware.js`)

### I Added
1. ✅ Enterprise admin dashboard (`public/enterprise-dashboard.html`)
2. ✅ Culture analyzer (`lib/culture-analyzer.js`)
3. ✅ Culture profile viewer (`public/culture-profile.html`)
4. ✅ Enterprise API routes (`routes/enterprise-routes.js`)
5. ✅ Database schema (`database/migrations/082_pricing_system.sql`)

---

## API Endpoints

### Enterprise Management (Admin Only)

**Stats**
```
GET /api/enterprise/stats
```
Returns: Total customers, active licenses, monthly revenue, conversion rate

**Customer List**
```
GET /api/enterprise/customers?status=active&tier=pro
```
Returns: All customers with usage, tier, status

**Create License**
```
POST /api/enterprise/create-license
Body: { userId, tier, billingPeriod, trialDays, notes }
```
Returns: `installId` to give to customer

**Revoke License**
```
POST /api/enterprise/revoke-license
Body: { installId }
```
Immediately disables access

**Customer Profile**
```
GET /api/enterprise/customer/:installId/profile
```
Returns: Full profile (subscription, usage, telemetry, branding)

**Culture Analysis**
```
GET /api/enterprise/customer/:installId/culture
```
Returns: Culture insights (features, behavior, team, upsells, health score)

**Update Tier**
```
POST /api/enterprise/customer/:installId/update-tier
Body: { newTier, billingPeriod }
```
Manually upgrade/downgrade customer

---

## Test Customer

The setup script creates a demo customer:

- **Install ID**: `demo-install-abc123456789abcdef`
- **Tier**: Pro
- **Status**: Active
- **Domain**: demo.calos.sh
- **Telemetry Events**: ~100 events (last 30 days)
- **Usage Records**: ~50 usage events

Use this to test the dashboards without needing real customers.

---

## Sales Workflow

### Traditional SaaS (What You're NOT Doing)
```
User signs up → Stripe checkout → Auto-activate → Stripe billing
```

### Enterprise Model (What You ARE Doing)
```
1. Customer requests demo
2. You create license via dashboard (trial or paid)
3. Give them install_id
4. They deploy on their infrastructure
5. License phones home to verify
6. Telemetry tracks their usage
7. Culture Analyzer identifies patterns
8. You view culture profile → see upsell opportunities
9. You reach out: "I see you're hitting API limits..."
10. Manual contract (wire transfer, net-30)
11. You upgrade their tier in dashboard
12. Invoice sent separately (not Stripe)
```

---

## Next Steps

### 1. Add Admin Authentication
Currently, enterprise routes have placeholder auth. Add:

```javascript
// In routes/enterprise-routes.js
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
```

Then add `is_admin` column:
```sql
ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT false;
UPDATE users SET is_admin = true WHERE user_id = YOUR_ID;
```

### 2. Real Customers
When you get your first customer:

1. Create license via dashboard
2. Give them the `install_id`
3. They add to their config:
```bash
CALOS_INSTALL_ID=their-install-id-here
```

4. Their app phones home on startup
5. Telemetry flows in
6. You analyze their culture

### 3. Invoice Generation
Add PDF invoice generation:

```javascript
// lib/invoice-generator.js
const PDFDocument = require('pdfkit');

async function generateInvoice(customerId, month) {
  // Get usage data
  // Calculate charges
  // Generate PDF
  // Return download link
}
```

### 4. Email Notifications
When culture analyzer finds upsell opportunities:

```javascript
// Auto-email when customer hits 80% of limit
if (upsell.priority === 'high') {
  await sendEmail(customer.email, {
    subject: 'Usage Approaching Limit',
    body: `You've used ${upsell.percent}% of your ${upsell.feature} limit...`
  });
}
```

---

## Troubleshooting

### "Failed to load customers"

**Cause**: Enterprise routes not mounted or database migration not run

**Fix**:
```bash
# Check if routes are mounted (should see in logs):
# "Enterprise dashboard: /api/enterprise/customers"

# Run migrations:
./scripts/setup-enterprise.sh
```

### "No install ID provided"

**Cause**: Accessing culture-profile.html directly without `?install_id=...`

**Fix**: The page now shows customer selector automatically. Just click a customer card.

### Empty culture profile

**Cause**: No telemetry data for customer

**Fix**:
```sql
-- Add sample telemetry for your customer
INSERT INTO telemetry_events (install_id, event_type, event_data, created_at)
SELECT
  'your-install-id-here',
  'page_view',
  '{"source": "test"}',
  NOW() - (random() * INTERVAL '30 days')
FROM generate_series(1, 50);
```

---

## Files Reference

### Frontend
- `public/enterprise-dashboard.html` - Admin dashboard (all customers)
- `public/culture-profile.html` - Customer analysis (single customer)

### Backend
- `routes/enterprise-routes.js` - Enterprise API
- `lib/culture-analyzer.js` - Telemetry analysis ("scientist")
- `lib/license-verifier.js` - License phone-home (already existed)
- `lib/middleware/branding-middleware.js` - White-label (already existed)
- `lib/telemetry/` - Usage tracking (already existed)

### Database
- `database/migrations/082_pricing_system.sql` - Schema
- `database/migrations/083_seed_test_customer.sql` - Test data

### Scripts
- `scripts/setup-enterprise.sh` - One-command setup

---

## Summary

You're building an **enterprise platform**, not a SaaS subscription service.

**Key differences:**
- ❌ No Stripe checkout
- ❌ No automated billing
- ❌ No self-service upgrades
- ✅ Manual license creation
- ✅ Culture analysis ("scientist")
- ✅ Enterprise sales (wire transfer, contracts)
- ✅ White-label per customer
- ✅ Telemetry-driven upsells

This is the **Unity/VS Code/Unreal Engine model** - and it's way more profitable than SaaS if you nail the enterprise sales motion.

Good luck! 🚀
