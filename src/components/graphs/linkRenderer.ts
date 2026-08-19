/**
 * src/components/graphs/linkRenderer.ts
 *
 * THE connection visual language, in one place.
 *
 * A connection in this app is not one line. It is a stack of four marks, and
 * every one of them is part of what makes a link read as a link:
 *
 *   1. a BACKGROUND line — wider, on the atmospheric gradient, blurred, faint;
 *   2. a FOREGROUND line — the sharp luminous gradient stroke;
 *   3. two ENDPOINT dots — tiny blurred white points where the line meets its
 *      nodes.
 *
 * The Structured cluster focus used to draw only the foreground line, which is
 * why its connections never quite matched the Unstructured graph however
 * carefully the stroke was copied: three of the four marks were missing. Rather
 * than copy the remaining attributes into a second place (and let the two drift
 * apart on the next change), the STYLE of each layer lives here as a function,
 * and every renderer — the Unstructured graph, the Structured focus — applies
 * the same one.
 *
 * What is deliberately NOT here: endpoint GEOMETRY. Where a line starts and
 * stops is the caller's business (force-layout node radii in one case, the
 * focus columns' own trimming in the other); this module owns how it looks.
 */

import type * as d3 from 'd3'
import {
  LINK_GRADIENT,
  LINK_STYLING,
  getLinkStrokeWidth,
  getInverseZoomScale,
} from './graphTokens'

type AnySelection = d3.Selection<any, any, any, any>
type DefsSelection = d3.Selection<SVGDefsElement, unknown, any, unknown>

/** Element ids the connection layers reference. Shared, so they cannot drift. */
export const LINK_DEF_IDS = {
  foregroundGradient: LINK_GRADIENT.foreground.id,
  backgroundGradient: LINK_GRADIENT.background.id,
  backgroundBlur: 'link-background-blur',
  endpointBlur: 'link-endpoint-blur',
}

/**
 * Build every def a connection references into the given `<defs>`.
 *
 * ⚠️ A paint server and a filter are per-SVG. Each graph mode CLEARS the SVG and
 * rebuilds its own defs, so a mode that strokes with these ids but never defines
 * them draws NOTHING at all: per SVG spec an element whose paint-server
 * reference cannot be resolved is not rendered. That is not a faint line — it is
 * an invisible line with perfectly good geometry, which is exactly how it
 * presents as a bug while every attribute reads correct. Call this once per SVG
 * rebuild, in whichever pass owns the defs.
 */
export function appendLinkDefs(defs: DefsSelection): void {
  for (const gradient of [LINK_GRADIENT.foreground, LINK_GRADIENT.background]) {
    const grad = defs.append('linearGradient')
      .attr('id', gradient.id)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '0%')
    for (const stop of gradient.stops) {
      grad.append('stop')
        .attr('offset', stop.offset)
        .attr('stop-color', stop.color)
        .attr('stop-opacity', stop.opacity)
    }
  }

  defs.append('filter')
    .attr('id', LINK_DEF_IDS.backgroundBlur)
    .append('feGaussianBlur')
    .attr('in', 'SourceGraphic')
    .attr('stdDeviation', LINK_STYLING.blur.amount)

  defs.append('filter')
    .attr('id', LINK_DEF_IDS.endpointBlur)
    .append('feGaussianBlur')
    .attr('in', 'SourceGraphic')
    .attr('stdDeviation', LINK_STYLING.blur.endpointBlur)
}

/**
 * Append a USER-SPACE variant of the foreground gradient, spanning `x1 → x2`.
 *
 * ⚠️ The second SVG trap in the same area: an `objectBoundingBox` paint server
 * is not rendered when the bounding box has zero width or height — and a
 * PERFECTLY HORIZONTAL `<line>` has zero height. The Structured focus columns
 * are horizontal by construction (a single insight, or the middle row of an odd
 * count, sits exactly on y = 0), so those rows would vanish while their diagonal
 * neighbours painted. Mapping the gradient to user space removes the dependency
 * on each line's own bbox; the stops are the same, so the language is unchanged.
 */
export function appendUserSpaceLinkGradient(
  defs: AnySelection,
  id: string,
  x1: number,
  x2: number,
  stops = LINK_GRADIENT.foreground.stops,
): void {
  const grad = defs.append('linearGradient')
    .attr('id', id)
    .attr('gradientUnits', 'userSpaceOnUse')
    .attr('x1', x1)
    .attr('y1', 0)
    .attr('x2', x2)
    .attr('y2', 0)
  for (const stop of stops) {
    grad.append('stop')
      .attr('offset', stop.offset)
      .attr('stop-color', stop.color)
      .attr('stop-opacity', stop.opacity)
  }
}

/** Resting opacity of the foreground line. */
export const LINK_FOREGROUND_OPACITY = 0.9
/** Resting opacity of the blurred background line. */
export const LINK_BACKGROUND_OPACITY = 0.25
/** The background line is drawn this much wider than the foreground. */
export const LINK_BACKGROUND_WIDTH_FACTOR = 1.5

interface LayerStyleOptions {
  /** Current zoom scale — widths are constant on screen, so they divide by it. */
  zoomScale: number
  /** Link kind for the width/dash lookup; defaults to `'default'`. */
  kind?: string
  /** Paint override — the focus passes its own user-space gradient id. */
  stroke?: string
  /** Dash override — the dotted entity↔entity relation style. */
  strokeDasharray?: string
  strokeLinecap?: string
  /**
   * Proportional thinning/thickening of BOTH strokes (the background keeps its
   * `LINK_BACKGROUND_WIDTH_FACTOR` relation to the foreground). Optional and
   * defaulting to 1, so existing callers — the base Unstructured links — are
   * untouched; the Structured focus passes its own token here.
   */
  widthFactor?: number
}

