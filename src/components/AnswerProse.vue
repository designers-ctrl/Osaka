<!--
  src/components/AnswerProse.vue

  ONE run of assistant prose (`AnswerRichText`): plain strings rendered as
  text, references rendered as the dotted-underline inline link. This is THE
  home of the `.assistant-answer__ref` treatment — the assistant answer and the
  rail's Graph Summary both render through it, so a reference in either place
  is the same element with the same style by construction, not by matching CSS.

  Inline-only on purpose: the component renders runs, never a block. The caller
  owns the paragraph — its element, typography class, line-height and wrapping
  are whatever the surrounding surface uses, and the runs flow inside it.

  A reference is a real <button> (inline, chrome stripped), so keyboard and
  assistive tech get activation and focus for free; hover and focus share one
  emit so the graph-isolation behaviour cannot differ between pointer and
  keyboard.

  Props:
    runs - the ordered inline runs (see AnswerRichText in graphWorkspace.ts)

  Emits:
    ref-click - a reference was activated; payload is its refId (or its text
                when the data supplies no id — the HOST decides whether a
                destination exists)
    ref-hover - a reference is pointed at / focused (payload as above), or
                null on leave/blur

  Example usage:
    <p class="text-body-medium">
      <answer-prose :runs="paragraph" @ref-click="…" @ref-hover="…" />
    </p>
-->

<script setup lang="ts">
  import type { AnswerInline, AnswerRichText } from '@/data/graphWorkspace'

  defineProps<{
    runs: AnswerRichText
  }>()

  const emit = defineEmits<{
    'ref-click': [refId: string]
    'ref-hover': [refId: string | null]
  }>()

  type RefRun = Exclude<AnswerInline, string>

  function onRef(segment: RefRun) {
    emit('ref-click', segment.refId ?? segment.text)
  }

  function onRefHover(segment: RefRun | null) {
    emit('ref-hover', segment ? (segment.refId ?? segment.text) : null)
  }
</script>

<template>
  <template v-for="(seg, segIndex) in runs" :key="segIndex">
    <template v-if="typeof seg === 'string'">{{ seg }}</template>
    <button
      v-else
      type="button"
      class="assistant-answer__ref"
      @click="onRef(seg)"
      @mouseenter="onRefHover(seg)"
      @mouseleave="onRefHover(null)"
      @focus="onRefHover(seg)"
      @blur="onRefHover(null)"
    >{{ seg.text }}</button>
  </template>
</template>

<style scoped>
  /*
   * ── INLINE REFERENCES ────────────────────────────────────────────────────
   * Source/document/entity names inside the prose, rendered as subtle links:
   * a dotted underline on the surrounding text's own ink, so they read as part
   * of the sentence — lifting to full ink on hover/focus. `font: inherit` and
   * `color: inherit` are what let one component serve body-large answer prose
   * and body-medium summary prose without carrying either type ramp itself.
   */
  .assistant-answer__ref {
    display: inline;
    padding: 0;
    border: none;
    background: transparent;
    font: inherit;
    color: inherit;
    text-decoration-line: underline;
    text-decoration-style: dotted;
    text-decoration-color: rgba(var(--v-theme-button-white-60));
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .assistant-answer__ref:hover,
  .assistant-answer__ref:focus-visible {
    color: rgba(var(--v-theme-button-white-100));
    text-decoration-color: rgba(var(--v-theme-button-white-100));
  }

  .assistant-answer__ref:focus-visible {
    outline: 2px solid rgba(var(--v-theme-button-white-100), 0.3);
    outline-offset: 2px;
    border-radius: 2px;
  }
</style>
