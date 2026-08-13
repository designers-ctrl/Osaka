/**
 * src/components/graphs/useD3Force.ts
 *
 * Force-directed graph simulation using D3.
 * All physics parameters sourced from graphTokens.ts - no hardcoded values.
 *
 * CRITICAL RULE: Clusters belong to Sources.
 * Source→Cluster links (kind='overlap') use stronger forces to keep clusters bound to their source.
 * Clusters form a neighborhood around their source and must never be pulled away.
 */

import * as d3 from 'd3'
import type { NetworkNode, NetworkLink } from '@/components/charts'
import { FORCE_SIMULATION, getNodeDiameter } from './graphTokens'

export interface ForceSimulationConfig {
  width: number
  height: number
  nodeStrength?: number
  linkStrength?: number
  chargeStrength?: number
}

export function useD3Force() {
  function createForceSimulation(
    nodes: NetworkNode[],
    links: NetworkLink[],
    config: ForceSimulationConfig,
  ) {
    const {
      width,
      height,
      nodeStrength = FORCE_SIMULATION.nodeStrength,
      linkStrength = FORCE_SIMULATION.linkStrength,
      chargeStrength = FORCE_SIMULATION.chargeStrength,
    } = config

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id((d: any) => d.id)
        // Use different link strength based on link kind
        // Cluster-Source bonds (kind='overlap') are much stronger to keep clusters orbiting their source
        .strength((link: any) => {
          if (link.kind === 'overlap') {
            // Source→Cluster bonds: strong to keep clusters close
            return FORCE_SIMULATION.clusterBondStrength
          }
          // Default influence links: weaker
          return linkStrength
        })
        // Use different link distance based on link kind
        .distance((link: any) => {
          if (link.kind === 'overlap') {
            // Source→Cluster bonds: shorter distance to maintain tight neighborhood
            return FORCE_SIMULATION.clusterBondDistance
          }
          // Default: regular distance
          return FORCE_SIMULATION.linkDistance
        }),
      )
      .force('charge', d3.forceManyBody()
        .strength(chargeStrength)
        .distanceMax(FORCE_SIMULATION.chargeDistanceMax),
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide()
        .radius((d: any) => {
          // Use graphTokens for collision radius based on node type
          return getNodeDiameter(d.kind) / 2 + 10
        }),
      )

    return simulation
  }

  function updatePositions(
    selection: d3.Selection<any, any, any, any>,
    width: number,
    height: number,
  ) {
    selection.each((d: any) => {
      d.x = Math.max(0, Math.min(d.x || 0, width))
      d.y = Math.max(0, Math.min(d.y || 0, height))
    })
  }

  return { createForceSimulation, updatePositions }
}
