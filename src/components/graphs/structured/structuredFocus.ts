/**
 * src/components/graphs/structured/structuredFocus.ts
 *
 * Structured Cluster DRILL-DOWN: a roulette ring plus a fixed detail viewport.
 *
 * Clicking a cluster does two things, and NEITHER of them moves the camera or
 * the circle:
 *
 *   1. THE ROULETTE — the ring turns until the selected cluster reaches
 *      `STRUCTURED_FOCUS.focusAngleDeg`. The rotor turns as one rigid body, so
 *      the circle keeps its centre, its radius and every node's identity; only
 *      the ring's CONTENT rotates. Selecting another cluster turns the wheel
 *      again — it never navigates to another part of the canvas.
 *
 *   2. THE FIXED DETAIL VIEWPORT — that cluster's Insights and Entities are
 *      drawn as a CIRCLE around the ring's focus point: the one place the wheel
 *      always delivers the selected cluster to. That anchor is a constant of the
 *      layout, so the detail area is the same area for every cluster; selecting
 *      another one swaps the content and leaves the circle where it was.
 *
 * ── THE CLUSTER AT THE CENTRE IS THE RING'S OWN NODE ───────────────────────
 *
 * The detail layer draws NO root node. The circle is centred on the anchor, and
 * after the wheel turn the selected cluster's own ring node is sitting exactly
 * there — so the composition reads as focusing IN on that cluster rather than
 * as a copy of it placed somewhere else. (Drawing one was the duplicated source
 * icon this replaced.) The layer contributes only the category caption beneath
 * it.
 *
 * ── WHY THE LAYER IS IN THE VIEWPORT GROUP BUT NOT IN THE ROTOR ────────────
 *
 * Inside `g.viewport`, so it shares the camera with the ring — that is what
 * keeps the circle registered on the cluster node at its centre through any
 * zoom or pan. Outside `g.structured-rotor`, so the wheel's rotation does not
 * drag the detail content around with it.
 *
 * The consequence when editing: the layer IS in camera space, so everything
 * that must stay a constant on-screen size — type, mark radii, gaps, stroke
 * widths — is divided by the camera scale, and `rescale()` re-applies those on
 * zoom.
 *
 * ONE SELECTION AT A TIME. One zone holds one cluster's content, so clicking a
 * cluster selects it and clicking the selected one clears it. (This replaces the
 * earlier multi-expand fans, which could only exist because each fan was
 * anchored to its own cluster's world position.)
 *
 * All connections are straight single `<line>`s, as everywhere else in the app.
 */

import * as d3 from 'd3'
import {
  CLUSTER_RING,
  STRUCTURED_FOCUS,
  STRUCTURED_HOVER,
  STRUCTURED_NODE_SIZES,
  STRUCTURED_RINGS,
  STRUCTURED_VIEWPORT,
  INSIGHT_RING,
} from './structuredTokens'
import { getInsightStrength,
  getLinkStrokeWidth,
  getNodeStrokeWidth,
  INSIGHT_SIZING,
  LINK_GRADIENT,
  LINK_STYLING,
  NODE_STYLING,
} from '../graphTokens'
import {
  appendUserSpaceLinkGradient,
  renderStraightConnections,
  LINK_BACKGROUND_OPACITY,
} from '../linkRenderer'
import { EXPANDED_CLUSTER } from '../expanded/expandedTokens'
import {
  chipReservedBox,
  deriveExternalBiases,
  getRegionRadius,
  packEntities,
  type ExpandedEntityNode,
  type ExternalBias,
} from '../expanded/useDrilldownModel'
import { deriveCrossClusterEntityPairs } from '../expanded/crossClusterRelations'
import { applyClusterLabelOrientation } from './components/renderClusterRing'
import { applyEntityCountOrientation } from './components/renderEntityRing'
import { applyBridgeBadgeOrientation } from './components/renderClusterEntityBridge'
import { hasVisibleEndpoints, representativeId } from './structuredHover'
import { getResolvedConnections } from './structuredConnections'
import { syntheticNameFor } from '../expanded/demoEntities'
import { graphWorkspace } from '@/data/graphWorkspace'

type ViewportSelection = d3.Selection<SVGGElement, unknown, any, unknown>
type AnySelection = d3.Selection<any, any, any, any>

export interface FocusItem {
  id: string
  label: string
  /**
   * Insight strength on the shared 0–1 scale (getInsightStrength — real
   * connection counts, normalised across the insight set). Carried on the item
   * so the detail view sizes an insight exactly as the Unstructured field
   * does, instead of drawing every one at the window's minimum.
   */
  strength?: number
}

export interface StructuredFocusModel {
  clusterId: string
  /** The cluster's own ring angle (degrees) — where the wheel starts from. */
  clusterAngleDeg: number
  /**
   * Degrees the ring must turn so this cluster lands at the focus angle. Signed
   * and taken the SHORT way round, so the wheel never spins the long way for a
   * cluster just past the focus angle.
   */
  rotationDeg: number
  rootLabel: string
  insights: FocusItem[]
  /** The selected cluster's own member entities. */
  leaves: FocusItem[]
  /** Straight segments between item ids (`fromId` may be the cluster itself). */
  links: Array<{ fromId: string, toId: string, tier: 'insight' | 'leaf' }>
}

/** `ins-deal-velocity` → `Deal velocity` — insights carry no label field. */
function humanizeInsightId(id: string): string {
  const words = id.replace(/^ins-/, '').split('-').filter(Boolean)
  const text = words.join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Derive the drill-down model for a cluster from the LIVE resolved connection
 * set (the resolved set the renderer publishes — NOT the drawn paths, which are
 * deliberately filtered down to the meaningful ones; a cluster's members live in
 * exactly the self-links the mesh does not draw). Returns null when the id has
 * no rendered cluster group.
 *
 * ⚠️ NO GEOMETRY. The model says WHAT the cluster contains and how far the wheel
 * must turn — never where anything goes on screen. Positions belong to the fixed
 * zone's layout below, so that a model can never re-introduce placement relative
 * to the clicked cluster's world position.
 */
export function deriveStructuredFocus(
  viewportGroup: ViewportSelection,
  clusterId: string,
): StructuredFocusModel | null {
  const clusterGroup = viewportGroup.selectAll('g.cluster-node-group')
    .filter((d: any) => d?.id === clusterId)
  if (clusterGroup.empty()) return null
  const clusterDatum: any = clusterGroup.datum()
  const rootLabel = (clusterDatum?.category as string) || clusterId

  const connections = getResolvedConnections()

  // Related INSIGHTS (representative space, visible endpoints) and the
  // cluster's own member ENTITIES (the raw-entity ends of its self-links —
  // exactly the entities the summary circle stands for).
  const insightIds = new Set<string>()
  /** id → the insight's own node, for the shared sizing helper. */
  const insightNodes = new Map<string, any>()
  const memberEntities = new Map<string, any>()
  for (const conn of connections) {
    const ends = [
      { rep: representativeId(conn.sourceNode), node: conn.sourceNode, other: conn.targetNode },
      { rep: representativeId(conn.targetNode), node: conn.targetNode, other: conn.sourceNode },
    ]
    for (const end of ends) {
      if (end.rep !== clusterId) continue
      if (end.node.kind === 'entity') memberEntities.set(end.node.id, end.node)
      if (hasVisibleEndpoints(conn) && end.other.kind === 'insight'
        && representativeId(end.other) !== clusterId) {
        insightIds.add(end.other.id)
        insightNodes.set(end.other.id, end.other)
      }
    }
  }

  // ── The wheel: the shortest turn that brings THIS cluster to the focus angle.
  const clusterAngleDeg = ((clusterDatum?.angle || 0) * 180) / Math.PI
  const rawTurn = STRUCTURED_FOCUS.focusAngleDeg - clusterAngleDeg
  const rotationDeg = ((rawTurn % 360) + 540) % 360 - 180

  const insights = [...insightIds].sort().map(id => ({
    id,
    label: humanizeInsightId(id),
    // The insight's own node carries the connection data the shared sizing
    // helper reads; captured here so the renderer needs no second lookup.
    strength: getInsightStrength(insightNodes.get(id) ?? {}),
  }))

  const leaves = [...memberEntities.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, node]) => ({
      id,
      // The DATASET's own entity label — the same name the Unstructured
      // drill-down shows for this exact node (entityFill.ts writes it at
      // generation). The per-id synthetic name remains only as a fallback for
      // an unlabelled endpoint.
      label: (node?.label as string) || syntheticNameFor(id, rootLabel),
    }))

  /*
   * Entities hang off the insights in CONTIGUOUS BLOCKS of the sorted order,
   * so the chain reads root → insight → its own run of entities. Contiguous
   * rather than round-robin: the layout stacks entities down a column, and a
   * round-robin assignment would have every insight's children scattered the
   * length of it, crossing every other insight's lines. Either assignment is
   * equally arbitrary for this demo data; only one of them is drawable.
   */
  const links: StructuredFocusModel['links'] = []
  for (const ins of insights) links.push({ fromId: clusterId, toId: ins.id, tier: 'insight' })
  const perInsight = insights.length ? Math.ceil(leaves.length / insights.length) : 0
  leaves.forEach((leaf, j) => {
    links.push({
      fromId: insights.length
        ? insights[Math.min(Math.floor(j / perInsight), insights.length - 1)].id
        : clusterId,
      toId: leaf.id,
      tier: 'leaf',
    })
  })

  /*
   * ── INVARIANT (DEV): ONE ENTITY SET PER CLUSTER, IN BOTH MODES ───────────
   *
   * For the same clusterId, Structured and Unstructured must expose EXACTLY
   * the dataset's entity set — same ids, same count, same labels. The dataset
   * (graphWorkspace.ts) is the single source of truth; neither renderer may
   * generate, duplicate or top up entities. Unstructured reads the dataset
   * nodes directly, so checking THIS derivation (which goes through the
   * resolved-connection set instead) against the dataset is what pins the two
   * modes together: if this ever warns, fix the derivation or the resolved
   * connections — never the dataset and never by padding the renderer.
   */
  if (import.meta.env.DEV) {
    const datasetEntities = graphWorkspace.nodes
      .filter(n => n.kind === 'entity' && n.id.startsWith(`${clusterId}-e`))
    const derived = new Set(leaves.map(l => l.id))
    const missing = datasetEntities.filter(n => !derived.has(n.id)).map(n => n.id)
    const extra = leaves.filter(l => !datasetEntities.some(n => n.id === l.id)).map(l => l.id)
    const relabelled = datasetEntities
      .filter(n => derived.has(n.id) && leaves.find(l => l.id === n.id)?.label !== n.label)
      .map(n => n.id)
    if (missing.length || extra.length || relabelled.length) {
      console.warn(
        `[structuredFocus] entity-set invariant violated for ${clusterId}: `
        + `missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'} `
        + `relabelled=${relabelled.join(',') || 'none'} — the dataset is the source of truth; `
        + 'fix the derivation, not the data.',
      )
    }
  }

  return { clusterId, clusterAngleDeg, rotationDeg, rootLabel, insights, leaves, links }
}

