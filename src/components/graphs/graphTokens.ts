/**
 * src/components/graphs/graphTokens.ts
 *
 * Centralized configuration for all D3 graph rendering constants.
 * SINGLE SOURCE OF TRUTH - all visual properties must come from here.
 * No hardcoded values in components.
 *
 * Supports:
 * - Three-ring hierarchical layout (Sources → Clusters → Insights)
 * - Constant-screen rendering (icons/labels/strokes don't scale with zoom)
 * - Full node configuration (size, styling, positioning)
 * - Physics and layout parameters
 */

// ============================================================================
// NODE SIZING RULES
// ============================================================================
// Each node type has specific sizing behavior:
// - Source: Fixed size (40px)
// - Entity: Fixed size (20px)
// - Cluster: Variable size (scales with entity count)
// - Insight: Variable size (based on confidence/signals)
// - Document: Fixed size (40px, same as source)

export const NODE_DIAMETERS = {
  // Inner ring: Sources (FIXED SIZE)
  source: 30, // Container diameter for sources (icon + border)

  // Middle ring: Entity Clusters (VARIABLE SIZE - use getClusterDiameter())
  // Clusters are semantic containers whose size scales with entity count
  cluster: 30, // Base/minimum cluster diameter (DEPRECATED: use getClusterDiameter())
  entity: 20, // Individual entity diameter (FIXED SIZE)

  // Outer ring: Insights (VARIABLE SIZE - use getInsightDiameter())
  insight: 35, // Base insight diameter (DEPRECATED: use getInsightDiameter())

  // Support nodes
  document: 30, // Same as source - unified component (FIXED SIZE)
}

// ============================================================================
// CLUSTER SIZING - Dynamic based on contained entities/weight
// ============================================================================
// Clusters are semantic containers: size represents content strength/emphasis.
// graphTokens defines ONLY: min radius, max radius, padding.
// Actual radius is computed from cluster contents (entityCount or weight property).

export const CLUSTER_SIZING = {
  // TOKENS ONLY: Min and max radius (not diameter)
  minRadius: 10, // Minimum radius for small/weak clusters
  maxRadius: 30, // Maximum radius for large/strong clusters
  padding: 2, // Padding between cluster edge and contained entities

  // Clusters can have either:
  // 1. entityCount property (number of contained entity nodes)
  // 2. weight property (strength/emphasis value, 0-1 or 1-100)
  // The renderer uses whichever is available to compute actual radius
}

/**
 * Calculate cluster radius based on contents (entityCount or weight).
 * The actual radius should NOT come directly from graphTokens.
 * It must be computed from cluster properties: entityCount or weight.
 * @param entityCountOrWeight - Number of entities OR weight (0-100 scale)
 * @param isWeight - True if parameter is weight (0-100), false if entityCount
 * @returns Cluster radius in pixels
 */
export function getClusterRadius(entityCountOrWeight: number, isWeight: boolean = false): number {
  const minR = CLUSTER_SIZING.minRadius
  const maxR = CLUSTER_SIZING.maxRadius

  if (isWeight) {
    // Weight is 0-100, map to radius range
    const normalized = Math.max(0, Math.min(100, entityCountOrWeight)) / 100
    return minR + (normalized * (maxR - minR))
  }

  // entityCount: scale linearly
  // entityCount 1-10 → radius minR-maxR
  const normalized = Math.max(0, Math.min(10, entityCountOrWeight)) / 10
  return minR + (normalized * (maxR - minR))
}

/**
 * Calculate cluster diameter from radius
 */
export function getClusterDiameter(entityCountOrWeight: number, isWeight: boolean = false): number {
  return getClusterRadius(entityCountOrWeight, isWeight) * 2
}

// ============================================================================
// INSIGHT SIZING - Variable based on confidence/signals
// ============================================================================
// Insights are variable size nodes: size represents strength of signal

export const INSIGHT_SIZING = {
  // Minimum and maximum insight diameter
  minDiameter: 20, // Minimum size for weak insights
  maxDiameter: 50, // Maximum size for strong insights

  // Size can be driven by:
  // 1. Explicit `size` property in node data (e.g., 5-14 range)
  // 2. Calculated from confidence + signal count
  // 3. Using the node's size property directly if provided
}

