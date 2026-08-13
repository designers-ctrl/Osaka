<!--
  src/components/graphs/NetworkGraphD3.vue

  D3-based force-directed and hierarchical network graph visualization.
  Supports toggling between "unstructured" (force-directed) and "structured"
  (hierarchical) layouts, with interactive cluster selection and timeline filtering.

  Vue owns data state; D3 owns DOM rendering and physics simulation.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import * as d3 from 'd3'
import type { NetworkNode, NetworkLink } from '@/components/charts'
import { useChartTheme, withAlpha } from '@/components/charts'
import { useD3Force } from './useD3Force'
import { useD3Hierarchy } from './useD3Hierarchy'
import { useD3Interaction } from './useD3Interaction'
import { useD3Drag } from './useD3Drag'
import { useStructuredRenderer, STRUCTURED_VIEWPORT } from './structured'
import { SOURCE_ICONS } from '@/data/graphWorkspace'
import {
  VIEWPORT,
  LINK_STYLING,
  TYPOGRAPHY,
  SOURCE_NODES,
  NODE_DIAMETERS,
  NODE_STYLING,
  ANIMATIONS,
  getEffectiveNodeRadius,
  getNodeStrokeWidth,
  getLinkStrokeWidth,
  getScaledLabelFontSize,
  getIconDiameter,
  getSourceNodeRadius,
  getSourceIconDiameter,
  getInverseZoomScale,
  getConnectionEndpoints,
} from './graphTokens'

interface Props {
  nodes: NetworkNode[]
  links: NetworkLink[]
  height: number
  layoutMode: 'unstructured' | 'structured'
  zoom?: number
  title?: string
  // Structured view only: user and sentiment data for center avatar
  userInitials?: string
  sentimentPercent?: number
  sentimentLabel?: string
}

interface Emits {
  (e: 'cluster-click', nodeId: string): void
  // Fired on every camera change with whether the viewport currently matches
  // the initial fit-to-view framing (drives the Reset control's visibility)
  (e: 'viewport-change', atInitialView: boolean): void
}

const props = withDefaults(defineProps<Props>(), {
  zoom: 1,
})

const emit = defineEmits<Emits>()

const containerRef = useTemplateRef<HTMLDivElement>('container')
const svgRef = useTemplateRef<SVGSVGElement>('svg')

// D3 utilities
let zoomBehaviorInstance: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
const { createForceSimulation, updatePositions } = useD3Force()
const { createHierarchicalLayout } = useD3Hierarchy()
const { setupNodeInteraction, setupLinkInteraction, highlightConnectedNodes, applyNodeSelection, applyLinkSelection } = useD3Interaction()
const { createDragBehavior } = useD3Drag()

// Structured renderer (for layoutMode === 'structured')
const { renderStructured, cleanupStructured } = useStructuredRenderer()

// Theme colors
const chartTheme = useChartTheme()
const nodeColor = computed(() => (node: NetworkNode) => {
  const t = chartTheme.value
  if (node.kind === 'insight') return t.categorical[0]
  if (node.kind === 'entity') return t.categorical[1]
  if (node.kind === 'cluster') return t.categorical[2]
  if (node.kind === 'source') return t.categorical[3]
  if (node.kind === 'document') return t.categorical[4]
  return t.ink
})

const linkColor = computed(() => (link: NetworkLink) => {
  if (link.kind === 'overlap') return withAlpha('#656B69', 0.4)
  return withAlpha('#656B69', 0.3)
})

// State
const selectedCluster = ref<string | null>(null)
const highlightedNodes = ref<Set<string>>(new Set())
let simulation: d3.Simulation<NetworkNode, NetworkLink> | null = null
let animationFrameId: number | null = null
let isFirstInitialization = true
let currentZoomTransform: d3.ZoomTransform | null = null
let currentZoomScale: number = 1 // Track zoom scale for constant-screen rendering
let previousNodeIds: Set<string> = new Set() // Track previous node set for diff detection
// While true, the camera re-fits to the graph bounds on each simulation tick so
// the whole graph stays in view while the force layout settles on first load.
// Cleared on any user zoom/pan gesture, zoom button, or Timeline filter update.
let followInitialFit = false
let tickCount = 0 // === TEMPORARY DIAGNOSTIC: For tick monitoring ===

// Dimensions
const width = computed(() => containerRef.value?.clientWidth || 800)
const scaledHeight = computed(() => Math.max(320, props.height))

// Effective rendered node radius at the CURRENT zoom level — delegates to
// graphTokens' single source of truth, so link endpoint geometry (every
// getConnectionEndpoints call site below) always matches the radius the
// circle is actually drawn with, including the source nodes' minimum
// screen-size clamp at low zoom.
function getNodeRadiusFromData(node: NetworkNode): number {
  return getEffectiveNodeRadius(node as any, currentZoomScale)
}

// Layout nodes based on mode
const layoutNodes = computed(() => {
  if (props.layoutMode === 'structured') {
    const layout = createHierarchicalLayout(props.nodes, props.links, {
      width: 800,
      height: 600,
    })
    return layout
  }
  return props.nodes
})

/**
 * Compute the initial camera transform. Single source of truth for the
 * first-entry framing — used on load (resetZoom), by resetView(), and by the
 * settle-follow refit below.
 *
 * Unstructured: a true fit-to-view over the rendered bounds of every visible
 * node (position ± radius, padded by VIEWPORT.initialZoom.fitPadding), centered.
 * Computed in viewBox units — the space the zoom transform actually operates
 * in, since the SVG carries a `viewBox` of dataWidth × dataHeight — so the
 * framing is correct regardless of the container's pixel size.
 *
 * Structured: its own camera, derived from the Structured graph's bounds.
 * The radial layout is drawn around origin (0,0) with a known outer visual
 * radius (cluster ring + labels, STRUCTURED_VIEWPORT.outerRadius), so the
 * fit is: translate origin to the viewBox center, scale so the full circle
 * (padded) fits the viewBox's smaller dimension. Ring coordinates are never
 * shifted — only this camera transform.
 */
function computeInitialTransform(): d3.ZoomTransform {
  if (props.layoutMode === 'structured') {
    const contentRadius = STRUCTURED_VIEWPORT.outerRadius + STRUCTURED_VIEWPORT.fitPadding
    const scale = Math.min(VIEWPORT.dataWidth, VIEWPORT.dataHeight) / (2 * contentRadius)
    return d3.zoomIdentity
      .translate(VIEWPORT.dataWidth / 2, VIEWPORT.dataHeight / 2)
      .scale(scale)
  }

  if (props.layoutMode === 'unstructured') {
    // Bounds of all visible rendered nodes in data space
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of layoutNodes.value as any[]) {
      if (n.kind === 'entity') continue // entities are never rendered
      if (typeof n.x !== 'number' || typeof n.y !== 'number') continue
      // Base-size radius (zoom 1): initial-fit bounds are zoom-independent.
      const r = getEffectiveNodeRadius(n, 1)
      if (n.x - r < minX) minX = n.x - r
      if (n.y - r < minY) minY = n.y - r
      if (n.x + r > maxX) maxX = n.x + r
      if (n.y + r > maxY) maxY = n.y + r
    }

    if (Number.isFinite(minX)) {
      const pad = VIEWPORT.initialZoom.fitPadding
      minX -= pad
      minY -= pad
      maxX += pad
      maxY += pad
      const boundsWidth = maxX - minX
      const boundsHeight = maxY - minY
      const scale = Math.min(VIEWPORT.dataWidth / boundsWidth, VIEWPORT.dataHeight / boundsHeight)
      // Center the padded bounds inside the viewBox
      const tx = (VIEWPORT.dataWidth - boundsWidth * scale) / 2 - minX * scale
      const ty = (VIEWPORT.dataHeight - boundsHeight * scale) / 2 - minY * scale
      return d3.zoomIdentity.translate(tx, ty).scale(scale)
    }
    // No positioned nodes yet: fall through to the container-fit fallback below
  }

  const containerRect = containerRef.value?.getBoundingClientRect()
  const containerWidth = containerRect?.width || 1200
  const containerHeight = containerRect?.height || 600

  // Scale to fit entire data space in viewport with generous margin (from graphTokens)
  const scaleX = containerWidth / VIEWPORT.dataWidth
  const scaleY = containerHeight / VIEWPORT.dataHeight
  const initialScale = Math.min(scaleX, scaleY) * VIEWPORT.initialZoom.marginMultiplier

  // Center the view
  const initialTx = (containerWidth - VIEWPORT.dataWidth * initialScale) / 2
  const initialTy = (containerHeight - VIEWPORT.dataHeight * initialScale) / 2
  return d3.zoomIdentity.translate(initialTx, initialTy).scale(initialScale)
}

