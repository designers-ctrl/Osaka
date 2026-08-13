/**
 * src/components/graphs/structured/useStructuredRenderer.ts
 *
 * Orchestrator for the Structured (radial ring-based) graph renderer.
 *
 * Receives canonical graph data and positioned nodes (with ring/angle metadata
 * from useD3Hierarchy), then dispatches to individual ring renderers:
 * - Center avatar ring (account + sentiment)
 * - Insight ring (uniform size + badges)
 * - Entity ring (count + battery indicator)
 * - Cluster ring (uniform size + source icons + arc labels)
 * - Connections with radial-aware geometry
 *
 * Vue owns data state; this function owns D3 rendering.
 */

import * as d3 from 'd3'
import type { NetworkNode, NetworkLink } from '@/components/charts'
import { STRUCTURED_RINGS } from './structuredTokens'
import { renderCenterRing } from './components/renderCenterRing'
import { renderInsightRing } from './components/renderInsightRing'
import { renderEntityRing } from './components/renderEntityRing'
import { renderClusterRing } from './components/renderClusterRing'
import { renderClusterEntityBridge } from './components/renderClusterEntityBridge'
import { renderRadialConnections } from './components/renderRadialConnections'

export interface StructuredRendererConfig {
  width: number
  height: number
  zoom: number
  // User and sentiment data for center avatar (Structured view only)
  userInitials?: string
  sentimentPercent?: number
  sentimentLabel?: string
  // Chart theme object (passed from NetworkGraphD3.vue component context)
  chartTheme?: any
}

export interface PositionedNode extends NetworkNode {
  ring?: number
  angle?: number
  orbitDistance?: number
}

