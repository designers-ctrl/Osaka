/**
 * src/engines/graph/queries.ts
 *
 * Query operations on graph data.
 * Pure functions that extract information without modifying the graph.
 */

import type { NetworkNode, NetworkLink } from '@/components/charts'

/**
 * Build an adjacency map for fast lookups.
 * Returns both outgoing and incoming edges for undirected traversal.
 */
export function buildAdjacencyMap(
  nodes: NetworkNode[],
  links: NetworkLink[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()

  // Initialize all nodes
  nodes.forEach(node => {
    if (!map.has(node.id)) {
      map.set(node.id, new Set())
    }
  })

  // Add edges (bidirectional)
  links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id
    const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id

    const sourceSet = map.get(sourceId) || new Set()
    const targetSet = map.get(targetId) || new Set()

    sourceSet.add(targetId)
    targetSet.add(sourceId)

    map.set(sourceId, sourceSet)
    map.set(targetId, targetSet)
  })

  return map
}

/**
 * Get all node IDs directly connected to a given node (one hop).
 */
export function getConnectedNodeIds(
  nodeId: string,
  adjacencyMap: Map<string, Set<string>>,
): string[] {
  return Array.from(adjacencyMap.get(nodeId) || new Set())
}

/**
 * Get all nodes within N hops of a given node.
 */
export function getReachableNodeIds(
  nodeId: string,
  adjacencyMap: Map<string, Set<string>>,
  maxHops: number = 2,
): Set<string> {
  const reachable = new Set<string>()
  const queue: Array<{id: string, hops: number}> = [{id: nodeId, hops: 0}]
  const visited = new Set<string>([nodeId])

  while (queue.length > 0) {
    const current = queue.shift()!

    if (current.hops >= maxHops) continue

    const connected = getConnectedNodeIds(current.id, adjacencyMap)
    connected.forEach(id => {
      if (!visited.has(id)) {
        visited.add(id)
        reachable.add(id)
        queue.push({id, hops: current.hops + 1})
      }
    })
  }

  return reachable
}

/**
 * Get all entities in a cluster.
 * Entities are recognized by having `source` or `kind === 'entity'` as their parent cluster.
 */
export function getClusterEntities(
  clusterId: string,
  nodes: NetworkNode[],
  links: NetworkLink[],
): NetworkNode[] {
  const entityIds = new Set<string>()

  links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id
    const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id

    // If link is cluster → entity, record the entity
    if (sourceId === clusterId && targetId.startsWith(`${clusterId}-e`)) {
      entityIds.add(targetId)
    }
  })

  return nodes.filter(n => entityIds.has(n.id))
}

/**
 * Get all insights connected to a node.
 */
export function getConnectedInsights(
  nodeId: string,
  nodes: NetworkNode[],
  links: NetworkLink[],
): NetworkNode[] {
  const insightIds = new Set<string>()

  links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id
    const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id

    // If this node connects to an insight
    if (sourceId === nodeId && targetId.startsWith('ins-')) {
      insightIds.add(targetId)
    }
    if (targetId === nodeId && sourceId.startsWith('ins-')) {
      insightIds.add(sourceId)
    }
  })

  return nodes.filter(n => n.kind === 'insight' && insightIds.has(n.id))
}

/**
 * Find which source a node belongs to.
 * Traverses upward: entity → cluster → source.
 */
export function getNodeSource(
  nodeId: string,
  nodes: NetworkNode[],
  links: NetworkLink[],
): string | null {
  const nodeToSource = buildNodeToSourceMap(nodes, links)
  return nodeToSource.get(nodeId) ?? null
}

/**
 * Build a map of each node to its source.
 * Memoized to avoid rebuilding on every query.
 */
function buildNodeToSourceMap(
  nodes: NetworkNode[],
  links: NetworkLink[],
): Map<string, string> {
  const map = new Map<string, string>()

  // Direct sources
  nodes
    .filter(n => n.kind === 'source')
    .forEach(n => {
      map.set(n.id, n.id)
    })

  // Clusters belong to sources
  nodes
    .filter(n => n.kind === 'cluster')
    .forEach(cluster => {
      const sourceId = cluster.id.split('-s')[0]
      if (sourceId) {
        map.set(cluster.id, sourceId)
      }
    })

  // Entities belong to clusters
  nodes
    .filter(n => n.kind === 'entity')
    .forEach(entity => {
      const clusterMatch = entity.id.match(/^(.+-s\d+)-e\d+$/)
      if (clusterMatch) {
        const clusterId = clusterMatch[1]
        const sourceId = clusterId.split('-s')[0]
        map.set(entity.id, sourceId)
      }
    })

  return map
}

/**
 * Get all nodes of a specific kind.
 */
export function getNodesByKind(
  nodes: NetworkNode[],
  kind: string,
): NetworkNode[] {
  return nodes.filter(n => n.kind === kind)
}

/**
 * Search nodes by label (case-insensitive substring match).
 */
export function searchNodesByLabel(
  nodes: NetworkNode[],
  query: string,
): NetworkNode[] {
  const lower = query.toLowerCase()
  return nodes.filter(n =>
    (n.label || n.id).toLowerCase().includes(lower),
  )
}

/**
 * Filter nodes by time range.
 */
export function filterNodesByTimeRange(
  nodes: NetworkNode[],
  start: number,
  end: number,
): NetworkNode[] {
  return nodes.filter(n => {
    if (!n.timeRange) return true // Include nodes without time range
    return n.timeRange.start <= end && n.timeRange.end >= start
  })
}
