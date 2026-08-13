/**
 * src/components/graphs/useD3Hierarchy.ts
 *
 * Three-ring hierarchical layout: Sources (inner) → Clusters (middle) → Insights (outer)
 * All positioning derived from graphTokens.ts - no hardcoded values.
 */

import type { NetworkNode, NetworkLink } from '@/components/charts'
import {
  HIERARCHY_LAYOUT,
  NODE_DIAMETERS,
  getNodeRadius,
  getNodeDiameter,
} from './graphTokens'
import { STRUCTURED_RINGS } from '@/components/graphs/structured/structuredTokens'

export interface HierarchyConfig {
  width: number
  height: number
}

interface NodeWithRing extends NetworkNode {
  ring?: number
  angle?: number
  orbitDistance?: number
}

export function useD3Hierarchy() {
  /**
   * Get orbit distance for a ring in Structured view.
   * Reads from STRUCTURED_RINGS, not the Unstructured LAYOUT_RINGS.
   * Maps ring keys to their radius values.
   */
  function getStructuredOrbitDistance(ringKey: string): number {
    const distances = STRUCTURED_RINGS as Record<string, number>
    return distances[ringKey] || 300 // Fallback to entity ring distance
  }

  /**
   * Get ring order for Structured view.
   * Maps ring keys to their ordering (determines visual layering).
   */
  function getStructuredRingOrder(ringKey: string): number {
    const ringOrder: Record<string, number> = {
      center: 0,
      source: 0,
      insight: 1,
      entity: 2,
      cluster: 3,
      document: 0,
    }
    return ringOrder[ringKey] || 2 // Fallback to entity order
  }

  /**
   * Organize nodes by ring (source, cluster, insight, entity, document)
   */
  function organizeByRing(nodes: NetworkNode[]): Map<string, NetworkNode[]> {
    const rings = new Map<string, NetworkNode[]>()

    nodes.forEach((node) => {
      let ringKey = 'entity' // Default fallback
      if (node.kind === 'source' || node.kind === 'document') {
        ringKey = 'source' // Sources and documents in inner ring
      } else if (node.kind === 'cluster') {
        ringKey = 'cluster' // Clusters in middle ring
      } else if (node.kind === 'insight') {
        ringKey = 'insight' // Insights in outer ring
      }

      if (!rings.has(ringKey)) {
        rings.set(ringKey, [])
      }
      rings.get(ringKey)!.push(node)
    })

    return rings
  }

  /**
   * Calculate angle for a node within its ring
   * Distributes nodes evenly around the circle
   */
  function calculateAngle(
    index: number,
    totalInRing: number,
  ): number {
    if (totalInRing === 1) return 0
    const anglePerNode = (Math.PI * 2) / totalInRing
    return index * anglePerNode
  }

  /**
   * Create hierarchical layout with three rings
   * Sources → Clusters → Insights
   */
  function createHierarchicalLayout(
    nodes: NetworkNode[],
    _links: NetworkLink[],
    config: HierarchyConfig,
  ): NodeWithRing[] {
    const centerX = config.width / 2
    const centerY = config.height / 2

    const rings = organizeByRing(nodes)
    const layoutNodes: NodeWithRing[] = nodes.map(n => ({ ...n }))

    // Ring order from graphTokens
    const ringOrder = ['source', 'cluster', 'insight', 'entity', 'document']

    // Process each ring
    ringOrder.forEach((ringKey) => {
      const ringNodes = rings.get(ringKey) || []
      if (ringNodes.length === 0) return

      // Get orbit distance from Structured view tokens
      const orbitDistance = getStructuredOrbitDistance(ringKey)

      // Position nodes in this ring
      ringNodes.forEach((node, nodeIdx) => {
        const angle = calculateAngle(nodeIdx, ringNodes.length)

        // Calculate node diameter (dynamic for clusters/insights, fixed for others)
        let nodeDiameter: number
        if (ringKey === 'cluster') {
          if ((node as any).weight !== undefined) {
            // Weight (0-100) takes precedence for cluster sizing
            nodeDiameter = getNodeDiameter(ringKey, (node as any).weight, true)
          } else if ((node as any).entityCount !== undefined) {
            // Fall back to entityCount if weight not available
            nodeDiameter = getNodeDiameter(ringKey, (node as any).entityCount, false)
          } else {
            nodeDiameter = getNodeDiameter(ringKey)
          }
        } else if (ringKey === 'insight' && node.size) {
          nodeDiameter = getNodeDiameter(ringKey, node.size)
        } else {
          nodeDiameter = getNodeDiameter(ringKey)
        }

        // Calculate position on the ring (relative to viewport center which will be translated by the viewport group)
        // Do NOT add centerX/centerY here — the viewport group already applies translate(centerX, centerY)
        const x = Math.cos(angle) * orbitDistance
        const y = Math.sin(angle) * orbitDistance

        // Update the layout node
        const layoutNode = layoutNodes.find(n => n.id === node.id)
        if (layoutNode) {
          layoutNode.x = x
          layoutNode.y = y
          layoutNode.ring = getStructuredRingOrder(ringKey)
          layoutNode.angle = angle
          layoutNode.orbitDistance = orbitDistance
          // Store the calculated diameter for reference
          ;(layoutNode as any).calculatedDiameter = nodeDiameter
        }
      })
    })

    return layoutNodes
  }

  return {
    createHierarchicalLayout,
  }
}
