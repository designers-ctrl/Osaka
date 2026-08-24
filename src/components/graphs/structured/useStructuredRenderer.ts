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
import { isMeaningfulConnection, representativeId } from './structuredHover'
import { NODE_STYLING } from '@/components/graphs/graphTokens'
import { appendLinkDefs } from '@/components/graphs/linkRenderer'
import { deriveStructuredDemoLinks } from './structuredDemoLinks'

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
  /** Cluster click → the Structured focus drill-down (structuredFocus.ts). */
  onClusterClick?: (clusterId: string) => void
}

export interface PositionedNode extends NetworkNode {
  ring?: number
  angle?: number
  orbitDistance?: number
}

export function useStructuredRenderer() {
  /**
   * Helper: Reposition cluster nodes to the entity ring.
   * Entity ring shows cluster summaries at a different radius (STRUCTURED_RINGS.entity) than the cluster ring (STRUCTURED_RINGS.cluster).
   * This creates repositioned copies for entity-ring rendering.
   */
  function repositionNodesToEntityRing(clusterNodes: PositionedNode[]): PositionedNode[] {
    const entityOrbitDistance = STRUCTURED_RINGS.entity

    return clusterNodes.map(node => {
      // Safety: angle must exist from useD3Hierarchy (0 is a VALID angle —
      // never use a falsy check here, it silently skipped the 3-o'clock node)
      if (node.angle === undefined) return node

      // Recalculate x/y using the entity ring radius instead of the cluster ring radius
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
   * Count the VISIBLE relationships of each cluster's entity summary — the
   * exact connections cluster hover lights up, so the number in the circle
   * and the lit lines on hover can never disagree.
   *
   * Uses the SAME normalization rules as structuredHover.ts:
   * - endpoints resolve through representative ids (a raw entity stands for
   *   its owning cluster summary);
   * - both endpoints must be VISIBLE ring kinds (connections to invisible
   *   source/document hubs are never drawn as meaningful lines, so they are
   *   never counted);
   * - self-links (cluster ↔ its own raw entity — both representatives equal)
   *   are never highlighted, so they are never counted.
   * The render-level Cluster → Entity bridge is not a link and is never
   * counted either.
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
      const sourceNode = nodeMap.get(endpointId(link.source))
      const targetNode = nodeMap.get(endpointId(link.target))
      if (!sourceNode || !targetNode) continue // dropped by the renderer too
      const conn = { sourceNode, targetNode }
      // The SAME predicate the mesh draws by — so a summary reading 0 provably
      // has no line, and a line provably belongs to a non-zero count.
      if (!isMeaningfulConnection(conn)) continue
      const sourceRep = representativeId(sourceNode)
      const targetRep = representativeId(targetNode)

      // Attribute to any endpoint whose REPRESENTATIVE is a cluster summary —
      // a raw entity endpoint counts for its owning cluster.
      if (sourceNode.kind === 'cluster' || sourceNode.kind === 'entity') {
        counts.set(sourceRep, (counts.get(sourceRep) || 0) + 1)
      }
      if (targetNode.kind === 'cluster' || targetNode.kind === 'entity') {
        counts.set(targetRep, (counts.get(targetRep) || 0) + 1)
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

    // ── INSIGHT GLOW DEFS ─────────────────────────────────────────────────
    // The SAME `insight-shadow` / `insight-shadow-hover` filters the
    // Unstructured pass defines (same ids, same NODE_STYLING.insight tokens).
    // They must exist in THIS pass too: the SVG is cleared on mode switch,
    // and both the insight ring and the focus drill-down reference them —
    // an `.insight-node` referencing a missing filter would not paint at all.
    // Declared here (not in renderInsightRing) so they exist even when the
    // ring renders zero insights.
    const defs = svg.append('defs')
    const glowDef = (id: string, glow: { blur: number, color: string, opacity: number, regionMargin: number }) => {
      defs.append('filter')
        .attr('id', id)
        .attr('x', `${-glow.regionMargin * 100}%`)
        .attr('y', `${-glow.regionMargin * 100}%`)
        .attr('width', `${(1 + glow.regionMargin * 2) * 100}%`)
        .attr('height', `${(1 + glow.regionMargin * 2) * 100}%`)
        .append('feDropShadow')
        .attr('dx', 0)
        .attr('dy', 0)
        .attr('stdDeviation', glow.blur / 2) // CSS blur = 2 × stdDeviation
        .attr('flood-color', glow.color)
        .attr('flood-opacity', glow.opacity)
    }
    glowDef('insight-shadow', NODE_STYLING.insight.glow)
    glowDef('insight-shadow-hover', NODE_STYLING.insight.hover.glow)

    // ── CONNECTION DEFS ───────────────────────────────────────────────────
    // The same reason as the filters above, and the same trap: a paint server
    // is per-SVG. Anything in this pass stroked with
    // `url(#link-gradient-foreground)` — the cluster FOCUS connections
    // (structuredFocus.ts), STRUCTURED_CONNECTIONS.line — draws NOTHING at all
    // if the def is absent, because SVG does not render an element whose paint
    // server reference cannot be resolved. That was the "missing focus
    // connections" bug: correct geometry, correct opacity, no paint.
    appendLinkDefs(defs as any)

    // Create main viewport group for all rings
    // Use class 'viewport' (same as unstructured) so zoom transform can be applied uniformly
    const viewport = svg
      .append('g')
      .attr('class', 'viewport')
      .attr('transform', `translate(${centerX}, ${centerY})`)

    /*
     * The link list every downstream consumer sees: the dataset's own links
     * PLUS the deterministic demo relationships (structuredDemoLinks.ts). One
     * list, built once — the mesh, the entity counts and the focus all read it,
     * so a drawn line, the number in its endpoint's summary and the focus's
     * idea of what relates can never disagree.
     */
    const linkSet: NetworkLink[] = [
      ...links,
      ...deriveStructuredDemoLinks(positionedNodes, links),
    ]

    // Organize nodes by kind for ring-based rendering
    const nodesByKind = new Map<string, PositionedNode[]>()
    positionedNodes.forEach((node) => {
      if (!nodesByKind.has(node.kind)) {
        nodesByKind.set(node.kind, [])
      }
      nodesByKind.get(node.kind)!.push(node)
    })

    /*
     * THE ROTOR. Everything that lives on a ring goes inside this group so
     * the Structured FOCUS interaction can rotate the whole radial graph as
     * one rigid body (structuredFocus.ts) — the clicked cluster travels to
     * the focus side still attached to its ring, rather than being lifted out
     * of it.
     *
     * The centre ring is deliberately appended OUTSIDE the rotor: it sits at
     * the origin so rotation would not move it, but it would spin its avatar
     * initials and "Sentiment Rate" text upside down.
     */
    const rotor = viewport.append('g').attr('class', 'structured-rotor')

    // ── RENDERING DISPATCH ────────────────────────────────────────────
    // Paint order (SVG: later = on top): connections and bridges first so
    // every line sits BENEATH the nodes, rings next, center avatar last so
    // nothing is ever visible through or over it.

    // Connections: radial-aware link geometry (not center-offset like Unstructured).
    // Cluster nodes are swapped for their entity-ring summaries in the node
    // list, so every bundled curve that used to originate at a cluster now
    // originates at its entity summary — the cluster itself only carries the
    // single direct bridge. Hover semantics are unchanged (same node ids).
    if (linkSet.length > 0) {
      const connectionNodes = positionedNodes.map(node =>
        node.kind === 'cluster' ? repositionNodesToEntityRing([node])[0] : node,
      )
      renderRadialConnections(rotor as any, connectionNodes, linkSet, {centerX: 0, centerY: 0, zoom: config.zoom})
    }

    // Cluster → Entity bridges: one direct radial line per cluster to its
    // entity summary, carrying the confidence badge. Render-level only —
    // no links are added to the dataset.
    const clusterNodes = nodesByKind.get('cluster') || []
    if (clusterNodes.length > 0) {
      renderClusterEntityBridge(rotor as any, clusterNodes, { chartTheme: config.chartTheme })
    }

    // Insight ring: uniform-size insights with optional badges
    const insightNodes = nodesByKind.get('insight') || []
    if (insightNodes.length > 0) {
      renderInsightRing(rotor as any, insightNodes, linkSet, {centerX: 0, centerY: 0, zoom: config.zoom, chartTheme: config.chartTheme})
    }

    // Entity ring: cluster-summary circles positioned at the entity ring radius
    // Uses the same cluster data as Cluster ring but at a different orbital distance
    if (clusterNodes.length > 0) {
      const entityRingPositionedNodes = repositionNodesToEntityRing(clusterNodes)
      const connectionCounts = computeEntityConnectionCounts(positionedNodes, linkSet)
      renderEntityRing(rotor as any, entityRingPositionedNodes, {
        chartTheme: config.chartTheme,
        connectionCounts,
      })
    }

    // Cluster ring: uniform-size clusters with source icons + arc labels
    if (clusterNodes.length > 0) {
      renderClusterRing(rotor as any, clusterNodes, linkSet, {centerX: 0, centerY: 0, zoom: config.zoom, chartTheme: config.chartTheme, onClusterClick: config.onClusterClick})
    }

    /*
     * ── ONE CLICK TARGET PER CLUSTER ─────────────────────────────────────
     * The whole cluster REPRESENTATION opens the drill-down, not just the
     * node: its count badge and its entity summary both carry the cluster's
     * own datum (bound exactly for per-cluster treatments like this), so both
     * route to the SAME `onClusterClick` the node uses — one handler, three
     * surfaces. `stopPropagation` keeps the click from also reaching the
     * canvas (which would read it as an empty-canvas click and clear
     * selections), and binding one namespaced handler per GROUP root means a
     * click inside can never bubble into a second trigger.
     */
    if (config.onClusterClick) {
      rotor.selectAll<SVGGElement, any>('g.cluster-entity-badge, g.entity-summary-group')
        .style('cursor', 'pointer')
        .on('click.clusteropen', (event: MouseEvent, d: any) => {
          event.stopPropagation()
          if (d?.id) config.onClusterClick?.(d.id)
        })
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
