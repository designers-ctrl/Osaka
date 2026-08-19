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
// - Source: Fixed size (12px) — ALWAYS the smallest node kind
// - Entity: Fixed size (20px)
// - Cluster: Variable size (scales with entity count)
// - Insight: Variable size (based on confidence/signals)
// - Document: Fixed size (12px, same as source)
//
// ── SIZE HIERARCHY (enforced at every zoom level) ──
//
//   Source (12) < Cluster (14 → 20) < Insight (24 → 50)
//
// The load-bearing rule is  max(Cluster) < min(Insight)  — 20 < 24 — so the
// LARGEST cluster is still smaller than the SMALLEST insight. Previously the
// cluster ceiling was 60, which meant a well-populated cluster outgrew every
// insight and inverted the hierarchy; the ceiling is now the binding constraint
// on cluster growth, with entity-count/weight scaling living inside it.
//
// Why this holds at EVERY zoom, with no maximum screen clamp (which would fight
// zoom-aware sizing by freezing clusters as you zoom in):
//   • k ≥ 1   — cluster ≤ 10r, insight ≥ 12r.                         ✓
//   • k < 1   — the per-kind minimum SCREEN clamps take over, and they are
//               ordered the same way (12 / 14 / 24), so cluster ≤ max(10, 7/k)
//               and insight ≥ max(12, 12/k) stay ordered for every k.  ✓
// Both kinds scale with k identically, so the data-space ordering is preserved
// rather than re-derived per zoom level.

export const NODE_DIAMETERS = {
  // Inner ring: Sources (FIXED SIZE — the smallest node kind by design)
  source: 12, // Container diameter for sources (icon + border)

  // Middle ring: Entity Clusters (VARIABLE SIZE - use getClusterDiameter())
  // Clusters are semantic containers whose size scales with entity count
  cluster: 30, // Base/minimum cluster diameter (DEPRECATED: use getClusterDiameter())
  entity: 20, // Individual entity diameter (FIXED SIZE)

  // Outer ring: Insights (VARIABLE SIZE - use getInsightDiameter())
  insight: 35, // Base insight diameter (DEPRECATED: use getInsightDiameter())

  // Support nodes
  document: 12, // Same as source - unified component (FIXED SIZE)
}

// ============================================================================
// CLUSTER SIZING - Dynamic based on contained entities/weight
// ============================================================================
// Clusters are semantic containers: size represents content strength/emphasis.
// graphTokens defines ONLY: min radius, max radius, padding.
// Actual radius is computed from cluster contents (entityCount or weight property).

