# Graph Architecture

This document describes the multi-layer architecture of the graph visualization system.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Vue UI Layer                         │
│  (GraphWorkspace.vue - orchestration & side panels)      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  State Layer (Pinia)                     │
│  selectedNode, selectedCluster, hover, zoom, filters    │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Graph Engine Layer                          │
│  (nodes, edges, clusters, insights, sources)            │
│  Pure data transformations, queries, selections         │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│             Layout Engine Layer                          │
│  Force | Hierarchy | Radial | Focused | Structured      │
│  Input: nodes, edges, constraints                       │
│  Output: {x, y} positions + layout metadata             │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│           Renderer Layer (D3 Adapter)                    │
│  Input: positioned nodes, edges, selection state        │
│  Job: Draw SVG, handle low-level interactions           │
└─────────────────────────────────────────────────────────┘
```

---

## Layer 1: Graph Engine

**Location:** `src/engines/graph/`

**Responsibility:** Pure data operations on the graph.

**Does NOT handle:**
- Layout/positioning
- Rendering
- Interaction state

**What it does:**
```typescript
// Get all nodes connected to a node
getConnected(nodeId: string): NetworkNode[]

// Get nodes in a cluster's influence
getClusterInfluence(clusterId: string): {nodes, links}

// Search/filter
findByLabel(query: string): NetworkNode[]

// Mutations
addNode(node: NetworkNode)
removeNode(id: string)
addEdge(source: string, target: string)
```

**Files:**
- `types.ts` — `NetworkNode`, `NetworkLink`, `Graph` interfaces
- `queries.ts` — Selection logic: `getConnected()`, `getInfluence()`, etc.
- `mutations.ts` — Add/remove/update operations
- `selectors.ts` — Common filters: `entities()`, `insights()`, `documents()`

---

## Data rules (synthetic dataset)

These hold for the generated graph in `src/data/graphWorkspace.ts`. They are
product rules, not implementation details — a renderer may rely on them.

### Clusters belonging to the same Source must never share the same display name

Within one Source, every Cluster carries a distinct `category`. A source that
showed `Decisions` five times read as five copies of one thing rather than five
distinct clusters, which is exactly the confusion a knowledge graph must not
create.

How it is satisfied (`graphWorkspace.ts`, the cluster ring builder):

- the cluster id's hash picks a **preferred** category from `SEMANTIC_CATEGORIES`;
- the assignment then walks the list from there to the first name **this source**
  has not used yet;
- if a source has more clusters than there are categories, the preferred name is
  qualified — `People 2`, `People 3`. The base word stays first, and
  `entityFill.ts` strips the qualifier when choosing a name pool, so a qualified
  cluster still fills with the right kind of entity names.

Sources are independent: two different sources may each have a `Decisions`, which
is correct — the rule is about siblings.

Deterministic by construction: the hash seeds it and the walk is ordered, so the
same ids produce the same names on every reload. `Math.random()` is banned in
graph data and layout.

### Every group participates in the cross-group Cluster network

Each Source/Document group (a hub plus its surrounding clusters) carries at
least one **Cluster ↔ Cluster** relationship to a cluster of another group, so
the Unstructured graph reads as one loose connected network instead of isolated
islands. Never Source↔Source, and never two clusters of the same group.

Generated deterministically in `graphWorkspace.ts`
(`CROSS_GROUP_CLUSTER_LINKS`): a minimum spanning tree over hub seed positions
routes the pairing (Kruskal, nearest hub pairs first): an edge is taken only
when it has a CLEAN cluster pair, and a blocked pair is skipped so connectivity
reroutes through the next-nearest groups.

**The layout rule: no connector may cut through a cluster group.** A candidate
segment is rejected while a clean alternative exists if it enters the occupied
BUBBLE of any group it does not terminate in, passes within clearance of any
node (source/document/cluster/insight), or crosses an already-accepted
cross-group segment — and it may only start from a FACING cluster (the side of
its group toward the partner), so a line never crosses its own group. Candidate
priority: bubble hits → node obstructions → crossings → length → id order.
`CROSS_LINK_PINS` holds design-reviewed endpoint overrides for cases the force
simulation settles badly despite clean seed geometry (currently: the
Legalfab↔Google Drive bridge lands on Projects, not Decisions).

In the force layer these direct bridges are their own link class (`bridge`,
useD3Force.linkClass) with a long soft leash (`clusterBridgeDistance/Strength`)
— crossGroup's tighter pull is tuned for insight-mediated links and dragged
whole groups onto each other when applied to a direct cluster↔cluster edge. They are real
dataset links — the force layer classifies them `crossGroup`, and hover,
endpoints and timeline treat them like any other relationship.

### Structured and Unstructured must expose the same Entity set per Cluster

For the same `clusterId`, both modes must show EXACTLY the dataset's entities:

```
StructuredEntityIds(clusterId) === UnstructuredEntityIds(clusterId)
```

Compared by entity **id** (never by label): the count, the ids and the labels
must all match. `graphWorkspace.ts` nodes/links are the single source of truth —
no renderer may generate, duplicate or top up entities.

How each side satisfies it:

- **Unstructured** reads the dataset nodes directly (the drill-down's entity
  population moved into the dataset — see `expandedTokens.ts`, `demo` note);
- **Structured** derives membership from the resolved-connection set
  (`structuredConnections.ts`): a cluster's members are the raw-entity ends of
  its self-links, normalized through `representativeId`. Those self-links are
  themselves generated from the dataset, which is what keeps the two derivations
  equal.

Enforced in DEV: `deriveStructuredFocus` compares its derived set against the
dataset on every drill-down open and `console.warn`s on any missing, extra, or
relabelled entity. If it fires, fix the derivation or the resolved connections —
never the dataset, and never by padding a renderer.

## Layer 2: State Layer (Pinia)

**Location:** `src/stores/graph.ts`

**Owns:**
```typescript
// Graph data
nodes: NetworkNode[]
links: NetworkLink[]

