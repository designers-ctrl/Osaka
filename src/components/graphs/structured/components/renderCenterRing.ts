/**
 * src/components/graphs/structured/components/renderCenterRing.ts
 *
 * Renders the center avatar ring: account initials, sentiment gauge, and label.
 *
 * Data flow:
 * - Initials: from config.userInitials (graphWorkspace.user.initials)
 * - Sentiment percentage: from config.sentimentPercent (graphWorkspace.meters.sentiment)
 * - "Sentiment Rate" label: from config.sentimentLabel or structured token default
 */

import * as d3 from 'd3'
import {
  CENTER_AVATAR,
} from '../structuredTokens'
import type { PositionedNode } from '../useStructuredRenderer'

interface CenterRingConfig {
  userInitials?: string
  sentimentPercent?: number
  sentimentLabel?: string
  chartTheme?: any
}

export function renderCenterRing(
  viewportGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  sourceNode: PositionedNode,
  _centerX: number, // Unused; viewport already translated
  _centerY: number, // Unused; viewport already translated
  config: CenterRingConfig = {},
) {
  const chartTheme = config.chartTheme
  const avatarRadius = CENTER_AVATAR.radius

  // ── DATA FROM CONFIG (with fallback values) ────────────────────────────────
  const userInitials = config.userInitials || 'GR' // Fallback to default
  const sentimentPercent = config.sentimentPercent ?? 75 // Fallback to placeholder
  const sentimentLabel = config.sentimentLabel || CENTER_AVATAR.label.text

  // ── CREATE CONTAINER GROUP FOR CENTER RING ─────────────────────────────────
  // Note: viewport is already translated to (centerX, centerY), so we use (0,0)

  const centerGroup = viewportGroup
    .append('g')
    .attr('class', 'structured-center-ring')

  // ── AVATAR CIRCLE ──────────────────────────────────────────────────────────

  const avatarCircle = centerGroup
    .append('circle')
    .attr('class', 'center-avatar-bg')
    .attr('r', avatarRadius)
    .attr('fill', chartTheme?.categorical?.[0] || '#9D7EEA') // Use theme color with fallback
    .attr('stroke', CENTER_AVATAR.stroke)
    .attr('stroke-width', CENTER_AVATAR.strokeWidth)
    .style('cursor', 'pointer')

  // ── HOVER HIGHLIGHTING FOR CONNECTIONS ─────────────────────────────────────
  // On hover, highlight only connections involving this avatar node
  const nodeId = sourceNode.id
  avatarCircle
    .on('mouseenter', function() {
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

  // ── INITIALS TEXT ──────────────────────────────────────────────────────────

  centerGroup
    .append('text')
    .attr('class', 'center-avatar-initials')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', CENTER_AVATAR.initials.fontSize)
    .attr('font-weight', CENTER_AVATAR.initials.fontWeight)
    .attr('font-family', CENTER_AVATAR.initials.fontFamily)
    .attr('fill', CENTER_AVATAR.initials.fill)
    .text(userInitials)

  // ── GAUGE BACKGROUND (INACTIVE) ────────────────────────────────────────────

  centerGroup
    .append('rect')
    .attr('class', 'sentiment-gauge-bg')
    .attr('x', -CENTER_AVATAR.gauge.width / 2)
    .attr('y', avatarRadius + CENTER_AVATAR.gauge.marginTop)
    .attr('width', CENTER_AVATAR.gauge.width)
    .attr('height', CENTER_AVATAR.gauge.height)
    .attr('fill', CENTER_AVATAR.gauge.backgroundColor)
    .attr('rx', CENTER_AVATAR.gauge.borderRadius)

  // ── GAUGE FILL (ACTIVE) ────────────────────────────────────────────────────

  const fillWidth = (sentimentPercent / 100) * CENTER_AVATAR.gauge.width

  centerGroup
    .append('rect')
    .attr('class', 'sentiment-gauge-fill')
    .attr('x', -CENTER_AVATAR.gauge.width / 2)
    .attr('y', avatarRadius + CENTER_AVATAR.gauge.marginTop)
    .attr('width', fillWidth)
    .attr('height', CENTER_AVATAR.gauge.height)
    .attr('fill', CENTER_AVATAR.gauge.fillColor)
    .attr('rx', CENTER_AVATAR.gauge.borderRadius)

  // ── PERCENTAGE TEXT ────────────────────────────────────────────────────────

  centerGroup
    .append('text')
    .attr('class', 'sentiment-percentage')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('x', 0)
    .attr('y', avatarRadius + CENTER_AVATAR.gauge.marginTop + CENTER_AVATAR.gauge.height + CENTER_AVATAR.percentage.marginTop)
    .attr('font-size', CENTER_AVATAR.percentage.fontSize)
    .attr('font-weight', CENTER_AVATAR.percentage.fontWeight)
    .attr('font-family', CENTER_AVATAR.percentage.fontFamily)
    .attr('fill', CENTER_AVATAR.percentage.fill)
    .text(`${Math.round(sentimentPercent)}%`)

  // ── LABEL ("Sentiment Rate") ───────────────────────────────────────────────

  centerGroup
    .append('text')
    .attr('class', 'sentiment-label')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('x', 0)
    .attr('y', avatarRadius + CENTER_AVATAR.gauge.marginTop + CENTER_AVATAR.gauge.height + CENTER_AVATAR.percentage.marginTop + CENTER_AVATAR.label.marginTop + 14)
    .attr('font-size', CENTER_AVATAR.label.fontSize)
    .attr('font-weight', CENTER_AVATAR.label.fontWeight)
    .attr('font-family', CENTER_AVATAR.label.fontFamily)
    .attr('fill', CENTER_AVATAR.label.fill)
    .text(sentimentLabel)
}
