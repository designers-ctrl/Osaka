<!--
  src/components/charts/BarChart.vue

  A themed bar chart — magnitude across categories. Rounded 4px data-end,
  recessive grid, per-bar hover tooltip, entrance animation — all from the DS.

  Single series → azure bars, no legend.
  Stacked       → pass `series`; segments stack with a validated categorical color
                  each, a surface-colored gap between them, and a legend.
  `glass`       → opt-in BACKDROP styling for single-series bars: translucent
                  neutral fill (ink at low alpha, same language as the canvas
                  time-rail histogram) with a lighter top-edge glint, for bars
                  that sit BEHIND a foreground mark instead of being the
                  subject. Colors still derive from the live theme ink — no
                  hardcoded hex — so it follows theme changes like every mark.

  Dataset-driven: holds no numbers; renders the rows it's handed.
-->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { baseChartOption, categoryAxis, pivot, valueAxis, withAlpha } from './baseOption'
import { useChartTheme } from './useChartTheme'

const props = withDefaults(defineProps<{
  /** The rows to plot (any array of row objects; seed from a typed src/data dataset). */
  data: readonly unknown[]
  /** Row key for the category axis. */
  x: string
  /** Row key for the measured value. */
  y: string
  /** Optional row key that stacks the bars into colored segments. */
  series?: string
  /** Backdrop styling: translucent glassy neutral bars (single-series only). */
  glass?: boolean
  xLabel?: string
  yLabel?: string
  title: string
  height?: number
}>(), {
  glass: false,
  height: 260,
})

const th = useChartTheme()

const option = computed<EChartsOption>(() => {
  const t = th.value
  const single = !props.series
  const pv = pivot(props.data, props.x, props.y, props.series)
  const r = t.marks.barCornerRadius

  /*
   * Glass backdrop bars — a CUSTOM series so each bar is two shapes:
   *
   *   1. the body: translucent ink gradient (the grid stays visible through
   *      it) with a hairline border and a soft frost shadow. A real CSS
   *      backdrop-blur is impossible here — ECharts paints one canvas, so no
   *      shape can blur pixels behind it; the milky fill + shadow is the
   *      closest canvas-native frosted read.
   *   2. the highlight strip: a fixed 3px cap spanning the FULL bar width,
   *      softly glowing — the glass glint on the top edge.
   *
   * Geometry mirrors the normal bar series (60% of the category band, capped
   * at 36px, top corners rounded by the DS barCornerRadius), so switching a
   * chart to `glass` moves no bars. All colors derive from the live theme ink.
   */
  const glassBarWidth = (band: number) => Math.min(band * 0.6, 36)
  const glassRenderItem = (_params: unknown, api: any) => {
    const i = api.value(0) as number
    const v = api.value(1) as number
    const [cx, top] = api.coord([i, v])
    const [, baseline] = api.coord([i, 0])
    const w = glassBarWidth(api.size([1, 0])[0] as number)
    const h = Math.max(0, baseline - top)
    return {
      type: 'group' as const,
      children: [
        { // body — ink fade, 20% at the top → 0% at the base, 2px top corners.
          // t.ink is on-surface (#FFF in dark), so this IS the spec's
          // rgba(255,255,255,0→.20) while staying theme-derived.
          type: 'rect' as const,
          shape: { x: cx - w / 2, y: top, width: w, height: h, r: [2, 2, 0, 0] },
          style: {
            fill: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(t.ink, 0.2) },
                { offset: 1, color: withAlpha(t.ink, 0) },
              ],
            },
          },
        },
      ],
    }
  }

  return {
    ...baseChartOption(t),
    legend: { ...(baseChartOption(t).legend as object), show: !single },
    tooltip: { ...(baseChartOption(t).tooltip as object), trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { ...categoryAxis(t, props.xLabel, true), data: pv.categories },
    // glass: no horizontal value gridlines — only the x-axis baseline remains
    // (categoryAxis keeps its axisLine), so the backdrop bars sit on a clean
    // field. Labels and scale are untouched.
    yAxis: props.glass && single
      ? { ...valueAxis(t, props.yLabel), splitLine: { show: false } }
      : valueAxis(t, props.yLabel),
    series: single && props.glass
      // glass backdrop: one custom series drawing body + top strip per bar
      ? [{
          name: pv.series[0]?.name,
          type: 'custom',
          renderItem: glassRenderItem,
          data: pv.series[0]?.values.map((v, i) => [i, v]) ?? [],
          encode: { x: 0, y: 1 },
        }]
      : pv.series.map(s => ({
          name: s.name,
          type: 'bar',
          data: s.values,
          barMaxWidth: 36,
          ...(single ? {} : { stack: 'total' }),
          itemStyle: single
            // single: round the top (data-end) only
            ? { borderRadius: [r, r, 0, 0] }
            // stacked: a 2px surface-colored border fakes the gap between segments
            : { borderColor: t.surface, borderWidth: t.marks.surfaceGap, borderRadius: [r, r, r, r] },
          emphasis: { focus: 'series' },
        })),
  } as EChartsOption
})
</script>

<template>
  <BaseChart :option="option" :height="height" :title="title" />
</template>
