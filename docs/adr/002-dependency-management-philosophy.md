# ADR-002: Dependency Management Philosophy

**Status:** Accepted

**Date:** 2025-10-21

**Decision Makers:** @matthewmauer

**Tags:** #dependencies #oss #security #architecture #philosophy

---

## Context

### The Problem

We face a fundamental architectural question: **When should we use OSS dependencies vs building custom solutions?**

**Current Reality:**
- 312+ files in `lib/` (many custom-built)
- 200+ npm dependencies in package.json
- Mix of OSS and custom with no clear strategy
- Risk of "Not Invented Here" syndrome vs "Dependency Hell"

**Specific Trigger:** Git hooks decision
- Built custom pre-commit hook (26 lines)
- But OSS alternatives exist: Husky (7M downloads/week), Lefthook (GitLab uses it)
- Question: Should we migrate or stay custom?

### The Deeper Question

This isn't just about git hooks - it's about **project philosophy**:
1. Do we trust OSS or build everything ourselves?
2. How do we balance security vs convenience?
3. When is a dependency worth the cost?
4. How do we avoid supply chain attacks?

### Current Situation

**No documented strategy** leads to inconsistent decisions:
- ✅ Using Express, PostgreSQL, Ollama (good choices)
- ❓ Built custom email relay instead of using nodemailer
- ❓ Built custom AI router instead of using LangChain
- ❓ Built custom git hook instead of using Husky/Lefthook
- ❓ 312 custom lib files - which should be OSS?

### Constraints

