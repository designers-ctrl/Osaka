<!--
  src/components/AssistantThoughtToggle.vue

  The assistant's "thinking time" disclosure — ONE container with two states:

    collapsed   [ Osaka ]  Thought for 32 s  │ ⌄        (hug-content pill)

    expanded    [ Osaka ]  Thought for 32 s ────── │ ⌃  (full column width)
                ● Processing question  ▸
                │
                ● Decomposed into 3 sub-questions:  ▸
                …

  The SAME rounded container grows: expanding does not render a separate card
  below — the reasoning timeline (slotted; the parent feeds it
  AssistantAccordion steps) opens INSIDE this surface, the pill stretches to
  the full width of its parent column, and the chevron section rides to the
  far right edge. Collapsing returns it to the hug-content pill.

  The header is a real <button> (keyboard activation + `aria-expanded` for
  free); the container carries the chrome — border, wash, radius — so both
  states share one surface. Hover/focus lift is driven from the HEADER only
  (`:has()`), so pointing at the open timeline does not light the pill.

  WIDTH ANIMATION: `interpolate-size: allow-keywords` lets the fit-content ↔
  100% change actually animate in engines that support it (Chromium 129+);
  elsewhere the width steps while the height still animates through
  v-expand-transition — graceful in both.

  Every value comes from the DS: the gray ramp for the surface and stroke,
  `--radius-xl` for the 16px corner, `text-body-small` for the type, the shared
  `Osakalogo.svg`, and the `chevronDown` key from the Carbon icon map.

  Props:
    duration - the reasoning time, in seconds
    label    - the text before the value (default "Thought for")
    expanded - v-model:expanded; drives the chevron and `aria-expanded`.
               Self-managed when the parent does not bind it.

  Slots:
    default - the reasoning timeline revealed in the expanded state

  Example usage:
    <assistant-thought-toggle v-model:expanded="open" :duration="32">
      <assistant-accordion v-for="…" … />
    </assistant-thought-toggle>
-->

<script setup lang="ts">
  import logoUrl from '@/assets/Osakalogo.svg'
  import { brand } from '@/data/brand'

  withDefaults(defineProps<{
    /** Reasoning time in seconds. */
    duration: number
    /** The words before the value. */
    label?: string
  }>(), {
    label: 'Thought for',
  })

  /**
   * Expansion state. `defineModel` so the same component works controlled
   * (`v-model:expanded`) and uncontrolled — the parent only binds it when it
   * has something to reveal.
   */
  const expanded = defineModel<boolean>('expanded', { default: false })
</script>

<template>
  <div
    class="thought-toggle"
    :class="{ 'thought-toggle--expanded': expanded }"
  >
    <button
      type="button"
      class="thought-toggle__header"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <img
        class="thought-toggle__logo"
        :src="logoUrl"
        :alt="`${brand.identity.name} logo`"
        width="16"
        height="16"
      >

      <span class="thought-toggle__text text-body-small">
        {{ label }}
        <!-- The value carries the weight — it is the number the row exists for. -->
        <span class="thought-toggle__value font-weight-medium">{{ duration }} s</span>
      </span>

      <!-- Zero-width while hugging; in the expanded full-width state it is what
           pushes the chevron section to the container's far right edge. -->
      <span class="thought-toggle__spacer" aria-hidden="true" />

      <!-- The chevron's own right-side section, separated by the divider. -->
      <span class="thought-toggle__chevron-box">
        <v-icon class="thought-toggle__chevron" icon="chevronDown" size="16" />
      </span>
    </button>

    <!-- The reasoning timeline, INSIDE the same rounded container. -->
    <v-expand-transition>
      <div v-show="expanded" class="thought-toggle__panel">
        <!--
          Separates the header row from the reasoning below it. Only exists in
          the expanded state — collapsed, the control is a single pill with
          nothing to divide.
        -->
        <span class="thought-toggle__rule" aria-hidden="true" />
        <div class="thought-toggle__body">
          <slot />
        </div>
      </div>
    </v-expand-transition>
  </div>
</template>