// UI selections
selectedNodeId: string | null
selectedClusterId: string | null
hoveredNodeId: string | null
expandedClusters: Set<string>

// View
layoutMode: 'force' | 'hierarchy' | 'radial'
zoom: number
pan: {x, y}

// Filters
searchQuery: string
activeFilters: string[]
timeRange: {start, end}
```

**Computed (derived state):**
```typescript
selectedNode → find node by selectedNodeId
visibleNodes → nodes filtered by timeRange, filters
connectedToSelected → nodes connected to selectedNode
clusterContent → all entities in selectedCluster
```

**Actions:**
```typescript
selectNode(id)
selectCluster(id)
hoverNode(id)
setLayoutMode(mode)
toggleFilter(filter)
search(query)
```

**Why this matters:**
- **Undo/redo:** Can track state changes
- **Linking:** Multiple components can react to selections
- **Debugging:** Can inspect state at any time
- **Animations:** State changes trigger transitions

---

## Layer 3: Layout Engine

**Location:** `src/engines/layout/`

**Input:**
```typescript
{
  nodes: NetworkNode[]
  edges: NetworkLink[]
  constraints?: {
    fixed: {nodeId: {x, y}}[]
    bounds: {width, height}
  }
}
```

**Output:**
```typescript
{
  nodes: Array<{id, x, y, width, height}>
  edges: Array<{source, target}>
  metadata: {algorithm, iterations, error}
}
```

**Available Layouts:**

### 1. **Force-Directed** (default)
- Algorithm: D3 force simulation
- Best for: Exploring relationships
- Use case: Overview of full graph
- Control: Repulsion strength, link distance

### 2. **Hierarchical**
- Algorithm: Layered tree layout
- Best for: Seeing structure (source → cluster → entity)
- Use case: Understanding data flow
- Control: Layer spacing, vertical alignment

### 3. **Radial** (future)
- Algorithm: Concentric circles by distance
- Best for: Central-focus analysis
- Use case: Exploring from a single node
- Control: Radius per layer

### 4. **Focused** (future)
- Algorithm: Ego graph of selected cluster
- Best for: Deep dive on one area
- Use case: Detailed cluster inspection
- Control: Depth (how many hops to show)

### 5. **Structured** (future)
- Algorithm: Grid/treemap-based
- Best for: High-density graphs
- Use case: Large dataset overview
- Control: Grid spacing, node sizing

**Files:**
- `types.ts` — `LayoutAlgorithm`, `LayoutResult`
- `orchestrator.ts` — Picks algorithm, applies constraints
- `force.ts` — D3 force implementation
- `hierarchy.ts` — D3 hierarchy implementation
- `metrics.ts` — Layout quality scoring

---

## Layer 4: Renderer (D3 Adapter)

**Location:** `src/components/graphs/`

**Input (as Vue props):**
```typescript
nodes: NetworkNode[]
edges: NetworkLink[]
layout: LayoutResult

// State
selectedIds: Set<string>
hoveredIds: Set<string>