const dashFor = (kind?: string) =>
  (kind === 'overlap' ? LINK_STYLING.strokeDasharray.overlap : LINK_STYLING.strokeDasharray.default)

/** The blurred atmospheric line UNDER a connection. */
export function applyLinkBackgroundStyle(sel: AnySelection, opts: LayerStyleOptions): void {
  sel
    .attr('stroke', opts.stroke ?? `url(#${LINK_DEF_IDS.backgroundGradient})`)
    .attr('stroke-width', getLinkStrokeWidth(opts.kind ?? 'default', opts.zoomScale) * LINK_BACKGROUND_WIDTH_FACTOR * (opts.widthFactor ?? 1))
    .attr('stroke-dasharray', opts.strokeDasharray ?? dashFor(opts.kind))
    .attr('opacity', LINK_BACKGROUND_OPACITY)
    .attr('filter', `url(#${LINK_DEF_IDS.backgroundBlur})`)
  if (opts.strokeLinecap) sel.attr('stroke-linecap', opts.strokeLinecap)
}

/** The sharp luminous line — the connection itself. */
export function applyLinkForegroundStyle(sel: AnySelection, opts: LayerStyleOptions): void {
  sel
    .attr('stroke', opts.stroke ?? `url(#${LINK_DEF_IDS.foregroundGradient})`)
    .attr('stroke-width', getLinkStrokeWidth(opts.kind ?? 'default', opts.zoomScale) * (opts.widthFactor ?? 1))
    .attr('stroke-dasharray', opts.strokeDasharray ?? dashFor(opts.kind))
    .attr('opacity', LINK_FOREGROUND_OPACITY)
  if (opts.strokeLinecap) sel.attr('stroke-linecap', opts.strokeLinecap)
}

/** The tiny blurred white dot where a connection meets a node. */
export function applyLinkEndpointStyle(sel: AnySelection, zoomScale: number): void {
  sel
    .attr('r', LINK_STYLING.endpoints.radius * getInverseZoomScale(zoomScale))
    .attr('fill', LINK_STYLING.endpoints.fill)
    .attr('opacity', LINK_STYLING.endpoints.opacity)
    .attr('filter', `url(#${LINK_DEF_IDS.endpointBlur})`)
}

/** A straight connection with its endpoints already resolved by the caller. */
export interface StraightSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface StraightConnectionOptions extends LayerStyleOptions {
  /** Class stem: layers become `<stem>-background`, `<stem>`, `<stem>-endpoint`. */
  className: string
  /** Endpoint dots are pointless where a line ends inside a node; default true. */
  endpoints?: boolean
  /**
   * The blurred under-line; default true. Turned off for the dotted entity ↔
   * entity relations, which the Unstructured drill-down also draws as a single
   * dotted stroke — a soft glow under a dotted line reads as a smudge.
   */
  background?: boolean
  /** Paint override for the background layer (a user-space gradient id). */
  backgroundStroke?: string
}

/**
 * Draw a set of straight connections as the full four-mark stack, in paint
 * order (background, endpoints, foreground). Returns the selections so the
 * caller can wire its own hover/emphasis on top — the opacity STATES to use are
 * `LINK_STYLING.opacity` (base / hover / hidden), the same ramp the base graph
 * highlights with.
 */
export function renderStraightConnections<T>(
  group: AnySelection,
  data: T[],
  segmentOf: (d: T) => StraightSegment,
  opts: StraightConnectionOptions,
) {
  const place = (sel: AnySelection) => sel
    .attr('x1', (d: any) => segmentOf(d).x1)
    .attr('y1', (d: any) => segmentOf(d).y1)
    .attr('x2', (d: any) => segmentOf(d).x2)
    .attr('y2', (d: any) => segmentOf(d).y2)

  let background: AnySelection | null = null
  if (opts.background !== false) {
    background = group.append('g').attr('class', `${opts.className}-background-layer`)
      .selectAll('line')
      .data(data)
      .join('line')
      .attr('class', `${opts.className}-background`)
    applyLinkBackgroundStyle(background, { ...opts, stroke: opts.backgroundStroke })
    place(background)
  }

  let endpoints: AnySelection | null = null
  if (opts.endpoints !== false) {
    const endpointData = data.flatMap(d => [{ d, end: 'source' as const }, { d, end: 'target' as const }])
    endpoints = group.append('g').attr('class', `${opts.className}-endpoint-layer`)
      .selectAll('circle')
      .data(endpointData)
      .join('circle')
      .attr('class', `${opts.className}-endpoint`)
      .attr('cx', (p: any) => (p.end === 'source' ? segmentOf(p.d).x1 : segmentOf(p.d).x2))
      .attr('cy', (p: any) => (p.end === 'source' ? segmentOf(p.d).y1 : segmentOf(p.d).y2))
    applyLinkEndpointStyle(endpoints, opts.zoomScale)
  }

  const foreground = group.append('g').attr('class', `${opts.className}-layer`)
    .selectAll('line')
    .data(data)
    .join('line')
    .attr('class', opts.className)
  applyLinkForegroundStyle(foreground, opts)
  place(foreground)

  return { background, foreground, endpoints }
}
