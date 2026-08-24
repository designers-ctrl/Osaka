<!--
  src/components/graphs/NetworkGraphD3.vue

  D3-based force-directed and hierarchical network graph visualization.
  Supports toggling between "unstructured" (force-directed) and "structured"
  (hierarchical) layouts, with interactive cluster selection and timeline filtering.

  Vue owns data state; D3 owns DOM rendering and physics simulation.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import * as d3 from 'd3'
import { useTheme } from 'vuetify'
import type { NetworkNode, NetworkLink } from '@/components/charts'
import { useChartTheme, withAlpha } from '@/components/charts'
import { useD3Force } from './useD3Force'
import { useD3Hierarchy } from './useD3Hierarchy'
import { useD3Interaction } from './useD3Interaction'
import { useD3Drag } from './useD3Drag'
import { useStructuredRenderer, STRUCTURED_VIEWPORT, CLUSTER_RING, STRUCTURED_FOCUS, getStructuredClusterLabelFontSize, getStructuredClusterLabelRadius } from './structured'
import { applyStructuredHoverIsolation } from './structured/structuredHover'
import { resolveClusterOwnerId } from './structured/components/renderClusterRing'
import {
  computeFocusCamera,
  deriveStructuredFocus,
  createStructuredFocus,
  type StructuredFocusHandle,
  type StructuredFocusModel,
} from './structured/structuredFocus'
import { setStructuredHoverSuspended } from './structured/structuredHover'
import {
  EXPANDED_CLUSTER,
  computeRegionCenters,
  deriveDrilldown,
  forceExpandedEnvelope,
  useDrilldownRenderer,
  type DrilldownHandle,
  type DrilldownModel,
} from './expanded'
import { getSourceNodeIcon, documentNodeIconFor } from '@/data/sourceNodeIcons'
import {
  BACKGROUND_PATTERN,
  NODE_GLASS,
  VIEWPORT,
  LINK_STYLING,
  TYPOGRAPHY,
  SOURCE_NODES,
  NODE_DIAMETERS,
  NODE_STYLING,
  NODE_HOVER,
  ANIMATIONS,
  FORCE_SIMULATION,
  getEffectiveNodeRadius,
  getNodeStrokeWidth,
  getLinkStrokeWidth,
  getScaledLabelFontSize,
  getIconDiameter,
  getSourceNodeRadius,
  getSourceIconDiameter,
  getDocumentIconDiameter,
  getInverseZoomScale,
  getConnectionEndpoints,
} from './graphTokens'
import {
  appendLinkDefs,
  applyLinkBackgroundStyle,
  applyLinkForegroundStyle,
  applyLinkEndpointStyle,
} from './linkRenderer'
import { withProximityBridges } from './proximityBridges'

interface Props {
  nodes: NetworkNode[]
  links: NetworkLink[]
  height: number
  layoutMode: 'unstructured' | 'structured'
  /**
   * External reference highlight (the assistant answer's hovered inline ref):
   * a node id to isolate on the canvas. Entity ids resolve to their OWNING
   * CLUSTER through the graph's own links (never text matching), and each
   * mode applies its OWN existing hover-isolation path — handleNodeHover for
   * Unstructured, applyStructuredHoverIsolation for Structured. `null`
   * restores the exact previous emphasis state.
   */
  highlightRefId?: string | null
  zoom?: number
  title?: string
  // Structured view only: user and sentiment data for center avatar
  userInitials?: string
  sentimentPercent?: number
  sentimentLabel?: string
}

interface Emits {
  (e: 'cluster-click', nodeId: string): void
  // Unstructured drill-down state: the expanded cluster's id, or null when the
  // focused view closes. Purely informational for the host screen — the graph
  // owns the state itself (see `expandedClusterIds`).
  (e: 'cluster-expand', clusterId: string | null): void
  // The expansion cap (max simultaneously expanded clusters) evicted the
  // oldest region to make room for the one just clicked. Carries the limit so
  // the host screen can word its notice without duplicating the number.
  (e: 'expand-limit', max: number): void
  // Fired on every camera change with whether the viewport currently matches
  // the initial fit-to-view framing (drives the Reset control's visibility)
  (e: 'viewport-change', atInitialView: boolean): void
  // Structured cluster-detail opened (true) or closed (false). The detail view
  // deliberately never moves the camera, so `viewport-change` alone would
  // leave Reset hidden while a cluster is open — this is the second input to
  // that control's visibility, not a second control.
  (e: 'focus-change', active: boolean): void
}

const props = withDefaults(defineProps<Props>(), {
  zoom: 1,
})

const emit = defineEmits<Emits>()

const containerRef = useTemplateRef<HTMLDivElement>('container')
const svgRef = useTemplateRef<SVGSVGElement>('svg')
const glassRef = useTemplateRef<HTMLDivElement>('glass')
const regionGlassRef = useTemplateRef<HTMLDivElement>('regionGlass')

// D3 utilities
let zoomBehaviorInstance: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
const { createForceSimulation, updatePositions, seedInitialLayout, warmupSimulation } = useD3Force()
const { createHierarchicalLayout } = useD3Hierarchy()
const { setupNodeInteraction, setupLinkInteraction, highlightConnectedNodes, applyNodeSelection, applyLinkSelection } = useD3Interaction()
const { createDragBehavior } = useD3Drag()

// Structured renderer (for layoutMode === 'structured')
const { renderStructured, cleanupStructured } = useStructuredRenderer()

// Theme colors
const chartTheme = useChartTheme()

/**
 * Resolve a design-system colour token against the LIVE Vuetify theme.
 *
 * D3 draws with attribute values, so it cannot inherit a `color` prop or a
 * utility class the way a Vuetify component does. This is the equivalent seam:
 * layers store token NAMES (see `expandedTokens.chip`) and resolve them here,
 * so `src/plugins/vuetify.ts` stays the single source of colour and no hex is
 * written into a renderer. Falls back to the theme's default ink for an
 * unknown token rather than painting nothing.
 */
const vuetifyTheme = useTheme()
function themeColor(token: string): string {
  const colors = vuetifyTheme.current.value.colors as Record<string, string>
  return colors[token] ?? chartTheme.value.ink
}
const nodeColor = computed(() => (node: NetworkNode) => {
  const t = chartTheme.value
  if (node.kind === 'insight') return t.categorical[0]
  if (node.kind === 'entity') return t.categorical[1]
  if (node.kind === 'cluster') return t.categorical[2]
  if (node.kind === 'source') return t.categorical[3]
  if (node.kind === 'document') return t.categorical[4]
  return t.ink
})

const linkColor = computed(() => (link: NetworkLink) => {
  if (link.kind === 'overlap') return withAlpha('#656B69', 0.4)
  return withAlpha('#656B69', 0.3)
})

// State
const selectedCluster = ref<string | null>(null)
const highlightedNodes = ref<Set<string>>(new Set())
let simulation: d3.Simulation<NetworkNode, NetworkLink> | null = null
let animationFrameId: number | null = null
let isFirstInitialization = true
let currentZoomTransform: d3.ZoomTransform | null = null
let currentZoomScale: number = 1 // Track zoom scale for constant-screen rendering
let previousNodeIds: Set<string> = new Set() // Track previous node set for diff detection
// While true, the camera re-fits to the graph bounds on each simulation tick so
// the whole graph stays in view while the force layout settles on first load.
// Cleared on any user zoom/pan gesture, zoom button, or Timeline filter update.
let followInitialFit = false
let tickCount = 0 // === TEMPORARY DIAGNOSTIC: For tick monitoring ===

// ── CLUSTER DRILL-DOWN STATE (Unstructured only) ───────────────────────────
// An INTERACTION state, deliberately never written into the graph data: the
// dataset, the topology and the base render are identical whether or not a
// cluster is expanded. `expandedClusterIds` is the only switch; everything
// else below is derived from it plus the live nodes/links (see ./expanded).
//
// ⚠️ EXPANSION IS EXPLICIT ONLY: an id enters this list when the user clicks
// that cluster, and leaves it when they collapse it (region/chip ×). Related
// clusters are NEVER auto-expanded — not for direct cluster links, entity
// cross-links, or shared Insights; they stay collapsed, visible and clickable.
const expandedClusterIds = ref<string[]>([])
const { renderDrilldown, applyDrilldownEmphasis, clearDrilldownEmphasis } = useDrilldownRenderer()
let drilldownHandle: DrilldownHandle | null = null
/** Camera to restore when the drill-down closes. */
let preDrilldownTransform: d3.ZoomTransform | null = null
/** Screen position of the last pointerdown — tells a canvas click from a pan. */
let canvasPointerDownAt: { x: number, y: number } | null = null

/**
 * Id of the round clip applied to source logo tiles (defined in the SVG defs
 * on every render). Full-bleed square assets are clipped to the node circle.
 */
const SOURCE_ICON_CLIP_ID = 'source-icon-round-clip'

/*
 * Insight hover values bound into the scoped stylesheet with v-bind(), the
 * same pattern the canvas dot grid uses: the numbers/colours stay in
 * graphTokens (NODE_STYLING.insight.hover) and CSS just references them.
 */
const insightHoverFill = NODE_STYLING.insight.hover.fill
const insightHoverTransition = NODE_STYLING.insight.hover.transition

/* Collapsed-node hover glow (NODE_HOVER) — same v-bind() pattern. */
const nodeHoverFilter = `brightness(${NODE_HOVER.brightness}) drop-shadow(0 0 ${NODE_HOVER.glow.blur}px ${NODE_HOVER.glow.color})`
const nodeHoverTransition = NODE_HOVER.transition

// Dimensions
const width = computed(() => containerRef.value?.clientWidth || 800)
const scaledHeight = computed(() => Math.max(320, props.height))

/*
 * The canvas dot grid, bound into the scoped stylesheet with v-bind() so the
 * numbers stay in graphTokens.ts. CSS px are screen px — unlike anything drawn
 * inside the <svg>, which the viewBox scales to fit the container — so the grid
 * looks identical on a laptop and on a 5K display.
 */
const dotTile = `${BACKGROUND_PATTERN.spacing}px`
/* Only the alpha is bound: the dot ink itself is the live `background` theme
   token, composed in CSS, so it tracks a theme swap instead of being frozen
   into a hex here. */
const dotAlpha = `${BACKGROUND_PATTERN.opacity}`
const dotStop = `${BACKGROUND_PATTERN.dotRadius}px`
const dotFade = `${BACKGROUND_PATTERN.dotRadius + BACKGROUND_PATTERN.feather}px`

/* Node backdrop glass: blur radius in SCREEN px, so it needs no inverse-zoom
   compensation (see NODE_GLASS in graphTokens.ts). Applied inline by
   updateNodeGlass() rather than in the stylesheet — see the note there. */
const glassFilter = `blur(${NODE_GLASS.blurPx}px)`
/* Expanded regions carry a stronger backdrop blur than plain nodes. */
const regionGlassFilter = `blur(${EXPANDED_CLUSTER.region.glass.backdropBlurPx}px)`

/**
 * Re-clip the backdrop-glass layer to the union of every rendered node circle.
 *
 * Called wherever the nodes' on-screen geometry can change: after a render, on
 * every simulation tick, and on every zoom/pan. Writes ONE `clip-path` style —
 * no per-node elements, no per-node filters.
 *
 * Coordinates come from the nodes group's own screen CTM, so the mapping is
 * exact whatever the viewBox scale, `preserveAspectRatio` letterboxing, zoom
 * transform or container size — no duplicated projection math to drift.
 *
 * Nodes drawn at `opacity: 0` are skipped: the drill-down hides an expanded
 * cluster's circle (its big region stands in for it), and a frosted disc with
 * no node on top would be a visible artefact. Dimmed nodes keep their glass —
 * they are still drawn.
 */
function updateNodeGlass() {
  const glass = glassRef.value
  if (!glass) return

  /*
   * Switch the layer OFF rather than clipping it to nothing.
   *
   * ⚠️ `clip-path: path('')` is INVALID CSS: assigning it through `.style` is
   * silently rejected, which leaves the PREVIOUS path in place — a stale ring
   * of frosted discs that survived a mode switch (measured: 90 circles still
   * clipped after switching to Structured). `display: none` is unambiguous,
   * and it also drops the compositing cost while the layer has nothing to do.
   */
  const regionGlass = regionGlassRef.value
  const hide = () => {
    glass.style.display = 'none'
    if (regionGlass) regionGlass.style.display = 'none'
  }

  // Structured mode owns its own rendering; the glass is Unstructured-only.
  if (props.layoutMode !== 'unstructured' || !svgRef.value || !containerRef.value) {
    hide()
    return
  }

  const nodesGroup = svgRef.value.querySelector('g.nodes') as SVGGElement | null
  const ctm = nodesGroup?.getScreenCTM()
  if (!nodesGroup || !ctm) {
    hide()
    return
  }

  const origin = containerRef.value.getBoundingClientRect()
  const p = NODE_GLASS.pathPrecision
  const parts: string[] = []

  d3.select(nodesGroup).selectAll<SVGCircleElement, any>('circle.node-circle')
    .each(function (d: any) {
      if (this.getAttribute('opacity') === '0') return
      const x = d?.x || 0
      const y = d?.y || 0
      // User space → screen, then screen → container-local (the glass's box).
      const cx = ctm.a * x + ctm.c * y + ctm.e - origin.left
      const cy = ctm.b * x + ctm.d * y + ctm.f - origin.top
      // Uniform scale (aspect is preserved and zoom is uniform), so `a` alone
      // converts the data-space radius the circle is drawn with into px.
      const r = getEffectiveNodeRadius(d, currentZoomScale) * ctm.a
      if (!(r > 0) || !Number.isFinite(cx) || !Number.isFinite(cy)) return
      // One full circle as two arcs — sub-paths union under the nonzero rule.
      parts.push(
        `M${(cx - r).toFixed(p)},${cy.toFixed(p)}`
        + `a${r.toFixed(p)},${r.toFixed(p)} 0 1,0 ${(r * 2).toFixed(p)},0`
        + `a${r.toFixed(p)},${r.toFixed(p)} 0 1,0 ${(-r * 2).toFixed(p)},0Z`,
      )
    })

  if (parts.length === 0) {
    hide()
    return
  }
  glass.style.clipPath = `path('${parts.join('')}')`
  // Both spellings: Chrome/Edge take the standard property, older Safari the
  // prefixed one, and assigning an unsupported property is a silent no-op.
  glass.style.backdropFilter = glassFilter
  ;(glass.style as any).webkitBackdropFilter = glassFilter
  glass.style.display = 'block'

  // ── The expanded regions' own (stronger) backdrop glass ─────────────────
  // Clipped to the drill-down's region circles. Each circle's OWN screen CTM
  // is used — it already carries the region group's translate — so there is
  // no duplicated projection math for the region centres either.
  if (!regionGlass) return
  const regionParts: string[] = []
  d3.select(svgRef.value).selectAll<SVGCircleElement, any>('circle.expanded-region-circle')
    .each(function () {
      const c = this.getScreenCTM()
      if (!c) return
      const r = Number(this.getAttribute('r') || 0) * c.a
      const cx = c.e - origin.left
      const cy = c.f - origin.top
      if (!(r > 0) || !Number.isFinite(cx) || !Number.isFinite(cy)) return
      regionParts.push(
        `M${(cx - r).toFixed(p)},${cy.toFixed(p)}`
        + `a${r.toFixed(p)},${r.toFixed(p)} 0 1,0 ${(r * 2).toFixed(p)},0`
        + `a${r.toFixed(p)},${r.toFixed(p)} 0 1,0 ${(-r * 2).toFixed(p)},0Z`,
      )
    })
  if (regionParts.length === 0) {
    regionGlass.style.display = 'none'
    return
  }
  regionGlass.style.clipPath = `path('${regionParts.join('')}')`
  regionGlass.style.backdropFilter = regionGlassFilter
  ;(regionGlass.style as any).webkitBackdropFilter = regionGlassFilter
  regionGlass.style.display = 'block'
}

