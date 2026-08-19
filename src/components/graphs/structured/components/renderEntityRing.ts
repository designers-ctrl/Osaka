/**
 * src/components/graphs/structured/components/renderEntityRing.ts
 *
 * Renders the Entity ring as per-cluster aggregate summaries:
 * 1 circular glass node per cluster, containing that summary's CONNECTION
 * COUNT — the number of currently visible relationships that continue inward
 * from this entity summary (computed by useStructuredRenderer with the same
 * normalization rules as hover, so the number and the lit lines can never
 * disagree; the single render-level Cluster → Entity bridge is not a link and
 * is never counted).
 *
 * ⚠️ This is the ORIGINAL Structured overview styling — glass radial gradient
 * over an opaque base disc, hairline border, faint inner highlight, centred
 * count. Deliberately NOT the Unstructured expanded-entity dot: that mark
 * belongs only to the selected-cluster FOCUS content (structuredFocus.ts),
 * never to the base overview ring.
 *
 * The confidence percentage + battery badge live on the Cluster → Entity
 * bridge — see renderClusterEntityBridge.ts.
 */

import * as d3 from 'd3'
import {
  ENTITY_RING,
} from '../structuredTokens'
import { applyStructuredHoverIsolation } from '../structuredHover'
import type { PositionedNode } from '../useStructuredRenderer'

interface EntityRingConfig {
  chartTheme?: any
  /** Per-cluster-id inward connection counts (from useStructuredRenderer). */
  connectionCounts?: Map<string, number>
}

/**
 * Keep every entity summary's COUNT upright for a given rotor rotation.
 *
 * The counts live inside the rotor (useStructuredRenderer), so the Structured
 * FOCUS rotation would carry each number round with its ring and leave it
 * tilted — or upside down on the far side. Same problem the selected cluster's
 * logo has, and the same answer: the text counter-rotates by the rotor's angle
 * about its OWN centre, so it ends visually at 0° while the node keeps the
 * rotated ring position the rotation gave it.
 *
 * Rotating about (x, y) — not the origin — is what makes this a pure
 * orientation change: the glyph stays centred on its node either way.
 *
 * `durationMs > 0` animates it, which is how it stays upright THROUGHOUT the
 * spin rather than snapping at the end: run it with the rotor's own duration
 * and the two interpolations cancel each other frame by frame.
 */
export function applyEntityCountOrientation(
  scope: d3.Selection<any, any, any, any>,
  rotationDeg: number,
  durationMs = 0,
) {
  const counts = scope.selectAll<SVGTextElement, PositionedNode>('text.entity-count')
  const upright = (d: PositionedNode) => `rotate(${-rotationDeg}, ${d.x || 0}, ${d.y || 0})`
  /*
   * NAMED transition ('orient'), and this matters: the focus also fades these
   * same texts (an expanded cluster hides its count). Two UNNAMED transitions on
   * one element cancel each other, so an unnamed orientation pass here silently
   * killed the pending opacity change and the count stayed visible. Named
   * transitions run independently — orientation and opacity no longer compete.
   */
  if (durationMs > 0) {
    counts.transition('orient').duration(durationMs).attr('transform', upright)
  } else {
    counts.interrupt('orient').attr('transform', upright)
  }
}