/**
 * Initialize or update the D3 visualization.
 * @param resetZoom - If true, fit the graph to the viewport. If false, preserve current zoom.
 */
function initializeVisualization(resetZoom = true) {
  console.log(`[D3] initializeVisualization called with resetZoom=${resetZoom}, isFirstInitialization=${isFirstInitialization}, currentZoomTransform=${currentZoomTransform ? 'exists' : 'null'}`)
  if (!svgRef.value || !containerRef.value) return

  // ── SETUP SVG ─────────────────────────────────────────────────────────────────
  const svg = d3.select(svgRef.value)

  // ── DECLARE VARIABLES USED BY BOTH PATHS ──────────────────────────────────────
  let g: any = null
  let links: any
  let linksBackground: any
  let linkEndpoints: any
  let nodes: any
  let labelGroup: any
  let dataWidth = VIEWPORT.dataWidth
  let dataHeight = VIEWPORT.dataHeight

  // ── DISPATCH TO STRUCTURED RENDERER IF NEEDED ──────────────────────────────
  if (props.layoutMode === 'structured') {
    console.log(`[D3] Structured layout mode detected → delegating to useStructuredRenderer`)
    svg.selectAll('*').remove() // Clear SVG before structured render

    // Same viewBox as unstructured, set explicitly so structured never
    // depends on a previous unstructured render having configured the SVG.
    svg.attr('viewBox', [0, 0, dataWidth, dataHeight])
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('pointer-events', 'all')

    renderStructured(svgRef.value, layoutNodes.value as any, props.links, {
      width: VIEWPORT.dataWidth,
      height: VIEWPORT.dataHeight,
      zoom: 1, // TODO: Use actual zoom from component state
      userInitials: props.userInitials,
      sentimentPercent: props.sentimentPercent,
      sentimentLabel: props.sentimentLabel,
      chartTheme: chartTheme.value,
    })

    // After structured rendering, select the viewport group that was just created
    // This allows zoom transforms to be applied below (same as unstructured path)
    g = svg.select('g.viewport')
    console.log(`[D3] Structured viewport group selected, proceeding to zoom setup`)
  } else {
    // ── UNSTRUCTURED RENDERING PATH ────────────────────────────────────────────

  // Preserve current zoom transform before clearing
  if (!resetZoom && currentZoomTransform) {
    console.log(`[D3] Preserving zoom transform: scale=${currentZoomTransform.k}, tx=${currentZoomTransform.x}, ty=${currentZoomTransform.y}`)
  }

  // Clear previous
  svg.selectAll('*').remove()

  // Setup SVG viewBox to match data coordinate space
  console.log(`[D3] Setting viewBox to ${dataWidth}x${dataHeight}`)
  svg.attr('viewBox', [0, 0, dataWidth, dataHeight])
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('pointer-events', 'all')

  // Groups for layers
  const defs = svg.append('defs')

  // Arrow marker for directed links
  defs.append('marker')
    .attr('id', 'arrowhead')
    .attr('markerWidth', 10)
    .attr('markerHeight', 10)
    .attr('refX', 9)
    .attr('refY', 3)
    .attr('orient', 'auto')
    .append('polygon')
    .attr('points', '0 0, 10 3, 0 6')
    .attr('fill', withAlpha(chartTheme.value.ink, 0.4))

  // Drop shadow filter for insight nodes
  defs.append('filter')
    .attr('id', 'insight-shadow')
    .append('feDropShadow')
    .attr('dx', 0)
    .attr('dy', 0)
    .attr('stdDeviation', 2)
    .attr('flood-color', '#7C6749')
    .attr('flood-opacity', 0.8)

  // Blur filter for connection line glow and endpoints
  defs.append('filter')
    .attr('id', 'link-background-blur')
    .append('feGaussianBlur')
    .attr('in', 'SourceGraphic')
    .attr('stdDeviation', LINK_STYLING.blur.amount)

  defs.append('filter')
    .attr('id', 'link-endpoint-blur')
    .append('feGaussianBlur')
    .attr('in', 'SourceGraphic')
    .attr('stdDeviation', LINK_STYLING.blur.endpointBlur)

  // Foreground gradient (luminous) - increased opacity for visibility
  const fgGradient = defs.append('linearGradient')
    .attr('id', 'link-gradient-foreground')
    .attr('x1', '0%')
    .attr('y1', '0%')
    .attr('x2', '100%')
    .attr('y2', '0%')
  fgGradient.append('stop').attr('offset', '0%').attr('stop-color', '#FFFFFF').attr('stop-opacity', 0.2)
  fgGradient.append('stop').attr('offset', '40%').attr('stop-color', '#FFFFFF').attr('stop-opacity', 0.8)
  fgGradient.append('stop').attr('offset', '60%').attr('stop-color', '#FFFFFF').attr('stop-opacity', 0.8)
  fgGradient.append('stop').attr('offset', '100%').attr('stop-color', '#FFFFFF').attr('stop-opacity', 0.2)

  // Background gradient (atmospheric) - increased opacity for perceptibility
  const bgGradient = defs.append('linearGradient')
    .attr('id', 'link-gradient-background')
    .attr('x1', '0%')
    .attr('y1', '0%')
    .attr('x2', '100%')
    .attr('y2', '0%')
  bgGradient.append('stop').attr('offset', '0%').attr('stop-color', '#949B99').attr('stop-opacity', 0.2)
  bgGradient.append('stop').attr('offset', '48%').attr('stop-color', '#949B99').attr('stop-opacity', 0.08)
  bgGradient.append('stop').attr('offset', '99%').attr('stop-color', '#949B99').attr('stop-opacity', 0.2)

  // Dotted background pattern - Edit color at line 223
  const dotPattern = defs.append('pattern')
    .attr('id', 'dotted-background')
    .attr('x', 20)
    .attr('y', 20)
    .attr('width', 20)
    .attr('height', 20)
    .attr('patternUnits', 'userSpaceOnUse')
  dotPattern.append('circle')
    .attr('cx', 10)
    .attr('cy', 10)
    .attr('r', 1.5)
    .attr('fill', '#030504')
    .attr('opacity', 0.3)


    // Fixed background layer (not affected by zoom/pan transform)
    svg.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', dataWidth)
      .attr('height', dataHeight)
      .attr('fill', 'url(#dotted-background)')
      .style('pointer-events', 'none')
    g = svg.append('g')
      .attr('class', 'viewport')
      .style('pointer-events', 'auto')

  // Link layer groups (layered: background → foreground → endpoints)
  const linkGroup = g!.append('g').attr('class', 'links')
    .style('pointer-events', 'none')
  const linksBackgroundGroup = linkGroup.append('g').attr('class', 'links-background')
  const linksForegroundGroup = linkGroup.append('g').attr('class', 'links-foreground')
  const linkEndpointsGroup = linkGroup.append('g').attr('class', 'link-endpoints')

  const nodeGroup = g!.append('g').attr('class', 'nodes')
    .style('pointer-events', 'auto')
  labelGroup = g!.append('g').attr('class', 'labels')

  // Filter out entity nodes only - documents should be visible on canvas
  const visibleNodes = layoutNodes.value.filter((n: any) => n.kind !== 'entity')

  // Prepare links (only between visible nodes)
  const visibleNodeIds = new Set(visibleNodes.map((n: any) => n.id))
  const linkData = props.links
    .map(link => ({
      source: typeof link.source === 'string'
        ? layoutNodes.value.find(n => n.id === link.source)
        : link.source,
      target: typeof link.target === 'string'
        ? layoutNodes.value.find(n => n.id === link.target)
        : link.target,
      kind: link.kind,
    }))
    .filter(link => link.source && link.target && visibleNodeIds.has(link.source.id) && visibleNodeIds.has(link.target.id))

  // Draw background link lines (blurred atmospheric glow)
  linksBackground = linksBackgroundGroup
    .selectAll('line.link-line-background')
    .data(linkData, (d: any) => `${d.source?.id || ''}-${d.target?.id || ''}`)
    .enter()
    .append('line')
    .attr('class', 'link-line-background')
    .attr('stroke', 'url(#link-gradient-background)')
    .attr('stroke-width', (d: any) => getLinkStrokeWidth(d.kind, currentZoomScale) * 1.5) // Slightly wider for glow effect
    .attr('stroke-dasharray', (d: any) => d.kind === 'overlap' ? LINK_STYLING.strokeDasharray.overlap : LINK_STYLING.strokeDasharray.default)
    .attr('opacity', 0.25) // Increased from 0.3 (0.6*0.5) for better visibility
    .attr('filter', 'url(#link-background-blur)')
    .attr('x1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.x
    })
    .attr('y1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.y
    })
    .attr('x2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.x
    })
    .attr('y2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.y
    })

  // Draw foreground link lines (sharp luminous gradient)
  links = linksForegroundGroup
    .selectAll('line.link-line-foreground')
    .data(linkData, (d: any) => `${d.source?.id || ''}-${d.target?.id || ''}`)
    .enter()
    .append('line')
    .attr('class', 'link-line-foreground')
    .attr('stroke', 'url(#link-gradient-foreground)')
    .attr('stroke-width', (d: any) => getLinkStrokeWidth(d.kind, currentZoomScale))
    .attr('stroke-dasharray', (d: any) => d.kind === 'overlap' ? LINK_STYLING.strokeDasharray.overlap : LINK_STYLING.strokeDasharray.default)
    .attr('opacity', 0.9) // Increased from 0.6 for clear visibility; removed luminosity blend mode
    .attr('x1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.x
    })
    .attr('y1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.y
    })
    .attr('x2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.x
    })
    .attr('y2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.y
    })

  // Draw endpoint circles (1px white, blurred)
  // Store reference to linkData for use in tick handler
  const linkEndpointData = linkData.map((link: any) => ({
    source: link.source,
    target: link.target,
    kind: link.kind,
  }))
  linkEndpoints = linkEndpointsGroup
    .selectAll('circle.link-endpoint')
    .data(linkEndpointData.flatMap((link: any) => [
      { ...link, endpoint: 'source' },
      { ...link, endpoint: 'target' },
    ]), (d: any, i: number) => `${d.source?.id || ''}-${d.target?.id || ''}-${d.endpoint}`)
    .enter()
    .append('circle')
    .attr('class', 'link-endpoint')
    .attr('r', LINK_STYLING.endpoints.radius * getInverseZoomScale(currentZoomScale))
    .attr('fill', LINK_STYLING.endpoints.fill)
    .attr('opacity', LINK_STYLING.endpoints.opacity)
    .attr('filter', 'url(#link-endpoint-blur)')
    .attr('cx', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return d.endpoint === 'source' ? endpoints.source.x : endpoints.target.x
    })
    .attr('cy', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return d.endpoint === 'source' ? endpoints.source.y : endpoints.target.y
    })

  setupLinkInteraction(links, linksBackground, currentZoomScale)

  // Draw nodes (using graphTokens for sizing and styling)
  nodes = nodeGroup
    .selectAll('circle.node-circle')
    .data(visibleNodes, (d: any) => d.id)
    .enter()
    .append('circle')
    .attr('class', 'node-circle')
    .attr('cx', (d: any) => d.x || 0)
    .attr('cy', (d: any) => d.y || 0)
    // Single source of truth: same effective radius the link endpoint
    // geometry uses (includes the source nodes' 16px min screen diameter).
    .attr('r', (d: any) => getEffectiveNodeRadius(d, currentZoomScale))
    .attr('fill', (d: any) => {
      const style = NODE_STYLING[d.kind as keyof typeof NODE_STYLING]
      if (style?.fill === 'none') return 'none'
      if (style?.fill === 'theme') return nodeColor.value(d)
      return style?.fill || nodeColor.value(d)
    })
    .attr('stroke', (d: any) => {
      const style = NODE_STYLING[d.kind as keyof typeof NODE_STYLING]
      return style?.stroke || 'none'
    })
    .attr('stroke-width', (d: any) => getNodeStrokeWidth(d.kind, currentZoomScale))
    .attr('stroke-dasharray', (d: any) => {
      const style = NODE_STYLING[d.kind as keyof typeof NODE_STYLING]
      return style?.strokeDasharray || 'none'
    })
    .attr('filter', (d: any) => {
      if (d.kind === 'insight') return 'url(#insight-shadow)'
      return 'none'
    })
    .attr('opacity', 1)
    .style('pointer-events', 'auto')

  // Add icons to source and document nodes, centered on the node.
  // Both live in data space at their base token size so they scale naturally
  // with their node when zooming (no inverse-zoom compensation).
  const sourceIconDiameter = getSourceIconDiameter(currentZoomScale)
  const documentIconDiameter = getIconDiameter('document')
  nodes.each(function (this: any, nodeData: any) {
    const parentNode = this.parentNode as SVGElement | null
    if (!parentNode) return

    // Determine icon href based on node kind
    let iconHref: string | null = null
    if (nodeData.kind === 'source' && SOURCE_ICONS[nodeData.id]) {
      iconHref = SOURCE_ICONS[nodeData.id]
    } else if (nodeData.kind === 'document' && nodeData.sourceIcon) {
      iconHref = nodeData.sourceIcon
    }

    // Render icon (class + size differ by kind, see comment above)
    if (iconHref) {
      const isSource = nodeData.kind === 'source'
      const iconDiameter = isSource ? sourceIconDiameter : documentIconDiameter
      d3.select(parentNode as any)
        .insert('image', ':first-child')
        .datum(nodeData)
        .attr('class', isSource ? 'source-icon' : 'document-icon')
        .attr('x', (nodeData.x || 0) - iconDiameter / 2)
        .attr('y', (nodeData.y || 0) - iconDiameter / 2)
        .attr('width', iconDiameter)
        .attr('height', iconDiameter)
        .attr('href', iconHref)
        .attr('opacity', SOURCE_NODES.icon.opacity)
    }
  })

  // Add labels for source nodes (using graphTokens positioning and inverse zoom scaling)
  labelGroup
    .selectAll('text.source-label')
    .data(layoutNodes.value.filter((n: any) => n.kind === 'source'))
    .enter()
    .append('text')
    .attr('class', 'source-label')
    .attr('x', (d: any) => (d.x || 0) + TYPOGRAPHY.source.offsetX)
    .attr('y', (d: any) => (d.y || 0) + TYPOGRAPHY.source.offsetY)
    .attr('text-anchor', 'start')
    .attr('dominant-baseline', 'middle')
    .attr('font-family', TYPOGRAPHY.source.fontFamily)
    .attr('font-size', getScaledLabelFontSize('source', currentZoomScale))
    .attr('font-style', TYPOGRAPHY.source.fontStyle)
    .attr('font-weight', TYPOGRAPHY.source.fontWeight)
    .attr('fill', chartTheme.value.ink)
    .attr('opacity', TYPOGRAPHY.source.opacity)
    .style('line-height', `${TYPOGRAPHY.source.lineHeight}px`)
    // Text stroke for readability: outline effect
    .style('-webkit-text-stroke-color', (TYPOGRAPHY.source as any).textStroke)
    .style('-webkit-text-stroke-width', `${(TYPOGRAPHY.source as any).textStrokeWidth}px`)
    .text((d: any) => d.id)

  // Add labels for document nodes (positioned to the right, same as source)
  labelGroup
    .selectAll('text.document-label')
    .data(layoutNodes.value.filter((n: any) => n.kind === 'document'))
    .enter()
    .append('text')
    .attr('class', 'document-label')
    .attr('x', (d: any) => (d.x || 0) + TYPOGRAPHY.document.offsetX)
    .attr('y', (d: any) => (d.y || 0) + TYPOGRAPHY.document.offsetY)
    .attr('text-anchor', 'start')
    .attr('dominant-baseline', 'middle')
    .attr('font-family', TYPOGRAPHY.document.fontFamily)
    .attr('font-size', getScaledLabelFontSize('document', currentZoomScale))
    .attr('font-style', TYPOGRAPHY.document.fontStyle)
    .attr('font-weight', TYPOGRAPHY.document.fontWeight)
    .attr('fill', chartTheme.value.ink)
    .attr('opacity', TYPOGRAPHY.document.opacity)
    .style('line-height', `${TYPOGRAPHY.document.lineHeight}px`)
    // Text stroke for readability: outline effect (same as source)
    .style('-webkit-text-stroke-color', (TYPOGRAPHY.document as any).textStroke)
    .style('-webkit-text-stroke-width', `${(TYPOGRAPHY.document as any).textStrokeWidth}px`)
    .text((d: any) => d.label || d.id)

  // Keep endpoint dots in sync with the link highlight state: dots belonging to
  // unrelated/dimmed links are fully hidden while a node is hovered/selected,
  // and restored to their default appearance when the highlight clears.
  // Opacity only — link geometry and getConnectionEndpoints() are untouched.
  const applyEndpointSelection = (selectedNodes: Set<string>) => {
    svg.selectAll('circle.link-endpoint').attr('opacity', (d: any) => {
      if (selectedNodes.size === 0) return LINK_STYLING.endpoints.opacity
      return (selectedNodes.has(d.source.id) && selectedNodes.has(d.target.id))
        ? LINK_STYLING.endpoints.opacity
        : 0
    })
  }

  // Keep labels in sync with the same connected-node set the node/link/endpoint
  // highlight uses: the hovered node's and its direct neighbors' labels stay at
  // full emphasis, all others dim to the low-emphasis opacity the dimmed nodes
  // use (0.2, see applyNodeSelection). Opacity only — labels stay in the DOM,
  // so there is no layout shift; an empty set restores the normal opacities.
  const applyLabelSelection = (selectedNodes: Set<string>) => {
    const dimmed = 0.2
    svg.selectAll('text.source-label')
      .attr('opacity', (d: any) =>
        selectedNodes.size === 0 || selectedNodes.has(d.id) ? TYPOGRAPHY.source.opacity : dimmed)
    svg.selectAll('text.document-label')
      .attr('opacity', (d: any) =>
        selectedNodes.size === 0 || selectedNodes.has(d.id) ? TYPOGRAPHY.document.opacity : dimmed)
  }

  // Keep node icons in sync with the same connected-node set: icons inside the
  // hovered node and its direct neighbors stay fully visible, icons inside
  // unrelated (dimmed) nodes dim with their node instead of staying bright.
  // Icons are rendered as siblings of the node circles (not per-node groups),
  // so their opacity is synced per element like labels/endpoints. Covers every
  // Unstructured node icon (source + document images).
  const applyIconSelection = (selectedNodes: Set<string>) => {
    svg.selectAll('image.source-icon, image.document-icon')
      .attr('opacity', (d: any) =>
        selectedNodes.size === 0 || selectedNodes.has(d.id) ? SOURCE_NODES.icon.opacity : 0.2)
  }

  // Handle hover highlighting
  const handleNodeHover = (nodeId: string | null, allNodes: NetworkNode[], allLinks: any[]) => {
    if (nodeId) {
      const connected = highlightConnectedNodes(nodeId, allNodes, allLinks)
      applyNodeSelection(nodes, connected)
      applyLinkSelection(links, linksBackground, connected)
      applyEndpointSelection(connected)
      applyLabelSelection(connected)
      applyIconSelection(connected)
    } else {
      // Clear hover highlight, but keep click selection if active
      if (selectedCluster.value) {
        const connected = highlightConnectedNodes(selectedCluster.value, allNodes, allLinks)
        applyNodeSelection(nodes, connected)
        applyLinkSelection(links, linksBackground, connected)
        applyEndpointSelection(connected)
        applyLabelSelection(connected)
        applyIconSelection(connected)
      } else {
        const empty = new Set<string>()
        applyNodeSelection(nodes, empty)
        applyLinkSelection(links, linksBackground, empty)
        applyEndpointSelection(empty)
        applyLabelSelection(empty)
        applyIconSelection(empty)
      }
    }
  }

  setupNodeInteraction(
    nodes,
    (nodeId: string) => {
      selectedCluster.value = selectedCluster.value === nodeId ? null : nodeId
      emit('cluster-click', nodeId)

      // Update highlighted nodes
      if (selectedCluster.value) {
        const connected = highlightConnectedNodes(selectedCluster.value, layoutNodes.value, linkData)
        highlightedNodes.value = connected
        applyNodeSelection(nodes, connected)
        applyLinkSelection(links, linksBackground, connected)
        applyEndpointSelection(connected)
        applyLabelSelection(connected)
        applyIconSelection(connected)
      } else {
        highlightedNodes.value.clear()
        applyNodeSelection(nodes, highlightedNodes.value)
        applyLinkSelection(links, linksBackground, highlightedNodes.value)
        applyEndpointSelection(highlightedNodes.value)
        applyLabelSelection(highlightedNodes.value)
        applyIconSelection(highlightedNodes.value)
      }
    },
    handleNodeHover,
    layoutNodes.value,
    linkData,
  )

  // Setup force simulation for unstructured layout (only on visible nodes)
  if (props.layoutMode === 'unstructured') {
    // Filter props.links to only include visible nodes
    const visibleLinks = props.links.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id
      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)
    })
    simulation = createForceSimulation(visibleNodes, visibleLinks, {
      width: dataWidth,
      height: dataHeight,
    })

    // Apply drag behavior to nodes
    nodes.call(createDragBehavior(simulation))
    // Grabbing a node restarts the simulation — hand the camera to the user
    // so the settle-follow refit can't fight the drag.
    nodes.on('pointerdown.followfit', () => {
      followInitialFit = false
    })

    simulation.on('tick', () => {
      // === TEMPORARY DIAGNOSTIC: TICK MONITORING ===
      if (tickCount % 30 === 0) { // Log every 30th tick to avoid spam
        const g = svg.select('g.viewport')
        const linkGroup = g.select('g.links')
        const foregroundLinks = linkGroup.select('g.links-foreground').selectAll('line.link-line-foreground')
        const linksCount = foregroundLinks.size()
        if (linksCount > 0) {
          console.log(`[D3-TICK] Tick ${tickCount}: ${linksCount} foreground links in DOM`)
          // Sample first link
          let sampleLogged = false
          foregroundLinks.each(function (d: any, i: number) {
            if (sampleLogged) return
            sampleLogged = true
            const elem = d3.select(this)
            const x1 = elem.attr('x1')
            const y1 = elem.attr('y1')
            const x2 = elem.attr('x2')
            const y2 = elem.attr('y2')
            const sourceId = d.source?.id || 'unknown'
            const targetId = d.target?.id || 'unknown'
            console.log(`[D3-TICK] Sample link (${sourceId}→${targetId}): x1=${x1} y1=${y1} x2=${x2} y2=${y2}`)
          })
        } else {
          console.log(`[D3-TICK] Tick ${tickCount}: NO foreground links in DOM!`)
        }
      }
      tickCount++

      // IMPORTANT: Re-select all elements each tick to include newly added elements from Timeline filtering.
      // Don't use captured selections; dynamically query the DOM to ensure all elements are updated.
      const g = svg.select('g.viewport')
      const linkGroup = g.select('g.links')

      // Update foreground link positions (scale normally with zoom)
      linkGroup.select('g.links-foreground').selectAll('line.link-line-foreground')
        .attr('x1', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.source.x
        })
        .attr('y1', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.source.y
        })
        .attr('x2', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.target.x
        })
        .attr('y2', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.target.y
        })

      // Update background link positions
      linkGroup.select('g.links-background').selectAll('line.link-line-background')
        .attr('x1', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.source.x
        })
        .attr('y1', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.source.y
        })
        .attr('x2', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.target.x
        })
        .attr('y2', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return endpoints.target.y
        })

      // Update endpoint positions (always use current node coordinates, not static copies)
      linkGroup.select('g.link-endpoints').selectAll('circle.link-endpoint')
        .attr('cx', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return d.endpoint === 'source' ? endpoints.source.x : endpoints.target.x
        })
        .attr('cy', (d: any) => {
          const sourceRadius = getNodeRadiusFromData(d.source)
          const targetRadius = getNodeRadiusFromData(d.target)
          const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
          return d.endpoint === 'source' ? endpoints.source.y : endpoints.target.y
        })

      // Update node positions (scale normally with zoom)
      g.select('g.nodes').selectAll('circle.node-circle')
        .attr('cx', (d: any) => d.x || 0)
        .attr('cy', (d: any) => d.y || 0)

      // Update icon positions (both icon kinds at natural data-space size)
      const sourceIconHalf = getSourceIconDiameter(currentZoomScale) / 2
      svg.selectAll('image.source-icon')
        .attr('x', (d: any) => (d.x || 0) - sourceIconHalf)
        .attr('y', (d: any) => (d.y || 0) - sourceIconHalf)
      const documentIconHalf = getIconDiameter('document') / 2
      svg.selectAll('image.document-icon')
        .attr('x', (d: any) => (d.x || 0) - documentIconHalf)
        .attr('y', (d: any) => (d.y || 0) - documentIconHalf)

      // Update source labels with graphTokens positioning
      g.select('g.labels').selectAll('text.source-label')
        .attr('x', (d: any) => (d.x || 0) + TYPOGRAPHY.source.offsetX)
        .attr('y', (d: any) => (d.y || 0) + TYPOGRAPHY.source.offsetY)

      // Update document labels with graphTokens positioning
      g.select('g.labels').selectAll('text.document-label')
        .attr('x', (d: any) => (d.x || 0) + TYPOGRAPHY.document.offsetX)
        .attr('y', (d: any) => (d.y || 0) + TYPOGRAPHY.document.offsetY)

      // First-load framing: keep the whole graph in view while the layout
      // settles. Camera-only — node positions and physics are untouched. Stops
      // once the simulation has cooled (or on any user interaction, see the
      // zoom handler / applyZoomScale / updateVisualizationForFilter).
      if (followInitialFit && zoomBehaviorInstance) {
        if (simulation && simulation.alpha() < 0.05) {
          followInitialFit = false
        }
        svg.call(zoomBehaviorInstance.transform, computeInitialTransform())
      }
    })
  } else {
    // Static hierarchical layout
    nodes
      .attr('cx', (d: any) => d.x || 0)
      .attr('cy', (d: any) => d.y || 0)

    // Position foreground links
    links
      .attr('x1', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.source.x
      })
      .attr('y1', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.source.y
      })
      .attr('x2', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.target.x
      })
      .attr('y2', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.target.y
      })

    // Position background links
    linksBackground
      .attr('x1', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.source.x
      })
      .attr('y1', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.source.y
      })
      .attr('x2', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.target.x
      })
      .attr('y2', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return endpoints.target.y
      })

    // Position endpoint circles (use current node coordinates)
    linkEndpoints
      .attr('cx', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return d.endpoint === 'source' ? endpoints.source.x : endpoints.target.x
      })
      .attr('cy', (d: any) => {
        const sourceRadius = getNodeRadiusFromData(d.source)
        const targetRadius = getNodeRadiusFromData(d.target)
        const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
        return d.endpoint === 'source' ? endpoints.source.y : endpoints.target.y
      })

    // Position icons (both icon kinds at natural data-space size)
    const sourceIconHalf = getSourceIconDiameter(currentZoomScale) / 2
    svg.selectAll('image.source-icon')
      .attr('x', (d: any) => (d.x || 0) - sourceIconHalf)
      .attr('y', (d: any) => (d.y || 0) - sourceIconHalf)
    const documentIconHalf = getIconDiameter('document') / 2
    svg.selectAll('image.document-icon')
      .attr('x', (d: any) => (d.x || 0) - documentIconHalf)
      .attr('y', (d: any) => (d.y || 0) - documentIconHalf)

    // Position labels using graphTokens offsets
    labelGroup.selectAll('text.source-label')
      .attr('x', (d: any) => (d.x || 0) + TYPOGRAPHY.source.offsetX)
      .attr('y', (d: any) => (d.y || 0) + TYPOGRAPHY.source.offsetY)

    labelGroup.selectAll('text.document-label')
      .attr('x', (d: any) => (d.x || 0) + TYPOGRAPHY.document.offsetX)
      .attr('y', (d: any) => (d.y || 0) + TYPOGRAPHY.document.offsetY)
    }
  } // End of else (unstructured rendering)

  // Setup D3 zoom and pan — applies to both structured and unstructured modes
  zoomBehaviorInstance = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent(VIEWPORT.zoomExtent)
    .wheelDelta((event) => {
      // Invert scroll direction: up scrolls = zoom out, down scrolls = zoom in
      const deltaSensitivity = event.deltaMode === 1
        ? VIEWPORT.wheelDeltaSensitivity.line
        : event.deltaMode
          ? 1
          : VIEWPORT.wheelDeltaSensitivity.pixel
      return -event.deltaY * deltaSensitivity * VIEWPORT.wheelDeltaSensitivity.multiplier
    })
    .on('zoom', (event) => {
      console.log(`[D3 Zoom Event] scale=${event.transform.k}, tx=${event.transform.x}, ty=${event.transform.y}`)
      // A real user gesture (wheel/drag — sourceEvent present) takes over the
      // camera: stop the first-load settle-follow refit.
      if (event.sourceEvent) {
        followInitialFit = false
      }
      currentZoomTransform = event.transform
      currentZoomScale = event.transform.k // Track zoom scale for constant-screen rendering

      // Apply constant-screen rendering: update non-position attributes with inverse zoom scale (unstructured only)
      if (props.layoutMode === 'unstructured') {
        const inverseScale = getInverseZoomScale(currentZoomScale)

        // Update foreground link stroke widths
        links.attr('stroke-width', (d: any) => getLinkStrokeWidth(d.kind, currentZoomScale))

        // Update background link stroke widths (wider for glow effect)
        linksBackground.attr('stroke-width', (d: any) => getLinkStrokeWidth(d.kind, currentZoomScale) * 1.5)

        // Update endpoint circle radii
        linkEndpoints.attr('r', LINK_STYLING.endpoints.radius * inverseScale)

        // Update node stroke widths
        nodes.attr('stroke-width', (d: any) => getNodeStrokeWidth(d.kind, currentZoomScale))

        // Source circles + icons hold their 16px minimum on-screen diameter:
        // at normal zoom both keep their base size and scale naturally; when
        // zoomed out past the clamp they resize together, preserving
        // `icon + 2 × padding = node diameter`. Document icons stay untouched
        // (base size in data space, natural scaling).
        nodes.filter((d: any) => d.kind === 'source')
          .attr('r', getSourceNodeRadius(currentZoomScale))
        const srcIconDiam = getSourceIconDiameter(currentZoomScale)
        const srcIconHalf = srcIconDiam / 2
        svg.selectAll('image.source-icon')
          .attr('width', srcIconDiam)
          .attr('height', srcIconDiam)
          .attr('x', (d: any) => (d.x || 0) - srcIconHalf)
          .attr('y', (d: any) => (d.y || 0) - srcIconHalf)

        // Keep link geometry on the node boundary: the source nodes'
        // EFFECTIVE radius is zoom-dependent (16px minimum screen diameter),
        // so every endpoint touching a source moves when the zoom scale
        // changes. Same single source of truth as the circle radii above.
        // Re-query the DOM (like the tick handler) so links added by
        // timeline filtering are included.
        const endpointsFor = (d: any) => getConnectionEndpoints(
          d.source, d.target,
          getNodeRadiusFromData(d.source), getNodeRadiusFromData(d.target),
          undefined, currentZoomScale,
        )
        const viewportSel = svg.select('g.viewport')
        const setLineGeometry = (sel: any) => sel
          .attr('x1', (d: any) => endpointsFor(d).source.x)
          .attr('y1', (d: any) => endpointsFor(d).source.y)
          .attr('x2', (d: any) => endpointsFor(d).target.x)
          .attr('y2', (d: any) => endpointsFor(d).target.y)
        setLineGeometry(viewportSel.selectAll('line.link-line-foreground'))
        setLineGeometry(viewportSel.selectAll('line.link-line-background'))
        viewportSel.selectAll('circle.link-endpoint')
          .attr('cx', (d: any) => d.endpoint === 'source' ? endpointsFor(d).source.x : endpointsFor(d).target.x)
          .attr('cy', (d: any) => d.endpoint === 'source' ? endpointsFor(d).source.y : endpointsFor(d).target.y)

        // Update label font sizes (natural scaling with an 11px on-screen floor)
        labelGroup.selectAll('text.source-label')
          .attr('font-size', getScaledLabelFontSize('source', currentZoomScale))

        labelGroup.selectAll('text.document-label')
          .attr('font-size', getScaledLabelFontSize('document', currentZoomScale))

        // Re-setup link interaction with current zoom scale for hover effects
        setupLinkInteraction(links, linksBackground, currentZoomScale)
      }

      // Apply zoom transform to viewport (both structured and unstructured)
      if (g) {
        g.attr('transform', event.transform)
      }

      // Tell the parent whether the camera sits at the initial fit-to-view
      // framing (epsilon compare — +/- zoom pairs and Reset land back exactly)
      const initial = computeInitialTransform()
      emit('viewport-change',
        Math.abs(event.transform.k - initial.k) < 1e-3
        && Math.abs(event.transform.x - initial.x) < 0.5
        && Math.abs(event.transform.y - initial.y) < 0.5)
    })

  svg.call(zoomBehaviorInstance)

  // === TEMPORARY DIAGNOSTIC: INITIALIZATION STATE ===
  console.log(`[D3-INIT] Checking rendered links after initializeVisualization...`)
  const initLinksGroup = svg.select('g.viewport').select('g.links')
  const initForegroundLinks = initLinksGroup.select('g.links-foreground').selectAll('line.link-line-foreground')
  console.log(`[D3-INIT] Foreground links rendered: ${initForegroundLinks.size()}`)
  if (!initForegroundLinks.empty()) {
    let sampleCount = 0
    initForegroundLinks.each(function (d: any, i: number) {
      if (sampleCount >= 2) return
      sampleCount++
      const elem = d3.select(this)
      const x1 = elem.attr('x1')
      const y1 = elem.attr('y1')
      const x2 = elem.attr('x2')
      const y2 = elem.attr('y2')
      const stroke = elem.attr('stroke')
      const strokeWidth = elem.attr('stroke-width')
      const opacity = elem.attr('opacity')
      const filter = elem.attr('filter')
      const sourceId = d.source?.id
      const targetId = d.target?.id
      console.log(
        `[D3-INIT] Sample init link ${i}: ${sourceId}→${targetId}` +
        ` coords=(${x1},${y1})→(${x2},${y2})` +
        ` stroke=${stroke} width=${strokeWidth} opacity=${opacity} filter=${filter}`
      )
    })
  }

  // Apply zoom: either reset to fit viewport or restore previous transform
  if (resetZoom) {
    const transform = computeInitialTransform()
    console.log(`[D3] Applying RESET zoom: scale=${transform.k}, tx=${transform.x}, ty=${transform.y}`)
    currentZoomTransform = transform
    svg.call(zoomBehaviorInstance!.transform, transform)
    // Keep the whole graph framed while the force layout settles (unstructured only)
    followInitialFit = props.layoutMode === 'unstructured'
  } else if (currentZoomTransform) {
    // Restore previous zoom state
    console.log(`[D3] Restoring zoom transform: scale=${currentZoomTransform.k}, tx=${currentZoomTransform.x}, ty=${currentZoomTransform.y}`)
    svg.call(zoomBehaviorInstance!.transform, currentZoomTransform)
  } else {
    console.log(`[D3] WARNING: resetZoom=false but currentZoomTransform is null`)
  }
}

