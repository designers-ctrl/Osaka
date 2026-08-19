/**
 * src/components/graphs/structured/components/renderClusterEntityBridge.ts
 *
 * Renders the direct Cluster → Entity relationship in the Structured view:
 * for every cluster, exactly ONE simple straight line from the cluster node's
 * inner edge (cluster ring) to its entity-summary node's outer edge (entity
 * ring), along their shared radial angle. Purely render-level — no links are
 * added to the underlying dataset.
 *
 * The confidence badge sits on this line, midway between the two nodes: a
 * compact rounded-RECTANGLE glass badge (radial-gradient fill + hairline border, see
 * CLUSTER_ENTITY_BRIDGE.badge for the Figma CSS it reproduces) containing
 * `percentage + sentiment indicator`, horizontally arranged and vertically
 * centered. The indicator is the SHARED renderSentimentIndicator — the same
 * renderer the center ring's Sentiment Rate meter uses — so status semantics
 * (success/warning/error via the 85/60 thresholds) and segment treatment can
 * never drift between the two. Data source unchanged: cluster `confidence`
 * (real model output).
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
  SENTIMENT_INDICATOR,
} from '../structuredTokens'
import { renderSentimentIndicator } from './renderSentimentIndicator'
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

  const badge = CLUSTER_ENTITY_BRIDGE.badge

  const bridgeGroup = viewportGroup
    .append('g')
    .attr('class', 'structured-cluster-entity-bridges')

  // ── GLASS GRADIENT DEFINITION (shared by every badge) ──────────────────────
  // SVG stand-in for the Figma radial-gradient background; SVG cannot blur
  // its backdrop, so the translucent gradient + hairline border carry the
  // glass reading on their own.
  const gradient = bridgeGroup
    .append('defs')
    .append('radialGradient')
    .attr('id', badge.gradientId)
    .attr('cx', badge.gradient.cx)
    .attr('cy', badge.gradient.cy)
    .attr('r', badge.gradient.r)
  for (const stop of badge.gradient.stops) {
    gradient.append('stop')
      .attr('offset', stop.offset)
      .style('stop-color', stop.color)
  }

  clusterNodes.forEach((node) => {
    const angle = node.angle ?? 0
    const angleDeg = (angle * 180) / Math.PI
    const normalizedAngle = angleDeg < 0 ? angleDeg + 360 : angleDeg
    const isLeftHemisphere = normalizedAngle > 90 && normalizedAngle < 270

    // ── DIRECT LINE (one per cluster, along the shared radial angle) ─────────
    // (datum bound so cluster hover isolation can dim it with its cluster)
    bridgeGroup
      .append('line')
      .datum(node)
      .attr('class', 'cluster-entity-bridge')
      .attr('x1', Math.cos(angle) * innerR)
      .attr('y1', Math.sin(angle) * innerR)
      .attr('x2', Math.cos(angle) * outerR)
      .attr('y2', Math.sin(angle) * outerR)
      .attr('stroke', CLUSTER_ENTITY_BRIDGE.stroke)
      .attr('stroke-width', CLUSTER_ENTITY_BRIDGE.strokeWidth)

    // ── CONFIDENCE BADGE on the line ─────────────────────────────────────────
    // Same data source as before: cluster confidence (real model output).
    const confidencePercent = Math.round(((node as any).confidence || 0) * 100)

    // Spoke frame: rotate to the node's angle, walk out to the badge radius.
    // The inner group flips 180° on the left hemisphere so text stays upright.
    const badgeGroup = bridgeGroup
      .append('g')
      .datum(node)
      .attr('class', 'cluster-entity-badge')
      // Hoverable: pointing at the badge reveals its percentage label (the
      // same reveal hovering its cluster triggers via structuredHover).
      .style('pointer-events', 'auto')
      .style('cursor', 'default')
      .on('mouseenter', () => setBridgeBadgeLabelVisible(viewportGroup, node.id))
      .on('mouseleave', () => setBridgeBadgeLabelVisible(viewportGroup, null))
      // Orientation is (re)applied by applyBridgeBadgeOrientation so the
      // Structured focus can recompute it after rotating the whole ring.
      .attr('data-badge-radius', badgeR)
      .attr('transform',
        `rotate(${angleDeg}) translate(${badgeR}, 0)`
        + (isLeftHemisphere ? ' rotate(180)' : ''))

    // ── INTRINSIC BADGE, two states, both hug-content and centered ──────────
    // DEFAULT (compact): only the sentiment indicator shows —
    //   width = paddingX + indicator + paddingX, text hidden.
    // HOVER (expanded — its cluster hovered via structuredHover, or the badge
    // itself): the percentage label appears —
    //   width = paddingX + text + gap + indicator + paddingX.
    // Both widths are measured here once and stored as data attributes;
    // setBridgeBadgeLabelVisible toggles between them. Height (indicator +
    // paddingY × 2) is identical in both states. The percentage/status data
    // source is unchanged: cluster confidence through the shared
    // renderSentimentIndicator (same 85/60 thresholds as the center ring).
    const percentageText = badgeGroup
      .append('text')
      .attr('class', 'entity-percentage')
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'central')
      .attr('y', 0)
      .attr('font-size', ENTITY_RING.percentage.fontSize)
      .attr('font-weight', ENTITY_RING.percentage.fontWeight)
      .attr('font-family', ENTITY_RING.percentage.fontFamily)
      .attr('fill', ENTITY_RING.percentage.fill)
      .attr('opacity', 0) // hidden at rest — revealed on hover
      .text(`${confidencePercent}%`)

    const textWidth = (percentageText.node() as SVGTextElement).getComputedTextLength()
    const expandedWidth = badge.paddingX + textWidth + badge.gap + SENTIMENT_INDICATOR.width + badge.paddingX
    const compactWidth = badge.paddingX * 2 + SENTIMENT_INDICATOR.width
    const badgeHeight = SENTIMENT_INDICATOR.height + badge.paddingY * 2

    badgeGroup
      .attr('data-expanded-width', expandedWidth)
      .attr('data-compact-width', compactWidth)

    // Expanded-state text position (constant — only its opacity toggles)
    percentageText.attr('x', -expandedWidth / 2 + badge.paddingX)

    // Rounded-rectangle glass badge (gradient fill + hairline border), under
    // the text — sized COMPACT at rest.
    badgeGroup
      .insert('rect', 'text')
      .attr('class', 'cluster-entity-badge-bg')
      .attr('x', -compactWidth / 2)
      .attr('y', -badgeHeight / 2)
      .attr('width', compactWidth)
      .attr('height', badgeHeight)
      .attr('rx', badge.borderRadius).attr('ry', badge.borderRadius) // ~4px rounded-rectangle corners
      .attr('fill', `url(#${badge.gradientId})`)
      .attr('stroke', badge.stroke)
      .attr('stroke-width', badge.strokeWidth)

    // Sentiment indicator — in its own SLOT group so the two states can move
    // it without re-rendering: centered in the compact badge, right-aligned in
    // the expanded one. SHARED renderer (renderSentimentIndicator): same 3
    // segments, same design-spec thresholds (85/60), same semantic
    // success/warning/error coloring and inactive treatment as the center
    // ring's Sentiment Rate meter.
    const indicatorSlot = badgeGroup
      .append('g')
      .attr('class', 'badge-indicator-slot')
      .attr('transform', `translate(${-compactWidth / 2 + badge.paddingX}, 0)`)
    renderSentimentIndicator(indicatorSlot as any, {
      percent: confidencePercent,
      x: SENTIMENT_INDICATOR.width / 2,
      y: -SENTIMENT_INDICATOR.height / 2,
      chartTheme: _config.chartTheme,
    })
  })
}

/**
 * Show (clusterId) or hide (null) a bridge badge's percentage label.
 *
 * DEFAULT state hides every label: badges are compact, indicator-only. While
 * `clusterId` is set — by structuredHover when its cluster is hovered, or by
 * the badge's own mouseenter — that badge expands to fit `text + indicator`
 * and reveals the text; every other badge stays (or returns to) compact. Pure
 * geometry/opacity toggle from the widths measured at render time: the
 * percentage value, thresholds and indicator rendering are untouched.
 */
