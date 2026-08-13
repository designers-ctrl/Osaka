/**
 * src/components/graphs/structured/structuredTokens.ts
 *
 * Structured-view specific tokens: ring positions, node sizes (uniform per type),
 * center avatar, colors/styling. Completely independent of Unstructured graphTokens.
 *
 * Key principle: Structured view has FIXED sizes per node type, unlike Unstructured's
 * variable sizing. These are the canonical values for the Structured renderer.
 */

// ============================================================================
// STRUCTURED RING POSITIONS
// ============================================================================
// Distance from center (graph origin) for each node type's ring

export const STRUCTURED_RINGS = {
  // Center: account avatar + sentiment gauge
  center: 0,

  // First ring: insights, uniform size
  insight: 140,

  // Second ring: entity nodes, uniform size
  // Increased from 220 to 300 to accommodate 72 entities without overlap
  // With entity diameter 18px + 4px gap = 22px per entity: circumference 1885px ÷ 22 = 85 capacity
  entity: 300,

  // Outer ring: clusters with source icons, uniform size
  // Increased from 300 to 400 to maintain proportional spacing (gap increased 80→100px)
  cluster: 400,
}

// ============================================================================
// NODE SIZING - UNIFORM PER TYPE (NOT VARIABLE)
// ============================================================================
// Structured view renders fixed sizes regardless of confidence/weight/entity-count
// (unlike Unstructured where clusters/insights scale with data)

export const STRUCTURED_NODE_SIZES = {
  // Center avatar circle
  centerAvatar: 80,

  // Insight nodes: fixed diameter (uniform across all insights)
  // Updated from 20 to 12 to match Figma reference proportions
  insight: 12,

  // Entity nodes: fixed diameter (uniform across all entities)
  // REDESIGNED: Entity ring now shows 1 cluster-summary circle per cluster (38 total, not 72 entities)
  // Increased from 18 to 24 for better readability with reduced node count (49.6px per cluster available)
  entity: 24,

  // Cluster nodes: fixed diameter (uniform across all clusters)
  cluster: 40,
}

// ============================================================================
// CENTER RING - AVATAR + SENTIMENT GAUGE
// ============================================================================
// The central avatar circle and its surrounding metrics/labels

export const CENTER_AVATAR = {
  // Avatar circle dimensions
  radius: STRUCTURED_NODE_SIZES.centerAvatar / 2,
  diameter: STRUCTURED_NODE_SIZES.centerAvatar,

  // Avatar styling — glass-gradient background, OPAQUE: vertical gray2→gray3
  // gradient, borderless. Fully solid so the graph/lines behind can never
  // show through the avatar surface. Colors reference the theme's gray
  // tokens (--v-theme-gray2/gray3) with the same values as hex fallback.
  stroke: 'none',
  strokeWidth: 0,
  background: {
    gradientStops: [
      { offset: '12.29%', color: 'rgb(var(--v-theme-gray2, 62, 69, 67))' }, // theme gray2 (#3E4543)
      { offset: '100%', color: 'rgb(var(--v-theme-gray3, 27, 34, 32))' }, // theme gray3 (#1B2220)
    ],
  },

  // Initials text styling
  initials: {
    fontSize: 32,
    fontWeight: 600,
    fontFamily: 'Google Sans Flex',
    fill: '#FFFFFF',
  },

  // Gauge/meter styling below avatar
  gauge: {
    // Horizontal bar showing sentiment percentage
    width: 80, // px
    height: 6, // px
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    fillColor: '#7FBB82', // Green, sentiment positive
    borderRadius: 3,
    marginTop: 14, // Distance below avatar
  },

  // Percentage text (e.g., "75%") — the LARGE value in the row below the
  // avatar, beside the segmented sentiment indicator.
  percentage: {
    fontSize: 20,
    fontWeight: 600,
    fontFamily: 'Google Sans Flex',
    fill: '#FFFFFF',
  },

  // Row below the avatar: [ 75% ] [ segmented indicator ], centered as a
  // unit under the avatar, both vertically centered on the row's midline.
  row: {
    marginTop: 16, // clear vertical gap between avatar bottom and the row
    gap: 8, // horizontal gap between the percentage and the indicator
  },

  // "Sentiment Rate" label
  label: {
    fontSize: 12,
    fontWeight: 400,
    fontFamily: 'Google Sans Flex',
    fill: 'rgba(255, 255, 255, 0.7)',
    text: 'Sentiment Rate',
    marginTop: 8, // Distance below the value+indicator row
  },
}

