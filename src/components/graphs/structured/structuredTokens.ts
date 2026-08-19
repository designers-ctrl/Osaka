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
  // 120 trims the inner connection zone: the center content (avatar +
  // sentiment rows) extends to ≈ 96 units below the origin, so 120 is the
  // closest the insight ring can sit without curves crossing that content.
  insight: 120,

  // Second ring: entity nodes, uniform size.
  // 210 keeps compressing the Insight → Entity bundled-connection zone
  // (radial distance 210 − 120 = 90 units). Packing: 62 summaries at the
  // 18-unit entity diameter → pitch 2·210·sin(π/62) ≈ 21.3, gap ≈ 3.3 units
  // — at its packing limit for the current entity size.
  entity: 210,

  // Outer ring: clusters with source icons, uniform size.
  // 302 is the compactness floor for this ring at the 26-unit cluster
  // diameter (STRUCTURED_NODE_SIZES.cluster): chord pitch
  // 2·302·sin(π/62) ≈ 30.6 → a ~4.6-unit gap between neighbors. It also
  // keeps the cluster → entity bridge compact: free corridor
  // 302 − 13 − (210 + 9) = 70 units — the intrinsic ~59-unit badge plus
  // clearance. Cluster positions, bridge geometry and connection endpoints
  // all derive from this token; labels follow via CLUSTER_RING.label.arcDistance.
  cluster: 302,
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
    arcDistance: 20, // px beyond cluster circle
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
// CLUSTER FOCUS (horizontal drill-down)
// ============================================================================
// Clicking a cluster keeps the radial graph as dimmed context on the left and
// expands `Cluster → Insights → Entities` as a horizontal hierarchy on the
// right (see structuredFocus.ts). All positions are DATA units in the same
// coordinate space as the rings; label px values are ON-SCREEN sizes, divided
// by the camera scale at render/zoom time (the structured constant-screen
// convention).

