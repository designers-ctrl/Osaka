# Graph Architecture Refactor Checklist

Use this checklist to track progress through the migration.

---

## 📋 Pre-Flight (This Week)

- [ ] Read `GRAPH_ARCHITECTURE.md`
- [ ] Read `GRAPH_ARCHITECTURE_SUMMARY.md`
- [ ] Read `GRAPH_MIGRATION_GUIDE.md`
- [ ] Review created files:
  - [ ] `src/engines/graph/types.ts`
  - [ ] `src/engines/graph/queries.ts`
  - [ ] `src/engines/layout/types.ts`
  - [ ] `src/stores/graphStore.ts`
  - [ ] `src/engines/README.md`
- [ ] Backup current code (git branch or similar)
- [ ] Schedule 3-4 weeks for full refactor

---

## 🔵 Phase 1: State to Pinia (Week 1)

**Goal:** Move all interaction state from Vue refs → Pinia store  
**Time:** 2-3 hours  
**Risk:** Low (only moving state, not changing functionality)

### Part 1: Review Store
- [ ] Open `src/stores/graphStore.ts`
- [ ] Understand state properties
- [ ] Understand actions
- [ ] Understand computed properties
- [ ] Understand watch behavior

### Part 2: Update GraphWorkspace.vue
- [ ] Import useGraphStore
- [ ] Call `graphStore.loadGraph(nodes, links)` on mount
- [ ] Replace local `selectedClusterId` ref → `graphStore.selectCluster()`
- [ ] Replace local `hoveredNodeId` ref → `graphStore.hoverNode()`
- [ ] Replace local selection computed → use `graphStore.selectedNode`, etc
- [ ] Update all event handlers to call store actions
- [ ] Update template to use store properties instead of local refs

### Part 3: Update NetworkGraphD3.vue Props
- [ ] Change props from individual values → collection from store
  ```vue
  <!-- Before -->
  :selected-cluster-id="selectedClusterId"
  
  <!-- After -->
  :selected-ids="graphStore.nodesToHighlight"
  ```
