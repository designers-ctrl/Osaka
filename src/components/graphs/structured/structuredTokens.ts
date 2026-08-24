import { LINK_GRADIENT, LINK_STYLING } from '../graphTokens'
import { EXPANDED_CLUSTER } from '../expanded/expandedTokens'

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

  // First ring: insights, uniform size.
  // 190 keeps the ring proportional to the enlarged entity/cluster rings
  // (≈ ×1.25 of the historical 120 floor plus extra clearance) while staying
  // well outside the center content (avatar + sentiment rows, ≈ 96 units).
  insight: 190,

  // Second ring: entity nodes, uniform size.
  // 382 gives the Insight → Entity bundled-connection zone real breathing
  // room (radial distance 382 − 190 = 192 units). Packing for the current
  // 90 summaries at the 18-unit entity diameter: pitch
  // 2·382·sin(π/90) ≈ 26.7 → a ≈ 8.7-unit gap between neighbors.
  entity: 382,

  // Outer ring: clusters with source icons, uniform size.
  // 490 comfortably clears the packing floor for the current 90 clusters at
  // the 26-unit cluster diameter (STRUCTURED_NODE_SIZES.cluster): chord
  // pitch 2·490·sin(π/90) ≈ 34.2 → a ≈ 8.2-unit gap between neighbors.
  // The cluster → entity bridge corridor stays generous:
  // 490 − 13 − (382 + 9) = 86 units — the intrinsic ~59-unit badge plus
  // clearance. Cluster positions, bridge geometry and connection endpoints
  // all derive from this token; labels follow via CLUSTER_RING.label.arcDistance.
  cluster: 490,
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

  // Entity nodes: fixed diameter (uniform across all entities).
  // Reduced stepwise (24 → 20 → 18) to lower the entity ring's packing floor
  // so the ring could pull in (the Insight → Entity compression). At the
  // resulting larger fit scale the circle renders near its previous size and
  // the count text inside renders LARGER than before.
  entity: 18,

  // Cluster nodes: fixed diameter (uniform across all clusters).
  // Reduced stepwise (40 → 32 → 28 → 26) to lower the cluster ring's packing
  // floor (STRUCTURED_RINGS.cluster) so the whole radial footprint
  // compresses: at the resulting larger initial fit scale the cluster
  // RENDERS at the same on-screen size as before, while every other ring
  // gets bigger.
  cluster: 26,
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
  /** Outer container: status color at 10% alpha (Figma's 0.10 treatment). */
  containerAlpha: 0.10,
  /** Inactive segment slots: the SAME semantic status color at low alpha
   *  (active segments render it at 100%), so the whole meter reads in one hue. */
  inactiveAlpha: 0.20,
}

// ============================================================================
// INSIGHT RING STYLING
// ============================================================================
// Uniform-size insight nodes with optional badge

