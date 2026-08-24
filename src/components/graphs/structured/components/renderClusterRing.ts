/**
 * src/components/graphs/structured/components/renderClusterRing.ts
 *
 * Renders the Cluster ring: uniform-size clusters with source icons and radial category labels.
 *
 * Key points:
 * - All clusters have UNIFORM diameter (40px), regardless of entity count/weight in data
 * - Each cluster is ONE logical SVG node: <g class="cluster-node-group"> holding
 *   the circle AND its origin icon, with the cluster datum bound to the group —
 *   hover/dim state applies to the group, so circle + icon always move together
 * - Icon association is resolved EXPLICITLY via resolveClusterIconHref (below):
 *   the owning hub id is the cluster id minus its generation suffix (`-s<N>`),
 *   which safely handles hub ids that themselves contain dashes or spaces
 *   ("Google Drive-s3" → "Google Drive", "doc-atlas-s0" → "doc-atlas") — never
 *   a bare split('-')[0]
 * - Source-derived clusters show their source's app icon; document-derived
 *   clusters (owner in GRAPH_DOCUMENT_HUBS) intentionally show the shared
 *   Document icon so every cluster has a meaningful visual origin
 * - Radial labels sit at STRUCTURED_RINGS.cluster + label.arcDistance, so they
 *   track the ring radius token automatically
 * - Hemisphere-aware text rotation: right side reads left-to-right, left side mirrored
 * - Hovering a cluster applies the neighborhood isolation from structuredHover.ts,
 *   derived from the live resolved connection data (no separate relationship map)
 */

import * as d3 from 'd3'
import {
  CLUSTER_RING,
  STRUCTURED_RINGS,
  STRUCTURED_NODE_SIZES,
  getStructuredClusterLabelFontSize,
  getStructuredClusterLabelRadius,
} from '../structuredTokens'
import { GRAPH_DOCUMENT_HUBS } from '@/data/graph-config'
import { documentNodeIconFor, getSourceNodeIcon } from '@/data/sourceNodeIcons'
import { applyStructuredHoverIsolation } from '../structuredHover'
import type { PositionedNode } from '../useStructuredRenderer'
import type { NetworkLink } from '@/components/charts'

interface ClusterRingConfig {
  centerX: number
  centerY: number
  zoom: number
  chartTheme?: any
  /** Cluster click → the Structured focus drill-down (see structuredFocus.ts). */
  onClusterClick?: (clusterId: string) => void
}

// ── CLUSTER ORIGIN RESOLUTION ────────────────────────────────────────────────

/** Document-hub ids — clusters owned by these are document-derived. */
const DOCUMENT_HUB_IDS = new Set<string>(GRAPH_DOCUMENT_HUBS.map(hub => hub.id))


/** Round clip for the full-bleed cluster origin tiles (structured-owned). */
const CLUSTER_ICON_CLIP_ID = 'structured-cluster-icon-round-clip'

/**
 * The id of the hub a cluster was generated around: the cluster id minus its
 * `-s<N>` generation suffix (see graphWorkspace's ring(): id = `${hub.id}-s${i}`).
 */
export function resolveClusterOwnerId(clusterId: string): string {
  return clusterId.replace(/-s\d+$/, '')
}

/**
 * The icon that represents a cluster's actual origin — the SAME assets and
 * treatment Unstructured uses:
 * - owning hub is a connected source → that source's full-bleed `* Logo.svg`
 *   brand tile (SOURCE_ICONS);
 * - owning hub is a document hub → the shared `Document Logo.svg` through
 *   documentNodeIconFor() (sourceNodeIcons.ts) — the SAME surface-toned,
 *   extension-recolourable tile Unstructured document nodes render, so the
 *   two modes can never drift apart (hubs carry no extension, so they render
 *   the asset's default glyph colour);
 * - anything else → null (explicitly iconless — the data model has no owner icon).
 */
export function resolveClusterIconHref(clusterId: string): string | null {
  const ownerId = resolveClusterOwnerId(clusterId)
  // ONE resolution path, shared with Unstructured (sourceNodeIcons.ts): full
  // brand tile where the brand ships one, composed surface tile otherwise.
  const sourceIcon = getSourceNodeIcon(ownerId)
  if (sourceIcon) return sourceIcon
  /*
   * STRUCTURED DOCUMENTS ARE ONE COLOUR. Every document hub renders the shared
   * glyph in the theme's `info` ink — `documentNodeIconFor()` with no extension
   * resolves to exactly that default. The ring carries 62 clusters at a small
   * on-screen size, so per-extension inks read as noise there rather than as
   * information; Unstructured keeps them, where documents are sparse and large
   * enough for the colour to mean something.
   */
  if (DOCUMENT_HUB_IDS.has(ownerId)) return documentNodeIconFor()
  return null
}

