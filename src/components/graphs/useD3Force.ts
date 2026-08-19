/**
 * src/components/graphs/useD3Force.ts
 *
 * Force-directed graph simulation using D3.
 * All physics parameters sourced from graphTokens.ts - no hardcoded values.
 *
 * CRITICAL RULE: Clusters belong to Sources.
 * Source→Cluster links (kind='overlap') use stronger forces to keep clusters bound to their source.
 * Clusters form a neighborhood around their source and must never be pulled away.
 *
 * Two layout refinements on top of the classic forces:
 *
 * 1. CLUSTER ORBIT (custom force): each hub's clusters are eased into even
 *    angular slots on a consistent radius around that hub, so neighborhoods
 *    read as clean radial fans instead of piles, and Source→Cluster lines
 *    get clear radial paths. The pull is deliberately gentle (× alpha) — the
 *    graph stays force-directed and drag stays natural; this only organizes,
 *    never pins.
 *
 * 2. CROSS-GROUP LINK CLASS: links that run through an Insight or directly
 *    bridge different hub neighborhoods get a shorter desired distance and a
 *    higher strength than generic links, keeping related groups noticeably
 *    closer together without collapsing distinct groups into each other.
 */

import * as d3 from 'd3'
import type { NetworkNode, NetworkLink } from '@/components/charts'
import { FORCE_SIMULATION, getEffectiveNodeRadius } from './graphTokens'

export interface ForceSimulationConfig {
  width: number
  height: number
  nodeStrength?: number
  linkStrength?: number
  chargeStrength?: number
}

/**
 * The hub a cluster was generated around: its id minus the `-s<N>` generation
 * suffix (graphWorkspace's ring(): id = `${hub.id}-s${i}`). Same convention
 * the Structured renderer resolves icons with — handles hub ids that contain
 * dashes or spaces ("Google Drive-s3" → "Google Drive").
 */
function clusterOwnerId(clusterId: string): string {
  return clusterId.replace(/-s\d+$/, '')
}

/**
 * The neighborhood a node belongs to, for cross-group link classification:
 * clusters → their owning hub; hubs (source/document) → themselves;
 * insights and anything else → none.
 */
function groupOf(node: any): string | null {
  if (!node || typeof node !== 'object') return null
  if (node.kind === 'cluster') return clusterOwnerId(node.id)
  if (node.kind === 'source' || node.kind === 'document') return node.id
  return null
}

/**
 * Classify a link for distance/strength:
 * - 'bond'       — Source→Cluster ownership (kind='overlap'), the strongest tie
 * - 'crossGroup' — runs through an Insight, or directly bridges two different
 *                  hub neighborhoods; pulled tighter so related groups stay close
 * - 'default'    — everything else
 */
function linkClass(link: any): 'bond' | 'crossGroup' | 'default' {
  if (link.kind === 'overlap') return 'bond'
  const s = link.source
  const t = link.target
  // Accessors run after forceLink resolves ids to node objects; guard anyway.
  if (typeof s !== 'object' || typeof t !== 'object') return 'default'
  if (s.kind === 'insight' || t.kind === 'insight') return 'crossGroup'
  const gs = groupOf(s)
  const gt = groupOf(t)
  if (gs && gt && gs !== gt) return 'crossGroup'
  return 'default'
}

/**
 * Custom D3 force: eases every cluster toward an even angular slot on a
 * consistent orbit around its OWN hub.
 *
 * Slots are assigned once, at initialize, in each cluster's CURRENT angular
 * order around its hub and anchored at the first cluster's current angle —
 * so clusters slide the short way into place and orbits never cross each
 * other while settling. Targets are recomputed from the hub's live position
 * every tick, so a dragged hub carries its whole ring along.
 */
/** A hub plus the radius of the neighborhood it occupies. */
interface HubEnvelope { node: any, envelope: number }

/**
 * GROUP ENVELOPE per hub — the real footprint of a neighborhood: the cluster
 * orbit radius plus the largest of that hub's clusters' ACTUAL (weight-sized)
 * radii, or just the hub's own circle when it has no clusters.
 *
 * One definition, four consumers (hub separation, insight↔envelope
 * separation, community clearance, and the initial pre-solve) — they must
 * agree, or a position that satisfies one force gets pushed out by another.
 */
function buildHubEnvelopes(nodes: any[]): HubEnvelope[] {
  const maxClusterRadius = new Map<string, number>()
  for (const n of nodes) {
    if (n.kind !== 'cluster') continue
    const owner = clusterOwnerId(n.id)
    maxClusterRadius.set(owner, Math.max(maxClusterRadius.get(owner) || 0, getEffectiveNodeRadius(n, 1)))
  }
  return nodes
    .filter((n: any) => n.kind === 'source' || n.kind === 'document')
    .map((node: any) => ({
      node,
      envelope: maxClusterRadius.has(node.id)
        ? FORCE_SIMULATION.clusterOrbitRadius + maxClusterRadius.get(node.id)!
        : getEffectiveNodeRadius(node, 1),
    }))
}

/**
 * Custom D3 force: keeps hub GROUPS from merging. Pairwise repulsion between
 * hub nodes (source/document) only, active only below minDistance — so the
 * center gravity can compact the overall graph while neighborhoods stay
 * distinct. O(hubs²) per tick with ~18 hubs: negligible.
 */
function forceHubSeparation(groupGap: number, strength: number) {
  let hubs: HubEnvelope[] = []

  const force = (alpha: number) => {
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < hubs.length; j++) {
        const a = hubs[i]
        const b = hubs[j]
        const minDistance = a.envelope + b.envelope + groupGap
        const dx = (b.node.x || 0) - (a.node.x || 0)
        const dy = (b.node.y || 0) - (a.node.y || 0)
        const dist = Math.hypot(dx, dy) || 1
        if (dist >= minDistance) continue
        const push = ((minDistance - dist) / dist) * strength * alpha
        a.node.vx = (a.node.vx || 0) - dx * push
        a.node.vy = (a.node.vy || 0) - dy * push
        b.node.vx = (b.node.vx || 0) + dx * push
        b.node.vy = (b.node.vy || 0) + dy * push
      }
    }
  }

  force.initialize = (nodes: any[]) => {
    hubs = buildHubEnvelopes(nodes)
  }

  return force
}

/**
 * What it costs for a link to pass this close to a circle it should clear.
 *
 * GRADED, not flat: a link grazing the clearance ring and a link cutting
 * straight through a node's center are not the same defect, and a flat
 * penalty makes them indistinguishable — which matters exactly when the
 * topology is over-constrained (a cluster whose two insights sit on opposite
 * sides of its own ring, where SOME link must pass close to something). The
 * grade is what lets the optimizer pick the least-bad slot instead of an
 * arbitrary one. Full π at dead-center, tending to 0 at the clearance edge,
 * so any real clip still outweighs angular preference.
 */