// ============================================================================
// SENTIMENT INDICATOR (segmented meter under the center avatar)
// ============================================================================
// Geometry from Figma node 1646-51131: a 20×14 pill with 2px padding, three
// equal vertical segments with a 1px gap. Status COLORS are not defined here —
// renderSentimentIndicator.ts resolves them from the live theme's semantic
// status tokens (success/warning/error) via chartTheme.status.

export const SENTIMENT_INDICATOR = {
  width: 20, // px — outer container
  height: 14, // px — outer container
  padding: 2, // px — inner inset on all sides
  gap: 1, // px — between segments
  borderRadius: 2, // px — outer container corners
  segments: 3,
  segmentBorderRadius: 1, // px — each segment's corners
  /** Outer container: status color at ~10% alpha (Figma's 0.10 treatment). */
  containerAlpha: 0.10,
  /** Inactive segment slots — same inactive token as ENTITY_RING.battery. */
  inactiveColor: 'rgba(255, 255, 255, 0.1)',
}

// ============================================================================
// INSIGHT RING STYLING
// ============================================================================
// Uniform-size insight nodes with optional badge

export const INSIGHT_RING = {
  // Fixed node styling
  nodeRadius: STRUCTURED_NODE_SIZES.insight / 2,
  fill: 'theme', // Will resolve via chartTheme (categorical[0])
  stroke: '#7C6749',
  strokeWidth: 1,

  // Optional badge (top-right of node)
  badge: {
    radius: 8, // Diameter of badge circle
    backgroundColor: '#FF6B6B', // Red/highlight background
    fontSize: 10,
    fontWeight: 600,
    fontFamily: 'Google Sans Flex',
    textFill: '#FFFFFF', // White text
    offsetX: 8, // Distance right from node edge
    offsetY: -8, // Distance up from node edge
  },
}

// ============================================================================
// ENTITY RING STYLING
// ============================================================================
// Entity nodes with count + percentage bar + battery indicator

export const ENTITY_RING = {
  // Fixed node styling
  nodeRadius: STRUCTURED_NODE_SIZES.entity / 2,

  // Neutral gray glass (Figma spec): radial gray1 gradient (center 24% →
  // edge 40%), 0.5px gray1 hairline border, faint white inner highlight.
  // Reproduced with an SVG radialGradient — CSS backdrop-filter does not
  // apply to SVG shapes. Colors reference the theme's gray1 token
  // (--v-theme-gray1, #949B99 = 148,155,153) with hex-rgb fallback.
  glass: {
    gradientId: 'entity-node-glass',
    gradientStops: [
      { offset: '0%', color: 'rgba(var(--v-theme-gray1, 148, 155, 153), 0.24)' },
      { offset: '100%', color: 'rgba(var(--v-theme-gray1, 148, 155, 153), 0.40)' },
    ],
    stroke: 'rgba(var(--v-theme-gray1, 148, 155, 153), 0.10)',
    strokeWidth: 0.5,
    // Approximation of `box-shadow: 0 0 1px rgba(255,255,255,.10) inset`
    innerHighlight: 'rgba(255, 255, 255, 0.10)',
    innerHighlightWidth: 0.5,
  },

  // Count text inside circle (Figma: Inter 8px / 300 / white 80%)
  count: {
    fontSize: 8,
    fontWeight: 300,
    fontFamily: 'Inter, sans-serif',
    lineHeight: 12, // px — single SVG text line; recorded for parity with Figma
    fill: 'rgba(255, 255, 255, 0.80)',
  },

  // Percentage text below entity node — REDESIGNED for 38 clusters
  // Entity ring now shows 1 circle per cluster (not 72 entities) with aggregate data
  // Space per cluster: 49.6px (vs 26.2px for 72 entities) — much more readable
  percentage: {
    width: 32, // px (was 20 for 72-entity compact) — increased for legibility
    fontSize: 10, // px (was 8) — larger, more readable
    fontWeight: 500,
    fontFamily: 'Google Sans Flex',
    fill: 'rgba(255, 255, 255, 0.9)',
    marginTop: 3, // px (was 2) — slightly more breathing room
  },

  // Battery indicator: 3 segments — REDESIGNED for 38 clusters
  battery: {
    segments: 3,
    width: 32, // px (was 20 for 72-entity compact) — increased for legibility
    height: 4, // px (was 3) — normal height for better visibility
    gap: 2, // px (was 1) — proper gaps between segments
    activeColor: '#7FBB82', // Green when filled
    inactiveColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 1,
    marginTop: 2, // px (was 1) — proper spacing below percentage
  },
}