export function renderClusterRing(
  viewportGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  clusterNodes: PositionedNode[],
  _links: NetworkLink[],
  _config: ClusterRingConfig = { centerX: 0, centerY: 0, zoom: 1 },
) {
  if (!clusterNodes.length) return

  const nodeRadius = CLUSTER_RING.nodeRadius
  // Icon derives from the STRUCTURED cluster diameter (× sizeRatio for a
  // safety inset against SVG viewBox padding), so icon and circle can never
  // drift apart when the cluster size token changes.
  const iconSize = STRUCTURED_NODE_SIZES.cluster * CLUSTER_RING.sourceIcon.sizeRatio
  const iconHalfSize = iconSize / 2

  // ── CREATE CLUSTER RING GROUP ──────────────────────────────────────────────

  const clusterRing = viewportGroup
    .append('g')
    .attr('class', 'structured-cluster-ring')

  // Round clip for the full-bleed origin tiles — same objectBoundingBox
  // technique as the Unstructured source-icon clip (that clip lives in the
  // Unstructured render pass, which is wiped when Structured re-renders, so
  // Structured declares its own). Relative units make one clip fit every
  // icon size.
  clusterRing.append('defs')
    .append('clipPath')
    .attr('id', CLUSTER_ICON_CLIP_ID)
    .attr('clipPathUnits', 'objectBoundingBox')
    .append('circle')
    .attr('cx', 0.5)
    .attr('cy', 0.5)
    .attr('r', 0.5)

  // ── RENDER EACH CLUSTER AS ONE LOGICAL NODE (group = circle + icon) ────────

  const clusterGroups = clusterRing
    .selectAll('g.cluster-node-group')
    .data(clusterNodes)
    .join('g')
    .attr('class', 'cluster-node-group')
    .attr('transform', (d) => `translate(${d.x || 0}, ${d.y || 0})`)
    .style('cursor', 'pointer')
    // ── HOVER: isolate this cluster's relationship neighborhood ─────────────
    // Derived from the live resolved connections (structuredHover.ts reads the
    // RadialConnection data bound to the drawn paths). Opacity-only.
    .on('mouseenter', (_event: MouseEvent, node: PositionedNode) => {
      applyStructuredHoverIsolation(viewportGroup as any, node.id)
    })
    .on('mouseleave', () => {
      applyStructuredHoverIsolation(viewportGroup as any, null)
    })
    // Click → Structured focus drill-down (toggle handled by the component)
    .on('click', (event: MouseEvent, node: PositionedNode) => {
      event.stopPropagation()
      _config.onClusterClick?.(node.id)
    })

  // Cluster circle (coordinates are group-relative: the group carries position)
  clusterGroups
    .append('circle')
    .attr('class', 'cluster-node')
    .attr('cx', 0)
    .attr('cy', 0)
    .attr('r', nodeRadius)
    .attr('fill', CLUSTER_RING.fill)
    .attr('stroke', CLUSTER_RING.stroke)
    .attr('stroke-width', CLUSTER_RING.strokeWidth)
    .attr('stroke-dasharray', CLUSTER_RING.strokeDasharray)

  // Origin icon, centered in the circle — same group, so hover/dim state can
  // never separate an icon from its circle.
  clusterGroups.each(function (node) {
    const iconHref = resolveClusterIconHref(node.id)
    if (!iconHref) return
    d3.select(this)
      .append('image')
      .attr('class', 'cluster-source-icon')
      .attr('x', -iconHalfSize)
      .attr('y', -iconHalfSize)
      .attr('width', iconSize)
      .attr('height', iconSize)
      .attr('href', iconHref)
      .attr('opacity', CLUSTER_RING.sourceIcon.opacity)
      // Full-bleed tile clipped to the circular node — no square edges
      .attr('clip-path', `url(#${CLUSTER_ICON_CLIP_ID})`)
      // Decorative overlay: must never swallow the group's hover events
      .style('pointer-events', 'none')
  })

  // ── RENDER RADIAL LABELS (Step 7) ─────────────────────────────────────────────
  // Radial orientation (text points outward along node's angle, like spokes).
  // Reference: Observable D3 hierarchical-edge-bundling, adapted to our angle convention.
  // Our angle convention: θ=0°→East, θ=90°→South, θ=180°→West, θ=270°→North
  // (already matches SVG's default, so NO -90° offset correction needed)

  // Labels track the ring radius token — never a separate hardcoded radius
  // Zoom-aware radial placement through the SHARED rule (the zoom branch in
  // NetworkGraphD3 re-applies the same function), so the on-screen gap between
  // a node and its label stays constant instead of scaling with the camera.
  const labelRadius = getStructuredClusterLabelRadius(_config.zoom || 1)
  // Constant-screen sizing from the FIRST paint, through the SAME helper the
  // NetworkGraphD3 structured zoom branch uses, so first render and zoom
  // updates cannot diverge. The first paint shows the fit-to-view camera,
  // which IS Structured's minimum zoom, so `zoom` doubles as the min-zoom
  // reference here — the label starts at the zoomed-out size and eases up to
  // the full 12px as the user zooms in.
  const labelFontSize = getStructuredClusterLabelFontSize(_config.zoom || 1, _config.zoom || 1)
  const labelFontFamily = 'Inter, sans-serif'
  // Truncation budget measured at the render font. Under the constant-screen
  // rule width and font scale together, so the character count fixed here
  // keeps the 120px on-screen cap valid at every zoom.
  const labelMaxWidth = (CLUSTER_RING.label.maxWidth / CLUSTER_RING.label.fontSize) * labelFontSize

  // Create label groups (one per cluster)
  const labelGroups = clusterRing
    .selectAll('g.cluster-label-group')
    .data(clusterNodes)
    .join('g')
    .attr('class', 'cluster-label-group')
    .attr('transform', (d) => {
      // Radial positioning: rotate to node's angle, translate outward along x-axis
      const angle = d.angle || 0
      const angleDeg = (angle * 180) / Math.PI
      return `rotate(${angleDeg}) translate(${labelRadius}, 0)`
    })

  // Create text elements inside groups. Orientation (which side of the spoke
  // the text sits on, and whether it is flipped) is applied by the EXPORTED
  // helper below, because the Structured focus rotates the whole ring and has
  // to recompute it for the new effective angles.
  labelGroups
    .selectAll('text')
    .data((d) => [d])
    .join('text')
    .attr('class', 'cluster-label')
    .attr('dy', '0.31em') // Vertical centering trick from reference
    .attr('font-size', labelFontSize)
    .attr('font-family', labelFontFamily)
    .attr('font-weight', 500)
    .attr('fill', 'rgba(255, 255, 255, 0.85)')
    .attr('opacity', 0.85)
    .text((d) => (d as any).category || 'Cluster')
    // SVG <text> has no CSS max-width: cap each label at the measured
    // truncation budget with an ellipsis (no foreignObject).
    .each(function () {
      truncateTextToWidth(this as SVGTextElement, labelMaxWidth)
    })

  // Spoke-relative orientation, rotation-aware (see applyClusterLabelOrientation)
  applyClusterLabelOrientation(clusterRing, 0)
}

