/**
 * src/components/graphs/structured/structuredHover.ts
 *
 * Hover isolation for the Structured view — ONE rule for every hoverable ring
 * (Cluster, Entity summary, Insight), so node visibility can never disagree
 * with connection highlighting.
 *
 * Source of truth: the FINAL resolved connection set the renderer drew — the
 * RadialConnection datum bound to every `.link-foreground` path, which is the
 * post Cluster → Entity-remap data (renderRadialConnections). Never a second
 * relationship model.
 *
 * Neighborhood of hovered node N:
 *   1. N itself. Clusters and their entity summaries share one id (the
 *      existing identity mapping), so a matching Cluster ↔ Entity pair is
 *      always visible together;
 *   2. every node directly linked to N in the rendered connection set;
 *   3. for each INSIGHT now in the set: every node that insight connects to —
 *      the clusters/entities genuinely on the same visible relationship path.
 *
 * The INVARIANT the bug report demands holds by construction: a connection is
 * emphasized IFF both endpoint ids are in the neighborhood set, and every
 * element's dim state is derived from membership in that same set — so a
 * highlighted line can never end at a dimmed node.
 *
 * All state changes are opacity transitions only (STRUCTURED_HOVER tokens) —
 * no DOM is added or removed, so the radial layout never shifts.
 */

import * as d3 from 'd3'
import { setBridgeBadgeLabelVisible } from './components/renderClusterEntityBridge'
import type { RadialConnection } from './useStructuredGeometry'
import { STRUCTURED_HOVER } from './structuredTokens'

type ViewportSelection = d3.Selection<SVGGElement, unknown, any, unknown>

/**
 * While the Cluster FOCUS drill-down is open (structuredFocus.ts) hover
 * isolation is suspended: the focus owns every opacity in the view, and a
 * hover pass would overwrite its persistent dim. The focus controller flips
 * this flag on open/close.
 */
let hoverSuspended = false
export function setStructuredHoverSuspended(suspended: boolean) {
  hoverSuspended = suspended
}

/**
 * The VISIBLE representative id of a connection endpoint.
 *
 * Many resolved connections terminate at raw entity nodes
 * (`<clusterId>-e<N>`), which are positioned on the entity orbit but never
 * drawn — the visible node the curve lands beside is that entity's OWNING
 * cluster summary. Relationships through a raw entity must therefore light
 * (and be attributed to) the cluster id, otherwise a highlighted line ends at
 * a dimmed cluster — the exact bug this mapping fixes. Every other kind is
 * its own representative.
 */
export function representativeId(node: { id: string, kind: string }): string {
  return node.kind === 'entity' ? node.id.replace(/-e\d+$/, '') : node.id
}

/** Representative kind: a raw entity stands for its cluster summary. */
function representativeKind(node: { kind: string }): string {
  return node.kind === 'entity' ? 'cluster' : node.kind
}

/**
 * Endpoint kinds that resolve to a VISIBLE ring node: clusters (including raw
 * entities, whose representative is their cluster summary) and insights.
 * Source/document hubs are NOT drawn as ring nodes in Structured (the center
 * avatar stands in for them), so a connection touching one — e.g. the
 * auto-generated cluster ↔ hub `overlap` links — can never satisfy the
 * "highlighted line → both visible endpoints active" rule and must never be
 * highlighted nor feed the hover neighborhood.
 */
const VISIBLE_ENDPOINT_KINDS = new Set(['cluster', 'entity', 'insight'])

/**
 * Is this connection worth DRAWING?
 *
 * Two rejections, and both are about the line having no meaning on screen
 * rather than about tidiness:
 *
 *   1. an endpoint that resolves to no visible ring node — the Source and
 *      Document hubs are not drawn in Structured (the centre avatar stands in
 *      for them), so such a line runs from a node to nowhere;
 *   2. a SELF-link — a cluster to its own raw entity. Both ends resolve to the
 *      same visible node, so the line says only that a cluster contains what it
 *      contains, which its own summary already shows.
 *
 * This is the SAME rule that counts a cluster's relationships
 * (computeEntityConnectionCounts), which is what guarantees the promise the
 * counts make: an entity summary reading 0 has no line, because the thing that
 * would have drawn one is the thing that would have counted it.
 */
