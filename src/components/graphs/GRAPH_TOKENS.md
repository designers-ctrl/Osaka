# Graph Rendering Tokens (graphTokens.ts)

## Overview

`graphTokens.ts` is the **single source of truth** for all D3 graph rendering constants. No hardcoded values should exist in D3 components—all configuration comes from this file.

This centralized approach:
- ✅ Makes the graph system easy to tune without touching component code
- ✅ Aligns with Figma design system values
- ✅ Supports "constant screen size" rendering (experimental)
- ✅ Makes it obvious what values control what behavior

## Structure

### NODE_SIZES
Node visual sizing and styling for all node types.

```typescript
NODE_SIZES.radiusMultiplier: 3.0  // Applied to node.size values
NODE_SIZES.insight: 8             // Default size when size not provided
NODE_SIZES.stroke.insight         // Stroke width function
NODE_SIZES.fill.insight           // Fill color ('theme' or hex)
NODE_SIZES.stroke_color.insight   // Stroke color
NODE_SIZES.stroke_dasharray.insight // Dash pattern ('none' or '4,4')
```

**Used by:** NetworkGraphD3.vue, nodeStyles.ts (backward compat)

### ICON_SIZES
SVG icon sizing for source and document nodes.

```typescript
ICON_SIZES.width: 24              // Icon width in pixels
ICON_SIZES.height: 24             // Icon height in pixels
ICON_SIZES.opacity: 0.95          // Icon opacity [0-1]
```

**Used by:** NetworkGraphD3.vue (source and document icons)

### TYPOGRAPHY
Font sizing and positioning for all node labels.

```typescript
TYPOGRAPHY.source.fontSize: 18    // Source label font size
TYPOGRAPHY.source.fontWeight: 500 // Font weight (400-900)
TYPOGRAPHY.source.offsetX: 28     // X offset from node center
TYPOGRAPHY.source.offsetY: 5      // Y offset from node center
TYPOGRAPHY.source.opacity: 0.9    // Label opacity [0-1]

TYPOGRAPHY.document.fontSize: 16
TYPOGRAPHY.document.offsetX: 0    // Centered
TYPOGRAPHY.document.offsetY: 24   // Below the node
```

**Used by:** NetworkGraphD3.vue for all labels

### LINKS
Connection line styling and interaction.

```typescript
LINKS.strokeWidth.overlap: 2.5    // Width for dashed cluster links
LINKS.strokeWidth.default: 1.8    // Width for influence links
LINKS.opacity.base: 0.6           // Base opacity when not interacting
LINKS.opacity.hover: 0.8          // Opacity on hover
LINKS.hover.strokeWidth: 2.0      // Width on hover
```

**Used by:** NetworkGraphD3.vue for link rendering

### LAYOUT
Graph viewport and interaction constants.

```typescript
LAYOUT.dataWidth: 800             // D3 data coordinate space width
LAYOUT.dataHeight: 600            // D3 data coordinate space height

LAYOUT.initialZoom.marginMultiplier: 0.35
// 0.35 = 65% margin around graph (more zoomed out)
// 0.50 = 50% margin (less zoomed out)
// 0.85 = 15% margin (more zoomed in)

LAYOUT.zoomExtent: [0.3, 4]       // [minZoom, maxZoom]

LAYOUT.wheelDeltaSensitivity.line: 0.05  // Scroll mode sensitivity
LAYOUT.wheelDeltaSensitivity.pixel: 0.002
LAYOUT.wheelDeltaSensitivity.multiplier: 1.5
```

**Used by:** NetworkGraphD3.vue for viewport and zoom behavior

### FORCE_SIMULATION
Physics parameters for force-directed (unstructured) layout.

```typescript
FORCE_SIMULATION.chargeStrength: -200    // Node repulsion (lower = more spread)
FORCE_SIMULATION.chargeDistanceMax: 600  // Distance limit for charge
FORCE_SIMULATION.linkStrength: 0.2       // Link attraction strength
FORCE_SIMULATION.linkDistance: 150       // Desired distance between linked nodes
FORCE_SIMULATION.nodeStrength: -300      // Center attraction
FORCE_SIMULATION.collisionRadius         // Function to prevent overlap
```

**Used by:** useD3Force.ts for physics simulation

### HIERARCHY_LAYOUT
Parameters for hierarchical (structured) layout.

```typescript
HIERARCHY_LAYOUT.baseRadius: 20          // Base cluster positioning radius
HIERARCHY_LAYOUT.clusterRadiusMultiplier: 1.5  // How far clusters spread
HIERARCHY_LAYOUT.nodeDistanceInCluster: 3     // Distance from cluster center
```

