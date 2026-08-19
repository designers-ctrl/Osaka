<!--
  src/components/charts/BaseChart.vue

  THE BRIDGE between ECharts and Vue — built once, then never touched by a
  designer again. The preset charts (LineChart, BarChart, AreaChart) build a
  fully-themed ECharts `option` and hand it here; this component:

    1. Registers the ECharts modules the kit uses (tree-shaken — only what we
       need is bundled), so `vue-echarts` can render.
    2. Renders responsively (`autoresize`) inside a sized box.
    3. Re-renders on theme flip. Because the preset's `option` is reactive to
       useChartTheme, a light↔dark switch rebuilds the option and we pass
       `{ notMerge: true }` so no stale styling lingers.

  All look (colors, fonts, gridlines, tooltip, animation) is baked into `option`
  via baseChartOption — this file owns none of it.
-->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { use } from 'echarts/core'
import {
  BarChart,
  // CustomChart powers BarChart.vue's `glass` variant (renderItem bars with a
  // top highlight strip) — keep it registered or glass bars silently vanish.
  CustomChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
} from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
// ECharts 6 moved `grid.containLabel` behind an opt-in feature. baseOption.ts
// sets containLabel on every cartesian chart, so without this the grid ignores
// it and axis labels are CLIPPED at the plot edge (silently — it only logs a
// console notice). Registered here with the modules for the same reason.
import { LegacyGridContainLabel } from 'echarts/features'
// SVG, not canvas. Canvas rasterizes axis labels into the bitmap at a fixed
// device-pixel ratio, so they read as slightly soft "images" next to the DOM
// text around them and degrade further under browser/OS zoom. The SVG renderer
// emits real <text> nodes: crisp at any zoom, and selectable/inspectable. Our
// charts are small (tens of marks), which is where SVG is the better trade —
// switch a specific chart back to canvas only if one ever plots thousands of
// points or animates a force layout.
import { SVGRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

// Register once, at module load. Tree-shaken: only these charts/components ship.
use([
  SVGRenderer,
  // cartesian
  LineChart,
  BarChart,
  CustomChart,
  ScatterChart,
  HeatmapChart,
  // non-cartesian
  PieChart,
  GaugeChart,
  RadarChart,
  GraphChart,
  // components
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  LegacyGridContainLabel,
])

withDefaults(defineProps<{
  /** A fully-themed ECharts option, built by the preset chart. */
  option: EChartsOption
  /** Chart height in px (width is responsive). */
  height?: number
  /** Accessible name for the figure — feeds ECharts' aria description too. */
  title: string
}>(), {
  height: 260,
})

defineEmits<{
  'chart-click': [params: Record<string, unknown>]
}>()
</script>

<template>
  <v-chart
    class="cly-chart"
    role="img"
    :aria-label="title"
    :option="option"
    :init-options="{ renderer: 'svg' }"
    :update-options="{ notMerge: true }"
    :style="{ height: `${height}px` }"
    autoresize
    @click="(params: unknown) => $emit('chart-click', params as Record<string, unknown>)"
  />
</template>

<style scoped>
.cly-chart {
  width: 100%;
}
</style>
