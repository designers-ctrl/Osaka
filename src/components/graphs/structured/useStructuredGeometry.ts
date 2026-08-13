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
import { STRUCTURED_NODE_SIZES, STRUCTURED_CONNECTIONS } from './structuredTokens'
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
    // Safety: angle and orbitDistance must exist from useD3Hierarchy.
    // 0 is a VALID angle — a falsy check here sent the 3-o'clock node's
    // connections to its raw center instead of its ring edge.
    if (node.angle === undefined || node.orbitDistance === undefined) {
      // Fallback: use node's x/y if available (shouldn't happen in normal flow)
      return { x: node.x || 0, y: node.y || 0 }
    }

    // `effectiveKind` (set by useStructuredRenderer's entity-ring remap) wins
    // over the node's own kind: a cluster repositioned to the entity ring must
    // size its connection endpoint by the ENTITY node radius it is drawn with.
    const nodeRadius = getNodeRadiusForKind((node as any).effectiveKind || node.kind)
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
   * A node's center in viewport coordinates: preferably from its ring
   * placement (angle × orbitDistance, the values the renderers draw with),
   * falling back to the stored x/y.
   */
  function getNodeCenter(node: PositionedNode): ConnectionEndpoint {
    if (node.angle !== undefined && node.orbitDistance !== undefined) {
      return {
        x: Math.cos(node.angle) * node.orbitDistance,
        y: Math.sin(node.angle) * node.orbitDistance,
      }
    }
    return { x: node.x || 0, y: node.y || 0 }
  }

  /**
   * Where the ray from a node's center toward the curve's control point
   * crosses the node's circumference — the exact point the drawn Bézier
   * should attach so it never continues inside the circle. Uses the node's
   * ACTUAL rendered radius (`effectiveKind` wins for cluster nodes remapped
   * onto the entity ring). Degenerate case (control at the node center)
   * falls back to the inward radial edge.
   */
  function getPerimeterEndpoint(
    node: PositionedNode,
    center: ConnectionEndpoint,
    controlX: number,
    controlY: number,
  ): ConnectionEndpoint {
    const nodeRadius = getNodeRadiusForKind((node as any).effectiveKind || node.kind)
    const dx = controlX - center.x
    const dy = controlY - center.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return getRadialConnectionEndpoint(node)
    return {
      x: center.x + (dx / len) * nodeRadius,
      y: center.y + (dy / len) * nodeRadius,
    }
  }

  /**
   * First intersection of the ray control → endpoint with a circle, i.e.
   * where the arriving curve crosses the circle's circumference. Returns
   * null when the ray misses the circle.
   */
  function rayCircleEntry(
    control: ConnectionEndpoint,
    endpoint: ConnectionEndpoint,
    circle: { x: number, y: number, r: number },
  ): ConnectionEndpoint | null {
    const dx = endpoint.x - control.x
    const dy = endpoint.y - control.y
    const fx = control.x - circle.x
    const fy = control.y - circle.y
    const a = dx * dx + dy * dy
    if (a === 0) return null
    const b = 2 * (fx * dx + fy * dy)
    const c = fx * fx + fy * fy - circle.r * circle.r
    const disc = b * b - 4 * a * c
    if (disc < 0) return null
    const t = (-b - Math.sqrt(disc)) / (2 * a) // entry point (nearer to control)
    if (t < 0 || t > 1) return null
    return { x: control.x + t * dx, y: control.y + t * dy }
  }

  /**
   * No connection may terminate INSIDE a rendered entity-summary circle.
   * Invisible nodes (document hubs, raw entities) share the 300px orbit with
   * the drawn summaries, so an endpoint that is geometrically correct for
   * its own (unrendered) node can still land within a summary circle. When
   * that happens, the endpoint is moved to where the arriving curve
   * (ray from its control point) crosses that circle's circumference —
   * a true intersection, not a mask or a fixed offset.
   */
  function clampEndpointToSummaryPerimeter(
    endpoint: ConnectionEndpoint,
    ownNodeId: string,
    control: ConnectionEndpoint,
    summaryCircles: Array<{ id: string, x: number, y: number, r: number }>,
  ): ConnectionEndpoint {
    for (const circle of summaryCircles) {
      if (circle.id === ownNodeId) continue // own perimeter already exact
      const dist = Math.hypot(endpoint.x - circle.x, endpoint.y - circle.y)
      if (dist >= circle.r) continue
      const entry = rayCircleEntry(control, endpoint, circle)
      if (entry) return entry
      // Ray degenerate (control inside the circle): nearest perimeter point
      if (dist > 0) {
        return {
          x: circle.x + ((endpoint.x - circle.x) / dist) * circle.r,
          y: circle.y + ((endpoint.y - circle.y) / dist) * circle.r,
        }
      }
    }
    return endpoint
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

    // The rendered entity-summary circles (clusters remapped onto the entity
    // ring) — used to keep every endpoint outside their perimeters.
    const summaryCircles = positionedNodes
      .filter(node => node.kind === 'cluster' && (node as any).effectiveKind === 'entity')
      .map(node => {
        const center = getNodeCenter(node)
        return { id: node.id, x: center.x, y: center.y, r: getNodeRadiusForKind('entity') }
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

        // ── PERIMETER-INTERSECTION ENDPOINTS ─────────────────────────────
        // The drawn connection is a quadratic Bézier whose control point is
        // the chord midpoint pulled toward the graph center by
        // bundleStrength (see renderRadialConnections.generateCurvedPath).
        // Each endpoint therefore leaves its node heading TOWARD that
        // control point — so the correct attachment is where the ray from
        // the node center toward the control point crosses the node's
        // circumference (actual node radius). This holds at every angle;
        // no masks, no fixed offsets.
        const sc = getNodeCenter(sourceNode)
        const tc = getNodeCenter(targetNode)
        const bundle = STRUCTURED_CONNECTIONS.bundleStrength
        const controlX = ((sc.x + tc.x) / 2) * (1 - bundle)
        const controlY = ((sc.y + tc.y) / 2) * (1 - bundle)

        const control = { x: controlX, y: controlY }
        return {
          source: clampEndpointToSummaryPerimeter(
            getPerimeterEndpoint(sourceNode, sc, controlX, controlY), sourceId, control, summaryCircles),
          target: clampEndpointToSummaryPerimeter(
            getPerimeterEndpoint(targetNode, tc, controlX, controlY), targetId, control, summaryCircles),
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
