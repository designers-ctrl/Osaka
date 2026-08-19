<!--
  src/components/AssistantRailToggle.vue

  The floating collapse/expand handle that straddles the seam between the graph
  canvas and the assistant rail. A deliberate non-Vuetify control (Figma spec):
  one glass container holding two semantic <button>s — chevron-left OPENS the
  rail to its full width, chevron-right hides it — split by a 1px
  gradient-gray divider.

  The component owns NO rail state: the screen keeps the single `railState` ref
  and passes it in; the buttons only emit `collapse` / `expand`. What each emit
  MEANS is the screen's business — chevron left is one step toward more
  assistant (closed → open → fullscreen), chevron right closes outright.

  The control shows only the actions that EXIST in the current state, rather
  than showing both and disabling one — it shrinks to what is available:

    closed      → chevron left only   (nothing left to close)
    default     → both
    fullscreen  → chevron right only  (nothing further to expand to)

  The divider is part of that: it only earns its place when there are two
  halves to divide.

  Every color derives from theme tokens — the spec's #000101 border is the
  `background` token, the body gradient is gray3 → gray4, and both inset
  glints plus the hover/pressed fills are gray1 at the spec's alphas. The
  glass body stays fully opaque in every state — only the per-button fills
  react to hover/pressed.
-->
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** The rail's current state (the screen's `railState`). */
  state: 'closed' | 'open' | 'fullscreen'
}>()

/** A closed rail cannot be closed further — that half is not rendered. */
const canCollapse = computed(() => props.state !== 'closed')
/** A fullscreen rail cannot expand further — that half is not rendered. */
const canExpand = computed(() => props.state !== 'fullscreen')
const expandLabel = computed(() =>
  (props.state === 'closed' ? 'Show the assistant' : 'Expand the assistant to full width'))

const emit = defineEmits<{
  /** Right chevron — close the rail. */
  collapse: []
  /** Left chevron — one step toward more assistant. */
  expand: []
}>()
</script>

<template>
  <div class="rail-toggle" role="group" aria-label="Assistant rail">
    <button
      v-if="canExpand"
      type="button"
      class="rail-toggle__btn"
      :aria-label="expandLabel"
      @click="emit('expand')"
    >
      <v-icon icon="chevronLeft" size="x-small" />
    </button>

    <!-- Only when there are two halves to divide. -->
    <span v-if="canExpand && canCollapse" class="rail-toggle__divider" aria-hidden="true" />

    <button
      v-if="canCollapse"
      type="button"
      class="rail-toggle__btn"
      aria-label="Hide the assistant"
      @click="emit('collapse')"
    >
      <v-icon icon="chevronRight" size="x-small" />
    </button>
  </div>
</template>

<style scoped>
/*
 * Glass container (Figma spec). Gradient + shadows are token-derived:
 * border = the page-background black, body = gray3 → gray4, the two inset
 * glints = gray1 at 20% / 40%, drop shadow = page black at 60%.
 */
.rail-toggle {
  display: inline-flex;
  align-items: stretch;
  overflow: hidden; /* clips the buttons' square hover fills to the radius */
  border-radius: var(--radius-xs);
  border: 1px solid rgb(var(--v-theme-background));
  background: linear-gradient(
    180deg,
    rgb(var(--v-theme-gray3)) 0%,
    rgb(var(--v-theme-gray4)) 100%
  );
  box-shadow:
    0 -5px 4px rgba(var(--v-theme-gray1), 0.2) inset,
    0 4px 4px rgba(var(--v-theme-gray1), 0.4) inset,
    0 12px 24px rgba(var(--v-theme-background), 0.6);
  backdrop-filter: blur(2px);
}

/* Each half: a semantic <button> that reads as a plain div section. */
.rail-toggle__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  min-width: 16px;
  min-height: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.rail-toggle__btn:hover {
  background: rgba(var(--v-theme-gray1), 0.2);
}

.rail-toggle__btn:active {
  background: rgba(var(--v-theme-gray1), 0.4);
}

.rail-toggle__btn:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

/* 1px vertical splitter between the halves — gray1 at low opacity. */
.rail-toggle__divider {
  width: 1px;
  align-self: stretch;
  background: rgba(var(--v-theme-gray1), 0.2);
}
</style>
