# Graph Architecture Migration Guide

This guide explains how to gradually migrate from the current D3-centric architecture to the layered architecture.

## Current State (Before)

```
NetworkGraphD3.vue
├─ Manages nodes, edges
├─ Manages selected/hovered state (local refs)
├─ Computes layout (D3 force simulation)
├─ Renders SVG (D3 selection, circles, lines)
└─ Handles interactions (hover, click, drag)
     └─ Updates local state
     └─ Emits events to parent

GraphWorkspace.vue
└─ Passes data to NetworkGraphD3
```

**Problems:**
- Hard to test layout algorithm
- Hard to share selection state across features
- D3 does too much (data + layout + rendering)
- Coupling makes optimization difficult

---

## Target State (After)

```
GraphWorkspace.vue (orchestrator)
├─ Loads graph data
├─ Dispatch actions to graphStore
└─ Passes computed props to D3

useGraphStore() (Pinia)
├─ Owns all interaction state
├─ Computes selections, highlights
└─ Watches state changes for side effects

Engines:
├─ src/engines/graph/queries.ts (pure functions)
├─ src/engines/layout/orchestrator.ts (layout coordination)
└─ useD3Force, useD3Hierarchy (drawing only)

NetworkGraphD3.vue (pure renderer)
├─ Receives: nodes, edges, selections, theme
├─ Renders SVG
├─ Emits: @node-click, @pan-zoom
└─ NO internal state except D3 simulation ref
```

---

## Phase 1: Move State to Pinia

**Effort:** 2-3 hours  
**Benefit:** High — enables all future work

### 1.1 Create the Store

✅ Done. File created: `src/stores/graphStore.ts`

### 1.2 Update GraphWorkspace to Use Store

**Before:**
```vue
<script setup>
import { ref } from 'vue'
import NetworkGraphD3 from '@/components/graphs/NetworkGraphD3.vue'

const nodes = ref([])
const selectedClusterId = ref(null)
const hoveredNodeId = ref(null)

function onNodeClick(id: string) {
  // Lots of logic here
  if (selectedClusterId.value === id) {
    selectedClusterId.value = null
  } else {
    selectedClusterId.value = id
  }
}
</script>

<template>
  <NetworkGraphD3
    :nodes="nodes"
    :selected-cluster-id="selectedClusterId"
    @cluster-click="onNodeClick"
  />
</template>
```

**After:**
```vue
<script setup>
import { useGraphStore } from '@/stores/graphStore'
import NetworkGraphD3 from '@/components/graphs/NetworkGraphD3.vue'

const graphStore = useGraphStore()

// Load graph data on mount
onMounted(() => {
  graphStore.loadGraph(graphWorkspace.nodes, graphWorkspace.links)
})

// Just dispatch actions now
function onNodeClick(id: string) {
  graphStore.selectCluster(id)
}
</script>

<template>
  <NetworkGraphD3
    :nodes="graphStore.nodes"
    :selected-ids="graphStore.nodesToHighlight"
    :hovered-id="graphStore.hoveredNodeId"
    @cluster-click="onNodeClick"
    @node-hover="(id) => graphStore.hoverNode(id)"
  />
</template>
```

**Benefits:**
- GraphWorkspace becomes simpler
- Store owns state logic
- Can use store from other components
- Time-travel debugging possible

### 1.3 Update NetworkGraphD3 to Use Props

**Before:**
```vue
<script setup>
const props = defineProps<{nodes: NetworkNode[]}>()

const selectedCluster = ref(null)
const selectedNode = ref(null)

// Lots of internal state...
</script>
```

**After:**
```vue
<script setup>
const props = defineProps<{
  nodes: NetworkNode[]
  selectedIds: Set<string>
  hoveredId: string | null
}>()

const emit = defineEmits<{
  'node-click': [id: string]
  'node-hover': [id: string | null]
}>()

// NO internal selection state
// Just render based on props
</script>
```

### Checklist

- [ ] Create `src/stores/graphStore.ts` ✅ (already created)
- [ ] Install graphStore in GraphWorkspace.vue
- [ ] Move selection refs → store actions
- [ ] Move computed properties → store computed
- [ ] Remove internal state from NetworkGraphD3
- [ ] Pass selection as props to D3
- [ ] Test: Click node → store updates → D3 re-renders