export function useStructuredRenderer() {
  /**
   * Helper: Reposition cluster nodes to the entity ring.
   * Entity ring shows cluster summaries at a different radius (300px) than the cluster ring (400px).
   * This creates repositioned copies for entity-ring rendering.
   */
  function repositionNodesToEntityRing(clusterNodes: PositionedNode[]): PositionedNode[] {
    const entityOrbitDistance = STRUCTURED_RINGS.entity

    return clusterNodes.map(node => {
      // Safety: angle must exist from useD3Hierarchy (0 is a VALID angle —
      // never use a falsy check here, it silently skipped the 3-o'clock node)
      if (node.angle === undefined) return node

      // Recalculate x/y using entity ring radius (300px) instead of cluster ring radius (400px)
      const x = Math.cos(node.angle) * entityOrbitDistance
      const y = Math.sin(node.angle) * entityOrbitDistance

      return {
        ...node,
        x,
        y,
        orbitDistance: entityOrbitDistance,
        ring: 2, // Entity ring order (center=0, insight=1, entity=2, cluster=3)
        // Connection geometry sizes the endpoint by the ENTITY node radius,
        // not the cluster's — see useStructuredGeometry.getRadialConnectionEndpoint
        effectiveKind: 'entity',
      } as PositionedNode
    })
  }

  /**
   * Count the connections that continue INWARD from each cluster's entity
   * summary into the Structured graph: links in the currently filtered set
   * touching that cluster id where both endpoints resolve to positioned
   * nodes (mirroring what renderRadialConnections actually draws). The
   * render-level Cluster → Entity bridge is not a link, so it is never
   * counted. The cluster → entity-summary mapping is the existing identity
   * mapping (same node id repositioned) — no duplicate graph data.
   */
  function computeEntityConnectionCounts(
    positionedNodes: PositionedNode[],
    links: NetworkLink[],
  ): Map<string, number> {
    const nodeMap = new Map<string, PositionedNode>()
    positionedNodes.forEach(node => nodeMap.set(node.id, node))

    const counts = new Map<string, number>()
    const endpointId = (endpoint: any): string =>
      typeof endpoint === 'string' ? endpoint : endpoint?.id

    for (const link of links) {
      const sourceId = endpointId(link.source)
      const targetId = endpointId(link.target)
      const sourceNode = nodeMap.get(sourceId)
      const targetNode = nodeMap.get(targetId)
      if (!sourceNode || !targetNode) continue // dropped by the renderer too

      if (sourceNode.kind === 'cluster') {
        counts.set(sourceId, (counts.get(sourceId) || 0) + 1)
      }
      if (targetNode.kind === 'cluster') {
        counts.set(targetId, (counts.get(targetId) || 0) + 1)
      }
    }
    return counts
  }

  /**
   * Main render function for Structured view.
   * Called when layoutMode === 'structured' from NetworkGraphD3.vue.
   *
   * @param svgElement - The SVG DOM element to render into
   * @param positionedNodes - Nodes with x, y, ring, angle, orbitDistance (from useD3Hierarchy)
   * @param links - Connection links between nodes
   * @param config - Viewport dimensions and zoom level
   */
  function renderStructured(
    svgElement: SVGSVGElement | null,
    positionedNodes: PositionedNode[],
    links: NetworkLink[],
    config: StructuredRendererConfig,
  ) {
    if (!svgElement) return

    const svg = d3.select(svgElement)
    const centerX = config.width / 2
    const centerY = config.height / 2

    // Create main viewport group for all rings
    // Use class 'viewport' (same as unstructured) so zoom transform can be applied uniformly
    const viewport = svg
      .append('g')
      .attr('class', 'viewport')
      .attr('transform', `translate(${centerX}, ${centerY})`)

    // Organize nodes by kind for ring-based rendering
    const nodesByKind = new Map<string, PositionedNode[]>()
    positionedNodes.forEach((node) => {
      if (!nodesByKind.has(node.kind)) {
        nodesByKind.set(node.kind, [])
      }
      nodesByKind.get(node.kind)!.push(node)
    })

    // ── RENDERING DISPATCH ────────────────────────────────────────────
    // Paint order (SVG: later = on top): connections and bridges first so
    // every line sits BENEATH the nodes, rings next, center avatar last so
    // nothing is ever visible through or over it.

    // Connections: radial-aware link geometry (not center-offset like Unstructured).
    // Cluster nodes are swapped for their entity-ring summaries in the node
    // list, so every bundled curve that used to originate at a cluster now
    // originates at its entity summary — the cluster itself only carries the
    // single direct bridge. Hover semantics are unchanged (same node ids).
    if (links.length > 0) {
      const connectionNodes = positionedNodes.map(node =>
        node.kind === 'cluster' ? repositionNodesToEntityRing([node])[0] : node,
      )
      renderRadialConnections(viewport as any, connectionNodes, links, {centerX: 0, centerY: 0})
    }

    // Cluster → Entity bridges: one direct radial line per cluster to its
    // entity summary, carrying the confidence badge. Render-level only —
    // no links are added to the dataset.
    const clusterNodes = nodesByKind.get('cluster') || []
    if (clusterNodes.length > 0) {
      renderClusterEntityBridge(viewport as any, clusterNodes, { chartTheme: config.chartTheme })
    }

    // Insight ring: uniform-size insights with optional badges
    const insightNodes = nodesByKind.get('insight') || []
    if (insightNodes.length > 0) {
      renderInsightRing(viewport as any, insightNodes, links, {centerX: 0, centerY: 0, zoom: config.zoom, chartTheme: config.chartTheme})
    }

    // Entity ring: cluster-summary circles positioned at entity ring radius (300px)
    // Uses the same cluster data as Cluster ring but at a different orbital distance
    if (clusterNodes.length > 0) {
      const entityRingPositionedNodes = repositionNodesToEntityRing(clusterNodes)
      const connectionCounts = computeEntityConnectionCounts(positionedNodes, links)
      renderEntityRing(viewport as any, entityRingPositionedNodes, {
        chartTheme: config.chartTheme,
        connectionCounts,
      })
    }

    // Cluster ring: uniform-size clusters with source icons + arc labels
    if (clusterNodes.length > 0) {
      renderClusterRing(viewport as any, clusterNodes, links, {centerX: 0, centerY: 0, zoom: config.zoom, chartTheme: config.chartTheme})
    }

    // Center ring LAST: the fully opaque avatar must cover any line that
    // passes through the middle of the graph.
    const sourceNodes = nodesByKind.get('source') || []
    if (sourceNodes.length > 0) {
      renderCenterRing(viewport as any, sourceNodes[0], 0, 0, {
        userInitials: config.userInitials,
        sentimentPercent: config.sentimentPercent,
        sentimentLabel: config.sentimentLabel,
        chartTheme: config.chartTheme,
      })
    }
  }

  /**
   * Cleanup function called when component unmounts or layoutMode changes away from 'structured'.
   * Handles any structured-specific teardown (e.g., stop animations, clear state).
   */
  function cleanupStructured() {
    // Any structured-specific cleanup goes here.
    // Currently a no-op; will be populated as renderers are added.
  }

  return {
    renderStructured,
    cleanupStructured,
  }
}