/**
 * Calculate insight diameter based on size metric
 * Size typically comes from: confidence score, signal count, or explicit size value
 * @param sizeValue - Size metric (typically 1-14, representing strength)
 * @returns Insight diameter in pixels
 */
export function getInsightDiameter(sizeValue: number): number {
  // Map size value (1-14) to diameter range (20-50px)
  // sizeValue=1 → ~20px, sizeValue=14 → ~50px
  const minSize = 1
  const maxSize = 14
  const clamped = Math.max(minSize, Math.min(sizeValue, maxSize))
  const normalized = (clamped - minSize) / (maxSize - minSize) // 0-1
  const diameter = INSIGHT_SIZING.minDiameter + (normalized * (INSIGHT_SIZING.maxDiameter - INSIGHT_SIZING.minDiameter))
  return diameter
}

/**
 * Get node diameter with special handling for clusters
 * Clusters use dynamic sizing; other nodes use fixed sizes
 */
export function getNodeDiameterForNode(nodeType: string, entityCount?: number): number {
  if (nodeType === 'cluster' && entityCount !== undefined) {
    return getClusterDiameter(entityCount)
  }
  const diameters = NODE_DIAMETERS as Record<string, number>
  return diameters[nodeType] || 20
}

// Calculate radius from diameter
export function getNodeRadius(diameter: number): number {
  return diameter / 2
}

// ============================================================================
// ICON SIZING - Source and Document nodes
// ============================================================================
// Icons displayed within source/document nodes.
// IMPORTANT: Icon size is ABSOLUTE, never calculated from node radius.
// Source icon = 20px (50% of 40px container diameter)
// Document icon = 20px (50% of 40px container diameter)

export const ICON_CONFIG = {
  source: {
    // ABSOLUTE icon size: 20px (occupies 50% of 40px container)
    // Must NOT be calculated from node radius
    // Container: 40px diameter → Icon: 20px
    iconSize: 20, // px at 1.0 zoom
    opacity: 0.95,
  },

  document: {
    // ABSOLUTE icon size: 20px (occupies 50% of 40px container)
    // Same as source - unified component styling
    // Container: 40px diameter → Icon: 20px
    iconSize: 20, // px at 1.0 zoom
    opacity: 0.95,
  },
}

// ============================================================================
// LAYOUT RINGS - Three-ring hierarchy
// ============================================================================
// Distance from center for each node type

export const LAYOUT_RINGS = {
  // Inner ring: Sources (primary nodes)
  source: {
    distance: 120, // Distance from center to source node center
    order: 1, // Innermost ring
  },

  // Middle ring: Entity Clusters
  // Positioned 35-40% closer than current spacing
  cluster: {
    distance: 200, // Reduced from ~320px (35% reduction = 120px reduction)
    order: 2, // Middle ring
    minDistance: NODE_DIAMETERS.source + NODE_DIAMETERS.cluster + 30, // Min spacing to avoid overlap
  },

  // Outer ring: Insights
  // Must never be closer to center than clusters
  insight: {
    distance: 300, // Further than clusters
    order: 3, // Outermost ring
    minDistance: NODE_DIAMETERS.cluster + NODE_DIAMETERS.insight + 30,
  },

  // Fallback for unmapped types
  entity: {
    distance: 200, // Same orbit as clusters
    order: 2,
  },

  document: {
    distance: 120, // Same as sources
    order: 1,
  },
}

// ============================================================================
// NODE STYLING
// ============================================================================
// Visual properties for each node type

export const NODE_STYLING = {
  source: {
    fill: 'rgba(157, 126, 234, 0.1)',
    stroke: 'rgba(255, 255, 255, 0.4)',
    strokeWidth: 1, // CONSTANT: always 1px, never scales with zoom
    strokeDasharray: 'none',
  },

  cluster: {
    fill: 'rgba(157, 126, 234, 0.1)',
    stroke: '#9D7EEA',
    strokeWidth: 1, // CONSTANT: always 1px, never scales with zoom
    strokeDasharray: '4,4',
  },

  entity: {
    fill: 'theme',
    stroke: 'none',
    strokeWidth: 0,
    strokeDasharray: 'none',
  },

  insight: {
    fill: 'theme',
    stroke: '#7C6749',
    strokeWidth: 2, // CONSTANT: always 2px, never scales with zoom
    strokeDasharray: 'none',
  },

  document: {
    fill: 'rgba(157, 126, 234, 0.1)',
    stroke: 'rgba(255, 255, 255, 0.4)',
    strokeWidth: 1, // CONSTANT: always 1px, never scales with zoom
    strokeDasharray: 'none',
  },
}

