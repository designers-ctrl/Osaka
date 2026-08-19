<!--
  src/components/charts/LineChart.vue

  A themed line/trend chart — change over time. A designer passes typed
  data and the key names; the house look (colors, 2px marks, recessive grid,
  hover tooltip, legend, entrance animation) is baked in via baseChartOption.

  Single series → one azure line, no legend (the title names it).
  Multi series  → one validated categorical color per series + a legend.

  Dataset-driven: holds NO figures — renders whatever rows it's handed (seed them
  from a typed dataset in src/data/, per the house rules).
-->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { baseChartOption, categoryAxis, pivot, valueAxis } from './baseOption'
import { useChartTheme } from './useChartTheme'

const props = withDefaults(defineProps<{
  /** The rows to plot (any array of row objects; seed from a typed src/data dataset). */
  data: readonly unknown[]
  /** Row key for the horizontal axis (time/category). */
  x: string
  /** Row key for the vertical axis (the measured value). */
  y: string
  /** Optional row key that splits the data into colored series. */
  series?: string
  /** Axis titles. */
  xLabel?: string
  yLabel?: string
  /** Accessible + on-figure name for the chart. */
  title: string
  height?: number
  /**
   * Draw a circular mark on every data point. Off by default — the preset's
   * resting look is a clean line whose symbol appears on hover — so turn it on
   * for sparse series where each reading is itself the point.
   */
  showPoints?: boolean
  /** Print each value above its point. Implies `showPoints` visually. */
  showValues?: boolean
  /** Vertical gridlines under the category axis, to match the horizontal ones. */
  verticalGrid?: boolean
}>(), {
  height: 260,
  showPoints: false,
  showValues: false,
  verticalGrid: false,
})

const th = useChartTheme()

const option = computed<EChartsOption>(() => {
  const t = th.value
  const single = !props.series
  const pv = pivot(props.data, props.x, props.y, props.series)

  return {
    ...baseChartOption(t),
    legend: { ...(baseChartOption(t).legend as object), show: !single },
    xAxis: {
      ...categoryAxis(t, props.xLabel, false),
      data: pv.categories,
      // Same recessive treatment the value axis already uses for its gridlines,
      // so a two-way grid reads as one grid rather than two weights.
      splitLine: { show: props.verticalGrid, lineStyle: { color: t.grid, width: 1 } },
    },
    yAxis: valueAxis(t, props.yLabel),
    series: pv.series.map(s => ({
      name: s.name,
      type: 'line',
      data: s.values,
      smooth: true,
      showSymbol: props.showPoints || props.showValues,
      symbol: 'circle',
      symbolSize: t.marks.markerRadius * 2,
      lineStyle: { width: t.marks.lineWidth },
      // The value sits above its own point, in the chart's own label ink and
      // type scale — never a hardcoded size or colour.
      label: {
        show: props.showValues,
        position: 'top',
        color: t.ink,
        fontFamily: t.fontFamily,
        fontSize: t.type.tickLabel,
      },
      emphasis: { focus: 'series' },
      connectNulls: false,
    })),
  } as EChartsOption
})
</script>

<template>
  <BaseChart :option="option" :height="height" :title="title" />
</template>