// Effective rendered node radius at the CURRENT zoom level — delegates to
// graphTokens' single source of truth, so link endpoint geometry (every
// getConnectionEndpoints call site below) always matches the radius the
// circle is actually drawn with, including the source nodes' minimum
// screen-size clamp at low zoom.
function getNodeRadiusFromData(node: NetworkNode): number {
  return getEffectiveNodeRadius(node as any, currentZoomScale)
}

// Layout nodes based on mode
const layoutNodes = computed(() => {
  if (props.layoutMode === 'structured') {
    const layout = createHierarchicalLayout(props.nodes, props.links, {
      width: 800,
      height: 600,
    })
    return layout
  }
  return props.nodes
})

/**
 * Compute the initial camera transform. Single source of truth for the
 * first-entry framing — used on load (resetZoom), by resetView(), and by the
 * settle-follow refit below.
 *
 * Unstructured: a true fit-to-view over the rendered bounds of every visible
 * node (position ± radius, padded by VIEWPORT.initialZoom.fitPadding), centered.
 * Computed in viewBox units — the space the zoom transform actually operates
 * in, since the SVG carries a `viewBox` of dataWidth × dataHeight — so the
 * framing is correct regardless of the container's pixel size.
 *
 * Structured: its own camera, derived from the Structured graph's bounds.
 * The radial layout is drawn around origin (0,0) with a known outer visual
 * radius (cluster ring + labels, STRUCTURED_VIEWPORT.outerRadius), so the
 * fit is: translate origin to the viewBox center, scale so the full circle
 * (padded) fits the viewBox's smaller dimension. Ring coordinates are never
 * shifted — only this camera transform.
 */
function computeInitialTransform(): d3.ZoomTransform {
  if (props.layoutMode === 'structured') {
    const contentRadius = STRUCTURED_VIEWPORT.outerRadius + STRUCTURED_VIEWPORT.fitPadding
    const scale = Math.min(VIEWPORT.dataWidth, VIEWPORT.dataHeight) / (2 * contentRadius)
    return d3.zoomIdentity
      .translate(VIEWPORT.dataWidth / 2, VIEWPORT.dataHeight / 2)
      .scale(scale)
  }

  if (props.layoutMode === 'unstructured') {
    // Bounds of all visible rendered nodes in data space
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of layoutNodes.value as any[]) {
      if (n.kind === 'entity') continue // entities are never rendered
      if (typeof n.x !== 'number' || typeof n.y !== 'number') continue
      // Base-size radius (zoom 1): initial-fit bounds are zoom-independent.
      const r = getEffectiveNodeRadius(n, 1)
      if (n.x - r < minX) minX = n.x - r
      if (n.y - r < minY) minY = n.y - r
      if (n.x + r > maxX) maxX = n.x + r
      if (n.y + r > maxY) maxY = n.y + r
    }

    if (Number.isFinite(minX)) {
      const pad = VIEWPORT.initialZoom.fitPadding
      minX -= pad
      minY -= pad
      maxX += pad
      maxY += pad
      const boundsWidth = maxX - minX
      const boundsHeight = maxY - minY
      // Backed off the exact fit (initialScaleFactor < 1), so the default view
      // opens with air around the graph; manual zoom/pan are untouched.
      const scale = Math.min(VIEWPORT.dataWidth / boundsWidth, VIEWPORT.dataHeight / boundsHeight)
        * VIEWPORT.initialZoom.initialScaleFactor
      // Center the padded bounds inside the viewBox (same scale as above, so
      // backing off cannot de-centre the view)
      const tx = (VIEWPORT.dataWidth - boundsWidth * scale) / 2 - minX * scale
      const ty = (VIEWPORT.dataHeight - boundsHeight * scale) / 2 - minY * scale
      return d3.zoomIdentity.translate(tx, ty).scale(scale)
    }
    // No positioned nodes yet: fall through to the container-fit fallback below
  }

  const containerRect = containerRef.value?.getBoundingClientRect()
  const containerWidth = containerRect?.width || 1200
  const containerHeight = containerRect?.height || 600

  // Scale to fit entire data space in viewport with generous margin (from graphTokens)
  const scaleX = containerWidth / VIEWPORT.dataWidth
  const scaleY = containerHeight / VIEWPORT.dataHeight
  const initialScale = Math.min(scaleX, scaleY) * VIEWPORT.initialZoom.marginMultiplier

  // Center the view
  const initialTx = (containerWidth - VIEWPORT.dataWidth * initialScale) / 2
  const initialTy = (containerHeight - VIEWPORT.dataHeight * initialScale) / 2
  return d3.zoomIdentity.translate(initialTx, initialTy).scale(initialScale)
}

// ── CLUSTER DRILL-DOWN (Unstructured only) ─────────────────────────────────
// Clicking a Cluster opens a focused view: that cluster becomes a large
// translucent region holding its REAL entities, its neighbourhood stays
// emphasized, and the rest of the graph dims back into context.
//
// This is a rendering/interaction layer on top of the normal Unstructured
// render — the base render, the dataset and the force simulation are never
// touched. Leaving the state restores the graph exactly as it was.

/** Live node lookup for the drill-down layer (positions live on these objects). */
function currentNodeById(): Map<string, NetworkNode> {
  return new Map((layoutNodes.value as NetworkNode[]).map(n => [n.id, n]))
}

/**
 * ── EXTERNAL REFERENCE HIGHLIGHT ─────────────────────────────────────────
 * The mode-specific applier, installed by whichever layout rendered last:
 * Unstructured installs a handleNodeHover bridge; Structured installs an
 * applyStructuredHoverIsolation bridge. One seam, no duplicate isolation
 * logic — the watcher below only resolves ids and delegates.
 */
let applyExternalHighlight: ((nodeId: string | null) => void) | null = null

/**
 * Resolve a reference id to the node the CANVAS can isolate. Entities are
 * not rendered as base nodes in either mode, so an entity reference resolves
 * to its owning cluster through the graph's own links — the same containment
 * relationship the layouts draw, never a text match.
 */
function resolveHighlightNodeId(refId: string): string | null {
  const byId = currentNodeById()
  const node = byId.get(refId)
  if (!node) return null
  if (node.kind !== 'entity') return node.id
  for (const link of props.links as any[]) {
    const sourceId = typeof link.source === 'object' ? link.source?.id : link.source
    const targetId = typeof link.target === 'object' ? link.target?.id : link.target
    const otherId = sourceId === refId ? targetId : targetId === refId ? sourceId : null
    if (!otherId) continue
    if (byId.get(otherId)?.kind === 'cluster') return otherId
  }
  return null
}

watch(() => props.highlightRefId, (refId) => {
  if (!applyExternalHighlight) return
  applyExternalHighlight(refId ? resolveHighlightNodeId(refId) : null)
})

/**
 * Frame the focused neighbourhood: the expanded regions plus the emphasized
 * base nodes around them (Sources, Insights, related clusters).
 *
 * Deliberately gentle — the scale is clamped to a band around the normal
 * fit-to-view transform, so entering drill-down never zooms so far that the
 * surrounding graph leaves the canvas. Camera only: no node moves, and the
 * global simulation is not restarted.
 */
function focusCameraOnDrilldown(model: DrilldownModel) {
  if (!svgRef.value || !zoomBehaviorInstance) return
  const nodeById = currentNodeById()
  const centers = computeRegionCenters(model, nodeById)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const include = (x: number, y: number, r: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    minX = Math.min(minX, x - r)
    minY = Math.min(minY, y - r)
    maxX = Math.max(maxX, x + r)
    maxY = Math.max(maxY, y + r)
  }

  for (const region of model.regions) {
    const c = centers.get(region.cluster.id)
    if (c) include(c.x, c.y, region.radius)
  }
  for (const id of model.emphasizedIds) {
    const node = nodeById.get(id)
    if (!node || node.kind === 'entity' || model.regionById.has(id)) continue
    include(node.x || 0, node.y || 0, getEffectiveNodeRadius(node as any, currentZoomScale))
  }
  if (!Number.isFinite(minX)) return

  const pad = EXPANDED_CLUSTER.camera.padding
  const boundsWidth = (maxX - minX) + pad * 2
  const boundsHeight = (maxY - minY) + pad * 2
  const initial = computeInitialTransform()
  const raw = Math.min(VIEWPORT.dataWidth / boundsWidth, VIEWPORT.dataHeight / boundsHeight)
  const scale = Math.min(
    Math.max(raw, initial.k * EXPANDED_CLUSTER.camera.minScaleFactor, VIEWPORT.zoomExtent[0]),
    initial.k * EXPANDED_CLUSTER.camera.maxScaleFactor,
    VIEWPORT.zoomExtent[1],
  )
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const transform = d3.zoomIdentity
    .translate(VIEWPORT.dataWidth / 2 - cx * scale, VIEWPORT.dataHeight / 2 - cy * scale)
    .scale(scale)

  d3.select(svgRef.value)
    .transition()
    .duration(EXPANDED_CLUSTER.camera.duration)
    .call(zoomBehaviorInstance.transform as any, transform)
}

/** Esc closes the drill-down — the keyboard equivalent of clicking the canvas. */
function handleDrilldownKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') exitDrilldown()
}

/**
 * Tear the focused layer down WITHOUT touching the camera. Used when the base
 * render is about to be rebuilt (data change, layout switch, unmount), where
 * restoring a stale camera would fight the new render's own framing.
 */
// Nodes pinned (fx/fy) for the duration of a drill-down: everything outside
// EXPANDED_CLUSTER.envelope.localRadius, plus the clicked cluster and its hub
// (the composition's anchor). Guarantees the expand settle is LOCAL — the far
// graph cannot move, and the clicked cluster cannot drift.
let drilldownPinnedNodes: any[] = []

function releaseDrilldownPins() {
  for (const n of drilldownPinnedNodes) {
    n.fx = null
    n.fy = null
  }
  drilldownPinnedNodes = []
}

function pinNodesForDrilldown(model: DrilldownModel) {
  releaseDrilldownPins() // re-targeting: pin relative to the NEW composition
  if (!simulation) return
  // Locality is measured against EVERY expanded region, not just the clicked
  // one: a related region's neighbourhood must stay free to move, otherwise
  // its envelope would contain pinned nodes the collision force (which exempts
  // fixed nodes) could never clear. Anchors: each region's cluster + its hub.
  const anchors = new Set<string>()
  const regionCenters: Array<{ x: number, y: number }> = []
  for (const region of model.regions) {
    anchors.add(region.cluster.id)
    if (region.hubId) anchors.add(region.hubId)
    regionCenters.push({ x: region.cluster.x || 0, y: region.cluster.y || 0 })
  }
  const localRadius = EXPANDED_CLUSTER.envelope.localRadius
  for (const n of simulation.nodes() as any[]) {
    const dist = Math.min(...regionCenters.map(c =>
      Math.hypot((n.x || 0) - c.x, (n.y || 0) - c.y)))
    if (anchors.has(n.id) || dist > localRadius) {
      n.fx = n.x
      n.fy = n.y
      drilldownPinnedNodes.push(n)
    }
  }
}

function teardownDrilldown() {
  if (expandedClusterIds.value.length === 0 && !drilldownHandle) return
  drilldownHandle?.destroy()
  drilldownHandle = null
  expandedClusterIds.value = []
  preDrilldownTransform = null
  // Drop the temporary envelope collision force: it exists only while a
  // cluster is expanded, so removing it is what lets the graph settle back to
  // its normal global spacing (the caller decides whether to reheat).
  simulation?.force('expandedEnvelope', null)
  // Unpin the far graph + anchors — collapse hands the layout back whole.
  releaseDrilldownPins()
  window.removeEventListener('keydown', handleDrilldownKeydown)
  // One place reports the state change, so a rebuild-driven teardown (data
  // change, layout switch) tells the host screen exactly like a user close does.
  emit('cluster-expand', null)
}

/**
 * (Re)build the focused layer for the CURRENT explicit expansion list.
 * Called on every list change — expanding a second cluster, or collapsing one
 * of several — so the composition always reflects exactly what the user opened.
 */
function applyDrilldown(newlyClickedId?: string) {
  if (props.layoutMode !== 'unstructured' || !svgRef.value) return
  const ids = expandedClusterIds.value
  if (ids.length === 0) { exitDrilldown(); return }
  const model = deriveDrilldown(layoutNodes.value as NetworkNode[], props.links, ids)
  if (!model) { exitDrilldown(); return }

  const svg = d3.select(svgRef.value)
  const viewport = svg.select<SVGGElement>('g.viewport')
  if (viewport.empty()) return

  // Growing/shrinking the composition keeps the ORIGINAL camera as the
  // restore point, so closing always returns where the user came from.
  const wasOpen = !!drilldownHandle
  drilldownHandle?.destroy()
  if (!wasOpen) preDrilldownTransform = currentZoomTransform
  // The focused camera is the user's camera now — stop the first-load refit.
  followInitialFit = false

  drilldownHandle = renderDrilldown(viewport as any, model, {
    nodeById: currentNodeById(),
    entityColor: nodeColor.value({ kind: 'entity' } as NetworkNode),
    themeColor,
    zoomScale: currentZoomScale,
    // Each region collapses individually; the composition rebuilds around
    // whatever the user still has open.
    onCollapse: (id: string) => collapseCluster(id),
  })
  applyDrilldownEmphasis(svg as any, model)
  focusCameraOnDrilldown(model)

  // Expanded regions become temporary occupied areas: a custom force on the
  // EXISTING simulation pushes nearby Insights / Sources / other clusters out
  // of the actual expanded bounds (+ safety gap), and eases Insights shared by
  // several regions into the gap between them. Registered here, removed by
  // teardownDrilldown — global spacing is only adjusted while expanded. The
  // gentle reheat lets the neighbourhood breathe apart without re-running the
  // whole layout.
  if (simulation) {
    // LOCAL settle only: pin the far graph and the anchors (every expanded
    // cluster + its hub) before reheating, so the envelope push rearranges
    // just the immediate neighbourhood and the expanded circles stay put.
    pinNodesForDrilldown(model)
    const envelopeForce = forceExpandedEnvelope(
      model,
      currentNodeById(),
      n => getEffectiveNodeRadius(n as any, 1),
    )
    simulation.force('expandedEnvelope', envelopeForce as any)
    // Deterministic warm-start: clearance is established synchronously, so it
    // never depends on how many ticks the reheat has before alphaMin.
    envelopeForce.presettle()
    simulation.alpha(EXPANDED_CLUSTER.envelope.reheatAlphaEnter).restart()
  }

  // Report the cluster the user just opened (list changes without a new
  // click — an individual collapse — report the remaining focus instead).
  emit('cluster-expand', newlyClickedId ?? ids[ids.length - 1])

  window.removeEventListener('keydown', handleDrilldownKeydown)
  window.addEventListener('keydown', handleDrilldownKeydown)
}

/** Explicitly expand one more cluster (user click). Never automatic. */
function expandCluster(clusterId: string) {
  if (expandedClusterIds.value.includes(clusterId)) return
  // TEMPORARY UI CONSTRAINT: at most `maxExpandedClusters` (4) open at once.
  // The list is ordered by click, so the cap is a FIFO window: expanding a
  // fifth cluster opens it and collapses the OLDEST one, always leaving the
  // four most recently expanded. The evicted cluster returns to a normal
  // collapsed node-circle — still visible and clickable, like every other
  // related collapsed cluster.
  const max = EXPANDED_CLUSTER.maxExpandedClusters
  const next = [...expandedClusterIds.value, clusterId]
  const evicted = next.length > max ? next.slice(0, next.length - max) : []
  expandedClusterIds.value = evicted.length > 0 ? next.slice(next.length - max) : next
  applyDrilldown(clusterId)
  // Tell the host screen why a cluster closed on its own — silent eviction
  // would read as a bug.
  if (evicted.length > 0) emit('expand-limit', max)
}

