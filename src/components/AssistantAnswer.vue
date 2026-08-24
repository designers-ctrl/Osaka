<!--
  src/components/AssistantAnswer.vue

  One assistant answer, in the shape the reference lays out:

      Summary
      [lead paragraphs]

      Evidence

      Early Market Validation
      [body]   ← with the surfaces it was read from
      [figure]

  Content-free: everything comes from the `answer` prop (see `DemoAnswer` in
  src/data/graphWorkspace.ts), so the screen stays a pure view and a real
  response drops into the same shape.

  ⚠️ This renders MODEL OUTPUT. The provenance each block carries in the data
  (`sources`) is deliberately NOT drawn here: chips under every paragraph broke
  the reading rhythm of the answer. Provenance belongs to the surface built for
  it — the reasoning accordion, where a step's sources sit beside the step. The
  data still carries it, so that surface has it to show.

  Props:
    answer - the response to render

  Emits:
    chart-menu - the figure's ··· button was pressed

  Example usage:
    <assistant-answer :answer="data.demoAnswer" @chart-menu="…" />
-->

<script setup lang="ts">
  import AnswerProse from '@/components/AnswerProse.vue'
  import AppButton from '@/components/AppButton.vue'
  import DataVizCard from '@/components/DataVizCard.vue'
  import InsightCard from '@/components/InsightCard.vue'
  import { BarChart, LineChart } from '@/components/charts'
  import type { DemoAnswer } from '@/data/graphWorkspace'

  defineProps<{
    answer: DemoAnswer
  }>()

  const emit = defineEmits<{
    'chart-menu': []
    /**
     * A reference in the prose was clicked. The payload is the graph node id
     * when the data supplies one, else the reference's own text — the HOST
     * decides whether a destination exists (see GraphWorkspace.onAnswerRef).
     */
    'ref-click': [refId: string]
    /** One of the response actions: copy / like / dislike / update. */
    'action': [id: 'copy' | 'like' | 'dislike' | 'update']
    /**
     * A reference is being pointed at (or keyboard-focused) — the host
     * isolates the matching graph element while this is non-null. `null` on
     * leave restores the canvas.
     */
    'ref-hover': [refId: string | null]
  }>()

  /** The four icon-only response actions, in reference order. */
  const ACTIONS = [
    { id: 'copy', icon: 'copy', label: 'Copy response' },
    { id: 'like', icon: 'thumbsUp', label: 'Helpful' },
    { id: 'dislike', icon: 'thumbsDown', label: 'Not helpful' },
    { id: 'update', icon: 'refresh', label: 'Update response' },
  ] as const

  /** Forwarded from AnswerProse — the runs renderer owns the ref markup. */
  const onRef = (refId: string) => emit('ref-click', refId)
  const onRefHover = (refId: string | null) => emit('ref-hover', refId)
</script>