/**
 * Minimal update for Timeline filtering: preserve node positions, zoom, and simulation state.
 * Only add/remove nodes and links that changed; keep existing ones intact.
 */
function updateVisualizationForFilter(newNodes: NetworkNode[], newLinks: NetworkLink[]) {
  console.log(`[D3] updateVisualizationForFilter called: ${newNodes.length} nodes, ${newLinks.length} links`)
  if (!svgRef.value) return
  // Timeline filtering preserves the viewport — never let the settle-follow
  // refit fight the gentle simulation restart below.
  followInitialFit = false

  const svg = d3.select(svgRef.value)
  const newNodeIds = new Set(newNodes.map(n => n.id))
  const newLinkKey = (link: any) => `${link.source?.id || ''}-${link.target?.id || ''}`

  // Filter nodes: visible nodes exclude entities
  const visibleNodes = layoutNodes.value.filter((n: any) => n.kind !== 'entity' && newNodeIds.has(n.id))
  const visibleNodeIds = new Set(visibleNodes.map((n: any) => n.id))

  console.log(`[D3] Timeline filter: ${visibleNodes.length} visible nodes`)

  // Preserve existing links instead of reconstructing from newLinks
  // This keeps the already-resolved, already-valid link objects intact
  const linkGroup = svg.select('g.links')
  let linkData: any[] = []

  if (simulation && props.layoutMode === 'unstructured') {
    // Unstructured layout: get existing links from the force simulation
    const linkForce = simulation.force('link') as any
    const simulationLinks = linkForce?.links() || []
    console.log(`[D3] Existing simulation links: ${simulationLinks.length}`)

    // Filter to keep only links where both endpoints are still visible
    linkData = (simulationLinks as any[]).filter((link: any) => {
      const sourceId = (link.source as any).id
      const targetId = (link.target as any).id
      const isVisible = visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)
      if (!isVisible) {
        console.log(`[D3] Filtering out link ${sourceId}-${targetId} (endpoint not in visible set)`)
      }
      return isVisible
    })
    console.log(`[D3] Filtered simulation links: ${linkData.length}`)
  } else {
    // Structured layout: preserve existing D3-bound links by re-selecting them
    const existingForegroundLinks = linkGroup.select('g.links-foreground').selectAll('line.link-line-foreground').data() as any[]
    console.log(`[D3] Existing D3-bound links: ${existingForegroundLinks?.length || 0}`)

    linkData = (existingForegroundLinks || []).filter((link: any) => {
      const sourceId = (link.source as any).id
      const targetId = (link.target as any).id
      const isVisible = visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)
      if (!isVisible) {
        console.log(`[D3] Filtering out D3 link ${sourceId}-${targetId}`)
      }
      return isVisible
    })
    console.log(`[D3] Filtered D3-bound links: ${linkData.length}`)
  }

  // Update node selections
  const nodeGroup = svg.select('g.nodes')
  const nodes = nodeGroup.selectAll('circle.node-circle').data(visibleNodes, (d: any) => d.id)

  // Remove nodes that are no longer visible
  const nodeExitCount = nodes.exit().size()
  const nodeEnterCount = nodes.enter().size()
  nodes.exit().remove()

  // Add new nodes (those that became visible due to Timeline change)
  nodes.enter()
    .append('circle')
    .attr('class', 'node-circle')
    .attr('cx', (d: any) => d.x || 0)
    .attr('cy', (d: any) => d.y || 0)
    // Single source of truth: same effective radius the link endpoint
    // geometry uses (includes the source nodes' 16px min screen diameter).
    .attr('r', (d: any) => getEffectiveNodeRadius(d, currentZoomScale))
    .attr('fill', (d: any) => {
      const style = NODE_STYLING[d.kind as keyof typeof NODE_STYLING]
      if (style?.fill === 'none') return 'none'
      if (style?.fill === 'theme') return nodeColor.value(d)
      return style?.fill || nodeColor.value(d)
    })
    .attr('stroke', (d: any) => {
      const style = NODE_STYLING[d.kind as keyof typeof NODE_STYLING]
      return style?.stroke || 'none'
    })
    .attr('stroke-width', (d: any) => getNodeStrokeWidth(d.kind, currentZoomScale))
    .attr('stroke-dasharray', (d: any) => {
      const style = NODE_STYLING[d.kind as keyof typeof NODE_STYLING]
      return style?.strokeDasharray || 'none'
    })
    .attr('filter', (d: any) => {
      if (d.kind === 'insight') return 'url(#insight-shadow)'
      return 'none'
    })
    .attr('opacity', 1)
    .style('pointer-events', 'auto')

  // Update link selections
  const linksBackground = linkGroup.select('g.links-background').selectAll('line.link-line-background').data(linkData, (d: any) => newLinkKey(d))
  const linksForeground = linkGroup.select('g.links-foreground').selectAll('line.link-line-foreground').data(linkData, (d: any) => newLinkKey(d))
  const linkEndpointGroup = linkGroup.select('g.link-endpoints')
  const linkEndpointData = linkData.map((link: any) => ({
    source: link.source,
    target: link.target,
    kind: link.kind,
  }))
  const linkEndpoints = linkEndpointGroup.selectAll('circle.link-endpoint').data(
    linkEndpointData.flatMap((link: any) => [
      { ...link, endpoint: 'source' },
      { ...link, endpoint: 'target' },
    ]),
    (d: any, i: number) => `${d.source?.id || ''}-${d.target?.id || ''}-${d.endpoint}`
  )

  // Remove links that are no longer visible
  const linksBackgroundExitCount = linksBackground.exit().size()
  const linksForegroundExitCount = linksForeground.exit().size()
  const linkEndpointsExitCount = linkEndpoints.exit().size()
  console.log(`[D3-RENDER] D3 JOIN - Background exits: ${linksBackgroundExitCount}, Foreground exits: ${linksForegroundExitCount}, Endpoints exits: ${linkEndpointsExitCount}`)

  linksBackground.exit().remove()
  linksForeground.exit().remove()
  linkEndpoints.exit().remove()

  // Add new links (those that became visible)
  const linksBackgroundEnterCount = linksBackground.enter().size()
  const linksForegroundEnterCount = linksForeground.enter().size()
  const linkEndpointsEnterCount = linkEndpoints.enter().size()
  console.log(`[D3-RENDER] D3 JOIN - Background enters: ${linksBackgroundEnterCount}, Foreground enters: ${linksForegroundEnterCount}, Endpoints enters: ${linkEndpointsEnterCount}`)

  linksBackground.enter()
    .append('line')
    .attr('class', 'link-line-background')
    .attr('stroke', 'url(#link-gradient-background)')
    .attr('stroke-width', (d: any) => getLinkStrokeWidth(d.kind, currentZoomScale) * 1.5)
    .attr('stroke-dasharray', (d: any) => d.kind === 'overlap' ? LINK_STYLING.strokeDasharray.overlap : LINK_STYLING.strokeDasharray.default)
    .attr('opacity', 0.25)
    .attr('filter', 'url(#link-background-blur)')
    .attr('x1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.x
    })
    .attr('y1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.y
    })
    .attr('x2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.x
    })
    .attr('y2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.y
    })

  linksForeground.enter()
    .append('line')
    .attr('class', 'link-line-foreground')
    .attr('stroke', 'url(#link-gradient-foreground)')
    .attr('stroke-width', (d: any) => getLinkStrokeWidth(d.kind, currentZoomScale))
    .attr('stroke-dasharray', (d: any) => d.kind === 'overlap' ? LINK_STYLING.strokeDasharray.overlap : LINK_STYLING.strokeDasharray.default)
    .attr('opacity', 0.9)
    .attr('x1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.x
    })
    .attr('y1', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.source.y
    })
    .attr('x2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.x
    })
    .attr('y2', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return endpoints.target.y
    })

  linkEndpoints.enter()
    .append('circle')
    .attr('class', 'link-endpoint')
    .attr('r', LINK_STYLING.endpoints.radius * getInverseZoomScale(currentZoomScale))
    .attr('fill', LINK_STYLING.endpoints.fill)
    .attr('opacity', LINK_STYLING.endpoints.opacity)
    .attr('filter', 'url(#link-endpoint-blur)')
    .attr('cx', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return d.endpoint === 'source' ? endpoints.source.x : endpoints.target.x
    })
    .attr('cy', (d: any) => {
      const sourceRadius = getNodeRadiusFromData(d.source)
      const targetRadius = getNodeRadiusFromData(d.target)
      const endpoints = getConnectionEndpoints(d.source, d.target, sourceRadius, targetRadius, undefined, currentZoomScale)
      return d.endpoint === 'source' ? endpoints.source.y : endpoints.target.y
    })

  // === TEMPORARY DIAGNOSTIC: SVG LINK ATTRIBUTES ===
  console.log(`[D3-RENDER] DOM ELEMENTS AFTER JOIN:`)
  const allForegroundLinks = linkGroup.select('g.links-foreground').selectAll('line.link-line-foreground')
  console.log(`[D3-RENDER] Total foreground link elements in DOM: ${allForegroundLinks.size()}`)

  const allBackgroundLinks = linkGroup.select('g.links-background').selectAll('line.link-line-background')
  console.log(`[D3-RENDER] Total background link elements in DOM: ${allBackgroundLinks.size()}`)

  // Inspect 2-3 actual link elements
  let inspected = 0
  allForegroundLinks.each(function (d: any, i: number) {
    if (inspected >= 3) return
    inspected++

    const elem = d3.select(this)
    const x1 = elem.attr('x1')
    const y1 = elem.attr('y1')
    const x2 = elem.attr('x2')
    const y2 = elem.attr('y2')
    const stroke = elem.attr('stroke')
    const strokeWidth = elem.attr('stroke-width')
    const opacity = elem.attr('opacity')
    const display = elem.style('display')
    const visibility = elem.style('visibility')
    const pointerEvents = elem.style('pointer-events')

    const sourceId = d.source?.id || 'unknown'
    const targetId = d.target?.id || 'unknown'

    console.log(
      `[D3-RENDER] Link ${i} (${sourceId}→${targetId}):` +
      ` x1=${x1} y1=${y1} x2=${x2} y2=${y2}` +
      ` stroke=${stroke}` +
      ` stroke-width=${strokeWidth}` +
      ` opacity=${opacity}` +
      ` display=${display}` +
      ` visibility=${visibility}` +
      ` pointer-events=${pointerEvents}`
    )
  })

  // === TEMPORARY DIAGNOSTIC: LAYER STRUCTURE ===
  console.log(`[D3-RENDER] SVG LAYER STRUCTURE:`)
  const viewport = svg.select('g.viewport')
  console.log(`[D3-RENDER] Viewport group exists: ${!viewport.empty()}`)
  console.log(`[D3-RENDER] Viewport display: ${viewport.style('display')}`)
  console.log(`[D3-RENDER] Viewport visibility: ${viewport.style('visibility')}`)
  console.log(`[D3-RENDER] Viewport pointer-events: ${viewport.style('pointer-events')}`)

  const linksGroupLayer = svg.select('g.viewport').select('g.links')
  console.log(`[D3-RENDER] Links group exists: ${!linksGroupLayer.empty()}`)
  console.log(`[D3-RENDER] Links display: ${linksGroupLayer.style('display')}`)
  console.log(`[D3-RENDER] Links visibility: ${linksGroupLayer.style('visibility')}`)
  console.log(`[D3-RENDER] Links pointer-events: ${linksGroupLayer.style('pointer-events')}`)

  const bgLinkGroup = linksGroupLayer.select('g.links-background')
  console.log(`[D3-RENDER] Background links group exists: ${!bgLinkGroup.empty()}`)
  console.log(`[D3-RENDER] Background links display: ${bgLinkGroup.style('display')}`)

  const fgLinkGroup = linksGroupLayer.select('g.links-foreground')
  console.log(`[D3-RENDER] Foreground links group exists: ${!fgLinkGroup.empty()}`)
  console.log(`[D3-RENDER] Foreground links display: ${fgLinkGroup.style('display')}`)

  // Update label selections
  const labelGroup = svg.select('g.labels')
  const sourceLabels = labelGroup.selectAll('text.source-label').data(visibleNodes.filter((n: any) => n.kind === 'source'), (d: any) => d.id)
  const documentLabels = labelGroup.selectAll('text.document-label').data(visibleNodes.filter((n: any) => n.kind === 'document'), (d: any) => d.id)

  // Remove labels for nodes that are no longer visible
  sourceLabels.exit().remove()
  documentLabels.exit().remove()

  // Add labels for new nodes
  sourceLabels.enter()
    .append('text')
    .attr('class', 'source-label')
    .attr('text-anchor', 'start')
    .attr('dominant-baseline', 'middle')
    .attr('font-family', TYPOGRAPHY.source.fontFamily)
    .attr('font-size', getScaledLabelFontSize('source', currentZoomScale))
    .attr('font-style', TYPOGRAPHY.source.fontStyle)
    .attr('font-weight', TYPOGRAPHY.source.fontWeight)
    .attr('fill', chartTheme.value.ink)
    .attr('opacity', TYPOGRAPHY.source.opacity)
    .style('line-height', `${TYPOGRAPHY.source.lineHeight}px`)
    .style('-webkit-text-stroke-color', (TYPOGRAPHY.source as any).textStroke)
    .style('-webkit-text-stroke-width', `${(TYPOGRAPHY.source as any).textStrokeWidth}px`)
    .text((d: any) => d.id)

  documentLabels.enter()
    .append('text')
    .attr('class', 'document-label')
    .attr('text-anchor', 'start')
    .attr('dominant-baseline', 'middle')
    .attr('font-family', TYPOGRAPHY.document.fontFamily)
    .attr('font-size', getScaledLabelFontSize('document', currentZoomScale))
    .attr('font-style', TYPOGRAPHY.document.fontStyle)
    .attr('font-weight', TYPOGRAPHY.document.fontWeight)
    .attr('fill', chartTheme.value.ink)
    .attr('opacity', TYPOGRAPHY.document.opacity)
    .style('line-height', `${TYPOGRAPHY.document.lineHeight}px`)
    .style('-webkit-text-stroke-color', (TYPOGRAPHY.document as any).textStroke)
    .style('-webkit-text-stroke-width', `${(TYPOGRAPHY.document as any).textStrokeWidth}px`)
    .text((d: any) => d.label || d.id)

  // Add icons to newly visible nodes (both kinds at natural data-space size)
  const sourceIconDiameter = getSourceIconDiameter(currentZoomScale)
  const documentIconDiameter = getIconDiameter('document')
  svg.selectAll('image.source-icon, image.document-icon').data(visibleNodes.filter((n: any) => n.kind === 'source' || n.kind === 'document'), (d: any) => d.id)
    .exit().remove()

  nodes.each(function (nodeData: any) {
    const parentNode = (this as any).parentNode as SVGElement | null
    if (!parentNode) return
    const existingIcon = d3.select(parentNode as any).select('image.source-icon, image.document-icon')
    if (existingIcon.empty()) {
      // Only add if it doesn't exist
      let iconHref: string | null = null
      if (nodeData.kind === 'source' && SOURCE_ICONS[nodeData.id]) {
        iconHref = SOURCE_ICONS[nodeData.id]
      } else if (nodeData.kind === 'document' && nodeData.sourceIcon) {
        iconHref = nodeData.sourceIcon
      }

      if (iconHref) {
        const isSource = nodeData.kind === 'source'
        const iconDiameter = isSource ? sourceIconDiameter : documentIconDiameter
        d3.select(parentNode as any)
          .insert('image', ':first-child')
          .datum(nodeData)
          .attr('class', isSource ? 'source-icon' : 'document-icon')
          .attr('x', (nodeData.x || 0) - iconDiameter / 2)
          .attr('y', (nodeData.y || 0) - iconDiameter / 2)
          .attr('width', iconDiameter)
          .attr('height', iconDiameter)
          .attr('href', iconHref)
          .attr('opacity', SOURCE_NODES.icon.opacity)
      }
    }
  })

  // === TEMPORARY DIAGNOSTIC: COMPARE WITH INITIALIZATION ===
  console.log(`[D3-COMPARE] Finding first link in DOM to compare initialization vs timeline filter...`)
  const sampleLinkForeground = linkGroup.select('g.links-foreground').selectAll('line.link-line-foreground')
  if (!sampleLinkForeground.empty()) {
    sampleLinkForeground.each(function (d: any, i: number) {
      if (i !== 0) return // Only first link
      const elem = d3.select(this)
      const x1 = elem.attr('x1')
      const y1 = elem.attr('y1')
      const x2 = elem.attr('x2')
      const y2 = elem.attr('y2')
      const stroke = elem.attr('stroke')
      const strokeWidth = elem.attr('stroke-width')
      const opacity = elem.attr('opacity')
      const sourceId = d.source?.id
      const targetId = d.target?.id
      console.log(
        `[D3-COMPARE] Timeline filter state: ${sourceId}→${targetId}` +
        ` coords=(${x1},${y1})→(${x2},${y2})` +
        ` stroke=${stroke} width=${strokeWidth} opacity=${opacity}`
      )
    })
  } else {
    console.log(`[D3-COMPARE] NO LINKS FOUND IN FOREGROUND!`)
  }

  // Update simulation links if simulation is running (for unstructured layout).
  // Only reheat when the visible set actually changed, and only gently (0.1):
  // a filter that adds/removes nothing must not restart the simulation, and an
  // incremental change should integrate new nodes without noticeably moving
  // the existing, already-settled ones.
  if (simulation && props.layoutMode === 'unstructured') {
    const visibleSetChanged = nodeEnterCount > 0 || nodeExitCount > 0
      || linksForegroundEnterCount > 0 || linksForegroundExitCount > 0
    console.log(`[D3] Updating simulation with ${linkData.length} links and ${visibleNodes.length} nodes (setChanged=${visibleSetChanged})`)
    if (visibleSetChanged) {
      simulation.nodes(visibleNodes)
      // Pass linkData which has stable node object references (not stale IDs)
      const linkForce = simulation.force('link') as any
      linkForce?.links(linkData)
      simulation.alpha(0.1).restart() // Gentle restart with low alpha to let it settle
    }
  }

  console.log(`[D3] updateVisualizationForFilter complete`)
}