/** Collapse ONE expanded cluster; any others the user opened stay open. */
function collapseCluster(clusterId: string) {
  const remaining = expandedClusterIds.value.filter(id => id !== clusterId)
  if (remaining.length === 0) { exitDrilldown(); return }
  expandedClusterIds.value = remaining
  applyDrilldown()
}

/** Leave the drill-down entirely: normal Unstructured view and camera return. */
function exitDrilldown() {
  if (expandedClusterIds.value.length === 0 && !drilldownHandle) return
  const svg = svgRef.value ? d3.select(svgRef.value) : null
  // Captured BEFORE the teardown, which clears the stored camera.
  const restoreTo = preDrilldownTransform
  teardownDrilldown()
  // With the envelope force gone, a gentle reheat lets the pushed-aside
  // Insights/Sources settle back into the graph's normal spacing naturally.
  simulation?.alpha(EXPANDED_CLUSTER.envelope.reheatAlphaExit).restart()
  if (!svg) return
  clearDrilldownEmphasis(svg as any)
  if (restoreTo && zoomBehaviorInstance) {
    svg.transition()
      .duration(EXPANDED_CLUSTER.camera.duration)
      .call(zoomBehaviorInstance.transform as any, restoreTo)
  }
}

/**
 * Initialize or update the D3 visualization.
 * @param resetZoom - If true, fit the graph to the viewport. If false, preserve current zoom.
 */