// Config
theme: ChartTheme
interactionMode: 'pan' | 'select' | 'drag'
```

**Output (as Vue emits):**
```typescript
@node-hover = (id: string | null)
@node-click = (id: string)
@cluster-click = (id: string)
@pan-zoom = ({x, y, scale})
@background-click = ()
```

**Does NOT:**
- Modify data
- Hold interaction state
- Decide what to highlight

**Only:**
- Renders SVG from layout
- Emits user events
- Applies selection styling

**Files:**
- `NetworkGraphD3.vue` — Main component (simplified)
- `useD3Force.ts` — Force simulation (DEPRECATED, moved to layout engine)
- `useD3Hierarchy.ts` — Hierarchy layout (DEPRECATED)
- `useD3Interaction.ts` — Hover/highlight logic (stays, but simplified)
- `useD3Drag.ts` — Drag behavior (stays)
- `nodeStyles.ts` — Visual styling (stays)

---

## State Transitions & User Journeys

### State: **Browsing**
```
User sees: Full graph
Can do: Pan, zoom, hover, search, select
Panel: Timeline + metrics
```

### State: **Node Selected**
```
User sees: Full graph, selected node highlighted with glow
Related: Connected nodes/edges emphasized
Can do: All browsing actions + expand cluster
Panel: Node details in aside
```

### State: **Cluster Selected**
```
User sees: Graph shifts left, cluster highlighted
Related: Only cluster's entities + connected insights visible
Can do: Pan within subset, zoom, hover
Panel: Cluster details + entities list (right aside)
Transition: Smooth morph animation
```

### State: **Focused (future)**
```
User sees: Ego graph of selected cluster (depth=2)
Related: Only {cluster + direct neighbors + insights}
Can do: Pan, zoom
Panel: Focus details
Transition: Fade in/out unrelated nodes
```

---

## Interactions

### Basic
- **Hover:** Highlight node + connected edges + labels
- **Click:** Select node → panel opens
- **Pan:** Middle-mouse or space+drag
- **Zoom:** Scroll wheel or pinch

### Selection
- **Single select:** Click node → selection changes
- **Toggle select:** Cmd+click to toggle (future)
- **Select cluster:** Click cluster ring → cluster panel
- **Clear select:** Click background

### Expansion
- **Expand cluster:** Click cluster → shows entities
- **Collapse cluster:** Click cluster again (if showing entities)
- **Show related:** Selecting node shows all connected nodes

> **Implemented (Unstructured):** clicking a Cluster opens the focused
> drill-down — the cluster becomes a large translucent region holding its real
> entities, its Source and related neighbourhood stay emphasized, and the rest
> of the graph dims. It is an additional rendering layer keyed off
> `expandedClusterId`, not a layout mode. See
> **[CLUSTER_DRILLDOWN.md](CLUSTER_DRILLDOWN.md)** for the derivation rules,
> geometry and constraints.

### Drag
- **Drag node:** Click+drag moves node in force layout
- **Constrained:** Node returns to simulation when released

---

## Animations

### Expand Cluster
- **Trigger:** User clicks cluster
- **Animation:** 300ms
- **What happens:** 
  - Entities slide out from cluster center
  - Edges fade in
  - Right panel slides in from right

### Collapse Cluster
- **Trigger:** User clicks cluster again (or ESC)
- **Animation:** 200ms
- **What happens:**
  - Entities slide back to cluster
  - Edges fade out
  - Right panel slides out

### Highlight Connected
- **Trigger:** Hover over node
- **Animation:** 100ms
- **What happens:**
  - Connected nodes glow (shadow filter)
  - Connected edges brighten
  - Other nodes/edges dim

### Layout Transition
- **Trigger:** Change layoutMode in Pinia
- **Animation:** 800ms
- **What happens:**
  - Nodes morph to new positions
  - Force simulation runs
  - No flash/pop

### Focus Transition (future)
- **Trigger:** Enter focused state
- **Animation:** 500ms
- **What happens:**
  - Unrelated nodes fade out
  - Selected cluster enlarges
  - Camera pans to cluster

---

## Data Flow Example: User Selects a Node

```
1. User clicks node in D3
   ↓
2. NetworkGraphD3 emits @node-click(id)
   ↓
3. GraphWorkspace.vue receives event
   ↓
4. Calls graphStore.selectNode(id)
   ↓
5. Pinia updates selectedNodeId
   ↓
6. Computed selectedNode updates
   ↓
7. Computed connectedToSelected updates
   ↓
8. Vue re-renders:
   - NetworkGraphD3 receives new props: selectedIds, hoveredIds
   - Aside panel receives selectedNode and shows details
   ↓
9. D3 highlights selection styling
   ↓