---

## Phase 2: Extract Layout Algorithm

**Effort:** 4-5 hours  
**Benefit:** Medium — enables layout swapping

### 2.1 Create Layout Orchestrator

Create `src/engines/layout/orchestrator.ts`:

```typescript
import type { LayoutInput, LayoutResult, LayoutAlgorithm } from './types'
import { createForceLayout } from './force'
import { createHierarchyLayout } from './hierarchy'

export function createLayout(
  input: LayoutInput,
  algorithm: LayoutAlgorithm,
): LayoutResult {
  const algorithms = {
    force: createForceLayout,
    hierarchy: createHierarchyLayout,
  }

  const fn = algorithms[algorithm]
  if (!fn) throw new Error(`Unknown layout: ${algorithm}`)

  const start = performance.now()
  const result = fn(input)
  const duration = performance.now() - start

  result.metadata.duration = duration
  return result
}
```

### 2.2 Extract Force Layout

Move D3 force simulation to `src/engines/layout/force.ts`:

```typescript
// This is mostly copied from useD3Force.ts
// But returns LayoutResult instead of modifying DOM

export function createForceLayout(input: LayoutInput): LayoutResult {
  const {nodes, edges, width = 800, height = 600} = input

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).distance(60))
    .force('charge', d3.forceManyBody().strength(-180))
    .force('center', d3.forceCenter(width / 2, height / 2))

  // Run simulation
  for (let i = 0; i < 100; i++) {
    simulation.tick()
  }

  return {
    nodes: nodes as any, // Now has .x, .y from simulation
    edges: edges as any,
    metadata: {
      algorithm: 'force',
      iterations: 100,
      converged: true,
    },
  }
}
```

### 2.3 Use Layout in GraphWorkspace

```vue
<script setup>
import { useGraphStore } from '@/stores/graphStore'
import { createLayout } from '@/engines/layout'

const graphStore = useGraphStore()
const layoutResult = ref({})

watch(() => graphStore.layoutMode, (mode) => {
  layoutResult.value = createLayout(
    {nodes: graphStore.nodes, edges: graphStore.links},
    mode,
  )
})
</script>

<template>
  <NetworkGraphD3
    :nodes="layoutResult.nodes"  // Now positioned
    :edges="layoutResult.edges"
    :selected-ids="graphStore.nodesToHighlight"
  />
</template>
```

### Checklist

- [ ] Create `src/engines/layout/types.ts` ✅ (already created)
- [ ] Create `src/engines/layout/orchestrator.ts`
- [ ] Create `src/engines/layout/force.ts` (extract from D3)
- [ ] Create `src/engines/layout/hierarchy.ts` (extract from D3)
- [ ] Update GraphWorkspace to use createLayout()
- [ ] Pass layoutResult.nodes to D3 (with x, y positions)
- [ ] Remove layout logic from D3 component
- [ ] Test: Switch layoutMode → positions update → D3 re-renders

---

## Phase 3: Clean Up D3 Component

**Effort:** 3-4 hours  
**Benefit:** High — makes D3 testable, maintainable

### 3.1 What D3 Should Do

After Phase 1 & 2:

```vue
<script setup>
const props = defineProps<{
  nodes: Array<NetworkNode & {x: number, y: number}>
  edges: NetworkLink[]
  selectedIds: Set<string>
  hoveredId: string | null
}>()

const emit = defineEmits<{
  'node-click': [id: string]
  'node-hover': [id: string | null]
  'pan-zoom': [{x: number, y: number, scale: number}]
}>()
</script>

<template>
  <svg ref="svgRef" style="width: 100%; height: 100%;">
    <!-- Just render props -->
    <!-- D3 handles DOM updates -->
  </svg>
</template>
```

**NetworkGraphD3 is now:**
- Input: positioned nodes, interaction state
- Job: Render SVG
- Output: User events

### 3.2 What D3 Should NOT Do

- ❌ Manage nodes/edges
- ❌ Compute layout
- ❌ Track selections
- ❌ Have complex internal state

### 3.3 Simplification

**Remove:**
```typescript
// No more local selection state
const selectedCluster = ref(null)  // DELETE
const hoveredNode = ref(null)      // DELETE

// No more layout computation
const createForceSimulation = ...  // DELETE (now in engine)
const updatePositions = ...        // DELETE
const computeLayout = ...          // DELETE
```

