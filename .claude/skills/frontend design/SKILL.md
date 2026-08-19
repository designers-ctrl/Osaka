---
name: frontend-design
description: >-
  Design-TIME composition and UX-copy judgment for building or reshaping a screen so it reads as
  deliberate, not templated. Use when designing a NEW screen, reworking a layout, improving
  hierarchy / visual rhythm / structure, deciding what leads a screen, making a screen "less
  generic," or writing interface copy (labels, empty states, error messages). Works WITHIN the
  design system: defers to vuetify-ds for every color/type/radius/spacing/component and never
  invents a palette, font pairing, or hand-rolled CSS. NOT the styling/token config (that's
  vuetify-ds) and NOT the accessibility/correctness audit of finished code (that's
  web-design-guidelines).
---

# Frontend Design

Guidance for making a screen feel **intentional and specific to its job**, not like the generic
answer you'd produce for any dashboard. This is taste and composition — the *arrangement* of the
DS's parts — not the parts themselves.

## ⛔ This skill works inside the design system

Before any of the judgment below, the non-negotiable constraint:

- **Color, type, radius, spacing, and component choice come from `vuetify-ds`** — theme tokens in
  `vuetify.ts`, the Google Sans Flex MD3 type scale, the shared radius/spacing scales, and Vuetify
  components.
  **Never invent a hex palette, pair custom fonts, or hand-roll CSS** for something the DS or a
  Vuetify component already provides. If a screen needs a new color or shape, that's a DS change
  (via `new-project` / `vuetify.ts`), not a per-screen decision.
- Your freedom is in **composition** — what leads, how information is structured, what the one
  memorable element is, and how the copy reads. Spend it there, not on restyling tokens.
- Consistency, clarity, and calm beat novelty. Distinctiveness must never cost legibility,
  accessible states, or predictable behavior. Don't fabricate domain data to make a layout look
  good — use clearly-synthetic placeholders (all figures in this app are synthetic).
- **Check the domain before you design.** This codebase is a template; `CLAUDE.md` names the
  product's domain and any rules that come with it. If it still reads `{{PROJECT_DOMAIN}}`, the
  project is unconfigured — ask what the product is rather than inventing a subject.

## Osaka graph-design constraints

- **Graph connection geometry:** Connection lines must always be straight, single-segment lines
  between their resolved endpoints. Do not use Bézier curves, edge bundling, splines, elbows,
  polylines, or decorative curvature unless the designer explicitly overrides this rule.
  This binds every graph surface — the D3 network graph (both layout modes, including the
  Unstructured cluster drill-down layer in `src/components/graphs/expanded/`), and any future
  relationship visualization. When many straight lines overlap, fix readability with node
  positioning, opacity, relationship filtering, hover isolation, and layering — never by curving
  the lines. Lines terminate at the visible node/region boundary (trimmed), not at the centers.

### Unstructured layout invariants

Reusable rules the Unstructured graph's layout must uphold — design to them, don't re-derive them
per screenshot. Implementation notes live in `docs/architecture/CLUSTER_DRILLDOWN.md` and
`src/components/graphs/useD3Force.ts`.

1. **Links are always straight** (the geometry rule above). Because lines can't route around
   things, the LAYOUT does the work:
2. **Nodes move to protect line-of-sight** — when a line would be unreadable, move nodes
   (forces, spacing, dimming), never bend the line.
3. **Source clusters use orbital positioning** — a hub's clusters sit in even angular slots on a
   consistent orbit around their Source (`forceClusterOrbit`); neighborhoods read as radial fans.
4. **Externally connected Cluster nodes face their target/Insight** — a cluster with an outward
   relationship should sit on its orbit toward the thing it connects to, so its line leaves the
   neighborhood cleanly instead of crossing siblings.
5. **Multi-group Insights pull their related groups closer** — links through an Insight (and any
   direct cross-neighborhood link) are shorter/stronger than generic links (`crossGroup` class),
   so related groups gravitate together.
6. **Unrelated groups must not occupy the space between Insight-connected groups** — the corridor
   between groups an Insight joins belongs to that relationship; keep other groups outside it.
7. **Expanded Cluster bounds act as collision envelopes** — an expanded region occupies
   `radius + safety gap`; collision uses the actual expanded bounds, never a fixed offset.
8. **Nearby Insights/Sources move away from expanded envelopes** while a cluster is expanded
   (`forceExpandedEnvelope`, registered only for the duration of the drill-down); on collapse the
   force is removed and the graph settles back — global spacing is never permanently changed.
9. **Multiple expanded clusters connected through one Insight form a readable, non-overlapping
   composition** — regions separate pairwise (pairs sharing an Insight get a wider seam so the
   Insight fits between them while staying outside every envelope), and the shared Insight is
   eased into that gap — approximately between the clusters it joins.
10. **Expanded entity labels appear only for entities in cross-cluster relationships** — those
    entities explain why two regions are joined; purely internal entities stay dot-only until
    hovered. Names are deterministic and clearly synthetic. **Labels never overlap**: after
    entity positions settle, a deterministic collision pass (useDrilldownRenderer) re-slots each
    label around its own dot (side / above / below / nudged, measured with real `getBBox()`
    boxes, `collisionPad` apart, chip-aware, cross-region aware); a label with no clear slot
    fades instead of stacking, lower placement priority first (cross-linked labels place first).
    Dots never move to solve text overlap.
11. **Expansion is explicit only** — clicking a Cluster expands exactly that Cluster
    (`expandedClusterIds`). Related clusters — via direct links, entity cross-links, or shared
    Insights — stay collapsed, fully visible and clickable (emphasized, never disabled), with
    straight lines from the expanded Entities to their collapsed node-circle; a second region
    opens only when the user clicks that cluster too. A Source's other clusters likewise stay
    visible and collapsed while one of its clusters is expanded.
    **Maximum simultaneous expanded clusters: 4** (temporary UI constraint) — the click-ordered
    list is a FIFO window, so a fifth expansion collapses the oldest and a brief snackbar says
    why. The evicted cluster stays visible and clickable.