function clipCostFor(distance: number, clearance: number): number {
  if (distance >= clearance) return 0
  return Math.PI * ((clearance - distance) / clearance)
}

/** Shortest signed angular difference a→b, in (−π, π]. */
function angleDelta(a: number, b: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d <= -Math.PI) d += 2 * Math.PI
  return d
}

/**
 * Custom D3 force: connection-aware Insight placement. Each insight eases
 * toward the barycenter of its LIVE link partners, so it settles between the
 * groups it bridges — minimizing total straight-link length and keeping the
 * link corridor clear of unrelated neighborhoods. The collision force pushes
 * it to the nearest free position when the exact barycenter is occupied, and
 * the cluster-orbit slot logic (which reads these live positions) then turns
 * connected clusters to face it: Source → Cluster → Insight → target aligns
 * as one chain instead of three independent placements.
 */
function forceInsightBarycenter(
  strength: number,
  links: NetworkLink[] = [],
  anchorBias = 0,
) {
  let insights: Array<{ node: any, partners: any[], anchor: any | null }> = []

  const force = (alpha: number) => {
    for (const { node, partners, anchor } of insights) {
      if (!partners.length) continue
      let bx = 0
      let by = 0
      for (const p of partners) {
        bx += (p.x || 0)
        by += (p.y || 0)
      }
      bx /= partners.length
      by /= partners.length
      /*
       * Lean toward the ANCHOR group — one of this insight's own connected
       * groups, chosen so that insights sharing partners do not all resolve to
       * the same point. Pure barycentre put every insight over the same busy
       * middle; blending toward a distinct partner spreads them WITHOUT moving
       * any insight away from a region it is genuinely connected to.
       */
      if (anchor) {
        bx += ((anchor.x || 0) - bx) * anchorBias
        by += ((anchor.y || 0) - by) * anchorBias
      }
      node.vx = (node.vx || 0) + (bx - (node.x || 0)) * strength * alpha
      node.vy = (node.vy || 0) + (by - (node.y || 0)) * strength * alpha
    }
  }

  force.initialize = (nodes: any[]) => {
    const nodeById = new Map<string, any>(nodes.map((n: any) => [n.id, n]))
    const endpointNode = (endpoint: any) =>
      typeof endpoint === 'string' ? nodeById.get(endpoint) : nodeById.get(endpoint?.id)
    const partnersById = new Map<string, any[]>()
    for (const link of links) {
      const s = endpointNode(link.source)
      const t = endpointNode(link.target)
      if (!s || !t) continue
      for (const [me, other] of [[s, t], [t, s]] as Array<[any, any]>) {
        if (me.kind !== 'insight') continue
        if (!partnersById.has(me.id)) partnersById.set(me.id, [])
        partnersById.get(me.id)!.push(other)
      }
    }
    /*
     * ── ANCHOR ASSIGNMENT — deterministic, and a spread by construction ─────
     *
     * Each insight is assigned ONE of the hub groups it actually connects to,
     * picking the least-subscribed one at the time of assignment. Insights are
     * processed in sorted id order, so the result is identical on every reload
     * and every machine — no randomness, no time dependence.
     *
     * Because each choice updates the load counts, two insights over the same
     * pair of groups take DIFFERENT anchors rather than stacking. An insight
     * with a single connected group keeps that group — the spread never invents
     * a relationship, it only chooses among real ones.
     */
    const hubById = new Map<string, any>(
      nodes.filter((n: any) => n.kind === 'source' || n.kind === 'document')
        .map((n: any) => [n.id, n]),
    )
    const load = new Map<string, number>()
    const anchorById = new Map<string, any>()
    const sorted = nodes
      .filter((n: any) => n.kind === 'insight')
      .slice()
      .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))
    for (const insight of sorted) {
      const groups = [...new Set(
        (partnersById.get(insight.id) || [])
          .map((partner: any) => groupOf(partner))
          .filter((g): g is string => !!g && hubById.has(g)),
      )].sort()
      if (!groups.length) continue
      let best = groups[0]
      for (const g of groups) {
        if ((load.get(g) ?? 0) < (load.get(best) ?? 0)) best = g
      }
      load.set(best, (load.get(best) ?? 0) + 1)
      anchorById.set(insight.id, hubById.get(best))
    }

    insights = nodes
      .filter((n: any) => n.kind === 'insight')
      .map((node: any) => ({
        node,
        partners: partnersById.get(node.id) || [],
        anchor: anchorById.get(node.id) ?? null,
      }))
  }

  return force
}

/**
 * Custom D3 force: INSIGHT ↔ INSIGHT separation.
 *
 * The generic charge keeps every node apart by the same rule, which is not
 * enough here — insights are the sparse, high-value marks in the view, and two
 * of them landing on top of each other reads as one. This pushes any pair
 * closer than `minDistance` apart along their own axis, symmetrically, so
 * neither is favoured and no other kind is disturbed.
 */
function forceInsightSeparation(minDistance: number, strength: number) {
  let insights: any[] = []

  const force = (alpha: number) => {
    for (let i = 0; i < insights.length; i++) {
      for (let j = i + 1; j < insights.length; j++) {
        const a = insights[i]
        const b = insights[j]
        const dx = (b.x || 0) - (a.x || 0)
        const dy = (b.y || 0) - (a.y || 0)
        const dist = Math.hypot(dx, dy) || 1
        if (dist >= minDistance) continue
        // Half to each, so a pair separates without either being shoved.
        const push = ((minDistance - dist) / dist) * strength * alpha * 0.5
        a.vx = (a.vx || 0) - dx * push
        a.vy = (a.vy || 0) - dy * push
        b.vx = (b.vx || 0) + dx * push
        b.vy = (b.vy || 0) + dy * push
      }
    }
  }

  force.initialize = (nodes: any[]) => {
    insights = nodes.filter((n: any) => n.kind === 'insight')
  }

  return force
}