// ============================================================================
// TYPOGRAPHY & LABELS
// ============================================================================
// Label font sizing and positioning.
// CRITICAL RULE: Font size is INDEPENDENT of node size.
// Label font size comes ONLY from TYPOGRAPHY tokens.
// Renderer must NEVER derive font size from node radius or node size.

export const TYPOGRAPHY = {
  source: {
    position: 'right', // Always positioned to the right of node circle
    fontFamily: 'Google Sans Flex',
    fontSize: 14, // ABSOLUTE font size - independent of node size (40px)
    fontWeight: 500,
    lineHeight: 20,
    opacity: 0.9,
    // Position: 6px gap from source circle edge
    // Source radius = 20px, gap = 6px → offsetX = 26px from center
    offsetX: 26, // Horizontal distance from node center (radius 20 + gap 6)
    offsetY: 0, // Vertically centered on node center
    fontStyle: 'normal' as const,
    // Text styling for readability
    textStroke: 'rgba(0, 1, 1, 0.80)', // -webkit-text-stroke-color for outline effect
    textStrokeWidth: 0.5, // -webkit-text-stroke-width
  },

  cluster: {
    position: 'below',
    fontFamily: 'Google Sans Flex',
    fontSize: 14, // ABSOLUTE font size - independent of cluster size (variable)
    fontWeight: 500,
    lineHeight: 20,
    opacity: 0.85,
    offsetX: 0,
    offsetY: 28,
    fontStyle: 'normal' as const,
  },

  insight: {
    position: 'below',
    fontFamily: 'Google Sans Flex',
    fontSize: 14, // ABSOLUTE font size - independent of insight size (variable)
    fontWeight: 400,
    lineHeight: 20,
    opacity: 0.75,
    offsetX: 0,
    offsetY: 28,
    fontStyle: 'normal' as const,
  },

  document: {
    position: 'right', // Positioned to the right of node circle (same as source)
    fontFamily: 'Google Sans Flex',
    fontSize: 14, // ABSOLUTE font size - independent of node size (40px)
    fontWeight: 500,
    lineHeight: 20,
    opacity: 0.9,
    // Position: 6px gap from document circle edge (same as source)
    // Document radius = 20px, gap = 6px → offsetX = 26px from center
    offsetX: 26, // Horizontal distance from node center (radius 20 + gap 6)
    offsetY: 0, // Vertically centered on node center
    fontStyle: 'normal' as const,
    // Text styling for readability (same as source)
    textStroke: 'rgba(0, 1, 1, 0.80)', // -webkit-text-stroke-color for outline effect
    textStrokeWidth: 0.5, // -webkit-text-stroke-width
  },

  entity: {
    // Entities typically don't have visible labels on the canvas
    position: 'hidden',
    fontFamily: 'Google Sans Flex',
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 16,
    opacity: 0.7,
    offsetX: 0,
    offsetY: 0,
    fontStyle: 'normal' as const,
  },
}

// ============================================================================
// LINK STYLING - Connection lines with dual-layer luminous appearance
// ============================================================================
// Connections consist of:
// 1. Background blurred layer (soft atmospheric glow)
// 2. Foreground gradient layer (sharp luminous line)
// 3. Endpoint circles (white, blurred)
//
// All styling uses inverse zoom scaling to stay visually constant.

