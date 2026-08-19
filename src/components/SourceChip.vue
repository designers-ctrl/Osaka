<!--
  src/components/SourceChip.vue

  A compact "source" pill (Figma "Source Chip", node 1646:96597): which
  connected tool(s) — or which document — a piece of assistant output came
  from. Two visual variants, chosen automatically from the data:

    single   [ ◉ Google Drive ]      one source → its logo + its name
    multi    [ ◉ ◉ ◉  +4 ]           several    → up to `maxVisible` logos,
                                                  the rest folded into +N

  Built on a plain flex container rather than v-chip, per the DS pattern for
  stateless custom surfaces (see TokensBadge / AppTabSegments): the chip has
  no hover/selected states to inherit, and v-chip's fixed heights and overlay
  fight the 2px/6px spec geometry. Hug-content by construction —
  inline-flex, so it never stretches to its container.

  Icons come from the project's ONE source-logo mapping
  (GRAPH_SOURCE_ICONS, the same assets the graph nodes render), resolved by
  source name; a `SourceRef.icon` overrides per entry (that is also how a
  document chip is made — pass `documentIconFor(ext)` from
  src/data/documentIcon.ts). Logos are clipped round, like every source mark
  in the product.

  Props:
    sources    - Array<SourceRef | string>; the chip's data. Strings are
                 shorthand for { name }. 1 entry → single, 2+ → multi.
    label      - single-variant shorthand: explicit label…
    icon       - …and explicit icon URL, matching the Figma "single" API.
                 `label`/`icon` and `sources` are alternatives; when both are
                 given, `label`/`icon` win and force the single variant.
    variant    - 'auto' (default) | 'single' | 'multi' — override only.
    maxVisible - multi variant: logos shown before folding into +N (default 3).

  Example usage:
    <source-chip label="Google Drive" :icon="googleDriveIcon" />
    <source-chip :sources="['Spotify', 'Slack', 'LinkedIn', …]" />
    <source-chip :sources="[{ name: doc.label, icon: documentIconFor(doc.ext) }]" />

  Design (from spec):
  - Container: padding 4px 6px, gap 4px, radius 99px, 1px gray2 border on a
    gray4 ground, twin gray-w-10 inset glints + a soft black drop — every
    color a theme token (the spec's #3E4543 IS gray2, #0C1311 IS gray4,
    rgba(148,155,153,.10) IS button-gray-w-10, and the rgba(0,1,1,.20) drop
    derives from the `background` token).
  - Logos: 16px, round. Label: MD3 label-small, White/80.
-->

<script setup lang="ts">
  import { computed } from 'vue'
  import { GRAPH_SOURCE_ICONS } from '@/data/graph-config'

  export interface SourceRef {
    /** Display name; also the key into the project's source-logo mapping. */
    name: string
    /** Explicit icon URL — overrides (or supplements) the mapping. */
    icon?: string
  }

  export interface Props {
    sources?: Array<SourceRef | string>
    label?: string
    icon?: string
    variant?: 'auto' | 'single' | 'multi'
    maxVisible?: number
  }

  const props = withDefaults(defineProps<Props>(), {
    sources: () => [],
    variant: 'auto',
    maxVisible: 3,
  })

  /** Normalised entries with their icons resolved through the shared mapping. */
  const entries = computed<SourceRef[]>(() => {
    // Explicit label/icon: the Figma "single" API, taking precedence.
    if (props.label) return [{ name: props.label, icon: props.icon }]
    return props.sources.map(s => (typeof s === 'string' ? { name: s } : s))
  })

  const iconFor = (s: SourceRef): string | undefined =>
    s.icon ?? GRAPH_SOURCE_ICONS[s.name]

  const resolvedVariant = computed(() =>
    props.variant !== 'auto' ? props.variant : (entries.value.length > 1 ? 'multi' : 'single'))

  const single = computed(() => entries.value[0])
  const visible = computed(() => entries.value.slice(0, props.maxVisible))
  const overflow = computed(() => Math.max(0, entries.value.length - props.maxVisible))

  /** The chip is informational, so the full source list goes to AT even when
      the multi variant shows only logos. */
  const chipLabel = computed(() => {
    const names = entries.value.map(e => e.name)
    if (names.length <= 1) return names[0] ?? ''
    return `Sources: ${names.join(', ')}`
  })
</script>

<template>
  <span class="source-chip" :aria-label="chipLabel" :title="chipLabel">
    <template v-if="resolvedVariant === 'single' && single">
      <img
        v-if="iconFor(single)"
        class="source-chip__logo"
        :src="iconFor(single)"
        alt=""
        aria-hidden="true"
      >
      <span class="source-chip__label text-label-small">{{ single.name }}</span>
    </template>

    <template v-else>
      <span class="source-chip__stack" aria-hidden="true">
        <img
          v-for="s in visible"
          :key="s.name"
          class="source-chip__logo"
          :src="iconFor(s)"
          alt=""
        >
      </span>
      <span v-if="overflow" class="source-chip__label text-label-small" aria-hidden="true">
        +{{ overflow }}
      </span>
    </template>
  </span>
</template>

<style scoped>
  .source-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    border-radius: 99px;
    border: 1px solid rgb(var(--v-theme-gray2));
    background: rgb(var(--v-theme-gray4));
    /* Twin inner glints + soft drop, per spec — alpha tokens carry their own
       alpha, the drop derives from the page-black `background` token. */
    box-shadow:
      0 -1px 4px 0 rgba(var(--v-theme-button-gray-w-10)) inset,
      0 2px 4px 0 rgba(var(--v-theme-button-gray-w-10)) inset,
      0 1px 2px 0 rgba(var(--v-theme-background), 0.2);
  }

  .source-chip__logo {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    border-radius: 50%; /* source tiles are full-bleed squares; the product clips them round */
    display: block;
  }

  /* Multi variant: logos in a tighter run than the chip's own 4px gap. */
  .source-chip__stack {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .source-chip__label {
    color: rgba(var(--v-theme-button-white-80));
    white-space: nowrap;
  }
</style>