12. **Insight connections anchor to entities, not containers** — a link between an Insight and an
    EXPANDED cluster lands on one deterministically chosen entity dot inside the region
    (`Insight → entity`), never on the big circle itself; a collapsed cluster keeps its normal
    node-level Insight link.
13. **Entity hover isolates one relationship path via ONE canonical active set**
    (`deriveHoverActiveSet`) — hovered entity + connected entities + their regions/chips + the
    Sources/Insights/collapsed clusters genuinely on the path stay prominent; everything else,
    including other expanded regions and their chips, drops to the disabled opacity. No renderer
    computes its own hover opacities; mouseleave restores the exact resting expanded state.
14. **Zoom-out is clamped near the fit-to-view scale** — Structured to the exact fit,
    Unstructured to `fit × minZoomOutFactor` — so the graph can never shrink into an unreadable
    speck; the initial fit and Reset framing are untouched (gesture-level clamp only).
15. **Node size hierarchy: Source < Cluster < Insight, at every zoom level** — Sources are always
    the smallest node kind (12 base diameter), Clusters start just above them (14) and scale with
    weight/entity count (→ 60), Insights start clearly larger (24 → 50). Each kind's minimum
    ON-SCREEN diameter is ordered the same way (12 / 14 / 24, `getEffectiveNodeRadius`), so
    zooming out clamps each kind at its own floor and can never invert the hierarchy.

## Ground it in the subject

If the brief doesn't pin down what the screen is for, pin it yourself before designing: name the one
job this screen does, who's using it (which audience or role), and what the single most important
thing on it is — then state that choice. Use anything in memory about the user's preferences or
prior work as a hint. Distinctive, appropriate choices come from the subject's own world — the
product's actual nouns and workflows — not from decoration bolted on top.

## Composition principles

**Lead with the most important thing, in the form that fits it.** A screen has one job; make the
element that serves that job the anchor, and let everything else support it. The template answer — a
big number with a small label and a gradient accent — is only right when it's genuinely the best
answer, not the default.

**Structure is information.** Structural devices — numbering, eyebrows, dividers, section labels —
should encode something *true* about the content, not decorate it. Numbered markers (01 / 02 / 03)
only make sense when the content really is a sequence (an onboarding flow, a typed timeline). Question
whether a device carries meaning before adding it.

**Motion, deliberately and sparingly.** Consider whether animation serves the subject — a reveal
that clarifies, a state change that reassures. On a high-trust surface, less motion reads as more
trustworthy; scattered effects read as AI-generated filler. One considered moment beats many. Always
honor `prefers-reduced-motion` (the `web-design-guidelines` audit enforces this).

**Match effort to the vision.** A dense screen needs precise spacing and hierarchy; a spare screen
needs precision in the few elements it has. Elegance is executing the chosen vision well within the
DS — not adding ornament.

**Copy is design material.** Placeholder copy makes a screen feel as templated as its layout. Write
it with the same care as the layout — see "Writing" below.

## Avoid the generic default

AI-generated UI clusters around a few recognizable looks (warm-cream + high-contrast serif +
terracotta; near-black + one acid accent; broadsheet hairline rules with dense columns). In this
app the *visual* language is already fixed by the DS, so this risk shows up instead as **generic
composition**: the same hero-stat-row + three-cards + CTA every screen, regardless of what the
screen is actually for. Where the layout is free, don't spend that freedom on the default
arrangement — arrange for *this* screen's job.

## Process: plan, self-critique, then build

Work in two passes, mostly in your own thinking — only show the user ideas once you're confident
they'll land.

1. **Plan the composition.** Sketch the layout concept in one or two sentences (ASCII wireframes are
   fine for comparing options), name what leads, what the supporting structure is, and the one
   element this screen is remembered by. Colors/type/components are **not** part of this plan —
   they're already decided by the DS.
2. **Critique the plan against the brief.** If any part reads like the arrangement you'd produce for
   any similar screen rather than a choice made for *this* one, revise it and say what changed and
   why. Only then build — composing DS components and tokens per vuetify-ds.

## Restraint and self-critique

Spend your boldness in one place — let one element be the memorable thing and keep everything around
it quiet and disciplined; cut any decoration that doesn't serve the screen's job. Build to a quality
floor without announcing it: responsive to mobile, visible keyboard focus, reduced motion respected
(the `web-design-guidelines` audit is how you verify these). Critique your own work as you go — take
a screenshot if the environment supports it. Chanel's rule applies: before you ship, remove one
thing.

## Writing

Words exist in a UI to make it easier to understand and use — design material, not decoration. Bring
the same intentionality to copy as to layout. (These rules are also enforced at review time by
`web-design-guidelines`' copy checks.)

- **Write from the user's side of the screen.** Name things by what people control and recognize,
  never by how the system is built ("your saved items," not "records payload"). Specific beats clever.
- **Active voice, action-consistent labels.** A control says exactly what it does — "Save draft," not
  "Submit" — and keeps that name through the whole flow (the button "Save draft" produces a toast
  "Draft saved").
- **Failure and emptiness are direction, not mood.** An error says what went wrong *and how to fix
  it*, in the interface's voice — never vague, never apologizing. An empty screen is an invitation
  to act.
- **Sentence case, conversational, no filler.** Plain verbs, tone matched to the product's audience.
  (Per vuetify-ds: never uppercase unless the user explicitly asks.) Each element does one job — a
  label labels, an example demonstrates; nothing does double duty.