export const INSIGHT_RING = {
  /*
   * ── INSIGHT SIZE ON THE RING ────────────────────────────────────────────
   * `nodeRadius` is the LAYOUT radius (spacing, endpoint trimming and the
   * detail view all measure from it) — the drawn circle is per-insight, from
   * the window below. The window sits strictly ABOVE the structured cluster
   * diameter (STRUCTURED_NODE_SIZES.cluster = 26), so the hierarchy rule
   * `max cluster < min insight` holds on the ring exactly as it does in the
   * Unstructured field.
   */
  minDiameter: 28,
  maxDiameter: 38,
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
  /*
   * GRAY border, from the design system's Gray/W neutral token
   * (`button-gray-w-60`) rather than the brand purple. The token already
   * carries its own alpha, so it is used as `rgba(var(--token))` with no extra
   * alpha argument — wrapping it in a second alpha produces five components
   * and the declaration is dropped (it renders black).
   *
   * The DASH is kept: a dashed ring is how both views say "cluster" (it is
   * also the legend's mark for an entities cluster), so only the hue changes.
   */
  stroke: 'rgba(var(--v-theme-button-gray-w-60))',
  strokeWidth: 1,
  strokeDasharray: 'none', // SOLID border (was dashed)

  // Origin icon inside cluster — sized FROM the cluster diameter so the two
  // can never drift apart when the cluster size token changes. The assets are
  // the same FULL-BLEED tiles Unstructured uses (`* Logo.svg` /
  // `Document Logo.svg`), so the tile fills the circle edge to edge and is
  // clipped round (see the clipPath in renderClusterRing) — never a square
  // image poking outside the node.
  sourceIcon: {
    sizeRatio: 1, // full-bleed: icon diameter = cluster diameter
    opacity: 0.95,
  },

  // Label positioned on arc around cluster
  label: {
    /** Gap between the ring-side end of the label and its spoke anchor. */
    sideOffset: 6,
    // ON-SCREEN font size at normal zoom: the ceiling of the constant-screen
    // rule. The NetworkGraphD3 structured zoom branch and the initial render
    // both size labels through getStructuredClusterLabelFontSize (below), so
    // zoom can never inflate them past this.
    fontSize: 12,
    // Maximum on-screen text width in px. The renderer truncates with an
    // ellipsis at (maxWidth / fontSize) × currentFont data units — width and
    // font scale together under the constant-screen rule, so the character
    // count fixed at render time keeps the cap valid at every zoom.
    maxWidth: 120,
    // The on-screen size labels ease DOWN TO at the minimum zoom (the
    // fit-to-view scale, which is also Structured's zoom-out clamp): 12px in
    // the normal range, 9px at maximum zoom-out, smoothly interpolated across
    // the last `zoomOutFadeBand` of zoom-out — see
    // getStructuredClusterLabelFontSize.
    minVisualFontSize: 9,
    /**
     * The fraction of zoom ABOVE the minimum over which the label size eases
     * between minVisualFontSize and fontSize: at k ≥ minZoom × (1 + band)
     * labels are the full 12px; from there down to minZoom they shrink
     * smoothly to 9px. 0.18 ≈ the "last 15–20% of zoom-out".
     */
    zoomOutFadeBand: 0.18,
    fontWeight: 500,
    fontFamily: 'Google Sans Flex',
    fill: '#FFFFFF',
    opacity: 0.85,
    // Arc placement: distance from cluster node edge
    /**
     * BASE radial offset beyond the cluster ring, in viewBox units — the
     * label's resting distance, and the CEILING of the zoom-aware rule below
     * (a label never sits farther out than this).
     */
    arcDistance: 28, // px beyond cluster circle — scaled with the larger ring
    /**
     * ── ZOOM-AWARE LABEL DISTANCE ──────────────────────────────────────────
     * The offset above is a WORLD distance, so on screen it scaled with the
     * camera: ~8px at the fit view but ~47px zoomed in, which detached every
     * label from its node. These two tokens turn it into a constant-SCREEN
     * gap instead — see getStructuredClusterLabelRadius():
     *
     *   effectiveArc(k) = clamp(nodeRadius − sideOffset + screenGap / k,
     *                           minArcDistance, arcDistance)
     *
     * `screenGap` is the ON-SCREEN px kept between the node's edge and the
     * start of its text. At the fit view the formula saturates at
     * `arcDistance`, so the default framing renders exactly as before.
     */
    screenGap: 11,
    /**
     * Floor for the effective offset. Must stay above
     * `nodeRadius − sideOffset` (13 − 6 = 7) or the text would cross into the
     * node; 10 keeps a 3-unit margin, which is ~12 screen px at max zoom-in —
     * so a label can never touch the source icon at any zoom level.
     */
    minArcDistance: 10,
    // Hemisphere-aware: left side text reads left→right, right side reads right→left
  },
}

// ============================================================================
// CONNECTION STYLING
// ============================================================================
// Links between rings (not the same as Unstructured's center-offset connections)

