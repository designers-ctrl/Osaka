# Design Documentation

This directory contains visual design guidelines and UI specifications for Osaka.

## Documents

- **[FIGMA_INTEGRATION.md](FIGMA_INTEGRATION.md)** — Maps Figma components to Vue implementation, explains the component sync workflow, and documents how design specs translate to code.

- **[TYPOGRAPHY_GUIDE.md](TYPOGRAPHY_GUIDE.md)** — Type scale, font families, font pairing rules, and usage guidelines for different text elements (headings, body, labels, etc).

- **[BACKGROUNDS_GUIDE.md](BACKGROUNDS_GUIDE.md)** — Background color system, pattern usage, when to use which background variant, and accessibility considerations.

## Design Authority

**Important:** The `/vuetify-ds` skill in Claude Code is the **authoritative source** for:
- Colors and theme tokens
- Component selection
- Spacing scale
- Radius values
- Component defaults

This folder documents *how we use* the design system. For *what the design system contains*, consult `/vuetify-ds`.

## Before Building UI

Always:
1. Load `/vuetify-ds` skill **first** if changing any visual styling
2. Check [FIGMA_INTEGRATION.md](FIGMA_INTEGRATION.md) if the component comes from Figma
3. Verify your implementation matches the design spec
4. Update this documentation if you establish new patterns

If you add a new pattern that doesn't fit existing documentation, create a new guide.