function initializeVisualization(resetZoom = true) {
  // A rebuild wipes the SVG (and with it the focused layer): drop drill-down
  // state first so it can never outlive the elements it decorated.
  teardownDrilldown()
  resetStructuredFocusState()
  console.log(`[D3] initializeVisualization called with resetZoom=${resetZoom}, isFirstInitialization=${isFirstInitialization}, currentZoomTransform=${currentZoomTransform ? 'exists' : 'null'}`)
  if (!svgRef.value || !containerRef.value) return

  // ── SETUP SVG ─────────────────────────────────────────────────────────────────
  const svg = d3.select(svgRef.value)

  // ── DECLARE VARIABLES USED BY BOTH PATHS ──────────────────────────────────────
  let g: any = null
  let links: any
  let linksBackground: any
  let linkEndpoints: any
  let nodes: any
  let labelGroup: any
  let dataWidth = VIEWPORT.dataWidth
  let dataHeight = VIEWPORT.dataHeight

  // ── DISPATCH TO STRUCTURED RENDERER IF NEEDED ──────────────────────────────
  if (props.layoutMode === 'structured') {
    console.log(`[D3] Structured layout mode detected → delegating to useStructuredRenderer`)
    svg.selectAll('*').remove() // Clear SVG before structured render

    // Same viewBox as unstructured, set explicitly so structured never
    // depends on a previous unstructured render having configured the SVG.
    svg.attr('viewBox', [0, 0, dataWidth, dataHeight])
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('pointer-events', 'all')

    // The camera scale this render will be shown at: the initial fit when
    // resetting, otherwise the preserved transform. Passing it in lets
    // zoom-aware elements (constant-screen cluster labels) render at their
    // correct on-screen size from the very first paint, instead of being
    // corrected by the first zoom event.
    const structuredZoom = resetZoom
      ? computeInitialTransform().k
      : (currentZoomTransform?.k ?? 1)
    // Structured's reference-highlight seam: the SAME isolation pointer
    // hover applies, against the structured viewport group. Source/Document
    // hubs are not ring nodes here — their representation IS their cluster
    // neighborhoods (resolveClusterOwnerId's relationship, inverted), so a
    // hub reference isolates all of that hub's clusters at once.
    applyExternalHighlight = (id) => {
      if (!svgRef.value) return
      let target: string | string[] | null = id
      if (id) {
        const node = currentNodeById().get(id)
        if (node && (node.kind === 'source' || node.kind === 'document')) {
          target = (layoutNodes.value as NetworkNode[])
            .filter(n => n.kind === 'cluster' && resolveClusterOwnerId(n.id) === id)
            .map(n => n.id)
        }
      }
      applyStructuredHoverIsolation(
        d3.select(svgRef.value).select<SVGGElement>('g.viewport') as any,
        target,
      )
    }

    renderStructured(svgRef.value, layoutNodes.value as any, props.links, {
      width: VIEWPORT.dataWidth,
      height: VIEWPORT.dataHeight,
      zoom: structuredZoom,
      userInitials: props.userInitials,
      sentimentPercent: props.sentimentPercent,
      sentimentLabel: props.sentimentLabel,
      chartTheme: chartTheme.value,
      onClusterClick: (clusterId: string) => {
        emit('cluster-click', clusterId)
        toggleStructuredFocus(clusterId)
      },
    })

    // After structured rendering, select the viewport group that was just created
    // This allows zoom transforms to be applied below (same as unstructured path)
    g = svg.select('g.viewport')
    console.log(`[D3] Structured viewport group selected, proceeding to zoom setup`)
  } else {
    // ── UNSTRUCTURED RENDERING PATH ────────────────────────────────────────────

  // Preserve current zoom transform before clearing
  if (!resetZoom && currentZoomTransform) {
    console.log(`[D3] Preserving zoom transform: scale=${currentZoomTransform.k}, tx=${currentZoomTransform.x}, ty=${currentZoomTransform.y}`)
  }

  // Clear previous
  svg.selectAll('*').remove()

  // Setup SVG viewBox to match data coordinate space
  console.log(`[D3] Setting viewBox to ${dataWidth}x${dataHeight}`)
  svg.attr('viewBox', [0, 0, dataWidth, dataHeight])
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('pointer-events', 'all')

  // Groups for layers
  const defs = svg.append('defs')

  /*
   * ROUND CLIP for the source logo tiles. The assets are full-bleed SQUARES,
   * and a source icon now renders at the node's FULL diameter (zero inner
   * padding), so the square's corners must be clipped back to the circle —
   * the SVG equivalent of `object-fit: cover` on a round element.
   *
   * `clipPathUnits="objectBoundingBox"` makes the clip relative to each
   * image's own box (a unit circle at its centre), so ONE def serves every
   * source at every zoom level: the clip follows the image as the min-screen
   * clamp resizes it and as the node moves, with nothing to update per tick.
   */
  defs.append('clipPath')
    .attr('id', SOURCE_ICON_CLIP_ID)
    .attr('clipPathUnits', 'objectBoundingBox')
    .append('circle')
    .attr('cx', 0.5)
    .attr('cy', 0.5)
    .attr('r', 0.5)

  // Arrow marker for directed links
  defs.append('marker')
    .attr('id', 'arrowhead')
    .attr('markerWidth', 10)
    .attr('markerHeight', 10)
    .attr('refX', 9)
    .attr('refY', 3)
    .attr('orient', 'auto')
    .append('polygon')
    .attr('points', '0 0, 10 3, 0 6')
    .attr('fill', withAlpha(chartTheme.value.ink, 0.4))

  /*
   * INSIGHT GLOW — the warm halo every Insight node carries.
   *
   * An SVG <filter> rather than a CSS `filter`: D3 sets these circles'
   * paint as presentation ATTRIBUTES, and the CSS property competes with the
   * `filter` attribute (and with the hover rule in this component's
   * stylesheet), so the effect belongs in the SVG where the render pipeline
   * cannot drop it.
   *
   * The region is widened well past the default (−10% … 120%): on a ~20px
   * insight that default left ~2px of margin and cut the halo off square,
   * which looked exactly like a filter that was not applying. All values
   * come from NODE_STYLING.insight.glow.
   */
  const insightGlow = NODE_STYLING.insight.glow
  const glowMargin = insightGlow.regionMargin
  defs.append('filter')
    .attr('id', 'insight-shadow')
    .attr('x', `${-glowMargin * 100}%`)
    .attr('y', `${-glowMargin * 100}%`)
    .attr('width', `${(1 + glowMargin * 2) * 100}%`)
    .attr('height', `${(1 + glowMargin * 2) * 100}%`)
    .append('feDropShadow')
    .attr('dx', 0)
    .attr('dy', 0)
    // CSS blur radius → feDropShadow stdDeviation (CSS blur = 2 × stdDev)
    .attr('stdDeviation', insightGlow.blur / 2)
    .attr('flood-color', insightGlow.color)
    .attr('flood-opacity', insightGlow.opacity)

  /*
   * HOVER GLOW — the same construction, wider and warm-white, swapped in by
   * the `:hover` rule in this component's stylesheet. Two defs rather than an
   * animated one: a filter's primitives are shared by every element that
   * references it, so per-element hover state has to be a different filter.
   */
  const insightHoverGlow = NODE_STYLING.insight.hover.glow
  const hoverMargin = insightHoverGlow.regionMargin
  defs.append('filter')
    .attr('id', 'insight-shadow-hover')
    .attr('x', `${-hoverMargin * 100}%`)
    .attr('y', `${-hoverMargin * 100}%`)
    .attr('width', `${(1 + hoverMargin * 2) * 100}%`)
    .attr('height', `${(1 + hoverMargin * 2) * 100}%`)
    .append('feDropShadow')
    .attr('dx', 0)
    .attr('dy', 0)
    .attr('stdDeviation', insightHoverGlow.blur / 2)
    .attr('flood-color', insightHoverGlow.color)
    .attr('flood-opacity', insightHoverGlow.opacity)

  // Blur filter for connection line glow and endpoints
  // Every def a connection references — the luminous foreground gradient, the
  // atmospheric background gradient, the background blur and the endpoint blur.
  // Built by the shared builder, which the Structured pass calls too: a paint
  // server and a filter are per-SVG, and each mode rebuilds the document, so one
  // builder is what keeps them identical instead of hand-matched. The layer
  // STYLES that reference them are shared the same way (see linkRenderer.ts).
  appendLinkDefs(defs as any)

    // The dot grid is NOT drawn here. Anything inside this <svg> lives in the
    // 800×600 data space and is scaled to fit the container, so an SVG pattern
    // grew with the window. It is painted in CSS on the container instead —
    // see BACKGROUND_PATTERN in graphTokens.ts and the stylesheet below.
    g = svg.append('g')
      .attr('class', 'viewport')
      .style('pointer-events', 'auto')

  // Link layer groups (layered: background → foreground → endpoints)
  const linkGroup = g!.append('g').attr('class', 'links')
    .style('pointer-events', 'none')
  const linksBackgroundGroup = linkGroup.append('g').attr('class', 'links-background')
  const linksForegroundGroup = linkGroup.append('g').attr('class', 'links-foreground')
  const linkEndpointsGroup = linkGroup.append('g').attr('class', 'link-endpoints')

  const nodeGroup = g!.append('g').attr('class', 'nodes')
    .style('pointer-events', 'auto')
  labelGroup = g!.append('g').attr('class', 'labels')

  // Filter out entity nodes only - documents should be visible on canvas
  const visibleNodes = layoutNodes.value.filter((n: any) => n.kind !== 'entity')

  // Prepare links (only between visible nodes)
  const visibleNodeIds = new Set(visibleNodes.map((n: any) => n.id))

  // ── PRE-SOLVE THE UNSTRUCTURED LAYOUT (before anything is drawn) ──────────
  // The simulation is built, seeded from the graph's topology and warmed up
  // OFF-SCREEN here, so the geometry every element below is drawn with is
  // already the settled layout. Without this, nodes were painted at their
  // authored positions and then visibly slid around for seconds while the
  // force ran at full alpha. The tick handler and drag are wired further
  // down, once the nodes exist; the simulation stays stopped until then.
  if (props.layoutMode === 'unstructured') {
    const visibleLinks = props.links.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id
      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)
    })
    // Re-seed only on a full (re)entry into the view. An in-place rebuild
    // that preserves the camera also preserves where the user left the graph.
    if (resetZoom) {
      seedInitialLayout(visibleNodes as any, visibleLinks, { width: dataWidth, height: dataHeight })
    }
    simulation = createForceSimulation(visibleNodes, visibleLinks, {
      width: dataWidth,
      height: dataHeight,
    })
    warmupSimulation(simulation)
  }
  /*
   * The RENDERED link set: the dataset's own cross-group cluster bridges are
   * dropped and re-derived here, from the positions the pre-solve just settled
   * (seedInitialLayout + warmupSimulation above). Choosing them at this point
   * is what makes "nearest group" mean nearest ON SCREEN — the authored
   * coordinates the dataset can see are re-arranged by the orbit and
   * hub-separation forces before anything is drawn.
   */
  const linkData = withProximityBridges(props.links, layoutNodes.value as any)
    .map(link => ({
      source: typeof link.source === 'string'
        ? layoutNodes.value.find(n => n.id === link.source)
        : link.source,
      target: typeof link.target === 'string'
        ? layoutNodes.value.find(n => n.id === link.target)
        : link.target,
      kind: link.kind,
    }))
    .filter(link => link.source && link.target && visibleNodeIds.has(link.source.id) && visibleNodeIds.has(link.target.id))

  // Draw background link lines (blurred atmospheric glow)
  linksBackground = linksBackgroundGroup
    .selectAll('line.link-line-background')
    .data(linkData, (d: any) => `${d.source?.id || ''}-${d.target?.id || ''}`)
    .enter()
    .append('line')
    .attr('class', 'link-line-background')
    // Style from the shared connection language (linkRenderer.ts) — the same
    // functions the Structured focus applies, so the two cannot drift apart.
    .each(function (this: SVGLineElement, d: any) {
      applyLinkBackgroundStyle(d3.select(this), { zoomScale: currentZoomScale, kind: d.kind })
    })
    .attr('x1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.x
    })
    .attr('y1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.y
    })
    .attr('x2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.x
    })
    .attr('y2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.y
    })

  // Draw foreground link lines (sharp luminous gradient)
  links = linksForegroundGroup
    .selectAll('line.link-line-foreground')
    .data(linkData, (d: any) => `${d.source?.id || ''}-${d.target?.id || ''}`)
    .enter()
    .append('line')
    .attr('class', 'link-line-foreground')
    .each(function (this: SVGLineElement, d: any) {
      applyLinkForegroundStyle(d3.select(this), { zoomScale: currentZoomScale, kind: d.kind })
    })
    .attr('x1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.x
    })
    .attr('y1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.y
    })
    .attr('x2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.x
    })
    .attr('y2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.y
    })

  // Draw endpoint circles (1px white, blurred)
  // Store reference to linkData for use in tick handler
  const linkEndpointData = linkData.map((link: any) => ({
    source: link.source,
    target: link.target,
    kind: link.kind,
  }))
  linkEndpoints = linkEndpointsGroup
    .selectAll('circle.link-endpoint')
    .data(linkEndpointData.flatMap((link: any) => [
      { ...link, endpoint: 'source' },
      { ...link, endpoint: 'target' },
    ]), (d: any, i: number) => `${d.source?.id || ''}-${d.target?.id || ''}-${d.endpoint}`)
    .enter()
    .append('circle')
    .attr('class', 'link-endpoint')
    .each(function (this: SVGCircleElement) {
      applyLinkEndpointStyle(d3.select(this), currentZoomScale)
    })
    .attr('cx', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return d.endpoint === 'source' ? endpoints.source.x : endpoints.target.x
    })
    .attr('cy', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return d.endpoint === 'source' ? endpoints.source.y : endpoints.target.y
    })

  setupLinkInteraction(links, linksBackground, currentZoomScale)

  // Draw nodes (using graphTokens for sizing and styling)
  nodes = nodeGroup
    .selectAll('circle.node-circle')
    .data(visibleNodes, (d: any) => d.id)
    .enter()
    .append('circle')
    .attr('class', (d: any) => d.kind === 'insight' ? 'node-circle insight-node' : 'node-circle')
    .attr('cx', (d: any) => d.x || 0)
    .attr('cy', (d: any) => d.y || 0)
    // Single source of truth: same effective radius the link endpoint
    // geometry uses (includes the source nodes' 16px min screen diameter).
    .attr('r', (d: any) => getEffectiveNodeRadius(d, currentZoomScale))
    .attr('fill', (d: any) => {
      const style = NODE_STYLING[d.kind as keyof typeof NODE_STYLING]
      if (style?.fill === 'none') return 'none'
      if (style?.fill === 'theme') return nodeColor.value(d)
      return style?.fill || nodeColor.value(d)
    })
    .attr('stroke', (d: any) => {
      const style = NODE_STYLING[d.kind as keyof typeof NODE_STYLING]
      return style?.stroke || 'none'
    })
    .attr('stroke-width', (d: any) => getNodeStrokeWidth(d.kind, currentZoomScale))
    .attr('stroke-dasharray', (d: any) => {
      const style = NODE_STYLING[d.kind as keyof typeof NODE_STYLING]
      return style?.strokeDasharray || 'none'
    })
    .attr('filter', (d: any) => {
      if (d.kind === 'insight') return 'url(#insight-shadow)'
      return 'none'
    })
    .attr('opacity', 1)
    .style('pointer-events', 'auto')

  // Add icons to source and document nodes, centered on the node.
  // Both live in data space at their base token size so they scale naturally
  // with their node when zooming (no inverse-zoom compensation).
  const sourceIconDiameter = getSourceIconDiameter(currentZoomScale)
  const documentIconDiameter = getDocumentIconDiameter(currentZoomScale)
  nodes.each(function (this: any, nodeData: any) {
    const parentNode = this.parentNode as SVGElement | null
    if (!parentNode) return

    // Determine icon href based on node kind
    let iconHref: string | null = null
    if (nodeData.kind === 'source') {
      // Theme-surface tile + brand glyph (sourceNodeIcons.ts) — the graph-node
      // variant of the brand assets; chips keep the original brand tiles.
      iconHref = getSourceNodeIcon(nodeData.id)
    } else if (nodeData.kind === 'document') {
      // Built at render time so the tile reads the LIVE theme surface token
      // (the dataset module loads pre-mount). Same renderer Structured uses.
      iconHref = documentNodeIconFor(nodeData.ext)
    }

    // Render icon (class + size differ by kind, see comment above)
    if (iconHref) {
      const isSource = nodeData.kind === 'source'
      const iconDiameter = isSource ? sourceIconDiameter : documentIconDiameter
      d3.select(parentNode as any)
        .insert('image', ':first-child')
        .datum(nodeData)
        .attr('class', isSource ? 'source-icon' : 'document-icon')
        .attr('x', (nodeData.x || 0) - iconDiameter / 2)
        .attr('y', (nodeData.y || 0) - iconDiameter / 2)
        .attr('width', iconDiameter)
        .attr('height', iconDiameter)
        .attr('href', iconHref)
        // Both hub kinds are full-bleed SQUARE tiles filling the whole
        // circle, so both are clipped back to it.
        .attr('clip-path', `url(#${SOURCE_ICON_CLIP_ID})`)
        .attr('opacity', SOURCE_NODES.icon.opacity)
    }
  })

  // Add labels for source nodes (using graphTokens positioning and inverse zoom scaling)
  labelGroup
    .selectAll('text.source-label')
    .data(layoutNodes.value.filter((n: any) => n.kind === 'source'))
    .enter()
    .append('text')
    .attr('class', 'source-label')
    .attr('x', (d: any) => (d.x || 0) + TYPOGRAPHY.source.offsetX)
    .attr('y', (d: any) => (d.y || 0) + TYPOGRAPHY.source.offsetY)
    .attr('text-anchor', 'start')
    .attr('dominant-baseline', 'middle')
    .attr('font-family', TYPOGRAPHY.source.fontFamily)
    .attr('font-size', getScaledLabelFontSize('source', currentZoomScale))
    .attr('font-style', TYPOGRAPHY.source.fontStyle)
    .attr('font-weight', TYPOGRAPHY.source.fontWeight)
    .attr('fill', chartTheme.value.ink)
    .attr('opacity', TYPOGRAPHY.restingOpacity)
    .style('line-height', `${TYPOGRAPHY.source.lineHeight}px`)
    // Text stroke for readability: outline effect
    .style('-webkit-text-stroke-color', (TYPOGRAPHY.source as any).textStroke)
    .style('-webkit-text-stroke-width', `${(TYPOGRAPHY.source as any).textStrokeWidth}px`)
    .text((d: any) => d.id)

  // Add labels for document nodes (positioned to the right, same as source)
  labelGroup
    .selectAll('text.document-label')
    .data(layoutNodes.value.filter((n: any) => n.kind === 'document'))
    .enter()
    .append('text')
    .attr('class', 'document-label')
    .attr('x', (d: any) => (d.x || 0) + TYPOGRAPHY.document.offsetX)
    .attr('y', (d: any) => (d.y || 0) + TYPOGRAPHY.document.offsetY)
    .attr('text-anchor', 'start')
    .attr('dominant-baseline', 'middle')
    .attr('font-family', TYPOGRAPHY.document.fontFamily)
    .attr('font-size', getScaledLabelFontSize('document', currentZoomScale))
    .attr('font-style', TYPOGRAPHY.document.fontStyle)
    .attr('font-weight', TYPOGRAPHY.document.fontWeight)
    .attr('fill', chartTheme.value.ink)
    .attr('opacity', TYPOGRAPHY.restingOpacity)
    .style('line-height', `${TYPOGRAPHY.document.lineHeight}px`)
    // Text stroke for readability: outline effect (same as source)
    .style('-webkit-text-stroke-color', (TYPOGRAPHY.document as any).textStroke)
    .style('-webkit-text-stroke-width', `${(TYPOGRAPHY.document as any).textStrokeWidth}px`)
    .text((d: any) => d.label || d.id)

  // Keep endpoint dots in sync with the link highlight state: dots belonging to
  // unrelated/dimmed links are fully hidden while a node is hovered/selected,
  // and restored to their default appearance when the highlight clears.
  // Opacity only — link geometry and getConnectionEndpoints() are untouched.
  const applyEndpointSelection = (selectedNodes: Set<string>) => {
    svg.selectAll('circle.link-endpoint').attr('opacity', (d: any) => {
      if (selectedNodes.size === 0) return LINK_STYLING.endpoints.opacity
      return (selectedNodes.has(d.source.id) && selectedNodes.has(d.target.id))
        ? LINK_STYLING.endpoints.opacity
        : 0
    })
  }

  /*
   * Labels are REVEALED, not dimmed. At rest nothing is labelled
   * (TYPOGRAPHY.restingOpacity); on hover/focus the same connected-node set the
   * node/link/endpoint highlight uses gets its labels at full emphasis, and
   * everything else stays hidden rather than dropping to a dim tier — with the
   * resting state already blank, a "dimmed" label would be the only text on
   * screen competing with the one the user is actually pointing at.
   *
   * Opacity only: the text never leaves the DOM, so there is no layout shift,
   * no re-measure, and the node data behind each label is untouched.
   */
  const applyLabelSelection = (selectedNodes: Set<string>) => {
    const resting = TYPOGRAPHY.restingOpacity
    svg.selectAll('text.source-label')
      .attr('opacity', (d: any) =>
        selectedNodes.has(d.id) ? TYPOGRAPHY.source.opacity : resting)
    svg.selectAll('text.document-label')
      .attr('opacity', (d: any) =>
        selectedNodes.has(d.id) ? TYPOGRAPHY.document.opacity : resting)
  }

  // Keep node icons in sync with the same connected-node set: icons inside the
  // hovered node and its direct neighbors stay fully visible, icons inside
  // unrelated (dimmed) nodes dim with their node instead of staying bright.
  // Icons are rendered as siblings of the node circles (not per-node groups),
  // so their opacity is synced per element like labels/endpoints. Covers every
  // Unstructured node icon (source + document images).
  const applyIconSelection = (selectedNodes: Set<string>) => {
    svg.selectAll('image.source-icon, image.document-icon')
      .attr('opacity', (d: any) =>
        selectedNodes.size === 0 || selectedNodes.has(d.id) ? SOURCE_NODES.icon.opacity : 0.2)
  }

  // Handle hover highlighting
  const handleNodeHover = (nodeId: string | null, allNodes: NetworkNode[], allLinks: any[]) => {
    // While a cluster is expanded, the drill-down owns emphasis on the canvas —
    // a base hover would fight its dim state. Hover inside the expanded view is
    // handled by the focused layer itself (entity hover isolates its paths).
    if (expandedClusterIds.value.length > 0) return
    if (nodeId) {
      const connected = highlightConnectedNodes(nodeId, allNodes, allLinks)
      applyNodeSelection(nodes, connected)
      applyLinkSelection(links, linksBackground, connected)
      applyEndpointSelection(connected)
      applyLabelSelection(connected)
      applyIconSelection(connected)
    } else {
      // Clear hover highlight, but keep click selection if active
      if (selectedCluster.value) {
        const connected = highlightConnectedNodes(selectedCluster.value, allNodes, allLinks)
        applyNodeSelection(nodes, connected)
        applyLinkSelection(links, linksBackground, connected)
        applyEndpointSelection(connected)
        applyLabelSelection(connected)
        applyIconSelection(connected)
      } else {
        const empty = new Set<string>()
        applyNodeSelection(nodes, empty)
        applyLinkSelection(links, linksBackground, empty)
        applyEndpointSelection(empty)
        applyLabelSelection(empty)
        applyIconSelection(empty)
      }
    }
  }

  // The reference-highlight seam takes the SAME path a pointer hover takes.
  applyExternalHighlight = id => handleNodeHover(id, layoutNodes.value as any, linkData)

  setupNodeInteraction(
    nodes,
    (nodeId: string) => {
      const clicked = layoutNodes.value.find((n: any) => n.id === nodeId) as NetworkNode | undefined

      // Clicking a Cluster in Unstructured mode toggles ITS expansion —
      // clicking a collapsed cluster (related or not) expands only that
      // cluster, ADDING it to whatever the user already has open; clicking an
      // expanded one collapses just it. Never auto-expands anything else.
      if (props.layoutMode === 'unstructured' && clicked?.kind === 'cluster') {
        if (expandedClusterIds.value.includes(nodeId)) collapseCluster(nodeId)
        else expandCluster(nodeId)
        emit('cluster-click', nodeId)
        return
      }

      // Any NON-cluster node clicked while drilled down closes the focused
      // view — the base selection below owns the canvas again.
      if (expandedClusterIds.value.length > 0) {
        exitDrilldown()
        return
      }

      /*
       * Clicking a SOURCE frames its own neighbourhood: that hub plus the
       * clusters actually bound to it, and nothing else. Membership comes from
       * the resolved link list rather than an id convention, so "connected"
       * means a real relationship. Reset returns to the initial framing.
       */
      if (props.layoutMode === 'unstructured' && clicked?.kind === 'source') {
        const endpointId = (e: any) => (typeof e === 'string' ? e : e?.id)
        const group = new Map<string, any>([[clicked.id, clicked]])
        for (const link of linkData as any[]) {
          const sId = endpointId(link.source)
          const tId = endpointId(link.target)
          if (sId !== nodeId && tId !== nodeId) continue
          const other = sId === nodeId ? link.target : link.source
          if (other && typeof other === 'object' && other.kind === 'cluster') {
            group.set(other.id, other)
          }
        }
        fitCameraToNodes([...group.values()])
        emit('cluster-click', nodeId)
        return
      }

      selectedCluster.value = selectedCluster.value === nodeId ? null : nodeId
      emit('cluster-click', nodeId)

      // Update highlighted nodes
      if (selectedCluster.value) {
        const connected = highlightConnectedNodes(selectedCluster.value, layoutNodes.value, linkData)
        highlightedNodes.value = connected
        applyNodeSelection(nodes, connected)
        applyLinkSelection(links, linksBackground, connected)
        applyEndpointSelection(connected)
        applyLabelSelection(connected)
        applyIconSelection(connected)
      } else {
        highlightedNodes.value.clear()
        applyNodeSelection(nodes, highlightedNodes.value)
        applyLinkSelection(links, linksBackground, highlightedNodes.value)
        applyEndpointSelection(highlightedNodes.value)
        applyLabelSelection(highlightedNodes.value)
        applyIconSelection(highlightedNodes.value)
      }
    },
    handleNodeHover,
    layoutNodes.value,
    linkData,
  )

  // Wire up the pre-solved simulation (created and warmed up above, before
  // anything was drawn — see the PRE-SOLVE block).
  if (props.layoutMode === 'unstructured' && simulation) {
    // Apply drag behavior to nodes
    nodes.call(createDragBehavior(simulation))
    // Grabbing a node restarts the simulation — hand the camera to the user
    // so the settle-follow refit can't fight the drag.
    nodes.on('pointerdown.followfit', () => {
      followInitialFit = false
    })

    simulation.on('tick', () => {
      // === TEMPORARY DIAGNOSTIC: TICK MONITORING ===
      if (tickCount % 30 === 0) { // Log every 30th tick to avoid spam
        const g = svg.select('g.viewport')
        const linkGroup = g.select('g.links')
        const foregroundLinks = linkGroup.select('g.links-foreground').selectAll('line.link-line-foreground')
        const linksCount = foregroundLinks.size()
        if (linksCount > 0) {
          console.log(`[D3-TICK] Tick ${tickCount}: ${linksCount} foreground links in DOM`)
          // Sample first link
          let sampleLogged = false
          foregroundLinks.each(function (d: any, i: number) {
            if (sampleLogged) return
            sampleLogged = true
            const elem = d3.select(this)
            const x1 = elem.attr('x1')
            const y1 = elem.attr('y1')
            const x2 = elem.attr('x2')
            const y2 = elem.attr('y2')
            const sourceId = d.source?.id || 'unknown'
            const targetId = d.target?.id || 'unknown'
            console.log(`[D3-TICK] Sample link (${sourceId}→${targetId}): x1=${x1} y1=${y1} x2=${x2} y2=${y2}`)
          })
        } else {
          console.log(`[D3-TICK] Tick ${tickCount}: NO foreground links in DOM!`)
        }
      }
      tickCount++

      // IMPORTANT: Re-select all elements each tick to include newly added elements from Timeline filtering.
      // Don't use captured selections; dynamically query the DOM to ensure all elements are updated.
      const g = svg.select('g.viewport')
      const linkGroup = g.select('g.links')

      // Update foreground link positions (scale normally with zoom)
      linkGroup.select('g.links-foreground').selectAll('line.link-line-foreground')
        .attr('x1', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.source.x
        })
        .attr('y1', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.source.y
        })
        .attr('x2', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.target.x
        })
        .attr('y2', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.target.y
        })

      // Update background link positions
      linkGroup.select('g.links-background').selectAll('line.link-line-background')
        .attr('x1', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.source.x
        })
        .attr('y1', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.source.y
        })
        .attr('x2', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.target.x
        })
        .attr('y2', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.target.y
        })

      // Update endpoint positions (always use current node coordinates, not static copies)
      linkGroup.select('g.link-endpoints').selectAll('circle.link-endpoint')
        .attr('cx', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return d.endpoint === 'source' ? endpoints.source.x : endpoints.target.x
        })
        .attr('cy', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return d.endpoint === 'source' ? endpoints.source.y : endpoints.target.y
        })

      // Update node positions (scale normally with zoom)
      g.select('g.nodes').selectAll('circle.node-circle')
        .attr('cx', (d: any) => d.x || 0)
        .attr('cy', (d: any) => d.y || 0)

      // Update icon positions (both icon kinds at natural data-space size)
      const sourceIconHalf = getSourceIconDiameter(currentZoomScale) / 2
      svg.selectAll('image.source-icon')
        .attr('x', (d: any) => (d.x || 0) - sourceIconHalf)
        .attr('y', (d: any) => (d.y || 0) - sourceIconHalf)
      const documentIconHalf = getDocumentIconDiameter(currentZoomScale) / 2
      svg.selectAll('image.document-icon')
        .attr('x', (d: any) => (d.x || 0) - documentIconHalf)
        .attr('y', (d: any) => (d.y || 0) - documentIconHalf)

      // Update source labels with graphTokens positioning
      g.select('g.labels').selectAll('text.source-label')
        .attr('x', (d: any) => (d.x || 0) + TYPOGRAPHY.source.offsetX)
        .attr('y', (d: any) => (d.y || 0) + TYPOGRAPHY.source.offsetY)

      // Update document labels with graphTokens positioning
      g.select('g.labels').selectAll('text.document-label')
        .attr('x', (d: any) => (d.x || 0) + TYPOGRAPHY.document.offsetX)
        .attr('y', (d: any) => (d.y || 0) + TYPOGRAPHY.document.offsetY)

      // First-load framing: keep the whole graph in view while the layout
      // settles. Camera-only — node positions and physics are untouched. Stops
      // once the simulation has cooled (or on any user interaction, see the
      // zoom handler / applyZoomScale / updateVisualizationForFilter).
      if (followInitialFit && zoomBehaviorInstance) {
        if (simulation && simulation.alpha() < 0.05) {
          followInitialFit = false
        }
        svg.call(zoomBehaviorInstance.transform, computeInitialTransform())
      }

      // Keep the focused layer glued to the base positions it is derived from
      // (a dragged Source carries its expanded region and entities along).
      // Geometry only — the drill-down never writes back into the simulation.
      drilldownHandle?.update(currentZoomScale)

      // Re-clip the backdrop glass to wherever the nodes just moved to.
      updateNodeGlass()
    })

    // The layout is already solved; this is the small natural adjustment pass
    // on top of it, not the run that produces it. Low alpha = the graph is
    // alive and settles in a moment, instead of reflowing on screen.
    simulation.alpha(FORCE_SIMULATION.initialSettleAlpha).restart()
  } else {
    // Static hierarchical layout
    nodes
      .attr('cx', (d: any) => d.x || 0)
      .attr('cy', (d: any) => d.y || 0)

    // Position foreground links
    links
      .attr('x1', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.source.x
      })
      .attr('y1', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.source.y
      })
      .attr('x2', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.target.x
      })
      .attr('y2', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.target.y
      })

    // Position background links
    linksBackground
      .attr('x1', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.source.x
      })
      .attr('y1', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.source.y
      })
      .attr('x2', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.target.x
      })
      .attr('y2', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.target.y
      })

    // Position endpoint circles (use current node coordinates)
    linkEndpoints
      .attr('cx', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return d.endpoint === 'source' ? endpoints.source.x : endpoints.target.x
      })
      .attr('cy', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return d.endpoint === 'source' ? endpoints.source.y : endpoints.target.y
      })

    // Position icons (both icon kinds at natural data-space size)
    const sourceIconHalf = getSourceIconDiameter(currentZoomScale) / 2
    svg.selectAll('image.source-icon')
      .attr('x', (d: any) => (d.x || 0) - sourceIconHalf)
      .attr('y', (d: any) => (d.y || 0) - sourceIconHalf)
    const documentIconHalf = getDocumentIconDiameter(currentZoomScale) / 2
    svg.selectAll('image.document-icon')
      .attr('x', (d: any) => (d.x || 0) - documentIconHalf)
      .attr('y', (d: any) => (d.y || 0) - documentIconHalf)

    // Position labels using graphTokens offsets
    labelGroup.selectAll('text.source-label')
      .attr('x', (d: any) => (d.x || 0) + TYPOGRAPHY.source.offsetX)
      .attr('y', (d: any) => (d.y || 0) + TYPOGRAPHY.source.offsetY)

    labelGroup.selectAll('text.document-label')
      .attr('x', (d: any) => (d.x || 0) + TYPOGRAPHY.document.offsetX)
      .attr('y', (d: any) => (d.y || 0) + TYPOGRAPHY.document.offsetY)
    }
  } // End of else (unstructured rendering)

  // Setup D3 zoom and pan — applies to both structured and unstructured modes.
  // Both clamp the MINIMUM zoom relative to the initial fit-to-view scale: the
  // first-entry framing is already the complete graph, so zooming out much
  // past it only shrinks nodes/labels below readability. Structured clamps to
  // the exact fit; Unstructured allows a small margin below it
  // (minZoomOutFactor). Gesture-level only (wheel, pinch, and the +/− buttons
  // via scaleBy all route through this extent) — the initial fit is applied
  // with zoom.transform, which d3 never clamps, so first-entry framing and
  // Reset are unchanged.
  const scaleExtent: [number, number] = props.layoutMode === 'structured'
    ? [computeInitialTransform().k, VIEWPORT.zoomExtent[1]]
    : [
        Math.max(VIEWPORT.zoomExtent[0], computeInitialTransform().k * VIEWPORT.minZoomOutFactor),
        VIEWPORT.zoomExtent[1],
      ]
  zoomBehaviorInstance = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent(scaleExtent)
    .wheelDelta((event) => {
      // Invert scroll direction: up scrolls = zoom out, down scrolls = zoom in
      const deltaSensitivity = event.deltaMode === 1
        ? VIEWPORT.wheelDeltaSensitivity.line
        : event.deltaMode
          ? 1
          : VIEWPORT.wheelDeltaSensitivity.pixel
      return -event.deltaY * deltaSensitivity * VIEWPORT.wheelDeltaSensitivity.multiplier
    })
    .on('zoom', (event) => {
      console.log(`[D3 Zoom Event] scale=${event.transform.k}, tx=${event.transform.x}, ty=${event.transform.y}`)
      // A real user gesture (wheel/drag — sourceEvent present) takes over the
      // camera: stop the first-load settle-follow refit.
      if (event.sourceEvent) {
        followInitialFit = false
      }
      currentZoomTransform = event.transform
      currentZoomScale = event.transform.k // Track zoom scale for constant-screen rendering

      // Apply constant-screen rendering: update non-position attributes with inverse zoom scale (unstructured only)
      if (props.layoutMode === 'unstructured') {
        const inverseScale = getInverseZoomScale(currentZoomScale)

        // Update foreground link stroke widths
        links.attr('stroke-width', (d: any) => getLinkStrokeWidth(d.kind, currentZoomScale))

        // Update background link stroke widths (wider for glow effect)
        linksBackground.attr('stroke-width', (d: any) => getLinkStrokeWidth(d.kind, currentZoomScale) * 1.5)

        // Update endpoint circle radii
        linkEndpoints.attr('r', LINK_STYLING.endpoints.radius * inverseScale)

        // Update node stroke widths
        nodes.attr('stroke-width', (d: any) => getNodeStrokeWidth(d.kind, currentZoomScale))

        // EVERY node kind holds its own minimum on-screen diameter (source 12,
        // cluster 14, insight 24 — the ordered clamp ladder that keeps the
        // Source < Cluster < Insight hierarchy true at every zoom level; see
        // getEffectiveNodeRadius). At normal zoom each keeps its base size and
        // scales naturally; zoomed out past its clamp it resizes to hold the
        // floor. Sources/documents also resize their icons with the circle,
        // preserving `icon + 2 × padding = node diameter`.
        nodes.attr('r', (d: any) => getEffectiveNodeRadius(d, currentZoomScale))
        const docIconDiam = getDocumentIconDiameter(currentZoomScale)
        const docIconHalf = docIconDiam / 2
        svg.selectAll('image.document-icon')
          .attr('width', docIconDiam)
          .attr('height', docIconDiam)
          .attr('x', (d: any) => (d.x || 0) - docIconHalf)
          .attr('y', (d: any) => (d.y || 0) - docIconHalf)
        const srcIconDiam = getSourceIconDiameter(currentZoomScale)
        const srcIconHalf = srcIconDiam / 2
        svg.selectAll('image.source-icon')
          .attr('width', srcIconDiam)
          .attr('height', srcIconDiam)
          .attr('x', (d: any) => (d.x || 0) - srcIconHalf)
          .attr('y', (d: any) => (d.y || 0) - srcIconHalf)

        // Keep link geometry on the node boundary: the source nodes'
        // EFFECTIVE radius is zoom-dependent (16px minimum screen diameter),
        // so every endpoint touching a source moves when the zoom scale
        // changes. Same single source of truth as the circle radii above.
        // Re-query the DOM (like the tick handler) so links added by
        // timeline filtering are included.
        const endpointsFor = (d: any) => getConnectionEndpoints(
          d.source, d.target,
          getNodeRadiusFromData(d.source), getNodeRadiusFromData(d.target),
          undefined, currentZoomScale,
        )
        const viewportSel = svg.select('g.viewport')
        const setLineGeometry = (sel: any) => sel
          .attr('x1', (d: any) => endpointsFor(d).source.x)
          .attr('y1', (d: any) => endpointsFor(d).source.y)
          .attr('x2', (d: any) => endpointsFor(d).target.x)
          .attr('y2', (d: any) => endpointsFor(d).target.y)
        setLineGeometry(viewportSel.selectAll('line.link-line-foreground'))
        setLineGeometry(viewportSel.selectAll('line.link-line-background'))
        viewportSel.selectAll('circle.link-endpoint')
          .attr('cx', (d: any) => d.endpoint === 'source' ? endpointsFor(d).source.x : endpointsFor(d).target.x)
          .attr('cy', (d: any) => d.endpoint === 'source' ? endpointsFor(d).source.y : endpointsFor(d).target.y)

        // Update label font sizes (natural scaling with an 11px on-screen floor)
        labelGroup.selectAll('text.source-label')
          .attr('font-size', getScaledLabelFontSize('source', currentZoomScale))

        labelGroup.selectAll('text.document-label')
          .attr('font-size', getScaledLabelFontSize('document', currentZoomScale))

        // Re-setup link interaction with current zoom scale for hover effects
        setupLinkInteraction(links, linksBackground, currentZoomScale)

        // The focused layer follows the same constant-screen conventions
        // (stroke widths, label floors), so it re-sizes with the zoom too.
        drilldownHandle?.update(currentZoomScale)
      } else {
        // Structured: cluster labels are constant-screen with a zoom-out ease:
        // 12px on screen through the normal range, smoothly shrinking to 9px
        // across the last stretch of zoom-out toward the minimum zoom (the
        // fit-to-view scale — scaleExtent's floor, never a hardcoded k). Same
        // helper as the initial render, so the two can never diverge.
        svg.selectAll('text.cluster-label')
          .attr('font-size', getStructuredClusterLabelFontSize(currentZoomScale, scaleExtent[0]))
        // Radial DISTANCE is zoom-aware too (same shared rule as the initial
        // render): the label group slides in/out along its own spoke so the
        // node→label gap stays ~8–12 screen px at every zoom. Only the radius
        // changes — the spoke angle and the hemisphere flip are untouched, so
        // the radial orientation reads exactly as before.
        {
          const labelRadius = getStructuredClusterLabelRadius(currentZoomScale)
          svg.selectAll<SVGGElement, any>('g.cluster-label-group')
            .attr('transform', (d: any) =>
              `rotate(${((d?.angle || 0) * 180) / Math.PI}) translate(${labelRadius}, 0)`)
        }
        // The detail circle lives INSIDE the camera (it is anchored on the
        // focused cluster's own ring position), so its type, mark radii and
        // stroke widths are re-divided by the new scale to stay constant-screen.
        structuredFocusHandle?.rescale(currentZoomScale)
      }

      // Apply zoom transform to viewport (both structured and unstructured)
      if (g) {
        g.attr('transform', event.transform)
      }

      // Tell the parent whether the camera sits at the initial fit-to-view
      // framing (epsilon compare — +/- zoom pairs and Reset land back exactly)
      const initial = computeInitialTransform()
      emit('viewport-change',
        Math.abs(event.transform.k - initial.k) < 1e-3
        && Math.abs(event.transform.x - initial.x) < 0.5
        && Math.abs(event.transform.y - initial.y) < 0.5)

      // The glass discs track the nodes through zoom and pan.
      updateNodeGlass()
    })

  svg.call(zoomBehaviorInstance)

  // Clicking empty canvas leaves the drill-down. A pan ends in a click event
  // too, so the pointer has to have stayed put for this to count as a click —
  // otherwise dragging the canvas would close the focused view.
  svg.on('pointerdown.drilldown', (event: PointerEvent) => {
    canvasPointerDownAt = { x: event.clientX, y: event.clientY }
  })
  svg.on('click.drilldown', (event: MouseEvent) => {
    if (expandedClusterIds.value.length === 0) return
    const from = canvasPointerDownAt
    canvasPointerDownAt = null
    if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > 4) return
    exitDrilldown()
  })

  // === TEMPORARY DIAGNOSTIC: INITIALIZATION STATE ===
  console.log(`[D3-INIT] Checking rendered links after initializeVisualization...`)
  const initLinksGroup = svg.select('g.viewport').select('g.links')
  const initForegroundLinks = initLinksGroup.select('g.links-foreground').selectAll('line.link-line-foreground')
  console.log(`[D3-INIT] Foreground links rendered: ${initForegroundLinks.size()}`)
  if (!initForegroundLinks.empty()) {
    let sampleCount = 0
    initForegroundLinks.each(function (d: any, i: number) {
      if (sampleCount >= 2) return
      sampleCount++
      const elem = d3.select(this)
      const x1 = elem.attr('x1')
      const y1 = elem.attr('y1')
      const x2 = elem.attr('x2')
      const y2 = elem.attr('y2')
      const stroke = elem.attr('stroke')
      const strokeWidth = elem.attr('stroke-width')
      const opacity = elem.attr('opacity')
      const filter = elem.attr('filter')
      const sourceId = d.source?.id
      const targetId = d.target?.id
      console.log(
        `[D3-INIT] Sample init link ${i}: ${sourceId}→${targetId}` +
        ` coords=(${x1},${y1})→(${x2},${y2})` +
        ` stroke=${stroke} width=${strokeWidth} opacity=${opacity} filter=${filter}`
      )
    })
  }

  // Apply zoom: either reset to fit viewport or restore previous transform
  if (resetZoom) {
    const transform = computeInitialTransform()
    console.log(`[D3] Applying RESET zoom: scale=${transform.k}, tx=${transform.x}, ty=${transform.y}`)
    currentZoomTransform = transform
    svg.call(zoomBehaviorInstance!.transform, transform)
    // Keep the whole graph framed while the force layout settles (unstructured only)
    followInitialFit = props.layoutMode === 'unstructured'
  } else if (currentZoomTransform) {
    // Restore previous zoom state
    console.log(`[D3] Restoring zoom transform: scale=${currentZoomTransform.k}, tx=${currentZoomTransform.x}, ty=${currentZoomTransform.y}`)
    svg.call(zoomBehaviorInstance!.transform, currentZoomTransform)
  } else {
    console.log(`[D3] WARNING: resetZoom=false but currentZoomTransform is null`)
  }

  // Seed the backdrop glass for the freshly rendered nodes (a cold graph never
  // ticks, so this is the only pass that runs in Structured mode — where it
  // clears the layer instead).
  updateNodeGlass()
}