export const LINK_STYLING = {
  strokeWidth: {
    overlap: 1, // CONSTANT: always 1px, never scales with zoom
    default: 1, // CONSTANT: always 1px, never scales with zoom
  },

  strokeDasharray: {
    overlap: 'none', // Solid lines for source-to-cluster links
    default: 'none', // Solid for regular influence links
  },

  opacity: {
    base: 0.6,
    hover: 0.8,
    hidden: 0.1,
  },

  // Link colors (neutral gray, theme-agnostic)
  colors: {
    overlap: '#656B69', // Cluster overlap links
    default: '#656B69', // Regular influence links
  },

  // Luminous gradient styling for foreground line
  foregroundGradient: {
    stops: [
      { offset: '0%', opacity: 0.1 },   // Start: white 10%
      { offset: '40%', opacity: 0.2 },  // Ramp to white 20%
      { offset: '60%', opacity: 0.2 },  // Hold white 20%
      { offset: '100%', opacity: 0.1 }, // End: white 10%
    ],
    blendMode: 'luminosity',
  },

  // Atmospheric glow styling for background line
  backgroundGradient: {
    stops: [
      { offset: '0%', opacity: 0.1 },   // Start: white 10%
      { offset: '48%', opacity: 0.02 }, // Taper to white 2%
      { offset: '99%', opacity: 0.1 },  // End: white 10%
    ],
  },

  // Blur filter for atmospheric effect
  blur: {
    amount: 0.4, // px - very subtle blur for background line
    endpointBlur: 0.5, // px - blur for endpoint circles
  },

  // Endpoint circles styling
  endpoints: {
    radius: 0.5, // 1px diameter (0.5px radius)
    fill: '#FFFFFF',
    opacity: 1.0,
  },
}

// ============================================================================
// CONSTANT SCREEN SIZE RENDERING
// ============================================================================
// Keeps visual size constant while zoom changes node positions

export const CONSTANT_SCREEN_SIZE = {
  // Enable/disable constant-screen rendering globally
  enabled: true,

  // Properties that should NOT scale with zoom
  scaleInverse: {
    strokeWidth: true, // Line thickness stays constant
    nodeStroke: true, // Node border thickness stays constant
    fontSize: true, // Label size stays constant
    iconSize: true, // Icon size stays constant
  },

  // How to calculate inverse scale factor
  // If zoom = 0.5 (50% smaller), inverse = 2.0 (200% larger to compensate)
  inverseScaleFormula: (zoomScale: number) => {
    return zoomScale > 0 ? 1 / zoomScale : 1
  },
}

// ============================================================================
// FORCE SIMULATION PARAMETERS
// ============================================================================
// Physics for unstructured (force-directed) layout
// CRITICAL: Clusters belong to Sources. Cluster-Source links must be strong.

export const FORCE_SIMULATION = {
  // Node charge (repulsion): negative = repels
  chargeStrength: -150, // Reduced for tighter layout
  chargeDistanceMax: 500,

  // Link forces: different strengths for different link types
  linkStrength: 0.3, // Default link strength for influence connections
  linkDistance: 100, // Default distance between linked nodes

  // Source-Cluster bonds (kind='overlap') must be MUCH STRONGER
  // Clusters are neighborhood around their Source - they must stay bound
  clusterBondStrength: 0.8, // 2.67x stronger than default (0.3)
  clusterBondDistance: 60, // Shorter than default (100) - keeps clusters closer to source

  // Center attraction (pulls all nodes toward center)
  nodeStrength: -250,

  // Collision detection: prevent overlap
  collisionRadius: (nodeType: string): number => {
    const diameters = NODE_DIAMETERS as Record<string, number>
    const diameter = diameters[nodeType] || 20
    return (diameter / 2) + 10 // Radius + padding
  },
}

// ============================================================================
// HIERARCHICAL LAYOUT PARAMETERS
// ============================================================================
// Positioning for structured (ring-based) layout

export const HIERARCHY_LAYOUT = {
  // Center of the graph
  center: { x: 400, y: 300 }, // Mid-point of 800x600 space

  // Ring distribution
  rings: LAYOUT_RINGS,

  // Angle offset to prevent overlapping (in radians)
  angleSpacing: Math.PI * 0.1, // ~18 degrees of buffer per node

  // How to distribute nodes within each ring
  distributeEvenly: true, // Spread nodes around the circle
}

// ============================================================================
// VIEWPORT & ZOOM
// ============================================================================
// Graph zoom and pan behavior

