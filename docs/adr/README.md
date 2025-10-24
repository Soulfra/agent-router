# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the CALOS Agent Router platform.

## What is an ADR?

An Architecture Decision Record (ADR) captures an important architectural decision made along with its context and consequences.

## Why ADRs?

-  **Prevent "Telephone Game"** - Record WHY decisions were made
- **Onboarding** - New developers understand historical context
- **Avoid Re-litigation** - Don't re-debate settled decisions
- **Track Evolution** - See how architecture evolved over time

## Format

We use a lightweight ADR format inspired by Michael Nygard's template:

```
# ADR-NNN: Title

**Status:** Proposed | Accepted | Deprecated | Superseded

**Date:** YYYY-MM-DD

**Decision Makers:** @username1, @username2

## Context

What is the issue we're seeing that is motivating this decision or change?

## Decision

What is the change we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change?

## Alternatives Considered

What other options did we evaluate?
```

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](./001-knowledge-pattern-learning.md) | Knowledge Pattern Learning System | Accepted | 2025-10-21 |

## Creating a New ADR

```bash
# Use the next sequential number
cp template.md 00X-your-decision-title.md

# Edit the new file
# Add to index above
# Commit with descriptive message
```

## When to Create an ADR

Create an ADR when you're making a decision that:
- Affects system architecture
- Has multiple viable alternatives
- Will be difficult to change later
- Impacts multiple parts of the codebase
- Sets a precedent for future work

## When NOT to Create an ADR

Don't create ADRs for:
- Minor implementation details
- Obvious technical choices
- Temporary experiments
- Bug fixes

## Further Reading

- [Michael Nygard's ADR Template](https://github.com/joelparkerhenderson/architecture-decision-record/blob/main/templates/decision-record-template-by-michael-nygard/index.md)
- [ADR GitHub Organization](https://adr.github.io/)
- [Thoughtworks on ADRs](https://www.thoughtworks.com/radar/techniques/lightweight-architecture-decision-records)
