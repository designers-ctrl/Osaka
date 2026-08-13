/**
 * src/components/graphs/structured/components/renderRadialConnections.ts
 *
 * Renders connections with radial-aware geometry.
 * Connections start/end at node edges along radial lines from graph center,
 * not at node centers like Unstructured's offset geometry.
 *
 * Two-layer rendering: background (blurred glow) + foreground (sharp line).
 */

import * as d3 from 'd3'
import type { PositionedNode } from '../useStructuredRenderer'
import type { NetworkLink } from '@/components/charts'
import { useStructuredGeometry } from '../useStructuredGeometry'
import { STRUCTURED_CONNECTIONS } from '../structuredTokens'

interface RadialConnectionConfig {
  centerX: number
  centerY: number
}

export function renderRadialConnections(
  svgGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  positionedNodes: PositionedNode[],
  links: NetworkLink[],
  config: RadialConnectionConfig,
) {
  if (!links.length) return

  const { getRadialConnectionEndpoints } = useStructuredGeometry()

  // Calculate all connection endpoints using radial geometry
  const radialConnections = getRadialConnectionEndpoints(links, positionedNodes)

  // ── HELPER: Generate curved path with edge bundling effect ──────────
  // Connections arc toward the graph center instead of cutting straight chords.
  // Control point is pulled ~60% toward center from the line's midpoint,
  // creating a graceful curve that reduces visual clutter from overlapping straight lines.
  function generateCurvedPath(source: { x: number; y: number }, target: { x: number; y: number }): string {
    const x1 = source.x
    const y1 = source.y
    const x2 = target.x
    const y2 = target.y

    // Midpoint of the straight line
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2

    // Control point: pull toward graph center (0, 0) by bundleStrength.
    // This creates the "edge bundling" effect — curves arc toward center
    // rather than radiating outward. The SAME token drives the endpoint
    // perimeter-intersection math in useStructuredGeometry, so curves leave
    // their nodes in exactly the direction the endpoints were computed for.
    const bundleStrength = STRUCTURED_CONNECTIONS.bundleStrength
    const controlX = midX * (1 - bundleStrength)
    const controlY = midY * (1 - bundleStrength)

    // Quadratic bezier curve: M(move to start) Q(control point) (end point)
    return `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`
  }

  // ── CREATE CONNECTION LAYERS ────────────────────────────────────────

  // Background layer: blurred glow effect with reduced opacity for density
  const backgroundLinks = svgGroup
    .append('g')
    .attr('class', 'structured-connections-background')

  backgroundLinks
    .selectAll('path')
    .data(radialConnections)
    .join('path')
    .attr('d', d => generateCurvedPath(d.source, d.target))
    .attr('stroke', '#FFFFFF')
    .attr('stroke-width', 1.5)
    .attr('fill', 'none')
    .attr('opacity', 0.02) // Very faint by default, revealed on hover
    .attr('class', 'link-background')

  // Foreground layer: sharp luminous curve, very faint by default
  const foregroundLinks = svgGroup
    .append('g')
    .attr('class', 'structured-connections-foreground')

  foregroundLinks
    .selectAll('path')
    .data(radialConnections)
    .join('path')
    .attr('d', d => generateCurvedPath(d.source, d.target))
    .attr('stroke', '#FFFFFF')
    .attr('stroke-width', 1)
    .attr('fill', 'none')
    .attr('opacity', 0.05) // Very faint by default, revealed on hover
    .attr('class', 'link-foreground')
}
