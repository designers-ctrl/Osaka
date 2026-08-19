/**
 * src/components/graphs/structured/structuredFocus.ts
 *
 * Structured Cluster FOCUS (drill-down): clicking a cluster in Structured mode
 * expands it in place, keeping the radial graph as dimmed context, into
 *
 *   selected Cluster → related Insights → related Entities
 *   selected Cluster → related Entities            (no intermediate Insight)
 *
 * MULTIPLE clusters can be expanded at once (up to `STRUCTURED_FOCUS.maxOpen`).
 * Opening one never closes another; clicking an expanded cluster closes just
 * that one. Every open cluster keeps its own insights, entities, connections and
 * hover behaviour, and all of them stay interactive simultaneously.
 *
 * ── HOW ONE LAYOUT SERVES BOTH ONE AND MANY ────────────────────────────────
 *
 * The single-cluster focus rotates the whole ring so the clicked cluster lands
 * horizontally on the focus side, and draws its columns to the right. That
 * mechanic can only ever serve ONE cluster — you cannot rotate three clusters to
 * the same angle at once. Rather than build a second layout for the multi case,
 * note what the single case actually is:
 *
 *   the columns are a fan pointing radially OUTWARD from the cluster, seen from
 *   a cluster that has been rotated to angle 0.
 *
 * So every open cluster's fan is drawn in ITS OWN frame —
 * `rotate(clusterAngle)` inside the rotor — with the model's local coordinates
 * (root at `(rootX, 0)`, columns extending along +x) completely unchanged. For
 * the cluster the rotor turns to the focus side the two rotations cancel and the
 * fan renders exactly where the single-cluster focus always put it, pixel for
 * pixel; every other open cluster's fan points outward along its own radius,
 * attached to its own node, riding the ring when it turns.
 *
 * The rotor still rotates — driven by the MOST RECENTLY clicked cluster, which
 * is the one the user is looking at, so it gets the horizontal read and the open
 * canvas. Earlier-opened fans keep their geometry untouched when a new one opens
 * (see `assignFanOffset`: the newcomer yields, never the incumbents).
 *
 * Architecture:
 * - the radial overview never moves in data space: the camera shift/zoom is pure
 *   CAMERA — the caller animates the shared zoom transform to
 *   `computeFocusCamera(models)`, so wheel/pan keep working;
 * - relationships come from the SAME resolved connection set every other
 *   Structured feature reads (the RadialConnection data on the drawn
 *   `.link-foreground` paths), normalized through the hover module's
 *   representative-id rules. A fan shows ONLY Insights and that cluster's own
 *   member ENTITIES — never another cluster node;
 * - while anything is focused the overview's connection MESH is hidden (not
 *   merely dimmed) and unopened radial content dims; each open cluster's node,
 *   entity layer and bridge stay at full opacity;
 * - the open set is a keyed d3 join on cluster id, so opening or closing one fan
 *   animates only that fan and leaves the rest alone;
 * - everything is restored exactly when the last one closes.
 *
 * All connections in the focus layout are straight `<line>`s.
 */

import * as d3 from 'd3'
import {
  STRUCTURED_FOCUS,
  STRUCTURED_HOVER,
  STRUCTURED_NODE_SIZES,
  STRUCTURED_VIEWPORT,
  INSIGHT_RING,
} from './structuredTokens'
import { getLinkStrokeWidth, LINK_GRADIENT, LINK_STYLING } from '../graphTokens'
import {
  appendUserSpaceLinkGradient,
  renderStraightConnections,
  LINK_BACKGROUND_OPACITY,
} from '../linkRenderer'
import { EXPANDED_CLUSTER } from '../expanded/expandedTokens'
import { deriveCrossClusterEntityPairs } from '../expanded/crossClusterRelations'
import { applyClusterLabelOrientation } from './components/renderClusterRing'
import { applyEntityCountOrientation } from './components/renderEntityRing'
import { applyBridgeBadgeOrientation } from './components/renderClusterEntityBridge'
import type { RadialConnection } from './useStructuredGeometry'
import { hasVisibleEndpoints, representativeId } from './structuredHover'
import { getResolvedConnections } from './structuredConnections'
import { syntheticNameFor } from '../expanded/demoEntities'

type ViewportSelection = d3.Selection<SVGGElement, unknown, any, unknown>

interface FocusItem {
  id: string
  label: string
  /** Column x, in data units (column gaps scale with the ring). */
  x: number
  /**
   * The row's CENTRED index within its column (…, -1, 0, 1, …). Not a y: the
   * pitch that turns it into one is resolved at render time, because it depends
   * on the camera scale AND on the direction the fan points on screen — see
   * `rowPitchFor` in buildFan.
   */
  rowOffset: number
}

export interface StructuredFocusModel {
  clusterId: string
  /** The cluster's own ring angle (degrees) — the direction its fan points. */
  clusterAngleDeg: number
  /**
   * Degrees the whole radial graph must rotate so this cluster lands on the
   * focus side. Signed and taken the SHORT way round, so the spin never goes
   * the long way for a cluster just past the focus angle. Only the most
   * recently opened cluster's value is used.
   */
  rotationDeg: number
  rootLabel: string
  root: { x: number, y: number }
  insights: FocusItem[]
  /** The selected cluster's own member entities — the outer column. */
  leaves: FocusItem[]
  /** Straight segments between item ids (fromId may be the cluster itself). */
  links: Array<{ fromId: string, toId: string, tier: 'insight' | 'leaf' }>
  /**
   * Extent of the focus CONTENT only (not the radial ring) — the camera uses it
   * to guarantee the columns fit, never to fit the whole scene.
   */
  bounds: {
    /** Local x of the far edge of the last column's labels (data units). */
    contentXMax: number
  }
}

/** `ins-deal-velocity` → `Deal velocity` — insights carry no label field. */
function humanizeInsightId(id: string): string {
  const words = id.replace(/^ins-/, '').split('-').filter(Boolean)
  const text = words.join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Derive the focus model for a cluster from the LIVE resolved connection set
 * (the resolved set published by the renderer — NOT the drawn paths, which are
 * deliberately filtered down to the meaningful ones; a cluster's members live
 * in exactly the self-links the mesh does not draw).
 * Returns null when the id has no rendered cluster group.
 *
 * The model is expressed in the cluster's OWN fan frame: the cluster sits at
 * `(rootX, 0)` and the columns extend along +x, whatever the cluster's actual
 * ring angle. The renderer rotates the frame into place.
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
      }
    }
  }

  // ── Rotation: bring THIS cluster to the focus side ───────────────────────
  // The cluster keeps its ring angle in data space; the rotor turns instead,
  // so the node the user clicked is the very same element, still attached to
  // its ring, just carried round to the focus side. (`clusterDatum` is the
  // group's datum already captured above.)
  const f = STRUCTURED_FOCUS
  const clusterAngleDeg = ((clusterDatum?.angle || 0) * 180) / Math.PI
  // Shortest signed turn from the cluster's angle to the focus angle.
  const rawTurn = f.focusAngleDeg - clusterAngleDeg
  const rotationDeg = ((rawTurn % 360) + 540) % 360 - 180

  // ── Fan layout, root → outward, columns centred on the fan's axis ─────────
  const rootX = f.rootX
  const hasInsights = insightIds.size > 0
  const insightX = rootX + f.columnGap.insights
  // No intermediate insight → entities take the first column after the root.
  const leafX = hasInsights ? insightX + f.columnGap.leaves : insightX

  const centredIndex = (count: number, index: number) => index - (count - 1) / 2

  const insights = [...insightIds].sort().map((id, i, all) => ({
    id,
    label: humanizeInsightId(id),
    x: insightX,
    rowOffset: centredIndex(all.length, i),
  }))

  const leaves = [...memberEntities.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, node], j, all) => ({
    id,
    // The DATASET's own entity label — the same name the Unstructured
    // drill-down shows for this exact node (entityFill.ts writes it at
    // generation). The per-id synthetic name remains only as a fallback for
    // an unlabelled endpoint.
    label: (node?.label as string) || syntheticNameFor(id, rootLabel),
    x: leafX,
    rowOffset: centredIndex(all.length, j),
  }))

  // Chain: Cluster → Insights → Entities. Entities belong to the cluster;
  // with insights present they fan out from the insight column (deterministic
  // round-robin by sorted order) so the hierarchy reads root → outward; with no
  // insight the cluster connects to its entities directly.
  const links: StructuredFocusModel['links'] = []
  for (const ins of insights) links.push({ fromId: clusterId, toId: ins.id, tier: 'insight' })
  leaves.forEach((leaf, j) => {
    links.push({
      fromId: hasInsights ? insights[j % insights.length].id : clusterId,
      toId: leaf.id,
      tier: 'leaf',
    })
  })

  return {
    clusterId,
    clusterAngleDeg,
    rotationDeg,
    rootLabel,
    root: { x: rootX, y: 0 },
    insights,
    leaves,
    links,
    bounds: {
      contentXMax: (leaves.length ? leafX : insightX) + f.leafLabelReserve,
    },
  }
}

