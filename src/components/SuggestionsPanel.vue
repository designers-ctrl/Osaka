<!--
  src/components/SuggestionsPanel.vue

  The assistant composer's nested shell (Figma refs: composer node 1105:146056
  + the container-in-container revision): a dark OUTER container that owns the
  suggestions tab and the expanding suggestion list, wrapping a gold-bordered
  INNER container that receives the composer content through the default slot.
  Composer logic (draft, send, mic, attach) stays in the screen — this
  component is shell + suggestions only, so the two can evolve independently.

  Structure:
  - Level 1 `.suggestions` — 24px-radius dark shell: gray2→black-b-80 radial
    gradient under a decorative pattern.svg layer (clipped by the radius,
    click-through, behind everything), gray-w inset highlights, 2px black
    border, blur(4px).
  - The tab toggles the panel; the list expands DOWNWARD inside this outer
    shell (between tab and inner container), never as a detached surface.
  - Level 2 `.suggestions__inner` — 16px-radius container, 1px warm accent
    border (accent-1 IS dark-theme primary) with a slow primary-color shimmer
    orbiting the border ring via an animated conic gradient on a masked
    pseudo-element. Border only — the fill is never tinted or animated, and
    the base warm border stays put. Honors prefers-reduced-motion.
  - Rows: custom-state buttons (left icon → text → chevron). The warm accent
    background and the right chevron are hover/:focus-visible states of each
    row — nothing stays highlighted by default, and the chevron reveals via
    opacity so the row never shifts.

  Props:
    suggestions - SuggestionRow[]: { id, icon (semantic key from
                  src/icons/carbon.ts), text }

  Slots:
    default - the composer content, rendered inside the Level-2 container
    icon    - the 16×16 mark on the tab. Defaults to the bespoke spark SVG
              from the Figma spec (inline, with its own warm #F2C585 fills).

  Events:
    select - a suggestion row was clicked (payload: its id)

  Example usage:
    <suggestions-panel :suggestions="data.composer.suggestions" @select="apply">
      <v-textarea … /> <div class="d-flex w-100">…actions…</div>
    </suggestions-panel>
-->

<script setup lang="ts">
  import patternUrl from '@/assets/pattern.svg'

  export interface SuggestionRow {
    id: string
    /** Semantic key from src/icons/carbon.ts. */
    icon: string
    text: string
  }

  const props = defineProps<{ suggestions: SuggestionRow[] }>()

  const emit = defineEmits<{
    select: [id: string]
  }>()

  /**
   * Open state. `defineModel` so a host can close the panel when its own flow
   * says so — sending a message, for instance — while the panel still manages
   * itself when nobody binds it.
   */
  const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <div class="suggestions">
    <!-- Decorative pattern over the radial gradient — clipped, click-through. -->
    <div
      class="suggestions__pattern"
      :style="{ backgroundImage: `url(${patternUrl})` }"
      aria-hidden="true"
    />

    <button
      type="button"
      class="suggestions__tab"
      :aria-expanded="open"
      @click="open = !open"
    >
      <slot name="icon">
        <!-- The bespoke 16×16 spark mark from the Figma spec — its warm
             #F2C585 fills are part of the asset, not themed CSS. -->
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <g clip-path="url(#clip0_2461_7366)">
            <path d="M12.7022 2.35693C11.5888 1.43026 10.2088 0.823594 8.68215 0.683594V2.02359C9.83548 2.15026 10.8888 2.61026 11.7555 3.30359L12.7022 2.35693Z" fill="#F2C585" />
            <path d="M7.34882 2.02359V0.683594C5.82215 0.816927 4.44215 1.43026 3.32882 2.35693L4.27548 3.30359C5.14215 2.61026 6.19548 2.15026 7.34882 2.02359Z" fill="#F2C585" />
            <path d="M3.33548 4.24359L2.38882 3.29693C1.46215 4.41026 0.855484 5.79026 0.715484 7.31693H2.05548C2.18215 6.16359 2.64215 5.11026 3.33548 4.24359Z" fill="#F2C585" />
            <path d="M13.9755 7.31693H15.3155C15.1755 5.79026 14.5688 4.41026 13.6422 3.29693L12.6955 4.24359C13.3888 5.11026 13.8488 6.16359 13.9755 7.31693Z" fill="#F2C585" />
            <path d="M4.68215 7.98359L6.97548 9.02359L8.01548 11.3169L9.05549 9.02359L11.3488 7.98359L9.05549 6.94359L8.01548 4.65026L6.97548 6.94359L4.68215 7.98359Z" fill="#F2C585" />
            <path d="M15.2994 8.70287C15.1246 10.5187 14.2793 12.2041 12.9285 13.4302C11.5777 14.6562 9.81845 15.3347 7.99424 15.3333C6.17003 15.3319 4.41183 14.6507 3.06293 13.4226C1.71403 12.1945 0.871278 10.5078 0.699219 8.69168L2.03838 8.56481C2.17888 10.0478 2.86705 11.4251 3.96852 12.4279C5.06999 13.4307 6.50568 13.987 7.99527 13.9882C9.48486 13.9893 10.9214 13.4352 12.0244 12.4341C13.1274 11.433 13.8177 10.0567 13.9605 8.57394L15.2994 8.70287Z" fill="#F2C585" />
          </g>
          <defs>
            <clipPath id="clip0_2461_7366">
              <rect width="16" height="16" fill="white" />
            </clipPath>
          </defs>
        </svg>
      </slot>
      <span class="text-body-small">{{ props.suggestions.length }} Suggestions</span>
      <v-icon
        icon="chevronDown"
        size="16"
        class="suggestions__chevron"
        :class="{ 'suggestions__chevron--open': open }"
      />
    </button>

    <v-expand-transition>
      <div v-show="open" class="suggestions__body">
        <ul class="suggestions__list ma-0 d-flex flex-column">
          <li v-for="s in props.suggestions" :key="s.id" class="d-flex">
            <button
              type="button"
              class="suggestions__row flex-grow-1"
              @click="emit('select', s.id)"
            >
              <v-icon :icon="s.icon" size="16" />
              <span class="text-body-medium flex-grow-1 text-left">{{ s.text }}</span>
              <!-- Always in the layout; revealed by opacity so the row never shifts. -->
              <v-icon icon="chevronRight" size="16" class="suggestions__row-chevron" />
            </button>
          </li>
        </ul>
      </div>
    </v-expand-transition>

    <!-- Level 2: the composer surface, gold-ringed, shimmer on the ring only. -->
    <div class="suggestions__inner">
      <slot />
    </div>
  </div>
</template>

<style scoped>
  /*
   * Level 1 (Figma spec → tokens): #3E4543 IS gray2; the 24px radius is the
   * shared 2xl step; the inset highlights are gray-w-20/40. The Figma blacks
   * (solid #000 border, rgba(0,1,1,.80) gradient stop) have no theme token —
   * written literally in the Figma's own 0,1,1 black family, same base as the
   * button-black-b-* tokens.
   */
  /*
   * No overflow:hidden here — it clipped the send button's glow inside the
   * slot. The rounded look survives without it: the gradient, border and
   * inset shadows all clip to the radius natively, and the pattern layer
   * (the one child that would bleed) rounds ITSELF below.
   */
  .suggestions {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    /* The tab hangs OUTSIDE the top edge now (translateY(-100%)), so the
       shell keeps the plain 12px frame from the Figma spec. */
    padding: 12px;
    align-self: stretch;
    border-radius: var(--radius-2xl);
    border: 2px solid rgb(0, 1, 1);
    background: radial-gradient(
      40.85% 66.21% at 25.22% 27.57%,
      rgb(var(--v-theme-gray2)) 22.6%,
      rgba(0, 1, 1, 0.80) 100%
    );
    box-shadow:
      0 -5px 4px 0 rgba(var(--v-theme-button-gray-w-20)) inset,
      0 4px 4px 0 rgba(var(--v-theme-button-gray-w-40)) inset;
    backdrop-filter: blur(4px);
  }

  /* Behind everything, click-through; self-clipped to the shell's radius
     (minus the 2px border it sits inside) since the shell no longer hides
     overflow. */
  .suggestions__pattern {
    position: absolute;
    inset: 0;
    z-index: 0;
    border-radius: calc(var(--radius-2xl) - 2px);
    background-repeat: repeat;
    background-position: center;
    pointer-events: none;
  }

  /* Everything else paints above the pattern layer. (The tab is excluded —
     it carries its own absolute positioning and z-index below.) */
  .suggestions > :not(.suggestions__pattern, .suggestions__tab) {
    position: relative;
    z-index: 1;
  }

  /*
   * The tab (Figma spec → tokens): #3E4543→#1B2220 IS gray2→gray3, the inset
   * highlights are gray-w-20/40, the outer glow black-b-40.
   */
  .suggestions__tab {
    /* Anchored to the shell (position:relative parent) but hanging ABOVE its
       top-left edge: translateY(-100%) lifts it fully outside the bounds, so
       it consumes no layout space and never moves when the list expands.
       Nothing clips it — the shell has no overflow:hidden (only the pattern
       layer self-clips). */
    position: absolute;
    top: 0;
    /* 24px in from the shell's left edge, matching the composer's own inset. */
    left: 24px;
    transform: translateY(-100%);
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 8px 12px;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    background: linear-gradient(
      180deg,
      rgb(var(--v-theme-gray2)) 0%,
      rgb(var(--v-theme-gray3)) 100%
    );
    box-shadow:
      0 -5px 4px 0 rgba(var(--v-theme-button-gray-w-20)) inset,
      0 4px 4px 0 rgba(var(--v-theme-button-gray-w-40)) inset,
      0 0 12px 0 rgba(var(--v-theme-button-black-b-40));
    backdrop-filter: blur(12px);
    color: rgba(var(--v-theme-button-white-80));
    transition: color 0.15s ease;
  }

  .suggestions__tab:hover,
  .suggestions__tab:focus-visible {
    color: rgb(var(--v-theme-button-white-100));
  }

  .suggestions__tab:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
  }

  .suggestions__chevron {
    transition: transform 0.15s ease;
  }

  .suggestions__chevron--open {
    transform: rotate(180deg);
  }

  /* The expanded list: a quiet surface INSIDE the outer shell. */
  .suggestions__body {
    width: 100%;
    border-radius: var(--radius-lg);
    background: linear-gradient(
      180deg,
      rgb(var(--v-theme-gray3)) 0%,
      rgb(var(--v-theme-gray4)) 100%
    );
  }

  /* Explicit reset — without it the native <ul> padding indents the rows. */
  .suggestions__list {
    list-style: none;
    padding: 0;
    margin: 0;
    width: 100%;
  }

  /* Rows: custom state, so hover is paired with :focus-visible by hand. */
  .suggestions__row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    cursor: pointer;
    color: rgba(var(--v-theme-button-white-80));
    transition: color 0.15s ease, background-color 0.15s ease;
  }

  /* The warm accent treatment lives on hover/focus only — no row keeps it. */
  .suggestions__row:hover,
  .suggestions__row:focus-visible {
    color: rgb(var(--v-theme-button-outlined-accent-1));
    background: rgba(var(--v-theme-button-outlined-accent-1), 0.10);
  }

  .suggestions__row:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
  }

  /* Chevron: space reserved, revealed per-row on hover/keyboard focus. */
  .suggestions__row-chevron {
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .suggestions__row:hover .suggestions__row-chevron,
  .suggestions__row:focus-visible .suggestions__row-chevron {
    opacity: 1;
  }

  /*
   * Level 2: the composer surface. The 16px radius is the shared xl step,
   * the 1px warm border is accent-1, the halo gray-w-20. No background of
   * its own — the outer shell's gradient + pattern read through it.
   */
  .suggestions__inner {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: flex-start;
    gap: 16px;
    /* Even on all four sides, so the draft sits the same distance from the top
       edge as the actions do from the bottom, at every composer height. */
    padding: 8px;
    align-self: stretch;
    border-radius: var(--radius-xl);
    border: 1px solid rgb(var(--v-theme-button-outlined-accent-1));
    box-shadow: 0 0 8px 0 rgba(var(--v-theme-button-gray-w-20));
    backdrop-filter: blur(4px);
  }

  /*
   * The shimmer: a short bright arc of the primary token orbiting the border
   * ring. A masked pseudo-element the size of the border (inset -1px,
   * padding 1px, mask-composite exclude — the AppButton ring technique)
   * carries a conic gradient whose start angle is animated via a registered
   * custom property, so ONLY the perimeter moves; the fill is never touched
   * and the base warm border stays underneath. Slow on purpose.
   */
  .suggestions__inner::after {
    content: '';
    position: absolute;
    inset: -1px;
    padding: 1px;
    border-radius: inherit;
    background: conic-gradient(
      from var(--shimmer-angle),
      transparent 0deg,
      rgba(var(--v-theme-primary), 0.9) 25deg,
      transparent 55deg
    );
    pointer-events: none;
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask-composite: exclude;
    animation: shimmer-orbit 7s linear infinite;
  }

  /* Registered so the conic start angle interpolates (no @property support
     simply leaves the arc parked — a static highlight, never broken). */
  @property --shimmer-angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
  }

  @keyframes shimmer-orbit {
    to { --shimmer-angle: 360deg; }
  }

  /* .suggestions__inner is the ::after's containing block. */
  .suggestions__inner { position: relative; }

  @media (prefers-reduced-motion: reduce) {
    .suggestions__chevron { transition: none; }
    .suggestions__inner::after { animation: none; }
  }
</style>