**Keep:**
```typescript
// Only D3 rendering specifics
const drawNodes = () => {}         // How to draw circles
const drawEdges = () => {}         // How to draw lines
const setupInteraction = () => {}  // Hover effects, click handlers
const updateAnimations = () => {}  // Transition animations
```

### Checklist

- [ ] Remove all selection state from D3
- [ ] Remove all layout logic from D3
- [ ] Convert data modifications → event emissions
- [ ] Ensure D3 only receives positioned data
- [ ] Test: All interactions still work via store

---

## Phase 4: Add Graph Engine Queries

**Effort:** 2 hours  
**Benefit:** Medium — enables complex features

### 4.1 Use Queries in Store

Already partially done. In `src/stores/graphStore.ts`:

```typescript
import {
  getConnectedNodeIds,
  getClusterEntities,
  getConnectedInsights,
} from '@/engines/graph/queries'

const connectedToSelected = computed(() => {
  if (!selectedNodeId.value) return new Set()
  return new Set(getConnectedNodeIds(selectedNodeId.value, adjacencyMap.value))
})
```

### 4.2 Add New Queries as Needed

```typescript
// In components, when you need info about the graph
import { getNodeSource } from '@/engines/graph/queries'

const nodeSource = getNodeSource(nodeId, nodes, links)
```

---

## Migration Timeline

```
Week 1:
├─ Phase 1: Move state to Pinia (✅ store created, now integrate)
└─ Test: Selections work, D3 re-renders

Week 2:
├─ Phase 2: Extract layout algorithm
└─ Test: Switch layouts, positions update

Week 3:
├─ Phase 3: Clean up D3 component
└─ Test: All interactions still work

Week 4+:
├─ Phase 4: Use graph queries
├─ Add new interactions
├─ Add new layouts
└─ Scale to larger graphs
```

---

## Troubleshooting

### "Store state not updating in D3"
Check: Is D3 receiving the props? Or reading local refs?

```vue
// Wrong: D3 reads local state
const selected = ref(null)
watch(() => selected.value, ...)

// Right: D3 receives as prop
const props = defineProps<{selectedIds: Set<string>}>()
watch(() => props.selectedIds, ...)
```

### "Layout doesn't change when I switch layoutMode"
Check: Is GraphWorkspace watching layoutMode and calling createLayout()?

```vue
watch(() => graphStore.layoutMode, () => {
  layoutResult.value = createLayout({...}, graphStore.layoutMode)
})
```

### "D3 animations are janky"
Check: Are you updating D3 data synchronously with state changes, or letting Vue batch updates?

```vue
// Janky: Manual d3.select updates
const selectedClusterId = ref(null)
watch(() => selectedClusterId.value, (id) => {
  d3.selectAll('circle').style('opacity', ...)  // Immediate
})

// Smooth: Vue re-renders, D3 updates in tick
const props = defineProps<{selectedIds: Set<string>}>()
watch(() => props.selectedIds, () => {
  // Let Vue batch, then D3 renders
})
```

---

## Files to Create/Modify

### Create (Already Done ✅)
- `src/engines/graph/types.ts` ✅
- `src/engines/graph/queries.ts` ✅
- `src/engines/layout/types.ts` ✅
- `src/stores/graphStore.ts` ✅
- `src/engines/README.md` ✅

### Create (Next Steps)
- `src/engines/layout/orchestrator.ts`
- `src/engines/layout/force.ts`
- `src/engines/layout/hierarchy.ts`

### Modify
- `src/screens/GraphWorkspace.vue` (integrate store)
- `src/components/graphs/NetworkGraphD3.vue` (remove state)
- `src/components/graphs/useD3Force.ts` (remove or deprecate)
- `src/components/graphs/useD3Hierarchy.ts` (remove or deprecate)

---

## Success Criteria

After migration, you should be able to:

✅ Add a new layout algorithm without touching GraphWorkspace  
✅ Add a new interaction without touching D3 rendering  
✅ Test layout algorithm in isolation  
✅ Test graph queries in isolation  
✅ Debug state with Pinia DevTools  
✅ Share selection state across multiple components  
✅ Swap D3 for a different renderer without changing app logic

If all these work, the architecture refactor is complete.