export const VIEWPORT = {
  // Data coordinate space
  dataWidth: 800,
  dataHeight: 600,

  // Initial zoom framing
  initialZoom: {
    marginMultiplier: 0.35, // 65% margin to show all nodes
  },

  // D3 zoom extent [minZoom, maxZoom]
  zoomExtent: [0.3, 4] as [number, number],

  // Scroll wheel sensitivity
  wheelDeltaSensitivity: {
    line: 0.05,
    pixel: 0.002,
    multiplier: 1.5,
  },
}

// ============================================================================
// ANIMATIONS & TRANSITIONS
// ============================================================================
// Duration in milliseconds

export const ANIMATIONS = {
  nodeHoverBrighten: 100,
  linkHover: 200,
  labelFade: 150,
}

// ============================================================================
// SOURCE & DOCUMENT NODE STYLING
// ============================================================================
// Unified styling for source and document nodes (both use icons)

export const SOURCE_NODES = {
  icon: {
    width: 40, // Icon display size (same as node diameter)
    height: 40,
    opacity: 0.95,
  },
}

// ============================================================================
// BACKWARDS COMPATIBILITY ALIASES
// ============================================================================
// Map new token names to old names for gradual migration

export const LAYOUT = VIEWPORT
export const LINKS = LINK_STYLING

// ============================================================================
// CONNECTION GEOMETRY
// ============================================================================
// Connections stop before reaching node boundaries with a small visual gap

export const CONNECTION_GEOMETRY = {
  // Visual gap from node boundary to connection endpoint (in screen pixels)
  // This gap is visually constant regardless of zoom level
  endpointGap: 4,
}

/**
 * Calculate both shortened endpoints of a connection line.
 * The line connects source center to target center, then both ends are shortened
 * so the line stops before entering the node boundaries.
 *
 * @param sourceNode - Source node with x, y coordinates
 * @param targetNode - Target node with x, y coordinates
 * @param sourceRadius - Radius of the source node
 * @param targetRadius - Radius of the target node
 * @param gap - Visual gap from node boundary (in screen pixels)
 * @param zoomScale - Current zoom level (for scaling the gap in graph coordinates)
 * @returns Object with { source: {x, y}, target: {x, y} }
 */
