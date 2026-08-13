/**
 * src/engines/layout/types.ts
 *
 * Type definitions for the layout engine.
 */

import type { NetworkNode, NetworkLink } from '@/components/charts'

/**
 * Input to any layout algorithm.
 */
export interface LayoutInput {
  nodes: NetworkNode[]
  edges: NetworkLink[]
  width?: number
  height?: number
  constraints?: LayoutConstraints
}

/**
 * Optional constraints that can guide layout.
 */
export interface LayoutConstraints {
  // Nodes that should stay at fixed positions
  fixed?: Map<string, {x: number, y: number}>
  // Nodes that should be grouped together
  groups?: Map<string, string[]>
  // Minimum distance between nodes
  minDistance?: number
  // Maximum area nodes should occupy
  bounds?: {width: number, height: number}
}

/**
 * Output from a layout algorithm.
 * Includes positioned nodes and metadata about the layout quality.
 */
export interface LayoutResult {
  // Nodes with computed {x, y} positions
  nodes: Array<NetworkNode & {x: number, y: number}>

  // Edges (reference to original, with resolved source/target objects)
  edges: Array<NetworkLink & {
    source: NetworkNode & {x: number, y: number}
    target: NetworkNode & {x: number, y: number}
  }>

  // Metadata about the layout
  metadata: {
    algorithm: LayoutAlgorithm
    iterations: number
    converged: boolean
    error?: number // For iterative algorithms, final error value
    duration: number // Time in ms
  }
}

/**
 * Supported layout algorithms.
 */
export type LayoutAlgorithm = 'force' | 'hierarchy' | 'radial' | 'focused' | 'structured'

/**
 * Algorithm-specific configuration.
 */
export interface ForceLayoutConfig {
  strength?: number // Repulsion strength
  distance?: number // Link distance
  gravity?: number // Gravity toward center
  iterations?: number // Max iterations
}

export interface HierarchyLayoutConfig {
  direction?: 'down' | 'right' // Layer direction
  levelHeight?: number // Vertical spacing between levels
  nodeWidth?: number // Width of each node (for spacing)
}

export interface RadialLayoutConfig {
  rootNodeId: string // Center node
  radiusPerLevel?: number // Distance between levels
}

export interface FocusedLayoutConfig {
  focusNodeId: string // Central focus node
  maxDepth?: number // How many hops to include
}

/**
 * Generic layout function type.
 * Any algorithm must accept LayoutInput and return LayoutResult.
 */
export type LayoutAlgorithmFn = (input: LayoutInput) => LayoutResult
