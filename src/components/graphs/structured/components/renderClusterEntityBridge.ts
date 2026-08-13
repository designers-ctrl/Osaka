/**
 * src/components/graphs/structured/components/renderClusterEntityBridge.ts
 *
 * Renders the direct Cluster → Entity relationship in the Structured view:
 * for every cluster, exactly ONE simple straight line from the cluster node's
 * inner edge (cluster ring) to its entity-summary node's outer edge (entity
 * ring), along their shared radial angle. Purely render-level — no links are
 * added to the underlying dataset.
 *
 * The confidence badge (percentage + segmented battery) sits on this line,
 * approximately midway between the two nodes. Data source unchanged from the
 * previous Entity-ring badge: cluster `confidence` (real model output), with
 * the same ENTITY_RING percentage/battery styling tokens.
 *
 * Orientation follows the radial direction of the relationship (the same
 * spoke convention as the cluster ring's category labels), with the standard
 * left-hemisphere 180° flip so text is never upside down.
 *
 * Hierarchy this renderer draws (per cluster):
 *
 *   CLUSTER  ○
 *            │
 *          [badge]
 *            │
 *   ENTITY   ●   → bundled connections continue inward from here
 */

import * as d3 from 'd3'
import {
  STRUCTURED_RINGS,
  STRUCTURED_NODE_SIZES,
  ENTITY_RING,
  CLUSTER_ENTITY_BRIDGE,
} from '../structuredTokens'
import type { PositionedNode } from '../useStructuredRenderer'

interface BridgeConfig {
  chartTheme?: any
}

export function renderClusterEntityBridge(
  viewportGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  clusterNodes: PositionedNode[],
  _config: BridgeConfig = {},
) {
  if (!clusterNodes.length) return

  const clusterRadius = STRUCTURED_NODE_SIZES.cluster / 2
  const entityRadius = STRUCTURED_NODE_SIZES.entity / 2
  // The line spans the free radial corridor between the two node edges
  const outerR = STRUCTURED_RINGS.cluster - clusterRadius // cluster inner edge
  const innerR = STRUCTURED_RINGS.entity + entityRadius // entity outer edge
  const badgeR = (outerR + innerR) / 2 // badge midway on the line

  const bridgeGroup = viewportGroup
    .append('g')
    .attr('class', 'structured-cluster-entity-bridges')

  clusterNodes.forEach((node) => {
    const angle = node.angle ?? 0
    const angleDeg = (angle * 180) / Math.PI
    const normalizedAngle = angleDeg < 0 ? angleDeg + 360 : angleDeg
    const isLeftHemisphere = normalizedAngle > 90 && normalizedAngle < 270

    // ── DIRECT LINE (one per cluster, along the shared radial angle) ─────────
    bridgeGroup
      .append('line')
      .attr('class', 'cluster-entity-bridge')
      .attr('x1', Math.cos(angle) * innerR)
      .attr('y1', Math.sin(angle) * innerR)
      .attr('x2', Math.cos(angle) * outerR)
      .attr('y2', Math.sin(angle) * outerR)
      .attr('stroke', CLUSTER_ENTITY_BRIDGE.stroke)
      .attr('stroke-width', CLUSTER_ENTITY_BRIDGE.strokeWidth)

    // ── CONFIDENCE BADGE on the line ─────────────────────────────────────────
    // Same data source as the previous Entity-ring badge: cluster confidence.
    const confidencePercent = Math.round(((node as any).confidence || 0) * 100)

    // Spoke frame: rotate to the node's angle, walk out to the badge radius.
    // The inner group flips 180° on the left hemisphere so text stays upright.
    const badgeGroup = bridgeGroup
      .append('g')
      .attr('class', 'cluster-entity-badge')
      .style('pointer-events', 'none') // decorative — never intercepts hover
      .attr('transform',
        `rotate(${angleDeg}) translate(${badgeR}, 0)`
        + (isLeftHemisphere ? ' rotate(180)' : ''))

    // Quiet backing so the badge reads over the line it sits on
    badgeGroup
      .append('rect')
      .attr('class', 'cluster-entity-badge-bg')
      .attr('x', -CLUSTER_ENTITY_BRIDGE.badge.width / 2)
      .attr('y', -CLUSTER_ENTITY_BRIDGE.badge.height / 2)
      .attr('width', CLUSTER_ENTITY_BRIDGE.badge.width)
      .attr('height', CLUSTER_ENTITY_BRIDGE.badge.height)
      .attr('rx', CLUSTER_ENTITY_BRIDGE.badge.borderRadius)
      .attr('fill', CLUSTER_ENTITY_BRIDGE.badge.fill)

    // Percentage text (existing ENTITY_RING percentage styling)
    badgeGroup
      .append('text')
      .attr('class', 'entity-percentage')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('x', 0)
      .attr('y', -CLUSTER_ENTITY_BRIDGE.badge.textOffsetY)
      .attr('font-size', ENTITY_RING.percentage.fontSize)
      .attr('font-weight', ENTITY_RING.percentage.fontWeight)
      .attr('font-family', ENTITY_RING.percentage.fontFamily)
      .attr('fill', ENTITY_RING.percentage.fill)
      .text(`${confidencePercent}%`)

    // Battery indicator (existing ENTITY_RING battery styling + thresholds)
    let segmentsFilled = 1
    if (confidencePercent >= 67) {
      segmentsFilled = 3
    } else if (confidencePercent >= 34) {
      segmentsFilled = 2
    }

    const segmentWidth = (ENTITY_RING.battery.width - (ENTITY_RING.battery.gap * (ENTITY_RING.battery.segments - 1))) / ENTITY_RING.battery.segments
    const startX = -ENTITY_RING.battery.width / 2
    const batteryY = CLUSTER_ENTITY_BRIDGE.badge.batteryOffsetY

    for (let i = 0; i < ENTITY_RING.battery.segments; i++) {
      const isFilled = i < segmentsFilled
      badgeGroup
        .append('rect')
        .attr('class', `entity-battery-segment segment-${i}`)
        .attr('x', startX + (i * (segmentWidth + ENTITY_RING.battery.gap)))
        .attr('y', batteryY)
        .attr('width', segmentWidth)
        .attr('height', ENTITY_RING.battery.height)
        .attr('fill', isFilled ? ENTITY_RING.battery.activeColor : ENTITY_RING.battery.inactiveColor)
        .attr('rx', ENTITY_RING.battery.borderRadius)
    }
  })
}
