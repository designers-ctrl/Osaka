# Network Graph Components

D3.js-based interactive network graph visualization for the knowledge graph workspace.

## Components

### NetworkGraphD3.vue
The main graph component supporting both unstructured (force-directed) and structured (hierarchical) layouts.

**Props:**
- `nodes: NetworkNode[]` — Graph nodes
- `links: NetworkLink[]` — Graph connections
- `height: number` — SVG height in pixels
- `layoutMode: 'unstructured' | 'structured'` — Layout algorithm
- `zoom?: number` — Zoom level (default: 1)
- `title?: string` — Accessibility title

**Events:**
- `@cluster-click` — Fired when a cluster or source node is clicked

**Features:**
- Force-directed simulation (unstructured mode) with collision detection
- Hierarchical radial layout (structured mode)
- Interactive node selection with connection highlighting
- Source icon rendering on hub nodes
- Responsive SVG scaling
- Smooth transitions and animations

## Composables

### useD3Force
Manages the Unstructured layout: a deterministic pre-solve, then a
force-directed simulation. Every parameter comes from `FORCE_SIMULATION` in
`graphTokens.ts` — none are literals here.

**Forces applied:**
- Link force — distance/strength by link class: ownership bonds (Source→Cluster)
  strongest, cross-group/insight bridges tighter than generic links
- Charge force — short-range repulsion, so separated groups stop pushing each
  other across the canvas
- Center force + gentle center gravity — compacts the composition
- Collision force — prevents overlap between **all** visible kinds, sized from
  each node's *actual* rendered radius (`getEffectiveNodeRadius`) plus
  `nodeCollisionGap`, so weight-sized clusters and size-sized insights are
  covered, not just the per-kind base size
- Hub separation — hub group envelopes (orbit + largest cluster) never merge
- Cluster orbit — each hub's clusters ease into even angular slots, with the
  externally-connected ones claiming the slot that FACES what they connect to
- Insight barycenter / envelope separation / link clearance / communities —
  insights settle between the nodes they connect, outside every Source orbit,
  and off every straight link they are not an endpoint of

**Pre-solve (why the graph appears already settled):**
`seedInitialLayout` assigns topology-aware positions before anything renders —
hubs keep their authored positions, clusters take orbit slots, and insights are
placed by scoring candidate positions around the barycenter of their
connections (cost = link/node crossings ≫ node overlap > envelope intrusion >
total length). Clusters and insights are solved *together*, iteratively, so a
cluster ends up on the side of its Source that faces its insight.
`warmupSimulation` then runs the physics to rest off-screen, so the first paint
is the layout rather than the start of one.

```typescript
const { createForceSimulation, seedInitialLayout, warmupSimulation } = useD3Force()

seedInitialLayout(nodes, links, { width, height })   // deterministic, no randomness
const sim = createForceSimulation(nodes, links, { width, height })
warmupSimulation(sim)                                // settle before rendering
// …draw…
sim.alpha(FORCE_SIMULATION.initialSettleAlpha).restart()  // small live polish
```

### useD3Hierarchy
Creates hierarchical layouts with cluster grouping by node type.

```typescript
const { createHierarchicalLayout } = useD3Hierarchy()
const layoutNodes = createHierarchicalLayout(nodes, links, { width, height })
```

### useD3Interaction
Handles user interactions: clicks, hovers, selections, and connection highlighting.

```typescript
const { setupNodeInteraction, highlightConnectedNodes } = useD3Interaction()
setupNodeInteraction(selection, onClusterClick)
```

### useD3Drag
Enables interactive node dragging in force-directed simulations (unstructured mode only).

**Behavior:**
- Drag to reposition nodes
- Simulation slows but continues during drag (alphaTarget: 0.3)
- On release, node returns to natural forces
- Respects bounds within data coordinate space

```typescript
const { createDragBehavior } = useD3Drag()
nodes.call(createDragBehavior(simulation))
```

## Integration

The graph is used in `src/screens/GraphWorkspace.vue` with:
- Layout toggle: "Unstructured" (force-directed) ↔ "Structured" (hierarchical)
- Timeline filtering: Only shows nodes active in the selected time range
- Cluster selection: Highlights connected nodes when a cluster is clicked

## Architecture Notes

- **Vue owns state**: data, layout mode, selections, timeline filtering
- **D3 owns rendering**: DOM manipulation, physics simulation, transitions
- **No two-way binding**: D3 data is separate from Vue reactivity
- **SVG-based**: Responsive via viewBox, no canvas (better for tooltips/selection)

## Icon Assets

Source icons are imported from `src/assets/nodeSourceIcons/`:
- Slack
- Gmail
- LinkedIn
- Google Drive
- WhatsApp
- Spotify

Icons are rendered as 4×4 in data space on source hub nodes.

## Implementation Notes

### Reference
This implementation follows D3 force-directed graph best practices from:
- https://observablehq.com/@d3/force-directed-graph/2 — Core simulation patterns
- https://observablehq.com/@d3/force-directed-tree — Hierarchical layouts

### Data Coordinate Space
All positions and sizes use a fixed 80×60 coordinate space:
- Node positions: (0–80, 0–60)
- Node radius: size × 0.3 (scaled from dataset to fit space)
- SVG viewBox: [0, 0, 80, 60] (responsive via CSS width/height)
- Zoom: Applied via group transform scale

### Performance Considerations
- Force simulation runs only in unstructured mode
- Hierarchical layout is pre-calculated, no simulation
- Simulation stops on layout change
- Node dragging temporarily increases alpha to continue simulation

### Browser Compatibility
- SVG via D3 (supported in all modern browsers)
- pointer-events API required for interaction
- CSS transforms for zoom (no canvas)
