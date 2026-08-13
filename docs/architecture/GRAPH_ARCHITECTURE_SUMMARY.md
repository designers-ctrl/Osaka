# Graph Architecture — Executive Summary

**TL;DR:** You have a solid architectural vision. Yes, do this refactoring, but gradually (3-4 weeks). I've created the foundation files and a detailed migration guide.

---

## What You Get

### Problem Solved
**Before:** D3 handles data, layout, rendering, state → Hard to test, hard to extend  
**After:** Each layer has one job → Easy to test, easy to extend

### The Layered Architecture
```
┌─────────────────────────────────────┐
│      Vue UI (GraphWorkspace.vue)    │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│     State (Pinia graphStore)         │
│  selectedNode, zoom, layoutMode      │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│  Graph Engine (src/engines/graph/)   │
│  Pure queries, no side effects       │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│  Layout Engine (src/engines/layout/) │
│  Force | Hierarchy | Future layouts  │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│   Renderer (NetworkGraphD3.vue)      │
│   Just draws SVG, emits events       │
└─────────────────────────────────────┘
```

---

## Files Created

### Documentation (Read These First!)
📄 **GRAPH_ARCHITECTURE.md** — Complete architecture spec  
📄 **GRAPH_MIGRATION_GUIDE.md** — Step-by-step migration (3 phases)