const F = STRUCTURED_FOCUS
const D = STRUCTURED_FOCUS.detail
const V = STRUCTURED_VIEWPORT

const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * THE ANCHOR — the wheel's focus point (its East side, nearest the detail area).
 * A constant of the layout: pinned clusters are parked on it, and every band is
 * measured from it, so the detail area is the same area whatever is selected.
 */
const ANCHOR = {
  x: STRUCTURED_RINGS.cluster * Math.cos(rad(F.focusAngleDeg)),
  y: STRUCTURED_RINGS.cluster * Math.sin(rad(F.focusAngleDeg)),
}

/**
 * THE DRILL-DOWN CAMERA — one fixed framing, independent of which clusters are
 * selected: the wheel parked past the left edge (so roughly half of it shows)
 * and the detail area filling the space to its right.
 *
 * Because it takes no arguments it cannot drift toward a cluster. The caller
 * places the camera here once, on opening, and FREEZES it — pan and zoom are
 * off for as long as the drill-down is open, so the detail area cannot move.
 */
export function computeFocusCamera(): d3.ZoomTransform {
  const k = (Math.min(V.dataWidth, V.dataHeight) * D.wheel.radiusFitFraction) / STRUCTURED_RINGS.cluster
  return d3.zoomIdentity
    .translate(V.dataWidth * D.wheel.centerXFraction, V.dataHeight * D.wheel.centerYFraction)
    .scale(k)
}

/** The fixed camera, resolved once — the layout converts through it. */
const CAM = computeFocusCamera()

/**
 * viewBox point → the detail area's frame, whose origin is the ANCHOR. The
 * layers are inside the camera, so a zone expressed in canvas fractions has to
 * come back through the camera to be drawn. Valid because the camera is frozen
 * while the drill-down is open — which is the premise of the mode.
 */
function toLocal(vbX: number, vbY: number) {
  return {
    x: (vbX - CAM.x) / CAM.k - ANCHOR.x,
    y: (vbY - CAM.y) / CAM.k - ANCHOR.y,
  }
}

/**
 * THE PIN — where a selected cluster is parked, relative to the anchor. Clear of
 * the wheel's rim, so a pinned cluster reads as lifted OUT of the ring rather
 * than as one more node sitting on it. It is the origin of every band: the
 * measurements below are all relative to it, not to the anchor.
 */
const PIN_X = toLocal(V.dataWidth * D.pinColumnX, 0).x

/** The detail area, relative to the PIN. Bands are horizontal slices of it. */
const ZONE = (() => {
  const topLeft = toLocal(V.dataWidth * D.zone.x0, V.dataHeight * D.zone.y0)
  const bottomRight = toLocal(V.dataWidth * D.zone.x1, V.dataHeight * D.zone.y1)
  return {
    x0: topLeft.x - PIN_X,
    y0: topLeft.y,
    x1: bottomRight.x - PIN_X,
    y1: bottomRight.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  }
})()
/** The insight column's x, relative to the PIN. */
const INSIGHT_X = toLocal(V.dataWidth * D.insightColumnX, 0).x - PIN_X
/**
 * The canvas's right edge, relative to the PIN. A label's budget is clamped to
 * it: the cell may be wider than the space actually left on screen for the last
 * column, and a name that fits its cell but not the canvas is simply cut off.
 */
const CANVAS_RIGHT = toLocal(V.dataWidth, 0).x - PIN_X

/**
 * A stable 32-bit hash of an id — the seed for the organic scatter.
 * Deterministic by design: the same entity is nudged the same way on every
 * render and every reload, so the layout is reproducible and `Math.random()`
 * stays out of the graph (a house rule).
 */
function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** An item once the layout has given it a place in its band. */
interface PlacedItem extends FocusItem {
  x: number
  y: number
  tier: 'insight' | 'leaf'
  /** Leaves with a cross-cluster relationship carry a persistent label. */
  labelled?: boolean
}

/** One band's layout: its items plus its expanded region's circle. */
interface BandLayout {
  placed: PlacedItem[]
  /** The expanded region, in band-local coordinates. */
  region: { x: number, y: number, r: number }
}

/**
 * Place ONE model's items inside its own BAND of the fixed detail area.
 *
 * A band is a horizontal slice of the zone: with one cluster selected it is the
 * whole zone, with three it is a third of it. The zone itself never changes, so
 * selecting a second cluster re-flows the fields rather than moving the area.
 *
 * ── THE EXPANDED REGION IS THE UNSTRUCTURED ONE ──────────────────────────
 *
 * Entities are NOT laid out here at all: the band draws an expanded-cluster
 * REGION — the same component the Unstructured drill-down opens — and the
 * placement inside it comes from the SHARED `packEntities` (useDrilldownModel):
 * the same golden-angle seed, the same local collision/containment relaxation,
 * the same chip-reservation box, the same outer-annulus bias for externally
 * connected entities. One layout implementation, two modes.
 *
 * The region's RADIUS is the shared `getRegionRadius(count)`, capped so the
 * circle fits its band; its centre sits toward the zone's right edge, leaving
 * the insight column between the pinned cluster and the region.
 *
 * Insights sit in that column, so the chain reads
 * cluster → insight → region, travelling outward from the pinned cluster.
 *
 * Coordinates are LOCAL to the band: (0, 0) is the pinned cluster itself.
 */
function layoutDetail(
  model: StructuredFocusModel,
  bandHeight: number,
  biasFor: (id: string) => ExternalBias | null,
): BandLayout {
  const n = model.leaves.length

  // The shared count-adaptive radius, capped by the band and the zone width.
  const maxByBand = Math.max((bandHeight - D.bandGap) / 2, 44)
  const maxByWidth = Math.max((ZONE.x1 - INSIGHT_X - 60) / 2, 44)
  const r = Math.min(getRegionRadius(n), maxByBand, maxByWidth)
  const region = { x: Math.max(ZONE.x1 - r - 12, INSIGHT_X + 60 + r), y: 0, r }

  /*
   * Label-aware collision, the Unstructured rule verbatim: entities that will
   * carry a persistent label pack with an inflated collision radius (half
   * their estimated text advance, capped), so labels cannot overlap each other
   * or run across neighbouring dots.
   */
  const { labelCollideFactor, labelCollideMax, estCharWidth } = EXPANDED_CLUSTER.entity
  const labelFontSize = EXPANDED_CLUSTER.entityLabel.fontSize
  const collideExtraOf = (node: ExpandedEntityNode): number => {
    if (!biasFor(node.id)) return 0
    const text = node.label || syntheticNameFor(node.id, model.rootLabel)
    return Math.min(labelCollideMax, text.length * labelFontSize * estCharWidth * labelCollideFactor)
  }

  const entityNodes: ExpandedEntityNode[] = model.leaves.map(leaf => ({
    id: leaf.id,
    label: leaf.label,
    kind: 'entity' as const,
    x: 0,
    y: 0,
    size: 8,
  }))

  const leaves: PlacedItem[] = packEntities(
    model.clusterId,
    entityNodes,
    r,
    collideExtraOf,
    node => biasFor(node.id),
    chipReservedBox(model.rootLabel),
  ).map(placement => ({
    id: placement.node.id,
    label: placement.node.label || syntheticNameFor(placement.node.id, model.rootLabel),
    tier: 'leaf' as const,
    x: region.x + placement.dx,
    y: region.y + placement.dy,
    labelled: !!biasFor(placement.node.id),
  }))

  const height = Math.max(bandHeight - D.bandGap, D.bandGap)
  const insights: PlacedItem[] = model.insights.map((item, i, all) => {
    const span = Math.min(height * 0.62, all.length * 90)
    const step = all.length > 1 ? span / (all.length - 1) : 0
    return {
      ...item,
      tier: 'insight' as const,
      x: INSIGHT_X,
      y: -span / 2 + i * step,
    }
  })

  return { placed: [...insights, ...leaves], region }
}

export interface StructuredFocusRenderOptions {
  /**
   * The camera scale the detail is being drawn at. The layer lives INSIDE the
   * camera, so every on-screen size is divided by this (and re-divided by
   * `rescale` when the user zooms).
   */
  cameraK: number
  /** Insight mark colours (from the live chart theme, like the insight ring). */
  insightFill: string
  insightStroke: string
  /**
   * Entity mark fill — pass `nodeColor({ kind: 'entity' })`, the SAME resolver
   * the Unstructured drill-down uses for `expanded-entity`, so the two marks
   * are the same colour by construction rather than by matching a literal.
   */
  entityFill: string
  /**
   * Live design-system token resolver (same one the Unstructured drill-down's
   * chip uses) — the isolated-entity CHIP reads the `expanded-region-chip`
   * colour tokens through it, so the two chips are one style by construction.
   */
  themeColor: (token: string) => string
  /**
   * The accent a SELECTED cluster is marked in — the chart theme's second
   * categorical step, resolved live by the caller. Falls back to the mirrored
   * literal in `STRUCTURED_FOCUS.selection` when the theme is not up yet.
   */
  selectionColor?: string
  /**
   * Collapse one selection — wired to the region chip's × and the region
   * circle's click, exactly the Unstructured contract (its chip/region close
   * that one region). The HOST owns the selection set, so this only asks.
   */
  onCollapse?: (clusterId: string) => void
}

export interface StructuredFocusHandle {
  /**
   * Show the given selection. Keyed by cluster id: a cluster already pinned
   * keeps its slot, a new one is added, a removed one is released back into the
   * wheel. An empty array closes the drill-down.
   */
  update: (models: StructuredFocusModel[], opts: StructuredFocusRenderOptions) => void
  /** Re-apply constant-screen sizes after a camera-scale change. */
  rescale: (cameraK: number) => void
  /**
   * Turn the WHEEL by a delta, with no transition — bound by the caller to
   * scroll and drag on the canvas, which are the navigation in this mode.
   * Pinned clusters do not move: they no longer live in the rotor.
   */
  rotateBy: (deltaDeg: number) => void
  destroy: (animate: boolean) => void
}

