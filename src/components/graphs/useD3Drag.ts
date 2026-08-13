/**
 * src/components/graphs/useD3Drag.ts
 *
 * Drag behavior for interactive node positioning in force-directed simulation.
 * Allows users to manually reposition nodes while respecting physics constraints.
 */

import * as d3 from 'd3'
import type { NetworkNode } from '@/components/charts'

export function useD3Drag() {
  function createDragBehavior(simulation: d3.Simulation<NetworkNode, any> | null) {
    if (!simulation) return d3.drag<any, any>();

    return d3.drag<any, any>()
      .on('start', function (event: any, d: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', function (event: any, d: any) {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', function (event: any, d: any) {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })
  }

  return { createDragBehavior }
}
