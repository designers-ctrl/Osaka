<!--
  src/components/InsightDetails.vue

  The Assistant Rail's INSIGHT DETAILS view — what the rail shows while an
  Insight node is selected on the canvas:

      InsightCard              the insight itself, in the gold call-out
      Why this matters         what it means, and why it is worth acting on
      Activity over time       the trend behind it
      Supporting evidence      what in the graph backs it, as live references
      Evidence distribution    where that support actually comes from

  ⚠️ EVERY component here is an existing one — `InsightCard`, `DataVizCard`,
  the chart kit's `LineChart`/`BarChart`, and `AnswerProse` for the inline
  references (the shared home of the `.assistant-answer__ref` treatment, so
  this view and the assistant's answers cannot drift apart). Nothing about an
  insight is drawn twice in this codebase.

  Content-free: it renders whatever `deriveInsightDetail` returns, and that
  reads the real link set (see src/data/insightDetail.ts), so two insights can
  never show the same evidence unless the graph says they share it.

  Props:
    detail - the derived insight detail

  Emits:
    ref-click / ref-hover - an inline reference was activated or pointed at
    chart-menu            - a figure's ··· was pressed
-->

<script setup lang="ts">
  import AnswerProse from '@/components/AnswerProse.vue'
  import DataVizCard from '@/components/DataVizCard.vue'
  import InsightCard from '@/components/InsightCard.vue'
  import { BarChart, LineChart } from '@/components/charts'
  import { computed } from 'vue'
  import type { InsightDetail } from '@/data/insightDetail'
  import type { AnswerRichText } from '@/data/graphWorkspace'

  const props = defineProps<{ detail: InsightDetail }>()

  defineEmits<{
    'ref-click': [ref: string]
    'ref-hover': [ref: string | null]
    'chart-menu': []
  }>()

  /**
   * The supporting-evidence sentence as inline RUNS: plain text around one
   * reference per thing the insight is actually attached to. Built here rather
   * than in the template so the connectives ("…, … and …") stay readable, and
   * so the whole sentence is one `AnswerProse` — the same component, and the
   * same click/hover contract, the assistant's answers use.
   */
  const evidenceRuns = computed<AnswerRichText>(() => {
    const refs = props.detail.refs
    if (!refs.length) {
      return ['Nothing in the current graph view backs this insight yet: its supporting relationships fall outside the active time range.']
    }
    const runs: AnswerRichText = ['This insight is supported by ']
    refs.forEach((ref, i) => {
      runs.push({ text: ref.label, refId: ref.id })
      if (i < refs.length - 2) runs.push(', ')
      else if (i === refs.length - 2) runs.push(' and ')
    })
    runs.push(' — every one a relationship the graph already holds, not a restatement of the insight.')
    return runs
  })

  /** Confidence as a percentage, only when the dataset actually carries one. */
  const confidencePercent = () => typeof props.detail.confidence === 'number'
    ? `${Math.round(props.detail.confidence * 100)}%`
    : null
</script>

<template>
  <section class="insight-details d-flex flex-column ga-4">
    <!-- 1. The insight itself, in the existing gold call-out. -->
    <InsightCard>
      <span class="insight-details__title">{{ detail.title }}</span>
      <template v-if="detail.description">
        — {{ detail.description }}
      </template>
    </InsightCard>

    <!-- Provenance line: the dataset's own reading, plus confidence. -->
    <p v-if="detail.derivedFrom || confidencePercent()" class="insight-details__meta text-label-small">
      <template v-if="detail.derivedFrom">Derived from {{ detail.derivedFrom }}</template>
      <template v-if="detail.derivedFrom && confidencePercent()"> · </template>
      <template v-if="confidencePercent()">{{ confidencePercent() }} confidence</template>
    </p>

    <!-- 2. Why this matters -->
    <div class="d-flex flex-column ga-2">
      <h3 class="insight-details__heading text-title-medium font-weight-bold">Why this matters</h3>
      <p class="insight-details__body text-body-medium">{{ detail.whyItMatters }}</p>
    </div>

    <!-- 3. The trend behind it -->
    <DataVizCard title="Activity over time" @menu="$emit('chart-menu')">
      <LineChart
        :data="detail.activity"
        x="period"
        y="value"
        x-label="Period"
        :title="`Activity over recent periods for ${detail.title}`"
        show-points
        show-values
        vertical-grid
      />
    </DataVizCard>

    <!-- 4. Supporting evidence — the graph's own names, as live references -->
    <div class="d-flex flex-column ga-2">
      <h3 class="insight-details__heading text-title-medium font-weight-bold">Supporting evidence</h3>
      <p class="insight-details__body text-body-medium">
        <AnswerProse
          :runs="evidenceRuns"
          @ref-click="$emit('ref-click', $event)"
          @ref-hover="$emit('ref-hover', $event)"
        />
      </p>
    </div>

    <!-- 5. Where that support comes from -->
    <!--
      Only when there is an actual distribution to show: one bar restates the
      sentence above it, so the widget is dropped rather than padded (see
      `showEvidence`). The evidence TEXT stays either way.
    -->
    <DataVizCard v-if="detail.showEvidence" title="Evidence distribution" @menu="$emit('chart-menu')">
      <BarChart
        :data="detail.evidence"
        x="label"
        y="value"
        :title="`Where the evidence for ${detail.title} comes from`"
        :y-ticks="4"
        :series-color-index="1"
        :x-label-max-width="70"
        y-name="Connections"
        show-values
        dotted-grid
        vertical-grid
      />
    </DataVizCard>
  </section>
</template>

<style scoped>
.insight-details__title {
  color: rgba(var(--v-theme-button-white-100));
  font-weight: 500;
}

/* One step back from the body: this is provenance, not the reading. */
.insight-details__meta {
  margin: 0;
  color: rgba(var(--v-theme-button-white-60));
}

.insight-details__heading {
  margin: 0;
  color: rgba(var(--v-theme-button-white-100));
}

.insight-details__body {
  margin: 0;
  color: rgba(var(--v-theme-button-white-80));
}
</style>