/**
 * Minimal update for Timeline filtering: preserve node positions, zoom, and simulation state.
 * Only add/remove nodes and links that changed; keep existing ones intact.
 */
function updateVisualizationForFilter(newNodes: NetworkNode[], newLinks: NetworkLink[]) {
  console.log(`[D3] updateVisualizationForFilter called: ${newNodes.length} nodes, ${newLinks.length} links`)
  if (!svgRef.value) return
  // Timeline filtering preserves the viewport — never let the settle-follow
  // refit fight the gentle simulation restart below.
  followInitialFit = false
  // The visible set is about to change under the focused layer (a cluster or
  // its entities may leave the graph entirely), so close the drill-down and
  // restore the base opacities before re-joining. Camera is left alone —
  // filtering preserves the viewport.
  if (expandedClusterIds.value.length > 0) {
    teardownDrilldown()
    clearDrilldownEmphasis(d3.select(svgRef.value) as any)
  }

  const svg = d3.select(svgRef.value)
  const newNodeIds = new Set(newNodes.map(n => n.id))
  const newLinkKey = (link: any) => `${link.source?.id || ''}-${link.target?.id || ''}`

  // Filter nodes: visible nodes exclude entities
  const visibleNodes = layoutNodes.value.filter((n: any) => n.kind !== 'entity' && newNodeIds.has(n.id))
  const visibleNodeIds = new Set(visibleNodes.map((n: any) => n.id))

  console.log(`[D3] Timeline filter: ${visibleNodes.length} visible nodes`)

  // Preserve existing links instead of reconstructing from newLinks
  // This keeps the already-resolved, already-valid link objects intact
  const linkGroup = svg.select('g.links')
  let linkData: any[] = []

  if (simulation && props.layoutMode === 'unstructured') {
    // Unstructured layout: get existing links from the force simulation
    const linkForce = simulation.force('link') as any
    const simulationLinks = linkForce?.links() || []
    console.log(`[D3] Existing simulation links: ${simulationLinks.length}`)

    // Filter to keep only links where both endpoints are still visible
    linkData = (simulationLinks as any[]).filter((link: any) => {
      const sourceId = (link.source as any).id
      const targetId = (link.target as any).id
      const isVisible = visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)
      if (!isVisible) {
        console.log(`[D3] Filtering out link ${sourceId}-${targetId} (endpoint not in visible set)`)
      }
      return isVisible
    })
    console.log(`[D3] Filtered simulation links: ${linkData.length}`)
  } else {
    // Structured layout: preserve existing D3-bound links by re-selecting them
    const existingForegroundLinks = linkGroup.select('g.links-foreground').selectAll('line.link-line-foreground').data() as any[]
    console.log(`[D3] Existing D3-bound links: ${existingForegroundLinks?.length || 0}`)

    linkData = (existingForegroundLinks || []).filter((link: any) => {
      const sourceId = (link.source as any).id
      const targetId = (link.target as any).id
      const isVisible = visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)
      if (!isVisible) {
        console.log(`[D3] Filtering out D3 link ${sourceId}-${targetId}`)
      }
      return isVisible
    })
    console.log(`[D3] Filtered D3-bound links: ${linkData.length}`)
  }

  // Update node selections
  const nodeGroup = svg.select('g.nodes')
  const nodes = nodeGroup.selectAll('circle.node-circle').data(visibleNodes, (d: any) => d.id)

  // Remove nodes that are no longer visible
  const nodeExitCount = nodes.exit().size()
  const nodeEnterCount = nodes.enter().size()
  nodes.exit().remove()

  // Add new nodes (those that became visible due to Timeline change)
  nodes.enter()
    .append('circle')
    .attr('class', (d: any) => d.kind === 'insight' ? 'node-circle insight-node' : 'node-circle')
    .attr('cx', (d: any) => d.x || 0)
    .attr('cy', (d: any) => d.y || 0)
    // Single source of truth: same effective radius the link endpoint
    // geometry uses (includes the source nodes' 16px min screen diameter).
    .attr('r', (d: any) => getEffectiveNodeRadius(d, currentZoomScale))
    .attr('fill', (d: any) => {
      const style = NODE_STYLING[d.kind as keyof typeof NODE_STYLING]
      if (style?.fill === 'none') return 'none'
      if (style?.fill === 'theme') return nodeColor.value(d)
      return style?.fill || nodeColor.value(d)
    })
    .attr('stroke', (d: any) => {
      const style = NODE_STYLING[d.kind as keyof typeof NODE_STYLING]
      return style?.stroke || 'none'
    })
    .attr('stroke-width', (d: any) => getNodeStrokeWidth(d.kind, currentZoomScale))
    .attr('stroke-dasharray', (d: any) => {
      const style = NODE_STYLING[d.kind as keyof typeof NODE_STYLING]
      return style?.strokeDasharray || 'none'
    })
    .attr('filter', (d: any) => {
      if (d.kind === 'insight') return 'url(#insight-shadow)'
      return 'none'
    })
    .attr('opacity', 1)
    .style('pointer-events', 'auto')

  // Update link selections
  const linksBackground = linkGroup.select('g.links-background').selectAll('line.link-line-background').data(linkData, (d: any) => newLinkKey(d))
  const linksForeground = linkGroup.select('g.links-foreground').selectAll('line.link-line-foreground').data(linkData, (d: any) => newLinkKey(d))
  const linkEndpointGroup = linkGroup.select('g.link-endpoints')
  const linkEndpointData = linkData.map((link: any) => ({
    source: link.source,
    target: link.target,
    kind: link.kind,
  }))
  const linkEndpoints = linkEndpointGroup.selectAll('circle.link-endpoint').data(
    linkEndpointData.flatMap((link: any) => [
      { ...link, endpoint: 'source' },
      { ...link, endpoint: 'target' },
    ]),
    (d: any, i: number) => `${d.source?.id || ''}-${d.target?.id || ''}-${d.endpoint}`
  )

  // Remove links that are no longer visible
  const linksBackgroundExitCount = linksBackground.exit().size()
  const linksForegroundExitCount = linksForeground.exit().size()
  const linkEndpointsExitCount = linkEndpoints.exit().size()
  console.log(`[D3-RENDER] D3 JOIN - Background exits: ${linksBackgroundExitCount}, Foreground exits: ${linksForegroundExitCount}, Endpoints exits: ${linkEndpointsExitCount}`)

  linksBackground.exit().remove()
  linksForeground.exit().remove()
  linkEndpoints.exit().remove()

  // Add new links (those that became visible)
  const linksBackgroundEnterCount = linksBackground.enter().size()
  const linksForegroundEnterCount = linksForeground.enter().size()
  const linkEndpointsEnterCount = linkEndpoints.enter().size()
  console.log(`[D3-RENDER] D3 JOIN - Background enters: ${linksBackgroundEnterCount}, Foreground enters: ${linksForegroundEnterCount}, Endpoints enters: ${linkEndpointsEnterCount}`)

  linksBackground.enter()
    .append('line')
    .attr('class', 'link-line-background')
    // Style from the shared connection language (linkRenderer.ts) — the same
    // functions the Structured focus applies, so the two cannot drift apart.
    .each(function (this: SVGLineElement, d: any) {
      applyLinkBackgroundStyle(d3.select(this), { zoomScale: currentZoomScale, kind: d.kind })
    })
    .attr('x1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.x
    })
    .attr('y1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.y
    })
    .attr('x2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.x
    })
    .attr('y2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.y
    })

  linksForeground.enter()
    .append('line')
    .attr('class', 'link-line-foreground')
    .each(function (this: SVGLineElement, d: any) {
      applyLinkForegroundStyle(d3.select(this), { zoomScale: currentZoomScale, kind: d.kind })
    })
    .attr('x1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.x
    })
    .attr('y1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.y
    })
    .attr('x2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.x
    })
    .attr('y2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.y
    })

  linkEndpoints.enter()
    .append('circle')
    .attr('class', 'link-endpoint')
    .each(function (this: SVGCircleElement) {
      applyLinkEndpointStyle(d3.select(this), currentZoomScale)
    })
    .attr('cx', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return d.endpoint === 'source' ? endpoints.source.x : endpoints.target.x
    })
    .attr('cy', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return d.endpoint === 'source' ? endpoints.source.y : endpoints.target.y
    })

  // === TEMPORARY DIAGNOSTIC: SVG LINK ATTRIBUTES ===
  console.log(`[D3-RENDER] DOM ELEMENTS AFTER JOIN:`)
  const allForegroundLinks = linkGroup.select('g.links-foreground').selectAll('line.link-line-foreground')
  console.log(`[D3-RENDER] Total foreground link elements in DOM: ${allForegroundLinks.size()}`)

  const allBackgroundLinks = linkGroup.select('g.links-background').selectAll('line.link-line-background')
  console.log(`[D3-RENDER] Total background link elements in DOM: ${allBackgroundLinks.size()}`)

  // Inspect 2-3 actual link elements
  let inspected = 0
  allForegroundLinks.each(function (d: any, i: number) {
    if (inspected >= 3) return
    inspected++

    const elem = d3.select(this)
    const x1 = elem.attr('x1')
    const y1 = elem.attr('y1')
    const x2 = elem.attr('x2')
    const y2 = elem.attr('y2')
    const stroke = elem.attr('stroke')
    const strokeWidth = elem.attr('stroke-width')
    const opacity = elem.attr('opacity')
    const display = elem.style('display')
    const visibility = elem.style('visibility')
    const pointerEvents = elem.style('pointer-events')

    const sourceId = d.source?.id || 'unknown'
    const targetId = d.target?.id || 'unknown'

    console.log(
      `[D3-RENDER] Link ${i} (${sourceId}→${targetId}):` +
      ` x1=${x1} y1=${y1} x2=${x2} y2=${y2}` +
      ` stroke=${stroke}` +
      ` stroke-width=${strokeWidth}` +
      ` opacity=${opacity}` +
      ` display=${display}` +
      ` visibility=${visibility}` +
      ` pointer-events=${pointerEvents}`
    )
  })

  // === TEMPORARY DIAGNOSTIC: LAYER STRUCTURE ===
  console.log(`[D3-RENDER] SVG LAYER STRUCTURE:`)
  const viewport = svg.select('g.viewport')
  console.log(`[D3-RENDER] Viewport group exists: ${!viewport.empty()}`)
  console.log(`[D3-RENDER] Viewport display: ${viewport.style('display')}`)
  console.log(`[D3-RENDER] Viewport visibility: ${viewport.style('visibility')}`)
  console.log(`[D3-RENDER] Viewport pointer-events: ${viewport.style('pointer-events')}`)

  const linksGroupLayer = svg.select('g.viewport').select('g.links')
  console.log(`[D3-RENDER] Links group exists: ${!linksGroupLayer.empty()}`)
  console.log(`[D3-RENDER] Links display: ${linksGroupLayer.style('display')}`)
  console.log(`[D3-RENDER] Links visibility: ${linksGroupLayer.style('visibility')}`)
  console.log(`[D3-RENDER] Links pointer-events: ${linksGroupLayer.style('pointer-events')}`)

  const bgLinkGroup = linksGroupLayer.select('g.links-background')
  console.log(`[D3-RENDER] Background links group exists: ${!bgLinkGroup.empty()}`)
  console.log(`[D3-RENDER] Background links display: ${bgLinkGroup.style('display')}`)

  const fgLinkGroup = linksGroupLayer.select('g.links-foreground')
  console.log(`[D3-RENDER] Foreground links group exists: ${!fgLinkGroup.empty()}`)
  console.log(`[D3-RENDER] Foreground links display: ${fgLinkGroup.style('display')}`)

  // Update label selections
  const labelGroup = svg.select('g.labels')
  const sourceLabels = labelGroup.selectAll('text.source-label').data(visibleNodes.filter((n: any) => n.kind === 'source'), (d: any) => d.id)
  const documentLabels = labelGroup.selectAll('text.document-label').data(visibleNodes.filter((n: any) => n.kind === 'document'), (d: any) => d.id)

  // Remove labels for nodes that are no longer visible
  sourceLabels.exit().remove()
  documentLabels.exit().remove()

  // Add labels for new nodes
  sourceLabels.enter()
    .append('text')
    .attr('class', 'source-label')
    .attr('text-anchor', 'start')
    .attr('dominant-baseline', 'middle')
    .attr('font-family', TYPOGRAPHY.source.fontFamily)
    .attr('font-size', getScaledLabelFontSize('source', currentZoomScale))
    .attr('font-style', TYPOGRAPHY.source.fontStyle)
    .attr('font-weight', TYPOGRAPHY.source.fontWeight)
    .attr('fill', chartTheme.value.ink)
    .attr('opacity', TYPOGRAPHY.restingOpacity)
    .style('line-height', `${TYPOGRAPHY.source.lineHeight}px`)
    .style('-webkit-text-stroke-color', (TYPOGRAPHY.source as any).textStroke)
    .style('-webkit-text-stroke-width', `${(TYPOGRAPHY.source as any).textStrokeWidth}px`)
    .text((d: any) => d.id)

  documentLabels.enter()
    .append('text')
    .attr('class', 'document-label')
    .attr('text-anchor', 'start')
    .attr('dominant-baseline', 'middle')
    .attr('font-family', TYPOGRAPHY.document.fontFamily)
    .attr('font-size', getScaledLabelFontSize('document', currentZoomScale))
    .attr('font-style', TYPOGRAPHY.document.fontStyle)
    .attr('font-weight', TYPOGRAPHY.document.fontWeight)
    .attr('fill', chartTheme.value.ink)
    .attr('opacity', TYPOGRAPHY.restingOpacity)
    .style('line-height', `${TYPOGRAPHY.document.lineHeight}px`)
    .style('-webkit-text-stroke-color', (TYPOGRAPHY.document as any).textStroke)
    .style('-webkit-text-stroke-width', `${(TYPOGRAPHY.document as any).textStrokeWidth}px`)
    .text((d: any) => d.label || d.id)

  // Add icons to newly visible nodes (both kinds at natural data-space size)
  const sourceIconDiameter = getSourceIconDiameter(currentZoomScale)
  const documentIconDiameter = getDocumentIconDiameter(currentZoomScale)
  svg.selectAll('image.source-icon, image.document-icon').data(visibleNodes.filter((n: any) => n.kind === 'source' || n.kind === 'document'), (d: any) => d.id)
    .exit().remove()

  nodes.each(function (nodeData: any) {
    const parentNode = (this as any).parentNode as SVGElement | null
    if (!parentNode) return
    const existingIcon = d3.select(parentNode as any).select('image.source-icon, image.document-icon')
    if (existingIcon.empty()) {
      // Only add if it doesn't exist
      let iconHref: string | null = null
      if (nodeData.kind === 'source') {
        iconHref = getSourceNodeIcon(nodeData.id)
      } else if (nodeData.kind === 'document') {
        iconHref = documentNodeIconFor(nodeData.ext)
      }

      if (iconHref) {
        const isSource = nodeData.kind === 'source'
        const iconDiameter = isSource ? sourceIconDiameter : documentIconDiameter
        d3.select(parentNode as any)
          .insert('image', ':first-child')
          .datum(nodeData)
          .attr('class', isSource ? 'source-icon' : 'document-icon')
          .attr('x', (nodeData.x || 0) - iconDiameter / 2)
          .attr('y', (nodeData.y || 0) - iconDiameter / 2)
          .attr('width', iconDiameter)
          .attr('height', iconDiameter)
          .attr('href', iconHref)
          // Both hub kinds are full-bleed SQUARE tiles filling the whole
          // circle, so both are clipped back to it.
          .attr('clip-path', `url(#${SOURCE_ICON_CLIP_ID})`)
          .attr('opacity', SOURCE_NODES.icon.opacity)
      }
    }
  })

  // === TEMPORARY DIAGNOSTIC: COMPARE WITH INITIALIZATION ===
  console.log(`[D3-COMPARE] Finding first link in DOM to compare initialization vs timeline filter...`)
  const sampleLinkForeground = linkGroup.select('g.links-foreground').selectAll('line.link-line-foreground')
  if (!sampleLinkForeground.empty()) {
    sampleLinkForeground.each(function (d: any, i: number) {
      if (i !== 0) return // Only first link
      const elem = d3.select(this)
      const x1 = elem.attr('x1')
      const y1 = elem.attr('y1')
      const x2 = elem.attr('x2')
      const y2 = elem.attr('y2')
      const stroke = elem.attr('stroke')
      const strokeWidth = elem.attr('stroke-width')
      const opacity = elem.attr('opacity')
      const sourceId = d.source?.id
      const targetId = d.target?.id
      console.log(
        `[D3-COMPARE] Timeline filter state: ${sourceId}→${targetId}` +
        ` coords=(${x1},${y1})→(${x2},${y2})` +
        ` stroke=${stroke} width=${strokeWidth} opacity=${opacity}`
      )
    })
  } else {
    console.log(`[D3-COMPARE] NO LINKS FOUND IN FOREGROUND!`)
  }

  // Update simulation links if simulation is running (for unstructured layout).
  // Only reheat when the visible set actually changed, and only gently (0.1):
  // a filter that adds/removes nothing must not restart the simulation, and an
  // incremental change should integrate new nodes without noticeably moving
  // the existing, already-settled ones.
  if (simulation && props.layoutMode === 'unstructured') {
    const visibleSetChanged = nodeEnterCount > 0 || nodeExitCount > 0
      || linksForegroundEnterCount > 0 || linksForegroundExitCount > 0
    console.log(`[D3] Updating simulation with ${linkData.length} links and ${visibleNodes.length} nodes (setChanged=${visibleSetChanged})`)
    if (visibleSetChanged) {
      simulation.nodes(visibleNodes)
      // Pass linkData which has stable node object references (not stale IDs)
      const linkForce = simulation.force('link') as any
      linkForce?.links(linkData)
      simulation.alpha(0.1).restart() // Gentle restart with low alpha to let it settle
    }
  }

  // A Timeline filter can add or remove nodes without the simulation ticking
  // (when the visible set is unchanged it never restarts), so re-clip here too.
  updateNodeGlass()

  console.log(`[D3] updateVisualizationForFilter complete`)
}