### Foundation Code (Start Here)
📁 **src/engines/graph/**
- `types.ts` — Graph type definitions
- `queries.ts` — Pure functions for querying the graph

📁 **src/engines/layout/**
- `types.ts` — Layout type definitions
- (Orchestrator, force, hierarchy → next steps)

📁 **src/engines/README.md** — How to use the engines

📁 **src/stores/**
- `graphStore.ts` — Pinia store (all state: selections, zoom, filters, etc)

---

## Why This Architecture Works

### 1. Separation of Concerns
Each layer has ONE job:
- **Graph Engine:** Know about the graph
- **Layout Engine:** Position nodes
- **Renderer:** Draw to screen
- **Store:** Remember what user selected

### 2. Testability
```typescript
// Test layout independently
test('force layout positions nodes', () => {
  const result = createForceLayout({nodes, edges})
  expect(result.nodes[0].x).toBeDefined()
})

// Test queries independently
test('getConnected returns adjacent', () => {
  const result = getConnectedNodeIds('n1', adjMap)
  expect(result).toContain('n2')
})
```

### 3. Swappability
- **Swap layouts:** Just change `layoutMode` → new algorithm runs
- **Swap renderers:** Just plug in Canvas/WebGL instead of D3
- **Add features:** Just add actions to store, queries to engine

### 4. Scalability
Current state: 1 source × 3 medium clusters = ~150 nodes → Works fine  
Future state: 5 sources × 20 large clusters = ~5000 nodes → With this architecture, same code works

### 5. Debugging
- Open Pinia DevTools
- See exact state at any moment
- Time-travel to previous state
- Watch data flow through layers

---

## What's Already Done

✅ **src/engines/graph/types.ts**  
- Type definitions for Graph, GraphQuery

✅ **src/engines/graph/queries.ts**  
- `buildAdjacencyMap()` — Fast lookups
- `getConnectedNodeIds()` — Adjacent nodes
- `getReachableNodeIds()` — BFS traversal
- `getClusterEntities()` — Entities in cluster
- `getConnectedInsights()` — Insights for node
- `getNodeSource()` — Find source of any node
- `searchNodesByLabel()` — Fuzzy search
- `filterNodesByTimeRange()` — Time filtering

✅ **src/engines/layout/types.ts**  
- `LayoutInput`, `LayoutResult`, `LayoutConstraints`
- Algorithms: force, hierarchy, radial, focused, structured

✅ **src/stores/graphStore.ts** (Full Pinia Store)
- State: nodes, links, selections, view, filters
- Computed: selectedNode, connectedToSelected, visibleNodes, etc
- Actions: selectNode(), hoverNode(), setLayoutMode(), etc
- All interaction state in one place

✅ **GRAPH_ARCHITECTURE.md**  
- 200+ lines of detailed architecture spec
- Layer descriptions, state transitions, animations
- Decision checklist, testing strategy

✅ **GRAPH_MIGRATION_GUIDE.md**  
- 400+ lines of step-by-step migration plan
- Phase 1: Move state to Pinia (2-3 hours)
- Phase 2: Extract layout (4-5 hours)
- Phase 3: Clean up D3 (3-4 hours)
- Troubleshooting guide

✅ **src/engines/README.md**  
- How to use the engines
- Example code snippets
- Performance notes

---

## What's NOT Yet Done (Next Steps)

1. **Integrate store in GraphWorkspace.vue** (30 min)
   - Import useGraphStore()
   - Call graphStore.loadGraph(nodes, links)
   - Update event handlers to dispatch actions

2. **Create layout orchestrator** (1 hour)
   - `src/engines/layout/orchestrator.ts`
   - Routes layoutMode → algorithm selection

3. **Extract force layout** (2 hours)
   - `src/engines/layout/force.ts`
   - Move D3 simulation logic here

4. **Extract hierarchy layout** (2 hours)
   - `src/engines/layout/hierarchy.ts`
   - Move D3 hierarchy logic here

5. **Simplify NetworkGraphD3.vue** (2 hours)
   - Remove selection state
   - Remove layout logic
   - Just render positioned nodes

---

## My Recommendation: Start Here

### Immediate (Today)
1. Read `GRAPH_ARCHITECTURE.md` (20 min)
2. Read `GRAPH_MIGRATION_GUIDE.md` (20 min)
3. Understand the store: `src/stores/graphStore.ts` (15 min)

### This Week (Phase 1)
1. Integrate store into GraphWorkspace.vue
2. Test: Click node → store updates → D3 re-renders
3. Celebrate: You've decoupled state from D3

### Next Week (Phase 2)
1. Create layout orchestrator
2. Extract force & hierarchy layouts
3. Test: Switch layouts → positions update

### Week 3 (Phase 3)
1. Remove state from NetworkGraphD3
2. Ensure D3 only reads props
3. Test: All interactions still work

### Week 4+ (New Features)
1. Add radial layout
2. Add focused layout
3. Add new interactions
4. All just plug in ✨

---

## Success Checklist

After each phase, you should be able to:

### Phase 1 ✓
- [ ] Store owns all selection state
- [ ] D3 receives selections as props
- [ ] GraphWorkspace is simpler (no local state)
- [ ] Can debug with Pinia DevTools

### Phase 2 ✓
- [ ] Layout logic extracted to engine
- [ ] Can swap `layoutMode` without touching D3
- [ ] Force and hierarchy both work
- [ ] New layouts can be added easily

### Phase 3 ✓
- [ ] D3 component has no internal state
- [ ] D3 only handles rendering + events
- [ ] Layout changes don't crash D3
- [ ] Animations still smooth

---

## Architecture Decisions Made

**Q: Why Pinia instead of Vue refs?**  
A: Multiple components need access (future: sidebar, timeline, etc). Pinia enables sharing and debugging.

**Q: Why split graph engine from layout?**  
A: Layout algorithms are CPU-intensive. Separating them lets us move to Web Worker later without touching graph queries.

**Q: Why make graph queries pure functions?**  
A: Pure functions are testable, cacheable, and don't have side effects. Makes performance optimization easy.

**Q: Why not put everything in D3?**  
A: D3 is great at rendering, not at abstractions. Mixing concerns makes it hard to test, optimize, or replace.

---

## Open Questions for You

1. **Timeline:** Can you dedicate a developer for 3-4 weeks? (Or should this be slower?)
2. **D3 replacement:** Will you ever need WebGL/Canvas rendering? (Affects architecture priority)
3. **Large graphs:** Do you plan to support 5000+ nodes? (Affects layout algorithm choice)
4. **Collaboration:** Will multiple people work on this? (Affects documentation priority)
5. **Test requirements:** Do you need 100% coverage, or smoke tests? (Affects effort estimate)

---

## One More Thing: Team Communication

If you have a team, share this with them:

**For designers:** "New architecture won't change the UI, but will let us add features faster"  
**For devs:** "Graph engine queries are pure, layout algorithms are testable, state is centralized"  
**For PMs:** "Enables: new layout types, complex interactions, better performance, easier debugging"

---

## Final Thought

Your instinct to layer this architecture is spot-on. The current D3-centric approach works fine for today's graph size (100s of nodes), but will creak under weight as you add features:

- New interactions (drill-down, focus, export)
- New layouts (radial, focused, structured)
- Performance optimization (virtualization, Web Workers)
- Testing (unit tests for algorithms)

This architecture sets you up to scale without rewriting.

**Next step:** Start Phase 1. It's low-risk (just moving state around) and high-payoff (enables everything else).

Good luck! 🚀
