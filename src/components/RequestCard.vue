<!--
  src/components/RequestCard.vue

  A single REQUEST in the assistant conversation — the user's message, on the
  quiet gradient surface from Figma node 1646:118040.

  TEXT ONLY. No avatar, no icon, no leading slot, and no space reserved for
  one: the card is a message and nothing else, so its box is exactly padding +
  text.

  Built on `v-sheet` rather than `v-card` on purpose: this surface has no
  interaction states at all (no hover, no ripple, no active), and `v-sheet` is
  the theme-styled but stateless surface, so there is no built-in overlay to
  suppress. It inherits the DS theme like any Vuetify component.

  ── Tokens, not hexes ──────────────────────────────────────────────────────
  Every value in the Figma spec resolves to something the DS already owns:

    Figma            → this project
    Gray-1 #949B99   → `gray1` — the border stroke (Figma node 1646:118040).
                       ⚠️ NOT `button-black-b-100`: that earlier reading of the
                       node was near-black and simply vanished against the dark
                       surface — a border that renders but cannot be seen.
    Gray-W-0         → `gray1` at 0 alpha (the gradient's transparent end)
    Gray-2 (18%)     → `gray2` at 0.18
    radius 16px      → `--radius-xl` (Vuetify `rounded="xl"`)
    14 / 400 / 20px  → `text-body-medium` — the MD3 step IS 14px, weight 400,
                       line-height 1.4286 × 14 = 20px, in Google Sans Flex.
                       An exact match, so the type is a utility class rather
                       than hand-written font CSS.

  The border is the ONLY stroke: no `border` prop, no elevation, no outline.
  `v-sheet` ships none of those by default (VSheet's `border` default is false)
  and none is added here.

  The only literals are the paddings: 14px / 18px are off the 4px spacing scale,
  so no `pa-*` utility expresses them.

  ⚠️ ONE DELIBERATE DEPARTURE — the text ink. The handoff gives the message
  colour as "White/5". In this project's Figma vocabulary the White ramp is
  opacity (`button-white-5/10/20/60/80/100`), so White/5 reads as white at 5%,
  which is unreadable as body copy on this surface. The ink is therefore left
  to inherit `on-surface` — full-emphasis white, the DS default for body text.
  If the design really does intend 5%, the fix is one declaration on the card:
  `color: rgb(var(--v-theme-button-white-5))`.

  Props:
    message - the request text

  Slots:
    default - the message, when it needs markup rather than a plain string

  Example usage:
    <request-card message="Core, I have a follow-up meeting…" />
-->

<script setup lang="ts">
import AppButton from '@/components/AppButton.vue'

defineProps<{
  /**
   * The request text. A prop rather than a slot for the common case, so the
   * card stays a one-liner at the call site; use the default slot when the
   * message needs markup.
   */
  message?: string
}>()

defineEmits<{
  /** Copy the request — the host owns the clipboard and the confirmation. */
  copy: []
  /** Put the request back into the composer for editing. */
  edit: []
}>()
</script>

<template>
  <!--
    The TURN: the card plus its action row, one hover surface. The row lives
    IN FLOW below the card (never absolutely positioned over it), so the two
    can't overlap — and because both are inside this wrapper, the pointer can
    travel from the card across the gap onto the buttons without the reveal
    state dropping.
  -->
  <div class="request-card-turn">
    <v-sheet class="request-card text-body-medium" rounded="xl">
      <slot>{{ message }}</slot>
    </v-sheet>

    <!--
      ACTIONS — revealed on hovering/focusing anywhere in the turn. The row
      keeps its box at all times (opacity reveal, not display), so appearing
      never shifts the card or its neighbours.
    -->
    <div class="request-card__actions">
      <AppButton
        variant="ghost"
        size="xs"
        icon-only
        aria-label="Copy request"
        @click="$emit('copy')"
      >
        <template #icon><v-icon icon="copy" /></template>
      </AppButton>
      <AppButton
        variant="ghost"
        size="xs"
        icon-only
        aria-label="Edit request"
        @click="$emit('edit')"
      >
        <template #icon><v-icon icon="edit" /></template>
      </AppButton>
    </div>
  </div>
</template>

<style scoped>
.request-card {
  width: 100%;
  /*
   * The measure follows the RAIL's state, not the viewport.
   *
   * `--assistant-card-max-width` is the knob: the default is the sidebar
   * measure, and the fullscreen rule below re-points it. A custom property
   * rather than a second `max-width` declaration so any other host can set its
   * own measure without having to out-specify this component.
   */
  max-width: var(--assistant-card-max-width, 370px);
  align-self: stretch;
  /* Off the 4px spacing scale (Figma), so not expressible as a `pa-*` class. */
  padding: 14px 18px;
  /* The stroke is the ::before pseudo-element's masked gradient — no `border`
     here, so there is exactly one ring, not two. */
  position: relative;
  /*
   * Right-to-left wash: solid-ish at the leading edge, fading out toward the
   * trailing one. `270deg` points left in CSS, which is why the opaque stop is
   * the 100% end.
   */
  /*
   * `--rc-wash` is the animated knob. Transitioning a gradient is not possible,
   * but transitioning the ALPHA inside it is — the same technique the thought
   * toggle uses for its hover lift, via the registered property below.
   */
  --rc-wash: 0.18;
  background: linear-gradient(
    270deg,
    rgba(var(--v-theme-gray1), 0) 0%,
    rgba(var(--v-theme-gray2), var(--rc-wash)) 100%
  );
  transition: --rc-wash 0.18s ease;
  /* Long unbroken tokens wrap instead of widening the card. */
  overflow-wrap: anywhere;
}

/*
 * ── THE GRADIENT BORDER ─────────────────────────────────────────────────
 *
 * The stroke follows the surface wash: solid Gray-1 at the leading (left)
 * edge, fading toward the trailing one — same `270deg` axis as the card's
 * own background, so the two gradients read as one lit edge rather than a
 * frame painted on top.
 *
 * Technique: a pseudo-element painted with the gradient, then hollowed to a
 * 1px ring by the classic two-layer mask — `content-box` keeps the inside,
 * the full-box layer keeps everything, and `exclude`/`xor` subtracts one
 * from the other so only the 1px `padding` band survives. The radius is
 * inherited from the host's `rounded="xl"` (16px), so the ring hugs the
 * corners exactly.
 */
.request-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  /* The ring's thickness — what the mask leaves behind. */
  padding: 1px;
  background: linear-gradient(
    270deg,
    rgba(var(--v-theme-gray1), 0.2) 0%,
    rgb(var(--v-theme-gray1)) 100%
  );
  -webkit-mask:
    linear-gradient(rgb(var(--v-theme-button-white-100)) 0 0) content-box,
    linear-gradient(rgb(var(--v-theme-button-white-100)) 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(rgb(var(--v-theme-button-white-100)) 0 0) content-box,
    linear-gradient(rgb(var(--v-theme-button-white-100)) 0 0);
  mask-composite: exclude;
  /* Decoration only — never intercepts text selection or clicks. */
  pointer-events: none;
}

/* The animatable alpha behind the surface gradient (see `--rc-wash`). */
@property --rc-wash {
  syntax: '<number>';
  inherits: false;
  initial-value: 0.18;
}

/*
 * HOVER — a small lift, not a colour change: the wash goes 0.18 → 0.26 and the
 * actions fade in. Deliberately subtle; the card is a record of what the user
 * said, not a control, so it should acknowledge the pointer without announcing
 * itself.
 */
.request-card:hover,
.request-card:focus-within {
  --rc-wash: 0.26;
}

/*
 * Reserved with OPACITY, never `display` — the buttons keep their box at all
 * times, so revealing them cannot shift the card or its neighbours.
 * `pointer-events` follows visibility so a hidden control cannot be clicked;
 * keyboard focus still reaches them, and `:focus-within` reveals them the
 * moment it does.
 */
/* The turn hugs the card's width, so the right-aligned action row lines up
   with the card's right edge — not the column's. */
.request-card-turn {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  /* Card → actions: the small seam the reveal reaches across. */
  gap: 6px;
  max-width: 100%;
}

/*
 * Reserved with OPACITY, never `display` — the row keeps its box at all
 * times, so revealing it cannot shift the card or its neighbours.
 * `pointer-events` follows visibility so a hidden control cannot be clicked;
 * keyboard focus still reaches them, and `:focus-within` reveals them the
 * moment it does.
 */
.request-card__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.request-card-turn:hover .request-card__actions,
.request-card-turn:focus-within .request-card__actions {
  opacity: 1;
  pointer-events: auto;
}

@media (prefers-reduced-motion: reduce) {
  .request-card,
  .request-card__actions { transition: none; }
}

/*
 * FULLSCREEN ASSISTANT: the wider measure.
 *
 * Keyed off the rail's OWN modifier (`.rail--fullscreen`, set in
 * GraphWorkspace) rather than a viewport breakpoint — the card is narrow
 * because it sits in a sidebar, not because the window is small, and a
 * breakpoint would get those two apart the moment the rail is resized. In a
 * scoped block only the LAST selector is scoped, so this reads the ancestor
 * without needing to own it.
 */
.rail--fullscreen .request-card {
  --assistant-card-max-width: 500px;
}
</style>
