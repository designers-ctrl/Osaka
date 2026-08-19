/**
 * src/components/graphs/structured/components/renderSentimentIndicator.ts
 *
 * Reusable segmented sentiment/status meter for the Structured SVG renderer
 * (Figma node 1646-51131). A 20×14 pill containing three equal vertical
 * segments; the number of ACTIVE segments and the semantic status are both
 * derived from a percentage.
 *
 * Thresholds (design spec for the Structured badges/meters):
 * 0–59 → 1 segment / error, 60–84 → 2 segments / warning,
 * 85–100 → 3 segments / success.
 *
 * Colors come from the live theme's semantic status tokens through
 * chartTheme.status (useChartTheme resolves success/warning/error from the
 * Vuetify theme), so no new palette is introduced here:
 *   - outer container  = status color at 10% alpha
 *   - active segment   = status color at 100%
 *   - inactive segment = the SAME status color at low alpha (inactiveAlpha)
 * Alpha is applied per fill — never as opacity on the whole indicator group.
 */

import * as d3 from 'd3'
import { SENTIMENT_INDICATOR } from '../structuredTokens'

export type SentimentStatus = 'success' | 'warning' | 'error'

export interface SentimentIndicatorOptions {
  /** 0–100. Drives both the derived status and the active segment count. */
  percent: number
  /** Center X of the indicator in the parent group's coordinate space. */
  x: number
  /** Top Y of the indicator in the parent group's coordinate space. */
  y: number
  /** Optional explicit status; when omitted it is derived from `percent`. */
  status?: SentimentStatus
  /** Chart theme from useChartTheme(); source of the semantic status colors. */
  chartTheme?: { status?: { good?: string, warning?: string, critical?: string } }
  /** Uniform scale factor; defaults to 1 (geometry tokens are px at scale 1). */
  scale?: number
}

/**
 * Design-spec thresholds mapped to the theme's semantic states:
 * 85–100 → success, 60–84 → warning, 0–59 → error.
 */
export function deriveSentimentStatus(percent: number): SentimentStatus {
  if (percent >= 85) return 'success'
  if (percent >= 60) return 'warning'
  return 'error'
}

/** 1 / 2 / 3 active segments on the same 0–59 / 60–84 / 85–100 bands. */
export function activeSegmentCount(percent: number): number {
  if (percent >= 85) return 3
  if (percent >= 60) return 2
  return 1
}

/** Resolve a status to the live theme's color, with theme-CSS-var fallback. */
function statusColor(
  status: SentimentStatus,
  chartTheme?: SentimentIndicatorOptions['chartTheme'],
): string {
  switch (status) {
    case 'success': return chartTheme?.status?.good ?? 'rgb(var(--v-theme-success))'
    case 'warning': return chartTheme?.status?.warning ?? 'rgb(var(--v-theme-warning))'
    case 'error': return chartTheme?.status?.critical ?? 'rgb(var(--v-theme-error))'
  }
}

/** `#RRGGBB`/`#RGB` → rgba() at the given alpha; passes other formats through. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)
  if (!m) return color // css var()/rgb() — alpha handled by the caller's opacity
  let hex = m[1]
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
  const n = parseInt(hex, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/**
 * Draw the segmented indicator into `parent`, centered horizontally on
 * `options.x` with its top edge at `options.y`. Returns the created group so
 * callers can position or clean it up further.
 */
export function renderSentimentIndicator(
  parent: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  options: SentimentIndicatorOptions,
) {
  const t = SENTIMENT_INDICATOR
  const s = options.scale ?? 1
  const percent = options.percent
  const status = options.status ?? deriveSentimentStatus(percent)
  const color = statusColor(status, options.chartTheme)
  const activeCount = activeSegmentCount(percent)

  const width = t.width * s
  const height = t.height * s
  const padding = t.padding * s
  const gap = t.gap * s
  const innerHeight = height - padding * 2
  const segmentWidth = (width - padding * 2 - gap * (t.segments - 1)) / t.segments
  const left = options.x - width / 2

  const group = parent
    .append('g')
    .attr('class', `sentiment-indicator sentiment-indicator--${status}`)

  // Outer container — status color at ~10% alpha
  const container = group
    .append('rect')
    .attr('class', 'sentiment-indicator__container')
    .attr('x', left)
    .attr('y', options.y)
    .attr('width', width)
    .attr('height', height)
    .attr('rx', t.borderRadius * s)
  const containerFill = withAlpha(color, t.containerAlpha)
  if (containerFill === color) {
    // Non-hex color (css var): approximate the 10% treatment via opacity
    container.attr('fill', color).attr('fill-opacity', t.containerAlpha)
  } else {
    container.attr('fill', containerFill)
  }

  // Three fixed segment slots — active count derived from the percentage,
  // all slots always drawn so the component's size never changes.
  // Active = status color at 100%; inactive = the SAME status color at
  // inactiveAlpha. Alpha is per segment fill, never on the group.
  for (let i = 0; i < t.segments; i++) {
    const isActive = i < activeCount
    const segment = group
      .append('rect')
      .attr('class', `sentiment-indicator__segment segment-${i} ${isActive ? 'is-active' : ''}`)
      .attr('x', left + padding + i * (segmentWidth + gap))
      .attr('y', options.y + padding)
      .attr('width', segmentWidth)
      .attr('height', innerHeight)
      .attr('rx', t.segmentBorderRadius * s)
    if (isActive) {
      segment.attr('fill', color)
    } else {
      const inactiveFill = withAlpha(color, t.inactiveAlpha)
      if (inactiveFill === color) {
        // Non-hex color (css var): approximate the low-alpha treatment via fill-opacity
        segment.attr('fill', color).attr('fill-opacity', t.inactiveAlpha)
      } else {
        segment.attr('fill', inactiveFill)
      }
    }
  }

  return group
}
