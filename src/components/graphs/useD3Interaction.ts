/**
 * src/components/graphs/useD3Interaction.ts
 *
 * Interactive behaviors for the graph: selecting clusters,
 * highlighting connected nodes, and navigation.
 * All animation durations sourced from graphTokens.ts - no hardcoded values.
 */

import * as d3 from 'd3'
import type { NetworkNode } from '@/components/charts'
import { ANIMATIONS, LINK_STYLING, getLinkStrokeWidth } from './graphTokens'

export interface InteractionState {
  selectedCluster: string | null
  highlightedNodes: Set<string>
}

export function useD3Interaction() {
  function setupNodeInteraction(
    nodeSelection: d3.Selection<any, any, any, any>,
    onClusterClick: (nodeId: string) => void,
    onNodeHover?: (nodeId: string | null, nodes: any[], links: any[]) => void,
    allNodes?: NetworkNode[],
    allLinks?: any[],
  ) {
    nodeSelection
      .on('click', function (this: any, event: MouseEvent, d: any) {
        event.stopPropagation()
        if (d.kind === 'cluster' || d.kind === 'source') {
          onClusterClick(d.id)
        }
      })
      .on('mouseenter', function (this: any, event: MouseEvent, d: any) {
        // Highlight on hover - brighten without resizing
        d3.select(this)
          .transition()
          .duration(ANIMATIONS.nodeHoverBrighten)
          .attr('filter', 'brightness(1.15)')

        // Highlight connected nodes
        if (onNodeHover && allNodes && allLinks) {
          onNodeHover(d.id, allNodes, allLinks)
        }
      })
      .on('mouseleave', function (this: any) {
        // Remove highlight
        d3.select(this)
          .transition()
          .duration(ANIMATIONS.nodeHoverBrighten)
          .attr('filter', 'none')

        // Clear highlight
        if (onNodeHover) {
          onNodeHover(null, allNodes || [], allLinks || [])
        }
      })

    nodeSelection.style('cursor', (d: any) => {
      if (d.kind === 'cluster' || d.kind === 'source') return 'pointer'
      return 'default'
    })
  }

  function setupLinkInteraction(
    linkSelection: d3.Selection<any, any, any, any>,
    backgroundLinks: d3.Selection<any, any, any, any>,
    currentZoomScale: number = 1,
  ) {
    linkSelection
      .on('mouseenter', function (this: any) {
        d3.select(this)
          .transition()
          .duration(ANIMATIONS.linkHover)
          .attr('stroke-width', (d: any) => getLinkStrokeWidth(d.kind, currentZoomScale) * 1.3)
          .attr('opacity', LINK_STYLING.opacity.hover)
      })
      .on('mouseleave', function (this: any, d: any) {
        d3.select(this)
          .transition()
          .duration(ANIMATIONS.linkHover)
          .attr('stroke-width', (d: any) => getLinkStrokeWidth(d.kind, currentZoomScale))
          .attr('opacity', LINK_STYLING.opacity.base)
      })
  }

  function highlightConnectedNodes(
    nodeId: string,
    nodes: NetworkNode[],
    links: any[],
  ): Set<string> {
    // Only highlight direct connections (one hop), not recursive traversal
    const connected = new Set<string>([nodeId])

    links.forEach(link => {
      if (link.source.id === nodeId) {
        connected.add(link.target.id)
      }
      if (link.target.id === nodeId) {
        connected.add(link.source.id)
      }
    })

    return connected
  }

  function applyNodeSelection(
    nodeSelection: d3.Selection<any, any, any, any>,
    selectedNodes: Set<string>,
  ) {
    nodeSelection.attr('opacity', (d: any) => {
      if (selectedNodes.size === 0) return 1
      return selectedNodes.has(d.id) ? 1 : 0.2
    })
  }

  function applyLinkSelection(
    linkSelection: d3.Selection<any, any, any, any>,
    backgroundLinks: d3.Selection<any, any, any, any>,
    selectedNodes: Set<string>,
  ) {
    linkSelection.attr('opacity', (d: any) => {
      if (selectedNodes.size === 0) return LINK_STYLING.opacity.base
      return (selectedNodes.has(d.source.id) && selectedNodes.has(d.target.id)) ? LINK_STYLING.opacity.hover : LINK_STYLING.opacity.hidden
    })
  }

  return {
    setupNodeInteraction,
    setupLinkInteraction,
    highlightConnectedNodes,
    applyNodeSelection,
    applyLinkSelection,
  }
}