/**
 * The focus camera. Two regimes, because what "frame the focus" means changes
 * with how many fans are open:
 *
 * - ONE open cluster — the radial graph SHIFTS LEFT and the view ZOOMS IN
 *   slightly, as one animated move alongside the rotor's spin. Scale starts from
 *   the overview's OWN fit scale (the same formula the Structured initial camera
 *   uses) times `zoomInFactor`, so it is always a zoom in relative to what the
 *   user was just looking at, then clamped so the columns and their labels still
 *   fit the space right of the anchor. The focused cluster is anchored
 *   `anchorFraction` across the canvas, which is what pushes the ring left.
 *
 * - SEVERAL open clusters — their fans point in different directions, so there
 *   is no single side to shift toward. The camera re-centres on the ring and
 *   fits the ring PLUS the reach of the open fans, which is a zoom out from the
 *   single-fan framing but the only framing in which all of them are visible at
 *   once (the requirement being that every expanded cluster stays visible).
 */
export function computeFocusCamera(models: StructuredFocusModel[]): d3.ZoomTransform {
  const v = STRUCTURED_VIEWPORT
  const cam = STRUCTURED_FOCUS.camera
  const overviewK = Math.min(v.dataWidth, v.dataHeight) / (2 * (v.outerRadius + v.fitPadding))
  if (!models.length) {
    return d3.zoomIdentity.translate(v.dataWidth / 2, v.dataHeight / 2).scale(overviewK)
  }

  // The camera is ALWAYS anchored on the PRIMARY — the last cluster the user
  // clicked — never on the union of everything open. The old multi branch fit
  // a circle around the ring plus the furthest fan reach, which zoomed out
  // harder with every additional cluster. Instead the zoom DISCIPLINE of the
  // single-fan case applies to one and many alike: hold the focused zoom
  // (`overviewK × zoomInFactor`), shrink only as far as the PRIMARY's own fan
  // needs (`contentK` — the "small adjustment only if absolutely necessary"),
  // and let earlier fans radiate partially out of view. The caller's single
  // shared transition makes the move smooth.
  const primary = models[models.length - 1]
  const fanLength = Math.max(primary.bounds.contentXMax - primary.root.x, 1)
  const span = v.dataWidth * (1 - cam.anchorFraction)
  const k = Math.min(overviewK * cam.zoomInFactor, span / fanLength)

  if (models.length === 1) {
    // The rotor turns a LONE fan horizontal on the focus side, so the pan is
    // one-dimensional: anchor the root at `anchorFraction` across the canvas.
    // (Horizontal only: with a constant-screen row pitch a column occupies the
    // same canvas height at every scale, so there is nothing vertical for the
    // camera to solve — the pitch cap in deriveStructuredFocus owns that.)
    return d3.zoomIdentity
      .translate(v.dataWidth * cam.anchorFraction - k * primary.root.x, v.dataHeight / 2)
      .scale(k)
  }

  // SEVERAL open: the rotor parks at 0 so incumbent fans keep their true ring
  // angles — meaning the newest fan radiates at ITS cluster's own angle, not
  // horizontally. The pan therefore generalizes by direction: centre the
  // canvas on the midpoint of the primary's root→content reach along that
  // angle. Same k as above — clicking another cluster pans, it does not
  // zoom out. (The fan's render-time avoidance offset is not known here and
  // is bounded to a few degrees; anchoring on the cluster's own angle is
  // within a node radius of exact.)
  const angle = (primary.clusterAngleDeg * Math.PI) / 180
  const mid = (primary.root.x + primary.bounds.contentXMax) / 2
  return d3.zoomIdentity
    .translate(
      v.dataWidth / 2 - k * mid * Math.cos(angle),
      v.dataHeight / 2 - k * mid * Math.sin(angle),
    )
    .scale(k)
}

export interface StructuredFocusHandle {
  /**
   * Render the given open set. Keyed by cluster id: fans already on screen are
   * left in place, a new one fades in, a removed one fades out. An empty array
   * restores the overview.
   */
  update: (models: StructuredFocusModel[], opts: StructuredFocusRenderOptions) => void
  destroy: (animate: boolean) => void
}

export interface StructuredFocusRenderOptions {
  /** The focus camera's scale — sizes constant-screen fonts at render time. */
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
}

/** A fan on screen: its model plus the angular offset it was placed at. */
interface FanDatum {
  model: StructuredFocusModel
  /**
   * Degrees added to the cluster's own angle to keep this fan clear of fans that
   * were already open. 0 for anything with room — which is the normal case, and
   * always the case for a lone fan.
   */
  offsetDeg: number
}

/**
 * Pick an angular offset for a NEW fan so it does not land on top of one that is
 * already open.
 *
 * The ring holds 62 clusters at a ~5.8° pitch while a fan needs roughly 20° of
 * angular room at its outer end, so two clusters opened near each other would
 * overlap. The newcomer is the one that yields: incumbent fans never move, which
 * is what makes "opening C leaves A and B exactly as they were" literally true.
 * Beyond `maxOffsetDeg` it gives up and overlaps rather than flying the fan off
 * to somewhere unrelated to its own cluster — a detached fan would be worse than
 * a crowded one.
 */
function assignFanOffset(angleDeg: number, takenDeg: number[]): number {
  const { minSeparationDeg, maxOffsetDeg, offsetStepDeg } = STRUCTURED_FOCUS.fan
  const angularDistance = (a: number, b: number) => {
    const d = Math.abs(((a - b) % 360 + 540) % 360 - 180)
    return d
  }
  const clears = (candidate: number) =>
    takenDeg.every(taken => angularDistance(candidate, taken) >= minSeparationDeg)
  if (clears(angleDeg)) return 0
  for (let step = offsetStepDeg; step <= maxOffsetDeg; step += offsetStepDeg) {
    for (const signed of [step, -step]) {
      if (clears(angleDeg + signed)) return signed
    }
  }
  return 0
}

/**
 * Create the focus controller for a rendered Structured SVG. The controller owns
 * the focus layer, the overview dim and the rotor's rotation; the caller owns the
 * open set, the camera and hover suspension.
 */