- [ ] Add prop for `hoveredId`
- [ ] Update @click handlers to emit (don't modify state directly)

### Part 4: Test
- [ ] Start dev server: `corepack pnpm dev`
- [ ] Click a node → Does graphStore state change?
- [ ] Open browser DevTools → Pinia tab → See state updates?
- [ ] Click background → Does selection clear?
- [ ] Hover node → Does hover state update?
- [ ] Open Pinia DevTools → Can you see state tree?

### Part 5: Commit
- [ ] Commit with message: "refactor: move graph state to Pinia store"
- [ ] Push to feature branch

✅ **Phase 1 Complete when:** All interactions work, Pinia store owns all state

---

## 🔵 Phase 2: Extract Layout Engine (Week 2)

**Goal:** Move layout computation out of D3  
**Time:** 4-5 hours  
**Risk:** Low-Medium (new layer, but D3 doesn't change yet)

### Part 1: Create Orchestrator
- [ ] Create `src/engines/layout/orchestrator.ts`
- [ ] Write function: `createLayout(input, algorithm) → LayoutResult`
- [ ] Register algorithms map
- [ ] Handle unknown algorithm error

### Part 2: Extract Force Layout
- [ ] Create `src/engines/layout/force.ts`
- [ ] Copy D3 force simulation logic from `useD3Force.ts`
- [ ] Change: Instead of modifying DOM, return LayoutResult
- [ ] Export: `createForceLayout(input) → LayoutResult`
- [ ] Test in isolation: 
  ```typescript
  const result = createForceLayout({nodes, edges})
  expect(result.nodes[0].x).toBeDefined()
  ```

### Part 3: Extract Hierarchy Layout
- [ ] Create `src/engines/layout/hierarchy.ts`
- [ ] Copy D3 hierarchy logic from `useD3Hierarchy.ts`
- [ ] Change: Return LayoutResult instead of modifying DOM
- [ ] Export: `createHierarchyLayout(input) → LayoutResult`
- [ ] Test in isolation

### Part 4: Update GraphWorkspace
- [ ] Import `createLayout` from engine
- [ ] Create computed: `layoutResult = createLayout({...}, layoutMode)`
- [ ] Watch `graphStore.layoutMode`:
  ```typescript
  watch(() => graphStore.layoutMode, () => {
    layoutResult.value = createLayout({...}, graphStore.layoutMode)
  })
  ```
- [ ] Pass `layoutResult.nodes` (with x, y) to D3

### Part 5: Test
- [ ] Click layout toggle button
- [ ] Does mode change in store?
- [ ] Do node positions update?
- [ ] Do nodes smoothly animate to new positions?
- [ ] No console errors?

### Part 6: Cleanup (NOT deletion, just mark)
- [ ] Add comment to `useD3Force.ts`: "Deprecated: use src/engines/layout/force.ts"
- [ ] Add comment to `useD3Hierarchy.ts`: "Deprecated: use src/engines/layout/hierarchy.ts"
- [ ] Don't delete yet (D3 might still use them)

### Part 7: Commit
- [ ] Commit: "refactor: extract layout engine"
- [ ] Push to feature branch

✅ **Phase 2 Complete when:** Layouts swap correctly, positions update, animations smooth

---

## 🔵 Phase 3: Simplify D3 Component (Week 3)

**Goal:** D3 only renders, doesn't compute/decide  
**Time:** 3-4 hours  
**Risk:** Medium (lots of D3 changes, but localized)

### Part 1: Remove State from NetworkGraphD3
- [ ] Delete `const selectedCluster = ref(null)` — receive as prop instead
- [ ] Delete `const hoveredNode = ref(null)` — receive as prop instead
- [ ] Delete `const expandedClusters = ref(...)` — receive as prop instead
- [ ] Delete all local selection logic

### Part 2: Remove Layout Logic from D3
- [ ] Delete `const simulation = createForceSimulation(...)` — receive positioned nodes as prop
- [ ] Delete `const layout = createHierarchicalLayout(...)` — receive positioned nodes as prop
- [ ] Delete all `d3.force()` calls — layout already positioned
- [ ] Delete all position computation — already in props

### Part 3: Update Props
- [ ] Accept positioned nodes as prop:
  ```typescript
  const props = defineProps<{
    nodes: Array<NetworkNode & {x: number, y: number}>
  }>()
  ```
- [ ] Accept selections as props:
  ```typescript
  selectedIds: Set<string>
  hoveredId: string | null
  ```
- [ ] Accept layout data as prop:
  ```typescript
  layout: LayoutResult
  ```

### Part 4: Update Event Emission
- [ ] Change event handlers: Don't modify state, emit event
  ```typescript
  // Before
  selectedCluster.value = id
  
  // After
  emit('cluster-click', id)
  ```

### Part 5: Rendering Only
- [ ] D3 rendering code should:
  ```
  1. Receive positioned nodes
  2. Create SVG circles at those positions
  3. Create SVG lines for edges
  4. Apply styles based on selection state (prop)
  5. Emit events (click, hover, etc)
  
  D3 should NOT:
  - Compute positions
  - Track selections
  - Decide what highlights
  - Modify graph data
  ```

### Part 6: Update Animation
- [ ] Keep drag behavior (still local to D3)
- [ ] Transition nodes to new positions on layout change
  ```typescript
  d3.selectAll('circle')
    .transition()
    .duration(800)
    .attr('cx', d => d.x)
    .attr('cy', d => d.y)
  ```

### Part 7: Test (Thoroughly!)
- [ ] Click node → Selected
- [ ] Hover node → Highlighted
- [ ] Switch layout → Positions morph
- [ ] Drag node → Moves (if force layout)
- [ ] Zoom/pan → Works
- [ ] Expand cluster → Shows entities
- [ ] All interactions smooth
- [ ] No console errors

### Part 8: Delete Deprecated
- [ ] Now safe to delete: `useD3Force.ts` (if not used elsewhere)
- [ ] Now safe to delete: `useD3Hierarchy.ts` (if not used elsewhere)
- [ ] Or just leave them (won't hurt)

### Part 9: Commit
- [ ] Commit: "refactor: simplify D3 component to pure renderer"
- [ ] Push to feature branch

✅ **Phase 3 Complete when:** D3 is stateless, layout/selection work perfectly

---

## 🟢 Phase 4: Polish & New Features (Week 4+)

**Goal:** New features now trivial to add  
**Time:** Varies  
**Risk:** Low (architecture solid)

### Optional: Add Radial Layout
- [ ] Create `src/engines/layout/radial.ts`
- [ ] Implement radial positioning algorithm
- [ ] Register in orchestrator
- [ ] Add to UI options
- [ ] Test

### Optional: Add Focused View
- [ ] Create `src/engines/layout/focused.ts`
- [ ] Implement ego-graph layout
- [ ] Register in orchestrator
- [ ] Add interaction to select "focus mode"
- [ ] Test

### Optional: Add New Interactions
- [ ] Double-click node → Focus
- [ ] Right-click → Context menu
- [ ] Ctrl+click → Multi-select (future)
- [ ] Keyboard: Arrow keys → Navigate

### Optional: Optimize Performance
- [ ] Move layout to Web Worker (doesn't block main thread)
- [ ] Add node virtualization (only render visible nodes)
- [ ] Cache layout results

### Testing
- [ ] Unit tests for graph queries
- [ ] Unit tests for layout algorithms
- [ ] Integration tests for store actions
- [ ] E2E tests for user workflows

---

## 🎯 Success Criteria

You're done when ALL of these pass:

- [ ] Pinia owns all graph state
- [ ] Layout engine separate from D3
- [ ] D3 is pure renderer (no state)
- [ ] Can swap layouts without restarting
- [ ] Can add new layout in 1 hour
- [ ] Can add new interaction in 1 hour
- [ ] All features still work
- [ ] Performance not degraded
- [ ] Code is well-documented
- [ ] Team understands architecture

---

## 📝 Notes & Issues

Use this space to track blockers or questions:

```
## Issue: [Date]
- What: 
- Why:
- Solution:

---

## Issue: [Date]
- What:
- Why:
- Solution:
```

---

## 🚀 Final Steps

### Before Merge to Main
- [ ] All tests pass
- [ ] Code reviewed by team
- [ ] Performance benchmarked
- [ ] No regressions in existing features

### After Merge
- [ ] Update GRAPH_ARCHITECTURE.md if anything changed
- [ ] Document any new patterns
- [ ] Share learnings with team

---

## 📚 Reference

- **GRAPH_ARCHITECTURE.md** — Full spec
- **GRAPH_MIGRATION_GUIDE.md** — Detailed steps & troubleshooting
- **src/engines/README.md** — How to use engines
- **src/stores/graphStore.ts** — State management

---

**Version:** 1.0  
**Created:** 2026-08-03  
**Updated:** —

