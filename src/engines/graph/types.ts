/**
 * src/engines/graph/types.ts
 *
 * Core type definitions for the graph engine.
 */

export type NetworkNodeKind = 'source' | 'document' | 'entity' | 'cluster' | 'insight'

export interface NetworkNode {
  id: string
  label?: string
  kind: NetworkNodeKind
  x: number
  y: number
  size?: number
  confidence?: number
  derivedFrom?: string
  sourceIcon?: string
  timeRange?: { start: number, end: number }
}

export type NetworkLinkKind = 'influence' | 'overlap'

export interface NetworkLink {
  source: string
  target: string
  kind?: NetworkLinkKind
}

export interface Graph {
  nodes: NetworkNode[]
  edges: NetworkLink[]
}

export interface GraphSelection {
  nodeIds: Set<string>
  clusterIds: Set<string>
}

export interface GraphQuery {
  // Returns all nodes connected to a given node (one hop)
  connectedTo(nodeId: string): string[]

  // Returns all nodes reachable within N hops
  reachable(nodeId: string, maxHops: number): string[]

  // Returns all entities in a cluster
  clusterEntities(clusterId: string): string[]

  // Returns all insights connected to a node
  influencingInsights(nodeId: string): string[]

  // Returns source that owns this node
  nodeSource(nodeId: string): string | null
}