onMounted(() => {
  console.log(`[D3] onMounted: calling initializeVisualization(true)`)
  // First mount: initialize with zoom reset
  initializeVisualization(true)
  isFirstInitialization = false
  console.log(`[D3] onMounted: set isFirstInitialization = false`)
})

watch(() => [props.nodes, props.links, props.layoutMode, props.zoom], (newVal, oldVal) => {
  const [nodes, links, layoutMode] = newVal as [NetworkNode[], NetworkLink[], string, number]
  console.log(`[D3] Watch triggered: nodes=${nodes.length}, links=${links.length}, layoutMode=${layoutMode}, oldLayoutMode=${oldVal?.[2]}`)
  if (simulation) {
    simulation.stop()
  }

  // Detect what changed
  const layoutModeChanged = oldVal && newVal[2] !== oldVal[2]
  const newNodeIds = new Set(nodes.map(n => n.id))
  const intersection = new Set([...newNodeIds].filter(id => previousNodeIds.has(id)))
  const prevSize = previousNodeIds.size
  const newSize = newNodeIds.size

  // Check if this is a Timeline filter: nodes overlap significantly and size change is moderate
  // (not a complete dataset replacement)
  const hasSignificantOverlap = intersection.size > Math.max(prevSize, newSize) * 0.5 // At least 50% overlap
  const isModerateChange = Math.abs(newSize - prevSize) <= Math.max(prevSize * 0.7, 10) // Size change ≤ 70% or ≤ 10 nodes
  const isTimelineFilter = !isFirstInitialization &&
    oldVal &&
    !layoutModeChanged &&
    prevSize > 0 &&
    hasSignificantOverlap &&
    isModerateChange &&
    newSize !== prevSize

  console.log(`[D3] Watch analysis: layoutModeChanged=${layoutModeChanged}, isTimelineFilter=${isTimelineFilter}, previousSize=${previousNodeIds.size}, newSize=${newNodeIds.size}`)

  // Update tracked state
  previousNodeIds = newNodeIds

  if (layoutModeChanged) {
    // Layout mode change: full re-render with zoom reset
    console.log(`[D3] Layout mode changed → full reinitialization with zoom reset`)
    initializeVisualization(true)
  } else if (isTimelineFilter) {
    // Timeline filter: minimal update, preserve zoom and positions
    console.log(`[D3] Timeline filter detected → minimal update, preserving zoom and positions`)
    updateVisualizationForFilter(nodes, links)
  } else if (oldVal && Array.isArray(oldVal[0]) && (oldVal[0] as any).length === 0 && nodes.length > 0) {
    // Transitioning from empty to populated (initial load)
    console.log(`[D3] Transitioning from empty to populated → full reinitialization`)
    initializeVisualization(false)
  } else {
    // Genuine data change: reinitialize
    console.log(`[D3] Data genuinely changed → full reinitialization`)
    initializeVisualization(false)
  }
})

