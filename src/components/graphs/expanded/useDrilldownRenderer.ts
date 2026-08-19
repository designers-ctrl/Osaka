/**
 * src/components/graphs/expanded/useDrilldownRenderer.ts
 *
 * The DRAWING half of the Cluster drill-down: an ADDITIONAL focused layer
 * rendered on top of the normal Unstructured graph.
 *
 * Architecture (see also expandedTokens.ts / useDrilldownModel.ts):
 * - the existing Unstructured force graph remains the source of base positions
 *   — this layer never creates, moves or re-simulates a base node;
 * - it appends ONE group (`g.expanded-layer`) inside the existing viewport, so
 *   it inherits the same zoom/pan transform as everything else;
 * - unrelated base groups are DIMMED, never removed: `applyDrilldownEmphasis`
 *   only ever writes `opacity` (plus `pointer-events` on the two cluster
 *   circles the regions stand in for), so the whole graph stays in the DOM and
 *   `clearDrilldownEmphasis` restores the exact base values;
 * - all geometry is recomputed from live node positions in `update()`, which
 *   the component calls from the simulation's existing tick handler. No second
 *   simulation, no reheat, no data mutation.
 *
 * ⚠️ CONNECTION GEOMETRY (project design rule): every connection in this layer
 * is ONE STRAIGHT `<line>` from endpoint to endpoint, trimmed to the visible
 * node/region boundaries. No path curvature of any kind — overlap readability
 * is solved with opacity, layering and hover isolation instead.
 */

import * as d3 from 'd3'
import type { NetworkNode } from '@/components/charts'
import {
  LINK_STYLING,
  SOURCE_NODES,
  TYPOGRAPHY,
  getConnectionEndpoints,
  getDocumentIconDiameter,
  getEffectiveNodeRadius,
  getInverseZoomScale,
  getLinkStrokeWidth,
  getSourceIconDiameter,
} from '../graphTokens'
import { EXPANDED_CLUSTER } from './expandedTokens'
import { syntheticNameFor } from './demoEntities'
import {
  anchorOn,
  angleDiff,
  computeHubDisplayPositions,
  computeRegionCenters,
  deriveHoverActiveSet,
  trimmedSegment,
  type DrilldownModel,
  type DrilldownRegion,
  type EntityPlacement,
  type EntityRelation,
  type HoverActiveSet,
} from './useDrilldownModel'

export interface DrilldownRenderContext {
  /** Every node currently in the graph, by id (base positions live on these). */
  nodeById: Map<string, NetworkNode>
  /** The theme colour entity marks are drawn in — same as the base renderer. */
  entityColor: string
  /**
   * Resolve a design-system colour token (`graph-accent`, `button-black-b-40`,
   * …) against the LIVE Vuetify theme. The layer stores token NAMES in
   * expandedTokens and resolves them through this, so no hex is ever written
   * into the renderer and a palette edit in `vuetify.ts` flows straight
   * through — the D3 equivalent of the `color` prop a Vuetify component gets.
   */
  themeColor: (token: string) => string
  /** Current zoom scale, for the constant-screen sizing the base graph uses. */
  zoomScale: number
  /**
   * Collapse ONE expanded cluster (its chip's ×, or clicking its region).
   * The component removes the id from `expandedClusterIds`; the other
   * explicitly expanded regions stay open. Esc / canvas click close all.
   */
  onCollapse: (clusterId: string) => void
}

export interface DrilldownHandle {
  /** Re-derive all geometry from the live node positions (call on tick/zoom). */
  update: (zoomScale?: number) => void
  /** Remove the focused layer. Base graph untouched. */
  destroy: () => void
}

/**
 * The stroke the base Unstructured renderer paints its foreground links with:
 * the luminous gradient defined once in the graph's `<defs>`. The drill-down
 * layer lives inside the same `<svg>`, so it references the SAME paint server
 * rather than declaring a flat colour of its own — that is what makes an
 * expanded-level connection read as the same kind of line as every other
 * connection on the canvas.
 */
const BASE_LINK_STROKE = 'url(#link-gradient-foreground)'

/** Set a straight-line selection's geometry, or hide degenerate segments. */
function applySegment(
  sel: d3.Selection<any, any, any, any>,
  seg: { x1: number, y1: number, x2: number, y2: number } | null,
) {
  if (!seg) {
    sel.attr('visibility', 'hidden')
    return
  }
  sel.attr('visibility', null)
    .attr('x1', seg.x1).attr('y1', seg.y1)
    .attr('x2', seg.x2).attr('y2', seg.y2)
}

