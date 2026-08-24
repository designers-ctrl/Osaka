/**
 * src/components/graphs/proximityBridges.ts
 *
 * Cross-group Cluster ↔ Cluster bridges, chosen PURELY BY VISUAL PROXIMITY
 * from the layout's SETTLED positions.
 *
 * ── Why this is not done in the dataset ────────────────────────────────────
 * `graphWorkspace.ts` also derives cross-group links, but it can only see the
 * AUTHORED coordinates — and the force simulation then moves everything:
 * `forceClusterOrbit` re-slots every cluster into even angular positions and
 * `forceHubSeparation` pushes whole groups apart. Measured on the demo graph,
 * only 1 of 17 authored bridges ended up joining the nearest group once the
 * layout settled, and the longest spanned 380 units where a 146-unit neighbour
 * existed. Choosing here — after the pre-solve — is what makes "nearest" mean
 * nearest ON SCREEN.
 *
 * ── Selection, in the stated priority order ────────────────────────────────
 *   1. nearest cluster belonging to ANOTHER group   (candidates sorted by
 *   2. shortest straight-line distance               distance, ties by id)
 *   3. no overlap with nodes                        (clearance test)
 *   4. no crossing with an already-accepted bridge  (segment intersection)
 *
 * A blocked candidate is skipped and the NEXT-NEAREST clean one is tried. The
 * accepted set is a spanning tree over GROUPS, so every group joins its local
 * neighbourhood exactly once and no long diagonal is drawn to a group that a
 * closer one already reaches. Because the nearest pair between two groups is
 * by definition the pair on their FACING sides, "choose clusters on the sides
 * facing each other" falls out of the distance sort rather than needing its
 * own rule.
 *
 * Deterministic: same settled positions in, same bridges out — the ordering is
 * total (distance, then the two ids), and the pre-solve itself is deterministic
 * (`Math.random()` is banned in this repo).
 *
 * Straight lines only, like every other connection in this project.
 */

import type { NetworkLink, NetworkNode } from '@/components/charts'
import { withoutDisallowedLinks } from '@/data/graphLinkRules'

/** Minimum distance a bridge must keep from any node it does not terminate on. */
const NODE_CLEARANCE = 26

/** The group a cluster belongs to: its owning hub id (`Gmail-s3` → `Gmail`). */
export function bridgeGroupOf(id: string): string {
  return String(id).replace(/-s\d+$/, '')
}

interface Pt { id: string, group: string, x: number, y: number }

/** Distance from point `p` to segment `a→b`. */
function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const len2 = vx * vx + vy * vy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2))
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy))
}

/** Do segments a→b and c→d properly cross? (shared endpoints don't count) */
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  if (a.id === c.id || a.id === d.id || b.id === c.id || b.id === d.id) return false
  const side = (p: Pt, q: Pt, r: Pt) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
  return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b)
}

/**
 * The bridges for a settled layout. Pass the nodes AFTER the pre-solve — the
 * positions they carry are what "visually closest" is measured against.
 */
