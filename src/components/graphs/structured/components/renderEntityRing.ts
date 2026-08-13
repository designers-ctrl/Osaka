/**
 * src/components/graphs/structured/components/renderEntityRing.ts
 *
 * REDESIGNED: Renders the Entity ring as per-cluster aggregate summaries.
 * Shows 1 circle per cluster (38 total, not 72 raw entities).
 *
 * Data mapping (per cluster):
 * - Number inside circle: cluster.entityCount (aggregate entities in this cluster)
 * - Percentage value: cluster.confidence (real model confidence, 0-1 converted to 0-100%)
 * - Battery segments: derived from confidence percentage (0-33%=1, 34-66%=2, 67-100%=3)
 *
 * NOTE: Clusters are model output with genuine confidence values (0.72-0.92 range).
 * Entity nodes (raw ingested data) do not have confidence fields, so we use cluster confidence.
 */

import * as d3 from 'd3'
import {
  ENTITY_RING,
  getStructuredNodeRadius,
} from '../structuredTokens'
import { NODE_STYLING } from '@/components/graphs/graphTokens'
import type { PositionedNode } from '../useStructuredRenderer'
import type { NetworkLink } from '@/components/charts'

interface EntityRingConfig {
  chartTheme?: any
}

export function renderEntityRing(
  viewportGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  clusterNodes: PositionedNode[],
  _config: EntityRingConfig = {},
) {
  if (!clusterNodes.length) return

  const chartTheme = _config.chartTheme
  const nodeRadius = ENTITY_RING.nodeRadius

  // ── CREATE ENTITY RING GROUP ───────────────────────────────────────────────

  const entityRing = viewportGroup
    .append('g')
    .attr('class', 'structured-entity-ring')

  // ── RENDER EACH CLUSTER SUMMARY CIRCLE ─────────────────────────────────────

  entityRing
    .selectAll('circle.entity-node')
    .data(clusterNodes)
    .join('circle')
    .attr('class', 'entity-node')
    .attr('cx', (d) => d.x || 0)
    .attr('cy', (d) => d.y || 0)
    .attr('r', nodeRadius)
    .attr('fill', chartTheme?.categorical?.[1] || '#7FBB82') // Theme color with fallback
    .attr('stroke', NODE_STYLING.insight.stroke)
    .attr('stroke-width', ENTITY_RING.strokeWidth)
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

  // Render text elements for each cluster node
  clusterNodes.forEach((node, index) => {
    // Extract cluster data once at loop start
    const entityCount = (node as any).entityCount || 0
    const clusterId = node.id
    const clusterConfidence = (node as any).confidence || 0

    // ── ENTITY COUNT (aggregate: how many entities in this cluster) ──────────────

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
      .text(entityCount)

    // ── CLUSTER CONFIDENCE PERCENTAGE ──────────────────────────────────────────

    // Use real cluster confidence (not mock) — clusters are model output with confidence values
    const confidencePercent = Math.round(clusterConfidence * 100)
    const labelY = (node.y || 0) + nodeRadius + ENTITY_RING.percentage.marginTop

    entityRing
      .append('text')
      .attr('class', 'entity-percentage')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('x', node.x || 0)
      .attr('y', labelY)
      .attr('font-size', ENTITY_RING.percentage.fontSize)
      .attr('font-weight', ENTITY_RING.percentage.fontWeight)
      .attr('font-family', ENTITY_RING.percentage.fontFamily)
      .attr('fill', ENTITY_RING.percentage.fill)
      .text(`${confidencePercent}%`)

    // ── BATTERY INDICATOR (3 segments, based on confidence percentage) ───────────────

    const batteryY = labelY + ENTITY_RING.percentage.fontSize + ENTITY_RING.battery.marginTop
    const segmentWidth = (ENTITY_RING.battery.width - (ENTITY_RING.battery.gap * (ENTITY_RING.battery.segments - 1))) / ENTITY_RING.battery.segments
    const startX = (node.x || 0) - (ENTITY_RING.battery.width / 2)

    // Calculate how many segments to fill based on confidence percentage
    let segmentsFilled = 1
    if (confidencePercent >= 67) {
      segmentsFilled = 3
    } else if (confidencePercent >= 34) {
      segmentsFilled = 2
    } else {
      segmentsFilled = 1
    }

    // Render battery segments
    for (let i = 0; i < ENTITY_RING.battery.segments; i++) {
      const segmentX = startX + (i * (segmentWidth + ENTITY_RING.battery.gap))
      const isFilled = i < segmentsFilled
      const color = isFilled ? ENTITY_RING.battery.activeColor : ENTITY_RING.battery.inactiveColor

      entityRing
        .append('rect')
        .attr('class', `entity-battery-segment segment-${i}`)
        .attr('x', segmentX)
        .attr('y', batteryY)
        .attr('width', segmentWidth)
        .attr('height', ENTITY_RING.battery.height)
        .attr('fill', color)
        .attr('rx', ENTITY_RING.battery.borderRadius)
    }
  })
}
