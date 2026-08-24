<!--
  src/components/AssistantAccordion.vue

  The assistant's reasoning-step accordion (Figma node 1074:158467): a
  question/step header on a vertical timeline rail, expanding into the nested
  sub-steps that produced it — each with its own dot, a dashed connector off
  the main rail, text, and optional source/document chips.

      ● │  What verified signals demonstrate…      ▸        (collapsed)

      ◉ │  What verified signals demonstrate…      ▴        (expanded)
        ├·· ● Found 6 triples and 18 chunks
        │      [Google Drive] [Gmail] [◉◉◉ +4]
        ├·· ● Checking if retrieved info is sufficient…
        └·· ● Existing information is sufficient…

  This matters here because reasoning steps are MODEL OUTPUT (see the domain
  rules): the accordion is the "explain yourself" surface, so it renders
  whatever provenance the data carries — SourceChip entries reuse the same
  component and the same source-logo mapping as everything else.

  Data-driven and content-free: everything comes from `title` + `items`.

  Props:
    title - the header question/step text
    items - AssistantAccordionItem[]:
      text      - the sub-step's text (required)
      sources   - Array<SourceRef | string> → ONE SourceChip (auto variant)
      chips     - Array<Array<SourceRef | string>> → one SourceChip per entry,
                  for rows mixing singles and a folded multi like the reference
      document  - { name, ext? } → a single-variant SourceChip carrying the
                  project's per-extension document icon (documentIconFor)

  Slots:
    item-append({ item, index }) - arbitrary extra content under an item,
                                   below its built-in chips

  v-model (optional) - expansion state; uncontrolled when unbound.

  Example usage:
    <assistant-accordion :title="step.title" :items="step.items" />

  Design (from spec):
  - Header dot 8×8: radial white glint (24% core → 3% rim) over gray2;
    expanded state adds the outlined ring. Row is a real <button>.
  - Main rail: 0.5px SOLID vertical rule in gray-w-80, on the dot's centre
    line. Runs from the dot, through any expanded items, and on across the
    stack gap into the next accordion's dot — so a column of collapsed
    accordions still reads as one connected timeline. Never drawn below the
    last accordion.
  - Child connectors: DOTTED stubs + dots (radial-gradient tiles), per the
    screenshot — deliberately not a continuous solid line.
  - Caret: the existing Carbon caret (16px), rotated to ▴ when open.
  - Open/close animated via v-expand-transition (the DS-shipped primitive).
-->

<script setup lang="ts">
  import { computed } from 'vue'
import SourceChip, { type SourceRef } from '@/components/SourceChip.vue'
  import { documentIconFor } from '@/data/documentIcon'

  export interface AssistantAccordionItem {
    text: string
    /** One chip, single/multi resolved automatically from the count. */
    sources?: Array<SourceRef | string>
    /** Several chips on one row — each entry is one SourceChip's data. */
    chips?: Array<Array<SourceRef | string>>
    /** A document chip: the shared document icon, recoloured for `ext`. */
    document?: { name: string, ext?: string }
  }


  export interface Props {
    title: string
    items?: AssistantAccordionItem[]
  }

  const props = withDefaults(defineProps<Props>(), {
    items: () => [],
  })

  /** Expansion state — bindable, but self-managed when the parent doesn't. */
  const open = defineModel<boolean>({ default: false })

  /**
   * No items = a STATUS LINE, not a disclosure: no chevron, no button, no
   * click. This is what renders "Processing question", "Decomposed into 3
   * sub-questions:" and "Finished" as plain step labels — a chevron on a step
   * that discloses nothing would be a control that does nothing.
   */
  const hasItems = computed(() => (props.items?.length ?? 0) > 0)


  const documentRef = (doc: { name: string, ext?: string }): SourceRef[] =>
    [{ name: doc.name, icon: documentIconFor(doc.ext) }]
</script>