/** One pinned cluster: its model, its slot, its marks, and its home in the ring. */
interface PinnedCluster {
  model: StructuredFocusModel
  /** The band group; its transform is the slot, so content is local to it. */
  content: AnySelection
  placed: PlacedItem[]
  /** The cluster's REAL ring element, moved here — never a copy of it. */
  node: SVGGElement | null
  /** The wrapper the whole unit rides in; its transform is the slot delta. */
  wrapper: AnySelection | null
  /** Every element moved out of the ring, with where to put it back. */
  moved: Array<{ el: SVGGElement, parent: Node | null, next: Node | null }>
  /** The unit's ring position, which the slot delta is measured from. */
  ringX: number
  ringY: number
  /** The cluster's ring spoke angle (deg) — unwound when pinned. */
  ringAngleDeg?: number
  /** The pinned node's position in its band's local frame. */
  clusterOffset?: { x: number, y: number }
  /** The band content group's origin, for that offset. */
  bandX?: number
  bandY?: number
  /** The expanded region's circle, band-local (set by layoutDetail). */
  region: { x: number, y: number, r: number } | null
  /** Outer-annulus biases for this band's externally-connected entities. */
  biases: Map<string, ExternalBias>
  marks: {
    leafDots: AnySelection
    insightDots: AnySelection
    labels: AnySelection
    /** The centered category chip (scaled constant-screen in applyGeometry). */
    chip: AnySelection | null
    lineFg: AnySelection | null
    lineBg: AnySelection | null
    lineEnds: AnySelection | null
  } | null
}

/**
 * Create the drill-down controller for a rendered Structured SVG. The controller
 * owns the fixed detail layer, the pinned-selection layer and the wheel's
 * rotation; the caller owns the selection set and hover suspension.
 *
 * `viewportGroup` is where the ring lives: the layers are appended there, the
 * overview selections are read from it, and the rotor inside it is what the
 * wheel turns.
 */