10. Animation: Panel slides in, node glows
```

**Key principle:** D3 never decides what's selected. D3 receives selection state from props and renders it.

---

## Adding a New Layout Algorithm

```typescript
// 1. Create src/engines/layout/radial.ts
export function createRadialLayout(
  nodes: NetworkNode[],
  edges: NetworkLink[],
  root: string, // center node
  config: {radiusPerLevel: number}
): LayoutResult {
  // Place root at center
  // Place neighbors in circles around it
  return {nodes: [...], edges: [...], metadata: {...}}
}

// 2. Register in src/engines/layout/orchestrator.ts
const ALGORITHMS = {
  force: createForceLayout,
  hierarchy: createHierarchyLayout,
  radial: createRadialLayout, // ← add here
}

// 3. Use it in GraphWorkspace.vue
const graphStore = useGraphStore()
graphStore.layoutMode = 'radial'

// That's it. Everything else just works.
```

---

## Adding a New Interaction

```typescript
// 1. New event in Pinia
const doubleClickedNode = ref<string | null>(null)
const actions = {
  doubleClickNode: (id: string) => doubleClickedNode.value = id
}

// 2. Emit from D3
<NetworkGraphD3
  @node-double-click="(id) => graphStore.doubleClickNode(id)"
/>

// 3. React in GraphWorkspace
const isExpanded = computed(() => 
  graphStore.expandedClusters.has(graphStore.doubleClickedNode)
)

watch(() => graphStore.doubleClickedNode, (id) => {
  if (id) graphStore.toggleExpandCluster(id)
})

// 4. Render side effect in animation
const expandedCluster = computed(() => 
  graphStore.expandedClusters.has(graphStore.selectedClusterId)
)
```

---

## Testing Strategy

```
// Test Graph Engine independently
test('getConnected returns adjacent nodes', () => {
  const graph = createGraphFromFixture()
  const connected = graph.getConnected('node-1')
  expect(connected).toHaveLength(3)
})

// Test Layout independently
test('force layout positions nodes', () => {
  const result = createForceLayout(nodes, links)
  expect(result.nodes[0]).toHaveProperty('x')
  expect(result.nodes[0]).toHaveProperty('y')
})

// Test State independently
test('selecting node updates computed properties', () => {
  const store = useGraphStore()
  store.selectNode('cluster-1')
  expect(store.selectedNode.id).toBe('cluster-1')
  expect(store.connectedToSelected.size).toBeGreaterThan(0)
})

// Test UI integration
test('clicking node updates both state and rendering', () => {
  const wrapper = mount(GraphWorkspace)
  wrapper.vm.$el.querySelector('[data-node-id="n1"]').click()
  expect(wrapper.vm.graphStore.selectedNodeId).toBe('n1')
  expect(wrapper.find('[data-panel]').isVisible()).toBe(true)
})
```

---

## Performance Notes

**Current (D3 handles everything):**
- Medium complexity
- Coupling makes optimization hard

**After refactor:**
- Layout engine runs on a worker (future) → main thread stays responsive
- Graph engine is pure functions → can cache results
- Pinia state changes are observable → can implement debouncing
- D3 is "dumb" → predictable performance

---

## Migration Path

**Week 1: Layout Engine**
- Extract force layout to `src/engines/layout/force.ts`
- Extract hierarchy to `src/engines/layout/hierarchy.ts`
- Test separately
- Connect via props

**Week 2: State to Pinia**
- Move all refs from GraphWorkspace → Pinia store
- Connect store to D3 via props
- Remove local state management

**Week 3: D3 Cleanup**
- Simplify NetworkGraphD3.vue
- Remove internal state, use props only
- Clean up useD3* composables

**Week 4+: New features**
- Add radial layout
- Add focused layout
- Add interactions (double-click, etc)
- All just plug into existing architecture

---

## Decision Checklist

This architecture makes sense **if**:
- ✅ Graph is a core feature (it is)
- ✅ You'll add more layouts (plan to)
- ✅ Multiple features depend on selection state (yes)
- ✅ Performance will matter at scale (yes)
- ✅ Team size > 1 (likely)

This architecture is **overkill if**:
- ❌ Graph is a one-off feature
- ❌ No plans for new layouts
- ❌ Very simple interactions
- ❌ Solo developer, never changing

---

## Questions This Answers

**Q: Where does layout algorithm logic live?**  
A: `src/engines/layout/` — pure functions, no Vue, no D3

**Q: Where does selection state live?**  
A: Pinia store — single source of truth

**Q: Where does rendering logic live?**  
A: `NetworkGraphD3.vue` — receives data, emits events

**Q: How do I add a new interaction?**  
A: 1) Add action to Pinia, 2) Emit from D3, 3) React in Vue

**Q: How do I swap layout algorithms?**  
A: Change Pinia `layoutMode` → layout engine picks algorithm → D3 renders positions