export function createStructuredFocus(viewportGroup: ViewportSelection): StructuredFocusHandle {
  const f = STRUCTURED_FOCUS
  const fade = <S extends d3.Selection<any, any, any, any>>(sel: S) =>
    sel.transition().duration(f.transitionMs) as any
  const rotor = viewportGroup.select<SVGGElement>('g.structured-rotor')

  // ── Overview selections, captured once ───────────────────────────────────
  const overviewConnsFg = viewportGroup.selectAll('.link-foreground')
  const overviewConnsBg = viewportGroup.selectAll('.link-background')
  const overviewNodes = viewportGroup.selectAll(
    'g.cluster-node-group, g.cluster-label-group, '
    + '.entity-node, .entity-node-base, .entity-node-highlight, .entity-count, '
    + '.insight-node, .cluster-entity-bridge, g.cluster-entity-badge, '
    + 'g.structured-center-ring',
  )
  const clusterGroups = viewportGroup.selectAll('g.cluster-node-group')
  const ringLabels = viewportGroup.selectAll('g.cluster-label-group')
  const entityCounts = viewportGroup.selectAll('text.entity-count')
  /**
   * Per-cluster satellites: the entity summary layers and the cluster→entity
   * bridge. Every element carries the CLUSTER's datum (renderEntityRing /
   * renderClusterEntityBridge bind the cluster node, exactly so per-cluster
   * treatments like this can filter on it). `.entity-count` is deliberately
   * NOT here — an expanded cluster hides its count (see below).
   */
  const satellites = viewportGroup.selectAll(
    '.entity-node, .entity-node-base, .entity-node-highlight, '
    + '.cluster-entity-bridge, g.cluster-entity-badge',
  )

  /*
   * THE FOCUS LAYER LIVES INSIDE THE ROTOR. Each fan is attached to its own
   * cluster, so when the ring turns the fans must turn with it — otherwise a
   * secondary fan would detach from the node it belongs to the moment another
   * cluster was opened.
   */
  const layer = rotor.append('g')
    .attr('class', 'structured-focus-layer')
    // Inert by default; connection lines and entity marks opt back in below.
    .style('pointer-events', 'none')

  let rotationDeg = 0
  /**
   * The entity whose relationship neighbourhood is isolated, if any. Null is the
   * normal multi-cluster focus view.
   */
  let isolatedLeafId: string | null = null
  /** The clusters currently open — the isolation pass restores against this. */
  let openIdSet = new Set<string>()

  /*
   * ── ISOLATE ONE ENTITY'S NEIGHBOURHOOD ───────────────────────────────────
   *
   * Clicking an entity answers "what is this connected to?" by leaving only
   * that neighbourhood lit. Membership comes from the RESOLVED graph that is
   * actually drawn — the data bound to the chain lines and the relation lines —
   * never from what happens to sit near it on screen.
   *
   * The neighbourhood is deliberately NOT a transitive closure, which would
   * light most of the view after two hops. It is:
   *
   *   1. the clicked entity;
   *   2. Insights directly connected to it;
   *   3. Entities directly related to it (the cross-cluster relations);
   *   4. Entities hanging off the Insights from (2) — "if a connected Insight
   *      links to another relevant Entity, keep that Entity visible too".
   *
   * Opacity only: nothing moves, so node positions, the camera, the rotation and
   * every connection style are untouched, and clearing restores exactly the
   * resting values.
   */
  function neighbourhoodOf(entityId: string): Set<string> {
    const chain = layer.selectAll<SVGLineElement, any>('line.structured-focus-link').data() as any[]
    const relations = layer.selectAll<SVGLineElement, any>('line.structured-focus-relation').data() as any[]
    const insightIds = new Set(
      (layer.selectAll<SVGCircleElement, any>('circle.structured-focus-insight').data() as any[])
        .map(d => d.id),
    )

    const set = new Set<string>([entityId])
    // (2) Insights directly connected to the clicked entity. The `fromId` of a
    // leaf link is the parent Insight — or the CLUSTER itself when that cluster
    // has no insights, which is why membership is checked against the drawn
    // insight ids rather than assumed.
    for (const l of chain) {
      if (l.toId === entityId && insightIds.has(l.fromId)) set.add(l.fromId)
    }
    // (3) Entities directly related to it, either direction.
    for (const r of relations) {
      if (r.aEntityId === entityId) set.add(r.bEntityId)
      if (r.bEntityId === entityId) set.add(r.aEntityId)
    }
    // (4) Entities reached through those Insights.
    for (const l of chain) {
      if (insightIds.has(l.fromId) && set.has(l.fromId)) set.add(l.toId)
    }
    return set
  }

  /**
   * Paint the current isolation state (or restore, when nothing is isolated).
   *
   * While an entity is isolated everything OUTSIDE its resolved neighbourhood
   * is HIDDEN, not dimmed — other open clusters (their ring nodes, satellites,
   * counts, fan root labels), unrelated entities, unrelated insights and every
   * unrelated line. Only the clicked entity (as a chip), its own cluster, its
   * related entities/insights and the connections between that set stay
   * visible. Restoring re-asserts the multi-cluster FOCUS state — open
   * clusters lit, everything else at the focus dim — never bare 1s.
   */
  function applyLeafIsolation(opts: StructuredFocusRenderOptions) {
    const leafDots = layer.selectAll<SVGCircleElement, any>('circle.structured-focus-leaf')
    const insightDots = layer.selectAll<SVGCircleElement, any>('circle.structured-focus-insight')
    const labels = layer.selectAll<SVGTextElement, any>('text.structured-focus-label')
    const rootLabels = layer.selectAll<SVGTextElement, any>('text.structured-focus-root-label')
    const chainFg = layer.selectAll<SVGLineElement, any>('line.structured-focus-link')
    const chainBg = layer.selectAll<SVGLineElement, any>('line.structured-focus-link-background')
    const chainEnds = layer.selectAll<SVGCircleElement, any>('circle.structured-focus-link-endpoint')
    const relFg = layer.selectAll<SVGLineElement, any>('line.structured-focus-relation')
    const relEnds = layer.selectAll<SVGCircleElement, any>('circle.structured-focus-relation-endpoint')
    // The chip never survives a state change — it is rebuilt when isolating.
    layer.selectAll('g.structured-focus-entity-chip').remove()
    const isOpen = (d: any) => openIdSet.has(d?.id)

    if (!isolatedLeafId) {
      leafDots.attr('opacity', f.leaf.opacity).style('pointer-events', 'auto')
      insightDots.attr('opacity', 1)
      labels.attr('opacity', 1)
      rootLabels.attr('opacity', 1)
      chainFg.attr('opacity', LINK_STYLING.opacity.base)
      chainBg.attr('opacity', LINK_BACKGROUND_OPACITY)
      chainEnds.attr('opacity', LINK_STYLING.endpoints.opacity)
      relFg.attr('opacity', LINK_STYLING.opacity.base)
      relEnds.attr('opacity', LINK_STYLING.endpoints.opacity)
      // Back to the multi-cluster focus treatment for the ring itself.
      clusterGroups.style('opacity', (d: any) => (isOpen(d) ? 1 : f.dimmedOverview))
      satellites.style('opacity', (d: any) => (isOpen(d) ? 1 : f.dimmedOverview))
      entityCounts.style('opacity', (d: any) => (isOpen(d) ? 1 : f.dimmedOverview))
      return
    }

    const active = neighbourhoodOf(isolatedLeafId)
    const insightIds = new Set((insightDots.data() as any[]).map(d => d.id))
    const clickedDatum: any = leafDots.filter((d: any) => d.id === isolatedLeafId).datum()
    const ownClusterId: string | null = clickedDatum?.clusterId ?? null
    /*
     * A chain link survives when its TARGET is in the neighbourhood and its
     * source anchors it — either the source is in the neighbourhood too, or it
     * is the cluster root (not an insight), which is how an entity attaches to
     * the cluster it belongs to. An entity pulled in only by a cross-cluster
     * relation therefore keeps its dot without dragging an unrelated Insight's
     * line back into view.
     */
    const linkLit = (l: any) => active.has(l.toId) && (active.has(l.fromId) || !insightIds.has(l.fromId))
    const relLit = (r: any) => active.has(r.aEntityId) && active.has(r.bEntityId)

    // The clicked entity's own dot + label hide too — the CHIP stands in for
    // them (its leading dot sits exactly on the entity's point).
    leafDots
      .attr('opacity', (d: any) => (d.id === isolatedLeafId ? 0 : active.has(d.id) ? 1 : 0))
      .style('pointer-events', (d: any) => (active.has(d.id) && d.id !== isolatedLeafId ? 'auto' : 'none'))
    insightDots.attr('opacity', (d: any) => (active.has(d.id) ? 1 : 0))
    labels.attr('opacity', (d: any) => (d.id === isolatedLeafId ? 0 : active.has(d.id) ? 1 : 0))
    chainFg.attr('opacity', (l: any) => (linkLit(l) ? LINK_STYLING.opacity.hover : 0))
    chainBg.attr('opacity', (l: any) => (linkLit(l) ? LINK_BACKGROUND_OPACITY : 0))
    chainEnds.attr('opacity', (p: any) => (linkLit(p.d) ? LINK_STYLING.endpoints.opacity : 0))
    relFg.attr('opacity', (r: any) => (relLit(r) ? LINK_STYLING.opacity.hover : 0))
    relEnds.attr('opacity', (p: any) => (relLit(p.d) ? LINK_STYLING.endpoints.opacity : 0))

    // Other opened clusters vanish with their fans; the clicked entity's own
    // cluster keeps its node (it anchors the visible chain). Root labels of
    // other fans go with their clusters.
    const ownVisible = (d: any) => d?.id === ownClusterId
    clusterGroups.style('opacity', (d: any) => (ownVisible(d) ? 1 : 0))
    satellites.style('opacity', (d: any) => (ownVisible(d) ? 1 : 0))
    entityCounts.style('opacity', (d: any) => (ownVisible(d) ? 1 : 0))
    rootLabels.attr('opacity', function () {
      const fanEl = (this as SVGTextElement).closest('g.structured-focus-fan')
      return fanEl?.getAttribute('data-cluster-id') === ownClusterId ? 1 : 0
    })

    buildIsolatedEntityChip(opts, clickedDatum)
  }

  /**
   * The isolated entity's CHIP — the SAME component language as the
   * Unstructured drill-down's `expanded-region-chip`: every colour, radius,
   * padding, the leading dot, the divider and the × come from the one
   * EXPANDED_CLUSTER.chip token set (resolved live through opts.themeColor),
   * so the two chips are one style by construction. `[ • Name  × ]`, opaque,
   * width hugging the measured label. Its leading dot sits exactly on the
   * entity's point, it stays upright against fan + rotor rotation, and it is
   * constant-screen (scaled by 1/cameraK). The × restores the previous
   * multi-cluster focus state.
   */
  function buildIsolatedEntityChip(opts: StructuredFocusRenderOptions, clicked: any) {
    if (!clicked) return
    const chip = EXPANDED_CLUSTER.chip
    const fanGroup = layer.selectAll<SVGGElement, FanDatum>('g.structured-focus-fan')
      .filter(function () { return this.getAttribute('data-cluster-id') === clicked.clusterId })
    if (fanGroup.empty()) return
    const fan = fanGroup.datum()
    const dotEl = fanGroup.selectAll<SVGCircleElement, any>('circle.structured-focus-leaf')
      .filter((d: any) => d.id === clicked.id).node()
    if (!dotEl) return
    const cx = Number(dotEl.getAttribute('cx'))
    const cy = Number(dotEl.getAttribute('cy'))
    const netDeg = rotationDeg + fan.model.clusterAngleDeg + fan.offsetDeg

    const chipFill = opts.themeColor(chip.fillToken)
    const chipInk = opts.themeColor(chip.inkToken)
    const chipBorder = opts.themeColor(chip.borderToken)
    const chipClose = opts.themeColor(chip.closeToken)

    // Anchored on the entity point, upright, constant-screen; the trailing
    // translate puts the LEADING DOT (chip-local x = paddingX + dotRadius)
    // exactly on that point — the drill-down chip's own dot-anchor convention.
    const chipGroup = fanGroup.append('g')
      .attr('class', 'structured-focus-entity-chip')
      .attr('transform',
        `translate(${cx}, ${cy}) rotate(${-netDeg}) scale(${1 / opts.cameraK}) `
        + `translate(${-(chip.paddingX + chip.dotRadius)}, 0)`)
      .style('pointer-events', 'none')

    const bg = chipGroup.append('rect')
      .attr('class', 'expanded-chip-bg')
      .attr('y', -chip.height / 2)
      .attr('height', chip.height)
      .attr('rx', chip.height / 2)
      .attr('fill', chipFill)
      .attr('stroke', chipBorder)
      .attr('stroke-width', chip.borderWidth)

    chipGroup.append('circle')
      .attr('class', 'expanded-chip-dot')
      .attr('cx', chip.paddingX + chip.dotRadius)
      .attr('cy', 0)
      .attr('r', chip.dotRadius)
      .attr('fill', chipInk)

    const text = chipGroup.append('text')
      .attr('class', 'expanded-chip-label')
      .attr('x', chip.paddingX + chip.dotRadius * 2 + chip.gap)
      .attr('y', 0)
      .attr('dominant-baseline', 'middle')
      .attr('font-family', chip.fontFamily)
      .attr('font-size', chip.fontSize)
      .attr('font-weight', chip.fontWeight)
      .attr('fill', chipInk)
      .text(clicked.label || clicked.id)

    // Hug-content width, exactly the drill-down chip's layout:
    //   paddingX │ dot │ gap │ label │ divider.gap │ rule │ close.gap │ × │ paddingX
    const textLength = (text.node() as SVGTextElement).getComputedTextLength?.()
      ?? String(clicked.label || '').length * chip.fontSize * 0.6
    const width = chip.paddingX + chip.dotRadius * 2 + chip.gap + textLength
      + chip.divider.gap + chip.divider.width + chip.close.gap + chip.close.size
      + chip.paddingX
    bg.attr('x', 0).attr('width', width)

    const dividerX = width - chip.paddingX - chip.close.size - chip.close.gap
      - chip.divider.width / 2
    chipGroup.append('line')
      .attr('class', 'expanded-chip-divider')
      .attr('stroke', chipBorder)
      .attr('stroke-width', chip.divider.width)
      .attr('x1', dividerX).attr('x2', dividerX)
      .attr('y1', -chip.height / 2 + chip.borderWidth)
      .attr('y2', chip.height / 2 - chip.borderWidth)

    // The × — closing the chip restores the previous multi-cluster focus.
    const close = chipGroup.append('g')
      .attr('class', 'expanded-chip-close')
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('aria-label', `Clear ${clicked.label ?? 'entity'} isolation`)
      .attr('transform', `translate(${width - chip.paddingX - chip.close.size}, 0)`)
      .style('pointer-events', 'auto')
      .style('cursor', 'pointer')
      .on('pointerdown', (event: PointerEvent) => event.stopPropagation())
      .on('click', (event: MouseEvent) => {
        event.stopPropagation()
        isolatedLeafId = null
        applyLeafIsolation(opts)
      })
      .on('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          isolatedLeafId = null
          applyLeafIsolation(opts)
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
  }

  /*
   * CLUSTER RELATEDNESS, from the same resolved connection set every other
   * Structured feature reads. Two clusters are related when they are directly
   * linked, or when they share an Insight — the same definition the Unstructured
   * drill-down's `expandedPairRelated` uses, so "which clusters relate" cannot
   * disagree between the two views.
   */
  const connections = getResolvedConnections()
  const neighbours = new Map<string, Set<string>>()
  const repKind = new Map<string, string>()
  /** Origin hubs (Source / Document) each cluster was extracted from. */
  const hubsOf = new Map<string, Set<string>>()
  const addTo = (map: Map<string, Set<string>>, a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set())
    map.get(a)!.add(b)
  }
  const HUB_KINDS = new Set(['source', 'document'])
  /** Each cluster's semantic category, for the topical tier below. */
  const categoryOf = new Map<string, string>()
  viewportGroup.selectAll('g.cluster-node-group')
    .each((d: any) => { if (d?.id && d?.category) categoryOf.set(d.id, d.category) })
  for (const conn of connections) {
    const a = representativeId(conn.sourceNode)
    const b = representativeId(conn.targetNode)
    if (a === b) continue // self-link (cluster ↔ its own entity)
    // Origin edges: a cluster's link to the Source or Document it came from.
    // These endpoints are not drawn as ring nodes, so they are recorded
    // separately rather than as neighbours.
    if (HUB_KINDS.has(conn.targetNode.kind)) { addTo(hubsOf, a, b); continue }
    if (HUB_KINDS.has(conn.sourceNode.kind)) { addTo(hubsOf, b, a); continue }
    if (!hasVisibleEndpoints(conn)) continue
    repKind.set(a, conn.sourceNode.kind === 'entity' ? 'cluster' : conn.sourceNode.kind)
    repKind.set(b, conn.targetNode.kind === 'entity' ? 'cluster' : conn.targetNode.kind)
    addTo(neighbours, a, b)
    addTo(neighbours, b, a)
  }
  /**
   * Are two clusters related enough for their entities to connect? Three tiers,
   * strongest first:
   *
   *   1. a DIRECT link between the two clusters;
   *   2. a SHARED INSIGHT — both are endpoints of the same insight;
   *   3. a SHARED ORIGIN — both were extracted from the same Source or Document;
   *   4. the SAME semantic category — topically the same kind of thing.
   *
   * Tiers 1 and 2 are exactly the Unstructured drill-down's rule. Tiers 3 and 4
   * are added here deliberately, and they are what make the layer visible at
   * all: this dataset contains NO cluster↔cluster links and only 13
   * cluster↔insight links across 10 of 62 clusters, so tiers 1–2 hold for just 5
   * of the 1891 possible pairs — the Unstructured view draws zero entity
   * relations for almost any pair you can open, and Structured would have done
   * the same. Both additions are real relationships in this graph rather than
   * inventions: a hub edge means "extracted from this source", and the category
   * is the cluster's own semantic label. Coverage with all four: 213 of 1891
   * pairs. Relations therefore still appear only BETWEEN RELATED clusters —
   * opening four mutually unrelated ones legitimately shows none.
   */
  const clustersRelated = (a: string, b: string): boolean => {
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
    const category = categoryOf.get(a)
    return !!category && category === categoryOf.get(b)
  }

  /** Local position of the cluster inside a fan frame offset by `offsetDeg`. */
  function localRoot(model: StructuredFocusModel, offsetDeg: number) {
    const rad = (offsetDeg * Math.PI) / 180
    return { x: model.root.x * Math.cos(rad), y: -model.root.x * Math.sin(rad) }
  }

  /**
   * Keep a fan's TEXT upright and correctly anchored for the rotation it is
   * currently displayed at.
   *
   * A fan is rotated by its own angle (plus offset) and then by the rotor, so its
   * labels would read at `rotor + angle` — tilted, or upside down past 90°. Same
   * problem and the same answer as the cluster ring's own labels: each text
   * counter-rotates about its own anchor point, so it ends visually horizontal
   * while keeping the position the fan gave it. Side labels additionally flip
   * their anchor on the left half, so a label always extends AWAY from the graph
   * instead of back across its own dots.
   */
  function orientFanText(
    fanGroup: d3.Selection<any, FanDatum, any, unknown>,
    durationMs: number,
  ) {
    fanGroup.each(function (fan) {
      const netDeg = rotationDeg + fan.model.clusterAngleDeg + fan.offsetDeg
      const pointsLeft = Math.cos((netDeg * Math.PI) / 180) < 0
      const texts = d3.select(this).selectAll<SVGTextElement, any>('text.structured-focus-text')
      const upright = (d: any) => `rotate(${-netDeg}, ${d.anchorX}, ${d.anchorY})`
      const anchor = (d: any) => {
        if (d.anchorMode !== 'side') return 'middle'
        return pointsLeft ? 'end' : 'start'
      }
      if (durationMs > 0) {
        texts.transition().duration(durationMs).attr('transform', upright)
      } else {
        texts.interrupt().attr('transform', upright)
      }
      texts.attr('text-anchor', anchor)
    })
  }

  /** Draw one fan's contents in its own local frame. */
  function buildFan(
    fanGroup: d3.Selection<SVGGElement, FanDatum, any, unknown>,
    opts: StructuredFocusRenderOptions,
  ) {
    fanGroup.each(function (fan) {
      const group = d3.select<SVGGElement, FanDatum>(this)
      const { model } = fan
      const root = localRoot(model, fan.offsetDeg)

      /*
       * This fan's PAINT SERVER, owned by the fan so it exists exactly as long
       * as the fan does.
       *
       * Mapped to USER SPACE across the columns rather than to each line's
       * bounding box, because a row is routinely EXACTLY horizontal in the fan's
       * local frame (a single insight, or the middle row of an odd count, sits on
       * y = 0) and an object-bounding-box paint server is not rendered when the
       * box has zero height — those rows would silently disappear while their
       * diagonal neighbours painted. Same stops as every other connection in the
       * app, so this is the same stroke, not a look-alike (linkRenderer.ts).
       */
      const fanDefs = group.append('defs')
      const gradientId = `structured-focus-link-gradient--${model.clusterId}`
      const bgGradientId = `structured-focus-link-bg--${model.clusterId}`
      appendUserSpaceLinkGradient(fanDefs as any, gradientId, root.x, model.bounds.contentXMax)
      // The BACKGROUND line needs its own user-space paint for the same reason —
      // it is the widest mark in the stack, so a horizontal row losing it is the
      // most visible failure of the three.
      appendUserSpaceLinkGradient(
        fanDefs as any, bgGradientId, root.x, model.bounds.contentXMax,
        LINK_GRADIENT.background.stops,
      )

      /*
       * ── ROW PITCH: derived, not fixed ──────────────────────────────────────
       *
       * Rows are separated ACROSS the fan's axis, and each row carries a
       * horizontal label. So the clearance a row needs is that label's footprint
       * projected onto the row direction — and that depends on where the fan
       * points on screen:
       *
       * - a HORIZONTAL fan stacks its rows vertically, so one line height (~16px)
       *   separates them and the configured gap is already generous;
       * - a VERTICAL fan puts its rows SIDE BY SIDE, so the labels sit shoulder
       *   to shoulder and need a whole label WIDTH (~100px) between them.
       *
       * Sizing the pitch off the configured gap alone is what let the vertical
       * fans overlap their own labels ("Priya Nataraj" across "Natasha Meyer").
       * The projection below covers every orientation in between, and the
       * configured gap remains the floor. Widths come from a character-count
       * estimate rather than a measure-then-reflow pass, so the layout is
       * deterministic across reloads.
       */
      const netRad = ((rotationDeg + model.clusterAngleDeg + fan.offsetDeg) * Math.PI) / 180
      const lineHeight = f.label.fontSize * f.label.lineHeightFactor
      const estWidth = (label: string) => Math.min(
        f.label.maxWidth,
        label.length * f.label.fontSize * f.label.estCharWidth,
      )
      const rowPitchFor = (items: FocusItem[], gap: number) => {
        if (items.length < 2) return gap
        const widest = Math.max(...items.map(i => estWidth(i.label)))
        const needed = widest * Math.abs(Math.sin(netRad))
          + lineHeight * Math.abs(Math.cos(netRad))
        // Capped so a long column can never outgrow the canvas — with a
        // constant-screen pitch, zooming out no longer shrinks it.
        const cap = (STRUCTURED_VIEWPORT.dataHeight * f.camera.verticalFill) / (items.length - 1)
        return Math.min(Math.max(gap, needed), cap)
      }
      const insightPitch = rowPitchFor(model.insights, f.rowGap.insights)
      const leafPitch = rowPitchFor(model.leaves, f.rowGap.leaves)

      /*
       * Resolve every item into this fan's LOCAL data coordinates, ONCE, so the
       * lines, the dots and the labels can never disagree. `x` is already
       * data-space; `y` is the row offset times the screen-space pitch divided by
       * the camera scale, which is what makes the gap the reader sees the gap
       * that was configured, at any zoom.
       */
      const resolved = new Map<string, FocusItem & { y: number, clusterId: string }>()
      const place = (items: FocusItem[], pitch: number) => items.map(item => {
        // `clusterId` rides on every placed item so the leaf-isolation pass can
        // resolve which fan/cluster a clicked entity belongs to from its datum.
        const placed = { ...item, y: (item.rowOffset * pitch) / opts.cameraK, clusterId: model.clusterId }
        resolved.set(item.id, placed)
        return placed
      })
      const insightItems = place(model.insights, insightPitch)
      const leafItems = place(model.leaves, leafPitch)
      const itemById = resolved

      const rootR = (STRUCTURED_NODE_SIZES.cluster / 2) * f.rootScale
      const insightR = INSIGHT_RING.nodeRadius
      // The entity mark's EFFECTIVE radius: the expanded-entity radius, floored
      // to its on-screen minimum at the current camera scale. One value, so the
      // dot, the line's endpoint trim and the label offset can never disagree
      // about how big the mark actually is.
      const leafRadius = Math.max(f.leaf.radius, f.leaf.minVisualRadius / opts.cameraK)
      const segment = (link: StructuredFocusModel['links'][number]) => {
        const from = link.fromId === model.clusterId
          ? { x: root.x, y: root.y, r: rootR }
          : { ...itemById.get(link.fromId)!, r: insightR }
        const to = { ...itemById.get(link.toId)!, r: link.tier === 'insight' ? insightR : leafRadius }
        const dx = to.x - from.x
        const dy = to.y - from.y
        const len = Math.hypot(dx, dy) || 1
        const pad = f.line.endpointGap
        return {
          x1: from.x + (dx / len) * (from.r + pad),
          y1: from.y + (dy / len) * (from.r + pad),
          x2: to.x - (dx / len) * (to.r + pad),
          y2: to.y - (dy / len) * (to.r + pad),
        }
      }

      /*
       * The chain connections, drawn by the SHARED connection renderer — the
       * same four-mark stack the Unstructured graph draws (blurred background
       * line, endpoint dots, luminous foreground line), from the same style
       * functions and the same tokens. Only the paint servers are swapped for
       * this fan's user-space pair; everything else — widths, dashes, the
       * resting opacities, the blur filters — comes from linkRenderer.ts, so
       * these lines and an Unstructured link cannot drift apart.
       */
      const linksGroup = group.append('g').attr('class', 'structured-focus-links')
      const chain = renderStraightConnections(
        linksGroup,
        model.links.filter(l => itemById.has(l.toId)),
        segment,
        {
          className: 'structured-focus-link',
          zoomScale: opts.cameraK,
          stroke: `url(#${gradientId})`,
          backgroundStroke: `url(#${bgGradientId})`,
          widthFactor: f.line.widthFactor,
        },
      )

      // Hover highlighting, the same relationship the base graph draws: the
      // hovered connection lifts to the base `hover` opacity and thickens
      // slightly, every other line IN THIS FAN drops to `hidden`, and the
      // endpoint dots of dimmed lines are hidden outright — exactly what
      // applyEndpointSelection does in the Unstructured graph. Scoped to the fan
      // so hovering inside one expanded cluster never dims another's.
      const focusLines = chain.foreground
      const focusEndpoints = chain.endpoints
      // The same thinned width the renderer just painted — the hover handlers
      // restore to THIS, so a hover cycle can never fatten a line back to the
      // unscaled base width.
      const focusLineWidth = getLinkStrokeWidth('default', opts.cameraK) * f.line.widthFactor
      const setLineState = (activeKey: string | null) => {
        focusLines
          .attr('opacity', (l: any) => (activeKey === null
            ? LINK_STYLING.opacity.base
            : (`${l.fromId}~${l.toId}` === activeKey ? LINK_STYLING.opacity.hover : LINK_STYLING.opacity.hidden)))
          .attr('stroke-width', (l: any) => (activeKey !== null && `${l.fromId}~${l.toId}` === activeKey
            ? focusLineWidth * 1.3
            : focusLineWidth))
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

      // Insight dots — same visual language as the insight ring
      group.append('g').attr('class', 'structured-focus-insights')
        .selectAll('circle')
        .data(insightItems)
        .join('circle')
        .attr('class', 'structured-focus-insight')
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('r', insightR)
        .attr('fill', opts.insightFill)
        .attr('stroke', opts.insightStroke)
        .attr('stroke-width', INSIGHT_RING.strokeWidth)

      /*
       * Entity marks — the SAME mark as an `expanded-entity` in the Unstructured
       * drill-down, not a look-alike. Every value is the expanded-entity one:
       * - radius with its on-screen floor, so the dot stays pickable when zoomed
       *   out exactly as it does inside an expanded cluster;
       * - the fill resolved live from the theme by the caller's
       *   `nodeColor({ kind: 'entity' })` — the same call the drill-down makes;
       * - no stroke, and the same resting opacity;
       * - the same hover contract: the hovered entity goes fully opaque and every
       *   OTHER one drops to the dim opacity, opacity-only, nothing moves.
       */
      const leafDots = group.append('g').attr('class', 'structured-focus-leaves')
        .selectAll('circle')
        .data(leafItems)
        .join('circle')
        .attr('class', 'structured-focus-leaf')
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('r', leafRadius)
        .attr('fill', opts.entityFill)
        .attr('opacity', f.leaf.opacity)
        .style('pointer-events', 'auto')
        .style('cursor', 'pointer')
      leafDots
        .on('mouseenter', function (_event, hovered) {
          // While a neighbourhood is isolated it owns every opacity in the
          // layer; a hover pass would overwrite it with a different, smaller
          // emphasis. Hover resumes as soon as the isolation is cleared.
          if (isolatedLeafId) return
          leafDots.attr('opacity', d => (d.id === hovered.id ? 1 : f.leaf.dimOpacity))
          // The connection INTO the hovered entity lifts with it — the same
          // relationship the expanded view draws between an entity and its
          // relations, using the shared link opacity ramp.
          const incoming = model.links.find(l => l.toId === hovered.id)
          setLineState(incoming ? `${incoming.fromId}~${incoming.toId}` : null)
        })
        .on('mouseleave', () => {
          if (isolatedLeafId) return
          leafDots.attr('opacity', f.leaf.opacity)
          setLineState(null)
        })
        /*
         * Click an entity to isolate its relationship neighbourhood; click the
         * same one again to return to the normal multi-cluster focus view. The
         * open clusters are untouched either way — this is an emphasis state
         * layered over them, not a change of which clusters are expanded.
         */
        .on('click', (event: MouseEvent, clicked: any) => {
          event.stopPropagation()
          isolatedLeafId = isolatedLeafId === clicked.id ? null : clicked.id
          applyLeafIsolation(opts)
        })

      // ── Labels ────────────────────────────────────────────────────────────
      // Constant-screen via the structured zoom branch; truncated with an
      // ellipsis at the token budget — width and font rescale together, so the
      // character count fixed here stays valid at any zoom. `anchorX`/`anchorY`
      // are stored on each datum because orientFanText re-reads them every time
      // the rotation changes.
      const fontSize = f.label.fontSize / opts.cameraK
      const rootFontSize = f.label.rootFontSize / opts.cameraK
      const maxWidthUnits = (f.label.maxWidth / f.label.fontSize) * fontSize
      const labelGap = f.label.gap / opts.cameraK
      const truncate = (el: SVGTextElement, budget: number) => {
        const full = el.textContent || ''
        if ((el.getComputedTextLength?.() ?? 0) <= budget) return
        for (let len = full.length - 1; len > 0; len--) {
          el.textContent = `${full.slice(0, len)}…`
          if (el.getComputedTextLength() <= budget) return
        }
      }

      /*
       * ENTITY labels only. A focused Insight renders its node and its
       * connections but NO text: the insight column sits mid-chain, so its
       * labels landed between two runs of connections and competed with the
       * entity names that actually identify what was found. The nodes and lines
       * carry the structure; the words belong to the entities.
       *
       * Entities are end-of-chain, so every remaining label sits beside its
       * mark. (`anchorMode` is kept because the root label below is centred
       * above its point, and orientFanText reads the mode off each datum.)
       */
      const labelData = leafItems.map(item => ({
        ...item,
        anchorMode: 'side',
        anchorX: item.x + leafRadius + labelGap,
        anchorY: item.y,
      }))

      const labelLayer = group.append('g').attr('class', 'structured-focus-labels')
      labelLayer.selectAll('text.structured-focus-label')
        .data(labelData)
        .join('text')
        .attr('class', 'structured-focus-label structured-focus-text')
        .attr('x', d => d.anchorX)
        .attr('y', d => d.anchorY)
        .attr('dominant-baseline', d => (d.anchorMode === 'above' ? 'auto' : 'middle'))
        .attr('font-family', f.label.fontFamily)
        .attr('font-size', fontSize)
        .attr('font-weight', f.label.fontWeight)
        .attr('fill', f.label.ink)
        .text(d => d.label)
        .each(function () { truncate(this as SVGTextElement, maxWidthUnits) })

      // Root label — the cluster's category, beside its node
      const rootLabelY = root.y + rootR + f.label.rootOffsetY / opts.cameraK
      labelLayer.append('text')
        .datum({ anchorMode: 'above', anchorX: root.x, anchorY: rootLabelY })
        .attr('class', 'structured-focus-root-label structured-focus-text')
        .attr('x', root.x)
        .attr('y', rootLabelY)
        .attr('dominant-baseline', 'hanging')
        .attr('font-family', f.label.fontFamily)
        .attr('font-size', rootFontSize)
        .attr('font-weight', f.label.rootFontWeight)
        .attr('fill', f.label.ink)
        .text(model.rootLabel)
    })
  }

  function restoreOverview(animate: boolean) {
    const restore = <S extends d3.Selection<any, any, any, any>>(sel: S) =>
      (animate ? sel.transition().duration(f.transitionMs) : sel) as any
    // MOTION unwinds over the rotation's duration, not the fade's — the same
    // pairing as opening (rotor + camera share one duration, opacities fade on
    // their own shorter one), so closing is symmetric with opening.
    const restoreMotion = <S extends d3.Selection<any, any, any, any>>(sel: S) =>
      (animate ? sel.transition().duration(f.rotationMs) : sel) as any
    // Connections restore to their RESTING opacities (their base state is faint
    // by design — restoring to 1 would light the whole mesh).
    restore(overviewConnsFg).style('opacity', STRUCTURED_HOVER.connection.fgBase)
    restore(overviewConnsBg).style('opacity', STRUCTURED_HOVER.connection.bgBase)
    restore(overviewNodes).style('opacity', 1)
    restore(ringLabels).style('opacity', 1)
    restore(entityCounts).style('opacity', 1)
    // Unwind the rotation and put the radial text back to its resting
    // orientation (rotation 0). The clusters' counter-rotated logos and the
    // entity counts unwind in step, back to their own frames.
    rotationDeg = 0
    restoreMotion(clusterGroups.select('image.cluster-source-icon')).attr('transform', 'rotate(0)')
    applyEntityCountOrientation(rotor as any, 0, animate ? f.rotationMs : 0)
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

  function update(models: StructuredFocusModel[], opts: StructuredFocusRenderOptions) {
    const openIds = new Set(models.map(m => m.clusterId))
    openIdSet = openIds

    if (!models.length) {
      layer.selectAll('g.structured-focus-fan')
        .transition().duration(f.transitionMs).attr('opacity', 0).remove()
      restoreOverview(true)
      return
    }

    // ── Overview treatment ─────────────────────────────────────────────────
    // The connection mesh is HIDDEN (near-zero), not dimmed — leaving hundreds
    // of faint lines visible buried the drill-down; unopened nodes stay as
    // dimmed spatial context. Assignment is a full sweep every update rather
    // than incremental bookkeeping, so the treatment is a pure function of the
    // open set and can never drift out of sync with it.
    fade(overviewConnsFg).style('opacity', f.overviewConnectionOpacity)
    fade(overviewConnsBg).style('opacity', f.overviewConnectionOpacity)
    fade(overviewNodes).style('opacity', f.dimmedOverview)
    // Every OPEN cluster's node and satellites stay fully visible (applied after
    // the blanket dim above, so order can never leave them faded).
    const isOpen = (d: any) => openIds.has(d?.id)
    fade(clusterGroups.filter(isOpen)).style('opacity', 1)
    fade(satellites.filter(isOpen)).style('opacity', 1)
    /*
     * An expanded cluster's ring label is hidden: the fan draws its own root
     * label at the same node, and the radial ring label points outward straight
     * along the first connection, so at the dimmed opacity it read as a faint
     * duplicate lying across the line.
     */
    fade(ringLabels).style('opacity', (d: any) => (isOpen(d) ? 0 : f.dimmedOverview))
    /*
     * An OPEN cluster's entity-count stays fully visible — it is part of the
     * expanded cluster's own reading, not overview chrome, so it is lifted out
     * of the blanket dim along with the node it sits in. It stays UPRIGHT
     * through the ring's rotation via applyEntityCountOrientation below.
     */
    fade(entityCounts).style('opacity', (d: any) => (isOpen(d) ? 1 : f.dimmedOverview))

    /*
     * ── ROTATE THE WHOLE RADIAL GRAPH — for a SINGLE open cluster ────────────
     *
     * One open cluster: the rotor turns until that cluster sits horizontally on
     * the focus side, and its fan extends into the open canvas. No cluster is
     * lifted out of the ring or duplicated — the rotor (every ring layer, see
     * useStructuredRenderer) turns as one rigid body, so every node's element,
     * datum, icon, label and relationships are untouched.
     *
     * SEVERAL open clusters: the ring returns to its natural orientation. Not a
     * fallback — rotation can only bring one cluster to the focus side, and
     * rotating for the newest would silently re-orient every other open fan on
     * screen. Holding the rotation at 0 makes each fan's screen direction a
     * property of its OWN cluster alone, which is what lets an already-open fan
     * keep its exact geometry (and its label placement, which is derived from
     * that direction) when another cluster is opened beside it.
     */
    const primary = models[models.length - 1]
    rotationDeg = models.length === 1 ? primary.rotationDeg : 0
    rotor.transition()
      .duration(f.rotationMs)
      .attr('transform', `rotate(${rotationDeg})`)
      // Radial TEXT must not end up upside down: the labels and bridge badges
      // decide their flip from the angle they are DISPLAYED at, so both are
      // re-oriented for the new rotation once the spin lands.
      .on('end', () => {
        applyClusterLabelOrientation(rotor as any, rotationDeg)
        applyBridgeBadgeOrientation(rotor as any, rotationDeg)
      })

    // Keep every OPEN cluster's logo upright through the spin — the rotor would
    // otherwise land them tilted by `rotationDeg`. The node keeps its rotated
    // ring POSITION; only the full-bleed logo tile counter-rotates about the
    // node centre, so clipping, the border circle and hit-testing are untouched.
    // Closed clusters' icons unwind to their own frame.
    clusterGroups.each(function (d: any) {
      const icon = d3.select(this).select<SVGImageElement>('image.cluster-source-icon')
      if (icon.empty()) return
      icon.transition().duration(f.rotationMs)
        .attr('transform', `rotate(${openIds.has(d?.id) ? -rotationDeg : 0})`)
    })

    // The entity summaries' COUNTS get the same treatment as those logos —
    // animated over the rotation's own duration, so they read upright for every
    // frame of the spin instead of snapping straight at the end. This is what
    // keeps an OPEN cluster's count legible while the ring is turned.
    applyEntityCountOrientation(rotor as any, rotationDeg, f.rotationMs)

    // ── The open set, as a keyed join ──────────────────────────────────────
    // Keyed on cluster id, so an incumbent fan keeps its element, its datum and
    // its full opacity while a newcomer fades in beside it and a closed one fades
    // out — opening C never flickers A and B.
    const existing = new Map<string, FanDatum>()
    layer.selectAll<SVGGElement, FanDatum>('g.structured-focus-fan')
      .each(function (d) { existing.set(d.model.clusterId, d) })

    // Incumbent fans keep the offset they were placed at; a newcomer yields
    // around whatever is already on screen.
    const taken: number[] = []
    for (const model of models) {
      const prior = existing.get(model.clusterId)
      if (prior) taken.push(model.clusterAngleDeg + prior.offsetDeg)
    }
    const fanData: FanDatum[] = models.map(model => {
      const prior = existing.get(model.clusterId)
      if (prior) return { model, offsetDeg: prior.offsetDeg }
      const offsetDeg = assignFanOffset(model.clusterAngleDeg, taken)
      taken.push(model.clusterAngleDeg + offsetDeg)
      return { model, offsetDeg }
    })

    const fans = layer.selectAll<SVGGElement, FanDatum>('g.structured-focus-fan')
      .data(fanData, (d: any) => d.model.clusterId)

    fans.exit()
      .transition().duration(f.transitionMs)
      .attr('opacity', 0)
      .remove()

    const entered = fans.enter().append('g')
      .attr('class', 'structured-focus-fan')
      .attr('data-cluster-id', d => d.model.clusterId)
      // The fan's own frame: rotated to its cluster's radial direction, so the
      // model's local layout points outward from that node. Combined with the
      // rotor, the primary cluster's fan lands exactly where the single-cluster
      // focus has always drawn it.
      .attr('transform', d => `rotate(${d.model.clusterAngleDeg + d.offsetDeg})`)
      .attr('opacity', 0)
    entered.transition().duration(f.transitionMs).attr('opacity', 1)

    /*
     * Draw the contents of every fan in the set, incumbents included.
     *
     * Fan CONTENT depends on the camera scale and on the rotation (row pitch is
     * derived from the direction the fan points on screen — see buildFan), and
     * both change on the one↔many transition, so content is rebuilt rather than
     * left stale. It is a pure function of (model, rotation, cameraK), so for a
     * fan whose inputs did not change the rebuild reproduces the same drawing;
     * the group itself, its opacity and its fade are untouched, which is what
     * keeps an incumbent from flickering.
     */
    const all = entered.merge(fans as any)
    all.selectAll('*').remove()
    buildFan(all as any, opts)
    // Leaf de-collision runs BEFORE relations (which read the dots' live
    // positions) and before text orientation (which reads the updated anchors).
    deCollideFanLeaves(all as any, opts)
    orientFanText(all as any, 0)
    renderCrossClusterRelations(all as any, models, opts)
    deCollideFanLabels(all as any, opts)
    // Opening or closing a cluster rebuilds the fans, so any isolated
    // neighbourhood no longer refers to what is on screen — back to the normal
    // multi-cluster view.
    isolatedLeafId = null
    applyLeafIsolation(opts)
  }

  /**
   * Push apart focus ENTITIES (dot + label, as one unit) that would overlap
   * ACROSS fans.
   *
   * Each fan spaces its OWN rows (buildFan's derived pitch), but two fans'
   * columns can cross on screen and stack dots on dots or labels on dots. This
   * pass treats every leaf as one box — the dot plus its estimated label
   * footprint — in LAYER space, sweeps top-down, and shifts a colliding leaf
   * vertically until clear. Unlike the label pass below, the WHOLE leaf moves:
   * the dot, its label anchor, and the target end of its chain line (fore,
   * back and endpoint dots), so a nudged entity keeps its connection instead
   * of leaving the line pointing at empty space. Shifts are converted into
   * each fan's LOCAL frame, so the drawn attributes stay consistent with the
   * fan's own coordinate system. Deterministic: stable order, pure function of
   * the estimated boxes.
   */
  function deCollideFanLeaves(
    fanGroups: d3.Selection<SVGGElement, FanDatum, any, unknown>,
    opts: StructuredFocusRenderOptions,
  ) {
    interface LeafBox {
      id: string
      fanEl: SVGGElement
      angleRad: number
      x1: number, x2: number, y1: number, y2: number
    }
    const leafRadius = Math.max(f.leaf.radius, f.leaf.minVisualRadius / opts.cameraK)
    const pad = f.leaf.collidePadding / opts.cameraK
    const lineHeight = (f.label.fontSize * f.label.lineHeightFactor) / opts.cameraK
    const labelGap = f.label.gap / opts.cameraK
    const estWidth = (label: string) => Math.min(
      f.label.maxWidth,
      label.length * f.label.fontSize * f.label.estCharWidth,
    ) / opts.cameraK
    const halfH = Math.max(leafRadius, lineHeight / 2) + pad / 2

    const boxes: LeafBox[] = []
    fanGroups.each(function (fan) {
      const angleRad = ((rotationDeg + fan.model.clusterAngleDeg + fan.offsetDeg) * Math.PI) / 180
      const cos = Math.cos(angleRad)
      const sin = Math.sin(angleRad)
      d3.select(this).selectAll<SVGCircleElement, any>('circle.structured-focus-leaf')
        .each(function (d: any) {
          const lx = Number(this.getAttribute('cx'))
          const ly = Number(this.getAttribute('cy'))
          const x = lx * cos - ly * sin
          const y = lx * sin + ly * cos
          // Dot plus the label extending to the outward side of the graph.
          const w = leafRadius * 2 + labelGap + estWidth(d.label || '')
          const x1 = cos < 0 ? x - leafRadius - (w - leafRadius * 2) : x - leafRadius
          boxes.push({
            id: d.id,
            fanEl: this.closest('g.structured-focus-fan') as SVGGElement,
            angleRad,
            x1,
            x2: x1 + w,
            y1: y - halfH,
            y2: y + halfH,
          })
        })
    })

    boxes.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1 || (a.id < b.id ? -1 : 1))
    const settled: LeafBox[] = []
    for (const box of boxes) {
      let shift = 0
      for (const other of settled) {
        const overlapsX = box.x1 < other.x2 && box.x2 > other.x1
        if (!overlapsX) continue
        const top = box.y1 + shift
        if (top < other.y2 && box.y2 + shift > other.y1) shift += other.y2 - top
      }
      if (shift !== 0) {
        box.y1 += shift
        box.y2 += shift
        // Screen-vertical shift, expressed in this fan's LOCAL frame.
        const dxLocal = shift * Math.sin(box.angleRad)
        const dyLocal = shift * Math.cos(box.angleRad)
        const fanSel = d3.select(box.fanEl)
        const dot = fanSel.selectAll<SVGCircleElement, any>('circle.structured-focus-leaf')
          .filter((d: any) => d.id === box.id)
        dot.attr('cx', function () { return Number(this.getAttribute('cx')) + dxLocal })
          .attr('cy', function () { return Number(this.getAttribute('cy')) + dyLocal })
        // The label rides its dot: datum anchors move (orientFanText re-reads
        // them) and the drawn x/y move with them.
        fanSel.selectAll<SVGTextElement, any>('text.structured-focus-label')
          .filter((d: any) => d.id === box.id)
          .each(function (d: any) {
            d.anchorX += dxLocal
            d.anchorY += dyLocal
            d3.select(this).attr('x', d.anchorX).attr('y', d.anchorY)
          })
        // The chain line's TARGET end follows (fore + back + endpoint dots).
        const shiftLineEnd = (sel: d3.Selection<any, any, any, any>) => sel
          .attr('x2', function () { return Number(this.getAttribute('x2')) + dxLocal })
          .attr('y2', function () { return Number(this.getAttribute('y2')) + dyLocal })
        shiftLineEnd(fanSel.selectAll('line.structured-focus-link').filter((l: any) => l.toId === box.id))
        shiftLineEnd(fanSel.selectAll('line.structured-focus-link-background').filter((l: any) => l.toId === box.id))
        fanSel.selectAll<SVGCircleElement, any>('circle.structured-focus-link-endpoint')
          .filter((p: any) => p.end === 'target' && p.d.toId === box.id)
          .attr('cx', function () { return Number(this.getAttribute('cx')) + dxLocal })
          .attr('cy', function () { return Number(this.getAttribute('cy')) + dyLocal })
      }
      settled.push(box)
    }
  }

  /**
   * Push apart focus labels that would overlap ACROSS fans.
   *
   * Each fan already spaces its OWN rows (the derived row pitch in buildFan),
   * and the fans themselves are held apart angularly (`assignFanOffset`). Neither
   * helps between two fans: labels are horizontal whatever direction their fan
   * points, so two fans 23° apart can still put a 100px-wide label from one
   * straight across a label from the other. The angular gap needed to guarantee
   * clearance grows with label width and shrinks with radius — at four fans it
   * would take most of the ring, which is not a layout, it is a refusal.
   *
   * So the last word on labels is a collision pass over ALL of them together.
   * Boxes are computed in LAYER data units from the same character-count
   * estimate the row pitch uses — never measured from the DOM, because this runs
   * while the camera is still animating and a measured box would be the wrong
   * size. A colliding label is nudged along SCREEN-vertical, which is what
   * `translate(0, dy)` appended AFTER the counter-rotation gives: at that point
   * in the transform list the local axes are already screen-aligned.
   *
   * Deterministic: labels are processed in a stable order and the nudge is a
   * pure function of the boxes.
   */
  function deCollideFanLabels(
    fanGroups: d3.Selection<SVGGElement, FanDatum, any, unknown>,
    opts: StructuredFocusRenderOptions,
  ) {
    interface Box {
      el: SVGTextElement
      netDeg: number
      x1: number, x2: number, y1: number, y2: number
    }
    const boxes: Box[] = []
    const lineHeight = (f.label.fontSize * f.label.lineHeightFactor) / opts.cameraK
    const estWidth = (label: string) => Math.min(
      f.label.maxWidth,
      label.length * f.label.fontSize * f.label.estCharWidth,
    ) / opts.cameraK

    fanGroups.each(function (fan) {
      const netDeg = rotationDeg + fan.model.clusterAngleDeg + fan.offsetDeg
      const rad = ((fan.model.clusterAngleDeg + fan.offsetDeg) * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const pointsLeft = Math.cos((netDeg * Math.PI) / 180) < 0
      d3.select(this).selectAll<SVGTextElement, any>('text.structured-focus-text')
        .each(function (d: any) {
          const w = estWidth(this.textContent || '')
          // Fan-local anchor → layer coordinates.
          const x = d.anchorX * cos - d.anchorY * sin
          const y = d.anchorX * sin + d.anchorY * cos
          const side = d.anchorMode === 'side'
          const x1 = side ? (pointsLeft ? x - w : x) : x - w / 2
          const y1 = side ? y - lineHeight / 2 : y - lineHeight
          boxes.push({ el: this, netDeg, x1, x2: x1 + w, y1, y2: y1 + lineHeight })
        })
    })

    // Top-down sweep: each label yields to every label already settled above it.
    boxes.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1)
    const settled: Box[] = []
    for (const box of boxes) {
      let shift = 0
      for (const other of settled) {
        const overlapsX = box.x1 < other.x2 && box.x2 > other.x1
        if (!overlapsX) continue
        const top = box.y1 + shift
        if (top < other.y2 && box.y2 + shift > other.y1) shift += other.y2 - top
      }
      if (shift !== 0) {
        box.y1 += shift
        box.y2 += shift
        const el = d3.select(box.el)
        const base = el.attr('transform') || ''
        el.attr('transform', `${base} translate(0, ${shift})`)
      }
      settled.push(box)
    }
  }

  /**
   * The Entity ↔ Entity relationships BETWEEN open clusters.
   *
   * Which entities relate is not decided here: it comes from
   * `deriveCrossClusterEntityPairs`, the one deterministic pairing shared with
   * the Unstructured drill-down, so the same two clusters relate the same two
   * entities in either view and after any reload. Entities of the SAME cluster
   * never connect (the sibling rule, enforced inside that helper), and only
   * clusters that are actually related pair up at all — so these lines appear
   * only while the relevant clusters are open, and vanish with them.
   *
   * Drawn in LAYER space rather than inside a fan, because the two ends live in
   * different fans; each end is read off the mark actually drawn and rotated by
   * its own fan's transform, so a line always lands exactly on the dot it
   * claims to connect.
   */
  function renderCrossClusterRelations(
    fanGroups: d3.Selection<SVGGElement, FanDatum, any, unknown>,
    models: StructuredFocusModel[],
    opts: StructuredFocusRenderOptions,
  ) {
    layer.selectAll('g.structured-focus-relations').remove()
    if (models.length < 2) return

    const positions = new Map<string, { x: number, y: number }>()
    fanGroups.each(function (fan) {
      const rad = ((fan.model.clusterAngleDeg + fan.offsetDeg) * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      d3.select(this).selectAll<SVGCircleElement, any>('circle.structured-focus-leaf')
        .each(function (d: any) {
          const x = Number(this.getAttribute('cx'))
          const y = Number(this.getAttribute('cy'))
          positions.set(d.id, { x: x * cos - y * sin, y: x * sin + y * cos })
        })
    })

    const pairs = deriveCrossClusterEntityPairs(
      models.map(m => ({ clusterId: m.clusterId, entityIds: m.leaves.map(l => l.id) })),
      clustersRelated,
    ).filter(pair => positions.has(pair.aEntityId) && positions.has(pair.bEntityId))
    if (!pairs.length) return

    // Under the fans, so a relation line passes BEHIND the entity dots it joins.
    const group = layer.insert('g', ':first-child')
      .attr('class', 'structured-focus-relations')

    // User-space paint again: a relation can run in any direction, exactly
    // horizontal included, and an object-bounding-box gradient would drop those.
    const reach = Math.max(...models.map(m => m.bounds.contentXMax))
    const gradientId = 'structured-focus-relation-gradient'
    appendUserSpaceLinkGradient(group.append('defs') as any, gradientId, -reach, reach)

    const leafRadius = Math.max(f.leaf.radius, f.leaf.minVisualRadius / opts.cameraK)
    const trim = f.line.endpointGap + leafRadius
    const segmentOf = (pair: { aEntityId: string, bEntityId: string }) => {
      const a = positions.get(pair.aEntityId)!
      const b = positions.get(pair.bEntityId)!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      return {
        x1: a.x + (dx / len) * trim,
        y1: a.y + (dy / len) * trim,
        x2: b.x - (dx / len) * trim,
        y2: b.y - (dy / len) * trim,
      }
    }

    const relations = renderStraightConnections(group, pairs, segmentOf, {
      className: 'structured-focus-relation',
      zoomScale: opts.cameraK,
      stroke: `url(#${gradientId})`,
      // The Unstructured drill-down's own entity ↔ entity language: round dots
      // rather than a solid rule, so a generated relationship never reads as
      // firmly as an ingested one.
      strokeDasharray: EXPANDED_CLUSTER.entityRelation.strokeDasharray,
      strokeLinecap: EXPANDED_CLUSTER.entityRelation.strokeLinecap,
      background: false,
      widthFactor: f.line.widthFactor,
    })

    const relationWidth = getLinkStrokeWidth('default', opts.cameraK) * f.line.widthFactor
    relations.foreground
      .style('pointer-events', 'stroke')
      .on('mouseenter', function () {
        relations.foreground
          .attr('opacity', LINK_STYLING.opacity.hidden)
          .attr('stroke-width', relationWidth)
        d3.select(this)
          .attr('opacity', LINK_STYLING.opacity.hover)
          .attr('stroke-width', relationWidth * 1.3)
      })
      .on('mouseleave', () => {
        relations.foreground
          .attr('opacity', LINK_STYLING.opacity.base)
          .attr('stroke-width', relationWidth)
      })
    relations.foreground.attr('opacity', LINK_STYLING.opacity.base)
  }

  return {
    update,
    destroy(animate: boolean) {
      if (animate) {
        layer.transition().duration(f.transitionMs).attr('opacity', 0)
          .on('end', () => layer.selectAll('*').remove())
      } else {
        layer.selectAll('*').remove()
      }
      restoreOverview(animate)
    },
  }
}