export function setBridgeBadgeLabelVisible(
  scope: d3.Selection<any, unknown, any, unknown>,
  clusterId: string | null,
) {
  const badge = CLUSTER_ENTITY_BRIDGE.badge
  scope.selectAll<SVGGElement, any>('g.cluster-entity-badge').each(function (d: any) {
    const el = d3.select(this)
    const on = clusterId !== null && d?.id === clusterId
    const width = Number(el.attr(on ? 'data-expanded-width' : 'data-compact-width')) || 0
    el.select('rect.cluster-entity-badge-bg')
      .attr('x', -width / 2)
      .attr('width', width)
    el.select('text.entity-percentage').attr('opacity', on ? 1 : 0)
    el.select('g.badge-indicator-slot').attr('transform', on
      ? `translate(${width / 2 - badge.paddingX - SENTIMENT_INDICATOR.width}, 0)`
      : `translate(${-width / 2 + badge.paddingX}, 0)`)
  })
}

/**
 * Re-orient every bridge badge against the ring's CURRENT rotation.
 *
 * The badge rides its spoke, so on the left half of the circle its text would
 * be upside down and it carries a 180° flip. Which half it is on depends on the
 * angle it is DISPLAYED at, so the Structured focus calls this after rotating
 * the rotor (see applyClusterLabelOrientation for the same pattern).
 */
export function applyBridgeBadgeOrientation(
  scope: d3.Selection<any, unknown, any, unknown>,
  rotationDeg: number,
) {
  scope.selectAll<SVGGElement, any>('g.cluster-entity-badge').each(function (d: any) {
    const el = d3.select(this)
    const angleDeg = ((d?.angle || 0) * 180) / Math.PI
    const displayed = ((((angleDeg + rotationDeg) % 360) + 360) % 360)
    const flipped = displayed > 90 && displayed < 270
    const badgeR = Number(el.attr('data-badge-radius')) || 0
    el.attr('transform',
      `rotate(${angleDeg}) translate(${badgeR}, 0)` + (flipped ? ' rotate(180)' : ''))
  })
}
