<!--
  src/components/InsightCard.vue

  ONE highlighted insight in an assistant answer — the gold call-out card from
  Figma node 2562:74550: a glowing Insight mark on the left, the insight
  sentence beside it.

  ── Tokens, not hexes ──────────────────────────────────────────────────────
    Figma                       → this project
    border #F2C585              → `primary` (the dark theme's brand gold)
    gradient #000101 → #7C6749  → `background` → `secondary` (yellow-accent-2)
    radius 16px                 → `--radius-xl`

  ── The 40% translucency lives on the BACKGROUND ONLY ─────────────────────
  The Figma layer carries opacity on the whole node, which would dim the text
  and the icon into unreadability. Here the gradient is painted by a ::before
  layer that carries the opacity alone; the border, icon and text sit at full
  strength above it.

  The icon speaks the graph's Insight language: the same gold (`primary`) the
  insight nodes and the legend swatch use, with a soft glow — a light source,
  like the nodes themselves.

  Props:
    text - the insight sentence (or use the default slot for rich content)

  Example usage:
    <insight-card text="A $50M valuation framework is actively being operationalized." />
-->

<script setup lang="ts">
  defineProps<{
    /** The insight sentence; the default slot overrides it for rich content. */
    text?: string
  }>()
</script>

<template>
  <div class="insight-card">
    <span class="insight-card__icon" aria-hidden="true">
      <v-icon icon="tip" size="18" />
    </span>
    <p class="insight-card__text text-body-large">
      <slot>{{ text }}</slot>
    </p>
  </div>
</template>

<style scoped>
.insight-card {
  /* Figma 2562:74550: 16px padding, 12px gap, items to the top. */
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  align-self: stretch;
  border-radius: var(--radius-xl);
  border: 1px solid rgb(var(--v-theme-primary));
  /* Contain the ::before wash inside the rounded border. */
  overflow: hidden;
}

/* The gradient wash — Black-1 → yellow-accent-2 right to left — carrying the
   node's 40% opacity ALONE, so the content above stays fully readable. */
.insight-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    270deg,
    rgb(var(--v-theme-background)) 0%,
    rgb(var(--v-theme-secondary)) 100%
  );
  opacity: 0.4;
  pointer-events: none;
}

/* The glowing Insight mark: the graph's gold on its own lit disc. */
.insight-card__icon {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: rgb(var(--v-theme-primary));
  background: radial-gradient(
    50% 50% at 50% 50%,
    rgba(var(--v-theme-primary), 0.35) 0%,
    rgba(var(--v-theme-primary), 0.08) 100%
  );
  box-shadow: 0 0 12px 2px rgba(var(--v-theme-primary), 0.35);
}

.insight-card__text {
  position: relative;
  margin: 0;
  color: rgba(var(--v-theme-button-white-100));
}
</style>