export function renderEntityRing(
  viewportGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  clusterNodes: PositionedNode[],
  _config: EntityRingConfig = {},
) {
  if (!clusterNodes.length) return

  const nodeRadius = ENTITY_RING.nodeRadius
  const glass = ENTITY_RING.glass

  // ── CREATE ENTITY RING GROUP ───────────────────────────────────────────────

  const entityRing = viewportGroup
    .append('g')
    .attr('class', 'structured-entity-ring')

  // ── GLASS GRADIENT DEFINITION (shared by every entity node) ────────────────
  // Radial gray1 gradient, center → edge (the SVG stand-in for the Figma
  // glass background; CSS backdrop-filter does not apply to SVG shapes).
  const gradient = entityRing
    .append('defs')
    .append('radialGradient')
    .attr('id', glass.gradientId)
    .attr('cx', '50%').attr('cy', '50%').attr('r', '50%')
  for (const stop of glass.gradientStops) {
    gradient.append('stop')
      .attr('offset', stop.offset)
      .style('stop-color', stop.color)
  }

  // ── RENDER EACH CLUSTER SUMMARY CIRCLE ─────────────────────────────────────

  // Opaque base disc UNDER the glass gradient: entity summaries must be fully
  // opaque at rest (graph lines / background dots never show through). The
  // translucent glass gradient keeps the intended fill language, but on its
  // own it let the scene bleed through — this base (theme Gray-4, the canvas'
  // dark ground tone) makes the composite 100% opaque without changing the
  // perceived color.
  entityRing
    .selectAll('circle.entity-node-base')
    .data(clusterNodes)
    .join('circle')
    .attr('class', 'entity-node-base')
    .attr('cx', (d) => d.x || 0)
    .attr('cy', (d) => d.y || 0)
    .attr('r', nodeRadius)
    .attr('fill', 'rgb(var(--v-theme-gray4, 12, 19, 17))')
    .style('pointer-events', 'none') // hover lives on the glass circle above

  entityRing
    .selectAll('circle.entity-node')
    .data(clusterNodes)
    .join('circle')
    .attr('class', 'entity-node')
    .attr('cx', (d) => d.x || 0)
    .attr('cy', (d) => d.y || 0)
    .attr('r', nodeRadius)
    .attr('fill', `url(#${glass.gradientId})`)
    .attr('stroke', glass.stroke)
    .attr('stroke-width', glass.strokeWidth)
    .style('cursor', 'pointer')
    // ── HOVER: unified neighborhood isolation (structuredHover.ts) ───────────
    // Same rule as cluster/insight hover, derived from the resolved drawn
    // connections — node visibility can never disagree with link highlighting.
    .on('mouseenter', function (_event, node) {
      applyStructuredHoverIsolation(viewportGroup as any, node.id)
    })
    .on('mouseleave', function () {
      applyStructuredHoverIsolation(viewportGroup as any, null)
    })

  // ── CONNECTION COUNT (inside each summary circle) ──────────────────────────
  // The number of visible relationships continuing inward from this entity
  // summary. The percentage/battery badge lives on the Cluster → Entity
  // bridge (renderClusterEntityBridge.ts) — nothing renders beside the node.
  const connectionCounts = _config.connectionCounts

  clusterNodes.forEach((node) => {
    const connectionCount = connectionCounts?.get(node.id) ?? 0

    // Faint inner highlight ring — the SVG stand-in for the Figma
    // `box-shadow: 0 0 1px rgba(255,255,255,.10) inset`
    // (datum bound so hover isolation can dim it with its node)
    entityRing
      .append('circle')
      .datum(node)
      .attr('class', 'entity-node-highlight')
      .attr('cx', node.x || 0)
      .attr('cy', node.y || 0)
      .attr('r', nodeRadius - glass.innerHighlightWidth)
      .attr('fill', 'none')
      .attr('stroke', glass.innerHighlight)
      .attr('stroke-width', glass.innerHighlightWidth)
      .style('pointer-events', 'none')

    entityRing
      .append('text')
      .datum(node)
      .attr('class', 'entity-count')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('x', node.x || 0)
      .attr('y', node.y || 0)
      .attr('font-size', ENTITY_RING.count.fontSize)
      .attr('font-weight', ENTITY_RING.count.fontWeight)
      .attr('font-family', ENTITY_RING.count.fontFamily)
      .attr('fill', ENTITY_RING.count.fill)
      // Decorative overlay: must never swallow the circle's hover events
      .style('pointer-events', 'none')
      .text(connectionCount)
  })
}
