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

  // Avatar styling (will use theme colors via chartTheme)
  fill: 'theme', // Will resolve via useChartTheme()
  stroke: '#9D7EEA',
  strokeWidth: 2,

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

  // Percentage text (e.g., "75%")
  percentage: {
    fontSize: 14,
    fontWeight: 500,
    fontFamily: 'Google Sans Flex',
    fill: '#FFFFFF',
    marginTop: 4, // Distance below gauge
  },

  // "Sentiment Rate" label
  label: {
    fontSize: 12,
    fontWeight: 400,
    fontFamily: 'Google Sans Flex',
    fill: 'rgba(255, 255, 255, 0.7)',
    text: 'Sentiment Rate',
    marginTop: 2, // Distance below percentage
  },
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
  fill: 'theme', // Will resolve via chartTheme (categorical[1])
  stroke: 'none',
  strokeWidth: 0,

  // Count text inside circle (e.g., "7")
  count: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'Google Sans Flex',
    fill: '#FFFFFF',
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