export const STRUCTURED_CONNECTIONS = {
  /*
   * EXTRA DEMO RELATIONSHIPS (structuredDemoLinks.ts).
   *
   * The dataset yields only ~15 connections that both endpoints of are visible
   * ring nodes, so most of the ring reads as unconnected. These knobs add real
   * links — counted and drawn by the same pipeline as the dataset's own — never
   * decorative strokes. Set `enabled: false` to see the raw data alone.
   *
   *   chordStrides   fractions of the ring to jump per pass; each becomes a
   *                  coprime stride so its chords circle the whole graph
   *   chordEvery     take every Nth cluster in a pass (2 = half of them)
   *   insightStride  the same idea for cluster → insight spokes
   *   insightSpokes  spokes per insight
   */
  demo: {
    enabled: true,
    chordStrides: [0.34, 0.19],
    chordEvery: 2,
    insightStride: 0.27,
    insightSpokes: 3,
  },

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
// CLUSTER HOVER ISOLATION
// ============================================================================
// Opacity states for the cluster-hover neighborhood isolation (see
// structuredHover.ts). Everything is opacity-only — DOM is never removed, so
// the radial layout cannot shift while hovering.

export const STRUCTURED_HOVER = {
  transitionMs: 150,

  // Related / hovered elements keep their normal appearance (group opacity 1
  // multiplies with each element's own baseline opacity attributes).
  related: 1,

  // Unrelated clusters, entity summaries, bridges/badges, labels and icons:
  // low disabled opacity — still faintly present for spatial context.
  dimmedNode: 0.15,

  // Unrelated insights: effectively hidden (near-zero, not removed).
  hiddenInsight: 0.04,

  // Connection opacities. base = resting state (also used by
  // renderRadialConnections and the entity/insight hover restores);
  // active = on the hovered relationship path; hidden = unrelated while a
  // hover is active (near-zero).
  connection: {
    fgBase: 0.05,
    bgBase: 0.02,
    fgActive: 0.8,
    bgActive: 0.15,
    fgHidden: 0.02,
    bgHidden: 0.005,
  },
}

// ============================================================================
// CLUSTER → ENTITY BRIDGE
// ============================================================================
// The single direct radial connector from each cluster node to its entity
// summary node, carrying the confidence badge (percentage + battery, which
// reuse the ENTITY_RING styling tokens).

/**
 * THE single sizing rule for Structured cluster labels, shared by the initial
 * render (renderClusterRing) and the NetworkGraphD3 zoom branch so the two
 * can never diverge. Returns the DATA-UNIT font size for the current camera:
 *
 *   normal zoom                         → 12px on screen (never larger)
 *   last `zoomOutFadeBand` of zoom-out  → smoothstep 12px → 9px
 *   minimum zoom (the fit-to-view k,    → 9px on screen
 *   which is Structured's zoom-out clamp)
 *
 * `minZoomScale` is the ACTUAL structured minimum zoom — pass
 * computeInitialTransform().k / the zoom behavior's scaleExtent floor, never
 * a hardcoded absolute. Smoothstep easing, so zooming out and back in glides
 * between the two sizes with no breakpoint jump.
 */
/**
 * THE cluster-label radial placement rule, shared by the initial render
 * (renderClusterRing) and the NetworkGraphD3 structured zoom branch so the
 * two cannot diverge — the same contract getStructuredClusterLabelFontSize
 * has for the type size.
 *
 * Returns the label group's radius from the ring centre. Only the RADIUS is
 * zoom-aware: the spoke angle, the hemisphere flip and the text anchoring are
 * untouched, so radial orientation reads exactly as before. Ring geometry is
 * never modified — `STRUCTURED_RINGS.cluster` is read, not written.
 */
export function getStructuredClusterLabelRadius(zoomScale: number): number {
  const label = CLUSTER_RING.label
  const k = zoomScale > 0 ? zoomScale : 1
  const arc = Math.min(
    label.arcDistance,
    Math.max(
      label.minArcDistance,
      CLUSTER_RING.nodeRadius - label.sideOffset + label.screenGap / k,
    ),
  )
  return STRUCTURED_RINGS.cluster + arc
}

export function getStructuredClusterLabelFontSize(
  zoomScale: number,
  minZoomScale: number,
): number {
  const label = CLUSTER_RING.label
  const k = zoomScale > 0 ? zoomScale : 1
  const kMin = minZoomScale > 0 ? minZoomScale : k
  // 0 at the minimum zoom → 1 once zoomed in past the fade band
  const linear = Math.min(1, Math.max(0, (k / kMin - 1) / label.zoomOutFadeBand))
  const eased = linear * linear * (3 - 2 * linear) // smoothstep
  const screenPx = label.minVisualFontSize
    + (label.fontSize - label.minVisualFontSize) * eased
  return screenPx / k
}

export const CLUSTER_ENTITY_BRIDGE = {
  stroke: 'rgba(255, 255, 255, 0.35)',
  strokeWidth: 1,

  // Rounded-RECTANGLE badge on the bridge (an SVG <rect>, deliberately NOT a
  // pill/capsule): `percentage + sentiment indicator`, horizontally arranged
  // and vertically centered, with ~4px corner radius and 4px/8px padding.
  //   border-radius: 4px; border: 1px solid rgba(255,255,255,0.40);
  //   background: radial-gradient(52.19% 52.09% at 51.07% 47.92%,
  //     #1B2220 2.69%, #000101 100%);
  // The background is an SVG radialGradient. Both gradient stops are OPAQUE
  // (design requirement: graph lines and background dots must never show
  // through the badge): first stop = theme Gray-3 token, second stop =
  // Figma's Black-1 #000101, literal because the theme has no opaque black
  // token. No fill-opacity / group opacity is applied at rest.
  badge: {
    // INTRINSIC hug-content sizing — the content defines the dimensions, the
    // badge is never stretched to fill the bridge:
    //   width  = paddingX + measured "NN%" text + gap + indicator + paddingX
    //   height = indicator height + paddingY top + paddingY bottom
    // (≈ 55 × 18 units for a typical two-digit percentage — comfortably
    // inside the 70-unit bridge corridor.)
    paddingX: 4, // horizontal — tightened from 6 so the badge hugs its content
    paddingY: 2, // vertical (unchanged: the badge hugs its row)
    gap: 5, // between the percentage text and the sentiment indicator
    // Softer corners while STAYING a rounded rectangle: 6 is still well under
    // the 9-unit half-height, so the ends never round into a pill/capsule.
    borderRadius: 6,
    stroke: 'rgba(255, 255, 255, 0.40)',
    strokeWidth: 1,
    gradientId: 'cluster-entity-badge-glass',
    gradient: {
      cx: '51.07%',
      cy: '47.92%',
      r: '52.19%',
      stops: [
        { offset: '2.69%', color: 'rgb(var(--v-theme-gray3, 27, 34, 32))' }, // Gray-3, opaque
        { offset: '100%', color: '#000101' }, // Figma Black-1 — no opaque theme token exists
      ],
    },
  },
}

// ============================================================================
// CLUSTER DRILL-DOWN — ROULETTE RING + FIXED DETAIL VIEWPORT
// ============================================================================
// Clicking a cluster does TWO things, and neither of them moves the camera:
//
//   1. the ring turns like a roulette wheel until the selected cluster reaches
//      `focusAngleDeg`. The circle stays centred and stays the same size; only
//      its content rotates (the rotor — see useStructuredRenderer);
//   2. that cluster's Insights + Entities are drawn in ONE FIXED DETAIL ZONE,
//      always at the same place on screen. Selecting another cluster replaces
//      the CONTENT of that zone; the zone itself never moves.
//
// ⚠️ TWO COORDINATE SYSTEMS. The ring is in DATA units inside the camera. The
// detail zone lives OUTSIDE the zoom-transformed viewport group, so its numbers
// are viewBox units (STRUCTURED_VIEWPORT.dataWidth × dataHeight) and are NEVER
// divided by the camera scale — that is what makes it immovable under pan and
// zoom. Do not mix the two.

export const STRUCTURED_FOCUS = {
  /** Layer + dim transition duration (ms). */
  transitionMs: 450,

  /**
   * THE ROULETTE. The ring turns until the selected cluster sits at this angle
   * (the view's convention: 0° = East, 180° = West). 0° because the wheel is
   * parked off the LEFT edge of the canvas — its East point is the part nearest
   * the detail area, so that is where a selected cluster belongs, with its
   * content opening to the right of it.
   *
   * The clicked node is never lifted out of the ring or duplicated: the rotor
   * turns as one rigid body, so every node's element, datum, icon, label and
   * relationships are untouched, and the wheel's centre and radius never change.
   */
  focusAngleDeg: 0,
  /** How long the wheel takes to turn (ms). */
  rotationMs: 700,

  /**
   * VIEWPORT-EDGE FADE while a cluster is open: the on-screen depth (px) of the
   * soft transparency ramp at the TOP, BOTTOM and LEFT viewport edges, applied
   * as a screen-anchored CSS mask on the canvas (NetworkGraphD3 `--edge-fade`).
   */
  edgeFadePx: 140,

  /**
   * ── SELECTION IS A HIGHLIGHT, NOT A DIM ──────────────────────────────────
   *
   * Opening a cluster does NOT fade the wheel down any more. Every cluster,
   * ring and connection stays at its resting appearance — the wheel is the
   * navigation control, so it has to stay readable while you use it — and the
   * selected cluster is marked instead: a halo behind its node in the accent,
   * with a glow around it.
   *
   * The colour is the chart theme's second categorical step (#9D7EEA), passed
   * in live by the caller; the literal here is only the pre-resolve mirror of
   * it, per the DS convention for values that must survive without a theme.
   */
  selection: {
    /**
     * ⚠️ The accent is no longer painted onto the selected node — the node
     * keeps its own logo and ring styling (the design review found the accent
     * fill read as the node being replaced by a generic dot). The selection is
     * marked by the soft neutral glow on `.structured-selection-layer`
     * (structuredFocus.ts, at the layer's creation) and the expanded region
     * beside the node. The token stays for the accent's other users.
     */
    fillToken: 'graph-accent',
    colorFallback: '#9D7EEA',
    opacity: 0.6,
    /** Halo radius as a multiple of the cluster node's own radius. */
    radiusScale: 1.7,
    /**
     * Glow blur, in the same constant-screen unit every other size in this
     * layer uses: divided by the camera scale when applied, so it holds its
     * apparent size through zoom. (SVG filters work in user space, so the
     * viewBox's own fit scale still applies on top — as it does to the type.)
     */
    glowPx: 6,

    /**
     * Unrelated nodes while a cluster is selected: still visible, clearly
     * secondary — never hidden. Applied to clusters, their labels/satellites
     * and insights with no relationship to the selection; the related tier
     * and the selection itself stay at 1 with their glows.
     */
    unrelatedOpacity: 0.55,

    /**
     * The region chip draws SMALLER than the shared expanded-chip geometry
     * (one uniform scale on the constant-screen transform, so padding, height
     * and type shrink together and hug-content measurement is untouched).
     * Structured regions carry the chip INSIDE a busy entity field; at full
     * size it read as a banner across the circle.
     */
    chipScale: 0.75,

    /**
     * Camera scale at or above which an expanded region shows ALL its entity
     * labels. Below it the region shows dots only (hover reveals one name at
     * a time); past it there is enough screen per entity for the names to
     * coexist. The focus base scale is ≈0.27, and each toolbar zoom step is
     * ×1.25 — so this is roughly three zoom-ins deep.
     */
    entityLabelZoomThreshold: 0.5,
  },

  /**
   * ── THE WHEEL AND THE FIXED DETAIL AREA ───────────────────────────────────
   *
   * Structured drill-down is a two-part screen that never moves:
   *
   *   ╭───────┬──────────────────────────────┐
   *   │ wheel │  detail area (fixed)         │  ← the ring, parked off the left
   *   │    ◝  │  entities + insights         │    edge so about half of it shows
   *   ╰───────┴──────────────────────────────┘
   *
   * The wheel is the NAVIGATION control: it rotates (scroll or drag) to bring
   * clusters round to its East point, and clicking one fills the detail area.
   * The camera is placed once, is identical for every cluster, and is frozen
   * while the drill-down is open — there is no panning or zooming in this mode,
   * so the detail area is fixed in the strongest sense available.
   *
   * ⚠️ TWO COORDINATE SYSTEMS. The wheel and the detail layer are both inside
   * the camera, so their units are DATA units; the zone below is expressed in
   * viewBox fractions and converted through the fixed camera at layout time.
   * On-screen sizes (type, mark radii, gaps) are divided by the camera scale.
   */
  detail: {
    /**
     * WHERE THE WHEEL SITS. Its centre is placed past the LEFT edge of the
     * canvas (x < 0) so the ring is cropped: only the arc nearest the detail
     * area is on screen — a wheel you turn, not a diagram you read whole. The
     * scale comes from `radiusFitFraction`: the ring's radius as a fraction of
     * the viewBox's smaller side.
     */
    /**
     * ── SCALE-IN-PLACE FOCUS ─────────────────────────────────────────────
     * Opening a cluster does NOT pan the radial graph anywhere: the camera
     * stays centred on the graph's own centre and only SCALES DOWN by this
     * factor (relative to the overview fit), so the whole ring shrinks in
     * place and the freed margin around it is where the expanded regions
     * open. Closing scales back up — one smooth scale animation, zero
     * horizontal translation.
     */
    /*
     * 0.7 (was 0.8): the open-state ring cedes more of the canvas to the
     * expanded regions — the review kept finding region circles fighting the
     * wheel for room at 0.8.
     */
    shrinkFactor: 0.7,
    /**
     * ── ADAPTIVE SHIFT ───────────────────────────────────────────────────
     * On top of the in-place shrink, the graph slides slightly AWAY from the
     * open selections (canvas units): a cluster clicked in the upper half
     * shifts the ring down so its region opens into the freed upper space,
     * and vice versa — always a two-zone composition, graph vs regions,
     * instead of the region fighting the ring for room. Applied along the
     * mean direction of every open selection, so opposite selections cancel
     * to no shift. Animated by the caller's camera transition.
     */
    /*
     * 200 (was 64): the ring is pushed hard toward the opposite viewport edge
     * — clearly visible, partially cropped — so the freed side holds the
     * expanded regions at full size instead of squeezing them into a margin.
     */
    adaptiveShift: 200,
    /**
     * Data-unit gap between the wheel's outer extent (outerRadius — the ring
     * plus its radial labels) and the near edge of an expanded region opened
     * beside it.
     */
    regionClearance: 36,
    /**
     * Structured regions draw LARGER than the shared count-adaptive radius:
     * the drill-down is this mode's main read-out, and at the shared size the
     * entities felt compressed. Applied after `getRegionRadius`, capped below.
     */
    regionScale: 1.3,
    /** Hard cap on a focus region's radius (data units). */
    maxRegionRadius: 270,
    /** Minimum gap kept between two expanded regions (data units). */
    regionGap: 24,

    wheel: {
      /*
       * Parked further past the left edge (was -0.05) so the ring is cropped
       * harder and its rim + category labels stop reaching into the middle of
       * the canvas — the detail area keeps its own fixed bounds, but the band
       * in front of it is no longer crowded by the wheel.
       *
       * ONLY the horizontal anchor moved: `centerYFraction` keeps the wheel
       * vertically centred and `radiusFitFraction` keeps its radius (and so
       * the zoom, the rotation and every cluster's position on the rim)
       * exactly as before.
       */
      centerXFraction: -0.16,
      centerYFraction: 0.5,
      radiusFitFraction: 0.49,
    },

    /**
     * THE PIN COLUMN, as a viewBox fraction across. A selected cluster is lifted
     * out of the wheel and parked here — clear of the rim, where it would
     * otherwise sit among the clusters it just left and read as still being one
     * of them. Everything in its band is measured from this point.
     */
    pinColumnX: 0.40,

    /**
     * The detail area, in viewBox fractions (x0/x1 across, y0/y1 down). It
     * begins just clear of the pin column — close enough that the field reads
     * as coming OUT of the selected cluster, with no dead band between them —
     * and stops short of the canvas edge on purpose: a dot sits at its column's
     * centre and its label runs RIGHT from it, so the last column needs a
     * label's width of canvas beyond it or every name there gets clipped.
     */
    zone: { x0: 0.52, x1: 0.96, y0: 0.08, y1: 0.92 },

    /**
     * The insight column, as a viewBox fraction across — between the pinned
     * cluster and the detail field, so the chain reads cluster → insight →
     * entities running outward from the pin.
     */
    insightColumnX: 0.47,

    /**
     * ORGANIC SCATTER. Entities are placed on a jittered grid: the grid is what
     * guarantees they stay separated and readable, and the per-item jitter —
     * derived from each id's own hash, never `Math.random()` (a house rule), so
     * a cluster looks identical every time it is opened — is what stops the
     * field reading as a table. The value is the fraction of a cell an item may
     * wander; beyond ~0.4 neighbours start touching.
     */
    scatter: {
      /**
       * Two axes, deliberately unequal. Horizontal wander is free — a name has
       * its whole cell to sit in — but VERTICAL wander is what makes labels
       * collide, because rows are only a line-height apart. Half the jitter
       * across keeps the field organic while the rows stay legible.
       */
      jitterX: 0.18,
      jitterY: 0.09,
    },

    /** Constant-screen mark radii (px) — divided by the camera scale at render. */
    entityScreenRadius: 4.5,
    insightScreenRadius: 5.5,
    /** On-screen px below the cluster node for its category caption. */
    captionOffsetY: 26,

    /**
     * Breathing room between two selections' bands, in data units. Selecting a
     * second cluster splits the zone in two; this is what keeps the lower band's
     * top row clear of the upper band's last one.
     */
    bandGap: 60,

    /**
     * Past this many pinned clusters the cross-cluster relation lines switch to
     * the DASHED language — with two selections there is one relationship to
     * read and a solid line is clearest, but with three the lines cross each
     * other and the bands they belong to, and the dashes are what separate a
     * derived entity↔entity relation from the solid chains beneath it. The
     * pattern itself is the shared `EXPANDED_CLUSTER.entityRelation` one, so
     * Structured and Unstructured dash identically.
     */
    dashRelationsAbove: 2,

    /**
     * How many clusters may be pinned at once. Each takes a band of the fixed
     * zone, so past a handful every field is too short to read — and the point
     * of pinning is comparison, not accumulation.
     */
    maxSelected: 3,

    /**
     * ROULETTE SCROLL: degrees of wheel rotation per unit of wheel delta. Scroll
     * REPLACES zoom while the drill-down is open — the canvas is not navigable
     * in this mode, the wheel is.
     */
    scrollDegPerUnit: 0.14,
  },

  /**
   * The ENTITY marks. Not a Structured invention: a drill-down entity IS an
   * expanded entity — the same kind of node — so it reuses the Unstructured
   * `expanded-entity` tokens outright rather than carrying an approximation of
   * them. The FILL is not a token in either place: it is resolved live from the
   * theme by the same `nodeColor({ kind: 'entity' })` call and passed in.
   */
  leaf: EXPANDED_CLUSTER.entity,

  /**
   * Detail connections use the SAME visual language as every other connection
   * in the app — the shared luminous gradient paint server, the base stroke
   * scale and the base opacity ramp (resting / hover / hidden). Straight
   * single segments, as everywhere else.
   */
  line: {
    stroke: `url(#${LINK_GRADIENT.foreground.id})`,
    baseWidth: LINK_STYLING.strokeWidth.default,
    /** Detail links draw thinner: the zone is a compact read-out. */
    widthFactor: 0.6,
    /** viewBox units between a line end and the node edge it points at. */
    endpointGap: 3,
    opacity: LINK_STYLING.opacity,
  },

  label: {
    fontFamily: 'Google Sans Flex',
    fontSize: 9,
    fontWeight: 400,
    rootFontSize: 13,
    rootFontWeight: 500,
    /** viewBox units below the root mark for the cluster's category. */
    rootOffsetY: 10,
    /** viewBox units between a dot and its label — tight, so the name reads as
     * belonging to that dot rather than floating beside it. */
    gap: 4,
    /**
     * Before ellipsis truncation, on screen. It is also what SIZES the detail
     * field's columns (see `layoutDetail`): a column is never narrower than a
     * full label, so raising this widens the cells and drops a column rather
     * than squeezing names into ellipses.
     */
    maxWidth: 84,
    ink: 'rgba(255, 255, 255, 0.9)',
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

  // Furthest visual extent from the graph origin, sized to the graph's
  // ACTUAL bounds — not a worst-case reserve. The cluster ring's radial
  // category labels start at STRUCTURED_RINGS.cluster + label.arcDistance + 6
  // (≈ 524, see renderClusterRing). Labels are constant-screen (12px font),
  // and the longest CURRENT category ("Organizations", 13 chars) measures
  // ≈ 82px on screen. At the resulting initial fit scale of
  // min(800,600) / (2 × (755 + 10)) ≈ 0.392 that is ≈ 209 data units →
  // extent ≈ 733 ≤ 755, with ~8px of on-screen headroom. Revisit this value
  // only if longer categories are added (labels beyond ≈ 90px on screen
  // would clip).
  // The Structured initial camera (NetworkGraphD3.computeInitialTransform,
  // structured branch) centers and fits THIS radius — never the Unstructured
  // camera or container-px math.
  outerRadius: 755,
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