function forceClusterOrbit(radius: number, strength: number, links: NetworkLink[] = []) {
  interface Orbiter {
    node: any
    hub: any
    targetAngle: number
    /** External link partners (insights / other groups) — live node refs. */
    externalTargets: any[]
  }
  let orbiters: Orbiter[] = []
  let hubGroups: Array<{ hub: any, members: Orbiter[], hubExternal: any[] }> = []
  let tickCount = 0

  /**
   * CONNECTION-AWARE SLOT ASSIGNMENT. Slots stay evenly spaced on the orbit;
   * what changes is WHICH cluster owns which slot:
   *
   * 1. Every cluster with external connections gets a PREFERRED angle: the
   *    direction from its hub toward the barycenter of its external partners
   *    (live positions — insights, other groups' clusters/hubs).
   * 2. Externally-connected clusters claim slots first (most-connected
   *    first), each taking the free slot with the least angular deviation
   *    from its preference — so the cluster responsible for a cross-group
   *    link sits on the edge of its neighborhood FACING the other group and
   *    its straight link never has to cut back through its own siblings.
   * 3. Clusters without external connections fill the remaining slots,
   *    nearest their current angle (minimal movement).
   *
   * Re-run periodically (not per tick): target groups drift while the
   * simulation settles and after drags, so preferences must track them, but
   * per-tick churn would fight the easing.
   */
  const assignSlots = () => {
    for (const { hub, members, hubExternal } of hubGroups) {
      const n = members.length
      if (!n) continue

      // ── EXACTLY 2 CLUSTERS: compact V, not a flat opposition ────────────
      // The V's bisector faces the pair's external connections (clusters'
      // partners first, the hub's own external partners as fallback, the
      // pair's current mean angle as last resort) — never hardcoded.
      if (n === 2) {
        const vHalf = (FORCE_SIMULATION.twoClusterVAngleDeg * Math.PI / 180) / 2
        const pool: any[] = [
          ...members[0].externalTargets,
          ...members[1].externalTargets,
        ]
        const anchors = pool.length ? pool : (hubExternal.length ? hubExternal : null)
        let dir: number
        if (anchors) {
          let bx = 0
          let by = 0
          for (const a of anchors) {
            bx += (a.x || 0)
            by += (a.y || 0)
          }
          dir = Math.atan2(by / anchors.length - (hub.y || 0), bx / anchors.length - (hub.x || 0))
        } else {
          const a0 = Math.atan2((members[0].node.y || 0) - (hub.y || 0), (members[0].node.x || 0) - (hub.x || 0))
          const a1 = Math.atan2((members[1].node.y || 0) - (hub.y || 0), (members[1].node.x || 0) - (hub.x || 0))
          dir = a0 + angleDelta(a0, a1) / 2
        }
        // Give each cluster the arm nearer its current side of the bisector
        const arms = [dir - vHalf, dir + vHalf]
        const curr0 = Math.atan2((members[0].node.y || 0) - (hub.y || 0), (members[0].node.x || 0) - (hub.x || 0))
        const keepOrder = angleDelta(dir, curr0) <= 0
        members[0].targetAngle = keepOrder ? arms[0] : arms[1]
        members[1].targetAngle = keepOrder ? arms[1] : arms[0]
        continue
      }

      const step = (2 * Math.PI) / n
      const slotAngle = (i: number) => i * step
      const free = new Set<number>(Array.from({ length: n }, (_, i) => i))

      const connected = members.filter(m => m.externalTargets.length > 0)
        .sort((a, b) => b.externalTargets.length - a.externalTargets.length)
      const unconnected = members.filter(m => m.externalTargets.length === 0)

      // Preferred angle per member: external barycenter direction for
      // connected clusters, current angle for the rest.
      const preferredOf = (m: Orbiter): number => {
        if (m.externalTargets.length) {
          let bx = 0
          let by = 0
          for (const t of m.externalTargets) {
            bx += (t.x || 0)
            by += (t.y || 0)
          }
          bx /= m.externalTargets.length
          by /= m.externalTargets.length
          return Math.atan2(by - (hub.y || 0), bx - (hub.x || 0))
        }
        return Math.atan2((m.node.y || 0) - (hub.y || 0), (m.node.x || 0) - (hub.x || 0))
      }

      // Slot cost = angular deviation from preference, PLUS a heavy penalty
      // when the straight link from that slot to the member's external
      // barycenter would clip a SIBLING's slot position OR the member's OWN
      // HUB — this is what stops a cluster's cross-group link from cutting
      // through its own ring, or reaching its insight straight across the
      // Source it belongs to (a cluster parked on the far side of its hub).
      const slotPos = (slot: number) => ({
        x: (hub.x || 0) + Math.cos(slotAngle(slot)) * radius,
        y: (hub.y || 0) + Math.sin(slotAngle(slot)) * radius,
      })
      // Every slot on the ring ends up occupied, so a slot's outgoing line is
      // tested against ALL other slots — not only the ones claimed so far.
      // Order-independent, which is what keeps the greedy pass from having to
      // be lucky. The occupant of a not-yet-claimed slot is unknown, so the
      // group's largest cluster radius is used: conservative, never optimistic.
      const maxMemberRadius = members.reduce(
        (max, m) => Math.max(max, getEffectiveNodeRadius(m.node, 1)), 0)
      const blockersFor = (slot: number) => {
        const list = [{
          x: hub.x || 0,
          y: hub.y || 0,
          clear: getEffectiveNodeRadius(hub, 1) + FORCE_SIMULATION.seedCrossingClearance,
        }]
        for (let other = 0; other < n; other++) {
          if (other === slot) continue
          list.push({
            ...slotPos(other),
            clear: maxMemberRadius + FORCE_SIMULATION.seedCrossingClearance,
          })
        }
        return list
      }
      const clipPenalty = (m: Orbiter, slot: number): number => {
        if (!m.externalTargets.length) return 0
        const p0 = slotPos(slot)
        let penalty = 0
        // Test the line to EVERY individual external target — that is what
        // actually gets drawn (one straight link per target), so a clear
        // barycenter direction must never excuse a clipping individual link.
        for (const target of m.externalTargets) {
          for (const b of blockersFor(slot)) {
            const dist = pointSegmentDistance(b.x, b.y, p0.x, p0.y, target.x || 0, target.y || 0)
            if (dist < b.clear) penalty += clipCostFor(dist, b.clear)
          }
        }
        return penalty
      }

      // Greedy claim (connected first), then swap-repair sweeps that trade
      // slots between members whenever it lowers total deviation + clipping.
      const assigned = new Map<Orbiter, number>()
      for (const m of [...connected, ...unconnected]) {
        const preferred = preferredOf(m)
        let bestSlot = -1
        let bestCost = Infinity
        for (const slot of free) {
          const cost = Math.abs(angleDelta(preferred, slotAngle(slot))) + clipPenalty(m, slot)
          if (cost < bestCost) {
            bestCost = cost
            bestSlot = slot
          }
        }
        free.delete(bestSlot)
        assigned.set(m, bestSlot)
      }

      const memberCost = (m: Orbiter, slot: number): number =>
        Math.abs(angleDelta(preferredOf(m), slotAngle(slot))) + clipPenalty(m, slot)
      for (let sweep = 0; sweep < 3; sweep++) {
        let improved = false
        const list = [...assigned.keys()]
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i]
            const b = list[j]
            const sa = assigned.get(a)!
            const sb = assigned.get(b)!
            const before = memberCost(a, sa) + memberCost(b, sb)
            assigned.set(a, sb)
            assigned.set(b, sa)
            const after = memberCost(a, sb) + memberCost(b, sa)
            if (after + 1e-6 < before) {
              improved = true
            } else {
              assigned.set(a, sa)
              assigned.set(b, sb)
            }
          }
        }
        if (!improved) break
      }

      for (const [m, slot] of assigned) m.targetAngle = slotAngle(slot)
    }
  }

  const force = (alpha: number) => {
    // Refresh assignments periodically so preferences follow the moving
    // layout (and re-settle after drags) without per-tick churn.
    if (tickCount % 25 === 0) assignSlots()
    tickCount++

    for (const { node, hub, targetAngle } of orbiters) {
      const tx = (hub.x || 0) + Math.cos(targetAngle) * radius
      const ty = (hub.y || 0) + Math.sin(targetAngle) * radius
      node.vx = (node.vx || 0) + (tx - (node.x || 0)) * strength * alpha
      node.vy = (node.vy || 0) + (ty - (node.y || 0)) * strength * alpha
    }
  }

  force.initialize = (nodes: any[]) => {
    const nodeById = new Map<string, any>(nodes.map((n: any) => [n.id, n]))
    const byHub = new Map<string, any[]>()
    for (const n of nodes) {
      if (n.kind !== 'cluster') continue
      const hubId = clusterOwnerId(n.id)
      if (!nodeById.has(hubId)) continue // hub filtered out → no orbit to keep
      if (!byHub.has(hubId)) byHub.set(hubId, [])
      byHub.get(hubId)!.push(n)
    }

    // External partners per cluster: link endpoints outside the cluster's own
    // neighborhood (not its hub, not a sibling). Links may arrive with string
    // ids or resolved objects — resolve against OUR node set either way.
    const endpointNode = (endpoint: any) =>
      typeof endpoint === 'string' ? nodeById.get(endpoint) : nodeById.get(endpoint?.id)
    const externalByCluster = new Map<string, any[]>()
    const externalByHub = new Map<string, any[]>()
    for (const link of links) {
      const s = endpointNode(link.source)
      const t = endpointNode(link.target)
      if (!s || !t) continue
      for (const [me, other] of [[s, t], [t, s]] as Array<[any, any]>) {
        if (me.kind === 'cluster') {
          const myHub = clusterOwnerId(me.id)
          const otherGroup = other.kind === 'cluster' ? clusterOwnerId(other.id) : other.id
          if (otherGroup === myHub) continue // own hub / sibling — not external
          if (!externalByCluster.has(me.id)) externalByCluster.set(me.id, [])
          externalByCluster.get(me.id)!.push(other)
        } else if (me.kind === 'source' || me.kind === 'document') {
          // The hub's own external partners (insights, other groups) — the
          // fallback anchor for orienting a two-cluster V.
          const otherGroup = other.kind === 'cluster' ? clusterOwnerId(other.id) : other.id
          if (otherGroup === me.id) continue // its own cluster
          if (!externalByHub.has(me.id)) externalByHub.set(me.id, [])
          externalByHub.get(me.id)!.push(other)
        }
      }
    }

    orbiters = []
    hubGroups = []
    for (const [hubId, clusters] of byHub) {
      const hub = nodeById.get(hubId)
      const members: Orbiter[] = clusters.map(node => ({
        node,
        hub,
        targetAngle: Math.atan2((node.y || 0) - (hub.y || 0), (node.x || 0) - (hub.x || 0)),
        externalTargets: externalByCluster.get(node.id) || [],
      }))
      orbiters.push(...members)
      hubGroups.push({ hub, members, hubExternal: externalByHub.get(hubId) || [] })
    }
    tickCount = 0
    assignSlots()
  }

  return force
}

