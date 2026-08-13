/**
 * src/components/graphs/structured/components/renderSentimentIndicator.ts
 *
 * Reusable segmented sentiment/status meter for the Structured SVG renderer
 * (Figma node 1646-51131). A 20×14 pill containing three equal vertical
 * segments; the number of ACTIVE segments and the semantic status are both
 * derived from a percentage.
 *
 * Thresholds reuse the project's existing 3-segment convention (see
 * renderEntityRing.ts battery indicator): 0–33 → 1 segment / error,
 * 34–66 → 2 segments / warning, 67–100 → 3 segments / success.
 *
 * Colors come from the live theme's semantic status tokens through
 * chartTheme.status (useChartTheme resolves success/warning/error from the
 * Vuetify theme), so no new palette is introduced here:
 *   - outer container  = status color at ~10% alpha
 *   - active segment   = status color at 100%
 *   - inactive segment = the shared inactive token (SENTIMENT_INDICATOR)
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
 * Same thresholds as the entity ring's battery indicator, mapped to the
 * theme's semantic states.
 */
export function deriveSentimentStatus(percent: number): SentimentStatus {
  if (percent >= 67) return 'success'
  if (percent >= 34) return 'warning'
  return 'error'
}

/** 1 / 2 / 3 active segments on the same 0–33 / 34–66 / 67–100 bands. */
export function activeSegmentCount(percent: number): number {
  if (percent >= 67) return 3
  if (percent >= 34) return 2
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
  for (let i = 0; i < t.segments; i++) {
    group
      .append('rect')
      .attr('class', `sentiment-indicator__segment segment-${i} ${i < activeCount ? 'is-active' : ''}`)
      .attr('x', left + padding + i * (segmentWidth + gap))
      .attr('y', options.y + padding)
      .attr('width', segmentWidth)
      .attr('height', innerHeight)
      .attr('rx', t.segmentBorderRadius * s)
      .attr('fill', i < activeCount ? color : t.inactiveColor)
  }

  return group
}
