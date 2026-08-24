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
export function computeFocusCamera(directionsDeg: number[] = []): d3.ZoomTransform {
  /*
   * SCALE IN PLACE, SHIFTED AWAY FROM THE SELECTIONS. The base is the same
   * centred form the Structured overview camera uses with the scale backed
   * off by `shrinkFactor` — the ring shrinks where it stands. On top of that,
   * `directionsDeg` (the open selections' displayed spoke angles) slides the
   * whole graph a bounded step in the OPPOSITE mean direction: a cluster
   * clicked in the upper half pushes the ring down, so its expanded region
   * opens into the freed upper space — a clean two-zone composition. Opposite
   * selections cancel toward no shift; the caller animates the move.
   */
  const overviewK = Math.min(V.dataWidth, V.dataHeight)
    / (2 * (V.outerRadius + V.fitPadding))
  let dx = 0
  let dy = 0
  if (directionsDeg.length) {
    let sx = 0
    let sy = 0
    for (const deg of directionsDeg) {
      sx += Math.cos((deg * Math.PI) / 180)
      sy += Math.sin((deg * Math.PI) / 180)
    }
    const mean = Math.hypot(sx, sy) / directionsDeg.length
    if (mean > 1e-3) {
      const len = Math.hypot(sx, sy)
      dx = -(sx / len) * D.adaptiveShift * mean
      dy = -(sy / len) * D.adaptiveShift * mean
    }
  }
  return d3.zoomIdentity
    .translate(V.dataWidth / 2 + dx, V.dataHeight / 2 + dy)
    .scale(overviewK * D.shrinkFactor)
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
 * Lay ONE selection out along its own RAY.
 *
 * The band's origin is the selected cluster's position on the ring (the node
 * itself never moves), and everything the drill-down adds extends OUTWARD
 * along the cluster's displayed spoke direction: insights on the ray, then the
 * expanded region circle just past the wheel's outer extent. With several
 * clusters open, each takes its own spoke — the regions distribute around the
 * canvas by the geometry of the selections themselves, and the radial graph
 * never moves.
 *
 * Entity placement inside the region is the SHARED `packEntities`
 * (useDrilldownModel) — same collision, containment, chip reservation and
 * outer-annulus bias as the Unstructured drill-down. Band coordinates stay
 * UNROTATED (only positions lie on the ray), so entity labels remain
 * horizontal at every spoke angle.
 *
 * `regionDist` — the region CENTRE's distance from the graph origin — is
 * decided by the caller (it de-collides multiple regions there), so this
 * function only converts it into the band's local frame.
 */
function layoutDetail(
  model: StructuredFocusModel,
  regionLocal: { x: number, y: number, r: number },
  biasFor: (id: string) => ExternalBias | null,
): BandLayout {
  /*
   * The region's centre arrives PRE-PLACED (update() runs the overlap/viewport
   * candidate search over every open selection at once — placement cannot be
   * decided per band without seeing the others). This function only packs the
   * entities inside the circle it is given.
   */
  const region = { x: regionLocal.x, y: regionLocal.y, r: regionLocal.r }

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
    region.r,
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

  /*
   * NO insight items. The wheel's own insight-ring nodes are the single source
   * of truth — the focus never duplicates them; the chain resolves their LIVE
   * ring positions at draw time (see insightRingLocal in the controller).
   */
  return { placed: leaves, region }
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
  /** The wheel's current rotation (deg) — displayed angle = ring angle + this. */
  currentRotationDeg: () => number
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
  /** The last render options — rotateBy re-anchors the relations with them. */
  let lastOpts: StructuredFocusRenderOptions | null = null

  /**
   * The LIVE band-local position of one of the wheel's own insight nodes.
   *
   * The insight ring lives in the rotor, so its displayed position is the
   * node's ring coordinates turned by the current roulette rotation; the band
   * is anchored on its cluster's displayed position, so the difference is the
   * local point the chain lines aim at. Resolved at DRAW time — applyGeometry
   * runs on every rotation step — so the lines follow the real nodes through
   * the roulette. Radius from the drawn node itself, so line trimming can
   * never disagree with what is actually on screen.
   */
  function insightRingLocal(
    entry: PinnedCluster,
    insightId: string,
  ): { x: number, y: number, r: number } | null {
    const node = viewportGroup.selectAll<SVGCircleElement, any>('circle.insight-node')
      .filter((d: any) => d?.id === insightId)
    if (node.empty()) return null
    const d: any = node.datum()
    const rad = (rotationDeg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const x = (d.x ?? 0) * cos - (d.y ?? 0) * sin
    const y = (d.x ?? 0) * sin + (d.y ?? 0) * cos
    return {
      x: x - (entry.bandX ?? 0),
      y: y - (entry.bandY ?? 0),
      r: Number(node.attr('r')) || INSIGHT_RING.nodeRadius,
    }
  }

  /**
   * The RESTING opacity of ONE entity label at the current camera scale.
   * Below the reveal threshold every label is hidden (dots only — hover shows
   * one name at a time). Past the threshold, only entities that carry a REAL
   * Entity↔Entity relationship (`labelled` — set from the shared cross-region
   * pair derivation) reveal their names: the label explains a relationship
   * line, and an unrelated entity stays a dot at every zoom. One rule, read
   * by the initial draw, the hover handlers, the isolation clear and every
   * zoom rescale, so they can never disagree.
   */
  function restingLabelOpacityOf(d: { labelled?: boolean }): number {
    return cameraK >= F.selection.entityLabelZoomThreshold && d?.labelled
      ? EXPANDED_CLUSTER.entityLabel.persistentOpacity
      : 0
  }

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

    /*
   * ⚠️ NOTHING IS PINNED OUT OF THE RING ANY MORE. The selected cluster's
   * node, logo, badge and bridge all stay exactly where the wheel drew them —
   * the band ANCHORS ON the cluster's displayed position instead of moving
   * the cluster to the band. `releaseNode` survives only to unwind state from
   * older sessions' moved units (entry.moved is always empty now).
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
      /*
       * INSIGHTS are never drawn by the focus: an insight id resolves to the
       * wheel's ORIGINAL insight-ring node, at its live displayed position —
       * one insight layer, one source of truth.
       */
      const ring = insightRingLocal(entry, id)
      if (ring) return ring
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

    /*
     * Side-aware labels, the Unstructured convention: the name sits on the
     * entity's OUTWARD side of its region (start-anchored right of centre,
     * end-anchored left), so labels point out of the dense disc instead of
     * colliding across it.
     */
    const regionX = entry.region?.x ?? 0
    const side = (d: any) => (d.x >= regionX ? 1 : -1)
    marks.labels
      .attr('opacity', (d: any) => restingLabelOpacityOf(d))
      .attr('font-size', fontSize)
      .attr('x', (d: any) => d.x + side(d) * (leafR + eLabel.offsetX / cameraK))
      .attr('y', (d: any) => d.y)
      .attr('text-anchor', (d: any) => (side(d) > 0 ? 'start' : 'end'))

    // The chip: leading dot pinned to the region centre, constant-screen and
    // drawn at the compact Structured scale (see `selection.chipScale`).
    marks.chip?.attr('transform',
      `translate(${entry.region?.x ?? 0}, ${entry.region?.y ?? 0}) scale(${F.selection.chipScale / cameraK})`)

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
        // Labels return to the RESTING rule: dots-only below the zoom
        // threshold, all-on above it.
        marks.labels.attr('opacity', (d: any) => restingLabelOpacityOf(d))
        chainFg.attr('opacity', LINK_STYLING.opacity.base)
        chainBg.attr('opacity', LINK_BACKGROUND_OPACITY)
        chainEnds.attr('opacity', LINK_STYLING.endpoints.opacity)
        continue
      }

      marks.leafDots
        .attr('opacity', (d: any) => (d.id === isolatedLeafId ? 0 : active.has(d.id) ? 1 : F.leaf.dimOpacity))
        .style('pointer-events', (d: any) => (active.has(d.id) && d.id !== isolatedLeafId ? 'auto' : 'none'))
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
    // The RING's insights, by id — never placed items (the focus places none).
    const insights = model.insights
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
    // The luminous ramp spans this band's own reach: from the cluster at the
    // origin out past the region's far edge, whichever direction that is.
    const rampFrom = Math.min(0, region.x - region.r)
    const rampTo = Math.max(0, region.x + region.r)
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
    /*
     * ONE LINE PER RELATIONSHIP — and the region gets exactly ONE attachment:
     * its own cluster. Neither insight leg is drawn by the focus layer any
     * more: cluster↔insight already exists in the base mesh (lifted to the
     * active emphasis by the selection pass), and an insight→region connector
     * restated that same relationship a second way — a duplicate by another
     * route. Insights stay visible on the ring, their base lines light up,
     * and the region hangs off its cluster; the only other focus lines are
     * the Entity↔Entity relations, which exist nowhere else.
     */
    const chainLinks = [{ fromId: '__cluster__', toId: '__region__', tier: 'leaf' as const }]

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

    /*
     * NO insight marks here. The chain above already points at the wheel's own
     * insight-ring nodes (see insightRingLocal) — drawing a second set was the
     * duplication this layer must never produce. Size, yellow styling, glow,
     * hover and tooltip all belong to the one original node.
     */

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
        // DOTS BY DEFAULT: only the hovered entity shows its name (unless the
        // zoom threshold already has every label on — then hover changes
        // nothing about the others).
        entry.marks?.labels.attr('opacity', (d: any) => (d.id === hovered.id
          ? EXPANDED_CLUSTER.entityLabel.opacity
          : restingLabelOpacityOf(d)))
      })
      .on('mouseleave', () => {
        if (isolatedLeafId) return
        leafDots.attr('opacity', F.leaf.opacity)
        entry.marks?.labels.attr('opacity', (d: any) => restingLabelOpacityOf(d))
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
      .attr('opacity', (d: any) => restingLabelOpacityOf(d))
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
    // band's own anchor (its cluster's displayed ring position), so a line can
    // cross from one band to another.
    const slotOf = new Map<string, { x: number, y: number }>()
    const point = new Map<string, { x: number, y: number }>()
    entries.forEach((entry) => {
      const slot = { x: entry.bandX ?? 0, y: entry.bandY ?? 0 }
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
        /*
         * ALWAYS dashed — the shared `entityRelation` pattern (round dots),
         * exactly as the Unstructured drill-down draws the same relationship:
         * a cross-cluster Entity↔Entity relation is DERIVED, so it must never
         * borrow the solid language of ingested structure. Straight
         * single-segment geometry unchanged.
         */
        strokeDasharray: EXPANDED_CLUSTER.entityRelation.strokeDasharray,
      },
    )
    relationGroup.selectAll('line')
      .attr('stroke-linecap', EXPANDED_CLUSTER.entityRelation.strokeLinecap)
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
    /*
     * The selected cluster's REAL relationships stay READABLE: every drawn
     * mesh line with a selected cluster at either representative end — its
     * cluster↔cluster bridges and its cluster↔insight links — lifts to the
     * hover-active emphasis instead of resting at the faint mesh level, so
     * entering focus never hides what the cluster is actually connected to.
     * Every other line keeps the resting look. (Nothing is ever removed.)
     */
    const touchesSelected = (d: any) => ids.has(representativeId(d?.sourceNode))
      || ids.has(representativeId(d?.targetNode))
    // Relevant lines brighten; unrelated ones step DOWN from the resting mesh
    // to the hover module's own hidden tier — reduced, never removed.
    fade(overviewConnsFg).style('opacity', (d: any) => (touchesSelected(d)
      ? STRUCTURED_HOVER.connection.fgActive
      : STRUCTURED_HOVER.connection.fgHidden))
    fade(overviewConnsBg).style('opacity', (d: any) => (touchesSelected(d)
      ? STRUCTURED_HOVER.connection.bgActive
      : STRUCTURED_HOVER.connection.bgHidden))

    /*
     * ── EMPHASIS, NOT REMOVAL ─────────────────────────────────────────────
     * Selecting a cluster EMPHASIZES its network and hides nothing: every
     * cluster, hub, insight, badge and label stays at its normal overview
     * state (opacity 1 across the board — re-asserted here so no earlier
     * treatment can linger). On top of that resting picture:
     *
     *   · the CLICKED cluster carries the strongest state — the full two-stop
     *     neutral glow;
     *   · clusters and insights DIRECTLY CONNECTED to it (from the same
     *     resolved relationship data everything else reads) carry a softer
     *     single-stop glow;
     *   · the connection lines touching the selection are already lifted to
     *     the hover-active opacity above.
     *
     * `clustersRelated` is the shared relatedness rule (direct link, shared
     * insight, shared origin, shared category), so "connected" here can never
     * disagree with the relations the drill-down draws.
     */
    const isPinned = (d: any) => ids.has(d?.id)
    const isClusterConnectedToSelectedCluster = (clusterId: string): boolean =>
      [...ids].some(selectedId =>
        selectedId !== clusterId && clustersRelated(selectedId, clusterId))
    const relatedCluster = (d: any) =>
      !isPinned(d) && isClusterConnectedToSelectedCluster(d?.id)

    /** Insights DIRECTLY connected to any selected cluster, from the models. */
    const relatedInsightIds = new Set<string>()
    for (const entry of pinned.values()) {
      for (const ins of entry.model.insights) relatedInsightIds.add(ins.id)
    }

    const FULL_GLOW = 'drop-shadow(0 0 8px rgba(var(--v-theme-button-white-20)))'
      + ' drop-shadow(0 0 18px rgba(var(--v-theme-button-white-10)))'
    /** The related tier: one soft stop — highlighted, clearly below selected. */
    const SOFT_GLOW = 'drop-shadow(0 0 7px rgba(var(--v-theme-button-white-10)))'

    clusterGroups
      .classed('cluster--active-related', (d: any) => isPinned(d) || relatedCluster(d))
      .classed('cluster--disabled-unrelated', false)
      .style('filter', (d: any) => (isPinned(d)
        ? FULL_GLOW
        : relatedCluster(d) ? SOFT_GLOW : null))
    /*
     * Unrelated content SOFTENS to `unrelatedOpacity` (~55%) — visible, in
     * place, clearly secondary; the selection and its network hold 100%.
     * Positions never change and nothing is removed.
     */
    const soft = F.selection.unrelatedOpacity
    const activeCluster = (d: any) => isPinned(d) || relatedCluster(d)
    fade(clusterGroups).style('opacity', (d: any) => (activeCluster(d) ? 1 : soft))
    fade(entityCounts).style('opacity', (d: any) => (activeCluster(d) ? 1 : soft))
    fade(satellites).style('opacity', (d: any) => (activeCluster(d) ? 1 : soft))
    /*
     * The SELECTED cluster's own radial label hides while it is open — its
     * chain and region occupy that ray, and the region already carries the
     * category — while the node itself, its logo and its badge stay exactly
     * as they are. Related labels hold 100%, unrelated soften.
     */
    fade(ringLabels).style('opacity', (d: any) => (isPinned(d)
      ? 0
      : activeCluster(d) ? 1 : soft))

    // INSIGHTS, on the wheel's own nodes — original positions, never
    // duplicated: connected ones glow at 100%, unrelated ones soften like the
    // unrelated clusters.
    const insightSel = viewportGroup.selectAll<SVGCircleElement, any>('circle.insight-node')
    insightSel.style('filter', (d: any) => (relatedInsightIds.has(d?.id) ? SOFT_GLOW : null))
    fade(insightSel).style('opacity', (d: any) => (relatedInsightIds.has(d?.id) ? 1 : soft))

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
      .style('filter', null)
    restore(viewportGroup.selectAll('circle.insight-node')).style('opacity', 1)
    viewportGroup.selectAll('circle.insight-node').style('filter', null)
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
    /*
     * Open bands RIDE their clusters: each is anchored on its cluster's
     * displayed ring position, so turning the wheel carries the whole band —
     * region, entities, chain — with the node it belongs to. Content is
     * band-local, so only the anchor transform moves (labels stay horizontal);
     * the cross-band relation lines re-anchor from the new positions.
     */
    for (const entry of pinned.values()) {
      const rad = ((entry.model.clusterAngleDeg + rotationDeg) * Math.PI) / 180
      const x = Math.cos(rad) * STRUCTURED_RINGS.cluster
      const y = Math.sin(rad) * STRUCTURED_RINGS.cluster
      /*
       * The REGION GROUP holds its ground while the wheel turns: regions are
       * packed as one cohesive group in the viewport frame, so when a band's
       * anchor (its cluster's displayed position) rotates, every band-local
       * coordinate is COUNTER-TRANSLATED by the anchor's movement — absolute
       * region and entity positions stay fixed, and only the cluster node plus
       * its attachment line follow the roulette.
       */
      const shiftX = (entry.bandX ?? x) - x
      const shiftY = (entry.bandY ?? y) - y
      entry.bandX = x
      entry.bandY = y
      entry.content.interrupt('slot').attr('transform', `translate(${x}, ${y})`)
      for (const item of entry.placed) {
        item.x += shiftX
        item.y += shiftY
      }
      if (entry.region) {
        entry.region.x += shiftX
        entry.region.y += shiftY
        entry.content.selectAll('circle.expanded-region-glass, circle.expanded-region-circle')
          .attr('cx', entry.region.x)
          .attr('cy', entry.region.y)
      }
      applyGeometry(entry)
    }
    if (pinned.size > 1 && lastOpts) renderCrossClusterRelations(lastOpts)
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
     * ── GEOMETRY FIRST: one COMPACT GROUP of regions ──────────────────────
     *
     * Open regions no longer scatter to their clusters' own spokes: clusters
     * opened from opposite sides of the wheel used to put their circles at
     * opposite corners of the canvas. Instead every open region PACKS into one
     * cohesive group in the detail area:
     *
     *   · the GROUP ANCHOR sits on the mean direction of the open selections,
     *     just past the wheel's outer extent — the same side the adaptive
     *     camera frees up;
     *   · the first region sits on the anchor; each next one (click order, so
     *     earlier regions never move… within one update) takes the candidate
     *     position touching an already-placed circle (radius + radius +
     *     `regionGap`) that is nearest the group anchor, visited in a fixed
     *     angular order — a deterministic greedy disc packing;
     *   · a candidate is rejected if it enters the WHEEL's bubble (the ring
     *     plus its labels) or leaves the viewport at the focus camera, so the
     *     group hugs the graph without covering it.
     *
     * Opening another cluster re-runs the packing over the whole set, so the
     * group re-forms cohesively rather than accreting outward forever.
     */
    const dirDegOf = new Map<string, number>()
    const radiusOfModel = new Map<string, number>()
    const regionCentreOf = new Map<string, { x: number, y: number }>()
    models.forEach((model) => {
      dirDegOf.set(model.clusterId, model.clusterAngleDeg + rotationDeg)
      radiusOfModel.set(model.clusterId, Math.min(
        getRegionRadius(model.leaves.length) * D.regionScale, D.maxRegionRadius))
    })
    const cam = computeFocusCamera(models.map(m => m.clusterAngleDeg + rotationDeg))
    const fitsViewport = (c: { x: number, y: number }, r: number) => {
      const sx = c.x * cam.k + cam.x
      const sy = c.y * cam.k + cam.y
      const margin = r * cam.k + 8
      return sx >= margin && sx <= V.dataWidth - margin
        && sy >= margin && sy <= V.dataHeight - margin
    }
    /** The wheel's occupied disc — regions must stay clear of it. */
    const wheelClear = (c: { x: number, y: number }, r: number) =>
      Math.hypot(c.x, c.y) >= V.outerRadius + D.regionClearance * 0.5 + r
    const placedRegions: Array<{ x: number, y: number, r: number }> = []
    const clearOfPlaced = (c: { x: number, y: number }, r: number) =>
      placedRegions.every(o => Math.hypot(c.x - o.x, c.y - o.y) >= r + o.r + D.regionGap)

    // The group anchor: mean selection direction (falls back to East when the
    // directions cancel), just past the wheel plus the LARGEST open radius.
    let mx = 0
    let my = 0
    for (const model of models) {
      const rad = ((dirDegOf.get(model.clusterId) ?? 0) * Math.PI) / 180
      mx += Math.cos(rad)
      my += Math.sin(rad)
    }
    const meanLen = Math.hypot(mx, my)
    const anchorDir = meanLen > 1e-3 ? { x: mx / meanLen, y: my / meanLen } : { x: 1, y: 0 }
    const maxR = Math.max(...models.map(m => radiusOfModel.get(m.clusterId)!))
    const anchorDist = V.outerRadius + D.regionClearance + maxR
    const groupAnchor = { x: anchorDir.x * anchorDist, y: anchorDir.y * anchorDist }

    models.forEach((model, index) => {
      const r = radiusOfModel.get(model.clusterId)!
      let chosen: { x: number, y: number } | null = null
      if (index === 0) {
        // The first region takes the anchor itself, nudged outward only if the
        // wheel bubble or viewport demand it.
        for (const extra of [0, 30, 60, 90, 120, 160]) {
          const c = {
            x: anchorDir.x * (anchorDist + extra),
            y: anchorDir.y * (anchorDist + extra),
          }
          if (wheelClear(c, r) && fitsViewport(c, r)) { chosen = c; break }
        }
        chosen ??= groupAnchor
      } else {
        /*
         * Greedy packing: candidates touch each already-placed circle at fixed
         * 15° steps; the survivor nearest the GROUP ANCHOR wins — which is what
         * pulls the group together instead of stringing it out.
         */
        let best: { c: { x: number, y: number }, cost: number } | null = null
        for (const placedR of placedRegions) {
          for (let deg = 0; deg < 360; deg += 15) {
            const rad = (deg * Math.PI) / 180
            const dist = placedR.r + r + D.regionGap + 1
            const c = {
              x: placedR.x + Math.cos(rad) * dist,
              y: placedR.y + Math.sin(rad) * dist,
            }
            if (!clearOfPlaced(c, r) || !wheelClear(c, r) || !fitsViewport(c, r)) continue
            const cost = Math.hypot(c.x - groupAnchor.x, c.y - groupAnchor.y)
            if (!best || cost < best.cost - 1e-6) best = { c, cost }
          }
        }
        // No candidate satisfied everything: relax the viewport (never the
        // overlap or the wheel), preferring nearness to the anchor.
        if (!best) {
          for (const placedR of placedRegions) {
            for (let deg = 0; deg < 360; deg += 15) {
              const rad = (deg * Math.PI) / 180
              const dist = placedR.r + r + D.regionGap + 1
              const c = {
                x: placedR.x + Math.cos(rad) * dist,
                y: placedR.y + Math.sin(rad) * dist,
              }
              if (!clearOfPlaced(c, r) || !wheelClear(c, r)) continue
              const cost = Math.hypot(c.x - groupAnchor.x, c.y - groupAnchor.y)
              if (!best || cost < best.cost - 1e-6) best = { c, cost }
            }
          }
        }
        chosen = best?.c ?? {
          x: groupAnchor.x + index * (2 * r + D.regionGap),
          y: groupAnchor.y,
        }
      }
      placedRegions.push({ ...chosen, r })
      regionCentreOf.set(model.clusterId, chosen)
    })

    /** A band's origin: its cluster's displayed position on the ring. */
    const bandAnchorOf = (clusterId: string) => {
      const rad = ((dirDegOf.get(clusterId) ?? 0) * Math.PI) / 180
      return {
        x: Math.cos(rad) * STRUCTURED_RINGS.cluster,
        y: Math.sin(rad) * STRUCTURED_RINGS.cluster,
      }
    }

    /*
     * ── EXTERNAL BIASES, BEFORE LAYOUT ────────────────────────────────────
     * Cross-cluster relation pairs first (the SHARED derivation the
     * Unstructured drill-down uses), then the SHARED bias builder — so an
     * externally-connected entity packs on the edge of its region FACING its
     * partner's region, exactly as Unstructured places it.
     */
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
     * Every band is rebuilt on every update. The content is a pure function of
     * (model, ray, cameraK), so a band whose inputs did not change is redrawn
     * identically; its group, and therefore its place on screen, is untouched.
     */
    models.forEach((model) => {
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
      const anchor = bandAnchorOf(model.clusterId)
      /*
       * ⚠️ NAMED: the band fades in and takes its anchor in the same pass, and
       * two UNNAMED transitions on one element cancel each other.
       */
      entry.content.transition('slot').duration(F.transitionMs)
        .attr('transform', `translate(${anchor.x}, ${anchor.y})`)
      entry.bandX = anchor.x
      entry.bandY = anchor.y
      entry.biases = biasesByCluster.get(model.clusterId) ?? new Map()
      const regionAbs = regionCentreOf.get(model.clusterId)!
      const band = layoutDetail(
        model,
        {
          x: regionAbs.x - anchor.x,
          y: regionAbs.y - anchor.y,
          r: radiusOfModel.get(model.clusterId)!,
        },
        id => entry!.biases.get(id) ?? null,
      )
      entry.placed = band.placed
      entry.region = band.region
      buildContent(entry, opts)
    })

    lastOpts = opts
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

  return { update, rescale, rotateBy, currentRotationDeg: () => rotationDeg, destroy }
}
