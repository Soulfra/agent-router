---
description: Generate engineering culture cards from codebase
tags: [cal, cards, teaching, codebase-analysis]
---

Analyze the current codebase and generate educational culture pack cards for the card game.

Scan for:
- Anti-patterns (God objects, nested callbacks, magic numbers)
- Good patterns (design patterns, type safety, error handling)
- Code smells and technical debt
- Architecture decisions

Generate Cards Against Humanity-style cards that teach engineering through roasting.

Use the EngineeringCardGenerator class in lib/engineering-card-generator.js.

Output:
- Generated culture pack JSON file
- Rarity distribution (common → mythic)
- Teaching insights for each pattern found

This is for the CALOS card game educational system - where Gen Z learns engineering by roasting bad code.
