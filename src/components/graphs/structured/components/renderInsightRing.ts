/**
 * src/components/graphs/structured/components/renderInsightRing.ts
 *
 * Renders the Insight ring: uniform-size insights positioned on a circle.
 *
 * Key points:
 * - All insights have UNIFORM diameter (20px), regardless of size/importance in data
 * - No badges displayed (badge grouping logic is a future task once defined)
 * - Styled with INSIGHT_RING tokens (color from chartTheme)
 * - Positioned by useD3Hierarchy on the 140px ring
 *
 * TODO (future): Add badge rendering once insight grouping/merging logic is defined.
 * Badges will appear top-right of each insight node to indicate grouped insights.
 */

import * as d3 from 'd3'
import {
  INSIGHT_RING,
  getStructuredNodeRadius,
} from '../structuredTokens'
import { applyStructuredHoverIsolation } from '../structuredHover'
import { NODE_STYLING } from '@/components/graphs/graphTokens'
import type { PositionedNode } from '../useStructuredRenderer'
import type { NetworkLink } from '@/components/charts'

interface InsightRingConfig {
  centerX: number
  centerY: number
  zoom: number
  chartTheme?: any
}

export function renderInsightRing(
  viewportGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  insightNodes: PositionedNode[],
  _links: NetworkLink[],
  _config: InsightRingConfig = { centerX: 0, centerY: 0, zoom: 1 },
) {
  if (!insightNodes.length) return

  const nodeRadius = INSIGHT_RING.nodeRadius
  const chartTheme = _config.chartTheme

  // ── CREATE INSIGHT RING GROUP ──────────────────────────────────────────────

  const insightRing = viewportGroup
    .append('g')
    .attr('class', 'structured-insight-ring')

  // ── RENDER EACH INSIGHT NODE ──────────────────────────────────────────────

  insightRing
    .selectAll('circle')
    .data(insightNodes)
    .join('circle')
    .attr('class', 'insight-node')
    .attr('cx', (d) => d.x || 0)
    .attr('cy', (d) => d.y || 0)
    .attr('r', nodeRadius)
    .attr('fill', chartTheme?.categorical?.[0] || '#F2C585') // Yellow accent (same as Unstructured view)
    .attr('stroke', NODE_STYLING.insight.stroke) // #7C6749 — shared with Unstructured rendering
    .attr('stroke-width', INSIGHT_RING.strokeWidth)
    // Resting yellow glow — the same filter (and tokens) Unstructured insight
    // nodes carry; the def is declared by useStructuredRenderer for this pass.
    .attr('filter', 'url(#insight-shadow)')
    .style('cursor', 'pointer')
    // ── HOVER: unified neighborhood isolation (structuredHover.ts) ───────────
    // Same rule as cluster/entity hover, derived from the resolved drawn
    // connections — node visibility can never disagree with link highlighting.
    .on('mouseenter', function (_event, node) {
      applyStructuredHoverIsolation(viewportGroup as any, node.id)
    })
    .on('mouseleave', function () {
      applyStructuredHoverIsolation(viewportGroup as any, null)
    })

    // TODO: Badge rendering will be added here once insight grouping logic is defined.
    // Badge will appear top-right of each insight, showing the count of grouped insights.
    // See INSIGHT_RING.badge in structuredTokens.ts for styling configuration.
}
