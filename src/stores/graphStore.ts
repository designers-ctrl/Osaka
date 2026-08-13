/**
 * src/stores/graphStore.ts
 *
 * Pinia store for graph visualization state.
 * Single source of truth for:
 * - Graph data (nodes, edges)
 * - UI selections (selected node, cluster, hover)
 * - View state (layout mode, zoom, pan)
 * - Filters and search
 *
 * PHILOSOPHY:
 * - This store owns ALL interaction state
 * - D3 receives state as props, never modifies it
 * - Components dispatch actions to change state
 * - Computed properties derive secondary state
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { NetworkNode, NetworkLink } from '@/components/charts'
import {
  buildAdjacencyMap,
  getConnectedNodeIds,
  getReachableNodeIds,
  getClusterEntities,
  getConnectedInsights,
  getNodeSource,
  searchNodesByLabel,
  filterNodesByTimeRange,
} from '@/engines/graph/queries'

export const useGraphStore = defineStore('graph', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // GRAPH DATA
  // ──────────────────────────────────────────────────────────────────────────

  const nodes = ref<NetworkNode[]>([])
  const links = ref<NetworkLink[]>([])

  // Memoized for efficient queries
  const adjacencyMap = computed(() => buildAdjacencyMap(nodes.value, links.value))

  // ──────────────────────────────────────────────────────────────────────────
  // UI SELECTION STATE
  // ──────────────────────────────────────────────────────────────────────────

  const selectedNodeId = ref<string | null>(null)
  const selectedClusterId = ref<string | null>(null)
  const hoveredNodeId = ref<string | null>(null)

  const expandedClusters = ref<Set<string>>(new Set())

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW STATE
  // ──────────────────────────────────────────────────────────────────────────

  const layoutMode = ref<'force' | 'hierarchy' | 'radial' | 'focused'>('force')
  const zoom = ref(1)
  const pan = ref({x: 0, y: 0})

  // ──────────────────────────────────────────────────────────────────────────
  // FILTERS & SEARCH
  // ──────────────────────────────────────────────────────────────────────────

  const searchQuery = ref('')
  const activeFilters = ref<string[]>([])
  const timeRangeFilter = ref({start: 0, end: 7})

  // ──────────────────────────────────────────────────────────────────────────
  // COMPUTED STATE (DERIVED)
  // ──────────────────────────────────────────────────────────────────────────

  const selectedNode = computed(() =>
    selectedNodeId.value ? nodes.value.find(n => n.id === selectedNodeId.value) : null,
  )

  const selectedCluster = computed(() =>
    selectedClusterId.value ? nodes.value.find(n => n.id === selectedClusterId.value) : null,
  )

  const hoveredNode = computed(() =>
    hoveredNodeId.value ? nodes.value.find(n => n.id === hoveredNodeId.value) : null,
  )

  /**
   * All nodes connected (directly) to the selected node.
   */
  const connectedToSelected = computed(() => {
    if (!selectedNodeId.value) return new Set<string>()
    return new Set(getConnectedNodeIds(selectedNodeId.value, adjacencyMap.value))
  })

  /**
   * All nodes reachable within 2 hops of the selected node.
   */
  const influenceOfSelected = computed(() => {
    if (!selectedNodeId.value) return new Set<string>()
    return getReachableNodeIds(selectedNodeId.value, adjacencyMap.value, 2)
  })

  /**
   * All entities within the selected cluster.
   */
  const selectedClusterEntities = computed(() => {
    if (!selectedClusterId.value) return []
    return getClusterEntities(selectedClusterId.value, nodes.value, links.value)
  })

  /**
   * Insights connected to the selected node.
   */
  const selectedNodeInsights = computed(() => {
    if (!selectedNodeId.value) return []
    return getConnectedInsights(selectedNodeId.value, nodes.value, links.value)
  })

  /**
   * Nodes matching the search query.
   */
  const searchResults = computed(() => {
    if (!searchQuery.value) return []
    return searchNodesByLabel(nodes.value, searchQuery.value)
  })

  /**
   * Nodes visible based on time range filter.
   */
  const visibleNodes = computed(() =>
    filterNodesByTimeRange(
      nodes.value,
      timeRangeFilter.value.start,
      timeRangeFilter.value.end,
    ),
  )

  /**
   * Nodes to show/hide based on current selection and filters.
   * Used by D3 to determine opacity/visibility.
   */
  const nodesToHighlight = computed(() => {
    if (selectedNodeId.value) {
      return new Set([selectedNodeId.value, ...connectedToSelected.value])
    }
    if (selectedClusterId.value) {
      return new Set([
        selectedClusterId.value,
        ...selectedClusterEntities.value.map(e => e.id),
      ])
    }
    return new Set<string>()
  })

  // ──────────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Select a node (or deselect if already selected).
   */
  function selectNode(id: string | null) {
    selectedNodeId.value = id
    // Deselect cluster when selecting node
    selectedClusterId.value = null
  }

  /**
   * Select a cluster (or deselect if already selected).
   */
  function selectCluster(id: string | null) {
    selectedClusterId.value = id
    // Deselect node when selecting cluster
    selectedNodeId.value = null
  }

  /**
   * Hover over a node (for highlight effects).
   */
  function hoverNode(id: string | null) {
    hoveredNodeId.value = id
  }

  /**
   * Toggle cluster expansion (show/hide entities).
   */
  function toggleExpandCluster(id: string) {
    if (expandedClusters.value.has(id)) {
      expandedClusters.value.delete(id)
    } else {
      expandedClusters.value.add(id)
    }
  }

  /**
   * Change the layout algorithm.
   */
  function setLayoutMode(mode: 'force' | 'hierarchy' | 'radial' | 'focused') {
    layoutMode.value = mode
  }

  /**
   * Update zoom level.
   */
  function setZoom(level: number) {
    zoom.value = Math.max(0.1, Math.min(4, level))
  }

  /**
   * Update pan position.
   */
  function setPan(x: number, y: number) {
    pan.value = {x, y}
  }

  /**
   * Update search query.
   */
  function search(query: string) {
    searchQuery.value = query
  }

  /**
   * Toggle a filter.
   */
  function toggleFilter(filterId: string) {
    const idx = activeFilters.value.indexOf(filterId)
    if (idx >= 0) {
      activeFilters.value.splice(idx, 1)
    } else {
      activeFilters.value.push(filterId)
    }
  }

  /**
   * Set time range filter.
   */
  function setTimeRange(start: number, end: number) {
    timeRangeFilter.value = {start, end}
  }

  /**
   * Clear all selections.
   */
  function clearSelection() {
    selectedNodeId.value = null
    selectedClusterId.value = null
    hoveredNodeId.value = null
  }

  /**
   * Clear all filters.
   */
  function clearFilters() {
    activeFilters.value = []
    searchQuery.value = ''
  }

  /**
   * Load graph data.
   */
  function loadGraph(newNodes: NetworkNode[], newLinks: NetworkLink[]) {
    nodes.value = newNodes
    links.value = newLinks
    clearSelection()
  }

  // ──────────────────────────────────────────────────────────────────────────
  // AUTO-CLEAR HOVER ON SELECTION
  // ──────────────────────────────────────────────────────────────────────────

  watch(selectedNodeId, () => {
    hoveredNodeId.value = null
  })

  return {
    // State
    nodes,
    links,
    selectedNodeId,
    selectedClusterId,
    hoveredNodeId,
    expandedClusters,
    layoutMode,
    zoom,
    pan,
    searchQuery,
    activeFilters,
    timeRangeFilter,

    // Computed
    selectedNode,
    selectedCluster,
    hoveredNode,
    connectedToSelected,
    influenceOfSelected,
    selectedClusterEntities,
    selectedNodeInsights,
    searchResults,
    visibleNodes,
    nodesToHighlight,

    // Actions
    selectNode,
    selectCluster,
    hoverNode,
    toggleExpandCluster,
    setLayoutMode,
    setZoom,
    setPan,
    search,
    toggleFilter,
    setTimeRange,
    clearSelection,
    clearFilters,
    loadGraph,
  }
})