export function createStructuredFocus(viewportGroup: ViewportSelection): StructuredFocusHandle {
  const fade = <S extends AnySelection>(sel: S) => sel.transition().duration(F.transitionMs) as any
  const rotor = viewportGroup.select<SVGGElement>('g.structured-rotor')

  // ── Overview selections, captured once ───────────────────────────────────
  const overviewConnsFg = viewportGroup.selectAll('.link-foreground')
  const overviewConnsBg = viewportGroup.selectAll('.link-background')
  const clusterGroups = viewportGroup.selectAll('g.cluster-node-group')
  const ringLabels = viewportGroup.selectAll('g.cluster-label-group')
  const entityCounts = viewportGroup.selectAll('text.entity-count')
  /**
   * Per-cluster satellites: the entity summary layers and the cluster→entity
   * bridge. Every element carries the CLUSTER's datum (renderEntityRing /
   * renderClusterEntityBridge bind the cluster node), so a pinned cluster's own
   * satellites can be found and hidden — they belong to the ring position the
   * node has just left.
   */
  const satellites = viewportGroup.selectAll(
    // The entity summary is ONE group (base + glass + highlight + COUNT), so
    // pinning carries the count with it instead of stranding it on the ring.
    'g.entity-summary-group, .cluster-entity-bridge, g.cluster-entity-badge',
  )

  /*
   * ── TWO LAYERS, BOTH OUTSIDE THE ROTOR ───────────────────────────────────
   *
   * `selectionLayer` holds the pinned cluster NODES — the real elements, moved
   * out of the rotor, so they stop turning with the wheel while everything still
   * in the rotor keeps turning behind them. Moving rather than copying is what
   * makes "do not duplicate the cluster" structurally true: there is only ever
   * one element per cluster in the DOM.
   *
   * `detailLayer` holds their content — insights, entities, the straight lines
   * between them, and the cross-cluster relations. One band per pinned cluster.
   *
   * Both are children of the viewport group, so they share the camera with the
   * ring (the pinned node stays registered with its own content) but not the
   * rotor's rotation. Neither has any background, rim or container.
   */
  const detailLayer = viewportGroup.append('g')
    .attr('class', 'structured-focus-layer')
    .attr('opacity', 0)
    .style('display', 'none')
    // Inert by default; connection lines and entity marks opt back in below.
    .style('pointer-events', 'none')
  const selectionLayer = viewportGroup.append('g')
    .attr('class', 'structured-selection-layer')
    /*
     * THE LIFT. A soft neutral drop-shadow around everything in the selection
     * layer (the pinned cluster unit — node, logo, badge, bridge), so the
     * selected cluster reads as sitting ABOVE the wheel behind it. Two stacked
     * shadows — a tight one for definition, a wide faint one for the ambient
     * halo — in the DS's neutral white ramp (`button-white-20` / `-10`, the
     * closest tokens to the 14%/8% the design sketched), not a hard bright
     * white. `drop-shadow` follows each element's own alpha silhouette: it
     * never blurs the icons or text themselves, and no element's opacity
     * changes.
     */
    .style('filter',
      'drop-shadow(0 0 8px rgba(var(--v-theme-button-white-20)))'
      + ' drop-shadow(0 0 18px rgba(var(--v-theme-button-white-10)))')

  let rotationDeg = 0
  let cameraK = 1
  /** The entity whose relationships are isolated, if any. */
  let isolatedLeafId: string | null = null
  /** Pinned clusters, in selection order — the order the bands are stacked in. */
  const pinned = new Map<string, PinnedCluster>()
  /** The cross-cluster relation lines, rebuilt whenever the selection changes. */
  let relationGroup: AnySelection | null = null

  /* ── Where a pinned cluster sits, in the viewport's own coordinates ────── */
  const bandHeightFor = (count: number) => ZONE.height / Math.max(count, 1)
  const slotOffsetY = (index: number, count: number) =>
    ZONE.y0 + (index + 0.5) * bandHeightFor(count)

  /**
   * ── WHERE EACH OPEN CLUSTER'S BAND SITS ──────────────────────────────────
   *
   * Several open clusters used to be stacked in ONE vertical column: every
   * band took the same x and an index-driven y, which read as a list rather
   * than a composition and left the right-hand canvas half empty.
   *
   * Bands are now placed by SCORING candidate positions over a fixed lattice
   * spanning the zone, in click order:
   *
   *   · a candidate is REJECTED outright if its region circle would leave the
   *     zone or come within `gap` of an already-placed circle — so overlap and
   *     clipping are impossible rather than merely unlikely;
   *   · among the survivors the cost prefers a SHORT connector back to the
   *     pinned cluster, minus a spread term that pushes a band away from the
   *     ones already down. Short-line pull plus spread push is what produces
   *     the loose stagger instead of either a column or a scatter.
   *
   * The x range is deliberately bounded: a band carries its insight column and
   * entity field to the zone's right edge, so moving it far left would push
   * that content over the radial graph and far right would clip it. Inside
   * that bound the composition still uses both axes.
   *
   * Deterministic: candidates are visited in a fixed order, ties keep the
   * earlier one, and the input order is the click order.
   */
  function computeBandSlots(
    radii: number[],
  ): Array<{ x: number, y: number }> {
    const count = radii.length
    if (count === 0) return []
    // One band: leave the established single-band position exactly as it was.
    if (count === 1) return [{ x: 0, y: slotOffsetY(0, 1) }]

    /*
     * ── Y: the guaranteed-clear spacing. X: the stagger. ──────────────────
     *
     * The band rows keep the original even division of the zone, and that is
     * deliberate: each band's radius is already capped at `(bandHeight - gap)/2`
     * by `layoutDetail`, so consecutive rows CANNOT overlap however large the
     * clusters are. Overlap is prevented by construction rather than by a
     * collision test — which is what an earlier scored version got wrong here,
     * because it had to predict the radius `layoutDetail` would choose and any
     * disagreement let two circles touch.
     *
     * The composition then comes from X: a fixed, index-driven stagger that
     * slides each band off the column. Because the rows are already clear
     * vertically, moving a band sideways can never create an overlap — it only
     * changes where in its own row the circle sits.
     *
     * Bounded on purpose: a band carries its insight column and entity field
     * out to the zone's right edge, so a large shift would push that content
     * over the radial graph on one side or off the canvas on the other. The
     * bound is also what keeps every circle inside the visible area.
     */
    const xSpread = ZONE.width * 0.16
    const STAGGER = [-1, 0.62, -0.34, 1]
    return radii.map((r, index) => {
      const localX = Math.max(ZONE.x1 - r - 12, INSIGHT_X + 60 + r)
      let dx = xSpread * STAGGER[index % STAGGER.length]
      // Clamp so the circle stays fully inside the zone at this row.
      const minDx = ZONE.x0 + r - localX
      const maxDx = ZONE.x1 - r - localX
      dx = Math.max(minDx, Math.min(maxDx, dx))
      return { x: dx, y: slotOffsetY(index, count) }
    })
  }

  /** The pinned clusters' y in the band frame — connectors run back to it. */
  const ANCHOR_LOCAL_Y = 0

  /** Mark radius for an item, in DATA units at the current camera scale. */
  const radiusOf = (item: PlacedItem | undefined) => {
    // The expanded-entity radius with its on-screen floor — the exact formula
    // the Unstructured drill-down renders its dots with.
    if (item?.tier !== 'insight') return Math.max(F.leaf.radius, F.leaf.minVisualRadius / cameraK)
    /*
     * Insights vary here exactly as they do everywhere else: the SHARED window
     * (INSIGHT_SIZING) driven by the SHARED strength scale. Was pinned to
     * `minDiameter / 2`, which drew every detail insight at the same size no
     * matter how many relationships it carried.
     */
    const { minDiameter, maxDiameter } = INSIGHT_SIZING
    const strength = Math.max(0, Math.min(1, item.strength ?? 0))
    return (minDiameter + strength * (maxDiameter - minDiameter)) / 2 / cameraK
  }

  /**
   * ── CLUSTER RELATEDNESS ──────────────────────────────────────────────────
   * From the same resolved connection set every other Structured feature reads.
   * Two clusters relate when they are directly linked, share an Insight, share
   * the Source/Document they were extracted from, or carry the same category.
   * The first two are the Unstructured drill-down's own rule; the last two are
   * added because this dataset has no cluster↔cluster links at all, so without
   * them the cross-cluster layer would never draw anything.
   */
  const clusterLinks = (() => {
    const connections = getResolvedConnections()
    const neighbours = new Map<string, Set<string>>()
    const repKind = new Map<string, string>()
    const hubsOf = new Map<string, Set<string>>()
    const categoryOf = new Map<string, string>()
    const addTo = (map: Map<string, Set<string>>, a: string, b: string) => {
      if (!map.has(a)) map.set(a, new Set())
      map.get(a)!.add(b)
    }
    const HUB_KINDS = new Set(['source', 'document'])
    viewportGroup.selectAll('g.cluster-node-group')
      .each((d: any) => { if (d?.id && d?.category) categoryOf.set(d.id, d.category) })
    for (const conn of connections) {
      const a = representativeId(conn.sourceNode)
      const b = representativeId(conn.targetNode)
      if (a === b) continue
      if (HUB_KINDS.has(conn.targetNode.kind)) { addTo(hubsOf, a, b); continue }
      if (HUB_KINDS.has(conn.sourceNode.kind)) { addTo(hubsOf, b, a); continue }
      if (!hasVisibleEndpoints(conn)) continue
      repKind.set(a, conn.sourceNode.kind === 'entity' ? 'cluster' : conn.sourceNode.kind)
      repKind.set(b, conn.targetNode.kind === 'entity' ? 'cluster' : conn.targetNode.kind)
      addTo(neighbours, a, b)
      addTo(neighbours, b, a)
    }
    /** Directly linked in the resolved data — a real edge, not an inference. */
    const direct = (a: string, b: string) => !!neighbours.get(a)?.has(b)
    const related = (a: string, b: string): boolean => {
      const near = neighbours.get(a)
      if (near?.has(b)) return true
      if (near) {
        for (const via of near) {
          if (repKind.get(via) === 'insight' && neighbours.get(via)?.has(b)) return true
        }
      }
      const hubs = hubsOf.get(a)
      const otherHubs = hubsOf.get(b)
      if (hubs && otherHubs) {
        for (const hub of hubs) if (otherHubs.has(hub)) return true
      }
      // The qualifier on a repeated category ("People 2") names the same KIND of
      // thing as "People", so topical relatedness compares the base word.
      const base = (v?: string) => v?.replace(/ \d+$/, '')
      const category = base(categoryOf.get(a))
      return !!category && category === base(categoryOf.get(b))
    }
    return { related, direct }
  })()
  const clustersRelated = clusterLinks.related

  /* ── Pinning: move the REAL node out of the wheel, and put it back ─────── */

  /**
   * PIN — lift the cluster's EXISTING elements out of the wheel and re-anchor
   * them at a slot. Nothing is drawn twice: the node, its entity summary, its
   * count badge and its cluster→entity bridge are the very elements the ring
   * rendered, moved by `appendChild` into a wrapper whose transform is the
   * delta from their ring position to the slot. Their own coordinates are
   * untouched, so the unit travels rigidly and keeps its internal geometry.
   */
  function pinNode(entry: PinnedCluster, x: number, y: number) {
    if (!entry.wrapper) {
      const nodeEl = clusterGroups.filter((d: any) => d?.id === entry.model.clusterId)
        .node() as SVGGElement | null
      if (!nodeEl) return
      const datum: any = d3.select(nodeEl).datum()
      entry.node = nodeEl
      entry.ringX = datum?.x ?? 0
      entry.ringY = datum?.y ?? 0
      // The spoke angle this cluster sits at. Pinning UNWINDS it (below), so
      // the unit reads horizontally instead of keeping its radial tilt.
      entry.ringAngleDeg = ((datum?.angle ?? 0) * 180) / Math.PI
      const unit = [
        nodeEl,
        ...(satellites.filter((d: any) => d?.id === entry.model.clusterId).nodes() as SVGGElement[]),
      ]
      // Remember exactly where each element came from, so releasing puts the
      // cluster back into the ring in its original order as well as position.
      entry.moved = unit.map(el => ({ el, parent: el.parentNode, next: el.nextSibling }))
      const wrapper = selectionLayer.append('g')
        .attr('class', 'structured-pinned-cluster')
        .attr('data-cluster-id', entry.model.clusterId)
      for (const el of unit) (wrapper.node() as SVGGElement).appendChild(el)
      entry.wrapper = wrapper
    }
    /*
     * ⚠️ NAMED. `applySelectionHighlight` runs a fade on the same elements in
     * the same pass, and two UNNAMED transitions on one element cancel each
     * other — the unit was starting its move to the slot and being interrupted
     * a frame later, leaving it at its old ring position.
     */
    /*
     * ── THE UNIT IS NORMALISED HORIZONTAL ────────────────────────────────
     * `translate(...) rotate(-angle, ringX, ringY)`: the rotation unwinds the
     * cluster's own spoke about its ring position, so the radial run
     * `entity summary → bridge/badge → cluster` becomes a horizontal row, and
     * the translate then carries that row to its slot. Reading right to left
     * on screen the cluster is outermost, exactly as on the ring.
     *
     * Still ONE move of the ORIGINAL elements — nothing is duplicated, and each
     * element keeps its own coordinates.
     */
    /*
     * ── LIFTED AT THE FOCUS POINT, NOT RELOCATED ─────────────────────────
     * The wheel has already turned this cluster to the focus angle, so the
     * ANCHOR is where it now sits ON THE RING. Pinning there — and NOT at
     * `ANCHOR + PIN_X`, which used to drag it ~300px further toward the middle
     * of the canvas — makes it read as the same cluster lifted off the rim
     * rather than a node that travelled somewhere else. The unwind rotation is
     * about the node's own centre, so it stops turning with the rotor while
     * its bridge, badge and entity summary swing level beside it.
     *
     * The band still lives in the detail area; `entry.clusterOffset` is where
     * the node sits in that band's frame, so the lines drawn from the cluster
     * start on the real node rather than at the band's empty origin.
     */
    const unwind = -(entry.ringAngleDeg ?? 0)
    entry.clusterOffset = { x: x - (entry.bandX ?? x), y: y - (entry.bandY ?? y) }
    entry.wrapper.transition('pin').duration(F.transitionMs)
      .attr(
        'transform',
        `translate(${x - entry.ringX}, ${y - entry.ringY}) rotate(${unwind}, ${entry.ringX}, ${entry.ringY})`,
      )
    /*
     * Marks that must stay UPRIGHT inside the unwound unit re-tilt by the same
     * angle: the wrapper turned them by `unwind`, so +angle puts them back
     * level. The logo counter-rotates about the node's own centre; the count
     * about its summary group's origin.
     */
    const upright = `rotate(${entry.ringAngleDeg ?? 0})`
    d3.select(entry.node!).select('image.cluster-source-icon')
      .interrupt().attr('transform', upright)
    entry.wrapper.selectAll('g.entity-summary-group text.entity-count')
      .interrupt('orient').attr('transform', upright)
  }

  /**
   * Put a released cluster's elements back exactly where they came from.
   *
   * ⚠️ The remembered `next` sibling is only a HINT. Between pinning and
   * releasing, other clusters may have been pinned and released around it, so
   * that node is not guaranteed to still be a child of the same parent —
   * `insertBefore` throws on that, which used to abort the release half-way and
   * strand the wrapper. Falling back to `appendChild` restores the element to
   * the right parent whatever happened in between; ordering inside a ring layer
   * carries no meaning.
   */
  function releaseNode(entry: PinnedCluster) {
    for (const { el, parent, next } of entry.moved) {
      if (!parent) continue
      if (next && next.parentNode === parent) parent.insertBefore(el, next)
      else parent.appendChild(el)
    }
    entry.moved = []
    entry.wrapper?.interrupt('pin')
    entry.wrapper?.remove()
    entry.wrapper = null
    entry.node = null
  }

  /* ── Geometry ─────────────────────────────────────────────────────────── */

  /** Straight segment between two ENDPOINTS of one band, trimmed to both marks. */
  function segmentIn(entry: PinnedCluster, link: { fromId: string, toId: string }) {
    const by = new Map(entry.placed.map(i => [i.id, i]))
    /** Resolve an endpoint: the pinned node, the region's circle, or an item. */
    const resolve = (id: string): { x: number, y: number, r: number } => {
      if (id === '__cluster__') {
        // The pinned node stays on the ring — this is where it sits in the
        // band's own frame, so a cluster→item line starts on the real node.
        const at = entry.clusterOffset ?? { x: 0, y: 0 }
        return { x: at.x, y: at.y, r: STRUCTURED_NODE_SIZES.cluster / 2 }
      }
      if (id === '__region__') {
        const region = entry.region ?? { x: 0, y: 0, r: 0 }
        return { x: region.x, y: region.y, r: region.r }
      }
      const item = by.get(id)
      return { x: item?.x ?? 0, y: item?.y ?? 0, r: radiusOf(item) }
    }
    const from = resolve(link.fromId)
    const to = resolve(link.toId)
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.hypot(dx, dy) || 1
    const pad = F.line.endpointGap / cameraK
    return {
      x1: from.x + (dx / len) * (from.r + pad),
      y1: from.y + (dy / len) * (from.r + pad),
      x2: to.x - (dx / len) * (to.r + pad),
      y2: to.y - (dy / len) * (to.r + pad),
    }
  }

  /**
   * Write the coordinates and the constant-screen sizes onto one band's marks.
   *
   * The band does NOT rotate with the wheel, which is exactly why the labels can
   * stay HORIZONTAL: there is no angle for them to follow, so each name reads
   * left-to-right beside its dot at every wheel position.
   */
  function applyGeometry(entry: PinnedCluster) {
    const marks = entry.marks
    if (!marks) return
    const leafR = Math.max(F.leaf.radius, F.leaf.minVisualRadius / cameraK)
    const eLabel = EXPANDED_CLUSTER.entityLabel
    // The Unstructured label sizing: token size, floored on screen.
    const fontSize = Math.max(eLabel.fontSize, eLabel.minVisualFontSize / cameraK)

    marks.leafDots.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y).attr('r', leafR)
    marks.insightDots.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)
      .attr('r', (d: any) => radiusOf(d))
      .attr('stroke-width', getNodeStrokeWidth('insight', cameraK))

    /*
     * Side-aware labels, the Unstructured convention: the name sits on the
     * entity's OUTWARD side of its region (start-anchored right of centre,
     * end-anchored left), so labels point out of the dense disc instead of
     * colliding across it.
     */
    const regionX = entry.region?.x ?? 0
    const side = (d: any) => (d.x >= regionX ? 1 : -1)
    marks.labels
      .attr('font-size', fontSize)
      .attr('x', (d: any) => d.x + side(d) * (leafR + eLabel.offsetX / cameraK))
      .attr('y', (d: any) => d.y)
      .attr('text-anchor', (d: any) => (side(d) > 0 ? 'start' : 'end'))

    // The chip: leading dot pinned to the region centre, constant-screen.
    marks.chip?.attr('transform',
      `translate(${entry.region?.x ?? 0}, ${entry.region?.y ?? 0}) scale(${1 / cameraK})`)

    const place = (sel: AnySelection | null) => sel
      ?.attr('x1', (d: any) => segmentIn(entry, d).x1)
      .attr('y1', (d: any) => segmentIn(entry, d).y1)
      .attr('x2', (d: any) => segmentIn(entry, d).x2)
      .attr('y2', (d: any) => segmentIn(entry, d).y2)
    place(marks.lineFg)
    place(marks.lineBg)
    marks.lineEnds
      ?.attr('cx', (p: any) => (p.end === 'source' ? segmentIn(entry, p.d).x1 : segmentIn(entry, p.d).x2))
      .attr('cy', (p: any) => (p.end === 'source' ? segmentIn(entry, p.d).y1 : segmentIn(entry, p.d).y2))
    marks.lineFg?.attr('stroke-width', getLinkStrokeWidth('default', cameraK) * F.line.widthFactor)
  }

  /*
   * ── ISOLATE ONE ENTITY ───────────────────────────────────────────────────
   *
   * Clicking an entity answers "what is this connected to?" by leaving only that
   * neighbourhood lit: the entity itself, the Insight it hangs off, and the
   * entities under that Insight. Membership comes from the drawn chain's own
   * data, never from what happens to sit near it on screen. Opacity only —
   * nothing moves, so clearing restores exactly the resting values.
   */
  function neighbourhoodOf(entry: PinnedCluster, entityId: string): Set<string> {
    const set = new Set<string>([entityId])
    // Cross-cluster partners, from the bias targets computed at layout time —
    // the same relationships the relation lines draw.
    const bias = entry.biases.get(entityId)
    for (const target of bias?.targetIds ?? []) set.add(target)
    return set
  }

  function applyLeafIsolation(opts: StructuredFocusRenderOptions) {
    detailLayer.selectAll('g.structured-focus-entity-chip').remove()
    /*
     * The neighbourhood is GLOBAL: an isolated entity's partners live in OTHER
     * bands (cross-cluster relations are what isolation exists to read), so the
     * active set is resolved once from the owning band and applied to every
     * band's marks — a partner stays lit in its own region.
     */
    const owner = isolatedLeafId
      ? [...pinned.values()].find(e => e.placed.some(i => i.id === isolatedLeafId))
      : undefined
    const active = owner && isolatedLeafId
      ? neighbourhoodOf(owner, isolatedLeafId)
      : new Set<string>()

    for (const entry of pinned.values()) {
      const marks = entry.marks
      if (!marks) continue
      const chainFg = entry.content.selectAll<SVGLineElement, any>('line.structured-focus-link')
      const chainBg = entry.content.selectAll<SVGLineElement, any>('line.structured-focus-link-background')
      const chainEnds = entry.content.selectAll<SVGCircleElement, any>('circle.structured-focus-link-endpoint')

      if (!isolatedLeafId) {
        marks.leafDots.attr('opacity', F.leaf.opacity).style('pointer-events', 'auto')
        marks.insightDots.attr('opacity', 1)
        // Labels return to their RESTING pattern: persistent for cross-linked
        // entities, hidden for the rest — never all-on.
        marks.labels.attr('opacity', (d: any) =>
          (d.labelled ? EXPANDED_CLUSTER.entityLabel.persistentOpacity : 0))
        chainFg.attr('opacity', LINK_STYLING.opacity.base)
        chainBg.attr('opacity', LINK_BACKGROUND_OPACITY)
        chainEnds.attr('opacity', LINK_STYLING.endpoints.opacity)
        continue
      }

      marks.leafDots
        .attr('opacity', (d: any) => (d.id === isolatedLeafId ? 0 : active.has(d.id) ? 1 : F.leaf.dimOpacity))
        .style('pointer-events', (d: any) => (active.has(d.id) && d.id !== isolatedLeafId ? 'auto' : 'none'))
      marks.insightDots.attr('opacity', F.leaf.dimOpacity)
      // The clicked entity's own label hides (the chip stands in for it);
      // partners show theirs so the relationship reads by name.
      marks.labels.attr('opacity', (d: any) => (d.id === isolatedLeafId
        ? 0
        : active.has(d.id) ? EXPANDED_CLUSTER.entityLabel.opacity : 0))
      // Structural chain lines recede — the isolation is about relations.
      chainFg.attr('opacity', LINK_STYLING.opacity.hidden)
      chainBg.attr('opacity', 0)
      chainEnds.attr('opacity', 0)
    }

    /*
     * Relation lines: only the pairs touching the isolated entity stay lit, at
     * the hover emphasis — the rest hide. Data-driven off each line's own pair.
     */
    if (isolatedLeafId) {
      relationGroup?.selectAll('line')
        .attr('opacity', (pair: any) => (
          pair?.aEntityId === isolatedLeafId || pair?.bEntityId === isolatedLeafId
            ? LINK_STYLING.opacity.hover
            : 0))
    } else {
      relationGroup?.selectAll('line.structured-focus-relation')
        .attr('opacity', LINK_STYLING.opacity.base)
      relationGroup?.selectAll('line.structured-focus-relation-background')
        .attr('opacity', LINK_BACKGROUND_OPACITY)
    }

    if (owner && isolatedLeafId) {
      const clicked: any = owner.marks?.leafDots.filter((d: any) => d.id === isolatedLeafId).datum()
      buildIsolatedEntityChip(owner, opts, clicked)
    }
  }

  /**
   * Build ONE chip — `[ • Label  × ]` — in the shared expanded-region-chip
   * language: every colour, radius, padding, the leading dot, the divider and
   * the × come from the one EXPANDED_CLUSTER.chip token set, resolved live.
   * Width hugs the measured label; the LEADING DOT sits on the group's local
   * origin, so the caller anchors the chip by transforming the group. Used by
   * the region's centered category chip AND the isolated-entity chip, so the
   * two cannot drift apart.
   */
  function buildChip(
    host: AnySelection,
    className: string,
    label: string,
    opts: StructuredFocusRenderOptions,
    onClose: () => void,
    closeLabel: string,
  ): AnySelection {
    const chip = EXPANDED_CLUSTER.chip
    const chipFill = opts.themeColor(chip.fillToken)
    const chipInk = opts.themeColor(chip.inkToken)
    const chipBorder = opts.themeColor(chip.borderToken)
    const chipClose = opts.themeColor(chip.closeToken)

    const chipGroup = host.append('g')
      .attr('class', className)
      .style('pointer-events', 'none')
    // Origin at the LEADING DOT: local x = paddingX + dotRadius maps to 0.
    const inner = chipGroup.append('g')
      .attr('transform', `translate(${-(chip.paddingX + chip.dotRadius)}, 0)`)

    const bg = inner.append('rect')
      .attr('class', 'expanded-chip-bg')
      .attr('y', -chip.height / 2)
      .attr('height', chip.height)
      .attr('rx', chip.height / 2)
      .attr('fill', chipFill)
      .attr('stroke', chipBorder)
      .attr('stroke-width', chip.borderWidth)

    inner.append('circle')
      .attr('class', 'expanded-chip-dot')
      .attr('cx', chip.paddingX + chip.dotRadius)
      .attr('cy', 0)
      .attr('r', chip.dotRadius)
      .attr('fill', chipInk)

    const text = inner.append('text')
      .attr('class', 'expanded-chip-label')
      .attr('x', chip.paddingX + chip.dotRadius * 2 + chip.gap)
      .attr('y', 0)
      .attr('dominant-baseline', 'middle')
      .attr('font-family', chip.fontFamily)
      .attr('font-size', chip.fontSize)
      .attr('font-weight', chip.fontWeight)
      .attr('fill', chipInk)
      .text(label)

    // Hug-content width, exactly the drill-down chip's layout:
    //   paddingX │ dot │ gap │ label │ divider.gap │ rule │ close.gap │ × │ paddingX
    const textLength = (text.node() as SVGTextElement).getComputedTextLength?.()
      ?? label.length * chip.fontSize * 0.6
    const width = chip.paddingX + chip.dotRadius * 2 + chip.gap + textLength
      + chip.divider.gap + chip.divider.width + chip.close.gap + chip.close.size
      + chip.paddingX
    bg.attr('x', 0).attr('width', width)

    const dividerX = width - chip.paddingX - chip.close.size - chip.close.gap
      - chip.divider.width / 2
    inner.append('line')
      .attr('class', 'expanded-chip-divider')
      .attr('stroke', chipBorder)
      .attr('stroke-width', chip.divider.width)
      .attr('x1', dividerX).attr('x2', dividerX)
      .attr('y1', -chip.height / 2 + chip.borderWidth)
      .attr('y2', chip.height / 2 - chip.borderWidth)

    const close = inner.append('g')
      .attr('class', 'expanded-chip-close')
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('aria-label', closeLabel)
      .attr('transform', `translate(${width - chip.paddingX - chip.close.size}, 0)`)
      .style('pointer-events', 'auto')
      .style('cursor', 'pointer')
      .on('pointerdown', (event: PointerEvent) => event.stopPropagation())
      .on('click', (event: MouseEvent) => {
        event.stopPropagation()
        onClose()
      })
      .on('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
      })
    close.append('rect')
      .attr('class', 'expanded-chip-close-hit')
      .attr('x', -chip.close.hitPadding)
      .attr('y', -chip.close.size / 2 - chip.close.hitPadding)
      .attr('width', chip.close.size + chip.close.hitPadding * 2)
      .attr('height', chip.close.size + chip.close.hitPadding * 2)
      .attr('fill', 'transparent')
    close.append('path')
      .attr('class', 'expanded-chip-close-glyph')
      .attr('d', chip.close.path)
      .attr('fill', chipClose)
      .attr('opacity', chip.close.opacity)
      .attr('transform', `translate(0, ${-chip.close.size / 2}) scale(${chip.close.size / chip.close.viewBox})`)

    return chipGroup
  }

  /**
   * The isolated entity's CHIP — the shared chip, anchored so its leading dot
   * sits exactly on the entity's point. The × restores the normal view.
   */
  function buildIsolatedEntityChip(
    entry: PinnedCluster,
    opts: StructuredFocusRenderOptions,
    clicked: any,
  ) {
    if (!clicked) return
    buildChip(
      entry.content,
      'structured-focus-entity-chip',
      clicked.label || clicked.id,
      opts,
      () => {
        isolatedLeafId = null
        applyLeafIsolation(opts)
      },
      `Clear ${clicked.label ?? 'entity'} isolation`,
    )
      // Constant-screen, anchored on the entity's point.
      .attr('transform', `translate(${clicked.x}, ${clicked.y}) scale(${1 / cameraK})`)
  }

  /** Draw one band's content (positions applied by `applyGeometry`). */
  function buildContent(entry: PinnedCluster, opts: StructuredFocusRenderOptions) {
    const group = entry.content
    const model = entry.model
    group.selectAll('*').remove()
    const insights = entry.placed.filter(i => i.tier === 'insight')
    const leaves = entry.placed.filter(i => i.tier === 'leaf')
    const region = entry.region ?? { x: INSIGHT_X + 120, y: 0, r: 80 }

    /*
     * The paint servers, owned by this band so they live exactly as long as it
     * does. USER SPACE across the band rather than each line's bounding box,
     * because a row is routinely EXACTLY horizontal and an objectBoundingBox
     * paint server is not rendered when the box has zero height. Ordered
     * low → high so the ramp runs outward whichever edge the wheel is parked at.
     */
    const defs = group.append('defs')
    const fgId = `structured-focus-link-gradient--${model.clusterId}`
    const bgId = `structured-focus-link-bg--${model.clusterId}`
    const rampFrom = Math.min(0, ZONE.x0, ZONE.x1)
    const rampTo = Math.max(0, ZONE.x0, ZONE.x1)
    appendUserSpaceLinkGradient(defs, fgId, rampFrom, rampTo)
    appendUserSpaceLinkGradient(defs, bgId, rampFrom, rampTo, LINK_GRADIENT.background.stops)
    // The region's glass backing blur — same construction as the Unstructured
    // drill-down's (`expanded-region-glass-blur`), owned by this band.
    defs.append('filter')
      .attr('id', `structured-region-glass-blur--${model.clusterId}`)
      .attr('x', '-30%').attr('y', '-30%')
      .attr('width', '160%').attr('height', '160%')
      .append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', EXPANDED_CLUSTER.region.glass.backingBlur)

    /*
     * ── THE EXPANDED REGION — the Unstructured component, here ────────────
     * Blurred glass disc behind a crisp dashed circle, every value from
     * EXPANDED_CLUSTER.region (primary treatment: this region was explicitly
     * opened). Clicking the region collapses it — the same contract as the
     * Unstructured region circle.
     */
    const regionGroup = group.append('g').attr('class', 'structured-focus-region expanded-region')
    regionGroup.append('circle')
      .attr('class', 'expanded-region-glass')
      .attr('cx', region.x).attr('cy', region.y).attr('r', region.r)
      .attr('fill', EXPANDED_CLUSTER.region.fill)
      .attr('filter', `url(#structured-region-glass-blur--${model.clusterId})`)
      .style('pointer-events', 'none')
    regionGroup.append('circle')
      .attr('class', 'expanded-region-circle')
      .attr('cx', region.x).attr('cy', region.y).attr('r', region.r)
      .attr('fill', EXPANDED_CLUSTER.region.fill)
      .attr('stroke', EXPANDED_CLUSTER.region.stroke)
      .attr('stroke-dasharray', EXPANDED_CLUSTER.region.strokeDasharray)
      .attr('stroke-opacity', EXPANDED_CLUSTER.region.strokeOpacity)
      .style('pointer-events', 'auto')
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent) => {
        event.stopPropagation()
        opts.onCollapse?.(model.clusterId)
      })

    /*
     * ── THE CHAIN: pinned cluster → insights → region ─────────────────────
     * Structural links only — entities live INSIDE the region now, so lines
     * stop at the region's edge instead of running to individual dots (the
     * Unstructured convention: external connections meet the region boundary).
     * `__cluster__` and `__region__` resolve in segmentIn.
     */
    const chainLinks = insights.length
      ? [
          ...insights.map(i => ({ fromId: '__cluster__', toId: i.id, tier: 'insight' as const })),
          ...insights.map(i => ({ fromId: i.id, toId: '__region__', tier: 'leaf' as const })),
        ]
      : [{ fromId: '__cluster__', toId: '__region__', tier: 'leaf' as const }]

    const linksGroup = group.append('g').attr('class', 'structured-focus-links')
    const chain = renderStraightConnections(
      linksGroup,
      chainLinks,
      (l: any) => segmentIn(entry, l),
      {
        className: 'structured-focus-link',
        zoomScale: cameraK,
        stroke: `url(#${fgId})`,
        backgroundStroke: `url(#${bgId})`,
        widthFactor: F.line.widthFactor,
      },
    )

    // Hover highlighting, the same relationship the base graph draws.
    const focusLines = chain.foreground
    const focusEndpoints = chain.endpoints
    const setLineState = (activeKey: string | null) => {
      if (isolatedLeafId) return
      const width = getLinkStrokeWidth('default', cameraK) * F.line.widthFactor
      focusLines
        .attr('opacity', (l: any) => (activeKey === null
          ? LINK_STYLING.opacity.base
          : (`${l.fromId}~${l.toId}` === activeKey ? LINK_STYLING.opacity.hover : LINK_STYLING.opacity.hidden)))
        .attr('stroke-width', (l: any) => (activeKey !== null && `${l.fromId}~${l.toId}` === activeKey
          ? width * 1.3
          : width))
      focusEndpoints?.attr('opacity', (p: any) => (activeKey === null
        || `${p.d.fromId}~${p.d.toId}` === activeKey
        ? LINK_STYLING.endpoints.opacity
        : 0))
    }
    setLineState(null)
    focusLines
      .style('pointer-events', 'stroke')
      .on('mouseenter', (_event: any, l: any) => setLineState(`${l.fromId}~${l.toId}`))
      .on('mouseleave', () => setLineState(null))

    // ── Insight marks — same visual language as the insight ring ──────────
    const insightDots = group.append('g').attr('class', 'structured-focus-insights')
      .selectAll('circle')
      .data(insights)
      .join('circle')
      .attr('class', 'structured-focus-insight')
      .attr('fill', NODE_STYLING.insight.fill)
      .attr('stroke', NODE_STYLING.insight.stroke)
      .attr('stroke-width', getNodeStrokeWidth('insight', cameraK))
      .style('pointer-events', 'auto')
    insightDots.append('title').text((d: any) => d.label)

    /*
     * Entity marks — the `expanded-entity`, not a lookalike: the shared token
     * radius with its on-screen floor, the fill the caller resolved with
     * `nodeColor({ kind: 'entity' })`, no stroke, the same resting opacity and
     * hover contract. Packed INSIDE the region by the shared packEntities.
     */
    const leafDots = group.append('g').attr('class', 'structured-focus-leaves expanded-entities')
      .selectAll('circle')
      .data(leaves)
      .join('circle')
      .attr('class', 'structured-focus-leaf expanded-entity')
      .attr('fill', opts.entityFill)
      .attr('opacity', F.leaf.opacity)
      .style('pointer-events', 'auto')
      .style('cursor', 'pointer')
    leafDots
      .on('mouseenter', function (_event: any, hovered: any) {
        if (isolatedLeafId) return
        leafDots.attr('opacity', (d: any) => (d.id === hovered.id ? 1 : F.leaf.dimOpacity))
        // Hover reveals the name — the Unstructured contract: persistent
        // labels belong to cross-linked entities, everyone else on demand.
        entry.marks?.labels.attr('opacity', (d: any) => (d.id === hovered.id
          ? EXPANDED_CLUSTER.entityLabel.opacity
          : d.labelled ? EXPANDED_CLUSTER.entityLabel.persistentOpacity : 0))
      })
      .on('mouseleave', () => {
        if (isolatedLeafId) return
        leafDots.attr('opacity', F.leaf.opacity)
        entry.marks?.labels.attr('opacity', (d: any) =>
          (d.labelled ? EXPANDED_CLUSTER.entityLabel.persistentOpacity : 0))
      })
      .on('click', (event: MouseEvent, clicked: any) => {
        event.stopPropagation()
        isolatedLeafId = isolatedLeafId === clicked.id ? null : clicked.id
        applyLeafIsolation(opts)
      })

    /*
     * Entity labels — the Unstructured `expanded-entity-label`: persistent only
     * for cross-linked entities (they explain why two regions are joined),
     * hover-revealed for the rest; side-aware anchoring so a name points out of
     * the disc instead of across its centre; the same ink, stroke-halo, weight
     * and family tokens.
     */
    const labels = group.append('g').attr('class', 'structured-focus-labels')
      .selectAll('text')
      .data(leaves)
      .join('text')
      .attr('class', 'structured-focus-label expanded-entity-label')
      .attr('dominant-baseline', 'middle')
      .attr('font-family', EXPANDED_CLUSTER.entityLabel.fontFamily)
      .attr('font-weight', EXPANDED_CLUSTER.entityLabel.fontWeight)
      .attr('fill', EXPANDED_CLUSTER.entityLabel.ink)
      .attr('opacity', (d: any) => (d.labelled ? EXPANDED_CLUSTER.entityLabel.persistentOpacity : 0))
      .style('pointer-events', 'none')
      .style('-webkit-text-stroke-color', EXPANDED_CLUSTER.entityLabel.textStroke)
      .style('-webkit-text-stroke-width', `${EXPANDED_CLUSTER.entityLabel.textStrokeWidth}px`)
      .text((d: any) => d.label)

    /*
     * THE REGION CHIP — the selected cluster's name, one per open cluster.
     *
     * Built per BAND (this function runs once per selected cluster), so a
     * multi-selection gives every expanded region its own chip rather than one
     * shared label. Its leading dot is pinned to the region's centre with the
     * pill extending rightward — the same anchoring the Unstructured renderer
     * uses — and `applyGeometry` re-applies that transform on every camera
     * change, so it stays put and constant-screen through focus and expand
     * transitions instead of disappearing after them. The × collapses this
     * cluster.
     */
    const chipGroup = model.rootLabel
      ? buildChip(
          group,
          'structured-focus-region-chip expanded-region-chip',
          model.rootLabel,
          opts,
          () => opts.onCollapse?.(model.clusterId),
          `Collapse ${model.rootLabel}`,
        )
      : null

    entry.marks = {
      leafDots,
      insightDots,
      labels,
      chip: chipGroup,
      lineFg: chain.foreground,
      lineBg: chain.background,
      lineEnds: chain.endpoints,
    }
    applyGeometry(entry)
  }

  /**
   * ── CROSS-CLUSTER RELATIONS ──────────────────────────────────────────────
   *
   * Entity ↔ Entity links BETWEEN two selected clusters, drawn straight across
   * the bands. Which pairs exist comes from the SHARED derivation the
   * Unstructured drill-down uses (`deriveCrossClusterEntityPairs`), fed the same
   * relatedness rule — one implementation, so the two views cannot disagree
   * about which clusters relate or how many links they get.
   */
  function renderCrossClusterRelations(opts: StructuredFocusRenderOptions) {
    relationGroup?.remove()
    relationGroup = null
    const entries = [...pinned.values()]
    if (entries.length < 2) return

    // Positions in the DETAIL LAYER's frame: each band's local point plus the
    // slot the band sits at, so a line can cross from one band to another.
    const slotOf = new Map<string, { x: number, y: number }>()
    const point = new Map<string, { x: number, y: number }>()
    entries.forEach((entry, index) => {
      const slot = {
        x: ANCHOR.x + PIN_X,
        y: ANCHOR.y + slotOffsetY(index, entries.length),
      }
      slotOf.set(entry.model.clusterId, slot)
      for (const item of entry.placed) {
        point.set(item.id, { x: slot.x + item.x, y: slot.y + item.y })
      }
    })

    const groups = entries.map(entry => ({
      clusterId: entry.model.clusterId,
      entityIds: entry.placed.filter(i => i.tier === 'leaf').map(i => i.id),
    }))
    const pairs = deriveCrossClusterEntityPairs(
      groups,
      clustersRelated,
      EXPANDED_CLUSTER.demo.crossLinksPerRegionPair,
    ).filter((pair: any) => point.has(pair.aEntityId) && point.has(pair.bEntityId))
    if (!pairs.length) return

    relationGroup ??= detailLayer.append('g').attr('class', 'structured-focus-relations')
    const defs = relationGroup.append('defs')
    const gradientId = 'structured-focus-relation-gradient'
    const xs = [...point.values()].map(p => p.x)
    appendUserSpaceLinkGradient(defs, gradientId, Math.min(...xs), Math.max(...xs))

    /*
     * ── SELECTED CLUSTER ↔ SELECTED CLUSTER ────────────────────────────────
     * Where two pinned clusters are DIRECTLY linked in the resolved data, that
     * real relationship is drawn between them at their new anchors. It is not a
     * new connection: the wheel's own line for it is hidden (below), because it
     * still points at the ring position the cluster has left. Nothing is drawn
     * for a pair that has no such edge — relatedness alone does not invent one.
     */
    const clusterPairs: Array<{ a: string, b: string }> = []
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i].model.clusterId
        const b = entries[j].model.clusterId
        if (clusterLinks.direct(a, b)) clusterPairs.push({ a, b })
      }
    }
    if (clusterPairs.length) {
      const clusterRadius = STRUCTURED_NODE_SIZES.cluster / 2
      renderStraightConnections(
        relationGroup ?? (relationGroup = detailLayer.append('g').attr('class', 'structured-focus-relations')),
        clusterPairs,
        (pair: any) => {
          const a = slotOf.get(pair.a)!
          const b = slotOf.get(pair.b)!
          const dx = b.x - a.x
          const dy = b.y - a.y
          const len = Math.hypot(dx, dy) || 1
          const trim = clusterRadius + F.line.endpointGap / cameraK
          return {
            x1: a.x + (dx / len) * trim,
            y1: a.y + (dy / len) * trim,
            x2: b.x - (dx / len) * trim,
            y2: b.y - (dy / len) * trim,
          }
        },
        {
          className: 'structured-focus-cluster-link',
          zoomScale: cameraK,
          widthFactor: F.line.widthFactor,
        },
      )
    }

    const radius = Math.max(F.leaf.radius, F.leaf.minVisualRadius / cameraK)
    const pad = F.line.endpointGap / cameraK
    renderStraightConnections(
      relationGroup,
      pairs,
      (pair: any) => {
        const a = point.get(pair.aEntityId)!
        const b = point.get(pair.bEntityId)!
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy) || 1
        return {
          x1: a.x + (dx / len) * (radius + pad),
          y1: a.y + (dy / len) * (radius + pad),
          x2: b.x - (dx / len) * (radius + pad),
          y2: b.y - (dy / len) * (radius + pad),
        }
      },
      {
        className: 'structured-focus-relation',
        zoomScale: cameraK,
        stroke: `url(#${gradientId})`,
        backgroundStroke: `url(#${gradientId})`,
        widthFactor: F.line.widthFactor,
        /*
         * DASHED once there are more than two selections — the shared
         * `entityRelation` pattern, so a derived entity↔entity relation looks
         * the same here as it does in the Unstructured drill-down. Geometry is
         * untouched: still one straight segment between two points.
         */
        ...(entries.length > D.dashRelationsAbove
          ? { strokeDasharray: EXPANDED_CLUSTER.entityRelation.strokeDasharray }
          : {}),
      },
    )
    if (entries.length > D.dashRelationsAbove) {
      relationGroup.selectAll('line')
        .attr('stroke-linecap', EXPANDED_CLUSTER.entityRelation.strokeLinecap)
    }
  }

  /**
   * Mark the SELECTED clusters, and leave the rest of the wheel alone.
   *
   * Nothing is dimmed: every cluster, ring, badge and connection keeps its
   * resting appearance, because the wheel is the navigation control and has to
   * stay readable while the detail area is open. A selection reads as a halo
   * behind the pinned node — the accent at `selection.opacity`, with a glow.
   */
  function applySelectionHighlight(opts: StructuredFocusRenderOptions) {
    const sel = F.selection
    const ids = new Set(pinned.keys())
    // Resting values, re-asserted so a previous selection or a hover pass can
    // never leave part of the wheel faded.
    /*
     * A pinned cluster's own mesh lines are HIDDEN. They were drawn between ring
     * positions, and the cluster has left one of them — so they now point at
     * empty space, which reads as a duplicate, wrong connection. The real
     * relationships are drawn at the new anchors instead (the chain, the
     * cross-cluster relations, and the cluster↔cluster links above). Every other
     * line in the wheel keeps its resting appearance.
     */
    const touchesPinned = (d: any) => ids.has(representativeId(d?.sourceNode))
      || ids.has(representativeId(d?.targetNode))
    fade(overviewConnsFg).style('opacity', (d: any) =>
      (touchesPinned(d) ? 0 : STRUCTURED_HOVER.connection.fgBase))
    fade(overviewConnsBg).style('opacity', (d: any) =>
      (touchesPinned(d) ? 0 : STRUCTURED_HOVER.connection.bgBase))

    /*
     * ── RELATIONSHIP-BASED FOCUS ──────────────────────────────────────────
     * While anything is selected, the wheel splits by the REAL relationship
     * data: a cluster with at least one relation to a selected cluster keeps
     * its normal active state; one with none drops to the disabled treatment —
     * dimmed node and logo, muted label, muted satellites — visible enough for
     * context but clearly secondary. `clustersRelated` is the same resolved
     * relatedness every other structured feature reads (direct link, shared
     * insight, shared origin, shared category), so "connected" here can never
     * disagree with the relations the drill-down draws.
     */
    const isPinned = (d: any) => ids.has(d?.id)
    const isClusterConnectedToSelectedCluster = (clusterId: string): boolean =>
      [...ids].some(selectedId =>
        selectedId !== clusterId && clustersRelated(selectedId, clusterId))
    const activeCluster = (d: any) =>
      isPinned(d) || isClusterConnectedToSelectedCluster(d?.id)
    const dim = F.selection.unrelated

    clusterGroups
      .classed('cluster--active-related', (d: any) => activeCluster(d))
      .classed('cluster--disabled-unrelated', (d: any) => !activeCluster(d))
    fade(clusterGroups).style('opacity', (d: any) =>
      (activeCluster(d) ? 1 : dim.nodeOpacity))
    fade(entityCounts).style('opacity', (d: any) =>
      (activeCluster(d) ? 1 : dim.satelliteOpacity))
    /*
     * The satellites travel with their cluster's state: full for the selected
     * and related clusters, muted for the unrelated ones. The selected
     * cluster's radial ring LABEL alone stays hidden — the band already
     * carries its category, and the radial one points off into the field.
     */
    fade(satellites).style('opacity', (d: any) =>
      (activeCluster(d) ? 1 : dim.satelliteOpacity))
    fade(ringLabels).style('opacity', (d: any) => (isPinned(d)
      ? 0
      : activeCluster(d) ? 1 : dim.labelOpacity))

    /*
     * ── THE SELECTED NODE STAYS ITSELF ─────────────────────────────────────
     * The pinned cluster keeps its OWN face: the same circle fill, stroke and
     * dash the ring drew, and — above all — its own Source/Document LOGO at its
     * normal opacity, upright through the pin's counter-rotation. A selection
     * used to repaint the node in the accent (hiding the icon), which read as
     * the node being REPLACED by a generic focus dot. What marks the selection
     * now is the selection LAYER's lift (a soft neutral glow on
     * `.structured-selection-layer`, set at creation) plus the expanded region
     * beside the node — the node itself is untouched.
     *
     * Everything is still re-asserted to the ring's resting values here, so a
     * canvas that once showed the old accent state (or a released selection)
     * can never keep a stray repaint.
     */
    void sel
    clusterGroups.select('circle.cluster-node')
      .attr('fill', CLUSTER_RING.fill)
      .attr('stroke', CLUSTER_RING.stroke)
      .attr('stroke-dasharray', CLUSTER_RING.strokeDasharray)
    clusterGroups.select('image.cluster-source-icon')
      .attr('opacity', CLUSTER_RING.sourceIcon.opacity)
    // The halo of the oldest design must not linger from an earlier render.
    viewportGroup.selectAll('circle.cluster-selection-halo').remove()
  }

  function restoreOverview(animate: boolean) {
    const restore = <S extends AnySelection>(sel: S) =>
      (animate ? sel.transition().duration(F.transitionMs) : sel) as any
    const restoreMotion = <S extends AnySelection>(sel: S) =>
      (animate ? sel.transition().duration(F.rotationMs) : sel) as any
    // Connections restore to their RESTING opacities (their base state is faint
    // by design — restoring to 1 would light the whole mesh).
    restore(overviewConnsFg).style('opacity', STRUCTURED_HOVER.connection.fgBase)
    restore(overviewConnsBg).style('opacity', STRUCTURED_HOVER.connection.bgBase)
    clusterGroups
      .classed('cluster--active-related', false)
      .classed('cluster--disabled-unrelated', false)
    restore(clusterGroups).style('opacity', 1)
    restore(satellites).style('opacity', 1)
    restore(ringLabels).style('opacity', 1)
    restore(entityCounts).style('opacity', 1)
    // Every cluster back to the ring's own styling — the accent fill, like the
    // pinning itself, belongs only to a live selection.
    clusterGroups.select('circle.cluster-node')
      .attr('fill', CLUSTER_RING.fill)
      .attr('stroke', CLUSTER_RING.stroke)
      .attr('stroke-dasharray', CLUSTER_RING.strokeDasharray)
    clusterGroups.select('image.cluster-source-icon').attr('opacity', CLUSTER_RING.sourceIcon.opacity)
    viewportGroup.selectAll('circle.cluster-selection-halo').remove()
    // The wheel unwinds to its resting orientation; the radial text (cluster
    // logos, ring labels, bridge badges, entity counts) unwinds in step.
    rotationDeg = 0
    restoreMotion(clusterGroups.select('image.cluster-source-icon')).attr('transform', 'rotate(0)')
    applyEntityCountOrientation(rotor as any, 0, animate ? F.rotationMs : 0)
    const unwind = restoreMotion(rotor).attr('transform', 'rotate(0)')
    if (animate && typeof unwind.on === 'function') {
      unwind.on('end', () => {
        applyClusterLabelOrientation(rotor as any, 0)
        applyBridgeBadgeOrientation(rotor as any, 0)
      })
    } else {
      applyClusterLabelOrientation(rotor as any, 0)
      applyBridgeBadgeOrientation(rotor as any, 0)
    }
  }

  /**
   * ── THE ROULETTE ─────────────────────────────────────────────────────────
   *
   * The WHEEL is what turns. `rotateBy` is bound by the caller to scroll and
   * drag on the canvas while the drill-down is open (where they replace zoom and
   * pan, which are switched off in this mode).
   *
   * PINNED CLUSTERS DO NOT MOVE: their elements were taken out of the rotor, so
   * the wheel turns around them. No transition here — this tracks the input
   * frame by frame — and the radial text is re-oriented on every step so nothing
   * ends up upside down mid-spin.
   */
  function rotateBy(deltaDeg: number) {
    rotationDeg += deltaDeg
    rotor.interrupt().attr('transform', `rotate(${rotationDeg})`)
    applyClusterLabelOrientation(rotor as any, rotationDeg)
    applyBridgeBadgeOrientation(rotor as any, rotationDeg)
    applyEntityCountOrientation(rotor as any, rotationDeg, 0)
    // Every logo still in the wheel counter-rotates, so the brand marks stay
    // upright through the spin instead of tumbling with the ring.
    rotor.selectAll('image.cluster-source-icon')
      .interrupt()
      .attr('transform', `rotate(${-rotationDeg})`)
  }

  function update(models: StructuredFocusModel[], opts: StructuredFocusRenderOptions) {
    cameraK = opts.cameraK
    isolatedLeafId = null

    // ── Released selections: the node goes home, the band goes away ────────
    const keep = new Set(models.map(m => m.clusterId))
    for (const [id, entry] of [...pinned.entries()]) {
      if (keep.has(id)) continue
      releaseNode(entry)
      entry.content.remove()
      pinned.delete(id)
    }

    if (!models.length) {
      relationGroup?.remove()
      relationGroup = null
      detailLayer.transition().duration(F.transitionMs).attr('opacity', 0)
        .on('end', () => detailLayer.style('display', 'none').style('pointer-events', 'none'))
      restoreOverview(true)
      return
    }

    detailLayer.style('display', null).style('pointer-events', 'auto')
    detailLayer.transition().duration(F.transitionMs).attr('opacity', 1)


    /*
     * ── EXTERNAL BIASES, BEFORE LAYOUT ────────────────────────────────────
     * Cross-cluster relation pairs are derived first (the SHARED derivation the
     * Unstructured drill-down uses), then turned into outer-annulus biases by
     * the SHARED bias builder — so an externally-connected entity packs on the
     * edge of its region FACING its partner's region, exactly as Unstructured
     * places it. Region centres are known before packing because they depend
     * only on band geometry and entity count, never on the packing itself.
     */
    const bandH = bandHeightFor(models.length)
    const maxByBand = Math.max((bandH - D.bandGap) / 2, 44)
    const maxByWidth = Math.max((ZONE.x1 - INSIGHT_X - 60) / 2, 44)
    const bandRadii = models.map(model =>
      Math.min(getRegionRadius(model.leaves.length), maxByBand, maxByWidth))
    // ONE placement decision, reused by the region centres, the band
    // transforms and the pins below — they can never disagree.
    const bandSlots = computeBandSlots(bandRadii)
    const slotOf = (index: number) => bandSlots[index] ?? { x: 0, y: slotOffsetY(index, models.length) }
    const regionCentreOf = new Map<string, { x: number, y: number }>()
    models.forEach((model, index) => {
      const r = bandRadii[index]
      const slot = slotOf(index)
      regionCentreOf.set(model.clusterId, {
        x: ANCHOR.x + PIN_X + slot.x + Math.max(ZONE.x1 - r - 12, INSIGHT_X + 60 + r),
        y: ANCHOR.y + slot.y,
      })
    })
    const pairGroups = models.map(model => ({
      clusterId: model.clusterId,
      entityIds: model.leaves.map(l => l.id),
    }))
    const crossPairs = models.length > 1
      ? deriveCrossClusterEntityPairs(pairGroups, clustersRelated, EXPANDED_CLUSTER.demo.crossLinksPerRegionPair)
      : []
    const biasesByCluster = new Map<string, Map<string, ExternalBias>>()
    for (const model of models) {
      const anchorPt = regionCentreOf.get(model.clusterId)!
      const targetsOf = new Map<string, { targets: Array<{ x: number, y: number }>, targetIds: string[] }>()
      for (const pair of crossPairs as any[]) {
        const ends = [
          { own: pair.aEntityId, ownCluster: pair.aClusterId, far: pair.bEntityId, farCluster: pair.bClusterId },
          { own: pair.bEntityId, ownCluster: pair.bClusterId, far: pair.aEntityId, farCluster: pair.aClusterId },
        ]
        for (const end of ends) {
          if (end.ownCluster !== model.clusterId) continue
          const farCentre = regionCentreOf.get(end.farCluster)
          if (!farCentre) continue
          const entryT = targetsOf.get(end.own) ?? { targets: [], targetIds: [] }
          entryT.targets.push(farCentre)
          entryT.targetIds.push(end.far)
          targetsOf.set(end.own, entryT)
        }
      }
      biasesByCluster.set(model.clusterId, deriveExternalBiases(
        [...targetsOf.entries()].map(([id, t]) => ({ id, targets: t.targets, targetIds: t.targetIds })),
        anchorPt,
      ))
    }

    /*
     * Every band is rebuilt on every update, because the band HEIGHT depends on
     * how many clusters are selected — adding a second selection re-flows the
     * first one's field into half the area. The content is a pure function of
     * (model, band, cameraK), so a band whose inputs did not change is redrawn
     * identically; its group, and therefore its place on screen, is untouched.
     */
    models.forEach((model, index) => {
      let entry = pinned.get(model.clusterId)
      if (!entry) {
        entry = {
          model,
          content: detailLayer.append('g')
            .attr('class', 'structured-focus-content')
            .attr('data-cluster-id', model.clusterId)
            .attr('opacity', 0),
          placed: [],
          region: null,
          biases: new Map(),
          node: null,
          wrapper: null,
          moved: [],
          ringX: 0,
          ringY: 0,
          marks: null,
        }
        entry.content.transition('fade').duration(F.transitionMs).attr('opacity', 1)
        pinned.set(model.clusterId, entry)
      }
      entry.model = model
      const slot = slotOf(index)
      const slotY = ANCHOR.y + slot.y
      const slotX = ANCHOR.x + PIN_X + slot.x
      /*
       * ⚠️ NAMED, for the same reason the pinned node's move is: the band fades
       * in and slides to its slot in the same pass, and two UNNAMED transitions
       * on one element cancel each other — the slot move was killing the
       * fade-in, leaving every band drawn at opacity 0.
       */
      entry.content.transition('slot').duration(F.transitionMs)
        .attr('transform', `translate(${slotX}, ${slotY})`)
      // The band's own origin — the frame `clusterOffset` is measured in.
      entry.bandX = slotX
      entry.bandY = slotY
      entry.biases = biasesByCluster.get(model.clusterId) ?? new Map()
      const band = layoutDetail(
        model,
        bandHeightFor(models.length),
        id => entry!.biases.get(id) ?? null,
      )
      entry.placed = band.placed
      entry.region = band.region
      buildContent(entry, opts)
      // ANCHOR, not ANCHOR + PIN_X: the cluster stays on the ring's rim.
      pinNode(entry, ANCHOR.x, slotY)
    })

    renderCrossClusterRelations(opts)
    applySelectionHighlight(opts)
  }

  /**
   * Re-apply the constant-screen sizes for a new camera scale. Called from the
   * zoom handler: the layers are inside the camera, so type, mark radii, gaps
   * and stroke widths would otherwise grow and shrink with the graph.
   */
  function rescale(k: number) {
    if (!k) return
    cameraK = k
    for (const entry of pinned.values()) applyGeometry(entry)
  }

  function destroy(animate: boolean) {
    isolatedLeafId = null
    for (const entry of pinned.values()) releaseNode(entry)
    pinned.clear()
    relationGroup = null
    restoreOverview(animate)
    if (animate) {
      detailLayer.transition().duration(F.transitionMs).attr('opacity', 0).remove()
    } else {
      detailLayer.interrupt()
      detailLayer.remove()
    }
    selectionLayer.remove()
  }

  return { update, rescale, rotateBy, destroy }
}
