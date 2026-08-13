/**
 * src/components/graphs/structured/useStructuredGeometry.ts
 *
 * Geometry utilities for Structured (radial ring-based) view.
 * Calculates radial connection endpoints that account for node sizes
 * and ring positions, ensuring links connect from node edge to node edge
 * along radial lines (not naive center-to-center).
 *
 * Completely separate from Unstructured view's getConnectionEndpoints(),
 * which uses different center-offset geometry unsuitable for rings.
 */

import type { NetworkLink } from '@/components/charts'
import { STRUCTURED_NODE_SIZES } from './structuredTokens'
import type { PositionedNode } from './useStructuredRenderer'

export interface ConnectionEndpoint {
  x: number
  y: number
}

export interface RadialConnection {
  source: ConnectionEndpoint
  target: ConnectionEndpoint
  sourceNode: PositionedNode
  targetNode: PositionedNode
}

export function useStructuredGeometry() {
  /**
   * Get node radius (half diameter) for a given node kind.
   * Maps node type to visual size used in Structured view.
   */
  function getNodeRadiusForKind(nodeKind: string): number {
    const radiusMap: Record<string, number> = {
      source: STRUCTURED_NODE_SIZES.centerAvatar / 2, // 40
      insight: STRUCTURED_NODE_SIZES.insight / 2,      // 6
      entity: STRUCTURED_NODE_SIZES.entity / 2,        // 12
      cluster: STRUCTURED_NODE_SIZES.cluster / 2,      // 20
    }
    return radiusMap[nodeKind] || 10 // Safe fallback
  }

  /**
   * Calculate a connection endpoint for a node on a radial ring.
   * The endpoint is positioned at the edge of the node, along the radial
   * line from the graph center through the node center.
   *
   * For a node at distance R from center with angle θ and visual radius r:
   * - Node center: (R*cos(θ), R*sin(θ))
   * - Node edge (toward center): ((R-r)*cos(θ), (R-r)*sin(θ))
   *
   * This ensures the connection starts/ends at the node's edge, not its center.
   */
  function getRadialConnectionEndpoint(node: PositionedNode): ConnectionEndpoint {
    // Safety: angle and orbitDistance must exist from useD3Hierarchy
    if (!node.angle || node.orbitDistance === undefined) {
      // Fallback: use node's x/y if available (shouldn't happen in normal flow)
      return { x: node.x || 0, y: node.y || 0 }
    }

    const nodeRadius = getNodeRadiusForKind(node.kind)
    const orbitDistance = node.orbitDistance
    const angle = node.angle

    // Position on the radial line at the node's edge (inward from center)
    // This creates a connection that starts/ends at the node edge
    const edgeDistance = Math.max(0, orbitDistance - nodeRadius)
    const x = Math.cos(angle) * edgeDistance
    const y = Math.sin(angle) * edgeDistance

    return { x, y }
  }

  /**
   * Calculate all radial connection endpoints for a set of links.
   * Reuses the same link dataset as Unstructured view (204 links).
   *
   * Returns array of radial connections with both endpoint positions calculated.
   */
  function getRadialConnectionEndpoints(
    links: NetworkLink[],
    positionedNodes: PositionedNode[],
  ): RadialConnection[] {
    // Build lookup map for quick node finding by ID
    const nodeMap = new Map<string, PositionedNode>()
    positionedNodes.forEach(node => {
      nodeMap.set(node.id, node)
    })

    let resolvedCount = 0
    let droppedCount = 0
    const droppedByReason = new Map<string, number>()

    const connections = links
      .map((link, idx) => {
        // Link endpoints can be either string IDs or already-resolved objects
        // Handle both cases: if it's a string, use it directly; if it's an object, extract .id
        const getNodeId = (endpoint: any): string => {
          return typeof endpoint === 'string' ? endpoint : endpoint?.id
        }

        const sourceId = getNodeId(link.source)
        const targetId = getNodeId(link.target)
        const sourceNode = nodeMap.get(sourceId)
        const targetNode = nodeMap.get(targetId)

        // Skip links where either endpoint is not found
        if (!sourceNode || !targetNode) {
          droppedCount++
          return null
        }

        resolvedCount++
        return {
          source: getRadialConnectionEndpoint(sourceNode),
          target: getRadialConnectionEndpoint(targetNode),
          sourceNode,
          targetNode,
        }
      })
      .filter(Boolean) as RadialConnection[]

    return connections
  }

  return {
    getRadialConnectionEndpoints,
    getNodeRadiusForKind,
    getRadialConnectionEndpoint,
  }
}
