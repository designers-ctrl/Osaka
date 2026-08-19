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
  SENTIMENT_INDICATOR,
} from '../structuredTokens'
import { renderSentimentIndicator } from './renderSentimentIndicator'
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
  // Glass-gradient background, OPAQUE: borderless circle filled with a solid
  // vertical gray2→gray3 gradient, so the graph/lines behind it can never
  // show through the avatar surface.

  const gradientId = 'center-avatar-bg-gradient'
  const defs = centerGroup.append('defs')
  const gradient = defs
    .append('linearGradient')
    .attr('id', gradientId)
    .attr('x1', '0').attr('y1', '0')
    .attr('x2', '0').attr('y2', '1') // 180deg: top → bottom
  for (const stop of CENTER_AVATAR.background.gradientStops) {
    gradient.append('stop')
      .attr('offset', stop.offset)
      .style('stop-color', stop.color)
  }

  centerGroup
    .append('circle')
    .attr('class', 'center-avatar-bg')
    .attr('r', avatarRadius)
    .attr('fill', `url(#${gradientId})`)
    .attr('stroke', CENTER_AVATAR.stroke)
    .attr('stroke-width', CENTER_AVATAR.strokeWidth)

  // NO hover handlers here — Structured hover has exactly ONE canonical
  // application path (structuredHover.applyStructuredHoverIsolation, wired in
  // the ring renderers). The avatar's old link-only handler competed with it
  // and lit hub `overlap` connections whose endpoints are invisible phantom
  // points — the class of bug the canonical path exists to prevent.

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
    // Decorative overlay: must never swallow the avatar circle's hover events
    .style('pointer-events', 'none')
    .text(userInitials)

  // ── VALUE + INDICATOR ROW ──────────────────────────────────────────────────
  // Layout below the avatar (Screenshot-1 hierarchy):
  //
  //        [ GR avatar ]
  //
  //      75%     [▮▮▯]          ← one row, vertically centered on its midline
  //
  //      Sentiment Rate         ← centered under the whole row
  //
  // The large percentage sits LEFT, the reusable segmented indicator RIGHT.
  // The pair is built at x=0 (value anchored end, indicator to its right),
  // measured, then translated so the ROW AS A UNIT is centered under the
  // avatar — keeping the label's x=0 centering aligned with it.

  const rowTop = avatarRadius + CENTER_AVATAR.row.marginTop
  const rowHeight = Math.max(CENTER_AVATAR.percentage.fontSize, SENTIMENT_INDICATOR.height)
  const rowCenterY = rowTop + rowHeight / 2

  const rowGroup = centerGroup
    .append('g')
    .attr('class', 'sentiment-row')

  // Large percentage value — left side of the row
  rowGroup
    .append('text')
    .attr('class', 'sentiment-percentage')
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'central')
    .attr('x', 0)
    .attr('y', rowCenterY)
    .attr('font-size', CENTER_AVATAR.percentage.fontSize)
    .attr('font-weight', CENTER_AVATAR.percentage.fontWeight)
    .attr('font-family', CENTER_AVATAR.percentage.fontFamily)
    .attr('fill', CENTER_AVATAR.percentage.fill)
    .text(`${Math.round(sentimentPercent)}%`)

  // Segmented sentiment indicator — right side, vertically centered with the
  // value. Reusable helper: status + active-segment count derive from the
  // percentage; colors come from the theme's semantic status tokens.
  renderSentimentIndicator(rowGroup, {
    percent: sentimentPercent,
    x: CENTER_AVATAR.row.gap + SENTIMENT_INDICATOR.width / 2,
    y: rowCenterY - SENTIMENT_INDICATOR.height / 2,
    chartTheme,
  })

  // Center the assembled row under the avatar
  const rowBBox = (rowGroup.node() as SVGGElement).getBBox()
  rowGroup.attr('transform', `translate(${-(rowBBox.x + rowBBox.width / 2)}, 0)`)

  // ── LABEL ("Sentiment Rate") — centered under the whole row ────────────────

  centerGroup
    .append('text')
    .attr('class', 'sentiment-label')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('x', 0)
    .attr('y', rowTop + rowHeight + CENTER_AVATAR.label.marginTop + CENTER_AVATAR.label.fontSize / 2)
    .attr('font-size', CENTER_AVATAR.label.fontSize)
    .attr('font-weight', CENTER_AVATAR.label.fontWeight)
    .attr('font-family', CENTER_AVATAR.label.fontFamily)
    .attr('fill', CENTER_AVATAR.label.fill)
    .text(sentimentLabel)
}
