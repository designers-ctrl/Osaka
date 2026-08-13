# Development Documentation

This directory contains implementation guides and development workflows.

## Documents

- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** — Summary of completed features and implementation approach. Documents what's been built, how major features work, and rationale behind key decisions.

## Development Guide

For most questions, consult:
- **[CLAUDE.md](../../CLAUDE.md)** (in project root) — The authoritative codebase guide with house rules, architectural principles, where code lives, and development practices
- **[docs/architecture/](../architecture/)** — Specific documentation on graph system architecture
- **[docs/design/](../design/)** — UI patterns and design guidelines

## Before Starting a Task

1. Read [CLAUDE.md](../../CLAUDE.md) for house rules and where code goes
2. Read the relevant architecture/design document
3. Implement the feature
4. **Update documentation** if you changed existing behavior
5. Commit with clear message explaining why (not just what)

## Code Organization

See [CLAUDE.md](../../CLAUDE.md) → "Where to build new code" for:
- Which folder for screens
- Which folder for components
- Which folder for data
- Which folder for API callers
- Which folder for stores
- Which folder for visualization logic
