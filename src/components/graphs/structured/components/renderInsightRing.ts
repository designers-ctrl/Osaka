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

    // TODO: Badge rendering will be added here once insight grouping logic is defined.
    // Badge will appear top-right of each insight, showing the count of grouped insights.
    // See INSIGHT_RING.badge in structuredTokens.ts for styling configuration.
}
