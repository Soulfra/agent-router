Check rate limits for user: $ARGUMENTS

Expected format: `/project:gmail-check-limits [userId]`

Example: `/project:gmail-check-limits user123`

**Code:**

```javascript
const GmailGateway = require('./lib/gmail-gateway');
const gateway = new GmailGateway();
await gateway.init();

const userId = '$ARGUMENTS'.trim();
const status = await gateway.getStatus(userId);

if (status.user && status.user.rateLimits) {
  const limits = status.user.rateLimits;

  console.log(`\nRate Limits for ${userId}:\n`);

  console.log(`Hourly:   ${limits.hourly.current}/${limits.hourly.limit} emails`);
  console.log(`  Resets: ${new Date(limits.hourly.resetAt).toLocaleString()}`);

  console.log(`\nDaily:    ${limits.daily.current}/${limits.daily.limit} emails`);
  console.log(`  Resets: ${new Date(limits.daily.resetAt).toLocaleString()}`);

  console.log(`\nMonthly:  ${limits.monthly.current}/${limits.monthly.limit} emails`);
  console.log(`  Resets: ${new Date(limits.monthly.resetAt).toLocaleString()}`);

  console.log(`\nLifetime: ${limits.total} emails sent`);

  // Calculate percentages
  const hourlyPct = (limits.hourly.current / limits.hourly.limit * 100).toFixed(1);
  const dailyPct = (limits.daily.current / limits.daily.limit * 100).toFixed(1);
  const monthlyPct = (limits.monthly.current / limits.monthly.limit * 100).toFixed(1);

  console.log(`\nUsage:`);
  console.log(`  Hourly:  ${hourlyPct}%`);
  console.log(`  Daily:   ${dailyPct}%`);
  console.log(`  Monthly: ${monthlyPct}%`);

  // Warnings
  if (hourlyPct > 80) console.log(`\n⚠️  Warning: Approaching hourly limit`);
  if (dailyPct > 80) console.log(`\n⚠️  Warning: Approaching daily limit`);
  if (monthlyPct > 90) console.log(`\n⚠️  Warning: Approaching monthly limit`);

} else {
  console.error(`✗ Could not fetch rate limits for user ${userId}`);
}
```

**Default Limits:**
- **Hourly:** 50 emails (prevents spam bursts)
- **Daily:** 500 emails (Gmail SMTP limit)
- **Monthly:** 10,000 emails (reasonable for personal use)
- **Per Recipient/Day:** 10 emails (prevents harassment)

**Global Limits (All Users):**
- **Hourly:** 100 emails
- **Daily:** 500 emails (matches free SMTP limit)

**If you hit a limit:**
- Wait for automatic reset
- Hourly resets at top of next hour
- Daily resets at midnight
- Monthly resets on 1st of month

**Admin override:**
Contact admin to temporarily increase limits or reset counters.