/**
 * SVG-safe max-width: measure the rendered text and trim characters (with a
 * trailing ellipsis) until it fits. Uses getComputedTextLength(), so it works
 * in the text's own coordinate space regardless of zoom/rotation transforms.
 */
function truncateTextToWidth(el: SVGTextElement, maxWidth: number) {
  const full = el.textContent || ''
  if (el.getComputedTextLength() <= maxWidth) return
  for (let len = full.length - 1; len > 0; len--) {
    el.textContent = `${full.slice(0, len)}…`
    if (el.getComputedTextLength() <= maxWidth) return
  }
}

/**
 * Orient every cluster label against the ring's CURRENT rotation.
 *
 * A label is drawn on a spoke (`rotate(angle) translate(radius, 0)`), so on the
 * left half of the circle it would read upside down; the fix is to anchor it on
 * the other side and flip it 180°. That decision depends on the angle the label
 * is actually DISPLAYED at — which the Structured focus changes when it rotates
 * the whole ring — so it lives here and takes the rotation as an argument
 * rather than being baked into the initial render.
 *
 * @param rotationDeg the rotor's current rotation, in degrees
 */
export function applyClusterLabelOrientation(
  scope: d3.Selection<any, unknown, any, unknown>,
  rotationDeg: number,
) {
  const offset = CLUSTER_RING.label.sideOffset
  const isFlipped = (d: any) => {
    const deg = ((d?.angle || 0) * 180) / Math.PI + rotationDeg
    const normalized = ((deg % 360) + 360) % 360
    return normalized > 90 && normalized < 270
  }
  scope.selectAll<SVGTextElement, any>('text.cluster-label')
    .attr('x', (d) => (isFlipped(d) ? -offset : offset))
    .attr('text-anchor', (d) => (isFlipped(d) ? 'end' : 'start'))
    .attr('transform', (d) => (isFlipped(d) ? 'rotate(180)' : null))
}
