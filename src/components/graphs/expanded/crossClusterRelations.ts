/**
 * src/components/graphs/expanded/crossClusterRelations.ts
 *
 * The deterministic Entity ↔ Entity pairing shared by BOTH drill-downs — the
 * Unstructured expanded-cluster view and the Structured cluster focus.
 *
 * The dataset carries no entity-level links. The relationships both views draw
 * between the entities of different open clusters are therefore generated, and
 * they must be generated the SAME way in both places: the same pair of clusters
 * has to produce the same pairs of entities whichever view you are looking at,
 * and the same pairs again after a reload. That is only true if there is one
 * implementation, which is what this module is. `Math.random()` is banned in
 * this repo for exactly this reason — every choice here is seeded from ids.
 *
 * ⚠️ THE SIBLING RULE. Two entities of the SAME parent cluster never connect.
 * Membership in one cluster is already expressed by the thing that contains
 * them both — a line between siblings restates it, and at region density it
 * reads as a hairball that hides the relationships that DO carry meaning. It is
 * enforced here as a FILTER: a forbidden pair is never returned, so no element
 * is ever created for it and nothing downstream (hover, focus, a future
 * emphasis mode) can reveal it.
 */

import { hashId } from './demoEntities'
import { EXPANDED_CLUSTER } from './expandedTokens'

/** One generated relationship between entities of two different clusters. */
export interface CrossClusterEntityPair {
  /** Stable identity, `aEntityId~bEntityId`. */
  key: string
  aClusterId: string
  aEntityId: string
  bClusterId: string
  bEntityId: string
}

/** An open cluster and the entities it currently shows. */
export interface CrossClusterGroup {
  clusterId: string
  entityIds: string[]
}

/** `Gmail-s0-e3` / `Gmail-s0-demo-2` → `Gmail-s0`. */
export function entityClusterId(entityId: string): string {
  return entityId.replace(/-(?:e\d+|demo-\d+)$/, '')
}

/** Are these two entities siblings — same parent cluster? */
export function sameParentCluster(aEntityId: string, bEntityId: string): boolean {
  return entityClusterId(aEntityId) === entityClusterId(bEntityId)
}

/**
 * Pair up entities between every pair of open clusters that are actually
 * RELATED (`isRelated` decides — a direct link or a shared Insight in both
 * callers).
 *
 * Determinism, in detail, because it is the whole point:
 * - cluster pairs are considered in SORTED id order, so which cluster the user
 *   happened to open first cannot change the result;
 * - the seed is `hashId('<firstId>~<secondId>')`, so a given pair of clusters
 *   always seeds identically;
 * - the entity indices walk the seed by fixed strides (`+k*7`, `*3 + k*11`),
 *   so the k-th relationship of a pair is always the same two entities;
 * - duplicates are dropped by key, and siblings by the rule above.
 *
 * The caller supplies entity lists in a stable order (both callers sort), which
 * is the last thing needed for the indices to mean the same thing every time.
 */
export function deriveCrossClusterEntityPairs(
  groups: CrossClusterGroup[],
  isRelated: (aClusterId: string, bClusterId: string) => boolean,
  linksPerPair: number = EXPANDED_CLUSTER.demo.crossLinksPerRegionPair,
): CrossClusterEntityPair[] {
  const pairs: CrossClusterEntityPair[] = []
  const seen = new Set<string>()

  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const [first, second] = [groups[i], groups[j]]
        .sort((x, y) => x.clusterId.localeCompare(y.clusterId))
      if (!isRelated(first.clusterId, second.clusterId)) continue
      const a = first.entityIds
      const b = second.entityIds
      if (a.length === 0 || b.length === 0) continue

      const pairSeed = hashId(`${first.clusterId}~${second.clusterId}`)
      const pairCount = Math.min(linksPerPair, a.length, b.length)
      for (let k = 0; k < pairCount; k++) {
        const aId = a[(pairSeed + k * 7) % a.length]
        const bId = b[(pairSeed * 3 + k * 11) % b.length]
        const key = `${aId}~${bId}`
        if (seen.has(key)) continue
        // Belt and braces on the sibling rule: the pair is cross-cluster by
        // construction here, but the check is on the entities' actual parent
        // clusters, so it holds for any future source of relations — real graph
        // links included — not just for how this loop picks pairs.
        if (sameParentCluster(aId, bId)) continue
        seen.add(key)
        pairs.push({
          key,
          aClusterId: first.clusterId,
          aEntityId: aId,
          bClusterId: second.clusterId,
          bEntityId: bId,
        })
      }
    }
  }
  return pairs
}