<template>
  <article class="assistant-answer d-flex flex-column ga-6">
    <section class="d-flex flex-column ga-3">
      <h2 class="assistant-answer__heading text-headline-small">Summary</h2>
      <p
        v-for="(paragraph, index) in answer.summary"
        :key="index"
        class="assistant-answer__body text-body-large"
      >
        <AnswerProse :runs="paragraph" @ref-click="onRef" @ref-hover="onRefHover" />
      </p>
    </section>

    <section class="d-flex flex-column ga-4">
      <h2 class="assistant-answer__heading text-headline-small">Evidence</h2>

      <div
        v-for="(section, index) in answer.evidence"
        :key="section.id"
        class="assistant-answer__block d-flex flex-column ga-2"
      >
        <h3 class="assistant-answer__subheading text-title-medium font-weight-bold">
          {{ section.heading }}
        </h3>
        <p class="assistant-answer__body text-body-large">
          <AnswerProse :runs="section.body" @ref-click="onRef" @ref-hover="onRefHover" />
        </p>

        <!-- The figure closes the Evidence run — the analysis sections below
             continue "after Demand activity over time", per the reference. -->
        <DataVizCard
          v-if="index === answer.evidence.length - 1"
          class="mt-1"
          :title="answer.chart.title"
          @menu="$emit('chart-menu')"
        >
          <LineChart
            :data="answer.chart.points"
            x="month"
            y="value"
            :x-label="answer.chart.xLabel"
            :y-label="answer.chart.yLabel"
            :title="answer.chart.ariaTitle"
            :height="240"
            show-points
            show-values
            vertical-grid
          />
        </DataVizCard>
      </div>
    </section>

    <!-- ── The analysis run after the demand figure ──────────────────────── -->
    <section class="d-flex flex-column ga-4">
      <div
        v-for="section in answer.sections"
        :key="section.id"
        class="assistant-answer__block d-flex flex-column ga-2"
      >
        <h3 class="assistant-answer__subheading text-title-medium font-weight-bold">
          {{ section.heading }}
        </h3>
        <p class="assistant-answer__body text-body-large">
          <AnswerProse :runs="section.body" @ref-click="onRef" @ref-hover="onRefHover" />
        </p>
      </div>
    </section>

    <!-- ── Insights: the highlighted card, then the concluding read ─────── -->
    <section class="d-flex flex-column ga-4">
      <h2 class="assistant-answer__heading text-headline-small">Insights</h2>
      <InsightCard>
        <AnswerProse :runs="answer.insight.card" @ref-click="onRef" @ref-hover="onRefHover" />
      </InsightCard>
      <p class="assistant-answer__body text-body-large">
        <AnswerProse :runs="answer.insight.conclusion" @ref-click="onRef" @ref-hover="onRefHover" />
      </p>
    </section>

    <!-- ── The closing figure: evidence weight by signal ─────────────────── -->
    <DataVizCard :title="answer.barChart.title" @menu="$emit('chart-menu')">
      <BarChart
        :data="answer.barChart.points"
        x="label"
        y="value"
        :title="answer.barChart.ariaTitle"
        :height="320"
        :y-ticks="5"
        :series-color-index="1"
        :bar-width="14"
        value-suffix="%"
        :x-label-max-width="70"
        :grid-bottom-extra="24"
        show-values
        value-badge
        gradient-bars
        dotted-grid
        vertical-grid
      />
    </DataVizCard>

    <!-- ── Response actions: subtle at rest, brighter on hover ──────────── -->
    <div class="assistant-answer__actions d-flex">
      <AppButton
        v-for="action in ACTIONS"
        :key="action.id"
        v-tooltip:bottom="action.label"
        variant="ghost"
        size="s"
        icon-only
        :aria-label="action.label"
        @click="emit('action', action.id)"
      >
        <template #icon><v-icon :icon="action.icon" /></template>
      </AppButton>
    </div>
  </article>
</template>

<style scoped>
  /* Headings sit at full emphasis; body copy one step back, so the structure
     reads before the prose does. Both inks are theme tokens. */
  .assistant-answer__heading,
  .assistant-answer__subheading {
    color: rgba(var(--v-theme-button-white-100));
  }

  .assistant-answer__body {
    color: rgba(var(--v-theme-button-white-80));
  }

  /*
   * ── SPACING: the flex gaps are the ONLY spacing ─────────────────────────
   *
   * `h2`/`h3` carry user-agent margins (19.92px and 16px here, top AND bottom)
   * which STACK on top of the `ga-*` gaps — so a 12px gap under "Summary" was
   * rendering at 32px, and "Evidence → Early Market Validation" at 52px. That
   * is where the oversized gaps came from, not from the scale itself. Zeroing
   * the margins makes each gap exactly the token that sets it:
   *
   *   heading → first content   ga-3 / ga-4   12–16px
   *   subheading → paragraph    ga-2           8px
   *   paragraph → next section  ga-6          24px
   */
  .assistant-answer__heading,
  .assistant-answer__subheading,
  .assistant-answer__body {
    margin: 0;
  }

  /*
   * Between evidence blocks the break is a section break (24px), while the gap
   * from the "Evidence" heading to the FIRST block stays at the section's own
   * 16px. One `gap` cannot be both, so the extra 8px is added between siblings.
   */
  .assistant-answer__block + .assistant-answer__block {
    margin-top: 8px;
  }

  /*
   * The action row sits one step back until pointed at, and always closes the
   * answer with 24px beneath it — owned here rather than by the chat stack, so
   * every answer ends with the same gap wherever it is rendered.
   */
  .assistant-answer__actions {
    opacity: 0.6;
    transition: opacity 0.18s ease;
    margin-bottom: 24px;
  }

  .assistant-answer__actions:hover,
  .assistant-answer__actions:focus-within {
    opacity: 1;
  }
</style>