export function deriveProximityBridges(nodes: readonly NetworkNode[]): NetworkLink[] {
  const clusters: Pt[] = nodes
    .filter((n: any) => n.kind === 'cluster' && Number.isFinite(n.x) && Number.isFinite(n.y))
    .map((n: any) => ({ id: n.id, group: bridgeGroupOf(n.id), x: n.x, y: n.y }))
  // Every node a bridge must stay clear of (its own endpoints excepted).
  const obstacles: Pt[] = nodes
    .filter((n: any) => n.kind !== 'entity' && Number.isFinite(n.x) && Number.isFinite(n.y))
    .map((n: any) => ({ id: n.id, group: bridgeGroupOf(n.id), x: n.x, y: n.y }))

  const groups = [...new Set(clusters.map(c => c.group))].sort()
  if (groups.length < 2) return []

  // ── Candidates: every cross-group cluster pair, nearest first ────────────
  const candidates: Array<{ a: Pt, b: Pt, d: number }> = []
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      if (clusters[i].group === clusters[j].group) continue
      candidates.push({ a: clusters[i], b: clusters[j], d: Math.hypot(clusters[i].x - clusters[j].x, clusters[i].y - clusters[j].y) })
    }
  }
  // Total order → deterministic result.
  candidates.sort((p, q) => p.d - q.d || (p.a.id < q.a.id ? -1 : p.a.id > q.a.id ? 1 : p.b.id < q.b.id ? -1 : 1))

  // ── Union–Find over GROUPS: one bridge per join, nearest first ───────────
  const parent = new Map(groups.map(g => [g, g]))
  const find = (g: string): string => {
    let root = g
    while (parent.get(root) !== root) root = parent.get(root)!
    return root
  }
  const union = (x: string, y: string) => parent.set(find(x), find(y))

  const accepted: Array<{ a: Pt, b: Pt }> = []
  const links: NetworkLink[] = []

  const blockedCount = (a: Pt, b: Pt) => {
    let blocked = 0
    for (const o of obstacles) {
      if (o.id === a.id || o.id === b.id) continue
      if (segmentDistance(o, a, b) < NODE_CLEARANCE) blocked++
    }
    for (const seg of accepted) {
      if (segmentsCross(a, b, seg.a, seg.b)) blocked++
    }
    return blocked
  }

  const take = (a: Pt, b: Pt) => {
    accepted.push({ a, b })
    links.push({ source: a.id, target: b.id })
    union(a.group, b.group)
  }

  // Clean pass: shortest candidate that joins two still-separate groups AND
  // crosses nothing. A blocked pair is skipped — connectivity is found through
  // the next-nearest clean candidate.
  for (const cand of candidates) {
    if (find(cand.a.group) === find(cand.b.group)) continue
    if (blockedCount(cand.a, cand.b) > 0) continue
    take(cand.a, cand.b)
  }

  // Relaxed pass: any group the clean pass could not reach still gets its
  // shortest, least-blocked link — one imperfect line beats an island.
  if (new Set(groups.map(find)).size > 1) {
    for (const cand of candidates) {
      if (new Set(groups.map(find)).size === 1) break
      if (find(cand.a.group) === find(cand.b.group)) continue
      let best = cand
      let bestBlocked = blockedCount(cand.a, cand.b)
      for (const other of candidates) {
        if (find(other.a.group) !== find(cand.a.group) || find(other.b.group) !== find(cand.b.group)) continue
        const blocked = blockedCount(other.a, other.b)
        if (blocked < bestBlocked) { best = other; bestBlocked = blocked }
        if (bestBlocked === 0) break
      }
      take(best.a, best.b)
    }
  }

  return links
}

/**
 * The link set to RENDER: everything the dataset supplies except its own
 * cross-group cluster↔cluster bridges, plus the proximity ones derived from
 * the settled layout. Same shape and `kind` as before, so the renderer, hover
 * isolation, endpoints and timeline filtering treat them identically.
 */
export function withProximityBridges(
  links: readonly NetworkLink[],
  nodes: readonly NetworkNode[],
): NetworkLink[] {
  const kindById = new Map(nodes.map((n: any) => [n.id, n.kind]))
  const endId = (end: any) => (typeof end === 'object' ? end?.id : end)
  const isCrossGroupClusterLink = (l: NetworkLink) => {
    const s = endId((l as any).source)
    const t = endId((l as any).target)
    return kindById.get(s) === 'cluster'
      && kindById.get(t) === 'cluster'
      && bridgeGroupOf(s) !== bridgeGroupOf(t)
  }
  /*
   * The render-time safeguard for the Insight ↔ Insight rule: even if such a
   * pair reached the link list, it stops here and is never drawn
   * (src/data/graphLinkRules.ts).
   */
  return withoutDisallowedLinks(
    [...links.filter(l => !isCrossGroupClusterLink(l)), ...deriveProximityBridges(nodes)],
    id => kindById.get(id),
  )
}
