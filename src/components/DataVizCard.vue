<!--
  src/components/DataVizCard.vue

  A titled surface for one figure, with an overflow menu in its header:

      ┌──────────────────────────────────────────────┐
      │ Demand activity over time              [···] │
      │                                              │
      │            (the chart, slotted)              │
      └──────────────────────────────────────────────┘

  The card is chrome only — it owns the frame, the title row and the menu
  affordance, never the chart. Whatever figure goes in comes through the default
  slot, so this composes with any preset from the chart kit
  (`src/components/charts`) rather than wrapping one of them.

  Props:
    title - the figure's name, in the header

  Slots:
    default - the chart
    actions - replaces the built-in ··· button, when a card needs its own

  Emits:
    menu - the ··· button was pressed

  Example usage:
    <data-viz-card title="Demand activity over time" @menu="…">
      <line-chart :data="rows" x="month" y="value" title="Demand activity" show-values />
    </data-viz-card>
-->

<script setup lang="ts">
  import AppButton from '@/components/AppButton.vue'

  defineProps<{
    title: string
  }>()

  defineEmits<{
    menu: []
  }>()
</script>

<template>
  <v-card class="dataviz-card pa-4 surface--card-flat">
    <div class="d-flex align-center ga-3 mb-2">
      <!-- The figure's name. `flex-grow` so the menu keeps the right edge. -->
      <div class="text-title-medium font-weight-medium flex-grow-1">{{ title }}</div>

      <slot name="actions">
        <AppButton
          variant="secondary"
          size="s"
          icon-only
          :aria-label="`Options for ${title}`"
          @click="$emit('menu')"
        >
          <template #icon><v-icon icon="overflow" /></template>
        </AppButton>
      </slot>
    </div>

    <slot />
  </v-card>
</template>

<style scoped>
  /* The chart sizes itself; the card only bounds it. */
  .dataviz-card { overflow: hidden; }
</style>
