<!--
  src/components/AppSeam.vue

  The house divider: a hairline that fades out at both ends instead of stopping
  dead against the card edge. Used between the sections of a card, between the
  columns of a stat row, and as the seam between two halves of a split card.

  It wraps Vuetify's `v-divider` rather than drawing its own line — `v-divider`
  already gives us the `<hr role="separator">` semantics, the `color` /
  `opacity` / `thickness` props, and (in Vuetify 4) a `gradient` prop that masks
  the line to transparent at both ends. This component adds the two things that
  prop can't express:

    · `stop`   — where the fade peaks. Vuetify's mask is fixed at the midpoint;
                 ours takes a percentage measured from the left (horizontal) or
                 from the top (vertical).
    · `filled` — the seam variant: a second 1px band of `surface-bright` beside
                 the line, so the pair reads as a cut through the surface rather
                 than a rule drawn on it. It's a sibling element, not a
                 background on the divider, because the fade mask would take the
                 band with it and the band is meant to stay solid.

  A vertical `v-divider` carries `margin-left: -1px` so it can sit between two
  items without shifting them; that also means it occupies no layout width. The
  filled variant needs real width for both bands, so it zeroes that margin.

  Colors come from theme tokens: `surface-variant` by default, which is defined
  in both themes. `gray1` (the other token used for seams here) exists only in
  the dark theme — pass it explicitly, on dark-only surfaces.
-->
<script setup lang="ts">
withDefaults(defineProps<{
  /** Run the seam top-to-bottom instead of left-to-right. */
  vertical?: boolean
  /** Theme color token for the line. */
  color?: string
  /** Line opacity at the fade's peak. */
  opacity?: number
  /** Where the fade peaks, 0–100, from the left (horizontal) or top (vertical). */
  stop?: number
  /** Add the solid 1px `surface-bright` band beside the line. */
  filled?: boolean
}>(), {
  vertical: false,
  color: 'surface-variant',
  opacity: 0.2,
  stop: 50,
  filled: false,
})
</script>

<template>
  <div
    class="app-seam"
    :class="[vertical ? 'app-seam--vertical' : 'app-seam--horizontal', { 'app-seam--filled': filled }]"
    :style="{ '--seam-stop': `${stop}%` }"
  >
    <v-divider class="app-seam__rule" :vertical="vertical" :color="color" :opacity="opacity" gradient />
    <div v-if="filled" class="app-seam__fill"></div>
  </div>
</template>

<style scoped>
.app-seam {
  display: flex;
  /* content-box: the app-wide border-box would fold the line's 1px border into
     the 1px band, and the seam would read as one line instead of two. */
  box-sizing: content-box;
  flex: 0 0 auto;
}

.app-seam--horizontal {
  flex-direction: column;
  width: 100%;
}

.app-seam--vertical {
  align-self: stretch;
}

/*
 * Vuetify's gradient mask peaks at the midpoint and, when vertical, runs
 * bottom-to-top. Both are re-declared here so `stop` reads from the top/left.
 * These rules are unlayered, so they win over the @layer'd Vuetify ones.
 */
.app-seam__rule {
  mask-image: linear-gradient(90deg, transparent 0%, #000 var(--seam-stop), transparent 100%);
}

.app-seam__rule.v-divider--vertical {
  mask-image: linear-gradient(180deg, transparent 0%, #000 var(--seam-stop), transparent 100%);
  /* see the header note: only the filled variant takes real layout width */
  margin-left: 0;
}

.app-seam__fill {
  flex: 0 0 1px;
  background: rgb(var(--v-theme-surface-bright));
}
</style>