onBeforeUnmount(() => {
  if (props.layoutMode === 'structured') {
    cleanupStructured()
  }
  if (simulation) {
    simulation.stop()
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
})

function applyZoomScale(factor: number) {
  if (!svgRef.value || !zoomBehaviorInstance) return
  followInitialFit = false // Explicit zoom takes over the camera
  const svg = d3.select(svgRef.value)
  svg.call(zoomBehaviorInstance.scaleBy, factor)
}

/**
 * Reset the camera to the exact initial-entry framing: the same fit-to-view
 * transform (scale + centered translate) computeInitialTransform() produces on
 * first load. Viewport-only: does not touch the simulation, node positions, or data.
 */
function resetView() {
  if (!svgRef.value || !zoomBehaviorInstance) return
  followInitialFit = false
  const svg = d3.select(svgRef.value)
  svg.call(zoomBehaviorInstance.transform, computeInitialTransform())
}

defineExpose({
  applyZoomScale,
  resetView,
})
</script>

<template>
  <div ref="container" class="network-graph-d3">
    <svg ref="svg" class="network-graph-d3__canvas" />
  </div>
</template>

<style scoped>
.network-graph-d3 {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.network-graph-d3__canvas {
  width: 100%;
  height: 100%;
  background: transparent;
  pointer-events: auto;
  cursor: grab;
}

.network-graph-d3__canvas:active {
  cursor: grabbing;
}

:deep(circle) {
  transition: r 0.2s ease, opacity 0.2s ease;
  cursor: pointer;
}

:deep(line) {
  transition: stroke-width 0.2s ease, opacity 0.2s ease;
}

:deep(circle.node-circle:hover) {
  filter: brightness(1.2);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
}

:deep(circle[filter="url(#insight-shadow)"]) {
  transition: filter 0.2s ease;
}

:deep(circle[filter="url(#insight-shadow)"]:hover) {
  filter: drop-shadow(0 0 8px #7C6749) !important;
}

:deep(text.source-label) {
  letter-spacing: 0.3px;
  pointer-events: none;
}

:deep(line:hover) {
  opacity: 0.9 !important;
  stroke-width: 2 !important;
}
</style>