export function isMeaningfulConnection(
  conn: { sourceNode: { id: string, kind: string }, targetNode: { id: string, kind: string } },
): boolean {
  if (!hasVisibleEndpoints(conn)) return false
  return representativeId(conn.sourceNode) !== representativeId(conn.targetNode)
}

/** True when BOTH endpoints of a connection resolve to visible ring nodes. */
export function hasVisibleEndpoints(conn: { sourceNode: { kind: string }, targetNode: { kind: string } }): boolean {
  return VISIBLE_ENDPOINT_KINDS.has(conn.sourceNode.kind)
    && VISIBLE_ENDPOINT_KINDS.has(conn.targetNode.kind)
}

/**
 * Compute the relationship neighborhood of any hovered node from the rendered
 * connection set (see module header for the exact definition). All ids in the
 * returned set are VISIBLE representative ids (see representativeId), so the
 * set can be compared directly against rendered-element datum ids.
 */
export function computeHoverNeighborhood(
  connections: RadialConnection[],
  nodeId: string,
): Set<string> {
  const related = new Set<string>([nodeId])
  const kindById = new Map<string, string>()

  // 1-hop: direct neighbors of the hovered node, in representative id space —
  // hovering a cluster also owns its raw entities' connections, and a
  // connection landing on a raw entity relates its visible cluster. This
  // covers DIRECT cluster ↔ cluster relationships too. Connections touching
  // an invisible hub are skipped entirely (see hasVisibleEndpoints).
  for (const conn of connections) {
    if (!hasVisibleEndpoints(conn)) continue
    const sourceId = representativeId(conn.sourceNode)
    const targetId = representativeId(conn.targetNode)
    kindById.set(sourceId, representativeKind(conn.sourceNode))
    kindById.set(targetId, representativeKind(conn.targetNode))
    if (sourceId === nodeId) related.add(targetId)
    if (targetId === nodeId) related.add(sourceId)
  }

  // 2-hop through every INSIGHT already in the set (for an insight hover this
  // includes the hovered insight itself): nodes sharing those insights are on
  // the same visible relationship path.
  const relatedInsights = new Set<string>()
  for (const id of related) {
    if (kindById.get(id) === 'insight') relatedInsights.add(id)
  }
  for (const conn of connections) {
    if (!hasVisibleEndpoints(conn)) continue
    if (relatedInsights.has(representativeId(conn.sourceNode))) related.add(representativeId(conn.targetNode))
    if (relatedInsights.has(representativeId(conn.targetNode))) related.add(representativeId(conn.sourceNode))
  }

  return related
}

/**
 * Apply (nodeId) or clear (null) the hover isolation across every Structured
 * layer. Elements are matched through their bound datum: cluster groups /
 * label groups / entity elements / bridges carry the cluster node datum;
 * connection paths carry RadialConnection.
 */
