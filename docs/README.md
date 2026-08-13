# Osaka Documentation

This directory contains all project documentation organized by topic. **This is the single source of truth for how Osaka works.**

Before implementing features, proposing architectural changes, or making design decisions, consult the relevant documentation below.

---

## 📐 Architecture

**Understanding how the system is organized, how data flows, and what belongs where.**

- **[Graph Architecture](architecture/GRAPH_ARCHITECTURE.md)** — Complete specification of the graph visualization layer: the multi-layer design (Graph Engine → Layout Engine → Renderer), interactions, animations, and state transitions
- **[Graph Architecture Summary](architecture/GRAPH_ARCHITECTURE_SUMMARY.md)** — Executive overview and recommendations for implementing the layered architecture
- **[Graph Migration Guide](architecture/GRAPH_MIGRATION_GUIDE.md)** — Step-by-step plan to refactor from D3-centric to layered architecture (3 phases, 3-4 weeks)
- **[Graph Refactor Checklist](architecture/GRAPH_REFACTOR_CHECKLIST.md)** — Day-by-day checklist for tracking architecture refactoring progress
- **[Graph Implementation Review](architecture/GRAPH_IMPLEMENTATION_REVIEW.md)** — Analysis of the current D3 graph implementation, what works, what's needed

**See also:** [CLAUDE.md](../CLAUDE.md) in the root — The master codebase guide with house rules, architecture, and development practices

---

## 🎨 Design

**UI design patterns, visual guidelines, and Figma integration.**

- **[Figma Integration Guide](design/FIGMA_INTEGRATION.md)** — How Figma files map to Vue components and the sync workflow
- **[Typography Guide](design/TYPOGRAPHY_GUIDE.md)** — Type scale, font pairing, and usage rules
- **[Backgrounds Guide](design/BACKGROUNDS_GUIDE.md)** — Background color system and pattern usage

**See also:** `/vuetify-ds` skill — The authority on Vuetify tokens, component selection, colors, spacing, and radius

---

## 📦 Development

**Implementation guides, patterns, and development workflows.**

- **[Implementation Summary](development/IMPLEMENTATION_SUMMARY.md)** — Summary of completed features and implementation approach

---

## 📖 How to Use This Documentation

### For Architecture Decisions
1. Read [CLAUDE.md](../CLAUDE.md) for project context and house rules
2. Read the relevant architecture document (see Architecture section above)
3. If implementing, follow the migration/implementation guide
4. **Update documentation** if you change the architecture

### For Design/UI Changes
1. Read the relevant design guide
2. Consult the `/vuetify-ds` skill before implementing
3. Ensure changes follow existing patterns
4. **Update documentation** if you add new patterns

### For New Features
1. Identify which system this affects (graph, state, layout, etc.)
2. Read the relevant architecture document
3. Check CLAUDE.md for house rules
4. Implement the feature
5. **Update documentation** if the feature changes existing behavior

---

## 🔄 Keeping Documentation Current

**Documentation is not optional.** If you:

- Change the architecture
- Modify interaction patterns
- Update the state model
- Add new graph features
- Revise design conventions

**You must update the affected documentation BEFORE considering the task complete.**

This is not busy-work — it's protecting the next person (including future-you) from confusion.

---

## 📋 Documentation Structure

```
docs/
├── README.md (you are here)
│
├── architecture/
│   ├── README.md           (index for architecture docs)
│   ├── GRAPH_ARCHITECTURE.md
│   ├── GRAPH_ARCHITECTURE_SUMMARY.md
│   ├── GRAPH_MIGRATION_GUIDE.md
│   ├── GRAPH_REFACTOR_CHECKLIST.md
│   └── GRAPH_IMPLEMENTATION_REVIEW.md
│
├── design/
│   ├── README.md           (index for design docs)
│   ├── FIGMA_INTEGRATION.md
│   ├── TYPOGRAPHY_GUIDE.md
│   └── BACKGROUNDS_GUIDE.md
│
└── development/
    ├── README.md           (index for development docs)
    └── IMPLEMENTATION_SUMMARY.md
```

---

## 🎯 Quick Links

| I need to... | Read this |
|---|---|
| Understand the graph architecture | [Graph Architecture](architecture/GRAPH_ARCHITECTURE.md) |
| Refactor the graph to a layered design | [Graph Migration Guide](architecture/GRAPH_MIGRATION_GUIDE.md) |
| Add a new layout algorithm | [Graph Architecture](architecture/GRAPH_ARCHITECTURE.md) (Layer 3) + [Migration Guide](architecture/GRAPH_MIGRATION_GUIDE.md) (Phase 2) |
| Change the interaction model | [Graph Architecture](architecture/GRAPH_ARCHITECTURE.md) (Interactions section) |
| Update UI colors/tokens | Root [CLAUDE.md](../CLAUDE.md) (vuetify-ds skill) |
| Change typography | [Typography Guide](design/TYPOGRAPHY_GUIDE.md) |
| Add a new feature | [CLAUDE.md](../CLAUDE.md) (Where to build new code) |
| Understand the codebase | [CLAUDE.md](../CLAUDE.md) |

---

## 📞 Questions?

If documentation is unclear, outdated, or missing:

1. **Fix it** if you know the answer
2. **Flag it** if you find an inconsistency
3. **Document it** if you discover a gap

The documentation is only useful if it's current.

---

**Last Updated:** 2026-08-03  
**Maintained by:** Development team  
**Status:** Living document — updated as architecture and design evolve
