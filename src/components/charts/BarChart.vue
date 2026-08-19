<!--
  src/components/charts/BarChart.vue

  A themed bar chart — magnitude across categories. Rounded 4px data-end,
  recessive grid, per-bar hover tooltip, entrance animation — all from the DS.

  Single series → azure bars, no legend.
  Stacked       → pass `series`; segments stack with a validated categorical color
                  each, a surface-colored gap between them, and a legend.
  `trend`       → a step line over the bar tops, for the reading the bars are a
                  backdrop for. Measured values only: this line is not a
                  forecast, and nothing here styles one — an inferred series
                  would need its own distinguishable ink and a provenance line
                  beside the chart (see the domain rules in CLAUDE.md).
  `yTicks`      → exactly how many value labels the axis carries.
  `pattern`     → an image tiled behind the plot area (the marks' rectangle),
                  riding the grid's own background so it never spills into the
                  axis gutters.
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
  /**
   * Exactly how many labels the value axis carries, zero included (`4` → 0 / 4
   * / 8 / 12). ECharts' own `splitNumber` is only a hint — it re-rounds to
   * whatever interval it likes — so the interval and the axis max are computed
   * here instead. Left unset, ECharts picks the count from the plot height,
   * which over-labels a short chart.
   */
  yTicks?: number
  /**
   * Row key for a step line drawn over the bars — a SECOND reading, not a
   * restatement of the bars. Single-series only.
   */
  trend?: string
  /** Display name for the bars in the tooltip; defaults to the `y` row key. */
  yName?: string
  /** Display name for the trend line in the tooltip; defaults to the `trend` key. */
  trendName?: string
  /**
   * URL of an image tiled behind the PLOT AREA — the rectangle the marks
   * occupy, not the axis gutters. It is drawn at 20% under a soft radial pool of
   * ink, the same light-in-the-middle language the canvas background uses, and
   * both sit below every mark.
   */
  pattern?: string
  /** Value labels above each bar (single-series only), like LineChart's. */
  showValues?: boolean
  /**
   * Suffix appended to axis tick labels AND bar value labels — '%' turns a
   * 0–40 scale into a percentage reading without changing the data.
   */
  valueSuffix?: string
  /** Dotted gridlines (both axes' splitLines) instead of the solid default. */
  dottedGrid?: boolean
  /** Vertical gridlines on the category axis, like LineChart's verticalGrid. */
  verticalGrid?: boolean
  /**
   * Index into chartTheme's categorical palette for a single-series chart —
   * still theme-owned color, only the STEP is chosen here (1 = the graph's
   * entity purple). Default keeps ECharts' own first-color assignment.
   */
  seriesColorIndex?: number
}>(), {
  glass: false,
  height: 260,
  showValues: false,
  dottedGrid: false,
  verticalGrid: false,
})

const th = useChartTheme()

/**
 * The axis scale behind `yTicks`: the smallest "round" interval that fits the
 * data into exactly `ticks - 1` steps, and the max it implies. The ladder is the
 * conventional 1 / 2 / 2.5 / 5 / 10 set plus 4, which is what turns a max of 11
 * into 0 / 4 / 8 / 12 rather than pushing the axis to 15.
 */
function niceScale(dataMax: number, ticks: number): { interval: number, max: number } {
  const steps = Math.max(1, ticks - 1)
  if (!(dataMax > 0)) return { interval: 1, max: steps }
  const raw = dataMax / steps
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const interval = [1, 2, 2.5, 4, 5, 10]
    .map(m => m * magnitude)
    .find(candidate => candidate >= raw - 1e-9) ?? 10 * magnitude
  return { interval, max: interval * steps }
}

