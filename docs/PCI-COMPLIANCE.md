# PCI Compliance Documentation

## Overview

This document outlines how the CALOS Business OS maintains PCI DSS (Payment Card Industry Data Security Standard) compliance for credit card processing.

**TL;DR**: We are PCI compliant because **we never see, store, or transmit card data**. All payment processing is handled by PCI Level 1 certified providers (Stripe, Braintree).

---

## Compliance Strategy

### Our Approach: **SAQ-A** (Simplest PCI Path)

We use **SAQ-A** (Self-Assessment Questionnaire A) because:
- ✅ All card data is handled by PCI-compliant third parties (Stripe, Braintree)
- ✅ We never store card numbers, CVV, or expiration dates
- ✅ We use hosted payment pages (Stripe Checkout, Braintree Hosted Fields)
- ✅ We use tokenization (payment tokens instead of card data)
- ✅ All connections use TLS 1.2+ encryption

**This means we only need to answer 22 questions instead of 300+ for full PCI certification.**

---

## Payment Providers (PCI Level 1 Certified)

### 1. Stripe (Primary Provider)

**PCI Compliance Level**: Level 1 (highest level)
**Certification**: [Stripe PCI DSS Compliance](https://stripe.com/docs/security/guide)

**What Stripe Handles**:
- ✅ Card data collection (Stripe.js, Stripe Elements)
- ✅ Card data storage (tokenized)
- ✅ Card data transmission (end-to-end encryption)
- ✅ PCI DSS audits (annual ROC)
- ✅ Fraud detection (Stripe Radar)

**What We Receive from Stripe**:
- ❌ NOT card numbers
- ❌ NOT CVV codes
- ❌ NOT expiration dates
- ✅ Payment tokens (`tok_*`, `pm_*`)
- ✅ Last 4 digits (safe to store)
- ✅ Card brand (Visa, Mastercard, etc.)

### 2. Braintree/PayPal (Secondary Provider)

**PCI Compliance Level**: Level 1
**Certification**: [Braintree PCI Compliance](https://www.braintreepayments.com/features/data-security)

**What Braintree Handles**:
- ✅ Card data collection (Hosted Fields, Drop-in UI)
- ✅ Card data storage (vault)
- ✅ PayPal, Venmo, Apple Pay, Google Pay
- ✅ 3D Secure 2.0

**What We Receive from Braintree**:
- ❌ NOT card numbers
- ✅ Payment method nonces (one-time tokens)
- ✅ Payment method tokens (for recurring)
- ✅ Last 4 digits
- ✅ Transaction IDs

### 3. Coinbase Commerce (Crypto Payments)

**Compliance**: N/A (cryptocurrency, not PCI scope)
**KYC/AML**: Handled by Coinbase

---

## Data Flow (PCI Scope)

### Card Payment Flow (Stripe Terminal - In-Person)

```
Customer Card
    ↓
[Stripe Terminal Reader] ← End-to-end encryption
    ↓
[Stripe API]
    ↓
[Our Server] ← Receives payment token (NOT card data)
    ↓
[Database] ← Stores: payment_intent_id, last4, brand (NO card data)
```

### Card Payment Flow (Online)

```
Customer Card
    ↓
[Stripe Checkout Page] ← Hosted by Stripe (NOT us)
    ↓
[Stripe API]
    ↓
[Webhook to Our Server] ← Receives payment_intent_id (NOT card data)
    ↓
[Database] ← Stores: transaction_id, amount, status
```

### What We Store (Safe Data)

```sql
-- POS Transactions Table
CREATE TABLE pos_transactions (
  transaction_id VARCHAR(100) PRIMARY KEY,
  payment_intent_id VARCHAR(255),     -- Stripe token (safe)
  amount_cents INTEGER NOT NULL,      -- Amount (safe)
  currency VARCHAR(10),                -- Currency (safe)
  payment_method VARCHAR(50),          -- 'card', 'cash', 'qr' (safe)
  status VARCHAR(50),                  -- 'completed', 'refunded' (safe)

  -- NEVER STORED:
  -- ❌ card_number
  -- ❌ cvv
  -- ❌ expiration_date
  -- ❌ cardholder_name (unless explicitly provided by user for receipts)
);
```

**Last 4 Digits** (safe to store per PCI):
- We MAY store last 4 digits (e.g., `4242`) for receipts
- This is NOT considered "cardholder data" by PCI standards
- Example: "Visa ending in 4242"

---

## PCI SAQ-A Compliance Checklist

### ✅ Requirements We Meet

| Requirement | Status | How We Comply |
|-------------|--------|---------------|
| **2.1** Hosting provider is PCI compliant | ✅ | Stripe, Braintree, Replit (PCI-compliant infrastructure) |
| **2.2** All connections use TLS 1.2+ | ✅ | Enforced by Stripe/Braintree APIs |
| **2.3** Cardholder data is NOT stored | ✅ | We never receive or store card data |
| **2.4** Payment pages are hosted externally | ✅ | Stripe Checkout, Braintree Hosted Fields |
| **2.5** Tokens are used instead of card data | ✅ | Payment intents, nonces, tokens |
| **8.1** Secure user authentication | ✅ | Passwords hashed (bcrypt), OAuth 2.0, 2FA |
| **9.1** Physical security (for terminals) | ✅ | Stripe Terminal readers are tamper-resistant |
| **12.1** Annual PCI review | ✅ | This document + annual SAQ-A submission |

### ❌ Requirements That Don't Apply

| Requirement | Why Not Applicable |
|-------------|-------------------|
| **3.x** Cardholder data storage | We don't store card data |
| **4.x** Card data transmission | We don't transmit card data |
| **7.x** Card data access controls | We don't have access to card data |

---

## Security Measures

### 1. Network Security

- ✅ **TLS 1.2+** for all API connections
- ✅ **HTTPS only** (no HTTP)
- ✅ **Webhook signature verification** (HMAC SHA256)
- ✅ **API key rotation** (quarterly)
- ✅ **Firewall rules** (only allow Stripe/Braintree IPs)

### 2. Data Encryption

- ✅ **At rest**: PostgreSQL encryption (AES-256)
- ✅ **In transit**: TLS 1.2+ (Stripe/Braintree enforce this)
- ✅ **Sensitive data**: API keys encrypted in database

### 3. Access Controls

- ✅ **Role-based access control** (RBAC)
- ✅ **Least privilege principle** (users only see their data)
- ✅ **Audit logs** (all payment operations logged)
- ✅ **2FA for admin accounts**

### 4. Application Security

- ✅ **SQL injection prevention** (parameterized queries)
- ✅ **XSS prevention** (input sanitization)
- ✅ **CSRF protection** (tokens)
- ✅ **Rate limiting** (prevent abuse)
- ✅ **Error messages** don't leak sensitive data

---

## Stripe Terminal (In-Person Payments)

### Hardware Security

**Stripe Terminal Readers** are PCI PTS 5.x certified:
- ✅ **End-to-end encryption** (card data encrypted at tap/swipe)
- ✅ **Tamper detection** (alerts if device is compromised)
- ✅ **Secure boot** (firmware verified on startup)
- ✅ **No card data stored** on device

**Supported Readers**:
- **BBPOS WisePad 3** (mobile, Bluetooth)
- **Verifone P400** (countertop, Ethernet/WiFi)
- **Stripe Reader S700** (smart reader, Android-based)

### Card Data Flow (Terminal)

```
Customer taps/swipes card
    ↓
[Stripe Terminal Reader]
    ↓ (Encrypted card data)
[Stripe API] ← Card data NEVER touches our servers
    ↓
[Our Server] ← Receives payment_intent_id
    ↓
[Database] ← Stores transaction_id, amount, status
```

**We never see card data**, even with physical terminals.

---

## Crypto Payments (Out of PCI Scope)

### Coinbase Commerce

- ✅ **No PCI requirements** (cryptocurrency, not card data)
- ✅ **KYC/AML handled by Coinbase**
- ✅ **Wallet addresses** are public (safe to store)
- ✅ **Transaction hashes** are public (safe to store)

### Tax Compliance (Crypto)

- ✅ **IRS Form 8300** for transactions >$10k
- ✅ **1099-MISC** for crypto payments to contractors
- ✅ **Cost basis tracking** for capital gains

---

## Incident Response Plan

### If We Suspect a Data Breach:

1. **Isolate** affected systems immediately
2. **Notify** Stripe/Braintree security teams
3. **Preserve** logs for forensic analysis
4. **Contact** PCI forensic investigator (if card data compromised)
5. **Notify** affected users (within 72 hours per GDPR)
6. **File** data breach reports (state/federal as required)

### Contact Information:

- **Stripe Security**: security@stripe.com
- **Braintree Security**: security@braintreepayments.com
- **PCI Council**: https://www.pcisecuritystandards.org/

---

## Annual PCI Compliance Tasks

### Every Year:

- [ ] **Review this document** (update for any changes)
- [ ] **Complete SAQ-A** (Self-Assessment Questionnaire A)
- [ ] **Submit AOC** (Attestation of Compliance) to payment providers
- [ ] **Verify TLS certificates** are valid
- [ ] **Rotate API keys** (Stripe, Braintree)
- [ ] **Review access logs** for anomalies
- [ ] **Test webhook signature verification**
- [ ] **Update dependencies** (security patches)

### Quarterly:

- [ ] **Review access controls** (remove inactive users)
- [ ] **Check for security updates** (Stripe SDK, Braintree SDK)
- [ ] **Test payment flows** (ensure no regressions)

---

## Resources

### Official PCI Documentation:

- **PCI DSS Quick Reference Guide**: https://www.pcisecuritystandards.org/documents/PCI_DSS-QRG-v3_2_1.pdf
- **SAQ-A (Stripe Merchants)**: https://stripe.com/docs/security/guide#validating-pci-compliance

### Provider Documentation:

- **Stripe Security**: https://stripe.com/docs/security
- **Braintree Security**: https://www.braintreepayments.com/features/data-security
- **Coinbase Security**: https://commerce.coinbase.com/docs/security/

---

## Summary

✅ **We are PCI compliant** because:
1. All card processing goes through PCI Level 1 providers (Stripe, Braintree)
2. We never see, store, or transmit card data
3. We use tokenization (payment tokens instead of cards)
4. We use hosted payment pages (Stripe Checkout)
5. All connections use TLS 1.2+ encryption
6. We complete annual SAQ-A attestation

🔒 **Security is our top priority.** If you have questions about PCI compliance, contact: security@calos.com

---

*Last updated: [Date]*
*Next review: [Date + 1 year]*
