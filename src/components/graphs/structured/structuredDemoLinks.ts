/**
 * src/components/graphs/structured/structuredDemoLinks.ts
 *
 * Additional DETERMINISTIC demo relationships for the Structured view.
 *
 * ⚠️ WHY THIS EXISTS. The generated dataset is thin at the ring level: of the
 * ~190 raw connections, only 15 survive the "both endpoints are visible ring
 * nodes, and not a cluster pointing at itself" test the mesh draws by — so 52
 * of 62 clusters read 0 relationships and the radial graph looks disconnected.
 *
 * The fix is MORE RELATIONSHIPS, not more lines. Every link built here is a
 * real entry in the link list the renderer and the counter both consume, so a
 * drawn line always has two visible endpoints and always shows up in the
 * endpoint's count. Nothing decorative is drawn, and a node with no
 * relationships still gets nothing.
 *
 * Same contract as the Unstructured drill-down's `crossClusterRelations`:
 * layer-local, clearly synthetic (per the domain rules), and seeded entirely
 * from ids and ring order — `Math.random()` is banned in this repo, so the same
 * graph produces the same links on every reload and every machine.
 *
 * ── WHY CHORDS, NOT NEIGHBOURS ────────────────────────────────────────────
 * Links are drawn between clusters a fixed STRIDE apart in ring order. A stride
 * coprime with the ring size walks the whole circle before repeating, so the
 * added chords land evenly around the graph instead of thickening one arc — the
 * distribution requirement is a property of the construction rather than
 * something checked afterwards.
 */

import type { NetworkLink } from '@/components/charts'
import type { PositionedNode } from './useStructuredRenderer'
import { STRUCTURED_CONNECTIONS } from './structuredTokens'

/** Greatest common divisor — used to keep strides coprime with the ring. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * Nudge `stride` upward until it is coprime with `n`, so stepping by it visits
 * every position on the ring before returning to the start. A stride sharing a
 * factor with `n` closes early and leaves whole arcs untouched.
 */
function coprimeStride(stride: number, n: number): number {
  let s = Math.max(1, Math.min(stride, n - 1))
  for (let i = 0; i < n; i++) {
    if (gcd(s, n) === 1) return s
    s = (s % (n - 1)) + 1
  }
  return 1
}

/**
 * Build the extra relationships for one Structured render.
 *
 * @param positionedNodes the ring-positioned node set (angles already assigned)
 * @param existingLinks   the dataset's own links, so nothing is duplicated
 */
export function deriveStructuredDemoLinks(
  positionedNodes: PositionedNode[],
  existingLinks: NetworkLink[],
): NetworkLink[] {
  const demo = STRUCTURED_CONNECTIONS.demo
  if (!demo.enabled) return []

  // Ring order — the angle each node was laid out at. Sorting by it (with the
  // id as a stable tie-break) is what makes "a stride apart" mean "a fixed arc
  // apart" rather than an arbitrary array offset.
  const clusters = positionedNodes
    .filter(n => n.kind === 'cluster' && n.angle !== undefined)
    .slice()
    .sort((a, b) => (a.angle! - b.angle!) || String(a.id).localeCompare(String(b.id)))
  const insights = positionedNodes
    .filter(n => n.kind === 'insight')
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))

  const n = clusters.length
  if (n < 3) return []

  const endpointId = (endpoint: any): string =>
    (typeof endpoint === 'string' ? endpoint : endpoint?.id)
  const key = (a: string, b: string) => (a < b ? `${a}~${b}` : `${b}~${a}`)

  // Never restate a relationship the dataset already carries.
  const seen = new Set<string>()
  for (const link of existingLinks) {
    const a = endpointId(link.source)
    const b = endpointId(link.target)
    if (a && b) seen.add(key(a, b))
  }

  const links: NetworkLink[] = []
  const add = (a: PositionedNode, b: PositionedNode, kind: string) => {
    if (a.id === b.id) return
    const k = key(a.id, b.id)
    if (seen.has(k)) return
    seen.add(k)
    links.push({ source: a.id, target: b.id, kind } as NetworkLink)
  }

  // ── Cluster ↔ Cluster chords, evenly distributed around the ring ────────
  for (const rawStride of demo.chordStrides) {
    const stride = coprimeStride(Math.max(1, Math.round(n * rawStride)), n)
    for (let i = 0; i < n; i += demo.chordEvery) {
      add(clusters[i], clusters[(i + stride) % n], 'influence')
    }
  }

  // ── Cluster → Insight spokes ────────────────────────────────────────────
  // Insights are the sparsest kind, so they gain the most from extra edges.
  // Walking the ring with its own stride hands consecutive spokes to clusters
  // on opposite sides of the graph rather than to neighbours.
  if (insights.length) {
    const stride = coprimeStride(Math.max(1, Math.round(n * demo.insightStride)), n)
    let at = 0
    for (let s = 0; s < insights.length * demo.insightSpokes; s++) {
      add(clusters[at % n], insights[s % insights.length], 'influence')
      at += stride
    }
  }

  return links
}