<template>
  <div class="assistant-accordion" :class="{ 'assistant-accordion--open': open }">
    <!--
      A step with NO items is a STATUS LINE — "Processing question", "Finished".
      It renders as a plain row: same dot, same connector, same type, but no
      caret and no button semantics, because there is nothing to disclose and a
      control that does nothing is worse than no control.
    -->
    <component
      :is="hasItems ? 'button' : 'div'"
      v-bind="hasItems ? { type: 'button', 'aria-expanded': open } : {}"
      class="assistant-accordion__header"
      :class="{ 'assistant-accordion__header--static': !hasItems }"
      @click="hasItems && (open = !open)"
    >
      <span class="assistant-accordion__dot" aria-hidden="true" />
      <span class="assistant-accordion__title text-body-small">{{ title }}</span>
      <v-icon v-if="hasItems" class="assistant-accordion__caret" icon="caretRight" size="16" />
    </component>

    <v-expand-transition>
      <div v-show="open">
        <ol v-if="items.length" class="assistant-accordion__items">
          <li
            v-for="(item, index) in items"
            :key="index"
            class="assistant-accordion__item"
          >
            <span class="assistant-accordion__item-dot" aria-hidden="true" />
            <div class="assistant-accordion__item-body">
              <div class="text-body-small assistant-accordion__item-text">{{ item.text }}</div>
              <div
                v-if="item.document || item.sources?.length || item.chips?.length"
                class="assistant-accordion__chips"
              >
                <source-chip v-if="item.document" :sources="documentRef(item.document)" />
                <source-chip v-if="item.sources?.length" :sources="item.sources" />
                <source-chip
                  v-for="(chip, c) in item.chips"
                  :key="c"
                  :sources="chip"
                />
              </div>
              <slot name="item-append" :item="item" :index="index" />
            </div>
          </li>
        </ol>

      </div>
    </v-expand-transition>
  </div>
</template>