/**
 * Custom D3 force: keeps every INSIGHT off every straight link it is not an
 * endpoint of.
 *
 * The pre-solve places insights clear of other connections, but the pre-solve
 * only owns the starting state — link geometry keeps moving as the graph
 * settles and after every drag, and nothing else in the force set has any
 * concept of a node sitting ON a line. Collision separates node from NODE; a
 * link is not a node, so an insight could drift across a corridor between two
 * nodes that are themselves perfectly spaced.
 *
 * Only the insight moves, perpendicular to the segment (the cheapest way out)
 * and as a positional projection, so link tension can't hold it on the line at
 * equilibrium. Links stay perfectly straight — this moves an endpoint's
 * neighbour, never the line.
 */
function forceInsightLinkClearance(clearance: number, strength: number, links: NetworkLink[] = []) {
  let insights: any[] = []
  let segments: Array<{ a: any, b: any }> = []

  const force = (_alpha: number) => {
    for (const insight of insights) {
      const r = getEffectiveNodeRadius(insight, 1) + clearance
      for (const { a, b } of segments) {
        if (a === insight || b === insight) continue
        const ax = a.x || 0
        const ay = a.y || 0
        const dx = (b.x || 0) - ax
        const dy = (b.y || 0) - ay
        const L2 = dx * dx + dy * dy
        if (!L2) continue
        const px = insight.x || 0
        const py = insight.y || 0
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
        const nx = px - (ax + t * dx)
        const ny = py - (ay + t * dy)
        const dist = Math.hypot(nx, ny)
        if (dist >= r) continue
        // Dead-center on the line: no perpendicular to read, so use the
        // segment's own normal — deterministic, and always a way out.
        const ux = dist > 1e-6 ? nx / dist : -dy / Math.sqrt(L2)
        const uy = dist > 1e-6 ? ny / dist : dx / Math.sqrt(L2)
        const push = (r - dist) * strength
        insight.x = px + ux * push
        insight.y = py + uy * push
      }
    }
  }

  force.initialize = (nodes: any[]) => {
    const nodeById = new Map<string, any>(nodes.map((n: any) => [n.id, n]))
    const endpointNode = (endpoint: any) =>
      typeof endpoint === 'string' ? nodeById.get(endpoint) : nodeById.get(endpoint?.id)
    insights = nodes.filter((n: any) => n.kind === 'insight')
    segments = []
    for (const link of links) {
      const a = endpointNode(link.source)
      const b = endpointNode(link.target)
      if (a && b && a !== b) segments.push({ a, b })
    }
  }

  return force
}

/**
 * Custom D3 force: multi-group insight COMMUNITIES. An insight whose link
 * partners span 3+ different hub groups defines a local subgraph:
 *
 * - its MEMBER hubs are gently pulled toward the insight, so the connected
 *   groups pack around it (forceHubSeparation still floors their pairwise
 *   distance — they get close, never merged);
 * - UNRELATED hubs are pushed out of the corridor: their center must stay
 *   at least (envelope + communityClearance) from the insight, so an
 *   uninvolved group can never sit between the connected groups and block
 *   the straight links.
 *
 * Group membership is derived once from the link set; positions are read
 * live every tick.
 */
