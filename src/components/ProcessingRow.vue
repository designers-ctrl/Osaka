<!--
  src/components/ProcessingRow.vue

  The assistant's "working on it" row — three pulsing dots and a short muted
  label, shown between a request and its answer:

      •••  Processing question

  Deliberately lightweight: no card, no surface, no spinner. It is a transient
  state, so it should read as the quietest thing in the column rather than as
  another block of content competing with the message above it.

  Colours are the DS gray/white ramp; the dots pulse in sequence on a shared
  keyframe, offset per dot, so the animation is one rule rather than three.

  Props:
    label - the status text (default "Processing question")

  Example usage:
    <processing-row />
    <processing-row label="Reading your documents" />
-->

<script setup lang="ts">
  withDefaults(defineProps<{
    label?: string
  }>(), {
    label: 'Processing question',
  })
</script>

<template>
  <!--
    `status` + `aria-live="polite"`: the row appears without the user acting, so
    a screen reader should hear that work started — announced once, politely,
    rather than interrupting. The dots are decorative and stay hidden from AT.
  -->
  <div class="processing-row d-flex align-center ga-2" role="status" aria-live="polite">
    <span class="processing-row__dots" aria-hidden="true">
      <span class="processing-row__dot" />
      <span class="processing-row__dot" />
      <span class="processing-row__dot" />
    </span>
    <span class="processing-row__label text-body-small">{{ label }}</span>
  </div>
</template>

<style scoped>
  .processing-row {
    /* Left-aligned inside the centred chat column, and hugging its content. */
    align-self: flex-start;
  }

  .processing-row__dots {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .processing-row__dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(var(--v-theme-button-white-80));
    /*
     * One keyframe, three offsets — the dots read as a travelling pulse rather
     * than three independent blinks. Opacity and scale only, so nothing in the
     * row reflows while it runs.
     */
    animation: processing-pulse 1.2s ease-in-out infinite;
  }

  .processing-row__dot:nth-child(2) { animation-delay: 0.16s; }
  .processing-row__dot:nth-child(3) { animation-delay: 0.32s; }

  .processing-row__label {
    color: rgba(var(--v-theme-button-white-60));
  }

  @keyframes processing-pulse {
    0%, 60%, 100% { opacity: 0.35; transform: scale(0.85); }
    30% { opacity: 1; transform: scale(1); }
  }

  /*
   * Reduced motion: the row still has to READ as active, so the dots hold at
   * full strength rather than animating — the label carries the state.
   */
  @media (prefers-reduced-motion: reduce) {
    .processing-row__dot {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }
</style>