<style scoped>
  /*
   * Geometry, one source each: the rail is centred under the 8px header dot,
   * and every child hangs off it. Colors are theme tokens throughout — the
   * spec's gray values ARE gray2 / gray-w-80 / white alphas.
   */
  .assistant-accordion {
    --aa-dot: 8px;
    --aa-rail-x: calc(var(--aa-dot) / 2); /* rail sits on the dot's centre */
    /*
     * The header row's height, pinned rather than left to the line box: the
     * connector geometry below is derived from it, so it has to be a number the
     * CSS knows. Matches the natural height of a one-line `text-body-small`.
     */
    --aa-header-h: 16px;
    /*
     * The nested item dot's geometry — the vertical item connector is derived
     * from these, so the line and the dot cannot drift apart.
     */
    --aa-item-dot: 5px;
    --aa-item-dot-x: 17px; /* the dot's left edge inside the item */
    --aa-item-dot-top: 6px; /* its top, level with the first text line */
    --aa-items-gap: 16px; /* the gap .assistant-accordion__items stacks with */
    /*
     * Stroke width of the item's own connector — the dotted rule down its left
     * edge, which is the only border-like line the item carries. 1.5px: the
     * dots' radius, so the line reads heavier without changing its colour, its
     * pitch, or where it sits relative to the dot.
     */
    --aa-item-line: 1.5px;
    /*
     * The gap the HOST stacks accordions with — the distance the connector has
     * to cross to reach the next dot. 16px matches the `ga-4` the assistant
     * surfaces use; a host stacking them differently sets this to its own gap.
     */
    --aa-stack-gap: 16px;
    /*
     * Both connector runs, derived once so they cannot drift:
     *   start — the dot's BOTTOM edge (header centre + half the dot)
     *   bridge — this box's bottom to the next dot's TOP edge
     * Deriving from the dot rather than guessing an offset is what keeps the
     * line on the dot's centre line at every state.
     */
    --aa-rail-start: calc((var(--aa-header-h) + var(--aa-dot)) / 2);
    --aa-bridge-h: calc(var(--aa-stack-gap) + (var(--aa-header-h) - var(--aa-dot)) / 2);
    /*
     * State-scoped emphasis, one knob each. COLLAPSED is the dimmed baseline:
     * text/marks at white-80, connectors at gray-w-80 — exactly the values the
     * rules below used to hardcode. The `--open` override brightens both, so
     * every consumer (title, caret, dots, rail, bridge, dotted stubs, dot
     * ring) follows the state without per-rule duplicates.
     */
    --aa-ink: rgba(var(--v-theme-button-white-80));
    --aa-line: rgba(var(--v-theme-button-gray-w-80));
    position: relative;
  }

  /* EXPANDED: lift the whole hierarchy — near-white ink, brighter lines. */
  .assistant-accordion--open {
    --aa-ink: rgba(var(--v-theme-button-white-100));
    --aa-line: rgba(var(--v-theme-button-white-60));
  }

  /*
   * ── THE MAIN CONNECTOR — solid, dot to dot ─────────────────────────────
   *
   * Drawn in TWO runs because it has to survive two different situations, and
   * one rule cannot do both:
   *
   *   ::before  the run INSIDE this accordion — from the dot down through the
   *             expanded items to the bottom of the box. When collapsed the box
   *             is only the header, so this is a few px; that is correct, the
   *             bridge carries on from there.
   *   ::after   the run ACROSS the stack gap to the next accordion's dot. This
   *             is the piece that was missing: the old single rule ran
   *             `top: 16px; bottom: 0` on a 16px-tall collapsed box, which
   *             computes to ZERO height — which is why a collapsed accordion
   *             showed no connector at all and nothing ever reached its
   *             neighbour.
   *
   * Both are centred with `translateX(-50%)` on the dot's own centre line, so
   * the alignment is exact rather than off by half the stroke.
   */
  .assistant-accordion::before {
    content: '';
    position: absolute;
    left: var(--aa-rail-x);
    transform: translateX(-50%);
    top: var(--aa-rail-start);
    bottom: 0;
    width: 0.5px;
    background: var(--aa-line);
  }

  /*
   * LAST and COLLAPSED: nothing below to connect to, and no children to connect
   * down into — so the few px of rail under the dot is a dangling tick rather
   * than a connector. Expanded is different: the rail is what its children hang
   * off, so it stays. This is also what makes a LONE accordion draw no
   * connector at all.
   */
  .assistant-accordion:last-child:not(.assistant-accordion--open)::before {
    content: none;
  }

  /*
   * The bridge to the NEXT accordion. Suppressed on the last one — there is
   * nothing below it to connect to — which also means a lone accordion draws no
   * connector at all, satisfying "only with 2+ items" without needing to count
   * them. Anchored to `top: 100%`, so it tracks the box as it expands and
   * collapses instead of being positioned from a fixed offset.
   */
  .assistant-accordion:not(:last-child)::after {
    content: '';
    position: absolute;
    left: var(--aa-rail-x);
    transform: translateX(-50%);
    top: 100%;
    height: var(--aa-bridge-h);
    width: 0.5px;
    background: var(--aa-line);
  }

  /* ── Header ─────────────────────────────────────────────────────────── */
  .assistant-accordion__header {
    /*
     * inline-flex + fit-content: the row HUGS its content, so the triangle sits
     * immediately after the title instead of being pushed to the far edge. The
     * old `display: flex; width: 100%` with a growing title was what created
     * that gap — no spacer or `justify-content` was ever involved, and none is
     * needed now. `max-width` keeps a long title inside the rail, where it
     * wraps as before.
     */
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    /*
     * flex-start, not center: the dot marks the step, so it belongs on the
     * FIRST line of the title. Centring moved it down as soon as a title
     * wrapped — and with it the connector, which is derived from where the dot
     * sits. With a one-line title the two are identical, so nothing about the
     * current design changes.
     */
    align-items: flex-start;
    min-height: var(--aa-header-h);
    /*
     * No shared `gap` here: the row's two gaps are different sizes. A single
     * `gap` would apply the same value on both sides of the title, so the
     * spacing is set per element instead — the dot keeps its 10px, the caret
     * takes 16px, and neither can move the other.
     */
    padding: 0;
    text-align: left;
    color: inherit;
    cursor: pointer;
    /* A real <button> for keyboard/AT — but visually a plain row: without
       these two the user-agent button chrome paints a gray pill behind the
       header (Vuetify's reset does not clear it in this standalone app). */
    background: transparent;
    border: none;
  }

  /* A status line is not interactive — no pointer, no hover affordance. */
  .assistant-accordion__header--static {
    cursor: default;
  }

  .assistant-accordion__header:focus-visible {
    outline: 2px solid rgba(var(--v-theme-button-white-100), 0.3);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .assistant-accordion__dot {
    width: var(--aa-dot);
    height: var(--aa-dot);
    aspect-ratio: 1 / 1;
    flex-shrink: 0;
    /* Centres the dot on the first text line — the position --aa-rail-start
       assumes, and the reason the connector meets it exactly. */
    margin-top: calc((var(--aa-header-h) - var(--aa-dot)) / 2);
    border-radius: 50%;
    /* Radial glint over the gray2 ground, per spec. */
    background:
      radial-gradient(
        50% 50% at 50% 50%,
        rgba(var(--v-theme-button-white-100), 0.24) 50%,
        rgba(var(--v-theme-button-white-100), 0.03) 50%
      ),
      rgb(var(--v-theme-gray2));
  }

  /* Expanded: the outlined/active dot — a ring with a lit core.
     `> header` scoping, not a bare descendant: with NESTED accordions an open
     parent must not light its closed children's dots. */
  .assistant-accordion--open > .assistant-accordion__header .assistant-accordion__dot {
    background:
      radial-gradient(
        50% 50% at 50% 50%,
        rgba(var(--v-theme-button-white-100), 0.6) 50%,
        rgba(var(--v-theme-button-white-100), 0.08) 50%
      ),
      rgb(var(--v-theme-gray2));
    box-shadow: 0 0 0 1px var(--aa-line);
  }

  .assistant-accordion__title {
    /*
     * Hug the text — no grow. Growing is what pushed the triangle to the far
     * right; the title now ends where its words end and the caret follows it.
     */
    flex: 0 1 auto;
    min-width: 0;
    /* The dot → title gap the shared `gap: 10px` used to provide. */
    margin-left: 10px;
    color: var(--aa-ink);
  }

  .assistant-accordion__caret {
    flex-shrink: 0;
    /* Stays on the first line with the dot, now the row aligns to flex-start. */
    align-self: flex-start;
    /* Title → triangle: exactly 16px, independent of the dot's 10px. */
    margin-left: 16px;
    color: var(--aa-ink);
    transition: transform 0.2s ease;
  }

  /* ▸ collapsed → ▴ expanded — own header only (see the dot rule above). */
  .assistant-accordion--open > .assistant-accordion__header .assistant-accordion__caret {
    transform: rotate(-90deg);
  }

  /* ── Children ───────────────────────────────────────────────────────── */
  .assistant-accordion__items {
    list-style: none;
    margin: 0;
    padding: 12px 0 0;
    display: flex;
    flex-direction: column;
    gap: var(--aa-items-gap);
  }

  .assistant-accordion__item {
    position: relative;
    /* Room for the dotted stub + item dot hanging off the rail. */
    padding-left: 28px;
    display: flex;
    flex-direction: column;
  }

  /*
   * ── THE ITEM CONNECTOR — vertical, dot to dot ───────────────────────────
   *
   * Was a HORIZONTAL stub reaching from the main rail across to the item dot;
   * the reference runs the dotted line DOWNWARD instead, from each dot through
   * its own content to the next dot. Same round-dot tile, transposed: the
   * gradient repeats along Y (`background-size` swapped, `repeat-y`), so
   * nothing about the dotted style changes — only the axis it runs on.
   *
   * Two runs, for the same reason the main rail needs two: `::before` covers
   * this item's own height (which varies with its chips and wrapped text), and
   * `::after` crosses the fixed gap to the next item's dot. Explicit vertical
   * geometry throughout — a narrow width, a controlled height, no border-top —
   * so no flex context can lay it out horizontally.
   */
  .assistant-accordion__item::before {
    content: '';
    position: absolute;
    /* Dead centre of the dot, in both runs. */
    left: calc(var(--aa-item-dot-x) + var(--aa-item-dot) / 2);
    transform: translateX(-50%);
    /* Starts at the dot's BOTTOM edge, so the dot reads as the node. */
    top: calc(var(--aa-item-dot-top) + var(--aa-item-dot));
    bottom: 0;
    width: 1.5px; /* thinner connector; the tile below matches so dots stay centred */
    background-image: radial-gradient(
      circle,
      var(--aa-line) var(--aa-item-line) ,
      transparent calc(var(--aa-item-line) + 0.2px)
    );
    background-size: 1.5px 5px;
    background-repeat: repeat-y;
  }

  /* The bridge across the stack gap to the NEXT item's dot. */
  .assistant-accordion__item:not(:last-child)::after {
    content: '';
    position: absolute;
    left: calc(var(--aa-item-dot-x) + var(--aa-item-dot) / 2);
    transform: translateX(-50%);
    top: 100%;
    height: calc(var(--aa-items-gap) + var(--aa-item-dot-top));
    /* Matches ::before — otherwise the run would visibly widen across gaps. */
    width: 1.5px;
    background-image: radial-gradient(
      circle,
      var(--aa-line) var(--aa-item-line) ,
      transparent calc(var(--aa-item-line) + 0.2px)
    );
    background-size: 1.5px 5px;
    background-repeat: repeat-y;
  }

  /* Nothing below the last item to connect to — no dangling tail. */
  .assistant-accordion__item:last-child::before {
    content: none;
  }

  .assistant-accordion__item-dot {
    position: absolute;
    left: var(--aa-item-dot-x);
    top: var(--aa-item-dot-top);
    width: var(--aa-item-dot);
    height: var(--aa-item-dot);
    border-radius: 50%;
    background: var(--aa-ink);
  }

  .assistant-accordion__item-text {
    color: var(--aa-ink);
  }

  /* Nested sub-accordions: the items' indent, the accordions' stack gap. */
  .assistant-accordion__chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  }

  @media (prefers-reduced-motion: reduce) {
    .assistant-accordion__caret { transition: none; }
  }
</style>