export function applyStructuredHoverIsolation(
  viewportGroup: ViewportSelection,
  nodeId: string | string[] | null,
) {
  if (hoverSuspended) return
  /*
   * An ARRAY of ids isolates the union of their neighborhoods — the external
   * reference-highlight uses this for Source/Document hubs, which are not
   * drawn as ring nodes in Structured: the hub's representation here IS its
   * set of cluster neighborhoods, so a hub reference lights all of them.
   * Pointer hover keeps passing a single id; nothing changes for it.
   */
  const ids = nodeId === null ? null : Array.isArray(nodeId) ? nodeId : [nodeId]
  // Bridge badges: the hovered cluster's badge expands to reveal its
  // percentage label; every other badge is (or returns to) indicator-only.
  setBridgeBadgeLabelVisible(viewportGroup, ids && ids.length === 1 ? ids[0] : null)
  const { transitionMs, related: relatedOpacity, dimmedNode, hiddenInsight, connection } = STRUCTURED_HOVER
  const fade = <S extends d3.Selection<any, any, any, any>>(sel: S) =>
    sel.transition().duration(transitionMs) as any

  if (ids === null || ids.length === 0) {
    // ── RESTORE: every ring back to its normal resting state ────────────────
    fade(viewportGroup.selectAll('.link-foreground')).style('opacity', connection.fgBase)
    fade(viewportGroup.selectAll('.link-background')).style('opacity', connection.bgBase)
    fade(viewportGroup.selectAll(
      'g.cluster-node-group, g.cluster-label-group, '
      + '.entity-node, .entity-node-base, .entity-node-highlight, .entity-count, '
      + '.insight-node, .cluster-entity-bridge, g.cluster-entity-badge',
    )).style('opacity', relatedOpacity)
    return
  }

  // The live resolved connection set — exactly what the renderer drew.
  const connections = viewportGroup.selectAll('.link-foreground').data() as RadialConnection[]
  const related = new Set<string>()
  for (const id of ids) {
    for (const rep of computeHoverNeighborhood(connections, id)) related.add(rep)
  }

  // Phase 1 — the FINAL highlighted connection set: both endpoints resolve to
  // VISIBLE ring nodes, both representatives are in the neighborhood, AND the
  // two representatives differ. A connection to an invisible hub can never be
  // highlighted (no lit line ending at a phantom point on the ring), and a
  // SELF-link (a cluster to its own raw entity — both representatives are the
  // same summary) is never highlighted either: its raw-entity endpoint gets
  // perimeter-clamped onto whatever NEIGHBORING summary circle it falls
  // inside, so lighting it draws what looks like a direct line attached to an
  // unrelated, dimmed cluster — the browser-visible bug this rule fixes.
  // (The cluster ↔ its-own-summary relationship is already drawn by the
  // bridge, so nothing meaningful is lost.)
  const connActive = (d: any) => {
    if (!d?.sourceNode || !d?.targetNode || !hasVisibleEndpoints(d)) return false
    const sourceRep = representativeId(d.sourceNode)
    const targetRep = representativeId(d.targetNode)
    return sourceRep !== targetRep
      && related.has(sourceRep)
      && related.has(targetRep)
  }

  // Phase 2 — the ACTIVE node set is derived FROM that highlighted set: the
  // hovered node plus every highlighted connection's visible endpoints. This
  // makes the hard rule definitional, not incidental:
  //   highlighted connection → both visible endpoints = full opacity.
  const active = new Set<string>(ids)
  for (const conn of connections) {
    if (!connActive(conn)) continue
    active.add(representativeId(conn.sourceNode))
    active.add(representativeId(conn.targetNode))
  }

  const nodeOpacity = (d: any) => (active.has(d?.id) ? relatedOpacity : dimmedNode)

  // Connections: emphasized on the relationship path, near-zero otherwise
  fade(viewportGroup.selectAll('.link-foreground'))
    .style('opacity', (d: any) => (connActive(d) ? connection.fgActive : connection.fgHidden))
  fade(viewportGroup.selectAll('.link-background'))
    .style('opacity', (d: any) => (connActive(d) ? connection.bgActive : connection.bgHidden))

  // Clusters (circle + icon move as one group) and their radial labels
  fade(viewportGroup.selectAll('g.cluster-node-group')).style('opacity', nodeOpacity)
  fade(viewportGroup.selectAll('g.cluster-label-group')).style('opacity', nodeOpacity)

  // Entity summaries (same id space as clusters) + their base/count/highlight
  fade(viewportGroup.selectAll('.entity-node, .entity-node-base, .entity-node-highlight, .entity-count'))
    .style('opacity', nodeOpacity)

  // Cluster → Entity bridges and confidence badges follow their cluster
  fade(viewportGroup.selectAll('.cluster-entity-bridge, g.cluster-entity-badge'))
    .style('opacity', nodeOpacity)

  // Insights: active stay fully visible, unrelated effectively hidden
  fade(viewportGroup.selectAll('.insight-node'))
    .style('opacity', (d: any) => (active.has(d?.id) ? relatedOpacity : hiddenInsight))
}