function forceInsightCommunities(
  pullStrength: number,
  clearance: number,
  repelStrength: number,
  links: NetworkLink[] = [],
) {
  interface Community { insight: any, memberHubs: any[], outsiders: Array<{ node: any, envelope: number }> }
  let communities: Community[] = []

  const force = (alpha: number) => {
    for (const { insight, memberHubs, outsiders } of communities) {
      const ix = insight.x || 0
      const iy = insight.y || 0
      // Members: gentle pull toward the community's insight
      for (const hub of memberHubs) {
        hub.vx = (hub.vx || 0) + (ix - (hub.x || 0)) * pullStrength * alpha
        hub.vy = (hub.vy || 0) + (iy - (hub.y || 0)) * pullStrength * alpha
      }
      // Outsiders: keep their whole envelope out of the corridor
      for (const { node, envelope } of outsiders) {
        const dx = (node.x || 0) - ix
        const dy = (node.y || 0) - iy
        const dist = Math.hypot(dx, dy) || 1
        const minDist = envelope + clearance
        if (dist >= minDist) continue
        const push = ((minDist - dist) / dist) * repelStrength * alpha
        node.vx = (node.vx || 0) + dx * push
        node.vy = (node.vy || 0) + dy * push
      }
    }
  }

  force.initialize = (nodes: any[]) => {
    const nodeById = new Map<string, any>(nodes.map((n: any) => [n.id, n]))
    const endpointNode = (endpoint: any) =>
      typeof endpoint === 'string' ? nodeById.get(endpoint) : nodeById.get(endpoint?.id)

    // Hub envelopes (orbit + biggest cluster), for the outsider clearance
    const envelopes = buildHubEnvelopes(nodes)
    const envelopeOf = (hub: any) => envelopes.find(e => e.node === hub)?.envelope
      ?? getEffectiveNodeRadius(hub, 1)

    // Which hub groups does each insight touch?
    const groupsByInsight = new Map<string, Set<string>>()
    for (const link of links) {
      const s = endpointNode(link.source)
      const t = endpointNode(link.target)
      if (!s || !t) continue
      for (const [me, other] of [[s, t], [t, s]] as Array<[any, any]>) {
        if (me.kind !== 'insight') continue
        const g = groupOf(other)
        if (!g) continue
        if (!groupsByInsight.has(me.id)) groupsByInsight.set(me.id, new Set())
        groupsByInsight.get(me.id)!.add(g)
      }
    }

    const hubs = nodes.filter((n: any) => n.kind === 'source' || n.kind === 'document')
    communities = []
    for (const [insightId, groups] of groupsByInsight) {
      if (groups.size < 3) continue
      const insight = nodeById.get(insightId)
      if (!insight) continue
      communities.push({
        insight,
        memberHubs: hubs.filter((h: any) => groups.has(h.id)),
        outsiders: hubs
          .filter((h: any) => !groups.has(h.id))
          .map((node: any) => ({ node, envelope: envelopeOf(node) })),
      })
    }
  }

  return force
}

/**
 * Custom D3 force: keeps every INSIGHT outside every Source-group envelope.
 * The Source orbit is reserved for that hub's clusters — an insight that
 * drifts inside the ring reads as a fake satellite. For each insight × hub
 * pair the insight's center must stay at least
 * (envelope + insightEnvelopeGap + insight radius) from the hub center,
 * where envelope = cluster orbit radius + the hub's largest cluster radius.
 * Only the insight is pushed (radially outward), so group positions and
 * spacing are untouched. Runs after the barycenter pull and overpowers it
 * near a ring, so insights settle just OUTSIDE the envelope on the side of
 * their partners — between their connected groups when there are several.
 */
function forceInsightEnvelopeSeparation(gap: number, strength: number) {
  let insights: any[] = []
  let hubs: HubEnvelope[] = []

  const force = (_alpha: number) => {
    for (const insight of insights) {
      const insightR = getEffectiveNodeRadius(insight, 1)
      for (const { node: hub, envelope } of hubs) {
        const minDist = envelope + gap + insightR
        const dx = (insight.x || 0) - (hub.x || 0)
        const dy = (insight.y || 0) - (hub.y || 0)
        const dist = Math.hypot(dx, dy) || 1
        if (dist >= minDist) continue
        // POSITIONAL constraint, not a velocity nudge: link tension toward
        // far-side clusters can out-pull any velocity force as alpha decays,
        // leaving the insight parked inside the ring. Projecting the
        // position out by `strength` of the penetration per tick (the
        // forceCollide technique) converges regardless of alpha and cannot
        // be overpowered at equilibrium.
        const correction = ((minDist - dist) / dist) * strength
        insight.x = (insight.x || 0) + dx * correction
        insight.y = (insight.y || 0) + dy * correction
      }
    }
  }

  force.initialize = (nodes: any[]) => {
    hubs = buildHubEnvelopes(nodes)
    insights = nodes.filter((n: any) => n.kind === 'insight')
  }

  return force
}

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISTIC PRE-SOLVE
// ═══════════════════════════════════════════════════════════════════════════
// The forces above are what KEEPS the layout correct while it lives. What
// follows is what makes it correct BEFORE it is ever shown: a topology-aware
// solve that hands the simulation a starting state already close to its
// answer, so the first paint is the layout — not several seconds of nodes
// sliding into place.
//
// Nothing here changes the layout's rules: hubs keep their authored
// positions (global group spacing untouched), clusters land on the same
// orbit radius the force uses, and insights land where the same criteria the
// forces optimize are already satisfied.

export interface SeedLayoutConfig {
  width: number
  height: number
}