onMounted(() => {
  console.log(`[D3] onMounted: calling initializeVisualization(true)`)
  // First mount: initialize with zoom reset
  initializeVisualization(true)
  isFirstInitialization = false
  console.log(`[D3] onMounted: set isFirstInitialization = false`)
})

watch(() => [props.nodes, props.links, props.layoutMode, props.zoom], (newVal, oldVal) => {
  const [nodes, links, layoutMode] = newVal as [NetworkNode[], NetworkLink[], string, number]
  console.log(`[D3] Watch triggered: nodes=${nodes.length}, links=${links.length}, layoutMode=${layoutMode}, oldLayoutMode=${oldVal?.[2]}`)
  if (simulation) {
    simulation.stop()
  }

  // Detect what changed
  const layoutModeChanged = oldVal && newVal[2] !== oldVal[2]
  const newNodeIds = new Set(nodes.map(n => n.id))
  const intersection = new Set([...newNodeIds].filter(id => previousNodeIds.has(id)))
  const prevSize = previousNodeIds.size
  const newSize = newNodeIds.size

  // Check if this is a Timeline filter: nodes overlap significantly and size change is moderate
  // (not a complete dataset replacement)
  const hasSignificantOverlap = intersection.size > Math.max(prevSize, newSize) * 0.5 // At least 50% overlap
  const isModerateChange = Math.abs(newSize - prevSize) <= Math.max(prevSize * 0.7, 10) // Size change ≤ 70% or ≤ 10 nodes
  const isTimelineFilter = !isFirstInitialization &&
    oldVal &&
    !layoutModeChanged &&
    prevSize > 0 &&
    hasSignificantOverlap &&
    isModerateChange &&
    newSize !== prevSize

  console.log(`[D3] Watch analysis: layoutModeChanged=${layoutModeChanged}, isTimelineFilter=${isTimelineFilter}, previousSize=${previousNodeIds.size}, newSize=${newNodeIds.size}`)

  // Update tracked state
  previousNodeIds = newNodeIds

  if (layoutModeChanged) {
    // Layout mode change: full re-render with zoom reset
    console.log(`[D3] Layout mode changed → full reinitialization with zoom reset`)
    initializeVisualization(true)
  } else if (isTimelineFilter) {
    // Timeline filter: minimal update, preserve zoom and positions
    console.log(`[D3] Timeline filter detected → minimal update, preserving zoom and positions`)
    updateVisualizationForFilter(nodes, links)
  } else if (oldVal && Array.isArray(oldVal[0]) && (oldVal[0] as any).length === 0 && nodes.length > 0) {
    // Transitioning from empty to populated (initial load)
    console.log(`[D3] Transitioning from empty to populated → full reinitialization`)
    initializeVisualization(false)
  } else {
    // Genuine data change: reinitialize
    console.log(`[D3] Data genuinely changed → full reinitialization`)
    initializeVisualization(false)
  }
})