// ============================================================================
// CLUSTER RING STYLING
// ============================================================================
// Cluster nodes with source icons, uniform size, arc-based labels

export const CLUSTER_RING = {
  // Fixed node styling
  nodeRadius: STRUCTURED_NODE_SIZES.cluster / 2,
  fill: 'rgba(157, 126, 234, 0.1)',
  stroke: '#9D7EEA',
  strokeWidth: 1,
  strokeDasharray: '4,4', // Dashed border

  // Source icon inside cluster
  sourceIcon: {
    size: 20, // Icon diameter (px)
    opacity: 0.95,
  },

  // Label positioned on arc around cluster
  label: {
    fontSize: 14,
    fontWeight: 500,
    fontFamily: 'Google Sans Flex',
    fill: '#FFFFFF',
    opacity: 0.85,
    // Arc placement: distance from cluster node edge
    arcDistance: 20, // px beyond cluster circle
    // Hemisphere-aware: left side text reads left→right, right side reads right→left
  },
}

// ============================================================================
// CONNECTION STYLING
// ============================================================================
// Links between rings (not the same as Unstructured's center-offset connections)

export const STRUCTURED_CONNECTIONS = {
  // Edge-bundling pull toward the graph center (0–1). Shared by BOTH the
  // curve drawing (renderRadialConnections) and the endpoint geometry
  // (useStructuredGeometry), so the perimeter intersection is computed from
  // the same departure direction the Bézier actually takes.
  bundleStrength: 0.6,

  // Foreground link (sharp luminous line)
  foreground: {
    strokeWidth: 1,
    stroke: 'url(#link-gradient-foreground)',
    opacity: 0.9,
  },

  // Background link (blurred atmospheric glow)
  background: {
    strokeWidth: 1.5,
    stroke: 'url(#link-gradient-background)',
    opacity: 0.25,
  },

  // Endpoint circles
  endpoints: {
    radius: 0.5,
    fill: '#FFFFFF',
    opacity: 1.0,
  },
}

// ============================================================================
// CLUSTER → ENTITY BRIDGE
// ============================================================================
// The single direct radial connector from each cluster node to its entity
// summary node, carrying the confidence badge (percentage + battery, which
// reuse the ENTITY_RING styling tokens).

export const CLUSTER_ENTITY_BRIDGE = {
  stroke: 'rgba(255, 255, 255, 0.35)',
  strokeWidth: 1,

  badge: {
    // Quiet backing panel behind the % + battery so they read over the line
    width: 40,
    height: 28,
    borderRadius: 4,
    fill: 'rgba(12, 19, 17, 0.85)', // theme gray4 tone, near-opaque
    // Vertical offsets from the badge center (in the rotated spoke frame)
    textOffsetY: 6, // percentage baseline sits slightly above center
    batteryOffsetY: 3, // battery top edge sits slightly below center
  },
}

// ============================================================================
// VIEWPORT & POSITIONING
// ============================================================================
// Coordinate system and layout bounds

export const STRUCTURED_VIEWPORT = {
  // Data coordinate space (matches Unstructured for consistency)
  dataWidth: 800,
  dataHeight: 600,

  // Center of the coordinate system (same as Unstructured)
  centerX: 800 / 2, // 400
  centerY: 600 / 2, // 300

  // Furthest visual extent from the graph origin: the cluster ring's radial
  // category labels start at 420 (labelRadius in renderClusterRing) and
  // extend up to ~70px of text outward. The Structured initial camera
  // (NetworkGraphD3.computeInitialTransform, structured branch) centers and
  // fits THIS radius — never the Unstructured camera or container-px math.
  outerRadius: 490,
  // Breathing room (data units) kept around the outer radius when fitting.
  fitPadding: 10,
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the structured ring distance for a node type.
 * Maps node.kind to its ring orbit distance.
 */
export function getStructuredRingDistance(nodeType: string): number {
  const rings = STRUCTURED_RINGS as Record<string, number>
  return rings[nodeType] || STRUCTURED_RINGS.cluster
}

/**
 * Get the fixed node size for a node type (diameter).
 * Structured view uses uniform sizes, unlike Unstructured's variable sizing.
 */
export function getStructuredNodeSize(nodeType: string): number {
  const sizes = STRUCTURED_NODE_SIZES as Record<string, number>
  return sizes[nodeType] || 20
}

/**
 * Get node radius from type (half of diameter).
 */
export function getStructuredNodeRadius(nodeType: string): number {
  return getStructuredNodeSize(nodeType) / 2
}