- **Security**: Supply chain attacks are real (see SolarWinds, log4j)
- **Maintainability**: Every custom solution = maintenance burden
- **Team Size**: Small team (can't maintain 100s of custom libs)
- **Velocity**: Can't afford to reinvent every wheel
- **Control**: Need ability to customize domain-specific logic

---

## Decision

### Core Choice

**We will adopt a Hybrid Dependency Strategy** with clear rules for when to use OSS vs custom solutions.

### The 4-Tier Dependency Model

#### Tier 1: MUST Use OSS (Commodity Infrastructure)

**Rule:** If it's generic infrastructure that doesn't differentiate us, use battle-tested OSS.

**Examples:**
- HTTP server: Express ✅
- Database: PostgreSQL ✅
- Git hooks: Lefthook ✅ (this decision)
- Testing: Mocha ✅
- Linting: ESLint, Prettier ✅
- Validation: Joi, Zod
- Logging: Winston, Pino

**Why:** Reinventing these = waste of time, high bug risk

#### Tier 2: Use OSS but WRAP (Vendor Lock-in Risk)

**Rule:** Use OSS for complex functionality, but wrap with our own abstraction layer to enable swapping.

**Examples:**
- AI providers: Wrap OpenAI/Anthropic APIs
  ```javascript
  // lib/ai-wrapper.js (our interface)
  // Can swap Claude → GPT → Ollama without changing app code
  ```
- Email delivery: Wrap SMTP providers (Gmail, Brevo, MailerSend)
- Storage: Wrap MinIO/S3 (can switch vendors)
- Payment processing: Wrap Stripe (can add PayPal later)

**Why:** Get OSS benefits but avoid vendor lock-in

#### Tier 3: Build CUSTOM (Core Business Logic)

**Rule:** Build custom when it's our unique value proposition or domain-specific.

**Examples:**
- Knowledge pattern learning system (our innovation)
- Multi-domain routing (our architecture)
- Lesson progress tracking (our data model)
- `bin/doc-sync` (our workflow)
- Cal's debugging hints (our UX)

**Why:** This is what makes us different from competitors

#### Tier 4: Fork & Contribute (OSS Needs Fixes)

**Rule:** If OSS is 90% there but missing something we need, fork and contribute back upstream.

**Examples:**
- If Lefthook lacks a feature we need → fork, add feature, submit PR
- If Express middleware has a bug → submit PR
- If Ollama client is missing something → contribute

**Why:** Shared maintenance burden, community benefit

---

## Consequences

### Positive Consequences

- ✅ **Clear decision framework** - No more "should we use X or build it?" debates
- ✅ **Faster velocity** - Use OSS for commodity stuff
- ✅ **Better security** - Battle-tested code for infrastructure
- ✅ **Easier hiring** - Developers already know Express, PostgreSQL, etc.
- ✅ **Vendor flexibility** - Wrapper pattern enables swapping
- ✅ **Community benefit** - Contributing back helps everyone

### Negative Consequences

- ⚠️ **More dependencies** - package.json will grow
- ⚠️ **Supply chain risk** - Must monitor for vulnerabilities
- ⚠️ **Version conflicts** - Dependency hell can still happen
- ⚠️ **Learning curve** - Team must learn OSS tools
- ⚠️ **Less control** - Can't fix OSS bugs immediately

### Neutral Consequences

- 📝 **ADR required** - Must document Tier 2/3 decisions
- 📝 **Wrapper code** - Extra abstraction layer for Tier 2
- 📝 **Dependency audits** - Must run `npm audit` regularly

---

## Alternatives Considered

### Alternative 1: Zero Dependencies (Pure Custom)

**Description:** Build everything from scratch, no external dependencies

**Pros:**
- Full control
- No supply chain risk
- No licensing issues
- Perfect customization

**Cons:**
- **Massive time sink** - Would take years to build Express equivalent
- **Bug-prone** - Our custom HTTP server will have bugs Express already fixed
- **Talent drain** - Developers want to work with modern stacks
- **Maintenance nightmare** - Team of 100 can't maintain OS-level code

**Example:** SQLite project does this (custom build system, custom everything)

**Why rejected:** We don't have SQLite's 30-year headstart or dedicated team

### Alternative 2: OSS Everything (Maximum Dependencies)

**Description:** Use npm packages for everything, including trivial utils

**Pros:**
- Fast development
- Community support
- Battle-tested code
- Easy onboarding

**Cons:**
- **Supply chain attacks** - left-pad incident, colors.js sabotage
- **Bloat** - 500MB node_modules for simple app
- **Version hell** - Conflicting dependencies
- **No differentiation** - App looks like everyone else's

**Example:** Many early Node.js projects (thousands of tiny dependencies)

**Why rejected:** Security risk too high, no competitive advantage

### Alternative 3: Selective OSS (Ad-hoc Decisions)

**Description:** Decide case-by-case without clear rules

**Pros:**
- Flexibility
- Optimize per situation

**Cons:**
- **Inconsistency** - Different developers make different choices
- **Rework** - Build custom solution, then realize OSS exists
- **No learning** - Same debates over and over
- **Confusion** - New team members don't know the pattern

**Example:** Our current approach before this ADR

**Why rejected:** Exactly the problem we're solving!

---

## Related Decisions

- **Implements:** This ADR
- **Example:** Git hooks (moving from custom → Lefthook per Tier 1 rule)
- **Future:** Will guide all "build vs buy" decisions

---

## Notes

### Decision Matrix

| Question | Answer | Tier |
|----------|--------|------|
| Is it generic infrastructure? | Yes → Use OSS | Tier 1 |
| Is it complex but swappable? | Yes → Use OSS + Wrap | Tier 2 |
| Is it our core value prop? | Yes → Build Custom | Tier 3 |
| Does OSS need a small fix? | Yes → Fork & Contribute | Tier 4 |

### Security Protocol

For **Tier 1 & 2** (OSS dependencies):
1. Run `npm audit` weekly
2. Use Snyk or similar for vulnerability scanning
3. Pin versions in package-lock.json
4. Review dependencies before adding (check GitHub stars, last commit, maintainers)
5. Prefer packages with:
   - 1M+ downloads/week
   - Active maintenance (commit in last 3 months)
   - Multiple maintainers (not one-person project)
   - Clear license (MIT, Apache 2.0)

### Wrapper Pattern Template

```javascript
// lib/[service]-wrapper.js
class ServiceWrapper {
  constructor(config) {
    // Current implementation (can swap later)
    this.provider = new ThirdPartyLib(config);
  }

  // Our interface (stable, won't change)
  async doThing(params) {
    // Translate our interface → provider's interface
    return this.provider.doProviderThing(params);
  }
}

module.exports = ServiceWrapper;
```

**Benefits:**
- App code calls `ServiceWrapper.doThing()`
- Can swap providers without changing app code
- Isolates vendor-specific quirks

### Implementation Checklist

When adding a new dependency:
- [ ] Determine tier (1-4)
- [ ] If Tier 2, create wrapper
- [ ] If Tier 3/4, write ADR explaining why custom
- [ ] Add to package.json with pinned version
- [ ] Run `npm audit`
- [ ] Document in `docs/GENERATED_SYSTEM_MAP.md` (auto via doc-sync)

### Examples in Practice

**Tier 1 Decision: Git Hooks**
- ❌ Custom pre-commit hook (26 lines)
- ✅ Migrate to Lefthook (battle-tested, parallel execution)
- Why: Git hooks are commodity infrastructure

**Tier 2 Decision: AI Providers**
- ✅ `lib/multi-llm-router.js` wraps OpenAI, Anthropic, DeepSeek
- Benefit: Can swap providers without touching app code

**Tier 3 Decision: Knowledge Pattern Learning**
- ✅ Custom `knowledge_patterns` table and matching logic
- Why: This is our innovation, no OSS equivalent

**Tier 4 Decision: (Hypothetical)**
- If Lefthook lacks "post-rebase" hook → submit PR upstream

### Monitoring & Review

- **Quarterly dependency audit** - Review all Tier 1/2 deps
- **Annual tier review** - Should any Tier 3 become Tier 2?
- **Security alerts** - GitHub Dependabot enabled
- **Version updates** - Dependabot PRs reviewed weekly

---

## Appendix: Comparative Analysis

### npm Dependency Count: Industry Benchmarks

| Project Type | Avg Dependencies | Notes |
|--------------|------------------|-------|
| Microservice | 20-50 | Minimal |
| Web App (Express) | 50-150 | Standard |
| Full Platform | 150-300 | Complex |
| Enterprise Monolith | 300-500 | Likely over-dependent |

**Our Project:** ~200 dependencies (reasonable for platform complexity)

### Security Incidents That Shaped This Decision

1. **left-pad (2016)** - 11-line package broke the internet
2. **event-stream (2018)** - Backdoor injected into popular package
3. **colors.js (2022)** - Maintainer sabotaged own package
4. **SolarWinds (2020)** - Supply chain attack on build system

**Lesson:** Trust, but verify. Pin versions. Audit regularly.