export function getConnectionEndpoints(
  sourceNode: { x?: number; y?: number },
  targetNode: { x?: number; y?: number },
  sourceRadius: number,
  targetRadius: number,
  gap: number = CONNECTION_GEOMETRY.endpointGap,
  zoomScale: number = 1,
): { source: { x: number; y: number }; target: { x: number; y: number } } {
  const sx = sourceNode.x || 0
  const sy = sourceNode.y || 0
  const tx = targetNode.x || 0
  const ty = targetNode.y || 0

  // Calculate direction vector from source → target (only once)
  const dx = tx - sx
  const dy = ty - sy

  // Calculate distance between centers
  const distance = Math.sqrt(dx * dx + dy * dy)

  // If nodes are at same position, return centers
  if (distance === 0) {
    return {
      source: { x: sx, y: sy },
      target: { x: tx, y: ty },
    }
  }

  // Normalize direction vector (from source toward target)
  const ux = dx / distance
  const uy = dy / distance

  // Scale gap to account for zoom level
  const scaledGap = gap / zoomScale

  // Calculate offsets from each node center
  const sourceOffset = sourceRadius + scaledGap
  const targetOffset = targetRadius + scaledGap

  // Source endpoint: move FROM source center TOWARD target by sourceOffset
  const sourceX = sx + ux * sourceOffset
  const sourceY = sy + uy * sourceOffset

  // Target endpoint: move FROM target center TOWARD source by targetOffset
  const targetX = tx - ux * targetOffset
  const targetY = ty - uy * targetOffset

  return {
    source: { x: sourceX, y: sourceY },
    target: { x: targetX, y: targetY },
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the configured diameter for a node type
 * - Clusters: diameter is computed from weight or entityCount
 * - Insights: diameter is dynamic based on size/confidence metric
 * - Others: fixed sizes
 * @param nodeType - Type of node (source, cluster, entity, insight, document)
 * @param sizeMetric - For clusters: weight (0-100) or entityCount; For insights: size value (1-14)
 * @param isWeight - For clusters: true if sizeMetric is weight (0-100), false if entityCount
 * @returns Diameter in pixels
 */
export function getNodeDiameter(nodeType: string, sizeMetric?: number, isWeight?: boolean): number {
  if (nodeType === 'cluster' && sizeMetric !== undefined) {
    // Clusters: use weight if available (isWeight=true), else use entityCount
    return getClusterDiameter(sizeMetric, isWeight || false)
  }
  if (nodeType === 'insight' && sizeMetric !== undefined) {
    return getInsightDiameter(sizeMetric)
  }
  const diameters = NODE_DIAMETERS as Record<string, number>
  return diameters[nodeType] || 20
}

/**
 * Get the configured radius for a node type
 * - Clusters: radius is computed from weight or entityCount
 * - Insights: radius is dynamic based on size/confidence metric
 * - Others: fixed radius
 * @param nodeType - Type of node (source, cluster, entity, insight, document)
 * @param sizeMetric - For clusters: weight (0-100) or entityCount; For insights: size value (1-14)
 * @param isWeight - For clusters: true if sizeMetric is weight, false if entityCount
 * @returns Radius in pixels
 */
export function getNodeRadiusForType(nodeType: string, sizeMetric?: number, isWeight?: boolean): number {
  return getNodeDiameter(nodeType, sizeMetric, isWeight) / 2
}

/**
 * Get orbit distance from center for a node type
 */
export function getOrbitDistance(nodeType: string): number {
  const rings = LAYOUT_RINGS as Record<string, { distance: number }>
  return rings[nodeType]?.distance || 200
}

/**
 * Get styling for a node type
 */
export function getNodeStyling(nodeType: string) {
  return (NODE_STYLING as Record<string, any>)[nodeType] || NODE_STYLING.entity
}

/**
 * Calculate inverse scale factor for constant-screen rendering
 * This compensates for zoom so that non-position attributes stay constant size
 */
export function getInverseZoomScale(currentZoomScale: number): number {
  if (!CONSTANT_SCREEN_SIZE.enabled) return 1
  return CONSTANT_SCREEN_SIZE.inverseScaleFormula(currentZoomScale)
}

/**
 * Get stroke width, optionally inverse-scaled by zoom
 */
export function getLinkStrokeWidth(
  linkType: string,
  zoomScale: number = 1,
): number {
  const widths = LINK_STYLING.strokeWidth as Record<string, number>
  const baseWidth = widths[linkType] || LINK_STYLING.strokeWidth.default
  const inverseScale = getInverseZoomScale(zoomScale)
  return baseWidth * inverseScale
}

/**
 * Get node stroke width, optionally inverse-scaled by zoom
 */
export function getNodeStrokeWidth(
  nodeType: string,
  zoomScale: number = 1,
): number {
  const styling = getNodeStyling(nodeType)
  if (typeof styling.strokeWidth === 'function') {
    return styling.strokeWidth() * getInverseZoomScale(zoomScale)
  }
  return (styling.strokeWidth || 0) * getInverseZoomScale(zoomScale)
}

/**
 * Get font size, optionally inverse-scaled by zoom
 */
export function getFontSize(
  nodeType: string,
  zoomScale: number = 1,
): number {
  const typo = (TYPOGRAPHY as Record<string, any>)[nodeType]
  if (!typo) return 14
  const inverseScale = getInverseZoomScale(zoomScale)
  return typo.fontSize * inverseScale
}

/**
 * Get ABSOLUTE icon size (never calculated from node radius)
 * Icon size is constant, optionally inverse-scaled by zoom to maintain visual consistency
 * Source icon = 20px (50% of 40px container)
 * Document icon = 20px (50% of 40px container)
 * @param nodeType - Type of node (source or document)
 * @param zoomScale - Current D3 zoom scale (for inverse scaling)
 * @returns Icon diameter in pixels
 */
export function getIconDiameter(
  nodeType: string,
  zoomScale: number = 1,
): number {
  const iconCfg = (ICON_CONFIG as Record<string, any>)[nodeType]
  if (!iconCfg) return 20
  // Icon size is ABSOLUTE - use iconSize directly, with inverse zoom scaling
  const inverseScale = getInverseZoomScale(zoomScale)
  return iconCfg.iconSize * inverseScale
}