<style scoped>
  .thought-toggle {
    /* Hug-content column: the pill's width is its header's width… */
    display: inline-flex;
    flex-direction: column;
    width: fit-content;
    max-width: 100%;
    /* 16px, per the Figma node — `--radius-xl`, not the full pill. */
    border-radius: var(--radius-xl);
    /*
     * Figma's Black-1 (#000101) IS this theme's `background` token — the one
     * stroke on the control, shared verbatim by the divider below so the two
     * can never drift apart.
     */
    border: 1px solid rgb(var(--v-theme-background));
    /*
     * The surface is TWO layers on purpose. The image is the spec's wash,
     * verbatim in tokens: transparent at the trailing edge, gray2 at 16% at
     * the leading one (`270deg` points left, so the opaque stop is the 100%
     * end). Underneath it, `button-gray-w-10` is the visible lightening —
     * the wash alone is near-invisible over the black page, so the base tint
     * is what lifts the pill off it. Keeping the tint on `background-color`
     * (not folded into the shorthand) is also what makes hover a plain
     * animatable background-color step.
     */
    background-image: linear-gradient(
      270deg,
      rgba(var(--v-theme-gray1), 0) 0%,
      rgba(var(--v-theme-gray2), 0.16) 100%
    );
    background-color: rgba(var(--v-theme-button-gray-w-10));
    color: rgba(var(--v-theme-button-white-80));
    /* Lets the fit-content ↔ 100% width change interpolate (Chromium 129+);
       elsewhere the keyword change applies without animation. */
    interpolate-size: allow-keywords;
    /* Surface, ink and WIDTH move as one step. */
    transition:
      background-color 0.18s ease,
      color 0.18s ease,
      width 0.25s ease;
  }

  /* …and the expanded container is the full parent content column. */
  .thought-toggle--expanded {
    width: 100%;
  }

  /*
   * HOVER — the same surface, lifted one ramp step: the base tint goes
   * `button-gray-w-10` → `button-gray-w-20` (the next existing token, so the
   * lift is slight and stays on the DS ladder) and the ink 80% → 100%.
   * Keyed off the HEADER, not the container: pointing at the open reasoning
   * timeline must not light the pill. `:focus-visible` gets the same
   * treatment so keyboard users see the state the pointer does.
   */
  .thought-toggle:has(.thought-toggle__header:hover),
  .thought-toggle:has(.thought-toggle__header:focus-visible) {
    background-color: rgba(var(--v-theme-button-gray-w-20));
    color: rgba(var(--v-theme-button-white-100));
  }

  /* The focus ring is additive — the hover lift alone is not an a11y signal. */
  .thought-toggle:has(.thought-toggle__header:focus-visible) {
    outline: 2px solid rgba(var(--v-theme-button-white-100), 0.3);
    outline-offset: 2px;
  }

  /*
   * The header row: transparent — the CONTAINER owns the chrome — and
   * full-width, so in the expanded state the spacer can push the chevron
   * section to the far right edge.
   */
  .thought-toggle__header {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 12px;
    /* No right padding — the chevron section owns that edge (divider + inset). */
    padding: 6px 0 6px 16px;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    /* The container draws the focus treatment (see :has() above). */
    outline: none;
  }

  .thought-toggle__logo {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .thought-toggle__text {
    /* The label and the value are one sentence — they share a line box, so the
       emphasis on the value cannot shift the baseline. */
    white-space: nowrap;
  }

  .thought-toggle__spacer {
    flex: 1 1 0;
  }

  /*
   * ── THE DIVIDER + RIGHT SECTION ─────────────────────────────────────────
   *
   * The chevron sits in its own section behind a 1px rule in the SAME token
   * as the control's border. "Full inner height" means border to border:
   * `align-self: stretch` only reaches the content box, so the negative
   * vertical margin walks the section back out through the header's 6px
   * padding, and its own padding re-centres the icon. Width comes from this
   * section's `8px | 10px` insets, standing in for the header's old right
   * padding and the flex gap on this side.
   */
  .thought-toggle__chevron-box {
    display: flex;
    align-items: center;
    align-self: stretch;
    margin: -6px 0;
    padding: 0 10px 0 8px;
    border-left: 1px solid rgb(var(--v-theme-background));
  }

  .thought-toggle__chevron {
    flex-shrink: 0;
    /*
     * Rotation only — the icon box is unchanged, so the pill's width and height
     * are identical in both states and nothing around it reflows on toggle.
     */
    transition: transform 0.18s ease;
  }

  .thought-toggle--expanded .thought-toggle__chevron {
    transform: rotate(180deg);
  }

  /*
   * The revealed timeline, inside the same rounded surface. Left inset lines
   * the step dots up under the logo column; the bottom inset gives the last
   * step the same breathing room the header has above.
   */
  .thought-toggle__body {
    padding: 10px 16px 16px;
  }

  /*
   * The header/body rule: full width INSIDE the container (it is a block child,
   * so it spans edge to edge within the border), 1px tall, in the same
   * `background` token the container's border and the chevron divider use —
   * Figma's Black-1. One token for all three, so they can never drift.
   */
  .thought-toggle__rule {
    display: block;
    width: 100%;
    height: 1px;
    background: rgb(var(--v-theme-background));
  }

  @media (prefers-reduced-motion: reduce) {
    .thought-toggle,
    .thought-toggle__chevron { transition: none; }
  }
</style>