/** Distance from point (px,py) to the segment (ax,ay)→(bx,by). */
function pointSegmentDistance(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const L2 = dx * dx + dy * dy
  if (L2 === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Mean of a point list; null for an empty list. */
function barycenter(points: Array<{ x: number, y: number }>): { x: number, y: number } | null {
  if (!points.length) return null
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  return { x: x / points.length, y: y / points.length }
}

/** A usable live position, or null if the node was never positioned. */
function positionOf(node: any): { x: number, y: number } | null {
  if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return null
  return { x: node.x, y: node.y }
}

/**
 * Topology-aware initial layout, solved in place on the node objects before
 * the simulation is created. Deterministic — same input, same output, no
 * randomness anywhere.
 *
 * 1. HUBS (source/document) keep their authored positions. Group spacing is
 *    a design decision made in graph-config.ts; the pre-solve never touches it.
 *
 * 2. CLUSTERS are dropped onto even angular slots on the existing orbit
 *    radius, each externally-connected cluster claiming the slot nearest the
 *    direction of what it connects to.
 *
 * 3. INSIGHTS are placed by CANDIDATE SCORING around the barycenter of the
 *    nodes they actually connect to — never arbitrarily, never left for the
 *    simulation to untangle. See scoreCandidate below for the cost model.
 *
 * 2 and 3 are solved TOGETHER, not independently: clusters are seeded first
 * against a proxy for where their insight will be, insights are then placed
 * against real cluster positions, and the cluster slots are re-solved against
 * the real insight positions (repeated `insightSeedRounds` times). That is
 * what makes a cluster sit on the side of its Source that faces its insight.
 */
function seedInitialLayout(nodes: any[], links: NetworkLink[], config: SeedLayoutConfig) {
  const nodeById = new Map<string, any>(nodes.map((n: any) => [n.id, n]))
  const endpointNode = (endpoint: any) =>
    typeof endpoint === 'string' ? nodeById.get(endpoint) : nodeById.get(endpoint?.id)

  // Undirected adjacency over the VISIBLE graph — "all nodes it connects to".
  const partnersById = new Map<string, any[]>()
  for (const link of links) {
    const s = endpointNode(link.source)
    const t = endpointNode(link.target)
    if (!s || !t || s === t) continue
    for (const [me, other] of [[s, t], [t, s]] as Array<[any, any]>) {
      if (!partnersById.has(me.id)) partnersById.set(me.id, [])
      partnersById.get(me.id)!.push(other)
    }
  }
  const partnersOf = (node: any): any[] => partnersById.get(node.id) || []

  const insights = nodes.filter((n: any) => n.kind === 'insight')
  const hubs = nodes.filter((n: any) => n.kind === 'source' || n.kind === 'document')
  const envelopes = buildHubEnvelopes(nodes)
  const radiusOf = new Map<string, number>(nodes.map((n: any) => [n.id, getEffectiveNodeRadius(n, 1)]))

  // ── 1. HUBS ───────────────────────────────────────────────────────────────
  // Authored positions are the spec. Only a hub that has none (a dataset that
  // omits coordinates) gets a deterministic fallback ring.
  const cx = config.width / 2
  const cy = config.height / 2
  const fallbackRadius = Math.min(config.width, config.height) * 0.32
  hubs.forEach((hub: any, i: number) => {
    if (!positionOf(hub)) {
      const angle = (i / Math.max(1, hubs.length)) * 2 * Math.PI
      hub.x = cx + Math.cos(angle) * fallbackRadius
      hub.y = cy + Math.sin(angle) * fallbackRadius
    }
  })

  // ── 2. CLUSTER ORBIT SLOTS ────────────────────────────────────────────────
  const clustersByHub = new Map<string, any[]>()
  for (const n of nodes) {
    if (n.kind !== 'cluster') continue
    const hubId = clusterOwnerId(n.id)
    if (!nodeById.has(hubId)) continue
    if (!clustersByHub.has(hubId)) clustersByHub.set(hubId, [])
    clustersByHub.get(hubId)!.push(n)
  }

  /** A cluster's link partners outside its own neighborhood. */
  const externalOf = (cluster: any): any[] => {
    const myHub = clusterOwnerId(cluster.id)
    return partnersOf(cluster).filter((other: any) => {
      const otherGroup = other.kind === 'cluster' ? clusterOwnerId(other.id) : other.id
      return otherGroup !== myHub
    })
  }

  /**
   * Where a cluster's external target effectively LIVES, for deciding which
   * way that cluster should face. On the first pass insights have no solved
   * position yet, so an insight resolves to the barycenter of its OWN other
   * partners' groups — the direction it is about to be placed in. Once
   * insights are solved (`useInsightPositions`), their real positions are used.
   */
  const anchorOf = (node: any, useInsightPositions: boolean, depth = 0): { x: number, y: number } | null => {
    if (node.kind === 'cluster') return positionOf(nodeById.get(clusterOwnerId(node.id)))
    if (node.kind === 'insight' && !useInsightPositions && depth === 0) {
      const points = partnersOf(node)
        .map((p: any) => anchorOf(p, useInsightPositions, depth + 1))
        .filter(Boolean) as Array<{ x: number, y: number }>
      return barycenter(points) ?? positionOf(node)
    }
    return positionOf(node)
  }

  const seedClusterSlots = (useInsightPositions: boolean) => {
    const orbit = FORCE_SIMULATION.clusterOrbitRadius
    for (const [hubId, members] of clustersByHub) {
      const hub = nodeById.get(hubId)
      const n = members.length
      if (!hub || !n) continue

      const currentAngle = (cluster: any): number =>
        Math.atan2((cluster.y || 0) - hub.y, (cluster.x || 0) - hub.x)

      /** Direction from the hub toward what this cluster connects out to. */
      const preferredAngle = (cluster: any): number | null => {
        const points = externalOf(cluster)
          .map((t: any) => anchorOf(t, useInsightPositions))
          .filter(Boolean) as Array<{ x: number, y: number }>
        const b = barycenter(points)
        return b ? Math.atan2(b.y - hub.y, b.x - hub.x) : null
      }

      const place = (cluster: any, angle: number) => {
        cluster.x = hub.x + Math.cos(angle) * orbit
        cluster.y = hub.y + Math.sin(angle) * orbit
      }

      // Two clusters are a compact V, exactly as forceClusterOrbit arranges
      // them — the seed must agree with the force or the pair visibly swings
      // on the first ticks.
      if (n === 2) {
        const vHalf = (FORCE_SIMULATION.twoClusterVAngleDeg * Math.PI / 180) / 2
        const p0 = preferredAngle(members[0])
        const p1 = preferredAngle(members[1])
        let dir: number
        if (p0 !== null && p1 !== null) dir = p0 + angleDelta(p0, p1) / 2
        else if (p0 !== null) dir = p0
        else if (p1 !== null) dir = p1
        else {
          const a0 = currentAngle(members[0])
          dir = a0 + angleDelta(a0, currentAngle(members[1])) / 2
        }
        place(members[0], dir - vHalf)
        place(members[1], dir + vHalf)
        continue
      }

      const step = (2 * Math.PI) / n
      const free = new Set<number>(Array.from({ length: n }, (_, i) => i))
      const slotPos = (slot: number) => ({
        x: hub.x + Math.cos(slot * step) * orbit,
        y: hub.y + Math.sin(slot * step) * orbit,
      })
      const maxMemberRadius = members.reduce(
        (max: number, m: any) => Math.max(max, getEffectiveNodeRadius(m, 1)), 0)

      /**
       * What this slot would cost the cluster's OUTGOING links: a slot whose
       * straight line to a target cuts the hub itself, or any other slot on
       * the ring (all of them end up occupied), is disqualified by a penalty
       * that dwarfs any angular preference. Same rule forceClusterOrbit
       * enforces later — the seed must not hand the simulation a layout it
       * will immediately undo.
       */
      const clipCost = (cluster: any, slot: number): number => {
        const targets = externalOf(cluster)
          .map((t: any) => anchorOf(t, useInsightPositions))
          .filter(Boolean) as Array<{ x: number, y: number }>
        if (!targets.length) return 0
        const p0 = slotPos(slot)
        const blockers = [{
          x: hub.x,
          y: hub.y,
          clear: getEffectiveNodeRadius(hub, 1) + FORCE_SIMULATION.seedCrossingClearance,
        }]
        for (let other = 0; other < n; other++) {
          if (other === slot) continue
          blockers.push({
            ...slotPos(other),
            clear: maxMemberRadius + FORCE_SIMULATION.seedCrossingClearance,
          })
        }
        let penalty = 0
        for (const target of targets) {
          for (const b of blockers) {
            penalty += clipCostFor(
              pointSegmentDistance(b.x, b.y, p0.x, p0.y, target.x, target.y),
              b.clear,
            )
          }
        }
        return penalty
      }

      const claim = (cluster: any, angle: number): number => {
        let bestSlot = -1
        let bestCost = Infinity
        for (const slot of free) {
          const cost = Math.abs(angleDelta(angle, slot * step)) + clipCost(cluster, slot)
          if (cost < bestCost) {
            bestCost = cost
            bestSlot = slot
          }
        }
        free.delete(bestSlot)
        return bestSlot
      }

      // Externally-connected clusters claim first (most connections first,
      // id as the deterministic tie-break); the rest fill what is left,
      // nearest their current angle so nothing travels further than it must.
      const scored = members.map((node: any) => ({ node, preferred: preferredAngle(node) }))
      const connected = scored
        .filter(e => e.preferred !== null)
        .sort((a, b) => externalOf(b.node).length - externalOf(a.node).length
          || (a.node.id < b.node.id ? -1 : 1))
      const rest = scored
        .filter(e => e.preferred === null)
        .sort((a, b) => (a.node.id < b.node.id ? -1 : 1))

      for (const e of connected) place(e.node, claim(e.node, e.preferred!) * step)
      for (const e of rest) place(e.node, claim(e.node, currentAngle(e.node)) * step)
    }
  }

  // ── 3. INSIGHT CANDIDATE SCORING ──────────────────────────────────────────
  /**
   * What a candidate position costs, lowest wins. In priority order:
   *
   * 1. CROSSINGS — charged in BOTH directions, because a link crossing a node
   *    it has nothing to do with is the failure this whole pass exists to
   *    prevent, and it reads identically whichever end caused it:
   *      · outgoing — every straight connection this insight will draw,
   *        tested against every unrelated node circle;
   *      · incoming — this insight's own circle, tested against every
   *        straight link it is not an endpoint of, so it can never park
   *        itself on someone else's connection.
   *    One crossing outweighs any amount of the other terms.
   * 2. NODE OVERLAP — the insight's own circle against every other node's
   *    (partners included: you may point at a cluster, never sit on it).
   * 3. ENVELOPE INTRUSION — a Source's orbit belongs to its clusters, so a
   *    candidate inside a group envelope is charged per unit of penetration.
   * 4. LENGTH — total connection length, the tie-break that keeps an insight
   *    near the groups it bridges instead of drifting to empty canvas.
   */
  /** Every link as a drawable segment, at the positions solved so far. */
  interface Segment { a: string, b: string, ax: number, ay: number, bx: number, by: number }
  const buildSegments = (): Segment[] => {
    const segments: Segment[] = []
    for (const link of links) {
      const s = endpointNode(link.source)
      const t = endpointNode(link.target)
      const sp = positionOf(s)
      const tp = positionOf(t)
      if (!s || !t || !sp || !tp) continue
      segments.push({ a: s.id, b: t.id, ax: sp.x, ay: sp.y, bx: tp.x, by: tp.y })
    }
    return segments
  }

  const scoreCandidate = (
    x: number,
    y: number,
    insight: any,
    partners: any[],
    partnerIds: Set<string>,
    segments: Segment[],
  ): number => {
    const rInsight = radiusOf.get(insight.id) ?? getEffectiveNodeRadius(insight, 1)
    let cost = 0

    for (const partner of partners) {
      const p = positionOf(partner)
      if (!p) continue
      cost += Math.hypot(p.x - x, p.y - y) * FORCE_SIMULATION.seedCostLength
      for (const other of nodes) {
        if (other === insight || partnerIds.has(other.id)) continue
        const op = positionOf(other)
        if (!op) continue
        const clear = (radiusOf.get(other.id) ?? 0) + FORCE_SIMULATION.seedCrossingClearance
        if (pointSegmentDistance(op.x, op.y, x, y, p.x, p.y) < clear) {
          cost += FORCE_SIMULATION.seedCostCrossing
        }
      }
    }

    // Incoming: this insight must not sit ON a link it plays no part in.
    for (const segment of segments) {
      if (segment.a === insight.id || segment.b === insight.id) continue
      const clear = rInsight + FORCE_SIMULATION.seedCrossingClearance
      if (pointSegmentDistance(x, y, segment.ax, segment.ay, segment.bx, segment.by) < clear) {
        cost += FORCE_SIMULATION.seedCostCrossing
      }
    }

    for (const other of nodes) {
      if (other === insight) continue
      const op = positionOf(other)
      if (!op) continue
      const need = rInsight + (radiusOf.get(other.id) ?? 0) + FORCE_SIMULATION.nodeCollisionGap
      const dist = Math.hypot(op.x - x, op.y - y)
      if (dist < need) cost += (need - dist) * FORCE_SIMULATION.seedCostInsightOverlap
    }

    for (const { node: hub, envelope } of envelopes) {
      const need = envelope + FORCE_SIMULATION.insightEnvelopeGap + rInsight
      const dist = Math.hypot((hub.x || 0) - x, (hub.y || 0) - y)
      if (dist < need) cost += (need - dist) * FORCE_SIMULATION.seedCostEnvelope
    }

    return cost
  }

  const clamp = (value: number, max: number): number =>
    Math.max(FORCE_SIMULATION.seedMargin, Math.min(value, max - FORCE_SIMULATION.seedMargin))

  const placeInsights = () => {
    // Most-connected insights are placed first — they have the least freedom
    // and the most links to keep clean. Id breaks ties, so the order (and
    // therefore the whole layout) is reproducible.
    const ordered = [...insights].sort((a: any, b: any) =>
      partnersOf(b).length - partnersOf(a).length || (a.id < b.id ? -1 : 1))

    for (const insight of ordered) {
      const partners = partnersOf(insight)
      if (!partners.length) continue // nothing to be topology-aware about
      const partnerIds = new Set<string>(partners.map((p: any) => p.id))
      const anchors = partners.map(positionOf).filter(Boolean) as Array<{ x: number, y: number }>
      const centre = barycenter(anchors)
      if (!centre) continue

      // Rebuilt per insight: every placement changes the geometry the next
      // one is scored against.
      const segments = buildSegments()

      // The authored position competes as a candidate and is scored first, so
      // a designer-chosen spot that is already clean survives on a tie.
      let bestX = insight.x
      let bestY = insight.y
      let bestCost = Infinity
      const authored = positionOf(insight)
      if (authored) bestCost = scoreCandidate(authored.x, authored.y, insight, partners, partnerIds, segments)

      for (const ring of FORCE_SIMULATION.insightCandidateRadii) {
        const steps = ring === 0 ? 1 : FORCE_SIMULATION.insightCandidateAngles
        for (let k = 0; k < steps; k++) {
          const angle = (k / steps) * 2 * Math.PI
          const x = clamp(centre.x + Math.cos(angle) * ring, config.width)
          const y = clamp(centre.y + Math.sin(angle) * ring, config.height)
          const cost = scoreCandidate(x, y, insight, partners, partnerIds, segments)
          if (cost < bestCost) {
            bestCost = cost
            bestX = x
            bestY = y
          }
        }
      }

      insight.x = bestX
      insight.y = bestY
    }
  }

  // Solve clusters and insights together (see the doc comment above).
  seedClusterSlots(false)
  for (let round = 0; round < FORCE_SIMULATION.insightSeedRounds; round++) {
    placeInsights()
    seedClusterSlots(true)
  }

  // Hand the simulation a state at rest: any leftover velocity from a
  // previous run would show up as drift on the first ticks.
  for (const n of nodes) {
    n.vx = 0
    n.vy = 0
  }
}

/**
 * Run the simulation to (near) rest WITHOUT rendering, so the graph is first
 * painted at its answer instead of animating toward it. `simulation.tick()`
 * advances the physics synchronously and never schedules a frame — the D3
 * timer stays stopped throughout.
 */
function warmupSimulation(
  simulation: d3.Simulation<NetworkNode, NetworkLink>,
  ticks: number = FORCE_SIMULATION.warmupTicks,
) {
  simulation.stop()
  const count = Math.max(0, Math.floor(ticks))
  for (let i = 0; i < count; i++) simulation.tick()
}

export function useD3Force() {
  function createForceSimulation(
    nodes: NetworkNode[],
    links: NetworkLink[],
    config: ForceSimulationConfig,
  ) {
    const {
      width,
      height,
      nodeStrength = FORCE_SIMULATION.nodeStrength,
      linkStrength = FORCE_SIMULATION.linkStrength,
      chargeStrength = FORCE_SIMULATION.chargeStrength,
    } = config

    const simulation = d3.forceSimulation(nodes)
      // Faster cooldown than D3's default. A drag holds alpha at 0.3 through
      // alphaTarget, so this shortens settling without stiffening dragging.
      .alphaDecay(FORCE_SIMULATION.alphaDecay)
      .velocityDecay(FORCE_SIMULATION.velocityDecay)
      .force('link', d3.forceLink(links)
        .id((d: any) => d.id)
        // Strength by link class: ownership bonds strongest, cross-group /
        // insight bridges tighter than generic links (see linkClass above)
        .strength((link: any) => {
          switch (linkClass(link)) {
            case 'bond': return FORCE_SIMULATION.clusterBondStrength
            case 'crossGroup': return FORCE_SIMULATION.crossGroupStrength
            default: return linkStrength
          }
        })
        // Distance by the same classification
        .distance((link: any) => {
          switch (linkClass(link)) {
            case 'bond': return FORCE_SIMULATION.clusterBondDistance
            case 'crossGroup': return FORCE_SIMULATION.crossGroupDistance
            default: return FORCE_SIMULATION.linkDistance
          }
        }),
      )
      .force('charge', d3.forceManyBody()
        .strength(chargeStrength)
        .distanceMax(FORCE_SIMULATION.chargeDistanceMax),
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      // Gentle gravity toward the canvas center: compacts the overall graph
      // (forceCenter only translates the mean — it never pulls groups
      // together; forceX/Y do). Strength is small so links, orbits and
      // collisions still dominate local structure.
      .force('gravityX', d3.forceX(width / 2).strength(FORCE_SIMULATION.centerPullStrength))
      .force('gravityY', d3.forceY(height / 2).strength(FORCE_SIMULATION.centerPullStrength))
      // Overlap protection for EVERY visible kind (source · cluster · insight
      // · document), sized from each node's ACTUAL rendered radius plus a
      // visible gap. getNodeDiameter(d.kind) alone returns the base per-kind
      // size and ignores the weight/size scaling clusters and insights are
      // drawn with — which is how two large insights could sit on top of each
      // other while the force believed they were clear.
      .force('collision', d3.forceCollide()
        .radius((d: any) => getEffectiveNodeRadius(d, 1) + FORCE_SIMULATION.nodeCollisionGap)
        .strength(FORCE_SIMULATION.collisionStrength)
        .iterations(FORCE_SIMULATION.collisionIterations),
      )
      // Keep hub neighborhoods distinct while gravity compacts the graph
      .force('hubSeparation', forceHubSeparation(
        FORCE_SIMULATION.hubGroupGap,
        FORCE_SIMULATION.hubSeparationStrength,
      ))
      // Radial organization of each hub's cluster neighborhood
      .force('clusterOrbit', forceClusterOrbit(
        FORCE_SIMULATION.clusterOrbitRadius,
        FORCE_SIMULATION.clusterOrbitStrength,
        links,
      ))
      // Insights settle between the nodes they connect (see above)
      .force('insightBarycenter', forceInsightBarycenter(
        FORCE_SIMULATION.insightBarycenterStrength,
        links,
        FORCE_SIMULATION.insightAnchorBias,
      ))
      // Insights never stack on each other (see above)
      .force('insightSeparation', forceInsightSeparation(
        FORCE_SIMULATION.insightSeparation,
        FORCE_SIMULATION.insightSeparationStrength,
      ))
      // Multi-group insight communities: members pack around the insight,
      // unrelated groups are kept out of the corridor (see above)
      .force('insightEnvelope', forceInsightEnvelopeSeparation(
        FORCE_SIMULATION.insightEnvelopeGap,
        FORCE_SIMULATION.insightEnvelopeStrength,
      ))
      // No insight may sit on a straight link it is not an endpoint of
      .force('insightLinkClearance', forceInsightLinkClearance(
        FORCE_SIMULATION.insightLinkClearance,
        FORCE_SIMULATION.insightLinkClearanceStrength,
        links,
      ))
      .force('insightCommunities', forceInsightCommunities(
        FORCE_SIMULATION.communityPullStrength,
        FORCE_SIMULATION.communityClearance,
        FORCE_SIMULATION.communityRepelStrength,
        links,
      ))

    return simulation
  }

  function updatePositions(
    selection: d3.Selection<any, any, any, any>,
    width: number,
    height: number,
  ) {
    selection.each((d: any) => {
      d.x = Math.max(0, Math.min(d.x || 0, width))
      d.y = Math.max(0, Math.min(d.y || 0, height))
    })
  }

  return { createForceSimulation, updatePositions, seedInitialLayout, warmupSimulation }
}