export const CLUSTER_SIZING = {
  /*
   * The cluster's size WINDOW, written as diameters because that is what the
   * hierarchy rule is stated in:
   *
   *   minDiameter 14  — one step above the 12px source, so even the weakest
   *                     cluster is strictly larger than a source;
   *   maxDiameter 20  — strictly BELOW INSIGHT_SIZING.minDiameter (24), which
   *                     is the whole point: no cluster, however many entities
   *                     it holds, can reach the smallest insight.
   *
   * Entity-count/weight scaling still drives the size — it just happens inside
   * this window (see getClusterRadius), so a heavier cluster still reads as
   * heavier, just never as an insight.
   */
  minDiameter: 14,
  maxDiameter: 20,
  // Radii are DERIVED, so the window above is the only place to edit.
  minRadius: 14 / 2,
  maxRadius: 20 / 2,
  // Minimum ON-SCREEN diameter: like SOURCE_NODES.minDiameter, but one step
  // larger, so zooming out never renders a cluster smaller than a source.
  // Deliberately NO maximum screen clamp — that would stop clusters growing as
  // you zoom in. The ordering is held by the data-space ceiling instead.
  minScreenDiameter: 14,
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
  /*
   * The insight's size window. `minDiameter` is the top of the hierarchy ladder
   * and must stay STRICTLY GREATER than CLUSTER_SIZING.maxDiameter (20) — that
   * single inequality is what makes an insight always readable as the largest
   * kind, whatever its confidence and however many entities a cluster holds.
   */
  minDiameter: 24, // Minimum size for weak insights — must exceed cluster max
  maxDiameter: 50, // Maximum size for strong insights
  // Minimum ON-SCREEN diameter — the top step of the per-kind clamp ladder
  // (source 12 < cluster 14 < insight 24), holding the hierarchy at low zoom.
  minScreenDiameter: 24,

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
  // sizeValue=1 → ~24px, sizeValue=14 → ~50px
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
// BOTH hub icon kinds derive from their (min-screen-clamped) node circle so
// they scale naturally with zoom and never render tiny. BOTH kinds are
// full-bleed tiles that fill their circle EDGE TO EDGE (30/30) and are clipped
// round — see getSourceIconDiameter / getDocumentIconDiameter.

/**
 * Inner gap between the source icon and the circle boundary, per side.
 *
 * ZERO by design: the source assets are full-bleed brand tiles, so the image
 * fills the node EDGE TO EDGE (icon diameter = node diameter) and the circle
 * is clipped round around it — see the source-icon clipPath in
 * NetworkGraphD3.vue. Raising this re-introduces a visible ring of canvas
 * between the logo and the node edge.
 */
export const SOURCE_ICON_PADDING = 0

export const ICON_CONFIG = {
  source: {
    // The FULL node circle: 30px diameter − 2 × 0px padding = 30px, so the
    // logo tile reaches the node edge with no inner padding.
    iconSize: NODE_DIAMETERS.source - SOURCE_ICON_PADDING * 2, // px at 1.0 zoom
    opacity: 0.95,
  },

  document: {
    // The FULL node circle, like the source tiles: the document asset
    // (`Document Logo.svg`) is a full-bleed tile too, so it fills the node
    // edge to edge with zero inner padding and is clipped round. The rendered
    // size still derives from the clamped hub circle via
    // getDocumentIconDiameter, so the minimum on-screen size is unchanged.
    iconSize: NODE_DIAMETERS.document, // px at 1.0 zoom (0 inner padding)
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

/**
 * Mix a hex colour toward another by `amount` (0–1). Used to DERIVE hover
 * variants from the design system's accent tokens rather than inventing new
 * hexes: the base accents stay the single source of truth, and a rebrand moves
 * the hover states with them automatically.
 */
export function mixHex(from: string, to: string, amount: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
    const n = parseInt(full, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const a = parse(from)
  const b = parse(to)
  const k = Math.max(0, Math.min(1, amount))
  const ch = (i: number) => Math.round(a[i] + (b[i] - a[i]) * k)
  return `#${[ch(0), ch(1), ch(2)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

/** Yellow/Accent 1 + 2 — mirrored from vuetify.ts (see NODE_STYLING.insight). */
const YELLOW_ACCENT_1 = '#F2C585'
const YELLOW_ACCENT_2 = '#7C6749'

/**
 * HOVER on a normal (collapsed) node in the Unstructured graph: the existing
 * brightness lift plus a soft white glow.
 *
 * Colour comes from the design system's white token — `button-white-100`, read
 * live as a theme triplet so a rebrand carries it — at the spec'd 0.35 alpha.
 * (The white ramp has 5/10/20/60/80/100 steps but no 35, so the alpha is
 * applied to the token rather than inventing a new colour.)
 *
 * Applied as a CSS `filter` (verified to render on these SVG circles, unlike
 * `box-shadow`), chained after the brightness so both effects survive. Insight
 * nodes are EXCLUDED: they already own a warm-white hover glow through their
 * own SVG filter (NODE_STYLING.insight.hover), and a second white glow would
 * fight it on the same property.
 */
/**
 * The luminous paint server every connection in the app is stroked with.
 *
 * Declared here (id + stops) rather than inline in one renderer because BOTH
 * graph modes need the same paint: the Unstructured graph builds it in its
 * <defs>, and the Structured renderer — which clears the SVG and builds its
 * own — creates the identical def from this token, so an expanded-entity
 * relation and a Structured connection are literally the same stroke instead
 * of two hand-matched approximations.
 */
export const LINK_GRADIENT = {
  foreground: {
    id: 'link-gradient-foreground',
    stops: [
      { offset: '0%', color: '#FFFFFF', opacity: 0.2 },
      { offset: '40%', color: '#FFFFFF', opacity: 0.8 },
      { offset: '60%', color: '#FFFFFF', opacity: 0.8 },
      { offset: '100%', color: '#FFFFFF', opacity: 0.2 },
    ],
  },
  background: {
    id: 'link-gradient-background',
    stops: [
      { offset: '0%', color: '#949B99', opacity: 0.2 },
      { offset: '48%', color: '#949B99', opacity: 0.08 },
      { offset: '99%', color: '#949B99', opacity: 0.2 },
    ],
  },
}

export const NODE_HOVER = {
  /** Existing lift — kept so hover behaviour is added to, not replaced. */
  brightness: 1.2,
  glow: {
    blur: 6, // px, CSS drop-shadow blur radius
    color: 'rgba(var(--v-theme-button-white-100), 0.35)',
  },
  /** Fade the glow in/out rather than snapping it. */
  transition: '0.18s ease',
}

export const NODE_STYLING = {
  source: {
    /*
     * TRANSPARENT, not `none`: a source's surface IS its full-bleed logo tile
     * (SOURCE_ICON_PADDING = 0, clipped round), so the circle must add no
     * colour of its own — the old translucent purple sat ON TOP of the image
     * and tinted every brand colour.
     *
     * It must be `transparent` rather than `none` because SVG hit-testing is
     * `visiblePainted`: with `fill: none` the interior is UNPAINTED, so the
     * circle only received pointer events on its 1px stroke ring — hover and
     * drag both went dead in the middle of every Source. A transparent paint
     * is still a paint, so the whole disc stays interactive while showing the
     * logo untouched. (The icon image itself is pointer-events: none, so it
     * never intercepts.)
     */
    fill: 'transparent',
    // Subtle neutral ring: theme gray1 (#949B99) at 0.45, mirrored as a
    // literal (D3 writes SVG attrs, where var() does not substitute).
    stroke: 'rgba(148, 155, 153, 0.45)',
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
    /*
     * EXPLICIT, not 'theme'. Per DESIGNER_HANDOFF this block is the single
     * source of truth for Insight colours in BOTH views, so the fill is named
     * here rather than borrowed from chartTheme.categorical[0] (same value
     * today, but that palette's ORDER is load-bearing for charts and may be
     * re-tuned — an Insight must not change colour when it is).
     *
     * Both values are the design system's yellow accents, mirrored from
     * vuetify.ts: fill = Yellow/Accent 1 (`button-outlined-accent-1`),
     * stroke = Yellow/Accent 2 (`button-outlined-accent-2`). D3 writes SVG
     * presentation attributes, which cannot resolve a CSS var(), so the hex
     * lives here — keep the two in sync on a rebrand.
     */
    fill: YELLOW_ACCENT_1,
    stroke: YELLOW_ACCENT_2,
    /**
     * Target border thickness (rendered px at zoom 1). Unlike the other node
     * kinds this is NOT plain inverse-zoom compensated — see `strokeScreen`.
     */
    strokeWidth: 2,
    /**
     * RENDERED-THICKNESS CLAMP (see getNodeStrokeWidth).
     *
     * Plain inverse-zoom compensation pinned the border to a constant
     * on-screen width, which reads too thin once the node itself is large:
     * the ring stops keeping up with the circle it outlines. Instead the
     * stroke scales WITH the node (constant in data space) and is then
     * clamped in rendered space:
     *
     *   rendered = clamp(strokeWidth × zoomScale, min, max)
     *   attribute = rendered / zoomScale
     *
     * so it can never render thinner than `min` however far the canvas is
     * zoomed out, and thickens with the node only up to `max`.
     */
    strokeScreen: { min: 2, max: 3 },
    strokeDasharray: 'none',
    /**
     * HOVER: a brighter node and a stronger, near-white glow — both DERIVED
     * from the accent tokens (mixHex), never new hand-picked hexes.
     * `fill` lifts a little toward white so the node reads brighter while
     * staying clearly yellow; the glow shifts warm-white and widens, which is
     * what makes a hovered Insight pop without washing out its border (the
     * stroke deliberately stays the accent colour, so the edge stays crisp).
     */
    hover: {
      fill: mixHex(YELLOW_ACCENT_1, '#FFFFFF', 0.35),
      glow: {
        blur: 12, // px, CSS drop-shadow blur radius (2× the resting glow)
        color: mixHex(YELLOW_ACCENT_1, '#FFFFFF', 0.55), // warm white
        opacity: 1,
        regionMargin: 1, // wider blur needs a wider filter region
      },
      /** Fill/stroke transition for the normal ⇄ hover swap. */
      transition: '0.18s ease',
    },
    /**
     * The warm glow around an Insight, drawn as an SVG <filter> (feDropShadow)
     * because a CSS `filter` on a D3-managed SVG shape is fragile — see the
     * `insight-shadow` def in NetworkGraphD3.vue.
     *
     * `blur` is the CSS drop-shadow blur RADIUS, so the filter halves it for
     * feDropShadow's stdDeviation (CSS blur = 2 × stdDeviation) and the pair
     * stays readable against the design spec:
     *   drop-shadow(0 0 6px #7C6749)
     */
    glow: {
      blur: 6, // px, CSS drop-shadow blur radius
      color: YELLOW_ACCENT_2,
      opacity: 1,
      /**
       * Filter REGION, as a share of the shape's bounding box. The default
       * SVG region (−10% … 120%) is only ~2px of margin on a 20px insight,
       * which CLIPPED the glow to a hard square and made it read as "the
       * drop-shadow is being ignored". Generous margins cost nothing here
       * (there are ~12 insights) and let the full blur render.
       */
      regionMargin: 0.75, // → x/y = −75%, width/height = 250%
    },
  },

  document: {
    // TRANSPARENT like `source`: a document hub's surface is its dark tile
    // (sourceNodeIcons.documentNodeIconFor) — the circle only carries the
    // stroke and pointer events, and must never cover the tile.
    fill: 'transparent',
    // Same neutral gray1-mirror ring as source hubs.
    stroke: 'rgba(148, 155, 153, 0.45)',
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
  /*
   * RESTING label opacity in the default (collapsed) Unstructured view: hidden.
   *
   * A graph at rest is a shape — nodes, groups and the lines between them. Every
   * hub carrying its id as text turned that shape into a wall of words, so
   * labels are now REVEALED rather than dimmed: nothing at rest, full
   * `source.opacity` / `document.opacity` for the hovered node and its
   * neighbours (see applyLabelSelection). The text stays in the DOM with its
   * data intact, so nothing about the node set, hit-testing or the expanded
   * view changes — only whether the glyphs paint.
   */
  restingOpacity: 0,

  source: {
    position: 'right', // Always positioned to the right of node circle
    fontFamily: 'Google Sans Flex',
    fontSize: 14, // ABSOLUTE font size - independent of node size (40px)
    minFontSize: 11, // On-screen floor: labels shrink with zoom-out but never render below 11px
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
    minFontSize: 11, // On-screen floor: labels shrink with zoom-out but never render below 11px
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
  // Node charge (repulsion): negative = repels.
  // Tuned for a COHESIVE graph: softer charge and a much shorter range so
  // separated hub groups stop repelling each other across the canvas —
  // local spacing still comes from charge + collision at close range.
  chargeStrength: -130,
  chargeDistanceMax: 380, // was 500: long-range repulsion made isolated islands

  // Gentle global gravity toward the canvas center (forceX/forceY): pulls
  // hub groups that share no links into one connected composition instead
  // of drifting apart. Small on purpose — grouping still comes from links.
  centerPullStrength: 0.025,

  // Hub-group separation: each hub + its cluster orbit is treated as a
  // GROUP ENVELOPE (orbit radius + that hub's largest cluster radius), and
  // two envelopes may never get closer than this visible gap. The per-pair
  // minimum hub distance is envelopeA + envelopeB + hubGroupGap — computed
  // live in forceHubSeparation, never a fixed number, so bigger clusters
  // automatically earn more breathing room.
  //
  // ⚠️ COUPLED TO clusterOrbitRadius. The envelope is derived from the orbit
  // (buildHubEnvelopes), so pulling clusters closer to their Source shrinks
  // every envelope and would drag the GROUPS together as a side effect. This
  // gap absorbs that: it has been raised in step with every orbit reduction
  // (80 → 146 → 182 as the orbit came 95 → 62 → 44), holding the per-pair
  // minimum at the same ~290 units throughout — 54 + 54 + 182 today, against
  // the original 105 + 105 + 80. Change one, re-check the other: the number
  // that matters is the SUM, never this value on its own.
  hubGroupGap: 182,
  hubSeparationStrength: 0.5,

  // Insight placement: every insight eases toward the live barycenter of the
  // nodes it connects, so it sits BETWEEN its partners and its straight links
  // take the shortest path instead of stretching past unrelated clusters.
  // The collision force resolves the nearest free position around that
  // target; the cluster-orbit facing logic then points connected clusters at
  // the settled insight — the Source → Cluster → Insight chain aligns.
  /**
   * How far an insight leans from the plain barycentre of its partners toward
   * its assigned ANCHOR group (0 = pure barycentre, 1 = sit on the anchor).
   * 0.45 spreads insights across the groups they belong to while keeping them
   * visibly between their partners.
   */
  insightAnchorBias: 0.45,
  /** Minimum distance between two insights before they push apart (units). */
  insightSeparation: 190,
  /**
   * Strength of that push — firm, since insights are sparse and high-value.
   * Raised 0.55 → 0.8 when the cluster orbit tightened: a more compact layout
   * packs everything closer, and at the old strength the barycentre and
   * community pulls were overpowering the separation (closest pair fell from
   * 149 to 114 units). This restores the spacing without loosening the groups.
   */
  insightSeparationStrength: 0.8,
  insightBarycenterStrength: 0.15,

  // Two-cluster hubs: a pair is arranged as a compact V flanking the
  // direction of its external connections (never a flat 180° opposition).
  // Full angle between the two arms, in degrees.
  twoClusterVAngleDeg: 70,

  // Multi-group insight communities: an insight linking 3+ different hub
  // groups pulls those hubs gently toward itself (hubSeparation still floors
  // their pairwise distance), and pushes UNRELATED hubs out of the corridor
  // so nothing unrelated sits between the connected groups.
  communityPullStrength: 0.035,
  communityClearance: 150, // unrelated hub center must stay this far (+ envelope) from the insight
  communityRepelStrength: 0.25,

  // Insight ↔ group-envelope separation: the Source orbit belongs to
  // CLUSTERS exclusively. Every insight must stay outside every group's
  // envelope (orbit radius + largest cluster radius) by this visible gap —
  // it may face a ring from outside, never complete it. Applied as a
  // POSITIONAL projection (fraction of the penetration corrected per tick),
  // so link tension can never hold an insight inside a ring at equilibrium.
  insightEnvelopeGap: 24,
  insightEnvelopeStrength: 0.6,

  // Insight ↔ LINK clearance: an insight must also stay off every straight
  // connection it is not an endpoint of. Collision keeps node off NODE; this
  // keeps node off LINE, which is the other half of "a link never crosses
  // something unrelated". Positional projection, insight-side only — link
  // geometry and group spacing are never touched.
  insightLinkClearance: 6,
  insightLinkClearanceStrength: 0.35,

  // Link forces: different strengths for different link types
  linkStrength: 0.3, // Default link strength for influence connections
  linkDistance: 100, // Default distance between linked nodes

  // Source-Cluster bonds (kind='overlap') must be MUCH STRONGER
  // Clusters are neighborhood around their Source - they must stay bound
  clusterBondStrength: 0.8, // 2.67x stronger than default (0.3)
  // Shorter than the default link (100): a cluster is a neighbourhood AROUND
  // its Source, so the bond reads as attachment rather than as a connection
  // between two independent things. Tightened 85 → 55 → 36 — the Source→Cluster
  // lines were stretching well past what the relationship implies. Group-to-
  // group spacing is deliberately NOT reduced with it (see hubGroupGap).
  clusterBondDistance: 36,

  // Radial cluster organization: a gentle positional force distributes each
  // hub's clusters into EVEN angular slots on a consistent orbit around it
  // (see forceClusterOrbit in useD3Force.ts). Soft on purpose — it organizes
  // the neighborhood without making the layout rigid, and drag stays natural.
  // Matches where the bond distance + collision settle, so the orbit and the
  // link force agree instead of fighting. Tightened 95 → 62 → 44 alongside
  // clusterBondDistance; see the hubGroupGap note for why group spacing did
  // not follow it down.
  //
  // ⚠️ PACKING FLOOR ≈ 35. The busiest hub carries 7 clusters, and a ring of
  // radius r spaces them by a chord of 2·r·sin(π/7) ≈ 0.87·r. That has to clear
  // one cluster diameter (20) plus nodeCollisionGap (10), so r below ~35 makes
  // the collision force fight the orbit and the ring buckles. 44 leaves a
  // ~38-unit pitch — comfortably clear, with room to spare.
  clusterOrbitRadius: 44,
  clusterOrbitStrength: 0.32, // per-tick pull toward the slot (× alpha)

  // Meaningful cross-group links — links through an Insight, or directly
  // bridging different Source/Document neighborhoods — are pulled TIGHTER
  // than generic influence links so related groups sit noticeably closer
  // instead of stretching across the canvas. Groups still stay distinct:
  // charge repulsion and the orbit rings keep neighborhoods separated.
  crossGroupDistance: 90, // vs linkDistance 100
  crossGroupStrength: 0.45, // vs linkStrength 0.3

  // Center attraction (pulls all nodes toward center)
  nodeStrength: -250,

  // ── COLLISION ────────────────────────────────────────────────────────────
  // Overlap protection covers EVERY visible node kind (source, cluster,
  // insight, document) and is driven by each node's ACTUAL rendered radius
  // (getEffectiveNodeRadius — weight-sized clusters, size-sized insights),
  // not the base per-kind diameter: a size-14 insight renders at r=25 but
  // the kind default is r=17.5, which is exactly how two big insights ended
  // up overlapping. `nodeCollisionGap` is the visible breathing room kept
  // between two circle edges.
  nodeCollisionGap: 10, // visible gap between node edges (8–12 band)
  collisionStrength: 0.9, // near-hard constraint; 1 can jitter
  collisionIterations: 2, // relaxation passes per tick — resolves stacks

  // ── SETTLING ─────────────────────────────────────────────────────────────
  // The graph is pre-solved and warmed up OFF-SCREEN (see seedInitialLayout /
  // warmupSimulation in useD3Force.ts), so the first paint is already close
  // to the final layout. What runs after that is a short, low-alpha polish —
  // not a visible multi-second reflow.
  //
  // alphaDecay only governs the FREE cooldown; a drag pins alpha via
  // alphaTarget(0.3), so raising it speeds settling without stiffening drag.
  // velocityDecay stays close to D3's 0.4 default for the same reason.
  // 160 measured as the knee: identical final geometry (0 overlaps, 0
  // crossings, same ~3px post-paint drift) as 240, at two thirds the
  // pre-paint cost. The whole pre-solve runs in ~110ms on the demo graph.
  warmupTicks: 160, // deterministic pre-render ticks (D3's own default run ≈ 300)
  initialSettleAlpha: 0.12, // low-alpha restart after the warm-up render
  alphaDecay: 0.045, // ~2× D3's 0.0228 → cools in ~150 ticks, not ~300
  velocityDecay: 0.45, // slightly damper than 0.4: less overshoot, drag still fluid

  // ── INSIGHT PRE-SOLVE (candidate scoring) ────────────────────────────────
  // Before the simulation runs, every insight is placed by evaluating
  // candidate positions around the barycenter of the nodes it actually
  // connects to, and keeping the cheapest. Cost weights are ordered by what
  // must never happen: a link crossing an unrelated node dwarfs everything,
  // then node overlap, then envelope intrusion, then link length.
  seedMargin: 40, // keep seeded positions this far inside the data space
  insightCandidateAngles: 16, // candidate directions per ring
  insightCandidateRadii: [0, 26, 52, 84, 124, 170], // ring offsets from the barycenter
  insightSeedRounds: 2, // re-solve so insight↔insight pairs converge
  seedCrossingClearance: 10, // a link must clear an unrelated circle by this
  seedCostCrossing: 1000, // per unrelated node a straight link would cut
  seedCostInsightOverlap: 24, // per unit of overlap with another insight
  seedCostEnvelope: 14, // per unit of intrusion into a hub's group envelope
  seedCostLength: 1, // per unit of total connection length

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
// CANVAS BACKDROP
// ============================================================================
// The dot grid behind the graph. These are SCREEN pixels, not data-space units.
//
// It used to be an SVG <pattern> inside the graph's viewBox, which meant the
// browser scaled it by the same factor it uses to fit the 800×600 data space
// into the container — so the dots grew with the window and looked coarse on a
// large display. It is now painted in CSS on the graph's container element,
// where a px is a px at every viewport size. Tune the grid here; the component
// binds these into its stylesheet.

// The 20/1.5 pair below is what the OLD SVG pattern used in data space; the
// viewBox then blew it up by the container/800 ratio — about 1.6× on a laptop —
// so the dots that shipped were ~2.4px on a ~32px grid. Painting in CSS removed
// that multiplier, and at 1.5px the grid stopped registering. These are the
// screen-px equivalents of what the scaled version actually drew.
export const BACKGROUND_PATTERN = {
  spacing: 16, // Distance between dot centers, both axes — half of 32, so twice the dots per axis
  dotRadius: 1.2, // Radius of a single dot — half of 2.4
  feather: 0.5, // Extra px the dot fades over, so the edge isn't aliased
  /*
   * NO `color` here on purpose. The ink is the `background` theme token, read
   * live from Vuetify in the component's stylesheet so it follows a theme swap;
   * only this alpha crosses over from the tokens file. The grid therefore reads
   * as a darker grain over the host canvas, strongest where that canvas is
   * lightest. At full alpha each dot IS the background token, so the grid
   * punches the canvas gradient back to page black rather than tinting it.
   */
  opacity: 1,
}

// ============================================================================
// NODE BACKDROP GLASS — the frosted disc behind every .node-circle
// ============================================================================
/*
 * A 2px blur of whatever is visible BEHIND a node's semi-transparent fill
 * (the container's dot grid and the host screen's canvas gradient). The node
 * itself, its stroke, its glow, its icon and its label are never blurred —
 * they are drawn in the <svg>, which paints ON TOP of this layer.
 *
 * ⚠️ WHY THIS IS A CSS LAYER AND NOT AN SVG FILTER — measured, not assumed:
 *
 * 1. `backdrop-filter` on an SVG `<circle>` (or a `<g>` wrapping it) does
 *    NOTHING in Blink/WebKit. Verified against a hard-edged stripe backdrop:
 *    an HTML control element blurred it (20/110 mid-tone pixels across a
 *    stripe edge), both SVG variants produced 0. The property would have been
 *    inert on `.node-circle`.
 * 2. SVG 1.1's `<feGaussianBlur in="BackgroundImage">` — the SVG-native way to
 *    read the backdrop — also measured 0. It never shipped in Blink/WebKit and
 *    was dropped from SVG 2.
 * 3. An SVG filter over a duplicated backdrop layer would have nothing to
 *    blur: `getConnectionEndpoints()` trims every link to `radius + gap`, so
 *    links stop AT node boundaries and never pass behind a disc, and the
 *    collision force keeps nodes off each other. The only thing actually
 *    visible through a node's 10%-alpha fill is the container's CSS dot grid,
 *    which no SVG filter can sample (it is painted outside the <svg>).
 *
 * So the glass is ONE HTML element with a real `backdrop-filter`, layered
 * between the container's background and the <svg>, and clipped to the union
 * of every node circle with a single `clip-path: path(…)` — one style write
 * per frame, no per-node elements and no per-node filters.
 */
export const NODE_GLASS = {
  /**
   * Blur radius in CSS px. `backdrop-filter: blur()` works in SCREEN pixels,
   * so this stays a constant 2px at every zoom level for free — no
   * inverse-zoom compensation, unlike the SVG-space tokens above.
   */
  blurPx: 2,
  /** Decimal places kept in the clip-path string (smaller = shorter style). */
  pathPrecision: 2,
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
    // Structured mode only: legacy container-fit multiplier (unstructured uses fitPadding below)
    marginMultiplier: 0.28,
    // Unstructured mode: padding (in data units) added around the rendered graph
    // bounds when computing the first-load / reset fit-to-view transform
    fitPadding: 60,
  },

  /*
   * SOURCE FOCUS — clicking a Source in Unstructured mode flies the camera to
   * that Source and the Clusters bound to it, and to nothing else.
   *
   * The fit is computed from ONLY those nodes, so unrelated groups are allowed
   * to fall outside the viewport: including them is what would force the camera
   * back out and defeat the gesture. `maxScale` stops a small group (a document
   * hub with two clusters) from filling the screen at an absurd magnification.
   */
  sourceFocus: {
    /** Breathing room in data units around the focused group's bounds. */
    padding: 70,
    /** Ceiling on the fitted scale — a tiny group must not zoom to a wall. */
    maxScale: 2.2,
    /** Camera flight time (ms). */
    durationMs: 620,
  },

  // D3 zoom extent [minZoom, maxZoom]
  // Min must stay at or below the initial framing scale (marginMultiplier above),
  // otherwise the first zoom gesture snaps the camera in past the initial view.
  // The absolute token minimum is a FALLBACK: each layout mode clamps its own
  // effective minimum at setup (see the scaleExtent derivation in
  // NetworkGraphD3) — Structured to the exact fit scale, Unstructured to
  // fit × minZoomOutFactor below.
  zoomExtent: [0.25, 4] as [number, number],

  // Unstructured: the deepest zoom-OUT allowed, as a factor of the initial
  // fit-to-view scale. 0.8 leaves a little breathing room past the full-graph
  // framing but stops the graph from shrinking into an unreadable speck.
  // Clamps gestures only (wheel, pinch, the − button via scaleBy) — the
  // initial fit itself is applied with zoom.transform, which d3 never clamps,
  // so the first-entry framing is unchanged.
  minZoomOutFactor: 0.8,

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
  // Minimum ON-SCREEN diameter for a source node: when zooming out, the circle
  // (and its icon, proportionally) stops shrinking at 12 × 12 rendered pixels.
  // The BOTTOM of the per-kind clamp ladder (12 < cluster 14 < insight 24) —
  // sources stay the smallest node kind at every zoom level.
  minDiameter: 12,
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
  const base = typeof styling.strokeWidth === 'function'
    ? styling.strokeWidth()
    : (styling.strokeWidth || 0)

  /*
   * A kind carrying `strokeScreen` opts OUT of flat inverse-zoom compensation
   * and into a clamped rendered thickness (Insight — see its token block):
   * the stroke tracks the node's visual size but can never render thinner
   * than `min` or thicker than `max`. The returned value is the ATTRIBUTE, so
   * it is divided back out of the live zoom transform.
   */
  const clamp = (styling as { strokeScreen?: { min: number, max: number } }).strokeScreen
  if (clamp) {
    const k = zoomScale > 0 ? zoomScale : 1
    const rendered = Math.min(Math.max(base * k, clamp.min), clamp.max)
    return rendered / k
  }

  return base * getInverseZoomScale(zoomScale)
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
 * Source/document label font size: scales naturally with zoom (bigger when
 * zoomed in, progressively smaller when zoomed out) but never renders below the
 * on-screen minimum. Returned value is in data units; rendered px =
 * value * zoomScale, so clamping at minFontSize / zoomScale pins the floor.
 */
export function getScaledLabelFontSize(
  nodeType: 'source' | 'document',
  zoomScale: number = 1,
): number {
  const { fontSize, minFontSize } = TYPOGRAPHY[nodeType]
  const k = zoomScale > 0 ? zoomScale : 1
  return Math.max(fontSize, minFontSize / k)
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

/**
 * Source node circle radius (data units): the base radius at normal zoom, but
 * clamped so the RENDERED diameter never drops below SOURCE_NODES.minDiameter
 * (16px on screen) when zooming out. Link connection geometry must use this
 * same clamped radius — see getEffectiveNodeRadius(), the single source of
 * truth both the circle rendering and getConnectionEndpoints() read from.
 */
export function getSourceNodeRadius(zoomScale: number = 1): number {
  const baseRadius = NODE_DIAMETERS.source / 2
  const k = zoomScale > 0 ? zoomScale : 1
  return Math.max(baseRadius, (SOURCE_NODES.minDiameter / 2) / k)
}

/**
 * THE single source of truth for a node's effective rendered radius (data
 * units) at a given zoom level. Both the node-circle rendering AND the link
 * endpoint geometry (getConnectionEndpoints call sites) must derive radii
 * from here — if the two ever use different values, links visually run
 * under/into the circles (the low-zoom endpoint bug this consolidates away).
 *
 * Per node type:
 * - source:  base radius, clamped to a 12px minimum SCREEN diameter → grows
 *            in data units as zoom decreases
 * - cluster: dynamic from weight (preferred) or entityCount, clamped to a
 *            14px minimum SCREEN diameter
 * - insight: dynamic from its size metric, clamped to a 24px minimum SCREEN
 *            diameter
 * - others:  fixed per-type diameter
 *
 * The three clamps are ordered (12 < 14 < 24) exactly like the three base
 * ranges (12 < 14–60 < 24–50 minimums), which is what enforces the
 * Source < Cluster < Insight hierarchy at EVERY zoom level — without the
 * cluster/insight clamps, zooming out shrank variable-size nodes below the
 * screen-clamped sources and inverted the hierarchy.
 */
export function getEffectiveNodeRadius(
  node: { kind?: string, size?: number } & Record<string, any>,
  zoomScale: number = 1,
): number {
  const kind = node.kind || ''
  const k = zoomScale > 0 ? zoomScale : 1
  // Source AND document hubs share the same base diameter (12) and the same
  // 12px minimum screen size — document hubs are hub nodes exactly like
  // sources, and clamping only one of the two left document circles (and
  // their icons) visibly smaller at low zoom.
  if (kind === 'source' || kind === 'document') {
    return getSourceNodeRadius(zoomScale)
  }
  if (kind === 'cluster') {
    const dataRadius = node.weight !== undefined
      ? getNodeRadiusForType(kind, node.weight, true)
      : node.entityCount !== undefined
        ? getNodeRadiusForType(kind, node.entityCount, false)
        : getNodeRadiusForType(kind)
    return Math.max(dataRadius, (CLUSTER_SIZING.minScreenDiameter / 2) / k)
  }
  if (kind === 'insight') {
    const dataRadius = node.size
      ? getNodeRadiusForType(kind, node.size)
      : getNodeRadiusForType(kind)
    return Math.max(dataRadius, (INSIGHT_SIZING.minScreenDiameter / 2) / k)
  }
  return getNodeRadiusForType(kind)
}

/**
 * Source icon diameter (data units), derived from the clamped node radius so
 * `icon + 2 × padding = node diameter` holds at every zoom level: the icon
 * scales naturally with the node and shares its 16px-minimum clamp, keeping
 * the small safe gap to the stroke proportional and clip-free.
 */
export function getSourceIconDiameter(zoomScale: number = 1): number {
  const iconRatio = ICON_CONFIG.source.iconSize / NODE_DIAMETERS.source
  return getSourceNodeRadius(zoomScale) * 2 * iconRatio
}

/**
 * Document icon diameter (data units) — same recipe as the source icon:
 * proportional to the (clamped) hub circle so the icon is never tiny at low
 * zoom, scales naturally with the node, keeps its aspect ratio (square box,
 * centered by the caller), and never outgrows its circle. Replaces the old
 * ABSOLUTE 20px document icon, which had no minimum and rendered visibly
 * smaller than the tool icons.
 */
export function getDocumentIconDiameter(zoomScale: number = 1): number {
  const iconRatio = ICON_CONFIG.document.iconSize / NODE_DIAMETERS.document
  return getSourceNodeRadius(zoomScale) * 2 * iconRatio
}
