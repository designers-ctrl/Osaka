/**
 * src/components/graphs/structured/components/renderClusterRing.ts
 *
 * Renders the Cluster ring: uniform-size clusters with source icons and arc-based category labels.
 *
 * Key points:
 * - All clusters have UNIFORM diameter (40px), regardless of entity count/weight in data
 * - Each cluster contains its associated Source icon (Slack, Gmail, LinkedIn, etc.)
 * - Source icons are centered inside the cluster circle (reusing existing icon assets)
 * - Arc-based labels curve along the ring circumference (Step 7)
 * - Hemisphere-aware text rotation: right side reads left-to-right, left side reads mirrored
 * - Positioned by useD3Hierarchy on the 400px ring
 *
 * Data mapping:
 * - Source icon association: derived from cluster id prefix (e.g., "Slack" from "Slack-s0")
 * - Icon href: looked up from SOURCE_ICONS using the extracted source id
 * - Icon size: 40x40px (matching cluster diameter) from SOURCE_NODES.icon token
 * - Icon opacity: 0.95 from SOURCE_NODES.icon.opacity
 * - Category label: from cluster.category field (deterministic mock, seeded by cluster ID)
 */

import * as d3 from 'd3'
import {
  CLUSTER_RING,
  getStructuredNodeRadius,
} from '../structuredTokens'
import { SOURCE_NODES } from '@/components/graphs/graphTokens'
import { SOURCE_ICONS } from '@/data/graphWorkspace'
import type { PositionedNode } from '../useStructuredRenderer'
import type { NetworkLink } from '@/components/charts'

interface ClusterRingConfig {
  centerX: number
  centerY: number
  zoom: number
  chartTheme?: any
}

export function renderClusterRing(
  viewportGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  clusterNodes: PositionedNode[],
  _links: NetworkLink[],
  _config: ClusterRingConfig = { centerX: 0, centerY: 0, zoom: 1 },
) {
  if (!clusterNodes.length) return

  const nodeRadius = CLUSTER_RING.nodeRadius
  const chartTheme = _config.chartTheme
  // Scale icons to 90% of circle diameter for visual safety
  // Prevents SVG viewBox padding/margins from causing overflow
  // (source icons are 40x40px; render at 36px with 2px padding on each side)
  const iconScale = 0.9
  const iconSize = SOURCE_NODES.icon.width * iconScale
  const iconHalfSize = iconSize / 2

  // ── CREATE CLUSTER RING GROUP ──────────────────────────────────────────────

  const clusterRing = viewportGroup
    .append('g')
    .attr('class', 'structured-cluster-ring')

  // ── RENDER EACH CLUSTER NODE ──────────────────────────────────────────────

  // Render cluster circles with hover highlighting
  clusterRing
    .selectAll('circle.cluster-node')
    .data(clusterNodes)
    .join('circle')
    .attr('class', 'cluster-node')
    .attr('cx', (d) => d.x || 0)
    .attr('cy', (d) => d.y || 0)
    .attr('r', nodeRadius)
    .attr('fill', CLUSTER_RING.fill)
    .attr('stroke', CLUSTER_RING.stroke)
    .attr('stroke-width', CLUSTER_RING.strokeWidth)
    .attr('stroke-dasharray', CLUSTER_RING.strokeDasharray)
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

  // Render cluster icons (source icons inside each cluster circle)
  clusterNodes.forEach((node) => {
    // ── SOURCE ICON (inside cluster circle) ────────────────────────────────

    // Extract source id from cluster id (e.g., "Slack" from "Slack-s0")
    const sourceId = node.id.split('-')[0]
    const iconHref = SOURCE_ICONS[sourceId as keyof typeof SOURCE_ICONS]

    if (iconHref) {
      clusterRing
        .append('image')
        .attr('class', 'cluster-source-icon')
        .attr('x', (node.x || 0) - iconHalfSize)
        .attr('y', (node.y || 0) - iconHalfSize)
        .attr('width', iconSize)
        .attr('height', iconSize)
        .attr('href', iconHref)
        .attr('opacity', SOURCE_NODES.icon.opacity)
    }
  })

  // ── RENDER RADIAL LABELS (Step 7) ─────────────────────────────────────────────
  // Radial orientation (text points outward along node's angle, like spokes).
  // Reference: Observable D3 hierarchical-edge-bundling, adapted to our angle convention.
  // Our angle convention: θ=0°→East, θ=90°→South, θ=180°→West, θ=270°→North
  // (already matches SVG's default, so NO -90° offset correction needed)

  const labelRadius = 420 // Position labels just outside the 400px cluster ring
  const labelFontSize = 9
  const labelFontFamily = 'Inter, sans-serif'

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

  // Create text elements inside groups
  labelGroups
    .selectAll('text')
    .data((d) => [d])
    .join('text')
    .attr('class', 'cluster-label')
    .attr('dy', '0.31em') // Vertical centering trick from reference
    .attr('x', (d) => {
      // Small offset from node edge: +6 right hemisphere, -6 left hemisphere
      const angle = d.angle || 0
      const angleDeg = (angle * 180) / Math.PI
      const normalizedAngle = angleDeg < 0 ? angleDeg + 360 : angleDeg
      return normalizedAngle > 90 && normalizedAngle < 270 ? -6 : 6
    })
    .attr('text-anchor', (d) => {
      // Right hemisphere: start (text extends right from x)
      // Left hemisphere: end (text extends left from x, anchored at node edge)
      const angle = d.angle || 0
      const angleDeg = (angle * 180) / Math.PI
      const normalizedAngle = angleDeg < 0 ? angleDeg + 360 : angleDeg
      return normalizedAngle > 90 && normalizedAngle < 270 ? 'end' : 'start'
    })
    .attr('transform', (d) => {
      // Left hemisphere only: additional 180° rotation so text doesn't appear upside-down
      const angle = d.angle || 0
      const angleDeg = (angle * 180) / Math.PI
      const normalizedAngle = angleDeg < 0 ? angleDeg + 360 : angleDeg
      return normalizedAngle > 90 && normalizedAngle < 270 ? 'rotate(180)' : null
    })
    .attr('font-size', labelFontSize)
    .attr('font-family', labelFontFamily)
    .attr('font-weight', 500)
    .attr('fill', 'rgba(255, 255, 255, 0.85)')
    .attr('opacity', 0.85)
    .text((d) => (d as any).category || 'Cluster')
}