onBeforeUnmount(() => {
  teardownDrilldown()
  if (props.layoutMode === 'structured') {
    cleanupStructured()
  }
  if (simulation) {
    simulation.stop()
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
})

function applyZoomScale(factor: number) {
  if (!svgRef.value || !zoomBehaviorInstance) return
  followInitialFit = false // Explicit zoom takes over the camera
  const svg = d3.select(svgRef.value)
  svg.call(zoomBehaviorInstance.scaleBy, factor)
}

// ── Structured Cluster DRILL-DOWN (roulette ring + fixed detail zone) ────────
// Clicking a cluster turns the ring like a wheel until that cluster reaches the
// focus angle, and draws its `Insights + Entities` in ONE FIXED ZONE of the
// canvas over the dimmed overview — see structuredFocus.ts. Clicking another
// cluster turns the wheel again and REPLACES the zone's content; the zone never
// moves.
//
// ⚠️ THE CAMERA IS NEVER TOUCHED ON THIS PATH. There is deliberately no
// `zoomBehaviorInstance.transform` call in selection or close: the graph is
// never panned, zoomed or re-framed toward the clicked cluster, which is what
// keeps the circle in one place. The user's own wheel/drag zoom and pan, and
// Reset, keep working exactly as before.
let structuredFocusHandle: StructuredFocusHandle | null = null
/**
 * The selected clusters, in click order — the order their bands are stacked in.
 * Multi-selection: clicking a new cluster PINS it alongside whatever is already
 * pinned, clicking a pinned one releases just that one, and the oldest gives way
 * at `STRUCTURED_FOCUS.detail.maxSelected` so a click always does something
 * visible rather than being silently refused.
 */
const structuredSelectedIds: string[] = []
/**
 * Reactive mirror of "a Structured drill-down is open" — drives the
 * viewport-edge fade mask class on the <svg> (see `--edge-fade` in the
 * stylesheet). The mask is SCREEN-anchored, which is exactly why it is CSS on
 * the canvas element rather than an SVG mask: the ring lives inside the
 * zoom-transformed viewport group, where a mask would travel with the camera.
 */
const structuredFocusActive = ref(false)
// One emitter for every transition of the flag above — set it anywhere, the
// host hears about it exactly once.
watch(structuredFocusActive, active => emit('focus-change', active))
/** The fade band depth, from the focus tokens, for the CSS mask (v-bind). */
const focusEdgeFade = `${STRUCTURED_FOCUS.edgeFadePx}px`

/**
 * Click a cluster: select it (turning the wheel and filling the detail zone),
 * or clear the selection if it is already the selected one.
 */
function toggleStructuredFocus(clusterId: string) {
  if (!svgRef.value || props.layoutMode !== 'structured') return
  const at = structuredSelectedIds.indexOf(clusterId)
  if (at >= 0) {
    // Releasing one pinned cluster leaves the others exactly as they were.
    structuredSelectedIds.splice(at, 1)
  } else {
    structuredSelectedIds.push(clusterId)
    while (structuredSelectedIds.length > STRUCTURED_FOCUS.detail.maxSelected) {
      structuredSelectedIds.shift()
    }
  }
  if (!structuredSelectedIds.length) {
    closeStructuredFocus()
    return
  }
  applyStructuredFocus()
}

/**
 * Render the current selection. Switching clusters is a wheel turn plus a
 * CONTENT swap inside a zone that is already positioned — hence no camera work
 * and no per-selection geometry.
 */
function applyStructuredFocus() {
  if (!svgRef.value || !structuredSelectedIds.length) return
  const svg = d3.select(svgRef.value)
  const viewportG = svg.select<SVGGElement>('g.viewport')

  const models = structuredSelectedIds
    .map(id => deriveStructuredFocus(viewportG as any, id))
    .filter((m): m is StructuredFocusModel => !!m)
  // A selection whose cluster is no longer rendered can never be shown — drop it
  // rather than keeping the drill-down alive on a stale id.
  if (models.length !== structuredSelectedIds.length) {
    structuredSelectedIds.length = 0
    structuredSelectedIds.push(...models.map(m => m.clusterId))
  }
  if (!models.length) {
    closeStructuredFocus()
    return
  }

  /*
   * ⚠️ CAPTURED BEFORE THE FLAG IS RAISED. "Was it closed?" has to be read here,
   * at the top: it decides whether this is an OPENING (move the camera into the
   * drill-down framing and hand the canvas to the wheel) or a SWITCH between
   * clusters (camera already in place — touching it would be the jump this mode
   * exists to avoid). Testing the handle instead does not work: the handle
   * outlives a close, so every reopening after the first would skip both.
   */
  const wasClosed = !structuredFocusActive.value

  structuredFocusActive.value = true
  // Suspend hover isolation: the drill-down owns the emphasis now.
  setStructuredHoverSuspended(true)
  /*
   * THE DRILL-DOWN CAMERA — placed ONCE, on opening, and then FROZEN.
   * `computeFocusCamera()` takes no arguments: the framing is the same for every
   * cluster (the wheel parked off the left edge, about half of it on screen; the
   * detail area filling the space to its right), so switching clusters is a
   * wheel turn and a content swap with the camera already where it belongs.
   *
   * Pan and zoom are then switched OFF for as long as the drill-down is open —
   * this mode is not a navigable canvas, it is a fixed screen with one control.
   * Scroll and drag are re-bound to turning the wheel instead (below).
   */
  structuredFocusHandle ??= createStructuredFocus(viewportG as any)
  if (wasClosed && zoomBehaviorInstance) {
    const camera = computeFocusCamera()
    svg.transition().duration(STRUCTURED_FOCUS.rotationMs)
      .call(zoomBehaviorInstance.transform as any, camera)
      .on('end', () => bindRouletteControls(svg))
  }
  structuredFocusHandle.update(models, {
    cameraK: computeFocusCamera().k,
    insightFill: chartTheme.value?.categorical?.[0] || '#F2C585',
    insightStroke: NODE_STYLING.insight.stroke,
    // The identical expression the drill-down passes as its `entityColor`, so a
    // detail entity mark and an `expanded-entity` dot resolve to one colour.
    entityFill: nodeColor.value({ kind: 'entity' } as NetworkNode),
    // Same live token resolver the drill-down's chip uses — the isolated-entity
    // chip reads the expanded-region-chip tokens through it.
    themeColor,
    // The selected cluster's highlight accent, from the live chart theme (its
    // second categorical step is the #9D7EEA the design calls for).
    selectionColor: chartTheme.value?.categorical?.[1],
    // The region chip's × and the region circle both collapse THAT cluster —
    // the same contract as the Unstructured drill-down's region/chip close.
    onCollapse: id => toggleStructuredFocus(id),
  })
}

/**
 * ── THE ROULETTE CONTROLS ────────────────────────────────────────────────────
 *
 * While the drill-down is open the canvas is NOT navigable: `zoom` is unbound
 * from the <svg>, so nothing the user does can pan or zoom the view, and the
 * detail area therefore cannot move. Scroll and drag are re-bound to turning the
 * wheel — the one control this mode has.
 *
 * Bound in the `.zoom`-free namespaces below so releasing them cannot disturb
 * anything else listening on the canvas.
 */
function bindRouletteControls(svg: d3.Selection<SVGSVGElement, unknown, any, unknown>) {
  if (!zoomBehaviorInstance) return
  // Off with the camera: no pan, no zoom, no double-click-to-zoom.
  svg.on('.zoom', null)

  svg.on('wheel.roulette', (event: WheelEvent) => {
    event.preventDefault()
    // Trackpads report small pixel deltas and mice large ones; the token is
    // degrees per unit, so both feel like turning the same wheel.
    structuredFocusHandle?.rotateBy(event.deltaY * STRUCTURED_FOCUS.detail.scrollDegPerUnit)
  })

  // Drag anywhere on the canvas spins the wheel about ITS centre — which sits
  // off the right edge, so the gesture reads as pushing the rim round.
  const wheelCentre = () => {
    const camera = computeFocusCamera()
    return { x: camera.x, y: camera.y }
  }
  let lastDeg = 0
  svg.call(
    d3.drag<SVGSVGElement, unknown>()
      .container(function () { return this as any })
      .on('start', (event: any) => {
        const c = wheelCentre()
        lastDeg = (Math.atan2(event.y - c.y, event.x - c.x) * 180) / Math.PI
      })
      .on('drag', (event: any) => {
        const c = wheelCentre()
        const now = (Math.atan2(event.y - c.y, event.x - c.x) * 180) / Math.PI
        // Shortest signed step, so crossing ±180° is one small move, not a jump.
        const step = ((now - lastDeg + 540) % 360) - 180
        lastDeg = now
        structuredFocusHandle?.rotateBy(step)
      }) as any,
  )
}

/** Hand the canvas back to the camera when the drill-down closes. */
function releaseRouletteControls() {
  if (!svgRef.value || !zoomBehaviorInstance) return
  const svg = d3.select(svgRef.value)
  svg.on('wheel.roulette', null)
  svg.on('.drag', null)
  svg.call(zoomBehaviorInstance)
}

/**
 * Clear the selection: the zone empties and the wheel unwinds to its resting
 * orientation. The camera is left exactly where the user had it.
 */
function closeStructuredFocus() {
  if (!structuredSelectedIds.length && !structuredFocusHandle) return
  structuredSelectedIds.length = 0
  structuredFocusActive.value = false
  structuredFocusHandle?.update([], {
    cameraK: currentZoomScale,
    insightFill: chartTheme.value?.categorical?.[0] || '#F2C585',
    insightStroke: NODE_STYLING.insight.stroke,
    entityFill: nodeColor.value({ kind: 'entity' } as NetworkNode),
    themeColor,
  })
  setStructuredHoverSuspended(false)
  // The canvas becomes navigable again, and the opening move unwinds over the
  // wheel's duration so the ring straightening and the view pulling back read as
  // one motion.
  releaseRouletteControls()
  if (svgRef.value && zoomBehaviorInstance) {
    const initial = computeInitialTransform()
    zoomBehaviorInstance.scaleExtent([initial.k, VIEWPORT.zoomExtent[1]])
    d3.select(svgRef.value).transition().duration(STRUCTURED_FOCUS.rotationMs)
      .call(zoomBehaviorInstance.transform as any, initial)
  }
}

/** Any structured re-render rebuilds the SVG — discard stale drill-down state. */
function resetStructuredFocusState() {
  releaseRouletteControls()
  structuredFocusHandle = null
  structuredSelectedIds.length = 0
  structuredFocusActive.value = false
  setStructuredHoverSuspended(false)
}

/**
 * Reset the camera to the exact initial-entry framing: the same fit-to-view
 * transform (scale + centered translate) computeInitialTransform() produces on
 * first load. Viewport-only: does not touch the simulation, node positions, or data.
 */
/**
 * Fly the camera to a set of nodes and nothing else.
 *
 * Bounds come from the nodes' own effective radii at zoom 1 (the same
 * measurement the initial fit uses, so the two cameras agree), padded by
 * `VIEWPORT.sourceFocus.padding`. The scale is capped: fitting two nodes
 * exactly would otherwise magnify them to fill the canvas.
 */
function fitCameraToNodes(focusNodes: any[]) {
  if (!svgRef.value || !zoomBehaviorInstance || !focusNodes.length) return
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of focusNodes) {
    if (typeof n.x !== 'number' || typeof n.y !== 'number') continue
    const r = getEffectiveNodeRadius(n, 1)
    minX = Math.min(minX, n.x - r)
    minY = Math.min(minY, n.y - r)
    maxX = Math.max(maxX, n.x + r)
    maxY = Math.max(maxY, n.y + r)
  }
  if (!Number.isFinite(minX)) return

  const pad = VIEWPORT.sourceFocus.padding
  const width = (maxX - minX) + pad * 2
  const height = (maxY - minY) + pad * 2
  const k = Math.min(
    Math.min(VIEWPORT.dataWidth / width, VIEWPORT.dataHeight / height),
    VIEWPORT.sourceFocus.maxScale,
    VIEWPORT.zoomExtent[1],
  )
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const transform = d3.zoomIdentity
    .translate(VIEWPORT.dataWidth / 2 - k * cx, VIEWPORT.dataHeight / 2 - k * cy)
    .scale(k)

  // The camera is now the user's, not the settling simulation's.
  followInitialFit = false
  d3.select(svgRef.value)
    .transition()
    .duration(VIEWPORT.sourceFocus.durationMs)
    .call(zoomBehaviorInstance.transform as any, transform)
}