export function useDrilldownRenderer() {
  /**
   * Draw the focused layer for `model` inside the existing viewport group.
   * Returns a handle the component drives; calling it twice requires
   * destroying the previous handle first (the component owns that lifecycle).
   */
  function renderDrilldown(
    viewport: d3.Selection<any, unknown, null, undefined>,
    model: DrilldownModel,
    ctx: DrilldownRenderContext,
  ): DrilldownHandle {
    const { nodeById, entityColor, themeColor } = ctx
    let zoomScale = ctx.zoomScale > 0 ? ctx.zoomScale : 1
    /** The entity currently hovered inside the expanded view, if any. */
    let focusedEntityId: string | null = null
    /** Whether the hover base-dim overlay is currently written to the base SVG. */
    let hoverBaseApplied = false
    /** The owning <svg> — the hover overlay dims the BASE graph through it. */
    const svgSel = d3.select((viewport.node() as SVGGElement).ownerSVGElement as SVGSVGElement)

    const layer = viewport.append('g')
      .attr('class', 'expanded-layer')
      // The layer is inert by default; only entity points, region circles and
      // the chip's × opt back in, so panning through empty region space works.
      .style('pointer-events', 'none')

    const relationGroup = layer.append('g').attr('class', 'expanded-entity-relations')
    const routedGroup = layer.append('g').attr('class', 'expanded-routed-links')
    const regionsGroup = layer.append('g').attr('class', 'expanded-regions')

    /** Lookup: entity id → its region + packed placement (for line endpoints). */
    const placementOf = new Map<string, { region: DrilldownRegion, placement: EntityPlacement }>()
    for (const region of model.regions) {
      for (const placement of region.entities) {
        placementOf.set(placement.node.id, { region, placement })
      }
    }

    // ── NO MEMBERSHIP FAN ───────────────────────────────────────────────────
    // Entities do NOT draw individual lines back to their Source. The region
    // that contains them already states that they belong to that cluster,
    // and that cluster's own line to its Source is still drawn (as a routed
    // external link) — so a line per dot only restated the same fact once per
    // entity, and at region density the fan buried the relationships that do
    // carry meaning. The entities read as a group inside their circle instead.
    //
    // What remains, deliberately: cross-cluster entity relations, Insight
    // relations, the external graph connections, and the region boundary.

    // ── Entity ↔ entity relationships: straight lines ──────────────────────
    // Styled from the BASE Unstructured link tokens, not a drill-down-only
    // line style: same luminous gradient stroke, same dash behaviour, same
    // opacity scale (LINK_STYLING). A connection should not change its visual
    // language just because a cluster happens to be open. Geometry is
    // untouched — still one straight, boundary-trimmed segment.
    const relationLines = relationGroup
      .selectAll('line.expanded-entity-relation')
      .data(model.entityRelations, (d: any) => d.key)
      .enter()
      .append('line')
      .attr('class', 'expanded-entity-relation')
      .attr('stroke', BASE_LINK_STROKE)
      // Entity↔entity relations are DASHED (derived relationships); a relation
      // that lands on a still-collapsed cluster keeps the base solid language,
      // since that end is ordinary graph structure.
      .attr('stroke-dasharray', (d: EntityRelation) => d.bKind === 'entity'
        ? EXPANDED_CLUSTER.entityRelation.strokeDasharray
        : LINK_STYLING.strokeDasharray.default)
      .attr('stroke-linecap', 'round')

    // ── Re-anchored external links: straight lines ─────────────────────────
    // The base layer's lines into an expanded cluster are hidden by
    // applyDrilldownEmphasis; these straight segments replace them, ending on
    // the region perimeter instead of under the region's fill.
    const routedLines = routedGroup
      .selectAll('line.expanded-routed')
      .data(model.routedLinks, (d: any) => d.key)
      .enter()
      .append('line')
      .attr('class', 'expanded-routed')
      .attr('stroke', BASE_LINK_STROKE)
      .attr('stroke-linecap', 'round')
      .attr('stroke-dasharray', (d: any) =>
        d.kind === 'overlap' ? LINK_STYLING.strokeDasharray.overlap : LINK_STYLING.strokeDasharray.default)

    // ── Regions ────────────────────────────────────────────────────────────
    const regionGroups = regionsGroup
      .selectAll('g.expanded-region')
      .data(model.regions, (d: any) => d.cluster.id)
      .enter()
      .append('g')
      .attr('class', d => `expanded-region${d.primary ? ' expanded-region--primary' : ''}`)

    // SVG half of the region's glass treatment (see `region.glass` in the
    // tokens): a blurred backing disc of the region's own purple, drawn
    // BEHIND the crisp circle. `feGaussianBlur` on the disc's own fill is the
    // closest SVG equivalent of a backdrop blur (which SVG cannot do), and it
    // softens the region against the graph content underneath; the HTML
    // region-glass layer in NetworkGraphD3 handles the true backdrop (the dot
    // grid). The filter def lives inside this layer, so it is removed with it.
    layer.append('defs')
      .append('filter')
      .attr('id', 'expanded-region-glass-blur')
      // Generous margins: the blur must not clip at the filter region's edge.
      .attr('x', '-30%').attr('y', '-30%')
      .attr('width', '160%').attr('height', '160%')
      .append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', EXPANDED_CLUSTER.region.glass.backingBlur)

    regionGroups.append('circle')
      .attr('class', 'expanded-region-glass')
      .attr('r', d => d.radius)
      .attr('fill', d => d.primary ? EXPANDED_CLUSTER.region.fill : EXPANDED_CLUSTER.region.fillRelated)
      .attr('filter', 'url(#expanded-region-glass-blur)')
      .style('pointer-events', 'none')

    // The translucent circular container — the cluster itself, at drill-down
    // scale. Keeps the existing purple identity and dashed perimeter.
    regionGroups.append('circle')
      .attr('class', 'expanded-region-circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.primary ? EXPANDED_CLUSTER.region.fill : EXPANDED_CLUSTER.region.fillRelated)
      .attr('stroke', EXPANDED_CLUSTER.region.stroke)
      .attr('stroke-dasharray', EXPANDED_CLUSTER.region.strokeDasharray)
      .attr('stroke-opacity', d =>
        d.primary ? EXPANDED_CLUSTER.region.strokeOpacity : EXPANDED_CLUSTER.region.strokeOpacityRelated)
      .style('pointer-events', 'auto')
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent, d: DrilldownRegion) => {
        event.stopPropagation()
        // Every region is explicitly expanded — clicking it collapses IT,
        // leaving any other expanded clusters open.
        ctx.onCollapse(d.cluster.id)
      })

    // The region's entity points — real graph entities plus the layer-local
    // demo fill (see useDrilldownModel), packed inside their own cluster.
    const entityGroups = regionGroups.append('g').attr('class', 'expanded-entities')

    const entityDots = entityGroups.selectAll('circle.expanded-entity')
      .data((d: DrilldownRegion) => d.entities.map(e => ({ ...e, region: d })))
      .enter()
      .append('circle')
      .attr('class', 'expanded-entity')
      .attr('cx', (d: any) => d.dx)
      .attr('cy', (d: any) => d.dy)
      .attr('fill', entityColor)
      .style('pointer-events', 'auto')
      .style('cursor', 'pointer')
      .on('mouseenter', (_event: MouseEvent, d: any) => applyEntityFocus(d.node.id))
      .on('mouseleave', () => applyEntityFocus(null))

    // Labels: only entities in a CROSS-CLUSTER relationship carry a persistent
    // name (they explain why two regions are joined); everything else stays a
    // dot until hovered — one label per entity would be a wall of text at this
    // density. All names are stable and synthetic: demo entities carry theirs
    // from demoEntities.ts, and real dataset entities (which have no `label`)
    // get an id-seeded synthetic display name from the same category pool, so
    // no raw ids leak into the canvas and nothing changes between renders.
    //
    // Placement is side-aware — the label sits on the entity's outward side
    // (start-anchored on the right half, end-anchored on the left), so labels
    // point out of the dense disc instead of colliding across its centre.
    const labelSide = (d: any) => (d.dx >= 0 ? 1 : -1)
    const entityLabels = entityGroups.selectAll('text.expanded-entity-label')
      .data((d: DrilldownRegion) => d.entities.map(e => ({ ...e, region: d })))
      .enter()
      .append('text')
      .attr('class', 'expanded-entity-label')
      .attr('x', (d: any) => d.dx + labelSide(d) * EXPANDED_CLUSTER.entityLabel.offsetX)
      .attr('y', (d: any) => d.dy)
      .attr('text-anchor', (d: any) => labelSide(d) > 0 ? 'start' : 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-family', EXPANDED_CLUSTER.entityLabel.fontFamily)
      .attr('font-weight', EXPANDED_CLUSTER.entityLabel.fontWeight)
      .attr('fill', EXPANDED_CLUSTER.entityLabel.ink)
      .attr('opacity', 0)
      .style('pointer-events', 'none')
      .style('-webkit-text-stroke-color', EXPANDED_CLUSTER.entityLabel.textStroke)
      .style('-webkit-text-stroke-width', `${EXPANDED_CLUSTER.entityLabel.textStrokeWidth}px`)
      .text((d: any) => d.node.label || syntheticNameFor(d.node.id, d.region.category))

    // ── Category chip: `[ • Name  × ]`, opaque, width hugs the label ───────
    // Uses the cluster's EXISTING semantic category (People / Messages /
    // Events / …). Clusters without one show no chip rather than a made-up label.
    const chip = EXPANDED_CLUSTER.chip
    const chipGroups = regionGroups
      .filter((d: DrilldownRegion) => !!d.category)
      .append('g')
      .attr('class', 'expanded-region-chip')
      .style('pointer-events', 'none')

    // Colours are DS TOKENS resolved live against the Vuetify theme — the
    // renderer never carries a hex. `rx = height/2` keeps it a pill at any
    // height, and the chip is solid at 100%: no translucent purple anywhere.
    const chipFill = themeColor(chip.fillToken)
    const chipInk = themeColor(chip.inkToken)
    const chipBorder = themeColor(chip.borderToken)
    const chipClose = themeColor(chip.closeToken)

    chipGroups.append('rect')
      .attr('class', 'expanded-chip-bg')
      .attr('y', -chip.height / 2)
      .attr('height', chip.height)
      .attr('rx', chip.height / 2)
      .attr('fill', chipFill)
      .attr('stroke', chipBorder)
      .attr('stroke-width', chip.borderWidth)

    chipGroups.append('circle')
      .attr('class', 'expanded-chip-dot')
      .attr('cx', chip.paddingX + chip.dotRadius)
      .attr('cy', 0)
      .attr('r', chip.dotRadius)
      .attr('fill', chipInk)

    const chipTexts = chipGroups.append('text')
      .attr('class', 'expanded-chip-label')
      .attr('x', chip.paddingX + chip.dotRadius * 2 + chip.gap)
      .attr('y', 0)
      .attr('dominant-baseline', 'middle')
      .attr('font-family', chip.fontFamily)
      .attr('font-size', chip.fontSize)
      .attr('font-weight', chip.fontWeight)
      .attr('fill', chipInk)
      .text(d => d.category as string)

    // The seam between the chip's identity and its action. Same paint as the
    // pill's own outline (`chipBorder`), so it reads as part of the chip
    // rather than a new colour, and spans the INNER height — the body inside
    // the 1px border — so it stops flush with the edge instead of crossing it.
    // Its x is set in update(), where the measured hug-content width is known.
    chipGroups.append('line')
      .attr('class', 'expanded-chip-divider')
      .attr('stroke', chipBorder)
      .attr('stroke-width', chip.divider.width)
      .attr('y1', -chip.height / 2 + chip.borderWidth)
      .attr('y2', chip.height / 2 - chip.borderWidth)

    // The × on EVERY chip — each region was explicitly opened, so each one is
    // individually closable. Carbon `close` glyph (the same icon the app's
    // icon layer maps to the `close` key), with its own padded hit area.
    // Independently interactive: it never bubbles into node drag / canvas pan.
    const closeGroups = chipGroups
      .append('g')
      .attr('class', 'expanded-chip-close')
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('aria-label', (d: DrilldownRegion) => `Collapse ${d.category ?? 'cluster'} cluster`)
      .style('pointer-events', 'auto')
      .style('cursor', 'pointer')
      .on('pointerdown', (event: PointerEvent) => {
        // Swallow the press: a click on the × must never start a canvas pan
        // (d3.zoom listens on the svg) or read as a canvas click.
        event.stopPropagation()
      })
      .on('click', (event: MouseEvent, d: DrilldownRegion) => {
        event.stopPropagation()
        ctx.onCollapse(d.cluster.id)
      })
      .on('keydown', (event: KeyboardEvent, d: DrilldownRegion) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          ctx.onCollapse(d.cluster.id)
        }
      })

    // Invisible padded hit area behind the glyph.
    closeGroups.append('rect')
      .attr('class', 'expanded-chip-close-hit')
      .attr('x', -chip.close.hitPadding)
      .attr('y', -chip.close.size / 2 - chip.close.hitPadding)
      .attr('width', chip.close.size + chip.close.hitPadding * 2)
      .attr('height', chip.close.size + chip.close.hitPadding * 2)
      .attr('fill', 'transparent')

    closeGroups.append('path')
      .attr('class', 'expanded-chip-close-glyph')
      .attr('d', chip.close.path)
      // The ink is now an OPAQUE token (the DS's darkest), so the resting
      // opacity has to come from the token pair — hover/focus then lifts it to
      // solid via the stylesheet, the same mechanism as before.
      .attr('fill', chipClose)
      .attr('opacity', chip.close.opacity)
      // Carbon glyphs live in a 32-unit viewBox: scale into the chip's box,
      // centred on the group's local origin (x: 0..size, y: -size/2..size/2).
      .attr('transform', `translate(0, ${-chip.close.size / 2}) scale(${chip.close.size / chip.close.viewBox})`)

    /**
     * Chip width HUGS its content: measured label advance + paddings + dot +
     * the close glyph (every chip carries one). Measured per update because
     * the font may finish loading after first paint.
     */
    const chipWidth = (_d: DrilldownRegion, textLength: number) => {
      // Layout, left → right:
      //   paddingX │ dot │ gap │ label │ divider.gap │ rule │ close.gap │ × │ close.paddingRight
      // The trailing edge uses close.paddingRight, NOT paddingX — the close
      // section is compact on its own terms while the leading edge keeps the
      // chip's full padding.
      const dividerWidth = chip.divider.gap + chip.divider.width
      const closeWidth = chip.close.gap + chip.close.size
      return chip.paddingX + chip.dotRadius * 2 + chip.gap + textLength
        + dividerWidth + closeWidth + chip.close.paddingRight
    }

    // ── Hover isolation inside the expanded view ───────────────────────────
    /**
     * Hovering an entity shows its label, emphasizes its directly connected
     * entities and their STRAIGHT relationship lines, and dims the other
     * entity points and lines of the focused view. Opacity only — nothing
     * moves, nothing leaves the DOM, and no line changes shape.
     */
    function applyEntityFocus(entityId: string | null) {
      focusedEntityId = entityId
      const t = EXPANDED_CLUSTER

      // THE canonical active set (deriveHoverActiveSet, model-side): hovered
      // entity + connected entities + their regions/chips + the Sources,
      // Insights and collapsed clusters genuinely on the relationship path.
      // Every opacity below consumes it — nothing computes its own set.
      const active = entityId ? deriveHoverActiveSet(model, entityId) : null

      entityDots.attr('opacity', (d: any) => {
        const base = d.region.primary ? t.entity.opacity : t.entity.opacityRelated
        if (!active) return base
        if (d.node.id === active.hoveredId) return 1
        return active.entityIds.has(d.node.id) ? 1 : t.entity.dimOpacity
      })

      // Persistent labels for cross-cluster connected entities; hover reveals
      // the hovered entity's label at full emphasis and keeps its connected
      // (active) entities' labels readable while the rest fall silent.
      entityLabels.attr('opacity', (d: any) => {
        const id = d.node.id
        const cross = model.crossLinkedEntityIds.has(id)
        // `labelSuppressed` comes from the collision pass: a label that could
        // not find a non-overlapping slot fades out instead of stacking. The
        // HOVERED entity's own label always shows — hover empties the label
        // field around it, so its slot is free by construction.
        if (!active) return cross && !d.labelSuppressed ? t.entityLabel.persistentOpacity : 0
        if (id === active.hoveredId) return t.entityLabel.opacity
        return active.entityIds.has(id) && !d.labelSuppressed
          ? t.entityLabel.persistentOpacity
          : 0
      })

      // Connection opacity comes from the BASE link scale (LINK_STYLING) so
      // hovering inside a region reads exactly like hovering a node in the
      // normal graph does: related links lift to `hover`, unrelated ones drop
      // to `hidden`, and the resting state is `base`.
      const linkOpacity = LINK_STYLING.opacity

      relationLines.attr('stroke-opacity', (d: EntityRelation) => {
        if (!active) return linkOpacity.base
        const aOn = active.entityIds.has(d.aEntityId)
        const bOn = d.bKind === 'cluster'
          ? active.baseNodeIds.has(d.bEntityId)
          : active.entityIds.has(d.bEntityId)
        return aOn && bOn ? linkOpacity.hover : linkOpacity.hidden
      })

      routedLines.attr('stroke-opacity', (d: any) => {
        if (active) {
          // The model already decided which routed lines ARE the relationship
          // being inspected (every Insight line of the hovered entity's region,
          // plus anything anchored to an active entity) — consume that set
          // rather than re-deriving a second rule here, so a lit Insight can
          // never be left with an invisible line to it.
          return active.routedKeys.has(d.key) ? linkOpacity.hover : linkOpacity.hidden
        }
        // A contextual region's own links stay one emphasis step back, the
        // same relationship the base graph draws between a selected
        // neighbourhood and the rest.
        return d.emphasized ? linkOpacity.base : linkOpacity.hidden
      })

      // Region containers + chips: only regions holding an active entity stay
      // prominent; the rest drop to the hover-disabled opacity. The blurred
      // backing disc is part of the container's look, so it dims in lockstep.
      regionsGroup.selectAll('circle.expanded-region-circle, circle.expanded-region-glass')
        .attr('opacity', (d: any) =>
          !active || active.regionIds.has(d.cluster.id) ? 1 : t.hover.regionOpacity)
      chipGroups.attr('opacity', (d: any) =>
        !active || active.regionIds.has(d.cluster.id) ? 1 : t.hover.chipOpacity)

      // The BASE graph underneath: while hovering, only the path's Sources,
      // Insights and collapsed clusters keep the drill-down emphasis —
      // everything else (including previously emphasized siblings and
      // collapsed related clusters) drops to the disabled opacity. Leaving
      // hover restores the exact pre-hover expanded state.
      if (active) {
        applyHoverBaseDim(svgSel, model, active)
        hoverBaseApplied = true
      } else if (hoverBaseApplied) {
        applyDrilldownEmphasis(svgSel, model)
        hoverBaseApplied = false
      }
    }

    /**
     * Hubs whose BASE elements this layer currently has re-anchored. Kept so a
     * hub that stops needing the offset (the graph moved, the drill-down
     * closed) is written back to its real position — the base tick handler
     * would eventually do it, but only if the simulation happens to be running.
     */
    let overriddenHubIds = new Set<string>()

    /**
     * Re-anchor the BASE elements of every displaced Source: its circle, its
     * icon, its label, and every base link/endpoint that terminates on it —
     * so a line still meets the Source's visible edge where the Source is
     * actually drawn.
     *
     * Writes SVG attributes only, never node data, and runs at the end of the
     * base tick (the component calls update() there), so it is the last word
     * on these attributes while the drill-down is open and a no-op the moment
     * it closes.
     */
    function applyHubDisplayPositions(hubDisplay: Map<string, { x: number, y: number }>) {
      const affected = new Set<string>([...overriddenHubIds, ...hubDisplay.keys()])
      overriddenHubIds = new Set(hubDisplay.keys())
      if (affected.size === 0) return

      const at = (node: any) => hubDisplay.get(node?.id) ?? { x: node?.x || 0, y: node?.y || 0 }
      const isAffected = (node: any) => !!node && affected.has(node.id)

      viewport.select('g.nodes').selectAll<any, any>('circle.node-circle')
        .filter((d: any) => isAffected(d))
        .attr('cx', (d: any) => at(d).x)
        .attr('cy', (d: any) => at(d).y)

      const sourceIconHalf = getSourceIconDiameter(zoomScale) / 2
      viewport.selectAll<any, any>('image.source-icon')
        .filter((d: any) => isAffected(d))
        .attr('x', (d: any) => at(d).x - sourceIconHalf)
        .attr('y', (d: any) => at(d).y - sourceIconHalf)

      const documentIconHalf = getDocumentIconDiameter(zoomScale) / 2
      viewport.selectAll<any, any>('image.document-icon')
        .filter((d: any) => isAffected(d))
        .attr('x', (d: any) => at(d).x - documentIconHalf)
        .attr('y', (d: any) => at(d).y - documentIconHalf)

      viewport.select('g.labels').selectAll<any, any>('text.source-label')
        .filter((d: any) => isAffected(d))
        .attr('x', (d: any) => at(d).x + TYPOGRAPHY.source.offsetX)
        .attr('y', (d: any) => at(d).y + TYPOGRAPHY.source.offsetY)

      viewport.select('g.labels').selectAll<any, any>('text.document-label')
        .filter((d: any) => isAffected(d))
        .attr('x', (d: any) => at(d).x + TYPOGRAPHY.document.offsetX)
        .attr('y', (d: any) => at(d).y + TYPOGRAPHY.document.offsetY)

      // Base links that still terminate on a displaced Source. `endpointsFor`
      // feeds the SAME geometry helper the base renderer uses, just with the
      // display position substituted, so the line ends on the visible boundary
      // exactly as it does everywhere else — and stays one straight segment.
      const touchesAffected = (d: any) => isAffected(d?.source) || isAffected(d?.target)
      const endpointsFor = (d: any) => getConnectionEndpoints(
        at(d.source),
        at(d.target),
        getEffectiveNodeRadius(d.source as any, zoomScale),
        getEffectiveNodeRadius(d.target as any, zoomScale),
        undefined,
        zoomScale,
      )
      viewport.selectAll<any, any>('line.link-line-foreground, line.link-line-background')
        .filter(touchesAffected)
        .attr('x1', (d: any) => endpointsFor(d).source.x)
        .attr('y1', (d: any) => endpointsFor(d).source.y)
        .attr('x2', (d: any) => endpointsFor(d).target.x)
        .attr('y2', (d: any) => endpointsFor(d).target.y)
      viewport.selectAll<any, any>('circle.link-endpoint')
        .filter(touchesAffected)
        .attr('cx', (d: any) => {
          const e = endpointsFor(d)
          return d.endpoint === 'source' ? e.source.x : e.target.x
        })
        .attr('cy', (d: any) => {
          const e = endpointsFor(d)
          return d.endpoint === 'source' ? e.source.y : e.target.y
        })
    }

    // ── Geometry, recomputed from live positions ───────────────────────────
    function update(nextZoomScale?: number) {
      if (typeof nextZoomScale === 'number' && nextZoomScale > 0) zoomScale = nextZoomScale
      const inverse = getInverseZoomScale(zoomScale)
      const centers = computeRegionCenters(model, nodeById)
      const centerOf = (id: string) => centers.get(id) ?? { x: 0, y: 0 }

      // Sources that would fall inside an expanded circle are DRAWN outside it
      // (see computeHubDisplayPositions). Display-only: the node objects — and
      // therefore the simulation — keep their real coordinates. Everything
      // below reads positions through `positionOf` so the Source's circle, its
      // icon, its label and every line that ends on it all agree on where it is.
      const hubDisplay = computeHubDisplayPositions(
        model,
        nodeById,
        centers,
        node => getEffectiveNodeRadius(node as any, zoomScale),
      )
      const positionOf = (node: NetworkNode | undefined | null) => {
        if (!node) return { x: 0, y: 0 }
        return hubDisplay.get(node.id) ?? { x: node.x || 0, y: node.y || 0 }
      }
      applyHubDisplayPositions(hubDisplay)

      // Regions ride their cluster: a dragged Source moves both.
      regionGroups.attr('transform', (d: DrilldownRegion) => {
        const c = centerOf(d.cluster.id)
        return `translate(${c.x},${c.y})`
      })

      /*
       * ── EXTERNAL ENTITIES: RE-RESOLVE THE PERIMETER SIDE, EVERY TICK ─────
       *
       * An entity that owns a cross-cluster relation is pinned to the outer
       * annulus facing its partner (the band and its tangential slot come
       * from the model — deterministic). The DIRECTION cannot be baked in:
       * expanding a cluster reheats the layout, which moves clusters, hubs and
       * therefore the drawn region centres, so a build-time direction is stale
       * within a second and used to strand entities on the FAR side of the
       * disc — the long crossing lines this fixes.
       *
       * So the angle is recomputed here from the live centres and the
       * partner's live position, then written back into the placement. The
       * relation lines and labels both read `placement.dx/dy` (through
       * entityPoint), so writing it here keeps every consumer consistent —
       * and because the radial value is clamped to the model's band, the
       * settle can never pull these entities back toward the centre.
       */
      for (const region of model.regions) {
        const centre = centerOf(region.cluster.id)
        /** This region's externals with their LIVE desired angles — written
         *  back only after the group is separated (see below). */
        const pending: Array<{ placement: EntityPlacement, angle: number, radius: number }> = []
        for (const placement of region.entities) {
          const external = placement.external
          if (!external || !external.targetIds.length) continue
          let sumX = 0
          let sumY = 0
          let resolved = 0
          for (const targetId of external.targetIds) {
            const partner = placementOf.get(targetId)
            if (partner) {
              // Entity in another expanded region: its ACTUAL drawn position.
              const partnerCentre = centerOf(partner.region.cluster.id)
              sumX += partnerCentre.x + partner.placement.dx
              sumY += partnerCentre.y + partner.placement.dy
              resolved++
              continue
            }
            const node = nodeById.get(targetId)
            if (node) {
              const p = positionOf(node)
              sumX += p.x
              sumY += p.y
              resolved++
            }
          }
          if (!resolved) continue
          // Several partners → their barycentre, i.e. the average direction.
          const angle = Math.atan2(sumY / resolved - centre.y, sumX / resolved - centre.x)
            + external.slotOffset
          const radius = Math.min(
            Math.max(Math.hypot(placement.dx, placement.dy), external.minRadius),
            external.maxRadius,
          )
          pending.push({ placement, angle, radius })
        }

        /*
         * MINIMUM ANGULAR SEPARATION across the region's whole external group.
         *
         * The model's slot fan only spreads entities that share one BUCKET;
         * externals whose provisional angles straddled a bucket boundary each
         * became a singleton (offset 0) and the live resolution above could
         * park them a couple of degrees apart — measured 6.5px between
         * 8px-diameter dots. No build-time offset can prevent that, because
         * the angles are re-derived from live positions every frame — so the
         * separation has to happen here, on the live values.
         *
         * `slotSpacing` is the floor (≈10°, ≈16px at these radii — the same
         * spacing the fan itself guarantees). Wraparound-safe: each angle is
         * unwrapped RELATIVE TO THE GROUP MEAN via angleDiff, sorted, swept
         * once left-to-right, then recentred so the group's average direction
         * — the bias toward the external targets — is preserved. Deterministic
         * for a given set of live positions, and stable frame to frame
         * because the inputs move continuously.
         */
        if (pending.length > 1) {
          const minGap = EXPANDED_CLUSTER.entity.externalBias.slotSpacing
          let mx = 0
          let my = 0
          for (const e of pending) {
            mx += Math.cos(e.angle)
            my += Math.sin(e.angle)
          }
          const mean = Math.atan2(my, mx)
          const items = pending
            .map(e => ({ e, rel: angleDiff(mean, e.angle) }))
            .sort((a, b) => a.rel - b.rel
              || (a.e.placement.node.id < b.e.placement.node.id ? -1 : 1))
          const before = items.reduce((sum, it) => sum + it.rel, 0) / items.length
          for (let i = 1; i < items.length; i++) {
            if (items[i].rel - items[i - 1].rel < minGap) {
              items[i].rel = items[i - 1].rel + minGap
            }
          }
          const after = items.reduce((sum, it) => sum + it.rel, 0) / items.length
          for (const it of items) it.e.angle = mean + it.rel - (after - before)
        }

        for (const { placement, angle, radius } of pending) {
          placement.dx = Math.cos(angle) * radius
          placement.dy = Math.sin(angle) * radius
        }
      }

      // Entity points: constant-screen floor so they stay pickable zoomed out.
      const dotRadius = Math.max(
        EXPANDED_CLUSTER.entity.radius,
        EXPANDED_CLUSTER.entity.minVisualRadius / zoomScale,
      )

      // ── STRICT CONTAINMENT: no dot may cross its region border ───────────
      // Runs AFTER every layout step that can move a dot (packing offsets,
      // the per-frame external angle resolution above) and BEFORE anything
      // renders or measures, every update — so no later step can undo it.
      // The bound uses the RENDERED dot radius (zoom-inflated, `dotRadius`
      // above), not the raw data radius, plus a constant-screen inset off the
      // dashed border:
      //   hypot(dx, dy) ≤ region.radius − dotRadius − containInset/zoom
      // A violating dot is projected straight back along its own angle, so an
      // external entity keeps its perimeter bias DIRECTION (still faces its
      // target) — only its overshoot is trimmed. Internal placements restart
      // from their original packed offsets each pass, so a clamp applied at
      // low zoom relaxes again when zooming back in.
      const containInset = EXPANDED_CLUSTER.entity.containInset / zoomScale
      placementOf.forEach(({ region, placement }) => {
        const p = placement as any
        if (p.packedDx === undefined) { p.packedDx = p.dx; p.packedDy = p.dy }
        if (!placement.external) { p.dx = p.packedDx; p.dy = p.packedDy }
        const maxDist = Math.max(0, region.radius - dotRadius - containInset)
        const dist = Math.hypot(p.dx, p.dy)
        if (dist > maxDist) {
          const f = dist > 0 ? maxDist / dist : 0
          p.dx *= f
          p.dy *= f
        }
      })

      // The dot and label selections hold their own (spread) copies of each
      // placement, so the resolved offsets above are synced into them here —
      // one place, before anything downstream reads `d.dx`/`d.dy`. ALL
      // placements sync (not only externals): the containment clamp above can
      // move internal dots too.
      const syncOffsets = (selection: d3.Selection<any, any, any, any>) => {
        selection.each(function (d: any) {
          const placement = placementOf.get(d.node.id)?.placement
          if (!placement) return
          d.dx = placement.dx
          d.dy = placement.dy
        })
      }
      syncOffsets(entityDots)
      syncOffsets(entityLabels)
      entityDots
        .attr('r', dotRadius)
        .attr('cx', (d: any) => d.dx)
        .attr('cy', (d: any) => d.dy)
      entityLabels.attr('y', (d: any) => d.dy)

      // ── Chip: CENTERED anchor, measured hug-content width ─────────────────
      // Positioned BEFORE the labels, because the labels avoid the chip (never
      // the other way round) and therefore need its box.
      //
      // The anchor is constant per region: the chip's leading DOT sits exactly
      // at the circle's centre and the pill extends rightward from it, holding
      // its place while entities, labels, the Source and the force layout all
      // move around it. The chip's rectangle is a reserved no-entity zone —
      // the packing pass (useDrilldownModel) keeps entity dots out of the same
      // box this pass computes for the labels.
      const chipFont = Math.max(chip.fontSize, chip.minVisualFontSize / zoomScale)
      const chipScale = chipFont / chip.fontSize
      /** Region id → the chip's box in REGION-LOCAL coords (for label collisions). */
      const chipBoxes = new Map<string, { x1: number, y1: number, x2: number, y2: number }>()
      chipGroups.each(function (d: DrilldownRegion) {
        const group = d3.select(this)
        const textNode = group.select<SVGTextElement>('text.expanded-chip-label').node()
        // Re-truncate from the full category each pass (the font may finish
        // loading between updates): labels longer than labelMaxWidth trim to
        // an ellipsis instead of stretching the pill.
        if (textNode) {
          const full = (d.category || '') as string
          textNode.textContent = full
          if ((textNode.getComputedTextLength?.() ?? 0) > chip.labelMaxWidth) {
            for (let len = full.length - 1; len > 0; len--) {
              textNode.textContent = `${full.slice(0, len)}…`
              if (textNode.getComputedTextLength() <= chip.labelMaxWidth) break
            }
          }
        }
        const measured = textNode?.getComputedTextLength?.() ?? (d.category || '').length * chip.fontSize * 0.6
        const textLength = Math.min(measured, chip.labelMaxWidth)
        const width = chipWidth(d, textLength)

        group.select('rect.expanded-chip-bg')
          .attr('x', 0)
          .attr('width', width)
        group.select('g.expanded-chip-close')
          .attr('transform', `translate(${width - chip.close.paddingRight - chip.close.size}, 0)`)
        // The rule sits in its reserved slot, measured from the SAME right
        // edge as the × so the two can never drift apart; x is the stroke's
        // centre, hence the half-width nudge.
        const dividerX = width - chip.close.paddingRight - chip.close.size - chip.close.gap
          - chip.divider.width / 2
        group.select('line.expanded-chip-divider')
          .attr('x1', dividerX)
          .attr('x2', dividerX)

        // CENTERED: translate so the leading dot (at local x =
        // paddingX + dotRadius, y = 0) lands exactly on the region's centre.
        // Purely a function of the chip's own paddings — nothing
        // content-derived — so the dot is pinned to the centre on every
        // region and while the graph settles.
        const drawnWidth = width * chipScale
        const drawnHeight = chip.height * chipScale
        const left = -(chip.paddingX + chip.dotRadius) * chipScale
        group.attr('transform', `translate(${left},0) scale(${chipScale})`)

        const pad = chip.collisionPad
        chipBoxes.set(d.cluster.id, {
          x1: left - pad,
          y1: -drawnHeight / 2 - pad,
          x2: left + drawnWidth + pad,
          y2: drawnHeight / 2 + pad,
        })
      })

      // ── Entity labels: deterministic collision / relaxation pass ─────────
      //
      // Runs AFTER entity positions are final and never moves a dot: each
      // label tries a fixed, ordered ladder of candidate slots around its own
      // dot (outward side, inward side, above, below, then vertically nudged
      // side slots) and takes the FIRST one that (a) stays inside its region
      // circle and (b) keeps `collisionPad` clear of the chip and of every
      // label already placed. If no candidate is inside the region, staying
      // clear outside it wins over overlapping inside it. If NOTHING is
      // clear: a cross-linked (persistently labelled) entity keeps the
      // least-overlapping slot — its label explains a relationship and must
      // survive — while a hover-only label is marked suppressed and faded by
      // the opacity pass instead of stacking text.
      //
      // Deterministic throughout: placement order is cross-linked first, then
      // entity id (no randomness, no DOM order dependence), and boxes come
      // from the text's ACTUAL getBBox() at the current font size, not from
      // character-count estimates.
      const labelFontSize = Math.max(
        EXPANDED_CLUSTER.entityLabel.fontSize,
        EXPANDED_CLUSTER.entityLabel.minVisualFontSize / zoomScale,
      )
      const labelGap = Math.max(
        EXPANDED_CLUSTER.entityLabel.offsetX,
        dotRadius + EXPANDED_CLUSTER.entityLabel.gap,
      )
      entityLabels.attr('font-size', labelFontSize)

      type LabelBox = { x1: number, y1: number, x2: number, y2: number }
      const labelPad = EXPANDED_CLUSTER.entityLabel.collisionPad
      const overlapArea = (a: LabelBox, b: LabelBox) =>
        Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) + labelPad)
        * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) + labelPad)
      const clearOf = (b: LabelBox, placed: LabelBox[]) =>
        placed.every(o => overlapArea(b, o) === 0)

      // ONE GLOBAL placement list, in ABSOLUTE coordinates: labels of
      // NEIGHBOURING regions can collide too (a label pointing out of one
      // region can reach across the seam into the next), so every region's
      // chip and every already-placed label participate, wherever they live.
      // Element attributes stay region-local (the groups are translated);
      // only the collision boxes are shifted by their region's centre.
      const labelItems: Array<{ el: SVGTextElement, d: any, cx: number, cy: number }> = []
      entityLabels.each(function (d: any) {
        const c = centerOf(d.region.cluster.id)
        labelItems.push({ el: this as SVGTextElement, d, cx: c.x, cy: c.y })
      })
      // Priority order: cross-linked labels place first (they are the
      // persistent ones), then id order — stable across every render.
      labelItems.sort((a, b) => {
        const cross = Number(model.crossLinkedEntityIds.has(b.d.node.id))
          - Number(model.crossLinkedEntityIds.has(a.d.node.id))
        return cross !== 0 ? cross : String(a.d.node.id).localeCompare(String(b.d.node.id))
      })

      const placed: LabelBox[] = []
      chipBoxes.forEach((box, regionId) => {
        const c = centerOf(regionId)
        placed.push({ x1: box.x1 + c.x, y1: box.y1 + c.y, x2: box.x2 + c.x, y2: box.y2 + c.y })
      })
      {
        for (const { el, d, cx, cy } of labelItems) {
          const regionRadius = d.region.radius
          // ACTUAL rendered box (current font size), not an estimate.
          const bb = el.getBBox()
          const w = bb.width || (el.getComputedTextLength?.() ?? 0)
          const h = bb.height || labelFontSize

          type Candidate = { x: number, y: number, anchor: string, box: LabelBox }
          const sideSlot = (side: number, vy: number): Candidate => {
            const x = d.dx + side * labelGap
            return {
              x, y: d.dy + vy, anchor: side > 0 ? 'start' : 'end',
              box: {
                x1: side > 0 ? x : x - w, x2: side > 0 ? x + w : x,
                y1: d.dy + vy - h / 2, y2: d.dy + vy + h / 2,
              },
            }
          }
          const stackSlot = (dir: number, tier: number = 1): Candidate => {
            const y = d.dy + dir * (dotRadius + EXPANDED_CLUSTER.entityLabel.gap + h / 2
              + (tier - 1) * (h + labelPad))
            return {
              x: d.dx, y, anchor: 'middle',
              box: { x1: d.dx - w / 2, x2: d.dx + w / 2, y1: y - h / 2, y2: y + h / 2 },
            }
          }
          // Outward side first — external entities keep their perimeter-facing
          // bias — then progressively less preferred slots. The ladder is
          // DEEP on purpose: cross-linked entities bunch on the target-facing
          // arc, so several labels compete for the same corridor and the
          // shallow slots run out fast. Fixed order = deterministic result.
          const outward = d.dx >= 0 ? 1 : -1
          const vStep = h + labelPad
          const candidates: Candidate[] = [
            sideSlot(outward, 0), sideSlot(-outward, 0),
            stackSlot(-1), stackSlot(1),
            sideSlot(outward, -vStep), sideSlot(outward, vStep),
            sideSlot(-outward, -vStep), sideSlot(-outward, vStep),
            sideSlot(outward, -2 * vStep), sideSlot(outward, 2 * vStep),
            sideSlot(-outward, -2 * vStep), sideSlot(-outward, 2 * vStep),
            stackSlot(-1, 2), stackSlot(1, 2),
          ]
          const insideRegion = (b: LabelBox) =>
            Math.hypot(Math.max(Math.abs(b.x1), Math.abs(b.x2)), Math.max(Math.abs(b.y1), Math.abs(b.y2)))
            <= regionRadius

          const absBox = (b: LabelBox): LabelBox =>
            ({ x1: b.x1 + cx, y1: b.y1 + cy, x2: b.x2 + cx, y2: b.y2 + cy })

          // Tier 1: inside the region AND clear. Tier 2: clear anywhere.
          // If NO slot is clear, the label FADES rather than stacks — for
          // every priority class. Priority is already encoded in placement
          // ORDER (cross-linked labels place first, so they claim slots
          // before hover-only labels can take them); a later label losing
          // its slot is by definition the lower-priority one of the pair.
          let choice = candidates.find(c => insideRegion(c.box) && clearOf(absBox(c.box), placed))
            ?? candidates.find(c => clearOf(absBox(c.box), placed))
          let suppressed = false
          if (!choice) {
            suppressed = true
            choice = candidates[0]
          }
          if (!suppressed) placed.push(absBox(choice.box))
          d.labelSuppressed = suppressed
          d3.select(el)
            .attr('x', choice.x)
            .attr('y', choice.y)
            .attr('text-anchor', choice.anchor)
        }
      }

      /** Absolute position of a revealed entity point. */
      const entityPoint = (id: string) => {
        const found = placementOf.get(id)
        if (!found) return null
        const c = centerOf(found.region.cluster.id)
        return { x: c.x + found.placement.dx, y: c.y + found.placement.dy }
      }
      const gap = EXPANDED_CLUSTER.links.endpointGap

      // Cross-cluster relationships: ONE straight segment. The B side is
      // either an entity dot in another expanded region, or — while that
      // cluster is still collapsed — its normal node-circle, trimmed to the
      // circle's visible boundary. Width comes from the base link scale, so an
      // expanded-level line is the same weight as any other connection.
      relationLines
        .attr('stroke-width', getLinkStrokeWidth('default', zoomScale))
        .each(function (d: EntityRelation) {
          const a = entityPoint(d.aEntityId)
          if (!a) return applySegment(d3.select(this), null)
          if (d.bKind === 'cluster') {
            const clusterNode = nodeById.get(d.bEntityId)
            if (!clusterNode) return applySegment(d3.select(this), null)
            const p = positionOf(clusterNode)
            const r = getEffectiveNodeRadius(clusterNode as any, zoomScale) + gap
            return applySegment(d3.select(this), trimmedSegment(
              a.x, a.y, dotRadius + gap,
              p.x, p.y, r,
            ))
          }
          const b = entityPoint(d.bEntityId)
          if (!b) return applySegment(d3.select(this), null)
          applySegment(d3.select(this), trimmedSegment(
            a.x, a.y, dotRadius + gap,
            b.x, b.y, dotRadius + gap,
          ))
        })

      // External links the base layer no longer draws: ONE straight segment,
      // ending on the region perimeter / node boundary.
      const shapeOf = (id: string): { x: number, y: number, r: number } | null => {
        const region = model.regionById.get(id)
        if (region) {
          const c = centerOf(id)
          return { x: c.x, y: c.y, r: region.radius }
        }
        const node = nodeById.get(id)
        if (!node) return null
        const point = positionOf(node)
        return {
          x: point.x,
          y: point.y,
          r: getEffectiveNodeRadius(node as any, zoomScale) + gap,
        }
      }
      routedLines
        // Re-anchored base links keep the base width for their own link kind —
        // they ARE base links, only ending on a different boundary: the region
        // perimeter, or — for Insight links — a deterministic entity dot
        // INSIDE the region (`Insight → entity`, never `Insight → circle`).
        .attr('stroke-width', (d: any) => getLinkStrokeWidth(d.kind ?? 'default', zoomScale))
        .each(function (d: any) {
          const endpointFor = (id: string, anchorEntityId?: string) => {
            if (anchorEntityId) {
              const p = entityPoint(anchorEntityId)
              if (p) return { x: p.x, y: p.y, r: dotRadius + gap }
            }
            return shapeOf(id)
          }
          const a = endpointFor(d.sourceId, d.sourceAnchorEntityId)
          const b = endpointFor(d.targetId, d.targetAnchorEntityId)
          if (!a || !b) return applySegment(d3.select(this), null)
          applySegment(d3.select(this), trimmedSegment(a.x, a.y, a.r, b.x, b.y, b.r))
        })

      // Re-assert the opacity state (also seeds it on the first update()).
      applyEntityFocus(focusedEntityId)
    }

    update(zoomScale)

    return {
      update,
      destroy: () => {
        // Put every re-anchored Source back on its real coordinates before the
        // layer goes: the base tick would do it, but only if the simulation is
        // still running — a cold graph would keep the drill-down's offset.
        applyHubDisplayPositions(new Map())
        layer.remove()
      },
    }
  }

  /**
   * Dim everything outside the focused neighbourhood.
   *
   * Opacity only, on the elements the base renderer already drew — nothing is
   * removed from the DOM and no geometry is recomputed, so the rest of the
   * graph stays visible behind the focused area as context.
   *
   * The two exceptions are the expanded clusters' own `.node-circle`s: those
   * are the marks the large regions stand in for, so they are hidden outright
   * and stop taking pointer events while the drill-down is open.
   */
  /**
   * ENTITY-HOVER overlay on the BASE graph: while an `expanded-entity` is
   * hovered, only the base nodes in the canonical active set
   * (`deriveHoverActiveSet` — the path's Sources, Insights and collapsed
   * clusters) keep their emphasis; every other base element, INCLUDING nodes
   * the resting drill-down emphasis keeps lit (Source siblings, related
   * collapsed clusters, other regions' hubs), drops to the disabled opacity.
   *
   * Same contract as applyDrilldownEmphasis: opacity only, nothing leaves the
   * DOM, pointer-events untouched — and leaving hover restores the resting
   * state by simply re-running applyDrilldownEmphasis.
   */
  function applyHoverBaseDim(
    svg: d3.Selection<any, unknown, null, undefined>,
    model: DrilldownModel,
    active: HoverActiveSet,
  ) {
    const dim = EXPANDED_CLUSTER.dim
    const isRegion = (id: string) => model.regionById.has(id)
    const on = (id: string) => active.baseNodeIds.has(id)

    svg.selectAll('circle.node-circle')
      .attr('opacity', (d: any) => isRegion(d.id) ? 0 : on(d.id) ? 1 : dim.node)
      // Marked so the base graph's hover glow can exclude it explicitly (the
      // circle is invisible and inert while its region is open).
      .classed('is-expanded-region', (d: any) => isRegion(d.id))

    const linkOpacity = (base: number) => (d: any) => {
      const s = d.source?.id
      const t = d.target?.id
      if (isRegion(s) || isRegion(t)) return 0
      return on(s) && on(t) ? base : dim.link
    }
    svg.selectAll('line.link-line-foreground').attr('opacity', linkOpacity(LINK_STYLING.opacity.hover))
    svg.selectAll('line.link-line-background').attr('opacity', linkOpacity(0.25))
    svg.selectAll('circle.link-endpoint').attr('opacity', linkOpacity(LINK_STYLING.endpoints.opacity))

    svg.selectAll('text.source-label')
      .attr('opacity', (d: any) => on(d.id) ? TYPOGRAPHY.source.opacity : dim.label)
    svg.selectAll('text.document-label')
      .attr('opacity', (d: any) => on(d.id) ? TYPOGRAPHY.document.opacity : dim.label)
    svg.selectAll('image.source-icon, image.document-icon')
      .attr('opacity', (d: any) => on(d.id) ? SOURCE_NODES.icon.opacity : dim.icon)
  }

  function applyDrilldownEmphasis(
    svg: d3.Selection<any, unknown, null, undefined>,
    model: DrilldownModel,
  ) {
    const dim = EXPANDED_CLUSTER.dim
    const isRegion = (id: string) => model.regionById.has(id)
    const emphasized = (id: string) => model.emphasizedIds.has(id)

    svg.selectAll('circle.node-circle')
      .attr('opacity', (d: any) => isRegion(d.id) ? 0 : emphasized(d.id) ? 1 : dim.node)
      // Marked so the base graph's hover glow can exclude it explicitly (the
      // circle is invisible and inert while its region is open).
      .classed('is-expanded-region', (d: any) => isRegion(d.id))
      .style('pointer-events', (d: any) => isRegion(d.id) ? 'none' : 'auto')

    const linkOpacity = (base: number) => (d: any) => {
      const s = d.source?.id
      const t = d.target?.id
      // Re-anchored by the expanded layer → the base line must go.
      if (isRegion(s) || isRegion(t)) return 0
      return emphasized(s) && emphasized(t) ? base : dim.link
    }
    svg.selectAll('line.link-line-foreground').attr('opacity', linkOpacity(LINK_STYLING.opacity.hover))
    svg.selectAll('line.link-line-background').attr('opacity', linkOpacity(0.25))
    svg.selectAll('circle.link-endpoint').attr('opacity', linkOpacity(LINK_STYLING.endpoints.opacity))

    svg.selectAll('text.source-label')
      .attr('opacity', (d: any) => emphasized(d.id) ? TYPOGRAPHY.source.opacity : dim.label)
    svg.selectAll('text.document-label')
      .attr('opacity', (d: any) => emphasized(d.id) ? TYPOGRAPHY.document.opacity : dim.label)
    svg.selectAll('image.source-icon, image.document-icon')
      .attr('opacity', (d: any) => emphasized(d.id) ? SOURCE_NODES.icon.opacity : dim.icon)
  }

  /** Restore the base graph's own opacities — the exact values it renders with. */
  function clearDrilldownEmphasis(svg: d3.Selection<any, unknown, null, undefined>) {
    svg.selectAll('circle.node-circle').attr('opacity', 1).style('pointer-events', 'auto').classed('is-expanded-region', false)
    svg.selectAll('line.link-line-foreground').attr('opacity', 0.9)
    svg.selectAll('line.link-line-background').attr('opacity', 0.25)
    svg.selectAll('circle.link-endpoint').attr('opacity', LINK_STYLING.endpoints.opacity)
    svg.selectAll('text.source-label').attr('opacity', TYPOGRAPHY.source.opacity)
    svg.selectAll('text.document-label').attr('opacity', TYPOGRAPHY.document.opacity)
    svg.selectAll('image.source-icon, image.document-icon').attr('opacity', SOURCE_NODES.icon.opacity)
  }

  return { renderDrilldown, applyDrilldownEmphasis, clearDrilldownEmphasis }
}