const option = computed<EChartsOption>(() => {
  const t = th.value
  const single = !props.series
  const pv = pivot(props.data, props.x, props.y, props.series)
  const r = t.marks.barCornerRadius
  const rows = props.data as readonly Record<string, unknown>[]

  /* The trend overlay: one value per category, stepped over the bar tops. */
  const trendValues = props.trend
    ? pv.categories.map((c) => {
        const row = rows.find(r2 => r2[props.x] === c)
        return row ? (row[props.trend as string] as number ?? null) : null
      })
    : []

  /*
   * `yTicks`: stacked bars are read as their total, so the ceiling comes from
   * the per-category sum — plus the trend line, which can sit above the bars.
   */
  const categoryTotals = pv.categories.map((_, i) => (single
    ? (pv.series[0]?.values[i] ?? 0)
    : pv.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)))
  const scale = props.yTicks && props.yTicks > 1
    ? niceScale(Math.max(0, ...categoryTotals, ...trendValues.map(v => v ?? 0)), props.yTicks)
    : null

  /*
   * Glass backdrop bars — a CUSTOM series so each bar is two shapes:
   *
   *   1. the body: translucent ink gradient, 20% at the top fading to nothing
   *      at the base, so the field stays visible through it. A real CSS
   *      backdrop-blur is impossible here — the renderer paints one scene, so
   *      no shape can blur what is behind it; the milky fill is the closest
   *      frosted read available.
   *   2. the glint: a 3px cap on the bar's growing tip, spanning the full bar
   *      width with a soft glow. This is the time rail's `.histo__bar::after`
   *      pill, rotated onto a vertical bar — same ink, same alpha, same 3px, so
   *      the two histograms read as one material.
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
    // The glint never grows taller than the bar it caps, so a near-zero day
    // renders as a thin mark instead of a cap floating off its own bar.
    const glint = Math.min(3, h)
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
        { // glint — the time rail's tip pill: 3px, 45% ink, softly glowing
          type: 'rect' as const,
          shape: { x: cx - w / 2, y: top, width: w, height: glint, r: [2, 2, 2, 2] },
          style: {
            fill: withAlpha(t.ink, 0.45),
            shadowBlur: 4,
            shadowColor: withAlpha(t.ink, 0.25),
          },
        },
      ],
    }
  }

  /*
   * The plot's ground, in two layers under every mark: the tiled pattern at 20%,
   * then a dome of light over it — `primary-darken-1` at 32% on the bottom edge
   * fading to fully transparent ink, so the bars stand in light rather than on a
   * flat field.
   *
   * It's a series rather than `grid.backgroundColor` because that takes ONE
   * fill and no opacity, and because `params.coordSys` hands a custom series the
   * plot rectangle exactly — so the ground tracks the plot as the axis labels
   * resize it, and never reaches into the gutters.
   */
  const backdropRenderItem = (params: any) => {
    const cs = params.coordSys as { x: number, y: number, width: number, height: number }
    if (!cs || !props.pattern) return
    const shape = { x: cs.x, y: cs.y, width: cs.width, height: cs.height }
    /*
     * The glow is painted on its OWN square, not on the plot rect: a radial
     * gradient is stretched by the box it fills, so on a wide plot it would
     * spread into an ellipse reaching both side edges. A square of side 2R
     * centred on the bottom edge keeps it circular, and the series' `clip`
     * trims the half below the axis — leaving the dome.
     *
     * R stays within the plot's height so the whole falloff happens inside the
     * plot — a radius far past it would put the disc's rim in view as a near
     * vertical edge instead of a dome. The width term caps it at 80% of the
     * plot, so it always stops short of the left and right edges.
     */
    const radius = Math.min(cs.height, cs.width * 0.4)
    /*
     * One dome, painted twice. Each stop pair fades to its OWN hue at zero
     * alpha, never to a transparent white: design tools interpolate gradients
     * with premultiplied alpha, so "fade to white 0%" reads there as a clean
     * fade-out, while SVG interpolates straight and a white end-stop greys the
     * whole disc, landing its rim as a visible edge.
     *
     * Two passes because the warm pass alone is invisible here — the brand's
     * darkest tone against a near-black card is a couple of levels of lift. The
     * warm pass carries the hue, the ink pass carries the light.
     */
    const dome = (color: string, alpha: number) => ({
      type: 'rect' as const,
      shape: {
        x: cs.x + cs.width / 2 - radius,
        y: cs.y + cs.height - radius,
        width: radius * 2,
        height: radius * 2,
      },
      style: {
        fill: {
          type: 'radial' as const,
          x: 0.5, y: 0.5, r: 0.5,
          colorStops: [
            { offset: 0, color: withAlpha(color, alpha) },
            { offset: 1, color: withAlpha(color, 0) },
          ],
        },
      },
    })
    return {
      type: 'group' as const,
      children: [
        {
          type: 'rect' as const,
          shape,
          style: { fill: { image: props.pattern, repeat: 'repeat' }, opacity: 0.2 },
        },
        dome(t.brand.primaryDarken, 0.32),
        dome(t.ink, 0.1),
      ],
    }
  }

  /*
   * The trend line, drawn shape by shape rather than as a `line` series with
   * `step`. A step line starts and ends at the FIRST and LAST category centres,
   * so it stops half a band short of the plot on both sides. Here each category
   * owns the full width of its band and the risers sit on the band boundaries,
   * which puts the run's two ends exactly on the plot edges.
   */
  const trendRenderItem = (params: any, api: any) => {
    const i = params.dataIndex as number
    const v = api.value(1)
    if (v == null) return
    const half = (api.size([1, 0])[0] as number) / 2
    const [cx, y] = api.coord([i, v])
    const stroke = { stroke: t.ink, lineWidth: t.marks.lineWidth, fill: 'none' }
    const children: Record<string, unknown>[] = [{
      type: 'polyline' as const,
      shape: { points: [[cx - half, y], [cx + half, y]] },
      style: stroke,
    }]
    // The riser to the next day, drawn on the boundary the two bands share.
    const next = trendValues[i + 1]
    if (next != null) {
      const [, ny] = api.coord([i + 1, next])
      children.push({
        type: 'polyline' as const,
        shape: { points: [[cx + half, y], [cx + half, ny]] },
        style: stroke,
      })
    }
    return { type: 'group' as const, children }
  }

  return {
    ...baseChartOption(t),
    legend: { ...(baseChartOption(t).legend as object), show: !single },
    tooltip: { ...(baseChartOption(t).tooltip as object), trigger: 'axis', axisPointer: { type: 'shadow' } },
    // The shared grid reserves 24px at the top for the legend strip. A
    // single-series bar chart hides its legend, so that reserve is dead space
    // above the highest y label — drop it to 8px, the minimum that keeps the
    // topmost label (centered on the max gridline) from clipping. With value
    // labels ON, the tallest bar's label needs that headroom back.
    grid: { ...(baseChartOption(t).grid as object), top: single && !props.showValues ? 8 : 24 },
    xAxis: {
      ...categoryAxis(t, props.xLabel, true),
      data: pv.categories,
      ...(props.verticalGrid
        ? {
            splitLine: { show: true, lineStyle: { color: t.grid, width: 1, ...(props.dottedGrid ? { type: 'dotted' as const } : {}) } },
            // A gridline per category implies a LABEL per category: stop
            // ECharts' auto-thinning and wrap long names instead of hiding
            // their neighbours.
            axisLabel: {
              color: t.axis,
              fontSize: t.type.tickLabel,
              fontFamily: t.fontFamily,
              interval: 0,
              width: 84,
              overflow: 'break' as const,
            },
          }
        : {}),
    },
    // glass: no horizontal value gridlines — only the x-axis baseline remains
    // (categoryAxis keeps its axisLine), so the backdrop bars sit on a clean
    // field. Labels and scale are untouched.
    yAxis: {
      ...valueAxis(t, props.yLabel),
      ...(props.glass && single ? { splitLine: { show: false } } : {}),
      ...(props.dottedGrid ? { splitLine: { lineStyle: { color: t.grid, width: 1, type: 'dotted' as const } } } : {}),
      ...(props.valueSuffix ? { axisLabel: { color: t.axis, fontSize: t.type.tickLabel, fontFamily: t.fontFamily, formatter: `{value}${props.valueSuffix}` } } : {}),
      ...(scale ? { min: 0, max: scale.max, interval: scale.interval } : {}),
    },
    series: [
      // the ground, below every mark (z: 0) and out of the tooltip: its one
      // datum carries a null value, which the shared formatter drops
      ...(props.pattern ? [{
        name: 'plot backdrop',
        type: 'custom',
        renderItem: backdropRenderItem,
        data: [[0, null]],
        encode: { x: 0, y: 1 },
        silent: true,
        animation: false,
        // clips the glow's square to the plot, so only the dome above the axis shows
        clip: true,
        z: 0,
      }] : []),
      ...(single && props.glass
        // glass backdrop: one custom series drawing body + top strip per bar
        ? [{
            name: props.yName ?? pv.series[0]?.name,
            type: 'custom',
            renderItem: glassRenderItem,
            data: pv.series[0]?.values.map((v, i) => [i, v]) ?? [],
            encode: { x: 0, y: 1 },
            // as above: the tooltip swatch should read as glass, not as the
            // categorical color a custom series would otherwise be given
            itemStyle: { color: withAlpha(t.ink, 0.6) },
          }]
        : pv.series.map(s => ({
            name: single ? (props.yName ?? s.name) : s.name,
            type: 'bar',
            data: s.values,
            barMaxWidth: 36,
            ...(single ? {} : { stack: 'total' }),
            itemStyle: {
              ...(single
                // single: round the top (data-end) only
                ? { borderRadius: [r, r, 0, 0] }
                // stacked: a 2px surface-colored border fakes the gap between segments
                : { borderColor: t.surface, borderWidth: t.marks.surfaceGap, borderRadius: [r, r, r, r] }),
              // theme palette step override (single-series) — see the prop note
              ...(single && props.seriesColorIndex != null
                ? { color: t.categorical[props.seriesColorIndex] ?? t.categorical[0] }
                : {}),
            },
            // value labels above the bars — LineChart's showValues, for bars
            ...(single && props.showValues
              ? {
                  label: {
                    show: true,
                    position: 'top' as const,
                    color: t.ink,
                    fontSize: t.type.tickLabel,
                    fontFamily: t.fontFamily,
                    formatter: `{c}${props.valueSuffix ?? ''}`,
                  },
                }
              : {}),
            emphasis: { focus: 'series' },
          }))),
      // the trend line — solid ink, one flat run per category, edge to edge
      ...(props.trend ? [{
        name: props.trendName ?? props.trend,
        type: 'custom',
        renderItem: trendRenderItem,
        z: 3,
        data: trendValues.map((v, i) => [i, v]),
        encode: { x: 0, y: 1 },
        // the tooltip's swatch is taken from here — keep it the line's own ink
        itemStyle: { color: t.ink },
      }] : []),
    ],
  } as EChartsOption
})
</script>

<template>
  <BaseChart :option="option" :height="height" :title="title" />
</template>