**Used by:** useD3Hierarchy.ts for radial layout

### ANIMATIONS
Transition durations in milliseconds.

```typescript
ANIMATIONS.nodeHoverIn: 100       // ms to enlarge on hover
ANIMATIONS.nodeHoverOut: 100      // ms to shrink on hover out
ANIMATIONS.linkHover: 200         // ms to brighten line
ANIMATIONS.labelFade: 150         // ms for label transitions
```

**Used by:** useD3Interaction.ts (when implemented)

### CONSTANT_SCREEN_SIZE (Experimental)
Support for keeping visual size constant while zooming.

```typescript
CONSTANT_SCREEN_SIZE.enabled: false  // Enable to test

// When enabled, icons, labels, and strokes scale inversely with zoom
// So they maintain constant visual size at any zoom level
```

## Helper Functions

### getNodeRadius(nodeSize, nodeType)
```typescript
import { getNodeRadius } from '@/components/graphs/graphTokens'

const radius = getNodeRadius(8, 'insight')  // Returns: 8 * 3.0 = 24
```

### getNodeStrokeWidth(nodeType, nodeSize)
```typescript
const strokeWidth = getNodeStrokeWidth('insight', 18)  // Returns: 2.5 (if size > 16)
```

### getLinkStrokeWidth(linkKind, zoomScale)
```typescript
const width = getLinkStrokeWidth('overlap', 1.0)  // Returns: 2.5
// With constant screen size enabled, accounts for zoom scale
```

### getFontSize(labelType, zoomScale)
```typescript
const size = getFontSize('source', 1.0)  // Returns: 18
// With constant screen size enabled, inverse scales with zoom
```

### getIconSize(zoomScale)
```typescript
const { width, height } = getIconSize(1.0)  // Returns: { width: 24, height: 24 }
```

## Editing for Design Changes

To adjust node sizes to match new Figma designs:

```typescript
// In graphTokens.ts
NODE_SIZES.radiusMultiplier: 2.5  // Changed from 3.0 - nodes appear smaller
TYPOGRAPHY.source.fontSize: 20    // Changed from 18 - labels larger
LINKS.strokeWidth.default: 2.0    // Changed from 1.8 - thicker lines
```

**All components using these tokens automatically pick up the changes.**

## Constant Screen Size Rendering

When `CONSTANT_SCREEN_SIZE.enabled: true`:

- Labels stay the same visual size at any zoom level
- Stroke widths scale inversely with zoom
- Icons maintain constant size
- Only node positions scale with pan/zoom

To enable:
```typescript
CONSTANT_SCREEN_SIZE.enabled: true
```

Then use the helper functions to get scaled values:
```typescript
const fontSize = getFontSize('source', currentZoomScale)
const strokeWidth = getLinkStrokeWidth('overlap', currentZoomScale)
const iconSize = getIconSize(currentZoomScale)
```

## Migration Guide

### Old way (hardcoded):
```typescript
// In NetworkGraphD3.vue
.attr('stroke-width', (d: any) => d.kind === 'overlap' ? 2.5 : 1.8)
.attr('font-size', 18)
```

### New way (tokens):
```typescript
// In NetworkGraphD3.vue
import { LINKS, TYPOGRAPHY } from './graphTokens'

.attr('stroke-width', (d: any) => d.kind === 'overlap' ? LINKS.strokeWidth.overlap : LINKS.strokeWidth.default)
.attr('font-size', TYPOGRAPHY.source.fontSize)
```

## Files Using graphTokens

- ✅ `NetworkGraphD3.vue` - Main visualization
- ✅ `nodeStyles.ts` - (Backward compatibility wrapper)
- ✅ `useD3Force.ts` - Physics simulation
- ✅ `useD3Hierarchy.ts` - Hierarchical layout
- ⏳ `useD3Interaction.ts` - (Can integrate animation durations)

## Adding New Tokens

When adding a new rendering parameter:

1. Define it in `graphTokens.ts` in the appropriate section
2. Add a comment explaining the parameter
3. Import and use it in the component
4. Document it in this file

Example:
```typescript
// In graphTokens.ts
export const NODE_SIZES = {
  // ... existing values
  shadowBlur: 4,  // Shadow blur radius for insight nodes
}

// In NetworkGraphD3.vue
import { NODE_SIZES } from './graphTokens'
.attr('filter', (d) => d.kind === 'insight' ? `blur(${NODE_SIZES.shadowBlur}px)` : 'none')
```