export const STRUCTURED_FOCUS = {
  /** Camera + layer + dim transition duration (ms). */
  transitionMs: 450,

  /**
   * FOCUS BY ROTATION. Clicking a cluster does NOT lift it out of the ring
   * (that read as a detached duplicate and left a hole where it had been):
   * the whole radial graph rotates until that cluster sits horizontally on
   * the focus side, and the drill-down columns extend from it. The clicked
   * node stays the same element in the ring, with its identity, icon, label
   * and relationships intact.
   *
   * `focusAngleDeg` is where the cluster lands, in the view's angle
   * convention (0° = East / 3 o'clock — horizontal, on the right, which is
   * the side the columns extend toward).
   */
  focusAngleDeg: 0,
  /** Rotation easing duration (ms); the camera uses `transitionMs`. */
  rotationMs: 700,

  /**
   * How many clusters may be expanded AT ONCE.
   *
   * Rotation can only bring one cluster to the focus side, so with several open
   * the rest fan outward along their own radii (see structuredFocus.ts) — and
   * that only stays readable for a handful. Opening one past the cap closes the
   * OLDEST rather than refusing the click, so a click always does something
   * visible and the newest cluster is always the one in focus.
   */
  maxOpen: 4,

  /**
   * Angular de-collision between simultaneously open fans.
   *
   * A fan needs roughly `minSeparationDeg` of angular room at its outer end,
   * while the cluster ring's own pitch is ~5.8° (62 clusters) — so two clusters
   * opened near each other would draw their columns on top of one another. A new
   * fan steps away in `offsetStepDeg` increments, up to `maxOffsetDeg`; past
   * that it overlaps rather than flying off somewhere unrelated to its own
   * cluster. Incumbent fans never move.
   */
  fan: {
    minSeparationDeg: 22,
    maxOffsetDeg: 14,
    offsetStepDeg: 3.5,
  },

  /**
   * VIEWPORT-EDGE FADE while focused: the on-screen depth (px) of the soft
   * transparency ramp at the TOP, BOTTOM and LEFT viewport edges. Applied as
   * a screen-anchored CSS mask on the canvas (NetworkGraphD3 `--edge-fade`
   * class), so anything the focus composition pushes toward those edges
   * dissolves gradually instead of clipping; the centre stays fully opaque
   * and the right edge is deliberately unfaded.
   */
  edgeFadePx: 140,

  /**
   * The root is the cluster AT ITS RING POSITION after rotation, so the
   * columns start from the ring's edge rather than from an arbitrary x.
   */
  rootX: STRUCTURED_RINGS.cluster,
  /**
   * Horizontal gaps: root → insight column, insight → entity column.
   * Sized so the whole chain (both gaps + `leafLabelReserve`) still fits the
   * canvas space right of `camera.anchorFraction` at the zoomed-IN scale —
   * widen these and the camera clamp below will cancel the zoom-in to keep the
   * columns on screen.
   */
  columnGap: { insights: 200, leaves: 240 },
  /**
   * Vertical pitch inside each column, in ON-SCREEN px — like `label.fontSize`
   * and for the same reason.
   *
   * Row pitch has to be measured in the same units as the thing it separates,
   * and what it separates is TEXT, which is constant-screen. As data units the
   * pitch shrank with the camera while the labels did not, so as soon as the
   * camera zoomed out to frame several open fans the rows collided — the pitch
   * fell to ~11px against a 12px font. In screen px the gap the reader sees is
   * the gap that is configured, at any zoom.
   *
   * These values reproduce the previous single-cluster spacing exactly: 52 and
   * 40 data units at that view's 0.742 scale.
   */
  rowGap: { insights: 39, leaves: 30 },

  /** The dimmed radial overview while focused ("strongly dimmed"). */
  dimmedOverview: 0.12,
  /**
   * The overview's connection MESH while focused: hidden, not dimmed —
   * hundreds of faint lines buried the drill-down (near-zero rather than 0
   * so the elements stay cheaply animatable back to their resting state).
   */
  overviewConnectionOpacity: 0.015,
  /**
   * The focused cluster stays EXACTLY as it is drawn in the ring — same
   * position, same size. Kept at 1 so every geometry helper that reads it
   * (line trimming, the root label offset) still has one place to look.
   */
  rootScale: 1,

  label: {
    fontFamily: 'Google Sans Flex',
    fontSize: 12, // on-screen px — constant-screen via the zoom branch
    fontWeight: 400,
    rootFontSize: 14, // on-screen px
    rootFontWeight: 500,
    rootOffsetY: 10, // on-screen px below the root circle
    maxWidth: 170, // on-screen px before ellipsis truncation
    gap: 8, // on-screen px between a dot and its label
    /**
     * Estimated advance per character, as a fraction of font size — the same
     * idiom (and value) as EXPANDED_CLUSTER.entity.estCharWidth. Used to size a
     * column's row pitch from the labels it carries WITHOUT a measure-then-
     * reflow pass, so the layout stays deterministic across reloads.
     */
    estCharWidth: 0.62,
    /** Line box as a multiple of font size — the vertical half of that estimate. */
    lineHeightFactor: 1.35,
    ink: 'rgba(255, 255, 255, 0.9)',
  },

  /**
   * Focus connections use the SAME visual language as an Unstructured
   * connection — the shared luminous gradient paint server, the base link
   * stroke scale, and the base opacity ramp (resting / hover / hidden), with
   * hover highlighting wired through the same interaction helper. Straight
   * single segments, as everywhere else in this app.
   */
  line: {
    stroke: `url(#${LINK_GRADIENT.foreground.id})`,
    baseWidth: LINK_STYLING.strokeWidth.default,
    /**
     * Focus links draw THINNER than the shared base width: the fan is a short
     * read-out beside the graph, and at the focus camera's zoom the base
     * width read as heavy rules rather than connections. Proportional — the
     * background/glow keeps its ×1.5 relation, and the hover thicken keeps
     * its ×1.3 — and scoped to the focus layer only (the overview mesh and
     * the Unstructured graph never see it).
     */
    widthFactor: 0.6,
    endpointGap: 4, // data units between a line end and its node edge
    opacity: LINK_STYLING.opacity,
  },

  /**
   * The right-hand ENTITY marks. Not a Structured invention: a focus leaf IS an
   * expanded entity — the same kind of node, drilled down to — so it reuses the
   * Unstructured `expanded-entity` tokens outright rather than carrying its own
   * approximation of them. Radius, its on-screen floor, resting opacity and the
   * hover dim all come from EXPANDED_CLUSTER.entity; the FILL is not a token at
   * all in either place — it is resolved live from the theme by the same
   * `nodeColor({ kind: 'entity' })` call the drill-down uses, and passed in.
   */
  leaf: EXPANDED_CLUSTER.entity,

  /** Data-unit reserve past the last column for its labels (camera bounds). */
  leafLabelReserve: 260,

  /**
   * FOCUS CAMERA — the radial graph shifts LEFT and the view zooms IN slightly,
   * as one move alongside the rotation.
   *
   * The zoom is expressed RELATIVE to the overview's own fit scale (the same
   * formula the Structured initial camera uses), so "zoom in" means in whatever
   * that fitted scale happens to be. This replaced a fit-everything camera that
   * framed the ring AND the columns together: fitting a much wider box than the
   * ring alone necessarily zoomed OUT (≈0.43–0.52 against an overview of
   * ≈0.62), making the focused side smaller and less readable — the opposite of
   * the intent.
   */
  camera: {
    /** Multiplier on the overview's fit scale. > 1 = zoom in. */
    zoomInFactor: 1.2,
    /**
     * Where the focused cluster lands across the canvas width (0 = left edge,
     * 1 = right edge). The ring slides left past the edge — deliberately: the
     * focus reads as a fan opening from the left — and the columns take the
     * remaining right-hand space.
     */
    anchorFraction: 0.32,
    /** Share of canvas height the tallest focus column may occupy. */
    verticalFill: 0.86,
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
  // (≈ 328, see renderClusterRing). Labels are constant-screen (12px font),
  // and the longest CURRENT category ("Organizations", 13 chars) measures
  // ≈ 82px on screen. At the resulting initial fit scale of
  // min(800,600) / (2 × (475 + 10)) ≈ 0.619 that is ≈ 133 data units →
  // extent ≈ 461 ≤ 475, with ~9px of on-screen headroom. Reserving the full
  // 120px truncation cap instead would shrink every node — revisit this
  // value only if longer categories are added (labels beyond ≈ 92px on
  // screen would clip).
  // The Structured initial camera (NetworkGraphD3.computeInitialTransform,
  // structured branch) centers and fits THIS radius — never the Unstructured
  // camera or container-px math.
  outerRadius: 475,
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
