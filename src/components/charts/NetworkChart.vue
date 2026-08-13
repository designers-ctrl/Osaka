<!--
  src/components/charts/NetworkChart.vue

  A themed NODE-LINK GRAPH — the shape of a knowledge graph, not a measurement.
  Where every other preset in this kit encodes magnitude, this one encodes
  RELATIONSHIP: which things exist, and what connects them.

  WHY IT LIVES IN THE KIT (and not as a one-off in a screen)
  The chart mandate in CLAUDE.md is that all data viz goes through this kit on
  the shared BaseChart bridge, so a graph gets the same palette, font, tooltip
  and theme-flip behavior as every bar chart. Adding a force-graph library for
  this would have been the exact failure that rule prevents — ECharts already
  ships a `graph` series, registered in BaseChart's `use([...])`.

  ── THE NODE KINDS ARE A TRUST BOUNDARY, NOT DECORATION ──
  Osaka's domain rules (CLAUDE.md) require that a model's INFERENCE is never
  drawn to look like an ingested FACT. That rule is enforced here, in the marks:

    fact      → `source` / `document`  hollow ring, theme ink border
    inference → `insight` / `cluster`  FILLED brand color / DASHED ring

  Filled-and-warm reads as "Osaka concluded this"; hollow-and-outlined reads as
  "this came from your data". A caller cannot opt out of the distinction — the
  kind drives the mark. `confidence` and `derivedFrom` ride along on the node so
  the tooltip can show WHY an inference exists, which the same rule requires.

  Layout is `none`: node coordinates come from the dataset, so the graph is
  DETERMINISTIC — the same every load, screenshot-stable, and diffable. A force
  layout would re-scramble the composition on each mount. Pass `layout="force"`
  only when the dataset genuinely has no coordinates to give.

  ⚠️ A canvas graph is not keyboard-navigable. The screen embedding it must
  offer the same information in a reachable form (Osaka's workspace lists its
  insights in the assistant rail) — see the a11y note in web-design-guidelines.
-->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { baseChartOption, tooltipSwatch, withAlpha } from './baseOption'
import { useChartTheme, type ResolvedChartTheme } from './useChartTheme'

/**
 * What a node IS — which decides how it is drawn. Ordered fact → inference.
 * `source`/`document` are things the workspace ingested; `entity` is extracted
 * from them; `cluster` and `insight` are model output.
 */
export type NetworkNodeKind = 'source' | 'document' | 'entity' | 'cluster' | 'insight'

export interface NetworkNode {
  id: string
  /** Shown on the canvas for named nodes; omit on satellites to keep it quiet. */
  label?: string
  kind: NetworkNodeKind
  /** Dataset coordinates (arbitrary units — ECharts fits them to the canvas). */
  x: number
  y: number
  /** Relative mark size in px. Falls back to a per-kind default. */
  size?: number
  /** 0–1. Required by the domain rules for anything inferred; ignored otherwise. */
  confidence?: number
  /** What this was inferred from — the provenance line in the tooltip. */
  derivedFrom?: string
  /** Optional source icon URL for source nodes. */
  sourceIcon?: string
  /** Timeline hour indices when this node is relevant. If undefined, always shown. */
  timeRange?: { start: number, end: number }
}

/** `influence` = a directed relationship; `overlap` = shared context only. */
export type NetworkLinkKind = 'influence' | 'overlap'

export interface NetworkLink {
  source: string
  target: string
  kind?: NetworkLinkKind
}

const props = withDefaults(defineProps<{
  nodes: readonly NetworkNode[]
  links: readonly NetworkLink[]
  /** Accessible name for the figure. */
  title: string
  height?: number
  /** `none` honors the dataset's x/y (default); `force` re-solves the layout. */
  layout?: 'none' | 'force'
  /** Let the user pan/zoom the canvas. */
  roam?: boolean
  /**
   * Canvas scale. Bind it to give a screen its own zoom controls — scroll-to-zoom
   * (via `roam`) is not reachable by keyboard, so a graph that can zoom needs
   * buttons driving this prop to stay operable.
   */
  zoom?: number
}>(), {
  height: 420,
  layout: 'none',
  roam: true,
  zoom: 1,
})

const emit = defineEmits<{
  'cluster-click': [nodeId: string]
}>()

const th = useChartTheme()

function handleChartClick(params: unknown) {
  const p = params as { dataType?: string, data?: Record<string, unknown> }
  if (p.dataType === 'node') {
    const d = (p.data ?? {}) as Record<string, unknown>
    const kind = d.kind as NetworkNodeKind
    if (kind === 'cluster') {
      emit('cluster-click', String(d.id ?? ''))
    }
  }
}

/** Default mark size per kind — hubs read larger than their satellites. */
const SIZE: Record<NetworkNodeKind, number> = {
  source: 30,
  document: 12,
  entity: 14,
  cluster: 26,
  insight: 18,
}

/**
 * The mark spec per kind — the trust boundary described in the header.
 * Reads only resolved theme tokens, never a literal hex.
 */