function resetView() {
  if (!svgRef.value || !zoomBehaviorInstance) return
  // Reset while the drill-down is open clears it first (restoring the dimmed
  // overview and unwinding the wheel); the camera reset below then runs as it
  // always does — the drill-down never moved the camera, so there is nothing of
  // its own to unwind.
  if (props.layoutMode === 'structured' && structuredSelectedIds.length) {
    closeStructuredFocus()
  }
  followInitialFit = false
  const svg = d3.select(svgRef.value)
  svg.call(zoomBehaviorInstance.transform, computeInitialTransform())
}

/**
 * Focus a node from OUTSIDE the canvas — used by the assistant's inline
 * references, so a name in the prose lands on the same view clicking that node
 * would. Deliberately routes through the canvas's existing behaviours rather
 * than adding a second navigation model:
 *
 *   cluster          → its drill-down opens (expandCluster)
 *   source/document  → the hub and the clusters bound to it are framed, exactly
 *                      as a click on the hub does
 *   anything else    → centred on its own
 *
 * Returns false when the id is not on the canvas, so the caller can tell a
 * missing destination from a completed navigation.
 */
function focusNode(nodeId: string): boolean {
  const nodes = layoutNodes.value as any[]
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return false

  if (node.kind === 'cluster') {
    if (!expandedClusterIds.value.includes(nodeId)) expandCluster(nodeId)
    return true
  }

  if (node.kind === 'source' || node.kind === 'document') {
    const endpointId = (e: any) => (typeof e === 'string' ? e : e?.id)
    const group = new Map<string, any>([[node.id, node]])
    for (const link of props.links as any[]) {
      const s = endpointId(link.source)
      const t = endpointId(link.target)
      if (s !== nodeId && t !== nodeId) continue
      const other = nodes.find(n => n.id === (s === nodeId ? t : s))
      if (other?.kind === 'cluster') group.set(other.id, other)
    }
    fitCameraToNodes([...group.values()])
    return true
  }

  fitCameraToNodes([node])
  return true
}

defineExpose({
  applyZoomScale,
  resetView,
  focusNode,
})
</script>

<template>
  <div ref="container" class="network-graph-d3">
    <!--
      NODE BACKDROP GLASS. One element, clipped to the union of every
      `.node-circle`, carrying a real `backdrop-filter` — see NODE_GLASS in
      graphTokens.ts for why this is a CSS layer and not an SVG filter
      (measured: `backdrop-filter` is inert on SVG shapes, and an SVG filter
      would have nothing to blur). It sits BETWEEN the container's dot grid and
      the <svg>, so it softens the background showing through a node's
      semi-transparent fill while the node, its stroke, glow, icon and label —
      all drawn in the <svg> above — stay perfectly sharp.

      Decorative and inert: aria-hidden, no pointer events.
    -->
    <div ref="glass" class="network-graph-d3__glass" aria-hidden="true" />
    <!--
      EXPANDED-REGION BACKDROP GLASS — same construction as the node glass
      above, but clipped to the drill-down's expanded-region circles and
      carrying its own (stronger) blur from EXPANDED_CLUSTER.region.glass.
      The SVG half of the treatment (a blurred purple backing disc) lives in
      useDrilldownRenderer; this layer blurs the page background the SVG
      cannot reach.
    -->
    <div ref="regionGlass" class="network-graph-d3__region-glass" aria-hidden="true" />
    <svg
      ref="svg"
      class="network-graph-d3__canvas"
      :class="{ 'network-graph-d3__canvas--edge-fade': structuredFocusActive }"
    />
  </div>
</template>

<style scoped>
/*
 * The container carries the dot grid so the tile is measured in screen pixels
 * and stays the same size at every viewport width. Drawing it inside the <svg>
 * (as an SVG <pattern>) tied it to the viewBox scale, which is why the dots
 * grew on larger screens. Values come from BACKGROUND_PATTERN in graphTokens.ts.
 */
.network-graph-d3 {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  /*
   * The dots are painted in the `background` theme token, read live from
   * Vuetify so a theme swap takes them with it — only the alpha comes from
   * graphTokens. The container itself stays transparent: the host screen's
   * canvas gradient is the ground, and this grid is a darker grain over it.
   */
  background-image: radial-gradient(
    circle at 50% 50%,
    rgba(var(--v-theme-background), v-bind(dotAlpha)) v-bind(dotStop),
    transparent v-bind(dotFade)
  );
  background-size: v-bind(dotTile) v-bind(dotTile);
  /*
   * REQUIRED. Vuetify's reset declares `background-repeat: no-repeat` on
   * `*, ::before, ::after`, so a tiled background that does not restate this
   * paints exactly ONE tile in the top-left corner and looks like nothing at
   * all. This is why the grid appeared to vanish when it moved from an SVG
   * <pattern> to CSS — the pattern was fine; only its first tile was drawn.
   */
  background-repeat: repeat;
}

/*
 * The frosted disc behind every node. `z-index` is what makes the layering
 * work: the glass is positioned (so it paints above the container's dot-grid
 * background) while the canvas below is given `z-index: 1`, so the <svg> — and
 * therefore every node, stroke, glow, icon and label — paints ON TOP of it and
 * is never itself blurred.
 *
 * `clip-path` is written per frame by updateNodeGlass() as one `path()` holding
 * one sub-circle per rendered node, in screen px. Blur radius comes from
 * NODE_GLASS.blurPx via v-bind, and `backdrop-filter` works in screen pixels,
 * so it stays a constant 2px at every zoom level with no compensation.
 */
.network-graph-d3__glass {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  /*
   * ⚠️ The blur itself is NOT declared here. Written as a v-bind()'d pair
   * (`backdrop-filter` + `-webkit-backdrop-filter`, both `blur(var(--x))`),
   * the production CSS minifier collapsed the two into the `-webkit-` one
   * only — which Chrome does not support, so the effect computed to `none` in
   * `pnpm build` while working in `pnpm dev`. Static pairs elsewhere in the app
   * survive; the `var()` value is what defeats the dedupe. updateNodeGlass()
   * therefore sets both properties inline, past the minifier, still from
   * NODE_GLASS.blurPx.
   *
   * Hidden until updateNodeGlass() has real circles to clip to. It must NOT
   * start visible-but-unclipped: that would blur the whole canvas for a frame
   * before the first clip lands. (`clip-path: path('')` cannot be used for
   * this — it is invalid CSS and is dropped; see the note in updateNodeGlass.)
   */
  display: none;
}

/* The expanded regions' backdrop glass — same contract as the node glass
   above: positioned between the dot grid and the <svg>, clip + filter written
   inline by updateNodeGlass(), hidden whenever there is nothing to clip to. */
.network-graph-d3__region-glass {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  display: none;
}

.network-graph-d3__canvas {
  width: 100%;
  height: 100%;
  background: transparent;
  pointer-events: auto;
  cursor: grab;
  /* Paints above the glass layer — see the note there. */
  position: relative;
  z-index: 1;
}

/*
 * STRUCTURED DRILL-DOWN — VIEWPORT-EDGE FADE.
 * The detail circle is deliberately wider than the canvas, so it has to read as
 * a system CONTINUING past the viewport rather than as a diagram that ends. Both
 * SIDE edges therefore dissolve: whatever the circle carries into the left or
 * right band fades out instead of being cut off, and the top/bottom ramp does
 * the same for the parts that run off vertically. The centre band stays fully
 * opaque. Screen-anchored on purpose: two composited CSS mask gradients on the
 * <svg> itself (a left+right ramp ∩ a top/bottom ramp), because every drawable
 * lives inside the zoom-transformed viewport group, where an SVG mask would
 * travel with the camera instead of staying on the viewport edge. Purely a
 * rendering-layer effect — no data or layout involvement. The band depth comes
 * from STRUCTURED_FOCUS.edgeFadePx via v-bind.
 */
.network-graph-d3__canvas--edge-fade {
  -webkit-mask-image:
    linear-gradient(
      to right,
      transparent 0,
      #000 v-bind(focusEdgeFade),
      #000 calc(100% - v-bind(focusEdgeFade)),
      transparent 100%
    ),
    linear-gradient(
      to bottom,
      transparent 0,
      #000 v-bind(focusEdgeFade),
      #000 calc(100% - v-bind(focusEdgeFade)),
      transparent 100%
    );
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(
      to right,
      transparent 0,
      #000 v-bind(focusEdgeFade),
      #000 calc(100% - v-bind(focusEdgeFade)),
      transparent 100%
    ),
    linear-gradient(
      to bottom,
      transparent 0,
      #000 v-bind(focusEdgeFade),
      #000 calc(100% - v-bind(focusEdgeFade)),
      transparent 100%
    );
  mask-composite: intersect;
}

.network-graph-d3__canvas:active {
  cursor: grabbing;
}

:deep(circle) {
  transition: r 0.2s ease, opacity 0.2s ease;
  cursor: pointer;
}

/*
 * Subtle black outline behind the document + expanded-entity labels so they
 * stay readable over busy canvas regions. These are SVG <text> elements, so
 * the CSS `-webkit-text-stroke` property is inert here — the SVG equivalent
 * is a 1px stroke painted BEHIND the fill (`paint-order: stroke`), which
 * leaves the glyphs' color, apparent weight, size and positioning untouched.
 * Color: Black/80%. No matching theme token exists yet (the theme only
 * defines the Black/B family at 40%), so per the DS convention this reads
 * the token-shaped custom property first and falls back to the literal —
 * defining --black-b-80 later restyles these without touching this rule.
 */
:deep(text.document-label),
:deep(text.expanded-entity-label) {
  stroke: var(--black-b-80, rgba(0, 1, 1, 0.8));
  stroke-width: 1px;
  paint-order: stroke fill;
}

:deep(line) {
  transition: stroke-width 0.2s ease, opacity 0.2s ease;
}

/*
 * Hover emphasis for the ordinary node kinds. `filter` here is the CSS
 * property, which OVERRIDES the SVG `filter` attribute (they are the same
 * channel), so Insights are excluded — they own their glow through that
 * attribute and get their own rules below. The old rule in this slot also
 * carried a `box-shadow`, which does nothing at all on an SVG shape.
 */
/*
 * The glow fades in/out. `filter` interpolates from `none` because the spec
 * treats the missing side as the identity for each function in the list, so
 * the resting state needs no filter of its own — which matters here: a
 * permanent filter on ~90 circles would force a compositing layer for every
 * node on every simulation tick.
 */
:deep(circle.node-circle:not(.insight-node)) {
  transition: filter v-bind(nodeHoverTransition);
}

/*
 * `.is-expanded-region` is stamped on the base circle of a cluster that is
 * currently drawn as an expanded REGION (see the drill-down renderer). Such a
 * circle is already invisible and pointer-events:none, so it cannot be
 * hovered — the class makes the exclusion explicit rather than incidental.
 * `.expanded-entity` dots and `.expanded-region-circle` are different classes
 * entirely, so neither is matched by these rules.
 */
:deep(circle.node-circle:not(.insight-node):not(.is-expanded-region):hover),
:deep(circle.node-circle:not(.insight-node):not(.is-expanded-region):focus-visible) {
  filter: v-bind(nodeHoverFilter);
}

/*
 * INSIGHT hover: brighter fill + a stronger, warm-white glow, swapping the
 * SVG filter (see the `insight-shadow-hover` def). Fill and stroke transition
 * smoothly; the glow swap is a discrete step because CSS cannot interpolate
 * between two `url()` filters. The stroke deliberately keeps its accent
 * colour so the edge stays crisp rather than blowing out with the glow.
 *
 * Values come from NODE_STYLING.insight via v-bind(), so the tokens remain
 * the single source of truth for both states.
 */
:deep(circle.insight-node) {
  transition: fill v-bind(insightHoverTransition), stroke v-bind(insightHoverTransition);
}

:deep(circle.insight-node:hover) {
  fill: v-bind(insightHoverFill);
  filter: url(#insight-shadow-hover);
}

:deep(text.source-label) {
  letter-spacing: 0.3px;
  pointer-events: none;
}

:deep(line:hover) {
  opacity: 0.9 !important;
  stroke-width: 2 !important;
}

/*
 * CLUSTER DRILL-DOWN LAYER
 * The focused layer fades in rather than popping, so the expansion reads as the
 * clicked cluster growing out of the graph. Geometry and colour live in
 * expandedTokens.ts — only motion and cursor affordances are here.
 */
:deep(g.expanded-layer) {
  animation: expanded-layer-in 220ms ease-out;
}

@keyframes expanded-layer-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Entity points/labels: opacity is driven by hover isolation, so give them the
   same easing the base circles use and keep labels out of hit-testing. */
:deep(circle.expanded-entity) {
  transition: opacity 0.15s ease, r 0.15s ease;
}

:deep(text.expanded-entity-label) {
  pointer-events: none;
  transition: opacity 0.15s ease;
  letter-spacing: 0.2px;
}

/* All drill-down connections are straight single-segment <line>s (project
   graph-geometry rule) — these rules only ease their opacity, never shape. */
:deep(line.expanded-entity-relation),
:deep(line.expanded-routed) {
  transition: stroke-opacity 0.15s ease;
  pointer-events: none;
}

:deep(g.expanded-region-chip) {
  user-select: none;
}

/* The chip's × (Carbon close glyph): its own hover/focus states, independent
   of the chip body. Opacity values mirror expandedTokens.chip.close. */
:deep(g.expanded-chip-close .expanded-chip-close-glyph) {
  transition: opacity 0.15s ease;
}

:deep(g.expanded-chip-close:hover .expanded-chip-close-glyph),
:deep(g.expanded-chip-close:focus-visible .expanded-chip-close-glyph) {
  opacity: 1 !important;
}

:deep(g.expanded-chip-close:focus-visible) {
  outline: none;
}

:deep(g.expanded-chip-close:focus-visible .expanded-chip-close-hit) {
  fill: rgba(255, 255, 255, 0.12);
  rx: 3px;
}
</style>
