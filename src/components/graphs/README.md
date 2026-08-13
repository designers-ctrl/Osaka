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
Manages force-directed graph simulation with physics-based node positioning.

**Forces applied:**
- Link force: Keeps connected nodes close (strength: 0.1, distance: 30)
- Charge force: Repels nodes (strength: -500, max distance: 300)
- Center force: Pulls graph toward canvas center
- Collision force: Prevents node overlap (radius: size × 0.3 + 1)

```typescript
const { createForceSimulation, updatePositions } = useD3Force()
const sim = createForceSimulation(nodes, links, { width, height })
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
