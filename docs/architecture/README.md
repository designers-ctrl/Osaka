# Architecture Documentation

This directory contains documentation about how Osaka is structured and how its major systems work.

## Documents

- **[GRAPH_ARCHITECTURE.md](GRAPH_ARCHITECTURE.md)** — The complete specification of the graph visualization layer. Describes the multi-layer architecture (Graph Engine → Layout Engine → Renderer), all supported interactions, animation patterns, and state transitions. **Start here** if you're working on graph features.

- **[GRAPH_ARCHITECTURE_SUMMARY.md](GRAPH_ARCHITECTURE_SUMMARY.md)** — Executive overview and business rationale for the layered architecture. Explains the problems it solves, what's already implemented, and next steps.

- **[GRAPH_MIGRATION_GUIDE.md](GRAPH_MIGRATION_GUIDE.md)** — Step-by-step guide for refactoring the graph from its current D3-centric design to the proposed layered architecture. Covers 3 phases over 3-4 weeks with code examples and troubleshooting.

- **[GRAPH_REFACTOR_CHECKLIST.md](GRAPH_REFACTOR_CHECKLIST.md)** — Detailed checklist for tracking progress through the architecture refactor. Use this to mark off completed tasks and identify blockers.

- **[GRAPH_IMPLEMENTATION_REVIEW.md](GRAPH_IMPLEMENTATION_REVIEW.md)** — Analysis of the current D3 graph implementation. Documents what's working well, what needs improvement, and recommendations for next steps.

## Before Implementing

Always check the relevant architecture document before:
- Adding a new graph feature
- Changing interaction behavior
- Refactoring the layout system
- Adding a new layout algorithm
- Modifying the state model

If the architecture document doesn't cover your use case, **update it** when you're done.
