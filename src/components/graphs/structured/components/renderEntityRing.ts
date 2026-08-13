/**
 * src/components/graphs/structured/components/renderEntityRing.ts
 *
 * Renders the Entity ring as per-cluster aggregate summaries:
 * 1 simple circular node per cluster, containing that summary's CONNECTION
 * COUNT — the number of currently filtered graph relationships that continue
 * inward from this entity summary (computed by useStructuredRenderer from the
 * live link set; the single render-level Cluster → Entity bridge is not a
 * link and is never counted).
 *
 * The confidence percentage + battery badge that used to render beside these
 * nodes now lives on the Cluster → Entity bridge — see
 * renderClusterEntityBridge.ts.
 */

import * as d3 from 'd3'
import {
  ENTITY_RING,
} from '../structuredTokens'
import type { PositionedNode } from '../useStructuredRenderer'

interface EntityRingConfig {
  chartTheme?: any
  /** Per-cluster-id inward connection counts (from useStructuredRenderer). */
  connectionCounts?: Map<string, number>
}

export function renderEntityRing(
  viewportGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  clusterNodes: PositionedNode[],
  _config: EntityRingConfig = {},
) {
  if (!clusterNodes.length) return

  const nodeRadius = ENTITY_RING.nodeRadius
  const glass = ENTITY_RING.glass

  // ── CREATE ENTITY RING GROUP ───────────────────────────────────────────────

  const entityRing = viewportGroup
    .append('g')
    .attr('class', 'structured-entity-ring')

  // ── GLASS GRADIENT DEFINITION (shared by every entity node) ────────────────
  // Radial gray1 gradient, center → edge (the SVG stand-in for the Figma
  // glass background; CSS backdrop-filter does not apply to SVG shapes).
  const gradient = entityRing
    .append('defs')
    .append('radialGradient')
    .attr('id', glass.gradientId)
    .attr('cx', '50%').attr('cy', '50%').attr('r', '50%')
  for (const stop of glass.gradientStops) {
    gradient.append('stop')
      .attr('offset', stop.offset)
      .style('stop-color', stop.color)
  }

  // ── RENDER EACH CLUSTER SUMMARY CIRCLE ─────────────────────────────────────

  entityRing
    .selectAll('circle.entity-node')
    .data(clusterNodes)
    .join('circle')
    .attr('class', 'entity-node')
    .attr('cx', (d) => d.x || 0)
    .attr('cy', (d) => d.y || 0)
    .attr('r', nodeRadius)
    .attr('fill', `url(#${glass.gradientId})`)
    .attr('stroke', glass.stroke)
    .attr('stroke-width', glass.strokeWidth)
    .style('cursor', 'pointer')
    // ── HOVER HIGHLIGHTING FOR CONNECTIONS ─────────────────────────────────────
    .on('mouseenter', function(event, node) {
      const nodeId = node.id
      viewportGroup.selectAll('.link-foreground').style('opacity', (d: any) => {
        return d.sourceNode.id === nodeId || d.targetNode.id === nodeId ? 0.8 : 0.02
      })
      viewportGroup.selectAll('.link-background').style('opacity', (d: any) => {
        return d.sourceNode.id === nodeId || d.targetNode.id === nodeId ? 0.15 : 0.005
      })
    })
    .on('mouseleave', function() {
      viewportGroup.selectAll('.link-foreground').style('opacity', 0.05)
      viewportGroup.selectAll('.link-background').style('opacity', 0.02)
    })

  // ── CONNECTION COUNT (inside each summary circle) ──────────────────────────
  // The number of filtered relationships continuing inward from this entity
  // summary. The percentage/battery badge moved to the Cluster → Entity
  // bridge (renderClusterEntityBridge.ts) — nothing renders beside the node.
  const connectionCounts = _config.connectionCounts

  clusterNodes.forEach((node) => {
    const connectionCount = connectionCounts?.get(node.id) ?? 0

    // Faint inner highlight ring — the SVG stand-in for the Figma
    // `box-shadow: 0 0 1px rgba(255,255,255,.10) inset`
    entityRing
      .append('circle')
      .attr('class', 'entity-node-highlight')
      .attr('cx', node.x || 0)
      .attr('cy', node.y || 0)
      .attr('r', nodeRadius - glass.innerHighlightWidth)
      .attr('fill', 'none')
      .attr('stroke', glass.innerHighlight)
      .attr('stroke-width', glass.innerHighlightWidth)
      .style('pointer-events', 'none')

    entityRing
      .append('text')
      .attr('class', 'entity-count')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('x', node.x || 0)
      .attr('y', node.y || 0)
      .attr('font-size', ENTITY_RING.count.fontSize)
      .attr('font-weight', ENTITY_RING.count.fontWeight)
      .attr('font-family', ENTITY_RING.count.fontFamily)
      .attr('fill', ENTITY_RING.count.fill)
      // Decorative overlay: must never swallow the circle's hover events
      .style('pointer-events', 'none')
      .text(connectionCount)
  })
}
