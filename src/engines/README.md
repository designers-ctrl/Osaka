# Graph Engines

This directory contains the layered architecture for graph visualization, separate from rendering.

## Structure

```
engines/
├── graph/                 # Graph data layer
│   ├── types.ts          # Core types
│   └── queries.ts        # Query operations (read-only)
│
└── layout/               # Layout computation layer
    ├── types.ts          # Layout types
    ├── orchestrator.ts   # Algorithm selector (not yet created)
    ├── force.ts          # Force-directed layout (future)
    └── hierarchy.ts      # Hierarchical layout (future)
```

## Graph Engine

### Purpose
Pure data operations on the graph. No side effects, no state management.

### What It Does
```typescript
// Query the graph
getConnectedNodeIds(nodeId, adjacencyMap)
getClusterEntities(clusterId, nodes, links)
getConnectedInsights(nodeId, nodes, links)
searchNodesByLabel(nodes, query)
filterNodesByTimeRange(nodes, start, end)
```

### What It Doesn't Do
- ❌ Layout/positioning
- ❌ Rendering
- ❌ State management
- ❌ Vue components

### Example Usage
```typescript
import { getConnectedNodeIds, buildAdjacencyMap } from '@/engines/graph/queries'

const adjMap = buildAdjacencyMap(nodes, links)
const connectedIds = getConnectedNodeIds('node-123', adjMap)
// Returns: ['node-456', 'cluster-1', 'insight-2']
```

## Layout Engine

### Purpose
Convert graph data into positioned coordinates. Pluggable algorithms.

### Available Algorithms (planned)
1. **Force** — D3 force simulation (implemented via D3)
2. **Hierarchy** — Layered tree layout
3. **Radial** — Concentric circles from root node
4. **Focused** — Ego graph of selected node
5. **Structured** — Grid/treemap layout

### Input/Output
```typescript
input: {nodes, edges, constraints?, width?, height?}
output: {
  nodes: [each with x, y],
  edges: [with resolved source/target],
  metadata: {algorithm, iterations, converged, error, duration}
}
```

### Example Usage (when implemented)
```typescript
import { createLayout } from '@/engines/layout'

const result = createLayout(
  {nodes, edges, width: 800, height: 600},
  'force' // algorithm choice
)

// result.nodes now have .x and .y
// Use these in D3 rendering
```

## Pinia Store (State Layer)

All interaction state lives in `src/stores/graphStore.ts`:

```typescript
import { useGraphStore } from '@/stores/graphStore'

const graphStore = useGraphStore()

// Selections
graphStore.selectNode('node-1')
graphStore.selectCluster('cluster-2')
graphStore.hoverNode('insight-3')

// View
graphStore.setLayoutMode('hierarchy')
graphStore.setZoom(1.5)

// Filters
graphStore.search('alert')
graphStore.toggleFilter('recent')

// Computed
graphStore.connectedToSelected  // Set<string>
graphStore.selectedNode          // NetworkNode | null
graphStore.nodesToHighlight      // Set<string> for D3
```

## Data Flow

```
1. User clicks node in D3
   ↓
2. NetworkGraphD3 emits @node-click(id)
   ↓
3. GraphWorkspace receives event
   ↓
4. Calls graphStore.selectNode(id)
   ↓
5. Store updates selectedNodeId
   ↓
6. Computed selectedNode updates
   ↓
7. Computed connectedToSelected updates
   ↓
8. Vue re-renders NetworkGraphD3 with new props
   ↓
9. D3 applies highlighting styles based on props
```

## Adding a New Query Function

If you need to ask the graph a question:

```typescript
// 1. Add to src/engines/graph/queries.ts
export function myNewQuery(
  nodeId: string,
  nodes: NetworkNode[],
  links: NetworkLink[],
): ResultType {
  // Pure logic, no side effects
  return result
}

// 2. Use in Pinia store computed
const myDerivedState = computed(() =>
  myNewQuery(selectedNodeId.value, nodes.value, links.value)
)

// 3. Use in component
const store = useGraphStore()
console.log(store.myDerivedState)
```

## Adding a New Layout Algorithm

When ready to implement:

```typescript
// 1. Create src/engines/layout/myalgorithm.ts
export function createMyLayout(input: LayoutInput): LayoutResult {
  // Position nodes
  // Return positioned nodes and edges
}

// 2. Register in orchestrator (src/engines/layout/orchestrator.ts)
const algorithms = {
  force: createForceLayout,
  myalgorithm: createMyLayout, // ← add here
}

// 3. Use in GraphWorkspace
graphStore.setLayoutMode('myalgorithm')
// That's it.
```

## Performance Notes

- **Adjacency map:** Computed automatically, cached by Vue
- **Search:** Linear scan, reasonable for <1000 nodes
- **Queries:** All O(n) or O(n log n), very fast
- **Future:** Can move to Web Worker for large graphs

## Testing

Graph engine functions are pure and testable:

```typescript
test('getConnectedNodeIds returns adjacent nodes', () => {
  const map = buildAdjacencyMap(testNodes, testLinks)
  const result = getConnectedNodeIds('n1', map)
  expect(result).toContain('n2')
})
```

See `src/engines/__tests__/` for examples.