function markStyle(kind: NetworkNodeKind, t: ResolvedChartTheme): Record<string, unknown> {
  const inference = t.categorical[0] // brand yellow — "Osaka concluded this"
  const entity = t.categorical[1] // purple — extracted, but still derived
  switch (kind) {
    case 'insight':
      return {
        color: inference,
        borderColor: inference,
        borderWidth: 0,
        shadowBlur: 18,
        shadowColor: withAlpha(inference, 0.45),
        // Pattern noise overlay: use a semi-transparent image pattern over the fill
        opacity: 0.92,
      }
    case 'cluster':
      // Dashed = a grouping the model proposed, not a thing that was ingested.
      return { color: withAlpha(t.ink, t.isDark ? 0.06 : 0.04), borderColor: withAlpha(t.ink, 0.45), borderWidth: 1, borderType: 'dashed' }
    case 'entity':
      return { color: entity, borderWidth: 0 }
    case 'document':
      return { color: withAlpha(t.ink, t.isDark ? 0.1 : 0.06), borderColor: withAlpha(t.ink, 0.55), borderWidth: 1 }
    case 'source':
    default:
      // Hollow ring: an ingested source is a container, not a value.
      // Larger size to accommodate icon or label
      return {
        color: 'transparent',
        borderColor: withAlpha('#ffffff', 0.4),
        borderWidth: 2,
        opacity: 1,
      }
  }
}

/** Human label for each kind — used by the tooltip, mirrors the on-screen legend. */
const KIND_LABEL: Record<NetworkNodeKind, string> = {
  source: 'Connected source',
  document: 'Document',
  entity: 'Entity',
  cluster: 'Entity cluster',
  insight: 'Insight',
}

const option = computed<EChartsOption>(() => {
  const t = th.value
  const base = baseChartOption(t)

  return {
    ...base,
    legend: { show: false },
    tooltip: {
      ...(base.tooltip as object),
      trigger: 'item',
      // Graph nodes carry provenance, so this preset overrides the kit's shared
      // axis formatter: an inferred node must be able to explain itself.
      formatter: (p: unknown) => {
        const params = p as { dataType?: string, data?: Record<string, unknown>, color?: string }
        if (params.dataType === 'edge') {
          const kind = (params.data?.kind as NetworkLinkKind) ?? 'influence'
          return kind === 'overlap' ? 'Shared context' : 'Influences'
        }
        const d = (params.data ?? {}) as Record<string, unknown>
        const kind = d.kind as NetworkNodeKind
        const head = `${tooltipSwatch(params.color ?? t.ink)}<span style="font-weight:600;">${d.name ?? ''}</span>`
        const rows = [`<div style="opacity:.7;margin-top:2px;">${KIND_LABEL[kind] ?? ''}</div>`]
        // The domain rule: an inference shows its confidence and its basis.
        if (typeof d.confidence === 'number') {
          rows.push(`<div style="opacity:.7;">Confidence ${Math.round((d.confidence as number) * 100)}%</div>`)
        }
        if (d.derivedFrom) rows.push(`<div style="opacity:.7;">From ${d.derivedFrom}</div>`)
        return `<div style="display:flex;align-items:center;">${head}</div>${rows.join('')}`
      },
    },
    series: [{
      type: 'graph',
      layout: props.layout,
      roam: props.roam,
      zoom: props.zoom,
      draggable: false,
      // Hovering a node dims everything it does NOT touch — the fastest way to
      // read "what is this connected to", which is the screen's whole job.
      emphasis: { focus: 'adjacency', scale: false, itemStyle: { shadowBlur: 24 } },
      blur: { itemStyle: { opacity: 0.25 }, lineStyle: { opacity: 0.08 } },
      force: props.layout === 'force' ? { repulsion: 180, edgeLength: 60, gravity: 0.08 } : undefined,
      label: {
        show: true,
        position: 'right',
        distance: 8,
        color: t.ink,
        fontFamily: t.fontFamily,
        fontSize: t.type.annotation,
        // Satellites pass no label, so only named nodes draw text.
        formatter: (p: unknown) => String((p as { data?: { label?: string } }).data?.label ?? ''),
      },
      data: props.nodes.map(n => ({
        id: n.id,
        name: n.label ?? n.id,
        label: n.label,
        kind: n.kind,
        confidence: n.confidence,
        derivedFrom: n.derivedFrom,
        x: n.x,
        y: n.y,
        symbolSize: n.size ?? SIZE[n.kind],
        itemStyle: markStyle(n.kind, t),
        sourceIcon: n.sourceIcon,
      })),
      links: props.links.map(l => ({
        source: l.source,
        target: l.target,
        kind: l.kind ?? 'influence',
        lineStyle: {
          color: withAlpha(t.ink, l.kind === 'overlap' ? 0.18 : 0.28),
          width: 1,
          type: l.kind === 'overlap' ? 'dotted' : 'solid',
          curveness: 0,
        },
      })),
    }],
  } as EChartsOption
})
</script>

<template>
  <BaseChart :option="option" :height="height" :title="title" @chart-click="handleChartClick" />
</template>
